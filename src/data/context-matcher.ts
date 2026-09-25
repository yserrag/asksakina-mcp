/**
 * Deterministic natural-language matching for get_dua (WO#385 item 5).
 *
 * No AI. Runs only when the single-term resolver in duas.ts finds nothing,
 * so every input that matched before still resolves the same way.
 *
 *   1. Normalise: NFKC, lower case, curly quotes folded, apostrophes
 *      dropped ("can't" -> "cant"), every other non-letter to a space.
 *   2. Multi-word phrases (PHRASES) are matched first, on word
 *      boundaries. A phrase is more specific than any word inside it:
 *      "lost my job" is work, not bereavement.
 *   3. Otherwise every word is looked up as a category slug, an alias,
 *      a synonym (SYNONYMS) or a category tag word (except "anytime",
 *      which every category carries). A trailing "s" is also tried.
 *   4. Several categories can match ("grief after losing my mother" hits
 *      deceased and mothers). The highest in CATEGORY_PRIORITY wins;
 *      ties go to the earliest word.
 *
 * The maps route a phrase to an EXISTING category. They add no religious
 * content. Listed in docs/wo385-sg-report.md for Gem 1 review.
 *
 * Crisis detection is not here: get_dua evaluates the full raw input
 * before any matching (see tools/get-dua.ts).
 */

export interface MatchableCategory {
  slug: string
  tags?: { time?: string[]; mood?: string[]; situation?: string[]; seasonal?: string[] }
}

/** Multi-word phrases, checked before single words. */
export const PHRASES: ReadonlyArray<readonly [string, string]> = [
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
]

/** Single words -> category slug. Checked alongside ALIAS_TO_SLUG. */
export const SYNONYMS: Readonly<Record<string, string>> = {
  // grief / bereavement
  loss: 'deceased', lost: 'deceased', losing: 'deceased', death: 'deceased', died: 'deceased',
  bereaved: 'deceased', bereavement: 'deceased', grieving: 'deceased', grieve: 'deceased',
  mourning: 'deceased', funeral: 'deceased', janazah: 'deceased', widow: 'deceased',
  widowed: 'deceased', condolences: 'deceased', deceased: 'deceased',
  // anxiety / worry / low mood
  anxious: 'stress-anxiety', worried: 'stress-anxiety', worrying: 'stress-anxiety',
  nervous: 'stress-anxiety', overwhelmed: 'stress-anxiety', stressed: 'stress-anxiety',
  panic: 'stress-anxiety', afraid: 'stress-anxiety', scared: 'stress-anxiety',
  sad: 'stress-anxiety', sadness: 'stress-anxiety',
  // exams
  test: 'exams-study', tests: 'exams-study', studying: 'exams-study', revision: 'exams-study',
  school: 'exams-study', university: 'exams-study',
  // illness
  ill: 'health-healing', unwell: 'health-healing', disease: 'health-healing',
  hospital: 'health-healing', surgery: 'health-healing', operation: 'health-healing',
  recovery: 'health-healing', recover: 'health-healing', pain: 'health-healing',
  cure: 'health-healing', cancer: 'health-healing',
  // hardship
  difficulty: 'calamity', difficult: 'calamity', trouble: 'calamity', trial: 'calamity',
  trials: 'calamity', disaster: 'calamity', struggling: 'calamity', struggle: 'calamity',
  // repentance
  sin: 'repentance', sins: 'repentance', sinned: 'repentance', regret: 'repentance',
  guilty: 'repentance', ashamed: 'repentance', shame: 'repentance', tawbah: 'repentance',
  istighfar: 'repentance',
  // money
  debts: 'wealth-debt', loan: 'wealth-debt', poverty: 'wealth-debt', rizq: 'wealth-debt',
  provision: 'wealth-debt', financial: 'wealth-debt', bills: 'wealth-debt',
  // work
  interview: 'work-success', promotion: 'work-success', business: 'work-success',
  unemployed: 'work-success', success: 'work-success',
  // travel
  trip: 'travel', flight: 'travel', flying: 'travel', travelling: 'travel', traveling: 'travel',
  // family
  wedding: 'marriage', spouse: 'marriage', husband: 'marriage', wife: 'marriage',
  married: 'marriage', nikah: 'marriage',
  birth: 'pregnancy', childbirth: 'pregnancy', labour: 'pregnancy', labor: 'pregnancy',
  kids: 'children', son: 'children', daughter: 'children', baby: 'children',
  mum: 'mothers', mom: 'mothers', dad: 'fathers',
  // time of day
  bedtime: 'before-sleep', insomnia: 'before-sleep', sleepless: 'before-sleep',
  sleeping: 'before-sleep', wake: 'morning-adhkar', waking: 'morning-adhkar',
  sunset: 'evening-adhkar',
  // gratitude
  grateful: 'gratitude', thankful: 'gratitude', blessed: 'gratitude', alhamdulillah: 'gratitude',
  // decisions
  decision: 'istikhara', decide: 'istikhara', choice: 'istikhara', choose: 'istikhara',
  confused: 'istikhara',
  // seasons and places
  ramadhan: 'ramadan', fast: 'fasting', fasting: 'fasting', iftar: 'fasting', suhoor: 'fasting',
  jummah: 'friday', mecca: 'umrah-hajj', makkah: 'umrah-hajj', qadr: 'laylat-al-qadr',
  khatm: 'quran-completion', khatam: 'quran-completion',
}

/** Highest first. Specific needs outrank relations and general lists. */
export const CATEGORY_PRIORITY: readonly string[] = [
  'deceased', 'calamity', 'health-healing', 'stress-anxiety', 'repentance', 'exams-study',
  'wealth-debt', 'work-success', 'travel', 'istikhara', 'pregnancy', 'marriage',
  'laylat-al-qadr', 'umrah-hajj', 'ramadan', 'fasting', 'friday', 'before-sleep',
  'morning-adhkar', 'evening-adhkar', 'gratitude', 'quran-completion', 'children', 'mothers',
  'fathers', 'allahs-names-duas', '99-names', 'rabana-duas', 'powerful-duas', 'general',
]

export function normalisePhrase(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const rank = (slug: string) => {
  const i = CATEGORY_PRIORITY.indexOf(slug)
  return i < 0 ? CATEGORY_PRIORITY.length : i
}

export interface PhraseMatch {
  slug: string
  /** What matched, for logs and tests: the phrase or word. */
  via: string
}

export function matchPhrase(
  input: string,
  categories: readonly MatchableCategory[],
  aliases: Readonly<Record<string, string>>,
): PhraseMatch | null {
  const text = normalisePhrase(input)
  if (!text) return null
  const known = new Set(categories.map((c) => c.slug))
  const padded = ` ${text} `

  // 2. phrases
  const phraseHits = PHRASES.filter(([p, slug]) => known.has(slug) && padded.includes(` ${p} `))
  if (phraseHits.length) {
    phraseHits.sort((a, b) => rank(a[1]) - rank(b[1]) || padded.indexOf(` ${a[0]} `) - padded.indexOf(` ${b[0]} `))
    return { slug: phraseHits[0][1], via: phraseHits[0][0] }
  }

  // 3. words
  const tagIndex = new Map<string, string>()
  for (const slug of [...known].sort((a, b) => rank(a) - rank(b))) {
    const t = categories.find((c) => c.slug === slug)?.tags
    if (!t) continue
    for (const tag of [...(t.time ?? []), ...(t.mood ?? []), ...(t.situation ?? []), ...(t.seasonal ?? [])]) {
      const w = tag.toLowerCase()
      if (w !== 'anytime' && !tagIndex.has(w)) tagIndex.set(w, slug)
    }
  }
  const lookup = (w: string): string | undefined =>
    (known.has(w) ? w : undefined) ?? aliases[w] ?? SYNONYMS[w] ?? tagIndex.get(w)

  const hits: Array<{ slug: string; via: string; pos: number }> = []
  text.split(' ').forEach((word, pos) => {
    const slug = lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined)
    if (slug && known.has(slug)) hits.push({ slug, via: word, pos })
  })
  if (!hits.length) return null
  hits.sort((a, b) => rank(a.slug) - rank(b.slug) || a.pos - b.pos)
  return { slug: hits[0].slug, via: hits[0].via }
}
