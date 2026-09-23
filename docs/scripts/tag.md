# BOSS直聘 · 命中打标签（只标记，不隐藏）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-tag.user.js` |
| 版本 | v1.2.5 |
| 生效页面 | https://www.zhipin.com/*、https://*.zhipin.com/* |
| 运行时机 | document-idle（@noframes：不在 iframe 里重复注入） |

## 它做什么

在职位列表页给「命中规则」的岗位卡片打标签——默认只标记、绝不改站点数据；状态条「隐藏未命中」配合人工复核：先打标（职位名/公司名/地区 正向规则）→ 浏览复核、右键取消误标 → 点按钮把没命中的藏起来，剩下的就是你要投的。规则集：地区（外地）/ 关键词 / 公司名 / 起步月薪上下限。面板可拖动（位置存本机，刷新后还在）；规则改完 800ms 自动保存并立即重扫。配合「页面过滤」「一键投递」：命中卡片打 data-bt-hit / data-bt-tags，按 jobId 存 bt_hits，暴露 window.__bossTagQuery 只读查询。默认不发任何请求；薪资有字体反爬，优先用接口/组件明文，拿不到就跳过判断。

## 权限

- 无（`@grant none`，不用任何油猴 API）

## 本机数据（只存在你自己的浏览器里）

- `bt_hits`
- `bt_mig_v123`
- `bt_migrated_v120`
- `bt_rules_v1`
- `bt_ui`
- `bt_unmarked`
- `bwf_rules_v1`

## 与其它脚本的协同标记

- `data-bc-hide`
- `data-bt-focus`
- `data-bt-hide`
- `data-bt-hit`
- `data-bt-reason`
- `data-bt-tags`
- `data-bwf`
- `data-bwf-hide`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 0 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 命中打标签（只标记，不隐藏）」一节（由脚本头部的 `@description` 自动生成）。
