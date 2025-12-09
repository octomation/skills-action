# Agent guide

This repository is the tooling of the
[octolab/skills](https://github.com/octolab/skills) catalog: the action that
tools call to publish their skill, the checks the catalog runs, and the
generator of its manifests. The catalog itself holds only data. Read this
before changing anything.

## Layout

```text
action.yml               node24 action: command publish or check
scripts/action.mjs       the action's entry point: inputs to commands
bin/octolab-skills.mjs   the commands, for the action and for maintainers
scripts/lib.mjs          registry, frontmatter, versions, digest, manifests
scripts/publish.mjs      publication through the GitHub API
scripts/generate.mjs     marketplace.json and plugin.json from catalog.json
scripts/validate.mjs     registry, payloads, provenance, tags, discovery
scripts/claude-validate.mjs  claude plugin validate on the catalog
tests/                   unit tests on a fake GitHub API
```

No npm dependencies and no build: the runner runs the sources on its own
Node.js 24, so there is no `dist/` to keep in step. Node 22 or later locally. The skill contract, the digest and the
catalog tags are defined in the catalog's `AGENTS.md`; `tests/lib.test.mjs`
holds the digest's shared test vector, which tools that embed their skill
compute too.

## Checks

```sh
npm test
(cd ../../octolab/skills && node ../../octomation/skills-action/bin/octolab-skills.mjs check)
```

`ci` runs actionlint, the tests and `check` on the live catalog on every push
and pull request, and monthly.

## Versions

A release is a signed tag `vX.Y.Z`, never moved or deleted. Consumers pin the
tag and Dependabot proposes the next one, so tag every change that consumers
should get, and only those. No floating major tag: nothing pins it.

The version describes the contract for the workflows that call the action:
its inputs, outputs and what it accepts. The series starts at `v0.1.0`: the
contract is not stable until it has been proven in practice, and 1.0.0 is a
separate decision.

| Change | Before 1.0 | After 1.0 | Examples |
|:-------|:-----------|:----------|:---------|
| a fix inside; callers change nothing | patch | patch | retry logic, an error message, a dependency bump of a step |
| something new; existing calls work as before | patch | minor | a new optional input or output |
| callers must change their workflow, or a release that passed before is now refused | minor | major | an input renamed, removed or made required, a new token permission, a stricter skill contract |

Before 1.0 this is the OctoLab rule the skills' compatibility ranges follow
too: every `0.Y.*` release is compatible, a breaking change is the next minor.

A change of the catalog layout or of `provenance.json` must keep reading
what is already published: published releases are frozen.

## Releasing

Immutable releases are on for the repository: while a published release
exists its tag can't be moved or deleted, and it gets a release attestation
from GitHub. Deleting the release unlocks the tag, but its name can never be
used again; our own rule is stricter: releases and tags stay.

1. `ci` is green on `main`.
2. Write `docs/content/changelog/vX.Y.Z.md`: a heading `# vX.Y.Z — Slogan.`
   and what changes for the workflows that call the action. It becomes the
   release body, and Dependabot quotes it in its pull requests. Commit it.
3. Write the tag annotation to a file outside the repository, following the
   previous tag (`git tag -l --format='%(contents)' vX.Y.W`): the heading,
   one or two sentences, lowercase imperative bullets, and
   `Release notes: docs/content/changelog/vX.Y.Z.md`.
4. Tag, push and publish; the release body is the note without its heading:

   ```sh
   note=docs/content/changelog/vX.Y.Z.md
   git tag -s vX.Y.Z -F "$annotation"
   git tag -v vX.Y.Z
   git push origin vX.Y.Z
   gh release create vX.Y.Z --verify-tag --title "$(sed -n '1s/^# //p' "$note")" \
     --notes-file <(tail -n +3 "$note")
   ```

5. `gh release verify vX.Y.Z` passes.
6. Update the pin in the catalog's `ci.yml` and in the tools, or let
   Dependabot do it.

A tag pushed without its release is not locked yet: publish the release
right away, or delete the tag before anyone pins it.
