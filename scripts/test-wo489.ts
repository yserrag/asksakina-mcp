/**
 * WO#489: MCP 2.4.0 part 2, learning journeys (22 Oct 2026;
 * docs/wo489-architect.md).
 *
 *   1. both prompts list and fetch over HTTP, on the built server;
 *   2. every new string is pinned, and each message is pinned whole;
 *   3. argument validation (refused before the callback, never echoed);
 *   4. the crisis path: a prompt adds nothing under a crisis or soft block;
 *   5. prompt arguments are never counted or logged; only the per-name
 *      fetch counter (WO#488 Part B) moves.
 *
 * Run: npm run build && npm run test:wo489
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DAWAH_ADAB_BLOCK } from '../src/contracts/instructions.js'
import { exploreNamesPrompt, PROMPT_STRINGS, understandAVersePrompt } from '../src/prompts/learning-journeys.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_SERVER = path.resolve(HERE, '..', 'dist', 'server.js')

let failures = 0
let checks = 0
const check = (ok: boolean, m: string, d?: unknown) => {
  checks++
  if (ok) console.log(`  PASS ${m}`)
  else {
    failures++
    console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d).slice(0, 600)}`}`)
  }
}

// ── 2. The new strings, pinned (for Gem 1 and Gem 10) ──────────────────────
const PINNED = {
  understandTitle: 'Understand a verse',
  understandDescription: 'Fetch one Quran verse by surah and ayah, then present it with its teaching notes, if any.',
  exploreTitle: 'Explore the Names of Allah',
  exploreDescription: 'Fetch one of the 99 Names of Allah by number (1 if none is given), then present it with its teaching notes, if any, and offer the next Name.',
  numberArg: 'Name number, 1-99; defaults to 1',
  callVerse: 'Call the get_quran_verse tool with surah {surah} and ayah {ayah}.',
  callName: 'Call the get_name_of_allah tool with number {number}.',
  follow:
    "Then present the response by the rules it carries in _sakina_meta.llm_directives.CRITICAL_RULES and _sakina_meta.presentation_contract, including the teaching order when it carries a teach block, and by this server's da'wah adab:",
  nextName: 'Offer one next step only: Name {next} (call get_name_of_allah with number {next} if the user says yes).',
  block: 'If a response carries a crisis_resource block, follow its directive and add nothing: no reflection question and no next step.',
}
const FOLLOW = PINNED.follow
const BLOCK = PINNED.block
const MSG = {
  verse255: ['Call the get_quran_verse tool with surah 2 and ayah 255.', FOLLOW, DAWAH_ADAB_BLOCK, BLOCK].join('\n'),
  name1: ['Call the get_name_of_allah tool with number 1.', FOLLOW, DAWAH_ADAB_BLOCK, 'Offer one next step only: Name 2 (call get_name_of_allah with number 2 if the user says yes).', BLOCK].join('\n'),
  name98: ['Call the get_name_of_allah tool with number 98.', FOLLOW, DAWAH_ADAB_BLOCK, 'Offer one next step only: Name 99 (call get_name_of_allah with number 99 if the user says yes).', BLOCK].join('\n'),
  name99: ['Call the get_name_of_allah tool with number 99.', FOLLOW, DAWAH_ADAB_BLOCK, BLOCK].join('\n'),
}

// ── The built server over HTTP ─────────────────────────────────────────────
type Proc = { p: ChildProcess; out: () => string }
function start(port: number, env: Record<string, string>): Proc {
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
const stop = (pr: Proc) =>
  new Promise<number | null>((resolve) => {
    pr.p.once('exit', (code) => resolve(code))
    pr.p.kill('SIGINT')
  })
type Rpc = { result?: Record<string, unknown>; error?: { code: number; message: string } }
let id = 0
async function rpc(port: number, method: string, params?: Record<string, unknown>): Promise<Rpc> {
  const r = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) }),
  })
  const text = await r.text()
  const json = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? '{}')
  return JSON.parse(json) as Rpc
}
type PromptGet = { description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }
const textOf = (r: Rpc) => (r.result as unknown as PromptGet | undefined)?.messages?.[0]?.content?.text
async function stats(port: number) {
  const r = await fetch(`http://127.0.0.1:${port}/stats`, { headers: { authorization: 'Bearer wo489-token' } })
  return (await r.json()) as { prompts: Record<string, number>; audience: Record<string, number>; total_requests: number; daily: null | { days: Array<{ prompts: Record<string, number>; audience: Record<string, number> }> } }
}

async function main() {
  console.log('=== 2. the new strings, pinned ===')
  check(JSON.stringify(PROMPT_STRINGS) === JSON.stringify(PINNED), 'PROMPT_STRINGS is exactly the pinned set (every new string; Gem 1 APPROVED, 22 Oct 2026)', PROMPT_STRINGS)
  check(Object.values(PINNED).every((s) => !/[—ﷺ]/u.test(s) && !/\p{Extended_Pictographic}/u.test(s)), 'no em dash, no U+FDFA, no emoji in any new string')
  check(understandAVersePrompt({ surah: '2', ayah: '255' }).messages[0]!.content.text === MSG.verse255, 'understand_a_verse 2:255: the whole message, pinned')
  check(exploreNamesPrompt({}).messages[0]!.content.text === MSG.name1 && exploreNamesPrompt({ number: '98' }).messages[0]!.content.text === MSG.name98 && exploreNamesPrompt({ number: '99' }).messages[0]!.content.text === MSG.name99, 'explore_names_of_allah: no argument starts at 1 and offers 2; 98 offers 99; 99 offers no next number')
  check(MSG.verse255.includes(DAWAH_ADAB_BLOCK) && MSG.name1.includes(DAWAH_ADAB_BLOCK), 'the da\'wah adab is the server\'s own block, verbatim (referenced, not restated)')
  check(!/reflection question[^:]*verbatim|Quote the record first|not tafsir/i.test(MSG.verse255), 'the teaching order is not restated: the message points to the response\'s own CRITICAL_RULES and presentation_contract')

  if (!existsSync(DIST_SERVER)) {
    check(false, 'dist/server.js exists (run npm run build first)')
    return finish()
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'wo489-'))
  const usage = path.join(dir, 'usage')
  const s = start(3489, { MCP_USAGE_DIR: usage, MCP_STATS_TOKEN: 'wo489-token' })
  try {
    check(await up(3489), 'the built server starts')

    console.log('\n=== 1. list and fetch over HTTP ===')
    const list = await rpc(3489, 'prompts/list')
    const prompts = (list.result?.prompts ?? []) as Array<{ name: string; title: string; description: string; arguments: Array<{ name: string; description?: string; required?: boolean }> }>
    check(JSON.stringify(prompts.map((p) => p.name)) === '["understand_a_verse","explore_names_of_allah"]', 'prompts/list: exactly the two prompts (what_muslims_believe and first_steps_new_muslim stay parked)', prompts.map((p) => p.name))
    const u = prompts[0]
    const e = prompts[1]
    check(u?.title === PINNED.understandTitle && u.description === PINNED.understandDescription && JSON.stringify(u.arguments) === JSON.stringify([{ name: 'surah', description: 'Surah number, 1-114', required: true }, { name: 'ayah', description: 'Ayah (verse) number within the surah', required: true }]), 'understand_a_verse: title, description, and two required arguments (surah, ayah) described as the tool describes them')
    check(e?.title === PINNED.exploreTitle && e.description === PINNED.exploreDescription && JSON.stringify(e.arguments) === JSON.stringify([{ name: 'number', description: PINNED.numberArg, required: false }]), 'explore_names_of_allah: title, description, one optional argument (number)')
    const v = await rpc(3489, 'prompts/get', { name: 'understand_a_verse', arguments: { surah: '2', ayah: '255' } })
    check(textOf(v) === MSG.verse255 && (v.result as unknown as PromptGet).messages.length === 1 && (v.result as unknown as PromptGet).messages[0]!.role === 'user', 'prompts/get understand_a_verse 2:255: one user message, the pinned text', v)
    const none = await rpc(3489, 'prompts/get', { name: 'explore_names_of_allah' })
    const empty = await rpc(3489, 'prompts/get', { name: 'explore_names_of_allah', arguments: {} })
    check(textOf(none) === MSG.name1 && textOf(empty) === MSG.name1, 'prompts/get explore_names_of_allah with no arguments object, and with {}: starts at Name 1 and offers Name 2', none)
    const n99 = await rpc(3489, 'prompts/get', { name: 'explore_names_of_allah', arguments: { number: '99' } })
    check(textOf(n99) === MSG.name99, 'prompts/get explore_names_of_allah 99: no next number')

    console.log('\n=== 3. argument validation ===')
    const SENTINEL = 'WO489SENTINEL'
    const bad: Array<[string, Record<string, string> | undefined]> = [
      ['understand_a_verse', { surah: '0', ayah: '1' }],
      ['understand_a_verse', { surah: '115', ayah: '1' }],
      ['understand_a_verse', { surah: '2', ayah: '287' }],
      ['understand_a_verse', { surah: '2', ayah: '0' }],
      ['understand_a_verse', { surah: 'two', ayah: '1' }],
      ['understand_a_verse', { surah: '2.5', ayah: '1' }],
      ['understand_a_verse', { surah: ' 2', ayah: '1' }],
      ['understand_a_verse', { surah: '-1', ayah: '1' }],
      ['understand_a_verse', { surah: '1000', ayah: '1' }],
      ['understand_a_verse', { surah: '2' }],
      ['understand_a_verse', undefined],
      ['understand_a_verse', { surah: SENTINEL, ayah: SENTINEL }],
      ['explore_names_of_allah', { number: '0' }],
      ['explore_names_of_allah', { number: '100' }],
      ['explore_names_of_allah', { number: 'one' }],
      ['explore_names_of_allah', { number: '' }],
      ['explore_names_of_allah', { number: SENTINEL }],
    ]
    for (const [name, args] of bad) {
      const r = await rpc(3489, 'prompts/get', { name, ...(args ? { arguments: args } : {}) })
      check(r.error?.code === -32602 && !r.result && !(r.error.message ?? '').includes(SENTINEL), `${name} ${JSON.stringify(args ?? null)}: refused (-32602), the value not echoed`, r.error ?? r.result)
    }
    const ok = await rpc(3489, 'prompts/get', { name: 'understand_a_verse', arguments: { surah: '114', ayah: '6' } })
    check(textOf(ok)?.startsWith('Call the get_quran_verse tool with surah 114 and ayah 6.') === true, 'control: 114:6 is accepted')
    const unknown = await rpc(3489, 'prompts/get', { name: 'what_muslims_believe' })
    check(unknown.error?.code === -32602, 'what_muslims_believe is not registered (parked)')

    console.log('\n=== 4. the crisis path ===')
    check(MSG.verse255.endsWith(BLOCK) && MSG.name1.endsWith(BLOCK) && MSG.name99.endsWith(BLOCK), 'every message ends with the rule: under a crisis_resource block (hard or soft), add nothing, no reflection question and no next step')
    const crisisArg = await rpc(3489, 'prompts/get', { name: 'explore_names_of_allah', arguments: { number: 'I want to kill myself' } })
    check(crisisArg.error?.code === -32602 && !crisisArg.error.message.includes('kill'), 'a crisis phrase as a prompt argument is refused before the callback and not echoed (the prompt arguments are numbers only)')
    // If the agent's call does carry a block, the tool's own response holds nothing to add.
    const hard = await rpc(3489, 'tools/call', { name: 'get_name_of_allah', arguments: { name: 'I want to kill myself' } })
    const hardText = (hard.result?.content as Array<{ text: string }> | undefined)?.[0]?.text ?? ''
    const hardJson = JSON.parse(hardText || '{}') as { _sakina_meta?: { content_type?: string }; crisis_resource?: unknown }
    check(hardJson._sakina_meta?.content_type === 'crisis_resource_only' && !!hardJson.crisis_resource && !/"teach"|reflection_question|"related"/.test(hardText), 'a crisis call: crisis_resource_only, with no teach, reflection question or related step to add')
    const soft = await rpc(3489, 'tools/call', { name: 'get_dua', arguments: { context: 'anxiety' } })
    const softText = (soft.result?.content as Array<{ text: string }> | undefined)?.[0]?.text ?? ''
    check(/"level": "soft"/.test(softText) && !/"teach"/.test(softText), 'a soft call: the soft block, and no teach')

    console.log('\n=== 5. arguments are never counted or logged ===')
    const st = await stats(3489)
    // Answered fetches: understand 2:255, 114:6 (2); explore none, {}, 99 (3). Refused ones are not counted.
    check(JSON.stringify(st.prompts) === JSON.stringify({ understand_a_verse: 2, explore_names_of_allah: 3 }), '/stats prompts: one per answered fetch, by name; refused fetches are not counted', st.prompts)
    check(st.daily?.days[0] ? JSON.stringify(st.daily.days[0].prompts) === JSON.stringify(st.prompts) : false, 'the daily tier counts the same')
    check(st.audience.curious + st.audience.revert + st.audience.practising + st.audience.unknown === 0 && st.audience.absent === 2, 'the audience tally moved only for the two tool calls (absent), never for a prompt', st.audience)
    check(await stop(s) === 0, 'the server stops (SIGINT writes the day file)')
    const files = existsSync(usage) ? readdirSync(usage) : []
    const raw = files.map((f) => readFileSync(path.join(usage, f), 'utf8')).join('\n')
    check(files.length === 1 && !raw.includes(SENTINEL) && !raw.includes('surah') && !raw.includes('"number"') && !raw.includes('255'), 'the day file holds no prompt argument (no sentinel, no argument name, no value)', raw.slice(0, 300))
    const out = s.out()
    check(!out.includes(SENTINEL) && !out.includes('kill myself') && !/surah|ayah/.test(out), 'the server log holds no prompt argument', out.slice(-400))
  } finally {
    if (s.p.exitCode === null) s.p.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }
  return finish()
}

function finish() {
  console.log(`\nWO#489: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
