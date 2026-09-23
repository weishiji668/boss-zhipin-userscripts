#!/usr/bin/env node
// 用户脚本元数据校验：发布前必须全绿。
//
// 用法：node tools/verify-headers.cjs [--root <dir>] [--strict]
//   --strict 把「仓库地址还没填（OWNER/REPO 占位）」也算失败 —— 打 tag / 发布时用；
//   平时（PR CI）只算警告，这样仓库在"还没定仓库名"的阶段也能保持绿灯。
"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argOf("--root", path.join(__dirname, "..")));
const STRICT = argv.includes("--strict");

const REQUIRED = ["@name", "@namespace", "@version", "@description", "@author", "@license", "@homepageURL", "@supportURL", "@updateURL", "@downloadURL"];
// 占位地址的判定要按「路径段」比对：owner 叫 testuser、repo 叫 testrepo 时不该误报，
// 而 OWNER/REPO 这种真占位必须报出来。
const PLACEHOLDER = /(^|\/)(OWNER|REPO)(\/|$)|example\.com/i;

function parseHeader(src) {
  const block = src.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) return null;
  const keys = {};
  for (const line of block[1].split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s*(@\S+)\s*(.*)$/);
    if (!m) continue;
    (keys[m[1]] = keys[m[1]] || []).push(m[2].trim());
  }
  return keys;
}

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".user.js")).sort();
const rows = [];
const seen = new Map();

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const header = parseHeader(src);
  const errors = [];
  const warns = [];
  if (!header) {
    rows.push({ f, ver: "?", errors: ["找不到 ==UserScript== 头块"], warns });
    continue;
  }
  for (const k of REQUIRED) if (!header[k] || !header[k][0]) errors.push("缺 " + k);
  if (!header["@match"]) errors.push("缺 @match");
  if (!header["@grant"]) errors.push("缺 @grant");

  const ver = (header["@version"] || ["?"])[0];
  const desc = (header["@description"] || [""])[0];
  if (ver !== "?" && desc && !desc.includes("v" + ver) && !desc.includes(ver)) {
    errors.push("@description 里找不到 v" + ver + "（本项目的约定：描述末尾是完整更新日志）");
  }

  for (const k of ["@homepageURL", "@supportURL", "@updateURL", "@downloadURL"]) {
    const v = (header[k] || [""])[0];
    if (v && PLACEHOLDER.test(v)) {
      const msg = k + " 还是占位地址（" + v + "）";
      if (STRICT) errors.push(msg); else warns.push(msg);
    }
  }
  const upd = (header["@updateURL"] || [""])[0];
  if (upd && !upd.endsWith("/" + f)) errors.push("@updateURL 文件名与脚本不一致：" + upd);

  if ((header["@connect"] || []).some((x) => x === "*")) warns.push("@connect 含通配符 *（公开仓库建议收窄到具体域名）");
  if (!header["@noframes"]) warns.push("缺 @noframes（会在 iframe 里重复注入）");
  if (!header["@run-at"]) warns.push("缺 @run-at");

  const name = (header["@name"] || [""])[0];
  const ns = (header["@namespace"] || [""])[0];
  const key = ns + "|" + name;
  if (seen.has(key)) errors.push("和 " + seen.get(key) + " 的 @name+@namespace 完全相同（篡改猴会当成同一个脚本）");
  else seen.set(key, f);

  rows.push({ f, ver, errors, warns });
}

const bad = rows.filter((r) => r.errors.length);
const wsrc = rows.filter((r) => !r.errors.length && r.warns.length);

console.log("元数据校验" + (STRICT ? "（严格模式：占位地址算失败）" : "") + "  共 " + rows.length + " 个脚本");
console.log("");
for (const r of rows) {
  const tag = r.errors.length ? "FAIL" : (r.warns.length ? "WARN" : "OK  ");
  console.log("[" + tag + "] " + r.f + "  v" + r.ver);
  for (const e of r.errors) console.log("        x " + e);
  for (const w of r.warns) console.log("        ! " + w);
}
console.log("");
console.log("结果：" + (rows.length - bad.length) + " 通过 / " + bad.length + " 失败 / " + wsrc.length + " 有警告");
process.exit(bad.length ? 1 : 0);
