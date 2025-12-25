import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { inspect } from '../scripts/inspect.mjs'
import { digestFiles, provenanceRecord, recordedSkills } from '../scripts/lib.mjs'
import { REVIEW, skillFiles } from './fixtures.mjs'

const action = fileURLToPath(new URL('../scripts/action.mjs', import.meta.url))
const cli = fileURLToPath(new URL('../bin/octolab-skills.mjs', import.meta.url))
const COMMIT = 'a'.repeat(40)

// published writes a catalog checkout with indexit published with skills and
// no catalog.json: inspect must not need it. change edits the record.
function published(skills, change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'inspect-'))
  const base = join(root, 'plugins', 'indexit')
  const list = []
  for (const name of skills) {
    const files = name === 'indexit' ? skillFiles() : new Map([['SKILL.md', Buffer.from(REVIEW)]])
    for (const [rel, bytes] of files) {
      mkdirSync(join(base, 'skills', name, rel, '..'), { recursive: true })
      writeFileSync(join(base, 'skills', name, rel), bytes)
    }
    list.push({ name, path: `skills/${name}`, digest: digestFiles(files) })
  }
  const prov = provenanceRecord({
    tool: 'indexit', version: '0.2.0', repository: 'octopot/indexit', tag: 'v0.2.0', commit: COMMIT, skills: list, publisher: 'p',
  })
  change(prov)
  writeFileSync(join(base, 'provenance.json'), JSON.stringify(prov))
  return root
}

const digest = (name) => digestFiles(name === 'indexit' ? skillFiles() : new Map([['SKILL.md', Buffer.from(REVIEW)]]))

test('inspect reads a single-skill record without skills', () => {
  const root = published(['indexit'])
  assert.equal(JSON.parse(readFileSync(join(root, 'plugins/indexit/provenance.json'), 'utf8')).skills, undefined)
  assert.deepEqual(inspect(root, 'indexit'), {
    record: {
      tool: 'indexit',
      version: '0.2.0',
      source: { repository: 'octopot/indexit', tag: 'v0.2.0', commit: COMMIT },
      skills: { indexit: { path: 'skills/indexit', digest: digest('indexit') } },
    },
  })
})

test('inspect reads a record with skills, the main one first', () => {
  const { record } = inspect(published(['indexit', 'review']), 'indexit')
  assert.deepEqual(Object.entries(record.skills), [
    ['indexit', { path: 'skills/indexit', digest: digest('indexit') }],
    ['review', { path: 'skills/review', digest: digest('review') }],
  ])
})

test('inspect refuses a record that does not match its plugin', () => {
  const cases = [
    ['schema 2', published(['indexit'], (p) => (p.schema = 2)), /schema 2 is not 1/],
    ['schema 2 of another form', published(['indexit'], (p) => ((p.schema = 2), (p.skills = []))), /schema 2 is not 1/],
    ['another tool', published(['indexit'], (p) => (p.tool = 'zeta')), /tool must be indexit/],
    ['a repository', published(['indexit'], (p) => (p.source.repository = 'octopot')), /source\.repository must be owner\/repo/],
    ['a repository of dots', published(['indexit'], (p) => (p.source.repository = '../..')), /source\.repository must be owner\/repo/],
    ['a tag', published(['indexit'], (p) => (p.source.tag = '0.2.0')), /source\.tag must be v0\.2\.0/],
    ['a commit', published(['indexit'], (p) => (p.source.commit = 'abc')), /source\.commit must be a full SHA/],
    ['a commit not a string', published(['indexit'], (p) => (p.source.commit = [COMMIT])), /source\.commit must be a full SHA/],
    ['a version with v', published(['indexit'], (p) => ((p.version = 'v0.2.0'), (p.source.tag = 'vv0.2.0'))), /version must be a semantic version/],
    ['a path with ..', published(['indexit', 'review'], (p) => (p.skills.review.path = '../secrets')), /skill review has a path outside the repository/],
    ['an absolute path', published(['indexit'], (p) => (p.source.path = '/etc')), /skill indexit has a path outside the repository/],
    [
      'a name not by NAME',
      published(['indexit', 'review'], (p) => (p.skills = { indexit: p.skills.indexit, Review: p.skills.review })),
      /"Review" is not a skill name/,
    ],
    ['no main skill', published(['indexit', 'review'], (p) => delete p.skills.indexit), /does not list the main skill indexit/],
    [
      'the main skill not first',
      published(['indexit', 'review'], (p) => (p.skills = { review: p.skills.review, indexit: p.skills.indexit })),
      /main skill indexit must come first/,
    ],
    ['a foreign digest', published(['indexit', 'review'], (p) => (p.skills.review.digest = digest('indexit'))), /skills\/review: files hash to sha256:\w+, provenance\.json records/],
    ['skills not a map', published(['indexit'], (p) => (p.skills = [])), /skills must be a map/],
  ]
  for (const [what, root, error] of cases) {
    const { errors, record } = inspect(root, 'indexit')
    assert.equal(record, undefined, what)
    assert.ok(errors.some((e) => error.test(e)), `${what}: ${errors.join('\n')}`)
  }
})

test('inspect refuses skill folders that the record does not list, and recorded skills without a folder', () => {
  const extra = published(['indexit'])
  mkdirSync(join(extra, 'plugins/indexit/skills/review'))
  writeFileSync(join(extra, 'plugins/indexit/skills/review/SKILL.md'), REVIEW)
  assert.match(inspect(extra, 'indexit').errors.join('\n'), /skills\/review: not listed in provenance\.json/)

  const missing = published(['indexit', 'review'])
  rmSync(join(missing, 'plugins/indexit/skills/review'), { recursive: true })
  assert.match(inspect(missing, 'indexit').errors.join('\n'), /skills\/review: missing; provenance\.json lists it/)

  const changed = published(['indexit', 'review'])
  appendFileSync(join(changed, 'plugins/indexit/skills/review/SKILL.md'), 'tampered\n')
  assert.match(inspect(changed, 'indexit').errors.join('\n'), /skills\/review: files hash to/)
})

test('inspect refuses a tool that is not published or not a name', () => {
  const root = published(['indexit'])
  assert.match(inspect(root, 'zeta').errors[0], /plugins\/zeta\/provenance\.json: missing/)
  assert.match(inspect(root, '../indexit').errors[0], /is not a tool name/)
  writeFileSync(join(root, 'plugins/indexit/provenance.json'), 'null')
  assert.match(inspect(root, 'indexit').errors[0], /provenance\.json: must be a JSON object/)
})

test('inspect does not follow symbolic links out of the plugin', () => {
  const outside = published(['indexit'])
  for (const rel of ['', '/provenance.json', '/skills']) {
    const root = published(['indexit'])
    const path = join(root, 'plugins/indexit') + rel
    rmSync(path, { recursive: true })
    symlinkSync(join(outside, 'plugins/indexit') + rel, path)
    assert.match(inspect(root, 'indexit').errors?.[0] || '', /a symbolic link, not read/, rel || 'plugin')
  }
  const linked = mkdtempSync(join(tmpdir(), 'inspect-'))
  symlinkSync(join(outside, 'plugins'), join(linked, 'plugins'))
  assert.match(inspect(linked, 'indexit').errors[0], /^plugins: a symbolic link, not read/)
  const root = published(['indexit'])
  symlinkSync(join(outside, 'plugins/indexit/skills/indexit'), join(root, 'plugins/indexit/skills/review'))
  assert.match(inspect(root, 'indexit').errors.join('\n'), /skills\/review: not a skill folder/)
})

test('recordedSkills keeps the recorded order and the rule publish replays by', () => {
  const prov = JSON.parse(readFileSync(join(published(['indexit', 'review']), 'plugins/indexit/provenance.json'), 'utf8'))
  assert.deepEqual(recordedSkills(prov, 'indexit').map(([n]) => n), ['indexit', 'review'])
  assert.throws(() => recordedSkills(prov, 'zeta'), /plugins\/zeta\/provenance\.json does not list the main skill zeta/)
})

// runAction runs the action's entry point as the runner does.
function runAction(inputs) {
  const out = join(mkdtempSync(join(tmpdir(), 'output-')), 'output')
  writeFileSync(out, '')
  const env = { ...process.env, GITHUB_OUTPUT: out }
  for (const k of Object.keys(env)) if (k.startsWith('INPUT_')) delete env[k]
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v
  const res = spawnSync(process.execPath, [action], { env, encoding: 'utf8' })
  const outputs = Object.fromEntries(
    readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
  return { ...res, outputs }
}

test('the action gives the record as step outputs', () => {
  const root = published(['indexit', 'review'])
  const res = runAction({ command: 'inspect', tool: 'indexit', path: root })
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(res.outputs, {
    version: '0.2.0',
    'source-repository': 'octopot/indexit',
    'source-tag': 'v0.2.0',
    'source-commit': COMMIT,
    'skills-paths': '{"indexit":"skills/indexit","review":"skills/review"}',
    'skills-digests': JSON.stringify({ indexit: digest('indexit'), review: digest('review') }),
  })
  assert.equal(JSON.parse(res.stdout).skills.review.path, 'skills/review')
})

test('the action fails without the tool or on a refused record, and writes no outputs', () => {
  const root = published(['indexit'], (p) => (p.schema = 2))
  const none = runAction({ command: 'inspect', path: root })
  assert.equal(none.status, 2)
  assert.match(none.stderr, /inspect needs the input\(s\): tool/)
  const refused = runAction({ command: 'inspect', tool: 'indexit', path: root })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /::error::plugins\/indexit\/provenance\.json: schema 2 is not 1/)
  assert.deepEqual(refused.outputs, {})
  const other = runAction({ command: 'nope' })
  assert.match(other.stderr, /command must be publish, check or inspect/)
})

test('the CLI prints the record of the current directory', () => {
  const root = published(['indexit'])
  const res = spawnSync(process.execPath, [cli, 'inspect', 'indexit'], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } })
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(Object.keys(JSON.parse(res.stdout).skills), ['indexit'])
  const usage = spawnSync(process.execPath, [cli, 'inspect'], { cwd: root, encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /usage: octolab-skills inspect <tool>/)
})
