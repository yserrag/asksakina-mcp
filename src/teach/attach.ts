/**
 * Runtime attachment of teach content (WO#405; WO#478 teach by default).
 *
 * Adds `teach` and `related` to ONE record, and only when:
 *   - the request locale is 'en' (entries are English only), and
 *   - an entry exists for the record.
 * Otherwise the record is returned untouched. The keys are appended after
 * every existing key, never replacing one.
 *
 * WO#478 (Architect, 20 Oct 2026): the WO#390 flag 1 ruling ("audience
 * omitted = 1.5.0 output byte for byte") is superseded. Teach attaches
 * whenever an entry exists; `audience` is optional and, when omitted, the
 * block carries `audience: "unknown"` and the base text. The by_audience
 * variants (types.ts) are still not applied in this release.
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
import { REVERT_NOTES } from '../contracts/learn-content.js'
import { TEACH_ENTRIES } from './entries.js'
import type { Audience, RelatedRef, RelatedRefWire, TeachBlockWire, TeachEntry, TeachKey, WireAudience } from './types.js'

export interface AttachOptions {
  audience?: Audience
  locale?: string
  /** Grief route or support block: attach nothing (Gem 10, WO#407). */
  withhold?: boolean
  /**
   * WO#503-C (Gem 3, 25 Oct 2026; docs/wo503-architect.md section 7): the request names a
   * parent with harm (parent-harm-rules.ts). A field listed in TEACH_WITHHELD_ON_PARENT_HARM
   * is dropped from the teach block; the record and the rest of the block are served.
   */
  parentHarm?: boolean
}

/**
 * Teach fields withheld on parent harm, by record id and field (Gem 3, WO#503-C item 2).
 * Only a field the wire schema makes optional can be dropped: `context` (and its
 * `context_block`, present exactly when `context` is) can; `key_word.gloss` is a required
 * string, so the 1:5 gloss is parked (TEACH_WITHHOLDS_PARKED), not dropped.
 */
export const TEACH_WITHHELD_ON_PARENT_HARM: readonly { key: TeachKey; field: 'context' }[] = [
  { key: 'name:5', field: 'context' },
]
/** Ruled, but not cleanly droppable under the wire schema; flagged in docs/wo503b-gem10.md (W10-7). */
export const TEACH_WITHHOLDS_PARKED: readonly { key: TeachKey; field: string; why: string }[] = [
  { key: 'verse:1:5', field: 'key_word.gloss', why: 'key_word.gloss is a required string on the teach block wire (TeachBlockWire); dropping it is a schema change for Gem 10' },
]

/** The block with the fields withheld on parent harm removed (WO#503-C). */
function withheldOnParentHarm(key: TeachKey, block: TeachBlockWire): TeachBlockWire {
  if (!TEACH_WITHHELD_ON_PARENT_HARM.some((w) => w.key === key && w.field === 'context')) return block
  const { context: _context, context_block: _contextBlock, ...rest } = block
  return rest
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

/**
 * WO#485: `teach.context_block`, the context text and its citations bound
 * into one display string: the text, a newline (WO#487, Gem 10 condition),
 * then the citations as "Text (Grading)" (or "Text" where no grading is
 * recorded) joined with "; ". A context with no citations (the Gem 4
 * fallback) is its text alone.
 */
export function contextBlock(ctx: NonNullable<TeachEntry['context']>): string {
  if (ctx.kind !== 'cited' || ctx.citations.length === 0) return ctx.text
  return `${ctx.text}\n${ctx.citations.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ')}`
}

function teachWire(key: TeachKey, entry: TeachEntry, audience: WireAudience): TeachBlockWire {
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
  }
  return block
}

/**
 * WO#495 (MCP 2.5.0), Field 5: AskSakina's note for a new Muslim (J3 item 8,
 * Gems 6 and 7), served only when the caller sends `audience: "revert"`. It
 * is its own key, not a rewrite of a teach field, because the notes carry
 * their own citations (Quran 112:1, Sunan Abi Dawud 832); and it attaches whether
 * or not the record has a teach entry (the Bukhari 744 du'a has none). The
 * same conditions withhold it as withhold teach.
 */
export interface AudienceNoteWire {
  audience: 'revert'
  text: string
  citations: Array<{ text: string; grading?: string }>
  /** The text, then (where citations exist) a newline and "Text (Grading)" joined with "; ", as context_block. */
  note_block: string
}

function audienceNote(key: TeachKey, audience: Audience | undefined): AudienceNoteWire | undefined {
  if (audience !== 'revert') return undefined
  const note = REVERT_NOTES[key]
  if (!note) return undefined
  const citations = note.citations.map((c) => (c.grading ? { text: c.text, grading: c.grading } : { text: c.text }))
  const cited = citations.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ')
  return { audience: 'revert', text: note.text, citations, note_block: citations.length ? `${note.text}\n${cited}` : note.text }
}

/** The record with `teach`, `related` and (WO#495) `audience_note` appended, or the same record. */
export function withTeach<T extends object>(record: T, key: TeachKey, opts: AttachOptions): T {
  if (opts.withhold) return record
  if ((opts.locale ?? 'en') !== 'en') return record
  const found = TEACH_ENTRIES[key]
  const entry = found && found.locale === 'en' ? found : undefined
  const note = audienceNote(key, opts.audience)
  if (!entry && !note) return record
  const related = (entry?.related?.refs ?? []).map(relatedWire).filter((r): r is RelatedRefWire => r !== null)
  return {
    ...record,
    ...(entry ? { teach: opts.parentHarm ? withheldOnParentHarm(key, teachWire(key, entry, opts.audience ?? 'unknown')) : teachWire(key, entry, opts.audience ?? 'unknown') } : {}),
    ...(related.length ? { related } : {}),
    ...(note ? { audience_note: note } : {}),
  }
}
