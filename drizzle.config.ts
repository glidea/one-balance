import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'sqlite',
    schema: './src/service/d1/schema.ts',
    out: './src/service/d1/migrations'
})
