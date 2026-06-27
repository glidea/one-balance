var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.ts
var PROVIDER_AUTH_HEADER = {
  "google-ai-studio": "x-goog-api-key",
  anthropic: "x-api-key"
};
function authHeaderFor(provider) {
  return PROVIDER_AUTH_HEADER[provider] ?? "Authorization";
}
__name(authHeaderFor, "authHeaderFor");
function listModelsPath(provider) {
  if (provider === "google-ai-studio") return "/v1beta/models";
  return "/v1/models";
}
__name(listModelsPath, "listModelsPath");
function parseModelIds(provider, body) {
  const out = [];
  if (!body || typeof body !== "object") return out;
  const b = body;
  if (Array.isArray(b.models)) {
    for (const m of b.models) {
      const name = typeof m.name === "string" ? m.name : "";
      if (name) out.push(name.replace(/^models\//, ""));
    }
  }
  if (Array.isArray(b.data)) {
    for (const m of b.data) {
      if (typeof m.id === "string") out.push(m.id);
    }
  }
  return out;
}
__name(parseModelIds, "parseModelIds");
var catalogueCache = null;
async function activeProviders(env) {
  const res = await env.DB.prepare(
    "SELECT DISTINCT provider FROM keys WHERE status = 'active'"
  ).all();
  return res.results.map((r) => r.provider);
}
__name(activeProviders, "activeProviders");
async function oneActiveKey(env, provider) {
  const res = await env.DB.prepare(
    "SELECT key FROM keys WHERE status = 'active' AND provider = ? ORDER BY RANDOM() LIMIT 1"
  ).bind(provider).all();
  return res.results[0]?.key ?? null;
}
__name(oneActiveKey, "oneActiveKey");
async function fetchProviderModels(env, provider) {
  const key = await oneActiveKey(env, provider);
  if (!key) return [];
  const url = `${env.AI_GATEWAY_BASE}/${provider}${listModelsPath(provider)}`;
  const headers = { "Content-Type": "application/json" };
  const h = authHeaderFor(provider);
  headers[h] = h === "Authorization" ? `Bearer ${key}` : key;
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.error(`ListModels ${provider} -> ${resp.status}`);
      return [];
    }
    return parseModelIds(provider, await resp.json());
  } catch (e) {
    console.error(`ListModels ${provider} failed:`, e.message);
    return [];
  }
}
__name(fetchProviderModels, "fetchProviderModels");
async function getCatalogue(env) {
  const now = Date.now();
  if (catalogueCache && now < catalogueCache.expiresAt) {
    return catalogueCache.data;
  }
  const providers = await activeProviders(env);
  const data = /* @__PURE__ */ new Map();
  await Promise.all(
    providers.map(async (p) => {
      const models = await fetchProviderModels(env, p);
      if (models.length > 0) data.set(p, models);
    })
  );
  const ttl = Number(env.MODELS_CACHE_TTL_MS) || 3e5;
  catalogueCache = { data, expiresAt: now + ttl };
  return data;
}
__name(getCatalogue, "getCatalogue");
function resolveProvider(catalogue, model) {
  const matches = [];
  for (const [provider, models] of catalogue) {
    if (models.includes(model)) matches.push(provider);
  }
  return matches.length === 1 ? matches[0] : null;
}
__name(resolveProvider, "resolveProvider");
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
var WARNING_PATTERNS = [
  "Function call is missing a thought_signature in functionCall parts",
  "missing thought_signature may lead to degraded model performance",
  "Please refer to https://ai.google.dev/gemini-api/docs/thought-signatures"
];
function isOnlyWarning(content) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const sentences = trimmed.split(/[.!]\s+|\n/).filter((s) => s.trim());
  if (sentences.length === 0) return false;
  return sentences.every(
    (s) => WARNING_PATTERNS.some((p) => s.includes(p))
  );
}
__name(isOnlyWarning, "isOnlyWarning");
function hasWarning(content) {
  return WARNING_PATTERNS.some((p) => content.includes(p));
}
__name(hasWarning, "hasWarning");
function createSSEWarningFilter() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 2);
        const result = processSSEEvent(rawEvent);
        if (result !== null) {
          controller.enqueue(encoder.encode(result + "\n\n"));
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        const result = processSSEEvent(buffer);
        if (result !== null) {
          controller.enqueue(encoder.encode(result + "\n\n"));
        }
      }
    }
  });
}
__name(createSSEWarningFilter, "createSSEWarningFilter");
function processSSEEvent(rawEvent) {
  const lines = rawEvent.split("\n");
  let dataPayload = "";
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      dataPayload = line.substring(6);
      break;
    }
    if (line === "data:") {
      return rawEvent;
    }
  }
  if (!dataPayload) return rawEvent;
  if (dataPayload === "[DONE]") return rawEvent;
  try {
    const obj = JSON.parse(dataPayload);
    if (!obj.choices) return rawEvent;
    let anyModified = false;
    for (const choice of obj.choices) {
      const delta = choice.delta;
      if (!delta) continue;
      const content = delta.content;
      if (typeof content === "string" && content.length && hasWarning(content)) {
        if (isOnlyWarning(content)) {
          return null;
        }
        delta.content = stripWarningSentences(content);
        anyModified = true;
      }
      const toolCalls = delta.tool_calls;
      if (toolCalls) {
        for (const tc of toolCalls) {
          if (tc.extra_content) {
            const google = tc.extra_content["google"];
            if (google && "thought_signature" in google) {
              delete google["thought_signature"];
              if (Object.keys(google).length === 0) {
                delete tc.extra_content;
              }
              anyModified = true;
            }
          }
        }
      }
    }
    if (anyModified) {
      return lines.map(
        (line) => line.startsWith("data: ") ? `data: ${JSON.stringify(obj)}` : line
      ).join("\n");
    }
  } catch {
  }
  return rawEvent;
}
__name(processSSEEvent, "processSSEEvent");
function stripWarningSentences(content) {
  const sentences = content.split(/(?<=\.)\s+|\n/);
  const kept = sentences.filter((s) => !hasWarning(s));
  return kept.join(" ").trim();
}
__name(stripWarningSentences, "stripWarningSentences");
async function handleGeminiNative(request, env, start) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/v1beta/models" && method === "GET") {
    const catalogue = await getCatalogue(env);
    const geminiModels = catalogue.get("google-ai-studio") ?? [];
    const data = geminiModels.map((m) => ({
      name: `models/${m}`,
      displayName: m
    }));
    return json({ models: data });
  }
  const modelMatch = path.match(/^(\/v1beta)?\/models\/(.+):(generateContent|streamGenerateContent)$/);
  if (!modelMatch) {
    return new Response("Not found", { status: 404 });
  }
  const model = modelMatch[2];
  const operation = modelMatch[3];
  if (method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const apiKey = request.headers.get("x-goog-api-key") ?? "";
  if (!apiKey) {
    return new Response("Missing x-goog-api-key header", { status: 401 });
  }
  const proxyReq = new Request(
    `https://internal/api/google-ai-studio/v1beta/models/${model}:${operation}${url.search}`,
    {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") ?? "application/json",
        "x-goog-api-key": apiKey
      },
      body: request.body
    }
  );
  const controller = new AbortController();
  const timeoutMs = Number(env.UPSTREAM_TIMEOUT_MS) || 25e3;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await env.ONE_BALANCE.fetch(proxyReq, { signal: controller.signal });
    const ct = resp.headers.get("content-type") ?? "none";
    console.log(`gemini-native ${method} ${path} -> ${resp.status} ct=${ct} (${Date.now() - start}ms)`);
    const cleanHeaders = new Headers(resp.headers);
    cleanHeaders.delete("content-disposition");
    if (resp.body) {
      const [tee1, tee2] = resp.body.tee();
      const diagPromise = new Response(tee1).text().then((text) => {
        console.log(`DIAG SSE first 1500: ${text.substring(0, 1500)}`);
      });
      diagPromise.catch(() => {
      });
      return new Response(tee2, {
        status: resp.status,
        headers: cleanHeaders
      });
    }
    return new Response(null, {
      status: resp.status,
      headers: cleanHeaders
    });
  } catch (e) {
    const err = e;
    console.error(`gemini-native proxy error after ${Date.now() - start}ms:`, err.message);
    return new Response(err.message || "Upstream error", {
      status: err.name === "AbortError" ? 504 : 502
    });
  } finally {
    clearTimeout(timer);
  }
}
__name(handleGeminiNative, "handleGeminiNative");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const start = Date.now();
    if (path === "/health") return new Response("ok");
    if (path === "/v1/models" || path === "/models") {
      const catalogue = await getCatalogue(env);
      const data = [];
      for (const [provider, models] of catalogue) {
        for (const m of models) {
          data.push({ id: `${provider}/${m}`, object: "model", owned_by: provider });
        }
      }
      return json({ object: "list", data });
    }
    if (path.startsWith("/v1beta") || method === "POST" && path.startsWith("/models/")) {
      return handleGeminiNative(request, env, start);
    }
    if (path === "/v1/chat/completions" || path === "/chat/completions") {
      if (method !== "POST") return new Response("Method not allowed", { status: 405 });
      let raw;
      try {
        raw = await request.text();
      } catch (e) {
        console.error("read body failed:", e.message);
        return new Response("Failed to read request body", { status: 400 });
      }
      let finalBody;
      try {
        const payload = JSON.parse(raw);
        if (typeof payload.model === "string" && !payload.model.includes("/")) {
          const catalogue = await getCatalogue(env);
          const provider = resolveProvider(catalogue, payload.model);
          if (provider) {
            payload.model = `${provider}/${payload.model}`;
            console.log(`prefixed model -> ${payload.model}`);
          } else {
            console.log(`no unique provider for "${payload.model}", passthrough`);
          }
        }
        finalBody = JSON.stringify(payload);
      } catch (e) {
        console.error("parse body failed:", e.message);
        return new Response("Invalid JSON in request body", { status: 400 });
      }
      const proxyReq = new Request(`https://internal${env.BACKEND_PATH}${url.search}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: request.headers.get("Authorization") ?? ""
        },
        body: finalBody
      });
      const controller = new AbortController();
      const timeoutMs = Number(env.UPSTREAM_TIMEOUT_MS) || 25e3;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await env.ONE_BALANCE.fetch(proxyReq, { signal: controller.signal });
        const ct = resp.headers.get("content-type") ?? "none";
        console.log(`${method} ${path} -> ${resp.status} ct=${ct} (${Date.now() - start}ms)`);
        if (resp.body && ct.includes("text/event-stream")) {
          const filtered = resp.body.pipeThrough(createSSEWarningFilter());
          return new Response(filtered, {
            status: resp.status,
            headers: resp.headers
          });
        }
        return resp;
      } catch (e) {
        const err = e;
        console.error(`proxy error after ${Date.now() - start}ms:`, err.message);
        return new Response(err.message || "Upstream error", {
          status: err.name === "AbortError" ? 504 : 502
        });
      } finally {
        clearTimeout(timer);
      }
    }
    return new Response("Not found", { status: 404 });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
