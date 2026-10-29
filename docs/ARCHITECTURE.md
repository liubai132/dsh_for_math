# 架构

三块东西，边界清楚：

```
web/  ──HTTP──▶  app/  ◀──HTTP──  plugin/
浏览器页面      数学引擎           DSH 面板
```

## 1. 引擎（`app/`）

FastAPI 应用，`api.py` 只有一个职责：把 HTTP 请求翻译成引擎函数调用。

```
app/api.py            路由 + Pydantic 模型
app/server.py         启动、托管 web/ 静态文件
app/engine/
  cas.py              符号计算（SymPy）
  numbers.py          数论（整数分解、数论函数）
  research.py         区间扫描
  constants.py        高精度常数（mpmath）
  interp.py           插值与轨迹
  shapes.py           衣服轮廓（用 interp 的重采样）
  fold.py             平面折叠（等距条件）
  phase.py            相图（向量场 / 轨线 / 平衡点）
  catalog.py          函数目录：内省模块，自动生成
  safety.py           输入安全检查
```

### 函数目录是自动的

`catalog.py` 用 `inspect` 遍历模块的公开函数，取签名和 docstring 第一行。所以：

- 新函数只要写 docstring，就会出现在数学库里
- **不要**维护第二份函数清单

### 新增函数的契约

```python
def something(x: float, n: int = 10) -> dict:
    """一句话说明它做什么。"""
    return {"ok": True, ...}
```

- 成功返回 `dict`，带 `"ok": True`
- 失败抛 `ValueError` / `KeyError`，路由层统一转 4xx
- 结果里的浮点数四舍五入到 6 位，前端不再二次处理

## 2. 网站（`web/`）

无构建步骤的原生 JavaScript。每个页面一个 `.js`，共享 `common.js`（导航、请求、KaTeX 渲染）。

## 3. 插件（`plugin/math-atelier/`）

### 两半

| 文件 | 运行位置 | 职责 |
|---|---|---|
| `index.js` | 宿主（Node） | 注册 `/plugin/math-atelier/*` 路由，代理到引擎，负责拉起引擎进程 |
| `client.js` | 浏览器 | 面板 UI：风铃环首页、专题页、拓展演示 |

### 面板结构

```
Panel
├─ 顶部：标题 + 引擎状态
└─ HomeScene（风铃环）
   └─ 点击节点 → 专题页（ConvexPage 的泛化版本）
      ├─ 左侧环形目录（拖拽 / 滚轮切换）
      └─ 右侧文档
         └─ 拓展块（可选）：交互演示
```

### 专题是数据

```js
const PAGES = [{
  id, num, label, title, lead,
  formulas: [['名字', '公式']],
  bullets: [...],
  extensions: [{ type, tag, title, desc, uses }],
  note,
}]
```

`type` 决定渲染哪个组件（`interp` / `morph` / `cloth` / `phase`），组件在 `Extension` 里按 `type` 分发。

### 函数标签

文档里的函数用 `FunctionTag` 标注：

```js
h(FunctionTag, { id: 'phase.portrait' })
```

点击会打开数学库整页并定位到该函数。id 与引擎里的 `模块.函数名` 对应。

## 4. 拓展点

| 想加什么 | 改哪里 |
|---|---|
| 新的数学函数 | `app/engine/*.py` + `tests/` |
| 新的 HTTP 接口 | `app/api.py` |
| 新的专题 | `client.js` 里的 `PAGES` + `RING_NODES` |
| 新的交互演示 | `client.js` 写组件 + `extensions.type` 分发 |
| 网站新页面 | `web/` + `app/server.py` 的静态路由 |

## 5. 已知边界

- `client.js` 目前是单文件（约 4600 行），下一步拆成 `cloth.js` / `page.js` / `home.js`
- 布料模拟在 CPU 上跑，3000+ 粒子约 30fps
- 没有自碰撞，布料层之间可能穿插
- 插件依赖 DSH 的面板槽位，不能单独作为网页运行
