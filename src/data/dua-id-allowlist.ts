/**
 * get_dua `id` allowlist (WO#390, Architect ruling on flag 3).
 *
 * Built at bundle time from the Gem-2-signed `related` lists in
 * src/teach/entries.ts (scripts/bundle-data.ts). An open id lookup would make
 * the whole corpus enumerable outside the armor (WO#86 corpus, Gem 10 WO#343
 * concern), so get_dua resolves ONLY these ids. Empty while no teach content
 * exists. A missing file fails closed: nothing resolves.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.resolve(HERE, '..', '..', 'data', 'dua-id-allowlist.json')

function load(): readonly string[] {
  try {
    const ids = JSON.parse(readFileSync(FILE, 'utf-8')) as unknown
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const DUA_ID_ALLOWLIST: readonly string[] = load()
