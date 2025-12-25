---
title: "Publish from a tool"
description: "Call skills-action from the release workflow of a tool, and its agent skill reaches the octolab/skills catalog in one signed commit with its own tag."
---

# Publish from a tool

The skill lives and changes in the tool's repository. On a stable release,
the tool's workflow calls the action, which copies the skill into the
[octolab/skills](https://github.com/octolab/skills) catalog together with the
manifests that make it installable by Claude Code, Codex and the skills CLI.

## Before the first release

1. The skill folder holds a `SKILL.md` whose `name` is the tool and whose
   `metadata` has `version`, `tool` and `tool-version-range`: the contract is
   in the catalog's [AGENTS.md](https://github.com/octolab/skills/blob/main/AGENTS.md#contracts).
2. The tool is registered in the catalog's `catalog.json`, with its
   repository and the path of its skill:

   ```json
   "indexit": {
     "repository": "octopot/indexit",
     "skill": "skills/indexit"
   }
   ```

3. The repository can use the secrets of the GitHub App "OctoLab Releaser",
   `OCTOLAB_RELEASER_CLIENT_ID` and `OCTOLAB_RELEASER_KEY`.

## The workflow

Run it from the tool's release workflow, after the GitHub release exists:

```yaml
- name: Mint the catalog token
  id: catalog
  uses: actions/create-github-app-token@v3.3.0
  with:
    client-id: ${{ secrets.OCTOLAB_RELEASER_CLIENT_ID }}
    private-key: ${{ secrets.OCTOLAB_RELEASER_KEY }}
    owner: octolab
    repositories: skills
    permission-contents: write
- name: Publish the agent skill
  id: skill
  uses: octomation/skills-action@v0.2.1
  with:
    tool: indexit
    token: ${{ steps.catalog.outputs.token }}
```

Mint a token for the catalog alone: the token of the Homebrew tap is scoped
to the tap. The action reads the tool's repository with the workflow's own
`github.token` and runs on the runner's own Node.js, with no setup step.

Pin the action to a release tag; Dependabot proposes the next one. See
[Versions and pinning](/versions/).

## Inputs

| Input | Default | |
| :-- | :-- | :-- |
| `tool` | | tool name registered in the catalog's `catalog.json` |
| `token` | | token with contents write access to the catalog |
| `source-tag` | `github.ref_name` | release tag of the tool, `vX.Y.Z` |
| `source-sha` | `github.sha` | commit the workflow released |
| `catalog-repository` | `octolab/skills` | catalog to publish to |
| `github-token` | `github.token` | token that reads the tool repository |

`source-tag` and `source-sha` default to the tag push that triggered the
workflow. To run a publication again from `workflow_dispatch`, pass both
explicitly: on a branch they would be the branch name and its head.

## Outputs

| Output | |
| :-- | :-- |
| `changed` | whether this run wrote a new publication |
| `catalog-commit` | catalog commit that holds the release |
| `catalog-tag` | catalog tag of the release, `<tool>--vX.Y.Z` |
| `payload-digest` | `octolab-skill-sha256-v1` digest of the main skill |
| `skills-digests` | JSON object of every published skill and its digest, e.g. `{"indexit":"sha256:…"}` |

A tool that embeds its skill computes the same digest in `<tool> skill info`,
so a release can compare the copy in its binary with the one it published.

## What the action checks

1. It reads `catalog.json` from the catalog's `main` and requires the
   caller's repository to be the tool's registered repository.
2. It requires the release tag to be annotated, signed and verified by
   GitHub, to point at the released commit, and to have a published,
   non-prerelease GitHub release.
3. It reads every registered skill directory at that commit with
   `github-token`, validates it, and requires `metadata.version` to equal
   the tag.
4. It writes `plugins/<tool>/` and regenerates `marketplace.json` in one
   `createCommitOnBranch` call, `chore(<tool>): publish vX.Y.Z`. If another
   tool published first, it reads `main` again and retries; if the tool's
   registration changed meanwhile, it stops.
5. It tags the commit `<tool>--vX.Y.Z` only after GitHub reports it verified.

Submodules, symlinks and dotfiles in a skill fail the publication. Payload
files are published as regular files: executable bits are not kept.

## Running it again

A published release is frozen, and running the action again is safe:

| State | Result |
| :-- | :-- |
| Tag exists with the same source and files | success, nothing written |
| Same, after the registry gained an extra skill | success, nothing written: a replay compares with its own `provenance.json` |
| Version on `main` without its tag | tag the commit that published it, after checking it and only if GitHub shows it verified |
| Another run created the tag for the same publication | success |
| Tag exists with a different source or files | failure: the release is frozen |
| No tag for this version, `main` holds a newer one | failure: no downgrades |

"Same files" means that the files are hashed again: the digest recorded in
`provenance.json` is not taken on trust. A wrong skill is fixed in the tool's
repository and ships with its next release.

## What lands in the catalog

```text
plugins/indexit/
  .claude-plugin/plugin.json   generated; version = the tool release
  provenance.json              source repository, tag, commit, digest
  skills/indexit/              exact copy of the skill at the release tag
```

`provenance.json` records where the skill came from and what it hashed to:

```json
{
  "schema": 1,
  "tool": "indexit",
  "version": "0.4.2",
  "source": {
    "repository": "octopot/indexit",
    "tag": "v0.4.2",
    "commit": "9630246284a552c964867982f4cc302594bd71aa",
    "path": "skills/indexit"
  },
  "digest": {
    "algorithm": "octolab-skill-sha256-v1",
    "value": "sha256:d35e96cf07b0dfb59299944e0eaa8837bb37bb60e7c135afcca915566565702a"
  },
  "publisher": "octomation/skills-action@v0.1.1"
}
```

Read it with [`inspect`](/inspect/), not by parsing the file.
