[English](README-en.md)

<p align="center">
  <img src="banner.png">
  <a href="https://deepwiki.com/glidea/one-balance"><img src="https://deepwiki.com/badge.svg"/></a>
</p>

`One Balance` 是一个基于 Cloudflare 的 API 密钥负载均衡器。它利用 Cloudflare AI Gateway 的路由能力，并在此基础上增加了对多个 API 密钥的轮询和健康检查功能。

如果你有多个具有配额限制的 API 密钥（例如 Google AI Studio），`One Balance` 可以**智能**轮询使用这些密钥，从而最大化利用可用资源。(赞助项目可以领取 Key，见底部)

## 特性

- **!!!降低封禁风险!!!**: 通过 Cloudflare AI Gateway 路由请求，有效降低 API 密钥（尤其是 Gemini）被封禁的概率。
- **!!!智能的错误处理!!!**: 我自个的号池的错误算是很少见了
    - **模型级限流**: 精准识别并暂时屏蔽达到速率限制的特定模型。特别地，针对 Google AI Studio，能智能区分分钟级和天级配额，进行差异化冷却（例如，触发天级配额后冷却 24 小时）。
    - **自动熔断**: 永久禁用被提供商封禁（`403` 错误）的密钥，减少无效重试。
- **免费且简单**: 基于 Cloudflare Workers，一键部署，并可充分利用其免费额度。
- **广泛的兼容性**: 支持 Cloudflare AI Gateway 兼容的所有 API 提供商。包括支持轮询 Gemini TTS，应该是全网独一家（已用到 https://zenfeed.xyz 实时生成新闻播客）

## 部署指南

#### 0. 准备环境

- 安装 [Node.js](https://nodejs.org/) 和 [pnpm](https://pnpm.io/)。
- 有一个 Cloudflare 账户。

#### 1. 创建 AI Gateway

- 登录 Cloudflare 仪表板。
- 导航到 `AI` -> `AI Gateway`。
- 创建一个新的 AI Gateway，并将其命名为 **`one-balance`**。

#### 2. 部署到 Cloudflare

```bash
git clone https://github.com/glidea/one-balance.git
cd one-balance
pnpm install

# Mac/Linux
AUTH_KEY=your-super-secret-auth-key pnpm run deploycf

# Windows (PowerShell)
$env:AUTH_KEY = "your-super-secret-auth-key"; pnpm run deploycf
```

- 脚本将引导你登录 `wrangler` (如果尚未登录)，自动创建所需的 D1 数据库，并部署 Worker。部署成功后，会得到一个 Worker 的 URL，例如 `https://one-balance-backend.<your-subdomain>.workers.dev`。

## 使用方法

### 1. 配置待轮询 KEYS

访问 `https://<your-worker-url>`（大陆不一定能访问，最好自备魔法）

> 最佳实践：🙅🏻‍♀️尽量避免和他人共享 Key，这样系统无法感知全局的调用信息，可能会增加 429 概率

### 2. 访问 API

`https://<your-worker-url>/api/<ai-gateway-path>`

例如，如果 Worker URL 是 `https://one-balance-backend.workers.dev`，并且想向 Google Gemini 2.5 Pro 发送请求，那么最终的请求 URL 将是 `https://one-balance-backend.workers.dev/api/google-ai-studio/v1beta/models/gemini-2.5-pro:generateContent`。

#### 认证

部署时设置的 `AUTH_KEY` 需要通过提供商相应的认证 Header 发送。

- **OpenAI**: `Authorization: Bearer <AUTH_KEY>`
- **Google, Anthropic, Elevenlabs, Azure OpenAI, Cartesia**: 使用对应的自定义 Header，例如 `x-goog-api-key: <AUTH_KEY>`。

### 示例 (使用 `curl`)

#### 使用 OpenAI 兼容格式请求 Google Gemini

```bash
# 支持以 OpenAI 格式访问任意 Provider
curl "https://<your-worker-url>/api/compat/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-super-secret-auth-key" \
  -d '{
    "model": "google-ai-studio/gemini-2.5-pro", # 格式为 $provider/$model 参考 https://developers.cloudflare.com/ai-gateway/chat-completion/
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

#### 请求 OpenAI

```bash
curl https://<your-worker-url>/api/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-super-secret-auth-key" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

其它 Provider 格式参考 https://developers.cloudflare.com/ai-gateway/providers

#### Cherry Studio

![](cherry-studio.png)

## How it work

### 架构

`One Balance` 作为中间层，接收所有 API 请求，并智能地将其转发到 Cloudflare AI Gateway。以下是系统的高层架构图：

```mermaid
graph TD
    subgraph "用户"
        User["👨‍💻<br>客户端"]
    end

    subgraph "Cloudflare 环境"
        OneBalance["<b>One Balance Worker</b>"]
        D1["🗄️ D1 数据库"]
        AIGW["Cloudflare AI Gateway"]

        OneBalance -- "获取/更新密钥状态" <--> D1
        OneBalance -- "转发请求" --> AIGW
    end

    subgraph "第三方服务"
        Provider["🤖<br>AI 提供商<br>(Google, OpenAI...)"]
    end

    User -- "1. API 请求 (含服务 AUTH_KEY)" --> OneBalance
    AIGW -- "2. 代理请求 (含提供商密钥)" --> Provider
    Provider -- "3. API 响应" --> AIGW
    AIGW -- "4. 响应" --> OneBalance
    OneBalance -- "5. 最终响应" --> User
```

> 你可能会问为什么不用 Cloudflare KV，答：白嫖 Quota 太少了。。

### Key 生命周期

```mermaid
graph TD
    NonExistent("<b>(不存在)</b>")

    subgraph "生命周期"
        direction LR
        Active("Active / 可用")
        CoolingDown("Cooling Down / 冷却中<br><i>(针对特定模型)</i>")
        Blocked("Blocked / 已封禁")
    end

    NonExistent -- "1. 创建 (管理员添加)" --> Active

    Active -- "2a. 使用: 成功 (2xx)" --> Active
    Active -- "2b. 使用: 被限流 (429)" --> CoolingDown
    Active -- "2c. 使用: 无效 (401, 403)" --> Blocked

    CoolingDown -- "冷却时间结束" --> Active

    Active -- "3. 删除" --> NonExistent
    Blocked -- "3. 删除" --> NonExistent
    CoolingDown -- "3. 删除" --> NonExistent
```

### DFX

#### 可靠性

系统的可靠性主要通过以下几点保障：

1.  **自动熔断与重试**：当某个 API 密钥失效（例如返回 401, 403 错误）时，系统会立刻将其状态更新为 `blocked` 并从可用池中移除，然后自动用下一个可用密钥重试。这避免了在已失效的密钥上浪费时间和请求。
2.  **模型级智能限流**：当请求因为速率限制（429 错误）失败时，系统不会粗暴地禁用整个密钥，而是会为该密钥命中的**特定模型**设置冷却期。特别地，对于 Google AI Studio 的免费额度，系统能智能区分**分钟级限流**（冷却约 1 分钟）和**天级限流**（冷却 24 小时），最大化利用每个密钥的价值。
3.  **依赖 Cloudflare 生态**：整个服务构建在 Cloudflare 的高可用基础设施之上，包括 Workers, D1 和 AI Gateway，其稳定性由 Cloudflare 直接保障。

### 可拓展性 (Scalability)

1.  **无服务器架构**：Cloudflare Workers 会根据流量自动扩展，你无需关心底层服务器的运维和容量规划。
2.  **状态分离**：Worker 本身是无状态的，所有密钥的状态都持久化在 D1 数据库中，这使得系统可以轻松地水平扩展。
3.  **易于扩展**：
    - **新密钥**：通过管理界面批量添加即可，系统会自动将其纳入轮询池。
    - **新提供商**：得益于 AI Gateway，支持新的提供商通常只需要在代码中增加一行配置，指定其特殊的认证头即可，核心逻辑无需改动。

### 可观测性 (Observability)

1.  **核心事件日志**：系统会通过 `console.log` 输出关键事件，例如密钥被封禁、模型进入冷却期等。你可以在 Cloudflare 仪表盘查看这些日志来诊断问题。
2.  **Cloudflare AI Gateway 分析**：AI Gateway 自带强大的分析面板，你可以清晰地看到请求数、错误率、延迟、成本等核心指标。
3.  **管理界面**：系统提供了一个 UI 界面，可以直观地查看所有密钥的当前状态（active, blocked）和冷却详情。

## 赞助项目

<a href="https://afdian.com/a/glidea"><img src="sponsor.png" width="500"></a>
<br/>
<a href="https://afdian.com/a/glidea">赞助项目，支持发展</a>
