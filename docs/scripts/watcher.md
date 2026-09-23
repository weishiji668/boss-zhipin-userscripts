# BOSS直聘 · 岗位监控（建档 / 盯住 / 跟进信号）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-watcher.user.js` |
| 版本 | v0.9.6 |
| 生效页面 | https://www.zhipin.com/*、https://*.zhipin.com/* |
| 运行时机 | document-start（@noframes：不在 iframe 里重复注入） |

## 它做什么

岗位监控（按需收录版）：面板粘贴「公司名 + 职位名」→ 站内搜索定位 → 抓一次详情建档（记 HR 名）→ 之后你浏览到它时用页面实时数据对比，识别「薪资下调 / 要求拔高 / HR 换人 / 突然下线」。不做整页预处理、不自动建档。变更日志=原始流水，跟进信号=待办；监控清单可导出 / 导入（JSON）。只读，除你点收录时发 1 次搜索 + 1 次详情外不发请求；数据仅存本机。聊天已拆到独立脚本 boss-chat.user.js。

## 权限

- `unsafeWindow`
- `GM_getValue`
- `GM_setValue`
- `GM_deleteValue`
- `GM_registerMenuCommand`
- `GM_xmlhttpRequest`
- `GM_addStyle`

可连接域名（@connect）：

- `www.zhipin.com`
- `zhipin.com`
- `api.deepseek.com`
- `dashscope.aliyuncs.com`
- `open.bigmodel.cn`
- `api.moonshot.cn`
- `api.siliconflow.cn`
- `api.openai.com`
- `localhost`
- `127.0.0.1`

## 本机数据（只存在你自己的浏览器里）

- `bw_apijobs`
- `bw_backup_last`
- `bw_captured`
- `bw_changelog`
- `bw_chats`
- `bw_chats_export`
- `bw_chgopen`
- `bw_company_jobs`
- `bw_companyjobs`
- `bw_diag`
- `bw_insight_in`
- `bw_insight_out`
- `bw_instances`
- `bw_job_addr`
- `bw_jobaddr`
- `bw_jobs`
- `bw_logs`
- `bw_panelpos`
- `bw_panelsize`
- `bw_rules`
- `bw_settings`
- `bw_signals`
- `bw_watchlist`
- `bw_watchver`

## 与其它脚本的协同标记

- `data-bw-main`
- `data-bwf`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 12 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 岗位监控（建档 / 盯住 / 跟进信号）」一节（由脚本头部的 `@description` 自动生成）。
