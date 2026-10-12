/**
 * WO#417 (a Gem 10 condition) — two characters the published du'a payload
 * must not carry. Runs on data/duas.json straight after bundle-data.ts writes
 * it, so prebuild, prepublishOnly and the CI prepublish job all run it.
 *
 *   1. No U+2014 (em dash) in any string field of any du'a.
 *   2. No U+0671 (alef wasla) in `arabic` unless the record is labelled
 *      `origin: "quran"`. Alef wasla is Uthmani orthography; outside a
 *      Quranic record it suggests Quranic text that is not labelled as such.
 *   3. WO#418 (Gem 10 condition 4): no U+FDFA (the ﷺ ligature) in any field,
 *      and no "PBUH" (any case) or "SAW" (upper case; English "saw" is a
 *      word) as a whole word. The salutation is written out (CLAUDE.md).
 *
 * KNOWN_ALEF_WASLA pins the records that carry it: two permanent exceptions
 * (see the list's comment). The four 99-names records it held from 5 Oct 2026
 * were fixed by Gem 2 in WO#427 and removed.
 * The check fails if any other record carries it, and also if a pinned
 * record stops carrying it, so the list only shrinks on purpose.
 *
 * Run: npx tsx scripts/check-dua-chars.ts [path to duas.json]
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Architect ruling, WO#417 (5 Oct 2026):
//  - D00278 is a PERMANENT exception. It is a hadith (Ṣaḥīḥ Muslim 1342), so
//    it is not labelled Quranic, but its two Quranic passages are Tanzil's
//    Uthmani bytes (WO#413 ruling): the basmala (1:1, three U+0671) and the
//    quoted 43:13-14 (one U+0671). All four come from scripture, by design.
// Architect ruling, WO#427 (7 Oct 2026):
//  - D00229 is a PERMANENT exception. It is a supplication (allahs-names-duas),
//    so it is not labelled Quranic, but it quotes 10:62 after "fa-anta
//    al-qa'il:", and that quotation is Tanzil's Uthmani bytes from the
//    scripture module (getVerseArabic('10:62'), one U+0671), by design, as
//    for D00278.
//  - D00113, D00114, D00115 and D00118 (99-names) were removed here when Gem 2
//    fixed their Arabic (WO#427).
// Architect ruling, WO#432 (7 Oct 2026):
//  - D00241 is a PERMANENT exception. It is a supplication (repentance), so it
//    is not labelled Quranic, but its whole Arabic is two scripture-module
//    clauses joined with an Arabic comma: 3:173 "حسبنا الله ونعم الوكيل" and
//    8:40 "نعم المولى ونعم النصير" (getVerseClause, Tanzil's Uthmani bytes, three
//    U+0671), by design, as for D00229. Unlike 10:62, these clauses are NFC.
// Architect brief, WO#449 (10 Oct 2026), item 3:
//  - D00366 (quran-completion) and D00419 (powerful-duas) are PERMANENT
//    exceptions. Neither is labelled Quranic (each adds non-Quranic words: a
//    salawat; part of a supplication in al-Tabarani), but each carries a
//    Qur'anic span built from the scripture module, Tanzil's Uthmani bytes, by
//    design, as for D00278: D00366 words 1-11 are 2:201 from rabbana
//    (getVerseClause('2:201', 3)); D00419 words 1-45 are 3:26 from Allahumma to
//    the end of 3:27 (getVerseClause('3:26-27', 1)). D00286's span (112:3-4)
//    has no U+0671.
// Architect brief, WO#452 (10 Oct 2026), item 2:
//  - D00195 (allahs-names-duas) is a PERMANENT exception. It is a supplication
//    (the tahlil, a Qur'anic excerpt and a composed salawat), so it is not
//    labelled Quranic, but its words 24-35 are 59:24 from lahu l-asma'u
//    l-husna to the end of the verse, built from the scripture module
//    (getVerseClause('59:24', 5), Tanzil's Uthmani bytes, six U+0671), by
//    design, as for D00366 and D00419.
const KNOWN_ALEF_WASLA = ['D00195', 'D00229', 'D00241', 'D00278', 'D00366', 'D00419']

type Dua = Record<string, unknown> & { id: string; arabic?: string; origin?: string }

export function scan(duas: Dua[]) {
  const emDash: string[] = []
  const alefWasla: string[] = []
  const salutation: string[] = []
  for (const d of duas) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v !== 'string') continue
      if (v.includes('—')) emDash.push(`${d.id}.${k}`)
      if (v.includes('ﷺ') || /\bPBUH\b/i.test(v) || /\bSAW\b/.test(v)) salutation.push(`${d.id}.${k}`)
    }
    if (d.origin !== 'quran' && (d.arabic ?? '').includes('ٱ')) alefWasla.push(d.id)
  }
  return { emDash, alefWasla, salutation }
}

let passed = 0
let failed = 0
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`[PASS] ${label}`) } else { failed++; console.log(`[FAIL] ${label}`) }
}

// controls: the scan must see what it is meant to catch
const ctl = scan([
  { id: 'X1', arabic: 'ٱ', source: 'a — b' },
  { id: 'X2', arabic: 'ٱ', origin: 'quran' },
])
check(ctl.emDash.join() === 'X1.source' && ctl.alefWasla.join() === 'X1', 'control: an em dash and a non-Quranic alef wasla are caught; a Quranic one is not')
const sal = scan([
  { id: 'S1', translation: 'Muhammad \uFDFA said' },
  { id: 'S2', translation: 'the Prophet (pbuh) said' },
  { id: 'S3', source: 'Prophet Muhammad SAW' },
  { id: 'S4', translation: 'I saw the Prophet (peace be upon him)' },
])
check(sal.salutation.join() === 'S1.translation,S2.translation,S3.source', 'control: U+FDFA, PBUH and SAW are caught; the English word "saw" and the written salutation are not')

const file = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'duas.json')
const duas = JSON.parse(readFileSync(file, 'utf-8')) as Dua[]
check(duas.length > 400, `bundle read (${duas.length} du'as)`)

const { emDash, alefWasla, salutation } = scan(duas)
check(emDash.length === 0, `no U+2014 in any du'a field (${emDash.length}${emDash.length ? `: ${emDash.join(', ')}` : ''})`)
check(salutation.length === 0, `no U+FDFA, PBUH or SAW in any du'a field (${salutation.length}${salutation.length ? `: ${salutation.join(', ')}` : ''})`)
const unexpected = alefWasla.filter((id) => !KNOWN_ALEF_WASLA.includes(id))
const cleared = KNOWN_ALEF_WASLA.filter((id) => !alefWasla.includes(id))
check(unexpected.length === 0, `no U+0671 in non-Quranic arabic beyond the pinned list (new: ${unexpected.join(', ') || 'none'})`)
check(cleared.length === 0, `every pinned record still carries it; remove fixed ones from KNOWN_ALEF_WASLA (cleared: ${cleared.join(', ') || 'none'})`)
console.log(`  U+0671 in non-Quranic arabic today: ${alefWasla.length} (${alefWasla.join(', ')})`)

console.log(`\nWO#417/418 du'a characters: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
