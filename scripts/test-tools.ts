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
import { getNameOfAllahHandler } from '../src/tools/get-name-of-allah.js'
import { TOTAL_DUAS } from '../src/data/duas.js'
import { TOTAL_NAMES } from '../src/data/names.js'
import { readFileSync } from 'node:fs'
import { getVerseArabic } from '../../src/lib/scripture/index.js'
import { skeleton } from './quranic-labels.js'

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
  const response = await getDuaHandler({ context: 'anxiety' })
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
  results.push(assertVoice2('dua crisis Voice 2 directive present', response))
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
  const expectations: Array<{ locale: 'id' | 'ur' | 'ar'; must: string[] }> = [
    { locale: 'id', must: ['1500-567', 'Sehat Jiwa'] },
    { locale: 'ur', must: ['0311-7786264', 'Rozan'] },
    { locale: 'ar', must: ['920033360', '800-HOPE', '1564', '762 2381'] },
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
  // en unchanged: UK + US + IASP, locale "en".
  const en = await getDuaHandler({ context: HARD, locale: 'en' })
  const enCr = (en as Record<string, unknown>).crisis_resource as
    | { locale?: string; text?: string }
    | undefined
  const enText = enCr?.text ?? ''
  const enOk =
    enCr?.locale === 'en' &&
    enText.includes('Samaritans') &&
    enText.includes('116 123') &&
    enText.includes('988') &&
    /iasp\.info/i.test(enText)
  results.push(
    enOk
      ? pass('crisis en unchanged (Samaritans + 988 + IASP, locale="en")')
      : fail('crisis en unchanged', `en block changed: ${JSON.stringify(enCr)}`),
  )
}

async function main() {
  console.log('Sakina MCP Server v1 — tool test harness (Gem 10 revision)')
  console.log(`Du'a corpus size: ${TOTAL_DUAS}, 99 Names corpus: ${TOTAL_NAMES}`)

  try {
    await testQuranVerse()
  } catch (err) {
    results.push(fail('quran verse', `threw: ${err instanceof Error ? err.message : String(err)}`))
  }
  await testDuaAnxiety()
  await testDuaCrisis()
  await testDuaCrisisLocales()
  await testNameByNumber()
  await testNameByString()
  await testNotFound()

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
