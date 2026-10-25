import { getNameByNumber } from '../data/names.js';
import { REVERT_NOTES } from '../contracts/learn-content.js';
import { TEACH_ENTRIES } from './entries.js';
export const TEACH_WITHHELD_ON_PARENT_HARM = [
    { key: 'name:5', field: 'context' },
];
export const TEACH_WITHHOLDS_PARKED = [
    { key: 'verse:1:5', field: 'key_word.gloss', why: 'key_word.gloss is a required string on the teach block wire (TeachBlockWire); dropping it is a schema change for Gem 10' },
];
function withheldOnParentHarm(key, block) {
    if (!TEACH_WITHHELD_ON_PARENT_HARM.some((w) => w.key === key && w.field === 'context'))
        return block;
    const { context: _context, context_block: _contextBlock, ...rest } = block;
    return rest;
}
function relatedWire(ref) {
    switch (ref.kind) {
        case 'verse': {
            const [surah, ayah] = ref.ref.split(':').map(Number);
            return { kind: 'verse', label: `Quran ${ref.ref}`, call: { tool: 'get_quran_verse', arguments: { surah, ayah } } };
        }
        case 'name': {
            const name = getNameByNumber(ref.number, 'en');
            const label = name ? `${name.transliteration} (${ref.number})` : `Name ${ref.number}`;
            return { kind: 'name', label, call: { tool: 'get_name_of_allah', arguments: { number: ref.number } } };
        }
        case 'dua':
            return { kind: 'dua', label: `Du'a ${ref.id}`, call: { tool: 'get_dua', arguments: { id: ref.id } } };
        case 'glossary':
            return null;
    }
}
export function contextBlock(ctx) {
    if (ctx.kind !== 'cited' || ctx.citations.length === 0)
        return ctx.text;
    return `${ctx.text}\n${ctx.citations.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ')}`;
}
function teachWire(key, entry, audience) {
    const ctx = entry.context;
    const block = {
        record_id: key,
        audience,
        key_word: {
            words: entry.key_word.words.map((w) => ({ arabic: w.arabic, transliteration: w.transliteration })),
            root: entry.key_word.root,
            root_transliteration: entry.key_word.root_transliteration,
            gloss: entry.key_word.gloss,
        },
        ...(ctx
            ? {
                context: ctx.kind === 'cited'
                    ? {
                        attributed: true,
                        text: ctx.text,
                        citations: ctx.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text })),
                    }
                    : { attributed: false, text: ctx.text },
            }
            : {}),
        ...(ctx ? { context_block: contextBlock(ctx) } : {}),
        ...(entry.misconception
            ? {
                misconception: {
                    text: entry.misconception.text,
                    citations: entry.misconception.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text })),
                },
            }
            : {}),
        reflection_question: entry.reflection.text,
    };
    return block;
}
function audienceNote(key, audience) {
    if (audience !== 'revert')
        return undefined;
    const note = REVERT_NOTES[key];
    if (!note)
        return undefined;
    const citations = note.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text }));
    const cited = citations.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ');
    return { audience: 'revert', text: note.text, citations, note_block: citations.length ? `${note.text}\n${cited}` : note.text };
}
export function withTeach(record, key, opts) {
    if (opts.withhold)
        return record;
    if ((opts.locale ?? 'en') !== 'en')
        return record;
    const found = TEACH_ENTRIES[key];
    const entry = found && found.locale === 'en' ? found : undefined;
    const note = audienceNote(key, opts.audience);
    if (!entry && !note)
        return record;
    const related = (entry?.related?.refs ?? []).map(relatedWire).filter((r) => r !== null);
    return {
        ...record,
        ...(entry ? { teach: opts.parentHarm ? withheldOnParentHarm(key, teachWire(key, entry, opts.audience ?? 'unknown')) : teachWire(key, entry, opts.audience ?? 'unknown') } : {}),
        ...(related.length ? { related } : {}),
        ...(note ? { audience_note: note } : {}),
    };
}
//# sourceMappingURL=attach.js.map