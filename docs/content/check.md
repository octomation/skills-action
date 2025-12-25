---
title: "Check the catalog"
description: "Run the same code the publisher runs on a checkout of the catalog: stale generated files, the registry, payloads, digests, tags and claude plugin validate."
---

# Check the catalog

The catalog's CI runs the same code as the publisher, on its checkout:

```yaml
- name: Check the catalog
  uses: octomation/skills-action@v0.2.1
  with:
    command: check
    discovery: ${{ runner.temp }}/skills.json # optional
```

| Input | Default | |
| :-- | :-- | :-- |
| `command` | `publish` | `check` |
| `path` | `.` | catalog checkout to check |
| `discovery` | | absolute path to the output of `npx skills add <catalog> --skill '*' --json` |

## What it refuses

`check` fails if:

- a generated file, `marketplace.json` or a `plugin.json`, is stale;
- the registry `catalog.json` is invalid, or an extra skill is named like a
  tool or like another tool's extra skill;
- a payload is invalid, or a plugin's skill folders are not the skills its
  `provenance.json` lists, each registered for the tool;
- a folder no longer hashes to its recorded digest;
- a `<tool>--v*` tag is invalid;
- `claude plugin validate` reports a finding.

It needs `claude` on `PATH`. A registered skill that a published version
lacks is valid.

## Discovery

With `discovery`, `check` compares what the skills CLI found in the catalog
with the published skills of every plugin. The catalog produces the file in
an empty directory, so that the install does not touch the checkout, and lets
`check` judge the result; `SKILLS_VERSION` is the version of the skills CLI
its workflow pins:

```yaml
- name: Discover with the skills CLI
  env:
    DISABLE_TELEMETRY: '1'
  run: |
    ( cd "$(mktemp -d)" && npx -y "skills@${SKILLS_VERSION}" add "${GITHUB_WORKSPACE}" \
        --skill '*' -a claude-code --copy -y --json >"${RUNNER_TEMP}/skills.json" ) || true
```

## Locally

From a checkout of the catalog:

```bash
npx --yes github:octomation/skills-action#v0.2.1 check
```
