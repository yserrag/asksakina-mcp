/**
 * WO#481 eval: the self-harm, abuse and soft blocks for ar, ur, id and tr,
 * in full, through the BUILT server (dist/server.js, in-memory MCP
 * transport, initialize + tools/call). Writes docs/wo481-eval/README.md
 * (each block's text as served, then the same text with the isolate marks
 * shown as [LRI], [RLI] and [PDI] for Gem 2) and each full response as JSON.
 *
 * Run: npm run build && npx tsx scripts/wo481-crisis-eval.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '..', '..', 'docs', 'wo481-eval')
const show = (t: string) => t.replace(/⁦/g, '[LRI]').replace(/⁧/g, '[RLI]').replace(/⁩/g, '[PDI]')

const QUERIES: Record<string, Record<string, string>> = {
  ar: { 'self-harm': 'I want to kill myself', abuse: 'my husband hits me', soft: 'anxiety' },
  ur: { 'self-harm': 'mujhe khudkushi karni hai', abuse: 'mera shohar mujhe marta hai', soft: 'anxiety' },
  id: { 'self-harm': 'ingin bunuh diri', abuse: 'my husband hits me', soft: 'anxiety' },
  tr: { 'self-harm': 'kendimi öldüreceğim', abuse: 'kocam beni dövüyor', soft: 'anxiety' },
}

async function main() {
  const { createMcpServer } = (await import(path.resolve(HERE, '..', 'dist', 'server.js'))) as { createMcpServer: () => { connect(t: unknown): Promise<void> } }
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer().connect(a)
  const client = new Client({ name: 'wo481-eval', version: '1' })
  await client.connect(b)
  mkdirSync(OUT, { recursive: true })
  const md: string[] = [
    '# WO#481 eval: the localised crisis blocks, in full, through the built server',
    '',
    'Built server `mcp-server/dist/server.js` (2.2.1), in-memory MCP transport, initialize + tools/call `get_dua`. For each locale and block: the call, the block\'s `level`, `crisis_type` and `locale`, the response size, the `text` exactly as served, and the same text with the isolate marks made visible. Full responses are beside this file.',
    '',
  ]
  const rows: string[] = []
  for (const [locale, qs] of Object.entries(QUERIES)) {
    md.push(`## ${locale}`, '')
    for (const [kind, context] of Object.entries(qs)) {
      const res = (await client.callTool({ name: 'get_dua', arguments: { context, locale } })) as { content: Array<{ type: string; text: string }> }
      const text = res.content.find((c) => c.type === 'text')?.text ?? ''
      const file = `${locale}-${kind}.json`
      writeFileSync(path.join(OUT, file), text + '\n')
      const parsed = JSON.parse(text) as { _sakina_meta: { content_type: string }; crisis_resource?: { level: string; crisis_type?: string; locale: string; text: string } }
      const cr = parsed.crisis_resource
      const bytes = Buffer.byteLength(text, 'utf8')
      rows.push(`| ${locale} | ${kind} | \`${context}\` | ${parsed._sakina_meta.content_type} | ${cr ? `${cr.level}${cr.crisis_type ? `/${cr.crisis_type}` : ''}, locale ${cr.locale}` : 'none'} | ${bytes.toLocaleString('en-GB')} | \`${file}\` |`)
      md.push(`### ${locale} ${kind}`, '', `\`get_dua\` \`${JSON.stringify({ context, locale })}\`: ${parsed._sakina_meta.content_type}; block ${cr ? `${cr.level}${cr.crisis_type ? `/${cr.crisis_type}` : ''}, locale ${cr.locale}` : 'none'}; ${bytes.toLocaleString('en-GB')} bytes; \`${file}\`.`, '', 'As served:', '', '```text', cr?.text ?? '(no block)', '```', '')
      if (locale === 'ar' || locale === 'ur') md.push('Isolate marks shown:', '', '```text', show(cr?.text ?? ''), '```', '')
    }
  }
  // Gem 10 conditions 3 and 4: the English-content disclosure, shown on tr.
  md.push('## English-content disclosure (Gem 10 conditions 3 and 4), tr', '')
  for (const [file, tool, args] of [
    ['tr-get-dua-soft-disclosure.json', 'get_dua', { context: 'anxiety', locale: 'tr' }],
    ['tr-get-name-of-allah-disclosure.json', 'get_name_of_allah', { number: 1, locale: 'tr' }],
  ] as const) {
    const res = (await client.callTool({ name: tool, arguments: args })) as { content: Array<{ type: string; text: string }> }
    const text = res.content.find((c) => c.type === 'text')?.text ?? ''
    writeFileSync(path.join(OUT, file), text + '\n')
    const p = JSON.parse(text) as { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; content: { translation_note?: string }; crisis_resource?: { level: string; locale: string } }
    const rules = p._sakina_meta.llm_directives.CRITICAL_RULES.filter((r) => /in English|English fallback/.test(r))
    md.push(`### ${tool} ${JSON.stringify(args)}`, '', `${p._sakina_meta.content_type}; ${p.crisis_resource ? `${p.crisis_resource.level} block, locale ${p.crisis_resource.locale}; ` : ''}${Buffer.byteLength(text, 'utf8').toLocaleString('en-GB')} bytes; full response \`${file}\`.`, '', '`content.translation_note`:', '', '```text', p.content.translation_note ?? '(none)', '```', '', 'The disclosure lines in `CRITICAL_RULES`:', '', '```text', ...rules, '```', '')
  }
  await client.close()
  md.splice(4, 0, '| locale | block | call context | content_type | block | bytes | file |', '| :-- | :-- | :-- | :-- | :-- | --: | :-- |', ...rows, '')
  writeFileSync(path.join(OUT, 'README.md'), md.join('\n'))
  console.log(rows.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
