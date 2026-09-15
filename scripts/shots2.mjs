/**
 * Second screenshot pass: the behaviours that need interaction to appear —
 * optimistic send, a send that fails, and the jump-to-latest pill.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'screenshots')
mkdirSync(outDir, { recursive: true })
const BASE = process.env.BASE ?? 'http://127.0.0.1:5273'

const errors = []
const browser = await chromium.launch()

async function page(url, width = 1280, height = 860) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const p = await context.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(url)
  return p
}

async function shot(p, name) {
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('captured', name)
}

/* 14. Optimistic send: the bubble is on screen before the server answers */
{
  const p = await page(`${BASE}/?role=agent`)
  await p.getByRole('button', { name: /Wrong listing photos/ }).click()
  await p.waitForTimeout(700)
  await p.getByRole('textbox', { name: /Write a message/i }).fill(
    'Confirming the corner unit shot is now on the portal.',
  )
  await p.keyboard.press('Enter')
  await p.waitForTimeout(80)
  await shot(p, '14-optimistic-send-pending')
  await p.waitForTimeout(900)
  await shot(p, '15-optimistic-send-reconciled')
  await p.context().close()
}

/* 16. A send that fails keeps the bubble, marked, with retry and discard */
{
  const p = await page(`${BASE}/?role=agent&failSend=1`)
  await p.getByRole('button', { name: /Wrong listing photos/ }).click()
  await p.waitForTimeout(700)
  await p.getByRole('textbox', { name: /Write a message/i }).fill(
    'This one cannot reach the server — it must not disappear.',
  )
  await p.keyboard.press('Enter')
  await p.waitForTimeout(1200)
  await shot(p, '16-failed-send-with-retry')
  await p.context().close()
}

/* 17. Jump-to-latest: new messages arrive while the reader is up in history */
{
  const p = await page(`${BASE}/?role=agent&incoming=3`)
  await p.getByRole('button', { name: /Wrong listing photos/ }).click()
  await p.waitForTimeout(900)
  await p.evaluate(() => {
    const scroller = document.querySelector('.thread-paper')
    if (scroller) scroller.scrollTop = 0
  })
  await p.waitForTimeout(7000)
  await shot(p, '17-jump-to-latest-pill')

  const scrollTop = await p.evaluate(() => document.querySelector('.thread-paper')?.scrollTop ?? -1)
  console.log('scrollTop after new messages (0 means the viewport was not yanked):', scrollTop)
  await p.context().close()
}

/* 18. Realtime degraded: no SSE at all, so the app falls back to polling */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
  const p = await context.newPage()
  await p.addInitScript(() => {
    // Simulate a proxy that refuses the event stream.
    Object.defineProperty(window, 'EventSource', { value: undefined, writable: true })
  })
  await p.goto(`${BASE}/?role=admin`)
  await p.waitForTimeout(1200)
  await shot(p, '18-realtime-degraded-polling')
  await context.close()
}

await browser.close()
console.log(errors.length ? `CONSOLE ERRORS:\n - ${errors.join('\n - ')}` : 'No console errors.')
