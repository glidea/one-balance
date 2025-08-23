# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

One Balance 是一个基于 Cloudflare Workers 的 API 密钥负载均衡器，利用 Cloudflare AI Gateway 的路由能力，为多个 API 密钥提供轮询和健康检查功能。该项目特别适用于管理具有配额限制的 API 密钥，如 Google AI Studio。

## 核心开发命令

### 开发环境设置

```bash
# 安装依赖
pnpm install

# 初始化配置（复制模板文件）
pnpm init:config

# 本地开发
pnpm dev
```

### 数据库管理

```bash
# 本地数据库迁移
pnpm migrate

# 远程数据库迁移
pnpm migrate:remote
```

### 部署

```bash
# 部署到 Cloudflare
pnpm deploycf
```

### 测试

```bash
# 运行 OpenAI 兼容格式测试
node tests/test-openai-compat.mjs

# 测试系统改进功能（健康检查、错误统计、性能监控）
WORKER_URL=http://localhost:8080 AUTH_KEY=your-key node tests/test-improvements.mjs

# 性能测试
node tests/test-performance.mjs

# 使用环境变量运行测试
WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-key node tests/test-openai-compat.mjs
```

## 高层架构

### 核心组件

#### 主要模块

- **src/index.ts**: Worker 入口点，路由到 API 或 Web 处理器，集成性能监控
- **src/api.ts**: API 请求处理，包含智能密钥轮询、统一错误处理、指数退避重试和系统监控端点
- **src/service/openai-compat.ts**: OpenAI 兼容格式转换服务，支持流式响应
- **src/web.ts**: Web UI 入口，重构为模块化架构
- **src/service/key.ts**: 密钥服务层，处理密钥状态、线程安全缓存和并发控制
- **src/service/d1/**: 数据库层，包含 schema 定义和迁移

#### 工具和配置模块

- **src/util/errors.ts**: 统一错误处理系统，支持错误分类、聚合和模式识别
- **src/util/logger.ts**: 安全日志系统，自动脱敏敏感信息（API密钥、Token等）
- **src/util/performance.ts**: 性能监控系统，兼容 Cloudflare Workers 环境
- **src/util/memory-manager.ts**: 内存管理工具，实现LRU+TTL缓存策略，防止内存泄漏
- **src/config/constants.ts**: 集中化配置管理，包含 API、内存、性能等配置项
- **src/types/**: TypeScript 类型定义目录，强化类型安全

#### Web UI 模块

- **src/web/**: 模块化Web UI组件
    - **src/web/index.ts**: Web处理器主逻辑
    - **src/web/helpers.ts**: UI帮助函数和组件
    - **src/web/templates/**: HTML模板（login.ts, layout.ts）
    - **src/web/config/**: Web配置（providers.ts）

#### 测试套件

- **tests/test-openai-compat.mjs**: OpenAI兼容格式测试
- **tests/test-improvements.mjs**: 新功能测试（健康检查、错误统计、性能监控）
- **tests/test-performance.mjs**: 性能基准测试
- **tests/test-utils.mjs**: 测试工具库和公共函数

### 关键设计模式

#### 智能密钥轮询系统

- **两阶段选择**: 先尝试随机选择（快速路径），失败后全扫描
- **模型级冷却**: 针对特定模型设置冷却期，而非整个密钥
- **连续 429 检测**: 使用内存计数器跟踪连续限流，触发长期冷却

#### 统一错误处理系统

- **错误分类**: 按类型分类（认证、限流、网络、服务器、客户端、验证）
- **指数退避**: 智能重试策略，支持抖动和最大延迟限制
- **错误聚合**: 实时收集错误统计，识别错误模式和趋势
- **状态管理**:
    - **401/403**: 密钥无效，自动标记为 blocked
    - **429**: 限流错误，根据提供商智能设置冷却时间
    - **5xx**: 服务器错误，应用指数退避重试
    - **Google AI Studio 特殊处理**: 区分分钟级和天级配额限制，解析详细错误信息

#### 性能监控与内存管理

- **实时性能追踪**: 自动监控函数执行时间，识别性能瓶颈
- **内存管理策略**: LRU+TTL 混合缓存，自动清理过期数据
- **线程安全设计**: 并发安全的429计数器和缓存操作
- **Cloudflare Workers 兼容**: 避免全局作用域异步操作，兼容Workers运行时限制

#### Web UI 性能监控系统

- **数据收集与解析**:
  - 使用 `perfMonitor.getReport()` 获取性能报告文本
  - 正则表达式解析函数执行统计（名称、持续时间、百分比、调用次数、平均时间）
  - `getOldestDataTimestamp()` 获取最老数据时间戳用于倒计时计算
- **前端交互逻辑**:
  - JavaScript 实现的1秒间隔倒计时更新
  - 无数据时30秒间隔检查新数据产生（通过页面重载）
  - 手动清空通过 POST 请求到 `/performance` 端点
- **数据生命周期**:
  - 1小时（3600000ms）数据保留时间
  - 基于最老数据时间戳 + 1小时计算清理时间点
  - 手动清空后重置倒计时，基于新数据产生时间开始计时
- **UI 状态管理**:
  - 有数据状态: 显示详细统计和倒计时
  - 无数据状态: 显示说明文字和自动检查机制
  - 即将清理状态: 倒计时变红色，显示"即将清理"

#### OpenAI 兼容格式支持

- **格式转换**: 自动将 OpenAI Chat Completions 格式转换为 Gemini 原生格式
- **流式支持**: 完整支持 Server-Sent Events 流式响应
- **角色映射**: assistant→model, system→systemInstruction, user保持不变
- **参数转换**: 自动映射 max_tokens, temperature, top_p, stop 等参数
- **中文编码**: 正确处理中文字符，解决乱码问题

#### 缓存策略

- **activeKeysCacheByProvider**: 按提供商缓存活跃密钥列表
- **isDirty 机制**: 状态变更时标记缓存为脏，确保数据一致性
- **60秒缓存时间**: 平衡性能和数据新鲜度
- **LRU+TTL 策略**: 最近最少使用算法结合时间过期，自动清理
- **内存保护**: 限制缓存条目数量，防止内存溢出
- **并发安全**: 原子性操作，避免竞态条件

## 数据库 Schema

### keys 表结构

- `id`: 主键 (UUID)
- `key`: API 密钥
- `provider`: 提供商名称
- `modelCoolings`: JSON 字段存储模型级冷却信息
- `totalCoolingSeconds`: 累计冷却时间
- `status`: active/blocked
- `remark`: 备注

### 重要索引

- `provider_key_unq_idx`: 确保同一提供商内密钥唯一
- `provider_status_created_at_idx`: 查询优化
- `total_cooling_seconds_idx`: 排序优化

## 开发注意事项

### 环境变量配置

在 wrangler.jsonc 中设置：

- `AUTH_KEY`: 认证密钥
- `AI_GATEWAY`: Cloudflare AI Gateway 名称
- `CONSECUTIVE_429_THRESHOLD`: 连续 429 错误阈值

### 重要实现细节

- **线程安全计数器**: 封装的 `Consecutive429Counter` 类，支持原子性操作和自动清理
- **时区处理**: Google AI Studio 配额重置使用太平洋时间
- **JSON 操作**: 使用 SQLite JSON 函数更新 modelCoolings 字段
- **智能错误恢复**:
    - 最多重试 30 次，支持指数退避策略
    - 不同错误类型的差异化处理策略
    - 网络错误自动重试，认证错误立即切换密钥
- **内存管理**: 定期清理过期数据，限制条目数量，防止内存泄漏
- **Cloudflare Workers 兼容性**:
    - 避免全局作用域使用异步操作（setInterval/setTimeout）
    - 手动内存管理，兼容 Workers 运行时限制
    - 优化CPU时间使用，避免超时中断

### Web UI 特性

**完全模块化架构 + 苹果风格UI**

- **玻璃拟态设计**: 使用 backdrop-filter 和渐变背景
- **实时搜索**: 支持按密钥和备注搜索
- **分页和排序**: 支持多字段排序和分页显示
- **模态详情**: 显示模型级冷却详情

**实时性能监控系统**

- **性能摘要面板**: 显示总执行时间、跟踪函数数、平均调用时间、最慢函数
- **函数级性能分析**: 详细的函数执行时间统计表格，包含持续时间、百分比、调用次数、平均时间
- **智能时间格式化**: 自动选择合适的时间单位显示
  - < 1秒: 毫秒 (ms)
  - < 1分钟: 秒 (s) 
  - >= 1分钟: 分钟 (min)
- **实时倒计时显示**: JavaScript 实现的倒计时器，显示距离自动清理的剩余时间
- **自动状态检测**: 无数据时自动每30秒检查新数据产生
- **手动数据管理**: 
  - 手动清空按钮，带确认对话框防误操作
  - 刷新按钮实时更新数据
  - 支持 POST 请求清空数据后自动重定向
- **数据生命周期管理**: 
  - 1小时数据保留策略
  - 基于最老数据时间戳的智能清理机制
  - 清理后重新开始1小时倒计时
- **响应式设计**: 移动端自适应网格布局
- **Apple Design System**: 完全符合苹果设计语言的UI组件

### 提供商配置

支持多种 AI 提供商，每个提供商有特定的认证头：

- OpenAI: Authorization Bearer
- Google AI Studio: x-goog-api-key
- Anthropic: x-api-key
- 等等...

## 系统监控端点

### 健康检查 `/api/health`

公开端点，提供系统整体健康状态：

```json
{
  "healthy": true,
  "timestamp": 1692794400000,
  "version": "1.0.0",
  "services": {
    "database": { "healthy": true, "responseTime": 15 },
    "memory": { "healthy": true, "usage": {...} },
    "errors": { "healthy": true, "recentErrors": 0 }
  },
  "uptime": 1250
}
```

### 错误统计 `/api/errors`

需要认证，提供错误分类和统计：

```json
{
    "errors": [
        { "category": "rate_limit", "provider": "google-ai-studio", "count": 5 },
        { "category": "network", "provider": "openai", "count": 2 }
    ]
}
```

### 性能监控 Web UI `/performance`

性能监控已从 API 端点迁移到 Web UI，提供更丰富的用户界面：

- **实时性能统计**: 显示系统性能摘要和详细函数级性能分析
- **自动数据清理**: 1小时数据保留策略，自动清理过期数据
- **手动清空功能**: 支持手动清空统计数据，带确认对话框防误操作
- **实时倒计时**: 显示距离下次自动清理的剩余时间
- **智能时间格式化**: 根据数据大小自动选择合适的时间单位（ms/s/min）

## 常见调试

### 开发环境调试

- 检查 `pnpm dev` 启动的本地 Worker 日志
- 使用健康检查端点 `/api/health` 验证系统状态
- 访问 Web UI 性能监控页面 `/performance` 识别性能瓶颈
- 监控错误统计 `/api/errors` 了解错误趋势

### 生产环境调试

- 检查 Cloudflare Workers 日志查看密钥状态变更
- 使用 D1 控制台查看数据库状态
- 通过 AI Gateway 分析面板监控请求统计
- 利用系统监控端点进行健康检查和错误分析

## 重要提醒

程序最终会打包部署为Cloudflare Workers，注意相关的编程限制：

### Cloudflare Workers 限制

- **CPU 时间限制**: 每个请求最多 10ms CPU 时间（免费版）
- **总请求时长**: 不能超过 10 秒，否则被中断
- **内存限制**: 避免内存泄漏，实现了自动清理机制
- **全局作用域限制**:
    - ❌ 不能使用 `setInterval`/`setTimeout`
    - ❌ 不能在全局作用域进行异步操作（fetch等）
    - ✅ 已实现手动清理策略兼容这些限制

### 性能优化措施

- **智能缓存**: LRU+TTL 策略减少数据库查询
- **批量操作**: 减少单次请求的操作数量
- **异步优化**: 使用 `ctx.waitUntil()` 进行后台任务
- **内存管理**: 定期清理过期数据，防止内存累积
