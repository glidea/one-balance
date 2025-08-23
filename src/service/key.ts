import * as d1 from './d1'
import * as schema from './d1/schema'
import * as drizzle from 'drizzle-orm'
import { perfMonitor } from '../util/performance'
import { logger } from '../util/logger'
import { CONFIG } from '../config/constants'

interface Cache<T> {
    data: T
    updatedAt: number
    isDirty: boolean
    timestamp: number // 添加时间戳以便清理
}

// only shared within a worker instance (shutdown if idle)
// 使用普通 Map 和手动清理防止内存泄漏
const activeKeysCacheByProvider = new Map<string, Cache<schema.Key[]>>()
const cacheMaxAgeSeconds = CONFIG.API.CACHE_MAX_AGE_SECONDS
let lastCacheCleanup = 0

// 手动清理过期缓存
function cleanupCache(): void {
    const now = Date.now()

    // 限制清理频率（每分钟最多清理一次）
    if (now - lastCacheCleanup < 60000) return
    lastCacheCleanup = now

    // 清理5分钟前的缓存
    const maxAge = 300000 // 5分钟
    for (const [key, cache] of activeKeysCacheByProvider.entries()) {
        if (now - cache.timestamp > maxAge) {
            activeKeysCacheByProvider.delete(key)
        }
    }

    // 如果条目过多，删除最旧的20%
    if (activeKeysCacheByProvider.size > 100) {
        const entries = Array.from(activeKeysCacheByProvider.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)
        const toRemove = Math.floor(activeKeysCacheByProvider.size * 0.2)
        for (let i = 0; i < toRemove; i++) {
            activeKeysCacheByProvider.delete(entries[i][0])
        }
    }
}

export async function listActiveKeysViaCache(env: Env, provider: string): Promise<schema.Key[]> {
    const key = perfMonitor.start('keyService.listActiveKeysViaCache')
    try {
        // 定期清理过期缓存
        cleanupCache()

        const now = Date.now() / 1000
        const cache = activeKeysCacheByProvider.get(provider)

        if (cache && now - cache.updatedAt < cacheMaxAgeSeconds && !cache.isDirty) {
            return cache.data
        }

        // may thundering herd, but it should be enough
        const keys = (await d1.db(env).query.keys.findMany({
            columns: {
                id: true,
                key: true,
                modelCoolings: true
            },
            where: drizzle.and(drizzle.eq(schema.keys.status, 'active'), drizzle.eq(schema.keys.provider, provider)),
            orderBy: drizzle.sql`RANDOM()`,
            limit: CONFIG.DATABASE.KEYS_QUERY_LIMIT
        })) as schema.Key[]

        activeKeysCacheByProvider.set(provider, {
            data: keys,
            updatedAt: now,
            timestamp: Date.now(),
            isDirty: false
        })

        logger.info(`Cache refreshed for provider`, { provider, keyCount: keys.length })
        return keys
    } finally {
        perfMonitor.end(key, 'keyService.listActiveKeysViaCache')
    }
}

export async function setKeyStatus(env: Env, provider: string, keyId: string, status: string) {
    await d1.db(env).update(schema.keys).set({ status }).where(drizzle.eq(schema.keys.id, keyId))

    const cache = activeKeysCacheByProvider.get(provider)
    if (cache) {
        cache.isDirty = true
    }
}

export async function setKeyModelCooldownIfAvailable(
    env: Env,
    keyId: string,
    provider: string,
    model: string,
    sec: number
) {
    const now = Date.now() / 1000
    const newCooldownEndAt = Math.round(now + sec)

    const modelKey = model.replace(/"/g, '""')
    const modelPath = `$.\"${modelKey}\"`
    const endAtPath = `$.\"${modelKey}\".end_at`
    const totalSecondsPath = `$.\"${modelKey}\".total_seconds`

    const result = await d1
        .db(env)
        .update(schema.keys)
        .set({
            modelCoolings: drizzle.sql`json_set(
                COALESCE(${schema.keys.modelCoolings}, '{}'),
                ${modelPath},
                json_object(
                    'end_at',
                    ${newCooldownEndAt},
                    'total_seconds',
                    COALESCE(CAST(json_extract(${schema.keys.modelCoolings}, ${totalSecondsPath}) AS INTEGER), 0) + ${sec}
                )
            )`,
            totalCoolingSeconds: drizzle.sql`${schema.keys.totalCoolingSeconds} + ${sec}`
        })
        .where(
            drizzle.and(
                drizzle.eq(schema.keys.id, keyId),
                drizzle.or(
                    drizzle.sql`json_extract(${schema.keys.modelCoolings}, ${endAtPath}) IS NULL`,
                    // if key is already cooling down, do nothing,
                    // otherwise may wrong extend the recovery time (cache consistency may cause multiple calls)
                    drizzle.sql`json_extract(${schema.keys.modelCoolings}, ${endAtPath}) <= ${now}`
                )
            )
        )
        .returning({ updatedId: schema.keys.id })

    if (result.length > 0) {
        const cache = activeKeysCacheByProvider.get(provider)
        if (cache) {
            cache.isDirty = true
        }
    }
}

// --- For Web UI ---

export async function listKeys(
    env: Env,
    provider: string,
    status: string,
    q: string,
    page: number,
    pageSize: number,
    sortBy?: string,
    sortOrder?: string
): Promise<{ keys: schema.Key[]; total: number }> {
    const db = d1.db(env)
    const conditions = [drizzle.eq(schema.keys.provider, provider), drizzle.eq(schema.keys.status, status)]
    if (q) {
        conditions.push(
            drizzle.or(drizzle.like(schema.keys.key, `%${q}%`), drizzle.like(schema.keys.remark, `%${q}%`))!
        )
    }

    const where = drizzle.and(...conditions)

    const totalResult = await db.select({ count: drizzle.count() }).from(schema.keys).where(where)
    const total = totalResult[0]?.count || 0
    if (total === 0) {
        return { keys: [], total: 0 }
    }

    let orderBy
    if (sortBy === 'createdAt') {
        orderBy = sortOrder === 'asc' ? drizzle.asc(schema.keys.createdAt) : drizzle.desc(schema.keys.createdAt)
    } else if (sortBy === 'totalCoolingSeconds') {
        orderBy =
            sortOrder === 'asc'
                ? drizzle.asc(schema.keys.totalCoolingSeconds)
                : drizzle.desc(schema.keys.totalCoolingSeconds)
    } else {
        orderBy = drizzle.desc(schema.keys.createdAt)
    }

    const keys = await db.query.keys.findMany({
        where,
        orderBy,
        limit: pageSize,
        offset: (page - 1) * pageSize
    })

    return { keys, total }
}

interface KeyForAdd {
    key: string
    provider: string
    remark: string
}

export async function addKeys(env: Env, keys: KeyForAdd[]) {
    if (keys.length === 0) {
        return
    }

    const db = d1.db(env)
    const chunkSize = CONFIG.DATABASE.BATCH_INSERT_SIZE
    for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize)
        await db.insert(schema.keys).values(chunk).onConflictDoNothing()
    }
}

export async function delKeys(env: Env, keyIds: string[]) {
    if (keyIds.length === 0) {
        return
    }

    await d1.db(env).delete(schema.keys).where(drizzle.inArray(schema.keys.id, keyIds))
}

export async function delAllBlockedKeys(env: Env, provider: string) {
    await d1
        .db(env)
        .delete(schema.keys)
        .where(drizzle.and(drizzle.eq(schema.keys.provider, provider), drizzle.eq(schema.keys.status, 'blocked')))
}
