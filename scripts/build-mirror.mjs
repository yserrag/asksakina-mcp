/**
 * WO#444: assemble the public mirror (github.com/yserrag/asksakina-mcp) from
 * this repository, ready to commit there.
 *
 * The mirror holds:
 *   - every tracked file under mcp-server/ (the package source, scripts, evals);
 *   - the built package: dist/ and data/ (the mirror's publish workflow
 *     publishes what is committed and does not build);
 *   - mcp-server/mirror/* at the mirror's root (glama.json, .gitignore and the
 *     publish workflow), except README.mirror.md;
 *   - release.json: version, the AskSakina commit, and the integrity of the
 *     tarball `npm pack` makes here, which the publish workflow re-checks.
 *
 * Paths outside the copy that already exist in the mirror are deleted by the
 * sync, except assets/ (the mirror's own icon), which this script never writes.
 *
 * Run from mcp-server/ after `npm run bundle-data && npm run build`:
 *   node scripts/build-mirror.mjs <out-dir>
 * The out dir must not exist yet.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/build-mirror.mjs <out-dir>')
const OUT = path.resolve(out)
if (existsSync(OUT)) throw new Error(`${OUT} already exists`)

const git = (...args) => execFileSync('git', args, { cwd: PKG, encoding: 'utf8' }).trim()
const copy = (from, to) => {
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(from, to)
  chmodSync(to, statSync(from).mode & 0o777)
}
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

if (!existsSync(path.join(PKG, 'dist', 'server.js'))) throw new Error('dist/server.js missing: run npm run build')
if (!existsSync(path.join(PKG, 'data', 'pickthall.json'))) throw new Error('data/pickthall.json missing: run npm run bundle-data')

// 1. tracked package files (mcp-server/mirror/ goes to the root instead)
const tracked = git('ls-files', '-z', '.').split('\0').filter(Boolean)
let n = 0
for (const rel of tracked) {
  if (rel.startsWith('mirror/') || rel.startsWith('node_modules/')) continue
  copy(path.join(PKG, rel), path.join(OUT, rel))
  n++
}
// 2. the built package
for (const d of ['dist', 'data']) {
  for (const f of walk(path.join(PKG, d))) {
    copy(f, path.join(OUT, path.relative(PKG, f)))
    n++
  }
}
// 3. mirror-only files
for (const f of walk(path.join(PKG, 'mirror'))) {
  const rel = path.relative(path.join(PKG, 'mirror'), f)
  if (rel === 'README.mirror.md') continue
  copy(f, path.join(OUT, rel))
  n++
}

// 4. the tarball npm will publish, measured here
const pkg = JSON.parse(readFileSync(path.join(OUT, 'package.json'), 'utf8'))
if (pkg.repository?.url !== 'https://github.com/yserrag/asksakina-mcp') throw new Error(`repository.url is ${pkg.repository?.url}`)
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: OUT, encoding: 'utf8' }))
const release = {
  version: pkg.version,
  sakinaCommit: git('rev-parse', 'HEAD'),
  integrity: packed.integrity,
  shasum: packed.shasum,
  entryCount: packed.entryCount,
  note: 'Written by mcp-server/scripts/build-mirror.mjs in the AskSakina repository. The publish workflow refuses a tarball whose integrity differs.',
}
writeFileSync(path.join(OUT, 'release.json'), JSON.stringify(release, null, 2) + '\n')
console.log(`mirror assembled in ${OUT}: ${n} files; v${release.version}, tarball ${packed.entryCount} entries, ${packed.integrity}`)
