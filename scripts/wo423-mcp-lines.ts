/**
 * WO#423 item 3 (report): the Source and Grading lines get_dua emits for the
 * 49 morning and evening adhkar records, as JSON. Run on this branch for
 * "after" and on an export of main (scripts/wo423-mcp-lines.sh) for "before",
 * so each side is that side's code on that side's data.
 *
 * For a non-Quran record with no grading of its own, the record's grading is
 * inferGradingFromSource(source) (mcp-server/src/data/duas.ts), or the "Not
 * graded" fallback when that returns ''. Its ASCII patterns ("Sahih Muslim",
 * "Bukhari") are tested here against the transliterated strings too.
 *
 * Run: npx tsx scripts/wo423-mcp-lines.ts > out.json
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDuaRecordById } from '../src/data/duas.js'

type B = { id: string; category: string; source?: string; grading?: string; countSource?: string; origin?: string; quran_ref?: string }
const dir = path.dirname(fileURLToPath(import.meta.url))
const all = JSON.parse(readFileSync(path.join(dir, '..', 'data', 'duas.json'), 'utf-8')) as B[]
const ad = all.filter((d) => d.category === 'morning-adhkar' || d.category === 'evening-adhkar')
// the ASCII patterns of inferGradingFromSource, as they read in duas.ts
const QURAN_RE = /Quran|Qur'an|qur'an/i
const SAHIHAYN_RE = /Sahih al-Bukhari|Bukhari|Sahih Muslim/i
const out = ad.map((d) => {
  const r = getDuaRecordById(d.id)!
  const lines = r.dua_block.split('\n')
  return {
    id: d.id,
    category: d.category,
    quran: r.origin === 'quran' ? d.quran_ref : null,
    bundled: { source: d.source ?? null, grading: d.grading ?? null, countSource: d.countSource ?? null },
    sourceLine: lines.find((l) => l.startsWith('Source: ')) ?? null,
    gradingLine: lines.find((l) => l.startsWith('Grading: ')) ?? null,
    grading: r.grading,
    grading_status: r.grading_status,
    hadith_source: (r as { hadith_source?: string }).hadith_source ?? null,
    hadith_grading_status: (r as { hadith_grading_status?: string }).hadith_grading_status ?? null,
    ungradedDirective: Boolean(r.grading_directive),
    infer: r.origin === 'quran' || d.grading
      ? null
      : {
          from: d.source ?? null,
          quranRe: QURAN_RE.test(d.source ?? ''),
          sahihaynRe: SAHIHAYN_RE.test(d.source ?? ''),
          sahihaynReOnCountSource: SAHIHAYN_RE.test(d.countSource ?? ''),
          result: r.grading,
        },
  }
})
console.log(JSON.stringify(out, null, 1))
