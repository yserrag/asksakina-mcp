/**
 * WO#390 Phase 0: the teach bundle check refuses what it must.
 * WO#405: the six batch 1 entries attach where, and only where, they should.
 *
 * Every string below is a FIXTURE placeholder, not teach content. The record
 * ids are real so the grading lookups are the bundled ones:
 *   D00255  graded (Sahih al-Bukhari 5675)
 *   UNGRADED  not_recorded: the first bundled record still without a source
 *             or grading, found by scan (WO#435: the du'a audit grades whole
 *             categories, so a fixed id, D00498 until WO#435, goes stale).
 *             WO#452 graded the last one (D00013). With none in the bundle,
 *             the test plants one, test only (Architect, 10 Oct,
 *             docs/wo452-architect-fixture.md): PLANTED_UNGRADED reads
 *             not_recorded through this test's own lookups. WO#444: the by-id
 *             check plants a copy of D00255 with its source and grading
 *             removed (plantDuasForTest) and goes through duaByIdResponse.
 *   D00068  quranic (Quran 21:87)
 *
 * Run: npm run bundle-data && npm run test:teach
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { TEACH_CONTRACT, TEACH_DIRECTIVE, UNATTRIBUTED_CONTEXT_FALLBACK, UNGRADED_GRADING_DIRECTIVE } from '../src/contracts/presentation.js'
import { UNGRADED_SCOPE_HEAD } from '../src/contracts/gem4-wo418.js'
import { getDuaRecordById, gradingStatusById, plantDuasForTest, type BundledDua } from '../src/data/duas.js'
import { withTeach } from '../src/teach/attach.js'
import { TEACH_ENTRIES } from '../src/teach/entries.js'
import type {
  DuaTeachEntry,
  SignOff,
  TeachContextCited,
  TeachContextFallback,
  TeachEntry,
  TeachMisconception,
  VerseTeachEntry,
} from '../src/teach/types.js'
import { buildDuaIdAllowlist, publishGateErrors, validateTeachEntries, type TeachLookups } from '../src/teach/validate.js'
import { SURAHS } from '../../src/lib/data/quran-metadata.js'
import { duaByIdResponse, getDuaHandler } from '../src/tools/get-dua.js'
import { DUA_ID_ALLOWLIST } from '../src/data/dua-id-allowlist.js'

let failures = 0
const pass = (m: string) => console.log(`  PASS ${m}`)
const fail = (m: string, d?: unknown) => {
  failures++
  console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d)}`}`)
}

// WO#452: the planted ungraded id, used only when the bundle has no ungraded record.
const PLANTED_UNGRADED = 'PLANTED-UNGRADED'
const BUNDLED_UNGRADED = (JSON.parse(readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as { id: string }[])
  .map((d) => d.id)
  .find((id) => gradingStatusById(id) === 'not_recorded')

const lookups: TeachLookups = {
  duaStatus: (id) => (!BUNDLED_UNGRADED && id === PLANTED_UNGRADED ? 'not_recorded' : gradingStatusById(id)),
  // Real verse counts, as bundle-data uses (WO#405): a related verse resolves
  // if it exists in the Quran.
  verseExists: (ref) => {
    const m = /^(\d+):(\d+)$/.exec(ref)
    const surah = m ? SURAHS.find((x) => x.id === Number(m[1])) : undefined
    return !!surah && Number(m![2]) >= 1 && Number(m![2]) <= surah.versesCount
  },
  nameExists: (n) => n >= 1 && n <= 99,
  glossaryHas: () => false,
}

// WO#435: found by scan, not fixed (see the header).
// WO#452: a bundled ungraded record when there is one; otherwise the planted id.
const UNGRADED = BUNDLED_UNGRADED ?? PLANTED_UNGRADED
if (gradingStatusById(PLANTED_UNGRADED) !== undefined) {
  failures++
  console.log(`  FAIL instrument: ${PLANTED_UNGRADED} is a bundled id`)
} else if (lookups.duaStatus(UNGRADED) !== 'not_recorded') {
  failures++
  console.log(`  FAIL instrument: the ungraded fixture ${UNGRADED} does not read not_recorded`)
} else pass(`instrument: ungraded fixture is ${UNGRADED} (not_recorded${BUNDLED_UNGRADED ? ', bundled' : ', planted: the bundle has no ungraded record'})`)

const so = (...gems: SignOff['gem'][]): SignOff[] => gems.map((gem) => ({ gem, ruling: 'FIXTURE', date: '2026-09-27' }))

function duaEntry(id: string, overrides: Partial<DuaTeachEntry> = {}): DuaTeachEntry {
  return {
    record: { kind: 'dua', id },
    locale: 'en',
    key_word: { words: [{ arabic: 'FIXTURE', transliteration: 'FIXTURE' }], root: 'FIXTURE', root_transliteration: 'FIXTURE', gloss: 'FIXTURE', reviewedBy: so(2) },
    context: { kind: 'cited', text: 'FIXTURE', citations: [{ text: 'FIXTURE' }], reviewedBy: so(4) },
    reflection: { text: 'FIXTURE', reviewedBy: so(3) },
    publishReviewedBy: so(10),
    ...overrides,
  }
}

function verseEntry(ref: `${number}:${number}`, overrides: Partial<VerseTeachEntry> = {}): VerseTeachEntry {
  return {
    record: { kind: 'verse', ref },
    locale: 'en',
    key_word: { words: [{ arabic: 'FIXTURE', transliteration: 'FIXTURE' }], root: 'FIXTURE', root_transliteration: 'FIXTURE', gloss: 'FIXTURE', reviewedBy: so(2) },
    reflection: { text: 'FIXTURE', reviewedBy: so(3) },
    publishReviewedBy: so(10),
    ...overrides,
  }
}

const fallback: TeachContextFallback = { kind: 'not_recorded', text: UNATTRIBUTED_CONTEXT_FALLBACK, reviewedBy: so(4) }

function check(name: string, entries: Record<string, TeachEntry>, expect: RegExp | null) {
  const errors = validateTeachEntries(entries, lookups)
  if (expect === null) return errors.length ? fail(`${name}: expected no errors`, errors) : pass(name)
  return errors.some((e) => expect.test(e)) ? pass(name) : fail(`${name}: expected ${expect}`, errors)
}

// ── Type-level: an uncited claim does not compile (npm run typecheck) ──

// @ts-expect-error Field 2 cited with no citation
const _uncited: TeachContextCited = { kind: 'cited', text: 'FIXTURE', citations: [], reviewedBy: [] }
// @ts-expect-error Field 2 fallback with any other text
const _paraphrased: TeachContextFallback = { kind: 'not_recorded', text: 'FIXTURE', reviewedBy: [] }
// @ts-expect-error Field 3 with no citation
const _misNoCite: TeachMisconception = { authoredBy: 'founder', text: 'FIXTURE', citations: [], reviewedBy: [] }
void [_uncited, _paraphrased, _misNoCite]

/** WO#405 batch 1. */
const SIX = ['dua:D00060', 'dua:D00068', 'name:1', 'name:34', 'verse:21:87', 'verse:39:53']
/** WO#484 batch 2: the approved records, from the archived file (docs/wo484-batch2-entries.json). */
const BATCH2: readonly string[] = (JSON.parse(readFileSync(new URL('../../docs/wo484-batch2-entries.json', import.meta.url), 'utf-8')) as Array<{ record: string }>).map((e) => e.record)
/** Every record that carries a teach entry. */
const ENTRY_KEYS: readonly string[] = [...SIX, ...BATCH2]

console.log('\n=== teach entries: shipped data ===')
{
  const keys = Object.keys(TEACH_ENTRIES).sort()
  const want = [...SIX, ...BATCH2].sort()
  JSON.stringify(keys) === JSON.stringify(want)
    ? pass(`entries.ts holds exactly the six WO#405 batch 1 records and the ${BATCH2.length} WO#484 batch 2 records`)
    : fail('entries.ts keys', keys)
  check('shipped entries pass the field check', TEACH_ENTRIES as Record<string, TeachEntry>, null)
  const entries = Object.values(TEACH_ENTRIES) as TeachEntry[]
  entries.every((e) => !e.misconception && !e.by_audience)
    ? pass('no Field 3 and no audience variants on any batch 1 or batch 2 entry')
    : fail('Field 3 / variants present')
  // WO#484: batch 2 carries the delegated Gem 10 sign-off (22 Oct 2026), so the
  // release gate passes for all 44; batch 1 keeps its own Gem 10 approval.
  const gate = publishGateErrors(TEACH_ENTRIES)
  const batch1 = SIX.map((k) => TEACH_ENTRIES[k as keyof typeof TEACH_ENTRIES]!)
  const gem10 = batch1.every((e) => e.publishReviewedBy.length === 1 && e.publishReviewedBy[0]!.gem === 10 && e.publishReviewedBy[0]!.ruling === 'WO#408 re-review, Gem 10 APPROVED' && e.publishReviewedBy[0]!.date === '2026-09-29')
  const refused = gate.map((e) => e.split(':').slice(0, -1).join(':').replace(/: entry \(publish\) lacks sign-off from Gem 10$/, ''))
  gem10 && publishGateErrors(Object.fromEntries(SIX.map((k) => [k, TEACH_ENTRIES[k as keyof typeof TEACH_ENTRIES]]))).length === 0
    ? pass('release gate passes on batch 1: all six carry Gem 10\'s WO#408 re-review approval')
    : fail('release gate, batch 1', gate)
  gate.length === 0 &&
  BATCH2.every((k) => JSON.stringify(TEACH_ENTRIES[k as keyof typeof TEACH_ENTRIES]!.publishReviewedBy) === JSON.stringify([{ gem: 10, ruling: 'WO#484 delegated PASS (Architect)', date: '2026-10-22' }]))
    ? pass(`release gate passes for all ${keys.length}: the ${BATCH2.length} batch 2 entries carry the delegated Gem 10 sign-off (WO#484, 22 Oct 2026)`)
    : fail('release gate, batch 2', { gate, refused })
}

console.log('\n=== teach entries: accepted shapes ===')
check('graded du\'a, cited Field 2, all signed', { 'dua:D00255': duaEntry('D00255') }, null)
check('quranic du\'a, cited Field 2', { 'dua:D00068': duaEntry('D00068') }, null)
check('ungraded du\'a, exact Gem 4 fallback', { [`dua:${UNGRADED}`]: duaEntry(UNGRADED, { context: fallback }) }, null)
check('verse with no Field 2', { 'verse:21:87': verseEntry('21:87') }, null)
check(
  'founder-authored cited Field 3',
  {
    'dua:D00255': duaEntry('D00255', {
      misconception: { authoredBy: 'founder', text: 'FIXTURE', citations: [{ text: 'FIXTURE' }], reviewedBy: so(4) },
    }),
  },
  null,
)
check(
  'audience variant with Gem 6 + 7 (and Gem 3 for the reflection text)',
  { 'dua:D00255': duaEntry('D00255', { by_audience: { revert: { reflection_text: 'FIXTURE', reviewedBy: so(6, 7, 3) } } }) },
  null,
)
check(
  'related refs that resolve, Gem 2 signed',
  { 'dua:D00068': duaEntry('D00068', { related: { refs: [{ kind: 'verse', ref: '21:87' }, { kind: 'name', number: 34 }], reviewedBy: so(2) } }) },
  null,
)

console.log('\n=== teach entries: refused (sign-off matrix) ===')
const without = (e: DuaTeachEntry, patch: (x: DuaTeachEntry) => void) => {
  const c = structuredClone(e)
  patch(c)
  return c
}
const base = duaEntry('D00255')
check('Field 1 without Gem 2', { 'dua:D00255': without(base, (x) => (x.key_word.reviewedBy = so(4))) }, /Field 1 .*Gem 2/)
check('Field 2 without Gem 4', { 'dua:D00255': without(base, (x) => (x.context.reviewedBy = [])) }, /Field 2 .*Gem 4/)
check('Field 4 without Gem 3', { 'dua:D00255': without(base, (x) => (x.reflection.reviewedBy = so(1))) }, /Field 4 .*Gem 3/)
{
  const noGem10 = { 'dua:D00255': without(base, (x) => (x.publishReviewedBy = [])) }
  validateTeachEntries(noGem10, lookups).length === 0 && publishGateErrors(noGem10).some((e) => /publish.*Gem 10/.test(e))
    ? pass('entry without Gem 10: bundles (field check) but the release gate refuses it')
    : fail('Gem 10 split', { fields: validateTeachEntries(noGem10, lookups), gate: publishGateErrors(noGem10) })
  publishGateErrors({ 'dua:D00255': base }).length === 0 ? pass('entry with Gem 10: release gate passes') : fail('gate with Gem 10')
}
check(
  'Field 3 without Gem 4',
  { 'dua:D00255': duaEntry('D00255', { misconception: { authoredBy: 'founder', text: 'FIXTURE', citations: [{ text: 'FIXTURE' }], reviewedBy: [] } }) },
  /Field 3 .*Gem 4/,
)
check(
  'Field 5 variant without Gem 7',
  { 'dua:D00255': duaEntry('D00255', { by_audience: { curious: { reviewedBy: so(6) } } }) },
  /Field 5 \(curious\).*Gem 7/,
)
check(
  'sign-off with no ruling reference does not count',
  { 'dua:D00255': without(base, (x) => (x.key_word.reviewedBy = [{ gem: 2, ruling: '', date: '2026-09-27' }])) },
  /Field 1 .*Gem 2/,
)
check(
  'related list without Gem 2',
  { 'dua:D00068': duaEntry('D00068', { related: { refs: [{ kind: 'verse', ref: '21:87' }], reviewedBy: [] } }) },
  /related lacks sign-off from Gem 2/,
)

console.log('\n=== teach entries: refused (Field 2 / Field 3 rules) ===')
check(
  'cited Field 2 with no citation (bypassing the type)',
  { 'dua:D00255': without(base, (x) => ((x.context as { citations: unknown }).citations = [])) },
  /Field 2 makes a claim with no citation/,
)
check('ungraded du\'a with a cited Field 2', { [`dua:${UNGRADED}`]: duaEntry(UNGRADED) }, /must be the Gem 4 fallback only/)
check(
  'fallback text paraphrased (bypassing the type)',
  { [`dua:${UNGRADED}`]: duaEntry(UNGRADED, { context: { ...fallback, text: 'Source not recorded.' as never } }) },
  /not the locked Gem 4 string/,
)
check('fallback on a graded du\'a', { 'dua:D00255': duaEntry('D00255', { context: fallback }) }, /fallback on a graded record/)
check('fallback on a verse', { 'verse:21:87': verseEntry('21:87', { context: fallback as never }) }, /du'as only/)
check('du\'a with no Field 2', { 'dua:D00255': without(base, (x) => delete (x as Partial<DuaTeachEntry>).context) }, /Field 2 is required/)
check(
  'Field 3 not Founder-authored',
  { 'dua:D00255': duaEntry('D00255', { misconception: { authoredBy: 'gem' as never, text: 'FIXTURE', citations: [{ text: 'FIXTURE' }], reviewedBy: so(4) } }) },
  /Founder-authored/,
)
check(
  'Field 3 with no citation (bypassing the type)',
  { 'dua:D00255': duaEntry('D00255', { misconception: { authoredBy: 'founder', text: 'FIXTURE', citations: [] as never, reviewedBy: so(4) } }) },
  /Field 3 has no citation/,
)
check(
  'variant rewording the Field 2 fallback',
  { [`dua:${UNGRADED}`]: duaEntry(UNGRADED, { context: fallback, by_audience: { revert: { context_text: 'FIXTURE', reviewedBy: so(6, 7, 4) } } }) },
  /fallback never varies/,
)

console.log('\n=== teach entries: refused (records and refs) ===')
check('unknown du\'a id', { 'dua:D99999': duaEntry('D99999') }, /not in the bundled corpus/)
{
  const withText = { ...lookups, recordArabic: () => 'ABC DEF' }
  const one = (arabic: string, key = 'dua:D00255') => ({
    [key]: duaEntry('D00255', { key_word: { ...base.key_word, words: [{ arabic, transliteration: 'x' }] } }),
  })
  validateTeachEntries(one('DEF'), withText).length === 0 ? pass('Field 1 word inside the record Arabic: accepted') : fail('Field 1 inside')
  validateTeachEntries(one('XYZ'), withText).some((e) => /Field 1 word is not in the record's Arabic/.test(e))
    ? pass('Field 1 word not in the record Arabic: refused')
    : fail('Field 1 outside')
}
check('key that does not match the record', { 'dua:D00068': duaEntry('D00255') }, /key does not match/)
check(
  'related verse that does not exist',
  { 'dua:D00068': duaEntry('D00068', { related: { refs: [{ kind: 'verse', ref: '1:8' }], reviewedBy: so(2) } }) },
  /does not resolve/,
)
check(
  'related Name out of range',
  { 'dua:D00068': duaEntry('D00068', { related: { refs: [{ kind: 'name', number: 100 }], reviewedBy: so(2) } }) },
  /does not resolve/,
)
check(
  'related glossary term (no glossary exists yet)',
  { 'dua:D00068': duaEntry('D00068', { related: { refs: [{ kind: 'glossary', term: 'FIXTURE' }], reviewedBy: so(2) } }) },
  /does not resolve/,
)

// ── get_dua id lookup (WO#390, Architect ruling on flag 3) ─────────────

type Resp = {
  _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }
  content: { duas?: Array<{ arabic: string; title: string; grading_directive?: string }>; requested?: unknown }
  crisis_resource?: unknown
}
const corpus = JSON.parse(
  readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8'),
) as Array<{ id: string; arabic: string }>
const arabicOf = (id: string) => corpus.find((d) => d.id === id)!.arabic
/** True if any corpus Arabic appears anywhere in the serialised response. */
const leaksCorpus = (r: unknown) => {
  const j = JSON.stringify(r)
  return corpus.some((d) => d.arabic.length > 8 && j.includes(JSON.stringify(d.arabic).slice(1, -1)))
}

async function testIdLookup() {
  console.log('\n=== get_dua id: allowlist built from signed related lists ===')
  {
    const list = buildDuaIdAllowlist({
      'verse:21:87': verseEntry('21:87', {
        related: { refs: [{ kind: 'dua', id: 'D00068' }, { kind: 'name', number: 34 }, { kind: 'dua', id: 'D00060' }], reviewedBy: so(2) },
      }),
      'dua:D00255': duaEntry('D00255', { related: { refs: [{ kind: 'dua', id: 'D00068' }], reviewedBy: so(2) } }),
    })
    JSON.stringify(list) === '["D00060","D00068","D00255"]'
      ? pass('allowlist = du\'a teach records + du\'a ids in related lists, sorted, de-duplicated')
      : fail('allowlist', list)
    JSON.stringify(DUA_ID_ALLOWLIST) === '["D00060","D00068"]'
      ? pass('bundled allowlist is exactly D00060, D00068 (WO#405)')
      : fail('bundled allowlist', DUA_ID_ALLOWLIST)
  }

  console.log('\n=== get_dua id: allowlisted id returns the record ===')
  {
    const r = duaByIdResponse('D00068', 'en', ['D00068']) as unknown as Resp
    const d = r.content.duas?.[0]
    r._sakina_meta.content_type === 'dua_collection' && r.content.duas?.length === 1 && d?.arabic === arabicOf('D00068')
      ? pass('D00068 allowlisted: dua_collection with exactly its record (corpus Arabic)')
      : fail('D00068 allowlisted', r.content)
    !d?.grading_directive ? pass('D00068 (Quranic): no ungraded directive') : fail('D00068 directive', d)
    // Instrument check: the leak detector fires on a response that does carry a record.
    leaksCorpus(r) ? pass('leak detector fires on a record-bearing response (so a clean result means something)') : fail('leak detector is blind')
  }
  if (BUNDLED_UNGRADED) {
    const r = duaByIdResponse(UNGRADED, 'en', [UNGRADED]) as unknown as Resp
    const d = r.content.duas?.[0]
    // WO#418 B1: the response-level copy is scoped to the record's title (Gem 4 Reply 2 item 1).
    d?.grading_directive === UNGRADED_GRADING_DIRECTIVE &&
    r._sakina_meta.llm_directives.CRITICAL_RULES.includes(`${UNGRADED_SCOPE_HEAD}(${(d as { title?: string }).title}): ${UNGRADED_GRADING_DIRECTIVE}`)
      ? pass(`${UNGRADED} (ungraded) by id: grading_directive on the record, and in CRITICAL_RULES scoped to its title`)
      : fail(`${UNGRADED} ungraded directive on id lookup`, r)
  } else {
    // WO#452 (Architect, 10 Oct): no ungraded record is bundled. WO#444
    // (Architect, ruling b): the planted copy of D00255 (graded), with its
    // source and grading removed, is planted into the corpus through the test
    // seam in duas.ts (plantDuasForTest) and looked up by id through
    // duaByIdResponse itself, the real path.
    const bundled = (JSON.parse(readFileSync(new URL('../data/duas.json', import.meta.url), 'utf-8')) as BundledDua[]).find((x) => x.id === 'D00255')
    if (!bundled || gradingStatusById('D00255') !== 'graded') fail('instrument: D00255 graded', bundled)
    else pass('instrument: D00255 is a graded record (the planted copy differs only by being ungraded)')
    const { source: _s, grading: _g, countSource: _c, ...rest } = bundled ?? ({} as BundledDua)
    const remove = plantDuasForTest([{ ...rest, id: PLANTED_UNGRADED, name: 'Planted Ungraded Fixture' }])
    try {
      const r = duaByIdResponse(PLANTED_UNGRADED, 'en', [PLANTED_UNGRADED]) as unknown as Resp
      const d = r.content.duas?.[0]
      d?.grading_directive === UNGRADED_GRADING_DIRECTIVE &&
      r._sakina_meta.llm_directives.CRITICAL_RULES.includes(`${UNGRADED_SCOPE_HEAD}(${(d as { title?: string }).title}): ${UNGRADED_GRADING_DIRECTIVE}`) &&
      !r._sakina_meta.llm_directives.CRITICAL_RULES.includes(UNGRADED_GRADING_DIRECTIVE)
        ? pass(`${PLANTED_UNGRADED} (planted, ungraded) by id through duaByIdResponse: grading_directive on the record, and in CRITICAL_RULES scoped to its title`)
        : fail(`${PLANTED_UNGRADED} ungraded directive (planted, by id)`, r)
    } finally {
      remove()
    }
    const gradedResp = duaByIdResponse('D00255', 'en', ['D00255']) as unknown as Resp
    !JSON.stringify(gradedResp).includes(UNGRADED_GRADING_DIRECTIVE)
      ? pass('control: the same record, graded, carries no ungraded directive')
      : fail('control: graded record carries the ungraded directive', gradedResp)
  }

  console.log('\n=== get_dua id: non-allowlisted id refused, no record content ===')
  {
    const inCorpus = duaByIdResponse('D00060', 'en', ['D00068']) as unknown as Resp
    const absent = duaByIdResponse('D99999', 'en', ['D00068']) as unknown as Resp
    inCorpus._sakina_meta.content_type === 'not_found' && !inCorpus.content.duas && !leaksCorpus(inCorpus)
      ? pass('D00060 (in corpus, not allowlisted): not_found, no record content')
      : fail('D00060 refused', inCorpus)
    const strip = (x: Resp) => JSON.stringify({ ...x, content: { ...x.content, requested: null } })
    strip(inCorpus) === strip(absent)
      ? pass('refusal for an existing id equals refusal for a missing id (no existence oracle)')
      : fail('existence oracle', { inCorpus, absent })
  }

  console.log('\n=== get_dua id: enumeration D00001..D00020 ===')
  {
    const ids = Array.from({ length: 20 }, (_, i) => `D${String(i + 1).padStart(5, '0')}`)
    const allow = ['D00005', 'D00017']
    const returned = ids.filter((id) => (duaByIdResponse(id, 'en', allow) as unknown as Resp).content.duas?.length)
    JSON.stringify(returned) === JSON.stringify(allow)
      ? pass(`with allowlist ${allow.join(',')}: only those 2 of 20 return a record`)
      : fail('enumeration with allowlist', returned)
    const viaHandler = await Promise.all(ids.map((id) => getDuaHandler({ id })))
    viaHandler.every((r) => r._sakina_meta.content_type === 'not_found' && !leaksCorpus(r))
      ? pass('through getDuaHandler (bundled allowlist D00060, D00068): D00001..D00020 all refused, no corpus Arabic')
      : fail('enumeration via handler', viaHandler.map((r) => r._sakina_meta.content_type))
  }

  console.log('\n=== get_dua id: guards ===')
  {
    const r = (await getDuaHandler({ id: 'suicide' })) as unknown as Resp
    r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource && !r.content.duas
      ? pass('crisis keyword in id: crisis_resource_only, before any lookup')
      : fail('crisis on id', r)
    // WO#393 (rebase onto WO#391): the id path runs the NORMALISED detector.
    // Hyphenated crisis phrases pass the id pattern and missed on 1.5.0.
    for (const [id, type] of [['kill-myself', 'self-harm'], ['my-husband-hits-me', 'abuse']] as const) {
      const r = (await getDuaHandler({ id })) as unknown as Resp & { crisis_resource?: { crisis_type?: string } }
      r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.crisis_type === type && !r.content.duas
        ? pass(`id ${JSON.stringify(id)}: ${type} crisis block alone (normalised detector)`)
        : fail(`id ${JSON.stringify(id)} crisis`, r)
    }
    const both = (await getDuaHandler({ id: 'D00068', context: 'anxiety' })) as unknown as Resp
    const neither = (await getDuaHandler({})) as unknown as Resp
    both._sakina_meta.content_type === 'not_found' && !both.content.duas && neither._sakina_meta.content_type === 'not_found'
      ? pass('both context and id, or neither: refused, no lookup')
      : fail('one-of', { both, neither })
  }

  console.log('\n=== over MCP (in-memory client) ===')
  {
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const srv = (await import('../src/server.js')) as { createMcpServer?: () => { connect(t: unknown): Promise<void> }; default?: { createMcpServer: () => { connect(t: unknown): Promise<void> } } }
    const create = srv.createMcpServer ?? srv.default!.createMcpServer
    const [a, b] = InMemoryTransport.createLinkedPair()
    await create().connect(a)
    const c = new Client({ name: 'test-teach', version: '0' })
    await c.connect(b)
    const tools = (await c.listTools()).tools
    const allHaveAudience = tools.every((t) => (t.inputSchema.properties as Record<string, unknown>)?.audience)
    const dua = tools.find((t) => t.name === 'get_dua')!
    allHaveAudience && (dua.inputSchema.properties as Record<string, unknown>).id && !(dua.inputSchema.required ?? []).includes('context')
      ? pass('tools/list: audience on all four tools; get_dua has id, context no longer required')
      : fail('tools/list', tools.map((t) => [t.name, Object.keys(t.inputSchema.properties ?? {}), t.inputSchema.required]))
    const text = (r: unknown) => (r as { content: Array<{ text: string }> }).content[0].text
    // WO#478 (teach by default; the WO#390 flag 1 byte-for-byte promise is
    // superseded): D00068 by id (no support block) carries teach with or
    // without `audience`. The two responses differ only at teach.audience
    // ("revert" against "unknown"); with teach, related and the teach strings
    // removed they are the same bytes, and neither carries a teach key then.
    const plain = text(await c.callTool({ name: 'get_dua', arguments: { id: 'D00068' } }))
    const withAud = text(await c.callTool({ name: 'get_dua', arguments: { id: 'D00068', audience: 'revert' } }))
    const strip = (s: string) =>
      JSON.stringify(
        JSON.parse(s),
        (k, v) =>
          k === 'teach' || k === 'related' ? undefined : k === 'CRITICAL_RULES' ? (v as string[]).filter((d) => d !== TEACH_DIRECTIVE) : k === 'teach' ? undefined : v,
        2,
      )
    const audienceOf = (s: string) => (JSON.parse(s) as { content: { duas: Array<{ teach?: { audience?: string } }> } }).content.duas[0]?.teach?.audience
    plain !== withAud && strip(plain) === strip(withAud) && audienceOf(plain) === 'unknown' && audienceOf(withAud) === 'revert' && !strip(plain).includes('"teach"')
      ? pass('over MCP: D00068 with and without audience differ only at teach.audience (revert / unknown); stripped of teach, related and the teach strings they are the same bytes')
      : fail('audience diff over MCP', { plain: audienceOf(plain), withAud: audienceOf(withAud) })
    // Under a support block nothing attaches, so audience changes nothing.
    const soft = text(await c.callTool({ name: 'get_dua', arguments: { context: 'anxiety' } }))
    const softAud = text(await c.callTool({ name: 'get_dua', arguments: { context: 'anxiety', audience: 'revert' } }))
    soft === softAud
      ? pass('over MCP: anxiety (support block) with audience is byte-identical to without (WO#407)')
      : fail('anxiety with audience differs over MCP')
    const byId = JSON.parse(text(await c.callTool({ name: 'get_dua', arguments: { id: 'D00068' } }))) as Resp
    byId._sakina_meta.content_type === 'dua_collection' && byId.content.duas?.[0]?.arabic === arabicOf('D00068') && (byId.content.duas?.[0] as { teach?: { audience?: string } }).teach?.audience === 'unknown'
      ? pass('get_dua {id: D00068} over MCP: allowlisted, record returned, teach attached with audience unknown (WO#478)')
      : fail('id over MCP', byId)
    const refused = JSON.parse(text(await c.callTool({ name: 'get_dua', arguments: { id: 'D00003' } }))) as Resp
    refused._sakina_meta.content_type === 'not_found' && !leaksCorpus(refused)
      ? pass('get_dua {id: D00003} over MCP: refused (not on the allowlist)')
      : fail('D00003 over MCP', refused)
    const bad = await c.callTool({ name: 'get_dua', arguments: { id: '../../etc' } })
    bad.isError ? pass('id outside the pattern: rejected by the input schema') : fail('id pattern', bad)
    await c.close()
  }
}

// ── WO#405 batch 1: runtime attachment ─────────────────────────────────

type Rec = Record<string, unknown> & {
  teach?: { record_id: string; audience: string; reflection_question?: string; key_word: { words: unknown[] } }
  related?: Array<{ call?: { tool: string; arguments: Record<string, unknown> } }>
}
type AnyResp = { _sakina_meta: { content_type: string }; content: Record<string, unknown>; crisis_resource?: { level?: string } }


/** Every object in a response that carries `teach`, with where it was found. */
function teachBlocks(r: unknown): Rec['teach'][] {
  const out: Rec['teach'][] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      const o = v as Rec
      if (o.teach && typeof o.teach === 'object') out.push(o.teach)
      Object.values(o).forEach(walk)
    }
  }
  walk(r)
  return out
}

/** Whether either Gem 10 teach string (WO#407) is in the response envelope. */
function teachDirectivesPresent(r: unknown): boolean {
  const m = (r as { _sakina_meta?: { llm_directives?: { CRITICAL_RULES?: readonly string[] }; presentation_contract?: Record<string, unknown> } })._sakina_meta
  return Boolean(m?.llm_directives?.CRITICAL_RULES?.includes(TEACH_DIRECTIVE) || m?.presentation_contract && 'teach' in m.presentation_contract)
}

/** Both Gem 10 teach strings present, once each, byte for byte. */
function teachDirectivesExact(r: unknown): boolean {
  const m = (r as { _sakina_meta: { llm_directives: { CRITICAL_RULES: readonly string[] }; presentation_contract: Record<string, unknown> } })._sakina_meta
  return m.llm_directives.CRITICAL_RULES.filter((d) => d === TEACH_DIRECTIVE).length === 1 && m.presentation_contract.teach === TEACH_CONTRACT
}

/**
 * The two teach strings, pinned by hash so an edit cannot pass silently.
 * WO#407 (Gem 10) wrote them; WO#478 (P1, P1c; Architect rulings of 20 Oct
 * 2026) replaced them with the teaching order, re-pinned here. Gem 3 and
 * Gem 10 review the built text before any release.
 */
function testTeachDirectivePins() {
  console.log('\n=== WO#407 / WO#478: teach strings, byte-pinned ===')
  const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
  const pins: Array<[string, string, string]> = [
    ['CRITICAL_RULES teach directive', TEACH_DIRECTIVE, 'ee032942f2bc602a000401ca56d3df23187f81249dad482314416f70e4ffda2b'],
    ['presentation_contract.teach', TEACH_CONTRACT, '68cea585544c427ccddea244020738279cc1ebdd4ba18a850ed6d53bbb6450d7'],
  ]
  for (const [label, text, want] of pins) sha(text) === want ? pass(`${label}: sha256 ${want.slice(0, 12)}…`) : fail(`${label} changed`, sha(text))
}

async function testAttachment() {
  // Synthetic upstream: any verse resolves with placeholder text. This proves
  // the attachment and the call shapes, not the upstream bytes (the fixture
  // eval and the byte-identity run cover those).
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
  const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
  const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
  const { findVersesHandler } = await import('../src/tools/find-verses.js')
  const categories = (JSON.parse(readFileSync(new URL('../data/dua-categories.json', import.meta.url), 'utf-8')) as Array<{ slug: string }>).map((c) => c.slug)

  console.log('\n=== WO#405: teach present on the six, with audience ===')
  const direct: Array<[string, () => Promise<unknown>]> = [
    ['dua:D00068', () => getDuaHandler({ id: 'D00068', audience: 'revert' })],
    ['dua:D00060', () => getDuaHandler({ id: 'D00060', audience: 'curious' })],
    ['verse:21:87', () => getQuranVerseHandler({ surah: 21, ayah: 87, audience: 'practising' })],
    ['verse:39:53', () => getQuranVerseHandler({ surah: 39, ayah: 53, audience: 'revert' })],
    ['name:34', () => getNameOfAllahHandler({ number: 34, audience: 'curious' })],
    ['name:1', () => getNameOfAllahHandler({ number: 1, audience: 'practising' })],
  ]
  for (const [key, call] of direct) {
    const r = await call()
    const blocks = teachBlocks(r)
    blocks.length === 1 && blocks[0]!.record_id === key && typeof blocks[0]!.reflection_question === 'string' && blocks[0]!.key_word.words.length > 0 && teachDirectivesExact(r)
      ? pass(`${key}: one teach block, Fields 1, 2 and 4 present, both Gem 10 directives`)
      : fail(`${key} teach`, blocks)
  }
  {
    const byAud = await Promise.all([...(['curious', 'revert', 'practising'] as const).map((a) => getNameOfAllahHandler({ number: 34, audience: a })), getNameOfAllahHandler({ number: 34 })])
    const norm = byAud.map((r) => JSON.stringify(r, (k, v) => (k === 'audience' ? undefined : v)))
    const auds = byAud.map((r) => teachBlocks(r)[0]?.audience)
    new Set(norm).size === 1 && JSON.stringify(auds) === '["curious","revert","practising","unknown"]'
      ? pass('no audience variants: the three audiences and omitted (unknown) differ only in teach.audience (WO#478)')
      : fail('audience variants', auds)
    const ctxOk = byAud.every((r) => (teachBlocks(r)[0] as unknown as { context?: { attributed: boolean; citations: unknown[] } }).context?.citations.length === 2)
    ctxOk ? pass('name:34 Field 2 carries both citations') : fail('name:34 citations')
  }

  console.log('\n=== WO#405: teach absent everywhere else ===')
  {
    const seen = new Set<string>()
    let stray = 0
    for (const slug of categories) {
      for (const b of teachBlocks(await getDuaHandler({ context: slug, audience: 'revert' }))) {
        if (ENTRY_KEYS.includes(b!.record_id)) seen.add(b!.record_id)
        else stray++
      }
    }
    for (let n = 1; n <= 99; n++) {
      for (const b of teachBlocks(await getNameOfAllahHandler({ number: n, audience: 'revert' }))) {
        if (ENTRY_KEYS.includes(b!.record_id)) seen.add(b!.record_id)
        else stray++
      }
    }
    for (const q of AVAILABLE_THEMES_FOR_TEST) {
      for (const b of teachBlocks(await findVersesHandler({ query: q, limit: 10, audience: 'revert' }))) {
        if (ENTRY_KEYS.includes(b!.record_id)) seen.add(b!.record_id)
        else stray++
      }
    }
    // WO#484: 2:255 and 1:1 now carry entries; these five verses carry none.
    for (const [s, a] of [[2, 256], [3, 1], [21, 88], [39, 54], [94, 1]] as const) {
      stray += teachBlocks(await getQuranVerseHandler({ surah: s, ayah: a, audience: 'revert' })).length
    }
    stray === 0
      ? pass(`all ${categories.length} du'a categories, 99 Names, every theme and 5 verses with no entry: teach only on records with an entry (${[...seen].sort().join(', ')})`)
      : fail(`${stray} teach blocks on records with no entry`)
    // WO#478 (teach by default): with `audience` omitted, the entries that are
    // reachable without a support block attach with audience "unknown":
    // Names 1 and 34, and 39:53. The two du'a entries sit in stress-anxiety,
    // which always carries a soft block, so every category stays bare.
    const unknownOn = new Set<string>()
    let strayUnknown = 0
    const noTeach = (r: unknown) => teachBlocks(r).length + (teachDirectivesPresent(r) ? 1 : 0)
    const tally = (r: unknown) => {
      for (const b of teachBlocks(r)) {
        if (b!.audience === 'unknown' && ENTRY_KEYS.includes(b!.record_id)) unknownOn.add(b!.record_id)
        else strayUnknown++
      }
    }
    for (const slug of categories) tally(await getDuaHandler({ context: slug }))
    for (let n = 1; n <= 99; n++) tally(await getNameOfAllahHandler({ number: n }))
    tally(await getQuranVerseHandler({ surah: 39, ayah: 53 }))
    // WO#484: Names 2 to 10 now carry entries too.
    const wantUnknown = [...ENTRY_KEYS.filter((k) => k.startsWith('name:')), 'verse:39:53'].sort()
    JSON.stringify([...unknownOn].sort()) === JSON.stringify(wantUnknown) && strayUnknown === 0
      ? pass(`audience omitted: teach with audience unknown on exactly ${wantUnknown.join(', ')} across every category, 99 Names and 39:53; nothing else (WO#478, WO#484)`)
      : fail('audience omitted', { unknownOn: [...unknownOn], strayUnknown })
    // WO#407: a response whose records carry no teach carries no teach directive.
    const noEntry = noTeach(await getQuranVerseHandler({ surah: 2, ayah: 256, audience: 'revert' })) + noTeach(await getQuranVerseHandler({ surah: 2, ayah: 256 })) + noTeach(await getNameOfAllahHandler({ number: 11 }))
    noEntry === 0 ? pass('a record with no entry, with or without audience: no teach and no teach directives') : fail(`${noEntry} teach blocks on records with no entry`)
    const ur = noTeach(await getNameOfAllahHandler({ number: 34, locale: 'ur', audience: 'revert' })) +
      noTeach(await getDuaHandler({ id: 'D00068', locale: 'ar', audience: 'revert' })) +
      noTeach(await getNameOfAllahHandler({ number: 34, locale: 'ur' })) +
      noTeach(await getDuaHandler({ id: 'D00068', locale: 'ar' }))
    ur === 0 ? pass('non-en locale, with or without audience: no teach (entries are English only)') : fail('teach on a non-en locale')
  }

  console.log('\n=== WO#405: every related ref resolves ===')
  {
    const handlers: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
      get_quran_verse: (a) => getQuranVerseHandler(a as never),
      get_name_of_allah: (a) => getNameOfAllahHandler(a as never),
      get_dua: (a) => getDuaHandler(a as never),
    }
    let n = 0
    const bad: unknown[] = []
    for (const [, call] of direct) {
      const walk = (v: unknown): Rec[] => (Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? [v as Rec, ...Object.values(v).flatMap(walk)] : [])
      for (const rec of walk(await call())) {
        for (const ref of rec.related ?? []) {
          n++
          const r = (await handlers[ref.call!.tool]!(ref.call!.arguments)) as AnyResp
          if (r._sakina_meta.content_type === 'not_found') bad.push(ref)
        }
      }
    }
    n === 10 && bad.length === 0 ? pass(`${n} related calls, each executed verbatim: none not_found`) : fail(`related (${n})`, bad)
  }

  console.log('\n=== WO#407: no teach at all under a support block or on grief routes (Gem 10) ===')
  {
    // Each withheld case must still return one of the six records, or "no
    // teach" would pass for a response that could never have carried any.
    // Du'a records carry no id on the wire, so they are matched by their Arabic.
    const duaArabic = ['D00060', 'D00068'].map((id) => JSON.stringify(getDuaRecordById(id)!.arabic))
    const carriesSix = (r: unknown) => {
      const j = JSON.stringify(r)
      return duaArabic.some((a) => j.includes(a)) || /"reference": ?"(21:87|39:53)"/.test(j)
    }
    const bare = (r: AnyResp) => {
      const j = JSON.stringify(r)
      return teachBlocks(r).length === 0 && !j.includes('"related"') && !teachDirectivesPresent(r)
    }
    const withheld: Array<[string, AnyResp]> = [
      ['get_dua "anxiety" (soft block)', (await getDuaHandler({ context: 'anxiety', audience: 'revert' })) as AnyResp],
      ['find_verses "despair" (soft block)', (await findVersesHandler({ query: 'despair', audience: 'revert' })) as AnyResp],
    ]
    for (const [label, r] of withheld) {
      r.crisis_resource?.level === 'soft' && carriesSix(r) && bare(r)
        ? pass(`${label}: one of the six returned, no teach, no related, no teach directives`)
        : fail(label, { level: r.crisis_resource?.level, six: carriesSix(r), teach: teachBlocks(r).length, directives: teachDirectivesPresent(r) })
    }
    let grief = 0
    let griefSix = 0
    for (const q of ['grief', 'loss', 'sadness', 'grief after losing my mother']) {
      for (const r of [await findVersesHandler({ query: q, audience: 'revert' }), await getDuaHandler({ context: q, audience: 'revert' })] as AnyResp[]) {
        if (!bare(r)) grief++
        if (carriesSix(r)) griefSix++
      }
    }
    for (const c of ['bereaved', 'deceased']) {
      const r = (await getDuaHandler({ context: c, audience: 'revert' })) as AnyResp
      if (!bare(r)) grief++
      if (carriesSix(r)) griefSix++
    }
    grief === 0
      ? pass(`grief queries and the bereaved/deceased routes: no teach, no related, no teach directives (${griefSix} of 10 responses carry one of the six)`)
      : fail(`${grief} grief responses carry teach`)
    // No batch 1 record is returned on a grief route today, so the handler
    // checks above cannot see the drop happen. Prove it at the attach point,
    // on each of the six real entries.
    let attached = 0
    let dropped = 0
    for (const key of SIX) {
      const rec = { marker: key }
      const on = withTeach(rec, key as never, { audience: 'revert', locale: 'en' }) as Rec
      const off = withTeach(rec, key as never, { audience: 'revert', locale: 'en', withhold: true })
      if (on.teach) attached++
      if (off === rec && JSON.stringify(off) === JSON.stringify({ marker: key })) dropped++
    }
    attached === 6 && dropped === 6
      ? pass('withTeach: each of the six attaches normally and returns the record untouched (no teach, no related) when withheld')
      : fail('withTeach withhold', { attached, dropped })
    const hope = (await findVersesHandler({ query: 'hope', audience: 'revert' })) as AnyResp
    const plainId = (await getDuaHandler({ id: 'D00068', audience: 'revert' })) as AnyResp
    teachBlocks(hope).length === 1 && !hope.crisis_resource && teachDirectivesExact(hope)
      ? pass('control: find_verses "hope" (no block) carries 39:53 teach and both directives')
      : fail('control hope')
    teachBlocks(plainId)[0]?.reflection_question && teachDirectivesExact(plainId)
      ? pass('control: get_dua {id: D00068} (no block) carries teach, Field 4 and both directives')
      : fail('control D00068')
  }

  console.log('\n=== WO#405: crisis inputs return the crisis block only, no teach ===')
  {
    const inputs = ['I want to kill myself', 'kill-myself', 'sui​cide', 'my husband hits me', 'my-husband-hits-me']
    const out: AnyResp[] = []
    for (const q of inputs) {
      out.push((await getDuaHandler({ context: q, audience: 'revert' })) as AnyResp)
      out.push((await findVersesHandler({ query: q, audience: 'revert' })) as AnyResp)
      out.push((await getNameOfAllahHandler({ name: q, audience: 'revert' })) as AnyResp)
    }
    out.push((await getDuaHandler({ id: 'kill-myself', audience: 'revert' })) as AnyResp)
    out.every((r) => r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource && !JSON.stringify(r).includes('"teach"') && !JSON.stringify(r).includes('"related"') && !teachDirectivesPresent(r))
      ? pass(`${out.length} crisis calls with audience: crisis_resource_only, no teach, no related`)
      : fail('crisis with audience', out.map((r) => r._sakina_meta.content_type))
  }
}

const AVAILABLE_THEMES_FOR_TEST = ['anxiety', 'gratitude', 'patience', 'trust', 'grief', 'hope', 'forgiveness', 'morning', 'friday', 'ramadan', 'encouragement']

testIdLookup()
  .then(testTeachDirectivePins)
  .then(testAttachment)
  .catch((err) => fail('teach tests threw', String(err)))
  .finally(() => {
    console.log(failures ? `\n${failures} FAILED` : '\nall passed')
    process.exit(failures ? 1 : 0)
  })
