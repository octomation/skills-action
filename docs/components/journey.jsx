// How a skill travels, in four stations: the tool's repository, the action,
// the catalog and the agent. Static markup; Reveal starts the parcel moving
// along the line once the figure is in view (app/landing.css).
import { Reveal } from './reveal'

const STATIONS = [
  {
    n: '01',
    title: 'The tool',
    where: 'octomation/maintainer',
    lines: [['dir', 'skills/'], ['file', '  maintainer/SKILL.md'], ['file', '  review/SKILL.md']],
    badge: 'v0.6.0 · signed tag',
  },
  {
    n: '02',
    title: 'skills-action',
    where: 'the release workflow',
    lines: [['ok', 'registered repository'], ['ok', 'verified tag and release'], ['ok', 'valid skills, one version']],
    badge: 'digest per folder',
  },
  {
    n: '03',
    title: 'The catalog',
    where: 'octolab/skills',
    lines: [['dir', 'plugins/maintainer/'], ['file', '  provenance.json'], ['file', '  skills/maintainer, review']],
    badge: 'maintainer--v0.6.0',
  },
  {
    n: '04',
    title: 'Your agent',
    where: 'any agent',
    lines: [['dir', 'Claude Code · Codex'], ['cmd', 'maintainer:maintainer'], ['cmd', 'maintainer:review']],
    badge: 'installed by name',
  },
]

export function Journey() {
  return (
    <Reveal className="journey" as="figure">
      <ol className="journey-track">
        {STATIONS.map((s, i) => (
          <li key={s.n} className="journey-station" style={{ '--i': i }}>
            <span className="card-number">{s.n} / {s.where.toUpperCase()}</span>
            <h3>{s.title}</h3>
            <ul className="journey-lines">
              {s.lines.map(([kind, text]) => (
                <li key={text} className={`is-${kind}`}>{text}</li>
              ))}
            </ul>
            <span className="journey-badge">{s.badge}</span>
          </li>
        ))}
      </ol>
      <div className="journey-rail" aria-hidden="true"><i /></div>
      <figcaption>One release of maintainer, as it reached the catalog: the skill and its review skill leave the tool’s repository at the signed tag and arrive as one plugin.</figcaption>
    </Reveal>
  )
}
