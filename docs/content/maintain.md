---
title: "Maintain the catalog"
description: "Register a tool, regenerate the manifests after editing catalog.json and check the catalog locally with the octolab-skills command."
---

# Maintain the catalog

The catalog holds only data: the tools allowed to publish, and what they
published. The publisher, the checks and the generator live in this
repository, and the same code runs as the action and as a command.

| Path | Owner | Edit by hand |
| :-- | :-- | :-- |
| `catalog.json` | maintainers | yes: registers tools and their extra skills |
| `plugins/<tool>/` | the tool's release workflow | never |
| `.claude-plugin/marketplace.json` | `octolab-skills generate` | never; regenerate |
| `plugins/<tool>/.claude-plugin/plugin.json` | `octolab-skills generate` | never; regenerate |

## Add a tool

1. Register it in `catalog.json`, and list its extra skills, if any, under
   `extra-skills`.
2. Add the token and publish steps to the tool's release workflow: see
   [Publish from a tool](/publish/).
3. Release the tool, and check that the catalog's CI passes.

## Regenerate the manifests

After editing `catalog.json`, regenerate the manifests from the catalog
checkout, with the version the catalog's `ci.yml` pins:

```bash
npx --yes github:octomation/skills-action#v0.2.1 generate
npx --yes github:octomation/skills-action#v0.2.1 check
```

The plugin `version` doesn't change, so Claude Code users see a new
description, homepage or keywords with the tool's next release.

A published skill is frozen. A wrong skill is fixed in the tool's repository
and ships with its next release; never patch `plugins/<tool>/` in the catalog.

## The command

```text
octolab-skills publish                       publish a release (the action's environment)
octolab-skills generate [--check]            regenerate the manifests, or fail if stale
octolab-skills check [--discovery out.json]  generated files, registry, payloads, tags, claude plugin validate
octolab-skills inspect <tool>                the published record of a tool as JSON, offline
```

Every command works on the current directory. It needs Node.js 22 or later
and no npm dependencies; `check` needs `claude` on `PATH`.
