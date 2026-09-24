// 岗位体检（boss-insight）端到端测试：悬浮球 / 面板 / 风险规则 / AI 设置 / 重绘保护 / 菜单命令
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-insight.user.js'), 'utf8');
const SCRIPT_VER = (SCRIPT.match(/@version\s+([\d.]+)/) || [])[1] || '';

const GM_STUB = `
(function(){
  const gs = window.__gm = (function(){ try{ return JSON.parse(localStorage.getItem('__gmstub')||'{}'); }catch(e){ return {}; } })();
  const persist = () => { try{ localStorage.setItem('__gmstub', JSON.stringify(gs)); }catch(e){} };
  window.GM_getValue = (k,d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k,v) => { gs[k]=v; persist(); };
  window.GM_registerMenuCommand = (name,fn) => { (window.__menus=window.__menus||[]).push({name:name,fn:fn}); };
  window.GM_addStyle = (css) => { const s=document.createElement('style'); s.textContent=css; (document.head||document.documentElement).appendChild(s); };
  window.__aiReqs = [];
  window.GM_xmlhttpRequest = (o) => {
    window.__aiReqs.push({url:String(o.url||''), data:String(o.data||'')});
    setTimeout(()=>{ try{ o.onload && o.onload({ responseText: '{"choices":[{"message":{"content":"可用"}}]}', status:200 }); }catch(e){} }, 30);
  };
})();
`;

const IN_DATA = { at: Date.now(), jobs: {
  j1: { name: 'Java工程师', company: '甲公司', salary: '20-30K', jd: '岗位职责：写代码。要求：先交培训费，可安排包机票出国' },
  j2: { name: '运营专员', company: '乙公司', salary: '8-12K', jd: '负责日常运营，正常岗位' }
}, changes: [
  { id: 'c1', level: 'warn', jobId: 'j1', jobName: 'Java工程师', company: '甲公司', changes: ['经验 1-3年 → 3-5年'] }
] };

const PAGE_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>BOSS</title></head><body><h1>列表页</h1></body></html>';

let failures = 0;
function check(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async ()=>{
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  try{
    const ctx = await browser.newContext();
    await ctx.addInitScript(GM_STUB);
    await ctx.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:PAGE_HTML });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e=>errors.push(String((e&&e.message)||e)));
    page.on('dialog', d=>d.accept());
    await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await page.evaluate((data)=>{ localStorage.setItem('bw_insight_in', JSON.stringify(data)); localStorage.removeItem('bw_insight_out'); }, IN_DATA);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(2000);

    console.log('悬浮球与面板（v' + SCRIPT_VER + '）');
    const fab = await page.evaluate(()=>{ const b=document.getElementById('biFab'); return b?{text:b.textContent,title:b.title}:null; });
    check('右下角出现 🩺 悬浮球（title 是聊天口径：会话/待处理/已处理）', !!fab && fab.text==='🩺' && /聊天体检/.test(fab.title||''), JSON.stringify(fab));
    await page.evaluate(()=>document.getElementById('biFab').click());
    await page.waitForTimeout(400);
    const open1 = await page.evaluate(()=>{
      const p=document.getElementById('biPanel');
      const cards=Array.prototype.slice.call(p.querySelectorAll('.bip-card')).map(x=>x.textContent.replace(/\s+/g,' '));
      return {shown:p.style.display==='block', cards:cards, text:p.textContent};
    });
    check('点球打开面板，六张卡（今日会话总数 / 总会话总数 / 今日立即体检 / 总立即体检 / 待处理 / 风险词）', open1.shown && open1.cards.length===6 && /今日会话总数/.test(open1.cards[0]) && /总会话总数/.test(open1.cards[1]) && /今日立即体检/.test(open1.cards[2]) && /总立即体检/.test(open1.cards[3]) && /待处理/.test(open1.cards[4]) && /风险词/.test(open1.cards[5]), JSON.stringify(open1.cards));

    console.log('风险词：不打分 + 一键隐藏标记卡片');
    const riskUi = await page.evaluate(()=>({
      ta: !!document.getElementById('biRiskWords'),
      hideBtn: !!document.querySelector('#biPanel [data-bi="hide-marked"]'),
      hideTxt: (document.querySelector('#biPanel [data-bi="hide-marked"]')||{}).textContent||'',
      result: (document.querySelectorAll('#biPanel details.bip-fold')[1].textContent||'').replace(/\s+/g,' ').slice(0,60)
    }));
    check('风险词文本域 + 一键隐藏标记卡片按钮都在', riskUi.ta && riskUi.hideBtn && /一键隐藏标记卡片/.test(riskUi.hideTxt), JSON.stringify(riskUi));
    check('结果区不再打分（改成会话命中风险词口径）', /命中风险词/.test(riskUi.result) && !/\d+ 分/.test(riskUi.result), riskUi.result);

    console.log('面板改规则 → 立即生效');
    const before = await page.evaluate(()=>((JSON.parse(localStorage.getItem('__gmstub')||'{}').bi_settings||{}).riskWords||[]).length);
    await page.evaluate(()=>{
      const t=document.getElementById('biRiskWords');
      t.value='测试词\n另一个词';
      document.querySelector('#biPanel [data-bi="rules-save"]').click();
    });
    await page.waitForTimeout(300);
    const afterRules = await page.evaluate(()=>{
      const s=(JSON.parse(localStorage.getItem('__gmstub')||'{}').bi_settings||{});
      return {n:(s.riskWords||[]).length, first:(s.riskWords||[])[0]};
    });
    check('风险词文本域保存：默认 '+before+' 个 → 2 个并落盘', afterRules.n===2 && afterRules.first==='测试词', JSON.stringify(afterRules));
    check('卡片里的「风险词」数字同步为 2', /2风险词/.test((await page.evaluate(()=>document.querySelector('#biPanel .bip-cards').textContent)).replace(/\s/g,'')), '');
    await page.evaluate(()=>{ document.querySelector('#biPanel [data-bi="rules-default"]').click(); });
    await page.waitForTimeout(300);
    const restored = await page.evaluate(()=>((JSON.parse(localStorage.getItem('__gmstub')||'{}').bi_settings||{}).riskWords||[]).length);
    check('「恢复默认」把默认风险词拿回来', restored===before, 'riskWords='+restored);

    console.log('重绘保护（8 秒一轮不打断你正在填的东西）');
    const keepBefore = await page.evaluate(()=>{
      const folds=document.querySelectorAll('#biPanel details.bip-fold');
      folds[1].open=true;
      document.getElementById('biRuleBlock').value='押金\n培训费\n出国';
      document.getElementById('biPanel').scrollTop=30;
      return {open:folds[1].open, val:(document.getElementById('biRuleBlock')||{}).value, scroll:document.getElementById('biPanel').scrollTop};
    });
    await sleep(9000);   // 覆盖一次 8 秒 tick
    const keepAfter = await page.evaluate(()=>{
      const folds=document.querySelectorAll('#biPanel details.bip-fold');
      return {open:folds[1].open, val:(document.getElementById('biRuleBlock')||{}).value, scroll:document.getElementById('biPanel').scrollTop};
    });
    check('自动刷新后：规则折叠区仍展开 / 没保存的规则还在 / 滚动保留', keepAfter.open===true && keepAfter.val==='押金\n培训费\n出国' && keepAfter.scroll===30, JSON.stringify({before:keepBefore,after:keepAfter}));

    console.log('油猴菜单（4 项，点了要有反应）');
    const menus = await page.evaluate(()=>(window.__menus||[]).map(m=>m.name));
    check('脚本自有的 3 个菜单命令都在（聊天体检设置 / 聊天体检 / 状态），外加兼容层的环境自检项', (menus.length>=4 && [/环境自检/,/聊天体检设置/,/聊天体检/,/状态/].every(function(re){return menus.some(function(n){return re.test(n);});})), JSON.stringify(menus));
    await page.evaluate(()=>{ document.getElementById('biPanel').style.display='none'; (window.__menus||[]).find(function(m){return /聊天体检/.test(m.name);}).fn(); });
    await page.waitForTimeout(400);
    const menuOpen = await page.evaluate(()=>{
      const p=document.getElementById('biPanel');
      const folds=document.querySelectorAll('#biPanel details.bip-fold');
      return {shown:p.style.display==='block', aiOpen:folds[1].open, rulesOpen:folds[0].open};
    });
    check('点菜单「聊天体检」→ 面板打开（折叠区定位不强制）', menuOpen.shown===true, JSON.stringify(menuOpen));
    await page.evaluate(()=>{ document.getElementById('biPanel').style.display='none'; (window.__menus||[]).find(function(m){return /聊天体检设置/.test(m.name);}).fn(); });
    await page.waitForTimeout(300);
    const menuRules = await page.evaluate(()=>{ const folds=document.querySelectorAll('#biPanel details.bip-fold'); return {rulesOpen:folds[0].open}; });
    check('点菜单「聊天体检设置」→ 定位到风险词折叠区', menuRules.rulesOpen===true, JSON.stringify(menuRules));

    check('无运行时错误', errors.length===0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(failures ? ('\n失败 ' + failures + ' 项') : '\n全部通过 ✔');
  process.exitCode = failures ? 1 : 0;
})().catch(e=>{ console.error('岗位体检测试异常：' + (e && e.stack || e)); process.exitCode = 1; });
