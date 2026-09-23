#!/usr/bin/env node
// 给用户脚本补「发布元数据」：@license / @homepageURL / @supportURL / @updateURL / @downloadURL。
//
// 用法：
//   node tools/set-repo-meta.cjs --owner <GitHub用户名> --repo <仓库名> [--author <署名>] [--namespace <命名空间>] [--dry]
// 例：
//   node tools/set-repo-meta.cjs --owner <你的 GitHub 用户名> --repo jiajianchengchu-boss --author <署名>
//   （项目显示名是「加减乘除boss」；GitHub 仓库名只能用 ASCII 字母/数字/.-_ ，所以仓库名用拼音）
//
// 承诺：只改 ==UserScript== 头块，正文一个字节都不动；重复执行结果一致（幂等）；
// 先用 --dry 看一遍再落盘。
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const OWNER = argOf("--owner", "");
const REPO = argOf("--repo", "");
const AUTHOR = argOf("--author", OWNER);
const NAMESPACE = argOf("--namespace", "");
const LICENSE = argOf("--license", "MIT");
const DRY = argv.includes("--dry");
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));

if (!OWNER || !REPO) {
  console.log("用法：node tools/set-repo-meta.cjs --owner <用户名> --repo <仓库名> [--author <署名>] [--namespace <命名空间>] [--dry]");
  process.exit(2);
}

const BASE = "https://github.com/" + OWNER + "/" + REPO;
const RAW = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/main/";
const PAD = 14;   // 与现有头部对齐宽度一致：// @name + 补空格到 14 列 + 值
const fmt = (k, v) => "// " + k.padEnd(PAD) + v;

// 需要「确保存在」的键（缺失时按这个顺序插到 @author 之后）
const ADD_AFTER_AUTHOR = [
  ["@license", LICENSE],
  ["@homepageURL", BASE],
  ["@supportURL", BASE + "/issues"],
  ["@updateURL", RAW],
  ["@downloadURL", RAW],
];

const HEAD_RE = /\/\/ ==UserScript==\r?\n([\s\S]*?)\/\/ ==\/UserScript==\r?\n/;
const isManaged = (k) => ["@license", "@homepageURL", "@supportURL", "@updateURL", "@downloadURL"].includes(k);

function valueFor(key, fname, fallback) {
  if (key === "@license") return LICENSE;
  if (key === "@homepageURL") return BASE;
  if (key === "@supportURL") return BASE + "/issues";
  if (key === "@updateURL" || key === "@downloadURL") return RAW + fname;
  return fallback;
}

function updateHeader(src, fname) {
  const m = src.match(HEAD_RE);
  if (!m) return { ok: false, why: "没有 ==UserScript== 头块" };
  const lines = m[1].split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  const out = [];
  const have = new Set();
  for (const raw of lines) {
    const km = raw.match(/^\s*\/\/\s*(@\S+)\s*(.*)$/);
    if (!km) { out.push(raw); continue; }
    const key = km[1];
    have.add(key);
    if (key === "@namespace" && NAMESPACE) { out.push(fmt(key, NAMESPACE)); continue; }
    if (key === "@author") { out.push(fmt(key, AUTHOR || km[2].trim())); continue; }
    if (isManaged(key)) { out.push(fmt(key, valueFor(key, fname, km[2].trim()))); continue; }
    out.push(raw);
  }

  const missing = ADD_AFTER_AUTHOR.filter(([k]) => !have.has(k));
  if (missing.length) {
    let at = out.findIndex((l) => /^\s*\/\/\s*@author\s/.test(l));
    if (at < 0) at = out.findIndex((l) => /^\s*\/\/\s*@version\s/.test(l));
    if (at < 0) at = out.findIndex((l) => /^\s*\/\/\s*@name\s/.test(l));
    if (at < 0) at = out.length - 1;
    const injected = missing.map(([k]) => fmt(k, valueFor(k, fname, "")));
    out.splice(at + 1, 0, ...injected);
  }

  // 只重写头块本身，头块之后的内容原样接回去
  const headerText = "// ==UserScript==\n" + out.join("\n") + "\n// ==/UserScript==\n";
  const text = src.slice(0, m.index) + headerText + src.slice(m.index + m[0].length);
  return { ok: true, text, added: missing.map(([k]) => k) };
}

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();
let changed = 0;
for (const f of files) {
  const full = path.join(ROOT, f);
  const src = fs.readFileSync(full, "utf8");
  const r = updateHeader(src, f);
  if (!r.ok) { console.log("[skip] " + f + " —— " + r.why); continue; }
  if (r.text === src) { console.log("[same] " + f); continue; }
  changed++;
  console.log((DRY ? "[dry ] " : "[write] ") + f + "  新增：" + (r.added.length ? r.added.join(" ") : "（无，只更新值）"));
  if (!DRY) fs.writeFileSync(full, r.text, "utf8");
}
console.log("");
console.log((DRY ? "预览模式：没有写入。去掉 --dry 才会落盘。" : "已写入 " + changed + " 个文件。") + "  仓库地址：" + BASE);
