// 无脚本管理器（兼容层兜底）的真实浏览器用例
//
// 为什么单独有一条：README 与发布说明里都有「不装管理器也能跑」这句承诺，
// 而 tests/test_compat.cjs 是在 Node 里模拟环境（stub GM_*）——它证明不了「真浏览器 + 真没有 GM」这条路。
// 这里用真 Chrome 打开一个 mock 列表页，**先把 GM_getValue / GM_xmlhttpRequest / unsafeWindow 确认成 undefined**，
// 再把脚本直接注入页面，验证：能启动、UI 挂得上、存储退化为带前缀的 localStorage、面板能渲染。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-watcher.user.js'), 'utf8');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

const CARD = (id, name, salary, company) =>
  '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/' + id + '.html">'
  + '<div class="job-info"><div class="job-title"><span class="job-name">' + name + '</span><span class="salary">' + salary + '</span></div></div>'
  + '<div class="company-info"><h3 class="company-name">' + company + '</h3></div></a></div></li>';
const LIST_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
  + CARD('p1', '后端开发', '15-20K', '甲公司') + CARD('p2', '运营', '8-10K', '乙公司')
  + '</ul></div></body></html>';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext();
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (!u.includes('zhipin.com')) return route.continue();
    route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: LIST_HTML });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));

  console.log('无管理器环境：脚本直接注入页面（兼容层兜底）');
  await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil: 'load' });

  // 前置：确认页面里确实没有任何 GM 能力（否则这条用例就没意义了）
  const env = await page.evaluate(() => ({
    gm: typeof window.GM_getValue, xhr: typeof window.GM_xmlhttpRequest, unsafe: typeof window.unsafeWindow,
  }));
  check('前置：页面无 GM_getValue / GM_xmlhttpRequest / unsafeWindow',
    env.gm === 'undefined' && env.xhr === 'undefined' && env.unsafe === 'undefined', JSON.stringify(env));

  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.indexOf('__gmcompat:') === 0);
    return { fab: !!document.getElementById('bwFab'), compatKeys: keys.length,
             api: typeof window.GM_getValue, xu: typeof window.GM_xmlhttpRequest };
  });
  check('无页面报错（脚本在无管理器环境下能启动）', errs.length === 0, errs.join(' | '));
  check('UI 挂上了（#bwFab 存在）', after.fab === true);
  check('存储退化为带前缀的 localStorage（__gmcompat:）', after.compatKeys > 0, 'keys=' + after.compatKeys);
  check('兼容层补齐了 GM_getValue / GM_xmlhttpRequest', after.api === 'function' && after.xu === 'function', JSON.stringify(after));

  await page.evaluate(() => { const b = document.getElementById('bwFab'); if (b) b.click(); });
  await page.waitForTimeout(600);
  const panel = await page.evaluate(() => {
    const p = document.getElementById('bwPanel');
    return p ? (p.style.display + '|' + p.textContent.slice(0, 30)) : '(无面板)';
  });
  check('面板能打开并渲染', panel.indexOf('block') === 0, panel);

  await browser.close();
  console.log('');
  if (failures) { console.error('存在 ' + failures + ' 项失败'); process.exit(1); }
  console.log('全部通过 ✔');
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(2); });
