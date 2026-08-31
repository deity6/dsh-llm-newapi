/**
 * Protocol (Anthropic Messages) and multi-key smoke: serialization shapes,
 * event translation, and merged multi-key discovery. Wire-level streaming
 * against a live gateway is out of scope; the event-translation round trip
 * covers the protocol's full path.
 */
import { resolveAdapterOptions, NewApiAdapter } from '../lib/index.js'
import { anthropicEventsToWire, serializeAnthropicRequest } from '../lib/index.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

// ── Anthropic request serialization ────────────────────────────────────────
const body = serializeAnthropicRequest({
  model: 'claude-sonnet-5',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [
      { type: 'text', text: 'sure' },
      { type: 'tool-call', id: 't1', name: 'lookup', arguments: '{"q":"x"}' },
    ] },
    { role: 'user', content: [{ type: 'tool-result', toolCallId: 't1', content: [{ type: 'text', text: '42' }] }] },
  ],
  system: 'sys',
})
check('anthropic: system 顶层合并', body.system === 'sys')
check('anthropic: max_tokens 缺省默认', body.max_tokens === 8192)
check('anthropic: stream=true', body.stream === true)
check('anthropic: 角色映射 user/assistant/user', JSON.stringify(body.messages.map((m) => m.role)) === '["user","assistant","user"]')
const asst = body.messages[1]
const textBlock = asst.content.find((c) => c.type === 'text')
const toolBlock = asst.content.find((c) => c.type === 'tool_use')
check('anthropic: 助手文本块', textBlock?.text === 'sure')
check('anthropic: 工具块 input 已 JSON.parse', toolBlock?.input?.q === 'x' && toolBlock?.id === 't1')
const userMsg = body.messages[2]
check('anthropic: tool_result 在 user 消息', userMsg.content[0]?.type === 'tool_result' && userMsg.content[0]?.tool_use_id === 't1' && userMsg.content[0]?.content === '42')

// ── Anthropic event → wire chunk translation ───────────────────────────────
async function* feed(payloads) { yield* payloads }
const wires = []
for await (const line of anthropicEventsToWire(feed([
  JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 40 } } }),
  JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'lookup' } }),
  JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"q":' } }),
  JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"x"}' } }),
  JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
  JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello' } }),
  JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'think' } }),
  JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 40 } }),
  JSON.stringify({ type: 'message_stop' }),
]))) wires.push(line)

const parsed = wires
  .filter((w) => w !== '[DONE]')
  .map((w) => JSON.parse(w))
const textChunk = parsed.find((c) => typeof c.choices?.[0]?.delta?.content === 'string')
const thinkChunk = parsed.find((c) => typeof c.choices?.[0]?.delta?.reasoning_content === 'string')
const toolStart = parsed.find((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => t.id === 'tu1'))
const toolArg = parsed.find((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => typeof t.function?.arguments === 'string' && t.function.arguments.length > 0))
const finish = parsed.find((c) => c.choices?.[0]?.finish_reason !== undefined)
const usageChunk = parsed.find((c) => c.usage !== undefined)
check('anthropic: text_delta → delta.content', textChunk?.choices[0].delta.content === 'Hello')
check('anthropic: thinking_delta → reasoning_content', thinkChunk?.choices[0].delta.reasoning_content === 'think')
check('anthropic: tool_use start 带 id/name', toolStart?.choices[0].delta.tool_calls[0].function?.name === 'lookup')
check('anthropic: input_json_delta → arguments 片段', parsed.some((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => t.function?.arguments?.includes('x'))))
check('anthropic: end_turn → finish stop', finish?.choices[0].finish_reason === 'stop')
check('anthropic: usage 映射(cache 减除)', usageChunk?.usage?.prompt_tokens === 60 && usageChunk?.usage?.completion_tokens === 10)
check('anthropic: message_stop → [DONE]', wires[wires.length - 1] === '[DONE]')

// ── Multi-key discovery merge ───────────────────────────────────────────────
{
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') ?? '' })
    const which = calls.length
    return new Response(JSON.stringify({
      object: 'list',
      data: which === 1
        ? [{ id: 'alpha-model' }, { id: 'shared-model' }]
        : [{ id: 'beta-model' }, { id: 'shared-model' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const opts = resolveAdapterOptions({
      id: 'multi',
      baseURL: 'https://gw.test/v1',
      apiKeyEnv: 'newapi_multi',
      proxy: { mode: 'direct' },
      keys: [{ id: 'k2' }, { id: 'k3', apiKeyEnv: 'custom_ref' }],
      models: [],
      modelExcludePatterns: [],
      defaultContextWindow: 128000,
      streamIdleTimeoutMs: 300000,
    }, undefined, credentialRef('newapi_multi'))
    const keyValues = new Map([['newapi_multi', 'k1-val'], ['newapi_multi_k2', 'k2-val'], ['custom_ref', 'k3-val']])
    const adapter = new NewApiAdapter({
      options: () => opts,
      resolveApiKey: async (_conn, ref) => keyValues.get(String(ref)) ?? '',
      displayName: 'multi',
    })
    const found = await adapter.discoverModels({})
    check('多密钥: 3 次 /models 拉取', calls.length === 3, String(calls.length))
    check('多密钥: 合并去重 3 个模型', found.length === 3, JSON.stringify(found.map((m) => m.id)))
    check('多密钥: 各密钥带自己的 Bearer', calls[1].auth === 'Bearer k2-val' && calls[2].auth === 'Bearer k3-val')
    const routing = adapter.routingSnapshotForTest
    check('多密钥: 路由表主密钥优先', routing.get('shared-model') === 'newapi_multi', String(routing.get('shared-model')))
    check('多密钥: 专属模型路由到对应密钥', routing.get('beta-model') === 'newapi_multi_k2', String(routing.get('beta-model')))
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
