import * as keyService from './service/key'
import * as util from './util'
import type * as schema from './service/d1/schema'

const PROVIDER_CONFIGS = {
    'google-ai-studio': { color: 'from-red-400 to-yellow-400', icon: 'G', bgColor: 'from-red-50 to-yellow-50' },
    'google-vertex-ai': { color: 'from-blue-400 to-green-400', icon: '▲', bgColor: 'from-blue-50 to-green-50' },
    anthropic: { color: 'from-orange-400 to-red-400', icon: 'A', bgColor: 'from-orange-50 to-red-50' },
    'azure-openai': { color: 'from-blue-500 to-cyan-400', icon: '⊞', bgColor: 'from-blue-50 to-cyan-50' },
    'aws-bedrock': { color: 'from-yellow-500 to-orange-500', icon: '◆', bgColor: 'from-yellow-50 to-orange-50' },
    cartesia: { color: 'from-purple-400 to-pink-400', icon: 'C', bgColor: 'from-purple-50 to-pink-50' },
    'cerebras-ai': { color: 'from-gray-600 to-gray-800', icon: '◉', bgColor: 'from-gray-50 to-gray-100' },
    cohere: { color: 'from-green-400 to-teal-500', icon: '●', bgColor: 'from-green-50 to-teal-50' },
    deepseek: { color: 'from-indigo-500 to-purple-600', icon: '◈', bgColor: 'from-indigo-50 to-purple-50' },
    elevenlabs: { color: 'from-pink-400 to-rose-500', icon: '♫', bgColor: 'from-pink-50 to-rose-50' },
    grok: { color: 'from-gray-700 to-black', icon: 'X', bgColor: 'from-gray-50 to-gray-100' },
    groq: { color: 'from-orange-500 to-red-600', icon: '⚡', bgColor: 'from-orange-50 to-red-50' },
    huggingface: { color: 'from-yellow-400 to-amber-500', icon: '🤗', bgColor: 'from-yellow-50 to-amber-50' },
    mistral: { color: 'from-blue-600 to-indigo-700', icon: 'M', bgColor: 'from-blue-50 to-indigo-50' },
    openai: { color: 'from-emerald-400 to-teal-600', icon: '◯', bgColor: 'from-emerald-50 to-teal-50' },
    openrouter: { color: 'from-violet-500 to-purple-600', icon: '⟲', bgColor: 'from-violet-50 to-purple-50' },
    'perplexity-ai': { color: 'from-cyan-500 to-blue-600', icon: '?', bgColor: 'from-cyan-50 to-blue-50' },
    replicate: { color: 'from-slate-500 to-gray-600', icon: '⧉', bgColor: 'from-slate-50 to-gray-50' }
} as const

const PROVIDERS = Object.keys(PROVIDER_CONFIGS)

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/login' && request.method === 'POST') {
        return handleLogin(request, env)
    }

    if (pathname.startsWith('/keys') || pathname === '/') {
        return handleKeys(request, env)
    }

    return new Response('Not Found', { status: 404 })
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
    const formData = await request.formData()
    const key = formData.get('auth_key') as string

    if (util.isValidAuthKey(key, env.AUTH_KEY)) {
        const headers = new Headers()
        headers.set('Set-Cookie', `auth_key=${key}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2147483647`)
        headers.set('Location', '/keys')
        return new Response(null, { status: 302, headers })
    }

    return new Response('Invalid key', { status: 403 })
}

async function handleKeys(request: Request, env: Env): Promise<Response> {
    const authResult = checkAuth(request, env)
    if (authResult) {
        return authResult
    }

    const parseResult = parseKeysRequest(request)
    if (!parseResult.provider) {
        return new Response(providersPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    }

    if (request.method === 'POST') {
        return await handleKeysPost(request, env, parseResult)
    }

    return await handleKeysGet(env, parseResult)
}

function checkAuth(request: Request, env: Env): Response | null {
    const cookie = request.headers.get('Cookie')
    const authKey = cookie?.match(/auth_key=([^;]+)/)?.[1] as string

    if (!util.isValidAuthKey(authKey, env.AUTH_KEY)) {
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
        pageSize: 20,
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
    } else if (action === 'delete') {
        const keyIds = formData.getAll('key_id') as string[]
        await keyService.delKeys(env, keyIds)
    } else if (action === 'delete-all-blocked') {
        await keyService.delAllBlockedKeys(env, params.provider)
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
}

function layout(content: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>One Balance</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚖️</text></svg>">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .breathing-bg {
                background: linear-gradient(-45deg, #f8fafc, #e2e8f0, #cbd5e1, #f1f5f9);
                background-size: 400% 400%;
                animation: breathe 8s ease-in-out infinite;
            }
            
            @keyframes breathe {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            
            .glass-card {
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%);
                border: 1px solid rgba(255, 255, 255, 0.4);
                box-shadow: 
                    0 8px 32px rgba(0, 0, 0, 0.08),
                    0 4px 16px rgba(0, 0, 0, 0.04),
                    inset 0 1px 0 rgba(255, 255, 255, 0.6);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .glass-card:hover {
                transform: translateY(-4px) scale(1.01);
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.12),
                    0 8px 24px rgba(0, 0, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8);
            }
            
            .glass-card-warm {
                background: linear-gradient(135deg, rgba(254, 249, 239, 0.9) 0%, rgba(255, 251, 235, 0.7) 100%);
                border: 1px solid rgba(251, 191, 36, 0.2);
                box-shadow: 
                    0 8px 32px rgba(251, 191, 36, 0.08),
                    0 4px 16px rgba(251, 191, 36, 0.04),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8);
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #2563eb 100%);
                box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            
            .btn-primary::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }
            
            .btn-primary:hover::before {
                left: 100%;
            }
            
            .btn-primary:hover {
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
                transform: translateY(-2px);
                box-shadow: 0 12px 32px rgba(59, 130, 246, 0.4);
            }
            
            .input-field {
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 250, 252, 0.6) 100%);
                border: 1px solid rgba(203, 213, 225, 0.4);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
                transition: all 0.3s ease;
            }
            
            .input-field:focus {
                background: rgba(255, 255, 255, 0.95);
                border-color: #3b82f6;
                box-shadow: 
                    0 0 0 3px rgba(59, 130, 246, 0.1),
                    inset 0 2px 4px rgba(0, 0, 0, 0.02),
                    0 4px 12px rgba(59, 130, 246, 0.1);
            }
            
            .floating-element {
                animation: float 6s ease-in-out infinite;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
            }
            
            .pulse-glow {
                animation: pulse-glow 3s ease-in-out infinite;
            }
            
            @keyframes pulse-glow {
                0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
                50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.2); }
            }

            .copy-success {
                animation: copy-flash 0.6s ease-out;
            }
            
            @keyframes copy-flash {
                0% { background-color: rgba(34, 197, 94, 0.1); }
                50% { background-color: rgba(34, 197, 94, 0.2); }
                100% { background-color: transparent; }
            }
        </style>
        <script>
            function copyToClipboard(text, element) {
                navigator.clipboard.writeText(text).then(function() {
                    const tooltip = element.parentElement.querySelector('.copy-tooltip');
                    const originalBg = element.className;
                    
                    element.className = originalBg.replace('bg-gray-100', 'bg-green-100').replace('border-gray-200', 'border-green-300');
                    tooltip.classList.remove('opacity-0');
                    tooltip.classList.add('opacity-100');
                    
                    setTimeout(function() {
                        element.className = originalBg;
                        tooltip.classList.remove('opacity-100');
                        tooltip.classList.add('opacity-0');
                    }, 1500);
                }).catch(function() {
                    console.error('Failed to copy text');
                });
            }
        </script>
    </head>
    <body class="breathing-bg min-h-screen text-gray-900 flex flex-col">
        <main class="container mx-auto mt-12 px-6 max-w-7xl flex-grow">
            ${content}
        </main>
        <footer class="text-center py-12 text-sm text-gray-600 space-y-3">
            <p>
                <a href="https://github.com/glidea/one-balance" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition-colors duration-300 font-medium">
                    one-balance on GitHub
                </a>
            </p>
            <p>
                <a href="https://github.com/glidea/zenfeed" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition-colors duration-300 font-medium">
                    zenfeed &mdash; Make RSS 📰 great again with AI 🧠✨!!
                </a>
            </p>
        </footer>
    </body>
    </html>
    `
}

function loginPage(): string {
    const content = `
    <div class="flex items-center justify-center min-h-[70vh] relative">
        <div class="absolute top-20 left-1/4 w-32 h-32 bg-blue-200/30 rounded-full blur-3xl floating-element"></div>
        <div class="absolute bottom-20 right-1/4 w-40 h-40 bg-amber-200/30 rounded-full blur-3xl floating-element" style="animation-delay: -3s;"></div>
        
        <div class="max-w-md w-full mx-6 relative z-10">
            <div class="text-center mb-16">
                <div class="pulse-glow inline-block p-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl mb-6">
                    <h1 class="text-6xl font-bold">⚖️</h1>
                </div>
                <h2 class="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">One Balance</h2>
                <p class="text-gray-600 text-lg">Manage your API keys with perfect balance</p>
            </div>
            
            <div class="glass-card-warm rounded-3xl p-10 transition-all duration-500 hover:scale-[1.02]">
                <form action="/login" method="POST" class="space-y-8">
                    <div>
                        <label for="auth_key" class="block text-gray-800 text-sm font-bold mb-4 tracking-wide">Authentication Key</label>
                        <input type="password" id="auth_key" name="auth_key" 
                               class="input-field w-full px-5 py-4 rounded-2xl text-gray-900 placeholder-gray-500 focus:outline-none text-base font-medium" 
                               placeholder="Enter your auth key" required>
                    </div>
                    <button type="submit" class="btn-primary w-full py-4 px-6 text-white font-bold rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-200 text-base tracking-wide">
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    </div>
    `
    return layout(content)
}

function providersPage(): string {
    const providerLinks = PROVIDERS.map((p, index) => {
        const config = PROVIDER_CONFIGS[p as keyof typeof PROVIDER_CONFIGS]
        return `
            <div class="glass-card rounded-3xl p-8 transition-all duration-500 hover:cursor-pointer group hover:shadow-2xl" style="animation-delay: ${index * 0.1}s;">
                <a href="/keys/${p}?status=active" class="block">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-5">
                            <div class="relative">
                                <div class="w-14 h-14 bg-gradient-to-br ${config.bgColor} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-lg">
                                    <div class="w-8 h-8 bg-gradient-to-br ${config.color} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-inner">
                                        ${config.icon}
                                    </div>
                                </div>
                                <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br ${config.color} rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors duration-300 mb-1">${p}</h3>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-gradient-to-r ${config.color} rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
                            <svg class="w-6 h-6 text-gray-400 transform transition-all duration-300 group-hover:translate-x-2 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </div>
                    </div>
                </a>
            </div>
        `
    }).join('')

    const content = `
        <div class="text-center mb-20 relative">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-8 w-64 h-32 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl"></div>
            <h1 class="text-6xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-gray-900 bg-clip-text text-transparent mb-6 relative">Select Provider</h1>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 max-w-7xl mx-auto">
            ${providerLinks}
        </div>
    `
    return layout(content)
}

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
    `

    return layout(content)
}

function buildBreadcrumb(provider: string): string {
    return `
        <div class="mb-8">
            <nav class="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                <a href="/" class="hover:text-blue-600 transition-colors duration-200 font-medium">Providers</a>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
                <span class="text-gray-900 font-semibold">${provider}</span>
            </nav>
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
        <div class="glass-card bg-white/80 rounded-3xl shadow-xl border border-gray-200 overflow-hidden mb-8 max-w-5xl mx-auto backdrop-blur-xl">
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
            const activeClasses = isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-600'
                : 'bg-white/80 text-gray-800 hover:bg-white border border-gray-300 hover:border-gray-400'
            const link = buildPageLink(provider, s, q, 1, 20, sortBy, sortOrder)
            return `<a href="${link}" class="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeClasses}">${s.charAt(0).toUpperCase() + s.slice(1)}</a>`
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
            <tr class="group hover:bg-blue-100/60 even:bg-slate-100/40 odd:bg-white/60 transition-all duration-300 hover:shadow-md backdrop-blur-sm border-b border-gray-300/50">
                <td class="p-4">
                    <input type="checkbox" name="key_id" value="${k.id}" 
                           class="h-4 w-4 text-blue-600 bg-white border-gray-500 rounded focus:ring-blue-500 focus:ring-2 transition-colors backdrop-blur-sm">
                </td>
                <td class="p-4">
                    ${buildCopyableKey(k.key)}
                </td>
                <td class="p-4 text-sm text-slate-700 font-medium">${k.remark || ''}</td>
                <td class="p-4">
                    <span class="text-sm text-slate-800 cursor-pointer hover:text-blue-700 transition-colors duration-200 font-medium px-2 py-1 rounded-md hover:bg-blue-100/80 backdrop-blur-sm" 
                          onclick="showModelCoolings('${modelCoolingsJson}', '${k.key.substring(0, 20)}...')"
                          title="Click to view model cooling details">${totalCoolingTime}</span>
                </td>
                <td class="p-4 text-sm text-slate-700 font-medium">${usedTime}</td>
            </tr>
        `
        })
        .join('')
}

function buildEmptyState(): string {
    return `
        <tr>
            <td colspan="4" class="text-center p-12 text-gray-700 bg-slate-100/40 backdrop-blur-sm">
                <div class="flex flex-col items-center gap-3">
                    <svg class="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                    </svg>
                    <p class="font-medium">No keys found</p>
                </div>
            </td>
        </tr>
    `
}

function buildCopyableKey(key: string): string {
    const displayKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
    return `
        <div class="relative inline-block">
            <code class="px-3 py-2 bg-slate-200/80 border border-slate-300/70 rounded-lg text-sm font-mono text-slate-900 cursor-pointer hover:bg-slate-300/80 hover:border-slate-400/70 transition-all duration-200 inline-block group-hover:shadow-sm backdrop-blur-sm"
                  onclick="copyToClipboard('${key.replace(/'/g, "\\'")}', this)"
                  title="Click to copy">
                <span class="font-mono">${displayKey}</span>
            </code>
            <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-emerald-700 text-white text-xs px-2 py-1 rounded opacity-0 pointer-events-none transition-opacity duration-300 whitespace-nowrap copy-tooltip backdrop-blur-sm">
                Copied!
            </div>
        </div>
    `
}

function buildPaginationControls(
    provider: string,
    currentStatus: string,
    q: string,
    page: number,
    pageSize: number,
    total: number,
    sortBy: string,
    sortOrder: string
): string {
    const numPages = Math.ceil(total / pageSize)
    if (numPages <= 1) {
        return ''
    }

    const pageNumbers = generatePageNumbers(page, numPages)
    const prevPage = Math.max(1, page - 1)
    const nextPage = Math.min(numPages, page + 1)
    const prevDisabled = page <= 1
    const nextDisabled = page >= numPages

    const items = [
        buildPaginationButton('prev', prevPage, prevDisabled, provider, currentStatus, q, sortBy, sortOrder),
        ...pageNumbers.map(p => buildPageNumberButton(p, page, provider, currentStatus, q, sortBy, sortOrder)),
        buildPaginationButton('next', nextPage, nextDisabled, provider, currentStatus, q, sortBy, sortOrder)
    ]

    return items.join('')
}

function generatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
    const window = 2
    const pagesToShow = new Set<number>()

    pagesToShow.add(1)
    pagesToShow.add(totalPages)

    for (let i = Math.max(1, currentPage - window); i <= Math.min(totalPages, currentPage + window); i++) {
        pagesToShow.add(i)
    }

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b)
    const pageItems: (number | string)[] = []
    let lastPage = 0

    for (const p of sortedPages) {
        if (lastPage > 0 && p > lastPage + 1) {
            pageItems.push('...')
        }
        pageItems.push(p)
        lastPage = p
    }

    return pageItems
}

function buildPaginationButton(
    type: 'prev' | 'next',
    targetPage: number,
    disabled: boolean,
    provider: string,
    status: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    const icon =
        type === 'prev'
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'

    const link = buildPageLink(provider, status, q, targetPage, 20, sortBy, sortOrder)

    const baseClasses = 'p-2 rounded-lg text-sm font-medium transition-all duration-200'
    const disabledClasses = 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300 pointer-events-none'
    const enabledClasses =
        'bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-sm'

    return `
        <a href="${disabled ? '#' : link}" 
                class="${baseClasses} ${disabled ? disabledClasses : enabledClasses}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${icon}
            </svg>
        </a>
    `
}

function buildPageNumberButton(
    pageItem: number | string,
    currentPage: number,
    provider: string,
    status: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    if (typeof pageItem === 'string') {
        return `<span class="px-3 py-2 text-sm font-medium text-gray-500">...</span>`
    }

    const isCurrent = pageItem === currentPage
    const link = buildPageLink(provider, status, q, pageItem, 20, sortBy, sortOrder)

    const baseClasses = 'px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200'
    const currentClasses =
        'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-600 pointer-events-none'
    const otherClasses =
        'bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-sm'

    return `
        <a href="${isCurrent ? '#' : link}" 
                class="${baseClasses} ${isCurrent ? currentClasses : otherClasses}">
            ${pageItem}
        </a>
    `
}

function buildPageLink(
    provider: string,
    status: string,
    q: string,
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string
): string {
    const params = new URLSearchParams()
    params.set('status', status)
    if (q) {
        params.set('q', q)
    }
    if (sortBy) {
        params.set('sort_by', sortBy)
        params.set('sort_order', sortOrder)
    }
    if (page > 1) {
        params.set('page', String(page))
    }
    return `/keys/${provider}?${params.toString()}`
}

function formatUsedTime(createdAt: Date): string {
    const now = Date.now() / 1000
    const usedSeconds = now - createdAt.getTime() / 1000
    const days = Math.floor(usedSeconds / 86400)
    const hours = Math.floor((usedSeconds % 86400) / 3600)
    const minutes = Math.floor((usedSeconds % 3600) / 60)

    if (days > 0) {
        return `${days}d${hours}h`
    }
    if (hours > 0) {
        return `${hours}h${minutes}m`
    }
    return `${minutes}m`
}

function formatCoolingTime(totalSeconds: number): string {
    if (totalSeconds === 0) return '-'

    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)

    if (days > 0) {
        return `${days}d${hours}h`
    }
    if (hours > 0) {
        return `${hours}h${minutes}m`
    }
    return `${minutes}m`
}

function buildTableHeader(
    provider: string,
    currentStatus: string,
    q: string,
    statusTabs: string,
    sortBy: string,
    sortOrder: string
): string {
    const deleteAllButton =
        currentStatus === 'blocked'
            ? `
        <button type="submit" name="action" value="delete-all-blocked"
                class="px-4 py-2.5 bg-red-800 hover:bg-red-900 text-white font-semibold rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-800/25 hover:-translate-y-0.5 border border-red-800">
            Delete ALL
        </button>
    `
            : ''

    return `
        <div class="p-6 border-b border-gray-200/60 bg-white/30 backdrop-blur-sm">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div class="flex gap-2">${statusTabs}</div>
                    <div class="flex items-center">
                        <div class="relative">
                            <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                            <input form="search-form" type="search" name="q" value="${q}" 
                                   placeholder="Search keys..." 
                                   class="input-field w-64 pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none text-sm shadow-sm">
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="submit" name="action" value="delete" 
                            class="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-600/25 hover:-translate-y-0.5 border border-red-600">
                        Delete Selected
                    </button>
                    ${deleteAllButton}
                </div>
            </div>
        </div>
    `
}

function getSortParamsForNextLink(column: string, currentSortBy: string, currentSortOrder: string) {
    let nextSortOrder = 'desc'
    if (currentSortBy === column) {
        nextSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc'
    }
    return { sortBy: column, sortOrder: nextSortOrder }
}

function buildTableContent(
    keyRows: string,
    provider: string,
    currentStatus: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    const coolingSortParams = getSortParamsForNextLink('totalCoolingSeconds', sortBy, sortOrder)
    const coolingLink = buildPageLink(
        provider,
        currentStatus,
        q,
        1,
        20,
        coolingSortParams.sortBy,
        coolingSortParams.sortOrder
    )

    const usedTimeSortParams = getSortParamsForNextLink('createdAt', sortBy, sortOrder)
    const usedTimeLink = buildPageLink(
        provider,
        currentStatus,
        q,
        1,
        20,
        usedTimeSortParams.sortBy,
        usedTimeSortParams.sortOrder
    )

    return `
        <div class="overflow-x-auto">
            <table class="w-full table-fixed">
                <colgroup>
                    <col class="w-12">
                    <col class="w-64">
                    <col class="w-48">
                    <col class="w-32">
                    <col class="w-24">
                </colgroup>
                <thead>
                    <tr class="bg-gradient-to-r from-slate-100/90 to-gray-100/90 border-b border-gray-400/80 backdrop-blur-sm">
                        <th class="p-4 text-left">
                            <input type="checkbox" 
                                   onchange="document.querySelectorAll('[name=key_id]').forEach(c => c.checked = this.checked)" 
                                   class="h-4 w-4 text-blue-600 bg-white border-gray-500 rounded focus:ring-blue-500 transition-colors backdrop-blur-sm">
                        </th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">API Key</th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">Remark</th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">
                            <a href="${coolingLink}" class="flex items-center gap-2 hover:text-blue-700 transition-colors duration-200">
                                <span>Cooling Time</span>
                                ${getSortIcon('totalCoolingSeconds', sortBy, sortOrder)}
                            </a>
                        </th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">
                            <a href="${usedTimeLink}" class="flex items-center gap-2 hover:text-blue-700 transition-colors duration-200">
                                <span>Used Time</span>
                                ${getSortIcon('createdAt', sortBy, sortOrder)}
                            </a>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-300/60">
                    ${keyRows}
                </tbody>
            </table>
        </div>
    `
}

function buildTableFooter(total: number, paginationControls: string): string {
    if (total === 0) {
        return ''
    }

    if (!paginationControls) {
        return `
        <div class="flex justify-center items-center p-6 border-t border-gray-300/80 bg-gray-100/60 backdrop-blur-sm">
            <div class="px-4 py-2 rounded-xl bg-white/90 text-gray-800 text-sm font-semibold border border-gray-300/80 shadow-sm backdrop-blur-sm">
                ${total}
            </div>
        </div>
    `
    }

    return `
        <div class="flex justify-center items-center p-6 border-t border-gray-300/80 bg-gray-100/60 backdrop-blur-sm">
            <div class="flex items-center gap-2 p-3 bg-white/90 rounded-xl border border-gray-300/80 shadow-sm backdrop-blur-sm">
                ${paginationControls}
                <div class="h-6 w-px bg-gray-300/80"></div>
                <div class="px-3 text-gray-600 text-sm font-semibold">
                    ${total}
                </div>
            </div>
        </div>
    `
}

function buildSearchForm(provider: string, currentStatus: string): string {
    return `
        <form id="search-form" method="GET" action="/keys/${provider}" class="hidden">
            <input type="hidden" name="status" value="${currentStatus}">
        </form>
    `
}

function buildAddKeysForm(
    provider: string,
    currentStatus: string,
    q: string,
    page: number,
    sortBy: string,
    sortOrder: string
): string {
    return `
        <div class="glass-card bg-white/80 rounded-3xl shadow-xl p-6 border border-gray-200 max-w-5xl mx-auto">
            <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-blue-100 rounded-xl border border-blue-200">
                    <svg class="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                </div>
                <h2 class="text-xl font-bold text-gray-900">Add New Keys</h2>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="add">
                <div class="mb-6">
                    <label class="block text-gray-800 text-sm font-semibold mb-3">API Keys</label>
                    <textarea name="keys" 
                              class="input-field w-full p-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none font-mono text-sm resize-none shadow-sm" 
                              rows="4" 
                              placeholder="Enter API keys, one per line or separated by commas"></textarea>
                </div>
                <div class="mb-6">
                    <label class="block text-gray-800 text-sm font-semibold mb-3">Remark</label>
                    <input name="remark"
                              class="input-field w-full p-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none text-sm shadow-sm"
                              placeholder="Enter remark for these keys (optional)"/>
                </div>
                <div class="flex justify-end">
                    <button type="submit" 
                            formaction="/keys/${provider}${buildPageLink(provider, currentStatus, q, page, 20, sortBy, sortOrder)}" 
                            class="btn-primary px-6 py-3 text-white font-semibold rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200">
                        Add Keys
                    </button>
                </div>
            </form>
        </div>
    `
}

function buildModelCoolingsModal(): string {
    return `
        <div id="modelCoolingsModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm hidden items-center justify-center z-50" onclick="closeModal(event)">
            <div class="glass-card bg-white rounded-3xl shadow-2xl border border-gray-200 max-w-2xl w-full mx-6 max-h-[80vh] overflow-hidden" onclick="event.stopPropagation()">
                <div class="p-6 border-b border-gray-200 bg-white/80">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xl font-bold text-gray-900">Model Cooling Details</h3>
                        <button onclick="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <p class="text-sm text-gray-600 mt-2">Key: <span id="modalKeyName" class="font-mono"></span></p>
                </div>
                <div class="p-6 overflow-y-auto max-h-96">
                    <div id="modelCoolingsTable"></div>
                </div>
            </div>
        </div>
    `
}

function buildModalScript(): string {
    return `
        <script>
            function showModelCoolings(modelCoolingsJson, keyName) {
                const modalKeyName = document.getElementById('modalKeyName');
                const modalTable = document.getElementById('modelCoolingsTable');
                const modal = document.getElementById('modelCoolingsModal');
                
                modalKeyName.textContent = keyName;
                
                try {
                    const modelCoolings = JSON.parse(modelCoolingsJson);
                    const now = Date.now() / 1000;
                    
                    if (Object.keys(modelCoolings).length === 0) {
                        modalTable.innerHTML = '<p class="text-gray-600 text-center py-8">No model cooling data available</p>';
                    } else {
                        const rows = Object.entries(modelCoolings).map(([model, cooling]) => {
                            const isAvailable = cooling.end_at < now;
                            const remainingTime = isAvailable ? '-' : formatTime(cooling.end_at - now);
                            const totalTime = formatTime(cooling.total_seconds);
                            const statusClass = isAvailable ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
                            const status = isAvailable ? 'available' : 'cooling';
                            
                            return \`
                                <tr class="border-b border-gray-200">
                                    <td class="p-3 font-mono text-sm">\${model}</td>
                                    <td class="p-3 text-sm">\${totalTime}</td>
                                    <td class="p-3 text-sm">\${remainingTime}</td>
                                    <td class="p-3">
                                        <span class="px-2 py-1 rounded-lg text-xs font-medium \${statusClass}">\${status}</span>
                                    </td>
                                </tr>
                            \`;
                        }).join('');
                        
                        modalTable.innerHTML = \`
                            <table class="w-full">
                                <thead>
                                    <tr class="border-b border-gray-200 bg-gray-50">
                                        <th class="p-3 text-left font-semibold text-gray-900">Model</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Total Cooling Time</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Remaining Time</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${rows}
                                </tbody>
                            </table>
                        \`;
                    }
                } catch (e) {
                    modalTable.innerHTML = '<p class="text-red-600 text-center py-8">Error parsing model cooling data</p>';
                }
                
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            
            function closeModal(event) {
                if (!event || event.target === event.currentTarget) {
                    const modal = document.getElementById('modelCoolingsModal');
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
            }
            
            function formatTime(seconds) {
                if (seconds <= 0) return '-';
                
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                
                if (days > 0) {
                    return \`\${days}d\${hours}h\`;
                }
                if (hours > 0) {
                    return \`\${hours}h\${minutes}m\`;
                }
                return \`\${minutes}m\`;
            }
        </script>
    `
}

function getSortIcon(column: string, sortBy: string, sortOrder: string): string {
    if (sortBy !== column) {
        return `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
        </svg>`
    }
    return sortOrder === 'asc'
        ? `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4"></path>
        </svg>`
        : `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H7"></path>
        </svg>`
}
