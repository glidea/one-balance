import * as api from './api'
import * as web from './web'

export default {
    fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
        try {
            const pathname = new URL(request.url).pathname

            // Liveness probe for the Bifrost → one-balance → AI Gateway chain.
            if (pathname === '/health') {
                return new Response('ok')
            }

            if (pathname.startsWith('/api/')) {
                return await api.handle(request, env, ctx)
            }

            return await web.handle(request, env, ctx)
        } catch (e) {
            console.error(e)
            return new Response('Internal Server Error', { status: 500 })
        }
    }
} satisfies ExportedHandler<Env>
