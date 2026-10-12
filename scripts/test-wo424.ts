/**
 * WO#424 Part B (Gem 4, 7 Oct 2026). A non-Quran record with no grading of its
 * own, whose reference names Ṣaḥīḥ al-Bukhārī or Ṣaḥīḥ Muslim or ends in a
 * parenthesised grading or qualifier, gets Gem 4's line
 * (contracts/gem4-wo424.ts, generated from docs/wo424-gem4.md), is graded,
 * and never carries the ungraded directive. Quran records keep their WO#423
 * line.
 *
 * Planted controls (records built by the real toRecord):
 *   - Bukhārī/Muslim reference with no parentheses: the line;
 *   - parenthesised-grading reference: the line;
 *   - a reference with neither: not graded, the ungraded directive;
 *   - ASCII "Sahih Muslim" also matches; a Quran record keeps its WO#423 line.
 *
 * Then the bundle: every record the rule applies to, by category; and every
 * morning/evening adhkar record has no Grading line that says "not graded"
 * beside a reference carrying its grading.
 *
 * Run: npx tsx scripts/test-wo424.ts
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { referenceCarriesGrading, toRecord, type BundledDua } from '../src/data/duas.js'
import { REFERENCE_GRADING_LINE as LINE } from '../src/contracts/gem4-wo424.js'
import { QURAN_GRADED_REFERENCE_GRADING_LINE as QLINE } from '../src/contracts/gem4-wo423.js'
import { UNGRADED_GRADING_DIRECTIVE } from '../src/contracts/presentation.js'

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`[PASS] ${label}`) } else { failed++; console.log(`[FAIL] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const gradingLine = (b: string) => b.split('\n').find((l) => l.startsWith('Grading: '))
const base: BundledDua = {
  id: 'CTRL', name: 'Control', arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', transliteration: 'Subhan Allah wa bihamdihi',
  translation: 'Glory be to Allah and praise be to Him.', practiceTime: 'Morning', category: 'morning-adhkar', count: 100,
}
const isLine = (r: ReturnType<typeof toRecord>) => gradingLine(r.dua_block) === LINE && r.grading_status === 'graded' && r.hadith_grading_status === 'graded' && !r.grading_directive

async function main() {
  // ── planted controls ──
  check(isLine(toRecord({ ...base, id: 'C1', countSource: 'Ṣaḥīḥ Muslim 2692' })), 'control: a Ṣaḥīḥ Muslim reference with no parentheses gets the line')
  check(isLine(toRecord({ ...base, id: 'C2', countSource: 'Ṣaḥīḥ al-Bukhārī 6306' })), 'control: a Ṣaḥīḥ al-Bukhārī reference with no parentheses gets the line')
  check(isLine(toRecord({ ...base, id: 'C3', countSource: 'Sunan Abī Dāwūd 5088 (ṣaḥīḥ)' })), 'control: a parenthesised-grading reference gets the line')
  check(isLine(toRecord({ ...base, id: 'C4', countSource: 'Ṣaḥīḥ Muslim 2702 (100 times across the day; not morning-specific)' })), 'control: a parenthesised qualifier gets the line')
  const neither = toRecord({ ...base, id: 'C5', countSource: 'Sunan Abī Dāwūd 5088' })
  check(gradingLine(neither.dua_block) !== LINE && neither.grading_status === 'not_recorded' && neither.grading_directive === UNGRADED_GRADING_DIRECTIVE,
    'control: a reference with neither does not get it (not graded, ungraded directive kept)', gradingLine(neither.dua_block))
  check(referenceCarriesGrading('Sahih Muslim 2723') && referenceCarriesGrading('Ṣaḥīḥ Muslim 2723') && !referenceCarriesGrading('Muslim 2723') && !referenceCarriesGrading('Sunan Ibn Mājah 3871'),
    'control: "Ṣaḥīḥ" matches with or without diacritics; a bare collection name does not')
  const own = toRecord({ ...base, id: 'C6', countSource: 'Ṣaḥīḥ Muslim 2692', grading: 'Ṣaḥīḥ' })
  check(gradingLine(own.dua_block) === 'Grading: Ṣaḥīḥ', 'control: a record with its own grading keeps it', gradingLine(own.dua_block))
  const quran = toRecord({ ...base, id: 'C7', origin: 'quran', quran_ref: '112:1', countSource: 'Sunan Abī Dāwūd 5082 (ḥasan)' })
  check(gradingLine(quran.dua_block) === QLINE, 'control: a Quran record keeps its WO#423 line')

  // ── the bundle ──
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const all = JSON.parse(readFileSync(path.join(dir, '..', 'data', 'duas.json'), 'utf-8')) as BundledDua[]
  const applies = all.filter((d) => gradingLine(toRecord(d).dua_block) === LINE)
  const byCat = new Map<string, string[]>()
  for (const d of applies) byCat.set(d.category, [...(byCat.get(d.category) ?? []), d.id])
  console.log(`  the line applies to ${applies.length} records:`)
  for (const [c, ids] of byCat) console.log(`    ${c} (${ids.length}): ${ids.join(', ')}`)
  for (const d of applies) {
    const r = toRecord(d)
    if (!isLine(r)) check(false, `${d.id}: graded, no ungraded directive`)
  }
  check(applies.every((d) => isLine(toRecord(d))), `every record with the line is graded and carries no ungraded directive (${applies.length})`)

  const adhkar = all.filter((d) => d.category === 'morning-adhkar' || d.category === 'evening-adhkar')
  const stillNone = adhkar.filter((d) => {
    const r = toRecord(d)
    const g = gradingLine(r.dua_block) ?? ''
    return (/not recorded|Not graded/.test(g)) && referenceCarriesGrading((r.source ?? '').trim())
  })
  check(adhkar.length === 49 && stillNone.length === 0, `morning/evening adhkar: no "not graded" line beside a graded reference (${stillNone.length} of ${adhkar.length})`, stillNone.map((d) => d.id))

  // ── get_dua: none of them in the "Applies to ungraded" directive ──
  for (const context of ['morning', 'evening']) {
    const res = (await getDuaHandler({ context })) as unknown as { _sakina_meta: { llm_directives: Record<string, unknown> }; content: { duas: { title: string; dua_block: string; grading_directive?: string }[] } }
    const ours = res.content.duas.filter((d) => gradingLine(d.dua_block) === LINE)
    const directives = JSON.stringify(res._sakina_meta.llm_directives)
    check(ours.length > 0 && ours.every((d) => !d.grading_directive), `get_dua(${context}): ${ours.length} records carry the line, none with the ungraded directive`)
    const ungraded = res.content.duas.filter((d) => d.grading_directive)
    check(ungraded.length === 0 ? !directives.includes('Applies to ungraded') : true, `get_dua(${context}): ${ungraded.length} ungraded records, so no "Applies to ungraded" directive`)
  }

  console.log(`\nWO#424 reference gradings: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
