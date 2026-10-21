/**
 * WO#478: MCP 2.2.0, "teach, don't hand off" (Architect rulings of 20 Oct
 * 2026 under the [GEM4-DAWAH] ruling, docs/mcp-teach-phase0/00-architect.md).
 *
 *   1. the server `instructions` field: present on initialize, under 1,801
 *      characters, carrying the adab block (534 characters as ruled, 566 with
 *      Gem 4's condition 2) and the 116-character open-door line verbatim,
 *      and the three sentences the Architect added;
 *   7. the delegated Gem rulings of 20 Oct 2026: no no-teach clause under a
 *      support block (Gem 3), the not_found directive without the site link
 *      (Gem 4), the server card privacy line (Gem 8);
 *   2. the four hand-off directives are retired and P1 to P6 are emitted;
 *   3. teach attaches whenever an entry exists, audience or not, with
 *      `audience: "unknown"` when omitted; withhold, en-only and the entry
 *      lookup are unchanged; by_audience is not wired;
 *   4. get_dua: default 3, `limit` up to 10, `offset` for paging (review fix
 *      2, so every record stays reachable), the bereaved set and the abuse
 *      allowlist whole, the "more" note when records follow the page;
 *   5. "loss of faith" is not grief and "fear of Allah" is not anxiety, in the
 *      theme matcher and in the soft-distress matcher;
 *   6. the version is 2.2.0 everywhere it is written.
 *
 * Run: npm run bundle-data && npm run test:wo478
 */

import { readFileSync } from 'node:fs'
import { DAWAH_ADAB_BLOCK, OPEN_DOOR_LINE, SERVER_INSTRUCTIONS, SERVER_INSTRUCTIONS_MAX_CHARS } from '../src/contracts/instructions.js'
import {
  ANTI_SUMMARISATION_DIRECTIVE,
  DUA_BLOCK_DIRECTIVE,
  DUA_DIRECTIVES,
  NAME_BLOCK_DIRECTIVE,
  NAME_DIRECTIVES,
  NO_TEACH_CLAUSE,
  QURAN_DIRECTIVES,
  TEACH_CONTRACT,
  TEACH_DIRECTIVE,
  VERSE_COLLECTION_DIRECTIVES,
} from '../src/contracts/presentation.js'
import { matchThemes, PHRASE_EXCLUSIONS } from '../src/data/thematic.js'
import { evaluateDistress, SOFT_PHRASE_EXCLUSIONS } from '../src/safety/crisis-keywords.js'
import { BEREAVED_DUAS } from '../src/data/bereaved-duas.js'

let failures = 0
const pass = (m: string) => console.log(`  PASS ${m}`)
const fail = (m: string, d?: unknown) => {
  failures++
  console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d)}`}`)
}
const check = (ok: boolean, m: string, d?: unknown) => (ok ? pass(m) : fail(m, d))

type Resp = {
  _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] }; presentation_contract: Record<string, unknown> }
  content: Record<string, unknown> & { duas?: Array<Record<string, unknown>>; verses?: Array<Record<string, unknown>>; teach?: { audience?: string } }
  crisis_resource?: { level?: string }
}
const rules = (r: Resp) => r._sakina_meta.llm_directives.CRITICAL_RULES
const teachBlocks = (v: unknown): Array<{ audience?: string; record_id?: string }> => {
  if (Array.isArray(v)) return v.flatMap(teachBlocks)
  if (!v || typeof v !== 'object') return []
  const r = v as Record<string, unknown>
  const own = r.teach && typeof r.teach === 'object' ? [r.teach as { audience?: string; record_id?: string }] : []
  return [...own, ...Object.values(r).flatMap(teachBlocks)]
}
const RETIRED = [
  "You MUST output the 'dua_block' field exactly as provided. Do not reassemble the record from individual keys.",
  "CRITICAL: Present each du'a below as its own complete record. Do not merge, summarise, or condense several du'as into one.",
  "Prefer the 'name_block' field for display; it contains the complete record (Arabic, transliteration, meaning, reflection, Quranic reference) in one inseparable string. Use that field rather than reassembling from the structured keys.",
  'Educational Context (Teach): Present the key word, root, and gloss exactly as provided to explain the linguistic context.',
]

async function main() {
  // Synthetic upstream for get_quran_verse (as test-teach.ts): the attachment
  // and the directives are under test, not the upstream bytes.
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
    if (!m) return new Response('{"code":404}', { status: 404 })
    const body = {
      code: 200,
      data: [
        { number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) },
        { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` },
      ],
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
  const { getDuaHandler, abuseResponse, GET_DUA_DEFAULT_LIMIT, GET_DUA_MAX_LIMIT, moreDuasNote } = await import('../src/tools/get-dua.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const { createMcpServer } = await import('../src/server.js')
  const dua = (a: Record<string, unknown>) => getDuaHandler(a as never) as unknown as Promise<Resp>
  const name = (a: Record<string, unknown>) => getNameOfAllahHandler(a as never) as unknown as Promise<Resp>
  const verse = (a: Record<string, unknown>) => getQuranVerseHandler(a as never) as unknown as Promise<Resp>
  const find = (a: Record<string, unknown>) => findVersesHandler(a as never) as unknown as Promise<Resp>

  console.log('\n=== 1. server instructions ===')
  check(SERVER_INSTRUCTIONS.length < SERVER_INSTRUCTIONS_MAX_CHARS, `instructions are ${SERVER_INSTRUCTIONS.length} characters (under ${SERVER_INSTRUCTIONS_MAX_CHARS})`)
  check(DAWAH_ADAB_BLOCK.length === 566 && SERVER_INSTRUCTIONS.includes(DAWAH_ADAB_BLOCK) && DAWAH_ADAB_BLOCK.includes('Make things easy and give good news (Sahih al-Bukhari 69), without hiding difficult texts.'), "the da'wah adab block is present verbatim, 566 characters with Gem 4's condition 2 (534 as ruled)")
  check(OPEN_DOOR_LINE.length === 116 && SERVER_INSTRUCTIONS.includes(`"${OPEN_DOOR_LINE}"`), 'the 116-character open-door line is present verbatim')
  for (const s of [
    'With crisis_resource_only: output the block exactly and add nothing religious.',
    'With a soft support block: quote the block exactly, present the records as given, with no teach content and no open door.',
    'If the user has disclosed distress, grief or crisis in the conversation, quote records only: skip teach, reflection questions and the open door.',
    'Each response carries quoting and presentation rules in _sakina_meta.llm_directives; apply them to that response.',
  ]) check(SERVER_INSTRUCTIONS.includes(s), `instructions carry: "${s.slice(0, 60)}..."`)
  check(!SERVER_INSTRUCTIONS.includes('Follow _sakina_meta.llm_directives in every response'), 'the "Follow ... in every response" wording is gone')
  check(!/[\u2014\u{FDFA}\u{1F300}-\u{1FAFF}]/u.test(SERVER_INSTRUCTIONS), 'no em dash, honorific symbol or emoji in the instructions')
  {
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createMcpServer().connect(a)
    const c = new Client({ name: 'wo478', version: '0' })
    await c.connect(b)
    check(c.getInstructions() === SERVER_INSTRUCTIONS, 'the initialize result carries the instructions, byte for byte')
    const tools = (await c.listTools()).tools
    const d = tools.find((t) => t.name === 'get_dua')!
    const lim = (d.inputSchema.properties as Record<string, { type?: string; maximum?: number; minimum?: number }>).limit
    check(lim?.type === 'integer' && lim.minimum === 1 && lim.maximum === GET_DUA_MAX_LIMIT, 'tools/list: get_dua has limit (integer 1 to 10)', lim)
    const over = await c.callTool({ name: 'get_dua', arguments: { context: 'morning', limit: 11 } })
    check(over.isError === true, 'limit 11 is rejected by the input schema')
    const neg = await c.callTool({ name: 'get_dua', arguments: { context: 'morning', offset: -1 } })
    check(neg.isError === true, 'offset -1 is rejected by the input schema')
    const off = (d.inputSchema.properties as Record<string, { type?: string; minimum?: number }>).offset
    check(off?.type === 'integer' && off.minimum === 0, 'tools/list: get_dua has offset (integer, min 0)', off)
    const text = (r: unknown) => (r as { content: Array<{ text: string }> }).content[0].text
    const plain = JSON.parse(text(await c.callTool({ name: 'get_name_of_allah', arguments: { number: 1 } }))) as Resp
    check(teachBlocks(plain)[0]?.audience === 'unknown', 'over MCP: get_name_of_allah 1 without audience carries teach with audience unknown')
    await c.close()
  }

  console.log('\n=== 2. hand-off directives retired, P1 to P6 emitted ===')
  check(DUA_DIRECTIVES.includes(DUA_BLOCK_DIRECTIVE) && DUA_BLOCK_DIRECTIVE.endsWith(NO_TEACH_CLAUSE), 'P2 is in DUA_DIRECTIVES and ends with the no-teach clause')
  check(NAME_DIRECTIVES.includes(NAME_BLOCK_DIRECTIVE) && NAME_BLOCK_DIRECTIVE.endsWith(NO_TEACH_CLAUSE), 'P4 is in NAME_DIRECTIVES and ends with the no-teach clause')
  check(QURAN_DIRECTIVES.some((x) => x.startsWith('Quote the verse first, exactly as provided.') && x.endsWith(NO_TEACH_CLAUSE)), 'P5 is in QURAN_DIRECTIVES')
  check(VERSE_COLLECTION_DIRECTIVES.some((x) => x.startsWith('Quote each verse first, exactly as provided.') && x.endsWith(NO_TEACH_CLAUSE)), 'P6 is in VERSE_COLLECTION_DIRECTIVES')
  check(ANTI_SUMMARISATION_DIRECTIVE.startsWith("CRITICAL: Present each du'a below as its own complete record, quoted exactly.") && !ANTI_SUMMARISATION_DIRECTIVE.includes('summarise'), 'P3: anti-summarisation keeps per-record completeness, drops "summarise", adds after-not-instead')
  check(TEACH_DIRECTIVE.includes('without implying authentication beyond what is explicitly stated'), 'P1 restores "without implying authentication beyond what is explicitly stated"')
  check(TEACH_DIRECTIVE.includes('If the user has disclosed distress, grief or crisis in the conversation, quote records only: skip teach, reflection questions and the open door.'), 'P1 carries the distress/grief skip')
  for (const s of ['(1) Quote the record first', 'context from AskSakina', 'not tafsir and not a ruling', '(3) Where the notes end', 'offer it verbatim', 'at most one related next step', 'crisis resource block']) check(TEACH_DIRECTIVE.includes(s), `P1 carries "${s}"`)
  check(TEACH_CONTRACT.startsWith('Educational Context (Teach): Quote the record first, exactly.') && TEACH_CONTRACT.includes('not as tafsir or a ruling'), 'P1c replaces the WO#407 contract')
  check(!NO_TEACH_CLAUSE.includes('explain nothing'), 'the "explain nothing" clause is gone (ruling 2a)')
  const all = [...QURAN_DIRECTIVES, ...VERSE_COLLECTION_DIRECTIVES, ...DUA_DIRECTIVES, ...NAME_DIRECTIVES, ANTI_SUMMARISATION_DIRECTIVE, TEACH_DIRECTIVE, TEACH_CONTRACT, NO_TEACH_CLAUSE]
  check(RETIRED.every((r) => !all.some((x) => x.includes(r))), 'none of the four retired strings remains in any directive list')
  check(all.every((x) => !/[\u2014\u{FDFA}\u{1F300}-\u{1FAFF}]/u.test(x)), 'no em dash, honorific symbol or emoji in any directive')
  {
    const sample = [await dua({ context: 'morning' }), await name({ number: 1 }), await verse({ surah: 2, ayah: 255 }), await find({ query: 'patience' })]
    const joined = JSON.stringify(sample)
    check(RETIRED.every((r) => !joined.includes(JSON.stringify(r).slice(1, -1))), 'four tool responses carry none of the retired strings')
    check(rules(sample[0]!).includes(DUA_BLOCK_DIRECTIVE) && rules(sample[0]!).includes(ANTI_SUMMARISATION_DIRECTIVE), 'get_dua "morning": P2 and P3')
    check(rules(sample[1]!).includes(NAME_BLOCK_DIRECTIVE), 'get_name_of_allah 1: P4')
    check(rules(sample[2]!).some((x) => x.startsWith('Quote the verse first')), 'get_quran_verse 2:255: P5')
    check(rules(sample[3]!).some((x) => x.startsWith('Quote each verse first')), 'find_verses "patience": P6')
  }

  console.log('\n=== 3. teach by default ===')
  {
    const n1 = await name({ number: 1 })
    const b = teachBlocks(n1)
    check(b.length === 1 && b[0]!.audience === 'unknown' && b[0]!.record_id === 'name:1' && rules(n1).includes(TEACH_DIRECTIVE) && n1._sakina_meta.presentation_contract.teach === TEACH_CONTRACT, 'get_name_of_allah 1, no audience: teach (audience unknown), P1 and P1c', b)
    const n1c = await name({ number: 1, audience: 'curious' })
    const strip = (r: unknown) => JSON.stringify(r, (k, v) => (k === 'audience' ? undefined : v))
    check(teachBlocks(n1c)[0]?.audience === 'curious' && strip(n1c) === strip(n1), 'with audience curious: the same response except teach.audience (by_audience not wired)')
    const v = await verse({ surah: 39, ayah: 53 })
    check(teachBlocks(v)[0]?.audience === 'unknown', 'get_quran_verse 39:53, no audience: teach (audience unknown)')
    const h = await find({ query: 'hope' })
    check(teachBlocks(h).length === 1 && teachBlocks(h)[0]!.record_id === 'verse:39:53', 'find_verses "hope", no audience: 39:53 carries teach')
    const d = await dua({ id: 'D00068' })
    check(teachBlocks(d)[0]?.audience === 'unknown', 'get_dua {id: D00068}, no audience: teach (audience unknown)')
    const none = [await verse({ surah: 2, ayah: 255 }), await name({ number: 2 }), await dua({ context: 'travel' })]
    check(none.every((r) => teachBlocks(r).length === 0 && !rules(r).includes(TEACH_DIRECTIVE)), 'no entry: no teach and no teach directive (2:255, Name 2, travel)')
    const held = [await dua({ context: 'anxiety' }), await find({ query: 'despair' }), await dua({ context: 'bereaved' })]
    check(held.every((r) => teachBlocks(r).length === 0), 'support block and grief route: nothing attaches, audience or not')
    const ur = [await name({ number: 1, locale: 'ur' }), await dua({ id: 'D00068', locale: 'ar' })]
    check(ur.every((r) => teachBlocks(r).length === 0), 'non-en locale: no teach (entries are English only)')
  }

  console.log('\n=== 4. get_dua limit ===')
  {
    const m = await dua({ context: 'morning' })
    const c = m.content as { duas: unknown[]; total_results: number; total_available: number; truncated: boolean; more?: string; grading_summary: Record<string, number> }
    check(GET_DUA_DEFAULT_LIMIT === 3 && c.duas.length === 3 && c.total_results === 3 && c.total_available === 25 && c.truncated === true, `"morning": 3 of ${c.total_available} by default`, c)
    check(c.more === moreDuasNote(22) && c.more === "22 more du'as for this context; call get_dua with offset and limit to see them." && rules(m).includes(c.more), 'the "more" note, exact wording, in content.more and in CRITICAL_RULES')
    check((c as { offset?: number }).offset === undefined, 'no offset key on the first page')
    const page2 = (await dua({ context: 'morning', offset: 10, limit: 10 })).content as { duas: Array<{ title: string }>; offset?: number; total_results: number; total_available: number; truncated: boolean; more?: string }
    const all25 = (await dua({ context: 'morning', limit: 10 })).content as { duas: Array<{ title: string }> }
    const page3 = (await dua({ context: 'morning', offset: 20, limit: 10 })).content as { duas: Array<{ title: string }>; truncated: boolean; more?: string }
    check(page2.duas.length === 10 && page2.offset === 10 && page2.total_results === 10 && page2.total_available === 25 && page2.truncated === true && page2.more === moreDuasNote(5), 'offset 10, limit 10: records 11 to 20, 5 more', page2)
    check(page3.duas.length === 5 && page3.truncated === false && page3.more === undefined, 'offset 20, limit 10: the last 5, no note')
    check(page2.duas[0]!.title !== all25.duas[0]!.title && [...all25.duas, ...page2.duas, ...page3.duas].length === 25, 'the three pages are disjoint and cover all 25')
    const beyond = (await dua({ context: 'morning', offset: 25 })).content as { duas: unknown[]; total_results: number; total_available: number; truncated: boolean }
    check(beyond.duas.length === 0 && beyond.total_results === 0 && beyond.total_available === 25 && beyond.truncated === false, 'offset past the end: an empty page with the counts')
    const bOff = (await dua({ context: 'bereaved', offset: 5 })).content as { duas: unknown[]; offset?: number }
    check(bOff.duas.length === BEREAVED_DUAS.length && bOff.offset === undefined, 'bereaved with offset 5: still whole, offset ignored')
    check(Object.values(c.grading_summary).reduce((a, b) => a + b, 0) === 3, 'grading_summary counts the returned records')
    const ten = (await dua({ context: 'morning', limit: 10 })).content as { duas: unknown[]; more?: string; truncated: boolean }
    check(ten.duas.length === 10 && ten.truncated && ten.more === moreDuasNote(15), 'limit 10: ten records, 15 more')
    const one = (await dua({ context: 'morning', limit: 1 })).content as { duas: unknown[]; more?: string }
    check(one.duas.length === 1 && one.more === moreDuasNote(24), 'limit 1: one record')
    const small = (await dua({ context: 'travel', limit: 10 })).content as { duas: unknown[]; total_available: number; truncated: boolean; more?: string }
    check(small.duas.length === small.total_available && small.truncated === false && small.more === undefined, 'a context within the limit: whole, not truncated, no note')
    const b = (await dua({ context: 'bereaved' })).content as { duas: unknown[]; total_available: number; truncated: boolean; more?: string }
    check(b.duas.length === BEREAVED_DUAS.length && b.total_available === BEREAVED_DUAS.length && !b.truncated && b.more === undefined, `bereaved: all ${BEREAVED_DUAS.length}, exempt from the limit`)
    const b1 = (await dua({ context: 'bereaved', limit: 1 })).content as { duas: unknown[] }
    check(b1.duas.length === BEREAVED_DUAS.length, 'bereaved with limit 1: still whole')
    const ab = abuseResponse('x', undefined, ['D00406', 'D00255', 'D00003', 'D00004']) as unknown as Resp
    check((ab.content.duas?.length ?? 0) === 4 && !rules(ab).some((x) => x.includes('more du')), 'abuse allowlist path: every allowlisted record, no note')
    check(moreDuasNote(1) === "1 more du'a for this context; call get_dua with offset and limit to see them.", 'the note is singular for one')
    const byId = (await dua({ id: 'D00068', limit: 5 })).content as { duas: unknown[]; total_results: number }
    check(byId.duas.length === 1 && byId.total_results === 1, 'limit is ignored with id')
  }

  console.log('\n=== 5. phrase fixes ===')
  check(PHRASE_EXCLUSIONS.length === 2 && SOFT_PHRASE_EXCLUSIONS.length === 2, 'exactly the two phrases, in both matchers (no synonym map in 2.2.0)')
  check(matchThemes('loss of faith').length === 0 && matchThemes('Loss of Faith').length === 0, '"loss of faith" matches no theme')
  check(matchThemes('fear of Allah').length === 0, '"fear of Allah" matches no theme')
  check(matchThemes('loss')[0]?.theme === 'grief' && matchThemes('fear')[0]?.theme === 'anxiety', 'controls: "loss" is grief, "fear" is anxiety')
  check(matchThemes('loss of faith and hope')[0]?.theme === 'hope', 'other words in the same query still match')
  check(evaluateDistress('loss of faith').level === 'none' && evaluateDistress('fear of Allah').level === 'none', 'neither phrase is a soft distress signal')
  check(evaluateDistress('loss of a friend').level === 'soft' && evaluateDistress('fear').level === 'soft', 'controls: "loss of a friend" and "fear" still are')
  check(evaluateDistress('anxiety and fear of Allah').level === 'soft', 'another soft keyword in the same input still counts')
  {
    const lf = await find({ query: 'loss of faith' })
    check(lf._sakina_meta.content_type === 'not_found' && lf.crisis_resource === undefined, 'find_verses "loss of faith": not_found, no support block')
    const fa = await find({ query: 'fear of Allah' })
    check(fa._sakina_meta.content_type === 'not_found' && fa.crisis_resource === undefined, 'find_verses "fear of Allah": not_found, no support block')
  }

  console.log('\n=== 7. the delegated Gem rulings of 20 Oct 2026 ===')
  {
    const hasClause = (r: Resp) => rules(r).some((x) => x.includes(NO_TEACH_CLAUSE))
    const stress = await dua({ context: 'stress' })
    const job = await dua({ context: 'job interview' })
    check(stress.crisis_resource?.level === 'soft' && stress._sakina_meta.content_type === 'dua_collection' && !hasClause(stress) && rules(stress).some((x) => x.startsWith("Quote each du'a from its 'dua_block' field")), 'Gem 3: get_dua "stress" (soft support block) carries the dua_block line without the no-teach clause')
    check(!job.crisis_resource && hasClause(job), 'Gem 3: get_dua "job interview" (no block) still carries the no-teach clause')
    const despair = await find({ query: 'despair' })
    const patience = await find({ query: 'patience' })
    check(despair.crisis_resource?.level === 'soft' && !hasClause(despair) && hasClause(patience), 'Gem 3: find_verses "despair" (soft block) has no clause; "patience" has it')
    const deceased = await dua({ context: 'deceased' })
    check(!deceased.crisis_resource && !hasClause(deceased), 'Gem 3: the deceased grief route (no block, teach withheld) has no clause either')
    const { abuseResponse: abuse } = await import('../src/tools/get-dua.js')
    const ab = abuse('x', { crisis_resource: { level: 'hard' } }, ['D00406', 'D00255']) as unknown as Resp
    check(!hasClause(ab), 'Gem 3: the abuse allowlist path has no clause')
    const nf = await dua({ context: 'zzzz-no-such-context' })
    const { NOT_FOUND_DISCLAIMER } = await import('../src/contracts/disclaimers.js')
    check(nf._sakina_meta.content_type === 'not_found' && rules(nf).includes('Suggest the user rephrase or try a related topic.') && !JSON.stringify(nf).includes('consult asksakina.com directly') && NOT_FOUND_DISCLAIMER.endsWith('Suggest the user rephrase or try a related topic.'), 'Gem 4: not_found directive and disclaimer say "try a related topic"; the site link is gone from both')
    const src = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf-8')
    check(src.includes("'aggregate counters only: per-tool call and status totals. No per-request records, no IPs, no client identifiers, no user-agents, no geolocation, no params, no response payloads. Since-start totals reset on restart; on the hosted server, per-tool daily totals are kept on disk for at most 90 days.'") && !src.includes('Counters reset on restart.'), 'Gem 8: the server card privacy line is the passed text')
  }

  console.log('\n=== 6. version ===')
  {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
    const card = JSON.parse(readFileSync(new URL('../.mcp/server.json', import.meta.url), 'utf-8')) as { version: string; packages: Array<{ version: string }> }
    const src = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf-8')
    const log = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8')
    // WO#481: the release moved on to 2.2.1; this checks that every version
    // site agrees with package.json and that the 2.2.0 section still exists.
    const v = pkg.version
    check(card.version === v && card.packages.every((p) => p.version === v) && src.includes(`SERVER_VERSION = '${v}'`) && log.includes(`## ${v}`) && log.includes('## 2.2.0'), `package.json, .mcp/server.json, SERVER_VERSION and the CHANGELOG agree (${v}); the 2.2.0 section is present`)
  }

  console.log(failures ? `\nWO#478: ${failures} FAILED` : '\nWO#478: all passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.log(`  FAIL threw: ${String(e)}`)
  process.exit(1)
})
