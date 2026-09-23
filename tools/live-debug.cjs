// 真实站点调试：挂一个独立「调试 Chrome」（CDP），把 boss-chat.user.js 注入真实的 zhipin.com 上跑。
// 为什么这样：Chrome 136+ 不允许拿默认 profile 开远程调试，所以调试实例用独立 profile（登录一次即可长期复用）。
//
// 用法：
//   node tools/live-debug.cjs start    启动调试 Chrome（首次需扫码登录一次）
//   node tools/live-debug.cjs status   看当前页面 / 脚本面板状态
//   node tools/live-debug.cjs chat     打开真实聊天页
//   node tools/live-debug.cjs panel    打开面板 + 截图
//   node tools/live-debug.cjs stop     关闭调试 Chrome
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'snapshots', 'debug');
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(OUT, 'chrome-profile');
const PORT = 9333;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHAT_URL = 'https://www.zhipin.com/web/geek/chat';
const USCRIPT = fs.readFileSync(path.join(ROOT, 'boss-chat.user.js'), 'utf8');

// GM 桩：数据落 localStorage（真实站点同源，刷新后仍在）
const GM_STUB = `
(function(){
  if (window.__gmStubInstalled) return; window.__gmStubInstalled = 1;
  const gs = window.__gm = (function(){ try{ return JSON.parse(localStorage.getItem('__gmstub')||'{}'); }catch(e){ return {}; } })();
  const persist = () => { try{ localStorage.setItem('__gmstub', JSON.stringify(gs)); }catch(e){} };
  window.GM_getValue = (k,d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k,v) => { gs[k]=v; persist(); };
  window.GM_deleteValue = (k) => { delete gs[k]; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.GM_addStyle = (css) => { const s=document.createElement('style'); s.textContent=css; (document.head||document.documentElement).appendChild(s); };
  window.GM_xmlhttpRequest = (o) => {
    fetch(o.url, { method:o.method||'GET', headers:o.headers||{}, body:o.data, credentials:'include' })
      .then(async r => { const t = await r.text(); o.onload && o.onload({ responseText:t, status:r.status, finalUrl:r.url }); })
      .catch(e => { o.onerror && o.onerror(e); })
      .finally(() => { o.onloadend && o.onloadend(); });
  };
})();
`;

const cmd = process.argv[2] || 'status';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chromeRunning() {
  try {
    const out = execSync('netstat -ano | findstr ":' + PORT + '"', { encoding: 'utf8' });
    return /LISTENING/.test(out);
  } catch (e) { return false; }
}

function startChrome() {
  if (chromeRunning()) { console.log('调试 Chrome 已在运行（端口 ' + PORT + '）'); return; }
  spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--new-window', CHAT_URL], { detached: true, stdio: 'ignore' }).unref();
  console.log('已启动调试 Chrome：profile=' + PROFILE);
}

async function attach() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  const ctx = browser.contexts()[0];
  await ctx.addInitScript(GM_STUB);
  await ctx.addInitScript(USCRIPT + '\n//# sourceURL=boss-chat.user.js');
  return { browser, ctx };
}

async function pageOf(ctx) {
  let page = ctx.pages().find(p => p.url().includes('zhipin.com'));
  if (!page) page = ctx.pages()[0] || await ctx.newPage();
  ctx.on('page', p => p.on('pageerror', e => console.log('  [页面错误] ' + e.message)));
  page.on('console', m => { const t = m.text(); if (/^\[boss-chat\]/.test(t)) console.log('  [页面日志] ' + t); });
  page.on('pageerror', e => console.log('  [页面错误] ' + e.message));
  return page;
}

async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  console.log('  截图：' + f);
  return f;
}

// 可靠登录判定：受保护接口返回 code 0 才算登录（页面 URL 会被 SPA 缓存掩盖）
async function loggedIn(page) {
  return await page.evaluate(async () => {
    try {
      const r = await fetch('/wapi/zpchat/config/get', { credentials: 'include' });
      const j = await r.json();
      return !!j && j.code === 0;
    } catch (e) { return false; }
  }).catch(() => false);
}

async function report(page) {
  const info = await page.evaluate(() => {
    const body = document.querySelector('#bcBody');
    const chats = (window.__gm && window.__gm.bc_chats) || {};
    const keys = Object.keys(chats);
    let msgs = 0;
    keys.forEach(k => { msgs += ((chats[k] || {}).messages || []).length; });
    return {
      url: location.href, title: document.title,
      panel: !!document.querySelector('#bcFab'), panelOpen: !!(document.querySelector('#bcPanel') && document.querySelector('#bcPanel').style.display === 'block'),
      sessions: keys.length, messages: msgs,
      withMsg: keys.filter(k => ((chats[k] || {}).messages || []).length).length,
      head: body ? body.innerText.split('\n').slice(0, 10).join(' / ') : '',
      login: location.href.includes('/web/user/'),
    };
  });
  console.log('  页面：' + info.title);
  console.log('  地址：' + info.url);
  console.log('  脚本面板：' + (info.panel ? (info.panelOpen ? '已注入 · 已打开' : '已注入 · 收起') : '未注入'));
  console.log('  已抓到：' + info.sessions + ' 个会话（' + info.withMsg + ' 个有消息）/ ' + info.messages + ' 条消息');
  if (info.login) console.log('  ⚠ 看起来还没登录，请在调试 Chrome 窗口里扫码登录');
  if (info.head) console.log('  面板摘要：' + info.head);
  return info;
}

(async () => {
  try {
    if (cmd === 'start') return startChrome();
    if (!chromeRunning()) { console.log('调试 Chrome 没在跑，先执行：node tools/live-debug.cjs start'); process.exitCode = 1; return; }
    const { browser, ctx } = await attach();
    const page = await pageOf(ctx);
    if (cmd === 'stop') { await browser.close(); console.log('已关闭调试 Chrome'); return; }

    if (cmd === 'chat') { await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' }); await sleep(3000); }
    if (cmd === 'wait-login') {
      const deadline = Date.now() + 300000;
      let i = 0;
      while (Date.now() < deadline) {
        if (await loggedIn(page)) break;
        if (i++ % 4 === 0) console.log('  等待登录中…（请在弹出的调试 Chrome 窗口里扫码，最多等 5 分钟）');
        await sleep(5000);
      }
      if (!(await loggedIn(page))) { console.log('  等待超时：还没检测到有效登录'); process.exitCode = 1; return; }
      console.log('  已检测到登录，打开聊天页…');
      await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });
      await sleep(5000);
    }
    // 注入脚本只对新导航生效：页面里还没有面板就重载一次
    const has = await page.evaluate(() => !!document.querySelector('#bcFab')).catch(() => false);
    if (!has) { console.log('  正在加载页面并注入脚本…'); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500); }

    if (cmd === 'panel') {
      const open = await page.evaluate(() => { const p = document.querySelector('#bcPanel'); return !!(p && p.style.display === 'block'); });
      if (!open) await page.click('#bcFab');
      await sleep(900);
      await shot(page, 'live-面板');
    }
    if (cmd === 'diag') {
      const d = await page.evaluate(() => {
        const g = window.__gm || {}, cap = g.bc_captured || {}, diag = g.bc_diag || {};
        const body = document.querySelector('#bcBody');
        return {
          hook: diag.seen ? 'fetch ' + diag.seen.fetch + ' / xhr ' + diag.seen.xhr + ' / api ' + diag.seen.api : '（无统计）',
          mainHook: diag.main ? '已注入' : '未注入', mainErr: diag.mainErr || '',
          captured: Object.keys(cap).map(k => '×' + cap[k].count + ' [' + cap[k].type + '] ' + k),
          wsSamples: Object.keys(diag.wsSamples || {}),
          chats: Object.entries(g.bc_chats || {}).map(([k, v]) => k + ' → ' + JSON.stringify(v.meta || {}).slice(0, 110)),
          samples: Object.keys(diag.samples || {}),
          logs: (g.bc_logs || []).slice(0, 6).map(l => l.msg),
          panelTail: body ? body.innerText.split('\n').slice(-14).join(' / ') : '',
        };
      });
      console.log(JSON.stringify(d, null, 1));
    }
    if (cmd === 'observe') {
      // 等价于面板里勾选「接口观察模式」，直接写 GM 存储（面板没打开时也能开）
      await page.evaluate(() => {
        const g = window.__gm = window.__gm || {};
        g.bc_settings = Object.assign({}, g.bc_settings, { observe: true });
        localStorage.setItem('__gmstub', JSON.stringify(g));
      });
      console.log('  已打开「接口观察模式」，重新加载页面以抓真实响应…');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(9000);
    }
    if (cmd === 'openchat') {
      const hit = await page.evaluate(() => {
        const sels = ['[class*="friend-list"] [class*="item"]', '[class*="user-list"] li', '[class*="chat-item"]', 'li[class*="item"]'];
        for (const s of sels) { const els = document.querySelectorAll(s); if (els.length) { els[0].click(); return s + ' ×' + els.length; } }
        return '（没找到会话条目选择器）';
      });
      console.log('  点开会话：' + hit);
      await sleep(7000);
    }
    if (cmd === 'observe' || cmd === 'samples' || cmd === 'openchat') {
      const s = await page.evaluate(() => {
        const d = (window.__gm || {}).bc_diag || {};
        const out = {};
        Object.keys(d.samples || {}).forEach(k => { out[k] = String(d.samples[k]).slice(0, 700); });
        const items = Object.entries(d.items || {}).map(([k, v]) => k.slice(0, 20) + ' → ' + String(v).slice(0, 300));
        return { sampleKeys: Object.keys(d.samples || {}), samples: out, itemKeys: Object.keys(d.items || {}).length, items: items.slice(0, 3), wsKeys: Object.keys(d.wsSamples || {}) };
      });
      console.log('  样本类型：' + JSON.stringify(s.sampleKeys));
      Object.keys(s.samples).forEach(k => console.log('\n--- ' + k + ' ---\n' + s.samples[k]));
      if (s.items.length) console.log('\n原始会话条目样本（' + s.itemKeys + ' 条）：\n' + s.items.join('\n'));
    }
    await report(page);
    process.exit(0);   // 断开 CDP，但保持调试 Chrome 开着
  } catch (e) {
    console.error('失败：' + ((e && e.message) || e));
    process.exitCode = 1;
  }
})();
