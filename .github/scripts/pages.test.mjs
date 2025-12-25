import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expectedSite, pagesCheck, smoke, smokeOnce } from './pages.mjs'

const SITE = 'https://skills-action.octolab.org/'
const FALLBACK = 'https://octomation.github.io/skills-action/'

test('expectedSite: the custom domain, the project and the user site', () => {
  assert.equal(expectedSite({ cname: 'skills-action.octolab.org' }, 'octomation/skills-action'), SITE)
  assert.equal(expectedSite(null, 'octomation/skills-action'), FALLBACK)
  assert.equal(expectedSite({}, 'Octomation/Octomation.github.io'), 'https://octomation.github.io/')
  assert.equal(expectedSite(null, null), null)
})

test('pagesCheck: refuses a domain that settings.json does not expect', () => {
  const pages = { cname: 'skills-action.octolab.org' }
  assert.deepEqual(pagesCheck('https://skills-action.octolab.org', pages, 'octomation/skills-action'), [])
  assert.match(pagesCheck(FALLBACK, pages, 'octomation/skills-action')[0], /expects https:\/\/skills-action\.octolab\.org\//)
  assert.match(pagesCheck('', pages, 'octomation/skills-action')[0], /configure-pages/)
})

// A site as GitHub Pages serves it: pages, assets, its own 404, an HTTPS
// redirect and the default domain redirecting to the custom one.
function server(overrides = {}) {
  const home = `<link href="/_next/static/css/a.css"><script src="/_next/static/chunks/b.js"></script>` +
    `<meta property="og:image" content="${SITE}og.png">`
  const routes = {
    [SITE]: { status: 200, type: 'text/html', text: home },
    [`${SITE}_next/static/css/a.css`]: { status: 200, type: 'text/css' },
    [`${SITE}_next/static/chunks/b.js`]: { status: 200, type: 'text/javascript' },
    [`${SITE}og.png`]: { status: 200, type: 'image/png' },
    [`${SITE}changelog/`]: { status: 200, type: 'text/html', text: '' },
    [`${SITE}smoke-missing-page/`]: { status: 404, type: 'text/html', text: '<script src="/_next/static/x.js">' },
    'http://skills-action.octolab.org/': { status: 301, location: SITE },
    [`${FALLBACK}changelog/`]: { status: 301, location: `${SITE}changelog/` },
    ...overrides,
  }
  return async (url) => ({ type: '', text: '', location: null, ...(routes[url] || { status: 404 }) })
}

test('smokeOnce: a healthy site passes', async () => {
  assert.deepEqual(await smokeOnce(SITE, { fallback: FALLBACK, get: server() }), [])
})

test('smokeOnce: plain HTTP must redirect to HTTPS', async () => {
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, get: server({ 'http://skills-action.octolab.org/': { status: 200, type: 'text/html' } }) })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Enforce HTTPS/)
})

test('smokeOnce: assets of another base path and a foreign og:image fail', async () => {
  const get = server({
    [`${SITE}_next/static/css/a.css`]: { status: 404 },
    [SITE]: { status: 200, type: 'text/html', text: '<link href="/_next/static/css/a.css"><meta property="og:image" content="http://localhost:3000/og.png">' },
  })
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, get })
  assert.ok(errors.some((e) => /another base path/.test(e)), errors.join('\n'))
  assert.ok(errors.some((e) => /SITE_URL is stale/.test(e)), errors.join('\n'))
})

test('smokeOnce: the default domain must redirect, keeping the path', async () => {
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, get: server({ [`${FALLBACK}changelog/`]: { status: 200 } }) })
  assert.match(errors.join('\n'), /want a redirect to https:\/\/skills-action\.octolab\.org\/changelog\//)
})

test('smokeOnce: plain HTTP may stay when HTTPS is not enforced', async () => {
  const get = server({ 'http://skills-action.octolab.org/': { status: 200, type: 'text/html' } })
  assert.deepEqual(await smokeOnce(SITE, { fallback: FALLBACK, https: false, get }), [])
})

test('smokeOnce: no og:image and a 404 that is not the site\'s own fail', async () => {
  const get = server({
    [SITE]: { status: 200, type: 'text/html', text: '<link href="/_next/static/css/a.css">' },
    [`${SITE}smoke-missing-page/`]: { status: 404, type: 'text/html', text: 'Not Found' },
  })
  const errors = (await smokeOnce(SITE, { fallback: FALLBACK, get })).join('\n')
  assert.match(errors, /no og:image/)
  assert.match(errors, /want the site's own 404/)
})

test('smoke: an empty site URL fails at once', async () => {
  assert.match((await smoke('', 20))[0], /want the URL of the site/)
  assert.match((await smoke(undefined, 20))[0], /want the URL of the site/)
})

test('smoke: retries until the deployment is served, and checks its input', async () => {
  let calls = 0
  const healthy = server()
  const get = async (url, init) => (url === SITE && ++calls < 3 ? { status: 503, type: '', text: '' } : healthy(url, init))
  assert.deepEqual(await smoke(SITE, 3, { wait: 0, fallback: FALLBACK, get }), [])
  assert.equal(calls, 3)
  assert.match((await smoke(SITE, -1))[0], /non-negative integer/)
})
