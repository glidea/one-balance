import * as d1 from 'drizzle-orm/d1'
import * as schema from './schema'

export type Client = d1.DrizzleD1Database<typeof schema>

export function db(env: Env): Client {
    return d1.drizzle(env.DB, { schema: schema })
}
