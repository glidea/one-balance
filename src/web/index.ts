// Web UI 主处理器 - 重构后的简化版本

import * as keyService from '../service/key'
import * as util from '../util'
import type * as schema from '../service/d1/schema'
import { loginPage } from './templates/login'
import { layout } from './templates/layout'
import { PROVIDERS, getProviderConfig } from './config/providers'
import { CONFIG } from '../config/constants'
import { logger } from '../util/logger'
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
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--spacing-md); max-width: 1200px; margin: 0 auto;">
            ${providerCards.join('')}
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
