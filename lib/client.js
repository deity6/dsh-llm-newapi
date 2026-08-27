window.__ModuleLoader__.load({ id: "dsh-llm-newapi", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/NewApiSection.tsx
var import_react2 = require("react");

// src/client/InstanceEditor.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function sanitizeClientId(id) {
  const safe = id.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.length > 0 ? safe : "default";
}
function clientRouteOf(id) {
  return `newapi-${sanitizeClientId(id)}`;
}
function clientRefOf(id) {
  return `newapi_${sanitizeClientId(id).replace(/-/g, "_")}`;
}
var NS = "llm-newapi";
var DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
function textOf(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function numberOf(model, key) {
  const value = model[key];
  return typeof value === "number" ? value : void 0;
}
var CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i;
var CAPACITY_SCALE = { k: 1e3, m: 1e6 };
function parseCapacity(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return void 0;
  const match = CAPACITY_PATTERN.exec(trimmed);
  if (match === null) return Number.NaN;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "k" || suffix === "m" ? CAPACITY_SCALE[suffix] : 1;
  const scaled = Number(match[1]) * scale;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
}
function formatCapacity(value) {
  if (!Number.isInteger(value) || value <= 0) return String(value);
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`;
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`;
  return String(value);
}
var CAPACITY_HINT = {
  contextWindow: "128K",
  maxTokens: "8K"
};
function IconChevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      style: { transform: open ? "rotate(90deg)" : void 0, transition: "transform 120ms ease" },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3.5L10.5 8L6 12.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function IconTrash() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
var EFFORT_RUNG = {
  max: 7,
  xhigh: 6,
  high: 5,
  medium: 4,
  low: 3,
  minimal: 2,
  none: 1,
  default: 0
};
function highestOf(efforts) {
  const ids = efforts.filter((effort) => typeof effort === "string");
  return [...ids].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0] ?? "";
}
function bufferKey(index, field) {
  return `${String(index)}:${field}`;
}
function InstanceEditor(props) {
  const { index, draft, keyConfigured, keyLocked, api, t, fetchModelParams, probe, parseChannelConn, onPatch, onPendingKey, onRemove } = props;
  const [keyDraft, setKeyDraft] = (0, import_react.useState)("");
  const [expanded, setExpanded] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [editing, setEditing] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [candidates, setCandidates] = (0, import_react.useState)(void 0);
  const [picked, setPicked] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [params, setParams] = (0, import_react.useState)(void 0);
  const [paramChoices, setParamChoices] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [paramsBusy, setParamsBusy] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const [probeBusy, setProbeBusy] = (0, import_react.useState)(false);
  const [probeResult, setProbeResult] = (0, import_react.useState)(void 0);
  const [probeWithChat, setProbeWithChat] = (0, import_react.useState)(false);
  const [probeWithTool, setProbeWithTool] = (0, import_react.useState)(false);
  const [importOpen, setImportOpen] = (0, import_react.useState)(false);
  const [importText, setImportText] = (0, import_react.useState)("");
  const [importBusy, setImportBusy] = (0, import_react.useState)(false);
  const [importError, setImportError] = (0, import_react.useState)(void 0);
  const paramsRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    paramsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [params]);
  const ref = clientRefOf(draft.id);
  const patch = (next) => {
    onPatch(next);
  };
  const patchModel = (modelIndex, next) => {
    const models = draft.models.map((model, at) => at === modelIndex ? { ...model, ...next } : model);
    patch({ models });
  };
  const removeModel = (modelIndex) => {
    patch({ models: draft.models.filter((_, at) => at !== modelIndex) });
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(modelIndex);
      const shifted = /* @__PURE__ */ new Set();
      for (const key of next) shifted.add(key > modelIndex ? key - 1 : key);
      return shifted;
    });
    setEditing((current) => {
      const next = /* @__PURE__ */ new Map();
      for (const [key, value] of current) {
        const [at, field] = key.split(":");
        const atNum = Number(at);
        if (atNum === modelIndex) continue;
        next.set(`${String(atNum > modelIndex ? atNum - 1 : atNum)}:${field}`, value);
      }
      return next;
    });
  };
  const toggleExpanded = (modelIndex) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(modelIndex)) next.delete(modelIndex);
      else next.add(modelIndex);
      return next;
    });
  };
  const editCapacity = (modelIndex, field, text) => {
    setEditing((current) => new Map(current).set(bufferKey(modelIndex, field), text));
  };
  const fetchModels = async () => {
    setBusy(true);
    setError(void 0);
    setCandidates(void 0);
    try {
      const key = keyDraft.trim();
      const response = await api.llm.discoverModels({
        settingsNs: NS,
        provider: clientRouteOf(draft.id),
        ...draft.baseURL.trim().length > 0 ? { baseURL: draft.baseURL.trim() } : {},
        ...key.length > 0 ? { apiKey: key } : {}
      });
      if (!response.result.ok) {
        setError(response.result.error.message);
        return;
      }
      const found = response.result.value.models;
      found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (found.length === 0) {
        setError(t("fetchEmpty"));
        return;
      }
      const known = new Set(draft.models.map((model) => textOf(model, "id")));
      setCandidates(found);
      setPicked(new Set(found.filter((model) => !known.has(model.id)).map((model) => model.id)));
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      setBusy(false);
    }
  };
  const adopt = () => {
    if (candidates === void 0) return;
    const existing = new Map(draft.models.map((model) => [textOf(model, "id"), model]));
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue;
      if (existing.has(candidate.id)) continue;
      existing.set(candidate.id, {
        id: candidate.id,
        ...candidate.name === void 0 ? {} : { name: candidate.name },
        ...candidate.contextWindow === void 0 ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens }
      });
    }
    patch({
      models: [...existing.values()].sort((a, b) => {
        const ai = textOf(a, "id").trim();
        const bi = textOf(b, "id").trim();
        if (ai.length === 0) return bi.length === 0 ? 0 : 1;
        if (bi.length === 0) return -1;
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      })
    });
    setCandidates(void 0);
    setPicked(/* @__PURE__ */ new Set());
  };
  const toggle = (id) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const updateParams = async () => {
    const ids = draft.models.map((model) => textOf(model, "id").trim()).filter((id) => id.length > 0);
    if (ids.length === 0) {
      setError(t("paramsNoModels"));
      return;
    }
    setParamsBusy(true);
    setError(void 0);
    try {
      const response = await fetchModelParams({
        modelIds: ids,
        ...draft.proxyMode === "custom" && draft.proxyUrl.trim().length > 0 ? { proxyUrl: draft.proxyUrl.trim() } : {}
      });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setParams(response.value);
      setParamChoices(/* @__PURE__ */ new Map());
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      setParamsBusy(false);
    }
  };
  const applyParams = (overwrite) => {
    if (params === void 0) return;
    const next = draft.models.map((model) => {
      const id = textOf(model, "id").trim();
      const entry = params.models.find((candidate) => candidate.id === id);
      if (entry === void 0 || entry.matches.length === 0) return model;
      const chosen = entry.matches[paramChoices.get(id) ?? 0] ?? entry.matches[0];
      if (chosen === void 0) return model;
      const capacity = {
        contextWindow: chosen.contextWindow ?? (overwrite ? void 0 : numberOf(model, "contextWindow")),
        maxTokens: chosen.maxTokens ?? (overwrite ? void 0 : numberOf(model, "maxTokens"))
      };
      if (overwrite) {
        return {
          ...model,
          ...capacity.contextWindow === void 0 ? {} : { contextWindow: capacity.contextWindow },
          ...capacity.maxTokens === void 0 ? {} : { maxTokens: capacity.maxTokens },
          ...chosen.reasoningEfforts !== void 0 && chosen.reasoningEfforts.length > 0 ? { reasoningEfforts: chosen.reasoningEfforts } : {}
        };
      }
      return {
        ...model,
        ...capacity.contextWindow !== void 0 && numberOf(model, "contextWindow") === void 0 ? { contextWindow: capacity.contextWindow } : {},
        ...capacity.maxTokens !== void 0 && numberOf(model, "maxTokens") === void 0 ? { maxTokens: capacity.maxTokens } : {},
        ...chosen.reasoningEfforts !== void 0 && chosen.reasoningEfforts.length > 0 && !Array.isArray(model.reasoningEfforts) ? { reasoningEfforts: chosen.reasoningEfforts } : {}
      };
    });
    patch({ models: next });
    setNotice(t("paramsApplied"));
  };
  const runProbe = async (overrides) => {
    setProbeBusy(true);
    setProbeResult(void 0);
    try {
      const base = (overrides?.baseURL ?? draft.baseURL).trim();
      const key = (overrides?.apiKey ?? keyDraft).trim();
      const firstModel = draft.models[0];
      const chatModel = firstModel !== void 0 && typeof firstModel.id === "string" && firstModel.id.length > 0 ? firstModel.id : void 0;
      const response = await probe({
        ...base.length > 0 ? { baseURL: base } : {},
        ...key.length > 0 ? { apiKey: key } : {},
        // The explicit URL only applies to the custom mode; `system`/`direct`
        // resolve host-side from the instance snapshot.
        ...draft.proxyMode === "custom" && draft.proxyUrl.trim().length > 0 ? { proxyUrl: draft.proxyUrl.trim() } : {},
        ...probeWithChat && chatModel !== void 0 ? { chatModel, chatTimeoutMs: 25e3 } : {},
        ...probeWithTool && chatModel !== void 0 ? { toolCallModel: chatModel, toolCallTimeoutMs: 3e4 } : {}
      });
      if (!response.ok) {
        setNotice(`${t("probeFailed")}: ${response.error.message}`);
        return;
      }
      setProbeResult(response.value);
    } finally {
      setProbeBusy(false);
    }
  };
  const runImport = async () => {
    setImportBusy(true);
    setImportError(void 0);
    try {
      let blob;
      try {
        blob = JSON.parse(importText);
      } catch {
        setImportError(t("importInvalidJson"));
        return;
      }
      const response = await parseChannelConn(blob);
      if (!response.ok) {
        setImportError(response.error.message);
        return;
      }
      const value = response.value;
      patch({ baseURL: value.baseURL });
      setKeyDraft(value.apiKey);
      onPendingKey(value.apiKey);
      setImportOpen(false);
      setImportText("");
      setNotice(t("importApplied"));
      void runProbe({ baseURL: value.baseURL, apiKey: value.apiKey });
    } finally {
      setImportBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "newapi-instance", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("legend", { className: "newapi-instance-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-instance-title", children: `${t("instanceTitle")} ${String(index + 1)}` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-instance-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-linkbutton newapi-iconbutton--danger", onClick: onRemove, children: t("removeInstance") }) })
    ] }),
    notice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: notice }),
    error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-error", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `newapi-instance-id-${index}`, children: t("instanceId") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: `newapi-instance-id-${index}`,
          type: "text",
          className: "newapi-input",
          value: draft.id,
          onChange: (event) => {
            patch({ id: event.target.value });
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-hint", children: t("instanceIdHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `newapi-instance-name-${index}`, children: t("instanceName") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: `newapi-instance-name-${index}`,
          type: "text",
          className: "newapi-input",
          placeholder: t("instanceNamePlaceholder"),
          value: draft.displayName,
          onChange: (event) => {
            patch({ displayName: event.target.value });
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-hint", children: t("instanceNameHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `newapi-instance-key-${index}`, children: t("keyInput") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: `newapi-instance-key-${index}`,
          type: "password",
          autoComplete: "off",
          className: "newapi-input",
          disabled: keyLocked,
          placeholder: keyLocked ? t("keyEnvLocked") : keyConfigured === true ? t("keyStored") : keyConfigured === false ? t("keyMissing") : t("keyPlaceholder"),
          value: keyDraft,
          onChange: (event) => {
            setKeyDraft(event.target.value);
            onPendingKey(event.target.value);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `newapi-instance-base-${index}`, children: t("baseUrl") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: `newapi-instance-base-${index}`,
          type: "text",
          className: "newapi-input",
          placeholder: t("baseUrlPlaceholder"),
          value: draft.baseURL,
          onChange: (event) => {
            patch({ baseURL: event.target.value });
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-hint", children: t("baseUrlHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-proberow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "newapi-button newapi-button--primary",
            disabled: probeBusy,
            onClick: () => {
              void runProbe();
            },
            children: probeBusy ? t("probing") : t("probe")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-probecheck", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: probeWithChat,
              "aria-label": t("probeWithChat"),
              onChange: (event) => {
                setProbeWithChat(event.target.checked);
              }
            }
          ),
          t("probeWithChat")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-probecheck", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: probeWithTool,
              "aria-label": t("probeWithTool"),
              onChange: (event) => {
                setProbeWithTool(event.target.checked);
              }
            }
          ),
          t("probeWithTool")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "newapi-linkbutton",
            onClick: () => {
              setImportOpen((current) => !current);
              setImportError(void 0);
            },
            children: t("importChannelConn")
          }
        )
      ] }),
      importOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-params", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-modelfield", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-modelfield-label", children: t("importHint") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              className: "newapi-input",
              rows: 3,
              spellCheck: false,
              style: { width: "100%", resize: "vertical", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 },
              value: importText,
              onChange: (event) => {
                setImportText(event.target.value);
                setImportError(void 0);
              }
            }
          )
        ] }),
        importError === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-error", children: importError }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "newapi-button newapi-button--primary",
              disabled: importBusy || importText.trim().length === 0,
              onClick: () => {
                void runImport();
              },
              children: importBusy ? t("importBusy") : t("importApply")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "newapi-button",
              onClick: () => {
                setImportOpen(false);
                setImportText("");
                setImportError(void 0);
              },
              children: t("fetchCancel")
            }
          )
        ] })
      ] }) : null,
      probeResult === void 0 && !probeBusy ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "newapi-probe", "aria-live": "polite", children: probeBusy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-hint", children: t("probing") }) : probeResult === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: probeResult.reachable === true && probeResult.authValid === true ? "newapi-probe-ok" : "newapi-probe-bad", children: probeResult.reachable === true ? probeResult.authValid === true ? t("probeReachableAuthed") : t("probeReachableUnauthed") : t("probeUnreachable") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-hint", children: ` \xB7 ${String(probeResult.latencyMs)}ms${probeResult.modelCount !== void 0 ? ` \xB7 ${String(probeResult.modelCount)} ${t("models")}` : ""}${probeResult.status !== void 0 ? ` \xB7 HTTP ${String(probeResult.status)}` : ""}` })
        ] }),
        probeResult.chat === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: probeResult.chat.ok ? "newapi-probe-ok" : "newapi-error", children: probeResult.chat.ok ? `${t("chatProbeOk")}: ${probeResult.chat.text ?? ""} \xB7 ${String(probeResult.chat.latencyMs)}ms` : `${t("chatProbeFail")}: ${probeResult.chat.error ?? ""} \xB7 ${String(probeResult.chat.latencyMs)}ms` }),
        probeResult.toolCall === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: probeResult.toolCall.ok ? "newapi-probe-ok" : "newapi-error", children: probeResult.toolCall.ok ? `${t("toolProbeOk")}: ${probeResult.toolCall.toolName ?? ""} \xB7 ${String(probeResult.toolCall.latencyMs)}ms` : `${t("toolProbeFail")}: ${probeResult.toolCall.error ?? ""} \xB7 ${String(probeResult.toolCall.latencyMs)}ms` }),
        probeResult.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-error", children: probeResult.error }),
        probeResult.sampleModels !== void 0 && probeResult.sampleModels.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-hint", style: { marginTop: 4 }, children: probeResult.sampleModels.slice(0, 5).join(", ") }) : null
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "newapi-catalog", "aria-label": `${t("models")} ${String(index + 1)}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-catalog-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-catalog-title", children: t("models") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-catalog-actions", style: { display: "flex", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-linkbutton", disabled: busy, onClick: () => {
            void fetchModels();
          }, children: busy ? t("fetching") : t("fetchModels") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-linkbutton", disabled: paramsBusy, onClick: () => {
            void updateParams();
          }, children: paramsBusy ? t("paramsFetching") : t("updateParams") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-linkbutton", disabled: draft.models.length === 0, onClick: () => {
            patch({ models: [] });
            setExpanded(/* @__PURE__ */ new Set());
            setEditing(/* @__PURE__ */ new Map());
            setParams(void 0);
            setParamChoices(/* @__PURE__ */ new Map());
          }, children: t("clearModels") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-proxyrow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-proxylabel", children: [
          t("proxyMode"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              className: "newapi-input newapi-select",
              "aria-label": t("proxyMode"),
              value: draft.proxyMode,
              onChange: (event) => {
                const mode = event.target.value;
                patch({ proxyMode: mode });
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "system", children: t("proxyModeSystem") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "direct", children: t("proxyModeDirect") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "custom", children: t("proxyModeCustom") })
              ]
            }
          )
        ] }),
        draft.proxyMode === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "newapi-input",
            type: "text",
            style: { maxWidth: 220 },
            "aria-label": t("proxyUrl"),
            placeholder: DEFAULT_PROXY_URL,
            value: draft.proxyUrl,
            onChange: (event) => {
              patch({ proxyUrl: event.target.value });
            }
          }
        ) : null
      ] }),
      draft.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-empty", children: t("modelsEmpty") }) : null,
      draft.models.map((model, modelIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-entry", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-modelrow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "newapi-input",
              type: "text",
              value: textOf(model, "id"),
              placeholder: t("modelId"),
              "aria-label": `${t("modelId")} ${String(modelIndex + 1)}`,
              onChange: (event) => {
                patchModel(modelIndex, { id: event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "newapi-input",
              type: "text",
              value: textOf(model, "name"),
              placeholder: t("modelName"),
              "aria-label": `${t("modelName")} ${String(modelIndex + 1)}`,
              onChange: (event) => {
                patchModel(modelIndex, { name: event.target.value === "" ? void 0 : event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "newapi-iconbutton",
              "aria-label": `${t("modelAdvanced")} ${String(modelIndex + 1)}`,
              "aria-expanded": expanded.has(modelIndex),
              title: t("modelAdvanced"),
              onClick: () => {
                toggleExpanded(modelIndex);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevron, { open: expanded.has(modelIndex) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "newapi-iconbutton newapi-iconbutton--danger",
              "aria-label": `${t("removeModel")} ${String(modelIndex + 1)}`,
              title: t("removeModel"),
              onClick: () => {
                removeModel(modelIndex);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconTrash, {})
            }
          )
        ] }),
        expanded.has(modelIndex) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-modeladvanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-modelfield-label", children: t("contextWindow") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "newapi-input",
                type: "text",
                placeholder: CAPACITY_HINT.contextWindow,
                value: editing.get(bufferKey(modelIndex, "contextWindow")) ?? (numberOf(model, "contextWindow") === void 0 ? "" : formatCapacity(numberOf(model, "contextWindow"))),
                onChange: (event) => {
                  editCapacity(modelIndex, "contextWindow", event.target.value);
                  const parsed = parseCapacity(event.target.value);
                  patchModel(modelIndex, parsed === void 0 ? { contextWindow: void 0 } : { contextWindow: parsed });
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-modelfield-label", children: t("maxTokens") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "newapi-input",
                type: "text",
                placeholder: CAPACITY_HINT.maxTokens,
                value: editing.get(bufferKey(modelIndex, "maxTokens")) ?? (numberOf(model, "maxTokens") === void 0 ? "" : formatCapacity(numberOf(model, "maxTokens"))),
                onChange: (event) => {
                  editCapacity(modelIndex, "maxTokens", event.target.value);
                  const parsed = parseCapacity(event.target.value);
                  patchModel(modelIndex, parsed === void 0 ? { maxTokens: void 0 } : { maxTokens: parsed });
                }
              }
            )
          ] }),
          Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "newapi-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-modelfield-label", children: t("defaultEffort") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                className: "newapi-select",
                "aria-label": `${t("defaultEffort")} ${String(modelIndex + 1)}`,
                value: typeof model.defaultReasoningEffort === "string" && model.reasoningEfforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : highestOf(model.reasoningEfforts),
                onChange: (event) => {
                  patchModel(modelIndex, { defaultReasoningEffort: event.target.value });
                },
                children: model.reasoningEfforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: effort, children: effort }, effort))
              }
            )
          ] }) : null
        ] }) : null
      ] }, modelIndex)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "newapi-addmodel",
          onClick: () => {
            patch({ models: [...draft.models, { id: "" }] });
          },
          children: t("addModel")
        }
      )
    ] }),
    candidates === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-candidates", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("fetchTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: candidates.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: picked.has(model.id),
            onChange: () => {
              toggle(model.id);
            }
          }
        ),
        " ",
        model.id,
        model.name === void 0 || model.name === model.id ? "" : ` (${model.name})`
      ] }) }, model.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-button newapi-button--primary", disabled: picked.size === 0, onClick: adopt, children: t("fetchAdopt") }),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-button", onClick: () => {
        setCandidates(void 0);
        setPicked(/* @__PURE__ */ new Set());
      }, children: t("fetchCancel") })
    ] }),
    params === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-params", ref: paramsRef, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("paramsTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "newapi-params-summary", children: t("paramsSummary").replace("{matched}", String(params.models.filter((entry) => entry.matches.length > 0).length)).replace("{unmatched}", String(params.models.filter((entry) => entry.matches.length === 0).length)) }),
      params.models.map((entry) => {
        if (entry.matches.length === 0) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-unmatched", children: t("paramsUnmatched") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
          ] }, entry.id);
        }
        if (entry.matches.length === 1) {
          const match2 = entry.matches[0];
          if (match2 === void 0) return null;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-values", children: `${match2.official === true ? `${t("officialMark")} \xB7 ` : ""}${match2.provider} \xB7 ${t("contextWindow")} ${match2.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${match2.maxTokens ?? "\u2014"}${match2.reasoningEfforts !== void 0 && match2.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${match2.reasoningEfforts.join("/")}` : ""}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
          ] }, entry.id);
        }
        const chosen = paramChoices.get(entry.id) ?? 0;
        const match = entry.matches[chosen] ?? entry.matches[0];
        if (match === void 0) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "newapi-params-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-id", children: entry.id }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "newapi-select",
              "aria-label": `${t("paramsProvider")} ${entry.id}`,
              value: String(chosen),
              onChange: (event) => {
                setParamChoices((current) => new Map(current).set(entry.id, Number(event.target.value)));
              },
              children: entry.matches.map((candidate, at) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: String(at), children: `${candidate.official === true ? `${t("officialMark")} \xB7 ` : ""}${candidate.provider}: ${t("contextWindow")} ${candidate.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${candidate.maxTokens ?? "\u2014"}${candidate.reasoningEfforts !== void 0 && candidate.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${candidate.reasoningEfforts.join("/")}` : ""}` }, candidate.provider))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "newapi-params-values", children: match.provider })
        ] }, entry.id);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-button newapi-button--primary", onClick: () => {
          applyParams(true);
        }, children: t("paramsOverwrite") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-button", onClick: () => {
          applyParams(false);
        }, children: t("paramsFillBlank") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "newapi-button", onClick: () => {
          setParams(void 0);
          setParamChoices(/* @__PURE__ */ new Map());
        }, children: t("fetchCancel") })
      ] })
    ] })
  ] });
}

// src/client/NewApiSection.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var NS2 = "llm-newapi";
function textOf2(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function numberOf2(model, key) {
  const value = model[key];
  return typeof value === "number" ? value : void 0;
}
function proxyOf(value) {
  const proxy = value ?? {};
  const mode = proxy.mode === "custom" || proxy.mode === "direct" || proxy.mode === "system" ? proxy.mode : proxy.enabled === true ? "custom" : "direct";
  return {
    mode,
    url: typeof proxy.url === "string" && proxy.url.length > 0 ? proxy.url : DEFAULT_PROXY_URL
  };
}
function toDrafts(source) {
  if (typeof source !== "object" || source === null) return [];
  const value = source;
  if (Array.isArray(value.instances)) {
    return value.instances.map((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) ? draftOf(entry) : blankDraft());
  }
  const hasLegacy = typeof value.baseURL === "string" || Array.isArray(value.models);
  if (!hasLegacy) return [];
  const proxy = proxyOf(value.proxy);
  return [{
    id: "default",
    displayName: "NewAPI",
    baseURL: typeof value.baseURL === "string" ? value.baseURL : "",
    models: Array.isArray(value.models) ? value.models.filter((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry)) : [],
    proxyMode: proxy.mode,
    proxyUrl: proxy.url
  }];
}
function draftOf(entry) {
  const proxy = proxyOf(entry.proxy);
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    displayName: typeof entry.displayName === "string" ? entry.displayName : "",
    baseURL: typeof entry.baseURL === "string" ? entry.baseURL : "",
    models: Array.isArray(entry.models) ? entry.models.filter((model) => typeof model === "object" && model !== null && !Array.isArray(model)) : [],
    proxyMode: proxy.mode,
    proxyUrl: proxy.url
  };
}
function blankDraft() {
  return {
    id: `gw-${Date.now().toString(36)}`,
    displayName: "",
    baseURL: "",
    models: [],
    proxyMode: "system",
    proxyUrl: DEFAULT_PROXY_URL
  };
}
function serializeInstance(draft) {
  const models = draft.models.map((model) => {
    const id2 = textOf2(model, "id").trim();
    const name = textOf2(model, "name").trim();
    const contextWindow = numberOf2(model, "contextWindow");
    const maxTokens = numberOf2(model, "maxTokens");
    const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts.filter((effort) => typeof effort === "string" && effort.length > 0) : [];
    const preset = typeof model.defaultReasoningEffort === "string" && efforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : void 0;
    return {
      id: id2,
      ...name.length > 0 ? { name } : {},
      ...contextWindow !== void 0 ? { contextWindow } : {},
      ...maxTokens !== void 0 ? { maxTokens } : {},
      ...efforts.length > 0 ? { reasoningEfforts: efforts } : {},
      ...preset !== void 0 ? { defaultReasoningEffort: preset } : {}
    };
  });
  const id = sanitizeClientId(draft.id);
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
      ...draft.proxyMode === "custom" && draft.proxyUrl.trim().length > 0 ? { url: draft.proxyUrl.trim() } : {}
    }
  };
}
function NewApiSection(props) {
  const { api, t, fetchModelParams, probe, parseChannelConn } = props;
  const [status, setStatus] = (0, import_react2.useState)("loading");
  const [errorText, setErrorText] = (0, import_react2.useState)(void 0);
  const [revision, setRevision] = (0, import_react2.useState)(0);
  const [writable, setWritable] = (0, import_react2.useState)(true);
  const [instances, setInstances] = (0, import_react2.useState)([]);
  const [activeIndex, setActiveIndex] = (0, import_react2.useState)(-1);
  const [credentials, setCredentials] = (0, import_react2.useState)(/* @__PURE__ */ new Map());
  const [pendingKeys, setPendingKeys] = (0, import_react2.useState)(/* @__PURE__ */ new Map());
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [notice, setNotice] = (0, import_react2.useState)(void 0);
  const load = async () => {
    setStatus("loading");
    setErrorText(void 0);
    try {
      const described = await api.settings.describe({});
      if (!described.result.ok) {
        setErrorText(described.result.error.message);
        setStatus("error");
        return;
      }
      setWritable(described.result.value.writable);
      const section = described.result.value.namespaces.find((entry) => entry.ns === NS2);
      if (section === void 0) {
        setErrorText(t("nsNotRegistered"));
        setStatus("error");
        return;
      }
      setRevision(section.revision);
      const drafts = toDrafts(section.value);
      setInstances(drafts);
      setPendingKeys(/* @__PURE__ */ new Map());
      const refs = drafts.map((draft) => clientRefOf(draft.id));
      if (refs.length > 0) {
        const credential = await api.credentials.describe({ refs });
        if (credential.result.ok) {
          const view = /* @__PURE__ */ new Map();
          for (const ref of refs) {
            const entry = credential.result.value.credentials[ref];
            view.set(ref, {
              configured: entry?.configured,
              locked: entry?.writable === false
            });
          }
          setCredentials(view);
        }
      } else {
        setCredentials(/* @__PURE__ */ new Map());
      }
      setStatus("ready");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };
  (0, import_react2.useEffect)(() => {
    void load();
  }, []);
  if (status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("section", { "aria-label": t("nav"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u2026" }) });
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { "aria-label": t("nav"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "newapi-error", children: `${t("loadFailed")}: ${errorText ?? ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "newapi-button", onClick: () => {
        void load();
      }, children: t("retry") })
    ] });
  }
  const patchInstance = (index, patch) => {
    setInstances((current) => current.map((draft, at) => at === index ? { ...draft, ...patch } : draft));
  };
  const removeInstance = (index) => {
    setInstances((current) => current.filter((_, at) => at !== index));
    setActiveIndex((current) => {
      if (index < current) return current - 1;
      if (index === current) return current;
      return current;
    });
  };
  const addInstance = () => {
    const used = new Set(instances.map((d) => d.id));
    let n = instances.length + 1;
    while (used.has(`newapi-${String(n)}`)) n++;
    const newId = `newapi-${String(n)}`;
    setInstances((current) => [...current, { ...blankDraft(), id: newId, displayName: "" }]);
    setActiveIndex(instances.length);
  };
  const handlePendingKey = (index, value) => {
    const ref = clientRefOf(instances[index]?.id ?? "");
    setPendingKeys((current) => {
      const next = new Map(current);
      if (value.trim().length === 0) next.delete(ref);
      else next.set(ref, value);
      return next;
    });
  };
  const instanceProblem = () => {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, draft] of instances.entries()) {
      const id = sanitizeClientId(draft.id);
      if (draft.id.trim().length === 0) return `${t("instanceIdRequired")} (${t("instanceTitle")} ${String(index + 1)})`;
      if (seen.has(id)) return `${t("instanceIdDuplicate")} (${id})`;
      seen.add(id);
    }
    return void 0;
  };
  const save = async () => {
    const problem = instanceProblem();
    if (problem !== void 0) {
      setErrorText(problem);
      return;
    }
    setBusy(true);
    setNotice(void 0);
    setErrorText(void 0);
    try {
      const ops = [{
        op: "set",
        path: ["instances"],
        value: instances.map(serializeInstance)
      }];
      const mutated = await api.settings.mutate({ ns: NS2, ops, expectedRevision: revision });
      if (!mutated.result.ok) {
        setErrorText(mutated.result.error.message);
        return;
      }
      setRevision(mutated.result.value.revision);
      for (const [ref, value] of pendingKeys) {
        const stored = await api.credentials.set({ ref, value: value.trim() });
        if (!stored.result.ok) {
          setErrorText(stored.result.error.message);
          return;
        }
      }
      setPendingKeys(/* @__PURE__ */ new Map());
      setNotice(t("saved"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const safeActiveIndex = instances.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), instances.length - 1);
  const activeDraft = safeActiveIndex >= 0 ? instances[safeActiveIndex] : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { "aria-label": t("nav"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("intro") }),
    notice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", children: notice }),
    !writable ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("readOnly") }) : null,
    errorText === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "newapi-error", children: errorText }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "newapi-tabs", role: "tablist", "aria-label": t("instanceTabs"), children: [
      instances.map((draft, index) => {
        const isActive = index === safeActiveIndex;
        const label = draft.displayName.trim().length > 0 ? draft.displayName : draft.id.trim().length > 0 ? draft.id : `${t("instanceTitle")} ${String(index + 1)}`;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": isActive,
            className: `newapi-tab ${isActive ? "newapi-tabActive" : ""}`,
            onClick: () => {
              setActiveIndex(index);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "newapi-tabLabel", children: label })
          },
          `tab-${String(index)}`
        );
      }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "newapi-tab newapi-tabAdd",
          title: t("addInstance"),
          onClick: addInstance,
          children: "+"
        }
      )
    ] }),
    instances.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "newapi-empty", children: t("noInstances") }) : activeDraft === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      InstanceEditor,
      {
        index: safeActiveIndex,
        draft: activeDraft,
        keyConfigured: credentials.get(clientRefOf(activeDraft.id))?.configured,
        keyLocked: credentials.get(clientRefOf(activeDraft.id))?.locked ?? false,
        api,
        t,
        fetchModelParams,
        probe,
        parseChannelConn,
        onPatch: (patch) => {
          patchInstance(safeActiveIndex, patch);
        },
        onPendingKey: (value) => {
          handlePendingKey(safeActiveIndex, value);
        },
        onRemove: () => {
          removeInstance(safeActiveIndex);
        }
      },
      `instance-${String(safeActiveIndex)}`
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "newapi-hint", children: t("modelHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "newapi-button newapi-button--primary", disabled: busy || !writable, onClick: () => {
      void save();
    }, children: busy ? t("applying") : t("apply") })
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "NewAPI",
  intro: "\u914D\u7F6E NewAPI \u7F51\u5173\u5B9E\u4F8B\uFF1A\u6BCF\u4E2A\u5B9E\u4F8B\u6709\u72EC\u7ACB\u7684\u540D\u79F0\u3001\u5730\u5740\u3001\u5BC6\u94A5\u4E0E\u6A21\u578B\u5217\u8868\u3002\u6A21\u578B\u53D1\u73B0\u53EA\u5217\u51FA\u652F\u6301 chat \u63A5\u53E3\u7684\u6A21\u578B\u3002",
  instanceTitle: "\u5B9E\u4F8B",
  instanceId: "ID\uFF08\u8DEF\u7531\u540E\u7F00\uFF09",
  instanceIdHint: "\u5C06\u6210\u4E3A\u8DEF\u7531 newapi-<id> \u4E0E\u5BC6\u94A5\u5F15\u7528 newapi_<id>\uFF1B\u4FDD\u5B58\u540E\u8BF7\u52FF\u968F\u610F\u6539\u52A8",
  instanceName: "\u540D\u79F0",
  instanceNamePlaceholder: "\u663E\u793A\u5728\u6A21\u578B\u9009\u62E9\u5668\u91CC\u7684\u540D\u5B57",
  instanceNameHint: '\u4F8B\u5982 "seekai"\u3001"\u6211\u7684\u5907\u7528\u7F51\u5173"\uFF1B\u7559\u7A7A\u5219\u663E\u793A ID',
  addInstance: "\u6DFB\u52A0\u5B9E\u4F8B",
  removeInstance: "\u5220\u9664\u8BE5\u5B9E\u4F8B",
  instanceTabs: "\u5B9E\u4F8B\u5207\u6362",
  tabReorderHint: "\u6392\u5E8F\u6309\u5F53\u524D\u5217\u8868\u987A\u5E8F\uFF1A\u8C03\u6574\u987A\u5E8F\u8BF7\u5220\u9664\u540E\u91CD\u65B0\u6DFB\u52A0\u3002",
  noInstances: "\u8FD8\u6CA1\u6709\u914D\u7F6E\u4EFB\u4F55\u5B9E\u4F8B\uFF1A\u70B9\u300C\u6DFB\u52A0\u5B9E\u4F8B\u300D\u5F00\u59CB\u3002",
  instanceIdRequired: "\u5B9E\u4F8B ID \u4E0D\u80FD\u4E3A\u7A7A",
  instanceIdDuplicate: "\u5B9E\u4F8B ID \u91CD\u590D",
  keyInput: "API \u5BC6\u94A5",
  keyPlaceholder: "\u7C98\u8D34\u4EE4\u724C\uFF1B\u7559\u7A7A\u4FDD\u6301\u5DF2\u5B58\u5BC6\u94A5\u4E0D\u53D8",
  keyStored: "\u5DF2\u914D\u7F6E\uFF08\u4E0D\u56DE\u663E\uFF09",
  keyMissing: "\u672A\u914D\u7F6E",
  keyEnvLocked: "\u7531\u542F\u52A8\u73AF\u5883\u63D0\u4F9B\uFF08\u53EA\u8BFB\uFF09",
  baseUrl: "\u7F51\u5173\u5730\u5740\uFF08\u542B /v1 \u524D\u7F00\uFF09",
  baseUrlPlaceholder: "http://gw.local:3000/v1",
  baseUrlHint: "\u53EA\u9700\u586B\u5230 /v1\uFF1Badapter \u4F1A\u81EA\u52A8\u62FC\u63A5 /chat/completions \u4E0E /models\u3002",
  probe: "\u6D4B\u8BD5\u8FDE\u63A5",
  probing: "\u6B63\u5728\u6D4B\u8BD5\u2026",
  probeWithChat: "\u542B chat \u5B9E\u6D4B\uFF08\u6781\u7701 token\uFF09",
  probeWithTool: "\u542B\u5DE5\u5177\u8C03\u7528\u6D4B\u8BD5",
  probeFailed: "\u8FDE\u63A5\u6D4B\u8BD5\u5931\u8D25",
  probeUnreachable: "\u4E0D\u53EF\u8FBE",
  probeReachableUnauthed: "\u53EF\u8FBE \xB7 \u9274\u6743\u5931\u8D25",
  probeReachableAuthed: "\u53EF\u8FBE \xB7 \u9274\u6743\u901A\u8FC7",
  chatProbeOk: "chat \u5B9E\u6D4B\u901A\u8FC7",
  chatProbeFail: "chat \u5B9E\u6D4B\u672A\u901A\u8FC7",
  toolProbeOk: "\u5DE5\u5177\u8C03\u7528\u6D4B\u8BD5\u901A\u8FC7",
  toolProbeFail: "\u5DE5\u5177\u8C03\u7528\u6D4B\u8BD5\u672A\u901A\u8FC7",
  importChannelConn: "\u4ECE\u63CF\u8FF0\u7B26\u5BFC\u5165",
  importHint: '\u7C98\u8D34\u6E20\u9053\u8FDE\u63A5\u63CF\u8FF0\u7B26 JSON\uFF08\u5982 {"_type":"newapi_channel_conn","key":"\u2026","url":"\u2026"}\uFF09\uFF0C\u81EA\u52A8\u586B\u5165\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5',
  importApply: "\u89E3\u6790\u5E76\u586B\u5165",
  importBusy: "\u6B63\u5728\u89E3\u6790\u2026",
  importInvalidJson: "\u4E0D\u662F\u5408\u6CD5\u7684 JSON",
  importApplied: "\u5DF2\u586B\u5165\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5",
  models: "\u6A21\u578B",
  modelsEmpty: "\u6682\u65E0\u6A21\u578B\uFF1A\u70B9\u300C\u6DFB\u52A0\u6A21\u578B\u300D\u624B\u52A8\u65B0\u589E\uFF0C\u6216\u300C\u83B7\u53D6\u6A21\u578B\u300D\u4ECE\u7F51\u5173\u62C9\u53D6\u3002",
  clearModels: "\u6E05\u7A7A",
  addModel: "\u6DFB\u52A0\u6A21\u578B",
  removeModel: "\u5220\u9664\u8BE5\u6A21\u578B",
  modelAdvanced: "\u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u4E0A\u4E0B\u6587 / \u8F93\u51FA\u4E0A\u9650\uFF09",
  modelId: "\u6A21\u578B ID",
  modelName: "\u663E\u793A\u540D\u79F0",
  contextWindow: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  maxTokens: "\u8F93\u51FA\u4E0A\u9650",
  modelReasoning: "\u601D\u8003\u7B49\u7EA7",
  defaultEffort: "\u9884\u8BBE\u601D\u8003\u7B49\u7EA7\uFF08\u5207\u6362\u6A21\u5F0F\u65F6\u81EA\u52A8\u9009\u62E9\uFF09",
  modelIdRequired: "\u6A21\u578B ID \u4E0D\u80FD\u4E3A\u7A7A",
  modelIdDuplicate: "\u6A21\u578B ID \u91CD\u590D",
  capacityInvalid: "\u5BB9\u91CF\u9700\u4E3A\u6B63\u6570\uFF0C\u53EF\u7528 K/M \u7F29\u5199\uFF08\u5982 128K\u30011M\uFF09",
  fetchModels: "\u83B7\u53D6\u6A21\u578B",
  fetching: "\u6B63\u5728\u8BE2\u95EE\u7F51\u5173\u2026",
  fetchEmpty: "\u7F51\u5173\u6CA1\u6709\u5217\u51FA\u53EF\u7528\u7684 chat \u6A21\u578B\uFF08embedding / rerank / ranker \u5DF2\u8FC7\u6EE4\uFF09\u3002",
  fetchTitle: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B",
  fetchAdopt: "\u6DFB\u52A0\u6240\u9009",
  fetchCancel: "\u53D6\u6D88",
  updateParams: "\u4ECEmodels.dev\u83B7\u53D6\u6A21\u578B\u4FE1\u606F",
  paramsFetching: "\u6B63\u5728\u67E5\u8BE2 models.dev\u2026",
  paramsTitle: "\u6A21\u578B\u53C2\u6570\uFF08\u6765\u81EA models.dev\uFF09",
  paramsSummary: "\u5339\u914D {matched} \u4E2A \xB7 \u672A\u5339\u914D {unmatched} \u4E2A",
  paramsUnmatched: "\u672A\u5339\u914D\uFF08\u4FDD\u6301\u539F\u503C\uFF09",
  paramsProvider: "\u9009\u62E9\u6570\u636E\u6765\u6E90\u4F9B\u5E94\u5546",
  officialMark: "\u5B98\u65B9",
  paramsOverwrite: "\u5E94\u7528\uFF08\u8986\u76D6\u73B0\u6709\u503C\uFF09",
  paramsFillBlank: "\u4EC5\u586B\u7A7A\u767D\u5B57\u6BB5",
  paramsApplied: "\u5DF2\u66F4\u65B0\u6A21\u578B\u4FE1\u606F",
  paramsNoModels: "\u6CA1\u6709\u53EF\u67E5\u8BE2\u7684\u6A21\u578B\uFF1A\u5148\u6DFB\u52A0\u6A21\u578B\u6216\u4ECE\u7F51\u5173\u83B7\u53D6\u3002",
  proxyMode: "\u4EE3\u7406\u6A21\u5F0F",
  proxyModeSystem: "\u8DDF\u968F\u7CFB\u7EDF",
  proxyModeDirect: "\u76F4\u8FDE",
  proxyModeCustom: "\u81EA\u5B9A\u4E49",
  proxyUrl: "\u4EE3\u7406\u5730\u5740",
  apply: "\u4FDD\u5B58",
  applying: "\u6B63\u5728\u4FDD\u5B58\u2026",
  saved: "\u5DF2\u4FDD\u5B58\u3002",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  nsNotRegistered: "llm-newapi: \u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u884C\u662F\u5426\u5DF2\u52A0\u8F7D\uFF1F\uFF09",
  retry: "\u91CD\u8BD5",
  readOnly: "\u5F53\u524D\u8BBE\u7F6E\u6E90\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u3002",
  modelHint: "\u9ED8\u8BA4\u53EA\u5217\u51FA /chat/completions \u63A5\u53E3\u652F\u6301\u7684\u6A21\u578B\uFF1B\u4E0D\u652F\u6301\u8BE5\u63A5\u53E3\u7684\u6A21\u578B\u8BF7\u624B\u52A8\u6DFB\u52A0\u3002\u8BE5\u914D\u7F6E\u53EF\u5728 settings.yaml \u7684 llm-newapi: \u6BB5\u7528 modelExcludePatterns \u8C03\u6574\u3002"
};
var en = {
  nav: "NewAPI",
  intro: "Configure NewAPI gateway instances: each has its own name, base URL, key, and model list. Discovery lists chat-capable models only.",
  instanceTitle: "Instance",
  instanceId: "ID (route suffix)",
  instanceIdHint: "Becomes route newapi-<id> and credential ref newapi_<id>; avoid changing it after saving",
  instanceName: "Name",
  instanceNamePlaceholder: "Name shown in the model picker",
  instanceNameHint: 'e.g. "seekai", "backup gateway"; blank falls back to the ID',
  addInstance: "Add instance",
  removeInstance: "Remove this instance",
  instanceTabs: "Instance switcher",
  tabReorderHint: "Order follows the current list order: to reorder, remove and re-add.",
  noInstances: 'No instances configured yet: click "Add instance" to start.',
  instanceIdRequired: "Instance ID is required",
  instanceIdDuplicate: "Duplicate instance ID",
  keyInput: "API key",
  keyPlaceholder: "Paste the token; leave blank to keep the stored key",
  keyStored: "Configured (never echoed)",
  keyMissing: "Not configured",
  keyEnvLocked: "Provided by the launch environment (read-only)",
  baseUrl: "Gateway base URL (including /v1)",
  baseUrlPlaceholder: "http://gw.local:3000/v1",
  baseUrlHint: "Fill up to /v1 only; the adapter appends /chat/completions and /models itself.",
  probe: "Test connection",
  probing: "Testing\u2026",
  probeWithChat: "Include chat probe (near-zero tokens)",
  probeWithTool: "Include tool-call test",
  probeFailed: "Connection test failed",
  probeUnreachable: "Unreachable",
  probeReachableUnauthed: "Reachable \xB7 auth failed",
  probeReachableAuthed: "Reachable \xB7 auth OK",
  chatProbeOk: "Chat probe OK",
  chatProbeFail: "Chat probe failed",
  toolProbeOk: "Tool-call test OK",
  toolProbeFail: "Tool-call test failed",
  importChannelConn: "Import from descriptor",
  importHint: 'Paste a channel-connection descriptor JSON (e.g. {"_type":"newapi_channel_conn","key":"\u2026","url":"\u2026"}) to auto-fill the gateway URL and key',
  importApply: "Parse & fill",
  importBusy: "Parsing\u2026",
  importInvalidJson: "Not valid JSON",
  importApplied: "Filled gateway URL and key",
  models: "Models",
  modelsEmpty: "No models yet: add one by hand, or fetch the list from the gateway.",
  clearModels: "Clear",
  addModel: "Add model",
  removeModel: "Remove this model",
  modelAdvanced: "Advanced (context window / max output)",
  modelId: "Model ID",
  modelName: "Display name",
  contextWindow: "Context window",
  maxTokens: "Max output tokens",
  modelReasoning: "Reasoning efforts",
  defaultEffort: "Default reasoning effort (auto-selected on mode switch)",
  modelIdRequired: "Model id is required",
  modelIdDuplicate: "Duplicate model id",
  capacityInvalid: "Capacity must be a positive number; K/M suffix allowed (e.g. 128K, 1M)",
  fetchModels: "Fetch models",
  fetching: "Asking the gateway\u2026",
  fetchEmpty: "The gateway listed no chat-capable models (embedding / rerank / ranker filtered out).",
  fetchTitle: "Choose models to add",
  fetchAdopt: "Add selected",
  fetchCancel: "Cancel",
  updateParams: "Fetch model info from models.dev",
  paramsFetching: "Querying models.dev\u2026",
  paramsTitle: "Model parameters (from models.dev)",
  paramsSummary: "{matched} matched \xB7 {unmatched} unmatched",
  paramsUnmatched: "No match (values kept)",
  paramsProvider: "Choose the data provider",
  officialMark: "Official",
  paramsOverwrite: "Apply (overwrite existing)",
  paramsFillBlank: "Fill blank fields only",
  paramsApplied: "Model info updated",
  paramsNoModels: "No models to look up: add one or fetch from the gateway first.",
  proxyMode: "Proxy mode",
  proxyModeSystem: "Follow system",
  proxyModeDirect: "Direct",
  proxyModeCustom: "Custom",
  proxyUrl: "Proxy URL",
  apply: "Save",
  applying: "Saving\u2026",
  saved: "Saved.",
  loadFailed: "Load failed",
  nsNotRegistered: "llm-newapi: the settings namespace is not registered (is the plugin row loaded?)",
  retry: "Retry",
  readOnly: "The active settings source is read-only; nothing can be saved.",
  modelHint: "By default only models supported by the /chat/completions endpoint are listed; models without that support must be added manually. Tune modelExcludePatterns in the llm-newapi: settings section."
};

// src/client/apply.ts
var NS3 = "settings.newapi";
var SECTION_CSS = `
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
`;
var inject = ["slots", "locale", "connection"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS3, { zh, en }), "llm-newapi: copy dictionaries");
  if (typeof document !== "undefined") {
    ctx.effect(() => {
      const element = document.createElement("style");
      element.textContent = SECTION_CSS;
      document.head.append(element);
      return () => {
        element.remove();
      };
    }, "llm-newapi: section styles");
  }
  const connection = ctx.get("connection");
  const t = ctx.locale.bind(NS3);
  const fetchModelParams = (request) => connection.rpc.call("/llm-newapi", "models-dev-params", request);
  const probe = (request) => connection.rpc.call("/llm-newapi", "probe", request);
  const parseChannelConn = (blob) => connection.rpc.call("/llm-newapi", "parse-channel-conn", blob);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "newapi",
    order: 15,
    label: () => t("nav"),
    inject: () => ({ api: connection.api, t, fetchModelParams, probe, parseChannelConn })
  }, NewApiSection));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
