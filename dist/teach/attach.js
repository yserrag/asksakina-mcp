import { getNameByNumber } from '../data/names.js';
import { TEACH_ENTRIES } from './entries.js';
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
export function withTeach(record, key, opts) {
    if (!opts.audience)
        return record;
    if (opts.withhold)
        return record;
    if ((opts.locale ?? 'en') !== 'en')
        return record;
    const entry = TEACH_ENTRIES[key];
    if (!entry || entry.locale !== 'en')
        return record;
    const related = (entry.related?.refs ?? []).map(relatedWire).filter((r) => r !== null);
    return {
        ...record,
        teach: teachWire(key, entry, opts.audience),
        ...(related.length ? { related } : {}),
    };
}
//# sourceMappingURL=attach.js.map