/**
 * Bundle-time check for teach entries (WO#390 addendum, item 3).
 *
 * Refuses any teach field that lacks its sign-off, any uncited claim, any
 * Field 2 that does not match the record's grading, any Field 1 word that is
 * not in the record's Arabic, and any related ref that does not resolve. The
 * Gem 10 publish sign-off is checked separately (publishGateErrors). Pure: the caller supplies the lookups, so the check runs
 * the same in bundle-data and in test:teach.
 */

import { UNATTRIBUTED_CONTEXT_FALLBACK } from '../contracts/presentation.js'
import { AUDIENCES, type GemId, type RelatedRef, type SignOff, type TeachEntry } from './types.js'

/** Sign-off matrix. Gem 4 addendum and Architect rulings, 27 Sep 2026. */
export const REQUIRED_SIGNOFF = {
  key_word: [2],
  context: [4],
  misconception: [4],
  reflection: [3],
  audience_variant: [6, 7],
  /** Architect ruling, WO#390 flag 4. */
  related: [2],
  publish: [10],
} as const satisfies Record<string, readonly GemId[]>

export interface TeachLookups {
  /** Grading status of a bundled du'a, or undefined if the id is unknown. */
  duaStatus(id: string): 'quranic' | 'graded' | 'not_a_narration' | 'not_recorded' | undefined
  verseExists(ref: string): boolean
  nameExists(n: number): boolean
  glossaryHas(term: string): boolean
  /**
   * The Arabic a Field 1 word must appear in, byte for byte: the bundled
   * corpus Arabic for a du'a, the scripture module's Tanzil text for a verse,
   * the Name's Arabic for a Name. Undefined skips the check (fixture lookups).
   */
  recordArabic?(entry: TeachEntry): string | undefined
}

/**
 * Field 1 words that do NOT appear byte for byte in their record's Arabic,
 * acknowledged by name. WO#405 locked the Arabic as signed ("report any
 * mismatch, do not fix"). Both differ from the Tanzil text only in encoding:
 * sukun as U+0652 where Tanzil has U+06E1, and in 39:53 the silent alif mark
 * as U+06DF where Tanzil has U+0652. D00060 is checked against its served
 * Arabic, which the bundle already takes from Tanzil 20:25-26 (quranic-labels).
 * Any other mismatch refuses the bundle. Remove an entry only when Gem 2
 * re-signs the word.
 */
export const ACKNOWLEDGED_FIELD1_MISMATCHES: ReadonlyArray<{ key: string; arabic: string }> = [
  // la taqnatu
  { key: 'verse:39:53', arabic: '\u0644\u064e\u0627 \u062a\u064e\u0642\u0652\u0646\u064e\u0637\u064f\u0648\u0627\u06df' },
  // ishrah
  { key: 'dua:D00060', arabic: '\u0671\u0634\u0652\u0631\u064e\u062d\u0652' },
]

/** Stable, ASCII-only form of a word for refusal messages. */
export function escapeArabic(s: string): string {
  return [...s].map((c) => (c.charCodeAt(0) < 128 ? c : `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`)).join('')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function missingGems(signoffs: readonly SignOff[] | undefined, required: readonly GemId[]): GemId[] {
  const valid = (signoffs ?? []).filter((s) => s && s.ruling?.trim() && ISO_DATE.test(s.date ?? ''))
  return required.filter((g) => !valid.some((s) => s.gem === g))
}

function hasCitations(c: unknown): boolean {
  return Array.isArray(c) && c.length > 0 && c.every((x) => typeof x?.text === 'string' && x.text.trim() !== '')
}

export function keyFor(entry: TeachEntry): string {
  const r = entry.record
  return r.kind === 'dua' ? `dua:${r.id}` : r.kind === 'verse' ? `verse:${r.ref}` : `name:${r.number}`
}

function refResolves(ref: RelatedRef, l: TeachLookups): boolean {
  switch (ref.kind) {
    case 'dua':
      return l.duaStatus(ref.id) !== undefined
    case 'verse':
      return l.verseExists(ref.ref)
    case 'name':
      return l.nameExists(ref.number)
    case 'glossary':
      return l.glossaryHas(ref.term)
  }
}

/** Every problem found, one line each. Empty means the entries may bundle. */
export function validateTeachEntries(
  entries: Readonly<Partial<Record<string, TeachEntry>>>,
  l: TeachLookups,
): string[] {
  const errors: string[] = []
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry) continue
    const err = (msg: string) => errors.push(`${key}: ${msg}`)
    const need = (field: string, s: readonly SignOff[] | undefined, gems: readonly GemId[]) => {
      const miss = missingGems(s, gems)
      if (miss.length) err(`${field} lacks sign-off from ${miss.map((g) => `Gem ${g}`).join(', ')}`)
    }

    if (keyFor(entry) !== key) err(`key does not match record (${keyFor(entry)})`)
    if (entry.locale !== 'en') err(`locale ${entry.locale} is not reviewed for teach content`)

    const r = entry.record
    const status = r.kind === 'dua' ? l.duaStatus(r.id) : undefined
    if (r.kind === 'dua' && !status) err('du\'a id is not in the bundled corpus')
    if (r.kind === 'verse' && !l.verseExists(r.ref)) err('verse ref does not exist')
    if (r.kind === 'name' && !l.nameExists(r.number)) err('Name number does not exist')

    // Field 1
    need('Field 1 (key word)', entry.key_word?.reviewedBy, REQUIRED_SIGNOFF.key_word)
    const words = entry.key_word?.words
    if (!Array.isArray(words) || words.length === 0) err('Field 1 has no words')
    const recordText = l.recordArabic?.(entry)
    if (recordText !== undefined) {
      for (const w of words ?? []) {
        if (recordText.includes(w.arabic)) continue
        if (!ACKNOWLEDGED_FIELD1_MISMATCHES.some((m) => m.key === key && m.arabic === w.arabic)) {
          err(`Field 1 word is not in the record's Arabic byte for byte: ${escapeArabic(w.arabic)}`)
        }
      }
    }

    // Field 2
    const ctx = entry.context
    if (r.kind === 'dua' && !ctx) err('Field 2 is required on a du\'a')
    if (ctx) {
      need('Field 2 (context)', ctx.reviewedBy, REQUIRED_SIGNOFF.context)
      if (ctx.kind === 'not_recorded') {
        if (r.kind !== 'dua') err('Field 2 fallback applies to du\'as only')
        if (ctx.text !== UNATTRIBUTED_CONTEXT_FALLBACK) err('Field 2 fallback is not the locked Gem 4 string')
        if (status && status !== 'not_recorded') err(`Field 2 fallback on a ${status} record would be false`)
      } else if (ctx.kind === 'cited') {
        if (!hasCitations(ctx.citations)) err('Field 2 makes a claim with no citation')
        if (status === 'not_recorded') err('Field 2 on an ungraded or sourceless du\'a must be the Gem 4 fallback only')
      } else {
        err('Field 2 has an unknown kind')
      }
    }

    // Field 3
    const mis = entry.misconception
    if (mis) {
      need('Field 3 (misconception)', mis.reviewedBy, REQUIRED_SIGNOFF.misconception)
      if (mis.authoredBy !== 'founder') err('Field 3 must be Founder-authored')
      if (!hasCitations(mis.citations)) err('Field 3 has no citation; with no citation the field is absent')
    }

    // Field 4
    need('Field 4 (reflection)', entry.reflection?.reviewedBy, REQUIRED_SIGNOFF.reflection)

    // Field 5. A variant that rewrites a field also needs that field's gem
    // (Architect ruling, WO#390 flag 4).
    for (const [aud, v] of Object.entries(entry.by_audience ?? {})) {
      if (!v) continue
      const f = `Field 5 (${aud})`
      if (!AUDIENCES.includes(aud as never)) err(`${f}: unknown audience`)
      need(f, v.reviewedBy, REQUIRED_SIGNOFF.audience_variant)
      if (v.key_word_gloss !== undefined) need(`${f} key_word_gloss`, v.reviewedBy, REQUIRED_SIGNOFF.key_word)
      if (v.context_text !== undefined) {
        if (ctx?.kind !== 'cited') err(`${f}: context_text needs a cited Field 2 (the fallback never varies)`)
        need(`${f} context_text`, v.reviewedBy, REQUIRED_SIGNOFF.context)
      }
      if (v.misconception_text !== undefined) {
        if (!mis) err(`${f}: misconception_text with no Field 3`)
        need(`${f} misconception_text`, v.reviewedBy, REQUIRED_SIGNOFF.misconception)
      }
      if (v.reflection_text !== undefined) need(`${f} reflection_text`, v.reviewedBy, REQUIRED_SIGNOFF.reflection)
    }

    // Related
    if (entry.related) {
      need('related', entry.related.reviewedBy, REQUIRED_SIGNOFF.related)
      for (const ref of entry.related.refs) {
        if (!refResolves(ref, l)) err(`related ref does not resolve: ${JSON.stringify(ref)}`)
      }
    }

  }
  return errors
}

/**
 * Gem 10, whole entry, before publish (WO#405). Separate from the bundle
 * check so Gem-signed field content can land on main unreleased; the release
 * gate (scripts/release-gate.ts) runs this in mcp-deploy before any Fly
 * deploy or npm publish, and refuses the release on any error.
 */
export function publishGateErrors(entries: Readonly<Partial<Record<string, TeachEntry>>>): string[] {
  const errors: string[] = []
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry) continue
    const miss = missingGems(entry.publishReviewedBy, REQUIRED_SIGNOFF.publish)
    if (miss.length) errors.push(`${key}: entry (publish) lacks sign-off from ${miss.map((g) => `Gem ${g}`).join(', ')}`)
  }
  return errors
}

/**
 * The get_dua `id` allowlist (WO#390, Architect ruling on flag 3; widened in
 * WO#405): every du'a id named in a `related` list, plus every du'a that is
 * itself a teach record (a pilot source), sorted and de-duplicated.
 * bundle-data calls this only after validateTeachEntries has passed, so every
 * id it reads is Gem-signed. Any other id is refused at runtime.
 */
export function buildDuaIdAllowlist(entries: Readonly<Partial<Record<string, TeachEntry>>>): string[] {
  const ids = new Set<string>()
  for (const entry of Object.values(entries)) {
    if (entry?.record.kind === 'dua') ids.add(entry.record.id)
    for (const ref of entry?.related?.refs ?? []) if (ref.kind === 'dua') ids.add(ref.id)
  }
  return [...ids].sort()
}
