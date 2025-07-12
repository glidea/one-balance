import * as api from './api'
import * as web from './web'

export default {
    fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
        try {
            if (new URL(request.url).pathname.startsWith('/api/')) {
                return await api.handle(request, env, ctx)
            }

            return await web.handle(request, env, ctx)
        } catch (e) {
            console.error(e)
            return new Response('Internal Server Error', { status: 500 })
        }
    }
} satisfies ExportedHandler<Env>
