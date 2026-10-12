/**
 * Byte-identity harness (WO#390 Phase 0 measurement, committed in WO#405).
 *
 * Serialises 178 in-process calls: every agent eval case (49), every du'a
 * category, and all 99 Names, with alquran.cloud replayed from the recorded
 * fixtures (evals/fixtures). Prints the byte count and sha256. Run it on two
 * checkouts and compare: with `audience` omitted the output must be identical
 * to main.
 *
 * Run: npm run bundle-data && npx tsx scripts/byte-identity.ts [--audience curious|revert|practising] [--out file]
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (n: string) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const AUDIENCE = opt('--audience')
const OUT = opt('--out')

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

type Call = { tool: string; args: Record<string, unknown> }

async function main() {
  const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const table: Record<string, (a: unknown) => Promise<unknown>> = {
    get_quran_verse: getQuranVerseHandler as never,
    get_dua: getDuaHandler as never,
    get_name_of_allah: getNameOfAllahHandler as never,
    find_verses: findVersesHandler as never,
  }
  const cases = (JSON.parse(readFileSync(new URL('../evals/agent-queries.json', import.meta.url), 'utf-8')) as { cases: Call[] }).cases
  const categories = JSON.parse(readFileSync(new URL('../data/dua-categories.json', import.meta.url), 'utf-8')) as Array<{ slug: string }>
  const calls: Call[] = [
    ...cases.map((c) => ({ tool: c.tool, args: c.args })),
    ...categories.map((c) => ({ tool: 'get_dua', args: { context: c.slug } })),
    ...Array.from({ length: 99 }, (_, i) => ({ tool: 'get_name_of_allah', args: { number: i + 1 } })),
  ]
  const parts: string[] = []
  for (const c of calls) {
    const args = AUDIENCE ? { ...c.args, audience: AUDIENCE } : c.args
    let out: unknown
    try {
      out = await table[c.tool]!(args)
    } catch (err) {
      out = { threw: String(err) }
    }
    parts.push(JSON.stringify({ tool: c.tool, args: c.args, out }, null, 2))
  }
  const text = parts.join('\n')
  if (OUT) writeFileSync(OUT, text)
  const sha = createHash('sha256').update(text).digest('hex')
  console.log(`calls ${calls.length}  bytes ${Buffer.byteLength(text)}  sha256 ${sha}${AUDIENCE ? `  audience ${AUDIENCE}` : ''}`)
}

main()
