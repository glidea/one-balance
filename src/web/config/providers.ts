// 提供商配置

export interface ProviderConfig {
    color: string
    iconUrl: string
    bgColor: string
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
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

export const PROVIDERS = Object.keys(PROVIDER_CONFIGS)

export function getProviderConfig(provider: string): ProviderConfig {
    return (
        PROVIDER_CONFIGS[provider] || {
            color: 'from-gray-400 to-gray-600',
            iconUrl: '',
            bgColor: 'from-gray-50 to-gray-100'
        }
    )
}
