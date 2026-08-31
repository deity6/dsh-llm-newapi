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
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
/** Anthropic Messages request body (the subset this adapter sends). */
export interface AnthropicRequest {
    model: string;
    max_tokens: number;
    system?: string;
    messages: AnthropicMessage[];
    tools?: AnthropicTool[];
    stream: true;
    temperature?: number;
}
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: AnthropicContent[];
}
type AnthropicContent = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
} | {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
};
export interface AnthropicTool {
    name: string;
    description?: string;
    input_schema: unknown;
}
/** Anthropic requires max_tokens; the adapter's own default when the call omits it. */
export declare const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192;
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
export declare function serializeAnthropicMessages(messages: readonly GenerateOptions['messages'][number][], system: string | undefined): {
    system?: string;
    messages: AnthropicMessage[];
};
/**
 * Build the Anthropic Messages request body.
 * @param options - the harness request.
 * @returns the Messages body; `stream: true` always.
 */
export declare function serializeAnthropicRequest(options: GenerateOptions): AnthropicRequest;
/**
 * Translate Anthropic SSE data payloads (as produced by {@link parseSse})
 * into OpenAI-compatible WireChunk JSON, ending with the `[DONE]` sentinel
 * so the shared translate assembler can consume them unchanged.
 * @param payloads - Anthropic SSE data payloads, `[DONE]`-terminated.
 * @returns OpenAI-shaped chunk JSON strings, `[DONE]` last.
 */
export declare function anthropicEventsToWire(payloads: AsyncIterable<string>): AsyncGenerator<string>;
export {};
