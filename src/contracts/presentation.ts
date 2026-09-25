/**
 * Presentation contracts (WO#102).
 *
 * Per content type, what the agent is allowed to do with the record.
 * These contracts are embedded in `_sakina_meta.presentation_contract`
 * on every tool response. They are not enforceable — agents are free
 * to ignore them — but they document the project's standard so that
 * non-compliant behaviour can be flagged.
 */

export interface QuranContract {
  paraphrase_allowed: false
  require_surah_ayah_citation: true
  translation_label_required: true
  translation_label: string
}

export interface HadithContract {
  paraphrase_allowed: false
  require_source_collection: true
  /**
   * true when every record in the response carries a grading (hadith
   * grading, or Quranic). 'per_record' when at least one record has
   * grading_status 'not_recorded': the agent reads each record's
   * grading_status instead of assuming a grading exists (WO#377 addendum).
   */
  require_grading: true | 'per_record'
  prefer_dua_block: true
}

export interface NameOfAllahContract {
  arabic_paraphrase_allowed: false
  english_meaning_required: true
}

export interface ReflectionContract {
  paraphrase_allowed: false
  require_quranic_citation: true
}

export const QURAN_CONTRACT: QuranContract = {
  paraphrase_allowed: false,
  require_surah_ayah_citation: true,
  translation_label_required: true,
  translation_label: 'Translation of the Meaning',
}

export const HADITH_CONTRACT: HadithContract = {
  paraphrase_allowed: false,
  require_source_collection: true,
  require_grading: true,
  prefer_dua_block: true,
}

export const NAME_OF_ALLAH_CONTRACT: NameOfAllahContract = {
  arabic_paraphrase_allowed: false,
  english_meaning_required: true,
}

export const REFLECTION_CONTRACT: ReflectionContract = {
  paraphrase_allowed: false,
  require_quranic_citation: true,
}

/**
 * LLM directive lists (CRITICAL_RULES). Embedded under
 * `_sakina_meta.llm_directives.CRITICAL_RULES` on every response.
 *
 * Two rules are repeated verbatim across every tool because Gem 10
 * flagged each as essential to Sakina's surface contract:
 *
 *   - Voice 2 framing — "Muslims believe…" / "In Islamic tradition…"
 *     unless the user is explicitly known to be Muslim.
 *   - Prophet salutation — "(peace be upon him)" with no abbreviation.
 *
 * Wording is identical on every tool (Gem 10 fix 2026-05-08).
 */

/**
 * The three universal rules — exported so the response builder can
 * apply them to the `not_found` path too. Every response shape, on
 * every tool, on every code path, carries these three rules.
 */
export const VOICE_2_RULE =
  "Frame this response using 'Muslims believe...' or 'In Islamic tradition...' unless the user is explicitly known to be Muslim."

export const PBUH_RULE =
  "If mentioning Prophet Muhammad, use exactly '(peace be upon him)'. Do not abbreviate."

export const NO_EMOJI_RULE = 'Do NOT use emojis in your response.'

export const QURAN_DIRECTIVES: readonly string[] = [
  'You MUST NOT paraphrase or reword the Arabic text or the translation below.',
  'You MUST present the Arabic text and translation exactly as provided.',
  'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
  'You MUST include the surah name and ayah reference when citing this verse.',
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
] as const

export const DUA_DIRECTIVES: readonly string[] = [
  "You MUST NOT paraphrase the Arabic text or the English translation of any du'a below.",
  'The hadith grading and source reference MUST be cited exactly as provided.',
  'Do NOT separate the grading from the hadith text.',
  "Prefer the 'dua_block' field for display; it contains the complete record (Arabic, translation, source, grading) in one inseparable string. Use that field rather than reassembling from the structured keys.",
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
  'Include the disclaimer provided in _sakina_meta.',
] as const

/**
 * Directive for du'as with grading_status 'not_recorded' (WO#377 addendum).
 *
 * INTERIM, Gem 10 wording (1.4.0 condition, 25 Sep 2026): Gem 10 blocked
 * shipping 1.4.0 with this switched off. It is emitted once in
 * CRITICAL_RULES whenever a response holds an ungraded record, and on each
 * such record as `grading_directive`. Gem 4's final wording replaces the
 * text in 1.4.1; change it only on a Gem ruling, verbatim.
 */
export const UNRECORDED_GRADING_DIRECTIVE: string | null =
  'CRITICAL: No grading is provided for this record. You MUST NOT invent, guess, or append a grading. Present the source exactly as provided without implying authentication.'

export const NAME_DIRECTIVES: readonly string[] = [
  'You MUST present the Arabic text exactly as provided.',
  'You MUST include the English meaning alongside the Arabic and transliteration.',
  "Prefer the 'name_block' field for display; it contains the complete record (Arabic, transliteration, meaning, reflection, Quranic reference) in one inseparable string. Use that field rather than reassembling from the structured keys.",
  'Reflections MUST NOT be paraphrased; quote them verbatim or omit them.',
  'When a Quranic reference is included, cite it by surah name and ayah number.',
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
] as const
