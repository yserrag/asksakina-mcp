/**
 * WO#482: MCP 2.2.2, the crisis block language follows the detected keyword.
 *
 *   A. the detector's per-language lists (src/lib/utils/crisis-detection.ts,
 *      synced): disjoint, and with the rest of each list they rebuild it;
 *   B. crisisKeywordLanguages: every id, ur, ar and tr keyword, typed alone,
 *      names its own language and no other; every English keyword names en;
 *   C. each of the four languages, self-harm and abuse, through get_dua,
 *      find_verses and get_name_of_allah: no locale and locale en serve that
 *      language's block; the language's own locale serves it too; an explicit
 *      other non-en locale wins;
 *   D. the edges: English alone stays en; English plus one other language
 *      serves the other; two other languages keep en; a Persian keyword alone
 *      keeps en; the soft block follows the request locale;
 *   E. controls: crisisLocaleFor never overrides an explicit locale, and a
 *      hint without keywordLanguages keeps the request locale;
 *   F. the soft matcher's Unicode word split (Architect ruling, 21 Oct): every
 *      soft keyword matches exactly as under the old /\W+/ split, across a
 *      corpus built from every keyword and every eval input; Turkish words with
 *      ı, ğ, ü, ş, ç and ö stay whole; the only differences are pinned;
 *   G. Gem 3's Turkish ruling (21 Oct): "umutsuzum" and "umutsuzluk" are hard;
 *      every Turkish soft keyword and form; the devotional exclusion; Turkish
 *      case-folding; hard wins over soft; the soft block follows tr;
 *   H. Gem 3 round 2: relational fear within three words of "kork" is abuse;
 *      d\u00f6vmesinden and d\u00f6vecek diye; the korku exceptions; ASCII folding of
 *      every Turkish list; "Allah korkusu"; every other language unchanged;
 *   I. Gem 10 conditions (21 Oct): the anti-translation directive on every
 *      non-en crisis response and never on en; the proximity rule on the raw
 *      input; Persian, Bengali and Punjabi keywords alone serve the en block.
 *
 * Inputs in Arabic script are taken from the keyword lists themselves, never
 * typed here.
 *
 * Run: npm run bundle-data && npm run test:wo482
 */

import {
  ABUSE_KEYWORDS,
  ABUSE_KEYWORDS_AR,
  ABUSE_KEYWORDS_EN,
  ABUSE_KEYWORDS_ID,
  ABUSE_KEYWORDS_TR,
  ABUSE_KEYWORDS_FA,
  ABUSE_KEYWORDS_BN,
  ABUSE_KEYWORDS_UR,
  crisisKeywordLanguages,
  detectCrisis,
  BARE_NOUN_GUARDS,
  TR_FEAR_RELATIONS,
  SELF_HARM_KEYWORDS,
  SELF_HARM_KEYWORDS_AR,
  SELF_HARM_KEYWORDS_EN,
  SELF_HARM_KEYWORDS_ID,
  SELF_HARM_KEYWORDS_TR,
  SELF_HARM_KEYWORDS_FA,
  SELF_HARM_KEYWORDS_BN,
  SELF_HARM_KEYWORDS_UR,
  type CrisisKeywordLanguage,
} from '../src/safety/_synced/crisis-detection.js'
import { readFileSync } from 'node:fs'
import { crisisLocaleFor, distressBlockFor, evaluateDistress, SOFT_DISTRESS_KEYWORDS, SOFT_DISTRESS_KEYWORDS_TR, SOFT_PHRASE_EXCLUSIONS, SOFT_WORD_BOUNDARY, turkishFold, type CrisisLocale } from '../src/safety/crisis-keywords.js'
import { abuseText, selfHarmText, softText } from '../src/safety/crisis-text-l10n.js'
import { foldLatin } from '../src/safety/_synced/latin-fold.js'
import { CRISIS_ANTI_TRANSLATION } from '../src/meta/response-builder.js'

let failures = 0
let checks = 0
const check = (ok: boolean, m: string, d?: unknown) => {
  checks++
  if (ok) console.log(`  PASS ${m}`)
  else {
    failures++
    console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d)}`}`)
  }
}

// The WO#482 languages; bn and fa (keyword languages since WO#488) are tested in test-wo488.
type Lang = Exclude<CrisisLocale, 'en'>
const LANGS: readonly Lang[] = ['tr', 'ur', 'id', 'ar']
const LISTS: Record<'self-harm' | 'abuse', Record<Exclude<CrisisKeywordLanguage, 'fa' | 'bn'>, readonly string[]>> = {
  'self-harm': { en: SELF_HARM_KEYWORDS_EN, id: SELF_HARM_KEYWORDS_ID, ur: SELF_HARM_KEYWORDS_UR, ar: SELF_HARM_KEYWORDS_AR, tr: SELF_HARM_KEYWORDS_TR },
  abuse: { en: ABUSE_KEYWORDS_EN, id: ABUSE_KEYWORDS_ID, ur: ABUSE_KEYWORDS_UR, ar: ABUSE_KEYWORDS_AR, tr: ABUSE_KEYWORDS_TR },
}
const FULL = { 'self-harm': SELF_HARM_KEYWORDS, abuse: ABUSE_KEYWORDS }
const PERSIAN_BENGALI = { 'self-harm': [...SELF_HARM_KEYWORDS_FA, ...SELF_HARM_KEYWORDS_BN], abuse: [...ABUSE_KEYWORDS_FA, ...ABUSE_KEYWORDS_BN] }
// The expected text: the l10n builder for id/ur/ar/tr, the 2.2.1 block for en
// (a synthetic hint has no keyword languages, so it keeps the locale it is given).
const textFor = (type: 'self-harm' | 'abuse', l: CrisisLocale) =>
  l === 'en' ? distressBlockFor({ level: 'hard', crisisType: type }, 'en')!.text : type === 'abuse' ? abuseText(l) : selfHarmText(l)

// One Roman and one Urdu-script phrase for ur; the rest are the WO's and the evals' phrases.
const ARABIC_SCRIPT = /[؀-ۿ]/
const firstScript = (list: readonly string[], arabic: boolean) => list.find((k) => ARABIC_SCRIPT.test(k) === arabic)!
const PHRASES: Array<[Lang, 'self-harm' | 'abuse', string, string]> = [
  ['tr', 'self-harm', 'kendimi öldüreceğim', 'the WO#482 live case'],
  ['tr', 'abuse', 'kocam beni dövüyor', 'Turkish'],
  ['id', 'self-harm', 'ingin bunuh diri', 'Indonesian'],
  ['id', 'abuse', 'suami memukul', 'Indonesian'],
  ['ur', 'self-harm', 'mujhe khudkushi karni hai', 'Roman Urdu'],
  ['ur', 'abuse', 'mera shohar mujhe marta hai', 'Roman Urdu'],
  ['ur', 'self-harm', firstScript(SELF_HARM_KEYWORDS_UR, true), 'Urdu script (from the list)'],
  ['ur', 'abuse', firstScript(ABUSE_KEYWORDS_UR, true), 'Urdu script (from the list)'],
  ['ar', 'self-harm', SELF_HARM_KEYWORDS_AR.find((k) => ARABIC_SCRIPT.test(k))!, 'Arabic (from the list)'],
  ['ar', 'abuse', ABUSE_KEYWORDS_AR.find((k) => ARABIC_SCRIPT.test(k))!, 'Arabic (from the list)'],
]

async function main() {
console.log('=== A. the per-language lists ===')
for (const type of ['self-harm', 'abuse'] as const) {
  const parts = Object.values(LISTS[type]).flat()
  check(new Set(parts).size === parts.length, `${type}: the en, id, ur, ar and tr lists share no entry`)
  check(parts.every((k) => FULL[type].includes(k)), `${type}: every per-language entry is in the full list`)
  const rest = FULL[type].filter((k) => !parts.includes(k))
  // WO#488: Persian and Bengali have their own lists now (test-wo488), so the rest is those and Punjabi.
  check(rest.every((k) => ARABIC_SCRIPT.test(k) || /[ঀ-৿]/.test(k) || PERSIAN_BENGALI[type].includes(k)), `${type}: the ${rest.length} entries left in the full list are Persian, Bengali (with their Latin forms) or Punjabi`)
  check(rest.length + parts.length === FULL[type].length, `${type}: the lists and the rest rebuild the full list (${FULL[type].length})`)
  check(LISTS[type].ur.some((k) => ARABIC_SCRIPT.test(k)) && LISTS[type].ur.some((k) => !ARABIC_SCRIPT.test(k)), `${type}: the ur list holds Roman and Urdu-script entries`)
}

console.log('\n=== B. crisisKeywordLanguages, each keyword alone ===')
for (const type of ['self-harm', 'abuse'] as const) {
  for (const l of LANGS) {
    const wrong = LISTS[type][l].filter((k) => {
      const h = evaluateDistress(k)
      return h.level !== 'hard' || h.crisisType !== type || JSON.stringify(crisisKeywordLanguages(k, type)) !== JSON.stringify([l]) || distressBlockFor(h, 'en')?.locale !== l
    })
    check(wrong.length === 0, `${type} ${l}: all ${LISTS[type][l].length} keywords, alone with no locale, name ${l} only and serve the ${l} block`, wrong)
  }
  const enWrong = LISTS[type].en.filter((k) => JSON.stringify(crisisKeywordLanguages(k, type)) !== '["en"]' || distressBlockFor(evaluateDistress(k), 'en')?.locale !== 'en')
  check(enWrong.length === 0, `${type} en: all ${LISTS[type].en.length} English keywords name en only and keep the en block`, enWrong)
}

console.log('\n=== C. the tools, with and without locale ===')
{
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
    if (!m) return new Response('{"code":404}', { status: 404 })
    return new Response(JSON.stringify({ code: 200, data: [{ number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) }, { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  type R = { _sakina_meta: { content_type: string }; crisis_resource?: { locale?: string; crisis_type?: string; text?: string; level?: string } }
  const call = async (tool: string, q: string, locale?: CrisisLocale): Promise<R> => {
    const l = locale === undefined ? {} : { locale }
    if (tool === 'get_dua') return (await getDuaHandler({ context: q, ...l })) as unknown as R
    if (tool === 'find_verses') return (await findVersesHandler({ query: q, ...l })) as unknown as R
    return (await getNameOfAllahHandler({ name: q, ...l })) as unknown as R
  }
  const served = (r: R, type: string, l: CrisisLocale) =>
    r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.locale === l && r.crisis_resource.crisis_type === type && r.crisis_resource.text === textFor(type as 'self-harm' | 'abuse', l)
  for (const [lang, type, q, label] of PHRASES) {
    const other: CrisisLocale = lang === 'id' ? 'ur' : 'id'
    for (const tool of ['get_dua', 'find_verses', 'get_name_of_allah']) {
      const none = await call(tool, q)
      const en = await call(tool, q, 'en')
      const own = await call(tool, q, lang)
      const explicit = await call(tool, q, other)
      check(served(none, type, lang), `${tool} ${lang} ${type} (${label}), no locale: the ${lang} block`, none.crisis_resource?.locale)
      check(served(en, type, lang), `${tool} ${lang} ${type} (${label}), locale en: the ${lang} block`, en.crisis_resource?.locale)
      check(served(own, type, lang), `${tool} ${lang} ${type} (${label}), locale ${lang}: the ${lang} block`, own.crisis_resource?.locale)
      check(served(explicit, type, other), `${tool} ${lang} ${type} (${label}), locale ${other}: the explicit locale wins (${other} block)`, explicit.crisis_resource?.locale)
    }
  }

  console.log('\n=== D. the edges ===')
  const en1 = await call('get_dua', 'I want to kill myself')
  check(served(en1, 'self-harm', 'en'), 'English alone, no locale: the en self-harm block, unchanged')
  const en2 = await call('get_dua', 'my husband hits me')
  check(served(en2, 'abuse', 'en'), 'English abuse alone, no locale: the en abuse block, unchanged')
  const mixed = await call('get_dua', 'I want to die, kendimi öldüreceğim')
  check(evaluateDistress('I want to die, kendimi öldüreceğim').keywordLanguages?.join() === 'en,tr' && served(mixed, 'self-harm', 'tr'), 'English plus Turkish, no locale: the tr block (the one other language wins)')
  const two = 'kendimi öldüreceğim, ingin bunuh diri'
  check(evaluateDistress(two).keywordLanguages?.join() === 'id,tr' && served(await call('get_dua', two), 'self-harm', 'en'), 'Turkish plus Indonesian, no locale: en (two languages, not settled)')
  check(served(await call('get_dua', two, 'tr'), 'self-harm', 'tr'), 'Turkish plus Indonesian, locale tr: the explicit locale wins')
  // WO#488: Persian and Bengali are keyword languages now (test-wo488); Punjabi still has no block.
  const pa = SELF_HARM_KEYWORDS.find((k) => !Object.values(LISTS['self-harm']).flat().includes(k) && !PERSIAN_BENGALI['self-harm'].includes(k) && evaluateDistress(k).level === 'hard')!
  const paHint = evaluateDistress(pa)
  check(paHint.level === 'hard' && (paHint.keywordLanguages ?? []).length === 0 && served(await call('get_dua', pa), 'self-harm', 'en'), 'a Punjabi keyword alone (from the list), no locale: en (no pa block)')
  const soft = await call('get_dua', 'anxiety')
  check(soft.crisis_resource?.level === 'soft' && soft.crisis_resource.locale === 'en' && soft.crisis_resource.text === distressBlockFor('soft', 'en')!.text, 'soft, no locale: the en soft block (soft follows the request locale)')
  const softTr = await call('get_dua', 'anxiety', 'tr')
  check(softTr.crisis_resource?.level === 'soft' && softTr.crisis_resource.text === softText('tr'), 'soft, locale tr: the tr soft block')
  const safe = await call('get_dua', 'travel')
  check(safe.crisis_resource === undefined, 'no distress, no locale: no block')
}

console.log('\n=== E. controls ===')
for (const l of LANGS) {
  check(crisisLocaleFor({ level: 'hard', crisisType: 'self-harm', keywordLanguages: ['tr'] }, l) === l, `an explicit ${l} locale is never overridden, even by a tr keyword`)
}
check(crisisLocaleFor({ level: 'hard', crisisType: 'abuse', keywordLanguages: ['tr'] }, 'en') === 'tr', 'control: the same hint with locale en does switch (so the check above can fail)')
check(crisisLocaleFor({ level: 'hard', crisisType: 'abuse' }, 'en') === 'en', 'a hint without keywordLanguages keeps en')
check(crisisLocaleFor({ level: 'soft', keywordLanguages: ['tr'] }, 'en') === 'tr' && crisisLocaleFor({ level: 'soft', keywordLanguages: ['tr'] }, 'id') === 'id', 'a soft hint follows the same rule (Gem 3): tr with no locale, an explicit locale wins')
check(distressBlockFor('soft', 'en')?.locale === 'en', 'a bare soft level (the bereaved route) keeps the request locale')
check(distressBlockFor({ level: 'hard', crisisType: 'self-harm' }, 'en')?.locale === 'en', 'a synthetic hard hint (as the publish guards build) keeps its locale')

console.log('\n=== F. the soft matcher\'s word split ===')
{
  // The 2.2.1 matcher, verbatim apart from its split, to compare against.
  const oldSoft = (input: string): string | undefined => {
    const lower = input.toLowerCase()
    const excluded = new Set(SOFT_PHRASE_EXCLUSIONS.filter((e) => lower.includes(e.phrase)).flatMap((e) => e.keywords))
    for (const keyword of SOFT_DISTRESS_KEYWORDS) {
      if (excluded.has(keyword)) continue
      if (keyword.includes(' ')) {
        if (lower.includes(keyword)) return keyword
        continue
      }
      if (lower.split(/\W+/).includes(keyword)) return keyword
    }
    return undefined
  }
  const newSoft = (input: string) => {
    const h = evaluateDistress(input)
    return h.level === 'soft' ? h.matchedKeyword : h.level === 'hard' ? 'HARD' : undefined
  }
  const evalInputs = (JSON.parse(readFileSync(new URL('../evals/agent-queries.json', import.meta.url), 'utf-8')) as { cases: Array<{ args: Record<string, unknown> }> }).cases
    .flatMap((c) => [c.args.context, c.args.query, c.args.name].filter((x): x is string => typeof x === 'string'))
  const templates = ['{k}', '{K}', 'I feel {k}', 'du\'a for {k} at work', '{k}.', '({k})', '{k}, please', '"{k}"', 'my {k}-filled week', 'de{k}ing', '{k}s', 'un{k}', '{k}123', '{k}\'s weight']
  const corpus = [
    ...SOFT_DISTRESS_KEYWORDS.flatMap((k) => templates.map((t) => t.replace('{k}', k).replace('{K}', k.toUpperCase()))),
    ...evalInputs,
    'loss of faith', 'fear of Allah', 'the stress test passed', 'travel', 'patience', 'gratitude',
  ]
  const oldHits = corpus.map(oldSoft)
  const diff = corpus.filter((x, i) => newSoft(x) !== 'HARD' && newSoft(x) !== oldHits[i])
  check(diff.length === 0, `every soft keyword matches exactly as before: ${corpus.length} inputs (${SOFT_DISTRESS_KEYWORDS.length} keywords x ${templates.length} forms, ${evalInputs.length} eval inputs, controls), ${oldHits.filter(Boolean).length} hits, 0 differences`, diff)
  check(SOFT_DISTRESS_KEYWORDS.every((k) => newSoft(`I feel ${k} today`) === k || (k.includes(' ') && newSoft(`I feel ${k} today`) !== undefined)), `each of the ${SOFT_DISTRESS_KEYWORDS.length} soft keywords still matches in a sentence`)
  check(SOFT_DISTRESS_KEYWORDS.every((k) => /^[a-z ]+$/.test(k)), 'the soft list is English only (there are no id, ur or ar soft keywords to carry over)')
  const tr = ['kayg\u0131', 'a\u011flamak', '\u00fczg\u00fcn\u00fcm', 'endi\u015fe', 'ka\u00e7\u0131yorum', 'k\u00f6t\u00fc', 'yaln\u0131z\u0131m']
  for (const w of tr) check(`bug\u00fcn ${w}.`.split(SOFT_WORD_BOUNDARY).includes(w), `Turkish "${w}" tokenises whole`)
  check(!'kayg\u0131'.split(/\W+/).includes('kayg\u0131'), 'control: the old /\\W+/ split breaks "kayg\u0131" (so the check above can fail)')
  check(['\u0627\u0644\u0642\u0644\u0642', 'cemas', 'pareshan'].every((w) => `x ${w} y`.split(SOFT_WORD_BOUNDARY).includes(w)), 'Arabic-script and other Latin words also tokenise whole')
  // The only behaviour changes: a keyword glued to a non-ASCII letter, or joined by "_".
  check(newSoft('stress\u00e9') === undefined && oldSoft('stress\u00e9') === 'stress', 'pinned change: a keyword glued to a non-ASCII letter ("stress\u00e9") no longer matches as a separate word')
  check(newSoft('stress_test') === 'stress' && oldSoft('stress_test') === undefined, 'pinned change: "_" now separates words ("stress_test" matches stress)')
}

console.log('\n=== G. Gem 3\'s Turkish ruling ===')
{
  const soft = (q: string) => evaluateDistress(q)
  // 1. Hard
  check(SELF_HARM_KEYWORDS_TR.includes('umutsuzum') && SELF_HARM_KEYWORDS_TR.includes('umutsuzluk') && SELF_HARM_KEYWORDS.length === 279 + 6, 'umutsuzum and umutsuzluk are in SELF_HARM_KEYWORDS_TR (full list 279, plus the 6 WO#488 fa and bn entries)')
  for (const q of ['umutsuzum', 'umutsuzluk', 'Umutsuzum', '\u00e7ok umutsuzum art\u0131k', 'umutsuzluk i\u00e7indeyim']) {
    const h = soft(q)
    check(h.level === 'hard' && h.crisisType === 'self-harm' && distressBlockFor(h, 'en')?.locale === 'tr', `"${q}": hard self-harm, the tr block with no locale`)
  }
  // 2. Soft, prefix at a word start, with Turkish endings
  check(JSON.stringify(SOFT_DISTRESS_KEYWORDS_TR.prefix) === JSON.stringify(['kayg\u0131', 'endi\u015fe', 'bunal', 'korku', 'yas tut', '\u00e7aresiz']), 'the prefix list is exactly Gem 3\'s six')
  check(JSON.stringify(SOFT_DISTRESS_KEYWORDS_TR.whole) === JSON.stringify(['yaln\u0131z\u0131m', 'stresliyim', 'kederliyim', 'daral\u0064\u0131m', 'panik atak', 'i\u00e7im ac\u0131yor', 'can\u0131m yan\u0131yor', 'derdim var']), 'the whole-word list is exactly Gem 3\'s eight')
  const PREFIX_FORMS: Array<[string, string[]]> = [
    ['kayg\u0131', ['kayg\u0131', 'kayg\u0131l\u0131y\u0131m', 'kayg\u0131 duyuyorum', '\u00e7ok kayg\u0131l\u0131y\u0131m']],
    ['endi\u015fe', ['endi\u015fe', 'endi\u015feliyim', 'endi\u015feleniyorum']],
    ['bunal', ['bunald\u0131m', 'bunal\u0131yorum', 'bunal\u0131m']],
    ['korku', ['korku', 'korkuyorum', 'korkular\u0131m var']],
    ['yas tut', ['yas tutuyorum', 'yas tutmak']],
    ['\u00e7aresiz', ['\u00e7aresiz', '\u00e7aresizim', '\u00e7aresizlik']],
  ]
  for (const [k, forms] of PREFIX_FORMS) {
    const bad = forms.filter((f) => { const h = soft(f); return h.level !== 'soft' || h.matchedKeyword !== k || distressBlockFor(h, 'en')?.locale !== 'tr' })
    check(bad.length === 0, `prefix "${k}": ${forms.join(', ')} each soft, the tr soft block with no locale`, bad)
  }
  const notStart = ['tekayg\u0131', 'xendi\u015fe', 'abunal', 'akorku', 'beyas tut', 'x\u00e7aresiz']
  check(notStart.every((f) => soft(f).level === 'none'), `prefix keywords match only at a word start (${notStart.join(', ')} do not)`)
  // 2. Soft, whole word
  for (const k of SOFT_DISTRESS_KEYWORDS_TR.whole) {
    const h = soft(`bug\u00fcn ${k}.`)
    check(h.level === 'soft' && h.matchedKeyword === k && distressBlockFor(h, 'en')?.locale === 'tr', `whole "${k}": soft in a sentence, the tr soft block`)
  }
  check(['yaln\u0131z\u0131md\u0131r', 'stresliyimdir', 'derdim vardi', 'panik ataklar'].every((f) => soft(f).level === 'none'), 'whole-word keywords do not match with a suffix (yaln\u0131z\u0131md\u0131r, stresliyimdir, derdim vardi, panik ataklar)')
  check(soft('\u00e7ok \u00fczg\u00fcn\u00fcm').level === 'none', '"\u00e7ok \u00fczg\u00fcn\u00fcm" is not a keyword (Gem 3: an apology false positive)')
  // Exclusion
  for (const q of ["Allah'tan korkuyorum", 'Allah\u2019tan korkuyorum', 'Allahtan korkar\u0131m', "ALLAH'TAN KORKUYORUM", "Allah'dan korkmak"]) check(soft(q).level === 'none', `devotional "${q}": korku does not fire`)
  const both = soft("Allah'tan korkuyorum ama kayg\u0131l\u0131y\u0131m")
  check(both.level === 'soft' && both.matchedKeyword === 'kayg\u0131', 'the exclusion skips korku only: another keyword in the same input still counts')
  check(soft("Allah'tan korkuyorum, s\u0131navdan da korkuyorum").matchedKeyword === 'korku', 'korku outside the devotional phrase still fires in the same input')
  check(soft("Allah'tan korkuyorum, babamdan da korkuyorum").level === 'hard', 'round 2: a relation word before korku in the same input is abuse (proximity)')
  // Case-folding
  check(turkishFold('KAYGI') === 'kayg\u0131' && turkishFold('\u0130\u00c7\u0130M') === 'i\u00e7im' && turkishFold('I\u0307'.normalize('NFD')) === 'i', 'Turkish folding: I to \u0131, \u0130 to i, a decomposed \u0130 composes first')
  for (const q of ['Kayg\u0131', 'KAYGI', 'KAYGILIYIM', '\u0130\u00e7im ac\u0131yor', '\u0130\u00c7\u0130M ACIYOR', 'YALNIZIM', '\u00c7ARES\u0130Z\u0130M']) {
    check(soft(q).level === 'soft', `case-folding: "${q}" is soft`)
  }
  check(soft('I feel ANXIOUS').matchedKeyword === 'anxious', 'English keeps plain lower-casing: "ANXIOUS" still matches (I is not folded to \u0131 for English)')
  // Hard wins over soft
  for (const q of ['umutsuzum ve kayg\u0131l\u0131y\u0131m', 'kendimi \u00f6ld\u00fcrece\u011fim, \u00e7ok yaln\u0131z\u0131m', 'kocam beni d\u00f6v\u00fcyor, korkuyorum']) {
    const h = soft(q)
    check(h.level === 'hard', `hard wins over soft: "${q}" is ${h.level} ${h.crisisType}`)
  }
  // The soft block follows the detected language
  check(distressBlockFor(soft('I feel anxious and kayg\u0131l\u0131y\u0131m'), 'en')?.locale === 'tr', 'English plus Turkish soft, no locale: the tr soft block (the hard rule)')
  check(distressBlockFor(soft('kayg\u0131l\u0131y\u0131m'), 'id')?.locale === 'id', 'Turkish soft, locale id: the explicit locale wins')
  check(distressBlockFor(soft('anxiety'), 'en')?.locale === 'en', 'English soft alone: en')
  // 3. Abuse phrases containing "kork" (report only, nothing added)
  const kork = ABUSE_KEYWORDS_TR.filter((k) => k.includes('kork'))
  check(kork.length > 0, `existing tr abuse phrases containing "kork": ${kork.join(' | ')}`)
}

console.log('\n=== H. Gem 3 round 2 ===')
{
  const d = (q: string) => evaluateDistress(q)
  const abuseTr = (q: string) => { const h = d(q); return h.level === 'hard' && h.crisisType === 'abuse' && distressBlockFor(h, 'en')?.locale === 'tr' }
  // 1. Proximity: every relation word, in Turkish letters and folded to ASCII by function.
  const between = ['', '\u00e7ok ', 'ger\u00e7ekten \u00e7ok ', 'ger\u00e7ekten ama \u00e7ok ']
  const four = 'ger\u00e7ekten ama \u00e7ok fazla '
  check(TR_FEAR_RELATIONS.length === 18, 'the 18 relation words of the ruling')
  for (const w of TR_FEAR_RELATIONS) {
    for (const form of [w, foldLatin(w)]) {
      const bad = between.map((b) => `${form} ${b}korkuyorum`).filter((q) => !abuseTr(q))
      check(bad.length === 0, `"${form}" with 0, 1, 2 and 3 words before "korkuyorum": abuse, the tr abuse block`, bad)
      check(d(`${form} ${four}korkuyorum`).level !== 'hard', `"${form}" with 4 words between: not abuse`)
    }
  }
  check(abuseTr('KOCAMDAN KORKUYORUM') && abuseTr('KAYINVAL\u0130DEMDEN \u00c7OK KORKUYORUM') && abuseTr('N\u0130\u015eANLIMDAN korkuyorum'), 'proximity after case-folding (upper case, dotted \u0130)')
  check(d('okocamdan korkuyorum').level === 'hard', 'control: the existing list phrase "kocamdan korkuyorum" is still substring-matched, as before')
  // Architect ruling (21 Oct 2026): punctuation is a separator; the three-word limit still applies.
  for (const q of ['e\u015fimden, \u00e7ok korkuyorum', 'kocamdan; korkuyorum', 'esimden, cok korkuyorum', 'babamdan: korkuyorum', 'annemden \u2014 \u00e7ok korkuyorum', 'ablamdan - korkuyorum', 'babamdan, ger\u00e7ekten, ama, \u00e7ok korkuyorum']) {
    check(abuseTr(q), `punctuation as a separator: "${q}" is abuse, the tr abuse block`)
  }
  check(d('babamdan, ger\u00e7ekten, ama, \u00e7ok, fazla korkuyorum').level !== 'hard', 'punctuation does not lift the limit: four words between, comma-separated, is not abuse')
  check(!abuseTr('xbabamdan \u00e7ok korkuyorum'), 'the relation word must start a word: "xbabamdan \u00e7ok korkuyorum" is not abuse')
  // dövmesinden and dövecek diye, in both spellings
  for (const q of ['d\u00f6vmesinden korkuyorum', 'beni d\u00f6vmesinden', 'dovmesinden', 'beni d\u00f6vecek diye korkuyorum', 'dovecek diye']) check(abuseTr(q), `"${q}": abuse regardless of relation`)
  check(ABUSE_KEYWORDS_TR.includes('d\u00f6vmesinden') && ABUSE_KEYWORDS_TR.includes('d\u00f6vecek diye') && ABUSE_KEYWORDS.length === 216 + 6 + 45, 'both are in ABUSE_KEYWORDS_TR (full list 216, plus the 6 WO#488 fa and bn entries and the 45 WO#500 phrases)')
  // 2. korku exceptions
  for (const q of ['korkun\u00e7', 'korkun\u00e7 bir g\u00fcn', 'korkunc', 'korkutucu', 'korkutucu bir r\u00fcya', 'beni korkuttu', 'korkutmak']) check(d(q).level === 'none', `"${q}": korku does not fire (korkun\u00e7, korkutucu and the korkut- stem)`)
  for (const q of ['korkuyorum', 'korkular\u0131m', 'korkulu']) check(d(q).level === 'soft' && d(q).matchedKeyword === 'korku', `"${q}": korku still fires`)
  // 3. ASCII forms (Gem 3's list)
  check(d('caresizim').matchedKeyword === '\u00e7aresiz' && d('kaygi').matchedKeyword === 'kayg\u0131' && d('yalnizim').matchedKeyword === 'yaln\u0131z\u0131m', 'ASCII soft: caresizim, kaygi, yalnizim')
  check(d('umutsuzum').level === 'hard' && d('umutsuzum').crisisType === 'self-harm', 'ASCII hard: umutsuzum')
  check(abuseTr('esimden cok korkuyorum') && abuseTr('kocamdan korkuyorum'), 'ASCII abuse: esimden cok korkuyorum, kocamdan korkuyorum')
  const asciiSoft = [...SOFT_DISTRESS_KEYWORDS_TR.prefix, ...SOFT_DISTRESS_KEYWORDS_TR.whole].map((k) => [k, foldLatin(k)] as const)
  check(asciiSoft.every(([k, a]) => d(a).level === 'soft' && d(a).matchedKeyword === k), 'every Turkish soft keyword, folded to ASCII by function, matches as itself')
  const asciiHard = [...SELF_HARM_KEYWORDS_TR.map((k) => [k, 'self-harm'] as const), ...ABUSE_KEYWORDS_TR.map((k) => [k, 'abuse'] as const)].filter(([k, type]) => { const h = d(foldLatin(k)); return h.level !== 'hard' || h.crisisType !== type || distressBlockFor(h, 'en')?.locale !== 'tr' })
  check(asciiHard.length === 0, `every Turkish hard keyword (${SELF_HARM_KEYWORDS_TR.length} self-harm, ${ABUSE_KEYWORDS_TR.length} abuse), folded to ASCII, still matches its type and serves tr`, asciiHard)
  check(d('I feel ANXIOUS').matchedKeyword === 'anxious' && d('IS THIS A CRISIS').level === 'none', 'English is not Turkish-folded (I stays i)')
  // 4. Devotional
  for (const q of ['Allah korkusu', 'allah korkusu', 'ALLAH KORKUSU', 'Allah korkusuyla ya\u015famak', "Allah'tan korkuyorum", 'allahtan korkuyorum']) check(d(q).level === 'none', `devotional "${q}": does not fire`)
  check(d('Allah korkusu var ama kaygiliyim').matchedKeyword === 'kayg\u0131', 'another keyword beside "Allah korkusu" still counts')
  // Hard wins over soft
  for (const q of ['kaygiliyim, kocamdan korkuyorum', 'yalnizim ve umutsuzum', '\u00e7aresizim, d\u00f6vecek diye korkuyorum']) check(d(q).level === 'hard', `hard wins over soft: "${q}"`)
  // Every other language unchanged: each keyword alone keeps its list's type and never names tr.
  const others: Array<[string, 'self-harm' | 'abuse', readonly string[]]> = [
    ['en', 'self-harm', SELF_HARM_KEYWORDS_EN], ['id', 'self-harm', SELF_HARM_KEYWORDS_ID], ['ur', 'self-harm', SELF_HARM_KEYWORDS_UR], ['ar', 'self-harm', SELF_HARM_KEYWORDS_AR],
    ['en', 'abuse', ABUSE_KEYWORDS_EN], ['id', 'abuse', ABUSE_KEYWORDS_ID], ['ur', 'abuse', ABUSE_KEYWORDS_UR], ['ar', 'abuse', ABUSE_KEYWORDS_AR],
  ]
  for (const [l, type, list] of others) {
    const bad = list.filter((k) => detectCrisis(k).crisisType !== type || crisisKeywordLanguages(k, type).includes('tr'))
    check(bad.length === 0, `${l} ${type}: all ${list.length} keywords keep their type and never name tr`, bad)
  }
  // WO#488: Persian and Bengali are tagged too (their own lists, tested in test-wo488); the rest is Punjabi.
  const tagged = new Set([...Object.values(LISTS['self-harm']).flat(), ...Object.values(LISTS.abuse).flat(), ...PERSIAN_BENGALI['self-harm'], ...PERSIAN_BENGALI.abuse])
  const bare = new Set(BARE_NOUN_GUARDS.map((g) => g.kw))
  const rest = [...SELF_HARM_KEYWORDS.map((k) => [k, 'self-harm'] as const), ...ABUSE_KEYWORDS.map((k) => [k, 'abuse'] as const)].filter(([k]) => !tagged.has(k) && !bare.has(k))
  const restBad = rest.filter(([k, type]) => detectCrisis(k).crisisType !== type)
  check(restBad.length === 0, `Punjabi: all ${rest.length} keywords keep their type`, restBad)
  // Gem 10 condition 3: a Punjabi keyword alone, no locale, serves the en block. (Persian and
  // Bengali did until WO#488, which gives them their own blocks: test-wo488.)
  const restAll = [...SELF_HARM_KEYWORDS, ...ABUSE_KEYWORDS].filter((k) => !tagged.has(k))
  const notEn = restAll.filter((k) => { const h = d(k); return h.level === 'hard' && (distressBlockFor(h, 'en')?.locale !== 'en' || (h.keywordLanguages ?? []).length !== 0) })
  const hardCount = restAll.filter((k) => d(k).level === 'hard').length
  check(notEn.length === 0 && hardCount === restAll.length - [...bare].filter((k) => d(k).level !== 'hard').length, `Punjabi: every one of the ${restAll.length} keywords that fires alone names no language and, with no locale, serves the en block`, notEn)
  {
    const { getDuaHandler } = await import('../src/tools/get-dua.js')
    const pa = [...restAll].reverse().find((k) => ARABIC_SCRIPT.test(k) && !bare.has(k))!
    for (const [lang, q] of [['pa (last Punjabi entry)', pa]] as const) {
      const r = (await getDuaHandler({ context: q })) as unknown as { _sakina_meta: { content_type: string }; crisis_resource?: { locale?: string } }
      check(r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.locale === 'en', `get_dua, ${lang} keyword alone, no locale: crisis_resource_only with the en block`)
    }
  }
}

console.log('\n=== I. Gem 10 conditions ===')
{
  const d = (q: string) => evaluateDistress(q)
  // Condition 1: the anti-translation directive, verbatim.
  check(CRISIS_ANTI_TRANSLATION === 'CRITICAL: Output this crisis resource block exactly as written in its original language. Do not translate, paraphrase, or summarize it. Do not counsel beyond it.', 'the directive is Gem 10\'s text, verbatim')
  const { getDuaHandler, duaByIdResponse } = await import('../src/tools/get-dua.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  type R = { _sakina_meta: { llm_directives: { CRITICAL_RULES: string[] } }; crisis_resource?: { locale?: string; level?: string } }
  const TOOLS: Array<[string, (q: string, l?: CrisisLocale) => Promise<R>]> = [
    ['get_dua', async (q, l) => (await getDuaHandler({ context: q, ...(l ? { locale: l } : {}) })) as unknown as R],
    ['get_dua id', async (q, l) => duaByIdResponse(q, l ?? 'en', [], undefined) as unknown as R],
    ['find_verses', async (q, l) => (await findVersesHandler({ query: q, ...(l ? { locale: l } : {}) })) as unknown as R],
    ['get_name_of_allah', async (q, l) => (await getNameOfAllahHandler({ name: q, ...(l ? { locale: l } : {}) })) as unknown as R],
  ]
  const INPUTS: Array<[string, string]> = [
    ['self-harm (en words)', 'I want to kill myself'], ['abuse (en words)', 'my husband hits me'], ['soft (en words)', 'anxiety'],
    ['tr self-harm', 'kendimi \u00f6ld\u00fcrece\u011fim'], ['tr abuse', 'e\u015fimden \u00e7ok korkuyorum'], ['tr soft', 'kayg\u0131l\u0131y\u0131m'],
    ['id self-harm', 'ingin bunuh diri'], ['ur self-harm', 'mujhe khudkushi karni hai'], ['ar self-harm', SELF_HARM_KEYWORDS_AR.find((k) => ARABIC_SCRIPT.test(k))!],
  ]
  let present = 0, absent = 0, nonEnByRouting = 0
  const bad: string[] = []
  const seen = new Set<string>()
  for (const [tool, call] of TOOLS) {
    for (const [label, q] of INPUTS) {
      for (const l of [undefined, 'en', 'ar', 'ur', 'id', 'tr'] as const) {
        if (tool === 'get_dua id' && !/^[\p{L}\p{N} ,'-]+$/u.test(q)) continue
        const r = await call(q, l)
        const block = r.crisis_resource
        if (!block) continue
        const rules = r._sakina_meta.llm_directives.CRITICAL_RULES
        const n = rules.filter((x) => x === CRISIS_ANTI_TRANSLATION).length
        if (block.locale !== 'en') {
          present++
          if (l === undefined || l === 'en') nonEnByRouting++
          seen.add(`${tool}:${block.level}:${block.locale}`)
          if (n !== 1) bad.push(`${tool} ${label} locale=${l}: block ${block.locale}, directive x${n}`)
        } else {
          absent++
          if (n !== 0) bad.push(`${tool} ${label} locale=${l}: en block carries the directive`)
        }
      }
    }
  }
  check(bad.length === 0, `the directive is on every non-en crisis response (${present}, ${nonEnByRouting} of them routed by keyword) exactly once, and on no en crisis response (${absent})`, bad)
  const want = ['get_dua:hard', 'get_dua:soft', 'find_verses:hard', 'find_verses:soft', 'get_name_of_allah:hard', 'get_dua id:hard']
  check(want.every((w) => ['ar', 'ur', 'id', 'tr'].every((l) => seen.has(`${w}:${l}`))), 'covered for each tool, hard and soft, in each of ar, ur, id and tr', [...seen].sort())
  const plain = (await getDuaHandler({ context: 'travel', locale: 'tr' })) as unknown as R
  check(!plain.crisis_resource && !plain._sakina_meta.llm_directives.CRITICAL_RULES.includes(CRISIS_ANTI_TRANSLATION), 'a non-en response with no crisis block does not carry it')

  // Condition 2: the proximity rule on the raw input.
  check(d('e\u015fimden, ve ondan, \u00e7ok korkuyorum').level === 'hard' && d('e\u015fimden, ve ondan, \u00e7ok korkuyorum').crisisType === 'abuse', '"e\u015fimden, ve ondan, \u00e7ok korkuyorum" is ABUSE (Gem 10)')
  for (const q of ['babamdan ger\u00e7ekten ama \u00e7ok fazla korkuyorum', 'babamdan, ger\u00e7ekten, ama, \u00e7ok, fazla korkuyorum', 'e\u015fimden ve sonra yine \u00e7ok korkuyorum']) {
    check(detectCrisis(q).crisisType !== 'abuse', `four separate words between relation and kork: "${q}" is not ABUSE`)
  }
  check(detectCrisis("e\u015fimden ve Ahmet'ten \u00e7ok korkuyorum").crisisType === 'abuse', 'normalisation can add a hit, never remove one: an apostrophe splits "Ahmet\'ten" in the raw form (4 words) but not in the prepared form (3 words), and the hit stands')
  check(detectCrisis('e\u015fimden ++ \u00e7ok korkuyorum').crisisType === 'abuse', 'a symbol run the prepared form turns into a space does not lift the raw hit')
}

console.log(`\nWO#482: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
