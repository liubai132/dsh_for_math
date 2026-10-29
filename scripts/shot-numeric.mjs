// 打开首页节点二（数值分析）→ 常微分方程，截图
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9799
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-numeric',
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

try {
  await sleep(1800)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', (m.params.exceptionDetails.exception?.description || '').slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(2500)

  await evaluate(`(function () { var t = Array.from(document.querySelectorAll('.ma-tab')).find(function (x) { return x.textContent === '首页' }); if (t) t.click(); return 1 })()`)
  await sleep(700)

  console.log('nodes:', await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.ma-node')).map(function (n) { return n.textContent.trim() }))`))

  // 点节点二
  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var nodes = document.querySelectorAll('.ma-node')
    var node = nodes[1]
    var r = node.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await mouse('mousePressed', box.x, box.y, 1)
  await sleep(50)
  await mouse('mouseReleased', box.x, box.y, 0)
  await sleep(900)

  console.log('page:', await evaluate(`(document.querySelector('.ma-dark-title') || {}).textContent`))
  console.log('crumb:', await evaluate(`(document.querySelector('.ma-dark-crumb') || {}).textContent`))

  await evaluate(`(function () {
    var b = Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (x) { return x.textContent.includes('常微分方程') })
    if (b) b.click()
    return !!b
  })()`)
  await sleep(900)
  console.log('after:', await evaluate(`(document.querySelector('.ma-dark-crumb') || {}).textContent`))
  console.log('title:', await evaluate(`(document.querySelector('.ma-doc-title') || {}).textContent`))

  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:/ai数学/.shots/numeric-ode.png', Buffer.from(s.result.data, 'base64'))
  console.log('saved')
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
