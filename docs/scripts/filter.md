# BOSS直聘 · 页面过滤（垃圾岗位直接隐藏）

> 本页由 `tools/gen-script-docs.cjs` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。

| | |
| --- | --- |
| 文件 | `boss-filter.user.js` |
| 版本 | v1.3.5 |
| 生效页面 | https://www.zhipin.com/*、https://*.zhipin.com/* |
| 运行时机 | document-idle（@noframes：不在 iframe 里重复注入） |

## 它做什么

在职位列表页把不想要的岗位直接隐藏：三层排除词（绝对 = 命中即隐藏；卡片 = 只看列表卡片上的字段；详情 = 只看岗位详情正文，需先取到详情）+ 薪资范围（月薪下限/上限、日薪下限、面议可选）。

## 权限

- 无（`@grant none`，不用任何油猴 API）

## 本机数据（只存在你自己的浏览器里）

- `bw_company_intel`
- `bw_company_jobs`
- `bw_job_addr`
- `bwf_jd_cache`
- `bwf_rules_v1`

## 与其它脚本的协同标记

- `data-bc-hide`
- `data-bi-hidden-key`
- `data-bt-focus`
- `data-bt-hide`
- `data-bwf`
- `data-bwf-hide`
- `data-bwf-own`
- `data-bwf-reason`

## 网络行为

脚本里的请求入口（`GM_xmlhttpRequest` / `fetch`）共 2 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。

## 完整更新日志

见 [CHANGELOG.md](../../CHANGELOG.md) 中「BOSS直聘 · 页面过滤（垃圾岗位直接隐藏）」一节（由脚本头部的 `@description` 自动生成）。
