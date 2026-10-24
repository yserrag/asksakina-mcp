/**
 * WO#484: MCP 2.3.0, teaching batch 2 (38 entries, approved 21 Oct 2026).
 * The approved content is archived as docs/wo484-batch2-entries.json; the
 * sign-offs are in docs/wo484-architect.md.
 *
 *   A. entries.ts holds the 38 records, each field equal to the approved file
 *      (key word, root, gloss, context and citations, reflection, related);
 *      a record with no approved context has no Field 2;
 *   B. Arabic: every key word is in its record's bundled Arabic byte for byte
 *      (the scripture module's Tanzil text, or the Name's Arabic), every teach
 *      verse is in the module, and entries.ts carries Arabic only as \u escapes;
 *   C. every entry validates (the bundle-data lookups), and a changed word is
 *      refused (control);
 *   D. no em dash, no U+FDFA, no "SAW" or "PBUH" in any entry;
 *   E. the release gate: batch 2 carries the delegated Gem 10 sign-off (22 Oct
 *      2026), so the gate passes for all 44; without it, it refuses exactly
 *      the 38 (control);
 *   F. the three Architect citation corrections and Gem 3's 112:3 rewording;
 *   G. served: the teach blocks attach on the eval records; a soft-block or
 *      grief call carries no teach.
 *
 * Run: npm run bundle-data && npm run test:wo484
 */

import { readFileSync } from 'node:fs'
import { namesOfAllah } from '../../src/lib/data/99-names.js'
import { SURAHS } from '../../src/lib/data/quran-metadata.js'
import { getVerseArabic } from '../../src/lib/scripture/index.js'
import { gradingStatusById, getDuaRecordById } from '../src/data/duas.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import type { TeachEntry } from '../src/teach/types.js'
import { publishGateErrors, validateTeachEntries, type TeachLookups } from '../src/teach/validate.js'

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

type Approved = {
  record: string
  key_word: { arabic: string; transliteration: string }
  root: string
  root_transliteration: string
  gloss: string
  related: string[]
  reflection: string
  context?: { text: string; citations: Array<{ text: string; grading?: string }> }
}
const APPROVED = JSON.parse(readFileSync(new URL('../../docs/wo484-batch2-entries.json', import.meta.url), 'utf-8')) as Approved[]
const ENTRIES = TEACH_ENTRIES as Readonly<Record<string, TeachEntry>>
/** Gem 10, delegated: the Architect on the Founder's delegation (docs/wo484-architect.md, 22 Oct 2026). */
const DELEGATED_GEM10 = [{ gem: 10, ruling: 'WO#484 delegated PASS (Architect)', date: '2026-10-22' }]
const entry = (k: string) => ENTRIES[k]!

const lookups: TeachLookups = {
  duaStatus: gradingStatusById,
  verseExists: (ref) => {
    const m = /^(\d+):(\d+)$/.exec(ref)
    const surah = m ? SURAHS.find((x) => x.id === Number(m[1])) : undefined
    return !!surah && Number(m![2]) >= 1 && Number(m![2]) <= surah.versesCount
  },
  nameExists: (n) => namesOfAllah.some((x) => x.number === n),
  glossaryHas: () => false,
  recordArabic: (e) => {
    const r = e.record
    if (r.kind === 'dua') return getDuaRecordById(r.id)?.arabic
    if (r.kind === 'name') return namesOfAllah.find((x) => x.number === r.number)?.arabic
    return getVerseArabic(r.ref)
  },
}

async function main() {
  console.log('=== A. the 38 records, field by field ===')
  check(APPROVED.length === 38 && new Set(APPROVED.map((a) => a.record)).size === 38, 'the approved file holds 38 distinct records')
  const missing = APPROVED.filter((a) => !ENTRIES[a.record])
  check(missing.length === 0, 'every approved record has an entry', missing.map((a) => a.record))
  const mapRef = (r: string) => {
    const [kind, ...rest] = r.split(':')
    return kind === 'verse' ? { kind: 'verse', ref: rest.join(':') } : { kind: 'name', number: Number(rest[0]) }
  }
  for (const a of APPROVED) {
    const e = entry(a.record)
    if (!e) continue
    const diffs: string[] = []
    const w = e.key_word.words
    if (w.length !== 1 || w[0]!.arabic !== a.key_word.arabic || w[0]!.transliteration !== a.key_word.transliteration) diffs.push('key word')
    if (e.key_word.root !== a.root || e.key_word.root_transliteration !== a.root_transliteration) diffs.push('root')
    if (e.key_word.gloss !== a.gloss) diffs.push('gloss')
    if (e.reflection.text !== a.reflection) diffs.push('reflection')
    if (JSON.stringify(e.related?.refs) !== JSON.stringify(a.related.map(mapRef))) diffs.push('related')
    const ctx = (e as { context?: { kind: string; text: string; citations: unknown } }).context
    if (a.context) {
      if (!ctx || ctx.kind !== 'cited' || ctx.text !== a.context.text) diffs.push('context text')
      // A grading only where one is given: the approved citation objects, key for key.
      if (JSON.stringify(ctx?.citations) !== JSON.stringify(a.context.citations)) diffs.push('citations')
    } else if (ctx !== undefined) diffs.push('a Field 2 the approved record does not have')
    if (e.locale !== 'en' || e.misconception || e.by_audience) diffs.push('locale, Field 3 or variants')
    const sig = (s: readonly { gem: number; date: string }[] | undefined, gem: number) => (s ?? []).length === 1 && s![0]!.gem === gem && s![0]!.date === '2026-10-21'
    if (!sig(e.key_word.reviewedBy, 2) || !sig(e.related?.reviewedBy, 2) || !sig(e.reflection.reviewedBy, 3) || (ctx && !sig((ctx as { reviewedBy?: { gem: number; date: string }[] }).reviewedBy, 4))) diffs.push('sign-offs')
    if (JSON.stringify(e.publishReviewedBy) !== JSON.stringify(DELEGATED_GEM10)) diffs.push('publishReviewedBy is not the delegated Gem 10 sign-off')
    check(diffs.length === 0, `${a.record}: equal to the approved record (${a.context ? 'with' : 'no'} Field 2), Gem 2 / 4 / 3 sign-offs, the delegated Gem 10 sign-off`, diffs)
  }
  check(APPROVED.filter((a) => !a.context).length === 20 && APPROVED.filter((a) => !a.context).every((a) => !(entry(a.record) as { context?: unknown }).context), 'the 20 records with no approved context carry no Field 2')

  console.log('\n=== B. Arabic ===')
  for (const a of APPROVED) {
    const e = entry(a.record)
    const text = lookups.recordArabic!(e)!
    check(text.includes(e.key_word.words[0]!.arabic), `${a.record}: the key word is in the record's bundled Arabic byte for byte (${e.record.kind === 'verse' ? 'scripture module' : 'Names data'})`)
  }
  const verses = Object.values(ENTRIES).filter((e) => e.record.kind === 'verse')
  const notInModule = verses.filter((e) => {
    try {
      getVerseArabic((e.record as { ref: string }).ref)
      return false
    } catch {
      return true
    }
  })
  check(notInModule.length === 0, `all ${verses.length} teach verses are in the scripture module (1:3, 1:4, 1:5 and 1:7 included)`, notInModule.map((e) => e.record))
  const source = readFileSync(new URL('../src/teach/entries.ts', import.meta.url), 'utf-8')
  check(!/[؀-ۿࢠ-ࣿﭐ-﻿]/.test(source), 'entries.ts holds no raw Arabic character: every Arabic string is \\u escapes')

  console.log('\n=== C. validation ===')
  const errors = validateTeachEntries(ENTRIES, lookups)
  check(errors.length === 0, `all ${Object.keys(ENTRIES).length} entries validate (batch 1 and batch 2)`, errors)
  const k = 'verse:1:1'
  const altered = { [k]: { ...entry(k), key_word: { ...entry(k).key_word, words: [{ ...entry(k).key_word.words[0]!, arabic: entry(k).key_word.words[0]!.arabic.normalize('NFD') + 'ْ' }] } } } as unknown as Record<string, TeachEntry>
  check(validateTeachEntries(altered, lookups).some((e) => /Field 1 word is not in the record's Arabic/.test(e)), 'control: a changed key word is refused')

  console.log('\n=== D. content rules ===')
  const strings: string[] = []
  const walk = (v: unknown) => (typeof v === 'string' ? strings.push(v) : Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : undefined)
  walk(ENTRIES)
  check(!strings.some((s) => s.includes('—')), `no em dash in any of ${strings.length} entry strings`)
  check(!strings.some((s) => s.includes('ﷺ')), 'no U+FDFA')
  check(!strings.some((s) => /\b(SAW|PBUH)\b/i.test(s)), 'no "SAW" or "PBUH"')

  console.log('\n=== E. the release gate ===')
  // WO#495 added verse:2:256, pending its own Gem 10 review (test-teach, test-wo495); these are the 44 before it.
  const w484 = Object.fromEntries(Object.entries(ENTRIES).filter(([k]) => k !== 'verse:2:256'))
  check(publishGateErrors(w484).length === 0 && Object.keys(w484).length === 44, 'the release gate passes for all 44 entries (batch 2: the delegated Gem 10 sign-off, 22 Oct 2026)', publishGateErrors(w484))
  const unsigned = Object.fromEntries(APPROVED.map((a) => [a.record, { ...entry(a.record), publishReviewedBy: [] }]))
  const refused = publishGateErrors(unsigned as unknown as Record<string, TeachEntry>).map((e) => e.replace(/: entry \(publish\) lacks sign-off from Gem 10$/, ''))
  check(JSON.stringify(refused.sort()) === JSON.stringify(APPROVED.map((a) => a.record).sort()), 'control: without that sign-off, the gate refuses exactly the 38 batch 2 entries')

  console.log('\n=== F. corrections ===')
  const cites = (key: string) => ((entry(key) as { context?: { citations: Array<{ text: string; grading?: string }> } }).context?.citations ?? [])
  check(cites('name:3').some((c) => c.text === 'Sahih al-Bukhari 4812') && !cites('name:3').some((c) => c.text.includes('7374')), 'name:3 cites Sahih al-Bukhari 4812, not 7374')
  check(cites('verse:113:1').some((c) => c.text === 'Sunan Abi Dawud 5082' && c.grading === 'Hasan, al-Albani'), 'Sunan Abi Dawud 5082 is Hasan (al-Albani)')
  check(cites('verse:114:1').some((c) => c.text === "Sunan an-Nasa'i 5428" && c.grading === 'Hasan, Darussalam'), "Sunan an-Nasa'i 5428 is Hasan (Darussalam)")
  check(/\bunderstand\b/.test(entry('verse:112:3').reflection.text) && !/picture/i.test(entry('verse:112:3').reflection.text), '112:3: Gem 3\'s rewording ("understand", not "picture")')

  console.log('\n=== G. served ===')
  {
    globalThis.fetch = (async (url: string | URL) => {
      const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
      if (!m) return new Response('{"code":404}', { status: 404 })
      return new Response(JSON.stringify({ code: 200, data: [{ number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) }, { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
    const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
    const { getDuaHandler } = await import('../src/tools/get-dua.js')
    const teachOf = (r: unknown): Array<{ record_id: string }> => {
      const out: Array<{ record_id: string }> = []
      const w = (v: unknown) => {
        if (Array.isArray(v)) return v.forEach(w)
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>
          if (o.teach && typeof o.teach === 'object') out.push(o.teach as { record_id: string })
          Object.values(o).forEach(w)
        }
      }
      w(r)
      return out
    }
    for (const [s, a] of [[1, 1], [2, 255], [112, 1], [113, 1], [94, 5]] as const) {
      const t = teachOf(await getQuranVerseHandler({ surah: s, ayah: a }))
      check(t.length === 1 && t[0]!.record_id === `verse:${s}:${a}`, `get_quran_verse ${s}:${a}: one teach block`)
    }
    for (const n of [3, 9]) {
      const t = teachOf(await getNameOfAllahHandler({ number: n }))
      check(t.length === 1 && t[0]!.record_id === `name:${n}`, `get_name_of_allah ${n}: one teach block`)
    }
    for (const q of ['anxiety', 'grief', 'my father died']) {
      const r = (await getDuaHandler({ context: q })) as { crisis_resource?: unknown }
      check(teachOf(r).length === 0 && r.crisis_resource !== undefined, `get_dua "${q}": a support block and no teach`)
    }
    check(teachOf(await getQuranVerseHandler({ surah: 1, ayah: 1, locale: 'ur' })).length === 0, 'control: a non-en locale gets no teach (entries are English only)')
  }

  console.log(`\nWO#484: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
