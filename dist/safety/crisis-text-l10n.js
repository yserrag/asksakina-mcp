import { ltr, rtl } from './bidi.js';
import { ABUSE_IDS, COUNTRY_NAMES, HELPLINE_FIELDS, IASP_URL, IMMEDIATE_DANGER, L10N_HOURS, L10N_STRINGS, SELF_HARM_IDS, TR_ABUSE_LINES, } from './crisis-l10n-strings.js';
const isRtl = (l) => l === 'ar' || l === 'ur';
function iasp(l) {
    return isRtl(l) ? ltr(IASP_URL) : IASP_URL;
}
function fill(s, l) {
    return s.split('[IASP]').join(iasp(l));
}
const UR_NAMES = {
    'ur-umang': 'Umang Helpline',
    'ur-rozan': 'Rozan Counselling',
    'ur-madadgaar': 'Madadgaar National Helpline',
};
function nameOf(id, l) {
    if (l === 'ur')
        return UR_NAMES[id] ?? HELPLINE_FIELDS[id].name;
    const name = HELPLINE_FIELDS[id].name;
    const join = l === 'ar' && ARABIC_SCRIPT.test(name) ? '\u060C ' : ', ';
    return name.split(' \u2014 ').join(join);
}
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN_RUN = /[A-Za-z0-9](?:[A-Za-z0-9 ,.&'()-]*[A-Za-z0-9)])?/g;
function isolateLatinRuns(s) {
    return s.replace(LATIN_RUN, (run) => ltr(run));
}
export const PHONE_SEPARATORS = /[ -]/g;
export function digitsOnly(phone) {
    return phone.replace(PHONE_SEPARATORS, '');
}
function numberOf(id, l) {
    if (id === 'id-sejiwa')
        return '119, lalu tekan 8';
    const phone = HELPLINE_FIELDS[id].phone;
    return isRtl(l) ? digitsOnly(phone) : phone;
}
function countryOf(id, l) {
    const code = HELPLINE_FIELDS[id].country;
    const name = COUNTRY_NAMES[l][code];
    if (!name)
        throw new Error(`WO#481: no countries.${code} in the ${l} bundle (${id})`);
    return name;
}
function hoursOf(id, l) {
    const token = HELPLINE_FIELDS[id].hours ?? '';
    if (l === 'ar') {
        const h = L10N_HOURS.ar;
        if (token === '24/7')
            return h['24/7'];
        if (token === 'Office hours')
            return h.office;
        if (token === '8am–8pm daily (Sat 1pm–8pm)')
            return h.saudi;
        if (token === '8am–8pm')
            return h.uae;
    }
    if (l === 'ur') {
        const h = L10N_HOURS.ur;
        if (token === '24/7')
            return h['24/7'];
        if (token === 'Business hours')
            return h.business;
    }
    if (l === 'id') {
        if (id === 'id-sejiwa' || token === '24/7')
            return '24/7';
        return token;
    }
    throw new Error(`WO#481: no ${l} hours for ${id} ("${token}")`);
}
function helplineLine(id, l) {
    const name = nameOf(id, l);
    const country = countryOf(id, l);
    const number = numberOf(id, l);
    const hours = hoursOf(id, l);
    if (!isRtl(l))
        return `${name} (${country}): ${number} (${hours})`;
    const isoName = isolateLatinRuns(name);
    const isoHours = hours === '24/7' ? ltr(hours) : rtl(hours);
    return `${isoName} (${country}): ${ltr(number)} (${isoHours})`;
}
function trAbuseLines() {
    return TR_ABUSE_LINES.map((line) => {
        const id = ABUSE_IDS.tr.find((i) => line.includes(`: ${HELPLINE_FIELDS[i].phone} (`));
        if (!id)
            return line;
        const at = line.indexOf(': ');
        return `${line.slice(0, at)} (${countryOf(id, 'tr')})${line.slice(at)}`;
    });
}
export function selfHarmText(l) {
    if (l === 'tr') {
        const s = L10N_STRINGS.tr;
        return [s.T1, s.T4, fill(s.T5, l)].join('\n');
    }
    const s = L10N_STRINGS[l];
    return [s.T1, s.T2, ...SELF_HARM_IDS[l].map((id) => helplineLine(id, l)), fill(s.T3, l)].join('\n');
}
export function abuseText(l) {
    const s = L10N_STRINGS[l];
    const paragraph = [s.T6a, s.T6b, s.T6c].join(' ');
    if (l === 'tr')
        return [paragraph, ...trAbuseLines(), IMMEDIATE_DANGER.tr].join('\n');
    const lines = ABUSE_IDS[l].map((id) => helplineLine(id, l));
    if (l === 'ar')
        return [paragraph, L10N_STRINGS.ar.T7, ...lines, IMMEDIATE_DANGER.ar].join('\n');
    if (l === 'ur')
        return [paragraph, ...lines, IMMEDIATE_DANGER.ur].join('\n');
    return [paragraph, ...lines, L10N_STRINGS.id.T8].join('\n');
}
export function softText(l) {
    const s = L10N_STRINGS[l];
    return [s.T9a, fill(s.T9b, l)].join(' ');
}
//# sourceMappingURL=crisis-text-l10n.js.map