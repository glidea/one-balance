// 统一错误处理和分类系统

export enum ErrorCategory {
    AUTHENTICATION = 'authentication',
    RATE_LIMIT = 'rate_limit',
    NETWORK = 'network',
    SERVER = 'server',
    CLIENT = 'client',
    VALIDATION = 'validation',
    TIMEOUT = 'timeout'
}

export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export interface ErrorContext {
    provider?: string
    model?: string
    keyId?: string
    attempt?: number
    originalError?: Error
    statusCode?: number
    requestId?: string
    timestamp?: number
}

export class ApiError extends Error {
    public readonly category: ErrorCategory
    public readonly severity: ErrorSeverity
    public readonly context: ErrorContext
    public readonly isRetryable: boolean
    public readonly httpStatus: number

    constructor(
        message: string,
        category: ErrorCategory,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        context: ErrorContext = {},
        isRetryable = false,
        httpStatus = 500
    ) {
        super(message)
        this.name = 'ApiError'
        this.category = category
        this.severity = severity
        this.context = { ...context, timestamp: context.timestamp || Date.now() }
        this.isRetryable = isRetryable
        this.httpStatus = httpStatus

        // 维护堆栈跟踪
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApiError)
        }
    }

    // 创建常见错误类型的静态工厂方法
    static authentication(message: string, context: ErrorContext = {}): ApiError {
        return new ApiError(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, context, false, 403)
    }

    static rateLimit(message: string, context: ErrorContext = {}): ApiError {
        return new ApiError(message, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, context, true, 429)
    }

    static network(message: string, context: ErrorContext = {}): ApiError {
        return new ApiError(message, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, context, true, 503)
    }

    static server(message: string, context: ErrorContext = {}, httpStatus = 500): ApiError {
        return new ApiError(message, ErrorCategory.SERVER, ErrorSeverity.HIGH, context, true, httpStatus)
    }

    static client(message: string, context: ErrorContext = {}): ApiError {
        return new ApiError(message, ErrorCategory.CLIENT, ErrorSeverity.LOW, context, false, 400)
    }

    static validation(message: string, context: ErrorContext = {}): ApiError {
        return new ApiError(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, context, false, 400)
    }

    // 转换为安全的日志格式
    toLogFormat(): object {
        return {
            error: this.message,
            category: this.category,
            severity: this.severity,
            httpStatus: this.httpStatus,
            isRetryable: this.isRetryable,
            context: {
                ...this.context,
                // 屏蔽敏感信息
                keyId: this.context.keyId ? `${this.context.keyId.substring(0, 8)}***` : undefined
            }
        }
    }

    // 转换为API响应格式
    toApiResponse(): ApiResponse {
        return {
            success: false,
            error: {
                code: this.category.toUpperCase(),
                message: this.message,
                details: this.severity === ErrorSeverity.HIGH ? this.context : undefined
            }
        }
    }
}

// HTTP状态码分类器
export function categorizeHttpError(status: number, provider?: string): ErrorCategory {
    switch (Math.floor(status / 100)) {
        case 4:
            switch (status) {
                case 400:
                    return ErrorCategory.VALIDATION
                case 401:
                case 403:
                    return ErrorCategory.AUTHENTICATION
                case 429:
                    return ErrorCategory.RATE_LIMIT
                default:
                    return ErrorCategory.CLIENT
            }
        case 5:
            return ErrorCategory.SERVER
        default:
            return ErrorCategory.NETWORK
    }
}

// 错误是否应该触发密钥状态变更
export function shouldUpdateKeyStatus(error: ApiError): boolean {
    return (
        error.category === ErrorCategory.AUTHENTICATION ||
        (error.context.statusCode === 400 && error.context.provider === 'google-ai-studio')
    )
}

// 错误是否需要冷却处理
export function needsCooldown(error: ApiError): boolean {
    return error.category === ErrorCategory.RATE_LIMIT
}

// 计算重试延迟
export function calculateRetryDelay(attempt: number, category: ErrorCategory): number {
    const baseDelay = 100 // ms
    const maxDelay = 5000 // ms

    switch (category) {
        case ErrorCategory.RATE_LIMIT:
            // 限流错误使用更长的延迟
            return Math.min(baseDelay * Math.pow(3, attempt), maxDelay * 2)
        case ErrorCategory.NETWORK:
        case ErrorCategory.SERVER:
            // 网络和服务器错误使用指数退避
            return Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
        default:
            // 其他错误使用较短的延迟
            return Math.min(baseDelay * attempt, maxDelay / 2)
    }
}

// 错误聚合器 - 用于跟踪错误模式
export class ErrorAggregator {
    private errorCounts = new Map<string, number>()
    private lastReset = Date.now()
    private readonly resetInterval = 300000 // 5分钟

    recordError(error: ApiError): void {
        const key = `${error.category}-${error.context.provider || 'unknown'}`

        // 定期重置计数
        if (Date.now() - this.lastReset > this.resetInterval) {
            this.errorCounts.clear()
            this.lastReset = Date.now()
        }

        this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1)
    }

    getErrorStats(): { category: string; provider: string; count: number }[] {
        const stats = []
        for (const [key, count] of this.errorCounts.entries()) {
            const [category, provider] = key.split('-')
            stats.push({ category, provider, count })
        }
        return stats.sort((a, b) => b.count - a.count)
    }

    hasHighErrorRate(category: ErrorCategory, provider: string, threshold = 10): boolean {
        const key = `${category}-${provider}`
        return (this.errorCounts.get(key) || 0) > threshold
    }
}

// 全局错误聚合器实例
export const errorAggregator = new ErrorAggregator()
