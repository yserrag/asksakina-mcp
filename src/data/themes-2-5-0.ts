/**
 * WO#495 Part A (MCP 2.5.0): fifteen find_verses themes, FINAL table
 * (docs/wo495-architect.md section 4: Gem 2 and Gem 4 agreement, then Gem 3's
 * safety vetoes; Gem 7 approved faith_and_guidance and prophets_and_creation).
 *
 * Verses are listed in the ruled order. A trigger is a single word (words) or
 * a phrase matched before any word (phrases). Struck words are not listed:
 * they stay not_found unless an existing route already covers them. A word
 * that already routes to an older theme keeps that route (the build reports
 * any such clash; tests prove none exists in this table).
 *
 * Every verse's Arabic is resolved at bundle time (bundle-data.ts): the
 * scripture module where it carries the verse, else public/quran, the
 * module's own source, for exactly the refs in OUTSIDE_MODULE.
 */

/**
 * The refs of this table the app's scripture module does not carry. bundle-data
 * takes their Arabic from public/quran with the module's one transform
 * (stripOpenFathatanSpace), and fails on any other miss, or if one of these is
 * later added to the module (then drop it here).
 */
export const OUTSIDE_MODULE: readonly string[] = ['89:1', '89:2']

export interface NewTheme {
  theme: string
  refs: readonly string[]
  words: readonly string[]
  phrases: readonly string[]
  /** Triggers that route to a subset of refs (protection: Gem 3). */
  refsByTrigger?: Readonly<Record<string, readonly string[]>>
}

export const THEMES_2_5_0: readonly NewTheme[] = [
  { theme: 'companionship', refs: ['50:16', '2:186', '57:4', '49:10'], words: ['lonely', 'loneliness', 'alone', 'isolated'], phrases: [] },
  { theme: 'family_and_marriage', refs: ['30:21', '4:130'], words: ['marriage', 'divorce', 'breakup', 'betrayal'], phrases: ['in laws'] },
  { theme: 'hereafter', refs: ['2:201', '41:30', '3:185', '40:8', '3:9'], words: ['afterlife', 'resurrection', 'judgement', 'paradise', 'hell'], phrases: ['day of judgement'] },
  { theme: 'parents', refs: ['17:24', '31:14', '46:15'], words: ['mother', 'father', 'parents'], phrases: ['ageing parents', 'caring for parents'] },
  { theme: 'night_and_rest', refs: ['78:10', '2:255', '17:78', '32:16', '73:6'], words: ['sleep', 'evening', 'tahajjud'], phrases: [] },
  { theme: 'character', refs: ['25:63', '3:134', '41:34', '7:199', '23:96'], words: ['jealousy', 'pride', 'arrogance', 'humility', 'honesty', 'lying', 'backbiting'], phrases: [] },
  { theme: 'justice', refs: ['16:90', '5:8', '4:135'], words: ['justice'], phrases: [] },
  {
    theme: 'protection',
    refs: ['23:97', '41:36', '2:255'],
    words: ['shaytan', 'temptation', 'protection', 'protect', 'envy'],
    phrases: ['evil eye'],
    // Gem 3: protection, protect, evil eye and envy route to 2:255 only.
    refsByTrigger: { protection: ['2:255'], protect: ['2:255'], 'evil eye': ['2:255'], envy: ['2:255'] },
  },
  { theme: 'quran_and_knowledge', refs: ['96:1', '20:114', '54:17', '58:11', '2:2'], words: ['memorisation', 'wisdom', 'quran', 'knowledge'], phrases: ['reading quran'] },
  {
    theme: 'faith_and_guidance',
    refs: ['1:6', '3:8', '48:4', '2:256', '11:112'],
    words: ['iman', 'belief', 'tawhid', 'revert', 'faith', 'guidance', 'conversion'],
    // "loss of faith" now routes here, replacing its not_found (Architect, section 4).
    phrases: ['straight path', 'new muslim', 'loss of faith'],
  },
  { theme: 'prophets_and_creation', refs: ['2:285', '21:107', '5:114', '2:60', '3:191'], words: ['jesus', 'moses', 'mary', 'angels', 'nature', 'miracle', 'miracles'], phrases: [] },
  // 89:1 and 89:2 are always adjacent.
  { theme: 'seasons', refs: ['2:185', '2:127', '89:1', '89:2', '2:186'], words: ['hajj', 'pilgrimage', 'eid'], phrases: [] },
  {
    theme: 'provision',
    refs: ['51:58', '42:19', '53:39'],
    words: ['money', 'poverty', 'poor', 'provision', 'rizq', 'sustenance', 'financial', 'bills', 'income', 'work', 'job', 'unemployed', 'unemployment', 'business', 'career', 'success', 'failure', 'wealth'],
    phrases: ['halal income'],
  },
  { theme: 'healing', refs: ['21:83', '26:80', '10:57'], words: ['illness', 'ill', 'sick', 'sickness', 'disease', 'pain', 'cancer', 'healing', 'health'], phrases: [] },
  { theme: 'certainty', refs: ['2:2', '3:8', '48:4'], words: ['doubt', 'doubting'], phrases: [] },
]
