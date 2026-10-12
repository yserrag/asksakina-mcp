const LATIN_FOLD_MAP = {
    ı: 'i', İ: 'i', I: 'i',
    ş: 's', Ş: 's',
    ç: 'c', Ç: 'c',
    ğ: 'g', Ğ: 'g',
    ö: 'o', Ö: 'o',
    ü: 'u', Ü: 'u',
};
const COMBINING_DOT_ABOVE = /̇/g;
export function foldLatin(input) {
    if (!input)
        return '';
    let out = '';
    for (const ch of input.normalize('NFC')) {
        out += LATIN_FOLD_MAP[ch] ?? ch;
    }
    return out.replace(COMBINING_DOT_ABOVE, '');
}
//# sourceMappingURL=latin-fold.js.map