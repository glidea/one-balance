// 性能监控工具类
// 用于统计函数执行耗时，识别性能瓶颈

import { CONFIG } from '../config/constants'

interface PerformanceEntry {
    name: string
    duration: number
    timestamp: number
    callCount: number
}

interface TimestampedStartTime {
    value: number
    timestamp: number
}

class PerformanceMonitor {
    private entries = new Map<string, PerformanceEntry>()
    private startTimes = new Map<string, TimestampedStartTime>()
    private enabled: boolean = true
    private lastCleanup = 0
    private cleanupTimer: number | null = null
    private isDestroyed = false

    constructor() {
        this.enabled = true
        // 不在构造函数中启动定时器，避免 Cloudflare Workers 全局作用域限制
        // 改为在需要时才手动清理
    }

    private startPeriodicCleanup(): void {
        // 禁用自动清理，兼容 Cloudflare Workers 限制
        // Workers 不允许在全局作用域使用 setInterval/setTimeout
        // 改为在每次操作时手动检查和清理
    }

    // 手动清理过期的数据
    private cleanup(): void {
        if (this.isDestroyed) return

        const now = Date.now()

        // 限制清理频率，避免频繁清理
        if (now - this.lastCleanup < 30000) return
        this.lastCleanup = now

        const maxEntries = CONFIG.MEMORY.PERFORMANCE_MONITOR.MAX_ENTRIES
        const maxAgeMs = CONFIG.MEMORY.PERFORMANCE_MONITOR.MAX_AGE_MS
        const startTimeMaxAge = 60000 // 1分钟

        let entriesRemoved = 0
        let startTimesRemoved = 0

        // 清理过期的开始时间记录
        for (const [key, entry] of this.startTimes.entries()) {
            if (now - entry.timestamp > startTimeMaxAge) {
                this.startTimes.delete(key)
                startTimesRemoved++
            }
        }

        // 清理过期的性能统计
        for (const [key, entry] of this.entries.entries()) {
            if (now - entry.timestamp > maxAgeMs) {
                this.entries.delete(key)
                entriesRemoved++
            }
        }

        // 如果条目太多，按 LRU 策略删除
        if (this.entries.size > maxEntries) {
            const sortedByTime = Array.from(this.entries.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)
            const toRemove = Math.min(
                Math.floor(this.entries.size * 0.2),
                this.entries.size - Math.floor(maxEntries * 0.8)
            )

            for (let i = 0; i < toRemove && i < sortedByTime.length; i++) {
                this.entries.delete(sortedByTime[i][0])
                entriesRemoved++
            }
        }

        if (this.startTimes.size > 1000) {
            const sortedByTime = Array.from(this.startTimes.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)
            const toRemove = Math.floor(this.startTimes.size * 0.2)

            for (let i = 0; i < toRemove && i < sortedByTime.length; i++) {
                this.startTimes.delete(sortedByTime[i][0])
                startTimesRemoved++
            }
        }

        // 记录清理统计
        if (entriesRemoved > 0 || startTimesRemoved > 0) {
            // 延迟导入避免循环依赖
            import('./logger').then(({ logger }) => {
                logger.debug('Performance monitor cleanup completed', {
                    entriesRemoved,
                    startTimesRemoved,
                    currentEntries: this.entries.size,
                    currentStartTimes: this.startTimes.size
                })
            })
        }
    }

    // 强制清理（忽略时间限制）
    forceCleanup(): void {
        if (this.isDestroyed) return

        const previousLastCleanup = this.lastCleanup
        this.lastCleanup = 0 // 重置时间限制
        this.cleanup()
        this.lastCleanup = previousLastCleanup // 恢复时间戳
    }

    // 开始计时
    start(functionName: string): string {
        if (!this.enabled) return ''

        // 定期清理过期数据
        this.cleanup()

        const startTime = performance.now()
        const key = `${functionName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        this.startTimes.set(key, {
            value: startTime,
            timestamp: Date.now()
        })

        return key
    }

    // 结束计时
    end(key: string, functionName?: string): void {
        if (!this.enabled || !key) return

        const startTimeEntry = this.startTimes.get(key)
        if (!startTimeEntry) return

        const endTime = performance.now()
        const duration = endTime - startTimeEntry.value

        // 从key中提取函数名
        const name = functionName || key.split('-')[0]

        // 更新统计信息
        const existing = this.entries.get(name)
        if (existing) {
            existing.duration += duration
            existing.callCount += 1
            existing.timestamp = Date.now() // 更新时间戳
        } else {
            this.entries.set(name, {
                name,
                duration,
                timestamp: Date.now(),
                callCount: 1
            })
        }

        // 清理
        this.startTimes.delete(key)

        // 如果耗时超过500ms，立即记录警告
        if (duration > CONFIG.PERFORMANCE.SLOW_FUNCTION_THRESHOLD_MS) {
            // 延迟导入避免循环依赖
            import('./logger').then(({ logger }) => {
                logger.logPerformanceIssue(name, duration)
            })
        }
    }

    // 获取统计报告
    getReport(): string {
        if (!this.enabled || this.entries.size === 0) {
            return 'Performance monitoring disabled or no data available'
        }

        const sortedEntries = Array.from(this.entries.values()).sort((a, b) => b.duration - a.duration)

        const totalTime = sortedEntries.reduce((sum, entry) => sum + entry.duration, 0)

        let report = '\n=== Performance Stats ===\n'

        // 显示前10个最耗时的函数
        const topEntries = sortedEntries.slice(0, 10)

        for (const entry of topEntries) {
            const percentage = ((entry.duration / totalTime) * 100).toFixed(1)
            const avgTime = (entry.duration / entry.callCount).toFixed(1)
            report += `${entry.name}: ${entry.duration.toFixed(1)}ms (${percentage}% total, ${entry.callCount}x calls, avg: ${avgTime}ms)\n`
        }

        report += `\nTotal Measured Time: ${totalTime.toFixed(1)}ms\n`
        report += `Functions Tracked: ${this.entries.size}\n`
        report += '=========================='

        return report
    }

    // 清空统计数据
    reset(): void {
        this.entries.clear()
        this.startTimes.clear()
    }

    // 销毁监控器，释放资源
    destroy(): void {
        this.isDestroyed = true

        // 清理定时器（如果有的话）
        if (this.cleanupTimer) {
            // 兼容两种情况：setTimeout 和 setInterval
            if (typeof clearTimeout !== 'undefined') {
                clearTimeout(this.cleanupTimer)
            }
            if (typeof clearInterval !== 'undefined') {
                clearInterval(this.cleanupTimer)
            }
            this.cleanupTimer = null
        }

        this.entries.clear()
        this.startTimes.clear()
        this.enabled = false

        // 记录销毁事件
        import('./logger').then(({ logger }) => {
            logger.debug('Performance monitor destroyed')
        })
    }

    // 获取最老数据的时间戳，用于计算倒计时
    getOldestDataTimestamp(): number | null {
        if (this.entries.size === 0) return null
        
        let oldestTimestamp = Date.now()
        for (const entry of this.entries.values()) {
            if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp
            }
        }
        return oldestTimestamp
    }

    // 获取内存使用统计
    getMemoryStats(): { entriesCount: number; startTimesCount: number; isHealthy: boolean } {
        const entriesCount = this.entries.size
        const startTimesCount = this.startTimes.size
        const isHealthy =
            entriesCount < CONFIG.MEMORY.PERFORMANCE_MONITOR.MAX_ENTRIES && startTimesCount < 1000 && !this.isDestroyed

        return {
            entriesCount,
            startTimesCount,
            isHealthy
        }
    }

    // 检查是否有长时间运行的函数
    hasSlowFunctions(thresholdMs: number = CONFIG.PERFORMANCE.SLOW_FUNCTION_WARNING_THRESHOLD_MS): boolean {
        const entries = Array.from(this.entries.values())
        return entries.some(entry => entry.duration / entry.callCount > thresholdMs)
    }
}

// 全局单例实例
export const perfMonitor = new PerformanceMonitor()

// 装饰器函数，用于自动监控异步函数
export function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
    originalFunction: T,
    functionName?: string
): T {
    const name = functionName || originalFunction.name || 'anonymous'

    return (async (...args: any[]) => {
        const key = perfMonitor.start(name)
        try {
            const result = await originalFunction.apply(this, args)
            perfMonitor.end(key, name)
            return result
        } catch (error) {
            perfMonitor.end(key, name)
            throw error
        }
    }) as T
}

// 简化的计时函数
export async function measureAsync<T>(functionName: string, asyncFunction: () => Promise<T>): Promise<T> {
    const key = perfMonitor.start(functionName)
    try {
        const result = await asyncFunction()
        perfMonitor.end(key, functionName)
        return result
    } catch (error) {
        perfMonitor.end(key, functionName)
        throw error
    }
}

// 同步函数计时
export function measureSync<T>(functionName: string, syncFunction: () => T): T {
    const key = perfMonitor.start(functionName)
    try {
        const result = syncFunction()
        perfMonitor.end(key, functionName)
        return result
    } catch (error) {
        perfMonitor.end(key, functionName)
        throw error
    }
}

// 输出性能报告的便捷函数
export function logPerformanceReport(): void {
    const report = perfMonitor.getReport()
    // 使用原生 console.log 因为性能报告不包含敏感信息
    console.log(report)
}

// 检查并警告慢函数
export function checkSlowFunctions(): void {
    if (perfMonitor.hasSlowFunctions(CONFIG.PERFORMANCE.SLOW_FUNCTION_WARNING_THRESHOLD_MS)) {
        // 延迟导入避免循环依赖
        import('./logger').then(({ logger }) => {
            logger.warn('Detected slow functions', { threshold: '300ms' })
        })
        logPerformanceReport()
    }
}
