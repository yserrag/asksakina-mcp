export const QURAN_CONTRACT = {
    paraphrase_allowed: false,
    require_surah_ayah_citation: true,
    translation_label_required: true,
    translation_label: 'Translation of the Meaning',
};
export const HADITH_CONTRACT = {
    paraphrase_allowed: false,
    require_source_collection: true,
    require_grading: true,
    prefer_dua_block: true,
};
export const NAME_OF_ALLAH_CONTRACT = {
    arabic_paraphrase_allowed: false,
    english_meaning_required: true,
};
export const REFLECTION_CONTRACT = {
    paraphrase_allowed: false,
    require_quranic_citation: true,
};
export const VOICE_2_RULE = "Frame this response using 'Muslims believe...' or 'In Islamic tradition...' unless the user is explicitly known to be Muslim.";
export const PBUH_RULE = "If mentioning Prophet Muhammad, use exactly '(peace be upon him)'. Do not abbreviate.";
export const NO_EMOJI_RULE = 'Do NOT use emojis or em dashes in your response.';
export const QURAN_DIRECTIVES = [
    'You MUST NOT paraphrase or reword the Arabic text or the translation below.',
    'You MUST present the Arabic text and translation exactly as provided.',
    'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
    'You MUST include the surah name and ayah reference when citing this verse.',
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
];
export const VERSE_COLLECTION_DIRECTIVES = [
    'Quote the Arabic exactly as provided. Do not transliterate or paraphrase it.',
    'You MUST NOT paraphrase or reword the translation of any verse below.',
    'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
    'You MUST cite each verse by its surah name and ayah reference.',
    "Each relevance_note only says where AskSakina's thematic index lists the verse. It is not an interpretation (tafsir); do not present it as one.",
    'If a verse has no translation, do not translate it yourself. Say the translation is unavailable, or call get_quran_verse for that reference.',
    'These are the verses the index lists for the topic, not every relevant verse in the Quran. Do not add verses from memory as if they came from this response.',
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
];
export const DUA_DIRECTIVES = [
    "You MUST NOT paraphrase the Arabic text or the English translation of any du'a below.",
    'The hadith grading and source reference MUST be cited exactly as provided.',
    'Do NOT separate the grading from the hadith text.',
    "You MUST output the 'dua_block' field exactly as provided. Do not reassemble the record from individual keys.",
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
    'Include the disclaimer provided in _sakina_meta.',
];
export const NOT_A_NARRATION_GRADING = 'Not a narration';
export const NOT_A_NARRATION_DIRECTIVE = 'This is a general supplication, not a narration from the Prophet (peace be upon him). Do NOT present it as a hadith, and do NOT attach a grading.';
export const NOT_A_NARRATION_SCOPE_HEAD = 'Applies to these general supplication(s) only ';
export const ANTI_SUMMARISATION_DIRECTIVE = "CRITICAL: Present each du'a below as its own complete record. Do not merge, summarise, or condense several du'as into one.";
export const QURAN_CITATION_DIRECTIVE = "For any Quranic text, you must include the explicit surah:ayah citation and prefix the English text with 'Translation of the Meaning'.";
export const UNGRADED_GRADING_DIRECTIVE = 'CRITICAL: No hadith grading is available for this record. You MUST NOT invent, guess, or append a grading. Do not describe it as sahih, hasan, or authenticated. Present the source exactly as provided.';
export const UNATTRIBUTED_CONTEXT_FALLBACK = 'Source not recorded in the AskSakina corpus. Not attributed to the Prophet (peace be upon him) or the Companions.';
export const NAME_DIRECTIVES = [
    'You MUST present the Arabic text exactly as provided.',
    'You MUST include the English meaning alongside the Arabic and transliteration.',
    "Prefer the 'name_block' field for display; it contains the complete record (Arabic, transliteration, meaning, reflection, Quranic reference) in one inseparable string. Use that field rather than reassembling from the structured keys.",
    'Reflections MUST NOT be paraphrased; quote them verbatim or omit them.',
    'When a Quranic reference is included, cite it by surah name and ayah number.',
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
];
export const TEACH_DIRECTIVE = 'CRITICAL: The accompanying `teach` block is for educational context only and MUST NOT be framed, summarized, or presented as a fatwa or religious ruling. You MUST quote the Arabic terms and script exactly as provided without paraphrasing, altering codepoints, or transliterating independently. If citations and gradings are provided, present them exactly as written without implying authentication beyond what is explicitly stated. If the payload includes a crisis resource block, you MUST silently drop the `teach` content entirely and prioritize the crisis resources. If a reflection question is included, offer it verbatim for the user to consider, but DO NOT answer it on their behalf.';
export const TEACH_CONTRACT = 'Educational Context (Teach): Present the key word, root, and gloss exactly as provided to explain the linguistic context. Keep the reflection question completely open-ended; output it verbatim and wait for the user to respond. Do not synthesize the citations and gradings into a general statement; output the source strings exactly. Under no circumstances should this block be rendered if the payload includes a crisis resource block.';
//# sourceMappingURL=presentation.js.map