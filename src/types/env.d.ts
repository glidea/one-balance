// Cloudflare Workers Environment Types

interface Env {
    // Bindings
    DB: D1Database
    AI: Ai

    // Environment Variables
    AI_GATEWAY: string
    CONSECUTIVE_429_THRESHOLD: string

    // Secrets (not in vars, set via wrangler secret)
    AUTH_KEY: string
}

// API Response Types
interface ApiResponse<T = unknown> {
    success: boolean
    data?: T
    error?: {
        code: string
        message: string
        details?: unknown
    }
}

// HTTP Status Types
type HttpStatus = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503 | 504

// Retry Strategy Types
interface RetryConfig {
    maxAttempts: number
    backoffStrategy: 'exponential' | 'linear' | 'fixed'
    initialDelay: number
    maxDelay: number
    jitterFactor?: number
}

// Key Management Types
type KeyStatus = 'active' | 'blocked' | 'cooldown'
type ProviderName = 'google-ai-studio' | 'openai' | 'anthropic' | 'elevenlabs' | 'azure-openai' | 'cartesia'

interface KeyMetrics {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    totalCooldownTime: number
    averageResponseTime: number
    lastUsed: number
}

// Global declarations
declare global {
    // Make Env available globally in Worker context
    interface CloudflareEnv extends Env {}
}

export { Env }
