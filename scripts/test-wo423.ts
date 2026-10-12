/**
 * WO#423 (Gem 4 addendum, 6 Oct 2026). A Quran-labelled record whose hadith
 * reference ends in a parenthesised grading gets Gem 4's generic grading line
 * (contracts/gem4-wo423.ts, generated from docs/wo423-gem4.md), is graded,
 * and never carries the ungraded directive. D00143 and D00168 keep their
 * WO#418 Part E line.
 *
 * Planted controls (records built by the real toRecord):
 *   - Quran record, graded reference "… (ḥasan)": the new line, "graded";
 *   - Quran record, ungraded reference: the "not recorded" line, "not_recorded";
 *   - Quran record, parenthesis with no grading in it: not graded;
 *   - non-Quran record with a graded countSource: no hadith_source, no new line.
 *
 * Then the bundle: every record the rule applies to is listed, and each must
 * carry the line and no ungraded directive, also in get_dua's responses.
 *
 * Run: npx tsx scripts/test-wo423.ts
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { endsInParenthesisedGrading, getDuaRecordById, toRecord, type BundledDua } from '../src/data/duas.js'
import { QURAN_GRADED_REFERENCE_GRADING_LINE as LINE } from '../src/contracts/gem4-wo423.js'
import { AYAT_AL_KURSI_PRACTICE_GRADING_LINE } from '../src/contracts/gem4-wo418.js'
import { UNGRADED_SCOPE_HEAD } from '../src/contracts/gem4-wo418.js'

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`[PASS] ${label}`) } else { failed++; console.log(`[FAIL] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const gradingLine = (b: string) => b.split('\n').find((l) => l.startsWith('Grading: '))

const base: BundledDua = {
  id: 'CTRL', name: 'Control', arabic: 'قُلْ هُوَ اللَّهُ أَحَدٌ', transliteration: 'Qul huwa Allahu ahad',
  translation: 'Say: He is Allah, the One!', practiceTime: 'Morning', category: 'morning-adhkar', count: 3,
  origin: 'quran', quran_ref: '112:1',
}

async function main() {
  // ── planted controls ──
  const graded = toRecord({ ...base, id: 'C1', countSource: 'Sunan Abī Dāwūd 9999 (ḥasan)' })
  check(gradingLine(graded.dua_block) === LINE && graded.hadith_grading_status === 'graded' && !graded.grading_directive,
    'control: a Quran record with a graded reference gets the new line and "graded"', graded.dua_block.split('\n').slice(-2))
  const ungraded = toRecord({ ...base, id: 'C2', countSource: 'Sunan Abī Dāwūd 9999' })
  check(gradingLine(ungraded.dua_block) !== LINE && ungraded.hadith_grading_status === 'not_recorded' && /not recorded/.test(gradingLine(ungraded.dua_block) ?? ''),
    'control: a Quran record with an ungraded reference does not get it', gradingLine(ungraded.dua_block))
  const noGrade = toRecord({ ...base, id: 'C3', countSource: 'Sunan Abī Dāwūd 9999 (no. 3)' })
  check(gradingLine(noGrade.dua_block) !== LINE && noGrade.hadith_grading_status === 'not_recorded',
    'control: a parenthesis with no grading in it is not a graded reference', gradingLine(noGrade.dua_block))
  const notQuran = toRecord({ ...base, id: 'C4', origin: undefined, quran_ref: undefined, countSource: 'Sunan Abī Dāwūd 9999 (ḥasan)' })
  check(!notQuran.hadith_source && gradingLine(notQuran.dua_block) !== LINE,
    'control: a non-Quran record is unaffected (the rule is for Quran-labelled records)', gradingLine(notQuran.dua_block))
  check(endsInParenthesisedGrading('X 1 (ḍaʿīf; similar in Y)') && !endsInParenthesisedGrading('X 1 (ḥasan) note') && !endsInParenthesisedGrading(undefined),
    'control: the grading must be in a parenthesis that ends the reference')

  // ── WO#418 Part E unchanged ──
  for (const id of ['D00143', 'D00168']) {
    const r = getDuaRecordById(id)!
    check(gradingLine(r.dua_block) === AYAT_AL_KURSI_PRACTICE_GRADING_LINE && r.hadith_grading_status === 'graded', `${id} keeps its WO#418 Part E line`)
  }

  // ── the bundle ──
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const all = JSON.parse(readFileSync(path.join(dir, '..', 'data', 'duas.json'), 'utf-8')) as BundledDua[]
  const applies = all.filter((d) => {
    const r = toRecord(d)
    return r.origin === 'quran' && gradingLine(r.dua_block) === LINE
  })
  console.log(`  the new line applies to ${applies.length}: ${applies.map((d) => `${d.id} (${d.category}, ${d.quran_ref})`).join(', ')}`)
  for (const d of applies) {
    const r = toRecord(d)
    check(r.hadith_grading_status === 'graded' && !r.grading_directive && r.grading_status !== 'not_recorded' && endsInParenthesisedGrading(r.hadith_source),
      `${d.id}: graded, no ungraded directive, reference ${JSON.stringify(r.hadith_source)}`)
  }
  for (const id of ['D00144', 'D00145', 'D00146', 'D00169', 'D00170', 'D00171', 'D00154', 'D00179'])
    check(applies.some((d) => d.id === id), `${id} is among the records the rule applies to (Architect's list)`)
  // a Quran record with a hadith reference that is NOT graded must still say so
  const stillUngraded = all.map(toRecord).filter((r) => r.origin === 'quran' && r.hadith_source && r.hadith_grading_status === 'not_recorded')
  console.log(`  Quran records with an ungraded hadith reference (unchanged): ${stillUngraded.length}`)

  // ── get_dua responses: none of them in the "Applies to ungraded" directive ──
  for (const context of ['morning', 'evening']) {
    const res = (await getDuaHandler({ context })) as unknown as { _sakina_meta: { llm_directives: Record<string, unknown> }; content: { duas: { title: string; dua_block: string; hadith_grading_status?: string; grading_directive?: string }[] } }
    const directives = JSON.stringify(res._sakina_meta.llm_directives)
    const scoped = (directives.match(new RegExp(`${UNGRADED_SCOPE_HEAD.replace(/[()]/g, '\\$&')}\\(([^)]*)\\)`)) ?? [])[1] ?? ''
    const ours = res.content.duas.filter((d) => gradingLine(d.dua_block) === LINE)
    check(ours.length > 0 && ours.every((d) => d.hadith_grading_status === 'graded' && !d.grading_directive),
      `get_dua(${context}): ${ours.length} records carry the new line, all graded, none with the ungraded directive`)
    const ungradedTitles = new Set(res.content.duas.filter((d) => d.grading_directive).map((d) => d.title))
    const leaked = ours.filter((d) => scoped.split(', ').includes(d.title) && !ungradedTitles.has(d.title))
    check(leaked.length === 0, `get_dua(${context}): no record with the new line is named in the "Applies to ungraded" directive`, leaked.map((d) => d.title))
  }

  console.log(`\nWO#423 graded references: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
