import { UNATTRIBUTED_CONTEXT_FALLBACK } from '../contracts/presentation.js';
import { AUDIENCES } from './types.js';
export const REQUIRED_SIGNOFF = {
    key_word: [2],
    context: [4],
    misconception: [4],
    reflection: [3],
    audience_variant: [6, 7],
    related: [2],
    publish: [10],
};
export const ACKNOWLEDGED_FIELD1_MISMATCHES = [
    { key: 'verse:39:53', arabic: '\u0644\u064e\u0627 \u062a\u064e\u0642\u0652\u0646\u064e\u0637\u064f\u0648\u0627\u06df' },
    { key: 'dua:D00060', arabic: '\u0671\u0634\u0652\u0631\u064e\u062d\u0652' },
];
export function escapeArabic(s) {
    return [...s].map((c) => (c.charCodeAt(0) < 128 ? c : `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`)).join('');
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function missingGems(signoffs, required) {
    const valid = (signoffs ?? []).filter((s) => s && s.ruling?.trim() && ISO_DATE.test(s.date ?? ''));
    return required.filter((g) => !valid.some((s) => s.gem === g));
}
function hasCitations(c) {
    return Array.isArray(c) && c.length > 0 && c.every((x) => typeof x?.text === 'string' && x.text.trim() !== '');
}
export function keyFor(entry) {
    const r = entry.record;
    return r.kind === 'dua' ? `dua:${r.id}` : r.kind === 'verse' ? `verse:${r.ref}` : `name:${r.number}`;
}
function refResolves(ref, l) {
    switch (ref.kind) {
        case 'dua':
            return l.duaStatus(ref.id) !== undefined;
        case 'verse':
            return l.verseExists(ref.ref);
        case 'name':
            return l.nameExists(ref.number);
        case 'glossary':
            return l.glossaryHas(ref.term);
    }
}
export function validateTeachEntries(entries, l) {
    const errors = [];
    for (const [key, entry] of Object.entries(entries)) {
        if (!entry)
            continue;
        const err = (msg) => errors.push(`${key}: ${msg}`);
        const need = (field, s, gems) => {
            const miss = missingGems(s, gems);
            if (miss.length)
                err(`${field} lacks sign-off from ${miss.map((g) => `Gem ${g}`).join(', ')}`);
        };
        if (keyFor(entry) !== key)
            err(`key does not match record (${keyFor(entry)})`);
        if (entry.locale !== 'en')
            err(`locale ${entry.locale} is not reviewed for teach content`);
        const r = entry.record;
        const status = r.kind === 'dua' ? l.duaStatus(r.id) : undefined;
        if (r.kind === 'dua' && !status)
            err('du\'a id is not in the bundled corpus');
        if (r.kind === 'verse' && !l.verseExists(r.ref))
            err('verse ref does not exist');
        if (r.kind === 'name' && !l.nameExists(r.number))
            err('Name number does not exist');
        need('Field 1 (key word)', entry.key_word?.reviewedBy, REQUIRED_SIGNOFF.key_word);
        const words = entry.key_word?.words;
        if (!Array.isArray(words) || words.length === 0)
            err('Field 1 has no words');
        const recordText = l.recordArabic?.(entry);
        if (recordText !== undefined) {
            for (const w of words ?? []) {
                if (recordText.includes(w.arabic))
                    continue;
                if (!ACKNOWLEDGED_FIELD1_MISMATCHES.some((m) => m.key === key && m.arabic === w.arabic)) {
                    err(`Field 1 word is not in the record's Arabic byte for byte: ${escapeArabic(w.arabic)}`);
                }
            }
        }
        const ctx = entry.context;
        if (r.kind === 'dua' && !ctx)
            err('Field 2 is required on a du\'a');
        if (ctx) {
            need('Field 2 (context)', ctx.reviewedBy, REQUIRED_SIGNOFF.context);
            if (ctx.kind === 'not_recorded') {
                if (r.kind !== 'dua')
                    err('Field 2 fallback applies to du\'as only');
                if (ctx.text !== UNATTRIBUTED_CONTEXT_FALLBACK)
                    err('Field 2 fallback is not the locked Gem 4 string');
                if (status && status !== 'not_recorded')
                    err(`Field 2 fallback on a ${status} record would be false`);
            }
            else if (ctx.kind === 'cited') {
                if (!hasCitations(ctx.citations))
                    err('Field 2 makes a claim with no citation');
                if (status === 'not_recorded')
                    err('Field 2 on an ungraded or sourceless du\'a must be the Gem 4 fallback only');
            }
            else {
                err('Field 2 has an unknown kind');
            }
        }
        const mis = entry.misconception;
        if (mis) {
            need('Field 3 (misconception)', mis.reviewedBy, REQUIRED_SIGNOFF.misconception);
            if (mis.authoredBy !== 'founder')
                err('Field 3 must be Founder-authored');
            if (!hasCitations(mis.citations))
                err('Field 3 has no citation; with no citation the field is absent');
        }
        need('Field 4 (reflection)', entry.reflection?.reviewedBy, REQUIRED_SIGNOFF.reflection);
        for (const [aud, v] of Object.entries(entry.by_audience ?? {})) {
            if (!v)
                continue;
            const f = `Field 5 (${aud})`;
            if (!AUDIENCES.includes(aud))
                err(`${f}: unknown audience`);
            need(f, v.reviewedBy, REQUIRED_SIGNOFF.audience_variant);
            if (v.key_word_gloss !== undefined)
                need(`${f} key_word_gloss`, v.reviewedBy, REQUIRED_SIGNOFF.key_word);
            if (v.context_text !== undefined) {
                if (ctx?.kind !== 'cited')
                    err(`${f}: context_text needs a cited Field 2 (the fallback never varies)`);
                need(`${f} context_text`, v.reviewedBy, REQUIRED_SIGNOFF.context);
            }
            if (v.misconception_text !== undefined) {
                if (!mis)
                    err(`${f}: misconception_text with no Field 3`);
                need(`${f} misconception_text`, v.reviewedBy, REQUIRED_SIGNOFF.misconception);
            }
            if (v.reflection_text !== undefined)
                need(`${f} reflection_text`, v.reviewedBy, REQUIRED_SIGNOFF.reflection);
        }
        if (entry.related) {
            need('related', entry.related.reviewedBy, REQUIRED_SIGNOFF.related);
            for (const ref of entry.related.refs) {
                if (!refResolves(ref, l))
                    err(`related ref does not resolve: ${JSON.stringify(ref)}`);
            }
        }
    }
    return errors;
}
export function publishGateErrors(entries) {
    const errors = [];
    for (const [key, entry] of Object.entries(entries)) {
        if (!entry)
            continue;
        const miss = missingGems(entry.publishReviewedBy, REQUIRED_SIGNOFF.publish);
        if (miss.length)
            errors.push(`${key}: entry (publish) lacks sign-off from ${miss.map((g) => `Gem ${g}`).join(', ')}`);
    }
    return errors;
}
export function buildDuaIdAllowlist(entries) {
    const ids = new Set();
    for (const entry of Object.values(entries)) {
        if (entry?.record.kind === 'dua')
            ids.add(entry.record.id);
        for (const ref of entry?.related?.refs ?? [])
            if (ref.kind === 'dua')
                ids.add(ref.id);
    }
    return [...ids].sort();
}
//# sourceMappingURL=validate.js.map