// Daily per-tool usage totals on the server's own disk (WO#456).
//
// Same rule as the in-memory counters (WO#360), with one difference: these
// totals survive a restart. For each tool and each UTC day, the store keeps
// five numbers and nothing else:
//
//   ok, not_found, error   - how many calls ended each way
//   duration_ms_sum        - their summed handler time, for an average
//   teach_served           - how many carried a teach block (WO#488)
//
// and, per UTC day across all tools (WO#488), the tally of `audience`
// values (five fixed keys) and the fetches of each registered prompt.
//
// NO IP addresses, user agents, client identifiers, times of individual
// calls, request params or response payloads. The serialiser below builds
// every file from the allowed keys only, so nothing else can reach disk.
//
// Where: one file per UTC day, `<dir>/<YYYY-MM-DD>.json`. The HTTP server
// enables the store only when MCP_USAGE_DIR is set (fly.toml sets it to the
// mounted volume). stdio sessions and local `npx` runs never write anything.
//
// When: increments are held in memory and added to the day's file on a
// timer, and once more on SIGINT / SIGTERM (Fly stops an idle machine with
// SIGINT). A crash loses at most the increments since the last write.
//
// Retention: at most RETENTION_DAYS days (today and the 89 before it). Each
// write deletes older day files.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { RequestStatus, ToolName } from './request-logger.js'
import { AUDIENCE_BUCKETS, PROMPT_NAMES, type AudienceBucket, type PromptName } from './counter-keys.js'

export const RETENTION_DAYS = 90
export const FLUSH_INTERVAL_MS = 5 * 60 * 1000

const TOOLS: readonly ToolName[] = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses']
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/

export interface DailyToolCounts {
  ok: number
  not_found: number
  error: number
  duration_ms_sum: number
  teach_served: number
}

export interface DailyFile {
  date: string
  by_tool: Record<ToolName, DailyToolCounts>
  audience: Record<AudienceBucket, number>
  prompts: Record<PromptName, number>
}

const zero = (): DailyToolCounts => ({ ok: 0, not_found: 0, error: 0, duration_ms_sum: 0, teach_served: 0 })
const zeroDay = (date: string): DailyFile => ({
  date,
  by_tool: { get_quran_verse: zero(), get_dua: zero(), get_name_of_allah: zero(), find_verses: zero() },
  audience: Object.fromEntries(AUDIENCE_BUCKETS.map((b) => [b, 0])) as Record<AudienceBucket, number>,
  prompts: Object.fromEntries(PROMPT_NAMES.map((n) => [n, 0])) as Record<PromptName, number>,
})

/** UTC calendar day of `when`, as YYYY-MM-DD. */
export function utcDay(when: Date): string {
  return when.toISOString().slice(0, 10)
}

/** The oldest UTC day kept on `today`: today and the RETENTION_DAYS - 1 days before it. */
export function oldestKeptDay(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (RETENTION_DAYS - 1))
  return utcDay(d)
}

const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)

/**
 * The only way a day's data is shaped for disk or for /stats: the allowed
 * keys, copied one by one as non-negative integers. Any other key in the
 * input, from memory or from an existing file, is dropped.
 */
export function sanitiseDay(date: string, input: unknown): DailyFile {
  const out = zeroDay(date)
  const src = input as { by_tool?: Record<string, unknown>; audience?: Record<string, unknown>; prompts?: Record<string, unknown> } | null
  // WO#488: a day file written before 2.4.0 has no audience or prompts; it
  // reads as zeros, which is right (nothing was counted then).
  const audience = src?.audience
  if (audience && typeof audience === 'object') for (const b of AUDIENCE_BUCKETS) out.audience[b] = count(audience[b])
  const prompts = src?.prompts
  if (prompts && typeof prompts === 'object') for (const n of PROMPT_NAMES) out.prompts[n] = count(prompts[n])
  const byTool = src?.by_tool
  if (!byTool || typeof byTool !== 'object') return out
  for (const t of TOOLS) {
    const c = byTool[t] as Partial<DailyToolCounts> | undefined
    if (!c || typeof c !== 'object') continue
    out.by_tool[t] = {
      ok: count(c.ok),
      not_found: count(c.not_found),
      error: count(c.error),
      duration_ms_sum: count(c.duration_ms_sum),
      teach_served: count(c.teach_served),
    }
  }
  return out
}

function addInto(target: DailyFile, add: DailyFile): void {
  for (const t of TOOLS) {
    const a = target.by_tool[t]
    const b = add.by_tool[t]
    a.ok += b.ok
    a.not_found += b.not_found
    a.error += b.error
    a.duration_ms_sum += b.duration_ms_sum
    a.teach_served += b.teach_served
  }
  for (const k of AUDIENCE_BUCKETS) target.audience[k] += add.audience[k]
  for (const n of PROMPT_NAMES) target.prompts[n] += add.prompts[n]
}

export class DailyUsageStore {
  /** Increments not yet written, by UTC day. */
  private pending = new Map<string, DailyFile>()

  constructor(
    readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): DailyFile {
    const day = utcDay(this.now())
    let d = this.pending.get(day)
    if (!d) this.pending.set(day, (d = zeroDay(day)))
    return d
  }

  /**
   * Count one tool call against the UTC day it ended on: its outcome and
   * duration, whether it carried teach, and its audience bucket (WO#488).
   * No other data is taken.
   */
  record(tool: ToolName, status: RequestStatus, durationMs: number, teachServed = false, audience: AudienceBucket = 'absent'): void {
    if (!TOOLS.includes(tool)) return
    const d = this.today()
    const c = d.by_tool[tool]
    if (status === 'ok') c.ok += 1
    else if (status === 'not_found') c.not_found += 1
    else c.error += 1
    c.duration_ms_sum += Math.max(0, Math.round(durationMs))
    if (teachServed) c.teach_served += 1
    d.audience[AUDIENCE_BUCKETS.includes(audience) ? audience : 'absent'] += 1
  }

  /** WO#488: count one prompt fetch against today, by name only. */
  recordPrompt(name: PromptName): void {
    if (!PROMPT_NAMES.includes(name)) return
    this.today().prompts[name] += 1
  }

  private file(day: string): string {
    return path.join(this.dir, `${day}.json`)
  }

  private readDay(day: string): DailyFile {
    const p = this.file(day)
    if (!existsSync(p)) return zeroDay(day)
    try {
      return sanitiseDay(day, JSON.parse(readFileSync(p, 'utf8')))
    } catch {
      return zeroDay(day)
    }
  }

  /** Days on disk, newest first. Only files named YYYY-MM-DD.json count. */
  storedDays(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .map((n) => DAY_FILE.exec(n)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort()
      .reverse()
  }

  /**
   * Add the pending increments to their day files, then delete day files
   * older than the retention window. Synchronous, so a signal handler can
   * finish it before the process exits. Never throws.
   */
  flush(): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      const oldest = oldestKeptDay(utcDay(this.now()))
      for (const [day, add] of this.pending) {
        if (day < oldest) continue
        const merged = this.readDay(day)
        addInto(merged, add)
        const tmp = `${this.file(day)}.tmp`
        writeFileSync(tmp, JSON.stringify(sanitiseDay(day, merged)) + '\n')
        renameSync(tmp, this.file(day))
      }
      this.pending.clear()
      for (const day of this.storedDays()) {
        if (day < oldest) unlinkSync(this.file(day))
      }
    } catch (err) {
      console.error('[usage] daily totals not written:', err instanceof Error ? err.message : String(err))
    }
  }

  /** Stored days plus pending increments, newest first, within retention. */
  days(): DailyFile[] {
    const oldest = oldestKeptDay(utcDay(this.now()))
    const all = new Set([...this.storedDays(), ...this.pending.keys()])
    return [...all]
      .filter((d) => d >= oldest)
      .sort()
      .reverse()
      .map((day) => {
        const d = this.readDay(day)
        const p = this.pending.get(day)
        if (p) addInto(d, p)
        return d
      })
  }
}

// ─── process-wide store (HTTP server only) ─────────────────────────

let active: DailyUsageStore | null = null
let timer: NodeJS.Timeout | null = null

export function getDailyStore(): DailyUsageStore | null {
  return active
}

/**
 * Turn on the daily store for this process: a flush timer, and a final
 * flush on SIGINT / SIGTERM before exiting. Called by the HTTP server when
 * MCP_USAGE_DIR is set; never by the stdio server.
 */
export function enableDailyStore(dir: string): DailyUsageStore {
  if (active) return active
  active = new DailyUsageStore(dir)
  timer = setInterval(() => active?.flush(), FLUSH_INTERVAL_MS)
  timer.unref()
  const stop = (signal: NodeJS.Signals) => {
    active?.flush()
    console.log(`[usage] daily totals written on ${signal}`)
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  console.log(`[usage] daily per-tool totals kept in ${dir} (at most ${RETENTION_DAYS} days)`)
  return active
}
