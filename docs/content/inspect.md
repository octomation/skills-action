---
title: "Inspect a published plugin"
description: "Read what a catalog checkout publishes for one tool, at any commit or tag, offline, so a workflow never parses provenance.json itself."
---

# Inspect a published plugin

`inspect` reads what a catalog checkout publishes for one tool, at any commit
or tag of the catalog, so a workflow never parses `provenance.json` itself.
It reads `plugins/<tool>/` only: no `catalog.json`, since the registry of
today can't judge an older tag, and no token, network, git or `claude`.

It is meant for the catalog's install check, run on each tag with the pin of
its `check`:

```yaml
- name: Read the published skills
  id: published
  uses: octomation/skills-action@v0.2.1
  with:
    command: inspect
    tool: ${{ matrix.tool }}
- name: Compare the payload with the tool release
  env:
    REPO: ${{ steps.published.outputs.source-repository }}
    TAG: ${{ steps.published.outputs.source-tag }}
    SKILLS: ${{ steps.published.outputs.skills-paths }}
  run: |
    jq -r 'to_entries[] | "\(.key) \(.value)"' <<<"${SKILLS}" | while read -r name path; do
      echo "${name}: ${REPO}@${TAG}/${path}"
    done
```

## Inputs

| Input | Default | |
| :-- | :-- | :-- |
| `command` | `publish` | `inspect` |
| `tool` | | tool name, the folder `plugins/<tool>/` |
| `path` | `.` | catalog checkout to read |

## Outputs

| Output | |
| :-- | :-- |
| `version` | published version, `X.Y.Z` |
| `source-repository` | tool repository, `owner/repo` |
| `source-tag` | release tag of the tool, `vX.Y.Z` |
| `source-commit` | commit of the release tag |
| `skills-paths` | JSON object of every published skill and its path in the tool repository, the main skill first, e.g. `{"maintainer":"skills/maintainer","review":"skills/review"}` |
| `skills-digests` | JSON object of every published skill and its digest, in the same order |

It reads both forms of the record, with `skills` and without.

## When it fails

`inspect` fails, naming the problem, if:

- `provenance.json` has a schema other than 1 or names another tool;
- the source is malformed, or a skill name or path is one that the publisher
  never writes;
- the record lacks the main skill or lists it other than first;
- `plugins/<tool>/skills/` holds a folder the record lacks, or lacks a folder
  it lists;
- a folder no longer hashes to its recorded digest.

## Locally

In a checkout of the catalog it prints the same as JSON:

```bash
npx --yes github:octomation/skills-action#v0.2.1 inspect maintainer
```

```json
{
  "tool": "maintainer",
  "version": "0.6.0",
  "source": {
    "repository": "octomation/maintainer",
    "tag": "v0.6.0",
    "commit": "ab5d50e8722f87ce08781e2c34f920c485ee1cfd"
  },
  "skills": {
    "maintainer": {
      "path": "skills/maintainer",
      "digest": "sha256:0055838379705c04e9e1566d3128be3ced02d287d1e00d928f5a212b2de4a41c"
    },
    "review": {
      "path": "skills/review",
      "digest": "sha256:efc2733d89602ca9b076b4a57578f87989942660652d4a288f28e6d7285654cc"
    }
  }
}
```
