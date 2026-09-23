// XLSX 导出测试（2026-09-22 重写，对齐 filter v1.2.7）：零依赖 Excel 写出器现在住在 boss-filter。
// filter 没有 module.exports、且顶层在 Node 里会因 document 报错 → 这里用 vm 沙箱加载源码，
// 在同一闭包尾部挂导出钩子取 crc32 / xlsxColName / xlsxEsc / buildXlsx / TABLE_HEAD / TEMPLATE_ROWS。
//   node tests/test_xlsx.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../boss-chat.user.js');
const T = require('../boss-watcher.user.js');   // 只用 fmtTime

function mkEl(){
  const el = {
    style:{}, dataset:{}, children:[],
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    appendChild(c){ return c; }, removeChild(){}, remove(){},
    addEventListener(){}, removeEventListener(){},
    classList:{ add(){}, remove(){}, contains(){ return false; } },
    querySelector(){ return mkEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, contains(){ return false; },
    getBoundingClientRect(){ return {left:0,top:0,width:100,height:40}; },
    setPointerCapture(){}, releasePointerCapture(){},
    textContent:'', innerHTML:'', title:'', value:'',
    focus(){}, setSelectionRange(){}, click(){}
  };
  return el;
}
function loadFilter(){
  const src = fs.readFileSync(path.join(__dirname,'..','boss-filter.user.js'),'utf8');
  const mod = {exports:{}};
  const document = {
    addEventListener(){}, removeEventListener(){}, readyState:'complete', visibilityState:'visible', title:'',
    documentElement:mkEl(), body:mkEl(), head:mkEl(),
    querySelector(){ return mkEl(); }, querySelectorAll(){ return []; },
    createElement(){ return mkEl(); }, createTextNode(){ return {}; }
  };
  const win = {
    addEventListener(){}, removeEventListener(){},
    fetch:()=>Promise.resolve({ok:true,status:200,url:'',text:()=>Promise.resolve(''),clone:()=>({text:()=>Promise.resolve('')})}),
    XMLHttpRequest:function(){ this.open=()=>{}; this.send=()=>{}; this.addEventListener=()=>{}; },
    innerWidth:1280, innerHeight:800,
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    getComputedStyle:()=>({display:'',position:'relative'}),
    DOMParser:class{ parseFromString(){ return {querySelector:()=>null,querySelectorAll:()=>[]}; } },
    location:{href:'https://www.zhipin.com/web/geek/job?query=x',pathname:'/web/geek/job',search:'?query=x'}
  };
  win.window=win; win.self=win; win.top=win;
  const localStorage={_m:{},getItem(k){return (k in this._m)?this._m[k]:null;},setItem(k,v){this._m[k]=String(v);},removeItem(k){delete this._m[k];}};
  const ctx = {
    module:mod, exports:mod.exports, window:win, document, localStorage,
    navigator:{userAgent:'node-test',clipboard:null,language:'zh-CN'}, location:win.location,
    history:{replace(){},pushState(){}},
    MutationObserver:class{ constructor(){} observe(){} disconnect(){} takeRecords(){ return []; } },
    IntersectionObserver:class{ constructor(){} observe(){} unobserve(){} disconnect(){} },
    ResizeObserver:class{ observe(){} disconnect(){} },
    setInterval:()=>0, setTimeout:()=>0, clearTimeout:()=>{}, clearInterval:()=>{},
    requestAnimationFrame:()=>0, cancelAnimationFrame:()=>{},
    getComputedStyle:win.getComputedStyle, DOMParser:win.DOMParser,
    TextEncoder, TextDecoder, console,
    GM_getValue:(k,d)=>d, GM_setValue:()=>{}, GM_deleteValue:()=>{}, GM_listValues:()=>[],
    GM_addValueChangeListener:()=>0, GM_removeValueChangeListener:()=>{}, GM_registerMenuCommand:()=>0,
    GM_xmlhttpRequest:()=>{}, GM_notification:()=>{}, GM_addStyle:()=>{}, GM_setClipboard:()=>true,
    unsafeWindow:win
  };
  ctx.globalThis=ctx; ctx.global=ctx;
  vm.createContext(ctx);
  const hook = '\n;module.exports={crc32,xlsxColName,xlsxEsc,buildXlsx,TABLE_HEAD,TEMPLATE_ROWS};';
  const idx = src.lastIndexOf('})();');
  const code = idx > 0 ? (src.slice(0, idx) + hook + src.slice(idx)) : (src + hook);
  vm.runInContext(code, ctx, {filename:'boss-filter.user.js'});
  return mod.exports;
}
const F = loadFilter();

let failures = 0;
function check(name, fn){
  try{ fn(); console.log('  ✓ ' + name); }
  catch(e){ failures++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

// ---- 极简 ZIP(STORE) 读取器 ----
function readZip(buf){
  let i = buf.length - 22;
  while(i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if(i < 0) throw new Error('未找到 EOCD，不是合法 ZIP');
  const count = buf.readUInt16LE(i + 10);
  const cdOff = buf.readUInt32LE(i + 16);
  const out = {}; let p = cdOff;
  for(let n = 0; n < count; n++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录签名错误 @' + p);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    if(buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(name + ' 本地文件头签名错误');
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    out[name] = { crc, data: buf.slice(start, start + size), text: () => buf.slice(start, start + size).toString('utf8') };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

C.store.chats = {
  s1: { meta:{sessionId:'s1', company:'测试科技有限公司', boss:'张经理', jobName:'前端工程师'},
        messages:[ {ts:1700000000000, dir:'me',   text:'您好，我对贵司岗位感兴趣'},
                   {ts:1700000060000, dir:'them', text:'你好，方便加微信聊吗'},
                   {ts:1700000120000, dir:'them', text:'入职需先交培训费'} ] },
  s2: { meta:{sessionId:'s2', company:'ABC<Corp> & "Co"', boss:'李总', jobName:'Node 开发'},
        messages:[ {ts:1700100000000, dir:'me', text:'含引号,逗号 的文本'} ] }
};

console.log('CRC32 / 列名 / 转义（filter v1.2.x 写出器）');
check('CRC32 标准测试向量 "123456789" = cbf43926', ()=>{
  assert.strictEqual(F.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
});
check('列名换算 A / Z / AA / AB', ()=>{
  assert.strictEqual(F.xlsxColName(0), 'A');
  assert.strictEqual(F.xlsxColName(25), 'Z');
  assert.strictEqual(F.xlsxColName(26), 'AA');
  assert.strictEqual(F.xlsxColName(27), 'AB');
});
check('XML 转义 & < > " 与单引号', ()=>{
  assert.strictEqual(F.xlsxEsc('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});
check('模板表头与示例行列数一致', ()=>{
  assert.ok(Array.isArray(F.TABLE_HEAD) && F.TABLE_HEAD.length >= 5, 'TABLE_HEAD 存在');
  F.TEMPLATE_ROWS.forEach(r=>assert.strictEqual(r.length, F.TABLE_HEAD.length, '示例行列数与表头一致'));
});

console.log('导出数据组装');
check('聊天导出行 = 表头 + 4 条消息', ()=>{
  assert.strictEqual(C.chatRowsForExport().length, 5);
});
check('fmtTime 输出可读时间', ()=>{
  assert.strictEqual(T.fmtTime(0), '');
  assert.match(T.fmtTime(1700000000000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

console.log('XLSX 结构');
const chatRows = C.chatRowsForExport();
const nice = [chatRows[0].slice()];
for(let i = 1; i < chatRows.length; i++){ const r = chatRows[i].slice(); r[5] = T.fmtTime(r[5]); nice.push(r); }
const bytes = F.buildXlsx([
  {name:'会话明细', rows:nice},
  {name:'数字检查', rows:[['话术','次数'],['培训费',30]]},
  {name:'下拉校验', rows:[['类型','值'],['黑名单','劳务']], validations:[{range:'A2:A9', list:'类型,关键词,薪资,黑名单'}]}
]);
const buf = Buffer.from(bytes);
let zip = null;
check('文件头是 ZIP magic PK\\x03\\x04 且部件齐全', ()=>{
  assert.strictEqual(buf.slice(0, 4).toString('hex'), '504b0304');
  zip = readZip(buf);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
   'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml'].forEach(n=>{
    assert.ok(zip[n], '缺少 ' + n);
  });
});
check('每个部件的 CRC32 与中央目录一致', ()=>{
  Object.keys(zip).forEach(n=>{
    assert.strictEqual(F.crc32(zip[n].data), zip[n].crc, n + ' CRC 不匹配');
  });
});
check('workbook.xml 声明 3 个工作表且名称为中文', ()=>{
  const wb = zip['xl/workbook.xml'].text();
  ['会话明细','数字检查','下拉校验'].forEach(n=>assert.ok(wb.includes('name="'+n+'"'), '未找到 ' + n));
});
check('[Content_Types].xml 为三个 sheet 都声明了类型', ()=>{
  const ct = zip['[Content_Types].xml'].text();
  ['1','2','3'].forEach(i=>assert.ok(ct.includes('/xl/worksheets/sheet' + i + '.xml')));
});
check('中文内容原样写入且用 inlineStr', ()=>{
  const s = zip['xl/worksheets/sheet1.xml'].text();
  assert.ok(s.includes('t="inlineStr"'));
  assert.ok(s.includes('测试科技有限公司'));
  assert.ok(s.includes('您好，我对贵司岗位感兴趣'));
});
check('特殊字符被转义，不会破坏 XML', ()=>{
  const s = zip['xl/worksheets/sheet1.xml'].text();
  assert.ok(s.includes('ABC&lt;Corp&gt; &amp; &quot;Co&quot;'), '公司名转义不正确');
  assert.ok(!/<Corp>/.test(s), '出现了未转义的尖括号');
});
check('数字写成数字单元格（Excel 里可直接求和）', ()=>{
  const s = zip['xl/worksheets/sheet2.xml'].text();
  assert.ok(/<c r="B2"[^>]*><v>30<\/v><\/c>/.test(s), 'B2 应为数字单元格，实际: ' + (s.match(/<c r="B2".*?<\/c>/) || ['无'])[0]);
});
check('validations 生成 dataValidation 下拉', ()=>{
  const s = zip['xl/worksheets/sheet3.xml'].text();
  assert.ok(s.includes('<dataValidation'), '缺少 dataValidation');
  assert.ok(s.includes('sqref="A2:A9"'), '缺少下拉范围');
  assert.ok(s.includes('<formula1>'), '缺少下拉选项');
});
check('行数正确：会话 5 行 / 数字 2 行 / 下拉 2 行', ()=>{
  assert.strictEqual((zip['xl/worksheets/sheet1.xml'].text().match(/<row /g) || []).length, 5);
  assert.strictEqual((zip['xl/worksheets/sheet2.xml'].text().match(/<row /g) || []).length, 2);
  assert.strictEqual((zip['xl/worksheets/sheet3.xml'].text().match(/<row /g) || []).length, 2);
});
check('超长文本被截断到 Excel 上限内（32767）', ()=>{
  const big = F.buildXlsx([{name:'S', rows:[['x'.repeat(40000)]]}]);
  const z = readZip(Buffer.from(big));
  const m = z['xl/worksheets/sheet1.xml'].text().match(/<t [^>]*>([\s\S]*?)<\/t>/);
  assert.ok(m && m[1].length <= 32767, '实际长度 ' + (m ? m[1].length : 'null'));
});
check('非法工作表名被清洗', ()=>{
  const b = F.buildXlsx([{name:'a[b]:c*d?e/f\\g' + 'x'.repeat(40), rows:[['1']]}]);
  const z = readZip(Buffer.from(b));
  const nm = (z['xl/workbook.xml'].text().match(/name="([^"]*)"/) || [])[1];
  assert.ok(!/[\[\]:\*\?\/\\]/.test(nm), '仍含非法字符: ' + nm);
  assert.ok(nm.length <= 31, '名称过长: ' + nm.length);
});

console.log('空数据保护');
check('无数据时聊天导出只剩表头', ()=>{
  const bak = C.store.chats;
  C.store.chats = {};
  assert.strictEqual(C.chatRowsForExport().length, 1, '应只剩表头');
  C.store.chats = bak;
});

console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
process.exit(failures ? 1 : 0);
