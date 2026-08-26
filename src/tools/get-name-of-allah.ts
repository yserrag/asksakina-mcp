/**
 * Tool: get_name_of_allah (WO#102).
 *
 * Look up one of the 99 Names of Allah by number (1-99) or name string
 * (Latin transliteration, Arabic, or English meaning). Returns the
 * canonical record with locale-aware meaning + reflection.
 */

import { z } from 'zod'
import {
  findNameByString,
  getNameByNumber,
  type SupportedLocale,
} from '../data/names.js'
import { buildResponse, type SakinaResponse } from '../meta/response-builder.js'

export const getNameOfAllahShape = {
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Name input — Latin transliteration ('Al-Hakam'), Arabic ('الحكم'), or English meaning ('The Judge').",
    ),
  number: z
    .number()
    .int()
    .min(1)
    .max(99)
    .optional()
    .describe('Number of the Name in the canonical list, 1-99.'),
  locale: z
    .enum(['en', 'id', 'ur', 'ar'])
    .optional()
    .describe('Locale for meaning + reflection. Defaults to "en".'),
} as const

export const getNameOfAllahSchema = z
  .object(getNameOfAllahShape)
  .refine((v) => Boolean(v.name) || Number.isInteger(v.number), {
    message: 'Provide either `name` (string) or `number` (1-99).',
  })

export type GetNameOfAllahInput = z.infer<typeof getNameOfAllahSchema>

export const GET_NAME_TITLE = 'get_name_of_allah'
export const GET_NAME_DESCRIPTION =
  'Look up one of the 99 Names of Allah (al-Asma al-Husna) by number or name. Returns Arabic, transliteration, English meaning, spiritual reflection, and Quranic references.'

export async function getNameOfAllahHandler(
  input: GetNameOfAllahInput,
): Promise<SakinaResponse<unknown>> {
  const locale: SupportedLocale = input.locale ?? 'en'

  const record = input.number
    ? getNameByNumber(input.number, locale)
    : input.name
      ? findNameByString(input.name, locale)
      : null

  if (!record) {
    return buildResponse({
      contentType: 'not_found',
      content: {
        requested: { name: input.name, number: input.number, locale },
        reason:
          'No matching Name found. Provide a recognisable transliteration (e.g. "Al-Hakam"), the Arabic, the English meaning, or a number between 1 and 99.',
      },
    })
  }

  return buildResponse({
    contentType: 'name_of_allah',
    content: record,
  })
}
