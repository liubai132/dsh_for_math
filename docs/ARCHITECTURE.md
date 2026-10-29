# 架构

插件是两半 + 一个随身引擎：

```
DSH 宿主
└─ index.js  ──注册路由 /plugin/math-atelier──▶ 浏览器 client.js
              │
              └─ 拉起 / 复用 ──▶ app/（Python 引擎，随插件打包）
```

## 1. 宿主半边（`index.js`）

职责只有两件：

1. **保证引擎在跑**：`python -m app.server`，已在线就复用，没在线就拉起来
2. **同源转发**：`/plugin/math-atelier/*` → `127.0.0.1:8899/api/*`，浏览器端不用处理跨域

引擎目录由 `import.meta.url` 算出来（就是插件自己），所以插件放哪儿都能跑。

## 2. 面板（`client.js`）

```
Panel
├─ 顶部：标题 + 引擎状态
└─ HomeScene（风铃环）
   └─ 点击节点 → 专题页
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

`type` 决定渲染哪个组件（`interp` / `morph` / `cloth` / `phase`），在 `Extension` 里按 `type` 分发。

### 函数标签

文档里的函数用 `FunctionTag` 标注：

```js
h(FunctionTag, { id: 'phase.portrait' })
```

点击打开数学库并定位到该函数；id 与引擎里的 `模块.函数名` 对应。

## 3. 引擎（`app/`）

```
app/api.py            路由 + Pydantic 模型
app/server.py         启动、可选托管静态目录
app/engine/
  cas.py              符号计算（SymPy）
  numbers.py          数论
  research.py         区间扫描
  constants.py        高精度常数（mpmath）
  interp.py           插值与轨迹
  shapes.py           衣服轮廓（用 interp 的重采样）
  fold.py             平面折叠（等距条件）
  phase.py            相图（向量场 / 轨线 / 平衡点）
  catalog.py          函数目录：内省模块，自动生成
  safety.py           输入安全检查
```

**函数目录是自动的**：`catalog.py` 用 `inspect` 遍历公开函数，取签名和 docstring 第一行，所以新函数只要写 docstring 就会出现在数学库里，不要维护第二份清单。

### 函数契约

```python
def something(x: float, n: int = 10) -> dict:
    """一句话说明它做什么。"""
    return {"ok": True, ...}
```

- 成功返回 `dict`，带 `"ok": True`
- 失败抛 `ValueError` / `KeyError`，路由层统一转 4xx
- 浮点数四舍五入到 6 位

## 4. 拓展点

| 想加什么 | 改哪里 |
|---|---|
| 新的数学函数 | `app/engine/*.py` + `tests/` |
| 新的 HTTP 接口 | `app/api.py` |
| 新的专题 | `client.js` 里的 `PAGES` + `RING_NODES` |
| 新的交互演示 | `client.js` 写组件 + `extensions.type` 分发 |

## 5. 已知边界

- `client.js` 目前是单文件（约 4600 行），下一步拆成 `cloth.js` / `page.js` / `home.js`
- 布料模拟在 CPU 上跑，3000+ 粒子约 30fps
- 没有自碰撞，布料层之间可能穿插
- 依赖 DSH 的面板槽位，不能单独当网页跑
