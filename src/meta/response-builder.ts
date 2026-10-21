/**
 * Response builder (WO#102).
 *
 * Wraps a tool's content payload with the canonical `_sakina_meta`
 * envelope. Every tool response on every locale follows the same
 * shape so consuming agents can reliably read the disclaimer, LLM
 * directives, presentation contract, and educational context.
 *
 * No tool returns raw content; everything goes through `buildResponse`.
 */

import { SAKINA_DISCLAIMER, NOT_FOUND_DISCLAIMER, CRISIS_ONLY_DISCLAIMER } from '../contracts/disclaimers.js'
import {
  QURAN_VERSE_CONTEXT,
  HADITH_CONTEXT,
  NAMES_OF_ALLAH_CONTEXT,
} from '../contracts/educational.js'
import {
  QURAN_CONTRACT,
  HADITH_CONTRACT,
  NAME_OF_ALLAH_CONTRACT,
  REFLECTION_CONTRACT,
  QURAN_DIRECTIVES,
  VERSE_COLLECTION_DIRECTIVES,
  DUA_DIRECTIVES,
  NAME_DIRECTIVES,
  VOICE_2_RULE,
  PBUH_RULE,
  NO_EMOJI_RULE,
  TEACH_DIRECTIVE,
  TEACH_CONTRACT,
  NO_TEACH_CLAUSE,
} from '../contracts/presentation.js'

export type ContentType =
  | 'quran_verse'
  /** WO#386: find_verses. Several verses from the thematic index. */
  | 'verse_collection'
  | 'dua_collection'
  | 'name_of_allah'
  | 'not_found'
  /** WO#385 (Gem 3 ruling): an abuse disclosure. No du'as; the crisis
   *  resource block is the whole response. */
  | 'crisis_resource_only'

const VERSION = '1.0'
const SOURCE = 'AskSakina Islamic Knowledge Server (asksakina.com)'

interface BuilderInput<TContent> {
  contentType: ContentType
  content: TContent
  /** Extra top-level fields (e.g. crisis_resource on get_dua). */
  extras?: Record<string, unknown>
  /** Merged over the content type's presentation contract (WO#377 addendum:
   *  get_dua sets hadith.require_grading from the records it returns). */
  contractOverride?: Record<string, unknown>
  /** Appended to the content type's CRITICAL_RULES. */
  extraDirectives?: readonly string[]
  /**
   * WO#478 (Gem 3 condition 1): true under the same condition that withholds
   * teach (a support block in the response, a grief route). The no-teach
   * clause ("Where no teach block is supplied, you may explain only from
   * this record's own supplied fields...") is then cut from every directive
   * that carries it, so a response under a support block invites no
   * explanation at all.
   */
  withholdTeach?: boolean
}

export interface SakinaResponse<TContent> {
  _sakina_meta: {
    version: string
    source: string
    content_type: ContentType
    disclaimer: string
    llm_directives: { CRITICAL_RULES: readonly string[] }
    presentation_contract: Record<string, unknown>
    educational_context: string
  }
  content: TContent
  [extra: string]: unknown
}

function metaForType(contentType: ContentType): {
  directives: readonly string[]
  contract: Record<string, unknown>
  educational: string
  disclaimer: string
} {
  switch (contentType) {
    case 'quran_verse':
      return {
        directives: QURAN_DIRECTIVES,
        contract: { quran: QURAN_CONTRACT },
        educational: QURAN_VERSE_CONTEXT,
        disclaimer: SAKINA_DISCLAIMER,
      }
    case 'verse_collection':
      return {
        directives: VERSE_COLLECTION_DIRECTIVES,
        contract: { quran: QURAN_CONTRACT },
        educational: QURAN_VERSE_CONTEXT,
        disclaimer: SAKINA_DISCLAIMER,
      }
    case 'dua_collection':
      return {
        directives: DUA_DIRECTIVES,
        contract: { hadith: HADITH_CONTRACT },
        educational: HADITH_CONTEXT,
        disclaimer: SAKINA_DISCLAIMER,
      }
    case 'name_of_allah':
      return {
        directives: NAME_DIRECTIVES,
        contract: {
          name_of_allah: NAME_OF_ALLAH_CONTRACT,
          // Gem 10 fix 6 — reflection_contract surfaces alongside the
          // Name + Quran contracts so the agent has explicit rules
          // for the reflection field's paraphrase + citation
          // requirements.
          reflection_contract: REFLECTION_CONTRACT,
          quran: QURAN_CONTRACT,
        },
        educational: NAMES_OF_ALLAH_CONTEXT,
        disclaimer: SAKINA_DISCLAIMER,
      }
    case 'crisis_resource_only':
      // Gem 3 ruling (WO#385): du'as alongside an abuse disclosure risk
      // spiritual bypassing, implying prayer is the answer to active
      // violence. Nothing but the crisis resource is returned.
      return {
        directives: [
          'This response is a crisis resource only. You MUST output the crisis_resource text exactly as written, and nothing in place of it.',
          "Do NOT add du'as, Quranic verses, hadith, or religious advice to your reply.",
          NO_EMOJI_RULE,
          PBUH_RULE,
        ],
        contract: {},
        educational: '',
        disclaimer: CRISIS_ONLY_DISCLAIMER,
      }
    case 'not_found':
      // Even on the not_found path the universal rules apply. The
      // calling agent will still likely write Islamic-content
      // surrounding the failure ("I couldn't find a du'a for X, but
      // here's a general thought…") and that surface needs Voice 2
      // framing + PBUH + no-emoji even when Sakina returned nothing.
      return {
        directives: [
          'The lookup did not return a record. Do not fabricate a substitute.',
          // WO#478 (Gem 4 condition 3): the site link lives in the server
          // instructions only.
          'Suggest the user rephrase or try a related topic.',
          NO_EMOJI_RULE,
          PBUH_RULE,
          VOICE_2_RULE,
        ],
        contract: {},
        educational: '',
        disclaimer: NOT_FOUND_DISCLAIMER,
      }
  }
}

/** The directive without its trailing no-teach clause (WO#478, Gem 3 condition 1). */
const NO_TEACH_SUFFIX = ` ${NO_TEACH_CLAUSE}`
function withoutNoTeachClause(directive: string): string {
  return directive.endsWith(NO_TEACH_SUFFIX) ? directive.slice(0, -NO_TEACH_SUFFIX.length) : directive
}

/** True when any record in the content carries a teach block (WO#405). */
function carriesTeach(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesTeach)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.teach && typeof record.teach === 'object') return true
  return Object.values(record).some(carriesTeach)
}

export function buildResponse<TContent>(
  input: BuilderInput<TContent>,
): SakinaResponse<TContent> {
  const meta = metaForType(input.contentType)
  // WO#407 (Gem 10): the teach directive and contract go out only with a
  // teach block, so a response without one serialises exactly as before.
  const teach = carriesTeach(input.content)
  const extra = [...(input.extraDirectives ?? []), ...(teach ? [TEACH_DIRECTIVE] : [])]
  const full = extra.length ? [...meta.directives, ...extra] : meta.directives
  const directives = input.withholdTeach ? full.map(withoutNoTeachClause) : full
  const merged = input.contractOverride
    ? { ...meta.contract, ...input.contractOverride }
    : meta.contract
  const contract = teach ? { ...merged, teach: TEACH_CONTRACT } : merged
  const response: SakinaResponse<TContent> = {
    _sakina_meta: {
      version: VERSION,
      source: SOURCE,
      content_type: input.contentType,
      disclaimer: meta.disclaimer,
      llm_directives: { CRITICAL_RULES: directives },
      presentation_contract: contract,
      educational_context: meta.educational,
    },
    content: input.content,
  }
  if (input.extras) {
    for (const [key, value] of Object.entries(input.extras)) {
      response[key] = value
    }
  }
  return response
}

/**
 * Convenience helper: serialise a response to JSON. Performs a final
 * sanity check that no Unicode prophet salutation slipped through any
 * data layer; throws if it did so the caller learns immediately rather
 * than in production.
 */
export function serialiseResponse(response: SakinaResponse<unknown>): string {
  const json = JSON.stringify(response, null, 2)
  if (json.includes('\u{FDFA}')) {
    throw new Error(
      'Response contains the Unicode prophet salutation. Sanitise at the data layer.',
    )
  }
  return json
}
