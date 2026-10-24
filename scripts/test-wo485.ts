/**
 * WO#485: MCP 2.3.1, Gem 10 correction of 2.3.0 (22 Oct 2026;
 * docs/wo485-architect.md).
 *
 *   A. both binding lines, verbatim, on every response that carries a teach
 *      block (every teach entry, with and without an audience), once each,
 *      after the teach directive; on no response without a teach block
 *      (records with no entry, crisis, soft-block, grief and non-en calls);
 *   B. teach.context_block on every teach block with a context: the context
 *      text, a newline (WO#487, Gem 10 condition), then every citation as
 *      "Text (Grading)" or "Text", joined with "; "; it contains every
 *      citation and grading; 2:255's ends with the ruled line; across all
 *      132 teach responses, exactly one newline, directly before the first
 *      citation, and no space join; no context, no context_block; the
 *      existing context fields are unchanged.
 *
 * Run: npm run bundle-data && npm run test:wo485
 */

import { TEACH_BINDING_DIRECTIVES, TEACH_CONTRACT, TEACH_DIRECTIVE } from '../src/contracts/presentation.js'
import { readFileSync } from 'node:fs'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import type { TeachEntry } from '../src/teach/types.js'

let failures = 0
let checks = 0
const check = (ok: boolean, m: string, d?: unknown) => {
  checks++
  if (ok) console.log(`  PASS ${m}`)
  else {
    failures++
    console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d)}`}`)
  }
}

// WO#488 Part D (Gem 10, 22 Oct 2026): the first line is replaced, verbatim (docs/wo488-architect.md).
const WO485_LINE1 = 'CRITICAL: You must present the context text and all citations and gradings exactly as provided, bound together in one string. Do not omit the grading.'
const LINE1 = "CRITICAL: Output the `context_block` exactly as provided. Do not split, summarize, or reformat the text before or after the newline (`\\n`). The citations and gradings at the end of the block are mandatory and must remain attached to the context."
const LINE2 = "CRITICAL: Present all explanatory glosses, contexts, and reflections using neutral, educational framing (e.g., 'In Islamic tradition...', 'Muslims believe...'). Do not present them as personalized religious rulings."

type Teach = { record_id: string; context?: { text: string; citations?: Array<{ text: string; grading?: string }> }; context_block?: string }
type R = { _sakina_meta: { llm_directives: { CRITICAL_RULES: readonly string[] }; presentation_contract?: { teach?: string } } }

function teachBlocks(r: unknown): Teach[] {
  const out: Teach[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.teach && typeof o.teach === 'object') out.push(o.teach as Teach)
      Object.values(o).forEach(walk)
    }
  }
  walk(r)
  return out
}

async function main() {
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
    if (!m) return new Response('{"code":404}', { status: 404 })
    return new Response(JSON.stringify({ code: 200, data: [{ number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) }, { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')

  console.log('=== A. the binding lines ===')
  check(JSON.stringify(TEACH_BINDING_DIRECTIVES) === JSON.stringify([LINE1, LINE2]), 'the two lines are Gem 10\'s text, verbatim (the first as replaced by WO#488 Part D)')
  // WO#488 Part D: the line equals the ruling's text in the archived record, byte for byte.
  const record = readFileSync(new URL('../../docs/wo488-architect.md', import.meta.url), 'utf-8')
  check(record.includes(`>   "${LINE1}"`) && LINE1.includes('(`\\n`)') && !LINE1.includes('\n'), 'WO#488 D: the line is the archived ruling\'s text, with a literal backslash-n (not a newline)')
  check(TEACH_CONTRACT.endsWith(`crisis resource block. ${LINE1}`), 'WO#488 D: presentation_contract.teach ends with the same sentence')
  const entries = TEACH_ENTRIES as Readonly<Record<string, TeachEntry>>
  const callFor = (key: string, audience?: string): Promise<unknown> => {
    const [kind, a, b] = key.split(':')
    const aud = audience ? { audience } : {}
    if (kind === 'verse') return getQuranVerseHandler({ surah: Number(a), ayah: Number(b), ...aud } as never)
    if (kind === 'name') return getNameOfAllahHandler({ number: Number(a), ...aud } as never)
    return getDuaHandler({ id: a!, ...aud } as never)
  }
  const bad: string[] = []
  let teachResponses = 0
  for (const key of Object.keys(entries)) {
    for (const audience of [undefined, 'revert', 'curious']) {
      const r = (await callFor(key, audience)) as R
      if (teachBlocks(r).length === 0) continue
      teachResponses++
      const rules = r._sakina_meta.llm_directives.CRITICAL_RULES
      const i = rules.indexOf(TEACH_DIRECTIVE)
      if (rules.includes(WO485_LINE1) || r._sakina_meta.presentation_contract?.teach !== TEACH_CONTRACT || rules.filter((x) => x === LINE1).length !== 1 || rules.filter((x) => x === LINE2).length !== 1 || i < 0 || rules[i + 1] !== LINE1 || rules[i + 2] !== LINE2) bad.push(`${key} audience=${audience}`)
    }
  }
  check(teachResponses >= Object.keys(entries).length && bad.length === 0, `both lines, once each, right after the teach directive, the WO#485 line nowhere, and presentation_contract.teach present, on every teach response (${teachResponses}: every entry, with and without an audience)`, bad)
  // find_verses carries teach for a verse with an entry (39:53 on "hope").
  const hope = (await findVersesHandler({ query: 'hope' })) as R
  check(teachBlocks(hope).length > 0 && hope._sakina_meta.llm_directives.CRITICAL_RULES.includes(LINE1) && hope._sakina_meta.llm_directives.CRITICAL_RULES.includes(LINE2), 'find_verses "hope" (teach on 39:53): both lines')

  const without: Array<[string, Promise<unknown>]> = [
    ['get_quran_verse 2:257 (no entry; WO#495 gave 2:256 one)', getQuranVerseHandler({ surah: 2, ayah: 257 })],
    ['get_name_of_allah 11 (no entry)', getNameOfAllahHandler({ number: 11 })],
    ['get_dua "travel"', getDuaHandler({ context: 'travel' })],
    ['get_dua "anxiety" (soft block)', getDuaHandler({ context: 'anxiety' })],
    ['get_dua "grief"', getDuaHandler({ context: 'grief' })],
    ['get_dua "I want to kill myself" (crisis)', getDuaHandler({ context: 'I want to kill myself' })],
    ['get_quran_verse 1:1 locale ur (non-en)', getQuranVerseHandler({ surah: 1, ayah: 1, locale: 'ur' })],
    ['get_name_of_allah 3 locale tr (non-en)', getNameOfAllahHandler({ number: 3, locale: 'tr' })],
    ['find_verses "despair" (soft block)', findVersesHandler({ query: 'despair' })],
  ]
  for (const [label, p] of without) {
    const r = (await p) as R
    const rules = r._sakina_meta.llm_directives.CRITICAL_RULES
    check(teachBlocks(r).length === 0 && !rules.includes(LINE1) && !rules.includes(LINE2) && r._sakina_meta.presentation_contract?.teach === undefined, `${label}: no teach, neither line, no presentation_contract.teach`)
  }

  console.log('\n=== B. context_block ===')
  const blocks: Teach[] = []
  for (const key of Object.keys(entries)) blocks.push(...teachBlocks(await callFor(key)))
  const withCtx = blocks.filter((b) => b.context)
  const missing: string[] = []
  const wrongFormat: string[] = []
  for (const b of withCtx) {
    const cites = b.context!.citations ?? []
    const want = cites.length ? `${b.context!.text}\n${cites.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ')}` : b.context!.text
    if (b.context_block !== want) wrongFormat.push(b.record_id)
    for (const c of cites) {
      if (!b.context_block?.includes(c.text) || (c.grading && !b.context_block.includes(`(${c.grading})`))) missing.push(`${b.record_id}: ${c.text}`)
    }
  }
  check(withCtx.length > 0 && wrongFormat.length === 0, `every teach block with a context (${withCtx.length}) carries context_block: the text, a newline, then "Text (Grading)" or "Text", joined with "; "`, wrongFormat)
  const nCites = withCtx.reduce((n, b) => n + (b.context!.citations?.length ?? 0), 0)
  const nGraded = withCtx.reduce((n, b) => n + (b.context!.citations ?? []).filter((c) => c.grading).length, 0)
  check(missing.length === 0, `context_block contains every citation (${nCites}) and every grading (${nGraded})`, missing)
  const v255 = blocks.find((b) => b.record_id === 'verse:2:255')
  check(!!v255?.context_block?.includes('(Sahih, al-Albani)'), '2:255\'s context_block includes "(Sahih, al-Albani)"', v255?.context_block)
  check(!!v255?.context_block?.endsWith(`${v255.context!.text}\nQuran 2:255; Sahih Muslim 810; Sunan al-Nasa'i, 'Amal al-Yawm wal-Laylah 100 (Sahih, al-Albani)`), '2:255\'s context_block ends "<context>\\nQuran 2:255; Sahih Muslim 810; Sunan al-Nasa\'i, \'Amal al-Yawm wal-Laylah 100 (Sahih, al-Albani)"', v255?.context_block)

  // WO#487 (Gem 10 condition): on every one of the teach responses, exactly
  // one "\n" in context_block, directly before the first citation, and no
  // context-to-citation space join.
  let seen = 0
  const badNewline: string[] = []
  for (const key of Object.keys(entries)) {
    for (const audience of [undefined, 'revert', 'curious']) {
      for (const b of teachBlocks(await callFor(key, audience))) {
        seen++
        if (!b.context) continue
        const cites = b.context.citations ?? []
        const block = b.context_block ?? ''
        if (!cites.length) {
          if (block.includes('\n')) badNewline.push(`${b.record_id}: a newline with no citations`)
          continue
        }
        const first = cites[0]!.grading ? `${cites[0]!.text} (${cites[0]!.grading})` : cites[0]!.text
        const nl = block.split('\n').length - 1
        if (nl !== 1 || block.indexOf('\n') !== b.context.text.length || !block.startsWith(`${b.context.text}\n${first}`) || block.includes(`${b.context.text} ${first}`)) badNewline.push(`${b.record_id} audience=${audience}`)
      }
    }
  }
  // WO#495: 45 entries (2:256 added), three calls each.
  check(seen === 135 && badNewline.length === 0, `all ${seen} teach responses: every context_block has exactly one "\\n", directly before the first citation, and no context-to-citation space join`, badNewline)
  check(blocks.filter((b) => !b.context).every((b) => b.context_block === undefined), `no context, no context_block (${blocks.filter((b) => !b.context).length} blocks)`)
  // The existing fields are unchanged: context is built from the entry exactly as before.
  const unchanged = withCtx.every((b) => {
    const e = entries[b.record_id]!.context!
    return e.kind === 'cited' && b.context!.text === e.text && JSON.stringify(b.context!.citations) === JSON.stringify(e.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text })))
  })
  check(unchanged, 'the existing context fields (text, citations, gradings) are unchanged')

  console.log(`\nWO#485: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
