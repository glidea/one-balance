/**
 * This module provides a unified error handling mechanism for various AI providers.
 * It defines a standard error format and functions to parse provider-specific errors into this format.
 */

/**
 * Represents a standardized error response.
 */
export interface UnifiedError {
    error: true
    /** A standardized error code. */
    code:
        | 'invalid_api_key'
        | 'rate_limit_exceeded'
        | 'not_found'
        | 'permission_denied'
        | 'bad_request'
        | 'internal_server_error'
        | 'service_unavailable'
        | 'unknown_error'
    /** A human-readable error message. */
    message: string
    /** The original provider name. */
    provider: 'openai' | 'azure-openai' | 'anthropic' | 'google-ai-studio' | 'elevenlabs' | 'cartesia' | 'unknown'
    /** The original HTTP status code. */
    status: number
    /** The original, unmodified error object for debugging purposes. */
    original_error?: any
    /** Suggested cooldown period in seconds, if provided by the provider. */
    retry_after_seconds?: number
}

// --- Google AI Studio ---

interface GoogleErrorDetail {
    '@type': string
    reason?: string
    [key: string]: any
}

interface GoogleError {
    error?: {
        code?: number
        message?: string
        status?: string
        details?: GoogleErrorDetail[]
    }
}

function getGoogleErrorDetail(body: any, type: string): any | null {
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

function parseGoogleError(unifiedError: UnifiedError, status: number, body: any): void {
    const errorBody = (body as GoogleError)?.error
    if (!errorBody) {
        return
    }

    unifiedError.message = errorBody.message || unifiedError.message

    switch (status) {
        case 400: {
            const errorInfo = getGoogleErrorDetail(body, 'type.googleapis.com/google.rpc.ErrorInfo')
            if (errorInfo?.reason === 'API_KEY_INVALID') {
                unifiedError.code = 'invalid_api_key'
            } else {
                unifiedError.code = 'bad_request'
            }
            break
        }
        case 403:
            unifiedError.code = 'permission_denied'
            break
        case 404:
            unifiedError.code = 'not_found'
            break
        case 429: {
            unifiedError.code = 'rate_limit_exceeded'
            // Add more detailed message from quota failure if possible
            const quotaFailure = getGoogleErrorDetail(body, 'type.googleapis.com/google.rpc.QuotaFailure')
            if (quotaFailure?.violations?.[0]?.description) {
                unifiedError.message = quotaFailure.violations[0].description
            }

            // Extract retry delay
            const retryInfo = getGoogleErrorDetail(body, 'type.googleapis.com/google.rpc.RetryInfo')
            if (retryInfo?.retryDelay) {
                const retrySeconds = parseInt(retryInfo.retryDelay.replace('s', ''))
                if (!isNaN(retrySeconds)) {
                    unifiedError.retry_after_seconds = retrySeconds
                }
            }
            break
        }
        case 500:
            unifiedError.code = 'internal_server_error'
            break
        case 503:
            unifiedError.code = 'service_unavailable'
            break
    }
}

// --- Anthropic ---

interface AnthropicError {
    type: 'error'
    error: {
        type:
            | 'invalid_request_error'
            | 'authentication_error'
            | 'permission_error'
            | 'not_found_error'
            | 'rate_limit_error'
            | 'api_error'
            | 'overloaded_error'
        message: string
    }
}

function parseAnthropicError(unifiedError: UnifiedError, status: number, body: any): void {
    const errorBody = (body as AnthropicError)?.error
    if (!errorBody) {
        return
    }

    unifiedError.message = errorBody.message || unifiedError.message

    switch (errorBody.type) {
        case 'invalid_request_error':
            unifiedError.code = 'bad_request'
            break
        case 'authentication_error':
            unifiedError.code = 'invalid_api_key'
            break
        case 'permission_error':
            unifiedError.code = 'permission_denied'
            break
        case 'not_found_error':
            unifiedError.code = 'not_found'
            break
        case 'rate_limit_error':
            unifiedError.code = 'rate_limit_exceeded'
            break
        case 'api_error':
            unifiedError.code = 'internal_server_error'
            break
        case 'overloaded_error':
            unifiedError.code = 'service_unavailable'
            break
    }
}

// --- OpenAI & Azure OpenAI ---

interface OpenAIError {
    error: {
        message: string
        type: string
        param: string | null
        code: string | null
    }
}

function parseOpenAIError(unifiedError: UnifiedError, status: number, body: any): void {
    const errorBody = (body as OpenAIError)?.error
    if (!errorBody) {
        return
    }

    unifiedError.message = errorBody.message || unifiedError.message

    switch (status) {
        case 400:
            unifiedError.code = 'bad_request'
            break
        case 401:
            unifiedError.code = 'invalid_api_key'
            break
        case 403:
            unifiedError.code = 'permission_denied'
            break
        case 404:
            unifiedError.code = 'not_found'
            break
        case 429:
            if (errorBody.type === 'insufficient_quota') {
                unifiedError.message = 'Insufficient quota. Please check your billing details.'
            }
            unifiedError.code = 'rate_limit_exceeded'
            break
        case 500:
            unifiedError.code = 'internal_server_error'
            break
        case 503:
            unifiedError.code = 'service_unavailable'
            break
    }
}

/**
 * Parses a provider's error response into a unified format.
 *
 * @param provider The name of the provider.
 * @param response The original Response object from the fetch call.
 * @returns A promise that resolves to a UnifiedError object.
 */
export async function parseProviderError(provider: string, response: Response): Promise<UnifiedError> {
    // Default error structure
    const unifiedError: UnifiedError = {
        error: true,
        code: 'unknown_error',
        message: `An unknown error occurred with status: ${response.status}`,
        provider: provider as UnifiedError['provider'],
        status: response.status,
        original_error: await response.clone().text() // Store raw text as a fallback
    }

    try {
        const body = await response.clone().json()
        unifiedError.original_error = body

        switch (provider) {
            case 'google-ai-studio':
                parseGoogleError(unifiedError, response.status, body)
                break
            case 'anthropic':
                parseAnthropicError(unifiedError, response.status, body)
                break
            case 'openai':
            case 'azure-openai':
                parseOpenAIError(unifiedError, response.status, body)
                break
            // Add other providers here
        }
    } catch (e) {
        // Ignore JSON parsing errors if the body is not valid JSON.
    }

    return unifiedError
}
