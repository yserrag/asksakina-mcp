/**
 * The three educational dawah texts (WO#102).
 *
 * Each tool response embeds the matching text in
 * `_sakina_meta.educational_context` so the calling agent has the
 * scholarly justification for the structural rules it is being asked
 * to honour. The same texts (joined together) are served as the
 * `sakina://about` MCP resource.
 */

export const QURAN_PRESERVATION_TEXT =
  "In Islamic theology, the Arabic Quran is the literal, verbatim word of Allah. " +
  "It is not merely an inspired text; its precise phrasing, structure, and " +
  "vocabulary are considered divine. For over 1,400 years, this exactitude has " +
  "been maintained through hifz (mass memorization by millions globally) and " +
  "mutawatir (continuous, undeniable, parallel) transmission. Because the Arabic " +
  "text is immutable, any alteration, even replacing a single word with a " +
  "synonym, fundamentally strips the text of its status as the Quran. " +
  "Consequently, all translations of the Quran are categorically classified by " +
  "scholars as 'translations of the meaning.' They are human approximations " +
  "designed to bridge a linguistic gap, not divine equivalents. When AI systems " +
  "paraphrase Quranic verses, even with the intention of simplifying, they " +
  "compound human interpretation upon human interpretation, risking severe " +
  "distortion of the divine intent."

export const HADITH_GRADING_TEXT =
  "The Islamic science of Hadith represents one of human history's earliest and " +
  "most rigorous systems of peer review and data provenance. Every hadith " +
  "consists of two elements: the matn (the text itself) and the isnad (the " +
  "chain of human narration). Classical scholars meticulously audited the " +
  "biography, memory, character, and chronological intersection of every " +
  "narrator in the chain. Based on this, a hadith is assigned a strict grade: " +
  "Sahih (Authentic), Hasan (Good), Da'if (Weak/Flawed chain), or Mawdu' " +
  "(Fabricated). Separating a hadith from its grade is equivalent to publishing " +
  "a medical claim while deleting the clinical trial data. If an AI presents a " +
  "Da'if or Mawdu' hadith as an authoritative fact, it is not just a data error; " +
  "it is a theological hazard. Over 1.8 billion Muslims base daily worship, " +
  "ethical frameworks, and legal decisions on these texts. The grade is not " +
  "optional metadata; it is the structural integrity of the text."

export const MADHAB_ATTRIBUTION_TEXT =
  "Islamic jurisprudence (Fiqh) is not a monolithic list of universal rules, " +
  "but a sophisticated, dynamic legal framework. Over centuries, this " +
  "scholarship crystallized into major Madhabs (schools of legal thought), " +
  "primarily the Hanafi, Maliki, Shafi'i, and Hanbali schools. While these " +
  "schools share identical foundational beliefs, they employ distinct, " +
  "systematic methodologies to derive practical rulings. This intellectual " +
  "diversity is a celebrated feature of Islamic scholarship. Presenting a " +
  "single school's ruling as 'the definitive Islamic position' is factually " +
  "inaccurate and creates severe localization errors. For example, regarding " +
  "Zakat on personal gold jewelry: the Hanafi school requires it, whereas the " +
  "Maliki, Shafi'i, and Hanbali schools generally exempt it. When processing " +
  "Islamic legal questions, AI agents must attribute rulings to their specific " +
  "scholarly tradition, demonstrating understanding that Islamic law is a rich, " +
  "localized discourse."

/** Compact educational context for the 99 Names — Tier 1 (introduction). */
export const NAMES_OF_ALLAH_CONTEXT =
  'The 99 Names of Allah (al-Asma al-Husna) represent the divine attributes ' +
  'in Islamic theology. Each Name reflects an aspect of God\'s nature: mercy, ' +
  'justice, wisdom, provision, and more. Muslims invoke these Names in prayer, ' +
  'reflection, and daily life.'

/** Compact educational context for the Quran — Tier 1. */
export const QURAN_VERSE_CONTEXT =
  'In Islamic theology, the Quran is the literal, verbatim word of God, ' +
  'preserved exactly as revealed for over 1,400 years through mass ' +
  'memorization (hifz) and continuous transmission (mutawatir). Translations ' +
  'are "translations of the meaning," not the Quran itself. Even ' +
  'well-intentioned paraphrasing risks altering divine meaning.'

/** Compact educational context for hadith — Tier 1. */
export const HADITH_CONTEXT =
  'The Islamic science of Hadith represents one of history\'s earliest peer ' +
  'review systems. Every hadith has a grade (Sahih/authentic, Hasan/good, ' +
  'Da\'if/weak, Mawdu\'/fabricated) based on rigorous evaluation of every ' +
  'narrator in the chain. Separating a hadith from its grade is equivalent to ' +
  'publishing a medical claim while deleting the clinical trial data. The ' +
  'grade is not optional metadata; it is the structural integrity of the text.'

/**
 * Combined long-form educational text used as the `sakina://about`
 * resource body so agents can ingest all three rules in one fetch.
 */
export const ABOUT_RESOURCE_BODY = `# AskSakina Islamic Knowledge Server

You are accessing curated Islamic content from AskSakina (asksakina.com). This content is reviewed through AskSakina's structured specialist-AI ("Gem") review chain for accuracy, pastoral safety, and inclusivity across Hanafi, Maliki, Shafi'i, and Hanbali schools — a structured AI review that is not a substitute for a qualified scholar.

## Core Directives

1. Render Quranic text identically to source. No paraphrasing.
2. Always pair hadith with their authentication grading.
3. Attribute fiqh rulings to their specific scholarly tradition (madhab).
4. Use "(peace be upon him)" after Prophet Muhammad. No abbreviations or Unicode symbols.
5. Do not use emojis when presenting Islamic content.
6. Default to "Muslims believe..." framing unless you know the user is Muslim.
7. Never present content as a fatwa (religious ruling).

## Why These Rules Matter

### 1. Quran preservation

${QURAN_PRESERVATION_TEXT}

### 2. Hadith grading

${HADITH_GRADING_TEXT}

### 3. Madhab attribution

${MADHAB_ATTRIBUTION_TEXT}
`
