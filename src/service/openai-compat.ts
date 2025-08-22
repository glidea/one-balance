// OpenAI 兼容格式转换服务
// 基于 https://github.com/zaunist/gemini-balance-do 实现

interface OpenAIMessage {
    role: 'user' | 'assistant' | 'system'
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface OpenAIRequest {
    model: string
    messages: OpenAIMessage[]
    stream?: boolean
    max_tokens?: number
    temperature?: number
    top_p?: number
    frequency_penalty?: number
    presence_penalty?: number
    stop?: string | string[]
}

interface GeminiMessage {
    role: 'user' | 'model'
    parts: Array<{ text: string }>
}

interface GeminiRequest {
    contents: GeminiMessage[]
    system_instruction?: { parts: Array<{ text: string }> }
    generationConfig?: {
        maxOutputTokens?: number
        temperature?: number
        topP?: number
        stopSequences?: string[]
    }
    safetySettings?: Array<{
        category: string
        threshold: string
    }>
}

export function isOpenAICompatRequest(restResource: string): boolean {
    return restResource.startsWith('compat/chat/completions')
}

export async function transformOpenAIToGeminiRequest(request: Request): Promise<{
    transformedBody: string
    restResource: string
    originalStream: boolean
    realModel: string
}> {
    const openaiReq = (await request.json()) as OpenAIRequest
    const isStream = openaiReq.stream || false

    // 提取真实的模型名称 (google-ai-studio/gemini-2.0-flash -> gemini-2.0-flash)
    const modelParts = openaiReq.model.split('/')
    const realModel = modelParts[1] || modelParts[0]

    // 转换为 Gemini 格式
    const geminiRequest = transformRequestFormat(openaiReq)

    // 构建请求路径
    const streamPath = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent'
    const restResource = `google-ai-studio/v1/models/${realModel}:${streamPath}`

    return {
        transformedBody: JSON.stringify(geminiRequest),
        restResource,
        originalStream: isStream,
        realModel
    }
}

function transformRequestFormat(openaiReq: OpenAIRequest): GeminiRequest {
    const geminiRequest: GeminiRequest = {
        contents: [],
        generationConfig: {}
    }

    // 转换消息
    const { contents } = transformMessages(openaiReq.messages)
    geminiRequest.contents = contents

    // 转换配置参数
    if (openaiReq.max_tokens) {
        geminiRequest.generationConfig!.maxOutputTokens = openaiReq.max_tokens
    }

    if (openaiReq.temperature !== undefined) {
        geminiRequest.generationConfig!.temperature = Math.max(0, Math.min(2, openaiReq.temperature))
    }

    if (openaiReq.top_p !== undefined) {
        geminiRequest.generationConfig!.topP = Math.max(0, Math.min(1, openaiReq.top_p))
    }

    if (openaiReq.stop) {
        const stopSequences = Array.isArray(openaiReq.stop) ? openaiReq.stop : [openaiReq.stop]
        geminiRequest.generationConfig!.stopSequences = stopSequences.slice(0, 5) // Gemini 限制最多 5 个
    }

    // 设置安全设置（较为宽松）
    geminiRequest.safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]

    return geminiRequest
}

function transformMessages(messages: OpenAIMessage[]): {
    contents: GeminiMessage[]
    systemInstruction?: { parts: Array<{ text: string }> }
} {
    const contents: GeminiMessage[] = []
    let systemText = ''

    // 先收集所有 system 消息
    for (const message of messages) {
        if (message.role === 'system') {
            const text = extractTextFromContent(message.content)
            if (systemText) {
                systemText += '\n\n' + text
            } else {
                systemText = text
            }
        }
    }

    // 处理非 system 消息
    let firstUserMessage = true
    for (const message of messages) {
        if (message.role !== 'system') {
            const geminiRole = message.role === 'assistant' ? 'model' : 'user'
            let text = extractTextFromContent(message.content)

            // 如果是第一个 user 消息且有 system 文本，则合并
            if (firstUserMessage && geminiRole === 'user' && systemText) {
                text = `${systemText}\n\n${text}`
                firstUserMessage = false
            } else if (geminiRole === 'user') {
                firstUserMessage = false
            }

            contents.push({
                role: geminiRole,
                parts: [{ text }]
            })
        }
    }

    return { contents }
}

function extractTextFromContent(
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
): string {
    if (typeof content === 'string') {
        return content
    }

    // 处理多模态内容
    return content
        .map(part => {
            if (part.type === 'text' && part.text) {
                return part.text
            } else if (part.type === 'image_url') {
                return '[图片内容]' // 简化处理图片
            }
            return ''
        })
        .filter(Boolean)
        .join('\n')
}

export async function transformGeminiToOpenAIResponse(
    geminiResponse: Response,
    originalStream: boolean,
    model: string
): Promise<Response> {
    if (originalStream) {
        return transformStreamResponse(geminiResponse, model)
    } else {
        return transformNonStreamResponse(geminiResponse, model)
    }
}

async function transformNonStreamResponse(geminiResponse: Response, model: string): Promise<Response> {
    const geminiData = (await geminiResponse.json()) as any

    // 检查是否有错误
    if (geminiData.error) {
        return new Response(
            JSON.stringify({
                error: {
                    message: geminiData.error.message || 'Unknown error',
                    type: 'api_error',
                    code: geminiData.error.code || 'unknown'
                }
            }),
            {
                status: geminiResponse.status,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }

    // 转换为 OpenAI 格式
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const finishReason = getFinishReason(geminiData.candidates?.[0])

    const openaiResponse = {
        id: `chatcmpl-${generateId()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: finishReason
            }
        ],
        usage: {
            prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
            completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
        }
    }

    return new Response(JSON.stringify(openaiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
}

async function transformStreamResponse(geminiResponse: Response, model: string): Promise<Response> {
    if (!geminiResponse.body) {
        throw new Error('No response body for streaming')
    }

    const reader = geminiResponse.body.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
        async start(controller) {
            try {
                let buffer = ''

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim()
                            if (jsonStr === '[DONE]') {
                                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                                continue
                            }

                            try {
                                const geminiData = JSON.parse(jsonStr)
                                const openaiData = transformStreamChunk(geminiData, model)
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiData)}\n\n`))
                            } catch (e) {
                                console.error('Error parsing stream chunk:', e)
                            }
                        }
                    }
                }

                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            } catch (error) {
                controller.error(error)
            } finally {
                reader.releaseLock()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        }
    })
}

function transformStreamChunk(geminiData: any, model: string) {
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const finishReason = getFinishReason(geminiData.candidates?.[0])

    return {
        id: `chatcmpl-${generateId()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
            {
                index: 0,
                delta: content ? { content } : {},
                finish_reason: finishReason
            }
        ]
    }
}

function getFinishReason(candidate: any): string | null {
    if (!candidate) return null

    if (candidate.finishReason === 'STOP') return 'stop'
    if (candidate.finishReason === 'MAX_TOKENS') return 'length'
    if (candidate.finishReason === 'SAFETY') return 'content_filter'

    return null
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 15)
}

export function isModelsRequest(restResource: string): boolean {
    return restResource === 'compat/models'
}

export async function handleModelsRequest(apiKey: string): Promise<Response> {
    try {
        // 尝试获取Google AI Studio的模型列表
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {
            signal: AbortSignal.timeout(5000) // 5秒超时
        })

        if (!response.ok) {
            console.warn('Google AI Studio API returned error, falling back to static list')
            return getFallbackModels()
        }

        const data = (await response.json()) as any
        const models = data.models || []

        // 转换为OpenAI格式的模型列表
        const openaiModels = models
            .filter((model: any) => model.name && model.name.includes('gemini'))
            .map((model: any) => ({
                id: model.name.replace('models/', ''),
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: 'google'
            }))

        return new Response(
            JSON.stringify(
                {
                    object: 'list',
                    data: openaiModels
                },
                null,
                2
            ),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    } catch (error) {
        console.warn('Failed to fetch models from Google AI Studio, using fallback list:', error.message)
        return getFallbackModels()
    }
}

function getFallbackModels(): Response {
    // 静态的Gemini模型列表，作为后备方案
    const fallbackModels = [
        {
            id: 'gemini-2.0-flash',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        },
        {
            id: 'gemini-1.5-pro',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        },
        {
            id: 'gemini-1.5-flash',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        },
        {
            id: 'gemini-pro',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        }
    ]

    return new Response(
        JSON.stringify(
            {
                object: 'list',
                data: fallbackModels
            },
            null,
            2
        ),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }
    )
}
