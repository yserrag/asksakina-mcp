import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
const namesOfAllah = JSON.parse(readFileSync(path.join(DATA_DIR, 'names.json'), 'utf-8'));
function sanitise(input) {
    return input.split('\u{FDFA}').join(' (peace be upon him)').trim();
}
function meaningFor(name, locale) {
    if (locale === 'en')
        return name.meaning.en;
    if (locale === 'ur')
        return name.meaning.ur;
    if (locale === 'id')
        return name.meaning.id;
    return name.meaning.ar ?? name.meaning.en;
}
function descriptionFor(name, locale) {
    if (locale === 'en')
        return name.description.en;
    if (locale === 'ur')
        return name.description.ur;
    if (locale === 'id')
        return name.description.id;
    return name.description.ar ?? name.description.en;
}
function toRecord(name, locale) {
    const englishMeaning = sanitise(meaningFor(name, locale));
    const reflection = sanitise(descriptionFor(name, locale));
    const quranic_references = name.quranReferences ?? [];
    const refLine = quranic_references.length > 0
        ? `Quranic Reference: ${quranic_references.map((r) => `Quran ${r}`).join('; ')}`
        : null;
    const name_block = [
        `Arabic: ${name.arabic}`,
        `Transliteration: ${name.transliteration}`,
        `Meaning: ${englishMeaning}`,
        `Reflection: ${reflection}`,
        refLine,
    ]
        .filter(Boolean)
        .join('\n');
    return {
        name_block,
        number: name.number,
        arabic: name.arabic,
        transliteration: name.transliteration,
        english_meaning: englishMeaning,
        reflection,
        quranic_references,
    };
}
export function getNameByNumber(num, locale) {
    const found = namesOfAllah.find((n) => n.number === num);
    return found ? toRecord(found, locale) : null;
}
export function findNameByString(input, locale) {
    const normalised = stripDiacritics(input).toLowerCase().trim();
    const asNumber = Number(input);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 99) {
        return getNameByNumber(asNumber, locale);
    }
    for (const name of namesOfAllah) {
        if (stripDiacritics(name.transliteration).toLowerCase() === normalised) {
            return toRecord(name, locale);
        }
        if (stripDiacritics(name.arabic) === stripDiacritics(input.trim()))
            return toRecord(name, locale);
    }
    for (const name of namesOfAllah) {
        if (name.meaning.en.toLowerCase().includes(normalised)) {
            return toRecord(name, locale);
        }
    }
    return null;
}
function stripDiacritics(s) {
    return s.normalize('NFD').replace(/\p{M}/gu, '');
}
export const TOTAL_NAMES = namesOfAllah.length;
//# sourceMappingURL=names.js.map