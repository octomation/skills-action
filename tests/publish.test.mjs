import assert from 'node:assert/strict'
import { test } from 'node:test'

import { publish } from '../scripts/publish.mjs'
import { REGISTRY, REVIEW, SKILL, registryWith } from './fixtures.mjs'

const b64 = (s) => Buffer.from(s).toString('base64')
const SHA = 'a'.repeat(40)

// fakeGitHub models the handful of endpoints publish.mjs uses: a source
// repository with a signed tag and release, and a catalog repository whose
// main branch is a list of snapshots (path -> contents).
function fakeGitHub({ registry = REGISTRY, skill = SKILL, signed = true, lightweight = false, commitSigned = true, release = { draft: false, prerelease: false } } = {}) {
  const source = {
    tag: lightweight ? { type: 'commit', sha: SHA } : { type: 'tag', sha: 'tagobj' },
    files: { 'skills/indexit/SKILL.md': skill, 'skills/indexit/references/cli.md': '# CLI\n', 'main.go': 'package main' },
  }
  const commits = [{ oid: 'c0', files: { 'catalog.json': JSON.stringify(registry) } }]
  const tags = {}
  const calls = { graphql: 0 }
  let moveOnce = null
  const head = () => commits[commits.length - 1]
  const find = (ref) => (ref === 'main' ? head() : commits.find((c) => c.oid === ref || c.oid === tags[ref]))

  const rest = async (method, path, body) => {
    let m
    if ((m = path.match(/^\/repos\/octopot\/indexit\/git\/ref\/tags\/(.+)$/))) {
      return m[1] === 'v0.2.0' ? { object: source.tag } : null
    }
    if (path === '/repos/octopot/indexit/git/tags/tagobj') {
      return { object: { type: 'commit', sha: SHA }, verification: { verified: signed, reason: signed ? 'valid' : 'unsigned' } }
    }
    if (path.startsWith('/repos/octopot/indexit/releases/tags/')) return release
    if (path.startsWith(`/repos/octopot/indexit/git/trees/${SHA}`)) {
      return {
        truncated: false,
        tree: Object.entries(source.files).map(([p, v]) =>
          v === null ? { path: p, type: 'commit', mode: '160000', sha: p } : { path: p, type: 'blob', mode: '100644', sha: p },
        ),
      }
    }
    if ((m = path.match(/^\/repos\/octopot\/indexit\/git\/blobs\/(.+)$/))) return { content: b64(source.files[m[1]]) }
    if (path === '/repos/octolab/skills/git/ref/heads/main') return { object: { sha: head().oid } }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/trees\/([^?]+)/))) {
      const c = find(decodeURIComponent(m[1]))
      return { truncated: false, tree: Object.keys(c.files).map((p) => ({ path: p, type: 'blob', mode: '100644', sha: `${c.oid}:${p}` })) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/blobs\/([^:]+):(.+)$/))) {
      return { content: b64(commits.find((c) => c.oid === m[1]).files[m[2]]) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/commits\/([^?]+)$/))) {
      return { commit: { verification: { verified: commitSigned } } }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/contents\/(.+)\?ref=(.+)$/))) {
      const c = find(decodeURIComponent(m[2]))
      const f = c?.files[m[1]]
      return f === undefined ? null : { content: b64(f) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/ref\/tags\/(.+)$/))) {
      const t = tags[decodeURIComponent(m[1])]
      return t ? { object: { sha: t } } : null
    }
    if (path.startsWith('/repos/octolab/skills/commits?')) {
      const file = decodeURIComponent(path.match(/path=([^&]+)/)[1])
      const from = commits.findIndex((c) => c.oid === path.match(/sha=([^&]+)/)[1])
      const hit = commits.slice(0, from + 1).reverse().find((c, i, all) => {
        const prev = all[i + 1]
        return c.files[file] !== undefined && c.files[file] !== prev?.files[file]
      })
      return hit ? [{ sha: hit.oid }] : []
    }
    if (method === 'POST' && path === '/repos/octolab/skills/git/refs') {
      if (tags[body.ref.replace('refs/tags/', '')]) throw new Error(`POST ${path}: 422 Reference already exists`)
      tags[body.ref.replace('refs/tags/', '')] = body.sha
      return {}
    }
    throw new Error(`unexpected ${method} ${path}`)
  }

  const graphql = async (_query, { input }) => {
    calls.graphql++
    if (moveOnce) {
      moveOnce()
      moveOnce = null
    }
    if (input.expectedHeadOid !== head().oid) {
      const err = new Error('stale')
      err.graphql = [{ message: `Expected branch to point to "${input.expectedHeadOid}" but it did not.` }]
      throw err
    }
    const files = { ...head().files }
    for (const { path } of input.fileChanges.deletions) delete files[path]
    for (const { path, contents } of input.fileChanges.additions) files[path] = Buffer.from(contents, 'base64').toString()
    const oid = `c${commits.length}`
    commits.push({ oid, files, message: input.message })
    return { createCommitOnBranch: { commit: { oid, url: `https://github.com/octolab/skills/commit/${oid}`, signature: { isValid: commitSigned } } } }
  }

  const gh = { rest, graphql }
  const registerTagConcurrently = (oid) => {
    tags['indexit--v0.2.0'] = oid
  }
  return {
    clients: { catalogClient: gh, sourceClient: gh, log: () => {}, wait: async () => {} },
    commits,
    tags,
    calls,
    head,
    registerTagConcurrently,
    // concurrently simulates another tool's publication landing first.
    concurrently: () => {
      moveOnce = () => commits.push({ oid: `x${commits.length}`, files: { ...head().files, 'README.md': 'x' } })
    },
    source,
    // register replaces catalog.json on main, as a registry change would.
    register: (next) => commits.push({ oid: `r${commits.length}`, files: { ...head().files, 'catalog.json': JSON.stringify(next) } }),
  }
}

const ENV = { TOOL: 'indexit', SOURCE_TAG: 'v0.2.0', SOURCE_SHA: SHA, CALLER_REPOSITORY: 'octopot/indexit' }

test('publishes the payload, generated manifests and a tag', async () => {
  const gh = fakeGitHub()
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(out['catalog-tag'], 'indexit--v0.2.0')
  const files = gh.head().files
  assert.equal(files['plugins/indexit/skills/indexit/SKILL.md'], SKILL)
  assert.equal(JSON.parse(files['plugins/indexit/.claude-plugin/plugin.json']).version, '0.2.0')
  const prov = JSON.parse(files['plugins/indexit/provenance.json'])
  assert.equal(prov.source.commit, SHA)
  assert.equal(prov.digest.value, out['payload-digest'])
  assert.deepEqual(JSON.parse(files['.claude-plugin/marketplace.json']).plugins.map((p) => p.name), ['indexit'])
  assert.equal(files['plugins/indexit/skills/indexit/main.go'], undefined)
  assert.equal(gh.tags['indexit--v0.2.0'], gh.head().oid)
  assert.equal(gh.head().message.headline, 'chore(indexit): publish v0.2.0')
})

test('a second run is a no-op', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(gh.calls.graphql, 1)
})

test('recovers a missing tag on the publication commit', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const published = gh.head().oid
  delete gh.tags['indexit--v0.2.0']
  gh.commits.push({ oid: 'later', files: { ...gh.head().files, 'README.md': 'later' } })
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(gh.tags['indexit--v0.2.0'], published)
})

test('retries when main moves under it', async () => {
  const gh = fakeGitHub()
  gh.concurrently()
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(gh.calls.graphql, 2)
  assert.equal(gh.head().files['README.md'], 'x')
})

test('refuses a changed payload for a published version', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.source.files['skills/indexit/references/cli.md'] = '# changed\n'
  await assert.rejects(publish(ENV, gh.clients), /frozen/)
})

test('refuses to downgrade', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const newer = gh.head().files
  newer['plugins/indexit/provenance.json'] = JSON.stringify({ version: '0.3.0' })
  delete gh.tags['indexit--v0.2.0']
  await assert.rejects(publish(ENV, gh.clients), /refusing to downgrade/)
})

test('refuses callers other than the registered repository', async () => {
  const gh = fakeGitHub()
  await assert.rejects(publish({ ...ENV, CALLER_REPOSITORY: 'octolab/zeta' }, gh.clients), /published from octopot\/indexit/)
})

test('refuses unverified and lightweight tags', async () => {
  await assert.rejects(publish(ENV, fakeGitHub({ signed: false }).clients), /not verified/)
  await assert.rejects(publish(ENV, fakeGitHub({ lightweight: true }).clients), /lightweight tag/)
})

test('refuses prereleases and a version mismatch', async () => {
  await assert.rejects(publish(ENV, fakeGitHub({ release: { prerelease: true } }).clients), /prerelease/)
  await assert.rejects(publish({ ...ENV, SOURCE_TAG: 'v0.2.0-rc.1' }, fakeGitHub().clients), /prereleases/)
  const other = SKILL.replace('version: "0.2.0"', 'version: "0.2.1"').replace('>=0.2.0', '>=0.2.1')
  await assert.rejects(publish(ENV, fakeGitHub({ skill: other }).clients), /does not match v0.2.0/)
})

test('a concurrent run of the same release ends as a no-op', async () => {
  const gh = fakeGitHub()
  const other = fakeGitHub()
  await publish(ENV, other.clients)
  // The other run commits and tags while this one is committing.
  gh.clients.catalogClient.graphql = async () => {
    gh.commits.push({ ...other.head(), oid: 'theirs' })
    gh.tags['indexit--v0.2.0'] = 'theirs'
    gh.clients.catalogClient.graphql = async () => {
      throw new Error('must not commit twice')
    }
    const err = new Error('stale')
    err.graphql = [{ message: 'Expected branch to point to "c0" but it did not.' }]
    throw err
  }
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(out['catalog-commit'], 'theirs')
})

test('refuses a malformed version on main', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.head().files['plugins/indexit/provenance.json'] = JSON.stringify({ version: 'latest' })
  delete gh.tags['indexit--v0.2.0']
  await assert.rejects(publish(ENV, gh.clients), /invalid version/)
})

test('recovery tags the publication commit, not a newer release on main', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const published = gh.head().oid
  delete gh.tags['indexit--v0.2.0']
  // A newer release lands after this run read main.
  const clients = { ...gh.clients, catalogClient: { ...gh.clients.catalogClient } }
  const rest = gh.clients.catalogClient.rest
  let moved = false
  clients.catalogClient.rest = async (method, path, body) => {
    if (!moved && path.startsWith('/repos/octolab/skills/commits?')) {
      moved = true
      const files = { ...gh.head().files }
      files['plugins/indexit/provenance.json'] = files['plugins/indexit/provenance.json'].replace('"0.2.0"', '"0.3.0"')
      gh.commits.push({ oid: 'newer', files })
    }
    return rest(method, path, body)
  }
  const out = await publish(ENV, clients)
  assert.equal(out['catalog-commit'], published)
  assert.equal(gh.tags['indexit--v0.2.0'], published)
})

test('refuses a tagged publication whose files were changed', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.head().files['plugins/indexit/skills/indexit/references/cli.md'] = '# tampered\n'
  await assert.rejects(publish(ENV, gh.clients), /hash to/)
})

test('does not tag an unverified commit', async () => {
  const gh = fakeGitHub({ commitSigned: false })
  await assert.rejects(publish(ENV, gh.clients), /not a verified commit/)
  assert.deepEqual(gh.tags, {})
})

test('accepts a tag another run created for the same publication', async () => {
  const gh = fakeGitHub()
  const graphql = gh.clients.catalogClient.graphql
  gh.clients.catalogClient.graphql = async (...args) => {
    const data = await graphql(...args)
    gh.registerTagConcurrently(data.createCommitOnBranch.commit.oid)
    return data
  }
  const out = await publish(ENV, gh.clients)
  assert.equal(out['catalog-commit'], gh.head().oid)
})

test('stops when the registration changes during a retry', async () => {
  const gh = fakeGitHub()
  const graphql = gh.clients.catalogClient.graphql
  gh.clients.catalogClient.graphql = async (...args) => {
    const registry = structuredClone(REGISTRY)
    registry.tools.indexit.description = 'changed'
    gh.commits.push({ oid: 'reg', files: { ...gh.head().files, 'catalog.json': JSON.stringify(registry) } })
    gh.clients.catalogClient.graphql = graphql
    return graphql(...args)
  }
  await assert.rejects(publish(ENV, gh.clients), /registration .* changed/)
})

test('refuses submodules in the skill', async () => {
  const gh = fakeGitHub()
  gh.source.files['skills/indexit/vendor'] = null
  await assert.rejects(publish(ENV, gh.clients), /submodules/)
})

// --- extra skills -------------------------------------------------------------

const withReview = (gh) => {
  gh.source.files['skills/review/SKILL.md'] = REVIEW
  gh.source.files['skills/stray/SKILL.md'] = 'not registered'
  return gh
}

// The provenance.json v0.1.1 writes for the fixture release, byte for byte.
const SINGLE_PROVENANCE = `{
  "schema": 1,
  "tool": "indexit",
  "version": "0.2.0",
  "source": {
    "repository": "octopot/indexit",
    "tag": "v0.2.0",
    "commit": "${SHA}",
    "path": "skills/indexit"
  },
  "digest": {
    "algorithm": "octolab-skill-sha256-v1",
    "value": "sha256:ba8e243084ea9761c874d2ec5cc65ae76bd0a3f33e46f6f0ce2e68ba2b0b0fbd"
  },
  "publisher": "octomation/skills-action"
}
`

test('a single-skill tool publishes as before', async () => {
  const gh = fakeGitHub()
  const out = await publish(ENV, gh.clients)
  assert.equal(gh.head().files['plugins/indexit/provenance.json'], SINGLE_PROVENANCE)
  assert.deepEqual(JSON.parse(out['skills-digests']), { indexit: out['payload-digest'] })
  assert.equal(gh.head().message.body, `Source: octopot/indexit@${SHA} (v0.2.0)\nDigest: ${out['payload-digest']}`)
})

test('publishes the registered extra skills, not stray folders', async () => {
  const gh = withReview(fakeGitHub({ registry: registryWith(['review']) }))
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  const files = gh.head().files
  assert.equal(files['plugins/indexit/skills/review/SKILL.md'], REVIEW)
  assert.equal(files['plugins/indexit/skills/stray/SKILL.md'], undefined)
  const prov = JSON.parse(files['plugins/indexit/provenance.json'])
  const digests = JSON.parse(out['skills-digests'])
  assert.deepEqual(Object.keys(digests), ['indexit', 'review'])
  assert.equal(digests.indexit, out['payload-digest'])
  assert.equal(prov.digest.value, out['payload-digest'])
  assert.equal(prov.source.path, 'skills/indexit')
  assert.deepEqual(prov.skills, {
    indexit: { path: 'skills/indexit', digest: digests.indexit },
    review: { path: 'skills/review', digest: digests.review },
  })
  // A replay writes nothing and reports the same digests.
  const again = await publish(ENV, gh.clients)
  assert.equal(again.changed, false)
  assert.equal(again['skills-digests'], out['skills-digests'])
  assert.equal(gh.calls.graphql, 1)
})

test('a replay compares with its provenance, not with the registry gained since', async () => {
  // The old publisher's case: published with one skill, then review is registered.
  const gh = withReview(fakeGitHub())
  const first = await publish(ENV, gh.clients)
  gh.register(registryWith(['review']))
  const tagged = await publish(ENV, gh.clients)
  assert.equal(tagged.changed, false)
  assert.equal(tagged['skills-digests'], first['skills-digests'])
  // The same holds when only the tag is missing.
  delete gh.tags['indexit--v0.2.0']
  const recovered = await publish(ENV, gh.clients)
  assert.equal(recovered.changed, false)
  assert.equal(gh.tags['indexit--v0.2.0'], 'c1')
  assert.equal(gh.calls.graphql, 1)
})

test('a replay refuses a published extra skill whose source changed', async () => {
  const gh = withReview(fakeGitHub({ registry: registryWith(['review']) }))
  await publish(ENV, gh.clients)
  gh.source.files['skills/review/SKILL.md'] = REVIEW + '\nchanged\n'
  await assert.rejects(publish(ENV, gh.clients), /frozen/)
})

test('a new publication requires every registered skill at the source tag', async () => {
  const gh = fakeGitHub({ registry: registryWith(['review']) })
  await assert.rejects(publish(ENV, gh.clients), /no files under skills\/review/)
  assert.equal(gh.calls.graphql, 0)
})

test('an extra skill passes the checks of the main one', async () => {
  const cases = [
    [REVIEW.replace('name: review', 'name: other'), /name: must be review/],
    [REVIEW.replace('tool: indexit', 'tool: zeta'), /metadata.tool: must be indexit/],
    [REVIEW.replace('version: "0.2.0"', 'version: "0.2.1"').replace('>=0.2.0', '>=0.2.1'), /does not match v0.2.0/],
  ]
  for (const [text, error] of cases) {
    const gh = fakeGitHub({ registry: registryWith(['review']) })
    gh.source.files['skills/review/SKILL.md'] = text
    await assert.rejects(publish(ENV, gh.clients), error)
  }
})

test('a new version drops a skill folder no longer registered', async () => {
  const gh = withReview(fakeGitHub({ registry: registryWith(['review']) }))
  await publish(ENV, gh.clients)
  gh.register(REGISTRY)
  const next = SKILL.replaceAll('0.2.0', '0.2.1').replace('<0.3.0', '<0.3.0')
  gh.source.files['skills/indexit/SKILL.md'] = next
  const rest = gh.clients.sourceClient.rest
  gh.clients.sourceClient.rest = async (method, path, body) =>
    path.includes('/git/ref/tags/v0.2.1') ? rest(method, path.replace('v0.2.1', 'v0.2.0'), body) : rest(method, path, body)
  const out = await publish({ ...ENV, SOURCE_TAG: 'v0.2.1' }, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(gh.head().files['plugins/indexit/skills/review/SKILL.md'], undefined)
  assert.equal(JSON.parse(gh.head().files['plugins/indexit/provenance.json']).skills, undefined)
})

test('a mixed catalog: a single-skill tool publishes while another registers extra skills', async () => {
  const registry = structuredClone(REGISTRY)
  registry.tools.zeta['extra-skills'] = ['review']
  const gh = withReview(fakeGitHub({ registry }))
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  const files = gh.head().files
  assert.equal(files['plugins/indexit/provenance.json'], SINGLE_PROVENANCE)
  assert.deepEqual(
    Object.keys(files).filter((p) => p.startsWith('plugins/')).sort(),
    [
      'plugins/indexit/.claude-plugin/plugin.json',
      'plugins/indexit/provenance.json',
      'plugins/indexit/skills/indexit/SKILL.md',
      'plugins/indexit/skills/indexit/references/cli.md',
    ],
  )
  assert.deepEqual(JSON.parse(out['skills-digests']), { indexit: out['payload-digest'] })
})

test('a replay refuses skill names and paths from provenance that leave the repository', async () => {
  const cases = [
    [{ indexit: 'skills/indexit', '../x': 'skills/x' }, /not a skill name/],
    [{ indexit: 'skills/indexit', review: '../secrets' }, /path outside the repository/],
    [{ indexit: 'skills/indexit', review: '/etc' }, /path outside the repository/],
  ]
  for (const [paths, error] of cases) {
    const gh = withReview(fakeGitHub({ registry: registryWith(['review']) }))
    await publish(ENV, gh.clients)
    const file = 'plugins/indexit/provenance.json'
    const prov = JSON.parse(gh.head().files[file])
    prov.skills = Object.fromEntries(Object.entries(paths).map(([n, path]) => [n, { path, digest: 'sha256:x' }]))
    gh.head().files[file] = JSON.stringify(prov)
    let reads = 0
    const rest = gh.clients.sourceClient.rest
    gh.clients.sourceClient.rest = async (method, path, body) => {
      if (path.startsWith('/repos/octopot/indexit/git/trees/')) reads++
      return rest(method, path, body)
    }
    await assert.rejects(publish(ENV, gh.clients), error)
    assert.equal(reads, 0, 'nothing is read from the source with a refused path')
  }
})
