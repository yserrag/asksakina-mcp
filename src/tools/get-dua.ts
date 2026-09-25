/**
 * Tool: get_dua (WO#102).
 *
 * Returns a collection of du'as matching a life context. The context
 * input is resolved against canonical category slugs, an alias map,
 * and category tag dimensions. If the input contains a crisis keyword
 * (matched against the main app's `detectCrisis` keyword list), the
 * response includes a `crisis_resource` block with mandatory helpline
 * language for the consuming agent to surface.
 */

import { z } from 'zod'
import { queryDuasByContext } from '../data/duas.js'
import {
  distressBlockFor,
  evaluateDistress,
} from '../safety/crisis-keywords.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'
import { HADITH_CONTRACT, UNRECORDED_GRADING_DIRECTIVE } from '../contracts/presentation.js'

export const getDuaShape = {
  context: z
    .string()
    .min(2)
    .describe(
      "Life context to match against. Examples: 'anxiety', 'grief', 'morning', 'travel', 'forgiveness', 'gratitude'.",
    ),
  locale: z
    .enum(['en', 'id', 'ur', 'ar'])
    .optional()
    .describe('Translation locale; defaults to "en". v1 returns English content for all locales.'),
} as const

export const getDuaSchema = z.object(getDuaShape)
export type GetDuaInput = z.infer<typeof getDuaSchema>

export const GET_DUA_TITLE = 'get_dua'
export const GET_DUA_DESCRIPTION =
  "Retrieve authenticated Islamic supplications (du'as) for a life context. Returns Arabic, transliteration, English translation, and source with hadith grading where available. If the context contains crisis keywords, the response includes a mandatory crisis-resource block."

export async function getDuaHandler(
  input: GetDuaInput,
): Promise<SakinaResponse<unknown>> {
  const result = queryDuasByContext(input.context)
  // Gem 10 fix 4 + 5: HARD crisis (self-harm / abuse) → unconditional
  // crisis_resource. SOFT distress (anxiety, grief, stress, fear,
  // despair) → gentler "support is available" appendix. Hard always
  // wins over soft.
  const distress = evaluateDistress(input.context)
  // Gem 10 round-3 (Option A): serve the verified in-country crisis table for
  // the request locale (en default). id/ur/ar get their own helplines, never
  // the UK/US numbers.
  const block = distressBlockFor(distress.level, input.locale ?? 'en')
  const extras = block ? { crisis_resource: block } : undefined

  if (!result.resolvedCategory) {
    return buildResponse({
      contentType: 'not_found',
      content: {
        requested: { context: input.context },
        reason:
          'No du\'a category matched the supplied context. Try a more general term ("anxiety", "morning", "gratitude", "forgiveness").',
      },
      extras,
    })
  }

  // WO#377 addendum: the envelope reports what the records hold. If any
  // record has no recorded grading, require_grading becomes 'per_record'
  // and the agent reads each record's grading_status.
  const unrecorded = result.duas.filter((d) => d.grading_status === 'not_recorded').length
  const contractOverride = unrecorded
    ? { hadith: { ...HADITH_CONTRACT, require_grading: 'per_record' as const } }
    : undefined
  const extraDirectives =
    unrecorded && UNRECORDED_GRADING_DIRECTIVE ? [UNRECORDED_GRADING_DIRECTIVE] : undefined

  return buildResponse({
    contentType: 'dua_collection',
    content: {
      context: result.resolvedCategory,
      duas: result.duas,
      total_results: result.duas.length,
      grading_summary: {
        quranic: result.duas.filter((d) => d.grading_status === 'quranic').length,
        graded: result.duas.filter((d) => d.grading_status === 'graded').length,
        not_recorded: unrecorded,
      },
    },
    extras,
    contractOverride,
    extraDirectives,
  })
}
