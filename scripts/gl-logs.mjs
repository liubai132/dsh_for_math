// 打开 WebGL，抓 console 输出
import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9677
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-gl-logs',
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

try {
  await sleep(1800)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (text) console.log('[' + m.params.type + ']', text.slice(0, 600))
    }
  }
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3000)

  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '首页' }).click()`)
  await sleep(400)
  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(50)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(700)
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸集') }).click()`)
  await sleep(800)
  await evaluate(`(function () {
    var head = document.querySelectorAll('.ma-ext')[2].querySelector('.ma-ext-head')
    if (head.getAttribute('aria-expanded') === 'false') head.click()
    return 1
  })()`)
  await sleep(1200)

  await evaluate(`Array.from(document.querySelectorAll('.ma-demo-chip')).find(function (b) { return b.textContent === 'WebGL' }).click()`)
  await sleep(1500)
  console.log('stats:', await evaluate(`(document.querySelector('.ma-cloth-stats') || {}).textContent`))
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
