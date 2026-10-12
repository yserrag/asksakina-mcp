export const PHRASES = [
    ['lost my job', 'work-success'],
    ['lost job', 'work-success'],
    ['job loss', 'work-success'],
    ['job interview', 'work-success'],
    ['passed away', 'deceased'],
    ['passed on', 'deceased'],
    ['laylat al qadr', 'laylat-al-qadr'],
    ['laylatul qadr', 'laylat-al-qadr'],
    ['night of power', 'laylat-al-qadr'],
    ['night of decree', 'laylat-al-qadr'],
    ['cant sleep', 'before-sleep'],
    ['cannot sleep', 'before-sleep'],
    ['before sleep', 'before-sleep'],
    ['going to bed', 'before-sleep'],
    ['finished the quran', 'quran-completion'],
    ['completed the quran', 'quran-completion'],
    ['names of allah', 'allahs-names-duas'],
];
export const SYNONYMS = {
    loss: 'deceased', lost: 'deceased', losing: 'deceased', death: 'deceased', died: 'deceased',
    bereaved: 'deceased', bereavement: 'deceased', grieving: 'deceased', grieve: 'deceased',
    mourning: 'deceased', funeral: 'deceased', janazah: 'deceased', widow: 'deceased',
    widowed: 'deceased', condolences: 'deceased', deceased: 'deceased',
    anxious: 'stress-anxiety', worried: 'stress-anxiety', worrying: 'stress-anxiety',
    nervous: 'stress-anxiety', overwhelmed: 'stress-anxiety', stressed: 'stress-anxiety',
    panic: 'stress-anxiety', afraid: 'stress-anxiety', scared: 'stress-anxiety',
    sad: 'stress-anxiety', sadness: 'stress-anxiety',
    test: 'exams-study', tests: 'exams-study', studying: 'exams-study', revision: 'exams-study',
    school: 'exams-study', university: 'exams-study',
    ill: 'health-healing', unwell: 'health-healing', disease: 'health-healing',
    hospital: 'health-healing', surgery: 'health-healing', operation: 'health-healing',
    recovery: 'health-healing', recover: 'health-healing', pain: 'health-healing',
    cure: 'health-healing', cancer: 'health-healing',
    difficulty: 'calamity', difficult: 'calamity', trouble: 'calamity', trial: 'calamity',
    trials: 'calamity', disaster: 'calamity', struggling: 'calamity', struggle: 'calamity',
    sin: 'repentance', sins: 'repentance', sinned: 'repentance', regret: 'repentance',
    guilty: 'repentance', ashamed: 'repentance', shame: 'repentance', tawbah: 'repentance',
    istighfar: 'repentance',
    debts: 'wealth-debt', loan: 'wealth-debt', poverty: 'wealth-debt', rizq: 'wealth-debt',
    provision: 'wealth-debt', financial: 'wealth-debt', bills: 'wealth-debt',
    interview: 'work-success', promotion: 'work-success', business: 'work-success',
    unemployed: 'work-success', success: 'work-success',
    trip: 'travel', flight: 'travel', flying: 'travel', travelling: 'travel', traveling: 'travel',
    wedding: 'marriage', spouse: 'marriage', husband: 'marriage', wife: 'marriage',
    married: 'marriage', nikah: 'marriage',
    birth: 'pregnancy', childbirth: 'pregnancy', labour: 'pregnancy', labor: 'pregnancy',
    kids: 'children', son: 'children', daughter: 'children', baby: 'children',
    mum: 'mothers', mom: 'mothers', dad: 'fathers',
    bedtime: 'before-sleep', insomnia: 'before-sleep', sleepless: 'before-sleep',
    sleeping: 'before-sleep', wake: 'morning-adhkar', waking: 'morning-adhkar',
    sunset: 'evening-adhkar',
    grateful: 'gratitude', thankful: 'gratitude', blessed: 'gratitude', alhamdulillah: 'gratitude',
    decision: 'istikhara', decide: 'istikhara', choice: 'istikhara', choose: 'istikhara',
    confused: 'istikhara',
    ramadhan: 'ramadan', fast: 'fasting', fasting: 'fasting', iftar: 'fasting', suhoor: 'fasting',
    jummah: 'friday', mecca: 'umrah-hajj', makkah: 'umrah-hajj', qadr: 'laylat-al-qadr',
    khatm: 'quran-completion', khatam: 'quran-completion',
};
export const CATEGORY_PRIORITY = [
    'deceased', 'calamity', 'health-healing', 'stress-anxiety', 'repentance', 'exams-study',
    'wealth-debt', 'work-success', 'travel', 'istikhara', 'pregnancy', 'marriage',
    'laylat-al-qadr', 'umrah-hajj', 'ramadan', 'fasting', 'friday', 'before-sleep',
    'morning-adhkar', 'evening-adhkar', 'gratitude', 'quran-completion', 'children', 'mothers',
    'fathers', 'allahs-names-duas', '99-names', 'rabana-duas', 'powerful-duas', 'general',
];
export function normalisePhrase(input) {
    return input
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[‘’ʼ`]/g, "'")
        .replace(/'/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
const rank = (slug) => {
    const i = CATEGORY_PRIORITY.indexOf(slug);
    return i < 0 ? CATEGORY_PRIORITY.length : i;
};
export function matchPhrase(input, categories, aliases) {
    const text = normalisePhrase(input);
    if (!text)
        return null;
    const known = new Set(categories.map((c) => c.slug));
    const padded = ` ${text} `;
    const phraseHits = PHRASES.filter(([p, slug]) => known.has(slug) && padded.includes(` ${p} `));
    if (phraseHits.length) {
        phraseHits.sort((a, b) => rank(a[1]) - rank(b[1]) || padded.indexOf(` ${a[0]} `) - padded.indexOf(` ${b[0]} `));
        return { slug: phraseHits[0][1], via: phraseHits[0][0] };
    }
    const tagIndex = new Map();
    for (const slug of [...known].sort((a, b) => rank(a) - rank(b))) {
        const t = categories.find((c) => c.slug === slug)?.tags;
        if (!t)
            continue;
        for (const tag of [...(t.time ?? []), ...(t.mood ?? []), ...(t.situation ?? []), ...(t.seasonal ?? [])]) {
            const w = tag.toLowerCase();
            if (w !== 'anytime' && !tagIndex.has(w))
                tagIndex.set(w, slug);
        }
    }
    const lookup = (w) => (known.has(w) ? w : undefined) ?? aliases[w] ?? SYNONYMS[w] ?? tagIndex.get(w);
    const hits = [];
    text.split(' ').forEach((word, pos) => {
        const slug = lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined);
        if (slug && known.has(slug))
            hits.push({ slug, via: word, pos });
    });
    if (!hits.length)
        return null;
    hits.sort((a, b) => rank(a.slug) - rank(b.slug) || a.pos - b.pos);
    return { slug: hits[0].slug, via: hits[0].via };
}
const RITE_WORDS = new Set([
    'funeral', 'janazah', 'janaza', 'burial', 'bury', 'buried', 'grave', 'graves', 'graveside',
    'cemetery', 'condolence', 'condolences', 'deceased', 'dead',
]);
const GRIEF_WORDS = new Set([
    'grief', 'grieving', 'grieve', 'bereaved', 'bereavement', 'mourning', 'heartbroken', 'heartbreak',
]);
const LOSS_EVENT_WORDS = new Set(['lost', 'losing', 'loss', 'died', 'death', 'passed', 'widow', 'widowed']);
const FIRST_PERSON = new Set(['i', 'im', 'ive', 'id', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our']);
export function griefRoute(input) {
    const words = normalisePhrase(input).split(' ');
    if (words.some((w) => RITE_WORDS.has(w)))
        return 'deceased';
    if (words.some((w) => GRIEF_WORDS.has(w)))
        return 'bereaved';
    if (words.some((w) => FIRST_PERSON.has(w)) && words.some((w) => LOSS_EVENT_WORDS.has(w)))
        return 'bereaved';
    return 'deceased';
}
export const PARENT_WORDS = [
    'mother', 'mothers', 'mum', 'mums', 'mom', 'moms',
    'father', 'fathers', 'dad', 'dads',
    'parent', 'parents',
];
export const DEATH_WORDS = [
    'late', 'dead', 'passed', 'grave', 'graves', 'burial', 'janaza', 'janazah',
    'cemetery', 'funeral', 'died', 'death', 'deceased', 'lost',
];
export const MISS_WORDS = ['miss', 'missing', 'missed', 'misses'];
const MOTHER_WORDS = new Set(['mother', 'mothers', 'mum', 'mums', 'mom', 'moms']);
const FATHER_WORDS = new Set(['father', 'fathers', 'dad', 'dads']);
const BOTH_PARENT_WORDS = new Set(['parent', 'parents']);
function parentQueryWords(input) {
    return input
        .toLowerCase()
        .replace(/['\u2019]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}
export function parentQuery(input) {
    const words = parentQueryWords(input);
    const parents = new Set();
    for (const w of words) {
        if (MOTHER_WORDS.has(w))
            parents.add('mothers');
        else if (FATHER_WORDS.has(w))
            parents.add('fathers');
        else if (BOTH_PARENT_WORDS.has(w)) {
            parents.add('mothers');
            parents.add('fathers');
        }
    }
    if (parents.size === 0)
        return null;
    const ordered = ['mothers', 'fathers'].filter((p) => parents.has(p));
    if (words.some((w) => DEATH_WORDS.includes(w)))
        return { kind: 'death', parents: ordered };
    if (words.some((w) => MISS_WORDS.includes(w)))
        return { kind: 'miss', parents: ordered };
    return null;
}
//# sourceMappingURL=context-matcher.js.map