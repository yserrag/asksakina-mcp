/**
 * Quranic du'a labelling for the MCP bundle (WO#377 addendum, 1.4.0).
 *
 * LABELLING ONLY. The source corpus (`src/data/duas/_by-category/*.ts`) is
 * never edited here (WO#86 rule). At bundle time, a du'a record listed below:
 *   - has its Arabic resolved from the canonical scripture module
 *     (`src/lib/scripture`, Tanzil Uthmani bytes, never mutated);
 *   - gains `origin: 'quran'` and `quran_ref` (surah:ayah).
 *
 * WO#406 Phase 2: the list and the skeleton check now live in the shared du'a
 * layer (`src/data/duas/quranic-text.ts`), which also serves this Arabic to
 * the app at read time. This file re-exports them so the bundle and the app
 * read one list of slices.
 *
 * A record is listed ONLY when Gem 2 has ruled on that record's own Quran
 * ref (WO#305). A skeleton match against a clause Gem 2 approved on another
 * surface is evidence, not a ruling (Architect, 25 Sep 2026). Six of the
 * seven fast-track records joined on Gem 2's ruling of 25 Sep 2026
 * (FASTTRACK_RATIFIED below). The seventh, D00091, was held pending its title
 * until WO#413 ruled the D00091/D00092 title swap; it is now labelled 25:74
 * from word 2 through the WO#413 list (`src/data/duas/quranic-text-wo413.ts`).
 *
 * Everything else, the remaining candidates from
 * docs/wo305-batch1-quranic-candidates.json, is untouched and parked for
 * Gem 2 (see docs/wo377-sg-report.md, addendum).
 *
 * The bundle step fails if a listed record's corpus Arabic no longer
 * skeleton-matches its resolved clause, so a corpus edit cannot silently
 * attach a Quran citation to different text.
 */

export {
  QURANIC_DUA_TEXT as QURANIC_LABELS,
  RECORD_RATIFIED,
  FASTTRACK_RATIFIED,
  skeleton,
  type QuranicDuaText as QuranicLabel,
} from '../../src/data/duas/quranic-text.js'
