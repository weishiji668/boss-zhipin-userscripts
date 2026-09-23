#!/usr/bin/env node
// 语法门禁：对仓库根目录的 .user.js 逐个跑 node --check。
// 用法：node tools/check-syntax.cjs [--root <dir>]
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();

let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
  if (r.status === 0) console.log("[OK  ] " + f);
  else { bad++; console.log("[FAIL] " + f); console.log((r.stderr || "").trim()); }
}
console.log("");
console.log("语法检查：" + (files.length - bad) + " 通过 / " + bad + " 失败");
process.exit(bad ? 1 : 0);
