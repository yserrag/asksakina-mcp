/**
 * WO#444: the MCP release's new behaviour, with a planted control for each.
 *
 *  1. The Pickthall rule (WO#421, shared with the app's prebuild guard)
 *     labels the bundle: the six planted rewordings fail, the real spans pass,
 *     and every Quran-labelled du'a is verified Pickthall.
 *  2. data/pickthall.json is the app's corrected Pickthall: 6,236 verses, the
 *     manifest's contentVersion, the WO#442 corrections, no verse-final
 *     punctuation (Architect, decision 2).
 *  3. get_quran_verse serves the bundled English, not the upstream's (9:129:
 *     "There is no God save Him"); a verse past the end of its surah is
 *     refused without an upstream call.
 *  4. Mixed du'as (Architect, ruling a) carry their Pickthall segments and the
 *     quran contract; other records do not.
 *  5. The ungraded directive through the real id-lookup path, on a planted
 *     record (Architect, ruling b: plantDuasForTest in duas.ts).
 *  6. The npm bin starts the server (WO#444 fix); `--stdio` serves MCP over
 *     stdio; without it the same bin, and `node dist/server.js` (the Fly
 *     image's command), serve HTTP.
 *  7. .mcp/server.json and the in-code server card: 440 du'as, stdio with the
 *     --stdio argument, one version everywhere.
 *
 * Needs dist/ (npm run build) and data/ (npm run bundle-data).
 * Run: npx tsx scripts/test-wo444.ts
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makePickthallRule } from '../../src/lib/scripture/pickthall-rule.js'
import { MIXED_DUA_SPANS } from '../../src/data/duas/quranic-spans-mixed.js'
import { bundledPickthall } from '../src/data/quran.js'
import { getQuranVerseHandler } from '../src/tools/get-quran-verse.js'
import { getDuaRecordById, gradingStatusById, plantDuasForTest, type BundledDua } from '../src/data/duas.js'
import { duaByIdResponse, quranContractFor } from '../src/tools/get-dua.js'
import { NO_EMOJI_RULE, UNGRADED_GRADING_DIRECTIVE } from '../src/contracts/presentation.js'
import { UNGRADED_SCOPE_HEAD } from '../src/contracts/gem4-wo418.js'
import { isEntryPoint } from '../src/server.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const MAIN = path.resolve(PKG, '..')
const DIST_SERVER = path.join(PKG, 'dist', 'server.js')

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
type Bundled = BundledDua & { quran_spans?: unknown[] }

// ---- 1. the rule -------------------------------------------------------------
function testRule() {
  console.log('\n=== 1. the WO#421 rule labels the bundle ===')
  const rule = makePickthallRule((s) => {
    const f = path.join(MAIN, 'public', 'quran', 'en.pickthall', `${s}.json`)
    if (!existsSync(f)) return null
    const d = readJson<{ verses: { verse_number: number; translations: { text: string }[] }[] }>(f)
    return new Map(d.verses.map((v) => [v.verse_number, v.translations[0].text]))
  })
  const k = (t: string, ref: string) => rule.classify(t, ref).klass
  const span9 = 'Allah sufficeth me. There is no God save Him. In Him have I put my trust, and He is Lord of the Tremendous Throne'
  check(k(span9, '9:129') === 'B', 'real 9:129 span (D00154): class B')
  check(k('My Lord! relieve my mind And ease my task for me', '20:25-26') === 'B', 'real 20:25-26 join (D00060): class B')
  const planted: [string, string, string][] = [
    ['" / " join', 'My Lord! relieve my mind / And ease my task for me', '20:25-26'],
    ['case-only reword', span9.replace('no God', 'no god'), '9:129'],
    ['mid-span punctuation', span9.replace('me. There', 'me, there'), '9:129'],
    ['span starting mid-word', span9.replace('Allah sufficeth', 'ah sufficeth'), '9:129'],
    ['word split', span9.replace('Tremendous', 'Tremen dous'), '9:129'],
    ['reworded letters', span9.replace('no God', 'no Allah'), '9:129'],
  ]
  for (const [name, text, ref] of planted) check(k(text, ref) === 'C', `planted ${name}: class C (refused a Pickthall label)`)
  const duas = readJson<Bundled[]>(path.join(PKG, 'data', 'duas.json'))
  const quran = duas.filter((d) => d.origin === 'quran')
  check(quran.length === 123 && quran.every((d) => d.translation_source === 'pickthall'), `all ${quran.length} Quran-labelled du'as verified Pickthall (123 expected)`, quran.filter((d) => d.translation_source !== 'pickthall').map((d) => d.id))
}

// ---- 2. the bundle -----------------------------------------------------------
function testBundle() {
  console.log('\n=== 2. data/pickthall.json ===')
  const b = readJson<{ contentVersion: string; verses: Record<string, string> }>(path.join(PKG, 'data', 'pickthall.json'))
  const manifest = readJson<{ contentVersion: string }>(path.join(MAIN, 'public', 'quran', 'manifest.json'))
  const keys = Object.keys(b.verses)
  check(keys.length === 6236, `6,236 verses (${keys.length})`)
  check(b.contentVersion === manifest.contentVersion, `contentVersion ${b.contentVersion} = the app manifest's`)
  const fixes = [
    ...readJson<{ key: string; proposed: string }[]>(path.join(MAIN, 'docs', 'wo442-data', 'phase2a-applied.json')),
    ...readJson<{ key: string; proposed: string }[]>(path.join(MAIN, 'docs', 'wo442-data', 'phase2b-applied.json')),
  ]
  check(fixes.length === 83 && fixes.every((f) => b.verses[f.key] === f.proposed), `all ${fixes.length} WO#442 corrections read their corrected text`)
  const punct = keys.filter((x) => /[.,;:!?]\s*$/.test(b.verses[x]))
  check(punct.length === 0, `no verse-final punctuation, as in the app (decision 2): ${punct.length} verses end in . , ; : ! ?`, punct.slice(0, 5))
}

// ---- 3. get_quran_verse --------------------------------------------------------
async function testVerse() {
  console.log('\n=== 3. get_quran_verse serves the bundled English ===')
  const realFetch = globalThis.fetch
  const requested: string[] = []
  // the upstream answers with its own (uncorrected) English, which must not be served
  globalThis.fetch = (async (url: string | URL) => {
    requested.push(String(url))
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    return new Response(
      JSON.stringify({ code: 200, data: [
        { number: 1, text: 'ARABIC', surah: { number: +m[1], name: 'SURAH-AR', englishName: 'Surah-En' } },
        { number: 1, text: 'UPSTREAM: There is no Allah save Him.' },
      ] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const r = (await getQuranVerseHandler({ surah: 9, ayah: 129 })) as unknown as { content: { translation: string; arabic_text: string; surah_name_english: string } }
    check(r.content.translation === bundledPickthall(9, 129) && r.content.translation.includes('There is no God save Him'), '9:129 serves the bundled corrected English ("There is no God save Him")', r.content)
    check(!r.content.translation.includes('UPSTREAM') && r.content.arabic_text === 'ARABIC' && r.content.surah_name_english === 'Surah-En', 'the upstream supplies only the Arabic and surah name')
    requested.length = 0
    const bad = (await getQuranVerseHandler({ surah: 1, ayah: 8 })) as unknown as { _sakina_meta: { content_type: string } }
    check(bad._sakina_meta.content_type !== 'quran_verse' && requested.length === 0, '1:8 (past the end of al-Fatiha) is refused with no upstream call', { type: bad._sakina_meta.content_type, requested })
  } finally {
    globalThis.fetch = realFetch
  }
}

// ---- 4. mixed du'as ----------------------------------------------------------
function testMixed() {
  console.log("\n=== 4. mixed du'as carry their Pickthall segments ===")
  const ids = [...new Set(MIXED_DUA_SPANS.map((m) => m.id))]
  for (const id of ids) {
    const r = getDuaRecordById(id)!
    const want = MIXED_DUA_SPANS.filter((m) => m.id === id)
    const ok =
      !r.origin &&
      r.quran_spans?.length === want.length &&
      want.every((m, i) => r.quran_spans![i].quran_citation === `Quran ${m.ref}` && r.quran_spans![i].translation === m.english && r.translation.includes(m.english)) &&
      want.every((m) => r.dua_block.includes(`Quran ${m.ref} (Translation of the Meaning (Pickthall): "${m.english}")`)) &&
      (quranContractFor([r]) as { quran?: { translator?: string } } | undefined)?.quran?.translator === 'Marmaduke Pickthall'
    check(ok, `${id}: quran_spans ${want.map((m) => m.ref).join(', ')}, a "Contains:" line, and the quran contract naming Pickthall; not labelled origin=quran`, r.quran_spans)
  }
  const plain = getDuaRecordById('D00255')!
  check(!plain.quran_spans && !plain.dua_block.includes('Contains:') && quranContractFor([plain]) === undefined, 'control: a hadith du\'a (D00255) has no quran_spans, no "Contains:" line and no quran contract')
}

// ---- 5. the ungraded directive, real path, planted record -------------------
function testUngraded() {
  console.log('\n=== 5. ungraded directive through duaByIdResponse (planted record) ===')
  const id = 'PLANTED-UNGRADED-WO444'
  type Resp = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; content: { duas?: { title: string; grading_directive?: string; grading_status?: string }[] } }
  const before = duaByIdResponse(id, 'en', [id]) as unknown as Resp
  check(before._sakina_meta.content_type === 'not_found', 'control: before planting, the id is not found')
  const bundled = readJson<BundledDua[]>(path.join(PKG, 'data', 'duas.json')).find((d) => d.id === 'D00255')!
  const { source: _s, grading: _g, countSource: _c, ...rest } = bundled
  const remove = plantDuasForTest([{ ...rest, id, name: 'Planted Ungraded Fixture' }])
  try {
    const r = duaByIdResponse(id, 'en', [id]) as unknown as Resp
    const d = r.content.duas?.[0]
    check(gradingStatusById(id) === 'not_recorded', 'the planted record reads not_recorded')
    check(
      d?.grading_status === 'not_recorded' && d.grading_directive === UNGRADED_GRADING_DIRECTIVE &&
        r._sakina_meta.llm_directives.CRITICAL_RULES.includes(`${UNGRADED_SCOPE_HEAD}(${d.title}): ${UNGRADED_GRADING_DIRECTIVE}`) &&
        !r._sakina_meta.llm_directives.CRITICAL_RULES.includes(UNGRADED_GRADING_DIRECTIVE),
      'by id: grading_directive on the record, and the CRITICAL_RULES copy scoped to its title, never bare',
      r,
    )
    const graded = duaByIdResponse('D00255', 'en', ['D00255']) as unknown as Resp
    check(!JSON.stringify(graded).includes(UNGRADED_GRADING_DIRECTIVE), 'control: the same record, graded (D00255), carries no ungraded directive')
  } finally {
    remove()
  }
  check(gradingStatusById(id) === undefined, 'the planted record is removed again')
  let refused = false
  try {
    plantDuasForTest([{ ...rest, id: 'D00255' }])
  } catch {
    refused = true
  }
  check(refused, 'control: planting a bundled id is refused')
}

// ---- 6. bin, stdio, HTTP -----------------------------------------------------
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string, ms = 8000): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (c) => (out += c))
    p.stderr.on('data', (c) => (err += c))
    const t = setTimeout(() => p.kill('SIGTERM'), ms)
    p.on('exit', (code) => {
      clearTimeout(t)
      resolve({ code, out, err })
    })
    if (stdin !== undefined) {
      p.stdin.write(stdin)
    }
  })
}

async function httpUp(cmd: string, args: string[], port: number): Promise<boolean> {
  const p = spawn(cmd, args, { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'ignore'] })
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok) return ((await res.json()) as { status?: string }).status === 'ok'
      } catch {
        // not listening yet
      }
    }
    return false
  } finally {
    p.kill('SIGTERM')
  }
}

async function testModes() {
  console.log('\n=== 6. the bin starts; --stdio serves stdio; HTTP unchanged ===')
  if (!existsSync(DIST_SERVER)) {
    check(false, 'dist/server.js exists (run npm run build first)')
    return
  }
  // an npm-style install: node_modules/.bin/sakina-mcp -> the package's dist/server.js
  const dir = mkdtempSync(path.join(tmpdir(), 'sakina-bin-'))
  try {
    mkdirSync(path.join(dir, '.bin'))
    const bin = path.join(dir, '.bin', 'sakina-mcp')
    symlinkSync(DIST_SERVER, bin)
    check(isEntryPoint(bin, pathToFileURL(DIST_SERVER).href), 'isEntryPoint: the bin symlink resolves to dist/server.js')
    check(`file://${bin}` !== pathToFileURL(DIST_SERVER).href, 'control: the unresolved comparison used before WO#444 is false for the bin (why 2.0.0 exited)')
    check(!isEntryPoint(path.join(dir, 'other.js'), pathToFileURL(DIST_SERVER).href), 'control: another script is not the entry point')

    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'wo444', version: '1' } } }
    const list = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    const msgs = [init, { jsonrpc: '2.0', method: 'notifications/initialized' }, list].map((m) => JSON.stringify(m)).join('\n') + '\n'
    const s = await run(bin, ['--stdio'], {}, msgs, 6000)
    const lines = s.out.split('\n').filter(Boolean)
    let parsed: { id?: number; result?: { serverInfo?: { name?: string }; tools?: { name: string }[] } }[] = []
    try {
      parsed = lines.map((l) => JSON.parse(l))
    } catch {
      parsed = []
    }
    const initRes = parsed.find((m) => m.id === 1)
    const tools = parsed.find((m) => m.id === 2)?.result?.tools?.map((t) => t.name).sort() ?? []
    check(initRes?.result?.serverInfo?.name === 'sakina-islamic-knowledge', 'bin --stdio: answers initialize over stdout', { out: s.out.slice(0, 300), err: s.err.slice(0, 300) })
    check(JSON.stringify(tools) === JSON.stringify(['find_verses', 'get_dua', 'get_name_of_allah', 'get_quran_verse']), `bin --stdio: tools/list returns the four tools (${tools.join(', ')})`)
    check(lines.length > 0 && parsed.length === lines.length, 'bin --stdio: every stdout line is a JSON-RPC message (logs go to stderr)', lines.slice(0, 3))

    check(await httpUp(bin, [], 3461), 'bin with no flag: HTTP server answers /health')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  check(await httpUp(process.execPath, [DIST_SERVER], 3462), 'node dist/server.js (the Fly image command): HTTP server answers /health, unchanged')
}

// ---- 7. registry card --------------------------------------------------------
async function testCard() {
  console.log('\n=== 7. .mcp/server.json and the in-code card ===')
  const card = readJson<{ description: string; version: string; packages: { version: string; transport: { type: string }; packageArguments?: { type: string; value?: string }[] }[] }>(path.join(PKG, '.mcp', 'server.json'))
  const pkg = readJson<{ version: string }>(path.join(PKG, 'package.json'))
  const duas = readJson<unknown[]>(path.join(PKG, 'data', 'duas.json'))
  const n = /(\d+) du'as/.exec(card.description)?.[1]
  check(Number(n) === duas.length && duas.length === 440, `description names ${n} du'as; the bundle holds ${duas.length} (440, Architect ruling d)`)
  const p = card.packages[0]
  check(p.transport.type === 'stdio' && p.packageArguments?.some((a) => a.type === 'positional' && a.value === '--stdio') === true, 'npm package: stdio transport with the --stdio argument')
  const serverSrc = readFileSync(path.join(PKG, 'src', 'server.ts'), 'utf-8')
  const codeVersion = /const SERVER_VERSION = '([^']+)'/.exec(serverSrc)?.[1]
  check(card.version === pkg.version && p.version === pkg.version && codeVersion === pkg.version, `one version everywhere (${pkg.version})`, { card: card.version, package: p.version, code: codeVersion })
  check(/packageArguments: \[\{ type: 'positional', value: '--stdio' \}\]/.test(serverSrc), 'the in-code server card declares the same --stdio argument')
}

// ---- 8. Gem 10 conditions (11 Oct) ------------------------------------------
// WO#454 turned the "Not a narration" directive on; its checks are in test:wo454.
function testGem10Conditions() {
  console.log('\n=== 8. Gem 10 conditions: 4a wording ===')
  check(NO_EMOJI_RULE === 'Do NOT use emojis or em dashes in your response.' && !/[\u2012-\u2015]/.test(NO_EMOJI_RULE), '4a: the rule reads Gem 10\'s wording and carries no dash character')
}

async function main() {
  testRule()
  testBundle()
  await testVerse()
  testMixed()
  testUngraded()
  await testModes()
  await testCard()
  testGem10Conditions()
  console.log(`\nWO#444: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
