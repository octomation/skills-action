#!/usr/bin/env node
// The catalog tooling in one command, for the action and for maintainers of
// a catalog checkout. Every command works on the current directory.
//
//   octolab-skills publish                     publish a release (env: see scripts/publish.mjs)
//   octolab-skills generate [--check]          regenerate the manifests, or fail if stale
//   octolab-skills check [--discovery out.json] generated files, registry, payloads, tags, claude plugin validate

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = (name) => fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url))
const run = (name, ...args) => execFileSync(process.execPath, [script(name), ...args], { stdio: 'inherit' })

const [command, ...args] = process.argv.slice(2)
try {
  switch (command) {
    case 'publish':
      run('publish')
      break
    case 'generate':
      run('generate', ...args)
      break
    case 'check':
      run('generate', '--check')
      run('validate', '--tags', ...args)
      run('claude-validate')
      break
    default:
      console.error('usage: octolab-skills publish | generate [--check] | check [--discovery out.json]')
      process.exit(2)
  }
} catch (err) {
  // the script has already reported the problem
  process.exit(err.status || 1)
}
