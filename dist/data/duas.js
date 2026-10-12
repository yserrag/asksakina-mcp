import { readFileSync } from 'node:fs';
import { NOT_A_NARRATION_DIRECTIVE, NOT_A_NARRATION_GRADING, UNGRADED_GRADING_DIRECTIVE } from '../contracts/presentation.js';
import { AYAT_AL_KURSI_PRACTICE_REF, AYAT_AL_KURSI_PRACTICE_GRADING_LINE } from '../contracts/gem4-wo418.js';
import { QURAN_GRADED_REFERENCE_GRADING_LINE } from '../contracts/gem4-wo423.js';
import { REFERENCE_GRADING_LINE } from '../contracts/gem4-wo424.js';
import { griefRoute, matchPhrase, parentQuery } from './context-matcher.js';
import { BEREAVED_DUAS } from './bereaved-duas.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
const ALL_DUAS = JSON.parse(readFileSync(path.join(DATA_DIR, 'duas.json'), 'utf-8'));
export function plantDuasForTest(duas) {
    for (const d of duas) {
        if (ALL_DUAS.some((x) => x.id === d.id))
            throw new Error(`plantDuasForTest: ${d.id} is a bundled id`);
    }
    ALL_DUAS.push(...duas);
    return () => {
        for (const d of duas) {
            const i = ALL_DUAS.indexOf(d);
            if (i >= 0)
                ALL_DUAS.splice(i, 1);
        }
    };
}
const DUA_CATEGORIES = JSON.parse(readFileSync(path.join(DATA_DIR, 'dua-categories.json'), 'utf-8'));
const PROPHET_SALUTATION_PROCESSED = ' (peace be upon him)';
const ALIAS_TO_SLUG = {
    morning: 'morning-adhkar',
    evening: 'evening-adhkar',
    'before-sleep': 'before-sleep',
    sleep: 'before-sleep',
    bed: 'before-sleep',
    anxiety: 'stress-anxiety',
    worry: 'stress-anxiety',
    stress: 'stress-anxiety',
    distress: 'stress-anxiety',
    fear: 'stress-anxiety',
    grief: 'deceased',
    loss: 'deceased',
    bereavement: 'deceased',
    death: 'deceased',
    guilt: 'repentance',
    forgiveness: 'repentance',
    repent: 'repentance',
    illness: 'health-healing',
    sick: 'health-healing',
    healing: 'health-healing',
    travel: 'travel',
    journey: 'travel',
    exam: 'exams-study',
    exams: 'exams-study',
    study: 'exams-study',
    work: 'work-success',
    job: 'work-success',
    career: 'work-success',
    debt: 'wealth-debt',
    money: 'wealth-debt',
    wealth: 'wealth-debt',
    marriage: 'marriage',
    pregnant: 'pregnancy',
    pregnancy: 'pregnancy',
    children: 'children',
    child: 'children',
    parents: 'mothers',
    mother: 'mothers',
    father: 'fathers',
    hardship: 'calamity',
    calamity: 'calamity',
    ramadan: 'ramadan',
    hajj: 'umrah-hajj',
    umrah: 'umrah-hajj',
    pilgrimage: 'umrah-hajj',
    istikhara: 'istikhara',
    guidance: 'istikhara',
    friday: 'friday',
    jumuah: 'friday',
    gratitude: 'gratitude',
    thanks: 'gratitude',
    general: 'general',
    protection: 'morning-adhkar',
};
function sanitise(input) {
    return input.split('\u{FDFA}').join(PROPHET_SALUTATION_PROCESSED).trim();
}
const GRADE_TOKEN = /\b(sahih|hasan|daif|daeef|dhaif|dhaeef)\b/;
export function hasGradeToken(text) {
    if (!text)
        return false;
    const folded = text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[\u02BF\u02BE\u2019'`]/g, '')
        .toLowerCase();
    return GRADE_TOKEN.test(folded);
}
function inferGradingFromSource(source) {
    if (!source)
        return '';
    if (/Quran|Qur'an|qur'an/i.test(source))
        return 'Quranic';
    if (/Sahih al-Bukhari|Bukhari|Sahih Muslim/i.test(source))
        return 'Sahih (Authentic)';
    if (hasGradeToken(source))
        return 'As stated in the source';
    return '';
}
const HADITH_REF_GRADING = {
    [AYAT_AL_KURSI_PRACTICE_REF]: AYAT_AL_KURSI_PRACTICE_GRADING_LINE,
};
export function endsInParenthesisedGrading(ref) {
    const m = ref ? /\(([^()]*)\)\s*$/.exec(ref) : null;
    return !!m && hasGradeToken(m[1]);
}
export function referenceCarriesGrading(ref) {
    if (!ref)
        return false;
    if (/\([^()]*\)\s*$/.test(ref))
        return true;
    const folded = ref.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\u02BF\u02BE\u2019'`]/g, '').toLowerCase();
    return /\bsahih (?:al-)?bukhari\b|\bsahih muslim\b/.test(folded);
}
export function ruledGradingLine(hadithRef) {
    if (!hadithRef)
        return undefined;
    return HADITH_REF_GRADING[hadithRef] ?? (endsInParenthesisedGrading(hadithRef) ? QURAN_GRADED_REFERENCE_GRADING_LINE : undefined);
}
export const NOT_A_NARRATION_DIRECTIVE_LIVE = true;
let notANarrationDirective = NOT_A_NARRATION_DIRECTIVE_LIVE;
export function setNotANarrationDirectiveForTest(on) {
    notANarrationDirective = on;
}
const PICKTHALL_RECORDS = new WeakSet();
export function isPickthallTranslation(record) {
    return PICKTHALL_RECORDS.has(record);
}
export const QURAN_TRANSLATION_LABEL = 'Translation of the Meaning';
export const PICKTHALL_TRANSLATION_LABEL = 'Translation of the Meaning (Pickthall)';
export function toRecord(dua) {
    const isQuran = dua.origin === 'quran' && !!dua.quran_ref;
    const quranCitation = isQuran ? `Quran ${dua.quran_ref}` : undefined;
    const recordedGrading = dua.grading ?? inferGradingFromSource(dua.source);
    const ownReference = !isQuran && !recordedGrading ? dua.source || dua.countSource : undefined;
    const statedInReference = referenceCarriesGrading(ownReference);
    const referenceLine = statedInReference ? REFERENCE_GRADING_LINE.replace(/^Grading: /, '') : '';
    const grading = recordedGrading || referenceLine || (isQuran ? 'Quranic' : 'Not graded in AskSakina corpus');
    const grading_status = isQuran || grading === 'Quranic'
        ? 'quranic'
        : dua.grading === NOT_A_NARRATION_GRADING && dua.origin !== 'quran'
            ? 'not_a_narration'
            : recordedGrading || statedInReference
                ? 'graded'
                : 'not_recorded';
    const hadithRef = isQuran
        ? (dua.source && !/qur/i.test(dua.source) ? dua.source : undefined) ?? dua.countSource
        : undefined;
    const sourceParts = [];
    if (hadithRef)
        sourceParts.push(hadithRef);
    else if (dua.source)
        sourceParts.push(dua.source);
    else if (quranCitation)
        sourceParts.push(quranCitation);
    if (!sourceParts.length && dua.countSource)
        sourceParts.push(dua.countSource);
    const source = sourceParts.join(', ') || 'Source not recorded in AskSakina corpus';
    const ruledLine = ruledGradingLine(hadithRef);
    const gradingLine = ruledLine
        ? ruledLine.replace(/^Grading: /, '')
        : hadithRef
            ? `${grading} (the du'a text). The hadith's grading is not recorded in the AskSakina corpus.`
            : grading;
    const pickthall = isQuran && dua.translation_source === 'pickthall';
    const translationLabel = isQuran ? (pickthall ? PICKTHALL_TRANSLATION_LABEL : QURAN_TRANSLATION_LABEL) : 'Translation';
    const arabic = sanitise(dua.arabic);
    const transliteration = sanitise(dua.transliteration ?? '');
    const translation = sanitise(dua.translation);
    const quranSpans = !isQuran && dua.quran_spans?.length
        ? dua.quran_spans.map((s) => ({ quran_citation: `Quran ${s.ref}`, translation: sanitise(s.translation), translation_label: PICKTHALL_TRANSLATION_LABEL }))
        : undefined;
    const dua_block = [
        `Arabic: ${arabic}`,
        transliteration ? `Transliteration: ${transliteration}` : null,
        `${translationLabel}: ${translation}`,
        quranCitation ? `Origin: ${quranCitation}` : null,
        quranSpans ? `Contains: ${quranSpans.map((s) => `${s.quran_citation} (${s.translation_label}: "${s.translation}")`).join('; ')}` : null,
        `Source: ${source}`,
        `Grading: ${gradingLine}`,
    ]
        .filter(Boolean)
        .join('\n');
    const record = {
        dua_block,
        title: sanitise(dua.name),
        arabic,
        transliteration,
        translation,
        source,
        grading,
        grading_status,
        context_tags: [dua.category],
    };
    if (quranCitation) {
        record.origin = 'quran';
        record.quran_citation = quranCitation;
    }
    if (hadithRef) {
        record.hadith_source = hadithRef;
        record.hadith_grading_status = ruledLine ? 'graded' : 'not_recorded';
    }
    if (statedInReference)
        record.hadith_grading_status = 'graded';
    if (grading_status === 'not_recorded')
        record.grading_directive = UNGRADED_GRADING_DIRECTIVE;
    else if (notANarrationDirective && grading_status === 'not_a_narration')
        record.grading_directive = NOT_A_NARRATION_DIRECTIVE;
    if (quranSpans)
        record.quran_spans = quranSpans;
    if (pickthall)
        PICKTHALL_RECORDS.add(record);
    return record;
}
export function resolveCategorySlug(input) {
    const normalised = input.toLowerCase().trim().replace(/[\s_]+/g, '-');
    if (DUA_CATEGORIES.some((c) => c.slug === normalised))
        return normalised;
    if (ALIAS_TO_SLUG[normalised])
        return ALIAS_TO_SLUG[normalised];
    for (const category of DUA_CATEGORIES) {
        if (category.name.toLowerCase().includes(normalised))
            return category.slug;
    }
    for (const category of DUA_CATEGORIES) {
        const tags = category.tags;
        if (!tags)
            continue;
        const flatTags = [
            ...(tags.time ?? []),
            ...(tags.mood ?? []),
            ...(tags.situation ?? []),
            ...(tags.seasonal ?? []),
        ].map((t) => t.toLowerCase());
        if (flatTags.includes(normalised))
            return category.slug;
    }
    return null;
}
function getDuasByCategory(slug) {
    return ALL_DUAS.filter((d) => d.category === slug);
}
export function queryDuasByContext(input, opts = {}) {
    const pq = parentQuery(input);
    if (pq?.kind === 'death') {
        const matchedBy = { method: 'phrase', via: 'parent + death word' };
        if (griefRoute(input) === 'bereaved') {
            const found = bundledById(BEREAVED_DUAS);
            return { resolvedCategory: BEREAVED_CONTEXT, duas: found.map(toRecord), matchedBy, ids: found.map((d) => d.id) };
        }
        const matched = getDuasByCategory('deceased');
        return { resolvedCategory: 'deceased', duas: matched.map(toRecord), matchedBy, ids: matched.map((d) => d.id) };
    }
    if (pq?.kind === 'miss') {
        const matched = ALL_DUAS.filter((d) => pq.parents.includes(d.category) && d.parentState === 'both');
        return {
            resolvedCategory: pq.parents[0],
            duas: matched.map(toRecord),
            matchedBy: { method: 'phrase', via: "parent + miss ('both' du'as only)" },
            ids: matched.map((d) => d.id),
        };
    }
    const term = resolveCategorySlug(input);
    const phrase = term || opts.phraseMatching === false ? null : matchPhrase(input, DUA_CATEGORIES, ALIAS_TO_SLUG);
    const slug = term ?? phrase?.slug ?? null;
    if (!slug)
        return { resolvedCategory: null, duas: [], ids: [] };
    const matchedBy = term
        ? { method: 'term', via: input.trim() }
        : { method: 'phrase', via: phrase.via };
    if (slug === 'deceased' && griefRoute(input) === 'bereaved') {
        const found = bundledById(BEREAVED_DUAS);
        return { resolvedCategory: BEREAVED_CONTEXT, duas: found.map(toRecord), matchedBy, ids: found.map((d) => d.id) };
    }
    const matched = getDuasByCategory(slug);
    return { resolvedCategory: slug, duas: matched.map(toRecord), matchedBy, ids: matched.map((d) => d.id) };
}
export const BEREAVED_CONTEXT = 'bereaved';
function bundledById(ids) {
    return ids.map((id) => ALL_DUAS.find((d) => d.id === id)).filter((d) => !!d);
}
export const TOTAL_DUAS = ALL_DUAS.length;
export function getDuaRecordById(id) {
    const d = ALL_DUAS.find((x) => x.id === id);
    return d ? toRecord(d) : null;
}
export function gradingStatusById(id) {
    const d = ALL_DUAS.find((x) => x.id === id);
    return d ? toRecord(d).grading_status : undefined;
}
const ENDURANCE = /\bsabr\b|\bpatien(?:ce|t)\b|steadfast|\bendur(?:e|ance|ing)\b|persever|strength to bear/i;
export function isEnduranceDua(id) {
    const d = ALL_DUAS.find((x) => x.id === id);
    return !!d && ENDURANCE.test(`${d.name} ${d.translation}`);
}
export function selectAbuseSafeDuas(ids) {
    return ids
        .map((id) => ALL_DUAS.find((d) => d.id === id))
        .filter((d) => !!d && !isEnduranceDua(d.id))
        .map(toRecord);
}
//# sourceMappingURL=duas.js.map