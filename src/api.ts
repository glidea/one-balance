import * as keyService from './service/key'
import * as util from './util'
import * as openaiCompat from './service/openai-compat'
import type * as schema from './service/d1/schema'
import { perfMonitor, logPerformanceReport } from './util/performance'
import { logger } from './util/logger'
import { CONFIG } from './config/constants'
import {
    ApiError,
    ErrorCategory,
    categorizeHttpError,
    shouldUpdateKeyStatus,
    needsCooldown,
    errorAggregator
} from './util/errors'

// 错误处理优化
interface RetryContext {
    attempt: number
    provider: string
    model: string
    keyId: string
}

// 指数退避计算
function calculateBackoffDelay(attempt: number): number {
    const { INITIAL_DELAY_MS, MAX_DELAY_MS, MULTIPLIER, JITTER_FACTOR } = CONFIG.API.BACKOFF

    const exponentialDelay = INITIAL_DELAY_MS * Math.pow(MULTIPLIER, attempt)
    const jitter = exponentialDelay * JITTER_FACTOR * (Math.random() - 0.5)
    const delay = Math.min(exponentialDelay + jitter, MAX_DELAY_MS)

    return Math.max(delay, 0)
}

// 改进的错误处理和分类
function createApiErrorFromResponse(response: Response, provider: string, context: any = {}): ApiError {
    const status = response.status
    const category = categorizeHttpError(status, provider)

    const errorContext = {
        statusCode: status,
        provider,
        ...context
    }

    switch (category) {
        case ErrorCategory.AUTHENTICATION:
            return ApiError.authentication(`Authentication failed with ${provider}`, errorContext)
        case ErrorCategory.RATE_LIMIT:
            return ApiError.rateLimit(`Rate limit exceeded for ${provider}`, errorContext)
        case ErrorCategory.SERVER:
            return ApiError.server(`Server error from ${provider}`, errorContext, status)
        default:
            return ApiError.client(`Request failed with status ${status}`, errorContext)
    }
}

// 统一的错误处理
function shouldRetryError(status: number, provider: string): { shouldRetry: boolean; isTransient: boolean } {
    const category = categorizeHttpError(status, provider)

    switch (category) {
        case ErrorCategory.AUTHENTICATION:
        case ErrorCategory.VALIDATION:
            return { shouldRetry: true, isTransient: false } // 需要更换密钥或检查请求
        case ErrorCategory.RATE_LIMIT:
        case ErrorCategory.NETWORK:
        case ErrorCategory.SERVER:
            return { shouldRetry: true, isTransient: true } // 可以直接重试
        default:
            return { shouldRetry: false, isTransient: false }
    }
}

// 延迟函数
function delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, ms))
}

const PROVIDER_CUSTOM_AUTH_HEADER: Record<string, string> = {
    'google-ai-studio': 'x-goog-api-key',
    anthropic: 'x-api-key',
    elevenlabs: 'x-api-key',
    'azure-openai': 'api-key',
    cartesia: 'X-API-Key'
}

function getAuthHeaderName(provider: string): string {
    return PROVIDER_CUSTOM_AUTH_HEADER[provider] || 'Authorization'
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const key = perfMonitor.start('api.handle')
    try {
        const url = new URL(request.url)
        const restResource = url.pathname.substring('/api/'.length) + url.search

        // 处理健康检查请求
        if (restResource === 'health' || restResource === 'health/') {
            const healthData = await generateHealthCheck(env)
            return new Response(JSON.stringify(healthData, null, 2), {
                status: healthData.healthy ? 200 : 503,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // 处理错误统计请求
        if (restResource === 'errors' || restResource === 'errors/') {
            const authKey = getAuthKeyFromHeader(request, 'openai-compat')
            if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, 'google-ai-studio', 'gemini-2.0-flash')) {
                return new Response('Invalid auth key', { status: 403 })
            }
            const errorStats = errorAggregator.getErrorStats()
            return new Response(JSON.stringify({ errors: errorStats }, null, 2), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        const provider = restResource.split('/')[0]
        const authKey = getAuthKey(request, provider)

        // 处理 OpenAI 兼容格式
        if (openaiCompat.isOpenAICompatRequest(restResource)) {
            return await handleOpenAICompat(request, env, ctx)
        }

        // 处理 OpenAI 兼容的模型列表请求
        if (openaiCompat.isModelsRequest(restResource)) {
            return await handleModelsRequest(request, env, ctx)
        }

        const realProviderAndModel = await extractRealProviderAndModel(request, restResource, provider)
        if (!realProviderAndModel) {
            return new Response('Not supported request: valid provider or model not found', { status: 400 })
        }

        if (
            !util.isApiRequestAllowed(authKey, env.AUTH_KEY, realProviderAndModel.provider, realProviderAndModel.model)
        ) {
            return new Response('Invalid auth key', { status: 403 })
        }

        return await forward(request, env, ctx, restResource, realProviderAndModel.provider, realProviderAndModel.model)
    } finally {
        perfMonitor.end(key, 'api.handle')
    }
}

async function extractRealProviderAndModel(
    request: Request,
    restResource: string,
    provider: string
): Promise<{ provider: string; model: string } | null> {
    const model = await extractModel(request, restResource)
    if (!model) {
        return null
    }
    if (provider !== 'compat') {
        return { provider, model }
    }

    // find the real provider from model (e.g. google-ai-studio/gemini-2.0-flash)
    // see https://developers.cloudflare.com/ai-gateway/chat-completion/#curl
    const realProvider = model.split('/')[0]
    if (!realProvider) {
        // bad request
        return null
    }
    const realModel = model.split('/')[1]
    if (!realModel) {
        // bad request
        return null
    }

    return { provider: realProvider, model: realModel }
}

async function extractModel(request: Request, restResource: string): Promise<string | null> {
    if (request.method === 'POST' && request.body) {
        const model = await extractModelFromBody(request)
        if (model) return model
    }

    return extractModelFromPath(restResource)
}

async function extractModelFromBody(request: Request): Promise<string | null> {
    try {
        const body = (await request.clone().json()) as { model: string }
        return body.model || null
    } catch {
        return null
    }
}

function extractModelFromPath(restResource: string): string | null {
    const parts = restResource.split('/models/')
    if (parts.length > 1) {
        return parts[1].split(':')[0]
    }

    return null
}

async function forward(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    restResource: string,
    provider: string,
    model: string
): Promise<Response> {
    const key = perfMonitor.start('api.forward')
    try {
        const activeKeys = await keyService.listActiveKeysViaCache(env, provider)
        if (activeKeys.length === 0) {
            return new Response('No active keys available', { status: 503 })
        }

        const body = request.body ? await request.arrayBuffer() : null
        const MAX_RETRIES = CONFIG.API.MAX_RETRIES
        let lastTransientError: Response | null = null

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (activeKeys.length === 0) {
                return new Response('No active keys available', { status: 503 })
            }

            const selectedKey = await selectKey(activeKeys, model)
            const retryContext: RetryContext = {
                attempt,
                provider,
                model,
                keyId: selectedKey.id
            }

            try {
                const reqToGateway = await makeGatewayRequest(
                    request.method,
                    request.headers,
                    body,
                    env,
                    restResource,
                    selectedKey.key
                )
                const respFromGateway = await fetch(reqToGateway)
                const status = respFromGateway.status

                // 成功处理
                if (status >= 200 && status < 300) {
                    consecutive429Counter.resetCount(selectedKey.id)
                    return respFromGateway
                }

                // 创建结构化错误
                const apiError = createApiErrorFromResponse(respFromGateway, provider, {
                    keyId: selectedKey.id,
                    model,
                    attempt
                })

                // 记录错误统计
                errorAggregator.recordError(apiError)

                const { shouldRetry, isTransient } = shouldRetryError(status, provider)

                if (!shouldRetry) {
                    // 不可重试的错误
                    logger.error('Non-retryable error occurred', apiError.toLogFormat())
                    return respFromGateway
                }

                // 处理具体的错误类型
                switch (status) {
                    case 400:
                        if (!(await keyIsInvalid(respFromGateway, provider))) {
                            return respFromGateway // 用户错误
                        }
                    // 密钥无效，继续处理

                    case 401:
                    case 403:
                        ctx.waitUntil(keyService.setKeyStatus(env, provider, selectedKey.id, 'blocked'))
                        logger.logKeyStatusChange(selectedKey.id, 'blocked', `HTTP ${status}`)
                        if (activeKeys.length < 500) {
                            activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                        }
                        continue // 立即重试下一个密钥

                    case 429:
                        const cooldownSec = await analyze429CooldownSeconds(
                            env,
                            respFromGateway,
                            provider,
                            selectedKey.key
                        )
                        ctx.waitUntil(
                            keyService.setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, cooldownSec)
                        )
                        logger.info(`Key cooling down for model`, {
                            keyId: selectedKey.id,
                            model,
                            reason: 'Rate limit (429)'
                        })
                        if (activeKeys.length < 500) {
                            activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                        }

                        // 保存临时错误用于最后返回
                        if (isTransient) {
                            lastTransientError = respFromGateway.clone()
                        }
                        break

                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        logger.logRequestError(status, provider, model)
                        if (isTransient) {
                            lastTransientError = respFromGateway.clone()
                            // 为临时错误添加退避
                            const backoffMs = calculateBackoffDelay(attempt)
                            if (backoffMs > 0) {
                                await delay(backoffMs)
                            }
                        }
                        break
                }
            } catch (networkError) {
                // 创建网络错误
                const apiError = ApiError.network('Network request failed', {
                    provider,
                    model,
                    keyId: selectedKey.id,
                    attempt,
                    originalError: networkError instanceof Error ? networkError : new Error(String(networkError))
                })

                errorAggregator.recordError(apiError)
                logger.error('Network error during request', apiError.toLogFormat())

                // 网络错误需要退避
                const backoffMs = calculateBackoffDelay(attempt)
                if (backoffMs > 0) {
                    await delay(backoffMs)
                }
                continue
            }
        }

        // 所有重试都失败了
        if (lastTransientError) {
            return lastTransientError
        }

        return new Response('Internal server error after retries', { status: 500 })

        // 此代码已被上面的重构替代
    } finally {
        perfMonitor.end(key, 'api.forward')
    }
}

function getAuthKey(request: Request, provider: string): string {
    if (provider === 'google-ai-studio') {
        // try to get auth key from query params
        const key = new URL(request.url).searchParams.get('key')
        if (key) {
            return key
        }
    }

    return getAuthKeyFromHeader(request, provider)
}

function getAuthKeyFromHeader(request: Request, provider: string): string {
    const h = getAuthHeaderName(provider)
    let v = request.headers.get(h)
    if (!v) {
        return ''
    }

    let key = v
    if (h === 'Authorization') {
        key = v.replace(/^Bearer\s+/, '')
    }

    return key
}

async function selectKey(keys: schema.Key[], model: string): Promise<schema.Key> {
    let selectedKey = tryRandomSelect(keys, model) // fast path
    if (selectedKey) {
        return selectedKey
    }

    return selectFromAllKeys(keys, model)
}

function tryRandomSelect(keys: schema.Key[], model: string): schema.Key | null {
    const now = Date.now() / 1000
    const maxAttempts = 10

    for (let i = 0; i < maxAttempts; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)]
        const coolingEnd = randomKey.modelCoolings?.[model]?.end_at

        if (!coolingEnd || coolingEnd < now) {
            logger.debug(`Selected key for model`, { keyId: randomKey.id, model, attempts: i + 1 })
            return randomKey
        }
    }

    return null
}

function selectFromAllKeys(keys: schema.Key[], model: string): schema.Key {
    const now = Date.now() / 1000
    const availableKeys = []
    let bestCoolingKey: schema.Key | null = null
    let earliestCooldownEnd = Infinity

    for (const key of keys) {
        const coolingEnd = key.modelCoolings?.[model]?.end_at
        if (!coolingEnd || coolingEnd < now) {
            availableKeys.push(key)
        } else if (coolingEnd < earliestCooldownEnd) {
            earliestCooldownEnd = coolingEnd
            bestCoolingKey = key
        }
    }

    if (availableKeys.length > 0) {
        const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]
        logger.debug(`Selected available key after scan`, { keyId: selectedKey.id, model })
        return selectedKey
    }

    logger.warn(`Using cooling key as fallback`, { keyId: bestCoolingKey?.id, model })
    return bestCoolingKey! // may be available actually
}

async function makeGatewayRequest(
    method: string,
    headers: Headers,
    body: ArrayBuffer | null,
    env: Env,
    restResource: string,
    key: string
): Promise<Request> {
    const newHeaders = new Headers(headers)
    setAuthHeader(newHeaders, restResource, key)

    // TODO: may use url from env directly for low latency.
    let base = await env.AI.gateway(env.AI_GATEWAY).getUrl()
    if (!base.endsWith('/')) {
        base += '/'
    }
    const url = `${base}${restResource}`

    return new Request(url, {
        method: method,
        headers: newHeaders,
        body: body,
        redirect: 'follow'
    })
}

function setAuthHeader(headers: Headers, restResource: string, key: string) {
    const provider = restResource.split('/')[0]

    let v = key
    const h = getAuthHeaderName(provider)
    if (h == 'Authorization') {
        v = `Bearer ${key}`
    }

    headers.set(h, v)
}

async function keyIsInvalid(respFromGateway: Response, provider: string): Promise<boolean> {
    if (provider !== 'google-ai-studio') {
        return false // TODO: support other providers
    }

    if (respFromGateway.status !== 400) {
        return false
    }

    try {
        const body = await respFromGateway.clone().json()
        const detail = getGoogleAiStudioErrorDetail(body, 'type.googleapis.com/google.rpc.ErrorInfo')
        return detail?.reason === 'API_KEY_INVALID' // may already deleted.
    } catch {
        return false
    }
}

// Using an in-memory Map to count consecutive 429s is a design choice to prioritize performance and minimize costs.
// - Why not use D1 (DB)? To avoid database writes on every 429 error, which would increase load and latency. We only write to the DB when a key needs to be cooled down.
// - Why not use KV? The free tier has low write quotas. Also, KV's eventual consistency makes it unsuitable for precise, real-time counting.
// - Using regular Map with manual cleanup to prevent memory leaks (compatible with Cloudflare Workers)
// Limitation: This counter is local to each worker instance and not shared globally. If requests for the same key are routed to different instances, the count may be inaccurate.
// However, for short-lived consecutive requests, Cloudflare often routes them to the same instance, making this a practical trade-off.

interface ConsecutiveCountEntry {
    count: number
    timestamp: number
    // 添加锁机制防止并发问题
    lastUpdateTime: number
}

// 使用类来封装计数器，提供更好的并发安全性
class Consecutive429Counter {
    private counters = new Map<string, ConsecutiveCountEntry>()
    private lastCleanupTime = 0
    private readonly cleanupIntervalMs = CONFIG.MEMORY.CONSECUTIVE_429_MAP.CLEANUP_INTERVAL_MS
    private readonly maxAgeMs = CONFIG.MEMORY.CONSECUTIVE_429_MAP.MAX_AGE_MS
    private readonly maxEntries = CONFIG.MEMORY.CONSECUTIVE_429_MAP.MAX_ENTRIES

    // 原子性增加计数
    incrementCount(key: string): number {
        const now = Date.now()
        this.periodicCleanup()

        const existing = this.counters.get(key)
        const newCount = (existing?.count || 0) + 1

        // 原子性更新
        this.counters.set(key, {
            count: newCount,
            timestamp: now,
            lastUpdateTime: now
        })

        return newCount
    }

    // 重置计数
    resetCount(key: string): void {
        this.counters.delete(key)
    }

    // 获取当前计数（不增加）
    getCount(key: string): number {
        const entry = this.counters.get(key)
        if (!entry) return 0

        // 检查是否过期
        if (Date.now() - entry.timestamp > this.maxAgeMs) {
            this.counters.delete(key)
            return 0
        }

        return entry.count
    }

    // 周期性清理
    private periodicCleanup(): void {
        const now = Date.now()

        // 限制清理频率
        if (now - this.lastCleanupTime < this.cleanupIntervalMs) {
            return
        }

        this.lastCleanupTime = now
        this.cleanup()
    }

    // 强制清理
    forceCleanup(): void {
        this.cleanup()
    }

    private cleanup(): void {
        const now = Date.now()

        // 清理过期记录
        for (const [key, entry] of this.counters.entries()) {
            if (now - entry.timestamp > this.maxAgeMs) {
                this.counters.delete(key)
            }
        }

        // 如果条目过多，删除最旧的20%
        if (this.counters.size > this.maxEntries) {
            const entries = Array.from(this.counters.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)

            const toRemove = Math.floor(this.counters.size * 0.2)
            for (let i = 0; i < toRemove && i < entries.length; i++) {
                this.counters.delete(entries[i][0])
            }
        }
    }

    // 获取统计信息
    getStats(): { totalEntries: number; oldestEntry: number; newestEntry: number } {
        const now = Date.now()
        let oldestEntry = now
        let newestEntry = 0

        for (const entry of this.counters.values()) {
            if (entry.timestamp < oldestEntry) oldestEntry = entry.timestamp
            if (entry.timestamp > newestEntry) newestEntry = entry.timestamp
        }

        return {
            totalEntries: this.counters.size,
            oldestEntry: oldestEntry === now ? 0 : now - oldestEntry,
            newestEntry: newestEntry === 0 ? 0 : now - newestEntry
        }
    }
}

// 全局实例
const consecutive429Counter = new Consecutive429Counter()

// 健康检查功能
async function generateHealthCheck(env: Env): Promise<{
    healthy: boolean
    timestamp: number
    version: string
    services: {
        database: { healthy: boolean; responseTime?: number }
        memory: { healthy: boolean; usage: any }
        errors: { healthy: boolean; recentErrors: number }
    }
    uptime: number
}> {
    const startTime = Date.now()

    // 检查数据库连通性
    let dbHealth = { healthy: false, responseTime: 0 }
    try {
        const dbStart = Date.now()
        await keyService.listActiveKeysViaCache(env, 'google-ai-studio')
        dbHealth = {
            healthy: true,
            responseTime: Date.now() - dbStart
        }
    } catch (error) {
        logger.error('Database health check failed', { error: error.message })
    }

    // 检查内存状态
    const memoryStats = perfMonitor.getMemoryStats()
    const consecutive429Stats = consecutive429Counter.getStats()

    // 检查错误率
    const recentErrors = errorAggregator.getErrorStats().reduce((sum, stat) => sum + stat.count, 0)

    const services = {
        database: dbHealth,
        memory: {
            healthy: memoryStats.isHealthy,
            usage: {
                performanceEntries: memoryStats.entriesCount,
                performanceStartTimes: memoryStats.startTimesCount,
                consecutive429Entries: consecutive429Stats.totalEntries
            }
        },
        errors: {
            healthy: recentErrors < 50, // 阈值可调整
            recentErrors
        }
    }

    const allHealthy = Object.values(services).every(service => service.healthy)

    return {
        healthy: allHealthy,
        timestamp: Date.now(),
        version: '1.0.0', // 可以从环境变量读取
        services,
        uptime: Date.now() - startTime
    }
}

async function analyze429CooldownSeconds(
    env: Env,
    respFromGateway: Response,
    provider: string,
    key: string
): Promise<number> {
    // 使用新的线程安全计数器
    const consecutiveCount = consecutive429Counter.incrementCount(key)
    const threshold = Number(env.CONSECUTIVE_429_THRESHOLD) || 2

    if (consecutiveCount >= threshold) {
        consecutive429Counter.resetCount(key)
        logger.warn(`Key triggered extended cooldown`, {
            keyId: key.substring(0, 8) + '***',
            consecutiveCount,
            threshold,
            provider
        })
        return provider === 'google-ai-studio' ? util.getSecondsUntilMidnightPT() : 24 * 60 * 60
    }

    if (provider !== 'google-ai-studio') {
        return CONFIG.API.DEFAULT_COOLDOWN_SECONDS
    }

    try {
        const errorBody = await respFromGateway.clone().json()

        // 检查配额失败类型
        const quotaFailureDetail = getGoogleAiStudioErrorDetail(
            errorBody,
            'type.googleapis.com/google.rpc.QuotaFailure'
        )
        if (quotaFailureDetail) {
            const violations = Array.isArray(quotaFailureDetail.violations) ? quotaFailureDetail.violations : []

            for (const violation of violations) {
                if (
                    violation &&
                    typeof violation === 'object' &&
                    violation.quotaId === 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
                ) {
                    return util.getSecondsUntilMidnightPT()
                }
            }
        }

        // 检查重试信息
        const retryInfoDetail = getGoogleAiStudioErrorDetail(errorBody, 'type.googleapis.com/google.rpc.RetryInfo')
        if (retryInfoDetail?.retryDelay && typeof retryInfoDetail.retryDelay === 'string') {
            const retryDelayMatch = retryInfoDetail.retryDelay.match(/^(\d+)s?$/)
            if (retryDelayMatch) {
                const retrySeconds = parseInt(retryDelayMatch[1], 10)
                if (!isNaN(retrySeconds) && retrySeconds > 0 && retrySeconds <= 3600) {
                    return Math.min(retrySeconds + 2, 3602) // 最多1小时加缓冲
                }
            }
        }
    } catch (error) {
        logger.error('Failed to parse 429 response, using fallback cooldown', {
            provider,
            fallbackSeconds: CONFIG.API.DEFAULT_COOLDOWN_SECONDS,
            error: error instanceof Error ? error.message : 'Unknown error'
        })
    }

    return CONFIG.API.DEFAULT_COOLDOWN_SECONDS
}

function getGoogleAiStudioErrorDetail(body: any, type: string): any | null {
    try {
        // 防御性处理：确保 body 是有效的对象
        if (!body || typeof body !== 'object') {
            return null
        }

        let errorBody = body
        if (Array.isArray(body) && body.length > 0) {
            errorBody = body[0]
        }

        // 多层级容错：支持不同的错误结构
        const details = errorBody?.error?.details || errorBody?.details || []

        if (!Array.isArray(details)) {
            return null
        }

        for (const detail of details) {
            // 防止访问不存在的属性
            if (detail && typeof detail === 'object' && detail['@type'] === type) {
                return detail
            }
        }

        return null
    } catch (error) {
        // 记录解析失败但不影响主流程
        logger.debug('Failed to parse Google AI Studio error detail', {
            type,
            error: error.message
        })
        return null
    }
}

async function handleOpenAICompat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const key = perfMonitor.start('api.handleOpenAICompat')
    try {
        // 转换 OpenAI 格式到 Gemini 格式
        const { transformedBody, restResource, originalStream, realModel } =
            await openaiCompat.transformOpenAIToGeminiRequest(request)

        // 检查认证 - OpenAI 兼容格式总是使用 Authorization 头
        const authKey = getAuthKeyFromHeader(request, 'openai-compat')
        if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, 'google-ai-studio', realModel)) {
            return new Response(
                JSON.stringify({
                    error: {
                        message: 'Invalid auth key',
                        type: 'authentication_error',
                        code: 'invalid_api_key'
                    }
                }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // 获取 Google AI Studio 的活跃密钥
        const activeKeys = await keyService.listActiveKeysViaCache(env, 'google-ai-studio')
        if (activeKeys.length === 0) {
            return new Response(
                JSON.stringify({
                    error: {
                        message: 'No active keys available for google-ai-studio',
                        type: 'api_error',
                        code: 'no_active_keys'
                    }
                }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const MAX_RETRIES = CONFIG.API.OPENAI_MAX_RETRIES
        for (let i = 0; i < MAX_RETRIES; i++) {
            if (activeKeys.length === 0) {
                break
            }

            const selectedKey = await selectKey(activeKeys, realModel)

            // 使用现有的 makeGatewayRequest 函数
            const reqToGateway = await makeGatewayRequest(
                'POST',
                new Headers({ 'Content-Type': 'application/json' }),
                new TextEncoder().encode(transformedBody),
                env,
                restResource,
                selectedKey.key
            )

            const geminiResponse = await fetch(reqToGateway)
            const status = geminiResponse.status

            switch (status) {
                case 400:
                    if (!(await keyIsInvalid(geminiResponse, 'google-ai-studio'))) {
                        // 用户错误，直接返回转换后的响应
                        return await openaiCompat.transformGeminiToOpenAIResponse(
                            geminiResponse,
                            originalStream,
                            realModel
                        )
                    }

                case 401:
                case 403:
                    ctx.waitUntil(keyService.setKeyStatus(env, 'google-ai-studio', selectedKey.id, 'blocked'))
                    logger.logKeyStatusChange(selectedKey.id, 'blocked', `HTTP ${status}`)
                    if (activeKeys.length < 500) {
                        activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                    }
                    continue

                case 429:
                    const sec = await analyze429CooldownSeconds(
                        env,
                        geminiResponse,
                        'google-ai-studio',
                        selectedKey.key
                    )
                    ctx.waitUntil(
                        keyService.setKeyModelCooldownIfAvailable(
                            env,
                            selectedKey.id,
                            'google-ai-studio',
                            realModel,
                            sec
                        )
                    )
                    logger.info(`Key cooling down for model`, {
                        keyId: selectedKey.id,
                        model: realModel,
                        reason: 'Rate limit (429)'
                    })
                    if (activeKeys.length < 500) {
                        activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                    }
                    continue

                case 500:
                case 502:
                case 503:
                case 504:
                    logger.logRequestError(status, 'google-ai-studio', realModel)
                    continue
            }

            if (status / 100 === 2) {
                consecutive429Counter.resetCount(selectedKey.id)
                // 成功响应，转换为 OpenAI 格式
                return await openaiCompat.transformGeminiToOpenAIResponse(geminiResponse, originalStream, realModel)
            } else {
                logger.logRequestError(status, 'google-ai-studio', realModel)
            }

            return await openaiCompat.transformGeminiToOpenAIResponse(geminiResponse, originalStream, realModel)
        }

        return new Response(
            JSON.stringify({
                error: {
                    message: 'Internal server error after retries',
                    type: 'api_error',
                    code: 'max_retries_exceeded'
                }
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        logger.error('OpenAI compatibility handler failed', { error: error.message })
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Failed to process OpenAI compatible request',
                    type: 'api_error',
                    code: 'processing_error'
                }
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    } finally {
        perfMonitor.end(key, 'api.handleOpenAICompat')
    }
}

async function handleModelsRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 检查认证 - OpenAI 兼容格式总是使用 Authorization 头
    const authKey = getAuthKeyFromHeader(request, 'openai-compat')
    if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, 'google-ai-studio', 'gemini-2.0-flash')) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Invalid auth key',
                    type: 'authentication_error',
                    code: 'invalid_api_key'
                }
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // 获取Google AI Studio的活跃密钥
    const activeKeys = await keyService.listActiveKeysViaCache(env, 'google-ai-studio')
    if (activeKeys.length === 0) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'No active keys available for google-ai-studio',
                    type: 'api_error',
                    code: 'no_active_keys'
                }
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // 随机选择一个API密钥来获取模型列表
    const randomKey = activeKeys[Math.floor(Math.random() * activeKeys.length)]

    try {
        return await openaiCompat.handleModelsRequest(randomKey.key)
    } catch (error) {
        logger.error('Models request handler failed', { error: error.message })
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Failed to fetch models',
                    type: 'api_error',
                    code: 'processing_error'
                }
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
