// 调试浏览器：不装篡改猴、不上真实站点，就能把 boss-chat.user.js 全链路跑起来看效果。
// 原理：本机 Chrome + Playwright + 本地假 BOSS 页面（拦截 zhipin.com 请求）+ GM API 桩（localStorage 持久化）。
//
// 用法：
//   node tools/debug-browser.cjs          自动跑一遍（拦截模式）+ 截图，结束自动关窗
//   node tools/debug-browser.cjs --hold   同上，但跑完保持窗口打开，自己点着玩
//   node tools/debug-browser.cjs --live   打开真实 zhipin.com 聊天页（独立 profile，手动登录后看面板）
//
// 产物：snapshots/debug/*.png、导出-复盘CSV.csv、ai-requests.jsonl
const fs = require('fs');
const path = require('path');
const http = require('http');   // 预留：需要起本地桩服务时用
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'snapshots', 'debug');
fs.mkdirSync(OUT, { recursive: true });
const ARGS = process.argv.slice(2);
const HOLD = ARGS.includes('--hold');
const LIVE = ARGS.includes('--live');
const USCRIPT = fs.readFileSync(path.join(ROOT, 'boss-chat.user.js'), 'utf8');

const shots = [];
function note(s) { console.log(s); }
async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
  console.log('  [截图] ' + name);
  return f;
}

// ===== GM API 桩（模拟篡改猴，数据落 localStorage，刷新后仍在）=====
const GM_STUB = `
(function(){
  const gs = window.__gm = (function(){ try{ return JSON.parse(localStorage.getItem('__gmstub')||'{}'); }catch(e){ return {}; } })();
  const persist = () => { try{ localStorage.setItem('__gmstub', JSON.stringify(gs)); }catch(e){} };
  window.GM_getValue = (k,d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k,v) => { gs[k]=v; persist(); };
  window.GM_deleteValue = (k) => { delete gs[k]; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.GM_addStyle = (css) => { const s=document.createElement('style'); s.textContent=css; (document.head||document.documentElement).appendChild(s); };
  window.GM_xmlhttpRequest = (o) => {
    fetch(o.url, { method:o.method||'GET', headers:o.headers||{}, body:o.data })
      .then(async r => { const t = await r.text(); o.onload && o.onload({ responseText:t, status:r.status, finalUrl:r.url }); })
      .catch(e => { o.onerror && o.onerror(e); })
      .finally(() => { o.onloadend && o.onloadend(); });
  };
})();
`;

// ===== 假数据：3 个会话 + 消息（含模板招呼、职位卡片、对方在线状态）=====
const MY_UID = '2002';
const D = 86400000, H = 3600000, M = 60000;
const T = Date.now();
const BOSS = { f1: '1001', f2: '1002', f3: '1003' };
// 会话 id 用真实形态：encryptBossId 是长串，pullAllSessions 里有 /^[A-Za-z0-9_~-]{6,}$/ 的形态过滤
const ID = { f1: 'a1b2c3d4e5f6a7b8', f2: 'b2c3d4e5f6a7b8c9', f3: 'c3d4e5f6a7b8c9d0' };
const sessions = [
  { sid: ID.f1, key: 'f1', company: '测试科技', boss: '张经理', job: '前端工程师', salary: '20-30K', online: true },
  { sid: ID.f2, key: 'f2', company: '云启网络', boss: '李HR', job: 'Java 后端开发', salary: '18-25K', online: false },
  { sid: ID.f3, key: 'f3', company: '星辰数据', boss: '王女士', job: '数据分析师', salary: '15-22K', online: true },
];
function msgsOf(s) {
  const boss = BOSS[s.key], mine = MY_UID;
  const mk = (id, dir, text, ago) => ({ msgId: id, from: { uid: dir === 'me' ? mine : boss, name: dir === 'me' ? '我' : s.boss },
    to: { uid: dir === 'me' ? boss : mine }, time: T - ago, body: { text } });
  if (s.key === 'f1') return [
    mk('m1', 'me', '我对您发布的职位非常感兴趣，希望能加入贵公司', 3 * D + 40 * M),
    mk('m2', 'them', '您好，方便发一下简历吗？', 3 * D + 35 * M),
    mk('m3', 'me', '好的，我整理一下发您', 3 * D + 10 * M),
    { msgId: 'm4', from: { uid: boss, name: s.boss }, to: { uid: mine }, time: T - 2 * D,
      body: { jobDesc: { jobName: s.job, salary: s.salary, company: s.company, boss: { uid: boss }, geek: { uid: mine } } } },
    mk('m5', 'me', '您好，请问这个岗位还在招吗？', 1 * D + 2 * H),
  ];
  if (s.key === 'f2') return [
    mk('m1', 'me', '您好，我对这个岗位很感兴趣', 6 * D),
    mk('m2', 'them', '你好，我们这边主要做云原生，你之前做过这块吗？', 6 * D - 30 * M),
    mk('m3', 'me', '做过一些 K8s 和容器化部署', 6 * D - 45 * M),
    mk('m4', 'them', '嗯，那挺合适的，期望薪资大概多少？', 4 * D),
    mk('m5', 'me', '期望 22K 左右', 3 * D),
  ];
  return [
    mk('m1', 'me', '您好，看到贵司在招数据分析师', 5 * D),
    mk('m2', 'them', '你好呀，可以先聊聊你的项目经历吗？', 5 * D - 120 * M),
    mk('m3', 'me', '我之前做过用户增长的数据看板', 2 * D),
    mk('m4', 'them', '方便加个微信详聊吗', 5 * H),
  ];
}
function payloadFor(pathname, url) {
  if (pathname === '/wapi/zpgeek/friend/list.json') {
    return { code: 0, message: 'Success', zpData: { list: sessions.map((s, i) => {
      const item = { friendId: s.sid, encryptBossId: s.sid, bossId: BOSS[s.key], brandName: s.company, bossName: s.boss,
        jobName: s.job, lastMsgTime: T - i * H, unreadCount: i === 2 ? 1 : 0, bossOnline: s.online };
      if (s.key === 'f3') item.activeTime = T - 300000;
      return item;
    }) } };
  }
  if (pathname === '/wapi/zpgeek/friend/getBossData.json') {
    const sid = url.searchParams.get('bossId');
    const s = sessions.find(x => x.sid === sid); if (!s) return { code: 0, zpData: { data: {} } };
    return { code: 0, zpData: { data: { encryptBossId: s.sid, bossId: BOSS[s.key], companyName: s.company, bossName: s.boss, jobName: s.job, bossOnline: s.online } } };
  }
  if (pathname === '/wapi/zpchat/geek/historyMsg') {
    const sid = url.searchParams.get('bossId');
    const s = sessions.find(x => x.sid === sid);
    if (!s) return { code: 0, message: 'Success', zpData: { messageList: [] } };   // 未知会话：真实接口会返回空/报错
    return { code: 0, message: 'Success', zpData: { messageList: msgsOf(s) } };
  }
  return null;
}

// ===== 假聊天页（有会话头/消息节点，能顺带验证 DOM 兜底）=====
const CHAT_PAGE_HTML = [
  '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>BOSS直聘 · 聊天（调试页）</title><style>',
  'body{margin:0;font:13px/1.6 "Microsoft YaHei",system-ui;background:#f5f6f8;color:#1f2430}',
  '.wrap{display:flex;height:100vh}.side{width:300px;background:#fff;border-right:1px solid #e6e9ef;padding:12px}',
  '.chat{flex:1;display:flex;flex-direction:column}.chat-header{background:#fff;padding:12px;border-bottom:1px solid #e6e9ef}',
  '.chat-header .name{font-weight:600}.chat-body{flex:1;padding:16px;overflow:auto}',
  '.message-item{max-width:60%;margin:8px 0;padding:8px 12px;border-radius:10px;background:#fff;border:1px solid #e6e9ef}',
  '.message-item.myself{margin-left:auto;background:#2f6bff;color:#fff;border-color:#2f6bff}',
  '.hint{color:#7a8396;font-size:12px}</style></head><body><div class="wrap">',
  '<div class="side"><div class="hint">调试页面（假数据，非真实站点）</div><div id="list"></div></div>',
  '<div class="chat"><div class="chat-header"><span class="name">张经理</span> <span class="hint">测试科技 · 前端工程师 · 在线</span></div>',
  '<div class="chat-body" id="msgs">',
  '<div class="message-item myself">10:32 我对您发布的职位非常感兴趣，希望能加入贵公司</div>',
  '<div class="message-item">10:37 您好，方便发一下简历吗？</div>',
  '<div class="message-item myself">10:41 好的，我整理一下发您</div>',
  '</div></div></div>',
  '<script>',
  'var urls=["/wapi/zpgeek/friend/list.json?page=1","/wapi/zpgeek/friend/getBossData.json?bossId=a1b2c3d4e5f6a7b8",',
  '"/wapi/zpchat/geek/historyMsg?bossId=a1b2c3d4e5f6a7b8&maxMsgId=0&c=","/wapi/zpchat/geek/historyMsg?bossId=b2c3d4e5f6a7b8c9&maxMsgId=0&c=",',
  '"/wapi/zpchat/geek/historyMsg?bossId=c3d4e5f6a7b8c9d0&maxMsgId=0&c="];',
  'var i=0; function step(){ if(i>=urls.length) return ws(); fetch(urls[i++]).then(function(r){return r.text();}).then(step).catch(step); }',
  'function ws(){ setTimeout(function(){',
  '  window.postMessage({__bcWs:1,url:"wss://ws.zhipin.com/chat",data:JSON.stringify({code:0,zpData:{data:{encryptBossId:"d4e5f6a7b8c9d0e1",companyName:"未来科技",bossName:"赵总监",jobName:"测试开发工程师"}}})},"*");',
  '}, 600); }',
  'step();',
  '</script></body></html>'
].join('\n');

// ===== 假 AI 接口（走 zhipin.com 域名被拦截，避免 https 页面请求 http 的混合内容拦截）=====
const FAKE_AI_BASE = 'https://www.zhipin.com/fake-ai/v1';
function aiAnswer(body) {
  return /云启网络/.test(body)
    ? { bot: '真人', worth: 82, reason: '回答具体，问到薪资期望' }
    : { bot: '模板', worth: 35, reason: '回复客套，未针对具体问题' };
}

function wirePage(page, tag) {
  page.on('console', m => { const t = m.text(); if (/^\[boss-chat\]|error/i.test(t)) console.log('  [页面' + tag + '] ' + t); });
  page.on('pageerror', e => console.log('  [页面错误' + tag + '] ' + e.message));
}

// ===== 主流程：拦截模式（离线可跑）=====
async function runStub() {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const dialogs = [];
  ctx.on('page', p => p.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); await d.accept(); }));

  // 1) 预置设置（先于 GM 桩写 localStorage）；AI 指向本地假服务
  const seed = { bc_settings: { ai: { on: false, baseUrl: FAKE_AI_BASE, model: 'debug-model', key: 'sk-debug-not-a-real-key', maxPerDay: 10 } } };
  await ctx.addInitScript('try{ localStorage.setItem("__gmstub", ' + JSON.stringify(JSON.stringify(seed)) + '); }catch(e){}');
  await ctx.addInitScript(GM_STUB);
  await ctx.addInitScript(USCRIPT + '\n//# sourceURL=boss-chat.user.js');

  // 2) 拦截 zhipin.com；127.0.0.1（假 AI 服务）走真网络
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (!u.includes('zhipin.com')) return route.continue();
    const url = new URL(u);
    if (url.pathname.startsWith('/web/geek/chat')) return route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: CHAT_PAGE_HTML });
    if (url.pathname.startsWith('/fake-ai/')) {   // 假 AI：记录原文 + 返回 OpenAI 风格响应
      const body = route.request().postData() || '';
      fs.appendFileSync(path.join(OUT, 'ai-requests.jsonl'), body + '\n', 'utf8');
      return route.fulfill({ status: 200, contentType: 'application/json;charset=utf-8',
        body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(aiAnswer(body)) } }] }) });
    }
    const payload = payloadFor(url.pathname, url);
    if (payload) return route.fulfill({ status: 200, contentType: 'application/json;charset=utf-8', body: JSON.stringify(payload) });
    return route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>stub</body></html>' });
  });

  const page = await ctx.newPage();
  wirePage(page, '');
  note('# 调试浏览器 · 拦截模式（离线假数据）');
  await page.goto('https://www.zhipin.com/web/geek/chat', { waitUntil: 'load' });
  await page.waitForSelector('#bcFab', { timeout: 8000 });
  await page.waitForTimeout(1800);
  await shot(page, '01-面板-打开前');

  const chatKeys = () => page.evaluate(() => Object.keys((window.__gm && window.__gm.bc_chats) || {}));
  const panelText = () => page.evaluate(() => { const b = document.querySelector('#bcBody'); return b ? b.innerText : ''; });
  note('- 钩子被动捕获（未额外发请求）后会话数：' + (await chatKeys()).length + ' → ' + (await chatKeys()).join(', '));

  await page.click('#bcFab');
  await page.waitForTimeout(700);
  await shot(page, '02-面板-抓到数据');
  note('- 面板摘要：\n' + (await panelText()).split('\n').slice(0, 12).map(l => '    ' + l).join('\n'));

  // 3) DOM 兜底：只收录当前会话
  await page.click('button[data-act="chatscan"]');
  await page.waitForTimeout(600);
  await shot(page, '03-只收录当前会话-DOM兜底');
  note('- DOM 兜底后 f1 会话来消息数：' + await page.evaluate(sid => ((((window.__gm.bc_chats || {})[sid] || {}).messages || []).length), ID.f1));

  // 4) 一键收录全部会话（逐个只读拉历史消息）
  await page.click('button[data-act="pullall"]');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    if ((await panelText()).includes('上次批量收录')) break;
  }
  await shot(page, '04-一键收录全部会话');
  note('- 批量收录：' + ((await panelText()).match(/上次批量收录：[^\n]*/) || ['（未完成）'])[0]);

  // 5) 导出复盘 CSV（验证下载 + BOM + 内容）
  let dl = null;
  page.on('download', d => { dl = d; });
  await page.click('button[data-act="sessions"]');
  for (let i = 0; i < 16 && !dl; i++) await page.waitForTimeout(500);
  if (!dl) {
    note('- 导出：未捕获到下载事件。弹窗记录=' + JSON.stringify(dialogs));
    await shot(page, '05-导出失败现场');
  } else {
    const csvPath = path.join(OUT, '导出-复盘CSV.csv');
    await dl.saveAs(csvPath);
    const buf = fs.readFileSync(csvPath);
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    note('- 导出 ' + path.basename(csvPath) + '：' + buf.length + ' 字节，UTF-8 BOM=' + (buf.slice(0, 3).toString('hex') === 'efbbbf' ? '有' : '无'));
    note('    表头：' + text.split('\r\n')[0].slice(0, 88) + ' …');
    note('    数据行：' + (text.split('\r\n').length - 1) + ' 行；第 1 行示例：' + text.split('\r\n')[1].slice(0, 88) + ' …');
  }

  // 6) AI 判定：勾选开关会弹一次性确认
  await page.click('input[data-key="ai.on"]');
  await page.waitForTimeout(400);
  if (dialogs.length) note('- 首次启用 AI 的确认弹窗：\n' + dialogs[dialogs.length - 1].message.split('\n').map(l => '    ' + l).join('\n'));
  await page.click('button[data-act="aijudge"]');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    if (!(await panelText()).includes('判定中')) break;
  }
  await shot(page, '05-AI判定结果');
  const aiFile = path.join(OUT, 'ai-requests.jsonl');
  const aiSent = fs.existsSync(aiFile) ? fs.readFileSync(aiFile, 'utf8').trim().split('\n').length : 0;
  note('- AI 判定外发请求：' + aiSent + ' 次（原文存 ai-requests.jsonl，可核对发了什么）');

  // 7) 刷新页面验证 GM 存储持久化
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.click('#bcFab');
  await page.waitForTimeout(700);
  await shot(page, '06-刷新后数据仍在');
  note('- 刷新后会话数：' + (await chatKeys()).length + '（持久化生效）');
  note('- 截图：' + shots.length + ' 张 → ' + OUT);

  if (HOLD) { console.log('\n窗口保持打开（--hold），Ctrl+C 结束。'); await new Promise(res => process.on('SIGINT', res)); }
  await browser.close();
}

// ===== 可选：真实站点模式（独立 profile，手动登录）=====
async function runLive() {
  const profile = path.join(OUT, 'profile');
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--start-maximized'] });
  await ctx.addInitScript(GM_STUB);
  await ctx.addInitScript(USCRIPT + '\n//# sourceURL=boss-chat.user.js');
  const page = ctx.pages()[0] || await ctx.newPage();
  wirePage(page, ':live');
  page.on('dialog', async d => { console.log('  [弹窗] ' + d.message().slice(0, 160).replace(/\n/g, ' ')); await d.dismiss(); });
  await page.goto('https://www.zhipin.com/web/geek/chat', { waitUntil: 'domcontentloaded' }).catch(e => console.log('  打开失败：' + e.message));
  note('# 调试浏览器 · 真实站点模式');
  note('- 登录态存独立 profile：' + profile + '（不影响日常浏览器）');
  note('- 请在弹出的窗口里登录 BOSS、点开几个会话；脚本会自动记录，面板在右下角。');
  let n = 0;
  const timer = setInterval(async () => {
    try {
      if (page.isClosed()) return;
      n++;
      await shot(page, 'live-' + String(n).padStart(2, '0'));
      const stat = await page.evaluate(() => { const b = document.querySelector('#bcBody'); return b ? b.innerText.split('\n').slice(0, 5).join(' / ') : '（面板未出现）'; });
      console.log('  会话概览：' + stat);
    } catch (e) {}
  }, 20000);
  await new Promise(res => ctx.on('close', res));
  clearInterval(timer);
}

(async () => {
  try { if (LIVE) await runLive(); else await runStub(); }
  catch (e) { console.error('调试失败：' + ((e && e.stack) || e)); process.exitCode = 1; }
})();
