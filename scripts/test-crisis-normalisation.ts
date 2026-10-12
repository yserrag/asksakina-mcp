/**
 * WO#391: crisis normalisation through every MCP input path.
 *
 * Every variant below missed on 1.5.0 (docs/wo391-crisis-normalisation-sg-report.md,
 * Task 1). Each must now produce the crisis resource ALONE on get_dua
 * (context), find_verses (query) and get_name_of_allah (name): Gem 3
 * zero-content ruling (WO#388), no du'a, verse or Name content. The request
 * echo keeps the caller's text byte for byte (normalisation is for matching
 * only). The synced detector must equal the app source.
 *
 * Run: npm run bundle-data && npm run test:crisis
 */

import { readFileSync } from 'node:fs'
import { getDuaHandler } from '../src/tools/get-dua.js'
import { findVersesHandler } from '../src/tools/find-verses.js'
import { getNameOfAllahHandler } from '../src/tools/get-name-of-allah.js'

let failures = 0
let passes = 0
const ok = (cond: boolean, label: string, detail?: unknown) => {
  if (cond) passes++
  else {
    failures++
    console.log(`  FAIL ${label}${detail === undefined ? '' : `\n       ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}

// No upstream: a crisis response must never need one. Any fetch is a failure.
let fetches = 0
globalThis.fetch = (async () => {
  fetches++
  return new Response('{}', { status: 500 })
}) as typeof fetch

const VARIANTS: ReadonlyArray<[string, 'self-harm' | 'abuse']> = [
  // WO#391 addendum (b), (c): "!" -> i; "1" -> i and l.
  ["k!ll myself", 'self-harm'],
  ["ki11 myself", 'self-harm'],
  ["k1ll myse1f", 'self-harm'],
  // Gem 3: "kill myself" trailing edge open; "kms" hits unless a distance word follows.
  ["kill myselfnow", 'self-harm'],
  ["#iwanttodie", 'self-harm'],
  ["day 3 kms", 'self-harm'],
  ["kill myself", 'self-harm'],
  ["suicide", 'self-harm'],
  ["my husband hits me", 'abuse'],
  ["bunuh diri", 'self-harm'],
  ["khudkushi", 'self-harm'],
  ["self-harm", 'self-harm'],
  ["kill-myself", 'self-harm'],
  ["kill_myself", 'self-harm'],
  ["kill.myself", 'self-harm'],
  ["end-my-life", 'self-harm'],
  ["want-to-die", 'self-harm'],
  ["self_harm", 'self-harm'],
  ["sui-cide", 'self-harm'],
  ["kill--myself", 'self-harm'],
  ["kill...myself", 'self-harm'],
  ["kill___myself", 'self-harm'],
  ["kill-.-myself", 'self-harm'],
  ["k i l l myself", 'self-harm'],
  ["s u i c i d e", 'self-harm'],
  ["k i l l m y s e l f", 'self-harm'],
  ["k1ll myself", 'self-harm'],
  ["su1c1d3", 'self-harm'],
  ["5uic1de", 'self-harm'],
  ["sui\u200bcide", 'self-harm'],
  ["kill\u200bmyself", 'self-harm'],
  ["kill \u200bmyself", 'self-harm'],
  ["su\u200ci\u200dcide", 'self-harm'],
  ["sui\u2060cide", 'self-harm'],
  ["\ufeffsuicide", 'self-harm'],
  ["kiiiill myself", 'self-harm'],
  ["suiiicide", 'self-harm'],
  ["killll myself", 'self-harm'],
  ["suicideeee", 'self-harm'],
  ["kill\u2013myself", 'self-harm'],
  ["kill\u2014myself", 'self-harm'],
  ["kill\u2212myself", 'self-harm'],
  ["kill\u00a0myself", 'self-harm'],
  ["kill\u202fmyself", 'self-harm'],
  ["kill   myself", 'self-harm'],
  ["kill\t myself", 'self-harm'],
  ["killmyself", 'self-harm'],
  ["endmylife", 'self-harm'],
  ["wanttodie", 'self-harm'],
  ["selfharm", 'self-harm'],
  ["bunuhdiri", 'self-harm'],
  ["hebeatsme", 'abuse'],
  ["myhusbandhitsme", 'abuse'],
  ["khud kushi", 'self-harm'],
  ["khud-kushi", 'self-harm'],
  ["bunuh-diri", 'self-harm'],
  ["bunuh_diri", 'self-harm'],
  ["bunuh.diri", 'self-harm'],
  ["mera-shohar-mujhe-marta-hai", 'abuse'],
  ["my-husband-hits-me", 'abuse'],
  ["husband-hits-me", 'abuse'],
  ["he-beats-me", 'abuse'],
  ["KiLl-MySeLf", 'self-harm'],
  ["K1LL--MYSELF", 'self-harm'],
  ["S-U-I-C-I-D-E", 'self-harm'],
  ["Su1c1d3!!!", 'self-harm'],
  ["k-1-l-l m-y-s-e-l-f", 'self-harm'],
  ["KIIILL\u200b_MYSELF", 'self-harm'],
  ["My-HUSBAND_hits.ME", 'abuse'],
  ["I WANT TO END-MY-LIFE", 'self-harm'],
]

type R = { _sakina_meta: { content_type: string }; content: Record<string, unknown>; crisis_resource?: { crisis_type?: string } }
const CONTENT_KEYS = ['duas', 'verses', 'arabic', 'name_block', 'matched_themes', 'translation', 'reflection']

function zeroContent(r: R): boolean {
  return r._sakina_meta.content_type === 'crisis_resource_only' && !!r.crisis_resource && CONTENT_KEYS.every((k) => !(k in r.content))
}

async function main() {
  console.log('\n=== every variant: crisis resource alone, on every free-text path ===')
  for (const [text, type] of VARIANTS) {
    const paths: Array<[string, R, string]> = [
      ['get_dua context', (await getDuaHandler({ context: text })) as unknown as R, 'context'],
      ['find_verses query', (await findVersesHandler({ query: text })) as unknown as R, 'query'],
      ['get_name_of_allah name', (await getNameOfAllahHandler({ name: text })) as unknown as R, 'name'],
    ]
    for (const [path, r, key] of paths) {
      ok(zeroContent(r), `${path} ${JSON.stringify(text)}: crisis_resource_only, no content`, r)
      ok(r.crisis_resource?.crisis_type === type, `${path} ${JSON.stringify(text)}: ${type} block`, r.crisis_resource?.crisis_type)
      const echoed = (r.content.requested as Record<string, unknown> | undefined)?.[key]
      ok(echoed === text, `${path} ${JSON.stringify(text)}: request echoed unaltered`, echoed)
    }
  }

  console.log('\n=== addendum item 9: my-husband-hits-me ===')
  {
    const r = (await getDuaHandler({ context: 'my-husband-hits-me' })) as unknown as R
    ok(
      r._sakina_meta.content_type === 'crisis_resource_only' && r.crisis_resource?.crisis_type === 'abuse' && !('duas' in r.content) &&
        !JSON.stringify(r).includes('marriage'),
      'get_dua("my-husband-hits-me"): abuse crisis block only, zero du\'as, no marriage category',
      r,
    )
  }

  console.log('\n=== benign lookups unchanged ===')
  {
    const name = (await getNameOfAllahHandler({ name: 'Al-Wadud' })) as unknown as R
    ok(name._sakina_meta.content_type === 'name_of_allah' && !name.crisis_resource, 'get_name_of_allah("Al-Wadud"): the Name, no crisis block', name._sakina_meta)
    const num = (await getNameOfAllahHandler({ number: 1 })) as unknown as R
    ok(num._sakina_meta.content_type === 'name_of_allah' && !num.crisis_resource, 'get_name_of_allah(1): the Name, no crisis block')
    const dua = (await getDuaHandler({ context: 'marriage' })) as unknown as R
    ok(dua._sakina_meta.content_type === 'dua_collection' && !dua.crisis_resource, 'get_dua("marriage"): du\'as, no crisis block')
    const kill = (await getDuaHandler({ context: 'kill the process' })) as unknown as R
    ok(kill._sakina_meta.content_type !== 'crisis_resource_only', 'get_dua("kill the process"): not a crisis', kill._sakina_meta)
    // Addendum (a) and (d): no bare "abuse"; the English word boundary.
    for (const benign of ['substance abuse', 'abuse of power', 'the hits media', 'self-harmony', 'skill myself', '5 kms walk', '10 kms away']) {
      const r = (await getDuaHandler({ context: benign })) as unknown as R
      ok(r._sakina_meta.content_type !== 'crisis_resource_only' && !r.crisis_resource?.crisis_type, `get_dua(${JSON.stringify(benign)}): not a crisis`, r._sakina_meta)
    }
  }

  ok(fetches === 0, 'no upstream fetch on any crisis response', fetches)

  console.log('\n=== synced detector equals the app source ===')
  for (const f of ['crisis-normalise', 'crisis-detection', 'latin-fold', 'arabic-normalise']) {
    const src = readFileSync(new URL(`../../src/lib/utils/${f}.ts`, import.meta.url), 'utf-8')
    const synced = readFileSync(new URL(`../src/safety/_synced/${f}.ts`, import.meta.url), 'utf-8')
    const body = synced.split('\n').filter((_, i, a) => !(a.slice(0, i + 1).every((l) => l.startsWith('//')))).join('\n').replace(/^\n/, '')
    const unrewritten = body
      .replace("from './arabic-normalise.js'", "from '@/lib/utils/arabic-normalise'")
      .replace("from './latin-fold.js'", "from '@/lib/utils/latin-fold'")
      .replace("from './crisis-normalise.js'", "from '@/lib/utils/crisis-normalise'")
    ok(unrewritten === src, `_synced/${f}.ts equals src/lib/utils/${f}.ts (header and import paths aside)`)
  }

  console.log(`\nWO#391 MCP crisis normalisation: ${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
