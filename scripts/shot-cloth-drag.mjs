// 拖动布料：按下拽起、松手甩动
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9622
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-drag',
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\' + name + '.png', Buffer.from(s.result.data, 'base64'))
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
      console.log('[exception]', m.params.exceptionDetails.exception?.description?.slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3000)

  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '首页' }).click()`)
  await sleep(400)
  const nodeBox = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await mouse('mousePressed', nodeBox.x, nodeBox.y, 1)
  await sleep(50)
  await mouse('mouseReleased', nodeBox.x, nodeBox.y, 0)
  await sleep(700)
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸集') }).click()`)
  await sleep(800)
  await evaluate(`(function () {
    var head = document.querySelectorAll('.ma-ext')[2].querySelector('.ma-ext-head')
    if (head.getAttribute('aria-expanded') === 'false') head.click()
    return 1
  })()`)
  await sleep(1200)
  await evaluate(`(function () {
    var ext = document.querySelectorAll('.ma-ext')[2]
    if (ext) ext.scrollIntoView({ block: 'center' })
    return 1
  })()`)
  await sleep(2200)

  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelector('.ma-cloth-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })())`))
  console.log('canvas', box)
  await shot('cloth-idle')

  // 抓住裙摆往右上方拽
  const startX = box.x + box.w * 0.5
  const startY = box.y + box.h * 0.45
  await mouse('mousePressed', startX, startY, 1)
  for (let i = 1; i <= 12; i++) {
    await mouse('mouseMoved', startX + i * 12, startY - i * 6, 1)
    await sleep(30)
  }
  await sleep(300)
  await shot('cloth-drag')

  await mouse('mouseReleased', startX + 144, startY - 72, 0)
  await sleep(260)
  await shot('cloth-swing')
  await sleep(1800)
  await shot('cloth-recover')
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
