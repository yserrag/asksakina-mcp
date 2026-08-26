/**
 * Crisis & soft-distress detection for the MCP `get_dua` tool.
 *
 * Two boundaries:
 *
 *   - HARD CRISIS — `detectCrisis` from the main app
 *     (self-harm / abuse). Triggers an unconditional crisis-resource
 *     block that the calling agent must surface verbatim.
 *
 *   - SOFT DISTRESS — emotional-keyword match (anxiety, stress,
 *     fear, grief, despair, etc.). Triggers a softer "support is
 *     available" appendix per Gem 10's fix 4 + fix 5 (2026-05-08).
 *
 * Hard always wins over soft when both match.
 */

import { detectCrisis, type CrisisType } from './_synced/crisis-detection.js'

export type DistressLevel = 'hard' | 'soft' | 'none'

export interface DistressHint {
  level: DistressLevel
  /** Populated when level === 'hard'. */
  crisisType?: CrisisType
  /** Populated when level === 'soft'. */
  matchedKeyword?: string
}

/**
 * Soft emotional-distress keywords. Matched as whole-word substrings
 * against the lower-cased context input. Per Gem 10: anxiety, grief,
 * stress, fear, despair, plus common variants the same review cluster
 * would naturally cover.
 *
 * The list is intentionally narrow — anything broader risks triggering
 * the resource on incidental words ("I'd love a du'a for stress at
 * work" should match; "the stress test passed" should not, but a
 * person typing the latter into get_dua is unlikely).
 */
const SOFT_DISTRESS_KEYWORDS = [
  'anxiety', 'anxious', 'panic',
  'stress', 'stressed', 'overwhelmed',
  'fear', 'fearful', 'afraid', 'scared', 'frightened',
  'grief', 'grieving', 'mourning', 'bereaved', 'bereavement',
  'loss', 'loss of', 'lost a',
  'despair', 'hopeless', 'hopelessness',
  'depression', 'depressed', 'sad', 'sadness',
  'worry', 'worried',
  'distress', 'distressed', 'distressing',
] as const

const WORD_BOUNDARY = /\W+/

function softDistressKeyword(input: string): string | undefined {
  const lower = input.toLowerCase()
  // Substring match is fine for short keywords like "anxiety", and the
  // input to get_dua is typically a short context query.
  for (const keyword of SOFT_DISTRESS_KEYWORDS) {
    if (keyword.includes(' ')) {
      if (lower.includes(keyword)) return keyword
      continue
    }
    // Whole-word check so "stress test" matches but "destressing" does
    // not lift "stress" out of context unintentionally.
    const tokens = lower.split(WORD_BOUNDARY)
    if (tokens.includes(keyword)) return keyword
  }
  return undefined
}

export function evaluateDistress(input: string): DistressHint {
  const crisis = detectCrisis(input)
  if (crisis.isCrisis) {
    return { level: 'hard', crisisType: crisis.crisisType }
  }
  const softMatch = softDistressKeyword(input)
  if (softMatch) {
    return { level: 'soft', matchedKeyword: softMatch }
  }
  return { level: 'none' }
}

/** Request locales the crisis blocks are localised for (matches get_dua). */
export type CrisisLocale = 'en' | 'id' | 'ur' | 'ar'

const HARD_CRISIS_DIRECTIVE =
  'CRITICAL: You MUST output the following crisis resource text exactly as written below. Do not alter it or make it conditional. Do not assess whether the user needs it; output it.'

/**
 * Per-locale hard-crisis resource text (Gem 10 round-3, Option A). Numbers
 * re-verified by the Architect. Each locale names in-country / in-region
 * helplines plus the IASP international directory as a fallback. UK/US numbers
 * (Samaritans, 988) appear ONLY in `en` — a non-English user is never handed a
 * helpline for a country they are not in.
 */
const HARD_CRISIS_TEXT: Record<CrisisLocale, string> = {
  en: 'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as Samaritans (UK: 116 123), 988 (US/Canada), or visit https://www.iasp.info/resources/Crisis_Centres/ for international crisis lines.',
  id: 'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as Halo Kemenkes (Indonesia: 1500-567) or Sehat Jiwa (119 ext 8), or visit https://www.iasp.info/resources/Crisis_Centres/ for international crisis lines.',
  ur: 'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as Umang Helpline (Pakistan: 0311-7786264) or Rozan Counselling (0800-22444), or visit https://www.iasp.info/resources/Crisis_Centres/ for international crisis lines.',
  ar: 'If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline in your country: Saudi Arabia 920033360, UAE 800-HOPE (4673), Lebanon Embrace 1564, Egypt Befrienders Cairo 762 2381, or visit https://www.iasp.info/resources/Crisis_Centres/ for other regions.',
}

/**
 * Hard crisis block. The directive is intentionally unconditional — Sakina has
 * already detected the crisis; the agent must not second-guess (Gem 10 fix 5).
 * `HARD_CRISIS_RESOURCE_BLOCK` is the `en` default; `hardCrisisBlockFor` returns
 * the verified per-locale variant. `locale` always reflects the request locale.
 */
export const HARD_CRISIS_RESOURCE_BLOCK = {
  level: 'hard' as const,
  locale: 'en' as const,
  directive: HARD_CRISIS_DIRECTIVE,
  text: HARD_CRISIS_TEXT.en,
} as const

function hardCrisisBlockFor(locale: CrisisLocale) {
  if (locale === 'en') return HARD_CRISIS_RESOURCE_BLOCK
  return {
    level: 'hard' as const,
    locale,
    directive: HARD_CRISIS_DIRECTIVE,
    text: HARD_CRISIS_TEXT[locale],
  }
}

/**
 * Soft distress block. Gentler framing per Gem 10 fix 4. The directive still
 * uses MUST-language structurally ("Include the following…"), but the surface
 * text is supportive rather than escalatory so an agent surfacing it for
 * "anxiety" does not read as alarmist. It names no country hotlines (that would
 * over-escalate mild distress) and points only to the IASP regional directory,
 * so it is locale-agnostic in content; `locale` still reflects the request.
 */
export const SOFT_DISTRESS_RESOURCE_BLOCK = {
  level: 'soft' as const,
  locale: 'en' as const,
  directive: 'Include the following supportive text at the end of your response:',
  text:
    'If these feelings become overwhelming, please know support is available. Visit https://www.iasp.info/resources/Crisis_Centres/ for helplines in your region.',
} as const

function softDistressBlockFor(locale: CrisisLocale) {
  if (locale === 'en') return SOFT_DISTRESS_RESOURCE_BLOCK
  return { ...SOFT_DISTRESS_RESOURCE_BLOCK, locale }
}

/**
 * Returns the right block for a given level + request locale, or undefined for
 * none. Non-English locales get the verified in-country hard-crisis table.
 */
export function distressBlockFor(level: DistressLevel, locale: CrisisLocale = 'en') {
  if (level === 'hard') return hardCrisisBlockFor(locale)
  if (level === 'soft') return softDistressBlockFor(locale)
  return undefined
}
