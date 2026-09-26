/**
 * Tool: find_verses (WO#386).
 *
 * Topic lookup against AskSakina's thematic verse index, beside
 * get_quran_verse's reference lookup. Index-based only: no embedding and no
 * AI call. The Arabic is the bundled scripture-module text (getVerseArabic,
 * resolved at bundle time); the translation is the full-ayah Pickthall from
 * the same upstream get_quran_verse uses.
 *
 * Crisis detection runs first on the full raw query, exactly as in get_dua:
 * an abuse disclosure gets the crisis resource alone, and any other hard
 * crisis gets its block with no verses inferred from the message.
 */

import { z } from 'zod'
import { fetchQuranVerse, PARKED_TRANSLATION_LOCALES } from '../data/quran.js'
import { AVAILABLE_THEMES, matchThemes, versesForThemes, type ThematicVerseEntry } from '../data/thematic.js'
import { distressBlockFor, evaluateDistress } from '../safety/crisis-keywords.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'

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
    .enum(['en', 'id', 'ur', 'ar'])
    .optional()
    .describe('Selects the in-country crisis resources if one is needed; defaults to "en". Translations are Pickthall English.'),
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

  // Gem 3 ruling (WO#385), applied here as on get_dua: on an abuse
  // disclosure the crisis resource is the whole response.
  if (distress.level === 'hard' && distress.crisisType === 'abuse') {
    return buildResponse({
      contentType: 'crisis_resource_only',
      content: {
        requested: { query: input.query },
        withheld: 'verse_collection',
        reason: 'Quranic verses are not shown when a message discloses abuse. The crisis resource is the whole response.',
      },
      extras,
    })
  }
  // Any other hard crisis: the block, and no verse list inferred from the
  // words of a crisis message.
  if (distress.level === 'hard') {
    return noResults(input.query, 'No verses are matched from a message that carries a crisis keyword.', extras)
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
  const verses = await Promise.all(versesForThemes(themes, limit).map((v) => toFoundVerse(v, themes, locale)))
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
    // Same rule as get_quran_verse (WO#385 item 4).
    extraDirectives: parked
      ? [
          `The translations are English (Pickthall) because a licensed ${parked} translation is not yet available. Present them as English and state that note. You MUST NOT translate them into ${parked} yourself or present them as a ${parked} translation.`,
        ]
      : undefined,
  })
}
