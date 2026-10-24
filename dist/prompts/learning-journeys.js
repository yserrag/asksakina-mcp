import { z } from 'zod';
import { DAWAH_ADAB_BLOCK, OPEN_DOOR_LINE } from '../contracts/instructions.js';
export const PROMPT_STRINGS = {
    understandTitle: 'Understand a verse',
    understandDescription: 'Fetch one Quran verse by surah and ayah, then present it with its teaching notes, if any.',
    exploreTitle: 'Explore the Names of Allah',
    exploreDescription: 'Fetch one of the 99 Names of Allah by number (1 if none is given), then present it with its teaching notes, if any, and offer the next Name.',
    numberArg: 'Name number, 1-99; defaults to 1',
    callVerse: 'Call the get_quran_verse tool with surah {surah} and ayah {ayah}.',
    callName: 'Call the get_name_of_allah tool with number {number}.',
    follow: "Then present the response by the rules it carries in _sakina_meta.llm_directives.CRITICAL_RULES and _sakina_meta.presentation_contract, including the teaching order when it carries a teach block, and by this server's da'wah adab:",
    nextName: 'Offer one next step only: Name {next} (call get_name_of_allah with number {next} if the user says yes).',
    block: 'If a response carries a crisis_resource block, follow its directive and add nothing: no reflection question and no next step.',
};
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
};
export const JOURNEY_DUA_IDS = ['D00234'];
const SURAH_ARG = 'Surah number, 1-114';
const AYAH_ARG = 'Ayah (verse) number within the surah';
const fill = (s, values) => s.replace(/\{(\w+)\}/g, (_, k) => String(values[k]));
const digits = (maxLen, min, max) => z
    .string()
    .regex(new RegExp(`^\\d{1,${maxLen}}$`))
    .refine((s) => Number(s) >= min && Number(s) <= max, { message: `must be a whole number from ${min} to ${max}` });
export const understandAVerseArgs = {
    surah: digits(3, 1, 114).describe(SURAH_ARG),
    ayah: digits(3, 1, 286).describe(AYAH_ARG),
};
export const exploreNamesArgs = {
    number: digits(2, 1, 99).optional().describe(PROMPT_STRINGS.numberArg),
};
export function readMissingArgumentsAsEmpty(shape) {
    return Object.assign(z.preprocess((v) => v ?? {}, z.object(shape)), { shape });
}
const message = (description, lines) => ({
    description,
    messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
});
const oneOf = (values) => z.string().refine((s) => values.includes(s), { message: `must be one of: ${values.join(', ')}` });
export const whatMuslimsBelieveArgs = {
    audience: oneOf(['curious', 'revert', 'practising']).optional().describe(JOURNEY_STRINGS.audienceArg),
};
export const firstStepsArgs = {
    step: oneOf(['1', '2', '3', '4']).optional().describe(JOURNEY_STRINGS.stepArg),
};
const J = JOURNEY_STRINGS;
const verse = (surah, ayah) => fill(PROMPT_STRINGS.callVerse, { surah, ayah });
const name = (number) => fill(PROMPT_STRINGS.callName, { number });
const read = (uri) => fill(J.readResource, { uri });
export function whatMuslimsBelievePrompt(args) {
    const audience = args.audience ?? 'curious';
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
    ]);
}
export function firstStepsPrompt(args) {
    const step = Number(args.step ?? '1');
    const revert = fill(J.audience, { audience: 'revert' });
    const rules = [PROMPT_STRINGS.follow, DAWAH_ADAB_BLOCK, J.revertCare, J.noOpenDoor, PROMPT_STRINGS.block];
    const lines = step === 1
        ? [revert, read('sakina://learn/first-steps#shahada'), J.noAsk, verse(112, 1), verse(112, 2), verse(112, 3), verse(112, 4), name(1), name(2), ...rules, fill(J.close, { next: 2 })]
        : step === 2
            ? [revert, verse(8, 38), read('sakina://learn/first-steps#forgiven'), name(34), verse(39, 53), J.callDua, ...rules, fill(J.close, { next: 3 })]
            : step === 3
                ? [revert, read('sakina://learn/first-steps#wudu'), read('sakina://learn/first-steps#first-prayer'), verse(1, 1), J.fatihaApp, ...rules, fill(J.close, { next: 4 })]
                : [revert, read('sakina://learn/first-steps#community'), ...rules, J.nextJ3];
    return message(J.firstStepsDescription, lines);
}
export function understandAVersePrompt(args) {
    return message(PROMPT_STRINGS.understandDescription, [
        fill(PROMPT_STRINGS.callVerse, { surah: Number(args.surah), ayah: Number(args.ayah) }),
        PROMPT_STRINGS.follow,
        DAWAH_ADAB_BLOCK,
        PROMPT_STRINGS.block,
    ]);
}
export function exploreNamesPrompt(args) {
    const n = args.number === undefined ? 1 : Number(args.number);
    return message(PROMPT_STRINGS.exploreDescription, [
        fill(PROMPT_STRINGS.callName, { number: n }),
        PROMPT_STRINGS.follow,
        DAWAH_ADAB_BLOCK,
        ...(n < 99 ? [fill(PROMPT_STRINGS.nextName, { next: n + 1 })] : []),
        PROMPT_STRINGS.block,
    ]);
}
//# sourceMappingURL=learning-journeys.js.map