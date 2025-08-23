#!/usr/bin/env node

// 性能监控测试脚本
// 测试性能报告端点和数据收集功能

import { loadTestConfig, validateConfig, printConfig, makeAuthenticatedRequest, TestRunner } from './test-utils.mjs'

// 测试性能报告端点
async function testPerformanceReport(config) {
    const { WORKER_URL, AUTH_KEY } = config

    try {
        const response = await makeAuthenticatedRequest(WORKER_URL, AUTH_KEY, '/api/perf')

        console.log(`状态码: ${response.status}`)
        const report = await response.text()
        console.log('性能报告内容:')
        console.log(report)

        // 检查是否有有效的性能数据
        const hasValidData = report.includes('Performance Stats') || report.includes('Performance monitoring disabled')

        return response.status === 200 && hasValidData
    } catch (error) {
        console.error('❌ 性能报告测试失败:', error.message)
        return false
    }
}

// 测试模型列表端点以生成性能数据
async function testModelsEndpoint(config) {
    const { WORKER_URL, AUTH_KEY } = config

    try {
        const response = await makeAuthenticatedRequest(WORKER_URL, AUTH_KEY, '/api/compat/models')

        if (!response.ok) {
            console.error('❌ 模型列表请求失败:', response.status)
            return false
        }

        const data = await response.json()
        console.log('✅ 模型列表响应成功')
        console.log(`📋 可用模型数量: ${data.data?.length || 0}`)

        return true
    } catch (error) {
        console.error('❌ 模型列表测试失败:', error.message)
        return false
    }
}

// 测试OpenAI兼容接口以生成更多性能数据
async function testChatCompletions(config) {
    const { WORKER_URL, AUTH_KEY } = config

    console.log('发送聊天请求以生成性能数据...')

    const requests = []

    // 发送几个并行请求
    for (let i = 0; i < 2; i++) {
        requests.push(
            makeAuthenticatedRequest(WORKER_URL, AUTH_KEY, '/api/compat/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'google-ai-studio/gemini-2.0-flash',
                    messages: [{ role: 'user', content: `性能监控测试请求 ${i + 1}` }],
                    max_tokens: 10
                })
            }).catch(err => {
                console.log(`请求 ${i + 1} 可能因为没有有效API密钥而失败 (这是正常的)`)
                return { ok: false, status: 'network_error' }
            })
        )
    }

    const responses = await Promise.allSettled(requests)
    let successCount = 0

    for (const result of responses) {
        if (result.status === 'fulfilled' && result.value.ok) {
            successCount++
        }
    }

    console.log(`📊 ${successCount}/${responses.length} 个聊天请求成功`)

    // 等待一下让性能数据处理完成
    await new Promise(resolve => setTimeout(resolve, 1000))

    return true // 即使请求失败也算通过，因为主要是为了生成性能数据
}

// 完整的性能监控测试流程
async function testPerformanceMonitoring(config) {
    console.log('执行完整的性能监控测试流程...')

    // 1. 先测试模型列表端点
    const modelsResult = await testModelsEndpoint(config)

    // 2. 测试聊天完成接口
    const chatResult = await testChatCompletions(config)

    // 3. 获取性能报告
    console.log('\n📈 获取最新性能报告...')
    const perfResult = await testPerformanceReport(config)

    return modelsResult && chatResult && perfResult
}

async function main() {
    console.log('🚀 开始测试性能监控功能...')

    // 加载配置
    const config = loadTestConfig()

    // 验证配置
    if (!validateConfig(config)) {
        process.exit(1)
    }

    // 打印配置信息
    printConfig(config)

    // 创建测试运行器
    const runner = new TestRunner('性能监控')

    // 执行测试
    await runner.run('性能监控完整流程', () => testPerformanceMonitoring(config))
    await runner.run('独立性能报告端点', () => testPerformanceReport(config))

    // 打印结果并退出
    const success = runner.printResults()
    process.exit(success ? 0 : 1)
}

main().catch(error => {
    console.error('❌ 测试运行出错:', error)
    process.exit(1)
})
