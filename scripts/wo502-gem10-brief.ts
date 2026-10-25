/**
 * WO#502 (the MCP's synced crisis detector; no release): writes the Gem 10 brief
 * (docs/wo502-gem10.md) from the synced detector, the WO#502 phrase record and
 * the MCP tools called in process, so every phrase and every result in it is
 * the shipped bytes and a measurement. Under 15 KB, with its own reply rules.
 *
 *   npx tsx scripts/wo502-gem10-brief.ts
 *
 * Byte identity: docs/wo502-data/byte-identity-main-{3cf114bf,9c21614c}.txt are
 * the first lines of `npx tsx scripts/byte-identity.ts` on main before and after
 * #584; the brief reads them, it does not re-run them.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { ABUSE_KEYWORDS, ABUSE_KEYWORDS_EN, detectCrisis } from '../src/safety/_synced/crisis-detection.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const q = (s: string) => `"${s}"`

type Row = { lang: string; phrase: string; stored: string; status: 'new' | 'already a keyword' }
const RECORD = JSON.parse(readFileSync(path.join(ROOT, 'docs/wo502-data/phrases.json'), 'utf-8')) as { rows: Row[] }
const NEW = RECORD.rows.filter((r) => r.status === 'new')
const OLD = RECORD.rows.filter((r) => r.status !== 'new')
const LANG: Record<string, string> = { en: 'English', ur: 'Urdu', pa: 'Punjabi (Shahmukhi, in the combined list)', tr: 'Turkish', ar: 'Arabic', id: 'Indonesian', bn: 'Bengali', fa: 'Persian' }
const byLang = (rows: Row[]) => ['en', 'ur', 'pa', 'tr', 'ar', 'id', 'bn', 'fa'].map((l) => [l, rows.filter((r) => r.lang === l)] as const).filter(([, r]) => r.length)

type Resp = { _sakina_meta: { content_type: string }; content: { verses?: unknown[]; duas?: unknown[]; matched_themes?: Array<{ theme: string }> }; crisis_resource?: { level?: string; crisis_type?: string } }
const find = async (query: string) => (await findVersesHandler({ query, limit: 10 } as never)) as unknown as Resp
const dua = async (context: string) => (await getDuaHandler({ context } as never)) as unknown as Resp
const abuseOnly = (r: Resp) => r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.level === 'hard' && r.crisis_resource?.crisis_type === 'abuse' && !(r.content.verses ?? []).length && !(r.content.duas ?? []).length
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
  // ---- W10-1: every new keyword returns the abuse block alone, on both tools, before any theme ----
  const synced = NEW.filter((r) => !ABUSE_KEYWORDS.includes(r.stored)).map((r) => `${r.lang} ${r.phrase}`)
  if (synced.length) throw new Error(`not in the synced list: ${synced.join('; ')}`)
  const notAbuse = RECORD.rows.filter((r) => detectCrisis(r.phrase).crisisType !== 'abuse').map((r) => `${r.lang} ${r.phrase}`)
  if (notAbuse.length) throw new Error(`the synced detector does not read as abuse: ${notAbuse.join('; ')}`)
  const missFind: string[] = []
  const missDua: string[] = []
  for (const r of RECORD.rows) {
    if (!abuseOnly(await find(r.phrase))) missFind.push(`${r.lang} ${r.phrase}`)
    if (!abuseOnly(await dua(r.phrase))) missDua.push(`${r.lang} ${r.phrase}`)
  }
  if (missFind.length || missDua.length) throw new Error(`not crisis_resource_only: find ${missFind.join('; ')} / dua ${missDua.join('; ')}`)
  const triggers = THEMES_2_5_0.flatMap((t) => [...t.words, ...t.phrases])
  const lost: string[] = []
  let calls = 0
  for (const r of NEW) for (const t of triggers) for (const s of [`${t} ${r.phrase}`, `${r.phrase} ${t}`]) {
    calls++
    if (!abuseOnly(await find(s))) lost.push(s)
  }
  if (lost.length) throw new Error(`a theme trigger beat a phrase: ${lost.slice(0, 5).join('; ')}`)

  // ---- W10-2: the open row on the MCP -------------------------------------------------------------------
  const PARENTS = ['mum', 'mom', 'mother', 'dad', 'father', 'stepdad', 'stepmum', 'parents']
  const open = PARENTS.map((p) => `my ${p} ${p === 'parents' ? 'are' : 'is'} cruel to me`)
  const openRows: string[] = []
  let open1724 = 0
  for (const m of open) {
    const f = await find(m)
    const d = await dua(m)
    const themes = (f.content.matched_themes ?? []).map((t) => t.theme)
    const refs = refsIn(f)
    if (refs.includes('17:24')) open1724++
    openRows.push(`| ${q(m)} | ${f._sakina_meta.content_type}${themes.length ? ` (${themes.join(', ')})` : ''}${refs.length ? `: ${refs.join(', ')}` : ''} | ${d._sakina_meta.content_type}${d.crisis_resource ? ` (${d.crisis_resource.level} block)` : ''} |`)
  }
  const parentsTheme = THEMES_2_5_0.find((t) => t.theme === 'parents')!

  // ---- W10-3: the English word-boundary end holds for the new keywords ------------------------------------
  const negatives = ['my dad hits metal pipes at work', 'my mum burns menthol candles']
  const negRows: string[] = []
  for (const n of negatives) {
    const f = await find(n)
    negRows.push(`| ${q(n)} | ${detectCrisis(n).crisisType} | ${f._sakina_meta.content_type}${f.crisis_resource ? ` (${f.crisis_resource.level} block)` : ''} |`)
  }
  const negFired = negatives.filter((n) => detectCrisis(n).crisisType !== 'none')
  if (negFired.length) throw new Error(`a negative fired: ${negFired.join('; ')}`)

  // ---- W10-4: what the MCP does not carry ---------------------------------------------------------------
  const syncedFiles = readdirSync(path.join(HERE, '..', 'src', 'safety', '_synced')).sort()

  // ---- W10-5: byte identity, read from the records --------------------------------------------------------
  const bi = (sha: string) => {
    const line = readFileSync(path.join(ROOT, `docs/wo502-data/byte-identity-main-${sha}.txt`), 'utf-8').split('\n')[0]
    const m = /calls (\d+)\s+bytes (\d+)\s+sha256 ([0-9a-f]{64})/.exec(line)
    if (!m) throw new Error(`no byte-identity line for ${sha}`)
    return { calls: +m[1], bytes: +m[2], sha: m[3] }
  }
  const before = bi('3cf114bf')
  const after = bi('9c21614c')
  const identical = before.sha === after.sha && before.calls === after.calls
  const version = (JSON.parse(readFileSync(path.join(HERE, '..', 'package.json'), 'utf-8')) as { version: string }).version

  const doc = `# WO#502 (the MCP's synced crisis detector; no release): Gem 10 brief

GENERATED by \`mcp-server/scripts/wo502-gem10-brief.ts\` from the synced detector (\`src/lib/utils/crisis-detection.ts\`, copied into the MCP by \`bundle-data\`), the WO#502 phrase record (\`docs/wo502-data/phrases.json\`) and the MCP tools called in process. Every phrase below is the stored bytes; every result is measured when the brief is built. The app side is merged (#584, main \`9c21614c\`); Gem 2 confirmed all 21 locale phrases. **No MCP release:** \`mcp-server/package.json\` still reads ${version}, and this change ships in the next batched release, after your ruling.

**What changes for an agent:** only which inputs return the abuse resource block. No served string changes: with 17:24 and every other record, the ${after.calls}-call byte-identity output is ${identical ? 'identical' : 'NOT identical'} before and after (W10-5).

## W10-1. ${NEW.length} new abuse-pathway keywords (a parent named with a harm)

Gem 3's WO#502 ruling (\`docs/wo502-gem3.md\`, \`docs/wo502-architect.md\`): every English "<parent> <harm>" pair, for ${8} parents (mum, mom, mother, dad, father, stepdad, stepmum, parents) and 8 harms (hits, hurts, slaps, kicks, chokes, burns, threatens, locks me in), plus "parents beat me"; and 21 parent-worded phrases in seven locales. ${RECORD.rows.length} phrases in all: ${OLD.length} were already keywords (${OLD.map((r) => `${r.lang} ${q(r.phrase)}`).join(', ')}), ${NEW.length} are new. The English ones are built from the Architect's two lists; the locale ones are copied by script from the Architect's message, stored in each list's form (normaliseArabic for ar, ur, fa and pa; lower case for id; as given for tr and bn), plain text, no bidi isolate or invisible mark. Each ends at a word boundary, like every English keyword since WO#500.

Measured on this build: all ${RECORD.rows.length} return \`crisis_resource_only\` (hard, abuse) with no verse and no du'a, on find_verses and on get_dua (context); and each of the ${NEW.length} new ones beats every 2.5.0 theme trigger (${triggers.length}) in both word orders: ${calls} find_verses calls, all \`crisis_resource_only\`.

${byLang(NEW).map(([l, rows]) => `- **${LANG[l]}** (${rows.length}): ${rows.map((r) => r.stored).join('; ')}`).join('\n')}

## W10-2. The open row: "<parent> is cruel to me" is not a keyword

Gem 3 did not approve it (the Architect: list it as open). On the app it reaches ordinary comfort with 17:24 and the family-ties line withheld (\`docs/wo502-cruel-open.md\`, for Gem 3). On the MCP, measured:

| query | find_verses | get_dua (context) |
|---|---|---|
${openRows.join('\n')}

The MCP has no parent-harm check (W10-4), and the 2.5.0 \`parents\` theme (words: ${parentsTheme.words.join(', ')}; refs: ${parentsTheme.refs.join(', ')}) carries 17:24. So ${open1724 === 0 ? 'none of the 8 open queries is served 17:24 here, because the ones carrying a parent theme word reach the theme with other verses first' : `**${open1724} of the 8 open queries are served 17:24 on find_verses**, the du'a for parents that the app withholds from the same message`}. This is for Gem 3's ruling on the row and for your call on the egress side; nothing is changed here.

## W10-3. The English word-boundary end holds for the new keywords

| query | synced detector | find_verses |
|---|---|---|
${negRows.join('\n')}

## W10-4. What the MCP does not carry (app-only parts of WO#502)

The MCP syncs only ${syncedFiles.map((f) => `\`${f}\``).join(', ')}. WO#502's two other changes are in the app alone and reach no agent:
- the parent-harm check (\`src/lib/ai/parent-harm.ts\`) now also knows choke, chokes, burn, burns and lock; it withholds 17:24 on the app's comfort routes;
- the family-ties line (angry / family_related) is never shown on parent harm; the angry mood's main message is.

Neither has an MCP counterpart today: the MCP withholds nothing on a parent-harm message that is not a crisis keyword (W10-2).

## W10-5. Served strings unchanged, and the release

- Byte identity, ${after.calls} calls (every agent eval case, every du'a category, all 99 Names), audience omitted: main before #584 (\`3cf114bf\`) sha256 \`${before.sha.slice(0, 8)}...\`, ${before.bytes.toLocaleString('en-GB')} bytes; main after (\`9c21614c\`) sha256 \`${after.sha.slice(0, 8)}...\`, ${after.bytes.toLocaleString('en-GB')} bytes. ${identical ? 'Identical: no crisis block, directive, record or teach text moved.' : 'They differ; see the two records under docs/wo502-data/.'} (Records: \`docs/wo502-data/byte-identity-main-*.txt\`.)
- The synced list is now ${ABUSE_KEYWORDS.length} abuse keywords (${ABUSE_KEYWORDS_EN.length} English). The MCP prepublish chain passed on the merged head (WO#502 SG report).
- **No release.** Agents on the published ${version} keep the old list until the next batched release carries this change, with its version bump and this brief's ruling in the release record.

## How to reply

For each item (W10-1 to W10-5), one line: the id, then **PASS**, **CHANGE** with what to change, or **BLOCK** with the reason. W10-2 is a measurement for Gem 3's ruling on the open row; your PASS covers the egress side only (whether what the MCP serves for those queries may stand until Gem 3 rules). Do not restate an item you pass.
`
  const out = path.join(ROOT, 'docs', 'wo502-gem10.md')
  writeFileSync(out, doc)
  const kb = Buffer.byteLength(doc, 'utf8') / 1024
  console.log(`wo502-gem10.md  ${kb.toFixed(1)} KB; ${NEW.length} new, ${OLD.length} already, ${calls} trigger calls, open queries served 17:24: ${open1724}`)
  if (kb >= 15) throw new Error('over 15 KB; split it')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
