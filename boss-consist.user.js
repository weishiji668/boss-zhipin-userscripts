// ==UserScript==
// @name         BOSS直聘 · 一致性体检（卡片标签 vs 详情正文）
// @namespace    local.boss-consist
// @version      0.2.7
// @description  读卡片小标签（学历/经验 chip）与详情正文（共用 boss-filter 的 bwf_jd_cache 缓存；缺的按页面上有多少批量补取多少 /job_detail/<id>.html，串行小间隔、无每日额度），检三类：① 学历矛盾（卡片大专、正文本科及以上）；② 经验矛盾（卡片经验不限、正文要求 1 年以上）；③ 正文硬要求（四六级/CET/小语种/证书词，卡片上根本不显示）。状态条两个按钮：「隐藏」批量隐藏命中卡（data-bc-hide，协同协议），「标记」只打胶囊不隐藏；结果按 jobId 落盘 bc_actions，刷新自动恢复；面板「清除」撤销本脚本的隐藏/标记。v0.1.1：只在职位相关页面（列表/搜索/推荐/详情）出现状态条与按钮，聊天/消息页不挂 UI（它服务的是职位卡片，不是会话）。v0.1.2：默认位置上移到 🩺 体检球上方（不再重叠）；状态条可拖动（按住黑条拖，位置存本机 bc_ui，刷新还在）。v0.2.0：人工复核——右键命中卡「取消标记」（名单落盘 bc_unmarked，不再被打标/隐藏），再右键可「恢复标记」；「隐藏」按钮只藏当前带标记的卡。v0.2.2：面板可拖动（按住标题行拖，位置存 bc_ui_panel）；新增「手动对比」两框：第一框贴卡片内容（chips/岗位名/公司/地点）、第二框贴详情正文，点「对比这两框」即时出矛盾结论（不联网、不打标）。除你点按钮触发的详情补取外不发请求；不改站点数据。v0.1.0：首版。v0.2.3（审核修复）：修「批量补取详情页没有总量上限、没有失败即停、风控识别太窄」——原先只在 HTTP 429 时冷却，而 BOSS 实际风控响应是 403 或 200+滑块验证页，两者都不触发冷却；搜索页无限滚动下滚到 300 张卡就点「标记」会串行发出最多 300 个整页详情请求。现在风控识别扩到 403/429/503 + 验证页关键词 + 响应过短，单次运行 40 个硬上限，连续失败 3 次即停并冷却 5 分钟。修「详情缓存上限本身就超过浏览器配额」——原上限 1000 条 × 单条 6000 字符 = 600 万字符，而 localStorage 通常只有 5MB，写盘失败被 catch(e){} 静默吞掉，缓存静默失效后每次点按钮都重拉全部详情页；现在上限降到 400 条/120 万字符 + 写前按 TTL 清死条目 + 配额错误不再静默（会提示并重置缓存）。v0.2.4（审核修复）：修「右键『恢复标记』触发整页批量补取」——原来恢复一张卡会调 runBatch('mark') 把整页重新体检一遍，后台串行补取最多 40 个详情页并给整页重打一遍标；现在只重跑你右键的那一张。修「取消标记有时静默失败」——原选择器把 jobId 直接拼进 CSS 字符串（特殊字符会抛异常）、且只找 li 祖先，现在改成遍历链接比对 href。修「面板词表/名单/原因未转义」——这些文字直接拼进 innerHTML，带 < > & " 的内容会破坏面板结构，现已统一转义。修「清除按钮与取消标记名单脱节」——点「清除」原来不动名单，名单里的岗位之后永远不会再被打标/隐藏且面板上看不到解释，现已一并清空并提示。修「右键接管与滚动重扫在所有页面生效」——聊天页/公司页右键也会被拦，现已收进职位页判断。v0.2.5（审核复核）：修「右键『取消标记』点了没反应」—— v0.2.4 把卡片定位从「最近 li 祖先」改成「向上找第一个 isCardLike 祖先」，而 isCardLike 也会命中 <a class="job-card-left"> / <div class="job-card-body"> 这类内层元素，于是 clearJob() 清的是内层节点，卡片上的胶囊与 data-bc-mark 依旧在（名单已落盘，看起来却像没生效）。现在改用与「隐藏 / 标记」同一套 findCards() 定位（最外层、且不过大的卡片），找不到再退回 li 祖先。v0.2.6（与 boss-filter v1.3.2 同一根因）：修「详情正文被取成了站点的卡片摘要」——jdFromHtml 的正则原来把 description 也算候选，而卡片摘要的字段名就是它、且通常排在正文之前，于是「XX招聘，薪资：…地点：…要求：…福利：…刚刚在线，随时随地直接开聊。」被当成正文写进共用的 bwf_jd_cache；结果本脚本的正文硬要求/学历经验矛盾检不出来，filter 的详情排除词也永远命中不了，且脏条目占着「已取」名额不让重取。现在只认 jobDescription / jobDesc，并新增 jdLooksReal 正文可信度校验（摘要签名判否 + 要求正文小标题或 ≥300 字），jdFromDom / jdFromHtml / jdSet / jdOf 四处统一过闸，脏条目写不进也读不出（会被当作缺正文重新补取）；站点验证页（请稍候 / 正在验证等）计入风控冷却。v0.2.7：写入共用缓存时保留 filter（v1.3.3+）存下的工作地址字段 —— 地点黑名单现在会吃这份地址，整条覆盖会让它丢失。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/boss-zhipin-userscripts
// @supportURL   https://github.com/weishiji668/boss-zhipin-userscripts/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-consist.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/boss-zhipin-userscripts/main/boss-consist.user.js
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
(function(){
'use strict';
const VERSION='0.2.7';
const LS_CFG='bc_rules_v1';
const LS_ACT='bc_actions_v1';
const LS_COOL='bc_cool_until';
const LS_UNMARK='bc_unmarked';   // v0.2.0：右键取消标记名单 { jobId:1 }
const JD_KEY='bwf_jd_cache';          // 与 boss-filter 共用同一份详情正文缓存
const JD_MIN=30;
// v0.2.3：缓存上限原来只有「1000 条」，而单条最多 6000 字 → 理论上 600 万字符，远超 localStorage
// 的 5MB 配额。一旦写满，setItem 抛 QuotaExceededError 被 catch 吞掉 → 缓存静默失效 → 每次点按钮
// 都重拉全部详情页（请求量翻几十倍，直接撞上站点风控），而且会拖垮同源下所有脚本的落盘。
// 现在加双上限（条数 + 总字符）并在配额错误时降级重试，不再静默。
const JD_MAX_KEYS=400, JD_MAX_CHARS=1200000, JD_TTL=7*24*3600*1000;
// ===== v0.2.5 / v0.2.6 变更说明（2026-09-23）=====
// M1 v0.2.6（并入另一个会话在开源副本里做的修复）：修「右键『取消标记』点了没反应」——
//    v0.2.4 把卡片定位从「最近 li 祖先」改成「向上找第一个 isCardLike 祖先」，而 isCardLike 也会命中
//    <a class="job-card-left"> / <div class="job-card-body"> 这类内层元素，于是 clearJob() 清的是内层节点，
//    卡片上的胶囊与 data-bc-mark 依旧在（名单已落盘，看起来却像没生效）。现在改用与「隐藏 / 标记」
//    同一套 findCards() 定位（最外层、且不过大的卡片），找不到再退回 li 祖先。
// M2 v0.2.5（本会话）：修「详情正文被取成了站点的卡片摘要」（与 boss-filter v1.3.2 同一根因）
// 症状：本脚本「隐藏/标记」时批量补取的详情，被写成了站点的**卡片摘要**而不是职位正文 ——
//   「XX招聘，薪资：5-6K，地点：深圳，要求：经验不限，学历：大专，福利：…，HR刚刚在线，随时随地直接开聊。」
//   于是 filter 的「详情排除词」永远命中不了（用户反馈「详细的过滤没生效」），本脚本的正文硬要求（四六级等）也检不出来。
// 根因：jdFromHtml 的正则把 description 也算候选，而摘要字段名就是它、且通常排在正文之前 → 摘要先被匹配、长度超过 JD_MIN 就入库。
// 修法：① 只认 jobDescription / jobDesc，多候选逐个校验；② 新增 jdLooksReal() 正文可信度校验
//   （摘要签名直接判否：刚刚在线 / 随时随地直接开聊 / 薪资：…地点：…要求：… / 招聘，薪资…地点：…；再要求正文小标题或 ≥300 字）；
//   ③ jdFromDom / jdFromHtml / jdSet / jdOf 四处统一过闸，脏条目写不进、也读不出（会被当作缺正文重新补取）；
//   ④ 站点验证页（请稍候 / 正在验证 / 安全校验 / 滑动验证）计入风控冷却。
const JD_JUNK=/(刚刚在线|随时随地直接开聊)|薪资\s*[：:][^，,\n]{1,24}[，,]\s*地点\s*[：:][^，,\n]{1,24}[，,]\s*要求\s*[：:]|招聘\s*[，,]\s*薪资[\s\S]{0,60}?地点\s*[：:]/;
const JD_MARK=/职位(描述|详情|要求|诱惑)|岗位职责|任职要求|工作职责|职责描述|工作内容|岗位要求|任职资格|你将负责|主要职责|加分项|我们提供/;
function jdLooksReal(t){
  const s=String(t||'').trim();
  if(s.length<JD_MIN) return false;
  if(JD_JUNK.test(s)) return false;      // 卡片摘要 / SEO 描述：再长也不是正文
  if(JD_MARK.test(s)) return true;       // 正文常见小标题
  return s.length>=300;                  // 没有小标题的长文本
}
const EDU=['不限','大专','本科','硕士','博士'];
const DEFAULT_CERT=['四级','六级','CET','四六级','雅思','托福','日语','韩语','法语','德语','俄语','西班牙语','葡萄牙语','阿拉伯语','泰语','越南语','意大利语','小语种'];
const DEFAULTS={ certWords:DEFAULT_CERT.slice(), eduOn:true, expOn:true };
function freshCfg(){ return { certWords:DEFAULTS.certWords.slice(), eduOn:DEFAULTS.eduOn, expOn:DEFAULTS.expOn }; }
function loadCfg(){
  let o={};
  try{ o=JSON.parse(localStorage.getItem(LS_CFG)||'{}')||{}; }catch(e){ o={}; }
  const c=Object.assign(freshCfg(), o);
  if(!Array.isArray(c.certWords)) c.certWords=DEFAULT_CERT.slice();
  if(typeof c.eduOn!=='boolean') c.eduOn=true;
  if(typeof c.expOn!=='boolean') c.expOn=true;
  return c;
}
let cfg=loadCfg();
function saveCfg(){ try{ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }catch(e){} }
let actions={};
function loadActions(){ try{ actions=JSON.parse(localStorage.getItem(LS_ACT)||'{}')||{}; }catch(e){ actions={}; } }
function saveActions(){ try{ localStorage.setItem(LS_ACT, JSON.stringify(actions)); }catch(e){} }
loadActions();
let BC_UNMARKED=(()=>{ try{ return JSON.parse(localStorage.getItem(LS_UNMARK)||'{}')||{}; }catch(e){ return {}; } })();
function saveBcUnmarked(){ try{ localStorage.setItem(LS_UNMARK, JSON.stringify(BC_UNMARKED)); }catch(e){} }
function coolLeft(){ const t=parseInt(localStorage.getItem(LS_COOL)||'0',10)||0; return Math.max(0, t-Date.now()); }
function setCool(ms){ try{ localStorage.setItem(LS_COOL, String(Date.now()+ms)); }catch(e){} }
// v0.2.4：面板里所有「来自外部」的文字（配置词表、取消标记名单里的 jobId、处置原因）
// 之前是直接拼进 innerHTML 的。词表是你自己填的、jobId 来自 URL —— 万一内容里带 < > & "
// 就会破坏面板结构（最坏情况下注入一段脚本）。统一转义后再拼。
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cleanWords(s){
  return String(s||'').split(/[\n,，]/).map(x=>x.trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
}

// ---------- 卡片 ----------
function jobIdFromHref(u){ const m=String(u||'').match(/job[_\-]?detail\/([^.\/?#]+)/i); return m?m[1]:''; }
function isCardLike(el){
  try{
    if(el.tagName==='LI') return true;
    return /job-card|job-item|card-wrapper|job-list-item/i.test(String(el.className||''));
  }catch(e){ return false; }
}
function isTooBig(el){
  try{
    if(el.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]').length>2) return true;
    const r=el.getBoundingClientRect();
    if(r.height>window.innerHeight*0.6) return true;
    if(r.width>window.innerWidth*0.95&&r.height>240) return true;
  }catch(e){}
  return false;
}
function findCards(){
  const out=[], seen=new Set(), big=new WeakMap();
  let links=[];
  try{ links=Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]')); }catch(e){}
  links.forEach(a=>{
    let card=null, cur=a;
    for(let i=0;i<6&&cur;i++){
      cur=cur.parentElement;
      if(!cur||cur===document.body||cur===document.documentElement) break;
      if(isCardLike(cur)){
        let b=big.get(cur);
        if(b===undefined){ b=isTooBig(cur); big.set(cur,b); }
        if(!b) card=cur;
      }
    }
    if(!card||seen.has(card)) return;
    seen.add(card);
    const href=a.getAttribute('href')||a.href||'';
    out.push({card, jobId:(card.getAttribute&&card.getAttribute('data-jobid'))||jobIdFromHref(href), href:String(href)});
  });
  return out;
}
function chipsOf(card){
  try{
    return Array.prototype.slice.call(card.querySelectorAll('ul[class*="tag"] li,ol[class*="tag"] li,[class*="tag-list"] li'))
      .map(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  }catch(e){ return []; }
}

// ---------- 详情正文缓存（与 filter 共用）----------
function jdCache(){ try{ return JSON.parse(localStorage.getItem(JD_KEY)||'{}')||{}; }catch(e){ return {}; } }
function jdOf(jobId){
  const c=jdCache()[String(jobId||'')];
  if(!c||!c.jd) return '';
  if((Date.now()-(c.ts||0))>7*24*3600*1000) return '';
  const t=String(c.jd);
  // v0.2.5：不可信的条目（卡片摘要等）当作「没有正文」—— 不参与判定，也会重新进入补取队列
  return jdLooksReal(t)?t:'';
}
function jdSet(jobId,jd){
  const c=jdCache();
  const nowTs=Date.now();
  // v0.2.3：写前先按 TTL 清死条目（原读端 TTL 只挡读取，过期条目一直占着容量）
  // v0.2.5：顺手清掉「不是正文」的脏条目（站点卡片摘要等）—— 它们占着名额，真正文就永远补不进来
  try{ Object.keys(c).forEach(k=>{ if(nowTs-(c[k].ts||0)>JD_TTL||!jdLooksReal(c[k].jd)) delete c[k]; }); }catch(e){}
  const s=String(jd||'').slice(0,3000);      // 3000 字对判定足够，比 6000 省一半
  if(!jdLooksReal(s)) return;                // v0.2.5：不是正文不写盘（与 filter 同一道闸）
  // v0.2.7：写入时保留 filter 存下的「工作地址」字段（v1.3.3 起地点黑名单会用）
  const prev=c[String(jobId)]||{};
  c[String(jobId)]={ts:nowTs, jd:s};
  if(prev.addr) c[String(jobId)].addr=prev.addr;
  // 双上限：条数 + 总字符，都从最旧的开始淘汰
  let keys=Object.keys(c).sort((a,b)=>(c[a].ts||0)-(c[b].ts||0));
  let total=keys.reduce((s,k)=>s+String((c[k]||{}).jd||'').length,0);
  while(keys.length&&(keys.length>JD_MAX_KEYS||total>JD_MAX_CHARS)){ const k=keys.shift(); total-=String((c[k]||{}).jd||'').length; delete c[k]; }
  try{ localStorage.setItem(JD_KEY, JSON.stringify(c)); }
  catch(e){
    // 配额错误不再静默：淘汰一半后重试一次，仍失败就清空缓存并告知用户
    try{
      keys=Object.keys(c).sort((a,b)=>(c[a].ts||0)-(c[b].ts||0));
      keys.slice(0,Math.ceil(keys.length/2)).forEach(k=>{ delete c[k]; });
      localStorage.setItem(JD_KEY, JSON.stringify(c));
    }catch(e2){
      try{ localStorage.removeItem(JD_KEY); }catch(e3){}
      setStatus('本机存储已满，详情缓存已重置（其它脚本的落盘可能也受影响）');
    }
  }
}
function jdFromDom(doc){
  const sels=['.job-sec-text','[class*="job-sec-text"]','.job-detail-section .text','.detail-content .text','.job-detail .text'];
  for(const s of sels){
    try{
      const el=doc.querySelector(s);
      if(el){ const t=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim(); if(jdLooksReal(t)) return t.slice(0,6000); }   // v0.2.5：取到的必须像正文
    }catch(e){}
  }
  return '';
}
function jdFromHtml(html){
  const t=String(html||'');
  // v0.2.5：只认正文键（不收 description —— 那是卡片摘要/SEO 描述，字段名就叫它，且通常排在正文前面）
  const cands=[];
  try{
    const re=/"job(?:Description|Desc)"\s*:\s*"((?:[^"\\]|\\.){20,})"/g;
    let m, n=0;
    while((m=re.exec(t))&&n<8){ n++; try{ cands.push(JSON.parse('"'+m[1]+'"')); }catch(e){} }
  }catch(e){}
  for(const c of cands){ if(jdLooksReal(c)) return String(c).slice(0,6000); }
  try{ return jdFromDom(new DOMParser().parseFromString(t,'text/html')); }catch(e){ return ''; }
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function fetchOneDetail(href,jobId){
  const url=href||('/job_detail/'+encodeURIComponent(jobId)+'.html');
  const res=await fetch(url,{credentials:'same-origin'});
  // v0.2.3：原来只把 HTTP 429 当限流。BOSS 实际的风控响应是 403 / 503，或 200 + 滑块验证页
  // （同源 fetch 会跟随重定向，最终 res.ok===true 但正文是验证页）—— 这两种原来都不触发冷却，
  // 于是限流后剩下的请求照发。这里扩大识别面。
  if(!res||!res.ok) return {ok:false, why:'HTTP '+(res?res.status:'?'), cool:!!res&&[403,429,503].indexOf(res.status)>=0};
  const html=await res.text();
  // v0.2.5：补上验证页的真实文案（实测未带 cookie 拉详情页会返回「请稍候 - BOSS直聘」）
  if(/操作过于频繁|安全验证|访问过于频繁|verify-slider|security-check|请完成验证|异常流量|环境存在异常|请稍候|请稍后|正在验证|安全校验|滑动验证/.test(html))
    return {ok:false, why:'站点限流/验证页', cool:true};
  if(html.length<2000) return {ok:false, why:'响应过短（疑似被拦）', cool:true};
  const jd=jdFromHtml(html);
  if(!jd) return {ok:false, why:'没读到职位描述'};
  jdSet(jobId,jd);
  return {ok:true};
}

// ---------- 判定 ----------
function eduIdx(txt){
  const t=String(txt||'');
  if(/学历不限|不限学历/.test(t)) return 0;
  let idx=-1;
  for(let i=EDU.length-1;i>=1;i--){ if(t.indexOf(EDU[i])>=0){ idx=i; break; } }
  return idx;
}
function chipEdu(chips){
  for(const c of chips){ const i=eduIdx(c); if(i>=0) return {idx:i, text:c}; }
  return null;
}
function chipExp(chips){
  for(const c of chips){
    if(/经验不限|不限经验/.test(c)) return {min:0, max:99, text:c, none:true};
    const m=c.match(/(\d{1,2})\s*[-~至]\s*(\d{1,2})\s*年/);
    if(m) return {min:parseInt(m[1],10), max:parseInt(m[2],10), text:c};
  }
  return null;
}
function jdExpMin(jd){
  const t=String(jd||'');
  let m=t.match(/(\d{1,2})\s*[-~至]\s*(\d{1,2})\s*年[^。\n]{0,12}(?:经验|工作经验)/);
  if(m) return parseInt(m[1],10);
  m=t.match(/(\d{1,2})\s*年以上[^。\n]{0,12}(?:经验|工作经验)/);
  if(m) return parseInt(m[1],10);
  return 0;
}
function decide(jobId,chips,jd){
  const reasons=[];
  const je=eduIdx(jd);
  const ce=chipEdu(chips);
  if(cfg.eduOn&&ce&&je>ce.idx){ reasons.push('学历矛盾：卡片'+ce.text+' / 正文'+EDU[je]+'及以上'); }
  const cx=chipExp(chips);
  const jx=jdExpMin(jd);
  if(cfg.expOn&&cx&&jx>=1){
    if(cx.none) reasons.push('经验矛盾：卡片'+cx.text+' / 正文要求 '+jx+' 年起');
    else if(jx>cx.max) reasons.push('经验矛盾：卡片'+cx.text+' / 正文要求 '+jx+' 年起');
  }
  const hits=[];
  for(const w of cfg.certWords){ if(jd.indexOf(w)>=0&&hits.indexOf(w)<0) hits.push(w); }
  if(hits.length) reasons.push('正文硬要求：'+hits.join('、'));
  return {reasons, jd:!!jd};
}

// ---------- 动作（协同协议 v1：data-bc-hide / data-bc-mark）----------
function otherHider(card){ return card.hasAttribute('data-bwf-hide')||card.hasAttribute('data-bt-focus')||card.hasAttribute('data-bt-hide'); }
function hideJob(card,reason){
  card.setAttribute('data-bc-hide','1');
  card.setAttribute('data-bc-reason',reason);
  card.style.display='none';
}
function markJob(card,reason){
  card.setAttribute('data-bc-mark','1');
  card.setAttribute('data-bc-reason',reason);
  try{
    let el=card.querySelector('.cs-tag');
    if(!el){
      if(getComputedStyle(card).position==='static') card.style.position='relative';
      el=document.createElement('div');
      el.className='cs-tag';
      card.appendChild(el);
    }
    const short=String(reason).split('；')[0].slice(0,18);
    if(el.textContent!==short) el.textContent=short;
    if(el.title!==reason) el.title=reason;
  }catch(e){}
}
function clearJob(card){
  const had=card.hasAttribute('data-bc-hide');
  card.removeAttribute('data-bc-hide');
  card.removeAttribute('data-bc-mark');
  card.removeAttribute('data-bc-reason');
  try{ const el=card.querySelector('.cs-tag'); if(el) el.remove(); }catch(e){}
  if(had&&!otherHider(card)) card.style.display='';
}

// ---------- 批量跑 ----------
let busy=false, stat={hit:0,total:0};
function setStatus(t){ try{ const el=document.getElementById('csCount'); if(el&&el.textContent!==t) el.textContent=t; }catch(e){} }
async function runBatch(mode, onlyKey){
  if(busy) return;
  const cool=coolLeft();
  if(cool>0){ setStatus('冷却中 '+Math.ceil(cool/60000)+' 分钟（站点限流）'); return; }
  busy=true;
  try{
    // v0.2.4：onlyKey 非空时只处理这一张卡。右键「恢复标记」原来调的是 runBatch('mark')，
    // 会把整页卡片全部重新体检一遍 —— 你只想恢复刚取消的那一张，结果后台串行补取了
    // 最多 40 个详情页、还给整页重新打了一遍标。
    const only=onlyKey?String(onlyKey):'';
    const cards=only?findCards().filter(it=>String(it.jobId||'')===only):findCards();
    stat={hit:0,total:cards.length};
    let done=0, cooled=false, fetched=0, streak=0;
    // v0.2.3：单次运行的请求硬上限。原来扫的是当前 DOM 里**所有** job_detail 链接，而搜索页无限滚动
    // → 滚到 300 张卡就点「标记」会串行发出最多 300 个整页请求，持续 4~6 分钟，是极强的爬虫特征。
    const MAX_FETCH=40;
    for(const it of cards){
      setStatus('处理中 '+(done+1)+'/'+cards.length);
      const jobId=it.jobId;
      let jd=jobId?jdOf(jobId):'';
      if(!jd&&jobId){
        if(fetched>=MAX_FETCH){ setStatus('本次已达 '+MAX_FETCH+' 个详情上限，剩下的请再点一次（命中 '+stat.hit+' / '+stat.total+'）'); break; }
        fetched++;
        try{
          const r=await fetchOneDetail(it.href, jobId);
          if(r.cool){ setCool(15*60*1000); cooled=true; setStatus('站点限流，冷却 15 分钟'); break; }
          if(!r.ok){                                   // v0.2.3：连续失败即停（原来失败只计数、循环照跑）
            if(++streak>=3){ setCool(5*60*1000); cooled=true; setStatus('连续 3 个详情取不到（'+(r.why||'')+'），已停并冷却 5 分钟'); break; }
          }else streak=0;
          jd=r.ok?jdOf(jobId):'';
        }catch(e){ jd=''; }
        await sleep(600+Math.random()*600);
      }
      done++;
      if(!jd){ continue; }                       // 没正文就不判（不打未核验标记，用户口径）
      const d=decide(jobId, chipsOf(it.card), jd);
      const key=String(jobId);
      if(BC_UNMARKED[key]){ clearJob(it.card); if(actions[key]){ delete actions[key]; } continue; }   // v0.2.3：去掉重复的 done++（原来进度会显示成 35/30）
      if(d.reasons.length){
        stat.hit++;
        const reason=d.reasons.join('；');
        if(mode==='hide') hideJob(it.card, reason); else markJob(it.card, reason);
        actions[key]={mode, reason, ts:Date.now()};
      }else if(actions[key]){
        clearJob(it.card);
        delete actions[key];
      }
    }
    saveActions();
    if(!cooled) setStatus('一致性 命中 '+stat.hit+' / '+stat.total+(mode==='hide'?'（已隐藏）':'（已标记）'));
    renderPanelStat();
  }catch(e){}finally{ busy=false; }
}
function reapply(){
  const cards=findCards();
  let n=0;
  cards.forEach(it=>{
    const a=actions[String(it.jobId||'')];
    if(!a||BC_UNMARKED[String(it.jobId||'')]) return;
    if(a.mode==='hide') hideJob(it.card, a.reason||''); else markJob(it.card, a.reason||'');
    n++;
  });
  if(n) setStatus('一致性 已恢复 '+n+' 条处置');
  return n;
}
function clearAll(){
  findCards().forEach(it=>clearJob(it.card));
  actions={};
  saveActions();
  // v0.2.4：原先「清除」只清 actions，右键「取消标记」的名单一条不动 —— 名单里的岗位
  // 之后永远不会再被打标/隐藏，面板上却看不到任何解释（名单只在单独一个按钮里）。一并清掉。
  BC_UNMARKED={};
  saveBcUnmarked();
  setStatus('一致性 已清除（含取消标记名单）');
  renderPanelStat();
}

// ---------- UI ----------
let ui=null;
const LS_UI='bc_ui';
function loadUiPos(){ try{ return JSON.parse(localStorage.getItem(LS_UI)||'null'); }catch(e){ return null; } }
function saveUiPos(p){ try{ localStorage.setItem(LS_UI, JSON.stringify(p)); }catch(e){} }
function applyWrapPos(wrap){
  const p=loadUiPos();
  if(!p||typeof p.x!=='number'||typeof p.y!=='number') return;
  const x=Math.max(0,Math.min(p.x,window.innerWidth-80));
  const y=Math.max(0,Math.min(p.y,window.innerHeight-40));
  wrap.style.right='auto'; wrap.style.bottom='auto';
  wrap.style.left=x+'px'; wrap.style.top=y+'px';
}
const LS_UI_PANEL='bc_ui_panel';
function makePanelDraggable(handle,panel){
  if(!handle||!panel) return;
  handle.addEventListener('pointerdown',(e)=>{
    if(e.target&&e.closest&&e.closest('button,textarea,input')) return;
    const r=panel.getBoundingClientRect();
    const dx=e.clientX-r.left, dy=e.clientY-r.top;
    const move=(ev)=>{
      let x=ev.clientX-dx, y=ev.clientY-dy;
      x=Math.max(0,Math.min(x,window.innerWidth-120));
      y=Math.max(0,Math.min(y,window.innerHeight-60));
      panel.style.right='auto'; panel.style.bottom='auto';
      panel.style.left=x+'px'; panel.style.top=y+'px';
    };
    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      const r2=panel.getBoundingClientRect();
      try{ localStorage.setItem(LS_UI_PANEL, JSON.stringify({x:r2.left,y:r2.top})); }catch(err){}
    };
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
  });
  try{
    const p=JSON.parse(localStorage.getItem(LS_UI_PANEL)||'null');
    if(p&&typeof p.x==='number'&&typeof p.y==='number'){
      panel.style.right='auto'; panel.style.bottom='auto';
      panel.style.left=Math.max(0,Math.min(p.x,window.innerWidth-120))+'px';
      panel.style.top=Math.max(0,Math.min(p.y,window.innerHeight-60))+'px';
    }
  }catch(e){}
}
function makeChipDraggable(chip,wrap){
  chip.addEventListener('pointerdown',(e)=>{
    const t=e.target;
    if(t&&t.closest&&t.closest('button')) return;   // 按钮上不触发拖动
    const r=wrap.getBoundingClientRect();
    const dx=e.clientX-r.left, dy=e.clientY-r.top;
    const move=(ev)=>{
      let x=ev.clientX-dx, y=ev.clientY-dy;
      x=Math.max(0,Math.min(x,window.innerWidth-80));
      y=Math.max(0,Math.min(y,window.innerHeight-40));
      wrap.style.right='auto'; wrap.style.bottom='auto';
      wrap.style.left=x+'px'; wrap.style.top=y+'px';
    };
    const up=(ev)=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      const r2=wrap.getBoundingClientRect();
      saveUiPos({x:r2.left,y:r2.top});
    };
    try{ chip.setPointerCapture(e.pointerId); }catch(err){}
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
  });
}
function isJobPage(){ return /\/web\/geek\/(job|search|recommend)|job_detail/i.test(location.pathname||''); }   // v0.1.1：一致性服务职位卡片，聊天页不挂 UI
function ensureUi(){
  if(!isJobPage()) return null;
  if(ui&&document.body.contains(ui.wrap)) return ui;
  const style=document.createElement('style');
  style.textContent=
    '.cs-wrap{position:fixed;right:18px;bottom:212px;z-index:2147482900;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430;--cs:#0ea5e9}'+
    '.cs-chip{display:flex;align-items:center;gap:8px;background:#111827;color:#fff;border-radius:999px;padding:6px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:move;user-select:none;touch-action:none}'+
    '.cs-dot{width:8px;height:8px;border-radius:50%;background:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.18);flex:0 0 auto}'+
    '.cs-btn{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:999px;padding:3px 11px;cursor:pointer;font-size:12px;font-family:inherit}'+
    '.cs-btn:hover{background:rgba(255,255,255,.14)}'+
    '.cs-btn.cs-hide{background:rgba(239,68,68,.85);border-color:#ef4444}'+
    '.cs-btn.cs-mark{background:rgba(14,165,233,.85);border-color:#0ea5e9}'+
    '.cs-panel{display:none;position:fixed;right:18px;bottom:236px;width:440px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;background:#fff;color:#1f2430;border:1px solid #e6ebf3;border-radius:16px;box-shadow:0 18px 50px rgba(20,30,60,.22);padding:12px 14px}'+
    '.cs-tag{position:absolute;top:34px;left:6px;   /* v0.2.1：左上第一排让给 watcher 的盯岗/盯司按钮 */background:#0ea5e9;color:#fff;font-size:11px;line-height:1.5;padding:1px 6px;border-radius:6px;z-index:5;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.2);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
    '.cs-row{margin:8px 0}'+
    '.cs-drag{cursor:move;user-select:none;touch-action:none}'+
    '.cs-hint{color:#7a8396;font-size:11px;line-height:1.6}'+
    '.cs-menu{position:fixed;z-index:2147482950;min-width:180px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:4px;box-shadow:0 12px 32px rgba(0,0,0,.35)}'+
    '.cs-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit}'+
    '.cs-menu button:hover{background:rgba(255,255,255,.14)}';
  const wrap=document.createElement('div');
  wrap.className='cs-wrap';
  wrap.innerHTML=
    '<div class="cs-chip"><span class="cs-dot"></span><b id="csCount">一致性 · 待处理</b>'+
    '<button class="cs-btn cs-hide" id="csHide">隐藏</button>'+
    '<button class="cs-btn cs-mark" id="csMark">标记</button>'+
    '<button class="cs-btn" id="csRules">设置</button></div>'+
    '<div class="cs-panel" id="csPanel"></div>';
  document.body.appendChild(style);
  document.body.appendChild(wrap);
  applyWrapPos(wrap);
  makeChipDraggable(wrap.querySelector('.cs-chip'),wrap);
  ui={wrap, panel:wrap.querySelector('#csPanel')};
  wrap.querySelector('#csHide').addEventListener('click',()=>{ runBatch('hide'); });
  wrap.querySelector('#csMark').addEventListener('click',()=>{ runBatch('mark'); });
  wrap.querySelector('#csRules').addEventListener('click',()=>{
    const p=ui.panel;
    const open=p.style.display==='block';
    p.style.display=open?'none':'block';
    if(!open) renderPanel();
  });
  return ui;
}
function renderActList(panel){
  try{
    const box=panel.querySelector('#csActList');
    const st=panel.querySelector('#csActStat');
    if(!box) return;
    const keys=Object.keys(actions||{});
    if(st) st.textContent='（'+keys.length+' 条；被隐藏的卡在这里取消标记）';
    if(!keys.length){ box.textContent='暂无'; return; }
    box.innerHTML=keys.slice(0,30).map(k=>{
      const a=actions[k]||{};
      return '<div style="margin:2px 0"><button class="cs-btn" data-un="'+esc(k)+'" style="color:#b91c1c;border-color:#fca5a5;padding:1px 8px">取消标记</button> <span>'+esc(k)+' · '+(a.mode==='hide'?'隐藏':'标记')+' · '+esc(String(a.reason||'').slice(0,24))+'</span></div>';
    }).join('');
    box.querySelectorAll('button[data-un]').forEach(b=>b.addEventListener('click',()=>{
      const k=b.getAttribute('data-un');
      BC_UNMARKED[k]=1; saveBcUnmarked();
      delete actions[k]; saveActions();
      findCards().forEach(it=>{ if(String(it.jobId)===k) clearJob(it.card); });
      renderPanel();
    }));
  }catch(e){}
}
function renderPanelStat(){
  try{ const el=document.getElementById('csStat'); if(el) el.textContent='本页命中 '+stat.hit+' / 共 '+stat.total+' · 落盘处置 '+Object.keys(actions).length+' 条'; }catch(e){}
}
function renderPanel(){
  const u=ensureUi();
  if(!u) return;
  u.panel.innerHTML=
    '<div class="cs-row cs-drag" id="csDrag" title="按住这里拖动面板"><b>一致性体检 v'+VERSION+'</b>　<span class="cs-hint" id="csStat"></span></div>'+
    '<div class="cs-row"><label><input type="checkbox" id="csEdu" '+(cfg.eduOn?'checked':'')+'> 学历矛盾（卡片 chip vs 正文）</label>　'+
    '<label><input type="checkbox" id="csExp" '+(cfg.expOn?'checked':'')+'> 经验矛盾</label></div>'+
    '<div class="cs-row">正文硬要求词（一行一个）<br><textarea id="csCert" style="width:100%;height:88px">'+esc(cfg.certWords.join('\n'))+'</textarea></div>'+
    '<div class="cs-row"><b>手动对比（卡片 vs 正文）</b><div class="cs-hint">第一框贴卡片内容，第二框贴详情正文：</div>'+
    '<textarea id="csManualCard" style="width:100%;height:64px" placeholder="卡片：大专 / 经验不限 / 公司名 / 地点…"></textarea>'+
    '<textarea id="csManualJd" style="width:100%;height:88px" placeholder="正文：本科及以上学历、1-3 年工作经验、英语四六级…"></textarea>'+
    '<div class="cs-row"><button class="cs-btn" id="csManualRun" style="color:#1f2430;border-color:#cbd5e1">对比这两框</button>　<span class="cs-hint" id="csManualOut"></span></div></div>'+
    '<div class="cs-row"><b>已处置清单</b><span class="cs-hint" id="csActStat"></span><div id="csActList" class="cs-hint"></div></div>'+
    '<div class="cs-row"><button class="cs-btn" id="csSave" style="color:#1f2430;border-color:#cbd5e1">保存</button>　'+
    '<button class="cs-btn" id="csClear" style="color:#b91c1c;border-color:#fca5a5">清除本脚本的隐藏/标记</button>　'+
    '<button class="cs-btn" id="csClearUnmark" style="color:#1f2430;border-color:#cbd5e1">清空取消标记名单（'+Object.keys(BC_UNMARKED).length+'）</button></div>'+
    '<div class="cs-hint">状态条可拖动：按住黑条拖到不挡的位置，位置存本机。</div>'+
    '<div class="cs-hint">正文来源：与「页面过滤」共用本机缓存 bwf_jd_cache；缺的点「隐藏/标记」时按页面上有多少批量补取多少（串行 0.6~1.2 秒间隔，无每日额度；站点限流自动冷却 15 分钟）。没取到正文的卡不判、也不打「未核验」标记。隐藏走协同协议 data-bc-hide，不会与 filter / tag 互撤。</div>';
  renderPanelStat();
  u.panel.querySelector('#csSave').addEventListener('click',()=>{
    cfg.eduOn=!!u.panel.querySelector('#csEdu').checked;
    cfg.expOn=!!u.panel.querySelector('#csExp').checked;
    cfg.certWords=cleanWords(u.panel.querySelector('#csCert').value);
    saveCfg();
    renderPanel();
  });
  u.panel.querySelector('#csClear').addEventListener('click',()=>{ clearAll(); });
  const cu=u.panel.querySelector('#csClearUnmark');
  if(cu) cu.addEventListener('click',()=>{ BC_UNMARKED={}; saveBcUnmarked(); reapply(); renderPanel(); });
  renderActList(u.panel);
  makePanelDraggable(u.panel.querySelector('#csDrag'), u.panel);
  const mr=u.panel.querySelector('#csManualRun');
  if(mr) mr.addEventListener('click',()=>{
    const cardTxt=(u.panel.querySelector('#csManualCard')||{}).value||'';
    const jdTxt=(u.panel.querySelector('#csManualJd')||{}).value||'';
    const chips=String(cardTxt).split(/[\n,，;；\s]+/).map(x=>x.trim()).filter(x=>x.length>=2);
    const d=decide('manual', chips, jdTxt);
    const out=u.panel.querySelector('#csManualOut');
    if(out) out.textContent=d.reasons.length?('命中：'+d.reasons.join('；')):'未检出矛盾/硬要求';
  });
}
// ---------- v0.2.0：右键「取消标记 / 恢复标记」----------
let csMenuEl=null;
function closeCsMenu(){ if(csMenuEl){ csMenuEl.remove(); csMenuEl=null; } }
function showCsMenu(x,y,key,marked,unmarked){
  closeCsMenu();
  csMenuEl=document.createElement('div');
  csMenuEl.className='cs-menu';
  csMenuEl.innerHTML=(marked?'<button data-m="unmark">取消标记（复核误标：这张不再打标/隐藏）</button>':'')+
    (unmarked?'<button data-m="remark">恢复标记</button>':'')+
    '<button data-m="close">关闭</button>';
  document.body.appendChild(csMenuEl);
  csMenuEl.style.left=Math.max(0,Math.min(x,window.innerWidth-200))+'px';
  csMenuEl.style.top=Math.max(0,Math.min(y,window.innerHeight-100))+'px';
  csMenuEl.addEventListener('click',(e)=>{
    const b=e.target&&e.target.closest?e.target.closest('button[data-m]'):null;
    if(!b) return;
    const m=b.getAttribute('data-m');
    if(m==='unmark'){
      BC_UNMARKED[key]=1; saveBcUnmarked();
      // v0.2.6（并入）：卡片定位改用 findCards()（与「隐藏 / 标记」两条路径同一套逻辑）。
      // v0.2.4 那版是「从链接向上找第一个 isCardLike 的祖先」，而 isCardLike 也会命中
      // <a class="job-card-left"> / <div class="job-card-body"> 这类内层元素 —— 于是 clearJob()
      // 清的是内层节点，卡片上的胶囊与 data-bc-mark 都没被清掉，用户看到的是「点了没反应」。
      // findCards 取的是「最外层、且不过大的卡片」，与批量跑完全一致。
      let target=null;
      try{ const hit=findCards().find(x=>String(x.jobId||'')===String(key)); if(hit) target=hit.card; }catch(e){}
      if(!target){   // 兜底：找不到就用链接的 li 祖先
        try{
          const links=document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]');
          for(let i=0;i<links.length;i++){
            if(jobIdFromHref(links[i].getAttribute('href')||links[i].href||'')===key){ target=links[i].closest('li')||links[i]; break; }
          }
        }catch(e){}
      }
      if(target) clearJob(target);
      delete actions[key]; saveActions();
    }
    else if(m==='remark'){ delete BC_UNMARKED[key]; saveBcUnmarked(); runBatch('mark', key); }   // v0.2.4：只重跑这一张
    closeCsMenu();
  });
}
document.addEventListener('mousedown',(ev)=>{ if(csMenuEl&&!(csMenuEl===ev.target||(csMenuEl.contains&&csMenuEl.contains(ev.target)))) closeCsMenu(); },true);
document.addEventListener('contextmenu',(ev)=>{
  try{
    // v0.2.4：原来这两处（右键接管 + 滚动重扫）在**所有** zhipin 页面都生效 ——
    // 聊天页/公司页右键也会被拦下来（只要那个 jobId 恰好在取消标记名单里），
    // 滚动时也会在无关页面反复全量扫描卡片。都收进 isJobPage() 里。
    if(!isJobPage()) return;
    const card=ev.target&&ev.target.closest?ev.target.closest('li.job-card-wrapper,[class*="job-card"]'):null;
    if(!card||!document.body.contains(card)) return;
    if(card.closest&&card.closest('.cs-wrap')) return;
    const a=card.querySelector('a[href*="job_detail"],a[href*="job-detail"]');
    const m=String(a&&a.getAttribute('href')||'').match(/job[_\-]?detail\/([^.\/?#]+)/i);
    const key=m?m[1]:'';
    if(!key) return;
    const cap=ev.target&&ev.target.closest?ev.target.closest('.cs-tag'):null;   // v0.2.1：右键自己的胶囊=管理标记
    const marked=!!(card.getAttribute('data-bc-mark')||card.getAttribute('data-bc-hide'));
    const un=!!BC_UNMARKED[key];
    if(cap&&marked){ ev.preventDefault(); ev.stopPropagation(); showCsMenu(ev.clientX,ev.clientY,key,true,un); return; }
    if(!un) return;   // 卡片本体右键不拦
    ev.preventDefault(); ev.stopPropagation();
    showCsMenu(ev.clientX,ev.clientY,key,false,true);
  }catch(e){}
},true);
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ ensureUi(); reapply(); },{once:true});
else { ensureUi(); reapply(); }
window.addEventListener('scroll',()=>{ if(!busy&&isJobPage()) reapply(); },{passive:true});
})();
