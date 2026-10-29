// 检查每个节点按钮的实际计算样式，找出为什么有的看不见
import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9511
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-check',
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
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3500)

  const report = await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.ma-node')).map(function (n, i) {
    var dot = n.querySelector('.ma-node-dot')
    var cs = getComputedStyle(dot)
    var box = n.getBoundingClientRect()
    var hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return {
      i: i,
      z: n.style.zIndex,
      op: n.style.opacity,
      rect: [Math.round(box.x), Math.round(box.y), Math.round(box.width)],
      bg: cs.backgroundColor,
      border: cs.borderColor,
      shadow: cs.boxShadow.slice(0, 40),
      visible: cs.visibility,
      hit: hit ? (hit.className || hit.tagName) : null
    }
  }))`)
  const list = JSON.parse(report)
  for (const item of list) console.log(JSON.stringify(item))
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
