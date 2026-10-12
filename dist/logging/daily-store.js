import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export const RETENTION_DAYS = 90;
export const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const TOOLS = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses'];
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const zero = () => ({ ok: 0, not_found: 0, error: 0, duration_ms_sum: 0 });
const zeroDay = (date) => ({
    date,
    by_tool: { get_quran_verse: zero(), get_dua: zero(), get_name_of_allah: zero(), find_verses: zero() },
});
export function utcDay(when) {
    return when.toISOString().slice(0, 10);
}
export function oldestKeptDay(today) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (RETENTION_DAYS - 1));
    return utcDay(d);
}
const count = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
export function sanitiseDay(date, input) {
    const out = zeroDay(date);
    const byTool = input?.by_tool;
    if (!byTool || typeof byTool !== 'object')
        return out;
    for (const t of TOOLS) {
        const c = byTool[t];
        if (!c || typeof c !== 'object')
            continue;
        out.by_tool[t] = {
            ok: count(c.ok),
            not_found: count(c.not_found),
            error: count(c.error),
            duration_ms_sum: count(c.duration_ms_sum),
        };
    }
    return out;
}
function addInto(target, add) {
    for (const t of TOOLS) {
        const a = target.by_tool[t];
        const b = add.by_tool[t];
        a.ok += b.ok;
        a.not_found += b.not_found;
        a.error += b.error;
        a.duration_ms_sum += b.duration_ms_sum;
    }
}
export class DailyUsageStore {
    dir;
    now;
    pending = new Map();
    constructor(dir, now = () => new Date()) {
        this.dir = dir;
        this.now = now;
    }
    record(tool, status, durationMs) {
        if (!TOOLS.includes(tool))
            return;
        const day = utcDay(this.now());
        let d = this.pending.get(day);
        if (!d)
            this.pending.set(day, (d = zeroDay(day)));
        const c = d.by_tool[tool];
        if (status === 'ok')
            c.ok += 1;
        else if (status === 'not_found')
            c.not_found += 1;
        else
            c.error += 1;
        c.duration_ms_sum += Math.max(0, Math.round(durationMs));
    }
    file(day) {
        return path.join(this.dir, `${day}.json`);
    }
    readDay(day) {
        const p = this.file(day);
        if (!existsSync(p))
            return zeroDay(day);
        try {
            return sanitiseDay(day, JSON.parse(readFileSync(p, 'utf8')));
        }
        catch {
            return zeroDay(day);
        }
    }
    storedDays() {
        if (!existsSync(this.dir))
            return [];
        return readdirSync(this.dir)
            .map((n) => DAY_FILE.exec(n)?.[1])
            .filter((d) => Boolean(d))
            .sort()
            .reverse();
    }
    flush() {
        try {
            mkdirSync(this.dir, { recursive: true });
            const oldest = oldestKeptDay(utcDay(this.now()));
            for (const [day, add] of this.pending) {
                if (day < oldest)
                    continue;
                const merged = this.readDay(day);
                addInto(merged, add);
                const tmp = `${this.file(day)}.tmp`;
                writeFileSync(tmp, JSON.stringify(sanitiseDay(day, merged)) + '\n');
                renameSync(tmp, this.file(day));
            }
            this.pending.clear();
            for (const day of this.storedDays()) {
                if (day < oldest)
                    unlinkSync(this.file(day));
            }
        }
        catch (err) {
            console.error('[usage] daily totals not written:', err instanceof Error ? err.message : String(err));
        }
    }
    days() {
        const oldest = oldestKeptDay(utcDay(this.now()));
        const all = new Set([...this.storedDays(), ...this.pending.keys()]);
        return [...all]
            .filter((d) => d >= oldest)
            .sort()
            .reverse()
            .map((day) => {
            const d = this.readDay(day);
            const p = this.pending.get(day);
            if (p)
                addInto(d, p);
            return d;
        });
    }
}
let active = null;
let timer = null;
export function getDailyStore() {
    return active;
}
export function enableDailyStore(dir) {
    if (active)
        return active;
    active = new DailyUsageStore(dir);
    timer = setInterval(() => active?.flush(), FLUSH_INTERVAL_MS);
    timer.unref();
    const stop = (signal) => {
        active?.flush();
        console.log(`[usage] daily totals written on ${signal}`);
        process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(`[usage] daily per-tool totals kept in ${dir} (at most ${RETENTION_DAYS} days)`);
    return active;
}
//# sourceMappingURL=daily-store.js.map