/**
 * Localised crisis text for ar, ur, id and tr (WO#481, MCP 2.2.1). Gem 3
 * approved the structure and the reuse of the app's crisis.immediateDanger,
 * Gem 1 the translations, Gem 2 the ar and ur code points and the bidi rules,
 * all on 21 Oct 2026 (docs/wo481-architect.md). en is not built here; its
 * blocks in crisis-keywords.ts are unchanged.
 *
 * Every user-facing string comes from crisis-l10n-strings.ts, which is
 * generated from the ruling record, src/data/helplines.ts and the app
 * bundles. This module only assembles: lines joined with "\n", each helpline
 * on its own line as "Name: number (hours)".
 *
 *   self-harm, ar/ur/id: T1, T2, the helpline lines, T3
 *   self-harm, tr:       T1, T4, T5
 *   abuse:               T6a T6b T6c (one paragraph), T7 (ar only), the
 *                        helpline lines, then crisis.immediateDanger (ar, ur,
 *                        tr) or T8 (id)
 *   soft:                T9a T9b (one paragraph)
 *
 * Name rules (the record, and the Architect's rulings of 21 Oct 2026):
 * ur uses the three Latin names the record lists; in a helplines.ts name,
 * " \u2014 " (an em dash with its spaces) is rendered as ", " here only,
 * so no name is cut and helplines.ts is unchanged (ruling 1); in ar and ur,
 * every Latin-script run in a line sits in LRI ... PDI (ruling 2).
 */

import { ltr, rtl } from './bidi.js'
import {
  ABUSE_IDS,
  COUNTRY_NAMES,
  HELPLINE_FIELDS,
  IASP_URL,
  IMMEDIATE_DANGER,
  L10N_HOURS,
  L10N_STRINGS,
  SELF_HARM_IDS,
  TR_ABUSE_LINES,
} from './crisis-l10n-strings.js'

export type L10nLocale = 'ar' | 'ur' | 'id' | 'tr'

const isRtl = (l: L10nLocale) => l === 'ar' || l === 'ur'

/** The IASP URL, isolated left to right inside ar and ur text. */
function iasp(l: L10nLocale): string {
  return isRtl(l) ? ltr(IASP_URL) : IASP_URL
}

/** A T string with its [IASP] placeholder replaced by the plain URL. */
function fill(s: string, l: L10nLocale): string {
  return s.split('[IASP]').join(iasp(l))
}

/** The record's ur names (Latin), by helplines.ts id. */
const UR_NAMES: Record<string, string> = {
  'ur-umang': 'Umang Helpline',
  'ur-rozan': 'Rozan Counselling',
  'ur-madadgaar': 'Madadgaar National Helpline',
}

function nameOf(id: string, l: L10nLocale): string {
  if (l === 'ur') return UR_NAMES[id] ?? HELPLINE_FIELDS[id]!.name
  // Ruling 1: the MCP rendering replaces " \u2014 " with ", "; the full name
  // stays. Ruling of 21 Oct (Arabic comma): an Arabic-script name in ar joins
  // with U+060C and a space instead; a Latin-script name keeps ", ".
  const name = HELPLINE_FIELDS[id]!.name
  const join = l === 'ar' && ARABIC_SCRIPT.test(name) ? '\u060C ' : ', '
  return name.split(' \u2014 ').join(join)
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/

/**
 * Ruling 2: every Latin-script run (letters, digits and the punctuation
 * inside a name) is isolated left to right, through the one helper.
 */
const LATIN_RUN = /[A-Za-z0-9](?:[A-Za-z0-9 ,.&'()-]*[A-Za-z0-9)])?/g
function isolateLatinRuns(s: string): string {
  return s.replace(LATIN_RUN, (run) => ltr(run))
}

/**
 * Gem 10 condition 2 (21 Oct 2026): in ar and ur a phone number is rendered
 * as digits only. Applied to the `phone` field of a listed helpline, here and
 * nowhere else: never to a T string, a du'a, a verse, a hadith or a
 * reference.
 */
export const PHONE_SEPARATORS = /[ -]/g
export function digitsOnly(phone: string): string {
  return phone.replace(PHONE_SEPARATORS, '')
}

function numberOf(id: string, l: L10nLocale): string {
  // The record: SEJIWA is "119, lalu tekan 8" (helplines.ts: "119 ext. 8").
  if (id === 'id-sejiwa') return '119, lalu tekan 8'
  const phone = HELPLINE_FIELDS[id]!.phone
  return isRtl(l) ? digitsOnly(phone) : phone
}

/** Gem 10 condition 1: the line's country, from the locale's countries.* key. */
function countryOf(id: string, l: L10nLocale): string {
  const code = HELPLINE_FIELDS[id]!.country
  const name = COUNTRY_NAMES[l][code]
  if (!name) throw new Error(`WO#481: no countries.${code} in the ${l} bundle (${id})`)
  return name
}

/** The hours for a line, in the locale's words (the record's Hours lines). */
function hoursOf(id: string, l: L10nLocale): string {
  const token = HELPLINE_FIELDS[id]!.hours ?? ''
  if (l === 'ar') {
    const h = L10N_HOURS.ar
    if (token === '24/7') return h['24/7']
    if (token === 'Office hours') return h.office
    if (token === '8am–8pm daily (Sat 1pm–8pm)') return h.saudi
    if (token === '8am–8pm') return h.uae
  }
  if (l === 'ur') {
    const h = L10N_HOURS.ur
    if (token === '24/7') return h['24/7']
    if (token === 'Business hours') return h.business
  }
  if (l === 'id') {
    // The record: "Hours: 24/7"; office hours are the dataset string verbatim.
    if (id === 'id-sejiwa' || token === '24/7') return '24/7'
    return token
  }
  throw new Error(`WO#481: no ${l} hours for ${id} ("${token}")`)
}

/**
 * One helpline line, "Name (Country): number (hours)" (Gem 10 condition 1),
 * with the ar/ur isolates. The country is the locale's own word for it.
 */
function helplineLine(id: string, l: L10nLocale): string {
  const name = nameOf(id, l)
  const country = countryOf(id, l)
  const number = numberOf(id, l)
  const hours = hoursOf(id, l)
  if (!isRtl(l)) return `${name} (${country}): ${number} (${hours})`
  const isoName = isolateLatinRuns(name)
  const isoHours = hours === '24/7' ? ltr(hours) : rtl(hours)
  return `${isoName} (${country}): ${ltr(number)} (${isoHours})`
}

/**
 * The tr abuse lines are the record's, verbatim; Gem 10 condition 1 adds the
 * country to the two that are helpline lines (ALO 183 and 112), found by
 * their "Name: number (" shape and the entry's phone. The WhatsApp line is a
 * channel of ALO 183, not a helpline line, and is unchanged.
 */
function trAbuseLines(): string[] {
  return TR_ABUSE_LINES.map((line) => {
    const id = ABUSE_IDS.tr.find((i) => line.includes(`: ${HELPLINE_FIELDS[i]!.phone} (`))
    if (!id) return line
    const at = line.indexOf(': ')
    return `${line.slice(0, at)} (${countryOf(id, 'tr')})${line.slice(at)}`
  })
}

export function selfHarmText(l: L10nLocale): string {
  if (l === 'tr') {
    const s = L10N_STRINGS.tr
    return [s.T1, s.T4, fill(s.T5, l)].join('\n')
  }
  const s = L10N_STRINGS[l]
  return [s.T1, s.T2, ...SELF_HARM_IDS[l].map((id) => helplineLine(id, l)), fill(s.T3, l)].join('\n')
}

export function abuseText(l: L10nLocale): string {
  const s = L10N_STRINGS[l]
  const paragraph = [s.T6a, s.T6b, s.T6c].join(' ')
  if (l === 'tr') return [paragraph, ...trAbuseLines(), IMMEDIATE_DANGER.tr].join('\n')
  const lines = ABUSE_IDS[l].map((id) => helplineLine(id, l))
  if (l === 'ar') return [paragraph, L10N_STRINGS.ar.T7, ...lines, IMMEDIATE_DANGER.ar].join('\n')
  if (l === 'ur') return [paragraph, ...lines, IMMEDIATE_DANGER.ur].join('\n')
  return [paragraph, ...lines, L10N_STRINGS.id.T8].join('\n')
}

export function softText(l: L10nLocale): string {
  const s = L10N_STRINGS[l]
  return [s.T9a, fill(s.T9b, l)].join(' ')
}
