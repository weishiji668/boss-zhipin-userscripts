// 端到端冒烟测试：走「真实 fetch → 钩子被动捕获 → 面板渲染」全链路，验证脚本真的能用。
// 依赖：Playwright + 本机 Chrome
//   npm i playwright
//   node tests/test_e2e.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const USERSCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-watcher.user.js'), 'utf8');
const CHAT_USERSCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-chat.user.js'), 'utf8');   // 聊天已拆分为独立脚本
const GM_STUB = `
  // 用 localStorage 模拟「跨页面持久」的 GM 存储（真实篡改猴就是这样）
  const gs = window.__gm = (function(){
    try { return JSON.parse(localStorage.getItem('__gmstub') || '{}'); } catch (e) { return {}; }
  })();
  const persist = () => { try { localStorage.setItem('__gmstub', JSON.stringify(gs)); } catch (e) {} };
  window.GM_getValue = (k, d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k, v) => { gs[k] = v; persist(); };
  window.GM_deleteValue = (k) => { delete gs[k]; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.__bwReq = [];
  window.__bwXhrBody = '{"code":0,"message":"Success","zpData":{}}';
  window.GM_xmlhttpRequest = (o) => {
    window.__bwReq.push(o.url);
    // 非 BOSS 域名（例如 AI 接口）走真实网络，便于测试
    if (!String(o.url).includes('zhipin.com')) {
      fetch(o.url, { method: o.method || 'GET', headers: o.headers || {}, body: o.data })
        .then(async (r) => { const t = await r.text(); o.onload && o.onload({ responseText: t, status: r.status }); })
        .catch(() => { o.onerror && o.onerror(); })
        .finally(() => { o.onloadend && o.onloadend(); });
      return;
    }
    setTimeout(() => {
      try { o.onload && o.onload({ responseText: window.__bwXhrBody, status: 200 }); } catch (e) {}
      try { o.onloadend && o.onloadend(); } catch (e) {}
    }, 0);
  };
  window.GM_notification = () => {};
  window.GM_addStyle = (css) => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
`;

const PAYLOADS = {
  '/wapi/zpgeek/friend/list.json': {code:0, zpData:{list:[{friendId:'f1', brandName:'测试科技', bossName:'张经理', jobId:'job1', jobName:'前端工程师'}]}},
  '/job_detail/job1.html': {code:0, zpData:{jobDetail:{jobId:'job1', jobName:'前端工程师', salaryDesc:'20-30K', jobExperience:'1-3年', jobDegree:'大专', lastModifyTime:1700000000000, jobDesc:'负责前端开发\n熟悉 React\n入职需先交培训费'}}},
  '/wapi/zpgeek/friend/message.json': {code:0, zpData:{list:[
    {msgId:'m1', createTime:1700000000000, content:'您好，我对贵司岗位感兴趣', isMyself:true},
    {msgId:'m2', createTime:1700000060000, content:'你好，方便加微信聊吗'}
  ]}},
  '/job_detail/job1_v2.html': {code:0, zpData:{jobDetail:{jobId:'job1', jobName:'前端工程师', salaryDesc:'25-35K', jobDesc:'负责前端开发\n熟悉 React\n熟悉 Vue'}}}
  ,'/job_detail/job2.html': {code:0, zpData:{jobDetail:{jobId:'job2', jobName:'后端工程师', salaryDesc:'18-25K', jobDesc:'负责服务端开发\n熟悉 Java'}}}
  ,'/job_detail/job1_v3.html': {code:0, zpData:{jobDetail:{jobId:'job1', jobName:'前端工程师', salaryDesc:'15-20K', jobExperience:'3-5年', jobDegree:'本科', lastModifyTime:1700100000000, jobDesc:'负责前端开发\n熟悉 React\n熟悉 Vue\n熟悉 Node\n入职需先交培训费'}}}
  ,'/job_detail/job1_off.html': {code:0, message:'Success', zpData:{}}
  // 列表接口：同一岗位（job1）薪资已下调 —— 用来验证「再次搜到就判别」
  ,'/wapi/zpgeek/search/joblist.json': {code:0, zpData:{jobList:[{encryptJobId:'job1', salaryDesc:'15-20K', jobName:'前端工程师', brandName:'测试科技'}]}}
};

// v0.9.0：按需收录 —— 先往 GM 存储里种一个「我收录过的岗位」，再看浏览时的对比链路。
// （脚本不再「浏览即建档」，所以 e2e 必须先有监控项，才能验证对比 / 信号 / 熔断）
const SEED_WATCH = `
  try{
    const gs = JSON.parse(localStorage.getItem('__gmstub') || '{}');
    gs.bw_watchver = '0.9.0';                       // 跳过迁移，别把种子清掉
    const item = {id:'job:job1', itemId:'job:job1', type:'job', jobId:'job1', company:'测试科技', jobName:'前端工程师',
      hr:'张经理', watch:true, addedAt:1, lastSeenAt:1, url:'https://www.zhipin.com/job_detail/job1.html',
      meta:{name:'前端工程师', company:'测试科技', url:'https://www.zhipin.com/job_detail/job1.html'},
      last:{ts:1, name:'前端工程师', company:'测试科技', salary:'20-30K', exp:'1-3年', edu:'大专', hr:'张经理',
        status:'在招', active:true, labels:'', city:'深圳·南山区', address:'', companyJobs:0,
        jd:'负责前端开发\\n熟悉 React\\n入职需先交培训费', publish:1700000000000, src:'seed'},
      first:{ts:1, salary:'20-30K', exp:'1-3年', edu:'大专', hr:'张经理', status:'在招', jd:''},
      snapshots:[], changes:[]};
    gs.bw_watchlist = {'job:job1': item};
    gs.bw_jobs = {job1: item};
    gs.bw_signals = [];
    localStorage.setItem('__gmstub', JSON.stringify(gs));
  }catch(e){}
`;

let failures = 0;
function check(name, cond, extra){
  if(cond){ console.log('  ✓ ' + name); }
  else{ failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

// 把所有 zhipin 请求都换成固定桩数据
function routeStub(ctx){
  return ctx.route('**/*', route=>{
    const u = route.request().url();
    if(!u.includes('zhipin.com')) return route.continue();
    // 特殊用例：job1 详情返回空数据 → 模拟「职位突然下线」
    if(u.includes('/job_detail/job1.html') && u.includes('off=1')){
      return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:JSON.stringify({code:0, message:'Success', zpData:{}}) });
    }
    const hit = Object.keys(PAYLOADS).find(k=>u.includes(k));
    if(hit){
      return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:JSON.stringify(PAYLOADS[hit]) });
    }
    route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>stub</h1></body></html>' });
  });
}

(async ()=>{
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const errors = [];
  context.on('page', p=>{
    p.on('pageerror', e=>errors.push('pageerror: ' + e.message));
    p.on('console', m=>{ if(m.type()==='error') errors.push('console: ' + m.text()); });
  });
  await routeStub(context);
  await context.addInitScript(SEED_WATCH);
  await context.addInitScript(GM_STUB);
  await context.addInitScript(USERSCRIPT);
  const page = await context.newPage();
  await page.goto('https://www.zhipin.com/', { waitUntil:'load' });
  await page.waitForTimeout(800);

  console.log('启动与 UI');
  check('fetch 钩子已安装', await page.evaluate(()=>window.__bwFetchHooked === true));
  check('XHR 钩子已安装', await page.evaluate(()=>window.__bwXhrHooked === true));
  check('面板已构建', await page.evaluate(()=>!!document.getElementById('bwPanel')));
  check('样式已注入（CSS 变量名与引用一致，不再被 catch 静默吞掉）', await page.evaluate(()=>[...document.querySelectorAll('style')].some(s=>s.textContent.includes('#bwRoot{position:fixed'))));
  check('💼 悬浮球定位在右下角', await page.evaluate(()=>{ const r=document.getElementById('bwFab').getBoundingClientRect(); return r.bottom > window.innerHeight*0.7 && r.right > window.innerWidth*0.7 && r.width > 40; }));

  console.log('数据注入（真实 fetch → 钩子被动捕获）');
  await page.evaluate(async ()=>{
    await fetch('https://www.zhipin.com/wapi/zpgeek/friend/list.json?page=1').then(r=>r.text());
    await fetch('https://www.zhipin.com/job_detail/job1.html?x=1').then(r=>r.text());
    await fetch('https://www.zhipin.com/wapi/zpgeek/friend/message.json?friendId=f1').then(r=>r.text());
  });
  await page.waitForTimeout(600);

  console.log('存储与面板内容');
  const gmKeys = await page.evaluate(()=>Object.keys(window.__gm).sort());
  // v0.9.0 存储键更新（测试脚本同步）：bw_riskhits / bw_rules 随风险规则拆到 boss-insight 不再写；
  // 新增 bw_watchlist（监控清单）/ bw_signals（跟进信号）
  check('GM 存储写入', ['bw_jobs','bw_watchlist','bw_signals','bw_captured','bw_watchver'].every(k=>gmKeys.includes(k)), gmKeys.join(','));   // v0.9 轻量存储：bw_chats 已拆给 boss-chat；空的 settings/logs/changelog 不落盘，不再断言
  await page.evaluate(()=>document.getElementById('bwFab').click());
  await page.waitForTimeout(200);
  check('点击 💼 后面板可见', await page.evaluate(()=>getComputedStyle(document.getElementById('bwPanel')).display!=='none'));
  await page.evaluate(()=>document.getElementById('bwFab').click());
  await page.waitForTimeout(100);
  check('再次点击 💼 后面板收起', await page.evaluate(()=>getComputedStyle(document.getElementById('bwPanel')).display==='none'));
  await page.evaluate(()=>document.getElementById('bwFab').click());
  await page.waitForTimeout(200);
  const monText = await page.evaluate(()=>document.getElementById('bwPage_mon').textContent);
  check('监控页显示已收录岗位', monText.includes('前端工程师') && monText.includes('20-30K'));
  // v0.9.0：风险规则 / AI 判定已拆到 boss-insight.user.js，watcher 不再有「风险」页签。
  // watcher 的职责是把 JD 完整抓进快照并镜像给 insight（bw_insight_in），打分在 insight 里验证（见 test_insight.cjs）
  const jdStored = await page.evaluate(()=>{ const j=(window.__gm.bw_jobs||{}).job1; return j&&j.last?String(j.last.jd||''):''; });
  check('详情 JD 完整进快照（培训费字样在正文里，供 boss-insight 读镜像体检）', jdStored.includes('培训费'), jdStored.slice(0,40));
  check('风险页签已拆到 boss-insight（watcher 面板不再有 bwTab_risk）', await page.evaluate(()=>!document.getElementById('bwTab_risk')));
  const settingsText = await page.evaluate(()=>{ document.getElementById('bwTab_set').click(); return document.getElementById('bwPage_set').textContent; });
  // v0.9.0：「导出全部备份」「导出Excel表格」随旧架构移除；设置页现在明确指向 boss-insight
  check('设置页渲染', settingsText.includes('清空全部数据') && settingsText.includes('接口观察'));
  check('设置页说明「分析件已拆到 boss-insight」', settingsText.includes('boss-insight'));

  console.log('变更检测（薪资 20-30K → 25-35K + JD 变化）');
  await page.evaluate(async ()=>{
    await fetch('https://www.zhipin.com/job_detail/job1_v2.html?x=2').then(r=>r.text());
  });
  await page.waitForTimeout(400);
  const chg = await page.evaluate(()=>{
    document.getElementById('bwTab_mon').click();
    return document.getElementById('bwPage_mon').textContent;
  });
  check('薪资变化被记录', chg.includes('20-30K') && chg.includes('25-35K'));

  console.log('跟进信号（薪资下调 / 要求拔高 / 突然下线）');
  // v0.9.0：所有监控项都是你手动收录的 → 不需要再点「盯」
  await page.evaluate(async ()=>{
    await fetch('https://www.zhipin.com/job_detail/job1_v3.html?x=3').then(r=>r.text());
  });
  await page.waitForTimeout(500);
  const sigText = await page.evaluate(()=>{
    const b=document.querySelector('[data-act=montab][data-id=signals]'); if(b) b.click();
    return document.getElementById('bwPage_mon').textContent;
  });
  check('薪资下调 → 进入待处理', sigText.includes('待处理') && sigText.includes('薪资（下调）'), '');
  check('要求拔高 → 经验 1-3年→3-5年、学历 大专→本科', sigText.includes('要求拔高') && sigText.includes('3-5年') && sigText.includes('本科'));
  const sigEntry = await page.evaluate(()=>{
    return (window.__gm.bw_changelog||[]).filter(x=>x.jobId==='job1').map(x=>({field:x.field,level:x.level,text:x.text}));
  });
  check('变更流水带字段级明细（薪资下调 / 要求拔高）',
    sigEntry.some(x=>/薪资/.test(x.field||'')&&/下调/.test(x.text||'')) &&
    sigEntry.some(x=>/经验|学历/.test(x.field||'')&&/拔高/.test(x.text||'')),
    JSON.stringify(sigEntry));
  const sigRows = await page.evaluate(()=>(window.__gm.bw_signals||[]).map(s=>({kind:s.kind,level:s.level,text:s.text})));
  check('跟进信号（待办）落盘：薪资变化 + 要求拔高',
    sigRows.some(s=>/薪资/.test(s.kind||'')) && sigRows.some(s=>/要求拔高/.test(s.kind||'')),
    JSON.stringify(sigRows));
  await page.evaluate(async ()=>{
    await fetch('https://www.zhipin.com/job_detail/job1.html?off=1').then(r=>r.text());
  });
  await page.waitForTimeout(500);
  const offText = await page.evaluate(()=>document.getElementById('bwPage_mon').textContent);
  const offDbg = await page.evaluate(()=>(window.__gm.bw_changelog||[]).slice(0,3).map(c=>({jobId:c.jobId,level:c.level,changes:c.changes})));
  check('职位突然下线 → 最高级信号（重要）', /下线/.test(offText) && /重要/.test(offText), JSON.stringify(offDbg));

  console.log('风控熔断（返回验证码页面 → 当日停止主动请求）');
  await page.evaluate(() => { window.__bwXhrBody = '<html><head><title>安全验证</title></head><body><div>请完成安全验证后继续访问</div></body></html>'; });
  await page.evaluate(() => document.getElementById('bwTab_mon').click());
  // v0.9.0 起监控清单里全是你手动收录的岗位，「立即检查」直接查所有监控项（不再需要先点「盯」——jobwatch 按钮已不存在）
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-act=check]').click());
  await page.waitForTimeout(700);
  const req1 = await page.evaluate(() => window.__bwReq.length);
  const monText2 = await page.evaluate(() => document.getElementById('bwPage_mon').textContent);
  check('检测到验证页面 → 面板显示熔断', req1 > 0 && monText2.includes('风控熔断') && monText2.includes('解除熔断'), '请求 ' + req1 + ' 次');
  await page.evaluate(() => document.querySelector('[data-act=check]').click());
  await page.waitForTimeout(500);
  const req2 = await page.evaluate(() => window.__bwReq.length);
  check('熔断期间不再发请求', req2 === req1, req1 + ' → ' + req2);
  await page.evaluate(() => document.querySelector('[data-act=unblock]').click());
  await page.waitForTimeout(300);
  const monText3 = await page.evaluate(() => document.getElementById('bwPage_mon').textContent);
  check('手动解除熔断后提示消失', !monText3.includes('风控熔断'));

  console.log('页面世界注入（模拟沙箱钩子失效：只靠注入的 <script> 捕获）');
  {
    const ctx2 = await browser.newContext();
    await routeStub(ctx2);
    // 先占住沙箱钩子的标记位 → hookFetch/hookXHR 直接放弃，只剩注入的页面世界钩子在工作
    await ctx2.addInitScript('window.__bwFetchHooked=true; window.__bwXhrHooked=true;');
    await ctx2.addInitScript(GM_STUB);
    await ctx2.addInitScript(USERSCRIPT);
    const p2 = await ctx2.newPage();
    await p2.goto('https://www.zhipin.com/', { waitUntil:'load' });
    let mainOk = false;
    for(let i=0;i<10&&!mainOk;i++){
      mainOk = await p2.evaluate(()=>!!window.__bwMainHooked);
      if(!mainOk) await p2.waitForTimeout(400);
    }
    check('注入的页面世界钩子已执行', mainOk);
    await p2.evaluate(async ()=>{
      await fetch('https://www.zhipin.com/wapi/zpgeek/friend/list.json?page=1').then(r=>r.text());
      await fetch('https://www.zhipin.com/job_detail/job1.html?x=1').then(r=>r.text());
    });
    await p2.waitForTimeout(2200); // 统计是 1.5s 节流上报，多等一会儿再读
    const diag2 = await p2.evaluate(()=>window.__gm.bw_diag||null);
    check('页面世界钩子经 postMessage 回传并落盘诊断', !!diag2 && diag2.main===1 && !!diag2.seen && diag2.seen.api>0, JSON.stringify(diag2));
    const jobs2 = await p2.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}).length);
    check('只靠注入钩子也不自动建档（v0.9.0 按需收录）', jobs2===0, '岗位数=' + jobs2);
    await p2.evaluate(()=>document.getElementById('bwFab').click());
    await p2.waitForTimeout(250);
    const mon2 = await p2.evaluate(()=>document.getElementById('bwPage_mon').textContent);
    check('面板显示「还没有监控项」的空态（v0.9.0 不再自动建档）', mon2.includes('还没有监控项'), mon2.slice(0,80));
    await ctx2.close();
  }

  console.log('列表页 DOM 抓取（服务端渲染、接口里没有岗位数据时的兜底）');
  {
    const LIST_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>搜索结果</title></head><body>'
      + '<div class="job-list"><ul>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/dom1.html?lid=x">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">抖音流量达人</span><span class="salary">14-21K</span></div>'
      + '<ul class="tag-list"><li>1-3年</li><li>大专</li></ul></div>'
      + '<div class="company-info"><h3 class="company-name">深圳赛驹机车有限公司</h3></div>'
      + '<span class="job-area">深圳·南山区</span></a></div></li>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/dom2.html?lid=y">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">TK短视频剪辑</span><span class="salary">5-7K</span></div></div>'
      + '<div class="company-info"><h3 class="company-name">某某传媒</h3></div></a></div></li>'
      + '</ul></div></body></html>';
    const ctx3 = await browser.newContext();
    await ctx3.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('/web/geek/job')) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_HTML });
      route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>stub</h1></body></html>' });
    });
    await ctx3.addInitScript(GM_STUB);
    await ctx3.addInitScript(USERSCRIPT);
    const p3 = await ctx3.newPage();
    await p3.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p3.waitForTimeout(4200);
    const jobsAuto = await p3.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('列表页不再自动建档（v0.9.0 按需收录）', jobsAuto.length===0, 'jobs=' + jobsAuto.join(','));
    const cardBtns = await p3.evaluate(()=>document.querySelectorAll('.bw-cardbtn').length);
    check('过滤后仍可见的卡片上注入「盯岗 / 盯司」按钮', cardBtns>=2, '按钮数=' + cardBtns);
    await p3.evaluate(()=>document.getElementById('bwFab').click());
    await p3.waitForTimeout(200);
    await p3.evaluate(()=>document.querySelector('[data-act=reccur]').click());
    await p3.waitForTimeout(300);
    await p3.evaluate(()=>{ const b=document.querySelector('[data-act=recpick]'); if(b) b.click(); });
    await p3.waitForTimeout(2200);
    const jobs3 = await p3.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('点「收录当前页」→ 候选 → 收录后建档', jobs3.length>=1, 'jobs=' + jobs3.join(','));
    const mon3 = await p3.evaluate(()=>document.getElementById('bwPage_mon').textContent);
    check('面板显示收录到的岗位（名称/薪资/公司）',
      mon3.includes('抖音流量达人') && mon3.includes('14-21K') && mon3.includes('深圳赛驹机车有限公司'), mon3.slice(0,200));
    await ctx3.close();
  }

  console.log('岗位详情页 DOM 抓取（打开详情 = 开始监控这个岗位）');
  {
    const DETAIL_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>前端工程师</title></head><body>'
      + '<div class="job-detail-box">'
      + '<div class="job-name">前端工程师</div><span class="salary">20-30K</span>'
      + '<div class="company-info"><span class="name">测试科技有限公司</span></div>'
      + '<div class="job-sec-text">负责前端开发，熟悉 React 与 Vue，入职需先交培训费，转正才交社保</div>'
      + '</div></body></html>';
    const ctx4 = await browser.newContext();
    await ctx4.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('/job_detail/det1.html')) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:DETAIL_HTML });
      route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>stub</h1></body></html>' });
    });
    await ctx4.addInitScript(GM_STUB);
    await ctx4.addInitScript(USERSCRIPT);
    const p4 = await ctx4.newPage();
    await p4.goto('https://www.zhipin.com/job_detail/det1.html?lid=x', { waitUntil:'load' });
    await p4.waitForTimeout(4200);
    const jobs4 = await p4.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('详情页不再自动建档（v0.9.0 按需收录）', jobs4.length===0, 'jobs=' + jobs4.join(','));
    await p4.evaluate(()=>document.getElementById('bwFab').click());
    await p4.waitForTimeout(250);
    await p4.evaluate(()=>document.querySelector('[data-act=reccur]').click());
    await p4.waitForTimeout(1200);
    const jobs4b = await p4.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('详情页点「收录当前页」后建档', jobs4b.includes('det1'), 'jobs=' + jobs4b.join(','));
    const mon4 = await p4.evaluate(()=>document.getElementById('bwPage_mon').textContent);
    check('详情页岗位信息进面板', mon4.includes('前端工程师') && mon4.includes('20-30K') && mon4.includes('测试科技有限公司'));
    // v0.9.0：风险打分拆到 boss-insight；watcher 的职责是把详情页 JD 完整抓进快照（insight 通过 bw_insight_in 镜像读）
    const jd4 = await p4.evaluate(()=>{ const j=(window.__gm.bw_jobs||{}).det1; return j&&j.last?String(j.last.jd||''):''; });
    check('详情页 JD 完整进快照（培训费/社保字样都在，供 boss-insight 体检）', jd4.includes('培训费') && jd4.includes('社保'), String(jd4).slice(0,60));
    await ctx4.close();
  }

  console.log('聊天页 DOM 抓取（打开会话 = 收录这段对话）');
  {
    const CHAT_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>消息</title></head><body>'
      + '<div class="chat-container">'
      + '<ul class="user-list"><li class="user-item" data-id="f1"><div class="title">测试科技</div><div class="source">前端工程师</div></li></ul>'
      + '<div class="chat-header"><span class="name">测试科技</span></div>'
      + '<ul class="message-list">'
      + '<li class="message-item"><div class="text">已读 你好，方便发一份简历吗？可以加微信详聊</div></li>'
      + '<li class="message-item item-myself"><div class="text">送达 好的，我整理一下马上发您 15:20</div></li>'
      + '<li class="message-item"><div class="text">我想要一份您的附件简历，您是否同意 拒绝 同意</div></li>'
      + '</ul></div></body></html>';
    const ctx5 = await browser.newContext();
    await ctx5.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('/web/geek/chat')) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:CHAT_HTML });
      if(u.includes('friend/list.json')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:JSON.stringify(PAYLOADS['/wapi/zpgeek/friend/list.json']) });
      route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>stub</h1></body></html>' });
    });
    // 打开「聊天页 DOM 兜底」+ 先让接口抓到会话列表（DOM 只做补充）
    await ctx5.addInitScript(`try{ localStorage.setItem('__gmstub', JSON.stringify({ bc_settings:{ chat:{ domFallback:true } } })); }catch(e){}`);
    await ctx5.addInitScript(GM_STUB);
    await ctx5.addInitScript(CHAT_USERSCRIPT);
    const p5 = await ctx5.newPage();
    await p5.goto('https://www.zhipin.com/web/geek/chat?friendId=f9', { waitUntil:'load' });
    await p5.waitForTimeout(600);
    await p5.evaluate(()=>fetch('https://www.zhipin.com/wapi/zpgeek/friend/list.json?page=1').then(r=>r.text()));
    await p5.waitForTimeout(4200);
    const chats5 = await p5.evaluate(()=>{
      const c = window.__gm.bc_chats || {};
      return Object.values(c).map(s=>({ company:s.meta && s.meta.company, n:(s.messages||[]).length,
        dirs:(s.messages||[]).map(m=>m.dir).join('/') }));
    });
    check('DOM 兜底把消息并进接口抓到的会话（不造 dom: 假 key）',
      chats5.length===1 && chats5[0].n===2, JSON.stringify(chats5));
    check('消息方向识别（对方/我）', chats5.some(s=>s.dirs==='them/me'), JSON.stringify(chats5));
    const texts5 = await p5.evaluate(()=>{
      const c = window.__gm.bc_chats || {};
      const s = Object.values(c)[0] || { messages: [] };
      return (s.messages||[]).map(m=>m.text);
    });
    check('状态词被清洗（已读/送达/时间）', texts5.some(t=>t.indexOf('已读')<0 && t.indexOf('送达')<0), JSON.stringify(texts5));
    check('系统提示被过滤（要简历那条不收录）', !texts5.some(t=>/附件简历|拒绝/.test(t)), JSON.stringify(texts5));
    await p5.evaluate(()=>document.getElementById('bcFab').click());
    await p5.waitForTimeout(300);
    const chatText5 = await p5.evaluate(()=>document.getElementById('bcBody').textContent);
    check('聊天页显示收录到的会话', chatText5.includes('测试科技'));
    check('聊天面板提供复盘导出按钮', chatText5.includes('导出复盘CSV') && chatText5.includes('导出消息JSONL'));
    await ctx5.close();
  }

  console.log('聊天接口真实报文结构（body.text / from.uid / time）');
  {
    const HISTORY = JSON.stringify({code:0, message:'Success', zpData:{hasMore:false, messages:[
      {mid:9001, time:1700000000000, from:{uid:59683767, name:'郑文玲'}, body:{type:8, jobDesc:{jobName:'行政专员'}}},
      {mid:9002, time:1700000060000, from:{uid:662115016, name:'我'}, body:{type:1, text:'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'}},
      {mid:9003, time:1700000120000, from:{uid:59683767, name:'郑文玲'}, body:{type:1, text:'你好，方便发一份简历吗'}}
    ]}});
    const ctxC = await browser.newContext();
    await ctxC.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('historyMsg')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:HISTORY });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>' });
    });
    await ctxC.addInitScript(GM_STUB);
    await ctxC.addInitScript(CHAT_USERSCRIPT);
    const pC = await ctxC.newPage();
    await pC.goto('https://www.zhipin.com/web/geek/chat', { waitUntil:'load' });
    await pC.waitForTimeout(600);
    await pC.evaluate(async ()=>{ await fetch('https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId=59683767&maxMsgId=0&c=').then(r=>r.text()); });
    await pC.waitForTimeout(900);
    const got = await pC.evaluate(()=>{
      const c = window.__gm.bc_chats || {};
      const s = c['59683767'] || null;
      return s ? { boss:s.meta.boss, job:s.meta.jobName, msgs:(s.messages||[]).map(m=>m.dir+':'+m.text) } : null;
    });
    check('按 bossId 建会话并补出 HR 名字/岗位', !!got && got.boss==='郑文玲' && got.job==='行政专员', JSON.stringify(got));
    check('消息文本取自 body.text，方向按 from.uid 判定', !!got && got.msgs.length===2 && got.msgs[0].indexOf('me:')===0 && got.msgs[1].indexOf('them:')===0, JSON.stringify(got && got.msgs));
    // 方向反推：靠"模板招呼那条一定是我发的"认出自己的 uid
    const dir = await pC.evaluate(()=>{
      const s=(window.__gm.bc_chats||{})['59683767'];
      return s?{myUid:s.meta.myUid,bossUid:s.meta.bossUid}:null;
    });
    check('能从模板招呼反推我的 uid 与对方 uid', !!dir && dir.myUid==='662115016' && dir.bossUid==='59683767', JSON.stringify(dir));
    check('职位卡片消息不入库', !!got && !JSON.stringify(got.msgs).includes('职位卡片'), JSON.stringify(got && got.msgs));
    // getBossData：单对象 + 响应里还有别的数组（真实结构），公司名不能被"先找数组"吞掉
    const BOSS_DATA = JSON.stringify({code:0, message:'Success', zpData:{data:{
      companyName:'万利达', title:'行政', encryptBossId:'59683767', bossId:59683767, name:'郑文玲',
      encryptJobId:'2336bee65e0bdb100nJ_3Nm7FFpR', warningTips:[], tipList:[{a:1}]
    }}});
    await ctxC.route('**/getBossData*', (route)=>route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:BOSS_DATA }));
    await pC.evaluate(async ()=>{ await fetch('https://www.zhipin.com/wapi/zpchat/geek/getBossData?bossId=59683767&bossSource=0').then(r=>r.text()); });
    await pC.waitForTimeout(600);
    const meta = await pC.evaluate(()=>{
      const s=(window.__gm.bc_chats||{})['59683767'];
      return s?{company:s.meta.company, boss:s.meta.boss, job:s.meta.jobName, jobId:s.meta.jobId}:null;
    });
    check('getBossData（单对象）补出公司名/HR/岗位', !!meta && meta.company==='万利达' && meta.boss==='郑文玲' && /行政/.test(meta.job||''), JSON.stringify(meta));
    // 一键收录全部：v1.4.5 起回放「页面自己的真实请求」（带 securityId 令牌）
    // 桩里模拟真实服务端：缺 securityId 就返回 code=0 的空列表（用户遇到的正是这个）
    await pC.evaluate(()=>{
      window.__gm.bc_chats['999001']={meta:{sessionId:'999001'},messages:[],
        msgUrl:'https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId=999001&maxMsgId=987&c=20&page=1&src=0&securityId=TK-999001~~'};
      window.__gm.bc_chats['999002']={meta:{sessionId:'999002'},messages:[]};   // 没点开过 → 没有令牌
      // 上下线窗口用例：对方 09 点发过两条、18 点发过一条（时间戳在页面里算，避免时区差异）
      const H=(h,m)=>new Date(2023,10,15,h,m,0,0).getTime();
      window.__gm.bc_chats['999003']={meta:{sessionId:'999003',company:'跨度公司',boss:'测试HR',jobName:'行政',lastTime:'2023-11-15 18:05'},messages:[
        {dir:'them',ts:H(9,10),text:'早上好'},{dir:'them',ts:H(9,30),text:'方便吗'},{dir:'them',ts:H(18,5),text:'今天先这样'}]};
      window.__bulkUrls=[];
      window.GM_xmlhttpRequest = (o)=>{
        window.__bwReq.push(o.url); window.__bulkUrls.push(o.url);
        const nonZhipin = String(o.url).indexOf('zhipin.com')<0;
        if(nonZhipin){
          fetch(o.url, { method:o.method||'GET', headers:o.headers||{}, body:o.data })
            .then(async r=>{ const t=await r.text(); o.onload&&o.onload({responseText:t,status:r.status}); })
            .catch(()=>{ o.onerror&&o.onerror(); });
          return;
        }
        let body = window.__bwXhrBody;
        if(String(o.url).indexOf('historyMsg')>=0){
          const hasToken = /securityId=/.test(o.url);
          body = hasToken ? window.__realHistory : JSON.stringify({code:0,message:'Success',zpData:{hasMore:false,messages:[]}});
        }
        setTimeout(()=>{ try{ o.onload&&o.onload({responseText:body,status:200}); }catch(e){} try{ o.onloadend&&o.onloadend(); }catch(e){} },0);
      };
    });
    await pC.evaluate((h)=>{ window.__realHistory = h; window.__bwXhrBody = h; }, HISTORY);   // 真实报文（带消息）
    const pulled = await pC.evaluate(()=>{
      document.getElementById('bcFab').click();
      const btn = Array.from(document.querySelectorAll('[data-act]')).find(b=>b.dataset.act==='pullall');
      if(!btn) return 'no-button';
      btn.click();
      return 'clicked';
    });
    check('工具区有「一键收录全部会话」按钮', pulled==='clicked', String(pulled));
    await pC.waitForTimeout(11000);   // 3 个会话（含上下文中已有的）+ 每个 1.2-3 秒间隔
    const after = await pC.evaluate(()=>{
      const s=(window.__gm.bc_chats||{})['999001'];
      return s?(s.messages||[]).length:null;
    });
    check('一键收录把消息拉回来了（回放真实请求 + 带令牌）', after!==null && after>=2, '消息数=' + after);
    const bulkUrls = await pC.evaluate(()=>window.__bulkUrls||[]);
    const hit = bulkUrls.filter(u=>/securityId=TK-999001~~/.test(u));
    check('收录请求带上了 securityId 令牌（不再是缺参的自拼 URL）',
      hit.length>0 && /maxMsgId=0/.test(hit[0]) && /[?&]page=1&src=0/.test(hit[0]),
      String(hit[0]||bulkUrls[0]||'').slice(0,160));
    const actText = await pC.evaluate(()=>{
      let body=document.getElementById('bcBody');
      if(!body || body.offsetParent===null){ document.getElementById('bcFab').click(); body=document.getElementById('bcBody'); }
      return body?body.textContent:'';
    });
    check('会话列表把活跃写成「上下线窗口 · 条数」（跨度会话＝09–18点 / 对方 3 条）', /活跃 09–18点 · 对方 3 条/.test(actText), actText.slice(0,160));
    check('会话列表表头标注「消息/活跃」', actText.indexOf('消息/活跃')>=0, actText.slice(0,60));
    const actHtml = await pC.evaluate(()=>{ const b=document.getElementById('bcBody'); return b?b.innerHTML:''; });
    check('活跃带悬停明细：title 里有每小时条数', /title="[^"]*活跃明细（小时·条数）：09点\(2\) 18点\(1\)/.test(actHtml), actHtml.slice(0,140));
    check('每小时条数直接显示在列表里（不只悬停）', /09点\(2\) 18点\(1\)/.test(actText), actText.slice(0,160));
    const uiChk = await pC.evaluate(()=>{
      const q=s=>document.querySelectorAll(s);
      const first=q('#bcBody .bc-heat')[0];
      return {cols:q('#bcBody .bc-hist .bc-col').length, cells:first?first.children.length:0,
        heatRows:q('#bcBody .bc-heat').length, lit:q('#bcBody .bc-heat i.on, #bcBody .bc-heat i.hi').length,
        folds:q('#bcBody details.bc-fold').length, hasQ:!!document.getElementById('bcQ'), dot:!!document.getElementById('bcDot'),
        rows:q('#bcBody tbody tr[data-open]').length};
    });
    check('v1.5.1 「对方活跃时段」已换成「在线时间线 + 推进信号」', /在线时间线/.test(actText) && /推进信号/.test(actText), actText.slice(0,120));
    check('v1.4.7 会话每行 24 格活跃条，且亮格落在有消息的小时', uiChk.cells===24 && uiChk.lit>0, JSON.stringify(uiChk));
    check('v1.4.7 导出/设置/AI/日志收进折叠区 + 顶部状态点 + 列表每行可点', uiChk.folds>=4 && uiChk.hasQ && uiChk.dot && uiChk.rows>0, JSON.stringify(uiChk));
    const filtered = await pC.evaluate(()=>{
      const before=document.querySelectorAll('#bcBody tbody tr[data-open]').length;
      const q=document.getElementById('bcQ');
      q.value='跨度'; q.dispatchEvent(new Event('input',{bubbles:true}));
      const after=document.querySelectorAll('#bcBody tbody tr[data-open]').length;
      const value=(document.getElementById('bcQ')||{}).value;   // 面板被后台重画后，过滤关键字仍在
      return {before,after,value,text:document.getElementById('bcBody').textContent.slice(0,60)};
    });
    check('v1.4.7 搜索框实时过滤会话（只剩匹配项），且过滤关键字不被重画重置', filtered.after===1 && filtered.before>1 && filtered.value==='跨度', JSON.stringify(filtered).slice(0,160));
    const rowLogs = await pC.evaluate(()=>{
      const row=document.querySelector('#bcBody tbody tr[data-open]');
      row.click();
      return (window.__gm.bc_logs||[]).map(x=>x.msg).join('\n');
    });
    check('v1.4.7 点会话行：页面里没有该会话节点时如实记录（不乱点、不抛错）', /左侧列表里没看到/.test(rowLogs), rowLogs.slice(-150));
    const bulkLogs = await pC.evaluate(()=>(window.__gm.bc_logs||[]).map(x=>x.msg).join('\n'));
    check('收录结果如实区分「成功/跳过」，并说明跳过原因（不再一律记成功）',
      /批量收录完成：成功 \d+ 个 \/ 跳过 [1-9]\d* 个 \/ 失败 \d+ 个/.test(bulkLogs) && /拿不到 securityId 令牌/.test(bulkLogs),
 bulkLogs.split('\n').slice(0,3).join(' | ').slice(0,220));
    await ctxC.close();
  }

  console.log('v1.4.3 SC-4：发送前脱敏 + 顺序限流（聊天 AI 判定）');
  {
    const ctxD = await browser.newContext();
    const calls = [];
    const MSGS = {
      '59683767': [{mid:1, time:1700000000000, from:{uid:662115016, name:'我'}, body:{type:1, text:'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'}},
                   {mid:2, time:1700000060000, from:{uid:59683767, name:'郑文玲'}, body:{type:1, text:'加我微信 hr_abc12345，手机13812345678'}},
                   {mid:3, time:1700000120000, from:{uid:59683767, name:'郑文玲'}, body:{type:1, text:'长文'+'A'.repeat(300)}}],
      '59683768': [{mid:4, time:1700000000000, from:{uid:662115016, name:'我'}, body:{type:1, text:'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'}},
                   {mid:5, time:1700000060000, from:{uid:59683768, name:'李四'}, body:{type:1, text:'发个简历？邮箱 hr@test.com'}}],
      '59683769': [{mid:6, time:1700000000000, from:{uid:662115016, name:'我'}, body:{type:1, text:'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'}},
                   {mid:7, time:1700000060000, from:{uid:59683769, name:'王五'}, body:{type:1, text:'在吗'}}]
    };
    await ctxD.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      const m = u.match(/historyMsg\?bossId=(\d+)/);
      if(m && MSGS[m[1]]) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8',
        body: JSON.stringify({code:0, message:'Success', zpData:{hasMore:false, messages:MSGS[m[1]]}}) });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>' });
    });
    await ctxD.route('**/chat/completions', async (route)=>{
      calls.push({ t: Date.now(), body: route.request().postData() || '' });
      await route.fulfill({ status:200, contentType:'application/json;charset=utf-8',
        body: JSON.stringify({choices:[{message:{content: JSON.stringify({bot:'真人', worth:70, reason:'回复具体'})}}]}) });
    });
    // 预置：AI 打开 + 缩短批量间隔（默认 1200ms，测试用 600ms）
    await ctxD.addInitScript(`try{ localStorage.setItem('__gmstub', JSON.stringify({ bc_settings:{
      ai:{ on:true, baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-test', maxPerDay:30, msgCount:10, msgChars:120, batchGapMs:600 } } })); }catch(e){}`);
    await ctxD.addInitScript(GM_STUB);
    await ctxD.addInitScript(CHAT_USERSCRIPT);
    const pD = await ctxD.newPage();
    await pD.goto('https://www.zhipin.com/web/geek/chat', { waitUntil:'load' });
    await pD.waitForTimeout(700);
    // 走真实捕获路径建 3 个会话（historyMsg 只读 GET）
    await pD.evaluate(async ()=>{
      for(const id of ['59683767','59683768','59683769']){
        await fetch('https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId='+id+'&maxMsgId=0&c=').then(r=>r.text());
      }
    });
    await pD.waitForTimeout(900);
    const sess = await pD.evaluate(()=>Object.keys(window.__gm.bc_chats||{}).length);
    check('3 个会话都抓到（用于批量判定）', sess===3, 'sessions=' + sess);
    await pD.evaluate(()=>{
      document.getElementById('bcFab').click();
      const btn = Array.from(document.querySelectorAll('[data-act]')).find(b=>b.dataset.act==='aijudge');
      btn.click();
    });
    await pD.waitForTimeout(6000);
    check('AI 判定 3 个会话：逐个发送（不是一次性并发）', calls.length===3, 'calls=' + calls.length);
    const gaps = calls.slice(1).map((c,i)=>c.t-calls[i].t);
    check('按间隔顺序发送（相邻请求 ≥500ms）', gaps.length===2 && gaps.every(g=>g>=500), JSON.stringify(gaps));
    const all = calls.map(c=>c.body).join('\n');
    check('发送前脱敏：手机号 / 微信号 / 邮箱原文不出现在请求里',
      !/13812345678/.test(all) && !/hr_abc12345/.test(all) && !/hr@test\.com/.test(all), all.slice(0,120));
    check('脱敏后仍有可读的掩码文本', /138\*\*\*\*78/.test(all) && /微信 hr\*\*\*/.test(all), '');
    const longLen = (all.match(/A{60,}/g)||[]).map(s=>s.length);
    check('数据面缩减：超长消息被截断到 120 字以内', longLen.length===0 || Math.max(...longLen)<=120, JSON.stringify(longLen));
    const sentText = await pD.evaluate(()=>{
      const s=(window.__gm.bc_chats||{})['59683767'];
      return s&&s.meta.ai?JSON.stringify(s.meta.ai):null;
    });
    check('判定结果落盘到该会话', !!sentText && /真人/.test(sentText), String(sentText));
    await ctxD.close();
  }

  console.log('只有收录的才监控（v0.9.0：按需收录）');
  {
    const ctx7 = await browser.newContext();
    await routeStub(ctx7);
    await ctx7.addInitScript(GM_STUB);
    await ctx7.addInitScript(USERSCRIPT);
    const p7 = await ctx7.newPage();
    p7.on('dialog', (d) => d.accept());
    await p7.goto('https://www.zhipin.com/', { waitUntil:'load' });
    await p7.waitForTimeout(600);
    await p7.evaluate(async ()=>{
      await fetch('https://www.zhipin.com/job_detail/job1.html?x=1').then(r=>r.text());
      await fetch('https://www.zhipin.com/job_detail/job2.html?x=2').then(r=>r.text());
    });
    await p7.waitForTimeout(600);
    const jobs7 = await p7.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('浏览详情页不再自动建档（没收录 = 0）', jobs7.length===0, jobs7.join(','));
    await p7.evaluate(()=>document.getElementById('bwFab').click());
    await p7.waitForTimeout(250);
    const card7 = await p7.evaluate(()=>document.getElementById('bwPage_mon').textContent);
    check('概览显示「监控岗位 / 公司」+ 实时取数状态条', card7.includes('监控岗位 / 公司') && card7.includes('实时取数'), card7.slice(0,80));

    await p7.evaluate(()=>document.querySelector('[data-act=check]').click());
    await p7.waitForTimeout(800);
    const req7a = await p7.evaluate(()=>window.__bwReq.length);
    check('没收录任何岗位时，立即检查不发请求', req7a===0, '请求 ' + req7a);

    // 粘贴收录：搜索接口（routeStub 已桩）→ 唯一高置信命中 → 抓一次详情
    await p7.evaluate(()=>{ const ta=document.getElementById('bwRecInput'); if(ta) ta.value='测试科技 前端工程师'; });
    await p7.evaluate(()=>document.querySelector('[data-act=rec]').click());
    await p7.waitForTimeout(3200);
    const jobs7b = await p7.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('粘贴「公司名 + 职位名」→ 搜索定位 → 收录建档', jobs7b.length===1, jobs7b.join(','));
    const item7 = await p7.evaluate(()=>{ const j=Object.values(window.__gm.bw_jobs||{})[0]||{}; return {name:j.jobName,company:j.company,hr:j.hr,last:j.last&&{salary:j.last.salary,status:j.last.status}}; });
    check('收录时抓了一次详情（快照里有薪资/状态）', !!(item7.last&&item7.last.salary), JSON.stringify(item7));
    await p7.evaluate(()=>document.querySelector('[data-act=check]').click());
    await p7.waitForTimeout(1200);
    const req7b = await p7.evaluate(()=>window.__bwReq.length);
    check('收录后「立即检查」才发请求（只查收录的那 1 个）', req7b===1, '请求 ' + req7b);
    // 导出 / 清空（面板按钮走一遍）
    await p7.evaluate(()=>document.querySelector('[data-act=clearwatch]').click());
    await p7.waitForTimeout(400);
    const afterClear = await p7.evaluate(()=>Object.keys(window.__gm.bw_watchlist||{}).length);
    check('「清空监控数据」后监控清单为空', afterClear===0, '剩余 ' + afterClear);
    // 假的 Vue 组件状态：没收录 → 一行都不记（实时取数仍要如实报出读到多少）
    await p7.evaluate(()=>{
      const d=document.createElement('div'); d.id='wrap'; document.body.appendChild(d);
      d.__vue__={jobList:[
        {encryptJobId:'vw1',jobName:'Vue岗位',salaryDesc:'10-12K',jobExperience:'1-3年',jobDegree:'大专',brandName:'V公司',cityName:'深圳'},
        {encryptJobId:'vw2',jobName:'Vue岗位2',salaryDesc:'11-13K',jobExperience:'1-3年',jobDegree:'大专',brandName:'V公司',cityName:'深圳'}
      ]};
    });
    await p7.waitForTimeout(6500);
    const strip7 = await p7.evaluate(()=>document.getElementById('bwPage_mon').textContent);
    check('状态条如实报出本轮读到的岗位数', strip7.includes('读到 2 个岗位'), strip7.slice(0,120));
    const vueJobs7 = await p7.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}));
    check('Vue 取数不再建档（没收录的岗位一行都不记）', vueJobs7.length===0, vueJobs7.join(','));
    await ctx7.close();
  }

  console.log('字体反爬：乱码薪资丢弃 + 收录时优先用接口明文（v0.9.0 不落整页缓存）');
  {
    const GARBLED='\uE0A1\uE0A2-\uE0A3\uE0A4K';
    const detailHtml=(id,name)=>'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<div class="job-detail-box"><div class="job-name">'+name+'</div><span class="salary">'+GARBLED+'</span>'
      + '<div class="company-info"><span class="name">某某公司</span></div>'
      + '<div class="job-sec-text">负责日常运营工作，熟悉办公软件，能接受加班</div></div></body></html>';
    const API_JSON=JSON.stringify({code:0, zpData:{jobList:[
      {encryptJobId:'k1', salaryDesc:'6-8K', jobName:'运营专员', brandName:'某某公司'},
      {encryptJobId:'k2', salaryDesc:'9-12K', jobName:'行政专员', brandName:'某某公司'}
    ]}});
    const ctx8 = await browser.newContext();
    await ctx8.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('joblist.json')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:API_JSON });
      if(u.includes('/job_detail/k1.html')) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:detailHtml('k1','运营专员') });
      if(u.includes('/job_detail/k2.html')) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:detailHtml('k2','行政专员') });
      route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>stub</h1></body></html>' });
    });
    await ctx8.addInitScript(GM_STUB);
    await ctx8.addInitScript(USERSCRIPT);
    const p8 = await ctx8.newPage();
    await p8.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p8.waitForTimeout(600);

    // 打开 k2 详情页（薪资是乱码）→ 点「收录当前页」→ 乱码薪资应被丢弃
    await p8.goto('https://www.zhipin.com/job_detail/k2.html?x=1', { waitUntil:'load' });
    await p8.waitForTimeout(1500);
    await p8.evaluate(()=>document.getElementById('bwFab').click());
    await p8.waitForTimeout(200);
    await p8.evaluate(()=>document.querySelector('[data-act=reccur]').click());
    await p8.waitForTimeout(1500);
    const k2a = await p8.evaluate(()=>{ const j=(window.__gm.bw_jobs||{}).k2; return j?{salary:j.last.salary}:null; });
    check('乱码薪资被丢弃（不写进记录）', !!k2a && k2a.salary==='', JSON.stringify(k2a));

    // 页面发出列表接口请求 → 只做内存明文索引；不落整页缓存、不新建岗位
    const before = await p8.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}).length);
    await p8.evaluate(()=>{
      const xhr=new XMLHttpRequest();
      xhr.open('GET','/wapi/zpgeek/search/joblist.json?query=x');
      xhr.send();
    });
    await p8.waitForTimeout(1200);
    const after = await p8.evaluate(()=>Object.keys(window.__gm.bw_jobs||{}).length);
    check('列表接口不再批量建档（只对比已收录的）', after===before, before + ' → ' + after);
    const apiCache = await p8.evaluate(()=>window.__gm.bw_apijobs);
    check('不再落整页接口缓存（bw_apijobs 不写盘）', apiCache===undefined, JSON.stringify(apiCache||null));

    // 用「粘贴公司名+职位名」收录 k1 → 搜索接口给出明文薪资 → 快照用明文（DOM 乱码被丢弃后回退到候选值）
    await p8.evaluate(()=>{ const ta=document.getElementById('bwRecInput'); if(ta) ta.value='某某公司 运营专员'; });
    await p8.evaluate(()=>document.querySelector('[data-act=rec]').click());
    await p8.waitForTimeout(3200);
    const k1 = await p8.evaluate(()=>{ const j=(window.__gm.bw_jobs||{}).k1; return j?{salary:j.last.salary,name:j.meta.name,hr:j.hr}:null; });
    check('收录用搜索接口的明文薪资（乱码不进记录）', !!k1 && k1.salary==='6-8K' && k1.name==='运营专员', JSON.stringify(k1));
    await ctx8.close();
  }

  console.log('遇到即判别：再次搜到同一个岗位（列表接口）也会对比');
  {
    const ctxE = await browser.newContext();
    await routeStub(ctxE);
    await ctxE.addInitScript(SEED_WATCH);
    await ctxE.addInitScript(GM_STUB);
    await ctxE.addInitScript(USERSCRIPT);
    const pE = await ctxE.newPage();
    await pE.goto('https://www.zhipin.com/', { waitUntil:'load' });
    await pE.waitForTimeout(600);
    // 1) 已收录（种子里薪资 20-30K）
    const before = await pE.evaluate(()=>({ jobs:Object.keys(window.__gm.bw_jobs||{}).length, salary:(window.__gm.bw_jobs.job1||{}).last.salary }));
    check('已收录：1 个岗位，薪资 20-30K', before.jobs===1 && before.salary==='20-30K', JSON.stringify(before));
    // 2) 再"搜到"一次（列表接口返回同一岗位，薪资已下调）
    await pE.evaluate(async ()=>{ await fetch('https://www.zhipin.com/wapi/zpgeek/search/joblist.json?query=x').then(r=>r.text()); });
    await pE.waitForTimeout(800);
    const after = await pE.evaluate(()=>({
      jobs:Object.keys(window.__gm.bw_jobs||{}).length,
      salary:(window.__gm.bw_jobs.job1||{}).last.salary,
      chg:(window.__gm.bw_changelog||[]).slice(0,2).map(c=>({level:c.level,changes:c.changes}))
    }));
    check('再次搜到 → 不新建岗位（仍是 1 个）', after.jobs===1, JSON.stringify(after.jobs));
    check('再次搜到 → 薪资更新为 15-20K', after.salary==='15-20K', String(after.salary));
    check('再次搜到 → 记录「薪资（下调）」变更', !!after.chg.length && /下调/.test(JSON.stringify(after.chg)), JSON.stringify(after.chg));
    check('列表接口不会误报 JD 变更', !/JD变更/.test(JSON.stringify(after.chg)), JSON.stringify(after.chg));
    await ctxE.close();
  }

  // v0.9.0 契约变更（测试脚本同步）：AI 判定已从 watcher 拆到 boss-insight.user.js。
  // watcher 的新职责：出现变化后把「监控项 + 变更流水」镜像到 localStorage.bw_insight_in，
  // 由 insight 读取打分/调 AI，结果写回 bw_insight_out 供 watcher 面板显示。
  // 所以这里验证：① 镜像内容完整（岗位 JD + warn 级变更）；② watcher 自己绝不发 AI 请求。
  console.log('AI 判定已拆到 boss-insight：watcher 只写本机镜像，自己不发 AI 请求');
  {
    const ctx9 = await browser.newContext();
    const aiCalls = [];
    await routeStub(ctx9);
    await ctx9.route('**/chat/completions', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status:204, headers:{ 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'POST,OPTIONS' } });
      }
      aiCalls.push(req.postData() || '');
      route.fulfill({
        status:200,
        headers:{ 'access-control-allow-origin':'*', 'content-type':'application/json' },
        body:JSON.stringify({ choices:[{ message:{ content: JSON.stringify({ verdict:'要求拔高', advice:'建议主动问一句是否加了新要求', urgency:'中' }) } }] })
      });
    });
    // 即使旧配置里还留着 ai.on=true，watcher 也不该再自己调 AI（配置项已归 insight 管）
    await ctx9.addInitScript(`try{ localStorage.setItem('__gmstub', JSON.stringify({ bw_settings:{ ai:{ on:true, baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-test', maxPerDay:5 } } })); }catch(e){}`);
    await ctx9.addInitScript(SEED_WATCH);
    await ctx9.addInitScript(GM_STUB);
    await ctx9.addInitScript(USERSCRIPT);
    const p9 = await ctx9.newPage();
    await p9.goto('https://www.zhipin.com/', { waitUntil:'load' });
    await p9.waitForTimeout(600);
    // 已收录（种子）→ 再抓一次（薪资下调 + 要求拔高）→ 产生 warn 级变更 → 应进镜像
    await p9.evaluate(async ()=>{
      await fetch('https://www.zhipin.com/job_detail/job1_v3.html?x=2').then(r=>r.text());
    });
    await p9.waitForTimeout(1800);
    const mirror9 = await p9.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('bw_insight_in')||'null'); }catch(e){ return null; } });
    const mirrorDbg = JSON.stringify(mirror9&&{jobs:Object.keys(mirror9.jobs||{}), changes:(mirror9.changes||[]).slice(0,3).map(c=>({jobId:c.jobId,level:c.level,field:c.field}))}).slice(0,220);
    check('变化后镜像 bw_insight_in：含岗位（JD 带培训费字样）+ warn 级变更流水',
      !!mirror9 && !!mirror9.jobs && !!mirror9.jobs.job1 && /培训费/.test(mirror9.jobs.job1.jd||'') &&
      Array.isArray(mirror9.changes) && mirror9.changes.some(c=>c.jobId==='job1'&&(c.level==='warn'||c.level==='alert')),
      mirrorDbg);
    check('watcher 自己不发 AI 请求（AI 判定只发生在 boss-insight 里）', aiCalls.length===0, 'calls='+aiCalls.length);
    await p9.evaluate(()=>document.getElementById('bwFab').click());
    await p9.waitForTimeout(300);
    // v0.9.5（对应 insight v0.5.7）：岗位风险打分与「AI 跟进建议」都已删除，监控面板不再渲染 🤖 行 / 风险分。
    // 这里做**反向回归**：即使有人往 bw_insight_out.ai / .risk 里塞数据，面板也不该再显示它。
    // （原断言「🤖 行应该出现」是过期用例：功能在 2026-09-23 审核时已删除，见 watcher v0.9.5 与本脚本 §AI 判定）
    await p9.evaluate(()=>{
      try{ localStorage.setItem('bw_insight_out', JSON.stringify({ai:{s1:{verdict:'要求拔高', advice:'建议主动问一句是否加了新要求', urgency:'中'}}, risk:{job1:{score:80, level:'高'}}})); }catch(e){}
      const b=document.querySelector('[data-act=montab][data-id=signals]'); if(b) b.click();
    });
    await p9.waitForTimeout(1200);
    await p9.evaluate(()=>{ const b=document.querySelector('[data-act=montab][data-id=signals]'); if(b) b.click(); });
    await p9.waitForTimeout(300);
    const mon9 = await p9.evaluate(()=>document.getElementById('bwPage_mon').innerHTML);
    // 判据说明：「要求拔高」是变更日志里的**正常字段名**（必须出现，用来证明这个页签真的渲染了），
    // 真正要证明的是「AI 那行不再出现」—— 用我注入的那句独有文案 + 🤖 作为判据。
    check('监控面板不再渲染 🤖 AI 判定行（v0.9.5 已删除；塞 bw_insight_out.ai 也不显示）',
      !mon9.includes('🤖') && !mon9.includes('建议主动问一句是否加了新要求') && mon9.includes('要求拔高'), mon9.slice(0,160));
    const set9 = await p9.evaluate(()=>{ const b=document.querySelector('[data-act=tab][data-id=set]'); if(b) b.click(); return document.getElementById('bwPage_set').textContent; });
    check('设置页如实说明体检现状（只做聊天会话体检；打分与 AI 已删除）',
      /只做聊天会话体检/.test(set9) && /都已删除/.test(set9), set9.slice(0,80));
    await ctx9.close();
  }

  console.log('变更日志批量维护（v0.7.5：首次补全不记 / 勾选批删 / 撤销 / 不弹确认框）');
  {
    const ctx10 = await browser.newContext();
    await routeStub(ctx10);
    // 预置存量：2 条「未知 → 值」补全噪音 + 1 条带备注的补全 + 1 条真变更
    await ctx10.addInitScript(`try{ localStorage.setItem('__gmstub', JSON.stringify({ bw_changelog:[
      {id:'n1', ts:5000, jobName:'噪音甲', company:'A公司', changes:['Boss活跃：未知 → false']},
      {id:'n2', ts:4000, jobName:'噪音乙', company:'B公司', changes:['学历要求：未知 → 中专/中技']},
      {id:'n3', ts:3000, jobName:'有备注', company:'C公司', changes:['学历要求：未知 → 大专'], note:'已加微信'},
      {id:'r1', ts:2000, jobName:'真变更', company:'D公司', changes:['薪资（下调）：20-30K → 15-20K'], signals:[{level:'warn', text:'薪资（下调）'}]}
    ] })); }catch(e){}`);
    await ctx10.addInitScript(GM_STUB);
    await ctx10.addInitScript(USERSCRIPT);
    const p10 = await ctx10.newPage();
    let dialogs10 = 0;
    p10.on('dialog', d=>{ dialogs10++; d.accept(); });
    await p10.goto('https://www.zhipin.com/', { waitUntil:'load' });
    await p10.waitForTimeout(800);

    const after10 = await p10.evaluate(()=>(window.__gm.bw_changelog||[]).map(c=>c.id));
    check('启动自动清理「首次补全」噪音；带备注与真变更保留', JSON.stringify(after10)===JSON.stringify(['n3','r1']), after10.join(','));

    await p10.evaluate(()=>document.getElementById('bwFab').click());
    await p10.waitForTimeout(250);
    const head10 = await p10.evaluate(()=>{ const el=document.getElementById('bwChg'); return el?el.textContent:''; });
    check('变更日志默认折叠（标题只显示条数）', /变更日志 \(2\)/.test(head10) && !/全选/.test(head10), head10.slice(0,50));

    await p10.evaluate(()=>document.querySelector('[data-act=chgtoggle]').click());
    await p10.waitForTimeout(200);
    const boxes10 = await p10.evaluate(()=>document.querySelectorAll('#bwPage_mon input[data-key="chg."]').length);
    check('展开后每条带勾选框', boxes10===2, '勾选框 ' + boxes10);

    await p10.evaluate(()=>document.querySelector('[data-act=chgselall]').click());
    await p10.waitForTimeout(200);
    const sel10 = await p10.evaluate(()=>{ const b=document.querySelector('[data-act=chgdel]'); return b?b.textContent:''; });
    check('全选后出现「删除选中(2)」', /删除选中\(2\)/.test(sel10), sel10);

    await p10.evaluate(()=>document.querySelector('[data-act=chgdel]').click());
    await p10.waitForTimeout(300);
    const left10 = await p10.evaluate(()=>(window.__gm.bw_changelog||[]).length);
    check('批量删除一次生效（2 条全删）', left10===0, '剩 ' + left10);
    const undo10 = await p10.evaluate(()=>!!document.querySelector('[data-act=chgundo]'));
    check('删除后给出「撤销」入口', undo10);

    await p10.evaluate(()=>document.querySelector('[data-act=chgundo]').click());
    await p10.waitForTimeout(300);
    const back10 = await p10.evaluate(()=>(window.__gm.bw_changelog||[]).map(c=>c.id));
    check('撤销按时间倒序恢复', JSON.stringify(back10)===JSON.stringify(['n3','r1']), back10.join(','));

    await p10.evaluate(()=>{ const b=[...document.querySelectorAll('[data-act=chgdel]')].find(x=>x.dataset.id!=='__sel__'); b.click(); });
    await p10.waitForTimeout(300);
    const left10b = await p10.evaluate(()=>(window.__gm.bw_changelog||[]).length);
    check('单条「删」一次点击即生效', left10b===1, '剩 ' + left10b);
    check('全程没有弹原生确认框（不再逐条 confirm）', dialogs10===0, '弹了 ' + dialogs10 + ' 次');
    await ctx10.close();
  }

  check('无运行时错误', errors.length === 0, errors.slice(0,5).join(' | '));
  await browser.close();
  console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
  process.exit(failures ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
