const ARABIC_DIACRITIC_REGEX = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const HAMZA_FORMS_REGEX = /[آأإ]/g;
const TAA_MARBUTA_REGEX = /ة/g;
const ALIF_MAQSURA_REGEX = /ى/g;
const TATWEEL_REGEX = /ـ/g;
const PERSIAN_YEH_REGEX = /ی/g;
const PERSIAN_KEH_REGEX = /ک/g;
const NOON_GHUNNA_REGEX = /ں/g;
const ZWNJ_REGEX = /\u200C/g;
export function normaliseArabic(text) {
    if (!text)
        return '';
    const decomposed = text.normalize('NFKD');
    return decomposed
        .replace(ZWNJ_REGEX, '')
        .replace(ARABIC_DIACRITIC_REGEX, '')
        .replace(HAMZA_FORMS_REGEX, 'ا')
        .replace(TAA_MARBUTA_REGEX, 'ه')
        .replace(ALIF_MAQSURA_REGEX, 'ي')
        .replace(PERSIAN_YEH_REGEX, 'ي')
        .replace(PERSIAN_KEH_REGEX, 'ك')
        .replace(NOON_GHUNNA_REGEX, 'ن')
        .replace(TATWEEL_REGEX, '')
        .replace(/\s+/g, ' ')
        .trim();
}
export function containsArabic(text) {
    return /[؀-ۿ]/.test(text);
}
//# sourceMappingURL=arabic-normalise.js.map