#!/usr/bin/env node
/**
 * Publish guards: negative content checks run before npm publish
 * (Gem 10 conditions on 1.4.0, WO#377). Plain Node, no dependencies beyond
 * the package's own dist/ and the MCP SDK, so the deploy workflow can run it
 * after `npm run build`.
 *
 *   node scripts/publish-guards.mjs [--root DIR] [--report]
 *   node scripts/publish-guards.mjs --live URL [--report]
 *
 * Offline (default): scans DIR/data, DIR/dist, DIR/src/safety/_synced and
 * the crisis_resource blocks built by DIR/dist/safety/crisis-keywords.js.
 * Live: calls get_dua and get_name_of_allah on URL (an MCP /mcp endpoint).
 * --report prints the counts and exits 0; otherwise any hit exits 1.
 *
 * Every check is scoped to avoid false positives:
 *   a. "Saheeh International", exact, in data/ and dist/.
 *   b. U+FDFA in data/ and in live get_dua / get_name_of_allah responses,
 *      NOT dist/ (the sanitiser handles the character); "PBUH" and "SAW",
 *      exact case and whole-word, in data/ only.
 *   c. Numbers that must never be served as MCP crisis lines, matched as
 *      whole phone numbers (a digit run with its spaces/hyphens, compared
 *      after stripping them), never as bare digit substrings, in the
 *      crisis_resource blocks and the _synced safety modules:
 *        182           Turkey MHRS appointment line, not a crisis line
 *                      (Gem 3, WO#141).
 *      Not listed, by Architect ruling (25 Sep 2026): Madadgaar 1098 and
 *      Muslim Women's Network UK 0800 999 5786. Their exclusion (WO#295) is
 *      from the pa abuse modal only, and Madadgaar 1098 is a verified 24/7
 *      line on /ur/find-support. Add a number here only on a ruling that
 *      bans it as a crisis line everywhere.
 *   f. Pending-wording markers ("WORDING PENDING") in any crisis_resource
 *      block, offline (self-harm, abuse and soft, every locale) and live.
 *      WO#385: the abuse block's sentence waits for Gem 3's wording.
 *   d. .mcp/server.json `description` longer than 100 characters. The MCP
 *      Registry rejects it with HTTP 422 (MCP Registry Publish run #2,
 *      25 Sep 2026: the 600-character description). Counted in Unicode
 *      code points, the way the registry's limit reads.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const REPORT = args.includes('--report')
const LIVE = opt('--live')
const ROOT = path.resolve(opt('--root') ?? '.')

const FDFA = 'ﷺ'
const SI = 'Saheeh International'
const ABBREV = [/\bPBUH\b/g, /\bSAW\b/g]
const BANNED_NUMBERS = new Map([
  ['182', 'Turkey MHRS appointment line, not a crisis line (Gem 3, WO#141)'],
])

const hits = []
const counts = {}
function record(check, where, detail) {
  hits.push({ check, where, detail })
  counts[check] = (counts[check] ?? 0) + 1
}
function touch(check) {
  counts[check] = counts[check] ?? 0
}

/** Whole phone numbers in a text: a digit run with its internal spaces or
 *  hyphens (and an optional leading +), normalised to digits only. */
export function phoneNumbersIn(text) {
  const out = []
  for (const m of text.matchAll(/\+?\d(?:[\d \-]*\d)?/g)) {
    out.push({ raw: m[0], digits: m[0].replace(/\D/g, '') })
  }
  return out
}

function checkBannedNumbers(text, where) {
  touch('c. banned crisis number')
  for (const { raw, digits } of phoneNumbersIn(text)) {
    if (BANNED_NUMBERS.has(digits)) {
      record('c. banned crisis number', where, `"${raw}": ${BANNED_NUMBERS.get(digits)}`)
    }
  }
}

// f. A crisis block must never ship with pending wording (WO#385: the abuse
//    block's user-facing sentence waits for Gem 3).
const PLACEHOLDER = /WORDING PENDING/
function checkPlaceholder(text, where) {
  touch('f. placeholder wording in a crisis block')
  const m = text.match(PLACEHOLDER)
  if (m) record('f. placeholder wording in a crisis block', where, context(text, m.index, m[0].length))
}

function context(text, index, len) {
  return text.slice(Math.max(0, index - 50), index + len + 30).replace(/\s+/g, ' ')
}

async function walk(dir) {
  const out = []
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

async function offline() {
  const dataDir = path.join(ROOT, 'data')
  const distDir = path.join(ROOT, 'dist')
  const dataFiles = await walk(dataDir)
  const distFiles = await walk(distDir)
  if (!dataFiles.some((f) => f.endsWith('duas.json'))) {
    record('setup', dataDir, 'data/duas.json missing: run npm run bundle-data first')
  }
  if (!distFiles.some((f) => f.endsWith('server.js'))) {
    record('setup', distDir, 'dist/server.js missing: run npm run build first')
  }

  // a. Saheeh International, exact, data/ + dist/
  touch('a. Saheeh International')
  for (const f of [...dataFiles, ...distFiles]) {
    const t = await fs.readFile(f, 'utf-8')
    let i = t.indexOf(SI)
    while (i >= 0) {
      record('a. Saheeh International', path.relative(ROOT, f), context(t, i, SI.length))
      i = t.indexOf(SI, i + 1)
    }
  }

  // b. U+FDFA, PBUH, SAW in data/ only
  touch('b. U+FDFA')
  touch('b. PBUH/SAW')
  for (const f of dataFiles) {
    const t = await fs.readFile(f, 'utf-8')
    let i = t.indexOf(FDFA)
    while (i >= 0) {
      record('b. U+FDFA', path.relative(ROOT, f), context(t, i, 1))
      i = t.indexOf(FDFA, i + 1)
    }
    for (const re of ABBREV) {
      for (const m of t.matchAll(re)) {
        record('b. PBUH/SAW', path.relative(ROOT, f), context(t, m.index, m[0].length))
      }
    }
  }

  // d. registry description limit
  touch('d. server.json description > 100 chars')
  const manifestPath = path.join(ROOT, '.mcp', 'server.json')
  try {
    const desc = JSON.parse(await fs.readFile(manifestPath, 'utf-8')).description ?? ''
    const len = [...desc].length
    if (len > 100) record('d. server.json description > 100 chars', '.mcp/server.json', `${len} characters (limit 100)`)
  } catch (err) {
    record('setup', manifestPath, `could not read server.json: ${err?.message ?? err}`)
  }

  // c. banned numbers: _synced safety modules + every crisis_resource block
  for (const f of await walk(path.join(ROOT, 'src', 'safety', '_synced'))) {
    checkBannedNumbers(await fs.readFile(f, 'utf-8'), path.relative(ROOT, f))
  }
  const crisisModule = path.join(distDir, 'safety', 'crisis-keywords.js')
  try {
    const { distressBlockFor } = await import(pathToFileURL(crisisModule).href)
    let blocks = 0
    touch('f. placeholder wording in a crisis block')
    const hints = [
      { level: 'hard', crisisType: 'self-harm' },
      { level: 'hard', crisisType: 'abuse' },
      { level: 'soft' },
    ]
    for (const hint of hints) {
      for (const locale of ['en', 'id', 'ur', 'ar']) {
        const block = distressBlockFor(hint, locale)
        if (!block) continue
        blocks++
        const where = `crisis_resource ${hint.level}${hint.crisisType ? `/${hint.crisisType}` : ''}/${locale}`
        const json = JSON.stringify(block)
        checkBannedNumbers(json, where)
        checkPlaceholder(json, where)
      }
    }
    if (blocks === 0) record('setup', crisisModule, 'no crisis_resource blocks produced')
  } catch (err) {
    record('setup', crisisModule, `could not load crisis blocks: ${err?.message ?? err}`)
  }
}

async function live(url) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const client = new Client({ name: 'ci-publish-guards', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  const calls = [
    ['get_dua', { context: 'anxiety' }],
    ['get_dua', { context: 'morning' }],
    ['get_dua', { context: 'laylat al qadr' }],
    ['get_dua', { context: 'ramadan' }],
    ...['en', 'id', 'ur', 'ar'].map((locale) => ['get_dua', { context: 'I want to kill myself', locale }]),
    ...['en', 'id', 'ur', 'ar'].map((locale) => ['get_dua', { context: 'my husband hits me', locale }]),
    ['get_name_of_allah', { number: 1 }],
    ['get_name_of_allah', { number: 28 }],
    ['get_name_of_allah', { number: 99 }],
  ]
  touch('b. U+FDFA (live)')
  touch('c. banned crisis number')
  try {
    await client.connect(transport)
    for (const [name, a] of calls) {
      const res = await client.callTool({ name, arguments: a })
      const text = res?.content?.[0]?.text ?? ''
      const where = `live ${name} ${JSON.stringify(a)}`
      if (!text) record('setup', where, 'empty response')
      let i = text.indexOf(FDFA)
      while (i >= 0) {
        record('b. U+FDFA (live)', where, context(text, i, 1))
        i = text.indexOf(FDFA, i + 1)
      }
      try {
        const cr = JSON.parse(text)?.crisis_resource
        if (cr) {
          checkBannedNumbers(JSON.stringify(cr), `${where} crisis_resource`)
          checkPlaceholder(JSON.stringify(cr), `${where} crisis_resource`)
        }
      } catch {
        record('setup', where, 'response is not JSON')
      }
    }
  } catch (err) {
    record('setup', url, `live check failed: ${err?.message ?? err}`)
  } finally {
    await transport.close().catch(() => {})
  }
}

if (LIVE) await live(LIVE)
else await offline()

console.log(`publish guards (${LIVE ? `live ${LIVE}` : `offline ${ROOT}`})`)
for (const [check, n] of Object.entries(counts)) console.log(`  ${check}: ${n}`)
for (const h of hits) console.log(`  HIT [${h.check}] ${h.where}: ${h.detail}`)
if (hits.length && !REPORT) {
  console.error(`FAIL: ${hits.length} hit(s). Publish blocked.`)
  process.exit(1)
}
console.log(hits.length ? `REPORT ONLY: ${hits.length} hit(s), not enforced.` : 'PASS: no hits.')
