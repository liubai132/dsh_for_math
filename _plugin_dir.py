import io

p = r'F:\ai数学\plugin\math-atelier\index.js'
s = io.open(p, encoding='utf-8').read()

s = s.replace(
    "import { spawn } from 'node:child_process'",
    "import { spawn } from 'node:child_process'\nimport { fileURLToPath } from 'node:url'\nimport { dirname } from 'node:path'",
    1,
)
s = s.replace(
    "const DEFAULT_DIR = process.env.MATH_ATELIER_DIR || 'F:\\\\ai数学'",
    "// 引擎就打包在插件目录里，跟着插件走，不依赖外部路径\nconst PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))\nconst DEFAULT_DIR = process.env.MATH_ATELIER_DIR || PLUGIN_DIR",
    1,
)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('index.js resolves its own dir')
