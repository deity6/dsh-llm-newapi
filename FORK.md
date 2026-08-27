# 二改说明 (Second-modification notice)

本仓库是 **`wenzetan/dsh-llm-newapi`** 的二改版本（fork / second-modification）。

- 原项目：`https://github.com/wenzetan/dsh-llm-newapi`
- 本仓库归属：Deity（保留原 MIT 许可证，原作者版权归 wenzetan 所有）

## 本二改新增的能力

1. **渠道连接描述符解析（`src/channel-conn.ts`）**
   - 支持解析 `newapi_channel_conn` 格式（来自 seekai.cc 等以 newapi 为原型的站点）：
     `{ "_type": "newapi_channel_conn", "key": "<api key>", "url": "<站点根地址>" }`
   - 协议无关：每个 `_type` 映射到一个解析器，注册在 `Map` 中。
   - 通过 `registerChannelConnParser(type, parser)` 可扩展注册**其他 newapi 原型站点**
     的自定义描述符形状，而无需改动核心逻辑。
   - 解析结果统一为 `{ baseURL, apiKey }`，即 `newapi` 供应商路由所需的连接事实。

2. **Host 端探针（`NewApiAdapter.probeConnection`，`src/adapter.ts`）**
   - 对给定端点执行 `GET /v1/models`（而非 chat completion）做连通性 + 鉴权探测，
     返回结构化 `ProbeResult`：`{ ok, reachable, authValid, status, modelCount, sampleModels, latencyMs, error }`。
   - 选用 `/models` 而非 chat：部分 newapi 站点把 chat 端点藏在 Cloudflare Turnstile
     等bot防护后，脚本化推理会被挡，但 `/models` 仍可访问，因此用 `/models` 能给出
     “可达 + 鉴权通过”的真实信号，避免误报“不可达”。

3. **两个 Host RPC 端点（`src/index.ts`，`/llm-newapi`，authority: loopback）**
   - `probe`：传入 `{ baseURL?, apiKey? }`，返回 `ProbeResult`。
   - `parse-channel-conn`：传入原始描述符 blob，返回 `{ baseURL, apiKey }` 或清晰错误。

## 扩展新的 newapi 原型站点

在插件初始化时（或任意宿主侧代码）调用：

```ts
import { registerChannelConnParser } from 'dsh-llm-newapi'

registerChannelConnParser('mygw_token', (obj) => {
  const token = typeof obj.token === 'string' ? obj.token.trim() : ''
  const host = typeof obj.host === 'string' ? obj.host.trim() : ''
  if (!token) return { ok: false, error: 'mygw_token is missing a "token"' }
  if (!host) return { ok: false, error: 'mygw_token is missing a "host"' }
  return { baseURL: normalizeBaseUrl(`${host}/v1`), apiKey: token, sourceType: 'mygw_token' }
})
```

随后用 `parseChannelConn({ _type: 'mygw_token', token, host })` 即可解析。

## 版本

- 在原版 `0.8.3` 基础上提升为 `0.8.4`（仅本仓库版本号，路线 id `newapi` 与 cordis patch id `llm-newapi` 保持不变，以便原地替换原版）。
- `0.8.5`：修复 `registration.adapter.prepareCall is not a function`——dsh-llm ≥0.1.x 的宿主（agent loop 的
  `ctx.llm.prepareCall`）要求 adapter 实现 `prepareCall(provider, model, signal)`，而 wenzetan 原版按旧 dsh-llm
  接口编写（其基类无此方法，且插件自带的老 `@deepseek-ai/dsh-llm` 副本会在运行时抢先命中）。已在
  `NewApiAdapter` 上**显式实现** `prepareCall`（返回 `{ model, stream }`，与新版基类默认实现同构），
  使插件与 dsh-llm 0.0.x / 0.1.x 均兼容。回归验证：`test/prepare-call-smoke.mjs`。
- `0.8.6`：**forward proxy 覆盖全部 gateway 流量**。原版（以及 0.8.4/0.8.5）的 `proxy` 只作用于
  models.dev 目录下载，chat / 模型发现 / 探针仍是裸 fetch——对 seekai.cc 这类按 TLS/JA3 指纹拦截 Node
  的 Cloudflare 站点，会导致 discovery 403、chat 被掐。现在 `gatewayFetch()` 助手把 `proxyUrl`
  （设置页勾选启用时注入 connection）应用到 chat-completions、/models、probe 全部三条 gateway 路径，
  代理 agent 按 URL 缓存复用（避免流式响应中途被关）。实测：直连 probe 403 → 走 Clash 代理 200 /
  20 模型 / authValid=true。回归验证：`test/proxy-smoke.mjs`（直连 vs 代理对比 + chat 流）。
  注：若代理不可达，报错信息会提示检查 Clash 是否在跑（沿用 models.dev 下载的既有提示风格）。
- `0.8.7`：**探针支持极省 token 的 chat 实测**。`ProbeRequest` 新增 `chatModel?` / `chatTimeoutMs?`：
  传了 `chatModel` 才在 models 检查通过后追加一次最小 chat 调用
  （`"Reply with exactly: ok"` + `max_tokens: 5`，默认 20s 上限），返回 `ProbeResult.chat`
  （`{ ok, status, latencyMs, text, finishReason, error }`）；不传则保持原免费 models-only 行为。
  鉴权失败不跑 chat 子探针（省得白费请求）。设计动机：连接/鉴权通了 ≠ chat 真能用
  （上游可能排队长、端点被 bot 防护掐），一次几 token 的 chat 实测能端到端确认真假。
  实测：seekai.cc 当前平均延迟 219s，25s 探针如实报超时。回归验证：`test/probe-chat-smoke.mjs`。
- `0.8.8`：**设置页 UI 升级**（客户端）。新增：
  - **测试连接按钮**：调 host `probe` RPC（草稿 baseURL/key 一次性生效、不落盘），结果卡片显示
    可达/鉴权/模型数/延迟/HTTP 状态 + 样例模型；勾选"含 chat 实测"走 v0.8.7 的极省 token chat 探针
    （用目录第一个模型，25s 上限）。
  - **从描述符导入**：粘贴 `newapi_channel_conn` 格式 JSON → 调 host `parse-channel-conn` RPC →
    自动填网关地址 + 密钥并自动跑一次探测。
  - baseURL 字段加提示（只填到 /v1，adapter 自动拼 /chat/completions 与 /models）；
    探测结果卡 + 导入面板样式随 `--dsw-alias-*` 令牌走明暗主题。
- `0.9.0`：**多实例架构**。设置命名空间从扁平单网关改为 `{ instances: [...] }` 列表，
  每个实例独立注册自己的 provider 路由 `newapi-<id>` 与凭据引用 `newapi_<id>`
  （凭据 ref 禁止连字符，故用下划线），可同时配置多个 newapi 站点互不串 key：
  - **host**（`src/index.ts`）：`instanceEntriesOf()` 迁移旧扁平配置 → 单个 `default` 实例
    （升级无缝）；每实例独立 adapter + `optionsFor(id)` 解析（沿用 last-good 缓存）；
    `syncRegistrations()` 随设置快照增删实例（dispose/replace 原子操作）；discovery/probe/
    models-dev 三个 RPC 单入口按草稿分派；`ProbeRequest` 新增 `proxyUrl` 使每实例的
    独立代理能如实探测。导出 `sanitizeInstanceId/routeOf/refOf` 供测试。
  - **client**（`NewApiSection.tsx` 重写 + 新 `InstanceEditor.tsx`）：实例列表编辑器，
    每实例一张卡（ID/名称/密钥/地址/代理/模型 + 探测 + 描述符导入 + 上移/下移/删除），
    全局保存写 `instances` 与逐实例待存密钥；加载时兼容旧扁平 section 值。
  - **seekai 接入**：`settings.yaml` 迁移为 `instances: [{id: seekai, displayName: seekai, …}]`，
    凭据补 `newapi_seekai`，默认模型路由改 `newapi-seekai`。
  - 回归：`test/multi-instance-smoke.mjs`（route/ref/迁移/多实例独立解析）、
    `test/migrate-smoke.mjs`（真实 settings.yaml 解析）。
  客户端类型在 `params-types.ts` 镜像 host `types.ts`（客户端 `rootDir: src/client` 不能跨目录 import）。
- `0.9.1`：**hotfix：NewAPI 设置面板渲染崩（React #301）**。v0.9.0 把 `void load()`
  写在了 `NewApiSection` 的 render body 里（`if (status === 'loading') void load()`），React 18
  对 render 期间的 setState 触发无限更新循环 → 触发 "Maximum update depth exceeded" → dsh web
  的 slot 错误边界用 `<div data-slot-error="settings.section">` 静默占位 → 用户看到空面板。
  修复：把初始加载移进 `useEffect(() => { void load() }, [])`，render body 不再触发副作用。
  验证：Edge 浏览器实测 reload + 进设置 → 点 NewAPI → 完整渲染"实例 1"卡片与全部字段。
  诊断方法：reload 前装 `console.error` 钩 + error/unhandledrejection 监听 → 拿到
  `Minified React error #301` + `slot entry crashed in 'settings.section'`；宿主无需重启，
  client bundle 直接刷新。
