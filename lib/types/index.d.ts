/**
 * Register a {@link NewApiAdapter} for the `newapi` provider route on
 * `ctx.llm`, with connection facts resolved per request instead of frozen at
 * load: the plugin layers its `cordis.yml` entry config under the optional
 * `llm-newapi` user-settings section (`ctx.settings`) and resolves the API
 * key through the optional credential seam (`ctx.credentials`), so a changed
 * base URL, catalog, or key reaches the very next request without restarting
 * anything, while an in-flight stream keeps the facts it started with. The
 * one registration-captured fact — the retry policy — re-registers the route
 * in place when it changes. The plugin also serves model discovery for the
 * `llm-newapi` settings namespace by interrogating `GET {baseURL}/models`.
 * @module dsh-llm-newapi
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import type { NewApiCatalogModel, NewApiConnectionOptions } from './adapter.js';
import type { ProviderHints } from './types.js';
export { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_EXCLUDE_PATTERNS, DEFAULT_PROVIDER_HINTS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, matchModelsDev, modelNameFromId, NewApiAdapter, normalizeBaseUrl, PKG, } from './adapter.js';
export { serializeRequest } from './serialize.js';
export { anthropicEventsToWire, serializeAnthropicRequest } from './anthropic.js';
export { responsesEventsToWire, serializeResponsesRequest } from './responses.js';
export type { NewApiAdapterOptions, NewApiCatalogModel, NewApiConnectionOptions } from './adapter.js';
export type * from './types.js';
export { parseChannelConn, registerChannelConnParser } from './channel-conn.js';
export type { ParsedChannelConn, ChannelConnParseResult, ChannelConnParseError, ChannelConnParser, } from './channel-conn.js';
export declare const name = "llm-newapi";
export declare const inject: string[];
/** Placeholder gateway base used when neither config nor environment names one. */
export declare const DEFAULT_BASE_URL = "https://newapi.example.com/v1";
/** Provider route prefix every instance owns: `newapi-<id>`. */
export declare const ROUTE_PREFIX = "newapi";
/**
 * Normalize a user-facing instance id to the route/ref-safe form used
 * everywhere (`newapi-seekai` → route, `newapi_seekai` → credential ref).
 * Empty or all-punctuation ids fall back to `default`.
 * @param id - the raw instance id from settings.
 * @returns the sanitized id.
 */
export declare function sanitizeInstanceId(id: string): string;
/** Provider route id for one instance (`newapi-<id>`). */
export declare function routeOf(id: string): string;
/** Credential reference for one instance (`newapi_<id>`). */
export declare function refOf(id: string): CredentialRef;
/**
 * The credential reference one instance's key resolves through: its stored
 * `apiKeyEnv` when it names one (the settings UI writes `newapi_<id>` there so
 * the official Models page can join the key), else the derived `newapi_<id>`.
 */
export declare function refForEntry(instance: NewApiInstanceConfig): CredentialRef;
/**
 * One configurable NewAPI gateway instance. The settings namespace holds a
 * LIST of these; each registers its own provider route `newapi-<id>` and
 * credential reference `newapi_<id>`, so several gateways can be configured
 * side by side without sharing keys. Field meanings match the legacy flat
 * `Config` fields below.
 */
export interface NewApiInstanceConfig {
    /**
     * Unique route suffix: becomes provider route `newapi-<id>` and credential
     * reference `newapi_<id>`. Sanitized (lowercased, non-alphanumerics to
     * `-`); empty falls back to `default`.
     */
    id: string;
    /** Display name shown in the provider picker; defaults to `id`. */
    displayName?: string;
    /**
     * Credential reference the gateway key is stored under. Defaults to
     * `newapi_<id>`; persisting it here (the settings UI writes it on save)
     * lets the official Models page discover the key and show the
     * configured/missing dot, because that page only joins credentials whose
     * `apiKeyEnv` the stored profile names.
     */
    apiKeyEnv?: string;
    /**
     * Wire protocol spoken with this gateway: OpenAI-compatible
     * `/chat/completions` (default), Anthropic Messages (`/v1/messages`), or
     * OpenAI Responses (`/v1/responses`).
     */
    protocol?: 'openai' | 'anthropic' | 'responses';
    /**
     * Extra API keys for the same instance. NewAPI groups keys into buckets,
     * each seeing a different model set — discovery merges every key's listing
     * and requests route per-model to the key that sees it. Each entry may
     * name its credential reference via `apiKeyEnv`; defaults to
     * `newapi_<id>_<keyId>`.
     */
    keys?: NewApiInstanceKeyConfig[];
    /** Gateway base including the `/v1` prefix. */
    baseURL?: string;
    /** Advisory models shown by discovery consumers; defaults to none. */
    models?: NewApiCatalogModel[];
    /** Non-chat model exclusion patterns; replaces the default list. */
    modelExcludePatterns?: string[];
    /** Positive context capacity used when a model has no exact value. */
    defaultContextWindow?: number;
    /** Default per-request output cap. */
    maxTokens?: number;
    /** Maximum gateway idle time while one stream read is outstanding. */
    streamIdleTimeoutMs?: number;
    /** Forward proxy for this instance's gateway traffic. */
    proxy?: ProxyConfig;
    /** Match-shaping hints for the models.dev params lookup. */
    providerHints?: ProviderHints;
    /** Provider-owned model-request retry policy. */
    retryPolicy?: RetryPolicyConfig;
    /**
     * Custom HTTP request headers injected into every gateway request this
     * instance makes (chat completions, model discovery, probes). Lets a gateway
     * that requires extra headers — `HTTP-Referer` / `X-Title` (OpenRouter-style),
     * a vendor `X-*` auth, or a `Origin` bot-protection pass — be served without
     * forking the adapter. Security-critical headers (`authorization`,
     * `content-type`, `accept`, and the product `User-Agent`) are applied AFTER
     * these and always win, so a stored header can never break auth or the wire
     * contract; an invalid name (not an RFC 7230 token) or a CRLF-bearing value
     * is rejected at resolve time.
     */
    headers?: Record<string, string>;
}
/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-newapi` settings-section shape. Since 0.9.0 the section stores
 * {@link instances}; the legacy flat fields remain for migration and are
 * folded into one `default` instance when `instances` is absent.
 */
export interface Config {
    /** 0.9.0+ shape: every configured gateway, one per entry. */
    instances?: NewApiInstanceConfig[];
    /** @deprecated Legacy single-instance gateway base; folded into `default`. */
    baseURL?: string;
    /** @deprecated Legacy single-instance model catalog. */
    models?: NewApiCatalogModel[];
    /**
     * Case-insensitive id substrings excluding discovered models that cannot
     * serve chat completions (embedding, rerank, ranker families). Replaces the
     * default {@link DEFAULT_MODEL_EXCLUDE_PATTERNS} list; an empty array
     * disables filtering. The hand-curated {@link models} catalog is unaffected.
     */
    modelExcludePatterns?: string[];
    /** Positive context capacity used when the selected model has no exact value (default 128,000). */
    defaultContextWindow?: number;
    /** Default per-request output cap; omission sends no cap and lets each upstream default apply. */
    maxTokens?: number;
    /** Maximum gateway idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs?: number;
    /**
     * Forward proxy for the models.dev catalog download performed by the
     *「更新模型信息」action: disabled by default; when enabled, that one
     * request is routed through `proxy.url` (a plain HTTP forward proxy).
     * Gateway traffic is untouched.
     */
    proxy?: ProxyConfig;
    /**
     * Match-shaping hints for the models.dev params lookup: family prefixes
     * and exact ids name which catalog provider counts as official (leading
     * match, flagged). Built-in families (glm→zai, gpt→openai, claude→
     * anthropic, …) apply first; these entries override and extend them.
     */
    providerHints?: ProviderHints;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
    /**
     * Custom request headers injected into every gateway request, same shape as
     * the per-instance field. Legacy flat configs fold into the `default`
     * instance and carry this block along.
     */
    headers?: Record<string, string>;
    /**
     * Global (non-instance) UI preferences — the undo-pill window and toggle.
     * The host adapter never reads these; they round-trip through the schema so
     * the settings page can persist them.
     */
    ui?: NewApiUiSettings;
    /**
     * Deleted instances awaiting restore or permanent removal. The host never
     * registers these (no route, no provider group); only the settings page
     * reads the list to offer 恢复 / 彻底删除.
     */
    trash?: NewApiInstanceConfig[];
}
/**
 * Global (non-instance) UI preferences — the undo-pill window and toggle.
 * The host adapter never reads these; they round-trip through the schema so
 * the settings page can persist them alongside the instances.
 */
export interface NewApiUiSettings {
    undoMs?: number;
    undoEnabled?: boolean;
    soundEnabled?: boolean;
    /**
     * Show the post-removal toast the first time an instance is moved into the
     * trash (default true). Once dismissed, the toast stays silent until the
     * user re-enables this switch in settings — repeated nudges for a known
     * behaviour are noise.
     */
    deleteRecoverHint?: boolean;
}
/** One extra API key of an instance (see {@link NewApiInstanceConfig.keys}). */
export interface NewApiInstanceKeyConfig {
    /** Stable local id (e.g. `k2`) used in the credential reference and UI. */
    id: string;
    /** Credential reference override; defaults to `newapi_<id>_<keyId>`. */
    apiKeyEnv?: string;
}
/** How an instance's gateway traffic reaches the network. */
export type ProxyMode = 'system' | 'direct' | 'custom';
/**
 * Forward-proxy settings for one instance's gateway traffic.
 * - `system`: follow the machine proxy (HTTP(S)_PROXY env, then the Windows
 *   WinINET system proxy — what Clash's "系统代理" writes).
 * - `direct`: no proxy.
 * - `custom`: route through `url`.
 * The legacy `{ enabled, url }` shape is accepted and migrates to a mode.
 */
export interface ProxyConfig {
    mode?: ProxyMode;
    /** Proxy URL; required (and validated) when `mode === 'custom'`. */
    url?: string;
    /** Legacy: whether the proxy is used; migrated to `mode`. */
    enabled?: boolean;
}
/** Default forward proxy: the conventional Clash port on loopback. */
export declare const DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
export declare const Config: z<Config>;
/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedNewApiOptions = NewApiConnectionOptions;
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - raw plugin config or resolved settings snapshot (an
 *   instance entry is the same shape minus the instance id fields).
 * @param environment - this run's environment layers, or `undefined` outside
 * the product CLI. A trusted layer may supply the gateway endpoint.
 * @param ref - the credential reference this connection resolves keys
 *   through; defaults to the legacy `newapi` ref (migration path).
 * @returns validated connection facts plus the credential reference.
 */
export declare function resolveAdapterOptions(config: Config | NewApiInstanceConfig, environment?: ReturnType<typeof launchEnvironmentOf>, ref?: CredentialRef): ResolvedNewApiOptions;
/**
 * The configured instances, folding the legacy flat config into one
 * `default` instance when `instances` is absent so a pre-0.9.0 settings
 * section keeps working unchanged.
 * @param raw - the current plugin config / settings snapshot.
 * @returns per-instance entries, each with its sanitized id, display name,
 *   and the instance config to resolve.
 */
export declare function instanceEntriesOf(raw: Config): ReadonlyArray<{
    id: string;
    displayName: string;
    instance: NewApiInstanceConfig;
}>;
export declare function apply(ctx: Context, config: Config): void;
