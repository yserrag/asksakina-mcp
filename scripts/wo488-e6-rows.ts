/**
 * WO#488 Part C: every row of the E.6 synonym proposals
 * (docs/mcp-teach-phase0/05-result-shaping.md E.6), with the Gem 4 and Gem 2
 * ruling of 22 Oct 2026 (docs/wo488-architect.md). Test fixtures only: this
 * file is not shipped and is not read by the server. THEME_SYNONYMS and
 * THEME_PHRASES (src/data/thematic.ts) hold the shipped rows; test-wo488
 * checks the two agree.
 *
 *   shipped:   both Gems approved the same theme; the term routes there
 *   excluded:  left out on purpose (the ruling's reason)
 *   not_found: refused, or the Gems split; the term returns not_found
 *   covered:   already routed before WO#488 (unchanged)
 */

export type E6Status = 'shipped' | 'excluded' | 'not_found' | 'covered'

export interface E6Row {
  /** The E.6 row, as proposed (its "Existing theme" column). */
  proposed: string
  status: E6Status
  /** The theme the terms route to (shipped and covered only). */
  theme?: string
  terms: readonly string[]
  note?: string
}

export const E6_ROWS: readonly E6Row[] = [
  { proposed: 'anxiety', status: 'not_found', terms: ['lonely', 'loneliness', 'alone', 'isolated'], note: 'lonely group' },
  { proposed: 'grief', status: 'covered', theme: 'grief', terms: ['sadness'] },
  { proposed: 'grief', status: 'shipped', theme: 'grief', terms: ['unhappy', 'miserable', 'crying', 'tears'] },
  { proposed: 'grief', status: 'excluded', terms: ['low', 'down'], note: 'Gem 4 false-positive concern' },
  { proposed: 'hope', status: 'not_found', terms: ['depressed', 'depression'], note: 'the soft block stays' },
  { proposed: 'forgiveness', status: 'shipped', theme: 'forgiveness', terms: ['guilt', 'guilty', 'regret', 'remorse', 'shame', 'ashamed', 'wrongdoing'] },
  { proposed: 'forgiveness', status: 'shipped', theme: 'forgiveness', terms: ['compassion', 'forgiving'] },
  { proposed: 'patience', status: 'shipped', theme: 'patience', terms: ['anger', 'angry', 'rage', 'frustrated', 'frustration'] },
  { proposed: 'encouragement', status: 'shipped', theme: 'encouragement', terms: ['trial', 'trials', 'struggle', 'struggling', 'difficult', 'difficulties', 'relief', 'burden', 'why me'] },
  { proposed: 'encouragement', status: 'shipped', theme: 'encouragement', terms: ['weak', 'weakness', 'tired', 'tiredness', 'exhausted', 'burnout', 'giving up'] },
  { proposed: 'trust', status: 'not_found', terms: ['debt', 'debts', 'money', 'poverty', 'poor', 'provision', 'rizq', 'sustenance', 'financial', 'bills', 'income'], note: 'money/debt group' },
  { proposed: 'trust', status: 'not_found', terms: ['doubt', 'doubting', 'uncertain', 'uncertainty', 'confused', 'decision'], note: 'doubt group' },
  { proposed: 'encouragement', status: 'not_found', terms: ['exam', 'exams', 'test', 'tests', 'study', 'studying', 'interview', 'results', 'deadline'], note: 'exam group' },
  { proposed: 'encouragement and trust', status: 'not_found', terms: ['work', 'job', 'unemployed', 'unemployment', 'business', 'career', 'success', 'failure'], note: 'work group' },
  { proposed: 'patience', status: 'not_found', terms: ['illness', 'ill', 'sick', 'sickness', 'disease', 'pain', 'cancer', 'healing', 'health'], note: 'illness group' },
  { proposed: 'grief', status: 'excluded', terms: ['death', 'dying', 'mortality'], note: 'ambiguous with the hereafter' },
  { proposed: 'grief', status: 'shipped', theme: 'grief', terms: ['funeral', 'widow', 'widowed', 'orphan', 'death of a child'] },
  { proposed: 'morning', status: 'not_found', terms: ['protection', 'protect', 'evil eye', 'envy', 'shaytan', 'nightmares'], note: 'protection group' },
  { proposed: 'patience and anxiety', status: 'not_found', terms: ['prayer', 'salah', 'pray', 'remembrance', 'dhikr'], note: 'prayer group' },
  { proposed: 'anxiety', status: 'not_found', terms: ['contentment', 'content', 'serenity', 'sakina', 'tranquility', 'rest'], note: 'contentment group' },
  { proposed: 'gratitude', status: 'covered', theme: 'gratitude', terms: ['blessings'] },
  { proposed: 'gratitude', status: 'shipped', theme: 'gratitude', terms: ['blessed', 'thank you allah', 'grateful heart'] },
  { proposed: 'ramadan', status: 'covered', theme: 'ramadan', terms: ['laylat al qadr'] },
  { proposed: 'ramadan', status: 'shipped', theme: 'ramadan', terms: ['night of power', 'night of decree', 'iftar', 'suhoor', 'taraweeh'] },
  { proposed: 'friday', status: 'shipped', theme: 'friday', terms: ["jumu'ah", 'khutbah'], note: "jumu'ah normalises to jumuah, routed before WO#488" },
  { proposed: 'encouragement or grief', status: 'not_found', terms: ['suffering', 'affliction', 'calamity', 'disaster'], note: 'suffering group' },
  { proposed: 'hope', status: 'covered', theme: 'hope', terms: ['hopeful'] },
  { proposed: 'hope', status: 'shipped', theme: 'hope', terms: ['optimism', 'optimistic', 'give up', 'give in'] },
  { proposed: 'forgiveness', status: 'covered', theme: 'forgiveness', terms: ['mercy'] },
  { proposed: 'forgiveness', status: 'shipped', theme: 'forgiveness', terms: ['merciful', 'rahma', 'rahmah'] },
]

/** The two phrases both Gems ruled not_found (E.7, the phrase level). */
export const NOT_FOUND_PHRASES: readonly string[] = ['loss of faith', 'fear of Allah']

/** The parked new-theme list (the ruling), recorded for the report; nothing is built for it. */
export const PARKED_THEMES: readonly string[] = [
  'companionship / nearness_of_allah', 'hereafter', 'family_and_marriage', 'parents', 'healing', 'provision',
  'night_and_rest', 'character', 'justice', 'protection', 'prayer_and_remembrance', 'knowledge_and_quran',
  'faith_and_guidance', 'prophets_and_creation', 'seasons', 'certainty', 'purpose', 'dignity_and_oppression',
]
