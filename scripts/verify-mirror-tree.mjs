/**
 * Release guard (v2.5.0 incident, 24 Oct 2026): before mcp-deploy commits and tags
 * the public mirror, prove the mirror tree is exactly what build-mirror.mjs built
 * for THIS run.
 *
 * What happened: the v2.5.0 mirror commit kept the previous release.json
 * (version 2.4.2, sakinaCommit 0aa5470c). The new file had the same byte size
 * (431) and was written in the same second as the clone's copy, so rsync's
 * quick check (size + whole-second mtime) skipped it. The mirror's publish
 * workflow then refused the tag ("release.json version differs from the tag").
 *
 *   node scripts/verify-mirror-tree.mjs <build-dir> <mirror-dir> <version> <sakina-commit>
 *   node scripts/verify-mirror-tree.mjs --self-test
 *
 * Fails (exit 1) unless:
 *   1. <build-dir>/release.json has this version and this commit;
 *   2. every file in <build-dir> is byte-identical in <mirror-dir>;
 *   3. <mirror-dir> holds no other file, except .git/ and assets/ (the mirror's own).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const walk = (root, dir = root) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    const rel = path.relative(root, p)
    if (rel === '.git' || rel === 'assets') return []
    return statSync(p).isDirectory() ? walk(root, p) : [rel]
  })

export function verify(build, mirror, version, commit) {
  const errors = []
  let release
  try {
    release = JSON.parse(readFileSync(path.join(build, 'release.json'), 'utf8'))
  } catch (e) {
    return [`build release.json unreadable: ${e.message}`]
  }
  if (release.version !== version) errors.push(`build release.json version is ${release.version}, this run is ${version}`)
  if (release.sakinaCommit !== commit) errors.push(`build release.json sakinaCommit is ${release.sakinaCommit}, this run is ${commit}`)
  const built = walk(build)
  const synced = new Set(walk(mirror))
  for (const rel of built) {
    if (!synced.has(rel)) errors.push(`missing in the mirror: ${rel}`)
    else if (!readFileSync(path.join(build, rel)).equals(readFileSync(path.join(mirror, rel)))) errors.push(`differs from the build: ${rel}`)
    synced.delete(rel)
  }
  for (const rel of synced) errors.push(`not in the build: ${rel}`)
  return errors
}

function selfTest() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'mirror-guard-'))
  const build = path.join(tmp, 'build')
  const mirror = path.join(tmp, 'mirror')
  mkdirSync(build)
  mkdirSync(path.join(mirror, '.git'), { recursive: true })
  mkdirSync(path.join(mirror, 'assets'), { recursive: true })
  const rel = (v, c) => JSON.stringify({ version: v, sakinaCommit: c }) + '\n'
  writeFileSync(path.join(build, 'release.json'), rel('2.5.0', 'b'.repeat(40)))
  writeFileSync(path.join(build, 'package.json'), '{"version": "2.5.0"}\n')
  writeFileSync(path.join(mirror, 'release.json'), rel('2.4.2', 'a'.repeat(40)))
  writeFileSync(path.join(mirror, 'package.json'), '{"version": "2.4.2"}\n')
  writeFileSync(path.join(mirror, 'stale.js'), 'x')
  writeFileSync(path.join(mirror, 'assets', 'icon.png'), 'png')
  let failures = 0
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`)
    if (!ok) failures++
  }
  // The incident: same size, same second, so rsync's quick check keeps the stale file.
  const t = new Date('2026-10-24T18:56:52.300Z')
  for (const d of [build, mirror]) for (const f of ['release.json', 'package.json']) utimesSync(path.join(d, f), t, t)
  let haveRsync = true
  try {
    execFileSync('rsync', ['-a', '--delete', '--exclude', '/.git', '--exclude', '/assets/', `${build}/`, `${mirror}/`])
  } catch {
    haveRsync = false
  }
  if (haveRsync) {
    const errs = verify(build, mirror, '2.5.0', 'b'.repeat(40))
    check(errs.some((e) => e === 'differs from the build: release.json'), 'control: plain rsync keeps a same-size, same-second stale release.json, and the guard catches it')
    execFileSync('rsync', ['-a', '--delete', '--checksum', '--exclude', '/.git', '--exclude', '/assets/', `${build}/`, `${mirror}/`])
    check(verify(build, mirror, '2.5.0', 'b'.repeat(40)).length === 0, 'rsync --checksum syncs it; the guard passes (assets/ and .git/ kept)')
  } else {
    console.log('  (rsync not installed: the rsync control is skipped; the guard checks below still run)')
    rmSync(path.join(mirror, 'stale.js'))
    writeFileSync(path.join(mirror, 'package.json'), readFileSync(path.join(build, 'package.json')))
  }
  check(verify(build, mirror, '2.5.1', 'b'.repeat(40)).some((e) => e.includes('version is 2.5.0, this run is 2.5.1')), 'a release.json for another version is refused')
  check(verify(build, mirror, '2.5.0', 'c'.repeat(40)).some((e) => e.includes('sakinaCommit')), 'a release.json for another commit is refused')
  writeFileSync(path.join(mirror, 'extra.txt'), 'x')
  check(verify(build, mirror, '2.5.0', 'b'.repeat(40)).includes('not in the build: extra.txt'), 'a file the build does not have is refused')
  rmSync(tmp, { recursive: true, force: true })
  console.log(`verify-mirror-tree self-test: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

if (process.argv[2] === '--self-test') selfTest()
else {
  const [build, mirror, version, commit] = process.argv.slice(2)
  if (!build || !mirror || !version || !commit) throw new Error('usage: verify-mirror-tree.mjs <build-dir> <mirror-dir> <version> <sakina-commit>')
  const errors = verify(build, mirror, version, commit)
  if (errors.length) {
    for (const e of errors.slice(0, 50)) console.error(`::error::${e}`)
    console.error(`mirror tree does not match this run's build (${errors.length} problem(s)); nothing committed or tagged`)
    process.exit(1)
  }
  console.log(`mirror tree matches the build: v${version}, ${commit.slice(0, 7)}`)
}
