---
code: null
id: I_kwDOVOU7GM8AAAABizt9ng
databaseId: 6630899102
number: 3
url: https://github.com/octomation/skills-action/issues/3
title: "inspect: read the published record of a tool from a catalog checkout"
issueType: Feature
labels:
  - "type: feature"
  - "scope: code"
  - "scope: docs"
  - "scope: test"
  - "impact: medium"
  - "effort: easy"
assignees:
  - kamilsk
milestone: null
parent: null
issueFields: {}
state: CLOSED
stateReason: COMPLETED
duplicateOf: null
createdAt: 2026-11-26T16:24:51Z
updatedAt: 2026-11-26T16:29:27Z
lastEditedAt: 2026-11-26T16:28:59Z
closedAt: 2026-11-26T16:29:27Z
---

# inspect: read the published record of a tool from a catalog checkout

## Motivation

The catalog's `ci (install)` reads `plugins/<tool>/provenance.json` itself,
with `p.skills ?? { [p.tool]: { path: p.source.path } }`: a copy of
`provenanceSkills` from `scripts/lib.mjs`. v0.2.0 changed the record, adding
`skills`, without changing `schema: 1`, so the next change of the record can
drift from that copy silently, and the install check then compares the wrong
skills or none. The record is the action's format: only the action should
read it, and the catalog should know nothing but the layout
`plugins/<tool>/skills/<name>/`.

The install check runs on an old catalog tag, so the reader must judge the
plugin by its own record, not by the registry of today, and work offline:
no token, no network, no git, no `claude`.

## PoC

```bash
# in a catalog checkout, at any tag
$ octolab-skills inspect maintainer
{
  "tool": "maintainer",
  "version": "0.5.2",
  "source": { "repository": "octomation/maintainer", "tag": "v0.5.2", "commit": "5b085d3…" },
  "skills": {
    "maintainer": { "path": "skills/maintainer", "digest": "sha256:01f9cc…" },
    "review": { "path": "skills/review", "digest": "sha256:82bea7…" }
  }
}
```

```yaml
# the catalog's ci.install.yml, pinned like ci.yml
- name: Read the published skills
  id: published
  uses: octomation/skills-action@v0.2.1
  with:
    command: inspect
    tool: ${{ matrix.tool }}
# steps.published.outputs: version, source-repository, source-tag,
# source-commit, skills-paths, skills-digests
```

## Acceptance criteria

- [x] `octolab-skills inspect <tool>` and `command: inspect` read
      `plugins/<tool>/` of a checkout only: not `catalog.json`, not the
      network, git or `claude`.
- [x] It prints the record as JSON and, in the action, gives the outputs
      `version`, `source-repository`, `source-tag`, `source-commit`,
      `skills-paths` and `skills-digests`, the last two JSON objects with
      the main skill first.
- [x] Both forms of the record read: a single skill without `skills`, and
      several skills with it.
- [x] It fails, naming the problem, on an unknown `schema`, another `tool`,
      a malformed `source.repository`, `source.tag` or `source.commit`, a
      skill name that is not a skill name, a path that leaves the
      repository, a main skill missing or not first, a skill folder that the
      record lacks or a recorded skill without its folder, and a folder whose
      digest is not the recorded one.
- [x] `publish` and `inspect` read the skills of a record with one shared
      rule; `publish` and `check` behave as in v0.2.0.
- [x] The action's CI inspects every plugin of the live catalog.
- [x] The README documents the command, its inputs and outputs, with a step
      for the catalog.
- [x] Released as v0.2.1: existing calls work as before.

## Out of scope

- Switching the catalog's `ci.install.yml` to the command: a separate change
  in octolab/skills after the release.
- Checking the skills' frontmatter, the registry or `plugin.json`: `check`
  does that on the current catalog.
- A new `schema` of `provenance.json`.
