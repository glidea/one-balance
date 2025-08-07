import * as d1 from './d1'
import * as schema from './d1/schema'
import * as drizzle from 'drizzle-orm'

// --- For Web UI ---

export async function list(env: Env): Promise<schema.CustomProvider[]> {
    const db = d1.db(env)
    return db.query.customProviders.findMany({
        orderBy: drizzle.desc(schema.customProviders.createdAt)
    })
}

interface ProviderForAdd {
    name: string
    baseURL: string
}

export async function add(env: Env, provider: ProviderForAdd) {
    const db = d1.db(env)
    await db.insert(schema.customProviders).values(provider).onConflictDoNothing()
}

export async function del(env: Env, id: string) {
    await d1.db(env).delete(schema.customProviders).where(drizzle.eq(schema.customProviders.id, id))
}
