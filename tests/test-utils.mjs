#!/usr/bin/env node

// 测试工具公共模块
// 提供配置加载、HTTP请求等公共功能

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 尝试从 .env 文件加载配置
export function loadEnvConfig() {
    try {
        // 从项目根目录读取 .env 文件
        const envPath = join(__dirname, '..', '.env')
        const envFile = readFileSync(envPath, 'utf8')

        const config = {}
        const lines = envFile.split('\n')

        for (const line of lines) {
            // 跳过注释和空行
            if (line.trim() === '' || line.trim().startsWith('#')) {
                continue
            }

            // 解析 KEY=VALUE 格式
            const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
            if (match) {
                const [, key, value] = match
                config[key] = value.trim()
            }
        }

        return config
    } catch (error) {
        // .env 文件不存在或读取失败，返回空配置
        console.log('💡 提示：未找到 .env 文件，将使用环境变量或默认值')
        return {}
    }
}

// 获取配置来源信息
export function getConfigSource(key, envValue, fileValue) {
    if (process.env[key]) return '环境变量'
    if (fileValue) return '.env文件'
    return '默认值'
}

// 加载完整配置
export function loadTestConfig() {
    const envConfig = loadEnvConfig()
    const WORKER_URL = process.env.WORKER_URL || envConfig.WORKER_URL || 'http://localhost:8080'
    const AUTH_KEY = process.env.AUTH_KEY || envConfig.AUTH_KEY || 'xDd67Jj4nocL69iFNJRF5GY3HKe7Ux6h'

    const workerUrlSource = getConfigSource('WORKER_URL', process.env.WORKER_URL, envConfig.WORKER_URL)
    const authKeySource = getConfigSource('AUTH_KEY', process.env.AUTH_KEY, envConfig.AUTH_KEY)

    return {
        WORKER_URL,
        AUTH_KEY,
        workerUrlSource,
        authKeySource
    }
}

// 通用HTTP请求方法
export async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'OneBalance-Test/1.0',
                ...options.headers
            },
            ...options
        })
        return response
    } catch (error) {
        console.error('❌ 请求失败:', error.message)
        throw error
    }
}

// 带认证的API请求
export async function makeAuthenticatedRequest(baseUrl, authKey, endpoint, options = {}) {
    const url = `${baseUrl}${endpoint}`
    return makeRequest(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${authKey}`,
            ...options.headers
        }
    })
}

// 测试结果统计
export class TestRunner {
    constructor(name) {
        this.name = name
        this.passed = 0
        this.total = 0
        this.startTime = Date.now()
    }

    async run(testName, testFn) {
        console.log(`\n🧪 ${testName}...`)
        this.total++

        try {
            const result = await testFn()
            if (result) {
                this.passed++
                console.log('✅ 测试通过')
            } else {
                console.log('❌ 测试失败')
            }
            return result
        } catch (error) {
            console.error('❌ 测试出错:', error.message)
            return false
        }
    }

    printResults() {
        const duration = Date.now() - this.startTime
        console.log('\n' + '─'.repeat(60))
        console.log(`📊 ${this.name} 测试结果: ${this.passed}/${this.total} 通过`)
        console.log(`⏱️  总耗时: ${duration}ms`)

        if (this.passed === this.total) {
            console.log('🎉 所有测试通过!')
            return true
        } else {
            console.log('😞 部分测试失败')
            return false
        }
    }
}

// 验证配置
export function validateConfig(config) {
    const { WORKER_URL, AUTH_KEY } = config

    if (WORKER_URL.includes('your-worker-url') || AUTH_KEY.includes('your-auth-key')) {
        console.error('❌ 请配置正确的环境变量!')
        console.error('')
        console.error('配置方法:')
        console.error('1. 在 .env 文件中设置:')
        console.error('   WORKER_URL=https://your-worker.workers.dev')
        console.error('   AUTH_KEY=your-secret-key')
        console.error('')
        console.error('2. 或者直接使用环境变量:')
        console.error('   WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-secret-key node test.mjs')
        console.error('')
        console.error('3. 或者导入环境变量:')
        console.error('   source .env && node test.mjs')
        return false
    }

    return true
}

// 打印配置信息
export function printConfig(config) {
    const { WORKER_URL, AUTH_KEY, workerUrlSource, authKeySource } = config
    console.log(`🔗 目标地址: ${WORKER_URL} (来源: ${workerUrlSource})`)
    console.log(`🔑 认证密钥: ${AUTH_KEY.substring(0, 8)}... (来源: ${authKeySource})`)
    console.log('─'.repeat(60))
}
