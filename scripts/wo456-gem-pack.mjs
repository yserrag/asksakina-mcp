/**
 * WO#456: the Gem 8 / Gem 10 pack for the daily usage totals. Copies every
 * wording from its source by script: README "before" from origin/main, "after"
 * from this branch, the /stats privacy lines from the built server, and a
 * real day file written by the built store. Fails if the pack is 15 KB or more.
 *
 * Run from mcp-server/ after `npm run build`:  node scripts/wo456-gem-pack.mjs
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const ROOT = path.resolve(PKG, '..')
const store = await import(pathToFileURL(path.join(PKG, 'dist/logging/daily-store.js')).href)
const stats = await import(pathToFileURL(path.join(PKG, 'dist/logging/stats.js')).href)

const before = execFileSync('git', ['show', 'origin/main:mcp-server/README.md'], { cwd: ROOT, encoding: 'utf8' })
const after = readFileSync(path.join(PKG, 'README.md'), 'utf8')
const section = (md) => {
  const a = md.indexOf('## Privacy & Analytics')
  const b = md.indexOf('### `/stats` endpoint', a)
  if (a < 0 || b < 0) throw new Error('privacy section not found')
  return md.slice(a, b).trim()
}
const volumeLine = (md) => md.split('\n').find((l) => l.includes('`/data` volume')) ?? '(none)'

// a real day file from the built store
const dir = mkdtempSync(path.join(tmpdir(), 'wo456-pack-'))
let sample
try {
  const s = new store.DailyUsageStore(dir, () => new Date('2026-10-12T10:00:00Z'))
  for (const [t, st, ms] of [['get_dua', 'ok', 14], ['get_dua', 'ok', 9], ['get_dua', 'not_found', 3], ['get_quran_verse', 'ok', 220], ['find_verses', 'error', 4]]) s.record(t, st, ms)
  s.flush()
  sample = JSON.stringify(JSON.parse(readFileSync(path.join(dir, '2026-10-12.json'), 'utf8')), null, 1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const fence = (lang, x) => '```' + lang + '\n' + x + '\n```'
const pack = `# WO#456 Gem pack (Gem 8, Gem 10): daily usage totals on the MCP server's own disk

**What changes.** The hosted MCP server (sakina-mcp.fly.dev) today keeps only in-memory counters. Fly stops the machine when it is idle, so they reset to zero at every wake (WO#455).

WO#456 keeps **daily per-tool totals on the server's own disk** (the Fly volume already mounted at \`/data\`), so they survive restarts. No third party holds them. The Architect rejected the Upstash option for that reason.

**For your approval:** the README privacy wording (section 1) and the \`/stats\` privacy line (section 2). The code is built and tested on branch \`claude/wo456-mcp-daily-counts-lq9mco\`. Nothing is merged or deployed until you both approve.

## 1. README "Privacy & Analytics": before and after

**Before** (main, verbatim):

${fence('markdown', section(before))}

**After** (this branch, verbatim):

${fence('markdown', section(after))}

**The \`/data\` volume line, before:** ${volumeLine(before)}

**After:** ${volumeLine(after)}

## 2. The \`/stats\` privacy line

**Unchanged where nothing is stored** (local \`npx\` and \`--stdio\`, or \`MCP_USAGE_DIR\` unset):

${fence('text', stats.PRIVACY_MEMORY_ONLY)}

**New, on the hosted server:**

${fence('text', stats.PRIVACY_WITH_DAILY)}

## 3. Exactly what is stored

**Where:** one file per UTC day, \`/data/usage/YYYY-MM-DD.json\`, on the server's own Fly volume. It is never sent anywhere. \`/stats\` (Bearer token) reads it.

**Fields:** per tool (\`get_quran_verse\`, \`get_dua\`, \`get_name_of_allah\`, \`find_verses\`), four non-negative integers, and nothing else:

| Field | Meaning |
|---|---|
| \`ok\` | calls that returned a result that day |
| \`not_found\` | calls that returned "not found" |
| \`error\` | calls that failed |
| \`duration_ms_sum\` | their summed handler time in milliseconds, for an average |

**A real day file**, written by the built store for five test calls:

${fence('json', sample)}

**Not stored:**
- IP addresses (the rate limiter still uses an IP for 60 seconds, as before);
- user agents and client names or identifiers;
- times of individual calls (only the UTC day);
- tool parameters (for example \`context\` values or verse references);
- responses;
- geolocation.

**Enforced in code and tests:** every file is rebuilt from the allowed keys only, so a field outside them is dropped even if an older file carried it. The tests send a request carrying an IP header, a user agent, a client name and a distinctive parameter, then check that none of them appears in any file.

**When it is written:**
- every 5 minutes, if anything changed;
- once more when Fly stops the machine (SIGINT, or SIGTERM).

A crash loses at most the last 5 minutes.

**Retention:** at most **90 days** (today and the 89 before it). Each write deletes older days.

**Not on users' machines:** the store runs only where \`MCP_USAGE_DIR\` is set, which is only the Fly configuration. \`npx\` and \`--stdio\` runs write nothing (tested).

## Questions

**Gem 8 (privacy, security):** do the stored fields, the 90-day retention and the README wording satisfy the WO#360 rule (aggregate counts only)? Is anything in section 3 identifying, alone or combined?

**Gem 10 (egress):** do you approve the README wording and the new \`/stats\` privacy line as written? Both ship in the npm package and the public mirror.
`

const out = path.join(ROOT, 'docs', 'wo456-gem-pack.md')
writeFileSync(out, pack)
const n = Buffer.byteLength(pack)
console.log(`docs/wo456-gem-pack.md: ${n} bytes`)
if (n >= 15000) throw new Error(`the pack is ${n} bytes; the limit is 15,000`)
