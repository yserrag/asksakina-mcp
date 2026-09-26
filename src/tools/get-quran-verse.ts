/**
 * Tool: get_quran_verse (WO#102).
 *
 * Verbatim Quranic verse lookup by surah:ayah. Returns the canonical
 * Sakina envelope with `_sakina_meta`, the Arabic + translation,
 * and presentation rules forbidding paraphrase.
 */

import { z } from 'zod'
import { fetchQuranVerse, PARKED_TRANSLATION_LOCALES } from '../data/quran.js'
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
    .describe('Translation locale; defaults to "en" (Pickthall). Urdu and Indonesian translations are not yet available: "ur" and "id" return Pickthall English with a note.'),
} as const

export const getQuranVerseSchema = z.object(getQuranVerseShape)
export type GetQuranVerseInput = z.infer<typeof getQuranVerseSchema>

export const GET_QURAN_VERSE_TITLE = 'get_quran_verse'
// WO#386 item B: under 200 characters (directory listings), agent-instructing.
export const GET_QURAN_VERSE_DESCRIPTION =
  'Returns one Quran verse by surah and ayah number: Tanzil Uthmani Arabic and Pickthall English, with citation. Quote the Arabic exactly; do not paraphrase either text.'

export async function getQuranVerseHandler(
  input: GetQuranVerseInput,
): Promise<SakinaResponse<unknown>> {
  const locale = input.locale ?? 'en'
  try {
    const record = await fetchQuranVerse(input.surah, input.ayah, locale)
    const parked = PARKED_TRANSLATION_LOCALES[locale]
    return buildResponse({
      contentType: 'quran_verse',
      content: record,
      // WO#385 item 4: the agent must not supply its own Urdu/Indonesian
      // rendering of the meaning in place of the parked translation.
      extraDirectives: parked
        ? [
            `The translation is English (Pickthall) because a licensed ${parked} translation is not yet available. Present it as English and state that note. You MUST NOT translate it into ${parked} yourself or present it as a ${parked} translation.`,
          ]
        : undefined,
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
