// ==UserScript==
// @name         BOSS直聘 · 聊天助手（会话抓取 / 在线时间线 / 推进信号 / 复盘导出）
// @namespace    local.boss-chat
// @version      1.5.11
// @description  只在聊天页工作：抓取会话与消息（接口优先）、记录 HR 上下线时间、导出投递复盘数据（复盘CSV / 消息CSV / JSONL）。面板：会话列表带 24 格活跃条、可搜索、整行可点开。只读，不发消息。v1.4.8：修「面板定时/数据变化重绘时，展开的折叠区自己合上、正在填的输入被冲掉」——重绘前先记住展开状态/滚动位置/输入值与焦点，重绘后放回。v1.4.9：补齐 v1.4.8 快照的漏网之鱼——AI 判定设置里的接口地址/模型/每日上限/发送条数/字数/批量间隔 6 个输入框当时没加 id，遇到后台自动重绘（抓到新消息、每 12 秒兜底扫描）时仍会被冲掉，现补上 id 纳入快照/恢复。v1.5.3：修「AI 判定结果与 7 天缓存只写内存不落盘」——判定成功、解析失败、请求失败/超时、批量结束都补 save(['chats'])，刷新不再丢结果、不再次日把同一批聊天重复外发；修「会话搜索框每输一个字就失焦」——renderList 整块重写前先记住输入框焦点与光标位置，重写后放回；修「AI Key 输入框没 id、被后台自动重绘冲掉」——补 id 纳入 v1.4.8 快照/恢复；修「AI 判定送的是最后入库 10 条而非最近 10 条」——滚动加载更早历史后会判错，改为先按时间排序再取末尾；修「批量收录遇 HTTP 4xx/5xx、非风控错误码、网络超时仍把 60 个请求全发完」——补连续失败 2 次即停，与 AI 批量口径一致；修「DOM 兜底把 09-19 14:35 / 昨天 14:35 一律当今天」——时间正则只截时刻导致 parseClockTs 日期分支不可达；补 WebSocket 钩子缺的 OPEN / CONNECTING / CLOSING / CLOSED 构造器常量；另清理列表排序比较器重复全量扫描、回复窗口 O(n²) 查找、方向重判每次空转、ws 帧没真正入库也触发全量落盘等冗余。v1.5.4：推进信号三组（该我回/该催/有联系方式）从纯文字行改成三个带框卡片，框内会话可点击直接在页面左侧打开；会话列表去掉「首响」列（首响数据保留在复盘 CSV，不再占 UI）；点击委托从 tr[data-open] 扩到 [data-open]，框内会话也能点。v1.5.5：面板可拖动（按住标题栏拖，位置存本机 bc_panelpos，刷新还在；视口钳制防拖出屏幕）。v1.5.6：导出文件统一命名「日期时间-用途-脚本」（如 20260922-投递复盘-chat.csv）；导出折叠区分「给人看 / 给机器与备份」两组。v1.5.7：修「面板拖不动/拖一次像消失」——钳位按面板实际尺寸算、打开时越界自愈回默认位、悬浮球本身可拖（位置存 bc_fabpos）、拖动后不误触开关。v1.5.8（审核修复）：新增跨脚本镜像——把会话正文另写一份到 localStorage 的 bc_chats_mirror（同源共享，按最后消息时间保留最近 150 个会话 / 每个 40 条 / 总量 150 万字符封顶，配额不足时自动降级并清空镜像而不是写坏数据）。原先 boss-insight 用 GM 读 bc_chats 永远读到空，导致「对方原话」读不到、风险体检扫空数据；镜像通道补上后体检才真正生效。v1.5.9（审核修复）：修「CSV 公式注入」——导出聊天记录时，正文以 = + - @ 或制表符/回车开头的单元格会被 Excel/WPS 当成公式执行（对方完全可以在消息里发这样一句），现在统一加前导单引号转义。修「多标签页后写覆盖前写丢消息」——两个标签页同时开着聊天助手时，各自内存里只有自己看到的那部分会话，后保存的那个会把另一个刚收到的新消息整段盖掉；现在每次写盘前先读盘合并：同一会话按（我最近回复时间 / 最后消息时间 / 条数）取更新的那份，再按消息逐条求并集去重（上限 2000 条），meta 字段互补。v1.5.10：新增 GM 兼容适配层 —— 脚本不再只认篡改猴：篡改猴 / 暴力猴 / 脚本猫任选其一即可，甚至在完全没有脚本管理器时（把脚本直接注入页面）也能跑；缺的能力自动补齐（存储退化为 localStorage、同源请求改走 fetch、菜单退化为页面内 ⚙、样式退化为 style 标签；跨域 AI 功能仍需管理器）。装了管理器的用户行为与上一版完全一致 —— 适配层只补齐、不覆盖。新增「🔍 环境自检（兼容层）」菜单项，一眼看清当前跑在什么环境、哪些能力可用。v1.5.11：修「同一个页面出现两个 💬 悬浮球」—— UI 防重原来只要内存里有 ui 就直接返回，同页跑了两份脚本时两边各建一个；现在先查 DOM 里有没有 #bcRoot，有就复用它，绝不再建第二个。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/boss-zhipin-userscripts
// @supportURL   https://github.com/weishiji668/boss-zhipin-userscripts/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-chat.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-chat.user.js
// @match        https://www.zhipin.com/web/geek/chat*
// @match        https://www.zhipin.com/web/geek/message*
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
// ==/UserScript==

// ===== v1.4.2 变更说明（2026-09-20）=====
// T1 导出编码：BOM 只给 CSV（Excel 中文不乱码），JSON / JSONL / MD 保持纯净可解析
// T2 esc() 补引号转义（" → &quot;、' → &#39;），API Key 回显不再撑破 HTML 属性
// T4 每日额度按本地日期换日（原 toISOString 走 UTC，北京时间 08:00 才重置）
// T5 save() 防抖合并 + 分键写入（chats 单独节流）；关页 / 切后台强制落盘
// T6 去掉「收录当前会话 / 清理异常会话」重复按钮组（原渲染两组）
// T7 补齐 bc-note / bc-lv 样式（此前是裸样式）
// T8 双钩子统一去重（URL + 长度 + 内容前缀，2 秒窗口），避免重复捕获
// T9 调试样本（响应片段 / 原始会话条目）默认不写，改由「接口观察模式」控制
// T11 删除内部无调用的 uid / fmtTime / relDay
// T12 消息去重改 Map 索引（批量收录不再线性查找）
// T3/SC-2 Key 不再回填进面板 DOM（只显示状态 + 更换/清除入口，保存后立即清空输入框）
// T3/SC-3 文案口径修正（除 AI 判定外数据仅存本机；默认目的地为境内服务，不写跨境表述）；首次启用 AI 判定弹一次性确认；baseUrl 加可信地址提示
// T3/SC-1 Key 明文存储风险提示 + 「清除 Key」入口
// ===== v1.4.3 变更说明（2026-09-20，SC-4）=====
// SC-4a 发送前本地脱敏：手机号 / 身份证 / 邮箱 / 微信号 / QQ 掩码后再发给接口（本机数据不动）
// SC-4b 数据面缩减：默认只发最近 10 条 × 120 字（原 14 × 140），设置里可调（4–20 条 / 60–200 字）
// SC-4c 批量判定顺序化限流：逐个发送、间隔可配（默认 1.2 秒），连续失败 2 次自动停（原实现一次性并发发出）
// 边界不变：只读、不发消息；除 AI 判定（可选、默认关）外，数据只存本机
// ===== v1.4.8 变更说明（2026-09-20，用户反馈投递面板「点一下没一会就自动回退」——同一类毛病）=====
// B1 根因：面板开着的时候，抓到新数据 / 每 12 秒的 DOM 兜底扫描 / 批量 AI 判定都会走 scheduleRender → renderAll，
//    而 renderAll 是整块重写 #bcBody —— 你展开的折叠区会自己合上、滚动位置跳回顶部、正在填的输入（搜索框、AI 设置等）被冲掉。
// B2 修法：重绘前先快照「折叠区展开状态（按顺序）/ 面板滚动位置 / 输入框的值 / 焦点与光标」，重绘后原样放回。
//    面板照常自动刷新（条数、活跃条、状态点都会更新），只是不再动你正在看/正在填的东西。
// 边界不变：只读、不发消息；除 AI 判定（可选、默认关）外，数据只存本机
// ===== v1.4.4 修订说明（2026-09-20，交付后实测发现并修复）=====
// ① 脱敏顺序修正：身份证先于手机号——19xx 年出生的身份证中段会被手机号规则"咬"掉，只打 4 位码（实测发现）
// ② 脱敏宽容化：手机号 / 身份证容忍空格、点、横线等常见分隔写法与全角数字（"138 1234 5678" 原先完全漏打）
// ③ 匹配要求从非数字边界开始，防止长数字串中段被错位切分
// ④ 悬浮球上移（bottom 82px）：避免聊天页与「岗位监控」悬浮球完全重叠、下层点不到（联测发现）
// ⑤ 钩子状态行改写：主钩子就绪时不再把"沙箱兜底未启用"显示成故障
// ===== v1.4.5 修复说明（2026-09-20，用户实测反馈）=====
// ① 一键收录拉不到消息（面板显示"成功 N · 新增 0 条"）：批量请求是自己拼的 URL，
//    缺 securityId / page / src，服务端返回 code=0 的空列表。改为**回放页面自己的真实请求**
//    （打开会话时抓到的那条，含 securityId 令牌），只把游标 maxMsgId 归零、c 刷新。
// ② 收录结果区分「跳过」：没点开过的会话拿不到令牌，如实计入跳过并提示（原来一律记成功）
// ③ 连续 3 个无令牌会话确认拉不到后，其余无令牌会话不再发请求（少打接口、降低风控面）
// ④ 会话列表直接显示「对方活跃窗口」：该 HR 最早–最晚发消息的小时 + 条数（列表里拿不到别人的在线状态，这是最接近的可用信号）
// ===== v1.4.6 修订说明（2026-09-20，用户反馈「还是有问题」→ 拿真实存储数据逐项核对）=====
// ① 活跃的**每小时数字**直接写进列表（如 09点(2) 11点(7)）——v1.4.5 只给「窗口＋总数」，数字藏在悬停提示里，用户看不到
// ② 列表排序修正：原来按 meta.lastTime 排，而真实数据里该字段**全是空的**（会话列表接口不返回）→ 等于没排序；改按「最后一条消息时间」
// ③ 状态列去噪：bossFreezeStatus:0 / weixinVisible:0 / hasInterview:false 这类「0 / false」是接口默认值，不再显示（原来每行刷 4 个，把列表撑高一倍）
// ④ 收录「全是空列表」时给出提示：令牌可能已过期 → 刷新页面（Ctrl+Shift+R）再试
// ⑤ 令牌轮换修复：securityId 每次打开会话都会变（实测：同一会话两次捕获的令牌不同），而原来只在**第一次**记 msgUrl（if(url&&!s.msgUrl)）
//    → 回放的很可能是几天前的旧令牌。改为每次捕获都刷新（列表里「跳过」与「空列表」就此分开）

// ===== v1.4.7 UI 优化（2026-09-20，用户反馈「把 UI 界面也优化了」）=====
// ① 面板重排：工具（主操作）上移 → 会话列表（HR 上下线）→ 活跃时段 → 打招呼/跟进 → 导出/设置/AI/日志收进折叠区
//    原来导出按钮排在工具之前、日志压在最底下，看会话要滚很久；现在打开面板第一屏就是「一键收录 + 会话列表」
// ② 24 小时活跃直方图：24 行横条 → 一行竖柱（占高 约 500px → 约 120px），高峰柱自动高亮，鼠标停柱子看该小时条数
// ③ 会话列表每行新增「24 格活跃条」：左起 00 点 → 右到 23 点，亮格＝对方发过消息的小时（深色＝条数多）——一眼看作息
// ④ 会话列表整行可点：点行＝在页面左侧打开该会话（等价于你自己点它；定位不到就如实说明，不猜、不乱点页面上的按钮）
// ⑤ 会话列表加搜索框（公司 / HR / 岗位，实时过滤且输入框不失焦）+ 表头吸附 + 行悬停高亮 + 显示条数提示
// ⑥ 顶部状态点：钩子就绪＝绿点 / 未注入＝红点（原来要滚到底部看一行小字）；面板 560→660px，圆角/间距/字重统一
// 边界不变：只读、不发消息；除 AI 判定（可选、默认关）外，数据只存本机

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
const VERSION='1.5.11';
const K_CHATS='bc_chats', K_SETTINGS='bc_settings', K_LOGS='bc_logs', K_DIAG='bc_diag', K_CAP='bc_captured';
// v1.5.8：跨脚本镜像。GM 存储按脚本隔离，boss-insight 用 GM 读 bc_chats 永远读到空，
// 导致「对方原话」读不到、风险体检扫空数据。这里把会话正文另写一份到 localStorage（同源共享）。
const K_MIRROR='bc_chats_mirror', K_MIRROR_AT='bc_chats_mirror_at';
const MIRROR_MAX_SESSIONS=150, MIRROR_MAX_MSGS=40, MIRROR_MAX_CHARS=1500000;
let mirrorWrittenAt=0;
const DEFAULTS={ chat:{replyWindowHours:24, domFallback:false}, observe:false,
  ai:{on:false, baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'', maxPerDay:30, usedDate:'', usedToday:0, ackAt:0,
    msgCount:10, msgChars:120, batchGapMs:1200},
  rules:{
  } };
const store={chats:{},settings:{},logs:[],diag:{},captured:{}};

function now(){ return Date.now(); }
function gget(k,d){ try{ const v=GM_getValue(k); return v===undefined?d:v; }catch(e){ return d; } }
function gset(k,v){ try{ GM_setValue(k,v); }catch(e){} }
function loadStore(){
  store.chats=gget(K_CHATS,{})||{};
  store.settings=mergeDeep(DEFAULTS,gget(K_SETTINGS,{})||{});
  store.logs=Array.isArray(gget(K_LOGS,[]))?gget(K_LOGS,[]):[];
  store.diag=gget(K_DIAG,{})||{};
  store.captured=gget(K_CAP,{})||{};
  // 一次性迁移：从旧版（boss-watcher）镜像过来的会话数据
  try{
    if(!Object.keys(store.chats).length&&!gget('bc_migrated',false)){
      const raw=localStorage.getItem('bw_chats_export');
      if(raw){
        const o=JSON.parse(raw);
        if(o&&typeof o==='object'&&Object.keys(o).length){
          store.chats=o; gset('bc_migrated',true); save(['chats']);
          log('已从旧版导入 '+Object.keys(o).length+' 个会话');
        }
      }
    }
  }catch(e){}
  // v1.5.8：启动时如果还没写过镜像（或镜像为空）而本地已有会话，补写一次，
  // 免得用户先打开 boss-insight 时读到空镜像
  try{
    if(Object.keys(store.chats||{}).length){
      const cur=localStorage.getItem(K_MIRROR);
      if(!cur||cur==='{}'||cur==='null') writeMirror();
    }
  }catch(e){}
}
// 写入策略：防抖合并 + 分键写入。捕获热路径会连续触发 save()（15 处调用点），
// 之前每次都全量写 5 个键（chats 体积最大）；现在只写"脏键"，chats 另加节流，避免大对象被高频重写。
const KEY_OF={chats:K_CHATS,settings:K_SETTINGS,logs:K_LOGS,diag:K_DIAG,captured:K_CAP};
const ALL_KEYS=['chats','settings','logs','diag','captured'];
const SAVE_DEBOUNCE_MS=120, CHATS_THROTTLE_MS=500;
let saveTimer=null, saveDirty=null, chatsWrittenAt=0;
function writeMirror(){
  try{
    // 只带 insight 需要的字段，控制体积
    const out={};
    Object.keys(store.chats||{}).forEach(sid=>{
      const s=store.chats[sid]; if(!s) return;
      const ms=(s.messages||[]).slice(-MIRROR_MAX_MSGS).map(m=>({
        dir:m.dir==='me'?'me':'them', ts:toTs(m.ts)||0, text:String(m.text||'').slice(0,2000)
      })).filter(m=>m.text);
      const meta=s.meta||{};
      out[sid]={meta:{sessionId:meta.sessionId||sid, company:meta.company||'', boss:meta.boss||'', jobName:meta.jobName||''}, messages:ms};
    });
    let keys=Object.keys(out);
    // 按最后消息时间倒序保留最近的，避免把 localStorage 配额撑爆
    keys.sort((a,b)=>{
      const ta=(out[a].messages.slice(-1)[0]||{}).ts||0, tb=(out[b].messages.slice(-1)[0]||{}).ts||0;
      return tb-ta;
    });
    if(keys.length>MIRROR_MAX_SESSIONS) keys=keys.slice(0,MIRROR_MAX_SESSIONS);
    const slim={}; keys.forEach(k=>{ slim[k]=out[k]; });
    let body=JSON.stringify(slim);
    while(body.length>MIRROR_MAX_CHARS&&keys.length>20){ keys=keys.slice(0,Math.floor(keys.length*0.8)); const s2={}; keys.forEach(k=>{ s2[k]=slim[k]; }); body=JSON.stringify(s2); }
    try{
      localStorage.setItem(K_MIRROR,body);
      localStorage.setItem(K_MIRROR_AT,String(now()));
      mirrorWrittenAt=now();
    }catch(e){
      // 配额不足：清掉旧镜像再试一次；仍失败就把镜像留成空对象，并且**不写时间戳**——
      // 时间戳是 insight 判断「镜像通道在工作」的依据，写了会让它以为镜像正常却读到空数据。
      try{ localStorage.removeItem(K_MIRROR); localStorage.removeItem(K_MIRROR_AT); }catch(e2){}
      try{ localStorage.setItem(K_MIRROR,'{}'); localStorage.removeItem(K_MIRROR_AT); }catch(e3){}
    }
  }catch(e){}
}
function flushSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
  if(!saveDirty) return;
  const keys=Array.from(saveDirty); saveDirty=null;
  if(keys.indexOf('chats')>=0){ try{ mergeChatsFromDisk(); }catch(e){} }
  keys.forEach(k=>{ try{ gset(KEY_OF[k],store[k]); }catch(e){} });
  if(keys.indexOf('chats')>=0){
    chatsWrittenAt=now();
    if(now()-mirrorWrittenAt>1000) writeMirror();   // 镜像同样节流，别跟着热路径走
  }
}
// ===== v1.5.9：跨标签页写盘合并 =====
// 两个聊天标签页各自把整个 store.chats 写回 GM 存储 —— 后写的那个会把对方刚抓到的
// 会话/消息整段盖掉（你开两个聊天页时，其中一个的记录会莫名消失）。
// 写盘前先读盘、按会话/按消息做并集，再写回。判断「谁更新」的尺子（每会话独立）：
//   ① 最后一条消息的时间戳；② 我最后回复的时间（我的回复只可能来自我自己那个标签页）；
//   ③ 消息条数。三把尺子只要有一把变大，就保留本页版本；否则保留盘上版本。
// 注意：不合并 AI 判定结果 —— 同一条消息的判定在两边不会不同，按「谁新用谁」即可。
function lastMsgTs(s){
  try{
    const ms=(s&&s.messages)||[];
    for(let i=ms.length-1;i>=0;i--){ const t=toTs(ms[i].ts)||0; if(t) return t; }
  }catch(e){}
  return 0;
}
function noteMyReply(s,ts){
  if(!s||!ts) return;
  if(!s.meta) s.meta={};
  if(ts>(s.meta.myReplyAt||0)) s.meta.myReplyAt=ts;
}
function mergeChatsFromDisk(){
  let disk=null;
  try{ disk=gget(K_CHATS,null); }catch(e){}
  if(!disk||typeof disk!=='object') return;
  const ids={};
  Object.keys(disk).forEach(id=>{ ids[id]=1; });
  Object.keys(store.chats||{}).forEach(id=>{ ids[id]=1; });
  Object.keys(ids).forEach(sid=>{
    const mine=store.chats[sid], theirs=disk[sid];
    if(!mine){ store.chats[sid]=theirs; return; }     // 只存在盘上 → 收下
    if(!theirs) return;                                // 只存在本页 → 保留
    const kMine=lastMsgTs(mine), kTheirs=lastMsgTs(theirs);
    const mineWins=
      (mine.meta&&mine.meta.myReplyAt||0)>(theirs.meta&&theirs.meta.myReplyAt||0) ||
      kMine>kTheirs ||
      ((mine.messages||[]).length>(theirs.messages||[]).length&&kMine>=kTheirs);
    const win=mineWins?mine:theirs, lose=mineWins?theirs:mine;
    // 不是整段二选一，而是「胜者的顺序 + 败者独有的消息补进来」——
    // 两个标签页各自抓到过对方没有的消息时，一条都不丢
    const have={}, merged=[];
    (win.messages||[]).forEach(m=>{ const k=m&&m.mid; if(k&&have[k]) return; if(k) have[k]=1; merged.push(m); });
    (lose.messages||[]).forEach(m=>{ const k=m&&m.mid; if(!m||!k||have[k]) return; have[k]=1; merged.push(m); });
    merged.sort((a,b)=>((toTs(a&&a.ts)||0)-(toTs(b&&b.ts)||0)));
    if(merged.length>2000) merged=merged.slice(-2000);
    const mWin=Object.assign({},win.meta||{}), mLose=lose.meta||{};
    Object.keys(mLose).forEach(k=>{ if(!mWin[k]&&mLose[k]) mWin[k]=mLose[k]; });   // 元信息空字段互补
    store.chats[sid]=Object.assign({},lose,win,{messages:merged,meta:mWin});
  });
}
function save(keys){
  const want=keys?[].concat(keys):ALL_KEYS;
  saveDirty=saveDirty||new Set();
  want.forEach(k=>saveDirty.add(k));
  if(saveTimer) return;
  let delay=SAVE_DEBOUNCE_MS;
  if(saveDirty.has('chats')){
    const since=now()-chatsWrittenAt;
    if(since<CHATS_THROTTLE_MS) delay=CHATS_THROTTLE_MS-since;
  }
  saveTimer=setTimeout(flushSave,delay);
}
function log(msg){
  store.logs.unshift({ts:now(),msg:String(msg)});
  if(store.logs.length>50) store.logs.pop();
  save(['logs']);
  try{ console.log('[boss-chat]',msg); }catch(e){}
}
function mergeDeep(a,b){
  const o=Object.assign({},a);
  for(const k of Object.keys(b||{})){
    if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a&&a[k]&&typeof a[k]==='object') o[k]=mergeDeep(a[k],b[k]);
    else o[k]=b[k];
  }
  return o;
}
function pick(o,keys){ for(const k of keys){ const v=o&&o[k]; if(v!==undefined&&v!==null&&v!=='') return v; } return undefined; }
function findArr(o,depth){
  if(depth>3||o==null) return null;
  if(Array.isArray(o)) return o.length?o:null;
  if(typeof o==='object'){ for(const v of Object.values(o)){ const r=findArr(v,depth+1); if(r) return r; } }
  return null;
}
function toTs(v){
  if(v===null||v===undefined||v==='') return 0;
  if(typeof v==='number') return v<1e12?(v>1e9?v*1000:v):v;
  const s=String(v).trim();
  if(/^\d+$/.test(s)){ const n=Number(s); return n<1e12?(n>1e9?n*1000:n):n; }
  const d=new Date(s.replace(/-/g,'/'));
  return isNaN(d.getTime())?0:d.getTime();
}
function fmtTime(ts){
  const n=toTs(ts); if(!n) return '';
  const d=new Date(n), p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function tsFile(){
  const d=new Date();
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+
    String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
}
function csvEsc(v){
  let s=String(v==null?'':v);
  // v1.5.9：CSV 公式注入防护 —— HR 发来的消息以 = + - @ 或制表符/回车开头时，
  // Excel / WPS 打开会把整格当公式执行（=HYPERLINK(...) 这类是真实攻击面）。
  // 在值前加一个单引号，Excel 按文本显示、内容不变，导出文件本身也仍是合法 CSV。
  if(/^[=+\-@\t\r]/.test(s)) s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
// BOM 只给 CSV（Excel 打开中文不乱码）；JSON / JSONL / MD 保持纯净，否则解析器报错
function bomFor(mime){ return /^text\/csv/i.test(String(mime||''))?'\uFEFF':''; }
function payloadFor(text,mime){ return bomFor(mime)+String(text==null?'':text); }
function download(filename,text,mime){
  try{
    const type=mime||'text/plain';
    const blob=new Blob([payloadFor(text,type)],{type:type+';charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
  }catch(e){}
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function absUrl(u){ try{ return new URL(String(u||''),location.href).href; }catch(e){ return String(u||''); } }

// ===== 页面世界钩子（抓页面自己发的请求，不额外请求）=====
const API_HINTS=['friend/list','zpchat','zpim','message','chat/','session','msg'];
function isApiUrl(u){
  const s=absUrl(u);
  if(!/zhipin\.com/i.test(s)) return false;
  return API_HINTS.some(k=>s.toLowerCase().includes(k));
}
let mainHookReady=false;
// 统一去重（T8）：页面世界注入与沙箱钩子两条路径可能拿到同一条响应；
// 页面世界走 postMessage 回传，通常晚于沙箱钩子。用「URL+长度+内容前缀」做键，
// 同一条响应两条路径得到完全相同的键 → 只入库一次；不同响应（即使等长）不会被误杀。
const CAP_DEDUP_MS=2000;
const recentCaps=new Map();
function capKeyOf(u,body){
  const s=String(body||'');
  return String(u||'')+'|'+s.length+'|'+s.slice(0,512);
}
function capSeenRecently(capKey){
  const t=now();
  const prev=recentCaps.get(capKey);
  if(prev!==undefined&&(t-prev)<CAP_DEDUP_MS) return true;
  recentCaps.set(capKey,t);
  if(recentCaps.size>200) Array.from(recentCaps.keys()).slice(0,100).forEach(k=>recentCaps.delete(k));
  return false;
}
function pageWin(){ try{ return (typeof unsafeWindow!=='undefined'&&unsafeWindow)?unsafeWindow:window; }catch(e){ return window; } }
function mainHookSource(){
  return '('+function(){
    try{
      var W=window;
      if(W.__bcMainHooked){ W.postMessage({__bcReady:1,again:1},'*'); return; }
      W.__bcMainHooked=1;
      var stat={fetch:0,xhr:0,api:0}, lastTick=0;
      function abs(u){ try{ return new URL(u,location.href).href; }catch(e){ return String(u||''); } }
      function isApi(u){ return !!u&&/zhipin\.com/i.test(u)&&/(friend\/list|zpchat|zpim|message|chat\/|session|msg)/i.test(u); }
      function post(m){ try{ W.postMessage(m,'*'); }catch(e){} }
      function tick(){ var t=Date.now(); if(t-lastTick<1500) return; lastTick=t; post({__bcStat:stat}); }
      function report(u,b,k){ stat.api++; post({__bcCap:1,url:u,body:b,kind:k}); tick(); }
      var of=W.fetch;
      if(typeof of==='function'){
        W.fetch=function(input,init){
          var reqUrl=abs((typeof input==='string')?input:(input&&input.url)||'');
          stat.fetch++;
          var p=of.apply(this,arguments);
          try{
            if(isApi(reqUrl)) p.then(function(res){
              try{ var ru=res.url||reqUrl; if(isApi(ru)) res.clone().text().then(function(t){ report(ru,t,'fetch'); },function(){}); }catch(e){}
            },function(){});
          }catch(e){}
          tick();
          return p;
        };
      }
      var X=W.XMLHttpRequest;
      if(X&&X.prototype){
        var oOpen=X.prototype.open, oSend=X.prototype.send;
        X.prototype.open=function(m,u){ try{ this.__bcUrl=abs((typeof u==='string')?u:(u&&u.url)||''); }catch(e){} return oOpen.apply(this,arguments); };
        X.prototype.send=function(){
          var self=this; stat.xhr++;
          try{
            self.addEventListener('load',function(){
              try{
                var u=self.__bcUrl||'';
                if(!isApi(u)) return;
                var t=null;
                if(self.responseType===''||self.responseType==='text') t=self.responseText;
                else if(self.responseType==='json'&&self.response) t=JSON.stringify(self.response);
                if(t) report(u,t,'xhr');
              }catch(e){}
            });
          }catch(e){}
          var r=oSend.apply(this,arguments); tick(); return r;
        };
      }
      post({__bcReady:1});
      // WebSocket 也抓：BOSS 聊天有部分是走 ws 推送的（会话列表/新消息）
      try{
        var OW=W.WebSocket;
        if(OW&&!W.__bcWsHooked){
          W.__bcWsHooked=1;
          W.WebSocket=function(url,protocols){
            var ws=new OW(url,protocols);
            try{
              ws.addEventListener('message',function(ev){
                try{
                  var d=ev&&ev.data;
                  if(typeof d!=='string') return;
                  if(d.length>200000) return;
                  post({__bcWs:1,url:String(url).slice(0,80),data:d.slice(0,20000)});
                }catch(e){}
              });
            }catch(e){}
            return ws;
          };
          W.WebSocket.prototype=OW.prototype;
          try{ W.WebSocket.CONNECTING=OW.CONNECTING; W.WebSocket.OPEN=OW.OPEN; W.WebSocket.CLOSING=OW.CLOSING; W.WebSocket.CLOSED=OW.CLOSED; }catch(e){}
        }
      }catch(e){}
    }catch(e){ try{ window.postMessage({__bcErr:String((e&&e.message)||e)},'*'); }catch(_){} }
  }.toString()+')();';
}
function injectMainHook(){
  try{
    const d=document;
    if(!d||!d.documentElement) return false;
    if(d.documentElement.getAttribute('data-bc-main')) return true;
    const s=d.createElement('script');
    s.textContent=mainHookSource();
    d.documentElement.appendChild(s);
    s.remove();
    d.documentElement.setAttribute('data-bc-main','1');
    return true;
  }catch(e){ return false; }
}
function saveDiag(extra){
  store.diag=Object.assign({},store.diag,{ver:VERSION,at:now(),ready:mainHookReady,captured:Object.keys(store.captured||{}).length},extra||{});
  gset(K_DIAG,store.diag);
}
function onPageMessage(ev){
  const d=ev&&ev.data;
  if(!d||typeof d!=='object') return;
  if(d.__bcReady){ mainHookReady=true; saveDiag({main:1,mainAt:now()}); scheduleRender(); return; }
  if(d.__bcStat){ saveDiag({seen:d.__bcStat,seenAt:now()}); return; }
  if(d.__bcErr){ saveDiag({mainErr:String(d.__bcErr).slice(0,200)}); return; }
  if(d.__bcWs){
    // WebSocket 推送：先留样本，能从里面认出会话/消息就顺手入库
    try{
      store.diag.wsSamples=store.diag.wsSamples||{};
      const k=String(d.url||'ws');
      if(!store.diag.wsSamples[k]) store.diag.wsSamples[k]=String(d.data||'').slice(0,800);
      ingestWsData(d.data);
    }catch(e){}
    return;
  }
  if(d.__bcCap){ maybeStoreResponse(d.url,d.url,d.body,'page:'+(d.kind||'')); }
}
function hookStatus(){
  const W=pageWin();
  let f=false,x=false;
  try{ f=!!(W&&W.__bcFetchHooked); }catch(e){}
  try{ x=!!(W&&W.__bcXhrHooked); }catch(e){}
  return {fetch:f,xhr:x,captured:Object.keys(store.captured||{}).length};
}
function hookFetch(){
  const W=pageWin();
  if(!W||W.__bcFetchHooked||typeof W.fetch!=='function') return false;
  W.__bcFetchHooked=true;
  const orig=W.fetch.bind(W);
  W.fetch=function(input,init){
    const reqUrl=absUrl(typeof input==='string'?input:(input&&input.url)||'');
    const p=orig.apply(this,arguments);
    if(isApiUrl(reqUrl)) p.then(res=>{ try{ const ru=res.url||reqUrl; if(isApiUrl(ru)) res.clone().text().then(t=>maybeStoreResponse(reqUrl,ru,t,'fetch')).catch(()=>{}); }catch(e){} }).catch(()=>{});
    return p;
  };
  return true;
}
function hookXHR(){
  const W=pageWin();
  if(!W||W.__bcXhrHooked) return false;
  const XHR=W.XMLHttpRequest;
  if(!XHR||!XHR.prototype) return false;
  W.__bcXhrHooked=true;
  const oOpen=XHR.prototype.open, oSend=XHR.prototype.send;
  XHR.prototype.open=function(m,u){ this.__bcUrl=absUrl((typeof u==='string')?u:(u&&u.url)||''); return oOpen.apply(this,arguments); };
  XHR.prototype.send=function(){
    this.addEventListener('load',function(){
      try{
        const u=this.__bcUrl||'';
        if(!isApiUrl(u)) return;
        let t=null;
        if(this.responseType===''||this.responseType==='text') t=this.responseText;
        else if(this.responseType==='json'&&this.response) t=JSON.stringify(this.response);
        if(t) maybeStoreResponse(u,u,t,'xhr');
      }catch(e){}
    });
    return oSend.apply(this,arguments);
  };
  return true;
}

// ===== 数据加工 =====
function pathOf(u){ try{ return new URL(absUrl(u)).pathname; }catch(e){ return String(u||''); } }
function classify(u,obj){
  if(!/msg|message|chat|im\/|session|friend|zpchat/i.test(u)) return null;
  const arr=findArr(obj,0);
  if(arr&&arr.length){
    const f=arr[0]||{};
    if(f.content!==undefined||f.msgId!==undefined||f.messageId!==undefined||f.msgContent!==undefined) return 'chatMessages';
    if(f.friendId!==undefined||f.brandName!==undefined||f.lastMsg!==undefined||f.bossName!==undefined) return 'chatList';
  }
  return /msg|message/i.test(u)?'chatMessages':'chatList';
}
function maybeStoreResponse(reqUrl,resUrl,body,source){
  if(!body||body.length>2000000) return;
  let obj=null;
  try{ obj=JSON.parse(body); }catch(e){ return; }
  if(!obj||typeof obj!=='object') return;
  const u=resUrl||reqUrl||'';
  const capKey=capKeyOf(u,body);
  if(capSeenRecently(capKey)) return;
  const p=pathOf(u);
  const type=classify(u,obj);
  const c=store.captured[p]||(store.captured[p]={url:u,type:type||'?',first:now(),count:0,last:now()});
  c.count++; c.last=now();
  // 调试用：留一份响应样本（截断）——默认不写，只在「接口观察模式」开启时留（T9）
  if(store.settings.observe){ try{
    store.diag.samples=store.diag.samples||{};
    store.diag.samples[(type||'?')+' '+p]=body.slice(0,1500);
    const ks=Object.keys(store.diag.samples);
    if(ks.length>12) delete store.diag.samples[ks[0]];
  }catch(e){} }
  if(store.settings.observe){ try{ console.log('[boss-chat]',type||'unknown',u); }catch(e){} }
  if(type==='chatList') processChatList(obj,u);
  else if(type==='chatMessages') processMessages(obj,sessionIdFromUrl(u),u);
  save(['chats','captured','diag']);
  scheduleRender();
}
function sessionIdFromUrl(u){
  const s=String(u||'');
  let m=s.match(/[?&]bossId=([^&]+)/); if(m) return m[1];
  m=s.match(/[?&]encryptBossId=([^&]+)/); if(m) return m[1];
  m=s.match(/[?&]friendId=([^&]+)/); if(m) return m[1];
  m=s.match(/[?&]encryptFriendId=([^&]+)/); if(m) return m[1];
  m=s.match(/[?&]sid=([^&]+)/); if(m) return m[1];
  m=s.match(/[?&]uid=([^&]+)/); if(m) return m[1];
  return '';
}
// 真实请求里的 securityId 令牌（页面打开会话时自己带的）——批量收录必须带上，否则服务端返回空列表
function secIdFromUrl(u){
  const m=String(u||'').match(/[?&]securityId=([^&]+)/);
  return m?decodeURIComponent(m[1]):'';
}
// 为某个会话拼「拉历史消息」的 URL：优先回放页面自己的真实请求（含 securityId / page / src）
function historyUrlFor(sid){
  const s=store.chats[sid]||{};
  const meta=s.meta||{};
  const recorded=String(s.msgUrl||'');
  const sec=String(meta.securityId||'')||secIdFromUrl(recorded);
  let u=recorded;
  if(u){
    u=u.replace(/([?&])maxMsgId=[^&]*/,'$1maxMsgId=0');
    if(!/[?&]maxMsgId=/.test(u)) u+=(u.indexOf('?')>=0?'&':'?')+'maxMsgId=0';
    u=u.replace(/([?&])c=[^&]*/,'$1c=20');
  }else{
    u='https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId='+encodeURIComponent(sid)+'&maxMsgId=0&c=20&page=1&src=0';
  }
  if(sec&&!/[?&]securityId=/.test(u)) u+='&securityId='+encodeURIComponent(sec);
  return {url:u, token:!!sec||/[?&]securityId=/.test(u)};
}
function processChatList(obj,url){
  const urlSid=sessionIdFromUrl(url||'');
  // 1) 单对象结构优先：getBossData / geekEnter 的 zpData.data 里带 companyName / encryptBossId
  //    （这类响应里往往还有别的数组，所以不能"先找数组"——之前就是这里把公司名弄丢了）
  const d0=obj&&obj.zpData&&(obj.zpData.data||obj.zpData);
  if(d0&&typeof d0==='object'&&!Array.isArray(d0)&&(d0.encryptBossId||d0.companyName||d0.bossId)){
    upsertChatMeta(d0,urlSid);
  }
  // 2) 列表结构：会话列表 / 群组列表
  const arr=findArr(obj,0);
  if(Array.isArray(arr)) arr.forEach(it=>upsertChatMeta(it,urlSid));
  save(['chats']);
}
// WebSocket 推送的数据：是 JSON（会话列表/新消息）就认出来入库；不是（如 protobuf）就只留样本
function ingestWsData(raw){
  try{
    if(!raw||typeof raw!=='string') return 0;
    let obj=null;
    try{ obj=JSON.parse(raw); }catch(e){ return 0; }
    if(!obj||typeof obj!=='object') return 0;
    let n=0;
    const arr=findArr(obj,0);
    if(Array.isArray(arr)) arr.forEach(it=>{ if(upsertChatMeta(it,'')) n++; });
    const d=obj.zpData&&(obj.zpData.data||obj.zpData);
    if(d&&typeof d==='object'&&!Array.isArray(d)&&(d.encryptBossId||d.companyName)){ if(upsertChatMeta(d,'')) n++; }
    if(n) save(['chats']);
    return n;
  }catch(e){ return 0; }
}
function upsertChatMeta(it,urlSid){
  try{
    if(!it||typeof it!=='object'||Array.isArray(it)) return false;
    const sid=String(pick(it,['encryptBossId','bossId','friendId','encryptFriendId','sessionId','uid'])||urlSid||'');
    if(!sid) return false;
    const s=store.chats[sid]||(store.chats[sid]={meta:{sessionId:sid},messages:[]});
    const company=pick(it,['companyName','brandName']); if(company&&!s.meta.company) s.meta.company=String(company);
    const boss=pick(it,['name','bossName','bossTitle']); if(boss&&!s.meta.boss) s.meta.boss=String(boss);
    const bid=pick(it,['bossId']); if(bid!==undefined&&bid!==null&&!s.meta.bossId) s.meta.bossId=String(bid);   // 数字 uid，判方向要用
    if(s.meta.bossId&&!s.meta.bossUid) s.meta.bossUid=String(s.meta.bossId);
    const jid=pick(it,['encryptJobId','jobId']); if(jid&&!s.meta.jobId) s.meta.jobId=String(jid);
    const job=pick(it,['jobName','title','positionName']); if(job&&!s.meta.jobName) s.meta.jobName=String(job);
    const lt=pick(it,['lastMsgTime','lastMessageTime','lastTime']); if(lt) s.meta.lastTime=lt;
    const un=pick(it,['unreadCount','unread']); if(un!==undefined) s.meta.unread=Number(un)||0;
    const sec=pick(it,['securityId','secId']); if(sec&&s.meta.securityId!==String(sec)){ s.meta.securityId=String(sec); s.meta.securityIdAt=now(); }
    // 站点自己的状态位（未读/新招呼/仅沟通/有交换/有面试/不感兴趣…）字段名不确定，先按名字扫一遍
    try{
      const flags=s.meta.flags||{};
      Object.keys(it).forEach(k=>{
        if(!/read|unread|exchange|interview|interest|greet|reply|deliver|contact|weixin|wechat|phone|resume|stage|status|label|tag/i.test(k)) return;
        const v=it[k];
        if(v===null||v===undefined||v==='') return;
        if(typeof v==='object') return;
        flags[k]=v;
      });
      if(Object.keys(flags).length) s.meta.flags=flags;
      // 调试：留一条原始会话样本（截断）——默认不写，只在「接口观察模式」开启时留（T9）
      if(store.settings.observe){
        store.diag.items=store.diag.items||{};
        if(Object.keys(store.diag.items).length<6&&!store.diag.items[sid]){
          store.diag.items[sid]=JSON.stringify(it).slice(0,700);
        }
      }
    }catch(e){}
    noteHrStatus(s,hrStatusFromItem(it));
    reclassifyDirs(s);
    return true;
  }catch(e){ return false; }
}
function cleanMsgText(s){
  let t=String(s||'').replace(/\s+/g,' ').trim();
  t=t.replace(/^(已读|未读|送达|已送达|发送中|已发送|对方已读)\s*/,'');
  t=t.replace(/\s*(已读|未读|送达|已送达|发送中|已发送)$/,'');
  t=t.replace(/^\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*/,'');
  t=t.replace(/^\d{1,2}:\d{2}\s*/,'').replace(/\s*\d{1,2}:\d{2}$/,'');
  return t.trim();
}
function isSystemMsg(s){
  const t=String(s||'').trim();
  if(!t) return true;
  return /我想要一份您的?附件简历|是否同意\s*拒绝\s*同意|拒绝\s*同意|交换微信|交换电话|对方已读|撤回了一条消息|以上是打招呼的内容|您正在与|已向对方发送|系统消息|点击查看|该职位已关闭/.test(t);
}
// 方向判定：bossUid/myUid 都是数字 uid；会话 key 是 encryptBossId，两者不能直接比
function isBossSender(s,fromUid,sid){
  const myUid=String((s.meta&&s.meta.myUid)||'');
  const bossUid=String((s.meta&&s.meta.bossUid)||(s.meta&&s.meta.bossId)||'');
  if(!fromUid) return false;
  if(myUid) return String(fromUid)!==myUid;
  if(bossUid) return String(fromUid)===bossUid;
  return String(fromUid)===String(sid||'');
}
// 学到 uid 之后，用每条消息记下的 from.uid 重判方向（顺带修老数据）
function reclassifyDirs(s){
  try{
    if(!s||!s.meta||!Array.isArray(s.messages)) return 0;
    const myUid=String(s.meta.myUid||'');
    const bossUid=String(s.meta.bossUid||s.meta.bossId||'');
    if(!myUid&&!bossUid) return 0;
    const sig=myUid+'|'+bossUid+'|'+s.messages.length;
    if(s.meta._dirSig===sig) return 0;
    let fixed=0;
    s.messages.forEach(m=>{
      if(!m||!m.u) return;
      const u=String(m.u);
      const want=(myUid&&u===myUid)?'me':((bossUid&&u===bossUid)?'them':null);
      if(want&&m.dir!==want){ m.dir=want; fixed++; }
    });
    s.meta._dirSig=sig;
    return fixed;
  }catch(e){ return 0; }
}
function processMessages(obj,sidHint,url){
  const arr=findArr(obj,0); if(!arr) return;
  let sid=sidHint;
  if(!sid){ const it=arr[0]||{}; sid=String(pick(it,['bossId','encryptBossId','friendId','encryptFriendId','sessionId','uid'])||''); }
  if(!sid) sid='unknown';
  const s=store.chats[sid]||(store.chats[sid]={meta:{sessionId:sid},messages:[]});
  if(url){ s.msgUrl=url; s.msgUrlAt=now(); }   // securityId 会轮换（同一会话每次加载都不同）→ 每次都刷新，别拿几天前的旧令牌去回放
  const sec=secIdFromUrl(url); if(sec&&s.meta.securityId!==sec){ s.meta.securityId=sec; s.meta.securityIdAt=now(); }
  // 去重索引：mid → 消息对象。批量收录时线性 find 是 O(n²)，改 Map 一次建索引
  const byMid=new Map();
  s.messages.forEach(m=>{ if(m&&m.mid!==undefined&&!byMid.has(m.mid)) byMid.set(m.mid,m); });
  arr.forEach(m=>{
    if(!m||typeof m!=='object') return;
    // BOSS 真实结构：文本在 body.text；方向看 from.uid / to.uid；时间在 time
    const body=m.body||{};
    const fromUid=String((m.from&&m.from.uid)||'');
    const toUid=String((m.to&&m.to.uid)||'');
    const jd=body.jobDesc;
    // 职位卡片里直接带双方数字 uid（boss.uid=对方 / geek.uid=我）→ 最可靠，优先采信
    if(jd&&jd.boss&&jd.boss.uid&&!s.meta.bossUid) s.meta.bossUid=String(jd.boss.uid);
    if(jd&&jd.geek&&jd.geek.uid&&!s.meta.myUid) s.meta.myUid=String(jd.geek.uid);
    // 其次：模板招呼那条一定是我发的 → 反推我的 uid
    if(fromUid&&!s.meta.myUid&&/我对您发布的职位非常感兴趣|希望能加入贵公司|我对贵司岗位/.test(String(body.text||''))){
      s.meta.myUid=fromUid;
    }
    // 再次：对方发来的那条，收件人(to)就是我
    if(toUid&&fromUid&&!s.meta.myUid&&String(s.meta.bossUid||'')===fromUid) s.meta.myUid=toUid;
    if(fromUid&&s.meta.myUid&&fromUid!==s.meta.myUid&&!s.meta.bossUid) s.meta.bossUid=fromUid;
    const isBossMsg=isBossSender(s,fromUid,sid);
    if(m.from&&m.from.name&&isBossMsg&&!s.meta.boss) s.meta.boss=String(m.from.name);       // 对方(HR)的名字
    // 职位卡片顺带补全岗位信息（薪资是接口明文，不受字体反爬影响）
    if(jd){
      if(!s.meta.jobName) s.meta.jobName=String(jd.jobName||jd.positionName||jd.title||'');
      if(!s.meta.salary&&jd.salary) s.meta.salary=String(jd.salary);
      if(!s.meta.company&&jd.company) s.meta.company=String(jd.company);
    }
    const mid=String(pick(m,['mid','msgId','messageId'])||'');
    let rawText=pick(m,['content','msgContent','text'])||body.text||'';
    if(!rawText&&jd) rawText='';                                                            // 职位卡片：没有对话文本，跳过
    const text=cleanMsgText(rawText);
    if(!text||isSystemMsg(text)) return;
    const ts=pick(m,['time','createTime','msgTime','timestamp'])||'';
    const key=mid||(sid+'_'+String(ts)+'_'+text.slice(0,10));
    const old=byMid.get(key);
    if(old){ if(fromUid&&old.u!==fromUid){ old.u=fromUid; s.meta._dirSig=''; } return; }   // 老数据补 fromUid，方向交给 reclassifyDirs 统一重判
    const fromMe=fromUid?!isBossMsg:!!(pick(m,['fromMe','isMyself','mine','isSelf','isMine'])||m.senderType===1||m.direction==='send');
    const rec={mid:key,dir:fromMe?'me':'them',ts,text,u:fromUid};
    s.messages.push(rec); byMid.set(key,rec);
    if(s.messages.length>2000) s.messages.shift();
    if(fromMe) noteMyReply(s,toTs(ts)||now());   // v1.5.9：记下「我回过」的时间，供跨标签页合并判胜负
  });
  reclassifyDirs(s);
  save(['chats']);
}
// HR 上下线：列表里看不到别人的在线状态，只有当前打开的会话有 → 定时记录状态变化与"最近在线"
function hrStatusFromItem(it){
  const v=pick(it,['bossOnline','bossActiveStatus','activeStatus','onlineStatus','activeTime','lastActiveTime','bossActive']);
  if(v===undefined||v===null||v==='') return '';
  const s=String(v).trim();
  if(/^(true|1)$/i.test(s)) return '在线';
  if(/^(false|0)$/i.test(s)) return '离线';
  return s.slice(0,24);
}
function noteHrStatus(s,status){
  if(!s||!status) return;
  const t=now();
  // v1.5.1：记「上线 / 下线」的具体时间（状态切换时记一次；只有你点开着的会话能拿到在线状态）
  const online=/在线/.test(status);
  if(online){
    s.meta.hrLastOnlineAt=t;
    if(!s.meta.onlineNow){ s.meta.onlineNow=1; s.meta.onlineAt=t; }
  }else if(s.meta.onlineNow){ s.meta.onlineNow=0; s.meta.offlineAt=t; }
  if(s.meta.hrStatus===status){ s.meta.hrStatusAt=t; return; }
  s.meta.hrStatus=String(status).slice(0,24);
  s.meta.hrStatusAt=t;
  s.meta.hrLog=s.meta.hrLog||[];
  s.meta.hrLog.unshift({ts:t,status:s.meta.hrStatus});
  if(s.meta.hrLog.length>50) s.meta.hrLog.pop();
}

// v1.5.1：在线时间线文本 —— 上线/下线都是「脚本亲眼看到的那一刻」，不是站点给的精确时间
function onlineText(s){
  const m=(s&&s.meta)||{};
  const f=t=>{ try{ const d=new Date(t); const today=new Date(); const same=d.toDateString()===today.toDateString();
    return (same?'':((d.getMonth()+1)+'-'+d.getDate()+' '))+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }catch(e){ return ''; } };
  if(!m.onlineAt&&!m.offlineAt) return '';
  const up=m.onlineAt?('上线 '+f(m.onlineAt)):'';
  const down=m.onlineNow?((up?' · ':'')+'在线中'):(m.offlineAt?((up?' · ':'')+'下线 '+f(m.offlineAt)):'');
  return up+down;
}
// v1.5.1：推进信号（对方消息里的关键词）—— 面试/到岗/薪资/简历/联系方式…
const PROGRESS_WORDS=['面试','到岗','入职','试岗','薪资','待遇','简历','微信','电话','邮箱','offer'];
const CONTACT_WORDS=['微信','电话','手机','邮箱','加我','联系方式'];
function progressOf(s){
  const hits=[]; let contact=false;
  ((s&&s.messages)||[]).forEach(m=>{
    if(!m||m.dir!=='them') return;
    const t=String(m.text||'');
    PROGRESS_WORDS.forEach(w=>{ if(t.indexOf(w)>=0&&hits.indexOf(w)<0) hits.push(w); });
    if(CONTACT_WORDS.some(w=>t.indexOf(w)>=0)) contact=true;
  });
  return {hits,contact};
}
// 三组待办：该我回 / 该催 / 有联系方式
function progressGroups(sessions){
  const mine=[], push=[], contact=[];
  (sessions||[]).forEach(s=>{
    const msgs=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts));
    const last=msgs[msgs.length-1];
    const p=progressOf(s);
    if(p.contact) contact.push({s,p});
    if(last&&last.dir==='them') mine.push(s);
    if(last&&last.dir==='me'&&now()-toTs(last.ts)>2*24*3600*1000) push.push(s);
  });
  return {mine,push,contact};
}
// v1.5.4：推进信号三组「带框」展示（框内会话可点击打开）
function sigBox(title,desc,items,tone){
  let body='';
  if(!items.length) body='<div class="bc-sigempty">暂无</div>';
  else body=items.slice(0,12).map(function(it){ return '<div class="bc-sigitem" data-open="'+esc(it.k)+'" title="点击在页面左侧打开该会话"><b>'+esc(it.label)+'</b>'+(it.sub?'<span class="bc-muted">'+esc(it.sub)+'</span>':'')+'</div>'; }).join('');
  return '<div class="bc-sigbox bc-sig-'+tone+'"><div class="bc-sighead">'+title+'<b>'+items.length+'</b></div><div class="bc-sigdesc">'+desc+'</div><div class="bc-sigbody">'+body+'</div></div>';
}

// ===== 统计 =====
function firstReplyMinutes(s){
  const msgs=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts));
  const my=msgs.find(m=>m.dir==='me'); if(!my) return null;
  const t0=toTs(my.ts);
  const th=msgs.find(m=>m.dir==='them'&&toTs(m.ts)>t0);
  if(!th) return null;
  return Math.round((toTs(th.ts)-t0)/60000);
}
// 对方（HR）活跃时段：用对方发来的消息时间分布倒推——列表接口不提供别人的在线状态，这是最接近的可用信号
function activeHoursOf(s){
  const hist=new Array(24).fill(0);
  let total=0;
  ((s&&s.messages)||[]).forEach(m=>{
    if(!m||m.dir!=='them') return;
    const t=toTs(m.ts); if(!t) return;
    hist[new Date(t).getHours()]++; total++;
  });
  const hits=[];
  hist.forEach((n,i)=>{ if(n) hits.push([i,n]); });   // [小时, 条数]，按小时升序
  return {hist,hits,total,first:hits.length?hits[0][0]:null,last:hits.length?hits[hits.length-1][0]:null};
}
// 紧凑文本：按次数从高到低，最多 max 个（默认 3），如 "17点(8) 11点(7)"；hits 为全部命中小时
function activeHoursText(s,max){
  const a=activeHoursOf(s);
  const hits=a.hits;
  const byCount=hits.slice().sort((x,y)=>y[1]-x[1]||x[0]-y[0]);
  const lim=max||3;
  return {text:byCount.slice(0,lim).map(it=>String(it[0]).padStart(2,'0')+'点('+it[1]+')').join(' '), hits, total:a.total, top:byCount[0]?byCount[0][0]:null};
}
// 上下线窗口：该 HR 最早/最晚发过消息的小时（同一小时则只显示一个），如 "09–18点"；没有对方消息时返回空串
function activeWindowText(s){
  const a=activeHoursOf(s);
  const p=h=>String(h).padStart(2,'0');
  const text=a.first===null?'':(a.first===a.last?(p(a.first)+'点'):(p(a.first)+'–'+p(a.last)+'点'));
  return {text, first:a.first, last:a.last, total:a.total, hits:a.hits};
}
// 会话「最后活动时间」：取最后一条消息的时间（没有消息时回退 meta.lastTime）——列表排序用
function lastActiveTs(s){
  let t=0;
  ((s&&s.messages)||[]).forEach(m=>{ const v=toTs(m&&m.ts); if(v>t) t=v; });
  return t||toTs((s&&s.meta&&s.meta.lastTime)||'')||0;
}

// 相对时间：最后活动列用（不引第三方库）
function relTime(ts){
  if(!ts) return '';
  const d=Date.now()-ts;
  if(d<0) return '刚刚';
  if(d<60000) return '刚刚';
  if(d<3600000) return Math.round(d/60000)+' 分钟前';
  if(d<86400000) return Math.round(d/3600000)+' 小时前';
  const dd=Math.round(d/86400000);
  return dd<30?(dd+' 天前'):new Date(ts).toLocaleDateString('zh-CN');
}
function hourlyHistogram(sessions){
  const h=new Array(24).fill(0);
  sessions.forEach(s=>(s.messages||[]).forEach(m=>{
    if(m.dir!=='them') return;
    const t=toTs(m.ts); if(!t) return;
    h[new Date(t).getHours()]++;
  }));
  return h;
}
function clusterMessages(sessions,replyWindowMs){
  const win=replyWindowMs||24*3600*1000;
  const bySid=new Map();
  sessions.forEach(s=>{
    const msgs=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts));
    msgs.forEach((m,i)=>{
      if(m.dir!=='me'||!m.text) return;
      const key=String(m.text).replace(/[\s，。！？,.!?、~～:：;；]/g,'').slice(0,12);   // 归一化后再聚类（忽略标点差异）
      const rec=bySid.get(key)||{key,sample:m.text,count:0,replied:0};
      rec.count++;
      const t0=toTs(m.ts);
      let got=null;
      for(let j=i+1;j<msgs.length;j++){ const x=msgs[j]; const tx=toTs(x.ts); if(tx-t0>win) break; if(x.dir==='them'&&tx>t0){ got=x; break; } }
      if(got) rec.replied++;
      bySid.set(key,rec);
    });
  });
  return Array.from(bySid.values())
    .map(c=>Object.assign(c,{rate:Math.round(c.replied/c.count*100)}))
    .sort((a,b)=>b.count-a.count);
}
function computeChatStats(sessions){
  let total=0,me=0,them=0,sum=0,n=0;
  sessions.forEach(s=>{
    (s.messages||[]).forEach(m=>{ total++; if(m.dir==='me') me++; else them++; });
    const fr=firstReplyMinutes(s);
    if(fr!==null){ sum+=fr; n++; }
  });
  return {sessions:sessions.length,total,me,them,avgFirstReply:n?Math.round(sum/n):null,histogram:hourlyHistogram(sessions)};
}
// 打招呼方式分类（不是按文本计数，而是按"你怎么开场"归类）
function greetingKind(text){
  const t=String(text||'');
  if(/我对您发布的职位非常感兴趣|希望能加入贵公司|我对贵司岗位/.test(t)) return '模板招呼';
  if(/我是|应届|专业|毕业|大专|本科|硕士/.test(t)) return '自我介绍';
  if(/联系方式|微信|电话|手机号|加个/.test(t)) return '要联系方式';
  if(/简历|附件/.test(t)) return '发简历';
  if(/还在招|岗位|请问|了解|职责|薪资|待遇/.test(t)) return '问岗位详情';
  if(/方便|可以|您好|你好/.test(t)) return '普通问候';
  return '其他';
}
function greetingStats(sessions,replyWindowMs){
  const win=replyWindowMs||24*3600*1000;
  const map=new Map();
  sessions.forEach(s=>{
    const msgs=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts));
    msgs.forEach((m,i)=>{
      if(m.dir!=='me'||!m.text) return;
      const k=greetingKind(m.text);
      const rec=map.get(k)||{kind:k,count:0,replied:0,sample:m.text};
      rec.count++;
      const t0=toTs(m.ts);
      let got=null;
      for(let j=i+1;j<msgs.length;j++){ const x=msgs[j]; const tx=toTs(x.ts); if(tx-t0>win) break; if(x.dir==='them'&&tx>t0){ got=x; break; } }
      if(got) rec.replied++;
      map.set(k,rec);
    });
  });
  return Array.from(map.values())
    .map(c=>Object.assign(c,{rate:Math.round(c.replied/c.count*100)}))
    .sort((a,b)=>b.count-a.count);
}
// 跟进情况：待跟进 = 我最后发言且 ≥2 天没回
function followUpStats(sessions){
  let waiting=0, theirs=0, done=0;
  sessions.forEach(s=>{
    const ms=(s.messages||[]);
    if(!ms.length) return;
    const last=ms.slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts))[ms.length-1];
    const days=last.ts?Math.floor((Date.now()-toTs(last.ts))/86400000):0;
    if(last.dir==='me'){ if(days>=2) waiting++; else done++; }
    else theirs++;
  });
  return {waiting,theirs,done};
}
// ===== AI 判定：对方是真人还是模板/机器人？值不值得继续跟进？=====
// T3/SC-3：首次启用 AI 判定的一次性确认文案（发送范围/目的地/留存都说清楚，含对方消息也会被发送）
const AI_CONSENT_TEXT='启用 AI 判定后，脚本会把所选会话的最近 10 条消息（默认每条截断 120 字，可在设置里调）、公司名与岗位名发送至你配置的接口（默认 api.deepseek.com）；对方（HR）发送的消息也会被发送。\n\n发送前会在本机做脱敏（手机号 / 身份证 / 邮箱 / 微信号 / QQ 会打码），原始聊天内容不会因此改动。判定结果仅存本机。\n\n是否继续启用？';
// SC-4a（v1.4.4 修订）：发送前本地脱敏（只影响发给接口的副本，本机存储的数据不动）
// 修订点：身份证先于手机号（旧顺序会被手机号规则咬掉 19xx 出生年份段）；容忍空格/点/横线等分隔写法与全角数字；
//        匹配要求从非数字边界开始（分隔符集合：空白 / 点 / 横线 / 中点 / 破折号）
function maskSensitive(s){
  let t=String(s==null?'':s);
  t=t.replace(/[０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));   // 全角数字 → 半角
  // 身份证（18 位，末位可 X；段间最多一个分隔；从非数字边界开始）——先于手机号处理
  t=t.replace(/(^|\D)(\d{6}[\s.\-·—–]?\d{4}[\s.\-·—–]?\d{2}[\s.\-·—–]?\d{2}[\s.\-·—–]?\d{3}[\dXx])/g,
    (m,p1,p2)=>{ const d=p2.replace(/[^\dXx]/g,''); return p1+d.slice(0,4)+'**********'+d.slice(-2); });
  // 手机号（11 位，1[3-9] 开头；段间最多一个分隔；+86 前缀原样保留）
  // 注意：此处不加"非数字边界"约束——兼容粘连/紧贴写法（身份证已在上一行打码，不会被此规则咬到）
  t=t.replace(/1[3-9]\d[\s.\-·—–]?\d{4}[\s.\-·—–]?\d{4}/g,
    m=>{ const d=m.replace(/[^\d]/g,''); return d.slice(0,3)+'****'+d.slice(-2); });
  t=t.replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (m,a,b)=>a.slice(0,1)+'***@'+b); // 邮箱
  t=t.replace(/((?:微信|weixin|wechat|wx|vx|v信|加v|qq|企鹅|扣扣)\s*(?:号|id)?\s*[:：]?\s*)([A-Za-z0-9_-]{4,})/gi,
    (m,a,b)=>a+b.slice(0,2)+'***');                                                                  // 微信号 / QQ（不含点号，避免把域名当 ID）
  return t;
}
// SC-4b：可配置的数据面（条数 / 每条字数上限）
function aiMsgWindow(a){
  return {
    n: Math.max(4, Math.min(20, parseInt(a&&a.msgCount,10)||10)),
    chars: Math.max(60, Math.min(200, parseInt(a&&a.msgChars,10)||120))
  };
}
// 本地日期（YYYY-MM-DD）：额度按本地换日，不能用 toISOString（那是 UTC，北京时间要早 8 小时才重置）
function localDateStr(d){
  const t=d||new Date(), p=x=>String(x).padStart(2,'0');
  return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());
}
function aiBudgetOk(){
  const a=store.settings.ai||{};
  const today=localDateStr();
  if(a.usedDate!==today){ a.usedDate=today; a.usedToday=0; }
  return (a.usedToday||0)<(a.maxPerDay||30);
}
// done(ok)：true=成功 / false=请求失败 / null=未发送（缓存、额度、缺 Key）——每个会话恰好回调一次
function aiSessionJudge(sid,force,done){
  const finish=ok=>{ if(done){ try{ done(ok); }catch(e){} } };
  try{
    const a=store.settings.ai||{};
    if(!a.on||!a.key||typeof GM_xmlhttpRequest!=='function'){ finish(null); return false; }
    const s=store.chats[sid]; if(!s){ finish(null); return false; }
    if(!force&&s.meta.ai&&(Date.now()-(s.meta.ai.ts||0))<7*86400000){ finish(null); return false; }   // 7 天缓存
    if(!aiBudgetOk()){ finish(null); return false; }
    const w=aiMsgWindow(a);
    // SC-4a/4b：脱敏 + 缩减后的副本（原始消息仍按原样存本机）
    const msgs=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts)).slice(-w.n).map(m=>(m.dir==='me'?'我：':'对方：')+maskSensitive(String(m.text||'').slice(0,w.chars))).join('\n');
    if(!msgs){ finish(null); return false; }
    s.meta.ai={pending:true};
    GM_xmlhttpRequest({
      method:'POST',
      url:String(a.baseUrl||'').replace(/\/+$/,'')+'/chat/completions',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+a.key},
      data:JSON.stringify({model:a.model||'deepseek-chat',temperature:0,max_tokens:160,
        response_format:{type:'json_object'},
        messages:[
          {role:'system',content:'你在帮求职者评估 BOSS直聘的聊天质量。判断：对方的回复是真人（有具体信息、针对性强）还是模板/机器人（客套、复制粘贴、不针对具体问题）。只输出 JSON：{"bot":"真人|模板|机器人|不确定","worth":0到100的整数,"reason":"不超过25字"}'},
          {role:'user',content:JSON.stringify({公司:maskSensitive(s.meta.company||''),岗位:maskSensitive(s.meta.jobName||''),对话:msgs})}
        ]}),
      timeout:25000,
      onload:r=>{
        let ok=false;
        try{
          const o=JSON.parse(r.responseText);
          const txt=(o.choices&&o.choices[0]&&o.choices[0].message&&o.choices[0].message.content)||'';
          const j=JSON.parse(txt);
          s.meta.ai={bot:String(j.bot||'').slice(0,6), worth:Math.max(0,Math.min(100,parseInt(j.worth,10)||0)), reason:String(j.reason||'').slice(0,40), ts:Date.now()};
          a.usedToday=(a.usedToday||0)+1;
          save(['settings','chats']); log('AI：'+(s.meta.company||s.meta.boss||sid)+' → '+s.meta.ai.bot+' / 值得 '+s.meta.ai.worth);
          ok=true;
        }catch(e){ delete s.meta.ai; save(['chats']); log('AI：返回解析失败'); }
        finish(ok); scheduleRender();
      },
      onerror:()=>{ delete s.meta.ai; save(['chats']); log('AI：请求失败（检查 Key/网络）'); finish(false); scheduleRender(); },
      ontimeout:()=>{ delete s.meta.ai; save(['chats']); log('AI：请求超时'); finish(false); scheduleRender(); }
    });
    return true;
  }catch(e){ finish(null); return false; }
}
// SC-4c：批量判定改为顺序队列 —— 逐个发送、按间隔限流、连续失败 2 次即停
let judgeBatchRunning=false;
function aiJudgeBatch(limit){
  const a=store.settings.ai||{};
  if(!a.on||!a.key){ alert('先在设置里打开 AI 判定并填 Key'); return 0; }
  if(judgeBatchRunning){ log('AI：批量判定正在进行中，等它跑完'); return 0; }
  const list=Object.entries(store.chats)
    .filter(([k,s])=>(s.messages||[]).length&&!(s.meta.ai&&(Date.now()-(s.meta.ai.ts||0))<7*86400000))
    .sort((x,y)=>((y[1].messages||[]).length-(x[1].messages||[]).length))
    .slice(0,limit||99);
  if(!list.length){ log('AI：没有需要判定的会话（其余都在 7 天缓存内）'); return 0; }
  const gap=Math.max(400,Math.min(5000,parseInt(a.batchGapMs,10)||1200));
  judgeBatchRunning=true;
  let i=0, sent=0, fail=0;
  const nextSoon=ms=>setTimeout(next,ms);
  const next=()=>{
    if(i>=list.length){
      judgeBatchRunning=false;
      log('AI：批量判定完成（成功 '+sent+' 个 · 失败 '+fail+' 个）');
      save(['settings','chats']); scheduleRender(); return;
    }
    const sid=list[i++][0];
    const started=aiSessionJudge(sid,false,ok=>{
      if(ok===true){ sent++; fail=0; }
      else if(ok===false){
        fail++;
        if(fail>=2){
          judgeBatchRunning=false;
          log('AI：连续失败 2 次，已停止批量判定（检查 Key / 网络 / 余额）');
          save(['settings','chats']); scheduleRender(); return;
        }
      }
      scheduleRender();
      nextSoon(ok===null?120:gap);   // 缩小发送节奏，避免并发触发接口限流
    });
    if(!started){ /* 回调里已经排了下一步 */ }
  };
  log('AI：批量判定开始（'+list.length+' 个 · 每个间隔 '+gap+'ms · 顺序发送）');
  next();
  return list.length;
}
// 一键收录全部会话：回放「页面自己的真实请求」（带 securityId 令牌）逐个只读拉取
let bulkRunning=false;
let bulkState=null;   // {running,done,total,ok,skip,fail,added,finishedAt}
function pullAllSessions(opts){
  opts=opts||{};
  const gapMin=opts.gapMin!==undefined?opts.gapMin:1200;
  const gapMax=opts.gapMax!==undefined?opts.gapMax:3000;
  if(bulkRunning){ log('批量收录正在跑，等它跑完'); return 0; }
  if(typeof GM_xmlhttpRequest!=='function'){ alert('缺少 GM_xmlhttpRequest 权限：请在篡改猴里更新到 v1.3.1+ 并刷新页面'); log('缺少 GM_xmlhttpRequest 权限（请更新脚本到 v1.3.1+）'); return 0; }
  const ids=Object.keys(store.chats).filter(sid=>/^[A-Za-z0-9_~-]{6,}$/.test(sid));
  if(!ids.length){ log('没有可拉取的会话 —— 先打开聊天页，让脚本抓到会话列表'); return 0; }
  const list=ids.slice(0,opts.limit||60);
  bulkRunning=true;
  let i=0, ok=0, skip=0, fail=0, added=0, noTokenMiss=0, empty=0;
  let consec=0;
  bulkState={running:true,done:0,total:list.length,ok:0,skip:0,fail:0,added:0};
  const finish=(why)=>{
    bulkRunning=false;
    bulkState={running:false,done:i,total:list.length,ok,skip,fail,added,finishedAt:Date.now()};
    if(why) bulkState.stopped=why;
    log('批量收录'+(why?('中止（'+why+'）'):'完成')+'：成功 '+ok+' 个 / 跳过 '+skip+' 个 / 失败 '+fail+' 个，新增消息 '+added+' 条');
    if(skip) log('跳过的 '+skip+' 个会话还没点开过、拿不到 securityId 令牌：在左边点开一次即可收录');
    if(empty&&!added&&empty>=ok) log('这次 '+empty+' 个会话都返回空列表：令牌可能已过期 → 刷新页面（Ctrl+Shift+R）后再试一次');
    save(['chats']); scheduleRender();
  };
  const next=()=>{
    if(i>=list.length){ finish(''); return; }
    const sid=list[i++];
    const before=(store.chats[sid]&&store.chats[sid].messages||[]).length;
    const r=historyUrlFor(sid);
    // 连续 3 个无令牌会话都拉不到消息 → 接口确实要令牌，其余无令牌会话不再空跑（少打接口）
    if(!r.token&&noTokenMiss>=3){ skip++; bulkState.done=i; bulkState.skip=skip; scheduleRender(); setTimeout(next,60); return; }
    GM_xmlhttpRequest({
      method:'GET',
      url:r.url,
      timeout:15000,
      onload:rr=>{
        if(!(rr.status>=200&&rr.status<300)){ fail++; consec++; bulkState.done=i; bulkState.fail=fail; if(consec>=2){ finish('HTTP '+rr.status+' 连续 2 次失败，疑似被限流'); return; } scheduleRender(); setTimeout(next,gapMin*2); return; }
        let outcome='fail';
        try{
          const j=JSON.parse(rr.responseText);
          const msg=String((j&&j.message)||'');
          if(j&&j.code!==0){
            if(/验证|频繁|异常|非法/.test(msg)){ fail++; bulkState.done=i; bulkState.fail=fail; finish('风控信号：'+msg); return; }
          }else{
            processMessages(j,sid,r.token?r.url:'');
            const delta=(store.chats[sid]&&store.chats[sid].messages||[]).length-before;
            added+=delta;
            if(delta===0&&r.token) empty++;   // 有令牌却一条都没回来 → 多半是令牌过期
            outcome=delta>0?'ok':(r.token?'ok':'notoken');
          }
        }catch(e){ outcome='fail'; }
        if(outcome==='ok'){ ok++; consec=0; }
        else if(outcome==='fail'){ fail++; consec++; if(consec>=2){ finish('连续 2 次失败，已停止（可能已被限流）'); return; } }
        else { noTokenMiss++; skip++; consec=0; }
        bulkState.done=i; bulkState.ok=ok; bulkState.skip=skip; bulkState.fail=fail; bulkState.added=added;
        scheduleRender();
        setTimeout(next, gapMin+Math.random()*Math.max(0,gapMax-gapMin));
      },
      onerror:()=>{ fail++; consec++; if(consec>=2){ finish('连续 2 次网络失败，已停止'); return; } bulkState.done=i; bulkState.fail=fail; scheduleRender(); setTimeout(next, gapMin); },
      ontimeout:()=>{ fail++; consec++; if(consec>=2){ finish('连续 2 次网络失败，已停止'); return; } bulkState.done=i; bulkState.fail=fail; scheduleRender(); setTimeout(next, gapMin); }
    });
  };
  log('开始批量收录 '+list.length+' 个会话（只读，回放页面真实请求；间隔 '+(gapMin/1000)+'-'+(gapMax/1000)+' 秒）…');
  next();
  return list.length;
}

// ===== 导出 =====
function chatRowsForExport(){
  const rows=[['会话','公司','对方','岗位','方向','时间','内容']];
  Object.values(store.chats).forEach(s=>{
    (s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts)).forEach(m=>{
      rows.push([s.meta.sessionId||'',s.meta.company||'',s.meta.boss||'',s.meta.jobName||'',m.dir==='me'?'我':'对方',String(m.ts||''),String(m.text||'')]);
    });
  });
  return rows;
}
function chatSessionRows(){
  const rows=[['公司','岗位','HR','会话ID','未读','站点标记','HR状态','HR最近在线','对方活跃时段','对方活跃点数','消息总数','我发','对方回','首响(分钟)','最后消息时间','最后发言方','最后一条消息','我发言后天数','跟进标记','AI判定','AI值得分','AI理由']];
  Object.values(store.chats).forEach(s=>{
    const ms=(s.messages||[]).slice().sort((a,b)=>toTs(a.ts)-toTs(b.ts));
    if(!ms.length) return;
    const me=ms.filter(m=>m.dir==='me'), them=ms.filter(m=>m.dir==='them');
    const last=ms[ms.length-1];
    const fr=firstReplyMinutes(s);
    const lastTs=toTs(last.ts);
    const days=lastTs?Math.floor((Date.now()-lastTs)/86400000):'';
    const waiting=last.dir==='me'&&days!==''&&days>=2;
    const act=activeHoursOf(s);
    rows.push([
      s.meta.company||'', s.meta.jobName||'', s.meta.boss||'', s.meta.sessionId||'',
      s.meta.unread||'', Object.entries(s.meta.flags||{}).map(([k,v])=>k+'='+v).join(';'),
      s.meta.hrStatus||'',
      s.meta.hrLastOnlineAt?new Date(s.meta.hrLastOnlineAt).toLocaleString('zh-CN',{hour12:false}):'',
      act.hits.slice().sort((a,b)=>a[0]-b[0]).map(it=>String(it[0]).padStart(2,'0')+':'+it[1]).join(';'),
      act.hits.length,
      ms.length, me.length, them.length, fr===null?'':fr,
      lastTs?new Date(lastTs).toLocaleString('zh-CN',{hour12:false}):String(last.ts||''),
      last.dir==='me'?'我':'对方',
      String(last.text||'').slice(0,120),
      last.dir==='me'?days:'',
      waiting?'待跟进（我最后发言 '+days+' 天没回）':(last.dir==='them'?'对方最后发言':'')
      ,(s.meta.ai&&s.meta.ai.bot)||''
      ,(s.meta.ai&&s.meta.ai.worth!==undefined)?s.meta.ai.worth:''
      ,(s.meta.ai&&s.meta.ai.reason)||''
    ]);
  });
  return rows;
}
const NODATA_MSG='还没有捕获到聊天数据。\n\n请打开 BOSS 消息页正常浏览：把会话列表翻一翻、点开几个会话，脚本会自动记录，然后回来导出。';
function exportSessionsCSV(){
  const rows=chatSessionRows();
  if(rows.length<=1){ alert(NODATA_MSG); return; }
  download(tsFile()+'-投递复盘-chat.csv', rows.map(r=>r.map(csvEsc).join(',')).join('\r\n'), 'text/csv');
}
function exportChatsCSV(){
  const rows=chatRowsForExport();
  if(rows.length<=1){ alert(NODATA_MSG); return; }
  download(tsFile()+'-消息明细-chat.csv', rows.map(r=>r.map(csvEsc).join(',')).join('\r\n'), 'text/csv');
}
function exportMessagesJSONL(){
  const lines=[];
  Object.values(store.chats).forEach(s=>{
    (s.messages||[]).forEach(m=>{
      lines.push(JSON.stringify({session:s.meta.sessionId||'',company:s.meta.company||'',job:s.meta.jobName||'',boss:s.meta.boss||'',
        dir:m.dir==='me'?'me':'them',ts:toTs(m.ts)||m.ts||'',text:m.text||''}));
    });
  });
  if(!lines.length){ alert(NODATA_MSG); return; }
  download(tsFile()+'-消息逐条-chat.jsonl', lines.join('\n'), 'application/x-ndjson');
}
function exportChatsJSON(){
  download(tsFile()+'-聊天备份-chat.json', JSON.stringify(store.chats,null,2), 'application/json');
}
function exportSummaryMD(){
  const sessions=Object.values(store.chats);
  const st=computeChatStats(sessions);
  const clusters=clusterMessages(sessions,(store.settings.chat.replyWindowHours||24)*3600*1000);
  let md='# BOSS 聊天统计摘要\n\n生成时间：'+new Date().toLocaleString('zh-CN')+'\n\n';
  md+='## 总量\n- 会话数：'+st.sessions+'\n- 消息数：'+st.total+'（我 '+st.me+' / 对方 '+st.them+'）\n';
  md+='- 平均首响：'+(st.avgFirstReply===null?'暂无':st.avgFirstReply+' 分钟')+'\n\n';
  md+='## 话术回复率 TOP\n\n| 次数 | 回复率 | 话术 |\n|---|---|---|\n';
  clusters.slice(0,15).forEach(c=>{
    md+='| '+c.count+' | '+Math.round(c.replied/c.count*100)+'% | '+String(c.sample).replace(/\|/g,'/').slice(0,40)+' |\n';
  });
  md+='\n## 对方活跃时段\n\n```\n';
  md+=st.histogram.map((n,i)=>String(i).padStart(2,'0')+':00 '+'█'.repeat(Math.min(30,n||0))+' '+n).join('\n');
  md+='\n```\n';
  download(tsFile()+'-统计摘要-chat.md', md, 'text/markdown');
}

// ===== 面板 =====
// v1.4.4：悬浮球上移（bottom 82px）——避免与「岗位监控」悬浮球（bottom 18px）在聊天页完全重叠、下层点不到
const BW_CSS='#bcRoot{position:fixed;right:18px;bottom:82px;z-index:2147483000;--bc:#2f6bff;--bc-soft:#eef4ff;--bc-line:#e6ebf3;--bc-mute:#7a8396;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430}'+
  '#bcRoot *{box-sizing:border-box}'+
  '#bcFab{width:52px;height:52px;border-radius:50%;background:linear-gradient(160deg,#4a80ff,#2f6bff);color:#fff;font-size:22px;border:none;cursor:pointer;box-shadow:0 6px 18px rgba(47,107,255,.42);display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s}'+
  '#bcFab:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(47,107,255,.5)}'+
  '#bcPanel{display:none;position:fixed;right:18px;bottom:80px;width:660px;max-width:calc(100vw - 36px);max-height:80vh;overflow:auto;background:#fff;border:1px solid var(--bc-line);border-radius:16px;box-shadow:0 18px 50px rgba(20,30,60,.22);padding:0}'+
  '#bcPanel .bc-head{position:sticky;top:0;z-index:6;cursor:move;user-select:none;touch-action:none;height:44px;padding:0 14px;display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid var(--bc-line);border-radius:16px 16px 0 0}'+
  '#bcPanel .bc-title{font-size:14px}'+
  '#bcPanel .bc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15);flex:0 0 auto}'+
  '#bcPanel .bc-dot.bad{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.15)}'+
  '#bcPanel .bc-head .bc-muted{margin-left:auto;text-align:right}'+
  '#bcPanel .bc-x{border:none;background:none;font-size:20px;line-height:1;cursor:pointer;color:#7a8396;padding:0 2px}'+
  '#bcPanel .bc-x:hover{color:#1f2430}'+
  '#bcBody{padding:12px 14px 14px}'+
  '#bcPanel .bc-muted{color:var(--bc-mute);font-size:12px}'+
  '#bcPanel .bc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'+
  '#bcPanel .bc-card{background:linear-gradient(180deg,#fbfcff,#f4f8ff);border:1px solid var(--bc-line);border-radius:12px;padding:8px 10px}'+
  '#bcPanel .bc-card b{display:block;font-size:19px;line-height:1.3;color:var(--bc)}'+
  '#bcPanel .bc-card span{font-size:11px;color:var(--bc-mute)}'+
  '#bcPanel .bc-h{font-weight:600;margin:12px 0 6px;padding-left:8px;border-left:3px solid var(--bc);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}'+
  '#bcPanel .bc-h .bc-muted{font-weight:400}'+
  '#bcPanel .bc-row{display:flex;flex-wrap:wrap;gap:6px}'+
  '#bcPanel .bc-btn{border:1px solid #d7dce6;background:#fff;border-radius:9px;padding:5px 11px;cursor:pointer;font-size:12px;color:#1f2430;transition:background .12s,border-color .12s}'+
  '#bcPanel .bc-btn:hover{background:#f2f6ff;border-color:#b9ccff}'+
  '#bcPanel .bc-btn.bc-primary{background:var(--bc);border-color:var(--bc);color:#fff;font-weight:600}'+
  '#bcPanel .bc-btn.bc-primary:hover{background:#1f5bef}'+
  '#bcPanel .bc-warn{background:#fff3e0;border-color:#ffd9a8}'+
  '#bcPanel .bc-danger{background:#fee2e2;border-color:#fecaca;color:#b91c1c}'+
  '#bcPanel .bc-empty{color:#9aa3b2;font-size:12px;padding:6px 0}'+
  '#bcPanel .bc-log{padding:4px 0;border-bottom:1px dashed #eef1f6;font-size:11px;color:#3b4252}'+
  '#bcPanel .bc-q{width:200px;padding:4px 8px;border:1px solid #d7dce6;border-radius:8px;font-size:12px;outline:none}'+
  '#bcPanel .bc-q:focus{border-color:#9dbcff;box-shadow:0 0 0 2px rgba(47,107,255,.12)}'+
  '#bcPanel .bc-listhead{display:flex;align-items:center;gap:8px;margin:0 0 6px;flex-wrap:wrap}'+
  '#bcPanel .bc-sel{margin-left:auto;padding:3px 6px;border:1px solid #d7dce6;border-radius:8px;font-size:12px;color:#1f2430;background:#fff;outline:none}'+
  '#bcPanel .bc-t{width:100%;border-collapse:collapse;font-size:12px}'+
  '#bcPanel .bc-t th{position:sticky;top:44px;z-index:4;background:#fbfcff;color:#5c667a;font-weight:600;font-size:11px;border-bottom:1px solid var(--bc-line);padding:5px 6px;text-align:left;white-space:nowrap;box-shadow:0 1px 0 var(--bc-line)}'+
  '#bcPanel .bc-t td{border-bottom:1px solid #f0f3f9;padding:5px 6px;text-align:left;vertical-align:top;line-height:1.5}'+
  '#bcPanel .bc-t td.bc-nowrap,#bcPanel .bc-t th.bc-nowrap{white-space:nowrap}'+
  '#bcPanel .bc-t tbody tr[data-open]{cursor:pointer}'+
  '#bcPanel .bc-t tbody tr[data-open]:hover{background:var(--bc-soft)}'+
    '.bc-sig{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 10px}'+
    '.bc-sigbox{border:1px solid var(--bc-line);border-radius:12px;padding:8px 10px;background:#fbfdff;min-height:70px}'+
    '.bc-sig-amber{border-color:#f59e0b;background:#fffbeb}'+
    '.bc-sig-red{border-color:#ef4444;background:#fef2f2}'+
    '.bc-sig-green{border-color:#16a34a;background:#f0fdf4}'+
    '.bc-sighead{font-weight:700;font-size:12px}'+
    '.bc-sighead b{background:rgba(0,0,0,.08);border-radius:8px;padding:0 6px;margin-left:6px}'+
    '.bc-sigdesc{font-size:10px;color:var(--bc-mute);margin:2px 0 6px}'+
    '.bc-sigitem{padding:3px 6px;border-radius:8px;cursor:pointer;font-size:11px;display:flex;justify-content:space-between;gap:6px}'+
    '.bc-sigitem:hover{background:rgba(47,107,255,.10)}'+
    '.bc-sigempty{font-size:11px;color:var(--bc-mute)}'+
    '@media(max-width:720px){.bc-sig{grid-template-columns:1fr}}'+
  '#bcPanel .bc-heat{display:inline-flex;gap:1px;vertical-align:middle;margin-left:4px}'+
  '#bcPanel .bc-heat i{display:block;width:3px;height:12px;border-radius:1.5px;background:#e9eef7}'+
  '#bcPanel .bc-heat i.on{background:#9dbcff}'+
  '#bcPanel .bc-heat i.hi{background:#2f6bff}'+
  '#bcPanel .bc-hist{display:flex;align-items:flex-end;gap:2px;height:118px;padding:14px 10px 4px;background:linear-gradient(180deg,#fbfcff,#f3f7ff);border:1px solid var(--bc-line);border-radius:12px}'+
  '#bcPanel .bc-col{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end}'+
  '#bcPanel .bc-col .bc-bar{position:relative;width:100%;min-height:2px;background:#a9c0ff;border-radius:3px 3px 0 0}'+
  '#bcPanel .bc-col:hover .bc-bar{background:#7aa0ff}'+
  '#bcPanel .bc-col.peak .bc-bar{background:var(--bc)}'+
  '#bcPanel .bc-col .bc-n{position:absolute;top:-12px;left:-2px;right:-2px;text-align:center;font-size:9px;line-height:11px;color:var(--bc-mute)}'+
  '#bcPanel .bc-hticks{display:flex;gap:2px;padding:2px 10px 0}'+
  '#bcPanel .bc-hticks span{flex:1;text-align:center;font-size:9px;color:#aab2c2}'+
  '#bcPanel .bc-note{margin:8px 0;padding:6px 10px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;color:#2b4b8f;font-size:12px}'+
  '#bcPanel .bc-lv{display:inline-block;margin:1px 3px 1px 0;padding:1px 6px;background:#f1f4f9;border:1px solid #dde3ee;border-radius:10px;color:#5a6478;font-size:11px;line-height:1.5;white-space:nowrap}'+
  '#bcPanel details.bc-fold{border:1px solid var(--bc-line);border-radius:12px;background:#fcfdff;margin:8px 0;overflow:hidden}'+
  '#bcPanel details.bc-fold>summary{cursor:pointer;padding:8px 12px;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;list-style:none}'+
  '#bcPanel details.bc-fold>summary::-webkit-details-marker{display:none}'+
  '#bcPanel details.bc-fold>summary::before{content:"\\25B8";color:var(--bc-mute);font-weight:400}'+
  '#bcPanel details.bc-fold[open]>summary::before{content:"\\25BE"}'+
  '#bcPanel details.bc-fold>summary:hover{background:#f5f8ff}'+
  '#bcPanel .bc-foldbody{padding:4px 12px 10px;border-top:1px solid #eef1f6}'+
  '#bcPanel input[type=text],#bcPanel input[type=password],#bcPanel input[type=number]{padding:3px 6px;border:1px solid #d7dce6;border-radius:7px;font-size:11px;outline:none}'+
  '#bcPanel input[type=checkbox]{vertical-align:-1px;margin-right:4px}';
let ui=null;
function buildUI(){
  // v1.5.11：DOM 级幂等 —— 页面里已经有 #bcRoot 就复用它。
  // 原来只看内存里的 ui：同页跑了两份脚本时，两边各有各的 ui，就会挂出两个一模一样的 💬 球。
  try{
    const exist=document.getElementById('bcRoot');
    if(exist){
      ui={root:exist, fab:exist.querySelector('#bcFab'), panel:exist.querySelector('#bcPanel'), body:exist.querySelector('#bcBody'), dot:exist.querySelector('#bcDot')};
      return ui;
    }
  }catch(e){}
  try{ GM_addStyle(BW_CSS); }catch(e){ const s=document.createElement('style'); s.textContent=BW_CSS; document.head.appendChild(s); }
  const root=document.createElement('div');
  root.id='bcRoot';
  root.innerHTML='<button id="bcFab" title="聊天助手（点开/收起面板）">💬</button>'+
    '<div id="bcPanel"><div class="bc-head"><span class="bc-dot" id="bcDot"></span><b class="bc-title">BOSS 聊天助手</b><span class="bc-muted">v'+VERSION+' · 抓取只读 · 处置动作由你点击触发 · 除 AI 判定外数据仅存本机</span><button class="bc-x" data-act="close" title="收起">×</button></div>'+
    '<div id="bcBody"></div></div>';
  document.body.appendChild(root);
  ui={root,fab:root.querySelector('#bcFab'),panel:root.querySelector('#bcPanel'),body:root.querySelector('#bcBody'),dot:root.querySelector('#bcDot')};
  applyPanelPos(ui.panel,'bc_panelpos'); makePanelDraggable(ui.panel.querySelector('.bc-head'),ui.panel,'bc_panelpos');   // v1.5.5 面板可拖
  applyFabPos(ui.fab,'bc_fabpos'); makePanelDraggable(ui.fab,ui.fab,'bc_fabpos');   // v1.5.7：悬浮球也能拖，位置存本机
  ui.fab.addEventListener('click',()=>{
    const show=ui.panel.style.display!=='block';
    ui.panel.style.display=show?'block':'none';
    if(show){
      try{   // v1.5.7 自愈：存储位置越界就回默认位，不再「面板不见了」
        const r=ui.panel.getBoundingClientRect();
        if(r.left<-4||r.top<-4||r.right>window.innerWidth+4||r.bottom>window.innerHeight+4){
          localStorage.removeItem('bc_panelpos');
          ui.panel.style.left=''; ui.panel.style.top=''; ui.panel.style.right='18px'; ui.panel.style.bottom='80px';
        }
      }catch(e){}
      renderAll();
    }
  });
  ui.panel.addEventListener('click',(e)=>{
    // v1.5.0：先看按钮 —— 行内的一键处置不能被「点行＝打开会话」吃掉
    const _b=(e.target&&e.target.closest)?e.target.closest('[data-act]'):null;
    // v1.4.7：点会话列表某一行 = 在页面左侧打开该会话（openSessionInPage 里做同名定位，找不到就如实说明）
    const row=_b?null:((e.target&&e.target.closest)?e.target.closest('[data-open]'):null);
    if(row){ openSessionInPage(row.dataset.open); return; }
    const b=_b; if(!b) return;
    const act=b.dataset.act;
    if(act==='close'){ ui.panel.style.display='none'; }
    else if(act==='sessions'){ exportSessionsCSV(); }
    else if(act==='csv'){ exportChatsCSV(); }
    else if(act==='jsonl'){ exportMessagesJSONL(); }
    else if(act==='json'){ exportChatsJSON(); }
    else if(act==='md'){ exportSummaryMD(); }
    else if(act==='chatscan'){
      const n=scrapeChatDom(true);
      log(n?('已收录当前会话 '+n+' 条消息'):'没读到消息：先在左边点开一个会话（有聊天内容），再点这个按钮');
      renderAll();
    }
    else if(act==='chatclean'){
      const bad=Object.keys(store.chats).filter(k=>k.indexOf('dom:')===0||!store.chats[k].meta||!store.chats[k].meta.company);
      if(!bad.length){ alert('没有需要清理的异常会话'); return; }
      if(!confirm('清理 '+bad.length+' 个异常/无公司名的会话？')) return;
      bad.forEach(k=>{ delete store.chats[k]; });
      save(['chats']); log('已清理 '+bad.length+' 个异常会话'); renderAll();
    }
    else if(act==='aijudge'){ const n=aiJudgeBatch(99); if(n) { renderAll(); setTimeout(renderAll,4000); setTimeout(renderAll,12000); } }
    else if(act==='keysave'){
      // T3/SC-2：显式保存 —— 写入后立即清空输入框，Key 不驻留 DOM
      const inp=ui.panel.querySelector('input[data-key="ai.key"]');
      const v=inp?String(inp.value||'').trim():'';
      if(inp) inp.value='';
      if(!v){ alert('请先输入 Key'); return; }
      store.settings.ai.key=v;
      save(['settings']); log('AI Key 已保存（仅存本机）'); renderAll();
    }
    else if(act==='keyclear'){
      // T3/SC-1：清除入口 —— 从设置（含 GM 存储）中移除
      if(!store.settings.ai.key){ alert('当前没有保存 Key'); return; }
      if(!confirm('清除已保存的 API Key？（清除后需重新填写才能用 AI 判定）')) return;
      store.settings.ai.key='';
      save(['settings']); log('AI Key 已清除'); renderAll();
    }
    else if(act==='pullall'){
      const n=pullAllSessions({});
      if(n){ renderAll(); setTimeout(renderAll,3000); setTimeout(renderAll,8000); }
    }
  });
  ui.panel.addEventListener('change',(e)=>{
    const el=e.target;
    // v1.4.7：列表排序切换（只重画列表，不动输入框）
    if(el&&el.id==='bcSort'){ listSort=el.value; renderList(); return; }
    if(el.dataset.key==='chat.domFallback'){ store.settings.chat.domFallback=el.checked; save(['settings']); log('DOM 兜底：'+(el.checked?'开':'关')); }
    if(el.dataset.key==='observe'){ store.settings.observe=el.checked; save(['settings']); }
    if(el.dataset.key==='ai.on'){
      // T3/SC-3：首次启用弹一次性确认（含发送范围 / 目的地 / 对方消息也会被发送）
      if(el.checked&&!store.settings.ai.ackAt){
        const okGo=confirm(AI_CONSENT_TEXT);
        if(!okGo){ el.checked=false; return; }
        store.settings.ai.ackAt=now();
      }
      store.settings.ai.on=el.checked; save(['settings']); log('AI 判定：'+(el.checked?'开':'关'));
    }
    if(el.dataset.key==='ai.baseUrl'){
      // T3/SC-3：baseUrl 校验 —— 提示仅填可信地址；非 https 给出提醒
      const v=String(el.value||'').trim();
      store.settings.ai.baseUrl=v; save(['settings']);
      if(v&&!/^https:\/\//i.test(v)){
        log('提示：接口地址不是 https，数据将以明文传输');
        alert('该地址不是 https，发送内容可能被中间人读取。建议改用 https 地址。');
      }
    }
  });
  ui.panel.addEventListener('input',(e)=>{
    const el=e.target;
    // v1.4.7：会话搜索框 —— 只重画列表那一块，输入焦点与光标位置不受影响
    if(el&&el.id==='bcQ'){ listQuery=el.value; renderList(); return; }
    if(!el.dataset.key||!/^ai\./.test(el.dataset.key)) return;
    const k=el.dataset.key.split('.')[1];
    if(k==='key') return;   // T3/SC-2：Key 只走「保存」按钮，不逐键写入
    store.settings.ai[k]=el.type==='number'?(parseInt(el.value,10)||0):el.value;
    save(['settings']);
  });
  return ui;
}
function scheduleRender(){
  if(!ui||ui.panel.style.display!=='block') return;
  clearTimeout(scheduleRender._t);
  scheduleRender._t=setTimeout(renderAll,300);
}
// ===== 面板渲染（v1.4.7：重排 + 可视化）=====
let listQuery='', listSort='last';   // last=最后活动（默认）/ them=对方活跃条数 / msgs=消息数
// 每行一条 24 格热力条：左起 00 点 → 右到 23 点，亮格＝对方在那个小时发过消息（深色＝条数多）
function heatStrip(s){
  const a=activeHoursOf(s);
  const max=Math.max(1,...a.hist);
  let cells='';
  a.hist.forEach(n=>{ cells+='<i class="'+(n?(n>=Math.max(2,max*0.5)?'hi':'on'):'')+'"></i>'; });
  const tip=a.total?('对方发消息的小时分布：左起 00 点 → 右到 23 点，亮格＝有消息（深色＝条数多）；共 '+a.total+' 条'):'对方还没回过消息';
  return '<span class="bc-heat" title="'+esc(tip)+'">'+cells+'</span>';
}
// 合并 24 小时直方图：竖列一行看完（v1.4.6 是 24 行横条，占掉大半屏）
function histHtml(hist){
  const h=Array.isArray(hist)&&hist.length===24?hist:new Array(24).fill(0);
  const top=Math.max(...h), max=Math.max(1,top);
  let cols='';
  h.forEach((n,i)=>{
    cols+='<div class="bc-col'+((top&&n===top)?' peak':'')+'" title="'+String(i).padStart(2,'0')+' 点 · '+n+' 条">'+
      '<div class="bc-bar" style="height:'+Math.round(n/max*100)+'%">'+(n?('<span class="bc-n">'+n+'</span>'):'')+'</div></div>';
  });
  let ticks='';
  for(let i=0;i<24;i++) ticks+='<span>'+(i%3===0?String(i).padStart(2,'0'):'')+'</span>';
  return '<div class="bc-hist">'+cols+'</div><div class="bc-hticks">'+ticks+'</div>';
}
// 会话列表（可搜索 / 整行可点）：只有搜索时才重画这一块，输入框不失焦
// 会话列表（可搜索 / 整行可点）：只有搜索时才重画这一块，输入框不失焦
// v1.4.7：先算每行数据再决定列 —— 全空的列（状态 / AI）自动不渲染，省下的宽度给公司与活跃条
function listHtml(){
  const all=Object.keys(store.chats||{}).map(k=>({k,s:store.chats[k]})).filter(e=>e.s);
  const withMsg=all.filter(e=>(e.s.messages||[]).length);
  const q=String(listQuery||'').replace(/\s/g,'').toLowerCase();
  let shown=withMsg;
  if(q) shown=shown.filter(e=>{ const m=e.s.meta||{}; return [m.company,m.boss,m.jobName,m.sessionId].some(v=>String(v==null?'':v).replace(/\s/g,'').toLowerCase().indexOf(q)>=0); });
  const dec=shown.map(e=>({e,last:lastActiveTs(e.s),them:activeHoursOf(e.s).total,n:(e.s.messages||[]).length,lt:String((e.s.meta||{}).lastTime||'')}));
  const sorted=dec.sort((a,b)=>{
    if(listSort==='them'){ const d=b.them-a.them; if(d) return d; }
    if(listSort==='msgs'){ const d=b.n-a.n; if(d) return d; }
    return (b.last-a.last)||b.lt.localeCompare(a.lt);
  }).map(x=>x.e);
  const rows=q?sorted.slice(0,200):sorted.slice(0,30);
  let html='<div class="bc-listhead"><input id="bcQ" class="bc-q" type="text" placeholder="搜索公司 / HR / 岗位" value="'+esc(listQuery)+'">'+
    '<select id="bcSort" class="bc-sel"><option value="last"'+(listSort==='last'?' selected':'')+'>按最后活动</option><option value="them"'+(listSort==='them'?' selected':'')+'>按对方活跃</option><option value="msgs"'+(listSort==='msgs'?' selected':'')+'>按消息数</option></select>'+
    '<span class="bc-muted">显示 '+rows.length+' / '+sorted.length+' 个有消息的会话'+(all.length>withMsg.length?'（另有 '+(all.length-withMsg.length)+' 个空会话已隐藏）':'')+'</span></div>';
  if(!rows.length){
    html+='<div class="bc-empty">'+(q?('没有匹配「'+esc(listQuery)+'」的会话'):('还没有带消息的会话'+(all.length?('（另有 '+all.length+' 个空会话未显示）'):'')+'。点开一个会话，或点上方「只收录当前会话」。'))+'</div>';
    return html;
  }
  const items=rows.map(e=>{
    const s=e.s, m=s.meta||{}, msgs=s.messages||[];
    const fl=m.flags||{};
    const tags=[];
    if(m.unread) tags.push('<span class="bc-lv">未读 '+esc(m.unread)+'</span>');
    // 只显示有内容的标记：0 / false / 空串 是接口默认值，没有信息量（原来每行刷 4 个，把列表撑得很高）
    Object.keys(fl).filter(x=>{ const v=fl[x]; return !(v===false||v===0||v==='0'||v==='false'||v===''||v===null||v===undefined); })
      .slice(0,4).forEach(x=>tags.push('<span class="bc-lv">'+esc(x)+':'+esc(String(fl[x]).slice(0,8))+'</span>'));
    if(m.hrStatus) tags.push('<span class="bc-lv">'+esc(m.hrStatus)+'</span>');
    const lo=m.hrLastOnlineAt?('<div class="bc-muted" style="font-size:10px">最近在线 '+new Date(m.hrLastOnlineAt).toLocaleString('zh-CN',{hour12:false})+'</div>'):'';
    const actW=activeWindowText(s);
    const actTip=actW.text?('对方活跃明细（小时·条数）：'+activeHoursText(s,24).text+'；共 '+actW.total+' 条——按对方发消息的时间统计，不是实时在线状态'):'';
    // 每小时条数直接写进列表（按时间顺序）——v1.4.5 只放在悬停提示里，用户看不到
    const actNums=actW.hits.length>1?(actW.hits.slice(0,4).map(it=>String(it[0]).padStart(2,'0')+'点('+it[1]+')').join(' ')+(actW.hits.length>4?' …':'')):'';
    // v1.5.1：有「上线/下线」实测数据就显示它（具体时间）；没有就退回原来的活跃近似
    const onTxt=onlineText(s);
    const actCell=onTxt?('<div class="bc-muted" style="font-size:10px">'+esc(onTxt)+'</div>')
      :(actW.text?('<div class="bc-muted" style="font-size:10px" title="'+esc(actTip)+'">活跃 '+esc(actW.text)+' · 对方 '+actW.total+' 条</div>'+(actNums?('<div class="bc-muted" style="font-size:10px">'+esc(actNums)+'</div>'):'')):'');
    const pg=progressOf(s);
    if(pg.hits.length) tags.push('<span class="bc-lv" title="对方消息里出现：'+esc(pg.hits.join('、'))+'">'+esc(pg.hits.slice(0,3).join('/'))+'</span>');
    const ai=m.ai||null;
    const hasAI=!!(ai&&(ai.bot||ai.pending));
    const aiCell=ai&&ai.bot?('<b style="color:'+(ai.bot==='真人'?'#15803d':(ai.bot==='不确定'?'#c2600a':'#dc2626'))+'">'+esc(ai.bot)+'</b> '+ai.worth):(ai&&ai.pending?'<span class="bc-muted">判定中…</span>':'<span class="bc-muted">—</span>');
    const lastTs=lastActiveTs(s);
    return {e,s,m,msgs,tags,lo,actCell,hasAI,aiCell,lastTs};
  });
  const showStatus=items.some(it=>it.tags.length>0);
  const showAI=items.some(it=>it.hasAI);
  html+='<table class="bc-t"><tr><th>公司</th><th>对方/岗位</th>'+(showStatus?'<th>状态</th>':'')+'<th>消息/活跃</th>'+(showAI?'<th>AI</th>':'')+'</tr>';
  items.forEach(it=>{
    html+='<tr data-open="'+esc(it.e.k)+'" title="点击＝在页面左侧打开这个会话（会自动收录）">'+
      '<td><b>'+esc(it.m.company||it.m.boss||it.m.sessionId||it.e.k)+'</b>'+(it.lastTs?('<div class="bc-muted" style="font-size:10px">'+relTime(it.lastTs)+'</div>'):'')+'</td>'+
      '<td>'+esc(it.m.boss||'')+(it.m.jobName?' <span class="bc-muted">'+esc(it.m.jobName)+'</span>':'')+'</td>'+
      (showStatus?('<td>'+(it.tags.length?it.tags.join(' '):'<span class="bc-muted">—</span>')+it.lo+'</td>'):'')+
      '<td class="bc-act"><b>'+it.msgs.length+'</b> 条'+heatStrip(it.s)+it.actCell+'</td>'+
      (showAI?('<td>'+it.aiCell+'</td>'):'')+'</tr>';
  });
  html+='</table>';
  return html;
}
function renderList(){
  const el=document.getElementById('bcListWrap'); if(!el) return;
  const a=document.activeElement;
  const aid=(a&&a.id&&el.contains(a))?a.id:'';
  let pos=null; try{ if(aid&&a.selectionStart!=null) pos=[a.selectionStart,a.selectionEnd]; }catch(e){}
  el.innerHTML=listHtml();
  if(aid){ const n=el.querySelector('#'+aid); if(n){ n.focus(); try{ if(pos&&n.setSelectionRange) n.setSelectionRange(pos[0],pos[1]); }catch(e){} } }
}
// 面板可拖动：按住标题栏拖，位置存本机（与 tag 面板同一套交互）
// v1.5.7：悬浮球位置恢复（拖的就是球本身）
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
function applyPanelPos(p,key){
  try{
    const o=JSON.parse(localStorage.getItem(key)||'null');
    if(o&&typeof o.x==='number'&&typeof o.y==='number'){
      const w=p.offsetWidth||660,h=p.offsetHeight||Math.round(window.innerHeight*0.8);   // v1.5.7 按面板实际尺寸钳位
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
    if(p!==handle&&e.target&&e.target.closest&&e.target.closest('button,input,textarea,summary,a,select')) return;   // v1.5.7：拖的就是把手本身（悬浮球）时不跳过
    e.preventDefault(); moved=false;
    const r=p.getBoundingClientRect(), dx=e.clientX-r.left, dy=e.clientY-r.top;
    const move=(ev)=>{
      let x=ev.clientX-dx, y=ev.clientY-dy; moved=true;
      const w=p.offsetWidth||660,h=p.offsetHeight||Math.round(window.innerHeight*0.8);
      x=Math.max(4,Math.min(x,Math.max(4,window.innerWidth-w-8))); y=Math.max(4,Math.min(y,Math.max(4,window.innerHeight-h-8)));
      p.style.left=x+'px'; p.style.top=y+'px'; p.style.right='auto'; p.style.bottom='auto';
    };
    const up=()=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
      try{ const rr=p.getBoundingClientRect(); localStorage.setItem(key,JSON.stringify({x:rr.left,y:rr.top})); }catch(e2){}
      if(moved&&p===handle){ const sw=(ev)=>{ ev.stopPropagation(); ev.preventDefault(); }; try{ handle.addEventListener('click',sw,{once:true,capture:true}); }catch(e2){} }   // v1.5.7：拖完球不误开/误关面板
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
  });
}

// 点列表某行 → 在页面左侧找到同名会话并点开（等价于你自己点它；找不到就如实说明，不猜）
function sessionNodeCandidates(names){
  const out=[], seen=new Set();
  const sel='li,[role="listitem"],[class*="-item"],[class*="item-"],[class*="conversation"],[class*="user"]';
  try{
    document.querySelectorAll(sel).forEach(el=>{
      if(seen.has(el)) return; seen.add(el);
      try{ if(el.closest('#bcRoot')) return; }catch(_){}
      if(!el.offsetParent) return;
      const t=(domText(el)||'').replace(/\s/g,'');
      if(!t||t.length>160) return;                       // 大容器（整块列表）直接排除
      if(!names.some(n=>t.indexOf(n)>=0)) return;
      const p=el.parentElement; if(!p||p.children.length<3) return;   // 父容器里得有多个同类项，才算列表项
      out.push(el);
    });
  }catch(_){}
  out.sort((a,b)=>{ try{ const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return (ra.width*ra.height)-(rb.width*rb.height); }catch(_){ return 0; } });
  return out;
}
function openSessionInPage(key){
  try{
    const s=store.chats&&store.chats[key];
    if(!s){ log('这个会话不在本地记录里（可能已被清掉）'); return; }
    const m=s.meta||{};
    const label=m.company||m.boss||m.sessionId||String(key);
    const names=[m.company,m.boss].map(v=>String(v==null?'':v).replace(/\s/g,'')).filter(v=>v.length>=2);
    if(!names.length){ log('「'+label+'」没有公司/HR 名，定位不了左侧列表，请手动点开'); return; }
    const el=sessionNodeCandidates(names)[0];
    if(!el){ log('左侧列表里没看到「'+label+'」：可能不在当前筛选下，或被搜索框挡住了——手动点开一次即可收录'); return; }
    try{ el.scrollIntoView({block:'center'}); }catch(_){}
    try{ el.click(); }catch(_){}
    log('已点开「'+label+'」；接口抓到消息后会自动收录');
    setTimeout(()=>{ try{ if(ui&&ui.panel.style.display==='block') renderAll(); }catch(_){} },2600);
  }catch(e){ try{ log('打开会话失败：'+e.message); }catch(_){} }
}
// ===== v1.4.8：重绘不再「吃掉」你正在看 / 正在填的东西 =====
function panelSnapshot(){
  const snap={folds:[], vals:{}, scroll:0, focus:'', sel:null};
  try{
    if(!ui||!ui.body) return snap;
    const folds=ui.body.querySelectorAll('details.bc-fold');
    for(let i=0;i<folds.length;i++) snap.folds.push(!!folds[i].open);
    const ins=ui.body.querySelectorAll('input,textarea');
    for(let i=0;i<ins.length;i++){ if(ins[i].id&&ins[i].type!=='checkbox') snap.vals[ins[i].id]=ins[i].value; }
    snap.scroll=(ui.panel&&ui.panel.scrollTop)||0;
    const a=document.activeElement;
    if(a&&ui.body.contains(a)&&a.id&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')){
      snap.focus=a.id;
      try{ snap.sel=[a.selectionStart,a.selectionEnd]; }catch(e){}
    }
  }catch(e){}
  return snap;
}
function panelRestore(snap){
  try{
    if(!snap||!ui||!ui.body) return;
    const folds=ui.body.querySelectorAll('details.bc-fold');
    for(let i=0;i<folds.length&&i<snap.folds.length;i++) folds[i].open=!!snap.folds[i];
    Object.keys(snap.vals||{}).forEach(id=>{
      const el=ui.body.querySelector('#'+id);
      if(el&&el.value!==undefined&&snap.vals[id]!==undefined) el.value=snap.vals[id];
    });
    if(ui.panel) ui.panel.scrollTop=snap.scroll||0;
    if(snap.focus){
      const a=ui.body.querySelector('#'+snap.focus);
      if(a){ a.focus(); try{ if(snap.sel&&a.setSelectionRange) a.setSelectionRange(snap.sel[0],snap.sel[1]); }catch(e){} }
    }
  }catch(e){}
}
function renderAll(){
  const keep=panelSnapshot();   // v1.4.8：先记住展开状态 / 滚动 / 未保存的输入，重绘后放回
  if(!ui) return;
  const sessions=Object.values(store.chats);
  const st=computeChatStats(sessions);
  const greetings=greetingStats(sessions,(store.settings.chat.replyWindowHours||24)*3600*1000);
  const fu=followUpStats(sessions);
  const withMsg=sessions.filter(s=>(s.messages||[]).length).length;
  const themTotal=st.histogram.reduce((a,b)=>a+b,0);
  const topN=Math.max(...st.histogram);
  const peak=st.histogram.indexOf(topN);
  const hk=hookStatus();
  // 顶部状态点：一眼看出抓取钩子在不在工作（原来要滚到底部看文字）
  if(ui.dot){
    ui.dot.className='bc-dot'+(mainHookReady?'':' bad');
    ui.dot.title=mainHookReady?('页面世界钩子就绪（已捕获 '+hk.captured+' 类接口）'):'页面世界钩子未注入：更新脚本后按 Ctrl+Shift+R 强刷';
  }
  let html='<div class="bc-cards">'+
    '<div class="bc-card"><b>'+sessions.length+'</b><span>会话（'+withMsg+' 个有消息）</span></div>'+
    '<div class="bc-card"><b>'+st.total+'</b><span>消息（我'+st.me+'/对方'+st.them+'）</span></div>'+
    '<div class="bc-card"><b>'+fu.waiting+'</b><span>待跟进（我发言≥2天没回）</span></div>'+
    '<div class="bc-card"><b>'+greetings.length+'</b><span>打招呼方式</span></div></div>';
  html+='<div class="bc-h">工具<span class="bc-muted">只读脚本：不发消息、不点「打招呼」</span></div><div class="bc-row">'+
    '<button class="bc-btn bc-primary" data-act="pullall">一键收录全部会话</button>'+
    '<button class="bc-btn" data-act="chatscan">只收录当前会话</button>'+
    '<button class="bc-btn" data-act="aijudge">AI 判定全部会话</button>'+
    '<button class="bc-btn bc-danger" data-act="chatclean">清理异常会话</button></div>';
  if(bulkState&&bulkState.running) html+='<div class="bc-note">⏳ 批量收录中：'+bulkState.done+' / '+bulkState.total+'（成功 '+bulkState.ok+' · 跳过 '+(bulkState.skip||0)+' · 失败 '+bulkState.fail+' · 新增 '+bulkState.added+' 条）</div>';
  else if(bulkState&&bulkState.finishedAt) html+='<div class="bc-note">上次批量收录：成功 '+bulkState.ok+' · 跳过 '+(bulkState.skip||0)+' · 失败 '+bulkState.fail+'，新增 '+bulkState.added+' 条（'+new Date(bulkState.finishedAt).toLocaleTimeString('zh-CN',{hour12:false})+'）'+((bulkState.skip)?'<br>⚠ 跳过的 '+bulkState.skip+' 个会话没点开过、拿不到令牌 —— 点开一次即可收录':'')+'</div>';
  html+='<details class="bc-fold"><summary>收录说明 / AI 判定边界</summary><div class="bc-foldbody"><div class="bc-muted" style="font-size:11px">「一键收录全部」会<b>回放页面自己的只读请求</b>逐个拉取历史消息（每个间隔 1-3 秒，遇风控立即停）；没点开过的会话拿不到令牌会跳过（点开一次即可收录）。<br>'+
    'AI 判定：判断对方回复是<b>真人</b>还是<b>模板/机器人</b>，并给「值得跟进」分（0-100）。按会话缓存 7 天，判定结果仅存本机；启用后，所选会话的最近消息（默认 10 条 × 120 字）会<b>在本机脱敏后</b>发送至你配置的接口（默认 DeepSeek），批量判定按间隔<b>顺序发送</b>。</div></div></details>';
  html+='<div class="bc-h">会话列表（HR 上下线）<span class="bc-muted">点任意一行＝在页面左侧打开该会话</span></div>';
  html+='<div class="bc-muted" style="font-size:11px">HR 上下线：列表里看不到别人的在线状态，只有你<b>点开着的那个会话</b>才有（把它开着，脚本每分钟记一次，看到「在线」就记下时间）。<br>「活跃」列＝该 HR <b>发过消息</b>的小时（最早–最晚 ＋ 条数），后面的 <b>24 格亮条</b>左起 00 点 → 右到 23 点：亮格＝有消息的小时，一眼看作息——这只是上下线的近似。</div>';
  html+='<div id="bcListWrap">'+listHtml()+'</div>';
  // v1.5.1：把「对方活跃时段」那块图换成 在线时间线 + 推进信号（用户口径：活跃图换成更有用的数据）
  const pg2=progressGroups(sessions);
  html+='<div class="bc-h">在线时间线<span class="bc-muted">上线/下线＝脚本每分钟采样「你点开着的那个会话」看到的时间；没点开过的显示 —</span></div>';
  const onlineRows=sessions.filter(s=>s.meta&&(s.meta.onlineAt||s.meta.offlineAt)).sort((a,b)=>(b.meta.onlineAt||0)-(a.meta.onlineAt||0)).slice(0,12);
  if(!onlineRows.length) html+='<div class="bc-empty">还没有在线记录：把某个会话点开挂着（脚本每分钟记一次），看到「在线」就会记下上线时间。</div>';
  else{
    html+='<table class="bc-t"><tr><th>公司 / HR</th><th>在线时间线</th></tr>';
    onlineRows.forEach(s=>{
      const m=s.meta||{};
      html+='<tr><td><b>'+esc(m.company||m.boss||m.sessionId||'')+'</b></td><td>'+esc(onlineText(s))+'</td></tr>';
    });
    html+='</table>';
  }
  html+='<div class="bc-h">推进信号<span class="bc-muted">框里点会话＝在页面左侧直接打开</span></div>';
  const keyMap=new Map(); Object.keys(store.chats).forEach(k=>{ keyMap.set(store.chats[k],k); });
  const keyOf=s=>keyMap.get(s)||((s.meta||{}).sessionId||'');
  const lab=s=>(s.meta||{}).company||(s.meta||{}).boss||s.sessionId||'';
  html+='<div class="bc-sig">';
  html+=sigBox('该我回','对方最后发言、你还没回',pg2.mine.map(s=>({k:keyOf(s),label:lab(s),sub:relTime(lastActiveTs(s))})),'amber');
  html+=sigBox('该催','你发言 ≥2 天没回',pg2.push.map(s=>({k:keyOf(s),label:lab(s),sub:relTime(lastActiveTs(s))})),'red');
  html+=sigBox('有联系方式','对方消息里出现 微信/电话/邮箱',pg2.contact.map(x=>({k:keyOf(x.s),label:lab(x.s),sub:(x.p.hits||[]).slice(0,2).join('/')})),'green');
  html+='</div>';
  html+='<div class="bc-h">打招呼方式（分类统计 · 发送后 '+store.settings.chat.replyWindowHours+'h 内是否回复）</div>';
  if(!greetings.length) html+='<div class="bc-empty">暂无消息数据。点开一个会话后自动记录；也可点「收录当前会话」。</div>';
  else{
    html+='<table class="bc-t"><tr><th>方式</th><th>次数</th><th>回复率</th><th>示例</th></tr>';
    greetings.forEach(c=>{
      html+='<tr><td><b>'+esc(c.kind)+'</b></td><td>'+c.count+'</td>'+
        '<td style="color:'+(c.rate>=60?'#15803d':(c.rate>=30?'#c2600a':'#dc2626'))+';font-weight:600">'+c.rate+'%</td>'+
        '<td>'+esc(String(c.sample).slice(0,34))+'</td></tr>';
    });
    html+='</table>';
  }
  html+='<div class="bc-h">跟进情况</div><div class="bc-muted" style="font-size:12px">'+
    '待跟进 <b>'+fu.waiting+'</b>（我最后发言 ≥2 天没回） · 等我回 <b>'+fu.theirs+'</b>（对方最后发言） · 进行中 <b>'+fu.done+'</b>（我发言 2 天内）</div>';
  html+='<details class="bc-fold"><summary>导出（投递复盘用）</summary><div class="bc-foldbody">'+
    '<div class="bc-muted" style="font-size:11px;margin:2px 0 4px">给人看：复盘表（一行一会话）/ 统计摘要（贴报告）</div><div class="bc-row">'+
    '<button class="bc-btn" data-act="sessions">导出复盘CSV</button>'+
    '<button class="bc-btn" data-act="md">导出统计MD</button></div>'+
    '<div class="bc-muted" style="font-size:11px;margin:8px 0 4px">给机器与备份：消息级明细 / 原始数据（dashboard 可载入）</div><div class="bc-row">'+
    '<button class="bc-btn" data-act="csv">导出消息CSV</button>'+
    '<button class="bc-btn" data-act="jsonl">导出消息JSONL</button>'+
    '<button class="bc-btn" data-act="json">导出JSON备份</button></div></div></details>';
  html+='<details class="bc-fold"><summary>设置<span class="bc-muted">DOM 兜底：'+(store.settings.chat.domFallback?'开':'关')+' · 观察模式：'+(store.settings.observe?'开':'关')+'</span></summary><div class="bc-foldbody">'+
    '<div style="margin-top:6px"><label><input type="checkbox" data-key="chat.domFallback" '+(store.settings.chat.domFallback?'checked':'')+'> 聊天页 DOM 兜底（默认关，接口抓不到时才用）</label></div>'+
    '<div><label><input type="checkbox" data-key="observe" '+(store.settings.observe?'checked':'')+'> 接口观察模式（控制台打印捕获路径）</label></div></div></details>';
  const ai=store.settings.ai||{};
  html+='<details class="bc-fold"><summary>AI 判定设置<span class="bc-muted">'+(ai.on?'已开启':'已关闭')+(ai.key?' · Key 已保存':' · 未设 Key')+'</span></summary><div class="bc-foldbody">'+
    '<div style="margin-top:6px"><label><input type="checkbox" data-key="ai.on" '+(ai.on?'checked':'')+'> 启用 AI 判定（判断真人/模板 + 值得跟进度）</label></div>'+
    '<div class="bc-muted" style="font-size:11px">接口地址 <input id="bcAiBaseUrl" type="text" data-key="ai.baseUrl" value="'+esc(ai.baseUrl||'')+'" style="width:200px">'+
    ' 模型 <input id="bcAiModel" type="text" data-key="ai.model" value="'+esc(ai.model||'')+'" style="width:120px"></div>'+
    '<div class="bc-muted" style="font-size:11px">↑ 数据将发送至该地址，请仅填写可信地址（建议 https）</div>'+
    // T3/SC-2：Key 永不回填 —— 只显示状态；输入框默认空，保存后立即清空
    '<div style="margin:4px 0">API Key：'+(ai.key?'<b>已保存</b>':'未设置')+
    ' <input id="bcAiKey" type="password" data-key="ai.key" value="" placeholder="输入新 Key" style="width:150px">'+
    ' <button class="bc-btn" data-act="keysave">保存</button>'+
    ' <button class="bc-btn" data-act="keyclear">清除 Key</button></div>'+
    // T3/SC-1：Key 明文存储风险提示
    '<div class="bc-muted" style="font-size:11px">Key 以明文保存在浏览器扩展存储中（本机可读）；请使用专用 Key、限制余额，勿在共用电脑上填写。</div>'+
    '<div class="bc-muted" style="font-size:11px">每日上限 <input id="bcAiMaxPerDay" type="number" data-key="ai.maxPerDay" value="'+(ai.maxPerDay||30)+'" style="width:60px">'+
    ' 今日已用 '+(ai.usedToday||0)+'</div>'+
    // SC-4b/4c：数据面与批量节奏可调
    '<div class="bc-muted" style="font-size:11px">发送条数 <input id="bcAiMsgCount" type="number" data-key="ai.msgCount" value="'+(ai.msgCount||10)+'" style="width:50px">'+
    ' 每条字数上限 <input id="bcAiMsgChars" type="number" data-key="ai.msgChars" value="'+(ai.msgChars||120)+'" style="width:60px">'+
    ' 批量间隔(ms) <input id="bcAiBatchGap" type="number" data-key="ai.batchGapMs" value="'+(ai.batchGapMs||1200)+'" style="width:70px"></div>'+
    '<div class="bc-muted" style="font-size:11px">发送前会在本机脱敏（手机号 / 身份证 / 邮箱 / 微信号 / QQ；含空格、横线等常见分隔写法）；批量判定按上面的间隔逐个发送，连续失败会自动停。</div></div></details>';
  // v1.4.4：主钩子（页面世界）是抓取主路径；沙箱钩子仅部分环境的辅助兜底，不再显示成故障
  let hookTip;
  if(mainHookReady){
    hookTip='页面世界钩子 ✓ · 已捕获 '+hk.captured+' 类接口'+((hk.fetch&&hk.xhr)
      ? ' · 沙箱钩子 ✓'
      : '（沙箱兜底未启用：fetch '+(hk.fetch?'✓':'✗')+' / XHR '+(hk.xhr?'✓':'✗')+'，不影响抓取）');
  }else{
    hookTip='⚠ 页面世界钩子未注入：数据进不来，请更新脚本后按 Ctrl+Shift+R 强刷';
  }
  html+='<details class="bc-fold"><summary>运行日志<span class="bc-muted">共 '+store.logs.length+' 条 · 显示最近 '+Math.min(store.logs.length,10)+' 条</span></summary><div class="bc-foldbody">';
  if(!store.logs.length) html+='<div class="bc-empty">暂无日志</div>';
  else html+=store.logs.slice(0,10).map(l=>'<div class="bc-log"><span class="bc-muted">'+new Date(l.ts).toLocaleTimeString('zh-CN',{hour12:false})+'</span> '+esc(l.msg)+'</div>').join('');
  html+='</div></details>';
  html+='<div class="bc-muted" style="margin-top:8px">'+hookTip+'</div>';
  html+='<div class="bc-muted" style="margin-top:4px">v'+VERSION+' · 抓取始终只读（不发消息、不点站内按钮）；「处置」里的隐藏/不感兴趣/拉黑/删除<b>只在你点击时</b>才执行。除 AI 判定外，数据只存本机。</div>';
  ui.body.innerHTML=html;
  panelRestore(keep);   // v1.4.8：把展开状态 / 滚动 / 未保存的输入放回去
}

// ===== DOM 兜底（默认关）=====
function domText(el){ return el?String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim():''; }
function domPick(root,sels){
  for(const s of sels){ try{ const t=domText(root.querySelector(s)); if(t) return t; }catch(e){} }
  return '';
}
function findChatKeyByName(name){
  const n=String(name||'').replace(/\s/g,'');
  if(!n||n.length<2) return '';
  for(const k of Object.keys(store.chats||{})){
    const m=(store.chats[k]&&store.chats[k].meta)||{};
    for(const c of [m.company,m.boss]){
      if(!c) continue;
      const cn=String(c).replace(/\s/g,'');
      if(cn&&(cn===n||cn.includes(n)||n.includes(cn))) return k;
    }
  }
  return '';
}
function messageNodes(){
  const sels=['[class*="message-item"]','[class*="msg-item"]','[class*="message-list"] li','[class*="chat-message"]'];
  for(const s of sels){
    try{ const n=Array.prototype.slice.call(document.querySelectorAll(s)); if(n.length>=2) return n; }catch(e){}
  }
  return [];
}
function nodeIsMine(el){
  try{
    let cur=el;
    for(let i=0;i<4&&cur;i++){
      const cls=String(cur.className||'');
      if(/(^|[-_ ])(myself|self|mine|my)([-_ ]|$)/i.test(cls)) return true;
      cur=cur.parentElement;
    }
  }catch(e){}
  try{
    const r=el.getBoundingClientRect(), p=el.parentElement;
    if(r.width&&p){
      const pr=p.getBoundingClientRect();
      const cs=getComputedStyle(p);
      const left=pr.left+parseFloat(cs.paddingLeft||0), right=pr.right-parseFloat(cs.paddingRight||0);
      if(right>left) return (r.left+r.width/2)>((left+right)/2);
    }
  }catch(e){}
  return false;
}
function parseClockTs(t){
  // v1.5.2：把「日期」补齐，别再一律当今天——
  //   ① 明写日期：2026-09-19 / 09-19  ② 相对词：昨天 / 前天  ③ 只有时刻：未来 >1 小时视为昨天
  const s=String(t||'');
  const hm=s.match(/(\d{1,2}):(\d{2})/);
  if(!hm) return '';
  const d=new Date();
  d.setHours(Number(hm[1]),Number(hm[2]),0,0);
  const ymd=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(ymd){ d.setFullYear(Number(ymd[1]),Number(ymd[2])-1,Number(ymd[3])); return d.getTime(); }
  const md=s.match(/(?:^|\D)(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if(md){
    const mo=Number(md[1]), day=Number(md[2]);
    if(mo>=1&&mo<=12&&day>=1&&day<=31){
      d.setMonth(mo-1,day);
      if(d.getTime()-Date.now()>24*3600*1000) d.setFullYear(d.getFullYear()-1);   // 跨年（如现在 1 月、消息写 12-31）
      return d.getTime();
    }
  }
  if(/前天/.test(s)) d.setDate(d.getDate()-2);
  else if(/昨天/.test(s)) d.setDate(d.getDate()-1);
  else if(d.getTime()-Date.now()>3600*1000) d.setDate(d.getDate()-1);
  return d.getTime();
}
function scrapeChatDom(force){
  let added=0;
  try{
    if(!force&&!(store.settings.chat&&store.settings.chat.domFallback)) return 0;   // 手动点按钮时不受开关限制
    const nodes=messageNodes();
    if(!nodes.length) return 0;
    const urlSid=sessionIdFromUrl(location.href);
    const head=domPick(document,['[class*="chat-header"] [class*="name"]','[class*="conversation"] [class*="title"]','[class*="chat-title"]'])||'';
    const key=(urlSid&&store.chats[urlSid])?urlSid:findChatKeyByName(head);
    if(!key) return 0;
    const s=store.chats[key];
    nodes.forEach(el=>{
      try{
        const raw=domText(el);
        if(!raw) return;
        const tm=raw.match(/(?:(?:\d{4}-)?\d{1,2}-\d{1,2}|今天|昨天|前天)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}/);
        const text=cleanMsgText(raw);
        if(!text||text.length>1000||isSystemMsg(text)) return;
        const ts=tm?parseClockTs(tm[0]):'';
        const dir=nodeIsMine(el)?'me':'them';
        const mid=key+'_dom_'+String(ts||'')+'_'+text.slice(0,16);
        if(s.messages.some(x=>x.mid===mid)) return;
        s.messages.push({mid,dir,ts,text,fromDom:true});
        if(s.messages.length>2000) s.messages.shift();
        if(dir==='me') noteMyReply(s,toTs(ts)||now());
        added++;
      }catch(e){}
    });
    if(added) save(['chats']);
  }catch(e){}
  return added;
}
function scrapeHrStatusDom(){
  try{
    const headEl=document.querySelector('[class*="chat-header"],[class*="conversation"] [class*="info"],[class*="chat-title"]');
    const txt=headEl?domText(headEl):'';
    if(!txt) return 0;
    const m=txt.match(/(在线|离线|刚刚活跃|今日活跃|本周活跃|\d+\s*天前活跃|\d+\s*小时前活跃|\d+\s*分钟前活跃)/);
    if(!m) return 0;
    const name=domPick(document,['[class*="chat-header"] [class*="name"]','[class*="conversation"] [class*="title"]','[class*="chat-title"]'])||'';
    const key=findChatKeyByName(name);
    if(!key) return 0;
    noteHrStatus(store.chats[key],m[1]);
    save(['chats']);
    return 1;
  }catch(e){ return 0; }
}

function boot(){
  if(typeof window==='undefined'||!window.document) return;
  try{
    if(!/zhipin\.com/i.test(window.location.hostname)) return;
    loadStore();
    try{ window.addEventListener('message',onPageMessage,false); }catch(e){}
    // 防抖写入的落盘保护：关页 / 切后台时立刻把脏数据写下去（T5 配套）
    try{
      window.addEventListener('pagehide',()=>{ try{ flushSave(); }catch(e){} },false);
      window.addEventListener('beforeunload',()=>{ try{ flushSave(); }catch(e){} },false);
      document.addEventListener('visibilitychange',()=>{ try{ if(document.visibilityState==='hidden') flushSave(); }catch(e){} },false);
    }catch(e){}
    hookFetch(); hookXHR(); injectMainHook();
    [0,120,400,1500,4000].forEach(d=>setTimeout(()=>{ hookFetch(); hookXHR(); injectMainHook(); },d));
    setTimeout(()=>saveDiag(),2500);
    if(document.body) buildUI(); else document.addEventListener('DOMContentLoaded',buildUI);
    if(typeof GM_registerMenuCommand==='function'){
      GM_registerMenuCommand('💬 聊天助手面板（开/关）',()=>{ if(!ui) buildUI(); const p=ui.panel; p.style.display=p.style.display==='block'?'none':'block'; if(p.style.display==='block') renderAll(); });
      GM_registerMenuCommand('📤 导出投递复盘 CSV',()=>exportSessionsCSV());
    }
    setTimeout(()=>{ try{ scrapeHrStatusDom(); if(store.settings.chat.domFallback) scrapeChatDom(); }catch(e){} },3000);
    setInterval(()=>{ try{ scrapeHrStatusDom(); }catch(e){} },60000);   // HR 上下线：后台也记
    setInterval(()=>{ try{ if(document.visibilityState==='visible'){ scrapeHrStatusDom(); if(store.settings.chat.domFallback) scrapeChatDom(); } }catch(e){} },12000);
  }catch(e){ try{ console.error('[boss-chat]',e); }catch(_){} }
}
boot();

if(typeof module!=='undefined'&&module.exports){
  module.exports={
    VERSION, store, DEFAULTS,
    toTs, csvEsc, mergeDeep, pick, findArr,
    esc, bomFor, payloadFor, download, localDateStr, aiBudgetOk, AI_CONSENT_TEXT, maskSensitive, aiMsgWindow,
    save, flushSave, capKeyOf, capSeenRecently, maybeStoreResponse,
    sessionIdFromUrl, secIdFromUrl, historyUrlFor, classify, cleanMsgText, isSystemMsg,
    processChatList, processMessages, hrStatusFromItem, noteHrStatus,
    firstReplyMinutes, hourlyHistogram, activeHoursOf, activeHoursText, activeWindowText, lastActiveTs, relTime, clusterMessages, computeChatStats,
    greetingKind, greetingStats, followUpStats,
    chatRowsForExport, chatSessionRows, findChatKeyByName, nodeIsMine, parseClockTs
    ,pullAllSessions, aiSessionJudge, aiJudgeBatch
  };
}
})();
