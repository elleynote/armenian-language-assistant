import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [template, styles, core, app] = await Promise.all([
  readFile(resolve(root, 'frontend/template.html'), 'utf8'),
  readFile(resolve(root, 'frontend/styles.css'), 'utf8'),
  readFile(resolve(root, 'frontend/core.mjs'), 'utf8'),
  readFile(resolve(root, 'frontend/app.js'), 'utf8'),
])

const html = template
  .replace('/*__TAA_STYLES__*/', styles.trim())
  .replace('/*__TAA_CORE__*/', core.trim())
  .replace('/*__TAA_APP__*/', app.trim())

if (html.includes('/*__TAA_')) throw new Error('Embed template still contains unresolved placeholders')

const outputPath = resolve(root, 'embed/wordpress-embed.html')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${html.trim()}\n`, 'utf8')
console.log(`Built ${outputPath}`)
