#!/usr/bin/env node
// 发版：把 .release/release.json 描述的版本发布到 GitHub Releases。
//
// 为什么走 CI 而不是本地打 tag：创建 Release 需要仓库写权限。Actions 每次运行都自带一个
// 仓库令牌（github.token），所以「发版」就变成 —— 改 .release/release.json 与 .release/notes.md
// 然后 push，不需要任何人的个人令牌，也不需要登录。
//
// 用法：
//   由 .github/workflows/release.yml 自动调用（push 到 main 且改动 .release/** 时）
//   本地预览：node tools/publish-release.cjs --dry
//   本地真发（需要个人令牌）：GITHUB_TOKEN=xxx GITHUB_REPOSITORY=owner/repo node tools/publish-release.cjs
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, ".release", "release.json");
const NOTES = path.join(ROOT, ".release", "notes.md");

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "";
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const DRY = process.argv.includes("--dry");

const fail = (m) => { console.error("[release] " + m); process.exit(1); };

if (!fs.existsSync(META)) fail("缺少 .release/release.json");
let meta;
try { meta = JSON.parse(fs.readFileSync(META, "utf8")); } catch (e) { fail(".release/release.json 不是合法 JSON：" + e.message); }
if (!meta.tag) fail(".release/release.json 里必须有 tag");
const notes = fs.existsSync(NOTES) ? fs.readFileSync(NOTES, "utf8") : "";

const body = {
  tag_name: meta.tag,
  name: meta.title || meta.tag,
  body: notes,
  draft: !!meta.draft,
  prerelease: !!meta.prerelease
};
if (process.env.GITHUB_SHA) body.target_commitish = process.env.GITHUB_SHA;

if (DRY) {
  console.log("[release] 预览（没有发任何东西）");
  console.log("  tag      : " + body.tag_name);
  console.log("  title    : " + body.name);
  console.log("  prerelease: " + body.prerelease + "   draft: " + body.draft);
  console.log("  notes    : " + notes.split("\n").length + " 行 / " + notes.length + " 字符");
  process.exit(0);
}

if (!TOKEN) fail("没有 GITHUB_TOKEN（CI 里由 workflow 提供；本地跑请自己传）");
if (!REPO) fail("没有 GITHUB_REPOSITORY（形如 owner/name）");

(async () => {
  const headers = {
    Authorization: "Bearer " + TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "boss-zhipin-userscripts-release",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const lookup = await fetch(API + "/repos/" + REPO + "/releases/tags/" + encodeURIComponent(meta.tag), { headers });
  let res;
  if (lookup.status === 200) {
    const cur = await lookup.json();
    res = await fetch(API + "/repos/" + REPO + "/releases/" + cur.id, {
      method: "PATCH", headers,
      body: JSON.stringify({ name: body.name, body: body.body, draft: body.draft, prerelease: body.prerelease })
    });
    console.log("[release] " + meta.tag + " 已存在 → 更新标题与说明");
  } else {
    res = await fetch(API + "/repos/" + REPO + "/releases", { method: "POST", headers, body: JSON.stringify(body) });
    console.log("[release] 创建 " + meta.tag);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) fail("GitHub 返回 " + res.status + "：" + JSON.stringify(out).slice(0, 300));
  console.log("[release] OK → " + out.html_url);
})();