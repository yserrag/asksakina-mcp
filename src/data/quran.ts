/**
 * Quran verse loader for the MCP server (WO#102).
 *
 * Sakina's main app does not bundle a verse-by-verse Quran corpus —
 * the `/api/quran/verse/[key]` route fetches from `alquran.cloud`
 * (Tanzil-derived). The MCP server matches that posture for v1: same
 * upstream, same translation editions, an in-process cache to absorb
 * repeated requests for the same verse.
 *
 * If the upstream is unreachable, the function throws so the tool
 * returns a structured error rather than a partial response.
 */

const API_BASE = 'https://api.alquran.cloud/v1'

// WO#245: English edition flipped off Saheeh International (a live SI
// violation on the most public surface) to the public-domain Pickthall
// edition (alquran.cloud id 85), matching the main app's WO#186 live verse
// route (src/app/api/quran/verse/[key]/route.ts).
const TRANSLATION_EDITIONS: Record<string, { id: string; label: string }> = {
  en: { id: 'en.pickthall', label: 'Pickthall' },
  ar: { id: 'en.pickthall', label: 'Pickthall' }, // AR users get original + Pickthall
}

// WO#385 item 4: Urdu and Indonesian verse translations are parked pending
// licences. Live on 25 Sep 2026, locale "ur" returned Arabic Quran text in
// `translation` labelled "Jalandhri (Urdu)" (upstream ur.jalandhri), and
// "id" served the Indonesian Ministry of Religious Affairs text. Both now
// get Pickthall English with an explicit note; never Arabic presented as a
// translation.
export const PARKED_TRANSLATION_LOCALES: Record<string, string> = {
  ur: 'Urdu',
  id: 'Indonesian',
}

export function parkedTranslationNote(language: string): string {
  return `A licensed ${language} translation is not yet available in AskSakina, so the English translation of the meaning (Pickthall) is provided instead.`
}

const SURAH_NAMES: Array<{ ar: string; en: string }> = [] // populated lazily

interface AlQuranAyahPayload {
  number: number
  text: string
  surah?: { number: number; name: string; englishName: string }
  numberInSurah?: number
}

export interface QuranVerseRecord {
  surah_number: number
  surah_name_arabic: string
  surah_name_english: string
  ayah: number
  arabic_text: string
  translation: string
  translation_source: string
  /** Language of `translation` (WO#385): always 'en' today. */
  translation_language: 'en'
  /** Present when the requested locale's translation is parked (ur, id). */
  translation_note?: string
}

const cache = new Map<string, { record: QuranVerseRecord; cachedAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function fetchQuranVerse(
  surah: number,
  ayah: number,
  locale: string,
): Promise<QuranVerseRecord> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new Error(`Invalid surah: ${surah}. Must be 1-114.`)
  }
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > 286) {
    throw new Error(`Invalid ayah: ${ayah}.`)
  }

  const editionEntry = TRANSLATION_EDITIONS[locale] ?? TRANSLATION_EDITIONS.en
  const parked = PARKED_TRANSLATION_LOCALES[locale]
  const withNote = (r: QuranVerseRecord): QuranVerseRecord =>
    parked ? { ...r, translation_note: parkedTranslationNote(parked) } : r
  const cacheKey = `${surah}:${ayah}:${editionEntry.id}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return withNote(cached.record)

  const url = `${API_BASE}/ayah/${surah}:${ayah}/editions/quran-uthmani,${editionEntry.id}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Quran upstream returned HTTP ${res.status}`)
  }
  const data = (await res.json()) as {
    data?: AlQuranAyahPayload[]
    code?: number
    status?: string
  }
  const arabicEntry = data.data?.[0]
  const translationEntry = data.data?.[1]
  if (!arabicEntry || !translationEntry) {
    throw new Error('Quran upstream returned an unexpected payload shape')
  }

  const record: QuranVerseRecord = {
    surah_number: surah,
    surah_name_arabic: arabicEntry.surah?.name ?? '',
    surah_name_english: arabicEntry.surah?.englishName ?? '',
    ayah,
    arabic_text: stripPrependedBasmala(surah, ayah, stripUnicodeProphetSalutation(arabicEntry.text)),
    translation: stripUnicodeProphetSalutation(translationEntry.text),
    translation_source: editionEntry.label,
    translation_language: 'en',
  }
  cache.set(cacheKey, { record, cachedAt: now })
  return withNote(record)
}

/**
 * WO#385, Gem 2 ruling (25 Sep 2026): the basmala is not part of ayah 1
 * except 1:1. The upstream quran-uthmani edition prefixes it to ayah 1 of
 * every surah except 1 and 9, in two byte forms. Both patterns below were
 * taken from the recorded upstream fixture
 * (evals/fixtures/alquran-ayah1, CI run 36184881437), not typed: 110 surahs
 * use A, 2 (95 and 97) use B. Each is the four words plus one U+0020.
 *
 * Note the upstream order in B is shadda BEFORE kasra (U+0628 U+0651
 * U+0650), and every recorded text writes shadda before the vowel mark
 * (not Unicode NFC). Matching is exact bytes, so the patterns must stay
 * byte copies of the upstream, never retyped or normalised.
 */
export const BASMALA_PREFIX_PLAIN = '\u0628\u0650\u0633\u0652\u0645\u0650\u0020\u0671\u0644\u0644\u0651\u064E\u0647\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650\u0020'
export const BASMALA_PREFIX_SHADDA = '\u0628\u0651\u0650\u0633\u0652\u0645\u0650\u0020\u0671\u0644\u0644\u0651\u064E\u0647\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650\u0020'

/** Gem 2 confirmed the removal (25 Sep 2026). */
export const STRIP_PREFIXED_BASMALA = true

// WO#385 (Architect): a mismatch is logged with a generic line, once per
// process, and never with a verse reference (README privacy section). The
// aggregate count is served by /stats as basmala_prefix_mismatch.
let basmalaPrefixMismatch = 0
let mismatchLogged = false

/** Aggregate count of ayah-1 texts that started with neither recorded prefix. */
export function getBasmalaPrefixMismatchCount(): number {
  return basmalaPrefixMismatch
}

/**
 * Ayah-text normalisation for get_quran_verse (WO#385).
 *
 * Always: a leading U+FEFF (byte-order mark, an invisible encoding artefact
 * the upstream sends on 1:1) is removed.
 *
 * Then, only for ayah 1 of surahs 2-8 and 10-114 (and only while
 * `stripBasmala` is true): if the text starts with exactly
 * BASMALA_PREFIX_PLAIN or BASMALA_PREFIX_SHADDA, that prefix is removed and
 * the rest is returned byte for byte. Nothing is split by word count. If an
 * ayah 1 starts with anything else, it is served unchanged and logged
 * with a generic line (no verse reference), once per process, and counted
 * for /stats. Surah 1 (1:1 is the basmala), surah 9 and every ayah 2+ bypass.
 */
export function stripPrependedBasmala(
  surah: number,
  ayah: number,
  text: string,
  stripBasmala: boolean = STRIP_PREFIXED_BASMALA,
): string {
  const t = text.startsWith('\uFEFF') ? text.slice(1) : text
  if (!stripBasmala || ayah !== 1 || surah < 2 || surah > 114 || surah === 9) return t
  if (t.startsWith(BASMALA_PREFIX_PLAIN)) return t.slice(BASMALA_PREFIX_PLAIN.length)
  if (t.startsWith(BASMALA_PREFIX_SHADDA)) return t.slice(BASMALA_PREFIX_SHADDA.length)
  basmalaPrefixMismatch += 1
  if (!mismatchLogged) {
    mismatchLogged = true
    console.warn('[quran] basmala prefix mismatch on an ayah 1; served unchanged (count in /stats)')
  }
  return t
}

/**
 * Strip the Unicode ﷺ symbol if it appears anywhere in source data.
 * Per Sakina content rules, all output uses the spelt-out form.
 */
function stripUnicodeProphetSalutation(input: string): string {
  return input.split('\u{FDFA}').join(' (peace be upon him)')
}

// Avoid lint noise about unused export.
export { SURAH_NAMES }
