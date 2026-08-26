// Request logger for the Sakina MCP server (WO#137 + WO#140).
//
// Privacy-first analytics:
//   - No IP addresses, no client identifiers (cookies/tokens), no
//     response payloads, no free-form user narrative.
//   - The HTTP dispatcher resolves the client IP once to (a) check
//     the rate-limit and (b) look up country/region via the embedded
//     MaxMind database — the IP itself is discarded immediately.
//   - The `context` parameter on get_dua is a category keyword
//     ("anxiety", "morning", "grief") per the tool contract; it is
//     logged so we can answer "which life situations do agents query
//     most" without ever associating it with a person.
//   - User-Agent is logged truncated so the Architect can spot a new
//     MCP client and extend the matcher list; the classified `client`
//     bucket is what /stats actually aggregates.
//
// Storage:
//   - Append-only JSONL, one line per request.
//   - Daily rotation: requests-YYYY-MM-DD.jsonl.
//   - Default directory `${LOG_DIR}` (env var) or `/data/logs` (Fly
//     volume mount). Falls back to ./logs/ for local dev.
//   - Writes are fire-and-forget — a slow disk must not bleed into
//     tool response latency. Write failures log to stderr and are
//     dropped.

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getRequestContext } from './request-context.js'

export type ToolName = 'get_quran_verse' | 'get_dua' | 'get_name_of_allah'
export type RequestStatus = 'ok' | 'not_found' | 'error'

export interface RequestLogEntry {
  ts: string
  tool: ToolName
  params: Record<string, unknown>
  status: RequestStatus
  /** Wall-clock duration of the tool handler. Kept for back-compat with
   *  WO#137 logs; `response_time_ms` is the new canonical name. */
  duration_ms: number
  response_time_ms: number
  /** Convenience boolean for dashboards — true iff status === 'error'. */
  error: boolean
  /** Optional short error classifier (e.g. 'timeout', 'upstream_404'). */
  error_type?: string
  // WO#140 — request context (populated when AsyncLocalStorage carries it)
  country_code?: string
  region?: string
  client?: string
  user_agent?: string
}

const DEFAULT_LOG_DIR = '/data/logs'
const FALLBACK_LOG_DIR = './logs'
const MAX_CONTEXT_CHARS = 200

let cachedLogDir: string | null = null
let ensureDirPromise: Promise<void> | null = null

export function getLogDir(): string {
  if (cachedLogDir) return cachedLogDir
  const envDir = process.env.LOG_DIR?.trim()
  if (envDir) {
    cachedLogDir = envDir
  } else if (process.env.NODE_ENV === 'production') {
    cachedLogDir = DEFAULT_LOG_DIR
  } else {
    cachedLogDir = FALLBACK_LOG_DIR
  }
  return cachedLogDir
}

function ensureLogDir(dir: string): Promise<void> {
  if (!ensureDirPromise) {
    ensureDirPromise = fs.mkdir(dir, { recursive: true }).then(
      () => {},
      (err) => {
        ensureDirPromise = null
        throw err
      },
    )
  }
  return ensureDirPromise
}

function dailyFilename(ts: Date): string {
  const yyyy = ts.getUTCFullYear()
  const mm = String(ts.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ts.getUTCDate()).padStart(2, '0')
  return `requests-${yyyy}-${mm}-${dd}.jsonl`
}

/**
 * Strip parameters down to what is safe + useful for analytics.
 * Keeps the integer/short-string keys; truncates the free-form
 * `context` defensively in case an agent ever sends a long string.
 */
export function sanitiseParams(
  tool: ToolName,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') {
      out[k] = k === 'context' ? v.slice(0, MAX_CONTEXT_CHARS) : v
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  void tool
  return out
}

export interface LogRequestInput {
  tool: ToolName
  params: Record<string, unknown>
  status: RequestStatus
  duration_ms: number
  error_type?: string
}

/**
 * Append a single request log entry. Fire-and-forget — never throws,
 * never blocks the caller. Write errors go to stderr.
 *
 * Pulls per-request context (country, client, UA) from
 * AsyncLocalStorage so callers do not have to thread it through.
 */
export function logRequest(entry: LogRequestInput): void {
  const ts = new Date()
  const ctx = getRequestContext()
  const ms = Math.round(entry.duration_ms)

  const record: RequestLogEntry = {
    ts: ts.toISOString(),
    tool: entry.tool,
    params: sanitiseParams(entry.tool, entry.params),
    status: entry.status,
    duration_ms: ms,
    response_time_ms: ms,
    error: entry.status === 'error',
  }
  if (entry.error_type) record.error_type = entry.error_type
  if (ctx?.country_code) record.country_code = ctx.country_code
  if (ctx?.region) record.region = ctx.region
  if (ctx?.client) record.client = ctx.client
  if (ctx?.user_agent) record.user_agent = ctx.user_agent

  const line = JSON.stringify(record) + '\n'
  const dir = getLogDir()
  const file = path.join(dir, dailyFilename(ts))

  void ensureLogDir(dir)
    .then(() => fs.appendFile(file, line, 'utf8'))
    .catch((err) => {
      console.error('[request-logger] write failed:', (err as Error).message)
    })
}

/** Exposed for tests — reset the cached log directory + mkdir promise. */
export function resetLoggerForTests(): void {
  cachedLogDir = null
  ensureDirPromise = null
}
