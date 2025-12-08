# 📦 Skills action

A GitHub Action that moves a tool's agent skill from the tool's repository to
the [octolab/skills](https://github.com/octolab/skills) catalog, and checks
the catalog. The skill lives and changes in the tool's repository; on a
stable release the tool's workflow calls this action, which copies the skill
into the catalog together with the manifests that make it installable by
Claude Code, Codex and the skills CLI.
<!-- 📦 Publish OctoLab agent skills to octolab/skills. -->

## 🚀 Publish from a tool

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
  uses: octomation/skills-action@vX.Y.Z
  with:
    tool: indexit
    token: ${{ steps.catalog.outputs.token }}
```

Pin the action to a release tag; Dependabot proposes the next one. Every
version is an immutable GitHub release: while the release exists its tag
can't be moved or deleted, and the tag name can never be reused.
The action runs on the runner's own Node.js, with no setup step.

| Input | Default | |
|:------|:--------|:--|
| `tool` | | tool name registered in the catalog's `catalog.json` |
| `token` | | token with contents write access to the catalog |
| `source-tag` | `github.ref_name` | release tag of the tool, `vX.Y.Z` |
| `source-sha` | `github.sha` | commit the workflow released |
| `catalog-repository` | `octolab/skills` | catalog to publish to |
| `github-token` | `github.token` | token that reads the tool repository |

| Output | |
|:-------|:--|
| `changed` | whether this run wrote a new publication |
| `catalog-commit` | catalog commit that holds the release |
| `catalog-tag` | catalog tag of the release, `<tool>--vX.Y.Z` |
| `payload-digest` | `octolab-skill-sha256-v1` digest of the published skill |

`source-tag` and `source-sha` default to the tag push that triggered the
workflow. To re-run a publication from `workflow_dispatch`, pass both
explicitly: on a branch they would be the branch name and its head.

The action:

1. Reads `catalog.json` from the catalog's `main` and requires the caller's
   repository to be the tool's registered repository.
2. Requires the release tag to be annotated, signed and verified by GitHub, to
   point at the released commit, and to have a published, non-prerelease GitHub
   release.
3. Reads the skill directory at that commit with `github-token`, validates it, and requires `metadata.version` to equal the
   tag.
4. Writes `plugins/<tool>/` and regenerates `marketplace.json` in one
   `createCommitOnBranch` call, `chore(<tool>): publish vX.Y.Z`. If another
   tool published first, it re-reads `main` and retries; if the tool's
   registration changed meanwhile, it stops.
5. Tags the commit `<tool>--vX.Y.Z` only after GitHub reports it verified.

Running it again is safe:

| State | Result |
| --- | --- |
| Tag exists with the same source and files | success, nothing written |
| Version on `main` without its tag | tag the commit that published it, after checking it and only if GitHub shows it verified |
| Another run created the tag for the same publication | success |
| Tag exists with a different source or files | failure: the release is frozen |
| `main` holds a newer version | failure: no downgrades |

"Same files" means the files are hashed again, not the digest recorded in
`provenance.json` trusted. Submodules, symlinks and dotfiles in a skill fail
the publication. Payload files are published as regular files: executable
bits are not kept.

## 🔍 Check the catalog

The catalog's CI runs the same code on its checkout:

```yaml
- name: Check the catalog
  uses: octomation/skills-action@vX.Y.Z
  with:
    command: check
    discovery: ${{ runner.temp }}/skills.json # optional
```

`check` fails if a generated file is stale, the registry, a payload, a digest
or a `<tool>--v*` tag is invalid, or `claude plugin validate` reports a
finding; it needs `claude` on `PATH`. `discovery` is the absolute path to the
output of `npx skills add <catalog> --skill '*' --json`, compared with the
published plugins. `path` selects a checkout other than the workspace.

## 🧑‍🔧 Maintain the catalog

After editing `catalog.json`, regenerate the manifests from the catalog
checkout:

```bash
npx --yes github:octomation/skills-action#vX.Y.Z generate
npx --yes github:octomation/skills-action#vX.Y.Z check
```

<p align="right">made with ❤️ for everyone by <a href="https://www.octolab.org/">OctoLab</a></p>
