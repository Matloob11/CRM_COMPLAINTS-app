/**
 * Screenshot harness.
 *
 * Drives the real app in a real Chromium against the typed mock backend and
 * captures every state the specification asks to see. Run with:
 *   node scripts/shots.mjs            (dev server must be on 127.0.0.1:5273)
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'screenshots')
mkdirSync(outDir, { recursive: true })

const BASE = process.env.BASE ?? 'http://127.0.0.1:5273'
const BIG_FILE = join(outDir, '.big-upload-sample.bin')
const BIG_MB = 180

if (!existsSync(BIG_FILE)) {
  // A file big enough that the chunked upload path is genuinely exercised
  // (180 MB over an 8 MB chunk size = 23 chunks).
  writeFileSync(BIG_FILE, Buffer.alloc(BIG_MB * 1024 * 1024, 7))
}

const errors = []

async function newPage(browser, width = 1280, height = 860) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()} :: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`${page.url()} :: ${error.message}`))
  return page
}

/** The app opens on the dashboard; most shots want the complaint list. */
async function gotoComplaints(page) {
  await page.getByRole('button', { name: 'Complaints', exact: true }).click()
  await page.waitForTimeout(400)
}

async function shot(page, name) {
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('captured', name)
}

const browser = await chromium.launch()

/* 1. Admin list + selected thread, two panes */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=admin`)
  await page.getByRole('button', { name: /Wrong listing photos/ }).click()
  await page.waitForTimeout(600)
  await shot(page, '01-admin-list-and-thread')

  /* 2. Internal note composer, admin */
  await page.getByRole('button', { name: /internal note/i }).click()
  await page.getByRole('textbox', { name: /internal note/i }).fill(
    'Checking the absence calendar sync before I reply to Sara.',
  )
  await shot(page, '02-composer-internal-note')

  /* 3. Admin status change, note required */
  await page.getByRole('button', { name: 'Change status' }).click()
  await page.getByRole('menuitem', { name: 'Resolved' }).click()
  await shot(page, '03-status-change-requires-note')
  await page.keyboard.press('Escape')

  /* 4. Large upload in flight */
  await page.setInputFiles('input[type=file]', BIG_FILE)
  await page.waitForTimeout(2500)
  await shot(page, '04-large-upload-in-progress')
  await page.context().close()
}

/* 5. Agent view: own complaints only, list */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=agent`)
  await page.waitForTimeout(900)
  await shot(page, '05-agent-list')
  await page.context().close()
}

/* 6. Empty state: agent with no complaints */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=agent&scenario=empty`)
  await page.waitForTimeout(900)
  await shot(page, '06-empty-no-complaints')

  /* 7. New complaint modal, inline validation */
  await page.getByRole('button', { name: 'New complaint' }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Raise complaint' }).click()
  await shot(page, '07-new-complaint-validation')
  await page.context().close()
}

/* 8. Empty state: filters match nothing */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=admin`)
  await page.waitForTimeout(800)
  await gotoComplaints(page)
  await page.getByRole('searchbox').fill('zzzz-no-such-thing')
  await page.waitForTimeout(700)
  await shot(page, '08-empty-no-match')
  await page.context().close()
}

/* 9. Error state with retry */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=admin&scenario=error`)
  await page.waitForTimeout(1200)
  await shot(page, '09-error-with-retry')
  await page.context().close()
}

/* 10. Loading skeletons */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=admin&scenario=slow`)
  await page.waitForTimeout(500)
  await shot(page, '10-loading-skeletons')
  await page.context().close()
}

/* 11. Session expired (401) */
{
  const page = await newPage(browser)
  await page.goto(`${BASE}/?role=agent&scenario=expired`)
  await page.waitForTimeout(900)
  await shot(page, '11-session-expired')
  await page.context().close()
}

/* 12 + 13. Narrow container: single pane list, then thread with a back button */
{
  const page = await newPage(browser, 720, 860)
  await page.goto(`${BASE}/?role=agent`)
  await page.waitForTimeout(900)
  await shot(page, '12-narrow-single-pane-list')
  await page.getByRole('button', { name: /Wrong listing photos/ }).click()
  await page.waitForTimeout(700)
  await shot(page, '13-narrow-thread-with-back')
  await page.context().close()
}

await browser.close()

if (errors.length > 0) {
  console.log('\nCONSOLE ERRORS:')
  errors.forEach((line) => console.log(' -', line))
} else {
  console.log('\nNo console errors.')
}
