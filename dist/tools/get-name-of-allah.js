import { z } from 'zod';
import { findNameByString, getNameByNumber, } from '../data/names.js';
import { buildResponse } from '../meta/response-builder.js';
import { distressBlockFor, evaluateDistress } from '../safety/crisis-keywords.js';
import { audienceArg } from '../teach/audience.js';
import { withTeach } from '../teach/attach.js';
export const getNameOfAllahShape = {
    name: z
        .string()
        .min(1)
        .optional()
        .describe("Name input — Latin transliteration ('Al-Hakam'), Arabic ('الحكم'), or English meaning ('The Judge')."),
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
    audience: audienceArg,
};
export const getNameOfAllahSchema = z
    .object(getNameOfAllahShape)
    .refine((v) => Boolean(v.name) || Number.isInteger(v.number), {
    message: 'Provide either `name` (string) or `number` (1-99).',
});
export const GET_NAME_TITLE = 'get_name_of_allah';
export const GET_NAME_DESCRIPTION = 'Returns one of the 99 Names of Allah by number (1-99) or by name: Arabic, transliteration, meaning, reflection and Quranic references. Quote the Arabic exactly.';
export async function getNameOfAllahHandler(input) {
    const locale = input.locale ?? 'en';
    let extras;
    if (input.name !== undefined) {
        const distress = evaluateDistress(input.name);
        const block = distressBlockFor(distress, locale);
        extras = block ? { crisis_resource: block } : undefined;
        if (distress.level === 'hard') {
            return buildResponse({
                contentType: 'crisis_resource_only',
                content: {
                    requested: { name: input.name },
                    withheld: 'name_of_allah',
                    reason: 'The Names of Allah are not shown when a message carries a crisis keyword. The crisis resource is the whole response.',
                },
                extras,
            });
        }
    }
    const record = input.number
        ? getNameByNumber(input.number, locale)
        : input.name
            ? findNameByString(input.name, locale)
            : null;
    if (!record) {
        return buildResponse({
            contentType: 'not_found',
            content: {
                requested: { name: input.name, number: input.number, locale },
                reason: 'No matching Name found. Provide a recognisable transliteration (e.g. "Al-Hakam"), the Arabic, the English meaning, or a number between 1 and 99.',
            },
            extras,
        });
    }
    return buildResponse({
        contentType: 'name_of_allah',
        content: withTeach(record, `name:${record.number}`, {
            audience: input.audience,
            locale,
            withhold: Boolean(extras),
        }),
        extras,
        withholdTeach: Boolean(extras),
    });
}
//# sourceMappingURL=get-name-of-allah.js.map