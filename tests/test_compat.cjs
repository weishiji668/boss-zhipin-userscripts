// 兼容层自测：不联网、不需要浏览器。验证「有管理器」与「完全没有管理器」两条路，
// 并校验各脚本里内联的兼容层与 tools/gm-compat.js 一致（防漂移）。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "tools", "gm-compat.js");
const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log("  ✓ " + label); } else { fail++; console.log("  ✗ " + label); } }

function makeDom() {
  const byId = {};
  function el(tag) {
    return { tagName: tag, id: "", textContent: "", title: "", style: {}, kids: [], attrs: {}, listeners: {},
      setAttribute: function (k, v) { this.attrs[k] = v; },
      appendChild: function (c) { this.kids.push(c); if (c && c.id) byId[c.id] = c; return c; },
      addEventListener: function (t, f) { this.listeners[t] = f; } };
  }
  const body = el("body"), head = el("head");
  return { head: head, body: body, documentElement: el("html"), createElement: el,
    getElementById: function (id) { return byId[id] || null; }, idMap: byId };
}

function makeEnv(withGM) {
  const doc = makeDom();
  const ls = {}, gm = {};
  const calls = { gmGet: 0, gmSet: 0, gmXhr: 0, gmMenu: 0, gmCss: 0 };
  const ctx = { JSON: JSON, String: String, Object: Object, Array: Array, Math: Math, Date: Date, Number: Number, Boolean: Boolean,
    Error: Error, Promise: Promise, URL: URL, isNaN: isNaN,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    alert: function (t) { ctx.alertText = t; } };
  ctx.fetch = function (url) { ctx.fetched = String(url); return Promise.resolve({ status: 200, text: function () { return Promise.resolve("ok:" + url); } }); };
  const win = {
    location: { href: "https://www.zhipin.com/web/geek/job?query=x", origin: "https://www.zhipin.com" },
    localStorage: { getItem: function (k) { return (k in ls) ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } }
  };
  ctx.window = win; ctx.document = doc; ctx.location = win.location;
  if (withGM) {
    ctx.GM_getValue = function (k) { calls.gmGet++; return (k in gm) ? gm[k] : undefined; };
    ctx.GM_setValue = function (k, v) { calls.gmSet++; gm[k] = v; };
    ctx.GM_deleteValue = function (k) { delete gm[k]; };
    ctx.GM_addStyle = function (t) { calls.gmCss++; ctx.cssText = t; };
    ctx.GM_registerMenuCommand = function (label, fn) { calls.gmMenu++; ctx.menu = (ctx.menu || []).concat([[label, fn]]); };
    ctx.GM_xmlhttpRequest = function (o) { calls.gmXhr++; ctx.xhrOpts = o; };
    ctx.GM_info = { scriptHandler: "Tampermonkey", version: "5.5.0" };
    ctx.unsafeWindow = win;
  }
  ctx.lsStore = ls; ctx.gmStore = gm; ctx.calls = calls; ctx.doc = doc;
  vm.createContext(ctx);
  return ctx;
}

function load(ctx) {
  const src = fs.readFileSync(SRC, "utf8");
  vm.runInContext(src + NL + "globalThis.compat = __bossCompat;" + NL, ctx, { filename: "gm-compat.js" });
  return ctx.compat;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  console.log("■ 环境 A：有脚本管理器（篡改猴）");
  const a = makeEnv(true);
  const apiA = load(a);
  ok(apiA.has.gmStorage && apiA.has.gmXhr && apiA.has.gmMenu && apiA.has.gmCss, "识别出管理器的 GM 能力");
  apiA.store.set("k1", { v: 1 });
  ok(a.calls.gmSet === 1 && a.gmStore.k1.v === 1, "存储走 GM（不落 localStorage）");
  ok(Object.keys(a.lsStore).length === 0, "有管理器时不写 localStorage 兜底键");
  apiA.xhr({ url: "https://api.deepseek.com/chat/completions", method: "POST" });
  ok(a.calls.gmXhr === 1, "请求走 GM_xmlhttpRequest（跨域可用）");
  apiA.css(".x{}");
  ok(a.calls.gmCss === 1, "样式走 GM_addStyle");
  const repA = apiA.envReport();
  ok(repA.indexOf("Tampermonkey") >= 0 && repA.indexOf("GM 存储") >= 0, "环境自检如实描述管理器与存储");
  ok(!a.doc.idMap.gmCompatMenu, "有管理器时不额外挂 ⚙ 兜底菜单");

  console.log("■ 环境 B：完全没有管理器（脚本直接注入页面）");
  const b = makeEnv(false);
  const apiB = load(b);
  ok(!apiB.has.gmStorage && !apiB.has.gmXhr && !apiB.has.gmMenu && !apiB.has.gmCss, "识别出没有管理器");
  ok(typeof b.window.GM_getValue === "function" && typeof b.window.GM_xmlhttpRequest === "function" && typeof b.window.GM_addStyle === "function", "兜底 API 已挂到页面全局（脚本里原来的裸调用能被接住）");
  ok(b.window.unsafeWindow === b.window, "unsafeWindow 兜底为页面自身");
  apiB.store.set("k1", { v: 2 });
  const keys = Object.keys(b.lsStore);
  ok(keys.length === 1 && keys[0].indexOf("__gmcompat:") === 0, "存储退化为带前缀的 localStorage");
  ok(apiB.store.get("k1").v === 2, "读回一致");
  apiB.store.del("k1");
  ok(apiB.store.get("k1", null) === null, "删除生效");
  let sameRes = null;
  apiB.xhr({ url: "https://www.zhipin.com/wapi/zpgeek/friend/add.json?x=1", method: "POST", data: "a=1", onload: function (r) { sameRes = r; } });
  await sleep(20);
  ok(b.fetched === "https://www.zhipin.com/wapi/zpgeek/friend/add.json?x=1", "同源请求改走 fetch");
  ok(sameRes && sameRes.status === 200 && String(sameRes.responseText).indexOf("ok:") === 0, "fetch 结果按 GM 回调形状回给 onload");
  let cross = null;
  apiB.xhr({ url: "https://api.deepseek.com/chat/completions", onerror: function (e) { cross = e; } });
  ok(cross && String(cross.error).indexOf("跨域请求需要脚本管理器") >= 0, "跨域失败给出明确原因（不静默）");
  ok(b.calls.gmXhr === 0, "兜底路径没有误用 GM");
  apiB.css(".x{}");
  ok(b.doc.head.kids.length === 1 && b.doc.head.kids[0].tagName === "style", "样式退化为 style 标签");
  const repB = apiB.envReport();
  ok(repB.indexOf("localStorage 兜底") >= 0 && repB.indexOf("fetch 同源兜底") >= 0, "环境自检如实描述兜底后端");
  ok(b.doc.idMap.gmCompatMenu && b.doc.idMap.gmCompatMenu.kids.length === 2, "无管理器时挂出 ⚙ 兜底菜单（按钮 + 列表）");
  ok(apiB.warns.length >= 1, "跨域被记进告警，便于用户自查");

  console.log("■ 与各脚本的内联内容一致性");
  const src = fs.readFileSync(SRC, "utf8").split(String.fromCharCode(13)).join("").trim();
  // 需要兼容层的脚本清单（boss-deliver 不在公开仓库分发，所以这里不能硬编码它；
  // 之前硬编码导致删掉该文件后本用例直接 ENOENT 崩溃）。缺文件时跳过并说明，而不是崩。
  ["boss-chat.user.js", "boss-watcher.user.js", "boss-insight.user.js", "boss-deliver.user.js"].forEach(function (f) {
    if (!fs.existsSync(path.join(ROOT, f))) { console.log("  · 跳过 " + f + "（不在本仓库）"); return; }
    const t = fs.readFileSync(path.join(ROOT, f), "utf8").split(String.fromCharCode(13)).join("");
    ok(t.indexOf(src) >= 0, f + " 已内联最新兼容层");
  });

  console.log(NL + (fail ? ("✗ 失败 " + fail + " 项 / 通过 " + pass + " 项") : ("✓ 全部通过（" + pass + " 项）")));
  process.exitCode = fail ? 1 : 0;
})();
