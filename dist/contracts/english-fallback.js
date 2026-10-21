export const ENGLISH_FALLBACK_GUARD = "Present the English fallback content exactly as provided. Do not attempt to translate this content into the user's requested language.";
export const TEACH_ENGLISH_NOTE = 'This teaching note is in English.';
const LANGUAGE = { ar: 'Arabic', ur: 'Urdu', id: 'Indonesian', tr: 'Turkish' };
function withArticle(language) {
    return `${/^[AEIOU]/.test(language) ? 'an' : 'a'} ${language}`;
}
function languageOf(locale) {
    return locale === 'en' ? undefined : LANGUAGE[locale];
}
export function duaEnglishNote(locale) {
    const language = languageOf(locale);
    if (!language)
        return undefined;
    return `Du'a translations are in English; ${withArticle(language)} translation is not yet available. Tell the user the du'as below are in English.`;
}
export function nameEnglishNote(locale) {
    const language = languageOf(locale);
    if (!language)
        return undefined;
    return `Name meanings and reflections are in English; ${withArticle(language)} translation is not yet available. Tell the user the meaning and reflection below are in English.`;
}
//# sourceMappingURL=english-fallback.js.map