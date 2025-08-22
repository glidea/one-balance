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

## 高层架构

### 核心组件

- **src/index.ts**: Worker 入口点，路由到 API 或 Web 处理器
- **src/api.ts**: API 请求处理，包含密钥轮询、错误处理和重试逻辑
- **src/service/openai-compat.ts**: OpenAI 兼容格式转换服务，支持流式响应
- **src/web.ts**: Web UI 管理界面，提供密钥管理功能
- **src/service/key.ts**: 密钥服务层，处理密钥状态和缓存
- **src/service/d1/**: 数据库层，包含 schema 定义和迁移

### 关键设计模式

#### 智能密钥轮询系统

- **两阶段选择**: 先尝试随机选择（快速路径），失败后全扫描
- **模型级冷却**: 针对特定模型设置冷却期，而非整个密钥
- **连续 429 检测**: 使用内存计数器跟踪连续限流，触发长期冷却

#### 错误处理与状态管理

- **401/403**: 密钥无效，自动标记为 blocked
- **429**: 限流错误，根据提供商智能设置冷却时间
- **Google AI Studio 特殊处理**: 区分分钟级和天级配额限制

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

- **内存计数器**: consecutive429Count 用于跟踪连续限流，权衡性能和准确性
- **时区处理**: Google AI Studio 配额重置使用太平洋时间
- **JSON 操作**: 使用 SQLite JSON 函数更新 modelCoolings 字段
- **错误恢复**: 最多重试 10 次，支持不同错误类型的不同处理策略

### Web UI 特性

- **玻璃拟态设计**: 使用 backdrop-filter 和渐变背景
- **实时搜索**: 支持按密钥和备注搜索
- **分页和排序**: 支持多字段排序和分页显示
- **模态详情**: 显示模型级冷却详情

### 提供商配置

支持多种 AI 提供商，每个提供商有特定的认证头：

- OpenAI: Authorization Bearer
- Google AI Studio: x-goog-api-key
- Anthropic: x-api-key
- 等等...

## 常见调试

- 检查 Cloudflare Workers 日志查看密钥状态变更
- 使用 D1 控制台查看数据库状态
- 通过 AI Gateway 分析面板监控请求统计
