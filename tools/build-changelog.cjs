#!/usr/bin/env node
// 从各脚本头部的 @description 生成 CHANGELOG.md。
//
// 为什么这么做：这个项目的每个脚本都有一份「从首版写到今天」的完整更新日志，就藏在
// @description 里（v1.2.3：修…v1.2.4：修…v1.3.0：…）。与其手抄一份 CHANGELOG 再跟
// 代码对不上，不如直接从这里抽 —— 脚本头部永远是最新的事实来源。
//
// 用法：node tools/build-changelog.cjs [--root <dir>] [--out CHANGELOG.md] [--check]
//   --check 只比对、不写文件（给 CI 用：CHANGELOG 过期就报错）
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));
const OUT = path.resolve(ROOT, argOf("--out", "CHANGELOG.md"));
const CHECK = argv.includes("--check");

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

const VER_RE = /v(\d+)\.(\d+)\.(\d+)/g;
const cmp = (a, b) => (b[1] - a[1]) || (b[2] - a[2]) || (b[3] - a[3]);

function splitEntries(desc) {
  const marks = [];
  let m;
  VER_RE.lastIndex = 0;
  while ((m = VER_RE.exec(desc))) marks.push({ v: [m[1], m[2], m[3]].map(Number), raw: m[0], start: m.index, end: m.index + m[0].length });
  const head = marks.length ? desc.slice(0, marks[0].start).trim() : desc.trim();
  const items = [];
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].end;
    const to = i + 1 < marks.length ? marks[i + 1].start : desc.length;
    const text = desc.slice(from, to).replace(/^[：:]\s*/, "").trim();
    items.push({ v: marks[i].v, raw: marks[i].raw, text });
  }
  return { head, items };
}

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();
const out = []
out.push("# 更新日志")
out.push("")
out.push("> 本文件由 `tools/build-changelog.cjs` 从各脚本头部的 `@description` 自动生成，**请勿手改**。")
out.push("> 每个脚本的 `@description` 里保留着从首版至今的完整条目，那是事实来源。")
out.push("")

for (const f of files) {
  const keys = parseHeader(fs.readFileSync(path.join(ROOT, f), "utf8"));
  if (!keys) { out.push("## " + f + "\n\n（读不到头块）\n"); continue; }
  const name = (keys["@name"] || [f])[0];
  const ver = (keys["@version"] || ["?"])[0];
  const desc = (keys["@description"] || [""])[0];
  const { head, items } = splitEntries(desc);
  out.push("## " + name + "  ·  `" + f + "`")
  out.push("")
  out.push("当前版本 **v" + ver + "**" + (head ? " —— " + head : ""))
  out.push("")
  const seen = new Map()
  const sorted = items.slice().sort((a, b) => cmp(a.v, b.v))
  for (const it of sorted) {
    const key = it.v.join(".")
    const text = it.text || "（该版本没有留下文字说明）"
    if (seen.has(key)) { if (!seen.get(key).includes(text)) seen.get(key).push(text); continue; }
    seen.set(key, [text])
  }
  for (const [key, texts] of seen) {
    out.push("### v" + key)
    out.push("")
    for (const t of texts) out.push("- " + t)
    out.push("")
  }
}

const text = out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";

if (CHECK) {
  // 比对前统一行尾：Windows 上 core.autocrlf=true 时磁盘里是 CRLF，而生成的是 LF。
  // 不统一的话本地永远报「已过期」而 CI（Linux）是绿的 —— 实测踩过。
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (cur === text) { console.log("[OK] CHANGELOG.md 与脚本头部一致"); process.exit(0); }
  console.log("[FAIL] CHANGELOG.md 已过期（跑 node tools/build-changelog.cjs 重新生成）");
  process.exit(1);
}
fs.writeFileSync(OUT, text, "utf8");
console.log("已生成 " + path.relative(ROOT, OUT) + "（" + files.length + " 个脚本，" + text.split("\n").length + " 行）");
