import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalisePhrase } from './context-matcher.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
export const THEMATIC_INDEX = JSON.parse(readFileSync(path.join(DATA_DIR, 'thematic-verses.json'), 'utf-8'));
export const AVAILABLE_THEMES = [...new Set(THEMATIC_INDEX.flatMap((v) => v.themes))];
export const THEME_SYNONYMS = {
    anxious: 'anxiety', worry: 'anxiety', worried: 'anxiety', worrying: 'anxiety',
    stress: 'anxiety', stressed: 'anxiety', overwhelmed: 'anxiety', panic: 'anxiety',
    nervous: 'anxiety', fear: 'anxiety', afraid: 'anxiety', scared: 'anxiety',
    peace: 'anxiety', calm: 'anxiety',
    grateful: 'gratitude', thankful: 'gratitude', thanks: 'gratitude', thank: 'gratitude',
    thanking: 'gratitude', blessing: 'gratitude', blessings: 'gratitude', shukr: 'gratitude',
    alhamdulillah: 'gratitude',
    patient: 'patience', sabr: 'patience', steadfast: 'patience', steadfastness: 'patience',
    endurance: 'patience', endure: 'patience', persevere: 'patience', perseverance: 'patience',
    tawakkul: 'trust', reliance: 'trust', rely: 'trust', relying: 'trust', decree: 'trust',
    destiny: 'trust',
    sad: 'grief', sadness: 'grief', sorrow: 'grief', grieving: 'grief', grieve: 'grief',
    loss: 'grief', bereaved: 'grief', bereavement: 'grief', mourning: 'grief',
    heartbroken: 'grief', heartbreak: 'grief',
    hopeful: 'hope', hopeless: 'hope', hopelessness: 'hope', despair: 'hope', despairing: 'hope',
    dawn: 'morning', fajr: 'morning', daybreak: 'morning',
    jumuah: 'friday', jummah: 'friday',
    ramadhan: 'ramadan', fasting: 'ramadan', qadr: 'ramadan',
    encourage: 'encouragement', encouraging: 'encouragement', strength: 'encouragement',
    hardship: 'encouragement', difficulty: 'encouragement', ease: 'encouragement',
    forgive: 'forgiveness', forgiven: 'forgiveness', repent: 'forgiveness',
    repentance: 'forgiveness', tawbah: 'forgiveness', istighfar: 'forgiveness',
    sin: 'forgiveness', sins: 'forgiveness', mercy: 'forgiveness',
};
export const PHRASE_EXCLUSIONS = [
    { phrase: 'loss of faith', word: 'loss' },
    { phrase: 'fear of allah', word: 'fear' },
];
export function matchThemes(query) {
    const known = new Set(AVAILABLE_THEMES);
    const lookup = (w) => (known.has(w) ? w : undefined) ?? THEME_SYNONYMS[w];
    const out = [];
    const normalised = normalisePhrase(query);
    const excluded = new Set(PHRASE_EXCLUSIONS.filter((e) => normalised.includes(e.phrase)).map((e) => e.word));
    for (const word of normalised.split(' ')) {
        if (!word)
            continue;
        if (excluded.has(word))
            continue;
        const theme = lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined);
        if (theme && known.has(theme) && !out.some((m) => m.theme === theme))
            out.push({ theme, via: word });
    }
    return out;
}
export function versesForThemes(themes, limit) {
    const out = [];
    for (const theme of themes) {
        for (const v of THEMATIC_INDEX) {
            if (out.length >= limit)
                return out;
            if (v.themes.includes(theme) && !out.includes(v))
                out.push(v);
        }
    }
    return out;
}
//# sourceMappingURL=thematic.js.map