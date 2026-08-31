/**
 * Anthropic Messages wire protocol for the adapter (the instance-level
 * `protocol: 'anthropic'` option). Request serialization maps the harness
 * conversation onto Messages blocks; the stream direction maps Anthropic
 * SSE events onto the OpenAI-compatible WireChunk shape so the shared
 * {@link translate} block assembler, usage and finish handling are reused
 * unchanged. Endpoints like agentrouter that front Anthropic gateways only
 * need `x-api-key` + `anthropic-version` headers, which the protocol branch
 * in the adapter attaches.
 *
 * @module dsh-llm-newapi/anthropic
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm'
import { DONE } from './sse.ts'
import type { WireChunk, WireUsage } from './types.ts'

/** Anthropic Messages request body (the subset this adapter sends). */
export interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: string
  messages: AnthropicMessage[]
  tools?: AnthropicTool[]
  stream: true
  temperature?: number
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContent[]
}

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface AnthropicTool {
  name: string
  description?: string
  input_schema: unknown
}

/** Anthropic requires max_tokens; the adapter's own default when the call omits it. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192

/** Join the text blocks of one harness message. */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Best-effort parse of a tool-call arguments string into an object. */
function parseInput(argumentsText: string): unknown {
  if (argumentsText.trim().length === 0) return {}
  try {
    return JSON.parse(argumentsText) as unknown
  } catch {
    // A malformed arguments string still needs SOME valid shape on the wire.
    return {}
  }
}

/** Serialize one assistant message into Anthropic content blocks. */
function anthropicAssistant(blocks: readonly ContentBlock[]): AnthropicMessage {
  const content: AnthropicContent[] = []
  const text = flattenText(blocks)
  if (text.length > 0) content.push({ type: 'text', text })
  for (const block of blocks) {
    if (block.type !== 'tool-call') continue
    content.push({
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: parseInput(block.arguments),
    })
  }
  return { role: 'assistant', content }
}

/**
 * Serialize the harness conversation onto Messages. The harness `system`
 * option becomes the top-level `system` string; historic system-role messages
 * (which OpenAI-style serialization keeps in-band) are folded into it too.
 * Tool results ride inside `user` messages as `tool_result` blocks, as the
 * Anthropic API requires.
 * @param messages - the harness conversation.
 * @param system - the call-level system prompt.
 * @returns Anthropic messages plus the merged system string.
 */
export function serializeAnthropicMessages(
  messages: readonly GenerateOptions['messages'][number][],
  system: string | undefined,
): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = []
  const wire: AnthropicMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = flattenText(message.content)
      if (text.length > 0) systemParts.push(text)
      continue
    }
    if (message.role === 'assistant') {
      wire.push(anthropicAssistant(message.content))
      continue
    }
    // user role: text + tool results together in one user message.
    const content: AnthropicContent[] = []
    const text = flattenText(message.content)
    if (text.length > 0) content.push({ type: 'text', text })
    for (const block of message.content) {
      if (block.type !== 'tool-result') continue
      content.push({
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: flattenText(block.content) || '(no output)',
      })
    }
    if (content.length > 0) wire.push({ role: 'user', content })
  }
  if (system !== undefined && system.length > 0) systemParts.unshift(system)
  return {
    ...systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {},
    messages: wire,
  }
}

/**
 * Build the Anthropic Messages request body.
 * @param options - the harness request.
 * @returns the Messages body; `stream: true` always.
 */
export function serializeAnthropicRequest(options: GenerateOptions): AnthropicRequest {
  const { system, messages } = serializeAnthropicMessages(options.messages, options.system)
  const tools: AnthropicTool[] | undefined = options.tools?.map(tool => ({
    name: tool.name,
    ...tool.description !== undefined ? { description: tool.description } : {},
    input_schema: tool.parameters ?? { type: 'object' },
  }))
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    ...system === undefined ? {} : { system },
    messages,
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    stream: true,
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
  }
}

/** Anthropic usage → disjoint harness WireUsage (cache reads subtracted). */
function mapAnthropicUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
}): WireUsage {
  // Anthropic input_tokens INCLUDES cache reads; harness TokenUsage wants
  // disjoint counts, so cache reads are subtracted out (same convention as
  // the OpenAI path).
  const inputTokens = usage.input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  return {
    prompt_tokens: inputTokens - cacheRead,
    completion_tokens: usage.output_tokens ?? 0,
    ...cacheRead > 0 ? { prompt_tokens_details: { cached_tokens: cacheRead } } : {},
  }
}

/** Anthropic stop_reason → OpenAI-compatible finish_reason. */
function mapStopReason(reason: string | undefined): string | undefined {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'max_tokens':
      return 'length'
    case 'tool_use':
      return 'tool_calls'
    default:
      return undefined
  }
}

/**
 * Translate Anthropic SSE data payloads (as produced by {@link parseSse})
 * into OpenAI-compatible WireChunk JSON, ending with the `[DONE]` sentinel
 * so the shared translate assembler can consume them unchanged.
 * @param payloads - Anthropic SSE data payloads, `[DONE]`-terminated.
 * @returns OpenAI-shaped chunk JSON strings, `[DONE]` last.
 */
export async function* anthropicEventsToWire(payloads: AsyncIterable<string>): AsyncGenerator<string> {
  const toolIndices = new Map<number, number>() // anthropic content-block index → wire tool-call index
  let nextToolIndex = 0
  let pendingUsage: WireUsage | undefined
  let sawMessageStart = false

  for await (const payload of payloads) {
    if (payload === DONE) {
      // Anthropic has no [DONE]; the stream already ended via message_stop.
      throw new LlmError('Anthropic SSE stream ended without message_stop', 'STREAM_CLOSED')
    }
    let event: {
      type?: string
      index?: number
      delta?: Record<string, unknown>
      content_block?: { type?: string; id?: string; name?: string }
      message?: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } }
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
    }
    try {
      event = JSON.parse(payload) as typeof event
    } catch {
      throw new LlmError(`malformed Anthropic SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    switch (event.type) {
      case 'message_start': {
        sawMessageStart = true
        pendingUsage = event.message?.usage === undefined
          ? pendingUsage
          : mapAnthropicUsage(event.message.usage)
        continue
      }
      case 'content_block_start': {
        const block = event.content_block
        if (block?.type === 'tool_use' && block.id !== undefined && block.name !== undefined) {
          const wireIndex = nextToolIndex++
          if (event.index !== undefined) toolIndices.set(event.index, wireIndex)
          yield JSON.stringify({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: wireIndex,
                  id: block.id,
                  function: { name: block.name, arguments: '' },
                }],
              },
            }],
          })
        }
        continue
      }
      case 'content_block_delta': {
        const delta = event.delta
        if (delta === undefined) continue
        const type = delta.type
        if (type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
          yield JSON.stringify({ choices: [{ index: 0, delta: { content: delta.text } }] })
        } else if (type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length > 0) {
          yield JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: delta.thinking } }] })
        } else if (type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const wireIndex = event.index !== undefined ? toolIndices.get(event.index) : undefined
          yield JSON.stringify({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: wireIndex ?? 0,
                  function: { arguments: delta.partial_json },
                }],
              },
            }],
          })
        }
        continue
      }
      case 'message_delta': {
        const reason = mapStopReason((event.delta?.stop_reason as string | undefined) ?? undefined)
        if (event.usage !== undefined) pendingUsage = mapAnthropicUsage(event.usage)
        if (reason !== undefined) {
          yield JSON.stringify({ choices: [{ index: 0, finish_reason: reason }] })
        }
        continue
      }
      case 'message_stop': {
        if (pendingUsage !== undefined) {
          yield JSON.stringify({ choices: [], usage: pendingUsage })
        }
        yield DONE
        return
      }
      default:
        // ping / error / unknown event types carry nothing we assemble.
        continue
    }
  }
  throw new LlmError('Anthropic SSE stream ended without message_stop', 'STREAM_CLOSED')
}
