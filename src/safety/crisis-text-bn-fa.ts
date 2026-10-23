/**
 * Crisis text for bn and fa (WO#490, MCP 2.4.1; docs/wo490-architect.md).
 * Bengali and Persian are keyword languages since WO#488: no tool takes them
 * as a locale, and a bn or fa block is served only when the crisis words were
 * Bengali or Persian. Until 2.4.0 the block was the English text with local
 * lines; it is now Gem 1's translation, CONFIRMED by Gem 2 with one fix
 * (23 Oct 2026), loaded by script from crisis-bn-fa-strings.ts and served as
 * is, with the fa isolates below.
 *
 * The lines, numbers and hours are checked, when this module loads, against
 * BN_FA_LINES_FOUNDER_VERIFIED and src/data/helplines.ts (through
 * crisis-en-fallback-strings.ts). A translated text whose numbers or hours
 * differ makes the module throw, so it can never be served.
 *
 * fa is right to left. As the ar and ur blocks do (WO#481, 2.2.1), every
 * Latin-script run is isolated left to right (LRI ... PDI): each helpline
 * number, "24/7", each Latin-digit time inside the hours, the IASP URL and
 * "(dhulm)". The Persian hours phrase is isolated right to left (RLI ...
 * PDI), as ar and ur isolate Arabic-script hours. bn is left to right and
 * carries no isolates. Gem 2's hashes are for the text before isolates.
 */

import { ltr, rtl } from './bidi.js'
import { BN_FA_CRISIS_TEXT } from './crisis-bn-fa-strings.js'
import { EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from './crisis-en-fallback-strings.js'
import { digitsOnly } from './crisis-text-l10n.js'

export type BnFaLocale = 'bn' | 'fa'
export type BnFaKind = 'self-harm' | 'abuse' | 'soft'

const IASP = 'https://www.iasp.info/resources/Crisis_Centres/'
const DHULM = '(dhulm)'

/**
 * Founder verification of the bn and fa lines (#564, Gem 10 armour, 22 Oct
 * 2026), recorded the way US_988_FOUNDER_VERIFIED is. The Founder verified
 * these five lines on 22 Oct 2026, by number. Sources:
 *   - Kaan Pete Roi: kaanpeteroi.org/helpline-service
 *   - Iran 123 and 1480: help.unhcr.org/iran (psycho-social support)
 *   - Bangladesh 109 and 999: thedailystar.net, 16 Days of Activism 2025
 *     (999 added as its source by WO#490)
 * A bn or fa block is served only if every line in it is listed here with
 * the same digits (verifyBnFaLines below throws otherwise), so an unverified or
 * changed number can never be served. Changing a number in
 * src/data/helplines.ts therefore needs a new Founder verification here.
 */
export const BN_FA_LINES_FOUNDER_VERIFIED = {
  verifiedBy: 'Founder',
  date: '2026-10-22',
  lines: {
    'bn-emergency-999': '999',
    'bd-mowca-109': '109',
    'bn-kaan-pete-roi': '09612119911',
    'fa-emergency-123': '123',
    'fa-social-emergency-1480': '1480',
  },
} as const

/** A helpline line: "Name (Country): number (hours)". */
const HELPLINE_LINE = /^(.+\)): ([0-9]+) \((.+)\)$/u
/** Latin-digit tokens: a time (3:00), "24/7", or a plain number. */
const DIGIT_TOKEN = /[0-9]+(?::[0-9]+|\/[0-9]+)?/g

const tokens = (s: string) => s.match(DIGIT_TOKEN) ?? []

/**
 * The text's helpline lines must be, in order, the block's Founder-verified
 * lines (WO#488 A6: bn self-harm 999 then Kaan Pete Roi, bn abuse 109 then
 * 999, fa self-harm 123 then 1480, fa abuse 123), and each line's hours must
 * carry the same times as helplines.ts.
 */
export function verifyBnFaLines(l: BnFaLocale, kind: BnFaKind, text: string): void {
  const ids: readonly string[] = kind === 'soft' ? [] : EN_FALLBACK_IDS[l][kind]
  const lines = text.split('\n').map((x) => HELPLINE_LINE.exec(x)).filter((m): m is RegExpExecArray => m !== null)
  const where = `WO#490 ${l} ${kind}`
  if (lines.length !== ids.length) throw new Error(`${where}: ${lines.length} helpline lines, expected ${ids.length}`)
  ids.forEach((id, i) => {
    const verified = (BN_FA_LINES_FOUNDER_VERIFIED.lines as Record<string, string>)[id]
    const f = EN_FALLBACK_FIELDS[id]!
    const [, , number, hours] = lines[i]!
    if (!verified || verified !== digitsOnly(f.phone)) throw new Error(`${where}: ${id} is not a Founder-verified line`)
    if (number !== verified) throw new Error(`${where}: line ${i + 1} has ${number}, the Founder-verified ${id} is ${verified}`)
    if (tokens(hours!).join() !== tokens(f.hours).join()) throw new Error(`${where}: line ${i + 1} hours (${tokens(hours!).join()}) differ from helplines.ts (${tokens(f.hours).join()})`)
  })
}

/** Count of `part` in `s`. */
const count = (s: string, part: string) => s.split(part).length - 1

/** The fa isolates (see the header). Each replacement is counted, so a changed text fails loudly. */
function isolateFa(kind: BnFaKind, text: string): string {
  const out = text.split('\n').map((line) => {
    const m = HELPLINE_LINE.exec(line)
    if (!m) return line
    const [, head, number, hours] = m
    const isoHours = hours === '24/7' ? ltr(hours) : rtl(hours!.replace(DIGIT_TOKEN, (t) => ltr(t)))
    return `${head}: ${ltr(number!)} (${isoHours})`
  }).join('\n')
  const urls = count(out, IASP)
  const dhulm = count(out, DHULM)
  if (urls !== (kind === 'abuse' ? 0 : 1) || dhulm !== (kind === 'abuse' ? 1 : 0)) throw new Error(`WO#490 fa ${kind}: ${urls} URL(s) and ${dhulm} "${DHULM}", not the expected text`)
  return out.split(IASP).join(ltr(IASP)).split(DHULM).join(ltr(DHULM))
}

/** Latin letters or digits left outside an isolate (none may remain in fa). */
export function unisolatedLatin(s: string): string[] {
  const stripped = s.replace(/⁦[^⁦-⁩]*⁩/gu, '')
  return stripped.match(/[A-Za-z0-9]+/g) ?? []
}

function build(l: BnFaLocale, kind: BnFaKind): string {
  const text = BN_FA_CRISIS_TEXT[`${l} ${kind}`]
  verifyBnFaLines(l, kind, text)
  if (l === 'bn') return text
  const iso = isolateFa(kind, text)
  const left = unisolatedLatin(iso)
  if (left.length) throw new Error(`WO#490 fa ${kind}: Latin text outside an isolate: ${left.join(', ')}`)
  return iso
}

const TEXT: Record<BnFaLocale, Record<BnFaKind, string>> = {
  bn: { 'self-harm': build('bn', 'self-harm'), abuse: build('bn', 'abuse'), soft: build('bn', 'soft') },
  fa: { 'self-harm': build('fa', 'self-harm'), abuse: build('fa', 'abuse'), soft: build('fa', 'soft') },
}

/** The served text of a bn or fa block. */
export function bnFaText(l: BnFaLocale, kind: BnFaKind): string {
  return TEXT[l][kind]
}
