/**
 * WO#385: Upstash limiter against a fake Upstash, every failure row.
 *
 * Before WO#385, each failure row below failed OPEN: every request allowed,
 * and for HTTP errors nothing logged. Now, for each row:
 *   - the startup PING reports the real result;
 *   - 61 requests from one IP: the first 60 are allowed with remaining
 *     counting down, and the 61st is BLOCKED (the budget holds; never
 *     allow-all);
 *   - the state is right (upstash when healthy, degraded on failure);
 *   - the failure is logged with its reason, and NO log line carries the
 *     client IP.
 * Plus recovery: a degraded limiter returns to upstash when Upstash answers.
 *
 * Run: npm run test:ratelimit
 */

import http from 'node:http'
import { AddressInfo } from 'node:net'
import { InMemoryRateLimiter, UpstashRateLimiter } from '../src/safety/rate-limiter.js'

type Mode = 'counting' | '401' | '404' | '200-error'
let mode: Mode = 'counting'
const store = new Map<string, number>()

function fakeUpstash(): Promise<http.Server> {
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (mode === '401') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"Unauthorized"}') }
      if (mode === '404') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"database not found"}') }
      const cmds = JSON.parse(body) as Array<[string, ...string[]]>
      const out = cmds.map(([op, key]) => {
        if (mode === '200-error') return { error: 'ERR max requests limit exceeded' }
        if (op === 'PING') return { result: 'PONG' }
        if (op === 'INCR') { const n = (store.get(key) ?? 0) + 1; store.set(key, n); return { result: n } }
        return { result: 1 }
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    })
  })
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)))
}

const IP = '203.0.113.77'
const logs: string[] = []
for (const k of ['log', 'warn', 'error'] as const) {
  console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
}
const out: string[] = []
let failures = 0
function check(label: string, ok: boolean, detail = '') {
  out.push(`${ok ? '[PASS]' : '[FAIL]'} ${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

async function row(label: string, url: string, setMode: Mode | null, expect: { state: string; failure: RegExp | null }) {
  if (setMode) mode = setMode
  store.clear()
  logs.length = 0
  const lim = new UpstashRateLimiter(url, 'test-token', new InMemoryRateLimiter())
  const startup = await lim.probe()
  // The limiter keys on a fixed 60 s window (floor(now / 60 s)). Pin the
  // clock mid-window so the 61 requests can never straddle a boundary; an
  // unpinned run that crossed a minute started a new key and allowed 61.
  const realNow = Date.now
  const pinned = Math.floor(realNow() / 60_000) * 60_000 + 30_000
  Date.now = () => pinned
  const results = []
  try {
    for (let i = 0; i < 61; i++) results.push(await lim.check(IP))
  } finally {
    Date.now = realNow
  }
  const st = lim.getStatus()
  const allowed = results.filter((r) => r.allowed).length
  const remaining = results.slice(0, 3).map((r) => r.remaining).join(',')
  const blocked61 = results[60].allowed === false
  const ipInLogs = logs.some((l) => l.includes(IP))
  const failureLogged = expect.failure ? logs.some((l) => expect.failure!.test(l)) : true
  check(`${label}: state ${expect.state}`, st.state === expect.state, `got ${st.state}`)
  check(`${label}: 60 allowed, 61st blocked (budget holds)`, allowed === 60 && blocked61, `allowed=${allowed}, 61st allowed=${results[60].allowed}`)
  check(`${label}: remaining counts down`, remaining === '59,58,57', `got ${remaining}`)
  check(`${label}: failure logged with reason`, failureLogged, logs.slice(0, 2).join(' / '))
  check(`${label}: no log line contains the client IP`, !ipInLogs)
  out.push(`| ${label} | ${st.state} | ${remaining} … 61st ${blocked61 ? 'blocked' : 'ALLOWED'} | ${st.upstash_failures} | ${st.last_failure ?? '-'} | ${startup} |`)
  return lim
}

async function main() {
  const srv = await fakeUpstash()
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  out.push('| Upstash condition | state | remaining / 61st request | failures logged | last failure | startup check |', '|---|---|---|---|---|---|')

  await row('counting (healthy)', url, 'counting', { state: 'upstash', failure: null })
  await row('401 bad token', url, '401', { state: 'degraded', failure: /Upstash failure \(HTTP 401/ })
  await row('404 database deleted', url, '404', { state: 'degraded', failure: /Upstash failure \(HTTP 404/ })
  await row('200 with per-command errors', url, '200-error', { state: 'degraded', failure: /per-command error/ })

  // Unreachable: a port with nothing listening.
  const dead = http.createServer(); await new Promise<void>((r) => dead.listen(0, '127.0.0.1', () => r()))
  const deadUrl = `http://127.0.0.1:${(dead.address() as AddressInfo).port}`
  await new Promise<void>((r) => dead.close(() => r()))
  await row('unreachable', deadUrl, null, { state: 'degraded', failure: /Upstash failure \(unreachable/ })

  // Recovery: degraded (404) -> healthy again.
  mode = '404'; logs.length = 0
  const lim = new UpstashRateLimiter(url, 'test-token', new InMemoryRateLimiter())
  await lim.check('198.51.100.1')
  const before = lim.getStatus().state
  mode = 'counting'
  await lim.check('198.51.100.1')
  const after = lim.getStatus().state
  check('recovery: degraded -> upstash when Upstash answers again', before === 'degraded' && after === 'upstash' && logs.some((l) => l.includes('Upstash recovered')), `${before} -> ${after}`)

  srv.close()
  process.stdout.write(out.join('\n') + `\n\n${failures === 0 ? 'rate-limiter tests PASSED' : `rate-limiter tests FAILED (${failures})`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => { process.stdout.write(`crashed: ${err}\n`); process.exit(1) })
