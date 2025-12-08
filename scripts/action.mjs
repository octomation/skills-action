#!/usr/bin/env node
// The action's entry point: maps the inputs from action.yml to the commands
// of bin/octolab-skills.mjs and the environment they read.

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// input reads an action input the way @actions/core does.
const input = (name) => (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '').trim()

const cli = fileURLToPath(new URL('../bin/octolab-skills.mjs', import.meta.url))
const repository = process.env.GITHUB_ACTION_REPOSITORY || 'octomation/skills-action'
const ref = process.env.GITHUB_ACTION_REF

const run = (args, env, cwd) => {
  try {
    execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: { ...process.env, ...env }, cwd })
  } catch (err) {
    // the command has already reported the problem
    process.exit(err.status || 1)
  }
}

const command = input('command') || 'publish'
const need = (...names) => {
  const missing = names.filter((name) => !input(name))
  if (!missing.length) return
  console.error(`::error::${command} needs the input(s): ${missing.join(', ')}`)
  process.exit(2)
}

switch (command) {
  case 'publish':
    need('tool', 'token', 'source-tag')
    run(['publish'], {
      TOOL: input('tool'),
      SOURCE_TAG: input('source-tag'),
      SOURCE_SHA: input('source-sha'),
      CALLER_REPOSITORY: process.env.GITHUB_REPOSITORY,
      CATALOG_REPOSITORY: input('catalog-repository'),
      CATALOG_TOKEN: input('token'),
      SOURCE_TOKEN: input('github-token'),
      PUBLISHER: ref ? `${repository}@${ref}` : repository,
    })
    break
  case 'check': {
    const discovery = input('discovery')
    run(['check', ...(discovery ? ['--discovery', resolve(discovery)] : [])], {}, resolve(input('path') || '.'))
    break
  }
  default:
    console.error(`::error::command must be publish or check, not ${command}`)
    process.exit(2)
}
