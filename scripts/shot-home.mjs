// 风铃环主页 + 凸优化页
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9544
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-chime',
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\' + name + '.png', Buffer.from(s.result.data, 'base64'))
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

  console.log('scene:', await evaluate(`JSON.stringify({
    nodes: document.querySelectorAll('.ma-node').length,
    canvas: !!document.querySelector('.ma-ring-canvas'),
    hint: (document.querySelector('.ma-hint-drag') || {}).textContent || ''
  })`))
  await shot('chime-line')

  const box = JSON.parse(
    await evaluate(`JSON.stringify((function () {
      var rect = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })())`),
  )
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(900)
  console.log('page:', await evaluate(`JSON.stringify({
    dark: !!document.querySelector('.ma-dark'),
    title: (document.querySelector('.ma-doc-title') || {}).textContent,
    sections: document.querySelectorAll('.ma-doc-section').length
  })`))
  await shot('chime-page')

  // 点左侧「凸函数」，看是否切到新界面
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸函数') }).click()`)
  await sleep(600)
  console.log('section:', await evaluate(`JSON.stringify({
    crumb: (document.querySelector('.ma-dark-crumb') || {}).textContent,
    title: (document.querySelector('.ma-doc-title') || {}).textContent,
    active: (document.querySelector('.ma-wheel-item[data-active="true"]') || {}).textContent
  })`))
  await shot('chime-section')

  // 在左侧环上拖动，测试是否切到下一节
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 430, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 120, y: 430 - i * 14, button: 'left', buttons: 1 })
    await sleep(25)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 120, y: 430 - 8 * 14, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(700)
  console.log('after wheel drag:', await evaluate(`JSON.stringify({
    crumb: (document.querySelector('.ma-dark-crumb') || {}).textContent,
    title: (document.querySelector('.ma-doc-title') || {}).textContent
  })`))
  await shot('chime-dragged')

  await evaluate(`document.querySelector('.ma-dark-back').click()`)
  await sleep(600)

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 380, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 380 + i * 16, button: 'left', buttons: 1 })
    await sleep(30)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 540, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(900)
  await shot('chime-ring')
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
