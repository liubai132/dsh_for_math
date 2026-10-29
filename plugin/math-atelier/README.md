# 数学工坊 · DSH 插件

把 `F:\ai数学` 那个数学站点搬进 DSH：侧边栏一个图标，点开是一个整页面板，四个标签页——计算、序列、猜想、数字。

## 结构

```
plugin/math-atelier/
├─ package.json       # bundle 清单：dsh.bundle.patch + dsh.client
├─ cordis.patch.yml   # 插入一行插件
├─ index.js           # Host 半边：代理 /plugin/math-atelier/* 到 Python 引擎
├─ client.js          # Client 半边：侧边栏图标 + 主面板（React）
├─ locale/*.json      # 插件管理页显示的名字与描述
└─ icon.svg
```

## 它怎么跑起来

1. 面板里的请求打到同源路径 `/plugin/math-atelier/api/...`；
2. Host 半边把请求转发给 `http://127.0.0.1:8899/api/...`；
3. 如果 8899 上没有引擎，Host 会自动 `python -m app.server`（工作目录 `F:\ai数学`），
   等健康检查通过再转发；插件卸载时关掉它自己拉起的进程。

这样浏览器端不需要跨域，也不依赖你把站点单独开着。

## 配置

用环境变量（宿主进程启动时读取）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MATH_ATELIER_DIR` | `F:\ai数学` | 引擎项目目录（必须有 `app/` 和 `requirements.txt`） |
| `MATH_ATELIER_PORT` | `8899` | 引擎监听端口 |
| `MATH_ATELIER_PYTHON` | 自动 | 指定 python 可执行文件；不设则依次尝试 `python`、`py` |

## 重新安装 / 更新

```powershell
# 改了代码之后，重新装一次（同一版本号也行）
# 在 DSH 里用 plugin_manager: install_bundle target=F:\ai数学\plugin\math-atelier
```

替换已安装的包需要重启 DSH 才会加载新的前端代码；只改 Host 侧则重启进程即可。

## 已知限制

- 面板里没有加载 KaTeX（不想往宿主页面注入第三方脚本），公式先以降级为纯文本显示，
  结果是 `2*x + 1` 这种可读形式；需要排版时可以把 `result_latex` 复制到别处渲染。
- 序列分析里的 OEIS 查询需要联网；离线时会在备注里说明查询失败。
