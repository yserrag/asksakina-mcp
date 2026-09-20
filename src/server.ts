/**
 * Sakina Islamic Knowledge MCP Server v1 (WO#102).
 *
 * Streamable HTTP transport. Three lookup tools, one canonical
 * resource (`sakina://about`), per-IP rate limiting (60 req/min,
 * Upstash Redis when configured, in-memory fallback otherwise).
 *
 * Stateless transport — every request creates a fresh transport
 * bound to a fresh server instance. Suits the lookup-only v1 cleanly:
 * no session state to track, scales horizontally without sticky
 * sessions, and the in-memory rate limiter remains best-effort per
 * process.
 */

import http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import {
  GET_QURAN_VERSE_DESCRIPTION,
  GET_QURAN_VERSE_TITLE,
  getQuranVerseShape,
  getQuranVerseHandler,
} from './tools/get-quran-verse.js'
import {
  GET_DUA_DESCRIPTION,
  GET_DUA_TITLE,
  getDuaShape,
  getDuaHandler,
} from './tools/get-dua.js'
import {
  GET_NAME_DESCRIPTION,
  GET_NAME_TITLE,
  getNameOfAllahShape,
  getNameOfAllahHandler,
} from './tools/get-name-of-allah.js'
import { ABOUT_RESOURCE_BODY } from './contracts/educational.js'
import {
  RATE_LIMIT_BUDGET,
  RATE_LIMIT_WINDOW_MS,
  getRateLimiter,
  type RateLimitResult,
} from './safety/rate-limiter.js'
import { serialiseResponse, type SakinaResponse } from './meta/response-builder.js'
import { logRequest, type ToolName, type RequestStatus } from './logging/request-logger.js'
import { handleStatsRequest } from './logging/stats.js'
import { extractClientIp } from './logging/geo.js'

const SERVER_NAME = 'sakina-islamic-knowledge'
const SERVER_VERSION = '1.3.0'
const SERVER_DESCRIPTION =
  "Verified Islamic knowledge from Sakina (asksakina.com). Provides Quranic verses, authenticated du'as (supplications), and the 99 Names of Allah. All content is reviewed through AskSakina's structured specialist-AI review chain for theological accuracy across mainstream Sunni schools; this structured AI review is not a substitute for a qualified scholar."

// WO#129 Task 1 — Smithery server-card.json. Mirrors the MCP registry
// entry at `.mcp/server.json` but adds JSON-Schema-shaped descriptors
// for each tool's input so Smithery's catalog UI can render parameter
// hints. Kept inline (rather than read from a file at runtime) so the
// Fly build doesn't need to include extra file plumbing.
const SERVER_CARD = {
  schemaVersion: '2025-07-09',
  name: 'com.asksakina/islamic-knowledge',
  displayName: 'Sakina Islamic Knowledge',
  description: SERVER_DESCRIPTION,
  version: SERVER_VERSION,
  homepage: 'https://www.asksakina.com/en/mcp',
  repository: 'https://github.com/yserrag/asksakina-mcp',
  license: 'Sacred Use',
  publisher: {
    name: 'Sakina',
    url: 'https://www.asksakina.com',
  },
  transport: {
    type: 'streamable-http',
    url: 'https://sakina-mcp.fly.dev/mcp',
  },
  packages: [
    {
      registryType: 'npm',
      identifier: '@asksakina/islamic-knowledge-mcp',
      transport: 'stdio',
    },
  ],
  tools: [
    {
      name: 'get_quran_verse',
      description:
        'Retrieve a single Quranic verse by surah and ayah reference. Returns the verbatim Arabic text and a canonical translation along with citation metadata. Output must be presented exactly as returned; do not paraphrase the Arabic or the translation.',
      inputSchema: {
        type: 'object',
        properties: {
          surah: { type: 'integer', minimum: 1, maximum: 114, description: 'Surah number, 1-114' },
          ayah: {
            type: 'integer',
            minimum: 1,
            maximum: 286,
            description: 'Ayah (verse) number within the surah',
          },
          locale: {
            type: 'string',
            enum: ['en', 'id', 'ur', 'ar'],
            description: 'Translation locale; defaults to "en" (Pickthall).',
          },
        },
        required: ['surah', 'ayah'],
      },
    },
    {
      name: 'get_dua',
      description:
        "Look up authenticated du'as (supplications) matching a life-context keyword (e.g. 'anxiety', 'morning', 'travel', 'grief'). Returns Arabic text, transliteration, translation, and source citation with hadith grading. Includes a mandatory crisis_resource block when the context contains a crisis keyword.",
      inputSchema: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'Free-form life context' },
          locale: {
            type: 'string',
            enum: ['en', 'id', 'ur', 'ar'],
            description: 'Translation locale; defaults to "en".',
          },
        },
        required: ['context'],
      },
    },
    {
      name: 'get_name_of_allah',
      description:
        'Look up one of the 99 Names of Allah by number (1-99) or by string (transliteration, Arabic, or English meaning). Returns Arabic, transliteration, locale-aware meaning, reflection, and Quranic references.',
      inputSchema: {
        type: 'object',
        properties: {
          number: { type: 'integer', minimum: 1, maximum: 99, description: 'Name number, 1-99' },
          name: {
            type: 'string',
            description: 'Transliteration, Arabic, or English meaning',
          },
          locale: {
            type: 'string',
            enum: ['en', 'id', 'ur', 'ar'],
            description: 'Translation locale; defaults to "en".',
          },
        },
      },
    },
  ],
  resources: [
    {
      uri: 'sakina://about',
      description:
        "Read-once briefing on the server's seven core directives and three educational dawah texts (Quran preservation, hadith grading, madhab attribution). Agents should fetch this resource before using the tools.",
    },
  ],
  capabilities: {
    rateLimit: {
      requestsPerWindow: 60,
      windowSeconds: 60,
      perIp: true,
    },
    privacy: {
      tracking: 'none',
      analytics: 'aggregate-only',
      logging:
        'in-memory aggregate counters only — per-tool call + status totals. No per-request records, no IPs, no client identifiers, no user-agents, no geolocation, no params, no response payloads. Counters reset on restart.',
    },
  },
} as const

/**
 * Wrap a tool handler so every call bumps the in-memory aggregate
 * counters (WO#360). Captures start time, status (ok / not_found /
 * error), and wall-clock duration only — no params, no per-request
 * record. Re-throws errors after counting so the transport's existing
 * error path still runs.
 */
function withLogging<Args extends Record<string, unknown>>(
  tool: ToolName,
  handler: (args: Args) => Promise<SakinaResponse<unknown>>,
): (args: Args) => Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  return async (args) => {
    const start = performance.now()
    let status: RequestStatus = 'ok'
    try {
      const response = await handler(args)
      if (response._sakina_meta?.content_type === 'not_found') {
        status = 'not_found'
      }
      return { content: [{ type: 'text', text: serialiseResponse(response) }] }
    } catch (err) {
      status = 'error'
      throw err
    } finally {
      logRequest({ tool, status, duration_ms: performance.now() - start })
    }
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
  })

  // ── Tools ─────────────────────────────────────────────────────────

  server.registerTool(
    GET_QURAN_VERSE_TITLE,
    {
      title: GET_QURAN_VERSE_TITLE,
      description: GET_QURAN_VERSE_DESCRIPTION,
      inputSchema: getQuranVerseShape,
    },
    withLogging('get_quran_verse', getQuranVerseHandler),
  )

  server.registerTool(
    GET_DUA_TITLE,
    {
      title: GET_DUA_TITLE,
      description: GET_DUA_DESCRIPTION,
      inputSchema: getDuaShape,
    },
    withLogging('get_dua', getDuaHandler),
  )

  server.registerTool(
    GET_NAME_TITLE,
    {
      title: GET_NAME_TITLE,
      description: GET_NAME_DESCRIPTION,
      inputSchema: getNameOfAllahShape,
    },
    withLogging('get_name_of_allah', getNameOfAllahHandler),
  )

  // ── Resources ─────────────────────────────────────────────────────

  server.registerResource(
    'about',
    'sakina://about',
    {
      title: 'About the AskSakina Islamic Knowledge Server',
      description:
        'Core directives + the three Gem-cleared educational texts (Quran preservation, hadith grading, madhab attribution). Read this resource before using the tools.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'sakina://about',
          mimeType: 'text/markdown',
          text: ABOUT_RESOURCE_BODY,
        },
      ],
    }),
  )

  return server
}

// ─── HTTP transport ─────────────────────────────────────────────────

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      if (!body) return resolve(undefined)
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Resolve the client IP for the rate limiter. The IP is used only for
 * the per-IP rate decision and geoip is no longer consulted (WO#360 —
 * geolocation collection removed); nothing derived from it is stored.
 */
function resolveClientIp(req: http.IncomingMessage): string {
  return extractClientIp(req) ?? 'unknown'
}

/**
 * Stateless Node.js HTTP server that exposes the MCP server at
 * `/mcp`. Returns a JSON 429 with rate-limit headers when the IP
 * exceeds its budget. Health-check at `/health`.
 */
export async function startHttpServer(port: number = Number(process.env.PORT ?? 3030)): Promise<http.Server> {
  const limiter = getRateLimiter()

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end()
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }))
      return
    }
    // WO#129 Task 1 — Smithery server-card.json discovery endpoint.
    // Smithery's auto-scanner fetches `/.well-known/mcp/server-card.json`
    // on first publish. Without this route the publish flow returned
    // "Initialization failed with status 404". The card mirrors the
    // .mcp/server.json registry entry but adds JSON-Schema-shaped tool
    // input descriptors that Smithery renders in its UI catalog.
    if (req.method === 'GET' && req.url === '/.well-known/mcp/server-card.json') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify(SERVER_CARD))
      return
    }
    // WO#137 — authenticated analytics endpoint. Returns 503 when the
    // MCP_STATS_TOKEN env var is unset (refuse to expose unauth'd).
    if (await handleStatsRequest(req, res)) return
    if (req.url !== '/mcp') {
      res.writeHead(404).end()
      return
    }

    const ip = resolveClientIp(req)
    // Defence in depth (WO#250): a limiter that throws must NEVER crash the
    // server. Fail open — the request proceeds without a rate decision. The
    // limiter impls already fail open internally; this is the last backstop.
    let rate: RateLimitResult
    try {
      rate = await limiter.check(ip)
    } catch (err) {
      console.error(
        '[mcp] rate-limiter threw, failing open:',
        err instanceof Error ? err.message : String(err),
      )
      rate = { allowed: true, remaining: RATE_LIMIT_BUDGET, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS }
    }
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_BUDGET))
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.floor(rate.resetAt / 1000)))
    if (!rate.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            code: -32029,
            message:
              "Rate limit exceeded. AskSakina's knowledge is freely available; please pace your requests.",
          },
        }),
      )
      return
    }

    let body: unknown
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: -32700, message: 'Parse error: invalid JSON' } }))
        return
      }
    }

    // WO#360 — the per-request AsyncLocalStorage context (country / client
    // / UA) that WO#140 propagated here fed the JSONL logger, which has
    // been removed. The transport is now invoked directly; the IP was
    // already consumed for the rate-limit decision and is not retained.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    })
    const mcp = createMcpServer()
    res.on('close', () => {
      transport.close().catch(() => {})
    })
    try {
      await mcp.connect(transport)
      // The transport's `req` parameter requires an optional AuthInfo
      // shape on `auth`. v1 ships unauthenticated; cast through unknown
      // to satisfy the SDK's typing without inventing an AuthInfo.
      await transport.handleRequest(
        req as unknown as Parameters<typeof transport.handleRequest>[0],
        res,
        body,
      )
    } catch (err) {
      console.error('[mcp] handler error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: -32603, message: 'Internal server error' } }))
      }
    }
  })

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(
        `[sakina-mcp] listening on :${port} (rate-limit ${RATE_LIMIT_BUDGET}/${RATE_LIMIT_WINDOW_MS / 1000}s per IP)`,
      )
      resolve(server)
    })
  })
}

// ── Entrypoint ───────────────────────────────────────────────────────

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('server.ts')

if (isMainModule) {
  startHttpServer().catch((err) => {
    console.error('[sakina-mcp] failed to start:', err)
    process.exit(1)
  })
}
