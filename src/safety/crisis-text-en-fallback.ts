/**
 * Crisis text for bn and fa (WO#488 A6, MCP 2.4.0; docs/wo488-architect.md).
 * Bengali and Persian have no translated blocks yet (Gem 1 translates them
 * next), so each block is the English text with local lines, and carries the
 * English-fallback disclosure (the 2.2.1 pattern, contracts/english-fallback.ts).
 *
 *   self-harm: EN_SELF_HARM_OPENING, EN_SELF_HARM_CALL, the helpline lines,
 *              EN_SELF_HARM_IASP
 *   abuse:     ABUSE_SENTENCE, the helpline lines, EN_ABUSE_DANGER
 *   soft:      the en soft text, unchanged
 *
 * Every helpline field comes from crisis-en-fallback-strings.ts, generated
 * from src/data/helplines.ts. Each line is "Name (Country): number (hours)",
 * the number as contiguous digits (2.2.1).
 */

import { EN_COUNTRY_NAMES, EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from './crisis-en-fallback-strings.js'
import { digitsOnly } from './crisis-text-l10n.js'

export type EnFallbackLocale = 'bn' | 'fa'

const IASP = 'https://www.iasp.info/resources/Crisis_Centres/'

/**
 * Founder verification of the bn and fa lines (#564, Gem 10 armour, 22 Oct
 * 2026), recorded the way US_988_FOUNDER_VERIFIED is. The Founder verified
 * these five lines on 22 Oct 2026, by number. Sources:
 *   - Kaan Pete Roi: kaanpeteroi.org/helpline-service
 *   - Iran 123 and 1480: help.unhcr.org/iran (psycho-social support)
 *   - Bangladesh 109: thedailystar.net, 16 Days of Activism 2025
 *   - Bangladesh 999: no source named in the ruling; verified on the same date
 * A bn or fa block renders a line only if its entry is listed here with the
 * same digits (helplineLine below throws otherwise), so an unverified or
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

/** The first sentence of the en self-harm text, unchanged. */
export const EN_SELF_HARM_OPENING =
  'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now.'
/** New wording (for Gem 1): the en text's second sentence, ending at the lines. */
export const EN_SELF_HARM_CALL = 'Call your local emergency services, or contact a crisis helpline:'
/** New wording (for Gem 1): the en text's IASP clause, as its own line. */
export const EN_SELF_HARM_IASP = `Or visit ${IASP} for international crisis lines.`
/** The last sentence of the en abuse text, unchanged. */
export const EN_ABUSE_DANGER = 'If you are in immediate danger, call your local emergency services.'

function helplineLine(id: string): string {
  const f = EN_FALLBACK_FIELDS[id]!
  const country = EN_COUNTRY_NAMES[f.country]
  if (!country) throw new Error(`WO#488: no countries.${f.country} in the en bundle (${id})`)
  const number = digitsOnly(f.phone)
  const verified = (BN_FA_LINES_FOUNDER_VERIFIED.lines as Record<string, string>)[id]
  if (verified !== number) throw new Error(`#564: ${id} (${number}) is not a Founder-verified line (verified: ${verified ?? 'none'})`)
  return `${f.name} (${country}): ${number} (${f.hours})`
}

export function enFallbackSelfHarmText(l: EnFallbackLocale): string {
  return [EN_SELF_HARM_OPENING, EN_SELF_HARM_CALL, ...EN_FALLBACK_IDS[l]['self-harm'].map(helplineLine), EN_SELF_HARM_IASP].join('\n')
}

export function enFallbackAbuseText(l: EnFallbackLocale, abuseSentence: string): string {
  return [abuseSentence, ...EN_FALLBACK_IDS[l].abuse.map(helplineLine), EN_ABUSE_DANGER].join('\n')
}
