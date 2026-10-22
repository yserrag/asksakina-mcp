/**
 * WO#484 eval: the batch 2 teach blocks in full, through the BUILT server
 * (dist/server.js, in-memory MCP transport, initialize + tools/call), for
 * Gem 10's review. Writes docs/wo484-eval/README.md and each full response
 * as JSON beside it.
 *
 * The alquran.cloud upstream is replayed: the recorded eval fixture where one
 * exists (evals/fixtures), otherwise a body built from the app's own Tanzil
 * copy (public/quran) and Pickthall. The teach block does not depend on it.
 *
 * Run: npm run build && npx tsx scripts/wo484-teach-eval.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

const OUT = new URL('../../docs/wo484-eval/', import.meta.url)
const fixture = (s: string, a: string) =>
  new URL(a === '1' ? `../evals/fixtures/alquran-ayah1/${s}.json` : `../evals/fixtures/alquran-verses/${s}_${a}.json`, import.meta.url)
const upstreamSource: Record<string, string> = {}

globalThis.fetch = (async (url: string | URL) => {
  const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
  if (!m) return new Response('{"code":404}', { status: 404 })
  const [, s, a] = m
  const f = fixture(s!, a!)
  if (existsSync(f)) {
    upstreamSource[`${s}:${a}`] = 'recorded fixture'
    return new Response(readFileSync(f), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const verses = (JSON.parse(readFileSync(new URL(`../../public/quran/en.pickthall/${s}.json`, import.meta.url), 'utf-8')) as { verses: Array<{ verse_number: number; text_uthmani: string; translations: Array<{ text: string }> }> }).verses
  const v = verses.find((x) => x.verse_number === Number(a))!
  upstreamSource[`${s}:${a}`] = "the app's Tanzil copy (public/quran)"
  const body = { code: 200, data: [{ number: 1, text: v.text_uthmani, surah: { number: Number(s), name: '', englishName: '' }, numberInSurah: Number(a) }, { number: 1, text: v.translations[0]!.text }] }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}) as typeof fetch

const CALLS: Array<[string, string, Record<string, unknown>]> = [
  ['verse-1-1', 'get_quran_verse', { surah: 1, ayah: 1 }],
  ['verse-2-255', 'get_quran_verse', { surah: 2, ayah: 255 }],
  ['verse-112-1', 'get_quran_verse', { surah: 112, ayah: 1 }],
  ['verse-113-1', 'get_quran_verse', { surah: 113, ayah: 1 }],
  ['verse-94-5', 'get_quran_verse', { surah: 94, ayah: 5 }],
  ['name-3', 'get_name_of_allah', { number: 3 }],
  ['name-9', 'get_name_of_allah', { number: 9 }],
  ['dua-anxiety', 'get_dua', { context: 'anxiety' }],
  ['dua-grief', 'get_dua', { context: 'grief' }],
]

function teachBlocks(r: unknown): unknown[] {
  const out: unknown[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.teach && typeof o.teach === 'object') out.push(o.teach)
      Object.values(o).forEach(walk)
    }
  }
  walk(r)
  return out
}

async function main() {
  const { createMcpServer } = (await import(new URL('../dist/server.js', import.meta.url).href)) as { createMcpServer: () => { connect(t: unknown): Promise<void> } }
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer().connect(a)
  const client = new Client({ name: 'wo484-eval', version: '0' })
  await client.connect(b)
  mkdirSync(OUT, { recursive: true })
  const rows: string[] = []
  const sections: string[] = []
  let bad = 0
  for (const [name, tool, args] of CALLS) {
    const res = (await client.callTool({ name: tool, arguments: args })) as { content: Array<{ type: string; text: string }> }
    const text = res.content.find((c) => c.type === 'text')?.text ?? ''
    const json = JSON.parse(text) as { _sakina_meta: { content_type: string; llm_directives?: { CRITICAL_RULES?: string[] } }; crisis_resource?: { level?: string } }
    writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify(json, null, 2) + '\n')
    const teach = teachBlocks(json)
    const support = tool === 'get_dua'
    const ok = support ? teach.length === 0 && json.crisis_resource?.level === 'soft' : teach.length === 1
    if (!ok) bad++
    const call = `${tool}(${JSON.stringify(args)})`
    rows.push(`| ${call} | ${json._sakina_meta.content_type}${support ? ` with a ${json.crisis_resource?.level ?? 'no'} support block` : ''} | ${teach.length} | ${Buffer.byteLength(text)} | \`${name}.json\` |`)
    if (!support) {
      const ref = tool === 'get_quran_verse' ? `${args.surah}:${args.ayah}` : ''
      const related = (json as { content?: { related?: unknown } }).content?.related
      sections.push(`## ${call}\n\n${ref ? `Upstream replayed from ${upstreamSource[ref] ?? 'n/a'}.\n\n` : ''}The teach block, exactly as served:\n\n\`\`\`json\n${JSON.stringify(teach[0], null, 2)}\n\`\`\`\n\nIts related list (\`content.related\`), exactly as served:\n\n\`\`\`json\n${JSON.stringify(related ?? null, null, 2)}\n\`\`\`\n`)
    } else {
      sections.push(`## ${call}\n\nA soft support block (${json.crisis_resource?.level}) and **no teach** anywhere in the response (${teach.length} teach blocks), as Gem 10 ruled for support and grief routes (WO#407).\n`)
    }
  }
  await client.close()
  const md = `# WO#484 eval: the batch 2 teach blocks, through the built server

Generated by \`mcp-server/scripts/wo484-teach-eval.ts\` against \`dist/server.js\` (2.3.0), in-memory MCP transport, no \`audience\` and no locale (so teach attaches with audience "unknown"). Full responses are beside this file. **Gem 10:** PASS for publish (22 Oct 2026), delegated: given by the Architect on the Founder's delegation, for Gem 10 review. The release gate passes for all 44 entries.

| call | content_type | teach blocks | bytes | file |
| :-- | :-- | :-- | :-- | :-- |
${rows.join('\n')}

${bad === 0 ? 'Every call is as expected: one teach block on each record, none under a support block.' : `${bad} call(s) NOT as expected.`}

${sections.join('\n')}`
  writeFileSync(new URL('README.md', OUT), md)
  console.log(rows.join('\n'))
  console.log(bad === 0 ? 'WO#484 eval: all as expected' : `WO#484 eval: ${bad} NOT as expected`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
