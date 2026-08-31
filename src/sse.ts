/**
 * Decode an SSE byte stream into event `data` payloads. Framing — chunk
 * reassembly, UTF-8/CRLF/BOM handling, comment and non-data field skipping,
 * multi-`data:` joining — is `eventsource-parser`'s. Comments are reported
 * only through an optional transport-activity callback. This module keeps
 * the gateway protocol: the literal `[DONE]` is yielded so the caller owns
 * final flushing, and EOF before it raises {@link LlmError}. Framing is
 * spec-strict: an event dispatches only on its blank-line terminator, so an
 * unterminated tail at EOF is truncation, not a flushable payload.
 *
 * @module dsh-llm-newapi/sse
 */

import { createParser } from 'eventsource-parser'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** The terminal payload the gateway (and OpenAI) sends after the last chunk. */
export const DONE = '[DONE]'

/**
 * Parse an SSE byte stream into data payloads. Yields `[DONE]` as the final
 * value and returns; throws `LlmError('STREAM_CLOSED')` when the stream ends
 * without it (truncated response — the model call cannot be trusted).
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @param expectDone - OpenAI-compatible streams close with the literal `[DONE]`;
 *   when true (default) EOF before it is truncation. Anthropic streams have no
 *   sentinel — pass false to treat EOF as a normal close.
 * @returns each event's data payload in arrival order, the `[DONE]` sentinel last.
 */
export async function* parseSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
  expectDone = true,
): AsyncGenerator<string> {
  // Driven by a manual reader loop rather than `pipeThrough`: the web-stream
  // type supplied by the caller (undici's, from the fetch response body) and
  // the global `ReadableStream` disagree on `[Symbol.asyncIterator]` across
  // lib.dom and node:stream/web typings, so the pipe chain does not
  // type-check; the reader loop needs only `getReader()`, which both declare.
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const queue: string[] = []
  const parser = createParser({
    onComment,
    onEvent: (event) => { queue.push(event.data) },
  })
  try {
    // Pull until EOF, feeding each chunk through the parser; an event whose
    // data equals the sentinel terminates the stream at that point.
    for (;;) {
      while (queue.length > 0) {
        const data = queue.shift() as string
        yield data
        if (data === DONE) return
      }
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
    }
    // Final flush: the trailing (unterminated-at-EOF or blank-line-terminated)
    // tail. The sentinel here is the successful completion of a truncation-free
    // stream; its absence means EOF hit before `[DONE]` — a cut-off response
    // (except when the caller opted out of the sentinel contract).
    parser.feed(decoder.decode())
    while (queue.length > 0) {
      const data = queue.shift() as string
      yield data
      if (data === DONE) return
    }
    if (expectDone) {
      throw new LlmError('SSE stream ended without [DONE]', 'STREAM_CLOSED')
    }
  } finally {
    // An early return (sentinel reached mid-stream) must cancel the source
    // like the previous pipe chain did; a finished/errored stream ignores it.
    try {
      await reader.cancel()
    } catch {
      // The stream already closed or errored; nothing to cancel.
    }
  }
}
