// 命中打标签脚本的端到端测试：假列表页 → 命中打标签（不隐藏）→ 规则编辑 → 面板拖动 → 与 filter 配合
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-tag.user.js'), 'utf8');
const SCRIPT_VER = (SCRIPT.match(/@version\s+([\d.]+)/) || [])[1] || '';
const FILTER = fs.readFileSync(path.join(__dirname, '..', 'boss-filter.user.js'), 'utf8');

function card(id, name, salary, company, extra){
  return '<li class="job-card-wrapper"><div class="job-card-body"><a class="job-card-left" href="/job_detail/' + id + '.html">'
    + '<div class="job-info"><div class="job-title"><span class="job-name">' + name + '</span><span class="salary">' + salary + '</span></div>'
    + (extra || '')
    + '</div><div class="company-info"><h3 class="company-name">' + company + '</h3></div></a></div></li>';
}

let failures = 0;
function check(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

// 收集每张卡片的状态：岗位名 / 是否命中 / 命中词 / 是否可见 / 是否有胶囊
function picker(){
  return Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
    name: (li.querySelector('.job-name') || {}).textContent || '',
    hit: li.getAttribute('data-bt-hit') || '',
    tags: li.getAttribute('data-bt-tags') || '',
    visible: getComputedStyle(li).display !== 'none',
    cap: li.querySelector('.bt-tag') ? li.querySelector('.bt-tag').textContent : '',
    capTitle: li.querySelector('.bt-tag') ? li.querySelector('.bt-tag').title : ''
  }));
}

async function openList(browser, html, preset){
  // preset: async (page)=>{} 在注入脚本前设置 localStorage
  const ctx = await browser.newContext();
  await ctx.route('**/*', route=>{
    const u = route.request().url();
    if(!u.includes('zhipin.com')) return route.continue();
    if(u.includes('joblist.json')) return route.fulfill({ status:200, contentType:'application/json;charset=utf-8', body: preset && preset.apiJson ? preset.apiJson : '{"code":0,"zpData":{}}' });
    route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body: html });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e=>errs.push(String((e && e.message) || e)));
  await page.goto('https://www.zhipin.com/web/geek/job?query=x', { waitUntil:'load' });
  if(preset && preset.before) await preset.before(page);
  return { ctx, page, errs };
}

(async ()=>{
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  console.log('命中关键词 / 地区 → 打标签；不命中不标签；任何情况都不隐藏');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('c1', '课程顾问', '8-12K', '某某教育科技有限公司', '<div class="job-area">上海·浦东新区</div>')
      + card('c2', '押金客服专员', '6-9K', '某某担保有限公司')
      + card('c3', '前端工程师', '20-30K', '深圳某某软件有限公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:['押金'], areas:['上海'], companies:[], minMonthly:0, maxMonthly:0 }));
        localStorage.setItem('bt_migrated_v120','1');
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(picker);
    const byName = (arr,n)=>{ const x=arr.find(o=>o.name.indexOf(n)>=0); return x || {name:n, hit:'(缺)', tags:'', visible:null, cap:''}; };
    const c1 = byName(rows,'课程顾问'), c2 = byName(rows,'客服专员'), c3 = byName(rows,'前端工程师');
    check('地区正向命中 → 打「地区:上海」且保持可见', c1.hit==='1' && /地区:上海/.test(c1.tags) && c1.visible===true, JSON.stringify(c1));
    check('岗位名命中（只认卡片上方岗位名）→ 打标签', c2.hit==='1' && /押金/.test(c2.tags) && /押金/.test(c2.cap), JSON.stringify(c2));
    check('不命中的卡片不打标签', c3.hit==='' && c3.tags==='' && c3.cap==='', JSON.stringify(c3));
    check('v1.2.3 正向：地区不再直接隐藏任何卡', rows.every(r=>r.visible===true), JSON.stringify(rows.map(r=>r.visible)));
    check('小条计数 = 已标记 2 / 3', /2/.test(await page.evaluate(()=>document.getElementById('btCount').textContent)) && /3/.test(await page.evaluate(()=>document.getElementById('btCount').textContent)), await page.evaluate(()=>document.getElementById('btCount').textContent));
    // 契约：bt_hits 名单 + 只读查询函数
    const hitsInfo = await page.evaluate(()=>({
      hits: JSON.parse(localStorage.getItem('bt_hits')||'{}'),
      q1: window.__bossTagQuery('c1'),
      q2: window.__bossTagQuery('c2'),
      q3: window.__bossTagQuery('c3')
    }));
    check('bt_hits 按 jobId 存命中名单（c1 外地 / c2 押金 / c3 不在）',
      (hitsInfo.hits.c1 && hitsInfo.hits.c1.tags.indexOf('地区:上海')>=0) &&
      (hitsInfo.hits.c2 && hitsInfo.hits.c2.tags.indexOf('押金')>=0) &&
      !hitsInfo.hits.c3, JSON.stringify(hitsInfo.hits));
    check('window.__bossTagQuery 只读查询可用', hitsInfo.q1.hit===true && hitsInfo.q2.hit===true && hitsInfo.q2.tags.indexOf('押金')>=0 && hitsInfo.q3.hit===false, JSON.stringify({q1:hitsInfo.q1,q2:hitsInfo.q2,q3:hitsInfo.q3}));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('薪资字体反爬：DOM 乱码跳过判断；接口明文才判');
  {
    const GARBLED='\uE0A1\uE0A2-\uE0A3\uE0A4K';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('g1', '销售专员', GARBLED, '某某公司')
      + card('g2', '行政专员', GARBLED, '某某公司')
      + '</ul></div></body></html>';
    const API_JSON = JSON.stringify({code:0, zpData:{jobList:[
      {encryptJobId:'g1', salaryDesc:'3-5K', jobName:'销售专员', brandName:'某某公司'}
    ]}});
    const { ctx, page, errs } = await openList(browser, html, {
      apiJson: API_JSON,
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:[], areas:[], companies:[], minMonthly:4000, maxMonthly:0 }));
        localStorage.setItem('bt_migrated_v120','1');
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(600);
    await page.evaluate(()=>{ const x=new XMLHttpRequest(); x.open('GET','/wapi/zpgeek/search/joblist.json?query=x'); x.send(); });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(picker);
    const g1 = rows.find(o=>o.name.indexOf('销售专员')>=0) || {hit:'(缺)'};
    const g2 = rows.find(o=>o.name.indexOf('行政专员')>=0) || {hit:'(缺)'};
    check('薪资阈值已迁过滤脚本：tag 不再打薪资标签（g1 不命中）', g1.hit==='', JSON.stringify(g1));
    check('DOM 薪资乱码、无接口明文 → 跳过判断不误标', g2.hit==='' && g2.tags==='', JSON.stringify(g2));
    check('乱码薪资的卡片仍可见（不隐藏）', rows.every(r=>r.visible), JSON.stringify(rows.map(r=>r.visible)));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('规则改完 800ms 自动保存 + 立即重扫');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('d1', '运营专员', '6-9K', '某某科技有限公司')
      + card('d2', '会计', '5-7K', '某某财务服务有限公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:['zzz不命中'], areas:[], companies:[], minMonthly:0, maxMonthly:0 }));
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1000);
    let rows = await page.evaluate(picker);
    const beforeHit = rows.find(o=>o.name.indexOf('会计')>=0) || {hit:'?'};
    check('改规则前「会计」不命中', beforeHit.hit==='', JSON.stringify(beforeHit));
    // 打开面板，改关键词输入框（触发 input → 800ms 自动保存 + 立即重扫）
    await page.evaluate(()=>document.getElementById('btRules').click());
    await page.waitForTimeout(200);
    await page.evaluate(()=>{
      const ta=document.getElementById('btKeywords');
      ta.value='会计';
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.waitForTimeout(1300);   // 800ms 防抖 + 余量
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_rules_v1')||'{}').keywords);
    check('800ms 后自动保存进 localStorage', Array.isArray(saved) && saved.indexOf('会计')>=0, JSON.stringify(saved));
    rows = await page.evaluate(picker);
    const afterHit = rows.find(o=>o.name.indexOf('会计')>=0) || {hit:'?'};
    check('保存后立即重扫：「会计」卡片被打标签', afterHit.hit==='1' && /会计/.test(afterHit.tags), JSON.stringify(afterHit));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('面板可拖动，位置存本机（刷新后还在）');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('p1', '运营专员', '6-9K', '某某科技有限公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:[], areas:[], companies:[], minMonthly:0, maxMonthly:0 }));
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(800);
    await page.evaluate(()=>document.getElementById('btRules').click());
    await page.waitForTimeout(200);
    const panelVer = await page.evaluate(()=>document.getElementById('btPanel').textContent || '');
    check('面板显示版本号 v'+SCRIPT_VER, panelVer.includes('v'+SCRIPT_VER), panelVer.slice(0,60));
    const before = await page.evaluate(()=>{ const r=document.getElementById('btPanel').getBoundingClientRect(); return {left:r.left, top:r.top}; });
    const head = await page.evaluate(()=>{ const r=document.getElementById('btHead').getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
    await page.mouse.move(head.x, head.y);
    await page.mouse.down();
    await page.mouse.move(head.x + 130, head.y + 90, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(()=>{
      const r=document.getElementById('btPanel').getBoundingClientRect();
      return { left:r.left, top:r.top, saved: JSON.parse(localStorage.getItem('bt_ui')||'{}') };
    });
    check('拖动后面板位置移动了', Math.abs(after.left-before.left)>40 || Math.abs(after.top-before.top)>40, JSON.stringify({before, after}));
    check('位置存进本机 bt_ui', after.saved && typeof after.saved.panel==='object' && typeof after.saved.panel.x==='number' && typeof after.saved.panel.y==='number', JSON.stringify(after.saved));
    // 刷新后位置还在
    await page.reload({ waitUntil:'load' });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(800);
    await page.evaluate(()=>document.getElementById('btRules').click());
    await page.waitForTimeout(200);
    const restored = await page.evaluate(()=>{ const r=document.getElementById('btPanel').getBoundingClientRect(); return {left:r.left, top:r.top}; });
    check('刷新后打开面板位置还原', Math.abs(restored.left-after.left)<=2 && Math.abs(restored.top-after.top)<=2, JSON.stringify({after, restored}));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('被 filter 隐藏的卡片不再打标签（和 filter 配合）');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('e1', '电销专员', '8-12K', '某某信息科技有限公司')
      + card('e2', '销售专员', '8-12K', '某某贸易有限公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:['电销'], hideSalaryOut:false }));
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:['电销','销售'], areas:[], companies:[], minMonthly:0, maxMonthly:0 }));
      }); }
    });
    await page.addScriptTag({ content: FILTER });
    await page.waitForTimeout(900);
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      name:(li.querySelector('.job-name')||{}).textContent||'',
      bwf:li.getAttribute('data-bwf')||'',
      visible:getComputedStyle(li).display!=='none',
      bthit:li.getAttribute('data-bt-hit')||'',
      bttags:li.getAttribute('data-bt-tags')||''
    })));
    const e1 = rows.find(o=>o.name.indexOf('电销专员')>=0) || {name:'电销专员'};
    const e2 = rows.find(o=>o.name.indexOf('销售专员')>=0) || {name:'销售专员'};
    check('filter 把「电销专员」隐藏了', e1.bwf==='hidden' && !e1.visible, JSON.stringify(e1));
    check('被 filter 隐藏的卡片不再打标签', e1.bthit==='' && e1.bttags==='', JSON.stringify(e1));
    check('可见卡片照常打标签（销售专员 → 销售）', e2.visible && e2.bthit==='1' && /销售/.test(e2.bttags), JSON.stringify(e2));
    const cross = await page.evaluate(()=>({
      q: window.__bossTagQuery('e2'),
      hits: JSON.parse(localStorage.getItem('bt_hits')||'{}')
    }));
    check('bt_hits 里只有可见命中的 e2，没有被隐藏的 e1', !!cross.hits.e2 && !cross.hits.e1 && cross.q.hit===true, JSON.stringify(cross));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }


  console.log('v1.1.0：地区只认卡片底行地点 + 家乡抑制 + 只看命中 + 协同协议');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('f1', '课程顾问', '8-12K', '上海某某教育科技有限公司', '<div class="job-area">广州·天河区</div>')
      + card('f2', '仓库主管', '7-9K', '某某物流有限公司', '<div class="job-area">深圳·福田区上步 上海·静安区某某</div>')
      + card('f3', '客服专员', '6-8K', '某某客服中心', '<div class="job-area">上海·静安区某某</div>')
      + card('g1', '前端工程师', '20-30K', '杰能 深圳·光明区·田寮')
      + card('g2', '电子维修', '5-6K', '杰能 桂林·秀峰区')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:[], areas:['上海','桂林'], companies:[], homeAreas:['深圳'], minMonthly:0, maxMonthly:0, focus:false }));
        localStorage.setItem('bt_migrated_v120','1');
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    const rows = await page.evaluate(picker);
    const byName = (arr,n)=>{ const x=arr.find(o=>o.name.indexOf(n)>=0); return x || {name:n, hit:'(缺)', tags:'', visible:null, cap:''}; };
    const f1=byName(rows,'课程顾问'), f2=byName(rows,'仓库主管'), f3=byName(rows,'客服专员'), g1=byName(rows,'前端工程师'), g2=byName(rows,'电子维修');
    check('公司名里的城市名不再算外地（只认底行地点）', f1.hit==='', JSON.stringify(f1));
    check('多地点底行：正向命中打地区标并保留', f2.hit==='1' && /地区:上海/.test(f2.tags) && f2.visible===true, JSON.stringify(f2));
    check('底行地点正向命中 → 标地区:上海并保留', f3.hit==='1' && /地区:上海/.test(f3.tags) && f3.visible===true, JSON.stringify(f3));
    check('底行地点不在白名单 → 不打标签', g1.hit==='', JSON.stringify(g1));
    check('无 .job-area 时按 innerText 末行解析地点（标地区:桂林并保留）', g2.hit==='1' && /地区:桂林/.test(g2.tags) && g2.visible===true, JSON.stringify(g2));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('v1.2.0 隐藏未命中：藏未命中卡 / 退出恢复 / 与 filter 标记不互撤');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('k1', '押金课程顾问', '8-12K', '甲公司')
      + card('k2', '前端工程师', '20-30K', '乙公司')
      + card('k3', '销售专员', '6-9K', '丙公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:['押金'], areas:[], companies:[], homeAreas:[], minMonthly:0, maxMonthly:0, focus:true }));
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    const st = ()=>page.evaluate(()=>Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).map(li=>({
      name:(li.querySelector('.job-name')||{}).textContent||'',
      visible:getComputedStyle(li).display!=='none',
      focus:li.getAttribute('data-bt-focus')||''
    })));
    let rows = await st();
    const k1=rows.find(o=>/押金课程顾问/.test(o.name)), k2=rows.find(o=>/前端工程师/.test(o.name)), k3=rows.find(o=>/销售专员/.test(o.name));
    check('隐藏未命中：命中卡保持可见并进入投递', !!k1&&k1.visible&&k1.focus==='', JSON.stringify(k1));
    check('隐藏未命中：未命中卡被隐藏且带 data-bt-focus', !!k2&&!k2.visible&&k2.focus==='1'&&!!k3&&!k3.visible&&k3.focus==='1', JSON.stringify(rows));
    check('小条显示隐藏未命中计数', /隐藏未命中/.test(await page.evaluate(()=>document.getElementById('btCount').textContent)), await page.evaluate(()=>document.getElementById('btCount').textContent));
    await page.evaluate(()=>document.getElementById('btFocus').click());
    await page.waitForTimeout(500);
    rows = await st();
    check('退出隐藏未命中恢复全部卡片', rows.every(r=>r.visible&&r.focus===''), JSON.stringify(rows));
    await page.evaluate(()=>{
      const li=Array.prototype.slice.call(document.querySelectorAll('li.job-card-wrapper')).find(x=>/销售专员/.test(x.innerText));
      li.setAttribute('data-bwf-hide','1'); li.style.display='none';
    });
    await page.evaluate(()=>document.getElementById('btFocus').click());
    await page.waitForTimeout(500);
    await page.evaluate(()=>document.getElementById('btFocus').click());
    await page.waitForTimeout(500);
    rows = await st();
    const k3b=rows.find(o=>/销售专员/.test(o.name));
    check('协同协议：带 data-bwf-hide 的卡退出隐藏未命中后仍隐藏', !!k3b&&!k3b.visible&&k3b.focus==='', JSON.stringify(k3b));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }


  console.log('v1.2.0 迁移：负向词/阈值交给过滤脚本，地区转白名单');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('m1', '课程顾问', '8-12K', '上海某某教育科技有限公司', '<div class="job-area">深圳·福田区</div>')
      + card('m2', '客服专员', '6-8K', '某某客服中心', '<div class="job-area">广州·天河区</div>')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:[], areas:['上海'], companies:[], homeAreas:['深圳'], minMonthly:4000, maxMonthly:0 }));
        localStorage.setItem('bwf_rules_v1', JSON.stringify({ on:true, words:[], blackAreas:[], blackCompanies:[] }));
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    const f = await page.evaluate(()=>JSON.parse(localStorage.getItem('bwf_rules_v1')||'{}'));
    check('迁移：filter 黑名单不受影响', (f.blackAreas||[]).length===0, JSON.stringify(f.blackAreas));
    check('迁移：月薪阈值进过滤脚本', (f.minMonthly|0)===4000, 'min='+f.minMonthly);
    const tg = await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_rules_v1')||'{}'));
    check('迁移：tag 地区表原样保留（现为正向语义）', JSON.stringify(tg.areas||[])===JSON.stringify(['上海']), JSON.stringify(tg.areas));
    const rows = await page.evaluate(picker);
    const m1=rows.find(o=>/课程顾问/.test(o.name))||{hit:'(缺)'}, m2=rows.find(o=>/客服专员/.test(o.name))||{hit:'(缺)'};
    check('迁移后地区表正向（m1 深圳不在表内 → 不打标保留）', m1.hit===''&&m1.visible===true, JSON.stringify(m1));
    check('不在白名单的 m2 不打标', m2.hit==='', JSON.stringify(m2));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }

  console.log('v1.2.0 右键取消标记 / 恢复标记');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('u1', '押金课程顾问', '8-12K', '甲公司')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:['押金'], areas:[], companies:[], minMonthly:0, maxMonthly:0 }));
        localStorage.setItem('bt_migrated_v120','1');
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1000);
    let rows = await page.evaluate(picker);
    check('前置：u1 命中押金', rows[0].hit==='1', JSON.stringify(rows[0]));
    await page.evaluate(()=>{
      const cap=document.querySelector('a[href*="u1"]').closest('li').querySelector('.bt-tag');
      cap.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:120}));
    });
    await page.waitForTimeout(300);
    const menu1 = await page.evaluate(()=>{ const m=document.querySelector('.bt-menu'); return m?Array.prototype.slice.call(m.querySelectorAll('button')).map(b=>b.getAttribute('data-m')):null; });
    check('右键命中卡弹出菜单（含取消标记）', !!menu1 && menu1.indexOf('unmark')>=0, JSON.stringify(menu1));
    await page.evaluate(()=>{ document.querySelector('.bt-menu button[data-m="unmark"]').click(); });
    await page.waitForTimeout(700);
    rows = await page.evaluate(picker);
    const un = await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_unmarked')||'{}'));
    check('取消标记后不再打标且名单落盘', rows[0].hit===''&&Object.keys(un).length===1, JSON.stringify({row:rows[0],un}));
    await page.evaluate(()=>{
      const li=document.querySelector('a[href*="u1"]').closest('li');
      li.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:120}));
    });
    await page.waitForTimeout(300);
    await page.evaluate(()=>{ document.querySelector('.bt-menu button[data-m="remark"]').click(); });
    await page.waitForTimeout(700);
    rows = await page.evaluate(picker);
    check('恢复标记后命中回来', rows[0].hit==='1', JSON.stringify(rows[0]));
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }


  console.log('v1.2.3 地区正向：命中打标并保留，不再直接隐藏');
  {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="job-list"><ul>'
      + card('n1', '课程顾问', '8-12K', '甲公司', '<div class="job-area">北京·海淀区</div>')
      + card('n2', '客服专员', '6-8K', '乙公司', '<div class="job-area">深圳·福田区</div>')
      + '</ul></div></body></html>';
    const { ctx, page, errs } = await openList(browser, html, {
      before: async p=>{ await p.evaluate(()=>{
        localStorage.setItem('bt_rules_v1', JSON.stringify({ on:true, keywords:[], areas:['北京'], companies:[], minMonthly:0, maxMonthly:0 }));
        localStorage.setItem('bt_migrated_v120','1');
      }); }
    });
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1200);
    let rows = await page.evaluate(picker);
    const n1=rows.find(o=>/课程顾问/.test(o.name)), n2=rows.find(o=>/客服专员/.test(o.name));
    check('地区正向命中 → 打标且保留（无 data-bt-hide）', n1&&n1.visible===true&&/地区:北京/.test(n1.tags), JSON.stringify(n1));
    check('未命中城市的卡保持可见', n2&&n2.visible, JSON.stringify(n2));
    await page.evaluate(()=>{ document.getElementById('btRules').click(); });
    await page.waitForTimeout(300);
    const hintOk = await page.evaluate(()=>{ const p=document.querySelector('#btPanel'); return !!p && /想去/.test(p.textContent) && !document.getElementById('btNegList'); });
    check('面板地区块改正向文案且被隐藏清单已移除', hintOk===true, '');
    check('无运行时错误', errs.length===0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
  process.exit(failures ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
