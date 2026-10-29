// 把裙长拉到 55%，看迷你裙
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9722
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-len',
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
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
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
  await mouse('mousePressed', box.x, box.y, 1)
  await sleep(50)
  await mouse('mouseReleased', box.x, box.y, 0)
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

  const setRange = async (value) => {
    await evaluate(`(function () {
      var input = document.querySelector('.ma-cloth-length input')
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '${value}')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return input.value
    })()`)
  }

  await setRange(0.55)
  await sleep(2200)
  console.log('length:', await evaluate(`(document.querySelector('.ma-cloth-length-value') || {}).textContent`))
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\cloth-mini.png', Buffer.from(s.result.data, 'base64'))
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
