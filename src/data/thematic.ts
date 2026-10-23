/**
 * Thematic verse index for find_verses (WO#386).
 *
 * Reads the bundled `data/thematic-verses.json`, which bundle-data.ts builds
 * from the main app's `src/lib/data/thematic-verses.ts`. Each entry's Arabic
 * is the full ayah from the scripture module (`getVerseArabic`, Tanzil
 * Uthmani, byte for byte), resolved at bundle time.
 *
 * Lookup is deterministic: the query is normalised, phrases are matched
 * first (THEME_PHRASES, WO#488), and each remaining word is looked up as a
 * theme name or a synonym of one. No embedding, no AI. The synonym map routes
 * a word to an EXISTING theme; it adds no religious content.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalisePhrase } from './context-matcher.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(HERE, '..', '..', 'data')

export interface ThematicVerseEntry {
  ref: string
  surah: number
  ayah: number
  /** Every theme in the index that lists this verse, in index order. */
  themes: string[]
  arabic: string
}

export const THEMATIC_INDEX = JSON.parse(
  readFileSync(path.join(DATA_DIR, 'thematic-verses.json'), 'utf-8'),
) as ThematicVerseEntry[]

/** Themes with at least one verse, in index order. */
export const AVAILABLE_THEMES: readonly string[] = [...new Set(THEMATIC_INDEX.flatMap((v) => v.themes))]

/** Single words -> theme. Theme names themselves match directly. */
export const THEME_SYNONYMS: Readonly<Record<string, string>> = {
  // anxiety
  anxious: 'anxiety', worry: 'anxiety', worried: 'anxiety', worrying: 'anxiety',
  stress: 'anxiety', stressed: 'anxiety', overwhelmed: 'anxiety', panic: 'anxiety',
  nervous: 'anxiety', fear: 'anxiety', afraid: 'anxiety', scared: 'anxiety',
  peace: 'anxiety', calm: 'anxiety',
  // gratitude
  grateful: 'gratitude', thankful: 'gratitude', thanks: 'gratitude', thank: 'gratitude',
  thanking: 'gratitude', blessing: 'gratitude', blessings: 'gratitude', shukr: 'gratitude',
  alhamdulillah: 'gratitude',
  // patience
  patient: 'patience', sabr: 'patience', steadfast: 'patience', steadfastness: 'patience',
  endurance: 'patience', endure: 'patience', persevere: 'patience', perseverance: 'patience',
  // trust
  tawakkul: 'trust', reliance: 'trust', rely: 'trust', relying: 'trust', decree: 'trust',
  destiny: 'trust',
  // grief
  sad: 'grief', sadness: 'grief', sorrow: 'grief', grieving: 'grief', grieve: 'grief',
  loss: 'grief', bereaved: 'grief', bereavement: 'grief', mourning: 'grief',
  heartbroken: 'grief', heartbreak: 'grief',
  // hope
  hopeful: 'hope', hopeless: 'hope', hopelessness: 'hope', despair: 'hope', despairing: 'hope',
  // morning
  dawn: 'morning', fajr: 'morning', daybreak: 'morning',
  // friday
  jumuah: 'friday', jummah: 'friday',
  // ramadan
  ramadhan: 'ramadan', fasting: 'ramadan', qadr: 'ramadan',
  // encouragement
  encourage: 'encouragement', encouraging: 'encouragement', strength: 'encouragement',
  hardship: 'encouragement', difficulty: 'encouragement', ease: 'encouragement',
  // forgiveness
  forgive: 'forgiveness', forgiven: 'forgiveness', repent: 'forgiveness',
  repentance: 'forgiveness', tawbah: 'forgiveness', istighfar: 'forgiveness',
  sin: 'forgiveness', sins: 'forgiveness', mercy: 'forgiveness',

  // WO#488 Part C: the rows Gem 4 and Gem 2 both approved for the same theme
  // (22 Oct 2026; docs/wo488-architect.md). Every other E.6 row stays out
  // (docs/mcp-teach-phase0/05-result-shaping.md; scripts/wo488-e6-rows.ts).
  // Multi-word rows are in THEME_PHRASES.
  // grief (bereavement: the soft support note attaches and teach is withheld)
  unhappy: 'grief', miserable: 'grief', crying: 'grief', tears: 'grief', funeral: 'grief',
  widow: 'grief', widowed: 'grief', orphan: 'grief',
  // forgiveness
  guilt: 'forgiveness', guilty: 'forgiveness', regret: 'forgiveness', remorse: 'forgiveness',
  shame: 'forgiveness', ashamed: 'forgiveness', wrongdoing: 'forgiveness', compassion: 'forgiveness',
  forgiving: 'forgiveness', merciful: 'forgiveness', rahma: 'forgiveness', rahmah: 'forgiveness',
  // patience
  anger: 'patience', angry: 'patience', rage: 'patience', frustrated: 'patience', frustration: 'patience',
  // encouragement
  trial: 'encouragement', trials: 'encouragement', struggle: 'encouragement', struggling: 'encouragement',
  difficult: 'encouragement', difficulties: 'encouragement', relief: 'encouragement', burden: 'encouragement',
  weak: 'encouragement', weakness: 'encouragement', tired: 'encouragement', tiredness: 'encouragement',
  exhausted: 'encouragement', burnout: 'encouragement',
  // gratitude
  blessed: 'gratitude',
  // ramadan
  iftar: 'ramadan', suhoor: 'ramadan', taraweeh: 'ramadan',
  // friday ("jumu'ah" normalises to "jumuah", above)
  khutbah: 'friday',
  // hope
  optimism: 'hope', optimistic: 'hope',
}

/**
 * WO#488 Part C: the phrase level, matched on the normalised query BEFORE
 * any single word, so a phrase's words never reach the word lookup. A phrase
 * with theme null matches nothing (not_found): "loss of faith" is not grief
 * and "fear of Allah" is not anxiety (WO#478; Gem 4 and Gem 2, 22 Oct 2026).
 * The rest are the multi-word rows both Gems approved.
 */
export const THEME_PHRASES: ReadonlyArray<{ phrase: string; theme: string | null }> = [
  { phrase: 'loss of faith', theme: null },
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
]

/**
 * WO#478: the words those two not_found phrases keep from their themes.
 * Derived from THEME_PHRASES; kept for the soft matcher's parity test.
 */
export const PHRASE_EXCLUSIONS: ReadonlyArray<{ phrase: string; word: string }> = THEME_PHRASES.filter((p) => p.theme === null).map((p) => ({
  phrase: p.phrase,
  word: p.phrase.split(' ')[0]!,
}))

// Longest first, so "death of a child" is tried before any shorter phrase.
const PHRASES_BY_LENGTH = [...THEME_PHRASES].map((p) => ({ ...p, words: p.phrase.split(' ') })).sort((a, b) => b.words.length - a.words.length)

export interface ThemeMatch {
  theme: string
  /** The query word that matched. */
  via: string
}

/** Themes named by the query, in the order their words appear, deduplicated. */
export function matchThemes(query: string): ThemeMatch[] {
  const known = new Set(AVAILABLE_THEMES)
  const lookup = (w: string): string | undefined => (known.has(w) ? w : undefined) ?? THEME_SYNONYMS[w]
  const out: ThemeMatch[] = []
  const add = (theme: string | undefined | null, via: string) => {
    if (theme && known.has(theme) && !out.some((m) => m.theme === theme)) out.push({ theme, via })
  }
  const words = normalisePhrase(query).split(' ').filter(Boolean)
  for (let i = 0; i < words.length; ) {
    // The phrase level first: a matched phrase consumes its words.
    const phrase = PHRASES_BY_LENGTH.find((p) => p.words.every((w, k) => words[i + k] === w))
    if (phrase) {
      add(phrase.theme, phrase.phrase)
      i += phrase.words.length
      continue
    }
    const word = words[i]!
    add(lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined), word)
    i += 1
  }
  return out
}

/** Verses for the matched themes: theme order first, then index order; each ref once. */
export function versesForThemes(themes: readonly string[], limit: number): ThematicVerseEntry[] {
  const out: ThematicVerseEntry[] = []
  for (const theme of themes) {
    for (const v of THEMATIC_INDEX) {
      if (out.length >= limit) return out
      if (v.themes.includes(theme) && !out.includes(v)) out.push(v)
    }
  }
  return out
}
