# 📚 Skills action

A GitHub Action that moves a tool's agent skill from the tool's repository to
the [octolab/skills](https://github.com/octolab/skills) catalog, checks the
catalog, and reads what it publishes for a tool. The skill lives and changes
in the tool's repository; on a stable release the tool's workflow calls this
action, which copies the skill into the catalog together with the manifests
that make it installable by Claude Code, Codex and the skills CLI.
<!-- 📚 Publish OctoLab agent skills to octolab/skills. -->

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
| `payload-digest` | `octolab-skill-sha256-v1` digest of the main skill |
| `skills-digests` | JSON object of every published skill and its digest, e.g. `{"indexit":"sha256:…"}` |

`source-tag` and `source-sha` default to the tag push that triggered the
workflow. To re-run a publication from `workflow_dispatch`, pass both
explicitly: on a branch they would be the branch name and its head.

The action:

1. Reads `catalog.json` from the catalog's `main` and requires the caller's
   repository to be the tool's registered repository.
2. Requires the release tag to be annotated, signed and verified by GitHub, to
   point at the released commit, and to have a published, non-prerelease GitHub
   release.
3. Reads every registered skill directory at that commit with
   `github-token`, validates it, and requires `metadata.version` to equal
   the tag.
4. Writes `plugins/<tool>/` and regenerates `marketplace.json` in one
   `createCommitOnBranch` call, `chore(<tool>): publish vX.Y.Z`. If another
   tool published first, it re-reads `main` and retries; if the tool's
   registration changed meanwhile, it stops.
5. Tags the commit `<tool>--vX.Y.Z` only after GitHub reports it verified.

Running it again is safe:

| State | Result |
| --- | --- |
| Tag exists with the same source and files | success, nothing written |
| Same, after the registry gained an extra skill | success, nothing written: a replay compares with its own `provenance.json` |
| Version on `main` without its tag | tag the commit that published it, after checking it and only if GitHub shows it verified |
| Another run created the tag for the same publication | success |
| Tag exists with a different source or files | failure: the release is frozen |
| No tag for this version, `main` holds a newer one | failure: no downgrades |

"Same files" means the files are hashed again, not the digest recorded in
`provenance.json` trusted. Submodules, symlinks and dotfiles in a skill fail
the publication. Payload files are published as regular files: executable
bits are not kept.

## 🧩 Extra skills

A tool may publish more skills than its main one, such as a review skill next
to the skill that drives its CLI. Agents see them as `<tool>:<name>`, e.g.
`maintainer:review`.

1. Put the skill in the sibling folder of the main skill: with `skill:
   skills/maintainer`, the skill `review` lives in `skills/review/`. Its
   `name` equals the folder, `metadata.tool` is the tool, and the rest of the
   frontmatter follows the rules of the main skill, `metadata.version` equal
   to the release tag included.
2. Register it in the catalog's `catalog.json`; a folder that is not
   registered is not published. Skill names are unique across the catalog,
   since the skills CLI installs skills by name: an extra skill can't be
   named after a tool or another tool's extra skill.

   ```json
   "maintainer": {
     "repository": "octomation/maintainer",
     "skill": "skills/maintainer",
     "extra-skills": ["review"]
   }
   ```

3. Release the tool with the action at v0.2.0 or later. A new publication
   reads every registered skill at the release tag and fails if one is
   missing there, so register a skill only once the release that ships it is
   near; a registered skill that a published version lacks is valid.

Roll it out in this order: the catalog's CI moves to v0.2.0 first, then the
catalog registers `extra-skills`, then the tool releases with both skills.
`check` before v0.2.0 accepts the `extra-skills` key, but refuses a plugin
that holds `skills/<name>/` of an extra skill.

The plugin then holds `skills/<tool>/` and `skills/<name>/` for every
published skill. `provenance.json` keeps `version`, `source` and `digest` of
the main skill, and adds `skills`, a map from each published skill, the main
one first and then in the order of `extra-skills`, to its `path` in the tool's
repository and its digest, computed with `digest.algorithm` over that folder
alone. A tool with one skill has no `skills` key and no other change. `check`
requires the plugin's skill folders to be those of `provenance.json`, each
registered for the tool.

Publishers before v0.2.0 ignore `extra-skills` and publish the main skill
only, which `check` v0.2.0 and later accepts.

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
published skills of every plugin. `path` selects a checkout other than the workspace.

## 🔎 Inspect a published plugin

`inspect` reads what a catalog checkout publishes for one tool, at any commit
or tag of the catalog, so a workflow never parses `provenance.json` itself.
It reads `plugins/<tool>/` only: no `catalog.json`, since the registry of
today can't judge an older tag, no token, network, git or `claude`. It is
meant for the catalog's install check, run on each tag with the pin of its
`check`:

```yaml
- name: Read the published skills
  id: published
  uses: octomation/skills-action@vX.Y.Z
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

| Input | Default | |
|:------|:--------|:--|
| `tool` | | tool name, the folder `plugins/<tool>/` |
| `path` | `.` | catalog checkout to read |

| Output | |
|:-------|:--|
| `version` | published version, `X.Y.Z` |
| `source-repository` | tool repository, `owner/repo` |
| `source-tag` | release tag of the tool, `vX.Y.Z` |
| `source-commit` | commit of the release tag |
| `skills-paths` | JSON object of every published skill and its path in the tool repository, the main skill first, e.g. `{"maintainer":"skills/maintainer","review":"skills/review"}` |
| `skills-digests` | JSON object of every published skill and its digest, in the same order |

`inspect` fails, naming the problem, if `provenance.json` has a schema other
than 1 or another tool, a malformed source, a skill name or path that the
publisher never writes, or lacks the main skill or lists it other than first;
if `plugins/<tool>/skills/` holds a folder the record lacks or lacks a folder
it lists; or if a folder no longer hashes to its recorded digest. It reads
both forms of the record, with `skills` and without. Locally it prints the
same as JSON:

```bash
npx --yes github:octomation/skills-action#vX.Y.Z inspect maintainer
```

## 🧑‍🔧 Maintain the catalog

After editing `catalog.json`, regenerate the manifests from the catalog
checkout:

```bash
npx --yes github:octomation/skills-action#vX.Y.Z generate
npx --yes github:octomation/skills-action#vX.Y.Z check
```

<p align="right">made with ❤️ for everyone by <a href="https://www.octolab.org/">OctoLab</a></p>
