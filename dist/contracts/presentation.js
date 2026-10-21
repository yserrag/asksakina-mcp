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
export const NO_TEACH_CLAUSE = "Where no teach block is supplied, you may explain only from this record's own supplied fields (meaning, reflection, source, grading, relevance note), attributed to AskSakina's notes, then say the notes end there and point to a recognised tafsir or a qualified scholar for more.";
export const DUA_BLOCK_DIRECTIVE = `Quote each du'a from its 'dua_block' field exactly as provided; it is the complete record. Do not reassemble it from individual keys or alter it. Any explanation comes after the quoted record, follows the teaching order, and draws only on that record's teach block. ${NO_TEACH_CLAUSE}`;
export const NAME_BLOCK_DIRECTIVE = `Quote the 'name_block' field exactly as provided; it is the complete record (Arabic, transliteration, meaning, reflection, Quranic reference) in one inseparable string. Any explanation comes after the quoted record, follows the teaching order, and draws only on the teach block. ${NO_TEACH_CLAUSE}`;
export const QURAN_DIRECTIVES = [
    'You MUST NOT paraphrase or reword the Arabic text or the translation below.',
    'You MUST present the Arabic text and translation exactly as provided.',
    'The translation is a "Translation of the Meaning"; label it as such if presenting to users.',
    'You MUST include the surah name and ayah reference when citing this verse.',
    `Quote the verse first, exactly as provided. Any explanation follows the teaching order and draws only on the teach block. ${NO_TEACH_CLAUSE}`,
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
    `Quote each verse first, exactly as provided. Any explanation follows the teaching order and draws only on that verse's teach block. ${NO_TEACH_CLAUSE}`,
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
];
export const DUA_DIRECTIVES = [
    "You MUST NOT paraphrase the Arabic text or the English translation of any du'a below.",
    'The hadith grading and source reference MUST be cited exactly as provided.',
    'Do NOT separate the grading from the hadith text.',
    DUA_BLOCK_DIRECTIVE,
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
    'Include the disclaimer provided in _sakina_meta.',
];
export const NOT_A_NARRATION_GRADING = 'Not a narration';
export const NOT_A_NARRATION_DIRECTIVE = 'This is a general supplication, not a narration from the Prophet (peace be upon him). Do NOT present it as a hadith, and do NOT attach a grading.';
export const NOT_A_NARRATION_SCOPE_HEAD = 'Applies to these general supplication(s) only ';
export const ANTI_SUMMARISATION_DIRECTIVE = "CRITICAL: Present each du'a below as its own complete record, quoted exactly. Do not merge or condense several du'as into one. Explain, where a teach block is supplied, after each record and never instead of it.";
export const QURAN_CITATION_DIRECTIVE = "For any Quranic text, you must include the explicit surah:ayah citation and prefix the English text with 'Translation of the Meaning'.";
export const UNGRADED_GRADING_DIRECTIVE = 'CRITICAL: No hadith grading is available for this record. You MUST NOT invent, guess, or append a grading. Do not describe it as sahih, hasan, or authenticated. Present the source exactly as provided.';
export const UNATTRIBUTED_CONTEXT_FALLBACK = 'Source not recorded in the AskSakina corpus. Not attributed to the Prophet (peace be upon him) or the Companions.';
export const NAME_DIRECTIVES = [
    'You MUST present the Arabic text exactly as provided.',
    'You MUST include the English meaning alongside the Arabic and transliteration.',
    NAME_BLOCK_DIRECTIVE,
    'Reflections MUST NOT be paraphrased; quote them verbatim or omit them.',
    'When a Quranic reference is included, cite it by surah name and ayah number.',
    NO_EMOJI_RULE,
    PBUH_RULE,
    VOICE_2_RULE,
];
export const TEACH_DIRECTIVE = 'CRITICAL: Teaching order for the accompanying `teach` block. (1) Quote the record first, exactly as provided: the Arabic, the translation, the source and the grading, including a weak grading or a note that none is recorded. (2) Then you may explain in your own words, using only the `teach` fields (key_word, context, misconception) and nothing else, and say that it is context from AskSakina\'s notes, for example "AskSakina\'s notes explain that...". It is not tafsir and not a ruling: do not add your own interpretation of what Allah intends, do not derive a ruling, and do not choose between scholarly positions. (3) Where the notes end, say so, and point the user to a recognised tafsir or a qualified scholar. (4) If a reflection_question is included, offer it verbatim for the user to consider and do not answer it on their behalf. (5) Offer at most one related next step, taken from the `related` list by its label; if there is no `related` list, offer none. (6) If the payload includes a crisis resource block, drop the `teach` content entirely and prioritise the crisis resources. If the user has disclosed distress, grief or crisis in the conversation, quote records only: skip teach, reflection questions and the open door. Quote Arabic terms and script exactly as provided, without altering codepoints or transliterating independently, and present every citation and grading exactly as written, without implying authentication beyond what is explicitly stated, and never softened.';
export const TEACH_CONTRACT = 'Educational Context (Teach): Quote the record first, exactly. Then explain only from the teach block (key word, root, gloss, context, misconception), labelled as context from AskSakina\'s notes, not as tafsir or a ruling; where the notes end, say so and refer to a recognised tafsir or a qualified scholar. Output citations and gradings exactly as written. Offer the reflection question verbatim and do not answer it. Offer at most one related next step. Under no circumstances should this block be rendered if the payload includes a crisis resource block.';
//# sourceMappingURL=presentation.js.map