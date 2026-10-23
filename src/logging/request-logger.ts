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
//     The one exception (WO#488 Part B): the `audience` argument is
//     tallied by its fixed values (curious, revert, practising, unknown,
//     or absent), in one total across all tools; the value is never
//     stored with the call, the tool or anything else.
//   - WO#488 Part B also counts, per tool, the responses that carried a
//     teach block, and, per registered prompt name, the prompt fetches.
//     Prompt arguments are never read.
//
// Prior versions (WO#137 / WO#140) appended a JSONL row per request that
// carried country / region / client / user-agent context. That surface —
// the per-request log files and the AsyncLocalStorage context that fed
// them — was removed in WO#360, so the privacy claim now holds without
// qualification.

import { getDailyStore } from './daily-store.js'
import { audienceBucket, PROMPT_NAMES, type AudienceBucket, type PromptName } from './counter-keys.js'

export type ToolName = 'get_quran_verse' | 'get_dua' | 'get_name_of_allah' | 'find_verses'
export type RequestStatus = 'ok' | 'not_found' | 'error'

export { AUDIENCE_BUCKETS, audienceBucket, PROMPT_NAMES, type AudienceBucket, type PromptName } from './counter-keys.js'

export interface ToolCounter {
  ok: number
  not_found: number
  error: number
  total: number
  /** Summed handler wall-clock ms across all calls — divide by `total`
   *  for a mean. Aggregate only; never associated with a single call. */
  duration_ms_sum: number
  /** WO#488: responses that carried a teach block. */
  teach_served: number
}

export interface AggregateSnapshot {
  /** When the counters were last (re)set — i.e. process start. */
  since: string
  perTool: Record<ToolName, ToolCounter>
  total: number
  /** WO#488: tool calls by audience value, across all tools. */
  audience: Record<AudienceBucket, number>
  /** WO#488: prompt fetches by prompt name. */
  prompts: Record<PromptName, number>
}

const TOOLS: readonly ToolName[] = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses']

function emptyCounter(): ToolCounter {
  return { ok: 0, not_found: 0, error: 0, total: 0, duration_ms_sum: 0, teach_served: 0 }
}

function emptyCounters(): Record<ToolName, ToolCounter> {
  return {
    get_quran_verse: emptyCounter(),
    get_dua: emptyCounter(),
    get_name_of_allah: emptyCounter(),
    find_verses: emptyCounter(),
  }
}

export const emptyAudience = (): Record<AudienceBucket, number> => ({ curious: 0, revert: 0, practising: 0, unknown: 0, absent: 0 })
export const emptyPrompts = (): Record<PromptName, number> => ({ understand_a_verse: 0, explore_names_of_allah: 0 })

let counters = emptyCounters()
let audience = emptyAudience()
let prompts = emptyPrompts()
let startedAt = new Date()

export interface LogRequestInput {
  tool: ToolName
  status: RequestStatus
  duration_ms: number
  /** WO#488: the response carried a teach block. */
  teach_served?: boolean
  /** WO#488: the call's `audience` argument; only its bucket is kept. */
  audience?: unknown
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
  if (entry.teach_served) c.teach_served += 1
  const bucket = audienceBucket(entry.audience)
  audience[bucket] += 1
  // WO#456: the same three outcomes and duration, added to today's total on
  // disk when the HTTP server enabled the daily store. WO#488: and the teach
  // flag and the audience bucket. Nothing else is passed.
  getDailyStore()?.record(entry.tool, entry.status, entry.duration_ms, Boolean(entry.teach_served), bucket)
}

/**
 * WO#488 Part B: count one fetch of a registered prompt. Only the name is
 * taken; the prompt's arguments never reach this function.
 */
export function logPromptFetch(name: PromptName): void {
  if (!(PROMPT_NAMES as readonly string[]).includes(name)) return
  prompts[name] += 1
  getDailyStore()?.recordPrompt(name)
}

/** Read-only snapshot for the `/stats` endpoint. */
export function getAggregateSnapshot(): AggregateSnapshot {
  let total = 0
  const perTool = {} as Record<ToolName, ToolCounter>
  for (const t of TOOLS) {
    perTool[t] = { ...counters[t] }
    total += counters[t].total
  }
  return { since: startedAt.toISOString(), perTool, total, audience: { ...audience }, prompts: { ...prompts } }
}

/** Exposed for tests — reset the in-memory counters. */
export function resetLoggerForTests(): void {
  counters = emptyCounters()
  audience = emptyAudience()
  prompts = emptyPrompts()
  startedAt = new Date()
}
