import { chromium } from 'playwright'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'screenshots')
const BASE = process.env.BASE ?? 'http://127.0.0.1:5273'

const browser = await chromium.launch()

for (const [name, width, height] of [
  ['20-dashboard-admin', 1280, 900],
  ['21-dashboard-narrow', 760, 900],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
  console.log('captured', name)
  await ctx.close()
}

// Filters panel, opened from the rail.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Filters' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: resolve(outDir, '22-filters-panel.png') })
console.log('captured 22-filters-panel')
await ctx.close()

await browser.close()
