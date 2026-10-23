/**
 * WO#490: MCP 2.4.1, the Bengali and Persian crisis text (23 Oct 2026;
 * docs/wo490-architect.md).
 *
 *   1. the six strings equal the archived file, and each matches the WO's
 *      sha256 (read from the WO's own text);
 *   2. each block's text is the file string; fa with its isolates, built
 *      here independently and compared;
 *   3. fa has no U+064A or U+0643, carries ZWNJ, and has Gem 2's one fix;
 *   4. the numbers and hours match the Founder-verified lines;
 *   5. no English-fallback note; the anti-translation line stays;
 *   6. the WO#488 routing is unchanged;
 *   7. #565 (Gem 10): every response whose crisis_resource is not en carries
 *      _sakina_meta.disclaimer_locale "en"; en responses carry no such key;
 *      the disclaimer text and the CRITICAL_RULES are unchanged;
 *   8. #565 follow-up 2 (Gem 10): the disclaimer lock line, verbatim, right
 *      after the anti-translation line on exactly those responses.
 *
 * Run: npm run bundle-data && npm run test:wo490
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { LRI, PDI, RLI, isolatesBalanced, hasBidiMarks } from '../src/safety/bidi.js'
import { BN_FA_CRISIS_TEXT, BN_FA_CRISIS_TEXT_SHA256 } from '../src/safety/crisis-bn-fa-strings.js'
import { BN_FA_LINES_FOUNDER_VERIFIED, bnFaText, unisolatedLatin, verifyBnFaLines } from '../src/safety/crisis-text-bn-fa.js'
import { EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from '../src/safety/crisis-en-fallback-strings.js'
import { crisisLocaleFor, distressBlockFor, evaluateDistress, SOFT_DISTRESS_KEYWORDS_BN, SOFT_DISTRESS_KEYWORDS_FA, SOFT_DISTRESS_RESOURCE_BLOCK } from '../src/safety/crisis-keywords.js'
const SOFT_DISTRESS_KEYWORDS_BN_FIRST = () => SOFT_DISTRESS_KEYWORDS_BN[0]!
const SOFT_DISTRESS_KEYWORDS_FA_FIRST = () => SOFT_DISTRESS_KEYWORDS_FA[0]!
import { ABUSE_KEYWORDS_BN, ABUSE_KEYWORDS_FA, SELF_HARM_KEYWORDS_AR, SELF_HARM_KEYWORDS_BN, SELF_HARM_KEYWORDS_FA } from '../src/safety/_synced/crisis-detection.js'
import { CRISIS_ANTI_TRANSLATION, DISCLAIMER_LOCALE_EN, DISCLAIMER_TRANSLATION_LOCK } from '../src/meta/response-builder.js'
import { CRISIS_ONLY_DISCLAIMER, NOT_FOUND_DISCLAIMER, SAKINA_DISCLAIMER } from '../src/contracts/disclaimers.js'
import { NO_EMOJI_RULE, PBUH_RULE } from '../src/contracts/presentation.js'
import { ENGLISH_FALLBACK_GUARD } from '../src/contracts/english-fallback.js'
// @ts-expect-error a plain .mjs module, no types
import { REQUIRED_LINES, requiredLineProblems } from './crisis-line-guard.mjs'

let failures = 0
let checks = 0
const check = (ok: boolean, m: string, d?: unknown) => {
  checks++
  if (ok) console.log(`  PASS ${m}`)
  else {
    failures++
    console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d).slice(0, 600)}`}`)
  }
}
const root = (p: string) => new URL(`../../${p}`, import.meta.url)
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

type Key = keyof typeof BN_FA_CRISIS_TEXT
const KEYS = ['bn self-harm', 'bn abuse', 'bn soft', 'fa self-harm', 'fa abuse', 'fa soft'] as const satisfies readonly Key[]
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/'
const ltr = (s: string) => `${LRI}${s}${PDI}`

/** The post-isolate sha256 of the three fa texts (reported; pinned here). */
const FA_ISOLATED_SHA256 = {
  'fa self-harm': '2851d385feda79b471327fb80fa7205efe888d92bbe150543e9abe86e41341f0',
  'fa abuse': '0f034e92d07909d37ca0443054b05d428aa355aa8785c7d613bdaa68631e6d0a',
  'fa soft': 'ba8c70a1c2fdb9fd65b24ff4cac813b37d516de4dc807bd0417181a538254d2c',
}

/**
 * The fa isolates, built here by plain string operations, independently of
 * crisis-text-bn-fa.ts: each helpline number and "24/7" in LRI ... PDI; a
 * Persian hours phrase in RLI ... PDI with each Latin-digit time in
 * LRI ... PDI; the URL and "(dhulm)" in LRI ... PDI.
 */
function expectedFa(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      const at = line.lastIndexOf('): ')
      if (at < 0 || !line.endsWith(')')) return line
      const rest = line.slice(at + 3)
      const sp = rest.indexOf(' (')
      const number = rest.slice(0, sp)
      if (!/^[0-9]+$/.test(number)) return line
      const hours = rest.slice(sp + 2, -1)
      const isoHours = hours === '24/7' ? ltr(hours) : `${RLI}${hours.split(' ').map((w) => (/^[0-9]/.test(w) ? ltr(w) : w)).join(' ')}${PDI}`
      return `${line.slice(0, at)}): ${ltr(number)} (${isoHours})`
    })
    .join('\n')
    .split(IASP)
    .join(ltr(IASP))
    .split('(dhulm)')
    .join(ltr('(dhulm)'))
}

async function main() {
  console.log('=== 1. the strings, by script, with the WO\'s sha256 ===')
  const file = JSON.parse(readFileSync(root('docs/wo490-bn-fa-crisis-text.json'), 'utf-8')) as Record<Key, string>
  const wo = readFileSync(root('docs/wo490-architect.md'), 'utf-8')
  for (const k of KEYS) {
    const woSha = new RegExp(`>\\s+${k.replace(' ', '\\s+')}\\s+([0-9a-f]{64})`).exec(wo)?.[1]
    check(BN_FA_CRISIS_TEXT[k] === file[k] && sha(file[k]) === woSha && BN_FA_CRISIS_TEXT_SHA256[k] === woSha, `${k}: the generated string equals the archived file, and its sha256 is the WO's (${woSha?.slice(0, 12)}...)`)
  }

  console.log('\n=== 2. the served texts ===')
  for (const k of KEYS) {
    const [l, kind] = k.split(' ') as ['bn' | 'fa', 'self-harm' | 'abuse' | 'soft']
    const served = bnFaText(l, kind)
    const block = (kind === 'soft' ? distressBlockFor({ level: 'soft', keywordLanguages: [l] }, 'en') : distressBlockFor({ level: 'hard', crisisType: kind, keywordLanguages: [l] }, 'en')) as { text: string; locale: string; translation_note?: string; directive: string }
    if (l === 'bn') {
      check(served === file[k] && block.text === file[k] && !hasBidiMarks(served), `${k}: the block text is the file string, unchanged; no bidi marks (bn is left to right)`)
    } else {
      const want = expectedFa(file[k])
      check(served === want && block.text === want, `${k}: the block text is the file string with the isolates (built independently here)`, served === want ? undefined : { served, want })
      check(isolatesBalanced(served) && unisolatedLatin(served).length === 0 && served.replace(/[⁦-⁩]/gu, '') === file[k], `${k}: isolates balanced, no Latin left outside one, and removing them gives the file string back`)
      check(sha(served) === FA_ISOLATED_SHA256[k as keyof typeof FA_ISOLATED_SHA256], `${k}: post-isolate sha256 ${FA_ISOLATED_SHA256[k as keyof typeof FA_ISOLATED_SHA256].slice(0, 12)}...`, sha(served))
    }
    check(block.locale === l && block.translation_note === undefined, `${k}: locale ${l}, no translation_note`)
    if (kind === 'soft') check(block.directive === SOFT_DISTRESS_RESOURCE_BLOCK.directive, `${k}: the soft directive is Gem 10's, unchanged`)
  }

  console.log('\n=== 3. Persian letters, ZWNJ, and Gem 2\'s fix ===')
  for (const k of ['fa self-harm', 'fa abuse', 'fa soft'] as const) {
    const t = file[k]
    check(!/[يك]/u.test(t) && /[ی]/u.test(t) && /[ک]/u.test(t), `${k}: no U+064A or U+0643; Persian yeh U+06CC and keheh U+06A9 present`)
    check(t.includes('‌'), `${k}: ZWNJ (U+200C) present`)
  }
  const lutfa = 'لطفا'
  check(['fa self-harm', 'fa soft'].every((k) => file[k as Key].includes(`${lutfa}ً`)) && !KEYS.some((k) => file[k].split(lutfa).slice(1).some((after) => !after.startsWith('ً'))), 'Gem 2\'s fix: "lutfan" carries U+064B after U+0627, everywhere it appears')
  check(KEYS.filter((k) => k.startsWith('bn')).every((k) => file[k].includes('।')), 'bn: the danda U+0964 is the full stop (Gem 2 confirmed)')
  check(KEYS.every((k) => !file[k].includes('—')), 'no em dash in any string')

  console.log('\n=== 4. numbers and hours: the Founder-verified lines ===')
  for (const [key, expected] of Object.entries(REQUIRED_LINES) as Array<[string, string[]]>) {
    const [l, kind] = key.split('/') as ['bn' | 'fa', 'self-harm' | 'abuse']
    const text = bnFaText(l, kind)
    const ids = EN_FALLBACK_IDS[l][kind]
    const verified = ids.map((id) => (BN_FA_LINES_FOUNDER_VERIFIED.lines as Record<string, string>)[id])
    check(requiredLineProblems(text, expected).length === 0 && JSON.stringify(verified) === JSON.stringify(expected), `${key}: the numbers in the text are exactly the Founder-verified ${verified.join(', ')} (guard h passes)`)
  }
  check(['bn soft', 'fa soft'].every((k) => !/[0-9]{3}/.test(file[k as Key].replace(IASP, ''))), 'the soft texts carry no helpline number')
  const hoursOf = (s: string) => s.match(/[0-9]+(?::[0-9]+|\/[0-9]+)?/g) ?? []
  const kpr = file['bn self-harm'].split('\n').find((x) => x.includes(': 09612119911 ('))!
  const l1480 = file['fa self-harm'].split('\n').find((x) => x.includes(': 1480 ('))!
  check(JSON.stringify(hoursOf(kpr.split(': 09612119911 (')[1]!)) === JSON.stringify(hoursOf(EN_FALLBACK_FIELDS['bn-kaan-pete-roi']!.hours)) && JSON.stringify(hoursOf(l1480.split(': 1480 (')[1]!)) === JSON.stringify(hoursOf(EN_FALLBACK_FIELDS['fa-social-emergency-1480']!.hours)), 'the hours carry the same times as helplines.ts (Kaan Pete Roi 3:00 and 3:00; 1480 8:00 and 24:00)')
  // Controls: a changed number or time in a text throws when the module checks it.
  const throws = (l: 'bn' | 'fa', kind: 'self-harm' | 'abuse', text: string) => { try { verifyBnFaLines(l, kind, text); return '' } catch (e) { return String(e) } }
  check(throws('bn', 'self-harm', file['bn self-harm'].replace('09612119911', '09612119191')).includes('Founder-verified') && throws('fa', 'self-harm', file['fa self-harm'].replace('(8:00', '(9:00')).includes('hours') && throws('fa', 'abuse', file['fa abuse'].split('\n').filter((x) => !x.includes(': 123 (')).join('\n')).includes('helpline lines') && throws('bn', 'abuse', file['bn abuse']) === '', 'controls: a changed number, a changed time and a missing line each throw; the file text passes')

  console.log('\n=== 5. no English fallback; the anti-translation line stays ===')
  globalThis.fetch = (async () => new Response('{"code":404}', { status: 404 })) as typeof fetch
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  type R = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; crisis_resource?: { locale?: string; text?: string; translation_note?: string; level?: string } }
  const NOTE_PREFIX = 'This crisis resource is in English'
  const cases: Array<[string, 'bn' | 'fa', string]> = [
    ['bn self-harm', 'bn', SELF_HARM_KEYWORDS_BN[2]!],
    ['bn abuse', 'bn', ABUSE_KEYWORDS_BN[0]!],
    ['fa self-harm', 'fa', SELF_HARM_KEYWORDS_FA[2]!],
    ['fa abuse', 'fa', ABUSE_KEYWORDS_FA[0]!],
  ]
  for (const [label, l, q] of cases) {
    for (const [tool, call] of [['get_dua', () => getDuaHandler({ context: q } as never)], ['find_verses', () => findVersesHandler({ query: q } as never)]] as const) {
      const r = (await call()) as unknown as R
      const rules = r._sakina_meta.llm_directives.CRITICAL_RULES
      const json = JSON.stringify(r)
      check(r.crisis_resource?.locale === l && r.crisis_resource.translation_note === undefined && rules.includes(CRISIS_ANTI_TRANSLATION) && !rules.includes(ENGLISH_FALLBACK_GUARD) && !json.includes(NOTE_PREFIX), `${tool} ${label}: the ${l} block; CRITICAL_RULES keep the anti-translation line, with no English-fallback note or guard`)
    }
  }

  console.log('\n=== 6. routing unchanged (WO#488) ===')
  check(crisisLocaleFor({ level: 'hard', crisisType: 'self-harm', keywordLanguages: ['en', 'bn'] }, 'en') === 'bn' && crisisLocaleFor({ level: 'hard', crisisType: 'self-harm', keywordLanguages: ['fa', 'ur'] }, 'en') === 'en' && crisisLocaleFor({ level: 'hard', crisisType: 'abuse', keywordLanguages: ['fa'] }, 'ur') === 'ur', 'en plus bn gives bn; fa plus ur gives en; an explicit locale wins')
  for (const [l, list] of [['bn', [...SELF_HARM_KEYWORDS_BN, ...ABUSE_KEYWORDS_BN]], ['fa', [...SELF_HARM_KEYWORDS_FA, ...ABUSE_KEYWORDS_FA]]] as const) {
    const wrong = list.filter((k) => (distressBlockFor(evaluateDistress(k), 'en') as { locale?: string } | undefined)?.locale !== l)
    check(wrong.length === 0, `every ${l} keyword alone (${list.length}) still serves the ${l} block`, wrong)
  }
  const en = distressBlockFor({ level: 'hard', crisisType: 'self-harm' }, 'en') as { text: string; locale: string }
  check(en.locale === 'en' && !hasBidiMarks(en.text) && en.text.startsWith('If you are in immediate danger'), 'the en block is unchanged')

  console.log('\n=== 7. #565: the English disclaimer is flagged on non-en crisis responses ===')
  {
    type M = { _sakina_meta: { content_type: string; disclaimer: string; disclaimer_locale?: string; llm_directives: { CRITICAL_RULES: string[] } } & Record<string, unknown>; crisis_resource?: { locale?: string; level?: string } }
    const call = async (q: string, locale?: string) => (await getDuaHandler({ context: q, ...(locale ? { locale } : {}) } as never)) as unknown as M
    // Gem 10's lock line (follow-up 2), read from the ruling recorded verbatim in docs/wo490-architect.md.
    const LOCK = /placed right after the anti-translation line:\n>\s+"([^"]+)"/.exec(wo)![1]!
    const locked = (r: M) => { const rules = r._sakina_meta.llm_directives.CRITICAL_RULES; const i = rules.indexOf(CRISIS_ANTI_TRANSLATION); return i >= 0 && rules[i + 1] === LOCK && rules.filter((x) => x === LOCK).length === 1 }
    const flagged = (r: M, l: string) => r.crisis_resource?.locale === l && r._sakina_meta.disclaimer_locale === DISCLAIMER_LOCALE_EN && DISCLAIMER_LOCALE_EN === 'en' && locked(r)
    check(DISCLAIMER_TRANSLATION_LOCK === LOCK, 'follow-up 2: the lock line is Gem 10\'s text, verbatim')
    const keyAfterDisclaimer = (r: M) => { const k = Object.keys(r._sakina_meta); return k.indexOf('disclaimer_locale') === k.indexOf('disclaimer') + 1 }
    // The five CRITICAL_RULES lines of a non-en crisis_resource_only response, unchanged by the flag.
    const FIVE = [
      'This response is a crisis resource only. You MUST output the crisis_resource text exactly as written, and nothing in place of it.',
      "Do NOT add du'as, Quranic verses, hadith, or religious advice to your reply.",
      NO_EMOJI_RULE,
      PBUH_RULE,
      CRISIS_ANTI_TRANSLATION,
    ]
    // Keyword-routed (no locale): bn and fa, hard and soft, and the four l10n languages.
    const routed: Array<[string, string, string]> = [
      ['bn', 'self-harm', SELF_HARM_KEYWORDS_BN[2]!], ['bn', 'abuse', ABUSE_KEYWORDS_BN[0]!],
      ['fa', 'self-harm', SELF_HARM_KEYWORDS_FA[2]!], ['fa', 'abuse', ABUSE_KEYWORDS_FA[0]!],
      ['tr', 'self-harm', 'kendimi öldüreceğim'], ['id', 'self-harm', 'ingin bunuh diri'], ['ur', 'abuse', 'mera shohar mujhe marta hai'],
      ['ar', 'self-harm', SELF_HARM_KEYWORDS_AR.find((k) => /[\u0600-\u06FF]/.test(k))!],
    ]
    for (const [l, type, q] of routed) {
      const r = await call(q)
      check(flagged(r, l) && keyAfterDisclaimer(r) && r._sakina_meta.disclaimer === CRISIS_ONLY_DISCLAIMER, `keyword-routed ${l} ${type} (no locale): disclaimer_locale "en" beside the unchanged disclaimer; the lock line right after the anti-translation line`)
      if (l === 'bn' || l === 'fa') check(JSON.stringify(r._sakina_meta.llm_directives.CRITICAL_RULES) === JSON.stringify([...FIVE, LOCK]), `${l} ${type}: the five CRITICAL_RULES lines unchanged, then the lock line`, r._sakina_meta.llm_directives.CRITICAL_RULES)
    }
    for (const [l, phrase] of [['bn', SOFT_DISTRESS_KEYWORDS_BN_FIRST()], ['fa', SOFT_DISTRESS_KEYWORDS_FA_FIRST()]] as const) {
      const r = await call(phrase)
      // A bn or fa soft phrase matches no du'a category, so the response is not_found with the soft block.
      check(r.crisis_resource?.level === 'soft' && flagged(r, l) && r._sakina_meta.disclaimer === (r._sakina_meta.content_type === 'not_found' ? NOT_FOUND_DISCLAIMER : SAKINA_DISCLAIMER), `keyword-routed ${l} soft (${r._sakina_meta.content_type}): disclaimer_locale "en", the disclaimer unchanged`)
    }
    // Request locale: ar, ur, id and tr, hard and soft.
    for (const l of ['ar', 'ur', 'id', 'tr'] as const) {
      const hard = await call('I want to kill myself', l)
      const soft = await call('anxiety', l)
      check(flagged(hard, l) && hard._sakina_meta.content_type === 'crisis_resource_only' && hard._sakina_meta.disclaimer === CRISIS_ONLY_DISCLAIMER, `request locale ${l}, hard: disclaimer_locale "en"`)
      check(flagged(soft, l) && soft.crisis_resource?.level === 'soft', `request locale ${l}, soft: disclaimer_locale "en"`)
      const none = await call('travel', l)
      check(none.crisis_resource === undefined && !('disclaimer_locale' in none._sakina_meta) && !none._sakina_meta.llm_directives.CRITICAL_RULES.includes(LOCK), `request locale ${l}, no crisis block: no flag and no lock line`)
    }
    // en: no key at all.
    for (const [label, r] of [['en hard', await call('I want to kill myself')], ['en hard, locale en', await call('I want to kill myself', 'en')], ['en soft', await call('anxiety')], ['en, no crisis', await call('travel')]] as const) {
      check(!('disclaimer_locale' in r._sakina_meta) && !JSON.stringify(r).includes('disclaimer_locale') && !r._sakina_meta.llm_directives.CRITICAL_RULES.includes(LOCK), `${label}: no disclaimer_locale and no lock line (en responses unchanged)`)
    }
    const { findVersesHandler: fv } = await import('../src/tools/find-verses.js')
    const { getNameOfAllahHandler: gn } = await import('../src/tools/get-name-of-allah.js')
    const viaFind = (await fv({ query: ABUSE_KEYWORDS_FA[0]! } as never)) as unknown as M
    const viaName = (await gn({ name: SELF_HARM_KEYWORDS_BN[2]! } as never)) as unknown as M
    check(flagged(viaFind, 'fa') && flagged(viaName, 'bn'), 'the flag is set the same way on find_verses and get_name_of_allah')
  }

  console.log(`\nWO#490: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
