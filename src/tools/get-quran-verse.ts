/**
 * Tool: get_quran_verse (WO#102).
 *
 * Verbatim Quranic verse lookup by surah:ayah. Returns the canonical
 * Sakina envelope with `_sakina_meta`, the Arabic + translation,
 * and presentation rules forbidding paraphrase.
 */

import { z } from 'zod'
import { fetchQuranVerse } from '../data/quran.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'

export const getQuranVerseShape = {
  surah: z.number().int().min(1).max(114).describe('Surah number, 1-114'),
  ayah: z
    .number()
    .int()
    .min(1)
    .max(286)
    .describe('Ayah (verse) number within the surah'),
  locale: z
    .enum(['en', 'id', 'ur', 'ar'])
    .optional()
    .describe('Translation locale; defaults to "en" (Pickthall).'),
} as const

export const getQuranVerseSchema = z.object(getQuranVerseShape)
export type GetQuranVerseInput = z.infer<typeof getQuranVerseSchema>

export const GET_QURAN_VERSE_TITLE = 'get_quran_verse'
export const GET_QURAN_VERSE_DESCRIPTION =
  'Retrieve a single Quranic verse by surah and ayah reference. Returns the verbatim Arabic text and a canonical translation along with citation metadata. Output must be presented exactly as returned; do not paraphrase the Arabic or the translation.'

export async function getQuranVerseHandler(
  input: GetQuranVerseInput,
): Promise<SakinaResponse<unknown>> {
  const locale = input.locale ?? 'en'
  try {
    const record = await fetchQuranVerse(input.surah, input.ayah, locale)
    return buildResponse({
      contentType: 'quran_verse',
      content: record,
    })
  } catch (err) {
    return buildResponse({
      contentType: 'not_found',
      content: {
        requested: { surah: input.surah, ayah: input.ayah, locale },
        reason:
          err instanceof Error
            ? err.message
            : 'Quran upstream is unreachable or returned no record.',
      },
    })
  }
}
