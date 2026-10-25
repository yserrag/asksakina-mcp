/**
 * WO#503-C item 3: the W10-7 addendum to docs/wo503b-gem10.md (Gem 3's follow-up,
 * docs/wo503-architect.md section 7): the two teach strings withheld on parent harm,
 * the one that is parked under the wire schema, which tools can reach each record and
 * whether they carry text the check can read, and the measured effect. Appended after
 * W10-6, before "How to reply"; replaces an earlier W10-7. No new Gem 10 round: it rides
 * the release record.
 *
 *   npx tsx scripts/wo503c-gem10-addendum.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEACH_WITHHELD_ON_PARENT_HARM, TEACH_WITHHOLDS_PARKED, withTeach } from '../src/teach/attach.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { mentionsParentHarm } from '../src/safety/_synced/parent-harm-rules.js'
import { getNameOfAllahHandler } from '../src/tools/get-name-of-allah.js'
import { findVersesHandler } from '../src/tools/find-verses.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const q = (s: string) => `"${s}"`
type Block = { teach?: { key_word: { gloss: string }; context?: { text: string }; context_block?: string } }

async function main() {
  const n5 = TEACH_ENTRIES['name:5']!
  const v15 = TEACH_ENTRIES['verse:1:5']!
  const ctxText = (n5.context as { text: string }).text
  const on = withTeach({ number: 5 }, 'name:5', { parentHarm: true }) as Block
  const off = withTeach({ number: 5 }, 'name:5', {}) as Block
  if (!off.teach?.context || on.teach?.context || on.teach?.context_block) throw new Error('the name:5 withhold does not behave as described')
  const harmName = (await getNameOfAllahHandler({ name: 'As-Salam, my mother hits me' } as never)) as unknown as { _sakina_meta: { content_type: string }; content: Block & { number?: number } }
  const plainName = (await getNameOfAllahHandler({ name: 'As-Salam' } as never)) as unknown as { content: Block & { number?: number } }
  const oneFive = THEMES_2_5_0.filter((t) => t.refs.includes('1:5')).map((t) => t.theme)
  // the 32 WO#503-C strings on the MCP
  const rows = (JSON.parse(readFileSync(path.join(ROOT, 'docs/wo503c-data/phrases.json'), 'utf-8')) as { rows: { phrase: string }[] }).rows
  let abuse = 0
  for (const r of rows) {
    const f = (await findVersesHandler({ query: r.phrase, limit: 5 } as never)) as unknown as { _sakina_meta: { content_type: string }; crisis_resource?: { level?: string; crisis_type?: string } }
    if (f._sakina_meta.content_type === 'crisis_resource_only' && f.crisis_resource?.crisis_type === 'abuse') abuse++
  }
  const harmInName = mentionsParentHarm('As-Salam, my mother hits me')

  const section = `
## W10-7. Addendum (WO#503-C, Gem 3's follow-up): two teach strings on parent harm

Gem 3 (docs/wo503-architect.md section 7) ruled that two teach strings are withheld when a query names a parent with harm: the 1:5 key-word gloss (${q(v15.key_word.gloss)}) and the As-Salam context (name:5: ${q(ctxText)}). Al-Ghafur (name:34), ar-Rahman (name:1), Al-Jabbar (name:9) and verse:2:256 are PASS and unchanged. The field is withheld, not the record.

- **name:5 context: withheld.** \`context\` is optional on the teach block wire and \`context_block\` is present exactly when \`context\` is, so both are dropped and the rest of the block (key word, misconception, reflection, related) is served as before (\`withTeach\`, \`parentHarm\`; \`TEACH_WITHHELD_ON_PARENT_HARM\`). Measured: with parent harm the block has no \`context\` and no \`context_block\`; without, it has both.
- **verse:1:5 gloss: parked, flagged.** \`key_word.gloss\` is a required string on the wire (\`TeachBlockWire.key_word\`); dropping it, or blanking it, changes the egress schema, which is your lane. It stays served until you rule (\`TEACH_WITHHOLDS_PARKED\`). ${oneFive.length ? `It is reachable from find_verses through the ${oneFive.join(', ')} theme${oneFive.length > 1 ? 's' : ''}.` : 'No 2.5.0 theme carries 1:5, so the block is served only by get_quran_verse, which takes surah and ayah and no text.'}
- **Reach.** The check needs text. find_verses (query) and get_dua (context) pass it; get_name_of_allah passes its \`name\` input; get_quran_verse takes numbers only. The As-Salam block is served only by get_name_of_allah, so the withhold fires there only when the \`name\` text itself names a parent with harm. Measured: \`get_name_of_allah("As-Salam")\` serves name ${plainName.content.number} with its context; \`get_name_of_allah("As-Salam, my mother hits me")\` (parent harm by the check: ${harmInName ? 'yes' : 'no'}) returns ${harmName._sakina_meta.content_type}${harmName.content.number ? `, name ${harmName.content.number}, context ${harmName.content.teach?.context ? 'present' : 'withheld'}` : ''}. So on today's tools the withhold is correct and seldom reached: an agent that resolves a Name after a parent-harm disclosure does so by number or by the Name alone, with no text for the check. A \`context\` input on get_name_of_allah and get_quran_verse would carry the disclosure; that is a schema change for your ruling, not made here.
- **The 32 adjective forms** ("<parent> is violent / abusive (to me)", WO#503-C item 1) are in the synced detector: all ${abuse} of ${rows.length} return the abuse block alone on find_verses.

No new round is asked: this rides the release record with W10-1 to W10-6, which you passed. If you want to rule on the parked gloss or a \`context\` input, say so on the release record.
`
  const out = path.join(ROOT, 'docs', 'wo503b-gem10.md')
  let doc = readFileSync(out, 'utf-8')
  if (doc.includes('\n## W10-7.')) doc = doc.slice(0, doc.indexOf('\n## W10-7.'))
  if (!doc.includes('\n## How to reply')) throw new Error('the brief has no "How to reply" section')
  const reply = doc.slice(doc.indexOf('\n## How to reply'))
  doc = doc.slice(0, doc.indexOf('\n## How to reply')) + section + reply.replace('For each item (W10-1 to W10-6)', 'For each item (W10-1 to W10-6; W10-7 rides the release record)')
  writeFileSync(out, doc)
  const kb = Buffer.byteLength(doc, 'utf8') / 1024
  console.log(`wo503b-gem10.md + W10-7  ${kb.toFixed(1)} KB; adjective forms abuse on find_verses ${abuse}/${rows.length}; 1:5 themes ${oneFive.length}`)
  if (kb >= 15) throw new Error('over 15 KB; split it')
}
main().catch((e) => { console.error(e); process.exit(1) })
