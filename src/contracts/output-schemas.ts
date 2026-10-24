/**
 * WO#496: the outputSchema of each tool. Every tool result carries the
 * envelope twice: as `structuredContent` (an object matching the schema) and,
 * byte-identical to before, as the text content (`serialiseResponse`).
 *
 * The schemas describe the envelope that the handlers already return
 * (`SakinaResponse`, response-builder.ts). Every object is open
 * (`.passthrough()`, so JSON Schema `additionalProperties` is not false): a
 * field added later is not a validation failure in the SDK (server side) or
 * in a client that validates. A field is required only where every
 * buildResponse path of that kind sets it (read from the handlers and their
 * record types: QuranVerseRecord, DuaRecord, NameRecord), and test:wo496
 * runs the byte-identity calls, every not_found and crisis path, the abuse-safe
 * list and a lookup by id through the validating SDK client.
 */
import { z } from 'zod'

const open = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough()

const meta = (types: readonly [string, ...string[]]) =>
  open({
    version: z.string(),
    source: z.string(),
    content_type: z.enum(types),
    disclaimer: z.string(),
    disclaimer_locale: z.literal('en').optional(),
    llm_directives: open({ CRITICAL_RULES: z.array(z.string()) }),
    presentation_contract: open({}),
    educational_context: z.string(),
  })

const crisisResource = open({
  level: z.enum(['hard', 'soft']),
  crisis_type: z.string().optional(),
  locale: z.string(),
  directive: z.string(),
  text: z.string(),
}).describe('Present this block exactly, before anything else, and add nothing religious when content_type is crisis_resource_only.')

/** WO#478: the teaching block and related calls, where a teach entry exists. */
const teach = open({ record_id: z.string(), audience: z.string() })
const related = z.array(open({ kind: z.string(), label: z.string(), call: open({ tool: z.string(), arguments: open({}) }) }))

const notFound = (requested: z.ZodRawShape) => open({ requested: open(requested), reason: z.string() })
const crisisOnly = (requested: z.ZodRawShape) => open({ requested: open(requested), withheld: z.string(), reason: z.string() })

const envelope = (types: readonly [string, ...string[]], content: z.ZodTypeAny) =>
  open({ _sakina_meta: meta(types), content, crisis_resource: crisisResource.optional() })

export const getQuranVerseOutput = envelope(
  ['quran_verse', 'not_found'],
  z.union([
    open({
      surah_number: z.number().int(),
      surah_name_arabic: z.string(),
      surah_name_english: z.string(),
      ayah: z.number().int(),
      arabic_text: z.string(),
      translation: z.string(),
      translation_source: z.string(),
      translation_language: z.string(),
      translation_note: z.string().optional(),
      teach: teach.optional(),
      related: related.optional(),
    }),
    notFound({ surah: z.number().optional(), ayah: z.number().optional(), locale: z.string().optional() }),
  ]),
)

const dua = open({
  dua_block: z.string(),
  title: z.string(),
  arabic: z.string(),
  transliteration: z.string(),
  translation: z.string(),
  source: z.string(),
  grading: z.string(),
  grading_status: z.string(),
  context_tags: z.array(z.string()),
})

export const getDuaOutput = envelope(
  ['dua_collection', 'not_found', 'crisis_resource_only'],
  z.union([
    // three paths build a dua_collection (get-dua.ts): a context lookup, the
    // abuse-safe list (context and duas only) and a lookup by id (id, no context)
    open({
      duas: z.array(dua),
      total_results: z.number().int(),
      context: z.string().optional(),
      id: z.string().optional(),
      matched_by: open({ method: z.string() }).optional(),
      total_available: z.number().int().optional(),
      truncated: z.boolean().optional(),
      grading_summary: open({ quranic: z.number().int(), graded: z.number().int(), not_a_narration: z.number().int(), not_recorded: z.number().int() }).optional(),
    }),
    notFound({ context: z.string().optional(), id: z.string().optional() }),
    crisisOnly({ context: z.string().optional(), id: z.string().optional() }),
  ]),
)

export const getNameOfAllahOutput = envelope(
  ['name_of_allah', 'not_found', 'crisis_resource_only'],
  z.union([
    open({
      name_block: z.string(),
      number: z.number().int(),
      arabic: z.string(),
      transliteration: z.string(),
      english_meaning: z.string(),
      reflection: z.string(),
      quranic_references: z.array(z.string()),
      teach: teach.optional(),
      related: related.optional(),
    }),
    notFound({ name: z.string().optional(), number: z.number().optional(), locale: z.string().optional() }),
    crisisOnly({ name: z.string().optional() }),
  ]),
)

export const findVersesOutput = envelope(
  ['verse_collection', 'not_found', 'crisis_resource_only'],
  z.union([
    open({
      query: z.string(),
      matched_themes: z.array(open({ theme: z.string() })),
      verses: z.array(
        open({
          reference: z.string(),
          surah_name_english: z.string(),
          surah_name_arabic: z.string(),
          arabic: z.string(),
          translation: z.string(),
          translation_source: z.string(),
          relevance_note: z.string(),
        }),
      ),
      total_results: z.number().int(),
      no_results: z.boolean(),
    }),
    open({
      requested: open({ query: z.string() }),
      verses: z.array(z.unknown()),
      total_results: z.number().int(),
      no_results: z.boolean(),
      reason: z.string(),
      available_themes: z.array(z.string()),
    }),
    crisisOnly({ query: z.string() }),
  ]),
)

export const OUTPUT_SCHEMAS = {
  get_quran_verse: getQuranVerseOutput,
  get_dua: getDuaOutput,
  get_name_of_allah: getNameOfAllahOutput,
  find_verses: findVersesOutput,
} as const
