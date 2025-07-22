import * as keyService from './service/key'
import * as util from './util'
import type * as schema from './service/d1/schema'
import { parseProviderError, UnifiedError } from './error'

const PROVIDER_CUSTOM_AUTH_HEADER: Record<string, string> = {
    'google-ai-studio': 'x-goog-api-key',
    anthropic: 'x-api-key',
    elevenlabs: 'x-api-key',
    'azure-openai': 'api-key',
    cartesia: 'X-API-Key'
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const restResource = url.pathname.substring('/api/'.length) + url.search

    const provider = restResource.split('/')[0]
    const authKey = getAuthKey(request, provider)
    if (!util.isValidAuthKey(authKey, env.AUTH_KEY)) {
        return new Response('Invalid auth key', { status: 403 })
    }

    const realProviderAndModel = await extractRealProviderAndModel(request, restResource, provider)
    if (!realProviderAndModel) {
        return new Response('Not supported request: valid provider or model not found', { status: 400 })
    }

    return await forward(request, env, ctx, restResource, realProviderAndModel.provider, realProviderAndModel.model)
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
    const activeKeys = await keyService.listActiveKeysViaCache(env, provider)
    if (activeKeys.length === 0) {
        return new Response('No active keys available', { status: 503 })
    }

    const body = request.body ? await request.arrayBuffer() : null
    const MAX_RETRIES = 10
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

        if (respFromGateway.ok) {
            return respFromGateway
        }

        // Handle errors
        const unifiedError = await parseProviderError(provider, respFromGateway)
        console.error(`Error from ${provider}: ${unifiedError.message}`, unifiedError.original_error)

        switch (unifiedError.code) {
            case 'invalid_api_key':
            case 'permission_denied':
                ctx.waitUntil(keyService.setKeyStatus(env, provider, selectedKey.id, 'blocked'))
                activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                console.error(`Key ${selectedKey.key} blocked due to: ${unifiedError.code}`)
                continue // Retry with the next key

            case 'rate_limit_exceeded': {
                // Use dynamic cooldown if provider suggests one, otherwise fallback to a default.
                const cooldownSeconds = unifiedError.retry_after_seconds ? unifiedError.retry_after_seconds + 5 : 65 // Add a 5s buffer
                ctx.waitUntil(
                    keyService.setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, cooldownSeconds)
                )
                activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                console.warn(
                    `Key ${selectedKey.key} cooling down for model ${model} for ${cooldownSeconds}s due to rate limit.`
                )
                continue // Retry with the next key
            }

            case 'service_unavailable':
            case 'internal_server_error':
                // These are potentially temporary, so we can retry with a different key.
                activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                console.warn(`Retrying due to temporary error: ${unifiedError.code}`)
                continue // Retry with the next key

            case 'bad_request':
            case 'not_found':
            case 'unknown_error':
            default:
                // These are likely non-retriable user or configuration errors.
                // Return the standardized error to the client.
                return new Response(JSON.stringify(unifiedError), {
                    status: unifiedError.status,
                    headers: { 'Content-Type': 'application/json' }
                })
        }
    }

    return new Response('Internal server error after retries', { status: 500 })
}

function getAuthKey(request: Request, provider: string): string {
    let header = PROVIDER_CUSTOM_AUTH_HEADER[provider]
    if (!header) {
        header = 'Authorization'
    }

    let apiKeyStr = request.headers.get(header)
    if (!apiKeyStr) {
        return ''
    }

    if (header === 'Authorization') {
        apiKeyStr = apiKeyStr.replace(/^Bearer\s+/, '')
    }
    return apiKeyStr
}

async function selectKey(keys: schema.Key[], model: string): Promise<schema.Key> {
    const now = Date.now() / 1000
    // Filter out keys that are currently in cooldown for the specific model
    const availableKeys = keys.filter(key => {
        const coolingEnd = key.modelCoolings?.[model]?.end_at
        return !coolingEnd || coolingEnd < now
    })

    // If there are available keys, select one randomly
    if (availableKeys.length > 0) {
        const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]
        console.info(`selected an available key ${randomKey.key} to try`)
        return randomKey
    }

    // If all keys are in cooldown, find the one that will be available soonest
    console.warn(`all keys are in cooldown for model ${model}, selecting the one with the earliest cooldown end time`)
    let bestCoolingKey: schema.Key | null = null
    let earliestCooldownEnd = Infinity

    for (const key of keys) {
        const coolingEnd = key.modelCoolings?.[model]?.end_at
        if (coolingEnd && coolingEnd < earliestCooldownEnd) {
            earliestCooldownEnd = coolingEnd
            bestCoolingKey = key
        }
    }

    if (!bestCoolingKey) {
        console.error(
            `Could not find a best cooling key, though all keys are supposed to be in cooldown. This indicates a logic issue. Falling back to a random key.`
        )
        return keys[Math.floor(Math.random() * keys.length)]
    }

    // Wait until the best key is available
    const waitTime = earliestCooldownEnd - now
    if (waitTime > 0) {
        console.info(`wait for ${waitTime}s until key ${bestCoolingKey.key} is available`)
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000))
    }

    return bestCoolingKey
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

    let header = PROVIDER_CUSTOM_AUTH_HEADER[provider]
    if (header) {
        headers.set(header, key)
    } else {
        headers.set('Authorization', `Bearer ${key}`)
    }
}
