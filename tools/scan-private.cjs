#!/usr/bin/env node
// 私有内容扫描：把「会泄露个人数据 / 会带上第三方版权内容」的字符串挡在提交之前。
//
// 用法：node tools/scan-private.cjs [--root <dir>] [--json]
//
// 它和普通 grep 的区别：分两档。
//   HARD —— 命中即失败：本机绝对路径、真实抓包文件、站方前端源码、私钥、真实 API Key。
//   SOFT —— 只统计：bst= / Zp_token / Bearer / securityId 这类「代码里的名字」。
//            脚本本来就要读站点 cookie、拼请求头，出现是正常实现，不该让 CI 变红。
//
// 特征表放在 tools/scan-private.patterns.json（数据文件），这样扫描器源码本身不含
// 「它要检测的那些字符串」，避免自己命中自己；登记放行的假数据见 scan-private.allowlist.json。
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));
const AS_JSON = argv.includes("--json");

const SKIP_DIRS = new Set([".git", "node_modules", "archive", "dist", "coverage"]);
const SKIP_FILES = new Set(["package-lock.json", "scan-private.cjs", "scan-private.patterns.json", "scan-private.allowlist.json"]);
const TEXT_EXT = /\.(js|cjs|mjs|ts|md|json|ya?ml|html|css|txt)$/i;

const PATTERNS_PATH = path.join(__dirname, "scan-private.patterns.json");
const PATTERNS = JSON.parse(fs.readFileSync(PATTERNS_PATH, "utf8"));
const SOFT = PATTERNS.soft || [];

// 本机路径检测：不写字面反斜杠，改用字符码拼，避免转义歧义。
const BS = String.fromCharCode(92);
const SL = "/";
const DRIVE = /[A-Za-z]:/;
const USER_DIRS = [BS + "Users" + BS, BS + "Users" + SL, SL + "Users" + SL];
const looksLikeLocalPath = (line) => DRIVE.test(line) && USER_DIRS.some((c) => line.includes(c));

function buildRules() {
  const rules = [];
  for (const r of PATTERNS.hard || []) {
    if (r.type === "path") { rules.push({ name: r.name, test: looksLikeLocalPath }); continue; }
    const list = (r.patterns || []).map((p) => p.toLowerCase());
    if (r.type === "includes") {
      const all = r.mode === "all";
      rules.push({ name: r.name, test: (l) => { const s = l.toLowerCase(); return all ? list.every((p) => s.includes(p)) : list.some((p) => s.includes(p)); } });
      continue;
    }
    if (r.type === "regex") {
      const res = (r.patterns || []).map((p) => new RegExp(p));
      rules.push({ name: r.name, test: (l) => res.some((re) => re.test(l)) });
    }
  }
  return rules;
}
const HARD = buildRules();

// 允许清单：有些「疑似泄露」其实是测试用的假 key（canary），必须显式登记才放行。
// 登记了什么，输出里会单独列出来 —— 谁放行的、放行了什么，一眼可见。
const ALLOW_PATH = path.join(__dirname, "scan-private.allowlist.json");
let ALLOW = [];
try { ALLOW = JSON.parse(fs.readFileSync(ALLOW_PATH, "utf8")).allow || []; } catch { ALLOW = []; }
const isAllowed = (h) => ALLOW.some((a) => a.file === h.file && a.rule === h.rule);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); continue; }
    if (SKIP_FILES.has(e.name)) continue;
    if (!TEXT_EXT.test(e.name)) continue;
    out.push(p);
  }
  return out;
}

const files = walk(ROOT, []);
const hard = [];
const allowedHits = [];
const softCount = Object.fromEntries(SOFT.map((s) => [s, 0]));

for (const f of files) {
  let text = "";
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const rel = path.relative(ROOT, f).split(path.sep).join(SL);
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of HARD) {
      if (rule.test(line)) {
        const hit = { file: rel, line: i + 1, rule: rule.name, sample: line.trim().slice(0, 120) };
        if (isAllowed(hit)) allowedHits.push(hit); else hard.push(hit);
      }
    }
    for (const s of SOFT) if (line.includes(s)) softCount[s]++;
  });
}

if (AS_JSON) {
  console.log(JSON.stringify({ root: ROOT, scanned: files.length, hard, soft: softCount }, null, 2));
} else {
  console.log("扫描目录：" + ROOT);
  console.log("扫描文件：" + files.length + " 个文本文件");
  console.log("");
  if (hard.length) {
    console.log("HARD 命中 " + hard.length + " 处（处理完才能提交）：");
    for (const h of hard) console.log("  x " + h.file + ":" + h.line + "  [" + h.rule + "]  " + h.sample);
    console.log("");
  } else {
    console.log("HARD 命中 0 处 ✓");
    console.log("");
  }
  if (allowedHits.length) {
    console.log("已登记放行的假数据（canary）" + allowedHits.length + " 处，见 tools/scan-private.allowlist.json：");
    for (const h of allowedHits) console.log("  · " + h.file + ":" + h.line + "  [" + h.rule + "]");
    console.log("");
  }
  console.log("SOFT 统计（实现里的字段名/请求头名，不阻塞）：");
  for (const [k, v] of Object.entries(softCount)) console.log("  · " + k + " : " + v + " 行");
}
process.exit(hard.length ? 1 : 0);
