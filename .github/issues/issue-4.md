---
code: null
id: I_kwDOVOU7GM8AAAABi0jshg
databaseId: 6631779462
number: 4
url: https://github.com/octomation/skills-action/issues/4
title: "cd: the release check reads the attestation before GitHub issues it"
issueType: Bug
labels:
  - "effort: easy"
  - "impact: low"
  - "scope: code"
  - "severity: minor"
  - "type: bug"
assignees:
  - kamilsk
milestone: null
parent: null
issueFields: {}
state: OPEN
stateReason: null
duplicateOf: null
createdAt: 2026-11-26T17:17:08Z
updatedAt: 2026-11-26T17:17:09Z
lastEditedAt: null
closedAt: null
---

# cd: the release check reads the attestation before GitHub issues it

## Problem

`cd` failed on both releases of 2026-11-26, v0.2.0 and v0.2.1, at the last
step, "Verify the release": `gh release verify` reported
`no attestations for tag vX.Y.Z` about a second after `gh release create`.
A minute later the same command verified the release, and a rerun of the
failed job turned `cd` green. The release itself was published and immutable
both times; only the check failed, so every release needs a manual rerun.

## PoC

```bash
# runs 45851158960 (v0.2.0) and 45860142150 (v0.2.1), first attempt
gh run view 45860142150 --attempt 1 --log-failed | grep attestation
# no attestations for tag v0.2.1 (sha1:…)
gh release verify v0.2.1     # a minute later: ✓ Release v0.2.1 verified!
```

## Expected behavior

The step waits for GitHub to issue the release attestation and fails only if
it does not appear within a bounded time, naming that time.

## Acceptance criteria

- [ ] The cause is confirmed: GitHub issues the attestation asynchronously
      after the release is published, or the step reads it in another way
      that races; the finding is recorded in this issue.
- [ ] "Verify the release" retries `gh release verify` for a bounded time
      (for example every 10 s for up to 2 min) and still fails on a release
      that is not immutable or never gets an attestation.
- [ ] The next release of the action passes `cd` on the first attempt.

## Out of scope

- How the release is published, its note and its tag checks.
- The `cd` of tools that use the action: they do not verify its attestation.
