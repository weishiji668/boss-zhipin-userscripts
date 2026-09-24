# BOSS直聘 · 聊天助手（会话抓取 / 在线时间线 / 推进信号 / 复盘导出）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-chat.user.js` |
| 版本 | v1.5.12 |
| 生效页面 | https://www.zhipin.com/web/geek/chat*、https://www.zhipin.com/web/geek/message* |
| 运行时机 | document-start（@noframes：不在 iframe 里重复注入） |

## 它做什么

只在聊天页工作：抓取会话与消息（接口优先）、记录 HR 上下线时间、导出投递复盘数据（复盘CSV / 消息CSV / JSONL）。面板：会话列表带 24 格活跃条、可搜索、整行可点开。只读，不发消息。

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

## 本机数据（只存在你自己的浏览器里）

- `bc_captured`
- `bc_chats`
- `bc_chats_mirror`
- `bc_chats_mirror_at`
- `bc_diag`
- `bc_fabpos`
- `bc_logs`
- `bc_migrated`
- `bc_panelpos`
- `bc_settings`
- `bw_chats_export`

## 与其它脚本的协同标记

- `data-bc-main`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 13 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 聊天助手（会话抓取 / 在线时间线 / 推进信号 / 复盘导出）」一节（由脚本头部的 `@description` 自动生成）。
