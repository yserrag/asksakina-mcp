import { z } from 'zod';
import { DAWAH_ADAB_BLOCK } from '../contracts/instructions.js';
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