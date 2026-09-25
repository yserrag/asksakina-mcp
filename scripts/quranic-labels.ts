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
 * surface is evidence, not a ruling (Architect, 25 Sep 2026). Six of the
 * seven fast-track records joined on Gem 2's ruling of 25 Sep 2026
 * (FASTTRACK_RATIFIED below); D00091 is held pending its title.
 *
 * Everything else, the remaining candidates from
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
  /**
   * Gem 2's ruled first and last words of a clause, as bare consonants. The
   * bundle step checks the resolved clause's first and last words against
   * them by skeleton, so a shift in the module's word indexes (for example a
   * fix to the U+08F0 + space split, which sits before the 3:173 clause)
   * fails the bundle instead of moving the clause. Never used for output.
   */
  anchors?: readonly [first: string, last: string]
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

/**
 * WO#377 fast-track batch, ruled by Gem 2 on 25 Sep 2026: all seven are
 * Quranic CLAUSES running to the end of the ayah. Six are labelled here;
 * D00091 is held (see the note at the end of the list). Word indexes are the
 * module's (0-based, split on U+0020): 3:173 from word 14 (the U+08F0 +
 * space split at words 11-12 counts as an extra word), 7:23 from word 1
 * (after qala), 9:129 from word 3, 25:74 from word 2. Arabic is resolved
 * from the scripture module; the corpus is not edited. D00154 and D00179
 * keep their hadith reference (countSource, Sunan Abi Dawud 5081) visible
 * beside the Quran citation (labelling rule).
 */
const FASTTRACK_RULING = 'Gem 2, WO#377 fast-track batch ruling (25 Sep 2026), docs/wo377-gem2-fasttrack-batch.md'
export const FASTTRACK_RATIFIED: QuranicLabel[] = [
  { id: 'D00003', ref: '3:173', resolve: () => getVerseClause('3:173', 14), ratification: FASTTRACK_RULING, anchors: ['حسبنا', 'الوكيل'] },
  { id: 'D00504', ref: '3:173', resolve: () => getVerseClause('3:173', 14), ratification: FASTTRACK_RULING, anchors: ['حسبنا', 'الوكيل'] },
  { id: 'D00330', ref: '7:23', resolve: () => getVerseClause('7:23', 1), ratification: FASTTRACK_RULING, anchors: ['ربنا', 'الخاسرين'] },
  { id: 'D00154', ref: '9:129', resolve: () => getVerseClause('9:129', 3), ratification: FASTTRACK_RULING, anchors: ['حسبي', 'العظيم'] },
  { id: 'D00179', ref: '9:129', resolve: () => getVerseClause('9:129', 3), ratification: FASTTRACK_RULING, anchors: ['حسبي', 'العظيم'] },
  { id: 'D00308', ref: '25:74', resolve: () => getVerseClause('25:74', 2), ratification: FASTTRACK_RULING, anchors: ['ربنا', 'اماما'] },
  // D00091 (also ruled 25:74, words 2 to the end) is HELD, unlabelled
  // (Architect, 25 Sep 2026): its corpus title says Al 'Imran 38, and D00092
  // carries its title in reverse. It is labelled only after the collection
  // owner rules on the title swap (docs/TECHNICAL_DEBT.md). The MCP output
  // never overrides a corpus title.
]

export const QURANIC_LABELS: QuranicLabel[] = [...RECORD_RATIFIED, ...FASTTRACK_RATIFIED]

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
