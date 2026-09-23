#!/usr/bin/env node
// 发布地址一致性检查：脚本头部、README、docs 三处的仓库地址必须对得上，且得是 GitHub 能创建的仓库名。
//
// 为什么需要它（真实踩到的两个坑）：
//   ① 跑完 set-repo-meta 只改了脚本头部，README / docs/install.md 里还是 OWNER/REPO ——
//      安装链接与 CI 徽章指向一个不存在的地址，而门禁全绿。
//   ② 仓库名用了中文（如「加减乘除boss」）—— GitHub 官方文档写明：
//      "The repository name must not exceed 100 characters, and can only contain ASCII letters, digits,
//       and the characters . - _" —— 这种名字根本建不出来，@updateURL 也就永远是死的。
//
// 用法：node tools/check-doc-links.cjs [--root <dir>]
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));

const errors = [];
const warnings = [];

// 1) 从脚本头部取出仓库地址（要求 6 个脚本完全一致）
const scripts = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();
const urls = new Map();
for (const f of scripts) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const m = src.match(/\/\/\s*@homepageURL\s+(https:\/\/github\.com\/[^\s/]+\/[^\s/]+)/);
  if (!m) { errors.push(f + "：没有 @homepageURL"); continue; }
  urls.set(f, m[1].replace(/\/+$/, ""));
}
const distinct = [...new Set(urls.values())];
if (distinct.length > 1) errors.push("脚本之间的 @homepageURL 不一致：" + distinct.join(" / "));

const home = distinct[0] || "";
const mm = home.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
let owner = "", repo = "";
if (!mm) {
  if (home) errors.push("无法解析 @homepageURL：" + home);
} else {
  owner = mm[1]; repo = mm[2];
  // 2) 仓库名必须是 GitHub 能创建的：ASCII 字母/数字/. - _，≤100 字符
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) {
    errors.push("仓库名「" + repo + "」不是合法的 GitHub 仓库名（只能用 ASCII 字母、数字与 . - _；中文名请放到仓库描述或 README 标题里）");
  }
  if (repo.length > 100) errors.push("仓库名超过 100 字符");
  if (!/^[A-Za-z0-9-]+$/.test(owner)) warnings.push("owner「" + owner + "」含可疑字符，请确认");
}

// 3) 文档里不能还留占位，且 raw 链接必须指向真实存在的文件
const mdFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!["node_modules", ".git", "images"].includes(e.name)) walk(path.join(dir, e.name)); continue; }
    if (e.name.endsWith(".md")) mdFiles.push(path.join(dir, e.name));
  }
})(ROOT);

for (const p of mdFiles) {
  const rel = path.relative(ROOT, p).split(path.sep).join("/");
  const text = fs.readFileSync(p, "utf8");
  if (text.includes("OWNER/REPO")) {
    const n = text.split("OWNER/REPO").length - 1;
    errors.push(rel + "：还有 " + n + " 处 OWNER/REPO 占位（跑 npm run meta:set 会一起替换）");
  }
  if (owner && repo) {
    for (const m2 of text.matchAll(/raw\.githubusercontent\.com\/([^/\s)]+)\/([^/\s)]+)\/([^/\s)]+)\/([^\s)"']+)/g)) {
      const [, o2, r2, , file] = m2;
      if (o2 !== owner || r2 !== repo) continue;   // 别人的仓库链接（如上游项目）不管
      const target = path.join(ROOT, file);
      if (!fs.existsSync(target)) errors.push(rel + "：链接指向不存在的文件 " + file);
    }
    for (const m3 of text.matchAll(/github\.com\/([^/\s)]+)\/([^/\s)]+)\/actions\/workflows\//g)) {
      if (m3[1] !== owner || m3[2] !== repo) errors.push(rel + "：CI 徽章还指着 " + m3[1] + "/" + m3[2]);
    }
  }
}

console.log("发布地址检查：脚本 " + scripts.length + " 个，仓库 " + (owner ? owner + "/" + repo : "（未解析出）"));
for (const w of warnings) console.log("  ! " + w);
if (errors.length) {
  for (const e of errors) console.log("  x " + e);
  console.log("");
  console.log("失败 " + errors.length + " 项：发布前必须处理（否则安装链接 / 自动更新指向不存在的地址）");
  process.exit(1);
}
console.log("  ✓ 脚本头部、README、docs 三处地址一致，且仓库名符合 GitHub 规则");
