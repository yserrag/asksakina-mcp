/**
 * WO#495 (MCP 2.5.0): the authored text the two parked journeys need, built by
 * script from the app's own seed modules and the Gems' rulings
 * (docs/wo495-architect.md; drafts docs/wo492-journeys-part1..4.md).
 *
 * Nothing here is typed: every passage is read from a seed module, cut where
 * the approved draft cut it, and joined as the draft joined it. The ruled
 * replacements are read from docs/wo495-architect.md by exact quotation. The
 * Arabic of the J3 formulae is Gem 2's bytes (docs/wo495-gem2-alef.json),
 * checked against the seed. A seed verse quotation that is not Pickthall's
 * (112:1) is replaced by the scripture module's Pickthall, as the
 * drafts marked it.
 *
 * One mechanical rule the Builder applied: an em dash the draft struck
 * ("Gem 1 punctuates") becomes a comma. Listed in the Gem 10 brief.
 *
 * Writes src/contracts/learn-content.ts. `--check` (prepublishOnly) fails if
 * the committed file differs from what the seeds give.
 *
 * It imports the app's seed modules, which reach React and browser code, so
 * tsconfig.json excludes it from `tsc --noEmit`; tsx runs it untyped.
 *
 *   npx tsx scripts/wo495-learn-content.ts [--check]
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { whatIsIslam } from '../../src/data/learn/pages/what-is-islam.js'
import { howToMakeWudu } from '../../src/data/learn/pages/how-to-make-wudu.js'
import { howToPray } from '../../src/data/learn/pages/how-to-pray.js'
import { newMuslimGuide } from '../../src/data/learn/pages/new-muslim-guide.js'
import { getModule } from '../../src/lib/data/revert-modules.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const MAIN = path.resolve(ROOT, '..')
const OUT = path.join(ROOT, 'src', 'contracts', 'learn-content.ts')
const CHECK = process.argv.includes('--check')

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const fail = (m: string): never => {
  throw new Error(`wo495-learn-content: ${m}`)
}

// ─── sources ──────────────────────────────────────────────────────────

type Section = { kind: string; text?: string; items?: string[]; arabic?: string; transliteration?: string; translation?: string; source?: string }
const sections = (p: unknown) => (p as { sections: Section[] }).sections
const at = (p: unknown, i: number, kind: string, starts: string): Section => {
  const s = sections(p)[i]
  if (!s || s.kind !== kind || !(s.text ?? s.translation ?? s.items?.[0] ?? '').startsWith(starts)) fail(`seed moved: ${kind} "${starts}" at ${i}`)
  return s!
}
type RSection = { type: string; title: string; body?: string; context?: string; steps?: Array<{ instruction: string }>; source?: Record<string, string> }
const rsec = (id: string, title: string): RSection => {
  const m = getModule(id) as unknown as { sections: RSection[] } | undefined
  const s = m?.sections.find((x) => x.title === title)
  return s ?? fail(`revert module ${id}: no section "${title}"`)
}

/** The Architect's record: a ruled replacement is taken by exact quotation. */
const RECORD = readFileSync(path.join(MAIN, 'docs', 'wo495-architect.md'), 'utf-8')
const ruled = (startsWith: string): string => {
  const m = [...RECORD.matchAll(/"([^"\n]+)"/g)].map((x) => x[1]!).filter((q) => q.startsWith(startsWith))
  if (m.length < 1) fail(`no ruling quotation starting "${startsWith}"`)
  if (new Set(m).size > 1) fail(`two different ruling quotations start "${startsWith}"`)
  return m[0]!
}

const PK = (s: number, a: number): string => {
  const d = JSON.parse(readFileSync(path.join(MAIN, 'public', 'quran', 'en.pickthall', `${s}.json`), 'utf-8')) as { verses: Array<{ verse_number: number; translations: Array<{ text: string }> }> }
  return d.verses.find((v) => v.verse_number === a)?.translations[0]?.text ?? fail(`no Pickthall ${s}:${a}`)
}

/** Gem 2's bytes for the J3 formulae (WO#495 Gem 2 follow-up item 3). */
const ALEF = JSON.parse(readFileSync(path.join(MAIN, 'docs', 'wo495-gem2-alef.json'), 'utf-8')) as Array<{ name: string; before: string; after: string; sha256_after: string; positions_1based: number[] }>
const formula = (name: string, seedArabic: string): string => {
  const r = ALEF.find((x) => x.name.startsWith(name)) ?? fail(`no Gem 2 alef row "${name}"`)
  // The seed carries the bytes before the change (main) or after it (once WO#494's U+0671 change lands).
  if (seedArabic !== r.before && seedArabic !== r.after) fail(`${name}: seed Arabic is neither Gem 2's before nor after bytes`)
  if (sha(r.after) !== r.sha256_after) fail(`${name}: Gem 2's after bytes do not match their sha256`)
  return r.after
}

/** A struck em dash: the draft cut it and Gem 1 punctuates; the Builder used a comma. */
const unDash = (s: string) => s.replace(/ — /g, ', ')
const numbered = (items: string[]) => items.map((t, i) => `${i + 1}. ${t}`).join('\n')

// ─── J1: sakina://learn/what-muslims-believe ──────────────────────────

const sixHeading = at(whatIsIslam, 2, 'heading', 'The Six Articles of Faith').text!
const unseen = rsec('the-unseen', 'The Six Pillars of Faith (Iman)').body!
const jibreel = (() => {
  const from = unseen.indexOf('In the famous "Hadith of Jibreel"')
  const to = unseen.indexOf('six things:', from)
  if (from < 0 || to < 0) fail('the-unseen: the Hadith of Jibreel sentence moved')
  return unseen.slice(from, to + 'six things:'.length)
})()
const sixItems = at(whatIsIslam, 4, 'list', 'One God (Allah)').items!.map((t, i) => {
  // J1 item 2: item 3's second sentence (a claim about other scriptures) is cut (Gem 7, Gem 10).
  const cut = i === 2 ? t.replace(/ Muslims believe earlier scriptures were authentic in their original form, and the Quran is the final, unchanged revelation\.$/, '') : t
  if (i === 2 && cut === t) fail('six articles item 3: the earlier-scriptures sentence moved')
  return unDash(cut)
})
const q2_285 = PK(2, 285)
const q2_177 = PK(2, 177)

const pillarsHeading = at(whatIsIslam, 5, 'heading', 'The Five Pillars of Practice').text!
const pillarsIntro = at(whatIsIslam, 6, 'paragraph', 'Belief becomes lived faith').text!
// The ruled zakat line, punctuated like the other four pillars (Architect, 24 Oct, #580 ruling 3).
const ZAKAT_RULED = ruled('3. Zakat ').replace(/^3\. /, '')
const ZAKAT = ZAKAT_RULED.replace(/^Zakat an /, 'Zakat, an ').replace(/([^.])$/, '$1.')
if (ZAKAT === ZAKAT_RULED || !/^Zakat, an .*\.$/.test(ZAKAT)) fail('zakat line: the ruled text moved')
const pillarItems = at(whatIsIslam, 7, 'list', 'Shahada').items!.map((t, i) => (i === 2 ? ZAKAT : unDash(t)))

const differHeading = at(whatIsIslam, 15, 'heading', 'Sunni and Shia').text!
const FOUR_SCHOOLS = ruled("AskSakina's fiqh content draws on these four schools.")
const differ1 = unDash(at(whatIsIslam, 16, 'paragraph', 'Within a generation').text!)
const differ2 = at(whatIsIslam, 17, 'paragraph', 'Within Sunni Islam').text!.replace(/AskSakina honours all four\.$/, FOUR_SCHOOLS)
if (!differ2.endsWith(FOUR_SCHOOLS)) fail('Sunni and Shia: "AskSakina honours all four." moved')
const HARD = ruled('Encountering hard questions')

const WHAT_MUSLIMS_BELIEVE = [
  `## ${sixHeading}`,
  jibreel,
  numbered(sixItems),
  `"${q2_285}" (Quran 2:285)`,
  `"${q2_177}" (Quran 2:177)`,
  `## ${pillarsHeading}`,
  pillarsIntro,
  numbered(pillarItems),
  `## ${differHeading}`,
  `${differ1} ${differ2}`,
  '## Hard questions',
  HARD,
].join('\n\n')

// ─── J3: sakina://learn/first-steps#… ─────────────────────────────────

// #shahada: the alternative seed (new-muslim-guide.ts:101), Gem 2's Arabic, the ruled source line.
const shahadaBlock = sections(newMuslimGuide).find((s) => s.kind === 'dua' && s.source === 'The first pillar of Islam.') ?? fail('new-muslim-guide: shahada block moved')
const JIBRIL_SOURCE = ruled('(Hadith of Jibril')
const SHAHADA = [
  formula('Shahada', shahadaBlock.arabic!),
  `Transliteration: ${shahadaBlock.transliteration}`,
  `Translation: "${shahadaBlock.translation}"`,
  `Source: ${shahadaBlock.source} ${JIBRIL_SOURCE}`,
].join('\n\n')

// #forgiven: Gem 6's sentence naming 8:38, the verse (Pickthall), then the seed's context (its list cut).
const NAMING_838 = ruled('The Quran reassures those who embrace Islam')
const changes = rsec('shahada-meaning', 'What Changes Now')
const freshStart = (() => {
  const c = changes.context!
  const end = c.indexOf('This is your fresh start.')
  if (end < 0) fail('shahada-meaning: "This is your fresh start." moved')
  return c.slice(0, end + 'This is your fresh start.'.length)
})()
const src121 = changes.source!
if (src121.collection !== 'Sahih Muslim' || src121.reference !== '121') fail('shahada-meaning: the hadith source moved')
const FORGIVEN = [NAMING_838, `"${PK(8, 38)}" (Quran 8:38)`, freshStart, `(${src121.collection} ${src121.reference}, ${src121.grading})`].join('\n\n')

// #wudu: how-to-make-wudu.ts, the four obligatory parts to the end of the recommended steps.
const WUDU = [
  `## ${at(howToMakeWudu, 2, 'heading', 'The Four Obligatory Parts').text}`,
  at(howToMakeWudu, 3, 'paragraph', 'The Quran names four actions').text!,
  numbered(at(howToMakeWudu, 4, 'list', 'Wash the face').items!.map(unDash)),
  at(howToMakeWudu, 5, 'paragraph', "Note: The Shafi'i").text!,
  `## ${at(howToMakeWudu, 6, 'heading', 'The Recommended Steps').text}`,
  at(howToMakeWudu, 7, 'paragraph', 'The Prophet (peace be upon him) taught a fuller').text!,
  numbered(at(howToMakeWudu, 8, 'list', 'Begin in the name of Allah').items!.map(unDash)),
].join('\n\n')

// #first-prayer: how-to-pray.ts (the five prayers named once, one rakah without the Al-Fatiha
// block, the close, where schools differ), first-prayer's second rakat, and Gem 6's zakah sentence.
const dua = (i: number, starts: string, name: string) => {
  const s = at(howToPray, i, 'dua', starts)
  return `${formula(name, s.arabic!)}\n\n${s.transliteration}: "${s.translation}" (${unDash(s.source!).replace(/\.$/, '')}.)`
}
const secondRakat = rsec('first-prayer', 'The Second Rakat').steps![0]!.instruction
const ZAKAH_LATER = ruled('Muslims believe that establishing the daily prayer')
const FIRST_PRAYER = [
  `## ${at(howToPray, 4, 'heading', 'The Five Daily Prayers').text}`,
  at(howToPray, 5, 'list', 'Fajr').items!.map((t) => `- ${unDash(t)}`).join('\n'),
  `## ${at(howToPray, 7, 'heading', 'Step-by-Step: One Rakah').text}`,
  `### ${at(howToPray, 8, 'heading', '1. Intention').text}`,
  unDash(at(howToPray, 9, 'paragraph', 'Make the intention').text!),
  `### ${at(howToPray, 10, 'heading', '2. The opening').text}`,
  at(howToPray, 11, 'paragraph', 'Stand facing the qibla').text!,
  dua(12, 'Allah is the Greatest', 'Allāhu Akbar'),
  `### ${at(howToPray, 13, 'heading', '3. Recite Surah Al-Fatihah').text}`,
  // The draft cut the Al-Fatiha block here, so the sentence ends at "in Arabic." (Architect, 24 Oct, #580 ruling 3).
  (() => {
    const t = unDash(at(howToPray, 14, 'paragraph', 'Place your hands').text!)
    if (!t.endsWith('the Quran in Arabic:')) fail('first-prayer: "...the Quran in Arabic:" moved')
    return `${t.slice(0, -1)}.`
  })(),
  unDash(at(howToPray, 16, 'paragraph', 'Then recite a short surah').text!),
  `### ${at(howToPray, 17, 'heading', '4. Bowing').text}`,
  at(howToPray, 18, 'paragraph', 'Say "Allāhu Akbar" and bow').text!,
  dua(19, 'Glory be to my Lord, the Magnificent', 'Subḥāna rabbiya\'l-ʿaẓīm'),
  at(howToPray, 20, 'paragraph', 'Stand back up saying').text!,
  `### ${unDash(at(howToPray, 21, 'heading', '5. Prostration').text!)}`,
  at(howToPray, 22, 'paragraph', 'Say "Allāhu Akbar" and lower').text!,
  dua(23, 'Glory be to my Lord, the Most High', 'Subḥāna rabbiya\'l-aʿlā'),
  unDash(at(howToPray, 24, 'paragraph', 'Sit briefly between').text!),
  secondRakat,
  `## ${at(howToPray, 25, 'heading', 'After the Final Rakah').text}`,
  unDash(at(howToPray, 26, 'paragraph', 'Sit with your right foot').text!),
  dua(27, 'Peace be upon you', 'As-salāmu'),
  `## ${at(howToPray, 29, 'heading', 'Where Schools Differ').text}`,
  unDash(at(howToPray, 30, 'paragraph', 'The four mainstream Sunni schools').text!),
  at(howToPray, 31, 'paragraph', "Say 'Allahu Akbar' at every transition").text!,
  ZAKAH_LATER,
].join('\n\n')

// #community: finding-community (fear sentence cut; the "two images" sentence and the
// "Shop Around" tip replaced as ruled), then Gem 3's scholar referral.
const pillar = rsec('finding-community', 'Community Is a Pillar') as unknown as { message?: string; body?: string; text?: string }
const pillarText = (pillar.message ?? pillar.body ?? pillar.text ?? fail('finding-community: "Community Is a Pillar" has no text')).replace(/ Loneliness is the #1 danger for a new Muslim\./, '')
if (/#1 danger/.test(pillarText)) fail('finding-community: the fear sentence was not cut')
const together = rsec('finding-community', 'The Power of Being Together')
const ONE_IMAGE = ruled('The Prophet (peace be upon him) described the bond between believers with a powerful image.')
const togetherText = together.context!.replace(/^The Prophet \(peace be upon him\) described the bond between believers with two powerful images\./, ONE_IMAGE)
if (togetherText === together.context) fail('finding-community: the "two powerful images" sentence moved')
const s6026 = together.source!
const findPeople = rsec('finding-community', 'How to Actually Find Your People')
const MOSQUE = ruled('Not every mosque will be the right environment')
// The whole "Shop Around" tip, its label included, is the passage Gem 6's text replaces.
const tips = ((findPeople as unknown as { tips?: string[] }).tips ?? fail('finding-community: no tips')).map((t) => (/^Shop Around:/.test(t) ? MOSQUE : t))
if (!tips.includes(MOSQUE)) fail('finding-community: the "Shop Around" tip moved')
const SCHOLAR = ruled('For deeply personal questions, family matters')
const COMMUNITY = [
  pillarText,
  `${togetherText}\n\n"${s6026.text}" (${s6026.collection} ${s6026.reference}, ${s6026.grading})`,
  findPeople.body ?? fail('finding-community: no tips intro'),
  tips.map((t) => `- ${t}`).join('\n'),
  SCHOLAR,
].join('\n\n')

// ─── Field 5 (revert) notes: J3 item 8 ────────────────────────────────

// The Architect's fix, exactly as sent (24 Oct, #580 ruling 3): the em dash becomes a comma and
// Surah Al-Ikhlas is glossed (Gem 7's note). Gem 7's Tawheed gloss is applied to the Tawheed
// paragraph below.
const TAWHEED_GLOSS = 'Tawheed, the oneness of Allah'
const EASIEST = 'Here is the easiest one, Surah Al-Ikhlas (chapter 112 of the Quran):'
const shortSurah = rsec('first-prayer', 'Recite a Short Surah').context!.replace(/Here is the easiest one — Surah Al-Ikhlas:/, EASIEST)
if (!shortSurah.includes(EASIEST) || /—/.test(shortSurah)) fail('Recite a Short Surah: the em dash moved')
const meaning = rsec('shahada-meaning', 'What the Shahada Means').body!
const tawheedPara = (() => {
  const p = (meaning.split('\n\n').find((x) => x.startsWith('The First Part (Tawheed):')) ?? fail('shahada-meaning: the Tawheed paragraph moved')).replace('The First Part (Tawheed):', `The First Part (${TAWHEED_GLOSS}):`)
  // The seed's 112:1 quotation is not Pickthall's: the module's Pickthall replaces it (drafted [PICKTHALL 112:1]).
  const pk = `"${PK(112, 1)}" (Quran 112:1)`
  const out = p.replace(/"Say, 'He is Allah, \[who is\] One\.'"(?: \(Quran 112:1\))?/, pk)
  if (!out.includes(pk)) fail('Tawheed paragraph: the 112:1 quotation moved')
  return out
})()
// J3 item 8 (Architect correction): al-Albani grades Sunan Abi Dawud 832 Hasan.
const fatiha = rsec('first-prayer', 'Reciting Al-Fatiha (The Opening)').context!.replace(/\(Source: Sunan Abi Dawud 832\)\./, `${ruled('(Source: Sunan Abi Dawud 832')}.`)
if (!fatiha.endsWith('graded Hasan by al-Albani).')) fail('Al-Fatiha: the source line moved')
// No note for verse:39:53 in 2.5.0 (Gem 10 BLOCK, G10-6: the drafted note quoted and cited 25:70 under
// the 39:53 record). Removed whole, not edited; Gem 6 re-authors a 39:53-only note (docs/wo495-architect.md §10).

export interface RevertNote {
  text: string
  citations: Array<{ text: string; grading?: string }>
}

// ─── output ───────────────────────────────────────────────────────────

const RESOURCES = [
  { uri: 'sakina://learn/what-muslims-believe', body: WHAT_MUSLIMS_BELIEVE },
  { uri: 'sakina://learn/first-steps#shahada', body: SHAHADA },
  { uri: 'sakina://learn/first-steps#forgiven', body: FORGIVEN },
  { uri: 'sakina://learn/first-steps#wudu', body: WUDU },
  { uri: 'sakina://learn/first-steps#first-prayer', body: FIRST_PRAYER },
  { uri: 'sakina://learn/first-steps#community', body: COMMUNITY },
]
for (const r of RESOURCES) if (/—|ﷺ|\bSAW\b|\bSWT\b/.test(r.body)) fail(`${r.uri}: an em dash, U+FDFA, SAW or SWT`)

const NOTES = {
  'verse:112:1': { text: `${shortSurah}\n\n${tawheedPara}`, citations: [{ text: 'Quran 112:1' }] },
  'verse:1:1': { text: fatiha, citations: [{ text: 'Sunan Abi Dawud 832', grading: 'Hasan, al-Albani' }] },
  'name:1': { text: ruled('Ar-Rahman (The Entirely Merciful)'), citations: [] },
  'name:2': { text: ruled('Ar-Rahim (The Especially Merciful)'), citations: [] },
  'name:34': { text: ruled('Al-Ghafur (The Forgiving)'), citations: [] },
  'dua:D00234': { text: ruled('It is natural to sometimes feel weighed down'), citations: [] },
} satisfies Record<string, RevertNote>

const header = `// GENERATED by scripts/wo495-learn-content.ts from the app's seed modules and
// docs/wo495-architect.md. Do not edit: change a seed or a ruling, then re-run.
// prepublishOnly runs it with --check.
`
const out =
  header +
  `\nexport const LEARN_RESOURCE_BODIES: Readonly<Record<string, string>> = ${JSON.stringify(Object.fromEntries(RESOURCES.map((r) => [r.uri, r.body])), null, 2)}\n` +
  `\n/** sha256 of each body, for the Gem 10 brief and the release record. */\nexport const LEARN_RESOURCE_SHA256: Readonly<Record<string, string>> = ${JSON.stringify(Object.fromEntries(RESOURCES.map((r) => [r.uri, sha(r.body)])), null, 2)}\n` +
  `\n/** Field 5 (revert) notes, J3 item 8 (WO#495). Served as audience_note when audience is revert. */\nexport const REVERT_NOTES: Readonly<Record<string, { text: string; citations: ReadonlyArray<{ text: string; grading?: string }> }>> = ${JSON.stringify(NOTES, null, 2)}\n`

if (CHECK) {
  const have = readFileSync(OUT, 'utf-8')
  if (have !== out) fail('src/contracts/learn-content.ts is not what the seeds give; re-run scripts/wo495-learn-content.ts')
  console.log(`wo495-learn-content --check: ${RESOURCES.length} resources and ${Object.keys(NOTES).length} revert notes match the seeds`)
} else {
  writeFileSync(OUT, out)
  for (const r of RESOURCES) console.log(`${r.uri}  ${r.body.length} chars  sha256 ${sha(r.body).slice(0, 12)}`)
  console.log(`revert notes: ${Object.keys(NOTES).join(', ')}`)
}
