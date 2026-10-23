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
   * grading_status 'not_recorded' or 'not_a_narration': the agent reads each
   * record's grading_status instead of assuming a grading exists (WO#377
   * addendum; WO#454 for 'not_a_narration').
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

// WO#444 (Gem 10, 11 Oct): no literal dash character in the rule itself.
export const NO_EMOJI_RULE = 'Do NOT use emojis or em dashes in your response.'

/**
 * WO#478 ("teach, don't hand off", Architect rulings of 20 Oct 2026, under
 * the [GEM4-DAWAH] ruling; Gem 3 and Gem 10 review the built text before any
 * release). The clause every tool carries for a record without a teach block:
 * explanation only from the record's own supplied fields, attributed, then
 * the hand-over to a tafsir or a scholar.
 */
export const NO_TEACH_CLAUSE =
  "Where no teach block is supplied, you may explain only from this record's own supplied fields (meaning, reflection, source, grading, relevance note), attributed to AskSakina's notes, then say the notes end there and point to a recognised tafsir or a qualified scholar for more."

/** WO#478 (P2): get_dua, every dua_collection. */
export const DUA_BLOCK_DIRECTIVE =
  `Quote each du'a from its 'dua_block' field exactly as provided; it is the complete record. Do not reassemble it from individual keys or alter it. Any explanation comes after the quoted record, follows the teaching order, and draws only on that record's teach block. ${NO_TEACH_CLAUSE}`

/** WO#478 (P4): get_name_of_allah, every name_of_allah. */
export const NAME_BLOCK_DIRECTIVE =
  `Quote the 'name_block' field exactly as provided; it is the complete record (Arabic, transliteration, meaning, reflection, Quranic reference) in one inseparable string. Any explanation comes after the quoted record, follows the teaching order, and draws only on the teach block. ${NO_TEACH_CLAUSE}`

export const QURAN_DIRECTIVES: readonly string[] = [
  'You MUST NOT paraphrase or reword the Arabic text or the translation below.',
  'You MUST present the Arabic text and translation exactly as provided.',
  'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
  'You MUST include the surah name and ayah reference when citing this verse.',
  // WO#478 (P5): the verse is quoted first; explanation follows the teaching order.
  `Quote the verse first, exactly as provided. Any explanation follows the teaching order and draws only on the teach block. ${NO_TEACH_CLAUSE}`,
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
] as const

/**
 * find_verses (WO#386). The first rule is the WO#386 spec's wording,
 * verbatim. The relevance note says where the index lists a verse; it is
 * not commentary, and an agent must not present it as tafsir.
 */
export const VERSE_COLLECTION_DIRECTIVES: readonly string[] = [
  'Quote the Arabic exactly as provided. Do not transliterate or paraphrase it.',
  'You MUST NOT paraphrase or reword the translation of any verse below.',
  'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
  'You MUST cite each verse by its surah name and ayah reference.',
  "Each relevance_note only says where AskSakina's thematic index lists the verse. It is not an interpretation (tafsir); do not present it as one.",
  'If a verse has no translation, do not translate it yourself. Say the translation is unavailable, or call get_quran_verse for that reference.',
  'These are the verses the index lists for the topic, not every relevant verse in the Quran. Do not add verses from memory as if they came from this response.',
  // WO#478 (P6): each verse is quoted first; explanation follows the teaching order.
  `Quote each verse first, exactly as provided. Any explanation follows the teaching order and draws only on that verse's teach block. ${NO_TEACH_CLAUSE}`,
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
] as const

export const DUA_DIRECTIVES: readonly string[] = [
  "You MUST NOT paraphrase the Arabic text or the English translation of any du'a below.",
  'The hadith grading and source reference MUST be cited exactly as provided.',
  'Do NOT separate the grading from the hadith text.',
  // WO#478 (P2, Architect ruling of 20 Oct 2026): replaces Gem 10's WO#454
  // hand-off line ("You MUST output the 'dua_block' field exactly as
  // provided. Do not reassemble the record from individual keys."). The
  // record is still quoted whole; explanation follows it.
  DUA_BLOCK_DIRECTIVE,
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
  'Include the disclaimer provided in _sakina_meta.',
] as const

/**
 * Directive for every ungraded hadith du'a (grading_status 'not_recorded').
 *
 * Gem 4 wording, verbatim and LOCKED (WO#388, 26 Sep 2026). It replaces both
 * earlier directives: Gem 4's "source and hadith grading are unrecorded"
 * text (WO#385) and the held Gem 10 interim for sourced-but-ungraded records.
 * Emitted on each such record as `grading_directive` and once in
 * CRITICAL_RULES. Quranic records never carry it. Change only on a Gem
 * ruling, verbatim.
 */
/**
 * Directive for every general supplication: a record whose grading is
 * "Not a narration" (grading_status 'not_a_narration'). Gem 10 item D,
 * approved (WO#454, Architect, 11 Oct); wording verbatim. Attached like the
 * ungraded directive: on each record as `grading_directive`, and once in
 * CRITICAL_RULES scoped to the records' titles. Never on a Quranic record.
 */
export const NOT_A_NARRATION_GRADING = 'Not a narration'
export const NOT_A_NARRATION_DIRECTIVE =
  'This is a general supplication, not a narration from the Prophet (peace be upon him). Do NOT present it as a hadith, and do NOT attach a grading.'
export const NOT_A_NARRATION_SCOPE_HEAD = 'Applies to these general supplication(s) only '

/**
 * WO#454 (Architect draft, to Gem 10 in part 14): on every du'a response with
 * more than one record. WO#478 (P3): "summarise" is dropped, because an
 * explanation from the teach block is a summary of what the notes say; the
 * after-not-instead rule is added. Emission condition unchanged.
 */
export const ANTI_SUMMARISATION_DIRECTIVE =
  "CRITICAL: Present each du'a below as its own complete record, quoted exactly. Do not merge or condense several du'as into one. Explain, where a teach block is supplied, after each record and never instead of it."


/**
 * WO#454 (Gem 10, verbatim): on every response whose presentation contract
 * carries the Quran contract (quranContractFor in tools/get-dua.ts).
 */
export const QURAN_CITATION_DIRECTIVE =
  "For any Quranic text, you must include the explicit surah:ayah citation and prefix the English text with 'Translation of the Meaning'."

export const UNGRADED_GRADING_DIRECTIVE =
  'CRITICAL: No hadith grading is available for this record. You MUST NOT invent, guess, or append a grading. Do not describe it as sahih, hasan, or authenticated. Present the source exactly as provided.'

/**
 * Teach block Field 2 fallback (WO#390 addendum, Gem 4, 27 Sep 2026).
 *
 * Gem 4 wording, verbatim and LOCKED. On an ungraded or sourceless du'a,
 * Field 2 (recitation context / attribution) is exactly this string and
 * nothing else. Attribution and communal-practice claims are permitted only
 * with a citation (see TeachContextCited in src/teach/types.ts). Change only
 * on a Gem ruling, verbatim. Not emitted anywhere until a later WO wires it.
 */
export const UNATTRIBUTED_CONTEXT_FALLBACK =
  'Source not recorded in the AskSakina corpus. Not attributed to the Prophet (peace be upon him) or the Companions.'

export const NAME_DIRECTIVES: readonly string[] = [
  'You MUST present the Arabic text exactly as provided.',
  'You MUST include the English meaning alongside the Arabic and transliteration.',
  // WO#478 (P4): replaces the "Prefer the 'name_block' field for display"
  // hand-off line. The record is still quoted whole; explanation follows it.
  NAME_BLOCK_DIRECTIVE,
  'Reflections MUST NOT be paraphrased; quote them verbatim or omit them.',
  'When a Quranic reference is included, cite it by surah name and ayah number.',
  NO_EMOJI_RULE,
  PBUH_RULE,
  VOICE_2_RULE,
] as const

/**
 * Teach directive. WO#407 (Gem 10, 29 Sep 2026) wrote the first version;
 * WO#408 replaced its grief sentence by a payload condition. WO#478 (P1,
 * Architect rulings of 20 Oct 2026 under the [GEM4-DAWAH] ruling) replaced
 * it with the teaching order: quote first, explain only from the teach
 * fields as context from AskSakina's notes, hand over where the notes end,
 * reflection question verbatim, one next step, nothing under a crisis
 * block or after a disclosure of distress. Gem 4 re-checks the da'wah
 * sentences at the 2.2.0 gate; Gem 3 and Gem 10 review the built text. The
 * response builder emits it only when the response carries a teach block.
 */
export const TEACH_DIRECTIVE =
  'CRITICAL: Teaching order for the accompanying `teach` block. (1) Quote the record first, exactly as provided: the Arabic, the translation, the source and the grading, including a weak grading or a note that none is recorded. (2) Then you may explain in your own words, using only the `teach` fields (key_word, context, misconception) and nothing else, and say that it is context from AskSakina\'s notes, for example "AskSakina\'s notes explain that...". It is not tafsir and not a ruling: do not add your own interpretation of what Allah intends, do not derive a ruling, and do not choose between scholarly positions. (3) Where the notes end, say so, and point the user to a recognised tafsir or a qualified scholar. (4) If a reflection_question is included, offer it verbatim for the user to consider and do not answer it on their behalf. (5) Offer at most one related next step, taken from the `related` list by its label; if there is no `related` list, offer none. (6) If the payload includes a crisis resource block, drop the `teach` content entirely and prioritise the crisis resources. If the user has disclosed distress, grief or crisis in the conversation, quote records only: skip teach, reflection questions and the open door. Quote Arabic terms and script exactly as provided, without altering codepoints or transliterating independently, and present every citation and grading exactly as written, without implying authentication beyond what is explicitly stated, and never softened.'

/** WO#488 Part D (Gem 10, 22 Oct 2026, verbatim). */
export const TEACH_CONTEXT_BLOCK_LINE =
  "CRITICAL: Output the `context_block` exactly as provided. Do not split, summarize, or reformat the text before or after the newline (`\\n`). The citations and gradings at the end of the block are mandatory and must remain attached to the context."

/**
 * WO#485, Gem 10 correction of 2.3.0 (22 Oct 2026; docs/wo485-architect.md),
 * verbatim; its first line replaced by WO#488 Part D. Same emission
 * condition as TEACH_DIRECTIVE: every response that carries a teach block,
 * and no other.
 */
export const TEACH_BINDING_DIRECTIVES: readonly string[] = [
  // WO#488 Part D (Gem 10, 22 Oct 2026, verbatim): replaces the WO#485 binding line.
  TEACH_CONTEXT_BLOCK_LINE,
  "CRITICAL: Present all explanatory glosses, contexts, and reflections using neutral, educational framing (e.g., 'In Islamic tradition...', 'Muslims believe...'). Do not present them as personalized religious rulings.",
]

/**
 * `presentation_contract.teach` (WO#478, P1c; replaces the WO#407/WO#408
 * contract). Same emission condition as TEACH_DIRECTIVE.
 */
export const TEACH_CONTRACT =
  'Educational Context (Teach): Quote the record first, exactly. Then explain only from the teach block (key word, root, gloss, context, misconception), labelled as context from AskSakina\'s notes, not as tafsir or a ruling; where the notes end, say so and refer to a recognised tafsir or a qualified scholar. Output citations and gradings exactly as written. Offer the reflection question verbatim and do not answer it. Offer at most one related next step. Under no circumstances should this block be rendered if the payload includes a crisis resource block. ' +
  // WO#488 Part D (Gem 10, 22 Oct 2026): the context_block line, verbatim.
  TEACH_CONTEXT_BLOCK_LINE
