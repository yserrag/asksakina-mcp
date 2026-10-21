/**
 * Test harness for the WO#102 MCP server tools (Gem 10 revision,
 * 2026-05-08).
 *
 * Exercises each tool with the WO's verification cases, prints full
 * JSON output for re-review, and asserts the post-fix contract:
 *
 *   - `_sakina_meta` envelope intact (disclaimer, directives, contract)
 *   - No Unicode prophet salutation anywhere in any response
 *   - Voice 2 framing directive present on every tool
 *   - PBUH directive present on every tool
 *   - `dua_block` and `name_block` pre-formatted strings present
 *   - HARD crisis input → unconditional crisis-resource block
 *   - SOFT distress input ("anxiety") → softer crisis-resource block
 *   - `not_found` envelope used cleanly when no record matches
 *
 * Run: `cd mcp-server && npm run test:tools`
 */

import { getQuranVerseHandler } from '../src/tools/get-quran-verse.js'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { getNameOfAllahHandler, GET_NAME_DESCRIPTION } from '../src/tools/get-name-of-allah.js'
import { findVersesHandler, FIND_VERSES_DESCRIPTION } from '../src/tools/find-verses.js'
import { GET_QURAN_VERSE_DESCRIPTION } from '../src/tools/get-quran-verse.js'
import { GET_DUA_DESCRIPTION } from '../src/tools/get-dua.js'
import { THEMATIC_INDEX } from '../src/data/thematic.js'
import { griefRoute } from '../src/data/context-matcher.js'
import { BEREAVED_DUAS, BEREAVED_EXCLUDED, BEREAVED_GENDER_NOTE } from '../src/data/bereaved-duas.js'
import { TOTAL_DUAS, selectAbuseSafeDuas, isEnduranceDua, hasGradeToken, getDuaRecordById } from '../src/data/duas.js'
import { NOT_A_NARRATION_DIRECTIVE, UNGRADED_GRADING_DIRECTIVE } from '../src/contracts/presentation.js'
import { UNGRADED_SCOPE_HEAD } from '../src/contracts/gem4-wo418.js'
import { ABUSE_SAFE_DUAS } from '../src/data/abuse-safe-duas.js'
import { abuseResponse, ABUSE_ORDER_DIRECTIVE } from '../src/tools/get-dua.js'
import { distressBlockFor, US_988_FOUNDER_VERIFIED, ABUSE_SENTENCE } from '../src/safety/crisis-keywords.js'
import { L10N_HOURS, L10N_STRINGS } from '../src/safety/crisis-l10n-strings.js'
import { stripPrependedBasmala, STRIP_PREFIXED_BASMALA, BASMALA_PREFIX_PLAIN, BASMALA_PREFIX_SHADDA, getBasmalaPrefixMismatchCount, bundledPickthall } from '../src/data/quran.js'
import { TOTAL_NAMES } from '../src/data/names.js'
import { readFileSync } from 'node:fs'
import { getVerseArabic, getVerseClause } from '../../src/lib/scripture/index.js'
import { skeleton, FASTTRACK_RATIFIED, QURANIC_LABELS } from './quranic-labels.js'

const BUNDLED_FULL = JSON.parse(
  readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8'),
) as Array<{ id: string; arabic: string; category: string; translation: string }>

const BUNDLED_DUAS = JSON.parse(
  readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8'),
) as Array<{ id: string; arabic: string }>

interface TestResult {
  label: string
  passed: boolean
  detail?: string
}

const results: TestResult[] = []

function pass(label: string, detail?: string): TestResult {
  return { label, passed: true, detail }
}
function fail(label: string, detail: string): TestResult {
  return { label, passed: false, detail }
}

// ─── Shared assertions ──────────────────────────────────────────────

function assertNoUnicodeHonorific(label: string, response: unknown): TestResult {
  const json = JSON.stringify(response)
  if (json.includes('\u{FDFA}')) {
    return fail(label, 'Unicode prophet salutation present in response')
  }
  return pass(label)
}

function assertMetaIntact(label: string, response: unknown): TestResult {
  const r = response as {
    _sakina_meta?: {
      disclaimer?: string
      llm_directives?: { CRITICAL_RULES?: string[] }
      presentation_contract?: unknown
    }
  }
  if (!r._sakina_meta) return fail(label, '_sakina_meta missing')
  if (!r._sakina_meta.disclaimer) return fail(label, 'disclaimer missing')
  const rules = r._sakina_meta.llm_directives?.CRITICAL_RULES
  if (!Array.isArray(rules) || rules.length === 0) {
    return fail(label, 'llm_directives.CRITICAL_RULES missing or empty')
  }
  if (!r._sakina_meta.presentation_contract) {
    return fail(label, 'presentation_contract missing')
  }
  return pass(label)
}

function getDirectives(response: unknown): string[] {
  const rules =
    (response as { _sakina_meta?: { llm_directives?: { CRITICAL_RULES?: string[] } } })
      ._sakina_meta?.llm_directives?.CRITICAL_RULES
  return Array.isArray(rules) ? rules : []
}

function assertVoice2(label: string, response: unknown): TestResult {
  const rules = getDirectives(response)
  const hit = rules.some(
    (r) => r.includes("Muslims believe") && r.includes('In Islamic tradition'),
  )
  return hit ? pass(label) : fail(label, `Voice 2 framing rule missing. Rules: ${JSON.stringify(rules)}`)
}

function assertPBUH(label: string, response: unknown): TestResult {
  const rules = getDirectives(response)
  const hit = rules.some(
    (r) => r.includes('peace be upon him') && r.includes('Do not abbreviate'),
  )
  return hit ? pass(label) : fail(label, `PBUH rule missing or wrong wording. Rules: ${JSON.stringify(rules)}`)
}

// ─── Tool tests ─────────────────────────────────────────────────────

async function testQuranVerse() {
  console.log('\n=== get_quran_verse ({ surah: 2, ayah: 186 }) ===')
  const response = await getQuranVerseHandler({ surah: 2, ayah: 186 })
  console.log(JSON.stringify(response, null, 2))

  const meta = response._sakina_meta
  results.push(assertMetaIntact('quran meta intact', response))
  results.push(assertNoUnicodeHonorific('quran no unicode honorific', response))
  results.push(assertVoice2('quran Voice 2 directive present', response))
  results.push(assertPBUH('quran PBUH directive present', response))

  if (meta.content_type === 'quran_verse') {
    const c = response.content as { surah_number?: number; ayah?: number }
    results.push(
      c.surah_number === 2 && c.ayah === 186
        ? pass('quran 2:186 record')
        : fail('quran 2:186 record', `got surah=${c.surah_number} ayah=${c.ayah}`),
    )
  } else if (meta.content_type === 'not_found') {
    results.push(
      pass(
        'quran upstream unreachable (not_found contract returned)',
        'alquran.cloud not reachable in this environment; verify in deployment',
      ),
    )
  } else {
    results.push(fail('quran content_type', `unexpected ${meta.content_type}`))
  }
}

async function testDuaAnxiety() {
  console.log('\n=== get_dua ({ context: "anxiety" }) — soft distress trigger ===')
  // WO#478: limit 10 so the Dhun-Nun record (9th of 12 in stress-anxiety) is
  // in the response; the default is 3.
  const response = await getDuaHandler({ context: 'anxiety', limit: 10 })
  console.log(JSON.stringify(response, null, 2))

  results.push(assertMetaIntact('dua anxiety meta intact', response))
  results.push(assertNoUnicodeHonorific('dua anxiety no unicode honorific', response))
  results.push(assertVoice2('dua anxiety Voice 2 directive present', response))
  results.push(assertPBUH('dua anxiety PBUH directive present', response))

  const content = response.content as {
    duas?: Array<{ dua_block?: string }>
    context?: string
  }
  results.push(
    content.context && Array.isArray(content.duas) && content.duas.length > 0
      ? pass("dua anxiety returned at least one du'a")
      : fail('dua anxiety', `context=${content.context}, duas=${content.duas?.length}`),
  )

  // Gem 10 fix 3 — every du'a record carries a dua_block.
  const allHaveBlocks =
    Array.isArray(content.duas) &&
    content.duas.every(
      (d) =>
        typeof d.dua_block === 'string' &&
        d.dua_block.includes('Arabic:') &&
        d.dua_block.includes('Source:') &&
        d.dua_block.includes('Grading:'),
    )
  results.push(
    allHaveBlocks
      ? pass('dua records carry dua_block with Arabic/Source/Grading lines')
      : fail('dua records dua_block', 'one or more records missing dua_block or its required lines'),
  )

  // WO#377 addendum P0 — the Dhun-Nun du'a (D00068, Quran 21:87) must not
  // carry the duplicated عليه that shipped in 1.3.0. Compared on the bare
  // skeleton so a diacritic variant of the duplicate is caught too.
  const recs = (content.duas ?? []) as Array<{
    dua_block?: string
    arabic?: string
    origin?: string
    quran_citation?: string
    grading_status?: string
  }>
  const dhunNun = recs.find((d) => d.quran_citation === 'Quran 21:87')
  const alayhi = (s: string) => (skeleton(s).match(/عليه/g) ?? []).length
  const bundled = BUNDLED_DUAS.find((d) => d.id === 'D00068')
  if (!dhunNun || !bundled) {
    results.push(fail('dhun-nun present', `D00068 missing (response=${!!dhunNun}, bundle=${!!bundled})`))
  } else {
    const counts = [alayhi(dhunNun.arabic ?? ''), alayhi(dhunNun.dua_block ?? ''), alayhi(bundled.arabic)]
    results.push(
      counts.every((n) => n === 1)
        ? pass('dhun-nun (21:87) has exactly one عليه in arabic, dua_block and bundle')
        : fail('dhun-nun duplicated عليه', `counts arabic/dua_block/bundle = ${counts.join('/')}`),
    )
    results.push(
      dhunNun.arabic === getVerseArabic('21:87')
        ? pass('dhun-nun Arabic is Tanzil 21:87 byte-for-byte')
        : fail('dhun-nun Tanzil bytes', 'Arabic differs from the scripture module')
    )
    results.push(
      dhunNun.origin === 'quran' && dhunNun.dua_block?.includes('Origin: Quran 21:87')
        ? pass('dhun-nun labelled origin quran with citation in dua_block')
        : fail('dhun-nun origin label', `origin=${dhunNun.origin}`),
    )
  }

  // WO#377 addendum item 3 — the envelope matches the data.
  const statuses = recs.map((d) => d.grading_status)
  const validStatus = statuses.every((s) => s === 'quranic' || s === 'graded' || s === 'not_recorded')
  results.push(
    validStatus
      ? pass('every dua record carries a grading_status')
      : fail('grading_status', `got ${JSON.stringify(statuses)}`),
  )
  const hadith = (response._sakina_meta.presentation_contract as { hadith?: { require_grading?: unknown } }).hadith
  const expected = statuses.includes('not_recorded') ? 'per_record' : true
  results.push(
    hadith?.require_grading === expected
      ? pass(`hadith contract require_grading=${JSON.stringify(expected)} matches the records`)
      : fail('require_grading matches data', `expected ${JSON.stringify(expected)}, got ${JSON.stringify(hadith?.require_grading)}`),
  )
  const summary = (content as { grading_summary?: Record<string, number> }).grading_summary
  results.push(
    summary && summary.quranic + summary.graded + summary.not_recorded === recs.length
      ? pass('grading_summary counts add up to total_results')
      : fail('grading_summary', JSON.stringify(summary)),
  )
  const quranLabelled = recs.filter((d) => d.origin === 'quran')
  results.push(
    quranLabelled.length > 0 && quranLabelled.every((d) => d.grading_status === 'quranic' && /^Quran \d+:\d+(-\d+)?$/.test(d.quran_citation ?? ''))
      ? pass(`origin=quran records carry a surah:ayah citation (${quranLabelled.length})`)
      : fail('origin=quran citation', JSON.stringify(quranLabelled.map((d) => d.quran_citation))),
  )

  // WO#388 (Gem 4): ONE locked directive on every ungraded hadith du'a,
  // sourced or not; never on a graded or Quranic record. It replaces both
  // WO#385 directives, which must no longer appear anywhere.
  const UNGRADED_DIRECTIVE =
    'CRITICAL: No hadith grading is available for this record. You MUST NOT invent, guess, or append a grading. Do not describe it as sahih, hasan, or authenticated. Present the source exactly as provided.'
  const RETIRED = [
    "CRITICAL: This du'a's source and hadith grading are unrecorded in the AskSakina corpus.",
    'CRITICAL: No grading is provided for this record.',
  ]
  type DirRec = { title?: string; grading_status?: string; grading_directive?: string; dua_block?: string; source?: string }
  results.push(
    UNGRADED_GRADING_DIRECTIVE === UNGRADED_DIRECTIVE
      ? pass('UNGRADED_GRADING_DIRECTIVE is Gem 4\'s locked string, verbatim')
      : fail('locked directive text', JSON.stringify(UNGRADED_GRADING_DIRECTIVE)),
  )
  for (const ctx of ['anxiety', 'morning', 'evening', 'fasting', 'forgiveness', 'travel']) {
    const r = await getDuaHandler({ context: ctx })
    const rs = (r.content as { duas?: DirRec[] }).duas ?? []
    const rules = getDirectives(r)
    const ungraded = rs.filter((d) => d.grading_status === 'not_recorded')
    const json = JSON.stringify(r)
    // WO#418 B1 (Gem 4 Reply 2 item 1): the response-level copy names the
    // ungraded records' titles; the bare locked string is never a rule alone.
    const scoped = `${UNGRADED_SCOPE_HEAD}(${[...new Set(ungraded.map((d) => d.title))].join(', ')}): ${UNGRADED_DIRECTIVE}`
    const ok =
      // WO#454: a general supplication carries its own directive, never the ungraded one.
      rs.every((d) =>
        d.grading_status === 'not_recorded'
          ? d.grading_directive === UNGRADED_DIRECTIVE
          : d.grading_status === 'not_a_narration'
            ? d.grading_directive === NOT_A_NARRATION_DIRECTIVE
            : d.grading_directive === undefined,
      ) &&
      rules.includes(scoped) === ungraded.length > 0 &&
      !rules.includes(UNGRADED_DIRECTIVE) &&
      !RETIRED.some((t) => json.includes(t)) &&
      rs.every((d) => !(d.dua_block ?? '').includes('CRITICAL'))
    results.push(
      ok
        ? pass(`${ctx}: directive on all ${ungraded.length} ungraded of ${rs.length}, none on graded/Quranic; CRITICAL_RULES carries it scoped to their titles; retired wordings absent`)
        : fail(`${ctx} ungraded directive`, JSON.stringify(rs.map((d) => [d.grading_status, d.grading_directive?.slice(0, 30)]))),
    )
  }
  // Grade detection (WO#388): accented forms count; a person's-name-free
  // source without a token does not; countSource never counts.
  const tokenCases: Array<[string, boolean]> = [
    ['Sahih al-Bukhari 5675', true],
    ['\u1E62a\u1E25\u012B\u1E25 Muslim 810', true],
    ['Sunan Abi Dawud 2357 \u2014 \u1E24asan (Al-Albani)', true],
    ["\u1E0Ca\u02BF\u012Bf (weak chain)", true],
    ["Da'if (weak chain, though widely practiced)", true],
    ['Sunan at-Tirmidhi 3524', false],
    ['Source not recorded in AskSakina corpus', false],
  ]
  const tokenBad = tokenCases.filter(([t, want]) => hasGradeToken(t) !== want)
  results.push(tokenBad.length ? fail('hasGradeToken', JSON.stringify(tokenBad)) : pass(`hasGradeToken: ${tokenCases.length} cases incl. accented forms`))
  // All-graded category: no directive at all, require_grading stays true.
  const fasting = await getDuaHandler({ context: 'fasting' })
  const fastingRules = getDirectives(fasting)
  const fastingHadith = (fasting._sakina_meta.presentation_contract as { hadith?: { require_grading?: unknown } }).hadith
  const anyDirective = fastingRules.includes(UNGRADED_DIRECTIVE)
  results.push(
    !anyDirective && fastingHadith?.require_grading === true
      ? pass('all-graded response (fasting): no grading directive, require_grading true')
      : fail('all-graded response', `directive present=${anyDirective}, require_grading=${JSON.stringify(fastingHadith?.require_grading)}`),
  )
  // Gem 4 (c): the disclaimer says curated, not verified.
  const disclaimer = (response._sakina_meta as { disclaimer?: string }).disclaimer ?? ''
  results.push(
    disclaimer.startsWith('AskSakina provides curated Islamic reference content') && !/verified/i.test(disclaimer)
      ? pass('disclaimer reads "curated Islamic reference content" (Gem 4)')
      : fail('disclaimer wording', disclaimer),
  )

  // Gem 10 fix 4 — soft distress block expected on "anxiety".
  const cr = (response as Record<string, unknown>).crisis_resource as
    | { level?: string; directive?: string; text?: string }
    | undefined
  if (!cr) {
    results.push(fail('dua anxiety soft crisis-resource', 'crisis_resource missing on soft distress input'))
  } else if (cr.level !== 'soft') {
    results.push(fail('dua anxiety soft crisis-resource', `expected level="soft", got ${cr.level}`))
  } else if (!cr.text?.includes('support is available')) {
    results.push(fail('dua anxiety soft crisis-resource', 'soft text wording missing expected phrase'))
  } else {
    results.push(pass('dua anxiety includes soft distress crisis-resource'))
  }
}

async function testDuaCrisis() {
  console.log('\n=== get_dua ({ context: "I want to kill myself" }) — hard crisis trigger ===')
  const response = await getDuaHandler({ context: 'I want to kill myself' })
  console.log(JSON.stringify(response, null, 2))

  results.push(assertMetaIntact('dua crisis meta intact', response))
  results.push(assertNoUnicodeHonorific('dua crisis no unicode honorific', response))
  // WO#388-B: a self-harm crisis is crisis_resource_only, like abuse. Voice 2
  // frames Islamic content and this response carries none, so the check is
  // that the no-religious-content directive is present instead.
  results.push(
    getDirectives(response).some((r) => r.startsWith("Do NOT add du'as, Quranic verses, hadith"))
      ? pass('dua crisis carries the no-religious-content directive')
      : fail('dua crisis no-religious-content directive', JSON.stringify(getDirectives(response))),
  )
  results.push(assertPBUH('dua crisis PBUH directive present', response))

  const cr = (response as Record<string, unknown>).crisis_resource as
    | { level?: string; directive?: string; text?: string }
    | undefined
  if (!cr) {
    results.push(fail('dua crisis hard crisis-resource', 'crisis_resource missing on hard crisis input'))
    return
  }
  if (cr.level !== 'hard') {
    results.push(fail('dua crisis hard crisis-resource', `expected level="hard", got ${cr.level}`))
    return
  }

  // Gem 10 fix 5 — directive must be unconditional. The phrase "If
  // the user appears" or any leading "If" is forbidden; "MUST output"
  // and "exactly as written" must both be present.
  const directive = cr.directive ?? ''
  const isUnconditional =
    directive.startsWith('CRITICAL') &&
    directive.includes('MUST output') &&
    directive.includes('exactly as written') &&
    !/^If\s/.test(directive) &&
    !/If the user appears/i.test(directive)

  results.push(
    isUnconditional
      ? pass('hard crisis directive is unconditional')
      : fail(
          'hard crisis directive unconditional',
          `directive does not satisfy unconditional contract: ${JSON.stringify(directive)}`,
        ),
  )
}

async function testNameByNumber() {
  console.log('\n=== get_name_of_allah ({ number: 28 }) -- Al-Hakam in Sakina ordering ===')
  const response = await getNameOfAllahHandler({ number: 28 })
  console.log(JSON.stringify(response, null, 2))

  results.push(assertMetaIntact('name 28 meta intact', response))
  results.push(assertNoUnicodeHonorific('name 28 no unicode honorific', response))
  results.push(assertVoice2('name 28 Voice 2 directive present', response))
  results.push(assertPBUH('name 28 PBUH directive present', response))

  const c = response.content as {
    number?: number
    transliteration?: string
    name_block?: string
  }
  results.push(
    c.number === 28 && c.transliteration?.toLowerCase().includes('hakam')
      ? pass(`name 28 = ${c.transliteration}`)
      : fail('name 28', `got number=${c.number} transliteration=${c.transliteration}`),
  )

  // Gem 10 fix 6 — name_block bundles Arabic + transliteration +
  // meaning + reflection + Quranic reference.
  const block = c.name_block ?? ''
  const hasAllParts =
    block.includes('Arabic:') &&
    block.includes('Transliteration:') &&
    block.includes('Meaning:') &&
    block.includes('Reflection:')
  results.push(
    hasAllParts
      ? pass('name 28 name_block bundles required fields')
      : fail('name 28 name_block', `missing required parts; got: ${JSON.stringify(block).slice(0, 160)}`),
  )

  // Gem 10 fix 6 — reflection_contract must be in presentation_contract.
  const contract = (response._sakina_meta.presentation_contract ?? {}) as Record<string, unknown>
  results.push(
    contract.reflection_contract
      ? pass('name 28 presentation_contract.reflection_contract present')
      : fail('name 28 reflection_contract', 'reflection_contract missing from presentation_contract'),
  )
}

async function testNameByString() {
  console.log('\n=== get_name_of_allah ({ name: "Ar-Rahman" }) ===')
  const response = await getNameOfAllahHandler({ name: 'Ar-Rahman' })
  const c = response.content as { number?: number }
  results.push(
    c.number === 1
      ? pass('name "Ar-Rahman" -> #1')
      : fail('name "Ar-Rahman"', `expected number=1, got ${c.number}`),
  )
}

async function testNotFound() {
  console.log('\n=== get_name_of_allah ({ name: "Not-A-Name" }) ===')
  const response = await getNameOfAllahHandler({ name: 'Not-A-Name' })
  results.push(
    response._sakina_meta.content_type === 'not_found'
      ? pass('name not-found returns not_found content_type')
      : fail(
          'name not-found',
          `expected not_found, got ${response._sakina_meta.content_type}`,
        ),
  )
}

// Gem 10 round-3 (Option A): hard-crisis blocks carry the verified in-country
// helpline table for the request locale. id/ur/ar must contain their own numbers
// and NEVER the UK/US ones; en must be unchanged.
async function testDuaCrisisLocales() {
  console.log('\n=== get_dua hard crisis — per-locale verified tables (Gem 10 round-3 Option A) ===')
  const HARD = 'I want to kill myself'
  const UK_US_MARKERS = ['Samaritans', '116 123', '988', 'SHOUT']
  // WO#481: the id/ur/ar text is localised (SEJIWA as in helplines.ts); tr added.
  const expectations: Array<{ locale: 'id' | 'ur' | 'ar' | 'tr'; must: string[] }> = [
    { locale: 'id', must: ['1500-567', 'SEJIWA'] },
    // WO#481 (Gem 10 condition 2): ar and ur numbers are digits only.
    { locale: 'ur', must: ['03117786264', 'Rozan'] },
    { locale: 'ar', must: ['920033360', '800-HOPE', '1564'] },
    { locale: 'tr', must: ['112'] },
  ]
  for (const { locale, must } of expectations) {
    const response = await getDuaHandler({ context: HARD, locale })
    const cr = (response as Record<string, unknown>).crisis_resource as
      | { level?: string; locale?: string; text?: string }
      | undefined
    if (!cr) {
      results.push(fail(`crisis ${locale} block present`, 'crisis_resource missing'))
      continue
    }
    results.push(
      cr.locale === locale
        ? pass(`crisis ${locale} declares locale="${locale}"`)
        : fail(`crisis ${locale} declares locale`, `got ${cr.locale}`),
    )
    const text = cr.text ?? ''
    const missing = must.filter((m) => !text.includes(m))
    results.push(
      missing.length === 0
        ? pass(`crisis ${locale} contains verified in-country numbers`)
        : fail(`crisis ${locale} verified numbers`, `missing: ${missing.join(', ')}`),
    )
    const leaked = UK_US_MARKERS.filter((m) => text.includes(m))
    results.push(
      leaked.length === 0
        ? pass(`crisis ${locale} has no UK/US numbers`)
        : fail(`crisis ${locale} no UK/US numbers`, `found: ${leaked.join(', ')}`),
    )
    results.push(
      /iasp\.info/i.test(text)
        ? pass(`crisis ${locale} includes IASP directory`)
        : fail(`crisis ${locale} IASP directory`, 'IASP link missing'),
    )
  }
  // en: Samaritans + IASP; 988 only once the Founder has verified it (WO#385).
  const en = await getDuaHandler({ context: HARD, locale: 'en' })
  const enCr = (en as Record<string, unknown>).crisis_resource as
    | { locale?: string; text?: string }
    | undefined
  const enText = enCr?.text ?? ''
  const enOk =
    enCr?.locale === 'en' &&
    enText.includes('Samaritans') &&
    enText.includes('116 123') &&
    enText.includes('988') === US_988_FOUNDER_VERIFIED &&
    /iasp\.info/i.test(enText)
  results.push(
    enOk
      ? pass(`crisis en: Samaritans + IASP, 988 ${US_988_FOUNDER_VERIFIED ? 'present (Founder-verified)' : 'held (not Founder-verified)'}`)
      : fail('crisis en', `en block: ${JSON.stringify(enCr)}`),
  )
}

// WO#385 rulings: Befrienders Cairo removed (Egypt -> IASP); 24/7 lines first;
// every limited-hours line carries its hours.
async function testCrisisOrderingAndHours() {
  console.log('\n=== crisis blocks: 24/7 first, hours on limited lines, Cairo removed (WO#385) ===')
  // WO#481: the localised blocks; isolate marks are removed before matching,
  // and the localised hours come from the generated table (never retyped).
  const text = (hint: Parameters<typeof distressBlockFor>[0], l: 'en' | 'id' | 'ur' | 'ar' | 'tr') =>
    ((distressBlockFor(hint, l) as { text?: string } | undefined)?.text ?? '').replace(/[\u2066-\u2069]/g, '')
  const OFFICE_ID = 'Senin\u2013Jumat, jam kantor'
  // [type, locale, 24/7 numbers, limited-hours numbers with their hours]
  const plan: Array<['self-harm' | 'abuse', 'en' | 'id' | 'ur' | 'ar' | 'tr', string[], Array<[string, string]>]> = [
    ['self-harm', 'id', ['119, lalu tekan 8'], [['1500-567', OFFICE_ID]]],
    ['self-harm', 'ur', ['03117786264'], [['03041111741', L10N_HOURS.ur.business]]],
    ['self-harm', 'ar', ['1564'], [['920033360', L10N_HOURS.ar.saudi], ['8004673', L10N_HOURS.ar.uae]]],
    ['self-harm', 'tr', ['112'], []],
    ['abuse', 'id', ['129 ('], [['021-3903963', OFFICE_ID]]],
    ['abuse', 'ur', ['1098'], [['03041111741', L10N_HOURS.ur.business]]],
    ['abuse', 'ar', ['1919', '800111', '15115', ' 110 '], [['0801004747', L10N_HOURS.ar.office]]],
    ['abuse', 'tr', ['183', '112'], []],
  ]
  for (const [type, l, always, limited] of plan) {
    const t = text({ level: 'hard', crisisType: type }, l)
    const firstLimited = Math.min(...limited.map(([n]) => t.indexOf(n)))
    const ok247 = always.every((n) => t.includes(n) && t.indexOf(n) < firstLimited)
    const hoursOk = limited.every(([n, h]) => t.includes(n) && t.indexOf(h, t.indexOf(n)) > t.indexOf(n))
    results.push(
      ok247 && hoursOk && firstLimited >= 0
        ? pass(`${type}/${l}: 24/7 lines first, limited lines carry their hours`)
        : fail(`${type}/${l} ordering/hours`, t),
    )
  }
  const all = (['en', 'id', 'ur', 'ar', 'tr'] as const).flatMap((l) => [
    text({ level: 'hard', crisisType: 'self-harm' }, l),
    text({ level: 'hard', crisisType: 'abuse' }, l),
  ])
  results.push(
    all.every((t) => !t.includes('762 2381') && !/Befrienders/.test(t))
      ? pass('Befrienders Cairo 762 2381 is in no block')
      : fail('Befrienders Cairo', 'still present'),
  )
  const arSelf = text({ level: 'hard', crisisType: 'self-harm' }, 'ar')
  // WO#481: the ar T3 sentence names Egypt and the other regions (Gem 1).
  results.push(
    arSelf.includes(L10N_STRINGS.ar.T3.split('[IASP]')[0]!) && /iasp\.info/.test(arSelf)
      ? pass('ar self-harm: Egypt is served by the IASP directory')
      : fail('ar Egypt via IASP', arSelf),
  )
}

// WO#385: abuse gets its own block (forked pathway), never the self-harm one,
// with only Founder-verified DV lines from src/data/helplines.ts.
async function testAbuseBlock() {
  console.log('\n=== get_dua abuse block (WO#385 forked pathway) ===')
  const helplines = readFileSync(new URL('../../src/data/helplines.ts', import.meta.url), 'utf-8')
  const DV: Record<string, string[]> = {
    en: ['0808 2000 247'],
    id: ['129', '021-3903963'],
    ur: ['1098', '0304-111-1741'],
    ar: ['1919', '800-111', '15115', '110', '0801 00 47 47'],
    // WO#481: never the WhatsApp number (not a phone: in helplines.ts).
    tr: ['183', '112'],
  }
  const cases: Array<[string, 'en' | 'id' | 'ur' | 'ar' | 'tr']> = [
    ['my husband hits me', 'en'],
    ['he beats me', 'en'],
    ['I am being abused', 'en'],
    ['my husband hits me', 'id'],
    ['mera shohar mujhe marta hai', 'ur'],
    ['my husband hits me', 'ar'],
    ['kocam beni dövüyor', 'tr'],
    ['my husband hits me', 'tr'],
  ]
  // WO#481: the abuse block opens with Gem 3's sentence in the request locale.
  const opening = (l: string) =>
    l === 'en' ? ABUSE_SENTENCE : (['T6a', 'T6b', 'T6c'] as const).map((k) => L10N_STRINGS[l as 'ar' | 'ur' | 'id' | 'tr'][k]).join(' ')
  for (const [q, locale] of cases) {
    const r = (await getDuaHandler({ context: q, locale })) as unknown as {
      _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }
      content: { context?: string }
      crisis_resource?: { level?: string; crisis_type?: string; locale?: string; directive?: string; text?: string }
    }
    const cr = r.crisis_resource
    const text = cr?.text ?? ''
    const dir = cr?.directive ?? ''
    const ok =
      cr?.level === 'hard' &&
      cr.crisis_type === 'abuse' &&
      cr.locale === locale &&
      !/harming yourself/i.test(text) &&
      // WO#481: ar and ur render numbers digits only (Gem 10 condition 2).
      DV[locale].every((n) => text.includes(locale === 'ar' || locale === 'ur' ? n.replace(/[ -]/g, '') : n) && helplines.includes(`phone: '${n}'`)) &&
      /confrontation/.test(dir) &&
      /just leave/.test(dir) &&
      /couples counselling/.test(dir) &&
      /sabr/.test(dir) &&
      r._sakina_meta.content_type === 'crisis_resource_only' &&
      text.startsWith(opening(locale)) &&
      !('duas' in (r.content as object)) &&
      r.content.context === undefined &&
      r._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => d.includes("Do NOT add du'as")) &&
      !r._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => /rephrase/i.test(d))
    results.push(
      ok
        ? pass(`abuse "${q}" (${locale}): Gem 3 sentence, verified DV lines, no self-harm wording, no du'as at all`)
        : fail(`abuse "${q}" (${locale})`, JSON.stringify({ ct: r._sakina_meta.content_type, cr })),
    )
  }
  const selfHarm = distressBlockFor({ level: 'hard', crisisType: 'self-harm' }, 'en') as { crisis_type?: string; text?: string }
  results.push(
    selfHarm.crisis_type === 'self-harm' && !selfHarm.text?.includes('0808 2000 247')
      ? pass('self-harm block carries no abuse lines')
      : fail('self-harm block', JSON.stringify(selfHarm)),
  )
}

// WO#385, Gem 2 ruling: the basmala is not part of ayah 1 except 1:1.
// Tested against the RECORDED upstream ayah 1 of all 114 surahs
// (evals/fixtures/alquran-ayah1, CI run 36184881437): for the 112 affected
// ayat, the result is an exact byte tail of the input, the removed part is
// exactly one of the two recorded prefixes, and nothing still starts with a
// basmala. 1:1 keeps its basmala (BOM removed); 9:1 is unchanged.
async function testBasmalaGuards() {
  console.log('\n=== basmala removal on recorded upstream ayah 1 (WO#385, Gem 2) ===')
  results.push(STRIP_PREFIXED_BASMALA === true ? pass('STRIP_PREFIXED_BASMALA is ON (Gem 2 ruling)') : fail('basmala flag', 'expected true'))
  const dir = new URL('../evals/fixtures/alquran-ayah1/', import.meta.url)
  const upstream = (s: number) =>
    (JSON.parse(readFileSync(new URL(`${s}.json`, dir), 'utf-8')) as { data: Array<{ text: string }> }).data[0].text
  const nfc = (x: string) => x.normalize('NFC')
  const basmalaStarts = [BASMALA_PREFIX_PLAIN, BASMALA_PREFIX_SHADDA].flatMap((p) => [p, nfc(p), p.trimEnd(), nfc(p).trimEnd()])
  const warned: string[] = []
  const realWarn = console.warn
  console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(' ')) }
  try {
    const bad: string[] = []
    let plain = 0
    let shadda = 0
    for (let s = 2; s <= 114; s++) {
      if (s === 9) continue
      const input = upstream(s)
      const out = stripPrependedBasmala(s, 1, input)
      const inB = Buffer.from(input, 'utf-8')
      const outB = Buffer.from(out, 'utf-8')
      const tail = outB.length < inB.length && inB.subarray(inB.length - outB.length).equals(outB)
      const removed = input.slice(0, input.length - out.length)
      if (removed === BASMALA_PREFIX_PLAIN) plain++
      else if (removed === BASMALA_PREFIX_SHADDA) shadda++
      const stillBasmala = basmalaStarts.some((p) => out.startsWith(p) || nfc(out).startsWith(p))
      if (!tail || (removed !== BASMALA_PREFIX_PLAIN && removed !== BASMALA_PREFIX_SHADDA) || stillBasmala || out.length === 0) bad.push(String(s))
    }
    results.push(
      bad.length === 0 && plain + shadda === 112
        ? pass(`112 recorded ayat: each result is an exact byte tail, the removed part is a recorded prefix (A ${plain}, B ${shadda}), none still starts with a basmala`)
        : fail('112 recorded ayat', `bad surahs: ${bad.join(', ')}; A ${plain}, B ${shadda}`),
    )
    const s1 = upstream(1)
    results.push(
      s1.startsWith('\uFEFF') && stripPrependedBasmala(1, 1, s1) === s1.slice(1) && s1.slice(1).startsWith(BASMALA_PREFIX_PLAIN.trimEnd())
        ? pass('1:1 keeps its basmala (it is the ayah); only the upstream BOM is removed')
        : fail('1:1', JSON.stringify(stripPrependedBasmala(1, 1, s1))),
    )
    const s9 = upstream(9)
    results.push(stripPrependedBasmala(9, 1, s9) === s9 ? pass('9:1 unchanged (no basmala)') : fail('9:1', 'changed'))
    const s97 = upstream(97)
    results.push(stripPrependedBasmala(97, 1, s97, false) === s97 ? pass('flag OFF: 97:1 served as upstream') : fail('flag off', 'changed'))
    const later = `${BASMALA_PREFIX_PLAIN}x`
    results.push(
      stripPrependedBasmala(2, 2, later) === later && stripPrependedBasmala(27, 30, later) === later
        ? pass('ayah 2+ bypass even when the text starts with the prefix (2:2, 27:30)')
        : fail('ayah 2+ bypass', 'stripped'),
    )
    warned.length = 0
    const before = getBasmalaPrefixMismatchCount()
    const odd = 'Z' + upstream(50).slice(1)
    const r1 = stripPrependedBasmala(50, 1, odd)
    stripPrependedBasmala(51, 1, 'Z' + upstream(51).slice(1))
    results.push(
      r1 === odd &&
        getBasmalaPrefixMismatchCount() - before === 2 &&
        warned.length === 1 &&
        warned[0] === '[quran] basmala prefix mismatch on an ayah 1; served unchanged (count in /stats)' &&
        !/\b5[01]\b/.test(warned[0])
        ? pass('unrecognised ayah-1 start: unchanged, counted (2), one generic log line with no verse reference')
        : fail('no-match path', JSON.stringify({ same: r1 === odd, delta: getBasmalaPrefixMismatchCount() - before, warned })),
    )
    const nfcOnly = nfc(upstream(97))
    results.push(
      nfcOnly !== upstream(97) && stripPrependedBasmala(97, 1, nfcOnly) === nfcOnly
        ? pass('an NFC-normalised 97:1 (not upstream bytes) is NOT matched: exact bytes only')
        : fail('exact-bytes', 'NFC text was stripped'),
    )
  } finally {
    console.warn = realWarn
  }
}

// WO#385 ruling: Name normalisation affects lookup only, never output text.
async function testNameOutputUnchanged() {
  console.log('\n=== Name lookup normalisation never alters output (WO#385) ===')
  const names = JSON.parse(readFileSync(new URL('../data/names.json', import.meta.url), 'utf-8')) as Array<{ number: number; arabic: string }>
  const bare = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '')
  const bad: number[] = []
  for (const n of names) {
    const r = (await getNameOfAllahHandler({ name: bare(n.arabic) })) as unknown as {
      content: { number?: number; arabic?: string; name_block?: string }
    }
    const ok = r.content.number === n.number && r.content.arabic === n.arabic && Boolean(r.content.name_block?.includes(`Arabic: ${n.arabic}`))
    if (!ok) bad.push(n.number)
  }
  results.push(
    bad.length === 0
      ? pass(`bare-Arabic lookup returns the stored diacritised text for all ${names.length} Names`)
      : fail('Name output', `mismatch for ${bad.join(', ')}`),
  )
}

// WO#385 item 4: ur/id verse translations parked. The upstream is stubbed
// with the payloads observed live on 25 Sep 2026 (ur.jalandhri returned
// Arabic; the uthmani edition prefixes the basmala to 97:1, and 1:1 carried
// a BOM), so this runs without network.
async function testQuranParkedLocales() {
  console.log('\n=== get_quran_verse: ur/id parked, 97:1 basmala, 1:1 BOM (stubbed upstream) ===')
  // Recorded upstream bodies (CI runs 36184881437, 36185119553), served
  // byte for byte for the edition pair the server requests. Any other
  // edition (ur.jalandhri, id.indonesian) gets a 404.
  const recorded = (key: string) => {
    const [s, a] = key.split(':')
    const file = a === '1' ? `../evals/fixtures/alquran-ayah1/${s}.json` : `../evals/fixtures/alquran-verses/${s}_${a}.json`
    return readFileSync(new URL(file, import.meta.url))
  }
  const field = (key: string, i: 0 | 1) => (JSON.parse(recorded(key).toString('utf-8')) as { data: Array<{ text: string }> }).data[i].text
  const AR: Record<string, string> = { '2:286': field('2:286', 0), '97:1': field('97:1', 0), '1:1': field('1:1', 0) }
  // WO#444: the English is the bundled Pickthall (data/pickthall.json), not the
  // upstream's. The recorded upstream English differs at the verse end (control).
  const EN: Record<string, string> = { '2:286': bundledPickthall(2, 286)!, '97:1': bundledPickthall(97, 1)!, '1:1': bundledPickthall(1, 1)! }
  results.push(
    Object.keys(EN).every((k) => EN[k] && EN[k] !== field(k, 1))
      ? pass('control: the recorded upstream English differs from the bundled Pickthall for 2:286, 97:1 and 1:1 (so a match below proves the bundle is served)')
      : fail('control: upstream vs bundled English', JSON.stringify(Object.keys(EN).map((k) => [k, EN[k], field(k, 1)]))),
  )
  const requested: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url)
    requested.push(u)
    const m = u.match(/ayah\/(\d+:\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{"code":404}', { status: 404 })
    return new Response(recorded(m[1]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const ARABIC = /[؀-ۿ]/
  try {
    for (const locale of ['ur', 'id'] as const) {
      for (const [surah, ayah] of [[2, 286], [97, 1], [1, 1]] as const) {
        requested.length = 0
        const r = (await getQuranVerseHandler({ surah, ayah, locale })) as unknown as {
          _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }
          content: { translation: string; translation_source: string; translation_language: string; translation_note?: string }
        }
        const c = r.content
        const lang = locale === 'ur' ? 'Urdu' : 'Indonesian'
        const ok =
          r._sakina_meta.content_type === 'quran_verse' &&
          requested.every((u) => u.includes('en.pickthall')) &&
          !ARABIC.test(c.translation) &&
          c.translation === EN[`${surah}:${ayah}`] &&
          c.translation_source === 'Pickthall' &&
          c.translation_language === 'en' &&
          (c.translation_note ?? '').includes(`licensed ${lang} translation is not yet available`) &&
          r._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => d.includes(`MUST NOT translate it into ${lang}`))
        results.push(
          ok
            ? pass(`${locale} ${surah}:${ayah} returns Pickthall English with the parked note`)
            : fail(`${locale} ${surah}:${ayah} parked`, JSON.stringify({ requested, c })),
        )
      }
    }
    for (const locale of ['en', 'ar'] as const) {
      const r = (await getQuranVerseHandler({ surah: 2, ayah: 286, locale })) as unknown as {
        content: { translation_note?: string; translation: string }; _sakina_meta: { llm_directives: { CRITICAL_RULES: string[] } }
      }
      results.push(
        !r.content.translation_note && r.content.translation === EN['2:286'] && !r._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => d.includes('not yet available'))
          ? pass(`${locale} 2:286 unchanged (Pickthall, no parked note)`)
          : fail(`${locale} 2:286`, JSON.stringify(r.content)),
      )
    }
    const q97 = (await getQuranVerseHandler({ surah: 97, ayah: 1, locale: 'en' })) as unknown as { content: { arabic_text: string } }
    results.push(
      q97.content.arabic_text === AR['97:1'].slice(BASMALA_PREFIX_SHADDA.length) && AR['97:1'].startsWith(BASMALA_PREFIX_SHADDA)
        ? pass('97:1 through the handler: the recorded prefix (form B) removed, the rest byte for byte')
        : fail('97:1 handler', JSON.stringify(q97.content.arabic_text)),
    )
    const q11 = (await getQuranVerseHandler({ surah: 1, ayah: 1, locale: 'en' })) as unknown as { content: { arabic_text: string } }
    results.push(
      AR['1:1'].startsWith('\uFEFF') && q11.content.arabic_text === AR['1:1'].slice(1)
        ? pass('1:1 keeps the basmala (it is the ayah), BOM removed')
        : fail('1:1', JSON.stringify(q11.content.arabic_text)),
    )
  } finally {
    globalThis.fetch = realFetch
  }
}

// WO#385 item 5: deterministic phrase matching. Crisis runs on the full raw
// input first; a phrase that also carries a crisis keyword keeps its block.
async function testDuaPhrases() {
  console.log('\n=== get_dua: natural-language phrases (WO#385) ===')
  const cases: Array<[string, string]> = [
    ['I lost my job', 'work-success'],
    ['feeling sick today', 'health-healing'],
    ['I have an exam tomorrow', 'exams-study'],
    ["I can't sleep", 'before-sleep'],
    ['what to say on laylat al qadr', 'laylat-al-qadr'],
    ['anxiety', 'stress-anxiety'],
    ['morning', 'morning-adhkar'],
  ]
  for (const [q, want] of cases) {
    const r = (await getDuaHandler({ context: q })) as unknown as { _sakina_meta: { content_type: string }; content: { context?: string } }
    results.push(
      r._sakina_meta.content_type === 'dua_collection' && r.content.context === want
        ? pass(`"${q}" -> ${want}`)
        : fail(`"${q}"`, `got ${r._sakina_meta.content_type} ${r.content.context}`),
    )
  }
  const none = (await getDuaHandler({ context: 'xyzzy blorp' })) as unknown as { _sakina_meta: { content_type: string } }
  results.push(none._sakina_meta.content_type === 'not_found' ? pass('unknown phrase -> not_found') : fail('unknown phrase', none._sakina_meta.content_type))
  const crisis = (await getDuaHandler({ context: 'grief after losing my mother and I want to kill myself' })) as unknown as {
    crisis_resource?: { level?: string }
  }
  results.push(
    crisis.crisis_resource?.level === 'hard'
      ? pass('phrase with a crisis keyword still carries the hard crisis block')
      : fail('phrase crisis', JSON.stringify(crisis.crisis_resource)),
  )
  for (const [q, ct] of [['grief after losing my mother and I want to kill myself', 'crisis_resource_only'], ['my husband hits me', 'crisis_resource_only']] as const) {
    const r = (await getDuaHandler({ context: q })) as unknown as { _sakina_meta: { content_type: string }; crisis_resource?: { level?: string } }
    results.push(
      r._sakina_meta.content_type === ct && r.crisis_resource?.level === 'hard'
        ? pass(`hard crisis "${q}": crisis block, no du'a list inferred from the phrase`)
        : fail(`hard crisis "${q}"`, `got ${r._sakina_meta.content_type}`),
    )
  }
}

// WO#388-B (Gem 3, 27 Sep 2026): get_dua returns the crisis block alone on
// EVERY hard crisis. Zero leakage: exact key sets, no du'a-shaped key
// anywhere, no du'a Arabic in the payload, no grading directive; a safe
// query still returns du'as.
async function testDuaCrisisOnly() {
  console.log("\n=== get_dua hard crisis: block only (WO#388-B) ===")
  type R = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; content: Record<string, unknown>; crisis_resource?: { level?: string; crisis_type?: string } }
  const DUA_KEYS = ['duas', 'dua_block', 'title', 'arabic', 'transliteration', 'translation', 'source', 'grading', 'grading_status', 'grading_directive', 'grading_summary', 'context', 'matched_by', 'teaching_note', 'total_results', 'total_available', 'truncated', 'more', 'no_records_yet', 'see_also']
  const keysDeep = (o: unknown, acc: string[] = []): string[] => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.push(k); keysDeep(v, acc) }
    return acc
  }
  const safe = (await getDuaHandler({ context: 'anxiety' })) as unknown as R
  const safeDuas = (safe.content.duas as Array<{ arabic: string }> | undefined) ?? []
  results.push(
    safe._sakina_meta.content_type === 'dua_collection' && safeDuas.length > 0
      ? pass(`safe query "anxiety" -> dua_collection, ${safeDuas.length} du'as (WO#388-B control)`)
      : fail('safe control', JSON.stringify(safe.content)),
  )
  // Crisis phrases whose words would otherwise resolve to a du'a category.
  for (const [label, q, type] of [
    ['self-harm', 'I want to kill myself', 'self-harm'],
    ['self-harm + anxiety words', 'my anxiety is so bad I want to kill myself', 'self-harm'],
    ['self-harm + grief words', 'grief after losing my mother and I want to kill myself', 'self-harm'],
    ['abuse', 'my husband hits me', 'abuse'],
  ] as const) {
    const r = (await getDuaHandler({ context: q })) as unknown as R
    const json = JSON.stringify(r)
    const problems: string[] = []
    if (r._sakina_meta.content_type !== 'crisis_resource_only') problems.push(`content_type ${r._sakina_meta.content_type}`)
    if (r.crisis_resource?.level !== 'hard' || r.crisis_resource?.crisis_type !== type) problems.push(`crisis_resource ${JSON.stringify(r.crisis_resource)}`)
    if (Object.keys(r).sort().join() !== '_sakina_meta,content,crisis_resource') problems.push(`top-level ${Object.keys(r)}`)
    if (Object.keys(r.content).sort().join() !== 'reason,requested,withheld') problems.push(`content ${Object.keys(r.content)}`)
    // requested echoes the caller's own input and nothing else.
    const { requested, ...rest } = r.content
    if (JSON.stringify(requested) !== JSON.stringify({ context: q })) problems.push(`requested ${JSON.stringify(requested)}`)
    const hit = keysDeep(rest).filter((k) => DUA_KEYS.includes(k))
    if (hit.length) problems.push(`du'a keys ${hit}`)
    const arabicHit = safeDuas.find((d) => json.includes(d.arabic))
    if (arabicHit) problems.push("du'a Arabic in payload")
    if (r._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => /grading/i.test(d))) problems.push('grading directive present')
    results.push(
      !problems.length
        ? pass(`${label} crisis -> crisis_resource_only, zero du'a leakage (WO#388-B)`)
        : fail(`${label} crisis leakage`, problems.join('; ')),
    )
  }
}

// WO#385 (Gem 3): du'as on abuse inputs. 1.4.1 ships an empty allowlist
// (block only). The mechanism is tested through abuseResponse(): allowlisted
// du'as come after the block under the ordering directive, and a
// sabr/endurance du'a is dropped even when it is on the list.
async function testAbuseAllowlist() {
  console.log("\n=== abuse du'a allowlist mechanism (WO#385) ===")
  results.push(ABUSE_SAFE_DUAS.length === 0 ? pass('ABUSE_SAFE_DUAS is empty in 1.4.1') : fail('ABUSE_SAFE_DUAS', JSON.stringify(ABUSE_SAFE_DUAS)))
  const endurance = ['D00018', 'D00051', 'D00067', 'D00303', 'D00304', 'D00331', 'D00408']
  const kept = selectAbuseSafeDuas(['D00066', ...endurance, 'NOT-AN-ID']).map((d) => d.title)
  results.push(
    kept.length === 1 && endurance.every((id) => isEnduranceDua(id)) && !isEnduranceDua('D00066')
      ? pass(`sabr/endurance du'as dropped even when allowlisted (${endurance.join(', ')})`)
      : fail('endurance filter', JSON.stringify({ kept, flags: endurance.map((id) => [id, isEnduranceDua(id)]) })),
  )
  const block = distressBlockFor({ level: 'hard', crisisType: 'abuse' }, 'en')
  const withList = abuseResponse('my husband hits me', { crisis_resource: block }, ['D00066', 'D00067']) as unknown as {
    _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }
    content: { duas?: Array<{ title: string }> }
    crisis_resource?: { crisis_type?: string }
  }
  results.push(
    withList._sakina_meta.content_type === 'dua_collection' &&
      withList.content.duas?.length === 1 &&
      withList.crisis_resource?.crisis_type === 'abuse' &&
      withList._sakina_meta.llm_directives.CRITICAL_RULES.includes(ABUSE_ORDER_DIRECTIVE)
      ? pass('allowlist path: block kept, endurance du\'a dropped, ordering directive present')
      : fail('allowlist path', JSON.stringify(withList).slice(0, 400)),
  )
  const empty = abuseResponse('my husband hits me', { crisis_resource: block }, ABUSE_SAFE_DUAS) as unknown as { _sakina_meta: { content_type: string } }
  results.push(empty._sakina_meta.content_type === 'crisis_resource_only' ? pass('empty allowlist: crisis_resource_only') : fail('empty allowlist', empty._sakina_meta.content_type))
}

// WO#377 fast-track labels (Gem 2 ruling, 25 Sep 2026): the seven clause
// records carry origin "quran" and the module's clause bytes. Each resolved
// clause is an exact byte slice of the module ayah (a suffix: the clause
// runs to the end of the ayah), and D00154/D00179 keep their hadith source.
//
// WO#392: no word index is hard-coded here. The plan is FASTTRACK_RATIFIED
// itself; the expected bytes are each label's own resolver; and the ground
// truth that does not move with the resolver is Gem 2's ruled first and last
// words (anchors), compared by skeleton. The old hard-coded plan split the
// STRIPPED ayah (getVerseArabic) with indexes authored against the STORED
// text (getVerseClause), so WO#387's seat-space strip shifted 3:173 by one
// word and failed D00003/D00504 although the bundle was right.
async function testFastTrackLabels() {
  console.log('\n=== WO#377 fast-track Quranic labels (Gem 2 ruling) ===')
  const bundled = JSON.parse(readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as Array<{
    id: string; arabic: string; category: string; origin?: string; quran_ref?: string; countSource?: string
  }>
  const EXPECTED_IDS = ['D00003', 'D00504', 'D00330', 'D00154', 'D00179', 'D00308']
  const planIds = FASTTRACK_RATIFIED.map((l) => l.id)
  results.push(
    JSON.stringify([...planIds].sort()) === JSON.stringify([...EXPECTED_IDS].sort())
      ? pass('fast-track plan is the six Gem 2 labels (D00091 held)')
      : fail('fast-track plan', JSON.stringify(planIds)),
  )
  for (const label of FASTTRACK_RATIFIED) {
    const { id, ref } = label
    const d = bundled.find((x) => x.id === id)!
    const expected = label.resolve()
    const ayahText = getVerseArabic(ref)
    const ayah = Buffer.from(ayahText, 'utf-8')
    const clause = Buffer.from(d.arabic, 'utf-8')
    const isSlice = ayah.length > clause.length && ayah.subarray(ayah.length - clause.length).equals(clause)
    // Where the clause starts in the ayah as served, derived, not assumed.
    const ayahWords = ayahText.split(' ')
    const clauseWords = d.arabic.split(' ')
    const startWord = ayahWords.length - clauseWords.length
    const wholeWords = startWord > 0 && ayahWords.slice(startWord).join(' ') === d.arabic
    const [first, last] = label.anchors ?? ['', '']
    const anchored =
      !!label.anchors &&
      skeleton(clauseWords[0]) === skeleton(first) &&
      skeleton(clauseWords[clauseWords.length - 1]) === skeleton(last)
    const ok =
      d.origin === 'quran' && d.quran_ref === ref && d.arabic === expected && isSlice && wholeWords && anchored &&
      !d.arabic.includes('\u08F0')
    results.push(
      ok
        ? pass(`${id}: origin quran, Quran ${ref} clause from served word ${startWord} to the end, an exact byte slice of the ayah, starting and ending on Gem 2's ruled words`)
        : fail(`${id} label`, JSON.stringify({ origin: d.origin, ref: d.quran_ref, same: d.arabic === expected, isSlice, wholeWords, anchored, startWord })),
    )
  }
  results.push(
    // WO#413 — the registry is the count: 3 tier-1 + 6 fast-track + the WO#413 A/B rows
    bundled.filter((x) => x.origin === 'quran').length === QURANIC_LABELS.length
      ? pass(`${QURANIC_LABELS.length} records labelled origin quran (every registry row)`)
      : fail('labelled count', String(bundled.filter((x) => x.origin === 'quran').length)),
  )
  // WO#413: the D00091/D00092 title swap was ruled (D00092 class C, replaced
  // with 3:38), so D00091 carries Gem 2's standing ruling: 25:74 from word 2.
  const d91 = bundled.find((x) => x.id === 'D00091')!
  results.push(
    d91.origin === 'quran' && d91.quran_ref === '25:74' && d91.arabic === getVerseClause('25:74', 2)
      ? pass('D00091 labelled 25:74 from word 2 (Gem 2, WO#377; released by the WO#413 title ruling)')
      : fail('D00091 label', JSON.stringify({ origin: d91.origin, ref: d91.quran_ref })),
  )
  for (const [ctx, title] of [['morning', 'Morning Dua/ Athkar (Recite Seven Times)'], ['evening', 'Evening Dua/ Athkar (Recite Seven Times)']] as const) {
    // WO#478 (review fix 2): the 9:129 record is the 12th of morning-adhkar
    // and the 11th of evening-adhkar, reached by context through paging
    // (offset 10, limit 10), as an agent would.
    const r = (await getDuaHandler({ context: ctx, offset: 10, limit: 10 })) as unknown as {
      content: { duas: Array<{ title: string; dua_block: string; source: string; quran_citation?: string; hadith_source?: string; hadith_grading_status?: string }> }
    }
    const d = r.content.duas.find((x) => x.title === title)!
    results.push(d ? pass(`${ctx}: the 9:129 record "${title}" is reached by context at offset 10`) : fail(`${ctx}: 9:129 record not on the page at offset 10`, r.content.duas.map((x) => x.title).join(' | ')))
    // WO#423: the reference is Gem 4's locked string (it carries its grading
    // in parentheses), read from the bundle rather than retyped here.
    const ref = bundled.find((x) => x.category === `${ctx}-adhkar` && x.quran_ref === '9:129')?.countSource ?? ''
    const ok =
      ref.startsWith('Sunan Abī Dāwūd 5081 (') &&
      d.quran_citation === 'Quran 9:129' &&
      d.hadith_source === ref &&
      d.hadith_grading_status === 'graded' &&
      d.dua_block.includes('Origin: Quran 9:129') &&
      d.dua_block.includes(`Source: ${ref}`) &&
      !d.dua_block.includes('Source: Quran 9:129')
    results.push(
      ok
        ? pass(`${ctx}: 9:129 record shows Origin Quran 9:129 AND Source Sunan Abi Dawud 5081, graded (labelling rule; WO#423)`)
        : fail(`${ctx} hadith source`, d.dua_block.split('\n').filter((l) => !l.startsWith('Arabic')).join(' || ')),
    )
  }
}

// WO#386 item D: the querier's own grief routes to 'bereaved', a funeral
// rite or the person who has died to 'deceased'. Gem 4 ruled the bereaved
// du'as (26 Sep 2026) by their Arabic; the ids are re-checked against it.
const GEM4_BEREAVED_ARABIC: readonly string[] = [
  "إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ اللهُمَّ أْجُرْنِي فِي مُصِيبَتِي، وَأَخْلِفْ لِي خَيْرًا مِنْهَا",
  "اَللّٰهُمَّ لَا سَهْلَ إِلاَّ مَا جَعَلْتَهُۥ سَهْلًا وَأَنْتَ تَجْعَلُ الْحَزَنَ إِذَا شِئْتَ سَهْلًا",
  "اَللّٰهُمَّ رَحْمَتَكَ أَرْجُوْا فَلَا تَكِلْنِيْ إِلٰى نَفْسِيْ طَرْفَةَ عَيْنٍ وَّأَصْلِحْ لِيْ شَأْنِيْ كُلَّهُۥ لَآ إِلٰهَ إِلَّآ أَنْتَ",
  "لَآ إِلٰهَ إِلَّا اللهُ الْعَظِيْمُ الْحَلِيْمُ لَآ إِلٰهَ إِلَّا اللهُ رَبُّ الْعَرْشِ الْعَظِيْمِ لَآ إِلٰهَ إِلَّا اللهُ رَبُّ السَّمٰوٰتِ وَرَبُّ الْأَرْضِ وَ رَبُّ الْعَرْشِ الْكَرِيْمِ",
  "حَسۡبُنَا ٱللَّهُ وَنِعۡمَ ٱلۡوَكِيلُ",
  // WO#413: D00518 now serves the 9:129 clause from the module (as D00504's
  // 3:173 entry above already does since WO#377); same words, Uthmani bytes.
  getVerseClause('9:129', 3),
  "لَاحَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ"
]
const GEM4_EXCLUDED_ARABIC = "لَآ إِلٰهَ إِلَّا اَنْتَ سُبْحَانَكَ إِنِّيْ كُنْتُ مِنَ الظَّالِمِيْنَ"
const GEM4_GENDER_NOTE = "These du'as use the masculine form in the Arabic; the meaning and reward apply equally regardless of the gender of the person making the supplication."

async function testBereavedRoute() {
  console.log('\n=== get_dua: bereaved route (WO#386) ===')
  // WO#435: alef-agnostic, as the WO#412 scan's rasm. Gem 2's batch 3 text
  // spells D00503 أَرْجُو (not أَرْجُوْا) and D00502 إِلَهَ (no dagger alef):
  // the same words, a different alef count. Every other letter must match.
  const k = (x: string) => skeleton(x).replace(/\s+/g, '').replace(/\u0627/g, '')
  const byId = new Map(BUNDLED_FULL.map((d) => [d.id, d]))
  // control: the key still tells two different du'as apart (D00501 is not D00503's du'a)
  results.push(k(byId.get('D00501')!.arabic) !== k(GEM4_BEREAVED_ARABIC[2]) ? pass('BEREAVED key control: a different du\'a (D00501) does not match Gem 4\'s D00503 Arabic') : fail('BEREAVED key control', 'D00501 matched'))
  const idsOk =
    BEREAVED_DUAS.length === GEM4_BEREAVED_ARABIC.length &&
    BEREAVED_DUAS.every((id, i) => byId.get(id)?.category === 'calamity' && k(byId.get(id)!.arabic) === k(GEM4_BEREAVED_ARABIC[i]))
  results.push(idsOk ? pass('BEREAVED_DUAS: 7 calamity records, each matching Gem 4\'s Arabic, in Gem 4\'s order') : fail('BEREAVED_DUAS', JSON.stringify(BEREAVED_DUAS.map((id) => [id, byId.get(id)?.category]))))
  // WO#413: the excluded Yunus du'a (21:87 clause) now serves the same module
  // text in four records (calamity, pregnancy, repentance, health); none may be
  // in the bereaved set, and the calamity one Gem 4 named stays excluded.
  const excl = BUNDLED_FULL.filter((d) => k(d.arabic) === k(GEM4_EXCLUDED_ARABIC))
  results.push(
    excl.length >= 1 && excl.some((d) => BEREAVED_EXCLUDED.includes(d.id)) && excl.every((d) => !BEREAVED_DUAS.includes(d.id))
      ? pass(`Gem 4 exclusion ${BEREAVED_EXCLUDED.join(', ')} not in bereaved (nor its ${excl.length - 1} same-text records)`)
      : fail('exclusion', JSON.stringify(excl.map((d) => d.id))),
  )
  results.push(BEREAVED_GENDER_NOTE === GEM4_GENDER_NOTE ? pass('teaching note is Gem 4\'s wording, verbatim') : fail('teaching note', String(BEREAVED_GENDER_NOTE)))
  const route: Array<[string, 'bereaved' | 'deceased']> = [
    ['grief after losing my mother', 'bereaved'],
    ['I lost my mother', 'bereaved'],
    ['my father passed away', 'bereaved'],
    ['my mother passed away', 'bereaved'],
    ['grief after losing', 'bereaved'],
    ['grief', 'bereaved'],
    ['bereaved', 'bereaved'],
    ['bereavement', 'bereaved'],
    ['I was widowed last year', 'bereaved'],
    ['funeral', 'deceased'],
    ['dua at the funeral of my father', 'deceased'],
    ['deceased', 'deceased'],
    ['death', 'deceased'],
    ['loss', 'deceased'],
    ['condolences', 'deceased'],
  ]
  for (const [q, want] of route) {
    const got = griefRoute(q)
    results.push(got === want ? pass(`griefRoute "${q}" -> ${want}`) : fail(`griefRoute "${q}"`, got))
  }
  type R = {
    _sakina_meta: { content_type: string }
    content: { context?: string; duas?: Array<{ arabic: string; title: string }>; teaching_note?: string }
    crisis_resource?: { level?: string }
  }
  const want = BEREAVED_DUAS.map((id) => byId.get(id)!.arabic)
  for (const q of ['bereaved', 'grief after losing my mother', 'my mother passed away', 'I lost my mother', 'grief']) {
    const res = (await getDuaHandler({ context: q })) as unknown as R
    const got = (res.content.duas ?? []).map((d) => d.arabic)
    const ok =
      res._sakina_meta.content_type === 'dua_collection' &&
      res.content.context === 'bereaved' &&
      got.length === 7 && got.every((a, i) => k(a) === k(want[i])) &&
      res.content.teaching_note === GEM4_GENDER_NOTE &&
      res.crisis_resource?.level === 'soft'
    results.push(ok ? pass(`get_dua("${q}") -> bereaved: 7 du'as in Gem 4's order, teaching note, soft note kept`) : fail(`get_dua("${q}")`, JSON.stringify({ ct: res._sakina_meta.content_type, ctx: res.content.context, n: got.length, note: res.content.teaching_note, cr: res.crisis_resource })))
    results.push(assertNoUnicodeHonorific(`get_dua("${q}") no unicode honorific`, res))
  }
  const cal = (await getDuaHandler({ context: 'calamity', limit: 10 })) as unknown as R & { content: { total_available?: number } }
  results.push(
    // WO#435: 19 since D00516 and D00517 were withdrawn (was 21). WO#478: the
    // context serves at most 10 by call and reports 19 available; D00499 is
    // checked as the handler would serve it (getDuaRecordById).
    cal.content.context === 'calamity' && (cal.content.duas?.length ?? 0) === 10 && cal.content.total_available === 19 &&
    BUNDLED_FULL.filter((d) => d.category === 'calamity').length === 19 &&
    getDuaRecordById('D00499')?.arabic === BUNDLED_FULL.find((x: { id: string }) => x.id === 'D00499')?.arabic &&
    cal.content.teaching_note === undefined
      ? pass('calamity: 19 available, 10 served at limit 10 (D00499 bundled; D00516, D00517 withdrawn in WO#435), no teaching note')
      : fail('calamity', `${cal.content.context} ${cal.content.duas?.length} of ${cal.content.total_available}`),
  )
  const deceased = (await getDuaHandler({ context: 'deceased' })) as unknown as R
  results.push(deceased.content.teaching_note === undefined ? pass('deceased carries no teaching note') : fail('deceased note', String(deceased.content.teaching_note)))
  // WO#430: "visiting my mothers grave" is asserted end to end here, through
  // get_dua, not through griefRoute() alone: before WO#430 the full lookup sent
  // it to `mothers` (the parent word won), so a griefRoute-only test passed
  // while users were served the living-parent du'as.
  for (const q of ['funeral', 'dua for the deceased', 'deceased', 'visiting my mothers grave']) {
    const res = (await getDuaHandler({ context: q })) as unknown as R
    results.push(
      res._sakina_meta.content_type === 'dua_collection' && res.content.context === 'deceased' && (res.content as { total_available?: number }).total_available === 12 && (res.content.duas?.length ?? 0) === 3
        ? pass(`get_dua("${q}") -> deceased, 12 available, 3 served by default (WO#478)`)
        : fail(`get_dua("${q}")`, `${res._sakina_meta.content_type} ${res.content.context} ${res.content.duas?.length}`),
    )
  }
  const hard = (await getDuaHandler({ context: 'grief after losing my mother and I want to kill myself' })) as unknown as R
  results.push(
    hard._sakina_meta.content_type === 'crisis_resource_only' && hard.crisis_resource?.level === 'hard' && hard.content.context === undefined
      ? pass('hard crisis with grief words keeps the hard block and infers no context')
      : fail('hard crisis grief', JSON.stringify({ ct: hard._sakina_meta.content_type, cr: hard.crisis_resource?.level, ctx: hard.content.context })),
  )
}

// WO#386 item A: find_verses. The upstream is stubbed: the Arabic must be the
// scripture module's bytes whatever the upstream sends, and only the
// translation and surah names come from it.
async function testFindVerses() {
  console.log('\n=== find_verses (WO#386) ===')
  results.push(
    THEMATIC_INDEX.length > 0 && THEMATIC_INDEX.every((v) => v.arabic === getVerseArabic(v.ref))
      ? pass(`bundled index: all ${THEMATIC_INDEX.length} verses carry getVerseArabic bytes`)
      : fail('bundled index Arabic', THEMATIC_INDEX.filter((v) => v.arabic !== getVerseArabic(v.ref)).map((v) => v.ref).join(', ')),
  )
  type V = { reference: string; arabic: string; translation: string | null; translation_note?: string; surah_name_english?: string; relevance_note: string }
  type R = {
    _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }
    content: { verses?: V[]; no_results?: boolean; total_results?: number; withheld?: string; matched_themes?: Array<{ theme: string }> }
    crisis_resource?: { level?: string; crisis_type?: string }
  }
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async (url: string | URL) => {
    calls++
    const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\/quran-uthmani,en\.pickthall$/)
    if (!m) return new Response('{}', { status: 404 })
    const body = {
      code: 200,
      data: [
        { number: 1, text: 'UPSTREAM ARABIC MUST NOT BE USED', surah: { number: +m[1], name: 'SURAH-AR', englishName: 'Surah-En' } },
        { number: 1, text: `Pickthall ${m[1]}:${m[2]}` },
      ],
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    const p = (await findVersesHandler({ query: 'patience' })) as unknown as R
    const vs = p.content.verses ?? []
    results.push(
      p._sakina_meta.content_type === 'verse_collection' && vs.length > 0 && vs.length <= 5
        ? pass(`"patience" -> verse_collection, ${vs.length} verses (default limit 5)`)
        : fail('patience', JSON.stringify(p.content)),
    )
    results.push(
      vs.every((v) => v.arabic === getVerseArabic(v.reference) && v.translation === bundledPickthall(+v.reference.split(':')[0], +v.reference.split(':')[1]) && v.surah_name_english === 'Surah-En')
        ? pass('each verse: Arabic byte-equal to getVerseArabic, translation from the bundled Pickthall (WO#444), surah name from upstream')
        : fail('verse fields', JSON.stringify(vs.map((v) => [v.reference, v.arabic === getVerseArabic(v.reference), v.translation]))),
    )
    results.push(
      vs.every((v) => /^\d{1,3}:\d{1,3}$/.test(v.reference) && v.relevance_note.includes('"patience"'))
        ? pass('reference is surah:ayah; relevance_note names the matched theme')
        : fail('reference/relevance', JSON.stringify(vs)),
    )
    results.push(
      p._sakina_meta.llm_directives.CRITICAL_RULES.includes('Quote the Arabic exactly as provided. Do not transliterate or paraphrase it.')
        ? pass('llm_directives carry the WO#386 Arabic rule verbatim')
        : fail('directive', JSON.stringify(p._sakina_meta.llm_directives)),
    )
    results.push(assertNoUnicodeHonorific('find_verses no unicode honorific', p))
    results.push(
      !JSON.stringify(p).includes('No hadith grading is available')
        ? pass('find_verses: Quranic verses never carry the ungraded-hadith directive (WO#388)')
        : fail('find_verses ungraded directive', 'directive present on a verse response'),
    )
    const big = (await findVersesHandler({ query: 'anxiety gratitude patience trust', limit: 10 })) as unknown as R
    const refs = (big.content.verses ?? []).map((v) => v.reference)
    results.push(
      refs.length === 10 && new Set(refs).size === 10
        ? pass('limit 10 returns 10 distinct verses')
        : fail('limit 10', JSON.stringify(refs)),
    )
    const two = (await findVersesHandler({ query: 'hope', limit: 2 })) as unknown as R
    results.push((two.content.verses ?? []).length === 2 ? pass('limit 2 returns 2') : fail('limit 2', JSON.stringify(two.content)))
    const syn = (await findVersesHandler({ query: 'I feel so thankful' })) as unknown as R
    results.push(
      syn.content.matched_themes?.[0]?.theme === 'gratitude'
        ? pass('"I feel so thankful" -> gratitude (synonym)')
        : fail('synonym', JSON.stringify(syn.content.matched_themes)),
    )
    const soft = (await findVersesHandler({ query: 'grief' })) as unknown as R
    results.push(
      soft._sakina_meta.content_type === 'verse_collection' && soft.crisis_resource?.level === 'soft'
        ? pass('"grief" -> verses with the soft support note')
        : fail('grief soft', JSON.stringify({ ct: soft._sakina_meta.content_type, cr: soft.crisis_resource })),
    )
    const none = (await findVersesHandler({ query: 'xyzzy blorp' })) as unknown as R
    results.push(
      none._sakina_meta.content_type === 'not_found' && Array.isArray(none.content.verses) && none.content.verses.length === 0 && none.content.no_results === true
        ? pass('no match -> empty verses array with no_results flag, not an error')
        : fail('no match', JSON.stringify(none.content)),
    )
    // WO#388 item A (Gem 3): ANY hard crisis returns the crisis block alone.
    // Zero leakage: exact key sets, no verse-shaped field anywhere, no
    // index Arabic in the payload, and no upstream fetch during the call.
    const VERSE_KEYS = ['verses', 'reference', 'arabic', 'translation', 'translation_source', 'relevance_note', 'surah_name_english', 'surah_name_arabic', 'matched_themes', 'available_themes', 'no_results', 'total_results']
    const keysDeep = (o: unknown, acc: string[] = []): string[] => {
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.push(k); keysDeep(v, acc) }
      return acc
    }
    const leaks = async (q: string) => {
      const before = calls
      const r = (await findVersesHandler({ query: q })) as unknown as R
      const json = JSON.stringify(r)
      const problems: string[] = []
      if (r._sakina_meta.content_type !== 'crisis_resource_only') problems.push(`content_type ${r._sakina_meta.content_type}`)
      if (r.crisis_resource?.level !== 'hard') problems.push('no hard crisis_resource')
      if (Object.keys(r).sort().join() !== '_sakina_meta,content,crisis_resource') problems.push(`top-level ${Object.keys(r)}`)
      if (Object.keys(r.content).sort().join() !== 'reason,requested,withheld') problems.push(`content ${Object.keys(r.content)}`)
      const hit = keysDeep({ content: r.content }).filter((k) => VERSE_KEYS.includes(k))
      if (hit.length) problems.push(`verse keys ${hit}`)
      const arabicHit = THEMATIC_INDEX.find((v) => json.includes(v.arabic))
      if (arabicHit) problems.push(`index Arabic of ${arabicHit.ref} in payload`)
      if (calls !== before) problems.push(`${calls - before} upstream fetches`)
      return { r, problems }
    }
    for (const [label, q, type] of [
      ['self-harm', 'I want to kill myself', 'self-harm'],
      ['abuse', 'my husband hits me', 'abuse'],
    ] as const) {
      const { r, problems } = await leaks(q)
      results.push(
        !problems.length && r.crisis_resource?.crisis_type === type
          ? pass(`${label} crisis -> crisis_resource_only, zero verse leakage, no lookup (WO#388 A)`)
          : fail(`${label} crisis leakage`, problems.join('; ') + ' ' + JSON.stringify(r)),
      )
    }
    // Control: the safe query in the same run still returns verses.
    const safe = (await findVersesHandler({ query: 'patience' })) as unknown as R
    results.push(
      safe._sakina_meta.content_type === 'verse_collection' && (safe.content.verses ?? []).length > 0
        ? pass('safe query after crisis checks -> verse_collection as normal (WO#388 A control)')
        : fail('safe control', JSON.stringify(safe.content)),
    )
    const abuse = (await findVersesHandler({ query: 'my husband hits me' })) as unknown as R
    results.push(
      abuse._sakina_meta.content_type === 'crisis_resource_only' && abuse.crisis_resource?.crisis_type === 'abuse' && abuse.content.withheld === 'verse_collection'
        ? pass('abuse disclosure -> crisis_resource_only, verses withheld (Gem 3 ruling as on get_dua)')
        : fail('abuse', JSON.stringify(abuse)),
    )
    const ur = (await findVersesHandler({ query: 'patience', locale: 'ur' })) as unknown as R
    results.push(
      (ur.content.verses ?? []).every((v) => v.translation_note?.includes('Urdu')) &&
        ur._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => d.includes('MUST NOT translate them into Urdu'))
        ? pass('ur: Pickthall with the parked note and no-self-translate directive')
        : fail('ur', JSON.stringify(ur._sakina_meta.llm_directives)),
    )
    globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch
    const down = (await findVersesHandler({ query: 'ramadan' })) as unknown as R
    const dv = down.content.verses ?? []
    results.push(
      dv.length > 0 && dv.every((v) => v.translation === null && v.arabic === getVerseArabic(v.reference) && v.translation_note?.includes('get_quran_verse'))
        ? pass('upstream down: Arabic still served, translation null with a note')
        : fail('upstream down', JSON.stringify(dv)),
    )
  } finally {
    globalThis.fetch = realFetch
  }
  results.push(calls > 0 ? pass(`upstream stub was exercised (${calls} calls)`) : fail('stub', 'no upstream calls recorded'))
}

// WO#386 item B: directory-listing length.
async function testToolDescriptions() {
  console.log('\n=== tool descriptions (WO#386) ===')
  const all = { get_quran_verse: GET_QURAN_VERSE_DESCRIPTION, get_dua: GET_DUA_DESCRIPTION, get_name_of_allah: GET_NAME_DESCRIPTION, find_verses: FIND_VERSES_DESCRIPTION }
  for (const [name, d] of Object.entries(all)) {
    const n = [...d].length
    results.push(n < 200 ? pass(`${name} description ${n} characters (< 200)`) : fail(`${name} description`, `${n} characters`))
  }
}

async function main() {
  console.log('Sakina MCP Server v1 — tool test harness (Gem 10 revision)')
  console.log(`Du'a corpus size: ${TOTAL_DUAS}, 99 Names corpus: ${TOTAL_NAMES}`)

  try {
    await testQuranVerse()
  } catch (err) {
    results.push(fail('quran verse', `threw: ${err instanceof Error ? err.message : String(err)}`))
  }
  await testQuranParkedLocales()
  await testDuaAnxiety()
  await testDuaPhrases()
  await testDuaCrisis()
  await testDuaCrisisOnly()
  await testDuaCrisisLocales()
  await testCrisisOrderingAndHours()
  await testAbuseBlock()
  await testAbuseAllowlist()
  await testBasmalaGuards()
  await testNameOutputUnchanged()
  await testFastTrackLabels()
  await testNameByNumber()
  await testNameByString()
  await testNotFound()
  await testBereavedRoute()
  await testFindVerses()
  await testToolDescriptions()

  console.log('\n=== Summary ===')
  let pass_count = 0
  for (const r of results) {
    const tag = r.passed ? 'PASS' : 'FAIL'
    console.log(`[${tag}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
    if (r.passed) pass_count++
  }
  console.log(`\n${pass_count}/${results.length} checks passed.`)
  if (pass_count !== results.length) process.exit(1)
}

main().catch((err) => {
  console.error('test harness failure:', err)
  process.exit(1)
})
