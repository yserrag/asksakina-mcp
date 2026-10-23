/**
 * WO#456 (Architect, 12 Oct): daily per-tool totals on the Fly volume.
 *
 *   1. counters survive a stop and restart: in process (a new store reads the
 *      flushed file) and end to end (the built server, stopped with SIGINT and
 *      with SIGTERM, then restarted and read through /stats);
 *   2. nothing outside the listed fields is ever written to the usage
 *      directory: the file names, the exact keys, integer values, and none of
 *      the request's IP, user agent, client name or parameters;
 *   3. day rollover at UTC midnight;
 *   4. the 90-day prune;
 *   5. off by default: no MCP_USAGE_DIR, no file written, /stats `daily: null`.
 *
 * Every new behaviour has a control.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DailyUsageStore, oldestKeptDay, RETENTION_DAYS, sanitiseDay, utcDay } from '../src/logging/daily-store.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_SERVER = path.resolve(HERE, '..', 'dist', 'server.js')

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
const tmp = () => mkdtempSync(path.join(tmpdir(), 'wo456-'))

const TOOLS = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses']
// WO#488 Part B: teach_served per tool; the audience tally and prompts at the top level.
const COUNTER_KEYS = ['duration_ms_sum', 'error', 'not_found', 'ok', 'teach_served']
const AUDIENCE_KEYS = ['absent', 'curious', 'practising', 'revert', 'unknown']
const PROMPT_KEYS = ['explore_names_of_allah', 'understand_a_verse']
const SENTINELS = ['WO456SENTINEL', '203.0.113.77', 'wo456-agent', 'wo456-client', 'wo456-audience']

/** Every file in `dir` is YYYY-MM-DD.json holding exactly the allowed shape. */
function auditDir(dir: string): string[] {
  const problems: string[] = []
  if (!existsSync(dir)) return problems
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)
    if (!m) {
      problems.push(`unexpected file ${name}`)
      continue
    }
    const raw = readFileSync(path.join(dir, name), 'utf8')
    for (const s of SENTINELS) if (raw.includes(s)) problems.push(`${name} contains ${s}`)
    let j: Record<string, unknown>
    try {
      j = JSON.parse(raw)
    } catch {
      problems.push(`${name} is not JSON`)
      continue
    }
    if (JSON.stringify(Object.keys(j).sort()) !== JSON.stringify(['audience', 'by_tool', 'date', 'prompts'])) problems.push(`${name} top-level keys ${Object.keys(j)}`)
    for (const [k, keys] of [['audience', AUDIENCE_KEYS], ['prompts', PROMPT_KEYS]] as const) {
      const o = j[k] as Record<string, unknown>
      if (JSON.stringify(Object.keys(o ?? {}).sort()) !== JSON.stringify(keys)) problems.push(`${name} ${k} keys ${Object.keys(o ?? {})}`)
      for (const v of Object.values(o ?? {})) if (!Number.isInteger(v) || (v as number) < 0) problems.push(`${name} ${k} value ${v}`)
    }
    if (j.date !== m[1]) problems.push(`${name} date ${j.date}`)
    const bt = j.by_tool as Record<string, Record<string, unknown>>
    if (JSON.stringify(Object.keys(bt ?? {}).sort()) !== JSON.stringify([...TOOLS].sort())) problems.push(`${name} tools ${Object.keys(bt ?? {})}`)
    for (const [t, c] of Object.entries(bt ?? {})) {
      if (JSON.stringify(Object.keys(c).sort()) !== JSON.stringify(COUNTER_KEYS)) problems.push(`${name} ${t} keys ${Object.keys(c)}`)
      for (const v of Object.values(c)) if (!Number.isInteger(v) || (v as number) < 0) problems.push(`${name} ${t} value ${v}`)
    }
  }
  return problems
}

// ---- 1a. stop and restart, in process ----------------------------------------
function testRestartInProcess() {
  console.log('\n=== 1a. counters survive a stop and restart (in process) ===')
  const dir = tmp()
  try {
    const clock = () => new Date('2026-10-12T10:00:00Z')
    const a = new DailyUsageStore(dir, clock)
    a.record('get_dua', 'ok', 12.4)
    a.record('get_dua', 'ok', 7.6)
    a.record('get_dua', 'not_found', 3)
    a.record('find_verses', 'error', 5)
    check(!existsSync(path.join(dir, '2026-10-12.json')), 'control: nothing on disk before the first write')
    a.flush() // the timer's write, or the one on SIGINT / SIGTERM
    const b = new DailyUsageStore(dir, clock) // a new process
    const d = b.days()[0]
    check(d?.date === '2026-10-12' && d.by_tool.get_dua.ok === 2 && d.by_tool.get_dua.not_found === 1 && d.by_tool.get_dua.duration_ms_sum === 23 && d.by_tool.find_verses.error === 1, 'a new store reads the flushed totals back', d)
    b.record('get_dua', 'ok', 1)
    b.flush()
    const c = new DailyUsageStore(dir, clock).days()[0]
    check(c.by_tool.get_dua.ok === 3 && c.by_tool.get_dua.duration_ms_sum === 24, 'a second process adds to the same day, never overwrites it', c.by_tool.get_dua)
    const lost = new DailyUsageStore(dir, clock)
    lost.record('get_dua', 'ok', 1) // never flushed: the process dies without a signal
    check(new DailyUsageStore(dir, clock).days()[0].by_tool.get_dua.ok === 3, 'control: unflushed increments are not on disk (a crash loses only those)')
    check(auditDir(dir).length === 0, 'the directory holds only allowed files and fields', auditDir(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 2. nothing outside the listed fields -------------------------------------
function testAllowedFieldsOnly() {
  console.log('\n=== 2. nothing outside the listed fields is written ===')
  const dir = tmp()
  try {
    const clock = () => new Date('2026-10-12T10:00:00Z')
    // A day file that someone (or an older build) left with extra fields
    writeFileSync(path.join(dir, '2026-10-12.json'), JSON.stringify({ date: '2026-10-12', ip: '203.0.113.77', by_tool: { get_dua: { ok: 1, not_found: 0, error: 0, duration_ms_sum: 1, user_agent: 'wo456-agent' }, other_tool: { ok: 9 } } }))
    check(auditDir(dir).length > 0, 'control: the audit catches a file with extra fields', auditDir(dir))
    const s = new DailyUsageStore(dir, clock)
    s.record('get_dua', 'ok', 1)
    // @ts-expect-error a tool name outside the four is ignored
    s.record('wo456-client', 'ok', 1)
    s.flush()
    const problems = auditDir(dir)
    check(problems.length === 0, 'rewriting the day drops every field outside the allowed set', problems)
    const j = JSON.parse(readFileSync(path.join(dir, '2026-10-12.json'), 'utf8'))
    check(j.by_tool.get_dua.ok === 2, 'the allowed counts in that file are kept and added to', j.by_tool.get_dua)
    check(JSON.stringify(sanitiseDay('2026-10-12', { by_tool: { get_dua: { ok: -3, error: 1.9, not_found: 'x' } } }).by_tool.get_dua) === JSON.stringify({ ok: 0, not_found: 0, error: 1, duration_ms_sum: 0, teach_served: 0 }), 'values are stored as non-negative integers only')
    check(!readdirSync(dir).some((n) => n.endsWith('.tmp')), 'no temporary file is left behind')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 3. day rollover --------------------------------------------------------
function testRollover() {
  console.log('\n=== 3. day rollover at UTC midnight ===')
  const dir = tmp()
  try {
    let t = new Date('2026-10-12T23:59:59.900Z')
    const s = new DailyUsageStore(dir, () => t)
    s.record('get_dua', 'ok', 1)
    t = new Date('2026-10-13T00:00:00.100Z')
    s.record('get_dua', 'ok', 1)
    s.record('get_dua', 'error', 1)
    s.flush()
    const days = new DailyUsageStore(dir, () => t).days()
    check(JSON.stringify(days.map((d) => d.date)) === JSON.stringify(['2026-10-13', '2026-10-12']), 'two day files, newest first', days.map((d) => d.date))
    check(days[1].by_tool.get_dua.ok === 1 && days[1].by_tool.get_dua.error === 0 && days[0].by_tool.get_dua.ok === 1 && days[0].by_tool.get_dua.error === 1, 'each call counts on the UTC day it ended on')
    check(utcDay(new Date('2026-10-13T01:30:00+02:00')) === '2026-10-12', 'control: the day is UTC, not local time')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 4. the 90-day prune ----------------------------------------------------
function testPrune() {
  console.log('\n=== 4. at most 90 days are kept ===')
  const dir = tmp()
  try {
    const today = '2026-10-12'
    const t = () => new Date(`${today}T09:00:00Z`)
    const oldest = oldestKeptDay(today)
    check(RETENTION_DAYS === 90 && oldest === '2026-07-15', `the window is today and the 89 days before it (oldest kept: ${oldest})`)
    const day = (back: number) => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - back)
      return utcDay(d)
    }
    for (let back = 1; back <= 120; back++) writeFileSync(path.join(dir, `${day(back)}.json`), JSON.stringify(sanitiseDay(day(back), {})))
    writeFileSync(path.join(dir, 'README.txt'), 'not a day file')
    const s = new DailyUsageStore(dir, t)
    check(s.days().length === 89, 'reading never returns a day outside the window, before any write', s.days().length)
    check(s.storedDays().length === 120, 'control: reading deletes nothing')
    s.record('get_dua', 'ok', 1)
    s.flush()
    const left = s.storedDays()
    check(left.length === 90 && left[0] === today && left[left.length - 1] === oldest, `a write leaves exactly 90 days, ${oldest} to ${today}`, { n: left.length, first: left[0], last: left[left.length - 1] })
    check(existsSync(path.join(dir, `${day(89)}.json`)) && !existsSync(path.join(dir, `${day(90)}.json`)), 'boundary: 89 days back is kept, 90 days back is deleted')
    check(existsSync(path.join(dir, 'README.txt')), 'control: a file that is not a day file is not touched')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 1b + 5. the built server, end to end -------------------------------------
type Proc = { p: ChildProcess; out: () => string }
function start(port: number, env: Record<string, string | undefined>): Proc {
  let out = ''
  const p = spawn(process.execPath, [DIST_SERVER], { env: { ...process.env, PORT: String(port), MCP_USAGE_DIR: undefined, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout!.setEncoding('utf8')
  p.stderr!.setEncoding('utf8')
  p.stdout!.on('data', (c: string) => (out += c))
  p.stderr!.on('data', (c: string) => (out += c))
  return { p, out: () => out }
}
async function up(port: number) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200))
    if (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false)) return true
  }
  return false
}
async function callTool(port: number, name: string, args: Record<string, unknown>) {
  const r = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'fly-client-ip': '203.0.113.77',
      'user-agent': 'wo456-agent',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: { client: 'wo456-client' } } }),
  })
  return r.status
}
const stop = (pr: Proc, signal: NodeJS.Signals) =>
  new Promise<number | null>((resolve) => {
    pr.p.once('exit', (code) => resolve(code))
    pr.p.kill(signal)
  })
async function stats(port: number) {
  const r = await fetch(`http://127.0.0.1:${port}/stats`, { headers: { authorization: 'Bearer wo456-token' } })
  return (await r.json()) as { privacy: string; audience: Record<string, number>; prompts: Record<string, number>; by_tool: Record<string, { teach_served: number }>; daily: null | { retention_days: number; days: { date: string; total: number; by_tool: Record<string, { ok: number; not_found: number; total: number; teach_served: number }>; audience: Record<string, number> }[] } }
}

async function testServer() {
  console.log('\n=== 1b + 5. the built server: SIGINT / SIGTERM, restart, /stats; off by default ===')
  if (!existsSync(DIST_SERVER)) return check(false, 'dist/server.js exists (run npm run build first)')
  const dir = tmp()
  const usage = path.join(dir, 'usage')
  const env = { MCP_USAGE_DIR: usage, MCP_STATS_TOKEN: 'wo456-token' }
  const today = utcDay(new Date())
  try {
    let s = start(3481, env)
    check(await up(3481), 'server starts with MCP_USAGE_DIR set')
    const st = [await callTool(3481, 'get_dua', { context: 'WO456SENTINEL anxiety' }), await callTool(3481, 'get_dua', { context: 'anxiety' }), await callTool(3481, 'get_name_of_allah', { number: 1, audience: 'revert' })]
    check(st.every((x) => x === 200), 'three tool calls answered', st)
    // WO#488: an audience value outside the enum is refused by the schema before the handler,
    // so it is never counted, and never reaches disk (the sentinel audit below).
    await callTool(3481, 'get_name_of_allah', { number: 1, audience: 'wo456-audience' })
    const live = await stats(3481)
    check(live.daily?.days[0]?.date === today && live.daily.days[0].total === 3 && live.daily.retention_days === 90, "/stats shows today's unwritten counts before any write", live.daily)
    check(live.audience.revert === 1 && live.audience.absent === 2 && Object.values(live.audience).reduce((a, b) => a + b, 0) === 3 && live.daily?.days[0]?.audience.revert === 1, 'WO#488: /stats tallies audience (revert 1, absent 2) since start and today; the refused value counts nowhere', live.audience)
    check(live.by_tool.get_name_of_allah.teach_served === 1 && live.by_tool.get_dua.teach_served === 0 && live.daily?.days[0]?.by_tool.get_name_of_allah.teach_served === 1, 'WO#488: teach_served counts the Name 1 response (teach) and not the soft-block du\'a calls', live.by_tool)
    check(JSON.stringify(Object.keys(live.prompts).sort()) === JSON.stringify(PROMPT_KEYS) && Object.values(live.prompts).every((n) => n === 0), 'WO#488: /stats carries the prompt counters (none fetched yet)', live.prompts)
    check(!existsSync(path.join(usage, `${today}.json`)), 'control: no file yet (the timer is 5 minutes)')
    check(await stop(s, 'SIGINT') === 0 && existsSync(path.join(usage, `${today}.json`)), 'SIGINT (how Fly stops an idle machine) writes the day file and exits 0', s.out().slice(-300))

    s = start(3482, env)
    check(await up(3482), 'server restarts')
    await callTool(3482, 'get_dua', { context: 'gratitude' })
    const after = await stats(3482)
    const d = after.daily?.days[0]
    check(d?.date === today && d.total === 4 && d.by_tool.get_dua.total === 3 && d.by_tool.get_name_of_allah.total === 1, '/stats after restart: the stored 3 plus the new 1', d)
    check(after.privacy.includes('at most 90 days') && after.privacy.includes('no IPs'), '/stats privacy line names the daily totals and the 90 days', after.privacy)
    check(await stop(s, 'SIGTERM') === 0, 'SIGTERM also writes and exits 0', s.out().slice(-300))
    const j = JSON.parse(readFileSync(path.join(usage, `${today}.json`), 'utf8'))
    check(j.by_tool.get_dua.ok + j.by_tool.get_dua.not_found + j.by_tool.get_dua.error === 3, 'the day file holds all four calls after the SIGTERM write', j.by_tool)
    check(auditDir(usage).length === 0, "the usage directory holds only allowed files and fields, with no trace of the request's IP, user agent, client or parameters", auditDir(usage))

    // off by default
    const off = start(3483, { MCP_STATS_TOKEN: 'wo456-token' })
    check(await up(3483), 'server starts without MCP_USAGE_DIR')
    await callTool(3483, 'get_dua', { context: 'anxiety' })
    const o = await stats(3483)
    check(o.daily === null && o.privacy.endsWith('resets on restart'), 'without MCP_USAGE_DIR: /stats daily is null and the privacy line is unchanged', o)
    await stop(off, 'SIGINT')
    check(!off.out().includes('[usage]'), 'without MCP_USAGE_DIR the daily store never starts (no [usage] log line)', off.out().slice(-300))
    check(s.out().includes('[usage] daily per-tool totals kept in'), 'control: with it, the store announces itself')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 6. the mirror's publish.yml: dispatch allowed, tag-only release -----------
function testPublishWorkflow() {
  console.log("\n=== 6. mirror publish.yml: workflow_dispatch, and a run on a branch fails ===")
  const PKG = path.resolve(HERE, '..')
  const yml = readFileSync(path.join(PKG, 'mirror', '.github', 'workflows', 'publish.yml'), 'utf8')
  check(/^on:\n  push:\n    tags:\n      - 'v\*'\n  workflow_dispatch:\n/m.test(yml), 'triggers: the v* tag push and workflow_dispatch')
  // the Release checks step, exactly as the workflow runs it
  const lines = yml.split('\n')
  const at = lines.findIndex((l) => l.trim() === '- name: Release checks')
  const runAt = at + 1
  check(at > 0 && lines[runAt].trim() === 'run: |', 'found the Release checks step')
  const body: string[] = []
  for (const l of lines.slice(runAt + 1)) {
    if (l.trim() !== '' && !l.startsWith('          ')) break
    body.push(l.slice(10))
  }
  const script = body.join('\n')
  const dir = tmp()
  const mirror = path.join(dir, 'mirror')
  try {
    const built = spawnSync(process.execPath, [path.join(PKG, 'scripts', 'build-mirror.mjs'), mirror], { cwd: PKG, encoding: 'utf8' })
    if (built.status !== 0) return check(false, 'the mirror assembles', built.stderr.slice(-300))
    const version = JSON.parse(readFileSync(path.join(mirror, 'package.json'), 'utf8')).version as string
    const run = (type: string, name: string) => spawnSync('bash', ['-c', script], { cwd: mirror, encoding: 'utf8', env: { ...process.env, GITHUB_REF_TYPE: type, GITHUB_REF_NAME: name } })
    const onTag = run('tag', `v${version}`)
    check(onTag.status === 0 && onTag.stdout.includes('integrity matches'), `dispatched on the tag v${version}: the release checks pass`, onTag.stderr.slice(-300))
    const onMain = run('branch', 'main')
    check(onMain.status !== 0 && onMain.stdout.includes('run this on a v* tag, not the branch main'), 'dispatched from main: the release checks fail before anything is published', onMain.stdout.slice(-200))
    const wrongTag = run('tag', 'v2.1.0')
    check(wrongTag.status !== 0 && wrongTag.stderr.includes(`tag v2.1.0 but package.json says ${version}`), 'control: a tag that is not the package version fails too', wrongTag.stderr.slice(-200))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 7. WO#488 Part B counters, in process ------------------------------------
async function testWo488Counters() {
  console.log('\n=== 7. WO#488: teach_served, the audience tally and prompt fetches ===')
  const dir = tmp()
  try {
    const clock = () => new Date('2026-10-22T10:00:00Z')
    // A day file written by 2.3.x: no teach_served, audience or prompts.
    writeFileSync(path.join(dir, '2026-10-22.json'), JSON.stringify({ date: '2026-10-22', by_tool: { get_dua: { ok: 2, not_found: 0, error: 0, duration_ms_sum: 4 } } }))
    const s = new DailyUsageStore(dir, clock)
    const old = s.days()[0]!
    check(old.by_tool.get_dua.teach_served === 0 && Object.values(old.audience).every((n) => n === 0) && Object.values(old.prompts).every((n) => n === 0) && old.by_tool.get_dua.ok === 2, 'a 2.3.x day file reads with zero teach, audience and prompts, and its counts kept')
    s.record('get_name_of_allah', 'ok', 1, true, 'revert')
    s.record('get_dua', 'ok', 1, false, 'curious')
    s.record('get_dua', 'ok', 1)
    // @ts-expect-error a value outside the five buckets is counted as absent, never stored
    s.record('get_dua', 'ok', 1, false, 'wo456-audience')
    s.recordPrompt('understand_a_verse')
    s.recordPrompt('explore_names_of_allah')
    s.recordPrompt('explore_names_of_allah')
    // @ts-expect-error a prompt name outside the registered ones is ignored
    s.recordPrompt('wo456-client')
    s.flush()
    const j = JSON.parse(readFileSync(path.join(dir, '2026-10-22.json'), 'utf8'))
    check(j.by_tool.get_name_of_allah.teach_served === 1 && j.by_tool.get_dua.teach_served === 0 && j.by_tool.get_dua.ok === 5, 'teach_served per tool, beside the outcome counts', j.by_tool)
    check(JSON.stringify(j.audience) === JSON.stringify({ curious: 1, revert: 1, practising: 0, unknown: 0, absent: 2 }), 'the audience tally: five fixed keys; a missing or unknown value counts as absent', j.audience)
    check(JSON.stringify(j.prompts) === JSON.stringify({ understand_a_verse: 1, explore_names_of_allah: 2 }), 'prompt fetches by name; an unregistered name is ignored', j.prompts)
    check(auditDir(dir).length === 0, 'the file holds only allowed keys and no sentinel', auditDir(dir))
    // The in-memory tier, through the logger.
    const { logRequest, logPromptFetch, getAggregateSnapshot, resetLoggerForTests } = await import('../src/logging/request-logger.js')
    resetLoggerForTests()
    logRequest({ tool: 'get_quran_verse', status: 'ok', duration_ms: 1, teach_served: true, audience: 'practising' })
    logRequest({ tool: 'get_quran_verse', status: 'ok', duration_ms: 1, audience: 'wo456-audience' })
    logRequest({ tool: 'find_verses', status: 'not_found', duration_ms: 1, audience: 'unknown' })
    logPromptFetch('understand_a_verse')
    const snap = getAggregateSnapshot()
    check(snap.perTool.get_quran_verse.teach_served === 1 && snap.perTool.find_verses.teach_served === 0, 'in memory: teach_served per tool')
    check(JSON.stringify(snap.audience) === JSON.stringify({ curious: 0, revert: 0, practising: 1, unknown: 1, absent: 1 }) && !JSON.stringify(snap).includes('wo456-audience'), 'in memory: the audience tally; a non-enum value is absent and appears nowhere', snap.audience)
    check(snap.prompts.understand_a_verse === 1 && snap.prompts.explore_names_of_allah === 0, 'in memory: prompt fetches by name')
    resetLoggerForTests()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  testRestartInProcess()
  testAllowedFieldsOnly()
  testRollover()
  testPrune()
  await testWo488Counters()
  await testServer()
  testPublishWorkflow()
  console.log(`\nWO#456: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main()
