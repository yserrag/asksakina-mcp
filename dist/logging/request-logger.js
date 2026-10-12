const TOOLS = ['get_quran_verse', 'get_dua', 'get_name_of_allah', 'find_verses'];
function emptyCounter() {
    return { ok: 0, not_found: 0, error: 0, total: 0, duration_ms_sum: 0 };
}
function emptyCounters() {
    return {
        get_quran_verse: emptyCounter(),
        get_dua: emptyCounter(),
        get_name_of_allah: emptyCounter(),
        find_verses: emptyCounter(),
    };
}
let counters = emptyCounters();
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
}
export function getAggregateSnapshot() {
    let total = 0;
    const perTool = {};
    for (const t of TOOLS) {
        perTool[t] = { ...counters[t] };
        total += counters[t].total;
    }
    return { since: startedAt.toISOString(), perTool, total };
}
export function resetLoggerForTests() {
    counters = emptyCounters();
    startedAt = new Date();
}
//# sourceMappingURL=request-logger.js.map