---
title: "Versions and pinning"
description: "Pin skills-action to an immutable release tag, let Dependabot propose the next one, and read what each kind of version bump means for your workflow."
---

# Versions and pinning

Every version is an immutable GitHub release `vX.Y.Z`. While the release
exists, its tag can't be moved or deleted, the tag name can never be reused,
and GitHub attests the release:

```bash
gh release verify v0.2.1 -R octomation/skills-action
```

Pin the action to a release tag, and let Dependabot propose the next one:

```yaml
uses: octomation/skills-action@v0.2.1
```

There is no floating major tag such as `v0`: nothing would pin it.

## What a version bump means

The version describes the contract for the workflows that call the action:
its inputs, its outputs and what it accepts. The series started at `v0.1.0`:
the contract is not stable until it has been proven in practice.

| Change | Before 1.0 | After 1.0 | Examples |
| :-- | :-- | :-- | :-- |
| a fix inside; callers change nothing | patch | patch | retry logic, an error message, a dependency bump of a step |
| something new; existing calls work as before | patch | minor | a new optional input or output |
| callers must change their workflow, or a release that passed before is now refused | minor | major | an input renamed, removed or made required, a new token permission, a stricter skill contract |

Before 1.0, every `0.Y.*` release is compatible, and a breaking change is the
next minor: the rule the skills' compatibility ranges follow too.

## What stays readable

A change of the catalog layout or of `provenance.json` keeps reading what is
already published: published releases are frozen. [`inspect`](/inspect/) is
how workflows read a record, so its outputs are part of the contract, and a
change of the record changes `inspect` with it.

## Upgrade the catalog first

A newer `check` may refuse what an older one accepted, and a newer publisher
may write what an older `check` refuses. Move the catalog's CI to the new
version before the tools publish with it, as [extra skills](/extra-skills/#roll-it-out-in-order)
did with v0.2.0. The catalog's workflows pin exactly one version of the
action.
