import * as api from './api'
import * as web from './web'
import { perfMonitor, logPerformanceReport } from './util/performance'

export default {
    fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
        const key = perfMonitor.start('index.fetch')
        try {
            if (new URL(request.url).pathname.startsWith('/api/')) {
                const response = await api.handle(request, env, ctx)

                // 在每次请求后输出性能报告（但不立即重置，除非是性能报告请求本身）
                const pathname = new URL(request.url).pathname
                const isPerformanceReport = pathname === '/api/perf'

                ctx.waitUntil(
                    (async () => {
                        try {
                            if (!isPerformanceReport) {
                                logPerformanceReport()
                                // 定期重置以避免内存泄漏（每20个请求重置一次）
                                if (Math.random() < 0.05) {
                                    // 5%的概率重置
                                    perfMonitor.reset()
                                }
                            }
                        } catch (e) {
                            console.error('Error logging performance report:', e)
                        }
                    })()
                )

                return response
            }

            return await web.handle(request, env, ctx)
        } catch (e) {
            console.error(e)
            return new Response('Internal Server Error', { status: 500 })
        } finally {
            perfMonitor.end(key, 'index.fetch')
        }
    }
} satisfies ExportedHandler<Env>
