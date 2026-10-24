/**
 * WO#495: MCP 2.5.0 (docs/wo495-architect.md).
 *
 *   A. the fifteen themes (section 4): every trigger routes to its theme only;
 *      verses in the ruled order; protection per trigger; 89:1-2 adjacent;
 *      31:14 reads "parents"; struck words stay off the new themes;
 *   B. safety: every hard crisis keyword beats every new trigger, in both
 *      orders; abuse beats family_and_marriage; companionship carries the soft
 *      block and no teach; healing carries the medical-care line;
 *   C. the two journey prompts: every new string pinned, every message pinned
 *      whole, arguments validated and never echoed, the du'a they name resolves;
 *   D. the six resources: listed, served verbatim, hashes match, content rules;
 *   E. the 2:256 teach entry (Gem 10 PASS, G10-7: the release gate passes);
 *   F. Field 5 (audience_note): revert only, withheld with teach, its directive;
 *      no note quotes or cites a verse other than its own record's (G10-6).
 *
 * Run: npm run build && npm run test:wo495
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DAWAH_ADAB_BLOCK, OPEN_DOOR_LINE } from '../src/contracts/instructions.js'
import { LEARN_RESOURCE_BODIES, LEARN_RESOURCE_SHA256, REVERT_NOTES } from '../src/contracts/learn-content.js'
import { LEARN_RESOURCES } from '../src/contracts/learn-resources.js'
import { AUDIENCE_NOTE_DIRECTIVE } from '../src/contracts/presentation.js'
import { DUA_ID_ALLOWLIST } from '../src/data/dua-id-allowlist.js'
import { bundledPickthall } from '../src/data/quran.js'
import { AVAILABLE_THEMES, matchThemes, THEMATIC_INDEX } from '../src/data/thematic.js'
import { THEMES_2_5_0 } from '../src/data/themes-2-5-0.js'
import { firstStepsPrompt, JOURNEY_DUA_IDS, JOURNEY_STRINGS, PROMPT_STRINGS, whatMuslimsBelievePrompt } from '../src/prompts/learning-journeys.js'
import { ABUSE_KEYWORDS, detectCrisis, SELF_HARM_KEYWORDS } from '../src/safety/_synced/crisis-detection.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import { publishGateErrors } from '../src/teach/validate.js'
import { findVersesHandler, HEALING_DIRECTIVE } from '../src/tools/find-verses.js'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { getNameOfAllahHandler } from '../src/tools/get-name-of-allah.js'
import { getQuranVerseHandler } from '../src/tools/get-quran-verse.js'
import { getVerseArabic, stripOpenFathatanSpace } from '../../src/lib/scripture/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_SERVER = path.resolve(HERE, '..', 'dist', 'server.js')
const RECORD = readFileSync(path.resolve(HERE, '..', '..', 'docs', 'wo495-architect.md'), 'utf-8')

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

type Resp = {
  _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] }; presentation_contract: Record<string, unknown> }
  content: {
    verses?: Array<{ reference: string; teach?: unknown; audience_note?: unknown }>
    matched_themes?: Array<{ theme: string; via?: string }>
    available_themes?: string[]
    duas?: Array<{ id?: string; source?: string; teach?: unknown; audience_note?: { audience: string; text: string; citations: unknown[]; note_block: string } }>
    [k: string]: unknown
  }
  crisis_resource?: { level?: string; crisis_type?: string }
}
const find = async (query: string, extra: Record<string, unknown> = {}) => (await findVersesHandler({ query, limit: 10, ...extra } as never)) as unknown as Resp
const routed = (q: string) => matchThemes(q).map((m) => m.theme)
const rules = (r: Resp) => r._sakina_meta.llm_directives.CRITICAL_RULES
const json = (r: unknown) => JSON.stringify(r)
const hasNote = (r: unknown) => json(r).includes('"audience_note"')
const hasTeach = (r: unknown) => json(r).includes('"teach"')
const noBanned = (s: string) => !/—|ﷺ|\bSAW\b|\bSWT\b|\bPBUH\b/.test(s) && !/\p{Extended_Pictographic}/u.test(s)

// ── The pinned strings (for Gem 10) ──────────────────────────────────────────
const PINNED = {
  believeTitle: 'What do Muslims believe?',
  believeDescription: "What Muslims believe, from AskSakina's records: Surah Al-Ikhlas, the Name Ar-Rahman, a reviewed overview of the articles of faith and the pillars, and Quran 2:256.",
  audienceArg: 'curious, revert or practising; defaults to curious',
  firstStepsTitle: 'First steps as a new Muslim',
  firstStepsDescription: 'For a new Muslim, one step at a time: 1 One God and His mercy, 2 what has passed is forgiven, 3 prayer step by step, 4 your people.',
  stepArg: 'Step 1-4; defaults to 1',
  readAbout: 'Read the resource sakina://about first. It frames how sources are cited; do not show it to the user.',
  audience: 'Pass audience {audience} on every tool call.',
  readResource: 'Read the resource {uri} and present it verbatim, with its citations.',
  followUps: 'Answer follow-up questions only from these records and the resource. Where scholars differ, say so without choosing; where the notes end, say so and refer the user to a qualified scholar.',
  nextJ1: 'Offer one next step only: the understand_a_verse prompt on 2:255, or explore_names_of_allah on Name 2.',
  openDoor: 'At the close, offer this line once, verbatim, unless a crisis_resource block appeared or the user has disclosed distress: "{line}"',
  revertCare: "Do not answer questions about the user's family, marriage, name, work or food: refer them to a qualified scholar. Never judge the user's former faith or family, and never tell the user whether they are or are not Muslim.",
  noOpenDoor: 'Do not offer the open door.',
  noAsk: 'Do not ask the user to say the shahada.',
  close: 'Close with one line: when you are ready, step {next}. Offer no list of further practices.',
  callDua: 'Call the get_dua tool with id D00234.',
  fatihaApp: 'For the rest of Al-Fatiha, point the user to the AskSakina app; do not quote it from memory.',
  nextJ3: 'Offer one next step only: the understand_a_verse prompt on 1:1, or explore_names_of_allah.',
}
const FOLLOW = PROMPT_STRINGS.follow
const BLOCK = PROMPT_STRINGS.block
const V = (s: number, a: number) => `Call the get_quran_verse tool with surah ${s} and ayah ${a}.`
const N = (n: number) => `Call the get_name_of_allah tool with number ${n}.`
const R = (uri: string) => `Read the resource ${uri} and present it verbatim, with its citations.`
const REVERT = 'Pass audience revert on every tool call.'
const RULES3 = [FOLLOW, DAWAH_ADAB_BLOCK, PINNED.revertCare, PINNED.noOpenDoor, BLOCK]
const believeMsg = (audience: string) =>
  [
    PINNED.readAbout,
    `Pass audience ${audience} on every tool call.`,
    V(112, 1), V(112, 2), V(112, 3), V(112, 4),
    N(1),
    R('sakina://learn/what-muslims-believe'),
    V(2, 256),
    FOLLOW,
    DAWAH_ADAB_BLOCK,
    PINNED.followUps,
    PINNED.nextJ1,
    `At the close, offer this line once, verbatim, unless a crisis_resource block appeared or the user has disclosed distress: "${OPEN_DOOR_LINE}"`,
    BLOCK,
  ].join('\n')
const STEP: Record<string, string> = {
  '1': [REVERT, R('sakina://learn/first-steps#shahada'), PINNED.noAsk, V(112, 1), V(112, 2), V(112, 3), V(112, 4), N(1), N(2), ...RULES3, 'Close with one line: when you are ready, step 2. Offer no list of further practices.'].join('\n'),
  '2': [REVERT, V(8, 38), R('sakina://learn/first-steps#forgiven'), N(34), V(39, 53), PINNED.callDua, ...RULES3, 'Close with one line: when you are ready, step 3. Offer no list of further practices.'].join('\n'),
  '3': [REVERT, R('sakina://learn/first-steps#wudu'), R('sakina://learn/first-steps#first-prayer'), V(1, 1), PINNED.fatihaApp, ...RULES3, 'Close with one line: when you are ready, step 4. Offer no list of further practices.'].join('\n'),
  '4': [REVERT, R('sakina://learn/first-steps#community'), ...RULES3, PINNED.nextJ3].join('\n'),
}

// ── The built server over HTTP (as test-wo489) ───────────────────────────────
type Proc = { p: ChildProcess }
function start(port: number): Proc {
  const p = spawn(process.execPath, [DIST_SERVER], { env: { ...process.env, PORT: String(port), MCP_USAGE_DIR: undefined }, stdio: ['ignore', 'ignore', 'ignore'] })
  return { p }
}
async function up(port: number) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200))
    if (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false)) return true
  }
  return false
}
type Rpc = { result?: Record<string, unknown>; error?: { code: number; message: string } }
let id = 0
async function rpc(port: number, method: string, params?: Record<string, unknown>): Promise<Rpc> {
  const r = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) }),
  })
  const text = await r.text()
  const body = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? '{}')
  return JSON.parse(body) as Rpc
}
const promptText = (r: Rpc) => (r.result as { messages?: Array<{ content: { text: string } }> } | undefined)?.messages?.[0]?.content?.text

// Synthetic upstream (as test-teach): any verse resolves with placeholder text, so the
// verse calls prove attachment and shape, not upstream bytes. Restored before HTTP.
const realFetch = globalThis.fetch
function stubUpstream() {
  globalThis.fetch = (async (url: string | URL) => {
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
    if (!m) return new Response('{"code":404}', { status: 404 })
    const body = {
      code: 200,
      data: [
        { number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) },
        { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` },
      ],
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

async function main() {
  stubUpstream()
  // ── A. the themes ──────────────────────────────────────────────────────────
  console.log('=== A. the fifteen themes ===')
  check(THEMES_2_5_0.length === 15 && THEMES_2_5_0.every((t) => AVAILABLE_THEMES.includes(t.theme)), 'fifteen themes, each in available_themes', THEMES_2_5_0.map((t) => t.theme))
  check(THEMES_2_5_0.some((t) => t.theme === 'quran_and_knowledge') && !AVAILABLE_THEMES.includes('knowledge_and_quran'), 'the theme is named quran_and_knowledge, as ruled')
  for (const t of THEMES_2_5_0) {
    const wrong = [...t.words, ...t.phrases].filter((term) => JSON.stringify(routed(term)) !== JSON.stringify([t.theme]) || JSON.stringify(routed(term.toUpperCase())) !== JSON.stringify([t.theme]))
    check(wrong.length === 0, `${t.theme}: every trigger (${t.words.length + t.phrases.length}) routes to it and only it, in any case`, wrong)
    const plain = [...t.words, ...t.phrases].find((term) => !t.refsByTrigger?.[term])!
    const got = ((await find(plain)).content.verses ?? []).map((v) => v.reference)
    check(JSON.stringify(got) === JSON.stringify(t.refs), `${t.theme} ("${plain}"): ${t.refs.join(', ')}, in the ruled order`, got)
  }
  check(JSON.stringify(routed('in-laws')) === '["family_and_marriage"]', '"in-laws" folds to the phrase "in laws"')
  for (const term of ['protection', 'protect', 'evil eye', 'envy']) {
    const got = ((await find(term)).content.verses ?? []).map((v) => v.reference)
    check(JSON.stringify(got) === '["2:255"]', `protection, "${term}": 2:255 only (Gem 3)`, got)
  }
  for (const term of ['shaytan', 'temptation']) {
    const got = ((await find(term)).content.verses ?? []).map((v) => v.reference)
    check(JSON.stringify(got) === '["23:97","41:36","2:255"]', `protection, "${term}": 23:97, 41:36, 2:255`, got)
  }
  {
    const got = ((await find('eid')).content.verses ?? []).map((v) => v.reference)
    check(got.indexOf('89:2') === got.indexOf('89:1') + 1 && got.includes('89:1'), 'seasons: 89:1 and 89:2 adjacent', got)
    const two = ((await find('hajj', { limit: 3 })).content.verses ?? []).map((v) => v.reference)
    check(JSON.stringify(two) === '["2:185","2:127","89:1"]', 'seasons with limit 3: the ruled order, cut at the limit', two)
    const ix89 = THEMATIC_INDEX.filter((v) => v.ref === '89:1' || v.ref === '89:2')
    check(ix89.length === 2 && ix89.every((v) => v.arabic === getVerseArabicOr(v.ref)), "89:1 and 89:2 carry public/quran's Arabic, transformed as the module does")
  }
  check(/\bparents\b/.test(bundledPickthall(31, 14) ?? '') && !/\bpartners\b/.test(bundledPickthall(31, 14) ?? ''), '31:14 (parents theme) reads "parents" (WO#494 erratum, MCP 2.4.2)')
  check(JSON.stringify(routed('loss of faith')) === '["faith_and_guidance"]' && !routed('loss of faith').includes('grief'), '"loss of faith" routes to faith_and_guidance, never grief')
  const STRUCK: Array<[string, string]> = [['death', 'hereafter'], ['grave', 'hereafter'], ['insomnia', 'night_and_rest'], ['sleeplessness', 'night_and_rest'], ['nightmares', 'night_and_rest'], ['dreams', 'night_and_rest'], ['night', 'night_and_rest'], ['jinn', 'prophets_and_creation']]
  const newThemes = new Set(THEMES_2_5_0.map((t) => t.theme))
  const leaked = STRUCK.filter(([w]) => routed(w).some((t) => newThemes.has(t)))
  check(leaked.length === 0, `struck words reach no new theme: ${STRUCK.map(([w]) => w).join(', ')}`, leaked.map(([w]) => [w, routed(w)]))
  for (const [w] of STRUCK) {
    const r = await find(w)
    if (routed(w).length === 0) check(r._sakina_meta.content_type === 'not_found', `find_verses "${w}": not_found`)
  }
  const notFound = await find('zzzz')
  check(THEMES_2_5_0.every((t) => (notFound.content.available_themes ?? []).includes(t.theme)), 'a not_found response lists the new themes in available_themes')

  // ── B. safety ──────────────────────────────────────────────────────────────
  console.log('\n=== B. safety ===')
  {
    const triggers = THEMES_2_5_0.flatMap((t) => [...t.words, ...t.phrases])
    const keywords = [...new Set([...SELF_HARM_KEYWORDS, ...ABUSE_KEYWORDS])]
    const firing = keywords.filter((k) => detectCrisis(k).isCrisis)
    let calls = 0
    const lost: string[] = []
    for (const k of firing) {
      for (const t of triggers) {
        for (const q of [`${t} ${k}`, `${k} ${t}`]) {
          calls++
          const r = await find(q)
          if (r._sakina_meta.content_type !== 'crisis_resource_only' || (r.content.verses ?? []).length) lost.push(q)
        }
      }
    }
    check(firing.length > 100 && lost.length === 0, `every hard crisis keyword that fires alone (${firing.length} of ${keywords.length}) beats every new trigger (${triggers.length}), in both orders: ${calls} calls, all crisis_resource_only`, lost.slice(0, 10))
    const abuse = ['my husband hits me and our marriage is falling apart', 'divorce because he beats me', 'my in laws hit me', 'he hits me, marriage advice', 'my father hits me', 'my mother beats me']
    const abuseLost = []
    for (const q of abuse) {
      const r = await find(q)
      if (!(r._sakina_meta.content_type === 'crisis_resource_only' && detectCrisis(q).crisisType === 'abuse' && !(r.content.verses ?? []).length && !json(r).includes('30:21') && !json(r).includes('17:24'))) abuseLost.push(q)
    }
    check(abuseLost.length === 0, 'abuse is detected before family_and_marriage and parents: crisis_resource_only, no verse, no 30:21 or 17:24 (Gem 3, mandatory)', abuseLost)
    // The hold: the detector does not read "abuse" or "abusive" alone (WO#488 E.5), so a
    // query carrying an abuse word reaches no 2.5.0 theme and is answered as 2.4 answered it.
    const held = ['my in laws abuse me', 'my in-laws are abusive', 'abusive marriage', 'my parents abuse me', 'abusive father', 'violent husband, marriage', 'domestic violence and divorce', 'I was abused, I feel lonely']
    const leakedNew = []
    for (const q of held) {
      const r = await find(q)
      const themes = (r.content.matched_themes ?? []).map((m) => m.theme)
      if (themes.some((t) => newThemes.has(t)) || ['30:21', '4:130', '17:24', '31:14', '46:15'].some((ref) => json(r.content).includes(`"${ref}"`))) leakedNew.push([q, themes])
    }
    check(leakedNew.length === 0, `the abuse-word hold: ${held.length} disclosures the detector misses reach no 2.5.0 theme (no 30:21, 4:130, 17:24, 31:14, 46:15)`, leakedNew)
    check(JSON.stringify(routed('abuse and patience')) === '["patience"]', 'the hold leaves 2.4 routes as they were ("abuse and patience" is patience, as in 2.4.2)')
    const control = await find('marriage')
    check(control._sakina_meta.content_type === 'verse_collection' && control.crisis_resource === undefined, 'control: "marriage" alone is family_and_marriage verses with no block')
  }
  for (const q of ['lonely', 'loneliness', 'alone', 'isolated']) {
    for (const audience of [undefined, 'revert']) {
      const r = await find(q, audience ? { audience } : {})
      check(
        r.content.matched_themes?.[0]?.theme === 'companionship' && r.crisis_resource?.level === 'soft' && !hasTeach(r.content) && !hasNote(r.content) && r._sakina_meta.presentation_contract.teach === undefined && !rules(r).includes(AUDIENCE_NOTE_DIRECTIVE),
        `companionship "${q}"${audience ? ` (audience ${audience})` : ''}: the soft support block, no teach, no audience_note`,
      )
    }
  }
  {
    const h = await find('illness')
    check(rules(h).filter((x) => x === HEALING_DIRECTIVE).length === 1, 'healing: the medical-care line once in CRITICAL_RULES')
    check(HEALING_DIRECTIVE === 'These verses are offered as spiritual comfort and do not replace professional medical care. If the user is unwell, encourage them to seek qualified medical help.', 'the medical-care line, pinned (Gem 10 PASS, G10-1)')
    const others = await Promise.all(['marriage', 'sleep', 'money', 'patience'].map((q) => find(q)))
    check(others.every((r) => !rules(r).includes(HEALING_DIRECTIVE)), 'no other theme carries it')
    const both = await find('illness and money')
    check(rules(both).includes(HEALING_DIRECTIVE), 'a query that reaches healing among others carries it')
  }

  // ── C. the journey prompts (in process) ────────────────────────────────────
  console.log('\n=== C. the journey prompts ===')
  check(JSON.stringify(JOURNEY_STRINGS) === JSON.stringify(PINNED), 'JOURNEY_STRINGS is exactly the pinned set', JOURNEY_STRINGS)
  check(Object.values(PINNED).every(noBanned), 'no em dash, U+FDFA, SAW, SWT, PBUH or emoji in any new string')
  check(whatMuslimsBelievePrompt({}).messages[0]!.content.text === believeMsg('curious'), 'what_muslims_believe: no argument is curious; the whole message, pinned')
  for (const a of ['curious', 'revert', 'practising']) check(whatMuslimsBelievePrompt({ audience: a }).messages[0]!.content.text === believeMsg(a), `what_muslims_believe ${a}: pinned`)
  check(firstStepsPrompt({}).messages[0]!.content.text === STEP['1'], 'first_steps_new_muslim: no argument is step 1')
  for (const s of ['1', '2', '3', '4']) check(firstStepsPrompt({ step: s }).messages[0]!.content.text === STEP[s], `first_steps_new_muslim step ${s}: the whole message, pinned`)
  check(['2', '3', '4'].every((s) => !STEP[s]!.includes('Pass audience curious')) && Object.values(STEP).every((m) => !m.includes(OPEN_DOOR_LINE)), 'every step passes audience revert and never carries the open door')
  const uris = [...new Set([believeMsg('curious'), ...Object.values(STEP)].flatMap((m) => [...m.matchAll(/sakina:\/\/[\w/#-]+/g)].map((x) => x[0])))]
  check(uris.every((u) => u === 'sakina://about' || u in LEARN_RESOURCE_BODIES) && Object.keys(LEARN_RESOURCE_BODIES).every((u) => uris.includes(u)), 'every resource a prompt reads exists, and every resource is read by a prompt', uris)
  const named = [...Object.values(STEP).join('\n').matchAll(/get_dua tool with id (D\d{5})/g)].map((x) => x[1])
  check(JSON.stringify(named) === JSON.stringify([...JOURNEY_DUA_IDS]) && JOURNEY_DUA_IDS.every((d) => DUA_ID_ALLOWLIST.includes(d)), "the du'a ids the prompts name are JOURNEY_DUA_IDS, and each is on the get_dua id allowlist", named)
  {
    const d = (await getDuaHandler({ id: 'D00234' } as never)) as unknown as Resp
    const rec = d.content.duas?.[0]
    check(d._sakina_meta.content_type === 'dua_collection' && rec?.source === 'Ṣaḥīḥ al-Bukhārī 744', "get_dua id D00234 resolves: Sahih al-Bukhari 744 (J3 step 2's repentance du'a, as ruled)", rec?.source)
    const other = (await getDuaHandler({ id: 'D00231' } as never)) as unknown as Resp
    check(other._sakina_meta.content_type === 'not_found', 'control: an id no teach entry or prompt names stays closed')
  }

  // ── D. the resources (in process) ──────────────────────────────────────────
  console.log('\n=== D. the resources ===')
  const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
  check(LEARN_RESOURCES.length === 6 && LEARN_RESOURCES.every((r) => r.text === LEARN_RESOURCE_BODIES[r.uri] && sha(r.text) === LEARN_RESOURCE_SHA256[r.uri]), 'six resources; each body hashes to its recorded sha256')
  const notes = Object.values(REVERT_NOTES).map((n) => n.text)
  check([...Object.values(LEARN_RESOURCE_BODIES), ...notes, ...LEARN_RESOURCES.flatMap((r) => [r.title, r.description])].every(noBanned), 'no em dash, U+FDFA, SAW, SWT, PBUH or emoji in any resource, note, title or description')
  check(!/pending/i.test(JSON.stringify(REVERT_NOTES)) && !/pending/i.test(JSON.stringify(LEARN_RESOURCE_BODIES)), 'no "pending" marker anywhere: Gem 2 confirmed the J3 item 8 lists')
  {
    const ikhlas = REVERT_NOTES['verse:112:1']!.text
    check(ikhlas.includes('Here is the easiest one, Surah Al-Ikhlas (chapter 112 of the Quran):\n'), 'the 112:1-4 seed reads "Here is the easiest one, Surah Al-Ikhlas (chapter 112 of the Quran):" (Architect, #580 ruling 3)')
    const believe = LEARN_RESOURCE_BODIES['sakina://learn/what-muslims-believe']!
    check(believe.includes('\n3. Zakat, an annual 2.5% charity from qualifying wealth, given to the poor.\n'), 'the zakat line is punctuated like the other four pillars (#580 ruling 3)')
    const prayer = LEARN_RESOURCE_BODIES['sakina://learn/first-steps#first-prayer']!
    check(prayer.includes('the Quran in Arabic.\n') && !prayer.includes('in Arabic:'), 'first-prayer: the cut sentence ends "...the Quran in Arabic." (#580 ruling 3)')
    check(ikhlas.includes('Transliteration:\n1. Qul huwa Allahu ahad.\n2. Allahus-samad.\n3. Lam yalid wa lam yulad.\n4. Wa lam yakun lahu kufuwan ahad.'), 'the 112:1-4 transliteration list, whole (Gem 2 confirmed)')
    check(ikhlas.includes('The First Part (Tawheed, the oneness of Allah):'), 'Tawheed glossed on first use (Gem 7)')
    const fatiha = REVERT_NOTES['verse:1:1']!.text
    const lines = /Transliteration:\n((?:\d\. .+\n?){7})/.exec(fatiha)?.[1]?.trim().split('\n') ?? []
    check(lines.length === 7 && lines.every((l, i) => l.startsWith(`${i + 1}. `)), 'the 1:1-7 transliteration list, all seven lines (Gem 2 confirmed)', lines)
    check(fatiha.endsWith('(Source: Sunan Abi Dawud 832, graded Hasan by al-Albani).'), 'Al-Fatiha note: Sunan Abi Dawud 832, Hasan by al-Albani (Architect correction)')
  }
  {
    const pk = (s: number, a: number) => bundledPickthall(s, a)!
    const believe = LEARN_RESOURCE_BODIES['sakina://learn/what-muslims-believe']!
    const forgiven = LEARN_RESOURCE_BODIES['sakina://learn/first-steps#forgiven']!
    check(believe.includes(`"${pk(2, 285)}" (Quran 2:285)`) && believe.includes(`"${pk(2, 177)}" (Quran 2:177)`), "what-muslims-believe quotes 2:285 and 2:177 as Pickthall's words, whole")
    check(forgiven.includes(`"${pk(8, 38)}" (Quran 8:38)`), "forgiven quotes 8:38 as Pickthall's words, whole")
    check(REVERT_NOTES['verse:112:1']!.text.includes(`"${pk(112, 1)}" (Quran 112:1)`), "the 112:1 note quotes 112:1 as Pickthall's words")
  }
  for (const [key, fragment] of [
    ['dua:D00234', 'It is natural to sometimes feel weighed down'],
    ['name:1', 'Ar-Rahman (The Entirely Merciful)'],
    ['name:2', 'Ar-Rahim (The Especially Merciful)'],
    ['name:34', 'Al-Ghafur (The Forgiving)'],
  ] as const) {
    const ruled = [...RECORD.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]!).filter((q) => q.startsWith(fragment))
    check(ruled.length >= 1 && ruled.every((q) => q === REVERT_NOTES[key]!.text), `${key} note is the ruled text, byte for byte (docs/wo495-architect.md)`)
  }

  // ── E. the 2:256 teach entry ───────────────────────────────────────────────
  console.log('\n=== E. 2:256 ===')
  {
    const e = TEACH_ENTRIES['verse:2:256' as keyof typeof TEACH_ENTRIES]!
    const two = getVerseArabic('2:256').split(' ').slice(0, 2).join(' ')
    check(e.key_word.words.length === 1 && e.key_word.words[0]!.arabic === two && e.key_word.words[0]!.transliteration === 'lā ikrāha' && e.key_word.gloss === 'no compulsion' && e.key_word.root === 'ك ر ه' && e.key_word.root_transliteration === 'k-r-h', "Field 1: the module's first two words of 2:256, lā ikrāha, k-r-h, no compulsion (Gem 2)")
    check(e.context === undefined, 'Field 2: none (rejected by Gem 4)')
    const field4 = [...RECORD.matchAll(/"(How does knowing that faith must be freely chosen[^"\n]+)"/g)].map((m) => m[1])
    check(field4.length >= 1 && field4.every((q) => q === e.reflection?.text), 'Field 4: Gem 3\'s text, byte for byte')
    const refused = publishGateErrors(TEACH_ENTRIES).map((x) => x.replace(/: entry \(publish\) lacks sign-off from Gem 10$/, ''))
    check(refused.length === 0 && JSON.stringify(e.publishReviewedBy) === JSON.stringify([{ gem: 10, ruling: 'WO#495 Gem 10 brief, G10-7 PASS (docs/wo495-architect.md §10)', date: '2026-10-24' }]), 'the release gate passes: 2:256 carries Gem 10\'s G10-7 PASS', refused)
    const r = (await getQuranVerseHandler({ surah: 2, ayah: 256 } as never)) as unknown as Resp
    check(hasTeach(r.content) && json(r.content).includes('"record_id":"verse:2:256"'), 'get_quran_verse 2:256 carries its teach block')
  }

  // ── F. audience_note (Field 5) ─────────────────────────────────────────────
  console.log('\n=== F. audience_note ===')
  const callFor = (key: string, audience?: string, extra: Record<string, unknown> = {}) => {
    const a = audience ? { audience } : {}
    const [kind, rest] = [key.split(':')[0], key.split(':').slice(1).join(':')]
    if (kind === 'name') return getNameOfAllahHandler({ number: Number(rest), ...a, ...extra } as never)
    if (kind === 'dua') return getDuaHandler({ id: rest, ...a, ...extra } as never)
    const [s, v] = rest.split(':').map(Number)
    return getQuranVerseHandler({ surah: s, ayah: v, ...a, ...extra } as never)
  }
  for (const [key, note] of Object.entries(REVERT_NOTES)) {
    const r = (await callFor(key, 'revert')) as unknown as Resp
    const got = /"audience_note":(\{.*?"note_block":"(?:[^"\\]|\\.)*"\})/.exec(json(r.content))?.[1]
    const parsed = got ? (JSON.parse(got) as { audience: string; text: string; note_block: string; citations: Array<{ text: string; grading?: string }> }) : undefined
    const cited = note.citations.map((c) => (c.grading ? `${c.text} (${c.grading})` : c.text)).join('; ')
    check(
      parsed?.audience === 'revert' && parsed.text === note.text && parsed.note_block === (cited ? `${note.text}\n${cited}` : note.text) && rules(r).filter((x) => x === AUDIENCE_NOTE_DIRECTIVE).length === 1,
      `${key} (revert): audience_note with its note_block, and the directive once`,
      got,
    )
    const others = await Promise.all([undefined, 'curious', 'practising'].map((a) => callFor(key, a)))
    check(others.every((o) => !hasNote(o) && !rules(o as unknown as Resp).includes(AUDIENCE_NOTE_DIRECTIVE)), `${key}: no audience_note and no directive for curious, practising or no audience`)
    if (key.startsWith('name:') || key.startsWith('dua:')) {
      const ur = await callFor(key, 'revert', { locale: 'ur' })
      check(!hasNote(ur), `${key}: no audience_note outside en`)
    }
  }
  // G10-6 (Gem 10 BLOCK, Architect ruling, §10): no note quotes or cites a verse other than its own record's.
  {
    const ALL = (JSON.parse(readFileSync(path.resolve(HERE, '..', 'data', 'pickthall.json'), 'utf-8')) as { verses: Record<string, string> }).verses
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()
    const windows = Object.entries(ALL).flatMap(([ref, t]) => {
      const w = norm(t).split(' ')
      const out: Array<[string, string]> = []
      for (let i = 0; i + 8 <= w.length; i++) out.push([ref, w.slice(i, i + 8).join(' ')])
      return out
    })
    const crossVerse = (key: string, note: { text: string; citations: ReadonlyArray<{ text: string }> }) => {
      const own = key.startsWith('verse:') ? key.slice('verse:'.length) : null
      const cited = [...note.citations.map((c) => c.text), note.text].flatMap((t) => [...t.matchAll(/Quran (\d{1,3}:\d{1,3}(?:-\d{1,3})?)/g)].map((m) => m[1]!))
      const body = ` ${norm(note.text)} `
      const quoted = [...new Set(windows.filter(([ref, w]) => ref !== own && body.includes(` ${w} `)).map(([ref]) => ref))]
      return [...cited.filter((r) => r !== own).map((r) => `cites ${r}`), ...quoted.map((r) => `quotes ${r}`)]
    }
    const bad = Object.entries(REVERT_NOTES).flatMap(([k, n]) => crossVerse(k, n).map((x) => `${k}: ${x}`))
    check(bad.length === 0, `no revert note (${Object.keys(REVERT_NOTES).length}) quotes or cites a verse other than its own record's: Quran citations and 8-word Pickthall windows (6 words matched ordinary phrases, e.g. "the East and the West, and" in 2:115) of all ${Object.keys(ALL).length} verses`, bad)
    const planted = crossVerse('verse:39:53', { text: `And even more remarkably: "${bundledPickthall(25, 70)}" (Quran 25:70).`, citations: [{ text: 'Quran 25:70' }] })
    check(planted.includes('cites 25:70') && planted.includes('quotes 25:70'), 'control: the removed 39:53 note (25:70 under 39:53) is caught by both checks', planted)
    check(JSON.stringify(Object.keys(REVERT_NOTES).sort()) === JSON.stringify(['dua:D00234', 'name:1', 'name:2', 'name:34', 'verse:112:1', 'verse:1:1']), 'the revert notes are exactly 1:1, 112:1, Names 1, 2 and 34, and D00234 (39:53 removed, §10)')
    const v3953 = (await callFor('verse:39:53', 'revert')) as unknown as Resp
    check(!hasNote(v3953) && hasTeach(v3953.content) && !rules(v3953).includes(AUDIENCE_NOTE_DIRECTIVE), 'get_quran_verse 39:53 (revert): its teach block, no audience_note and no note directive')
  }
  check(AUDIENCE_NOTE_DIRECTIVE === "CRITICAL: An `audience_note` is AskSakina's note for a new Muslim. Output its `note_block` exactly as provided, after the record and any teach content, and say that it is from AskSakina's notes. Do not add to it, shorten it or reword it. If the payload includes a crisis resource block, or the user has disclosed distress, grief or crisis in the conversation, leave the note out.", 'the audience_note directive, pinned (Gem 10 PASS, G10-2)')
  {
    const d = (await callFor('dua:D00234', 'revert')) as unknown as Resp
    check(!hasTeach(d.content) && hasNote(d.content), 'D00234 (no teach entry) still carries its note for revert')
    const hard = (await getNameOfAllahHandler({ name: 'I want to kill myself', audience: 'revert' } as never)) as unknown as Resp
    check(hard._sakina_meta.content_type === 'crisis_resource_only' && !hasNote(hard), 'a crisis call carries no audience_note')
    const soft = (await find('lonely mercy', { audience: 'revert' })) as Resp
    check(soft.crisis_resource?.level === 'soft' && !hasNote(soft.content), 'under a soft block, no audience_note (withheld with teach)')
    const ctx = (await getDuaHandler({ context: 'repentance', audience: 'revert' } as never)) as unknown as Resp
    const withNote = (ctx.content.duas ?? []).filter((x) => x.audience_note).map((x) => x.id)
    check(ctx.crisis_resource !== undefined ? withNote.length === 0 : withNote.every((x) => x === 'D00234'), "get_dua repentance (revert): a note only on D00234, if listed, and none under a block", withNote)
  }

  // ── C/D over HTTP, on the built server ─────────────────────────────────────
  console.log('\n=== C/D over HTTP ===')
  globalThis.fetch = realFetch
  if (!existsSync(DIST_SERVER)) {
    check(false, 'dist/server.js exists (run npm run build first)')
    return finish()
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'wo495-'))
  const s = start(3495)
  try {
    check(await up(3495), 'the built server starts')
    const list = ((await rpc(3495, 'prompts/list')).result?.prompts ?? []) as Array<{ name: string; title: string; description: string; arguments: Array<{ name: string; description?: string; required?: boolean }> }>
    const b = list.find((p) => p.name === 'what_muslims_believe')
    const f = list.find((p) => p.name === 'first_steps_new_muslim')
    check(b?.title === PINNED.believeTitle && b.description === PINNED.believeDescription && JSON.stringify(b.arguments) === JSON.stringify([{ name: 'audience', description: PINNED.audienceArg, required: false }]), 'prompts/list what_muslims_believe: title, description, one optional argument')
    check(f?.title === PINNED.firstStepsTitle && f.description === PINNED.firstStepsDescription && JSON.stringify(f.arguments) === JSON.stringify([{ name: 'step', description: PINNED.stepArg, required: false }]), 'prompts/list first_steps_new_muslim: title, description, one optional argument')
    check(promptText(await rpc(3495, 'prompts/get', { name: 'what_muslims_believe' })) === believeMsg('curious') && promptText(await rpc(3495, 'prompts/get', { name: 'what_muslims_believe', arguments: { audience: 'revert' } })) === believeMsg('revert'), 'prompts/get what_muslims_believe, with no arguments object and with revert: the pinned messages')
    check(promptText(await rpc(3495, 'prompts/get', { name: 'first_steps_new_muslim' })) === STEP['1'] && promptText(await rpc(3495, 'prompts/get', { name: 'first_steps_new_muslim', arguments: { step: '4' } })) === STEP['4'], 'prompts/get first_steps_new_muslim, with no arguments object and with step 4: the pinned messages')
    const SENTINEL = 'WO495SENTINEL'
    const bad: Array<[string, Record<string, string>]> = [
      ['what_muslims_believe', { audience: 'unknown' }],
      ['what_muslims_believe', { audience: 'Revert' }],
      ['what_muslims_believe', { audience: SENTINEL }],
      ['what_muslims_believe', { audience: 'I want to kill myself' }],
      ['first_steps_new_muslim', { step: '0' }],
      ['first_steps_new_muslim', { step: '5' }],
      ['first_steps_new_muslim', { step: 'one' }],
      ['first_steps_new_muslim', { step: '' }],
      ['first_steps_new_muslim', { step: SENTINEL }],
    ]
    for (const [name, args] of bad) {
      const r = await rpc(3495, 'prompts/get', { name, arguments: args })
      check(r.error?.code === -32602 && !r.result && !(r.error.message ?? '').includes(SENTINEL) && !(r.error.message ?? '').includes('kill'), `${name} ${JSON.stringify(args)}: refused (-32602), the value not echoed`, r.error ?? r.result)
    }
    const rl = ((await rpc(3495, 'resources/list')).result?.resources ?? []) as Array<{ uri: string; name: string; title?: string; description?: string; mimeType?: string }>
    check(JSON.stringify(rl.map((r) => r.uri)) === JSON.stringify(['sakina://about', ...LEARN_RESOURCES.map((r) => r.uri)]), 'resources/list: about, then the six learn resources', rl.map((r) => r.uri))
    check(LEARN_RESOURCES.every((r) => rl.some((x) => x.uri === r.uri && x.title === r.title && x.description === r.description && x.mimeType === 'text/markdown')), 'each listed with its title, description and text/markdown')
    for (const r of LEARN_RESOURCES) {
      const got = (await rpc(3495, 'resources/read', { uri: r.uri })).result?.contents as Array<{ uri: string; text: string; mimeType: string }> | undefined
      check(got?.length === 1 && got[0]!.uri === r.uri && got[0]!.mimeType === 'text/markdown' && sha(got[0]!.text) === LEARN_RESOURCE_SHA256[r.uri], `resources/read ${r.uri}: verbatim (sha256 ${LEARN_RESOURCE_SHA256[r.uri]!.slice(0, 12)})`)
    }
    const card = (await fetch('http://127.0.0.1:3495/.well-known/mcp/server-card.json').then((x) => (x.ok ? x.json() : null), () => null)) as { prompts?: Array<{ name: string }>; resources?: Array<{ uri: string }> } | null
    if (card) {
      check(JSON.stringify(card.prompts?.map((p) => p.name)) === '["understand_a_verse","explore_names_of_allah","what_muslims_believe","first_steps_new_muslim"]' && LEARN_RESOURCES.every((r) => card.resources?.some((x) => x.uri === r.uri)), 'the server card lists the four prompts and the six resources')
    } else check(false, 'the server card is served')
  } finally {
    if (s.p.exitCode === null) s.p.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }
  return finish()
}

/** getVerseArabic, or public/quran's text_uthmani with the module's transform for 89:1-2. */
function getVerseArabicOr(ref: string): string {
  try {
    return getVerseArabic(ref)
  } catch {
    const [s, a] = ref.split(':').map(Number) as [number, number]
    const d = JSON.parse(readFileSync(path.resolve(HERE, '..', '..', 'public', 'quran', 'en.pickthall', `${s}.json`), 'utf-8')) as { verses: Array<{ verse_number: number; text_uthmani: string }> }
    return stripOpenFathatanSpace(d.verses.find((x) => x.verse_number === a)!.text_uthmani)
  }
}

function finish() {
  console.log(`\nWO#495: ${failures === 0 ? `all ${checks} passed` : `${failures} of ${checks} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
