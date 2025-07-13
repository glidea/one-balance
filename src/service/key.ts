import * as d1 from './d1'
import * as schema from './d1/schema'
import * as drizzle from 'drizzle-orm'

interface Cache<T> {
    data: T
    updatedAt: number
    isDirty: boolean
}

// only shared within a worker instance (shutdown if idle)
let activeKeysCacheByProvider: Map<string, Cache<schema.Key[]>> = new Map()
let cacheMaxAgeSeconds = 1

export async function listActiveKeysViaCache(env: Env, provider: string): Promise<schema.Key[]> {
    const now = Date.now() / 1000
    const cache = activeKeysCacheByProvider.get(provider)

    if (cache && now - cache.updatedAt < cacheMaxAgeSeconds && !cache.isDirty) {
        return cache.data
    }

    // may thundering herd, but it should be enough
    const keys = await d1.db(env).query.keys.findMany({
        where: drizzle.and(drizzle.eq(schema.keys.status, 'active'), drizzle.eq(schema.keys.provider, provider))
    })

    activeKeysCacheByProvider.set(provider, {
        data: keys,
        updatedAt: now,
        isDirty: false
    })

    console.info(`cache refreshed for ${provider}: ${keys.length} keys`)
    return keys
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
        conditions.push(drizzle.like(schema.keys.key, `%${q}%`))
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
}

export async function addKeys(env: Env, keys: KeyForAdd[]) {
    if (keys.length === 0) {
        return
    }

    const db = d1.db(env)
    const chunkSize = 15
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
