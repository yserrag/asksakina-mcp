import { z } from 'zod';
import { BEREAVED_CONTEXT, getDuaRecordById, queryDuasByContext, selectAbuseSafeDuas, } from '../data/duas.js';
import { BEREAVED_GENDER_NOTE } from '../data/bereaved-duas.js';
import { ABUSE_SAFE_DUAS } from '../data/abuse-safe-duas.js';
import { distressBlockFor, evaluateDistress, } from '../safety/crisis-keywords.js';
import { buildResponse } from '../meta/response-builder.js';
import { ANTI_SUMMARISATION_DIRECTIVE, HADITH_CONTRACT, NOT_A_NARRATION_DIRECTIVE, NOT_A_NARRATION_SCOPE_HEAD, QURAN_CITATION_DIRECTIVE, QURAN_CONTRACT, UNGRADED_GRADING_DIRECTIVE, } from '../contracts/presentation.js';
import { UNGRADED_SCOPE_HEAD } from '../contracts/gem4-wo418.js';
import { isPickthallTranslation } from '../data/duas.js';
import { DUA_ID_ALLOWLIST } from '../data/dua-id-allowlist.js';
import { audienceArg } from '../teach/audience.js';
import { withTeach } from '../teach/attach.js';
export const DUA_ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/;
export const getDuaShape = {
    context: z
        .string()
        .min(2)
        .optional()
        .describe("Life context to match against. Examples: 'anxiety', 'morning', 'travel', 'forgiveness', 'gratitude'. Send this or id, not both."),
    id: z
        .string()
        .regex(DUA_ID_PATTERN)
        .optional()
        .describe("A du'a id taken from a related reference in an earlier response. Send this or context, not both."),
    locale: z
        .enum(['en', 'id', 'ur', 'ar'])
        .optional()
        .describe('Translation locale; defaults to "en". v1 returns English content for all locales.'),
    audience: audienceArg,
};
export const getDuaSchema = z.object(getDuaShape);
export const GET_DUA_TITLE = 'get_dua';
export const GET_DUA_DESCRIPTION = "Returns du'as from a curated du'a corpus for a life context (e.g. anxiety, travel, gratitude), with source and grading where recorded. Show any crisis_resource block verbatim.";
export async function getDuaHandler(input) {
    if (input.id !== undefined) {
        if (input.context !== undefined)
            return oneOfRefusal(input);
        return duaByIdResponse(input.id, input.locale ?? 'en', DUA_ID_ALLOWLIST, input.audience);
    }
    if (input.context === undefined)
        return oneOfRefusal(input);
    const distress = evaluateDistress(input.context);
    const block = distressBlockFor(distress, input.locale ?? 'en');
    let extras = block ? { crisis_resource: block } : undefined;
    if (distress.level === 'hard' && distress.crisisType === 'abuse') {
        return abuseResponse(input.context, extras, ABUSE_SAFE_DUAS);
    }
    if (distress.level === 'hard') {
        return buildResponse({
            contentType: 'crisis_resource_only',
            content: {
                requested: { context: input.context },
                withheld: 'dua_collection',
                reason: "Du'as are not shown when a message carries a crisis keyword. The crisis resource is the whole response.",
            },
            extras,
        });
    }
    const result = queryDuasByContext(input.context);
    if (result.resolvedCategory === BEREAVED_CONTEXT) {
        if (!extras)
            extras = { crisis_resource: distressBlockFor('soft', input.locale ?? 'en') };
        if (!result.duas.length) {
            return buildResponse({
                contentType: 'not_found',
                content: {
                    requested: { context: input.context },
                    context: BEREAVED_CONTEXT,
                    matched_by: result.matchedBy,
                    duas: [],
                    total_results: 0,
                    no_records_yet: true,
                    reason: "No du'as are in the corpus yet for a bereaved person to say for their own grief. They are awaiting scholarly review.",
                    see_also: {
                        context: 'deceased',
                        note: "Du'as said for the person who has died (funeral, grave, and du'as for the deceased).",
                    },
                },
                extras,
            });
        }
    }
    if (!result.resolvedCategory) {
        return buildResponse({
            contentType: 'not_found',
            content: {
                requested: { context: input.context },
                reason: 'No du\'a category matched the supplied context. Try a more general term ("anxiety", "morning", "gratitude", "forgiveness").',
            },
            extras,
        });
    }
    const unrecorded = result.duas.filter((d) => d.grading_status === 'not_recorded').length;
    const general = result.duas.filter((d) => d.grading_status === 'not_a_narration').length;
    const withhold = Boolean(extras?.crisis_resource) || GRIEF_CONTEXTS.has(result.resolvedCategory);
    const duas = input.audience
        ? result.duas.map((d, i) => withTeach(d, `dua:${result.ids[i]}`, { audience: input.audience, locale: input.locale, withhold }))
        : result.duas;
    const contractOverride = contractOverrideFor(result.duas);
    const recordDirectives = collectionDirectivesFor(result.duas);
    const extraDirectives = recordDirectives.length ? recordDirectives : undefined;
    return buildResponse({
        contentType: 'dua_collection',
        content: {
            context: result.resolvedCategory,
            matched_by: result.matchedBy,
            ...(result.resolvedCategory === BEREAVED_CONTEXT && BEREAVED_GENDER_NOTE
                ? { teaching_note: BEREAVED_GENDER_NOTE }
                : {}),
            duas,
            total_results: result.duas.length,
            grading_summary: {
                quranic: result.duas.filter((d) => d.grading_status === 'quranic').length,
                graded: result.duas.filter((d) => d.grading_status === 'graded').length,
                not_a_narration: general,
                not_recorded: unrecorded,
            },
        },
        extras,
        contractOverride,
        extraDirectives,
    });
}
const GRIEF_CONTEXTS = new Set([BEREAVED_CONTEXT, 'deceased']);
export function quranContractFor(records) {
    const quran = records.filter((d) => d.origin === 'quran');
    const mixed = records.filter((d) => d.origin !== 'quran' && d.quran_spans?.length);
    if (!quran.length && !mixed.length)
        return undefined;
    const allPickthall = quran.every(isPickthallTranslation);
    return { quran: { ...QURAN_CONTRACT, ...(allPickthall ? { translator: 'Marmaduke Pickthall' } : {}) } };
}
export function contractOverrideFor(records) {
    const perRecord = records.some((d) => d.grading_status === 'not_recorded' || d.grading_status === 'not_a_narration');
    const quran = quranContractFor(records);
    if (!perRecord && !quran)
        return undefined;
    return {
        ...(perRecord ? { hadith: { ...HADITH_CONTRACT, require_grading: 'per_record' } } : {}),
        ...quran,
    };
}
export function collectionDirectivesFor(records) {
    return [
        ...(records.length > 1 ? [ANTI_SUMMARISATION_DIRECTIVE] : []),
        ...(quranContractFor(records) ? [QURAN_CITATION_DIRECTIVE] : []),
        ...responseDirectivesFor(records),
    ];
}
export function responseDirectivesFor(records) {
    const titled = (directive) => [...new Set(records.filter((d) => d.grading_directive === directive).map((d) => d.title))];
    const ungraded = titled(UNGRADED_GRADING_DIRECTIVE);
    const general = titled(NOT_A_NARRATION_DIRECTIVE);
    const scoped = new Set([UNGRADED_GRADING_DIRECTIVE, NOT_A_NARRATION_DIRECTIVE]);
    const others = [...new Set(records.map((d) => d.grading_directive).filter((x) => Boolean(x) && !scoped.has(x)))];
    return [
        ...(ungraded.length ? [`${UNGRADED_SCOPE_HEAD}(${ungraded.join(', ')}): ${UNGRADED_GRADING_DIRECTIVE}`] : []),
        ...(general.length ? [`${NOT_A_NARRATION_SCOPE_HEAD}(${general.join(', ')}): ${NOT_A_NARRATION_DIRECTIVE}`] : []),
        ...others,
    ];
}
export const ABUSE_ORDER_DIRECTIVE = "Output the safety block and resources first. Only then, if du'as are included, present them after.";
export function abuseResponse(context, extras, allowlist) {
    const duas = selectAbuseSafeDuas(allowlist);
    if (!duas.length) {
        return buildResponse({
            contentType: 'crisis_resource_only',
            content: {
                requested: { context },
                withheld: 'dua_collection',
                reason: "Du'as are not shown when a message discloses abuse. The crisis resource is the whole response.",
            },
            extras,
        });
    }
    const recordDirectives = collectionDirectivesFor(duas);
    return buildResponse({
        contentType: 'dua_collection',
        content: { context: 'abuse-safe', duas, total_results: duas.length },
        extras,
        contractOverride: contractOverrideFor(duas),
        extraDirectives: [ABUSE_ORDER_DIRECTIVE, ...recordDirectives],
    });
}
function oneOfRefusal(input) {
    return buildResponse({
        contentType: 'not_found',
        content: {
            requested: { context: input.context, id: input.id },
            reason: 'Send either context or id, not both and not neither.',
        },
    });
}
export function duaByIdResponse(id, locale, allowlist, audience) {
    const distress = evaluateDistress(id);
    const block = distressBlockFor(distress, locale);
    const extras = block ? { crisis_resource: block } : undefined;
    if (distress.level === 'hard') {
        return buildResponse({
            contentType: 'crisis_resource_only',
            content: {
                requested: { id },
                withheld: 'dua_collection',
                reason: "Du'as are not shown when a message carries a crisis keyword. The crisis resource is the whole response.",
            },
            extras,
        });
    }
    const record = allowlist.includes(id) ? getDuaRecordById(id) : null;
    if (!record) {
        return buildResponse({
            contentType: 'not_found',
            content: {
                requested: { id },
                reason: 'This id is not available for direct lookup. Look up by context instead.',
            },
            extras,
        });
    }
    const duas = [withTeach(record, `dua:${id}`, { audience, locale, withhold: Boolean(extras) })];
    const unrecorded = duas.filter((d) => d.grading_status === 'not_recorded').length;
    const recordDirectives = collectionDirectivesFor([record]);
    return buildResponse({
        contentType: 'dua_collection',
        content: {
            id,
            duas,
            total_results: 1,
            grading_summary: {
                quranic: duas.filter((d) => d.grading_status === 'quranic').length,
                graded: duas.filter((d) => d.grading_status === 'graded').length,
                not_a_narration: duas.filter((d) => d.grading_status === 'not_a_narration').length,
                not_recorded: unrecorded,
            },
        },
        extras,
        contractOverride: contractOverrideFor([record]),
        extraDirectives: recordDirectives.length ? recordDirectives : undefined,
    });
}
//# sourceMappingURL=get-dua.js.map