import { timingSafeEqual } from 'node:crypto';
import { getAggregateSnapshot } from './request-logger.js';
import { getDailyStore, RETENTION_DAYS } from './daily-store.js';
import { getLimiterStatus } from '../safety/rate-limiter.js';
import { getBasmalaPrefixMismatchCount } from '../data/quran.js';
const ALL_TOOLS = [
    'get_quran_verse',
    'get_dua',
    'get_name_of_allah',
    'find_verses',
];
const BEARER_PREFIX = 'Bearer ';
function authorise(req) {
    const expected = process.env.MCP_STATS_TOKEN;
    if (!expected)
        return false;
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX))
        return false;
    const presented = header.slice(BEARER_PREFIX.length).trim();
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length)
        return false;
    return timingSafeEqual(a, b);
}
function buildDaily() {
    const store = getDailyStore();
    if (!store)
        return null;
    return {
        retention_days: RETENTION_DAYS,
        days: store.days().map((d) => {
            const by_tool = {};
            let total = 0;
            for (const t of ALL_TOOLS) {
                const c = d.by_tool[t];
                const n = c.ok + c.not_found + c.error;
                total += n;
                by_tool[t] = { total: n, ok: c.ok, not_found: c.not_found, error: c.error, avg_response_ms: n > 0 ? Math.round(c.duration_ms_sum / n) : 0 };
            }
            return { date: d.date, total, by_tool };
        }),
    };
}
export const PRIVACY_MEMORY_ONLY = 'aggregate-only in-memory counters; no per-request records, no IPs, no user-agents, no client identifiers, no geolocation, no params, no payloads; resets on restart';
export const PRIVACY_WITH_DAILY = 'aggregate-only counters; no per-request records, no IPs, no user-agents, no client identifiers, no geolocation, no params, no payloads; since-start totals reset on restart; daily per-tool totals (ok, not_found, error, summed duration) kept on the server\'s own disk for at most 90 days';
function buildPayload() {
    const snap = getAggregateSnapshot();
    const by_tool = {};
    for (const t of ALL_TOOLS) {
        const c = snap.perTool[t];
        by_tool[t] = {
            total: c.total,
            ok: c.ok,
            not_found: c.not_found,
            error: c.error,
            avg_response_ms: c.total > 0 ? Math.round(c.duration_ms_sum / c.total) : 0,
        };
    }
    return {
        privacy: getDailyStore() ? PRIVACY_WITH_DAILY : PRIVACY_MEMORY_ONLY,
        since: snap.since,
        total_requests: snap.total,
        by_tool,
        rate_limiter: getLimiterStatus(),
        basmala_prefix_mismatch: getBasmalaPrefixMismatchCount(),
        daily: buildDaily(),
    };
}
export function handleStatsRequest(req, res) {
    if (req.method !== 'GET' || req.url !== '/stats')
        return false;
    if (!process.env.MCP_STATS_TOKEN) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'MCP_STATS_TOKEN not configured; /stats endpoint disabled.',
        }));
        return true;
    }
    if (!authorise(req)) {
        res.writeHead(401, {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="sakina-mcp-stats"',
        });
        res.end(JSON.stringify({ error: 'Unauthorised' }));
        return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(buildPayload()));
    return true;
}
export { ALL_TOOLS };
//# sourceMappingURL=stats.js.map