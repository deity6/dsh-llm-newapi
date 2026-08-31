/**
 * The NewAPI settings section: a LIST of gateway instances, each its own
 * card ({@link InstanceEditor}). The parent owns the persistent drafts and
 * the global Save (writes `{ instances: [...] }` into the `llm-newapi`
 * namespace and any pending per-instance keys into the credentials seam).
 * A pre-0.9.0 flat section value (top-level `baseURL`/`models`/`proxy`)
 * loads as one `default` instance so nothing breaks on upgrade.
 */
import { useEffect, useRef, useState } from 'react'
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
  /**
   * Debounced auto-save on every draft change (default true). Tests disable
   * it so a deferred write never races their assertions.
   */
  autoSave?: boolean
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
  const { api, t, fetchModelParams, probe, parseChannelConn, autoSave = true } = props
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
  // Configuration page vs global-settings page (gear): the two panels slide
  // into each other; the gear hosts undo prefs and the channel-import action.
  const [page, setPage] = useState<'config' | 'settings'>('config')
  // Global (non-instance) settings, persisted in the section's `ui` block.
  const [ui, setUi] = useState({ undoMs: 7000, undoEnabled: true })
  // Big-window confirm for instance deletion (destructive: tears the route).
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState(-1)
  const [confirmRemoveLeaving, setConfirmRemoveLeaving] = useState(false)
  // Import (moved into the settings page): raw descriptor + busy + error.
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | undefined>(undefined)
  // Save state machine: clean → dirty (auto-save armed) → saving → saved.
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved'>('clean')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /**
   * Transient toasts: the differentiated feedback surface. Success reads as
   * a green "applied live" pill, deletions as an undo pill, errors inline
   * where they happen. Toasts self-dismiss with a fade-out; undo pills
   * linger for the configured (and toggleable) duration.
   */
  interface Toast {
    id: number
    kind: 'ok' | 'info' | 'undo'
    text: string
    leaving?: boolean
    onUndo?: () => void
  }
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const toastSeq = useRef(0)
  const dismissToast = (id: number): void => {
    setToasts(current => current.filter(toast => toast.id !== id))
  }
  const pushToast = (text: string, kind: Toast['kind'], onUndo?: () => void): void => {
    const id = ++toastSeq.current
    setToasts(current => [...current, { id, kind, text, ...onUndo === undefined ? {} : { onUndo } }])
    // Fade out before removal: mark leaving 250ms early, then drop it.
    const total = kind === 'undo' && ui.undoEnabled ? ui.undoMs : kind === 'undo' ? 4000 : 3500
    setTimeout(() => {
      setToasts(current => current.map(toast => toast.id === id ? { ...toast, leaving: true } : toast))
    }, Math.max(0, total - 250))
    setTimeout(() => dismissToast(id), total)
  }
  // Unmount safety: drop pending auto-save + toast timers.
  useEffect(() => () => {
    if (autoSaveTimer.current !== undefined) clearTimeout(autoSaveTimer.current)
  }, [])

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
      // Global (non-instance) UI prefs live in the section's `ui` block.
      const raw = (section.value as { ui?: { undoMs?: unknown; undoEnabled?: unknown } } | null)?.ui
      setUi({
        undoMs: typeof raw?.undoMs === 'number' && Number.isFinite(raw.undoMs) ? raw.undoMs : 7000,
        undoEnabled: typeof raw?.undoEnabled === 'boolean' ? raw.undoEnabled : true,
      })
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
    markDirty()
  }

  // Any functional edit arms the debounced auto-save and flags the toolbar
  // state; the manual Save button flushes immediately.
  const markDirty = (): void => {
    setSaveState('dirty')
    if (autoSaveTimer.current !== undefined) clearTimeout(autoSaveTimer.current)
    if (!autoSave) return
    autoSaveTimer.current = setTimeout(() => { void save(true) }, 1500)
  }

  const removeInstance = (index: number): void => {
    setInstances(current => current.filter((_, at) => at !== index))
    setActiveIndex(current => {
      if (index < current) return current - 1 // a tab above closed: shift up
      if (index === current) return current   // the active tab closed: the next
      return current                          // slides into this position
    })
    markDirty()
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
    markDirty()
  }

  const handlePendingKey = (index: number, value: string): void => {
    const ref = clientRefOf(instances[index]?.id ?? '')
    setPendingKeys(current => {
      const next = new Map(current)
      if (value.trim().length === 0) next.delete(ref)
      else next.set(ref, value)
      return next
    })
    markDirty()
  }

  const instanceProblem = (): string | undefined => {
    const seen = new Set<string>()
    const names = new Set<string>()
    for (const [index, draft] of instances.entries()) {
      const id = sanitizeClientId(draft.id)
      if (draft.id.trim().length === 0) return `${t('instanceIdRequired')} (${t('instanceTitle')} ${String(index + 1)})`
      if (seen.has(id)) return `${t('instanceIdDuplicate')} (${id})`
      seen.add(id)
      // The display name doubles as the provider label in the model picker
      // and the catalog group title — two gateways wearing the same label
      // are indistinguishable there, so refuse the duplicate.
      const name = draft.displayName.trim()
      if (name.length > 0) {
        if (names.has(name)) return `${t('instanceNameDuplicate')} (${name})`
        names.add(name)
      }
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

  const save = async (fromAuto = false): Promise<void> => {
    const problem = instanceProblem()
    if (problem !== undefined) {
      setErrorText(problem)
      if (fromAuto) setSaveState('dirty')
      return
    }
    if (autoSaveTimer.current !== undefined) clearTimeout(autoSaveTimer.current)
    setBusy(true)
    setSaveState('saving')
    setErrorText(undefined)
    try {
      const ops: SettingsPathOpView[] = [{
        op: 'set',
        path: ['instances'],
        value: instances.map(serializeInstance),
      }, {
        op: 'set',
        path: ['ui'],
        value: ui,
      }]
      const mutated = await api.settings.mutate({ ns: NS, ops, expectedRevision: revision })
      if (!mutated.result.ok) {
        setErrorText(mutated.result.error.message)
        if (fromAuto) setSaveState('dirty')
        return
      }
      setRevision(mutated.result.value.revision)
      for (const [ref, value] of pendingKeys) {
        const stored = await api.credentials.set({ ref, value: value.trim() })
        if (!stored.result.ok) {
          setErrorText(stored.result.error.message)
          if (fromAuto) setSaveState('dirty')
          return
        }
      }
      setPendingKeys(new Map())
      // Manual saves toast; the debounced auto-save stays quiet (the toolbar
      // state pill already said 已保存). Both confirm the write applied live.
      if (!fromAuto) pushToast(`${t('saved')} · ${t('appliedImmediate')}`, 'ok')
      setSaveState('saved')
      setTimeout(() => {
        setSaveState(current => current === 'saved' ? 'clean' : current)
      }, 2000)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
      setSaveState('dirty')
    } finally {
      setBusy(false)
    }
  }

  // Channel-connection import, hosted on the settings page: parse the blob
  // and append a NEW instance carrying the descriptor's endpoint + key.
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
      const parsed = await parseChannelConn(blob)
      if (!parsed.ok) {
        setImportError(parsed.error.message)
        return
      }
      const value = parsed.value
      const used = new Set(instances.map(d => d.id))
      let n = instances.length + 1
      while (used.has(`newapi-${String(n)}`)) n++
      const newId = `newapi-${String(n)}`
      setInstances(current => [...current, { ...blankDraft(), id: newId, displayName: '', baseURL: value.baseURL }])
      setActiveIndex(instances.length)
      setPendingKeys(current => new Map(current).set(clientRefOf(newId), value.apiKey))
      setImportText('')
      setPage('config')
      markDirty()
      pushToast(t('importApplied'), 'ok')
    } finally {
      setImportBusy(false)
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
      {!writable ? <p>{t('readOnly')}</p> : null}
      {errorText === undefined ? null : <p className="newapi-error">{errorText}</p>}

      {/* Toolbar: config ⇄ settings pages, live save state, manual save. */}
      <div className="newapi-toolbar">
        <div className="newapi-toolbar-tabs" role="tablist" aria-label={t('nav')}>
          <button
            type="button" role="tab" aria-selected={page === 'config'}
            className={`newapi-toolbar-tab${page === 'config' ? ' newapi-toolbar-tabActive' : ''}`}
            onClick={() => { setPage('config') }}
          >
            <span className="newapi-toolbar-ico newapi-toolbar-ico--cards" aria-hidden />
            {t('configPage')}
          </button>
          <button
            type="button" role="tab" aria-selected={page === 'settings'}
            className={`newapi-toolbar-tab${page === 'settings' ? ' newapi-toolbar-tabActive' : ''}`}
            onClick={() => { setPage('settings') }}
          >
            <span className="newapi-toolbar-ico newapi-toolbar-ico--gear" aria-hidden />
            {t('settingsPage')}
          </button>
        </div>
        <div className="newapi-toolbar-right">
          <span className={`newapi-savestate${saveState === 'clean' ? ' newapi-savestate--hidden' : ''} newapi-savestate--${saveState}`}>
            {saveState === 'dirty' ? t('unsaved') : saveState === 'saving' ? t('saving') : t('savedLive')}
          </span>
          <button
            type="button" className="newapi-button newapi-button--primary"
            disabled={busy || !writable}
            onClick={() => { void save(false) }}
          >
            {busy ? t('applying') : t('apply')}
          </button>
        </div>
      </div>

      <div className={`newapi-page newapi-page--${page}`}>
        <div className="newapi-panel">
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
              // Keyed by POSITION, not by draft id: the id field is editable,
              // and a key that changes mid-typing would remount the whole card.
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
              onPatch={(patch) => { patchInstance(safeActiveIndex, patch) }}
              onPendingKey={(value) => { handlePendingKey(safeActiveIndex, value) }}
              onRequestRemove={() => { setConfirmRemoveIndex(safeActiveIndex) }}
              notify={pushToast}
              undoEnabled={ui.undoEnabled}
            />
          )}

          <p className="newapi-hint">{t('modelHint')}</p>
        </div>

        <div className="newapi-panel">
          <section className="newapi-settings-block" aria-label={t('settingsPage')}>
            <div className="newapi-catalog-head">
              <span className="newapi-catalog-title">{t('settingsUndo')}</span>
              <button
                type="button" role="switch" aria-checked={ui.undoEnabled}
                aria-label={t('settingsUndo')}
                className={`newapi-switch${ui.undoEnabled ? ' newapi-switch--on' : ''}`}
                onClick={() => {
                  setUi(current => {
                    const next = { ...current, undoEnabled: !current.undoEnabled }
                    pushToast(next.undoEnabled ? t('undoOn') : t('undoOff'), 'info')
                    markDirty()
                    return next
                  })
                }}
              >
                <span className="newapi-switch-knob" />
              </button>
            </div>
            <label className="newapi-proxylabel">
              {t('settingsUndoMs')}
              <input
                className="newapi-input newapi-select" type="number" min={1000} max={60000} step={500}
                aria-label={t('settingsUndoMs')}
                value={ui.undoMs}
                disabled={!ui.undoEnabled}
                onChange={(event) => {
                  const ms = Number(event.target.value)
                  if (!Number.isFinite(ms) || ms <= 0) return
                  setUi(current => ({ ...current, undoMs: Math.min(60000, Math.max(1000, ms)) }))
                  markDirty()
                }}
              />
            </label>

            <div className="newapi-catalog-head" style={{ marginTop: 18 }}>
              <span className="newapi-catalog-title">{t('importChannelConn')}</span>
            </div>
            <p className="newapi-hint">{t('importHint')}</p>
            <textarea
              className="newapi-input" rows={3} spellCheck={false}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              value={importText}
              onChange={(event) => { setImportText(event.target.value); setImportError(undefined) }}
            />
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
                onClick={() => { setImportText(''); setImportError(undefined) }}
              >
                {t('fetchCancel')}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Instance deletion is destructive (route torn down, credential
          orphaned): a big-window confirm, never an undo. */}
      {confirmRemoveIndex < 0 ? null : (
        <div
          className={`newapi-modal-backdrop${confirmRemoveLeaving ? ' newapi-modal--leaving' : ''}`}
          onClick={() => { setConfirmRemoveIndex(-1) }}
        >
          <div
            className="newapi-modal" role="dialog" aria-modal="true"
            aria-label={t('confirmRemoveInstance')}
            onClick={(event) => { event.stopPropagation() }}
          >
            <h3 className="newapi-modal-title">{t('confirmRemoveInstance')}</h3>
            <p className="newapi-modal-body">
              {`${t('confirmRemoveInstanceBody')} ${instances[confirmRemoveIndex]?.displayName.trim() || instances[confirmRemoveIndex]?.id || ''}`}
            </p>
            <div className="newapi-modal-actions">
              <button
                type="button" className="newapi-button"
                onClick={() => { setConfirmRemoveIndex(-1) }}
              >
                {t('fetchCancel')}
              </button>
              <button
                type="button" className="newapi-button newapi-button--danger"
                onClick={() => {
                  const index = confirmRemoveIndex
                  setConfirmRemoveIndex(-1)
                  setConfirmRemoveLeaving(true)
                  setTimeout(() => setConfirmRemoveLeaving(false), 200)
                  removeInstance(index)
                  pushToast(t('removedInstance'), 'info')
                }}
              >
                {t('confirmRemove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length === 0 ? null : (
        <div className="newapi-toasts" role="status" aria-live="polite">
          {toasts.map(toast => (
            <div key={toast.id} className={`newapi-toast newapi-toast--${toast.kind}${toast.leaving === true ? ' newapi-toast--leaving' : ''}`}>
              <span className="newapi-toast-text">{toast.text}</span>
              {toast.onUndo === undefined ? null : (
                <button
                  type="button" className="newapi-toast-undo"
                  onClick={() => { toast.onUndo?.(); dismissToast(toast.id) }}
                >
                  {t('undo')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
