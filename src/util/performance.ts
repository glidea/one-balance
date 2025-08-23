// 性能监控工具类
// 用于统计函数执行耗时，识别性能瓶颈

interface PerformanceEntry {
    name: string
    duration: number
    timestamp: number
    callCount: number
}

class PerformanceMonitor {
    private entries: Map<string, PerformanceEntry> = new Map()
    private startTimes: Map<string, number> = new Map()
    private enabled: boolean = true

    constructor() {
        // 可通过环境变量控制是否启用性能监控
        this.enabled = true // 默认启用，生产环境可考虑关闭
    }

    // 开始计时
    start(functionName: string): void {
        if (!this.enabled) return

        const startTime = performance.now()
        const key = `${functionName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        this.startTimes.set(key, startTime)

        // 设置一个标识，用于后续结束计时
        return key as any
    }

    // 结束计时
    end(key: string, functionName?: string): void {
        if (!this.enabled || !key) return

        const startTime = this.startTimes.get(key)
        if (!startTime) return

        const endTime = performance.now()
        const duration = endTime - startTime

        // 从key中提取函数名
        const name = functionName || key.split('-')[0]

        // 更新统计信息
        const existing = this.entries.get(name)
        if (existing) {
            existing.duration += duration
            existing.callCount += 1
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
        if (duration > 500) {
            console.warn(`⚠️  SLOW FUNCTION: ${name} took ${duration.toFixed(1)}ms`)
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

    // 检查是否有长时间运行的函数
    hasSlowFunctions(thresholdMs: number = 500): boolean {
        return Array.from(this.entries.values()).some(entry => entry.duration / entry.callCount > thresholdMs)
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
    console.log(report)
}

// 检查并警告慢函数
export function checkSlowFunctions(): void {
    if (perfMonitor.hasSlowFunctions(300)) {
        console.warn('🐌 Detected slow functions! Check performance report.')
        logPerformanceReport()
    }
}
