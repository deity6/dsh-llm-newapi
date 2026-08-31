/**
 * The NewAPI settings section: a LIST of gateway instances, each its own
 * card ({@link InstanceEditor}). The parent owns the persistent drafts and
 * the global Save (writes `{ instances: [...] }` into the `llm-newapi`
 * namespace and any pending per-instance keys into the credentials seam).
 * A pre-0.9.0 flat section value (top-level `baseURL`/`models`/`proxy`)
 * loads as one `default` instance so nothing breaks on upgrade.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-client-connection/client'
import { DEFAULT_PROXY_URL, InstanceEditor, sanitizeClientId, clientRefOf, headersToList, headersToRecord } from './InstanceEditor.tsx'
import type { InstanceDraft, InstanceProxyMode, ModelDraft } from './InstanceEditor.tsx'
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

/** Normalize a stored proxy block onto the draft's mode + url pair. */
function proxyOf(value: unknown): { mode: InstanceProxyMode; url: string } {
  const proxy = (value ?? {}) as { mode?: unknown; enabled?: unknown; url?: unknown }
  const mode = proxy.mode === 'custom' || proxy.mode === 'direct' || proxy.mode === 'system'
    ? proxy.mode
    : (proxy.enabled === true ? 'custom' : 'direct')
  return {
    mode,
    url: typeof proxy.url === 'string' && proxy.url.length > 0 ? proxy.url : DEFAULT_PROXY_URL,
  }
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
  const proxy = proxyOf(value.proxy)
  return [{
    id: 'default',
    displayName: 'NewAPI',
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : '',
    models: Array.isArray(value.models)
      ? value.models.filter(entry => typeof entry === 'object' && entry !== null && !Array.isArray(entry)) as ModelDraft[]
      : [],
    proxyMode: proxy.mode,
    proxyUrl: proxy.url,
    headers: [],
  }]
}

function draftOf(entry: Record<string, unknown>): InstanceDraft {
  const proxy = proxyOf(entry.proxy)
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    displayName: typeof entry.displayName === 'string' ? entry.displayName : '',
    baseURL: typeof entry.baseURL === 'string' ? entry.baseURL : '',
    models: Array.isArray(entry.models)
      ? entry.models.filter(model => typeof model === 'object' && model !== null && !Array.isArray(model)) as ModelDraft[]
      : [],
    proxyMode: proxy.mode,
    proxyUrl: proxy.url,
    headers: headersToList(entry.headers as Record<string, unknown> | undefined),
  }
}

function blankDraft(): InstanceDraft {
  return {
    id: `gw-${Date.now().toString(36)}`,
    displayName: '',
    baseURL: '',
    models: [],
    proxyMode: 'system',
    proxyUrl: DEFAULT_PROXY_URL,
    headers: [],
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
  const id = sanitizeClientId(draft.id)
  return {
    id,
    // Persist the credential reference name: the official Models page only
    // joins credentials whose `apiKeyEnv` the stored profile names, so
    // writing it here is what lights up its configured/missing dot.
    apiKeyEnv: clientRefOf(id),
    ...draft.displayName.trim().length > 0 ? { displayName: draft.displayName.trim() } : {},
    ...draft.baseURL.trim().length > 0 ? { baseURL: draft.baseURL.trim() } : {},
    models,
    proxy: {
      mode: draft.proxyMode,
      ...draft.proxyMode === 'custom' && draft.proxyUrl.trim().length > 0
        ? { url: draft.proxyUrl.trim() }
        : {},
    },
    ...draft.headers.length > 0 ? { headers: headersToRecord(draft.headers) } : {},
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
  // Active tab tracked by POSITION, not by instance id: the id field is
  // editable, so matching by id makes the active tab "orphan" the moment the
  // user types (findIndex misses -> falls back to index 0 -> the card jumps
  // to the first instance). Position is stable under id edits.
  const [activeIndex, setActiveIndex] = useState(-1)
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
              // Omit `configured` rather than pass an explicit undefined —
              // the props are optional under exactOptionalPropertyTypes.
              ...entry?.configured === undefined ? {} : { configured: entry.configured },
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
  // Load on mount only: invoking an async function during render would call
  // setState before commit, which React 18 turns into an infinite update cycle
  // (error #301). The slot renders nothing while the cycle runs, which is why
  // the NewAPI section panel looked empty after v0.9.0.
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
    setActiveIndex(current => {
      if (index < current) return current - 1 // a tab above closed: shift up
      if (index === current) return current   // the active tab closed: the next
      return current                          // slides into this position
    })
  }

  // Append a new instance with a fresh unique id and switch to it, so the
  // user lands directly on the new card. Reordering is not exposed in the UI:
  // the tab order matches the array order; to reorder, remove + re-add.
  const addInstance = (): void => {
    const used = new Set(instances.map(d => d.id))
    let n = instances.length + 1
    while (used.has(`newapi-${String(n)}`)) n++
    const newId = `newapi-${String(n)}`
    setInstances(current => [...current, { ...blankDraft(), id: newId, displayName: '' }])
    setActiveIndex(instances.length) // pre-append length = the new tab's index
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
      // A model row must carry an id, and no two rows may share one: an
      // id-less row would serialize to a catalog entry the adapter rejects
      // at resolve time, so the save is refused here instead.
      const modelIds = new Set<string>()
      for (const [modelIndex, model] of draft.models.entries()) {
        const modelId = textOf(model, 'id').trim()
        if (modelId.length === 0) {
          return `${t('modelIdRequired')} (${t('models')} ${String(index + 1)} · ${String(modelIndex + 1)})`
        }
        if (modelIds.has(modelId)) return `${t('modelIdDuplicate')} (${modelId})`
        modelIds.add(modelId)
      }
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

  // Clamp the desired index to the current list (the list may have shrunk
  // after a removal above the active tab). -1 when there are no instances.
  const safeActiveIndex = instances.length === 0
    ? -1
    : Math.min(Math.max(activeIndex, 0), instances.length - 1)
  const activeDraft = safeActiveIndex >= 0 ? instances[safeActiveIndex] : undefined
  const activeCredential = activeDraft === undefined
    ? undefined
    : credentials.get(clientRefOf(activeDraft.id))

  return (
    <section aria-label={t('nav')}>
      <p>{t('intro')}</p>
      {notice === undefined ? null : <p role="status">{notice}</p>}
      {!writable ? <p>{t('readOnly')}</p> : null}
      {errorText === undefined ? null : <p className="newapi-error">{errorText}</p>}

      <div className="newapi-tabs" role="tablist" aria-label={t('instanceTabs')}>
        {instances.map((draft, index) => {
          const isActive = index === safeActiveIndex
          const label = draft.displayName.trim().length > 0
            ? draft.displayName
            : (draft.id.trim().length > 0 ? draft.id : `${t('instanceTitle')} ${String(index + 1)}`)
          return (
            <button
              key={`tab-${String(index)}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`newapi-tab ${isActive ? 'newapi-tabActive' : ''}`}
              onClick={() => { setActiveIndex(index) }}
            >
              <span className="newapi-tabLabel">{label}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="newapi-tab newapi-tabAdd"
          title={t('addInstance')}
          onClick={addInstance}
        >
          +
        </button>
      </div>

      {instances.length === 0 ? (
        <p className="newapi-empty">{t('noInstances')}</p>
      ) : activeDraft === undefined ? null : (
        <InstanceEditor
          // Keyed by POSITION, not by draft id: the id field is editable, and
          // a key that changes mid-typing would remount the whole card (losing
          // focus, the key draft, and expanded rows).
          key={`instance-${String(safeActiveIndex)}`}
          index={safeActiveIndex}
          draft={activeDraft}
          {...activeCredential === undefined
            ? { keyLocked: false }
            : {
              ...activeCredential.configured === undefined ? {} : { keyConfigured: activeCredential.configured },
              keyLocked: activeCredential.locked,
            }}
          api={api}
          t={t}
          fetchModelParams={fetchModelParams}
          probe={probe}
          parseChannelConn={parseChannelConn}
          onPatch={(patch) => { patchInstance(safeActiveIndex, patch) }}
          onPendingKey={(value) => { handlePendingKey(safeActiveIndex, value) }}
          onRemove={() => { removeInstance(safeActiveIndex) }}
        />
      )}

      <p className="newapi-hint">{t('modelHint')}</p>

      <button type="button" className="newapi-button newapi-button--primary" disabled={busy || !writable} onClick={() => { void save() }}>
        {busy ? t('applying') : t('apply')}
      </button>
    </section>
  )
}
