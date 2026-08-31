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
  color: var(--dsw-static-deepseek-300);
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
.newapi-modal-backdrop--top { z-index: 950; }
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
.newapi-switch--on { background: var(--dsw-static-deepseek-500); border-color: var(--dsw-static-deepseek-500); }
.newapi-switch--on .newapi-switch-knob { transform: translateX(14px); background: #fff; }
.newapi-probecheck { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 18px; }
/* Extra-key rows. */
.newapi-keys { margin: 4px 0 12px; }
.newapi-keyrow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; margin-bottom: 6px; }
.newapi-keyrow-id { flex: none; font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-tertiary); padding: 0 2px; }
/* Row delete fade-out. */
.newapi-entry { transition: opacity .2s ease, transform .2s ease; }
.newapi-entry--leaving { opacity: 0; transform: translateX(8px); }
/* Fetch spinner (获取模型 button). */
.newapi-spinner {
  box-sizing: border-box; width: 12px; height: 12px; display: inline-block;
  border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%;
  margin-right: 6px; vertical-align: -2px;
  animation: newapi-spin .7s linear infinite;
}
@keyframes newapi-spin { to { transform: rotate(360deg); } }
/* Recycle-bin button (toolbar) with count badge. */
.newapi-trashbtn {
  position: relative; width: 30px; height: 30px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.newapi-trashbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.newapi-trashbtn--has { color: var(--dsw-alias-label-primary); }
.newapi-trashbtn-ico { width: 15px; height: 15px; }
.newapi-trashbtn-badge {
  position: absolute; top: -4px; right: -6px; min-width: 15px; height: 15px;
  box-sizing: border-box; padding: 0 4px; border-radius: 999px;
  background: var(--dsw-alias-state-error-primary); color: #fff;
  font-size: 10px; line-height: 15px; font-weight: 700; text-align: center;
}
/* Recycle-bin panel list. */
.newapi-modal--trash { width: min(480px, calc(100vw - 48px)); }
.newapi-trash-list { list-style: none; margin: 0 0 14px; padding: 0; max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.newapi-trash-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px;
}
.newapi-trash-item-name { flex: none; max-width: 30%; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.newapi-trash-item-sub { flex: 1; min-width: 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.newapi-trash-item-actions { flex: none; display: flex; gap: 6px; }
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
      element.textContent = SECTION_CSS + '\n' + REFRESH_CSS
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

/**
 * CSS for the v0.9.13 design refresh: segmented top control, card-list
 * navigation, disclosure editing, danger area, and switch rows. Bundled
 * as a single template so the host stays CSS-light.
 */
const REFRESH_CSS = `
.newapi-shell { display: flex; flex-direction: column; gap: 16px; }

/* ── Segmented top control (sliding thumb) ──────────────────────────── */
.newapi-seg { position: relative; display: inline-flex; padding: 3px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04)); user-select: none; }
.newapi-seg-opt { position: relative; z-index: 1; flex: none; padding: 6px 16px; border: none; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; transition: color .18s ease; }
.newapi-seg-opt:hover { color: var(--dsw-alias-label-primary); }
.newapi-seg-opt--active { color: var(--dsw-alias-label-primary, #fff); }
.newapi-seg-thumb { position: absolute; top: 3px; bottom: 3px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.06); transition: transform .22s cubic-bezier(.4,.0,.2,1), width .22s cubic-bezier(.4,.0,.2,1); pointer-events: none; }
.newapi-segbar { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 4px 0; flex-wrap: wrap; }
.newapi-segbar .newapi-btn { flex: none; }

/* ── Card list (图3 风格) ────────────────────────────────────────────── */
.newapi-cardlist { display: flex; flex-direction: column; gap: 0; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); overflow: hidden; box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }
.newapi-cardlist--divider > .newapi-card + .newapi-card { border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }
.newapi-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; border: none; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; width: 100%; transition: background .14s ease; }
.newapi-card:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.newapi-card:active { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06)); }
.newapi-card-ico { width: 36px; height: 36px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--dsw-static-deepseek-50, rgba(94,140,255,.10)); color: var(--dsw-static-deepseek-500, #4a7df9); flex: none; }
.newapi-card-ico svg { width: 20px; height: 20px; }
.newapi-card-body { min-width: 0; }
.newapi-card-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.newapi-card-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.newapi-card-trailing { color: var(--dsw-alias-label-tertiary); flex: none; }
.newapi-card-trailing svg { width: 18px; height: 18px; opacity: .6; }
.newapi-card-badge { display: inline-flex; min-width: 18px; height: 18px; padding: 0 6px; border-radius: 9px; background: var(--dsw-static-deepseek-500, #4a7df9); color: #fff; font-size: 11px; font-weight: 600; align-items: center; justify-content: center; }

/* ── Section group (设置页) ─────────────────────────────────────────── */
.newapi-sectiongroup { display: flex; flex-direction: column; gap: 8px; }
.newapi-sectiongroup-head { padding: 0 4px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: .04em; }
.newapi-sectiongroup-body { display: flex; flex-direction: column; gap: 0; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); overflow: hidden; box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }
.newapi-sectiongroup-body > .newapi-row + .newapi-row { border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }

/* ── Row (设置项 / 图2 风格: 标题+副标题+右侧控件) ─────────────────── */
.newapi-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; background: transparent; }
.newapi-row-label { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.newapi-row-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.newapi-row-control { flex: none; }

/* ── Disclosure (实例编辑页折叠卡) ──────────────────────────────────── */
.newapi-disclosure { border-radius: 12px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.06)); overflow: hidden; }
.newapi-disclosure + .newapi-disclosure { margin-top: 12px; }
.newapi-disclosure > summary { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; user-select: none; }
.newapi-disclosure > summary::-webkit-details-marker { display: none; }
.newapi-disclosure > summary:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.newapi-disclosure > summary::after { content: ''; width: 8px; height: 8px; margin-left: auto; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); transition: transform .2s ease; color: var(--dsw-alias-label-tertiary); }
.newapi-disclosure[open] > summary::after { transform: rotate(-135deg); }
.newapi-disclosure-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.newapi-disclosure-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.newapi-disclosure-body { padding: 4px 16px 16px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); }

/* ── Page header with back arrow ────────────────────────────────────── */
.newapi-pagehead { display: flex; align-items: center; gap: 8px; padding: 4px 0 8px; }
.newapi-pagehead-back { width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center; border: none; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04)); color: var(--dsw-alias-label-secondary); cursor: pointer; }
.newapi-pagehead-back:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.08)); color: var(--dsw-alias-label-primary); }
.newapi-pagehead-back svg { width: 18px; height: 18px; }
.newapi-pagehead-title { font-size: 16px; font-weight: 700; color: var(--dsw-alias-label-primary); }
.newapi-pagehead-spacer { flex: 1; }
.newapi-pagehead-status { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ── Buttons (统一三态) ─────────────────────────────────────────────── */
.newapi-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 16px; border: none; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .14s ease, color .14s ease, transform .08s ease; }
.newapi-btn:active { transform: scale(.97); }
.newapi-btn:disabled { opacity: .5; cursor: not-allowed; }
.newapi-btn svg { width: 16px; height: 16px; }
.newapi-btn--primary { background: var(--dsw-static-deepseek-500, #4a7df9); color: #fff; }
.newapi-btn--primary:hover:not(:disabled) { background: var(--dsw-static-deepseek-600, #3567e8); }
.newapi-btn--ghost { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04)); color: var(--dsw-alias-label-primary); }
.newapi-btn--ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.08)); }
.newapi-btn--danger { background: transparent; color: var(--dsw-alias-state-error-primary); padding: 8px 4px; font-weight: 500; }
.newapi-btn--danger:hover:not(:disabled) { color: var(--dsw-alias-state-error-secondary, #c33030); background: var(--dsw-alias-state-error-secondary-bg, rgba(220,40,40,.06)); border-radius: 6px; }
.newapi-btn--lg { padding: 12px 20px; font-size: 14px; }

/* ── Danger area (实例编辑页底部) ──────────────────────────────────── */
.newapi-danger { margin-top: 24px; padding: 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); box-shadow: 0 0 0 1px var(--dsw-alias-state-error-secondary-bg, rgba(220,40,40,.18)); }
.newapi-danger-head { font-size: 12px; font-weight: 600; color: var(--dsw-alias-state-error-primary); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
.newapi-danger-body { display: flex; flex-direction: column; gap: 6px; }
.newapi-danger-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ── Empty state ────────────────────────────────────────────────────── */
.newapi-empty { padding: 32px 16px; text-align: center; }
.newapi-empty-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); margin-bottom: 4px; }
.newapi-empty-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ── Add-instance primary action bar ────────────────────────────────── */
.newapi-addbar { padding: 8px 0 4px; display: flex; gap: 8px; }
`
