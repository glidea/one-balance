// 内存管理工具 - 防止内存泄漏和优化资源使用

import { logger } from './logger'

interface MemoryManagerOptions {
    maxEntries?: number
    cleanupIntervalMs?: number
    maxAgeMs?: number
}

interface TimestampedEntry<T> {
    value: T
    timestamp: number
}

/**
 * 自动清理的 Map 实现，防止内存泄漏
 */
export class ManagedMap<K, V> {
    private map = new Map<K, TimestampedEntry<V>>()
    private cleanupTimer: NodeJS.Timeout | null = null
    private readonly maxEntries: number
    private readonly cleanupIntervalMs: number
    private readonly maxAgeMs: number

    constructor(options: MemoryManagerOptions = {}) {
        this.maxEntries = options.maxEntries || 1000
        this.cleanupIntervalMs = options.cleanupIntervalMs || 60000 // 1分钟
        this.maxAgeMs = options.maxAgeMs || 300000 // 5分钟

        // 延迟启动定时器，避免在全局作用域中初始化
        // 在第一次使用时再启动
    }

    set(key: K, value: V): void {
        // 在首次使用时启动清理定时器
        this.ensureCleanupTimer()

        // 如果已达到最大条目数，先清理旧条目
        if (this.map.size >= this.maxEntries) {
            this.cleanup()
        }

        this.map.set(key, {
            value,
            timestamp: Date.now()
        })
    }

    get(key: K): V | undefined {
        const entry = this.map.get(key)
        if (!entry) return undefined

        // 检查是否过期
        if (Date.now() - entry.timestamp > this.maxAgeMs) {
            this.map.delete(key)
            return undefined
        }

        // 更新时间戳（LRU 策略的一部分）
        entry.timestamp = Date.now()
        return entry.value
    }

    has(key: K): boolean {
        const entry = this.map.get(key)
        if (!entry) return false

        // 检查是否过期
        if (Date.now() - entry.timestamp > this.maxAgeMs) {
            this.map.delete(key)
            return false
        }

        return true
    }

    delete(key: K): boolean {
        return this.map.delete(key)
    }

    clear(): void {
        this.map.clear()
    }

    get size(): number {
        return this.map.size
    }

    // 获取所有值（用于遍历，会自动清理过期项）
    values(): V[] {
        this.cleanup() // 先清理过期项
        const values: V[] = []
        for (const entry of this.map.values()) {
            values.push(entry.value)
        }
        return values
    }

    // 获取所有键值对（用于遍历，会自动清理过期项）
    entries(): [K, V][] {
        this.cleanup() // 先清理过期项
        const entries: [K, V][] = []
        for (const [key, entry] of this.map.entries()) {
            entries.push([key, entry.value])
        }
        return entries
    }

    private cleanup(): void {
        const now = Date.now()
        const entriesBeforeCleanup = this.map.size

        // 清理过期条目
        for (const [key, entry] of this.map.entries()) {
            if (now - entry.timestamp > this.maxAgeMs) {
                this.map.delete(key)
            }
        }

        // 如果清理后仍然太多，删除最旧的条目
        if (this.map.size > this.maxEntries * 0.8) {
            const entries = Array.from(this.map.entries())
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

            const entriesToRemove = Math.floor(this.map.size * 0.2)
            for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
                this.map.delete(entries[i][0])
            }
        }

        const entriesAfterCleanup = this.map.size
        if (entriesBeforeCleanup > entriesAfterCleanup) {
            logger.debug('Memory cleanup completed', {
                before: entriesBeforeCleanup,
                after: entriesAfterCleanup,
                removed: entriesBeforeCleanup - entriesAfterCleanup
            })
        }
    }

    private ensureCleanupTimer(): void {
        if (this.cleanupTimer === null) {
            this.cleanupTimer = setInterval(() => {
                this.cleanup()
            }, this.cleanupIntervalMs)
        }
    }

    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer)
            this.cleanupTimer = null
        }
        this.clear()
    }

    // 强制执行清理
    forceCleanup(): void {
        this.cleanup()
    }
}

/**
 * 全局内存监控器
 */
class GlobalMemoryMonitor {
    private managedMaps: ManagedMap<any, any>[] = []
    private monitorTimer: NodeJS.Timeout | null = null
    private isStarted = false

    constructor() {
        // 不在构造函数中启动监控，避免全局作用域问题
    }

    registerMap<K, V>(map: ManagedMap<K, V>): void {
        this.managedMaps.push(map)
        // 延迟启动监控，直到有 Map 注册
        if (!this.isStarted) {
            this.startMonitoring()
            this.isStarted = true
        }
    }

    private startMonitoring(): void {
        // 每5分钟检查一次内存使用情况
        this.monitorTimer = setInterval(() => {
            this.checkMemoryUsage()
        }, 300000)
    }

    private checkMemoryUsage(): void {
        let totalEntries = 0
        for (const map of this.managedMaps) {
            totalEntries += map.size
        }

        if (totalEntries > 10000) {
            logger.warn('High memory usage detected', {
                totalMapEntries: totalEntries,
                managedMapsCount: this.managedMaps.length
            })
        }

        logger.debug('Memory usage report', {
            totalMapEntries: totalEntries,
            managedMapsCount: this.managedMaps.length
        })
    }

    destroy(): void {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer)
            this.monitorTimer = null
        }

        for (const map of this.managedMaps) {
            map.destroy()
        }
        this.managedMaps = []
    }
}

// 导出全局实例
export const memoryMonitor = new GlobalMemoryMonitor()

// 便捷工厂函数
export function createManagedMap<K, V>(options?: MemoryManagerOptions): ManagedMap<K, V> {
    const map = new ManagedMap<K, V>(options)
    memoryMonitor.registerMap(map)
    return map
}

// 内存压力检测
export function getMemoryPressure(): 'low' | 'medium' | 'high' {
    // Cloudflare Workers 有内存限制，这里提供一个简单的启发式检测
    try {
        // 简化实现，避免在全局作用域中分配大量内存
        // 在实际使用中，可以根据 ManagedMap 的大小来估算
        return 'low'
    } catch {
        return 'high'
    }
}
