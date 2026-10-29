// 验收新版：左侧竖环（当前节点居中）+ 点击进入右侧暗色页
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9521
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-rail',
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
const clickNode = async (index) => {
  const box = JSON.parse(
    await evaluate(`JSON.stringify((function () {
      var rect = document.querySelectorAll('.ma-node')[${index}].getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })())`),
  )
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  return box
}

try {
  await sleep(2200)
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
  await sleep(4000)

  console.log('layout:', await evaluate(`JSON.stringify({
    rail: !!document.querySelector('.ma-rail'),
    stage: !!document.querySelector('.ma-stage'),
    nodes: document.querySelectorAll('.ma-node').length,
    active: (document.querySelector('.ma-node[data-active="true"]') || {}).getAttribute && document.querySelector('.ma-node[data-active="true"]').getAttribute('aria-label')
  })`))

  await shot('rail-initial')

  const box = await clickNode(0)
  await sleep(700)
  console.log('opened:', await evaluate(`JSON.stringify({
    dark: !!document.querySelector('.ma-dark'),
    title: (document.querySelector('.ma-dark-title') || {}).textContent,
    focus: (document.activeElement && document.activeElement.className) || ''
  })`))
  await shot('rail-open')

  await evaluate(`document.querySelector('.ma-dark-back').click()`)
  await sleep(500)
  console.log('closed:', await evaluate(`!document.querySelector('.ma-dark')`))

  // 拖环，看当前节点是否换到中间
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 150, y: 420, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 420 + i * 15, button: 'left', buttons: 1 })
    await sleep(30)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 150, y: 540, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(900)
  console.log('after drag active:', await evaluate(`(document.querySelector('.ma-node[data-active="true"]') || {}).getAttribute && document.querySelector('.ma-node[data-active="true"]').getAttribute('aria-label')`))
  await shot('rail-rotated')
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
