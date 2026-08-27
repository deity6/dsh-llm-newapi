/**
 * The NewAPI settings section: a LIST of gateway instances, each its own
 * card ({@link InstanceEditor}). The parent owns the persistent drafts and
 * the global Save (writes `{ instances: [...] }` into the `llm-newapi`
 * namespace and any pending per-instance keys into the credentials seam).
 * A pre-0.9.0 flat section value (top-level `baseURL`/`models`/`proxy`)
 * loads as one `default` instance so nothing breaks on upgrade.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-client-connection/client'
import { DEFAULT_PROXY_URL, InstanceEditor, sanitizeClientId, clientRefOf } from './InstanceEditor.tsx'
import type { InstanceDraft, ModelDraft } from './InstanceEditor.tsx'
import type { NewApiKey } from './locale.ts'
import type {
  ModelsDevParamsRequest,
  ModelsDevParamsResponse,
  ParsedChannelConn,
  ProbeRequest,
  ProbeResult,
} from './params-types.ts'

export interface NewApiSectionProps {
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
  t: (key: NewApiKey) => string
  /** Host-side models.dev catalog lookup (browser sends ids + proxy only). */
  fetchModelParams: (
    request: ModelsDevParamsRequest,
  ) => Promise<{ ok: true; value: ModelsDevParamsResponse } | { ok: false; error: { message: string } }>
  /** Host-side connectivity + auth probe (optionally with a chat probe). */
  probe: (
    request: ProbeRequest,
  ) => Promise<{ ok: true; value: ProbeResult } | { ok: false; error: { message: string } }>
  /** Host-side channel-connection descriptor parse. */
  parseChannelConn: (
    blob: unknown,
  ) => Promise<{ ok: true; value: ParsedChannelConn } | { ok: false; error: { message: string } }>
}

const NS = 'llm-newapi'

/** Per-instance credential view, keyed by credential ref. */
interface CredentialView {
  configured?: boolean
  locked: boolean
}

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

/** Convert the stored section value into editable drafts, legacy-aware. */
function toDrafts(source: unknown): InstanceDraft[] {
  if (typeof source !== 'object' || source === null) return []
  const value = source as Record<string, unknown>
  if (Array.isArray(value.instances)) {
    return value.instances.map(entry =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? draftOf(entry as Record<string, unknown>)
        : blankDraft())
  }
  // Legacy flat section: one `default` instance.
  const hasLegacy = typeof value.baseURL === 'string' || Array.isArray(value.models)
  if (!hasLegacy) return []
  const proxy = (value.proxy ?? {}) as { enabled?: unknown; url?: unknown }
  return [{
    id: 'default',
    displayName: 'NewAPI',
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : '',
    models: Array.isArray(value.models)
      ? value.models.filter(entry => typeof entry === 'object' && entry !== null && !Array.isArray(entry)) as ModelDraft[]
      : [],
    proxyEnabled: proxy.enabled === true,
    proxyUrl: typeof proxy.url === 'string' && proxy.url.length > 0 ? proxy.url : DEFAULT_PROXY_URL,
  }]
}

function draftOf(entry: Record<string, unknown>): InstanceDraft {
  const proxy = (entry.proxy ?? {}) as { enabled?: unknown; url?: unknown }
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    displayName: typeof entry.displayName === 'string' ? entry.displayName : '',
    baseURL: typeof entry.baseURL === 'string' ? entry.baseURL : '',
    models: Array.isArray(entry.models)
      ? entry.models.filter(model => typeof model === 'object' && model !== null && !Array.isArray(model)) as ModelDraft[]
      : [],
    proxyEnabled: proxy.enabled === true,
    proxyUrl: typeof proxy.url === 'string' && proxy.url.length > 0 ? proxy.url : DEFAULT_PROXY_URL,
  }
}

function blankDraft(): InstanceDraft {
  return {
    id: `gw-${Date.now().toString(36)}`,
    displayName: '',
    baseURL: '',
    models: [],
    proxyEnabled: false,
    proxyUrl: DEFAULT_PROXY_URL,
  }
}

/** Serialize one instance draft into the stored entry shape. */
function serializeInstance(draft: InstanceDraft): Record<string, unknown> {
  const models = draft.models.map(model => {
    const id = textOf(model, 'id').trim()
    const name = textOf(model, 'name').trim()
    const contextWindow = numberOf(model, 'contextWindow')
    const maxTokens = numberOf(model, 'maxTokens')
    const efforts = Array.isArray(model.reasoningEfforts)
      ? model.reasoningEfforts.filter((effort): effort is string => typeof effort === 'string' && effort.length > 0)
      : []
    const preset = typeof model.defaultReasoningEffort === 'string'
      && efforts.includes(model.defaultReasoningEffort)
      ? model.defaultReasoningEffort
      : undefined
    return {
      id,
      ...name.length > 0 ? { name } : {},
      ...contextWindow !== undefined ? { contextWindow } : {},
      ...maxTokens !== undefined ? { maxTokens } : {},
      ...efforts.length > 0 ? { reasoningEfforts: efforts } : {},
      ...preset !== undefined ? { defaultReasoningEffort: preset } : {},
    }
  })
  return {
    id: sanitizeClientId(draft.id),
    ...draft.displayName.trim().length > 0 ? { displayName: draft.displayName.trim() } : {},
    ...draft.baseURL.trim().length > 0 ? { baseURL: draft.baseURL.trim() } : {},
    models,
    proxy: {
      enabled: draft.proxyEnabled,
      url: draft.proxyUrl.trim().length > 0 ? draft.proxyUrl.trim() : DEFAULT_PROXY_URL,
    },
  }
}

/**
 * Render the NewAPI settings section: one card per gateway instance.
 * @param props - the wire face and the bound translate.
 * @returns the section.
 */
export function NewApiSection(props: NewApiSectionProps): ReactNode {
  const { api, t, fetchModelParams, probe, parseChannelConn } = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState<number>(0)
  const [writable, setWritable] = useState(true)
  const [instances, setInstances] = useState<InstanceDraft[]>([])
  const [credentials, setCredentials] = useState<ReadonlyMap<string, CredentialView>>(new Map())
  /** Pending per-instance keys to store on Save: ref → value. */
  const [pendingKeys, setPendingKeys] = useState<ReadonlyMap<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const load = async (): Promise<void> => {
    setStatus('loading')
    setErrorText(undefined)
    try {
      const described = await api.settings.describe({})
      if (!described.result.ok) {
        setErrorText(described.result.error.message)
        setStatus('error')
        return
      }
      setWritable(described.result.value.writable)
      const section = described.result.value.namespaces.find((entry: SettingsNamespaceView) => entry.ns === NS)
      if (section === undefined) {
        setErrorText(t('nsNotRegistered'))
        setStatus('error')
        return
      }
      setRevision(section.revision)
      const drafts = toDrafts(section.value)
      setInstances(drafts)
      setPendingKeys(new Map())
      const refs = drafts.map(draft => clientRefOf(draft.id))
      if (refs.length > 0) {
        const credential = await api.credentials.describe({ refs })
        if (credential.result.ok) {
          const view = new Map<string, CredentialView>()
          for (const ref of refs) {
            const entry = credential.result.value.credentials[ref]
            view.set(ref, {
              configured: entry?.configured,
              locked: entry?.writable === false,
            })
          }
          setCredentials(view)
        }
      } else {
        setCredentials(new Map())
      }
      setStatus('ready')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }
  if (status === 'loading') void load()

  if (status === 'loading') return <section aria-label={t('nav')}><p>…</p></section>
  if (status === 'error') {
    return (
      <section aria-label={t('nav')}>
        <p className="newapi-error">{`${t('loadFailed')}: ${errorText ?? ''}`}</p>
        <button type="button" className="newapi-button" onClick={() => { void load() }}>{t('retry')}</button>
      </section>
    )
  }

  const patchInstance = (index: number, patch: Partial<InstanceDraft>): void => {
    setInstances(current => current.map((draft, at) => at === index ? { ...draft, ...patch } : draft))
  }

  const removeInstance = (index: number): void => {
    setInstances(current => current.filter((_, at) => at !== index))
  }

  const moveInstance = (index: number, direction: -1 | 1): void => {
    setInstances(current => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      const [moved] = next.splice(index, 1)
      if (moved === undefined) return current
      next.splice(target, 0, moved)
      return next
    })
  }

  const handlePendingKey = (index: number, value: string): void => {
    const ref = clientRefOf(instances[index]?.id ?? '')
    setPendingKeys(current => {
      const next = new Map(current)
      if (value.trim().length === 0) next.delete(ref)
      else next.set(ref, value)
      return next
    })
  }

  const instanceProblem = (): string | undefined => {
    const seen = new Set<string>()
    for (const [index, draft] of instances.entries()) {
      const id = sanitizeClientId(draft.id)
      if (draft.id.trim().length === 0) return `${t('instanceIdRequired')} (${t('instanceTitle')} ${String(index + 1)})`
      if (seen.has(id)) return `${t('instanceIdDuplicate')} (${id})`
      seen.add(id)
    }
    return undefined
  }

  const save = async (): Promise<void> => {
    const problem = instanceProblem()
    if (problem !== undefined) {
      setErrorText(problem)
      return
    }
    setBusy(true)
    setNotice(undefined)
    setErrorText(undefined)
    try {
      const ops: SettingsPathOpView[] = [{
        op: 'set',
        path: ['instances'],
        value: instances.map(serializeInstance),
      }]
      const mutated = await api.settings.mutate({ ns: NS, ops, expectedRevision: revision })
      if (!mutated.result.ok) {
        setErrorText(mutated.result.error.message)
        return
      }
      setRevision(mutated.result.value.revision)
      for (const [ref, value] of pendingKeys) {
        const stored = await api.credentials.set({ ref, value: value.trim() })
        if (!stored.result.ok) {
          setErrorText(stored.result.error.message)
          return
        }
      }
      setPendingKeys(new Map())
      setNotice(t('saved'))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label={t('nav')}>
      <p>{t('intro')}</p>
      {notice === undefined ? null : <p role="status">{notice}</p>}
      {!writable ? <p>{t('readOnly')}</p> : null}
      {errorText === undefined ? null : <p className="newapi-error">{errorText}</p>}

      {instances.length === 0 ? <p className="newapi-empty">{t('noInstances')}</p> : null}
      {instances.map((draft, index) => {
        const ref = clientRefOf(draft.id)
        const view = credentials.get(ref)
        return (
          <InstanceEditor
            key={draft.id === '' ? index : `${draft.id}-${String(index)}`}
            index={index}
            total={instances.length}
            draft={draft}
            keyConfigured={view?.configured}
            keyLocked={view?.locked ?? false}
            api={api}
            t={t}
            fetchModelParams={fetchModelParams}
            probe={probe}
            parseChannelConn={parseChannelConn}
            onPatch={(patch) => { patchInstance(index, patch) }}
            onPendingKey={(value) => { handlePendingKey(index, value) }}
            onRemove={() => { removeInstance(index) }}
            onMove={(direction) => { moveInstance(index, direction) }}
          />
        )
      })}

      <div className="newapi-instance-actions" style={{ marginTop: 8 }}>
        <button
          type="button" className="newapi-addmodel"
          disabled={busy}
          onClick={() => { setInstances(current => [...current, blankDraft()]) }}
        >
          {t('addInstance')}
        </button>
      </div>

      <p className="newapi-hint">{t('modelHint')}</p>

      <button type="button" className="newapi-button newapi-button--primary" disabled={busy || !writable} onClick={() => { void save() }}>
        {busy ? t('applying') : t('apply')}
      </button>
    </section>
  )
}
