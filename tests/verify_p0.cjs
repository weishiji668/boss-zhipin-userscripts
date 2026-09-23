// P0 逐条验证：T1 导出 BOM / T2 HTML 转义 / T4 额度换日
// 用法：node tests/verify_p0.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const C = require('../boss-chat.user.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-p0-'));
let fail = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  → ' + detail : ''));
  if (!cond) fail++;
}
function runPy(code) {
  // 用文件传参，避免引号/中文在命令行里被吞
  const f = path.join(tmp, 'probe.py');
  fs.writeFileSync(f, code, 'utf8');
  // 中文 Windows 控制台默认 GBK，Python 子进程要显式要求 UTF-8 输出，否则读回来的是乱码（用例会假失败）
  return execFileSync('python', [f], { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) }).trim();
}

console.log('T1 导出编码：BOM 只给 CSV，JSON / JSONL 保持纯净');
console.log('  —— 复现旧行为（给 JSON 加 BOM 后解析失败）');
const bomJson = '\uFEFF{"a":1}';
let nodeThrew = false;
try { JSON.parse(bomJson); } catch (e) { nodeThrew = true; }
check('Node JSON.parse(带BOM) 抛错', nodeThrew);
fs.writeFileSync(path.join(tmp, 'bom.json'), bomJson, 'utf8');
const pyThrew = runPy(`
import json,sys
try:
    json.load(open(r"${path.join(tmp, 'bom.json')}", encoding='utf-8'))
    print('NO_ERROR')
except Exception as e:
    print(type(e).__name__)
`);
check('Python json.load(带BOM) 报错', pyThrew !== 'NO_ERROR', pyThrew);

console.log('  —— 修复后：实际导出内容');
const csvText = [['公司', '内容'], ['甲公司', '你好，请发简历']].map(r => r.map(C.csvEsc).join(',')).join('\r\n');
const jsonText = JSON.stringify({ chats: { f1: { meta: { company: '甲公司' }, messages: [{ text: '你好' }] } } }, null, 2);
const jsonlText = [{ session: 'f1', company: '甲公司', text: '你好' }, { session: 'f2', company: '乙公司', text: '在吗' }]
  .map(o => JSON.stringify(o)).join('\n');
const payloads = {
  csv: { text: csvText, mime: 'text/csv', file: 'out.csv' },
  json: { text: jsonText, mime: 'application/json', file: 'out.json' },
  jsonl: { text: jsonlText, mime: 'application/x-ndjson', file: 'out.jsonl' },
  md: { text: '# 统计\n', mime: 'text/markdown', file: 'out.md' }
};
for (const [k, p] of Object.entries(payloads)) {
  fs.writeFileSync(path.join(tmp, p.file), C.payloadFor(p.text, p.mime), 'utf8');
}
const firstByte = f => fs.readFileSync(path.join(tmp, f))[0] === 0xEF && fs.readFileSync(path.join(tmp, f))[1] === 0xBB;
check('CSV 带 UTF-8 BOM', firstByte('out.csv'));
check('JSON 无 BOM', !firstByte('out.json'));
check('JSONL 无 BOM', !firstByte('out.jsonl'));
check('MD 无 BOM', !firstByte('out.md'));

const pyCsv = runPy(`
import csv
rows = list(csv.reader(open(r"${path.join(tmp, 'out.csv')}", encoding='utf-8-sig')))
print(rows[0][0], rows[1][0], rows[1][1])
`);
check('Python csv 读中文正常（utf-8-sig）', pyCsv === '公司 甲公司 你好，请发简历', pyCsv);

const pyJson = runPy(`
import json
d = json.load(open(r"${path.join(tmp, 'out.json')}", encoding='utf-8'))
print(d['chats']['f1']['meta']['company'])
`);
check('Python json.load 直接读导出 JSON', pyJson === '甲公司', pyJson);

const pyJsonl = runPy(`
import json
lines = open(r"${path.join(tmp, 'out.jsonl')}", encoding='utf-8').read().splitlines()
print(len(lines), json.loads(lines[0])['company'], json.loads(lines[1])['company'])
`);
check('Python 逐行 json.loads 读 JSONL', pyJsonl === '2 甲公司 乙公司', pyJsonl);

const nodeJsonl = jsonlText.split('\n').map(l => JSON.parse(l)).map(o => o.company).join(',');
check('Node 逐行 JSON.parse 读 JSONL', nodeJsonl === '甲公司,乙公司', nodeJsonl);

console.log('');
console.log('T2 HTML 转义：引号不再撑破属性');
check('esc(a"b<c)', C.esc('a"b<c') === 'a&quot;b&lt;c', C.esc('a"b<c'));
check("esc(a'b)", C.esc("a'b") === 'a&#39;b', C.esc("a'b"));
check('esc(&">)', C.esc('&">') === '&amp;&quot;&gt;', C.esc('&">'));
const evilKey = 'sk-" onmouseover="alert(1)" x="';
const attrHtml = '<input type="password" data-key="ai.key" value="' + C.esc(evilKey) + '">';
check('含引号 Key 拼进 value 属性后无法闭合', !/value="sk-" /.test(attrHtml));
check('转义结果（属性片段）', attrHtml.includes('value="sk-&quot; onmouseover=&quot;alert(1)&quot; x=&quot;"'), attrHtml.slice(0, 90) + '…');
// 旧实现对照
const oldEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
check('旧实现会留下裸引号（对照）', oldEsc(evilKey).includes('"'), oldEsc(evilKey));

console.log('');
console.log('T4 每日额度按本地日期换日（不再用 UTC）');
const now = new Date();
const p2 = x => String(x).padStart(2, '0');
const localToday = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
check('localDateStr(now) = 本地日期', C.localDateStr(now) === localToday, C.localDateStr(now) + ' (UTC ' + now.toISOString().slice(0, 10) + ')');
const early = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30, 0);
check('本地 00:30 属于当天（旧实现用 UTC 会算成前一天）', C.localDateStr(early) === localToday, 'local=' + C.localDateStr(early) + ' utc=' + early.toISOString().slice(0, 10));
check('TZ 偏移确为东八区（复现场景有效）', -now.getTimezoneOffset() === 480, 'offset=' + (-now.getTimezoneOffset()) + 'min');
C.store.settings = JSON.parse(JSON.stringify(C.DEFAULTS));
C.store.settings.ai.maxPerDay = 5;
C.store.settings.ai.usedDate = C.localDateStr(new Date(now.getTime() - 86400000));
C.store.settings.ai.usedToday = 4;
const before = C.store.settings.ai.usedToday;
const okNow = C.aiBudgetOk();
check('昨天已用 4/5 → 今天恢复可用', okNow === true && C.store.settings.ai.usedToday === 0 && C.store.settings.ai.usedDate === localToday,
  '调用前 usedToday=' + before + '，调用后 ' + C.store.settings.ai.usedToday + '，usedDate=' + C.store.settings.ai.usedDate);
C.store.settings.ai.usedToday = 5;
check('当日用满 5/5 → 拒绝', C.aiBudgetOk() === false);
C.store.settings.ai.usedToday = 2;
check('同日不误清零', C.aiBudgetOk() === true && C.store.settings.ai.usedToday === 2);

console.log('');
console.log(fail ? ('存在失败项：' + fail) : '全部通过（T1 / T2 / T4 逐条验证）');
console.log('临时目录：' + tmp);
process.exit(fail ? 1 : 0);