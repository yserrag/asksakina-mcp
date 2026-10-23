import { EN_COUNTRY_NAMES, EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from './crisis-en-fallback-strings.js';
import { digitsOnly } from './crisis-text-l10n.js';
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/';
export const BN_FA_LINES_FOUNDER_VERIFIED = {
    verifiedBy: 'Founder',
    date: '2026-10-22',
    lines: {
        'bn-emergency-999': '999',
        'bd-mowca-109': '109',
        'bn-kaan-pete-roi': '09612119911',
        'fa-emergency-123': '123',
        'fa-social-emergency-1480': '1480',
    },
};
export const EN_SELF_HARM_OPENING = 'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now.';
export const EN_SELF_HARM_CALL = 'Call your local emergency services, or contact a crisis helpline:';
export const EN_SELF_HARM_IASP = `Or visit ${IASP} for international crisis lines.`;
export const EN_ABUSE_DANGER = 'If you are in immediate danger, call your local emergency services.';
function helplineLine(id) {
    const f = EN_FALLBACK_FIELDS[id];
    const country = EN_COUNTRY_NAMES[f.country];
    if (!country)
        throw new Error(`WO#488: no countries.${f.country} in the en bundle (${id})`);
    const number = digitsOnly(f.phone);
    const verified = BN_FA_LINES_FOUNDER_VERIFIED.lines[id];
    if (verified !== number)
        throw new Error(`#564: ${id} (${number}) is not a Founder-verified line (verified: ${verified ?? 'none'})`);
    return `${f.name} (${country}): ${number} (${f.hours})`;
}
export function enFallbackSelfHarmText(l) {
    return [EN_SELF_HARM_OPENING, EN_SELF_HARM_CALL, ...EN_FALLBACK_IDS[l]['self-harm'].map(helplineLine), EN_SELF_HARM_IASP].join('\n');
}
export function enFallbackAbuseText(l, abuseSentence) {
    return [abuseSentence, ...EN_FALLBACK_IDS[l].abuse.map(helplineLine), EN_ABUSE_DANGER].join('\n');
}
//# sourceMappingURL=crisis-text-en-fallback.js.map