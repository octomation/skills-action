import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  checkCatalog,
  checkSkill,
  compareVersions,
  defaultRange,
  digestDir,
  digestFiles,
  marketplaceManifest,
  parseFrontmatter,
  checkRange,
  parseRange,
  parseVersion,
  provenanceRecord,
  provenanceSkills,
  satisfies,
  toolSkills,
} from '../scripts/lib.mjs'
import { validate, validateDiscovery } from '../scripts/validate.mjs'
import { REGISTRY, REVIEW, SKILL, registryWith, skillFiles } from './fixtures.mjs'

test('parseFrontmatter reads folded blocks, quoted scalars and nested maps', () => {
  const { data, body } = parseFrontmatter(SKILL)
  assert.equal(data.name, 'indexit')
  assert.equal(data.description, 'Export Telegram data with the indexit CLI. Use when the user wants to export chats.')
  assert.equal(data.compatibility, 'Requires the indexit binary.')
  assert.deepEqual(data.metadata, {
    author: 'octopot',
    version: '0.2.0',
    tool: 'indexit',
    'tool-version-range': '>=0.2.0 <0.3.0',
  })
  assert.match(body, /# indexit/)
})

test('parseFrontmatter folds paragraphs like YAML', () => {
  const fm = (yaml) => parseFrontmatter(`---\n${yaml}\n---\n`).data.d
  assert.equal(fm('d: >-\n  a\n\n  b'), 'a\nb')
  assert.equal(fm('d: >-\n  a\n\n\n  b'), 'a\n\nb')
  assert.equal(fm('d: >\n  a\n  b'), 'a b\n')
  assert.equal(fm('d: |-\n  a\n\n  b'), 'a\n\nb')
})

test('parseFrontmatter rejects what it does not understand', () => {
  const fm = (yaml) => () => parseFrontmatter(`---\n${yaml}\n---\n`)
  assert.throws(() => parseFrontmatter('no frontmatter'), /must start/)
  assert.throws(() => parseFrontmatter('---\nname: x\n'), /closing/)
  assert.throws(fm('description: [invalid, sequence]'), /quote values that start with \[/)
  assert.throws(fm('tags: {a: b}'), /quote values that start with \{/)
  assert.throws(fm('metadata:\n  author: true'), /non-string/)
  assert.throws(fm('metadata:\n  version: 1.0'), /number/)
  assert.throws(fm("license: 'MIT"), /unterminated/)
  assert.throws(fm('license: "MIT" extra'), /unterminated or trailing/)
  assert.throws(fm('name: a\nname: b'), /duplicate key/)
  assert.throws(fm('metadata:\n  a: x\n   b: y'), /inconsistent indentation/)
  assert.throws(fm('metadata:\n  nested:\n    deep: x'), /one level/)
  assert.throws(fm('range: >=1.0.0 <2.0.0'), /start with >/)
  assert.throws(fm('note: a: b'), /contain ": "/)
  assert.throws(fm('list:\n  - a'), /unsupported line/)
})

test('versions compare by semver precedence', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.9.9', '0.10.0'), -1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-1'), 1)
})

test('defaultRange follows the OctoLab policy', () => {
  assert.equal(defaultRange('1.4.2'), '>=1.4.2 <2.0.0')
  assert.equal(defaultRange('0.4.2'), '>=0.4.2 <0.5.0')
  assert.equal(defaultRange('0.0.2'), '=0.0.2')
  assert.equal(defaultRange('1.0.0-rc.1'), '=1.0.0-rc.1')
})

test('satisfies checks every comparator', () => {
  assert.ok(satisfies('0.2.5', '>=0.2.0 <0.3.0'))
  assert.ok(!satisfies('0.3.0', '>=0.2.0 <0.3.0'))
  assert.ok(!satisfies('0.1.9', '>=0.2.0 <0.3.0'))
  assert.ok(satisfies('1.0.0', '1.0.0'))
  assert.ok(!satisfies('2.0.0', '>=1.0.0 <2.0.0'))
  assert.equal(parseRange('>=x'), null)
  assert.equal(parseRange(''), null)
})

test('prereleases match only ranges that name them', () => {
  assert.ok(!satisfies('0.3.0-rc.1', '>=0.2.0 <0.3.0'))
  assert.ok(satisfies('0.3.0-rc.2', '>=0.3.0-rc.1 <0.3.0'))
  assert.ok(satisfies('1.0.0-rc.1', '=1.0.0-rc.1'))
})

test('versions are strict semver without build metadata', () => {
  assert.equal(parseVersion('1.0.0+foo..bar'), null)
  assert.equal(parseVersion('1.0.0+build'), null)
  assert.equal(parseVersion('01.0.0'), null)
  assert.equal(parseVersion('1.0.0-01'), null)
  assert.ok(parseVersion('1.0.0-rc.1'))
})

test('checkRange enforces the compatibility policy', () => {
  assert.equal(checkRange('0.2.0', '>=0.2.0 <0.3.0'), null)
  assert.equal(checkRange('0.2.3', '>=0.2.3 <0.2.5'), null)
  assert.equal(checkRange('1.4.2', '>=1.4.2 <2.0.0'), null)
  assert.equal(checkRange('0.0.2', '=0.0.2'), null)
  assert.match(checkRange('0.2.0', '>=0.1.0 <9.0.0'), /start at the release/)
  assert.match(checkRange('0.2.0', '>=0.2.0 <9.0.0'), /no later than <0.3.0/)
  assert.match(checkRange('0.2.0', '>=0.2.0'), /look like/)
  assert.match(checkRange('0.0.2', '>=0.0.2 <0.1.0'), /must be =0.0.2/)
  assert.equal(checkRange('0.2.0', '=0.2.0'), null)
  assert.equal(checkRange('1.4.2', '=1.4.2'), null)
  assert.match(checkRange('0.2.0', '>=0.2.0 <0.3.0-rc.1'), /prereleases/)
})

test('checkSkill accepts a valid skill', () => {
  assert.deepEqual(checkSkill('indexit', skillFiles()).errors, [])
})

test('checkSkill reports contract violations', () => {
  const bad = SKILL.replace('name: indexit', 'name: other')
    .replace('version: "0.2.0"', 'version: "0.3.0"')
    .replace('references/cli.md', 'references/missing.md')
  const { errors } = checkSkill('indexit', skillFiles(bad))
  assert.ok(errors.some((e) => e.includes('name: must be indexit')))
  assert.ok(errors.some((e) => e.includes('tool-version-range: must start at the release')))
  assert.ok(errors.some((e) => e.includes('broken link')))
})

test('digest is length-delimited, order-independent and stable', () => {
  const a = digestFiles([['a', Buffer.from('bc')], ['b', Buffer.from('')]])
  const b = digestFiles([['b', Buffer.from('')], ['a', Buffer.from('bc')]])
  const c = digestFiles([['a', Buffer.from('b')], ['b', Buffer.from('c')]])
  assert.equal(a, b)
  assert.notEqual(a, c)
  // Test vector shared with tool implementations (`<tool> skill info`).
  assert.equal(
    digestFiles([['SKILL.md', Buffer.from('hello\n')], ['references/a.md', Buffer.from('a')]]),
    'sha256:64ce802d5cef2c789ce95d306c9fcce6779c6e8166339ae47634e7f8b265a34b',
  )
  // A two-skill payload: each folder has its own digest over paths relative to
  // that folder; the folders are never hashed together.
  const main = [['SKILL.md', Buffer.from('hello\n')], ['references/a.md', Buffer.from('a')]]
  const review = [['SKILL.md', Buffer.from('review\n')], ['references/b.md', Buffer.from('b')]]
  assert.deepEqual([digestFiles(main), digestFiles(review)], [
    'sha256:64ce802d5cef2c789ce95d306c9fcce6779c6e8166339ae47634e7f8b265a34b',
    'sha256:6b08e3ae572f59554e9849f24d1f37241d1362d8701684d7ed9997137360c36d',
  ])
})

test('digestDir rejects symlinks and dotfiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-'))
  writeFileSync(join(dir, 'SKILL.md'), 'x')
  mkdirSync(join(dir, 'references'))
  writeFileSync(join(dir, 'references', 'a.md'), 'a')
  assert.match(digestDir(dir), /^sha256:[0-9a-f]{64}$/)
  symlinkSync('SKILL.md', join(dir, 'link.md'))
  assert.throws(() => digestDir(dir), /symbolic links/)
  const dot = mkdtempSync(join(tmpdir(), 'skill-'))
  writeFileSync(join(dot, '.marker.json'), '{}')
  assert.throws(() => digestDir(dot), /dotfiles/)
})

test('checkCatalog accepts the registry and rejects bad entries', () => {
  assert.deepEqual(checkCatalog(REGISTRY), [])
  const bad = structuredClone(REGISTRY)
  bad.tools.indexit.skill = '../indexit'
  bad.tools.indexit.homepage = 'http://indexit.octolab.org/'
  const errors = checkCatalog(bad)
  assert.ok(errors.some((e) => e.includes('.skill')))
  assert.ok(errors.some((e) => e.includes('.homepage')))
})

test('marketplaceManifest lists only published tools, sorted', () => {
  const m = marketplaceManifest(REGISTRY, ['zeta', 'indexit'])
  assert.deepEqual(
    m.plugins.map((p) => [p.name, p.source]),
    [
      ['indexit', './plugins/indexit'],
      ['zeta', './plugins/zeta'],
    ],
  )
  assert.deepEqual(marketplaceManifest(REGISTRY, []).plugins, [])
})

test('checkCatalog checks extra-skills', () => {
  assert.deepEqual(checkCatalog(registryWith(['review', 'audit-log'])), [])
  const errors = checkCatalog(registryWith(['Review', 'indexit', 'audit', 'audit']))
  assert.ok(errors.some((e) => e.includes('extra-skills[0]: must be kebab-case')))
  assert.ok(errors.some((e) => e.includes('extra-skills[1]: indexit is the main skill')))
  assert.ok(errors.some((e) => e.includes('extra-skills[3]: audit is listed twice')))
  assert.ok(checkCatalog(registryWith('review')).some((e) => e.includes('extra-skills: must be a list')))
  // numeric names would lead the skills map instead of the main skill
  assert.ok(checkCatalog(registryWith(['42'])).some((e) => e.includes('extra-skills[0]: must not be a number')))
  assert.deepEqual(checkCatalog(registryWith(['review-2'])), [])
  // one namespace across the catalog
  assert.ok(checkCatalog(registryWith(['zeta'])).some((e) => e.includes('zeta is already a skill of zeta')))
  const both = registryWith(['review'])
  both.tools.zeta['extra-skills'] = ['review']
  assert.ok(checkCatalog(both).some((e) => e.includes('review is already a skill of indexit')))
})

test('toolSkills puts the main skill first and extra skills next to it', () => {
  assert.deepEqual(toolSkills('indexit', REGISTRY.tools.indexit), [['indexit', 'skills/indexit']])
  assert.deepEqual(toolSkills('indexit', { skill: 'agent/indexit', 'extra-skills': ['review'] }), [
    ['indexit', 'agent/indexit'],
    ['review', 'agent/review'],
  ])
})

test('provenance keeps the single-skill form and reads both forms', () => {
  const base = { tool: 'indexit', version: '0.2.0', repository: 'octopot/indexit', tag: 'v0.2.0', commit: 'c', publisher: 'p' }
  const one = provenanceRecord({ ...base, skills: [{ name: 'indexit', path: 'skills/indexit', digest: 'sha256:a' }] })
  assert.deepEqual(one, {
    schema: 1,
    tool: 'indexit',
    version: '0.2.0',
    source: { repository: 'octopot/indexit', tag: 'v0.2.0', commit: 'c', path: 'skills/indexit' },
    digest: { algorithm: 'octolab-skill-sha256-v1', value: 'sha256:a' },
    publisher: 'p',
  })
  assert.deepEqual([...provenanceSkills(one)], [['indexit', { path: 'skills/indexit', digest: 'sha256:a' }]])
  const two = provenanceRecord({
    ...base,
    skills: [
      { name: 'indexit', path: 'skills/indexit', digest: 'sha256:a' },
      { name: 'review', path: 'skills/review', digest: 'sha256:b' },
    ],
  })
  assert.equal(two.digest.value, 'sha256:a')
  assert.deepEqual([...provenanceSkills(two).keys()], ['indexit', 'review'])
  for (const bad of [null, [], false, 'x']) assert.throws(() => provenanceSkills({ ...one, skills: bad }), /skills must be a map/)
})

test('checkSkill checks an extra skill by its own name', () => {
  const files = new Map([['SKILL.md', Buffer.from(REVIEW)]])
  assert.deepEqual(checkSkill('indexit', files, 'review').errors, [])
  assert.ok(checkSkill('indexit', files).errors.some((e) => e.includes('name: must be indexit')))
})

// catalogDir writes a catalog checkout with indexit published with skills.
function catalogDir(registry, published, extraDirs = []) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-'))
  writeFileSync(join(root, 'catalog.json'), JSON.stringify(registry))
  const base = join(root, 'plugins', 'indexit')
  const texts = { indexit: SKILL, review: REVIEW }
  const skills = []
  for (const name of [...published, ...extraDirs]) {
    const files = name === 'indexit' ? skillFiles() : new Map([['SKILL.md', Buffer.from(texts[name] || REVIEW)]])
    for (const [rel, bytes] of files) {
      mkdirSync(join(base, 'skills', name, rel, '..'), { recursive: true })
      writeFileSync(join(base, 'skills', name, rel), bytes)
    }
    if (published.includes(name)) skills.push({ name, path: `skills/${name}`, digest: digestFiles(files) })
  }
  mkdirSync(join(base, '.claude-plugin'), { recursive: true })
  writeFileSync(join(base, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.2.0' }))
  const prov = provenanceRecord({
    tool: 'indexit', version: '0.2.0', repository: 'octopot/indexit', tag: 'v0.2.0', commit: 'a'.repeat(40), skills, publisher: 'p',
  })
  writeFileSync(join(base, 'provenance.json'), JSON.stringify(prov))
  return root
}

test('validate: files = provenance ⊆ registry', () => {
  // the new publisher with two skills
  assert.deepEqual(validate(catalogDir(registryWith(['review']), ['indexit', 'review'])), [])
  // the old publisher, or a skill registered for the next release
  assert.deepEqual(validate(catalogDir(registryWith(['review']), ['indexit'])), [])
  assert.deepEqual(validate(catalogDir(REGISTRY, ['indexit'])), [])
  // a published skill that is not registered
  assert.ok(validate(catalogDir(REGISTRY, ['indexit', 'review'])).some((e) => e.includes('review is not registered')))
  // a skill folder the provenance does not list, registered or not
  for (const registry of [REGISTRY, registryWith(['review'])]) {
    const errors = validate(catalogDir(registry, ['indexit'], ['review']))
    assert.ok(errors.some((e) => e.includes('skills/review/SKILL.md: unexpected file')), errors.join('\n'))
  }
})

test('validateDiscovery expects every published skill', () => {
  const root = catalogDir(registryWith(['review']), ['indexit', 'review'])
  const installed = (...names) => names.map((name) => ({ name, status: 'installed' }))
  assert.deepEqual(validateDiscovery(root, installed('review', 'indexit')), [])
  assert.match(validateDiscovery(root, installed('indexit'))[0], /expected \[indexit, review\]/)
})

test('validate reports an invalid registry without throwing', () => {
  const cases = [
    [(r) => (r.tools.indexit['extra-skills'] = 'review'), /extra-skills: must be a list/],
    [(r) => (r.tools.indexit['extra-skills'] = [1]), /extra-skills\[0\]: must be kebab-case/],
    [(r) => delete r.tools.indexit.skill, /indexit\.skill: must be a relative path/],
  ]
  for (const [change, error] of cases) {
    const registry = structuredClone(REGISTRY)
    change(registry)
    const root = catalogDir(registryWith(['review']), ['indexit', 'review'])
    writeFileSync(join(root, 'catalog.json'), JSON.stringify(registry))
    let errors
    assert.doesNotThrow(() => (errors = validate(root)))
    assert.ok(errors.some((e) => error.test(e)), errors.join('\n'))
  }
})
