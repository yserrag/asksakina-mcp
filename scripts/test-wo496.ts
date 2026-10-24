/**
 * WO#496: the quick-start examples start the stdio server, and every tool
 * returns structuredContent beside its unchanged text.
 *
 *  1. Every stdio config example on the /mcp page (src/app/[locale]/mcp/page.tsx)
 *     and in README.md is extracted (the bare npx line and each JSON config);
 *     its arguments after the package name must be exactly the entrypoint's
 *     real flags (src/server.ts: `--stdio` selects stdio, read from the
 *     source). Controls: an example without --stdio, and one with an unknown
 *     flag, fail the same check.
 *  2. The built package is run by `npx` with each example's exact args (an
 *     npm-style local install, offline, so npx cannot fetch the published
 *     version) and completes an MCP initialize over stdio with the SDK client.
 *     Control: the same args without --stdio get no initialize answer (the
 *     package starts the HTTP server instead).
 *  3. Structured output, in process through the SDK client (which validates
 *     structuredContent against each tool's published outputSchema), over every
 *     byte-identity call plus not_found and crisis cases: the text content is
 *     byte-identical to serialiseResponse of the handler's result, and
 *     structuredContent equals that text parsed. No published schema closes an
 *     object (additionalProperties: false). Control: an envelope missing
 *     _sakina_meta fails each tool's schema.
 *
 * Needs dist/ (npm run build) and data/ (npm run bundle-data).
 * Run: npx tsx scripts/test-wo496.ts
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const MAIN = path.resolve(PKG, '..')
const PKG_NAME = (JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf-8')) as { name: string }).name

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

// ---- 1. the examples ---------------------------------------------------------
type Example = { where: string; command: string; args: string[] }

/** `npx …` lines and JSON configs naming the package, from a list of code blocks. */
export function examplesIn(where: string, blocks: string[]): Example[] {
  const out: Example[] = []
  for (const b of blocks) {
    if (!b.includes(PKG_NAME)) continue
    const trimmed = b.trim()
    if (trimmed.startsWith('npx ')) {
      for (const line of trimmed.split('\n').filter((l) => l.startsWith('npx '))) {
        const [command, ...args] = line.trim().split(/\s+/)
        out.push({ where: `${where}: ${line.trim()}`, command: command!, args })
      }
      continue
    }
    const json = JSON.parse(trimmed.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as unknown
    const walk = (x: unknown, at: string) => {
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (typeof o.command === 'string' && Array.isArray(o.args) && o.args.includes(PKG_NAME)) out.push({ where: `${where}: ${at}`, command: o.command, args: o.args as string[] })
      for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`)
    }
    walk(json, '$')
  }
  return out
}

/** The flags the entrypoint reads, from its source: `process.argv.includes('<flag>')`. */
function entrypointFlags(): string[] {
  const src = readFileSync(path.join(PKG, 'src', 'server.ts'), 'utf-8')
  return [...src.matchAll(/process\.argv\.includes\('(--[a-z-]+)'\)/g)].map((m) => m[1]!)
}

/** null when the example starts the stdio server through npx, else why not. */
export function stdioProblem(e: Example, flags: string[]): string | null {
  if (e.command !== 'npx') return `command is ${e.command}, not npx`
  const i = e.args.indexOf(PKG_NAME)
  if (i < 0) return 'no package name'
  if (e.args.slice(0, i).some((a) => a !== '-y')) return `unexpected npx options ${JSON.stringify(e.args.slice(0, i))}`
  const after = e.args.slice(i + 1)
  const unknown = after.filter((a) => !flags.includes(a))
  if (unknown.length) return `unknown flags ${JSON.stringify(unknown)}`
  if (!after.includes('--stdio')) return 'no --stdio: the package would start the HTTP server'
  return null
}

const pageBlocks = () => {
  const src = readFileSync(path.join(MAIN, 'src', 'app', '[locale]', 'mcp', 'page.tsx'), 'utf-8')
  return [...src.matchAll(/<code>\{`([\s\S]*?)`\}<\/code>/g)].map((m) => m[1]!)
}
const readmeBlocks = () => {
  const src = readFileSync(path.join(PKG, 'README.md'), 'utf-8')
  return [...src.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]!)
}

function testExamples(): Example[] {
  console.log('\n=== 1. config examples match the entrypoint ===')
  const flags = entrypointFlags()
  check(JSON.stringify(flags) === '["--stdio"]', `the entrypoint reads one flag, --stdio (${JSON.stringify(flags)})`)
  const src = readFileSync(path.join(PKG, 'src', 'server.ts'), 'utf-8')
  check(/process\.argv\.includes\('--stdio'\)\s*\?\s*startStdioServer\(\)\s*:\s*startHttpServer\(\)/.test(src), '--stdio selects startStdioServer; without it, startHttpServer')
  const page = examplesIn('mcp/page.tsx', pageBlocks())
  const readme = examplesIn('README.md', readmeBlocks())
  check(page.length === 3, `the /mcp page has 3 stdio examples: npx line, Claude Desktop, Cursor (${page.length})`, page.map((e) => e.where))
  check(readme.length === 4, `the README has 4: npx line, Claude Desktop, Cursor, VS Code (${readme.length})`, readme.map((e) => e.where))
  for (const e of [...page, ...readme]) {
    const p = stdioProblem(e, flags)
    check(p === null, `${e.where}: ${JSON.stringify(e.args)}`, p)
  }
  // controls
  const base = page.find((e) => e.where.includes('mcpServers')) ?? page[0]!
  check(stdioProblem({ ...base, args: base.args.filter((a) => a !== '--stdio') }, flags) !== null, 'control: an example without --stdio fails')
  check(stdioProblem({ ...base, args: [...base.args, '--http'] }, flags) !== null, 'control: an example with an unknown flag fails')
  const planted = examplesIn('planted', ['{ "mcpServers": { "s": { "command": "npx", "args": ["-y", "' + PKG_NAME + '"] } } }'])
  check(planted.length === 1 && stdioProblem(planted[0]!, flags) !== null, 'control: the pre-WO#496 page config (no --stdio) is extracted and fails')
  return [...page, ...readme]
}

// ---- 2. run the examples' exact args -------------------------------------------
async function initializeWith(cwd: string, command: string, args: string[], ms: number): Promise<{ name?: string; version?: string; tools?: string[]; error?: string }> {
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: 'ignore',
    env: { ...(process.env as Record<string, string>), npm_config_offline: 'true', npm_config_yes: 'true', PORT: '0', MCP_USAGE_DIR: '' },
  })
  const client = new Client({ name: 'test-wo496', version: '1.0.0' })
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([client.connect(transport), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`no initialize answer in ${ms} ms`)), ms)))])
    const info = client.getServerVersion()
    const tools = (await client.listTools()).tools.map((t) => t.name).sort()
    return { name: info?.name, version: info?.version, tools }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  } finally {
    clearTimeout(timer)
    await transport.close().catch(() => {})
  }
}

async function testRun(examples: Example[]) {
  console.log('\n=== 2. the built package, run with each example\'s exact args, initializes over stdio ===')
  if (!existsSync(path.join(PKG, 'dist', 'server.js'))) {
    check(false, 'dist/server.js exists (run npm run build first)')
    return
  }
  // an npm-style local install: npx finds the package here and never fetches the published one
  const dir = mkdtempSync(path.join(tmpdir(), 'wo496-npx-'))
  try {
    writeFileSync(path.join(dir, 'package.json'), '{"name":"wo496-client","private":true}\n')
    mkdirSync(path.join(dir, 'node_modules', '@asksakina'), { recursive: true })
    mkdirSync(path.join(dir, 'node_modules', '.bin'))
    symlinkSync(PKG, path.join(dir, 'node_modules', ...PKG_NAME.split('/')))
    symlinkSync(path.join('..', ...PKG_NAME.split('/'), 'dist', 'server.js'), path.join(dir, 'node_modules', '.bin', 'sakina-mcp'))
    const version = (JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf-8')) as { version: string }).version
    const distinct = [...new Map(examples.map((e) => [JSON.stringify([e.command, ...e.args]), e])).values()]
    for (const e of distinct) {
      const r = await initializeWith(dir, e.command, e.args, 30_000)
      check(r.name === 'sakina-islamic-knowledge' && r.version === version && JSON.stringify(r.tools) === JSON.stringify(['find_verses', 'get_dua', 'get_name_of_allah', 'get_quran_verse']), `${e.command} ${e.args.join(' ')}: initialize over stdio answers ${r.name} ${r.version}, four tools (used by ${examples.filter((x) => JSON.stringify(x.args) === JSON.stringify(e.args)).length} examples)`, r)
    }
    const e = distinct[0]!
    const bare = await initializeWith(dir, e.command, e.args.filter((a) => a !== '--stdio'), 8_000)
    check(!!bare.error, `control: ${e.command} ${e.args.filter((a) => a !== '--stdio').join(' ')} gets no initialize answer over stdio (it serves HTTP)`, bare)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- 3. structured output -------------------------------------------------------
const file = (s: string, a: string) =>
  a === '1' ? `../evals/fixtures/alquran-ayah1/${s}.json` : `../evals/fixtures/alquran-verses/${s}_${a}.json`

async function testStructured() {
  console.log('\n=== 3. structuredContent beside the unchanged text ===')
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    try {
      return new Response(readFileSync(new URL(file(m[1]!, m[2]!), import.meta.url)), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
      return new Response('{"code":404}', { status: 404 })
    }
  }) as typeof fetch
  try {
    const { createMcpServer } = await import('../src/server.js')
    const { serialiseResponse } = await import('../src/meta/response-builder.js')
    const { OUTPUT_SCHEMAS } = await import('../src/contracts/output-schemas.js')
    const handlers: Record<string, (a: never) => Promise<never>> = {
      get_quran_verse: (await import('../src/tools/get-quran-verse.js')).getQuranVerseHandler as never,
      get_dua: (await import('../src/tools/get-dua.js')).getDuaHandler as never,
      get_name_of_allah: (await import('../src/tools/get-name-of-allah.js')).getNameOfAllahHandler as never,
      find_verses: (await import('../src/tools/find-verses.js')).findVersesHandler as never,
    }
    const server = createMcpServer()
    const [a, b] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-wo496', version: '1.0.0' })
    await Promise.all([server.connect(a), client.connect(b)])

    const tools = (await client.listTools()).tools
    check(tools.length === 4 && tools.every((t) => t.outputSchema?.type === 'object'), 'all four tools publish an outputSchema')
    const closed: string[] = []
    const walk = (x: unknown, at: string) => {
      if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${at}[${i}]`))
      else if (x && typeof x === 'object') {
        if ((x as Record<string, unknown>).additionalProperties === false) closed.push(at)
        for (const [k, v] of Object.entries(x)) walk(v, `${at}.${k}`)
      }
    }
    for (const t of tools) walk(t.outputSchema, t.name)
    check(closed.length === 0, 'no published schema closes an object (a new field cannot fail a validating client)', closed.slice(0, 5))

    const cases = (JSON.parse(readFileSync(new URL('../evals/agent-queries.json', import.meta.url), 'utf-8')) as { cases: { tool: string; args: Record<string, unknown> }[] }).cases
    const categories = JSON.parse(readFileSync(new URL('../data/dua-categories.json', import.meta.url), 'utf-8')) as Array<{ slug: string }>
    const calls = [
      ...cases.map((c) => ({ tool: c.tool, args: c.args })),
      ...categories.map((c) => ({ tool: 'get_dua', args: { context: c.slug } as Record<string, unknown> })),
      ...Array.from({ length: 99 }, (_, i) => ({ tool: 'get_name_of_allah', args: { number: i + 1 } as Record<string, unknown> })),
      // not_found and crisis responses
      { tool: 'get_quran_verse', args: { surah: 1, ayah: 8 } },
      { tool: 'get_dua', args: { context: 'zzzz' } },
      { tool: 'get_dua', args: { id: 'D99999' } },
      { tool: 'get_dua', args: { context: 'I want to kill myself' } },
      { tool: 'get_dua', args: { context: 'my husband hits me' } },
      { tool: 'get_dua', args: { context: 'I want to kill myself', locale: 'ar' } },
      { tool: 'find_verses', args: { query: 'zzzz' } },
      { tool: 'find_verses', args: { query: 'I want to die' } },
      { tool: 'get_name_of_allah', args: { name: 'zzzz' } },
      { tool: 'get_name_of_allah', args: { name: 'I want to kill myself' } },
      // a lookup by id (the bundled allowlist), and refusals
      { tool: 'get_dua', args: { id: 'D00068' } },
      { tool: 'get_dua', args: { id: 'D00060', locale: 'ur' } },
      { tool: 'get_dua', args: { id: 'D00003' } },
      { tool: 'get_dua', args: { id: 'kill-myself' } },
      { tool: 'get_dua', args: { context: 'anxiety', id: 'D00068' } },
      { tool: 'get_dua', args: { context: 'grief' } },
      { tool: 'get_dua', args: { context: 'anxiety', locale: 'id' } },
      { tool: 'get_quran_verse', args: { surah: 2, ayah: 255, locale: 'ur' } },
      { tool: 'get_name_of_allah', args: { number: 1, locale: 'id' } },
    ]
    const bad: string[] = []
    const types = new Set<string>()
    for (const audience of [undefined, 'revert']) {
      for (const c of calls) {
        const args = audience ? { ...c.args, audience } : c.args
        const label = `${c.tool} ${JSON.stringify(args)}`
        let res: { content?: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }
        try {
          res = (await client.callTool({ name: c.tool, arguments: args })) as typeof res
        } catch (err) {
          bad.push(`${label}: ${String(err)}`)
          continue
        }
        const text = res.content?.[0]?.text ?? ''
        const direct = serialiseResponse(await handlers[c.tool]!(args as never))
        if (res.isError || res.content?.length !== 1 || text !== direct) bad.push(`${label}: text differs from serialiseResponse`)
        else if (!isDeepStrictEqual(res.structuredContent, JSON.parse(text))) bad.push(`${label}: structuredContent differs from the text`)
        else types.add(`${c.tool}:${(res.structuredContent as { _sakina_meta: { content_type: string } })._sakina_meta.content_type}`)
      }
    }
    check(bad.length === 0, `${calls.length * 2} calls (byte-identity set plus 19 not_found, crisis, by-id and parked-locale cases, with and without audience): text byte-identical to serialiseResponse, structuredContent equal to it, accepted by the validating client`, bad.slice(0, 5))
    const want = ['find_verses:crisis_resource_only', 'find_verses:not_found', 'find_verses:verse_collection', 'get_dua:crisis_resource_only', 'get_dua:dua_collection', 'get_dua:not_found', 'get_name_of_allah:crisis_resource_only', 'get_name_of_allah:name_of_allah', 'get_name_of_allah:not_found', 'get_quran_verse:not_found', 'get_quran_verse:quran_verse']
    check(want.every((w) => types.has(w)), `every tool/content_type pair was exercised (${types.size})`, [...types].sort())
    // the abuse-safe dua_collection (context and duas only), live once ABUSE_SAFE_DUAS is non-empty
    const { abuseResponse } = await import('../src/tools/get-dua.js')
    const { distressBlockFor } = await import('../src/safety/crisis-keywords.js')
    const abuseSafe = JSON.parse(serialiseResponse(abuseResponse('my husband hits me', { crisis_resource: distressBlockFor({ level: 'hard', crisisType: 'abuse' } as never) }, ['D00066', 'D00067']))) as { _sakina_meta: { content_type: string } }
    check(abuseSafe._sakina_meta.content_type === 'dua_collection' && OUTPUT_SCHEMAS.get_dua.safeParse(abuseSafe).success, "the abuse-safe dua_collection (planted allowlist, as test-tools) fits get_dua's schema")
    for (const [name, schema] of Object.entries(OUTPUT_SCHEMAS)) {
      check(!schema.safeParse({ content: {} }).success && !schema.safeParse({ _sakina_meta: { content_type: 'other' }, content: {} }).success, `control: ${name}'s schema refuses an envelope without _sakina_meta, or with a foreign content_type`)
    }
    await client.close()
    await server.close()

    // control: the SDK does validate. A tool with the same outputSchema whose
    // structuredContent lacks _sakina_meta is refused, not passed through.
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const planted = new McpServer({ name: 'planted', version: '0' })
    planted.registerTool('get_dua', { outputSchema: OUTPUT_SCHEMAS.get_dua }, async () => ({ content: [{ type: 'text' as const, text: '{}' }], structuredContent: { content: {} } }))
    const [c1, c2] = InMemoryTransport.createLinkedPair()
    const pc = new Client({ name: 'test-wo496-control', version: '1.0.0' })
    await Promise.all([planted.connect(c1), pc.connect(c2)])
    let refused = false
    try {
      const r = (await pc.callTool({ name: 'get_dua', arguments: {} })) as { isError?: boolean }
      refused = r.isError === true
    } catch {
      refused = true
    }
    check(refused, 'control: a structuredContent that breaks the schema is refused by the SDK')
    await pc.close()
    await planted.close()
  } finally {
    globalThis.fetch = realFetch
  }
}

async function main() {
  const examples = testExamples()
  await testRun(examples)
  await testStructured()
  console.log(`\nWO#496: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main()
