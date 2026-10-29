/**
 * 数学工坊 —— Host 半边。
 *
 * 职责只有两件：
 * 1. 保证 Python 引擎（FastAPI + SymPy）在跑：已经在线就复用，没在线就拉起来；
 * 2. 把 /plugin/math-atelier/* 同源转发到引擎的 /api/*，这样浏览器端不用跨域。
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

export const inject = ['webServer']

const ROUTE = '/plugin/math-atelier'
// 引擎就打包在插件目录里，跟着插件走，不依赖外部路径
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = process.env.MATH_ATELIER_DIR || PLUGIN_DIR
const DEFAULT_PORT = Number(process.env.MATH_ATELIER_PORT || 8899)
const HEALTH_TIMEOUT = 800

export function apply(ctx, config = {}) {
  const port = Number(config.port || DEFAULT_PORT)
  const projectDir = config.projectDir || DEFAULT_DIR
  const candidates = config.python
    ? [String(config.python)]
    : ['python', 'py']
  const base = `http://127.0.0.1:${port}`

  let child = null
  let starting = null
  let lastError = ''
  let owned = false

  async function healthy() {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT)
      const response = await fetch(`${base}/api/health`, { signal: controller.signal })
      clearTimeout(timer)
      return response.ok
    } catch {
      return false
    }
  }

  function launch(command) {
    const argv = command === 'py' ? ['-3', '-m', 'app.server'] : ['-m', 'app.server']
    const proc = spawn(command, argv, {
      cwd: projectDir,
      env: {
        ...process.env,
        MATH_PORT: String(port),
        MATH_HOST: '127.0.0.1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: projectDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    proc.stdout?.on('data', () => {})
    proc.stderr?.on('data', (chunk) => {
      lastError = String(chunk).trim().slice(-500)
    })
    proc.on('error', (error) => {
      lastError = String(error?.message || error)
    })
    proc.on('exit', () => {
      if (child === proc) {
        child = null
        owned = false
      }
    })
    return proc
  }

  async function ensureBackend() {
    if (await healthy()) return true
    if (starting) return starting

    starting = (async () => {
      for (const command of candidates) {
        lastError = ''
        child = launch(command)
        owned = true
        const deadline = Date.now() + 15000
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 300))
          if (await healthy()) return true
          if (child === null) break // 进程退出了，换下一个候选
        }
        try {
          child?.kill()
        } catch {
          /* 忽略 */
        }
        child = null
      }
      return false
    })()

    try {
      return await starting
    } finally {
      starting = null
    }
  }

  async function readBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return chunks.length ? Buffer.concat(chunks) : undefined
  }

  function sendJson(res, status, payload) {
    const text = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(text)
  }

  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      let url
      try {
        url = new URL(req.url || '/', 'http://127.0.0.1')
      } catch {
        sendJson(res, 400, { detail: '无效的请求地址' })
        return
      }

      const suffix = url.pathname.slice(ROUTE.length) || '/'

      if (suffix === '/status') {
        const online = await healthy()
        sendJson(res, 200, {
          ok: online || Boolean(child),
          backend: online ? 'running' : child ? 'starting' : 'stopped',
          port,
          projectDir,
          owned,
          error: lastError,
        })
        return
      }

      const online = await ensureBackend()
      if (!online) {
        sendJson(res, 503, {
          detail:
            '数学引擎没能启动。请确认已安装 Python 与依赖（pip install -r requirements.txt），' +
            '或在插件配置里改 python / projectDir。',
          error: lastError,
          projectDir,
        })
        return
      }

      try {
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
        const upstream = await fetch(`${base}${suffix}${url.search}`, {
          method: req.method,
          headers: { 'content-type': req.headers['content-type'] || 'application/json' },
          body,
        })
        const text = await upstream.text()
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(text)
      } catch (error) {
        sendJson(res, 502, { detail: `转发失败：${error?.message || error}` })
      }
    },
  })

  ctx.effect(() => {
    return () => {
      disposeRoute()
      if (owned && child) {
        try {
          child.kill()
        } catch {
          /* 忽略 */
        }
        child = null
      }
    }
  })
}
