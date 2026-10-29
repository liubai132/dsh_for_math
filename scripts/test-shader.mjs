// 在页面里直接测试着色器编译，拿到真实报错
import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9666
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-shader',
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
  await sleep(2000)

  const result = await send('Runtime.evaluate', {
    expression: `(function () {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      if (!gl) return 'no webgl'
      const ext = gl.getExtension('OES_standard_derivatives')
      const src = [
        '#extension GL_OES_standard_derivatives : enable',
        'precision mediump float;',
        'varying vec3 vWorld;',
        'void main() {',
        '  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));',
        '  gl_FragColor = vec4(n, 1.0);',
        '}',
      ].join('\\n')
      const shader = gl.createShader(gl.FRAGMENT_SHADER)
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      return JSON.stringify({
        hasExtension: !!ext,
        compiled: gl.getShaderParameter(shader, gl.COMPILE_STATUS),
        log: gl.getShaderInfoLog(shader),
      })
    })()`,
    returnByValue: true,
  })
  console.log(result.result?.result?.value ?? JSON.stringify(result.result?.exceptionDetails))
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
