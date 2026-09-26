// `/stats` endpoint for the Sakina MCP server.
//
// Serves the in-memory AGGREGATE COUNTERS maintained by request-logger
// (per-tool call + status totals, plus summed duration for an average).
// There are no log files to read — per-request JSONL logging was removed
// in WO#360. The numbers reset when the process restarts; that is the
// deliberate cost of collecting nothing per request.
//
// Authentication:
//   - Bearer token via the `MCP_STATS_TOKEN` env var.
//   - If the env var is unset, /stats refuses to serve (503). This is
//     intentional — analytics must not be exposed by default.
//   - Token comparison is constant-time (timingSafeEqual).

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

import { getAggregateSnapshot, type ToolName } from './request-logger.js'
import { getLimiterStatus, type LimiterStatus } from '../safety/rate-limiter.js'
import { getBasmalaPrefixMismatchCount } from '../data/quran.js'

const ALL_TOOLS: readonly ToolName[] = [
  'get_quran_verse',
  'get_dua',
  'get_name_of_allah',
  'find_verses',
]

const BEARER_PREFIX = 'Bearer '

function authorise(req: http.IncomingMessage): boolean {
  const expected = process.env.MCP_STATS_TOKEN
  if (!expected) return false
  const header = req.headers['authorization']
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) return false
  const presented = header.slice(BEARER_PREFIX.length).trim()
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface ToolStatsPayload {
  total: number
  ok: number
  not_found: number
  error: number
  avg_response_ms: number
}

interface StatsPayload {
  privacy: string
  since: string
  total_requests: number
  by_tool: Record<string, ToolStatsPayload>
  /** WO#385: which limiter is enforcing the budget, and Upstash health. */
  rate_limiter: LimiterStatus
  /** WO#385: ayah-1 texts that started with neither recorded basmala
   *  prefix and were served unchanged. Aggregate only; no verse references. */
  basmala_prefix_mismatch: number
}

function buildPayload(): StatsPayload {
  const snap = getAggregateSnapshot()
  const by_tool: Record<string, ToolStatsPayload> = {}
  for (const t of ALL_TOOLS) {
    const c = snap.perTool[t]
    by_tool[t] = {
      total: c.total,
      ok: c.ok,
      not_found: c.not_found,
      error: c.error,
      avg_response_ms: c.total > 0 ? Math.round(c.duration_ms_sum / c.total) : 0,
    }
  }
  return {
    privacy:
      'aggregate-only in-memory counters; no per-request records, no IPs, no user-agents, no client identifiers, no geolocation, no params, no payloads; resets on restart',
    since: snap.since,
    total_requests: snap.total,
    by_tool,
    rate_limiter: getLimiterStatus(),
    basmala_prefix_mismatch: getBasmalaPrefixMismatchCount(),
  }
}

/**
 * Handle a GET /stats request. Returns true if the request was handled
 * (response written), false if the caller should fall through to the
 * next route.
 */
export function handleStatsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  if (req.method !== 'GET' || req.url !== '/stats') return false

  if (!process.env.MCP_STATS_TOKEN) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'MCP_STATS_TOKEN not configured; /stats endpoint disabled.',
      }),
    )
    return true
  }

  if (!authorise(req)) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="sakina-mcp-stats"',
    })
    res.end(JSON.stringify({ error: 'Unauthorised' }))
    return true
  }

  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(buildPayload()))
  return true
}

export { ALL_TOOLS }
