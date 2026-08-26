/**
 * Rate limiter for the MCP server (WO#102).
 *
 * Two implementations under one interface:
 *
 *   - In-memory token bucket — used when Upstash is not configured.
 *     Fine for development and small deployments. Each process keeps
 *     its own buckets, so behind a load balancer the effective limit
 *     is N × the configured limit.
 *   - Upstash Redis fixed window — used when both
 *     `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.
 *     Distributed; suitable for production.
 *
 * Default budget: 60 requests per minute per IP (WO#102 spec).
 */

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = 60

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface RateLimiter {
  check(key: string): Promise<RateLimitResult>
}

/**
 * The fail-open result: allow the request. A rate limiter must NEVER take the
 * server down (WO#250) — on any config or runtime failure we let traffic
 * through rather than crash or block.
 */
function failOpen(): RateLimitResult {
  return { allowed: true, remaining: DEFAULT_LIMIT, resetAt: Date.now() + WINDOW_MS }
}

class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>()

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const existing = this.buckets.get(key)
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + WINDOW_MS
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

class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    try {
      const window = Math.floor(Date.now() / WINDOW_MS)
      const redisKey = `mcp:rl:${key}:${window}`

      // INCR + EXPIRE in a single pipelined call
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, String(WINDOW_MS)],
        ]),
      })
      if (!res.ok) return failOpen() // do not block on an Upstash HTTP error
      const data = (await res.json()) as Array<{ result: number | string }>
      const count = Number(data[0]?.result ?? 0)
      const resetAt = (window + 1) * WINDOW_MS
      if (count > DEFAULT_LIMIT) {
        return { allowed: false, remaining: 0, resetAt }
      }
      return { allowed: true, remaining: DEFAULT_LIMIT - count, resetAt }
    } catch (err) {
      // Fail open on ANY runtime error — invalid URL (ERR_INVALID_URL), DNS,
      // network, JSON parse. WO#250: this unhandled throw was crashing the
      // process on every /mcp POST (Fly 502 restart loop).
      console.error(
        '[rate-limiter] Upstash check failed, failing open:',
        err instanceof Error ? err.message : String(err),
      )
      return failOpen()
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

export function getRateLimiter(): RateLimiter {
  if (cached) return cached
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  // Startup env validation: log clearly which limiter is active (WO#250).
  if (isValidUpstashUrl(url, token)) {
    console.log('[rate-limiter] Upstash Redis configured — distributed rate limiting active.')
    cached = new UpstashRateLimiter(url, token as string)
  } else {
    const reason =
      !url && !token
        ? 'no Upstash env set'
        : !url || !token
          ? 'incomplete Upstash env (need both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)'
          : 'invalid UPSTASH_REDIS_REST_URL (not a valid http/https URL)'
    console.warn(
      `[rate-limiter] ${reason} — using in-memory rate limiting (per-process, safe fallback). ` +
        'Set a valid UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed limiting.',
    )
    cached = new InMemoryRateLimiter()
  }
  return cached
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
