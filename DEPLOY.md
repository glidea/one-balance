# 部署指南

本文档详细说明如何更新部署 one-balance 项目，包括新添加的 OpenAI 兼容格式功能。

## 🚀 快速部署流程

### 1. 环境准备

确保已安装必要工具：

```bash
# 安装 Node.js 和 pnpm
node --version  # 推荐 v18+
pnpm --version  # 推荐 v8+

# 安装项目依赖
pnpm install
```

### 2. 配置环境变量

设置你的认证密钥：

```bash
# macOS/Linux
export AUTH_KEY="your-super-secret-auth-key"

# Windows PowerShell
$env:AUTH_KEY="your-super-secret-auth-key"
```

### 3. 一键部署

```bash
# 完整部署流程（推荐）
AUTH_KEY=your-super-secret-auth-key pnpm run deploycf
```

这个命令会自动执行：

1. ✅ 初始化配置文件 (`pnpm init:config`)
2. ✅ 预处理和清理 (`node pre-deploy.mjs`)
3. ✅ 生成 TypeScript 类型 (`wrangler types`)
4. ✅ 格式化代码 (`pnpm prettier --write .`)
5. ✅ 执行远程数据库迁移 (`pnpm migrate:remote`)
6. ✅ 部署到 Cloudflare Workers (`wrangler deploy`)

## 📋 分步部署流程

如果需要更精细的控制，可以分步执行：

### 步骤 1: 初始化配置

```bash
pnpm init:config
```

这会复制 `wrangler.jsonc.tpl` 到 `wrangler.jsonc`。

### 步骤 2: 编辑配置文件

编辑生成的 `wrangler.jsonc`，设置：

- `vars.AUTH_KEY`: 你的认证密钥
- `vars.AI_GATEWAY`: 你的 Cloudflare AI Gateway 名称
- `d1_databases.database_id`: 你的 D1 数据库 ID

### 步骤 3: 数据库迁移

```bash
# 本地测试
pnpm migrate

# 生产环境
pnpm migrate:remote
```

### 步骤 4: 部署 Worker

```bash
wrangler deploy
```

## 🔄 更新现有部署

如果你已经有一个运行中的 one-balance 实例，想要更新到支持 OpenAI 兼容格式的版本：

### 1. 备份当前配置

```bash
# 备份当前的 wrangler.jsonc
cp wrangler.jsonc wrangler.jsonc.backup
```

### 2. 拉取最新代码

```bash
git pull origin main
# 或者如果你 fork 了项目
git pull upstream main
```

### 3. 重新安装依赖

```bash
pnpm install
```

### 4. 更新部署

```bash
AUTH_KEY=your-existing-auth-key pnpm run deploycf
```

## 🧪 验证部署

### 1. 检查基本功能

访问你的 Worker URL：`https://your-worker-name.your-subdomain.workers.dev`

### 2. 测试 OpenAI 兼容格式

使用提供的测试脚本：

```bash
# 方法1: 直接设置环境变量运行
WORKER_URL=https://your-worker.workers.dev AUTH_KEY=your-auth-key node test-openai-compat.mjs

# 方法2: 创建环境变量文件
cp .env.example .env
# 编辑 .env 文件，填入你的实际配置
nano .env
# 加载环境变量并运行测试
source .env && node test-openai-compat.mjs
```

### 3. 测试原生格式（确保向后兼容）

```bash
curl "https://your-worker-url/api/google-ai-studio/v1/models/gemini-2.0-flash:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'x-goog-api-key: your-auth-key' \
  -d '{
    "contents": [{"role":"user","parts":[{"text":"你好"}]}]
  }'
```

## 🛠 故障排除

### 常见问题

#### 1. 部署失败：认证错误

```bash
# 重新登录 wrangler
wrangler auth login
```

#### 2. 数据库迁移失败

```bash
# 检查数据库状态
wrangler d1 list

# 手动创建数据库（如果不存在）
wrangler d1 create one-balance

# 更新 wrangler.jsonc 中的 database_id
```

#### 3. AI Gateway 不存在

1. 访问 Cloudflare 控制台
2. 导航到 AI → AI Gateway
3. 创建名为 "one-balance" 的 Gateway（或更新配置文件中的名称）

#### 4. OpenAI 兼容格式不工作

检查日志：

```bash
wrangler tail
```

常见原因：

- Google AI Studio 密钥未配置
- 模型名称格式错误（应该是 `google-ai-studio/gemini-2.0-flash`）
- 请求格式不正确

### 检查部署状态

#### 1. 查看 Worker 日志

```bash
wrangler tail
```

#### 2. 检查 D1 数据库

```bash
# 查看表结构
wrangler d1 execute one-balance --command="SELECT sql FROM sqlite_master WHERE type='table';"

# 查看密钥数量
wrangler d1 execute one-balance --command="SELECT provider, status, COUNT(*) as count FROM keys GROUP BY provider, status;"
```

#### 3. 监控 AI Gateway

访问 Cloudflare 控制台的 AI Gateway 分析面板查看请求统计。

## 📈 性能优化建议

### 1. 冷启动优化

- 保持 Worker 温热：使用健康检查请求
- 减少外部依赖：尽量使用 Cloudflare 原生服务

### 2. 缓存优化

- 密钥缓存时间：默认 60 秒，可根据使用情况调整
- 连续 429 阈值：默认 2，可根据密钥质量调整

### 3. 成本控制

- 监控请求量：通过 AI Gateway 面板
- 设置合理的重试次数：默认 10 次
- 及时清理失效密钥

## 🔐 安全建议

1. **认证密钥管理**
    - 使用足够复杂的认证密钥
    - 定期轮换认证密钥
    - 不要在代码中硬编码密钥

2. **API 密钥管理**
    - 定期检查密钥状态
    - 及时删除失效密钥
    - 监控异常使用

3. **访问控制**
    - 限制 Worker 域名访问
    - 使用 CORS 策略
    - 考虑添加速率限制

## 📞 获取帮助

如果遇到问题：

1. 查看 [项目 README](README.md) 和 [CLAUDE.md](CLAUDE.md)
2. 检查 [GitHub Issues](https://github.com/glidea/one-balance/issues)
3. 查看 Cloudflare Workers 和 AI Gateway 文档
