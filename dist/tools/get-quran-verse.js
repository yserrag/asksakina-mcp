import { z } from 'zod';
import { fetchQuranVerse, PARKED_TRANSLATION_LOCALES } from '../data/quran.js';
import { buildResponse } from '../meta/response-builder.js';
import { audienceArg } from '../teach/audience.js';
import { withTeach } from '../teach/attach.js';
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
    audience: audienceArg,
};
export const getQuranVerseSchema = z.object(getQuranVerseShape);
export const GET_QURAN_VERSE_TITLE = 'get_quran_verse';
export const GET_QURAN_VERSE_DESCRIPTION = 'Returns one Quran verse by surah and ayah number: Tanzil Uthmani Arabic and Pickthall English, with citation. Quote the Arabic exactly; do not paraphrase either text.';
export async function getQuranVerseHandler(input) {
    const locale = input.locale ?? 'en';
    try {
        const record = await fetchQuranVerse(input.surah, input.ayah, locale);
        const parked = PARKED_TRANSLATION_LOCALES[locale];
        return buildResponse({
            contentType: 'quran_verse',
            content: withTeach(record, `verse:${input.surah}:${input.ayah}`, { audience: input.audience, locale }),
            extraDirectives: parked
                ? [
                    `The translation is English (Pickthall) because a licensed ${parked} translation is not yet available. Present it as English and state that note. You MUST NOT translate it into ${parked} yourself or present it as a ${parked} translation.`,
                ]
                : undefined,
        });
    }
    catch (err) {
        return buildResponse({
            contentType: 'not_found',
            content: {
                requested: { surah: input.surah, ayah: input.ayah, locale },
                reason: err instanceof Error
                    ? err.message
                    : 'Quran upstream is unreachable or returned no record.',
            },
        });
    }
}
//# sourceMappingURL=get-quran-verse.js.map