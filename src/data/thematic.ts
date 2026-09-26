/**
 * Thematic verse index for find_verses (WO#386).
 *
 * Reads the bundled `data/thematic-verses.json`, which bundle-data.ts builds
 * from the main app's `src/lib/data/thematic-verses.ts`. Each entry's Arabic
 * is the full ayah from the scripture module (`getVerseArabic`, Tanzil
 * Uthmani, byte for byte), resolved at bundle time.
 *
 * Lookup is deterministic: the query is normalised and each word is looked
 * up as a theme name or a synonym of one. No embedding, no AI. The synonym
 * map routes a word to an EXISTING theme; it adds no religious content.
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
}

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
  for (const word of normalisePhrase(query).split(' ')) {
    if (!word) continue
    const theme = lookup(word) ?? (word.length > 3 && word.endsWith('s') ? lookup(word.slice(0, -1)) : undefined)
    if (theme && known.has(theme) && !out.some((m) => m.theme === theme)) out.push({ theme, via: word })
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
