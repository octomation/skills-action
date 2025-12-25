export default {
  '*': { theme: { timestamp: false } },
  index: {
    title: 'Home', type: 'page', display: 'hidden',
    theme: { layout: 'full', sidebar: false, toc: false, breadcrumb: false, pagination: false, copyPage: false },
  },
  documentation: { title: 'Documentation', type: 'page', href: '/publish/' },
  releases: { title: 'Changelog', type: 'page', href: '/changelog/' },
  publish: 'Publish from a tool',
  'extra-skills': 'Extra skills',
  check: 'Check the catalog',
  inspect: 'Inspect a published plugin',
  maintain: 'Maintain the catalog',
  versions: 'Versions and pinning',
  releaseHistory: { title: 'Changelog', type: 'separator' },
  // release breadcrumbs link to routes without the trailing slash of the export
  changelog: { title: 'Changelog', display: 'children', theme: { pagination: false, breadcrumb: false } },
}
