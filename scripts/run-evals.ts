/**
 * Agent-query evaluation (WO#385 item 6).
 *
 *   npm run eval                          in-process handlers, real upstream
 *   npm run eval -- --fixture             in-process, alquran.cloud replayed from the
 *                                         recorded bodies in evals/fixtures/alquran-*
 *   npm run eval -- --live <mcp-url>      over MCP (Streamable HTTP) against a server
 *   add --warn                            always exit 0 (deploy summary mode)
 *   add --json <file>                     also write per-case results
 *
 * Reads evals/agent-queries.json. Prints one line per case and a pass count;
 * appends the count to $GITHUB_STEP_SUMMARY when set. Without --warn, any
 * failing case exits 1.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

interface FieldCheck {
  path: string
  equals?: string
  matches?: string
  not_matches?: string
  absent?: boolean
}
interface Expect {
  content_type?: string
  context?: string
  crisis_level?: 'hard' | 'soft' | 'none'
  must_contain?: string[]
  must_not_contain?: string[]
  field_checks?: FieldCheck[]
}
interface Case {
  id: string
  description: string
  tool: 'get_quran_verse' | 'get_dua' | 'get_name_of_allah'
  args: Record<string, unknown>
  expect: Expect
}

const argv = process.argv.slice(2)
const opt = (n: string) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const LIVE = opt('--live')
const WARN = argv.includes('--warn')
const FIXTURE = argv.includes('--fixture')
const JSON_OUT = opt('--json')

const cases = (JSON.parse(readFileSync(new URL('../evals/agent-queries.json', import.meta.url), 'utf-8')) as { cases: Case[] }).cases

function installFixture() {
  // Raw alquran.cloud bodies recorded by CI (runs 36184881437, 36185119553),
  // served byte for byte for the edition pair the server requests. A verse
  // that was not recorded, or any other edition, gets a 404.
  const file = (s: string, a: string) =>
    a === '1' ? `../evals/fixtures/alquran-ayah1/${s}.json` : `../evals/fixtures/alquran-verses/${s}_${a}.json`
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    try {
      const body = readFileSync(new URL(file(m[1], m[2]), import.meta.url))
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
      return new Response('{"code":404}', { status: 404 })
    }
  }) as typeof fetch
}

type Caller = (tool: Case['tool'], args: Record<string, unknown>) => Promise<unknown>

async function inProcess(): Promise<Caller> {
  if (FIXTURE) installFixture()
  const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  const table = {
    get_quran_verse: getQuranVerseHandler,
    get_dua: getDuaHandler,
    get_name_of_allah: getNameOfAllahHandler,
  } as unknown as Record<Case['tool'], (a: unknown) => Promise<unknown>>
  return (tool, args) => table[tool](args)
}

async function live(url: string): Promise<{ call: Caller; close: () => Promise<void> }> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const client = new Client({ name: 'sakina-evals', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)
  return {
    call: async (tool, args) => {
      const res = (await client.callTool({ name: tool, arguments: args })) as { content?: Array<{ text?: string }> }
      const text = res?.content?.[0]?.text ?? ''
      try {
        return JSON.parse(text)
      } catch {
        return { _raw: text }
      }
    },
    close: () => transport.close().catch(() => {}),
  }
}

function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

export function check(c: Case, res: unknown): string[] {
  const why: string[] = []
  const e = c.expect
  const json = JSON.stringify(res)
  const ct = at(res, '_sakina_meta.content_type')
  if (e.content_type && ct !== e.content_type) why.push(`content_type ${String(ct)} != ${e.content_type}`)
  if (e.context && at(res, 'content.context') !== e.context) why.push(`context ${String(at(res, 'content.context'))} != ${e.context}`)
  if (e.crisis_level) {
    const lvl = (at(res, 'crisis_resource.level') as string | undefined) ?? 'none'
    if (lvl !== e.crisis_level) why.push(`crisis ${lvl} != ${e.crisis_level}`)
  }
  for (const s of e.must_contain ?? []) if (!json.includes(s)) why.push(`missing "${s}"`)
  for (const s of e.must_not_contain ?? []) if (json.includes(s)) why.push(`contains "${s}"`)
  for (const f of e.field_checks ?? []) {
    const v = at(res, f.path)
    if (f.absent) {
      if (v !== undefined) why.push(`${f.path} present`)
      continue
    }
    if (typeof v !== 'string') {
      why.push(`${f.path} missing`)
      continue
    }
    if (f.equals !== undefined && v !== f.equals) why.push(`${f.path} "${v.slice(0, 40)}" != "${f.equals}"`)
    if (f.matches && !new RegExp(f.matches, 'u').test(v)) why.push(`${f.path} !~ /${f.matches}/`)
    if (f.not_matches && new RegExp(f.not_matches, 'u').test(v)) why.push(`${f.path} =~ /${f.not_matches}/`)
  }
  return why
}

async function main() {
  let call: Caller
  let close = async () => {}
  if (LIVE) ({ call, close } = await live(LIVE))
  else call = await inProcess()

  const rows: Array<{ id: string; pass: boolean; why: string[] }> = []
  for (const c of cases) {
    let why: string[]
    try {
      why = check(c, await call(c.tool, c.args))
    } catch (err) {
      why = [`threw: ${err instanceof Error ? err.message : String(err)}`]
    }
    rows.push({ id: c.id, pass: why.length === 0, why })
    console.log(`${why.length ? 'FAIL' : 'PASS'}  ${c.id}${why.length ? `  (${why.join('; ')})` : ''}`)
  }
  await close()

  const passed = rows.filter((r) => r.pass).length
  const mode = LIVE ? `live ${LIVE}` : FIXTURE ? 'in-process, fixture upstream' : 'in-process'
  const line = `Agent evals: ${passed}/${rows.length} passed (${mode})`
  console.log(`\n${line}`)
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) {
    const failed = rows.filter((r) => !r.pass).map((r) => r.id)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `- ${passed === rows.length ? '✅' : '⚠️'} ${line}${failed.length ? `; failing: ${failed.join(', ')}` : ''}\n`,
    )
  }
  if (passed !== rows.length) {
    if (WARN) console.log(`::warning title=Agent evals::${line}. Warn only, not a deploy blocker.`)
    else process.exit(1)
  }
}

main().catch((err) => {
  const line = `Agent evals: did not run (${err instanceof Error ? err.message : String(err)})`
  console.error(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ⚠️ ${line}\n`)
  if (WARN) console.log(`::warning title=Agent evals::${line}`)
  process.exit(WARN ? 0 : 1)
})
