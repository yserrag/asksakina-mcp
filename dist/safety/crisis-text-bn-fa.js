import { ltr, rtl } from './bidi.js';
import { BN_FA_CRISIS_TEXT } from './crisis-bn-fa-strings.js';
import { EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from './crisis-en-fallback-strings.js';
import { digitsOnly } from './crisis-text-l10n.js';
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/';
const DHULM = '(dhulm)';
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
const HELPLINE_LINE = /^(.+\)): ([0-9]+) \((.+)\)$/u;
const DIGIT_TOKEN = /[0-9]+(?::[0-9]+|\/[0-9]+)?/g;
const tokens = (s) => s.match(DIGIT_TOKEN) ?? [];
export function verifyBnFaLines(l, kind, text) {
    const ids = kind === 'soft' ? [] : EN_FALLBACK_IDS[l][kind];
    const lines = text.split('\n').map((x) => HELPLINE_LINE.exec(x)).filter((m) => m !== null);
    const where = `WO#490 ${l} ${kind}`;
    if (lines.length !== ids.length)
        throw new Error(`${where}: ${lines.length} helpline lines, expected ${ids.length}`);
    ids.forEach((id, i) => {
        const verified = BN_FA_LINES_FOUNDER_VERIFIED.lines[id];
        const f = EN_FALLBACK_FIELDS[id];
        const [, , number, hours] = lines[i];
        if (!verified || verified !== digitsOnly(f.phone))
            throw new Error(`${where}: ${id} is not a Founder-verified line`);
        if (number !== verified)
            throw new Error(`${where}: line ${i + 1} has ${number}, the Founder-verified ${id} is ${verified}`);
        if (tokens(hours).join() !== tokens(f.hours).join())
            throw new Error(`${where}: line ${i + 1} hours (${tokens(hours).join()}) differ from helplines.ts (${tokens(f.hours).join()})`);
    });
}
const count = (s, part) => s.split(part).length - 1;
function isolateFa(kind, text) {
    const out = text.split('\n').map((line) => {
        const m = HELPLINE_LINE.exec(line);
        if (!m)
            return line;
        const [, head, number, hours] = m;
        const isoHours = hours === '24/7' ? ltr(hours) : rtl(hours.replace(DIGIT_TOKEN, (t) => ltr(t)));
        return `${head}: ${ltr(number)} (${isoHours})`;
    }).join('\n');
    const urls = count(out, IASP);
    const dhulm = count(out, DHULM);
    if (urls !== (kind === 'abuse' ? 0 : 1) || dhulm !== (kind === 'abuse' ? 1 : 0))
        throw new Error(`WO#490 fa ${kind}: ${urls} URL(s) and ${dhulm} "${DHULM}", not the expected text`);
    return out.split(IASP).join(ltr(IASP)).split(DHULM).join(ltr(DHULM));
}
export function unisolatedLatin(s) {
    const stripped = s.replace(/⁦[^⁦-⁩]*⁩/gu, '');
    return stripped.match(/[A-Za-z0-9]+/g) ?? [];
}
function build(l, kind) {
    const text = BN_FA_CRISIS_TEXT[`${l} ${kind}`];
    verifyBnFaLines(l, kind, text);
    if (l === 'bn')
        return text;
    const iso = isolateFa(kind, text);
    const left = unisolatedLatin(iso);
    if (left.length)
        throw new Error(`WO#490 fa ${kind}: Latin text outside an isolate: ${left.join(', ')}`);
    return iso;
}
const TEXT = {
    bn: { 'self-harm': build('bn', 'self-harm'), abuse: build('bn', 'abuse'), soft: build('bn', 'soft') },
    fa: { 'self-harm': build('fa', 'self-harm'), abuse: build('fa', 'abuse'), soft: build('fa', 'soft') },
};
export function bnFaText(l, kind) {
    return TEXT[l][kind];
}
//# sourceMappingURL=crisis-text-bn-fa.js.map