#!/usr/bin/env node
/**
 * WO#444: what changes for an MCP caller when get_quran_verse and find_verses
 * switch from alquran.cloud's en.pickthall to the bundled, corrected Pickthall
 * (data/pickthall.json). For Gem 10, with the verse-end differences (Architect,
 * decision 2) reported apart from the word changes (the WO#442 corrections).
 *
 *   node scripts/pickthall-upstream-diff.mjs <upstream.json> <out-dir>
 *
 * <upstream.json> is alquran.cloud's /v1/quran/en.pickthall response body as
 * recorded (record-alquran-pickthall.mjs). Writes <out-dir>/pickthall-upstream-diff.md
 * and .json. Classes, per verse:
 *   identical    byte-equal
 *   end-only     equal once trailing punctuation, dashes and spaces are removed
 *   word change  anything else (expected: exactly the 83 WO#442 corrections and the
 *                Pickthall errata list, src/lib/quran/pickthall-errata.json, WO#494 Part 0)
 *
 * An erratum verse is expected only when the upstream reads the row's upstream
 * text and the bundle its corrected text; anything else there is unexpected.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const [upPath, outDir] = process.argv.slice(2)
if (!upPath || !outDir) throw new Error('usage: pickthall-upstream-diff.mjs <upstream.json> <out-dir>')
const up = JSON.parse(readFileSync(upPath, 'utf8'))
const bundle = JSON.parse(readFileSync(path.join(HERE, '..', 'data', 'pickthall.json'), 'utf8'))
const fixes = new Set()
for (const f of ['phase2a-applied.json', 'phase2b-applied.json']) {
  for (const r of JSON.parse(readFileSync(path.join(HERE, '..', '..', 'docs', 'wo442-data', f), 'utf8'))) fixes.add(r.key)
}
const errata = new Map(JSON.parse(readFileSync(path.join(HERE, '..', '..', 'src', 'lib', 'quran', 'pickthall-errata.json'), 'utf8')).errata.map((e) => [e.key, e]))
const isErratum = (k, theirs, ours) => errata.has(k) && errata.get(k).upstream === theirs && errata.get(k).corrected === ours
const upstream = {}
for (const s of up.data.surahs) for (const a of s.ayahs) upstream[`${s.number}:${a.numberInSurah}`] = a.text
const trimEnd = (t) => t.replace(/[\s.,;:!?"'”’\-–—]+$/u, '')
const rows = { identical: [], endOnly: [], word: [], missing: [] }
for (const [k, ours] of Object.entries(bundle.verses)) {
  const theirs = upstream[k]
  if (theirs === undefined) rows.missing.push(k)
  else if (theirs === ours) rows.identical.push(k)
  else if (trimEnd(theirs) === trimEnd(ours)) rows.endOnly.push({ key: k, upstreamEnd: theirs.slice(trimEnd(theirs).length), ours: ours.slice(trimEnd(ours).length) })
  else rows.word.push({ key: k, upstream: theirs, ours, wo442: fixes.has(k), erratum: isErratum(k, theirs, ours) })
}
const unexpected = rows.word.filter((r) => !r.wo442 && !r.erratum)
const errataNotDifferent = [...errata.keys()].filter((k) => !rows.word.some((r) => r.key === k && r.erratum))
const notChanged = [...fixes].filter((k) => !rows.word.some((r) => r.key === k))
const ends = {}
for (const r of rows.endOnly) ends[JSON.stringify(r.upstreamEnd)] = (ends[JSON.stringify(r.upstreamEnd)] ?? 0) + 1
mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'pickthall-upstream-diff.json'), JSON.stringify({ contentVersion: bundle.contentVersion, counts: { identical: rows.identical.length, endOnly: rows.endOnly.length, word: rows.word.length, missing: rows.missing.length }, endOnly: rows.endOnly, word: rows.word, unexpected: unexpected.map((r) => r.key), wo442NotDifferent: notChanged, errata: rows.word.filter((r) => r.erratum).map((r) => r.key), errataNotDifferent }, null, 1))
const md = [
  "# WO#444: get_quran_verse English, alquran.cloud's en.pickthall vs the bundled corrected Pickthall",
  '',
  `Bundle contentVersion \`${bundle.contentVersion}\`; ${Object.keys(bundle.verses).length} verses.`,
  '',
  '| Class | Verses |',
  '|---|---|',
  `| Identical | ${rows.identical.length} |`,
  `| Verse end only (punctuation, dash or space removed; decision 2) | ${rows.endOnly.length} |`,
  `| Word change | ${rows.word.length} (WO#442 corrections: ${rows.word.filter((r) => r.wo442).length}; errata: ${rows.word.filter((r) => r.erratum).length}; **neither: ${unexpected.length}**) |`,
  `| Missing upstream | ${rows.missing.length} |`,
  '',
  '## Verse-end differences, by what the upstream ends with',
  '',
  '| Upstream ending | Verses |',
  '|---|---|',
  ...Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([e, n]) => `| \`${JSON.parse(e)}\` | ${n} |`),
  '',
  '## Word changes',
  '',
  '| Verse | WO#442 or erratum | alquran.cloud | Bundled (served) |',
  '|---|---|---|---|',
  ...rows.word.map((r) => `| ${r.key} | ${r.wo442 ? 'WO#442' : r.erratum ? 'erratum' : '**no**'} | ${r.upstream.replace(/\|/g, '\\|')} | ${r.ours.replace(/\|/g, '\\|')} |`),
  '',
  notChanged.length ? `WO#442 rows with no word difference from the upstream: ${notChanged.join(', ')}` : 'Every WO#442 row differs from the upstream in its words.',
  errataNotDifferent.length ? `Errata not found as listed (upstream or bundle differs from the row): ${errataNotDifferent.join(', ')}` : 'Every erratum reads as listed: the upstream text upstream, the corrected text bundled.',
  '',
].join('\n')
writeFileSync(path.join(outDir, 'pickthall-upstream-diff.md'), md)
console.log(md.split('\n').slice(0, 12).join('\n'))
