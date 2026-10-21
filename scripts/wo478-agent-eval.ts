/**
 * WO#478 agent-behaviour eval (Architect, 20 Oct 2026): ten scripted queries
 * through the BUILT server (dist/server.js, in-memory MCP transport, the same
 * initialize + tools/call path a client takes). Writes each full response to
 * docs/wo478-eval/<n>-<name>.json and a summary table to
 * docs/wo478-eval/README.md: teach attached, support or crisis block, bytes.
 *
 * Upstream (alquran.cloud) is called live, or replayed from the recorded
 * fixtures (evals/fixtures) with `--fixture`, as run-evals.ts does. A verse
 * with no fixture under `--fixture`, or an unreachable upstream without it,
 * shows the server's upstream-failure shape and the table says so.
 *
 * Run: npm run build && npx tsx scripts/wo478-agent-eval.ts [--fixture]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '..', '..', 'docs', 'wo478-eval')
const FIXTURE = process.argv.includes('--fixture')

/** The same replay as scripts/run-evals.ts: recorded bodies, bytes unmodified. */
function installFixture() {
  const file = (s: string, a: string) =>
    a === '1' ? `../evals/fixtures/alquran-ayah1/${s}.json` : `../evals/fixtures/alquran-verses/${s}_${a}.json`
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    try {
      const body = readFileSync(new URL(file(m[1]!, m[2]!), import.meta.url))
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
      return new Response('{"code":404}', { status: 404 })
    }
  }) as typeof fetch
}

type Q = { name: string; tool: string; args: Record<string, unknown> }
const QUERIES: Q[] = [
  { name: 'quran-39-53', tool: 'get_quran_verse', args: { surah: 39, ayah: 53 } },
  { name: 'quran-2-255', tool: 'get_quran_verse', args: { surah: 2, ayah: 255 } },
  { name: 'dua-job-interview', tool: 'get_dua', args: { context: 'job interview' } },
  { name: 'dua-my-father-died', tool: 'get_dua', args: { context: 'my father died' } },
  { name: 'dua-end-my-life', tool: 'get_dua', args: { context: 'I want to end my life' } },
  { name: 'find-loss-of-faith', tool: 'find_verses', args: { query: 'loss of faith' } },
  { name: 'find-fear-of-allah', tool: 'find_verses', args: { query: 'fear of Allah' } },
  { name: 'name-1', tool: 'get_name_of_allah', args: { number: 1 } },
  { name: 'name-the-forgiving', tool: 'get_name_of_allah', args: { name: 'The Forgiving' } },
  { name: 'dua-D00060', tool: 'get_dua', args: { id: 'D00060' } },
]

const teachCount = (v: unknown): number => {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + teachCount(x), 0)
  if (!v || typeof v !== 'object') return 0
  const r = v as Record<string, unknown>
  return (r.teach && typeof r.teach === 'object' ? 1 : 0) + Object.values(r).reduce((n: number, x) => n + teachCount(x), 0)
}

async function main() {
  if (FIXTURE) installFixture()
  const { createMcpServer } = (await import(path.resolve(HERE, '..', 'dist', 'server.js'))) as { createMcpServer: () => { connect(t: unknown): Promise<void> } }
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer().connect(a)
  const client = new Client({ name: 'wo478-eval', version: '1' })
  await client.connect(b)
  const instructions = client.getInstructions() ?? ''
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, '00-instructions.txt'), instructions + '\n')
  const rows: string[] = []
  let n = 0
  for (const q of QUERIES) {
    n++
    const res = (await client.callTool({ name: q.tool, arguments: q.args })) as { content: Array<{ type: string; text: string }>; isError?: boolean }
    const text = res.content.find((c) => c.type === 'text')?.text ?? ''
    const file = `${String(n).padStart(2, '0')}-${q.name}.json`
    writeFileSync(path.join(OUT, file), text + '\n')
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = {}
    }
    const meta = (parsed._sakina_meta ?? {}) as { content_type?: string; llm_directives?: { CRITICAL_RULES?: string[] } }
    const cr = parsed.crisis_resource as { level?: string; crisis_type?: string } | undefined
    const content = (parsed.content ?? {}) as Record<string, unknown>
    const teach = teachCount(content)
    const block = cr ? `${cr.level}${cr.crisis_type ? ` (${cr.crisis_type})` : ''}` : 'none'
    const bytes = Buffer.byteLength(text, 'utf8')
    const duas = Array.isArray(content.duas) ? content.duas.length : undefined
    const extra = [
      duas !== undefined ? `${duas} du'a(s)${content.total_available !== undefined ? ` of ${String(content.total_available)}` : ''}` : '',
      content.upstream_error || content.note ? 'upstream note' : '',
      meta.llm_directives?.CRITICAL_RULES?.some((d) => /more du'as? for this context/.test(d)) ? '"more" note' : '',
    ]
      .filter(Boolean)
      .join('; ')
    rows.push(`| ${n} | \`${q.tool}\` ${JSON.stringify(q.args)} | ${meta.content_type ?? (res.isError ? 'error' : '?')} | ${teach ? `yes (${teach})` : 'no'} | ${block} | ${bytes.toLocaleString('en-GB')} | ${extra} | \`${file}\` |`)
  }
  await client.close()
  const md = [
    '# WO#478 agent-behaviour eval: ten scripted queries through the built server',
    '',
    `Built server: \`mcp-server/dist/server.js\` (2.2.0), in-memory MCP transport, initialize + tools/call; upstream ${FIXTURE ? 'replayed from evals/fixtures (a verse with no recorded fixture reads as upstream unavailable)' : 'called live'}. The initialize result carried \`instructions\` of ${instructions.length} characters (\`00-instructions.txt\`). Each response is written whole beside this file. "teach" is the number of records carrying a teach block; "block" is the crisis_resource level; bytes are the UTF-8 size of the serialised response.`,
    '',
    '| # | call | content_type | teach | block | bytes | notes | file |',
    '| :-- | :-- | :-- | :-- | :-- | --: | :-- | :-- |',
    ...rows,
    '',
  ].join('\n')
  writeFileSync(path.join(OUT, 'README.md'), md)
  console.log(md)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
