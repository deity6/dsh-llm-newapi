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
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
/** OpenAI Responses request body (the subset this adapter sends). */
export interface ResponsesRequest {
    model: string;
    input: ResponsesInputItem[];
    instructions?: string;
    max_output_tokens?: number;
    tools?: ResponsesTool[];
    reasoning?: {
        effort: string;
    };
    stream: true;
    temperature?: number;
}
/** One entry of the Responses `input` array. */
export type ResponsesInputItem = {
    role: 'user';
    content: string;
} | {
    role: 'assistant';
    content: string;
} | {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
} | {
    type: 'function_call_output';
    call_id: string;
    output: string;
};
export interface ResponsesTool {
    type: 'function';
    name: string;
    description?: string;
    parameters: unknown;
}
/** Responses requires max_output_tokens; the adapter's default when omitted. */
export declare const RESPONSES_DEFAULT_MAX_TOKENS = 8192;
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
export declare function serializeResponsesInput(messages: readonly GenerateOptions['messages'][number][], system: string | undefined): {
    instructions?: string;
    input: ResponsesInputItem[];
};
/**
 * Build the Responses request body. Optional fields are omitted rather than
 * sent as null so upstream defaults apply; an explicit reasoning effort
 * rides as Responses' `reasoning.effort` (it only ever arrives for a row
 * whose catalog declares supported efforts).
 * @param options - the harness request (model, history, system, tools, sampling).
 * @returns the Responses body; `stream: true` always.
 */
export declare function serializeResponsesRequest(options: GenerateOptions): ResponsesRequest;
/**
 * Translate Responses SSE data payloads (as produced by {@link parseSse})
 * into OpenAI-compatible WireChunk JSON, ending with the `[DONE]` sentinel
 * so the shared translate assembler can consume them unchanged.
 * @param payloads - Responses SSE data payloads (no `[DONE]`; `response.completed` closes the stream).
 * @returns OpenAI-shaped chunk JSON strings, `[DONE]` last.
 */
export declare function responsesEventsToWire(payloads: AsyncIterable<string>): AsyncGenerator<string>;
