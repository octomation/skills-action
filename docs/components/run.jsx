'use client'

// The hero of the landing page: one run of the action for each command, as a
// workflow log of the current release. Its data is that of the live catalog:
// indexit v0.4.2 and maintainer v0.6.0 as octolab/skills holds them (older
// releases of the action published them). The shared .workflow-* styles come
// from globals.css; the log is in app/landing.css.
import { useEffect, useRef, useState } from 'react'

const RUNS = {
  publish: {
    label: 'Publish',
    hint: '01',
    job: 'octopot/indexit · release',
    yaml: [
      ['uses', 'octomation/skills-action@v0.2.1'],
      ['with', null],
      ['  tool', 'indexit'],
      ['  token', '${{ steps.catalog.outputs.token }}'],
    ],
    steps: [
      ['registry', 'octopot/indexit is registered for indexit'],
      ['tag', 'v0.4.2 annotated, signed, verified by GitHub'],
      ['release', 'v0.4.2 published, not a prerelease'],
      ['skill', 'skills/indexit valid, metadata.version 0.4.2'],
      ['commit', 'chore(indexit): publish v0.4.2'],
      ['catalog', 'indexit--v0.4.2 tagged, verified'],
    ],
    outputs: [
      ['changed', 'true'],
      ['catalog-tag', 'indexit--v0.4.2'],
      ['payload-digest', 'sha256:d35e96cf…5702a'],
    ],
    footer: 'one signed commit · one tag · frozen',
  },
  check: {
    label: 'Check',
    hint: '02',
    job: 'octolab/skills · ci',
    yaml: [
      ['uses', 'octomation/skills-action@v0.2.1'],
      ['with', null],
      ['  command', 'check'],
      ['  discovery', '${{ runner.temp }}/skills.json'],
    ],
    steps: [
      ['generate', 'marketplace.json and plugin.json up to date'],
      ['registry', 'catalog.json: 2 tools, 1 extra skill'],
      ['payloads', 'plugins/indexit, plugins/maintainer valid'],
      ['digests', '3 skill folders hash as recorded'],
      ['tags', '17 <tool>--v* tags valid'],
      ['claude', 'claude plugin validate: no findings'],
    ],
    log: 'catalog is valid: 2 published plugin(s)',
    footer: 'the same code as the publisher',
  },
  inspect: {
    label: 'Inspect',
    hint: '03',
    job: 'octolab/skills · ci.install',
    yaml: [
      ['uses', 'octomation/skills-action@v0.2.1'],
      ['with', null],
      ['  command', 'inspect'],
      ['  tool', 'maintainer'],
    ],
    steps: [
      ['record', 'plugins/maintainer/provenance.json, schema 1'],
      ['source', 'octomation/maintainer@v0.6.0 · ab5d50e'],
      ['skills', 'maintainer first, then review'],
      ['folders', 'skills/maintainer, skills/review as recorded'],
      ['digests', 'both folders hash as recorded'],
    ],
    outputs: [
      ['version', '0.6.0'],
      ['source-tag', 'v0.6.0'],
      ['skills-paths', '{"maintainer":"skills/maintainer","review":"skills/review"}'],
    ],
    footer: 'offline · no token, network, git or claude',
  },
}

// The step as it goes into a workflow's list of steps.
function yamlText(run) {
  return run.yaml.map(([k, v], i) => `${i ? '  ' : '- '}${v === null ? `${k}:` : `${k}: ${v}`}`).join('\n')
}

export function Run() {
  const [name, setName] = useState('publish')
  const [copied, setCopied] = useState('')
  const timer = useRef(null)
  const run = RUNS[name]
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(yamlText(run))
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div className="workflow-demo run-demo">
      <div className="workflow-switch" role="group" aria-label="Command">
        {Object.entries(RUNS).map(([key, r]) => (
          <button key={key} type="button" aria-pressed={key === name} onClick={() => { setName(key); setCopied('') }}>
            {r.hint}<b>{r.label}</b>
          </button>
        ))}
      </div>
      <div className="workflow-terminal">
        <div className="workflow-title">
          <span><span aria-hidden="true">● ● ●</span>{run.job}</span>
          <span>{name.toUpperCase()}</span>
        </div>
        <div className="workflow-command-row">
          <pre className="workflow-command">
            {run.yaml.map(([k, v]) => (
              <span key={k} className="run-yaml">
                <span>{k}:</span>{v === null ? '' : ` ${v}`}{'\n'}
              </span>
            ))}
          </pre>
          <button type="button" className="workflow-copy" onClick={copy} aria-label="Copy the step">
            {copied || 'copy'}
          </button>
        </div>
        <div className="workflow-body">
          <ol className="run-log" key={name} aria-label={`${run.label} steps`}>
            {run.steps.map(([key, text], i) => (
              <li key={key} style={{ '--i': i }}>
                <span className="run-mark" aria-hidden="true">✓</span>
                <span className="run-key">{key}</span>
                <span className="run-text">{text}</span>
              </li>
            ))}
          </ol>
          {run.outputs ? (
            <div className="run-outputs" key={`${name}-out`} style={{ '--i': run.steps.length }}>
              <p className="run-outputs-title" id={`run-outputs-${name}`}>Step outputs</p>
              <dl aria-labelledby={`run-outputs-${name}`}>
                {run.outputs.map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="run-outputs" key={`${name}-out`} style={{ '--i': run.steps.length }}>
              <p className="run-outputs-title">Log, no outputs</p>
              <p className="run-log-line">{run.log}</p>
            </div>
          )}
        </div>
        <div className="workflow-footer">
          <span className="run-footer">{run.footer}</span>
        </div>
      </div>
      <p className="demo-sr-only" aria-live="polite">{copied === 'copied' ? 'Copied to the clipboard.' : copied === 'failed' ? 'Copy failed.' : ''}</p>
    </div>
  )
}
