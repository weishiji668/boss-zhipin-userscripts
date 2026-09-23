// ==UserScript==
// @name         BOSS直聘 · 岗位体检（岗位风险词 + 聊天处置）
// @namespace    local.boss-insight
// @version      0.5.10
// @description  只做一件事：聊天会话体检与处置。① 读 boss-chat 写在 localStorage 的会话镜像（bc_chats_mirror，跨脚本共享那个键），用你设置的风险词扫**对方发来的消息**，命中的会话打「风险」标记；② 按标记一键处置：本地隐藏（可恢复）/ 标不感兴趣 / 拉黑 / 删除会话（后两者不可逆，只在你点击时执行，受每日上限与同会话冷却约束）。脚本自己不发任何页面请求；「岗位风险打分」在 v0.5.0 删除、「AI 跟进建议」在 v0.4.0 删除，这两项已不存在。设置：油猴菜单「⚙ 岗位体检设置」。v0.4.1：修「自己发的那句被当成对方原话」（列表那句只在没读到对方消息时兜底；详情页只收左半边的消息，右半边是我自己发的）+「同公司/同名 HR 文本歧义时挂错会话、可能误拉黑」（歧义宁可不挂）+「刷新后已标记/已删除状态全丢、跨页面失效」（处置状态落盘 bi_chat）+「按拉黑词批量拉黑会把已处理会话重复提交」（跳过已标记/已删除，口径与另两个批量一致）+ 隐藏名单与处置流水改读-改-写（多标签不互相覆盖）+ 若干本地性能小修（风险打分按镜像版本短路、消息区缓存与脏检测、面板少解析两遍镜像、后台标签不再空转）。v0.5.0：岗位风险**去掉打分**，改纯风险关键词（一行一个）；「立即体检」拿风险词扫聊天里对方发的消息，命中给会话卡打「风险」标记并计入待处理；新增「一键隐藏标记卡片」（把带风险标记的会话从列表批量隐藏，仅本地显示，再点显示回来）；卡片拆成 今日会话总数/总会话总数/今日立即体检/总立即体检/待处理/风险词；体检计数只在你点按钮时累加、按本地日期换日（沿用 localDateStr 口径），8 秒自动重扫只刷标记不计数。v0.5.1：修「检测不到数据」——对方消息改读 boss-chat 的本地归档 bc_chats（带 dir 区分我方/对方，列表页也能拿到全文，不再依赖「正开着的会话」）；页面探针读到的优先；风险词与隐藏词默认表统一（同一份底词），三套词在面板里并排展示并各注用途（风险词=体检打标 / 隐藏词=本地隐藏 / 拉黑词=站内拉黑）。v0.5.2：体检计数改口径——不是「点了多少次按钮」，而是**体检命中的关键词数**，按天切：今日立即体检=今天命中的关键词数、总立即体检=各天累计（保留 60 天）；自动重扫也会刷新今日数。v0.5.3：面板改 fixed 定位并可拖动（按住标题栏拖，位置存本机 bi_panelpos，刷新还在；视口钳制防拖出屏幕）。v0.5.5：修「面板拖不动/拖一次就消失」——钳位原来按小把手尺寸算（560px 面板能被拖到只剩 40px 在屏内，再开就像消失），现按面板实际尺寸钳位；打开时越界自愈回默认位；悬浮球本身也可拖动（按住球拖，位置存 bi_fabpos），拖动后不误触开关面板。v0.5.6（审核修复）：修「bc_chats 跨脚本读取链路根本不通」——油猴的 GM 存储按脚本隔离，boss-chat 用 GM 写、本脚本用 GM 读，读到的永远是自己那份空存储，被 try/catch 静默吞掉，导致 v0.5.1 的核心修复「对方消息改读 boss-chat 归档」完全无效、风险体检一直在扫空数据。现在改走 localStorage 镜像 bc_chats_mirror（boss-chat v1.5.8 同步写入），并在镜像不可用时明确提示，不再静默扫空数据。修「会把你自己发的话当成对方原话、进而误拉黑+误删聊天记录」——因为上一条，对方原话永远读不到，脚本退而用列表里那句「最后一条」兜底，而那句经常是你自己发的（脚本注释自己都写了这一点），于是你发过的「押金/培训费/加微信」会命中默认拉黑词，点一下就把正常 HR 拉黑并删光聊天记录（不可逆）。现在兜底文本只驱动本地隐藏，不产生拉黑依据。修「写操作零节流」——actBudgetOk()/actCoolingDown() 定义完整但全脚本零调用，每日计数照加、永不受检；现在接回 actPrecheck，并补上官方 wapi 必带的 X-Requested-With: XMLHttpRequest 与 traceid 两个请求头，另按官方错误码表给滑块验证/掉登录/CSRF 分级提示。修「按风险标记隐藏后手动恢复会被反复藏回去」——现在只藏本轮新标记的会话。v0.5.7（审核修复）：修「手动恢复的会话几秒后又被藏回去」——只藏「本轮新标记」还不够，rescanRisk 每 8 秒重算一次 riskHits，被你恢复的会话会重新变成「新标记」；现在把本页手动恢复过的会话记进 UNMARK_RISK，并给「恢复全部隐藏」加 12 秒静默窗。修「体检计数多标签页互相覆盖」——saveSettings 写盘前先读盘对 hitDays 做并集。修「处置流水只进内存、刷新就没了」——新增 bi_actlog 键落盘最近 100 条（这是唯一能事后核对「我拉黑过谁」的地方）。修「批量连续失败即停」名不副实——原来数的是累计失败，现在真的数连续（成功即清零）。修「三个批量跳过已处理的口径不一致」——batchDeleteMarked 补上「已本地隐藏的不再拉进站内写操作」。修「探针消息通道不校验来源」——任意第三方 iframe 都能 postMessage 塞伪造会话（而会话正文会驱动隐藏/拉黑判定），现在只认本窗口、同源。修「拖动面板后误触开关」——原来只对悬浮球吞掉拖动后那次 click，面板把手不吞；且触屏上 pointerup 后可能根本没有 click，那个 once 监听器会一直挂着吞掉你下一次真实点击，现在 1 秒后自动摘掉。另外诚实化：岗位打分与 AI 判定早已删除，本脚本不再往 bw_insight_out 写 risk/ai，相关文案与启动清理一并修正（监控面板上的「风险 xx」「🤖 AI 建议」两处也已在 watcher 侧删掉）。v0.5.8：把脚本开头那段说明改成与现状一致 —— v0.4.0 删掉 AI 判定、v0.5.0 删掉岗位风险打分，但开头「读监控镜像给岗位打分 / 调 AI 接口给建议」这句话一直留着，容易让人以为本脚本还在往 bw_insight_out 写结果。实际它现在只做聊天会话体检与处置。只改文字说明，行为不变。v0.5.9：新增 GM 兼容适配层 —— 脚本不再只认篡改猴：篡改猴 / 暴力猴 / 脚本猫任选其一即可，甚至在完全没有脚本管理器时（把脚本直接注入页面）也能跑；缺的能力自动补齐（存储退化为 localStorage、同源请求改走 fetch、菜单退化为页面内 ⚙、样式退化为 style 标签；跨域 AI 功能仍需管理器）。装了管理器的用户行为与上一版完全一致 —— 适配层只补齐、不覆盖。新增「🔍 环境自检（兼容层）」菜单项，一眼看清当前跑在什么环境、哪些能力可用。v0.5.10：修「同一个页面出现两个 🩺 悬浮球」—— 防重原来是「内存变量 + document.body.contains()」，同页跑两份脚本、或页面重建/搬动过 body 时会再挂一个；现在改成 DOM 级幂等：先找 #biRoot，有就复用。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/%E5%8A%A0%E5%87%8F%E4%B9%98%E9%99%A4boss
// @supportURL   https://github.com/weishiji668/%E5%8A%A0%E5%87%8F%E4%B9%98%E9%99%A4boss/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/%E5%8A%A0%E5%87%8F%E4%B9%98%E9%99%A4boss/main/boss-insight.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/%E5%8A%A0%E5%87%8F%E4%B9%98%E9%99%A4boss/main/boss-insight.user.js
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// @connect      open.bigmodel.cn
// @connect      api.moonshot.cn
// @connect      api.siliconflow.cn
// @connect      api.openai.com
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function(){
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

// ===== v0.4.0 变更说明（2026-09-21，用户反馈「按消息页的口径重做」）=====
// R1 **删掉 AI 判定**（用户：这个功能没用）——连同 7 家服务商预设、Key/接口设置、每日额度、AI 建议列表一并删除。
// R2 卡片按消息页口径重做：**会话总数 / 处理总数 / 待处理 / 风险规则**（原来那排「监控项/已打分/AI判定」不再占位）。
// R3 新增「待处理」区：命中规则、但还没处置的会话单独列出来（处置完自动从这一区消失）。
// R4 **聊天列表不做存储**：每次打开页面重新识别当前所有会话（用户：新卡片只会因为有人发消息才出现，不需要存）。
// R5 **去掉每日上限与同会话冷却**（用户：消息页没有风控，不需要设置限制）；只保留二次确认与失败如实提示。
// R6 「对方消息」按**头像**识别：详情页里对方的消息左侧有头像、我的没有——规则只看对方发的那些（列表里那句
//    「最后一条」经常是我自己发的，拿它判会判错）。
// ===== 说明（v0.1.0）=====
// ===== v0.3.0 新增：聊天体检 + 一键处置（2026-09-21，用户需求「要大修的是体检脚本」）=====
// 用户原话：「体检应该链接到聊天里面——光看 JD 没法做详细体检，一般是看 HR 发送的内容。
//            这种情况可以当成『体检式的隐藏』：可以隐藏会话、直接删除、点不感兴趣，经常骚扰的点黑名单。」
// C1 两套规则集（面板里可编辑、一行一条）：**隐藏词 → 本地隐藏**（零请求、可恢复）、
//    **拉黑词 → 一键拉黑**（可选连带删记录）。规则只看**对方发来的消息**，不发请求、不显示徽标。
// C2 会话列表（面板内）每行四个一键按钮：隐藏 / 不感兴趣 / 拉黑 / 删；另有批量：
//    按「隐藏词」规则隐藏、按「拉黑词」规则拉黑、**删除已标记的聊天**（让导出小一圈）。
// C3 本地隐藏会**真的把会话从页面列表里藏起来**（DOM 层，可随时恢复），纯本地、零请求。
// C4 写操作只在点击时发生：二次确认 + 同会话冷却 10 秒 + 每日上限（默认 30，可调）；失败如实提示、记流水。
// 聊天数据从哪来：本脚本自己读**聊天页的 Vue 组件状态**（页面世界探针，只读），不依赖聊天脚本、不改它。
// 站内动作的真实接口（从站点自己的前端 bundle 核对）：
//    不感兴趣 POST /wapi/zprelation/userMark/unsuitable   {securityId, pageType:2, markReason, markReasonText}
//    拉  黑   POST /wapi/zprelation/userBlack/add         {securityId, needRemoveFriend:0|1}   ← 1=顺手删记录
//    删会话   POST /wapi/zprelation/friend/delete.json    {securityId}
// ===== v0.2.1 变更说明（2026-09-21，评审修复）=====
// V1 风险打分改为真正的大小写不敏感（原来 toLowerCase 结果被丢弃）。
// V2 AI 判定失败不再落库：校验 HTTP 状态与非空返回，失败/空返回不写 out.ai、不扣额度，5 分钟内不重试同一条。
// V3 AI 请求把当前 JD 一并带上（旧 JD 只带「JD 变更」前 60 字摘要）；out.ai 设 300 条上限。
// V4 面板快照/还原补上 checkbox（#biAiOn），8 秒重绘不再把勾选弹回。
// V5 「恢复默认规则」重绘后正确写回默认文本（原来被 biRestore 还原成旧文本）。
// V6 镜像写过一次后，清掉已不在监控清单里的岗位残留分，避免「已打分」虚高 + 幽灵岗位。
// ===== v0.2.0 变更说明（2026-09-20，用户反馈「岗位风险的脚本没 UI 吗，也不响应」）=====
// U1 补页面 UI：右下角 🩺 悬浮球（在 💼 监控 / 💬 聊天 之上，不打架）→ 面板；
//    四张卡（监控项 / 已打分 / AI 判定 / 风险规则）+ 折叠区（风险规则 / AI 判定 / 体检结果 / 边界说明）。
// U2 菜单命令改成打开面板并定位到对应折叠区（原来是 prompt/alert，点完像没反应）；
//    保留「开/关 AI 判定」的二次确认与「状态」的兜底 alert（面板建不起来时才用）。
// U3 面板每次重绘前快照、重绘后还原（折叠状态 / 输入框 / 滚动 / 焦点）—— 8 秒一轮的体检不会打断你正在填的东西。
// U4 面板里可直接改规则（一行一条「名称|分值|分类|关键词」）、配 AI（服务商/地址/模型/Key 不回显）、
//    「立即体检」手动触发一次、结果列表按分数排序显示命中规则与 AI 建议。
// 这个脚本是「岗位监控」的配套分析件：监控脚本负责收录 / 盯住 / 对比 / 记流水，
// 本脚本只做两件重活（所以单独拆出来，监控脚本就能保持精简）：
//   ① 风险规则打分：JD / 薪资 / 公司名命中规则词 → 记风险分与命中项；
//   ② AI 判定（可选、默认关）：出现「需留意 / 重要」变化时调一次大模型，给一句跟进建议。
// 数据怎么来往（都走本机 localStorage 镜像，不联网）：
//   监控脚本 → localStorage['bw_insight_in']  { jobs, changes, at }
//   本脚本   → localStorage['bw_insight_out'] { at }
//   v0.5.7：**这个键现在是空的占位**。岗位打分在 v0.5.0 删了、AI 判定在 v0.4.0 删了（用户口径：没用），
//   所以「岗位体检」这四个字只对聊天会话有效。留着这个键是为了让监控面板的读取不报错，
//   不是为了回写 —— 监控面板上「风险 xx」「🤖 AI 建议」两处不会再显示任何内容（也已在 watcher 侧删掉）。
//   监控面板直接读 out 里的结果展示（风险角标 / 🤖 建议）。

const VERSION='0.5.10';
const K_SET='bi_settings';
const K_CHAT='bi_chat', K_HIDDEN='bi_hidden', K_ACT='bi_actions', K_RISKHID='bi_riskhidden';
const K_ACT_LOG='bi_actlog';   // v0.5.7：处置流水落盘（刷新后还能核对「我拉黑过谁」）   // v0.5.4：本功能藏过的会话名单   // v0.3.0：聊天会话镜像 / 本地隐藏 / 处置流水
const IN_KEY='bw_insight_in';
const OUT_KEY='bw_insight_out';

// v0.3.0：聊天处置的两套规则集（种子词；一行一条，面板里可改）
const DEFAULT_CHAT_RULES={
  hide:['代招','劳务','派遣','中介','外包','兼职','地推','电销','电话销售','外呼','催收','房产','保险','贷款','信用卡','微商','加盟','客服外包'],
  block:['押金','保证金','培训费','培训贷','先交钱','付费培训','自费','贷款培训','境外','出国','缅北','柬埔寨','菲律宾','迪拜','包吃住','垫付','加微信','加我微信','微信转账','刷流水','博彩','彩票','赌博','色情','陪聊','裸聊','刷单']
};

// ===== 风险规则（默认 8 条；可在菜单里改）=====
const DEFAULT_RULES=[
  {id:'r1', name:'培训贷/先交费', cat:'钱', weight:30, enabled:true, keywords:['培训费','培训贷','押金','保证金','先交','交钱','付费培训','自费','贷款培训']},
  {id:'r2', name:'境外高薪/缅北', cat:'安全', weight:40, enabled:true, keywords:['缅甸','缅北','柬埔寨','老挝','迪拜','包机票','出国','境外']},
  {id:'r3', name:'引导加微信/私下联系', cat:'流程', weight:10, enabled:true, keywords:['加微信','加我微信','微信详聊','私下','加V','加v']},
  {id:'r4', name:'刷单/返利/垫付', cat:'钱', weight:40, enabled:true, keywords:['刷单','返利','垫付','日结','日入','兼职群']},
  {id:'r5', name:'外包/劳务派遣', cat:'用工', weight:20, enabled:true, keywords:['外包','劳务派遣','人力外包','驻场','外派']},
  {id:'r6', name:'无薪试岗/无偿加班', cat:'钱', weight:25, enabled:true, keywords:['无薪试岗','试岗无薪','无偿加班','自愿加班']},
  {id:'r7', name:'画大饼/模糊承诺', cat:'话术', weight:10, enabled:true, keywords:['不封顶','上不封顶','月入过万','轻松过万','多劳多得']},
  {id:'r8', name:'押证件/体检指定', cat:'流程', weight:20, enabled:true, keywords:['押身份证','扣押证件','指定医院体检','体检费']}
];

// v0.5.0：风险关键词默认表 = 旧 8 条规则的关键词摊平去重（不再打分）
const DEFAULT_RISK_WORDS=(()=>{ const out=[], seen=new Set(); (DEFAULT_RULES||[]).forEach(r=>(r.keywords||[]).forEach(k=>{ const w=String(k||'').trim(); if(w&&w.length>=2&&!seen.has(w)){ seen.add(w); out.push(w); } })); return out; })();
function gget(k,d){ try{ const v=GM_getValue(k); return v===undefined?d:v; }catch(e){ return d; } }
function gset(k,v){ try{ GM_setValue(k,v); }catch(e){} }
function now(){ return Date.now(); }
function localDateStr(){ const d=new Date(),p=x=>String(x).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function log(msg){ try{ console.log('[boss-insight]',msg); }catch(e){} }
function loadSettings(){
  const s=gget(K_SET,{})||{};
  s.rules=Array.isArray(s.rules)&&s.rules.length?s.rules:JSON.parse(JSON.stringify(DEFAULT_RULES));
  // v0.5.0：风险词（老设置没有就把旧规则关键词摊平迁移过来）+ 体检计数 + 隐藏标记开关
  if(!Array.isArray(s.riskWords)){ const flat=[], seen=new Set(); (Array.isArray(s.rules)?s.rules:DEFAULT_RULES).forEach(r=>(r.keywords||[]).forEach(k=>{ const w=String(k||'').trim(); if(w&&w.length>=2&&!seen.has(w)){ seen.add(w); flat.push(w); } })); s.riskWords=flat.length?flat:DEFAULT_RISK_WORDS.slice(); }
  s.scanStat=s.scanStat&&typeof s.scanStat==='object'?s.scanStat:{date:'',today:0,total:0};
  s.hitDays=s.hitDays&&typeof s.hitDays==='object'?s.hitDays:{};   // v0.5.2：{ '日期': { sid: 命中词数 } }
  if(typeof s.hideRiskMarked!=='boolean') s.hideRiskMarked=false;
  // v0.5.1：老「隐藏词」自定义表并进风险词（二者同源）
  if(s.rulesChat&&Array.isArray(s.rulesChat.hide)&&JSON.stringify(s.rulesChat.hide)!==JSON.stringify(DEFAULT_CHAT_RULES.hide)){ const seen=new Set((s.riskWords||[]).map(w=>String(w).toLowerCase())); (s.rulesChat.hide||[]).forEach(w=>{ const t=String(w||'').trim(); if(t&&t.length>=2&&!seen.has(t.toLowerCase())){ seen.add(t.toLowerCase()); s.riskWords.push(t); } }); }
  // v0.3.0：聊天体检的两套规则集 + 处置护栏
  s.rulesChat=s.rulesChat&&typeof s.rulesChat==='object'?s.rulesChat:JSON.parse(JSON.stringify(DEFAULT_CHAT_RULES));
  if(!Array.isArray(s.rulesChat.hide)) s.rulesChat.hide=JSON.parse(JSON.stringify(DEFAULT_CHAT_RULES.hide));
  if(!Array.isArray(s.rulesChat.block)) s.rulesChat.block=JSON.parse(JSON.stringify(DEFAULT_CHAT_RULES.block));
  s.act=s.act||{maxPerDay:30, cooldownMs:10000, usedDate:'', usedToday:0, scanCount:20};
  return s;
}
let S=loadSettings();
// v0.5.7：一次性清掉旧版残留的岗位打分与 AI 结果（这两个功能都已删除，留着只会让监控面板
// 显示早就没人维护的旧分数）。此后本脚本不再往 bw_insight_out 写任何内容。
try{ const o0=readOut(); if((o0&&o0.risk&&Object.keys(o0.risk).length)||(o0&&o0.ai&&Object.keys(o0.ai).length)){ o0.risk={}; o0.ai={}; writeOut(o0); } }catch(e){}
// v0.5.7：多标签页同时开着时，各自内存里的 S 会互相覆盖 —— 尤其 hitDays（体检计数）
// 和 rulesChat（词表）。写盘前先读盘做并集，把对方改的合进来。
function mergeSettingsFromDisk(){
  try{
    const disk=gget(K_SET,null);
    if(!disk||typeof disk!=='object') return;
    const days={};
    Object.keys(S.hitDays||{}).forEach(d=>{ days[d]=Object.assign({},S.hitDays[d]); });
    Object.keys(disk.hitDays||{}).forEach(d=>{
      const e=days[d]||(days[d]={});
      Object.keys(disk.hitDays[d]||{}).forEach(sid=>{ e[sid]=Math.max(e[sid]|0, disk.hitDays[d][sid]|0); });
    });
    S.hitDays=days;
  }catch(e){}
}
function saveSettings(){ try{ mergeSettingsFromDisk(); }catch(e){} gset(K_SET,S); }
// v0.3.0：聊天会话镜像 / 本地隐藏名单 / 处置流水（各自一个键，不动老键）
let CHAT={sessions:{}};   // v0.4.0：只在内存里，每次打开页面重新识别（用户：消息页不需要做存储）
// v0.5.6：boss-chat 的消息归档。**必须走 localStorage** —— 油猴的 GM_getValue/GM_setValue 存储
// 是按脚本（@name+@namespace）隔离的，本脚本读不到 boss-chat 用 GM_setValue 写的键，永远返回 {}，
// 且被 catch 静默吞掉 → v0.5.1「改读 chat 归档」的核心修复完全没生效，风险体检一直在扫空数据。
// 本套脚本的其它跨脚本通道（bw_insight_in/out、bw_company_jobs、bw_chats_export）本来就全走
// localStorage，只有这一处漏了。字段名与取值口径（dir:'me'|'them'）本来就对得上，只换通道。
const K_CHAT_ARCHIVE='bc_chats';
const K_CHAT_MIRROR='bc_chats_mirror';      // boss-chat 写出的 localStorage 镜像（会话+消息全文）
const K_CHAT_MIRROR_META='bc_chats_mirror_at';   // 镜像写入时间，用于旧版 boss-chat 的探测
let arcCache={t:0,data:null};
function readChatArchive(){
  if(arcCache.data&&now()-arcCache.t<2000) return arcCache.data;
  let o={};
  // ① 优先读 boss-chat 写的 localStorage 镜像（能读到会话正文全文）
  try{ o=JSON.parse(localStorage.getItem(K_CHAT_MIRROR)||'{}')||{}; }catch(e){ o={}; }
  // ② 兼容：镜像还没上线时，回退读 GM 键（同版本号下读不到，但保留以便将来兼容）
  if(!o||!Object.keys(o).length){ try{ o=gget(K_CHAT_ARCHIVE,{})||{}; }catch(e){ o={}; } }
  arcCache={t:now(),data:o};
  return o;
}
// v0.5.6：镜像通道是否真的在工作 —— 用来给用户一个诚实的提示，而不是静默扫空数据
function chatMirrorHealthy(){
  try{ return !!localStorage.getItem(K_CHAT_MIRROR_META); }catch(e){ return false; }
}
function themTextsOf(arc){
  const ms=Array.isArray(arc&&arc.messages)?arc.messages:[];
  return ms.filter(m=>m&&m.dir==='them'&&m.text).map(m=>String(m.text));
}
function lastTsOf(arc){
  const ms=Array.isArray(arc&&arc.messages)?arc.messages:[];
  let t=0;
  ms.forEach(m=>{ const x=Number(m&&m.ts)||0; if(x>t) t=x; });
  return t;
}
function mergeChatArchive(arc){
  const data=arc||readChatArchive();
  let n=0;
  Object.keys(data||{}).forEach(sid=>{
    const a=data[sid];
    if(!a||!Array.isArray(a.messages)) return;
    const them=themTextsOf(a);
    const cur=CHAT.sessions[sid]||{};
    const meta=(a.meta||{});
    CHAT.sessions[sid]=Object.assign(cur,(MARKS[sid]||{}),{
      company:cur.company||meta.company||meta.brandName||'',
      boss:cur.boss||meta.boss||'',
      jobName:cur.jobName||meta.jobName||'',
      securityId:cur.securityId||'',
      lastText:cur.lastText||(them.length?them[them.length-1]:String(meta.lastText||'')),
      lastTs:cur.lastTs||lastTsOf(a)||0,
      at:cur.at||now()
    });
    if(!(cur.themTexts&&cur.themTexts.length)&&them.length){ CHAT.sessions[sid].themTexts=them.slice(-20); n++; }
  });
  if(n){ scanChat(); rescanRisk(); }
  return n;
}
if(!CHAT.sessions) CHAT.sessions={};
let HIDDEN=gget(K_HIDDEN,{})||{};
let PREV_RISK={};   // v0.5.6：上一轮已被「风险标记」藏起来的会话，用来只藏新增的
let UNMARK_RISK={}; // v0.5.7：你手动点过「恢复」的会话（本轮页面内有效）—— 别再被风险规则自动藏回去
let biMuteHideUntil=0;   // v0.5.7：「恢复全部隐藏」后的静默窗，见 tick()
let ACTS=(()=>{ try{ const d=gget(K_ACT_LOG,null); if(Array.isArray(d)&&d.length) return d; }catch(e){} return Array.isArray(gget(K_ACT,[]))?gget(K_ACT,[]):[]; })();   // v0.5.7：优先读落盘的那份
let MARKS=gget(K_CHAT,{})||{};
function saveChat(){ /* v0.4.0：会话列表不落盘；处置状态另存 K_CHAT */ }
function saveMark(sid){ if(!sid) return; const s=(CHAT.sessions||{})[sid]||{}; const cur=gget(K_CHAT,{})||{}; cur[sid]={markedAt:s.markedAt||0,markedKind:s.markedKind||'',deletedAt:s.deletedAt||0}; MARKS=cur; gset(K_CHAT,MARKS); }
function saveHidden(){ gset(K_HIDDEN,HIDDEN); }
function mergeHidden(mut){ const cur=gget(K_HIDDEN,{})||{}; try{ mut(cur); }catch(e){} HIDDEN=cur; gset(K_HIDDEN,HIDDEN); }
function saveActs(){ gset(K_ACT,ACTS); }
function readIn(){
  try{ return JSON.parse(localStorage.getItem(IN_KEY)||'{}')||{}; }catch(e){ return {}; }
}
function readOut(){
  try{ return JSON.parse(localStorage.getItem(OUT_KEY)||'{}')||{}; }catch(e){ return {}; }
}
function writeOut(o){
  try{
    o.at=now();
    localStorage.setItem(OUT_KEY,JSON.stringify(o));
    // 结果也通知同页的监控脚本立刻刷新（storage 事件跨标签页，同页用自定义事件）
    try{ window.dispatchEvent(new CustomEvent('bw-insight-updated')); }catch(e){}
  }catch(e){}
}
// ===== 风险关键词（v0.5.0：不打分；体检按钮拿这些词扫聊天会话）=====
function rescanRisk(){
  const words=S.riskWords||[];
  let n=0;
  Object.keys(CHAT.sessions||{}).forEach(sid=>{
    const s=CHAT.sessions[sid];
    const r=scanOneSession(s);
    const hits=matchWords(r.text,words);
    const prev=(s.riskHits||[]).join(',');
    s.riskHits=hits;
    if(hits.length&&prev!==hits.join(',')) n++;
  });
  // v0.5.2：体检计数=关键词命中数，按天切（今日=当天命中词数，总=各天累计）
  // v0.5.6：改成「合并」而不是整体覆盖。CHAT 只在内存里，离开聊天页后 sessions 变空，
  // 原来 hd[今天]=空对象 会把当天计数抹成 0（切页即归零），跨日累计也一并丢。
  const day=localDateStr();
  const hd=S.hitDays||(S.hitDays={});
  if(Object.keys(CHAT.sessions||{}).length){          // 只在真的有会话时才写，空镜像不覆盖
    const entry=hd[day]||{};
    Object.keys(CHAT.sessions||{}).forEach(sid=>{
      const w=((CHAT.sessions[sid]||{}).riskHits||[]).length;
      if(w) entry[sid]=Math.max(entry[sid]|0,w); else delete entry[sid];
    });
    hd[day]=entry;
  }
  const days=Object.keys(hd).sort();
  if(days.length>60) days.slice(0,days.length-60).forEach(k=>{ delete hd[k]; });
  saveSettings();
  CHAT.at=now();
  if(S.hideRiskMarked) syncRiskHidden();   // v0.5.4：开着一键隐藏时，新标记的会话同步藏到页面
  return n;
}
function scanRisk(){
  return rescanRisk();   // v0.5.2：计数不再记按钮次数，记命中关键词数（见 rescanRisk）
}
// ===== v0.3.0：聊天体检 + 一键处置 =====
// ---- 1) 页面世界探针：只读聊天页的 Vue 组件状态，拿会话列表（含 securityId）。不依赖聊天脚本。----
const BI_PROBE_ID='biChatProbe';
function biProbeSource(){
  return '(function(){if(window.__biChatProbeReady)return;window.__biChatProbeReady=1;'+
  'function pick(o,ks){for(var i=0;i<ks.length;i++){var v=o&&o[ks[i]];if(v!==undefined&&v!==null&&v!=="")return v;}return "";}'+
  'function looks(a){return a&&a.length&&a[0]&&typeof a[0]==="object"&&(a[0].securityId||a[0].secId)&&(a[0].encryptBossId||a[0].bossId||a[0].name||a[0].bossName||a[0].companyName);}'+
  // 不猜字段名：把组件（含 $data / 子组件）里所有「像会话列表」的数组都捞出来，取最长的那条
  'function scan(root,depth,acc){if(!root||depth>4)return acc;try{var n=0;'+
  'for(var k in root){if(n++>80)break;if(k.charAt(0)==="$"||k.charAt(0)==="_")continue;var v=root[k];'+
  'if(Array.isArray(v)&&looks(v)){acc.push(v);continue;}'+
  'if(v&&typeof v==="object"&&depth<3)scan(v,depth+1,acc);}'+
  'if(root.$data&&depth<3)scan(root.$data,depth+1,acc);'+
  'var ch=root.$children;if(ch&&ch.length){for(var j=0;j<ch.length&&j<40;j++)scan(ch[j],depth+1,acc);}}catch(e){}return acc;}'+
  'function collect(){try{var acc=[],els=document.querySelectorAll("div");'+
  'for(var i=0;i<els.length&&i<6000;i++){var v=els[i].__vue__;if(v)scan(v,0,acc);}'+
  'if(!acc.length){var r=(document.querySelector("#app")||document.body||{}).__vue__;if(r)scan(r,0,acc);}'+
  'var best=null;for(var k=0;k<acc.length;k++){if(!best||acc[k].length>best.length)best=acc[k];}if(!best)return [];'+
  'var out=[];for(var m=0;m<best.length&&m<300;m++){var it=best[m]||{};out.push({'+
  'sid:String(pick(it,["encryptBossId","bossId","friendId","encryptFriendId","sessionId","uid"])||""),'+
  'company:String(pick(it,["companyName","brandName","company"])||""),'+
  'boss:String(pick(it,["name","bossName","bossTitle"])||""),'+
  'jobName:String(pick(it,["jobName","title","positionName"])||""),'+
  'securityId:String(pick(it,["securityId","secId"])||""),'+
  'lastText:String(pick(it,["lastMsg","lastMessage","lastMessageText","content","text","msgText"])||""),'+
  'lastTs:Number(pick(it,["lastMsgTime","lastMessageTime","lastTime","updateTime"])||0)});}return out;}catch(e){return [];}}'+
  'window.addEventListener("message",function(ev){try{var d=ev.data||{};if(!d.__biChatAsk)return;window.postMessage({__biChatData:collect()},"*");}catch(e){}},false);'+
  '})();';
}
function ensureProbe(){
  try{
    if(document.getElementById(BI_PROBE_ID)) return true;
    const s=document.createElement('script'); s.id=BI_PROBE_ID; s.textContent=biProbeSource();
    (document.head||document.documentElement).appendChild(s); return true;
  }catch(e){ return false; }
}
function askChatProbe(){ try{ ensureProbe(); window.postMessage({__biChatAsk:1},'*'); }catch(e){} try{ mergeChatArchive(); }catch(e){} }
function onChatProbeData(ev){
  try{
    // v0.5.7：校验消息来源。原来不看到底是谁发的 —— 页面里任意第三方 iframe 只要
    // postMessage({__biChatData:[...]}) 就能往 CHAT.sessions 里塞伪造会话（内容是对方可控的，
    // 而会话正文会驱动「隐藏/拉黑」判定）。只认本窗口（探针就在本页注入，同源同窗口）发来的。
    try{ if(ev.source&&ev.source!==window) return; }catch(e){}
    try{ if(ev.origin&&ev.origin!=='null'&&ev.origin!==location.origin) return; }catch(e){}
    const d=ev.data||{}; if(!d.__biChatData||!Array.isArray(d.__biChatData)) return;
    let n=0;
    d.__biChatData.forEach(it=>{
      if(!it||!it.sid) return;
      const cur=CHAT.sessions[it.sid]||{};
      CHAT.sessions[it.sid]=Object.assign(cur,(MARKS[it.sid]||{}),{
        company:it.company||cur.company||'', boss:it.boss||cur.boss||'', jobName:it.jobName||cur.jobName||'',
        securityId:it.securityId||cur.securityId||'', lastText:it.lastText||cur.lastText||'',
        lastTs:it.lastTs||cur.lastTs||0, at:now()
      });
      n++;
    });
    CHAT.at=now();
    if(n){ scanChat(); saveChat(); }
    try{ applyPageHide(); }catch(e){}
  }catch(e){}
}
// ---- 2) 规则：两套关键词表（只匹配对方发来的消息文本；纯本地、不发请求）----
function chatRuleWords(kind){
  if(kind==='hide') return (S.riskWords||[]).map(w=>String(w==null?'':w).trim()).filter(w=>w.length>=2);   // v0.5.1：隐藏词与风险词同一份词表
  const r=(S.rulesChat||{})[kind];
  return Array.isArray(r)?r.map(w=>String(w==null?'':w).trim()).filter(w=>w.length>=2):[];
}
function chatRuleText(kind){ return chatRuleWords(kind).join('\n'); }
function cleanRuleLines(text){
  const out=[], seen=new Set();
  String(text||'').split(/\r?\n/).forEach(line=>{
    const w=line.trim(); if(w.length<2) return;
    const k=w.toLowerCase(); if(seen.has(k)) return; seen.add(k); out.push(w);
  });
  return out;
}
function matchWords(text,words){
  const t=String(text||'').toLowerCase();
  if(!t) return [];
  return (words||[]).filter(w=>t.indexOf(String(w).toLowerCase())>=0);
}
function chatSessionList(){
  return Object.keys(CHAT.sessions||{}).map(sid=>Object.assign({sid},CHAT.sessions[sid]||{}));
}
function scanOneSession(sess){
  // v0.3.1：优先用「当前打开会话里对方发的消息」（详情页按头像识别），列表里那句只当兜底
  // v0.5.6：**兜底文本不得驱动拉黑/删除**。列表里那句「最后一条」经常是用户自己发的（R6 已注明），
  // 而拉黑是不可逆的（userBlack/add 带 needRemoveFriend=1 会连聊天记录一起删）。原来兜底文本照样
  // 喂给 block 词表 → 用户自己发过「请问要交押金吗」这种话，就会把这个正常 HR 拉黑并删记录。
  // 现在：兜底只允许驱动本地隐藏（可恢复），拉黑依据必须来自对方原话。
  const fromThem=!!(sess&&Array.isArray(sess.themTexts)&&sess.themTexts.length);
  const text=fromThem?sess.themTexts.join(' \n '):String((sess&&sess.lastText)||'');
  const hide=matchWords(text,chatRuleWords('hide'));
  const block=fromThem?matchWords(text,chatRuleWords('block')):[];
  return {hide,block,hitHide:hide.length>0,hitBlock:block.length>0,text,fromThem};
}
function scanChat(){
  let hitHide=0,hitBlock=0;
  Object.keys(CHAT.sessions||{}).forEach(sid=>{
    const s=CHAT.sessions[sid]; const r=scanOneSession(s);
    s.hitHide=r.hitHide?r.hide:[]; s.hitBlock=r.hitBlock?r.block:[]; s.fromThem=!!r.fromThem;   // v0.5.6：落一个「判据是否来自对方原话」的标记
    if(r.hitHide) hitHide++; if(r.hitBlock) hitBlock++;
  });
  CHAT.hitHide=hitHide; CHAT.hitBlock=hitBlock; CHAT.at=now();
  return {hitHide,hitBlock};
}
function chatCounts(){
  const list=chatSessionList();
  const handled=list.filter(s=>isHiddenChat(s.sid)||s.markedAt||s.deletedAt).length;
  const pending=list.filter(s=>!isHiddenChat(s.sid)&&!s.markedAt&&!s.deletedAt&&((s.hitHide&&s.hitHide.length)||(s.hitBlock&&s.hitBlock.length)||(s.riskHits&&s.riskHits.length))).length;
  const td=new Date();
  return {sessions:list.length, hidden:Object.keys(HIDDEN||{}).length, handled, pending,
    rules:chatRuleWords('hide').length+chatRuleWords('block').length,
    sessionsToday:list.filter(s=>{ const t=s.lastTs||0; if(!t) return false; const d=new Date(t); return d.getFullYear()===td.getFullYear()&&d.getMonth()===td.getMonth()&&d.getDate()===td.getDate(); }).length,
    riskMarked:list.filter(s=>s.riskHits&&s.riskHits.length).length,
    scanToday:(()=>{ const e=(S.hitDays||{})[localDateStr()]||{}; return Object.keys(e).reduce((a,k)=>a+(e[k]|0),0); })(),
    scanTotal:(()=>{ let t=0; const hd=S.hitDays||{}; Object.keys(hd).forEach(d=>{ const e=hd[d]||{}; Object.keys(e).forEach(k=>{ t+=e[k]|0; }); }); return t; })(),
    hitHide:list.filter(s=>s.hitHide&&s.hitHide.length).length,
    hitBlock:list.filter(s=>s.hitBlock&&s.hitBlock.length).length,
    withSec:list.filter(s=>s.securityId).length,
    withThem:list.filter(s=>s.themTexts&&s.themTexts.length).length};
}
function isHiddenChat(sid){ return !!(HIDDEN&&HIDDEN[sid]); }
// v0.3.1：读「当前打开的那个会话」的消息——判据用**头像**：对方的消息左侧有头像，我的没有。
// 为什么不看列表里那句「最后一条」：那句话经常是**我自己发的**（比如招呼语），拿它判规则会判错。
function biIsAvatarImg(im){
  try{
    const s=String(im.getAttribute('src')||''), cls=String(im.className||'');
    const w=im.width||im.naturalWidth||0, h=im.height||im.naturalHeight||0;
    if(!(w>=18&&w<=64&&h>=18&&h<=64)) return false;
    return /bosszhipin|avatar|head|user/i.test(s)||/avatar|head|user/i.test(cls);
  }catch(e){ return false; }
}
function biPickMessageArea(){
  let best=null,bestScore=0;
  try{
    const all=document.querySelectorAll('div,ul,section');
    for(let i=0;i<all.length&&i<4000;i++){
      const el=all[i];
      try{
        if(el.closest('#biRoot')) continue;
        if(el.scrollHeight<=el.clientHeight+80) continue;          // 消息区是可滚动的
        let av=0;
        el.querySelectorAll('img').forEach(im=>{ if(biIsAvatarImg(im)) av++; });
        if(av<2) continue;
        const txt=String(el.innerText||'');
        const score=av*10+Math.min(txt.length/200,20);
        if(score>bestScore){ bestScore=score; best=el; }
      }catch(e){}
    }
  }catch(e){}
  return best;
}
let biArea=null, biAreaSig='';
function biGetArea(){ if(biArea&&biArea.isConnected) return biArea; biArea=biPickMessageArea(); biAreaSig=''; return biArea; }
function readOpenedChat(force){
  const area=biGetArea();
  if(!area) return null;
  const biLast=area.lastElementChild, biSig=area.childElementCount+'|'+(biLast?String(biLast.textContent||'').replace(/\s+/g,'').slice(0,40):'');
  if(!force&&biSig===biAreaSig) return null; biAreaSig=biSig;
  const them=[], seen=new Set();
  try{
    const biAb=area.getBoundingClientRect(), biMid=biAb.left+biAb.width/2;
    area.querySelectorAll('img').forEach(im=>{
      if(!biIsAvatarImg(im)) return;
      try{ const biIb=im.getBoundingClientRect(); if(biIb.width&&biIb.left>biMid) return; }catch(e){}   // 右半边＝我自己发的，别收进 themTexts
      let node=im.parentElement, hops=0;
      while(node&&hops<4&&String(node.innerText||'').trim().length<2){ node=node.parentElement; hops++; }
      if(!node) return;
      if(seen.has(node)) return; seen.add(node);
      const t=String(node.innerText||'').replace(/\s+/g,' ').trim();
      if(t&&t.length<=300&&!them.some(x=>x===t)) them.push(t);
    });
  }catch(e){}
  const header=String(((area.parentElement||area).innerText)||'').replace(/\s+/g,' ').slice(0,140);
  return {them, header};
}
function biMatchSessionByText(txt){
  const t=String(txt||'').replace(/\s/g,'');
  let hit=null, tie=false;
  Object.keys(CHAT.sessions||{}).forEach(sid=>{
    const s=CHAT.sessions[sid]||{};
    const keys=[s.company,s.boss].map(x=>String(x||'').replace(/\s/g,'')).filter(x=>x.length>=2);
    if(keys.some(k=>t.indexOf(k)>=0)){ if(hit&&hit!==sid) tie=true; else hit=sid; }
  });
  return tie?null:hit;   // 有歧义宁可不挂：themTexts 会驱动拉黑（站内写、不可逆）
}
function applyOpenedChat(force){
  const r=readOpenedChat(force);
  if(!r||!r.them.length) return 0;
  const sid=biMatchSessionByText(r.header);
  if(!sid) return 0;
  const s=CHAT.sessions[sid]; if(!s) return 0;
  s.themTexts=r.them.slice(-30);
  s.themAt=now();
  scanChat();
  return s.themTexts.length;
}
function sessionLabel(sid){ const s=(CHAT.sessions||{})[sid]||{}; return s.company||s.boss||s.jobName||String(sid); }
// ---- 3) 写操作：只在用户点击时执行，带确认 / 冷却 / 每日上限 ----
function bstToken(){ try{ const m=String(document.cookie||'').match(/(?:^|;\s*)bst=([^;]+)/); return m?decodeURIComponent(m[1]):''; }catch(e){ return ''; } }
function formEncode(o){ return Object.keys(o||{}).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(o[k]==null?'':o[k])).join('&'); }
function actBudgetOk(){
  const a=S.act||(S.act={});
  const today=localDateStr();
  if(a.usedDate!==today){ a.usedDate=today; a.usedToday=0; saveSettings(); }
  return (a.usedToday||0)<(a.maxPerDay||30);
}
function actSpend(){ S.act.usedToday=(S.act.usedToday||0)+1; saveSettings(); }
function actCoolingDown(sid){
  const s=(CHAT.sessions||{})[sid]||{};
  return now()-(s.lastActionAt||0)<((S.act&&S.act.cooldownMs)||10000);
}
function actLog(kind,sid,ok,msg){
  const cur=Array.isArray(gget(K_ACT,[]))?gget(K_ACT,[]):[];
  cur.unshift({ts:now(),kind,sid,label:sessionLabel(sid),ok:!!ok,msg:String(msg||'')});
  if(cur.length>100) cur.length=100;
  ACTS=cur; gset(K_ACT,ACTS);
  // v0.5.7：处置流水也要落盘一份 —— 原来只进内存，刷新页面后「我到底拉黑过谁」的痕迹全没了，
  // 而这条流水是唯一能事后核对站内写操作的地方。存最近 100 条，键独立，不影响设置。
  try{ gset(K_ACT_LOG,cur.slice(0,100)); }catch(e){}
}
function actPrecheck(sid){
  const s=(CHAT.sessions||{})[sid];
  if(!s){ alert('这个会话不在本机镜像里，先到聊天页点一下「刷新会话」'); return false; }
  if(!s.securityId){ alert('这个会话还没拿到 securityId。\n\n到聊天页点一下「刷新会话」再试（令牌是页面加载时才有的）。'); return false; }
  // v0.5.6：这两道闸原来定义完整却**全脚本零调用**（每日计数照加、永不受检），而 L46 的文案仍在
  // 承诺「二次确认 + 同会话冷却 10 秒 + 每日上限」。补回来 —— 连续点几十次拉黑是触发网关风控最快的方式。
  if(actCoolingDown(sid)){ alert('这个会话 '+Math.round(((S.act&&S.act.cooldownMs)||10000)/1000)+' 秒内刚处置过，稍等再试。'); return false; }
  if(!actBudgetOk()){ alert('今日站内处置已达上限（'+(S.act.maxPerDay||30)+' 次）。\n\n这是脚本自设的护栏，防连点触发风控；明天自动重置，可在设置里调大。'); return false; }
  if(s.deletedAt){ alert('这个会话已经删除过了（'+new Date(s.deletedAt).toLocaleString('zh-CN',{hour12:false})+'），不用再删。'); return false; }
  return true;
}
function postChatAction(path,params,sid,label,done){
  if(typeof GM_xmlhttpRequest!=='function'){ actLog(label,sid,false,'缺少 GM_xmlhttpRequest 权限'); biMsg=label+'失败：缺少 GM_xmlhttpRequest 权限'; renderPanel(); done&&done(false,'缺少权限'); return; }
  const bst=bstToken();
  if(!bst){ actLog(label,sid,false,'缺少 bst 令牌'); biMsg=label+'失败：登录令牌缺失，请刷新页面或重新登录'; renderPanel(); done&&done(false,'缺少令牌'); return; }
  GM_xmlhttpRequest({
    method:'POST', url:'https://www.zhipin.com'+path,
    // v0.5.6：补上官方每个 wapi 请求都必带的两个头。缺 X-Requested-With 是最经典的非浏览器流量特征。
    headers:{'Content-Type':'application/x-www-form-urlencoded','Zp_token':bst,'X-Requested-With':'XMLHttpRequest','traceid':traceId()},
    data:formEncode(params), timeout:15000,
    onload:r=>{
      let code=null,msg='';
      try{ const j=JSON.parse(r.responseText||'{}'); code=j.code; msg=j.message||''; }catch(e){}
      const ok=(code===0);
      if(ok){
        actSpend();
        const s=(CHAT.sessions||{})[sid]; if(s){ s.lastActionAt=now(); saveChat(); }
      }
      // v0.5.6：错误码分级 —— 原来风控/掉登录/CSRF 全被压平成一句「code=xx」，
      // 用户看到滑块验证失败却不知道要去过滑块，只会反复重试，进一步加重风控。
      const HINT=actCodeHint(code);
      actLog(label,sid,ok,ok?'成功':('失败 code='+code+' '+(msg||'')+(HINT?'｜'+HINT:'')));
      biMsg=label+(ok?'成功：'+sessionLabel(sid):('失败：'+(HINT||msg||('code='+code+' / HTTP '+r.status))));
      renderPanel(); done&&done(ok,msg||('code='+code));
    },
    onerror:()=>{ actLog(label,sid,false,'网络错误'); biMsg=label+'失败：网络错误'; renderPanel(); done&&done(false,'网络错误'); },
    ontimeout:()=>{ actLog(label,sid,false,'超时'); biMsg=label+'失败：请求超时'; renderPanel(); done&&done(false,'超时'); }
  });
}
// v0.5.6：官方 resCodeMap 的分级（chat/app bundle）：webGate→403/滑块、logout→掉登录、csrf→可重试
function traceId(){
  try{ return (Date.now().toString(36)+Math.random().toString(36).slice(2,10)).slice(0,24); }catch(e){ return ''; }
}
function actCodeHint(code){
  const c=Number(code);
  if([31,32,35,36,5002,5003,5004,5011,5013].indexOf(c)>=0) return '站点风控：请先到 BOSS 页面完成滑块/安全验证，再回来重试';
  if([7,1011].indexOf(c)>=0) return '登录已失效：请重新登录 zhipin.com';
  if([120,121,122].indexOf(c)>=0) return '令牌过期：到聊天页点「刷新会话」重新取 securityId 后再试';
  return '';
}
function markSession(sid,kind){
  const s=(CHAT.sessions||{})[sid]; if(!s) return;
  s.markedAt=now(); s.markedKind=kind; saveMark(sid);
}
// ---- 4) 本地隐藏：既从面板列表里藏，也把页面左侧那个会话行藏起来（纯本地、零请求）----
function actHide(sid){
  mergeHidden(c=>{ c[sid]=now(); });
  biMsg='已本地隐藏「'+sessionLabel(sid)+'」（不发任何请求，随时可恢复）';
  applyPageHide(); renderPanel();
}
function actUnhide(sid){
  // v0.5.6：恢复时必须同时把这个会话从「风险自动隐藏」名单里摘掉。
  // 原来只删 HIDDEN、不动 K_RISKHID，而 syncRiskHidden 的判据是「所有带 riskHits 且当前不在 HIDDEN 里的会话」
  // → 刚恢复的会话正好满足 → 下一轮 tick（≤8 秒）又把它塞回去。用户看到的是「提示已恢复，几秒后又没了」。
  dropRiskHidden(sid);
  UNMARK_RISK[sid]=1;   // v0.5.7：本页内不再被风险规则自动藏回（见 syncRiskHidden）
  mergeHidden(c=>{ delete c[sid]; });
  biMsg='已恢复显示「'+sessionLabel(sid)+'」';
  applyPageHide(); renderPanel();
}
function dropRiskHidden(sid){
  try{ const cur=gget(K_RISKHID,{})||{}; if(sid in cur){ delete cur[sid]; gset(K_RISKHID,cur); } }catch(e){}
}
// v0.5.4：一键隐藏标记卡片 = 真的藏聊天页（HIDDEN + applyPageHide），不再只是面板列表过滤
function syncRiskHidden(){
  try{
    const marked=Object.keys(CHAT.sessions||{}).filter(sid=>((CHAT.sessions[sid]||{}).riskHits||[]).length);
    // v0.5.7：把「你手动恢复过」的会话从标记里摘掉 —— 否则 rescanRisk 每 8 秒重算一次
    // riskHits，会话又会重新变成 marked、重新落进 PREV_RISK，于是你刚恢复的那条下一轮又被藏回去。
    const marked2=marked.filter(sid=>!UNMARK_RISK[sid]);
    if(!marked2.length) return;
    const added={};
    // v0.5.6：只藏「本轮新标记」的会话，不再全量重塞
    const fresh=marked2.filter(sid=>!PREV_RISK[sid]);
    PREV_RISK={}; marked2.forEach(sid=>{ PREV_RISK[sid]=1; });
    mergeHidden(c=>{ fresh.forEach(sid=>{ if(!c[sid]){ c[sid]=now(); added[sid]=1; } }); });
    const cur=gget(K_RISKHID,{})||{};
    let ch2=false;
    Object.keys(added).forEach(sid=>{ cur[sid]=1; ch2=true; });
    if(ch2) gset(K_RISKHID,cur);
    if(Object.keys(added).length) applyPageHide();
  }catch(e){}
}
function clearRiskHidden(){
  try{
    const cur=gget(K_RISKHID,{})||{};
    const ids=Object.keys(cur);
    if(ids.length) mergeHidden(c=>{ ids.forEach(sid=>{ delete c[sid]; }); });
    gset(K_RISKHID,{});
    // v0.5.7：关掉「一键隐藏标记卡片」时，本页已有的会话也别再被自动藏回去
    UNMARK_RISK={}; Object.keys(CHAT.sessions||{}).forEach(k=>{ UNMARK_RISK[k]=1; });
    applyPageHide();
  }catch(e){}
}
function applyPageHide(){
  let n=0;
  try{
    if(!/\/chat|\/message/i.test(location.pathname)) return 0;
    const wanted=Object.keys(HIDDEN||{}).map(sid=>Object.assign({sid},(CHAT.sessions||{})[sid]||{}))
      .map(s=>({sid:s.sid,key:String(s.company||s.boss||'').replace(/\s/g,'')})).filter(x=>x.key.length>=2);
    if(!wanted.length){
      // v0.5.4：隐藏名单为空也要走一遍恢复分支（否则之前被藏的会话行永远恢复不了）
      document.querySelectorAll('[data-bi-hidden-key]').forEach(el=>{ try{ el.style.display=''; el.removeAttribute('data-bi-hidden-key'); }catch(e){} });
      return 0;
    }
    const sel='li,[role="listitem"],[class*="-item"],[class*="item-"],[class*="conversation"],[class*="user"]';
    const rows=[];
    document.querySelectorAll(sel).forEach(el=>{
      try{
        if(el.closest('#biRoot')) return;
        const t=(el.textContent||'').replace(/\s/g,'');
        if(!t||t.length>200) return;
        rows.push({el,t});
      }catch(e){}
    });
    // 保守策略：每个会话只藏「最具体的那个节点」；如果同时有多个同等"像行"的节点命中，说明名字不唯一 → 宁可不藏，也不藏错
    const plan={};
    wanted.forEach(w=>{
      const hit=rows.filter(r=>r.t.indexOf(w.key)>=0)
        .map(r=>{ const b=r.el.getBoundingClientRect(); return {el:r.el,area:Math.max(1,Math.round(b.width*b.height))}; })
        .sort((a,b)=>a.area-b.area);
      if(!hit.length) return;
      if(hit.length>1&&hit[1].area<=hit[0].area*2) return;      // 多个同量级候选 → 歧义，跳过
      plan[w.sid]=hit[0].el;
    });
    Object.keys(plan).forEach(sid=>{
      const el=plan[sid];
      try{ el.style.display='none'; el.setAttribute('data-bi-hidden-key',sid); n++; }catch(e){}
    });
    // 还原：之前藏过、但现在不该藏的（会话被恢复 / 名字变得不唯一 / 行被 Vue 复用）
    document.querySelectorAll('[data-bi-hidden-key]').forEach(el=>{
      try{
        const sid=el.getAttribute('data-bi-hidden-key');
        const keep=!!HIDDEN[sid]&&plan[sid]===el;
        if(!keep){ el.style.display=''; el.removeAttribute('data-bi-hidden-key'); }
      }catch(e){}
    });
  }catch(e){}
  return n;
}
// v0.5.5：悬浮球位置恢复（拖的就是球本身）
function applyFabPos(el,key){
  try{
    const o=JSON.parse(localStorage.getItem(key)||'null');
    if(o&&typeof o.x==='number'&&typeof o.y==='number'){
      el.style.position='fixed';
      el.style.left=Math.max(4,Math.min(o.x,window.innerWidth-60))+'px';
      el.style.top=Math.max(4,Math.min(o.y,window.innerHeight-60))+'px';
    }
  }catch(e){}
}
// 面板可拖动：按住标题栏拖，位置存本机（与 tag 面板同一套交互）
function applyPanelPos(p,key){
  try{
    const o=JSON.parse(localStorage.getItem(key)||'null');
    if(o&&typeof o.x==='number'&&typeof o.y==='number'){
      const w=p.offsetWidth||560,h=p.offsetHeight||Math.round(window.innerHeight*0.7);   // v0.5.5 按面板实际尺寸钳位（旧钳位按小把手算，面板能被拖到几乎出屏）
      p.style.left=Math.max(4,Math.min(o.x,Math.max(4,window.innerWidth-w-8)))+'px';
      p.style.top=Math.max(4,Math.min(o.y,Math.max(4,window.innerHeight-h-8)))+'px';
      p.style.right='auto'; p.style.bottom='auto';
    }
  }catch(e){}
}
function makePanelDraggable(handle,p,key){
  if(!handle||!p) return;
  let moved=false;
  handle.addEventListener('pointerdown',(e)=>{
    if(p!==handle&&e.target&&e.target.closest&&e.target.closest('button,input,textarea,summary,a,select')) return;   // v0.5.5：拖的就是把手本身（悬浮球）时不跳过
    e.preventDefault(); moved=false;
    const r=p.getBoundingClientRect(), dx=e.clientX-r.left, dy=e.clientY-r.top;
    const move=(ev)=>{
      let x=ev.clientX-dx, y=ev.clientY-dy; moved=true;
      const w=p.offsetWidth||560,h=p.offsetHeight||Math.round(window.innerHeight*0.7);
      x=Math.max(4,Math.min(x,Math.max(4,window.innerWidth-w-8))); y=Math.max(4,Math.min(y,Math.max(4,window.innerHeight-h-8)));
      p.style.left=x+'px'; p.style.top=y+'px'; p.style.right='auto'; p.style.bottom='auto';
    };
    const up=()=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
      try{ const rr=p.getBoundingClientRect(); localStorage.setItem(key,JSON.stringify({x:rr.left,y:rr.top})); }catch(e2){}
      // v0.5.7：拖完就吞掉紧随其后的一次 click。原来只在「拖的是悬浮球」时吞（p===handle），
      // 面板把手拖完仍会放行 click —— 落点正好压着开关时会顺手把开关拨一下（拖动 = 误触开关）。
      // 同时这里不再依赖 click 事件是否存在：触屏上 pointerup 后可能根本没有 click，
      // 原来那样就白等一个永不发生的 click，把「下一次」真实点击吞掉（点一下没反应）。
      if(moved){
        const sw=(ev)=>{ ev.stopPropagation(); ev.preventDefault(); };
        try{ handle.addEventListener('click',sw,{once:true,capture:true}); }catch(e2){}
        // 兜底：触屏/某些浏览器 pointerup 之后压根不发 click，上面那个 once 监听器会一直挂着，
        // 把用户「下一次」真实点击吞掉。1 秒后自动摘掉，谁先到算谁。
        setTimeout(()=>{ try{ handle.removeEventListener('click',sw,true); }catch(e3){} },1000);
      }
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
  });
}

// ---- 5) 三个站内动作 ----
function actNotInterested(sid){
  if(!actPrecheck(sid)) return;
  const s=(CHAT.sessions||{})[sid];
  if(!confirm('对「'+sessionLabel(sid)+'」标记「不感兴趣」？\n\n这是**站内操作**：会调 BOSS 的接口，把它收进「不感兴趣」并从消息列表移除。\n注意：站内只标记、**不删聊天记录**（要清记录用「删」）。')) return;
  const fire=(code,text)=>postChatAction('/wapi/zprelation/userMark/unsuitable',
    {securityId:s.securityId,pageType:2,markReason:(code==null?1:code),markReasonText:text||'不合适'},
    sid,'不感兴趣',ok=>{ if(ok) markSession(sid,'不感兴趣'); renderPanel(); });
  GM_xmlhttpRequest({
    method:'GET', url:'https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json', timeout:10000,
    onload:r=>{
      let code=null,text='';
      try{
        const j=JSON.parse(r.responseText||'{}'); const d=j.zpData||j.data||{};
        const arr=Array.isArray(d)?d:(d.reasons||d.list||d.items||[]);
        if(arr&&arr.length){ const it=arr[0]; code=(it.code!==undefined?it.code:it.id); text=it.text||it.name||it.reason||''; }
      }catch(e){}
      fire(code,text);
    },
    onerror:()=>fire(1,'不合适'), ontimeout:()=>fire(1,'不合适')
  });
}
function actBlock(sid){
  if(!actPrecheck(sid)) return;
  const s=(CHAT.sessions||{})[sid];
  const withDelete=confirm('把「'+sessionLabel(sid)+'」加入黑名单？\n\n这是**站内操作**：对方将无法再给你发消息。\n\n点「确定」＝拉黑**并删除聊天记录**（不可恢复，后续导出会变小）\n点「取消」＝只拉黑，保留记录');
  if(withDelete===null) return;
  if(!confirm(withDelete?('拉黑「'+sessionLabel(sid)+'」并删除聊天记录？此操作不可恢复。'):('只把「'+sessionLabel(sid)+'」加入黑名单（保留聊天记录）？'))) return;
  postChatAction('/wapi/zprelation/userBlack/add',{securityId:s.securityId,needRemoveFriend:withDelete?1:0},sid,
    withDelete?'拉黑+删记录':'拉黑',ok=>{ if(ok) markSession(sid,'拉黑'); renderPanel(); });
}
function actDeleteChat(sid){
  if(!actPrecheck(sid)) return;
  const s=(CHAT.sessions||{})[sid];
  if(!confirm('删除与「'+sessionLabel(sid)+'」的会话？\n\n站内原话：「将对方从你的列表中删除，同时删除聊天记录」。不可恢复；已约好的面试日程不受影响。')) return;
  postChatAction('/wapi/zprelation/friend/delete.json',{securityId:s.securityId},sid,'删除会话',ok=>{
    if(ok){ s.deletedAt=now(); saveMark(sid); }
    renderPanel();
  });
}
// ---- 6) 批量：串行 + 间隔，连续失败自动停 ----
let chatQueue={running:false,done:0,total:0,ok:0,fail:0,label:'',finishedAt:0};
function runChatQueue(list,fn,gapMs,label){
  if(chatQueue.running){ alert('还有一批处置没跑完，等它结束'); return; }
  chatQueue={running:true,done:0,total:list.length,ok:0,fail:0,streak:0,label,finishedAt:0};
  const step=()=>{
    if(!chatQueue.running||chatQueue.done>=list.length){
      chatQueue.running=false; chatQueue.finishedAt=now();
      biMsg=label+'结束：成功 '+chatQueue.ok+' · 失败 '+chatQueue.fail; renderPanel(); return;
    }
    const sid=list[chatQueue.done];
    // v0.5.6：批量也要吃每日上限这道闸（原来只有单点走 actPrecheck，批量一路直发 wapi）
    if(!actBudgetOk()){ chatQueue.running=false; chatQueue.finishedAt=now(); biMsg=label+'已停下：今日站内处置达上限（'+(S.act.maxPerDay||30)+' 次），明天自动重置'; renderPanel(); return; }
    fn(sid,ok=>{
      chatQueue.done++;
      // v0.5.7：文案与行为对齐 —— 原来是 chatQueue.fail>=3 累计失败即停，
      // 而面板/确认框一直写「连续失败会自动停下」。改成真的数「连续」：成功就清零。
      chatQueue.streak=ok?0:(chatQueue.streak||0)+1;
      if(ok) chatQueue.ok++; else chatQueue.fail++;
      renderPanel();
      if(!ok&&chatQueue.streak>=3){ chatQueue.running=false; chatQueue.finishedAt=now(); biMsg=label+'连续 '+chatQueue.streak+' 次失败，已停下（成功 '+chatQueue.ok+' · 失败 '+chatQueue.fail+'）'; renderPanel(); return; }
      setTimeout(step,gapMs);
    });
  };
  renderPanel(); step();
}
function batchHideByRules(){
  // v0.5.6：口径与另两个批量、「待处理」列表统一（原来不跳已标记/已删除，确认框数字对不上）
  const hits=chatSessionList().filter(s=>!isHiddenChat(s.sid)&&!s.markedAt&&!s.deletedAt&&s.hitHide&&s.hitHide.length);
  if(!hits.length){ alert('没有命中「隐藏词」规则的会话'); return; }
  if(!confirm('把命中「隐藏词」规则的 '+hits.length+' 个会话本地隐藏？\n\n纯本地、不发任何请求，随时可恢复。')) return;
  mergeHidden(c=>{ hits.forEach(s=>{ c[s.sid]=now(); }); });
  biMsg='按「隐藏词」规则隐藏了 '+hits.length+' 个会话';
  applyPageHide(); renderPanel();
}
function batchBlockByRules(){
  // v0.5.6：加 &&s.fromThem —— 兜底文本（可能是用户自己发的话）不得驱动不可逆的拉黑
  const all=chatSessionList().filter(s=>s.fromThem&&s.hitBlock&&s.hitBlock.length&&!s.markedAt&&!s.deletedAt);
  const ready=all.filter(s=>s.securityId);
  if(!ready.length){ alert('没有可执行「拉黑」的会话'+(all.length?('（有 '+all.length+' 个命中规则但没拿到 securityId，去聊天页点「刷新会话」）'):'')); return; }
  if(!confirm('把命中「拉黑词」规则的 '+ready.length+' 个会话**逐个拉黑并删除聊天记录**？\n\n这是站内写操作，不可恢复；每个间隔 3 秒，连续失败会自动停下。\n'+(all.length>ready.length?('另有 '+(all.length-ready.length)+' 个因缺少 securityId 会跳过。'):''))) return;
  runChatQueue(ready.map(s=>s.sid),(sid,cb)=>{
    const s=(CHAT.sessions||{})[sid];
    postChatAction('/wapi/zprelation/userBlack/add',{securityId:s.securityId,needRemoveFriend:1},sid,'拉黑+删记录',ok=>{ if(ok) markSession(sid,'拉黑'); cb(ok); });
  },3000,'批量拉黑');
}
function batchDeleteMarked(){
  // v0.5.7：三个批量的「跳过已处理」口径统一 —— 这里加 !isHiddenChat（本地已隐藏的会话不该再被拉进站内写操作），
  // 与 batchHideByRules / batchBlockByRules 对齐；确认框里的数字与实际会执行的数量一致。
  const list=chatSessionList().filter(s=>s.markedAt&&!s.deletedAt&&s.securityId&&!isHiddenChat(s.sid));
  if(!list.length){ alert('没有「已标记（不感兴趣/拉黑）但记录还在」的会话'); return; }
  if(!confirm('把 '+list.length+' 个已标记会话的**聊天记录删掉**？\n\n站内原话：「将对方从你的列表中删除，同时删除聊天记录」。不可恢复；每个间隔 3 秒，连续失败会自动停下。')) return;
  runChatQueue(list.map(s=>s.sid),(sid,cb)=>{
    const s=(CHAT.sessions||{})[sid];
    postChatAction('/wapi/zprelation/friend/delete.json',{securityId:s.securityId},sid,'删除会话',ok=>{
      if(ok){ s.deletedAt=now(); saveMark(sid); }
      cb(ok);
    });
  },3000,'批量删除已标记会话');
}

// ===== v0.2.0：页面 UI（悬浮球 + 面板）=====
const BI_CSS=
'#biRoot{position:fixed;right:18px;bottom:146px;z-index:2147483000;--bi:#12a594;--bi-line:#e6ebf3;--bi-mute:#7a8396;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430}'+
'#biFab{width:52px;height:52px;border-radius:50%;background:linear-gradient(160deg,#2fd0bb,#12a594);color:#fff;font-size:22px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(18,165,148,.42);display:flex;align-items:center;justify-content:center}'+
'#biFab:hover{filter:brightness(1.06)}'+
'#biPanel{display:none;position:fixed;right:18px;bottom:210px;width:560px;max-width:calc(100vw - 36px);max-height:76vh;overflow:auto;background:#fff;border:1px solid var(--bi-line);border-radius:16px;box-shadow:0 18px 50px rgba(20,30,60,.22)}'+
'#biPanel .bip-head{position:sticky;top:0;cursor:move;user-select:none;touch-action:none;z-index:3;height:44px;padding:0 14px;display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid var(--bi-line);border-radius:16px 16px 0 0}'+
'#biPanel .bip-dot{width:8px;height:8px;border-radius:50%;background:#12a594;box-shadow:0 0 0 3px rgba(18,165,148,.16);flex:0 0 auto}'+
'#biPanel .bip-dot.off{background:#94a3b8;box-shadow:0 0 0 3px rgba(148,163,184,.2)}'+
'#biPanel .bip-head .bip-mute{margin-left:auto;text-align:right}'+
'#biPanel .bip-x{border:none;background:none;font-size:20px;line-height:1;cursor:pointer;color:#7a8396;padding:0 2px}'+
'#biPanel .bip-x:hover{color:#1f2430}'+
'#biPanel .bip-body{padding:12px 14px 14px}'+
'#biPanel .bip-mute{color:var(--bi-mute);font-size:12px}'+
'#biPanel .bip-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'+
'#biPanel .bip-card{background:linear-gradient(180deg,#f2fdfb,#eafaf7);border:1px solid var(--bi-line);border-radius:12px;padding:8px 10px}'+
'#biPanel .bip-card b{display:block;font-size:19px;line-height:1.3;color:#0e8c7e}'+
'#biPanel .bip-card span{font-size:11px;color:var(--bi-mute)}'+
'#biPanel .bip-h{font-weight:600;margin:12px 0 6px;padding-left:8px;border-left:3px solid #12a594}'+
'#biPanel .bip-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}'+
'#biPanel .bip-btn{border:1px solid #d7dce6;background:#fff;border-radius:9px;padding:5px 11px;cursor:pointer;font-size:12px;color:#1f2430;font-family:inherit}'+
'#biPanel .bip-btn:hover{background:#effbf9;border-color:#b7e8e0}'+
'#biPanel .bip-btn.primary{background:#12a594;border-color:#12a594;color:#fff;font-weight:600}'+
  '#biPanel .bip-btn.primary:hover{background:#0e8c7e}'+
  // v0.3.0：聊天体检用的小标签与行内按钮
  '#biPanel .bip-tag{display:inline-block;margin:1px 3px 1px 0;padding:1px 6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;color:#475569;font-size:10px}'+
  '#biPanel .bip-tag.warn{background:#fef2f2;border-color:#fecaca;color:#b42318}'+
  '#biPanel .bip-mini{margin:3px 0 6px;white-space:nowrap}'+
  '#biPanel .bip-mini .bip-btn{padding:2px 8px;font-size:11px;margin-right:4px}'+
  '#biPanel .bip-btn.danger{color:#b42318;border-color:#f1c0bb}'+
  '#biPanel .bip-btn.danger:hover{background:#fef2f1}'+
'#biPanel .bip-list{font-size:12px;max-height:180px;overflow:auto;border:1px solid var(--bi-line);border-radius:10px;padding:4px 10px;background:#fcfdff}'+
'#biPanel .bip-list div{padding:2px 0;border-bottom:1px dashed #eef1f6}'+
'#biPanel details.bip-fold{border:1px solid var(--bi-line);border-radius:12px;background:#fcfdff;margin:8px 0;overflow:hidden}'+
'#biPanel details.bip-fold>summary{cursor:pointer;padding:8px 12px;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;list-style:none}'+
'#biPanel details.bip-fold>summary::-webkit-details-marker{display:none}'+
'#biPanel details.bip-fold>summary::before{content:"\\25B8";color:var(--bi-mute);font-weight:400}'+
'#biPanel details.bip-fold[open]>summary::before{content:"\\25BE"}'+
'#biPanel details.bip-fold>summary:hover{background:#effbf9}'+
'#biPanel .bip-foldbody{padding:6px 12px 10px;border-top:1px solid #eef1f6}'+
'#biPanel textarea{width:100%;border:1px solid #d7dce6;border-radius:10px;padding:6px 8px;font:12px/1.5 monospace;outline:none;resize:vertical}'+
'#biPanel input[type=text],#biPanel input[type=password],#biPanel select{border:1px solid #d7dce6;border-radius:8px;padding:3px 6px;font-size:12px;outline:none;font-family:inherit}'+
'#biPanel input[type=text]:focus,#biPanel input[type=password]:focus,#biPanel textarea:focus{border-color:#8fded3;box-shadow:0 0 0 2px rgba(18,165,148,.12)}'+
'#biPanel .bip-note{margin:8px 0;padding:6px 10px;background:#effbf9;border:1px solid #b7e8e0;border-radius:10px;color:#0e6f64;font-size:12px}'+
'#biToast{display:none;position:absolute;right:0;bottom:64px;z-index:2147483002;max-width:440px;background:#111827;color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.28)}';
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
let ui=null, biToastEl=null, biToastT=null, biMsg='', biRuleSaveT=null;   // v0.3.0：处置规则自动保存的防抖
function biEnsureStyle(){ if(document.getElementById('biStyle')) return; const s=document.createElement('style'); s.id='biStyle'; s.textContent=BI_CSS; (document.head||document.documentElement).appendChild(s); }
function biToast(msg){
  try{
    if(!ui) return;
    if(!biToastEl){ biToastEl=document.createElement('div'); biToastEl.id='biToast'; ui.root.appendChild(biToastEl); }
    biToastEl.textContent=String(msg||''); biToastEl.style.display='block';
    if(biToastT) clearTimeout(biToastT);
    biToastT=setTimeout(()=>{ try{ biToastEl.style.display='none'; }catch(e){} },2600);
  }catch(e){}
}
// 8 秒一轮的重绘不吃掉你正在填的东西（折叠状态 / 输入框 / 滚动 / 焦点）
function biSnap(p){
  const s={folds:[], vals:{}, checks:{}, scroll:0, focus:'', sel:null};
  try{
    const folds=p.querySelectorAll('details.bip-fold');
    for(let i=0;i<folds.length;i++) s.folds.push(!!folds[i].open);
    const ins=p.querySelectorAll('input,textarea,select');
    for(let i=0;i<ins.length;i++){ const n=ins[i]; if(!n.id) continue; if(n.type==='checkbox') s.checks[n.id]=!!n.checked; else s.vals[n.id]=n.value; }
    s.scroll=p.scrollTop||0;
    const a=document.activeElement;
    if(a&&p.contains(a)&&a.id&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT')){
      s.focus=a.id; try{ s.sel=[a.selectionStart,a.selectionEnd]; }catch(e){}
    }
  }catch(e){}
  return s;
}
function biRestore(p,s){
  try{
    if(!s) return;
    const folds=p.querySelectorAll('details.bip-fold');
    for(let i=0;i<folds.length&&i<s.folds.length;i++) folds[i].open=!!s.folds[i];
    Object.keys(s.vals||{}).forEach(id=>{ const n=p.querySelector('#'+id); if(n&&n.value!==undefined&&s.vals[id]!==undefined) n.value=s.vals[id]; });
    Object.keys(s.checks||{}).forEach(id=>{ const n=p.querySelector('#'+id); if(n) n.checked=!!s.checks[id]; });
    p.scrollTop=s.scroll||0;
    if(s.focus){ const a=p.querySelector('#'+s.focus); if(a){ a.focus(); try{ if(s.sel&&a.setSelectionRange) a.setSelectionRange(s.sel[0],s.sel[1]); }catch(e){} } }
  }catch(e){}
}
function rulesToText(rules){ return (rules||[]).map(r=>[r.name,Number(r.weight)||0,r.cat||'',(r.keywords||[]).join(',')].join('|')).join('\n'); }
function textToRules(v){
  const out=[];
  String(v||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach((line,i)=>{
    const p=line.split('|').map(s=>s.trim());
    if(!p[0]) return;
    out.push({id:'r'+(i+1), name:p[0].slice(0,20), weight:Number(p[1])||10, cat:(p[2]||'其它').slice(0,8), enabled:true,
      keywords:(p[3]||'').split(/[,，]/).map(s=>s.trim()).filter(Boolean)});
  });
  return out;
}
function biCounts(){
  const inData=readIn(), out=readOut();
  return {jobs:Object.keys(inData.jobs||{}).length, risk:Object.keys(out.risk||{}).length, rules:(S.rules||[]).length};
}
function buildUI(){
  // v0.5.10：DOM 级幂等 —— 页面里已经有 #biRoot 就复用它，绝不再挂第二个球。
  // 原来的判据是「内存变量 + document.body.contains(ui.root)」：同页跑两份脚本、
  // 或页面重建/搬动过 body 时旧节点仍在屏幕上，判断却已失效，于是又建一个 🩺 球。
  try{
    const exist=document.getElementById('biRoot');
    if(exist&&(!ui||ui.root!==exist)){
      ui={root:exist, fab:exist.querySelector('#biFab'), panel:exist.querySelector('#biPanel'), body:exist.querySelector('#biBody'), open:!!(ui&&ui.open)};
      return ui;
    }
  }catch(e){}
  if(ui&&ui.root&&document.body&&document.body.contains(ui.root)) return ui;
  if(!document.body) return null;
  biEnsureStyle();
  const root=document.createElement('div');
  root.id='biRoot';
  root.innerHTML='<button id="biFab" title="聊天体检 / 一键处置（在聊天页用）">🩺</button>'+
    '<div id="biPanel"><div class="bip-head"><span class="bip-dot" id="biDot"></span><b>岗位体检</b>'+
    '<span class="bip-mute">v'+VERSION+' · 会话读取只读 · 处置按你点击 · 数据仅存本机</span>'+
    '<button class="bip-x" data-bi="close" title="收起">×</button></div>'+
    '<div class="bip-body" id="biBody"></div></div>';
  document.body.appendChild(root);
  ui={root, fab:root.querySelector('#biFab'), panel:root.querySelector('#biPanel'), body:root.querySelector('#biBody'), open:false};
  applyPanelPos(ui.panel,'bi_panelpos'); makePanelDraggable(ui.panel.querySelector('.bip-head'),ui.panel,'bi_panelpos');   // v0.5.3 面板可拖
  applyFabPos(ui.fab,'bi_fabpos'); makePanelDraggable(ui.fab,ui.fab,'bi_fabpos');   // v0.5.5：悬浮球也能拖，位置存本机
  ui.fab.addEventListener('click',()=>togglePanel());
  ui.panel.addEventListener('click',(e)=>{
    const b=(e.target&&e.target.closest)?e.target.closest('[data-bi]'):null;
    if(!b) return;
    const act=b.dataset.bi;
    if(act==='close') togglePanel(false);
    // v0.3.0：聊天体检 / 处置
    else if(act==='chat-refresh'){
      askChatProbe(); biMsg='正在读取聊天页的会话列表…'; renderPanel();
      setTimeout(()=>{
        try{ applyOpenedChat(true); }catch(e){}          // 顺带读一次「当前打开的那个会话」里对方发的消息
        scanChat();
        const c2=chatCounts();
        biMsg='已读到 '+c2.sessions+' 个会话（带令牌 '+c2.withSec+' 个）'+(c2.withThem?('，其中 '+c2.withThem+' 个读到对方原话'):'');
        renderPanel();
      },1200);
    }
    else if(act==='chat-hide'){ actHide(b.dataset.sid); }
    else if(act==='chat-unhide'){ actUnhide(b.dataset.sid); }
    else if(act==='chat-ni'){ actNotInterested(b.dataset.sid); }
    else if(act==='chat-block'){ actBlock(b.dataset.sid); }
    else if(act==='chat-del'){ actDeleteChat(b.dataset.sid); }
    else if(act==='chat-batch-hide'){ batchHideByRules(); }
    else if(act==='chat-batch-block'){ batchBlockByRules(); }
    else if(act==='chat-batch-del'){ batchDeleteMarked(); }
    else if(act==='chat-unhide-all'){
      const n=Object.keys(HIDDEN||{}).length;
      if(!n){ alert('当前没有本地隐藏的会话'); return; }
      if(!confirm('把本地隐藏的 '+n+' 个会话全部恢复显示？')) return;
      mergeHidden(c=>{ Object.keys(c).forEach(k=>{ delete c[k]; }); });
      try{ gset(K_RISKHID,{}); }catch(e){}     // v0.5.6：同时清风险隐藏名单，否则 8 秒后被 syncRiskHidden 全部塞回
      // v0.5.7：再开一个 12 秒静默窗。上面清了名单，但 rescanRisk 每 8 秒会重算 riskHits、
      // 会话重新变成「新标记」，PREV_RISK 也已被清空 —— 于是刚恢复的卡片下一轮又被藏回去。
      // 静默窗内不跑 applyPageHide / syncRiskHidden，让你看到恢复是真的生效了。
      UNMARK_RISK={}; Object.keys(CHAT.sessions||{}).forEach(k=>{ UNMARK_RISK[k]=1; });
      biMuteHideUntil=now()+12000;
      applyPageHide(); biMsg='已恢复全部本地隐藏的会话（12 秒内不会自动重新隐藏）'; renderPanel();
    }
    else if(act==='chat-rules-save'){ saveChatRulesFromPanel(); }
    else if(act==='chat-rules-default'){
      if(!confirm('恢复默认的两套聊天处置词？（你自己改的会没）')) return;
      S.rulesChat=Object.assign({},S.rulesChat,{block:DEFAULT_CHAT_RULES.block.slice()}); saveSettings(); scanChat(); renderPanel();
      const bl=ui.body.querySelector('#biRuleBlock');
      if(bl) bl.value=chatRuleText('block');
      biMsg='已恢复默认处置词'; renderPanel();
    }
    else if(act==='rules-save'){
      const t=ui.body.querySelector('#biRiskWords');
      S.riskWords=cleanRuleLines(t?t.value:'');
      if(!S.riskWords.length){ alert('至少保留一个风险关键词（一行一个）'); return; }
      saveSettings(); rescanRisk(); biMsg='已保存 '+S.riskWords.length+' 个风险关键词'; renderPanel(); biToast(biMsg);
    }
    else if(act==='rules-default'){
      if(!confirm('恢复默认风险关键词？（你自己改的会没）')) return;
      S.riskWords=DEFAULT_RISK_WORDS.slice(); saveSettings();
      rescanRisk(); renderPanel(); biToast('已恢复默认风险词');
      const t=ui.body.querySelector('#biRiskWords'); if(t) t.value=(S.riskWords||[]).join('\n');
    }
    else if(act==='scan'){
      const n=scanRisk(); const m=applyOpenedChat(true);
      const cc2=chatCounts();
      biMsg='已体检：'+n+' 个会话命中风险词 · 关键词命中 今日 '+cc2.scanToday+' / 总 '+cc2.scanTotal+(m?('，另读到当前会话对方 '+m+' 句'):'');
      renderPanel(); biToast(biMsg);
    }
    else if(act==='hide-marked'){
      S.hideRiskMarked=!S.hideRiskMarked; saveSettings();
      if(S.hideRiskMarked) syncRiskHidden(); else clearRiskHidden();
      renderPanel();
      biToast(S.hideRiskMarked?'已隐藏带风险标记的会话（本地，再点恢复）':'已恢复被风险标记隐藏的会话');
    }
  });
  // v0.3.0：两套处置规则，输入 0.8 秒后自动保存（跟 filter 的排除词一个体验）
  ui.panel.addEventListener('input',(e)=>{
    const el=e.target;
    if(!el||(el.id!=='biRuleBlock'&&el.id!=='biRiskWords')) return;
    clearTimeout(biRuleSaveT);
    biRuleSaveT=setTimeout(()=>{ if(el.id==='biRiskWords') saveRiskWordsFromPanel(); else saveChatRulesFromPanel(); },800);
  });
  return ui;
}
// v0.5.0：面板里的风险词自动保存并立即重扫标记（不累加体检计数）
function saveRiskWordsFromPanel(){
  const t=ui&&ui.body?ui.body.querySelector('#biRiskWords'):null;
  if(!t) return;
  S.riskWords=cleanRuleLines(t.value);
  saveSettings(); rescanRisk();
  biMsg='风险词已保存（'+S.riskWords.length+' 个）';
  renderPanel();
}
// v0.3.0：把面板里的两套处置词存下来并立即重扫
function saveChatRulesFromPanel(){
  const bl=ui&&ui.body?ui.body.querySelector('#biRuleBlock'):null;
  if(!bl) return;
  S.rulesChat=Object.assign({},S.rulesChat,{block:cleanRuleLines(bl.value)});
  saveSettings(); scanChat();
  biMsg='处置规则已保存（隐藏词=风险词 '+chatRuleWords('hide').length+' 个 · 拉黑 '+chatRuleWords('block').length+' 条）';
  renderPanel();
}
// v0.3.0：会话列表（带一键处置按钮）；v0.4.0：onlyPending=true 时只列「命中规则且还没处置」的
function chatListHtml(onlyPending){
  let list=chatSessionList().sort((a,b)=>(b.lastTs||0)-(a.lastTs||0));
  if(onlyPending){
    list=list.filter(s=>!isHiddenChat(s.sid)&&!s.markedAt&&!s.deletedAt&&((s.hitHide&&s.hitHide.length)||(s.hitBlock&&s.hitBlock.length)||(s.riskHits&&s.riskHits.length)));
    if(!list.length) return '<div class="bip-mute">没有待处理项：当前没有命中规则/风险词又没处置的会话。</div>';
  }else{
    if(!list.length) return '<div class="bip-mute">还没有读到会话：打开 BOSS 消息页（聊天页），点上面「刷新会话」。</div>';
  }
  if(S.hideRiskMarked) list=list.filter(s=>!(s.riskHits&&s.riskHits.length));   // v0.5.0：一键隐藏标记卡片（仅本地显示）
  list=list.slice(0,30);
  return '<div class="bip-list">'+list.map(s=>{
    const hid=isHiddenChat(s.sid);
    const tags=[];
    if(s.hitBlock&&s.hitBlock.length) tags.push('<span class="bip-tag warn">拉黑词·'+esc(s.hitBlock.slice(0,2).join('/'))+'</span>');
    if(s.hitHide&&s.hitHide.length) tags.push('<span class="bip-tag">隐藏词·'+esc(s.hitHide.slice(0,2).join('/'))+'</span>');
    if(s.riskHits&&s.riskHits.length) tags.push('<span class="bip-tag warn">风险·'+esc(s.riskHits.slice(0,2).join('/'))+'</span>');
    if(hid) tags.push('<span class="bip-tag">已隐藏</span>');
    if(s.markedAt&&!s.deletedAt) tags.push('<span class="bip-tag">已标记</span>');
    if(!s.securityId) tags.push('<span class="bip-tag warn">缺令牌</span>');
    if(s.themTexts&&s.themTexts.length) tags.push('<span class="bip-tag">对方 '+s.themTexts.length+' 句</span>');
    return '<div><b>'+esc(s.company||s.boss||s.sid)+'</b> '+(s.boss&&s.company?('<span class="bip-mute">'+esc(s.boss)+'</span>'):'')+' '+tags.join(' ')+
      '<div class="bip-mute" style="font-size:11px">'+esc(String((s.themTexts&&s.themTexts.length?s.themTexts[s.themTexts.length-1]:s.lastText)||'').slice(0,60))+'</div>'+
      '<div class="bip-mini">'+
        (hid?('<button class="bip-btn" data-bi="chat-unhide" data-sid="'+esc(s.sid)+'">恢复</button>')
           :('<button class="bip-btn" data-bi="chat-hide" data-sid="'+esc(s.sid)+'" title="本地隐藏：只在你眼前消失，不发任何请求">隐藏</button>'))+
        '<button class="bip-btn" data-bi="chat-ni" data-sid="'+esc(s.sid)+'" title="站内「不感兴趣」：只标记、不删记录">不感兴趣</button>'+
        '<button class="bip-btn danger" data-bi="chat-block" data-sid="'+esc(s.sid)+'" title="站内拉黑（可选连带删记录）">拉黑</button>'+
        '<button class="bip-btn danger" data-bi="chat-del" data-sid="'+esc(s.sid)+'" title="站内删除这个会话（连聊天记录一起删）">删</button>'+
      '</div></div>';
  }).join('')+'</div>';
}
function renderPanel(){
  const u=buildUI();
  if(!u) return;
  const p=u.panel;
  const keep=biSnap(u.body);
  const inData=readIn(), out=readOut();
  const c={rules:(S.rules||[]).length};   // 原 biCounts() 的 jobs/risk 无人使用，别再解析两遍镜像
  const riskRows=Object.keys(out.risk||{}).map(k=>Object.assign({jobId:k},out.risk[k]||{}))
    .sort((x,y)=>(y.score||0)-(x.score||0)).slice(0,30);
  const jobName=jid=>{ const j=(inData.jobs||{})[jid]||{}; return [j.name||'',j.company||''].filter(Boolean).join(' · ')||jid; };
  const lvlColor=l=>(l==='高'?'#b91c1c':(l==='中'?'#b45309':'#4b5563'));
  let html='';
  const cchat=chatCounts();
  html+='<div class="bip-cards">'+
    '<div class="bip-card"><b>'+cchat.sessionsToday+'</b><span>今日会话总数</span></div>'+
    '<div class="bip-card"><b>'+cchat.sessions+'</b><span>总会话总数</span></div>'+
    '<div class="bip-card"><b>'+cchat.scanToday+'</b><span>今日立即体检</span></div>'+
    '<div class="bip-card"><b>'+cchat.scanTotal+'</b><span>总立即体检</span></div>'+
    '<div class="bip-card"><b>'+cchat.pending+'</b><span>待处理</span></div>'+
    '<div class="bip-card"><b>'+((S.riskWords||[]).length)+'</b><span>风险词</span></div></div>';
  html+='<div class="bip-row"><button class="bip-btn primary" data-bi="scan">立即体检</button>'+
    '<button class="bip-btn" data-bi="hide-marked">'+(S.hideRiskMarked?'显示标记卡片':'一键隐藏标记卡片')+'</button>'+
    '<span class="bip-mute">体检拿风险词扫对方消息；计数=关键词命中数（按天切，自动重扫刷新今日数）</span></div>';
  if(biMsg) html+='<div class="bip-note">'+esc(biMsg)+'</div>';
  html+='<details class="bip-fold" open><summary>岗位风险词<span class="bip-mute">'+(S.riskWords||[]).length+' 条 · 一行一个 · 不打分</span></summary><div class="bip-foldbody">'+
    '<div class="bip-mute" style="font-size:11px">体检按钮拿这些词扫聊天里对方发的消息；命中给会话卡打「风险」标记并计入待处理。跟隐藏脚本的排除词一个体验：改完 800ms 自动保存。</div>'+
    '<textarea id="biRiskWords" style="height:132px">'+esc((S.riskWords||[]).join('\n'))+'</textarea>'+
    '<div class="bip-row"><button class="bip-btn primary" data-bi="rules-save">保存词表</button>'+
    '<button class="bip-btn" data-bi="rules-default">恢复默认</button></div></div></details>';
  const riskList=chatSessionList().filter(s=>s.riskHits&&s.riskHits.length).sort((a,b)=>(b.lastTs||0)-(a.lastTs||0)).slice(0,30);
  html+='<details class="bip-fold" open><summary>体检结果<span class="bip-mute">'+riskList.length+' 个会话命中风险词</span></summary><div class="bip-foldbody">'+
    (riskList.length?('<div class="bip-list">'+riskList.map(r=>'<div><b>'+esc(r.company||r.boss||r.sid)+'</b> <span class="bip-tag warn">风险·'+esc(r.riskHits.slice(0,3).join('/'))+'</span></div>').join('')+'</div>')
      :'<div class="bip-mute">还没有结果：点「立即体检」，拿风险词扫当前会话里对方发的消息。</div>')+
    '</div></details>';
  // ===== v0.3.0：聊天体检 / 一键处置 =====
  const cc=cchat;   // 783 行已算过，本次渲染内 CHAT/HIDDEN 未变
  const onChatPage=/\/chat|\/message/i.test(location.pathname);
  html+='<details class="bip-fold" open><summary>聊天体检 / 一键处置<span class="bip-mute">会话 '+cc.sessions+' · 命中隐藏 '+cc.hitHide+' · 命中拉黑 '+cc.hitBlock+' · 本地隐藏 '+cc.hidden+'</span></summary><div class="bip-foldbody">'+
    '<div class="bip-mute" style="font-size:11px">看的是<b>对方发来的最后一句</b>（在聊天页只读页面状态，不发请求）。命中「隐藏词」→ 建议本地隐藏；命中「拉黑词」→ 建议拉黑。规则只做判断，不替你动手。</div>'+
    '<div class="bip-row"><button class="bip-btn primary" data-bi="chat-refresh">刷新会话</button>'+
    '<a class="bip-btn" href="https://www.zhipin.com/web/geek/chat" target="_blank" rel="noreferrer" style="text-decoration:none">打开聊天页</a>'+
    '<span class="bip-mute">'+(CHAT.at?('上次读到 '+new Date(CHAT.at).toLocaleTimeString('zh-CN',{hour12:false})+' · 带令牌 '+cc.withSec+'/'+cc.sessions):'还没读到会话')+'</span></div>'+
    (onChatPage?'':'<div class="bip-mute" style="font-size:11px">当前不在聊天页：点上面的「打开聊天页」，在那个页面里点「刷新会话」（会话列表和令牌都只有聊天页才有）。</div>')+
    ((onChatPage&&!cc.sessions)?'<div class="bip-mute" style="font-size:11px">探针在聊天页没读到会话：先点一次「刷新会话」；如果一直是 0，说明站点把会话列表挪到别处了——把这句话告诉我，我来适配。</div>':'')+
    '<div class="bip-row"><button class="bip-btn" data-bi="chat-batch-hide">按「隐藏词」规则隐藏</button>'+
    '<button class="bip-btn danger" data-bi="chat-batch-block">按「拉黑词」规则拉黑</button>'+
    '<button class="bip-btn" data-bi="chat-batch-del">删除已标记的聊天</button>'+
    '<button class="bip-btn" data-bi="chat-unhide-all">恢复全部隐藏</button></div>'+
    (chatQueue.running?('<div class="bip-note">⏳ '+esc(chatQueue.label)+'：'+chatQueue.done+' / '+chatQueue.total+'（成功 '+chatQueue.ok+' · 失败 '+chatQueue.fail+'）</div>'):'')+
    '<div class="bip-h">待处理<span class="bip-mute">命中规则、还没处置的会话（'+cc.pending+' 个）</span></div>'+
    chatListHtml(true)+
    '<div class="bip-h">全部会话<span class="bip-mute">共 '+cc.sessions+' 个 · 已处理 '+cc.handled+' 个 · 本地隐藏 '+cc.hidden+' 个</span></div>'+
    chatListHtml(false)+
    '<div class="bip-h">聊天处置词（两套 · 一行一条）</div>'+
    '<div class="bip-mute" style="font-size:11px">隐藏词 = 风险词（同一份词表，在上方「岗位风险词」里改）；命中给会话卡打标，可「一键隐藏标记卡片」或按「隐藏词」批量本地隐藏</div>'+
    '<div class="bip-mute" style="font-size:11px">拉黑词（→ 拉黑）</div><textarea id="biRuleBlock" style="height:72px">'+esc(chatRuleText('block'))+'</textarea>'+
    '<div class="bip-row"><button class="bip-btn" data-bi="chat-rules-save">保存规则</button>'+
    '<button class="bip-btn" data-bi="chat-rules-default">恢复默认词</button>'+
    '<span class="bip-mute">改完 0.8 秒也会自动保存</span></div>'+
    (ACTS.length?('<div class="bip-h">处置流水</div><div class="bip-list">'+ACTS.slice(0,8).map(x=>'<div><span class="bip-mute">'+new Date(x.ts).toLocaleTimeString('zh-CN',{hour12:false})+'</span> '+esc(x.kind)+' · '+esc(x.label||x.sid)+' · '+(x.ok?'<b style="color:#15803d">成功</b>':'<b style="color:#dc2626">失败</b>')+(x.msg?(' <span class="bip-mute">'+esc(x.msg)+'</span>'):'')+'</div>').join('')+'</div>'):'')+
    '<div class="bip-mute" style="font-size:11px">写操作边界：<b>不感兴趣</b>＝站内只标记（记录还在服务器）；<b>拉黑</b>＝可选连带删记录；<b>删</b>＝删会话+聊天记录。三者都<b>只在你点击时</b>执行，且受站点风控约束。</div>'+
  '</div></details>';
  html+='<details class="bip-fold"><summary>边界说明</summary><div class="bip-foldbody"><div class="bip-mute" style="font-size:11px">本脚本不碰站点接口、不替你操作：读的是监控脚本写在本机的镜像（`bw_insight_in`），结果写回 `bw_insight_out` 给监控面板展示。<br>· 聊天处置（隐藏/不感兴趣/拉黑/删除）只在你点击时执行，且只作用于你自己的账号<br>· 风险规则只做关键词打分，命中不等于事实，请自己核实</div></div></details>';
  u.body.innerHTML=html;
  biRestore(u.body,keep);
  const dot=u.root.querySelector('#biDot'); if(dot) dot.className='bip-dot'+((cc&&cc.sessions)?'':' off');   // v0.4.0：绿点=聊天页读到了会话
  const fab=u.root.querySelector('#biFab');
  if(fab) fab.title='聊天体检：会话 '+cc.sessions+' · 待处理 '+cc.pending+' · 已处理 '+cc.handled;
}
function togglePanel(force){
  const open=(typeof force==='boolean')?force:!(ui&&ui.open&&ui.panel&&ui.panel.style.display==='block');
  if(!buildUI()) return;
  ui.open=open;
  ui.panel.style.display=open?'block':'none';
  if(open){
    try{   // v0.5.5 自愈：存储位置越界（拖出屏幕/换小屏）就回默认位，不再「面板不见了」
      const r=ui.panel.getBoundingClientRect();
      if(r.left<-4||r.top<-4||r.right>window.innerWidth+4||r.bottom>window.innerHeight+4){
        localStorage.removeItem('bi_panelpos');
        ui.panel.style.left=''; ui.panel.style.top=''; ui.panel.style.right='18px'; ui.panel.style.bottom='210px';
      }
    }catch(e){}
    renderPanel();
  }
}
function openPanel(fold){
  try{
    if(!buildUI()) return;
    if(ui.panel.style.display!=='block') togglePanel(true); else renderPanel();
    if(fold==='rules'||fold==='ai'||fold==='status'){
      const folds=ui.body.querySelectorAll('details.bip-fold');
      const want=(fold==='rules')?0:((fold==='ai')?1:2);
      for(let i=0;i<folds.length;i++) folds[i].open=(i===want);
      if(folds[want]&&folds[want].scrollIntoView) folds[want].scrollIntoView({block:'nearest'});
    }
  }catch(e){}
}
// ===== 设置（油猴菜单 → 打开面板；面板建不起来时才退回 prompt/alert）=====
function askRules(){
  const cur=(S.riskWords||[]).join('\n');
  const v=prompt('风险关键词：一行一个（不再打分）\n例：培训费',cur);
  if(v===null) return;
  const words=cleanRuleLines(v);
  if(!words.length){ alert('至少保留一个风险关键词'); return; }
  S.riskWords=words; saveSettings(); rescanRisk(); alert('已保存 '+words.length+' 个风险关键词');
}
function showStatus(){
  const out=readOut(), inData=readIn();
  const riskN=Object.keys(out.risk||{}).length;
  
  const cc=chatCounts();
  alert('聊天体检 v'+VERSION+'\n\n· 风险关键词：'+(S.riskWords||[]).length+' 个 · 命中会话 '+cc.riskMarked+' 个\n· 体检计数：今日 '+cc.scanToday+' / 总 '+cc.scanTotal+'\n· 聊天会话：今日 '+cc.sessionsToday+' / 总 '+cc.sessions+'（待处理 '+cc.pending+' · 已处理 '+cc.handled+' · 本地隐藏 '+cc.hidden+'）\n· 处置规则：'+cc.rules+' 条');
}
function registerMenu(){
  if(typeof GM_registerMenuCommand!=='function') return;
  // v0.2.0：菜单 → 打开面板并定位到对应折叠区（原来直接 prompt，点完像没反应）
  const open=(fold)=>{ try{ openPanel(fold); }catch(e){ if(fold==='rules') askRules(); else showStatus(); } };
  GM_registerMenuCommand('⚙ 岗位体检设置（风险规则）',()=>open('rules'));
  GM_registerMenuCommand('🧹 聊天体检 / 一键处置（在聊天页用）',()=>open('chat'));
  GM_registerMenuCommand('ℹ️ 状态',()=>open('status'));
}
// ===== 启动：每 8 秒扫一次（只读本机镜像 + 必要时调一次 AI）=====
let biLastTick=0;
function tick(){
  if(now()-biLastTick<4000) return; biLastTick=now();
  try{ mergeChatArchive(); }catch(e){}
  try{ rescanRisk(); }catch(e){}
  // v0.5.7：「恢复全部隐藏」刚点过时，给一个 12 秒静默窗 ——
  // 这期间不跑 applyPageHide / syncRiskHidden。否则你点完「恢复」，下一轮 tick（≤8 秒）
  // 就会拿着同一份会话快照把卡片重新藏回去，看起来像按钮根本没用。
  try{
    if(biMuteHideUntil&&now()<biMuteHideUntil) return;
    if(biMuteHideUntil&&now()>=biMuteHideUntil){ biMuteHideUntil=0; applyPageHide(); }
  }catch(e){}
  // v0.5.6：镜像通道没数据时，给一次明确提示（只提示一次），避免用户以为风险体检在正常工作
  try{
    if(!chatMirrorHealthy()&&!tick._warnedMirror){
      tick._warnedMirror=1;
      biToast('未读到 boss-chat 的会话镜像：请先在聊天页打开一次「BOSS直聘·聊天助手」。在那之前「对方原话」为空，风险体检不会据此拉黑。');
    }
  }catch(e){}
  // v0.3.0：在聊天页每轮读一次会话列表（只读页面状态）+ 维持「本地隐藏」
  try{
    if(/\/chat|\/message/i.test(location.pathname)){ askChatProbe(); applyOpenedChat(); applyPageHide(); }
  }catch(e){}
  try{ if(ui&&ui.open&&ui.panel&&ui.panel.style.display==='block') renderPanel(); }catch(e){}   // v0.2.0：面板开着就跟着刷新
}
function boot(){
  if(typeof window==='undefined'||!window.document) return;
  try{ if(!/zhipin\.com/i.test(location.hostname)) return; }catch(e){ return; }
  registerMenu();
  // v0.2.0：悬浮球先挂上（面板按需打开）；body 还没就绪就等 DOMContentLoaded
  const ensureUi=()=>{ try{ buildUI(); renderPanel(); }catch(e){} };   // 顺带把卡片数字与悬浮球 title 填上
  if(document.body) ensureUi(); else { try{ document.addEventListener('DOMContentLoaded',ensureUi,{once:true}); }catch(e){} }
  try{ if(gget(K_SET,null)===null) saveSettings(); }catch(e){}          // 首次运行把默认规则落盘（方便外部读取/备份）
  try{ window.addEventListener('bw-insight-updated',()=>{ /* 监控脚本刷新由它自己处理 */ }); }catch(e){}
  try{ window.addEventListener('storage',(ev)=>{ if(ev&&ev.key===IN_KEY&&document.visibilityState!=='hidden') tick(); }); }catch(e){}
  // v0.3.0：接收页面世界探针回传的会话列表（只读）
  try{ window.addEventListener('message',onChatProbeData,false); }catch(e){}
  setTimeout(tick,1500);
  setInterval(()=>{ try{ if(document.visibilityState!=='hidden') tick(); }catch(e){} },8000);
  log('已启动 v'+VERSION);
}
boot();

if(typeof module!=='undefined'&&module.exports){
  module.exports={VERSION, DEFAULT_RULES, DEFAULT_RISK_WORDS, rescanRisk,
    loadSettings, scanRisk, readIn, readOut, IN_KEY, OUT_KEY,
    rulesToText, textToRules, buildUI, renderPanel, openPanel, biSnap, biRestore,
    // v0.3.0：聊天体检 + 一键处置
    DEFAULT_CHAT_RULES, chatRuleWords, chatRuleText, cleanRuleLines, matchWords, scanOneSession, scanChat, chatCounts,
    chatSessionList, isHiddenChat, sessionLabel, formEncode, actBudgetOk, actSpend, actCoolingDown, actLog, actPrecheck,
    actHide, actUnhide, actNotInterested, actBlock, actDeleteChat, batchHideByRules, batchBlockByRules, batchDeleteMarked,
    onChatProbeData, askChatProbe, chatListHtml, CHAT, HIDDEN, ACTS,
    // v0.3.1：详情页「对方消息」识别（按头像）
    biIsAvatarImg, biPickMessageArea, readOpenedChat, biMatchSessionByText, applyOpenedChat,
    get S(){ return S; }};   // v0.2.0：UI 也给测试用
}

})();
