import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
let pickthall = null;
export function bundledPickthall(surah, ayah) {
    pickthall ??= JSON.parse(readFileSync(path.join(DATA_DIR, 'pickthall.json'), 'utf-8'));
    return pickthall.verses[`${surah}:${ayah}`];
}
const API_BASE = 'https://api.alquran.cloud/v1';
const TRANSLATION_EDITIONS = {
    en: { id: 'en.pickthall', label: 'Pickthall' },
    ar: { id: 'en.pickthall', label: 'Pickthall' },
};
export const PARKED_TRANSLATION_LOCALES = {
    ur: 'Urdu',
    id: 'Indonesian',
    tr: 'Turkish',
};
export function parkedTranslationNote(language) {
    return `A licensed ${language} translation is not yet available in AskSakina, so the English translation of the meaning (Pickthall) is provided instead.`;
}
const SURAH_NAMES = [];
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export async function fetchQuranVerse(surah, ayah, locale) {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
        throw new Error(`Invalid surah: ${surah}. Must be 1-114.`);
    }
    if (!Number.isInteger(ayah) || ayah < 1 || ayah > 286) {
        throw new Error(`Invalid ayah: ${ayah}.`);
    }
    const english = bundledPickthall(surah, ayah);
    if (english === undefined) {
        throw new Error(`Invalid ayah: ${surah}:${ayah} does not exist.`);
    }
    const editionEntry = TRANSLATION_EDITIONS[locale] ?? TRANSLATION_EDITIONS.en;
    const parked = PARKED_TRANSLATION_LOCALES[locale];
    const withNote = (r) => parked ? { ...r, translation_note: parkedTranslationNote(parked) } : r;
    const cacheKey = `${surah}:${ayah}:${editionEntry.id}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS)
        return withNote(cached.record);
    const url = `${API_BASE}/ayah/${surah}:${ayah}/editions/quran-uthmani,${editionEntry.id}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Quran upstream returned HTTP ${res.status}`);
    }
    const data = (await res.json());
    const arabicEntry = data.data?.[0];
    if (!arabicEntry) {
        throw new Error('Quran upstream returned an unexpected payload shape');
    }
    const record = {
        surah_number: surah,
        surah_name_arabic: arabicEntry.surah?.name ?? '',
        surah_name_english: arabicEntry.surah?.englishName ?? '',
        ayah,
        arabic_text: stripPrependedBasmala(surah, ayah, stripUnicodeProphetSalutation(arabicEntry.text)),
        translation: stripUnicodeProphetSalutation(english),
        translation_source: editionEntry.label,
        translation_language: 'en',
    };
    cache.set(cacheKey, { record, cachedAt: now });
    return withNote(record);
}
export const BASMALA_PREFIX_PLAIN = '\u0628\u0650\u0633\u0652\u0645\u0650\u0020\u0671\u0644\u0644\u0651\u064E\u0647\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650\u0020';
export const BASMALA_PREFIX_SHADDA = '\u0628\u0651\u0650\u0633\u0652\u0645\u0650\u0020\u0671\u0644\u0644\u0651\u064E\u0647\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650\u0020\u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650\u0020';
export const STRIP_PREFIXED_BASMALA = true;
let basmalaPrefixMismatch = 0;
let mismatchLogged = false;
export function getBasmalaPrefixMismatchCount() {
    return basmalaPrefixMismatch;
}
export function stripPrependedBasmala(surah, ayah, text, stripBasmala = STRIP_PREFIXED_BASMALA) {
    const t = text.startsWith('\uFEFF') ? text.slice(1) : text;
    if (!stripBasmala || ayah !== 1 || surah < 2 || surah > 114 || surah === 9)
        return t;
    if (t.startsWith(BASMALA_PREFIX_PLAIN))
        return t.slice(BASMALA_PREFIX_PLAIN.length);
    if (t.startsWith(BASMALA_PREFIX_SHADDA))
        return t.slice(BASMALA_PREFIX_SHADDA.length);
    basmalaPrefixMismatch += 1;
    if (!mismatchLogged) {
        mismatchLogged = true;
        console.warn('[quran] basmala prefix mismatch on an ayah 1; served unchanged (count in /stats)');
    }
    return t;
}
function stripUnicodeProphetSalutation(input) {
    return input.split('\u{FDFA}').join(' (peace be upon him)');
}
export { SURAH_NAMES };
//# sourceMappingURL=quran.js.map