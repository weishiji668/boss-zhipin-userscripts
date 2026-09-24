// ==UserScript==
// @name         BOSS直聘 · 岗位监控（建档 / 盯住 / 跟进信号）
// @namespace    local.boss-watcher
// @version      0.9.8
// @description  岗位监控（按需收录版）：面板粘贴「公司名 + 职位名」→ 站内搜索定位 → 抓一次详情建档（记 HR 名）→ 之后你浏览到它时用页面实时数据对比，识别「薪资下调 / 要求拔高 / HR 换人 / 突然下线」。不做整页预处理、不自动建档。变更日志=原始流水，跟进信号=待办；监控清单可导出 / 导入（JSON）。只读，除你点收录时发 1 次搜索 + 1 次详情外不发请求；数据仅存本机。聊天已拆到独立脚本 boss-chat.user.js。v0.9.1：修复「浏览对比的更新在重开页面后丢失」「历史快照被重复数据冲掉」「风控熔断后仍继续请求」「清空全部数据清不干净」「接口观察模式开关无效」等一批 bug（详见脚本头部变更说明），监控口径不变。 v0.9.3：修复「撤销变更按旧 100 上限截断误删人工记录」「立即检查可并发重复请求」「设置页数字输入被 5 秒重绘吞掉」「详情页/粘贴 ID 收录拿不到 HR」「重复收录静默失效」「热路径分键写入失效」「导入备份键按天累加不清」「监控间隔改了不生效」等一批 bug，监控口径不变。v0.9.4：面板可拖动（按住标题栏拖，位置存本机 bw_panelpos，刷新还在；视口钳制防拖出屏幕）。v0.9.4：导出文件统一命名「日期时间-用途-脚本」。v0.9.5（审核修复）：修「跨脚本镜像写爆浏览器存储」——本机镜像（bw_company_jobs / bw_job_addr / bw_insight_in）原来只增不减，写满 localStorage 5MB 后 setItem 抛配额异常被 catch 静默吞掉，镜像静默失效、还会拖垮同源下其它脚本的落盘。现在统一走带上限的写入：TTL 30 天 + 条数上限 800 + 总量 120 万字符，超了按时间淘汰；写不进去会在日志里明说「本机存储可能已满」，不再假装成功。修「删除岗位留下幽灵行」——从监控列表移除岗位时清了 signals 却没清 changelog，「待跟进」里会留下这个岗位的历史变更行、点进去指向已不存在的岗位；现已一并清理。修「不花钱也能把额度耗光」——卡片上的「收录」按钮原来绕过风控熔断与每日预算直接发详情请求，熔断期间照发、预算用完照发；现在两道闸都拦。修「重复扫描详情页 DOM」——同一岗位短时间内被反复扫描，现在按 jobId + DOM 节点数做 2 分钟缓存，并把扫描范围限定在详情容器内（上限 1500 个元素）。修「盯岗的 JD 常常是空的」——详情页数据已由页面钩子拿到时不额外发请求，优先用钩子里的 JD。修「多开标签页互相覆盖」——每个标签页有独立 ID，启动时登记，面板会区分「同一版本多开」与「版本不一致」两种情况。清理：删掉从没接通的「桌面通知」设置（含 @grant GM_notification 与相关开关）、无人调用的死代码、以及导出表里两列永远为空的 AI/风险列（面板文案同步改成实话）。v0.9.6：新增 GM 兼容适配层 —— 脚本不再只认篡改猴：篡改猴 / 暴力猴 / 脚本猫任选其一即可，甚至在完全没有脚本管理器时（把脚本直接注入页面）也能跑；缺的能力自动补齐（存储退化为 localStorage、同源请求改走 fetch、菜单退化为页面内 ⚙、样式退化为 style 标签；跨域 AI 功能仍需管理器）。装了管理器的用户行为与上一版完全一致 —— 适配层只补齐、不覆盖。新增「🔍 环境自检（兼容层）」菜单项，一眼看清当前跑在什么环境、哪些能力可用。 v0.9.7（文案统一·测试版）：卡片按钮「盯岗」改叫「收录」（和面板同一个词）；「立即对比」统一成「立即检查」；页签与卡片「待跟进」改成「待处理」（聊天脚本的「待跟进」专指我发言≥2天没回，两者区分开）；收录区补一句「收录＝存进本机档案」的备注与用例。 v0.9.8：面板里提到体检脚本的提示跟着改名（岗位体检 → 聊天体检），并指向新的菜单入口「⚙ 聊天体检设置（风险词）」。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/jiajianchengchu-boss
// @supportURL   https://github.com/weishiji668/jiajianchengchu-boss/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-watcher.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-watcher.user.js
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      www.zhipin.com
// @connect      zhipin.com
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// @connect      open.bigmodel.cn
// @connect      api.moonshot.cn
// @connect      api.siliconflow.cn
// @connect      api.openai.com
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

'use strict';

/* ===== BOSS-GM-COMPAT BEGIN ===== */
// GM 兼容适配层 —— 单一来源：改这里，然后跑 node tools/inline-compat.cjs 重新内联到各脚本。
// 覆盖四种环境：篡改猴 / 暴力猴 / 脚本猫 / 完全没有管理器（书签或直接注入页面）。
// 原则：管理器给了什么就用什么，只补齐缺失的几个 API，绝不覆盖已有实现 ——
//       装了管理器的用户行为与改造前完全一致；改造只是让「没有管理器」也能跑。
var __bossCompat = (function () {
  var W = (typeof window === "undefined") ? null : window;
  var NL = String.fromCharCode(10);
  var NS = "__gmcompat:";
  var mem = {};
  var warns = [];
  function isFn(f) { return typeof f === "function"; }

  var realGet = (typeof GM_getValue === "function") ? GM_getValue : null;
  var realSet = (typeof GM_setValue === "function") ? GM_setValue : null;
  var realDel = (typeof GM_deleteValue === "function") ? GM_deleteValue : null;
  var realCss = (typeof GM_addStyle === "function") ? GM_addStyle : null;
  var realMenu = (typeof GM_registerMenuCommand === "function") ? GM_registerMenuCommand : null;
  var realXhr = (typeof GM_xmlhttpRequest === "function") ? GM_xmlhttpRequest : null;
  var realInfo = (typeof GM_info === "undefined") ? null : GM_info;
  var realUnsafe = (typeof unsafeWindow === "undefined") ? null : unsafeWindow;

  function lsGet(k) { try { var v = W.localStorage.getItem(NS + k); return (v === null) ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
  function lsSet(k, v) { try { W.localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { W.localStorage.removeItem(NS + k); } catch (e) {} }
  function stGet(k, d) { if (realGet) { try { var v = realGet(k); return (v === undefined) ? d : v; } catch (e) {} } var x = lsGet(k); if (x !== undefined) return x; return (k in mem) ? mem[k] : d; }
  function stSet(k, v) { if (realSet) { try { realSet(k, v); return; } catch (e) {} } if (!lsSet(k, v)) mem[k] = v; }
  function stDel(k) { if (realDel) { try { realDel(k); return; } catch (e) {} } lsDel(k); delete mem[k]; }
  var store = { get: stGet, set: stSet, del: stDel };

  function css(text) {
    if (realCss) { try { realCss(text); return; } catch (e) { warns.push("GM_addStyle 调用异常，已改用 style 标签"); } }
    try {
      var host = document.head || document.documentElement || document.body;
      var s = document.createElement("style");
      s.textContent = String(text);
      (host || document.documentElement).appendChild(s);
    } catch (e) { warns.push("注入样式失败：" + (e && e.message)); }
  }

  function sameOrigin(url) {
    try { var u = new URL(String(url), W.location.href); return u.origin === W.location.origin; } catch (e) { return false; }
  }
  function xhr(o) {
    o = o || {};
    if (realXhr) { try { return realXhr(o); } catch (e) { warns.push("GM_xmlhttpRequest 调用异常，已退回 fetch"); } }
    if (!sameOrigin(o.url)) {
      var msg = "跨域请求需要脚本管理器（篡改猴/暴力猴/脚本猫任一），当前环境没有：" + String(o.url).slice(0, 80);
      if (warns.indexOf(msg) < 0) warns.push(msg);
      if (isFn(o.onerror)) { try { o.onerror({ status: 0, responseText: "", error: msg }); } catch (e2) {} }
      return;
    }
    var ctl = null, tid = 0;
    try {
      if (typeof AbortController === "function") ctl = new AbortController();
      if (o.timeout && ctl) tid = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, o.timeout);
      fetch(String(o.url), { method: o.method || "GET", headers: o.headers || {}, body: (o.data === undefined ? undefined : o.data), credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.text().then(function (t) { return { r: r, t: t }; }); })
        .then(function (x) {
          if (tid) clearTimeout(tid);
          if (isFn(o.onload)) o.onload({ status: x.r.status, responseText: x.t, readyState: 4, finalUrl: String(o.url) });
        })
        .catch(function (e) {
          if (tid) clearTimeout(tid);
          if (isFn(o.onerror)) o.onerror({ status: 0, responseText: "", error: String((e && e.message) || e) });
        });
    } catch (e) {
      if (isFn(o.onerror)) o.onerror({ status: 0, responseText: "", error: String((e && e.message) || e) });
    }
  }

  var menuItems = [];
  function menu(label, fn) {
    if (realMenu) { try { realMenu(label, fn); return; } catch (e) {} }
    menuItems.push([String(label), fn]);
    mountMenuButton();
  }
  function mountMenuButton() {
    try {
      if (!W || !document) return;
      if (!document.body) { setTimeout(mountMenuButton, 600); return; }
      if (document.getElementById("gmCompatMenu")) return;
      if (!menuItems.length) return;
      var wrap = document.createElement("div");
      wrap.id = "gmCompatMenu";
      wrap.setAttribute("style", "position:fixed;left:8px;bottom:8px;z-index:2147483000;font:12px/1.6 system-ui,Microsoft YaHei,sans-serif");
      var btn = document.createElement("button");
      btn.textContent = "⚙";
      btn.title = "脚本菜单（当前环境没有管理器菜单，这里代管）";
      btn.setAttribute("style", "width:34px;height:34px;border-radius:50%;border:none;background:#374151;color:#fff;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3)");
      var list = document.createElement("div");
      list.setAttribute("style", "display:none;margin-top:6px;background:#111827;color:#fff;border-radius:10px;padding:6px;min-width:190px;box-shadow:0 8px 24px rgba(0,0,0,.35)");
      menuItems.forEach(function (it) {
        var b = document.createElement("button");
        b.textContent = it[0];
        b.setAttribute("style", "display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px");
        b.addEventListener("click", function () { list.style.display = "none"; try { it[1](); } catch (e) {} });
        list.appendChild(b);
      });
      btn.addEventListener("click", function () { list.style.display = (list.style.display === "block") ? "none" : "block"; });
      wrap.appendChild(btn);
      wrap.appendChild(list);
      document.body.appendChild(wrap);
    } catch (e) {}
  }

  function envReport() {
    var mi = realInfo || {};
    var who = mi.scriptHandler || "没有脚本管理器（脚本直接注入在页面里）";
    if (mi.version) who += " " + mi.version;
    var L = [];
    L.push("■ 运行环境");
    L.push("  管理器：" + who);
    L.push("  页面世界：" + (realUnsafe ? "可读页面组件状态（unsafeWindow 可用）" : "受限，按 DOM 兜底"));
    L.push("  存储后端：" + (realGet ? "GM 存储（按脚本隔离）" : "localStorage 兜底（键前缀 __gmcompat:）"));
    L.push("  请求后端：" + (realXhr ? "GM_xmlhttpRequest（同源 + 跨域）" : "fetch 同源兜底（跨域 AI 功能需要管理器）"));
    L.push("  菜单入口：" + (realMenu ? "管理器菜单" : "页面内 ⚙ 兜底菜单"));
    L.push("  样式注入：" + (realCss ? "GM_addStyle" : "style 标签兜底"));
    try { L.push("  当前页面：" + String(location.href).split("?")[0]); } catch (e) {}
    if (warns.length) { L.push("■ 告警（最近 3 条）"); warns.slice(-3).forEach(function (w) { L.push("  · " + w); }); }
    return L.join(NL);
  }
  function showEnv() { var t = envReport(); try { alert(t); } catch (e) { try { console.log(t); } catch (e2) {} } }

  function install() {
    if (!W) return;
    var pairs = [["GM_getValue", realGet, stGet], ["GM_setValue", realSet, stSet], ["GM_deleteValue", realDel, stDel], ["GM_addStyle", realCss, css], ["GM_xmlhttpRequest", realXhr, xhr], ["GM_registerMenuCommand", realMenu, menu]];
    pairs.forEach(function (p) {
      if (p[1]) return;
      try { if (typeof W[p[0]] !== "function") W[p[0]] = p[2]; } catch (e) {}
    });
    if (!realUnsafe) { try { if (typeof W.unsafeWindow === "undefined") W.unsafeWindow = W; } catch (e) {} }
  }
  install();
  menu("🔍 环境自检（兼容层）", showEnv);

  var api = { store: store, css: css, xhr: xhr, menu: menu, envReport: envReport, showEnv: showEnv, warns: warns, has: { gmStorage: !!realGet, gmXhr: !!realXhr, gmMenu: !!realMenu, gmCss: !!realCss, unsafeWindow: !!realUnsafe }, info: realInfo };
  try { if (W) W.__bossCompat = api; } catch (e) {}
  return api;
})();
/* ===== BOSS-GM-COMPAT END ===== */

// ===== v0.7.2 变更说明（2026-09-20）=====
// W1 Key 安全：面板不再回填 Key 明文（只显示「已保存」+ 更换/清除按钮）；首次启用 AI 判定弹一次性确认；baseUrl 加可信地址提示 + 非 https 警告
// W2 备份安全：导出「全部备份」剔除 AI Key（原样导出会让 Key 随文件落盘）
// W3 本地换日：AI 每日额度 / 监控请求预算统一按本地日期（原 toISOString 走 UTC，北京时间 08:00 才重置）
// W4 文案口径：AI 外发范围写清楚（岗位名/公司名/变化摘要/JD 片段 → 你配置的接口，默认 DeepSeek 境内服务）
// W5 存储：save() 防抖合并 + 分键写入（原每次全量写 12 个键）；关页/切后台强制落盘
// W6 岗位级「最后检查」时间（lastCheckedAt），列表与导出都显示
// W7 AI 公司判定带上「岗位名 + JD 摘要」（原来只给公司名，中介/外包识别偏弱）
// ===== v0.7.3 修订说明（2026-09-20 深夜，用户截图反馈「要求拔高」误报）=====
// 问题：DOM 兜底提取把整段标签串（"1-3年·学历不限·单体店·…"）当作经验值存档；
//       expRank 又先判"不限"再抓年限 → 含"学历不限"的脏值被判成 0 级；
//       与接口来的干净值（1-3年=3级）一对比 → 0→3 被误报「要求拔高」。
// 修复：① expRank 先抓年限数字、再判"不限"；② exp/edu 等级相同（含脏值↔干净值等价）不记变更、不报信号；
//       ③ DOM 提取只挑真正的经验标签（挑不出就留空，宁缺毋滥）；④ 对比文案里脏值自动清洗展示。
// ===== v0.7.4 说明（2026-09-20）=====
// 「投递」功能已迁移为独立脚本 boss-deliver.user.js（v1.0.0；按钮寄生在 filter 小条旁）——
// 本脚本回到纯「只读监控」定位：不投递、不发消息、不做写操作。
// ===== v0.7.5 说明（2026-09-20，用户反馈「变更日志要一条条手删」）=====
// ① 根因修复：diffJob 不再把「首次补全」记成变更 —— 旧快照里该字段还是空的，新快照第一次读到值
//    （「Boss活跃：未知 → false」「学历要求：未知 → 中专/中技」「经验要求：未知 → 1-3年」），
//    这不是变化，是补全；原来这三类噪音会塞满变更日志，逼用户逐条删。
// ② 存量清理：启动时自动清掉历史「未知 → 值」噪音（加了备注 / 标了跟进的一律保留）。
// ③ 批量能力：勾选 + 删除选中 / 清空 / 清理无意义；单条删除不再弹 confirm，改为 8 秒内可撤销。
// ④ 少占屏：变更日志默认折叠（只列最近 5 条，可展开全部），面板可拖拽缩放并记住尺寸。
// ===== v0.8.0 说明（2026-09-20；用户澄清：盯住 = 我自己挑的、要在页面里实时跟进的岗位）=====
// ===== v0.8.2 变更说明（2026-09-20，用户反馈投递面板「点一下没一会就自动回退」——同类毛病一起修）=====
// B1 根因：面板开着时，抓到数据 / 12 秒一轮的实时对比都会 scheduleRender → renderAll 整块重写页面 HTML，
//    于是「设置」里正在填的参数、「风险」页正在填的规则名/关键词、面板滚动位置都会被冲回默认值。
// B2 修法：每个页面重绘前先记住「输入框的值 / 焦点与光标 / 面板滚动位置」，重绘后原样放回；
//    「新增规则」「恢复默认规则」这两个动作会先清空表单再重绘（表单本来就该空，不会被旧输入带回来）。
// ① 取数改主路：直接读页面 Vue 组件状态（列表组件 jobList / 详情组件 jobDetail）——字段全、干净，
//    不再依赖「服务端直出页面抓不到数据」的接口钩子；接口钩子与 DOM 兜底保留为备用。
// ② 浏览即建档 + 浏览即对比：列表页刷到新岗位自动建档（可在设置里关），已建档岗位再次出现在
//    列表/详情时立即对比并更新时间戳；面板新增「本次会话对比 N 次 / 最后对比」。
// ③ 值归一化：经验/学历先归一化再比较与存档，脏值（"1-3年·学历不限·…"）与干净值等价不报变更；
//    新增「清理历史误报」一键处理存量「等级相同却报要求拔高」的旧记录。
// ④ 口径诚实化：把「今日请求」改名为「主动检查（今日）」（只在点立即检查时+1，浏览不消耗，跨日归零）；
//    新增未登录提示、多版本并存提示（两个版本的监控脚本同时跑会互相打架）。
// ⑤ AI 大脑：预置 7 家服务商（DeepSeek / 通义千问 / 智谱 / Kimi / 硅基流动 / OpenAI / 本地 Ollama），
//    一键套用地址与模型 + 「测试连接」按钮；本地 Ollama 可完全不出本机。
// 历史：v0.1 聊天捕获 → v0.2 被动捕获 → v0.5 风险规则 → v0.6 聊天独立脚本 → v0.7 变更日志维护 →
//       v0.8 实时页面数据 / 值归一化 / AI 大脑 → v0.9 按需收录（本版）。旧版说明见归档目录。

// ===== v0.9.0 变更说明（2026-09-20；用户澄清：监控 = 我自己按需收录，不要整页预处理）=====
// M1 取消整页预处理：不再「浏览即建档」、不再对全页岗位做对比。只有你**手动收录**过的岗位/公司才进对比。
// M2 收录入口：面板粘贴「公司名 + 职位名」（一行一条，也接受岗位链接 / 职位ID）→ 脚本站内搜索定位 →
//    唯一命中直接收录、多条命中列候选让你点选、找不到就明说「未找到」（不静默）。
// M3 收录时抓一次：只读抓一次该岗位详情页（薪资 / 经验 / 学历 / JD / **HR 名** / 地址 / 公司在招数），
//    与卡片信息一起存成首个快照；请求间隔 2–5 秒，命中风控（验证码/访问频繁）当日熔断。
// M4 监控项 = 职位项（公司 + 职位名 + **HR名**）或 公司项（公司名）；同一岗位不同 HR 视为不同项 ——
//    这就是「跟进」要区分的东西。每项保留最新快照 + 最近 20 次历史快照。
// M5 浏览时触发对比：你浏览列表/详情时，页面里识别到监控项才对比（职位ID / 公司+职位名 / HR名），
//    只读、不发请求；被过滤脚本隐藏的卡片不算「看到」。
// M6 变更日志（原始流水）按字段分开记：薪资 / 经验 / 学历 / 标签 / 状态 / HR / JD 摘要 / 公司在招数；
//    「未知 → 值」这类首次补全永不记录，同字段归一化后相同不记录。
// M7 跟进信号（待办）：只汇总要你行动的 —— 薪资下调 / 要求拔高 / HR 换人 / 岗位下线 / 同公司新岗位 /
//    公司被判定外包劳务；每条可「标已跟进 / 加备注 / 忽略」，按监控项分组。
// M8 导出 / 导入：导出 JSON（监控清单 + 最新快照 + 未处理信号，文件名带日期）；导入按
//    职位ID / 公司+职位名+HR 去重合并，导入前自动备份，导入后可清空本地监控数据保持轻量。
// M9 UI 重做：顶部状态条（监控项 N · 待跟进 N · 今日对比 N）+ 两个页签「监控项 / 待跟进」；
//    面板移到右下角，不再和过滤小条（左下角）抢位置。

// ===== v0.9.2 变更说明（2026-09-21，代码评审；跨脚本 AI 建议对齐）=====
// A11 P1「待跟进」页签的 🤖 AI 建议从不显示：boss-insight 把 AI 结果按「变更流水 id」写进 bw_insight_out.ai，
//     而本脚本在信号里用「信号 id」去查（两个 id 不同）→ 永远查不到。
//     修法：信号新增 chgId（指向它对应的变更流水 id），renderMonitor 改查 insightAi()[s.chgId||s.id]。
//     行为边界不变；存储键名不变（信号多一个 chgId 字段，旧数据无该字段时回退到原 id，不报错）。
// ===== v0.9.1 变更说明（2026-09-21，代码评审；监控口径与产品定义不变，只修 bug）=====
// A1 P0 浏览对比的更新会丢：observeJob 改了监控项（它就是 bw_watchlist 里的对象）却只保存 bw_jobs，
//    而下次开页 loadStore 用 bw_watchlist 的旧数据覆盖回来 → 最新快照/HR名/元数据丢失、同一条变更被重复报。
//    修法：save 补上 'watch' 键（立即检查路径的 save(['jobs']) 同样补）。
// A2 P0 历史快照被冲掉：页面 Vue 状态每 5 秒回传一次，observeJob 每次无脑 push 快照，
//    20 格历史两三分钟就全是重复数据。修法：只在「真有变化 / 第一份」时进历史。
// A3 P1 风控熔断被绕过：立即检查批量请求时，onload 检测到风控并熔断后，onloadend 仍继续请求剩余岗位。
//    修法：每发一个岗位前都查 isBlocked()，熔断即停；done 回调加防重入保护。
// A4 P1 收录路径三重漏洞：①「收录」按钮可连点并发（每条 2-5 秒间隔保护失效）；②熔断期间照发搜索/详情请求；
//    ③搜索接口响应从不检测风控。修法：recordBusy 防重入、isBlocked 前置拦截、searchCandidates 加 riskCode 检测、
//    fetchDetailSnapshot 加全局串行锁（收录/卡片盯岗/立即对比共用，绝不并发）。
// A5 P1「清空全部数据」静默半清：引用了未定义的 K_RISK → ReferenceError 被 catch 吞掉 → bw_logs 永远删不掉；
//    且监控清单/信号/诊断/公司信息根本不清，与弹窗文案「清空全部本地数据」不符。修法：补全清理范围 + 文案写明清什么。
// A6 P1「接口观察模式」开关从未生效：onPanelChange 对单段键（data-key="observe"）固定写 parts[1]（=undefined），
//    值全写进 settings.undefined；getPath 同样读不到 → 勾选状态也回显不出来。修法：两处都支持单段键。
// A7 P2 超时不计预算：立即检查超时（请求实际已发出）不消耗每日预算 → 补上 spendBudget(1)。
// A8 P2 mergeDeep 浅拷贝让 settings.monitor 与 DEFAULTS 共享引用，预算/熔断字段会污染模块级默认值 → 深拷贝。
// A9 P2 薪资对比防御：新值是字体反爬乱码时不记「薪资变化」（宁可不判，也别判错）。
// A10 P2 设置页死开关「风险扫描 risk.scanJd」（settings.risk 已不存在，勾了没效果）→ 删除；
//     rule-add/rule-del/rules-reset/export-all/import-all 五个调用不存在函数的死分支 + importFile 死函数 → 删除；
//     upsertWatchItem 的 hasContent 把空数组 labels 当有内容 → 修正；mirrorInsight 跳过无 jobId 条目。
// 行为边界不变：只读监控；除「收录 / 立即检查」（用户手动触发、有间隔/预算/熔断）外不发请求；存储键名不变。

(function(){
const VERSION='0.9.8';
// v0.9.2：本标签页的实例号（随机，一个标签页一个），只用于 bw_instances 心跳，别处不用
const INSTANCE_ID='t'+Math.random().toString(36).slice(2,10);
const K_JOBS='bw_jobs', K_CHATS='bw_chats', K_RULES='bw_rules', K_SETTINGS='bw_settings',
  K_LOG='bw_changelog', K_CAP='bw_captured', K_LOGS='bw_logs', K_DIAG='bw_diag',
  K_API='bw_apijobs';
const K_WATCH='bw_watchlist';     // v0.9.0：监控项（我手动收录的岗位 / 公司）
const K_SIG='bw_signals';         // v0.9.0：跟进信号（待办）
const K_WVER='bw_watchver';       // v0.9.0：迁移标记
const K_CJOBS='bw_companyjobs';
const K_JOBADDR='bw_jobaddr';
const K_CHGOPEN='bw_chgopen';     // 变更日志折叠状态（v0.7.5）
const K_PANELSIZE='bw_panelsize'; // 面板尺寸记忆（v0.7.5）

const DEFAULTS={
  monitor:{active:false, intervalHours:12, maxBatch:50, minDelay:8, maxDelay:20, dailyBudget:100, budgetDate:'', usedToday:0, blockedUntil:0, blockReason:'', compareDate:'', compareCount:0, lastCompareAt:0},
  watch:{hideFiltered:true, snapHistory:20, chgMax:300, sigMax:200, reqMinDelay:2, reqMaxDelay:5},
  observe:false
};

// v0.9.0：风险规则 / AI 判定已拆到独立脚本 boss-insight.user.js（岗位体检）——
// 本脚本只负责「收录 / 盯住 / 对比 / 流水 / 待办 / 导出导入」，分析结果通过本机镜像读回来显示。

const store={jobs:{},chats:{},rules:[],settings:{},changelog:[],captured:{},logs:[],diag:{},apiJobs:{},companyJobs:{},jobAddr:{},
  watch:{},signals:[]};

function now(){ return Date.now(); }
// 本地日期（YYYY-MM-DD）：额度/预算按本地换日，不能用 toISOString（那是 UTC，北京时间要晚 8 小时才重置）
function localDateStr(d){
  const t=d||new Date(), p=x=>String(x).padStart(2,'0');
  return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());
}
function relDay(ts){
  const t=toTs(ts); if(!t) return '';
  const d=Math.floor((Date.now()-t)/86400000);
  return d<=0?'今天':(d+' 天前');
}
function tsFile(){
  const d=new Date();
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+
    String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
}
function rand(min,max){ return min+Math.random()*(max-min); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function pick(o,keys){ for(const k of keys){ const v=o&&o[k]; if(v!==undefined&&v!==null&&v!=='') return v; } return undefined; }
function mergeDeep(base,ext){
  const out=Object.assign({},base);
  // v0.9.1：base 的嵌套对象也要深拷贝 —— 原来 ext 里缺某个键时，out.monitor 就直接引用 DEFAULTS.monitor，
  // 之后 usedToday / blockedUntil / compareCount 的每次修改都在污染模块级默认值
  //（同一页面会话里「清空全部数据」后拿到的"默认配置"是被改脏过的）
  Object.keys(base||{}).forEach(k=>{
    const b=base[k];
    if(b&&typeof b==='object'&&!Array.isArray(b)) out[k]=mergeDeep(b,null);
  });
  Object.keys(ext||{}).forEach(k=>{
    const b=out[k], e=ext[k];
    if(b&&typeof b==='object'&&!Array.isArray(b)&&e&&typeof e==='object'&&!Array.isArray(e)) out[k]=mergeDeep(b,e);
    else out[k]=e;
  });
  return out;
}
function pathOf(u){
  try{ const x=new URL(u); return x.origin+x.pathname; }catch(e){ return String(u||'').split('?')[0]; }
}
function normText(s){
  return String(s||'').toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
    .replace(/\s+/g,'')
    .replace(/[\p{P}\p{S}]/gu,'')
    .replace(/\d+/g,'#');
}
function jdNorm(s){
  return String(s||'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function salaryChanged(a,b){
  return String(a||'').replace(/\s/g,'')!==String(b||'').replace(/\s/g,'');
}
function lineDiff(a,b){
  const A=jdNorm(a).split('\n').map(x=>x.trim()).filter(Boolean);
  const B=jdNorm(b).split('\n').map(x=>x.trim()).filter(Boolean);
  const aset=new Set(A), bset=new Set(B);
  const removed=[], added=[];
  A.forEach(l=>{ if(!bset.has(l)&&!removed.includes(l)) removed.push(l); });
  B.forEach(l=>{ if(!aset.has(l)&&!added.includes(l)) added.push(l); });
  return {added:added.slice(0,8), removed:removed.slice(0,8)};
}
function toTs(v){
  if(v===undefined||v===null||v==='') return 0;
  if(typeof v==='number') return v<1e12?v*1000:v;
  const n=Number(v);
  if(!isNaN(n)&&String(v).trim()!=='') return n<1e12?n*1000:n;
  const d=new Date(String(v).replace(/-/g,'/'));
  return isNaN(d.getTime())?0:d.getTime();
}
function csvEsc(v){
  const s=String(v===undefined||v===null?'':v);
  return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function download(filename,text,mime){
  try{
    const blob=new Blob([text],{type:mime||'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  }catch(e){ try{ alert('导出失败：'+e.message); }catch(_){} }
}
function fmtTime(ts){
  const n=toTs(ts); if(!n) return '';
  const d=new Date(n), p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function gget(k,d){ try{ const v=GM_getValue(k); return v===undefined?d:v; }catch(e){ return d; } }
function gset(k,v){ try{ GM_setValue(k,v); }catch(e){} }
function loadStore(){
  store.jobs=gget(K_JOBS,{})||{};
  store.chats=gget(K_CHATS,{})||{};
  store.rules=[];   // v0.9.0：风险规则搬去 boss-insight.user.js（本脚本不再持有规则）
  store.settings=mergeDeep(DEFAULTS,gget(K_SETTINGS,{})||{});
  store.changelog=Array.isArray(gget(K_LOG,[]))?gget(K_LOG,[]):[];
  store.captured=gget(K_CAP,{})||{};
  store.logs=Array.isArray(gget(K_LOGS,[]))?gget(K_LOGS,[]):[];
  store.diag=gget(K_DIAG,{})||{};
  store.apiJobs={};                     // v0.9.0：不再持久化整页接口缓存（内存里只留当前页的）
  store.companyJobs=gget(K_CJOBS,{})||{};
  store.jobAddr=gget(K_JOBADDR,{})||{};
  store.watch=gget(K_WATCH,{})||{};     // v0.9.0：监控项
  store.signals=Array.isArray(gget(K_SIG,[]))?gget(K_SIG,[]):[];
  // v0.9.0：监控项（职位）与旧档案 jobs 指向同一个对象 —— 旧导出 / 测试继续可用
  try{
    Object.keys(store.watch).forEach(k=>{
      const it=store.watch[k];
      if(!it) return;
      it.itemId=it.itemId||k;
      if(it.type!=='company'&&it.jobId) store.jobs[it.jobId]=it;
    });
  }catch(e){}
}
// 写入策略：防抖合并 + 分键写入。捕获热路径会连续触发 save()（30+ 处调用点），
// 之前每次都全量写 12 个键（jobs / captured / apiJobs 体积最大）；现在只写"脏键"，大对象另加节流。
const KEY_OF={jobs:K_JOBS,chats:K_CHATS,settings:K_SETTINGS,changelog:K_LOG,captured:K_CAP,logs:K_LOGS,diag:K_DIAG,
  companyJobs:K_CJOBS,jobAddr:K_JOBADDR,watch:K_WATCH,signals:K_SIG};
const ALL_KEYS=Object.keys(KEY_OF);
const BIG_KEYS=['jobs','captured'];
const SAVE_DEBOUNCE_MS=150, BIG_THROTTLE_MS=600;
let saveTimer=null, saveDirty=null, bigWrittenAt=0;
function flushSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
  if(!saveDirty) return;
  const keys=Array.from(saveDirty); saveDirty=null;
  keys.forEach(k=>{ try{ gset(KEY_OF[k],store[k]); }catch(e){} });
  if(keys.some(k=>k==='watch'||k==='jobs'||k==='changelog'||k==='signals')){ try{ mirrorInsight(); }catch(e){} }
  if(keys.some(k=>BIG_KEYS.indexOf(k)>=0)) bigWrittenAt=now();
}
function save(keys){
  const want=keys?[].concat(keys):ALL_KEYS;
  saveDirty=saveDirty||new Set();
  want.forEach(k=>saveDirty.add(k));
  if(saveTimer) return;
  let delay=SAVE_DEBOUNCE_MS;
  if(Array.from(saveDirty).some(k=>BIG_KEYS.indexOf(k)>=0)){
    const since=now()-bigWrittenAt;
    if(since<BIG_THROTTLE_MS) delay=Math.max(delay,BIG_THROTTLE_MS-since);
  }
  saveTimer=setTimeout(flushSave,delay);
}
try{
  window.addEventListener('pagehide',flushSave);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') flushSave(); });
}catch(e){}
function log(msg){
  store.logs.unshift({ts:now(), msg:String(msg)});
  if(store.logs.length>30) store.logs.pop();
  try{ console.log('[boss-watcher]',msg); }catch(e){}
  save('logs');
}
// v0.9.2：删掉死函数 addChange（全文件零调用，且它是唯一的 GM_notification 调用点）。
// 桌面通知这条链路本来就没接上 —— 变更其实由 applyWatchChanges 写进 store.changelog，
// 那个函数从不发通知。与其留个「勾了没反应」的开关，不如把开关和死代码一起删掉。
// ===== 变更日志的批量维护（v0.7.5）=====
// 「首次补全」噪音：旧快照里该字段为空，新快照第一次读到值（未知 → 值）。这不是变化，是补全。
// v0.7.5 起 diffJob 不再产生这类记录；下面负责识别历史存量 + 批量清理，省掉逐条手删。
const NOISE_CHANGE_RE=/^(Boss活跃|经验要求|学历要求)：未知\s*→/;
function isNoiseChange(c){
  if(!c||c.done||c.note) return false;                 // 标了跟进 / 加了备注 = 人工资产，不动
  const cs=Array.isArray(c.changes)?c.changes:[];
  return cs.length>0&&cs.every(t=>NOISE_CHANGE_RE.test(String(t)));
}
function noiseChangeIds(){ return store.changelog.filter(isNoiseChange).map(c=>c.id); }
// v0.8.0：「等级相同却报要求拔高」的历史误报（旧版 expRank 先判"不限"、DOM 脏值造成的）——识别 + 一键清理。
// 判定：该条变化行形如「经验要求：L → R」/「学历要求：L → R」，且 L 与 R 归一化后同等级 → 不是真变化。
function reqLineBogus(t){
  const m=String(t||'').match(/^(经验要求|学历要求)：(.+?)\s*→\s*(.+)$/);
  if(!m) return false;
  const isExp=m[1]==='经验要求';
  const a=isExp?expRank(m[2]):eduRank(m[2]);
  const b=isExp?expRank(m[3]):eduRank(m[3]);
  if(a!=null&&b!=null) return a===b;
  const ca=isExp?canonExp(m[2]):canonEdu(m[2]);
  const cb=isExp?canonExp(m[3]):canonEdu(m[3]);
  return !!ca&&ca===cb;
}
function isBogusChange(c){
  if(!c||c.done||c.note) return false;                        // 标了跟进 / 加了备注 = 人工资产，不动
  const cs=Array.isArray(c.changes)?c.changes:[];
  if(!cs.length) return false;
  const sig=(c.signals||[]).filter(s=>s.level!=='info').map(s=>String(s.text||''));
  if(!sig.length||!sig.some(t=>/要求拔高/.test(t))) return false;
  const req=cs.filter(t=>/^(经验要求|学历要求)：/.test(String(t)));
  if(!req.length) return false;
  if(!req.every(t=>reqLineBogus(String(t)))) return false;
  const other=cs.filter(t=>!/^(经验要求|学历要求)：/.test(String(t)));
  return other.every(t=>/^Boss活跃：/.test(String(t)));       // 其余只是活跃度噪音 → 整条可清
}
function bogusChangeIds(){ return store.changelog.filter(isBogusChange).map(c=>c.id); }
function cleanBogusChanges(){
  const ids=bogusChangeIds();
  if(!ids.length) return 0;
  const n=removeChanges(ids);
  log('变更日志：清理了 '+n+' 条「经验/学历等级其实没变」的历史误报（可点面板上的撤销恢复）');
  return n;
}
// 批量删除：勾选删除 / 清空 / 清理无意义都走这里；返回删除条数，被删的留给撤销
let lastRemovedChanges=[];
function removeChanges(ids){
  const set=new Set((ids||[]).map(String));
  if(!set.size) return 0;
  const keep=[], removed=[];
  store.changelog.forEach(c=>{ (set.has(String(c.id))?removed:keep).push(c); });
  if(!removed.length) return 0;
  lastRemovedChanges=removed;
  store.changelog=keep;
  save('changelog');
  return removed.length;
}
function undoRemoveChanges(){
  if(!lastRemovedChanges.length) return 0;
  const n=lastRemovedChanges.length;
  const has=new Set(store.changelog.map(c=>String(c.id)));
  store.changelog=store.changelog.concat(lastRemovedChanges.filter(c=>!has.has(String(c.id))));
  store.changelog.sort((a,b)=>toTs(b.ts)-toTs(a.ts));
  const max=Math.max(50,(store.settings.watch&&store.settings.watch.chgMax)||300);
  if(store.changelog.length>max) store.changelog.length=max;
  lastRemovedChanges=[];
  save('changelog');
  return n;
}
// 启动时自动清掉历史噪音 —— 「脚本就该批量处理」，不该让用户一条条点
function autoPruneNoise(){
  const ids=noiseChangeIds();
  if(!ids.length) return 0;
  const set=new Set(ids.map(String));
  store.changelog=store.changelog.filter(c=>!set.has(String(c.id)));
  save('changelog');
  log('变更日志：自动清理了 '+ids.length+' 条「首次补全」噪音（旧快照没存过的字段第一次读到值，不算变化）');
  return ids.length;
}
// UI 状态：折叠 / 是否展开全部 / 勾选集合 / 撤销提示
let chgOpen=(gget(K_CHGOPEN,'0')==='1'), chgShowAll=false, chgSelected=new Set(), chgUndoCount=0, chgUndoTimer=null;
function flashChgUndo(n){
  chgUndoCount=n;
  if(chgUndoTimer) clearTimeout(chgUndoTimer);
  chgUndoTimer=setTimeout(()=>{ chgUndoCount=0; chgUndoTimer=null; if(bwUi) renderMonitor(); },8000);
}
// ===== AI 判定（可选，默认关；只在出现「需留意/下线」信号时调一次）=====
// 公司判定：按公司名缓存（一次查过就不再查），结果同步到 localStorage 供过滤脚本共用
// W7：除公司名外，带上「岗位名 + JD 摘要」——中介/外包识别更准（能力边界 已知问题5）
function jobContextOf(j){
  const m=(j&&j.meta)||{}, l=(j&&j.last)||{}, f=(j&&j.first)||{};
  return {jobName:m.name||'', jd:l.jd||f.jd||''};
}
// ===== v0.8.0：AI 请求统一出口（所有 OpenAI 兼容服务商共用）=====
// 本地/自建接口不保证支持 response_format：去掉更稳（提示词里已经要求只输出 JSON）
// W1/W4：首次启用 AI 判定的一次性确认（发送范围 / 目的地 / 留存都说清楚）
// W2：导出备份时剔除 AI Key（避免 Key 随备份文件落盘或被转发）
function settingsForExport(){
  const s=JSON.parse(JSON.stringify(store.settings||{}));
  if(s.ai) s.ai.key='';
  return s;
}
// ===== [2] 捕获与处理 =====
const API_HINTS=['wapi/zpgeek','wapi/zpjob','wapi/zpchat','wapi/zpim','friend/list','job_detail','job-detail','geek/job','geek/recommend','geek/search','message','chat/','im/','session','msg','geek/list'];

function isApiUrl(u){
  const s=absUrl(u);
  if(!s) return false;
  if(!/zhipin\.com/i.test(s)) return false;
  return API_HINTS.some(k=>s.toLowerCase().includes(k));
}
// 页面大量使用相对路径（/wapi/...），统一解析成绝对地址再匹配
function absUrl(u){
  try{ return new URL(String(u||''),location.href).href; }catch(e){ return String(u||''); }
}
function findArr(o,depth){
  if(depth>3||o==null) return null;
  if(Array.isArray(o)) return o.length?o:null;
  if(typeof o==='object'){
    for(const v of Object.values(o)){
      const r=findArr(v,depth+1);
      if(r) return r;
    }
  }
  return null;
}
function findJobDetail(o,depth){
  if(depth>4||o==null) return null;
  if(typeof o==='object'&&!Array.isArray(o)){
    if(o.jobId!==undefined&&(o.jobDesc!==undefined||o.jobName!==undefined)) return o;
    for(const v of Object.values(o)){ const r=findJobDetail(v,depth+1); if(r) return r; }
  }
  return null;
}
function jobIdFromUrl(u){
  let m=u.match(/job[_\-]?detail\/([^.\/?#]+)/i);
  if(m) return m[1];
  m=u.match(/[?&]jobId=([^&]+)/); if(m) return m[1];
  m=u.match(/\/geek\/job\/([^\/?#]+)/); if(m) return m[1];
  return '';
}
function classify(u,obj){
  if(/job_detail|job-detail|geek\/job/.test(u)) return 'jobDetail';
  if(/joblist|recommend|search|geek\/list/.test(u)) return 'jobList';
  if(/msg|message|chat|im\/|session|friend/.test(u)){
    const arr=findArr(obj,0);
    if(arr&&arr.length){
      const f=arr[0]||{};
      if(f.content!==undefined||f.msgId!==undefined||f.messageId!==undefined||f.msgContent!==undefined) return 'chatMessages';
      if(f.friendId!==undefined||f.brandName!==undefined||f.lastMsg!==undefined||f.bossName!==undefined) return 'chatList';
    }
    return /msg|message/.test(u)?'chatMessages':'chatList';
  }
  return null;
}
function detectStatus(obj,url){
  try{
    if(obj&&typeof obj==='object'){
      if(obj.code!==undefined&&obj.code!==0){
        const msg=String(obj.msg||obj.message||'');
        if(/下线|停止招聘|已下架|职位不存在/.test(msg)) return '下线';
        return '获取失败';
      }
    }
    const text=JSON.stringify(obj);
    if(/职位已下线|停止招聘|已下架|该职位不存在/.test(text)) return '下线';
    const jid=jobIdFromUrl(url);
    if(jid&&/job_detail|job-detail|geek\/job/.test(url)&&!findJobDetail(obj,0)) return '下线(疑似)';
  }catch(e){}
  return '在招';
}
function extractJob(item,source){
  const jobId=String(pick(item,['jobId','encryptJobId','jobUid'])||'');
  if(!jobId||jobId==='null'||jobId==='undefined') return {jobId:''};
  return {
    jobId,
    name:String(pick(item,['jobName','jobTitle','positionName'])||''),
    salary:String(pick(item,['salaryDesc','salary','salaryStr'])||''),
    city:String(pick(item,['cityName','city'])||''),
    exp:String(pick(item,['jobExperience','experience'])||''),
    edu:String(pick(item,['jobDegree','degree'])||''),
    company:String(pick(item,['brandName','companyName','brand'])||''),
    boss:String(pick(item,['bossName','bossTitle'])||''),
    active:pick(item,['bossActiveStatus','bossOnline','bossActive']),
    publish:toTs(pick(item,['lastModifyTime','publishTime','jobPubTime','modifyTime'])),
    jd:String(pick(item,['jobDesc','jobDescription','description','advantage'])||''),
    source
  };
}
// 薪资取起步值（用于判断下调/上调）
function salaryNum(s){
  const t=String(s||'').replace(/\s/g,'');
  let m=t.match(/(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)\s*[Kk千]/);
  if(m) return parseFloat(m[1])*1000;
  m=t.match(/(\d+(?:\.\d+)?)\s*[Kk千]/);
  if(m) return parseFloat(m[1])*1000;
  m=t.match(/(\d+)\s*元?\/(?:天|日)/);
  if(m) return parseFloat(m[1]);
  return null;
}
// 经验年限（取上限）；"不限/无经验" 记 0
// v0.7.3：先抓年限数字、再判"不限"——旧顺序会把混入"学历不限"的脏串误判成 0 级（「要求拔高」误报的元凶）
function expRank(s){
  const t=String(s||'');
  let m=t.match(/(\d+)\s*[-–~至]\s*(\d+)\s*年/);
  if(m) return parseInt(m[2],10);
  m=t.match(/(\d+)\s*年/);
  if(m) return parseInt(m[1],10);
  if(/不限|无经验|无需经验|无须经验|应届|在校/.test(t)) return 0;
  return null;
}
// v0.7.3：DOM 脏值清洗——旧版把整段标签串当经验值，展示与对比前先清洗成规范形态
function fmtExp(v){
  const t=String(v||'');
  if(t.indexOf('·')<0) return t;
  const m=t.match(/\d+\s*[-–~至]\s*\d+\s*年/);
  if(m) return m[0];
  if(/不限|无经验|无需经验|应届|在校/.test(t)) return '经验不限';
  return t.slice(0,12);
}
// v0.8.0：学历展示清洗（脏值只留学历词）
function fmtEdu(v){
  const c=canonEdu(v);
  return c||String(v||'').slice(0,12);
}
// v0.7.3：从页面标签数组里只挑「经验要求」标签（如 "1-3年" / "经验不限"）；挑不出就留空（宁缺毋滥）
function pickExpTag(arr){
  for(const x of (arr||[])){
    const t=String(x||'').trim();
    if(!t||t.length>12) continue;
    if(/\d+\s*[-–~至]\s*\d+\s*年|\d+\s*年/.test(t)) return t;
    if(/经验不限|无需经验|无经验|应届|在校/.test(t)) return t;
  }
  return '';
}
// 学历等级（越大越高）
function eduRank(s){
  const order=['不限','初中','中专','高中','大专','本科','硕士','博士'];
  const t=String(s||'');
  for(let i=order.length-1;i>=0;i--){ if(t.includes(order[i])) return i; }
  return null;
}
// ===== v0.9.0：监控项（我手动收录的岗位 / 公司）=====
// 设计口径（用户 2026-09-20 澄清）：
//   · 不再「浏览即建档」——没收录过的岗位，脚本一行都不记；
//   · 收录 = 面板粘贴「公司名 + 职位名」→ 站内搜索定位 → 抓一次详情 → 存首个快照；
//   · 职位项 = 公司 + 职位名 + HR名（同一岗位不同 HR 算两个项，跟进就靠这个区分）；
//   · 公司项 = 公司名（记录该公司新出现的岗位 / 在招数变化）。
function normKey(s){ return String(s==null?'':s).replace(/\s+/g,'').toLowerCase(); }
function itemIdOfJob(o){
  if(o&&o.jobId) return 'job:'+String(o.jobId);
  return 'job:'+normKey(o&&o.company)+'|'+normKey(o&&(o.name||o.jobName))+'|'+normKey(o&&(o.hr||o.boss));
}
function itemIdOfCompany(name){ return 'co:'+normKey(name); }
function watchList(){
  try{
    return Object.keys(store.watch||{}).map(k=>store.watch[k]).filter(Boolean)
      .sort((a,b)=>((b.lastChangeAt||b.lastSeenAt||b.addedAt||0)-(a.lastChangeAt||a.lastSeenAt||a.addedAt||0)));
  }catch(e){ return []; }
}
function watchJobs(){ return watchList().filter(x=>x.type!=='company'); }
function watchCompanies(){ return watchList().filter(x=>x.type==='company'); }
function openSignals(){ return (store.signals||[]).filter(s=>s.status==='open'); }
function signalsOfItem(id){ return (store.signals||[]).filter(s=>s.itemId===id); }
function changesOfItem(id){ return (store.changelog||[]).filter(c=>c.itemId===id); }
// 把一份岗位数据（卡片 / 详情 / 接口）归一成快照
function snapFromJob(job,base){
  const b=base||{};
  const s={
    ts:now(),
    name:String(job.name||b.name||''),
    company:String(job.company||b.company||''),
    salary:String(job.salary||b.salary||''),
    exp:String(canonExp(job.exp||b.exp||'')||''),
    edu:String(canonEdu(job.edu||b.edu||'')||''),
    hr:String(job.hr||job.boss||b.hr||''),
    status:String(job.status||b.status||'在招'),
    active:(job.active===undefined||job.active===null)?(b.active===undefined?null:b.active):job.active,
    labels:String(Array.isArray(job.labels)?job.labels.join('·'):(job.labels||b.labels||'')),
    city:String(job.city||b.city||''),
    address:String(job.address||b.address||''),
    companyJobs:(typeof job.companyJobs==='number')?job.companyJobs:(b.companyJobs||0),
    jd:String(job.jd||b.jd||''),
    publish:job.publish||b.publish||'',
    src:String(job.source||b.src||'')
  };
  if(job.partial){                       // 列表卡片：没有 JD / 地址 → 用旧值兜底，别误报「JD 变更」
    s.jd=b.jd||''; s.address=b.address||''; if(!s.salary) s.salary=b.salary||'';
    if(!s.exp) s.exp=b.exp||''; if(!s.edu) s.edu=b.edu||''; if(!s.hr) s.hr=b.hr||'';
    if(!s.labels) s.labels=b.labels||''; if(!s.city) s.city=b.city||'';
  }
  return s;
}
// 字段级对比：同一字段的旧值 → 新值；「空 → 有值」这类首次补全一律不算变化
function diffWatch(prev,cur){
  const out=[];
  const push=(field,from,to,level,text)=>{ out.push({field, from:String(from==null?'':from), to:String(to==null?'':to), level:level||'info', text:text}); };
  if(!prev) return out;
  // 1) 薪资（区分下调 / 上调）
  if(prev.salary&&cur.salary&&salaryChanged(prev.salary,cur.salary)){
    const repair=looksGarbled(prev.salary)&&!looksGarbled(cur.salary);
    // v0.9.1：新值是字体反爬乱码时不记变更 —— 乱码 → 明文算"补全"，明文 → 乱码同样不可信（宁可不判，也别判错）
    if(!repair&&!looksGarbled(cur.salary)){
      const a=salaryNum(prev.salary), b=salaryNum(cur.salary);
      const dir=(a!=null&&b!=null)?(b<a?'下调':(b>a?'上调':'')):'';
      push('薪资',prev.salary,cur.salary,dir==='下调'?'warn':'info','薪资'+(dir?'（'+dir+'）':'')+'：'+prev.salary+' → '+cur.salary);
    }
  }
  // 2) 经验 / 学历：两边都有值、且归一化后不同才算
  if(prev.exp&&cur.exp){
    const a=expRank(prev.exp), b=expRank(cur.exp);
    if(canonExp(prev.exp)!==canonExp(cur.exp)&&!(a!=null&&b!=null&&a===b)){
      const up=(a!=null&&b!=null&&b>a);
      push('经验',prev.exp,cur.exp,up?'warn':'info','经验要求：'+prev.exp+' → '+cur.exp+(up?'（要求拔高）':''));
    }
  }
  if(prev.edu&&cur.edu){
    const a=eduRank(prev.edu), b=eduRank(cur.edu);
    if(canonEdu(prev.edu)!==canonEdu(cur.edu)&&!(a!=null&&b!=null&&a===b)){
      const up=(a!=null&&b!=null&&b>a);
      push('学历',prev.edu,cur.edu,up?'warn':'info','学历要求：'+prev.edu+' → '+cur.edu+(up?'（要求拔高）':''));
    }
  }
  // 3) HR 换人 —— 同一岗位换了招聘者，这是「跟进」最该知道的信号
  if(prev.hr&&cur.hr&&normKey(prev.hr)!==normKey(cur.hr)){
    push('HR',prev.hr,cur.hr,'warn','HR 换人：'+prev.hr+' → '+cur.hr);
  }
  // 4) 状态（下线 / 重新在招）
  if(cur.status&&prev.status&&prev.status!==cur.status){
    push('状态',prev.status,cur.status,/下线|失败|关闭/.test(cur.status)?'alert':'info','状态：'+prev.status+' → '+cur.status);
  }
  // 5) 标签
  if(prev.labels&&cur.labels&&normKey(prev.labels)!==normKey(cur.labels)){
    push('标签',prev.labels,cur.labels,'info','标签：'+prev.labels+' → '+cur.labels);
  }
  // 6) 公司在招数（几百上千条在招 = 外包/劳务的硬信号）
  if(prev.companyJobs&&cur.companyJobs&&prev.companyJobs!==cur.companyJobs){
    push('在招数',prev.companyJobs,cur.companyJobs,'info','公司在招职位数：'+prev.companyJobs+' → '+cur.companyJobs);
  }
  // 7) JD 变化（只记摘要）
  if(prev.jd&&cur.jd&&jdNorm(prev.jd)!==jdNorm(cur.jd)){
    const d=lineDiff(prev.jd,cur.jd);
    if(d.added.length||d.removed.length){
      const t='JD 变更'+(d.removed.length?(' 删'+Math.min(d.removed.length,8)+'行'):'')+(d.added.length?(' 增'+Math.min(d.added.length,8)+'行'):'');
      push('JD',String(prev.jd).slice(0,60),String(cur.jd).slice(0,60),'info',t);
    }
  }
  return out;
}
// 跟进信号（待办）：只收「要你行动的」
function addSignal(sig){
  try{
    const s=Object.assign({id:uid(), ts:now(), status:'open', note:''}, sig||{});
    if(!s.itemId||!s.text) return null;
    const max=Math.max(50,(store.settings.watch&&store.settings.watch.sigMax)||200);
    // 同一监控项 + 同一类型 + 同样的「旧→新」在 10 分钟内不重复入库
    const dup=(store.signals||[]).some(x=>x.itemId===s.itemId&&x.kind===s.kind&&x.from===s.from&&x.to===s.to&&(now()-(x.ts||0))<10*60000);
    if(dup) return null;
    store.signals.unshift(s);
    if(store.signals.length>max) store.signals.length=max;
    save('signals');
    return s;
  }catch(e){ return null; }
}
function signalFromChange(item,ch,chgId){
  const kindMap={'薪资':'薪资变化','经验':'要求拔高','学历':'要求拔高','HR':'HR 换人','状态':'岗位状态','在招数':'公司在招数','JD':'JD 变更','标签':'标签变化'};
  const kind=kindMap[ch.field]||ch.field;
  let level=ch.level||'info';
  if(ch.field==='薪资'&&ch.level!=='warn') level='info';
  addSignal({itemId:item.id, chgId:chgId||'', kind, level, field:ch.field, from:ch.from, to:ch.to,
    text:(item.jobName||item.company||'')+'：'+ch.text});
}
// 把变化写进「变更日志」（原始流水）+ 生成「跟进信号」（待办）
function applyWatchChanges(item,changes,source){
  if(!item||!changes||!changes.length) return 0;
  let n=0;
  let judged=false;                      // 同一批变化只调一次 AI（省钱、也符合「出现需留意信号才调一次」）
  const max=Math.max(50,(store.settings.watch&&store.settings.watch.chgMax)||300);
  changes.forEach(ch=>{
    const text=ch.text||((ch.field||'')+'：'+ch.from+' → '+ch.to);
    const sig=JSON.stringify([item.id,ch.field,ch.from,ch.to]);
    if(item.lastChangeSig===sig&&(now()-(item.lastChangeAt||0))<10*60000) return;   // 同一条变化 10 分钟内不重复
    item.lastChangeSig=sig; item.lastChangeAt=now();
    const entry={id:uid(), ts:now(), itemId:item.id, jobId:item.jobId||'', field:ch.field, from:ch.from, to:ch.to,
      source:source||'', text, jobName:item.jobName||'', company:item.company||'', hr:item.hr||'',
      changes:[text], level:ch.level||'info'};
    store.changelog.unshift(entry);
    if(store.changelog.length>max) store.changelog.length=max;
    signalFromChange(item,ch,entry.id);
    // AI 判定（可选、默认关）：只在「需留意 / 重要」这类变化上调用一次
    if(!judged&&(entry.level==='warn'||entry.level==='alert')){ judged=true; }   // AI 判定交给 boss-insight（读本机镜像）
    n++;
  });
  if(n){ save('changelog','signals'); }
  return n;
}
function markSeen(item,ts){
  if(!item) return;
  item.lastSeenAt=ts||now();
  if(item.type!=='company') item.lastCompareAt=item.lastSeenAt;
}
// 风险规则（JD / 薪资 / 公司名命中风险词 → 记一条风险命中）
// 观察一个页面上的岗位：只有「已收录」的才更新（v0.9.0：不再整页建档）
function observeJob(job){
  const jid=job.jobId; if(!jid) return;
  const item=store.jobs[jid];
  if(!item||!item.itemId) return;
  const next=snapFromJob(job,item.last);
  if(!next.name&&item.meta&&item.meta.name) next.name=item.meta.name;
  if(!next.company&&item.meta&&item.meta.company) next.company=item.meta.company;
  const chs=diffWatch(item.last,next);
  item.meta=Object.assign({},item.meta||{},{name:next.name||(item.meta&&item.meta.name)||'',
    company:next.company||(item.meta&&item.meta.company)||'', city:next.city||(item.meta&&item.meta.city)||'',
    url:job.detailUrl||(item.meta&&item.meta.url)||''});
  item.jobName=item.meta.name; item.company=item.meta.company;
  if(next.hr) item.hr=next.hr;
  item.last=next;
  item.snapshots=item.snapshots||[];
  // v0.9.1：只在「真有变化（或这是第一份快照）」时才进历史 —— 原来页面 Vue 状态每 5 秒回传一次就无脑 push，
  // 20 格历史两三分钟就被一模一样的快照冲满，真正有意义的历史（收录时的状态、每次变化前的状态）全被挤掉
  if(chs.length||!item.snapshots.length) item.snapshots.push(next);
  const keep=Math.max(3,(store.settings.watch&&store.settings.watch.snapHistory)||20);
  if(item.snapshots.length>keep) item.snapshots.shift();
  markSeen(item,next.ts);
  if(chs.length){
    applyWatchChanges(item,chs,next.src||job.source||'page');
    log('监控：'+(next.name||jid)+' 有 '+chs.length+' 项变化');
    if(/下线|失败|关闭/.test(next.status||'')) { item.offlineAt=now(); }
    else if(item.offlineAt&&!/下线|失败|关闭/.test(next.status||'')) { item.relistedAt=now(); item.offlineAt=0; }
    scheduleRender();
  }
  // v0.9.1：必须同时写 'watch' 键 —— 监控项和 store.jobs[jobId] 是同一个对象，
  // 原来只写 bw_jobs 不写 bw_watchlist，而下次开页 loadStore 会用 bw_watchlist 的旧数据**覆盖** jobs 条目：
  // 浏览时更新的最新快照 / HR 名 / 元数据全部丢失，已记录过的变更还会被重复报一遍
  save('watch','jobs','changelog','signals');
}
// 兼容旧调用点：v0.9.0 起档案只装「我收录的」，不再有上限清理
function processJobList(obj){
  const arr=findArr(obj,0); if(!arr) return;
  rememberApiJobs(obj);      // v0.9.0：明文薪资索引只留在内存（当前页），不落盘
  arr.forEach(it=>{
    if(!it||typeof it!=='object') return;
    const job=extractJob(it,'list');
    if(!job.jobId) return;
    observeJob(Object.assign({},job,{partial:true}));
  });
}
// 列表接口的明文薪资索引（绕开字体反爬）
function rememberApiJobs(obj){
  try{
    const arr=findArr(obj,0);
    if(!Array.isArray(arr)) return 0;
    let n=0;
    arr.forEach(it=>{
      if(!it||typeof it!=='object') return;
      const jid=String(pick(it,['encryptJobId','jobId'])||'');
      if(!jid) return;
      store.apiJobs[jid]={ts:now(),
        salary:String(pick(it,['salaryDesc','salary'])||''),
        name:String(pick(it,['jobName'])||''),
        company:String(pick(it,['brandName','companyName'])||'')};
      n++;
    });
    const keys=Object.keys(store.apiJobs);
    if(keys.length>2000){
      keys.sort((a,b)=>((store.apiJobs[a].ts||0)-(store.apiJobs[b].ts||0)))
        .slice(0,keys.length-2000).forEach(k=>{ delete store.apiJobs[k]; });
    }
    return n;
  }catch(e){ return 0; }
}
function apiJobOf(jid){ return (store.apiJobs&&store.apiJobs[jid])||null; }
function looksGarbled(s){ return !s||/[\uE000-\uF8FF\uFFFD]/.test(String(s)); }
// 已有记录里薪资是乱码/空的，用接口明文补上（不写变更日志，避免假“薪资变化”）
// ===== 从页面 DOM 抓岗位（列表页是服务端渲染时，接口里根本没有这些数据）=====
function domText(el){ return el?String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim():''; }
// BOSS 有字体反爬：薪资/数字可能是私用区字符（看着是数字，文本是乱码）→ 丢弃，宁缺勿错
function cleanGarbled(s){
  const t=String(s||'');
  return (t&&looksGarbled(t))?'':t;
}
function domPick(root,sels){
  for(const s of sels){ try{ const t=domText(root.querySelector(s)); if(t) return t; }catch(e){} }
  return '';
}
function scrapeListDom(){
  let n=0;
  try{
    const links=Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]'));
    const seen={};
    links.forEach(a=>{
      try{
        const href=a.getAttribute('href')||a.href||'';
        const jid=jobIdFromUrl(href);
        if(!jid||seen[jid]) return;
        seen[jid]=1;
        let card=a;
        for(let i=0;i<7&&card&&card.tagName!=='LI';i++) card=card.parentElement;
        if(!card) card=a;
        const txt=domText(card);
        if(!txt) return;
        const api=apiJobOf(jid);
        const name=(api&&api.name)||domPick(card,['.job-name','[class*="job-name"]','[class*="jobName"]','.job-title'])||'';
        const salary=(api&&api.salary)||cleanGarbled(domPick(card,['.salary','[class*="salary"]'])||((txt.match(/\d+\s*[-–~]\s*\d+\s*K(?:·\d+薪)?/)||[])[0]||''));
        const company=(api&&api.company)||domPick(card,['.company-name','[class*="company-name"]','[class*="companyName"]','[class*="brandName"]'])||'';
        const area=domPick(card,['.job-area','[class*="job-area"]','[class*="jobArea"]'])||'';
        const tags=Array.prototype.slice.call(card.querySelectorAll('ul[class*="tag"] li,ol[class*="tag"] li'))
          .map(domText).filter(Boolean).slice(0,6);   // v0.7.3：保留数组，经验标签由 pickExpTag 单独挑
        if(!name&&!salary) return;
        let detailUrl=href;
        try{ detailUrl=new URL(href,location.href).href; }catch(e){}
        if(store.jobs[jid]){                       // v0.9.0：只更新「已收录」的岗位
          observeJob(extractJob({jobId:jid, jobName:name, salaryDesc:salary, companyName:company,
            cityName:area, jobExperience:pickExpTag(tags), detailUrl},'dom-list'));
          n++;
        }
      }catch(e){}
    });
    if(n){ log('列表页 DOM：对比了 '+n+' 个已收录岗位'); scheduleRender(); }
  }catch(e){}
  return n;
}
function isDetailPage(){ return /\/job_detail\/|\/job-detail\//.test(location.pathname); }
// 公司「在招职位数」：几百上千条在招 = 人力/外包公司的硬信号（详情页/公司页上就有）
function scrapeCompanyJobCount(root,company){
  try{
    const name=String(company||'').trim();
    if(!name) return 0;
    const txt=domText(root||document);
    if(!txt) return 0;
    const m=txt.match(/在招职位\s*[：:]?\s*(\d+)/)||txt.match(/(\d+)\s*个在招职位/)||txt.match(/招聘中\s*[：:]?\s*(\d+)/)||txt.match(/在招\s*(\d+)\s*个/);
    const n=m?parseInt(m[1],10):0;
    if(n>200000) return 0;
    // 顺带把公司页上才有的信息（规模/行业/融资）也记下来
    const scale=(txt.match(/(\d+-\d+人|\d+人以上|10000人以上|1000-9999人)/)||[])[1]||'';
    const stage=(txt.match(/(未融资|天使轮|A轮|B轮|C轮|D轮及以上|已上市|不需要融资)/)||[])[1]||'';
    const ind=(txt.match(/(互联网|电子商务|企业服务|人力资源服务|劳务派遣|中介服务|教育培训|金融|房地产|制造业|批发零售|文化传媒|医疗健康|物流运输|餐饮|生活服务)/)||[])[1]||'';
    if(!n&&!scale&&!stage&&!ind) return 0;
    store.companyJobs=store.companyJobs||{};
    const prev=store.companyJobs[name]||{};
    const next={count:n||prev.count||0, scale:scale||prev.scale||'', stage:stage||prev.stage||'', industry:ind||prev.industry||'', ts:now()};
    if(!prev.ts||prev.count!==next.count||prev.scale!==next.scale||prev.stage!==next.stage||prev.industry!==next.industry){
      store.companyJobs[name]=next;
      mirrorCompanyJobs(); save('companyJobs');
    }
    return next.count;
  }catch(e){ return 0; }
}
// ===== v0.9.2：镜像键的容量与保鲜 =====
// 原来 bw_company_jobs / bw_job_addr / bw_insight_in 三个键只增不减、没有 TTL，
// 撑满同源 5MB 配额后 setItem 抛异常被 catch(e){} 吞掉 —— 镜像永久冻结、面板不报错，
// filter / insight 一直读到旧数据，你只会觉得「公司地址怎么一直不变」。
const MIRROR_CAP=800;                 // 每个镜像最多留多少条（按新鲜度淘汰）
const MIRROR_TTL=30*24*3600*1000;     // 30 天没更新的条目丢掉
const MIRROR_MAX_CHARS=1200000;       // 单个键的字符上限（给同源其它脚本留配额余量）
let mirrorWarnAt=0;
function mirrorWarn(msg){
  try{
    const t=now();
    if(t-(mirrorWarnAt||0)<5*60000) return;   // 同类提示 5 分钟最多一次，不刷屏
    mirrorWarnAt=t;
    log('镜像写入失败：'+msg+'（本机存储可能已满，面板「设置 → 清空全部数据」可释放）');
  }catch(e){}
}
// 按 TTL + 条数上限裁剪一个 {key:{...,ts}} 表，返回新对象
function pruneMap(obj){
  const t=now();
  let ent=Object.keys(obj||{}).map(k=>({k,v:obj[k]}));
  ent=ent.filter(e=>{ const ts=(e.v&&(e.v.ts||e.v.at))||0; return !ts||t-ts<MIRROR_TTL; });
  if(ent.length>MIRROR_CAP){
    ent.sort((a,b)=>(((b.v&&(b.v.ts||b.v.at))||0)-((a.v&&(a.v.ts||a.v.at))||0)));
    ent=ent.slice(0,MIRROR_CAP);
  }
  const out={};
  ent.forEach(e=>{ out[e.k]=e.v; });
  return out;
}
// 统一的镜像落盘：裁剪 → 按字符上限收缩 → 写。失败不静默（会写一条日志并在面板可见）
function putMirror(key,obj,forcePlain){
  try{
    const out=forcePlain?Object.assign({},obj):pruneMap(obj);
    let s=JSON.stringify(out);
    while(s.length>MIRROR_MAX_CHARS&&Object.keys(out).length>0){
      const ks=Object.keys(out), keep=Math.max(1,Math.floor(ks.length*0.7));
      const cut={}; ks.slice(0,keep).forEach(k=>{ cut[k]=out[k]; });
      Object.keys(out).forEach(k=>{ delete out[k]; });
      Object.keys(cut).forEach(k=>{ out[k]=cut[k]; });
      s=JSON.stringify(out);
    }
    localStorage.setItem(key,s);
    return out;
  }catch(e){ mirrorWarn(key+'：'+((e&&e.name)||(e&&e.message)||'写入失败')); return null; }
}
function mirrorCompanyJobs(){
  const out=putMirror('bw_company_jobs',store.companyJobs||{});
  if(out) store.companyJobs=out;   // 内存里同步裁剪，否则 GM 侧的档案还是会一直长
}
// 工作地址：卡片上写的是「深圳·南山区」，详情页的「工作地址」才是真的（可能完全不同区）
function extractAddress(root){
  try{
    const txt=domText(root||document);
    const m=txt.match(/(?:工作地址|上班地址|详细地址|办公地址)\s*[:：]?\s*([^\n]{4,90})/);
    if(m) return m[1].trim();
  }catch(e){}
  return '';
}
function areaOf(addr){
  const t=String(addr||'');
  const m=t.match(/([\u4e00-\u9fa5]{2}区|[\u4e00-\u9fa5]{2}县|[\u4e00-\u9fa5]{2}镇|[\u4e00-\u9fa5]{2,4}街道)/);
  return m?m[1]:'';
}
function saveJobAddr(jobId,addr){
  try{
    const jid=String(jobId||'').trim();
    const a=String(addr||'').trim();
    if(!jid||!a) return '';
    store.jobAddr=store.jobAddr||{};
    const area=areaOf(a);
    const prev=store.jobAddr[jid]||{};
    if(prev.addr!==a){
      store.jobAddr[jid]={addr:a.slice(0,90), area, ts:now()};
      const kept=putMirror('bw_job_addr',store.jobAddr);
      if(kept) store.jobAddr=kept;   // v0.9.2：内存跟着裁剪，键才不会再长回去
      save('jobAddr');
    }
    return area;
  }catch(e){ return ''; }
}
function isCompanyPage(){ return /\/gongsi\//.test(location.pathname); }
// v0.9.2：JD 兜底扫描的结果缓存（见函数内注释）
const jdTextCache={};
function detailJdText(root){
  const sels=['.job-sec-text','[class*="job-sec-text"]','.job-detail-section .text','.detail-content .text','.job-detail .text'];
  for(const s of sels){
    try{
      const t=Array.prototype.slice.call(root.querySelectorAll(s)).map(domText).filter(x=>x.length>30).join('\n');
      if(t) return t.slice(0,6000);
    }catch(e){}
  }
  let best='';
  // v0.9.2：这段兜底原来是「遍历全文档所有 div/section、每个都序列化一遍 innerText」，
  // 详情页每 12 秒跑一次，长 JD 页面滚动时明显卡顿。加两道闸：
  // ① 结果缓存 —— 同一个岗位的 JD 只算一次（页面没换就不重算）；
  // ② 只扫详情容器，容器找不到才退回整页，且给元素数封顶。
  const cacheKey=jobIdFromUrl(location.pathname)||jobIdFromUrl(location.href)||location.pathname;
  try{
    const c=jdTextCache[cacheKey];
    if(c&&c.root===root&&now()-c.at<5*60000) return c.text;
  }catch(e){}
  try{
    const scope=root&&root.querySelectorAll?root:document;
    const all=scope.querySelectorAll('div,section');
    for(let i=0;i<all.length&&i<1500;i++){
      const el=all[i];
      if(el.children.length>3) continue;
      const t=domText(el);
      if(t.length>best.length&&t.length>80) best=t;
    }
  }catch(e){}
  best=best.slice(0,6000);
  try{
    jdTextCache[cacheKey]={root, at:now(), text:best};
    const ks=Object.keys(jdTextCache);
    if(ks.length>20){ ks.sort((a,b)=>jdTextCache[a].at-jdTextCache[b].at).slice(0,ks.length-20).forEach(k=>{ delete jdTextCache[k]; }); }
  }catch(e){}
  return best;
}
// 「监控」的正门：你打开某个岗位详情 = 开始盯住它
// v0.9.2：详情页「没变化就不重扫」的缓存（见 scrapeDetailDom）
const detailScanCache={};
function scrapeDetailDom(){
  let n=0;
  try{
    if(!isDetailPage()) return 0;
    const jid=jobIdFromUrl(location.pathname)||jobIdFromUrl(location.href);
    if(!jid) return 0;
    // v0.9.2：详情页每 12 秒会调到这里一次。页面没变（同一 jid、DOM 节点数没动、两分钟内）
    // 就直接跳过 —— 原来每轮都要重新挑一遍选择器、抓一遍 JD、算一遍地址，纯白烧 CPU。
    // 页面真变了（切岗位、展开 JD、公司信息异步补上）节点数会变，那时立刻放行。
    try{
      const nodes=document.getElementsByTagName('*').length;
      const c=detailScanCache[jid];
      if(c&&c.nodes===nodes&&now()-c.at<2*60000) return 0;
      detailScanCache[jid]={nodes, at:now()};
      const ks=Object.keys(detailScanCache);
      if(ks.length>20){ ks.sort((a,b)=>detailScanCache[a].at-detailScanCache[b].at).slice(0,ks.length-20).forEach(k=>{ delete detailScanCache[k]; }); }
    }catch(e){}
    const root=document.querySelector('.job-detail-box,.job-detail,.job-primary,#main,.page-job-detail')||document.body;
    const api=apiJobOf(jid);
    const name=(api&&api.name)||domPick(root,['.job-name','[class*="job-name"]','[class*="jobName"]','.name h1','h1'])||'';
    const salary=(api&&api.salary)||cleanGarbled(domPick(root,['.salary','[class*="salary"]','.job-salary'])||'');
    const company=(api&&api.company)||domPick(root,['.company-info .name','.sider-company .name','[class*="company-name"]','[class*="companyName"]'])||'';
    const tags=Array.prototype.slice.call(root.querySelectorAll('.tag-list li,[class*="tag"] li,.job-tags span,.job-keyword-list li'))
      .map(domText).filter(Boolean).slice(0,8);   // v0.7.3：保留数组，经验标签由 pickExpTag 单独挑
    const jd=detailJdText(root);
    if(!name&&!salary&&!jd) return 0;
    scrapeCompanyJobCount(document,company);   // 顺手记下公司在招职位数（外包硬信号）
    const addr=extractAddress(document);
    if(addr) saveJobAddr(jid,addr);            // 详情页的「工作地址」才是真的（卡片上的区可能不对）
    let companyUrl='';
    try{ const a=document.querySelector('a[href*="/gongsi/"]'); if(a) companyUrl=new URL(a.getAttribute('href')||'',location.href).href; }catch(e){}
    // v0.9.0：只有「已收录」的岗位才更新（没收录的详情页 = 什么都不记）
    if(store.jobs[jid]){
      observeJob(extractJob({jobId:jid, jobName:name, salaryDesc:salary, companyName:company,
        jobExperience:pickExpTag(tags), jobDesc:jd, detailUrl:location.href, companyUrl, address:addr},'detail-dom'));
      n=1;
    }
    scheduleRender();
  }catch(e){}
  return n;
}
function autoScan(force){
  try{
    // 聊天页交给 boss-chat.user.js
    if(isCompanyPage()){ return scrapeCompanyJobCount(document, domPick(document,['.company-name','[class*="company-name"]','h1','.name'])||''); }
    if(isDetailPage()){ askVue(); return scrapeDetailDom(); }   // v0.8.0：详情页 Vue 数据由主路回传，DOM 兜底照旧
    // v0.9.0：只对比「已收录」的岗位；没收录的岗位不再建档（整页预处理已删除）
    let n=0;
    try{ n=vueDirect(); }catch(e){}
    if(!n) n=scrapeListDom();
    return n;
  }catch(e){}
  return 0;
}
// ===== 聊天页 DOM 兜底：你打开哪个会话，就收录哪个会话 =====
// 按公司名找已存在的会话 key（DOM 兜底时用来对齐接口抓到的会话，避免造出假 key）
function processJobDetail(obj,url){
  const status=detectStatus(obj,url);
  const d=findJobDetail(obj,0);
  if(!d){
    const jid=jobIdFromUrl(url);
    if(jid&&store.jobs[jid]) observeJob({jobId:jid, status, source:'detail-api', noContent:true});
    return;
  }
  const job=extractJob(d,'detail');
  job.status=status;
  job.detailUrl=url;
  if(job.jobId) observeJob(job);
}
// HR 上下线：把接口/DOM 里能看到的活跃状态记成一条时间线（用于判断"已读不回"是不是对方不在线）
// 聊天文本清洗：去掉「已读/送达」状态词、时间戳；过滤系统提示
function maybeStoreResponse(reqUrl,resUrl,body,source){
  if(!body||body.length>2000000) return;
  let obj=null;
  try{ obj=JSON.parse(body); }catch(e){ return; }
  if(!obj||typeof obj!=='object') return;
  const u=resUrl||reqUrl||'';
  const capKey=u+'|'+body.length;
  const capTs=now();
  if(capKey===lastCapKey&&(capTs-lastCapTs)<1500) return; // 双通道（页面世界 + 沙箱）去重
  lastCapKey=capKey; lastCapTs=capTs;
  const p=pathOf(u);
  const type=classify(u,obj);
  const c=store.captured[p]||(store.captured[p]={url:u,type:type||'?',first:now(),count:0,last:now()});
  c.count++; c.last=now();
  if(store.settings.observe){ try{ console.log('[boss-watcher]',type||'unknown',u); }catch(e){} }
  if(type==='jobList') processJobList(obj);
  else if(type==='jobDetail') processJobDetail(obj,u);
  // 聊天数据已拆到独立脚本 boss-chat.user.js（固定在聊天页）
  save('captured');
  scheduleRender();
}
// 关键：带 @grant 的用户脚本跑在 Tampermonkey 沙箱里，那里的 window.fetch / XMLHttpRequest
// 都不是页面的真实对象，改它们对页面请求毫无影响（钩子会「静默失效」）。
// 必须挂到页面真实 window（unsafeWindow）上，被动捕获才会有数据。
function pageWin(){
  try{ return (typeof unsafeWindow!=='undefined'&&unsafeWindow)?unsafeWindow:window; }catch(e){ return window; }
}
function hookFetch(){
  const W=pageWin();
  if(!W||W.__bwFetchHooked) return false;
  if(typeof W.fetch!=='function') return false;
  W.__bwFetchHooked=true;
  const orig=W.fetch.bind(W);
  W.fetch=function(input,init){
    const reqUrl=absUrl(typeof input==='string'?input:(input&&input.url)||'');
    const p=orig.apply(this,arguments);
    if(isApiUrl(reqUrl)){
      p.then(res=>{
        try{
          const ru=res.url||reqUrl;
          if(isApiUrl(ru)){
            res.clone().text().then(t=>maybeStoreResponse(reqUrl,ru,t,'fetch')).catch(()=>{});
          }
        }catch(e){}
      }).catch(()=>{});
    }
    return p;
  };
  return true;
}
function hookXHR(){
  const W=pageWin();
  if(!W||W.__bwXhrHooked) return false;
  const XHR=W.XMLHttpRequest;
  if(!XHR||!XHR.prototype) return false;
  W.__bwXhrHooked=true;
  const origOpen=XHR.prototype.open;
  const origSend=XHR.prototype.send;
  XHR.prototype.open=function(m,u){
    this.__bwUrl=absUrl((typeof u==='string')?u:(u&&u.url)||'');
    return origOpen.apply(this,arguments);
  };
  XHR.prototype.send=function(){
    this.addEventListener('load',function(){
      try{
        const u=this.__bwUrl||'';
        if(!isApiUrl(u)) return;
        let t=null;
        if(this.responseType===''||this.responseType==='text') t=this.responseText;
        else if(this.responseType==='json'&&this.response) t=JSON.stringify(this.response);
        if(t) maybeStoreResponse(u,u,t,'xhr');
      }catch(e){}
    });
    return origSend.apply(this,arguments);
  };
  return true;
}
function hookStatus(){
  const W=pageWin();
  let fetchOk=false, xhrOk=false;
  try{ fetchOk=!!(W&&W.__bwFetchHooked); }catch(e){}
  try{ xhrOk=!!(W&&W.__bwXhrHooked); }catch(e){}
  return {fetch:fetchOk, xhr:xhrOk, captured:Object.keys(store.captured||{}).length};
}
function hookDiagHtml(){
  const h=hookStatus();
  if(h.fetch||h.xhr||mainHookReady) return '';
  return '<div class="bw-note bw-warn">⚠ 捕获钩子没有生效：现在浏览 BOSS 不会进任何数据。'+
    '请把脚本更新到 v'+VERSION+' 或更高，并强制刷新页面（Ctrl+Shift+R）。</div>';
}
// v0.8.0：环境提示（未登录 / 同时跑着多个版本的监控脚本）——都是「为什么没数据」的直接答案
function isLoginPage(){
  try{
    if(/^\/web\/user\//.test(location.pathname)) return true;
    const t=domText(document.body||document).slice(0,400);
    return /验证码登录\/注册|APP扫码登录/.test(t);
  }catch(e){ return false; }
}
function instanceNotesHtml(){
  let html='';
  try{
    if(isLoginPage()) html+='<div class="bw-note bw-warn">⚠ 当前页面是<b>未登录状态</b>：BOSS 的岗位列表/详情要登录后才有数据，未登录时脚本读不到岗位。先登录，再正常浏览职位页。</div>';
  }catch(e){}
  try{
    // v0.9.2：心跳改成「按标签页」而不是「按版本号」。
    // 原来 key 就是版本号，脚本一更新、10 分钟内再开一个页面 → 两个 key 同时新鲜，
    // 面板立刻红字「检测到同时运行着 2 个版本」—— 你去篡改猴里找，根本没有旧版本。
    const inst=JSON.parse(localStorage.getItem('bw_instances')||'{}');
    const t=now();
    Object.keys(inst).forEach(k=>{ if(t-(inst[k]||0)>10*60000) delete inst[k]; });   // 10 分钟没心跳 = 页面关了/崩了
    const live=Object.keys(inst).length;
    const vers={};
    Object.keys(inst).forEach(k=>{ const v=(inst[k]&&inst[k].v)||''; if(v) vers[v]=1; });
    const vlist=Object.keys(vers);
    if(vlist.length>1){
      html+='<div class="bw-note bw-warn">⚠ 检测到<b>同时运行着 '+vlist.length+' 个版本的岗位监控脚本</b>（'+esc(vlist.join(' / '))+'）——两个版本会各写各的档案，互相打架。请到<b>篡改猴 → 已安装脚本</b>里删掉旧版本，只留最新版。</div>';
    }else if(live>1){
      // 同一版本开了多个标签页：这不是故障，说明白就行，别吓人
      html+='<div class="bw-note">本脚本在 <b>'+live+' 个标签页</b>里同时开着（版本都是 '+esc(vlist[0]||VERSION)+'）。同一个版本共用一个本地档案，不会打架；只是每页各自读一次页面数据，嫌费电就关掉多余的标签页。</div>';
    }
  }catch(e){}
  return html;
}
// v0.8.0：实时取数状态条 —— 回答「面板数字从哪来」：显示最近一轮从页面 Vue 组件读到的
// 岗位数 / 对比 / 新增 / 变更与时间；取不到时给出下一步动作（滚动列表 / 收录 / 强刷）
function vueFetchHtml(){
  try{
    if(!/zhipin\.com/.test(location.hostname)) return '';
    if(isLoginPage()) return '';   // 未登录已由 instanceNotesHtml 提示，不重复刷屏
    const s=vueStats||{};
    if(!s.at){
      const hk=hookStatus();
      const hook=(hk.fetch||hk.xhr)?'捕获钩子已就绪':('捕获钩子未生效'+(hk.captured?('（已捕获 '+hk.captured+' 个接口响应）'):''));
      return '<div class="bw-note">实时取数（页面组件 Vue）：<b>还没读到岗位</b> · '+hook+'。滚动一下职位列表，或点下面的「收录当前页岗位」；仍不行就 Ctrl+Shift+R 强刷。</div>';
    }
    const ago=Math.max(0,Math.round((now()-s.at)/1000));
    const when=ago<5?'刚刚':(ago<60?(ago+' 秒前'):(Math.round(ago/60)+' 分钟前'));
    return '<div class="bw-note">实时取数（页面组件 Vue，只读·不发请求）：<b>✓ 读到 '+s.list+' 个岗位</b>'+
      (s.detail?'（含当前详情页）':'')+' · 对比 '+s.compared+' · 新增 '+s.added+' · 变更 '+s.changed+' · '+when+'</div>';
  }catch(e){ return ''; }
}

// ===== 页面世界钩子（v0.2.4）=====
// 带 @grant 的脚本跑在油猴沙箱里，`unsafeWindow` 在部分 Chrome + 油猴组合下只是
// 页面 window 的「克隆」，改它并不会影响页面真实请求。最稳的做法是把钩子代码作为
// <script> 注入页面世界，捕获到的响应再通过 window.postMessage 回传给沙箱。
let mainHookReady=false;
let lastCapKey='', lastCapTs=0;
function mainHookSource(){
  return '('+function(){
    try{
      var W=window;
      if(W.__bwMainHooked){ W.postMessage({__bwReady:1,again:1},'*'); return; }
      W.__bwMainHooked=1;
      var stat={fetch:0,xhr:0,api:0}, lastTick=0, paths={};
      // 页面大量使用相对路径（/wapi/...）发请求，必须先解析成绝对地址再匹配
      function abs(u){ try{ return new URL(u,location.href).href; }catch(e){ return String(u||''); } }
      function note(u){ try{ var p=new URL(u,location.href).pathname.slice(0,90); paths[p]=(paths[p]||0)+1; }catch(e){} }
      function isApi(u){ return !!u&&/zhipin\.com/i.test(u); }
      function post(m){ try{ W.postMessage(m,'*'); }catch(e){} }
      function tick(force){ var t=Date.now(); if(!force&&t-lastTick<1500) return; lastTick=t; stat.paths=paths; post({__bwStat:stat}); }
      var tickTimer=null;
      // 有捕获时补发一次统计，保证诊断计数不会停在旧快照上
      function tickLater(){ if(tickTimer) return; tickTimer=setTimeout(function(){ tickTimer=null; tick(true); },600); }
      function report(u,b,k){ stat.api++; post({__bwCap:1,url:u,body:b,kind:k}); tick(); tickLater(); }
      var of=W.fetch;
      if(typeof of==='function'){
        W.fetch=function(input,init){
          var reqUrl=abs((typeof input==='string')?input:(input&&input.url)||'');
          stat.fetch++; note(reqUrl);
          var p=of.apply(this,arguments);
          try{
            if(isApi(reqUrl)) p.then(function(res){
              try{
                var ru=res.url||reqUrl;
                if(isApi(ru)) res.clone().text().then(function(t){ report(ru,t,'fetch'); },function(){});
              }catch(e){}
            },function(){});
          }catch(e){}
          tick();
          return p;
        };
      }
      var X=W.XMLHttpRequest;
      if(X&&X.prototype){
        var oOpen=X.prototype.open, oSend=X.prototype.send;
        X.prototype.open=function(m,u){
          try{ this.__bwUrl=abs((typeof u==='string')?u:(u&&u.url)||''); note(this.__bwUrl); }catch(e){}
          return oOpen.apply(this,arguments);
        };
        X.prototype.send=function(){
          var self=this;
          stat.xhr++;
          try{
            self.addEventListener('load',function(){
              try{
                var u=self.__bwUrl||'';
                if(!isApi(u)) return;
                var t=null;
                if(self.responseType===''||self.responseType==='text') t=self.responseText;
                else if(self.responseType==='json'&&self.response) t=JSON.stringify(self.response);
                if(t) report(u,t,'xhr');
              }catch(e){}
            });
          }catch(e){}
          var r=oSend.apply(this,arguments);
          tick();
          return r;
        };
      }
      // ===== v0.8.0：Vue 组件状态直读（主路）=====
      // 依据（deliver v1.4.0 已实测）：页面是 Vue 2，组件实例挂在元素 __vue__ 上；
      // 列表组件的 jobList、详情组件的 jobDetail 都是「页面正在展示的实时数据」——只读，不发任何请求。
      function bwxNum(x){ return (typeof x==='number'&&isFinite(x))?x:0; }
      function bwxJob(it){
        if(!it||typeof it!=='object') return null;
        var jid=it.encryptJobId||it.encryptId||it.jobId;
        if(!jid) return null;
        return {
          jobId:String(jid),
          name:String(it.jobName||it.jobTitle||''),
          salary:String(it.salaryDesc||it.salary||''),
          exp:String(it.jobExperience||it.experience||''),
          edu:String(it.jobDegree||it.degree||''),
          labels:(it.jobLabels||it.skills||[]).slice(0,8).map(String),
          company:String(it.brandName||it.companyName||''),
          scale:String(it.brandScaleName||''),
          industry:String(it.brandIndustry||''),
          stage:String(it.brandStageName||''),
          boss:String(it.bossName||it.bossTitle||''),
          online:(it.bossOnline===true||it.bossOnline===1)?1:0,
          gold:(it.goldHunter===true||it.goldHunter===1)?1:0,
          proxy:(it.proxyJob===true||it.proxyJob===1)?1:0,
          city:String(it.cityName||it.locationName||''),
          area:String(it.areaDistrict||''),
          biz:String(it.businessDistrict||''),
          publish:bwxNum(it.lastModifyTime)||bwxNum(it.jobPubTime)||bwxNum(it.modifyTime),
          sec:String(it.securityId||''),
          contact:(it.contact===true||it.contact===1)?1:0,
          valid:String(it.jobValidStatus||'')
        };
      }
      function bwxList(){
        var sels=['.page-jobs-main','.job-recommend-main','#wrap .page-job-wrapper','#wrap'];
        var best=null;
        function take(el){
          try{
            var v=el&&el.__vue__; if(!v) return;
            var jl=v.jobList; if(!jl||typeof jl.length!=='number'||!jl.length) return;
            if(!best||jl.length>best.length) best=jl;
          }catch(e){}
        }
        for(var i=0;i<sels.length;i++){ try{ take(document.querySelector(sels[i])); }catch(e){} }
        if(!best){
          try{
            var all=document.querySelectorAll('div');
            for(var j=0;j<all.length&&j<5000;j++){ take(all[j]); if(best&&best.length>=80) break; }
          }catch(e){}
        }
        if(!best) return [];
        var out=[];
        for(var k=0;k<best.length&&k<800;k++){ var it=bwxJob(best[k]); if(it) out.push(it); }
        return out;
      }
      function bwxDetail(){
        try{
          var all=document.querySelectorAll('div,section,main,article');
          for(var j=0;j<all.length&&j<6000;j++){
            var v=all[j].__vue__; if(!v) continue;
            var d=v.jobDetail||v.jobInfo||v.detailData||v.jobData;
            if(!d||typeof d!=='object') continue;
            if(!d.jobName&&!d.jobDescription) continue;
            var it=bwxJob(d)||{};
            it.jd=String(d.jobDescription||d.jobDesc||d.description||'');
            it.addr=String(d.locationName||d.locationAddress||d.address||d.jobAddress||'');
            it.status=String(d.jobStatusDesc||'');
            it.legal=String(d.brandName||'');
            return it;
          }
        }catch(e){}
        return null;
      }
      function bwxPush(){
        try{ post({__bwVue:1, list:bwxList(), detail:bwxDetail()}); }catch(e){}
      }
      try{
        W.addEventListener('message',function(ev){ try{ if(ev&&ev.data&&ev.data.__bwAskVue) bwxPush(); }catch(e){} },false);
      }catch(e){}
      bwxPush();
      try{ setInterval(function(){ try{ if(document.visibilityState!=='hidden') bwxPush(); }catch(e){} },5000); }catch(e){}
      post({__bwReady:1});
    }catch(e){ try{ window.postMessage({__bwErr:String((e&&e.message)||e)},'*'); }catch(_){} }
  }.toString()+')();';
}
function injectMainHook(){
  try{
    const d=document;
    if(!d||!d.documentElement) return false;
    if(d.documentElement.getAttribute('data-bw-main')) return true;
    const s=d.createElement('script');
    s.textContent=mainHookSource();
    d.documentElement.appendChild(s);
    s.remove();
    d.documentElement.setAttribute('data-bw-main','1');
    return true;
  }catch(e){ return false; }
}
function saveDiag(extra){
  store.diag=Object.assign({},store.diag,
    {ver:VERSION, at:now(), ready:mainHookReady, sandbox:hookStatus(), captured:Object.keys(store.captured||{}).length},
    extra||{});
  gset(K_DIAG,store.diag);
}
function onPageMessage(ev){
  const d=ev&&ev.data;
  if(!d||typeof d!=='object') return;
  if(d.__bwReady){ mainHookReady=true; saveDiag({main:1, mainAt:now()}); scheduleRender(); return; }
  if(d.__bwStat){
    const seen={fetch:d.__bwStat.fetch||0, xhr:d.__bwStat.xhr||0, api:d.__bwStat.api||0};
    let paths=d.__bwStat.paths||{};
    const ks=Object.keys(paths);
    if(ks.length>60){
      const keep={};
      ks.sort((a,b)=>paths[b]-paths[a]).slice(0,60).forEach(k=>{ keep[k]=paths[k]; });
      paths=keep;
    }
    saveDiag({seen, paths, seenAt:now()});
    return;
  }
  if(d.__bwErr){ saveDiag({mainErr:String(d.__bwErr).slice(0,200), errAt:now()}); return; }
  if(d.__bwCap){
    if(store.settings.observe){ try{ console.log('[boss-watcher] 页面世界捕获', d.kind, d.url); }catch(e){} }
    maybeStoreResponse(d.url,d.url,d.body,'page:'+(d.kind||''));
  }
  if(d.__bwVue){ vueIngest(d); __bwVueDetail=(d.detail&&typeof d.detail==='object')?d.detail:null; }
}
// ===== v0.8.0：实时对比计数（诚实口径：浏览页面时每对比一个已建档岗位记 1 次，不发任何请求）=====
let lastCompareSave=0;
function bumpCompare(n){
  const st=store.settings.monitor;
  const today=localDateStr();
  if(st.compareDate!==today){ st.compareDate=today; st.compareCount=0; }
  st.compareCount=(st.compareCount||0)+n;
  st.lastCompareAt=now();
  if(now()-lastCompareSave>3000){ lastCompareSave=now(); save(['settings']); }
}
// 经验/学历归一化（v0.8.0）：存档与比较都走这里 —— 脏值（"1-3年·学历不限·…"）与干净值等价时不报变更
function canonExp(v){
  const t=String(v||'').trim();
  if(!t) return '';
  const m=t.match(/(\d+)\s*[-–~至]\s*(\d+)\s*年/);
  if(m) return m[1]+'-'+m[2]+'年';
  const m1=t.match(/(\d+)\s*年以内|(\d+)\s*年以下/);
  if(m1) return (m1[1]||m1[2])+'年以内';
  const mn=t.match(/(\d+)\s*年/);
  if(mn) return mn[1]+'年';
  if(/不限|无经验|无需经验|无须经验/.test(t)) return '经验不限';
  if(/应届|在校/.test(t)) return '应届/在校';
  if(t.indexOf('·')>=0) return '';
  return t.length>14?t.slice(0,14):t;
}
function canonEdu(v){
  const t=String(v||'').trim();
  if(!t) return '';
  const r=eduRank(t);
  if(r!=null&&r>0) return ['','初中','中专/中技','高中','大专','本科','硕士','博士'][r]||t;
  if(/不限/.test(t)) return '学历不限';
  if(t.indexOf('·')>=0) return '';
  return t.length>14?t.slice(0,14):t;
}
// Vue 组件状态的岗位 → upsertJob 入参（列表项没有 JD；详情项带 JD/地址/状态）
function vueJobOf(it,kind){
  if(!it||!it.jobId) return null;
  const job={
    jobId:String(it.jobId),
    name:String(it.name||''),
    salary:String(it.salary||''),
    exp:String(it.exp||''),
    edu:String(it.edu||''),
    company:String(it.company||''),
    city:[it.city,it.area,it.biz].filter(Boolean).join('·'),
    boss:String(it.boss||''),
    active:(it.online===1?true:false),
    publish:it.publish||0,
    jd:String(it.jd||''),
    source:'vue-'+kind
  };
  if(kind==='list'){
    job.partial=true;                                  // 列表没有 JD/详情链接，用旧值兜底
    job.labels=Array.isArray(it.labels)?it.labels:[];
    job.gold=it.gold===1; job.proxy=it.proxy===1; job.sec=String(it.sec||'');
  }else{
    try{ job.detailUrl=(typeof location!=='undefined'&&location.href)||''; }catch(e){ job.detailUrl=''; }   // 详情页：链接就是当前页
    job.status=it.status||'在招';
    job.address=String(it.addr||'');
  }
  return job;
}
let vueIngestAt=0, vueIngestSig='';
let vueStats={list:0, detail:0, compared:0, added:0, changed:0, at:0};
// v0.9.2：页面世界回传的「当前详情」缓存 —— 点「盯岗」时如果详情请求解析失败，
// 用它兜底取 JD（零额外请求），否则那条岗位会永远没有 JD
let __bwVueDetail=null;
function vueIngest(msg){
  try{
    if(!msg) return 0;
    const list=Array.isArray(msg.list)?msg.list:[];
    const detail=(msg.detail&&typeof msg.detail==='object')?msg.detail:null;
    // 去重签名：岗位 + 关键字段（薪资/经验/学历/在线）——同一批数据 2.5 秒内重复回传才跳过，
    // 任何一个字段变了都会重新处理（滚动列表时不会漏掉变化，也不会重复写日志）
    const sig=JSON.stringify([detail?({id:detail.jobId,s:detail.salary,e:detail.exp,d:detail.edu,jd:(detail.jd||'').length}):null,
      list.map(it=>it.jobId+':'+it.salary+':'+it.exp+':'+it.edu+':'+it.online).join('|')]);
    const t=now();
    if(sig===vueIngestSig&&t-vueIngestAt<2500) return 0;   // 双通道/连发去重
    vueIngestSig=sig; vueIngestAt=t;
    let compared=0, added=0, changed=0;
    const handle=(it,kind)=>{
      const job=vueJobOf(it,kind);
      if(!job) return;
      // v0.9.0：只有「我收录过」的岗位才进对比 —— 没收录的，一行都不记（不再整页预处理）
      if(!store.jobs[job.jobId]) return;
      const before=store.changelog.length;
      observeJob(job);
      compared++;
      if(store.changelog.length>before) changed++;
    };
    if(detail) handle(detail,'detail');
    for(let i=0;i<list.length;i++) handle(list[i],'list');
    vueStats={list:list.length, detail:detail?1:0, compared, added, changed, at:t};
    if(compared) bumpCompare(compared);
    if(changed) log('实时对比：'+compared+' 个岗位有更新，'+changed+' 条写进变更日志');
    // v0.9.0：不管有没有变化都刷一次面板 —— 「实时取数」状态条要如实报出本轮读到多少岗位
    scheduleRender();
    return compared;
  }catch(e){
    try{ console.warn('[boss-watcher] vueIngest 处理异常：'+((e&&e.message)||e)); }catch(_){}
    return 0;
  }
}
// 脚本侧直读兜底（注入被挡时也能取到；同 deliver v1.4.0 双路设计）
function askVue(){ try{ window.postMessage({__bwAskVue:1},'*'); }catch(e){} }
function vueDirect(){
  const sels=['.page-jobs-main','.job-recommend-main','#wrap .page-job-wrapper','#wrap'];
  let best=null;
  const take=el=>{ try{ const v=el&&el.__vue__; const jl=v&&v.jobList; if(jl&&jl.length&&(!best||jl.length>best.length)) best=jl; }catch(e){} };
  for(let i=0;i<sels.length;i++){ try{ take(document.querySelector(sels[i])); }catch(e){} }
  if(!best){ try{ const all=document.querySelectorAll('div'); for(let j=0;j<all.length&&j<5000;j++){ take(all[j]); if(best&&best.length>=80) break; } }catch(e){} }
  if(!best) return 0;
  const list=[];
  for(let k=0;k<best.length&&k<800;k++){
    const it=best[k]; if(!it||typeof it!=='object') continue;
    const jid=it.encryptJobId||it.encryptId||it.jobId; if(!jid) continue;
    list.push({jobId:String(jid), name:String(it.jobName||''), salary:String(it.salaryDesc||''),
      exp:String(it.jobExperience||''), edu:String(it.jobDegree||''),
      labels:(it.jobLabels||[]).slice(0,8).map(String), company:String(it.brandName||it.companyName||''),
      city:String(it.cityName||''), area:String(it.areaDistrict||''), biz:String(it.businessDistrict||''),
      boss:String(it.bossName||''), online:(it.bossOnline===true||it.bossOnline===1)?1:0,
      gold:(it.goldHunter===true||it.goldHunter===1)?1:0, proxy:(it.proxyJob===true||it.proxyJob===1)?1:0,
      publish:(typeof it.lastModifyTime==='number'?it.lastModifyTime:0), sec:String(it.securityId||''),
      contact:(it.contact===true||it.contact===1)?1:0});
  }
  if(!list.length) return 0;
  return vueIngest({list});
}
const RISK_MSG_RE=/环境存在异常|访问频繁|安全校验|操作频繁|验证码|请稍后再试|操作过快/;
const RISK_PAGE_RE=/安全验证|滑块验证|请稍后再试|访问频繁|操作过快|环境存在异常|系统检测到/;
const RISK_PAGE_SHORT_RE=/验证码|captcha/i;
function riskCode(text){
  const s=String(text||'');
  try{
    const o=JSON.parse(s);
    const code=o&&o.code;
    const msg=String((o&&o.msg)||(o&&o.message)||'');
    if(code===31||code===37||RISK_MSG_RE.test(msg)) return msg||String(code);
  }catch(e){}
  const head=s.slice(0,4000);
  if(RISK_PAGE_RE.test(head)) return '风控/验证页面';
  if(s.length<20000&&RISK_PAGE_SHORT_RE.test(head)) return '疑似验证页面';
  return null;
}
// 面板可拖动：按住标题栏拖，位置存本机（与 tag 面板同一套交互）
function applyPanelPos(p,key){
  try{
    const o=JSON.parse(localStorage.getItem(key)||'null');
    if(o&&typeof o.x==='number'&&typeof o.y==='number'){
      p.style.left=Math.max(4,Math.min(o.x,window.innerWidth-80))+'px';
      p.style.top=Math.max(4,Math.min(o.y,window.innerHeight-48))+'px';
      p.style.right='auto'; p.style.bottom='auto';
    }
  }catch(e){}
}
function makePanelDraggable(handle,p,key){
  if(!handle||!p) return;
  handle.addEventListener('pointerdown',(e)=>{
    if(e.target&&e.target.closest&&e.target.closest('button,input,textarea,summary,a,select')) return;
    e.preventDefault();
    const r=p.getBoundingClientRect(), dx=e.clientX-r.left, dy=e.clientY-r.top;
    const move=(ev)=>{
      let x=ev.clientX-dx, y=ev.clientY-dy;
      x=Math.max(4,Math.min(x,window.innerWidth-80)); y=Math.max(4,Math.min(y,window.innerHeight-40));
      p.style.left=x+'px'; p.style.top=y+'px'; p.style.right='auto'; p.style.bottom='auto';
    };
    const up=()=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
      try{ const rr=p.getBoundingClientRect(); localStorage.setItem(key,JSON.stringify({x:rr.left,y:rr.top})); }catch(e2){}
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
  });
}

// ===== [3] 统计/导出/主动检查 =====
const NODATA_MSG='还没有捕获到数据，无法导出。\n\n本脚本采用「被动捕获」，需要你先在 BOSS直聘 里正常浏览一次：\n· 聊天数据 → 打开「消息」页，把会话列表翻一遍，再点开几个会话\n· 岗位数据 → 浏览职位列表页 / 职位详情页\n\n捕获到数据后回到这里再导出即可。';
// 投递复盘：一行一个会话（用于本地分析/跟进）
// 消息级 JSONL：一行一条消息，方便本地脚本/pandas 直接吃
// 变更日志导出（含人工备注与跟进状态，方便本地复盘）
function changeRowsForExport(){
  const rows=[['时间','岗位','公司','变更','信号','AI判定','AI建议','备注','已跟进']];
  (store.changelog||[]).forEach(c=>{
    rows.push([
      new Date(c.ts).toLocaleString('zh-CN',{hour12:false}), c.jobName||'', c.company||'',
      (c.changes||[]).join('；'),
      (c.signals||[]).map(s=>s.text).join('；'),
      '', '',   // v0.9.2：AI 判定列恒空（boss-insight 已删掉 AI 功能），保留列位以兼容旧表格
      c.note||'', c.done?'是':''
    ]);
  });
  return rows;
}
function exportChangesCSV(){
  const rows=changeRowsForExport();
  if(rows.length<=1){ alert('还没有变更记录'); return; }
  download(tsFile()+'-变更日志-watcher.csv', '\uFEFF'+rows.map(r=>r.map(csvEsc).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function clearAll(){
  store.jobs={}; store.chats={}; store.rules=[];
  store.settings=mergeDeep(DEFAULTS,{}); store.changelog=[]; store.captured={}; store.logs=[];
  // v0.9.1：「清空全部数据」要真的清全部 ——
  // ① 原实现引用了未定义的 K_RISK，抛出的 ReferenceError 被 catch 吞掉，排在它后面的 bw_logs 永远删不掉（静默半清）；
  // ② 监控清单 / 待跟进信号 / 诊断 / 公司信息 / 工作地址原来根本不清，和确认弹窗里「清空全部本地数据」的口径不符
  store.watch={}; store.signals=[]; store.diag={}; store.companyJobs={}; store.jobAddr={};
  try{
    GM_deleteValue(K_JOBS); GM_deleteValue(K_CHATS); GM_deleteValue(K_RULES); GM_deleteValue(K_SETTINGS);
    GM_deleteValue(K_LOG); GM_deleteValue(K_CAP); GM_deleteValue(K_LOGS); GM_deleteValue(K_DIAG);
    GM_deleteValue(K_WATCH); GM_deleteValue(K_SIG); GM_deleteValue(K_CJOBS); GM_deleteValue(K_JOBADDR); GM_deleteValue('bw_backup_last');
  }catch(e){}
  // 写给过滤/体检脚本的本机镜像也一并清掉，免得它们继续读旧数据
  try{ localStorage.removeItem('bw_company_jobs'); localStorage.removeItem('bw_job_addr'); localStorage.removeItem(INSIGHT_IN); }catch(e){}
  save();
}


// ===== v0.9.0：给独立脚本 boss-insight（风险体检 / AI 判定）的镜像 =====
// 只走本机 localStorage：out 由 insight 写回，in 由本脚本写出去。
const INSIGHT_IN='bw_insight_in', INSIGHT_OUT='bw_insight_out';
let insightCache=null, insightCacheAt=0, insightMirrorAt=0;
function insightOut(){
  const t=now();
  if(insightCache&&t-insightCacheAt<800) return insightCache;
  insightCacheAt=t;
  try{ insightCache=JSON.parse(localStorage.getItem(INSIGHT_OUT)||'{}')||{}; }catch(e){ insightCache={}; }
  return insightCache;
}
// v0.9.2：删掉 insightRisk / insightAi 两个读取器 —— boss-insight 已不再写 risk / ai
// （岗位打分 v0.5.0 删、AI 判定 v0.4.0 删），它们只会永远返回空对象，留着是误导。
function mirrorInsight(force){
  try{
    const t=now();
    if(!force&&t-insightMirrorAt<3000) return;
    insightMirrorAt=t;
    const jobs={};
    watchJobs().forEach(it=>{
      if(!it.jobId) return;   // v0.9.1：没有职位ID的条目不写镜像（否则多个都挤在 '' 键上互相覆盖）
      const s=it.last||{};
      jobs[it.jobId]={name:it.jobName||'', company:it.company||'', hr:it.hr||'',
        salary:s.salary||'', jd:s.jd||'', status:s.status||'', ts:s.ts||0};
    });
    const changes=(store.changelog||[]).slice(0,60).map(c=>({id:c.id, jobId:c.jobId||'', jobName:c.jobName||'', company:c.company||'',
      level:c.level||'info', field:c.field||'', from:c.from||'', to:c.to||'', changes:c.changes||[c.text], ts:c.ts||0}));
    // v0.9.2：jobs 走裁剪（有 ts 可淘汰）；changes 是数组且已 slice(0,60)，不能过 pruneMap
    // （pruneMap 会把数组变成普通对象，insight 那边读 changes.forEach 就会报错）
    const kept=putMirror(INSIGHT_IN, jobs, true);
    if(!kept) return;
    localStorage.setItem(INSIGHT_IN, JSON.stringify({jobs:kept, changes, at:t}));
  }catch(e){}
}

// ===== v0.9.0：按需收录 =====
function sleep(ms){ return new Promise(r=>setTimeout(r,Math.max(0,ms))); }
function watchCfg(){ store.settings.watch=store.settings.watch||{}; return store.settings.watch; }
function cityCodeOf(){
  try{
    const m=String(location.search||'').match(/[?&]city=(\d+)/);
    if(m) return m[1];
    const m2=String(location.pathname||'').match(/\/web\/geek\/jobs/);
    if(m2) return '';
  }catch(e){}
  return '';
}
// 一行输入 → {company, jobName} / {jobId}
function parseRecordLine(line){
  let t=String(line||'').trim();
  if(!t) return null;
  t=t.replace(/^[\s·•\-–—]+/,'').trim();
  const u=t.match(/job_detail\/([A-Za-z0-9_\-]+)\.html/)||t.match(/job-detail\/([A-Za-z0-9_\-]+)\.html/);
  if(u) return {jobId:u[1], raw:t};
  if(/^[A-Za-z0-9_\-]{16,}$/.test(t)) return {jobId:t, raw:t};
  const parts=t.split(/\s*[|｜,，\t]+\s*/).map(s=>s.trim()).filter(Boolean);
  if(parts.length>=2) return {company:parts[0], jobName:parts.slice(1).join(' '), raw:t};
  const m=t.match(/^(.+?)[\s·]+([^\s·]+)$/);
  if(m&&m[1].length>=2) return {company:m[1].trim(), jobName:m[2].trim(), raw:t};
  return {jobName:t, raw:t};
}
function candFromApi(it){
  try{
    if(!it||typeof it!=='object') return null;
    const jobId=String(pick(it,['encryptJobId','jobId','encryptId'])||'');
    if(!jobId) return null;
    const city=[pick(it,['cityName']),pick(it,['areaDistrict']),pick(it,['businessDistrict'])].filter(Boolean).join('·');
    return {jobId,
      name:String(pick(it,['jobName','jobTitle','positionName'])||''),
      company:String(pick(it,['brandName','companyName','brand'])||''),
      salary:String(pick(it,['salaryDesc','salary'])||''),
      hr:String(pick(it,['bossName','bossTitle'])||''),
      exp:String(pick(it,['jobExperience','experience'])||''),
      edu:String(pick(it,['jobDegree','degree'])||''),
      city,
      labels:Array.isArray(it.jobLabels)?it.jobLabels.slice(0,8).map(String):[],
      industry:String(pick(it,['brandIndustry'])||''), scale:String(pick(it,['brandScaleName'])||''),
      stage:String(pick(it,['brandStageName'])||''),
      companyJobs:Number(pick(it,['brandJobNum','jobNum'])||0)||0,
      url:'https://www.zhipin.com/job_detail/'+jobId+'.html', src:'search'};
  }catch(e){ return null; }
}
// v0.9.0：搜索接口拿不到时不再自己解析搜索页 HTML —— 直接让你「多开一个搜索页」，
// 在页面卡片上点「盯岗」（卡片按钮是同一份数据，最准也最省事）。
function scoreCandidates(list,p){
  const cn=normKey(p&&p.company), jn=normKey(p&&p.jobName), raw=normKey(p&&p.raw);
  return (list||[]).map(c=>{
    let score=0;
    const cc=normKey(c.company), cj=normKey(c.name);
    if(cn&&cc){ if(cc===cn) score+=50; else if(cc.indexOf(cn)>=0||cn.indexOf(cc)>=0) score+=35; }
    if(jn&&cj){ if(cj===jn) score+=50; else if(cj.indexOf(jn)>=0||jn.indexOf(cj)>=0) score+=30; }
    if(!cn&&raw&&(cj.indexOf(raw)>=0||raw.indexOf(cj)>=0)) score+=40;
    return {c, score};
  }).sort((a,b)=>b.score-a.score).filter(x=>x.score>0);
}
// 站内搜索：优先官方搜索接口，失败退回搜索页 HTML
async function searchCandidates(company,jobName,raw){
  const q=[jobName,company].filter(Boolean).join(' ')||String(raw||jobName||company||'');
  if(!q) return [];
  if(isBlocked()){ log('收录：风控熔断中（到 '+blockedText()+'），跳过搜索'); return []; }   // v0.9.1：熔断期间不发搜索请求
  const city=cityCodeOf();
  const out=[];
  try{
    const url='/wapi/zpgeek/search/joblist.json?scene=1&query='+encodeURIComponent(q)+(city?('&city='+city):'')+
      '&page=1&pageSize=30&_='+Date.now();
    const r=await fetch(url,{credentials:'same-origin',headers:{'accept':'application/json, text/plain, */*'}});
    const txt=await r.text();
    // v0.9.1：搜索响应也过风控检测 —— 原来只有详情请求检测，搜索被风控了还继续一条条约发
    const risk=riskCode(txt);
    if(risk){ blockTillTomorrow(risk); log('收录：搜索命中风控（'+risk+'），已熔断到 '+blockedText()+'，今日停止主动请求'); return out; }
    const j=JSON.parse(txt);
    const list=(j&&j.zpData&&j.zpData.jobList)||[];
    list.forEach(it=>{ const c=candFromApi(it); if(c) out.push(c); });
    if(out.length) return out;
    if(j&&j.code&&j.code!==0) log('收录：搜索接口返回 code='+j.code+'（'+(j.message||'')+'）');
  }catch(e){}
  return out;
}
// 搜索接口不可用时：给用户一个「打开搜索页」的入口（页面里用卡片按钮收录，最省事）
function openSearchPage(company,jobName,raw){
  try{
    const q=[jobName,company].filter(Boolean).join(' ')||String(raw||'');
    if(!q) return '';
    const city=cityCodeOf();
    const url='/web/geek/jobs?query='+encodeURIComponent(q)+(city?('&city='+city):'');
    window.open(url,'_blank');
    return url;
  }catch(e){ return ''; }
}
// HR（招聘者）名字：详情页 / 卡片上抓
function cleanHr(t){
  let s=String(t||'').replace(/\s+/g,' ').trim();
  if(!s) return '';
  s=s.replace(/^(招聘者|招聘官|HR|人事|Boss)[:：\s]*/i,'');
  s=s.replace(/[·|｜].*$/,'').trim();
  const m=s.match(/([\u4e00-\u9fa5]{2,4}(先生|女士|小姐)|[\u4e00-\u9fa5]{2,4})/);
  return (m?m[1]:s).slice(0,12);
}
function pickHrName(root){
  try{
    const sels=['.job-boss-info .name','.boss-info .name','[class*="boss-info"] .name','[class*="bossName"]',
      '.info-public em','[class*="recruiter"] .name','.job-detail-box .boss-name','.job-boss-info .boss-name'];
    for(let i=0;i<sels.length;i++){
      const el=root.querySelector?root.querySelector(sels[i]):null;
      if(!el) continue;
      const t=domText(el);
      const n=cleanHr(t);
      if(n&&!/^招聘/.test(n)) return n;
    }
    const txt=domText(root.body||root);
    const m=txt.match(/([\u4e00-\u9fa5]{2,4})(先生|女士)[^。]{0,10}(招聘者|HR|人事|经理|总监|主管|创始人)/);
    if(m) return m[1]+m[2];
  }catch(e){}
  return '';
}
// 抓一次详情（只读 GET 详情页 HTML）→ 快照
// v0.9.1：全局串行锁 + 熔断前置检查 —— 「粘贴收录」「收录当前页」「卡片盯岗」「立即对比」共用这条路，
// 原来互相之间可以并发发详情请求（连点/多卡同点），也完全不看熔断状态，都是风控高危动作
let detailFetchBusy=false;
let monitorBusy=false;   // 主动检查串行锁（与 detailFetchBusy 同型）
async function fetchDetailSnapshot(jobId,cand){
  if(isBlocked()) throw new Error('风控熔断中（到 '+blockedText()+'），暂停主动请求');
  if(detailFetchBusy) throw new Error('上一个详情请求还没完成，请稍后再试');
  detailFetchBusy=true;
  try{
    const url='/job_detail/'+encodeURIComponent(jobId)+'.html';
    const r=await fetch(url,{credentials:'same-origin'});
    if(!r||!r.ok) throw new Error('HTTP '+(r?r.status:'?'));
    const html=await r.text();
    const risk=riskCode(html);
    if(risk){ blockTillTomorrow(risk); throw new Error('命中风控（'+risk+'），今日停止主动请求'); }
    const doc=new DOMParser().parseFromString(html,'text/html');
    const box=doc.querySelector('.job-detail-box,.job-detail,.job-primary,.page-job-detail');
    const root=box||doc.body;
    // 只认岗位详情容器里的 h1；没有容器时不用 h1 兜底（否则会把页面标题当成岗位名）
    const nameSels=box?['.job-name','[class*="job-name"]','[class*="jobName"]','.name h1','h1']
      :['.job-name','[class*="job-name"]','[class*="jobName"]','.name h1'];
    const name=domPick(root,nameSels)||(cand&&cand.name)||'';
    const salary=cleanGarbled(domPick(root,['.salary','[class*="salary"]','.job-salary'])||'')||(cand&&cand.salary)||'';
    const company=domPick(root,['.company-info .name','.sider-company .name','[class*="company-name"]','[class*="companyName"]'])||(cand&&cand.company)||'';
    const tags=Array.prototype.slice.call(root.querySelectorAll('.tag-list li,[class*="tag"] li,.job-tags span,.job-keyword-list li'))
      .map(domText).filter(Boolean).slice(0,8);
    const jd=detailJdText(root)||'';
    const hr=pickHrName(doc)||(cand&&cand.hr)||'';
    const addr=extractAddress(doc)||'';
    let cjobs=0;
    try{ cjobs=scrapeCompanyJobCount(doc,company)||0; }catch(e){}
    if(addr) saveJobAddr(jobId,addr);
    return {jobId, name, company, salary, hr, address:addr, jd, labels:tags,
      exp:pickExpTag(tags), edu:(tags.filter(x=>/学历|本科|大专|硕士|博士|中专|高中|初中|不限/.test(x))[0]||''),
      companyJobs:cjobs, status:'在招', city:(cand&&cand.city)||'', url:'https://www.zhipin.com/job_detail/'+jobId+'.html', src:'record'};
  }finally{ detailFetchBusy=false; }
}
// 建 / 更新监控项（职位项同时挂到 store.jobs[jobId]，旧导出与测试继续可用）
function upsertWatchItem(o){
  const type=(o&&o.type==='company')?'company':'job';
  const id=(type==='company')?itemIdOfCompany(o.company):itemIdOfJob(o);
  let item=store.watch[id];
  if(!item){
    item={id, type, addedAt:now(), jobId:'', company:'', jobName:'', hr:'', url:'', source:'', snapshots:[], changes:[]};
    store.watch[id]=item;
  }
  if(o.jobId) item.jobId=String(o.jobId);
  if(o.company) item.company=String(o.company);
  if(o.name||o.jobName) item.jobName=String(o.name||o.jobName);
  if(o.hr) item.hr=String(o.hr);
  if(o.url) item.url=String(o.url);
  if(o.source) item.source=String(o.source);
  item.lastSeenAt=now();
  if(type==='job'&&item.jobId){
    const jid=item.jobId;
    const old=store.jobs[jid];
    if(old&&old!==item){                    // 迁移：把旧档案的快照并进来
      item.last=item.last||old.last; item.first=item.first||old.first;
      if(Array.isArray(old.snapshots)&&old.snapshots.length) item.snapshots=old.snapshots;
      if(Array.isArray(old.changes)&&old.changes.length) item.changes=old.changes;
    }
    item.itemId=id;
    item.watch=true;                        // 兼容旧口径：收录 = 盯住
    item.meta=Object.assign({},item.meta||{},{name:item.jobName,company:item.company,
      city:(item.last&&item.last.city)||'',url:item.url||''});
    // 只有真拿到了内容才造首个快照（导入 / 迁移时不要把占位快照当成"最新"）
    // v0.9.1：空数组 labels 也是 truthy，原来的判断形同虚设（详情页什么都没抓到也会造空快照）
    const hasContent=!!(o.salary||o.jd||o.exp||o.edu||(Array.isArray(o.labels)?o.labels.length:o.labels)||o.address||o.status||o.companyJobs);
    if(hasContent){
      const s=snapFromJob({jobId:jid,name:item.jobName,company:item.company,hr:o.hr||item.hr,salary:o.salary,exp:o.exp,edu:o.edu,
        labels:o.labels,city:o.city,address:o.address,companyJobs:o.companyJobs,jd:o.jd,status:o.status,source:o.src||o.source},item.last||null);
      if(!item.last){ item.last=s; item.first=s; item.snapshots=[s]; }
      else{
        const chs=diffWatch(item.last,s);
        item.last=s;
        if(chs.length){
          item.snapshots=item.snapshots||[]; item.snapshots.push(s);
          const keepN=Math.max(3,(store.settings.watch&&store.settings.watch.snapHistory)||20);
          if(item.snapshots.length>keepN) item.snapshots.shift();
          applyWatchChanges(item,chs,o.source||'re-record');
        }
      }
    }
    store.jobs[jid]=item;
  }
  save('watch','jobs');
  return item;
}
// 收录一个候选（会抓一次详情）
async function recordCandidate(cand){
  const snap=await fetchDetailSnapshot(cand.jobId,cand);
  const item=upsertWatchItem(Object.assign({type:'job',source:'record'},cand,snap));
  log('收录：'+(snap.name||cand.name||cand.jobId)+'（'+(snap.company||cand.company||'')+(snap.hr?(' · HR '+snap.hr):'')+'）');
  return item;
}
// 面板主入口：粘贴多行 → 逐条定位 / 收录；返回报告（含候选列表让 UI 让用户点选）
let recordBusy=false, recordLast=null;
async function recordFromInput(text,onStep){
  const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const rep={total:lines.length, ok:[], cand:[], fail:[], at:now()};
  if(!lines.length) return rep;
  // v0.9.1：防重入 —— 原来「收录」按钮不看 recordBusy，连点两下就是两批并发请求（每条 2-5 秒的间隔保护全部失效）
  if(recordBusy){ rep.fail.push({line:'(本批未执行)', why:'上一批收录还在进行中，等它跑完再点'}); return rep; }
  recordBusy=true;
  try{
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      const p=parseRecordLine(line);
      if(onStep) onStep('('+(i+1)+'/'+lines.length+') '+line);
      // v0.9.1：批处理中途命中风控熔断 → 剩余行不再发任何请求
      if(isBlocked()){ rep.fail.push({line, why:'风控熔断中（到 '+blockedText()+'），本批停止'}); break; }
      if(!p){ rep.fail.push({line, why:'这一行看不懂'}); continue; }
      if(p.jobId){
        try{ const it=await recordCandidate({jobId:p.jobId}); rep.ok.push({line, name:it.jobName, company:it.company, hr:it.hr}); }
        catch(e){ rep.fail.push({line, why:e.message||String(e)}); }
      }else{
        let cands=[];
        try{ cands=await searchCandidates(p.company,p.jobName,p.raw); }catch(e){}
        const scored=scoreCandidates(cands,p);
        if(!scored.length){
          // v0.9.1：文案诚实 —— 这里是异步回调里 window.open，大概率被浏览器弹窗拦截，不能说「已给你打开」
    rep.fail.push({line, why:'站内没搜到（脚本尝试新开搜索页；若被浏览器拦截，请自己搜一下，在卡片上点「收录」即可）'});
          openSearchPage(p.company,p.jobName,p.raw);
        }
        else if(scored.length===1||scored[0].score>=80){
          try{
            const it=await recordCandidate(scored[0].c);
            rep.ok.push({line, name:it.jobName, company:it.company, hr:it.hr});
          }catch(e){ rep.fail.push({line, why:e.message||String(e)}); }
        }else{
          rep.cand.push({line, list:scored.slice(0,8).map(x=>x.c)});
        }
      }
      if(i<lines.length-1){
        const w=watchCfg();
        await sleep(rand(Math.max(0.5,w.reqMinDelay||2),Math.max(1,w.reqMaxDelay||5))*1000);
      }
    }
  }finally{ recordBusy=false; recordLast=rep; }
  return rep;
}
// 「收录当前页」：详情页直接抓（不额外发请求）；列表页把已显示的岗位作为候选交给 UI
function currentPageCandidates(){
  const out=[];
  try{
    if(isDetailPage()){
      const jid=jobIdFromUrl(location.pathname)||jobIdFromUrl(location.href);
      if(jid){
        const root=document.querySelector('.job-detail-box,.job-detail,.job-primary,.page-job-detail')||document.body;
        const api=apiJobOf(jid)||{};
        const tags=Array.prototype.slice.call(root.querySelectorAll('.tag-list li,[class*="tag"] li,.job-tags span,.job-keyword-list li')).map(domText).filter(Boolean).slice(0,8);
        out.push({jobId:jid, name:domPick(root,['.job-name','[class*="job-name"]','.name h1','h1'])||api.name||'',
          company:domPick(root,['.company-info .name','.sider-company .name','[class*="company-name"]'])||api.company||'',
          salary:cleanGarbled(domPick(root,['.salary','[class*="salary"]'])||'')||api.salary||'',
          hr:pickHrName(document)||api.boss||'', address:extractAddress(document), jd:detailJdText(root),
          labels:tags, exp:pickExpTag(tags), city:'', companyJobs:(store.companyJobs&&store.companyJobs[domPick(root,['.company-info .name','[class*="company-name"]'])||'']||{}).count||0,
          status:'在招', url:location.href, src:'current-page'});
        return out;
      }
    }
    // 列表页：Vue 组件状态优先，其次 DOM 卡片
    const seen={};
    const push=(o)=>{ if(!o||!o.jobId||seen[o.jobId]) return; seen[o.jobId]=1; out.push(o); };
    try{
      const all=document.querySelectorAll('div');
      for(let i=0;i<all.length&&i<4000;i++){
        const v=all[i].__vue__;
        const jl=v&&v.jobList;
        if(jl&&jl.length){
          for(let k=0;k<jl.length;k++){
            const it=jl[k], jid=it&&(it.encryptJobId||it.encryptId||it.jobId);
            if(!jid) continue;
            push({jobId:String(jid), name:String(it.jobName||''), company:String(it.brandName||''), salary:String(it.salaryDesc||''),
              hr:String(it.bossName||it.bossTitle||''), city:[it.cityName,it.areaDistrict,it.businessDistrict].filter(Boolean).join('·'),
              labels:(it.jobLabels||[]).slice(0,8).map(String), exp:String(it.jobExperience||''), edu:String(it.jobDegree||''),
              url:'https://www.zhipin.com/job_detail/'+jid+'.html', src:'current-list'});
          }
          break;
        }
      }
    }catch(e){}
    if(!out.length){
      Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]')).forEach(a=>{
        const jid=jobIdFromUrl(a.getAttribute('href')||''); if(!jid) return;
        let card=a; for(let i=0;i<7&&card&&card.tagName!=='LI';i++) card=card.parentElement;
        if(!card) card=a;
        push({jobId:jid, name:domPick(card,['.job-name','[class*="job-name"]'])||'', company:domPick(card,['.company-name','[class*="company-name"]'])||'',
          salary:cleanGarbled(domPick(card,['.salary','[class*="salary"]'])||''), hr:domPick(card,['.info-public em','[class*="boss"] .name'])||'',
          city:domPick(card,['.job-area','[class*="job-area"]'])||'', url:'https://www.zhipin.com/job_detail/'+jid+'.html', src:'current-list'});
      });
    }
  }catch(e){}
  return out;
}
// 导出 / 导入 / 清空（监控清单 + 快照 + 信号）
function watchExportData(){
  const items=watchList().map(it=>({
    type:it.type||'job', jobId:it.jobId||'', company:it.company||'', jobName:it.jobName||'', hr:it.hr||'', url:it.url||'',
    addedAt:it.addedAt||0, lastSeenAt:it.lastSeenAt||0, lastChangeAt:it.lastChangeAt||0,
    snapshot:it.last||null, history:(it.snapshots||[]).slice(-20), changes:(it.changes||[]).slice(0,20),
    log:changesOfItem(it.id).slice(0,50)
  }));
  return {version:VERSION, kind:'boss-watcher-watchlist', exportedAt:now(), items, signals:(store.signals||[]).slice(0,200)};
}
function exportWatchJSON(){
  const d=watchExportData();
  if(!d.items.length){ alert('监控清单是空的：先在面板里粘贴「公司名 + 职位名」收录几个岗位。'); return; }
  download(tsFile()+'-监控清单-watcher.json', JSON.stringify(d,null,2), 'application/json');
  log('导出：监控清单 '+d.items.length+' 项');
}
function importWatchJSON(text){
  const d=JSON.parse(text);
  if(!d||!Array.isArray(d.items)) throw new Error('格式不对：缺少 items 数组');
  try{ gset('bw_backup_last', JSON.stringify({watch:store.watch,jobs:store.jobs,signals:store.signals,changelog:store.changelog,at:now()})); }catch(e){}
  let add=0, upd=0;
  d.items.forEach(x=>{
    if(!x||(!x.jobId&&!x.company)) return;
    const exist=x.jobId?(store.jobs[x.jobId]||store.watch[itemIdOfJob(x)]):store.watch[itemIdOfCompany(x.company)];
    const item=upsertWatchItem({type:x.type,jobId:x.jobId,company:x.company,name:x.jobName,hr:x.hr,url:x.url,source:'import'});
    if(exist) upd++; else add++;
    if(x.snapshot&&(!item.last||(x.snapshot.ts||0)>=(item.last.ts||0))) item.last=x.snapshot;
    if(Array.isArray(x.history)&&x.history.length) item.snapshots=x.history.slice(-20);
    if(Array.isArray(x.changes)&&x.changes.length) item.changes=x.changes.slice(0,20);
    if(x.addedAt) item.addedAt=Math.min(item.addedAt||x.addedAt,x.addedAt);
  });
  if(Array.isArray(d.signals)){
    const have={};
    (store.signals||[]).forEach(s=>{ have[String(s.id)]=1; });
    d.signals.forEach(s=>{ if(s&&s.id&&!have[String(s.id)]) store.signals.push(s); });
    store.signals.sort((a,b)=>(b.ts||0)-(a.ts||0));
    if(store.signals.length>Math.max(50,(watchCfg().sigMax)||200)) store.signals.length=Math.max(50,(watchCfg().sigMax)||200);
  }
  save();
  log('导入：监控清单 +'+add+' 新增 / '+upd+' 合并（导入前的数据已备份到本机 bw_backup_last）');
  return {add, upd};
}
function clearWatchData(){
  store.watch={}; store.jobs={}; store.signals=[]; store.changelog=[];
  try{ GM_deleteValue(K_WATCH); GM_deleteValue(K_SIG); GM_deleteValue(K_LOG); GM_deleteValue(K_JOBS); }catch(e){}
  save();
  log('监控数据已清空（本机存储轻量化）');
}
// 迁移：v0.8.x → v0.9.0（删掉「自动建档、你没收录」的旧档案，只留你盯住的）
function migrateTo090(){
  try{
    if(gget(K_WVER,'')==='0.9.0') return false;
    let kept=0, dropped=0;
    const jobs=Object.values(store.jobs||{});
    jobs.forEach(j=>{
      if(!j||!j.jobId) return;
      if(j.watch&&j.meta&&(j.meta.name||j.meta.company)){
        const item=upsertWatchItem({type:'job', jobId:j.jobId, company:j.meta.company||'', name:j.meta.name||'',
          hr:(j.last&&j.last.hr)||'', url:j.meta.url||'', source:'migrate'});
        item.last=j.last||item.last; item.first=j.first||item.first;
        item.snapshots=(Array.isArray(j.snapshots)&&j.snapshots.length)?j.snapshots:item.snapshots;
        item.changes=(Array.isArray(j.changes)&&j.changes.length)?j.changes:item.changes;
        kept++;
      }else dropped++;
    });
    store.jobs={};
    watchJobs().forEach(it=>{ if(it.jobId) store.jobs[it.jobId]=it; });
    try{ store.changelog=(store.changelog||[]).filter(c=>c.note||c.done||!isNoiseChange(c)); }catch(e){}
    try{ GM_deleteValue(K_API); }catch(e){}
    gset(K_WVER,'0.9.0');
    save();
    log('升级 v0.9.0：保留你盯住的 '+kept+' 个岗位，清掉自动档案 '+dropped+' 个（以后只记录你手动收录的）');
    return true;
  }catch(e){ return false; }
}

function budgetDate(){ return localDateStr(); }
function blockedUntilTs(){ return Number(store.settings.monitor.blockedUntil||0); }
function isBlocked(){ return blockedUntilTs()>now(); }
function blockedText(){ const t=blockedUntilTs(); return t?new Date(t).toLocaleString('zh-CN',{hour12:false}):''; }
function blockTillTomorrow(reason){
  const d=new Date(); d.setHours(24,0,0,0);
  const st=store.settings.monitor;
  st.blockedUntil=d.getTime();
  st.blockReason=String(reason||'触发风控');
  save();
  return st.blockedUntil;
}
function clearBlock(){
  const st=store.settings.monitor;
  st.blockedUntil=0; st.blockReason='';
  save();
}
function getBudgetLeft(){
  const st=store.settings.monitor;
  if(st.budgetDate!==budgetDate()){ st.budgetDate=budgetDate(); st.usedToday=0; }
  return st.dailyBudget-st.usedToday;
}
function spendBudget(n){
  const st=store.settings.monitor;
  if(st.budgetDate!==budgetDate()){ st.budgetDate=budgetDate(); st.usedToday=0; }
  st.usedToday=(st.usedToday||0)+n;
}
function runMonitorCheck(done){
  const st=store.settings.monitor;
  try{ autoScan(); }catch(e){}
  if(isBlocked()){ log('监控：风控熔断中，暂停到 '+blockedText()); if(done)done(); return; }
  // v0.9.0：只检查「我收录的」岗位（每一项都是你手动收进来的）
  const jobs=watchJobs().filter(j=>j.jobId&&((j.url)||(j.meta&&j.meta.url)));
  if(!jobs.length){
    log('监控：还没有收录任何岗位（面板粘贴「公司名 + 职位名」收录，或在卡片上点「收录」）');
    if(done)done(); return;
  }
  const budget=getBudgetLeft();
    if(budget<=0){ log('监控：主动检查预算已用完（每日 '+st.dailyBudget+' 次，只有点「立即检查」才消耗；浏览页面不消耗）'); if(done)done(); return; }
  const batch=Math.min(st.maxBatch,jobs.length,budget);
  const picked=jobs.slice(0,batch);
  if(monitorBusy){ log('监控：上一轮检查还在进行，忽略本次触发'); if(done)done(); return; }
  monitorBusy=true;
  log('监控：开始检查 '+batch+' 个岗位…');
  let i=0, finished=false;
  const finish=()=>{ if(finished) return; finished=true; monitorBusy=false; if(done) done(); };
  const next=()=>{
    // v0.9.1：每发一个岗位前都查熔断 —— 原来 onload 里检测到风控、熔断之后，
    // onloadend 照样把本轮剩下的岗位一个个请求完，「当日熔断」形同虚设
    if(isBlocked()){ log('监控：风控熔断中，本轮剩余 '+Math.max(0,picked.length-i)+' 个岗位不再请求'); finish(); return; }
    if(i>=picked.length){ log('监控：本轮完成'); store.settings.monitor.lastCheck=now(); save(); finish(); return; }
    const j=picked[i++];
    if(typeof GM_xmlhttpRequest!=='function'){ log('监控：缺少 GM_xmlhttpRequest 权限'); finish(); return; }
    const url=(j.meta&&j.meta.url)||j.url||'';
    const name=(j.meta&&j.meta.name)||j.jobName||j.jobId||'';
    GM_xmlhttpRequest({
      method:'GET', url, timeout:20000,
      onload:r=>{
        spendBudget(1);
        j.lastCheckedAt=now(); save(['watch','jobs','settings']);   // W6：岗位级「最后检查」时间（v0.9.1：监控项是 watch/jobs 共享对象，两个键都要写）
        const risk=riskCode(r.responseText);
        if(risk){ blockTillTomorrow(risk); log('监控：检测到风控信号（'+risk+'），已熔断到 '+blockedText()+'，今日停止主动请求'); finish(); return; }
        maybeStoreResponse(url,url,r.responseText,'check');
      },
      onerror:()=>{ spendBudget(1); j.lastCheckedAt=now(); save(['watch','jobs','settings']); log('监控：请求失败 '+name); },
      // v0.9.1：超时也计预算 —— 请求确实发出去了，原来不计会让「一直超时」白嫖当日预算
      ontimeout:()=>{ spendBudget(1); j.lastCheckedAt=now(); save(['watch','jobs','settings']); log('监控：超时 '+name); },
      onloadend:()=>setTimeout(next, rand(st.minDelay,st.maxDelay)*1000)
    });
  };
  next();
}
// ===== [4] UI 与启动 =====
const BW_CSS = '#bwRoot{position:fixed;right:18px;bottom:18px;z-index:2147483000;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430}'+
'#bwFab{width:52px;height:52px;border-radius:50%;background:#2f6bff;color:#fff;font-size:22px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(47,107,255,.4);display:flex;align-items:center;justify-content:center}'+
'#bwPanel{display:none;position:fixed;right:18px;bottom:80px;width:560px;max-width:calc(100vw - 36px);max-height:78vh;min-width:340px;min-height:160px;resize:both;overflow:auto;background:#fff;border:1px solid #e3e8f0;border-radius:14px;box-shadow:0 10px 40px rgba(20,30,60,.18);padding:14px}'+
'#bwPanel .bw-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:move;user-select:none;touch-action:none}'+
'#bwPanel .bw-head b{font-size:15px}'+
'#bwPanel .bw-x{border:none;background:none;font-size:20px;cursor:pointer;color:#7a8396}'+
'.bw-tabs{display:flex;gap:4px;border-bottom:1px solid #e3e8f0;margin-bottom:12px}'+
'.bw-tabs button{border:none;background:none;padding:6px 12px;cursor:pointer;color:#7a8396;border-bottom:2px solid transparent}'+
'.bw-tabs button.on{color:#2f6bff;border-bottom-color:#2f6bff;font-weight:600}'+
'.bw-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}'+
'.bw-card{background:#f6f8fc;border:1px solid #e3e8f0;border-radius:10px;padding:10px;text-align:center;cursor:pointer}'+
'.bw-card:hover{background:#eaf0ff;border-color:#c7d6ff}'+
'.bw-card b{display:block;font-size:18px;color:#2f6bff}'+
'.bw-card span{font-size:11px;color:#7a8396}'+
'.bw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}'+
'.bw-btn{border:none;background:#2f6bff;color:#fff;padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px}'+
'.bw-btn:hover{opacity:.88}'+
'.bw-warn{background:#fff3e0;color:#c2600a}'+
'.bw-danger{background:#fee2e2;color:#dc2626}'+
'.bw-sm{padding:3px 8px}'+
'.bw-h{font-weight:600;margin:14px 0 6px;border-left:3px solid #2f6bff;padding-left:8px}'+
'.bw-t{width:100%;border-collapse:collapse;font-size:12px}'+
'.bw-t th,.bw-t td{padding:6px 8px;border-bottom:1px solid #eef1f6;text-align:left;vertical-align:top}'+
'.bw-t th{color:#7a8396;font-weight:600;background:#f8fafc}'+
'.bw-muted{color:#7a8396}'+
'.bw-empty{color:#7a8396;text-align:center;padding:16px 0}'+
'.bw-log{padding:6px 0;border-bottom:1px dashed #eef1f6;font-size:12px}'+
'.bw-chg{color:#c2600a}'+
'.bw-toggle{cursor:pointer;user-select:none}'+
'.bw-lv{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px}'+
'.bw-lv低{background:#dcfce7;color:#15803d}'+
'.bw-lv中{background:#fff3e0;color:#c2600a}'+
'.bw-lv高{background:#fee2e2;color:#dc2626}'+
'.bw-form{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}'+
'.bw-form input,.bw-form select{padding:6px 8px;border:1px solid #e3e8f0;border-radius:8px;font:inherit;width:auto;flex:1;min-width:120px}'+
'.bw-note{background:#eef3ff;border:1px solid #d4e0ff;color:#274a9e;padding:8px 10px;border-radius:8px;font-size:12px}'+
'.bw-set{display:block;margin:6px 0;font-size:12px;color:#1f2430}'+
// v0.9.0：卡片上的「盯岗 / 盯司」小按钮（放在卡片左上角，不挡过滤脚本右上角的角标）
'.bw-cardbtns{position:absolute;top:6px;left:6px;display:flex;gap:4px;z-index:6}'+
'.bw-cardbtn{border:1px solid #c7d6ff;background:#eef2fb;color:#2f6bff;border-radius:6px;font:11px/1.5 inherit;padding:0 6px;cursor:pointer}'+
'.bw-cardbtn:hover{background:#2f6bff;color:#fff}'+
'.bw-cardbtn.on{background:#dcfce7;border-color:#86efac;color:#15803d}'+
'.bw-cardbtn[disabled]{opacity:.7;cursor:default}';

let bwUi=null;
let jobView='all';   // all | watch（概览卡片可切换）

// ===== v0.8.2：面板重绘不吃掉你正在填的东西（输入框的值 / 焦点与光标 / 面板滚动位置）=====
// 背景：面板开着时，抓到数据 / 12 秒一轮的实时对比都会 scheduleRender → renderAll 整块重写页面 HTML，
// 你正在填的「规则名/关键词」「监控参数」「AI Key」会被冲回默认值，滚动位置也会跳回顶部。
function pageSnapshot(el){
  const snap={vals:{}, focus:'', sel:null, scroll:0};
  try{
    const ins=el.querySelectorAll('input,textarea,select');
    for(let i=0;i<ins.length;i++){
      const n=ins[i];
      if(!n.id||n.type==='checkbox'||n.type==='radio') continue;
      snap.vals[n.id]=n.value;
    }
    const a=document.activeElement;
    if(a&&el.contains(a)&&a.id&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT')){
      snap.focus=a.id;
      try{ snap.sel=[a.selectionStart,a.selectionEnd]; }catch(e){}
    }
    snap.scroll=(bwUi&&bwUi.panel&&bwUi.panel.scrollTop)||0;
  }catch(e){}
  return snap;
}
function pageRestore(el,snap){
  try{
    if(!snap) return;
    Object.keys(snap.vals||{}).forEach(id=>{
      const n=el.querySelector('#'+id);
      if(n&&n.value!==undefined&&snap.vals[id]!==undefined) n.value=snap.vals[id];
    });
    if(bwUi&&bwUi.panel) bwUi.panel.scrollTop=snap.scroll||0;
    if(snap.focus){
      const a=el.querySelector('#'+snap.focus);
      if(a){ a.focus(); try{ if(snap.sel&&a.setSelectionRange) a.setSelectionRange(snap.sel[0],snap.sel[1]); }catch(e){} }
    }
  }catch(e){}
}

function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function buildUI(){
  if(document.getElementById('bwPanel')) return;
  try{ GM_addStyle(BW_CSS); }catch(e){}
  const host=document.createElement('div');
  host.id='bwRoot';
  host.innerHTML='<button id="bwFab" title="BOSS 求职助手">💼</button>'+
    '<div id="bwPanel" style="display:none">'+
    '<div class="bw-head"><b>BOSS 求职助手</b><span class="bw-muted">v'+VERSION+' · 数据仅存本机</span><button class="bw-x" data-act="close">×</button></div>'+
    '<div class="bw-tabs">'+
    '<button id="bwTab_mon" class="on" data-act="tab" data-id="mon">监控</button>'+
    '<button id="bwTab_set" data-act="tab" data-id="set">设置</button></div>'+
    '<div id="bwPage_mon"></div>'+
    '<div id="bwPage_set" style="display:none"></div></div>';
  document.body.appendChild(host);
  bwUi={panel:document.getElementById('bwPanel'), fab:document.getElementById('bwFab')};
  applyPanelPos(bwUi.panel,'bw_panelpos'); makePanelDraggable(bwUi.panel.querySelector('.bw-head'),bwUi.panel,'bw_panelpos');   // v0.9.4 面板可拖
  bwUi.fab.addEventListener('click',()=>togglePanel());
  bwUi.panel.addEventListener('click',onPanelClick);
  bwUi.panel.addEventListener('change',onPanelChange);
  // v0.7.5：面板尺寸记忆（右下角可拖拽缩放）——别让它一直霸着整个窗口
  try{
    const sz=gget(K_PANELSIZE,null);
    if(sz&&sz.w&&sz.h){
      bwUi.panel.style.width=Math.max(340,Math.min(sz.w,(window.innerWidth||1200)-36))+'px';
      bwUi.panel.style.height=Math.max(160,Math.min(sz.h,(window.innerHeight||800)-100))+'px';
    }
  }catch(e){}
  bwUi.panel.addEventListener('mouseup',()=>{
    try{
      const w=Math.round(bwUi.panel.offsetWidth), h=Math.round(bwUi.panel.offsetHeight);
      const sz=gget(K_PANELSIZE,null)||{};
      if(sz.w!==w||sz.h!==h) gset(K_PANELSIZE,{w:w,h:h});
    }catch(e){}
  });
  renderAll();
}
function togglePanel(){
  if(!bwUi) return;
  const p=bwUi.panel;
  const visible=getComputedStyle(p).display!=='none';
  if(visible){ p.style.display='none'; }
  else{ p.style.display='block'; renderAll(); }
}
function switchTab(id){
  if(id==='mon') renderMonitor();
  else if(id==='set') renderSettings();['mon','set'].forEach(t=>{
    const tabEl=document.getElementById('bwTab_'+t);
    const pageEl=document.getElementById('bwPage_'+t);
    if(tabEl) tabEl.classList.toggle('on',t===id);
    if(pageEl) pageEl.style.display=t===id?'block':'none';
  });
}
function onPanelClick(e){
  const b=e.target.closest('[data-act]');
  if(!b) return;
  const act=b.dataset.act, id=b.dataset.id||'';
  if(act==='close'){ bwUi.panel.style.display='none'; }
  else if(act==='tab'){ switchTab(id); }
  // ===== v0.9.0：收录 / 监控项 / 待跟进 =====
  else if(act==='montab'){ monTab=(id==='signals')?'signals':'watch'; renderMonitor(); }
  else if(act==='cardsig'){ monTab='signals'; renderMonitor(); }
  else if(act==='rec'){
    const ta=document.getElementById('bwRecInput');
    const txt=ta?ta.value:'';
    if(!txt.trim()){ alert('先粘贴要收录的内容，一行一条：\n· 公司名 + 职位名（例：深圳乐有家控股集团 管培生）\n· 或岗位链接 / 职位ID'); return; }
    // v0.9.1：连点「收录」不再并发起第二批；熔断期间直接拦下（不发请求）
    if(recordBusy){ recMsg='上一批收录还在进行中，等它跑完再点'; renderMonitor(); return; }
    if(isBlocked()){ recMsg='风控熔断中（到 '+blockedText()+'），收录暂停'; renderMonitor(); return; }
    recMsg='收录中…'; pendingCand=[]; renderMonitor();
    recordFromInput(txt,(step)=>{ recMsg=step; renderMonitor(); }).then(rep=>{
      recMsg='收录完成：成功 '+rep.ok.length+' / 失败 '+rep.fail.length+(rep.cand.length?(' / 待选 '+rep.cand.length):'');
      pendingCand=[];
      rep.cand.forEach(g=>{ g.list.forEach(c=>pendingCand.push(c)); });
      if(ta) ta.value='';
      renderMonitor();
    }).catch(e=>{ recMsg='收录出错：'+(e.message||e); renderMonitor(); });
  }
  else if(act==='reccur'){
    const cands=currentPageCandidates();
    if(!cands.length){ alert('当前页面没识别到岗位。\n· 在职位列表页 / 岗位详情页再点这个按钮\n· 或者用上面的粘贴收录'); return; }
    if(cands.length===1){
      recMsg='收录当前页…'; renderMonitor();
      recordCandidate(cands[0]).then(it=>{ recMsg='已收录：'+(it.jobName||'')+'（'+(it.company||'')+(it.hr?(' · HR '+it.hr):'')+'）'; renderMonitor(); })
        .catch(e=>{ recMsg='收录失败：'+(e.message||e); renderMonitor(); });
    }else{
      pendingCand=cands.slice(0,30);
      recMsg='当前页识别到 '+cands.length+' 个岗位，点下面「收录」挑一个（其余不用管）';
      renderMonitor();
    }
  }
  else if(act==='recpick'){
    const c=pendingCand[Number(id)];
    if(!c) return;
    recMsg='收录中…'; renderMonitor();
    recordCandidate(c).then(it=>{
      pendingCand=[]; recMsg='已收录：'+(it.jobName||'')+'（'+(it.company||'')+(it.hr?(' · HR '+it.hr):'')+'）'; renderMonitor();
    }).catch(e=>{ recMsg='收录失败：'+(e.message||e); renderMonitor(); });
  }
  else if(act==='recclear'){ pendingCand=[]; recLast=null; recMsg=''; renderMonitor(); }
  else if(act==='sigdone'){
    const s=(store.signals||[]).find(x=>String(x.id)===String(id));
    if(s){ s.status='done'; s.doneAt=now(); save('signals'); renderMonitor(); }
  }
  else if(act==='sigignore'){
    const s=(store.signals||[]).find(x=>String(x.id)===String(id));
    if(s){ s.status='ignored'; s.ignoredAt=now(); save('signals'); renderMonitor(); }
  }
  else if(act==='signote'){
    const s=(store.signals||[]).find(x=>String(x.id)===String(id));
    if(s){
      const v=prompt('给这条待办加个备注（例如：已加微信 / 约了面试 / 薪资太低不考虑）',s.note||'');
      if(v!==null){ s.note=String(v).slice(0,120); save('signals'); renderMonitor(); }
    }
  }
  else if(act==='watchopen'){ try{ window.open(id,'_blank'); }catch(e){} }
  else if(act==='watchdel'){
    const it=store.watch[id];
    if(it&&confirm('从监控里删除「'+(it.jobName||it.company||id)+'」？（只删本机记录）')){
      delete store.watch[id];
      if(it.jobId&&store.jobs[it.jobId]===it) delete store.jobs[it.jobId];
      store.signals=(store.signals||[]).filter(s=>s.itemId!==id);
      store.changelog=(store.changelog||[]).filter(c=>c.itemId!==id);
      save(); log('监控：已删除「'+(it.jobName||it.company||id)+'」'); renderMonitor();
    }
  }
  else if(act==='watchcheck'){
    const it=store.watch[id];
    if(!it) return;
    if(!it.jobId){ alert('这条没有职位ID（公司项），只能等你浏览到它时对比。'); return; }
    if(isBlocked()){ alert('风控熔断中，暂停到 '+blockedText()); return; }
    recMsg='立即检查：'+(it.jobName||it.jobId)+'…'; renderMonitor();
    fetchDetailSnapshot(it.jobId,{jobId:it.jobId,name:it.jobName,company:it.company,hr:it.hr})
      .then(snap=>{
        spendBudget(1);
        const changes=diffWatch(it.last,snapFromJob(snap,it.last));
        it.last=snapFromJob(snap,it.last); markSeen(it,it.last.ts);
        const n=applyWatchChanges(it,changes,'manual-check');
        save(['watch','jobs','changelog','signals','settings']);
    recMsg=n?('发现 '+n+' 项变化（见「待处理」）'):'没有变化'; renderMonitor();
      })
      .catch(e=>{ recMsg='对比失败：'+(e.message||e); renderMonitor(); });
  }
  else if(act==='exportwatch'){ exportWatchJSON(); }
  else if(act==='importwatch'){
    const f=document.getElementById('bwWatchFile');
    if(f) f.click();
  }
  else if(act==='clearwatch'){
    if(!confirm('清空本机监控数据（监控清单 + 快照 + 待处理 + 变更日志）？\n建议先「导出监控清单」备份。')) return;
    clearWatchData(); recMsg='已清空监控数据'; renderMonitor();
  }
  else if(act==='check'){ runMonitorCheck(()=>{ if(bwUi) renderMonitor(); }); }
  else if(act==='cardwatch'){ monTab='watch'; renderMonitor(); }
  else if(act==='cardbudget'){
    const st=store.settings.monitor;
    alert('主动检查（今日）：'+(st.usedToday||0)+' / '+st.dailyBudget+' 次\n\n· 只在点「立即检查」时计数：每主动请求 1 个岗位 +1；\n· 平时浏览页面（实时对比）不消耗、不发请求；\n· 跨天自动归零。\n\n限速：每岗间隔 '+st.minDelay+'–'+st.maxDelay+' 秒，每轮最多 '+st.maxBatch+' 个岗位\n命中风控（验证码/访问频繁）会当日熔断，次日自动恢复\n\n改动这些参数：设置 → 监控设置');
  }
  else if(act==='cardcheck'){ runMonitorCheck(()=>{ if(bwUi) renderMonitor(); }); }
  else if(act==='cardchg'){
    if(!chgOpen){ chgOpen=true; gset(K_CHGOPEN,'1'); renderMonitor(); }   // v0.7.5：跳过去之前先展开
    const t=document.getElementById('bwChg');
    if(t){
      try{
        const panel=document.getElementById('bwPanel');
        if(panel) panel.scrollTop=Math.max(0,t.offsetTop-60);   // 面板内部滚动更稳
        else if(t.scrollIntoView) t.scrollIntoView({block:'start'});
      }catch(e){}
    }
  }
  else if(act==='chgdone'){
    const c=store.changelog.find(x=>x.id===id);
    if(c){ c.done=!c.done; c.doneAt=c.done?now():0; save(); renderMonitor(); }
  }
  else if(act==='chgnote'){
    const c=store.changelog.find(x=>x.id===id);
    if(c){
      const v=prompt('给这条变更加个备注（例如：已加微信 / 约了面试 / 薪资太低不考虑）',c.note||'');
      if(v!==null){ c.note=String(v).slice(0,120); save(); renderMonitor(); }
    }
  }
  else if(act==='chgdel'){
    // v0.7.5：不再逐条弹 confirm —— 删了给 8 秒撤销，比让用户对着弹窗点「确定」省事
    let n=0;
    if(id==='__sel__'){ n=removeChanges(Array.from(chgSelected)); chgSelected=new Set(); }
    else{ n=removeChanges([id]); chgSelected.delete(String(id)); }
    if(n) flashChgUndo(n);
    renderMonitor();
  }
  else if(act==='chgtoggle'){
    chgOpen=!chgOpen; chgShowAll=false; gset(K_CHGOPEN,chgOpen?'1':'0'); renderMonitor();
  }
  else if(act==='chgmore'){ chgShowAll=true; renderMonitor(); }
  else if(act==='chgless'){ chgShowAll=false; renderMonitor(); }
  else if(act==='chgselall'){
    const all=store.changelog.map(c=>String(c.id));
    chgSelected=(all.length&&chgSelected.size===all.length)?new Set():new Set(all);
    renderMonitor();
  }
  else if(act==='chgnoise'){
    const n=removeChanges(noiseChangeIds());
    chgSelected=new Set();
    if(n){ log('变更日志：清理了 '+n+' 条「首次补全」噪音'); flashChgUndo(n); }
    renderMonitor();
  }
  else if(act==='chgbogus'||act==='cleanbogus'){
    const n=cleanBogusChanges();
    chgSelected=new Set();
    if(n){ flashChgUndo(n); }
    else alert('没有检测到「经验/学历等级相同」的历史误报。');
    renderMonitor();
  }
  else if(act==='cardcompare'){
    const st=store.settings.monitor;
    const today=(st.compareDate===localDateStr())?(st.compareCount||0):0;
    alert('实时对比（只读、不发请求）：\n\n· 你浏览职位列表/详情时，脚本直接读页面正在展示的数据；\n· 每遇到一个「已建档」岗位，就与上次快照对比一次；\n· 今天已对比 '+today+' 次'+(st.lastCompareAt?('，最后一次 '+new Date(st.lastCompareAt).toLocaleString('zh-CN',{hour12:false})):'')+'。\n\n只有出现真实变化（薪资下调/要求拔高/下线等）才会写进变更日志。');
  }
  else if(act==='chgclear'){
    const n=removeChanges(store.changelog.map(c=>c.id));
    chgSelected=new Set();
    if(n){ log('变更日志：已清空 '+n+' 条（8 秒内可撤销）'); flashChgUndo(n); }
    renderMonitor();
  }
  else if(act==='chgundo'){
    const n=undoRemoveChanges();
    if(n) log('变更日志：已恢复 '+n+' 条');
    renderMonitor();
  }
  else if(act==='chgexp'){ exportChangesCSV(); }
  else if(act==='scan'){
    const n=autoScan(true);
    log(n?('手动收录：已读取 '+(isDetailPage()?'当前岗位详情':n+' 个岗位')):'手动收录：当前页面没有识别到岗位');
    renderMonitor();
  }
  else if(act==='unblock'){ clearBlock(); log('监控：已手动解除熔断'); renderMonitor(); }
  else if(act==='excel'){ alert('Excel 导出已移除：监控清单用「导出监控清单」（JSON），变更流水用「导出CSV」。'); }
  else if(act==='deljob'){ deleteJob(id); }
  else if(act==='jobwatch'){
    const j=store.jobs[id];
    if(j){
      j.watch=!j.watch; save();
      log('监控：'+(j.watch?'已盯住':'取消盯住')+'「'+(j.meta.name||id)+'」');
      if(j.watch) log('（公司性质判定在独立脚本 boss-insight.user.js 里）');
      renderMonitor();
    }
  }
  else if(act==='intel'){ alert('公司性质判定已移到独立脚本 boss-insight.user.js（聊天体检）。'); }
  else if(act==='jobapplied'){
    const j=store.jobs[id];
    if(j){ j.applied=!j.applied; save(); log('监控：'+(j.applied?'已标记投递':'取消投递标记')+'「'+(j.meta.name||id)+'」'); renderMonitor(); }
  }
  else if(act==='prune'){
    const del=Object.values(store.jobs).filter(j=>!j.watch);
    if(!del.length){ alert('没有未盯住的岗位'); return; }
    if(!confirm('删除 '+del.length+' 个「未盯住」的岗位？（只删记录，不影响你的账号）')) return;
    del.forEach(j=>{ delete store.jobs[j.jobId]; });
    save(); log('监控：已清理 '+del.length+' 个未盯住的岗位'); renderMonitor();
  }
  else if(act==='aitest'||act==='setkey'||act==='clearkey'){ alert('AI 判定已拆到独立脚本 boss-insight.user.js（聊天体检）：油猴菜单「🤖 设置 AI 接口」里填服务商/地址/Key。'); }
  else if(act==='joblink'){ window.open(id,'_blank'); }
  else if(act==='comppage'){ window.open(id,'_blank'); log('监控：打开公司页后会顺手记录「在招职位数/规模/融资」'); }
  // v0.9.1：删掉 rule-add / rule-del / rules-reset / export-all / import-all 五个死分支 ——
  // 它们调用的函数（addRule/delRule/resetRules/exportAll/importAll）在 v0.9.0 拆走风险规则时已经不存在了，
  // bwImportFile 元素也没人渲染；这些分支一旦哪天被误触发就是 ReferenceError/TypeError
    else if(act==='clear-all'){ if(confirm('确定清空全部本地数据？（监控清单、快照、待处理、变更日志、公司信息镜像都会清掉）\n建议先「导出监控清单」/「导出CSV」备份！')){ clearAll(); renderAll(); } }
}
function onPanelChange(e){
  const el=e.target;
  if(el.id==='bwWatchFile'){                       // v0.9.0：导入监控清单
    const f=el.files&&el.files[0];
    if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const r=importWatchJSON(String(rd.result||''));
        recMsg='导入完成：新增 '+r.add+' 项 / 合并 '+r.upd+' 项'; renderMonitor();
      }catch(err){ alert('导入失败：'+err.message); }
    };
    rd.onerror=()=>alert('文件读取失败');
    rd.readAsText(f,'utf-8');
    el.value='';
    return;
  }
  if(el.dataset.key==='chg.'&&el.dataset.cid){          // v0.7.5：变更日志勾选（供批量删）
    const cid=String(el.dataset.cid);
    if(el.checked) chgSelected.add(cid); else chgSelected.delete(cid);
    renderMonitor();
    return;
  }
  const key=el.dataset.key;
  if(!key) return;
  const parts=key.split('.');
  // v0.9.1：支持单段键（如 data-key="observe"）—— 原来固定写 parts[1]，单段键的值全写进了
  // settings.undefined，「接口观察模式」开关从来没有生效过
  const prop=parts.length===2?parts[1]:parts[0];
  const obj=parts.length===2?store.settings[parts[0]]:store.settings;
  if(!obj) return;
  if(el.type==='checkbox') obj[prop]=el.checked;
  else if(el.type==='number') obj[prop]=Math.max(1,Math.round(Number(el.value)||1));
  else obj[prop]=el.value;
  save('settings'); renderSettings();
}
function deleteJob(id){
  if(!confirm('从监控列表移除该岗位？（只删本机记录）')) return;
  const it=store.jobs[id];
  const itemId=(it&&it.itemId)||'';
  if(itemId){ delete store.watch[itemId]; }
  delete store.jobs[id];
  store.signals=(store.signals||[]).filter(s=>s.itemId!==itemId);
  // v0.9.5：原先只清 signals、不清 changelog —— 「待跟进」里会留下这个岗位的历史变更行，
  // 点进去指向一个已经不存在的岗位（幽灵行），点删除还会报错。watchdel 那条路本来就清了，这里补齐。
  if(itemId) store.changelog=(store.changelog||[]).filter(c=>c.itemId!==itemId);
  save(); renderMonitor();
}
// v0.9.1：删掉 importFile —— 它调用的 importAll 已不存在，对应的 bwImportFile 输入框也没人渲染（纯死代码）
let monTab='watch';        // watch | signals
let pendingCand=[];        // 收录时「多条候选」待你点选
let recMsg='';             // 收录进度 / 结果
let recLast=null;          // 上一次收录的报告（成功 / 失败明细）

// ===== v0.9.0：卡片上的「盯岗 / 盯司」按钮 =====
// 用户要求：监控直接在「过滤之后仍然可见的卡片」上操作 —— 过滤脚本把垃圾岗位隐藏掉，
// 留在页面上的卡片就是你要看的；在这张卡上点一下就收录这个岗位 / 这家公司。
// 被过滤脚本隐藏的卡片（data-bwf="hidden" / display:none）不注入按钮。
function cardCandidateOf(card,jobId){
  const name=domPick(card,['.job-name','[class*="job-name"]','[class*="jobName"]','.job-title'])||'';
  const company=domPick(card,['.company-name','[class*="company-name"]','[class*="companyName"]','[class*="brandName"]'])||'';
  const salary=cleanGarbled(domPick(card,['.salary','[class*="salary"]'])||'');
  const hr=cleanHr(domPick(card,['.info-public em','.boss-name','[class*="boss"] .name','[class*="bossName"]'])||'');
  const city=domPick(card,['.job-area','[class*="job-area"]','[class*="jobArea"]'])||'';
  const labels=Array.prototype.slice.call(card.querySelectorAll('ul[class*="tag"] li,ol[class*="tag"] li,[class*="tag-list"] li'))
    .map(domText).filter(Boolean).slice(0,8);
  const api=apiJobOf(jobId)||{};
  const cur=store.jobs[jobId]||{};
  const last=(cur&&cur.last)||{};
  // v0.9.2：从组件缓存兜底取 JD —— 「盯岗」原来只发 1 次详情请求，解析失败时
  // 拿到的 JD 是空的，`if(o.jd)` 又不覆盖，这条岗位就永远没有 JD。
  // 缓存里本来就有全文（0 次额外请求），能拿到就不必再抓一次详情。
  let jd='';
  try{
    const d=(typeof __bwVueDetail!=='undefined'&&__bwVueDetail&&__bwVueDetail.jobId===String(jobId))?__bwVueDetail:null;
    if(d) jd=String(d.jd||'');
  }catch(e){}
  if(!jd) jd=String(last.jd||'');
  return {jobId, name:name||api.name||cur.jobName||'', company:company||api.company||cur.company||'',
    salary:salary||api.salary||last.salary||'', hr:hr||api.boss||cur.hr||'', city:city||last.city||'',
    jd:jd.slice(0,6000), labels:labels.length?labels:[], exp:pickExpTag(labels),
    url:'https://www.zhipin.com/job_detail/'+jobId+'.html', src:'card'};
}
function cardVisible(card){
  try{
    if(!card) return false;
    if(card.getAttribute&&card.getAttribute('data-bwf')==='hidden') return false;   // 过滤脚本隐藏的
    if(card.style&&card.style.display==='none') return false;
    const r=card.getBoundingClientRect?card.getBoundingClientRect():null;
    if(r&&r.height===0&&r.width===0) return false;
  }catch(e){}
  return true;
}
function cardWatchTargets(){
  const out=[], seen={};
  try{
    Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]')).forEach(a=>{
      try{
        const href=a.getAttribute('href')||a.href||'';
        const jid=jobIdFromUrl(href);
        if(!jid||seen[jid]) return;
        let card=a;
        for(let i=0;i<7&&card&&card.tagName!=='LI';i++) card=card.parentElement;
        if(!card||card===document.body||card===document.documentElement) return;
        if(!cardVisible(card)) return;
        seen[jid]=1;
        out.push({card, jobId:jid});
      }catch(e){}
    });
  }catch(e){}
  return out;
}
function cardRecordJob(jobId,card,btn){
  try{
    // v0.9.2：原来这里完全不看预算和熔断 —— 连点 5 张卡就是 5 次详情请求，
    // 「主动检查（今日）」计数却一次都不涨，面板数字失真、也给 BOSS 留下高频详情特征
    if(isBlocked()){ alert('风控熔断中，暂停到 '+blockedText()+'，这期间不发任何请求。'); return; }
    if(getBudgetLeft()<=0){ alert('今日主动请求预算已用完（'+store.settings.monitor.dailyBudget+' 次）。\n「收录」每收一个岗位要发 1 次详情请求，所以也走这个预算；明天自动归零。'); return; }
    if(btn){ btn.disabled=true; btn.textContent='收录中…'; }
    const cand=cardCandidateOf(card,jobId);
    // v0.9.2：先入账再发请求 —— 请求确实发出去了，失败/超时同样消耗预算
    //（runMonitorCheck 的 onerror/ontimeout 就是这个口径），否则「一直失败」等于白嫖额度
    spendBudget(1); save('settings'); scheduleRender();
    recordCandidate(cand).then(it=>{
      if(btn){ btn.disabled=false; btn.textContent='已盯 ✓'; btn.classList.add('on'); }
      log('收录：'+(it.jobName||jobId)+'（'+(it.company||'')+(it.hr?(' · HR '+it.hr):'')+'）');
      scheduleRender();
    }).catch(e=>{
    if(btn){ btn.disabled=false; btn.textContent='收录'; }
      alert('收录失败：'+(e&&e.message||e));
    });
  }catch(e){}
}
function cardRecordCompany(card,btn){
  try{
    const company=domPick(card,['.company-name','[class*="company-name"]','[class*="companyName"]','[class*="brandName"]'])||'';
    if(!company){ alert('这张卡片上没读到公司名'); return; }
    upsertWatchItem({type:'company', company, source:'card'});
    if(btn){ btn.textContent='已盯 ✓'; btn.classList.add('on'); }
    log('收录公司：'+company+'（已加入监控清单作标记；公司维度的「新岗位提醒」尚未实现）');
    scheduleRender();
  }catch(e){}
}
let cardInjectAt=0;
function injectCardButtons(){
  try{
    const t=now();
    if(t-cardInjectAt<1200) return 0;      // 轻节流：滚动/重绘时不会狂跑
    cardInjectAt=t;
    let n=0;
    cardWatchTargets().forEach(({card,jobId})=>{
      if(card.querySelector('.bw-cardbtns')) return;
      const box=document.createElement('div');
      box.className='bw-cardbtns';
      const b1=document.createElement('button');
    b1.type='button'; b1.className='bw-cardbtn'; b1.textContent='收录';
      b1.title='收录这个岗位：抓一次详情建档（含 HR 名），之后你浏览到它就自动对比变化';
      b1.addEventListener('click',(ev)=>{ ev.preventDefault(); ev.stopPropagation(); cardRecordJob(jobId,card,b1); },true);
      const b2=document.createElement('button');
      b2.type='button'; b2.className='bw-cardbtn'; b2.textContent='盯司';
      b2.title='记下这家公司（仅作清单标记；公司维度的新岗位提醒尚未实现）';
      b2.addEventListener('click',(ev)=>{ ev.preventDefault(); ev.stopPropagation(); cardRecordCompany(card,b2); },true);
      box.appendChild(b1); box.appendChild(b2);
      try{ if(getComputedStyle(card).position==='static') card.style.position='relative'; }catch(e){}
      card.appendChild(box);
      n++;
    });
    return n;
  }catch(e){ return 0; }
}

function renderMonitor(){
  const el=document.getElementById('bwPage_mon');
  if(!el) return;
  const keep=pageSnapshot(el);   // v0.8.2
  const st=store.settings.monitor;
  const items=watchList();
  const jobs=watchJobs();
  const cos=watchCompanies();
  const sigs=openSignals();
  const cmpToday=(st.compareDate===localDateStr())?(st.compareCount||0):0;
  let html='<div class="bw-cards">'+
    '<div class="bw-card" data-act="cardwatch" title="我手动收录的岗位 / 公司。没收录的岗位脚本一行都不记"><b>'+jobs.length+' / '+cos.length+'</b><span>监控岗位 / 公司</span></div>'+
    '<div class="bw-card" data-act="cardsig" title="需要你行动的：薪资下调 / 要求拔高 / HR 换人 / 下线 / 新岗位。点这里看待办"><b>'+sigs.length+'</b><span>待处理</span></div>'+
    '<div class="bw-card" data-act="cardcompare" title="浏览页面时，每遇到一个监控项就与上次快照对比一次（只读本机数据，不发任何请求）。今天累计 / 最后对比时间"><b>'+cmpToday+'</b><span>今日对比'+(st.lastCompareAt?(' · '+relDay(st.lastCompareAt)):'')+'</span></div>'+
    '<div class="bw-card" data-act="cardbudget" title="只在点「立即检查」时计数：每主动请求一个岗位 +1；浏览页面不消耗。跨天自动归零"><b>'+(st.usedToday||0)+'/'+st.dailyBudget+'</b><span>主动检查（今日）</span></div>'+
    '</div>';
  html+=hookDiagHtml();
  html+=instanceNotesHtml();
  html+=vueFetchHtml();
  if(isBlocked()){
    html+='<div class="bw-note" style="background:#fee2e2;border-color:#fecaca;color:#b91c1c">已触发风控熔断（'+esc(st.blockReason||'触发风控')+'），暂停到 '+esc(blockedText())+'。<br>实测经验：出现验证码当天就停止一切操作，次日再试。<button class="bw-btn bw-sm bw-danger" data-act="unblock" style="margin-top:6px">我已确认安全，解除熔断</button></div>';
  }
  // ===== 收录区（v0.9.0 主入口）=====
  html+='<div class="bw-h">收录岗位 / 公司（粘贴「公司名 + 职位名」，一行一条）</div>';
  html+='<textarea id="bwRecInput" style="width:100%;height:58px;border:1px solid #e3e8f0;border-radius:8px;padding:6px 8px;font:12px/1.5 monospace" placeholder="例：深圳乐有家控股集团 管培生&#10;也可以直接粘岗位链接或职位ID（一行一条）"></textarea>';
  html+='<div class="bw-row"><button class="bw-btn" data-act="rec">收录</button>'+
    '<button class="bw-btn bw-sm" data-act="reccur">收录当前页</button>'+
    '<span class="bw-muted">'+(recordBusy?'收录中…':esc(recMsg||('收录时才发请求（1 次搜索 + 1 次详情），间隔 '+(watchCfg().reqMinDelay||2)+'–'+(watchCfg().reqMaxDelay||5)+' 秒'))) +'</span></div>';
  html+='<div class="bw-muted" style="margin-top:4px">「收录」＝把这条岗位存进本机档案（点收录才发 1 次搜索 + 1 次详情请求）；卡片左上角的「收录」是同一个动作。用例：本脚本收录<b>岗位</b>，聊天脚本收录的是<b>会话</b>。</div>';
  if(pendingCand.length){
    html+='<div class="bw-note">有多条候选，点一行收录：<div style="margin-top:4px">'+
      pendingCand.map((c,i)=>'<div class="bw-row" style="margin:2px 0"><button class="bw-btn bw-sm" data-act="recpick" data-id="'+i+'">收录</button>'+
        '<span><b>'+esc(c.name||'')+'</b> · '+esc(c.company||'')+' · '+esc(c.salary||'')+(c.hr?(' · HR '+esc(c.hr)):'')+'</span></div>').join('')+
      '</div><button class="bw-btn bw-sm" data-act="recclear">取消</button></div>';
  }
  if(recLast&&(recLast.ok.length||recLast.fail.length)){
    html+='<div class="bw-note" style="margin-top:6px">收录结果：成功 '+recLast.ok.length+' 条'+(recLast.fail.length?(', 失败 '+recLast.fail.length+' 条'):'')+
      (recLast.ok.length?('<br>✓ '+recLast.ok.map(x=>esc(x.name||'')+(x.company?(' · '+esc(x.company)):'')+(x.hr?(' · HR '+esc(x.hr)):'')).join('<br>✓ ')):'')+
      (recLast.fail.length?('<br>✗ '+recLast.fail.map(x=>esc(x.line||'')+' → '+esc(x.why||'')).join('<br>✗ ')):'')+
      '<br><button class="bw-btn bw-sm" data-act="recclear">知道了</button></div>';
  }
  // ===== 两个页签：监控项 / 待跟进 =====
  html+='<div class="bw-tabs" style="margin-top:10px">'+
    '<button class="'+(monTab==='watch'?'on':'')+'" data-act="montab" data-id="watch">监控项 '+items.length+'</button>'+
    '<button class="'+(monTab==='signals'?'on':'')+'" data-act="montab" data-id="signals">待处理 '+sigs.length+'</button></div>';
  if(monTab==='signals'){
    if(!sigs.length) html+='<div class="bw-empty">暂无待处理。监控项出现「薪资下调 / 要求拔高 / HR 换人 / 下线 / 新岗位」时会进这里。</div>';
    else html+=sigs.slice(0,40).map(s=>{
      const tag=s.level==='alert'?'<span class="bw-lv bw-lv高">重要</span>':(s.level==='warn'?'<span class="bw-lv bw-lv中">需留意</span>':'<span class="bw-lv bw-lv低">提示</span>');
      const it=store.watch[s.itemId]||{};
      // v0.9.2：删掉「🤖 AI 建议」行 —— AI 判定在 boss-insight v0.4.0 已删除，
      // 它不再往 bw_insight_out.ai 写任何东西，这一行永远是空的。
      const aiLine='';
      return '<div class="bw-log">'+tag+' <b>'+esc(it.jobName||it.company||'')+'</b> <span class="bw-muted">'+esc(it.company||'')+(it.hr?(' · HR '+esc(it.hr)):'')+
        '</span> <span class="bw-muted" style="float:right">'+new Date(s.ts).toLocaleString('zh-CN',{hour12:false})+'</span>'+
        '<div class="bw-chg">'+esc(s.text||'')+'</div>'+(s.note?('<div class="bw-muted">📝 '+esc(s.note)+'</div>'):'')+
        aiLine+
        '<div style="margin-top:3px"><button class="bw-btn bw-sm" data-act="sigdone" data-id="'+esc(s.id)+'">标记已跟进</button> '+
        '<button class="bw-btn bw-sm" data-act="signote" data-id="'+esc(s.id)+'">加备注</button> '+
        '<button class="bw-btn bw-sm bw-warn" data-act="sigignore" data-id="'+esc(s.id)+'">忽略</button></div></div>';
    }).join('');
  }else{
    if(!items.length){
      html+='<div class="bw-empty">还没有监控项。上面粘贴「公司名 + 职位名」点「收录」，或打开岗位详情页点「收录当前页」。</div>';
    }else{
      html+='<table class="bw-t"><tr><th>岗位 / 公司</th><th>HR</th><th>薪资</th><th>最近变化</th><th></th></tr>';
      items.forEach(it=>{
        const last=it.last||{};
        const chg=changesOfItem(it.id);
        const lastCh=chg.length?chg[0].text:'—';
        // v0.9.2：删掉「风险 xx」角标 —— boss-insight v0.5.0 起已经不打分、也不再写 bw_insight_out.risk，
        // 这个角标永远读不到值（永远不显示），留着只是让人以为「装了 insight 就有风险分」。
        const rkLine='';
        html+='<tr><td><b>'+esc(it.jobName||it.company||'')+'</b><br><span class="bw-muted">'+esc(it.company||'')+(it.type==='company'?'（公司项）':'')+'</span>'+
          (last.status&&last.status!=='在招'?('<br><span class="bw-lv bw-lv高">'+esc(last.status)+'</span>'):'')+(rkLine?('<br>'+rkLine):'')+'</td>'+
          '<td>'+esc(it.hr||'—')+'</td>'+
          '<td>'+(last.salary?esc(last.salary):'—')+(last.exp?('<br><span class="bw-muted">'+esc(last.exp)+(last.edu?(' · '+esc(last.edu)):'')+'</span>'):'')+'</td>'+
          '<td class="bw-muted">'+esc(String(lastCh).slice(0,40))+(it.lastChangeAt?('<br><span class="bw-muted">'+relDay(it.lastChangeAt)+'</span>'):'')+'</td>'+
          '<td>'+(it.url?'<button class="bw-btn bw-sm" data-act="watchopen" data-id="'+esc(it.url)+'">打开</button> ':'')+
    '<button class="bw-btn bw-sm" data-act="watchcheck" data-id="'+esc(it.id)+'">立即检查</button> '+
          '<button class="bw-btn bw-sm bw-danger" data-act="watchdel" data-id="'+esc(it.id)+'">删除</button></td></tr>';
        if(chg.length){
          html+='<tr><td colspan="5" class="bw-muted" style="padding-left:16px">'+chg.slice(0,5).map(c=>'· '+esc(c.text)).join('<br>')+
            (chg.length>5?('<br><span class="bw-muted">… 共 '+chg.length+' 条，导出后可见全部</span>'):'')+'</td></tr>';
        }
      });
      html+='</table>';
    }
  }
  // 两个页签都保留的操作行（导出 / 导入 / 清空 / 立即检查）
  html+='<div class="bw-row"><button class="bw-btn bw-sm" data-act="exportwatch">导出监控清单</button>'+
    '<button class="bw-btn bw-sm" data-act="importwatch">导入监控清单</button>'+
    '<button class="bw-btn bw-sm bw-danger" data-act="clearwatch">清空监控数据</button>'+
    '<button class="bw-btn bw-sm" data-act="check">立即检查（只读）</button>'+
    '<input type="file" id="bwWatchFile" accept=".json" style="display:none"></div>';
  html+='<div class="bw-muted" style="font-size:11px">主路径：你浏览列表/详情时，脚本读页面正在展示的数据（只读、不发请求）与监控项对比；「立即检查」是你不浏览时的可选补充（间隔 '+st.minDelay+'–'+st.maxDelay+'s/岗，命中风控当日熔断）。</div>';
  // v0.7.5：折叠（默认收起，少占屏）+ 勾选批量删 + 一键清理「首次补全」噪音 + 删除可撤销
  const chgTotal=store.changelog.length, noiseN=noiseChangeIds().length, bogusN=bogusChangeIds().length;
  const selN=store.changelog.filter(c=>chgSelected.has(String(c.id))).length;
  html+='<div class="bw-h" id="bwChg"><span class="bw-toggle" data-act="chgtoggle">变更日志'+(chgTotal?' ('+chgTotal+')':'')+(chgOpen?' ▾':' ▸')+'</span>'+
    '<span style="float:right;margin-top:-2px">'+
    (chgOpen&&noiseN?'<button class="bw-btn bw-sm bw-warn" data-act="chgnoise" title="删掉全部「未知 → 值」的首次补全记录（加了备注或标了跟进的不删）">清理无意义('+noiseN+')</button> ':'')+
    (chgOpen&&bogusN?'<button class="bw-btn bw-sm bw-warn" data-act="chgbogus" title="删掉「经验/学历要求等级其实相同」的旧版误报记录（加了备注或标了跟进的不删）">清理误报('+bogusN+')</button> ':'')+
    (chgOpen&&chgTotal?'<button class="bw-btn bw-sm" data-act="chgselall">'+(selN&&selN===chgTotal?'取消全选':'全选')+'</button> ':'')+
    (chgOpen&&selN?'<button class="bw-btn bw-sm bw-danger" data-act="chgdel" data-id="__sel__">删除选中('+selN+')</button> ':'')+
    (chgOpen&&chgTotal?'<button class="bw-btn bw-sm bw-danger" data-act="chgclear">清空</button> ':'')+
    '<button class="bw-btn bw-sm" data-act="chgexp">导出CSV</button></span></div>';
  if(chgUndoCount) html+='<div class="bw-note" style="margin-bottom:6px">已删除 '+chgUndoCount+' 条变更记录 <button class="bw-btn bw-sm" data-act="chgundo">撤销</button> <span class="bw-muted">（8 秒内可恢复）</span></div>';
  if(chgOpen){
    if(!chgTotal) html+='<div class="bw-empty">暂无变更记录</div>';
    else{
      const list=chgShowAll?store.changelog:store.changelog.slice(0,5);
      html+=list.map(c=>{
        const done=c.done?'<span class="bw-lv bw-lv低">已跟进</span> ':'';
        const note=c.note?('<div class="bw-muted" style="margin-top:2px">📝 '+esc(c.note)+'</div>'):'';
        const noise=isNoiseChange(c)?' <span class="bw-lv" style="background:#eef1f6;color:#7a8396">补全</span>':'';
        const bogus=isBogusChange(c)?' <span class="bw-lv" style="background:#fde68a;color:#92400e">误报?等级相同</span>':'';
        return '<div class="bw-log"><input type="checkbox" data-key="chg." data-cid="'+esc(c.id)+'"'+(chgSelected.has(String(c.id))?' checked':'')+' style="margin-right:4px;vertical-align:-1px">'+done+
          '<span class="bw-muted">'+new Date(c.ts).toLocaleString('zh-CN',{hour12:false})+'</span> '+
          '<b>'+esc(c.jobName||'')+'</b>'+(c.company?' <span class="bw-muted">('+esc(c.company)+')</span>':'')+noise+bogus+
          '<div class="bw-chg">'+c.changes.map(esc).join('<br>')+'</div>'+note+
          '<div style="margin-top:3px">'+
            '<button class="bw-btn bw-sm" data-act="chgdone" data-id="'+esc(c.id)+'">'+(c.done?'取消已跟进':'标记已跟进')+'</button> '+
            '<button class="bw-btn bw-sm" data-act="chgnote" data-id="'+esc(c.id)+'">'+(c.note?'改备注':'加备注')+'</button> '+
            '<button class="bw-btn bw-sm bw-danger" data-act="chgdel" data-id="'+esc(c.id)+'">删</button>'+
          '</div></div>';
      }).join('');
      if(!chgShowAll&&chgTotal>list.length) html+='<div class="bw-row"><button class="bw-btn bw-sm" data-act="chgmore">展开全部 '+chgTotal+' 条</button></div>';
      else if(chgShowAll&&chgTotal>5) html+='<div class="bw-row"><button class="bw-btn bw-sm" data-act="chgless">只看最近 5 条</button></div>';
    }
  }
  el.innerHTML=html;
  pageRestore(el,keep);
}
function renderSettings(){
  const el=document.getElementById('bwPage_set');
  if(!el) return;
  const keep=pageSnapshot(el);   // v0.8.2
  const s=store.settings;
  // v0.9.1：单段键（observe）直接取顶层 —— 原来 s[p[0]][p[1]] 对单段键永远返回 null，勾选状态回显不出来
  const getPath=k=>{ const p=k.split('.'); return p.length===2?(s[p[0]]?s[p[0]][p[1]]:null):s[k]; };
  const idOf=k=>'bwSet_'+String(k).replace(/[^A-Za-z0-9]/g,'_');
  const row=(key,label,desc)=>'<label class="bw-set"><input type="checkbox" id="'+idOf(key)+'" data-key="'+key+'" '+(getPath(key)?'checked':'')+'> '+label+' <span class="bw-muted">'+desc+'</span></label>';
  const num=(key,label)=>'<label class="bw-set">'+label+' <input type="number" id="'+idOf(key)+'" data-key="'+key+'" value="'+getPath(key)+'" style="width:90px"></label>';
  let html='<div class="bw-h">监控设置</div>';
  html+='<div class="bw-note">监控脚本只做<b>只读</b>的事：① 你浏览页面时被动记录并比对；② 你手点「立即检查」；③ 可选的低频自动检查（默认关）。<b>不投递、不发消息、不做任何写操作。</b></div>';
  html+=row('monitor.active','低频自动检查（默认关）','开启后每 '+s.monitor.intervalHours+' 小时只检查「盯住」的岗位；只读 GET，命中风控当日熔断');
  // v0.9.2：删掉 monitor.autoList / monitor.onlyWatch 两个死开关。
  // 它们只有 UI 行、没有任何逻辑读（v0.9.0 起「收录了才监控」是硬口径，两个开关无从生效），
  // 文案却写着「打开：浏览列表页时把整页岗位都收进来」—— 勾了什么都不发生，属于功能性欺骗。
  html+=num('monitor.intervalHours','自动检查间隔(小时)');
  html+=num('monitor.maxBatch','每轮岗位数');
  html+=num('monitor.minDelay','最小间隔(秒)');
  html+=num('monitor.maxDelay','最大间隔(秒)');
  html+=num('monitor.dailyBudget','每日请求预算');
  // v0.9.1：删掉「风险扫描 risk.scanJd」死开关 —— 风险规则 v0.9.0 起已拆到 boss-insight，
  // settings.risk 根本不存在，勾了没有任何效果（误导 UI；下方"分析件"说明已指向 insight）
  html+='<div class="bw-h">调试</div>';
  // v0.9.2：删掉 notify.change（桌面通知）死开关 —— 唯一会发通知的 addChange 全文件零调用，
  // 勾了不会有任何反应。变更本身照旧写进「变更日志 / 待跟进」，只是不会弹系统通知。
  html+=row('observe','接口观察模式','在控制台打印捕获到的 zhipin 接口路径');
  html+='<div class="bw-h">分析件（可选）</div>';
  html+='<div class="bw-note">「岗位体检」相关功能已拆到独立脚本 <b>boss-insight.user.js</b>，但它现在<b>只做聊天会话体检</b>（风险关键词扫 HR 发来的消息、本地隐藏、站内处置）。<br>原先的「岗位风险打分」和「AI 跟进建议」都已删除（用户口径：没用），所以本面板不会再显示风险分或 🤖 建议。设置入口在油猴菜单「⚙ 聊天体检设置（风险词）」。</div>';
  // v0.8.0：服务商预设下拉 —— 选一下就把地址/模型填好（全部 OpenAI 兼容协议）html+='<div class="bw-h">数据</div>';
  html+='<div class="bw-row">'+
    '<button class="bw-btn bw-danger" data-act="clear-all">清空全部数据</button>'+'</div>';
  html+='<div class="bw-h">接口观察（改版排查用）</div>';
  const hkn=hookStatus();
  const seen=(store.diag&&store.diag.seen)||{};
  html+='<div class="bw-muted" style="font-size:11px">页面世界钩子：'+(mainHookReady?'✓ 已注入':'✗ 未注入')+
    '（页面请求计数 fetch '+(seen.fetch||0)+' / XHR '+(seen.xhr||0)+' / 命中接口 '+(seen.api||0)+'）<br>'+
    '沙箱钩子：fetch '+(hkn.fetch?'✓':'✗')+' · XHR '+(hkn.xhr?'✓':'✗')+' · 已捕获 '+hkn.captured+' 类接口</div>';
  if(!mainHookReady&&store.diag&&store.diag.mainErr) html+='<div class="bw-note bw-warn">页面注入报错：'+esc(String(store.diag.mainErr))+'</div>';
  const caps=Object.values(store.captured).sort((a,b)=>b.last-a.last).slice(0,12);
  if(!caps.length) html+='<div class="bw-empty">尚未捕获到接口</div>';
  else html+=caps.map(c=>'<div class="bw-log"><b>'+esc(c.type||'?')+'</b> ×'+c.count+' <span class="bw-muted">'+esc(c.url)+'</span></div>').join('');
  html+='<div class="bw-h">运行日志</div>';
  if(!store.logs.length) html+='<div class="bw-empty">暂无日志</div>';
  else html+=store.logs.slice(0,15).map(l=>'<div class="bw-log"><span class="bw-muted">'+new Date(l.ts).toLocaleTimeString('zh-CN',{hour12:false})+'</span> '+esc(l.msg)+'</div>').join('');
  html+='<div class="bw-note" style="margin-top:10px">v'+VERSION+' · 所有数据只存本机浏览器存储，本脚本不调用任何外部接口（连 AI 功能都没有）。使用本脚本有触发平台风控的风险，请低频、克制使用并自行承担。</div>';
  el.innerHTML=html;
  pageRestore(el,keep);
}
let renderTimer=null;
function scheduleRender(){
  if(renderTimer) return;
  renderTimer=setTimeout(()=>{ renderTimer=null; renderAll(); },300);
}
function renderAll(){
  if(!bwUi) return;  renderMonitor(); renderSettings();
}
function boot(){
  if(typeof window==='undefined'||!window.document) return;
  try{
    if(!/zhipin\.com/i.test(window.location.hostname)) return;
    loadStore();
    migrateTo090();     // v0.9.0：删掉「自动建档、你没收录」的旧档案，只留你盯住的
    autoPruneNoise();   // v0.7.5：历史「首次补全」噪音自动清掉，不用逐条手删
    cleanBogusChanges();// v0.8.0：历史「等级相同却报要求拔高」的误报也一并清掉（同样可撤销）
    getBudgetLeft();    // v0.8.0：跨日先把「主动检查」次数归零，避免面板显示昨天的残留数字
    try{
      // v0.8.0：记录本页面正在运行的脚本版本（同一页面跑多个版本时，面板会提示去删旧版）
      const inst=JSON.parse(localStorage.getItem('bw_instances')||'{}');
      const t=now();
      Object.keys(inst).forEach(k=>{ if(t-(inst[k]||0)>10*60000) delete inst[k]; });
      inst[INSTANCE_ID]={v:VERSION, at:t};   // v0.9.2：一个标签页一个 key，见 instanceNotesHtml
      localStorage.setItem('bw_instances',JSON.stringify(inst));
    }catch(e){}
    // 一次性迁移：聊天已拆到 boss-chat，把旧的聊天数据镜像到 localStorage 供它导入
    try{
      if(!localStorage.getItem('bw_chats_export')&&store.chats&&Object.keys(store.chats).length){
        localStorage.setItem('bw_chats_export',JSON.stringify(store.chats));
        log('已把 '+Object.keys(store.chats).length+' 个会话导出给 boss-chat（一次性迁移）');
      }
    }catch(e){}
    try{ window.addEventListener('message',onPageMessage,false); }catch(e){}
    hookFetch();
    hookXHR();
    injectMainHook();
    [0,120,400,1500,4000].forEach(d=>setTimeout(()=>{ hookFetch(); hookXHR(); injectMainHook(); },d));
    setTimeout(()=>saveDiag(),2500);
    setTimeout(()=>saveDiag(),8000);
    setTimeout(()=>{ try{ autoScan(); }catch(e){} },3000);
    setTimeout(()=>{ try{ vueDirect(); askVue(); autoScan(); }catch(e){} },4200);
    setInterval(()=>{ try{ if(document.visibilityState==='visible'){ vueDirect(); askVue(); autoScan(); } }catch(e){} },12000);
    // v0.9.0：在「过滤之后仍然可见的卡片」上挂「盯岗 / 盯司」按钮（轻节流，滚动/重绘都不丢）
    try{
      setTimeout(()=>injectCardButtons(),1500);
      setInterval(()=>{ try{ if(document.visibilityState==='visible') injectCardButtons(); }catch(e){} },2500);
    }catch(e){}
    // v0.9.0：启动就把「监控项 + 变更流水」镜像出去（给 boss-insight 读；它现在只用聊天部分，这条留着不碍事）
    try{ setTimeout(()=>mirrorInsight(true),1200); setInterval(()=>{ try{ mirrorInsight(); }catch(e){} },60000); }catch(e){}
    // HR 上下线记录：只针对「当前打开的那个会话」（列表里看不到别人的在线状态）。
    // 后台标签也照常跑（浏览器会把定时器降到 ~1 分钟一次，正好）。
    if(document.body) buildUI();
    else document.addEventListener('DOMContentLoaded',buildUI);
    if(typeof GM_registerMenuCommand==='function'){
      GM_registerMenuCommand('💼 求职助手面板（开/关）',()=>{ if(!bwUi) buildUI(); togglePanel(); });
      GM_registerMenuCommand('🔍 立即监控检查',()=>runMonitorCheck(()=>{ if(bwUi) renderMonitor(); }));
    }
    // 自动检查默认关闭（适当原则）：开了也只查「盯住」的少数岗位，低频只读。
    // 关键：按「距上次检查是否够一个间隔」判断，而不是每次刷新都查（否则频繁刷新会白耗预算）
    setTimeout(()=>{
      const st=store.settings.monitor;
      if(!st.active) return;
      const gap=Math.max(1,st.intervalHours)*3600*1000;
      const due=!st.lastCheck||(now()-st.lastCheck)>=gap;
      if(due) runMonitorCheck(()=>{ if(bwUi) renderMonitor(); });
    },8000);
    setInterval(()=>{
      const st=store.settings.monitor;
      if(!st.active) return;
      const gap=Math.max(1,st.intervalHours)*3600*1000;
      if(!st.lastCheck||(now()-st.lastCheck)>=gap) runMonitorCheck(()=>{ if(bwUi) renderMonitor(); });
    },3600*1000);
  }catch(e){ try{ console.error('[boss-watcher]',e); }catch(_){} }
}
boot();

if(typeof module!=='undefined'&&module.exports){
  module.exports={
    normText, jdNorm, salaryChanged, lineDiff, toTs, csvEsc,
    detectStatus, jobIdFromUrl, classify,
    riskCode, mergeDeep, pick, findArr, findJobDetail, extractJob,
    pageWin, hookFetch, hookXHR, hookStatus, hookDiagHtml,
    injectMainHook, mainHookSource, onPageMessage, saveDiag,
    scrapeListDom, domText, domPick,
    scrapeDetailDom, autoScan, isDetailPage, detailJdText,
    scrapeCompanyJobCount, mirrorCompanyJobs, rememberApiJobs, apiJobOf, looksGarbled,
    salaryNum, expRank, eduRank, relDay, pickExpTag, fmtExp,
    canonExp, canonEdu, fmtEdu, vueIngest, vueJobOf, askVue, vueDirect, bumpCompare, reqLineBogus, isBogusChange, bogusChangeIds, cleanBogusChanges, isLoginPage, instanceNotesHtml, vueFetchHtml,
    isNoiseChange, noiseChangeIds, removeChanges, undoRemoveChanges, autoPruneNoise,
    fmtTime,
    isBlocked, blockedText, blockTillTomorrow, clearBlock,
    localDateStr, budgetDate, flushSave,
    // v0.9.0：按需收录 / 监控项 / 跟进信号
    normKey, itemIdOfJob, itemIdOfCompany, watchList, watchJobs, watchCompanies,
    openSignals, signalsOfItem, changesOfItem, snapFromJob, diffWatch, addSignal,
    signalFromChange, applyWatchChanges, observeJob, parseRecordLine, candFromApi,
    scoreCandidates, searchCandidates, openSearchPage, cleanHr, pickHrName, fetchDetailSnapshot,
    upsertWatchItem, recordCandidate, recordFromInput, currentPageCandidates,
    watchExportData, exportWatchJSON, importWatchJSON, clearWatchData, migrateTo090,
    cardCandidateOf, cardVisible, cardWatchTargets, injectCardButtons,
    mirrorInsight,
    store, DEFAULTS
  };
}

})();
