# 安装与升级

## 你需要什么

- 浏览器：Chrome / Edge / Firefox 桌面版均可
- 用户脚本管理器：**篡改猴 Tampermonkey / 暴力猴 Violentmonkey / 脚本猫 ScriptCat 任选一个**（v1.5.10 起三者都实测可用，Firefox 同理）
- 或者**完全不用管理器**：脚本自带兼容层，直接注入页面也能跑（代价见下方「不用管理器行不行」）
- 一个招聘网站账号 —— **建议单独用求职专用账号**（理由见 [risk-and-safety.md](risk-and-safety.md)）

## 装哪几个

六个脚本互相独立，可以只装你需要的。推荐从 `boss-filter` 开始，用顺了再加。

| 脚本 | 安装 | 装它的理由 |
| --- | --- | --- |
| 页面过滤 | [boss-filter.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-filter.user.js) | 先把噪音挡掉，后面所有脚本都受益 |
| 命中打标签 | [boss-tag.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-tag.user.js) | 只标记不隐藏，适合先观察 |
| 岗位监控 | [boss-watcher.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-watcher.user.js) | 盯住心仪岗位的变化 |
| 聊天助手 | [boss-chat.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-chat.user.js) | 会话归档 + 复盘导出 |
| 会话体检 | [boss-insight.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-insight.user.js) | 风险词扫描 + 一键处置 |
| 一致性体检 | [boss-consist.user.js](https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-consist.user.js) | 卡片与正文矛盾 |
> **第 7 个脚本（一键投递）不在本仓库分发**：`boss-deliver` 是唯一会写账号、也是唯一会替你发消息的脚本 —— 公开版只保留不代你操作账号的只读脚本。前 6 个脚本不依赖它，缺了它照常使用。如果你已经拿到 `boss-deliver.user.js`，按下面同样的方式装（它没有公开的 `@updateURL`，更新靠手动替换文件）。

## 第一次安装

1. 点上面的安装链接，篡改猴会弹出安装页 → 点「安装」。
2. 打开职位列表页，例如 `https://www.zhipin.com/web/geek/job?query=后端`。
3. 按 `Ctrl+Shift+R` **强刷**一次（页面里如果已经注入过旧版，普通刷新不会替换）。
4. 左下角应出现状态条（`boss-filter` / `boss-tag`），右下角出现悬浮球（💼 监控 / 💬 聊天 / 🩺 体检）。装了私有的投递脚本还会多一个 📤。

## 怎么确认装对了

- **看面板版本号**：各面板标题或悬浮球提示里会写 `vX.Y.Z`，跟仓库里脚本头部的 `@version` 对一下。
- **看自检提示**：如果页面上明明有岗位卡片、状态条却显示「已过滤 0 / 共 0」，`boss-filter` 会给出自检提示 —— 那说明选择器过期，请开 issue。

## 国内网络：装管理器与拿脚本

**装管理器**（三选一，都不必翻墙）：

| 浏览器 | 推荐来源 | 说明 |
| --- | --- | --- |
| Edge | Microsoft Edge 加载项商店搜 Tampermonkey / Violentmonkey / ScriptCat | 国内直连可访问（实测 200） |
| Chrome 及其它 | [脚本猫官网](https://scriptcat.org/) 或 [篡改猴官网](https://www.tampermonkey.net/) 下载 CRX / 源码后，用「开发者模式 → 加载已解压的扩展程序」装载 | Chrome 应用商店在国内需要代理；离线装载不影响功能 |
| Firefox | Firefox 附加组件商店搜 Tampermonkey / Violentmonkey | 国内直连可访问 |

**拿脚本**：安装链接默认走 GitHub raw（国内时通时不通）。不稳就把域名换掉，路径完全一样：

```
https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-filter.user.js   ← 默认
https://cdn.jsdelivr.net/gh/weishiji668/boss-zhipin-userscripts@main/boss-filter.user.js      ← jsDelivr 镜像（国内通常更快）
https://gitee.com/你的镜像仓库/raw/main/boss-filter.user.js          ← 自建 Gitee 镜像
```

> 自动更新走的是脚本头部的 `@updateURL`；想换镜像就改那一行（文件名必须保持一致，CI 会校验）。

## 不用管理器行不行

可以，但要分清「能用」与「好用」（兼容层会自动降级，不会静默失败）：

| 能力 | 装了管理器 | 完全不装（书签 / 控制台粘贴 / 自己的扩展） |
| --- | --- | --- |
| 设置与记录（持久化） | 油猴存储 | 自动降级：`localStorage`（键前缀 `__gmcompat:`）→ 内存 |
| 同源接口请求（如 watcher 搜索建档） | GM_xmlhttpRequest | 自动降级：`fetch(credentials: same-origin)` |
| 跨域 AI 接口（可选功能） | 可用 | 不可用（浏览器 CORS 挡着；会明确提示原因） |
| 菜单入口 | 管理器菜单 | 自动降级：页面左下角 `⚙` 兜底菜单 |
| 样式注入 | GM_addStyle | 自动降级：插 `<style>` 标签 |
| 页面刚加载就挂钩 fetch/XHR（chat / watcher 的被动抓包） | 命中 | **会漏**：注入时机晚于页面请求，早期响应抓不到 |
| 自动更新 | 有 | 无，要自己重新注入 |

**结论**：长期用就装个管理器（一键装、自动更新、抓包不漏）；兼容层的意义是**不挑管理器** —— 换暴力猴、脚本猫都能跑，管理器出问题时也能用书签顶上。

## 环境自检

菜单里有一项「🔍 环境自检（兼容层）」，点开即可看到当前环境：

```
■ 运行环境
  管理器：Tampermonkey 5.5.0
  页面世界：可读页面组件状态（unsafeWindow 可用）
  存储后端：GM 存储（按脚本隔离）
  请求后端：GM_xmlhttpRequest（同源 + 跨域）
  菜单入口：管理器菜单
  样式注入：GM_addStyle
```

没有管理器时这份报告会显示各「兜底」后端；跨域失败等原因也会记在里面（最近 3 条）。提 issue 时把它粘上，能省一轮来回。

## 升级

- 脚本头部带了 `@updateURL`，篡改猴会定期检查更新；也可以手动「检查用户脚本更新」。
- 或直接点本文档里的安装链接 → 篡改猴会显示「更新」而不是「安装」。
- **升级后务必 `Ctrl+Shift+R` 强刷**：已经打开着的页面里跑的还是旧版。

## 从更早的本地版本迁移

如果你之前装过我自己本地开发时的旧版脚本（或从别的仓库/文件夹装的同名脚本），请先看 [migrate-v1.md](migrate-v1.md) ——
**直接覆盖安装会出现「两份脚本同时运行」**，表现为两个相同的悬浮球、同一份数据被两边反复写。

## 卸载与清数据

数据分两处存放，卸载脚本**不会**自动清掉它们：

| 存放位置 | 谁在用 | 清法 |
| --- | --- | --- |
| `localStorage`（站点域名下） | `filter` / `tag` / `consist` 的全部数据，以及 chat / insight / watcher 的跨脚本镜像 | 在站点页面按 F12 → Application → Local Storage → 删掉 `bw_*` / `bt_*` / `bc_*` / `bi_*` / `bwf_*` 开头的键 |
| 油猴存储（按脚本隔离） | `chat` / `insight` / `watcher` 的设置与记录 | 在脚本面板里用「清空数据」，或删除脚本时勾选清除存储 |

> 想保住历史记录：先用各脚本的「导出」按钮存一份（`watcher` 有 JSON 导入/导出，`chat` 有 5 种表导出）。

## 常见故障

| 现象 | 多半是 | 怎么办 |
| --- | --- | --- |
| 完全没反应 | 没强刷 / 脚本未启用 / 站点改版 | 检查油猴里脚本是否为启用状态 → `Ctrl+Shift+R` → 再看自检提示 |
| 面板提示「页面世界钩子未注入」 | 页面里跑的是旧版（或注入时机太早） | 强刷一次；仍不行请看 console 报错并开 issue |
| 出现两个相同的悬浮球 | 同一个脚本装了两份 | 到油猴脚本列表里删掉多余那条（见 [migrate-v1.md](migrate-v1.md)） |
| 状态条显示 0 / 0 | 选择器过期（站点改版） | 用「站点改版」issue 模板反馈 |
| 多标签页数字不一致 | 历史版本的覆盖问题（现已修） | 更新到最新版；仍然不一致请附上两个标签页的版本号 |
