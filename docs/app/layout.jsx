import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'
import './brand.css'
import './landing.css'
import { siteUrl } from '../site.mjs'
import { groupReleases } from '../navigation.mjs'

export const metadata = {
  title: { default: 'skills-action — Ship the skill with the tool.', template: '%s · skills-action' },
  description: 'A GitHub Action that publishes the agent skill of a tool release to the octolab/skills catalog, checks the catalog and reads what it publishes.',
  metadataBase: new URL(siteUrl),
  icons: { icon: `${process.env.BASE_PATH || ''}/icon.svg` },
}

function withExportLinks(items) {
  return items.map(item => ({
    ...item,
    ...('frontMatter' in item && { href: item.href || `${item.route.replace(/\/$/, '')}/` }),
    ...(item.children && { children: withExportLinks(item.children) }),
  }))
}

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head color={{ hue: 214, saturation: 70, lightness: { light: 40, dark: 74 } }} backgroundColor={{ light: 'rgb(248, 249, 251)', dark: 'rgb(17, 21, 28)' }} />
      <body>
        <Layout
          navbar={<Navbar logo={<span className="wordmark"><span className="brand-emoji" aria-hidden="true">📚</span>skills-action</span>} projectLink="https://github.com/octomation/skills-action" />}
          pageMap={withExportLinks(groupReleases(await getPageMap()))}
          docsRepositoryBase="https://github.com/octomation/skills-action/tree/main/docs"
          footer={<Footer><div className="site-footer"><span><b>skills-action</b> <span>Ship the skill with the tool.</span></span><span>MIT © {new Date().getFullYear()} <a href="https://github.com/octolab">OctoLab</a></span></div></Footer>}
          search={null}
          copyPageButton={false}
          feedback={{ content: 'Something unclear?', link: 'https://github.com/octomation/skills-action/issues/new' }}
          nextThemes={{ defaultTheme: 'system' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
