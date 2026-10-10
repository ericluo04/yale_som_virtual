// Export the static building for the bake: loads the app with ?exportGLB=1 in headless Chrome,
// calls window.__bakeExport() (src/render/exportGLB.js), writes building.glb and lights.json
// next to this script.
//   node tools/bake/export-building.mjs [base url, default http://localhost:5190/]
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] || 'http://localhost:5190/'
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--user-data-dir=/tmp/shots-profile-bake-export'],
})
const p = await b.newPage()
await p.setViewport({ width: 800, height: 500 })
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)))
await p.goto(`${base}?exportGLB=1&nolock=1&hud=0&quality=high`, { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__bakeExport, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 5000)) // texture images load, so their mean colours are real
const { glb, lights } = await p.evaluate(() => window.__bakeExport())
writeFileSync(join(here, 'building.glb'), Buffer.from(glb, 'base64'))
writeFileSync(join(here, 'lights.json'), JSON.stringify(lights, null, 1))
const tris = Object.entries(lights.triangles)
console.log(`building.glb ${(Buffer.from(glb, 'base64').length / 1e6).toFixed(1)} MB, ${tris.length} meshes, ${tris.reduce((s, [, n]) => s + n, 0)} triangles`)
console.log(tris.filter(([k]) => k.startsWith('bake_')).map(([k, n]) => `${k} ${n}`).join('\n'))
if (errs.length) console.log('CONSOLE', [...new Set(errs)].slice(0, 8))
await b.close()
