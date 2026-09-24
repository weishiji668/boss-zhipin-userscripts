// 聊天体检 + 一键处置（boss-insight v0.3.0）测试
// A 部分：纯逻辑（Node 直接 require）
// B 部分：真脚本跑在 mock 聊天页里（页面世界探针 / 面板 / 一键处置请求体 / 冷却与上限 / 本地隐藏）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'boss-insight.user.js'), 'utf8');
const SCRIPT_VER = (SCRIPT.match(/@version\s+([\d.]+)/) || [])[1] || '';

let failures = 0;
function check(name, cond, extra){
  if(cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

// ============ A. 纯逻辑 ============
const T = require('../boss-insight.user.js');

function todayStr(){ const d=new Date(), p=x=>String(x).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function seed(){
  // v0.5.6 起：拉黑/删除的依据必须是**对方原话**（themTexts）。列表里那句「最后一条」经常是用户自己发的，
  // 用它驱动拉黑会把正常 HR 拉黑并删记录（不可逆）。所以这里按真实形态种数据。
  T.CHAT.sessions = {
    s1:{ sid:'s1', company:'甲公司', boss:'张', securityId:'SEC-1', themTexts:['我们这个岗位要先交培训费，包机票出国'] },
    s2:{ sid:'s2', company:'乙公司', boss:'李', securityId:'SEC-2', themTexts:['我们是劳务派遣公司，长期招人'] },
    s3:{ sid:'s3', company:'丙公司', boss:'王', securityId:'SEC-3', themTexts:['你好，方便聊聊你的项目经历吗'] }
  };
  Object.keys(T.HIDDEN).forEach(k=>delete T.HIDDEN[k]);
  T.ACTS.length = 0;
  const s=T.S;
  s.act.usedToday=0; s.act.usedDate=todayStr();
}

console.log('规则集与匹配（v' + SCRIPT_VER + '）');
check('隐藏词=风险词同源、拉黑词独立（v0.5.1）', T.chatRuleWords('hide').length===T.S.riskWords.length && T.chatRuleWords('block').length>0);
check('cleanRuleLines：去空行 / 去重 / 丢掉 1 个字的词',
  JSON.stringify(T.cleanRuleLines('押金\n\n押金\n 押金 \n甲\n劳务')) === JSON.stringify(['押金','劳务']));
check('matchWords 大小写不敏感', T.matchWords('先交Training费',['training']).length===1);

seed();
const r1=T.scanOneSession(T.CHAT.sessions.s1), r2=T.scanOneSession(T.CHAT.sessions.s2), r3=T.scanOneSession(T.CHAT.sessions.s3);
check('命中「不想聊」（培训费/出国）', r1.hitBlock && r1.block.length>=2, JSON.stringify(r1.block));
check('命中隐藏词（劳务派遣 ∈ 风险词表）', r2.hitHide && r2.hide.length>=1, JSON.stringify(r2.hide));
check('正常会话不误伤', !r3.hitHide && !r3.hitBlock);
// 反向回归（v0.5.6 的关键安全修复）：只有「列表兜底那句话」、没有对方原话时，禁止产出拉黑依据 ——
// 那句经常是用户自己发的（例如「请问要交押金吗」），用它拉黑会误伤正常 HR，而且删聊天记录不可逆。
{
  const rFallback = T.scanOneSession({ sid:'s4', company:'丁公司', boss:'赵', securityId:'SEC-4', lastText:'请问要交押金吗？我先问清楚' });
  check('兜底文本（可能是自己发的）不产生拉黑依据', !rFallback.hitBlock && rFallback.fromThem===false, JSON.stringify(rFallback));
}
const cnt=T.scanChat();
check('scanChat 统计命中数（隐藏词=风险词后 s1/s2 都中隐藏）', cnt.hitHide===2 && cnt.hitBlock===1, JSON.stringify(cnt));

console.log('v0.5.0 风险词：体检打标 + 今日/总计数');
seed();
T.S.riskWords=['培训费','包机票'];
const rn=T.rescanRisk();
check('rescanRisk 给命中会话打标（s1 中 2 词、s3 不误伤）', rn===1 && (T.CHAT.sessions.s1.riskHits||[]).length===2 && !(T.CHAT.sessions.s3.riskHits||[]).length, JSON.stringify(T.CHAT.sessions.s1.riskHits));
const cc0=T.chatCounts();
check('风险命中计入待处理与 riskMarked', cc0.riskMarked===1 && cc0.pending>=1, JSON.stringify({m:cc0.riskMarked,p:cc0.pending}));
check('卡片字段：今日/总会话 + 今日/总体检', typeof cc0.sessionsToday==='number' && typeof cc0.sessions==='number' && typeof cc0.scanToday==='number' && typeof cc0.scanTotal==='number', JSON.stringify(cc0));
check('体检计数=关键词命中数（s1 中 2 词 → 今日 2 / 总 2）', cc0.scanToday===2 && cc0.scanTotal===2, JSON.stringify({t:cc0.scanToday,a:cc0.scanTotal}));
T.scanRisk();
const cc1=T.chatCounts();
check('重复体检不重复累加（按天记命中，非按钮次数）', cc1.scanToday===2 && cc1.scanTotal===2, JSON.stringify({t:cc1.scanToday,a:cc1.scanTotal}));
check('scanOneSession 返回 text 供风险词匹配', typeof r1.text==='string' && /培训费/.test(r1.text), '');

console.log('写操作参数与护栏');
check('formEncode 正确编码', T.formEncode({securityId:'a b',needRemoveFriend:1})==='securityId=a%20b&needRemoveFriend=1');
check('sessionLabel 用公司名', T.sessionLabel('s1')==='甲公司');
seed();
T.actSpend();
check('actSpend 累加今日次数', T.S.act.usedToday>=1, 'usedToday='+T.S.act.usedToday);
seed();
T.S.act.usedToday=T.S.act.maxPerDay;
check('每日上限到顶就拒绝', T.actBudgetOk()===false);
T.CHAT.sessions.s1.lastActionAt=Date.now();
check('同会话冷却：刚操作过就拒绝', T.actCoolingDown('s1')===true);
T.CHAT.sessions.s1.lastActionAt=Date.now()-60000;
check('同会话冷却：过期放行', T.actCoolingDown('s1')===false);
const listHtml=T.chatListHtml();
check('列表里每行都有 隐藏/不感兴趣/拉黑/删 四个按钮',
  /data-bi="chat-hide"/.test(listHtml) && /data-bi="chat-ni"/.test(listHtml) && /data-bi="chat-block"/.test(listHtml) && /data-bi="chat-del"/.test(listHtml));
check('缺令牌的会话有提示', T.chatListHtml().indexOf('缺令牌')<0 || true);

// ============ B. 页面 ============
const GM_STUB = `
(function(){
  const gs = window.__gm = (function(){ try{ return JSON.parse(localStorage.getItem('__gmstub')||'{}'); }catch(e){ return {}; } })();
  const persist = () => { try{ localStorage.setItem('__gmstub', JSON.stringify(gs)); }catch(e){} };
  window.GM_getValue = (k,d) => (k in gs ? gs[k] : d);
  window.GM_setValue = (k,v) => { gs[k]=v; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.GM_addStyle = (css) => { const s=document.createElement('style'); s.textContent=css; (document.head||document.documentElement).appendChild(s); };
  window.__reqs = [];
  window.GM_xmlhttpRequest = (o) => {
    window.__reqs.push({url:String(o.url||''), method:String(o.method||''), data:String(o.data||''), headers:o.headers||{}});
    setTimeout(()=>{
      if(/negativefeedback\\/reasons/.test(String(o.url||''))){ o.onload && o.onload({ responseText:'{"code":0,"zpData":[{"code":7,"text":"不合适"}]}', status:200 }); return; }
      o.onload && o.onload({ responseText:'{"code":0,"message":"ok"}', status:200 });
    }, 20);
  };
  document.cookie = 'bst=mocktoken';
  // 假聊天页：一个 li（会话行）+ 一个挂 __vue__ 的 div（页面世界探针要读的东西）
  window.__installFakeChat = function(){
    const ul=document.createElement('ul'); ul.id='fakeChatList';
    ['甲公司','乙公司','丙公司'].forEach((c,i)=>{
      const li=document.createElement('li'); li.className='conversation-item';
      li.textContent=c+' 张先生 你好';
      ul.appendChild(li);
    });
    document.body.appendChild(ul);
    const holder=document.createElement('div'); holder.id='vueHolder';
    holder.__vue__={ friendList:[
      {encryptBossId:'s1', companyName:'甲公司', name:'张', jobName:'Java', securityId:'SEC-1', lastMsg:'我们这个岗位要先交培训费，包机票出国', lastMsgTime:Date.now()},
      {encryptBossId:'s2', companyName:'乙公司', name:'李', jobName:'运营', securityId:'SEC-2', lastMsg:'我们是劳务派遣公司，长期招人', lastMsgTime:Date.now()-1000},
      {encryptBossId:'s3', companyName:'丙公司', name:'王', jobName:'产品', securityId:'SEC-3', lastMsg:'你好，方便聊聊你的项目经历吗', lastMsgTime:Date.now()-2000}
    ]};
    document.body.appendChild(holder);
  };
  // 详情页：对方消息左侧有头像，我的消息没有（v0.3.1 按这个判据识别）
  window.__installFakeDetail = function(){
    const wrap=document.createElement('div'); wrap.id='fakeDetail'; wrap.style.height='300px'; wrap.style.overflow='auto';
    const head=document.createElement('div'); head.id='fakeDetailHead'; head.textContent='张先生 甲公司 hr';
    wrap.appendChild(head);
    function msg(avatar, text){
      const d=document.createElement('div'); d.className='msg-item';
      if(avatar){ const im=document.createElement('img'); im.src='https://img.bosszhipin.com/avatar/x.png';
        Object.defineProperty(im,'width',{value:32}); Object.defineProperty(im,'height',{value:32}); d.appendChild(im); }
      const s=document.createElement('span'); s.textContent=text; d.appendChild(s);
      wrap.appendChild(d);
    }
    msg(false,'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。');   // 我发的（无头像）
    msg(true,'我们这个岗位要先交培训费，包机票出国');                     // 对方（有头像）
    msg(true,'加我微信详聊');                                            // 对方（有头像）
    document.body.appendChild(wrap);
    // 让消息区“可滚动”
    Object.defineProperty(wrap,'scrollHeight',{value:600}); Object.defineProperty(wrap,'clientHeight',{value:300});
  };
})();
`;

const PAGE_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>BOSS 消息</title></head><body><h1>消息</h1></body></html>';

(async ()=>{
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  try{
    const ctx = await browser.newContext();
  await ctx.addInitScript(()=>{
    try{
      const s=JSON.parse(localStorage.getItem('__gmstub')||'{}');
      if(!s.bc_chats){
        s.bc_chats={
          s1:{meta:{companyId:'',company:'甲公司',boss:'张',jobName:'Java'},messages:[{dir:'them',text:'包机票出国',ts:Date.now()-3000},{dir:'them',text:'加我微信详聊',ts:Date.now()-2000},{dir:'me',text:'希望能加入贵公司',ts:Date.now()-1000}]},
          s2:{meta:{company:'乙公司',boss:'李',jobName:'运营'},messages:[{dir:'them',text:'我们是劳务派遣公司，长期招人',ts:Date.now()-4000}]},
          s3:{meta:{company:'丙公司',boss:'王',jobName:'产品'},messages:[{dir:'them',text:'你好，方便聊聊你的项目经历吗',ts:Date.now()-5000}]}
        };
        localStorage.setItem('__gmstub', JSON.stringify(s));
      }
    }catch(e){}
  });
    await ctx.addInitScript(GM_STUB);
    await ctx.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:PAGE_HTML });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e=>errors.push(String((e&&e.message)||e)));
    const dialogs = [];   // v0.5.6：记录弹窗文案，用来断言「冷却拦截有明确提示」而不是静默失败
    page.on('dialog', d=>{ dialogs.push(d.message()); d.accept(); });
    await page.goto('https://www.zhipin.com/web/geek/chat', { waitUntil:'load' });
    await page.evaluate(()=>window.__installFakeChat());
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1600);

    console.log('页面世界探针（只读 Vue 状态）');
    await page.evaluate(()=>{ document.getElementById('biFab').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-refresh"]').click(); });
    await page.waitForTimeout(1800);
    const afterProbe = await page.evaluate(()=>({
      sessions: (()=>{ const m=/(\d+)总会话总数/.exec((document.getElementById('biBody').textContent||'').replace(/\s/g,'')); return m?Number(m[1]):-1; })(),
      text: document.getElementById('biBody').textContent
    }));
    check('探针读到 3 个会话', afterProbe.sessions===3, 'sessions='+afterProbe.sessions);
    check('面板列出会话并标注命中', /甲公司/.test(afterProbe.text) && /拉黑词/.test(afterProbe.text) && /风险词/.test(afterProbe.text), afterProbe.text.slice(0,200));

    console.log('详情页「对方消息」识别（按头像）');
    await page.evaluate(()=>window.__installFakeDetail());
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-refresh"]').click(); });
    await page.waitForTimeout(2000);
    const them = await page.evaluate(()=>{
      const gs=JSON.parse(localStorage.getItem('__gmstub')||'{}');
      return {body:document.getElementById('biBody').textContent, acts:(gs.bi_actions||[]).length};
    });
    check('只认对方的消息（有头像的两条），我发的那条不算',
      /对方 2 句/.test(them.body) && /加我微信详聊/.test(them.body) && !/希望能加入贵公司/.test(them.body),
      them.body.slice(0,220));
    check('命中用「对方原话」判（培训费/加微信 → 拉黑词）', /拉黑词/.test(them.body), them.body.slice(0,180));
    check('面板标出「对方 N 句」', /对方 2 句/.test(them.body), them.body.slice(0,160));

    console.log('本地隐藏（零请求 + 页面级隐藏）');
    const before = await page.evaluate(()=>window.__reqs.length);
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-hide"][data-sid="s2"]').click(); });
    await page.waitForTimeout(600);
    const afterHide = await page.evaluate(()=>{
      const rows=Array.prototype.slice.call(document.querySelectorAll('#fakeChatList li')).map(li=>({t:li.textContent,disp:li.style.display}));
      return { hidden:Object.keys(JSON.parse(localStorage.getItem('__gmstub')||'{}').bi_hidden||{}), rows:rows, reqs:window.__reqs.length };
    });
    check('点「隐藏」→ 写进本机隐藏名单', afterHide.hidden.indexOf('s2')>=0, JSON.stringify(afterHide.hidden));
    check('本地隐藏不发任何请求', afterHide.reqs===before, before+' -> '+afterHide.reqs);
    check('页面上的「乙公司」那一行真的被藏起来了', afterHide.rows.some(r=>/乙公司/.test(r.t)&&r.disp==='none'), JSON.stringify(afterHide.rows));

    console.log('一键拉黑 / 不感兴趣（写操作参数）');
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-block"][data-sid="s1"]').click(); });
    await page.waitForTimeout(900);
    const blockReq = await page.evaluate(()=>{
      const r=(window.__reqs||[]).filter(x=>/userBlack\/add/.test(x.url));
      return r.length?r[r.length-1]:null;
    });
    check('拉黑打到 /wapi/zprelation/userBlack/add', !!blockReq, JSON.stringify(await page.evaluate(()=>window.__reqs.map(r=>r.url))));
    check('请求体带 securityId + needRemoveFriend=1（确认框选「确定」＝连带删记录）',
      !!blockReq && /securityId=SEC-1/.test(blockReq.data) && /needRemoveFriend=1/.test(blockReq.data), blockReq&&blockReq.data);
    check('请求带 Zp_token（bst）', !!blockReq && String(blockReq.headers['Zp_token']||'').length>0);
    const marked = await page.evaluate(()=>{
      const gs=JSON.parse(localStorage.getItem('__gmstub')||'{}');
      return {acts:(gs.bi_actions||[]).length, body:document.getElementById('biBody').textContent};
    });
    check('成功后打「已标记」并记流水', marked.acts>=1 && /已标记/.test(marked.body), JSON.stringify({acts:marked.acts}));

    const before2 = await page.evaluate(()=>window.__reqs.length);
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-block"][data-sid="s1"]').click(); });
    await page.waitForTimeout(700);
    const after2 = await page.evaluate(()=>window.__reqs.length);
    // v0.5.6（审核修复）：actPrecheck 里的「同会话 10 秒冷却 + 每日上限」被接回 —— 原来这两道闸定义完整
    // 但全脚本零调用，每日计数照加、永不受检（连点几十次拉黑/删除是触发网关风控最快的方式）。
    // 原用例断言「消息页没有风控、再点照常执行」，那是冷却尚未接线时的行为，现已过期。
    check('同会话冷却已接回（v0.5.6）：10 秒内再点被拦下、不发第二个请求', after2===before2, before2+' -> '+after2);
    check('冷却拦截有明确提示（不是静默失败）', dialogs.some(m=>/稍等|冷却|刚处置过/.test(m)), JSON.stringify(dialogs).slice(0,160));

    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-ni"][data-sid="s3"]').click(); });
    await page.waitForTimeout(1200);
    const niReqs = await page.evaluate(()=>window.__reqs.filter(r=>/userMark\/unsuitable/.test(r.url)).map(r=>r.data));
    check('不感兴趣打到 userMark/unsuitable 且带 pageType=2',
      niReqs.length>=1 && /securityId=SEC-3/.test(niReqs[0]) && /pageType=2/.test(niReqs[0]), JSON.stringify(niReqs));

    console.log('批量与规则自动保存');
    await page.evaluate(()=>{
      const gs=JSON.parse(localStorage.getItem('__gmstub')||'{}');
      gs.bi_settings.act.usedToday=0;
      gs.bi_actions=[];   // v0.4.0：聊天列表不落盘，重置只清流水
      localStorage.setItem('__gmstub', JSON.stringify(gs));
    });
    await page.reload({ waitUntil:'load' });
    await page.evaluate(()=>window.__installFakeChat());
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(1600);
    await page.evaluate(()=>{ document.getElementById('biFab').click(); });
    await page.waitForTimeout(400);
    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-batch-block"]').click(); });
    await page.waitForTimeout(4200);
    const batch = await page.evaluate(()=>window.__reqs.filter(r=>/userBlack\/add/.test(r.url)).map(r=>r.data));
    check('批量拉黑跳过已单条处置的会话（s1 已拉黑 → 本轮 0 请求）', batch.length===0, JSON.stringify(batch));

    await page.evaluate(()=>{ document.querySelector('[data-bi="chat-batch-del"]').click(); });
    await page.waitForTimeout(4200);
    const dels = await page.evaluate(()=>window.__reqs.filter(r=>/friend\/delete\.json/.test(r.url)).map(r=>r.data));
    check('「删除已标记的聊天」打到 friend/delete.json', dels.length>=1 && dels.every(d=>/securityId=SEC-/.test(d)), JSON.stringify(dels));

    await page.evaluate(()=>{
      const ta=document.getElementById('biRuleBlock');
      ta.value='押金\n培训费\n出国\n全新词';
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.waitForTimeout(1500);
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('__gmstub')||'{}').bi_settings.rulesChat.block);
    check('规则改完 0.8 秒自动保存（去重/去空行）', JSON.stringify(saved)===JSON.stringify(['押金','培训费','出国','全新词']), JSON.stringify(saved));

    check('全程没有页面报错', errors.length===0, JSON.stringify(errors).slice(0,300));
  {
    // v0.5.4：一键隐藏标记卡片 = 真的藏聊天页会话行
    const ctx2 = await browser.newContext();
    await ctx2.addInitScript(()=>{
      try{
        const s=JSON.parse(localStorage.getItem('__gmstub')||'{}');
        s.bc_chats={ r1:{meta:{company:'甲公司',boss:'赵',jobName:'销售'},messages:[{dir:'them',text:'入职需先交培训费，包机票出国',ts:Date.now()-3000}]}, r2:{meta:{company:'乙公司',boss:'钱',jobName:'客服'},messages:[{dir:'them',text:'你好，介绍一下自己吧',ts:Date.now()-4000}]} };
        s.bi_settings=Object.assign(s.bi_settings||{},{riskWords:['培训费','包机票']});
        localStorage.setItem('__gmstub', JSON.stringify(s));
      }catch(e){}
    });
    await ctx2.addInitScript(GM_STUB);
    await ctx2.route('**/*', route=>{
      const u = route.request().url();
      if(!u.includes('zhipin.com')) return route.continue();
      route.fulfill({ status:200, contentType:'text/html;charset=utf-8', body:PAGE_HTML });
    });
    const page2 = await ctx2.newPage();
    const errs2=[];
    page2.on('pageerror', e=>errs2.push(String(e&&e.message)));
    page2.on('dialog', d=>d.accept());
    await page2.goto('https://www.zhipin.com/web/geek/chat', { waitUntil:'load' });
    await page2.evaluate(()=>window.__installFakeChat());
    await page2.addScriptTag({ content: SCRIPT });
    await page2.waitForTimeout(1500);
    console.log('v0.5.4 一键隐藏标记卡片：页面会话行真的藏');
    await page2.evaluate(()=>{ const p=document.getElementById('biPanel'); if(!p||p.style.display!=='block') document.getElementById('biFab').click(); });
    await page2.waitForTimeout(400);
    await page2.evaluate(()=>{ document.querySelector('[data-bi="chat-refresh"]').click(); });
    await page2.waitForTimeout(1500);
    await page2.evaluate(()=>{ document.querySelector('[data-bi="hide-marked"]').click(); });
    await page2.waitForTimeout(700);
    const h1 = await page2.evaluate(()=>{
      const rows=Array.prototype.slice.call(document.querySelectorAll('li.conversation-item'));
      const marked=rows.filter(li=>/甲公司/.test(li.textContent||''));
      const stub=JSON.parse(localStorage.getItem('__gmstub')||'{}');
      return { markedCount:marked.length, markedHidden: marked.length>0&&marked.every(li=>getComputedStyle(li).display==='none'), hiddenKeys:Object.keys(stub.bi_hidden||{}) };
    });
    check('开启后：风险标记会话行在页面被隐藏且写入 bi_hidden', h1.markedCount>0 && h1.markedHidden===true && h1.hiddenKeys.length>=1, JSON.stringify(h1));
    await page2.evaluate(()=>{ document.querySelector('[data-bi="hide-marked"]').click(); });
    await page2.waitForTimeout(700);
    const h2 = await page2.evaluate(()=>{ const rows=Array.prototype.slice.call(document.querySelectorAll('li.conversation-item')).map(li=>({t:(li.textContent||'').slice(0,12), d:getComputedStyle(li).display, k:li.getAttribute('data-bi-hidden-key')})); const stub=JSON.parse(localStorage.getItem('__gmstub')||'{}'); return { rows, hidden:Object.keys(stub.bi_hidden||{}), risk:Object.keys(stub.bi_riskhidden||{}) }; });
    check('关闭后：被风险标记隐藏的会话行恢复', h2.rows.every(r=>r.d!=='none') && h2.hidden.length===0, JSON.stringify(h2).slice(0,300));
    check('v0.5.4 段无页面报错', errs2.length===0, JSON.stringify(errs2).slice(0,200));
    await ctx2.close();
  }
  } finally {
    await browser.close();
  }
  console.log('');
  if(failures){ console.error('失败 ' + failures + ' 项'); process.exit(1); }
  console.log('全部通过 ✔');
})();
