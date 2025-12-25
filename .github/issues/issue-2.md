---
code: null
id: I_kwDOVOU7GM8AAAABigkH0Q
databaseId: 6610814929
number: 2
url: https://github.com/octomation/skills-action/issues/2
title: "publish: carry the extra skills of a tool in its plugin"
issueType: Feature
labels:
  - "type: feature"
  - "scope: code"
  - "scope: docs"
  - "scope: test"
  - "impact: medium"
  - "effort: medium"
assignees:
  - kamilsk
milestone: null
parent: null
issueFields: {}
state: CLOSED
stateReason: COMPLETED
duplicateOf: null
createdAt: 2026-11-25T18:14:51Z
updatedAt: 2026-11-26T15:36:26Z
lastEditedAt: 2026-11-26T15:36:26Z
closedAt: 2026-11-26T15:28:26Z
---

# publish: carry the extra skills of a tool in its plugin

## Motivation

A tool can publish one skill only: the action copies `skills/<tool>/` of the
tool's repository, and `validate` refuses any other file in
`plugins/<tool>/`. A tool that ships a second skill for its users, such as a
review skill next to the skill that drives the CLI, has no way to publish it.
Claude Code and Codex already load several skills from one plugin and name
them `<plugin>:<skill>` (checked on both: `airtable:airtable-cli`,
`spreadsheets:excel-live-control`).

## PoC

```bash
# in the tool's repository
skills/maintainer/SKILL.md   # name: maintainer
skills/review/SKILL.md       # name: review, metadata.tool: maintainer

# after a stable release, in the catalog
plugins/maintainer/skills/maintainer/SKILL.md
plugins/maintainer/skills/review/SKILL.md

$ claude plugin update maintainer@octolab
# the agent offers maintainer:maintainer and maintainer:review
```

## Contract

- **Layout.** The main skill stays `skills/<tool>/`; an extra skill is
  `skills/<name>/`. Its `name` equals its folder, `metadata.tool` is the
  tool, `metadata.version` equals the release tag without `v`, and
  `tool-version-range` follows the rules of the main skill.
- **Registry, additive.** `tools.<tool>.skill` stays a string. Extra skills
  are a new optional key with a list of names. A folder without an entry is
  not published. A tool without the key publishes as before, and its files
  in the catalog do not change.
- **Three sets.** The registry says which skills a tool may publish; the
  provenance of a version says which were published; the files are what the
  plugin holds. `check` requires files = provenance ⊆ registry. A skill that
  is registered but absent from the published version (a skill added in the
  next release) is valid.
- **A new publication** reads every registered skill at the source tag; a
  registered skill missing there fails.
- **A repeated publication** compares with its own provenance, not with the
  current registry, and writes nothing: replaying a release published before
  the extra skill was registered passes.
- **Provenance.** `version` and `source.*` stay, as the catalog's `ci.yml`
  and `ci.install.yml` read them; a digest per skill is added. A
  single-skill provenance published earlier reads as before.
- **Outputs.** `payload-digest` stays the digest of the main skill; a new
  output gives every published skill with its digest in a machine-readable
  form.
- **Version.** `v0.2.0`. Calls with one skill do not change.

## Acceptance criteria

- [x] A tool with one skill publishes, validates and installs exactly as
      before: no change to its workflow, its `catalog.json` entry or its
      catalog files.
- [x] A tool can publish extra skills from `skills/<name>/` of its
      repository; the catalog states which ones, so a stray folder is not
      published.
- [x] Each extra skill passes the same checks as the main one (frontmatter
      subset, size, `metadata.version` equal to the release tag), its `name`
      equals its folder, and its `metadata.tool` is the tool.
- [x] `validate` accepts the registered extra skills, accepts a registered
      skill that the published version lacks, and still refuses any other
      file in a plugin.
- [x] The digest and `provenance.json` cover every published skill; a re-run
      of the same release writes nothing, also after the registry gained an
      extra skill.
- [x] Tests on a mixed catalog: the old and the new publisher, one tool with
      one skill and one with two, a first publication and a replay. The
      shared digest test vector covers a two-skill payload.
- [ ] The skills CLI discovers every published skill of the plugin; the
      install check in the catalog's `ci (install)` compares every skill
      that the provenance of the checked tag lists.
- [x] The README describes how a tool adds an extra skill.

## Out of scope

- Skills of one tool in another tool's plugin.
- Publishing from prereleases.
- A change to tools that publish one skill.
