import { crisisKeywordLanguages, detectCrisis } from './_synced/crisis-detection.js';
import { abuseText, selfHarmText, softText } from './crisis-text-l10n.js';
import { bnFaText } from './crisis-text-bn-fa.js';
import { foldLatin } from './_synced/latin-fold.js';
import { normaliseArabic } from './_synced/arabic-normalise.js';
export const SOFT_DISTRESS_KEYWORDS = [
    'anxiety', 'anxious', 'panic',
    'stress', 'stressed', 'overwhelmed',
    'fear', 'fearful', 'afraid', 'scared', 'frightened',
    'grief', 'grieving', 'mourning', 'bereaved', 'bereavement',
    'loss', 'loss of', 'lost a',
    'despair', 'hopeless', 'hopelessness',
    'depression', 'depressed', 'sad', 'sadness',
    'worry', 'worried',
    'distress', 'distressed', 'distressing',
];
export const SOFT_WORD_BOUNDARY = /[^\p{L}\p{N}]+/u;
export const SOFT_PHRASE_EXCLUSIONS = [
    { phrase: 'loss of faith', keywords: ['loss', 'loss of'] },
    { phrase: 'fear of allah', keywords: ['fear'] },
];
function softDistressKeyword(input) {
    const lower = input.toLowerCase();
    const excluded = new Set(SOFT_PHRASE_EXCLUSIONS.filter((e) => lower.includes(e.phrase)).flatMap((e) => e.keywords));
    for (const keyword of SOFT_DISTRESS_KEYWORDS) {
        if (excluded.has(keyword))
            continue;
        if (keyword.includes(' ')) {
            if (lower.includes(keyword))
                return keyword;
            continue;
        }
        const tokens = lower.split(SOFT_WORD_BOUNDARY);
        if (tokens.includes(keyword))
            return keyword;
    }
    return undefined;
}
export const SOFT_DISTRESS_KEYWORDS_TR = {
    prefix: ['kaygı', 'endişe', 'bunal', 'korku', 'yas tut', 'çaresiz'],
    whole: ['yalnızım', 'stresliyim', 'kederliyim', 'daraldım', 'panik atak', 'içim acıyor', 'canım yanıyor', 'derdim var'],
};
export function turkishFold(s) {
    return s.normalize('NFC').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}
export const TR_DEVOTIONAL_FEAR = /allah(?:['’ʼ`]?[td]an\s+kork|\s+korkusu)[\p{L}\p{N}]*/gu;
export const SOFT_PREFIX_EXCEPTIONS_TR = { korku: ['nç', 't'] };
const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';
const except = (k) => {
    const ex = SOFT_PREFIX_EXCEPTIONS_TR[k];
    return ex ? `(?!${[...new Set(ex.flatMap((e) => [e, foldLatin(e)]))].join('|')})` : '';
};
const same = (s) => s;
const TR_PATTERNS = ['turkish', 'ascii'].map((form) => {
    const fold = form === 'ascii' ? foldLatin : same;
    return {
        form,
        prefix: SOFT_DISTRESS_KEYWORDS_TR.prefix.map((k) => [k, new RegExp(WORD_START + fold(k) + except(k), 'u')]),
        whole: SOFT_DISTRESS_KEYWORDS_TR.whole.map((k) => [k, new RegExp(WORD_START + fold(k) + WORD_END, 'u')]),
    };
});
function turkishSoftKeyword(input) {
    const turkish = turkishFold(input);
    for (const p of TR_PATTERNS) {
        const text = p.form === 'ascii' ? foldLatin(turkish) : turkish;
        const withoutDevotional = text.replace(TR_DEVOTIONAL_FEAR, ' ');
        for (const [keyword, re] of p.prefix) {
            if (re.test(keyword === 'korku' ? withoutDevotional : text))
                return keyword;
        }
        for (const [keyword, re] of p.whole)
            if (re.test(text))
                return keyword;
    }
    return undefined;
}
export const SOFT_DISTRESS_KEYWORDS_BN = ['খুব একা লাগছে', 'মন খুব খারাপ'];
export const SOFT_DISTRESS_KEYWORDS_FA = ['دلم گرفته', 'خیلی تنهام', 'حالم بده'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (s) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(s)}(?![\\p{L}\\p{M}\\p{N}])`, 'u');
const BN_SOFT = SOFT_DISTRESS_KEYWORDS_BN.map((k) => [k, phraseRe(k.normalize('NFC'))]);
const FA_SOFT = SOFT_DISTRESS_KEYWORDS_FA.map((k) => [k, phraseRe(normaliseArabic(k))]);
function bnSoftKeyword(input) {
    const text = input.normalize('NFC');
    return BN_SOFT.find(([, re]) => re.test(text))?.[0];
}
function faSoftKeyword(input) {
    const text = normaliseArabic(input);
    return FA_SOFT.find(([, re]) => re.test(text))?.[0];
}
export function evaluateDistress(input) {
    const crisis = detectCrisis(input);
    if (crisis.isCrisis) {
        const keywordLanguages = crisis.crisisType === 'none' ? [] : crisisKeywordLanguages(input, crisis.crisisType);
        return { level: 'hard', crisisType: crisis.crisisType, keywordLanguages };
    }
    const matches = [
        ['en', softDistressKeyword(input)],
        ['tr', turkishSoftKeyword(input)],
        ['bn', bnSoftKeyword(input)],
        ['fa', faSoftKeyword(input)],
    ];
    const hit = matches.filter(([, k]) => k);
    if (hit.length) {
        return { level: 'soft', matchedKeyword: hit[0][1], keywordLanguages: hit.map(([l]) => l) };
    }
    return { level: 'none' };
}
const isBnFa = (l) => l === 'bn' || l === 'fa';
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/';
export const US_988_FOUNDER_VERIFIED = false;
export { BN_FA_LINES_FOUNDER_VERIFIED } from './crisis-text-bn-fa.js';
const HARD_CRISIS_DIRECTIVE = 'CRITICAL: You MUST output the following crisis resource text exactly as written below. Do not alter it or make it conditional. Do not assess whether the user needs it; output it.';
const SELF_HARM_LINES_EN = US_988_FOUNDER_VERIFIED
    ? 'Samaritans (UK: 116 123, 24/7) or 988 (US/Canada, 24/7)'
    : 'Samaritans (UK: 116 123, 24/7)';
const HARD_CRISIS_TEXT = {
    en: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as ${SELF_HARM_LINES_EN}, or visit ${IASP} for international crisis lines.`,
    ar: selfHarmText('ar'),
    ur: selfHarmText('ur'),
    id: selfHarmText('id'),
    tr: selfHarmText('tr'),
};
export const HARD_CRISIS_RESOURCE_BLOCK = {
    level: 'hard',
    crisis_type: 'self-harm',
    locale: 'en',
    directive: HARD_CRISIS_DIRECTIVE,
    text: HARD_CRISIS_TEXT.en,
};
function selfHarmBlockFor(locale) {
    if (locale === 'en')
        return HARD_CRISIS_RESOURCE_BLOCK;
    return {
        level: 'hard',
        crisis_type: 'self-harm',
        locale,
        directive: HARD_CRISIS_DIRECTIVE,
        text: isBnFa(locale) ? bnFaText(locale, 'self-harm') : HARD_CRISIS_TEXT[locale],
    };
}
export const ABUSE_SENTENCE = 'What you are experiencing is oppression (dhulm), and you are not to blame. Your first duty is to protect your safety, not to endure harm. Professional support is available to help you navigate this safely.';
const ABUSE_DIRECTIVE = "CRITICAL: The user's message indicates they may be experiencing abuse. You MUST output the following resource text exactly as written below. Do not alter it or make it conditional. Do NOT give confrontation advice. Do NOT tell the user to \"just leave\" or when to leave. Do NOT suggest couples counselling, mediation or reconciliation. Do NOT frame enduring the abuse as sabr (patience), a test to bear, or a religious duty.";
const ABUSE_LINE_EN = 'the National Domestic Abuse Helpline (UK: 0808 2000 247, 24/7, free)';
const ABUSE_TEXT = {
    en: `${ABUSE_SENTENCE} The ${ABUSE_LINE_EN.replace(/^the /, '')}. If you are in immediate danger, call your local emergency services.`,
    ar: abuseText('ar'),
    ur: abuseText('ur'),
    id: abuseText('id'),
    tr: abuseText('tr'),
};
function abuseBlockFor(locale) {
    return {
        level: 'hard',
        crisis_type: 'abuse',
        locale,
        directive: ABUSE_DIRECTIVE,
        text: isBnFa(locale) ? bnFaText(locale, 'abuse') : ABUSE_TEXT[locale],
    };
}
export const SOFT_DISTRESS_RESOURCE_BLOCK = {
    level: 'soft',
    locale: 'en',
    directive: 'Output this crisis resource block exactly as written. Do not counsel beyond it.',
    text: 'If these feelings become overwhelming, please know support is available. Visit https://www.iasp.info/resources/Crisis_Centres/ for helplines in your region.',
};
function softDistressBlockFor(locale) {
    if (locale === 'en')
        return SOFT_DISTRESS_RESOURCE_BLOCK;
    if (isBnFa(locale))
        return { ...SOFT_DISTRESS_RESOURCE_BLOCK, locale, text: bnFaText(locale, 'soft') };
    return { ...SOFT_DISTRESS_RESOURCE_BLOCK, locale, text: softText(locale) };
}
export function crisisLocaleFor(hint, locale) {
    if (locale !== 'en' || hint.level === 'none')
        return locale;
    const matched = (hint.keywordLanguages ?? []).filter((l) => l !== 'en');
    return matched.length === 1 ? matched[0] : 'en';
}
export function distressBlockFor(hint, locale = 'en') {
    const h = typeof hint === 'string' ? { level: hint } : hint;
    if (h.level === 'hard') {
        const l = crisisLocaleFor(h, locale);
        return h.crisisType === 'abuse' ? abuseBlockFor(l) : selfHarmBlockFor(l);
    }
    if (h.level === 'soft')
        return softDistressBlockFor(crisisLocaleFor(h, locale));
    return undefined;
}
//# sourceMappingURL=crisis-keywords.js.map