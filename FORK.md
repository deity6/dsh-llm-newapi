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
