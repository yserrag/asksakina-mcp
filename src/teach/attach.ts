/**
 * Runtime attachment of teach content (WO#405).
 *
 * Adds `teach` and `related` to ONE record, and only when:
 *   - the caller sent `audience`,
 *   - the request locale is 'en' (entries are English only), and
 *   - an entry exists for the record.
 * Otherwise the record is returned untouched, so a call without `audience`
 * serialises byte for byte as before. The keys are appended after every
 * existing key, never replacing one.
 *
 * Callers never reach this on a crisis_resource_only response: the hard
 * crisis paths return before any record exists (Gem 3, WO#388).
 *
 * Nothing is attached when `withhold` is set: on grief routes and whenever a
 * support block is in the response. Gem 10 (WO#407) superseded the WO#405
 * rule that removed only Field 4 there: the server drops the whole block,
 * `related` included, the same as crisis, rather than relying on the
 * calling agent to discard it.
 *
 * Selection only. Every string comes from src/teach/entries.ts; nothing is
 * generated, and labels are built mechanically from the records.
 */

import { getNameByNumber } from '../data/names.js'
import { TEACH_ENTRIES } from './entries.js'
import type { Audience, RelatedRef, RelatedRefWire, TeachBlockWire, TeachEntry, TeachKey } from './types.js'

export interface AttachOptions {
  audience?: Audience
  locale?: string
  /** Grief route or support block: attach nothing (Gem 10, WO#407). */
  withhold?: boolean
}

function relatedWire(ref: RelatedRef): RelatedRefWire | null {
  switch (ref.kind) {
    case 'verse': {
      const [surah, ayah] = ref.ref.split(':').map(Number)
      return { kind: 'verse', label: `Quran ${ref.ref}`, call: { tool: 'get_quran_verse', arguments: { surah, ayah } } }
    }
    case 'name': {
      const name = getNameByNumber(ref.number, 'en')
      const label = name ? `${name.transliteration} (${ref.number})` : `Name ${ref.number}`
      return { kind: 'name', label, call: { tool: 'get_name_of_allah', arguments: { number: ref.number } } }
    }
    case 'dua':
      return { kind: 'dua', label: `Du'a ${ref.id}`, call: { tool: 'get_dua', arguments: { id: ref.id } } }
    case 'glossary':
      // No glossary resource exists yet; the bundle check refuses glossary refs.
      return null
  }
}

function teachWire(key: TeachKey, entry: TeachEntry, audience: Audience): TeachBlockWire {
  const ctx = entry.context
  const block: TeachBlockWire = {
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
          context:
            ctx.kind === 'cited'
              ? {
                  attributed: true as const,
                  text: ctx.text,
                  citations: ctx.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text })),
                }
              : { attributed: false as const, text: ctx.text },
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
  }
  return block
}

/** The record with `teach` and `related` appended, or the same record. */
export function withTeach<T extends object>(record: T, key: TeachKey, opts: AttachOptions): T {
  if (!opts.audience) return record
  if (opts.withhold) return record
  if ((opts.locale ?? 'en') !== 'en') return record
  const entry = TEACH_ENTRIES[key]
  if (!entry || entry.locale !== 'en') return record
  const related = (entry.related?.refs ?? []).map(relatedWire).filter((r): r is RelatedRefWire => r !== null)
  return {
    ...record,
    teach: teachWire(key, entry, opts.audience),
    ...(related.length ? { related } : {}),
  }
}
