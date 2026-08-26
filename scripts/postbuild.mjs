/**
 * Post-build patching (WO#105).
 *
 * Two jobs:
 *
 *   1. Write `dist/package.json` with `{"type":"module"}` so Node
 *      runs the compiled output as ESM. The parent
 *      `mcp-server/package.json` deliberately omits `type` so the
 *      `bundle-data.ts` script (run via tsx) can import the main
 *      repo's CJS-default modules without ESM resolution errors.
 *      This local override applies only to files under `dist/`.
 *
 *   2. Prepend a `#!/usr/bin/env node` shebang to `dist/server.js`
 *      and mark it executable. `package.json` registers
 *      `dist/server.js` as the `bin` entry; without the shebang
 *      `npx @asksakina/islamic-knowledge-mcp` would fail.
 */

import { promises as fs, constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DIST = path.join(ROOT, 'dist')
const SERVER_JS = path.join(DIST, 'server.js')
const DIST_PACKAGE_JSON = path.join(DIST, 'package.json')

async function exists(p) {
  try {
    await fs.access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function writeDistPackageJson() {
  const payload = { type: 'module' }
  await fs.writeFile(DIST_PACKAGE_JSON, JSON.stringify(payload) + '\n', 'utf-8')
  console.log(`  wrote ${path.relative(ROOT, DIST_PACKAGE_JSON)} (${JSON.stringify(payload)})`)
}

async function addShebang() {
  if (!(await exists(SERVER_JS))) {
    throw new Error(`Expected build output at ${SERVER_JS}`)
  }
  const original = await fs.readFile(SERVER_JS, 'utf-8')
  if (original.startsWith('#!/usr/bin/env node\n')) {
    console.log('  shebang already present on dist/server.js')
  } else {
    await fs.writeFile(SERVER_JS, '#!/usr/bin/env node\n' + original, 'utf-8')
    console.log(`  prepended shebang to ${path.relative(ROOT, SERVER_JS)}`)
  }
  await fs.chmod(SERVER_JS, 0o755)
  console.log('  chmod 755 dist/server.js')
}

async function main() {
  console.log('postbuild patching dist/')
  await writeDistPackageJson()
  await addShebang()
  console.log('done.')
}

main().catch((err) => {
  console.error('postbuild FAILED:', err)
  process.exit(1)
})
