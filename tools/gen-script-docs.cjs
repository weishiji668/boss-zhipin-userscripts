#!/usr/bin/env node
// 从脚本头部 + 代码事实，生成 docs/scripts/<名字>.md 骨架。
//
// 为什么用生成：手写 7 份文档最容易跟代码脱节的就是「权限」和「本机数据键」
// 这两块 —— 而它们都能从代码里读出来，那就别抄。
//
// 用法：node tools/gen-script-docs.cjs [--root <dir>]
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));
const CHECK = argv.includes("--check");   // 只比对不写入：给 CI 用，文档过期就报错
const OUTDIR = path.join(ROOT, "docs", "scripts");
fs.mkdirSync(OUTDIR, { recursive: true });

function parseHeader(src) {
  const block = src.match(/\/\/ ==UserScript==\r?\n([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) return null;
  const keys = {};
  for (const line of block[1].split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s*(@\S+)\s*(.*)$/);
    if (!m) continue;
    (keys[m[1]] = keys[m[1]] || []).push(m[2].trim());
  }
  return keys;
}

const uniq = (arr) => [...new Set(arr)].sort();

// 引号用 \x22 / \x27 表示，避免源码里出现引号字符造成转义混乱
// 常量名可能是 K_SET / LS_KEY / JD_KEY / BC_UNMARK…，所以不限定前缀，只要求「值长得像存储键」（小写+下划线）
const RE_CONST = /const\s+[A-Za-z0-9_]+\s*=\s*[\x22\x27]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)[\x22\x27]/g;
const RE_LS = /localStorage\.(?:getItem|setItem|removeItem)\(\s*[\x22\x27]([^\x22\x27]+)[\x22\x27]/g;
const RE_BARE = /[\x22\x27]((?:bwf?|bt|bc|bi|bd)_[a-z0-9_]+)[\x22\x27]/g;

// 本机存储键：常量、localStorage 直读写、以及裸的 bw_/bt_/bc_/bi_/bd_ 字符串
function storageKeys(src) {
  const keys = [];
  for (const m of src.matchAll(RE_CONST)) keys.push(m[1]);
  for (const m of src.matchAll(RE_LS)) keys.push(m[1]);
  for (const m of src.matchAll(RE_BARE)) keys.push(m[1]);
  return uniq(keys);
}

// 跨脚本 DOM 标记（协同协议）
function domMarkers(src) {
  const out = [];
  for (const m of src.matchAll(/data-(?:bw|bt|bc|bi|bd)[a-z-]*/g)) out.push(m[0]);
  return uniq(out);
}

const countAll = (src, re) => [...src.matchAll(re)].length;

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();
const index = [];
const drifted = [];

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const h = parseHeader(src);
  if (!h) continue;
  const slug = f.replace(/^boss-/, "").replace(/\.user\.js$/, "");
  const name = (h["@name"] || [f])[0];
  const ver = (h["@version"] || ["?"])[0];
  const desc = (h["@description"] || [""])[0];
  const head = desc.split(/v\d+\.\d+\.\d+/)[0].trim();
  const keys = storageKeys(src);
  const markers = domMarkers(src);
  const reqs = countAll(src, /GM_xmlhttpRequest|fetch\(/g);

  const lines = [];
  lines.push("# " + name);
  lines.push("");
  lines.push("> 本页由 \`tools/gen-script-docs.cjs\` 从脚本头部与代码事实生成；要改内容请改脚本本身后重跑。");
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push("| 文件 | \`" + f + "\` |");
  lines.push("| 版本 | v" + ver + " |");
  lines.push("| 生效页面 | " + (h["@match"] || []).join("、") + " |");
  lines.push("| 运行时机 | " + ((h["@run-at"] || ["?"])[0]) + (h["@noframes"] ? "（@noframes：不在 iframe 里重复注入）" : "") + " |");
  lines.push("");
  lines.push("## 它做什么");
  lines.push("");
  lines.push(head || "（脚本头部没有写概述）");
  lines.push("");
  lines.push("## 权限");
  lines.push("");
  if (h["@grant"]) for (const g of h["@grant"]) lines.push(g === "none" ? "- 无（\`@grant none\`，不用任何油猴 API）" : "- \`" + g + "\`");
  lines.push("");
  if (h["@connect"]) {
    lines.push("可连接域名（@connect）：");
    lines.push("");
    for (const c of h["@connect"]) lines.push("- \`" + c + "\`");
    lines.push("");
  }
  lines.push("## 本机数据（只存在你自己的浏览器里）");
  lines.push("");
  if (keys.length) for (const k of keys) lines.push("- \`" + k + "\`");
  else lines.push("（这个脚本不落盘任何数据）");
  lines.push("");
  lines.push("## 与其它脚本的协同标记");
  lines.push("");
  if (markers.length) for (const m of markers) lines.push("- \`" + m + "\`");
  else lines.push("（不参与 DOM 标记协同）");
  lines.push("");
  lines.push("## 网络行为");
  lines.push("");
  lines.push("脚本里的请求入口（\`GM_xmlhttpRequest\` / \`fetch\`）共 " + reqs + " 处，触发条件见 [风险与安全边界](../risk-and-safety.md)。");
  lines.push("");
  lines.push("## 完整更新日志");
  lines.push("");
  lines.push("见 [CHANGELOG.md](../../CHANGELOG.md) 中「" + name + "」一节（由脚本头部的 \`@description\` 自动生成）。");
  lines.push("")

  const outPath = path.join(OUTDIR, slug + ".md");
  const text = lines.join("\n");
  // 同上：比对前统一行尾（Windows 磁盘是 CRLF，生成的是 LF）
  if (CHECK) { const cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8").replace(/\r\n/g, "\n") : ""; if (cur !== text) drifted.push("docs/scripts/" + slug + ".md"); }
  else fs.writeFileSync(outPath, text, "utf8");
  index.push({ slug, name, ver, f });
  console.log((CHECK ? "[check] " : "[write] ") + "docs/scripts/" + slug + ".md   (" + name + " v" + ver + ")");
}

const idx = ["# 脚本索引", "", "| 脚本 | 版本 | 说明 |", "| --- | --- | --- |"];
for (const it of index) idx.push("| [\`" + it.slug + "\`](" + it.slug + ".md) | v" + it.ver + " | " + it.name + " |");
idx.push("");
const idxText = idx.join("\n");
const idxPath = path.join(OUTDIR, "README.md");
if (CHECK) {
  const cur = fs.existsSync(idxPath) ? fs.readFileSync(idxPath, "utf8").replace(/\r\n/g, "\n") : "";
  if (cur !== idxText) drifted.push("docs/scripts/README.md");
  if (drifted.length) { console.log("[FAIL] 生成的脚本文档已过期（跑 node tools/gen-script-docs.cjs 重新生成）："); for (const d of drifted) console.log("  · " + d); process.exit(1); }
  console.log("[OK] docs/scripts 与脚本头部一致（" + index.length + " 个脚本）");
  process.exit(0);
}
fs.writeFileSync(idxPath, idxText, "utf8");
console.log("[write] docs/scripts/README.md  （索引，" + index.length + " 个脚本）");
