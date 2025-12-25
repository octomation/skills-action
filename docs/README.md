# skills-action documentation

An English site for skills-action v0.2.1 at <https://skills-action.octolab.org/>:
a landing page with a run of each command, the guides of the action and the
changelog. Nextra 4 on Next.js, the stack shared with octopot/indexit,
octomation/maintainer, octopot/sushi and octomation/pulse. The site has its own
npm dependencies; the action itself still has none.

## Run locally

Use Node 24 (the CI version). From `docs/`:

```sh
npm ci
npm run dev
```

Open the local URL printed by Next.js, normally <http://localhost:3000>.

## Build

For GitHub Pages:

```sh
TARGET=static SITE_URL=https://skills-action.octolab.org/ npm run build
```

Static output is written to `docs/dist/`. `SITE_URL` is required; add
`BASE_PATH=/skills-action` only when hosting under a path, as on the default
`octomation.github.io/skills-action/`. The [Pages workflow](../.github/workflows/cd.docs.yml)
supplies both: from the Pages configuration on main, from
[`.github/settings.json`](../.github/settings.json) for pull requests.

## Edit the content

| Location | Purpose |
| --- | --- |
| `content/index.mdx` | The landing page |
| `components/run.jsx` | The hero: one run of `publish`, `check` and `inspect`, as a workflow log on the data of the live catalog |
| `components/journey.jsx` | The way of a skill, from the tool's repository to the agent, in four stations |
| `components/reveal.jsx` | Fades a block in when it scrolls into view; without scripts the page is whole |
| `content/publish.md` | Publish from a tool: the workflow, inputs, outputs, checks and re-runs |
| `content/extra-skills.md` | Extra skills and the order to roll them out |
| `content/check.md` | Check the catalog, with discovery |
| `content/inspect.md` | Inspect a published plugin |
| `content/maintain.md` | Maintain the catalog: registration, `generate`, the command |
| `content/versions.md` | Versions and pinning: the contract and what each bump means |
| `content/changelog/index.mdx` | Release overview |
| `content/changelog/vX.Y.Z.md` | Release notes, also the GitHub release bodies |
| `content/**/_meta.js` | Navigation order and labels |
| `navigation.mjs` | Release groups in the sidebar; keeps published release URLs unchanged |
| `app/globals.css` | Shared layouts, kept byte-identical to octopot/indexit |
| `app/brand.css` | The tokens of skills-action: library paper, navy ink, the blue of the mark, gold for what passed |
| `app/landing.css` | The landing page: the navy terminal, the run, the journey and the feature rows |
| `app/layout.jsx` | Site identity and Nextra theme |
| `app/[[...mdxPath]]/page.jsx` | Page-specific titles and social metadata |
| `public/icon.svg` | The favicon: 📚 from Noto Emoji, Apache-2.0 |
| `public/og.png`, `scripts/og.html`, `scripts/og.mjs` | The social preview, its source and its renderer |

The public origin in metadata comes from `SITE_URL` (see `site.mjs`); the Pages
workflow sets it from the Pages configuration. Internal links use
Next.js/Nextra and keep the configured base path.

The guides stay at the top level, such as `/publish/` and `/inspect/`.
Published release notes and the README link to these URLs, so keep them.

## Release notes

Changelog is a section of the sidebar, with All releases first.
`navigation.mjs` groups release pages into expandable `v0.1.x`, `v0.2.x` and
later branches, newest first. For each release:

1. Write `content/changelog/vX.Y.Z.md` as [AGENTS.md](../AGENTS.md#releasing)
   describes. Its first line is `# vX.Y.Z — Slogan.` and it has no
   frontmatter: `cd` takes the title from that line and the body from the
   third line on.
2. Add its label to `content/changelog/_meta.js`, newest first, and an entry
   to `content/changelog/index.mdx`, moving `LATEST` to it.
3. Move every mention of the previous version outside the release notes to
   the new one: the landing page and its description, the guides (`uses:`,
   `npx …#vX.Y.Z`, `gh release verify`), the run of `components/run.jsx`,
   `scripts/og.html` and this README. List them with
   `grep -rn 'v0\.2\.1' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next . | grep -v '^./content/changelog/v'`
   from `docs/`, with the previous version in the pattern; links to the
   previous release note in `content/changelog/` stay.
4. Render `public/og.png` again from the updated `scripts/og.html` (below).

## Social preview image

`public/og.png`, 1733×908, is the social preview of the home page; other pages
share a link without an image (`app/[[...mdxPath]]/page.jsx`). It is rendered
from `scripts/og.html`: the 📚 wordmark, the slogan "Ship the skill with the
tool.", the line "Publish. Check. Inspect. One signed commit.", the version
label at the bottom left and, on the right, the Publish run of the landing
page held still.

To render it, point `PLAYWRIGHT_CORE` at an installed `playwright-core` with a
Chromium of its own, update the version in `scripts/og.html` and run:

```sh
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.mjs node scripts/og.mjs
```

The script prints the box of the version label, (96, 818, 94, 26) for
`v0.2.1`. Check `width`, `height` and `alt` in `app/[[...mdxPath]]/page.jsx`
when the image or its text changes.

## Change the domain

The site is served from the custom domain `skills-action.octolab.org`, with
HTTPS enforced; `octomation.github.io/skills-action/` redirects to it, keeping
the path. The build bakes the domain into asset paths and metadata, and
changing it in Settings → Pages triggers no rebuild. To change it:

1. Update `pages.cname` in [`.github/settings.json`](../.github/settings.json)
   (remove it for the default domain) and push.
2. Change Settings → Pages → Custom domain to match, and turn Enforce HTTPS on
   again once the certificate is issued.
3. Rebuild: `gh workflow run cd.docs.yml -f reason="domain change"`.

The docs build stops while the two disagree, the deployment is smoke-tested,
and the daily [doctor](../.github/workflows/doctor.yml) reports a domain,
HTTPS enforcement or source that differs from the settings, or a stale site.

## Keep it accurate

The action is the source of truth: check every input, output and refusal
against `action.yml`, `scripts/` and the tests, and every example against the
live catalog. The README of the repository stays the short form of these
pages; change both together.

`package.json` pins Zod to `4.1.12` under `nextra-theme-docs` to avoid [a
validation regression](https://github.com/shuding/nextra/issues/5036), and
overrides the xmldom of `speech-rule-engine@4.1.4`, as the sibling sites do;
see the [maintainer docs](https://github.com/octomation/maintainer/blob/main/docs/README.md#keep-the-release-accurate)
for when to drop them. Search is disabled: static search indexing is not
configured.
