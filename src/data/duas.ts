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
import { NOT_A_NARRATION_DIRECTIVE, NOT_A_NARRATION_GRADING, UNGRADED_GRADING_DIRECTIVE } from '../contracts/presentation.js'
import { AYAT_AL_KURSI_PRACTICE_REF, AYAT_AL_KURSI_PRACTICE_GRADING_LINE } from '../contracts/gem4-wo418.js'
import { QURAN_GRADED_REFERENCE_GRADING_LINE } from '../contracts/gem4-wo423.js'
import { REFERENCE_GRADING_LINE } from '../contracts/gem4-wo424.js'
import { griefRoute, matchPhrase, parentQuery } from './context-matcher.js'
import { BEREAVED_DUAS } from './bereaved-duas.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// In dev: src/data/duas.ts -> ../../data
// In prod (dist/data/duas.js): same relative path resolves to package-root/data
const DATA_DIR = path.resolve(HERE, '..', '..', 'data')

export interface BundledDua {
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
  /** WO#418: set at bundle time only when the English is verified as
   *  Pickthall's own words for quran_ref (bundle-data.ts). */
  translation_source?: 'pickthall'
  /** WO#430: 'living' | 'both' on every mothers/fathers du'a (from the corpus). */
  parentState?: 'living' | 'both'
  /** WO#444: set at bundle time on a mixed du'a (a Qur'anic span inside a
   *  longer supplication, quranic-spans-mixed.ts): each span's ref and its
   *  English, verified Pickthall under the WO#421 rule. */
  quran_spans?: { ref: string; translation: string; translation_source: 'pickthall' }[]
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

/**
 * WO#444 (Architect, ruling b): test seam. Adds records to the in-memory
 * corpus and returns a function that removes them again. Since WO#452 no
 * bundled du'a is ungraded, so the ungraded-directive code path can only be
 * reached through a planted record. Used by the MCP chain's tests only; no
 * tool calls it, and the bundle on disk is never touched.
 */
export function plantDuasForTest(duas: readonly BundledDua[]): () => void {
  for (const d of duas) {
    if (ALL_DUAS.some((x) => x.id === d.id)) throw new Error(`plantDuasForTest: ${d.id} is a bundled id`)
  }
  ALL_DUAS.push(...duas)
  return () => {
    for (const d of duas) {
      const i = ALL_DUAS.indexOf(d)
      if (i >= 0) ALL_DUAS.splice(i, 1)
    }
  }
}
const DUA_CATEGORIES = JSON.parse(readFileSync(path.join(DATA_DIR, 'dua-categories.json'), 'utf-8')) as BundledDuaCategory[]

const PROPHET_SALUTATION_PROCESSED = ' (peace be upon him)'

/**
 * Per-record grading status (WO#377 addendum). The envelope reports what
 * the data holds, record by record:
 *   - 'quranic'       the text is a Quranic verse or clause (origin quran,
 *                     or a source citing the Quran)
 *   - 'graded'        a hadith grading is recorded in the `grading` field,
 *                     or the du'a's own source names one (Bukhari, Muslim, or
 *                     an explicit grade token such as sahih / hasan / da'if)
 *   - 'not_a_narration'  a general supplication: its grading field reads
 *                     "Not a narration" (WO#454). Not a hadith, so neither
 *                     graded nor ungraded; never on a Quranic record.
 *   - 'not_recorded'  the corpus records no grading for this du'a
 */
export type GradingStatus = 'quranic' | 'graded' | 'not_a_narration' | 'not_recorded'

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
  /** Grading of hadith_source. Gem 4's to rule: 'graded' only where Gem 4
   *  has ruled a grading line for that reference (HADITH_REF_GRADING). */
  hadith_grading_status?: 'not_recorded' | 'graded'
  /** Present on every record with grading_status 'not_recorded': Gem 4's
   *  locked UNGRADED_GRADING_DIRECTIVE (WO#388). Not part of dua_block: it
   *  instructs the agent and is not for display. */
  grading_directive?: string
  /** WO#444: present only on a mixed du'a. Each Qur'anic span it contains,
   *  with the part of `translation` that is Pickthall's words for it. The
   *  record as a whole is not Quranic (no `origin`). */
  quran_spans?: { quran_citation: string; translation: string; translation_label: string }[]
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

/**
 * WO#388 (Gem 4): an explicit grade token in the du'a's own source. Folds
 * diacritics and ʿayn/hamza marks first, so "Ṣaḥīḥ", "Ḥasan" and "Ḍaʿīf"
 * match as "sahih", "hasan", "daif". countSource is NOT read: it grounds a
 * recitation count, not the du'a text.
 */
const GRADE_TOKEN = /\b(sahih|hasan|daif|daeef|dhaif|dhaeef)\b/
export function hasGradeToken(text?: string): boolean {
  if (!text) return false
  const folded = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u02BF\u02BE\u2019'`]/g, '')
    .toLowerCase()
  return GRADE_TOKEN.test(folded)
}

function inferGradingFromSource(source?: string): string {
  if (!source) return ''
  if (/Quran|Qur'an|qur'an/i.test(source)) return 'Quranic'
  if (/Sahih al-Bukhari|Bukhari|Sahih Muslim/i.test(source)) return 'Sahih (Authentic)'
  if (hasGradeToken(source)) return 'As stated in the source'
  return ''
}

/**
 * WO#418 Part E: hadith references on Quran-labelled records that Gem 4 has
 * graded, and the dua_block grading line for each, verbatim from
 * docs/wo418-gem4.md (via the generated gem4-wo418.ts). Keyed by the exact
 * reference string, so only a record carrying that reference gets the line.
 */
const HADITH_REF_GRADING: Readonly<Record<string, string>> = {
  [AYAT_AL_KURSI_PRACTICE_REF]: AYAT_AL_KURSI_PRACTICE_GRADING_LINE,
}

/**
 * WO#423 (Gem 4 addendum, 6 Oct 2026): a hadith reference that ends in a
 * parenthesised grading, e.g. "Sunan Abī Dāwūd 5082 (ḥasan)". The grading is
 * in the reference itself, so a Quran-labelled record carrying it gets Gem 4's
 * generic line (gem4-wo423.ts) and is graded. A WO#418 Part E line, keyed by
 * the exact reference, wins over it.
 */
export function endsInParenthesisedGrading(ref?: string): boolean {
  const m = ref ? /\(([^()]*)\)\s*$/.exec(ref) : null
  return !!m && hasGradeToken(m[1])
}

/**
 * WO#424 Part B (Gem 4, 7 Oct 2026): a non-Quran record's reference carries its
 * own grading when it names Ṣaḥīḥ al-Bukhārī or Ṣaḥīḥ Muslim, or ends in a
 * parenthesised grading or qualifier. "Ṣaḥīḥ" is matched with its diacritics:
 * the reference is folded (NFD, marks, ʿ ʾ and apostrophes removed) before the
 * test, so "Ṣaḥīḥ Muslim" and "Sahih Muslim" both match. inferGradingFromSource's
 * ASCII pattern matched neither form of "Ṣaḥīḥ".
 */
export function referenceCarriesGrading(ref?: string): boolean {
  if (!ref) return false
  if (/\([^()]*\)\s*$/.test(ref)) return true
  const folded = ref.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\u02BF\u02BE\u2019'`]/g, '').toLowerCase()
  return /\bsahih (?:al-)?bukhari\b|\bsahih muslim\b/.test(folded)
}

/** The ruled grading line for a Quran-labelled record's hadith reference, if any. */
export function ruledGradingLine(hadithRef?: string): string | undefined {
  if (!hadithRef) return undefined
  return HADITH_REF_GRADING[hadithRef] ?? (endsInParenthesisedGrading(hadithRef) ? QURAN_GRADED_REFERENCE_GRADING_LINE : undefined)
}

/**
 * WO#454: the "Not a narration" directive is live (Gem 10 item D, approved).
 * The hook lets a test measure a response without it (the byte comparison in
 * test:wo454); no tool calls it.
 */
export const NOT_A_NARRATION_DIRECTIVE_LIVE = true
let notANarrationDirective = NOT_A_NARRATION_DIRECTIVE_LIVE
export function setNotANarrationDirectiveForTest(on: boolean): void {
  notANarrationDirective = on
}

/** WO#418 Part A: records whose English is verified Pickthall. Held beside
 *  the record, not on it, so the egress shape does not grow a field. */
const PICKTHALL_RECORDS = new WeakSet<DuaRecord>()
export function isPickthallTranslation(record: DuaRecord): boolean {
  return PICKTHALL_RECORDS.has(record)
}

/** WO#418 Part A (Gem 10 condition 1, Architect: label by fact): the label of
 *  a Quran-labelled record's translation line. "(Pickthall)" only where the
 *  bundle verified the English as Pickthall's. */
export const QURAN_TRANSLATION_LABEL = 'Translation of the Meaning'
export const PICKTHALL_TRANSLATION_LABEL = 'Translation of the Meaning (Pickthall)'

/** Exported for the WO#423 planted controls (scripts/test-wo423.ts). */
export function toRecord(dua: BundledDua): DuaRecord {
  const isQuran = dua.origin === 'quran' && !!dua.quran_ref
  const quranCitation = isQuran ? `Quran ${dua.quran_ref}` : undefined
  const recordedGrading = dua.grading ?? inferGradingFromSource(dua.source)
  // WO#424 Part B: a non-Quran record with no grading of its own whose
  // reference (its source, else its countSource) carries the grading itself.
  const ownReference = !isQuran && !recordedGrading ? dua.source || dua.countSource : undefined
  const statedInReference = referenceCarriesGrading(ownReference)
  const referenceLine = statedInReference ? REFERENCE_GRADING_LINE.replace(/^Grading: /, '') : ''
  const grading = recordedGrading || referenceLine || (isQuran ? 'Quranic' : 'Not graded in AskSakina corpus')
  const grading_status: GradingStatus =
    isQuran || grading === 'Quranic'
      ? 'quranic'
      : dua.grading === NOT_A_NARRATION_GRADING && dua.origin !== 'quran'
        ? 'not_a_narration'
        : recordedGrading || statedInReference
          ? 'graded'
          : 'not_recorded'

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
  const ruledLine = ruledGradingLine(hadithRef)
  const gradingLine = ruledLine
    ? ruledLine.replace(/^Grading: /, '')
    : hadithRef
      ? `${grading} (the du'a text). The hadith's grading is not recorded in the AskSakina corpus.`
      : grading
  const pickthall = isQuran && dua.translation_source === 'pickthall'
  const translationLabel = isQuran ? (pickthall ? PICKTHALL_TRANSLATION_LABEL : QURAN_TRANSLATION_LABEL) : 'Translation'

  const arabic = sanitise(dua.arabic)
  const transliteration = sanitise(dua.transliteration ?? '')
  const translation = sanitise(dua.translation)

  // WO#444 (ruling a): a mixed du'a names the Qur'anic spans it contains,
  // each with its verified Pickthall English.
  const quranSpans = !isQuran && dua.quran_spans?.length
    ? dua.quran_spans.map((s) => ({ quran_citation: `Quran ${s.ref}`, translation: sanitise(s.translation), translation_label: PICKTHALL_TRANSLATION_LABEL }))
    : undefined

  const dua_block = [
    `Arabic: ${arabic}`,
    transliteration ? `Transliteration: ${transliteration}` : null,
    `${translationLabel}: ${translation}`,
    quranCitation ? `Origin: ${quranCitation}` : null,
    quranSpans ? `Contains: ${quranSpans.map((s) => `${s.quran_citation} (${s.translation_label}: "${s.translation}")`).join('; ')}` : null,
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
    record.hadith_grading_status = ruledLine ? 'graded' : 'not_recorded'
  }
  // WO#424 Part B (Gem 4): graded by its reference
  if (statedInReference) record.hadith_grading_status = 'graded'
  // WO#388 (Gem 4): one locked directive on every ungraded hadith du'a,
  // sourced or not. Quranic and graded records never carry it.
  if (grading_status === 'not_recorded') record.grading_directive = UNGRADED_GRADING_DIRECTIVE
  // WO#454 (Gem 10 item D): a general supplication. Its status is never
  // 'quranic' or 'not_recorded', so neither other directive reaches it.
  else if (notANarrationDirective && grading_status === 'not_a_narration') record.grading_directive = NOT_A_NARRATION_DIRECTIVE
  if (quranSpans) record.quran_spans = quranSpans
  if (pickthall) PICKTHALL_RECORDS.add(record)
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
  /** Bundled id of each record in `duas`, same order (WO#405: teach keys).
   *  Records on the wire expose no id; this never reaches a response. */
  ids: string[]
}

function getDuasByCategory(slug: string): BundledDua[] {
  return ALL_DUAS.filter((d) => d.category === slug)
}

export function queryDuasByContext(input: string, opts: { phraseMatching?: boolean } = {}): DuaQueryResult {
  // WO#430 (Gem 3): a parent named with a death word is grief, never the
  // living-parent categories; "miss" + parent gets only the 'both' du'as.
  const pq = parentQuery(input)
  if (pq?.kind === 'death') {
    const matchedBy: DuaQueryResult['matchedBy'] = { method: 'phrase', via: 'parent + death word' }
    if (griefRoute(input) === 'bereaved') {
      const found = bundledById(BEREAVED_DUAS)
      return { resolvedCategory: BEREAVED_CONTEXT, duas: found.map(toRecord), matchedBy, ids: found.map((d) => d.id) }
    }
    const matched = getDuasByCategory('deceased')
    return { resolvedCategory: 'deceased', duas: matched.map(toRecord), matchedBy, ids: matched.map((d) => d.id) }
  }
  if (pq?.kind === 'miss') {
    const matched = ALL_DUAS.filter((d) => (pq.parents as string[]).includes(d.category) && d.parentState === 'both')
    return {
      resolvedCategory: pq.parents[0],
      duas: matched.map(toRecord),
      matchedBy: { method: 'phrase', via: "parent + miss ('both' du'as only)" },
      ids: matched.map((d) => d.id),
    }
  }
  const term = resolveCategorySlug(input)
  const phrase = term || opts.phraseMatching === false ? null : matchPhrase(input, DUA_CATEGORIES, ALIAS_TO_SLUG)
  const slug = term ?? phrase?.slug ?? null
  if (!slug) return { resolvedCategory: null, duas: [], ids: [] }
  const matchedBy: DuaQueryResult['matchedBy'] = term
    ? { method: 'term', via: input.trim() }
    : { method: 'phrase', via: phrase!.via }
  // WO#386 item D: the querier's own grief is 'bereaved', not 'deceased'.
  if (slug === 'deceased' && griefRoute(input) === 'bereaved') {
    const found = bundledById(BEREAVED_DUAS)
    return { resolvedCategory: BEREAVED_CONTEXT, duas: found.map(toRecord), matchedBy, ids: found.map((d) => d.id) }
  }
  const matched = getDuasByCategory(slug)
  return { resolvedCategory: slug, duas: matched.map(toRecord), matchedBy, ids: matched.map((d) => d.id) }
}

/** Context key for du'as a bereaved person says for their own grief (WO#386). */
export const BEREAVED_CONTEXT = 'bereaved'

/** Bundled du'as for the given ids, in list order; unknown ids are dropped. */
function bundledById(ids: readonly string[]): BundledDua[] {
  return ids.map((id) => ALL_DUAS.find((d) => d.id === id)).filter((d): d is BundledDua => !!d)
}

export const TOTAL_DUAS = ALL_DUAS.length

/** One record by id, or null. Callers MUST check DUA_ID_ALLOWLIST first
 *  (WO#390 flag 3); get_dua's id path is the only caller. */
export function getDuaRecordById(id: string): DuaRecord | null {
  const d = ALL_DUAS.find((x) => x.id === id)
  return d ? toRecord(d) : null
}

/** Grading status of one bundled record, or undefined for an unknown id.
 *  Used by the teach bundle check (WO#390); no tool calls it. */
export function gradingStatusById(id: string): GradingStatus | undefined {
  const d = ALL_DUAS.find((x) => x.id === id)
  return d ? toRecord(d).grading_status : undefined
}

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

