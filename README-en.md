<p align="center">
  <img src="images/banner.png">
  <a href="https://deepwiki.com/glidea/one-balance"><img src="https://deepwiki.com/badge.svg"/></a>
</p>

`One Balance` is an API key load balancer built on Cloudflare. It leverages the routing capabilities of Cloudflare AI Gateway and adds features for round-robin rotation and health checks for multiple API keys.

If you have multiple API keys with quota limits (e.g., Google AI Studio), `One Balance` can automatically rotate through them, maximizing the utilization of your available resources.

## Core Features

- **Free and Simple**: Built on Cloudflare Workers, deployable with a single command, and fully utilizes the free tier.
- **Reduces Ban Risk**: By routing requests through Cloudflare AI Gateway, it effectively lowers the probability of API keys (especially for Gemini) being banned.
- **Intelligent Error Handling**:
    - **Model-level Rate Limiting**: Accurately identifies and temporarily blocks specific models that have hit their rate limits. It can intelligently distinguish between per-minute and per-day quotas for Google AI Studio, applying different cooldown periods (e.g., a 24-hour cooldown for daily quota exhaustion).
    - **Automatic Circuit Breaking**: Permanently disables keys that are blocked by the provider (e.g., 403 errors), reducing unnecessary retries.
- **Wide Compatibility**: Supports all API providers compatible with Cloudflare AI Gateway. This includes round-robin support for Gemini TTS, likely a unique feature on the internet (already in use at https://zenfeed.xyz for real-time news podcast generation).

## Deployment Guide

#### 0. Prerequisites

- Install [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/).
- Have a Cloudflare account.

#### 1. Create an AI Gateway

- Log in to your Cloudflare dashboard.
- Navigate to `AI` -> `AI Gateway`.
- Create a new AI Gateway and name it **`one-balance`**.

#### 2. One-Click Deploy!

- Set `AUTH_KEY` as the password to access this service. This key should be complex and secure.
- Run the deployment command:

```bash
git clone https://github.com/glidea/one-balance.git && cd one-balance && pnpm install

# Mac/Linux
git clone https://github.com/glidea/one-balance.git
cd one-balance
pnpm install

# Mac/Linux
AUTH_KEY=your-super-secret-auth-key pnpm run deploycf

# Windows (PowerShell)
$env:AUTH_KEY = "your-super-secret-auth-key"; pnpm run deploycf
```

- The script will guide you to log in to `wrangler` (if you haven't already), automatically create the required D1 database, and deploy the Worker. Upon successful deployment, you will get a Worker URL, for example, `https://one-balance.<your-subdomain>.workers.dev`.

## Usage

### 1. Configure Keys for Rotation

Visit `https://<your-worker-url>`

### 2. Access the API

`https://<your-worker-url>/api/<ai-gateway-path>`

For example, if your Worker URL is `https://one-balance.workers.dev` and you want to send a request to Google Gemini 1.5 Pro, the final request URL will be `https://one-balance.workers.dev/api/google/v1beta/models/gemini-1.5-pro-latest:generateContent`.

#### Authentication

The `AUTH_KEY` set during deployment needs to be sent via the corresponding provider's authentication header.

- **OpenAI**: `Authorization: Bearer <AUTH_KEY>`
- **Google, Anthropic, Elevenlabs, Azure OpenAI, Cartesia**: Use the corresponding custom header, for example, `x-goog-api-key: <AUTH_KEY>`.

##### Advanced Authentication Configuration

The `AUTH_KEY` environment variable supports a more complex format, allowing multiple keys, each with its own permissions and expiration time. The format is as follows:

`AUTH_KEY="key1=provider1,model1,model2;key2;key3(1758077793)=provider2&provider3"`

- **Separator**: Multiple key definitions are separated by a semicolon (`;`).
- **Unrestricted Keys**: `key2` is an unrestricted key. It can access all providers and models. **Only unrestricted keys can log in to the Web UI.**
- **Keys with Expiration**: `key3(1758077793)` has a Unix timestamp (in seconds) appended in parentheses, which sets the key's expiration time.
- **Permission Control**:
    - `key1=provider1,model1,model2`: `key1` is restricted to use only `model1` and `model2` from `provider1`.
    - `key3=...=provider2&provider3`: `key3` is restricted to use any model from `provider2` and `provider3`. Multiple providers are separated by `&`.

### Examples (using `curl`)

#### Requesting Google Gemini (OpenAI-compatible format)

```bash
curl "https://<your-worker-url>/api/compat/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-super-secret-auth-key" \
  -d '{
    "model": "google/gemini-1.5-pro-latest",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

#### Requesting OpenAI

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

For more details, please refer to https://developers.cloudflare.com/ai-gateway/providers

## How it works

### Architecture

`One Balance` acts as a middle layer, receiving all API requests and intelligently forwarding them to the Cloudflare AI Gateway. Below is a high-level architecture diagram of the system:

```mermaid
graph TD
    subgraph "User"
        User["👨‍💻<br>Client"]
    end

    subgraph "Cloudflare Environment"
        OneBalance["<b>One Balance Worker</b>"]
        D1["🗄️ D1 Database"]
        AIGW["Cloudflare AI Gateway"]

        OneBalance -- "Get/Update Key Status" <--> D1
        OneBalance -- "Forward Request" --> AIGW
    end

    subgraph "Third-party Services"
        Provider["🤖<br>AI Provider<br>(Google, OpenAI...)"]
    end

    User -- "1. API Request (with service AUTH_KEY)" --> OneBalance
    AIGW -- "2. Proxy Request (with provider key)" --> Provider
    Provider -- "3. API Response" --> AIGW
    AIGW -- "4. Response" --> OneBalance
    OneBalance -- "5. Final Response" --> User
```

> You might ask why not use Cloudflare KV. Answer: The free quota is too small.

### Key Lifecycle

```mermaid
graph TD
    NonExistent("<b>(Non-existent)</b>")

    subgraph "Lifecycle"
        direction LR
        Active("Active")
        CoolingDown("Cooling Down<br><i>(For a specific model)</i>")
        Blocked("Blocked")
    end

    NonExistent -- "1. Create (Added by admin)" --> Active

    Active -- "2a. Use: Success (2xx)" --> Active
    Active -- "2b. Use: Rate Limited (429)" --> CoolingDown
    Active -- "2c. Use: Invalid (401, 403)" --> Blocked

    CoolingDown -- "Cooldown period ends" --> Active

    Active -- "3. Delete" --> NonExistent
    Blocked -- "3. Delete" --> NonExistent
    CoolingDown -- "3. Delete" --> NonExistent
```

### Design for X (DFX)

#### Reliability

The system's reliability is ensured through the following points:

1.  **Automatic Circuit Breaking and Retries**: When an API key becomes invalid (e.g., returns a 401 or 403 error), the system immediately updates its status to `blocked`, removes it from the available pool, and automatically retries with the next available key. This prevents wasting time and requests on invalid keys.
2.  **Model-level Intelligent Rate Limiting**: When a request fails due to rate limiting (a 429 error), the system doesn't crudely disable the entire key. Instead, it sets a cooldown period for the **specific model** that was hit. For Google AI Studio's free tier, it can intelligently distinguish between **per-minute rate limits** (approx. 1-minute cooldown) and **daily quota limits** (24-hour cooldown), maximizing the value of each key.
3.  **Reliance on the Cloudflare Ecosystem**: The entire service is built on Cloudflare's highly available infrastructure, including Workers, D1, and AI Gateway, with its stability guaranteed by Cloudflare.

#### Scalability

1.  **Serverless Architecture**: Cloudflare Workers automatically scale with traffic, so you don't need to worry about server maintenance or capacity planning.
2.  **State Separation**: The Worker itself is stateless. All key statuses are persisted in a D1 database, which allows the system to be easily scaled horizontally.
3.  **Easy to Extend**:
    - **New Keys**: Simply add them in bulk via the management interface, and the system will automatically include them in the rotation pool.
    - **New Providers**: Thanks to AI Gateway, supporting new providers usually only requires adding a single line of configuration in the code to specify their special authentication header, with no changes to the core logic.

#### Observability

1.  **Core Event Logging**: The system outputs key events via `console.log`, such as when a key is blocked or a model enters a cooldown period. You can view these logs in your Cloudflare dashboard to diagnose issues.
2.  **Cloudflare AI Gateway Analytics**: AI Gateway comes with a powerful analytics panel where you can clearly see key metrics like request counts, error rates, latency, and costs.
3.  **Management Interface**: The system provides a UI where you can visually check the current status (active, blocked) and cooldown details for all keys.
