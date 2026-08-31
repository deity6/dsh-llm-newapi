/**
 * Browser half apply: register the NewAPI copy dictionary and, once the
 * `settings.section` declaration is on the ledger, one settings page of our
 * own. Zero dsh modifications — the section slot is `kind: 'list'`, built for
 * feature-owned pages ("adding a setting never means editing the shell").
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.locale Context merge into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { NewApiSection } from './NewApiSection.tsx'
import type { NewApiKey } from './locale.ts'
import { en, zh } from './locale.ts'
import type {
  ModelsDevParamsRequest,
  ModelsDevParamsResponse,
  ParsedChannelConn,
  ProbeRequest,
  ProbeResult,
} from './params-types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The NewAPI settings section copy. */
    'settings.newapi': NewApiKey
  }
}

/** Copy namespace owned by this plugin. */
const NS = 'settings.newapi'

/**
 * Section styles. The browser bundle is one JS file (ClientModuleRegistry
 * serves no plugin CSS), so the section injects its rules as a fiber-scoped
 * `<style>` element. Every color rides the shell's `--dsw-alias-*` design
 * tokens, which `ui-theme` redefines under `body[data-ds-dark-theme]` — one
 * set of rules renders correctly in both light and dark themes. The recipes
 * mirror `ui-settings-models` (`.input`, `.primaryButton`,
 * `.secondaryButton`).
 */
const SECTION_CSS = `
.newapi-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.newapi-input {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.newapi-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.newapi-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.newapi-input:disabled { opacity: 0.6; cursor: default; }
.newapi-button {
  padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.newapi-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.newapi-button:disabled { opacity: 0.4; cursor: default; }
.newapi-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.newapi-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.newapi-error { color: var(--dsw-alias-state-error-primary); }
.newapi-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
/* Connectivity probe row + result card. */
.newapi-proberow { display: flex; flex-direction: row; align-items: center; flex-wrap: wrap; gap: 10px; }
.newapi-probecheck { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.newapi-probe {
  margin: 10px 0 2px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  font-size: 12px; line-height: 18px; background: var(--dsw-alias-bg-layer-1);
}
.newapi-probe-ok { color: var(--dsw-alias-brand-primary); font-weight: 500; }
.newapi-probe-bad { color: var(--dsw-alias-state-error-primary); font-weight: 500; }
/* Model catalog, mirroring ui-settings-models: one bordered entry per
   model, id and display name on the row, capacities behind the row's own
   disclosure. */
.newapi-catalog {
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 12px; margin-bottom: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.newapi-catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.newapi-catalog-title {
  font-size: 12px; line-height: 18px; font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.newapi-linkbutton {
  box-sizing: border-box; display: inline-flex; align-items: center;
  height: 28px; padding: 0 10px; border: none; border-radius: 14px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.newapi-linkbutton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.newapi-linkbutton:disabled { opacity: 0.4; cursor: default; }
.newapi-empty { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.newapi-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0 12px;
  scrollbar-width: thin;
}
.newapi-tab {
  flex: 0 0 auto;
  max-width: 180px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color .12s, border-color .12s, color .12s;
}
.newapi-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.newapi-tabActive {
  color: #fff;
  background: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
.newapi-tabActive:hover { background: var(--dsw-alias-state-business-primary); color: #fff; }
.newapi-tabLabel { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.newapi-tabAdd {
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: 1px dashed var(--dsw-alias-border-l2);
  padding: 6px 12px;
  font-size: 16px;
  line-height: 16px;
}
.newapi-tabAdd:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
.newapi-entry {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px;
}
.newapi-modelrow {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
}
/* Square, label-free affordances: the row's own inputs carry the meaning, so
   the actions stay glyphs and announce themselves through aria-label. */
.newapi-iconbutton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.newapi-iconbutton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.newapi-iconbutton:disabled { opacity: 0.4; cursor: default; }
.newapi-iconbutton--danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.newapi-modeladvanced {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  padding: 8px 4px 2px;
}
.newapi-modelfield { display: flex; flex-direction: column; gap: 4px; }
.newapi-modelfield-label { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.newapi-addmodel {
  box-sizing: border-box; align-self: flex-start; display: inline-flex; align-items: center;
  gap: 4px; height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.newapi-addmodel:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.newapi-addmodel:disabled { opacity: 0.4; cursor: default; }
.newapi-candidates { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.newapi-candidates ul { list-style: none; padding: 0; margin: 8px 0; }
/* Proxy control + models.dev params panel. */
.newapi-proxyrow {
  display: flex; flex-direction: row; align-items: center; flex-wrap: wrap;
  gap: 8px; margin-bottom: 12px;
}
.newapi-proxyrow label { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-primary); }
/* Custom request header editor: one name + value + remove row. */
.newapi-headers {
  display: flex; flex-direction: column; gap: 8px;
  padding-top: 12px; margin-bottom: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.newapi-headerrow {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr) auto;
  align-items: center;
  gap: 6px;
}
.newapi-select {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; max-width: 220px;
}
.newapi-params {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  padding: 12px; margin-bottom: 12px;
}
.newapi-params-summary { margin: 6px 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.newapi-params-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 8px; padding: 4px 0;
}
/* The id rides a fixed-width text box so rows align; content wider than
   the box stays hidden until hover, when it scrolls horizontally. */
.newapi-params-id {
  box-sizing: border-box; width: 30ch; max-width: 30ch;
  padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 18px;
  text-align: left; white-space: nowrap; overflow: hidden;
  scrollbar-width: thin;
}
.newapi-params-id:hover { overflow-x: auto; }
.newapi-params-values {
  color: var(--dsw-alias-label-tertiary); font-size: 12px;
  font-variant-numeric: tabular-nums; text-align: left;
}
.newapi-params-unmatched { color: var(--dsw-alias-label-dimmed); font-size: 12px; padding: 4px 0; }
/* One gateway instance card. */
.newapi-instance {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 14px 14px 4px;
  margin: 0 0 14px;
}
.newapi-instance-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 0 2px 10px;
}
.newapi-instance-title {
  font-size: 13px; line-height: 20px; font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.newapi-instance-actions {
  display: flex; align-items: center; gap: 2px;
}
/* Armed removal: the two-step instance-delete confirm state. */
.newapi-confirm {
  background: var(--dsw-alias-state-error-primary);
  color: #fff;
}
.newapi-confirm:hover:not(:disabled) { background: var(--dsw-alias-state-error-primary); color: #fff; }
/* Transient feedback toasts (save success, undo pills). */
.newapi-toasts {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  z-index: 1000; pointer-events: none;
}
.newapi-toast {
  box-sizing: border-box; display: flex; align-items: center; gap: 10px;
  max-width: min(520px, calc(100vw - 48px));
  padding: 9px 14px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-menu);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-shadow-lv3);
  font-size: 13px; line-height: 18px;
  pointer-events: auto;
  animation: newapi-toast-in .18s ease;
}
@keyframes newapi-toast-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.newapi-toast--ok { border-color: var(--dsw-alias-state-success-primary); }
.newapi-toast--undo { border-color: var(--dsw-alias-state-warn-primary); }
.newapi-toast-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.newapi-toast-undo {
  flex: none; padding: 2px 8px; border: none; border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-brand-primary);
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.newapi-toast-undo:hover { background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); }
.newapi-toast--leaving {
  opacity: 0; transform: translateY(4px);
  transition: opacity .2s ease, transform .2s ease;
}
/* Toolbar: config ⇄ settings page switch + live save state + manual save. */
.newapi-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 0; margin-bottom: 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.newapi-toolbar-tabs { display: flex; gap: 4px; }
.newapi-toolbar-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.newapi-toolbar-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.newapi-toolbar-tabActive { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.newapi-toolbar-ico { width: 14px; height: 14px; flex: none; }
.newapi-toolbar-ico--cards {
  border: 1.6px solid currentColor; border-radius: 3px;
  box-shadow: 4px 0 0 -1px currentColor, 4px 4px 0 -1px currentColor, 0 4px 0 -1px currentColor;
  margin-right: 2px;
}
.newapi-toolbar-ico--gear {
  border-radius: 50%;
  border: 1.6px solid currentColor;
  background:
    radial-gradient(circle at center, currentColor 0 2.4px, transparent 2.6px),
    conic-gradient(from 0deg, transparent 0 30deg, currentColor 30deg 42deg, transparent 42deg 102deg, currentColor 102deg 114deg, transparent 114deg 174deg, currentColor 174deg 186deg, transparent 186deg 246deg, currentColor 246deg 258deg, transparent 258deg 318deg, currentColor 318deg 330deg, transparent 330deg);
}
.newapi-toolbar-right { display: flex; align-items: center; gap: 8px; }
.newapi-savestate {
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
  opacity: 1; transition: opacity .25s ease;
}
.newapi-savestate--hidden { opacity: 0; }
.newapi-savestate--dirty { color: var(--dsw-alias-state-warn-label); }
.newapi-savestate--saving { color: var(--dsw-alias-label-tertiary); }
.newapi-savestate--saved { color: var(--dsw-alias-state-success-primary); }
/* Sliding pages: the settings panel slides over the config one. */
.newapi-page { display: flex; overflow: hidden; }
.newapi-panel { width: 100%; flex: none; transition: transform .24s ease; }
.newapi-page--settings .newapi-panel { transform: translateX(-100%); }
/* Big-window confirm modal. */
.newapi-modal-backdrop {
  position: fixed; inset: 0; z-index: 900;
  background: color-mix(in srgb, var(--dsw-specific-menu) 60%, transparent);
  display: flex; align-items: center; justify-content: center;
  animation: newapi-backdrop-in .15s ease;
}
@keyframes newapi-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
.newapi-modal-backdrop.newapi-modal--leaving { opacity: 0; transition: opacity .2s ease; }
.newapi-modal {
  width: min(420px, calc(100vw - 48px));
  box-sizing: border-box; padding: 18px; border-radius: 14px;
  background: var(--dsw-specific-menu);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-shadow-lv3);
  animation: newapi-modal-in .18s ease;
}
@keyframes newapi-modal-in { from { opacity: 0; transform: scale(.96) translateY(6px); } to { opacity: 1; transform: none; } }
.newapi-modal-title { margin: 0 0 8px; font-size: 15px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.newapi-modal-body { margin: 0 0 16px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.newapi-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.newapi-button--danger { background: var(--dsw-alias-state-error-primary); color: #fff; }
.newapi-button--danger:hover:not(:disabled) { background: var(--dsw-alias-state-error-primary); color: #fff; }
/* Animated switch (probe options, undo toggle). */
.newapi-switch {
  box-sizing: border-box; width: 34px; height: 20px; flex: none;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer; padding: 0; position: relative;
  transition: background .18s ease, border-color .18s ease;
}
.newapi-switch-knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--dsw-alias-label-tertiary);
  transition: transform .18s ease, background .18s ease;
}
.newapi-switch--on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.newapi-switch--on .newapi-switch-knob { transform: translateX(14px); background: #fff; }
.newapi-probecheck { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 18px; }
/* Row delete fade-out. */
.newapi-entry { transition: opacity .2s ease, transform .2s ease; }
.newapi-entry--leaving { opacity: 0; transform: translateX(8px); }
`

/** Required services (cordis fiber inject): the section slot, copy, and the wire face. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the NewAPI settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'llm-newapi: copy dictionaries')

  // Fiber-scoped styles: removed with the plugin, so a reload swaps them cleanly.
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const element = document.createElement('style')
      element.textContent = SECTION_CSS
      document.head.append(element)
      return () => { element.remove() }
    }, 'llm-newapi: section styles')
  }

  const connection = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS) as (key: NewApiKey) => string

  // One plain callback over the plugin's host RPC channel: the browser names
  // the gateway model ids (and the proxy draft) and the host downloads
  // https://models.dev/api.json — no cross-origin fetch in the browser.
  const fetchModelParams = (request: ModelsDevParamsRequest) =>
    connection.rpc.call('/llm-newapi', 'models-dev-params', request) as Promise<
      { ok: true; value: ModelsDevParamsResponse } | { ok: false; error: { message: string } }
    >

  // Connectivity + auth probe: the host normalizes the drafted base, resolves
  // the one-shot key (or the stored credential), and calls GET /models
  // (optionally followed by a minimal-cost chat probe when chatModel is set).
  const probe = (request: ProbeRequest) =>
    connection.rpc.call('/llm-newapi', 'probe', request) as Promise<
      { ok: true; value: ProbeResult } | { ok: false; error: { message: string } }
    >

  // Channel-connection descriptor import: the host parses a pasted
  // newapi_channel_conn-style blob into { baseURL, apiKey } — no
  // descriptor-format logic leaks into the browser.
  const parseChannelConn = (blob: unknown) =>
    connection.rpc.call('/llm-newapi', 'parse-channel-conn', blob) as Promise<
      { ok: true; value: ParsedChannelConn } | { ok: false; error: { message: string } }
    >

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'newapi',
    order: 15,
    label: () => t('nav'),
    inject: () => ({ api: connection.api, t, fetchModelParams, probe, parseChannelConn }),
  }, NewApiSection))
}
