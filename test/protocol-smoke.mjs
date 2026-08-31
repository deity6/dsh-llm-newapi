/**
 * Protocol (Anthropic Messages) and multi-key smoke: serialization shapes,
 * event translation, and merged multi-key discovery. Wire-level streaming
 * against a live gateway is out of scope; the event-translation round trip
 * covers the protocol's full path.
 */
import { resolveAdapterOptions, NewApiAdapter } from '../lib/index.js'
import { anthropicEventsToWire, serializeAnthropicRequest } from '../lib/index.js'
import { responsesEventsToWire, serializeResponsesRequest } from '../lib/index.js'
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
check('anthropic: usage 映射(cache 单列,translate 统一减)', usageChunk?.usage?.prompt_tokens === 100 && usageChunk?.usage?.completion_tokens === 10 && usageChunk?.usage?.prompt_tokens_details?.cached_tokens === 40)
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

// ── Responses request serialization ────────────────────────────────────────
{
  const rb = serializeResponsesRequest({
    model: 'gpt-5.6-sol',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [
        { type: 'text', text: 'sure' },
        { type: 'tool-call', id: 't1', name: 'lookup', arguments: '{"q":"x"}' },
      ] },
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 't1', content: [{ type: 'text', text: '42' }] }] },
      { role: 'user', content: [{ type: 'text', text: 'thanks' }] },
    ],
    system: 'sys',
    maxTokens: 4096,
    reasoningEffort: 'high',
  })
  check('responses: instructions 顶层合并', rb.instructions === 'sys')
  check('responses: max_output_tokens 映射', rb.max_output_tokens === 4096)
  check('responses: reasoning.effort 映射', rb.reasoning?.effort === 'high')
  check('responses: stream=true', rb.stream === true)
  const types = rb.input.map((item) => item.type ?? item.role)
  check('responses: input 顺序 user/assistant/call/output/user',
    JSON.stringify(types) === '["user","assistant","function_call","function_call_output","user"]',
    JSON.stringify(types))
  const call = rb.input.find((item) => item.type === 'function_call')
  const output = rb.input.find((item) => item.type === 'function_call_output')
  check('responses: function_call 携带 id/name/arguments', call?.call_id === 't1' && call?.name === 'lookup' && call?.arguments === '{"q":"x"}')
  check('responses: output 紧跟 call 之前无 text 插入', rb.input.indexOf(output) === rb.input.indexOf(call) + 1)
  check('responses: tool output 内容兜底', output?.output === '42')
}

// ── Responses event → wire chunk translation ───────────────────────────────
{
  const rwires = []
  for await (const line of responsesEventsToWire(feed([
    JSON.stringify({ type: 'response.created', response: { id: 'r1' } }),
    JSON.stringify({ type: 'response.in_progress', response: { id: 'r1' } }),
    JSON.stringify({ type: 'response.output_item.added', item: { type: 'function_call', id: 'fc1', name: 'lookup' } }),
    JSON.stringify({ type: 'response.function_call_arguments.delta', item_id: 'fc1', delta: '{"q":' }),
    JSON.stringify({ type: 'response.function_call_arguments.delta', item_id: 'fc1', delta: '"x"}' }),
    JSON.stringify({ type: 'response.output_item.added', item: { type: 'message', id: 'm1' } }),
    JSON.stringify({ type: 'response.content_part.added', item_id: 'm1' }),
    JSON.stringify({ type: 'response.output_text.delta', item_id: 'm1', delta: 'Hello' }),
    JSON.stringify({ type: 'response.reasoning_summary_text.delta', item_id: 'm1', delta: 'think' }),
    JSON.stringify({ type: 'response.completed', response: {
      id: 'r1', status: 'completed',
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens_details: { reasoning_tokens: 5 } },
    } }),
  ]))) rwires.push(line)
  const rparsed = rwires.filter((w) => w !== '[DONE]').map((w) => JSON.parse(w))
  const rText = rparsed.find((c) => typeof c.choices?.[0]?.delta?.content === 'string')
  const rThink = rparsed.find((c) => typeof c.choices?.[0]?.delta?.reasoning_content === 'string')
  const rToolStart = rparsed.find((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => t.id === 'fc1'))
  const rToolArg = rparsed.find((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => t.function?.arguments?.includes('x')))
  const rFinish = rparsed.find((c) => c.choices?.[0]?.finish_reason !== undefined)
  const rUsage = rparsed.find((c) => c.usage !== undefined)
  check('responses: output_text.delta → delta.content', rText?.choices[0].delta.content === 'Hello')
  check('responses: reasoning delta → reasoning_content', rThink?.choices[0].delta.reasoning_content === 'think')
  check('responses: function_call start 带 id/name', rToolStart?.choices[0].delta.tool_calls[0].function?.name === 'lookup')
  check('responses: arguments delta 片段', rparsed.some((c) => c.choices?.[0]?.delta?.tool_calls?.some((t) => t.function?.arguments?.includes('x'))))
  check('responses: 有工具 → finish tool_calls', rFinish?.choices[0].finish_reason === 'tool_calls')
  check('responses: usage 映射(cache/reasoning 单列)', rUsage?.usage?.prompt_tokens === 100 && rUsage?.usage?.completion_tokens === 10
    && rUsage?.usage?.prompt_tokens_details?.cached_tokens === 40
    && rUsage?.usage?.completion_tokens_details?.reasoning_tokens === 5)
  check('responses: completed → [DONE]', rwires[rwires.length - 1] === '[DONE]')
}

// ── Responses: max_output_tokens incomplete → finish length ────────────────
{
  const lwires = []
  for await (const line of responsesEventsToWire(feed([
    JSON.stringify({ type: 'response.output_text.delta', item_id: 'm1', delta: 'x' }),
    JSON.stringify({ type: 'response.completed', response: { id: 'r2', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } }),
  ]))) lwires.push(line)
  const lfinish = lwires.filter((w) => w !== '[DONE]').map((w) => JSON.parse(w)).find((c) => c.choices?.[0]?.finish_reason !== undefined)
  check('responses: max_output_tokens → finish length', lfinish?.choices[0].finish_reason === 'length')
}

// ── Responses: response.failed 抛错 ─────────────────────────────────────────
{
  let threw = ''
  try {
    const it = responsesEventsToWire(feed([
      JSON.stringify({ type: 'response.failed', response: { status: 'failed', error: { message: 'boom' } } }),
    ]))
    for await (const _ of it) { /* drain */ }
  } catch (e) {
    threw = e.message
  }
  check('responses: failed 事件抛 LlmError', threw.includes('boom'))
}

// ── Protocol-aware probes hit the right path ────────────────────────────────
{
  const originalFetch = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers })
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (String(url).endsWith('/messages')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (String(url).endsWith('/responses')) {
      const asked = body.tools !== undefined
      return new Response(JSON.stringify(
        asked ? { output: [{ type: 'function_call', name: 'ping' }] } : { output_text: 'ok', status: 'completed' },
      ), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const mkOpts = (id, protocol) => resolveAdapterOptions({
      id, baseURL: `https://${id}.test/v1`, apiKeyEnv: `newapi_${id}`,
      proxy: { mode: 'direct' }, protocol, models: [{ id: 'm1' }],
      modelExcludePatterns: [], defaultContextWindow: 128000, streamIdleTimeoutMs: 300000,
    }, undefined, credentialRef(`newapi_${id}`))
    const anth = new NewApiAdapter({ options: () => mkOpts('anth', 'anthropic'), resolveApiKey: async () => 'k', displayName: 'anth' })
    const anthRes = await anth.probeConnection({ chatModel: 'm1' })
    const anthCall = seen[seen.length - 1]
    const anthHeaders = new Headers(anthCall.headers)
    check('probe: anthropic chat 打 /messages', anthCall.url.endsWith('/messages'), anthCall.url)
    check('probe: anthropic 用 x-api-key 无 Bearer',
      anthHeaders.get('x-api-key') === 'k' && anthHeaders.get('anthropic-version') === '2023-06-01'
      && !(anthHeaders.get('authorization') ?? '').startsWith('Bearer'))
    check('probe: anthropic chat 解析 content[0].text', anthRes.chat?.text === 'ok')

    const resp = new NewApiAdapter({ options: () => mkOpts('rsp', 'responses'), resolveApiKey: async () => 'k', displayName: 'rsp' })
    const respRes = await resp.probeConnection({ chatModel: 'm1', toolCallModel: 'm1' })
    const respCalls = seen.slice(seen.length - 2)
    check('probe: responses chat 打 /responses', respCalls[0].url.endsWith('/responses'), respCalls[0].url)
    check('probe: responses chat 解析 output_text', respRes.chat?.text === 'ok')
    check('probe: responses tool 解析 output function_call', respRes.toolCall?.toolName === 'ping')
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
