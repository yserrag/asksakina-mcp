/**
 * WO#503 item 6 (measurement only, no port): what the MCP serves for the residual
 * parent-harm messages (docs/wo503-data/residual.json, written by the app's
 * scripts/wo503-gem3-pack.ts --residual-only first), and which of them get a verse
 * from its `parents` theme (17:24, 31:14, 46:15). Writes docs/wo503-data/mcp-residual.json,
 * which the pack reads.
 *
 *   npx tsx scripts/wo503-mcp-measure.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DATA = process.argv.includes('--b') ? 'docs/wo503b-data' : 'docs/wo503-data' // WO#503-B item 6
type Resp = { _sakina_meta: { content_type: string }; content: { verses?: unknown[]; duas?: unknown[]; matched_themes?: Array<{ theme: string }> }; crisis_resource?: { level?: string } }
const refsIn = (r: Resp): string[] => {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') { for (const m of v.matchAll(/\b(\d{1,3}):(\d{1,3})\b/g)) out.push(`${m[1]}:${m[2]}`) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(r.content.verses ?? [])
  return [...new Set(out)]
}

async function main() {
  const residual = (JSON.parse(readFileSync(path.join(ROOT, `${DATA}/residual.json`), 'utf-8')) as { rows: { text: string; frame: string }[] }).rows
  const plain = residual.filter((r) => r.frame === 'plain').map((r) => r.text)
  const parents = THEMES_2_5_0.find((t) => t.theme === 'parents')!
  const rows: { text: string; find: string; themes: string[]; refs: string[]; dua: string; duaBlock: string }[] = []
  for (const text of plain) {
    const f = (await findVersesHandler({ query: text, limit: 10 } as never)) as unknown as Resp
    const d = (await getDuaHandler({ context: text } as never)) as unknown as Resp
    rows.push({ text, find: f._sakina_meta.content_type, themes: (f.content.matched_themes ?? []).map((t) => t.theme), refs: refsIn(f), dua: d._sakina_meta.content_type, duaBlock: d.crisis_resource?.level ?? 'none' })
  }
  const out = {
    _doc: 'WO#503 item 6: the MCP (find_verses, get_dua) on the residual parent-harm messages (plain frame), measured in process. No port; no release.',
    parentsTheme: { words: parents.words, phrases: parents.phrases, refs: parents.refs },
    rows,
  }
  writeFileSync(path.join(ROOT, `${DATA}/mcp-residual.json`), JSON.stringify(out, null, 1) + '\n')
  const served = (ref: string) => rows.filter((r) => r.refs.includes(ref)).length
  console.log(`mcp: ${rows.length} residual messages; crisis block ${rows.filter((r) => r.find === 'crisis_resource_only').length}; parents theme ${rows.filter((r) => r.themes.includes('parents')).length}; 17:24 served ${served('17:24')}, 31:14 ${served('31:14')}, 46:15 ${served('46:15')}, 17:23 ${served('17:23')}, 31:15 ${served('31:15')}, 66:6 ${served('66:6')}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
