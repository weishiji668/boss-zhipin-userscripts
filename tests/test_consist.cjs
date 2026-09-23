// 一致性脚本端到端测试：假列表页 + 假详情页 → 隐藏/标记两按钮批量 → 落盘恢复 → 清除 → 限流冷却
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-consist.user.js'), 'utf8');

function card(id, name, salary, company, chips){
  return '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/' + id + '.html">'
    + '<div class="job-info"><div class="job-title"><span class="job-name">' + name + '</span><span class="salary">' + salary + '</span></div>'
    + (chips ? '<ul class="tag-list">' + chips.map(c=>'<li>'+c+'</li>').join('') + '</ul>' : '')
    + '</div><div class="company-info"><h3 class="company-name">' + company + '</h3></div></a></div></li>';
}
const LIST_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
  + card('p1', '仓管专员', '6-8K', '甲公司', ['大专', '经验不限'])
  + card('p2', '海外销售', '9-14K', '乙公司', ['本科', '3-5年'])
  + card('p3', '前台接待', '4-5K', '丙公司', null)
  + '</ul></div></body></html>';
const JD = {
  p1: '任职要求：本科及以上学历，1-3 年物料管理工作经验，沟通能力较强，能听从公司领导的安排，电子信息专业的应届生亦可。',
  p2: '岗位职责：负责海外客户维护与订单跟进；要求英语四六级，熟练办公软件，有相关工作经验者优先考虑。',
  p3: '岗位职责：负责前台接待与电话转接，熟练办公软件，工作认真细致即可，无其它硬性要求。'
};
function detailHtml(id){
  // 注意：v0.2.3 起，详情响应短于 2000 字符会被判成「响应过短（疑似被拦）」并冷却 15 分钟。
  // 真实详情页远大于这个阈值，所以这里把正文补到 2000 字符以上，让 mock 与真实形态一致
  //（否则测试会停在冷却状态，看不到后续的判断与落盘）。
  const pad = '岗位职责：负责日常事务处理与跨部门沟通协作，熟悉常用办公软件，做事细致有责任心，能承受一定工作节奏。';
  let body = JD[id] || JD.p3;
  while (body.length < 2600) body += '\n' + pad;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-detail"><div class="job-sec-text">' + body + '</div></div></body></html>';
}

let failures = 0;
function check(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}
async function open(browser, opts){
  const ctx = await browser.newContext();
  await ctx.route('**/*', route=>{
    const u = route.request().url();
    if(!u.includes('zhipin.com')) return route.continue();
    const m = u.match(/job_detail\/(p\d)\.html/);
    if(m){
      if(opts && opts.fail429 === m[1]) return route.fulfill({ status:429, contentType:'text/html;charset=utf-8', body:'<html>too many</html>' });
      return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body: detailHtml(m[1]) });
    }
    route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body: LIST_HTML });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e=>errs.push(String((e && e.message) || e)));
  await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
  return { ctx, page, errs };
}
const state = (page)=>page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
  id: (li.querySelector('a[href*="job_detail"]')||{getAttribute:()=>''}).getAttribute('href').match(/job_detail\/(p\d)/)[1],
  visible: getComputedStyle(li).display!=='none',
  hide: li.getAttribute('data-bc-hide')||'',
  mark: li.getAttribute('data-bc-mark')||'',
  cap: li.querySelector('.cs-tag') ? li.querySelector('.cs-tag').textContent : ''
})));

(async ()=>{
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  console.log('隐藏按钮：批量补取正文 + 矛盾/硬要求命中即隐藏');
  {
    const { ctx, page, errs } = await open(browser);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>document.getElementById('csHide').click());
    await page.waitForTimeout(6500);
    const rows = await state(page);
    const p1=rows.find(r=>r.id==='p1'), p2=rows.find(r=>r.id==='p2'), p3=rows.find(r=>r.id==='p3');
    check('学历+经验矛盾卡被隐藏（data-bc-hide）', p1&&!p1.visible&&p1.hide==='1', JSON.stringify(p1));
    check('正文硬要求（四六级）卡被隐藏', p2&&!p2.visible&&p2.hide==='1', JSON.stringify(p2));
    check('无命中卡保持可见', p3&&p3.visible&&p3.hide==='', JSON.stringify(p3));
    const acts = await page.evaluate(()=>JSON.parse(localStorage.getItem('bc_actions_v1')||'{}'));
    check('处置按 jobId 落盘 bc_actions', !!acts.p1&&acts.p1.mode==='hide'&&!!acts.p2&&acts.p2.mode==='hide', JSON.stringify(Object.keys(acts)));
    check('详情正文写进共用缓存 bwf_jd_cache', await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('bwf_jd_cache')||'{}'); return !!c.p1&&!!c.p2&&!!c.p3; }), '');
    check('无运行时错误', errs.length===0, errs.join(' | '));

    console.log('刷新自动恢复处置（不重新点按钮）');
    await page.reload({ waitUntil:'load' });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(900);
    const rows2 = await state(page);
    check('刷新后 p1/p2 仍隐藏（落盘恢复）', rows2.find(r=>r.id==='p1').visible===false && rows2.find(r=>r.id==='p2').visible===false, JSON.stringify(rows2));

    console.log('清除按钮撤销本脚本处置');
    await page.evaluate(()=>{ document.getElementById('csRules').click(); document.getElementById('csClear').click(); });
    await page.waitForTimeout(400);
    const rows3 = await state(page);
    check('清除后全部可见、标记撤掉', rows3.every(r=>r.visible&&r.hide===''&&r.mark===''), JSON.stringify(rows3));
    check('bc_actions 已清空', await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('bc_actions_v1')||'{}')).length===0), '');
    await ctx.close();
  }

  console.log('标记按钮：只打胶囊不隐藏');
  {
    const { ctx, page, errs } = await open(browser);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>document.getElementById('csMark').click());
    await page.waitForTimeout(6500);
    const rows = await state(page);
    const p1=rows.find(r=>r.id==='p1'), p2=rows.find(r=>r.id==='p2'), p3=rows.find(r=>r.id==='p3');
    check('命中卡打胶囊且仍可见', p1&&p1.visible&&p1.mark==='1'&&!!p1.cap&&p2&&p2.visible&&p2.mark==='1', JSON.stringify(rows));
    check('无命中卡无胶囊', p3&&p3.visible&&p3.cap==='', JSON.stringify(p3));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('站点限流 → 冷却 15 分钟并停止批量');
  {
    const { ctx, page, errs } = await open(browser, { fail429:'p1' });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>document.getElementById('csHide').click());
    await page.waitForTimeout(2500);
    const st = await page.evaluate(()=>document.getElementById('csCount').textContent);
    check('429 后进入冷却并提示', /冷却/.test(st), st);
    const cool = await page.evaluate(()=>parseInt(localStorage.getItem('bc_cool_until')||'0',10) > Date.now());
    check('冷却时间落盘', cool===true, '');
    const rows = await state(page);
    check('限流时不再继续隐藏后续卡片', rows.every(r=>r.hide===''), JSON.stringify(rows));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }


  console.log('v0.2.0 右键取消标记：复核误标后不再打标/隐藏');
  {
    const { ctx, page, errs } = await open(browser);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>document.getElementById('csMark').click());
    await page.waitForTimeout(6500);
    let rows = await state(page);
    check('前置：p1/p2 已标记', rows.find(r=>r.id==='p1').mark==='1', JSON.stringify(rows));
    await page.evaluate(()=>{
      const cap=document.querySelector('a[href*="p1"]').closest('li').querySelector('.cs-tag');
      cap.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:140,clientY:140}));
    });
    await page.waitForTimeout(300);
    const menu = await page.evaluate(()=>{ const m=document.querySelector('.cs-menu'); return m?Array.prototype.slice.call(m.querySelectorAll('button')).map(b=>b.getAttribute('data-m')):null; });
    check('右键标记卡弹出菜单（含取消标记）', !!menu && menu.indexOf('unmark')>=0, JSON.stringify(menu));
    await page.evaluate(()=>{ document.querySelector('.cs-menu button[data-m="unmark"]').click(); });
    await page.waitForTimeout(600);
    rows = await state(page);
    const un = await page.evaluate(()=>JSON.parse(localStorage.getItem('bc_unmarked')||'{}'));
    check('取消标记：p1 标记清除且名单落盘', rows.find(r=>r.id==='p1').mark===''&&Object.keys(un).indexOf('p1')>=0, JSON.stringify({rows,un}));
    await page.evaluate(()=>document.getElementById('csHide').click());
    await page.waitForTimeout(6500);
    rows = await state(page);
    check('隐藏按钮只藏仍带标记的卡（p1 不藏、p2 藏）', rows.find(r=>r.id==='p1').visible===true && rows.find(r=>r.id==='p2').visible===false, JSON.stringify(rows));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('v0.2.2 手动对比两框');
  {
    const { ctx, page, errs } = await open(browser);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>document.getElementById('csRules').click());
    await page.waitForTimeout(300);
    await page.evaluate(()=>{
      document.getElementById('csManualCard').value='大专 经验不限';
      document.getElementById('csManualJd').value='任职要求：本科及以上学历，1-3 年工作经验，英语四六级。';
      document.getElementById('csManualRun').click();
    });
    await page.waitForTimeout(200);
    const out = await page.evaluate(()=>document.getElementById('csManualOut').textContent);
    check('手动对比：学历+经验+硬要求都报出来', /学历矛盾/.test(out) && /经验矛盾/.test(out) && /四六级/.test(out), out);
    await page.evaluate(()=>{
      document.getElementById('csManualJd').value='岗位职责：负责前台接待，熟练办公软件。';
      document.getElementById('csManualRun').click();
    });
    await page.waitForTimeout(200);
    const out2 = await page.evaluate(()=>document.getElementById('csManualOut').textContent);
    check('手动对比：无矛盾时明确说未检出', /未检出/.test(out2), out2);
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
  process.exit(failures ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
