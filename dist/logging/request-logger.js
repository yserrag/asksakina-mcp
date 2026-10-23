import { getDailyStore } from './daily-store.js';
import { audienceBucket, PROMPT_NAMES } from './counter-keys.js';
export { AUDIENCE_BUCKETS, audienceBucket, PROMPT_NAMES } from './counter-keys.js';
const TOOLS = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses'];
function emptyCounter() {
    return { ok: 0, not_found: 0, error: 0, total: 0, duration_ms_sum: 0, teach_served: 0 };
}
function emptyCounters() {
    return {
        get_quran_verse: emptyCounter(),
        get_dua: emptyCounter(),
        get_name_of_allah: emptyCounter(),
        find_verses: emptyCounter(),
    };
}
export const emptyAudience = () => ({ curious: 0, revert: 0, practising: 0, unknown: 0, absent: 0 });
export const emptyPrompts = () => ({ understand_a_verse: 0, explore_names_of_allah: 0 });
let counters = emptyCounters();
let audience = emptyAudience();
let prompts = emptyPrompts();
let startedAt = new Date();
export function logRequest(entry) {
    const c = counters[entry.tool];
    if (!c)
        return;
    c.total += 1;
    c.duration_ms_sum += Math.max(0, Math.round(entry.duration_ms));
    if (entry.status === 'ok')
        c.ok += 1;
    else if (entry.status === 'not_found')
        c.not_found += 1;
    else
        c.error += 1;
    if (entry.teach_served)
        c.teach_served += 1;
    const bucket = audienceBucket(entry.audience);
    audience[bucket] += 1;
    getDailyStore()?.record(entry.tool, entry.status, entry.duration_ms, Boolean(entry.teach_served), bucket);
}
export function logPromptFetch(name) {
    if (!PROMPT_NAMES.includes(name))
        return;
    prompts[name] += 1;
    getDailyStore()?.recordPrompt(name);
}
export function getAggregateSnapshot() {
    let total = 0;
    const perTool = {};
    for (const t of TOOLS) {
        perTool[t] = { ...counters[t] };
        total += counters[t].total;
    }
    return { since: startedAt.toISOString(), perTool, total, audience: { ...audience }, prompts: { ...prompts } };
}
export function resetLoggerForTests() {
    counters = emptyCounters();
    audience = emptyAudience();
    prompts = emptyPrompts();
    startedAt = new Date();
}
//# sourceMappingURL=request-logger.js.map