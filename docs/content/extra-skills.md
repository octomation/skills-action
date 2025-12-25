---
title: "Extra skills"
description: "Publish more skills than the main one with a tool release, such as a review skill next to the skill that drives the CLI, and roll them out in the right order."
---

# Extra skills

A tool may publish more skills than its main one, such as a review skill next
to the skill that drives its CLI. Agents see them as `<tool>:<name>`, e.g.
`maintainer:review`. A tool with one skill needs none of this: its inputs,
its `catalog.json` entry and its files in the catalog stay as they are.

## Add a skill

1. Put the skill in the sibling folder of the main skill: with
   `skill: skills/maintainer`, the skill `review` lives in `skills/review/`.
   Its `name` equals the folder, `metadata.tool` is the tool, and the rest of
   the frontmatter follows the rules of the main skill, `metadata.version`
   equal to the release tag included.
2. Register it in the catalog's `catalog.json`; a folder that is not
   registered is not published.

   ```json
   "maintainer": {
     "repository": "octomation/maintainer",
     "skill": "skills/maintainer",
     "extra-skills": ["review"]
   }
   ```

3. Release the tool with the action at v0.2.0 or later.

Skill names are unique across the catalog, since the skills CLI installs
skills by name: an extra skill can't be named after a tool or another tool's
extra skill.

A new publication reads every registered skill at the release tag and fails
if one is missing there, so register a skill only once the release that ships
it is near. A registered skill that a published version lacks is valid.

## Roll it out in order

1. The catalog's CI moves to v0.2.0.
2. The catalog registers `extra-skills`.
3. The tool releases with both skills.

The order matters because older versions read the registry differently:

- `check` before v0.2.0 accepts the `extra-skills` key, but refuses a plugin
  that holds `skills/<name>/` of an extra skill.
- Publishers before v0.2.0 ignore `extra-skills` and publish the main skill
  only, which `check` v0.2.0 and later accepts.

## What the plugin holds

```text
plugins/maintainer/
  .claude-plugin/plugin.json
  provenance.json
  skills/maintainer/    the main skill
  skills/review/        every extra skill the release published
```

`provenance.json` keeps `version`, `source` and `digest` of the main skill,
and adds `skills`: a map from each published skill, the main one first and
then in the order of `extra-skills`, to its `path` in the tool's repository
and its digest, computed with `digest.algorithm` over that folder alone. As
maintainer v0.6.0 published it:

```json
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
```

A tool with one skill has no `skills` key and no other change. `check`
requires the plugin's skill folders to be those of `provenance.json`, each
registered for the tool. The output `skills-digests` of `publish` lists every
published skill; `payload-digest` stays the digest of the main skill.
