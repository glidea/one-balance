import * as api from './api'
import * as web from './web'
import { perfMonitor, logPerformanceReport } from './util/performance'
import { logger } from './util/logger'
import { CONFIG } from './config/constants'

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
                                // 定期清理以避免内存泄漏（每20个请求清理一次）
                                if (Math.random() < CONFIG.PERFORMANCE.RESET_PROBABILITY) {
                                    // 使用更温和的清理而不是全重置
                                    perfMonitor.forceCleanup()
                                }

                                // 检查内存状态
                                const memStats = perfMonitor.getMemoryStats()
                                if (!memStats.isHealthy) {
                                    logger.warn('Performance monitor memory usage high', memStats)
                                }
                            }
                        } catch (e) {
                            logger.error('Performance report logging failed', { error: e.message })
                        }
                    })()
                )

                return response
            }

            return await web.handle(request, env, ctx)
        } catch (e) {
            logger.error('Request handler failed', { error: e.message })
            return new Response('Internal Server Error', { status: 500 })
        } finally {
            perfMonitor.end(key, 'index.fetch')
        }
    }
} satisfies ExportedHandler<Env>
