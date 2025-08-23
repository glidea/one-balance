// 应用配置常量

export const CONFIG = {
    // API 配置
    API: {
        MAX_RETRIES: 30,
        OPENAI_MAX_RETRIES: 10,
        DEFAULT_COOLDOWN_SECONDS: 65,
        CACHE_MAX_AGE_SECONDS: 60,
        // 指数退避配置
        BACKOFF: {
            INITIAL_DELAY_MS: 100,
            MAX_DELAY_MS: 5000,
            MULTIPLIER: 2,
            JITTER_FACTOR: 0.1
        }
    },

    // 内存管理配置
    MEMORY: {
        CONSECUTIVE_429_MAP: {
            MAX_ENTRIES: 10000,
            MAX_AGE_MS: 600000, // 10分钟
            CLEANUP_INTERVAL_MS: 120000 // 2分钟
        },
        ACTIVE_KEYS_CACHE: {
            MAX_ENTRIES: 100, // 最多支持100个提供商
            MAX_AGE_MS: 300000, // 5分钟
            CLEANUP_INTERVAL_MS: 60000 // 每分钟清理一次
        },
        PERFORMANCE_MONITOR: {
            MAX_ENTRIES: 500,
            MAX_AGE_MS: 3600000, // 1小时
            CLEANUP_INTERVAL_MS: 600000 // 10分钟
        }
    },

    // 性能监控配置
    PERFORMANCE: {
        SLOW_FUNCTION_THRESHOLD_MS: 500,
        SLOW_FUNCTION_WARNING_THRESHOLD_MS: 300,
        RESET_PROBABILITY: 0.05, // 5%的概率重置
        REPORT_INTERVAL_REQUESTS: 20
    },

    // Web UI 配置
    WEB: {
        KEYS_PER_PAGE: 20,
        COOKIE_MAX_AGE: 2147483647, // 最大值
        SESSION_TIMEOUT_MS: 3600000 // 1小时
    },

    // 数据库配置
    DATABASE: {
        KEYS_QUERY_LIMIT: 1000,
        BATCH_INSERT_SIZE: 15
    },

    // 分页配置
    PAGINATION: {
        WINDOW_SIZE: 2,
        MAX_PAGES_DISPLAY: 10
    },

    // Google AI Studio 特定配置
    GOOGLE_AI_STUDIO: {
        QUOTA_RESET_TIMEZONE: 'America/Los_Angeles'
    }
} as const

// 辅助函数：获取到太平洋时间午夜的秒数
function getSecondsUntilMidnightPT(): number {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    })

    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10)

    const secondsPassed = hour * 3600 + minute * 60 + second
    return 24 * 60 * 60 - secondsPassed
}

// 导出类型
export type ConfigType = typeof CONFIG
