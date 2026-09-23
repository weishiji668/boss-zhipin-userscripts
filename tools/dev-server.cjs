#!/usr/bin/env node
// 本地安装 / 更新服务（开发用）。
//
// 作用：把仓库里的 .user.js 通过 http 暴露给篡改猴，并给一个带版本号的安装入口页 ——
// 改完脚本不用手动拖文件，浏览器点一下就能「更新」，装到的就是当前磁盘上的版本。
//
// 用法：node tools/dev-server.cjs [--dir <脚本目录>] [--port 8899] [--host 127.0.0.1]
//       默认：脚本目录 = 仓库根目录，端口 = 8899，只监听本机回环地址。
//
// 安全提醒：只在本机开、只服务你自己的脚本目录；别绑 0.0.0.0，别指向别处。
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const DIR = path.resolve(argOf("--dir", path.join(__dirname, "..")));
const PORT = Number(argOf("--port", process.env.PORT || 8899));
const HOST = argOf("--host", "127.0.0.1");

function fileInfo(f) {
  const full = path.join(DIR, f);
  let ver = "", name = "", mtime = 0;
  try {
    const head = fs.readFileSync(full, "utf8").slice(0, 4000);
    const mv = head.match(/\/\/\s*@version\s+([^\s]+)/);
    const mn = head.match(/\/\/\s*@name\s+(.+)/);
    ver = mv ? mv[1] : "?";
    name = mn ? mn[1].trim() : "";
  } catch { /* 读不到就留空 */ }
  try { mtime = fs.statSync(full).mtimeMs; } catch { /* 同上 */ }
  return { f, ver, name, mtime };
}

function fmtTime(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(String(req.url || "/").split("?")[0]);
  if (url === "/" || url === "/index.html") {
    let files = [];
    try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".user.js")); } catch { /* 目录不可读 */ }
    const rows = files.map(fileInfo).sort((a, b) => b.mtime - a.mtime).map((x) =>
      `<li style="margin:8px 0"><a href="/${encodeURIComponent(x.f)}" style="font-weight:600">${x.f}</a> <b style="color:#2f6bff">v${x.ver}</b> <span style="color:#666;font-size:13px">· ${fmtTime(x.mtime)}</span></li>`)
      .join("");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(`<!DOCTYPE html><meta charset="utf-8"><title>安装 / 更新脚本</title>
<body style="font:16px/1.9 system-ui, Microsoft YaHei;padding:28px;max-width:680px">
<h2>点下面的链接安装 / 更新</h2>
<p style="color:#666;font-size:13px;margin:6px 0">列表显示每个脚本的 <b>当前版本</b> 与 <b>文件更新时间</b>（最新改动的排最上面）。</p>
<p style="color:#666;font-size:13px;margin:6px 0">点链接 → 篡改猴弹窗点「安装 / 更新」→ 回目标页面按 <b>Ctrl+Shift+R</b> 强刷。</p>
<ul style="padding-left:22px">${rows}</ul>
<p style="color:#999;font-size:12px">服务目录：${DIR}</p></body>`);
    return;
  }
  // 只服务 .user.js：既挡住目录穿越（basename 会吃掉 ../），也避免这个本地服务
  // 顺带把仓库里其它文件（配置、测试、文档）暴露出去。
  const name = path.basename(url);
  const file = path.join(DIR, name);
  if (!name.endsWith(".user.js") || !file.startsWith(DIR) || !fs.existsSync(file)) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  let src = "";
  try { src = fs.readFileSync(file, "utf8"); }
  catch (e) { res.statusCode = 500; res.end("read error: " + e.message); return; }
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(src);
});

server.listen(PORT, HOST, () => {
  console.log("脚本目录：" + DIR);
  console.log("安装入口：http://" + HOST + ":" + PORT + "/");
  console.log("（Ctrl+C 停止）");
});
