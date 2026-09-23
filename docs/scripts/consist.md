# BOSS直聘 · 一致性体检（卡片标签 vs 详情正文）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-consist.user.js` |
| 版本 | v0.2.7 |
| 生效页面 | https://www.zhipin.com/*、https://*.zhipin.com/* |
| 运行时机 | document-idle（@noframes：不在 iframe 里重复注入） |

## 它做什么

读卡片小标签（学历/经验 chip）与详情正文（共用 boss-filter 的 bwf_jd_cache 缓存；缺的按页面上有多少批量补取多少 /job_detail/<id>.html，串行小间隔、无每日额度），检三类：① 学历矛盾（卡片大专、正文本科及以上）；② 经验矛盾（卡片经验不限、正文要求 1 年以上）；③ 正文硬要求（四六级/CET/小语种/证书词，卡片上根本不显示）。状态条两个按钮：「隐藏」批量隐藏命中卡（data-bc-hide，协同协议），「标记」只打胶囊不隐藏；结果按 jobId 落盘 bc_actions，刷新自动恢复；面板「清除」撤销本脚本的隐藏/标记。

## 权限

- 无（`@grant none`，不用任何油猴 API）

## 本机数据（只存在你自己的浏览器里）

- `bc_actions_v1`
- `bc_cool_until`
- `bc_rules_v1`
- `bc_ui`
- `bc_ui_panel`
- `bc_unmarked`
- `bwf_jd_cache`

## 与其它脚本的协同标记

- `data-bc-hide`
- `data-bc-mark`
- `data-bc-reason`
- `data-bt-focus`
- `data-bt-hide`
- `data-bwf-hide`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 1 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 一致性体检（卡片标签 vs 详情正文）」一节（由脚本头部的 `@description` 自动生成）。
