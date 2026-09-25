#!/usr/bin/env node
/**
 * Rate-limiter probe (WO#377, 1.4.0). WARN ONLY: always exits 0.
 *
 *   node scripts/rate-limit-probe.mjs <mcp-url> [gap-seconds]
 *
 * Sends two identical JSON-RPC tools/list POSTs a few seconds apart and reads
 * X-RateLimit-Limit / X-RateLimit-Remaining from both. The server sets those
 * headers before it handles the request, so any POST carries them.
 *
 *   COUNTING      remaining went down between the two requests
 *   FAILING OPEN  remaining equals the limit on both: the limiter's
 *                 failOpen() result, which is what an Upstash 401/404/error
 *                 or an unreachable Upstash produces (the 1.4.1 fix)
 *   NO HEADERS    either response lacked the headers
 *
 * The limiter is a fixed 60-second window, so the two requests can straddle
 * a window boundary (remaining goes back up). That case is re-probed once
 * before any verdict.
 *
 * COUNTING shows a limiter is counting. It does not show which one: the
 * in-memory fallback counts too.
 *
 * Prints one summary line, and appends it to $GITHUB_STEP_SUMMARY when set.
 */

import { appendFileSync } from 'node:fs'

const url = process.argv[2] ?? 'https://sakina-mcp.fly.dev/mcp'
const gapMs = Number(process.argv[3] ?? 3) * 1000

async function probe() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  await res.text().catch(() => '')
  const limit = res.headers.get('x-ratelimit-limit')
  const remaining = res.headers.get('x-ratelimit-remaining')
  return {
    status: res.status,
    limit: limit === null ? null : Number(limit),
    remaining: remaining === null ? null : Number(remaining),
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pair() {
  const a = await probe()
  await sleep(gapMs)
  const b = await probe()
  return [a, b]
}

function verdict(a, b) {
  if ([a.limit, a.remaining, b.limit, b.remaining].some((v) => v === null || Number.isNaN(v))) {
    return { kind: 'NO_HEADERS' }
  }
  if (a.remaining === a.limit && b.remaining === b.limit) return { kind: 'FAILING_OPEN' }
  if (b.remaining < a.remaining) return { kind: 'COUNTING' }
  return { kind: 'WINDOW_ROLLOVER' }
}

let line
let warn = false
try {
  let [a, b] = await pair()
  let v = verdict(a, b)
  if (v.kind === 'WINDOW_ROLLOVER') {
    console.log(`remaining went ${a.remaining} -> ${b.remaining} (window boundary?); re-probing once`)
    ;[a, b] = await pair()
    v = verdict(a, b)
  }
  const detail = `HTTP ${a.status}/${b.status}`
  if (v.kind === 'COUNTING') {
    line = `Rate limiter: COUNTING (${a.limit} -> ${a.remaining} -> ${b.remaining})`
  } else if (v.kind === 'FAILING_OPEN') {
    line = `Rate limiter: FAILING OPEN (remaining did not decrease: ${a.remaining} -> ${b.remaining}, limit ${a.limit})`
    warn = true
  } else if (v.kind === 'NO_HEADERS') {
    line = `Rate limiter: NO HEADERS (${detail})`
    warn = true
  } else {
    line = `Rate limiter: INCONCLUSIVE (remaining ${a.remaining} -> ${b.remaining} twice; limit ${a.limit})`
    warn = true
  }
  console.log(`${line} [${detail}]`)
} catch (err) {
  line = `Rate limiter: NO HEADERS (probe failed: ${err?.message ?? err})`
  warn = true
  console.log(line)
}

if (warn) console.log(`::warning title=Rate limiter::${line}. Warn only; fail-open is a 1.4.1 fix, not a publish blocker.`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${warn ? '⚠️' : '✅'} ${line}\n`)
}
process.exit(0)
