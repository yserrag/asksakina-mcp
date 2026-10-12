const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;
const UPSTASH_TIMEOUT_MS = 2_000;
export class InMemoryRateLimiter {
    windowMs;
    sweepMs;
    buckets = new Map();
    lastSweep = 0;
    constructor(windowMs = WINDOW_MS, sweepMs = 1_000) {
        this.windowMs = windowMs;
        this.sweepMs = sweepMs;
        const timer = setInterval(() => this.sweep(Date.now()), this.sweepMs);
        timer.unref?.();
    }
    sweep(now) {
        this.lastSweep = now;
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now)
                this.buckets.delete(key);
        }
    }
    size() {
        return this.buckets.size;
    }
    async check(key) {
        const now = Date.now();
        if (now - this.lastSweep >= this.sweepMs)
            this.sweep(now);
        const existing = this.buckets.get(key);
        if (!existing || existing.resetAt <= now) {
            const resetAt = now + this.windowMs;
            this.buckets.set(key, { count: 1, resetAt });
            return { allowed: true, remaining: DEFAULT_LIMIT - 1, resetAt };
        }
        if (existing.count >= DEFAULT_LIMIT) {
            return { allowed: false, remaining: 0, resetAt: existing.resetAt };
        }
        existing.count += 1;
        return {
            allowed: true,
            remaining: DEFAULT_LIMIT - existing.count,
            resetAt: existing.resetAt,
        };
    }
}
export class UpstashRateLimiter {
    url;
    token;
    fallback;
    status = {
        state: 'upstash',
        upstash_configured: true,
        upstash_failures: 0,
        last_failure: null,
        last_failure_at: null,
        last_success_at: null,
        startup_check: null,
    };
    constructor(url, token, fallback) {
        this.url = url;
        this.token = token;
        this.fallback = fallback ?? new InMemoryRateLimiter();
    }
    getStatus() {
        return { ...this.status };
    }
    fail(reason) {
        this.status.state = 'degraded';
        this.status.upstash_failures += 1;
        this.status.last_failure = reason;
        this.status.last_failure_at = new Date().toISOString();
        console.error(`[rate-limiter] Upstash failure (${reason}); using in-memory fallback (state: degraded)`);
    }
    succeed() {
        if (this.status.state === 'degraded') {
            console.log('[rate-limiter] Upstash recovered (state: upstash)');
        }
        this.status.state = 'upstash';
        this.status.last_success_at = new Date().toISOString();
    }
    static brief(text) {
        return text.replace(/\s+/g, ' ').slice(0, 120);
    }
    async pipeline(commands) {
        let res;
        try {
            res = await fetch(`${this.url}/pipeline`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(commands),
                signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
            });
        }
        catch (err) {
            return { ok: false, reason: `unreachable: ${err instanceof Error ? err.message : String(err)}` };
        }
        const text = await res.text().catch(() => '');
        if (!res.ok) {
            return { ok: false, reason: `HTTP ${res.status}${text ? `: ${UpstashRateLimiter.brief(text)}` : ''}` };
        }
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            return { ok: false, reason: `HTTP ${res.status} with a non-JSON body` };
        }
        if (!Array.isArray(data) || data.length !== commands.length) {
            return { ok: false, reason: `HTTP ${res.status} with an unexpected body shape` };
        }
        const errors = data
            .map((r, i) => (r && typeof r.error === 'string' ? `command ${i + 1}: ${UpstashRateLimiter.brief(r.error)}` : null))
            .filter(Boolean);
        if (errors.length)
            return { ok: false, reason: `per-command error (${errors.join('; ')})` };
        return { ok: true, data: data };
    }
    async probe() {
        const started = Date.now();
        const r = await this.pipeline([['PING']]);
        let line;
        if (r.ok && String(r.data[0]?.result).toUpperCase() === 'PONG') {
            this.succeed();
            line = `Upstash reachable (PING ok, ${Date.now() - started} ms); state: upstash`;
            console.log(`[rate-limiter] ${line}`);
        }
        else {
            const reason = r.ok ? `PING returned ${JSON.stringify(r.data[0]?.result)}` : r.reason;
            this.fail(`startup check: ${reason}`);
            line = `Upstash configured but NOT reachable at startup (${reason}); in-memory fallback active; state: degraded`;
            console.error(`[rate-limiter] ${line}`);
        }
        this.status.startup_check = line;
        return line;
    }
    async check(key) {
        try {
            const window = Math.floor(Date.now() / WINDOW_MS);
            const redisKey = `mcp:rl:${key}:${window}`;
            const r = await this.pipeline([
                ['INCR', redisKey],
                ['PEXPIRE', redisKey, String(WINDOW_MS)],
            ]);
            if (!r.ok) {
                this.fail(r.reason);
                return this.fallback.check(key);
            }
            const count = Number(r.data[0]?.result);
            if (!Number.isFinite(count) || count < 1) {
                this.fail(`INCR returned ${JSON.stringify(r.data[0]?.result)}`);
                return this.fallback.check(key);
            }
            this.succeed();
            const resetAt = (window + 1) * WINDOW_MS;
            if (count > DEFAULT_LIMIT) {
                return { allowed: false, remaining: 0, resetAt };
            }
            return { allowed: true, remaining: DEFAULT_LIMIT - count, resetAt };
        }
        catch (err) {
            this.fail(`unexpected: ${err instanceof Error ? err.message : String(err)}`);
            return this.fallback.check(key);
        }
    }
}
function isValidUpstashUrl(url, token) {
    if (!url || !token)
        return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    }
    catch {
        return false;
    }
}
let cached = null;
let memoryStatus = null;
export function getRateLimiter() {
    if (cached)
        return cached;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (isValidUpstashUrl(url, token)) {
        console.log('[rate-limiter] Upstash configured; checking reachability at startup.');
        cached = new UpstashRateLimiter(url, token);
    }
    else {
        const reason = !url && !token
            ? 'no Upstash env set'
            : !url || !token
                ? 'incomplete Upstash env (need both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)'
                : 'invalid UPSTASH_REDIS_REST_URL (not a valid http/https URL)';
        console.warn(`[rate-limiter] ${reason} — using in-memory rate limiting (per-process, safe fallback; state: memory). ` +
            'Set a valid UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed limiting.');
        cached = new InMemoryRateLimiter();
        memoryStatus = {
            state: 'memory',
            upstash_configured: false,
            upstash_failures: 0,
            last_failure: null,
            last_failure_at: null,
            last_success_at: null,
            startup_check: `no Upstash: ${reason}`,
        };
    }
    return cached;
}
export function getLimiterStatus() {
    const lim = getRateLimiter();
    if (lim instanceof UpstashRateLimiter)
        return lim.getStatus();
    return { ...memoryStatus };
}
export async function probeRateLimiter() {
    const lim = getRateLimiter();
    if (lim instanceof UpstashRateLimiter)
        return lim.probe();
    return getLimiterStatus().startup_check ?? 'in-memory';
}
export class RateLimitExceededError extends Error {
    resetAt;
    constructor(resetAt) {
        super('Rate limit exceeded. AskSakina\'s knowledge is freely available; please pace your requests.');
        this.resetAt = resetAt;
        this.name = 'RateLimitExceededError';
    }
}
export const RATE_LIMIT_BUDGET = DEFAULT_LIMIT;
export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;
//# sourceMappingURL=rate-limiter.js.map