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
- `0.9.2`：**修复模型选择器分组**。dsh 的模型目录把每个 provider 组
  的标签取 `adapter.providerInfo().name`（dsh-host-apiproxy `buildModelCatalog`），
  v0.9.0 多实例化时漏了这一步——`providerInfo` 仍硬编码 `name: 'NewAPI'`，
  于是 seekai / justwoker 两个实例在选择器里都显示成 "NewAPI"。
  修复：`NewApiAdapterOptions` 新增 `displayName`，adapter 构造时传入实例名，
  `providerInfo()` 返回它（未传则回退路由 id）。选择器分组从此显示
  "seekai" / "justwoker"。回归：`test/provider-name-smoke.mjs`（每实例
  providerInfo 名 + 无 displayName 回退）；`test/migrate-smoke.mjs` 更新为
  断言真实 settings.yaml 的 2 个实例（seekai + justwoker）。
  与 dsh-reasoning-slider / dsh-model-picker 兼容：模型目录的
  `reasoning.efforts`（id/name）由 `resolveModel` 从 catalog 的
  reasoningEfforts 提供；提供商标签即上面修好的 displayName。
- `0.9.3`：**设置页实例区改成"切换栏 + 卡片"**。原来所有实例卡片垂直堆
  叠 + 每张卡一个"上移/下移"，加新实例要滚到底。改成上方一条 tab
  栏（每个实例一个胶囊，激活高亮，+ 添加始终在右），下方只渲染激
  活的那一张卡。删除/添加/探测/描述符导入都还在卡里。
  - 删除上移/下移（tab 顺序 = 数组顺序；要重排就删了重加，注释里说
    明——拖拽排序留给下版）
  - 删 active 实例时自动落到第一张剩余（render 里 `activeIndex` 自
    带回退，不再有"激活变孤儿"）
  - 移除 `NewApiAdapterOptions.onMove`、`InstanceEditor.onMove`/`total`
    字段、`locale.moveUp/moveDown`；新增 `locale.instanceTabs` /
    `tabReorderHint`（中英一致）
  - 新增 CSS：`.newapi-tabs` 横滚 + `.newapi-tab` 胶囊 +
    `.newapi-tabActive` 品牌色高亮 + `.newapi-tabAdd` 虚线 +
  - 仍是纯 client 改动，刷浏览器即生效，宿主无需重启
- `0.9.4`：**代理改模式选择 + 工具调用测试 + Models 页绿点修复**。
  - **代理模式**：`proxy` 从 `{enabled, url}` 改为 `{mode: system|direct|custom, url?}`。
    旧格式自动迁移（`enabled:true→custom`、`enabled:false→direct`）；`mode` 不加
    schema 默认值（否则 schema 规范化会先于迁移吃掉 legacy enabled）。
    `system` = 跟随机器代理（HTTP(S)_PROXY env → Windows WinINET 注册表，30s 缓存，
    Clash 系统代理即写这里）。UI 从复选框改成下拉（跟随系统/直连/自定义）。
  - **工具调用测试**：探针新增 `toolCallModel`（`ping` 函数 + 模型被要求调用它，
    `max_tokens:32`，默认 30s 超时），验证网关 tools 通路（/models 和文本 chat
    正常但 tools 被剥的网关只有它能测出来）。UI 加"含工具调用测试"勾选 + 结果展示。
  - **Models 页绿点修复**：实例配置新增 `apiKeyEnv`（序列化自动写 `newapi_<id>`，
    host 解析用 `apiKeyEnv ?? refOf(id)`）。根因：Models 页只对"存储 profile 里
    有 apiKeyEnv 字段"的行做 credentials.describe，旧配置没有该字段 → seekai/
    justwoker 永远无点（连红点都没有）。写入后官方"模型"页正确显示已配置绿点。
  - settings.yaml：seekai/justwoker 补 `apiKeyEnv` + proxy 迁到 `mode`。
  - 回归：migrate-smoke 全 PASS（13 项）。
- `0.9.5`：**修复 tab+card 的激活跟踪缺陷**。之前用 `activeId`（存实例 id 字符串）
  去 `instances.findIndex(d => d.id === activeId)` 反查位置——但 id 字段本身可编辑，
  用户一改 id，activeId 立刻失配 → findIndex -1 → 兜底跳到第一个实例；同时编辑器
  `key={draft.id}` 变化导致整卡重挂载（丢焦点/丢展开态/丢密钥草稿）。
  修复：激活态改按**位置索引** `activeIndex` 跟踪（id 可编辑、位置不变），渲染时
  clamp 到当前列表；tab 与编辑器 key 都改用位置（`tab-<i>` / `instance-<i>`），
  编辑 id 不再触发重挂载；删除/新增时索引显式维护。
- `0.9.6`：**代理模式加固 + 探测可视化 + agentrouter 实例**。
  - systemProxyUrl 加固：新增 `normalizeProxyUrl`（补 scheme、去 path/尾斜杠）与
    `normalizeSystemProxyValue`（解析 Clash 的多种注册表格式：`host:port`、
    `http=...;https=...` 按协议、`;` 后的旁路列表截断）；custom 模式同样走
    normalize（不再手写 URL 校验）。
  - 探测结果新增 `proxyUsed`：显示这次探测实际走了什么代理（`走代理
    http://127.0.0.1:7890` 或 `直连`）——之前"跟随系统"到底生效没根本看不出来。
  - settings.yaml 加 agentrouter 实例（baseURL https://agentrouter.org/v1、
    apiKeyEnv newapi_agentrouter、proxy custom 7890、模型 gpt-5.6-sol）。
  - 关键事实：agentrouter 直连超时、**必须走 Clash 代理才通**（实测 401 vs
    Connect Timeout）；本机两个 key 均 401（需用户去 agentrouter 后台重新生成）。
- `0.9.7`：**自定义请求头注入（每实例）**。
  - 实例配置新增 `headers?: Record<string, string>`：注入到该实例对网关的
    **全部**请求——chat completions 流、`/models` 模型发现、连接/chat/工具调用
    探测。适用场景：OpenRouter 系要 `HTTP-Referer`/`X-Title`、某些网关要自定义
    `X-*` 鉴权头、或被 Cloudflare 系 bot 防护按 `Origin` 放行的站点。
  - **安全语义**：自定义头先展开、强制头（`authorization`/`content-type`/
    `accept`/产品 `User-Agent`）后展开——自定义头**只能追加、不能覆盖**，
    存错也搞不坏鉴权与线协议。`resolveAdapterOptions` 校验头名必须符合
    RFC 7230 token、值不得含 CR/LF，非法项沿用 last-good 配置而不是整段失效。
  - **探测如实反映草稿**：`ProbeRequest` 新增 `headers?`，设置页把未保存的
    请求头草稿一并传入探测（host 端在没有 override 时回退实例快照），
    与 proxyUrl 的草稿 override 行为一致。
  - **UI**：实例卡新增「自定义请求头」区块（名称 + 值 + 删除行、添加按钮、
    空态与提示文案），序列化时丢弃空名、空列表不落盘；`z.dict(z.string())`
    schema 保证任意键合法往返。
  - models.dev 目录下载（第三方主机）刻意**不**注入自定义头。
  - 回归：migrate-smoke 增补 headers 解析断言；build:host + build:client +
    typecheck 全绿。
- `0.9.8`：**人性化交互（toast / 两段式删除 / 撤销）+ 推理档位默认配置**。
  - **toast 系统**（`NewApiSection`）：保存成功 → 底部绿色气泡「已保存 · 已即时
    生效」（settings 热生效，无需重启）；行级删除（模型行/请求头）→ 橙色气泡
    带「撤销」按钮，6s 内一键还原原位（闭包持有删除前快照）；错误仍内联展示。
    三类反馈形式各异（气泡/确认/内联），删除无 undo 冗余。
  - **两段式删除确认**（实例）：删除实例按钮第一次点击进入「确认删除？」武装态
    （3.5s 自动解除），第二次点击才真正删除——误触零代价。实例删除是破坏性的
    （拆路由 + 凭据孤立），所以用确认而非撤销。
  - **同名校验**：实例 displayName（供应商标签）重复时拒绝保存——模型选择器按
    组名区分，两个同名供应商无法分辨。locale 新增 instanceNameDuplicate。
  - **推理档位默认配置**（`src/efforts.ts`，任务 4b）：`resolveModel` 对未声明
    reasoningEfforts 的目录行做**家族前缀兜底**——glm→[low/medium/high]、
    gpt-5/o 系→[none/low/medium/high]、deepseek-chat→hybrid、deepseek-r1→
    reasoner、qwen/kimi/claude/grok→三档等，默认选中 medium。**运行时只读**：
    不写回存储目录，models.dev 拉取或手工配置的档位永远优先；未知家族保持
    静默（不虚构能力）。效果：对话模型选择器对新网关模型立即出现档位菜单。
    设计参照 models.dev `reasoning_options` 与 dsh 内置 provider 目录。
  - 回归：client 测试新增 3 例（同名拒绝 / 两段式删除 / 撤销恢复），共 15 例
    全过；resolveModel 档位兜底行为单测通过（含"显式配置优先"）。
- `0.9.9`：**交互体验大改（弹窗/动画/自动保存）+ 配置页⇄设置页滑动切换**。
  - toast 淡入淡出：自动消失前 250ms 进入 leaving 态（opacity+位移过渡），不再硬消失。
  - **删除撤销可配置**：全局设置（齿轮页）可开关删除撤销、自定义可操作时长
    （默认 7s 开），存 `settings.yaml` 的 `ui:` 段（Config schema 支持，host 不读）。
  - **实例删除改为大窗口弹窗二次确认**：右上角垃圾桶图标（不再是文字按钮），
    点击弹模态框说明后果（路由/凭据引用/供应商组立即移除、不可撤销），
    取消或确认；弹窗带淡入淡出。
  - **模型行删除淡出动画**：行先 opacity/位移淡出 220ms 再离场，撤销仍可还原；
    撤销关闭时删除提示降级为普通 info toast。
  - **功能性设置交互提醒**（代理模式切换、chat/工具调用开关、撤销开关）一律
    即时 toast 反馈；自定义代理模式未填 URL 时追加提醒。原则已写入全局记忆。
  - **探测开关改为动画 switch**（chat 实测/工具调用），样式统一。
  - **自动保存**：任何实例/设置改动后 1.5s debounce 自动写入（dirty→saving→
    saved 状态条：未保存/保存中/已自动保存），手动保存按钮保留（立即落盘 +
    toast）；测试通过 `autoSave={false}` 禁用。
  - **配置页 ⇄ 设置页滑动切换**：顶部工具栏（卡片/齿轮图标），设置页收纳
    撤销偏好与「从描述符导入」（导入=解析后新建实例并预填密钥）。
  - 回归：client 15 例全绿（弹窗流程/撤销禁用/淡出等待适配）；migrate-smoke
    断言放宽为 ≥3 实例（用户环境新增了 seekai2）。
- `0.9.10`：**回收站模式 + 删除音效 + 获取模型修复 + 开关样式修复**。
  - **回收站**：实例删除不再弹确认（可找回），直接移入回收站（toast 带撤销）；
    工具栏新增回收站按钮（计数 badge）→ 面板列表（名称/网关地址 + 恢复/彻底删除），
    可清空；**彻底删除/清空才弹大窗口确认**（不可逆）。回收站配置存
    `settings.yaml` 的 `trash:` 段（host 不注册、不参与实例折叠）。
  - **删除音效**：WebAudio 合成（无音频文件）——删除=下滑短音、恢复/撤销=上滑、
    彻底删除=低音；设置页可开关（`ui.soundEnabled`，默认开），jsdom/无音频环境静默。
  - **获取模型修复**：网关地址为空时拦截并提示「请先填写网关地址再获取模型」
    （此前会静默回退到已保存地址，令人困惑）；点击获取弹「正在从 {url} 获取模型…」
    气泡，按钮转圈（spinner 动画）。
  - **开关样式修复**：`--dsw-alias-brand-primary` 在 dsh 浅色主题下=#f9fafb（近白），
    导致开启态全白——on 态改用品牌蓝 `--dsw-static-deepseek-500`，撤销按钮文字用
    deepseek-300（实测变量存在性后修正）。
  - 回归：client 16 例全绿（回收站移入/恢复/永久删除弹窗）；trash 段 round-trip
    单测通过（trash 不注册）。
- `0.9.11`：**协议选项（Anthropic Messages）+ 多密钥支持**。
  - **协议选项**：实例新增 `protocol: openai|anthropic`（默认 openai）。Anthropic 分支
    用 `serializeAnthropicRequest`（Messages 序列化：system 合并、tool_use input
    JSON.parse、tool_result 进 user 消息、max_tokens 必填缺省 8192）→ POST
    `/messages`（`x-api-key` + `anthropic-version: 2023-06-01`，无 Bearer）→
    `anthropicEventsToWire` 把事件流转成 OpenAI WireChunk（text_delta→content、
    thinking_delta→reasoning_content、input_json_delta→tool_calls 片段、
    end_turn→stop、usage 减 cache）→ 复用共享 translate 组装。`parseSse` 增加
    `expectDone` 参数（Anthropic 流无 [DONE] 哨兵）。设计参考 CC-Switch /
    claude-model-switch 的协议切换思路。
  - **多密钥**：实例新增 `keys: [{id, apiKeyEnv?}]`（k2/k3…，凭据 ref 默认
    `newapi_<id>_<keyId>`）。发现模型时**每个密钥各拉一次 /models 合并去重**，
    构建模型→密钥路由表（`modelKey`）；请求按模型路由到能访问它的密钥，
    未发现的模型回退主密钥。`resolveApiKey` 增加 `keyRef?` 参数。
  - **client**：实例卡新增「接口协议」选择与「附加密钥」区（添加 k2/k3、逐行
    密钥输入、删除清 pending）；草稿/序列化 round-trip；legacy 分支补全字段。
  - 回归：新增 `protocol-smoke`（序列化/事件翻译/多密钥合并+路由 17 断言）；
    vitest 16 例 + 全部 smoke 绿。
- `0.9.12`：**OpenAI Responses 协议（第三个 wire protocol）+ probe 协议化 + 重试显示优化**。
  - **Responses 协议**：实例 `protocol: 'responses'` → 序列化到 Responses input items
    （`function_call_output` 先于该 user 消息的 text 输出，保证 function_call 紧跟其 output，
    符合 API 严格顺序规则）→ POST `/v1/responses`（Bearer）→ `responsesEventsToWire`
    事件翻译（output_text.delta→content、reasoning delta→reasoning_content、
    function_call_arguments.delta→工具参数、completed→finish+usage、无 [DONE] 哨兵）→
    复用共享 translate。`reasoning.effort` 映射自 harness 档位。
  - **probe 协议化**（修掉 anthropic 协议下 chat/tool 探测写死 /chat/completions 的 bug）：
    probeChat/probeToolCall 按协议打 /messages、/responses 或 /chat/completions，并解析
    对应字段；anthropic 探测用 x-api-key + anthropic-version。
  - **usage 一致性修复**：anthropic 的 mapAnthropicUsage 曾自行减 cache，而共享 translate
    又减一次（double-subtract）——改为 wire 层保留含 cache 原值、cache 单列 details，
    由 translate 统一减，与 OpenAI/Responses 路径一致。
  - **baseURL 提示文案更新**（不再只有 /chat/completions 一种说法）。
  - 回归：protocol-smoke 42 断言（新增 responses 序列化/事件翻译/probe 协议化 15 项）。
- `0.9.12b`（harness 核心包，非插件）：`dsh-client-ui-conversation` 重试显示优化——
  zh「{label}（{retry}/{maximum}） · {seconds}s」→「{label} · 第 {retry}/{maximum} 次 ·
  约 {seconds} 秒后」；en 同步「attempt x/y · in ~Ns」；重试延迟详情 ms→秒。
