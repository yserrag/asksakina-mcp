/**
 * HTTP-transport smoke test (WO#250).
 *
 * Boots the real Node HTTP server (`startHttpServer`) and drives it over the
 * Streamable HTTP transport with the official MCP SDK client: `/health` 200
 * plus a `tools/call` round-trip through `/mcp`.
 *
 * It runs with a DELIBERATELY INVALID Upstash URL (`paste-full-url`, the
 * production placeholder) so it asserts the WO#250 fail-open fix: a bad
 * rate-limiter config must degrade to in-memory, never crash the process.
 * Before the fix, the first `/mcp` POST threw ERR_INVALID_URL out of the
 * unhandled `limiter.check(...)` and killed the server (Fly 502 restart loop) —
 * this test would have caught that.
 *
 * Run: `npm run test:http` from `mcp-server/`.
 */

// Reproduce the production misconfiguration. getRateLimiter() reads these
// lazily (inside startHttpServer), so setting them before the call is enough.
process.env.UPSTASH_REDIS_REST_URL = 'paste-full-url'
process.env.UPSTASH_REDIS_REST_TOKEN = 'paste-token'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHttpServer } from '../src/server.js'
import { InMemoryRateLimiter } from '../src/safety/rate-limiter.js'

interface Envelope {
  _sakina_meta?: { content_type?: string }
}

const PORT = Number(process.env.SMOKE_PORT ?? 3099)
let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

async function main(): Promise<void> {
  console.log('MCP HTTP-transport smoke test (WO#250) — invalid Upstash URL, expecting fail-open')

  // Gem 8 (1.4.0): the in-memory limiter discards an IP once its window ends,
  // even if that client never returns. Short window/sweep so the test is fast.
  {
    const lim = new InMemoryRateLimiter(200, 50)
    await lim.check('203.0.113.1')
    await lim.check('203.0.113.2')
    check('in-memory limiter holds IPs during the window', lim.size() === 2, `size ${lim.size()}`)
    await new Promise((r) => setTimeout(r, 400))
    check('in-memory limiter discards IPs after the window, with no further requests', lim.size() === 0, `size ${lim.size()}`)
    const again = await lim.check('203.0.113.1')
    check('a returning IP starts a fresh window', again.remaining === 59, `remaining ${again.remaining}`)
  }

  const server = await startHttpServer(PORT)
  try {
    const health = await fetch(`http://localhost:${PORT}/health`)
    check('/health returns 200', health.status === 200, `got ${health.status}`)

    const client = new Client({ name: 'http-smoke', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`))
    await client.connect(transport)
    check('MCP initialize handshake over /mcp (server did not crash on bad Upstash URL)', true)

    const res = (await client.callTool({
      name: 'get_name_of_allah',
      arguments: { number: 1 },
    })) as { content?: Array<{ text?: string }> }
    const text = res.content?.[0]?.text ?? ''
    let parsed: Envelope | null = null
    try {
      parsed = JSON.parse(text) as Envelope
    } catch {
      parsed = null
    }
    check('tools/call get_name_of_allah returns a valid envelope', Boolean(parsed?._sakina_meta), 'no _sakina_meta in response')
    check(
      'response content_type is name_of_allah',
      parsed?._sakina_meta?.content_type === 'name_of_allah',
      `got ${parsed?._sakina_meta?.content_type}`,
    )

    await transport.close().catch(() => {})

    // Gem 10 condition (1.4.0): the server card's human-readable title and
    // description say AskSakina; the functional name is unchanged.
    const cardRes = await fetch(`http://localhost:${PORT}/.well-known/mcp/server-card.json`)
    const card = (await cardRes.json().catch(() => ({}))) as {
      name?: string
      displayName?: string
      description?: string
    }
    check('server card served', cardRes.status === 200, `got ${cardRes.status}`)
    check('server card displayName is "AskSakina Islamic Knowledge"', card.displayName === 'AskSakina Islamic Knowledge', `got ${card.displayName}`)
    check(
      'server card description names AskSakina, not bare Sakina',
      (card.description ?? '').includes('from AskSakina (asksakina.com)') && !/(?<!Ask)Sakina\b/.test(card.description ?? ''),
      card.description ?? '',
    )
    check('server card functional name unchanged', card.name === 'com.asksakina/islamic-knowledge', `got ${card.name}`)

    // WO#385: /stats reports which limiter is enforcing the budget. This
    // smoke test runs with an invalid Upstash URL, so the state is memory.
    process.env.MCP_STATS_TOKEN = 'smoke-stats-token'
    const statsRes = await fetch(`http://localhost:${PORT}/stats`, {
      headers: { Authorization: 'Bearer smoke-stats-token' },
    })
    const stats = (await statsRes.json().catch(() => ({}))) as {
      rate_limiter?: { state?: string; upstash_configured?: boolean; startup_check?: string }
      basmala_prefix_mismatch?: number
    }
    check('/stats 200 with the token', statsRes.status === 200, `got ${statsRes.status}`)
    check(
      '/stats rate_limiter.state is memory (no valid Upstash here)',
      stats.rate_limiter?.state === 'memory' && stats.rate_limiter?.upstash_configured === false,
      JSON.stringify(stats.rate_limiter),
    )
    check(
      '/stats basmala_prefix_mismatch is an aggregate count (0 here)',
      stats.basmala_prefix_mismatch === 0,
      JSON.stringify(stats.basmala_prefix_mismatch),
    )
  } catch (err) {
    check('server survived the /mcp POST (no crash)', false, err instanceof Error ? err.message : String(err))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  console.log(`\n${failures === 0 ? 'HTTP smoke test PASSED' : `HTTP smoke test FAILED (${failures} failure(s))`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('HTTP smoke test crashed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
