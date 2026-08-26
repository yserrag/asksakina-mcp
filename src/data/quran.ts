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
  ur: { id: 'ur.jalandhri', label: 'Jalandhri (Urdu)' },
  id: { id: 'id.indonesian', label: 'Indonesian Ministry of Religious Affairs' },
  ar: { id: 'en.pickthall', label: 'Pickthall' }, // AR users get original + Pickthall
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
  const cacheKey = `${surah}:${ayah}:${editionEntry.id}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.record

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
    arabic_text: stripUnicodeProphetSalutation(arabicEntry.text),
    translation: stripUnicodeProphetSalutation(translationEntry.text),
    translation_source: editionEntry.label,
  }
  cache.set(cacheKey, { record, cachedAt: now })
  return record
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
