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
import { queryDuasByContext, selectAbuseSafeDuas } from '../data/duas.js'
import { ABUSE_SAFE_DUAS } from '../data/abuse-safe-duas.js'
import {
  distressBlockFor,
  evaluateDistress,
} from '../safety/crisis-keywords.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'
import { HADITH_CONTRACT } from '../contracts/presentation.js'

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
  "Retrieve Islamic supplications (du'as) from the curated du'a collection for a life context. Returns Arabic, transliteration, English translation, and source with hadith grading where available. If the context contains crisis keywords, the response includes a mandatory crisis-resource block."

export async function getDuaHandler(
  input: GetDuaInput,
): Promise<SakinaResponse<unknown>> {
  // WO#385: crisis detection runs first, on the FULL raw input, unchanged.
  // Category matching (single term, then the phrase matcher) comes after
  // and never alters what the crisis check sees.
  // Gem 10 fix 4 + 5: HARD crisis (self-harm / abuse) → unconditional
  // crisis_resource. SOFT distress (anxiety, grief, stress, fear,
  // despair) → gentler "support is available" appendix. Hard always
  // wins over soft.
  const distress = evaluateDistress(input.context)
  // Gem 10 round-3 (Option A): serve the verified in-country crisis table for
  // the request locale (en default). id/ur/ar get their own helplines, never
  // the UK/US numbers.
  const block = distressBlockFor(distress, input.locale ?? 'en')
  const extras = block ? { crisis_resource: block } : undefined

  // Gem 3 ruling (WO#385): on an abuse disclosure, the safety block and
  // resources come first and, in 1.4.1, alone. The du'a query never runs.
  if (distress.level === 'hard' && distress.crisisType === 'abuse') {
    return abuseResponse(input.context, extras, ABUSE_SAFE_DUAS)
  }

  // On a HARD crisis input the phrase matcher does not run: a du'a list
  // inferred from words in a crisis message ("my husband hits me" ->
  // marriage) must never sit beside the crisis block. Those inputs behave
  // exactly as before WO#385 (single-term match only).
  const result = queryDuasByContext(input.context, { phraseMatching: distress.level !== 'hard' })

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
  // WO#385: each distinct per-record directive in this response is also
  // stated once in CRITICAL_RULES (Gem 4's, the held interim, or both).
  const recordDirectives = [
    ...new Set(result.duas.map((d) => d.grading_directive).filter((x): x is string => Boolean(x))),
  ]
  const extraDirectives = recordDirectives.length ? recordDirectives : undefined

  return buildResponse({
    contentType: 'dua_collection',
    content: {
      context: result.resolvedCategory,
      matched_by: result.matchedBy,
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

/** Gem 3's ordering directive for any du'a shown after the abuse block. */
export const ABUSE_ORDER_DIRECTIVE =
  "Output the safety block and resources first. Only then, if du'as are included, present them after."

/**
 * The abuse response (WO#385). With nothing on the allowlist (1.4.1) it is
 * crisis_resource_only: no du'as. With allowlisted records it is a
 * dua_collection whose du'as come AFTER the safety block, under Gem 3's
 * ordering directive; sabr/endurance du'as are dropped either way.
 * Exported so the allowlist path can be tested while the list is empty.
 */
export function abuseResponse(
  context: string,
  extras: Record<string, unknown> | undefined,
  allowlist: readonly string[],
): SakinaResponse<unknown> {
  const duas = selectAbuseSafeDuas(allowlist)
  if (!duas.length) {
    return buildResponse({
      contentType: 'crisis_resource_only',
      content: {
        requested: { context },
        withheld: 'dua_collection',
        reason: "Du'as are not shown when a message discloses abuse. The crisis resource is the whole response.",
      },
      extras,
    })
  }
  const recordDirectives = [
    ...new Set(duas.map((d) => d.grading_directive).filter((x): x is string => Boolean(x))),
  ]
  return buildResponse({
    contentType: 'dua_collection',
    content: { context: 'abuse-safe', duas, total_results: duas.length },
    extras,
    extraDirectives: [ABUSE_ORDER_DIRECTIVE, ...recordDirectives],
  })
}

