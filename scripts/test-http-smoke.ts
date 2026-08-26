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
