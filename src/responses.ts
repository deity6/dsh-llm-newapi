/**
 * OpenAI Responses wire protocol for the adapter (the instance-level
 * `protocol: 'responses'` option). Request serialization maps the harness
 * conversation onto Responses input items — `function_call_output` items are
 * emitted BEFORE their user message's text so every `function_call` is
 * immediately followed by its output, as the API strictly requires; the
 * stream direction maps Responses SSE events onto the OpenAI-compatible
 * WireChunk shape so the shared {@link translate} block assembler, usage
 * and finish handling are reused unchanged. Responses streams carry no
 * `[DONE]` sentinel — `response.completed` closes them.
 *
 * @module dsh-llm-newapi/responses
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm'
import { DONE } from './sse.ts'
import type { WireUsage } from './types.ts'

/** OpenAI Responses request body (the subset this adapter sends). */
export interface ResponsesRequest {
  model: string
  input: ResponsesInputItem[]
  instructions?: string
  max_output_tokens?: number
  tools?: ResponsesTool[]
  reasoning?: { effort: string }
  stream: true
  temperature?: number
}

/** One entry of the Responses `input` array. */
export type ResponsesInputItem =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

export interface ResponsesTool {
  type: 'function'
  name: string
  description?: string
  parameters: unknown
}

/** Responses requires max_output_tokens; the adapter's default when omitted. */
export const RESPONSES_DEFAULT_MAX_TOKENS = 8192

/** Join the text blocks of one harness message. */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/**
 * Serialize the harness conversation onto Responses input items. The harness
 * `system` option and historic system-role messages fold into the top-level
 * `instructions` string. Assistant text becomes `{role: 'assistant'}` items,
 * tool calls become `function_call` items; user text becomes `{role: 'user'}`
 * items and tool results become `function_call_output` items.
 *
 * Ordering rule: a `function_call` must be IMMEDIATELY followed by its
 * `function_call_output` — no other item may interleave (the API rejects an
 * interleaved text with a 400). Tool results ride inside user-role messages,
 * so every output of a user message is emitted BEFORE that message's text;
 * the output therefore always lands right after the assistant's call.
 *
 * @param messages - the harness conversation.
 * @param system - the call-level system prompt.
 * @returns Responses instructions plus the input item list.
 */
export function serializeResponsesInput(
  messages: readonly GenerateOptions['messages'][number][],
  system: string | undefined,
): { instructions?: string; input: ResponsesInputItem[] } {
  const instructions: string[] = []
  if (system !== undefined && system.length > 0) instructions.push(system)
  const input: ResponsesInputItem[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = flattenText(message.content)
      if (text.length > 0) instructions.push(text)
      continue
    }
    if (message.role === 'assistant') {
      const text = flattenText(message.content)
      if (text.length > 0) input.push({ role: 'assistant', content: text })
      for (const block of message.content) {
        if (block.type !== 'tool-call') continue
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          // The wire wants the raw arguments string; the gateway forwards it
          // to the upstream as-is.
          arguments: block.arguments,
        })
      }
      continue
    }
    // user role: tool results ride in user messages; every output must
    // immediately follow its call, so outputs go out BEFORE the message text.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    for (const result of toolResults) {
      input.push({
        type: 'function_call_output',
        call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        output: flattenText(result.content) || '(no output)',
      })
    }
    const text = flattenText(message.content)
    if (text.length > 0) input.push({ role: 'user', content: text })
  }
  return {
    ...instructions.length > 0 ? { instructions: instructions.join('\n\n') } : {},
    input,
  }
}

/**
 * Build the Responses request body. Optional fields are omitted rather than
 * sent as null so upstream defaults apply; an explicit reasoning effort
 * rides as Responses' `reasoning.effort` (it only ever arrives for a row
 * whose catalog declares supported efforts).
 * @param options - the harness request (model, history, system, tools, sampling).
 * @returns the Responses body; `stream: true` always.
 */
export function serializeResponsesRequest(options: GenerateOptions): ResponsesRequest {
  const { instructions, input } = serializeResponsesInput(options.messages, options.system)
  const tools: ResponsesTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    name: tool.name,
    ...tool.description !== undefined ? { description: tool.description } : {},
    parameters: tool.parameters ?? { type: 'object' },
  }))
  return {
    model: options.model,
    input,
    ...instructions === undefined ? {} : { instructions },
    ...options.maxTokens === undefined ? {} : { max_output_tokens: options.maxTokens },
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.reasoningEffort !== undefined ? { reasoning: { effort: options.reasoningEffort } } : {},
    stream: true,
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
  }
}

/** Responses usage → disjoint harness WireUsage (cache reads stay separate). */
function mapResponsesUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number }
}): WireUsage {
  return {
    prompt_tokens: usage.input_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? 0,
    ...usage.input_tokens_details?.cached_tokens !== undefined && usage.input_tokens_details.cached_tokens > 0
      ? { prompt_tokens_details: { cached_tokens: usage.input_tokens_details.cached_tokens } }
      : {},
    ...usage.output_tokens_details?.reasoning_tokens !== undefined && usage.output_tokens_details.reasoning_tokens > 0
      ? { completion_tokens_details: { reasoning_tokens: usage.output_tokens_details.reasoning_tokens } }
      : {},
  }
}

/**
 * Responses has no `finish_reason` field; derive it from the completed
 * response. `max_output_tokens` incompletion maps to `length`, any
 * function_call output maps to `tool_calls`, a clean completion to `stop`.
 * @param response - the completed response payload (may be absent).
 * @param sawToolCall - whether any function_call item streamed this turn.
 * @returns the OpenAI-compatible finish reason, if derivable.
 */
function finishReasonOf(
  response: { status?: string; incomplete_details?: { reason?: string } } | undefined,
  sawToolCall: boolean,
): string | undefined {
  if (response?.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens') return 'length'
  if (sawToolCall) return 'tool_calls'
  if (response?.status === 'completed') return 'stop'
  return undefined
}

/**
 * Translate Responses SSE data payloads (as produced by {@link parseSse})
 * into OpenAI-compatible WireChunk JSON, ending with the `[DONE]` sentinel
 * so the shared translate assembler can consume them unchanged.
 * @param payloads - Responses SSE data payloads (no `[DONE]`; `response.completed` closes the stream).
 * @returns OpenAI-shaped chunk JSON strings, `[DONE]` last.
 */
export async function* responsesEventsToWire(payloads: AsyncIterable<string>): AsyncGenerator<string> {
  const toolItemIds = new Map<string, number>() // Responses item id → wire tool-call index
  let nextToolIndex = 0
  let pendingUsage: WireUsage | undefined
  let sawToolCall = false
  let finished = false

  for await (const payload of payloads) {
    if (payload === DONE) {
      throw new LlmError('Responses SSE stream ended without response.completed', 'STREAM_CLOSED')
    }
    let event: {
      type?: string
      delta?: unknown
      item?: { type?: string; id?: string; name?: string }
      item_id?: string
      response?: {
        status?: string
        incomplete_details?: { reason?: string }
        error?: { message?: string }
        usage?: {
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          input_tokens_details?: { cached_tokens?: number }
          output_tokens_details?: { reasoning_tokens?: number }
        }
      }
      message?: string
    }
    try {
      event = JSON.parse(payload) as typeof event
    } catch {
      throw new LlmError(`malformed Responses SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }
    if (finished) continue

    switch (event.type) {
      case 'response.created':
      case 'response.in_progress':
      case 'response.content_part.added':
      case 'response.output_text.done':
      case 'response.reasoning_summary_text.done':
        continue
      case 'response.output_item.added': {
        const item = event.item
        if (item?.type === 'function_call' && item.id !== undefined && item.name !== undefined) {
          const wireIndex = nextToolIndex++
          toolItemIds.set(item.id, wireIndex)
          sawToolCall = true
          yield JSON.stringify({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: wireIndex,
                  id: item.id,
                  function: { name: item.name, arguments: '' },
                }],
              },
            }],
          })
        }
        continue
      }
      case 'response.output_text.delta': {
        if (typeof event.delta === 'string' && event.delta.length > 0) {
          yield JSON.stringify({ choices: [{ index: 0, delta: { content: event.delta } }] })
        }
        continue
      }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta': {
        if (typeof event.delta === 'string' && event.delta.length > 0) {
          yield JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: event.delta } }] })
        }
        continue
      }
      case 'response.function_call_arguments.delta': {
        if (typeof event.delta === 'string') {
          const wireIndex = event.item_id !== undefined ? toolItemIds.get(event.item_id) : undefined
          yield JSON.stringify({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: wireIndex ?? 0,
                  function: { arguments: event.delta },
                }],
              },
            }],
          })
        }
        continue
      }
      case 'response.completed': {
        const response = event.response
        if (response?.usage !== undefined) pendingUsage = mapResponsesUsage(response.usage)
        const reason = finishReasonOf(response, sawToolCall)
        if (reason !== undefined) {
          yield JSON.stringify({ choices: [{ index: 0, finish_reason: reason }] })
        }
        if (pendingUsage !== undefined) {
          yield JSON.stringify({ choices: [], usage: pendingUsage })
        }
        finished = true
        yield DONE
        return
      }
      case 'response.failed': {
        const error = event.response?.error
        throw new LlmError(
          error?.message ?? 'Responses request failed',
          'UPSTREAM',
        )
      }
      case 'error': {
        throw new LlmError(event.message ?? 'Responses stream error', 'UPSTREAM')
      }
      default:
        // response.output_item.done / response.output_item.delta / unknown —
        // nothing we assemble.
        continue
    }
  }
  throw new LlmError('Responses SSE stream ended without response.completed', 'STREAM_CLOSED')
}
