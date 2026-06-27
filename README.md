[English](README-en.md)

<p align="center">
  <img src="images/banner.png">
  <a href="https://deepwiki.com/glidea/one-balance"><img src="https://deepwiki.com/badge.svg"/></a>
</p>

`One Balance` 是一个基于 Cloudflare 的 API 密钥负载均衡器。它利用 Cloudflare AI Gateway 的路由能力，并在此基础上增加了对多个 API 密钥的轮询和健康检查功能。

如果你有多个具有配额限制的 API 密钥（例如 Google AI Studio），`One Balance` 可以**智能**轮询使用这些密钥，从而最大化利用可用资源。


---

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/glidea/zenfeed/blob/main/docs/images/wechat.png?raw=true" alt="Wechat QR Code" width="300">
      <br>
      <strong>AI 学习交流社群</strong>
    </td>
    <td align="center">
      <img src="https://github.com/glidea/banana-prompt-quicker/blob/main/images/glidea.png?raw=true" width="250">
      <br>
      <strong><a href="https://glidea.zenfeed.xyz/">我的其它项目</a></strong>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="https://github.com/glidea/banana-prompt-quicker/blob/main/images/readnote.png?raw=true" width="400">
      <br>
      <strong><a href="https://www.xiaohongshu.com/user/profile/5f7dc54d0000000001004afb">📕 小红书账号 - 持续分享 AI 原创</a></strong>
    </td>
  </tr>
</table>

---

## 特性

- **!!!降低封禁风险!!!**: 通过 Cloudflare AI Gateway 路由请求，有效降低 API 密钥（尤其是 Gemini）被封禁的概率。
- **!!!智能的错误处理!!!**: 我自个的号池的错误算是很少见了
    - **模型级限流**: 精准识别并暂时屏蔽达到速率限制的特定模型。特别地，针对 Google AI Studio，能智能区分分钟级和天级配额，进行差异化冷却（例如，触发天级配额后冷却 24 小时）。
    - **自动熔断**: 永久禁用被提供商封禁（`403` 错误）的密钥，减少无效重试。
- **免费且简单**: 基于 Cloudflare Workers，一键部署，并可充分利用其免费额度（包括大规模 Key 下的 CPU Time 优化，榨干 Clouflare Free Plan）。
- **广泛的兼容性**: 支持 Cloudflare AI Gateway 兼容的所有 API 提供商。包括支持轮询 Gemini TTS，应该是全网独一家（已用到 https://zenfeed.xyz 实时生成新闻播客）

## Labpics fork — aiproxy consolidation

This fork absorbs the live `aiproxy` worker into one-balance so `aiproxy` can be retired and Bifrost can call one-balance directly. All additions are on the **Gemini-native** path (`/api/{provider}/...`) — the path Bifrost uses (`google-ai-studio`, native Gemini protocol, `x-goog-api-key` auth).

- **ListModels** — `GET /api/google-ai-studio/v1beta/models` (also `/v1/models`, `/models`) now works. It is forwarded to AI Gateway with any active pooled key (not model-specific, so no per-model cooldown applies) and the upstream body is returned as-is. GET is idempotent, so a transient upstream `5xx` is retried once.
- **`/health`** — `GET /health` → `200 ok`. A liveness probe for the Bifrost → one-balance → AI Gateway → Google chain.
- **Upstream timeout** — every forward to AI Gateway (the proxy path and ListModels) is bounded by an `AbortController` set to `UPSTREAM_TIMEOUT_MS` (default **60000** ms). The timer covers only the receipt of response _headers_; once they arrive it is cleared, so streaming the body is never interrupted. On timeout one-balance returns `504` with a `Retry-After` header.
    - **Keep `UPSTREAM_TIMEOUT_MS` below Bifrost's request timeout (300s).** Bifrost only fails over to its next provider after one-balance responds; if one-balance can hang longer than Bifrost waits, Bifrost times out first and its fallbacks never fire. The 60s default leaves ample headroom — and a timeout ends the request immediately (it is not retried), so worst-case wall-clock is about one `UPSTREAM_TIMEOUT_MS`.
- **`content-disposition` stripped** — removed from proxied responses so a JSON/SSE body is never treated as a file download.

`UPSTREAM_TIMEOUT_MS` lives in `wrangler.jsonc.tpl` `vars` and can be overridden at deploy via the `UPSTREAM_TIMEOUT_MS` env var (same pattern as `AUTH_KEY` / `KEY_MANAGER_TOKEN`).

### Smoke test (opt-in, against a deployed worker)

```bash
ONE_BALANCE_URL=https://<your-worker-url> GEMINI_PROXY_KEY=<service-auth-key> pnpm smoke
```

Checks `/health`, ListModels, and a cheap `generateContent` (`maxOutputTokens: 8`). Not wired into CI — it hits a live worker and consumes a real pooled key.

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

##### 高级认证配置

`AUTH_KEY` 环境变量支持更复杂的配置，允许多个 key，并为每个 key 设置独立的权限和过期时间。格式如下：

`AUTH_KEY="key1=provider1,model1,model2;key2;key3(1758077793)=provider2&provider3"`

- **分隔符**: 多个 key 定义使用分号 (`;`) 分隔。
- **无限制 Key**: `key2` 是一个无限制的 key，它可以访问所有提供商和模型。**只有无限制的 key 才能登录 Web UI 管理界面**。
- **带过期时间的 Key**: `key3(1758077793)` 在 key 后面括号内附加一个 Unix 时间戳 (秒)，表示该 key 的过期时间。
- **权限控制**:
    - `key1=provider1,model1,model2`: `key1` 只能使用 `provider1` 的 `model1` 和 `model2`。
    - `key3=provider2&provider3`: `key3` 只能使用 `provider2` 和 `provider3` 下的所有模型。使用 `&` 分隔多个提供商。

### 示例 (使用 `curl`)

#### 直接使用 Gemini 格式请求 Google Gemini（支持流式）

```bash
curl "https://<your-worker-url>/api/google-ai-studio/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
 -H 'content-type: application/json' \
 -H 'x-goog-api-key: your-super-secret-auth-key' \
 -d '{
      "contents": [
          {
            "role":"user",
            "parts": [
              {"text":"你是谁?"}
            ]
          }
        ]
      }'
```

#### 使用 OpenAI 兼容格式请求 Google Gemini (不支持流式，中文会乱码)

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

![](images/cherry-studio.png)

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
