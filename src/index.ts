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

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, DirectoryRegistrationHandle, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { execFileSync } from 'node:child_process'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  NewApiAdapter,
  normalizeBaseUrl,
  PKG,
} from './adapter.ts'
import type { NewApiCatalogModel, NewApiConnectionOptions } from './adapter.ts'
import type { ModelsDevParamsRequest, ProbeRequest, ProviderHints } from './types.ts'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { parseChannelConn } from './channel-conn.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROVIDER_HINTS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  matchModelsDev,
  modelNameFromId,
  NewApiAdapter,
  normalizeBaseUrl,
  PKG,
} from './adapter.ts'
export { serializeRequest } from './serialize.ts'
export type { NewApiAdapterOptions, NewApiCatalogModel, NewApiConnectionOptions } from './adapter.ts'
export type * from './types.ts'
export { parseChannelConn, registerChannelConnParser } from './channel-conn.ts'
export type {
  ParsedChannelConn,
  ChannelConnParseResult,
  ChannelConnParseError,
  ChannelConnParser,
} from './channel-conn.ts'

export const name = 'llm-newapi'
export const inject = ['llm']

const NS = settingsNamespace('llm-newapi')
/**
 * Legacy single-route credential reference, kept as the migration fallback:
 * a pre-0.9.0 config (flat `baseURL`/`models`/`proxy` in the namespace) maps
 * to one instance whose credential still resolves through `newapi`. New
 * instances use per-instance refs `newapi_<id>`.
 */
const API_KEY_REF = 'newapi'
/** Environment variable naming this provider's endpoint, honored only from trusted layers. */
const BASE_URL_ENV = 'NEWAPI_BASE_URL'
/** Placeholder gateway base used when neither config nor environment names one. */
export const DEFAULT_BASE_URL = 'https://newapi.example.com/v1'
/** Provider route prefix every instance owns: `newapi-<id>`. */
export const ROUTE_PREFIX = 'newapi'
/** Credential ref prefix every instance owns: `newapi_<id>` (refs forbid dashes). */
const REF_PREFIX = 'newapi'

/**
 * Normalize a user-facing instance id to the route/ref-safe form used
 * everywhere (`newapi-seekai` → route, `newapi_seekai` → credential ref).
 * Empty or all-punctuation ids fall back to `default`.
 * @param id - the raw instance id from settings.
 * @returns the sanitized id.
 */
export function sanitizeInstanceId(id: string): string {
  const safe = id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return safe.length > 0 ? safe : 'default'
}

/** Provider route id for one instance (`newapi-<id>`). */
export function routeOf(id: string): string {
  return `${ROUTE_PREFIX}-${sanitizeInstanceId(id)}`
}

/** Credential reference for one instance (`newapi_<id>`). */
export function refOf(id: string): CredentialRef {
  return credentialRef(`${REF_PREFIX}_${sanitizeInstanceId(id).replace(/-/g, '_')}`)
}

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
  id: string
  /** Display name shown in the provider picker; defaults to `id`. */
  displayName?: string
  /**
   * Credential reference the gateway key is stored under. Defaults to
   * `newapi_<id>`; persisting it here (the settings UI writes it on save)
   * lets the official Models page discover the key and show the
   * configured/missing dot, because that page only joins credentials whose
   * `apiKeyEnv` the stored profile names.
   */
  apiKeyEnv?: string
  /** Gateway base including the `/v1` prefix. */
  baseURL?: string
  /** Advisory models shown by discovery consumers; defaults to none. */
  models?: NewApiCatalogModel[]
  /** Non-chat model exclusion patterns; replaces the default list. */
  modelExcludePatterns?: string[]
  /** Positive context capacity used when a model has no exact value. */
  defaultContextWindow?: number
  /** Default per-request output cap. */
  maxTokens?: number
  /** Maximum gateway idle time while one stream read is outstanding. */
  streamIdleTimeoutMs?: number
  /** Forward proxy for this instance's gateway traffic. */
  proxy?: ProxyConfig
  /** Match-shaping hints for the models.dev params lookup. */
  providerHints?: ProviderHints
  /** Provider-owned model-request retry policy. */
  retryPolicy?: RetryPolicyConfig
}

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-newapi` settings-section shape. Since 0.9.0 the section stores
 * {@link instances}; the legacy flat fields remain for migration and are
 * folded into one `default` instance when `instances` is absent.
 */
export interface Config {
  /** 0.9.0+ shape: every configured gateway, one per entry. */
  instances?: NewApiInstanceConfig[]
  /** @deprecated Legacy single-instance gateway base; folded into `default`. */
  baseURL?: string
  /** @deprecated Legacy single-instance model catalog. */
  models?: NewApiCatalogModel[]
  /**
   * Case-insensitive id substrings excluding discovered models that cannot
   * serve chat completions (embedding, rerank, ranker families). Replaces the
   * default {@link DEFAULT_MODEL_EXCLUDE_PATTERNS} list; an empty array
   * disables filtering. The hand-curated {@link models} catalog is unaffected.
   */
  modelExcludePatterns?: string[]
  /** Positive context capacity used when the selected model has no exact value (default 128,000). */
  defaultContextWindow?: number
  /** Default per-request output cap; omission sends no cap and lets each upstream default apply. */
  maxTokens?: number
  /** Maximum gateway idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /**
   * Forward proxy for the models.dev catalog download performed by the
   *「更新模型信息」action: disabled by default; when enabled, that one
   * request is routed through `proxy.url` (a plain HTTP forward proxy).
   * Gateway traffic is untouched.
   */
  proxy?: ProxyConfig
  /**
   * Match-shaping hints for the models.dev params lookup: family prefixes
   * and exact ids name which catalog provider counts as official (leading
   * match, flagged). Built-in families (glm→zai, gpt→openai, claude→
   * anthropic, …) apply first; these entries override and extend them.
   */
  providerHints?: ProviderHints
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

/** How an instance's gateway traffic reaches the network. */
export type ProxyMode = 'system' | 'direct' | 'custom'

/**
 * Forward-proxy settings for one instance's gateway traffic.
 * - `system`: follow the machine proxy (HTTP(S)_PROXY env, then the Windows
 *   WinINET system proxy — what Clash's "系统代理" writes).
 * - `direct`: no proxy.
 * - `custom`: route through `url`.
 * The legacy `{ enabled, url }` shape is accepted and migrates to a mode.
 */
export interface ProxyConfig {
  mode?: ProxyMode
  /** Proxy URL; required (and validated) when `mode === 'custom'`. */
  url?: string
  /** Legacy: whether the proxy is used; migrated to `mode`. */
  enabled?: boolean
}

const catalogModel: z<NewApiCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  reasoningEfforts: z.array(z.string()),
  defaultReasoningEffort: z.string(),
})

/** Default forward proxy: the conventional Clash port on loopback. */
export const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890'

const proxySchema: z<ProxyConfig> = z.object({
  // No `.default` on mode: a pre-0.9.4 `{ enabled, url }` block must reach
  // `proxyModeOf` with `mode` absent so the legacy `enabled` flag migrates.
  // The whole-block default below covers a completely absent proxy.
  mode: z.string(),
  url: z.string().default(DEFAULT_PROXY_URL),
  // Legacy: pre-0.9.4 sections used `enabled`; keep accepting it.
  enabled: z.boolean(),
}).default({ mode: 'system', url: DEFAULT_PROXY_URL })

/** Migrate a legacy `{ enabled, url }` proxy block onto the mode shape. */
function proxyModeOf(raw: ProxyConfig | undefined): { mode: ProxyMode; url: string } {
  if (raw === undefined) return { mode: 'system', url: DEFAULT_PROXY_URL }
  if (raw.mode !== undefined) return { mode: raw.mode, url: raw.url ?? DEFAULT_PROXY_URL }
  // Legacy: enabled === true was the only way to use a proxy.
  return { mode: raw.enabled === true ? 'custom' : 'direct', url: raw.url ?? DEFAULT_PROXY_URL }
}

/**
 * Normalize a raw proxy URL for undici: ensure an http(s) scheme, drop the
 * path/query/trailing slash (undici tolerates them, but the ProxyAgent cache
 * keys on the exact string, so normalizing keeps one agent per proxy).
 */
function normalizeProxyUrl(raw: string): string | undefined {
  let value = raw.trim()
  if (value.length === 0) return undefined
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`
  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.href.replace(/\/$/, '')
  } catch {
    return undefined
  }
}

/**
 * Parse a raw WinINET `ProxyServer` registry value into an http(s) proxy URL.
 * Clash's "系统代理" writes several shapes: `127.0.0.1:7890`,
 * `http=127.0.0.1:7890;https=127.0.0.1:7890` (per-protocol), and a bypass
 * list may be appended (`127.0.0.1:7890;localhost;*.example.com`). The first
 * segment is the proxy spec; the `https=` entry wins for HTTPS traffic (the
 * proxy itself is still an HTTP forward proxy — undici CONNECTs through it).
 */
function normalizeSystemProxyValue(raw: string): string | undefined {
  const segments = raw.split(';').map(segment => segment.trim()).filter(segment => segment.length > 0)
  if (segments.length === 0) return undefined
  const httpsPair = segments.find(segment => /^https=/i.test(segment))
  const chosen = httpsPair ?? segments[0] ?? ''
  const host = chosen.replace(/^[a-z]+=/i, '')
  if (host.length === 0) return undefined
  return normalizeProxyUrl(host)
}

/**
 * Resolve the machine proxy: HTTP(S)_PROXY env first, then the Windows
 * WinINET system proxy (the registry row Clash's "系统代理" writes), so
 * `mode: 'system'` follows whatever the OS is using. Cached 30s because the
 * registry read spawns a process; resolution failure degrades to no proxy.
 */
let systemProxyCache: { at: number; url: string | undefined } | undefined
const SYSTEM_PROXY_TTL_MS = 30_000
function systemProxyUrl(): string | undefined {
  const now = Date.now()
  if (systemProxyCache !== undefined && now - systemProxyCache.at < SYSTEM_PROXY_TTL_MS) {
    return systemProxyCache.url
  }
  const envUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy
    ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  let url = envUrl !== undefined && envUrl.trim().length > 0 ? normalizeProxyUrl(envUrl) : undefined
  if (url === undefined && process.platform === 'win32') {
    try {
      const enable = execFileSync('reg', [
        'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v', 'ProxyEnable',
      ], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
      const on = /0x([0-9a-f]+)/i.exec(enable)?.[1]
      if (on !== undefined && parseInt(on, 16) === 1) {
        const server = execFileSync('reg', [
          'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v', 'ProxyServer',
        ], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
        const raw = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(server)?.[1]
        if (raw !== undefined && raw.length > 0) url = normalizeSystemProxyValue(raw)
      }
    } catch {
      // No registry access (or reg missing): fall through to no proxy.
    }
  }
  systemProxyCache = { at: now, url }
  return url
}

/** One gateway instance entry; mirrors the legacy flat Config fields. */
const instanceSchema: z<NewApiInstanceConfig> = z.object({
  id: z.string().required(),
  displayName: z.string(),
  apiKeyEnv: z.string(),
  baseURL: z.string(),
  models: z.array(catalogModel).default([]),
  modelExcludePatterns: z.array(z.string()).default([...DEFAULT_MODEL_EXCLUDE_PATTERNS]),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  proxy: proxySchema,
  providerHints: z.object({
    defaults: z.object({}),
    models: z.object({}),
  }),
  retryPolicy: RetryPolicySchema,
})

export const Config: z<Config> = z.object({
  instances: z.array(instanceSchema).default([]),
  baseURL: z.string(),
  models: z.array(catalogModel).default([]),
  modelExcludePatterns: z.array(z.string()).default([...DEFAULT_MODEL_EXCLUDE_PATTERNS]),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  proxy: proxySchema.default({ enabled: false, url: DEFAULT_PROXY_URL }),
  providerHints: z.object({
    defaults: z.object({}),
    models: z.object({}),
  }),
  retryPolicy: RetryPolicySchema,
})

/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedNewApiOptions = NewApiConnectionOptions

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly NewApiCatalogModel[] | undefined): NewApiCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error(`${PKG}: catalog model ids must be non-empty`)
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`${PKG}: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" maxTokens must be a positive integer`,
      )
    }
    if (seen.has(model.id)) throw new Error(`${PKG}: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    for (const effort of model.reasoningEfforts ?? []) {
      if (effort.length === 0) throw new Error(`${PKG}: catalog model "${model.id}" has an empty reasoning effort`)
    }
    if (model.defaultReasoningEffort !== undefined
      && !(model.reasoningEfforts ?? []).includes(model.defaultReasoningEffort)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" default reasoning effort "${model.defaultReasoningEffort}" is not among its reasoning efforts`,
      )
    }
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...model.reasoningEfforts === undefined || model.reasoningEfforts.length === 0 ? {} : { reasoningEfforts: model.reasoningEfforts },
      ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
    }
  })
}

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
export function resolveAdapterOptions(
  config: Config | NewApiInstanceConfig,
  environment?: ReturnType<typeof launchEnvironmentOf>,
  ref: CredentialRef = credentialRef(API_KEY_REF),
): ResolvedNewApiOptions {
  // Absent everywhere is the placeholder, not a load failure: the plugin stays
  // mountable so configuration surfaces can offer the route, and a request
  // against the placeholder fails as TRANSPORT at first use, naming the
  // endpoint to fix. A value someone actually typed must still be a usable
  // http(s) URL, which normalizeBaseUrl enforces below.
  const named = config.baseURL !== undefined && config.baseURL.trim().length > 0
    ? config.baseURL
    : environment?.get(BASE_URL_ENV)?.value
  const rawBase = named !== undefined && named.trim().length > 0 ? named : DEFAULT_BASE_URL
  const modelExcludePatterns = config.modelExcludePatterns ?? [...DEFAULT_MODEL_EXCLUDE_PATTERNS]
  for (const pattern of modelExcludePatterns) {
    if (pattern.length === 0) throw new Error(`${PKG}: modelExcludePatterns entries must be non-empty`)
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error(`${PKG}: defaultContextWindow must be a positive integer`)
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error(`${PKG}: maxTokens must be a positive safe integer`)
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${PKG}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const defaultContextWindow = config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  const proxy = proxyModeOf(config.proxy)
  let proxyUrl: string | undefined
  if (proxy.mode === 'custom') {
    // Only judged while the custom mode is active: a stored custom URL that
    // is invalid must not fail the whole section when the mode is off.
    const normalized = normalizeProxyUrl(proxy.url)
    if (normalized === undefined) {
      throw new Error(`${PKG}: proxy.url must be an absolute http(s) URL (got: ${proxy.url})`)
    }
    proxyUrl = normalized
  } else if (proxy.mode === 'system') {
    proxyUrl = systemProxyUrl()
  }
  return {
    baseURL: normalizeBaseUrl(rawBase),
    apiKeyRef: ref,
    models: resolveModels(config.models),
    modelExcludePatterns,
    defaultContextWindow,
    streamIdleTimeoutMs,
    ...proxyUrl === undefined ? {} : { proxyUrl },
    providerHints: {
      defaults: { ...config.providerHints?.defaults },
      models: { ...config.providerHints?.models },
    },
    retryPolicy: resolveRetryPolicy(config.retryPolicy, `${PKG}: retryPolicy`),
    ...config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens },
  }
}

/**
 * The configured instances, folding the legacy flat config into one
 * `default` instance when `instances` is absent so a pre-0.9.0 settings
 * section keeps working unchanged.
 * @param raw - the current plugin config / settings snapshot.
 * @returns per-instance entries, each with its sanitized id, display name,
 *   and the instance config to resolve.
 */
export function instanceEntriesOf(raw: Config): ReadonlyArray<{ id: string; displayName: string; instance: NewApiInstanceConfig }> {
  if (raw.instances !== undefined && raw.instances.length > 0) {
    return raw.instances.map(instance => ({
      id: sanitizeInstanceId(instance.id),
      displayName: instance.displayName ?? instance.id,
      instance,
    }))
  }
  const hasLegacy = raw.baseURL !== undefined || (raw.models?.length ?? 0) > 0
  if (!hasLegacy) return []
  return [{ id: 'default', displayName: 'NewAPI', instance: { id: 'default', ...raw } }]
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config

  const entryList = (): ReadonlyArray<{ id: string; displayName: string; instance: NewApiInstanceConfig }> =>
    instanceEntriesOf(current())

  // Per-instance resolution with the same last-good caching as the legacy
  // single-route path: a rejected settings snapshot keeps serving the last
  // good facts for that instance and logs the reason once.
  const states = new Map<string, { lastRaw?: Config; lastGood?: ResolvedNewApiOptions }>()
  const optionsFor = (id: string): ResolvedNewApiOptions => {
    const raw = current()
    const entry = entryList().find(candidate => candidate.id === id)
    if (entry === undefined) throw new Error(`${PKG}: instance "${id}" is no longer configured`)
    const state = states.get(id) ?? {}
    states.set(id, state)
    if (raw === state.lastRaw && state.lastGood !== undefined) return state.lastGood
    try {
      const next = resolveAdapterOptions(entry.instance, launchEnvironmentOf(ctx), entry.instance.apiKeyEnv?.trim() || refOf(id))
      state.lastRaw = raw
      state.lastGood = next
      return next
    } catch (error) {
      if (state.lastGood === undefined) throw error
      state.lastRaw = raw
      ctx.logger.error(`${PKG}: keeping the last good configuration for instance "${id}" after an invalid settings section`)
      ctx.logger.error(error)
      return state.lastGood
    }
  }
  // Validate the initial composition (fail loud on a bad static config).
  for (const entry of entryList()) resolveAdapterOptions(entry.instance, launchEnvironmentOf(ctx), entry.instance.apiKeyEnv?.trim() || refOf(entry.id))

  const resolveApiKey = async (connection: ResolvedNewApiOptions): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    // The credentials store is the only source: the web settings page owns
    // the value, and this plugin deliberately reads no environment variable
    // for it (a stray export must not shadow a web-configured key).
    const ref = connection.apiKeyRef
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, PKG, ref)
    }
    throw new LlmError(
      `${PKG}: no API key for provider route "${ROUTE_PREFIX}"; configure it on the NewAPI`
        + ` settings page in dsh web (credentials reference "${ref}")`,
      'MISSING_CREDENTIAL',
    )
  }

  // Official-vendor index for the models.dev params panel: model id → the
  // provider route that serves it officially, read from every OTHER route
  // registered on ctx.llm (the built-in catalogs are the authority — e.g.
  // deepseek-v4-flash under the deepseek route). Rebuilt when the set of
  // routes changes; a route that fails to list models is no authority.
  let indexCache: { routes: string; byModel: Map<string, string> } | undefined
  const officialProviderOf = async (modelId: string): Promise<string | undefined> => {
    const routes = ctx.llm.listProviders().map(provider => provider.id).sort().join(',')
    if (indexCache === undefined || indexCache.routes !== routes) {
      const byModel = new Map<string, string>()
      for (const provider of ctx.llm.listProviders()) {
        if (provider.id.startsWith(`${ROUTE_PREFIX}-`)) continue
        try {
          for (const model of await ctx.llm.listModels(provider.id)) {
            byModel.set(model.id, provider.id)
          }
        } catch {
          // An unlistable route contributes nothing; other routes still can.
        }
      }
      indexCache = { routes, byModel }
    }
    return indexCache.byModel.get(modelId)
  }

  // One adapter per instance, each bound to its own provider route
  // (`newapi-<id>`) and credential reference (`newapi_<id>`), so several
  // gateways live side by side without sharing keys. The set tracks the
  // settings snapshot: instances that disappear are disposed, new ones
  // register, and kept ones refresh their registration-captured retry
  // policy. Route effects bind to this apply fiber via the stable `ctx`
  // reference, so a swap inside the scoped settings callback below cannot
  // outlive the plugin.
  interface Registration {
    adapter: NewApiAdapter
    handle: AdapterRegistrationHandle
    configurable: DirectoryRegistrationHandle
    policy: ResolvedRetryPolicy
    /** Settings path of this instance inside the section (`['instances', i]`). */
    path: readonly string[]
  }
  const registrations = new Map<string, Registration>()
  const syncRegistrations = (): void => {
    const entries = entryList()
    const wanted = new Set(entries.map(entry => entry.id))
    for (const [id, registration] of registrations) {
      if (wanted.has(id)) continue
      registration.configurable()
      registration.handle()
      registrations.delete(id)
    }
    for (const [index, entry] of entries.entries()) {
      const existing = registrations.get(entry.id)
      const route = routeOf(entry.id)
      // Address the instance INSIDE the section so the official Models page
      // can resolve its own subtree (`schema.getPath(value, path)`): with an
      // empty path it reads the section root's `apiKeyEnv` (absent), so the
      // configured/missing dot never shows. Re-sync refreshes the path when
      // instances are added/removed/reordered.
      const path = ['instances', String(index)]
      if (existing === undefined) {
        const adapter = new NewApiAdapter({
          options: () => optionsFor(entry.id),
          resolveApiKey,
          officialProviderOf,
          // providerInfo() returns this, and the model picker groups by it —
          // per-instance so two gateways read as "seekai" / "justwoker", not
          // both "NewAPI".
          displayName: entry.displayName,
        })
        const configurable = ctx.llm.registerConfigurableProviders([{
          provider: route,
          displayName: entry.displayName,
          settingsNs: NS,
          settingsPath: [...path],
          // The adapter knows this route only because configuration declared
          // it: a self-hosted gateway it ships nothing about.
          declared: true,
        }])
        registrations.set(entry.id, {
          adapter,
          handle: ctx.llm.registerAdapter([route], adapter),
          configurable,
          policy: optionsFor(entry.id).retryPolicy,
          path,
        })
        continue
      }
      const policy = optionsFor(entry.id).retryPolicy
      const policyChanged = !deepEqualJson(policy, existing.policy)
      const pathChanged = existing.path.length !== path.length
        || existing.path.some((segment, at) => segment !== path[at])
      if (!policyChanged && !pathChanged) continue
      // The registry captures the retry policy at registration, so it is the
      // one fact per-request resolution cannot refresh. `replace` re-reads it
      // in one synchronous registry section: disposing and re-registering
      // instead would publish an empty route set between the two, and an
      // observer that reacted to it would see this provider vanish.
      // Replacing the configurable entry at the same time refreshes the
      // instance's settingsPath after a reorder.
      if (policyChanged) {
        existing.handle.replace([route])
        existing.policy = policy
      }
      if (pathChanged) {
        existing.configurable.replace([{
          provider: route,
          displayName: entry.displayName,
          settingsNs: NS,
          settingsPath: [...path],
          declared: true,
        }])
        existing.path = path
      }
    }
  }
  // Register whatever the composition already declares; the settings section
  // below re-syncs when its snapshot changes.
  syncRegistrations()

  // Model discovery for the settings namespace this plugin owns: the Models
  // page interrogates the gateway's /models with the draft's endpoint and
  // one-shot credential, or the current snapshot's facts. One handler serves
  // every instance — the draft names the endpoint, and the snapshot
  // fallback uses the first configured instance.
  ctx.llm.registerModelDiscovery(NS, request => {
    const first = registrations.values().next()?.value?.adapter
    return first === undefined ? Promise.resolve([]) : first.discoverModels(request)
  })

  // Host-side endpoint for the「更新模型信息」action: the browser names
  // the gateway model ids (and optionally the proxy draft) and the host
  // downloads https://models.dev/api.json — no cross-origin fetch happens in
  // the browser, and a plain HTTP forward proxy works because Node performs
  // the request. Registered through ctx.inject so it waits for the connection
  // service and re-runs if that service reloads — an eager ctx.get here read
  // undefined while the web app had not started the service yet, silently
  // skipping the route (the browser then met the SPA fallback's 405).
  ctx.inject(['connection'], (cctx) => {
    const connection = cctx.get('connection') as HostConnectionHandle
    cctx.effect(() => connection.rpc.handle(
      '/llm-newapi',
      (endpoint: string, payload: unknown, signal: AbortSignal) => {
        if (endpoint === 'parse-channel-conn') {
          // A thin client (or a future settings UI) submits a raw channel-
          // connection descriptor blob and gets back { baseURL, apiKey } or a
          // clean error — no host-only parsing logic leaks into the browser.
          const result = parseChannelConn(payload)
          return Promise.resolve(result.ok
            ? { ok: true as const, value: result }
            : {
              ok: false as const,
              error: { code: 'internal' as const, message: result.error, details: {} },
            })
        }
        if (endpoint === 'probe') {
      const request = payload as ProbeRequest
      // The probe is a self-contained health check: it normalizes the drafted
      // base, resolves the one-shot key (or the stored credential), and calls
      // GET /models. Any instance's adapter serves it — the draft names the
      // endpoint — so the first configured instance answers; without any
      // instance the failure is a clean error envelope.
      const adapter = registrations.values().next()?.value?.adapter
      if (adapter === undefined) {
        return Promise.resolve({
          ok: false as const,
          error: {
            code: 'internal' as const,
            message: 'llm-newapi: no NewAPI instances are configured; add one on the settings page first',
            details: {},
          },
        })
      }
      return adapter.probeConnection({ ...request, signal })
        .then(value => ({ ok: true as const, value }))
        .catch((error: unknown) => ({
          ok: false as const,
          error: {
            code: 'internal' as const,
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        }))
    }
    if (endpoint !== 'models-dev-params') {
          return Promise.resolve({
            ok: false as const,
            error: { code: 'internal' as const, message: `llm-newapi: unknown endpoint ${endpoint}`, details: {} },
          })
        }
        const request = payload as ModelsDevParamsRequest
        // Failures answer as the error envelope, never a thrown value: the
        // transport maps a thrown handler to an opaque HTTP 500, which hides
        // the actual reason (unreachable endpoint, dead proxy) from the
        // settings page that asked.
        const adapter = registrations.values().next()?.value?.adapter
        if (adapter === undefined) {
          return Promise.resolve({
            ok: false as const,
            error: {
              code: 'internal' as const,
              message: 'llm-newapi: no NewAPI instances are configured',
              details: {},
            },
          })
        }
        return adapter.fetchModelsDevParams(request, signal)
          .then(value => ({ ok: true as const, value }))
          .catch((error: unknown) => ({
            ok: false as const,
            error: {
              code: 'internal' as const,
              message: error instanceof Error ? error.message : String(error),
              details: {},
            },
          }))
      },
      { authority: 'loopback' },
    ), 'llm-newapi: models-dev RPC channel')
  })

  installSettingsSection(ctx, NS, Config, config, {
    // Refuse an unserviceable section where it is written: without this a
    // schema-valid value no instance can serve (a non-http(s) baseURL, an
    // empty exclude-pattern entry) stores with a success notice and then
    // silently keeps the last good facts at every request.
    validate: (value) => {
      for (const entry of instanceEntriesOf(value)) {
        resolveAdapterOptions(entry.instance, launchEnvironmentOf(ctx), entry.instance.apiKeyEnv?.trim() || refOf(entry.id))
      }
    },
    setSource: (source) => {
      current = source
      syncRegistrations()
    },
    onChange: () => {
      syncRegistrations()
    },
  })
}
