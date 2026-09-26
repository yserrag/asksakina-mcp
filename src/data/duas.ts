/**
 * Du'a data loader for the MCP server (WO#102, repackaged in WO#105).
 *
 * Reads from the bundled `data/duas.json` and
 * `data/dua-categories.json` files. The bundling step
 * (`scripts/bundle-data.ts`) snapshots the canonical 444-entry du'a
 * corpus from the main Sakina monorepo at publish time. The MCP
 * server has no runtime dependency on the main app's source tree.
 */

import { readFileSync } from 'node:fs'
import { SOURCE_ONLY_GRADING_DIRECTIVE, UNRECORDED_GRADING_DIRECTIVE } from '../contracts/presentation.js'
import { griefRoute, matchPhrase } from './context-matcher.js'
import { BEREAVED_DUAS } from './bereaved-duas.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// In dev: src/data/duas.ts -> ../../data
// In prod (dist/data/duas.js): same relative path resolves to package-root/data
const DATA_DIR = path.resolve(HERE, '..', '..', 'data')

interface BundledDua {
  id: string
  name: string
  arabic: string
  transliteration: string
  translation: string
  practiceTime: string
  category: string
  count: number
  countSource?: string
  source?: string
  grading?: string
  contextNote?: string
  verified?: boolean
  /** Set at bundle time for Gem-2-verified Quranic du'as (WO#377 addendum). */
  origin?: 'quran'
  /** "surah:ayah" or "surah:ayah-ayah"; present iff origin === 'quran'. */
  quran_ref?: string
}

interface BundledDuaCategory {
  slug: string
  name: string
  nameAr?: string
  order: number
  count: number
  description: string
  tags?: {
    time?: string[]
    mood?: string[]
    situation?: string[]
    seasonal?: string[]
  }
}

const ALL_DUAS = JSON.parse(readFileSync(path.join(DATA_DIR, 'duas.json'), 'utf-8')) as BundledDua[]
const DUA_CATEGORIES = JSON.parse(readFileSync(path.join(DATA_DIR, 'dua-categories.json'), 'utf-8')) as BundledDuaCategory[]

const PROPHET_SALUTATION_PROCESSED = ' (peace be upon him)'

/**
 * Per-record grading status (WO#377 addendum). The envelope reports what
 * the data holds, record by record:
 *   - 'quranic'       the text is a Quranic verse or clause (origin quran,
 *                     or a source citing the Quran)
 *   - 'graded'        a hadith grading is recorded or inferable from the
 *                     source (Bukhari, Muslim)
 *   - 'not_recorded'  the corpus records no grading for this du'a
 */
export type GradingStatus = 'quranic' | 'graded' | 'not_recorded'

export interface DuaRecord {
  /**
   * Pre-formatted, inseparable display block (Gem 10 fix 3,
   * 2026-05-08). The block bundles every field a calling agent might
   * be tempted to drop "for brevity" into a single string. The
   * presentation contract instructs the agent to prefer this field
   * over the structured keys for display.
   */
  dua_block: string
  title: string
  arabic: string
  transliteration: string
  translation: string
  source: string
  grading: string
  grading_status: GradingStatus
  /** Present only on Gem-2-verified Quranic du'as. */
  origin?: 'quran'
  /** "Quran s:a" citation; present iff origin === 'quran'. */
  quran_citation?: string
  /** WO#377 labelling rule: the hadith reference of a Quran-labelled record
   *  (its non-Quranic source or countSource), kept beside quran_citation. */
  hadith_source?: string
  /** Grading of hadith_source. Gem 4's to rule; not recorded today. */
  hadith_grading_status?: 'not_recorded'
  /** Present on every record with grading_status 'not_recorded': Gem 4's
   *  wording when source and grading are both unrecorded, the held interim
   *  wording when a source is recorded (WO#385). Not part of dua_block: it
   *  instructs the agent and is not for display. */
  grading_directive?: string
  context_tags: string[]
}

const ALIAS_TO_SLUG: Record<string, string> = {
  morning: 'morning-adhkar',
  evening: 'evening-adhkar',
  'before-sleep': 'before-sleep',
  sleep: 'before-sleep',
  bed: 'before-sleep',
  anxiety: 'stress-anxiety',
  worry: 'stress-anxiety',
  stress: 'stress-anxiety',
  distress: 'stress-anxiety',
  fear: 'stress-anxiety',
  grief: 'deceased',
  loss: 'deceased',
  bereavement: 'deceased',
  death: 'deceased',
  guilt: 'repentance',
  forgiveness: 'repentance',
  repent: 'repentance',
  illness: 'health-healing',
  sick: 'health-healing',
  healing: 'health-healing',
  travel: 'travel',
  journey: 'travel',
  exam: 'exams-study',
  exams: 'exams-study',
  study: 'exams-study',
  work: 'work-success',
  job: 'work-success',
  career: 'work-success',
  debt: 'wealth-debt',
  money: 'wealth-debt',
  wealth: 'wealth-debt',
  marriage: 'marriage',
  pregnant: 'pregnancy',
  pregnancy: 'pregnancy',
  children: 'children',
  child: 'children',
  parents: 'mothers',
  mother: 'mothers',
  father: 'fathers',
  hardship: 'calamity',
  calamity: 'calamity',
  ramadan: 'ramadan',
  hajj: 'umrah-hajj',
  umrah: 'umrah-hajj',
  pilgrimage: 'umrah-hajj',
  istikhara: 'istikhara',
  guidance: 'istikhara',
  friday: 'friday',
  jumuah: 'friday',
  gratitude: 'gratitude',
  thanks: 'gratitude',
  general: 'general',
  protection: 'morning-adhkar',
}

function sanitise(input: string): string {
  return input.split('\u{FDFA}').join(PROPHET_SALUTATION_PROCESSED).trim()
}

function inferGradingFromSource(source?: string): string {
  if (!source) return ''
  if (/Quran|Qur'an|qur'an/i.test(source)) return 'Quranic'
  if (/Sahih al-Bukhari|Bukhari|Sahih Muslim/i.test(source)) return 'Sahih (Authentic)'
  return ''
}

function toRecord(dua: BundledDua): DuaRecord {
  const isQuran = dua.origin === 'quran' && !!dua.quran_ref
  const quranCitation = isQuran ? `Quran ${dua.quran_ref}` : undefined
  const recordedGrading = dua.grading ?? inferGradingFromSource(dua.source)
  const grading = recordedGrading || (isQuran ? 'Quranic' : 'Not graded in AskSakina corpus')
  const grading_status: GradingStatus =
    isQuran || grading === 'Quranic' ? 'quranic' : recordedGrading ? 'graded' : 'not_recorded'

  // WO#377 labelling rule (Architect, 25 Sep 2026): a Quranic label ADDS a
  // citation and never replaces the hadith source line. A labelled record
  // that also carries a hadith reference (a non-Quranic `source`, or a
  // `countSource` grounding a recitation count) keeps it as its Source line,
  // beside the Origin line; its grading belongs to Gem 4, not to the label.
  const hadithRef = isQuran
    ? (dua.source && !/qur/i.test(dua.source) ? dua.source : undefined) ?? dua.countSource
    : undefined

  const sourceParts: string[] = []
  if (hadithRef) sourceParts.push(hadithRef)
  else if (dua.source) sourceParts.push(dua.source)
  else if (quranCitation) sourceParts.push(quranCitation)
  if (!sourceParts.length && dua.countSource) sourceParts.push(dua.countSource)
  const source = sourceParts.join(', ') || 'Source not recorded in AskSakina corpus'
  const gradingLine = hadithRef
    ? `${grading} (the du'a text). The hadith's grading is not recorded in the AskSakina corpus.`
    : grading

  const arabic = sanitise(dua.arabic)
  const transliteration = sanitise(dua.transliteration ?? '')
  const translation = sanitise(dua.translation)

  const dua_block = [
    `Arabic: ${arabic}`,
    transliteration ? `Transliteration: ${transliteration}` : null,
    `Translation: ${translation}`,
    quranCitation ? `Origin: ${quranCitation}` : null,
    `Source: ${source}`,
    `Grading: ${gradingLine}`,
  ]
    .filter(Boolean)
    .join('\n')

  const record: DuaRecord = {
    dua_block,
    title: sanitise(dua.name),
    arabic,
    transliteration,
    translation,
    source,
    grading,
    grading_status,
    context_tags: [dua.category],
  }
  if (quranCitation) {
    record.origin = 'quran'
    record.quran_citation = quranCitation
  }
  if (hadithRef) {
    record.hadith_source = hadithRef
    record.hadith_grading_status = 'not_recorded'
  }
  if (grading_status === 'not_recorded') {
    // WO#385: Gem 4's wording applies only when BOTH source and grading are
    // unrecorded. A record with a recorded source (source or countSource)
    // keeps the held interim wording until Gem 4 rules its variant.
    const sourceRecorded = Boolean(dua.source || dua.countSource)
    const directive = sourceRecorded ? SOURCE_ONLY_GRADING_DIRECTIVE : UNRECORDED_GRADING_DIRECTIVE
    if (directive) record.grading_directive = directive
  }
  return record
}

export function resolveCategorySlug(input: string): string | null {
  const normalised = input.toLowerCase().trim().replace(/[\s_]+/g, '-')

  if (DUA_CATEGORIES.some((c) => c.slug === normalised)) return normalised
  if (ALIAS_TO_SLUG[normalised]) return ALIAS_TO_SLUG[normalised]

  for (const category of DUA_CATEGORIES) {
    if (category.name.toLowerCase().includes(normalised)) return category.slug
  }

  for (const category of DUA_CATEGORIES) {
    const tags = category.tags
    if (!tags) continue
    const flatTags: string[] = [
      ...(tags.time ?? []),
      ...(tags.mood ?? []),
      ...(tags.situation ?? []),
      ...(tags.seasonal ?? []),
    ].map((t) => t.toLowerCase())
    if (flatTags.includes(normalised)) return category.slug
  }

  return null
}

export interface DuaQueryResult {
  resolvedCategory: string | null
  duas: DuaRecord[]
  /** How the context resolved (WO#385): 'term' is the single-term resolver
   *  above, 'phrase' the deterministic phrase matcher, with what matched. */
  matchedBy?: { method: 'term' | 'phrase'; via: string }
}

function getDuasByCategory(slug: string): BundledDua[] {
  return ALL_DUAS.filter((d) => d.category === slug)
}

export function queryDuasByContext(input: string, opts: { phraseMatching?: boolean } = {}): DuaQueryResult {
  const term = resolveCategorySlug(input)
  const phrase = term || opts.phraseMatching === false ? null : matchPhrase(input, DUA_CATEGORIES, ALIAS_TO_SLUG)
  const slug = term ?? phrase?.slug ?? null
  if (!slug) return { resolvedCategory: null, duas: [] }
  const matchedBy: DuaQueryResult['matchedBy'] = term
    ? { method: 'term', via: input.trim() }
    : { method: 'phrase', via: phrase!.via }
  // WO#386 item D: the querier's own grief is 'bereaved', not 'deceased'.
  if (slug === 'deceased' && griefRoute(input) === 'bereaved') {
    return { resolvedCategory: BEREAVED_CONTEXT, duas: selectDuasById(BEREAVED_DUAS), matchedBy }
  }
  const matched = getDuasByCategory(slug)
  return { resolvedCategory: slug, duas: matched.map(toRecord), matchedBy }
}

/** Context key for du'as a bereaved person says for their own grief (WO#386). */
export const BEREAVED_CONTEXT = 'bereaved'

/** Records for the given ids, in list order; unknown ids are dropped. */
function selectDuasById(ids: readonly string[]): DuaRecord[] {
  return ids
    .map((id) => ALL_DUAS.find((d) => d.id === id))
    .filter((d): d is BundledDua => !!d)
    .map(toRecord)
}

export const TOTAL_DUAS = ALL_DUAS.length

/**
 * Sabr / endurance du'as (WO#385, Gem 3): never returned on an abuse input,
 * even from the allowlist. Matched on the record's title and translation.
 * "bear witness" and "bearers" are not matched; "strength to bear" is.
 */
const ENDURANCE = /\bsabr\b|\bpatien(?:ce|t)\b|steadfast|\bendur(?:e|ance|ing)\b|persever|strength to bear/i

export function isEnduranceDua(id: string): boolean {
  const d = ALL_DUAS.find((x) => x.id === id)
  return !!d && ENDURANCE.test(`${d.name} ${d.translation}`)
}

/**
 * Records for the abuse path, in allowlist order: unknown ids and every
 * sabr/endurance du'a are dropped.
 */
export function selectAbuseSafeDuas(ids: readonly string[]): DuaRecord[] {
  return ids
    .map((id) => ALL_DUAS.find((d) => d.id === id))
    .filter((d): d is BundledDua => !!d && !isEnduranceDua(d.id))
    .map(toRecord)
}

