# 架构与协同协议

## 三条设计原则

1. **零服务端**：没有服务器、没有账号、没有遥测。所有状态都在你自己的浏览器里。
2. **只读优先**：公开的 6 个脚本都不主动、不周期性发请求 —— 只在你点按钮时动作，或只读页面里已经存在的数据。
3. **写操作三闸**：任何会改动账号数据的行为，都必须同时满足「用户显式触发 + 间隔与每日上限 + 失败即停/熔断」。

## 为什么跨脚本一律走 localStorage

这是整套脚本最容易踩的坑，也是历史上最严重的一个 bug 来源：

> 油猴的 `GM_getValue` / `GM_setValue` 存储是**按脚本隔离**的（键由 `@name` + `@namespace` 决定）。
> 也就是说 `boss-chat` 用 `GM_setValue` 写的键，`boss-insight` 用 `GM_getValue` **永远读不到**，而且会被 `try/catch` 静默吞掉。

表现就是「对方原话」一直读不到、风险体检一直在扫空数据，而界面上看不出任何异常。修复方式：
**跨脚本的数据一律经过 `localStorage`（同源共享）**，油猴存储只留给「本脚本自己的设置与记录」。

副作用要知道：`localStorage` 按域名隔离，同域名下站点自己的脚本也能读到这些键。所以镜像里写了容量上限，也不放密钥。

## 数据流

```
页面 DOM / Vue 状态 ──┐
                      ├─► boss-watcher ──► bw_insight_in (localStorage) ──► boss-insight
页面接口响应 ─────────┘        │
                               ├─► bw_company_jobs / bw_job_addr ──► boss-filter（公司 / 地点黑名单）
                               └─► bw_chats_export ──► boss-chat（复盘表）

聊天页接口响应 ──► boss-chat ──► bc_chats_mirror (localStorage) ──► boss-insight（风险词扫描）

详情正文 ──► boss-filter.bwf_jd_cache (localStorage) ──► boss-consist（复用缓存，不重复抓取）

DOM 标记（data-bwf-* / data-bt-* / data-bc-* / data-bi-*）在页面内互相可见，用来表达「谁藏了哪张卡」
```

## 共享的本机键（实测自代码）

| 键 | 谁写 / 谁读 | 用途 |
| --- | --- | --- |
| `bc_chats` / `bc_chats_mirror` / `bc_chats_mirror_at` | chat → insight | 会话正文镜像（insight 判风险词的唯一来源） |
| `bw_insight_in` / `bw_insight_out` | watcher ↔ insight | 岗位快照与体检结果的交换通道 |
| `bw_company_jobs` / `bw_job_addr` | watcher → filter | 公司名与工作地点，供 filter 的黑名单匹配 |
| `bwf_jd_cache` | filter ↔ consist | 详情正文缓存（consist 复用，避免重复抓取） |
| `bwf_rules_v1` | filter ↔ tag | 规则迁移（tag 早期版本的排除类词一次性并入 filter） |
| `bw_chats_export` | watcher → chat | 监控侧数据供聊天复盘表使用 |

## 页面内的协同标记

| 标记 | 谁在用 | 含义 |
| --- | --- | --- |
| `data-bwf` / `data-bwf-hide` / `data-bwf-reason` | filter 设置，其余脚本避让 | filter 判定为要隐藏的卡片及原因 |
| `data-bt-focus` / `data-bt-hide` / `data-bt-hit` / `data-bt-reason` | tag 设置，consist / filter 避让（私有的投递脚本也会读） | 标记状态与「隐藏未命中」状态 |
| `data-bc-hide` / `data-bc-mark` / `data-bc-reason` | consist 设置，filter / tag 避让（同上） | 一致性体检的隐藏与标记 |
| `data-bi-hidden-key` | insight 设置，filter 避让（同上） | 会话体检隐藏的会话键 |

规则：**每个脚本只撤销自己设的标记**；恢复卡片显示前先看别人有没有藏它，避免互相打架把卡片放出来。

上面这些标记同时是一条**公开协议**：任何实现投递的脚本都应当读取它们，做到「你明确隐藏过的岗位不会被投」—— 这是本项目最关键的一条安全设计（私有的投递脚本就是这么做的）。

## 多标签页怎么不打架

多开标签页是这类脚本最容易出问题的地方（历史上出过「两个标签页各以为还能投 50 个、实际发出 100 个」）。现在的策略：

- **写前先读盘合并**：计数取更大值、名单取并集、删除留墓碑，避免后写的把先写的抹掉。
- **决策前重读**：涉及额度的事，每次决策重新读一次硬盘，而不是用启动那一刻的内存快照。
- **排队的写盘要能取消**：storage 事件到达时先 `clearTimeout` 掉自己排队中的写盘，避免用旧快照覆盖别人刚写的数据。

## 页面世界注入

部分数据（Vue 组件状态、页面自己发出的接口响应）在沙箱里拿不到，因此脚本会：

1. 往页面注入一段自包含的 `<script>`，钩住 `fetch` / `XMLHttpRequest`；
2. 用 `postMessage` 把结果回传沙箱；
3. 沙箱侧校验 `event.source` / `event.origin`（防页面上的第三方内容伪造数据驱动写操作）。

## 测试策略

- `tests/test_core.js` 等纯 Node 用例覆盖纯函数（文本归一、CSV 转义、响应分类、时间解析…）。
- Playwright 用例用 `page.route` **拦截并伪造**站点响应，配合本地 mock 页面跑脚本 UI —— **不打真实站点**，所以 CI 能跑，也不会给站方造成压力。
- 站点改版导致失效时，正确做法是「把新结构补进 mock」，而不是「连真站跑测试」。

## 已知取舍

| 取舍 | 说明 |
| --- | --- |
| 选择器分散在各脚本，未抽公共模块 | 减少跨脚本耦合，代价是站点改版要改多处（排查步骤见 CONTRIBUTING） |
| 用 localStorage 做跨脚本通道 | 同源可读（含站点自己的脚本），所以镜像有容量上限、不放密钥 |
| 不自动翻页 / 不批量抓全站 | 主动控制请求量，降低对站方与账号的风险 |

## GM 兼容适配层（boss-chat v1.5.10 / watcher v0.9.6 / insight v0.5.9 起）

脚本原先默认跑在篡改猴里。适配层把「管理器」变成可替换件：**有管理器就用管理器，没有就自己补**。

| 文件 | 作用 |
| --- | --- |
| `tools/gm-compat.js` | **唯一事实来源**：探测 `GM_*` 是否存在 → 缺哪个补哪个（存储 → localStorage、同源请求 → fetch、菜单 → 页面内 ⚙、样式 → style 标签），并提供 `__bossCompat.envReport()` 与「🔍 环境自检」菜单项 |
| `tools/inline-compat.cjs` | 把上面那段**内联**进 `boss-chat / boss-watcher / boss-insight` 的 IIFE 开头（幂等；`--check` 只校验、不改文件） |
| `tests/test_compat.cjs` | 两条路都测：有管理器（走 GM、不碰 localStorage）、没有管理器（降级正确、跨域明确报错），并校验各脚本内联的就是最新那段（防漂移） |

**维护规则（重要）**

1. 改兼容逻辑**只改 `tools/gm-compat.js`**，然后跑 `node tools/inline-compat.cjs` 重新内联；
2. 不要在各脚本里再写第二套 `GM_*` 兜底 —— 会漂移；
3. 提 PR 前跑 `npm run check`：其中 `check:compat` 会在「脚本里的兼容层与单一来源不一致」时直接失败；
4. 新增需要兼容层的脚本，把文件名加进 `tools/inline-compat.cjs` 的 `TARGETS`。

**为什么内联而不是 `@require`**：`@require` 会在安装/更新时多一次网络请求，国内不稳、离线装不了；内联让每个 `.user.js` 保持自包含（也满足「复制粘贴就能装」的兜底路径）。

**代价**：兼容层随每个脚本各发布一份（约 8 KB × 4），且只覆盖「实际用到的那些 API」—— 新增 GM API 时需同步补进 `gm-compat.js`。
