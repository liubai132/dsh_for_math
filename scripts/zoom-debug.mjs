import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9755
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-zoom3',
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
      console.log('[exception]', (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300))
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      console.log('[console.error]', m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(2500)

  await evaluate(`(function () { var t = Array.from(document.querySelectorAll('.ma-tab')).find(function (x) { return x.textContent === '首页' }); if (t) t.click(); return 1 })()`)
  await sleep(500)
  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await mouse('mousePressed', box.x, box.y, 1)
  await sleep(50)
  await mouse('mouseReleased', box.x, box.y, 0)
  await sleep(700)
  await evaluate(`(function () { var b = Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (x) { return x.textContent.includes('凸集') }); if (b) b.click(); return 1 })()`)
  await sleep(900)
  console.log('canvas after page:', await evaluate(`document.querySelectorAll('.ma-cloth-canvas').length`))
  await evaluate(`(function () {
    var ext = document.querySelectorAll('.ma-ext')[2]
    var head = ext && ext.querySelector('.ma-ext-head')
    if (head && head.getAttribute('aria-expanded') === 'false') head.click()
    return 1
  })()`)
  await sleep(1500)
  console.log('canvas after expand:', await evaluate(`document.querySelectorAll('.ma-cloth-canvas').length`))
  console.log('rect:', await evaluate(`JSON.stringify((function () {
    var c = document.querySelector('.ma-cloth-canvas')
    if (!c) return null
    var r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })())`))
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
