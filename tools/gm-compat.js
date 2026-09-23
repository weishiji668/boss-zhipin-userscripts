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
