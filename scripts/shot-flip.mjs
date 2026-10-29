// 把裙子往上掀过腰头，松手看是否掉回来
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9712
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-flip',
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\' + name + '.png', Buffer.from(s.result.data, 'base64'))
}

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
  await sleep(1500)

  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelector('.ma-cloth-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })())`))

  // 连续抓三次，每次都往上掀
  for (let round = 0; round < 3; round++) {
    const startX = box.x + box.w * 0.5
    const startY = box.y + box.h * (0.8 - round * 0.16)
    await mouse('mousePressed', startX, startY, 1)
    for (let i = 1; i <= 10; i++) {
      await mouse('mouseMoved', startX + i * 2, startY - i * 16, 1)
      await sleep(30)
    }
    await mouse('mouseReleased', startX + 20, startY - 160, 0)
    await sleep(250)
  }
  await shot('flip-up')
  await sleep(3000)
  await shot('flip-drop2')
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
