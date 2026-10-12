const ZERO_WIDTH = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const UNICODE_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const SEPARATOR_RUN = /[\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D_.\u2024\u2026#]+/g;
const PUNCT_RUN = /[\p{P}\p{S}]{2,}/gu;
export function stripZeroWidth(s) {
    return s.replace(ZERO_WIDTH, '');
}
export function normaliseSeparators(s) {
    return stripZeroWidth(s)
        .replace(UNICODE_SPACE, ' ')
        .replace(SEPARATOR_RUN, ' ')
        .replace(PUNCT_RUN, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
const SINGLE = /^[a-z0-9@$]$/;
export function collapseLetterSpacing(s) {
    const tokens = s.split(' ');
    const out = [];
    for (let i = 0; i < tokens.length;) {
        let j = i;
        while (j < tokens.length && SINGLE.test(tokens[j]))
            j++;
        if (j - i >= 3) {
            out.push(tokens.slice(i, j).join(''));
            i = j;
        }
        else {
            out.push(tokens[i]);
            i++;
        }
    }
    return out.join(' ');
}
const LEET = { '!': 'i', '3': 'e', '0': 'o', '@': 'a', '4': 'a', '5': 's', '$': 's', '7': 't' };
export function unLeet(s, one = 'i') {
    return s.replace(/[1!30@45$7]/g, (c) => (c === '1' ? one : LEET[c]));
}
const MAX_ONES_FOR_COMBINATIONS = 6;
export function leetVariants(s) {
    const ones = [...s].filter((c) => c === '1').length;
    if (ones === 0)
        return [unLeet(s)];
    if (ones > MAX_ONES_FOR_COMBINATIONS)
        return [unLeet(s, 'i'), unLeet(s, 'l')];
    const out = [];
    for (let mask = 0; mask < 1 << ones; mask++) {
        let k = 0;
        const withOnes = s.replace(/1/g, () => ((mask >> k++) & 1 ? 'l' : 'i'));
        out.push(unLeet(withOnes));
    }
    return out;
}
export function collapseRepeats(s) {
    return [s.replace(/([a-z])\1{2,}/g, '$1'), s.replace(/([a-z])\1{2,}/g, '$1$1')];
}
export function englishVariants(base) {
    const out = new Set([base, ...collapseRepeats(base)]);
    for (const leet of leetVariants(base)) {
        out.add(leet);
        for (const r of collapseRepeats(leet))
            out.add(r);
    }
    return [...out];
}
function afterGluedPronoun(haystack, i) {
    for (const p of SQUASH_PREFIXES) {
        const at = i - p.length;
        if (at >= 0 && haystack.startsWith(p, at) && (at === 0 || !WORD_CHAR.test(haystack[at - 1])))
            return true;
    }
    return false;
}
const WORD_CHAR = /[\p{L}\p{N}]/u;
const INFLECTION = /^(?:ing|ed|s|er)(?![\p{L}\p{N}])/u;
export function boundedIncludes(haystack, needle, openEnd = false, suppressAfter) {
    for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
        if (i > 0 && WORD_CHAR.test(haystack[i - 1]) && !afterGluedPronoun(haystack, i))
            continue;
        const plain = i + needle.length;
        let repeated = plain;
        const last = needle[needle.length - 1];
        while (haystack[repeated] === last)
            repeated++;
        for (const end of plain === repeated ? [plain] : [plain, repeated]) {
            const rest = haystack.slice(end);
            if (suppressAfter && suppressAfter.test(rest))
                continue;
            if (openEnd || !rest || !WORD_CHAR.test(rest[0]) || INFLECTION.test(rest))
                return true;
        }
    }
    return false;
}
const SQUASH_PREFIXES = ['i', 'im', 'my', 'me', 'he', 'she', 'we', 'they', 'his', 'her', 'our', 'your', 'u'];
export function matchesSquashed(input, keyword) {
    const squashedKw = keyword.replace(/ /g, '');
    if (!squashedKw)
        return false;
    const starts = new Set();
    const ends = new Set();
    let squashed = '';
    for (const t of input.split(' ')) {
        if (!t)
            continue;
        starts.add(squashed.length);
        for (const p of SQUASH_PREFIXES)
            if (t.length > p.length && t.startsWith(p))
                starts.add(squashed.length + p.length);
        squashed += t;
        ends.add(squashed.length);
    }
    for (let i = squashed.indexOf(squashedKw); i >= 0; i = squashed.indexOf(squashedKw, i + 1)) {
        if (starts.has(i) && ends.has(i + squashedKw.length))
            return true;
    }
    return false;
}
export function isSquashable(keyword) {
    return /^[a-z0-9 ]+$/.test(keyword) && keyword.replace(/ /g, '').length >= 6;
}
//# sourceMappingURL=crisis-normalise.js.map