/**
 * NewAPI (OpenAI-compatible gateway) chat-completions wire format. Types only.
 *
 * NewAPI 聚合任意上游模型并统一暴露 OpenAI 协议；本文件即该协议的请求/
 * 响应/流增量形状，不含 DeepSeek 专属字段（thinking / reasoning_effort）。
 *
 * @module dsh-llm-newapi/types
 */

/** Request body for `POST {baseURL}/chat/completions`. */
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  /**
   * Stop sequences (OpenAI `stop`): generation halts as soon as the model
   * produces any one of these strings. Mapped from `GenerateOptions.stop`.
   */
  stop?: string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: a single string of user input. */
export interface WireUserMessage {
  role: 'user'
  content: string
}

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/**
 * Assistant-role history message. The harness always replays a string
 * `content` — `""` on tool-call-only and reasoning-only turns — because some
 * gateways reject null outright and the live API rejects null-content/
 * no-tool_calls assistant messages with a 400.
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string
  /**
   * CoT passback for DeepSeek-family upstreams routed through the gateway:
   * REQUIRED on assistant turns that carried tool calls, ignored elsewhere
   * (omitted there to save tokens). Other OpenAI-compatible upstreams ignore
   * the unknown field.
   */
  reasoning_content?: string
  tool_calls?: WireToolCall[]
}

/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  choices?: WireChoice[]
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null
}

/** One streamed choice (requests always ask for a single one); `finish_reason` is non-null only on its terminal chunk. */
export interface WireChoice {
  delta?: WireDelta
  finish_reason?: string | null
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
export interface WireDelta {
  role?: string
  /** Visible text. Null/empty on reasoning/tool-call chunks. */
  content?: string | null
  /**
   * Thinking CoT, transparently passed through by the gateway for
   * reasoning-capable upstreams (DeepSeek R1 family, etc.). The FIRST chunk
   * may carry an empty string (must not open a reasoning block); absent
   * entirely when the upstream model does not reason.
   */
  reasoning_content?: string | null
  tool_calls?: WireToolCallDelta[]
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number
  /**
   * Present on the first delta of each call only. Non-conforming gateways
   * repeat it as an EMPTY string on continuation deltas (instead of
   * omitting the field); the translator only accepts non-empty values so
   * the real id from the first delta survives (issue #1).
   */
  id?: string
  type?: 'function'
  function?: {
    /**
     * Present on the first delta of each call only. Non-conforming gateways
     * repeat it as an EMPTY string on continuation deltas; only non-empty
     * values are accepted so the tool name survives (issue #1).
     */
    name?: string
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string
  }
}

/**
 * Wire token accounting. `prompt_tokens` INCLUDES cache hits; `mapUsage`
 * subtracts them to keep the harness convention of disjoint counts.
 * `prompt_tokens_details.cached_tokens` is the OpenAI-compat spelling of the
 * hit count (the gateway normalizes upstream variants onto it).
 */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body (OpenAI-compatible shape, passed through by the gateway). */
export interface WireError {
  error?: { message?: string; type?: string; code?: string }
}

/** `GET {baseURL}/models` response (OpenAI models.list shape, native NewAPI). */
export interface WireModelList {
  object?: 'list'
  data?: WireModelEntry[]
}

/** One advertised model entry; gateways disclose an id and nothing else. */
export interface WireModelEntry {
  id: string
  /** Human-readable name when the gateway supplies one. */
  name?: string
  /** OpenAI `owned_by` field when present. */
  owned_by?: string
}

/** Root of `https://models.dev/api.json`: one entry per provider id. */
export interface ModelsDevApi {
  [provider: string]: {
    models?: Record<string, ModelsDevModel>
  }
}

/** Match-shaping hints for the models.dev params lookup. */
export interface ProviderHints {
  /** Family prefix → provider id, consulted before catalog order. */
  defaults?: Record<string, string>
  /** Exact gateway model id → provider id; wins over {@link defaults}. */
  models?: Record<string, string>
}

/** One model entry in the models.dev catalog. */
export interface ModelsDevModel {
  name?: string
  /** Capacity facts: `limit.context` and `limit.output` are token counts. */
  limit?: { context?: number; output?: number }
  /** How the model takes reasoning control; `effort` carries the levels. */
  reasoning_options?: Array<{ type: string; values?: Array<string | null> }>
}

/** One models.dev provider match for a gateway model id. */
export interface ModelsDevMatch {
  /** models.dev provider id the entry lives under (e.g. `qwen`, `alibaba`). */
  provider: string
  /** Human-readable name from the catalog entry, when present. */
  name?: string
  /** Combined request/response context capacity (`limit.context`). */
  contextWindow?: number
  /** Per-request output cap (`limit.output`). */
  maxTokens?: number
  /** Supported reasoning-effort ids (`reasoning_options` type `effort`). */
  reasoningEfforts?: string[]
  /** True when this match's provider is the model's official vendor. */
  official?: boolean
}

/** Request payload of the `models-dev-params` RPC endpoint. */
export interface ModelsDevParamsRequest {
  /** Gateway model ids to look up, verbatim. */
  modelIds: string[]
  /** Forward-proxy URL to route the api.json download through, when enabled. */
  proxyUrl?: string
}

/** Response payload of the `models-dev-params` RPC endpoint. */
export interface ModelsDevParamsResponse {
  /** Per requested id: every provider entry that matched it, in catalog order. */
  models: Array<{ id: string; matches: ModelsDevMatch[] }>
}

/**
 * A connectivity/auth probe of one gateway endpoint. The web section (and any
 * importer of a channel-conn descriptor) calls this to confirm a pasted
 * endpoint actually serves models before saving it. The probe deliberately
 * uses `GET /v1/models` — not a chat completion — because some newapi-based
 * deployments put their chat endpoint behind bot protection (e.g. Cloudflare
 * Turnstile) that blocks scripted inference while still answering the models
 * listing, so a models-based probe reports a usable "reachable + auth OK"
 * signal the chat endpoint would falsely fail.
 */
export interface ProbeResult {
  /** True when the probe completed with a usable outcome (see `error`). */
  ok: boolean
  /** False when DNS/TLS/connection failed before any HTTP response arrived. */
  reachable: boolean
  /** False on 401/403; `undefined` when no HTTP response arrived. */
  authValid?: boolean
  /** HTTP status when a response arrived. */
  status?: number
  /** Number of models the gateway advertises via `GET /models`. */
  modelCount?: number
  /** A few advertised model ids, for a quick human sanity check. */
  sampleModels?: string[]
  /** Round-trip latency in milliseconds for the `GET /models` call. */
  latencyMs: number
  /**
   * Minimal-cost chat completion check, present only when the caller named a
   * `chatModel`. Billed a handful of tokens at most (max_tokens 5).
   */
  chat?: ChatProbeResult
  /**
   * Minimal-cost tool-call check, present only when the caller named a
   * `toolCallModel`. Verifies the gateway's function-calling path.
   */
  toolCall?: ToolCallProbeResult
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/**
 * One minimal chat-completion probe (`POST /chat/completions` with a
 * "Reply with exactly: ok" prompt and `max_tokens: 5`). The goal is the
 * cheapest possible end-to-end check that the gateway actually completes a
 * conversation turn, not a meaningful model eval — so every field is
 * deliberately small.
 */
export interface ChatProbeResult {
  /** True when the gateway returned a 2xx completion. */
  ok: boolean
  /** HTTP status, when a response arrived. */
  status?: number
  /** Round-trip latency in milliseconds for the chat completion. */
  latencyMs: number
  /** First completion text (expected to be roughly "ok"). */
  text?: string
  /** Wire finish reason, when the completion reported one. */
  finishReason?: string
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/**
 * One minimal tool-call probe (`POST /chat/completions` with a `ping` tool
 * declared and a prompt asking the model to call it). Verifies the gateway
 * end-to-end exercises the function-calling path — discovery and text chat
 * can be healthy while tool calls still fail (missing `tools` passthrough,
 * a gateway that strips tool schemas, an upstream that refuses). Also a
 * near-zero-cost check: `max_tokens` caps the reply.
 */
export interface ToolCallProbeResult {
  /** True when the gateway returned a `tool_calls[].function.name === 'ping'`. */
  ok: boolean
  /** HTTP status, when a response arrived. */
  status?: number
  /** Round-trip latency in milliseconds for the tool-call completion. */
  latencyMs: number
  /** The tool name the model actually called (expected `ping`). */
  toolName?: string
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/**
 * Request payload of the `probe` RPC endpoint. Mirrors the discovery draft:
 * a base and a one-shot credential override the current connection snapshot,
 * so a user can probe a pasted endpoint before committing the key.
 */
export interface ProbeRequest {
  /** Gateway base overriding the snapshot; normalized like `baseURL` config. */
  baseURL?: string
  /** One-shot API key overriding the stored credential (never persisted). */
  apiKey?: string
  /** Caller cancellation. */
  signal?: AbortSignal
  /**
   * When set, also run a minimal-cost chat completion probe against this
   * model id ("Reply with exactly: ok", `max_tokens: 5`). Absent, the probe
   * stays free (models listing only).
   */
  chatModel?: string
  /** Time bound for the chat probe, milliseconds (default 20_000). */
  chatTimeoutMs?: number
  /**
   * When set, also run a minimal tool-call completion probe against this
   * model id (a `ping` function with the model asked to call it). Absent,
   * no tool-call check runs.
   */
  toolCallModel?: string
  /** Time bound for the tool-call probe, milliseconds (default 30_000). */
  toolCallTimeoutMs?: number
  /**
   * Forward proxy to route both probe requests through; overrides the
   * instance snapshot's proxy so an instance with its own proxy probes
   * truthfully.
   */
  proxyUrl?: string
}
