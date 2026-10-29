// 布料拓展：滚到拓展三，截图
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9611
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-cloth',
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
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
    if (m.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', m.params.exceptionDetails.exception?.description?.slice(0, 400))
    }
  }
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
  await sleep(900)

  console.log('cloth:', await evaluate(`JSON.stringify({
    canvas: !!document.querySelector('.ma-cloth-canvas'),
    stats: (document.querySelector('.ma-cloth-stats') || {}).textContent,
    exts: document.querySelectorAll('.ma-ext').length
  })`))

  // 展开拓展三（默认折叠）
  await evaluate(`(function () {
    var head = document.querySelectorAll('.ma-ext')[2].querySelector('.ma-ext-head')
    if (head.getAttribute('aria-expanded') === 'false') head.click()
    return 1
  })()`)
  await sleep(1200)

  // 滚到拓展三
  await evaluate(`(function () {
    var ext = document.querySelectorAll('.ma-ext')[2]
    if (ext) ext.scrollIntoView({ block: 'center' })
    return 1
  })()`)
  await sleep(2500)

  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\cloth-skirt.png', Buffer.from(s.result.data, 'base64'))
  // 滚轮拉近看细节
  const cbox = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelector('.ma-cloth-canvas').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  for (let i = 0; i < 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cbox.x, y: cbox.y, deltaX: 0, deltaY: -120 })
    await sleep(80)
  }
  await sleep(900)
  const zoomShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:/ai数学/.shots/cloth-zoom.png', Buffer.from(zoomShot.result.data, 'base64'))

  console.log('saved')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
