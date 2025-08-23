// Web UI 主处理器 - 重构后的简化版本

import * as keyService from '../service/key'
import * as util from '../util'
import type * as schema from '../service/d1/schema'
import { loginPage } from './templates/login'
import { layout } from './templates/layout'
import { PROVIDERS, getProviderConfig } from './config/providers'
import { CONFIG } from '../config/constants'
import { logger } from '../util/logger'
import { perfMonitor } from '../util/performance'
import {
    buildEmptyState,
    buildCopyableKey,
    buildPaginationControls,
    buildPageLink,
    formatUsedTime,
    formatCoolingTime,
    buildTableHeader,
    buildTableContent,
    buildTableFooter,
    buildSearchForm,
    buildAddKeysForm,
    buildModelCoolingsModal,
    buildModalScript,
    buildCopyScript
} from './helpers'

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const pathname = url.pathname

    // 处理登录相关路由
    if (pathname === '/login') {
        if (request.method === 'POST') {
            return handleLogin(request, env)
        }
        return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    }

    if (pathname === '/logout' && request.method === 'POST') {
        return handleLogout(request)
    }

    // 处理性能统计页面
    if (pathname === '/performance' || pathname === '/perf') {
        return handlePerformance(request, env)
    }

    // 处理密钥管理页面
    if (pathname.startsWith('/keys') || pathname === '/') {
        return handleKeys(request, env)
    }

    return new Response('Not Found', { status: 404 })
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
    const formData = await request.formData()
    const key = formData.get('auth_key') as string

    if (util.isWebUiRequestAllowed(key, env.AUTH_KEY)) {
        const headers = new Headers()
        headers.set(
            'Set-Cookie',
            `auth_key=${key}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${CONFIG.WEB.COOKIE_MAX_AGE}`
        )
        headers.set('Location', '/keys')
        return new Response(null, { status: 302, headers })
    }

    // 重定向回登录页面并显示错误信息
    const headers = new Headers()
    headers.set('Location', '/login?error=invalid_key')
    return new Response(null, { status: 302, headers })
}

async function handleLogout(request: Request): Promise<Response> {
    const headers = new Headers()
    headers.set('Set-Cookie', 'auth_key=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0')
    headers.set('Location', '/login')
    return new Response(null, { status: 302, headers })
}

async function handleKeys(request: Request, env: Env): Promise<Response> {
    const authResult = checkAuth(request, env)
    if (authResult) {
        return authResult
    }

    const parseResult = parseKeysRequest(request)
    if (!parseResult.provider) {
        return new Response(await providersPage(env), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    }

    if (request.method === 'POST') {
        return await handleKeysPost(request, env, parseResult)
    }

    return await handleKeysGet(env, parseResult)
}

function checkAuth(request: Request, env: Env): Response | null {
    const cookie = request.headers.get('Cookie')
    const authKey = cookie?.match(/auth_key=([^;]+)/)?.[1] as string

    if (!util.isWebUiRequestAllowed(authKey, env.AUTH_KEY)) {
        return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    }

    return null
}

async function handlePerformance(request: Request, env: Env): Promise<Response> {
    const authResult = checkAuth(request, env)
    if (authResult) {
        return authResult
    }

    // 处理POST请求清空数据
    if (request.method === 'POST') {
        perfMonitor.reset()
        return new Response(null, { 
            status: 302, 
            headers: { Location: '/performance' }
        })
    }

    return new Response(performancePage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
}

function parseKeysRequest(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname
    const providerMatch = pathname.match(/^\/keys\/([a-zA-Z0-9_-]+)/)

    return {
        provider: providerMatch?.[1] || '',
        q: url.searchParams.get('q') || '',
        status: url.searchParams.get('status') || 'active',
        page: parseInt(url.searchParams.get('page') || '1', 10),
        pageSize: CONFIG.WEB.KEYS_PER_PAGE,
        sortBy: url.searchParams.get('sort_by') || '',
        sortOrder: url.searchParams.get('sort_order') || 'desc'
    }
}

async function handleKeysPost(
    request: Request,
    env: Env,
    params: ReturnType<typeof parseKeysRequest>
): Promise<Response> {
    const formData = await request.formData()
    const action = formData.get('action')

    try {
        if (action === 'add') {
            const keysStr = formData.get('keys') as string
            const remark = formData.get('remark') as string
            const keys = keysStr
                .split(/[\n,]/)
                .map(k => k.trim())
                .filter(Boolean)
            await keyService.addKeys(
                env,
                keys.map(key => ({ key, provider: params.provider, remark }))
            )
            logger.info('Keys added successfully', { provider: params.provider, count: keys.length })
        } else if (action === 'delete') {
            const keyIds = formData.getAll('key_id') as string[]
            await keyService.delKeys(env, keyIds)
            logger.info('Keys deleted successfully', { provider: params.provider, count: keyIds.length })
        } else if (action === 'delete-all-blocked') {
            await keyService.delAllBlockedKeys(env, params.provider)
            logger.info('All blocked keys deleted', { provider: params.provider })
        }
    } catch (error) {
        logger.error('Key management operation failed', {
            action,
            provider: params.provider,
            error: error.message
        })
    }

    const redirectParams = new URLSearchParams()
    redirectParams.set('status', params.status)
    if (params.q) {
        redirectParams.set('q', params.q)
    }
    if (params.sortBy) {
        redirectParams.set('sort_by', params.sortBy)
        redirectParams.set('sort_order', params.sortOrder)
    }

    const headers = new Headers({ Location: `/keys/${params.provider}?${redirectParams.toString()}` })
    return new Response(null, { status: 303, headers })
}

async function handleKeysGet(env: Env, params: ReturnType<typeof parseKeysRequest>): Promise<Response> {
    try {
        const { keys, total } = await keyService.listKeys(
            env,
            params.provider,
            params.status,
            params.q,
            params.page,
            params.pageSize,
            params.sortBy,
            params.sortOrder
        )

        return new Response(
            keysListPage(
                params.provider,
                params.status,
                params.q,
                keys,
                total,
                params.page,
                params.pageSize,
                params.sortBy,
                params.sortOrder
            ),
            {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            }
        )
    } catch (error) {
        logger.error('Failed to load keys page', {
            provider: params.provider,
            error: error.message
        })
        return new Response('Internal Server Error', { status: 500 })
    }
}

// 简化的页面生成函数
async function providersPage(env: Env): Promise<string> {
    const providerCards = await Promise.all(
        PROVIDERS.map(async provider => {
            const config = getProviderConfig(provider)
            const { keys } = await keyService.listKeys(env, provider, 'active', '', 1, 1, '', '')
            const hasActiveKeys = keys.length > 0

            return `
            <div class="apple-card group" style="padding: var(--spacing-lg); cursor: pointer;">
                <a href="/keys/${provider}?status=active" style="display: block; text-decoration: none; color: inherit;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                            <div style="width: 56px; height: 56px; background: var(--color-secondary-system-background); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; border: ${hasActiveKeys ? '2px solid var(--color-system-green)' : '0.5px solid var(--color-system-gray4)'};">
                                <img src="${config.iconUrl}" alt="${provider}" style="width: 32px; height: 32px; object-fit: contain;" 
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div style="width: 32px; height: 32px; background: var(--color-system-blue); border-radius: var(--radius-md); display: none; align-items: center; justify-content: center; color: white; font-weight: var(--font-weight-bold); font-size: 14px;">
                                    ${provider.charAt(0).toUpperCase()}
                                </div>
                            </div>
                            <h3 style="font-size: 17px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0;">${provider}</h3>
                        </div>
                        <svg style="width: 20px; height: 20px; color: var(--color-secondary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </div>
                </a>
            </div>
            `
        })
    )

    const content = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-3xl);">
            <div style="flex: 1;"></div>
            <div style="text-align: center; flex: 1;">
                <h1 style="font-size: 34px; font-weight: var(--font-weight-bold); color: var(--color-label); margin: 0;">Select Provider</h1>
            </div>
            <div style="flex: 1; display: flex; justify-content: flex-end;">
                <form action="/logout" method="POST" style="display: inline;">
                    <button type="submit" class="apple-btn-secondary" style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px;">退出登录</button>
                </form>
            </div>
        </div>
        
        <!-- API Providers -->
        <div style="margin-bottom: var(--spacing-2xl);">
            <h2 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); margin-bottom: var(--spacing-lg); text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">API Providers</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--spacing-md); max-width: 1200px; margin: 0 auto;">
                ${providerCards.join('')}
            </div>
        </div>
        
        <!-- System Management -->
        <div>
            <h2 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); margin-bottom: var(--spacing-lg); text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">System Management</h2>
            <div style="display: flex; justify-content: center; max-width: 1200px; margin: 0 auto;">
                <div style="max-width: 280px; width: 100%;">
                    ${buildPerformanceCard()}
                </div>
            </div>
        </div>
    `
    return layout(content)
}

// 完整的密钥列表页面实现
function keysListPage(
    provider: string,
    currentStatus: string,
    q: string,
    keys: schema.Key[],
    total: number,
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string
): string {
    const content = `
        ${buildBreadcrumb(provider)}
        ${buildKeysTable(provider, currentStatus, q, keys, total, page, pageSize, sortBy, sortOrder)}
        ${buildAddKeysForm(provider, currentStatus, q, page, sortBy, sortOrder)}
        ${buildModelCoolingsModal()}
        ${buildModalScript()}
        ${buildCopyScript()}
    `

    return layout(content)
}

// 本地辅助函数
function buildBreadcrumb(provider: string): string {
    return `
        <div style="margin-bottom: var(--spacing-lg);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <nav style="display: flex; align-items: center; gap: var(--spacing-sm); font-size: 15px;">
                    <a href="/" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">Providers</a>
                    <svg style="width: 16px; height: 16px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                    <span style="color: var(--color-label); font-weight: var(--font-weight-semibold);">${provider}</span>
                </nav>
                <form action="/logout" method="POST" style="display: inline;">
                    <button type="submit" class="apple-btn-secondary" style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 713-3h4a3 3 0 013 3v1"></path>
                        </svg>
                        退出登录
                    </button>
                </form>
            </div>
        </div>
    `
}

function buildKeysTable(
    provider: string,
    currentStatus: string,
    q: string,
    keys: schema.Key[],
    total: number,
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string
): string {
    const statusTabs = buildStatusTabs(provider, currentStatus, q, sortBy, sortOrder)
    const keyRows = buildKeyRows(keys)
    const paginationControls = buildPaginationControls(
        provider,
        currentStatus,
        q,
        page,
        pageSize,
        total,
        sortBy,
        sortOrder
    )

    return `
        <div class="apple-card" style="overflow: hidden; margin-bottom: var(--spacing-lg); max-width: 1200px; margin-left: auto; margin-right: auto;">
            <form method="POST">
                ${buildTableHeader(provider, currentStatus, q, statusTabs, sortBy, sortOrder)}
                ${buildTableContent(keyRows, provider, currentStatus, q, sortBy, sortOrder)}
                ${buildTableFooter(total, paginationControls)}
            </form>
            ${buildSearchForm(provider, currentStatus)}
        </div>
    `
}

function buildStatusTabs(
    provider: string,
    currentStatus: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    const statuses = ['active', 'blocked']
    return statuses
        .map(s => {
            const isActive = s === currentStatus
            const activeStyles = isActive
                ? 'background: var(--color-system-blue); color: white; border: none;'
                : 'background: var(--color-secondary-system-background); color: var(--color-label); border: 0.5px solid var(--color-system-gray4);'
            const link = buildPageLink(provider, s, q, 1, 20, sortBy, sortOrder)
            return `<a href="${link}" style="padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-md); font-size: 15px; font-weight: var(--font-weight-semibold); text-decoration: none; transition: all 0.2s ease; ${activeStyles}">${s.charAt(0).toUpperCase() + s.slice(1)}</a>`
        })
        .join('')
}

function buildKeyRows(keys: schema.Key[]): string {
    if (keys.length === 0) {
        return buildEmptyState()
    }

    return keys
        .map(k => {
            const usedTime = formatUsedTime(k.createdAt)
            const totalCoolingTime = formatCoolingTime(k.totalCoolingSeconds)
            const modelCoolingsJson = JSON.stringify(k.modelCoolings || {}).replace(/"/g, '&quot;')

            return `
            <tr style="border-bottom: 0.5px solid var(--color-system-gray5); transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--color-quaternary-system-fill)'" onmouseout="this.style.backgroundColor='transparent'">
                <td style="padding: var(--spacing-md);">
                    <input type="checkbox" name="key_id" value="${k.id}" 
                           style="width: 16px; height: 16px; accent-color: var(--color-system-blue); border-radius: var(--radius-xs);">
                </td>
                <td style="padding: var(--spacing-md);">
                    ${buildCopyableKey(k.key)}
                </td>
                <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label); font-weight: var(--font-weight-medium);">${k.remark || ''}</td>
                <td style="padding: var(--spacing-md);">
                    <span style="font-size: 15px; color: var(--color-system-blue); cursor: pointer; font-weight: var(--font-weight-medium); padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); transition: background-color 0.2s ease;" 
                          onclick="showModelCoolings('${modelCoolingsJson}', '${k.key.substring(0, 20)}...')"
                          onmouseover="this.style.backgroundColor='var(--color-secondary-system-fill)'"
                          onmouseout="this.style.backgroundColor='transparent'"
                          title="Click to view model cooling details">${totalCoolingTime}</span>
                </td>
                <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-secondary-label); font-weight: var(--font-weight-medium);">${usedTime}</td>
            </tr>
        `
        })
        .join('')
}

// 构建性能统计卡片
function buildPerformanceCard(): string {
    return `
        <div class="apple-card group" style="padding: var(--spacing-lg); cursor: pointer;">
            <a href="/performance" style="display: block; text-decoration: none; color: inherit;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                        <div style="width: 56px; height: 56px; background: var(--color-secondary-system-background); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-system-blue);">
                            <svg style="width: 32px; height: 32px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                        </div>
                        <h3 style="font-size: 17px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0;">performance</h3>
                    </div>
                    <svg style="width: 20px; height: 20px; color: var(--color-secondary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </div>
            </a>
        </div>
    `
}

// 性能统计页面
function performancePage(): string {
    const performanceData = getPerformanceData()
    const content = `
        <div style="margin-bottom: var(--spacing-lg);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <nav style="display: flex; align-items: center; gap: var(--spacing-sm); font-size: 15px;">
                    <a href="/" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">Providers</a>
                    <svg style="width: 16px; height: 16px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                    <span style="color: var(--color-label); font-weight: var(--font-weight-semibold);">Performance</span>
                </nav>
                <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                    <button onclick="location.reload()" class="apple-btn-secondary" style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        刷新
                    </button>
                    <form method="POST" action="/performance" style="display: inline;">
                        <button type="submit" class="apple-btn-destructive" 
                                onclick="return confirm('确认清空所有性能统计数据？')"
                                style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; display: flex; align-items: center; gap: var(--spacing-xs);">
                            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                            清空数据
                        </button>
                    </form>
                    <form action="/logout" method="POST" style="display: inline;">
                        <button type="submit" class="apple-btn-secondary" style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; display: flex; align-items: center; gap: var(--spacing-xs);">
                            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 113-3h4a3 3 0 013 3v1"></path>
                            </svg>
                            退出登录
                        </button>
                    </form>
                </div>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: var(--spacing-lg); max-width: 1200px; min-width: 900px; margin: 0 auto;">
            ${buildPerformanceSummary(performanceData)}
            ${buildPerformanceTable(performanceData.functions)}
        </div>
        
        <script>
            function startCountdown() {
                const oldestTimestamp = ${performanceData.oldestTimestamp || 'null'};
                
                if (!oldestTimestamp) {
                    document.getElementById('countdown').textContent = '无数据，有新数据时将开始60分钟倒计时';
                    document.getElementById('countdown').style.color = 'var(--color-secondary-label)';
                    
                    // 每30秒检查一次是否有新数据产生
                    const checkForNewData = setInterval(() => {
                        // 简单重新加载页面来检查新数据
                        location.reload();
                    }, 30000);
                    
                    return;
                }
                
                const maxAgeMs = 3600000; // 1小时
                const clearTime = oldestTimestamp + maxAgeMs;
                
                function updateCountdown() {
                    const now = Date.now();
                    const remaining = clearTime - now;
                    
                    if (remaining <= 0) {
                        document.getElementById('countdown').textContent = '即将清理';
                        document.getElementById('countdown').style.color = 'var(--color-system-red)';
                        return;
                    }
                    
                    const minutes = Math.floor(remaining / 60000);
                    const seconds = Math.floor((remaining % 60000) / 1000);
                    
                    if (minutes > 0) {
                        document.getElementById('countdown').textContent = minutes + '分' + seconds + '秒后清理过期数据';
                    } else {
                        document.getElementById('countdown').textContent = seconds + '秒后清理过期数据';
                        document.getElementById('countdown').style.color = 'var(--color-system-orange)';
                    }
                }
                
                updateCountdown();
                setInterval(updateCountdown, 1000);
            }
            
            // 页面加载后启动倒计时
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startCountdown);
            } else {
                startCountdown();
            }
        </script>
    `
    return layout(content)
}

// 智能时间格式化函数
function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms.toFixed(1)}ms`
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`
    } else {
        return `${(ms / 60000).toFixed(1)}min`
    }
}

// 获取性能数据
function getPerformanceData() {
    const reportText = perfMonitor.getReport()
    const memoryStats = perfMonitor.getMemoryStats()

    // 解析性能报告
    const lines = reportText.split('\n').filter(line => line.trim())
    const functions = []
    let totalTime = 0
    let totalFunctions = 0

    for (const line of lines) {
        if (line.includes(': ') && line.includes('ms (') && line.includes('% total')) {
            const match = line.match(/^(.*?): ([\d.]+)ms \(([\d.]+)% total, (\d+)x calls, avg: ([\d.]+)ms\)$/)
            if (match) {
                const [, name, duration, percentage, callCount, avgTime] = match
                functions.push({
                    name: name.trim(),
                    duration: parseFloat(duration),
                    percentage: parseFloat(percentage),
                    callCount: parseInt(callCount),
                    avgTime: parseFloat(avgTime)
                })
            }
        } else if (line.includes('Total Measured Time:')) {
            const match = line.match(/Total Measured Time: ([\d.]+)ms/)
            if (match) {
                totalTime = parseFloat(match[1])
            }
        } else if (line.includes('Functions Tracked:')) {
            const match = line.match(/Functions Tracked: (\d+)/)
            if (match) {
                totalFunctions = parseInt(match[1])
            }
        }
    }

    return {
        totalTime,
        totalFunctions,
        functions,
        memoryStats,
        timestamp: Date.now(),
        oldestTimestamp: perfMonitor.getOldestDataTimestamp()
    }
}

// 构建性能摘要卡片
function buildPerformanceSummary(data: ReturnType<typeof getPerformanceData>): string {
    const { totalTime, totalFunctions, functions, memoryStats } = data
    const avgCallTime =
        functions.length > 0 ? (totalTime / functions.reduce((sum, f) => sum + f.callCount, 0)).toFixed(1) : '0'
    const slowestFunction = functions.length > 0 ? functions[0] : null

    return `
        <div class="apple-card" style="padding: var(--spacing-lg);">
            <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div style="padding: var(--spacing-sm); background: var(--color-secondary-system-background); border-radius: var(--radius-lg); border: 0.5px solid var(--color-system-gray4);">
                    <svg style="width: 20px; height: 20px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                </div>
                <h2 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0;">Performance Overview</h2>
            </div>
            
            <div class="performance-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--spacing-lg);">
                <style>
                    @media (max-width: 768px) {
                        .performance-grid {
                            grid-template-columns: repeat(2, 1fr) !important;
                        }
                    }
                </style>
                <div style="text-align: center; padding: var(--spacing-lg); background: var(--color-secondary-system-background); border-radius: var(--radius-xl); border: 0.5px solid var(--color-system-gray4);">
                    <div style="font-size: 32px; font-weight: var(--font-weight-bold); color: var(--color-system-blue); margin-bottom: var(--spacing-sm);">${formatDuration(totalTime)}</div>
                    <div style="font-size: 15px; color: var(--color-secondary-label); font-weight: var(--font-weight-medium);">Total Measured Time</div>
                </div>
                
                <div style="text-align: center; padding: var(--spacing-lg); background: var(--color-secondary-system-background); border-radius: var(--radius-xl); border: 0.5px solid var(--color-system-gray4);">
                    <div style="font-size: 32px; font-weight: var(--font-weight-bold); color: var(--color-system-green); margin-bottom: var(--spacing-sm);">${totalFunctions}</div>
                    <div style="font-size: 15px; color: var(--color-secondary-label); font-weight: var(--font-weight-medium);">Functions Tracked</div>
                </div>
                
                <div style="text-align: center; padding: var(--spacing-lg); background: var(--color-secondary-system-background); border-radius: var(--radius-xl); border: 0.5px solid var(--color-system-gray4);">
                    <div style="font-size: 32px; font-weight: var(--font-weight-bold); color: var(--color-system-orange); margin-bottom: var(--spacing-sm);">${formatDuration(parseFloat(avgCallTime))}</div>
                    <div style="font-size: 15px; color: var(--color-secondary-label); font-weight: var(--font-weight-medium);">Avg Call Time</div>
                </div>
                
                <div style="text-align: center; padding: var(--spacing-lg); background: var(--color-secondary-system-background); border-radius: var(--radius-xl); border: 0.5px solid var(--color-system-gray4);">
                    <div style="font-size: 18px; font-weight: var(--font-weight-bold); color: var(--color-system-purple); margin-bottom: var(--spacing-sm);">${slowestFunction ? slowestFunction.name : 'N/A'}</div>
                    <div style="font-size: 15px; color: var(--color-secondary-label); font-weight: var(--font-weight-medium);">Slowest Function</div>
                </div>
            </div>
            
            <div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 0.5px solid var(--color-system-gray5);">
                <div style="margin-bottom: var(--spacing-md);">
                    <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-bottom: var(--spacing-xs);">
                        <svg style="width: 16px; height: 16px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span style="font-size: 14px; color: var(--color-label); font-weight: var(--font-weight-medium);">监控说明</span>
                    </div>
                    <div style="font-size: 13px; color: var(--color-secondary-label); line-height: 1.4;">
                        <div style="margin-bottom: var(--spacing-xs);">
                            • <strong>数据范围</strong>：最近1小时的性能统计（重启后重置）
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            • <strong>自动清理</strong>：<span id="countdown" style="color: var(--color-system-blue); font-weight: var(--font-weight-medium);">计算中...</span>
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            • <strong>实时性</strong>：数据实时收集，页面刷新时更新显示
                        </div>
                        <div>
                            • <strong>性能阈值</strong>：单次调用超过500ms将触发性能警告
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--color-secondary-label);">
                    <span>Memory: ${memoryStats.entriesCount} entries, ${memoryStats.startTimesCount} start times</span>
                    <span>Status: ${memoryStats.isHealthy ? '健康' : '异常'}</span>
                    <span>Last updated: ${new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        </div>
    `
}

// 构建性能详细表格
function buildPerformanceTable(
    functions: Array<{ name: string; duration: number; percentage: number; callCount: number; avgTime: number }>
): string {
    if (functions.length === 0) {
        return `
            <div class="apple-card" style="padding: var(--spacing-3xl); text-align: center;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);">
                    <svg style="width: 48px; height: 48px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                    <p style="font-weight: var(--font-weight-medium); font-size: 17px; color: var(--color-secondary-label);">No performance data available</p>
                </div>
            </div>
        `
    }

    const tableRows = functions
        .map(
            func => `
        <tr style="border-bottom: 0.5px solid var(--color-system-gray5); transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--color-quaternary-system-fill)'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: var(--spacing-md); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 14px; color: var(--color-label); font-weight: var(--font-weight-medium);">${func.name}</td>
            <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label); font-weight: var(--font-weight-medium); text-align: right;">${func.duration.toFixed(1)}ms</td>
            <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label); text-align: right;">
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <div style="flex: 1; background: var(--color-system-gray5); height: 6px; border-radius: var(--radius-sm); overflow: hidden;">
                        <div style="width: ${func.percentage}%; height: 100%; background: var(--color-system-blue); transition: width 0.3s ease;"></div>
                    </div>
                    <span style="font-weight: var(--font-weight-medium); min-width: 40px;">${func.percentage.toFixed(1)}%</span>
                </div>
            </td>
            <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label); font-weight: var(--font-weight-medium); text-align: right;">${func.callCount}</td>
            <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label); font-weight: var(--font-weight-medium); text-align: right;">${func.avgTime.toFixed(1)}ms</td>
        </tr>
    `
        )
        .join('')

    return `
        <div class="apple-card" style="overflow: hidden;">
            <div style="padding: var(--spacing-lg); border-bottom: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
                <h3 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0;">Function Performance Details</h3>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; table-layout: fixed;">
                    <colgroup>
                        <col style="width: 35%;">
                        <col style="width: 15%;">
                        <col style="width: 25%;">
                        <col style="width: 10%;">
                        <col style="width: 15%;">
                    </colgroup>
                    <thead>
                        <tr style="background: var(--color-secondary-system-background); border-bottom: 0.5px solid var(--color-system-gray5);">
                            <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Function Name</th>
                            <th style="padding: var(--spacing-md); text-align: right; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</th>
                            <th style="padding: var(--spacing-md); text-align: right; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Percentage</th>
                            <th style="padding: var(--spacing-md); text-align: right; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Calls</th>
                            <th style="padding: var(--spacing-md); text-align: right; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Avg Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `
}
