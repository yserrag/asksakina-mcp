/**
 * WO#454 (Architect, 11 Oct): Gem 10's final conditions for MCP 2.1.0.
 *
 *   1. the "Not a narration" directive is live, never on a Quranic record;
 *   2. grading_status 'not_a_narration': no ungraded directive, its own
 *      grading_summary count, require_grading 'per_record'; the teach
 *      validator treats it exactly as it treated 'graded';
 *   3. DUA_DIRECTIVES: Gem 10's dua_block line;
 *   4. the soft crisis_resource directive; the hard, abuse and ordering
 *      directives and every resource text unchanged;
 *   5. the anti-summarisation line on a du'a response with more than one record;
 *   6. the Quran citation line wherever the Quran contract applies, and only there.
 *
 * Every new behaviour has a control.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getDuaRecordById,
  gradingStatusById,
  NOT_A_NARRATION_DIRECTIVE_LIVE,
  plantDuasForTest,
  setNotANarrationDirectiveForTest,
  type BundledDua,
} from '../src/data/duas.js'
import { abuseResponse, ABUSE_ORDER_DIRECTIVE, duaByIdResponse, getDuaHandler, quranContractFor } from '../src/tools/get-dua.js'
import {
  ANTI_SUMMARISATION_DIRECTIVE,
  DUA_BLOCK_DIRECTIVE,
  DUA_DIRECTIVES,
  NOT_A_NARRATION_DIRECTIVE,
  NOT_A_NARRATION_SCOPE_HEAD,
  QURAN_CITATION_DIRECTIVE,
  UNGRADED_GRADING_DIRECTIVE,
} from '../src/contracts/presentation.js'
import { distressBlockFor, SOFT_DISTRESS_RESOURCE_BLOCK } from '../src/safety/crisis-keywords.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import { validateTeachEntries, type TeachLookups } from '../src/teach/validate.js'
import type { TeachEntry } from '../src/teach/types.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(HERE, '..', 'data')

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) {
    passed++
    console.log(`[PASS] ${label}`)
  } else {
    failed++
    console.log(`[FAIL] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}

type Rec = { title: string; grading?: string; grading_status?: string; grading_directive?: string; origin?: string; quran_spans?: unknown[] }
type Resp = {
  _sakina_meta: { llm_directives: { CRITICAL_RULES: string[] }; presentation_contract: { hadith?: { require_grading?: unknown }; quran?: unknown } }
  content: { duas?: Rec[]; grading_summary?: Record<string, number>; total_results?: number }
  crisis_resource?: { directive: string; text: string; level: string }
}
const byId = (id: string) => duaByIdResponse(id, 'en', [id]) as unknown as Resp
const byContext = async (context: string) => (await getDuaHandler({ context })) as unknown as Resp
const rules = (r: Resp) => r._sakina_meta.llm_directives.CRITICAL_RULES
const count = (xs: readonly string[], x: string) => xs.filter((y) => y === x).length

const BUNDLE = JSON.parse(readFileSync(path.join(DATA, 'duas.json'), 'utf-8')) as (BundledDua & { quran_spans?: unknown[] })[]
const NOT_A_NARRATION = 'Not a narration'

// ---- 1. the "Not a narration" directive ---------------------------------------
function testDirective() {
  console.log('\n=== 1. the "Not a narration" directive (Gem 10 item D) ===')
  check(NOT_A_NARRATION_DIRECTIVE === 'This is a general supplication, not a narration from the Prophet (peace be upon him). Do NOT present it as a hadith, and do NOT attach a grading.', 'wording is Gem 10\'s, verbatim')
  check(NOT_A_NARRATION_DIRECTIVE_LIVE === true, 'live in the package')

  const r = byId('D00406')
  const d = r.content.duas?.[0]
  const scoped = `${NOT_A_NARRATION_SCOPE_HEAD}(${d?.title}): ${NOT_A_NARRATION_DIRECTIVE}`
  check(d?.grading === NOT_A_NARRATION && d?.grading_directive === NOT_A_NARRATION_DIRECTIVE, 'D00406 carries it on the record')
  check(count(rules(r), scoped) === 1 && !rules(r).includes(NOT_A_NARRATION_DIRECTIVE), 'CRITICAL_RULES carries it once, scoped to the title, never bare', rules(r))
  check(scoped.startsWith('Applies to these general supplication(s) only ('), 'the scope line reads "Applies to these general supplication(s) only (<titles>): <the wording>"')

  // every bundled record
  const records = BUNDLE.map((b) => ({ b, r: getDuaRecordById(b.id)! }))
  const carriers = records.filter(({ r }) => r.grading_directive === NOT_A_NARRATION_DIRECTIVE)
  const quranCarriers = records.filter(({ b, r }) => (b.origin === 'quran' || r.origin === 'quran') && r.grading_directive === NOT_A_NARRATION_DIRECTIVE)
  check(quranCarriers.length === 0, 'no record with origin "quran" carries it (all 440)', quranCarriers.map(({ b }) => b.id))
  check(carriers.length === 92 && carriers.every(({ b }) => b.grading === NOT_A_NARRATION), `exactly the 92 "Not a narration" records carry it (${carriers.length})`)
  const mixed = carriers.filter(({ b, r }) => b.origin !== 'quran' && r.quran_spans?.length)
  check(mixed.length === 2, `mixed records (non-quran origin, with quran_spans) carrying it: ${mixed.length} (${mixed.map(({ b }) => b.id).join(', ')})`)

  // planted: a Quran-origin record whose grading reads "Not a narration" must not carry it
  const planted: BundledDua = {
    id: 'WO454-PLANTED-QURAN',
    name: 'Planted Quranic Fixture',
    arabic: 'رَبِّ زِدۡنِي عِلۡمࣰا',
    translation: 'My Lord! Increase me in knowledge.',
    category: 'general',
    origin: 'quran',
    quran_ref: '20:114',
    grading: NOT_A_NARRATION,
  } as BundledDua
  const unplant = plantDuasForTest([planted])
  try {
    const p = getDuaRecordById(planted.id)!
    check(p.origin === 'quran' && p.grading_status === 'quranic' && p.grading_directive !== NOT_A_NARRATION_DIRECTIVE, 'planted: a Quran-origin record graded "Not a narration" is quranic and does not carry it', p)
    const pr = duaByIdResponse(planted.id, 'en', [planted.id]) as unknown as Resp
    check(!JSON.stringify(pr).includes(NOT_A_NARRATION_DIRECTIVE), 'planted: nor does its response')
  } finally {
    unplant()
  }

  // Gem 10 D, condition 2: a Quran-origin record with its grading unpopulated,
  // or marked non-hadith in other words, never receives it either.
  const variants: [string, Partial<BundledDua>][] = [
    ['no grading field', {}],
    ['empty grading', { grading: '' }],
    ['"not a narration" (lower case)', { grading: 'not a narration' }],
    ['"Not a hadith"', { grading: 'Not a hadith' }],
    ['origin quran with no quran_ref, graded "Not a narration"', { quran_ref: undefined, grading: NOT_A_NARRATION }],
  ]
  for (const [label, over] of variants) {
    const v = { ...planted, id: `WO454-Q-${label.replace(/\W+/g, '-')}`.slice(0, 40), ...over } as BundledDua
    if (!('grading' in over)) delete (v as { grading?: string }).grading
    const undo = plantDuasForTest([v])
    try {
      const rec = getDuaRecordById(v.id)!
      const resp = JSON.stringify(duaByIdResponse(v.id, 'en', [v.id]))
      check(rec.grading_status !== 'not_a_narration' && rec.grading_directive !== NOT_A_NARRATION_DIRECTIVE && !resp.includes(NOT_A_NARRATION_DIRECTIVE), `planted Quran-origin, ${label}: no "Not a narration" status or directive (status ${rec.grading_status})`)
    } finally {
      undo()
    }
  }

  // controls
  check(!JSON.stringify(byId('D00255')).includes(NOT_A_NARRATION_DIRECTIVE), 'control: a graded hadith du\'a (D00255) never carries it')
  check(!JSON.stringify(byId('D00068')).includes(NOT_A_NARRATION_DIRECTIVE), 'control: a Qur\'an-labelled du\'a (D00068) never carries it')
  setNotANarrationDirectiveForTest(false)
  try {
    check(!JSON.stringify(byId('D00406')).includes(NOT_A_NARRATION_DIRECTIVE), 'control: with the hook off, D00406 carries nothing (the hook is what the byte comparison measures)')
  } finally {
    setNotANarrationDirectiveForTest(true)
  }
  check(byId('D00406').content.duas?.[0]?.grading_directive === NOT_A_NARRATION_DIRECTIVE, 'the hook is back on')
}

// ---- 2. grading_status 'not_a_narration' --------------------------------------
async function testStatus() {
  console.log('\n=== 2. grading_status \'not_a_narration\' ===')
  const statuses = BUNDLE.map((b) => ({ b, s: gradingStatusById(b.id), r: getDuaRecordById(b.id)! }))
  const nan = statuses.filter(({ s }) => s === 'not_a_narration')
  check(nan.length === 92 && nan.every(({ b }) => b.grading === NOT_A_NARRATION), `the 92 "Not a narration" records have status not_a_narration (${nan.length})`)
  check(statuses.filter(({ b }) => b.grading === NOT_A_NARRATION).every(({ s }) => s === 'not_a_narration'), 'none of them is still graded')
  check(nan.every(({ r }) => r.grading_directive !== UNGRADED_GRADING_DIRECTIVE), 'the ungraded directive fires on none of them')
  check(!JSON.stringify(byId('D00406')).includes(UNGRADED_GRADING_DIRECTIVE), 'nor in a response carrying one (D00406)')

  // control: a planted ungraded record still gets the ungraded directive, not the new one
  const unplant = plantDuasForTest([{ id: 'WO454-PLANTED-UNGRADED', name: 'Planted Ungraded Fixture', arabic: 'اللَّهُمَّ', translation: 'O Allah', category: 'general' } as BundledDua])
  try {
    const u = getDuaRecordById('WO454-PLANTED-UNGRADED')!
    check(u.grading_status === 'not_recorded' && u.grading_directive === UNGRADED_GRADING_DIRECTIVE, 'control: an ungraded record is still not_recorded with the ungraded directive')
  } finally {
    unplant()
  }

  const mothers = await byContext('mothers')
  const s = mothers.content.grading_summary ?? {}
  const total = mothers.content.total_results ?? -1
  const expected = (mothers.content.duas ?? []).filter((d) => d.grading_status === 'not_a_narration').length
  check(s.not_a_narration === expected && expected > 0 && s.quranic + s.graded + s.not_a_narration + s.not_recorded === total, `grading_summary has its own count (mothers: ${JSON.stringify(s)})`)
  check(mothers._sakina_meta.presentation_contract.hadith?.require_grading === 'per_record', 'mothers: require_grading is per_record')
  const morning = await byContext('morning-adhkar')
  check(morning.content.grading_summary?.not_a_narration === 0 && morning._sakina_meta.presentation_contract.hadith?.require_grading === true, 'control: morning-adhkar (none present) keeps require_grading true')
  check(byId('D00406')._sakina_meta.presentation_contract.hadith?.require_grading === 'per_record', 'id path: D00406 alone is per_record')
  check(byId('D00255')._sakina_meta.presentation_contract.hadith?.require_grading === true, 'control: id path D00255 (graded) keeps true')

  // teach validator: the same verdicts for 'not_a_narration' as for 'graded'
  const as = (status: 'graded' | 'not_a_narration'): TeachLookups => ({
    duaStatus: () => status,
    verseExists: () => true,
    nameExists: () => true,
    glossaryHas: () => true,
  })
  const base = TEACH_ENTRIES['dua:D00060'] as TeachEntry
  const fallback = { ...base, context: { kind: 'not_recorded', text: 'Source not recorded in the AskSakina corpus. Not attributed to the Prophet (peace be upon him) or the Companions.', reviewedBy: base.context!.reviewedBy } } as TeachEntry
  for (const [label, entry] of [['cited Field 2', base], ['fallback Field 2', fallback]] as const) {
    const g = validateTeachEntries({ 'dua:D00060': entry }, as('graded'))
    const n = validateTeachEntries({ 'dua:D00060': entry }, as('not_a_narration'))
    check(JSON.stringify(g.map((e) => e.replace('graded', 'X'))) === JSON.stringify(n.map((e) => e.replace('not_a_narration', 'X'))), `teach validator, ${label}: same verdict as for a graded record (${n.length ? n.join('; ') : 'accepted'})`)
  }
}

// ---- 3. DUA_DIRECTIVES ----------------------------------------------------------
async function testDuaBlockLine() {
  console.log('\n=== 3. DUA_DIRECTIVES: the dua_block line ===')
  // WO#478 (P2): Gem 10's WO#454 hand-off line ("You MUST output the
  // 'dua_block' field exactly as provided. Do not reassemble the record from
  // individual keys.") is retired; the record is still quoted whole, and the
  // explanation follows it. The old "Prefer the 'dua_block'" line stays gone.
  const line = DUA_BLOCK_DIRECTIVE
  check(DUA_DIRECTIVES.includes(line) && line.startsWith("Quote each du'a from its 'dua_block' field exactly as provided; it is the complete record."), 'the WO#478 dua_block line (P2) is in DUA_DIRECTIVES, verbatim')
  const r = await byContext('mothers')
  check(rules(r).includes(line) && !rules(r).some((x) => x.startsWith("Prefer the 'dua_block'") || x.startsWith("You MUST output the 'dua_block'")), 'a get_dua response carries it, and both older dua_block lines are gone')
}

// ---- 4. crisis_resource directive ------------------------------------------------
async function testCrisis() {
  console.log('\n=== 4. crisis_resource directive ===')
  const soft = 'Output this crisis resource block exactly as written. Do not counsel beyond it.'
  check(SOFT_DISTRESS_RESOURCE_BLOCK.directive === soft, 'the soft block\'s directive is Gem 10\'s, verbatim')
  check(SOFT_DISTRESS_RESOURCE_BLOCK.text === 'If these feelings become overwhelming, please know support is available. Visit https://www.iasp.info/resources/Crisis_Centres/ for helplines in your region.', 'the soft resource text is unchanged')
  for (const loc of ['id', 'ur', 'ar'] as const) {
    const b = distressBlockFor('soft', loc) as { directive: string; text: string }
    check(b.directive === soft && b.text === SOFT_DISTRESS_RESOURCE_BLOCK.text, `soft block, ${loc}: same directive and text`)
  }
  const r = await byContext('feeling hopeless')
  check(r.crisis_resource?.level === 'soft' && r.crisis_resource.directive === soft, 'a soft route ("feeling hopeless") serves it')
  const hard = await byContext('I want to die')
  check(hard.crisis_resource?.directive === 'CRITICAL: You MUST output the following crisis resource text exactly as written below. Do not alter it or make it conditional. Do not assess whether the user needs it; output it.', 'control: the hard (self-harm) directive is unchanged')
  const abuse = await byContext('my husband hits me')
  check(abuse.crisis_resource?.directive?.startsWith("CRITICAL: The user's message indicates they may be experiencing abuse.") === true, 'control: the abuse directive is unchanged', abuse.crisis_resource)
  check(ABUSE_ORDER_DIRECTIVE === "Output the safety block and resources first. Only then, if du'as are included, present them after.", 'control: the abuse ordering directive is unchanged')
}

// ---- 5. anti-summarisation ---------------------------------------------------------
async function testAntiSummarisation() {
  console.log('\n=== 5. anti-summarisation ===')
  // WO#478 (P3): "summarise" dropped, after-not-instead added; the emission rule below is unchanged.
  check(ANTI_SUMMARISATION_DIRECTIVE === "CRITICAL: Present each du'a below as its own complete record, quoted exactly. Do not merge or condense several du'as into one. Explain, where a teach block is supplied, after each record and never instead of it.", 'the WO#478 wording (P3), verbatim')
  const r = await byContext('mothers')
  check((r.content.total_results ?? 0) > 1 && count(rules(r), ANTI_SUMMARISATION_DIRECTIVE) === 1, 'on a du\'a response with more than one record, once')
  check(!rules(byId('D00406')).includes(ANTI_SUMMARISATION_DIRECTIVE), 'control: absent on a one-record response')
  const ab = abuseResponse('x', undefined, ['D00406', 'D00255']) as unknown as Resp
  check((ab.content.duas?.length ?? 0) === 2 && rules(ab).includes(ANTI_SUMMARISATION_DIRECTIVE) && rules(ab).indexOf(ABUSE_ORDER_DIRECTIVE) < rules(ab).indexOf(ANTI_SUMMARISATION_DIRECTIVE), 'abuse allowlist path with two records: present, after the ordering directive')
}

// ---- 6. the Quran citation line -------------------------------------------------------
async function testQuranLine() {
  console.log('\n=== 6. the Quran citation line ===')
  check(QURAN_CITATION_DIRECTIVE === "For any Quranic text, you must include the explicit surah:ayah citation and prefix the English text with 'Translation of the Meaning'.", 'Gem 10\'s line, verbatim')
  for (const id of ['D00128', 'D00504']) {
    const r = byId(id)
    check(count(rules(r), QURAN_CITATION_DIRECTIVE) === 1 && r._sakina_meta.presentation_contract.quran !== undefined, `${id} (origin quran): present once, with the Quran contract`)
  }
  const mixed = byId('D00195')
  check(mixed.content.duas?.[0]?.origin === undefined && (mixed.content.duas?.[0]?.quran_spans?.length ?? 0) > 0 && rules(mixed).includes(QURAN_CITATION_DIRECTIVE), 'D00195 (mixed, quran_spans): present')
  check(!rules(byId('D00406')).includes(QURAN_CITATION_DIRECTIVE) && byId('D00406')._sakina_meta.presentation_contract.quran === undefined, 'control: D00406 (no Qur\'an): absent')
  // every category: the line is present exactly when the Quran contract is
  const cats = [...new Set(BUNDLE.map((b) => b.category))]
  const mismatches: string[] = []
  for (const c of cats) {
    const r = await byContext(c)
    if (!r.content.duas) continue
    const contract = quranContractFor(r.content.duas as never) !== undefined
    if (contract !== rules(r).includes(QURAN_CITATION_DIRECTIVE)) mismatches.push(c)
  }
  check(mismatches.length === 0, `every category (${cats.length}): the line appears exactly when quranContractFor returns a contract`, mismatches)
}

// ---- Gem 10 D, condition 3: the largest payload over both transports ---------------
function send(cmd: string, args: string[], stdin: string, ms = 10000): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    // decode as a stream: a multi-byte Arabic character can straddle two chunks
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (c: string) => (out += c))
    const t = setTimeout(() => p.kill('SIGTERM'), ms)
    p.on('exit', () => {
      clearTimeout(t)
      resolve(out)
    })
    p.stdin.write(stdin)
  })
}
async function testTransports() {
  console.log('\n=== Gem 10 D3: the largest get_dua payload over stdio and streamable HTTP ===')
  const dist = path.resolve(HERE, '..', 'dist', 'server.js')
  if (!existsSync(dist)) return check(false, 'dist/server.js exists (run npm run build first)')
  const cats = [...new Set(BUNDLE.map((b) => b.category))]
  let largest = { c: '', n: 0 }
  for (const c of cats) {
    const n = Buffer.byteLength(JSON.stringify(await getDuaHandler({ context: c })))
    if (n > largest.n) largest = { c, n }
  }
  const expected = JSON.stringify(await getDuaHandler({ context: largest.c }))
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'wo454', version: '1' } } }
  const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_dua', arguments: { context: largest.c } } }
  type Reply = { id?: number; result?: { content?: { type: string; text: string }[] } }
  const textOf = (m?: Reply) => m?.result?.content?.find((x) => x.type === 'text')?.text
  // stdio
  const out = await send(process.execPath, [dist, '--stdio'], [init, { jsonrpc: '2.0', method: 'notifications/initialized' }, call].map((m) => JSON.stringify(m)).join('\n') + '\n')
  let stdio: Reply | undefined
  try {
    stdio = out.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Reply).find((m) => m.id === 2)
  } catch {
    stdio = undefined
  }
  const st = textOf(stdio)
  check(st !== undefined && JSON.stringify(JSON.parse(st)) === expected, `stdio: get_dua("${largest.c}", ${largest.n.toLocaleString('en-GB')} bytes, the largest category) arrives whole and parses`)
  // streamable HTTP (stateless, JSON responses)
  const port = 3471
  const srv = spawn(process.execPath, [dist], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  try {
    let up = false
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250))
      up = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false)
    }
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(call),
    }).catch(() => undefined)
    const body = res ? await res.text() : ''
    let reply: Reply | undefined
    try {
      reply = JSON.parse(body) as Reply
    } catch {
      reply = undefined
    }
    const ht = textOf(reply)
    check(res?.ok === true && ht !== undefined && JSON.stringify(JSON.parse(ht)) === expected, `streamable HTTP: the same payload arrives whole and parses (HTTP ${res?.status}, ${Buffer.byteLength(body).toLocaleString('en-GB')} bytes on the wire)`, body.slice(0, 200))
  } finally {
    srv.kill('SIGTERM')
  }
}

async function main() {
  testDirective()
  await testStatus()
  await testDuaBlockLine()
  await testCrisis()
  await testAntiSummarisation()
  await testQuranLine()
  await testTransports()
  console.log(`\nWO#454: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main()
