/**
 * WO#454: Gem 10 pack, part 14 (and 14b), generated from two built servers:
 * this branch's dist/ ("after") and main's dist/ at the WO#454 base ("before").
 *
 * Gem 10's wordings are not retyped: each is read from the saved record
 * (docs/wo454-gem10-replies.md when present, else the Architect's brief that
 * quotes them, docs/wo454-architect.md) and must equal the string the built
 * server emits, or this script throws.
 *
 * Run from mcp-server/ after `npm run build`:
 *   node scripts/wo454-gem10-part14.mjs <before-mcp-server-dir>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const ROOT = path.resolve(PKG, '..')
const beforeDir = process.argv[2]
if (!beforeDir) throw new Error('usage: node scripts/wo454-gem10-part14.mjs <before-mcp-server-dir>')
const imp = (dir, rel) => import(pathToFileURL(path.join(dir, 'dist', rel)).href)

const A = {
  getDua: await imp(PKG, 'tools/get-dua.js'),
  duas: await imp(PKG, 'data/duas.js'),
  pres: await imp(PKG, 'contracts/presentation.js'),
  crisis: await imp(PKG, 'safety/crisis-keywords.js'),
}
const B = {
  getDua: await imp(path.resolve(beforeDir), 'tools/get-dua.js'),
  pres: await imp(path.resolve(beforeDir), 'contracts/presentation.js'),
  crisis: await imp(path.resolve(beforeDir), 'safety/crisis-keywords.js'),
}

// ---- Gem 10's wording, copied from the saved record --------------------------
const REPLIES = path.join(ROOT, 'docs', 'wo454-gem10-replies.md')
const BRIEF = path.join(ROOT, 'docs', 'wo454-architect.md')
if (!existsSync(REPLIES)) throw new Error('docs/wo454-gem10-replies.md is missing: Gem 10\'s wording is copied from it')
const recordPath = REPLIES
const replies = readFileSync(REPLIES, 'utf8')
const brief = readFileSync(BRIEF, 'utf8')
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Every string quoted ("…" or `…`) in `text` that starts with `head`. They must all be the same. */
const quotedIn = (text, file, head) => {
  const found = new Set()
  for (const m of text.matchAll(new RegExp(`"(${esc(head)}[^"\\n]*)"|\`(${esc(head)}[^\`\\n]*)\``, 'g'))) found.add(m[1] ?? m[2])
  if (!found.size) throw new Error(`not found in ${file}: ${head}`)
  if (found.size > 1) throw new Error(`${file} quotes ${head}… in ${found.size} different forms: ${[...found].join(' | ')}`)
  return [...found][0]
}
const same = (label, fromRecord, emitted) => {
  if (fromRecord !== emitted) throw new Error(`${label}: the record says\n  ${fromRecord}\nthe server emits\n  ${emitted}`)
  return emitted
}
/** Gem 10's string from the replies; also compared with the brief's quotation of it. */
const comparisons = []
const fromGem10 = (label, head, emitted) => {
  const r = quotedIn(replies, 'the replies', head)
  let b = null
  try { b = quotedIn(brief, 'the brief', head) } catch { b = null }
  comparisons.push({ label, replies: r, brief: b, same: b === r })
  return same(label, r, emitted)
}
const gem10 = {
  notANarration: fromGem10('Not a narration', 'This is a general supplication', A.pres.NOT_A_NARRATION_DIRECTIVE),
  duaBlock: fromGem10('dua_block line', "You MUST output the 'dua_block'", A.pres.DUA_DIRECTIVES.find((x) => x.includes("'dua_block'"))),
  crisis: fromGem10('crisis directive', 'Output this crisis resource block', A.crisis.SOFT_DISTRESS_RESOURCE_BLOCK.directive),
  quran: fromGem10('Quran line', 'For any Quranic text', A.pres.QURAN_CITATION_DIRECTIVE),
  // the Architect's draft, not Gem 10's: copied from the brief
  antiSum: same('anti-summarisation (Architect draft)', quotedIn(brief, 'the brief', "CRITICAL: Present each du'a"), A.pres.ANTI_SUMMARISATION_DIRECTIVE),
}
// Gem 10's scope prefix, with its placeholders
const scopeFromReplies = quotedIn(replies, 'the replies', 'Applies to these general supplication(s) only')
if (scopeFromReplies !== `${A.pres.NOT_A_NARRATION_SCOPE_HEAD}(<titles>): <the wording>`) throw new Error(`scope prefix: the replies say ${scopeFromReplies}`)
// Gem 10's own anti-summarisation wording (for multi-position fiqh rulings), shown beside the draft
const gem10Positions = quotedIn(replies, 'the replies', 'CRITICAL: You must present all positions')
for (const c of comparisons) console.log(`${c.label}: replies ${c.same ? '=' : '!='} brief${c.same ? '' : `\n  replies: ${c.replies}\n  brief:   ${c.brief}`}`)
// condition 6 of the 11 Oct conditions, saved verbatim on the WO#444 pack branch
const NO_EMOJI_AFTER = A.pres.NO_EMOJI_RULE

// ---- measurements ------------------------------------------------------------
const bytes = (o) => Buffer.byteLength(JSON.stringify(o))
const call = (m, context) => m.getDua.getDuaHandler({ context })
const J = (o) => JSON.stringify(o, null, 1)
const fence = (lang, s) => '```' + lang + '\n' + s + '\n```'

const biggest = Object.entries(
  JSON.parse(readFileSync(path.join(PKG, 'data', 'duas.json'), 'utf8')).reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {}),
).sort((a, b) => b[1] - a[1]).slice(0, 3)

const rows = []
for (const [cat, n] of biggest) {
  const before = await call(B, cat)
  const after = await call(A, cat)
  A.duas.setNotANarrationDirectiveForTest(false)
  const afterOff = await call(A, cat)
  A.duas.setNotANarrationDirectiveForTest(true)
  const s = after.content.grading_summary
  const pct = (x) => `${x >= 0 ? '+' : ''}${x.toLocaleString('en-GB')} (${((x / bytes(before)) * 100).toFixed(1)}%)`
  rows.push(`| \`${cat}\` | ${n} | ${s.not_a_narration} | ${bytes(before).toLocaleString('en-GB')} | ${bytes(after).toLocaleString('en-GB')} | ${pct(bytes(after) - bytes(before))} | ${pct(bytes(after) - bytes(afterOff))} |`)
}

const allRecords = JSON.parse(readFileSync(path.join(PKG, 'data', 'duas.json'), 'utf8'))
const carriers = allRecords.map((b) => ({ b, r: A.duas.getDuaRecordById(b.id) })).filter(({ r }) => r.grading_directive === A.pres.NOT_A_NARRATION_DIRECTIVE)
const mixedCarriers = carriers.filter(({ b, r }) => b.origin !== 'quran' && r.quran_spans?.length).map(({ b }) => b.id)
const quranCarriers = carriers.filter(({ b, r }) => b.origin === 'quran' || r.origin === 'quran').length

// the mixed payload: the smallest category route holding all three kinds
let mixedCtx = null
for (const cat of [...new Set(allRecords.map((d) => d.category))]) {
  const r = await call(A, cat)
  const s = r.content?.grading_summary
  if (!s || r.crisis_resource || !(s.quranic && s.graded && s.not_a_narration)) continue
  if (!mixedCtx || bytes(r) < bytes(mixedCtx.r)) mixedCtx = { cat, r }
}
const crisisCtx = 'feeling hopeless'
const crisisResp = await call(A, crisisCtx)
const crisisBefore = await call(B, crisisCtx)
const noQuran = A.getDua.duaByIdResponse('D00406', 'en', ['D00406'])
const withQuran = A.getDua.duaByIdResponse('D00128', 'en', ['D00128'])
const rulesOf = (r) => r._sakina_meta.llm_directives.CRITICAL_RULES

const beforeDuaBlock = B.pres.DUA_DIRECTIVES.find((x) => x.includes("'dua_block'"))
const beforeRec = (await call(B, mixedCtx.cat)).content.duas.find((d) => d.grading === 'Not a narration')
const afterRec = mixedCtx.r.content.duas.find((d) => d.grading === 'Not a narration')

// ---- part 14 -----------------------------------------------------------------
const part14 = `# WO#454 Gem 10 pack, part 14: the 2.1.0 strings, as built

**What this part is:** every string WO#454 changed, before and after, taken from two built servers: \`main\` at the WO#454 base (before) and the WO#454 branch (after). **Your wording is copied by script** from your replies to parts 8 to 13, saved verbatim (\`docs/wo454-gem10-replies.md\`). The script stops if the built server emits anything else.

**Where the payload is:** the real \`get_dua\` payload holding a Qur'an record, a "Not a narration" record and a graded record is \`${mixedCtx.cat}\`, ${bytes(mixedCtx.r).toLocaleString('en-GB')} bytes. It is in part 14b, verbatim, because it does not fit in this part.

## 1. Changed strings

**1a. "Not a narration" (your item D, now live).**
- **Before:** not emitted. Such records were \`grading_status: "graded"\` with no directive.
- **After, on each record** (\`grading_directive\`):

${fence('text', gem10.notANarration)}

- **After, once in CRITICAL_RULES** (from \`${mixedCtx.cat}\`):

${fence('text', rulesOf(mixedCtx.r).find((x) => x.startsWith(A.pres.NOT_A_NARRATION_SCOPE_HEAD)))}

- **Where it applies:** ${carriers.length} records. ${quranCarriers} of them have origin "quran"; a test fails if one ever does. ${mixedCarriers.length} are mixed records (non-quran origin, with \`quran_spans\`): ${mixedCarriers.join(', ')}.

**1b. grading_status for those ${carriers.length} records.**
- **Before:** \`"${beforeRec.grading_status}"\`.
- **After:** \`"${afterRec.grading_status}"\`.
- **\`grading_summary\` before:** \`${JSON.stringify((await call(B, mixedCtx.cat)).content.grading_summary)}\`.
- **After:** \`${JSON.stringify(mixedCtx.r.content.grading_summary)}\`.
- **The hadith contract** is \`require_grading: "per_record"\` when any are present (before: \`${JSON.stringify((await call(B, mixedCtx.cat))._sakina_meta.presentation_contract.hadith.require_grading)}\`, after: \`${JSON.stringify(mixedCtx.r._sakina_meta.presentation_contract.hadith.require_grading)}\`).
- **The ungraded directive** fires on none of them (tested).

**1c. The dua_block rule (DUA_DIRECTIVES).**

| | |
|---|---|
| **Before** | ${beforeDuaBlock} |
| **After (yours)** | ${gem10.duaBlock} |

**1d. The soft crisis_resource directive.**

| | |
|---|---|
| **Before** | ${B.crisis.SOFT_DISTRESS_RESOURCE_BLOCK.directive} |
| **After (yours)** | ${gem10.crisis} |

**What did not change:** the resource text, the hard (self-harm) directive, the abuse directive and the abuse ordering directive. Tests compare each one with its previous string.

**1e. Anti-summarisation: new, Architect draft, for your approval.** On every du'a response with more than one record:

${fence('text', gem10.antiSum)}

**Your own wording is for a multi-position fiqh ruling** (your reply on part 11, and your answer D):

${fence('text', gem10Positions)}

**Why the draft differs:** \`get_dua\` returns du'as, not fiqh positions, so the draft names du'as. No MCP tool returns a multi-position ruling today, so your wording has no payload to attach to yet.

**1f. The Qur'an line: new, yours.** It appears whenever the Qur'an contract applies (origin "quran", or \`quran_spans\`):

${fence('text', gem10.quran)}

- **Present:** on D00128 (\`${rulesOf(withQuran).includes(gem10.quran)}\`), on D00504, on mixed D00195, and in \`${mixedCtx.cat}\`.
- **Absent:** on D00406, which has no Qur'an (\`${!rulesOf(noQuran).includes(gem10.quran)}\`).
- **Tested on every category:** the line appears exactly when the Qur'an contract does.

**1g. The no-emoji rule (your condition 6, part 8 C).**

| | |
|---|---|
| **Before** | ${B.pres.NO_EMOJI_RULE} |
| **After** | ${NO_EMOJI_AFTER} |

## 2. Payload bytes: the three largest categories

**How these were measured:** \`get_dua\` by category, compact JSON.
- **The change column:** everything in WO#454.
- **The directive-only column:** the same response with the "Not a narration" directive switched off.

| Category | Du'as | Not a narration | Before (bytes) | After (bytes) | Change | Of which the directive |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## 3. One crisis payload: "${crisisCtx}" (soft), verbatim

**What changed:** only \`crisis_resource.directive\`. Before, it was "${crisisBefore.crisis_resource.directive}".

${fence('json', J(crisisResp))}

## Question

Do these strings satisfy your conditions for 2.1.0, and do you approve the anti-summarisation wording in point 5 as written?
`

const part14b = `# WO#454 Gem 10 pack, part 14b: get_dua "${mixedCtx.cat}"

**What this is:** the real 2.1.0 \`get_dua\` response, verbatim, envelope included.

**What it holds:** a Qur'an record, a "Not a narration" record and a graded record. \`grading_summary\`: \`${JSON.stringify(mixedCtx.r.content.grading_summary)}\`.

${fence('json', J(mixedCtx.r))}
`

const out = (name, text) => {
  const p = path.join(ROOT, 'docs', name)
  writeFileSync(p, text)
  const n = Buffer.byteLength(text)
  console.log(`${name}: ${n} bytes`)
  if (n >= 15000) throw new Error(`${name} is ${n} bytes; the limit is 15,000`)
}
out('wo454-gem10-part-14.md', part14)
out('wo454-gem10-part-14b.md', part14b)
console.log(`wording copied from ${path.relative(ROOT, recordPath)}; mixed carriers ${mixedCarriers.join(', ')}; quran carriers ${quranCarriers}`)
