# 数学工坊 · Math Atelier

一个**本地运行**的数学科普 + 数学研究工具集，包含三部分：

| 部分 | 是什么 | 谁可以用 |
|---|---|---|
| `web/` | 独立数学网站（浏览器打开即用） | 任何人 |
| `app/` | 数学引擎（FastAPI + SymPy + mpmath） | 任何人（HTTP API） |
| `plugin/` | DeepSeek Harness 插件（面板 + 风铃环首页 + 专题页） | 装了 DSH 的人 |

数学引擎负责算，网站和插件负责讲和看。

---

## 功能

### 数学引擎

- **符号计算**：化简、展开、因式分解、解方程、求导、积分、极限、级数、矩阵、函数图像，结果直接给 LaTeX
- **数论实验**：质因数分解、约数结构、数论函数（φ、μ、σ、τ、rad）、连分数、科拉茨轨迹、进制写法
- **区间扫描**：素数密度与最大间隙、科拉茨步数冠军、约数最多的数、完美数
- **常数**：π、e、φ、γ、ζ(3) 等算到 2000 位，附数字频率分布
- **插值与轨迹**：线性/圆弧/贝塞尔/波动/螺旋插值，等弧长参数化，形状 morph
- **折叠几何**：平面纸带按 2:1 打点折成裙摆，解折痕深度与张力
- **相图**：向量场、轨线、平衡点、按迹/行列式的稳定性分类

### 网站（`web/`）

首页、引擎、数字实验室、研究工具、科普文章、自测页。原生 JavaScript + KaTeX，没有构建步骤。

### DSH 插件（`plugin/math-atelier`）

- 风铃环首页：五个节点挂在环上，拖拽换视角，点击进入专题
- 专题页：左侧环形目录 + 右侧文档，每个专题若干节
- 已有专题：**凸优化**（含插值、CG 变形、PBD 布料三块交互拓展）、**数值分析**（常微分方程、相图）

---

## 快速开始

### 只跑网站 + 引擎

```powershell
pip install -r requirements.txt
python -m app.server
```

打开 <http://127.0.0.1:8899>。换端口：`$env:MATH_PORT=9000`。

### 装成 DSH 插件

需要先装 [DeepSeek Harness](https://github.com/deepseek-ai)（本插件依赖它的面板槽位和 Web 服务）。

```text
plugin_manager install_bundle  →  F:\ai数学\plugin\math-atelier
```

插件会自动拉起引擎（`python -m app.server`，端口 8899）；已经有一个健康的引擎就复用。

---

## 目录结构

```
.
├─ app/                  数学引擎
│  ├─ api.py             全部 HTTP 路由
│  ├─ server.py          FastAPI 入口（同时托管 web/）
│  └─ engine/
│     ├─ cas.py          符号计算
│     ├─ numbers.py      数论
│     ├─ research.py     区间扫描
│     ├─ constants.py    高精度常数
│     ├─ interp.py       插值 / 轨迹 / 等弧长
│     ├─ shapes.py       衣服轮廓与 morph
│     ├─ fold.py         平面折叠与张力
│     ├─ phase.py        相图
│     └─ catalog.py      函数目录（自动从模块内省）
├─ web/                  独立网站
├─ plugin/math-atelier/  DSH 插件
│  ├─ index.js           宿主侧：代理 /plugin/math-atelier → 引擎
│  ├─ client.js          面板 UI（风铃环、专题页、拓展演示）
│  └─ cordis.patch.yml   挂载面板
├─ tests/                unittest（55 个）
├─ docs/                 设计与数学说明
└─ scripts/              截图 / 预览 / 调试脚本
```

---

## 开发

```powershell
# 测试
python -m unittest discover -s tests -p "test_*.py"

# 插件语法检查
node --check plugin/math-atelier/client.js
node --check plugin/math-atelier/index.js

# 只跑引擎（热重载）
python -m app.server
```

### 加一个数学函数

1. 在 `app/engine/` 里写函数，第一行写 docstring（会变成目录里的简介）
2. 注册模块到 `catalog.py` 的 `MODULES` 与 `MODULE_TITLES`
3. 需要 HTTP 访问就在 `api.py` 加路由
4. 在 `tests/` 补用例
5. 前端用 `FunctionTag` 引用它：`interp.trajectory` 这样的 id 会自动出现在数学库

### 加一个专题

1. 在 `client.js` 里加一份 `PAGES` 数据（`id / num / label / title / lead / formulas / bullets`）
2. 加到 `RING_NODES` 的某个节点上
3. 需要交互就在 `extensions` 里挂一个组件

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 协作

欢迎参与。分工建议见 [CONTRIBUTING.md](CONTRIBUTING.md)：

- **数学内容**：写新的专题、补公式与直觉解释
- **引擎**：算法、数值稳定性、性能
- **前端**：面板 UI、可视化、交互
- **插件/基建**：DSH 适配、CI、发布

提交前请跑一遍测试与语法检查，PR 描述里写清楚「改了什么、为什么、怎么验证」。

---

## 路线图

- [ ] 数值分析：数值积分、线性方程组、特征值（已有相图与 ODE）
- [ ] 凸优化：对偶、KKT 的交互示例
- [ ] 布料：阴影与自碰撞，让裙子更真实
- [ ] 引擎：把 `client.js` 拆成模块，布料独立成包
- [ ] 内容：每篇科普配一个可操作的演示

---

## 许可

MIT，见 [LICENSE](LICENSE)。
