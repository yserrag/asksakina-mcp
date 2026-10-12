/**
 * MCP 2.0 teaching layer: types only (WO#390 Phase 0).
 *
 * WO#405 adds the first six entries (batch 1) and attaches them at runtime
 * (src/teach/attach.ts) when a caller sends `audience`. get_dua accepts an
 * allowlisted `id` (WO#390 round 2).
 *
 * Every string that will fill these types is pre-authored and Gem-reviewed
 * in later WOs; none is ever generated. Position A ("records, not advice") stands.
 *
 * Two layers:
 *   - Stored (TeachEntry): what a later WO authors, keyed by record id,
 *     with per-field sign-offs. Never sent to a client as-is.
 *   - Wire (TeachBlockWire, RelatedRefWire): what a tool response would
 *     carry, resolved for one audience. Sign-off records stay server-side.
 *
 * Field numbering follows the WO#390 addendum (Gem 4, 27 Sep 2026):
 *   Field 1  key Arabic word, root and gloss           Gem 2
 *   Field 2  recitation context / attribution          Gem 4
 *   Field 3  misconception to avoid (optional)         Gem 4, Founder-authored
 *   Field 4  reflection question                       Gem 3
 *   Field 5  audience variants                         Gem 6 + Gem 7
 *   every field                                        Gem 10 before publish
 */

import type { UNATTRIBUTED_CONTEXT_FALLBACK } from '../contracts/presentation.js'

// ─── Audience ────────────────────────────────────────────────────────

/** Mirrors the app's three paths. Optional on every tool; omitted means
 *  1.5.0 behaviour, byte for byte (no teach, no related). */
export type Audience = 'curious' | 'revert' | 'practising'

export const AUDIENCES: readonly Audience[] = ['curious', 'revert', 'practising']

// ─── Record keys ─────────────────────────────────────────────────────

/** What a teach entry attaches to. One kind per tool family. */
export type TeachRecordKey =
  /** Du'a corpus id as bundled (e.g. "D00068", "fasting-iftar-2357"). */
  | { kind: 'dua'; id: string }
  /** Single ayah, "surah:ayah". Served by get_quran_verse and find_verses. */
  | { kind: 'verse'; ref: `${number}:${number}` }
  /** Name of Allah, 1-99. */
  | { kind: 'name'; number: number }

/** Map key in entries.ts: "dua:D00068", "verse:21:87", "name:34". */
export type TeachKey = `dua:${string}` | `verse:${number}:${number}` | `name:${number}`

// ─── Citations and sign-offs ─────────────────────────────────────────

export interface Citation {
  /** Human-readable, as it should be shown: "Sahih al-Bukhari 5675",
   *  "Quran 21:87", "Tafsir Ibn Kathir on 21:87". */
  text: string
  /** Grading as recorded, for a hadith citation. Absent means none is
   *  recorded; the teach layer never supplies one (UNGRADED_GRADING_DIRECTIVE). */
  grading?: string
}

/** At least one. An uncited claim is a type error, not a runtime surprise. */
export type Citations = readonly [Citation, ...Citation[]]

export type GemId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface SignOff {
  gem: GemId
  /** Where the ruling is recorded: "WO#391", "docs/wo391-...md §2". */
  ruling: string
  /** ISO date of the ruling, "2026-09-27". */
  date: string
}

/** Per-field review record. The bundle-time check (src/teach/validate.ts)
 *  refuses any field whose required gems are not all present. */
export interface Reviewed {
  reviewedBy: readonly SignOff[]
}

// ─── Fields ──────────────────────────────────────────────────────────

/** One word (or fixed phrase) quoted in Field 1. */
export interface TeachWord {
  /** Exactly as it appears in the record's Arabic (a substring of it for a
   *  du'a or verse; the Name itself for a Name). Checked at bundle time. */
  arabic: string
  transliteration: string
}

/** Field 1. Gem 2. One root; usually one word, sometimes two from the same
 *  root (WO#405: D00068 quotes az-zulumat and az-zalimin together). */
export interface TeachKeyWord extends Reviewed {
  words: readonly [TeachWord, ...TeachWord[]]
  /** Root letters, Arabic, space-separated: "ك ر ب". */
  root: string
  /** Root letters, transliterated: "k-r-b". */
  root_transliteration: string
  gloss: string
}

/** Field 2, cited form. Gem 4. Any attribution or communal-practice claim
 *  ("traditionally recited by...") lives here and only here. */
export interface TeachContextCited extends Reviewed {
  kind: 'cited'
  text: string
  citations: Citations
}

/** Field 2, fallback form (Gem 4, 27 Sep 2026). Du'a records only: an
 *  ungraded or sourceless du'a carries exactly the locked string. */
export interface TeachContextFallback extends Reviewed {
  kind: 'not_recorded'
  text: typeof UNATTRIBUTED_CONTEXT_FALLBACK
}

export type TeachContext = TeachContextCited | TeachContextFallback

/** Field 3. Optional per record. Gem 4, Founder-authored. No citation means
 *  the field is absent. */
export interface TeachMisconception extends Reviewed {
  authoredBy: 'founder'
  text: string
  citations: Citations
}

/** Field 4. Gem 3. */
export interface TeachReflection extends Reviewed {
  text: string
}

/**
 * Field 5. Gem 6 + Gem 7. An audience variant replaces the TEXT of a field
 * for that audience; it never adds a claim or a citation, and it never
 * replaces the Field 2 fallback (the locked string does not vary). A field a
 * variant omits falls back to the base text. Selection only; no generation.
 */
export interface TeachAudienceVariant extends Reviewed {
  key_word_gloss?: string
  /** Only when the base Field 2 is 'cited'; its citations are reused. */
  context_text?: string
  /** Only when the base Field 3 is present; its citations are reused. */
  misconception_text?: string
  reflection_text?: string
}

// ─── Related refs ────────────────────────────────────────────────────

/** A thread the agent can follow with one call (e.g. D00068 -> 21:87 ->
 *  Al-Ghafur -> 39:53). Stored minimal; RelatedRefWire carries the call. */
export type RelatedRef =
  | { kind: 'dua'; id: string }
  | { kind: 'verse'; ref: `${number}:${number}` }
  | { kind: 'name'; number: number }
  | { kind: 'glossary'; term: string }

// ─── Stored entry ────────────────────────────────────────────────────

interface TeachEntryBase {
  /** Locale of every string in the entry. Pilot is 'en' only; other
   *  locales get no teach block until localised copy is reviewed. */
  locale: 'en'
  key_word: TeachKeyWord
  misconception?: TeachMisconception
  reflection: TeachReflection
  by_audience?: Partial<Record<Audience, TeachAudienceVariant>>
  related?: {
    refs: readonly RelatedRef[]
    /** Architect ruling (WO#390 flag 4): a curatorial link is a
     *  claim about scripture, so Gem 2 signs the list. The bundle check enforces it. */
    reviewedBy: readonly SignOff[]
  }
  /** Gem 10, whole entry, before publish. Enforced by the release gate
   *  (scripts/release-gate.ts, run by mcp-deploy before any deploy or
   *  publish), not at bundle time, so signed field content can land on main
   *  unreleased (WO#405). */
  publishReviewedBy: readonly SignOff[]
}

export interface DuaTeachEntry extends TeachEntryBase {
  record: { kind: 'dua'; id: string }
  context: TeachContext
}

/** Verses and Names are never "sourceless": the Field 2 fallback does not
 *  apply to them. Field 2 is cited or absent. */
export interface VerseTeachEntry extends TeachEntryBase {
  record: { kind: 'verse'; ref: `${number}:${number}` }
  context?: TeachContextCited
}

export interface NameTeachEntry extends TeachEntryBase {
  record: { kind: 'name'; number: number }
  context?: TeachContextCited
}

export type TeachEntry = DuaTeachEntry | VerseTeachEntry | NameTeachEntry

// ─── Wire shapes (what a response would carry) ───────────────────────

export interface CitationWire {
  text: string
  grading?: string
}

/**
 * Attached to a record (the quran_verse / name_of_allah content, each du'a
 * in duas[], each verse in verses[]) as `teach`, ONLY when the caller sent
 * `audience`, an entry exists for that record and locale, and the response
 * is not crisis_resource_only. Absent otherwise, so JSON.stringify output is
 * unchanged byte for byte.
 */
export interface TeachBlockWire {
  record_id: TeachKey
  audience: Audience
  key_word: { words: Array<{ arabic: string; transliteration: string }>; root: string; root_transliteration: string; gloss: string }
  context?:
    | { attributed: true; text: string; citations: CitationWire[] }
    | { attributed: false; text: typeof UNATTRIBUTED_CONTEXT_FALLBACK }
  misconception?: { text: string; citations: CitationWire[] }
  /** Field 4. Absent on grief routes and whenever a soft support block is
   *  in the response (Gem 3, WO#405). */
  reflection_question?: string
}

/** One call the agent can make verbatim, or one resource it can read. */
export type RelatedRefWire =
  | { kind: 'verse'; label: string; call: { tool: 'get_quran_verse'; arguments: { surah: number; ayah: number } } }
  | { kind: 'name'; label: string; call: { tool: 'get_name_of_allah'; arguments: { number: number } } }
  /** get_dua resolves this id only if it is on the bundle-time allowlist (WO#390 flag 3). */
  | { kind: 'dua'; label: string; call: { tool: 'get_dua'; arguments: { id: string } } }
  | { kind: 'glossary'; label: string; resource: `sakina://glossary/${string}` }

/** The optional per-record additions, together. */
export interface TeachAttachment {
  teach?: TeachBlockWire
  related?: RelatedRefWire[]
}

// ─── MCP prompts ─────────────────────────────────────────────────────

/**
 * Prompt arguments (MCP prompt args are strings on the wire). `audience` is
 * REQUIRED on both prompts (Architect ruling on flag 1): a prompt exists to
 * teach, and teach content only appears when audience is sent. No free-text
 * argument except explore_a_name's `name`, which goes to the same resolver
 * (and the same lack of a crisis check) as get_name_of_allah today; see SG
 * report flag 9. Message text is authored later (Gem 10 + Gem 1); nothing
 * is registered yet.
 */
export interface TeachAVersePromptArgs {
  /** "1".."114" */
  surah: string
  /** "1".."286", validated against the surah */
  ayah: string
  audience: Audience
}

/**
 * Architect ruling on flag 9: explore_a_name accepts exactly what
 * get_name_of_allah accepts (a number 1-99, a transliteration, the Arabic, or
 * the English meaning) and passes it through to get_name_of_allah's existing
 * resolver (getNameByNumber / findNameByString). No new resolution logic.
 * One of `number` or `name`.
 */
export type ExploreANamePromptArgs =
  | { number: string; name?: undefined; audience: Audience }
  | { name: string; number?: undefined; audience: Audience }

// ─── Glossary resource ───────────────────────────────────────────────

/** One entry of sakina://glossary (application/json). Pre-authored; Gem 2
 *  for root and gloss, Gem 10 before publish. */
export interface GlossaryEntry {
  term: string
  arabic: string
  root?: string
  gloss: string
  citations?: Citations
  reviewedBy: readonly SignOff[]
}

export interface GlossaryResourceBody {
  version: string
  locale: 'en'
  entries: readonly Omit<GlossaryEntry, 'reviewedBy'>[]
}
