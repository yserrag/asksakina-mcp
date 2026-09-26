// Request analytics for the Sakina MCP server.
//
// Privacy-first, MINIMAL DATA (WO#360):
//   - In-memory AGGREGATE COUNTERS ONLY. We keep a running tally of how
//     many times each tool was called and how those calls resolved
//     (ok / not_found / error), plus the summed handler duration so
//     `/stats` can report an average response time.
//   - NO per-request records are written anywhere. Nothing is persisted
//     to disk. Nothing survives a process restart.
//   - NO IP addresses, NO user-agents, NO client identifiers, NO
//     geolocation, NO request params, NO response payloads. None of it
//     is collected — so the "minimal data" claim is literally true.
//
// Prior versions (WO#137 / WO#140) appended a JSONL row per request that
// carried country / region / client / user-agent context. That surface —
// the per-request log files and the AsyncLocalStorage context that fed
// them — was removed in WO#360, so the privacy claim now holds without
// qualification.

export type ToolName = 'get_quran_verse' | 'get_dua' | 'get_name_of_allah' | 'find_verses'
export type RequestStatus = 'ok' | 'not_found' | 'error'

export interface ToolCounter {
  ok: number
  not_found: number
  error: number
  total: number
  /** Summed handler wall-clock ms across all calls — divide by `total`
   *  for a mean. Aggregate only; never associated with a single call. */
  duration_ms_sum: number
}

export interface AggregateSnapshot {
  /** When the counters were last (re)set — i.e. process start. */
  since: string
  perTool: Record<ToolName, ToolCounter>
  total: number
}

const TOOLS: readonly ToolName[] = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses']

function emptyCounter(): ToolCounter {
  return { ok: 0, not_found: 0, error: 0, total: 0, duration_ms_sum: 0 }
}

function emptyCounters(): Record<ToolName, ToolCounter> {
  return {
    get_quran_verse: emptyCounter(),
    get_dua: emptyCounter(),
    get_name_of_allah: emptyCounter(),
    find_verses: emptyCounter(),
  }
}

let counters = emptyCounters()
let startedAt = new Date()

export interface LogRequestInput {
  tool: ToolName
  status: RequestStatus
  duration_ms: number
}

/**
 * Record one tool call in the in-memory aggregate. Never throws, never
 * blocks, never persists. Only the per-tool call / status / duration
 * tallies change — no request-specific data is retained.
 */
export function logRequest(entry: LogRequestInput): void {
  const c = counters[entry.tool]
  if (!c) return
  c.total += 1
  c.duration_ms_sum += Math.max(0, Math.round(entry.duration_ms))
  if (entry.status === 'ok') c.ok += 1
  else if (entry.status === 'not_found') c.not_found += 1
  else c.error += 1
}

/** Read-only snapshot for the `/stats` endpoint. */
export function getAggregateSnapshot(): AggregateSnapshot {
  let total = 0
  const perTool = {} as Record<ToolName, ToolCounter>
  for (const t of TOOLS) {
    perTool[t] = { ...counters[t] }
    total += counters[t].total
  }
  return { since: startedAt.toISOString(), perTool, total }
}

/** Exposed for tests — reset the in-memory counters. */
export function resetLoggerForTests(): void {
  counters = emptyCounters()
  startedAt = new Date()
}
