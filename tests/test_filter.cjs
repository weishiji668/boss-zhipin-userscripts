// 页面过滤脚本的端到端测试：假列表页 → 隐藏垃圾岗位 → 计数 → 显示/关闭
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-filter.user.js'), 'utf8');
const SCRIPT_VER = (SCRIPT.match(/@version\s+([\d.]+)/) || [])[1] || '';

const LIST_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>搜索结果</title></head><body>'
  + '<div class="job-list"><ul>'
  + card('c1', '电销专员', '8-12K', '深圳某某信息科技有限公司')
  + card('c2', '前端工程师', '20-30K', '某某软件有限公司')
  + card('c3', '运营助理', '5-7K', '某某贸易有限公司')
  + card('c4', '客服专员', '4-6K', '某某服务有限公司')
  + card('c5', '行政专员', '面议', '某某实业有限公司')
  + card('c6', '新媒体运营', '6-9K', '某某文化有限公司')
  + '</ul></div></body></html>';

function card(id, name, salary, company){
  return '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/' + id + '.html">'
    + '<div class="job-info"><div class="job-title"><span class="job-name">' + name + '</span><span class="salary">' + salary + '</span></div></div>'
    + '<div class="company-info"><h3 class="company-name">' + company + '</h3></div></a></div></li>';
}

let failures = 0;
function check(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

(async ()=>{
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  await context.route('**/*', route=>{
    const u = route.request().url();
    if(!u.includes('zhipin.com')) return route.continue();
    route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_HTML });
  });
  const page = await context.newPage();
  await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(1200);

  console.log('过滤生效');
  const hidden = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.innerText.replace(/\s+/g,' ').slice(0,14)));
  check('电销/前端/客服/新媒体 被隐藏（4 条）', hidden.length===4, JSON.stringify(hidden));
  const visible = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
    .filter(li=>getComputedStyle(li).display!=='none').map(li=>li.innerText.replace(/\s+/g,' ').slice(0,10)));
  check('运营助理 / 行政专员（面议）保留', visible.length===2 && visible.join('|').includes('运营助理') && visible.join('|').includes('行政专员'), JSON.stringify(visible));
  const chip = await page.evaluate(()=>document.getElementById('bwfCount').textContent);
  check('计数正确', chip.includes('4') && chip.includes('6'), chip);

  console.log('显示被过滤 / 关闭过滤');
  await page.evaluate(()=>document.getElementById('bwfReveal').click());
  await page.waitForTimeout(400);
  const revealed = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="revealed"]')).length);
  const visible2 = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
    .filter(li=>getComputedStyle(li).display!=='none').length);
  check('点「显示被过滤」后全部可见且标记原因', revealed===4 && visible2===6, 'revealed=' + revealed + ' visible=' + visible2);
  const reason = await page.evaluate(()=>document.querySelector('[data-bwf="revealed"]').getAttribute('data-bwf-reason'));
  check('标注了过滤原因', /排除词|月薪|日薪/.test(reason||''), String(reason));

  await page.evaluate(()=>document.getElementById('bwfOnOff').click());
  await page.waitForTimeout(400);
  const visible3 = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
    .filter(li=>getComputedStyle(li).display!=='none').length);
  check('关闭过滤后不再隐藏', visible3===6, 'visible=' + visible3);

  console.log('规则可编辑');
  await page.evaluate(()=>{ document.getElementById('bwfRules').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
    document.getElementById('bwfOn').click();
    const ta=document.getElementById('bwfWords');
    ta.value = ta.value + '\n行政';
    document.getElementById('bwfSave').click();
  });
  await page.waitForTimeout(500);
  const hidden2 = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"],[data-bwf="revealed"]')).map(li=>li.innerText.replace(/\s+/g,' ').slice(0,10)));
  check('新加排除词「行政」后生效', hidden2.length===5 && hidden2.join('|').includes('行政专员'), JSON.stringify(hidden2));

  const errs = await page.evaluate(()=>window.__errs||[]);
  check('无运行时错误', errs.length===0, errs.join(' | '));

  console.log('安全兜底：认不出卡片时什么都不动');
  {
    const FLAT_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<div class="job-list">'
      + '<a href="/job_detail/y1.html">电销专员 8-12K 某某公司</a> '
      + '<a href="/job_detail/y2.html">客服专员 4-6K 某某公司</a> '
      + '<a href="/job_detail/y3.html">运营助理 5-7K 某某公司</a>'
      + '</div></body></html>';
    const ctx2 = await browser.newContext();
    await ctx2.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:FLAT_HTML });
    });
    const p2 = await ctx2.newPage();
    await p2.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p2.addScriptTag({ content: SCRIPT });
    await p2.waitForTimeout(1000);
    const marked = await p2.evaluate(()=>document.querySelectorAll('[data-bwf="hidden"],[data-bwf="revealed"]').length);
    const visibleLinks = await p2.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"]'))
      .filter(a=>getComputedStyle(a).display!=='none').length);
    check('认不出卡片结构时不隐藏任何元素（不会误伤容器）', marked===0 && visibleLinks===3, 'marked=' + marked + ' links=' + visibleLinks);
    await ctx2.close();
  }

  console.log('安全阀（v1.2.1：默认关，只提示不恢复；勾上才是旧行为）');
  {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>';
    for(let i=1;i<=10;i++) html += card('z'+i, '电销专员'+i, '8-12K', '某某公司'+i);
    html += '</ul></div></body></html>';
    const ctx3 = await browser.newContext();
    await ctx3.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p3 = await ctx3.newPage();
    await p3.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p3.addScriptTag({ content: SCRIPT });
    await p3.waitForTimeout(1000);
    const hidden3 = await p3.evaluate(()=>document.querySelectorAll('[data-bwf="hidden"]').length);
    const chip3 = await p3.evaluate(()=>document.getElementById('bwfCount').textContent);
    check('默认不自动恢复：命中就照常隐藏，只在提示里说明命中率偏高',
      hidden3===10 && chip3.includes('命中率偏高'), 'hidden=' + hidden3 + ' chip=' + chip3);
    // 勾上「命中过多时自动恢复」→ 回到旧行为（整页恢复，小条显示自动恢复）
    await p3.evaluate(()=>{
      const cfg=JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}');
      cfg.safeValve=true;
      localStorage.setItem('bwf_rules_v1',JSON.stringify(cfg));
    });
    await p3.reload({ waitUntil:'load' });
    await p3.addScriptTag({ content: SCRIPT });
    await p3.waitForTimeout(1000);
    const hidden3b = await p3.evaluate(()=>document.querySelectorAll('[data-bwf="hidden"]').length);
    const chip3b = await p3.evaluate(()=>document.getElementById('bwfCount').textContent);
    check('勾上安全阀后才是旧行为（整页恢复 + 小条提示）', hidden3b===0 && chip3b.includes('自动恢复'), 'hidden=' + hidden3b + ' chip=' + chip3b);
    await ctx3.close();
  }

  console.log('字体反爬场景：薪资用接口明文判断');
  {
    const GARBLED='\uE0A1\uE0A2-\uE0A3\uE0A4K'; // 私用区字符：看着像数字，文本是乱码
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('api1', '销售专员', GARBLED, '某某公司')
      + card('api2', '行政专员', GARBLED, '某某公司')
      + card('api3', '后勤助理', GARBLED, '某某公司')
      + '</ul></div></body></html>';
    const API_JSON=JSON.stringify({code:0, zpData:{jobList:[
      {encryptJobId:'api1', salaryDesc:'3-5K', jobName:'销售专员', brandName:'某某公司'},
      {encryptJobId:'api2', salaryDesc:'6-8K', jobName:'行政专员', brandName:'某某公司'}
    ]}});
    const ctx4 = await browser.newContext();
    await ctx4.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('joblist.json')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:API_JSON });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p4 = await ctx4.newPage();
    await p4.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p4.addScriptTag({ content: SCRIPT });
    await p4.waitForTimeout(600);
    await p4.evaluate(()=>{
      const xhr=new XMLHttpRequest();
      xhr.open('GET','/wapi/zpgeek/search/joblist.json?query=x');
      xhr.send();
    });
    await p4.waitForTimeout(1200);
    const hidden4 = await p4.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.innerText.replace(/\s+/g,' ').slice(0,8)));
    const visible4 = await p4.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').length);
    check('DOM 薪资乱码时用接口明文判断（3-5K 隐藏）', hidden4.length===1 && hidden4[0].includes('销售专员'), JSON.stringify(hidden4));
    check('接口 6-8K 与「无接口数据」的岗位都保留', visible4===2, 'visible=' + visible4);
    await ctx4.close();
  }

  console.log('表格规则：粘贴导入（Tab 分隔）+ 字段级匹配 + 薪资规则');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('t1', '运营专员', '6-9K', '跨境电子商务有限公司')
      + card('t2', '跨境运营', '6-9K', '某某科技有限公司')
      + card('t3', '行政助理', '3-4K', '某某实业有限公司')
      + card('t4', '后勤专员', '8-9K', '某某实业有限公司')
      + '</ul></div></body></html>';
    const ctx5 = await browser.newContext();
    await ctx5.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p5 = await ctx5.newPage();
    await p5.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p5.addScriptTag({ content: SCRIPT });
    await p5.waitForTimeout(600);
    // 清掉默认排除词，只留表格规则，验证规则本身
    await p5.evaluate(()=>{
      const cfg=JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}');
      cfg.words=[]; cfg.rules=[]; cfg.hideSalaryOut=false;
      localStorage.setItem('bwf_rules_v1', JSON.stringify(cfg));
    });
    await p5.reload({ waitUntil:'load' });
    await p5.addScriptTag({ content: SCRIPT });
    await p5.waitForTimeout(600);
    await p5.evaluate(()=>{
      document.getElementById('bwfRules').click();
      document.getElementById('bwfPaste').value =
        '类型\t字段\t匹配\t值\t动作\t启用\t备注\n'
        + '关键词\t公司名\t包含\t跨境\t隐藏\t是\t公司名带跨境\n'
        + '薪资\t薪资\t小于\t4000\t隐藏\t是\t起步月薪低于4千\n';
      document.getElementById('bwfPasteGo').click();
    });
    await p5.waitForTimeout(800);
    const hidden5 = await p5.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.innerText.replace(/\s+/g,' ').slice(0,12)));
    const visible5 = await p5.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').map(li=>li.innerText.replace(/\s+/g,' ').slice(0,10)));
    check('粘贴导入的表格规则生效（公司名带「跨境」+ 月薪<4000 各隐藏一条）',
      hidden5.length===2 && hidden5.join('|').includes('运营专员') && hidden5.join('|').includes('行政助理'), JSON.stringify(hidden5));
    check('字段级匹配不越界（岗位名带「跨境」但公司名没有 → 保留）',
      visible5.length===2 && visible5.join('|').includes('跨境运营'), JSON.stringify(visible5));
    await ctx5.close();
  }

  console.log('表格规则：文件导入（CSV）+ 正则 + 停用');
  {
    const csv='类型,字段,匹配,值,动作,启用,备注\r\n'
      + '关键词,岗位名,正则,^客服,隐藏,是,岗位名以客服开头\r\n'
      + '关键词,卡片全文,包含,后勤,隐藏,否,默认停用的规则\r\n';
    const csvPath = path.join(os.tmpdir(), 'bwf-rules-' + Date.now() + '.csv');
    fs.writeFileSync(csvPath, '\uFEFF'+csv, 'utf8');
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('c1', '客服专员', '6-9K', '某某公司')
      + card('c2', '后勤助理', '6-9K', '某某公司')
      + card('c3', '运营专员', '6-9K', '某某公司')
      + '</ul></div></body></html>';
    const ctx6 = await browser.newContext();
    await ctx6.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p6 = await ctx6.newPage();
    await p6.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p6.addScriptTag({ content: SCRIPT });
    await p6.waitForTimeout(600);
    await p6.evaluate(()=>{
      const cfg=JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}');
      cfg.words=[]; cfg.rules=[]; cfg.hideSalaryOut=false;
      localStorage.setItem('bwf_rules_v1', JSON.stringify(cfg));
    });
    await p6.reload({ waitUntil:'load' });
    await p6.addScriptTag({ content: SCRIPT });
    await p6.waitForTimeout(600);
    await p6.evaluate(()=>document.getElementById('bwfRules').click());
    await p6.waitForTimeout(200);
    await p6.setInputFiles('#bwfFile', csvPath);
    await p6.waitForTimeout(900);
    const hidden6 = await p6.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.innerText.replace(/\s+/g,' ').slice(0,10)));
    const visible6 = await p6.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').map(li=>li.innerText.replace(/\s+/g,' ').slice(0,10)));
    check('CSV 文件导入生效（正则规则命中「客服专员」）', hidden6.length===1 && hidden6[0].includes('客服专员'), JSON.stringify(hidden6));
    check('「启用=否」的规则不生效（后勤助理保留）', visible6.length===2 && visible6.join('|').includes('后勤助理'), JSON.stringify(visible6));
    await ctx6.close();
  }

  console.log('黑名单（绝对项：公司 / 地点）');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('b1', '运营专员', '6-9K', '某某劳务派遣有限公司')
      + card('b2', '运营专员', '6-9K', '正常科技有限公司')
      + card('b3', '行政专员', '6-9K', '另一家公司')
      + '</ul></div></body></html>';
    // b2 的卡片里塞一个地点文本，用来测地点黑名单
    const html2 = html.replace('<span class="salary">6-9K</span></div></div><div class="company-info"><h3 class="company-name">正常科技有限公司</h3>',
      '<span class="salary">6-9K</span></div><div class="job-area">深圳·龙华区</div></div><div class="company-info"><h3 class="company-name">正常科技有限公司</h3>');
    const ctx7 = await browser.newContext();
    await ctx7.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html2 });
    });
    const p7 = await ctx7.newPage();
    await p7.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    // 预置：默认排除词清空 + 黑名单（公司「劳务」、地点「龙华」）
    await p7.addInitScript(()=>{});
    await p7.evaluate(()=>{
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:[], rules:[], hideSalaryOut:false, blackCompanies:['劳务'], blackAreas:['龙华'] }));
    });
    await p7.reload({ waitUntil:'load' });
    await p7.addScriptTag({ content: SCRIPT });
    await p7.waitForTimeout(1000);
    const hidden7 = await p7.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.getAttribute('data-bwf-reason')));
    const visible7 = await p7.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').length);
    check('公司黑名单命中即隐藏', hidden7.some(r=>/黑名单·公司/.test(r||'')), JSON.stringify(hidden7));
    check('地点黑名单命中即隐藏', hidden7.some(r=>/黑名单·地点/.test(r||'')), JSON.stringify(hidden7));
    check('未命中的正常岗位保留', visible7===1, 'visible=' + visible7);
    // 表格导入黑名单
    await p7.evaluate(()=>{
      document.getElementById('bwfRules').click();
      document.getElementById('bwfPaste').value = '类型\t字段\t值\n黑名单\t公司名\t某某\n';
      document.getElementById('bwfPasteGo').click();
    });
    await p7.waitForTimeout(600);
    const blackC = await p7.evaluate(()=>JSON.parse(localStorage.getItem('bwf_rules_v1')).blackCompanies);
    check('表格导入可加公司黑名单', Array.isArray(blackC) && blackC.includes('某某'), JSON.stringify(blackC));
    await ctx7.close();
  }

  console.log('行业 / 规模 / 融资（站点筛不出来的维度）');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('i1', '运营专员', '6-9K', '某甲信息有限公司')
      + card('i2', '销售专员', '6-9K', '某乙科技有限公司')
      + card('i3', '客服专员', '6-9K', '某丙服务有限公司')
      + '</ul></div></body></html>';
    const API_JSON=JSON.stringify({code:0, zpData:{jobList:[
      {encryptJobId:'i1', salaryDesc:'6-9K', jobName:'运营专员', brandName:'某甲信息有限公司', brandIndustry:'中介服务', brandScaleName:'100-499人'},
      {encryptJobId:'i2', salaryDesc:'6-9K', jobName:'销售专员', brandName:'某乙科技有限公司', brandIndustry:'互联网', brandScaleName:'20-99人'},
      {encryptJobId:'i3', salaryDesc:'6-9K', jobName:'客服专员', brandName:'某丙服务有限公司', brandIndustry:'企业服务', brandScaleName:'0-20人'}
    ]}});
    const ctx8 = await browser.newContext();
    await ctx8.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(u.includes('joblist.json')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:API_JSON });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p8 = await ctx8.newPage();
    await p8.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p8.evaluate(()=>{
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:['zzz占位不命中'], hideSalaryOut:false,
        rules:[{type:'关键词',field:'行业',op:'包含',value:'中介服务',enabled:true},
               {type:'关键词',field:'规模',op:'等于',value:'0-20人',enabled:true}] }));
    });
    await p8.reload({ waitUntil:'load' });
    await p8.addScriptTag({ content: SCRIPT });
    await p8.waitForTimeout(600);
    await p8.evaluate(()=>{ const x=new XMLHttpRequest(); x.open('GET','/wapi/zpgeek/search/joblist.json?query=x'); x.send(); });
    await p8.waitForTimeout(1200);
    const hidden8 = await p8.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]'))
      .map(li=>({ t: li.innerText.replace(/\s+/g,' ').slice(0,8), why: li.getAttribute('data-bwf-reason') })));
    check('按「行业」排除（中介服务）', hidden8.some(x=>/行业/.test(x.why||'')), JSON.stringify(hidden8));
    check('按「规模」排除（0-20人）', hidden8.some(x=>/规模/.test(x.why||'')), JSON.stringify(hidden8));
    const visible8 = await p8.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').length);
    check('正常行业的岗位保留', visible8===1, 'visible=' + visible8);
    await ctx8.close();
  }

  console.log('外包硬信号：在招职位数 → 打角标（不隐藏）');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('e1', '普工', '6-9K', '某甲人力资源有限公司')
      + card('e2', '运营专员', '6-9K', '某乙科技有限公司')
      + '</ul></div></body></html>';
    const ctx9 = await browser.newContext();
    await ctx9.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const p9 = await ctx9.newPage();
    await p9.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await p9.evaluate(()=>{
      localStorage.setItem('bw_company_jobs', JSON.stringify({ '某甲人力资源有限公司': { count: 320, ts: Date.now() } }));
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:['zzz占位'], hideSalaryOut:false,
        rules:[{type:'关键词',field:'在招职位数',op:'大于',value:'100',action:'标记',enabled:true}] }));
    });
    await p9.reload({ waitUntil:'load' });
    await p9.addScriptTag({ content: SCRIPT });
    await p9.waitForTimeout(1000);
    const marked = await p9.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="marked"]'))
      .map(li=>({ t: li.innerText.replace(/\s+/g,' ').slice(0,6), tag: li.querySelector('.bwf-tag')?li.querySelector('.bwf-tag').textContent:null })));
    const visible9 = await p9.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').length);
    check('在招职位数 >100 → 打角标而不是隐藏', marked.length===1 && /在招职位数/.test(marked[0].tag||''), JSON.stringify(marked));
    check('两条都可见（标记不影响浏览）', visible9===2, 'visible=' + visible9);
    // AI 判定字段（读监控脚本镜像）
    await p9.evaluate(()=>{
      localStorage.setItem('bw_company_intel', JSON.stringify({ '某乙科技有限公司': { type:'中介劳务', confidence:'中' } }));
      const c=JSON.parse(localStorage.getItem('bwf_rules_v1'));
      c.rules=[{type:'关键词',field:'AI判定',op:'包含',value:'中介',action:'标记',enabled:true}];
      localStorage.setItem('bwf_rules_v1', JSON.stringify(c));
    });
    await p9.reload({ waitUntil:'load' });
    await p9.addScriptTag({ content: SCRIPT });
    await p9.waitForTimeout(1000);
    const marked2 = await p9.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="marked"]'))
      .map(li=>li.querySelector('.bwf-tag')?li.querySelector('.bwf-tag').textContent:null));
    check('AI 判定字段生效（镜像自监控脚本）', marked2.length===1 && /中介/.test(marked2[0]||''), JSON.stringify(marked2));
    await ctx9.close();
  }

  console.log('工作地址（详情页的真实地址优先于卡片上的区）');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('a1', '口腔护士', '6-9K', '爱华口腔')
      + card('a2', '美容师', '8-13K', '某美容公司')
      + '</ul></div></body></html>';
    const ctxA = await browser.newContext();
    await ctxA.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const pA = await ctxA.newPage();
    await pA.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pA.evaluate(()=>{
      // 卡片上写的是南山区，但详情页真实工作地址是罗湖区
      localStorage.setItem('bw_job_addr', JSON.stringify({ a1: { addr:'广东省深圳市罗湖区清水河五路', area:'罗湖区', ts: Date.now() } }));
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:['zzz占位'], hideSalaryOut:false, rules:[],
        blackAreas:['罗湖'] }));
    });
    await pA.reload({ waitUntil:'load' });
    await pA.addScriptTag({ content: SCRIPT });
    await pA.waitForTimeout(1000);
    const hiddenA = await pA.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]'))
      .map(li=>({ t: li.innerText.replace(/\s+/g,' ').slice(0,6), why: li.getAttribute('data-bwf-reason') })));
    check('按详情页「工作地址」命中地点黑名单', hiddenA.length===1 && /工作地址/.test(hiddenA[0].why||''), JSON.stringify(hiddenA));
    const visibleA = await pA.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper'))
      .filter(li=>getComputedStyle(li).display!=='none').length);
    check('没有地址数据的岗位不受影响', visibleA===1, 'visible=' + visibleA);
    await ctxA.close();
  }

  console.log('v0.9.1：面板转义 / 版本号 / 镜像缓存');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('m1', '运营专员', '6-9K', '云图数据有限公司')
      + card('m2', '行政专员', '6-9K', '另一家公司')
      + '</ul></div></body></html>';
    const ctxM = await browser.newContext();
    await ctxM.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const pM = await ctxM.newPage();
    await pM.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pM.evaluate(()=>{
      window.__pwned = 0;
      // 黑名单里塞一段 HTML：面板渲染必须转义（否则会注入到页面里）
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:['zzz占位'],
        rules:[{type:'关键词',field:'在招职位数',op:'大于',value:'100',action:'标记',enabled:true,note:'外包嫌疑'}],
        blackCompanies:['<img id="pwn" src=x onerror="window.__pwned=1">'], blackAreas:[], applied:[] }));
      localStorage.setItem('bw_company_jobs', JSON.stringify({ '云图数据有限公司': { count: 150, ts: Date.now() } }));
    });
    await pM.reload({ waitUntil:'load' });
    await pM.addScriptTag({ content: SCRIPT });
    await pM.waitForTimeout(900);
    await pM.evaluate(()=>document.getElementById('bwfRules').click());
    await pM.waitForTimeout(200);
    const panelText = await pM.evaluate(()=>document.getElementById('bwfPanel').textContent||'');
    check('面板显示版本号 v'+SCRIPT_VER, panelText.includes('v'+SCRIPT_VER), panelText.slice(0,60));
    const pwn = await pM.evaluate(()=>({
      injected: !!document.querySelector('#pwn'),
      flag: window.__pwned,
      textarea: (document.getElementById('bwfBlackC')||{}).value||''
    }));
    check('面板转义：黑名单里的 HTML 不落地（只显示为文本）',
      !pwn.injected && !pwn.flag && /<img/.test(pwn.textarea), JSON.stringify(pwn));
    // 镜像缓存（F1）：缓存窗口内复用；数据变化后（等缓存过期 + 下一轮过滤）能读到新值
    const marked1 = await pM.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="marked"]'))
      .map(li=>li.getAttribute('data-bwf-reason')));
    check('镜像数据（在招职位数）参与标记：命中「在招 150 > 100」', marked1.some(r=>/在招职位数/.test(r||'')), JSON.stringify(marked1));
    await pM.evaluate(()=>{
      localStorage.setItem('bw_company_jobs', JSON.stringify({ '云图数据有限公司': { count: 8, ts: Date.now() } }));
    });
    await pM.waitForTimeout(2600);   // 缓存 800ms + 2 秒一轮的自动过滤
    const marked2 = await pM.evaluate(()=>document.querySelectorAll('[data-bwf="marked"]').length);
    check('缓存过期后读到新值：在招 8 → 不再标记', marked2===0, 'marked=' + marked2);
    await ctxM.close();
  }

  console.log('v1.1.0 三层排除词：绝对（卡片+详情）/ 卡片 / 详情（要先取到详情）');
  {
    const JD_TEXT='岗位职责：负责跨境电商店铺的日常运营与数据分析，接受夜班轮班，薪资结构为无责底薪加提成，入职即缴纳五险一金。任职要求：大专及以上学历，做事细心有耐心，有电商运营经验者优先。';
    const DETAIL_DOM='<!DOCTYPE html><html><head><meta charset="utf-8"><title>岗位详情</title></head><body>'
      + '<div class="job-detail-box"><h1 class="job-name">跨境电商运营</h1>'
      + '<div class="job-sec"><h3>职位描述</h3><div class="job-sec-text">'+JD_TEXT+'</div></div>'
      + '</div></body></html>';
    const LIST3='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('t1','跨境电商运营','6-9K','深圳某某电商有限公司')
      + card('t2','客服专员','5-7K','某某服务有限公司')
      + card('t3','电子厂普工','5-6K','某某制造有限公司')
      + '</ul></div></body></html>';
    const ctxF = await browser.newContext();
    await ctxF.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(/job_detail\//.test(u)) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:DETAIL_DOM });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST3 });
    });
    const pF = await ctxF.newPage();
    const errsF = [];
    pF.on('pageerror', e=>errsF.push(String((e&&e.message)||e)));
    await pF.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    // 老配置迁移：老版本只有 words（= 绝对排除词），两层相对排除词是新加的
    await pF.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:['电子厂'], wordsCard:['客服'], wordsJd:['夜班'] })); });
    await pF.addScriptTag({ content: SCRIPT });
    await pF.waitForTimeout(1200);
    const pick3 = ()=>pF.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      t:li.innerText.replace(/\s+/g,' ').slice(0,8), why:li.getAttribute('data-bwf-reason')||'', vis:getComputedStyle(li).display!=='none' })));
    const s1 = await pick3();
    const byName = (arr,n)=>{ const x=arr.find(o=>o.t.indexOf(n)>=0); return x||{t:n,why:'(缺)',vis:null}; };
    check('绝对排除词命中卡片 → 隐藏（电子厂普工）', byName(s1,'电子厂普工').vis===false && /绝对排除词：电子厂/.test(byName(s1,'电子厂普工').why), JSON.stringify(s1));
    check('卡片排除词命中卡片字段 → 隐藏（客服专员）', byName(s1,'客服专员').vis===false && /卡片排除词：客服/.test(byName(s1,'客服专员').why), JSON.stringify(s1));
    check('详情排除词没有详情数据时不判 → 岗位照常显示（不误杀）', byName(s1,'跨境电商运营').vis===true, JSON.stringify(s1));
    // 点进详情页 → 被动缓存正文 + 小条提示命中
    await pF.goto('https://www.zhipin.com/job_detail/t1.html', { waitUntil:'load' });
    await pF.addScriptTag({ content: SCRIPT });   // 篡改猴在详情页一样会注入，这里如实模拟
    await pF.waitForTimeout(2600);
    const cap = await pF.evaluate(()=>{
      const o = JSON.parse(localStorage.getItem('bwf_jd_cache')||'{}');
      return { n:Object.keys(o).length, jd:(o.t1&&o.t1.jd)||'', chip:(document.getElementById('bwfCount')||{}).textContent||'' };
    });
    check('详情页被动缓存正文（按 jobId 存本机，不点按钮、不发请求）', cap.n>=1 && /夜班/.test(cap.jd), JSON.stringify(cap).slice(0,140));
    check('详情页小条提示：此岗位命中 详情排除词：夜班', /详情排除词：夜班/.test(cap.chip), cap.chip);
    // 回列表页：详情排除词生效
    await pF.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pF.addScriptTag({ content: SCRIPT });
    await pF.waitForTimeout(1500);
    const s2 = await pick3();
    check('回到列表页：详情正文命中「夜班」→ 该岗位按详情排除词隐藏', byName(s2,'跨境电商运营').vis===false && /详情排除词：夜班/.test(byName(s2,'跨境电商运营').why), JSON.stringify(s2));
    check('三层排除词无运行时错误', errsF.length===0, errsF.join(' | '));
    await ctxF.close();
  }

  console.log('v1.1.0 补取详情（默认关；勾选后点按钮才发请求）+ 面板重绘保护');
  {
    const DETAIL_JSON='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<script>window.__D={"code":0,"zpData":{"jobInfo":{"jobName":"跨境电商运营","jobDescription":"岗位职责：负责跨境电商店铺日常运营与数据分析，接受夜班轮班，薪资结构为无责底薪加提成。"}}};</script>'
      + '</body></html>';
    const LIST3='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('t1','跨境电商运营','6-9K','深圳某某电商有限公司')
      + card('t2','客服专员','5-7K','某某服务有限公司')
      + '</ul></div></body></html>';
    let jdHits=0;
    const ctxJ = await browser.newContext();
    await ctxJ.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(/job_detail\//.test(u)){ jdHits++; return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:DETAIL_JSON }); }
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST3 });
    });
    const pJ = await ctxJ.newPage();
    const errsJ = [];
    pJ.on('pageerror', e=>errsJ.push(String((e&&e.message)||e)));
    await pJ.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pJ.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:['夜班'], jdFetch:false })); });
    await pJ.addScriptTag({ content: SCRIPT });
    await pJ.waitForTimeout(900);
    const idle = await pJ.evaluate(()=>document.querySelectorAll('[data-bwf="hidden"]').length);
    check('补取默认关闭：不点按钮就一个请求都不发', jdHits===0, 'hits='+jdHits);
    check('手动清空绝对排除词保持空（不被 46 条默认词偷偷加回来）', idle===0, 'hidden='+idle);
    await pJ.evaluate(()=>{ document.getElementById('bwfRules').click(); document.querySelector('#bwfPanel .bwf-tab[data-tab="jd"]').click(); });
    await pJ.waitForTimeout(200);
    const tabsInfo = await pJ.evaluate(()=>{
      const tabs=Array.prototype.slice.call(document.querySelectorAll('#bwfPanel .bwf-tab')).map(b=>b.textContent.trim());
      const panes=Array.prototype.slice.call(document.querySelectorAll('#bwfPanel .bwf-pane')).map(el=>({ k:el.getAttribute('data-pane'), hidden:el.hidden }));
      return { tabs:tabs, panes:panes };
    });
    check('面板把排除词分成三个页签（绝对 / 卡片 / 详情）', tabsInfo.tabs.length===3 && /绝对/.test(tabsInfo.tabs[0]) && /卡片/.test(tabsInfo.tabs[1]) && /详情/.test(tabsInfo.tabs[2]), JSON.stringify(tabsInfo.tabs));
    check('同一时间只显示一个输入框（当前是「详情」）', tabsInfo.panes.filter(x=>!x.hidden).length===1 && tabsInfo.panes[2].hidden===false, JSON.stringify(tabsInfo.panes));
    const stat0 = await pJ.evaluate(()=>document.getElementById('bwfJdStat').textContent||'');
    check('详情页签显示「已取 / 本页待取 / 今日补取」', /已取 0 条/.test(stat0) && /本页待取 2/.test(stat0) && /今日补取 0\/40/.test(stat0), stat0);
    await pJ.evaluate(()=>{ document.getElementById('bwfJdFetch').click(); document.getElementById('bwfJdGo').click(); });
    let doneJ={stat:'',hidden:[]};
    for(let i=0;i<30;i++){
      await pJ.waitForTimeout(500);
      doneJ=await pJ.evaluate(()=>({ stat:(document.getElementById('bwfJdStat')||{}).textContent||'', hidden:Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.getAttribute('data-bwf-reason')||'') }));
      if(/补取完成/.test(doneJ.stat)) break;
    }
    check('补取详情：拉到正文并按 jobId 缓存', /补取完成：成功 [12]/.test(doneJ.stat), doneJ.stat);
    check('补取后按「详情排除词」隐藏命中岗位', doneJ.hidden.some(r=>/详情排除词：夜班/.test(r)), JSON.stringify(doneJ.hidden));
    check('补取次数记在「今日补取」里（不是白嫖）', /今日补取 [12]\/40/.test(doneJ.stat), doneJ.stat);
    // 面板重绘保护：定时/保存触发的重绘不该把展开状态和没保存的输入冲掉
    await pJ.evaluate(()=>{
      const folds=document.querySelectorAll('#bwfPanel details.bwf-fold');
      folds[0].open=false;
      document.getElementById('bwfMinM').value='12345';
    });
    await pJ.evaluate(()=>{ document.getElementById('bwfBlackSave').click(); });
    await pJ.waitForTimeout(400);
    const kept = await pJ.evaluate(()=>({
      open:document.querySelectorAll('#bwfPanel details.bwf-fold')[0].open,
      val:(document.getElementById('bwfMinM')||{}).value,
      tab:(document.querySelector('#bwfPanel .bwf-tab.on')||{}).textContent||''
    }));
    check('面板重绘后：折叠状态保留 / 未保存的输入还在 / 页签不乱跳', kept.open===false && kept.val==='12345' && /详情/.test(kept.tab), JSON.stringify(kept));
    check('补取与面板无运行时错误', errsJ.length===0, errsJ.join(' | '));
    await ctxJ.close();
  }

  console.log('v1.3.1 详情正文可信度：卡片摘要（SEO description）不得被当成正文（用户反馈「详细的过滤没生效」）');
  {
    // 站点详情页的内联 JSON 里，卡片摘要 description 与正文 jobDescription 同时存在，且摘要排在前面
    const SEO = '六一创新海外产品助理（双休/一档/带薪撸宠）招聘，薪资：5-6K，地点：深圳，要求：经验不限，学历：大专，福利：五险一金、绩效奖金，HR刚刚在线，随时随地直接开聊。';
    const REAL = '任职要求：1.大专及以上，2年以上Google Ads投放经验；4.英语读写能力可胜任关键词拓展与素材审核（CET-4以上即可）。';
    const DETAIL_BOTH = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<script>window.__D={"zpData":{"seo":{"description":"' + SEO + '"},"jobInfo":{"jobName":"海外产品助理","jobDescription":"' + REAL + '"}}};</script>'
      + '</body></html>';
    const DETAIL_SEO_ONLY = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<script>window.__D={"zpData":{"seo":{"description":"' + SEO + '"}}};</script>'
      + '</body></html>';
    const LIST_S = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('s1', '海外产品助理', '5-6K', '六一共创')
      + card('s2', '谷歌SEM投放', '11-22K', 'Supermade')
      + '</ul></div></body></html>';
    const ctxS = await browser.newContext();
    await ctxS.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(/job_detail\/s1/.test(u)) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:DETAIL_BOTH });
      if(/job_detail\/s2/.test(u)) return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:DETAIL_SEO_ONLY });
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_S });
    });
    const pS = await ctxS.newPage();
    const errsS = [];
    pS.on('pageerror', e=>errsS.push(String((e&&e.message)||e)));
    await pS.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pS.evaluate((seo)=>{
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:['英语', '2年以上'], jdFetch:false }));
      // 模拟「已经被旧版本写成摘要」的脏缓存：s1 的正文位置存着卡片摘要
      localStorage.setItem('bwf_jd_cache', JSON.stringify({ s1:{ ts:Date.now(), jd:seo } }));
    }, SEO);
    await pS.addScriptTag({ content: SCRIPT });
    await pS.waitForTimeout(900);
    await pS.evaluate(()=>{
      document.getElementById('bwfRules').click();
      document.querySelector('#bwfPanel .bwf-tab[data-tab="jd"]').click();
      document.getElementById('bwfJdFetch').click();
      document.getElementById('bwfJdGo').click();
    });
    let stS = { stat:'', hidden:[], cache:{} };
    for(let i=0;i<40;i++){
      await pS.waitForTimeout(500);
      stS = await pS.evaluate(()=>({
        stat:(document.getElementById('bwfJdStat')||{}).textContent||'',
        hidden:Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]')).map(li=>li.getAttribute('data-bwf-reason')||''),
        cache:JSON.parse(localStorage.getItem('bwf_jd_cache')||'{}')
      }));
      if(/补取完成/.test(stS.stat)) break;
    }
    check('摘要不算正文：脏缓存（s1 存的是摘要）不参与判定，会被重新补取', !!stS.cache.s1 && /任职要求/.test(stS.cache.s1.jd||''), JSON.stringify(stS.cache.s1||null).slice(0,180));
    check('补取只认 jobDescription：摘要排在前也不会串味（写进去的是正文）', !/刚刚在线/.test((stS.cache.s1||{}).jd||'') && !Object.keys(stS.cache).some(k=>/刚刚在线/.test((stS.cache[k]||{}).jd||'')), JSON.stringify(stS.cache).slice(0,200));
    check('只有 description（纯摘要）时不入库：s2 不写缓存', !stS.cache.s2, JSON.stringify(stS.cache.s2||null));
    check('s1 按详情排除词隐藏（英语 / 2年以上）', stS.hidden.some(r=>/详情排除词：(英语|2年以上)/.test(r)), JSON.stringify(stS.hidden));
    check('没有被误判的卡：只隐藏 s1 一张（摘要没被当正文乱杀）', stS.hidden.length===1, JSON.stringify(stS.hidden));
    check('详情正文可信度闸门无运行时错误', errsS.length===0, errsS.join(' | '));
    await ctxS.close();
  }

  console.log('v1.3.3 页面内详情（零请求）：点卡片缓存右侧面板 / 顺手抄详情接口');
  {
    const JD_P1 = '任职要求：1.大专及以上，2年以上Google Ads投放经验；4.英语读写能力可胜任关键词拓展与素材审核（CET-4以上即可）。';
    const JD_P3 = '1、洞察亚马逊卖家生态与FBA服务需求，分析竞争对手动态；2、输出产品定义与规格方案；3、跟进上线后的数据表现并迭代。';
    const LIST_P = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<div class="job-list"><ul>'
      + card('p1','海外产品助理','5-6K','六一共创')
      + card('p2','谷歌SEM投放','11-22K','Supermade')
      + card('p3','亚马逊开发专员','5-8K','宏鼎汇')
      + '</ul></div>'
      + '<div class="job-detail-box" id="pane"><div class="job-sec"><h3>职位描述</h3><div class="job-sec-text" id="paneJd">（还没有选中岗位）</div></div>'
      + '<div class="job-address"><h3 class="addr-title">工作地址</h3>'
      + '<div class="addr-value"><i class="pin"></i><span id="paneAddr">—</span></div>'
      + '<div class="addr-map">在茂产业园 宝吉路 6栋 金裕城产业园 美宜佳 依云山庄 和悦旅馆 亿源通雪象工业园 河昌工业园</div></div></div>'
      + '<script>'
      + 'var JDS={p1:' + JSON.stringify(JD_P1) + ',p3:' + JSON.stringify(JD_P3) + '};'
      + 'var ADDR={p1:"深圳龙岗区 布吉街道某某中心B栋",p3:"深圳龙岗区 荣丰中心A栋"};'
      + 'document.querySelectorAll("a[href*=job_detail]").forEach(function(a){'
      + '  a.addEventListener("click",function(ev){ ev.preventDefault(); var id=(a.getAttribute("href").split("/").pop()||"").split(".")[0];'
      + '    document.getElementById("paneJd").textContent=JDS[id]||"";'
      + '    document.getElementById("paneAddr").textContent=ADDR[id]||""; });'
      + '});'
      + '</script></body></html>';
    let detailHits = 0;
    const ctxP = await browser.newContext();
    await ctxP.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(/job_detail\//.test(u)){ detailHits++; return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:'<html><body>（不该被请求）</body></html>' }); }
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_P });
    });
    const pP = await ctxP.newPage();
    const errsP = [];
    pP.on('pageerror', e=>errsP.push(String((e&&e.message)||e)));
    await pP.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pP.evaluate(()=>{
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:['英语','2年以上'], jdFetch:false, blackAreas:['荣丰中心'] }));
    });
    await pP.addScriptTag({ content: SCRIPT });
    await pP.waitForTimeout(900);
    const pickP = ()=>pP.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      t:li.innerText.replace(/\s+/g,' ').slice(0,10), why:li.getAttribute('data-bwf-reason')||'', vis:getComputedStyle(li).display!=='none' })));
    const p0 = await pickP();
    const byP = (arr,n)=>{ const x=arr.find(o=>o.t.indexOf(n)>=0); return x||{t:n,why:'(缺)',vis:null}; };
    check('点之前：没有详情数据 → 岗位照常显示（不误杀）', p0.every(o=>o.vis===true), JSON.stringify(p0));
    // 模拟用户在列表页点开卡片（站点自己会把详情渲染到右侧面板里）
    await pP.evaluate(()=>{ document.querySelector('a[href*="p1"]').dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,cancelable:true})); });
    await pP.waitForTimeout(1800);
    const p1 = await pickP();
    check('点开卡片 → 面板正文被缓存并命中「详情排除词：英语」', byP(p1,'海外产品助理').vis===false && /详情排除词：(英语|2年以上)/.test(byP(p1,'海外产品助理').why), JSON.stringify(p1));
    // 再点一张：面板换成另一个岗位（地址命中地点黑名单）
    await pP.evaluate(()=>{ document.querySelector('a[href*="p3"]').dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,cancelable:true})); });
    await pP.waitForTimeout(1800);
    const p2 = await pickP();
    check('面板里的「工作地址」也入缓存 → 地点黑名单按「工作地址」命中', byP(p2,'亚马逊开发专员').vis===false && /黑名单·工作地址：荣丰中心/.test(byP(p2,'亚马逊开发专员').why), JSON.stringify(p2));
    const addrP = await pP.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('bwf_jd_cache')||'{}'); return (c.p3&&c.p3.addr)||''; });
    check('地址只取「工作地址」后面那一行（地图路名/园区名不进地址）', addrP==='深圳龙岗区 荣丰中心A栋', JSON.stringify(addrP));
    const stP = await pP.evaluate(()=>{ document.getElementById('bwfRules').click(); document.querySelector('#bwfPanel .bwf-tab[data-tab="jd"]').click(); return (document.getElementById('bwfJdStat')||{}).textContent||''; });
    check('详情页签标出「页面内零请求 N 条」', /页面内零请求 2 条/.test(stP), stP);
    check('全程没有整页补取请求（零请求路径）', detailHits===0, 'hits='+detailHits);
    check('页面内详情无运行时错误', errsP.length===0, errsP.join(' | '));
    await ctxP.close();
  }
  {
    // 站点自己在页面上发起的详情接口（点卡片时的真实行为）——脚本顺手抄一份
    const API_JSON = { code:0, message:'Success', zpData:{ jobDetail:{ encryptJobId:'q1', jobName:'海外产品助理', locationName:'深圳 龙岗区 荣丰中心A栋', jobDescription:'任职要求：1、有独立开发过产品项目的经验，工业设计专业优先；4、英语读写能力可胜任关键词拓展与素材审核（CET-4以上即可）；5、责任心强，能承受一定工作压力。' } } };
    const LIST_Q = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('q1','海外产品助理','5-6K','六一共创')
      + card('q2','谷歌SEM投放','11-22K','Supermade')
      + '</ul></div></body></html>';
    let htmlDetailHits = 0, apiHits = 0;
    const ctxQ = await browser.newContext();
    await ctxQ.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      if(/zpgeek\/job\/detail\.json|job\/detail\.json/.test(u)){ apiHits++; return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body:JSON.stringify(API_JSON) }); }
      if(/job_detail\//.test(u)){ htmlDetailHits++; return route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:'<html><body>（不该被请求）</body></html>' }); }
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_Q });
    });
    const pQ = await ctxQ.newPage();
    const errsQ = [];
    pQ.on('pageerror', e=>errsQ.push(String((e&&e.message)||e)));
    await pQ.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pQ.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:['英语'], jdFetch:false, blackAreas:[] })); });
    await pQ.addScriptTag({ content: SCRIPT });
    await pQ.waitForTimeout(900);
    // 模拟「站点自己取详情」（真实站点点卡片时会发这个接口）
    await pQ.evaluate(async ()=>{ await fetch('/wapi/zpgeek/job/detail.json?securityId=SEC-Q1&lid=LID-Q1', { credentials:'same-origin' }); });
    let q1 = { vis:true, why:'' };
    const pickQ = ()=>pQ.evaluate(()=>{ const li=document.querySelector('a[href*="q1"]').closest('li'); return { vis:getComputedStyle(li).display!=='none', why:li.getAttribute('data-bwf-reason')||'' }; });
    for(let i=0;i<12;i++){
      await pQ.waitForTimeout(500);
      q1 = await pickQ();
      if(!q1.vis) break;
    }
    check('页面自己发的详情接口被顺手抄下 → 按详情排除词隐藏', q1.vis===false && /详情排除词：英语/.test(q1.why), JSON.stringify(q1));
    check('接口抄数据不发额外请求（没去打整页详情）', apiHits===1 && htmlDetailHits===0, 'api='+apiHits+' html='+htmlDetailHits);
    check('详情接口钩子无运行时错误', errsQ.length===0, errsQ.join(' | '));
    await ctxQ.close();
  }
  console.log('v1.2.0 右键隐藏 / 右键把词加进排除词');
  console.log('v1.3.4 地点黑名单：详细地址（不带分隔符的写法）也要命中');
  {
    const LIST_L = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/w1.html">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">跨境电商运营</span><span class="salary">6-9K</span></div></div>'
      + '<div class="company-info"><h3 class="company-name">某某电商有限公司</h3><p class="job-area">深圳·龙岗区·坂田</p></div></a></div></li>'
      + card('w2','海外产品助理','5-6K','某某科技')
      + '</ul></div></body></html>';
    const JD_W = '岗位职责：负责店铺日常运营与数据分析，接受轮班；任职要求：大专及以上学历，做事细心有耐心，有相关经验者优先。';
    const ctxL = await browser.newContext();
    await ctxL.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_L });
    });
    const pL = await ctxL.newPage();
    const errsL = [];
    pL.on('pageerror', e=>errsL.push(String((e&&e.message)||e)));
    await pL.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pL.evaluate((jd)=>{
      // 黑名单照用户习惯写：不带空格/圆点的详细地址
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:[], blackAreas:['深圳龙岗区坂田','深圳龙岗区银信中心B座'] }));
      // 第二条只有「工作地址」有线索（卡片上写的区不一样），地址来自页面内详情缓存
      localStorage.setItem('bwf_jd_cache', JSON.stringify({ w2:{ ts:Date.now(), jd:jd, addr:'深圳龙岗区 银信中心B座' } }));
    }, JD_W);
    await pL.addScriptTag({ content: SCRIPT });
    await pL.waitForTimeout(1300);
    const pickL = ()=>pL.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      t:li.innerText.replace(/\s+/g,' ').slice(0,8), why:li.getAttribute('data-bwf-reason')||'', vis:getComputedStyle(li).display!=='none' })));
    const rL = await pickL();
    const byL = (arr,n)=>{ const x=arr.find(o=>o.t.indexOf(n)>=0); return x||{t:n,why:'(缺)',vis:null}; };
    check('卡片地点是「深圳·龙岗区·坂田」，黑名单写「深圳龙岗区坂田」→ 命中（分隔符不影响）', byL(rL,'跨境电商运营').vis===false && /黑名单·地点\(卡片\)：深圳龙岗区坂田/.test(byL(rL,'跨境电商运营').why), JSON.stringify(rL));
    check('工作地址是「深圳龙岗区 银信中心B座」，黑名单写「深圳龙岗区银信中心B座」→ 命中工作地址那一路', byL(rL,'海外产品助理').vis===false && /黑名单·工作地址：深圳龙岗区银信中心B座/.test(byL(rL,'海外产品助理').why), JSON.stringify(rL));
    check('地点黑名单宽松匹配无运行时错误', errsL.length===0, errsL.join(' | '));
    await ctxL.close();
  }
  {
    const ctxR = await browser.newContext();
    await ctxR.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:LIST_HTML });
    });
    const pR = await ctxR.newPage();
    const errsR = [];
    pR.on('pageerror', e=>errsR.push(String((e&&e.message)||e)));
    await pR.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pR.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, hideSalaryOut:false, words:[], wordsCard:[], wordsJd:[], jdFetch:false })); });
    await pR.addScriptTag({ content: SCRIPT });
    await pR.waitForTimeout(900);
    const rightClickCard = (kw)=>pR.evaluate((k)=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>String(x.innerText||'').includes(k));
      if(!li) return 'no-card';
      const r=li.getBoundingClientRect();
      li.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:Math.round(r.left+30),clientY:Math.round(r.top+20)}));
      return 'ok';
    }, kw);
    const clickMenu = (kw)=>pR.evaluate((k)=>{
      const b=Array.prototype.slice.call(document.querySelectorAll('#bwfMenu .bwf-mi')).find(x=>String(x.textContent||'').includes(k));
      if(!b) return 'no-item';
      b.click(); return 'ok';
    }, kw);
    const cardDisplay = (kw)=>pR.evaluate((k)=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>String(x.innerText||'').includes(k));
      return li?getComputedStyle(li).display:'missing';
    }, kw);
    const cfgNow = ()=>pR.evaluate(()=>JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}'));

    await rightClickCard('运营助理');
    const menu1 = await pR.evaluate(()=>{ const m=document.getElementById('bwfMenu'); return m?{text:m.innerText,pos:getComputedStyle(m).position}:null; });
    check('右键卡片弹出菜单（含「隐藏这条岗位」）', !!menu1 && /隐藏这条岗位/.test(menu1.text) && menu1.pos==='fixed', JSON.stringify(menu1).slice(0,160));
    await clickMenu('隐藏这条岗位');
    await pR.waitForTimeout(400);
    const afterHide = await cfgNow();
    check('右键隐藏：卡片立刻消失 + 按职位ID记进配置', (await cardDisplay('运营助理'))==='none' && !!(afterHide.hideIds&&afterHide.hideIds.c3), JSON.stringify(afterHide.hideIds||{}));
    const chipR = await pR.evaluate(()=>document.getElementById('bwfCount').textContent);
    check('右键隐藏计入小条「已过滤」（1 条）', /1/.test(chipR), chipR);
    const toastShown = await pR.evaluate(()=>{ const t=document.querySelector('.bwf-toast'); return t?{disp:getComputedStyle(t).display,text:t.textContent}:null; });
    check('隐藏后有轻提示（告诉你右键可恢复）', !!toastShown && toastShown.disp!=='none' && /已隐藏/.test(toastShown.text), JSON.stringify(toastShown));

    const pR2 = await ctxR.newPage();
    pR2.on('pageerror', e=>errsR.push(String((e&&e.message)||e)));
    await pR2.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pR2.addScriptTag({ content: SCRIPT });
    await pR2.waitForTimeout(900);
    const pers = await pR2.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>String(x.innerText||'').includes('运营助理'));
      return li?getComputedStyle(li).display:'missing';
    });
    check('刷新 / 重开页面后仍然隐藏（持久化）', pers==='none', pers);
    await pR2.close();

    await rightClickCard('行政专员');
    const undoItem = await pR.evaluate(()=>{ const m=document.getElementById('bwfMenu'); return m?m.innerText:''; });
    check('菜单里有「撤销刚才的隐藏」', /撤销刚才的隐藏/.test(undoItem), JSON.stringify(undoItem).slice(0,160));
    await clickMenu('撤销刚才的隐藏');
    await pR.waitForTimeout(400);
    check('撤销后卡片恢复显示 + 名单清空', (await cardDisplay('运营助理'))!=='none' && !Object.keys((await cfgNow()).hideIds||{}).length, JSON.stringify((await cfgNow()).hideIds||{}));

    const selWord = await pR.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>String(x.innerText||'').includes('新媒体运营'));
      const el=li&&li.querySelector('.company-name');
      if(!el) return 'no-el';
      const r=document.createRange(); r.selectNodeContents(el);
      const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      const rect=el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:Math.round(rect.left+10),clientY:Math.round(rect.top+6)}));
      return String(s.toString()).trim();
    });
    const menuSel = await pR.evaluate(()=>{ const m=document.getElementById('bwfMenu'); return m?m.innerText:''; });
    check('选中卡片里的词再右键：菜单给出「加进排除词」选项', !!selWord && /加进…/.test(menuSel) && /卡片排除词/.test(menuSel), JSON.stringify({sel:selWord,menu:menuSel}).slice(0,200));
    await clickMenu('卡片排除词');
    await pR.waitForTimeout(400);
    const cfgWord = await cfgNow();
    check('选中的词进了「卡片排除词」并立即生效', (cfgWord.wordsCard||[]).indexOf(selWord)>=0 && (await cardDisplay('新媒体运营'))==='none', JSON.stringify(cfgWord.wordsCard||[]));

    await rightClickCard('客服专员');
    const menuCo = await pR.evaluate(()=>{ const m=document.getElementById('bwfMenu'); return m?m.innerText:''; });
    check('菜单里有「公司加进黑名单」', /加进黑名单/.test(menuCo), JSON.stringify(menuCo).slice(0,160));
    await clickMenu('加进黑名单');
    await pR.waitForTimeout(400);
    const cfgCo = await cfgNow();
    const coHidden = await pR.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>String(x.innerText||'').includes('客服专员'));
      return li?{disp:getComputedStyle(li).display,reason:li.getAttribute('data-bwf-reason')||''}:'missing';
    });
    check('公司进黑名单：同公司岗位隐藏且原因写明', (cfgCo.blackCompanies||[]).length===1 && coHidden.disp==='none' && /黑名单/.test(coHidden.reason), JSON.stringify(coHidden));

    const bodyCtx = await pR.evaluate(()=>{
      const ev=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:5,clientY:5});
      document.body.dispatchEvent(ev);
      return {menu:!!document.getElementById('bwfMenu'), prevented:ev.defaultPrevented};
    });
    check('非卡片区域右键：不弹自定义菜单、不拦截浏览器默认菜单', bodyCtx.menu===false && bodyCtx.prevented===false, JSON.stringify(bodyCtx));

    await rightClickCard('行政专员');
    await clickMenu('隐藏这条岗位');
    await pR.waitForTimeout(400);
    await pR.evaluate(()=>{ document.getElementById('bwfRules').click(); });
    await pR.waitForTimeout(300);
    const foldInfo = await pR.evaluate(()=>{
      const folds=Array.prototype.slice.call(document.querySelectorAll('#bwfPanel details.bwf-fold'));
      const f=folds.find(x=>/右键隐藏/.test(x.textContent));
      return f?{sum:f.querySelector('summary').textContent, list:(f.querySelector('#bwfHideList')||{}).textContent||''}:null;
    });
    check('面板里有「右键隐藏」折叠区（显示条数与名单）', !!foldInfo && /1 条/.test(foldInfo.sum) && /行政专员/.test(foldInfo.list), JSON.stringify(foldInfo).slice(0,200));
    await pR.evaluate(()=>{ const b=document.querySelector('#bwfHideList [data-hide]'); if(b) b.click(); });
    await pR.waitForTimeout(400);
    check('面板里点「恢复」：岗位回到列表', (await cardDisplay('行政专员'))!=='none', await cardDisplay('行政专员'));
    check('右键功能无运行时错误', errsR.length===0, errsR.join(' | '));
    await ctxR.close();
  }

  console.log('v1.2.2 公司黑名单：多来源 + 卡片文字兜底 + 右键加黑名单');
  {
    // b1：公司名在一个「未知 class」的容器里（DOM 选择器认不出）→ 只能靠卡片文字兜底
    // b2：公司名只存在于页面 Vue 状态里（DOM 里完全没有公司名）→ 走 Vue 来源
    // b3：正常卡片，不该被误伤
    const BLACK2_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<div class="job-list"><ul>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/x1.html">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">售前技术支持</span><span class="salary">3-5K</span></div></div>'
      + '<div class="corp-box"><span class="corp-name">智玩店科技</span></div></a></div></li>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/x2.html">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">产品行销</span><span class="salary">15-30K</span></div></div></a></div></li>'
      + '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/x3.html">'
      + '<div class="job-info"><div class="job-title"><span class="job-name">运营专员</span><span class="salary">6-9K</span></div></div>'
      + '<div class="company-info"><h3 class="company-name">正常科技有限公司</h3></div></a></div></li>'
      + '</ul></div>'
      + '<script>var host=document.querySelector(".job-list"); host.__vue__={jobList:['
      + '{encryptJobId:"x2",securityId:"SEC-X2",jobName:"产品行销",brandName:"智玩店科技"}'
      + ']};</script></body></html>';
    const ctxB = await browser.newContext();
    await ctxB.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:BLACK2_HTML });
    });
    const pB = await ctxB.newPage();
    const errsB = [];
    pB.on('pageerror', e=>errsB.push(String((e&&e.message)||e)));
    await pB.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pB.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:[], wordsCard:[], wordsJd:[], rules:[], hideSalaryOut:false, blackCompanies:['智玩店科技'], blackAreas:[] })); });
    await pB.addScriptTag({ content: SCRIPT });
    await pB.waitForTimeout(900);
    const hiddenB = await pB.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      name:(li.querySelector('.job-name')||{}).textContent||'',
      disp:getComputedStyle(li).display,
      reason:li.getAttribute('data-bwf-reason')||''
    })));
    const b1=hiddenB.find(x=>x.name==='售前技术支持'), b2=hiddenB.find(x=>x.name==='产品行销'), b3=hiddenB.find(x=>x.name==='运营专员');
    check('公司名认不出（未知 class）→ 卡片文字兜底命中并隐藏', !!b1&&b1.disp==='none'&&/黑名单·公司/.test(b1.reason)&&/卡片文字命中/.test(b1.reason), JSON.stringify(b1));
    check('公司名只在 Vue 状态里 → 也能命中并隐藏', !!b2&&b2.disp==='none'&&/黑名单·公司/.test(b2.reason)&&!/卡片文字命中/.test(b2.reason), JSON.stringify(b2));
    check('没被拉黑的岗位不受影响（不误伤）', !!b3&&b3.disp!=='none', JSON.stringify(b3));
    const blackCount = await pB.evaluate(()=>{ document.getElementById('bwfRules').click(); const p=document.getElementById('bwfPanel'); return p?p.textContent:''; });
    check('面板黑名单两栏都有标题与条数（v1.3.4：地点那栏不再只有一行灰字）', /公司黑名单/.test(blackCount)&&/地点黑名单/.test(blackCount)&&/当前 \d+ 条/.test(blackCount)&&/v1\.2\.2/.test(blackCount), (blackCount||'').slice(0,140));
    check('公司黑名单无运行时错误', errsB.length===0, errsB.join(' | '));

    // 右键：选中公司名文字 → 加进公司黑名单
    const ctxB2 = await browser.newContext();
    await ctxB2.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:BLACK2_HTML });
    });
    const pB2 = await ctxB2.newPage();
    const errsB2 = [];
    pB2.on('pageerror', e=>errsB2.push(String((e&&e.message)||e)));
    await pB2.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pB2.evaluate(()=>{ localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:[], wordsCard:[], wordsJd:[], rules:[], hideSalaryOut:false, blackCompanies:[], blackAreas:[] })); });
    await pB2.addScriptTag({ content: SCRIPT });
    await pB2.waitForTimeout(900);
    const selInfo = await pB2.evaluate(()=>{
      const el=document.querySelector('.corp-name');
      const r=document.createRange(); r.selectNodeContents(el);
      const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      const rect=el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:Math.round(rect.left+8),clientY:Math.round(rect.top+6)}));
      const m=document.getElementById('bwfMenu');
      return {sel:String(s.toString()).trim(), menu:m?m.innerText:''};
    });
    check('右键选中公司名：菜单出现「公司黑名单」项', selInfo.sel==='智玩店科技'&&/公司黑名单/.test(selInfo.menu), JSON.stringify(selInfo).slice(0,160));
    await pB2.evaluate(()=>{
      const b=Array.prototype.slice.call(document.querySelectorAll('#bwfMenu .bwf-mi')).find(x=>/公司黑名单/.test(x.textContent));
      if(b) b.click();
    });
    await pB2.waitForTimeout(500);
    const afterB2 = await pB2.evaluate(()=>{
      const cfg=JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}');
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/售前技术支持/.test(x.textContent));
      return {blacks:cfg.blackCompanies||[], disp:li?getComputedStyle(li).display:'missing'};
    });
    check('点一下就把「智玩店科技」写进公司黑名单并立刻隐藏', afterB2.blacks.indexOf('智玩店科技')>=0 && afterB2.disp==='none', JSON.stringify(afterB2));
    check('右键加黑名单无运行时错误', errsB2.length===0, errsB2.join(' | '));
    await ctxB.close();
    await ctxB2.close();
  }

  console.log('xlsx 模板（列宽 / 冻结 / 加粗 / 下拉 / 说明页）');
  {
    const { execFileSync } = require('child_process');
    const ctxT = await browser.newContext({ acceptDownloads: true });
    await ctxT.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"></div></body></html>' });
    });
    const pT = await ctxT.newPage();
    await pT.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pT.addScriptTag({ content: SCRIPT });
    await pT.waitForTimeout(600);
    await pT.evaluate(()=>document.getElementById('bwfRules').click());
    await pT.waitForTimeout(200);
    const [dl] = await Promise.all([
      pT.waitForEvent('download', { timeout: 8000 }).catch(()=>null),
      pT.evaluate(()=>document.getElementById('bwfTplX').click())
    ]);
    if(!dl){ check('xlsx 模板能下载', false, '没有触发下载'); }
    else{
      const out = path.join(os.tmpdir(), 'bwf-template-' + Date.now() + '.xlsx');
      await dl.saveAs(out);
      const head = fs.readFileSync(out).slice(0, 2).toString('latin1');
      check('xlsx 模板能下载且是合法 ZIP', head === 'PK', 'head=' + JSON.stringify(head));
      let info = null;
      try{
        const py = [
          'import openpyxl,json,sys',
          'wb=openpyxl.load_workbook(sys.argv[1])',
          "ws=wb['规则']",
          "print(json.dumps({'sheets':wb.sheetnames,'header':[c.value for c in ws[1]],'row2':[c.value for c in ws[2]],"+
          "'widths':[ws.column_dimensions[chr(65+i)].width for i in range(7)],'validations':len(ws.data_validations.dataValidation),"+
          "'freeze':ws.freeze_panes,'explain':wb['说明'].max_row},ensure_ascii=False))"
        ].join('\n');
        info = JSON.parse(execFileSync('python', ['-c', py, out], { encoding:'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING:'utf-8' }) }));
      }catch(e){ info = { error: String(e.message).slice(0,200) }; }
      check('openpyxl 能正常打开（不是坏文件）', !!info && !info.error, JSON.stringify(info).slice(0,200));
      check('两个工作表：规则 + 说明', info.sheets && info.sheets[0]==='规则' && info.sheets[1]==='说明', JSON.stringify(info.sheets));
      check('表头正确', info.header && info.header.join(',')==='类型,字段,匹配,值,动作,启用,备注', JSON.stringify(info.header));
      check('设置了列宽', info.widths && info.widths[3]>=20, JSON.stringify(info.widths));
      check('冻结首行 + 5 组下拉', info.freeze==='A2' && info.validations===5, 'freeze='+info.freeze+' validations='+info.validations);
      check('说明页有内容', info.explain>=8, 'rows='+info.explain);
    }
    await ctxT.close();
  }


  console.log('v1.2.5：地点黑名单双源并列 + 协同协议');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('u1', '田寮仓库主管', '7-9K', '深圳市田寮某某有限公司')
      + card('u2', '保洁员', '4-5K', '某某物业有限公司')
      + '</ul></div></body></html>';
    const ctxU = await browser.newContext();
    await ctxU.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:html });
    });
    const pU = await ctxU.newPage();
    await pU.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pU.evaluate(()=>{
      localStorage.setItem('bw_job_addr', JSON.stringify({ u1: { addr:'上海·静安区某某路', area:'静安区', ts: Date.now() } }));
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:['zzz占位'], hideSalaryOut:false, rules:[], blackAreas:['田寮'] }));
    });
    await pU.reload({ waitUntil:'load' });
    await pU.addScriptTag({ content: SCRIPT });
    await pU.waitForTimeout(1000);
    const hU = await pU.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('[data-bwf="hidden"]'))
      .map(li=>({ t: li.innerText.replace(/\s+/g,' ').slice(0,8), why: li.getAttribute('data-bwf-reason')||'', mk: li.getAttribute('data-bwf-hide')||'' })));
    check('卡片命中与详情地址并存 → 仍隐藏（双源并列）', hU.length===1 && /地点\(卡片\)/.test(hU[0].why) && hU[0].mk==='1', JSON.stringify(hU));
    await pU.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/保洁员/.test(x.innerText));
      li.setAttribute('data-bt-focus','1'); li.style.display='none';
    });
    await pU.waitForTimeout(2600);
    const u2s = await pU.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/保洁员/.test(x.innerText));
      return { visible:getComputedStyle(li).display!=='none', focus:li.getAttribute('data-bt-focus')||'', bwf:li.getAttribute('data-bwf')||'' };
    });
    check('协同协议：带 data-bt-focus 的卡不被 filter 重绘放出', u2s.visible===false&&u2s.focus==='1', JSON.stringify(u2s));
    await pU.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/保洁员/.test(x.innerText));
      li.removeAttribute('data-bt-focus');
    });
    await pU.waitForTimeout(2600);
    const u2s2 = await pU.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/保洁员/.test(x.innerText));
      return getComputedStyle(li).display!=='none';
    });
    check('标记撤掉后 filter 重绘恢复显示', u2s2===true, 'visible='+u2s2);
    await ctxU.close();
  }


  console.log('v1.2.5：地点黑名单双源并列 + 协同协议不互撤');
  {
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('u1', '田寮仓管', '6-8K', '深圳市田寮某某公司')
      + card('u2', '保洁员', '4-5K', '某某物业有限公司')
      + '</ul></div></body></html>';
    const ctxU = await browser.newContext();
    await ctxU.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body: html });
    });
    const pageU = await ctxU.newPage();
    await pageU.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
    await pageU.evaluate(()=>{
      localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:[], wordsCard:[], wordsJd:[], rules:[], hideSalaryOut:false, blackCompanies:[], blackAreas:['田寮'] }));
      localStorage.setItem('bw_job_addr', JSON.stringify({ u1:{ addr:'上海·静安区某某路', area:'静安区', ts: Date.now() } }));
    });
    await pageU.addScriptTag({ content: SCRIPT });
    await pageU.waitForTimeout(1200);
    const u1 = await pageU.evaluate(()=>{ const li=document.querySelector('a[href*="u1"]').closest('li'); return { bwf:li.getAttribute('data-bwf'), reason:li.getAttribute('data-bwf-reason')||'', hide:li.getAttribute('data-bwf-hide')||'', visible:getComputedStyle(li).display!=='none' }; });
    check('详情地址存在但不含黑名单词时，卡片文字命中仍隐藏（双源并列）', u1.bwf==='hidden' && !u1.visible && /地点\(卡片\)/.test(u1.reason) && u1.hide==='1', JSON.stringify(u1));
    await pageU.evaluate(()=>{ const li=document.querySelector('a[href*="u2"]').closest('li'); li.setAttribute('data-bt-focus','1'); li.style.display='none'; });
    await pageU.waitForTimeout(2600);
    const u2a = await pageU.evaluate(()=>{ const li=document.querySelector('a[href*="u2"]').closest('li'); return { visible:getComputedStyle(li).display!=='none', focus:li.getAttribute('data-bt-focus')||'' }; });
    check('协同协议：带 data-bt-focus 的卡不被 filter 重绘放出', u2a.visible===false && u2a.focus==='1', JSON.stringify(u2a));
    await pageU.evaluate(()=>{ const li=document.querySelector('a[href*="u2"]').closest('li'); li.removeAttribute('data-bt-focus'); });
    await pageU.waitForTimeout(2600);
    const u2b = await pageU.evaluate(()=>{ const li=document.querySelector('a[href*="u2"]').closest('li'); return getComputedStyle(li).display!=='none'; });
    check('标记撤掉后下一轮重绘恢复显示', u2b===true, 'visible='+u2b);
    await ctxU.close();
  }

  await browser.close();
  console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
  process.exit(failures ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
