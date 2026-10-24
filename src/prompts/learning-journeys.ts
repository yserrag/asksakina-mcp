/**
 * Learning journeys as MCP prompts (WO#489, MCP 2.4.0; docs/wo489-architect.md;
 * design: docs/mcp-teach-phase0/04-learning-journeys.md D.3 and D.5).
 *
 * Two of the four journeys ship, built only on records and teach entries that
 * are already Gem-approved: `understand_a_verse` and `explore_names_of_allah`.
 * WO#495 (MCP 2.5.0) adds the two parked ones, `what_muslims_believe` and
 * `first_steps_new_muslim`: their authored prose is in the learn resources
 * (contracts/learn-content.ts), their messages are the strings below
 * (JOURNEY_STRINGS, Gems 1, 6, 7 and 3 approved; docs/wo495-architect.md
 * section 7), in the order docs/wo492-journeys-part4.md gives them.
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
import { DAWAH_ADAB_BLOCK, OPEN_DOOR_LINE } from '../contracts/instructions.js'

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

/**
 * WO#495: the new strings of the two journey prompts (docs/wo492-journeys-part4.md,
 * "Every new string (N), once"; all five messages approved by Gems 1, 6, 7 and 3).
 * Changed for the build (Gem 10 PASS, G10-3 and G10-4): callDua names the du'a by id (D00234,
 * Sahih al-Bukhari 744, as ruled), because "context repentance and limit 1" would
 * serve the category's first du'a (D00231, a general supplication). The titles,
 * descriptions and argument descriptions are new (the Builder's; Gem 10 PASS, G10-3).
 */
export const JOURNEY_STRINGS = {
  believeTitle: 'What do Muslims believe?',
  believeDescription: "What Muslims believe, from AskSakina's records: Surah Al-Ikhlas, the Name Ar-Rahman, a reviewed overview of the articles of faith and the pillars, and Quran 2:256.",
  audienceArg: 'curious, revert or practising; defaults to curious',
  firstStepsTitle: 'First steps as a new Muslim',
  firstStepsDescription: 'For a new Muslim, one step at a time: 1 One God and His mercy, 2 what has passed is forgiven, 3 prayer step by step, 4 your people.',
  stepArg: 'Step 1-4; defaults to 1',
  readAbout: 'Read the resource sakina://about first. It frames how sources are cited; do not show it to the user.',
  audience: 'Pass audience {audience} on every tool call.',
  readResource: 'Read the resource {uri} and present it verbatim, with its citations.',
  followUps: 'Answer follow-up questions only from these records and the resource. Where scholars differ, say so without choosing; where the notes end, say so and refer the user to a qualified scholar.',
  nextJ1: 'Offer one next step only: the understand_a_verse prompt on 2:255, or explore_names_of_allah on Name 2.',
  openDoor: 'At the close, offer this line once, verbatim, unless a crisis_resource block appeared or the user has disclosed distress: "{line}"',
  revertCare: "Do not answer questions about the user's family, marriage, name, work or food: refer them to a qualified scholar. Never judge the user's former faith or family, and never tell the user whether they are or are not Muslim.",
  noOpenDoor: 'Do not offer the open door.',
  noAsk: 'Do not ask the user to say the shahada.',
  close: 'Close with one line: when you are ready, step {next}. Offer no list of further practices.',
  callDua: 'Call the get_dua tool with id D00234.',
  fatihaApp: 'For the rest of Al-Fatiha, point the user to the AskSakina app; do not quote it from memory.',
  nextJ3: 'Offer one next step only: the understand_a_verse prompt on 1:1, or explore_names_of_allah.',
} as const

/**
 * The du'a ids a journey prompt names (J3 step 2: Sahih al-Bukhari 744). get_dua
 * resolves an id only from its allowlist (WO#390), so bundle-data adds these to it;
 * test-wo495 checks every id the prompts name is listed here. Gem 10 PASS (G10-10).
 */
export const JOURNEY_DUA_IDS: readonly string[] = ['D00234']

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

/**
 * One of a fixed set. Not z.enum: its error message quotes the value it
 * received, and a refused argument must never be echoed (WO#489).
 */
const oneOf = (values: readonly string[]) => z.string().refine((s) => values.includes(s), { message: `must be one of: ${values.join(', ')}` })

export const whatMuslimsBelieveArgs = {
  audience: oneOf(['curious', 'revert', 'practising']).optional().describe(JOURNEY_STRINGS.audienceArg),
}

export const firstStepsArgs = {
  step: oneOf(['1', '2', '3', '4']).optional().describe(JOURNEY_STRINGS.stepArg),
}

const J = JOURNEY_STRINGS
const verse = (surah: number, ayah: number) => fill(PROMPT_STRINGS.callVerse, { surah, ayah })
const name = (number: number) => fill(PROMPT_STRINGS.callName, { number })
const read = (uri: string) => fill(J.readResource, { uri })

/** J1 item 1 (docs/wo492-journeys-part4.md), line for line. */
export function whatMuslimsBelievePrompt(args: { audience?: string }): PromptResult {
  const audience = args.audience ?? 'curious'
  return message(J.believeDescription, [
    J.readAbout,
    fill(J.audience, { audience }),
    verse(112, 1),
    verse(112, 2),
    verse(112, 3),
    verse(112, 4),
    name(1),
    read('sakina://learn/what-muslims-believe'),
    verse(2, 256),
    PROMPT_STRINGS.follow,
    DAWAH_ADAB_BLOCK,
    J.followUps,
    J.nextJ1,
    fill(J.openDoor, { line: OPEN_DOOR_LINE }),
    PROMPT_STRINGS.block,
  ])
}

/** J3 item 1, steps 1 to 4 (docs/wo492-journeys-part4.md), line for line. One step per fetch. */
export function firstStepsPrompt(args: { step?: string }): PromptResult {
  const step = Number(args.step ?? '1')
  const revert = fill(J.audience, { audience: 'revert' })
  const rules = [PROMPT_STRINGS.follow, DAWAH_ADAB_BLOCK, J.revertCare, J.noOpenDoor, PROMPT_STRINGS.block]
  const lines =
    step === 1
      ? [revert, read('sakina://learn/first-steps#shahada'), J.noAsk, verse(112, 1), verse(112, 2), verse(112, 3), verse(112, 4), name(1), name(2), ...rules, fill(J.close, { next: 2 })]
      : step === 2
        ? [revert, verse(8, 38), read('sakina://learn/first-steps#forgiven'), name(34), verse(39, 53), J.callDua, ...rules, fill(J.close, { next: 3 })]
        : step === 3
          ? [revert, read('sakina://learn/first-steps#wudu'), read('sakina://learn/first-steps#first-prayer'), verse(1, 1), J.fatihaApp, ...rules, fill(J.close, { next: 4 })]
          : [revert, read('sakina://learn/first-steps#community'), ...rules, J.nextJ3]
  return message(J.firstStepsDescription, lines)
}

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
