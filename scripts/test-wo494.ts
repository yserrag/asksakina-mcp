/**
 * WO#494 Part 0: MCP 2.4.2 serves Pickthall 31:14 "concerning his parents"
 * (the errata list, src/lib/quran/pickthall-errata.json; docs/pickthall-errata.md).
 *
 *  1. data/pickthall.json reads the corrected 31:14, under the app manifest's
 *     contentVersion, and the other 6,235 verses are byte-identical to the
 *     bundle before the erratum (the same sha256 the app's prebuild test pins).
 *  2. get_quran_verse 31:14 serves "parents" while the upstream answers
 *     "partners" (control: the stub really carries "partners").
 *  3. pickthall-upstream-diff counts the erratum as an expected word change,
 *     not an unexpected one, against an upstream that differs only there.
 *
 * Needs data/ (npm run bundle-data).
 * Run: npx tsx scripts/test-wo494.ts
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getQuranVerseHandler } from '../src/tools/get-quran-verse.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const MAIN = path.resolve(PKG, '..')

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) {
    passed++
    console.log(`[PASS] ${label}`)
  } else {
    failed++
    console.log(`[FAIL] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, 'utf-8')) as T
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const byKey = (a: string, b: string) => {
  const [x, y] = [a, b].map((k) => k.split(':').map(Number))
  return x[0]! - y[0]! || x[1]! - y[1]!
}

type Erratum = { key: string; upstream: string; corrected: string }
const ERRATA = readJson<{ errata: Erratum[] }>(path.join(MAIN, 'src', 'lib', 'quran', 'pickthall-errata.json')).errata
const E = ERRATA.find((e) => e.key === '31:14')!
const bundle = readJson<{ contentVersion: string; verses: Record<string, string> }>(path.join(PKG, 'data', 'pickthall.json'))

function testBundle() {
  console.log('\n=== 1. data/pickthall.json ===')
  const manifest = readJson<{ contentVersion: string }>(path.join(MAIN, 'public', 'quran', 'manifest.json'))
  check(bundle.contentVersion === manifest.contentVersion && bundle.contentVersion === 'quran-2026-10-24-wo494p0', `contentVersion ${bundle.contentVersion} = the app manifest's`)
  check(bundle.verses['31:14'] === E.corrected && E.corrected.includes('concerning his parents'), '31:14 reads "concerning his parents"', bundle.verses['31:14'])
  const others = Object.keys(bundle.verses).filter((k) => !ERRATA.some((e) => e.key === k)).sort(byKey)
  const h = sha(others.map((k) => `${k}\t${bundle.verses[k]}\n`).join(''))
  check(others.length === 6235 && h === 'd8c16ccfadf1a7d44ed1ab337bce737960cae19fb8077157ddb2960c9a84143e', 'the other 6,235 verses are byte-identical to before (sha256 d8c16ccf…)', { n: others.length, h })
}

async function testVerse() {
  console.log('\n=== 2. get_quran_verse 31:14 ===')
  const realFetch = globalThis.fetch
  let upstreamServed = ''
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    upstreamServed = `${m[1]}:${m[2]}` === E.key ? E.upstream : `upstream ${m[1]}:${m[2]}`
    return new Response(
      JSON.stringify({ code: 200, data: [
        { number: 1, text: 'ARABIC', surah: { number: +m[1]!, name: 'SURAH-AR', englishName: 'Luqman' } },
        { number: 1, text: upstreamServed },
      ] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const r = (await getQuranVerseHandler({ surah: 31, ayah: 14 })) as unknown as { content: { translation: string } }
    check(upstreamServed.includes('concerning his partners'), 'control: the stubbed upstream answers "partners"')
    check(r.content.translation === E.corrected, 'get_quran_verse 31:14 serves "concerning his parents"', r.content)
  } finally {
    globalThis.fetch = realFetch
  }
}

function testUpstreamDiff() {
  console.log('\n=== 3. pickthall-upstream-diff ===')
  const dir = mkdtempSync(path.join(tmpdir(), 'wo494-'))
  try {
    const wo442 = new Set(
      ['phase2a-applied.json', 'phase2b-applied.json'].flatMap((f) => readJson<{ key: string; ours: string }[]>(path.join(MAIN, 'docs', 'wo442-data', f)).map((r) => [r.key, r.ours] as const)).map(([k]) => k),
    )
    const rows = new Map(['phase2a-applied.json', 'phase2b-applied.json'].flatMap((f) => readJson<{ key: string; ours: string }[]>(path.join(MAIN, 'docs', 'wo442-data', f)).map((r) => [r.key, r.ours] as const)))
    // an upstream that is the bundle, except the WO#442 verses (their upstream text) and the erratum's
    const surahs: { number: number; ayahs: { numberInSurah: number; text: string }[] }[] = []
    for (const k of Object.keys(bundle.verses).sort(byKey)) {
      const [s, a] = k.split(':').map(Number) as [number, number]
      if (!surahs[s - 1]) surahs[s - 1] = { number: s, ayahs: [] }
      const text = k === E.key ? E.upstream : wo442.has(k) ? rows.get(k)! : bundle.verses[k]!
      surahs[s - 1]!.ayahs.push({ numberInSurah: a, text })
    }
    const up = path.join(dir, 'up.json')
    writeFileSync(up, JSON.stringify({ data: { surahs } }))
    execFileSync('node', [path.join(HERE, 'pickthall-upstream-diff.mjs'), up, dir], { stdio: 'pipe' })
    const out = readJson<{ unexpected: string[]; errata: string[]; errataNotDifferent: string[]; counts: { word: number } }>(path.join(dir, 'pickthall-upstream-diff.json'))
    check(out.unexpected.length === 0 && out.errata.includes('31:14') && out.errataNotDifferent.length === 0, 'the erratum is an expected word change; nothing is unexpected', out)
    check(out.counts.word === 84, `84 word changes: 83 WO#442 + 1 erratum (${out.counts.word})`)
    // control: an upstream 31:14 that is not the row's upstream text is unexpected
    const s31 = surahs[30]!.ayahs.find((x) => x.numberInSurah === 14)!
    s31.text = E.upstream.replace('partners', 'partner')
    writeFileSync(up, JSON.stringify({ data: { surahs } }))
    execFileSync('node', [path.join(HERE, 'pickthall-upstream-diff.mjs'), up, dir], { stdio: 'pipe' })
    const bad = readJson<{ unexpected: string[]; errataNotDifferent: string[] }>(path.join(dir, 'pickthall-upstream-diff.json'))
    check(bad.unexpected.includes('31:14') && bad.errataNotDifferent.includes('31:14'), 'control: a different upstream 31:14 is reported unexpected', bad)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  testBundle()
  await testVerse()
  testUpstreamDiff()
  console.log(`\nWO#494 Part 0 (MCP 2.4.2): ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main()
