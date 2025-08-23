import * as keyService from './service/key'
import * as util from './util'
import * as openaiCompat from './service/openai-compat'
import type * as schema from './service/d1/schema'
import { perfMonitor, logPerformanceReport } from './util/performance'

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

        // 处理性能报告请求
        if (restResource === 'perf' || restResource === 'perf/') {
            const authKey = getAuthKeyFromHeader(request, 'openai-compat')
            // 使用 google-ai-studio 提供商进行认证，因为这是一个通用的提供商
            if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, 'google-ai-studio', 'gemini-2.0-flash')) {
                return new Response('Invalid auth key', { status: 403 })
            }
            const report = perfMonitor.getReport()
            return new Response(report, {
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
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
        const MAX_RETRIES = 30
        for (let i = 0; i < MAX_RETRIES; i++) {
            if (activeKeys.length === 0) {
                return new Response('No active keys available', { status: 503 })
            }

            const selectedKey = await selectKey(activeKeys, model)
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
            switch (status) {
                // try block
                case 400:
                    if (!(await keyIsInvalid(respFromGateway, provider))) {
                        return respFromGateway // user error
                    }

                // key is invalid, then continue to block and next key
                case 401:
                case 403:
                    ctx.waitUntil(keyService.setKeyStatus(env, provider, selectedKey.id, 'blocked'))

                    // next key
                    console.error(
                        `key ${selectedKey.key} is blocked due to ${respFromGateway.status} ${await respFromGateway.text()}`
                    )
                    if (activeKeys.length < 500) {
                        // save the CPU time for Cloudflare Free plan
                        activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                    }
                    continue

                // try cooling down
                case 429:
                    const sec = await analyze429CooldownSeconds(env, respFromGateway, provider, selectedKey.key)
                    ctx.waitUntil(keyService.setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, sec))

                    // next key
                    console.warn(
                        `key ${selectedKey.key} is cooling down for model ${model} due to 429 ${await respFromGateway.text()}`
                    )
                    if (activeKeys.length < 500) {
                        activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                    }
                    continue

                case 500:
                case 502:
                case 503:
                case 504:
                    console.error(`gateway returned 5xx ${await respFromGateway.text()}`)
                    continue // no backoff, just retry...
            }

            if (status / 100 === 2) {
                consecutive429Count.delete(selectedKey.id)
            } else {
                console.error(`gateway returned ${status}`)
            }
            return respFromGateway
        }

        return new Response('Internal server error after retries', { status: 500 })
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
            console.info(`selected a key ${randomKey.key} to try; count: ${i + 1}`)
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
        console.info(`selected available key ${selectedKey.key} after full scan`)
        return selectedKey
    }

    console.warn(`selected a cooling key ${bestCoolingKey?.key} to try`)
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
// Limitation: This counter is local to each worker instance and not shared globally. If requests for the same key are routed to different instances, the count may be inaccurate.
// However, for short-lived consecutive requests, Cloudflare often routes them to the same instance, making this a practical trade-off.
let consecutive429Count: Map<string, number> = new Map()

async function analyze429CooldownSeconds(
    env: Env,
    respFromGateway: Response,
    provider: string,
    key: string
): Promise<number> {
    const count = (consecutive429Count.get(key) || 0) + 1
    consecutive429Count.set(key, count)

    if (count >= Number(env.CONSECUTIVE_429_THRESHOLD)) {
        consecutive429Count.delete(key)
        console.error(`key ${key} triggered long cooldown after ${env.CONSECUTIVE_429_THRESHOLD} consecutive 429s`)
        return provider === 'google-ai-studio' ? util.getSecondsUntilMidnightPT() : 24 * 60 * 60
    }

    if (provider !== 'google-ai-studio') {
        return 65
    }

    try {
        const errorBody = await respFromGateway.clone().json()
        const quotaFailureDetail = getGoogleAiStudioErrorDetail(
            errorBody,
            'type.googleapis.com/google.rpc.QuotaFailure'
        )
        if (quotaFailureDetail) {
            const violations = quotaFailureDetail.violations || []
            for (const violation of violations) {
                if (violation.quotaId === 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') {
                    return util.getSecondsUntilMidnightPT() // Requests per day (RPD) quotas reset at midnight Pacific time
                }
            }
        }

        const retryInfoDetail = getGoogleAiStudioErrorDetail(errorBody, 'type.googleapis.com/google.rpc.RetryInfo')
        if (retryInfoDetail && retryInfoDetail.retryDelay) {
            const retrySeconds = parseInt(retryInfoDetail.retryDelay.replace('s', ''))
            return retrySeconds + 2 // 2 seconds buffer
        }
    } catch (error) {
        console.error('failed to parse 429 response, fallback to 65 seconds', error)
    }

    return 65
}

function getGoogleAiStudioErrorDetail(body: any, type: string): any | null {
    let errorBody = body
    if (Array.isArray(body) && body.length > 0) {
        errorBody = body[0]
    }

    const details = errorBody.error?.details || []
    for (const detail of details) {
        if (detail['@type'] === type) {
            return detail
        }
    }

    return null
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

        const MAX_RETRIES = 10
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
                    console.error(`key ${selectedKey.key} is blocked due to ${status}`)
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
                    console.warn(`key ${selectedKey.key} is cooling down for model ${realModel} due to 429`)
                    if (activeKeys.length < 500) {
                        activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                    }
                    continue

                case 500:
                case 502:
                case 503:
                case 504:
                    console.error(`gateway returned 5xx ${await geminiResponse.text()}`)
                    continue
            }

            if (status / 100 === 2) {
                consecutive429Count.delete(selectedKey.id)
                // 成功响应，转换为 OpenAI 格式
                return await openaiCompat.transformGeminiToOpenAIResponse(geminiResponse, originalStream, realModel)
            } else {
                console.error(`gateway returned ${status}`)
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
        console.error('Error in handleOpenAICompat:', error)
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
        console.error('Error in handleModelsRequest:', error)
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
