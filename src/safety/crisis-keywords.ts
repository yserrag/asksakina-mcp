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

import { crisisKeywordLanguages, detectCrisis, type CrisisKeywordLanguage, type CrisisType } from './_synced/crisis-detection.js'
import { abuseText, selfHarmText, softText } from './crisis-text-l10n.js'
import { foldLatin } from './_synced/latin-fold.js'

export type DistressLevel = 'hard' | 'soft' | 'none'

export interface DistressHint {
  level: DistressLevel
  /** Populated when level === 'hard'. */
  crisisType?: CrisisType
  /**
   * Populated when level === 'hard' or 'soft' (WO#482): the languages whose
   * keyword list the input hit (for a hard hint, the list for crisisType).
   * Used only when the request has no locale of its own (crisisLocaleFor).
   */
  keywordLanguages?: CrisisKeywordLanguage[]
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
export const SOFT_DISTRESS_KEYWORDS = [
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

/**
 * WO#482, Architect ruling (21 Oct 2026): words are split on anything that is
 * not a Unicode letter or number. The old /\W+/ split on every non-ASCII
 * letter, so a Turkish word with ı, ğ, ü, ş, ç or ö fell apart ("kaygı" became
 * "kayg") and no such keyword could ever match. Exported for test-wo482.
 */
export const SOFT_WORD_BOUNDARY = /[^\p{L}\p{N}]+/u

/**
 * WO#478 (Architect, 20 Oct 2026, phrase fixes only): a soft keyword inside
 * one of these phrases is not a distress signal. "loss of faith" is a
 * question about belief, not a bereavement; "fear of Allah" is taqwa, not
 * anxiety. Only the named keywords are skipped; any other keyword in the
 * same input still counts.
 */
export const SOFT_PHRASE_EXCLUSIONS: ReadonlyArray<{ phrase: string; keywords: readonly string[] }> = [
  { phrase: 'loss of faith', keywords: ['loss', 'loss of'] },
  { phrase: 'fear of allah', keywords: ['fear'] },
]

function softDistressKeyword(input: string): string | undefined {
  const lower = input.toLowerCase()
  const excluded = new Set(SOFT_PHRASE_EXCLUSIONS.filter((e) => lower.includes(e.phrase)).flatMap((e) => e.keywords))
  // Substring match is fine for short keywords like "anxiety", and the
  // input to get_dua is typically a short context query.
  for (const keyword of SOFT_DISTRESS_KEYWORDS) {
    if (excluded.has(keyword)) continue
    if (keyword.includes(' ')) {
      if (lower.includes(keyword)) return keyword
      continue
    }
    // Whole-word check so "stress test" matches but "destressing" does
    // not lift "stress" out of context unintentionally.
    const tokens = lower.split(SOFT_WORD_BOUNDARY)
    if (tokens.includes(keyword)) return keyword
  }
  return undefined
}

/**
 * WO#482, Gem 3 ruling (21 Oct 2026; docs/wo482-architect.md): Turkish soft
 * keywords. `prefix` entries match at a Unicode word start with any ending,
 * because Turkish adds suffixes ("kaygılıyım", "endişeleniyorum"); `whole`
 * entries match only as whole words or phrases. "çok üzgünüm" is not listed
 * (an apology false positive); "umutsuzum" is a hard keyword in the detector.
 */
export const SOFT_DISTRESS_KEYWORDS_TR: { readonly prefix: readonly string[]; readonly whole: readonly string[] } = {
  prefix: ['kaygı', 'endişe', 'bunal', 'korku', 'yas tut', 'çaresiz'],
  whole: ['yalnızım', 'stresliyim', 'kederliyim', 'daraldım', 'panik atak', 'içim acıyor', 'canım yanıyor', 'derdim var'],
}

/**
 * Turkish case-folding before matching (Gem 3): NFC first, so a decomposed
 * "İ" or "ü" composes, then İ to i and I to ı, then lower case. So
 * "Kaygı" and "KAYGI" both read "kaygı". Used for the Turkish keywords only:
 * English keeps plain lower-casing, where I must stay i.
 */
export function turkishFold(s: string): string {
  return s.normalize('NFC').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
}

/**
 * Devotional phrases, fear of Allah (taqwa), are not distress: "korku" is
 * skipped inside them (Gem 3, rounds 1 and 2). "Allah'tan kork-" with or
 * without the apostrophe and with either suffix vowel ("-tan", "-dan"), and
 * "Allah korkusu"; the whole following word is removed. ASCII only, so the
 * one pattern serves both the Turkish and the ASCII-folded copy.
 */
export const TR_DEVOTIONAL_FEAR = /allah(?:['’ʼ`]?[td]an\s+kork|\s+korkusu)[\p{L}\p{N}]*/gu

/**
 * Gem 3 round 2: the "korku" prefix does not match korkunç ("awful"), korkutucu
 * or the korkut- stem ("to frighten"). Written in Turkish letters and folded
 * by function for the ASCII copy.
 */
export const SOFT_PREFIX_EXCEPTIONS_TR: Readonly<Record<string, readonly string[]>> = { korku: ['nç', 't'] }

// The word start Gem 3 specified: JavaScript's \b is ASCII-only, so it is
// written as a lookbehind on Unicode letters and numbers.
const WORD_START = '(?<![\\p{L}\\p{N}])'
const WORD_END = '(?![\\p{L}\\p{N}])'
// An exception is excluded in both spellings in both passes: input typed
// in ASCII ("korkunc") reaches the Turkish-letter pass unchanged.
const except = (k: string) => {
  const ex = SOFT_PREFIX_EXCEPTIONS_TR[k]
  return ex ? `(?!${[...new Set(ex.flatMap((e) => [e, foldLatin(e)]))].join('|')})` : ''
}
const same = (s: string) => s

/**
 * Gem 3 round 2 (ASCII folding): each Turkish keyword is matched twice, in
 * Turkish letters against the Turkish-folded input, and folded to ASCII (by
 * the detector's own foldLatin: ı and İ to i, ş to s, ç to c, ğ to g, ö to
 * o, ü to u) against an ASCII-folded copy of the input, so "kaygi",
 * "caresizim" and "yalnizim" match. Only the Turkish lists are folded.
 */
const TR_PATTERNS = (['turkish', 'ascii'] as const).map((form) => {
  const fold = form === 'ascii' ? foldLatin : same
  return {
    form,
    prefix: SOFT_DISTRESS_KEYWORDS_TR.prefix.map((k) => [k, new RegExp(WORD_START + fold(k) + except(k), 'u')] as const),
    whole: SOFT_DISTRESS_KEYWORDS_TR.whole.map((k) => [k, new RegExp(WORD_START + fold(k) + WORD_END, 'u')] as const),
  }
})

function turkishSoftKeyword(input: string): string | undefined {
  const turkish = turkishFold(input)
  for (const p of TR_PATTERNS) {
    const text = p.form === 'ascii' ? foldLatin(turkish) : turkish
    const withoutDevotional = text.replace(TR_DEVOTIONAL_FEAR, ' ')
    for (const [keyword, re] of p.prefix) {
      if (re.test(keyword === 'korku' ? withoutDevotional : text)) return keyword
    }
    for (const [keyword, re] of p.whole) if (re.test(text)) return keyword
  }
  return undefined
}

export function evaluateDistress(input: string): DistressHint {
  const crisis = detectCrisis(input)
  if (crisis.isCrisis) {
    const keywordLanguages = crisis.crisisType === 'none' ? [] : crisisKeywordLanguages(input, crisis.crisisType)
    return { level: 'hard', crisisType: crisis.crisisType, keywordLanguages }
  }
  // WO#482: a soft hint records its languages too (en, tr), so the soft block
  // follows the detected language under the hard rule (crisisLocaleFor).
  const softMatch = softDistressKeyword(input)
  const trMatch = turkishSoftKeyword(input)
  if (softMatch || trMatch) {
    const keywordLanguages: CrisisKeywordLanguage[] = [...(softMatch ? ['en' as const] : []), ...(trMatch ? ['tr' as const] : [])]
    return { level: 'soft', matchedKeyword: softMatch ?? trMatch, keywordLanguages }
  }
  return { level: 'none' }
}

/** Request locales the crisis blocks are localised for (matches get_dua). */
export type CrisisLocale = 'en' | 'id' | 'ur' | 'ar' | 'tr'

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
 * The en self-harm lines (Gem 10 round-3, Option A; WO#385 rulings). Every
 * number is in src/data/helplines.ts. UK/US numbers appear ONLY in `en`.
 * WO#481: ar, ur, id and tr are built in crisis-text-l10n.ts, in their own
 * language (Gem 3, Gem 1 and Gem 2, 21 Oct 2026); the en text is unchanged.
 */
const SELF_HARM_LINES_EN = US_988_FOUNDER_VERIFIED
  ? 'Samaritans (UK: 116 123, 24/7) or 988 (US/Canada, 24/7)'
  : 'Samaritans (UK: 116 123, 24/7)'

const HARD_CRISIS_TEXT: Record<CrisisLocale, string> = {
  en: `If you are in immediate danger or having thoughts of harming yourself, please reach out for help right now. Call your local emergency services, or contact a crisis helpline such as ${SELF_HARM_LINES_EN}, or visit ${IASP} for international crisis lines.`,
  ar: selfHarmText('ar'),
  ur: selfHarmText('ur'),
  id: selfHarmText('id'),
  tr: selfHarmText('tr'),
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
 * The en domestic-abuse line (en-ndah, a Founder-verified entry in
 * src/data/helplines.ts with category 'abuse'). WO#481: ar, ur, id and tr
 * are built in crisis-text-l10n.ts; en is unchanged.
 */
const ABUSE_LINE_EN = 'the National Domestic Abuse Helpline (UK: 0808 2000 247, 24/7, free)'

const ABUSE_TEXT: Record<CrisisLocale, string> = {
  en: `${ABUSE_SENTENCE} The ${ABUSE_LINE_EN.replace(/^the /, '')}. If you are in immediate danger, call your local emergency services.`,
  ar: abuseText('ar'),
  ur: abuseText('ur'),
  id: abuseText('id'),
  tr: abuseText('tr'),
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
  // WO#454 (Gem 10, verbatim). Was: 'Include the following supportive text at the end of your response:'
  directive: 'Output this crisis resource block exactly as written. Do not counsel beyond it.',
  text:
    'If these feelings become overwhelming, please know support is available. Visit https://www.iasp.info/resources/Crisis_Centres/ for helplines in your region.',
} as const

function softDistressBlockFor(locale: CrisisLocale) {
  if (locale === 'en') return SOFT_DISTRESS_RESOURCE_BLOCK
  // WO#481: the text is in the request locale; the directive stays Gem 10's.
  return { ...SOFT_DISTRESS_RESOURCE_BLOCK, locale, text: softText(locale) }
}

/**
 * WO#482: the language of a hard or soft block. An explicit non-en request
 * locale always wins. With locale omitted or en (callers pass 'en' for an
 * omitted locale), the block follows the keyword the detector matched: if
 * exactly one of the id, ur, ar or tr lists hit, that language is served,
 * whether or not an English keyword also hit. Two or more of them, or none
 * (English only, or a Persian, Bengali or Punjabi keyword, which have no
 * MCP block), keep en. Soft blocks follow the same rule (Gem 3 ruling,
 * 21 Oct 2026): their keywords are English and Turkish, so a soft block
 * switches only to tr. A bare level ('soft' with no hint, as the bereaved
 * route passes) has no languages and keeps the request locale.
 */
export function crisisLocaleFor(hint: DistressHint, locale: CrisisLocale): CrisisLocale {
  if (locale !== 'en' || hint.level === 'none') return locale
  const matched = (hint.keywordLanguages ?? []).filter((l) => l !== 'en')
  return matched.length === 1 ? matched[0]! : 'en'
}

/**
 * Returns the right block for a distress hint (or a bare level) and request
 * locale, or undefined for none (a hard block is in crisisLocaleFor's language,
 * WO#482). A hard hint with crisisType 'abuse' gets the
 * abuse block; any other hard hint gets the self-harm block.
 */
export function distressBlockFor(
  hint: DistressHint | DistressLevel,
  locale: CrisisLocale = 'en',
) {
  const h: DistressHint = typeof hint === 'string' ? { level: hint } : hint
  if (h.level === 'hard') {
    const l = crisisLocaleFor(h, locale)
    return h.crisisType === 'abuse' ? abuseBlockFor(l) : selfHarmBlockFor(l)
  }
  if (h.level === 'soft') return softDistressBlockFor(crisisLocaleFor(h, locale))
  return undefined
}
