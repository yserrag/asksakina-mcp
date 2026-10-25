/**
 * WO#503-B (Gem 3, 25 Oct 2026): the parent-harm withhold, ported to the MCP.
 *
 *   1. The synced check and list are the app's (same file, synced by bundle-data).
 *   2. find_verses: on a parent-harm query every withheld verse is dropped; a theme left
 *      with none returns not_found "withheld on parent harm" with no verse; a parent-harm
 *      query that still has verses gets them without the withheld ones; a query with no
 *      harm still gets the parents theme whole (control).
 *   3. get_dua: on a parent-harm context a du'a citing a withheld verse is dropped; a
 *      category left with none returns not_found; the corpus's own count of such du'as
 *      is reported.
 *   4. The 384 WO#503-B harm pairs (and the 8 WO#503 cruelty forms) return the abuse
 *      block alone on both tools.
 *
 * Run: npm run test:wo503b
 */
import { readFileSync } from 'node:fs'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { detectCrisis } from '../src/safety/_synced/crisis-detection.js'
import { citesWithheldVerse, mentionsParentHarm, PARENT_HARM_WITHHELD_VERSES } from '../src/safety/_synced/parent-harm-rules.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'

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
type Resp = { _sakina_meta: { content_type: string }; content: { verses?: Array<{ reference: string }>; duas?: Array<{ source?: string; quran_ref?: string }>; matched_themes?: Array<{ theme: string }>; reason?: string }; crisis_resource?: { level?: string; crisis_type?: string } }
const find = async (query: string) => (await findVersesHandler({ query, limit: 10 } as never)) as unknown as Resp
const dua = async (context: string) => (await getDuaHandler({ context } as never)) as unknown as Resp
const abuseOnly = (r: Resp) => r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.level === 'hard' && r.crisis_resource?.crisis_type === 'abuse' && !(r.content.verses ?? []).length && !(r.content.duas ?? []).length

async function main() {
  console.log('=== 1. the synced check and list ===')
  const app = readFileSync(new URL('../../src/lib/ai/parent-harm-rules.ts', import.meta.url), 'utf-8')
  const synced = readFileSync(new URL('../src/safety/_synced/parent-harm-rules.ts', import.meta.url), 'utf-8')
  check(synced.includes(app), 'the synced parent-harm rules are the app file, byte for byte, under the synced header')
  check(PARENT_HARM_WITHHELD_VERSES.map((w) => `${w.surah}:${w.ayah}`).join(',') === '17:23,17:24,31:14,31:15,46:15,66:6', 'the withheld list is the six verses')
  check(mentionsParentHarm('my mother screams at me') && !mentionsParentHarm('I miss my mother') && !mentionsParentHarm('she screams at me'), 'the check: a parent word and a harm word')

  console.log('\n=== 2. find_verses ===')
  const parents = THEMES_2_5_0.find((t) => t.theme === 'parents')!
  check(parents.refs.every((r) => citesWithheldVerse(r)), `every ref of the parents theme (${parents.refs.join(', ')}) is withheld`)
  for (const q of ['my mother screams at me', 'my father neglects me', 'my parents humiliate me every day']) {
    const r = await find(q)
    check(!detectCrisis(q).isCrisis && mentionsParentHarm(q), `"${q}" is parent harm and not a crisis keyword`)
    check(r._sakina_meta.content_type === 'not_found' && /withheld on parent harm/.test(r.content.reason ?? '') && !(r.content.verses ?? []).length, `"${q}": the parents theme empties, not_found "withheld on parent harm", no verse`, r)
  }
  {
    const q = 'my mother screams at me and I feel so lonely'
    const r = await find(q)
    const refs = (r.content.verses ?? []).map((v) => v.reference)
    check(r._sakina_meta.content_type === 'verse_collection' && refs.length > 0 && refs.every((x) => !citesWithheldVerse(x)) && (r.content.matched_themes ?? []).some((t) => t.theme === 'parents'),
      `"${q}": the parents theme matched with another; the withheld verses are dropped and the rest served (${refs.join(', ')})`, r.content)
  }
  {
    const r = await find('I miss my mother so much')
    const refs = (r.content.verses ?? []).map((v) => v.reference)
    check(r._sakina_meta.content_type === 'verse_collection' && parents.refs.every((x) => refs.includes(x)), `control: no harm, the parents theme is served whole (${refs.join(', ')})`, refs)
  }
  // every withheld verse is absent from every parent-harm query that reaches any theme
  const triggers = THEMES_2_5_0.flatMap((t) => [...t.words, ...t.phrases])
  const leaked: string[] = []
  let calls = 0
  for (const harm of ['my mother screams at me', 'my dad humiliates me', 'my parents neglect me']) {
    for (const t of triggers) {
      calls++
      const r = await find(`${t}, ${harm}`)
      for (const v of r.content.verses ?? []) if (citesWithheldVerse(v.reference)) leaked.push(`${t}: ${v.reference}`)
    }
  }
  check(leaked.length === 0, `no withheld verse on any parent-harm query across every 2.5.0 trigger (${calls} calls)`, leaked.slice(0, 5))

  console.log('\n=== 3. get_dua ===')
  const ALL_DUAS = JSON.parse(readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as { id: string; source?: string; quran_ref?: string }[]
  const citing = ALL_DUAS.filter((d) => citesWithheldVerse(d.quran_ref) || citesWithheldVerse(d.source))
  console.log(`  corpus du'as citing a withheld verse: ${citing.length}${citing.length ? ` (${citing.map((d) => `${d.id} ${d.quran_ref ?? d.source}`).join('; ')})` : ''}`)
  for (const ctx of ['my mother screams at me, a dua for my parents', 'my father humiliates me, forgiveness']) {
    const r = await dua(ctx)
    const served = r.content.duas ?? []
    check(!detectCrisis(ctx).isCrisis && r._sakina_meta.content_type !== 'crisis_resource_only' && served.every((d) => !citesWithheldVerse(d.quran_ref) && !citesWithheldVerse(d.source)),
      `"${ctx}": ${r._sakina_meta.content_type}, no served du'a cites a withheld verse (${served.length} served)`, r.content)
  }
  {
    const r = await dua('a dua for my parents')
    check(r._sakina_meta.content_type !== 'not_found' || !/withheld on parent harm/.test(r.content.reason ?? ''), 'control: no harm, no parent-harm withhold on get_dua')
  }

  console.log('\n=== 4. the harm pairs are abuse on both tools ===')
  const rows = [
    ...(JSON.parse(readFileSync(new URL('../../docs/wo503b-data/phrases.json', import.meta.url), 'utf-8')) as { rows: { phrase: string }[] }).rows,
    ...(JSON.parse(readFileSync(new URL('../../docs/wo503-data/phrases.json', import.meta.url), 'utf-8')) as { rows: { phrase: string }[] }).rows,
  ]
  const miss: string[] = []
  for (const r of rows) {
    if (!abuseOnly(await find(r.phrase)) || !abuseOnly(await dua(r.phrase))) miss.push(r.phrase)
  }
  check(rows.length === 392 && miss.length === 0, `all ${rows.length} pairs (384 WO#503-B, 8 WO#503) return crisis_resource_only (hard, abuse) on find_verses and get_dua`, miss.slice(0, 10))

  console.log('\n=== 5. WO#503-C: teach fields withheld on parent harm ===')
  {
    const { withTeach, TEACH_WITHHELD_ON_PARENT_HARM, TEACH_WITHHOLDS_PARKED } = await import('../src/teach/attach.js')
    const { TEACH_ENTRIES } = await import('../src/teach/entries.js')
    const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
    type Block = { teach?: { key_word: { gloss: string }; context?: { text: string }; context_block?: string; reflection_question?: string } }
    check(TEACH_WITHHELD_ON_PARENT_HARM.length === 1 && TEACH_WITHHELD_ON_PARENT_HARM[0].key === 'name:5' && TEACH_WITHHELD_ON_PARENT_HARM[0].field === 'context', 'the withheld list is name:5 context (As-Salam)')
    check(TEACH_WITHHOLDS_PARKED.length === 1 && TEACH_WITHHOLDS_PARKED[0].key === 'verse:1:5' && TEACH_WITHHOLDS_PARKED[0].field === 'key_word.gloss', 'the 1:5 gloss is parked: key_word.gloss is required on the wire')
    const n5 = TEACH_ENTRIES['name:5']!, v15 = TEACH_ENTRIES['verse:1:5']!
    check(/forgiveness/.test((n5.context as { text: string }).text) && /obedience/.test(v15.key_word.gloss), 'the two strings Gem 3 named are the ones in the entries (As-Salam context names forgiveness; the 1:5 gloss names obedience)')
    const on = withTeach({ number: 5 }, 'name:5', { parentHarm: true }) as Block
    const off = withTeach({ number: 5 }, 'name:5', {}) as Block
    check(!!on.teach && on.teach.context === undefined && on.teach.context_block === undefined && !!on.teach.key_word.gloss && !!on.teach.reflection_question, 'name:5 on parent harm: the teach block is served without its context and context_block; key word and reflection stay', on.teach)
    check(!!off.teach?.context && !!off.teach.context_block && /forgiveness/.test(off.teach.context.text), 'control: name:5 without parent harm keeps its context')
    const v = withTeach({ ref: '1:5' }, 'verse:1:5', { parentHarm: true }) as Block
    check(!!v.teach && /obedience/.test(v.teach.key_word.gloss) && !!v.teach.context, 'verse:1:5 on parent harm: the block is unchanged (the gloss is parked, flagged in W10-7)')
    for (const k of ['name:34', 'name:1', 'name:9', 'verse:2:256'] as const) {
      const a = JSON.stringify(withTeach({ k }, k, { parentHarm: true })), b = JSON.stringify(withTeach({ k }, k, {}))
      check(a === b, `${k} is unchanged on parent harm (PASS, keep as is)`)
    }
    // reachability: which tools carry text the check can read, and whether the two records are served by them
    const byName = (await getNameOfAllahHandler({ name: 'As-Salam' } as never)) as unknown as { content: Block & { number?: number } }
    check(byName.content.number === 5 && !!byName.content.teach?.context, 'get_name_of_allah("As-Salam"): name 5 with its context (no harm in the text)')
    const harmName = (await getNameOfAllahHandler({ name: 'As-Salam, my mother hits me' } as never)) as unknown as { _sakina_meta: { content_type: string }; content: Block & { number?: number } }
    console.log(`  measured: get_name_of_allah("As-Salam, my mother hits me") -> ${harmName._sakina_meta.content_type}${harmName.content.number ? `, name ${harmName.content.number}, context ${harmName.content.teach?.context ? 'present' : 'withheld'}` : ''}`)
    check(!harmName.content.teach?.context, 'get_name_of_allah with parent harm in the name text: the As-Salam context is not served (either the name does not resolve, or it resolves without its context)')
    const { THEMES_2_5_0: T } = await import('../src/data/themes-2-5-0.js')
    check(!T.some((t) => t.refs.includes('1:5')), 'find_verses: no 2.5.0 theme carries 1:5, so the 1:5 teach block is served only by get_quran_verse, which takes no text')
  }

  console.log(`\nWO#503-B: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
