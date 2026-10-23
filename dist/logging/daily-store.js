import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIENCE_BUCKETS, PROMPT_NAMES } from './counter-keys.js';
export const RETENTION_DAYS = 90;
export const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const TOOLS = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses'];
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const zero = () => ({ ok: 0, not_found: 0, error: 0, duration_ms_sum: 0, teach_served: 0 });
const zeroDay = (date) => ({
    date,
    by_tool: { get_quran_verse: zero(), get_dua: zero(), get_name_of_allah: zero(), find_verses: zero() },
    audience: Object.fromEntries(AUDIENCE_BUCKETS.map((b) => [b, 0])),
    prompts: Object.fromEntries(PROMPT_NAMES.map((n) => [n, 0])),
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
    const src = input;
    const audience = src?.audience;
    if (audience && typeof audience === 'object')
        for (const b of AUDIENCE_BUCKETS)
            out.audience[b] = count(audience[b]);
    const prompts = src?.prompts;
    if (prompts && typeof prompts === 'object')
        for (const n of PROMPT_NAMES)
            out.prompts[n] = count(prompts[n]);
    const byTool = src?.by_tool;
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
            teach_served: count(c.teach_served),
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
        a.teach_served += b.teach_served;
    }
    for (const k of AUDIENCE_BUCKETS)
        target.audience[k] += add.audience[k];
    for (const n of PROMPT_NAMES)
        target.prompts[n] += add.prompts[n];
}
export class DailyUsageStore {
    dir;
    now;
    pending = new Map();
    constructor(dir, now = () => new Date()) {
        this.dir = dir;
        this.now = now;
    }
    today() {
        const day = utcDay(this.now());
        let d = this.pending.get(day);
        if (!d)
            this.pending.set(day, (d = zeroDay(day)));
        return d;
    }
    record(tool, status, durationMs, teachServed = false, audience = 'absent') {
        if (!TOOLS.includes(tool))
            return;
        const d = this.today();
        const c = d.by_tool[tool];
        if (status === 'ok')
            c.ok += 1;
        else if (status === 'not_found')
            c.not_found += 1;
        else
            c.error += 1;
        c.duration_ms_sum += Math.max(0, Math.round(durationMs));
        if (teachServed)
            c.teach_served += 1;
        d.audience[AUDIENCE_BUCKETS.includes(audience) ? audience : 'absent'] += 1;
    }
    recordPrompt(name) {
        if (!PROMPT_NAMES.includes(name))
            return;
        this.today().prompts[name] += 1;
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