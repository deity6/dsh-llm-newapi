/**
 * Adapter-owned default reasoning-effort presets, keyed by model family.
 *
 * dsh's reasoning slider is a per-model capability: a model only offers an
 * effort picker when its catalog entry declares `reasoningEfforts`. Most
 * NewAPI gateways advertise plain model ids with no capability metadata, so
 * rows imported from `GET /models` carry no efforts and the picker silently
 * has nothing to offer. These presets close that gap with best-effort guesses
 * per family — the same convention models.dev's `reasoning_options` and the
 * built-in provider catalogs encode — applied ONLY as a runtime fallback in
 * `resolveModel` (never written back to the stored catalog, so a user's own
 * models.dev data or hand-edited efforts always win).
 *
 * Effort ids follow the dsh wire convention (`none`/`low`/`medium`/`high`/
 * `xhigh`/`max`); the gateway passes them through as `reasoning_effort`.
 * Unknown families get no guess: an unconfigured row keeps declaring nothing
 * rather than offering a level the upstream may reject.
 *
 * @module dsh-llm-newapi/efforts
 */
/** A guessed preset: the levels to offer plus the one to select by default. */
export interface DefaultReasoning {
    efforts: string[];
    defaultEffort: string;
}
/**
 * Match a gateway model id to a family preset. Matching is prefix-based on
 * the lowercased id and deliberately coarse — a few broad families cover the
 * overwhelming majority of gateway catalogs, and the fallback stays silent
 * so a miss never fabricates capability.
 * @param modelId - the exact gateway model id.
 * @returns the guessed preset, or `undefined` for unknown families.
 */
export declare function defaultReasoningEffortsFor(modelId: string): DefaultReasoning | undefined;
