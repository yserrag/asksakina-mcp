#!/usr/bin/env node
/**
 * Record alquran.cloud verse bodies for the offline eval fixtures (WO#393-D).
 *
 *   node scripts/record-alquran-fixtures.mjs 2:153 3:200 39:10
 *
 * Fetches each ref from the SAME endpoint the server calls at runtime
 * (src/data/quran.ts: /v1/ayah/{s}:{a}/editions/quran-uthmani,en.pickthall)
 * and writes the response BODY BYTES unmodified to
 * evals/fixtures/alquran-verses/{s}_{a}.json. Nothing is parsed and
 * re-serialised: the bytes on disk are the bytes the network produced
 * (CLAUDE.md, "Only ever cache a Response the network produced"). A body is
 * written only on HTTP 200 whose JSON says code 200. If every ref was
 * recorded, SHA256SUMS is regenerated for every file in the directory and
 * RECORDED is updated; if any failed, neither is touched and it exits 1.
 *
 * Needs network access to api.alquran.cloud, so it runs in GitHub Actions
 * (workflow mcp-record-fixtures.yml, dispatch only). The workflow uploads the
 * directory as an artifact; a person commits it. Nothing here pushes.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'evals', 'fixtures', 'alquran-verses')
const API = 'https://api.alquran.cloud/v1'

const refs = process.argv.slice(2)
if (!refs.length || refs.some((r) => !/^\d{1,3}:\d{1,3}$/.test(r))) {
  console.error('usage: record-alquran-fixtures.mjs <surah:ayah> [...]  (ayah 1 fixtures live in alquran-ayah1/)')
  process.exit(2)
}

let failed = 0
for (const ref of refs) {
  const [s, a] = ref.split(':')
  if (a === '1') {
    console.error(`${ref}: ayah 1 belongs in alquran-ayah1/, not recorded here`)
    failed++
    continue
  }
  const url = `${API}/ayah/${s}:${a}/editions/quran-uthmani,en.pickthall`
  const res = await fetch(url)
  const bytes = Buffer.from(await res.arrayBuffer())
  let code
  try {
    code = JSON.parse(bytes.toString('utf8')).code
  } catch {}
  if (res.status !== 200 || code !== 200) {
    console.error(`${ref}: HTTP ${res.status}, body code ${code}; NOT written`)
    failed++
    continue
  }
  const file = path.join(DIR, `${s}_${a}.json`)
  writeFileSync(file, bytes)
  console.log(`${ref}: ${bytes.length} bytes -> ${path.relative(process.cwd(), file)} sha256 ${createHash('sha256').update(bytes).digest('hex')}`)
}

// All or nothing for the bookkeeping: a failed ref leaves SHA256SUMS and
// RECORDED untouched, so a partial run never looks like a complete one.
if (failed) {
  console.error(`${failed} ref(s) not recorded; SHA256SUMS and RECORDED left unchanged`)
  process.exit(1)
}

const sums = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => `${createHash('sha256').update(readFileSync(path.join(DIR, f))).digest('hex')}  ${f}`)
writeFileSync(path.join(DIR, 'SHA256SUMS'), sums.join('\n') + '\n')

const prev = readFileSync(path.join(DIR, 'RECORDED'), 'utf8').trimEnd()
const run = process.env.GITHUB_RUN_ID ? `run ${process.env.GITHUB_RUN_ID}` : 'local'
writeFileSync(path.join(DIR, 'RECORDED'), `${prev}\nrecorded_at: ${new Date().toISOString()}; ${run}; refs ${refs.join(' ')}\n`)

