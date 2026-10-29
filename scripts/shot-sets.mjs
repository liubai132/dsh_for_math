// 凸集那一页：文字 + 插值动画
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9566
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-sets',
  '--window-size=1280,860', 'about:blank',
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text
}

try {
  await sleep(2000)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', m.params.exceptionDetails.exception?.description?.slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3500)

  const box = JSON.parse(
    await evaluate(`JSON.stringify((function () {
      var rect = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })())`),
  )
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(800)

  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸集') }).click()`)
  await sleep(1200)

  // 切到「圆弧」看曲线
  await evaluate(`Array.from(document.querySelectorAll('.ma-demo-chip')).find(function (b) { return b.textContent === '圆弧' }).click()`)
  await sleep(900)

  console.log('sets page:', await evaluate(`JSON.stringify({
    title: (document.querySelector('.ma-doc-title') || {}).textContent,
    demo: !!document.querySelector('.ma-demo canvas'),
    ext: !!(document.querySelector('.ma-ext') || {}).className,
    kinds: Array.from(document.querySelectorAll('.ma-demo-chip')).map(function (c) { return c.textContent }),
    note: (document.querySelector('.ma-demo-note') || {}).textContent
  })`))

  // 滚到第二个「拓展」块
  await evaluate(`(function () {
    var ext = document.querySelectorAll('.ma-ext')[1]
    if (ext) ext.scrollIntoView({ block: 'center' })
    return 1
  })()`)
  await sleep(600)

  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\chime-sets.png', Buffer.from(s.result.data, 'base64'))
  console.log('saved')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
