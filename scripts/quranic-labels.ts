/**
 * Quranic du'a labelling for the MCP bundle (WO#377 addendum, 1.4.0).
 *
 * LABELLING ONLY. The source corpus (`src/data/duas/_by-category/*.ts`) is
 * never edited here (WO#86 rule). At bundle time, a du'a record listed below:
 *   - has its Arabic resolved from the canonical scripture module
 *     (`src/lib/scripture`, Tanzil Uthmani bytes, never mutated);
 *   - gains `origin: 'quran'` and `quran_ref` (surah:ayah).
 *
 * A record is listed ONLY when Gem 2 has ruled on that record's own Quran
 * ref (WO#305). A skeleton match against a clause Gem 2 approved on another
 * surface is evidence, not a ruling (Architect, 25 Sep 2026): the six such
 * records are the fast-track batch at the top of
 * docs/wo377-gem2-parked-quranic.md, and join this list only on a ruling.
 *
 * Everything else, including the fast-track batch and the candidates from
 * docs/wo305-batch1-quranic-candidates.json, is untouched and parked for
 * Gem 2 (see docs/wo377-sg-report.md, addendum).
 *
 * The bundle step fails if a listed record's corpus Arabic no longer
 * skeleton-matches its resolved clause, so a corpus edit cannot silently
 * attach a Quran citation to different text.
 */

import { getVerseArabic, getVerseClause } from '../../src/lib/scripture/index.js'

export interface QuranicLabel {
  id: string
  /** Citation ref, "surah:ayah" or "surah:ayah-ayah". */
  ref: string
  /** Resolves the Arabic from the scripture module (bytes verbatim). */
  resolve: () => string
  /** Where the Gem 2 verification is recorded. */
  ratification: string
}

export const RECORD_RATIFIED: QuranicLabel[] = [
  {
    id: 'D00068',
    ref: '21:87',
    resolve: () => getVerseArabic('21:87'),
    ratification: 'WO#305, PR #361 (D00068 sourced from Tanzil 21:87)',
  },
  {
    id: 'D00060',
    ref: '20:25-26',
    // Same bounds as the Phase A ratified migration: Musa's supplication
    // without the narrative qala, then 20:26 in full.
    resolve: () => `${getVerseClause('20:25', 1)} ${getVerseArabic('20:26')}`,
    ratification: 'WO#305 Phase A, commit 5e5fee88 (20:25-26 bounds)',
  },
  {
    id: 'D00271',
    ref: '13:28',
    resolve: () => getVerseArabic('13:28'),
    ratification: 'WO#305 Phase 2, PR #355 (D00271 corrected to full 13:28)',
  },
]

export const QURANIC_LABELS: QuranicLabel[] = [...RECORD_RATIFIED]

// ─── Skeleton comparison (verification only; never used for output) ─────
// Same normaliser as scripts/wo305-quranic-insert-detector.py, plus a
// hamza-seat fold (ئ ؤ -> ي و) so a precomposed seat in the corpus compares
// equal to Tanzil's seat + combining hamza.

function isMark(cp: number): boolean {
  return (
    (cp >= 0x0610 && cp < 0x061b) ||
    (cp >= 0x064b && cp < 0x0660) ||
    (cp >= 0x06d6 && cp < 0x06dd) ||
    (cp >= 0x06df && cp < 0x06e9) ||
    (cp >= 0x06ea && cp < 0x06ee) ||
    cp === 0x0640
  )
}

export function skeleton(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp === 0x0670) { out += 'ا'; continue }
    if (isMark(cp)) continue
    if ('ٱأإآ'.includes(ch)) { out += 'ا'; continue }
    if (ch === 'ى' || ch === 'ئ') { out += 'ي'; continue }
    if (ch === 'ؤ') { out += 'و'; continue }
    if (ch === 'ة') { out += 'ه'; continue }
    if ((cp >= 0x0621 && cp <= 0x064a) || (cp >= 0x0671 && cp <= 0x06d3)) out += ch
  }
  return out
}
