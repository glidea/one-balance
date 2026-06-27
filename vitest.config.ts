import { defineConfig } from 'vitest/config'

// Node environment is enough for the pure-logic tests (429 classification,
// key selection). Worker-binding integration tests (D1, AI Gateway) will use
// @cloudflare/vitest-pool-workers in the foundation chapter.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts']
    }
})
