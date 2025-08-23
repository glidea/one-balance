#!/usr/bin/env node

// 测试改进功能的端点
//
// 测试新添加的健康检查、错误统计和性能报告功能

import { loadTestConfig, makeAuthenticatedRequest, TestRunner } from './test-utils.mjs'

async function testHealthCheck(config) {
    const { WORKER_URL } = config
    console.log('🏥 测试健康检查端点...')

    try {
        const response = await fetch(`${WORKER_URL}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        })

        const data = await response.json()

        console.log(`✅ 健康检查响应 (${response.status}):`)
        console.log('   状态:', data.healthy ? '✅ 健康' : '❌ 不健康')
        console.log('   时间戳:', new Date(data.timestamp).toLocaleString())
        console.log('   版本:', data.version)
        console.log('   运行时间:', data.uptime + 'ms')
        console.log('   服务状态:')
        console.log(
            '     - 数据库:',
            data.services.database.healthy ? '✅' : '❌',
            `(${data.services.database.responseTime}ms)`
        )
        console.log('     - 内存:', data.services.memory.healthy ? '✅' : '❌')
        console.log(
            '     - 错误监控:',
            data.services.errors.healthy ? '✅' : '❌',
            `(${data.services.errors.recentErrors} 个错误)`
        )

        if (data.services.memory.usage) {
            const usage = data.services.memory.usage
            console.log('   内存使用:')
            console.log('     - 性能记录:', usage.performanceEntries)
            console.log('     - 启动时间记录:', usage.performanceStartTimes)
            console.log('     - 429计数记录:', usage.consecutive429Entries)
        }

        return response.status === 200
    } catch (error) {
        console.error('❌ 健康检查失败:', error.message)
        return false
    }
}

async function testErrorStats(config) {
    const { WORKER_URL, AUTH_KEY } = config
    console.log('\n📊 测试错误统计端点...')

    try {
        const response = await makeAuthenticatedRequest(WORKER_URL, AUTH_KEY, '/api/errors', {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        })

        const data = await response.json()

        console.log(`✅ 错误统计响应 (${response.status}):`)
        if (data.errors && data.errors.length > 0) {
            console.log('   最近错误统计:')
            data.errors.slice(0, 5).forEach((error, index) => {
                console.log(`     ${index + 1}. ${error.category} (${error.provider}): ${error.count} 次`)
            })
        } else {
            console.log('   📈 暂无错误记录')
        }

        return response.status === 200
    } catch (error) {
        console.error('❌ 错误统计失败:', error.message)
        return false
    }
}

async function testPerformanceReport(config) {
    const { WORKER_URL, AUTH_KEY } = config
    console.log('\n⚡ 测试性能报告端点...')

    try {
        const response = await makeAuthenticatedRequest(WORKER_URL, AUTH_KEY, '/api/perf', {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        })

        const data = await response.text()

        console.log(`✅ 性能报告响应 (${response.status}):`)
        if (data && data.includes('Performance Stats')) {
            console.log('   📈 性能监控正常工作')
            // 显示报告的前几行
            const lines = data.split('\n').slice(0, 8)
            lines.forEach(line => {
                if (line.trim()) {
                    console.log('   ' + line)
                }
            })
        } else {
            console.log('   📊 性能监控尚无数据或已禁用')
        }

        return response.status === 200
    } catch (error) {
        console.error('❌ 性能报告失败:', error.message)
        return false
    }
}

async function testBasicEndpoint(config) {
    const { WORKER_URL } = config
    console.log('\n🌐 测试基础连通性...')

    try {
        const response = await fetch(`${WORKER_URL}/`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        })

        console.log(`✅ 基础连接响应 (${response.status})`)
        return response.status < 500 // 允许重定向等
    } catch (error) {
        console.error('❌ 基础连接失败:', error.message)
        return false
    }
}

async function main() {
    console.log('🧪 One-Balance 改进功能测试')
    console.log('=====================================\n')

    const config = loadTestConfig()
    console.log('📋 测试配置:')
    console.log('   Worker URL:', config.WORKER_URL)
    console.log('   认证密钥:', config.AUTH_KEY ? `${config.AUTH_KEY.substring(0, 8)}***` : '未设置')
    console.log('')

    const runner = new TestRunner('改进功能测试')

    // 执行各项测试
    let results = {
        passed: 0,
        total: 0,
        failed: 0
    }

    const tests = [
        { name: '基础连通性', fn: () => testBasicEndpoint(config) },
        { name: '健康检查', fn: () => testHealthCheck(config) },
        { name: '错误统计', fn: () => testErrorStats(config) },
        { name: '性能报告', fn: () => testPerformanceReport(config) }
    ]

    for (const test of tests) {
        const result = await runner.run(test.name, test.fn)
        results.total++
        if (result) {
            results.passed++
        } else {
            results.failed++
        }
    }

    console.log('\n📋 测试总结:')
    console.log('=====================================')
    console.log(`✅ 通过: ${results.passed}/${results.total}`)
    console.log(`❌ 失败: ${results.failed}/${results.total}`)

    if (results.failed > 0) {
        console.log('\n⚠️  部分测试失败，请检查:')
        console.log('   1. Worker 是否正常启动 (pnpm dev)')
        console.log('   2. 网络连接是否正常')
        console.log('   3. 认证密钥是否正确')
        process.exit(1)
    } else {
        console.log('\n🎉 所有改进功能测试通过!')
        console.log('   新的错误处理、健康检查和性能监控功能工作正常。')
    }
}

main().catch(error => {
    console.error('💥 测试脚本执行失败:', error.message)
    process.exit(1)
})
