/**
 * WO#430 (Gem 3 ruling, 7 Oct 2026): parent du'as and grief, end to end.
 *
 * Every query goes through queryDuasByContext (the get_dua lookup), never a
 * helper on its own, and is judged on the du'as it actually returns, read
 * against the bundle's parentState:
 *
 *   1. each query in the WO#428 living/deceased table that names a death or
 *      "miss", and each death word with each parent word, returns no 'living'
 *      du'a; a parent + death word never resolves to mothers or fathers;
 *   2. "miss" + parent returns only that parent's 'both' du'as;
 *   3. a plain parent query ("my mother", "parents", "dua for my father") is
 *      unchanged: the whole category;
 *   4. every bundled mothers/fathers du'a carries parentState;
 *   5. the word lists here equal the app's (src/data/duas/parent-grief.ts).
 *
 * CONTROLS: the check that judges a result must fail on a planted 'living' du'a
 * for "my late mother", and on a planted mothers resolution.
 *
 * Run: npx tsx scripts/test-wo430.ts
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { queryDuasByContext } from '../src/data/duas.js'
import { DEATH_WORDS, MISS_WORDS, PARENT_WORDS } from '../src/data/context-matcher.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BUNDLE = JSON.parse(readFileSync(path.resolve(HERE, '..', 'data', 'duas.json'), 'utf-8')) as Array<{ id: string; category: string; parentState?: string }>
const STATE = new Map(BUNDLE.map((d) => [d.id, d.parentState]))

let failures = 0
let passes = 0
const check = (ok: boolean, name: string, detail?: unknown) => {
  if (ok) {
    passes++
    console.log(`[PASS] ${name}`)
  } else {
    failures++
    console.log(`[FAIL] ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
  }
}

/** The judgement every grief query must pass: no 'living' du'a, and not the
 *  mothers/fathers categories. Returns the problems (empty = clean). */
function griefProblems(r: { resolvedCategory: string | null; ids: string[] }): string[] {
  const out: string[] = []
  const living = r.ids.filter((id) => STATE.get(id) === 'living')
  if (living.length) out.push(`living du'as: ${living.join(', ')}`)
  if (r.resolvedCategory === 'mothers' || r.resolvedCategory === 'fathers') out.push(`resolved to ${r.resolvedCategory}`)
  return out
}

// ── controls ──────────────────────────────────────────────────────────────
check(griefProblems({ resolvedCategory: 'deceased', ids: ['D00403', 'D00120'] }).length > 0, 'control: a living du\'a (D00120) planted in "my late mother" is caught')
check(griefProblems({ resolvedCategory: 'mothers', ids: ['D00125'] }).length > 0, 'control: a mothers resolution is caught even with only a both du\'a')
check(griefProblems({ resolvedCategory: 'deceased', ids: ['D00403', 'D00404'] }).length === 0, 'control: a deceased result is clean')

// ── 4. tags in the bundle ───────────────────────────────────────────────────
const parentDuas = BUNDLE.filter((d) => d.category === 'mothers' || d.category === 'fathers')
check(parentDuas.length === 42 && parentDuas.every((d) => d.parentState === 'living' || d.parentState === 'both'), `every bundled mothers/fathers du'a carries parentState (${parentDuas.length})`, parentDuas.filter((d) => !d.parentState).map((d) => d.id))
const both = parentDuas.filter((d) => d.parentState === 'both').map((d) => d.id).sort()
check(JSON.stringify(both) === JSON.stringify(['D00125', 'D00128', 'D00130', 'D00133', 'D00372', 'D00377']), `'both' is the Architect's six (${both.join(', ')})`)

// ── 1. grief queries ────────────────────────────────────────────────────────
// The WO#428 report's table (docs/wo428-living-deceased-report.md), minus the
// plain parent query "parents" (unchanged, below) and the parent-less "grave".
const TABLE = [
  'my late mother', 'my late father', 'visiting my mothers grave', 'my mum passed', 'dead mother', 'my dad is dead',
  'janaza for my father', 'burial of my mother', "my father's grave", 'my mother passed away', 'I lost my mother',
  'my father died', 'grief after losing my mother', 'dua for my deceased mother', 'mother passed away',
  'forgiveness for my late mother',
]
const generated: string[] = []
for (const p of PARENT_WORDS) for (const d of DEATH_WORDS) generated.push(`my ${d} ${p}`, `my ${p} ${d}`)
generated.push('my mother passed away', 'my dad passed away', 'my parents passed away')
let bad = 0
for (const q of [...TABLE, ...generated]) {
  const r = queryDuasByContext(q)
  const problems = griefProblems(r)
  if (problems.length) {
    bad++
    check(false, `"${q}"`, { resolved: r.resolvedCategory, problems })
  }
}
check(bad === 0, `${TABLE.length + generated.length} grief queries (the WO#428 table and every death word with every parent word, both orders): no 'living' du'a, never mothers or fathers`)
for (const q of ['my late mother', 'visiting my mothers grave', 'janaza for my father']) {
  const r = queryDuasByContext(q)
  check(r.resolvedCategory === 'deceased' && r.ids.length > 0, `"${q}" -> deceased (${r.ids.length})`, r.resolvedCategory)
}
for (const q of ['my mother passed away', 'I lost my mother', 'my father died']) {
  const r = queryDuasByContext(q)
  check(r.resolvedCategory === 'bereaved', `"${q}" -> bereaved`, r.resolvedCategory)
}

// ── 2. miss ────────────────────────────────────────────────────────────────
const MISS = [
  ['I miss my mother', ['D00125', 'D00128', 'D00130', 'D00133']],
  ['missing my mum', ['D00125', 'D00128', 'D00130', 'D00133']],
  ['I miss my dad', ['D00372', 'D00377']],
  ['I miss my parents', ['D00125', 'D00128', 'D00130', 'D00133', 'D00372', 'D00377']],
] as const
for (const [q, want] of MISS) {
  const r = queryDuasByContext(q)
  check(JSON.stringify([...r.ids].sort()) === JSON.stringify([...want]) && r.ids.every((id) => STATE.get(id) === 'both'), `"${q}" -> only the 'both' du'as (${r.ids.join(', ')})`, r.ids)
}

// ── 3. plain parent queries unchanged ─────────────────────────────────────
for (const [q, cat, n] of [['my mother', 'mothers', 23], ['parents', 'mothers', 23], ['dua for my father', 'fathers', 19], ['mother', 'mothers', 23]] as const) {
  const r = queryDuasByContext(q)
  check(r.resolvedCategory === cat && r.ids.length === n, `plain "${q}" unchanged -> ${cat} (${r.ids.length})`, [r.resolvedCategory, r.ids.length])
}
check(queryDuasByContext('grave').resolvedCategory === null, '"grave" alone still resolves to nothing')
check(queryDuasByContext('lost my job').resolvedCategory === 'work-success', '"lost my job" (no parent) unchanged -> work-success')

// ── 5. parity with the app's lists ──────────────────────────────────────────
const app = readFileSync(path.resolve(HERE, '..', '..', 'src', 'data', 'duas', 'parent-grief.ts'), 'utf-8')
const arr = (name: string) => {
  const m = new RegExp(`export const ${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\]`).exec(app)
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null
}
for (const [name, mine] of [['PARENT_WORDS', PARENT_WORDS], ['DEATH_WORDS', DEATH_WORDS], ['MISS_WORDS', MISS_WORDS]] as const) {
  const theirs = arr(name)
  check(!!theirs && JSON.stringify(theirs) === JSON.stringify(mine), `${name} equals the app's (src/data/duas/parent-grief.ts)`, { mine, theirs })
}

console.log(`\nWO#430 parent grief routing: ${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
