// 数学库标签页 + 从页面里点函数跳转
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9577
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-lib',
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

  console.log('tabs:', await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.ma-tab')).map(function (t) { return t.textContent }))`))

  // 打开数学库标签
  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '数学库' }).click()`)
  await sleep(800)
  console.log('library:', await evaluate(`JSON.stringify({
    rows: document.querySelectorAll('.ma-lib-row').length,
    meta: (document.querySelector('.ma-lib-meta') || {}).textContent
  })`))
  await shot('lib-page')

  // 回到首页，进凸优化 → 凸集，点函数标签
  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '首页' }).click()`)
  await sleep(600)
  const box = JSON.parse(
    await evaluate(`JSON.stringify((function () {
      var rect = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })())`),
  )
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(700)
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸集') }).click()`)
  await sleep(700)
  console.log('tags:', await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.ma-fn')).map(function (t) { return t.textContent }))`))

  await evaluate(`document.querySelectorAll('.ma-fn')[0].click()`)
  await sleep(900)
  console.log('jump:', await evaluate(`JSON.stringify({
    tab: (document.querySelector('.ma-tab-active') || {}).textContent,
    target: (document.querySelector('.ma-fn-target .ma-lib-name') || {}).textContent
  })`))
  await shot('lib-jump')

  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
