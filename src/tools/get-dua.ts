/**
 * Tool: get_dua (WO#102).
 *
 * Returns a collection of du'as matching a life context. The context
 * input is resolved against canonical category slugs, an alias map,
 * and category tag dimensions. If the input contains a hard crisis keyword
 * (matched against the main app's `detectCrisis` keyword list), the
 * `crisis_resource` block with mandatory helpline language is the whole
 * response: no du'a is looked up or returned (Gem 3, WO#388-B).
 */

import { z } from 'zod'
import {
  BEREAVED_CONTEXT,
  getDuaRecordById,
  queryDuasByContext,
  selectAbuseSafeDuas,
  type DuaRecord,
} from '../data/duas.js'
import { BEREAVED_GENDER_NOTE } from '../data/bereaved-duas.js'
import { ABUSE_SAFE_DUAS } from '../data/abuse-safe-duas.js'
import {
  distressBlockFor,
  evaluateDistress,
} from '../safety/crisis-keywords.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'
import { duaEnglishNote, ENGLISH_FALLBACK_GUARD } from '../contracts/english-fallback.js'
import {
  ANTI_SUMMARISATION_DIRECTIVE,
  HADITH_CONTRACT,
  NOT_A_NARRATION_DIRECTIVE,
  NOT_A_NARRATION_SCOPE_HEAD,
  QURAN_CITATION_DIRECTIVE,
  QURAN_CONTRACT,
  UNGRADED_GRADING_DIRECTIVE,
} from '../contracts/presentation.js'
import { UNGRADED_SCOPE_HEAD } from '../contracts/gem4-wo418.js'
import { isPickthallTranslation } from '../data/duas.js'
import { DUA_ID_ALLOWLIST } from '../data/dua-id-allowlist.js'
import { audienceArg } from '../teach/audience.js'
import { withTeach } from '../teach/attach.js'
import type { Audience } from '../teach/types.js'

/** Shape of a du'a id: "D00068", "fasting-iftar-2357". */
export const DUA_ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/

/**
 * WO#478 (Architect, 20 Oct 2026; review fix 2, paging): a context lookup
 * returns `limit` records (default GET_DUA_DEFAULT_LIMIT, at most
 * GET_DUA_MAX_LIMIT) of the route's existing order, starting at `offset`
 * (default 0), so every record stays reachable by context. The bereaved set
 * (Gem 4's fixed order) and the abuse allowlist are always returned whole,
 * offset ignored. When more follow the page, the response says so, in
 * `content.more` and in CRITICAL_RULES.
 */
export const GET_DUA_DEFAULT_LIMIT = 3
export const GET_DUA_MAX_LIMIT = 10

/**
 * WO#481 (Gem 10 conditions 3 and 4): every non-en du'a collection says the
 * du'as are English, in content.translation_note and CRITICAL_RULES, with the
 * translation guard. en is unchanged.
 */
function englishDisclosure(locale: string): { note: Record<string, string>; directives: string[] } {
  const note = duaEnglishNote(locale)
  return note ? { note: { translation_note: note }, directives: [note, ENGLISH_FALLBACK_GUARD] } : { note: {}, directives: [] }
}

/** The note on a page with more after it; exact wording from the Architect. */
export function moreDuasNote(remaining: number): string {
  return `${remaining} more ${remaining === 1 ? "du'a" : "du'as"} for this context; call get_dua with offset and limit to see them.`
}

export const getDuaShape = {
  context: z
    .string()
    .min(2)
    .optional()
    .describe(
      "Life context to match against. Examples: 'anxiety', 'morning', 'travel', 'forgiveness', 'gratitude'. Send this or id, not both.",
    ),
  // WO#390 flag 3: resolves only ids named in a signed `related` list.
  id: z
    .string()
    .regex(DUA_ID_PATTERN)
    .optional()
    .describe("A du'a id taken from a related reference in an earlier response. Send this or context, not both."),
  locale: z
    .enum(['en', 'id', 'ur', 'ar', 'tr'])
    .optional()
    .describe('Locale; defaults to "en". Du\'a records are English for every locale; a crisis resource is given in the request locale.'),
  audience: audienceArg,
  limit: z
    .number()
    .int()
    .min(1)
    .max(GET_DUA_MAX_LIMIT)
    .optional()
    .describe(
      `Number of du'as to return for a context; default ${GET_DUA_DEFAULT_LIMIT}, max ${GET_DUA_MAX_LIMIT}. The response says how many more exist. Ignored with id.`,
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of du'as to skip before the page, for paging with limit; default 0. Ignored with id, and on the bereaved set."),
} as const

export const getDuaSchema = z.object(getDuaShape)
export type GetDuaInput = z.infer<typeof getDuaSchema>

export const GET_DUA_TITLE = 'get_dua'
// WO#386 item B: under 200 characters (directory listings), agent-instructing.
export const GET_DUA_DESCRIPTION =
  "Returns du'as from a curated du'a corpus for a life context (e.g. anxiety, travel, gratitude), with source and grading where recorded. Show any crisis_resource block verbatim."

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
  // WO#390 flag 3: exactly one of context or id.
  if (input.id !== undefined) {
    if (input.context !== undefined) return oneOfRefusal(input)
    return duaByIdResponse(input.id, input.locale ?? 'en', DUA_ID_ALLOWLIST, input.audience)
  }
  if (input.context === undefined) return oneOfRefusal(input)
  const distress = evaluateDistress(input.context)
  // Gem 10 round-3 (Option A): serve the verified in-country crisis table for
  // the request locale (en default). id/ur/ar get their own helplines, never
  // the UK/US numbers.
  const block = distressBlockFor(distress, input.locale ?? 'en')
  let extras: Record<string, unknown> | undefined = block ? { crisis_resource: block } : undefined

  // Gem 3 ruling (WO#385): on an abuse disclosure, the safety block and
  // resources come first and, in 1.4.1, alone. The du'a query never runs.
  if (distress.level === 'hard' && distress.crisisType === 'abuse') {
    return abuseResponse(input.context, extras, ABUSE_SAFE_DUAS, input.locale ?? 'en')
  }

  // Gem 3 ruling (WO#388-B, 27 Sep 2026): every other hard crisis (self-harm)
  // also gets the crisis resource alone, as find_verses does. This returns
  // before queryDuasByContext, so no du'a record exists yet to leak.
  if (distress.level === 'hard') {
    return buildResponse({
      contentType: 'crisis_resource_only',
      content: {
        requested: { context: input.context },
        withheld: 'dua_collection',
        reason: "Du'as are not shown when a message carries a crisis keyword. The crisis resource is the whole response.",
      },
      extras,
    })
  }

  const result = queryDuasByContext(input.context)

  if (result.resolvedCategory === BEREAVED_CONTEXT) {
    // WO#386 item D: every bereaved route carries at least the soft
    // support note, whether or not the words hit a soft keyword.
    if (!extras) extras = { crisis_resource: distressBlockFor('soft', input.locale ?? 'en') }
    if (!result.duas.length) {
      return buildResponse({
        contentType: 'not_found',
        content: {
          requested: { context: input.context },
          context: BEREAVED_CONTEXT,
          matched_by: result.matchedBy,
          duas: [],
          total_results: 0,
          no_records_yet: true,
          reason:
            "No du'as are in the corpus yet for a bereaved person to say for their own grief. They are awaiting scholarly review.",
          see_also: {
            context: 'deceased',
            note: "Du'as said for the person who has died (funeral, grave, and du'as for the deceased).",
          },
        },
        extras,
      })
    }
  }

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
  // WO#478: the bereaved set is returned whole; every other context is paged
  // by `offset` and `limit` (default GET_DUA_DEFAULT_LIMIT) in the route's
  // existing order.
  const whole = result.resolvedCategory === BEREAVED_CONTEXT
  const offset = whole ? 0 : (input.offset ?? 0)
  const limit = whole ? result.duas.length : (input.limit ?? GET_DUA_DEFAULT_LIMIT)
  const shown = result.duas.slice(offset, offset + limit)
  const shownIds = result.ids.slice(offset, offset + limit)
  const remaining = Math.max(0, result.duas.length - offset - shown.length)
  const unrecorded = shown.filter((d) => d.grading_status === 'not_recorded').length
  // WO#454: a general supplication carries no grading either.
  const general = shown.filter((d) => d.grading_status === 'not_a_narration').length
  // WO#405: teach attaches per record, after lookup; WO#478: whenever an
  // entry exists, audience or not. WO#407 (Gem 10): nothing attaches on
  // grief routes or under any support block.
  const withhold = Boolean(extras?.crisis_resource) || GRIEF_CONTEXTS.has(result.resolvedCategory)
  const duas = shown.map((d, i) => withTeach(d, `dua:${shownIds[i]}`, { audience: input.audience, locale: input.locale, withhold }))
  const contractOverride = contractOverrideFor(shown)
  // WO#385: each distinct per-record directive in this response is also
  // stated once in CRITICAL_RULES; WO#418 B1 scopes the ungraded one.
  // WO#478: the "more" note is mandatory whenever records were cut.
  const english = englishDisclosure(input.locale ?? 'en')
  const recordDirectives = [...collectionDirectivesFor(shown), ...(remaining > 0 ? [moreDuasNote(remaining)] : []), ...english.directives]
  const extraDirectives = recordDirectives.length ? recordDirectives : undefined

  return buildResponse({
    contentType: 'dua_collection',
    content: {
      context: result.resolvedCategory,
      matched_by: result.matchedBy,
      // WO#386: Gem 4's teaching note on the bereaved context, verbatim.
      ...(result.resolvedCategory === BEREAVED_CONTEXT && BEREAVED_GENDER_NOTE
        ? { teaching_note: BEREAVED_GENDER_NOTE }
        : {}),
      duas,
      total_results: shown.length,
      total_available: result.duas.length,
      ...(offset > 0 ? { offset } : {}),
      truncated: remaining > 0,
      ...(remaining > 0 ? { more: moreDuasNote(remaining) } : {}),
      grading_summary: {
        quranic: shown.filter((d) => d.grading_status === 'quranic').length,
        graded: shown.filter((d) => d.grading_status === 'graded').length,
        not_a_narration: general,
        not_recorded: unrecorded,
      },
      ...english.note,
    },
    extras,
    contractOverride,
    extraDirectives,
    withholdTeach: withhold,
  })
}

/** Grief routes (WO#405, Gem 3): Field 4 is never shown on these contexts. */
const GRIEF_CONTEXTS: ReadonlySet<string | null> = new Set([BEREAVED_CONTEXT, 'deceased'])

/**
 * WO#418 Part A (Gem 10 condition 1): when a response returns any
 * Quran-labelled record, its presentation contract carries the existing
 * QURAN_CONTRACT beside hadith. translator is named only when every Quran
 * record in the response has verified Pickthall English (Architect: label by
 * fact). Computed from the records as built, before teach attachment.
 */
export function quranContractFor(records: readonly DuaRecord[]): Record<string, unknown> | undefined {
  const quran = records.filter((d) => d.origin === 'quran')
  // WO#444: a mixed du'a's Qur'anic spans fall under the same contract. Their
  // English is verified Pickthall at bundle time, so they never withhold the
  // translator.
  const mixed = records.filter((d) => d.origin !== 'quran' && d.quran_spans?.length)
  if (!quran.length && !mixed.length) return undefined
  const allPickthall = quran.every(isPickthallTranslation)
  return { quran: { ...QURAN_CONTRACT, ...(allPickthall ? { translator: 'Marmaduke Pickthall' } : {}) } }
}

/**
 * The presentation-contract override for a set of records: the hadith
 * contract's require_grading becomes 'per_record' when any record carries no
 * grading (ungraded, WO#377; or a general supplication, WO#454), and the
 * Quran contract joins when quranContractFor returns one.
 */
export function contractOverrideFor(records: readonly DuaRecord[]): Record<string, unknown> | undefined {
  const perRecord = records.some((d) => d.grading_status === 'not_recorded' || d.grading_status === 'not_a_narration')
  const quran = quranContractFor(records)
  if (!perRecord && !quran) return undefined
  return {
    ...(perRecord ? { hadith: { ...HADITH_CONTRACT, require_grading: 'per_record' as const } } : {}),
    ...quran,
  }
}

/**
 * Every CRITICAL_RULES line a du'a collection adds to DUA_DIRECTIVES (WO#454
 * order): anti-summarisation when there is more than one record, the Quran
 * citation line whenever the Quran contract applies, then the record
 * directives (responseDirectivesFor).
 */
export function collectionDirectivesFor(records: readonly DuaRecord[]): string[] {
  return [
    ...(records.length > 1 ? [ANTI_SUMMARISATION_DIRECTIVE] : []),
    ...(quranContractFor(records) ? [QURAN_CITATION_DIRECTIVE] : []),
    ...responseDirectivesFor(records),
  ]
}

/**
 * WO#418 B1 (Gem 4 Reply 2 item 1, Option A): the response-level copy of the
 * locked ungraded directive names the ungraded records it applies to, so it
 * cannot float over a graded record in the same response. The per-record
 * grading_directive is unchanged. Any other record directive passes as is.
 */
export function responseDirectivesFor(records: readonly DuaRecord[]): string[] {
  const titled = (directive: string) => [...new Set(records.filter((d) => d.grading_directive === directive).map((d) => d.title))]
  const ungraded = titled(UNGRADED_GRADING_DIRECTIVE)
  // WO#454 (Gem 10 item D): scoped the same way as the ungraded directive
  const general = titled(NOT_A_NARRATION_DIRECTIVE)
  const scoped = new Set([UNGRADED_GRADING_DIRECTIVE, NOT_A_NARRATION_DIRECTIVE])
  const others = [...new Set(records.map((d) => d.grading_directive).filter((x): x is string => Boolean(x) && !scoped.has(x as string)))]
  return [
    ...(ungraded.length ? [`${UNGRADED_SCOPE_HEAD}(${ungraded.join(', ')}): ${UNGRADED_GRADING_DIRECTIVE}`] : []),
    ...(general.length ? [`${NOT_A_NARRATION_SCOPE_HEAD}(${general.join(', ')}): ${NOT_A_NARRATION_DIRECTIVE}`] : []),
    ...others,
  ]
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
  locale = 'en',
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
  const recordDirectives = collectionDirectivesFor(duas)
  const english = englishDisclosure(locale)
  return buildResponse({
    contentType: 'dua_collection',
    content: { context: 'abuse-safe', duas, total_results: duas.length, ...english.note },
    extras,
    contractOverride: contractOverrideFor(duas),
    extraDirectives: [ABUSE_ORDER_DIRECTIVE, ...recordDirectives, ...english.directives],
    // WO#478 (Gem 3): the hard abuse block withholds teach and the no-teach clause alike.
    withholdTeach: true,
  })
}


/** Neither or both of context and id (WO#390 flag 3). No lookup runs. */
function oneOfRefusal(input: GetDuaInput): SakinaResponse<unknown> {
  return buildResponse({
    contentType: 'not_found',
    content: {
      requested: { context: input.context, id: input.id },
      reason: 'Send either context or id, not both and not neither.',
    },
  })
}

/**
 * get_dua by id (WO#390, Architect ruling on flag 3). Resolves ONLY ids on
 * the allowlist built at bundle time from the Gem-2-signed related lists.
 * Every other id, in the corpus or not, gets the same refusal with no record
 * content, so the lookup is not an oracle for which ids exist.
 *
 * The crisis check runs first on the raw id, as on context. The ungraded
 * directive applies exactly as on a context lookup: the record comes from the
 * same toRecord, and its directive is restated in CRITICAL_RULES.
 * Exported so the allowlist path can be tested while the list is empty.
 */
export function duaByIdResponse(
  id: string,
  locale: 'en' | 'id' | 'ur' | 'ar' | 'tr',
  allowlist: readonly string[],
  audience?: Audience,
): SakinaResponse<unknown> {
  const distress = evaluateDistress(id)
  const block = distressBlockFor(distress, locale)
  const extras = block ? { crisis_resource: block } : undefined
  if (distress.level === 'hard') {
    return buildResponse({
      contentType: 'crisis_resource_only',
      content: {
        requested: { id },
        withheld: 'dua_collection',
        reason: "Du'as are not shown when a message carries a crisis keyword. The crisis resource is the whole response.",
      },
      extras,
    })
  }
  const record: DuaRecord | null = allowlist.includes(id) ? getDuaRecordById(id) : null
  if (!record) {
    return buildResponse({
      contentType: 'not_found',
      content: {
        requested: { id },
        reason: 'This id is not available for direct lookup. Look up by context instead.',
      },
      extras,
    })
  }
  // WO#405: the same attachment as a context lookup; WO#478: audience or not;
  // WO#407: nothing attaches under a support block (a soft keyword in the id).
  const duas = [withTeach(record, `dua:${id}`, { audience, locale, withhold: Boolean(extras) })]
  const unrecorded = duas.filter((d) => d.grading_status === 'not_recorded').length
  const recordDirectives = [...collectionDirectivesFor([record]), ...englishDisclosure(locale).directives]
  return buildResponse({
    contentType: 'dua_collection',
    content: {
      id,
      duas,
      total_results: 1,
      grading_summary: {
        quranic: duas.filter((d) => d.grading_status === 'quranic').length,
        graded: duas.filter((d) => d.grading_status === 'graded').length,
        not_a_narration: duas.filter((d) => d.grading_status === 'not_a_narration').length,
        not_recorded: unrecorded,
      },
      ...englishDisclosure(locale).note,
    },
    extras,
    contractOverride: contractOverrideFor([record]),
    extraDirectives: recordDirectives.length ? recordDirectives : undefined,
    withholdTeach: Boolean(extras),
  })
}
