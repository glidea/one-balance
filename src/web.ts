// Web UI - 重构后使用模块化结构
import { handle as webHandle } from './web/index'

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return webHandle(request, env, ctx)
}
