/**
 * Learning journeys as MCP prompts (WO#489, MCP 2.4.0; docs/wo489-architect.md;
 * design: docs/mcp-teach-phase0/04-learning-journeys.md D.3 and D.5).
 *
 * Two of the four journeys ship, built only on records and teach entries that
 * are already Gem-approved: `understand_a_verse` and `explore_names_of_allah`.
 * `what_muslims_believe` and `first_steps_new_muslim` stay parked (they need
 * authored content).
 *
 * A prompt adds no religious content. Its message tells the agent to call one
 * tool and then follow the rules that tool's response already carries
 * (`_sakina_meta.llm_directives.CRITICAL_RULES` and `presentation_contract`,
 * which hold the teaching order whenever a teach block is served) and the
 * server's da'wah adab, quoted verbatim from contracts/instructions.ts. The
 * only new wording is the connecting text below (PROMPT_STRINGS), for Gem 1
 * and Gem 10.
 *
 * Arguments are strings on the wire (MCP prompt arguments carry no type) and
 * are validated before the callback runs; they are never logged or counted.
 * Only the per-name fetch counter (WO#488 Part B) is, in server.ts.
 */

import { z } from 'zod'
import { DAWAH_ADAB_BLOCK } from '../contracts/instructions.js'

/** Every new string the two prompts add (WO#489 item 2). Gem 1 APPROVED all of them as they are (22 Oct 2026). */
export const PROMPT_STRINGS = {
  understandTitle: 'Understand a verse',
  understandDescription: 'Fetch one Quran verse by surah and ayah, then present it with its teaching notes, if any.',
  exploreTitle: 'Explore the Names of Allah',
  exploreDescription: 'Fetch one of the 99 Names of Allah by number (1 if none is given), then present it with its teaching notes, if any, and offer the next Name.',
  numberArg: 'Name number, 1-99; defaults to 1',
  callVerse: 'Call the get_quran_verse tool with surah {surah} and ayah {ayah}.',
  callName: 'Call the get_name_of_allah tool with number {number}.',
  follow:
    "Then present the response by the rules it carries in _sakina_meta.llm_directives.CRITICAL_RULES and _sakina_meta.presentation_contract, including the teaching order when it carries a teach block, and by this server's da'wah adab:",
  nextName: 'Offer one next step only: Name {next} (call get_name_of_allah with number {next} if the user says yes).',
  block: 'If a response carries a crisis_resource block, follow its directive and add nothing: no reflection question and no next step.',
} as const

/** Argument descriptions reused from the tools' own schemas (not new). */
const SURAH_ARG = 'Surah number, 1-114'
const AYAH_ARG = 'Ayah (verse) number within the surah'

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]))

/**
 * A whole number written in plain digits, within [min, max]. The same bounds
 * as the tool the prompt calls (get_quran_verse: surah 1-114, ayah 1-286;
 * get_name_of_allah: 1-99). Whether an ayah exists in its surah is the tool's
 * answer (not_found), as for a direct call.
 */
const digits = (maxLen: number, min: number, max: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${maxLen}}$`))
    .refine((s) => Number(s) >= min && Number(s) <= max, { message: `must be a whole number from ${min} to ${max}` })

export const understandAVerseArgs = {
  surah: digits(3, 1, 114).describe(SURAH_ARG),
  ayah: digits(3, 1, 286).describe(AYAH_ARG),
}

export const exploreNamesArgs = {
  number: digits(2, 1, 99).optional().describe(PROMPT_STRINGS.numberArg),
}

/**
 * SDK 1.30.1 parses `params.arguments` as sent, so a client that sends no
 * `arguments` at all would be refused, though every argument of
 * explore_names_of_allah is optional. server.ts registers the raw shape (so
 * the SDK lists the argument as usual), then sets the registered prompt's
 * `argsSchema` to this object schema, which reads a missing `arguments` as
 * {}. It keeps `shape`, which is what the SDK lists arguments from.
 */
export function readMissingArgumentsAsEmpty<T extends z.ZodRawShape>(shape: T) {
  return Object.assign(z.preprocess((v) => v ?? {}, z.object(shape)), { shape })
}

type PromptResult = { description: string; messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> }
const message = (description: string, lines: string[]): PromptResult => ({
  description,
  messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
})

export function understandAVersePrompt(args: { surah: string; ayah: string }): PromptResult {
  return message(PROMPT_STRINGS.understandDescription, [
    fill(PROMPT_STRINGS.callVerse, { surah: Number(args.surah), ayah: Number(args.ayah) }),
    PROMPT_STRINGS.follow,
    DAWAH_ADAB_BLOCK,
    PROMPT_STRINGS.block,
  ])
}

export function exploreNamesPrompt(args: { number?: string }): PromptResult {
  const n = args.number === undefined ? 1 : Number(args.number)
  return message(PROMPT_STRINGS.exploreDescription, [
    fill(PROMPT_STRINGS.callName, { number: n }),
    PROMPT_STRINGS.follow,
    DAWAH_ADAB_BLOCK,
    // Name 99 is the last; there is no next number to offer.
    ...(n < 99 ? [fill(PROMPT_STRINGS.nextName, { next: n + 1 })] : []),
    PROMPT_STRINGS.block,
  ])
}
