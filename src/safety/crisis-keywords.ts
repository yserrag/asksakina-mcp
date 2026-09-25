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

const IASP = 'https://www.iasp.info/resources/Crisis_Centres/'

// ─── Self-harm block ────────────────────────────────────────────────

/**
 * 988 (US/Canada) is NOT on the Founder-verified list (src/data/helplines.ts
 * has no entry for it). Architect ruling, WO#385, 25 Sep 2026: keep it only
 * after Founder verification.
 *
 * TODO(Founder check, WO#385): verify 988 (US/Canada Suicide & Crisis
 * Lifeline, 24/7) and add it to src/data/helplines.ts; then set this to true.
 * While false, 988 is not served in any block.
 */
export const US_988_FOUNDER_VERIFIED = false

const HARD_CRISIS_DIRECTIVE =
  'CRITICAL: You MUST output the following crisis resource text exactly as written below. Do not alter it or make it conditional. Do not assess whether the user needs it; output it.'

/**
 * Per-locale self-harm resource text (Gem 10 round-3, Option A; WO#385
 * rulings). Every number is in src/data/helplines.ts. 24/7 lines come first;
 * a limited-hours line carries its hours from helplines.ts. UK/US numbers
 * appear ONLY in `en`. Egypt is served by the IASP directory (Befrienders
 * Cairo 762 2381 was removed: not on the verified list).
 */
const SELF_HARM_LINES: Record<CrisisLocale, string> = {
  en: US_988_FOUNDER_VERIFIED
    ? 'Samaritans (UK: 116 123, 24/7) or 988 (US/Canada, 24/7)'
    : 'Samaritans (UK: 116 123, 24/7)',
  id: 'Sehat Jiwa (Indonesia: 119 ext 8, 24/7) or Halo Kemenkes (1500-567, Monday to Friday, office hours)',
  ur: 'Umang Helpline (Pakistan: 0311-7786264, 24/7) or Rozan Counselling (0800-22444, business hours)',
  ar: 'Lebanon Embrace 1564 (24/7), Saudi Arabia 920033360 (8am to 8pm daily; Saturday 1pm to 8pm), UAE 800-HOPE (4673) (8am to 8pm)',
}

const HARD_CRISIS_TEXT: Record<CrisisLocale, string> = {
  en: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as ${SELF_HARM_LINES.en}, or visit ${IASP} for international crisis lines.`,
  id: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as ${SELF_HARM_LINES.id}, or visit ${IASP} for international crisis lines.`,
  ur: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as ${SELF_HARM_LINES.ur}, or visit ${IASP} for international crisis lines.`,
  ar: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline in your country: ${SELF_HARM_LINES.ar}, or visit ${IASP} for Egypt and other regions.`,
}

/**
 * Self-harm block. The directive is intentionally unconditional: Sakina has
 * already detected the crisis, and the agent must not second-guess (Gem 10
 * fix 5). `HARD_CRISIS_RESOURCE_BLOCK` is the `en` default.
 */
export const HARD_CRISIS_RESOURCE_BLOCK = {
  level: 'hard' as const,
  crisis_type: 'self-harm' as const,
  locale: 'en' as const,
  directive: HARD_CRISIS_DIRECTIVE,
  text: HARD_CRISIS_TEXT.en,
} as const

function selfHarmBlockFor(locale: CrisisLocale) {
  if (locale === 'en') return HARD_CRISIS_RESOURCE_BLOCK
  return {
    level: 'hard' as const,
    crisis_type: 'self-harm' as const,
    locale,
    directive: HARD_CRISIS_DIRECTIVE,
    text: HARD_CRISIS_TEXT[locale],
  }
}

// ─── Abuse block (WO#385: forked pathway) ───────────────────────────

/**
 * Before WO#385 an abuse input got the self-harm block ("having thoughts of
 * harming yourself"), which breaks the forked-pathway rule. Abuse now has
 * its own block.
 *
 * Gem 3 ruling, verbatim (Architect, 25 Sep 2026; supersedes the earlier
 * draft). Oppression (dhulm) framing, safety before endurance, no command to
 * leave.
 */
export const ABUSE_SENTENCE =
  'What you are experiencing is oppression (dhulm), and you are not to blame. Your first duty is to protect your safety, not to endure harm. Professional support is available to help you navigate this safely.'

const ABUSE_DIRECTIVE =
  "CRITICAL: The user's message indicates they may be experiencing abuse. You MUST output the following resource text exactly as written below. Do not alter it or make it conditional. Do NOT give confrontation advice. Do NOT tell the user to \"just leave\" or when to leave. Do NOT suggest couples counselling, mediation or reconciliation. Do NOT frame enduring the abuse as sabr (patience), a test to bear, or a religious duty."

/**
 * Domestic-abuse lines per locale. Every one is a Founder-verified entry in
 * src/data/helplines.ts with category 'abuse' (entry ids in brackets). 24/7
 * first; limited-hours lines carry their hours.
 */
const ABUSE_LINES: Record<CrisisLocale, string> = {
  // en-ndah
  en: 'the National Domestic Abuse Helpline (UK: 0808 2000 247, 24/7, free)',
  // id-sapa, id-komnas
  id: 'SAPA 129 (Indonesia: 129, 24/7) or Komnas Perempuan (021-3903963, Monday to Friday, office hours)',
  // ur-madadgaar, ur-rozan
  ur: 'Madadgaar National Helpline (Pakistan: 1098, 24/7) or Rozan Counselling (0800-22444, business hours)',
  // ar-saudi-1919, ar-uae-dfwac, ar-egypt-ncw, ar-jordan-fpd, ar-morocco-sos-femmes
  ar: 'Saudi Arabia Family Violence Reporting Center 1919 (24/7), UAE Dubai Foundation for Women and Children 800-111 (24/7), Egypt National Council for Women Complaints Office 15115 (24/7), Jordan Family Protection Department 110 (24/7), Morocco SOS Femmes 0801 00 47 47 (office hours)',
}

const ABUSE_TEXT: Record<CrisisLocale, string> = {
  en: `${ABUSE_SENTENCE} The ${ABUSE_LINES.en.replace(/^the /, '')}. If you are in immediate danger, call your local emergency services.`,
  id: `${ABUSE_SENTENCE} ${ABUSE_LINES.id}. If you are in immediate danger, call your local emergency services.`,
  ur: `${ABUSE_SENTENCE} ${ABUSE_LINES.ur}. If you are in immediate danger, call your local emergency services.`,
  ar: `${ABUSE_SENTENCE} In your country: ${ABUSE_LINES.ar}. If you are in immediate danger, call your local emergency services.`,
}

function abuseBlockFor(locale: CrisisLocale) {
  return {
    level: 'hard' as const,
    crisis_type: 'abuse' as const,
    locale,
    directive: ABUSE_DIRECTIVE,
    text: ABUSE_TEXT[locale],
  }
}

// ─── Soft distress block ────────────────────────────────────────────

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
 * Returns the right block for a distress hint (or a bare level) and request
 * locale, or undefined for none. A hard hint with crisisType 'abuse' gets the
 * abuse block; any other hard hint gets the self-harm block.
 */
export function distressBlockFor(
  hint: DistressHint | DistressLevel,
  locale: CrisisLocale = 'en',
) {
  const h: DistressHint = typeof hint === 'string' ? { level: hint } : hint
  if (h.level === 'hard') return h.crisisType === 'abuse' ? abuseBlockFor(locale) : selfHarmBlockFor(locale)
  if (h.level === 'soft') return softDistressBlockFor(locale)
  return undefined
}
