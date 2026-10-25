export const PARENT_WORDS = [
    'mother', 'mothers', 'mum', 'mums', 'mom', 'moms',
    'father', 'fathers', 'dad', 'dads',
    'parent', 'parents',
];
export const MORE_PARENT_WORDS = [
    'mama', 'mamma', 'papa', 'abba', 'ammi', 'ami', 'baba',
    'stepdad', 'stepdads', 'stepfather', 'stepfathers', 'stepmum', 'stepmums', 'stepmom', 'stepmoms', 'stepmother', 'stepmothers',
    'stepparent', 'stepparents',
];
export const PARENT_HARM_PARENTS = new Set([...PARENT_WORDS, ...MORE_PARENT_WORDS]);
export const HARM_WORDS = new Set([
    'hurt', 'hurts', 'hurting', 'hit', 'hits', 'hitting', 'beat', 'beats', 'beating', 'beaten',
    'slap', 'slaps', 'slapped', 'slapping', 'punch', 'punches', 'punched', 'kick', 'kicks', 'kicked',
    'abuse', 'abuses', 'abused', 'abusing', 'abusive', 'cruel', 'cruelty', 'violent', 'violence',
    'harm', 'harms', 'harmed', 'harming', 'threaten', 'threatens', 'threatened', 'threatening',
    'scream', 'screams', 'screaming', 'yell', 'yells', 'yelling', 'shout', 'shouts', 'shouting',
    'insult', 'insults', 'insulted', 'humiliate', 'humiliates', 'humiliated', 'bully', 'bullies', 'bullied',
    'control', 'controls', 'controlling', 'manipulate', 'manipulates', 'manipulative', 'neglect', 'neglects', 'neglected',
    'toxic', 'hate', 'hates', 'scared', 'afraid', 'terrified', 'unsafe', 'locks', 'locked', 'starve', 'starves',
    'choke', 'chokes', 'burn', 'burns', 'lock',
]);
export const HARM_PHRASES = [
    ['treat', 'me', 'badly'], ['treats', 'me', 'badly'], ['treated', 'me', 'badly'],
    ['kicked', 'me', 'out'], ['kick', 'me', 'out'], ['throw', 'me', 'out'], ['threw', 'me', 'out'],
];
export function queryWords(text) {
    return text
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}
export function mentionsParentHarm(text) {
    const w = queryWords(text);
    if (!w.some((x) => PARENT_HARM_PARENTS.has(x)))
        return false;
    if (w.some((x) => HARM_WORDS.has(x)))
        return true;
    const joined = ` ${w.join(' ')} `;
    return HARM_PHRASES.some((p) => joined.includes(` ${p.join(' ')} `));
}
export const PARENT_HARM_WITHHELD_VERSES = [
    { surah: 17, ayah: 23 },
    { surah: 17, ayah: 24 },
    { surah: 31, ayah: 14 },
    { surah: 31, ayah: 15 },
    { surah: 46, ayah: 15 },
    { surah: 66, ayah: 6 },
];
export function withheldRange(surah, from, to) {
    return PARENT_HARM_WITHHELD_VERSES.some((w) => w.surah === surah && from <= w.ayah && w.ayah <= to);
}
export function citesWithheldVerse(reference) {
    if (!reference)
        return false;
    for (const m of reference.matchAll(/(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g)) {
        if (withheldRange(+m[1], +m[2], +(m[3] ?? m[2])))
            return true;
    }
    return false;
}
export const PARENT_HARM_WITHHELD_STRINGS = [
    { kind: 'mood-dua', mood: 'lonely', sub: 'relationship_related', key: 'Abu Dawud 969 (Part of the salaam)' },
    { kind: 'mood-dua', mood: 'lonely', sub: 'social_related', key: 'Abu Dawud 969' },
    { kind: 'mood-verse', mood: 'sad', sub: 'parenting_related', key: 'Surah Al-Ankabut 29:8' },
    { kind: 'mood-message', mood: 'angry', sub: 'family_related' },
    { kind: 'mood-dua', mood: 'angry', sub: 'family_related', key: 'Quran 14:41' },
    { kind: 'situation-field', situation: 'marriage', path: 'verses[4].translation' },
    { kind: 'situation-field', situation: 'parenting', path: 'verses[4].translation' },
    { kind: 'situation-field', situation: 'family-conflict', path: 'verses[0].translation' },
    { kind: 'situation-field', situation: 'family-conflict', path: 'verses[1].translation' },
    { kind: 'situation-field', situation: 'family-conflict', path: 'verses[1].reflection' },
    { kind: 'situation-field', situation: 'family-conflict', path: 'verses[2].reflection' },
];
export function isWithheldMoodItem(kind, mood, sub, key) {
    if (!sub)
        return false;
    return PARENT_HARM_WITHHELD_STRINGS.some((w) => w.kind === kind && w.mood === mood && w.sub === sub && (w.kind === 'mood-message' || w.key === key));
}
export function situationHasWithheldField(situationId) {
    return PARENT_HARM_WITHHELD_STRINGS.some((w) => w.kind === 'situation-field' && w.situation === situationId);
}
//# sourceMappingURL=parent-harm-rules.js.map