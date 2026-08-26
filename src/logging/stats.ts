// /stats endpoint for the Sakina MCP server (WO#137 + WO#140).
//
// Reads all JSONL log files in the log directory, aggregates totals
// by time window + tool + country + client, and returns popular
// topics plus average response time and error rates.
//
// Authentication:
//   - Bearer token via the `MCP_STATS_TOKEN` env var.
//   - If the env var is unset, /stats refuses to serve (503). This
//     is intentional — analytics must not leak by default.
//   - Token comparison is constant-time (timingSafeEqual).
//
// Storage assumption:
//   - JSONL files named requests-YYYY-MM-DD.jsonl in `getLogDir()`.
//   - Linear scan. For the v1 traffic level (lookups, low volume)
//     this is acceptable; if call volume grows past ~1M lines we
//     should swap for SQLite/DuckDB.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

import { getLogDir, type RequestLogEntry, type ToolName } from './request-logger.js'

const ALL_TOOLS: readonly ToolName[] = [
  'get_quran_verse',
  'get_dua',
  'get_name_of_allah',
]

const TOP_N = 10
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface ToolStats {
  all_time: number
  last_7d: number
  last_24h: number
}

interface ErrorRates {
  all_time: number
  last_7d: number
  last_24h: number
}

interface AvgResponseTime {
  all_time: number
  last_7d: number
  last_24h: number
}

interface CountryWindow {
  last_7d: Array<{ country_code: string; count: number }>
  all_time: Array<{ country_code: string; count: number }>
}

interface ClientWindow {
  last_7d: Record<string, number>
  all_time: Record<string, number>
}

export interface StatsPayload {
  generated_at: string
  log_dir: string
  totals: ToolStats
  by_tool: Record<ToolName, ToolStats>
  by_status: Record<'ok' | 'not_found' | 'error', number>
  error_rate: ErrorRates
  /** Overall + per-tool average response time, ms. */
  avg_response_time_ms: AvgResponseTime & {
    by_tool: Record<ToolName, AvgResponseTime>
  }
  top_contexts: Array<{ context: string; count: number }>
  top_verses: Array<{ ref: string; count: number }>
  // WO#140 new aggregations
  by_country: CountryWindow
  by_client: ClientWindow
  /** Combined view: top get_dua contexts + top get_quran_verse refs (last 7d). */
  popular_topics: Array<{ kind: 'dua_context' | 'quran_verse'; key: string; count: number }>
  oldest_entry: string | null
  newest_entry: string | null
}

function emptyToolStats(): ToolStats {
  return { all_time: 0, last_7d: 0, last_24h: 0 }
}

function emptyAvg(): AvgResponseTime {
  return { all_time: 0, last_7d: 0, last_24h: 0 }
}

async function listLogFiles(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return names
    .filter((n) => n.startsWith('requests-') && n.endsWith('.jsonl'))
    .sort()
    .map((n) => path.join(dir, n))
}

function parseLine(line: string): RequestLogEntry | null {
  if (!line) return null
  try {
    const parsed = JSON.parse(line) as RequestLogEntry
    if (
      typeof parsed.ts === 'string' &&
      typeof parsed.tool === 'string' &&
      typeof parsed.status === 'string' &&
      typeof parsed.duration_ms === 'number' &&
      parsed.params &&
      typeof parsed.params === 'object'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function pickResponseTime(entry: RequestLogEntry): number {
  // Prefer the new field; fall back to the WO#137 field so older
  // log lines still contribute to the rolling average.
  if (typeof entry.response_time_ms === 'number') return entry.response_time_ms
  if (typeof entry.duration_ms === 'number') return entry.duration_ms
  return 0
}

interface RunningAvg {
  sum: number
  count: number
}
function emptyRun(): RunningAvg {
  return { sum: 0, count: 0 }
}
function avg(r: RunningAvg): number {
  return r.count === 0 ? 0 : Number((r.sum / r.count).toFixed(1))
}

function topNFromMap<T>(
  map: Map<string, number>,
  build: (key: string, count: number) => T,
): T[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([key, count]) => build(key, count))
}

export async function aggregateStats(now: Date = new Date()): Promise<StatsPayload> {
  const logDir = getLogDir()
  const files = await listLogFiles(logDir)

  const sevenDaysAgo = now.getTime() - 7 * MS_PER_DAY
  const twentyFourHoursAgo = now.getTime() - MS_PER_DAY

  const totals = emptyToolStats()
  const byTool: Record<ToolName, ToolStats> = {
    get_quran_verse: emptyToolStats(),
    get_dua: emptyToolStats(),
    get_name_of_allah: emptyToolStats(),
  }
  const byStatus = { ok: 0, not_found: 0, error: 0 }
  const errors: ToolStats = emptyToolStats()
  const contextCounts = new Map<string, number>()
  const contextCounts7d = new Map<string, number>()
  const verseCounts = new Map<string, number>()
  const verseCounts7d = new Map<string, number>()
  const countryAll = new Map<string, number>()
  const country7d = new Map<string, number>()
  const clientAll: Record<string, number> = {}
  const client7d: Record<string, number> = {}

  // Running averages
  const rtTotal = emptyRun()
  const rt7d = emptyRun()
  const rt24h = emptyRun()
  const rtByTool: Record<ToolName, { all: RunningAvg; d7: RunningAvg; d24: RunningAvg }> = {
    get_quran_verse: { all: emptyRun(), d7: emptyRun(), d24: emptyRun() },
    get_dua: { all: emptyRun(), d7: emptyRun(), d24: emptyRun() },
    get_name_of_allah: { all: emptyRun(), d7: emptyRun(), d24: emptyRun() },
  }

  let oldest: string | null = null
  let newest: string | null = null

  for (const file of files) {
    let body: string
    try {
      body = await fs.readFile(file, 'utf8')
    } catch (err) {
      console.error('[stats] read failed:', file, (err as Error).message)
      continue
    }
    for (const raw of body.split('\n')) {
      const entry = parseLine(raw)
      if (!entry) continue
      const tMs = Date.parse(entry.ts)
      if (Number.isNaN(tMs)) continue

      if (!oldest || entry.ts < oldest) oldest = entry.ts
      if (!newest || entry.ts > newest) newest = entry.ts

      const rt = pickResponseTime(entry)
      totals.all_time += 1
      rtTotal.sum += rt
      rtTotal.count += 1
      const tool = byTool[entry.tool as ToolName]
      const toolRt = rtByTool[entry.tool as ToolName]
      if (tool) tool.all_time += 1
      if (toolRt) {
        toolRt.all.sum += rt
        toolRt.all.count += 1
      }

      if (entry.status === 'error') errors.all_time += 1
      if (entry.status in byStatus) {
        byStatus[entry.status as keyof typeof byStatus] += 1
      }

      // Country + client — always tracked (lifetime); 7d below.
      if (entry.country_code) {
        countryAll.set(
          entry.country_code,
          (countryAll.get(entry.country_code) ?? 0) + 1,
        )
      }
      if (entry.client) {
        clientAll[entry.client] = (clientAll[entry.client] ?? 0) + 1
      }

      if (tMs >= sevenDaysAgo) {
        totals.last_7d += 1
        rt7d.sum += rt
        rt7d.count += 1
        if (tool) tool.last_7d += 1
        if (toolRt) {
          toolRt.d7.sum += rt
          toolRt.d7.count += 1
        }
        if (entry.status === 'error') errors.last_7d += 1
        if (entry.country_code) {
          country7d.set(
            entry.country_code,
            (country7d.get(entry.country_code) ?? 0) + 1,
          )
        }
        if (entry.client) {
          client7d[entry.client] = (client7d[entry.client] ?? 0) + 1
        }
        if (entry.tool === 'get_dua') {
          const ctx = entry.params['context']
          if (typeof ctx === 'string' && ctx.length > 0) {
            contextCounts7d.set(ctx, (contextCounts7d.get(ctx) ?? 0) + 1)
          }
        }
        if (entry.tool === 'get_quran_verse') {
          const surah = entry.params['surah']
          const ayah = entry.params['ayah']
          if (typeof surah === 'number' && typeof ayah === 'number') {
            const ref = `${surah}:${ayah}`
            verseCounts7d.set(ref, (verseCounts7d.get(ref) ?? 0) + 1)
          }
        }
      }
      if (tMs >= twentyFourHoursAgo) {
        totals.last_24h += 1
        rt24h.sum += rt
        rt24h.count += 1
        if (tool) tool.last_24h += 1
        if (toolRt) {
          toolRt.d24.sum += rt
          toolRt.d24.count += 1
        }
        if (entry.status === 'error') errors.last_24h += 1
      }

      // Lifetime context / verse maps (preserved from WO#137)
      if (entry.tool === 'get_dua') {
        const ctx = entry.params['context']
        if (typeof ctx === 'string' && ctx.length > 0) {
          contextCounts.set(ctx, (contextCounts.get(ctx) ?? 0) + 1)
        }
      }
      if (entry.tool === 'get_quran_verse') {
        const surah = entry.params['surah']
        const ayah = entry.params['ayah']
        if (typeof surah === 'number' && typeof ayah === 'number') {
          const ref = `${surah}:${ayah}`
          verseCounts.set(ref, (verseCounts.get(ref) ?? 0) + 1)
        }
      }
    }
  }

  const topContexts = topNFromMap(contextCounts, (context, count) => ({
    context,
    count,
  }))
  const topVerses = topNFromMap(verseCounts, (ref, count) => ({ ref, count }))

  // Popular-topics merges du'a contexts + Quran verses ranked together
  // for a single "what are agents asking about right now" view (last 7d).
  const popularTopics: Array<{
    kind: 'dua_context' | 'quran_verse'
    key: string
    count: number
  }> = [
    ...[...contextCounts7d.entries()].map(([key, count]) => ({
      kind: 'dua_context' as const,
      key,
      count,
    })),
    ...[...verseCounts7d.entries()].map(([key, count]) => ({
      kind: 'quran_verse' as const,
      key,
      count,
    })),
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)

  const byCountry: CountryWindow = {
    last_7d: topNFromMap(country7d, (country_code, count) => ({
      country_code,
      count,
    })),
    all_time: topNFromMap(countryAll, (country_code, count) => ({
      country_code,
      count,
    })),
  }

  const byClient: ClientWindow = {
    last_7d: client7d,
    all_time: clientAll,
  }

  const rate = (errs: number, total: number): number =>
    total === 0 ? 0 : Number((errs / total).toFixed(4))

  return {
    generated_at: now.toISOString(),
    log_dir: logDir,
    totals,
    by_tool: byTool,
    by_status: byStatus,
    error_rate: {
      all_time: rate(errors.all_time, totals.all_time),
      last_7d: rate(errors.last_7d, totals.last_7d),
      last_24h: rate(errors.last_24h, totals.last_24h),
    },
    avg_response_time_ms: {
      all_time: avg(rtTotal),
      last_7d: avg(rt7d),
      last_24h: avg(rt24h),
      by_tool: {
        get_quran_verse: {
          all_time: avg(rtByTool.get_quran_verse.all),
          last_7d: avg(rtByTool.get_quran_verse.d7),
          last_24h: avg(rtByTool.get_quran_verse.d24),
        },
        get_dua: {
          all_time: avg(rtByTool.get_dua.all),
          last_7d: avg(rtByTool.get_dua.d7),
          last_24h: avg(rtByTool.get_dua.d24),
        },
        get_name_of_allah: {
          all_time: avg(rtByTool.get_name_of_allah.all),
          last_7d: avg(rtByTool.get_name_of_allah.d7),
          last_24h: avg(rtByTool.get_name_of_allah.d24),
        },
      },
    },
    top_contexts: topContexts,
    top_verses: topVerses,
    by_country: byCountry,
    by_client: byClient,
    popular_topics: popularTopics,
    oldest_entry: oldest,
    newest_entry: newest,
  }
}

const BEARER_PREFIX = 'Bearer '

function authorise(req: http.IncomingMessage): boolean {
  const expected = process.env.MCP_STATS_TOKEN
  if (!expected) return false
  const header = req.headers['authorization']
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return false
  }
  const presented = header.slice(BEARER_PREFIX.length).trim()
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Handle a GET /stats request. Returns true if the request was
 * handled (response written), false if the caller should fall
 * through to the next route.
 */
export async function handleStatsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
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

  try {
    const payload = await aggregateStats()
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(payload))
  } catch (err) {
    console.error('[stats] aggregation failed:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Stats aggregation failed' }))
  }
  return true
}

export { ALL_TOOLS }
