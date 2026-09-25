/**
 * Test harness for the WO#360 in-memory aggregate analytics + /stats.
 *
 * Self-contained: no temp dir, no disk, no network beyond a loopback
 * server for the /stats auth checks. The per-request JSONL logging,
 * geoip lookup, client classification, and AsyncLocalStorage context
 * (WO#137 / WO#140) were removed in WO#360; this harness now asserts
 * the replacement: aggregate counters only, nothing persisted.
 *
 * Run: `cd mcp-server && tsx scripts/test-analytics.ts`
 */

import os from 'node:os'
import { promises as fs } from 'node:fs'
import http from 'node:http'

import {
  logRequest,
  resetLoggerForTests,
  getAggregateSnapshot,
} from '../src/logging/request-logger.js'
import { handleStatsRequest } from '../src/logging/stats.js'
import { extractClientIp } from '../src/logging/geo.js'

interface TestResult {
  label: string
  passed: boolean
  detail?: string
}

const results: TestResult[] = []
function pass(label: string, detail?: string): void {
  results.push({ label, passed: true, detail })
}
function fail(label: string, detail: string): void {
  results.push({ label, passed: false, detail })
}

// ─── aggregate counters ─────────────────────────────────────────────

function testAggregateCounters(): void {
  resetLoggerForTests()

  logRequest({ tool: 'get_dua', status: 'ok', duration_ms: 5 })
  logRequest({ tool: 'get_dua', status: 'ok', duration_ms: 15 })
  logRequest({ tool: 'get_dua', status: 'not_found', duration_ms: 7 })
  logRequest({ tool: 'get_quran_verse', status: 'ok', duration_ms: 9 })
  logRequest({ tool: 'get_quran_verse', status: 'ok', duration_ms: 9 })
  logRequest({ tool: 'get_name_of_allah', status: 'error', duration_ms: 3 })

  const snap = getAggregateSnapshot()

  if (snap.total !== 6) {
    fail('snapshot total counts every call', `expected 6, got ${snap.total}`)
    return
  }
  pass('snapshot total counts every call')

  const dua = snap.perTool.get_dua
  if (dua.total !== 3 || dua.ok !== 2 || dua.not_found !== 1 || dua.error !== 0) {
    fail('per-tool status breakdown correct', JSON.stringify(dua))
    return
  }
  pass('per-tool status breakdown correct (ok / not_found / error)')

  // duration_ms_sum accumulates; mean is derivable (5 + 15 + 7 = 27).
  if (dua.duration_ms_sum !== 27) {
    fail('duration_ms_sum accumulates', `expected 27, got ${dua.duration_ms_sum}`)
    return
  }
  pass('duration_ms_sum accumulates for the average')

  if (snap.perTool.get_name_of_allah.error !== 1) {
    fail('error status recorded', JSON.stringify(snap.perTool.get_name_of_allah))
    return
  }
  pass('error status recorded')

  // `since` is an ISO timestamp.
  if (Number.isNaN(Date.parse(snap.since))) {
    fail('snapshot.since is an ISO timestamp', snap.since)
    return
  }
  pass('snapshot.since is an ISO timestamp')
}

// ─── no per-request data retained ───────────────────────────────────

function testNoPerRequestData(): void {
  resetLoggerForTests()
  logRequest({ tool: 'get_dua', status: 'ok', duration_ms: 11 })
  const snap = getAggregateSnapshot()
  const json = JSON.stringify(snap).toLowerCase()
  // The aggregate must carry NO per-request identifiers or context.
  for (const banned of [
    'ip',
    'user_agent',
    'useragent',
    'country',
    'region',
    'client',
    'params',
    'context',
    'remoteaddress',
    'forwarded',
  ]) {
    if (json.includes(banned)) {
      fail('snapshot carries no per-request / PII fields', `found: ${banned}`)
      return
    }
  }
  pass('snapshot carries no per-request / PII fields (aggregate only)')
}

// ─── reset clears counters ──────────────────────────────────────────

function testReset(): void {
  logRequest({ tool: 'get_dua', status: 'ok', duration_ms: 1 })
  resetLoggerForTests()
  const snap = getAggregateSnapshot()
  if (snap.total !== 0) {
    fail('resetLoggerForTests zeroes the counters', `total=${snap.total}`)
    return
  }
  pass('resetLoggerForTests zeroes the counters')
}

// ─── IP extraction (rate-limit only) ────────────────────────────────

function testIpExtraction(): void {
  const req = {
    headers: {
      'fly-client-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as http.IncomingMessage
  if (extractClientIp(req) !== '203.0.113.10') {
    fail('Fly-Client-IP wins over X-Forwarded-For', String(extractClientIp(req)))
    return
  }
  pass('Fly-Client-IP wins over X-Forwarded-For')

  const req2 = {
    headers: { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as http.IncomingMessage
  if (extractClientIp(req2) !== '198.51.100.5') {
    fail('XFF first hop used when Fly header absent', String(extractClientIp(req2)))
    return
  }
  pass('XFF first hop used when Fly header absent')
}

// ─── no log files are created on disk ───────────────────────────────

async function testNoLogFilesWritten(): Promise<void> {
  const before = new Set(await fs.readdir(os.tmpdir()).catch(() => []))
  resetLoggerForTests()
  for (let i = 0; i < 20; i++) {
    logRequest({ tool: 'get_quran_verse', status: 'ok', duration_ms: i })
  }
  // Give any (nonexistent) async writes a tick to have failed to appear.
  await new Promise((r) => setTimeout(r, 30))
  const after = await fs.readdir(os.tmpdir()).catch(() => [] as string[])
  const newJsonl = after.filter((f) => !before.has(f) && f.endsWith('.jsonl'))
  if (newJsonl.length > 0) {
    fail('no JSONL files are written', JSON.stringify(newJsonl))
    return
  }
  pass('no JSONL log files are written to disk')
}

// ─── /stats endpoint auth + payload ─────────────────────────────────

async function testStatsAuth(): Promise<void> {
  const server = http.createServer((req, res) => {
    if (!handleStatsRequest(req, res)) {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, () => resolve()))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0

  async function hit(headers: Record<string, string> = {}): Promise<{
    status: number
    body: string
  }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/stats', headers },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
          )
        },
      )
      req.on('error', reject)
    })
  }

  delete process.env.MCP_STATS_TOKEN
  if ((await hit()).status !== 503) {
    fail('/stats returns 503 when MCP_STATS_TOKEN unset', 'expected 503')
    server.close()
    return
  }
  pass('/stats returns 503 when MCP_STATS_TOKEN unset')

  process.env.MCP_STATS_TOKEN = 'correct-horse-battery-staple'
  if ((await hit()).status !== 401) {
    fail('/stats returns 401 without Bearer', 'expected 401')
    server.close()
    return
  }
  pass('/stats returns 401 without Bearer')

  if ((await hit({ authorization: 'Bearer wrong-token-here-with-padding' })).status !== 401) {
    fail('/stats returns 401 with wrong token', 'expected 401')
    server.close()
    return
  }
  pass('/stats returns 401 with wrong token')

  const ok = await hit({ authorization: 'Bearer correct-horse-battery-staple' })
  if (ok.status !== 200) {
    fail('/stats returns 200 with correct Bearer', `got ${ok.status}: ${ok.body}`)
    server.close()
    return
  }
  const payload = JSON.parse(ok.body) as Record<string, unknown>
  if (
    !('privacy' in payload) ||
    !('since' in payload) ||
    !('total_requests' in payload) ||
    !('by_tool' in payload)
  ) {
    fail('/stats payload has aggregate fields', JSON.stringify(Object.keys(payload)))
    server.close()
    return
  }
  // The payload must not leak any per-request / PII field.
  const lower = ok.body.toLowerCase()
  for (const banned of ['user_agent', 'country', 'region', 'top_contexts', 'top_verses', 'by_client', 'by_country']) {
    if (lower.includes(banned)) {
      fail('/stats payload carries no per-request / geo fields', `found: ${banned}`)
      server.close()
      return
    }
  }
  pass('/stats returns 200 + aggregate-only payload with correct Bearer')

  server.close()
}

// ─── main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  testAggregateCounters()
  testNoPerRequestData()
  testReset()
  testIpExtraction()
  await testNoLogFilesWritten()
  await testStatsAuth()

  console.log('\n=== Summary ===')
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const passed = results.filter((r) => r.passed).length
  console.log(`\n${passed}/${results.length} checks passed.`)

  if (passed !== results.length) process.exit(1)
}

main().catch((err) => {
  console.error('[test-analytics] fatal:', err)
  process.exit(1)
})
