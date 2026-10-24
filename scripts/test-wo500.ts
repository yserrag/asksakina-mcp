/**
 * WO#500 (MCP 2.5.1): the abuse intent phrases, synced from the app detector.
 *
 *   1. Every phrase (the app's wo500-phrases.json) returns crisis_resource_only
 *      with the abuse block on find_verses and get_dua, and beats every 2.5.0
 *      theme trigger in both word orders.
 *   2. The Architect's negatives fire no crisis (they may reach a theme or not_found).
 *   3. The 2.5.0 abuse-word hold still keeps the bare words off the new themes.
 *   4. The educational queries behave as the app records.
 *
 * Run: npm run test:wo500
 */
import { readFileSync } from 'node:fs'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { detectCrisis } from '../src/safety/_synced/crisis-detection.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'

type Phrase = { lang: string; phrase: string; status: string }
const DATA = JSON.parse(readFileSync(new URL('../../src/lib/utils/__tests__/wo500-phrases.json', import.meta.url), 'utf-8')) as {
  phrases: Phrase[]
  negative: string[]
  educational: Array<{ lang: string; query: string; expect: 'abuse' | 'none' }>
}

let failures = 0
let checks = 0
const check = (ok: boolean, m: string, d?: unknown) => {
  checks++
  if (ok) console.log(`  PASS ${m}`)
  else {
    failures++
    console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d).slice(0, 600)}`}`)
  }
}
type Resp = { _sakina_meta: { content_type: string }; content: { verses?: unknown[]; duas?: unknown[]; matched_themes?: Array<{ theme: string }> }; crisis_resource?: { level?: string; crisis_type?: string } }
const find = async (query: string) => (await findVersesHandler({ query, limit: 10 } as never)) as unknown as Resp
const abuseOnly = (r: Resp) => r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.level === 'hard' && !(r.content.verses ?? []).length && !(r.content.duas ?? []).length

async function main() {
  console.log('=== 1. every phrase: the abuse block, before any theme ===')
  const synced = DATA.phrases.filter((p) => detectCrisis(p.phrase).crisisType !== 'abuse').map((p) => `${p.lang}: ${p.phrase}`)
  check(DATA.phrases.length === 88 && synced.length === 0, `the synced detector reads all ${DATA.phrases.length} phrases as abuse`, synced)
  const missFind: string[] = []
  const missDua: string[] = []
  for (const p of DATA.phrases) {
    if (!abuseOnly(await find(p.phrase))) missFind.push(`${p.lang}: ${p.phrase}`)
    if (!abuseOnly((await getDuaHandler({ context: p.phrase } as never)) as unknown as Resp)) missDua.push(`${p.lang}: ${p.phrase}`)
  }
  check(missFind.length === 0, `find_verses: all ${DATA.phrases.length} return crisis_resource_only (hard), no verses`, missFind)
  check(missDua.length === 0, `get_dua (context): all ${DATA.phrases.length} return crisis_resource_only (hard), no du'as`, missDua)
  const triggers = THEMES_2_5_0.flatMap((t) => [...t.words, ...t.phrases])
  const lost: string[] = []
  let calls = 0
  for (const p of DATA.phrases) {
    for (const t of triggers) {
      for (const q of [`${t} ${p.phrase}`, `${p.phrase} ${t}`]) {
        calls++
        if (!abuseOnly(await find(q))) lost.push(q)
      }
    }
  }
  check(lost.length === 0, `every phrase beats every 2.5.0 trigger (${triggers.length}) in both word orders: ${calls} calls, all crisis_resource_only`, lost.slice(0, 10))

  console.log('\n=== 2. the negatives fire no crisis ===')
  for (const q of DATA.negative) {
    const r = await find(q)
    check(r._sakina_meta.content_type !== 'crisis_resource_only' && r.crisis_resource?.level !== 'hard', `"${q}": no crisis block (${r._sakina_meta.content_type})`)
  }

  console.log('\n=== 3. the 2.5.0 abuse-word hold (bare words) ===')
  const NEW = new Set(THEMES_2_5_0.map((t) => t.theme))
  for (const q of ['abuse and marriage', 'abusive parents?', 'violence in the family', 'my parents abuse']) {
    const r = await find(q)
    const themes = (r.content.matched_themes ?? []).map((m) => m.theme)
    check(r._sakina_meta.content_type === 'crisis_resource_only' || !themes.some((t) => NEW.has(t)), `"${q}": no 2.5.0 theme (${r._sakina_meta.content_type}${themes.length ? `: ${themes.join(', ')}` : ''})`)
  }

  console.log('\n=== 4. educational queries, as the app records ===')
  for (const e of DATA.educational) {
    const r = await find(e.query)
    const got = r._sakina_meta.content_type === 'crisis_resource_only' ? 'abuse' : 'none'
    check(got === e.expect, `${e.lang}: ${e.expect}`, r._sakina_meta.content_type)
  }

  console.log(`\nWO#500: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
