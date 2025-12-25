#!/usr/bin/env node
// Reads the published record of one tool from a catalog checkout, at any
// commit or tag of the catalog, and checks it against the plugin's files.
// Offline: it reads plugins/<tool>/ only, not catalog.json, which may be
// newer than the checked tag, and needs no token, network, git or claude.
//
//   node scripts/inspect.mjs <tool>     print the record as JSON
//
// Environment:
//   GITHUB_OUTPUT   step outputs: version, source-repository, source-tag,
//                   source-commit, skills-paths, skills-digests

import { appendFileSync, existsSync, lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  DIGEST_ALGORITHM,
  PLUGINS,
  PROVENANCE_SCHEMA,
  digestDir,
  isMain,
  isRepository,
  isSkillName,
  parseVersion,
  readJSON,
  recordedSkills,
} from './lib.mjs'

// inspect returns { errors } or { record }: the record of tool in the catalog
// checkout at root, with its skills, the main one first, as name → { path,
// digest }, each digest hashed again from the plugin's files.
export function inspect(root, tool) {
  if (!isSkillName(tool)) return { errors: [`${JSON.stringify(tool)} is not a tool name`] }
  const at = `${PLUGINS}/${tool}`
  const base = join(root, PLUGINS, tool)
  if (!existsSync(join(base, 'provenance.json'))) return { errors: [`${at}/provenance.json: missing; ${tool} is not published here`] }
  // Read inside the plugin only: a symbolic link could point anywhere.
  for (const [path, name] of [[join(root, PLUGINS), PLUGINS], ...['', '/provenance.json', '/skills'].map((rel) => [base + rel, at + rel])]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) return { errors: [`${name}: a symbolic link, not read`] }
  }
  let prov
  try {
    prov = readJSON(join(base, 'provenance.json'))
  } catch (err) {
    return { errors: [`${at}/provenance.json: ${err.message}`] }
  }
  const where = `${at}/provenance.json`
  // A record of another schema is not read further; without skills, a record
  // names its main skill by its tool.
  if (!prov || typeof prov !== 'object' || Array.isArray(prov)) return { errors: [`${where}: must be a JSON object`] }
  if (prov.schema !== PROVENANCE_SCHEMA) return { errors: [`${where}: schema ${JSON.stringify(prov.schema)} is not ${PROVENANCE_SCHEMA}`] }
  if (prov.tool !== tool) return { errors: [`${where}: tool must be ${tool}`] }
  let list
  try {
    list = recordedSkills(prov, tool)
  } catch (err) {
    return { errors: [err.message] }
  }

  const errors = []
  const version = prov.version
  if (typeof version !== 'string' || version.startsWith('v') || !parseVersion(version)) errors.push(`${where}: version must be a semantic version`)
  const source = prov.source || {}
  if (!isRepository(source.repository)) errors.push(`${where}: source.repository must be owner/repo`)
  if (source.tag !== `v${version}`) errors.push(`${where}: source.tag must be v${version}`)
  if (typeof source.commit !== 'string' || !/^[0-9a-f]{40}$/.test(source.commit)) errors.push(`${where}: source.commit must be a full SHA`)
  if (prov.digest?.algorithm !== DIGEST_ALGORITHM) errors.push(`${where}: digest.algorithm must be ${DIGEST_ALGORITHM}`)
  if (list[0][0] !== tool) errors.push(`${where}: the main skill ${tool} must come first`)
  const main = list.find(([n]) => n === tool)[1]
  if (main.path !== source.path || main.digest !== prov.digest?.value) {
    errors.push(`${where}: skills.${tool} must match source.path and digest`)
  }

  // The plugin holds exactly the skills of its record.
  const dir = join(base, 'skills')
  const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []
  const recorded = new Set(list.map(([n]) => n))
  for (const e of entries) {
    if (!e.isDirectory()) errors.push(`${at}/skills/${e.name}: not a skill folder`)
    else if (!recorded.has(e.name)) errors.push(`${at}/skills/${e.name}: not listed in provenance.json`)
  }
  const present = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  for (const [name, { digest }] of list) {
    if (!present.has(name)) {
      errors.push(`${at}/skills/${name}: missing; provenance.json lists it`)
      continue
    }
    let actual
    try {
      actual = digestDir(join(dir, name))
    } catch (err) {
      errors.push(`${at}/skills/${name}/${err.message}`)
      continue
    }
    if (actual !== digest) errors.push(`${at}/skills/${name}: files hash to ${actual}, provenance.json records ${digest}`)
  }
  if (errors.length) return { errors }

  return {
    record: {
      tool,
      version,
      source: { repository: source.repository, tag: source.tag, commit: source.commit },
      skills: Object.fromEntries(list.map(([n, { path, digest }]) => [n, { path, digest }])),
    },
  }
}

// outputs maps a record to the action's step outputs.
export function outputs(record) {
  const skills = Object.entries(record.skills)
  return {
    version: record.version,
    'source-repository': record.source.repository,
    'source-tag': record.source.tag,
    'source-commit': record.source.commit,
    'skills-paths': JSON.stringify(Object.fromEntries(skills.map(([n, s]) => [n, s.path]))),
    'skills-digests': JSON.stringify(Object.fromEntries(skills.map(([n, s]) => [n, s.digest]))),
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    console.error('usage: octolab-skills inspect <tool>')
    process.exit(2)
  }
  const { errors, record } = inspect(process.cwd(), args[0])
  if (errors) {
    for (const e of errors) console.error(`::error::${e}`)
    process.exit(1)
  }
  console.log(JSON.stringify(record, null, 2))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs(record)).map(([k, v]) => `${k}=${v}\n`).join(''))
  }
}

if (isMain(import.meta.url)) main()
