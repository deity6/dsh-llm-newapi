/**
 * Channel-connection descriptor parsing.
 *
 * A "channel connection" (渠道连接) is a small JSON blob some NewAPI-based
 * front-ends hand their users to import a gateway in one click — for example
 * seekai.cc issues `{ _type: "newapi_channel_conn", key, url }`. dsh has no
 * native notion of this descriptor; this module ingests it into the
 * connection facts the `newapi` route consumes (`{ baseURL, apiKey }`).
 *
 * The design is deliberately open: each descriptor `_type` maps to one
 * parser registered in a map, so a future NewAPI-prototype site that ships a
 * different descriptor shape can register its own `_type` without touching
 * the core. NewAPI itself serves its API under `/v1` by default, so the
 * built-in parser appends `/v1` to the descriptor's `url` (the site root).
 *
 * @module dsh-llm-newapi/channel-conn
 */
/** Connection facts a parsed channel connection yields. */
export interface ParsedChannelConn {
    /** Always `true` for a successful parse — discriminates from the error arm. */
    ok: true;
    /** Normalized gateway base with the `/v1` prefix (`/models` appends to it). */
    baseURL: string;
    /** The API key to store under the `newapi` credentials reference. */
    apiKey: string;
    /** Which descriptor format produced this; handy for telemetry / messaging. */
    sourceType: string;
}
/** A failed parse, with a human-readable reason. */
export interface ChannelConnParseError {
    /** Always `false` for a parse failure. */
    ok: false;
    /** Human-readable reason the descriptor was rejected. */
    error: string;
}
/** Union of a good and a bad parse. */
export type ChannelConnParseResult = ParsedChannelConn | ChannelConnParseError;
/**
 * A parser for one descriptor `_type`. Receives the raw, untyped blob and
 * returns either connection facts or an error string. The parser owns its
 * own field validation (presence, trimming, URL normalization).
 */
export type ChannelConnParser = (raw: Record<string, unknown>) => ChannelConnParseResult;
/**
 * Register a parser for one channel-connection descriptor type. Call this to
 * add support for another NewAPI-prototype site without editing the core —
 * e.g. a fork that ships `{ _type: "mygw_token", token, host }` would supply
 * its own mapping to `{ baseURL, apiKey }`.
 * @param type - the descriptor's `_type` discriminator.
 * @param parser - the parser producing `{ baseURL, apiKey }` or an error.
 */
export declare function registerChannelConnParser(type: string, parser: ChannelConnParser): void;
/**
 * Parse one channel-connection descriptor into connection facts, dispatching
 * on its `_type`. Unknown or malformed descriptors return an error result
 * rather than throwing, so callers can surface a clean message in the UI.
 * @param raw - the descriptor blob (already JSON-parsed, untyped).
 * @returns connection facts, or `{ ok: false, error }`.
 */
export declare function parseChannelConn(raw: unknown): ChannelConnParseResult;
