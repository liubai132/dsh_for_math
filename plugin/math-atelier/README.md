# 数学工坊 · DSH 插件

把数学专题搬进 DeepSeek Harness：侧边栏一个图标，点开是风铃环首页，节点通往各个专题页。

引擎（FastAPI + SymPy）随插件打包在 `app/` 里，插件启动时自动拉起，不需要单独部署。

## 结构

```
plugin/math-atelier/
├─ package.json       # bundle 清单：dsh.bundle.patch + dsh.client
├─ cordis.patch.yml   # 插入一行插件
├─ index.js           # Host 半边：代理 /plugin/math-atelier/* → Python 引擎
├─ client.js          # Client 半边：侧边栏图标 + 主面板（React，无构建）
├─ app/               # Python 引擎（随插件打包）
│  ├─ api.py
│  ├─ server.py
│  └─ engine/         # cas / numbers / interp / fold / phase / catalog …
├─ tests/             # 55 个 unittest
├─ requirements.txt
├─ locale/*.json      # 插件管理页显示的名字与描述
└─ icon.svg
```

## 它怎么跑起来

1. 面板里的请求打到同源路径 `/plugin/math-atelier/api/...`
2. Host 半边把请求转发给 `http://127.0.0.1:8899/api/...`
3. 如果 8899 上没有引擎，Host 会自动 `python -m app.server`（工作目录 = 插件目录），健康检查通过后再转发；插件卸载时关掉它自己拉起的进程

浏览器端不需要跨域，也不依赖外部目录。

## 配置

用环境变量（宿主进程启动时读取）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MATH_ATELIER_PORT` | `8899` | 引擎端口 |
| `MATH_ATELIER_DIR` | 插件自身目录 | 引擎代码所在目录 |
| `MATH_ATELIER_PYTHON` | 自动探测 | 指定 Python 可执行文件 |

## 开发

```powershell
cd plugin/math-atelier
pip install -r requirements.txt
python -m unittest discover -s tests -p "test_*.py"
node --check client.js
```
