/**
 * models.dev parameter-lookup shapes for the browser half. Structurally the
 * same as the host's `types.ts` entries (the RPC payload crosses the wire as
 * plain JSON), mirrored here because the client program compiles with
 * `rootDir: src/client` and cannot import across the directory boundary.
 */

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

/** Minimal-cost chat completion probe outcome (mirrors host `types.ts`). */
export interface ChatProbeResult {
  /** True when the gateway returned a 2xx completion. */
  ok: boolean
  /** HTTP status, when a response arrived. */
  status?: number
  /** Round-trip latency in milliseconds. */
  latencyMs: number
  /** First completion text (expected to be roughly "ok"). */
  text?: string
  /** Wire finish reason, when reported. */
  finishReason?: string
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/** Minimal tool-call probe outcome (mirrors host `types.ts`). */
export interface ToolCallProbeResult {
  /** True when the gateway returned a `tool_calls[].function.name === 'ping'`. */
  ok: boolean
  /** HTTP status, when a response arrived. */
  status?: number
  /** Round-trip latency in milliseconds. */
  latencyMs: number
  /** The tool name the model actually called (expected `ping`). */
  toolName?: string
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/** Result of the `probe` RPC endpoint (mirrors host `types.ts`). */
export interface ProbeResult {
  /** True when the probe completed with a usable outcome. */
  ok: boolean
  /** False when DNS/TLS/connection failed before any HTTP response arrived. */
  reachable: boolean
  /** False on 401/403; undefined when no HTTP response arrived. */
  authValid?: boolean
  /** HTTP status when a response arrived. */
  status?: number
  /** Number of models advertised via `GET /models`. */
  modelCount?: number
  /** A few advertised model ids, for a quick sanity check. */
  sampleModels?: string[]
  /** Round-trip latency in milliseconds for the `GET /models` call. */
  latencyMs: number
  /** Present when the caller requested a chat probe (`chatModel`). */
  chat?: ChatProbeResult
  /** Present when the caller requested a tool-call probe (`toolCallModel`). */
  toolCall?: ToolCallProbeResult
  /** Human-readable failure reason when `ok` is false. */
  error?: string
}

/** Request payload of the `probe` RPC endpoint. */
export interface ProbeRequest {
  /** Gateway base overriding the snapshot (normalized like the config). */
  baseURL?: string
  /** One-shot API key overriding the stored credential (never persisted). */
  apiKey?: string
  /** When set, also run a minimal-cost chat probe against this model id. */
  chatModel?: string
  /** Time bound for the chat probe, milliseconds (host default 20_000). */
  chatTimeoutMs?: number
  /** When set, also run a minimal tool-call probe against this model id. */
  toolCallModel?: string
  /** Time bound for the tool-call probe, milliseconds (host default 30_000). */
  toolCallTimeoutMs?: number
  /** Forward proxy for the probe requests; overrides the snapshot's proxy. */
  proxyUrl?: string
}

/** Connection facts parsed from a channel-connection descriptor. */
export interface ParsedChannelConn {
  /** Normalized gateway base with the `/v1` prefix. */
  baseURL: string
  /** The API key to store under the `newapi` credentials reference. */
  apiKey: string
  /** Which descriptor format produced this. */
  sourceType: string
}
