/**
 * WO#418 B0 (report only) — the hadith references on Quran-labelled du'a
 * records, and which get_dua responses put a Ṣaḥīḥ al-Bukhārī / Ṣaḥīḥ Muslim
 * sourced Quran record beside a `not_recorded` record.
 *
 *  1. Every distinct `hadith_source` on a record with origin "quran" (the
 *     hadithRef toRecord derives from `source` or `countSource`), with its
 *     record count and ids, and whether it names Bukhārī or Muslim, in every
 *     spelling the corpus uses (listed, not assumed).
 *  2. For every category slug (every alias, synonym and phrase resolves to
 *     one), the real get_dua response: does it hold a Sahihayn-sourced Quran
 *     record AND a not_recorded record?
 *
 * Run (after bundle-data): npx tsx scripts/wo418-b0-hadith-refs.ts [out.md] [out.json]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { getDuaRecordById } from '../src/data/duas.js'

const DIR = path.dirname(fileURLToPath(import.meta.url))
type Bundled = { id: string; category: string; origin?: string; source?: string; countSource?: string }

async function main() {
  const [outMd, outJson] = process.argv.slice(2)
  const bundle = JSON.parse(readFileSync(path.join(DIR, '..', 'data', 'duas.json'), 'utf-8')) as Bundled[]
  const cats = (JSON.parse(readFileSync(path.join(DIR, '..', 'data', 'dua-categories.json'), 'utf-8')) as { slug: string }[]).map((c) => c.slug)

  // 1. distinct hadith refs on Quran-labelled records, as the server derives them
  const refs = new Map<string, string[]>()
  let quranRecords = 0
  for (const d of bundle) {
    const r = getDuaRecordById(d.id)
    if (!r || r.origin !== 'quran') continue
    quranRecords++
    if (!r.hadith_source) continue
    refs.set(r.hadith_source, [...(refs.get(r.hadith_source) ?? []), d.id])
  }
  // the spellings, found in the corpus rather than assumed: any ref whose
  // folded form contains "bukhar" or "muslim" is listed with its exact bytes
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const names = (s: string) => ({ bukhari: fold(s).includes('bukhar'), muslim: /\bmuslim\b/.test(fold(s)) })
  const rows = [...refs.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const spellings = [...new Set(rows.flatMap(([ref]) => [...ref.matchAll(/[ṢS]a[ḥh][iī]?[ḥh]\s+(?:al-)?\S+/g)].map((m) => m[0])))]

  // every spelling of the two collections anywhere in the corpus's source,
  // countSource and grading fields, with whether it sits on a Quran record
  const SPELL = /(?:[ṢS]a[ḥh][iīe]?[ḥh]?\s+(?:al-)?)?(?:Bukh[aā]r[iīy]?|Muslim)(?![\p{L}\p{M}])/gu
  const corpus = new Map<string, { n: number; quran: number }>()
  for (const d of bundle) for (const k of ['source', 'countSource', 'grading'] as const) {
    for (const m of String((d as any)[k] ?? '').matchAll(SPELL)) {
      const key = `${k}: ${m[0]}`
      const e = corpus.get(key) ?? { n: 0, quran: 0 }
      e.n++; if (d.origin === 'quran') e.quran++
      corpus.set(key, e)
    }
  }

  // per-record: the context it sits in, which field the hadith reference comes
  // from, and where the app shows it. Each render site is checked against the
  // app source here (file and line must still hold that code), so a moved line
  // fails the report instead of citing the wrong place.
  const APP = path.join(DIR, '..', '..')
  const site = (file: string, line: number, needle: string) => {
    const text = readFileSync(path.join(APP, file), 'utf-8').split('\n')[line - 1] ?? ''
    if (!text.includes(needle)) throw new Error(`${file}:${line} no longer holds ${needle}`)
    return `\`${file}:${line}\``
  }
  const LEAF = site('src/components/features/duas/single-dua-view.tsx', 199, 'source={dua.source}')
  const SHARE = site('src/components/features/duas/single-dua-view.tsx', 234, 'dua.source')
  const ROUTINE = site('src/components/features/adhkar/adhkar-routine.tsx', 297, 'source={currentDhikr.source}')
  const PAGES: Record<string, string> = {
    'morning-adhkar': `\`/adhkar/morning\`: ${site('src/app/[locale]/adhkar/morning/page.tsx', 51, 'dua.countSource ?? dua.practiceTime')} → ${ROUTINE}`,
    'evening-adhkar': `\`/adhkar/evening\`: ${site('src/app/[locale]/adhkar/evening/page.tsx', 41, 'dua.countSource ?? dua.practiceTime')} → ${ROUTINE}`,
  }
  const CARDS = [
    site('src/components/features/context-engine/ContextCard.tsx', 304, 'resolved.countSource ?? resolved.practiceTime'),
    site('src/components/features/context-engine/ContextCard.tsx', 359, 'd.countSource ?? d.practiceTime'),
    site('src/components/features/comfort/HighDistressView.tsx', 209, 'contextDua.countSource ?? contextDua.practiceTime'),
    site('src/app/[locale]/comfort/ComfortClient.tsx', 795, 'dua.countSource ?? dua.practiceTime'),
  ]
  const perRecord = bundle
    .filter((d) => getDuaRecordById(d.id)?.hadith_source)
    .filter((d) => getDuaRecordById(d.id)?.origin === 'quran')
    .map((d) => {
      const r = getDuaRecordById(d.id)!
      const from = d.source && !/qur/i.test(d.source) ? 'source' : 'countSource'
      const shown = from === 'countSource'
        ? [PAGES[d.category] ?? null, `comfort and context cards when they pick it (${CARDS.join(', ')})`].filter(Boolean).join('; ')
        : `the du'a leaf (${LEAF}) and share text (${SHARE})`
      return { id: d.id, context: d.category, quran: r.quran_citation, ref: r.hadith_source!, from, shown, leafShows: d.source ? `the leaf shows \`source\` = ${JSON.stringify(d.source)}, not this reference` : 'the record has no `source`, so the leaf shows no source line' }
    })

  // 2. every category response
  const mixed: { context: string; sahihayn: string[]; notRecorded: number; total: number }[] = []
  const sahihaynIds = new Set(rows.filter(([ref]) => names(ref).bukhari || names(ref).muslim).flatMap(([, ids]) => ids))
  for (const slug of cats) {
    const res: any = await getDuaHandler({ context: slug } as any)
    const duas: any[] = res.content?.duas ?? []
    if (!duas.length) continue
    const sah = duas.filter((x) => x.origin === 'quran' && x.hadith_source && (names(x.hadith_source).bukhari || names(x.hadith_source).muslim))
    const nr = duas.filter((x) => x.grading_status === 'not_recorded').length
    if (sah.length && nr) mixed.push({ context: slug, sahihayn: sah.map((x) => x.title), notRecorded: nr, total: duas.length })
  }

  const L: string[] = []
  L.push('## B0. Hadith references on Quran-labelled records (report only)')
  L.push('')
  L.push(`GENERATED by \`mcp-server/scripts/wo418-b0-hadith-refs.ts\` from the built bundle (${bundle.length} records; ${quranRecords} labelled \`origin: "quran"\`). The hadith reference is the server's own (\`hadith_source\`, derived by \`toRecord\` from \`source\` or \`countSource\`).`)
  L.push('')
  L.push(`**Spellings of the two collections in these references** (exact bytes, as the corpus has them): ${spellings.map((s) => `\`${s}\``).join(', ') || 'none'}.`)
  L.push('')
  L.push('**Every spelling of the two collections in the whole corpus** (`source`, `countSource`, `grading`; all 444 records):')
  L.push('')
  L.push('| field: spelling | occurrences | on Quran-labelled records |')
  L.push('|---|---|---|')
  for (const [k, e] of [...corpus.entries()].sort()) L.push(`| ${k} | ${e.n} | ${e.quran} |`)
  L.push('')
  L.push('| hadith reference | records | names Bukhārī | names Muslim | ids |')
  L.push('|---|---|---|---|---|')
  for (const [ref, ids] of rows) {
    const n = names(ref)
    L.push(`| ${ref} | ${ids.length} | ${n.bukhari ? 'yes' : ''} | ${n.muslim ? 'yes' : ''} | ${ids.map((i) => `\`${i}\``).join(', ')} |`)
  }
  L.push('')
  L.push('**Each Quran-labelled record with a hadith reference: its context, and where the app shows that reference** (for Gem 4 to check each citation against its practice):')
  L.push('')
  L.push('| id | context | Quran | hadith reference (field) | where the app shows the reference | the du\'a leaf |')
  L.push('|---|---|---|---|---|---|')
  for (const p of perRecord) L.push(`| \`${p.id}\` | \`${p.context}\` | ${p.quran} | ${p.ref} (\`${p.from}\`) | ${p.shown} | ${p.leafShows} |`)
  L.push('')
  L.push(`**Sahihayn-sourced Quran records:** ${sahihaynIds.size}.`)
  L.push('')
  L.push(`**get_dua contexts whose response holds a Sahihayn-sourced Quran record and a \`not_recorded\` record** (every category slug run through the real handler; every alias, synonym and phrase resolves to one of these): ${mixed.length}.`)
  L.push('')
  L.push('| context | Sahihayn-sourced Quran records | not_recorded records | records in response |')
  L.push('|---|---|---|---|')
  for (const m of mixed) L.push(`| \`${m.context}\` | ${m.sahihayn.join('; ')} | ${m.notRecorded} | ${m.total} |`)
  L.push('')
  if (outMd) writeFileSync(outMd, L.join('\n'))
  if (outJson) writeFileSync(outJson, JSON.stringify({ quranRecords, refs: rows.map(([ref, ids]) => ({ ref, ids, ...names(ref) })), spellings, corpusSpellings: Object.fromEntries(corpus), perRecord, mixed }, null, 1) + '\n')
  console.log(`quran-labelled ${quranRecords}; distinct hadith refs ${rows.length}; Sahihayn-sourced ${sahihaynIds.size}; mixed contexts ${mixed.length}`)
  if (!outMd) console.log(L.join('\n'))
}

main()
