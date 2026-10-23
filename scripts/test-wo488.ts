/**
 * WO#488: MCP 2.4.0 part 1 (22 Oct 2026; docs/wo488-architect.md).
 *
 *   A. Bengali (bn) and Persian (fa) crisis gaps: the A1 phrases, the A2
 *      relational-fear rule, A3 soft phrases, A4 keyboard folding, the WO#265
 *      four-gate unchanged, A5 helplines, A6 routing and blocks, and false
 *      positives on 20 ordinary sentences.
 *   C. find_verses synonyms (the Gem 4 and Gem 2 ruling): every shipped term
 *      routes to its theme, every other E.6 term and both phrases return
 *      not_found, the phrase level runs first, grief routes carry the soft
 *      note and withhold teach, "depression" keeps its soft block and
 *      "abuse" is unchanged. The E.6 rows are fixtures in wo488-e6-rows.ts.
 *
 * The WO's own phrases are read from the archived WO text, not retyped here.
 *
 * Run: npm run bundle-data && npm run test:wo488
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  ABUSE_KEYWORDS,
  ABUSE_KEYWORDS_BN,
  ABUSE_KEYWORDS_FA,
  BARE_NOUN_GUARDS,
  BN_DISCLOSURE_MARKERS,
  BN_FEAR_NOUN,
  BN_FEAR_RELATIONS,
  BN_FEAR_VERBS,
  BN_FRAME_MARKERS,
  crisisKeywordLanguages,
  detectCrisis,
  FA_DISCLOSURE_MARKERS,
  FA_FEAR_FROM,
  FA_FEAR_RELATIONS,
  FA_FEAR_VERB,
  FA_FRAME_MARKERS,
  SELF_HARM_KEYWORDS,
  SELF_HARM_KEYWORDS_BN,
  SELF_HARM_KEYWORDS_FA,
} from '../src/safety/_synced/crisis-detection.js'
import { ABUSE_SENTENCE, crisisLocaleFor, distressBlockFor, evaluateDistress, SOFT_DISTRESS_KEYWORDS_BN, SOFT_DISTRESS_KEYWORDS_FA, SOFT_DISTRESS_RESOURCE_BLOCK } from '../src/safety/crisis-keywords.js'
import { EN_COUNTRY_NAMES, EN_FALLBACK_FIELDS, EN_FALLBACK_IDS } from '../src/safety/crisis-en-fallback-strings.js'
import { CRISIS_ANTI_TRANSLATION } from '../src/meta/response-builder.js'
import { ENGLISH_FALLBACK_GUARD } from '../src/contracts/english-fallback.js'
import { matchThemes, THEME_PHRASES, THEME_SYNONYMS } from '../src/data/thematic.js'
import { normalisePhrase } from '../src/data/context-matcher.js'
import { E6_ROWS, NOT_FOUND_PHRASES } from './wo488-e6-rows.js'
import { BN_FA_LINES_FOUNDER_VERIFIED, US_988_FOUNDER_VERIFIED } from '../src/safety/crisis-keywords.js'
import { bnFaText, verifyBnFaLines } from '../src/safety/crisis-text-bn-fa.js'
// @ts-expect-error a plain .mjs module, no types
import { lineNumbersIn, REQUIRED_LINES, requiredLineProblems } from './crisis-line-guard.mjs'
import { findVersesShape } from '../src/tools/find-verses.js'
import { getDuaShape } from '../src/tools/get-dua.js'
import { getNameOfAllahShape } from '../src/tools/get-name-of-allah.js'
import { getQuranVerseShape } from '../src/tools/get-quran-verse.js'
import { z } from 'zod'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const root = (p: string) => new URL(`../../${p}`, import.meta.url)

// ── The WO's phrases, from the archived WO text ──────────────────────────
const RECORD = readFileSync(root('docs/wo488-architect.md'), 'utf-8')
const WO = RECORD.split('\n## ')[0]!
// Gem 3's follow-up ruling (22 Oct), from its verbatim section of the record.
const GEM3 = RECORD.split('\n## Gem 3 ruling, follow-up (22 Oct 2026, verbatim)')[1]!.split('\n## ')[0]!
const line = (prefix: string) => {
  const l = WO.split('\n').map((x) => x.replace(/^>\s?/, '')).filter((x) => x.trim().startsWith(prefix))
  if (l.length !== 1) throw new Error(`WO line "${prefix}": ${l.length} matches`)
  return [...l[0]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
}
const BN_SELF = line('bn self-harm:')
const BN_ABUSE = line('bn abuse:')
const FA_SELF = line('fa self-harm:')
const FA_ABUSE = line('fa abuse:')
const LATIN = line('Latin (through')
const A3 = line('A3.')
const A4 = line('A4.')
const DONT = line('Do NOT add the bare stem')
const isBn = (s: string) => /[ঀ-৿]/.test(s)

const langsOf = (s: string) => {
  const r = detectCrisis(s)
  return r.isCrisis && r.crisisType !== 'none' ? crisisKeywordLanguages(s, r.crisisType) : []
}
const fires = (s: string, type: 'self-harm' | 'abuse', lang: 'bn' | 'fa') => {
  const r = detectCrisis(s)
  return r.isCrisis && r.crisisType === type && JSON.stringify(langsOf(s)) === JSON.stringify([lang])
}

// The bn and fa block texts. Since WO#490 they are Gem 1's translation (test-wo490
// checks them against the archived file and its sha256, and the fa isolates);
// WO#490 also removed the English-fallback note.
const IASP = 'https://www.iasp.info/resources/Crisis_Centres/'
const PINNED = {
  'bn self-harm': bnFaText('bn', 'self-harm'),
  'bn abuse': bnFaText('bn', 'abuse'),
  'fa self-harm': bnFaText('fa', 'self-harm'),
  'fa abuse': bnFaText('fa', 'abuse'),
} as const
/** The text with its bidi isolates removed (the guard reads numbers this way). */
const plain = (s: string) => s.replace(/[\u2066-\u2069]/gu, '')

async function main() {
  console.log('=== A1. the net-new phrases ===')
  check(BN_SELF.length === 2 && BN_ABUSE.length === 4 && FA_SELF.length === 2 && FA_ABUSE.length === 2 && LATIN.length === 4, 'the WO lists read from docs/wo488-architect.md (2, 4, 2, 2, 4)')
  for (const s of BN_SELF) check(SELF_HARM_KEYWORDS_BN.includes(s) && fires(s, 'self-harm', 'bn'), `bn self-harm "${s}": listed, fires self-harm, names bn`)
  for (const s of BN_ABUSE) check(ABUSE_KEYWORDS_BN.includes(s) && fires(s, 'abuse', 'bn'), `bn abuse "${s}": listed, fires abuse, names bn`)
  for (const s of FA_SELF) check(SELF_HARM_KEYWORDS_FA.includes(s) && fires(s, 'self-harm', 'fa'), `fa self-harm "${s}": listed, fires self-harm, names fa`)
  for (const s of FA_ABUSE) check(ABUSE_KEYWORDS_FA.filter((k) => k === s).length === 1 && fires(s, 'abuse', 'fa'), `fa abuse "${s}": listed once (already present since WO#212), fires abuse, names fa`)
  const [amiMore, mikham, amake, mano] = LATIN as [string, string, string, string]
  check(SELF_HARM_KEYWORDS_BN.includes(amiMore) && fires(amiMore, 'self-harm', 'bn') && fires(amiMore.toUpperCase(), 'self-harm', 'bn'), `Latin "${amiMore}": bn self-harm, any case`)
  check(SELF_HARM_KEYWORDS_FA.includes(mikham) && fires(mikham, 'self-harm', 'fa'), `Latin "${mikham}": fa self-harm`)
  check(ABUSE_KEYWORDS_BN.includes(amake) && fires(amake, 'abuse', 'bn'), `Latin "${amake}": bn abuse`)
  check(ABUSE_KEYWORDS_FA.includes(mano) && fires(mano, 'abuse', 'fa'), `Latin "${mano}": fa abuse`)
  // Inside a sentence.
  check(fires(`${BN_SELF[0]} আর`, 'self-harm', 'bn') && fires(`${FA_SELF[1]} دیگه`, 'self-harm', 'fa'), 'a new phrase inside a longer sentence still fires')
  // Negatives: the two the WO excludes, and a part of a new phrase.
  const [stem, kosto] = DONT as [string, string]
  const allLists = [...SELF_HARM_KEYWORDS, ...ABUSE_KEYWORDS]
  check(!allLists.includes(stem) && !detectCrisis(stem).isCrisis, `"${stem}" (bare stem) is in no list and alone does not fire`)
  check(!allLists.includes(kosto) && !detectCrisis(kosto).isCrisis && evaluateDistress(kosto).level === 'none', `"${kosto}" is in no list, fires nothing, and is not soft`)
  check(!detectCrisis(BN_SELF[0]!.split(' ').slice(0, 2).join(' ')).isCrisis, 'the first two words of a new bn phrase alone do not fire')
  check(!detectCrisis(FA_SELF[0]!.split(' ')[0]!).isCrisis, 'the first word of a new fa phrase alone does not fire')
  check(!detectCrisis('amake').isCrisis && !detectCrisis('more jete').isCrisis && !detectCrisis('mizane').isCrisis, 'parts of the Latin phrases alone do not fire')

  console.log('\n=== A2. relational fear (proximity) ===')
  const faRel = FA_FEAR_RELATIONS[0]! // the WO's first example
  const bnRel = BN_FEAR_RELATIONS[0]!
  const fa = (between: string[], verb = FA_FEAR_VERB, rel = faRel, sep = ' ') => [FA_FEAR_FROM, rel, ...between, verb].join(sep)
  const bn = (between: string[], verb = BN_FEAR_VERBS[0]!, rel = bnRel, sep = ' ') => [rel, ...between, `${BN_FEAR_NOUN} ${verb}`].join(sep)
  const W = (n: number, w: string) => Array.from({ length: n }, () => w)
  const FA_WORD = FA_FRAME_MARKERS[0]! // any Persian word, as a filler (from the data, not retyped)
  const BN_WORD = BN_FRAME_MARKERS[2]! // a Bengali word, as a filler (single letters would collapse into one word under letter-spacing)
  for (const rel of FA_FEAR_RELATIONS) check(fires(fa([], FA_FEAR_VERB, rel), 'abuse', 'fa'), `fa: ${FA_FEAR_FROM} + "${rel}" + verb is abuse (fa)`)
  for (const rel of BN_FEAR_RELATIONS) for (const v of BN_FEAR_VERBS) check(fires(bn([], v, rel), 'abuse', 'bn'), `bn: "${rel}" + ${BN_FEAR_NOUN} ${v} is abuse (bn)`)
  const zwnj = FA_FEAR_VERB.slice(0, 2) + '‌' + FA_FEAR_VERB.slice(2)
  const spaced = FA_FEAR_VERB.slice(0, 2) + ' ' + FA_FEAR_VERB.slice(2)
  check(fires(fa([], zwnj), 'abuse', 'fa') && fires(fa([], spaced), 'abuse', 'fa'), 'fa: the verb with ZWNJ, and with a space for the ZWNJ, both fire')
  check(fires(fa(W(3, FA_WORD)), 'abuse', 'fa') && !detectCrisis(fa(W(4, FA_WORD))).isCrisis, 'fa: up to three words between fires; four does not')
  check(fires(bn(W(3, BN_WORD)), 'abuse', 'bn') && !detectCrisis(bn(W(4, BN_WORD))).isCrisis, 'bn: up to three words between fires; four does not')
  // Case endings on the bn relation word (-কে, -র, -ের, -য়ের, -এর, and -ও).
  for (const end of ['কে', 'র', 'ের', 'য়ের', 'এর', 'কেও']) {
    check(fires(bn([], BN_FEAR_VERBS[1], bnRel + end), 'abuse', 'bn'), `bn: relation + case ending U+${[...end].map((c) => c.codePointAt(0)!.toString(16).toUpperCase()).join(' U+')} fires`)
  }
  // The WO's third bn form: "কাছে যেতে ভয় করে" (two words between), from the WO text.
  const kache = line('bn: relation')[2]!
  check(fires(`${bnRel}র ${kache}`, 'abuse', 'bn'), `bn: relation-র + "${kache}" fires`)
  // Comma gap. Per the Architect's comma ruling (21 Oct 2026, docs/wo482-architect.md), punctuation
  // between the relation and the verb counts as a separator, as in Turkish: these FIRE. See the report.
  check(fires(fa([], FA_FEAR_VERB, faRel, '، '), 'abuse', 'fa') && fires(fa([], FA_FEAR_VERB, faRel, ', '), 'abuse', 'fa'), 'comma gap, fa (Persian comma and Latin comma): fires, per the comma ruling')
  check(fires(bn([], BN_FEAR_VERBS[0], bnRel, ', '), 'abuse', 'bn') && fires(`${bnRel}। ${BN_FEAR_NOUN} ${BN_FEAR_VERBS[0]}`, 'abuse', 'bn'), 'comma gap, bn (comma and danda): fires, per the comma ruling')
  check(!detectCrisis(fa(W(4, FA_WORD), FA_FEAR_VERB, faRel, ', ')).isCrisis && !detectCrisis(bn(W(4, BN_WORD), BN_FEAR_VERBS[0], bnRel, ', ')).isCrisis, 'comma gap with four words between: does not fire (the word limit still holds)')
  // Negatives.
  check(!detectCrisis([faRel, FA_FEAR_VERB].join(' ')).isCrisis, `fa: without "${FA_FEAR_FROM}", no fire`)
  check(!detectCrisis([FA_FEAR_FROM, FA_WORD, FA_FEAR_VERB].join(' ')).isCrisis, 'fa: "از" + a non-relation word + verb, no fire')
  check(!detectCrisis([FA_FEAR_FROM, faRel].join(' ')).isCrisis && !detectCrisis(FA_FEAR_VERB).isCrisis, 'fa: relation without the verb, or the verb alone, no fire')
  check(!detectCrisis(`${bnRel}রাস ${BN_FEAR_NOUN} ${BN_FEAR_VERBS[0]}`).isCrisis, 'bn: a longer word that starts with a relation (no listed ending) does not fire')
  check(!detectCrisis(`${BN_FEAR_NOUN} ${BN_FEAR_VERBS[0]}`).isCrisis && !detectCrisis(bnRel).isCrisis, 'bn: the verb alone, or the relation alone, no fire')

  const toArabic = (s: string) => s.replace(/ی/g, 'ي').replace(/ک/g, 'ك')
  const toPersian = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  const withZwnj = (s: string) => s.replace(/(^|\s)(م[يی])(?=\S)/gu, '$1$2‌')

  console.log('\n=== Gem 3 follow-up ruling (22 Oct) ===')
  {
    const quoted = [...GEM3.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
    const [kori, pai, azesh] = quoted as [string, string, string]
    const fatherInLaw = /Add fa (\S+) \(father-in-law\)/.exec(GEM3)![1]!
    const drafts = /all drafts APPROVED \(([^)]+)\)/.exec(GEM3)![1]!.split(', ')
    check(FA_FEAR_RELATIONS.includes(fatherInLaw) && fires(fa([], FA_FEAR_VERB, fatherInLaw), 'abuse', 'fa'), `1. fa relation "${fatherInLaw}" (father-in-law) added and fires`)
    check(drafts.length === 4 && drafts.every((d) => FA_FEAR_RELATIONS.includes(d) || BN_FEAR_RELATIONS.includes(d)), `1. the four approved drafts are in the lists (${drafts.join(', ')})`, drafts)
    check(FA_FEAR_RELATIONS.length === 9 && BN_FEAR_RELATIONS.length === 8, 'the relation lists: fa 9, bn 8 (as ruled)')
    for (const phrase of [kori, pai]) {
      const [noun, verb] = phrase.split(' ') as [string, string]
      const [ami, amar] = [BN_DISCLOSURE_MARKERS[0]!, BN_DISCLOSURE_MARKERS[1]!] // "I", "my", from the data
      const sentence = `${ami} ${amar} ${bnRel}\u0995\u09C7 ${noun} ${verb}`
      check(noun === BN_FEAR_NOUN && BN_FEAR_VERBS.includes(verb) && fires(sentence, 'abuse', 'bn') && fires(`${bnRel}\u09B0 ${kache.split(' ').slice(0, 2).join(' ')} ${phrase}`, 'abuse', 'bn'), `2. bn first person "${phrase}": "I ... my husband + ${phrase}" fires (none before the ruling), and with two words between`)
      check(!detectCrisis(phrase).isCrisis, `2. "${phrase}" alone (no relation) does not fire`)
    }
    check(ABUSE_KEYWORDS_FA.includes(azesh) && fires(azesh, 'abuse', 'fa'), `3. fa "${azesh}": a standalone abuse phrase, routed to fa`)
    check(fires(toArabic(azesh), 'abuse', 'fa') && fires(withZwnj(toArabic(azesh)), 'abuse', 'fa') && fires(`${FA_DISCLOSURE_MARKERS[0]} ${azesh}`, 'abuse', 'fa'), `3. "${azesh}" on an Arabic keyboard, with ZWNJ, and in a sentence: fires`)
    check(!detectCrisis(azesh.split(' ')[0]!).isCrisis, `3. "${azesh.split(' ')[0]}" alone does not fire`)
    // 4. Negation after the verb: kept (Gem 3: SAFE). The negation word is taken from an existing bn keyword.
    const na = SELF_HARM_KEYWORDS_BN.find((k) => k.endsWith(' \u09A8\u09BE'))!.split(' ').pop()!
    check(na === '\u09A8\u09BE' && fires(`${bnRel}\u0995\u09C7 ${BN_FEAR_NOUN} ${BN_FEAR_VERBS[1]} ${na}`, 'abuse', 'bn'), '4. bn negation after the verb still fires (kept, Gem 3: SAFE)')
  }

  console.log('\n=== A4. keyboard folding (Gem 3) ===')
  check(A4.length === 3 && A4.every((s) => /[يك]/.test(s)), 'the three WO cases, from the WO text, each carry an Arabic-keyboard letter')
  for (const s of A4) {
    const persian = toPersian(s)
    const variants = [s, persian, toArabic(s), withZwnj(persian), withZwnj(toArabic(s))]
    const results = variants.map((v) => `${detectCrisis(v).crisisType}:${langsOf(v).join(',')}`)
    check(new Set(results).size === 1 && results[0] !== 'none:' && results[0]!.endsWith(':fa') && withZwnj(persian) !== persian, `"${s}": as typed, Persian keyboard, Arabic keyboard, and each with ZWNJ all give ${results[0]}`, results)
  }

  console.log('\n=== A3. soft distress (bn, fa) ===')
  check(JSON.stringify([...SOFT_DISTRESS_KEYWORDS_BN, ...SOFT_DISTRESS_KEYWORDS_FA].sort()) === JSON.stringify([...A3].sort()), 'the soft lists are exactly the WO\'s five phrases')
  for (const s of A3) {
    const l = isBn(s) ? 'bn' : 'fa'
    const h = evaluateDistress(s)
    const b = distressBlockFor(h, 'en') as { level?: string; locale?: string; text?: string; translation_note?: string }
    check(h.level === 'soft' && JSON.stringify(h.keywordLanguages) === JSON.stringify([l]) && b.level === 'soft' && b.locale === l && b.text === bnFaText(l, 'soft') && b.translation_note === undefined && !detectCrisis(s).isCrisis, `"${s}": soft (not crisis), names ${l}, serves the ${l} soft text as a ${l} block, with no English-fallback note (WO#490)`)
  }
  for (const s of A3.filter((x) => !isBn(x))) {
    const v = toArabic(s)
    check(evaluateDistress(v).level === 'soft' && evaluateDistress(withZwnj(v)).level === 'soft', `"${s}" on an Arabic keyboard (and with ZWNJ): still soft`)
  }
  check(evaluateDistress(`${A3[0]} ।`).level === 'soft' && evaluateDistress(A3[0]!.split(' ').slice(0, 2).join(' ')).level === 'none', 'bn soft: inside a sentence fires; part of a phrase does not')
  check(crisisLocaleFor({ level: 'soft', keywordLanguages: ['en', 'fa'] }, 'en') === 'fa' && crisisLocaleFor({ level: 'soft', keywordLanguages: ['fa', 'tr'] }, 'en') === 'en', 'soft routing: en plus fa gives fa; fa plus tr gives en')

  console.log('\n=== The WO#265 four-gate, unchanged ===')
  const gateHash = createHash('sha256').update(JSON.stringify({ g: BARE_NOUN_GUARDS, ff: FA_FRAME_MARKERS, fd: FA_DISCLOSURE_MARKERS, bf: BN_FRAME_MARKERS, bd: BN_DISCLOSURE_MARKERS })).digest('hex')
  check(gateHash === '71b7dba7ace85297621b2a2f8ba1c28ea31b71a3e097de547c24cce0d0a0b6a4', 'the bare nouns and the four marker lists are byte-identical to main 66ed959e (sha256)', gateHash)
  for (const g of BARE_NOUN_GUARDS) {
    const frames = g.locale === 'fa' ? FA_FRAME_MARKERS : BN_FRAME_MARKERS
    const alone = detectCrisis(g.kw)
    const framed = detectCrisis(`${frames[0]} ${g.kw} ${frames[1]}`)
    const disclosed = detectCrisis(`${frames[0]} ${g.kw} ${(g.locale === 'fa' ? FA_DISCLOSURE_MARKERS : BN_DISCLOSURE_MARKERS)[0]}`)
    const long = detectCrisis(`${frames[0]} ${g.kw} ${Array.from({ length: 8 }, () => 'x').join(' ')}`)
    check(alone.crisisType === g.type && !framed.isCrisis && disclosed.crisisType === g.type && long.crisisType === g.type, `${g.locale} bare noun "${g.kw}": alone fires, framed and short is suppressed, a disclosure marker fires, over 8 words fires`)
    check(JSON.stringify(langsOf(g.kw)) === JSON.stringify([g.locale]), `${g.locale} bare noun "${g.kw}" alone names ${g.locale}`)
  }

  console.log('\n=== A5. helplines ===')
  const src = readFileSync(root('src/data/helplines.ts'), 'utf-8')
  const entry = (id: string) => {
    const m = new RegExp(`\\{\\s*(?://[^\\n]*\\n\\s*)*id: '${id}',([\\s\\S]*?)\\n  \\},`).exec(src)
    const body = m?.[1] ?? ''
    const f = (k: string) => new RegExp(`\\n\\s*${k}: '([^']*)'`).exec(body)?.[1]
    const a = (k: string) => new RegExp(`\\n\\s*${k}: \\[([^\\]]*)\\]`).exec(body)?.[1]
    return { found: !!m, f, a }
  }
  const e1480 = entry('fa-social-emergency-1480')
  const e123 = entry('fa-emergency-123')
  const e109 = entry('bd-mowca-109')
  const kpr = entry('bn-kaan-pete-roi')
  const renamed = line('- fa-social-emergency-1480:')
  check(e1480.f('name') === renamed[0] && e1480.f('englishName') === renamed[1] && e1480.f('availability') === 'limited' && e1480.f('hours') === '8:00 to 24:00 Iran time' && /\n\s*verified: true/.test(src.slice(src.indexOf("id: 'fa-social-emergency-1480'"), src.indexOf("id: 'fa-emergency-123'"))), '1480: the counselling line, its name and label from the WO, 8:00 to 24:00 Iran time, limited, verified')
  check(e123.f('category') === 'self-harm' && e123.a('alsoCategories') === "'abuse'" && e123.f('availability') === '24_7' && e123.f('hours') === '24/7', '123: 24/7, self-harm, also abuse')
  check(e109.found && e109.f('phone') === '109' && e109.f('name') === line('- Add bd-mowca-109:')[0] && e109.f('category') === 'abuse' && e109.f('availability') === '24_7' && e109.f('note') === 'Toll-free' && e109.f('country') === 'BD', 'bd-mowca-109: added, 109, 24/7, toll-free, abuse, BD')
  check(kpr.f('phone') === '09612-119911' && /3:00 PM to 3:00 AM/.test(kpr.f('hours') ?? ''), 'Kaan Pete Roi unchanged (09612-119911, 3pm to 3am)')
  check(!/Ain o Salish|ASK|01724/.test(src), 'ASK is not added (no category fits legal aid; reported)')
  // The generated fields equal helplines.ts.
  const drift = Object.entries(EN_FALLBACK_FIELDS).filter(([id, v]) => {
    const e = entry(id)
    return v.name !== (e.f('englishName') ?? e.f('name')) || v.phone !== e.f('phone') || v.hours !== (e.f('hours') ?? '').split('\\n')[0]!.replace(/\.$/, '') || v.country !== e.f('country')
  })
  check(drift.length === 0 && Object.keys(EN_FALLBACK_FIELDS).length === 5, 'crisis-en-fallback-strings.ts: the 5 entries equal src/data/helplines.ts', drift)
  const en = JSON.parse(readFileSync(root('src/messages/en.json'), 'utf-8')) as { countries: Record<string, string> }
  check(Object.entries(EN_COUNTRY_NAMES).every(([c, n]) => en.countries[c] === n), 'the country names equal the en bundle')
  check(EN_FALLBACK_IDS.bn['self-harm'].join() === 'bn-emergency-999,bn-kaan-pete-roi' && EN_FALLBACK_IDS.bn.abuse.join() === 'bd-mowca-109,bn-emergency-999' && EN_FALLBACK_IDS.fa['self-harm'].join() === 'fa-emergency-123,fa-social-emergency-1480' && EN_FALLBACK_IDS.fa.abuse.join() === 'fa-emergency-123', 'the block lines: bn self-harm 999 + KPR, bn abuse 109 + 999, fa self-harm 123 + 1480, fa abuse 123 (24/7 first)')

  console.log('\n=== A6. MCP routing and blocks ===')
  for (const [key, text] of Object.entries(PINNED)) {
    const [l, type] = key.split(' ') as ['bn' | 'fa', 'self-harm' | 'abuse']
    const b = distressBlockFor({ level: 'hard', crisisType: type, keywordLanguages: [l] }, 'en') as { locale?: string; text?: string; translation_note?: string; crisis_type?: string }
    check(b.locale === l && b.crisis_type === type && b.text === text && b.translation_note === undefined, `${key}: the ${l} text, locale ${l}, no translation_note (WO#490)`, b.text)
  }
  check(Object.values(PINNED).every((t) => !/—/.test(t) && !/\d[ -]\d/.test(t)), 'no em dash; every number is contiguous digits')
  const enAbuse = distressBlockFor({ level: 'hard', crisisType: 'abuse' }, 'en')!.text
  check(enAbuse.startsWith(ABUSE_SENTENCE) && !Object.values(PINNED).some((t) => t.includes(ABUSE_SENTENCE)), 'the en abuse block keeps its sentence; no bn or fa block carries English text (WO#490)')
  // Routing rules.
  check(crisisLocaleFor({ level: 'hard', crisisType: 'self-harm', keywordLanguages: ['en', 'bn'] }, 'en') === 'bn', 'English plus Bengali, no locale: bn')
  check(crisisLocaleFor({ level: 'hard', crisisType: 'self-harm', keywordLanguages: ['fa', 'ur'] }, 'en') === 'en', 'Persian plus Urdu, no locale: en (two languages)')
  check(crisisLocaleFor({ level: 'hard', crisisType: 'abuse', keywordLanguages: ['fa'] }, 'ur') === 'ur', 'an explicit locale wins over a fa keyword')
  // Every bn and fa keyword alone serves its own block.
  for (const [l, type, list] of [['fa', 'self-harm', SELF_HARM_KEYWORDS_FA], ['bn', 'self-harm', SELF_HARM_KEYWORDS_BN], ['fa', 'abuse', ABUSE_KEYWORDS_FA], ['bn', 'abuse', ABUSE_KEYWORDS_BN]] as const) {
    const wrong = list.filter((k) => {
      const h = evaluateDistress(k)
      const b = distressBlockFor(h, 'en') as { locale?: string; text?: string }
      return h.level !== 'hard' || h.crisisType !== type || b.locale !== l || b.text !== PINNED[`${l} ${type}`]
    })
    check(wrong.length === 0, `${l} ${type}: all ${list.length} keywords, alone with no locale, serve the ${l} ${type} block`, wrong)
  }
  // Through the tools.
  globalThis.fetch = (async () => new Response('{"code":404}', { status: 404 })) as typeof fetch
  const { getDuaHandler } = await import('../src/tools/get-dua.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  type R = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; crisis_resource?: { locale?: string; text?: string; translation_note?: string; level?: string } }
  const tools: Array<[string, (q: string, locale?: string) => Promise<unknown>]> = [
    ['get_dua', (q, locale) => getDuaHandler({ context: q, ...(locale ? { locale } : {}) } as never)],
    ['find_verses', (q, locale) => findVersesHandler({ query: q, ...(locale ? { locale } : {}) } as never)],
    ['get_name_of_allah', (q, locale) => getNameOfAllahHandler({ name: q, ...(locale ? { locale } : {}) } as never)],
  ]
  const cases: Array<['bn' | 'fa', 'self-harm' | 'abuse', string]> = [
    ['bn', 'self-harm', BN_SELF[0]!], ['bn', 'abuse', BN_ABUSE[1]!], ['fa', 'self-harm', FA_SELF[0]!], ['fa', 'abuse', fa([])],
  ]
  for (const [name, call] of tools) {
    for (const [l, type, q] of cases) {
      const r = (await call(q)) as R
      const rules = r._sakina_meta.llm_directives.CRITICAL_RULES
      const i = rules.indexOf(CRISIS_ANTI_TRANSLATION)
      check(r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.locale === l && r.crisis_resource.text === PINNED[`${l} ${type}`] && r.crisis_resource.translation_note === undefined && i >= 0 && !rules.includes(ENGLISH_FALLBACK_GUARD), `${name}, ${l} ${type}, no locale: the ${l} block; CRITICAL_RULES carry the anti-translation line and no English-fallback guard (WO#490)`)
      const explicit = (await call(q, 'id')) as R
      check(explicit.crisis_resource?.locale === 'id', `${name}, ${l} ${type}, locale id: the explicit locale wins`)
    }
    const soft = (await call(A3[2]!)) as R
    if (name === 'get_dua') check(soft.crisis_resource?.level === 'soft' && soft.crisis_resource.locale === 'fa' && soft.crisis_resource.text === bnFaText('fa', 'soft') && soft._sakina_meta.llm_directives.CRITICAL_RULES.includes(CRISIS_ANTI_TRANSLATION) && !soft._sakina_meta.llm_directives.CRITICAL_RULES.includes(ENGLISH_FALLBACK_GUARD), `${name}, fa soft phrase: the fa soft block, the anti-translation line, no English-fallback guard`)
    const enCase = (await call('I want to kill myself')) as R
    check(enCase.crisis_resource?.locale === 'en' && !enCase._sakina_meta.llm_directives.CRITICAL_RULES.includes(ENGLISH_FALLBACK_GUARD) && enCase.crisis_resource.translation_note === undefined, `${name}, English crisis: the en block, no note, no guard (unchanged)`)
  }

  console.log('\n=== A7. false positives: 20 ordinary sentences ===')
  // Ordinary sentences, several sharing words with the new rules (a relation, a fear verb,
  // "از", "মন খুব", "حالم"). English glosses beside each.
  const ORDINARY: Array<[string, string]> = [
    ['আজ আবহাওয়া খুব সুন্দর', 'the weather is lovely today'],
    ['আমার বাবা আজ বাজারে গেছেন', 'my father went to the market today'],
    ['আমার স্বামী খুব ভালো মানুষ', 'my husband is a very good man'],
    ['ভাইরাসকে ভয় লাগে', 'I am afraid of the virus'],
    ['অন্ধকারে আমার ভয় লাগে', 'I am afraid in the dark'],
    ['ভাই আমাকে একটা বই দিয়েছে', 'my brother gave me a book'],
    ['আজ মন খুব ভালো', 'I am in a very good mood today'],
    ['আমরা রমজানে রোজা রাখি', 'we fast in Ramadan'],
    ['শাশুড়ি আজ রান্না করেছেন', 'my mother-in-law cooked today'],
    ['পরীক্ষার আগে একটু ভয় করে', 'I am a little afraid before exams'],
    ['امروز هوا خیلی خوب است', 'the weather is very good today'],
    ['از پدرم یک کتاب گرفتم', 'I got a book from my father'],
    ['من از تاریکی میترسم', 'I am afraid of the dark'],
    ['شوهرم امروز به خانه آمد', 'my husband came home today'],
    ['از برادرم ممنونم', 'I am grateful to my brother'],
    ['دلم برای مادرم تنگ شده', 'I miss my mother'],
    ['حالم خوبه', 'I am well'],
    ['خیلی خوشحالم', 'I am very happy'],
    ['ما در رمضان روزه میگیریم', 'we fast in Ramadan'],
    ['از زنم خیلی ممنونم', 'I am very grateful to my wife'],
  ]
  const fp = ORDINARY.filter(([s]) => detectCrisis(s).isCrisis || evaluateDistress(s).level !== 'none')
  check(ORDINARY.length === 20 && fp.length === 0, `none of the ${ORDINARY.length} ordinary sentences (10 bn, 10 fa) fires crisis or soft`, fp)

  console.log('\n=== C. find_verses synonym map ===')
  type FV = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] }; presentation_contract: Record<string, unknown> }; content: { matched_themes?: Array<{ theme: string }>; verses?: Array<{ teach?: unknown }> }; crisis_resource?: { level?: string; locale?: string } }
  const fv = async (q: string, locale?: string) => (await findVersesHandler({ query: q, ...(locale ? { locale } : {}) } as never)) as unknown as FV
  const routed = (q: string) => matchThemes(q).map((m) => m.theme)
  const shipped = E6_ROWS.filter((r) => r.status === 'shipped')
  const notRouted = E6_ROWS.filter((r) => r.status === 'not_found' || r.status === 'excluded')
  const shippedTerms = shipped.flatMap((r) => r.terms.map((term) => [term, r.theme!] as const))
  // The ruling's 57 terms less "sadness", which routed to grief before WO#488 (covered): 9 + 12 + 5 + 16 + 3 + 5 + 2 + 4.
  check(shippedTerms.length === 56 && notRouted.flatMap((r) => r.terms).length === 75, `the fixtures: ${shippedTerms.length} shipped terms, ${notRouted.flatMap((r) => r.terms).length} excluded or not_found terms`)
  const wrongRoute = shippedTerms.filter(([term, theme]) => JSON.stringify(routed(term)) !== JSON.stringify([theme]))
  check(wrongRoute.length === 0, `every shipped term (${shippedTerms.length}) routes to its theme, and only that one`, wrongRoute)
  for (const r of E6_ROWS.filter((x) => x.status === 'covered')) check(r.terms.every((term) => routed(term)[0] === r.theme), `covered before WO#488, unchanged: ${r.terms.join(', ')} -> ${r.theme}`)
  for (const r of notRouted) {
    const wrong = r.terms.filter((term) => routed(term).length !== 0)
    check(wrong.length === 0, `${r.status} (${r.note ?? r.proposed}): ${r.terms.join(', ')} return no theme`, wrong)
  }
  for (const q of NOT_FOUND_PHRASES) check(routed(q).length === 0 && routed(q.toUpperCase()).length === 0, `"${q}" (phrase level): no theme`)
  // Nothing unruled is in the map: its keys are main's 76 plus the shipped single words.
  const shippedWords = shippedTerms.map(([term]) => normalisePhrase(term)).filter((w) => !w.includes(' '))
  const added = Object.keys(THEME_SYNONYMS).slice(76)
  check(Object.keys(THEME_SYNONYMS).length === 76 + added.length && added.every((k) => shippedWords.includes(k)) && shippedWords.every((w) => w === 'jumuah' || added.includes(w)), `THEME_SYNONYMS is main's 76 keys plus the ${added.length} shipped single words, nothing else`, added.filter((k) => !shippedWords.includes(k)))
  const phrases = THEME_PHRASES.filter((p) => p.theme).map((p) => p.phrase)
  check(JSON.stringify([...phrases].sort()) === JSON.stringify(shippedTerms.map(([term]) => term).filter((term) => term.includes(' ')).sort()), `THEME_PHRASES holds exactly the ${phrases.length} shipped multi-word terms, plus the two not_found phrases`, phrases)
  const excludedTerms = notRouted.flatMap((r) => r.terms.map(normalisePhrase))
  check(!excludedTerms.some((term) => term in THEME_SYNONYMS || THEME_PHRASES.some((p) => p.phrase === term)), 'no excluded or not_found term is a key or a phrase')
  // The phrase level runs first.
  check(JSON.stringify(routed('loss of faith and hope')) === '["hope"]' && JSON.stringify(routed('fear of Allah, fear of the future')) === '["anxiety"]', 'a not_found phrase consumes only its own words: other words still route')
  check(JSON.stringify(routed('give up')) === '["hope"]' && JSON.stringify(routed('giving up')) === '["encouragement"]' && routed('give').length === 0 && routed('up').length === 0, '"give up" is hope and "giving up" encouragement; their words alone route nowhere')
  check(JSON.stringify(routed('death of a child')) === '["grief"]' && routed('death').length === 0 && routed('child').length === 0, '"death of a child" is grief; "death" and "child" alone are not_found')
  check(JSON.stringify(routed("Jumu'ah khutbah")) === '["friday"]' && JSON.stringify(routed('Thank you Allah')) === '["gratitude"]', 'case and the apostrophe fold before the phrase level')
  // Through the tool.
  for (const q of ['funeral', 'death of a child', 'crying']) {
    const r = await fv(q)
    check(r._sakina_meta.content_type === 'verse_collection' && r.content.matched_themes?.[0]?.theme === 'grief' && r.crisis_resource?.level === 'soft' && (r.content.verses ?? []).every((v) => v.teach === undefined) && r._sakina_meta.presentation_contract.teach === undefined, `find_verses "${q}": grief verses, the soft support note, teach withheld`)
  }
  const griefUr = await fv('widow', 'ur')
  check(griefUr.crisis_resource?.level === 'soft' && griefUr.crisis_resource.locale === 'ur', 'find_verses "widow", locale ur: the soft note in the request locale')
  const anger = await fv('anger')
  check(anger.content.matched_themes?.[0]?.theme === 'patience' && anger.crisis_resource === undefined, 'find_verses "anger": patience, no soft note (not a grief route)')
  for (const q of [...NOT_FOUND_PHRASES, 'death', 'down', 'low', 'lonely', 'money', 'exam']) {
    const r = await fv(q)
    check(r._sakina_meta.content_type === 'not_found', `find_verses "${q}": not_found`)
  }
  const dep = await fv('depression')
  check(dep._sakina_meta.content_type === 'not_found' && dep.crisis_resource?.level === 'soft', 'find_verses "depression": not_found, and the soft block stays')
  const abuse = await fv('abuse')
  check(abuse._sakina_meta.content_type === 'not_found' && abuse.crisis_resource === undefined, 'find_verses "abuse": not_found with no block, unchanged (E.5)')

  console.log('\n=== #564 Gem 10 armour ===')
  {
    // 1. The Founder verification, recorded like US_988_FOUNDER_VERIFIED.
    const v = BN_FA_LINES_FOUNDER_VERIFIED
    check(US_988_FOUNDER_VERIFIED === false && v.verifiedBy === 'Founder' && v.date === '2026-10-22', '1. the record names the Founder and 22 Oct 2026 (beside US_988_FOUNDER_VERIFIED, which stays false)')
    check(JSON.stringify(v.lines) === JSON.stringify({ 'bn-emergency-999': '999', 'bd-mowca-109': '109', 'bn-kaan-pete-roi': '09612119911', 'fa-emergency-123': '123', 'fa-social-emergency-1480': '1480' }), '1. exactly the five lines the Founder verified: BD 999, BD 109, Kaan Pete Roi 09612119911, IR 123, IR 1480')
    const ids = [...new Set(Object.values(EN_FALLBACK_IDS).flatMap((b) => [...b['self-harm'], ...b.abuse]))]
    check(ids.every((id) => (v.lines as Record<string, string>)[id] === EN_FALLBACK_FIELDS[id]!.phone.replace(/[ -]/g, '')), '1. every line a bn or fa block lists is Founder-verified, with the same digits as helplines.ts')
    // Control: an unverified number cannot be served. WO#490: the check runs on the
    // translated text when the module loads (verifyBnFaLines); a changed number throws.
    let threw = ''
    try { verifyBnFaLines('bn', 'abuse', PINNED['bn abuse'].replace(': 109 (', ': 1090 (')) } catch (e) { threw = String(e) }
    let ok = true
    try { verifyBnFaLines('bn', 'abuse', PINNED['bn abuse']) } catch { ok = false }
    check(threw.includes('the Founder-verified bd-mowca-109 is 109') && ok, '1. control: a changed number (109 -> 1090) in the text throws; the served text passes')

    // 2. The publish guard (check h), scoped to crisis_resource.text.
    check(JSON.stringify(REQUIRED_LINES) === JSON.stringify({ 'bn/self-harm': ['999', '09612119911'], 'bn/abuse': ['109', '999'], 'fa/self-harm': ['123', '1480'], 'fa/abuse': ['123'] }), '2. the guard requires bn 999, 109, 09612119911 and fa 123, 1480, per block')
    for (const [key, expected] of Object.entries(REQUIRED_LINES) as Array<[string, string[]]>) {
      const [l, type] = key.split('/') as ['bn' | 'fa', 'self-harm' | 'abuse']
      const b = distressBlockFor({ level: 'hard', crisisType: type, keywordLanguages: [l] }, 'en') as { text: string }
      check(requiredLineProblems(b.text, expected).length === 0, `2. ${key}: the block text carries exactly ${expected.join(' and ')}`, requiredLineProblems(b.text, expected))
    }
    const bnSelf = PINNED['bn self-harm']
    const controls: Array<[string, string, string[]]> = [
      ['a typo (09612119911 -> 09612119191)', bnSelf.replace('09612119911', '09612119191'), REQUIRED_LINES['bn/self-harm']],
      ['a missing line (109 removed)', PINNED['bn abuse'].split('\n').filter((x) => !x.includes(': 109 (')).join('\n'), REQUIRED_LINES['bn/abuse']],
      ['a digit dropped (1480 -> 148)', plain(PINNED['fa self-harm']).replace(': 1480 (', ': 148 ('), REQUIRED_LINES['fa/self-harm']],
      ['separators kept (09612-119911)', bnSelf.replace('09612119911', '09612-119911'), REQUIRED_LINES['bn/self-harm']],
      ['an extra line', `${PINNED['fa abuse']}\nOther line (Iran): 1234 (24/7)`, REQUIRED_LINES['fa/abuse']],
    ]
    for (const [label, text, expected] of controls) check(requiredLineProblems(text, expected).length > 0, `2. negative control, ${label}: the guard fails`, requiredLineProblems(text, expected))
    // Scope: 1480 elsewhere in a payload (a Hijri year) does not satisfy it; only the text node counts.
    const noLine = plain(PINNED['fa self-harm']).split('\n').filter((x) => !x.includes(': 1480 (')).join('\n')
    const payload = { crisis_resource: { text: noLine }, content: { hijri_year: 1480, note: 'Muharram 1480' } }
    check(requiredLineProblems(payload.crisis_resource.text, REQUIRED_LINES['fa/self-harm']).join() === 'missing 1480' && JSON.stringify(payload).includes('1480'), '2. scope: with 1480 only outside the text node (a Hijri year), the guard still reports "missing 1480"')
    check(JSON.stringify(lineNumbersIn(PINNED['fa self-harm'])) === '["123","1480"]', '2. only the helpline lines\' numbers are read: hours ("24/7", "8:00 to 24:00") are not')
    // The guard script itself fails on a build that serves a typo (a copy of dist with one digit changed).
    {
      const HERE = path.dirname(fileURLToPath(import.meta.url))
      const PKG = path.resolve(HERE, '..')
      const tmp = mkdtempSync(path.join(PKG, '.wo564-guard-'))
      try {
        for (const d of ['data', 'dist', '.mcp', path.join('src', 'safety', '_synced')]) cpSync(path.join(PKG, d), path.join(tmp, d), { recursive: true })
        // WO#490: the number is in the fields, the Founder record and the translated text.
        for (const f of ['crisis-en-fallback-strings.js', 'crisis-text-bn-fa.js', 'crisis-bn-fa-strings.js']) {
          const p = path.join(tmp, 'dist', 'safety', f)
          // The field (09612-119911) and the Founder record (09612119911) both changed, as a mistaken edit to both would.
          writeFileSync(p, readFileSync(p, 'utf-8').split('09612119911').join('09612119191').split('09612-119911').join('09612-119191'))
        }
        const good = spawnSync(process.execPath, [path.join(HERE, 'publish-guards.mjs'), '--root', PKG], { encoding: 'utf-8' })
        const bad = spawnSync(process.execPath, [path.join(HERE, 'publish-guards.mjs'), '--root', tmp], { encoding: 'utf-8' })
        check(good.status === 0 && /h\. bn\/fa Founder-verified lines: 0/.test(good.stdout), '2. publish-guards on the real build: check h runs and passes', good.stdout.slice(-300))
        check(bad.status === 1 && bad.stdout.includes('HIT [h. bn/fa Founder-verified lines] crisis_resource hard/self-harm/bn text: missing 09612119911') && bad.stdout.includes('unexpected 09612119191'), '2. negative control: publish-guards on a build with the Kaan Pete Roi typo exits 1 on check h', bad.stdout.slice(-400))
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }

    // 3. bn and fa are keyword-routed only: every tool schema rejects them as a locale.
    const tools: Array<[string, z.ZodRawShape, Record<string, unknown>]> = [
      ['get_quran_verse', getQuranVerseShape, { surah: 1, ayah: 1 }],
      ['get_dua', getDuaShape, { context: 'travel' }],
      ['get_name_of_allah', getNameOfAllahShape, { number: 1 }],
      ['find_verses', findVersesShape, { query: 'patience' }],
    ]
    for (const [name, shape, base] of tools) {
      const schema = z.object(shape)
      const rejected = (['bn', 'fa'] as const).every((locale) => !schema.safeParse({ ...base, locale }).success)
      check(rejected && schema.safeParse({ ...base, locale: 'en' }).success && schema.safeParse(base).success, `3. ${name}: locale "bn" and "fa" are rejected by the schema (control: "en" and no locale pass)`)
    }
    const serverSrc = readFileSync(root('mcp-server/src/server.ts'), 'utf-8')
    const enums = [...serverSrc.matchAll(/enum: \[([^\]]*)\]/g)].map((m) => m[1]!).filter((e) => e.includes("'en'"))
    check(enums.length === 4 && enums.every((e) => !/'bn'|'fa'/.test(e)), '3. the server card\'s four locale enums list no bn or fa', enums)
  }

  console.log(`\nWO#488: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
