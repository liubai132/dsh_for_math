// 静止检查：两次截图是否一致
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9766
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-static',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })

let ws
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id
  pending.set(mid, resolve)
  ws.send(JSON.stringify({ id: mid, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text
}
const mouse = (type, x, y, buttons) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: buttons, clickCount: 1 })

const digest = (data) => createHash('sha1').update(data).digest('hex').slice(0, 12)

try {
  await sleep(1800)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(2500)

  await evaluate(`(function () { var t = Array.from(document.querySelectorAll('.ma-tab')).find(function (x) { return x.textContent === '首页' }); if (t) t.click(); return 1 })()`)
  await sleep(600)
  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var node = document.querySelectorAll('.ma-node')[0]
    if (!node) return null
    var r = node.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await mouse('mousePressed', box.x, box.y, 1)
  await sleep(50)
  await mouse('mouseReleased', box.x, box.y, 0)
  await sleep(700)
  await evaluate(`(function () { var b = Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (x) { return x.textContent.includes('凸集') }); if (b) b.click(); return 1 })()`)
  await sleep(900)
  await evaluate(`(function () {
    var ext = document.querySelectorAll('.ma-ext')[2]
    var head = ext && ext.querySelector('.ma-ext-head')
    if (head && head.getAttribute('aria-expanded') === 'false') head.click()
    return 1
  })()`)
  await sleep(2500)

  const a = await send('Page.captureScreenshot', { format: 'png' })
  const bufA = Buffer.from(a.result.data, 'base64')
  writeFileSync('F:/ai数学/.shots/static-a.png', bufA)
  await sleep(2500)
  const b = await send('Page.captureScreenshot', { format: 'png' })
  const bufB = Buffer.from(b.result.data, 'base64')
  writeFileSync('F:/ai数学/.shots/static-b.png', bufB)

  console.log('A', digest(bufA), 'B', digest(bufB), 'identical:', digest(bufA) === digest(bufB))
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
