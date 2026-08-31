/**
 * Refresh-shell helpers (v0.9.13): segmented control, settings panel,
 * instance edit page, and inline SVG icons. Kept in their own module so
 * the top-level NewApiSection stays scannable.
 */

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { NewApiKey } from './locale.ts'
import { setSoundEnabled } from './sound.ts'

/** Per-instance credential view, mirrored here to avoid pulling the
 *  full InstanceEditor module's surface area into the type imports. */
import { clientRefOf, InstanceEditor } from './InstanceEditor.tsx'
import type { InstanceDraft, InstanceEditorProps } from './InstanceEditor.tsx'

/** Per-instance credential view (mirror of NewApiSection's view). */
interface CredentialView {
  configured?: boolean
  locked: boolean
}

/** Single switch row (settings page). */
export function SwitchRow(props: {
  title: string
  subtitle?: string
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}): ReactNode {
  return (
    <div className="newapi-row">
      <div>
        <div className="newapi-row-label">{props.title}</div>
        {props.subtitle === undefined ? null : <div className="newapi-row-sub">{props.subtitle}</div>}
      </div>
      <div className="newapi-row-control">
        <button
          type="button" role="switch" aria-checked={props.checked}
          aria-label={props.ariaLabel}
          className={`newapi-switch${props.checked ? ' newapi-switch--on' : ''}`}
          onClick={() => { props.onChange(!props.checked) }}
        >
          <span className="newapi-switch-knob" />
        </button>
      </div>
    </div>
  )
}

/** Single numeric input row (settings page). */
export function NumberRow(props: {
  title: string
  subtitle?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  ariaLabel: string
  onChange: (next: number) => void
}): ReactNode {
  return (
    <div className="newapi-row">
      <div>
        <div className="newapi-row-label">{props.title}</div>
        {props.subtitle === undefined ? null : <div className="newapi-row-sub">{props.subtitle}</div>}
      </div>
      <div className="newapi-row-control" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number" className="newapi-input newapi-select"
          style={{ width: 100 }}
          min={props.min} max={props.max} step={props.step}
          value={props.value} disabled={props.disabled === true}
          aria-label={props.ariaLabel}
          onChange={(event) => {
            const n = Number(event.target.value)
            if (!Number.isFinite(n) || n <= 0) return
            props.onChange(Math.min(props.max, Math.max(props.min, n)))
          }}
        />
        <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>{props.unit}</span>
      </div>
    </div>
  )
}

export interface UiSettings {
  undoMs: number
  undoEnabled: boolean
  soundEnabled: boolean
  deleteRecoverHint: boolean
}

/** Settings page content: two section groups (general + data). */
export function SettingsPanel(props: {
  ui: UiSettings
  setUi: Dispatch<SetStateAction<UiSettings>>
  markDirty: () => void
  pushToast: (text: string, kind: 'ok' | 'info' | 'undo', onUndo?: () => void) => void
  t: (key: NewApiKey) => string
  importText: string
  setImportText: (next: string) => void
  importError: string | undefined
  setImportError: (next: string | undefined) => void
  importBusy: boolean
  runImport: () => Promise<void>
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="newapi-sectiongroup">
        <div className="newapi-sectiongroup-head">{props.t('settingsGroupGeneral')}</div>
        <div className="newapi-sectiongroup-body">
          <SwitchRow
            title={props.t('deleteRecoverHintTitle')}
            subtitle={props.t('deleteRecoverHintSubtitle')}
            ariaLabel={props.t('deleteRecoverHintTitle')}
            checked={props.ui.deleteRecoverHint}
            onChange={(next) => {
              props.setUi(current => ({ ...current, deleteRecoverHint: next }))
              props.markDirty()
            }}
          />
          <SwitchRow
            title={props.t('soundEnabledTitle')}
            subtitle={props.t('soundEnabledSubtitle')}
            ariaLabel={props.t('soundEnabledTitle')}
            checked={props.ui.soundEnabled}
            onChange={(next) => {
              props.setUi(current => ({ ...current, soundEnabled: next }))
              setSoundEnabled(next)
              props.pushToast(next ? props.t('soundOn') : props.t('soundOff'), 'info')
              props.markDirty()
            }}
          />
          <SwitchRow
            title={props.t('settingsUndo')}
            ariaLabel={props.t('settingsUndo')}
            checked={props.ui.undoEnabled}
            onChange={(next) => {
              props.setUi(current => ({ ...current, undoEnabled: next }))
              props.pushToast(next ? props.t('undoOn') : props.t('undoOff'), 'info')
              props.markDirty()
            }}
          />
          <NumberRow
            title={props.t('undoMsTitle')}
            subtitle={props.t('undoMsSubtitle')}
            ariaLabel={props.t('undoMsTitle')}
            value={props.ui.undoMs}
            min={1000} max={60000} step={500} unit="ms"
            disabled={!props.ui.undoEnabled}
            onChange={(next) => {
              props.setUi(current => ({ ...current, undoMs: next }))
              props.markDirty()
            }}
          />
        </div>
      </div>

      <div className="newapi-sectiongroup">
        <div className="newapi-sectiongroup-head">{props.t('settingsGroupData')}</div>
        <div className="newapi-sectiongroup-body">
          <div className="newapi-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div>
              <div className="newapi-row-label">{props.t('importChannelConnTitle')}</div>
              <div className="newapi-row-sub">{props.t('importChannelConnSubtitle')}</div>
            </div>
            <textarea
              className="newapi-input" rows={3} spellCheck={false}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              value={props.importText}
              onChange={(event) => { props.setImportText(event.target.value); props.setImportError(undefined) }}
            />
            {props.importError === undefined ? null : <p className="newapi-error">{props.importError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button" className="newapi-btn newapi-btn--primary"
                disabled={props.importBusy || props.importText.trim().length === 0}
                onClick={() => { void props.runImport() }}
              >{props.importBusy ? '…' : props.t('importApply')}</button>
              <button
                type="button" className="newapi-btn newapi-btn--ghost"
                onClick={() => { props.setImportText(''); props.setImportError(undefined) }}
              >{props.t('fetchCancel')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
  badge?: string
}

/** Sliding-thumb segmented control (图1 风格). */
export function SegmentedControl<T extends string>(props: {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
}): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; width: number }>({ x: 0, width: 0 })
  const layoutThumb = (): void => {
    const node = containerRef.current
    if (node === null) return
    const active = node.querySelector<HTMLElement>(`[data-value="${props.value}"]`)
    if (active === null) return
    const containerRect = node.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    setThumb({ x: activeRect.left - containerRect.left, width: activeRect.width })
  }
  useEffect(() => {
    layoutThumb()
    const onResize = (): void => { layoutThumb() }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value])
  return (
    <div ref={containerRef} className="newapi-seg" role="tablist">
      <span
        className="newapi-seg-thumb"
        style={{ transform: `translateX(${thumb.x}px)`, width: `${thumb.width}px` }}
      />
      {props.options.map(option => (
        <button
          key={option.value}
          type="button" role="tab"
          data-value={option.value}
          aria-selected={props.value === option.value}
          className={`newapi-seg-opt${props.value === option.value ? ' newapi-seg-opt--active' : ''}`}
          onClick={() => { props.onChange(option.value) }}
        >
          {option.label}
          {option.badge !== undefined ? <span className="newapi-card-badge" style={{ marginLeft: 6 }}>{option.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** ── Inline SVG icons (no asset deps) ───────────────────────────────── */

export function IconChevron(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPlus(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconTrash(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3 5h14M8 5V3.5a1 1 0 011-1h2a1 1 0 011 1V5M5.5 5l.8 11a1 1 0 001 .9h5.4a1 1 0 001-.9L14.5 5M8 8.5v5M12 8.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconBack(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCard(props: { type: 'openai' | 'anthropic' | 'responses' }): ReactNode {
  if (props.type === 'anthropic') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  if (props.type === 'responses') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 8h14M5 12h10M5 16h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Instance edit sub-page: header + editor + danger area. */
export function InstanceEditPage(props: {
  draft: InstanceDraft
  credential: CredentialView | undefined
  onBack: () => void
  onPatch: (patch: Partial<InstanceDraft>) => void
  onPendingKey: (ref: string, value: string) => void
  onRemove: () => void
  notify: (text: string, kind: 'ok' | 'info' | 'undo', onUndo?: () => void) => void
  undoEnabled: boolean
  api: InstanceEditorProps['api']
  t: (key: NewApiKey) => string
  fetchModelParams: InstanceEditorProps['fetchModelParams']
  probe: InstanceEditorProps['probe']
}): ReactNode {
  const ref = clientRefOf(props.draft.id)
  const title = props.draft.displayName.trim().length > 0
    ? props.draft.displayName
    : (props.draft.id.trim().length > 0 ? props.draft.id : props.t('instanceTitle'))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="newapi-pagehead">
        <button type="button" className="newapi-pagehead-back" aria-label={props.t('fetchCancel')} onClick={props.onBack}>
          <IconBack />
        </button>
        <span className="newapi-pagehead-title">{title}</span>
      </div>

      <InstanceEditor
        index={0}
        draft={props.draft}
        {...props.credential === undefined
          ? { keyLocked: false }
          : {
            ...props.credential.configured === undefined ? {} : { keyConfigured: props.credential.configured },
            keyLocked: props.credential.locked,
          }}
        api={props.api}
        t={props.t}
        fetchModelParams={props.fetchModelParams}
        probe={props.probe}
        onPatch={props.onPatch}
        onPendingKey={(value) => { props.onPendingKey(ref, value) }}
        onRequestRemove={() => { /* danger area below owns delete */ }}
        hideRemoveButton
        notify={props.notify}
        undoEnabled={props.undoEnabled}
      />

      <div className="newapi-danger">
        <div className="newapi-danger-head">{props.t('dangerArea')}</div>
        <div className="newapi-danger-body">
          <div className="newapi-danger-hint">{props.t('removeInstanceHint')}</div>
          <button
            type="button" className="newapi-btn newapi-btn--danger"
            aria-label={props.t('removeInstance')}
            onClick={props.onRemove}
          >
            {props.t('removeInstance')}
          </button>
        </div>
      </div>
    </div>
  )
}