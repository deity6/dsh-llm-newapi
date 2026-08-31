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
  efforts: string[]
  defaultEffort: string
}

/** OpenAI-family hybrid-thinking levels (GPT-5 / o-series / GPT-4.1). */
const OPENAI_FULL: DefaultReasoning = { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'medium' }
/** DeepSeek V3.2-style hybrid thinking (chat + reasoner in one route). */
const DEEPSEEK_HYBRID: DefaultReasoning = { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'none' }
/** R1-style dedicated reasoners expose effort control without a "none" level. */
const DEEPSEEK_REASONER: DefaultReasoning = { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
/** GLM / Qwen / Kimi / Claude / Grok-style three-rung thinking. */
const THREE_RUNG: DefaultReasoning = { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }

/**
 * Match a gateway model id to a family preset. Matching is prefix-based on
 * the lowercased id and deliberately coarse — a few broad families cover the
 * overwhelming majority of gateway catalogs, and the fallback stays silent
 * so a miss never fabricates capability.
 * @param modelId - the exact gateway model id.
 * @returns the guessed preset, or `undefined` for unknown families.
 */
export function defaultReasoningEffortsFor(modelId: string): DefaultReasoning | undefined {
  const id = modelId.trim().toLowerCase()
  if (id.length === 0) return undefined
  if (/^(deepseek-reasoner|deepseek-r1|deepseek-v3\.1?)/.test(id)) return DEEPSEEK_REASONER
  if (/^deepseek/.test(id)) return DEEPSEEK_HYBRID
  if (/^(gpt-5|gpt-4\.1|o[134](?:-|$)|gpt-4o)/.test(id)) return OPENAI_FULL
  if (/^glm/.test(id)) return THREE_RUNG
  if (/^(qwen|qwq)/.test(id)) return THREE_RUNG
  if (/^kimi/.test(id)) return THREE_RUNG
  if (/^claude/.test(id)) return THREE_RUNG
  if (/^gemini/.test(id)) return OPENAI_FULL
  if (/^grok/.test(id)) return THREE_RUNG
  if (/^(ernie|wenxin)/.test(id)) return THREE_RUNG
  if (/^(minimax|moonshot)/.test(id)) return THREE_RUNG
  return undefined
}
