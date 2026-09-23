// T3 安全整改验证（SC-1 / SC-2 / SC-3）—— 真实浏览器里跑，不只看源码 grep
// 用法：node tests/verify_t3.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CHAT_USERSCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-chat.user.js'), 'utf8');
const SECRET = 'sk-LEAKCANARY-9f3a7c2e-DO-NOT-LEAK';

const GM_STUB = `
  const gs = window.__gm = (function(){
    try { return JSON.parse(localStorage.getItem('__gmstub') || '{}'); } catch (e) { return {}; }
  })();
  const persist = () => { try { localStorage.setItem('__gmstub', JSON.stringify(gs)); } catch (e) {} };
  window.GM_getValue = (k, d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k, v) => { gs[k] = v; persist(); };
  window.GM_deleteValue = (k) => { delete gs[k]; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.GM_addStyle = (css) => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  window.GM_xmlhttpRequest = (o) => { setTimeout(()=>{ try{ o.onload && o.onload({responseText:'{"code":0}',status:200}); }catch(e){} },0); };
  window.GM_notification = () => {};
`;

let fail = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra !== undefined ? '  → ' + extra : ''));
  if (!cond) fail++;
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (!u.includes('zhipin.com')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8',
      body: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>' });
  });
  // 预置一个"已保存"的 Key，模拟老用户升级后的场景
  await ctx.addInitScript(`try{ localStorage.setItem('__gmstub', JSON.stringify({ bc_settings:{ ai:{ key:'${SECRET}', baseUrl:'https://api.deepseek.com/v1' } } })); }catch(e){}`);
  await ctx.addInitScript(GM_STUB);
  await ctx.addInitScript(CHAT_USERSCRIPT);
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await page.goto('https://www.zhipin.com/web/geek/chat', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  console.log('SC-2 Key 不回填 DOM（真实浏览器）');
  await page.evaluate(() => document.getElementById('bcFab').click());
  await page.waitForTimeout(400);
  // 面板打开状态下，全页面 DOM 里搜 Key 明文
  const domHasSecret = await page.evaluate(s => document.documentElement.innerHTML.indexOf(s) >= 0, SECRET);
  check('面板打开后页面 DOM 搜不到 Key 明文', !domHasSecret);
  const inputVal = await page.evaluate(() => {
    const el = document.querySelector('input[data-key="ai.key"]');
    return el ? el.value : '(no-input)';
  });
  check('Key 输入框 value 为空', inputVal === '', JSON.stringify(inputVal));
  const statusText = await page.evaluate(() => {
    const el = document.querySelector('input[data-key="ai.key"]');
    return el ? el.parentElement.textContent : '';
  });
  check('显示「已保存」状态文本', /已保存/.test(statusText), statusText.slice(0, 60));
  check('有「保存」与「清除 Key」按钮',
    await page.evaluate(() => !!document.querySelector('[data-act="keysave"]') && !!document.querySelector('[data-act="keyclear"]')));

  // 输入框里输入后未点保存 → 不应写入存储
  await page.evaluate(() => {
    const el = document.querySelector('input[data-key="ai.key"]');
    el.value = 'sk-typed-but-not-saved';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const storedAfterType = await page.evaluate(() => (window.__gm.bc_settings || {}).ai.key);
  check('未点保存时不写入存储（不再逐键保存）', storedAfterType === SECRET, JSON.stringify(storedAfterType));

  console.log('');
  console.log('SC-1 清除 Key');
  await page.evaluate(() => document.querySelector('[data-act="keyclear"]').click());
  await page.waitForTimeout(400);
  const afterClear = await page.evaluate(() => (window.__gm.bc_settings || {}).ai.key);
  check('点「清除 Key」后存储中 Key 被移除', afterClear === '', JSON.stringify(afterClear));
  check('清除前有确认弹窗', dialogs.some(m => /清除/.test(m)), JSON.stringify(dialogs.slice(-2)));

  console.log('');
  console.log('SC-3 首次启用确认 + 文案');
  const before = dialogs.length;
  await page.evaluate(() => {
    const cb = document.querySelector('input[data-key="ai.on"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const consent = dialogs.slice(before).join('\n');
  check('首次启用弹出一次性确认', dialogs.length > before);
  check('确认文案含发送范围（条数与截断字数）', /最近 \d+ 条消息/.test(consent));
  check('确认文案含对方消息也会被发送', /对方（HR）发送的消息也会被发送/.test(consent));
  check('确认文案含目的地', /api\.deepseek\.com/.test(consent));
  const ackStored = await page.evaluate(() => !!(window.__gm.bc_settings || {}).ai.ackAt);
  check('确认状态已落盘（只弹一次）', ackStored);
  const onStored = await page.evaluate(() => (window.__gm.bc_settings || {}).ai.on);
  check('确认后开关生效', onStored === true, JSON.stringify(onStored));

  // 再次渲染不应再弹（ackAt 已记录）
  const before2 = dialogs.length;
  await page.evaluate(() => {
    const cb = document.querySelector('input[data-key="ai.on"]');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    cb.checked = true;  cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  check('第二次启用不再弹确认', dialogs.length === before2, '新增弹窗=' + (dialogs.length - before2));

  console.log('');
  console.log('SC-3 baseUrl 提示与非 https 告警');
  const hasTrustHint = await page.evaluate(() => document.body.textContent.includes('仅填写可信地址'));
  check('baseUrl 旁有「仅填写可信地址」提示', hasTrustHint);
  const before3 = dialogs.length;
  await page.evaluate(() => {
    const el = document.querySelector('input[data-key="ai.baseUrl"]');
    el.value = 'http://evil.example.com/v1';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  check('非 https 地址触发告警', dialogs.length > before3 && /不是 https/.test(dialogs[dialogs.length - 1]), dialogs[dialogs.length - 1]);

  console.log('');
  console.log('导出 / 日志不含 Key（回归）');
  const exportSrc = await page.evaluate(() => JSON.stringify(window.__gm.bc_chats || {}));
  check('会话数据里没有 Key', exportSrc.indexOf(SECRET) < 0);
  const logs = await page.evaluate(() => JSON.stringify(window.__gm.bc_logs || []));
  check('运行日志里没有 Key 明文', logs.indexOf(SECRET) < 0);

  await ctx.close();
  await browser.close();
  console.log('');
  console.log(fail ? ('存在失败项：' + fail) : '全部通过（T3：SC-1 / SC-2 / SC-3）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行出错：', e); process.exit(1); });