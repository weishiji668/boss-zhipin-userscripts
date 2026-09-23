// 把 tools/gm-compat.js 内联进需要它的脚本（幂等，可重复跑）。
// 用法： node tools/inline-compat.cjs            写入
//        node tools/inline-compat.cjs --check    只校验是否已同步（未同步则退出码 1）
// 注意：全程不删改原有的任何字符 —— 只在 'use strict'; 之后插入/替换兼容层那一段，
//       且按文件自身的换行风格写入（CRLF 文件写 CRLF，LF 文件写 LF）。
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(__dirname, "gm-compat.js");
const TARGETS = ["boss-chat.user.js", "boss-watcher.user.js", "boss-insight.user.js", "boss-deliver.user.js"];
const BEGIN = "/* ===== BOSS-GM-COMPAT BEGIN ===== */";
const END = "/* ===== BOSS-GM-COMPAT END ===== */";
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const checkOnly = process.argv.indexOf("--check") >= 0;

const block = fs.readFileSync(SRC, "utf8").split(CR).join("").trim();
const anchor = Q + "use strict" + Q + ";";
const updated = [], same = [], skipped = [];

function countOf(s, ch) { return s.split(ch).length - 1; }

for (const name of TARGETS) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) { skipped.push(name + "（文件不存在）"); continue; }
  const raw = fs.readFileSync(file, "utf8");
  const crCount = countOf(raw, CR), lfCount = countOf(raw, LF);
  const crlf = (crCount > 0 && lfCount > 0 && crCount >= lfCount * 0.5);
  const nl = crlf ? CR + LF : LF;
  const wrapped = BEGIN + nl + block.split(LF).join(nl) + nl + END;
  const mb = raw.indexOf(BEGIN);
  const me = raw.indexOf(END);
  let out = null;
  if (mb >= 0 && me > mb) {
    out = raw.slice(0, mb) + wrapped + raw.slice(me + END.length);
  } else {
    const at = raw.indexOf(anchor);
    if (at < 0) { skipped.push(name + "（找不到 use strict 锚点，请手工插入）"); continue; }
    const lineEnd = raw.indexOf(LF, at);
    const cut = (lineEnd < 0) ? raw.length : lineEnd + 1;
    out = raw.slice(0, cut) + nl + wrapped + nl + raw.slice(cut);
  }
  if (out === raw) { same.push(name); continue; }
  if (!checkOnly) fs.writeFileSync(file, out, "utf8");
  updated.push(name);
}

console.log((checkOnly ? "兼容层同步检查" : "兼容层内联") + "：目标 " + TARGETS.length + " 个脚本");
updated.forEach(function (n) { console.log((checkOnly ? "  未同步 " : "  已写入 ") + n); });
same.forEach(function (n) { console.log("  已最新 " + n); });
skipped.forEach(function (n) { console.log("  跳过  " + n); });
if (checkOnly && updated.length) { console.log("→ 有脚本未同步，先跑 node tools/inline-compat.cjs"); process.exitCode = 1; }
else console.log("→ 完成（内容一致时重复运行不会改动文件）");
