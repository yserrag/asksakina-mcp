/**
 * WO#503-B item 5 (no release): the Gem 10 brief for the parent-harm port
 * (docs/wo503b-gem10.md), from the synced rules, the MCP tools called in process,
 * the byte-identity runs before and after the port, and a sweep of the MCP's own
 * strings (teach entries, the soft-support block in every locale) for the four term
 * kinds. Under 15 KB, with its own reply rules.
 *
 *   npx tsx scripts/byte-identity.ts --out <before.txt>   (on the head before the port)
 *   npx tsx scripts/byte-identity.ts --out <after.txt>    (on this head)
 *   npx tsx scripts/wo503b-gem10-brief.ts <before.txt> <after.txt>
 *
 * The per-call hashes of both runs are written to docs/wo503b-data/byte-identity.json
 * (the full outputs are about 1 MB each and are not kept).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { citesWithheldVerse, HARM_WORDS, mentionsParentHarm, PARENT_HARM_WITHHELD_VERSES } from '../src/safety/_synced/parent-harm-rules.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import { distressBlockFor } from '../src/safety/crisis-keywords.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const [beforeFile, afterFile] = process.argv.slice(2)
if (!beforeFile || !afterFile) throw new Error('usage: wo503b-gem10-brief.ts <before.txt> <after.txt>')
const q = (s: string) => `"${s}"`
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

// the four kinds of term, as in the app's WO#503 pack (scripts/wo503-gem3-pack.ts)
const TERMS: [string, RegExp][] = [
  ['sabr', /\bsabr\b/i],
  ['patience', /\bpatien(?:t|ce|tly)\b/i],
  ['obedience to parents', /\b(?:obey|obedien\w*|dutiful|honou?r(?:ing)?\s+(?:your|thy|his|their|the)?\s*parents|(?:kind|kindness|good|goodness)\s+(?:to|unto)\s+(?:your|thy|his|their)?\s*parents|say not .{0,10}fie)\b/i],
  ['family preservation', /\b(?:family ties|ties of kinship|kinship|keep(?:ing)?\s+(?:the\s+)?family|maintain(?:ing)?\s+(?:the\s+)?family|mend(?:ing)?|reconcil\w*|ward off from yourselves and your families|save yourselves and your families)\b/i],
]
const FORGIVE = /\bforgiv\w*\b/i
const termsIn = (s: string) => TERMS.filter(([, re]) => re.test(s)).map(([n]) => n)

/** The per-call hashes of a byte-identity output (calls are "{...}" blocks joined by newlines, each starting with `{\n  "tool"`). */
function perCall(file: string): { key: string; hash: string }[] {
  const text = readFileSync(file, 'utf-8')
  const blocks = text.split(/\n(?=\{\n  "tool": )/)
  return blocks.map((b) => {
    const m = /"tool": "([^"]+)",\n  "args": (\{[^\n]*\}|\{[\s\S]*?\n  \}),/.exec(b)
    const key = m ? `${m[1]} ${m[2].replace(/\s+/g, ' ')}` : b.slice(0, 60)
    return { key, hash: sha(b) }
  })
}

type Resp = { _sakina_meta: { content_type: string }; content: { verses?: Array<{ reference: string }>; duas?: unknown[]; matched_themes?: Array<{ theme: string }>; reason?: string }; crisis_resource?: { level?: string } }
const find = async (query: string) => (await findVersesHandler({ query, limit: 10 } as never)) as unknown as Resp

async function main() {
  mkdirSync(path.join(ROOT, 'docs/wo503b-data'), { recursive: true })
  // ---- byte identity --------------------------------------------------------------------------------------
  const before = perCall(beforeFile), after = perCall(afterFile)
  if (before.length !== after.length) throw new Error(`call counts differ: ${before.length} vs ${after.length}`)
  const changed = before.map((b, i) => ({ key: b.key, before: b.hash, after: after[i].hash })).filter((x) => x.before !== x.after)
  const totalBefore = sha(readFileSync(beforeFile, 'utf-8')), totalAfter = sha(readFileSync(afterFile, 'utf-8'))
  writeFileSync(path.join(ROOT, 'docs/wo503b-data/byte-identity.json'), JSON.stringify({
    _doc: 'WO#503-B: per-call sha256 of the byte-identity output (183 calls, audience omitted) on the head before the port (fde9f2b2) and on this head. `changed` lists the calls whose output moved.',
    before: { calls: before.length, sha256: totalBefore }, after: { calls: after.length, sha256: totalAfter },
    changed, perCall: before.map((b, i) => ({ key: b.key, before: b.hash, after: after[i].hash })),
  }, null, 1) + '\n')
  const changedParentHarm = changed.filter((c) => { const m = /\{.*?\}/.exec(c.key); try { const a = JSON.parse(m![0]) as Record<string, string>; return mentionsParentHarm(String(a.query ?? a.context ?? '')) } catch { return false } })

  // ---- what the port does, measured ------------------------------------------------------------------------
  const parents = THEMES_2_5_0.find((t) => t.theme === 'parents')!
  const probes = ['my mother screams at me', 'my father neglects me', 'my parents humiliate me every day', 'my mother screams at me and I feel so lonely', 'I miss my mother so much']
  const probeRows: string[] = []
  for (const p of probes) {
    const r = await find(p)
    const refs = (r.content.verses ?? []).map((v) => v.reference)
    probeRows.push(`| ${q(p)} | ${mentionsParentHarm(p) ? 'yes' : 'no'} | ${r._sakina_meta.content_type}${(r.content.matched_themes ?? []).length ? ` (${(r.content.matched_themes ?? []).map((t) => t.theme).join(', ')})` : ''} | ${refs.join(', ') || (r.content.reason ? q(r.content.reason) : 'none')} |`)
  }
  // the WO#503 measurement (head fde9f2b2, before the port) on its 606 residual messages, re-run here
  type Old = { text: string; find: string; themes: string[]; refs: string[] }
  const old = (JSON.parse(readFileSync(path.join(ROOT, 'docs/wo503-data/mcp-residual.json'), 'utf-8')) as { rows: Old[] }).rows
  const now: Record<string, number> = {}
  const oldServed = old.filter((r) => r.refs.some((x) => citesWithheldVerse(x)))
  let nowServedWithheld = 0
  for (const r of old) {
    const f = await find(r.text)
    const key = f._sakina_meta.content_type === 'crisis_resource_only' ? 'crisis block (a WO#503-B keyword now)' : f._sakina_meta.content_type === 'not_found' && /withheld on parent harm/.test(f.content.reason ?? '') ? 'not_found, withheld on parent harm' : f._sakina_meta.content_type === 'not_found' ? 'not_found (no theme)' : `${f._sakina_meta.content_type}, no withheld verse`
    now[key] = (now[key] ?? 0) + 1
    if ((f.content.verses ?? []).some((v) => citesWithheldVerse(v.reference))) nowServedWithheld++
  }
  const corpus = JSON.parse(readFileSync(path.join(HERE, '..', 'data', 'duas.json'), 'utf-8')) as { id: string; source?: string; quran_ref?: string; category: string }[]
  const citing = corpus.filter((d) => citesWithheldVerse(d.quran_ref) || citesWithheldVerse(d.source))

  // ---- the sweep of the MCP's own strings --------------------------------------------------------------------
  type Hit = { where: string; terms: string[]; forgive: boolean; text: string }
  const hits: Hit[] = []
  let swept = 0
  const sweep = (where: string, v: unknown) => {
    if (typeof v === 'string') {
      swept++
      const t = termsIn(v), f = FORGIVE.test(v)
      if (t.length || f) hits.push({ where, terms: t, forgive: f, text: v })
    } else if (Array.isArray(v)) v.forEach((x, i) => sweep(`${where}[${i}]`, x))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!/arabic/i.test(k)) sweep(`${where}.${k}`, x)
  }
  for (const [key, entry] of Object.entries(TEACH_ENTRIES as Record<string, unknown>)) sweep(`teach ${key}`, entry)
  // the soft-support block as served, per locale (the whole block: text, label, directive)
  for (const l of ['en', 'id', 'ur', 'ar', 'tr', 'pa', 'bn', 'fa']) { try { sweep(`soft-support ${l}`, distressBlockFor('soft', l as never)) } catch { /* a locale the block does not serve */ } }

  const withheldList = PARENT_HARM_WITHHELD_VERSES.map((w) => `${w.surah}:${w.ayah}`).join(', ')
  const doc = `# WO#503-B (the MCP parent-harm port; no release): Gem 10 brief

GENERATED by \`mcp-server/scripts/wo503b-gem10-brief.ts\` from the synced rules (\`src/lib/ai/parent-harm-rules.ts\`, copied into the MCP by \`bundle-data\` as the crisis detector is), the MCP tools called in process, two byte-identity runs, and a sweep of the MCP's own strings. Every figure is measured when the brief is built. Gem 3 ruled the withholds apply to the MCP (WO#503, 3b), and you accepted the interim pending it (W10-2); this is the port. **No release:** the version stays as it is until the batched release.

**What changes for an agent:** a query that names a parent with a harm (the app's check: a parent word and one of ${HARM_WORDS.size} harm words or 7 harm phrases in the same message) no longer gets ${withheldList} from find_verses, nor a du'a citing one of them from get_dua. A theme or category left with nothing returns \`not_found\` with the reason "withheld on parent harm" and no substitute. Nothing else moves: every other call's bytes are unchanged (W10-4).

## W10-1. The check and the list are the app's, synced

\`mcp-server/src/safety/_synced/parent-harm-rules.ts\` is the app file byte for byte under the synced header (test-wo503b). The withheld verses: ${withheldList} (Gem 3: WO#498 C16; WO#503 items 2 and 3; WO#503-B items 3 and 4). The check runs on the raw query or context, after the crisis gate, as the crisis check does; a crisis keyword still wins and returns the crisis block alone.

## W10-2. find_verses on parent harm

The \`parents\` theme (words: ${parents.words.join(', ')}; refs: ${parents.refs.join(', ')}) carries only withheld verses, so a parent-harm query that reaches it alone empties to \`not_found\`; with another theme the withheld verses are dropped and the rest served.

| query | parent harm | result | verses, or the reason |
|---|---|---|---|
${probeRows.join('\n')}

Across every 2.5.0 trigger paired with three parent-harm messages, no withheld verse is served (test-wo503b, ${3 * THEMES_2_5_0.flatMap((t) => [...t.words, ...t.phrases]).length} calls).

## W10-3. get_dua on parent harm

A du'a whose \`quran_ref\` or \`source\` cites a withheld verse is dropped on a parent-harm context. The corpus holds ${citing.length} such du'as: ${citing.map((d) => `${d.id} (${d.category}, ${d.quran_ref ?? d.source})`).join('; ') || 'none'}. A category left with none returns \`not_found\`, "withheld on parent harm", no substitute. The 384 WO#503-B harm pairs and the 8 WO#503 cruelty forms return the abuse block alone on both tools (test-wo503b).

## W10-4. Byte identity: what moved

${before.length} calls (every agent eval case, every du'a category, all 99 Names), audience omitted. Before the port (head \`fde9f2b2\`) sha256 \`${totalBefore.slice(0, 8)}...\`; after, \`${totalAfter.slice(0, 8)}...\`. **${changed.length} call${changed.length === 1 ? '' : 's'} changed**${changed.length ? `, ${changedParentHarm.length} of them parent-harm queries by the check` : ''}. The per-call hashes are \`docs/wo503b-data/byte-identity.json\`.

${changed.length ? changed.map((c) => `- ${c.key}${changedParentHarm.includes(c) ? '' : ' (NOT a parent-harm query by the check: see below)'}`).join('\n') : '- None of the 183 calls names a parent with harm, so none moved; the port shows only on such queries (W10-2, W10-3).'}
${changed.length > changedParentHarm.length ? '\nA changed call that the check does not read as parent harm is unexplained by the port and is flagged for the Builder before any release.' : ''}

**On parent-harm queries, before and after.** The byte-identity suite has no parent-harm query, so the diff that matters is the WO#503 measurement (\`docs/wo503-data/mcp-residual.json\`: ${old.length} residual messages on head \`fde9f2b2\`, before the port), re-run on this head: before, ${oldServed.length} of them were served a now-withheld verse (17:24, 31:14 and 46:15 through the \`parents\` theme); now ${nowServedWithheld} are. What the ${old.length} get now: ${Object.entries(now).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('; ')}.

## W10-5. The MCP's own strings, swept for the four term kinds

The app's WO#503 pack swept the app's pools. The MCP serves its own strings too: the teach entries (${Object.keys(TEACH_ENTRIES as object).length} entries) and the soft-support block per locale. ${swept} strings swept with the same four expressions (sabr; patience; obedience to parents; family preservation) and forgiveness beside them. The expressions are English, so a non-English soft-support block is swept but cannot match; its locale is listed for Gem 3's lane, not cleared.

${hits.length ? `| where | terms | text |\n|---|---|---|\n${hits.map((h) => `| ${h.where.replace(/\|/g, '\\|')} | ${[...h.terms, ...(h.forgive ? ['forgiveness'] : [])].join(', ')} | ${h.text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 140)}${h.text.length > 140 ? '...' : ''} |`).join('\n')}` : 'No teach entry or soft-support string carries any of the four terms or forgiveness.'}

Whether a hit above should be withheld on parent harm is Gem 3's (the teach block is attached to a verse the port already withholds where the verse is withheld); this brief reports them.

## W10-6. The release

None now. The port ships in the next batched release with WO#502's and WO#503's detector changes; its version bump and this brief's ruling go in the release record. Until then agents on the published package get the pre-port behaviour you accepted as the interim.

## How to reply

For each item (W10-1 to W10-6), one line: the id, then **PASS**, **CHANGE** with what to change, or **BLOCK** with the reason. W10-5's hits are for Gem 3's lane; your PASS covers the egress side only. Do not restate an item you pass.
`
  const out = path.join(ROOT, 'docs', 'wo503b-gem10.md')
  // WO#503-C: the W10-7 addendum (scripts/wo503c-gem10-addendum.ts) is kept across a regeneration
  let existing = ''
  try { existing = readFileSync(out, 'utf-8') } catch { /* first run */ }
  const addendum = existing.includes('\n## W10-7.') ? existing.slice(existing.indexOf('\n## W10-7.')) : ''
  const body = addendum ? doc.replace(/\n## How to reply[\s\S]*$/, '') + addendum : doc
  writeFileSync(out, body)
  const kb = Buffer.byteLength(body, 'utf8') / 1024
  console.log(`wo503b-gem10.md  ${kb.toFixed(1)} KB; byte-identity changed ${changed.length} of ${before.length} (${changedParentHarm.length} parent-harm); corpus du'as citing withheld ${citing.length}; sweep ${swept} strings, ${hits.length} hits`)
  if (kb >= 15) throw new Error('over 15 KB; split it')
}
main().catch((e) => { console.error(e); process.exit(1) })
