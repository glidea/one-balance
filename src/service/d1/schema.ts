import * as sqlite from 'drizzle-orm/sqlite-core'
import * as drizzle from 'drizzle-orm'

export type Key = typeof keys.$inferSelect
export const keys = sqlite.sqliteTable(
    'keys',
    {
        id: sqlite
            .text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        key: sqlite.text('key').notNull(),
        provider: sqlite.text('provider').notNull(),
        modelCoolings: sqlite.text('model_coolings', { mode: 'json' }).$type<Record<string, ModelCooling>>(),
        totalCoolingSeconds: sqlite.integer('total_cooling_seconds').notNull().default(0), // across all models, in seconds
        status: sqlite.text('status').notNull().default('active'), // active, blocked
        createdAt: sqlite
            .integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(drizzle.sql`(strftime('%s', 'now'))`),
        updatedAt: sqlite
            .integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(drizzle.sql`(strftime('%s', 'now'))`)
    },
    table => {
        return {
            providerKeyUnqIdx: sqlite.uniqueIndex('provider_key_unq_idx').on(table.provider, table.key),
            providerStatusCreatedAtIdx: sqlite
                .index('provider_status_created_at_idx')
                .on(table.provider, table.status, table.createdAt),
            totalCoolingSecondsIdx: sqlite.index('total_cooling_seconds_idx').on(table.totalCoolingSeconds)
        }
    }
)

interface ModelCooling {
    total_seconds: number // across all times
    end_at: number
}
