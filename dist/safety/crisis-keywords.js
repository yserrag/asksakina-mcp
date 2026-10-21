import { detectCrisis } from './_synced/crisis-detection.js';
import { abuseText, selfHarmText, softText } from './crisis-text-l10n.js';
const SOFT_DISTRESS_KEYWORDS = [
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
const WORD_BOUNDARY = /\W+/;
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
        const tokens = lower.split(WORD_BOUNDARY);
        if (tokens.includes(keyword))
            return keyword;
    }
    return undefined;
}
export function evaluateDistress(input) {
    const crisis = detectCrisis(input);
    if (crisis.isCrisis) {
        return { level: 'hard', crisisType: crisis.crisisType };
    }
    const softMatch = softDistressKeyword(input);
    if (softMatch) {
        return { level: 'soft', matchedKeyword: softMatch };
    }
    return { level: 'none' };
}
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/';
export const US_988_FOUNDER_VERIFIED = false;
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
        text: HARD_CRISIS_TEXT[locale],
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
        text: ABUSE_TEXT[locale],
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
    return { ...SOFT_DISTRESS_RESOURCE_BLOCK, locale, text: softText(locale) };
}
export function distressBlockFor(hint, locale = 'en') {
    const h = typeof hint === 'string' ? { level: hint } : hint;
    if (h.level === 'hard')
        return h.crisisType === 'abuse' ? abuseBlockFor(locale) : selfHarmBlockFor(locale);
    if (h.level === 'soft')
        return softDistressBlockFor(locale);
    return undefined;
}
//# sourceMappingURL=crisis-keywords.js.map