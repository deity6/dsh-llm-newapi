/**
 * One NewAPI instance settings card. Owns every TRANSIENT editing concern of
 * a single instance — the pending key draft, model-row disclosures and
 * capacity buffers, the fetch/params panels, the connectivity probe, and the
 * channel-connection import — while the persistent facts (id, display name,
 * base URL, models, proxy) live in the parent's `InstanceDraft` and arrive
 * here through `draft` + `onPatch`. The parent owns the global Save button,
 * so the pending key is lifted out through `onPendingKey` (empty string =
 * nothing to store). Renders only with the fiber-scoped `newapi-*` styles.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DiscoveredModelView, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { NewApiKey } from './locale.ts'
import type {
  ModelsDevParamsRequest,
  ModelsDevParamsResponse,
  ParsedChannelConn,
  ProbeRequest,
  ProbeResult,
} from './params-types.ts'

/** One catalog entry, structurally open like the official editors. */
export type ModelDraft = Record<string, unknown>

/** How one instance's gateway traffic reaches the network (mirrors host). */
export type InstanceProxyMode = 'system' | 'direct' | 'custom'

/** The persistent per-instance facts the parent persists and the card edits. */
export interface InstanceDraft {
  /** Sanitized route suffix (`newapi-<id>` / `newapi_<id>`). */
  id: string
  /** Display name shown in the provider picker. */
  displayName: string
  /** Gateway base including the `/v1` prefix. */
  baseURL: string
  models: ModelDraft[]
  proxyMode: InstanceProxyMode
  proxyUrl: string
}

/** Sanitized instance id, mirroring the host's `sanitizeInstanceId`. */
export function sanitizeClientId(id: string): string {
  const safe = id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return safe.length > 0 ? safe : 'default'
}

/** Provider route id for one instance, as the host derives it. */
export function clientRouteOf(id: string): string {
  return `newapi-${sanitizeClientId(id)}`
}

/** Credential reference for one instance, as the host derives it. */
export function clientRefOf(id: string): string {
  return `newapi_${sanitizeClientId(id).replace(/-/g, '_')}`
}

const NS = 'llm-newapi'

/** The proxy text box's default and placeholder (mirrors the host default). */
export const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890'

/** A row's text field, or the empty string when unset or not a string. */
function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}

/** A row's numeric field, or `undefined` when unset or not a number. */
function numberOf(model: ModelDraft, key: string): number | undefined {
  const value = model[key]
  return typeof value === 'number' ? value : undefined
}

/** The two token counts edited as K/M-suffixed text behind a row's disclosure. */
type CapacityField = 'contextWindow' | 'maxTokens'

/** Accepted capacity spellings: a decimal count with an optional K/M suffix. */
const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i

/** Decimal suffix scales — `1M` is 1000K, matching how model capacities are quoted. */
const CAPACITY_SCALE = { k: 1_000, m: 1_000_000 } as const

/** Read a typed capacity, so a user can write `256K` or `1M`. */
function parseCapacity(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const match = CAPACITY_PATTERN.exec(trimmed)
  if (match === null) return Number.NaN
  const suffix = match[2]?.toLowerCase()
  const scale = suffix === 'k' || suffix === 'm' ? CAPACITY_SCALE[suffix] : 1
  const scaled = Number(match[1]) * scale
  const rounded = Math.round(scaled)
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled
}

/** Spell a stored count back in the shortest form that survives a round trip. */
function formatCapacity(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value)
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`
  return String(value)
}

/** What an empty capacity field is worth, shown as its placeholder. */
const CAPACITY_HINT: Readonly<Record<CapacityField, string>> = {
  contextWindow: '128K',
  maxTokens: '8K',
}

/** Disclosure chevron; rotates to point down while its row is open. */
function IconChevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms ease' }}
    >
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Removal glyph for one model row. */
function IconTrash(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/** The highest rung in a row's declared efforts — the dropdown's value when no preset was chosen. */
const EFFORT_RUNG: Readonly<Record<string, number>> = {
  max: 7, xhigh: 6, high: 5, medium: 4, low: 3, minimal: 2, none: 1, default: 0,
}

function highestOf(efforts: readonly unknown[]): string {
  const ids = efforts.filter((effort): effort is string => typeof effort === 'string')
  return [...ids].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0] ?? ''
}

/** Buffer key for one capacity field; the row half moves when rows do. */
function bufferKey(index: number, field: CapacityField): string {
  return `${String(index)}:${field}`
}

/** Inject face: everything one instance card needs from the parent + the wire. */
export interface InstanceEditorProps {
  index: number
  draft: InstanceDraft
  /** Credential state for this instance's ref (`newapi_<id>`). */
  keyConfigured?: boolean
  keyLocked: boolean
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
  t: (key: NewApiKey) => string
  fetchModelParams: (
    request: ModelsDevParamsRequest,
  ) => Promise<{ ok: true; value: ModelsDevParamsResponse } | { ok: false; error: { message: string } }>
  probe: (
    request: ProbeRequest,
  ) => Promise<{ ok: true; value: ProbeResult } | { ok: false; error: { message: string } }>
  parseChannelConn: (
    blob: unknown,
  ) => Promise<{ ok: true; value: ParsedChannelConn } | { ok: false; error: { message: string } }>
  /** Persist a draft field change up. */
  onPatch: (patch: Partial<InstanceDraft>) => void
  /** Lift the pending key draft up (empty string = nothing to store). */
  onPendingKey: (value: string) => void
  onRemove: () => void
}

/**
 * Render one instance card: name/id, key, base URL, proxy, the model
 * catalog, the connectivity probe, and the channel-connection import.
 * @param props - the draft, wire face, and parent callbacks.
 * @returns the card.
 */
export function InstanceEditor(props: InstanceEditorProps): ReactNode {
  const { index, draft, keyConfigured, keyLocked, api, t, fetchModelParams, probe, parseChannelConn, onPatch, onPendingKey, onRemove } = props
  const [keyDraft, setKeyDraft] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const [editing, setEditing] = useState<ReadonlyMap<string, string>>(new Map())
  const [candidates, setCandidates] = useState<readonly DiscoveredModelView[] | undefined>(undefined)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [params, setParams] = useState<ModelsDevParamsResponse | undefined>(undefined)
  const [paramChoices, setParamChoices] = useState<ReadonlyMap<string, number>>(new Map())
  const [paramsBusy, setParamsBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeResult, setProbeResult] = useState<ProbeResult | undefined>(undefined)
  const [probeWithChat, setProbeWithChat] = useState(false)
  const [probeWithTool, setProbeWithTool] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | undefined>(undefined)
  const paramsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    paramsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [params])

  const ref = clientRefOf(draft.id)

  const patch = (next: Partial<InstanceDraft>): void => { onPatch(next) }

  const patchModel = (modelIndex: number, next: Record<string, string | number | undefined>): void => {
    const models = draft.models.map((model, at) => at === modelIndex ? { ...model, ...next } : model)
    patch({ models })
  }

  const removeModel = (modelIndex: number): void => {
    patch({ models: draft.models.filter((_, at) => at !== modelIndex) })
    setExpanded(current => {
      const next = new Set(current)
      next.delete(modelIndex)
      const shifted = new Set<number>()
      for (const key of next) shifted.add(key > modelIndex ? key - 1 : key)
      return shifted
    })
    setEditing(current => {
      const next = new Map<string, string>()
      for (const [key, value] of current) {
        const [at, field] = key.split(':')
        const atNum = Number(at)
        if (atNum === modelIndex) continue
        next.set(`${String(atNum > modelIndex ? atNum - 1 : atNum)}:${field}`, value)
      }
      return next
    })
  }

  const toggleExpanded = (modelIndex: number): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(modelIndex)) next.delete(modelIndex)
      else next.add(modelIndex)
      return next
    })
  }

  const editCapacity = (modelIndex: number, field: CapacityField, text: string): void => {
    setEditing(current => new Map(current).set(bufferKey(modelIndex, field), text))
  }

  const fetchModels = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setCandidates(undefined)
    try {
      const key = keyDraft.trim()
      const response = await api.llm.discoverModels({
        settingsNs: NS,
        provider: clientRouteOf(draft.id),
        ...draft.baseURL.trim().length > 0 ? { baseURL: draft.baseURL.trim() } : {},
        ...key.length > 0 ? { apiKey: key } : {},
      })
      if (!response.result.ok) {
        setError(response.result.error.message)
        return
      }
      const found = response.result.value.models
      found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (found.length === 0) {
        setError(t('fetchEmpty'))
        return
      }
      const known = new Set(draft.models.map(model => textOf(model, 'id')))
      setCandidates(found)
      setPicked(new Set(found.filter(model => !known.has(model.id)).map(model => model.id)))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const adopt = (): void => {
    if (candidates === undefined) return
    const existing = new Map(draft.models.map(model => [textOf(model, 'id'), model]))
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue
      if (existing.has(candidate.id)) continue
      existing.set(candidate.id, {
        id: candidate.id,
        ...candidate.name === undefined ? {} : { name: candidate.name },
        ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
      })
    }
    patch({
      models: [...existing.values()].sort((a, b) => {
        const ai = textOf(a, 'id').trim()
        const bi = textOf(b, 'id').trim()
        if (ai.length === 0) return bi.length === 0 ? 0 : 1
        if (bi.length === 0) return -1
        return ai < bi ? -1 : ai > bi ? 1 : 0
      }),
    })
    setCandidates(undefined)
    setPicked(new Set())
  }

  const toggle = (id: string): void => {
    setPicked(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateParams = async (): Promise<void> => {
    const ids = draft.models.map(model => textOf(model, 'id').trim()).filter(id => id.length > 0)
    if (ids.length === 0) {
      setError(t('paramsNoModels'))
      return
    }
    setParamsBusy(true)
    setError(undefined)
    try {
      const response = await fetchModelParams({
        modelIds: ids,
        ...draft.proxyMode === 'custom' && draft.proxyUrl.trim().length > 0 ? { proxyUrl: draft.proxyUrl.trim() } : {},
      })
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      setParams(response.value)
      setParamChoices(new Map())
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setParamsBusy(false)
    }
  }

  const applyParams = (overwrite: boolean): void => {
    if (params === undefined) return
    const next = draft.models.map(model => {
      const id = textOf(model, 'id').trim()
      const entry = params.models.find(candidate => candidate.id === id)
      if (entry === undefined || entry.matches.length === 0) return model
      const chosen = entry.matches[paramChoices.get(id) ?? 0] ?? entry.matches[0]
      if (chosen === undefined) return model
      const capacity = {
        contextWindow: chosen.contextWindow ?? (overwrite ? undefined : numberOf(model, 'contextWindow')),
        maxTokens: chosen.maxTokens ?? (overwrite ? undefined : numberOf(model, 'maxTokens')),
      }
      if (overwrite) {
        return {
          ...model,
          ...capacity.contextWindow === undefined ? {} : { contextWindow: capacity.contextWindow },
          ...capacity.maxTokens === undefined ? {} : { maxTokens: capacity.maxTokens },
          ...chosen.reasoningEfforts !== undefined && chosen.reasoningEfforts.length > 0
            ? { reasoningEfforts: chosen.reasoningEfforts }
            : {},
        }
      }
      return {
        ...model,
        ...capacity.contextWindow !== undefined && numberOf(model, 'contextWindow') === undefined
          ? { contextWindow: capacity.contextWindow }
          : {},
        ...capacity.maxTokens !== undefined && numberOf(model, 'maxTokens') === undefined
          ? { maxTokens: capacity.maxTokens }
          : {},
        ...chosen.reasoningEfforts !== undefined && chosen.reasoningEfforts.length > 0
          && !Array.isArray(model.reasoningEfforts)
          ? { reasoningEfforts: chosen.reasoningEfforts }
          : {},
      }
    })
    patch({ models: next })
    setNotice(t('paramsApplied'))
  }

  const runProbe = async (overrides?: { baseURL?: string; apiKey?: string }): Promise<void> => {
    setProbeBusy(true)
    setProbeResult(undefined)
    try {
      const base = (overrides?.baseURL ?? draft.baseURL).trim()
      const key = (overrides?.apiKey ?? keyDraft).trim()
      const firstModel = draft.models[0]
      const chatModel = firstModel !== undefined && typeof firstModel.id === 'string' && firstModel.id.length > 0
        ? firstModel.id
        : undefined
      const response = await probe({
        ...base.length > 0 ? { baseURL: base } : {},
        ...key.length > 0 ? { apiKey: key } : {},
        // The explicit URL only applies to the custom mode; `system`/`direct`
        // resolve host-side from the instance snapshot.
        ...draft.proxyMode === 'custom' && draft.proxyUrl.trim().length > 0 ? { proxyUrl: draft.proxyUrl.trim() } : {},
        ...probeWithChat && chatModel !== undefined ? { chatModel, chatTimeoutMs: 25_000 } : {},
        ...probeWithTool && chatModel !== undefined ? { toolCallModel: chatModel, toolCallTimeoutMs: 30_000 } : {},
      })
      if (!response.ok) {
        setNotice(`${t('probeFailed')}: ${response.error.message}`)
        return
      }
      setProbeResult(response.value)
    } finally {
      setProbeBusy(false)
    }
  }

  const runImport = async (): Promise<void> => {
    setImportBusy(true)
    setImportError(undefined)
    try {
      let blob: unknown
      try {
        blob = JSON.parse(importText)
      } catch {
        setImportError(t('importInvalidJson'))
        return
      }
      const response = await parseChannelConn(blob)
      if (!response.ok) {
        setImportError(response.error.message)
        return
      }
      const value = response.value
      patch({ baseURL: value.baseURL })
      setKeyDraft(value.apiKey)
      onPendingKey(value.apiKey)
      setImportOpen(false)
      setImportText('')
      setNotice(t('importApplied'))
      void runProbe({ baseURL: value.baseURL, apiKey: value.apiKey })
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <fieldset className="newapi-instance">
      <legend className="newapi-instance-head">
        <span className="newapi-instance-title">{`${t('instanceTitle')} ${String(index + 1)}`}</span>
        <span className="newapi-instance-actions">
          <button type="button" className="newapi-linkbutton newapi-iconbutton--danger" onClick={onRemove}>
            {t('removeInstance')}
          </button>
        </span>
      </legend>

      {notice === undefined ? null : <p role="status">{notice}</p>}
      {error === undefined ? null : <p className="newapi-error">{error}</p>}

      <div className="newapi-field">
        <label htmlFor={`newapi-instance-id-${index}`}>{t('instanceId')}</label>
        <input
          id={`newapi-instance-id-${index}`} type="text" className="newapi-input"
          value={draft.id}
          onChange={(event) => { patch({ id: event.target.value }) }}
        />
        <p className="newapi-hint">{t('instanceIdHint')}</p>
      </div>

      <div className="newapi-field">
        <label htmlFor={`newapi-instance-name-${index}`}>{t('instanceName')}</label>
        <input
          id={`newapi-instance-name-${index}`} type="text" className="newapi-input"
          placeholder={t('instanceNamePlaceholder')}
          value={draft.displayName}
          onChange={(event) => { patch({ displayName: event.target.value }) }}
        />
        <p className="newapi-hint">{t('instanceNameHint')}</p>
      </div>

      <div className="newapi-field">
        <label htmlFor={`newapi-instance-key-${index}`}>{t('keyInput')}</label>
        <input
          id={`newapi-instance-key-${index}`} type="password" autoComplete="off" className="newapi-input"
          disabled={keyLocked}
          placeholder={keyLocked
            ? t('keyEnvLocked')
            : keyConfigured === true ? t('keyStored') : keyConfigured === false ? t('keyMissing') : t('keyPlaceholder')}
          value={keyDraft}
          onChange={(event) => { setKeyDraft(event.target.value); onPendingKey(event.target.value) }}
        />
      </div>

      <div className="newapi-field">
        <label htmlFor={`newapi-instance-base-${index}`}>{t('baseUrl')}</label>
        <input
          id={`newapi-instance-base-${index}`} type="text" className="newapi-input" placeholder={t('baseUrlPlaceholder')}
          value={draft.baseURL}
          onChange={(event) => { patch({ baseURL: event.target.value }) }}
        />
        <p className="newapi-hint">{t('baseUrlHint')}</p>
      </div>

      <div className="newapi-field">
        <div className="newapi-proberow">
          <button
            type="button" className="newapi-button newapi-button--primary"
            disabled={probeBusy}
            onClick={() => { void runProbe() }}
          >
            {probeBusy ? t('probing') : t('probe')}
          </button>
          <label className="newapi-probecheck">
            <input
              type="checkbox" checked={probeWithChat}
              aria-label={t('probeWithChat')}
              onChange={(event) => { setProbeWithChat(event.target.checked) }}
            />
            {t('probeWithChat')}
          </label>
          <label className="newapi-probecheck">
            <input
              type="checkbox" checked={probeWithTool}
              aria-label={t('probeWithTool')}
              onChange={(event) => { setProbeWithTool(event.target.checked) }}
            />
            {t('probeWithTool')}
          </label>
          <button
            type="button" className="newapi-linkbutton"
            onClick={() => { setImportOpen(current => !current); setImportError(undefined) }}
          >
            {t('importChannelConn')}
          </button>
        </div>

        {importOpen ? (
          <div className="newapi-params" style={{ marginTop: 8 }}>
            <label className="newapi-modelfield">
              <span className="newapi-modelfield-label">{t('importHint')}</span>
              <textarea
                className="newapi-input" rows={3} spellCheck={false}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
                value={importText}
                onChange={(event) => { setImportText(event.target.value); setImportError(undefined) }}
              />
            </label>
            {importError === undefined ? null : <p className="newapi-error">{importError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button" className="newapi-button newapi-button--primary"
                disabled={importBusy || importText.trim().length === 0}
                onClick={() => { void runImport() }}
              >
                {importBusy ? t('importBusy') : t('importApply')}
              </button>
              <button
                type="button" className="newapi-button"
                onClick={() => { setImportOpen(false); setImportText(''); setImportError(undefined) }}
              >
                {t('fetchCancel')}
              </button>
            </div>
          </div>
        ) : null}

        {probeResult === undefined && !probeBusy ? null : (
          <div className="newapi-probe" aria-live="polite">
            {probeBusy ? (
              <p className="newapi-hint">{t('probing')}</p>
            ) : probeResult === undefined ? null : (
              <>
                <p>
                  <span className={probeResult.reachable === true && probeResult.authValid === true ? 'newapi-probe-ok' : 'newapi-probe-bad'}>
                    {probeResult.reachable === true
                      ? probeResult.authValid === true ? t('probeReachableAuthed') : t('probeReachableUnauthed')
                      : t('probeUnreachable')}
                  </span>
                  <span className="newapi-hint">
                    {` · ${String(probeResult.latencyMs)}ms${probeResult.modelCount !== undefined ? ` · ${String(probeResult.modelCount)} ${t('models')}` : ''}${probeResult.status !== undefined ? ` · HTTP ${String(probeResult.status)}` : ''}`}
                  </span>
                </p>
                {probeResult.chat === undefined ? null : (
                  <p className={probeResult.chat.ok ? 'newapi-probe-ok' : 'newapi-error'}>
                    {probeResult.chat.ok
                      ? `${t('chatProbeOk')}: ${probeResult.chat.text ?? ''} · ${String(probeResult.chat.latencyMs)}ms`
                      : `${t('chatProbeFail')}: ${probeResult.chat.error ?? ''} · ${String(probeResult.chat.latencyMs)}ms`}
                  </p>
                )}
                {probeResult.toolCall === undefined ? null : (
                  <p className={probeResult.toolCall.ok ? 'newapi-probe-ok' : 'newapi-error'}>
                    {probeResult.toolCall.ok
                      ? `${t('toolProbeOk')}: ${probeResult.toolCall.toolName ?? ''} · ${String(probeResult.toolCall.latencyMs)}ms`
                      : `${t('toolProbeFail')}: ${probeResult.toolCall.error ?? ''} · ${String(probeResult.toolCall.latencyMs)}ms`}
                  </p>
                )}
                {probeResult.error === undefined ? null : <p className="newapi-error">{probeResult.error}</p>}
                {probeResult.sampleModels !== undefined && probeResult.sampleModels.length > 0 ? (
                  <p className="newapi-hint" style={{ marginTop: 4 }}>{probeResult.sampleModels.slice(0, 5).join(', ')}</p>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      <section className="newapi-catalog" aria-label={`${t('models')} ${String(index + 1)}`}>
        <div className="newapi-catalog-head">
          <span className="newapi-catalog-title">{t('models')}</span>
          <div className="newapi-catalog-actions" style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="newapi-linkbutton" disabled={busy} onClick={() => { void fetchModels() }}>
              {busy ? t('fetching') : t('fetchModels')}
            </button>
            <button type="button" className="newapi-linkbutton" disabled={paramsBusy} onClick={() => { void updateParams() }}>
              {paramsBusy ? t('paramsFetching') : t('updateParams')}
            </button>
            <button type="button" className="newapi-linkbutton" disabled={draft.models.length === 0} onClick={() => {
              patch({ models: [] })
              setExpanded(new Set())
              setEditing(new Map())
              setParams(undefined)
              setParamChoices(new Map())
            }}>
              {t('clearModels')}
            </button>
          </div>
        </div>
        <div className="newapi-proxyrow">
          <label className="newapi-proxylabel">
            {t('proxyMode')}
            <select
              className="newapi-input newapi-select"
              aria-label={t('proxyMode')}
              value={draft.proxyMode}
              onChange={(event) => {
                const mode = event.target.value as InstanceProxyMode
                patch({ proxyMode: mode })
              }}
            >
              <option value="system">{t('proxyModeSystem')}</option>
              <option value="direct">{t('proxyModeDirect')}</option>
              <option value="custom">{t('proxyModeCustom')}</option>
            </select>
          </label>
          {draft.proxyMode === 'custom' ? (
            <input
              className="newapi-input" type="text" style={{ maxWidth: 220 }}
              aria-label={t('proxyUrl')} placeholder={DEFAULT_PROXY_URL}
              value={draft.proxyUrl}
              onChange={(event) => { patch({ proxyUrl: event.target.value }) }}
            />
          ) : null}
        </div>
        {draft.models.length === 0 ? <p className="newapi-empty">{t('modelsEmpty')}</p> : null}
        {draft.models.map((model, modelIndex) => (
          <div key={modelIndex} className="newapi-entry">
            <div className="newapi-modelrow">
              <input
                className="newapi-input" type="text" value={textOf(model, 'id')}
                placeholder={t('modelId')} aria-label={`${t('modelId')} ${String(modelIndex + 1)}`}
                onChange={(event) => { patchModel(modelIndex, { id: event.target.value }) }}
              />
              <input
                className="newapi-input" type="text" value={textOf(model, 'name')}
                placeholder={t('modelName')} aria-label={`${t('modelName')} ${String(modelIndex + 1)}`}
                onChange={(event) => { patchModel(modelIndex, { name: event.target.value === '' ? undefined : event.target.value }) }}
              />
              <button
                type="button" className="newapi-iconbutton"
                aria-label={`${t('modelAdvanced')} ${String(modelIndex + 1)}`}
                aria-expanded={expanded.has(modelIndex)}
                title={t('modelAdvanced')}
                onClick={() => { toggleExpanded(modelIndex) }}
              >
                <IconChevron open={expanded.has(modelIndex)} />
              </button>
              <button
                type="button" className="newapi-iconbutton newapi-iconbutton--danger"
                aria-label={`${t('removeModel')} ${String(modelIndex + 1)}`}
                title={t('removeModel')}
                onClick={() => { removeModel(modelIndex) }}
              >
                <IconTrash />
              </button>
            </div>
            {expanded.has(modelIndex) ? (
              <div className="newapi-modeladvanced">
                <label className="newapi-modelfield">
                  <span className="newapi-modelfield-label">{t('contextWindow')}</span>
                  <input
                    className="newapi-input" type="text" placeholder={CAPACITY_HINT.contextWindow}
                    value={editing.get(bufferKey(modelIndex, 'contextWindow'))
                      ?? (numberOf(model, 'contextWindow') === undefined ? '' : formatCapacity(numberOf(model, 'contextWindow')!))}
                    onChange={(event) => {
                      editCapacity(modelIndex, 'contextWindow', event.target.value)
                      const parsed = parseCapacity(event.target.value)
                      patchModel(modelIndex, parsed === undefined ? { contextWindow: undefined } : { contextWindow: parsed })
                    }}
                  />
                </label>
                <label className="newapi-modelfield">
                  <span className="newapi-modelfield-label">{t('maxTokens')}</span>
                  <input
                    className="newapi-input" type="text" placeholder={CAPACITY_HINT.maxTokens}
                    value={editing.get(bufferKey(modelIndex, 'maxTokens'))
                      ?? (numberOf(model, 'maxTokens') === undefined ? '' : formatCapacity(numberOf(model, 'maxTokens')!))}
                    onChange={(event) => {
                      editCapacity(modelIndex, 'maxTokens', event.target.value)
                      const parsed = parseCapacity(event.target.value)
                      patchModel(modelIndex, parsed === undefined ? { maxTokens: undefined } : { maxTokens: parsed })
                    }}
                  />
                </label>
                {Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? (
                  <label className="newapi-modelfield">
                    <span className="newapi-modelfield-label">{t('defaultEffort')}</span>
                    <select
                      className="newapi-select"
                      aria-label={`${t('defaultEffort')} ${String(modelIndex + 1)}`}
                      value={typeof model.defaultReasoningEffort === 'string'
                        && (model.reasoningEfforts as string[]).includes(model.defaultReasoningEffort)
                        ? model.defaultReasoningEffort
                        : highestOf(model.reasoningEfforts)}
                      onChange={(event) => {
                        patchModel(modelIndex, { defaultReasoningEffort: event.target.value })
                      }}
                    >
                      {(model.reasoningEfforts as string[]).map((effort) => (
                        <option key={effort} value={effort}>{effort}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        <button
          type="button" className="newapi-addmodel"
          onClick={() => { patch({ models: [...draft.models, { id: '' }] }) }}
        >
          {t('addModel')}
        </button>
      </section>

      {candidates === undefined ? null : (
        <div className="newapi-candidates">
          <strong>{t('fetchTitle')}</strong>
          <ul>
            {candidates.map(model => (
              <li key={model.id}>
                <label>
                  <input
                    type="checkbox" checked={picked.has(model.id)}
                    onChange={() => { toggle(model.id) }}
                  />
                  {' '}
                  {model.id}{model.name === undefined || model.name === model.id ? '' : ` (${model.name})`}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="newapi-button newapi-button--primary" disabled={picked.size === 0} onClick={adopt}>
            {t('fetchAdopt')}
          </button>
          {' '}
          <button type="button" className="newapi-button" onClick={() => { setCandidates(undefined); setPicked(new Set()) }}>
            {t('fetchCancel')}
          </button>
        </div>
      )}

      {params === undefined ? null : (
        <div className="newapi-params" ref={paramsRef}>
          <strong>{t('paramsTitle')}</strong>
          <p className="newapi-params-summary">{
            t('paramsSummary')
              .replace('{matched}', String(params.models.filter(entry => entry.matches.length > 0).length))
              .replace('{unmatched}', String(params.models.filter(entry => entry.matches.length === 0).length))
          }</p>
          {params.models.map(entry => {
            if (entry.matches.length === 0) {
              return (
                <div key={entry.id} className="newapi-params-row">
                  <span className="newapi-params-id">{entry.id}</span>
                  <span className="newapi-params-unmatched">{t('paramsUnmatched')}</span>
                  <span />
                </div>
              )
            }
            if (entry.matches.length === 1) {
              const match = entry.matches[0]
              if (match === undefined) return null
              return (
                <div key={entry.id} className="newapi-params-row">
                  <span className="newapi-params-id">{entry.id}</span>
                  <span className="newapi-params-values">
                    {`${match.official === true ? `${t('officialMark')} · ` : ''}${match.provider} · ${t('contextWindow')} ${match.contextWindow ?? '—'} / ${t('maxTokens')} ${match.maxTokens ?? '—'}${match.reasoningEfforts !== undefined && match.reasoningEfforts.length > 0 ? ` · ${t('modelReasoning')}: ${match.reasoningEfforts.join('/')}` : ''}`}
                  </span>
                  <span />
                </div>
              )
            }
            const chosen = paramChoices.get(entry.id) ?? 0
            const match = entry.matches[chosen] ?? entry.matches[0]
            if (match === undefined) return null
            return (
              <div key={entry.id} className="newapi-params-row">
                <span className="newapi-params-id">{entry.id}</span>
                <select
                  className="newapi-select" aria-label={`${t('paramsProvider')} ${entry.id}`}
                  value={String(chosen)}
                  onChange={(event) => {
                    setParamChoices(current => new Map(current).set(entry.id, Number(event.target.value)))
                  }}
                >
                  {entry.matches.map((candidate, at) => (
                    <option key={candidate.provider} value={String(at)}>
                      {`${candidate.official === true ? `${t('officialMark')} · ` : ''}${candidate.provider}: ${t('contextWindow')} ${candidate.contextWindow ?? '—'} / ${t('maxTokens')} ${candidate.maxTokens ?? '—'}${candidate.reasoningEfforts !== undefined && candidate.reasoningEfforts.length > 0 ? ` · ${t('modelReasoning')}: ${candidate.reasoningEfforts.join('/')}` : ''}`}
                    </option>
                  ))}
                </select>
                <span className="newapi-params-values">{match.provider}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="newapi-button newapi-button--primary" onClick={() => { applyParams(true) }}>
              {t('paramsOverwrite')}
            </button>
            <button type="button" className="newapi-button" onClick={() => { applyParams(false) }}>
              {t('paramsFillBlank')}
            </button>
            <button type="button" className="newapi-button" onClick={() => { setParams(undefined); setParamChoices(new Map()) }}>
              {t('fetchCancel')}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  )
}
