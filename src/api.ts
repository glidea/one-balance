import * as keyService from './service/key'
import type * as schema from './service/d1/schema'

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
    if (!authKey || authKey !== env.AUTH_KEY) {
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
) {
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
                activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                continue

            // try cooling down
            case 429:
                const sec = await analyze429CooldownSeconds(respFromGateway, provider)
                ctx.waitUntil(keyService.setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, sec))

                // next key
                console.warn(
                    `key ${selectedKey.key} is cooling down for model ${model} due to 429 ${await respFromGateway.text()}`
                )
                activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                continue
        }

        // 200 or user, gateway, provider error
        if (status / 100 !== 2) {
            console.error(`gateway returned ${status}`)
        }
        return respFromGateway
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
    const maxAttempts = 10
    let bestCoolingKey: schema.Key | null = null
    let earliestCooldownEnd = Infinity

    for (let i = 0; i < maxAttempts; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)]
        const coolingEnd = randomKey.modelCoolings?.[model]?.end_at

        if (!coolingEnd || coolingEnd < now) {
            console.info(`selected a key ${randomKey.key} to try; count: ${i + 1}`)
            return randomKey
        }

        if (coolingEnd < earliestCooldownEnd) {
            earliestCooldownEnd = coolingEnd
            bestCoolingKey = randomKey
        }
    }

    console.warn(`selected a cooling key ${bestCoolingKey?.key} to try`)
    return bestCoolingKey!
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

async function analyze429CooldownSeconds(respFromGateway: Response, provider: string): Promise<number> {
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
                    return 24 * 60 * 60
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
