/**
 * WO#481: MCP 2.2.1, localised crisis text (ar, ur, id, tr) and the tr locale.
 * Gem 3 (structure, crisis.immediateDanger reuse), Gem 1 (translations) and
 * Gem 2 (ar/ur code points and bidi) approved on 21 Oct 2026; the record is
 * docs/wo481-architect.md.
 *
 *   A. the generated table equals the record, helplines.ts and the app bundles;
 *   B. each block has the ruled structure;
 *   C. bidi: ar/ur isolates balanced, every phone number, URL and "24/7"
 *      inside LRI ... PDI, Arabic-script hours inside RLI ... PDI; no marks in
 *      en, id or tr;
 *   D. every number in every block exists in helplines.ts; the WhatsApp line
 *      matches the tr-alo-183 note;
 *   E. no em dash (and no honorific glyph) in any block;
 *   F. 182 is in no block;
 *   G. Turkish crisis phrases route to the tr blocks;
 *   H. tr is accepted everywhere; tr Quran carries the parked note; tr Names
 *      are English;
 *   I. the en blocks are byte-identical to 2.2.0.
 *
 * Run: npm run bundle-data && npm run test:wo481
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { distressBlockFor, evaluateDistress, SOFT_DISTRESS_RESOURCE_BLOCK } from '../src/safety/crisis-keywords.js'
import { abuseText, digitsOnly, selfHarmText, softText, type L10nLocale } from '../src/safety/crisis-text-l10n.js'
import { duaEnglishNote, ENGLISH_FALLBACK_GUARD, nameEnglishNote, TEACH_ENGLISH_NOTE } from '../src/contracts/english-fallback.js'
import { hasBidiMarks, isolatesBalanced, LRI, PDI, RLI } from '../src/safety/bidi.js'
import {
  ABUSE_IDS,
  COUNTRY_NAMES,
  HELPLINE_FIELDS,
  IASP_URL,
  IMMEDIATE_DANGER,
  L10N_HOURS,
  L10N_STRINGS,
  SELF_HARM_IDS,
  TR_ABUSE_LINES,
} from '../src/safety/crisis-l10n-strings.js'

let failures = 0
let checks = 0
const pass = (m: string) => {
  checks++
  console.log(`  PASS ${m}`)
}
const fail = (m: string, d?: unknown) => {
  checks++
  failures++
  console.log(`  FAIL ${m}${d === undefined ? '' : `\n       ${JSON.stringify(d)}`}`)
}
const check = (ok: boolean, m: string, d?: unknown) => (ok ? pass(m) : fail(m, d))

const L10N: readonly L10nLocale[] = ['ar', 'ur', 'id', 'tr']
const ALL = ['en', 'ar', 'ur', 'id', 'tr'] as const
type Hint = Parameters<typeof distressBlockFor>[0]
const HINTS: Array<[string, Hint]> = [
  ['self-harm', { level: 'hard', crisisType: 'self-harm' }],
  ['abuse', { level: 'hard', crisisType: 'abuse' }],
  ['soft', { level: 'soft' }],
]
const block = (h: Hint, l: (typeof ALL)[number]) => distressBlockFor(h, l) as { text: string; directive: string; locale: string; level: string; crisis_type?: string }
const bare = (s: string) => s.replace(/[⁦-⁩]/g, '')
const root = (p: string) => new URL(`../../${p}`, import.meta.url)

/** Phone-like numbers: a digit run with internal spaces or hyphens, 3+ digits. */
function numbers(text: string): string[] {
  return [...text.matchAll(/\+?\d(?:[\d \-]*\d)?/g)].map((m) => m[0].replace(/\D/g, '')).filter((d) => d.length >= 3)
}

/** The spans of the text inside an isolate opened by `opener`. */
function isolatedSpans(text: string, opener: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const stack: Array<[string, number]> = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === LRI || ch === RLI || ch === '⁨') stack.push([ch, i])
    else if (ch === PDI) {
      const open = stack.pop()
      if (open && open[0] === opener) out.push([open[1], i])
    }
  }
  return out
}
const inside = (spans: Array<[number, number]>, start: number, end: number) => spans.some(([a, b]) => a < start && end <= b)

function parseRecord() {
  const doc = readFileSync(root('docs/wo481-architect.md'), 'utf-8')
  const msg = /## The message\n\n```text\n([\s\S]*?)\n```\n/.exec(doc)?.[1] ?? ''
  const iasp = /IASP = (https:\/\/\S+)/.exec(msg)?.[1]
  const section = msg.split('\nSTRINGS\n')[1]?.split('\n\nBIDI')[0] ?? ''
  const strings: Record<string, Record<string, string>> = {}
  const hours: Record<string, Record<string, string>> = {}
  const trAbuse: string[] = []
  let loc = ''
  let inAbuse = false
  for (const line of section.split('\n')) {
    if (['ar', 'ur', 'id', 'tr'].includes(line)) {
      loc = line
      inAbuse = false
      strings[loc] = {}
      continue
    }
    if (!line.trim()) continue
    if (line === 'Abuse lines:') {
      inAbuse = true
      continue
    }
    if (inAbuse) {
      trAbuse.push(line.trim())
      continue
    }
    const m = /^(T\d+[abc]?)(?:ar|tr|id)?: (.*)$/.exec(line)
    if (m) {
      strings[loc]![m[1]!] = m[2]!
      continue
    }
    if (line.startsWith('Hours: ') && (loc === 'ar' || loc === 'ur')) {
      const h: Record<string, string> = {}
      for (const item of line.slice('Hours: '.length).split(' | ')) {
        if (item.startsWith('UAE: ')) h.uae = item.slice(5)
        else if (item.startsWith('Saudi: ')) h.saudi = item.slice(7)
        else if (item === '24/7') h['24/7'] = item
        else h[loc === 'ar' ? 'office' : 'business'] = item
      }
      hours[loc] = h
    }
  }
  return { iasp, strings, hours, trAbuse }
}

function helplineEntry(src: string, id: string): Record<string, string> {
  const m = new RegExp(`\\{\\s*id: '${id}',([\\s\\S]*?)\\n  \\},`).exec(src)
  const body = m?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const k of ['name', 'phone', 'hours', 'note', 'country']) {
    const v = new RegExp(`\\n\\s*${k}: '([^']*)'`).exec(body)?.[1]
    if (v !== undefined) out[k] = v
  }
  return out
}

async function main() {
  const helplines = readFileSync(root('src/data/helplines.ts'), 'utf-8')

  console.log('\n=== A. the generated table equals its sources ===')
  {
    const r = parseRecord()
    check(r.iasp === IASP_URL, 'IASP URL equals the record, plain (no Markdown)', r.iasp)
    check(JSON.stringify(r.strings) === JSON.stringify(L10N_STRINGS), 'every T string equals the record, byte for byte (34 strings)')
    check(JSON.stringify(r.hours) === JSON.stringify(L10N_HOURS), 'the ar and ur hours equal the record')
    check(JSON.stringify(r.trAbuse) === JSON.stringify(TR_ABUSE_LINES), 'the tr abuse lines equal the record')
    for (const l of ['ar', 'ur', 'tr'] as const) {
      const app = (JSON.parse(readFileSync(root(`src/messages/${l}.json`), 'utf-8')) as { crisis: { immediateDanger: string } }).crisis.immediateDanger
      check(app === IMMEDIATE_DANGER[l], `${l}: crisis.immediateDanger equals the app bundle (Gem 3 reuse)`)
    }
    for (const l of L10N) {
      const app = (JSON.parse(readFileSync(root(`src/messages/${l}.json`), 'utf-8')) as { countries: Record<string, string> }).countries
      const bad = Object.entries(COUNTRY_NAMES[l]).filter(([code, name]) => app[code] !== name)
      check(bad.length === 0 && Object.keys(COUNTRY_NAMES[l]).length > 0, `${l}: the country names equal the bundle's countries.* (${Object.keys(COUNTRY_NAMES[l]).join(', ')})`, bad)
    }
    const drift = Object.keys(HELPLINE_FIELDS).filter((id) => JSON.stringify(helplineEntry(helplines, id)) !== JSON.stringify(HELPLINE_FIELDS[id]))
    check(drift.length === 0, `the ${Object.keys(HELPLINE_FIELDS).length} helpline entries equal src/data/helplines.ts`, drift)
  }

  console.log('\n=== B. structure ===')
  for (const l of L10N) {
    const s = L10N_STRINGS[l] as Record<string, string>
    const self = selfHarmText(l).split('\n').map(bare)
    const fillUrl = (t: string) => t.split('[IASP]').join(IASP_URL)
    if (l === 'tr') check(JSON.stringify(self) === JSON.stringify([s.T1, s.T4, fillUrl(s.T5!)]), 'tr self-harm: T1, T4, T5')
    else {
      const n = SELF_HARM_IDS[l as 'ar' | 'ur' | 'id'].length
      check(self.length === n + 3 && self[0] === s.T1 && self[1] === s.T2 && self[self.length - 1] === fillUrl(s.T3!) && self.slice(2, 2 + n).every((x) => /: .+ \(.+\)$/.test(x)), `${l} self-harm: T1, T2, ${n} lines "Name: number (hours)", T3`)
    }
    const ab = abuseText(l).split('\n').map(bare)
    const para = [s.T6a, s.T6b, s.T6c].join(' ')
    const close = l === 'id' ? s.T8 : IMMEDIATE_DANGER[l as 'ar' | 'ur' | 'tr']
    const n = l === 'tr' ? TR_ABUSE_LINES.length : ABUSE_IDS[l].length
    const head = l === 'ar' ? [para, s.T7] : [para]
    check(
      JSON.stringify(ab.slice(0, head.length)) === JSON.stringify(head) && ab.length === head.length + n + 1 && ab[ab.length - 1] === close,
      `${l} abuse: T6a T6b T6c as one paragraph${l === 'ar' ? ', T7' : ''}, ${n} lines, then ${l === 'id' ? 'T8' : 'crisis.immediateDanger'}`,
    )
    if (l === 'tr') {
      // Gem 10 condition 1: the two helpline lines carry the country; the WhatsApp line is unchanged.
      const tr = COUNTRY_NAMES.tr.TR
      const want = [TR_ABUSE_LINES[0]!.replace(': ', ` (${tr}): `), TR_ABUSE_LINES[1], TR_ABUSE_LINES[2]!.replace(': ', ` (${tr}): `)]
      check(JSON.stringify(ab.slice(1, 4)) === JSON.stringify(want), 'tr abuse lines: the record\'s, in order, with (Türkiye) on ALO 183 and 112; the WhatsApp line unchanged', ab.slice(1, 4))
    }
    check(bare(softText(l)) === `${s.T9a} ${fillUrl(s.T9b!)}`, `${l} soft: T9a T9b`)
    for (const [label, h] of HINTS) {
      const b = block(h, l)
      const want = label === 'self-harm' ? selfHarmText(l) : label === 'abuse' ? abuseText(l) : softText(l)
      check(b.text === want && b.locale === l, `${l} ${label}: the served block carries the localised text and locale`)
    }
  }

  console.log('\n=== B2. Gem 10 conditions 1 and 2: country labels, digits-only ar/ur numbers ===')
  for (const l of L10N) {
    const ids = [...((SELF_HARM_IDS as Record<string, readonly string[]>)[l] ?? []).map((id) => ['self-harm', id] as const), ...ABUSE_IDS[l].map((id) => ['abuse', id] as const)]
    const missing: string[] = []
    for (const [kind, id] of ids) {
      const f = HELPLINE_FIELDS[id]!
      const t = bare(kind === 'self-harm' ? selfHarmText(l) : abuseText(l))
      const num = l === 'ar' || l === 'ur' ? digitsOnly(f.phone) : f.phone
      const line = t.split('\n').find((x) => x.includes(`): ${id === 'id-sejiwa' ? '119, lalu tekan 8' : num} (`)) ?? ''
      if (!line.includes(` (${COUNTRY_NAMES[l][f.country]}): `)) missing.push(`${kind}/${id}`)
    }
    check(missing.length === 0, `${l}: every helpline line carries its country from countries.* (${ids.length} lines)`, missing)
  }
  for (const l of ['ar', 'ur'] as const) {
    for (const [label, h] of HINTS) {
      const t = bare(block(h, l).text)
      const separated = [...t.matchAll(/\d[\d \-]*\d/g)].map((m) => m[0]).filter((x) => /[ -]/.test(x))
      check(separated.length === 0, `${l} ${label}: no phone number contains a space or a hyphen`, separated)
    }
  }
  check(['id', 'tr'].every((l) => bare(abuseText(l as L10nLocale)).includes(l === 'id' ? '021-3903963' : '0501 183 0 183')), 'id and tr numbers keep their separators (left to right, unchanged)')
  {
    // Control: the separator check reports a separated number.
    const probe = [...'x 0311-7786264 y 0801 00 47 47'.matchAll(/\d[\d \-]*\d/g)].map((m) => m[0]).filter((x) => /[ -]/.test(x))
    check(probe.length === 2, 'control: a hyphenated and a spaced number are both caught', probe)
    check(digitsOnly('0801 00 47 47') === '0801004747' && digitsOnly('800-4673') === '8004673' && digitsOnly('0311-7786264') === '03117786264', 'digitsOnly() removes spaces and hyphens only')
  }

  console.log('\n=== C. bidi ===')
  {
    // Controls: the instruments report a fault when there is one.
    check(!isolatesBalanced(`a${LRI}b`) && !isolatesBalanced(`a${PDI}b`) && isolatesBalanced(`a${LRI}b${PDI}`), 'control: an unclosed or unopened isolate is caught')
    const probe = `x 0311-7786264 y ${LRI}1564${PDI}`
    const spans = isolatedSpans(probe, LRI)
    const m = [...probe.matchAll(/\+?\d(?:[\d \-]*\d)?/g)].filter((x) => !inside(spans, x.index!, x.index! + x[0].length)).map((x) => x[0])
    check(JSON.stringify(m) === '["0311-7786264"]', 'control: a bare phone number is caught and an isolated one is not', m)
    check(hasBidiMarks(`a${RLI}b${PDI}`) && !hasBidiMarks('plain'), 'control: bidi marks are detected')
    check(numbers('SEJIWA: 119, lalu tekan 8 (24/7)').join(',') === '119', 'control: numbers() keeps 3+ digit runs only')
    // Ruling 2 (21 Oct): a bare Latin run in RTL text is caught, an isolated one is not.
    const latinProbe = `\u0627 Umang Helpline: ${LRI}0311${PDI} \u0628 ${LRI}SOS Femmes${PDI}`
    const lspans = isolatedSpans(latinProbe, LRI)
    const bareLatin = [...latinProbe.matchAll(/[A-Za-z]+/g)].filter((x) => !inside(lspans, x.index!, x.index! + x[0].length)).map((x) => x[0])
    check(JSON.stringify(bareLatin) === '["Umang","Helpline"]', 'control: a bare Latin name in RTL text is caught and an isolated one is not', bareLatin)
  }
  for (const l of ALL) {
    for (const [label, h] of HINTS) {
      const t = block(h, l).text
      if (l !== 'ar' && l !== 'ur') {
        check(!hasBidiMarks(t), `${l} ${label}: no isolate or bidi marks`)
        continue
      }
      check(isolatesBalanced(t), `${l} ${label}: isolates balanced`)
      const ltrSpans = isolatedSpans(t, LRI)
      const rtlSpans = isolatedSpans(t, RLI)
      const loose: string[] = []
      for (const m of t.matchAll(/\+?\d(?:[\d \-]*\d)?/g)) {
        const digits = m[0].replace(/\D/g, '')
        if (digits.length < 3) continue
        if (!inside(ltrSpans, m.index!, m.index! + m[0].length)) loose.push(m[0])
      }
      for (const m of t.matchAll(/https:\/\/\S+?(?=⁩|\s|$)/g)) if (!inside(ltrSpans, m.index!, m.index! + m[0].length)) loose.push(m[0])
      for (const m of t.matchAll(/24\/7/g)) if (!inside(ltrSpans, m.index!, m.index! + 4)) loose.push('24/7')
      check(loose.length === 0, `${l} ${label}: every phone number, URL and "24/7" sits inside LRI ... PDI`, loose)
      // Ruling 2 (21 Oct): every Latin-script run, service names included.
      const bareLatin = [...t.matchAll(/[A-Za-z]+/g)].filter((m) => !inside(ltrSpans, m.index!, m.index! + m[0].length)).map((m) => m[0])
      check(bareLatin.length === 0, `${l} ${label}: every Latin-script run sits inside LRI ... PDI`, bareLatin)
      const hours = Object.entries(L10N_HOURS[l]).filter(([k]) => k !== '24/7').map(([, v]) => v)
      const bareHours = hours.filter((hh) => t.includes(hh) && !rtlSpans.some(([a, b]) => t.slice(a + 1, b) === hh))
      check(bareHours.length === 0, `${l} ${label}: Arabic-script hours sit inside RLI ... PDI`, bareHours)
    }
  }

  console.log('\n=== D. numbers ===')
  {
    const known = new Set<string>()
    for (const m of helplines.matchAll(/\n\s*(?:phone|note|name): '([^']*)'/g)) for (const d of numbers(m[1]!)) known.add(d)
    for (const m of helplines.matchAll(/altPhones: \[([^\]]*)\]/g)) for (const d of numbers(m[1]!)) known.add(d)
    for (const l of ALL) {
      for (const [label, h] of HINTS) {
        const unknown = numbers(bare(block(h, l).text)).filter((d) => !known.has(d))
        check(unknown.length === 0, `${l} ${label}: every number exists in src/data/helplines.ts`, unknown)
      }
    }
    const note = helplineEntry(helplines, 'tr-alo-183').note ?? ''
    const wa = /WhatsApp: (.+)$/.exec(TR_ABUSE_LINES.find((x) => x.includes('WhatsApp')) ?? '')?.[1]
    check(!!wa && note === `WhatsApp: ${wa}`, `tr WhatsApp line matches the tr-alo-183 note ("${note}")`)
  }

  console.log('\n=== E. no em dash (U+2014), no honorific glyph ===')
  for (const l of ALL) {
    for (const [label, h] of HINTS) {
      const t = block(h, l).text
      check(!t.includes('\u2014') && !t.includes('\u{FDFA}'), `${l} ${label}: the MCP crisis block contains no U+2014 and no U+FDFA`)
    }
  }
  {
    // Ruling 1 (21 Oct): an em-dash name is rendered whole, " \u2014 " as ", ".
    const full = (id: string, join = ', ') => HELPLINE_FIELDS[id]!.name.split(' \u2014 ').join(join)
    const arAbuse = bare(block({ level: 'hard', crisisType: 'abuse' }, 'ar').text)
    const arSelf = bare(block({ level: 'hard', crisisType: 'self-harm' }, 'ar').text)
    const idSelf = block({ level: 'hard', crisisType: 'self-harm' }, 'id').text
    const idAbuse = block({ level: 'hard', crisisType: 'abuse' }, 'id').text
    check(HELPLINE_FIELDS['ar-egypt-ncw']!.name.includes(' \u2014 ') && arAbuse.includes(`${full('ar-egypt-ncw', '\u060C ')} (${COUNTRY_NAMES.ar.EG}): 15115`), 'ar: Egypt keeps the Complaints Office and the National Council for Women')
    // Ruling of 21 Oct (Arabic comma): U+060C joins an Arabic-script name; Latin keeps ", ".
    const egypt = arAbuse.split('\n').find((x) => x.endsWith('15115 (24/7)')) ?? ''
    check(egypt.includes('\u060C ') && !egypt.includes(', ') && !egypt.includes(','), 'ar: the Arabic-script Egypt name joins with the Arabic comma U+060C, no Latin comma', egypt)
    const uae = arSelf.split('\n').find((x) => x.includes('8004673')) ?? ''
    check(uae.startsWith('800-HOPE, National Mental Support Line (') && !uae.includes('\u060C'), 'ar: the Latin-script UAE name keeps ", " (no Arabic comma)', uae)
    check(arSelf.includes(`${full('ar-mohap-hope-uae')} (${COUNTRY_NAMES.ar.AE}): 8004673`) && full('ar-mohap-hope-uae') === '800-HOPE, National Mental Support Line', 'ar: UAE keeps its full name, "800-HOPE, National Mental Support Line"')
    check(idSelf.includes('SEJIWA, Kementerian Kesehatan (Indonesia): 119, lalu tekan 8 (24/7)') && idAbuse.includes('SAPA 129, Kementerian PPPA (Indonesia): 129 (24/7)'), 'id: SEJIWA and SAPA 129 keep their ministries')
    check(idSelf.includes('(Senin\u2013Jumat, jam kantor)'), 'id: the office hours are the dataset string, en dash included (ruling 3)')
  }

  console.log('\n=== F. 182 ===')
  check(ALL.every((l) => HINTS.every(([, h]) => !numbers(bare(block(h, l).text)).includes('182'))), '182 (banned: not a crisis line) is in no block, tr included')

  console.log('\n=== G. Turkish phrases route to the tr blocks ===')
  {
    globalThis.fetch = (async (url: string | URL) => {
      const m = String(url).match(/ayah\/(\d+):(\d+)\/editions\//)
      if (!m) return new Response('{"code":404}', { status: 404 })
      return new Response(JSON.stringify({ code: 200, data: [{ number: 1, text: `ARABIC ${m[1]}:${m[2]}`, surah: { number: Number(m[1]), name: 'S', englishName: 'S' }, numberInSurah: Number(m[2]) }, { number: 1, text: `ENGLISH ${m[1]}:${m[2]}` }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const { getDuaHandler } = await import('../src/tools/get-dua.js')
    const { findVersesHandler } = await import('../src/tools/find-verses.js')
    const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
    const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
    type R = { _sakina_meta: { content_type: string; llm_directives: { CRITICAL_RULES: string[] } }; content: Record<string, unknown>; crisis_resource?: { locale?: string; crisis_type?: string; text?: string; level?: string } }
    for (const [q, type, want] of [['kendimi öldüreceğim', 'self-harm', selfHarmText('tr')], ['intihar edeceğim', 'self-harm', selfHarmText('tr')], ['kocam beni dövüyor', 'abuse', abuseText('tr')]] as const) {
      check(evaluateDistress(q).level === 'hard', `"${q}" is a hard crisis`)
      for (const [tool, r] of [
        ['get_dua', (await getDuaHandler({ context: q, locale: 'tr' })) as unknown as R],
        ['find_verses', (await findVersesHandler({ query: q, locale: 'tr' })) as unknown as R],
        ['get_name_of_allah', (await getNameOfAllahHandler({ name: q, locale: 'tr' })) as unknown as R],
      ] as const) {
        const cr = r.crisis_resource
        check(r._sakina_meta.content_type === 'crisis_resource_only' && cr?.locale === 'tr' && cr.crisis_type === type && cr.text === want, `${tool} "${q}" (tr): the tr ${type} block alone`)
      }
    }
    const soft = (await getDuaHandler({ context: 'anxiety', locale: 'tr' })) as unknown as R
    check(soft.crisis_resource?.level === 'soft' && soft.crisis_resource.text === softText('tr'), 'get_dua "anxiety" (tr): the tr soft block')

    console.log('\n=== H. tr everywhere ===')
    const q = (await getQuranVerseHandler({ surah: 2, ayah: 286, locale: 'tr' })) as unknown as R
    const note = (q.content as { translation_note?: string }).translation_note ?? ''
    check(/Turkish/.test(note) && q._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => /licensed Turkish translation/.test(d)), 'get_quran_verse tr: Pickthall with the parked Turkish note and directive (never silently)')
    const fv = (await findVersesHandler({ query: 'patience', locale: 'tr' })) as unknown as R
    check(fv.crisis_resource === undefined && fv._sakina_meta.llm_directives.CRITICAL_RULES.some((d) => /licensed Turkish translation/.test(d)), 'find_verses tr: the parked Turkish directive')
    const n1 = (await getNameOfAllahHandler({ number: 1, locale: 'tr' })) as unknown as R
    const n1en = (await getNameOfAllahHandler({ number: 1, locale: 'en' })) as unknown as R
    check((n1.content as { english_meaning?: string }).english_meaning === (n1en.content as { english_meaning?: string }).english_meaning, 'get_name_of_allah tr: the English meaning')
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { createMcpServer } = await import('../src/server.js')
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createMcpServer().connect(a)
    const c = new Client({ name: 'wo481', version: '0' })
    await c.connect(b)
    const tools = (await c.listTools()).tools
    check(tools.length === 4 && tools.every((t) => ((t.inputSchema.properties as Record<string, { enum?: string[] }>).locale?.enum ?? []).includes('tr')), 'tools/list: all four tools accept locale "tr"')
    const card = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf-8')
    check((card.match(/enum: \['en', 'id', 'ur', 'ar', 'tr'\]/g) ?? []).length === 4 && !card.includes("enum: ['en', 'id', 'ur', 'ar'],"), 'server card: the four locale enums carry tr')
    await c.close()
  }

  console.log('\n=== J. Gem 10 conditions 3 and 4: English-content disclosure and the translation guard ===')
  {
    const { getDuaHandler, duaByIdResponse, abuseResponse } = await import('../src/tools/get-dua.js')
    const { getNameOfAllahHandler } = await import('../src/tools/get-name-of-allah.js')
    const { getQuranVerseHandler } = await import('../src/tools/get-quran-verse.js')
    const { findVersesHandler } = await import('../src/tools/find-verses.js')
    type R = { _sakina_meta: { llm_directives: { CRITICAL_RULES: string[] } }; content: Record<string, unknown> & { teach?: unknown; duas?: Array<{ teach?: unknown }> } }
    const rulesOf = (r: R) => r._sakina_meta.llm_directives.CRITICAL_RULES
    check(ENGLISH_FALLBACK_GUARD === "Present the English fallback content exactly as provided. Do not attempt to translate this content into the user's requested language.", 'the guard line is Gem 10\'s, verbatim')
    for (const l of ['en', 'ar', 'ur', 'id', 'tr'] as const) {
      const note = duaEnglishNote(l)
      const duaCalls: Array<[string, R]> = [
        ['get_dua "travel"', (await getDuaHandler({ context: 'travel', locale: l })) as unknown as R],
        ['get_dua "anxiety" (soft block)', (await getDuaHandler({ context: 'anxiety', locale: l })) as unknown as R],
        ['get_dua {id: D00068}', duaByIdResponse('D00068', l, ['D00068']) as unknown as R],
        ['abuse allowlist path', abuseResponse('x', undefined, ['D00406', 'D00255'], l) as unknown as R],
      ]
      for (const [label, r] of duaCalls) {
        if (l === 'en') check(r.content.translation_note === undefined && !rulesOf(r).includes(ENGLISH_FALLBACK_GUARD), `en ${label}: no disclosure, no guard`)
        else check(r.content.translation_note === note && rulesOf(r).includes(note!) && rulesOf(r).includes(ENGLISH_FALLBACK_GUARD), `${l} ${label}: translation_note, the same CRITICAL_RULES line, and the guard`)
      }
      const name = (await getNameOfAllahHandler({ number: 1, locale: l })) as unknown as R
      const nameNote = nameEnglishNote(l)
      if (l === 'ar' || l === 'tr') check(name.content.translation_note === nameNote && rulesOf(name).includes(nameNote!) && rulesOf(name).includes(ENGLISH_FALLBACK_GUARD), `${l} get_name_of_allah 1 (English fallback): translation_note, the CRITICAL_RULES line, and the guard`)
      else check(name.content.translation_note === undefined && !rulesOf(name).includes(ENGLISH_FALLBACK_GUARD), `${l} get_name_of_allah 1 (${l === 'en' ? 'English' : 'own translation'}): no disclosure, no guard`)
      const verse = (await getQuranVerseHandler({ surah: 2, ayah: 286, locale: l })) as unknown as R
      const parked = ['ur', 'id', 'tr'].includes(l)
      check(parked ? typeof verse.content.translation_note === 'string' : verse.content.translation_note === undefined, `${l} get_quran_verse: ${parked ? 'the existing parked note' : 'no parked note'} (unchanged)`)
      const fv = (await findVersesHandler({ query: 'patience', locale: l })) as unknown as R
      check(parked === rulesOf(fv).some((d) => /licensed .* translation is not yet available/.test(d)), `${l} find_verses: ${parked ? 'the existing parked directive' : 'no parked directive'} (unchanged)`)
      // Teach: entries are English only and attach for en only (teach/attach.ts), so no
      // teach block is served to a non-en locale and TEACH_ENGLISH_NOTE has no case today.
      const taught = [(await getNameOfAllahHandler({ number: 1, locale: l, audience: 'curious' })) as unknown as R, duaByIdResponse('D00068', l, ['D00068'], 'curious') as unknown as R]
      const hasTeach = taught.some((r) => JSON.stringify(r).includes('"teach"'))
      if (l === 'en') check(hasTeach, 'en: teach is served (control for the non-en check)')
      else check(!hasTeach && !JSON.stringify(taught).includes(TEACH_ENGLISH_NOTE), `${l}: no teach block is served, so no teaching-note disclosure is needed`)
    }
  }

  console.log('\n=== I. en unchanged ===')
  {
    const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
    const pins: Record<string, string> = {
      'self-harm': 'e32491ac33cf913f2a1e021eae6dd0aa2140411defae5eb4ccf6268e17991adb',
      abuse: '75733dbcf399c330d020c5b823e4c789210d0360105b7a3717aeedd59ca53dfd',
      soft: '510f9ec0d477a605ab801cd5bb932f7742214b377fed1709a90f64e4aced8811',
    }
    for (const [label, h] of HINTS) check(sha(JSON.stringify(block(h, 'en'))) === pins[label], `en ${label}: block byte-identical to 2.2.0`)
    check(L10N.every((l) => block({ level: 'soft' }, l).directive === SOFT_DISTRESS_RESOURCE_BLOCK.directive), 'the soft directive is unchanged in every locale')
  }

  console.log(failures ? `\nWO#481: ${failures} of ${checks} FAILED` : `\nWO#481: all ${checks} passed`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.log(`  FAIL threw: ${String(e)}`)
  process.exit(1)
})
