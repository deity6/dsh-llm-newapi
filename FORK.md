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
