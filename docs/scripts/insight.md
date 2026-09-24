# BOSS直聘 · 聊天体检（风险词 + 一键处置）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-insight.user.js` |
| 版本 | v0.5.11 |
| 生效页面 | https://www.zhipin.com/*、https://*.zhipin.com/* |
| 运行时机 | document-idle（@noframes：不在 iframe 里重复注入） |

## 它做什么

只做一件事：聊天会话体检与处置。① 读 boss-chat 写在 localStorage 的会话镜像（bc_chats_mirror，跨脚本共享那个键），用你设置的风险词扫**对方发来的消息**，命中的会话打「风险」标记；② 按标记一键处置：本地隐藏（可恢复）/ 标不感兴趣 / 拉黑 / 删除会话（后两者不可逆，只在你点击时执行，受每日上限与同会话冷却约束）。脚本自己不发任何页面请求；「岗位风险打分」在

## 权限

- `GM_getValue`
- `GM_setValue`
- `GM_registerMenuCommand`
- `GM_xmlhttpRequest`

可连接域名（@connect）：

- `api.deepseek.com`
- `dashscope.aliyuncs.com`
- `open.bigmodel.cn`
- `api.moonshot.cn`
- `api.siliconflow.cn`
- `api.openai.com`
- `localhost`
- `127.0.0.1`

## 本机数据（只存在你自己的浏览器里）

- `bc_chats`
- `bc_chats_mirror`
- `bc_chats_mirror_at`
- `bi_actions`
- `bi_actlog`
- `bi_chat`
- `bi_fabpos`
- `bi_hidden`
- `bi_panelpos`
- `bi_riskhidden`
- `bi_settings`
- `bw_insight_in`
- `bw_insight_out`

## 与其它脚本的协同标记

- `data-bi`
- `data-bi-hidden-key`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 12 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 聊天体检（风险词 + 一键处置）」一节（由脚本头部的 `@description` 自动生成）。
