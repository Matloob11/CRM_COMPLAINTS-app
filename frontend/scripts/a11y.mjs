/** Automated accessibility pass (axe-core) over the main surfaces. */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5273'
const browser = await chromium.launch()
const results = []

async function audit(name, url, prepare) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForTimeout(900)
  if (prepare) await prepare(page)
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  results.push({ name, violations: scan.violations })
  await context.close()
}

await audit('admin list + thread', `${BASE}/?role=admin`, async (page) => {
  await page.getByRole('button', { name: /Wrong listing photos/ }).click()
  await page.waitForTimeout(700)
})
await audit('agent empty state', `${BASE}/?role=agent&scenario=empty`)
await audit('new complaint modal', `${BASE}/?role=agent`, async (page) => {
  await page.getByRole('button', { name: 'New complaint' }).first().click()
  await page.waitForTimeout(400)
})

await browser.close()

for (const result of results) {
  console.log(`\n== ${result.name}: ${result.violations.length} violation(s)`)
  for (const violation of result.violations) {
    console.log(` - [${violation.impact}] ${violation.id}: ${violation.help}`)
    violation.nodes.slice(0, 3).forEach((node) => console.log('     ', node.target.join(' ')))
  }
}
