/**
 * Test harness for the WO#137 analytics logger + /stats endpoint.
 *
 * Self-contained: uses a temp dir for logs, no network, no Fly.
 * Run: `cd mcp-server && tsx scripts/test-analytics.ts`
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { setTimeout as wait } from 'node:timers/promises'

import {
  logRequest,
  resetLoggerForTests,
  sanitiseParams,
  getLogDir,
} from '../src/logging/request-logger.js'
import { aggregateStats, handleStatsRequest } from '../src/logging/stats.js'
import { runWithRequestContext } from '../src/logging/request-context.js'
import { classifyClient, sanitiseUserAgent } from '../src/logging/client-detection.js'
import { extractClientIp, lookupGeo } from '../src/logging/geo.js'

interface TestResult {
  label: string
  passed: boolean
  detail?: string
}

const results: TestResult[] = []
function pass(label: string, detail?: string): TestResult {
  return { label, passed: true, detail }
}
function fail(label: string, detail: string): TestResult {
  return { label, passed: false, detail }
}

async function setUpTempLogDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sakina-analytics-'))
  process.env.LOG_DIR = dir
  resetLoggerForTests()
  return dir
}

async function flushLogWrites(): Promise<void> {
  // logRequest is fire-and-forget; give the event loop a few ticks to
  // settle the fs.appendFile promise chain.
  await wait(50)
}

// ─── sanitiseParams ─────────────────────────────────────────────────

function testSanitiseParams(): void {
  const out = sanitiseParams('get_dua', {
    context: 'anxiety',
    locale: 'en',
    secret: { evil: 'object' },
    notAllowed: [1, 2, 3],
  })
  if (out['context'] !== 'anxiety' || out['locale'] !== 'en') {
    results.push(fail('sanitiseParams keeps strings', JSON.stringify(out)))
    return
  }
  if ('secret' in out || 'notAllowed' in out) {
    results.push(fail('sanitiseParams strips non-primitives', JSON.stringify(out)))
    return
  }
  results.push(pass('sanitiseParams keeps strings + strips non-primitives'))

  const longCtx = 'a'.repeat(500)
  const truncated = sanitiseParams('get_dua', { context: longCtx })
  if ((truncated['context'] as string).length !== 200) {
    results.push(
      fail(
        'sanitiseParams truncates context to 200 chars',
        `got length ${(truncated['context'] as string).length}`,
      ),
    )
    return
  }
  results.push(pass('sanitiseParams truncates context to 200 chars'))
}

// ─── log entry shape ────────────────────────────────────────────────

async function testLogEntryShape(dir: string): Promise<void> {
  logRequest({
    tool: 'get_quran_verse',
    params: { surah: 2, ayah: 255 },
    status: 'ok',
    duration_ms: 12.7,
  })
  await flushLogWrites()

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  if (files.length !== 1) {
    results.push(fail('one JSONL file written', `files=${JSON.stringify(files)}`))
    return
  }
  results.push(pass('one JSONL file written per day'))

  const body = await fs.readFile(path.join(dir, files[0]!), 'utf8')
  const lines = body.trim().split('\n')
  if (lines.length !== 1) {
    results.push(fail('one entry per logRequest call', `lines=${lines.length}`))
    return
  }
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>
  const required = ['ts', 'tool', 'params', 'status', 'duration_ms', 'response_time_ms', 'error']
  for (const k of required) {
    if (!(k in entry)) {
      results.push(fail(`entry contains ${k}`, JSON.stringify(entry)))
      return
    }
  }
  if (entry['duration_ms'] !== 13) {
    results.push(fail('duration_ms is integer-rounded', String(entry['duration_ms'])))
    return
  }
  if (entry['response_time_ms'] !== 13) {
    results.push(fail('response_time_ms mirrors duration_ms', String(entry['response_time_ms'])))
    return
  }
  if (entry['error'] !== false) {
    results.push(fail('error boolean is false for ok status', String(entry['error'])))
    return
  }
  results.push(pass('entry has ts/tool/params/status/duration_ms/response_time_ms/error shape'))

  // Documented contract (WO#140): required + the WO#140 optional fields.
  // No IP, no headers, no payload bodies.
  const allowedKeys = new Set([
    ...required,
    'error_type',
    'country_code',
    'region',
    'client',
    'user_agent',
  ])
  for (const k of Object.keys(entry)) {
    if (!allowedKeys.has(k)) {
      results.push(fail('no extra fields in entry', `unexpected key: ${k}`))
      return
    }
  }
  results.push(pass('no extra fields beyond the documented contract'))

  const json = JSON.stringify(entry)
  for (const banned of ['"ip"', 'remoteAddress', 'x-forwarded-for', 'fly-client-ip']) {
    if (json.toLowerCase().includes(banned.toLowerCase())) {
      results.push(fail('entry contains no IP-like keys', `found: ${banned}`))
      return
    }
  }
  results.push(pass('entry contains no IP-like keys'))
}

// ─── aggregator ────────────────────────────────────────────────────

async function testAggregator(): Promise<void> {
  logRequest({
    tool: 'get_dua',
    params: { context: 'anxiety', locale: 'en' },
    status: 'ok',
    duration_ms: 5,
  })
  logRequest({
    tool: 'get_dua',
    params: { context: 'anxiety', locale: 'en' },
    status: 'ok',
    duration_ms: 5,
  })
  logRequest({
    tool: 'get_dua',
    params: { context: 'morning' },
    status: 'not_found',
    duration_ms: 7,
  })
  logRequest({
    tool: 'get_quran_verse',
    params: { surah: 2, ayah: 255 },
    status: 'ok',
    duration_ms: 9,
  })
  logRequest({
    tool: 'get_quran_verse',
    params: { surah: 2, ayah: 255 },
    status: 'ok',
    duration_ms: 9,
  })
  logRequest({
    tool: 'get_name_of_allah',
    params: { number: 1 },
    status: 'error',
    duration_ms: 3,
  })
  await flushLogWrites()

  const stats = await aggregateStats()
  // 1 quran_verse + 1 from shape test already = 3 + 3 dua + 1 name = 7
  if (stats.totals.all_time !== 7) {
    results.push(
      fail('totals.all_time matches entries written', `expected 7, got ${stats.totals.all_time}`),
    )
    return
  }
  results.push(pass('totals.all_time matches entries written'))

  if (stats.by_tool.get_dua.all_time !== 3) {
    results.push(fail('by_tool counts correct', JSON.stringify(stats.by_tool)))
    return
  }
  results.push(pass('by_tool counts correct'))

  if (stats.top_contexts[0]?.context !== 'anxiety' || stats.top_contexts[0].count !== 2) {
    results.push(fail('top_contexts ranks correctly', JSON.stringify(stats.top_contexts)))
    return
  }
  results.push(pass('top_contexts ranks correctly'))

  if (stats.top_verses[0]?.ref !== '2:255' || stats.top_verses[0].count !== 3) {
    // 1 from earlier shape test + 2 from this block = 3
    results.push(fail('top_verses ranks correctly', JSON.stringify(stats.top_verses)))
    return
  }
  results.push(pass('top_verses ranks correctly'))

  if (stats.by_status.error !== 1 || stats.by_status.not_found !== 1) {
    results.push(fail('by_status counts errors + not_found', JSON.stringify(stats.by_status)))
    return
  }
  results.push(pass('by_status counts errors + not_found'))

  const expectedRate = Number((1 / 7).toFixed(4))
  if (stats.error_rate.all_time !== expectedRate) {
    results.push(
      fail('error_rate computed', `expected ${expectedRate}, got ${stats.error_rate.all_time}`),
    )
    return
  }
  results.push(pass('error_rate computed'))
}

// ─── WO#140 — request context propagation ──────────────────────────

async function testRequestContextPropagation(dir: string): Promise<void> {
  // Log inside an ALS scope — country/client/UA should appear in the entry.
  runWithRequestContext(
    {
      country_code: 'GB',
      region: 'England',
      client: 'claude-desktop',
      user_agent: 'Claude-Desktop/1.2.3',
    },
    () => {
      logRequest({
        tool: 'get_dua',
        params: { context: 'gratitude' },
        status: 'ok',
        duration_ms: 11,
      })
    },
  )
  await flushLogWrites()

  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
  const body = await fs.readFile(path.join(dir, files[files.length - 1]!), 'utf8')
  const lines = body.trim().split('\n')
  const entry = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>

  if (
    entry['country_code'] !== 'GB' ||
    entry['region'] !== 'England' ||
    entry['client'] !== 'claude-desktop' ||
    entry['user_agent'] !== 'Claude-Desktop/1.2.3'
  ) {
    results.push(fail('request context merged into log entry', JSON.stringify(entry)))
    return
  }
  results.push(pass('request context merged into log entry'))

  // Log OUTSIDE any ALS scope — none of the optional fields should appear.
  logRequest({
    tool: 'get_dua',
    params: { context: 'patience' },
    status: 'ok',
    duration_ms: 4,
  })
  await flushLogWrites()
  const tail = (await fs.readFile(path.join(dir, files[files.length - 1]!), 'utf8'))
    .trim()
    .split('\n')
  const last = JSON.parse(tail[tail.length - 1]!) as Record<string, unknown>
  if (
    'country_code' in last ||
    'region' in last ||
    'client' in last ||
    'user_agent' in last
  ) {
    results.push(
      fail('no context fields when ALS scope absent', JSON.stringify(last)),
    )
    return
  }
  results.push(pass('no context fields when ALS scope absent'))

  // Error path — error_type appears, error boolean is true.
  runWithRequestContext({ country_code: 'US', client: 'cursor' }, () => {
    logRequest({
      tool: 'get_name_of_allah',
      params: { number: 5 },
      status: 'error',
      duration_ms: 8,
      error_type: 'TypeError',
    })
  })
  await flushLogWrites()
  const errLines = (await fs.readFile(path.join(dir, files[files.length - 1]!), 'utf8'))
    .trim()
    .split('\n')
  const errEntry = JSON.parse(errLines[errLines.length - 1]!) as Record<
    string,
    unknown
  >
  if (errEntry['error'] !== true || errEntry['error_type'] !== 'TypeError') {
    results.push(fail('error path sets error=true + error_type', JSON.stringify(errEntry)))
    return
  }
  results.push(pass('error path sets error=true + error_type'))
}

// ─── WO#140 — geo extraction + IP discard ───────────────────────────

function testGeoExtraction(): void {
  // Fly-Client-IP wins over X-Forwarded-For.
  const req = {
    headers: {
      'fly-client-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as http.IncomingMessage
  const ip = extractClientIp(req)
  if (ip !== '203.0.113.10') {
    results.push(fail('Fly-Client-IP wins over X-Forwarded-For', String(ip)))
    return
  }
  results.push(pass('Fly-Client-IP wins over X-Forwarded-For'))

  // Falls back to X-Forwarded-For first hop when Fly header is absent.
  const req2 = {
    headers: { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as http.IncomingMessage
  const ip2 = extractClientIp(req2)
  if (ip2 !== '198.51.100.5') {
    results.push(fail('XFF first hop used when Fly header absent', String(ip2)))
    return
  }
  results.push(pass('XFF first hop used when Fly header absent'))

  // Localhost lookup gracefully returns empty (no throws).
  const local = lookupGeo('127.0.0.1')
  if (local.country_code !== undefined || local.region !== undefined) {
    results.push(fail('lookupGeo("127.0.0.1") returns empty', JSON.stringify(local)))
    return
  }
  results.push(pass('lookupGeo("127.0.0.1") returns empty'))

  // Undefined IP returns empty.
  const undef = lookupGeo(undefined)
  if (Object.keys(undef).length !== 0) {
    results.push(fail('lookupGeo(undefined) returns empty', JSON.stringify(undef)))
    return
  }
  results.push(pass('lookupGeo(undefined) returns empty'))

  // A well-known public IP resolves to a country (Google DNS — US).
  const google = lookupGeo('8.8.8.8')
  if (!google.country_code || google.country_code.length !== 2) {
    results.push(
      fail('lookupGeo("8.8.8.8") resolves to a country', JSON.stringify(google)),
    )
    return
  }
  results.push(
    pass('lookupGeo("8.8.8.8") resolves to a country', google.country_code),
  )
}

// ─── WO#140 — client classification ─────────────────────────────────

function testClientClassification(): void {
  const cases: Array<[string | undefined, string]> = [
    ['Claude-Desktop/1.2.3', 'claude-desktop'],
    ['claudedesktop/1.0', 'claude-desktop'],
    ['Claude-Code/0.8.0', 'claude-code'],
    ['cursor-ide/0.42', 'cursor'],
    ['Cline/2.1', 'cline'],
    ['continue.dev/0.9', 'continue'],
    ['curl/8.4.0', 'curl'],
    ['mcp-inspector/1.0', 'mcp-inspector'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'browser'],
    ['python-httpx/0.27', 'sdk-python'],
    ['@modelcontextprotocol/sdk/0.5', 'sdk-typescript'],
    [undefined, 'unknown'],
    ['random-tool/1.0', 'unknown'],
  ]
  let allPass = true
  const failures: string[] = []
  for (const [ua, expected] of cases) {
    const got = classifyClient(ua)
    if (got !== expected) {
      allPass = false
      failures.push(`UA="${ua}" expected=${expected} got=${got}`)
    }
  }
  if (!allPass) {
    results.push(fail('classifyClient covers documented clients', failures.join('; ')))
    return
  }
  results.push(pass('classifyClient covers documented clients'))

  // sanitiseUserAgent truncates at 200 chars and trims.
  const trimmed = sanitiseUserAgent('  Some-UA/1.0  ')
  if (trimmed !== 'Some-UA/1.0') {
    results.push(fail('sanitiseUserAgent trims', String(trimmed)))
    return
  }
  const long = sanitiseUserAgent('a'.repeat(500))
  if (!long || long.length !== 200) {
    results.push(fail('sanitiseUserAgent caps at 200', String(long?.length)))
    return
  }
  results.push(pass('sanitiseUserAgent trims + caps at 200 chars'))
}

// ─── WO#140 — extended stats aggregations ──────────────────────────

async function testExtendedStats(): Promise<void> {
  // Add a few entries with context to exercise by_country / by_client / popular_topics.
  runWithRequestContext({ country_code: 'GB', client: 'claude-desktop' }, () => {
    logRequest({
      tool: 'get_dua',
      params: { context: 'anxiety' },
      status: 'ok',
      duration_ms: 12,
    })
  })
  runWithRequestContext({ country_code: 'US', client: 'cursor' }, () => {
    logRequest({
      tool: 'get_dua',
      params: { context: 'anxiety' },
      status: 'ok',
      duration_ms: 14,
    })
  })
  runWithRequestContext({ country_code: 'US', client: 'claude-desktop' }, () => {
    logRequest({
      tool: 'get_quran_verse',
      params: { surah: 2, ayah: 255 },
      status: 'ok',
      duration_ms: 22,
    })
  })
  await flushLogWrites()

  const stats = await aggregateStats()

  if (stats.by_country.all_time.length === 0) {
    results.push(fail('by_country.all_time populated', JSON.stringify(stats.by_country)))
    return
  }
  const countries = new Set(stats.by_country.all_time.map((e) => e.country_code))
  if (!countries.has('US') || !countries.has('GB')) {
    results.push(fail('by_country includes US + GB', JSON.stringify(stats.by_country)))
    return
  }
  results.push(pass('by_country aggregates last_7d + all_time'))

  if ((stats.by_client.all_time['claude-desktop'] ?? 0) < 2) {
    results.push(fail('by_client counts claude-desktop', JSON.stringify(stats.by_client)))
    return
  }
  if ((stats.by_client.all_time['cursor'] ?? 0) < 1) {
    results.push(fail('by_client counts cursor', JSON.stringify(stats.by_client)))
    return
  }
  results.push(pass('by_client breakdown correct'))

  if (stats.popular_topics.length === 0) {
    results.push(fail('popular_topics populated', JSON.stringify(stats.popular_topics)))
    return
  }
  const kinds = new Set(stats.popular_topics.map((t) => t.kind))
  if (!kinds.has('dua_context')) {
    results.push(
      fail('popular_topics includes dua_context', JSON.stringify(stats.popular_topics)),
    )
    return
  }
  results.push(pass('popular_topics merges du’a contexts + verses'))

  if (stats.avg_response_time_ms.all_time <= 0) {
    results.push(
      fail('avg_response_time_ms.all_time > 0', String(stats.avg_response_time_ms.all_time)),
    )
    return
  }
  if (stats.avg_response_time_ms.by_tool.get_dua.all_time <= 0) {
    results.push(
      fail(
        'avg_response_time_ms.by_tool.get_dua > 0',
        String(stats.avg_response_time_ms.by_tool.get_dua.all_time),
      ),
    )
    return
  }
  results.push(pass('avg_response_time_ms computed overall + per-tool'))
}

// ─── /stats endpoint auth ───────────────────────────────────────────

async function testStatsAuth(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    if (!(await handleStatsRequest(req, res))) {
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
  const noToken = await hit()
  if (noToken.status !== 503) {
    results.push(fail('/stats returns 503 when MCP_STATS_TOKEN unset', `got ${noToken.status}`))
    server.close()
    return
  }
  results.push(pass('/stats returns 503 when MCP_STATS_TOKEN unset'))

  process.env.MCP_STATS_TOKEN = 'correct-horse-battery-staple'
  const noAuth = await hit()
  if (noAuth.status !== 401) {
    results.push(fail('/stats returns 401 without Bearer', `got ${noAuth.status}`))
    server.close()
    return
  }
  results.push(pass('/stats returns 401 without Bearer'))

  const wrongToken = await hit({ authorization: 'Bearer wrong-token-here-with-padding' })
  if (wrongToken.status !== 401) {
    results.push(fail('/stats returns 401 with wrong token', `got ${wrongToken.status}`))
    server.close()
    return
  }
  results.push(pass('/stats returns 401 with wrong token'))

  const ok = await hit({ authorization: 'Bearer correct-horse-battery-staple' })
  if (ok.status !== 200) {
    results.push(fail('/stats returns 200 with correct Bearer', `got ${ok.status}: ${ok.body}`))
    server.close()
    return
  }
  const payload = JSON.parse(ok.body) as Record<string, unknown>
  if (
    !('totals' in payload) ||
    !('by_tool' in payload) ||
    !('top_contexts' in payload) ||
    !('top_verses' in payload) ||
    !('error_rate' in payload) ||
    !('by_country' in payload) ||
    !('by_client' in payload) ||
    !('popular_topics' in payload) ||
    !('avg_response_time_ms' in payload)
  ) {
    results.push(fail('/stats payload has required fields', JSON.stringify(Object.keys(payload))))
    server.close()
    return
  }
  results.push(pass('/stats returns 200 + WO#140 payload with correct Bearer'))

  server.close()
}

// ─── main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dir = await setUpTempLogDir()
  console.log(`[test-analytics] log dir: ${dir}`)
  console.log(`[test-analytics] getLogDir() -> ${getLogDir()}`)

  testSanitiseParams()
  await testLogEntryShape(dir)
  // testAggregator asserts an exact entry count, so it must run before
  // the WO#140 tests start appending their own entries.
  await testAggregator()
  await testRequestContextPropagation(dir)
  testGeoExtraction()
  testClientClassification()
  await testExtendedStats()
  await testStatsAuth()

  console.log('\n=== Summary ===')
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const passed = results.filter((r) => r.passed).length
  console.log(`\n${passed}/${results.length} checks passed.`)

  await fs.rm(dir, { recursive: true, force: true })

  if (passed !== results.length) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[test-analytics] fatal:', err)
  process.exit(1)
})
