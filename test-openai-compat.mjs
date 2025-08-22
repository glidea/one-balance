#!/usr/bin/env node

// 测试 OpenAI 兼容格式和中文编码
// 使用方法: 
//   WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-secret-key node test-openai-compat.mjs
// 或者设置环境变量:
//   export WORKER_URL=https://your-worker.workers.dev
//   export AUTH_KEY=your-secret-key
//   node test-openai-compat.mjs

const WORKER_URL = process.env.WORKER_URL || 'https://your-worker-url.workers.dev'
const AUTH_KEY = process.env.AUTH_KEY || 'your-auth-key'

async function testNonStreamRequest() {
    console.log('🧪 测试非流式请求...')

    const response = await fetch(`${WORKER_URL}/api/compat/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AUTH_KEY}`
        },
        body: JSON.stringify({
            model: 'google-ai-studio/gemini-2.0-flash',
            messages: [
                {
                    role: 'system',
                    content: '你是一个有帮助的助手，请用中文回答问题。'
                },
                {
                    role: 'user',
                    content: '你好！请用中文介绍一下人工智能的发展历史。请保持回答简洁，大约100字。'
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    })

    if (!response.ok) {
        console.error('❌ 请求失败:', response.status, await response.text())
        return false
    }

    const data = await response.json()
    console.log('✅ 非流式响应成功')
    console.log('📝 响应内容:', data.choices[0].message.content)
    console.log('📊 Token 使用:', data.usage)

    return true
}

async function testStreamRequest() {
    console.log('🧪 测试流式请求...')

    const response = await fetch(`${WORKER_URL}/api/compat/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AUTH_KEY}`
        },
        body: JSON.stringify({
            model: 'google-ai-studio/gemini-2.0-flash',
            messages: [
                {
                    role: 'user',
                    content: '请用中文写一首关于春天的短诗，4行即可。'
                }
            ],
            stream: true,
            max_tokens: 100,
            temperature: 0.8
        })
    })

    if (!response.ok) {
        console.error('❌ 流式请求失败:', response.status, await response.text())
        return false
    }

    console.log('✅ 流式响应开始')
    console.log('📝 流式内容:')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim()
                    if (data === '[DONE]') {
                        console.log('\n🏁 流式响应完成')
                        return true
                    }

                    try {
                        const parsed = JSON.parse(data)
                        const content = parsed.choices?.[0]?.delta?.content
                        if (content) {
                            process.stdout.write(content)
                            fullContent += content
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
    }

    console.log(`\n📊 完整内容长度: ${fullContent.length} 字符`)
    return true
}

async function testChineseEncoding() {
    console.log('🧪 测试中文编码专项...')

    const testCases = [
        '你好世界！这是一个中文测试。',
        '中文标点符号：，。？！；：""（）【】',
        '数字和中文混合：2024年是龙年，祝大家新年快乐！',
        '中英混合：Hello世界，这是mixed language测试。'
    ]

    for (let i = 0; i < testCases.length; i++) {
        const testInput = testCases[i]
        console.log(`\n📝 测试用例 ${i + 1}: ${testInput}`)

        const response = await fetch(`${WORKER_URL}/api/compat/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${AUTH_KEY}`
            },
            body: JSON.stringify({
                model: 'google-ai-studio/gemini-2.0-flash',
                messages: [
                    {
                        role: 'user',
                        content: `请直接复述这段文字，不要添加任何其他内容：${testInput}`
                    }
                ],
                max_tokens: 100
            })
        })

        if (response.ok) {
            const data = await response.json()
            const output = data.choices[0].message.content
            console.log(`✅ 输出: ${output}`)

            // 简单检查是否包含原始中文内容
            const hasOriginalContent = testInput.split('').some(char => output.includes(char))
            if (hasOriginalContent) {
                console.log('✅ 中文编码正常')
            } else {
                console.log('⚠️  中文编码可能存在问题')
            }
        } else {
            console.log('❌ 请求失败:', response.status)
        }
    }
}

async function testModelsEndpoint() {
    console.log('🧪 测试模型列表端点...')

    const response = await fetch(`${WORKER_URL}/api/compat/models`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${AUTH_KEY}`
        }
    })

    if (!response.ok) {
        console.error('❌ 模型列表请求失败:', response.status, await response.text())
        return false
    }

    const data = await response.json()
    console.log('✅ 模型列表响应成功')
    console.log('📝 可用模型数量:', data.data?.length || 0)
    if (data.data && data.data.length > 0) {
        console.log('📋 模型示例:', data.data.slice(0, 3).map(m => m.id))
    }
    console.log('📊 响应格式:', data.object)

    return true
}

async function main() {
    console.log('🚀 开始测试 OpenAI 兼容格式和中文编码...')
    console.log(`🔗 目标地址: ${WORKER_URL}`)
    console.log('─'.repeat(60))

    if (WORKER_URL.includes('your-worker-url') || AUTH_KEY.includes('your-auth-key')) {
        console.error('❌ 请设置环境变量:')
        console.error('   WORKER_URL=https://your-worker.workers.dev')
        console.error('   AUTH_KEY=your-secret-key')
        console.error('')
        console.error('使用方法:')
        console.error('   WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-secret-key node test-openai-compat.mjs')
        process.exit(1)
    }

    try {
        await testModelsEndpoint()
        console.log('─'.repeat(60))

        await testNonStreamRequest()
        console.log('─'.repeat(60))

        await testStreamRequest()
        console.log('─'.repeat(60))

        await testChineseEncoding()
        console.log('─'.repeat(60))

        console.log('🎉 所有测试完成！')
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error)
        process.exit(1)
    }
}

main()
