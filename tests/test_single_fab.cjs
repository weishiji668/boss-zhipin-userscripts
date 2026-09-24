// 回归测试：同一个页面注入两份脚本（≈「装了两个副本」或「页面重建后又注入一次」）时，
// 悬浮球必须只有一个 —— 不能出现两个一模一样的球。
//
// 背景：2026-09-23 用户实测截图里出现了两个 🩺 球。根因是 UI 防重只看内存变量
// （chat 的 `if(ui) return ui`、insight 的 `ui.root + document.body.contains()`），
// 同页两份脚本各有各的闭包，于是各建一份 DOM。修复：改成 DOM 级幂等
// （先找 #bcRoot / #biRoot / #bdRoot，有就复用），见 chat v1.5.11 / insight v0.5.9。
// 注：boss-watcher 原本就是 DOM 判断（`if(document.getElementById('bwPanel')) return`），
// 这里一并回归，防止以后被改回内存判断。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S = { chat: read('boss-chat.user.js'), insight: read('boss-insight.user.js'), watcher: read('boss-watcher.user.js') };

const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>BOSS直聘</title></head>' +
  '<body><div id="app"><div class="chat-list"></div><ul class="job-list"><li class="job-card-box"></li></ul></div></body></html>';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ('  ' + extra) : '')); }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (!u.includes('zhipin.com')) return r.continue();
      return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: PAGE });
    });

    // ---- 场景 1：聊天页，聊天助手 ×2 + 岗位体检 ×2 ----
    {
      console.log('场景 1：聊天页注入两份脚本');
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
      await page.goto('https://www.zhipin.com/web/geek/chat', { waitUntil: 'load' });
      await page.addScriptTag({ content: S.chat });
      await page.addScriptTag({ content: S.chat });
      await page.addScriptTag({ content: S.insight });
      await page.addScriptTag({ content: S.insight });
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => ({
        bcRoot: document.querySelectorAll('#bcRoot').length, bcFab: document.querySelectorAll('#bcFab').length,
        biRoot: document.querySelectorAll('#biRoot').length, biFab: document.querySelectorAll('#biFab').length
      }));
      console.log('    DOM 计数：' + JSON.stringify(n));
      check('聊天助手只挂一个悬浮球（#bcRoot=1）', n.bcRoot === 1 && n.bcFab === 1, JSON.stringify(n));
  check('聊天体检只挂一个悬浮球（#biRoot=1）', n.biRoot === 1 && n.biFab === 1, JSON.stringify(n));
      const opened = await page.evaluate(() => {
        const b = document.getElementById('biFab'); if (!b) return false;
        b.click();
        const p = document.getElementById('biPanel');
        return !!p && getComputedStyle(p).display !== 'none';
      });
      check('复用的那份 UI 仍可交互（点 🩺 能开面板）', opened === true);
      check('无运行时错误', errors.length === 0, errors.join(' | '));
      await page.close();
    }

    // ---- 场景 2：职位列表页，岗位体检 ×2 + 岗位监控 ×2 ----
    {
      console.log('场景 2：职位列表页注入两份脚本');
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
      await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil: 'load' });
      await page.addScriptTag({ content: S.insight });
      await page.addScriptTag({ content: S.insight });
      await page.addScriptTag({ content: S.watcher });
      await page.addScriptTag({ content: S.watcher });
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => ({
        biRoot: document.querySelectorAll('#biRoot').length,
        bwRoot: document.querySelectorAll('#bwRoot').length, bwFab: document.querySelectorAll('#bwFab').length
      }));
      console.log('    DOM 计数：' + JSON.stringify(n));
  check('聊天体检只挂一个悬浮球（#biRoot=1）', n.biRoot === 1, JSON.stringify(n));
      check('岗位监控只挂一个悬浮球（#bwRoot=1）', n.bwRoot === 1 && n.bwFab === 1, JSON.stringify(n));
      check('无运行时错误', errors.length === 0, errors.join(' | '));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(failures ? ('\n失败 ' + failures + ' 项') : '\n全部通过 ✔');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error('悬浮球唯一性测试异常：' + ((e && e.stack) || e)); process.exitCode = 1; });
