export const LRI = String.fromCodePoint(0x2066);
export const RLI = String.fromCodePoint(0x2067);
export const PDI = String.fromCodePoint(0x2069);
export function ltr(s) {
    return `${LRI}${s}${PDI}`;
}
export function rtl(s) {
    return `${RLI}${s}${PDI}`;
}
export function isolatesBalanced(s) {
    let depth = 0;
    for (const ch of s) {
        if (ch === LRI || ch === RLI || ch === '⁨')
            depth++;
        else if (ch === PDI) {
            if (depth === 0)
                return false;
            depth--;
        }
    }
    return depth === 0;
}
export function hasBidiMarks(s) {
    return /[⁦-⁩‪-‮‎‏]/.test(s);
}
//# sourceMappingURL=bidi.js.map