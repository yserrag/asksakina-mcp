/**
 * Release gate (WO#405): Gem 10 must have signed every teach entry before
 * the server is deployed or published.
 *
 * bundle-data checks the per-field sign-offs (Gem 2, 3, 4, 6 + 7), so
 * Gem-signed content can land on main unreleased. This script checks the
 * whole-entry Gem 10 sign-off, and mcp-deploy runs it before any Fly deploy
 * or npm publish. It is deliberately NOT in prepublishOnly: a refusal here
 * means "not cleared for release", not "broken".
 *
 * Run: npm run release-gate
 */

import { TEACH_ENTRIES } from '../src/teach/entries.js'
import { publishGateErrors } from '../src/teach/validate.js'

const errors = publishGateErrors(TEACH_ENTRIES)
const n = Object.keys(TEACH_ENTRIES).length
if (errors.length) {
  console.error(`release gate REFUSED: ${errors.length} of ${n} teach entries lack Gem 10 sign-off`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
console.log(`release gate: ${n} teach entries, all signed by Gem 10`)
