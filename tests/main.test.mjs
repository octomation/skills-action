import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { REGISTRY } from './fixtures.mjs'

const scripts = fileURLToPath(new URL('../scripts', import.meta.url))

// A command that doesn't recognize itself as the main module exits 0 having
// done nothing, so a stale catalog would pass `check`.
test('commands run from paths with spaces, non-ASCII and symlinks', () => {
  const base = mkdtempSync(join(tmpdir(), 'skills-action-'))
  const install = join(base, 'a b', 'путь')
  mkdirSync(install, { recursive: true })
  cpSync(scripts, join(install, 'scripts'), { recursive: true })
  symlinkSync(install, join(base, 'linked'))
  const catalog = join(base, 'catalog')
  mkdirSync(catalog)
  writeFileSync(join(catalog, 'catalog.json'), JSON.stringify(REGISTRY))

  for (const root of [install, join(base, 'linked')]) {
    const res = spawnSync(process.execPath, [join(root, 'scripts', 'generate.mjs'), '--check'], { cwd: catalog, encoding: 'utf8' })
    assert.equal(res.status, 1, `${root}: ${res.stderr}`)
    assert.match(res.stderr, /marketplace\.json: out of date/)
  }
})
