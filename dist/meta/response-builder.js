import { SAKINA_DISCLAIMER, NOT_FOUND_DISCLAIMER, CRISIS_ONLY_DISCLAIMER } from '../contracts/disclaimers.js';
import { QURAN_VERSE_CONTEXT, HADITH_CONTEXT, NAMES_OF_ALLAH_CONTEXT, } from '../contracts/educational.js';
import { QURAN_CONTRACT, HADITH_CONTRACT, NAME_OF_ALLAH_CONTRACT, REFLECTION_CONTRACT, QURAN_DIRECTIVES, VERSE_COLLECTION_DIRECTIVES, DUA_DIRECTIVES, NAME_DIRECTIVES, VOICE_2_RULE, PBUH_RULE, NO_EMOJI_RULE, TEACH_DIRECTIVE, TEACH_BINDING_DIRECTIVES, TEACH_CONTRACT, NO_TEACH_CLAUSE, } from '../contracts/presentation.js';
const VERSION = '1.0';
const SOURCE = 'AskSakina Islamic Knowledge Server (asksakina.com)';
function metaForType(contentType) {
    switch (contentType) {
        case 'quran_verse':
            return {
                directives: QURAN_DIRECTIVES,
                contract: { quran: QURAN_CONTRACT },
                educational: QURAN_VERSE_CONTEXT,
                disclaimer: SAKINA_DISCLAIMER,
            };
        case 'verse_collection':
            return {
                directives: VERSE_COLLECTION_DIRECTIVES,
                contract: { quran: QURAN_CONTRACT },
                educational: QURAN_VERSE_CONTEXT,
                disclaimer: SAKINA_DISCLAIMER,
            };
        case 'dua_collection':
            return {
                directives: DUA_DIRECTIVES,
                contract: { hadith: HADITH_CONTRACT },
                educational: HADITH_CONTEXT,
                disclaimer: SAKINA_DISCLAIMER,
            };
        case 'name_of_allah':
            return {
                directives: NAME_DIRECTIVES,
                contract: {
                    name_of_allah: NAME_OF_ALLAH_CONTRACT,
                    reflection_contract: REFLECTION_CONTRACT,
                    quran: QURAN_CONTRACT,
                },
                educational: NAMES_OF_ALLAH_CONTEXT,
                disclaimer: SAKINA_DISCLAIMER,
            };
        case 'crisis_resource_only':
            return {
                directives: [
                    'This response is a crisis resource only. You MUST output the crisis_resource text exactly as written, and nothing in place of it.',
                    "Do NOT add du'as, Quranic verses, hadith, or religious advice to your reply.",
                    NO_EMOJI_RULE,
                    PBUH_RULE,
                ],
                contract: {},
                educational: '',
                disclaimer: CRISIS_ONLY_DISCLAIMER,
            };
        case 'not_found':
            return {
                directives: [
                    'The lookup did not return a record. Do not fabricate a substitute.',
                    'Suggest the user rephrase or try a related topic.',
                    NO_EMOJI_RULE,
                    PBUH_RULE,
                    VOICE_2_RULE,
                ],
                contract: {},
                educational: '',
                disclaimer: NOT_FOUND_DISCLAIMER,
            };
    }
}
const NO_TEACH_SUFFIX = ` ${NO_TEACH_CLAUSE}`;
function withoutNoTeachClause(directive) {
    return directive.endsWith(NO_TEACH_SUFFIX) ? directive.slice(0, -NO_TEACH_SUFFIX.length) : directive;
}
function carriesTeach(value) {
    if (Array.isArray(value))
        return value.some(carriesTeach);
    if (!value || typeof value !== 'object')
        return false;
    const record = value;
    if (record.teach && typeof record.teach === 'object')
        return true;
    return Object.values(record).some(carriesTeach);
}
export const CRISIS_ANTI_TRANSLATION = 'CRITICAL: Output this crisis resource block exactly as written in its original language. Do not translate, paraphrase, or summarize it. Do not counsel beyond it.';
function carriesNonEnCrisisBlock(extras) {
    const block = extras?.crisis_resource;
    return !!block && typeof block.locale === 'string' && block.locale !== 'en';
}
export function buildResponse(input) {
    const meta = metaForType(input.contentType);
    const teach = carriesTeach(input.content);
    const extra = [
        ...(input.extraDirectives ?? []),
        ...(teach ? [TEACH_DIRECTIVE, ...TEACH_BINDING_DIRECTIVES] : []),
        ...(carriesNonEnCrisisBlock(input.extras) ? [CRISIS_ANTI_TRANSLATION] : []),
    ];
    const full = extra.length ? [...meta.directives, ...extra] : meta.directives;
    const directives = input.withholdTeach ? full.map(withoutNoTeachClause) : full;
    const merged = input.contractOverride
        ? { ...meta.contract, ...input.contractOverride }
        : meta.contract;
    const contract = teach ? { ...merged, teach: TEACH_CONTRACT } : merged;
    const response = {
        _sakina_meta: {
            version: VERSION,
            source: SOURCE,
            content_type: input.contentType,
            disclaimer: meta.disclaimer,
            llm_directives: { CRITICAL_RULES: directives },
            presentation_contract: contract,
            educational_context: meta.educational,
        },
        content: input.content,
    };
    if (input.extras) {
        for (const [key, value] of Object.entries(input.extras)) {
            response[key] = value;
        }
    }
    return response;
}
export function serialiseResponse(response) {
    const json = JSON.stringify(response, null, 2);
    if (json.includes('\u{FDFA}')) {
        throw new Error('Response contains the Unicode prophet salutation. Sanitise at the data layer.');
    }
    return json;
}
//# sourceMappingURL=response-builder.js.map