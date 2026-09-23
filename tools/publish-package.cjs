#!/usr/bin/env node
// 把 6 个用户脚本发成一个 npm 包到 GitHub Packages（就是仓库侧栏那个「包裹 / Packages」）。
//
// 设计要点：
//   1) 版本号只认 .release/release.json 的 tag（去掉前缀 v）—— 仓库里只有这一处版本来源，
//      不会出现「Release 发了 v0.2.0、包还停在 0.1.0」这种漂移。CI 里临时改写本工作区的
//      package.json 版本，不落回仓库。
//   2) 用 Actions 每次运行自带的仓库令牌，不需要任何人的个人令牌，也不需要登录。
//   3) 幂等：同版本已发布过就跳过，所以重复 push 不会把 CI 弄红。
//
// 用法：
//   由 .github/workflows/package.yml 调用（push 到 main 且改动 .release/** 时）
//   本地预览：node tools/publish-package.cjs --dry
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, ".release", "release.json");
const PKG = path.join(ROOT, "package.json");
const REGISTRY = "https://npm.pkg.github.com";
const DRY = process.argv.includes("--dry");

const fail = (m) => { console.error("[package] " + m); process.exit(1); };

if (!fs.existsSync(META)) fail("缺少 .release/release.json");
const meta = JSON.parse(fs.readFileSync(META, "utf8"));
if (!meta.tag) fail(".release/release.json 里必须有 tag");
const version = String(meta.tag).replace(/^v/, "");

const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
const name = pkg.name;
if (!name || !name.startsWith("@")) fail("package.json 的 name 必须是带 scope 的（GitHub Packages 要求，形如 @owner/name）");

if (DRY) {
  console.log("[package] 预览（没有发任何东西）");
  console.log("  包名     : " + name);
  console.log("  版本     : " + version + "（取自 .release/release.json 的 tag " + meta.tag + "）");
  console.log("  注册表   : " + (pkg.publishConfig && pkg.publishConfig.registry || REGISTRY));
  console.log("  包含文件 : " + (pkg.files || []).join(" / "));
  process.exit(0);
}

if (process.env.GITHUB_ACTIONS !== "true") fail("为避免误发，只有 CI 里才真正发布；本地请用 --dry 预览");

if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("[package] CI 内临时把 package.json 版本改成 " + version + "（只改工作区）");
}

const env = Object.assign({}, process.env);
env.NODE_AUTH_TOKEN = process.env.NODE_AUTH_TOKEN || process.env.GITHUB_TOKEN || "";

let published = false;
try {
  execFileSync("npm", ["view", name + "@" + version, "version", "--registry", REGISTRY], { cwd: ROOT, env, stdio: "pipe" });
  published = true;
} catch (e) { published = false; }

if (published) {
  console.log("[package] " + name + "@" + version + " 已经发布过 → 跳过（幂等，不会报错）");
  process.exit(0);
}

console.log("[package] 发布 " + name + "@" + version + " → " + REGISTRY);
try {
  execFileSync("npm", ["publish", "--registry", REGISTRY, "--access", "public"], { cwd: ROOT, env, stdio: "inherit" });
} catch (e) {
  fail("npm publish 失败：" + (e.message || e));
}
console.log("[package] OK：https://github.com/weishiji668/boss-zhipin-userscripts/pkgs/npm/boss-zhipin-userscripts");