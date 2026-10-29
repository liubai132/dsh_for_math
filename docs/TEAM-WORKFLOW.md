# 团队开发流程

这份文档面向所有参与 `dsh_for_math` 的人：从装环境到发版，一步步照着做即可。

---

## 1. 角色与权限

| 角色 | 谁 | 能做什么 |
|---|---|---|
| Owner | 仓库创建者 | 改仓库设置、加协作者、合并 PR |
| Collaborator（Write） | 长期贡献者 | 推分支、开 PR（**不能直接推 main**） |
| 外部贡献者 | 任何人 | fork → 改 → 提 PR，等你合并 |

**陌生人不需要被任命。** 他们 fork 之后提 PR，能不能合由 Owner 决定。

---

## 2. 环境搭建（每人一次）

前置：

- [DSH](https://github.com/deepseek-ai)（能装插件）
- Python 3.10+
- Git

```powershell
# 1. 克隆
git clone https://github.com/liubai132/dsh_for_math.git
cd dsh_for_math

# 2. 装引擎依赖
pip install -r plugin/math-atelier/requirements-dev.txt

# 3. 装插件（路径指向克隆下来的插件目录）
#    在 DSH 里执行：
#    plugin_manager install_bundle  →  <克隆路径>\plugin\math-atelier

# 4. 重启 DSH
```

重启后侧边栏出现「数学工坊」，点开能进首页就说明环境 OK。

> **为什么要重启**：客户端代码（`client.js`）是 DSH 启动时加载的，只刷新页面不够。

---

## 3. 日常开发流程

### 3.1 永远在分支上改

```powershell
git switch main
git pull
git switch -c feat/your-thing
```

### 3.2 改完先本地验证

```powershell
cd plugin/math-atelier

# 测试（必须全过）
python -m unittest discover -s tests -p "test_*.py"

# 语法
node --check client.js
node --check index.js

# 手动看一眼
python -m app.server        # 只起引擎，改完刷新面板即可
```

**改面板代码后**：重启 DSH → 看面板左上角版本号是不是变了。

### 3.3 提交并推分支

```powershell
git add -A
git commit -m "phase: 加数值积分演示"
git push -u origin feat/your-thing
```

提交信息格式：`模块: 做了什么`，例如 `phase: 加鞍点分类测试`、`ui: 首页节点加标签`。

### 3.4 开 PR

GitHub 上点 **Compare & pull request**，按模板填：

- 做了什么
- 为什么（`Closes #12`）
- 怎么验证
- 影响范围（有没有改已有行为）
- 自查清单

### 3.5 等 CI

PR 底部会出现两个检查：

```
✅ engine tests
✅ plugin syntax
```

红了就修，改完继续 push 到**同一个分支**，PR 自动更新。

### 3.6 Review

Owner 会留评论、要求修改或批准。改完继续 push，不要 force push。

### 3.7 合并与同步

Owner 点 **Squash and merge**，然后：

```powershell
git switch main
git pull
git branch -d feat/your-thing
```

---

## 4. 大改动怎么走

| 规模 | 流程 |
|---|---|
| 文案、测试、小 bug | 直接提 PR |
| 新函数、新专题、新演示 | 先开 issue 说明，再提 PR |
| 动架构（拆模块、换算法、改接口） | 先写 design note（issue 里 300 字：现状 / 方案 / 影响面） |
| 重构 + 功能 | 拆成两个 PR：先重构（行为不变），再功能 |

硬性要求：

- 单个 PR 超过约 400 行 → 在描述里给阅读顺序，或者拆开
- 行为不变的重构 → 必须已有测试覆盖，PR 里注明“测试没改、全过”
- 不允许自我合并

---

## 5. 接手别人的 PR

### 情况 A：方向对，细节差 → 让他改

留具体意见（指出文件和行号），不要只说“不太好”。

### 情况 B：他改不动了 → 你在他的分支上补

```powershell
git fetch origin feat/xxx
git switch feat/xxx
# 改
git commit -m "phase: 修边界条件（接手补充）"
git push
```

PR 还是他的，代码你补完。合并时在描述里注明。

### 情况 C：只要一部分 → cherry-pick

```powershell
git switch -c feat/takeover main
git cherry-pick <commit>
```

关掉原 PR 并说明采用了哪些部分。

### 情况 D：方向不对 → 关闭并重做

PR 里写清楚原因，指出会参考他哪部分。**不要静默关闭。**

---

## 6. 发布

```powershell
# 1. 改版本号（两处保持一致）
#    plugin/math-atelier/package.json 的 version
#    client.js 里的 CLOTH_BUILD（面板上会显示）

# 2. 提交
git add -A
git commit -m "release: v2.3.1"
git push

# 3. 打标签
git tag -a v2.3.1 -m "修复：xxx"
git push origin v2.3.1

# 4. 在 GitHub 上 Create release，选这个标签，写更新说明
```

版本号规则：

- `2.3.0 → 2.3.1`：修 bug
- `2.3.1 → 2.4.0`：加功能
- `2.4.0 → 3.0.0`：改接口 / 破坏性变更

---

## 7. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 面板里版本号没变 | client 包没重新加载 | 重启 DSH |
| 「引擎离线」 | Python 依赖没装 / 端口被占 | `pip install -r requirements.txt`，`MATH_PORT` 换端口 |
| 改完引擎没生效 | 旧进程还在跑 | 杀 `python` 进程，插件会重新拉起 |
| 面板黑屏 | 组件渲染抛异常 | 看 DSH 控制台报错，先 `git stash` 回退再定位 |
| `git push` 被拒 | 分支保护 | 推分支开 PR，不要直推 main |
| PR 里 CI 一直红 | 本地没跑测试 | 本地先跑三条命令 |

---

## 8. 速查卡

```powershell
# 开始一天
git switch main && git pull
git switch -c feat/xxx

# 本地验证
cd plugin/math-atelier
python -m unittest discover -s tests -p "test_*.py"
node --check client.js && node --check index.js

# 提交
git add -A && git commit -m "模块: 做了什么"

# 推分支（不是 main）
git push -u origin feat/xxx

# 合并后
git switch main && git pull && git branch -d feat/xxx
```

---

## 9. 几条底线

1. **不在 main 上直接改**，除非是改错别字这种一句话的小事（而且有保护也推不上去）
2. **CI 不过不合并**
3. **大改动先讨论**，别写完了才问行不行
4. **别人的 PR 要回应**，哪怕只是“先放着，我这周看”
5. **合并前自己跑一遍测试**，不要只信 CI 的绿勾
