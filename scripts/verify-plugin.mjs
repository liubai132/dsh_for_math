// 用 Chrome DevTools Protocol 打开 Harness Web GUI，点开「数学工坊」面板并截图。
// 用法：node scripts/verify-plugin.mjs
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL_APP = 'http://127.0.0.1:10115'
const OUT = 'F:\\ai数学\\.shots\\plugin-panel.png'
const PORT = 9333

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=F:\\ai数学\\.chrome-verify',
    '--window-size=1440,960',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let nextId = 0
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (reply.result?.exceptionDetails) {
    return { error: reply.result.exceptionDetails.text }
  }
  return reply.result?.result?.value
}

try {
  await sleep(2500)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('没有找到页面目标')

  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: URL_APP })
  await sleep(6000)

  const title = await evaluate('document.title')
  console.log('页面标题:', title)

  const clicked = await evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'))
    const hit = nodes.find((el) => {
      const text = ((el.getAttribute('aria-label') || '') + ' ' + (el.title || '') + ' ' + (el.textContent || ''))
      return text.includes('数学工坊')
    })
    if (!hit) return 'not-found'
    hit.click()
    return 'clicked:' + ((hit.getAttribute('aria-label') || hit.textContent || '').trim().slice(0, 40))
  })()`)
  console.log('侧边栏点击:', clicked)

  await sleep(2500)

  const panel = await evaluate(`(() => {
    const root = document.querySelector('.ma-root')
    if (!root) return { found: false }
    return {
      found: true,
      title: root.querySelector('.ma-title')?.textContent,
      tabs: Array.from(root.querySelectorAll('.ma-tab')).map((t) => t.textContent),
      status: root.querySelector('.ma-status-chip')?.textContent,
      html: root.innerText.slice(0, 200),
    }
  })()`)
  console.log('面板:', JSON.stringify(panel))

  if (panel && panel.found) {
    // 试跑一次「计算」页的第一个示例
    const ran = await evaluate(`(async () => {
      const root = document.querySelector('.ma-root')
      const textarea = root.querySelector('textarea')
      if (!textarea) return 'no-textarea'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(textarea, '(x+1)^2 - x^2')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === '计算')
      if (!btn) return 'no-button'
      btn.click()
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250))
        const math = root.querySelector('.ma-math')
        if (math && math.textContent.trim()) return 'result:' + math.textContent.trim().slice(0, 60)
      }
      return 'timeout'
    })()`)
    console.log('计算测试:', ran)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  mkdirSync('F:\\ai数学\\.shots', { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
  console.log('截图已保存:', OUT)
} catch (error) {
  console.error('验证失败:', error.message)
  process.exitCode = 1
} finally {
  try {
    ws?.close()
  } catch {
    /* 忽略 */
  }
  chrome.kill()
}
