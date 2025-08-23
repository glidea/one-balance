// 安全日志工具 - 防止敏感信息泄露

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
    [key: string]: any
}

class SecureLogger {
    private sensitivePatterns = [
        /sk-[a-zA-Z0-9]{32,}/g, // OpenAI API keys
        /AIza[a-zA-Z0-9]{35}/g, // Google AI keys
        /x-goog-api-key:\s*[a-zA-Z0-9-_]+/gi,
        /Bearer\s+[a-zA-Z0-9-_.~+/]+=*/gi,
        /auth.*key.*[:=]\s*[a-zA-Z0-9-_]+/gi
    ]

    private maskSensitiveData(message: string): string {
        let masked = message

        for (const pattern of this.sensitivePatterns) {
            masked = masked.replace(pattern, match => {
                if (match.length <= 8) return '***'
                const prefix = match.substring(0, 4)
                const suffix = match.substring(match.length - 4)
                return `${prefix}***${suffix}`
            })
        }

        return masked
    }

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString()
        const levelUpper = level.toUpperCase().padEnd(5)

        let formatted = `[${timestamp}] ${levelUpper} ${this.maskSensitiveData(message)}`

        if (context && Object.keys(context).length > 0) {
            const safeContext = this.sanitizeContext(context)
            formatted += ` | Context: ${JSON.stringify(safeContext)}`
        }

        return formatted
    }

    private sanitizeContext(context: LogContext): LogContext {
        const sanitized: LogContext = {}

        for (const [key, value] of Object.entries(context)) {
            const keyLower = key.toLowerCase()

            if (keyLower.includes('key') || keyLower.includes('token') || keyLower.includes('secret')) {
                sanitized[key] = this.maskValue(String(value))
            } else if (typeof value === 'string') {
                sanitized[key] = this.maskSensitiveData(value)
            } else {
                sanitized[key] = value
            }
        }

        return sanitized
    }

    private maskValue(value: string): string {
        if (value.length <= 8) return '***'
        const prefix = value.substring(0, 4)
        const suffix = value.substring(value.length - 4)
        return `${prefix}***${suffix}`
    }

    info(message: string, context?: LogContext): void {
        console.log(this.formatMessage('info', message, context))
    }

    warn(message: string, context?: LogContext): void {
        console.warn(this.formatMessage('warn', message, context))
    }

    error(message: string, context?: LogContext): void {
        console.error(this.formatMessage('error', message, context))
    }

    debug(message: string, context?: LogContext): void {
        // 只在开发环境输出 debug 日志
        if (typeof globalThis !== 'undefined' && 'ENVIRONMENT' in globalThis) {
            console.log(this.formatMessage('debug', message, context))
        }
    }

    // 专门用于记录 API 密钥状态变更的安全方法
    logKeyStatusChange(keyId: string, status: string, reason?: string): void {
        this.info(`Key status changed`, {
            keyId,
            status,
            reason: reason || 'Manual change'
        })
    }

    // 专门用于记录请求错误的安全方法
    logRequestError(status: number, provider: string, modelHint?: string): void {
        this.error(`Request failed`, {
            status,
            provider,
            model: modelHint || 'unknown'
        })
    }

    // 专门用于记录性能问题
    logPerformanceIssue(functionName: string, duration: number): void {
        this.warn(`Slow function detected`, {
            function: functionName,
            duration: `${duration.toFixed(1)}ms`
        })
    }
}

// 导出全局单例
export const logger = new SecureLogger()

// 向后兼容的便捷函数
export const secureLog = {
    info: (msg: string, ctx?: LogContext) => logger.info(msg, ctx),
    warn: (msg: string, ctx?: LogContext) => logger.warn(msg, ctx),
    error: (msg: string, ctx?: LogContext) => logger.error(msg, ctx),
    debug: (msg: string, ctx?: LogContext) => logger.debug(msg, ctx)
}

export default logger
