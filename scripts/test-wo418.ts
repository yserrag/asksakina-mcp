/**
 * WO#418 — planted controls for each new egress behaviour. Each check must
 * fail on the code before WO#418 (proven in the SG report by running this
 * file against main's mcp-server).
 *
 *  A. Quran label: a Quran-labelled record with verified Pickthall English
 *     reads "Translation of the Meaning (Pickthall): "; one without reads
 *     "Translation of the Meaning: " (Architect: label by fact); a non-Quranic
 *     record keeps "Translation: ".
 *  A. quran contract: present (QURAN_CONTRACT fields) when a response returns
 *     a Quran record, absent when it returns none; translator named only when
 *     every Quran record in the response is verified Pickthall. All three
 *     get_dua paths (context, abuse-safe, id).
 *  B1. The response-level ungraded directive is scoped to the ungraded titles
 *     (Gem 4 Reply 2 item 1); the bare locked string is never a rule alone.
 *  C. The em dash rule string, on every tool that emits CRITICAL_RULES locally.
 *  E. D00143 and D00168: hadith_grading_status "graded", the Gem 4 compact
 *     grading line verbatim, and neither in the scoped directive.
 *
 * Run: npx tsx scripts/test-wo418.ts
 */

import { getDuaHandler, abuseResponse, duaByIdResponse, responseDirectivesFor, quranContractFor } from '../src/tools/get-dua.js'
import { getNameOfAllahHandler } from '../src/tools/get-name-of-allah.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getDuaRecordById, toRecord, type BundledDua } from '../src/data/duas.js'
import { QURAN_CONTRACT, UNGRADED_GRADING_DIRECTIVE } from '../src/contracts/presentation.js'
import * as gem4 from '../src/contracts/gem4-wo418.js'

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`[PASS] ${label}`) } else { failed++; console.log(`[FAIL] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const EM_RULE = 'Do NOT use emojis or em dashes in your response.' // WO#444 (Gem 10)
type R = { _sakina_meta: { presentation_contract: Record<string, any>; llm_directives: { CRITICAL_RULES: string[] } }; content: any }
const block = (id: string) => getDuaRecordById(id)?.dua_block ?? ''
const line = (b: string, head: string) => b.split('\n').find((l) => l.startsWith(head))

async function main() {
  // A. label
  check(!!line(block('D00143'), 'Translation of the Meaning (Pickthall): '), 'A label: D00143 (verified Pickthall) reads "Translation of the Meaning (Pickthall): "', block('D00143').split('\n')[2])
  // Since WO#441 every Quran-labelled record serves Pickthall, so the
  // not-Pickthall path is checked on a planted fixture: the bundled D00154
  // with its Pickthall mark removed, built by the real toRecord.
  const fs0 = await import('node:fs')
  const bundled = (JSON.parse(fs0.readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as BundledDua[]).find((d) => d.id === 'D00154')!
  check(bundled.translation_source === 'pickthall' && !!line(block('D00154'), 'Translation of the Meaning (Pickthall): '), 'A label: D00154 (Pickthall span since WO#441) reads "Translation of the Meaning (Pickthall): "', block('D00154').split('\n')[2])
  const { translation_source: _drop, ...unmarked } = bundled
  void _drop
  const notPickthall = toRecord({ ...unmarked, id: 'PLANTED-NOT-PICKTHALL', translation: 'Planted English that is not Pickthall' })
  check(!!line(notPickthall.dua_block, 'Translation of the Meaning: ') && !notPickthall.dua_block.includes('(Pickthall)'), 'A label (planted fixture): a Quran record without verified Pickthall reads "Translation of the Meaning: " with no Pickthall claim', notPickthall.dua_block.split('\n')[2])
  check(!!line(block('D00242'), 'Translation: '), 'A label: D00242 (not Quranic) keeps "Translation: "', block('D00242').split('\n')[2])

  // A. contract, every path
  const morning = (await getDuaHandler({ context: 'morning' } as any)) as unknown as R
  const gratitude = (await getDuaHandler({ context: 'gratitude' } as any)) as unknown as R
  const fasting = (await getDuaHandler({ context: 'fasting' } as any)) as unknown as R
  const q = (r: R) => r._sakina_meta.presentation_contract.quran
  const base = Object.entries(QURAN_CONTRACT).every(([k, v]) => q(morning)?.[k] === v)
  check(base && q(morning).translator === 'Marmaduke Pickthall', 'A contract (context path): morning carries QURAN_CONTRACT and names the translator (D00154/D00179 Pickthall since WO#441)', q(morning))
  const mixed = quranContractFor([getDuaRecordById('D00154')!, notPickthall]) as { quran: Record<string, unknown> } | undefined
  check(!!mixed && Object.entries(QURAN_CONTRACT).every(([k, v]) => mixed.quran[k] === v) && mixed.quran.translator === undefined, 'A contract (planted fixture): a Pickthall record with a not-Pickthall Quran record carries QURAN_CONTRACT and no translator', mixed)
  check(q(gratitude)?.translator === 'Marmaduke Pickthall' && q(gratitude)?.translation_label === QURAN_CONTRACT.translation_label, 'A contract (context path): gratitude (all Pickthall) names the translator', q(gratitude))
  check(q(fasting) === undefined && !!fasting._sakina_meta.presentation_contract.hadith, 'A contract (context path): fasting returns no Quran record, so no quran contract (hadith kept)', fasting._sakina_meta.presentation_contract)
  const byIdQ = duaByIdResponse('D00143', 'en', ['D00143']) as unknown as R
  const byIdH = duaByIdResponse('D00498', 'en', ['D00498']) as unknown as R
  check(q(byIdQ)?.translator === 'Marmaduke Pickthall' && q(byIdH) === undefined, 'A contract (id path): D00143 carries it with the translator; D00498 (hadith) does not', [q(byIdQ), q(byIdH)])
  const abuseQ = abuseResponse('abuse', undefined, ['D00143']) as unknown as R
  const abuseH = abuseResponse('abuse', undefined, ['D00498']) as unknown as R
  check(q(abuseQ)?.translator === 'Marmaduke Pickthall' && q(abuseH) === undefined, 'A contract (abuse-safe path): present with a Quran record, absent without', [q(abuseQ), q(abuseH)])

  // B1. scoped directive, on a planted fixture (WO#435): one graded record and
  // one ungraded record, built from real bundle records, so the check never
  // depends on a category that a later audit batch grades in full (WO#433
  // emptied repentance, WO#435 most of batch 3). responseDirectivesFor is the
  // function every get_dua path uses for CRITICAL_RULES.
  const graded = getDuaRecordById('D00457')!
  check(!!graded && graded.grading_status !== 'not_recorded' && graded.grading_directive !== UNGRADED_GRADING_DIRECTIVE, 'B1 fixture: D00457 is a graded record (instrument check)', graded?.grading_status)
  const ungraded = { ...graded, id: 'PLANTED-UNGRADED', title: 'Planted Ungraded Fixture', grading_status: 'not_recorded' as const, grading_directive: UNGRADED_GRADING_DIRECTIVE }
  const rules = responseDirectivesFor([graded, ungraded])
  const scoped = `${gem4.UNGRADED_SCOPE_HEAD}(${ungraded.title}): ${UNGRADED_GRADING_DIRECTIVE}`
  check(rules.includes(scoped) && !rules.includes(UNGRADED_GRADING_DIRECTIVE), 'B1: a response mixing a graded and an ungraded record carries the directive scoped to the ungraded title, never bare', rules)
  check(!rules.some((x) => x.includes(graded.title)), 'B1: the scoped directive does not name the graded record', rules)
  const bare = [UNGRADED_GRADING_DIRECTIVE]
  check(!(bare.includes(scoped) && !bare.includes(UNGRADED_GRADING_DIRECTIVE)), 'B1 control: a bare directive (the pre-WO#418 shape) fails the scoped check')
  check(responseDirectivesFor([graded]).every((x) => x !== UNGRADED_GRADING_DIRECTIVE && !x.startsWith(gem4.UNGRADED_SCOPE_HEAD)), 'B1 control: a graded record alone gets no ungraded directive')
  // the same through the live context path, where a mixed category still exists
  const fs = await import('node:fs')
  const slugs = (JSON.parse(fs.readFileSync(new URL('../data/dua-categories.json', import.meta.url), 'utf-8')) as { slug: string }[]).map((c) => c.slug)
  for (const slug of slugs) {
    const r = (await getDuaHandler({ context: slug } as any)) as unknown as R
    const duas = (r.content?.duas ?? []) as any[]
    if (!(duas.some((d) => d.grading_status === 'not_recorded') && duas.some((d) => d.grading_status !== 'not_recorded'))) continue
    const titles = [...new Set(duas.filter((d) => d.grading_status === 'not_recorded').map((d) => d.title))]
    const cr = r._sakina_meta.llm_directives.CRITICAL_RULES
    check(cr.includes(`${gem4.UNGRADED_SCOPE_HEAD}(${titles.join(', ')}): ${UNGRADED_GRADING_DIRECTIVE}`) && !cr.includes(UNGRADED_GRADING_DIRECTIVE), `B1 (context path, ${slug}): CRITICAL_RULES scoped, never bare`)
    break
  }

  // C. em dash rule on every locally answerable tool
  const name = (await getNameOfAllahHandler({ name: 'Ar-Rahman' } as any)) as unknown as R
  const verses = (await findVersesHandler({ query: 'patience' } as any)) as unknown as R
  for (const [label, r] of [['get_dua', morning], ['get_name_of_allah', name], ['find_verses', verses]] as const) {
    const cr = r._sakina_meta.llm_directives.CRITICAL_RULES
    check(cr.includes(EM_RULE) && !cr.includes('Do NOT use emojis in your response.'), `C: ${label} CRITICAL_RULES carries the em dash rule (and not the old string)`, cr.filter((x) => /emoji/i.test(x)))
  }

  // E. Ayat al-Kursi morning and evening
  for (const id of ['D00143', 'D00168']) {
    const rec = getDuaRecordById(id)!
    check(rec.hadith_source === gem4.AYAT_AL_KURSI_PRACTICE_REF, `E: ${id} hadith_source is Gem 4's reference`, rec.hadith_source)
    check(rec.hadith_grading_status === 'graded', `E: ${id} hadith_grading_status is "graded"`, rec.hadith_grading_status)
    check(line(rec.dua_block, 'Grading: ') === gem4.AYAT_AL_KURSI_PRACTICE_GRADING_LINE, `E: ${id} dua_block grading line is Gem 4's compact variant, verbatim`, line(rec.dua_block, 'Grading: '))
    check(!rec.dua_block.includes('Muslim 810') && !rec.dua_block.includes('not recorded'), `E: ${id} dua_block no longer cites Muslim 810 or "not recorded"`)
  }
  const evening = (await getDuaHandler({ context: 'evening' } as any)) as unknown as R
  for (const [ctx, r] of [['morning', morning], ['evening', evening]] as const) {
    const s = r._sakina_meta.llm_directives.CRITICAL_RULES.find((x) => x.startsWith(gem4.UNGRADED_SCOPE_HEAD)) ?? ''
    // WO#424: morning and evening now have no ungraded record, so no scoped
    // directive at all; where one is present it must not name Ayat al-Kursi
    check(!/ayat al[- ]kursi/i.test(s), `E: ${ctx} scoped directive (${s ? 'present' : 'absent'}) does not name Ayat al-Kursi`, s.slice(0, 120))
  }

  // WO#420: D00317 (3:194) and D00271 (13:28) now carry the whole verse; they
  // must still be verified Pickthall and labelled so
  const { readFileSync } = await import('node:fs')
  const bundle = JSON.parse(readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as { id: string; translation: string; translation_source?: string }[]
  for (const [id, ref] of [['D00317', '3:194'], ['D00271', '13:28']] as const) {
    const [su, ay] = ref.split(':').map(Number)
    const verse = (JSON.parse(readFileSync(new URL(`../../public/quran/en.pickthall/${su}.json`, import.meta.url), 'utf-8')) as { verses: { verse_number: number; translations: { text: string }[] }[] }).verses.find((v) => v.verse_number === ay)!.translations[0].text
    const b = bundle.find((d) => d.id === id)!
    check(b.translation === verse && b.translation_source === 'pickthall', `WO#420: ${id} bundles the whole verbatim ${ref} with translation_source "pickthall"`, [b.translation_source, b.translation.slice(0, 60)])
    check(line(block(id), 'Translation of the Meaning (Pickthall): ') === `Translation of the Meaning (Pickthall): ${verse}`, `WO#420: ${id} dua_block labels the whole verse "(Pickthall)"`, block(id).split('\n')[2]?.slice(0, 80))
  }

  console.log(`\nWO#418 egress armour: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
