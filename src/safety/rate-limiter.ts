/**
 * Rate limiter for the MCP server (WO#102).
 *
 * Two implementations under one interface:
 *
 *   - In-memory fixed window — used when Upstash is not configured
 *     (state: memory), and as the fallback whenever an Upstash call fails
 *     (state: degraded). Each process keeps its own buckets, so behind a
 *     load balancer the effective limit is N × the configured limit.
 *   - Upstash Redis fixed window — used when both
 *     `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
 *     (state: upstash). Distributed; suitable for production.
 *
 * WO#385: an Upstash failure never allows all traffic. It is logged and the
 * request is decided by the in-memory fallback.
 *
 * Default budget: 60 requests per minute per IP (WO#102 spec).
 */

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = 60
const UPSTASH_TIMEOUT_MS = 2_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface RateLimiter {
  check(key: string): Promise<RateLimitResult>
}

/**
 * In-memory fixed window keyed by client IP.
 *
 * Privacy (Gem 8, 1.4.0): an IP is held only for its rate-limit window.
 * Expired buckets are swept on every check and by a background timer, so an
 * IP is discarded at most `sweepMs` after its window ends, whether or not
 * that client returns. Before this, a bucket was only overwritten when the
 * same IP came back, so every IP stayed in memory until the process
 * restarted. The timer is unref'd and never keeps the process alive.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>()
  private lastSweep = 0

  constructor(
    private readonly windowMs: number = WINDOW_MS,
    private readonly sweepMs: number = 1_000,
  ) {
    const timer = setInterval(() => this.sweep(Date.now()), this.sweepMs)
    timer.unref?.()
  }

  private sweep(now: number): void {
    this.lastSweep = now
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }

  /** Number of IPs currently held. Exposed for tests. */
  size(): number {
    return this.buckets.size
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    if (now - this.lastSweep >= this.sweepMs) this.sweep(now)
    const existing = this.buckets.get(key)
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs
      this.buckets.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: DEFAULT_LIMIT - 1, resetAt }
    }
    if (existing.count >= DEFAULT_LIMIT) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt }
    }
    existing.count += 1
    return {
      allowed: true,
      remaining: DEFAULT_LIMIT - existing.count,
      resetAt: existing.resetAt,
    }
  }
}

/**
 * Limiter state, exposed in /stats (WO#385).
 *   upstash   Upstash configured and the last Upstash call succeeded.
 *   degraded  Upstash configured, but the last call failed: requests are
 *             being limited by the in-memory fallback, NOT allowed through.
 *   memory    Upstash not configured: in-memory limiting by design.
 */
export type LimiterState = 'upstash' | 'memory' | 'degraded'

export interface LimiterStatus {
  state: LimiterState
  upstash_configured: boolean
  /** Upstash failures since start (non-2xx, per-command error, bad body, network). */
  upstash_failures: number
  last_failure: string | null
  last_failure_at: string | null
  last_success_at: string | null
  /** Result of the startup reachability check (PING), or null before it runs. */
  startup_check: string | null
}

/**
 * Upstash Redis fixed window with an in-memory fallback (WO#385).
 *
 * Before WO#385 every Upstash failure failed OPEN: a 401 (bad token), 404
 * (database deleted) or per-command error allowed every request and logged
 * nothing. Now any failure is logged (status and reason, never the client IP
 * or the Redis key, which contains it) and the request is decided by the
 * in-memory limiter instead, so the budget still holds per process.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly fallback: InMemoryRateLimiter
  private readonly status: LimiterStatus = {
    state: 'upstash',
    upstash_configured: true,
    upstash_failures: 0,
    last_failure: null,
    last_failure_at: null,
    last_success_at: null,
    startup_check: null,
  }

  constructor(
    private readonly url: string,
    private readonly token: string,
    fallback?: InMemoryRateLimiter,
  ) {
    this.fallback = fallback ?? new InMemoryRateLimiter()
  }

  getStatus(): LimiterStatus {
    return { ...this.status }
  }

  private fail(reason: string): void {
    this.status.state = 'degraded'
    this.status.upstash_failures += 1
    this.status.last_failure = reason
    this.status.last_failure_at = new Date().toISOString()
    console.error(`[rate-limiter] Upstash failure (${reason}); using in-memory fallback (state: degraded)`)
  }

  private succeed(): void {
    if (this.status.state === 'degraded') {
      console.log('[rate-limiter] Upstash recovered (state: upstash)')
    }
    this.status.state = 'upstash'
    this.status.last_success_at = new Date().toISOString()
  }

  /** Short, IP-free description of a response body for logs. */
  private static brief(text: string): string {
    return text.replace(/\s+/g, ' ').slice(0, 120)
  }

  private async pipeline(commands: unknown[]): Promise<{ ok: true; data: Array<{ result?: unknown; error?: string }> } | { ok: false; reason: string }> {
    let res: Response
    try {
      res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
        // A hanging Upstash must not hang every request: 2 s, then fallback.
        signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
      })
    } catch (err) {
      return { ok: false, reason: `unreachable: ${err instanceof Error ? err.message : String(err)}` }
    }
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}${text ? `: ${UpstashRateLimiter.brief(text)}` : ''}` }
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, reason: `HTTP ${res.status} with a non-JSON body` }
    }
    if (!Array.isArray(data) || data.length !== commands.length) {
      return { ok: false, reason: `HTTP ${res.status} with an unexpected body shape` }
    }
    const errors = (data as Array<{ error?: string }>)
      .map((r, i) => (r && typeof r.error === 'string' ? `command ${i + 1}: ${UpstashRateLimiter.brief(r.error)}` : null))
      .filter(Boolean)
    if (errors.length) return { ok: false, reason: `per-command error (${errors.join('; ')})` }
    return { ok: true, data: data as Array<{ result?: unknown }> }
  }

  /** Startup reachability check: a real PING, not "secrets are set". */
  async probe(): Promise<string> {
    const started = Date.now()
    const r = await this.pipeline([['PING']])
    let line: string
    if (r.ok && String(r.data[0]?.result).toUpperCase() === 'PONG') {
      this.succeed()
      line = `Upstash reachable (PING ok, ${Date.now() - started} ms); state: upstash`
      console.log(`[rate-limiter] ${line}`)
    } else {
      const reason = r.ok ? `PING returned ${JSON.stringify(r.data[0]?.result)}` : r.reason
      this.fail(`startup check: ${reason}`)
      line = `Upstash configured but NOT reachable at startup (${reason}); in-memory fallback active; state: degraded`
      console.error(`[rate-limiter] ${line}`)
    }
    this.status.startup_check = line
    return line
  }

  async check(key: string): Promise<RateLimitResult> {
    try {
      const window = Math.floor(Date.now() / WINDOW_MS)
      const redisKey = `mcp:rl:${key}:${window}`
      // INCR + PEXPIRE in a single pipelined call
      const r = await this.pipeline([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(WINDOW_MS)],
      ])
      if (!r.ok) {
        this.fail(r.reason)
        return this.fallback.check(key)
      }
      const count = Number(r.data[0]?.result)
      if (!Number.isFinite(count) || count < 1) {
        this.fail(`INCR returned ${JSON.stringify(r.data[0]?.result)}`)
        return this.fallback.check(key)
      }
      this.succeed()
      const resetAt = (window + 1) * WINDOW_MS
      if (count > DEFAULT_LIMIT) {
        return { allowed: false, remaining: 0, resetAt }
      }
      return { allowed: true, remaining: DEFAULT_LIMIT - count, resetAt }
    } catch (err) {
      // Defence in depth: nothing above should throw, but a limiter must never
      // take the server down (WO#250) and must never allow-all (WO#385).
      this.fail(`unexpected: ${err instanceof Error ? err.message : String(err)}`)
      return this.fallback.check(key)
    }
  }
}

/**
 * True only when Upstash is configured with a syntactically valid REST URL AND
 * a token. Rejects the placeholder default (`paste-full-url`) and any other
 * non-URL value, so a misconfigured secret degrades to in-memory instead of
 * throwing ERR_INVALID_URL on every request (WO#250 crash root cause).
 */
function isValidUpstashUrl(url: string | undefined, token: string | undefined): url is string {
  if (!url || !token) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

let cached: RateLimiter | null = null
let memoryStatus: LimiterStatus | null = null

export function getRateLimiter(): RateLimiter {
  if (cached) return cached
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (isValidUpstashUrl(url, token)) {
    // WO#385: no "configured, distributed rate limiting active" line here.
    // Configuration is not reachability; startHttpServer runs probe() and
    // logs the real result.
    console.log('[rate-limiter] Upstash configured; checking reachability at startup.')
    cached = new UpstashRateLimiter(url, token as string)
  } else {
    const reason =
      !url && !token
        ? 'no Upstash env set'
        : !url || !token
          ? 'incomplete Upstash env (need both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)'
          : 'invalid UPSTASH_REDIS_REST_URL (not a valid http/https URL)'
    console.warn(
      `[rate-limiter] ${reason} — using in-memory rate limiting (per-process, safe fallback; state: memory). ` +
        'Set a valid UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed limiting.',
    )
    cached = new InMemoryRateLimiter()
    memoryStatus = {
      state: 'memory',
      upstash_configured: false,
      upstash_failures: 0,
      last_failure: null,
      last_failure_at: null,
      last_success_at: null,
      startup_check: `no Upstash: ${reason}`,
    }
  }
  return cached
}

/** Current limiter state for /stats (WO#385). */
export function getLimiterStatus(): LimiterStatus {
  const lim = getRateLimiter()
  if (lim instanceof UpstashRateLimiter) return lim.getStatus()
  return { ...(memoryStatus as LimiterStatus) }
}

/** Startup reachability check; a no-op for the in-memory limiter. */
export async function probeRateLimiter(): Promise<string> {
  const lim = getRateLimiter()
  if (lim instanceof UpstashRateLimiter) return lim.probe()
  return getLimiterStatus().startup_check ?? 'in-memory'
}

export class RateLimitExceededError extends Error {
  constructor(public readonly resetAt: number) {
    super(
      'Rate limit exceeded. AskSakina\'s knowledge is freely available; please pace your requests.',
    )
    this.name = 'RateLimitExceededError'
  }
}

/** Rate limit budget exposed for header construction. */
export const RATE_LIMIT_BUDGET = DEFAULT_LIMIT
export const RATE_LIMIT_WINDOW_MS = WINDOW_MS
