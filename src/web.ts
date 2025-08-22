import * as keyService from './service/key'
import * as util from './util'
import type * as schema from './service/d1/schema'

const PROVIDER_CONFIGS = {
    'google-ai-studio': {
        color: 'from-red-400 to-yellow-400',
        iconUrl: 'https://ai.google.dev/static/site-assets/images/share.png',
        bgColor: 'from-red-50 to-yellow-50'
    },
    'google-vertex-ai': {
        color: 'from-blue-400 to-green-400',
        iconUrl: 'https://cloud.google.com/_static/cloud/images/favicons/onecloud/super_cloud.png',
        bgColor: 'from-blue-50 to-green-50'
    },
    anthropic: {
        color: 'from-orange-400 to-red-400',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Anthropic_logo.svg',
        bgColor: 'from-orange-50 to-red-50'
    },
    'azure-openai': {
        color: 'from-blue-500 to-cyan-400',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
        bgColor: 'from-blue-50 to-cyan-50'
    },
    'aws-bedrock': {
        color: 'from-yellow-500 to-orange-500',
        iconUrl: 'https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico',
        bgColor: 'from-yellow-50 to-orange-50'
    },
    cartesia: { color: 'from-purple-400 to-pink-400', iconUrl: '', bgColor: 'from-purple-50 to-pink-50' },
    cerebras: {
        color: 'from-gray-600 to-gray-800',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Cerebras_logo.svg',
        bgColor: 'from-gray-50 to-gray-100'
    },
    cohere: {
        color: 'from-green-400 to-teal-500',
        iconUrl: 'https://cohere.com/favicon.ico',
        bgColor: 'from-green-50 to-teal-50'
    },
    deepseek: {
        color: 'from-indigo-500 to-purple-600',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/DeepSeek_logo.svg',
        bgColor: 'from-indigo-50 to-purple-50'
    },
    elevenlabs: { color: 'from-pink-400 to-rose-500', iconUrl: '', bgColor: 'from-pink-50 to-rose-50' },
    grok: {
        color: 'from-gray-700 to-black',
        iconUrl: 'https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/grok-icon.svg',
        bgColor: 'from-gray-50 to-gray-100'
    },
    groq: {
        color: 'from-orange-500 to-red-600',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Groq_logo.svg',
        bgColor: 'from-orange-50 to-red-50'
    },
    huggingface: {
        color: 'from-yellow-400 to-amber-500',
        iconUrl: 'https://huggingface.co/favicon.ico',
        bgColor: 'from-yellow-50 to-amber-50'
    },
    mistral: {
        color: 'from-blue-600 to-indigo-700',
        iconUrl: 'https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/mistral-ai-icon.svg',
        bgColor: 'from-blue-50 to-indigo-50'
    },
    openai: {
        color: 'from-emerald-400 to-teal-600',
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',
        bgColor: 'from-emerald-50 to-teal-50'
    },
    openrouter: {
        color: 'from-violet-500 to-purple-600',
        iconUrl: 'https://openrouter.ai/favicon.ico',
        bgColor: 'from-violet-50 to-purple-50'
    },
    'perplexity-ai': {
        color: 'from-cyan-500 to-blue-600',
        iconUrl: 'https://www.perplexity.ai/favicon.svg',
        bgColor: 'from-cyan-50 to-blue-50'
    },
    replicate: { color: 'from-slate-500 to-gray-600', iconUrl: '', bgColor: 'from-slate-50 to-gray-50' }
} as const

const PROVIDERS = Object.keys(PROVIDER_CONFIGS)

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/login' && request.method === 'POST') {
        return handleLogin(request, env)
    }

    if (pathname === '/logout' && request.method === 'POST') {
        return handleLogout(request)
    }

    if (pathname === '/login' && request.method === 'GET') {
        return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
    }

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
        headers.set('Set-Cookie', `auth_key=${key}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2147483647`)
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
            :root {
                /* Apple System Colors */
                --color-system-blue: #007AFF;
                --color-system-green: #34C759;
                --color-system-red: #FF3B30;
                --color-system-orange: #FF9500;
                --color-system-yellow: #FFCC00;
                --color-system-purple: #AF52DE;
                --color-system-pink: #FF2D92;
                --color-system-teal: #64D2FF;
                --color-system-gray: #8E8E93;
                --color-system-gray2: #AEAEB2;
                --color-system-gray3: #C7C7CC;
                --color-system-gray4: #D1D1D6;
                --color-system-gray5: #E5E5EA;
                --color-system-gray6: #F2F2F7;
                
                /* Apple Semantic Colors */
                --color-label: #000000;
                --color-secondary-label: #3C3C43;
                --color-tertiary-label: #3C3C43;
                --color-quaternary-label: #3C3C43;
                --color-system-background: #FFFFFF;
                --color-secondary-system-background: #F2F2F7;
                --color-tertiary-system-background: #FFFFFF;
                --color-system-fill: #78788033;
                --color-secondary-system-fill: #78788028;
                --color-tertiary-system-fill: #7676801E;
                --color-quaternary-system-fill: #74748014;
                
                /* Apple Typography */
                --font-weight-ultralight: 100;
                --font-weight-thin: 200;
                --font-weight-light: 300;
                --font-weight-regular: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
                --font-weight-heavy: 800;
                --font-weight-black: 900;
                
                /* Apple Spacing (8pt grid) */
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 16px;
                --spacing-lg: 24px;
                --spacing-xl: 32px;
                --spacing-2xl: 40px;
                --spacing-3xl: 48px;
                
                /* Apple Corner Radius */
                --radius-xs: 4px;
                --radius-sm: 6px;
                --radius-md: 8px;
                --radius-lg: 12px;
                --radius-xl: 16px;
                --radius-2xl: 20px;
                --radius-3xl: 24px;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                background: var(--color-system-gray6);
                color: var(--color-label);
                line-height: 1.47059; /* Apple's standard line height */
                letter-spacing: -0.022em; /* Apple's standard letter spacing */
            }
            
            .apple-card {
                background: var(--color-system-background);
                border-radius: var(--radius-xl);
                border: 0.5px solid var(--color-system-gray5);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }
            
            .apple-card:hover {
                transform: translateY(-1px);
                box-shadow: 
                    0 4px 12px rgba(0, 0, 0, 0.15),
                    0 2px 6px rgba(0, 0, 0, 0.1);
            }
            
            .apple-card-warm {
                background: var(--color-tertiary-system-background);
                border: 0.5px solid var(--color-system-gray4);
                border-radius: var(--radius-xl);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
            }
            
            .apple-btn-primary {
                background: var(--color-system-blue);
                color: white;
                border: none;
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px; /* Apple's standard button font size */
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 122, 255, 0.3),
                    0 1px 2px rgba(0, 122, 255, 0.2);
            }
            
            .apple-btn-primary:hover {
                background: #0056b3; /* Darker blue on hover */
                transform: translateY(-0.5px);
                box-shadow: 
                    0 2px 6px rgba(0, 122, 255, 0.4),
                    0 1px 3px rgba(0, 122, 255, 0.3);
            }

            .apple-btn-primary:active {
                transform: translateY(0);
                background: #004494;
                box-shadow: 
                    0 1px 2px rgba(0, 122, 255, 0.3);
            }

            .apple-btn-secondary {
                background: var(--color-secondary-system-background);
                color: var(--color-system-blue);
                border: 0.5px solid var(--color-system-gray4);
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
            }

            .apple-btn-secondary:hover {
                background: var(--color-system-gray6);
                transform: translateY(-0.5px);
                box-shadow: 
                    0 2px 6px rgba(0, 0, 0, 0.15),
                    0 1px 3px rgba(0, 0, 0, 0.1);
            }

            .apple-btn-destructive {
                background: var(--color-system-red);
                color: white;
                border: none;
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(255, 59, 48, 0.3),
                    0 1px 2px rgba(255, 59, 48, 0.2);
            }

            .apple-btn-destructive:hover {
                background: #d70015;
                transform: translateY(-0.5px);
                box-shadow: 
                    0 2px 6px rgba(255, 59, 48, 0.4),
                    0 1px 3px rgba(255, 59, 48, 0.3);
            }
            
            .apple-input {
                background: var(--color-system-background);
                border: 0.5px solid var(--color-system-gray4);
                border-radius: var(--radius-md);
                color: var(--color-label);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
            }
            
            .apple-input:focus {
                background: var(--color-system-background);
                border-color: var(--color-system-blue);
                box-shadow: 
                    0 0 0 3px rgba(0, 122, 255, 0.1),
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
                outline: none;
            }

            .apple-input::placeholder {
                color: var(--color-tertiary-label);
            }
            
            .apple-table {
                background: var(--color-system-background);
                border-radius: var(--radius-xl);
                border: 0.5px solid var(--color-system-gray5);
                overflow: hidden;
            }

            .apple-table th {
                background: var(--color-secondary-system-background);
                color: var(--color-secondary-label);
                font-size: 13px;
                font-weight: var(--font-weight-semibold);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 0.5px solid var(--color-system-gray5);
                padding: var(--spacing-md);
            }

            .apple-table td {
                padding: var(--spacing-md);
                border-bottom: 0.5px solid var(--color-system-gray5);
                font-size: 15px;
                color: var(--color-label);
            }

            .apple-table tr:hover {
                background: var(--color-quaternary-system-fill);
            }

            .apple-table tr:last-child td {
                border-bottom: none;
            }

            .apple-tag {
                display: inline-flex;
                align-items: center;
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--color-secondary-system-fill);
                color: var(--color-secondary-label);
                border-radius: var(--radius-sm);
                font-size: 12px;
                font-weight: var(--font-weight-medium);
                border: 0.5px solid var(--color-system-gray4);
            }

            .apple-tag-success {
                background: rgba(52, 199, 89, 0.1);
                color: var(--color-system-green);
                border-color: rgba(52, 199, 89, 0.2);
            }

            .apple-tag-warning {
                background: rgba(255, 204, 0, 0.1);
                color: var(--color-system-yellow);
                border-color: rgba(255, 204, 0, 0.2);
            }

            .apple-tag-error {
                background: rgba(255, 59, 48, 0.1);
                color: var(--color-system-red);
                border-color: rgba(255, 59, 48, 0.2);
            }

            .apple-subtle-animation {
                animation: subtle-float 4s ease-in-out infinite;
            }
            
            @keyframes subtle-float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-2px); }
            }

            .apple-copy-feedback {
                animation: copy-success 0.4s ease-out;
            }
            
            @keyframes copy-success {
                0% { background-color: rgba(52, 199, 89, 0.1); }
                100% { background-color: transparent; }
            }

            @keyframes pulse-glow {
                0%, 100% { 
                    opacity: 0;
                    transform: scale(0.95);
                }
                50% { 
                    opacity: 0.6;
                    transform: scale(1.05);
                }
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
    <body class="min-h-screen flex flex-col">
        <main style="padding: var(--spacing-3xl) var(--spacing-lg); max-width: 1400px; margin: 0 auto; flex-grow: 1;">
            ${content}
        </main>
        <footer style="text-align: center; padding: var(--spacing-3xl) var(--spacing-lg); color: var(--color-secondary-label); font-size: 13px; line-height: 1.38462; border-top: 0.5px solid var(--color-system-gray5);">
            <p style="margin-bottom: var(--spacing-sm);">
                <a href="https://github.com/glidea/one-balance" target="_blank" rel="noopener noreferrer" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">
                    one-balance on GitHub
                </a>
            </p>
            <p>
                <a href="https://github.com/glidea/zenfeed" target="_blank" rel="noopener noreferrer" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">
                    zenfeed — Make RSS 📰 great again with AI 🧠✨!!
                </a>
            </p>
        </footer>
    </body>
    </html>
    `
}

function loginPage(): string {
    const content = `
    <div style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--spacing-lg); background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
        <!-- 背景装饰元素 -->
        <div style="position: absolute; top: 10%; left: 10%; width: 200px; height: 200px; background: linear-gradient(45deg, rgba(0, 122, 255, 0.1), rgba(52, 199, 89, 0.1)); border-radius: 50%; filter: blur(40px); animation: float 6s ease-in-out infinite;"></div>
        <div style="position: absolute; bottom: 10%; right: 15%; width: 300px; height: 300px; background: linear-gradient(45deg, rgba(255, 59, 48, 0.08), rgba(255, 204, 0, 0.08)); border-radius: 50%; filter: blur(50px); animation: float 8s ease-in-out infinite reverse;"></div>
        
        <div style="max-width: 1000px; width: 100%; position: relative; z-index: 10;">
            <!-- 宽屏登录卡片 -->
            <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: var(--radius-3xl); overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1), 0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6);">
                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; min-height: 500px;">
                    <!-- 左侧：品牌展示区域 -->
                    <div style="padding: var(--spacing-3xl); display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));">
                        <div class="login-logo" style="margin-bottom: var(--spacing-xl);">
                            <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--color-system-blue), #5856D6); border-radius: var(--radius-3xl); display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0, 122, 255, 0.3); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                                <div style="font-size: 56px; line-height: 1; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));">⚖️</div>
                            </div>
                        </div>
                        <h1 style="font-size: 48px; font-weight: var(--font-weight-bold); background: linear-gradient(135deg, var(--color-label), var(--color-secondary-label)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: var(--spacing-lg); line-height: 1.11111; letter-spacing: -0.02em; text-align: center;">One Balance</h1>
                        <p style="color: var(--color-secondary-label); font-size: 20px; line-height: 1.47; letter-spacing: -0.022em; text-align: center; margin-bottom: var(--spacing-xl); font-weight: var(--font-weight-medium);">智能管理您的 API 密钥<br>完美平衡负载</p>
                        
                        <!-- 特性列表 -->
                        <div style="display: flex; flex-direction: column; gap: var(--spacing-md); width: 100%; max-width: 320px;">
                            <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                                <div style="width: 8px; height: 8px; background: var(--color-system-blue); border-radius: 50%;"></div>
                                <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">多提供商支持</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                                <div style="width: 8px; height: 8px; background: var(--color-system-green); border-radius: 50%;"></div>
                                <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">智能负载均衡</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                                <div style="width: 8px; height: 8px; background: var(--color-system-purple); border-radius: 50%;"></div>
                                <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">实时状态监控</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 分隔线 -->
                    <div style="background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.1), transparent);"></div>
                    
                    <!-- 右侧：登录表单区域 -->
                    <div style="padding: var(--spacing-lg) var(--spacing-3xl); display: flex; flex-direction: column; justify-content: center;">
                        <div style="max-width: 600px; margin: 0 auto; width: 100%;">
                            <h2 style="font-size: 32px; font-weight: var(--font-weight-bold); color: var(--color-label); margin-bottom: var(--spacing-sm); text-align: center;">欢迎回来</h2>
                            <p style="color: var(--color-secondary-label); font-size: 17px; text-align: center; margin-bottom: var(--spacing-3xl);">请输入您的认证密钥以继续</p>
                            
                            <!-- 错误提示区域 -->
                            <div id="error-message" style="display: none; background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.2); border-radius: var(--radius-lg); padding: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                                    <svg style="width: 20px; height: 20px; color: var(--color-system-red); flex-shrink: 0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                    </svg>
                                    <span style="color: var(--color-system-red); font-size: 15px; font-weight: var(--font-weight-medium);" id="error-text">认证密钥无效，请检查后重试</span>
                                </div>
                            </div>
                            
                            <form action="/login" method="POST" style="display: flex; flex-direction: column; gap: var(--spacing-xl);" onsubmit="handleFormSubmit(event)">
                                <div style="position: relative;">
                                    <label for="auth_key" style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-md); line-height: 1.4; letter-spacing: -0.022em;">认证密钥</label>
                                    <div style="position: relative;">
                                        <div style="position: absolute; left: var(--spacing-lg); top: 50%; transform: translateY(-50%); z-index: 2;">
                                            <svg style="width: 20px; height: 20px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3.586l6.586-6.586A6 6 0 0121 9z"></path>
                                            </svg>
                                        </div>
                                        <input type="password" id="auth_key" name="auth_key" 
                                               class="login-input" 
                                               style="width: 100%; padding: var(--spacing-xl) var(--spacing-xl) var(--spacing-xl) 52px; font-size: 15px; border-radius: var(--radius-xl); border: 1.5px solid var(--color-system-gray4); background: var(--color-system-background); transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); font-weight: var(--font-weight-medium); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; letter-spacing: 0.3px; min-height: 56px;"
                                               placeholder="sk-1234567890abcdefghijklmnopqrstuvwxyz12345" 
                                               required
                                               onfocus="clearError(); this.style.borderColor='var(--color-system-blue)'; this.style.boxShadow='0 0 0 4px rgba(0, 122, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.1)'"
                                               onblur="this.style.borderColor='var(--color-system-gray4)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.06)'">
                                    </div>
                                </div>
                                
                                <button type="submit" id="signin-btn" style="width: 100%; padding: var(--spacing-lg) var(--spacing-xl); font-size: 17px; font-weight: var(--font-weight-semibold); border-radius: var(--radius-xl); background: linear-gradient(135deg, var(--color-system-blue), #5856D6); color: white; border: none; box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3), 0 2px 8px rgba(0, 122, 255, 0.2); transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); position: relative; overflow: hidden;" 
                                        onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 20px rgba(0, 122, 255, 0.4), 0 4px 12px rgba(0, 122, 255, 0.3)'"
                                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(0, 122, 255, 0.3), 0 2px 8px rgba(0, 122, 255, 0.2)'"
                                        onmousedown="this.style.transform='translateY(0)'"
                                        onmouseup="this.style.transform='translateY(-1px)'">
                                    <span id="btn-text">登录</span>
                                    <div id="btn-loading" style="display: none; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
                                        <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>
                                    </div>
                                </button>
                            </form>
                            
                            <!-- 底部提示 -->
                            <div style="text-align: center; margin-top: var(--spacing-xl); padding-top: var(--spacing-xl); border-top: 1px solid rgba(0, 0, 0, 0.06);">
                                <p style="color: var(--color-tertiary-label); font-size: 14px; margin: 0; font-weight: var(--font-weight-medium);">
                                    安全可靠的 API 密钥管理平台
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <style>
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .login-logo {
            animation: gentle-pulse 4s ease-in-out infinite;
        }
        
        @keyframes gentle-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        .login-input:focus::placeholder {
            opacity: 0.5;
            transform: translateX(5px);
            transition: all 0.3s ease;
        }
    </style>
    
    <script>
        function handleFormSubmit(event) {
            const btn = document.getElementById('signin-btn');
            const btnText = document.getElementById('btn-text');
            const btnLoading = document.getElementById('btn-loading');
            
            clearError();
            btnText.style.display = 'none';
            btnLoading.style.display = 'block';
            btn.disabled = true;
            btn.style.opacity = '0.9';
        }
        
        function showError(message) {
            const errorElement = document.getElementById('error-message');
            const errorText = document.getElementById('error-text');
            if (errorElement && errorText) {
                errorText.textContent = message;
                errorElement.style.display = 'block';
                errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        
        function clearError() {
            const errorElement = document.getElementById('error-message');
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }
        
        // 检查URL参数显示错误信息
        window.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const error = urlParams.get('error');
            if (error === 'invalid_key') {
                showError('认证密钥无效，请检查后重试');
            }
        });
    </script>
    `
    return layout(content)
}

async function providersPage(env: Env): Promise<string> {
    const providerLinks = await Promise.all(
        PROVIDERS.map(async (p, index) => {
            const config = PROVIDER_CONFIGS[p as keyof typeof PROVIDER_CONFIGS]

            // 检查该供应商是否有可用密钥
            const { keys } = await keyService.listKeys(env, p, 'active', '', 1, 1, '', '')
            const hasActiveKeys = keys.length > 0
            const statusColor = hasActiveKeys ? 'var(--color-system-green)' : 'var(--color-system-gray)'
            const statusOpacity = hasActiveKeys ? '1' : '0.6'

            return `
            <div class="apple-card group" style="padding: var(--spacing-lg); cursor: pointer;">
                <a href="/keys/${p}?status=active" style="display: block; text-decoration: none; color: inherit;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                            <div style="position: relative;">
                                <div style="width: 56px; height: 56px; background: var(--color-secondary-system-background); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; border: ${hasActiveKeys ? '2px solid var(--color-system-green)' : '0.5px solid var(--color-system-gray4)'}; transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); overflow: hidden; ${hasActiveKeys ? 'box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.2), 0 4px 16px rgba(52, 199, 89, 0.3);' : 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);'}">
                                    <img src="${config.iconUrl}" alt="${p} icon" style="width: 32px; height: 32px; object-fit: contain;" 
                                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div style="width: 32px; height: 32px; background: var(--color-system-blue); border-radius: var(--radius-md); display: none; align-items: center; justify-content: center; color: white; font-weight: var(--font-weight-bold); font-size: 14px;">
                                        ${p.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                                <!-- 状态脉冲动画（仅在有密钥时显示） -->
                                ${hasActiveKeys ? `<div style="position: absolute; inset: -6px; border-radius: var(--radius-xl); background: linear-gradient(135deg, rgba(52, 199, 89, 0.4), rgba(52, 199, 89, 0.2)); opacity: 0; animation: pulse-glow 2s ease-in-out infinite; z-index: -1;"></div>` : ''}
                            </div>
                            <div>
                                <h3 style="font-size: 17px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0; line-height: 1.29412; letter-spacing: -0.022em;">${p}</h3>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                            <svg style="width: 20px; height: 20px; color: var(--color-secondary-label); transition: all 0.2s ease;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </div>
                    </div>
                </a>
            </div>
        `
        })
    )

    const providerLinksHtml = providerLinks.join('')

    const content = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-3xl);">
            <div style="flex: 1;"></div>
            <div style="text-align: center; flex: 1;">
                <h1 style="font-size: 34px; font-weight: var(--font-weight-bold); color: var(--color-label); margin: 0; line-height: 1.17647; letter-spacing: 0.007em;">Select Provider</h1>
            </div>
            <div style="flex: 1; display: flex; justify-content: flex-end;">
                <form action="/logout" method="POST" style="display: inline;">
                    <button type="submit" class="apple-btn-secondary" style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                        </svg>
                        退出登录
                    </button>
                </form>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--spacing-md); max-width: 1200px; margin: 0 auto;">
            ${providerLinksHtml}
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
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
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

function buildEmptyState(): string {
    return `
        <tr>
            <td colspan="5" style="text-align: center; padding: var(--spacing-3xl); color: var(--color-secondary-label); background: var(--color-secondary-system-background);">
                <div style="display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);">
                    <svg style="width: 48px; height: 48px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                    </svg>
                    <p style="font-weight: var(--font-weight-medium); font-size: 17px;">No keys found</p>
                </div>
            </td>
        </tr>
    `
}

function buildCopyableKey(key: string): string {
    const displayKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
    return `
        <div style="position: relative; display: inline-block;">
            <code style="padding: var(--spacing-sm) var(--spacing-md); background: var(--color-secondary-system-background); border: 0.5px solid var(--color-system-gray4); border-radius: var(--radius-md); font-size: 13px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; color: var(--color-label); cursor: pointer; transition: all 0.2s ease; display: inline-block;"
                  onclick="copyToClipboard('${key.replace(/'/g, "\\'")}', this)"
                  onmouseover="this.style.backgroundColor='var(--color-tertiary-system-fill)'"
                  onmouseout="this.style.backgroundColor='var(--color-secondary-system-background)'"
                  title="Click to copy">
                <span style="font-family: inherit;">${displayKey}</span>
            </code>
            <div style="position: absolute; top: -32px; left: 50%; transform: translateX(-50%); background: var(--color-system-green); color: white; font-size: 12px; padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); opacity: 0; pointer-events: none; transition: opacity 0.3s ease; white-space: nowrap;" class="copy-tooltip">
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

    const baseStyles =
        'padding: var(--spacing-sm); border-radius: var(--radius-md); font-size: 15px; font-weight: var(--font-weight-medium); transition: all 0.2s ease; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;'
    const disabledStyles =
        'background: var(--color-secondary-system-background); color: var(--color-quaternary-label); cursor: not-allowed; pointer-events: none; border: 0.5px solid var(--color-system-gray5);'
    const enabledStyles =
        'background: var(--color-system-background); color: var(--color-secondary-label); border: 0.5px solid var(--color-system-gray4);'

    return `
        <a href="${disabled ? '#' : link}" 
                style="${baseStyles} ${disabled ? disabledStyles : enabledStyles}">
            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        return `<span style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; font-weight: var(--font-weight-medium); color: var(--color-tertiary-label);">...</span>`
    }

    const isCurrent = pageItem === currentPage
    const link = buildPageLink(provider, status, q, pageItem, 20, sortBy, sortOrder)

    const baseStyles =
        'padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-md); font-size: 15px; font-weight: var(--font-weight-medium); transition: all 0.2s ease; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; min-width: 32px;'
    const currentStyles = 'background: var(--color-system-blue); color: white; pointer-events: none;'
    const otherStyles =
        'background: var(--color-system-background); color: var(--color-secondary-label); border: 0.5px solid var(--color-system-gray4);'

    return `
        <a href="${isCurrent ? '#' : link}" 
                style="${baseStyles} ${isCurrent ? currentStyles : otherStyles}">
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
                class="apple-btn-destructive"
                style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; background: #d70015;">
            Delete ALL
        </button>
    `
            : ''

    return `
        <div style="padding: var(--spacing-lg); border-bottom: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-md);">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-md);">
                        <div style="display: flex; gap: var(--spacing-xs);">${statusTabs}</div>
                        <div style="display: flex; align-items: center;">
                            <div style="position: relative;">
                                <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                <input form="search-form" type="search" name="q" value="${q}" 
                                       placeholder="Search keys..." 
                                       class="apple-input" 
                                       style="width: 280px; padding-left: var(--spacing-2xl); padding-right: var(--spacing-md); padding-top: var(--spacing-sm); padding-bottom: var(--spacing-sm);">
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <button type="submit" name="action" value="delete" 
                                class="apple-btn-destructive"
                                style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px;">
                            Delete Selected
                        </button>
                        ${deleteAllButton}
                    </div>
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
        <div style="overflow-x: auto;">
            <table style="width: 100%; table-layout: fixed;">
                <colgroup>
                    <col style="width: 48px;">
                    <col style="width: 260px;">
                    <col style="width: 200px;">
                    <col style="width: 140px;">
                    <col style="width: 120px;">
                </colgroup>
                <thead>
                    <tr style="background: var(--color-secondary-system-background); border-bottom: 0.5px solid var(--color-system-gray5);">
                        <th style="padding: var(--spacing-md); text-align: left;">
                            <input type="checkbox" 
                                   onchange="document.querySelectorAll('[name=key_id]').forEach(c => c.checked = this.checked)" 
                                   style="width: 16px; height: 16px; accent-color: var(--color-system-blue); border-radius: var(--radius-xs);">
                        </th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">API Key</th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Remark</th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <a href="${coolingLink}" style="display: flex; align-items: center; gap: var(--spacing-xs); color: var(--color-system-blue); text-decoration: none; transition: opacity 0.2s ease;">
                                <span>Cooling Time</span>
                                ${getSortIcon('totalCoolingSeconds', sortBy, sortOrder)}
                            </a>
                        </th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <a href="${usedTimeLink}" style="display: flex; align-items: center; gap: var(--spacing-xs); color: var(--color-system-blue); text-decoration: none; transition: opacity 0.2s ease;">
                                <span>Used Time</span>
                                ${getSortIcon('createdAt', sortBy, sortOrder)}
                            </a>
                        </th>
                    </tr>
                </thead>
                <tbody>
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
        <div style="display: flex; justify-content: center; align-items: center; padding: var(--spacing-lg); border-top: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-lg); background: var(--color-system-background); color: var(--color-secondary-label); font-size: 15px; font-weight: var(--font-weight-semibold); border: 0.5px solid var(--color-system-gray4);">
                ${total} items
            </div>
        </div>
    `
    }

    return `
        <div style="display: flex; justify-content: center; align-items: center; padding: var(--spacing-lg); border-top: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-sm); background: var(--color-system-background); border-radius: var(--radius-lg); border: 0.5px solid var(--color-system-gray4);">
                ${paginationControls}
                <div style="height: 20px; width: 0.5px; background: var(--color-system-gray4); margin: 0 var(--spacing-sm);"></div>
                <div style="padding: 0 var(--spacing-sm); color: var(--color-secondary-label); font-size: 15px; font-weight: var(--font-weight-semibold);">
                    ${total} items
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
        <div class="apple-card" style="padding: var(--spacing-lg); max-width: 1200px; margin: 0 auto;">
            <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div style="padding: var(--spacing-sm); background: var(--color-secondary-system-background); border-radius: var(--radius-lg); border: 0.5px solid var(--color-system-gray4);">
                    <svg style="width: 20px; height: 20px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                </div>
                <h2 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0; line-height: 1.4; letter-spacing: -0.011em;">Add New Keys</h2>
            </div>
            <form method="POST" style="display: flex; flex-direction: column; gap: var(--spacing-lg);">
                <input type="hidden" name="action" value="add">
                <div>
                    <label style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-sm); line-height: 1.29412; letter-spacing: -0.022em;">API Keys</label>
                    <textarea name="keys" 
                              class="apple-input" 
                              style="width: 100%; padding: var(--spacing-md); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 15px; resize: none; min-height: 120px;"
                              rows="5" 
                              placeholder="Enter API keys, one per line or separated by commas"></textarea>
                </div>
                <div>
                    <label style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-sm); line-height: 1.29412; letter-spacing: -0.022em;">Remark</label>
                    <input name="remark"
                              class="apple-input"
                              style="width: 100%; padding: var(--spacing-md);"
                              placeholder="Enter remark for these keys (optional)"/>
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button type="submit" 
                            formaction="/keys/${provider}${buildPageLink(provider, currentStatus, q, page, 20, sortBy, sortOrder)}" 
                            class="apple-btn-primary"
                            style="padding: var(--spacing-md) var(--spacing-lg);">
                        Add Keys
                    </button>
                </div>
            </form>
        </div>
    `
}

function buildModelCoolingsModal(): string {
    return `
        <div id="modelCoolingsModal" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 50; padding: var(--spacing-lg);" onclick="closeModal(event)">
            <div class="apple-card" style="max-width: 600px; width: 100%; max-height: 80vh; overflow: hidden;" onclick="event.stopPropagation()">
                <div style="padding: var(--spacing-lg); border-bottom: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <h3 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0; line-height: 1.4; letter-spacing: -0.011em;">Model Cooling Details</h3>
                        <button onclick="closeModal()" style="padding: var(--spacing-sm); background: none; border: none; border-radius: var(--radius-md); cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--color-secondary-system-fill)'" onmouseout="this.style.backgroundColor='transparent'">
                            <svg style="width: 20px; height: 20px; color: var(--color-secondary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <p style="font-size: 15px; color: var(--color-secondary-label); margin-top: var(--spacing-sm); margin-bottom: 0;">Key: <span id="modalKeyName" style="font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 13px;"></span></p>
                </div>
                <div style="padding: var(--spacing-lg); overflow-y: auto; max-height: 400px;">
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
                        modalTable.innerHTML = '<p style="color: var(--color-secondary-label); text-align: center; padding: var(--spacing-3xl); font-size: 17px;">No model cooling data available</p>';
                    } else {
                        const rows = Object.entries(modelCoolings).map(([model, cooling]) => {
                            const isAvailable = cooling.end_at < now;
                            const remainingTime = isAvailable ? '-' : formatTime(cooling.end_at - now);
                            const totalTime = formatTime(cooling.total_seconds);
                            const statusClass = isAvailable ? 'color: var(--color-system-green); background: rgba(52, 199, 89, 0.1); border: 0.5px solid rgba(52, 199, 89, 0.2);' : 'color: var(--color-system-red); background: rgba(255, 59, 48, 0.1); border: 0.5px solid rgba(255, 59, 48, 0.2);';
                            const status = isAvailable ? 'available' : 'cooling';
                            
                            return \`
                                <tr style="border-bottom: 0.5px solid var(--color-system-gray5);">
                                    <td style="padding: var(--spacing-md); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 13px; color: var(--color-label);">\${model}</td>
                                    <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label);">\${totalTime}</td>
                                    <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label);">\${remainingTime}</td>
                                    <td style="padding: var(--spacing-md);">
                                        <span style="padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); font-size: 12px; font-weight: var(--font-weight-medium); \${statusClass}">\${status}</span>
                                    </td>
                                </tr>
                            \`;
                        }).join('');
                        
                        modalTable.innerHTML = \`
                            <table style="width: 100%; border-radius: var(--radius-md); overflow: hidden; border: 0.5px solid var(--color-system-gray5);">
                                <thead>
                                    <tr style="background: var(--color-secondary-system-background); border-bottom: 0.5px solid var(--color-system-gray5);">
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Model</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Total Cooling Time</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Remaining Time</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${rows}
                                </tbody>
                            </table>
                        \`;
                    }
                } catch (e) {
                    modalTable.innerHTML = '<p style="color: var(--color-system-red); text-align: center; padding: var(--spacing-3xl); font-size: 17px;">Error parsing model cooling data</p>';
                }
                
                modal.style.display = 'flex';
            }
            
            function closeModal(event) {
                if (!event || event.target === event.currentTarget) {
                    const modal = document.getElementById('modelCoolingsModal');
                    modal.style.display = 'none';
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
