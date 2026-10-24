import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalisePhrase } from './context-matcher.js';
import { THEMES_2_5_0 } from './themes-2-5-0.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
export const THEMATIC_INDEX = JSON.parse(readFileSync(path.join(DATA_DIR, 'thematic-verses.json'), 'utf-8'));
export const AVAILABLE_THEMES = [...new Set(THEMATIC_INDEX.flatMap((v) => v.themes))];
const BASE_SYNONYMS = {
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
    unhappy: 'grief', miserable: 'grief', crying: 'grief', tears: 'grief', funeral: 'grief',
    widow: 'grief', widowed: 'grief', orphan: 'grief',
    guilt: 'forgiveness', guilty: 'forgiveness', regret: 'forgiveness', remorse: 'forgiveness',
    shame: 'forgiveness', ashamed: 'forgiveness', wrongdoing: 'forgiveness', compassion: 'forgiveness',
    forgiving: 'forgiveness', merciful: 'forgiveness', rahma: 'forgiveness', rahmah: 'forgiveness',
    anger: 'patience', angry: 'patience', rage: 'patience', frustrated: 'patience', frustration: 'patience',
    trial: 'encouragement', trials: 'encouragement', struggle: 'encouragement', struggling: 'encouragement',
    difficult: 'encouragement', difficulties: 'encouragement', relief: 'encouragement', burden: 'encouragement',
    weak: 'encouragement', weakness: 'encouragement', tired: 'encouragement', tiredness: 'encouragement',
    exhausted: 'encouragement', burnout: 'encouragement',
    blessed: 'gratitude',
    iftar: 'ramadan', suhoor: 'ramadan', taraweeh: 'ramadan',
    khutbah: 'friday',
    optimism: 'hope', optimistic: 'hope',
};
export const THEME_SYNONYMS = {
    ...Object.fromEntries(THEMES_2_5_0.flatMap((t) => t.words.map((w) => [w, t.theme]))),
    ...BASE_SYNONYMS,
};
export const THEME_PHRASES = [
    { phrase: 'fear of allah', theme: null },
    { phrase: 'death of a child', theme: 'grief' },
    { phrase: 'why me', theme: 'encouragement' },
    { phrase: 'giving up', theme: 'encouragement' },
    { phrase: 'thank you allah', theme: 'gratitude' },
    { phrase: 'grateful heart', theme: 'gratitude' },
    { phrase: 'night of power', theme: 'ramadan' },
    { phrase: 'night of decree', theme: 'ramadan' },
    { phrase: 'give up', theme: 'hope' },
    { phrase: 'give in', theme: 'hope' },
    ...THEMES_2_5_0.flatMap((t) => t.phrases.map((phrase) => ({ phrase, theme: t.theme }))),
];
export const PHRASE_EXCLUSIONS = [
    ...THEME_PHRASES.filter((p) => p.theme === null).map((p) => ({ phrase: p.phrase, word: p.phrase.split(' ')[0] })),
    { phrase: 'loss of faith', word: 'loss' },
];
const PHRASES_BY_LENGTH = [...THEME_PHRASES].map((p) => ({ ...p, words: p.phrase.split(' ') })).sort((a, b) => b.words.length - a.words.length);
export const ABUSE_WORDS = ['abuse', 'abused', 'abuses', 'abusing', 'abusive', 'abuser', 'abusers', 'violence', 'violent'];
const NEW_THEMES = new Set(THEMES_2_5_0.map((t) => t.theme));
export function matchThemes(query) {
    const known = new Set(AVAILABLE_THEMES);
    const lookup = (w) => (known.has(w) ? w : undefined) ?? THEME_SYNONYMS[w];
    const out = [];
    const add = (theme, via) => {
        if (theme && known.has(theme) && !out.some((m) => m.theme === theme))
            out.push({ theme, via });
    };
    const words = normalisePhrase(query).split(' ').filter(Boolean);
    for (let i = 0; i < words.length;) {
        const phrase = PHRASES_BY_LENGTH.find((p) => p.words.every((w, k) => words[i + k] === w));
        if (phrase) {
            add(phrase.theme, phrase.phrase);
            i += phrase.words.length;
            continue;
        }
        const word = words[i];
        add(lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined), word);
        i += 1;
    }
    return words.some((w) => ABUSE_WORDS.includes(w)) ? out.filter((m) => !NEW_THEMES.has(m.theme)) : out;
}
const NEW_THEME = new Map(THEMES_2_5_0.map((t) => [t.theme, t]));
export function versesForMatches(matches, limit) {
    const out = [];
    for (const m of matches) {
        const t = NEW_THEME.get(m.theme);
        const pool = t
            ? (t.refsByTrigger?.[m.via] ?? t.refs).map((ref) => THEMATIC_INDEX.find((v) => v.ref === ref)).filter((v) => Boolean(v))
            : THEMATIC_INDEX.filter((v) => v.themes.includes(m.theme));
        for (const v of pool) {
            if (out.length >= limit)
                return out;
            if (!out.includes(v))
                out.push(v);
        }
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