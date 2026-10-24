import { z } from 'zod';
import { fetchQuranVerse, PARKED_TRANSLATION_LOCALES } from '../data/quran.js';
import { AVAILABLE_THEMES, matchThemes, versesForMatches } from '../data/thematic.js';
import { distressBlockFor, evaluateDistress } from '../safety/crisis-keywords.js';
import { buildResponse } from '../meta/response-builder.js';
import { audienceArg } from '../teach/audience.js';
import { withTeach } from '../teach/attach.js';
export const HEALING_DIRECTIVE = 'These verses are offered as spiritual comfort and do not replace professional medical care. If the user is unwell, encourage them to seek qualified medical help.';
export const FIND_VERSES_DEFAULT_LIMIT = 5;
export const FIND_VERSES_MAX_LIMIT = 10;
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
};
export const findVersesSchema = z.object(findVersesShape);
export const FIND_VERSES_TITLE = 'find_verses';
export const FIND_VERSES_DESCRIPTION = "Searches AskSakina's thematic index for Quran verses by topic keyword. Returns reference, Tanzil Arabic and Pickthall English. Quote the Arabic exactly.";
function relevanceNote(themes) {
    const list = themes.map((t) => `"${t}"`).join(', ');
    return `Listed under ${list} in AskSakina's thematic verse index.`;
}
async function toFoundVerse(v, matched, locale) {
    const base = {
        reference: v.ref,
        arabic: v.arabic,
        translation_source: 'Pickthall',
        relevance_note: relevanceNote(v.themes.filter((t) => matched.includes(t))),
    };
    try {
        const r = await fetchQuranVerse(v.surah, v.ayah, locale);
        return {
            reference: base.reference,
            surah_name_english: r.surah_name_english,
            surah_name_arabic: r.surah_name_arabic,
            arabic: base.arabic,
            translation: r.translation,
            translation_source: base.translation_source,
            ...(r.translation_note ? { translation_note: r.translation_note } : {}),
            relevance_note: base.relevance_note,
        };
    }
    catch {
        return {
            ...base,
            translation: null,
            translation_note: `The translation is temporarily unavailable. Call get_quran_verse for ${v.ref}.`,
        };
    }
}
function noResults(query, reason, extras) {
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
    });
}
export async function findVersesHandler(input) {
    const locale = input.locale ?? 'en';
    const limit = Math.min(Math.max(input.limit ?? FIND_VERSES_DEFAULT_LIMIT, 1), FIND_VERSES_MAX_LIMIT);
    const distress = evaluateDistress(input.query);
    const block = distressBlockFor(distress, locale);
    let extras = block ? { crisis_resource: block } : undefined;
    if (distress.level === 'hard') {
        return buildResponse({
            contentType: 'crisis_resource_only',
            content: {
                requested: { query: input.query },
                withheld: 'verse_collection',
                reason: distress.crisisType === 'abuse'
                    ? 'Quranic verses are not shown when a message discloses abuse. The crisis resource is the whole response.'
                    : 'Quranic verses are not shown when a message carries a crisis keyword. The crisis resource is the whole response.',
            },
            extras,
        });
    }
    const matches = matchThemes(input.query);
    if (!matches.length) {
        return noResults(input.query, `No theme in the index matched the query. Try one of the available themes.`, extras);
    }
    const themes = matches.map((m) => m.theme);
    if (!extras && themes.includes('grief'))
        extras = { crisis_resource: distressBlockFor('soft', locale) };
    if (!extras && themes.includes('companionship'))
        extras = { crisis_resource: distressBlockFor('soft', locale) };
    const found = await Promise.all(versesForMatches(matches, limit).map((v) => toFoundVerse(v, themes, locale)));
    const withhold = Boolean(extras) || themes.includes('grief');
    const verses = found.map((v) => withTeach(v, `verse:${v.reference}`, { audience: input.audience, locale, withhold }));
    const parked = PARKED_TRANSLATION_LOCALES[locale];
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
        extraDirectives: [
            ...(parked
                ? [
                    `The translations are English (Pickthall) because a licensed ${parked} translation is not yet available. Present them as English and state that note. You MUST NOT translate them into ${parked} yourself or present them as a ${parked} translation.`,
                ]
                : []),
            ...(themes.includes('healing') ? [HEALING_DIRECTIVE] : []),
        ],
    });
}
//# sourceMappingURL=find-verses.js.map