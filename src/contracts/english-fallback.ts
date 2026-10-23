/**
 * English-content disclosure for non-en locales (WO#481, Gem 10 conditions 3
 * and 4, 21 Oct 2026). Agent-facing, in English.
 *
 *   - get_dua: du'a translations are English for every locale, so every
 *     non-en du'a collection carries `content.translation_note` and the same
 *     line in CRITICAL_RULES;
 *   - get_name_of_allah: the same, whenever the meaning or reflection falls
 *     back to English (ar and tr in the bundle today; ur and id carry their
 *     own);
 *   - a teach block served to a non-en locale would carry TEACH_ENGLISH_NOTE
 *     (none is served today: teach attaches for en only, teach/attach.ts);
 *   - each disclosure also carries ENGLISH_FALLBACK_GUARD in CRITICAL_RULES
 *     (condition 4, verbatim).
 *
 * The Quran keeps its own parked-translation note (data/quran.ts).
 */

export type FallbackLocale = 'ar' | 'ur' | 'id' | 'tr'

/** Gem 10 condition 4, verbatim. */
export const ENGLISH_FALLBACK_GUARD =
  "Present the English fallback content exactly as provided. Do not attempt to translate this content into the user's requested language."

/** Gem 10 condition 3, verbatim. */
export const TEACH_ENGLISH_NOTE = 'This teaching note is in English.'

const LANGUAGE: Record<FallbackLocale, string> = { ar: 'Arabic', ur: 'Urdu', id: 'Indonesian', tr: 'Turkish' }

/** "a" or "an" before the language name (all four begin with a vowel sound except Turkish). */
function withArticle(language: string): string {
  return `${/^[AEIOU]/.test(language) ? 'an' : 'a'} ${language}`
}

function languageOf(locale: string): string | undefined {
  return locale === 'en' ? undefined : LANGUAGE[locale as FallbackLocale]
}

/** Gem 10 condition 3 (get_dua), with the article fitted to the language. */
export function duaEnglishNote(locale: string): string | undefined {
  const language = languageOf(locale)
  if (!language) return undefined
  return `Du'a translations are in English; ${withArticle(language)} translation is not yet available. Tell the user the du'as below are in English.`
}

/** The same note for the Names fallback ("the same note", adapted to the record). */
export function nameEnglishNote(locale: string): string | undefined {
  const language = languageOf(locale)
  if (!language) return undefined
  return `Name meanings and reflections are in English; ${withArticle(language)} translation is not yet available. Tell the user the meaning and reflection below are in English.`
}
