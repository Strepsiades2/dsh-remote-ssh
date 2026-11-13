#!/usr/bin/env node
/**
 * Build `market/index.json` — a DSH plugin market index (format 1) that lists this
 * package from npm.
 *
 * Run it after `npm publish`. It reads the registry document (versions, publish
 * times, dist-tags) instead of guessing them, so the index stays truthful.
 *
 *   node tools/build-market-index.mjs
 *
 * The result is validated in CI/manual review with
 * `@deepseek-ai/dsh-plugin-market-index`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const registry = (process.env.NPM_REGISTRY || 'https://registry.npmjs.org').replace(/\/$/, '')
const encodedName = pkg.name.replace('/', '%2f')
const document = await (await fetch(`${registry}/${encodedName}`)).json()

if (!document.versions) {
  console.error(`registry has no document for ${pkg.name}; publish it first`)
  process.exit(1)
}
const published = document.versions[pkg.version]
if (!published) {
  console.error(`${pkg.name}@${pkg.version} is not published yet`)
  process.exit(1)
}
if (!published.dsh || !published.dsh.bundle) {
  console.error(`${pkg.name}@${pkg.version} does not declare dsh.bundle`)
  process.exit(1)
}
const enginesDsh = published.engines && published.engines.dsh
if (!enginesDsh) {
  console.error(`${pkg.name}@${pkg.version} does not declare engines.dsh`)
  process.exit(1)
}

const versions = Object.keys(document.versions)
  .filter((version) => document.versions[version].engines && document.versions[version].engines.dsh)
  .map((version) => ({
    version,
    publishTimestamp: Math.floor(new Date(document.time[version]).getTime() / 1000),
    source: { type: 'npm' },
    engines: { dsh: document.versions[version].engines.dsh },
  }))
  .sort((a, b) => (a.publishTimestamp < b.publishTimestamp ? 1 : -1))

const icon = readFileSync(join(root, 'icon.svg')).toString('base64')
const descriptionEn = 'Manage SSH hosts and open their DSH web UI in the browser — the DSH counterpart of VS Code Remote-SSH.'
const descriptionZh = '维护 SSH 主机列表，在浏览器里打开远端的 DSH 界面——相当于 DSH 版的 VS Code Remote-SSH。'

const index = {
  format: 1,
  title: { en: 'Strepsiades DSH Plugins', zh: 'Strepsiades DSH 插件' },
  description: { en: 'Community DSH bundles by Strepsiades.', zh: 'Strepsiades 的 DSH 插件。' },
  metadata: {
    categories: { remote: { title: { en: 'Remote', zh: '远程' } } },
    labels: { community: { title: { en: 'Community', zh: '社区' } } },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Remote SSH', zh: '远程 SSH' },
      description: { en: descriptionEn, zh: descriptionZh },
      icon: `data:image/svg+xml;base64,${icon}`,
      author: pkg.author,
      homepage: pkg.homepage,
      repository: { url: 'https://github.com/Strepsiades2/dsh-remote-ssh' },
      metadata: {
        category: 'remote',
        labels: ['community'],
        keywords: pkg.keywords || [],
      },
      'dist-tags': { latest: document['dist-tags'].latest },
      versions,
    },
  ],
}

mkdirSync(join(root, 'market'), { recursive: true })
writeFileSync(join(root, 'market/index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`wrote market/index.json with ${versions.length} version(s); latest ${document['dist-tags'].latest}`)
