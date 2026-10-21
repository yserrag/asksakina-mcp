/**
 * Tool: find_verses (WO#386).
 *
 * Topic lookup against AskSakina's thematic verse index, beside
 * get_quran_verse's reference lookup. Index-based only: no embedding and no
 * AI call. The Arabic is the bundled scripture-module text (getVerseArabic,
 * resolved at bundle time); the translation is the full-ayah Pickthall from
 * the same upstream get_quran_verse uses.
 *
 * Crisis detection runs first on the full raw query, with get_dua's detector.
 * On ANY hard crisis (abuse or self-harm) the crisis resource is the whole
 * response: no verse text, reference, translation or theme metadata (Gem 3,
 * WO#388). Nothing is looked up before that check.
 */

import { z } from 'zod'
import { fetchQuranVerse, PARKED_TRANSLATION_LOCALES } from '../data/quran.js'
import { AVAILABLE_THEMES, matchThemes, versesForThemes, type ThematicVerseEntry } from '../data/thematic.js'
import { distressBlockFor, evaluateDistress } from '../safety/crisis-keywords.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'
import { audienceArg } from '../teach/audience.js'
import { withTeach } from '../teach/attach.js'

export const FIND_VERSES_DEFAULT_LIMIT = 5
export const FIND_VERSES_MAX_LIMIT = 10

export const findVersesShape = {
  query: z
    .string()
    .min(2)
    .describe("Topic or keyword, e.g. 'patience', 'grief', 'gratitude', 'hope'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FIND_VERSES_MAX_LIMIT)
    .optional()
    .describe(`Number of verses to return; default ${FIND_VERSES_DEFAULT_LIMIT}, max ${FIND_VERSES_MAX_LIMIT}.`),
  locale: z
    .enum(['en', 'id', 'ur', 'ar', 'tr'])
    .optional()
    .describe('Selects the in-country crisis resources if one is needed; defaults to "en". Translations are Pickthall English.'),
  audience: audienceArg,
} as const

export const findVersesSchema = z.object(findVersesShape)
export type FindVersesInput = z.infer<typeof findVersesSchema>

export const FIND_VERSES_TITLE = 'find_verses'
export const FIND_VERSES_DESCRIPTION =
  "Searches AskSakina's thematic index for Quran verses by topic keyword. Returns reference, Tanzil Arabic and Pickthall English. Quote the Arabic exactly."

export interface FoundVerse {
  reference: string
  surah_name_english?: string
  surah_name_arabic?: string
  arabic: string
  translation: string | null
  translation_source: 'Pickthall'
  translation_note?: string
  relevance_note: string
}

function relevanceNote(themes: readonly string[]): string {
  const list = themes.map((t) => `"${t}"`).join(', ')
  return `Listed under ${list} in AskSakina's thematic verse index.`
}

async function toFoundVerse(v: ThematicVerseEntry, matched: readonly string[], locale: string): Promise<FoundVerse> {
  const base = {
    reference: v.ref,
    arabic: v.arabic,
    translation_source: 'Pickthall' as const,
    relevance_note: relevanceNote(v.themes.filter((t) => matched.includes(t))),
  }
  try {
    // Only the translation and surah names are taken from the upstream.
    // The Arabic stays the scripture module's bytes.
    const r = await fetchQuranVerse(v.surah, v.ayah, locale)
    return {
      reference: base.reference,
      surah_name_english: r.surah_name_english,
      surah_name_arabic: r.surah_name_arabic,
      arabic: base.arabic,
      translation: r.translation,
      translation_source: base.translation_source,
      ...(r.translation_note ? { translation_note: r.translation_note } : {}),
      relevance_note: base.relevance_note,
    }
  } catch {
    return {
      ...base,
      translation: null,
      translation_note: `The translation is temporarily unavailable. Call get_quran_verse for ${v.ref}.`,
    }
  }
}

function noResults(query: string, reason: string, extras?: Record<string, unknown>): SakinaResponse<unknown> {
  return buildResponse({
    contentType: 'not_found',
    content: {
      requested: { query },
      verses: [],
      total_results: 0,
      no_results: true,
      reason,
      available_themes: AVAILABLE_THEMES,
    },
    extras,
  })
}

export async function findVersesHandler(input: FindVersesInput): Promise<SakinaResponse<unknown>> {
  const locale = input.locale ?? 'en'
  const limit = Math.min(Math.max(input.limit ?? FIND_VERSES_DEFAULT_LIMIT, 1), FIND_VERSES_MAX_LIMIT)

  const distress = evaluateDistress(input.query)
  const block = distressBlockFor(distress, locale)
  const extras = block ? { crisis_resource: block } : undefined

  // Gem 3 ruling (WO#385 for abuse, WO#388 for every hard crisis): the
  // crisis resource is the whole response. This returns before matchThemes,
  // so no verse, theme or index metadata exists yet to leak.
  if (distress.level === 'hard') {
    return buildResponse({
      contentType: 'crisis_resource_only',
      content: {
        requested: { query: input.query },
        withheld: 'verse_collection',
        reason:
          distress.crisisType === 'abuse'
            ? 'Quranic verses are not shown when a message discloses abuse. The crisis resource is the whole response.'
            : 'Quranic verses are not shown when a message carries a crisis keyword. The crisis resource is the whole response.',
      },
      extras,
    })
  }

  const matches = matchThemes(input.query)
  if (!matches.length) {
    return noResults(
      input.query,
      `No theme in the index matched the query. Try one of the available themes.`,
      extras,
    )
  }
  const themes = matches.map((m) => m.theme)
  const found = await Promise.all(versesForThemes(themes, limit).map((v) => toFoundVerse(v, themes, locale)))
  // WO#405: teach per verse; WO#478: whenever an entry exists, audience or
  // not. WO#407 (Gem 10): nothing attaches on the grief theme or whenever a
  // support block is attached.
  const withhold = Boolean(extras) || themes.includes('grief')
  // (withholdTeach below cuts the no-teach clause under the same condition, Gem 3.)
  const verses = found.map((v) =>
    withTeach(v, `verse:${v.reference}` as `verse:${number}:${number}`, { audience: input.audience, locale, withhold }),
  )
  const parked = PARKED_TRANSLATION_LOCALES[locale]

  return buildResponse({
    contentType: 'verse_collection',
    content: {
      query: input.query,
      matched_themes: matches,
      verses,
      total_results: verses.length,
      no_results: false,
    },
    extras,
    withholdTeach: withhold,
    // Same rule as get_quran_verse (WO#385 item 4).
    extraDirectives: parked
      ? [
          `The translations are English (Pickthall) because a licensed ${parked} translation is not yet available. Present them as English and state that note. You MUST NOT translate them into ${parked} yourself or present them as a ${parked} translation.`,
        ]
      : undefined,
  })
}
