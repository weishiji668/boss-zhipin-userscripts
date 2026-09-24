// ==UserScript==
// @name         BOSS直聘 · 命中打标签（只标记，不隐藏）
// @namespace    local.boss-tag
// @version      1.2.6
// @description  在职位列表页给「命中规则」的岗位卡片打标签——默认只标记、绝不改站点数据；状态条「隐藏未命中」配合人工复核：先打标（职位名/公司名/地区 正向规则）→ 浏览复核、右键取消误标 → 点按钮把没命中的藏起来，剩下的就是你要投的。规则集：地区（外地）/ 关键词 / 公司名 / 起步月薪上下限。面板可拖动（位置存本机，刷新后还在）；规则改完 800ms 自动保存并立即重扫。配合「页面过滤」「一键投递」：命中卡片打 data-bt-hit / data-bt-tags，按 jobId 存 bt_hits，暴露 window.__bossTagQuery 只读查询。默认不发任何请求；薪资有字体反爬，优先用接口/组件明文，拿不到就跳过判断。v1.0.1：修「面板/标签文字每轮重写又喂回 MutationObserver，形成约 3 轮/秒的自激空转」（改为值未变不写） + 「恢复默认」被旧输入回写导致默认词表被清空、薪资阈值没真恢复 + 薪资阈值框不触发 800ms 自动保存（面板文案是假承诺） + 关标签开关会清空 bt_hits 名单（改为只清 DOM 标记） + 多标签页整键覆盖互相吞掉命中记录（改为写前合并、删除留墓碑） + 无ID卡片 __bossTagQuery 返回 hit:false 与 data-bt-hit 自相矛盾 + 面板存过位置后视口变小就滚不回来（按当前视口钳制） + chip 与面板的开关文案/勾选不同步（按钮文案与行为相反） + 触屏拖动面板遇 pointercancel 后监听器残留、面板乱跑； 另做 findCards 同容器重复测量去重与命中记录等值免写盘。v1.1.0：地区规则改只认卡片底行地点文字（不再吃整卡文字，JD/标签里的城市名不再误判）；新增「家乡城市」词表，底行地点命中家乡即不标外地（用户口径「命中深圳就排除上海」）；状态条新增「隐藏命中」按钮；v1.2.0 按用户流水线口径再定版：命中脚本=**正向标记**（职位名/公司名/地区白名单），「隐藏未命中」按钮藏没命中的卡；排除类词（外地城市/培训费/薪资阈值）一次性自动迁移到过滤脚本（地点黑名单/月薪上下限），本地区块改叫「地区（命中）」；新增右键「取消标记/恢复标记」（取消名单落盘 bt_unmarked，复核误标用）；隐藏协同协议 v1：data-bt-focus / data-bwf-hide / data-bc-hide 三个标记各脚本只撤自己的、恢复显示前先看他人标记；地点提取优先 DOM 选择器，退回落解析 innerText 末行（过滤自绘胶囊行）。v1.2.3：地区表改回**正向白名单**（写想去的城市，子串匹配：深圳 命中 深圳·福田区·梅林）；移除 v1.2.2 的「负向命中直接隐藏」与面板「被隐藏清单」（不想去的城市归过滤脚本的地点黑名单）；启动时清理 v1.2.2 遗留的 data-bt-hide 隐藏。v1.2.4：自检提示（页面有卡片容器但识别 0 张时明示一次）；过滤条存在时本条停靠其上、视觉合成一组（不再两条黑 pill 并排像重复）。v1.2.5：右键菜单真的能用了（标签原来被 pointer-events:none 挡着，鼠标根本点不到，「取消标记/恢复标记」等于不存在、取消名单永远空 —— 改成可点，并给卡片右上角补了一个兜底热区）；「恢复默认」不再把地区表恢复成 14 个城市的**负向**黑名单（那会让「隐藏未命中」把本地岗位全藏掉、外地岗位反而标成命中），也不再清空你自己填的关键词/公司名/薪资上下限；「隐藏未命中」开着但一条正向规则都没有时，横幅明示一次、不静默藏空整页；「清空取消标记名单」与右键取消标记改为写盘前先合并其它标签页的名单并给删除留墓碑（原来整键覆盖，两个标签页互相把对方刚取消的标记复活）。 v1.2.6（文案统一·测试版）：小条按钮「规则」改「设置」；面板底部补「打标＝本地画角标、不隐藏、不改站点数据」的备注与用例（岗位卡片归本脚本，聊天会话归聊天体检脚本）。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/jiajianchengchu-boss
// @supportURL   https://github.com/weishiji668/jiajianchengchu-boss/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-tag.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-tag.user.js
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

// ===== v1.0.0 变更说明（2026-09-21，新脚本）=====
// 用户口述需求：官方筛选会漏出「上海/北京/宁波」这类外地岗位，和「关键词命中就隐藏」在逻辑上互斥
//（一个想藏、一个想标），所以单独做一个「命中脚本」：命中规则只打标签，绝不隐藏。
// 和另外两个脚本的配合约定（任务书第 3 节，filter/deliver 那边会对接）：
//   ① 命中卡片 DOM 打 data-bt-hit="1" 和 data-bt-tags="外地,培训费"（逗号分隔的命中词）；
//   ② 按 jobId 存一份名单到 localStorage 键 bt_hits：{ "<jobId>": {tags:[...], at:时间戳} }，
//      jobId 优先取卡片上的 data-jobid / data-lid，取不到就用「公司名|岗位名」的哈希，并在标签里注明「无ID」；
//   ③ window.__bossTagQuery = (jobIdOrKey) => ({hit:true|false, tags:[...]}) 只读查询，给其它脚本用；
//   ④ 不改 filter 的隐藏逻辑；filter 已经隐藏的卡片跳过，不再打标签。
// 设计口径：
//   - 只标记不隐藏：脚本从不对卡片设置 display:none / 不改站点任何数据；标签是卡片右上角一个琥珀色小胶囊，
//     悬停显示命中的完整词。
//   - 面板可拖动：按住面板顶栏拖动，位置存 localStorage 键 bt_ui，刷新后还在（这是用户明确抱怨过的点）。
//   - 薪资字体反爬：和 filter 一样，薪资优先用接口/Vue 明文；DOM 里是私用区乱码就跳过薪资判断
//     （宁可不判，也不判错）。
//   - 面板重绘走 panelSnapshot/panelRestore，不冲掉用户正在填的输入。

(function(){
'use strict';

const VERSION='1.2.6';
const LS_KEY='bt_rules_v1';   // 规则配置
const LS_HITS='bt_hits';      // 命中名单（按 jobId）：{ [jobId]: {tags:[...], at:时间戳} }
const LS_UI='bt_ui';          // 面板位置：{ panel:{x,y} }
const LS_UNMARK='bt_unmarked';  // v1.2.0：右键取消标记的名单 { key:1 }（复核误标用，恢复标记可移除）
const LS_MIG='bt_migrated_v120';
const HITS_MAX=3000;          // 命中名单上限（只增不减会白占内存，超了按时间淘汰最老的）

// 默认规则种子（面板里可改）
// v1.2.5：默认表改成**正向**语义（想去的城市）。
// v1.2.3 起地区已是正向白名单（写想去的城市），但这张默认表还是 v1.2.2 的负向表（不想去的城市）——
// 点「恢复默认」会把这 14 个外地城市变成「想去的」，再开「隐藏未命中」就是：
// 本市岗位全被藏光、外地岗位被打上「命中」。默认留空，让你自己写想去的城市。
const DEFAULT_AREAS=[];
const DEFAULT_KEYWORDS=['培训费','押金','保证金','先交钱','外包','劳务','派遣','中介','代招','刷单'];

const DEFAULTS={ on:true, areas:DEFAULT_AREAS, keywords:DEFAULT_KEYWORDS, companies:[], minMonthly:0, maxMonthly:0, homeAreas:[], focus:false };

// 深拷贝默认值：避免 cfg 的数组和 DEFAULTS 常量共享引用（filter 踩过「恢复默认被污染」的坑）
function freshDefaults(){
  return {
    on:DEFAULTS.on,
    areas:DEFAULTS.areas.slice(), keywords:DEFAULTS.keywords.slice(), companies:DEFAULTS.companies.slice(),
    minMonthly:DEFAULTS.minMonthly, maxMonthly:DEFAULTS.maxMonthly,
    homeAreas:DEFAULTS.homeAreas.slice(), focus:DEFAULTS.focus
  };
}
function loadCfg(){
  let o={};
  try{ o=JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; }catch(e){ o={}; }
  const c=Object.assign(freshDefaults(), o);
  if(!Array.isArray(c.areas)) c.areas=DEFAULT_AREAS.slice();
  if(!Array.isArray(c.keywords)) c.keywords=DEFAULT_KEYWORDS.slice();
  if(!Array.isArray(c.companies)) c.companies=[];
  if(!Array.isArray(c.homeAreas)) c.homeAreas=[];
  c.minMonthly=Math.max(0,parseInt(c.minMonthly,10)||0);   // 0 = 不判
  c.maxMonthly=Math.max(0,parseInt(c.maxMonthly,10)||0);
  if(typeof c.on!=='boolean') c.on=true;
  if(typeof c.focus!=='boolean') c.focus=false;
  return c;
}
let cfg=loadCfg();
function saveCfg(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }catch(e){} }
let UNMARKED=(()=>{ try{ return JSON.parse(localStorage.getItem(LS_UNMARK)||'{}')||{}; }catch(e){ return {}; } })();
const DELETED_UNMARK={};   // v1.2.5：本页删掉的 key（写盘时用来压过盘上的旧条目）
// v1.2.5：写前先合并盘上条目。原来整键覆盖 —— 两个标签页时后写的那个会把你刚「取消标记」的
// 记录整份抹掉，被取消标记的岗位又变回「命中」；「恢复标记」也一样会被对方的旧快照复活。
function saveUnmarked(){
  try{
    const disk=JSON.parse(localStorage.getItem(LS_UNMARK)||'{}')||{};
    const merged=Object.assign({},disk,UNMARKED);
    Object.keys(DELETED_UNMARK).forEach(k=>{ delete merged[k]; });
    UNMARKED=merged;
    localStorage.setItem(LS_UNMARK, JSON.stringify(merged));
  }catch(e){}
}
// v1.2.0：负向词一次性迁移到过滤脚本（地点黑名单 / 月薪上下限），本脚本只留正向规则
function migrateV120(){
  try{
    if(localStorage.getItem(LS_MIG)) return;
    const FK='bwf_rules_v1';
    const f=JSON.parse(localStorage.getItem(FK)||'{}')||{};
    let changed=false;
    if((cfg.minMonthly||0)>0&&!(f.minMonthly>0)){ f.minMonthly=cfg.minMonthly; changed=true; }
    if((cfg.maxMonthly||0)>0&&!(f.maxMonthly>0)){ f.maxMonthly=cfg.maxMonthly; changed=true; }
    const DEFKW=['培训费','押金','保证金','先交钱','外包','劳务','派遣','中介','代招','刷单'];
    if(JSON.stringify(cfg.keywords||[])===JSON.stringify(DEFKW)){   // 旧默认负向词整体搬去过滤脚本排除词
      const ws=Array.isArray(f.words)?f.words.slice():[];
      DEFKW.forEach(w=>{ if(ws.indexOf(w)<0){ ws.push(w); changed=true; } });
      f.words=ws;
      cfg.keywords=[];
    }
    if(changed) localStorage.setItem(FK, JSON.stringify(f));
    // v1.2.2：地区表保持负向语义（不想去的城市），不再迁移；家乡概念废弃
    cfg.homeAreas=[]; cfg.minMonthly=0; cfg.maxMonthly=0;
    saveCfg();
    localStorage.setItem(LS_MIG,'1');
  }catch(e){}
}
migrateV120();
const LS_MIG123='bt_mig_v123';
// v1.2.3：地区表改回正向白名单。一次性迁移：没改过的旧默认负向表 → 清空；用户改过的表保留内容、按新语义转正
function migrateV123(){
  try{
    if(localStorage.getItem(LS_MIG123)) return;
    if(JSON.stringify(cfg.areas||[])===JSON.stringify(DEFAULT_AREAS)) cfg.areas=[];
    saveCfg();
    localStorage.setItem(LS_MIG123,'1');
  }catch(e){}
}
migrateV123();

// 词表清洗（去空行 / 去重 / 去首尾空格），一行一条，也接受逗号分隔
function cleanWords(v){
  const seen={}, out=[];
  String(v==null?'':v).split(/\r?\n|,|，/).forEach(s=>{
    const t=s.trim();
    if(!t) return;
    const k=t.toLowerCase();
    if(seen[k]) return;
    seen[k]=1; out.push(t);
  });
  return out;
}

function escHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- 薪资解析（沿用 filter 的规则）----------
// BOSS 有字体反爬：页面上的薪资数字可能是私用区字符，DOM 读出来是乱码。
// 所以薪资优先用接口/Vue 的明文；DOM 是乱码就跳过薪资判断（宁可不判，也不判错）。
function garbled(s){
  const t=String(s||'');
  if(!t) return false;
  return /[\uE000-\uF8FF\uFFFD]/.test(t);
}
function parseSalary(desc){
  const s=String(desc||'').replace(/\s/g,'');
  let m=s.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?[Kk千]/);
  if(m) return {type:'month', low:parseFloat(m[1])*1000};
  m=s.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?元?\/(?:天|日)/);
  if(m) return {type:'day', low:parseFloat(m[1])};
  m=s.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?元?\/(?:小时|时)/);
  if(m) return {type:'hour', low:parseFloat(m[1])};
  return {type:'unknown', low:null};
}
function domPick(root,sels){
  for(const s of sels){ try{ const el=root.querySelector(s); if(el){ const t=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim(); if(t) return t; } }catch(e){} }
  return '';
}
// ---------- 卡片底行地点（v1.1.0：地区规则只认这一行，不再吃整卡文字）----------
const AREA_SELS=['.job-area','[class*="job-area"]','[class*="company-info"] [class*="area"]','[class*="location"]','[class*="addr"]'];
function cardLines(card){
  let txt='';
  try{ txt=String(card.innerText||card.textContent||''); }catch(e){ return []; }
  return txt.split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim())
    .filter(s=>s&&s.indexOf('⚠')!==0&&s.indexOf('命中:')!==0);   // 过滤自绘胶囊行，避免自家文字回流
}
function areaFromLines(lines){
  if(!lines.length) return '';
  const last=lines[lines.length-1];
  const m=last.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,}(?:[·・\-—][\u4e00-\u9fa5A-Za-z0-9]{2,})+)\s*$/);
  if(m) return m[1];
  const parts=last.split(/\s+/);
  if(parts.length>=2&&/[\u4e00-\u9fa5]{2,}/.test(parts[parts.length-1])) return parts[parts.length-1];
  return '';
}
function cardArea(card){
  const byDom=domPick(card,AREA_SELS);
  if(byDom) return byDom;
  return areaFromLines(cardLines(card));
}

// ---------- 页面 Vue 组件状态（明文，字段干净；首屏服务端直出时列表接口拿不到，靠它兜底）----------
const vueJobCache={t:0,map:{}};
function vueJobMap(){
  const t=Date.now();
  if(t-vueJobCache.t<1500) return vueJobCache.map;
  const map={};
  try{
    const all=document.querySelectorAll('div,section,main,article,ul');
    for(let i=0;i<all.length&&i<6000;i++){
      let v=null;
      try{ v=all[i].__vue__; }catch(e){ continue; }
      if(!v) continue;
      const jl=v.jobList||v.list;
      if(!jl||typeof jl.length!=='number'||!jl.length) continue;
      for(let k=0;k<jl.length&&k<300;k++){
        const it=jl[k];
        if(!it||typeof it!=='object') continue;
        const id=String(it.encryptJobId||it.encryptId||it.jobId||'');
        if(!id) continue;
        map[id]={name:String(it.jobName||''), company:String(it.brandName||it.companyName||''), salary:String(it.salaryDesc||'')};
      }
    }
  }catch(e){}
  vueJobCache.t=t; vueJobCache.map=map;
  return map;
}
function vueJobOf(jobId){ const id=String(jobId||''); return id?(vueJobMap()[id]||null):null; }

// ---------- 被动钩子：页面自己发的列表接口，把响应里的岗位按 jobId 建索引（不发任何新请求）----------
const apiJobs={};
const API_JOBS_MAX=3000;
let apiJobOrder=[];
function rememberApiJob(id,info){
  if(!apiJobs[id]) apiJobOrder.push(id);
  apiJobs[id]=info;
  if(apiJobOrder.length>API_JOBS_MAX){
    const drop=apiJobOrder.slice(0,apiJobOrder.length-API_JOBS_MAX);
    drop.forEach(k=>{ delete apiJobs[k]; });
    apiJobOrder=apiJobOrder.slice(-API_JOBS_MAX);
  }
}
function ingestApi(text){
  let n=0;
  try{
    const o=JSON.parse(text);
    const d=o&&o.zpData;
    const list=(d&&(d.jobList||d.list||d.jobCardList))||null;
    if(!Array.isArray(list)) return 0;
    list.forEach(it=>{
      if(!it||typeof it!=='object') return;
      const id=String(it.encryptJobId||it.jobId||it.encryptId||'');
      if(!id) return;
      rememberApiJob(id,{
        salary:String(it.salaryDesc||it.salary||''),
        name:String(it.jobName||''),
        company:String(it.brandName||it.companyName||''),
        labels:[].concat(it.jobLabels||[],it.skills||[],it.welfareList||[]).join(' ')
      });
      n++;
    });
  }catch(e){}
  return n;
}
function isJobListApi(u){
  let s=String(u||'');
  if(s.charAt(0)==='/') s='https://www.zhipin.com'+s;
  if(!/zhipin\.com/i.test(s)) return false;
  return /joblist|job\/list|joblist\.json|search\/joblist|recommend\/job\/list|job\/card/i.test(s);
}
(function hookApi(){
  try{
    const of=window.fetch;
    if(typeof of==='function'){
      window.fetch=function(input,init){
        const u=(typeof input==='string')?input:(input&&input.url)||'';
        const p=of.apply(this,arguments);
        if(isJobListApi(u)){
          p.then(res=>{
            try{
              const ru=res.url||u;
              if(isJobListApi(ru)) res.clone().text().then(t=>{ if(ingestApi(t)) schedule(); },()=>{});
            }catch(e){}
          },()=>{});
        }
        return p;
      };
    }
    const X=window.XMLHttpRequest;
    if(X&&X.prototype){
      const oOpen=X.prototype.open, oSend=X.prototype.send;
      X.prototype.open=function(m,u){
        try{ this.__btUrl=(typeof u==='string')?u:(u&&u.url)||''; }catch(e){}
        return oOpen.apply(this,arguments);
      };
      X.prototype.send=function(){
        const self=this;
        try{
          self.addEventListener('load',function(){
            try{
              const u=self.__btUrl||'';
              if(!isJobListApi(u)) return;
              let t=null;
              if(self.responseType===''||self.responseType==='text') t=self.responseText;
              else if(self.responseType==='json'&&self.response) t=JSON.stringify(self.response);
              if(t&&ingestApi(t)) schedule();
            }catch(e){}
          });
        }catch(e){}
        return oSend.apply(this,arguments);
      };
    }
  }catch(e){}
})();

// ---------- 找到列表卡片（与 filter 同一套「卡片」判断，宁可不动也绝不误伤容器）----------
function jobIdFromHref(u){
  const m=String(u||'').match(/job[_\-]?detail\/([^.\/?#]+)/i);
  return m?m[1]:'';
}
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
// jobId 优先取卡片上的 data-jobid / data-lid（任务书第 3 节约定），取不到再退回链接
function cardJobId(card,a){
  try{
    const d=card.getAttribute('data-jobid')||card.getAttribute('data-lid');
    if(d&&String(d).trim()) return String(d).trim();
  }catch(e){}
  try{
    const d=a&&(a.getAttribute('data-jobid')||a.getAttribute('data-lid'));
    if(d&&String(d).trim()) return String(d).trim();
  }catch(e){}
  return jobIdFromHref(a?a.getAttribute('href')||a.href||'':'');
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
        if(b===undefined){ b=isTooBig(cur); big.set(cur,b); }   // 同一容器会被同卡的多个链接重复测量，量一次就够
        if(!b) card=cur;
      }
    }
    if(!card||seen.has(card)) return;
    seen.add(card);
    const href=a.getAttribute('href')||a.href||'';
    out.push({card, jobId:cardJobId(card,a), href:String(href)});
  });
  return out;
}

// ---------- 无ID兜底：用「公司名|岗位名」哈希当 key ----------
function strHash(s){
  let h=5381;
  for(let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; }
  return h.toString(16);
}
function fallbackKey(ctx){
  const s=((ctx.company||'')+'|'+(ctx.name||'')).trim();
  if(!s||s==='|') return '';
  return 'noId_'+strHash(s);
}

// ---------- 命中判定 ----------
// 返回所有命中的词（去重），没命中返回空数组
function wordHits(list,text){
  const hay=String(text||'').toLowerCase();
  const out=[], seen={};
  if(!hay) return out;
  for(const w of (list||[])){
    const k=String(w||'').trim();
    if(!k) continue;
    if(hay.indexOf(k.toLowerCase())>=0 && !seen[k]){ seen[k]=1; out.push(k); }
  }
  return out;
}
function buildCtx(card,apiInfo,jobId){
  const cardText=String(card.innerText||card.textContent||'').replace(/\s+/g,' ').trim();
  const vj=vueJobOf(jobId);
  const apiName=apiInfo&&apiInfo.name?String(apiInfo.name).trim():'';
  const apiCompany=apiInfo&&apiInfo.company?String(apiInfo.company).trim():'';
  const apiLabels=apiInfo&&apiInfo.labels?String(apiInfo.labels).trim():'';
  let name=apiName||(vj&&vj.name)||domPick(card,['.job-name','[class*="job-name"]','[class*="jobName"]','.job-title']);
  let company=apiCompany||(vj&&vj.company)||domPick(card,['.company-name','[class*="company-name"]','[class*="companyName"]','[class*="brandName"]','.company-info .name','.sider-company .name','[class*="company-info"] h3','a[href*="/gongsi/"]']);
  let tags=apiLabels;
  if(!tags){
    try{ tags=Array.prototype.slice.call(card.querySelectorAll('ul[class*="tag"] li,ol[class*="tag"] li,[class*="tag-list"] li'))
      .map(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean).join(' '); }catch(e){}
  }
  const salaryText=(apiInfo&&apiInfo.salary)?String(apiInfo.salary).trim():((vj&&vj.salary)?String(vj.salary).trim():(garbled(cardText)?'':cardText));
  if(garbled(name)) name='';
  if(garbled(company)) company='';
  return {name, company, tags, cardText, salaryText, salary:parseSalary(salaryText), jobId:String(jobId||''), area:cardArea(card)};
}
// 命中就返回 {tags:[...], detail:'...'}；没命中 tags 为空
function decideTags(ctx){
  const tags=[], detail=[];
  // 地区（v1.2.3 正向白名单）：只认卡片底行地点文字；子串命中（深圳 → 深圳·福田区·梅林）→ 打标并计入命中
  const areaTxt=String(ctx.area||'');
  const areaHits=wordHits(cfg.areas, areaTxt);
  if(areaHits.length){ tags.push('地区:'+areaHits[0]); detail.push('地区：'+areaHits.join('、')); }
  // 岗位名（v1.2.1 正向）：只匹配卡片上方那行岗位名，不再吃公司/标签/整卡文字
  const kwHits=wordHits(cfg.keywords, ctx.name);
  kwHits.forEach(w=>{ if(tags.indexOf(w)<0) tags.push(w); });
  if(kwHits.length) detail.push('岗位名：'+kwHits.join('、'));
  // 公司名
  if(ctx.company){
    const coHits=wordHits(cfg.companies, ctx.company);
    coHits.forEach(w=>{ const t='公司:'+w; if(tags.indexOf(t)<0) tags.push(t); });
    if(coHits.length) detail.push('公司名：'+coHits.join('、'));
  }
  // v1.2.0：薪资阈值已迁移到过滤脚本（负向排除），本脚本不再判薪资
  return {tags, detail: detail.join('；'), hide:false};
}

// ---------- 卡片打标签 / 清标签（只加属性与小胶囊，绝不隐藏、绝不动站点数据）----------
function isFilterHidden(card){
  try{
    const b=card.getAttribute('data-bwf');
    if(b==='hidden'||b==='revealed') return true;   // filter 已经处理的卡片（隐藏/显示被过滤）跳过
    return getComputedStyle(card).display==='none';
  }catch(e){ return false; }
}
function primaryLabel(tags){
  const t=(tags||[]).slice();
  if(t.indexOf('外地')>=0) return '⚠ 外地'+(t.length>1?(' +'+(t.length-1)):'');
  const rest=t.filter(x=>x!=='无ID');
  if(!rest.length) return '⚠ 命中';
  let head=rest[0];
  if(/^公司:/.test(head)) head=head.replace(/^公司:/,'');
  if(/^地区:/.test(head)) head=head.replace(/^地区:/,'');
  return '命中:'+head+(rest.length>1?(' +'+(rest.length-1)):'');
}
function setTag(card,tags,detail){
  card.setAttribute('data-bt-hit','1');
  card.setAttribute('data-bt-tags',(tags||[]).join(','));
  try{
    let el=card.querySelector('.bt-tag');
    if(!el){
      if(getComputedStyle(card).position==='static') card.style.position='relative';
      el=document.createElement('div');
      el.className='bt-tag';
      card.appendChild(el);
    }
    const label=primaryLabel(tags), ttl=detail||(tags||[]).join('、');
    if(el.textContent!==label) el.textContent=label;
    if(el.title!==ttl) el.title=ttl;
  }catch(e){}
}
function clearTag(card){
  card.removeAttribute('data-bt-hit');
  card.removeAttribute('data-bt-tags');
  try{ const el=card.querySelector('.bt-tag'); if(el) el.remove(); }catch(e){}
}
function negShowCard(card){
  try{
    if(!card.getAttribute('data-bt-hide')) return;
    card.removeAttribute('data-bt-hide');
    card.removeAttribute('data-bt-reason');
    if(!otherHider(card)) card.style.display='';
  }catch(e){}
}
// ---------- 只看命中（v1.1.0）：隐藏未命中卡片以直达命中项 ----------
// 协同协议 v1：data-bt-focus（本脚本）/ data-bwf-hide（filter）/ data-bc-hide（一致性脚本）
// 各脚本只撤自己的标记；恢复显示前先看他人标记，没有才恢复，避免互撤。
function otherHider(card){
  return card.hasAttribute('data-bwf-hide')||card.hasAttribute('data-bc-hide')||card.hasAttribute('data-bt-hide');
}
function focusHide(card){
  try{
    if(card.getAttribute('data-bt-focus')) return;
    const mk=card.getAttribute('data-bwf');
    if(mk==='revealed'||mk==='marked') return;   // filter 的「显示被过滤/标记」是显式查看，优先级更高
    card.setAttribute('data-bt-focus','1');
    card.style.display='none';
  }catch(e){}
}
function focusShow(card){
  try{
    if(!card.getAttribute('data-bt-focus')) return;
    card.removeAttribute('data-bt-focus');
    if(!otherHider(card)) card.style.display='';
  }catch(e){}
}

// ---------- 命中名单（localStorage 键 bt_hits）----------
let hits={}, hitsLoaded=false, hitsDirty=false, hitsGone={};   // hitsGone：本页主动取消命中的 key（墓碑），合并写盘时不把它捡回来
function loadHits(){
  if(hitsLoaded) return;
  hitsLoaded=true;
  try{
    const o=JSON.parse(localStorage.getItem(LS_HITS)||'{}')||{};
    Object.keys(o).forEach(k=>{ if(o[k]&&typeof o[k]==='object') hits[k]=o[k]; });
  }catch(e){}
}
function persistHits(){
  if(!hitsDirty) return;
  hitsDirty=false;
  try{
    // 写前先并一次盘上的值：多个 zhipin 标签页同时开着时，整键覆盖会吞掉别的页攒下的命中
    const cur=JSON.parse(localStorage.getItem(LS_HITS)||'{}')||{};
    Object.keys(cur).forEach(k=>{ if(!hits[k]&&!hitsGone[k]&&cur[k]&&typeof cur[k]==='object') hits[k]=cur[k]; });
    pruneHits();
    localStorage.setItem(LS_HITS, JSON.stringify(hits));
    hitsGone={};   // 墓碑只在「下次写盘前」需要，写盘即完成使命，避免只增不减
  }catch(e){}
}
function upsertHit(key,tags){
  loadHits();
  const t=(tags||[]).slice(), s=t.join(','), old=hits[key];
  if(old&&(old.tags||[]).join(',')===s) return;   // 标签没变就不置脏，省掉每轮全量写盘
  hits[key]={tags:t, at:Date.now()}; hitsDirty=true;
}
function removeHit(key){ loadHits(); if(key&&hits[key]){ delete hits[key]; hitsGone[key]=1; hitsDirty=true; } }
function pruneHits(){
  loadHits();
  const ks=Object.keys(hits);
  if(ks.length<=HITS_MAX) return;
  ks.sort((a,b)=>(hits[a].at||0)-(hits[b].at||0)).slice(0,ks.length-HITS_MAX).forEach(k=>{ delete hits[k]; hitsDirty=true; });
}

// 只读查询函数（给其它脚本用）：传 jobId / 哈希 key，或直接传卡片 DOM 元素
window.__bossTagQuery=function(input){
  let key=input;
  if(input&&typeof input==='object'&&input.nodeType){
    key=(input.getAttribute&&(input.getAttribute('data-jobid')||input.getAttribute('data-lid')))||'';
    if(!key){ try{ const a=input.querySelector&&input.querySelector('a[href*="job_detail"],a[href*="job-detail"]'); key=cardJobId(input, a||null); }catch(e){ key=''; } }
  }
  const k=String(key==null?'':key).trim();
  if(!k){
    // 无 jobId 的卡片存的是 noId_ 哈希（要 company/name 才算得出），这里算不出来；
    // 但 DOM 上已经打了 data-bt-hit，按它答，免得和卡片标记自相矛盾
    if(input&&input.nodeType===1&&input.getAttribute&&input.getAttribute('data-bt-hit')==='1'){
      return {hit:true, tags:String(input.getAttribute('data-bt-tags')||'').split(',').filter(Boolean)};
    }
    return {hit:false, tags:[]};
  }
  loadHits();
  const r=hits[k];
  return r?{hit:true, tags:Array.prototype.slice.call(r.tags||[])}:{hit:false, tags:[]};
};

// ---------- 主扫描：只打标签，绝不隐藏 ----------
let stat={hit:0,total:0};
let applying=false;
function applyTags(){
  if(applying) return;
  applying=true;
  try{
    const cards=findCards();
    // v1.2.4 自检：页面有卡片容器但识别 0 → 明示一次
    try{
      const siteCards=document.querySelectorAll('li.job-card-box').length;
      if(siteCards>=8&&cards.length===0&&!window.__btSelfCheck){
        window.__btSelfCheck='自检：页面有 '+siteCards+' 个卡片容器但命中脚本识别到 0 张——可能页面没渲染完或选择器失效；刷新后仍出现请截图反馈';
        showBtBanner(window.__btSelfCheck);
      }
    }catch(e){}
    if(!cfg.on){
      cards.forEach(it=>{ clearTag(it.card); focusShow(it.card); });
      stat={hit:0,total:cards.length};
      updateChip();
      return;
    }
    let hitCount=0;
    cards.forEach(it=>{
      const card=it.card;
      if(isFilterHidden(card)&&!card.getAttribute('data-bt-focus')&&!card.getAttribute('data-bt-hide')) return;   // filter 已隐藏且非本脚本所藏 → 跳过（自己藏的卡要继续走，才能恢复）
      const apiInfo=it.jobId?apiJobs[it.jobId]:null;
      const ctx=buildCtx(card,apiInfo,it.jobId);
      const d=decideTags(ctx);
      const key=it.jobId||fallbackKey(ctx);
      if(key&&UNMARKED[key]){ d.tags=[]; d.detail=''; d.hide=false; }   // v1.2.0：取消标记的卡不再打标/隐藏
      if(d.tags.length){
        hitCount++;
        const tags=d.tags.slice();
        if(!it.jobId) tags.push('无ID');   // 没识别到 jobId：在标签里注明
        setTag(card,tags,d.detail);
        if(key) upsertHit(key,tags);
        negShowCard(card);   // v1.2.3：negShow 仅用于清理 v1.2.2 遗留的 data-bt-hide
        focusShow(card);
      }else{
        negShowCard(card);
        clearTag(card);
        if(key) removeHit(key);
        // v1.2.5：保险 —— 一条正向规则都没有时「隐藏未命中」会把整页藏光，这时不藏，并提示一次
        if(cfg.focus&&!hasAnyPositiveRule()){
          if(!window.__btNoRuleWarned){
            window.__btNoRuleWarned=1;
            showBtBanner('「隐藏未命中」开着，但地区/关键词/公司名/薪资规则全是空的 —— 会把整页岗位都藏掉，已暂停隐藏。先填规则或关掉这个开关。');
          }
          focusShow(card);
        }
        else if(cfg.focus) focusHide(card); else focusShow(card);   // v1.2.0：藏没命中的，剩下=要投的
      }
    });
    pruneHits();
    persistHits();
    stat={hit:hitCount,total:cards.length};
    updateChip();
  }catch(e){}finally{ applying=false; }
}

// ---------- 页面小控件 ----------
let ui=null;
function ensureUi(){
  if(ui&&document.body.contains(ui.wrap)) return ui;
  const style=document.createElement('style');
  style.textContent=
    '.bt-wrap{position:fixed;left:16px;bottom:64px;z-index:2147482900;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430;--bt:#d97706;--bt-line:#e6ebf3;--bt-mute:#7a8396}'+
    '.bt-chip{display:flex;align-items:center;gap:8px;background:#111827;color:#fff;border-radius:999px;padding:6px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28)}'+
    '.bt-chip b{font-weight:600}'+
    '.bt-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.18);flex:0 0 auto}'+
    '.bt-dot.off{background:#94a3b8;box-shadow:0 0 0 3px rgba(148,163,184,.2)}'+
    '.bt-btn{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:999px;padding:3px 11px;cursor:pointer;font-size:12px;font-family:inherit}'+
    '.bt-btn:hover{background:rgba(255,255,255,.14)}'+
    '.bt-panel{display:none;position:fixed;left:16px;bottom:110px;width:470px;max-width:calc(100vw - 32px);max-height:76vh;overflow:auto;background:#fff;color:#1f2430;border:1px solid var(--bt-line);border-radius:16px;box-shadow:0 18px 50px rgba(20,30,60,.22)}'+
    '.bt-head{position:sticky;top:0;z-index:3;height:44px;padding:0 14px;display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid var(--bt-line);border-radius:16px 16px 0 0;cursor:move;user-select:none;touch-action:none}'+
    '.bt-head .bt-mute{margin-left:auto;text-align:right}'+
    '.bt-x{border:none;background:none;font-size:20px;line-height:1;cursor:pointer;color:#7a8396;padding:0 2px}'+
    '.bt-x:hover{color:#1f2430}'+
    '.bt-body{padding:12px 14px 14px}'+
    '.bt-mute{color:var(--bt-mute);font-size:12px}'+
    '.bt-row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}'+
    '.bt-row input[type=number]{width:80px;border:1px solid #d7dce6;border-radius:8px;padding:3px 6px}'+
    '.bt-panel textarea{width:100%;border:1px solid #d7dce6;border-radius:10px;padding:6px 8px;font:12px/1.5 monospace;outline:none;resize:vertical}'+
    '.bt-panel textarea:focus{border-color:#f0c38a;box-shadow:0 0 0 2px rgba(217,119,6,.12)}'+
    '.bt-save{background:#d97706;color:#fff;border:none;border-radius:9px;padding:6px 12px;cursor:pointer;font-family:inherit}'+
    '.bt-save:hover{background:#b45309}'+
    '.bt-ghost{background:#fdf1e2;color:#d97706;border:none;border-radius:9px;padding:6px 12px;cursor:pointer;font-family:inherit}'+
    '.bt-ghost:hover{background:#fbe7cd}'+
    '.bt-fold{border:1px solid var(--bt-line);border-radius:12px;background:#fcfdff;margin:8px 0;overflow:hidden}'+
    '.bt-fold>summary{cursor:pointer;padding:8px 12px;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;list-style:none}'+
    '.bt-fold>summary::-webkit-details-marker{display:none}'+
    '.bt-fold>summary::before{content:"\\25B8";color:var(--bt-mute);font-weight:400}'+
    '.bt-fold[open]>summary::before{content:"\\25BE"}'+
    '.bt-fold>summary:hover{background:#fdf6ee}'+
    '.bt-foldbody{padding:6px 12px 10px;border-top:1px solid #eef1f6}'+
    '.bt-hint{color:var(--bt-mute);font-size:12px;line-height:1.5;margin:0 0 6px}'+
    '.bt-tag{position:absolute;top:6px;right:6px;background:#d97706;color:#fff;font-size:11px;line-height:1.5;padding:1px 6px;border-radius:6px;z-index:5;cursor:context-menu;box-shadow:0 1px 4px rgba(0,0,0,.2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+   // v1.2.5：原来 pointer-events:none 让胶囊永远接不到右键 → 「取消标记/恢复标记」入口物理上不可达、bt_unmarked 名单永远是空的
    '.bt-menu{position:fixed;z-index:2147482950;min-width:180px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:4px;box-shadow:0 12px 32px rgba(0,0,0,.35)}'+
    '.bt-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit}'+
    '.bt-menu button:hover{background:rgba(255,255,255,.14)}';
  const wrap=document.createElement('div');
  wrap.className='bt-wrap';
  wrap.innerHTML='<div class="bt-panel" id="btPanel"></div>'+
    '<div class="bt-chip"><span class="bt-dot" id="btDot" title="标签中"></span><b id="btCount">标签中…</b>'+
    '<button class="bt-btn" id="btRules">设置</button>'+
    '<button class="bt-btn" id="btFocus">隐藏未命中</button>'+
    '<button class="bt-btn" id="btOnOff">关闭标签</button></div>';
  document.body.appendChild(style);
  document.body.appendChild(wrap);
  ui={wrap, count:wrap.querySelector('#btCount'), panel:wrap.querySelector('#btPanel')};
  wrap.querySelector('#btRules').addEventListener('click',()=>{
    const p=ui.panel;
    const open=p.style.display==='block';
    p.style.display=open?'none':'block';
    if(!open){
      // 和 filter 一样：打开自己的面板时，顺手收起投递面板，避免叠在一起
      try{ const bp=document.getElementById('bdPanel'); if(bp&&bp.style.display==='block') bp.style.display='none'; }catch(e){}
      renderPanel();
    }
  });
  wrap.querySelector('#btOnOff').addEventListener('click',()=>{
    cfg.on=!cfg.on; saveCfg(); applyTags(); updateChip();
    syncOnOff();
  });
  wrap.querySelector('#btFocus').addEventListener('click',()=>{
    cfg.focus=!cfg.focus; saveCfg(); applyTags(); updateChip(); syncFocusBtn();
  });
  syncFocusBtn();
  wrap.querySelector('#btOnOff').textContent=cfg.on?'关闭标签':'开启标签';
  tryDockBar();
  return ui;
}
// v1.2.5：有没有任何一条「正向」规则（地区/关键词/公司名/起步月薪）
function hasAnyPositiveRule(){
  try{
    return !!((cfg.areas||[]).length||(cfg.keywords||[]).length||(cfg.companies||[]).length||
      Number(cfg.minMonthly)>0||Number(cfg.maxMonthly)>0);
  }catch(e){ return true; }
}
function syncFocusBtn(){
  try{
    const b=document.getElementById('btFocus');
    if(b){ b.textContent=cfg.focus?'退出隐藏':'隐藏未命中'; b.style.background=cfg.focus?'rgba(245,158,11,.92)':''; b.style.borderColor=cfg.focus?'#f59e0b':''; }
  }catch(e){}
}
function syncOnOff(){
  try{ const b=document.getElementById('btOnOff'); if(b) b.textContent=cfg.on?'关闭标签':'开启标签'; }catch(e){}
  try{ const c=document.getElementById('btOn'); if(c) c.checked=!!cfg.on; }catch(e){}
}
// v1.2.4：自检提示条（每页一次）
function showBtBanner(text){
  try{
    if(document.getElementById('btBanner')) return;
    const d=document.createElement('div');
    d.id='btBanner';
    d.style.cssText='position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483646;max-width:76vw;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:6px 12px;font:12px/1.6 "Microsoft YaHei",sans-serif;box-shadow:0 6px 18px rgba(20,60,12,.12)';
    d.textContent=text;
    document.body.appendChild(d);
  }catch(e){}
}
// v1.2.4：过滤条存在时把本条停靠其上（视觉合成一组，避免「两条黑条像重复」）
function tryDockBar(){
  try{
    if(!ui) return;
    const host=document.querySelector('.bwf-wrap');
    if(!host) return;
    if(ui.wrap.parentElement===host) return;
    if(!document.getElementById('btDockCss')){
      const st=document.createElement('style');
      st.id='btDockCss';
      st.textContent='.bwf-wrap{display:flex;flex-direction:column-reverse;gap:6px;align-items:flex-start} .bt-wrap.bt-docked{position:static;left:auto;bottom:auto;margin:0;width:fit-content}';
      document.body.appendChild(st);
    }
    host.appendChild(ui.wrap);
    ui.wrap.classList.add('bt-docked');
  }catch(e){}
}
function updateChip(){
  tryDockBar();   // v1.2.4：过滤条后加载时也能 dock
  const u=ensureUi();
  if(!u) return;
  const ct=cfg.on?((cfg.focus?'隐藏未命中 · 已标记 ':'已标记 ')+stat.hit+' / '+stat.total):('标签已关闭（共 '+stat.total+' 条）');
  if(u.count.textContent!==ct) u.count.textContent=ct;
  const dot=u.wrap.querySelector('#btDot');
  if(dot){ dot.className='bt-dot'+(cfg.on?'':' off'); dot.title=cfg.on?(cfg.focus?'隐藏未命中中（没打标的已藏，剩下=要投的）':'标签中（只标记，不隐藏）'):'标签已关闭'; }
  try{
    const s=document.getElementById('btStat');
    if(s){ const st='本页命中 '+stat.hit+' / 共 '+stat.total; if(s.textContent!==st) s.textContent=st; }
  }catch(e){}
}

// ---------- 面板重绘保护（不冲掉正在填的输入 / 折叠区 / 滚动 / 焦点）----------
function panelSnapshot(p){
  const snap={folds:[], vals:{}, scroll:0, focus:'', sel:null};
  try{
    const folds=p.querySelectorAll('details.bt-fold');
    for(let i=0;i<folds.length;i++) snap.folds.push(!!folds[i].open);
    const ins=p.querySelectorAll('input,textarea');
    for(let i=0;i<ins.length;i++){ if(ins[i].id&&ins[i].type!=='checkbox') snap.vals[ins[i].id]=ins[i].value; }
    snap.scroll=p.scrollTop||0;
    const a=document.activeElement;
    if(a&&p.contains(a)&&a.id&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')){
      snap.focus=a.id;
      try{ snap.sel=[a.selectionStart,a.selectionEnd]; }catch(e){}
    }
  }catch(e){}
  return snap;
}
function panelRestore(p,snap){
  try{
    if(!snap) return;
    const folds=p.querySelectorAll('details.bt-fold');
    for(let i=0;i<folds.length&&i<snap.folds.length;i++) folds[i].open=!!snap.folds[i];
    Object.keys(snap.vals||{}).forEach(id=>{
      const el=p.querySelector('#'+id);
      if(el&&el.value!==undefined&&snap.vals[id]!==undefined) el.value=snap.vals[id];
    });
    p.scrollTop=snap.scroll||0;
    if(snap.focus){
      const a=p.querySelector('#'+snap.focus);
      if(a){ a.focus(); try{ if(snap.sel&&a.setSelectionRange) a.setSelectionRange(snap.sel[0],snap.sel[1]); }catch(e){} }
    }
  }catch(e){}
}

// ---------- 面板拖动（位置存本机，刷新后还在）----------
let uiPos={panel:null};
function loadUiPos(){
  try{ const o=JSON.parse(localStorage.getItem(LS_UI)||'{}')||{}; if(o.panel&&typeof o.panel.x==='number'&&typeof o.panel.y==='number') uiPos.panel=o.panel; }catch(e){}
}
function saveUiPos(){ try{ localStorage.setItem(LS_UI, JSON.stringify(uiPos)); }catch(e){} }
function applyPanelPos(p){
  if(uiPos.panel&&typeof uiPos.panel.x==='number'){
    // 存过位置后视口可能变小（换屏/开 DevTools/缩放），钳回视口内，否则面板整体在屏外且滚不出来
    const x=Math.max(0,Math.min(uiPos.panel.x,window.innerWidth-60));
    const y=Math.max(0,Math.min(uiPos.panel.y,window.innerHeight-40));
    p.style.left=x+'px';
    p.style.top=y+'px';
    p.style.bottom='auto';
  }
}
function makeDraggable(handle,panel){
  handle.addEventListener('pointerdown',(e)=>{
    const t=e.target;
    if(t&&t.closest&&(t.closest('button')||t.closest('input')||t.closest('textarea')||t.closest('summary'))) return;
    if(e.button!==0) return;
    e.preventDefault();
    const r=panel.getBoundingClientRect();
    const dx=e.clientX-r.left, dy=e.clientY-r.top;
    panel.style.bottom='auto';
    function move(ev){
      const w=panel.offsetWidth||r.width, h=panel.offsetHeight||r.height;
      let x=ev.clientX-dx, y=ev.clientY-dy;
      x=Math.max(0,Math.min(x,window.innerWidth-60));   // 保证顶栏始终在视口内可再拖动
      y=Math.max(0,Math.min(y,window.innerHeight-40));
      panel.style.left=x+'px';
      panel.style.top=y+'px';
    }
    function up(){
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      try{
        const rr=panel.getBoundingClientRect();
        uiPos.panel={x:Math.round(rr.left), y:Math.round(rr.top)};
        saveUiPos();
      }catch(err){}
    }
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
  });
}

let skipRestore=false;   // 「恢复默认」后不要把旧输入回写进刚重绘出来的默认值
function renderPanel(){
  const u=ensureUi();
  if(!u) return;
  const p=u.panel;
  const keep=panelSnapshot(p);
  p.innerHTML=
    '<div class="bt-head" id="btHead" title="按住这里拖动面板"><span class="bt-dot'+(cfg.on?'':' off')+'"></span><b>标签规则</b>'+
    '<span class="bt-mute">v'+VERSION+' · 默认只标记 · 拖动顶栏换位置</span>'+
    '<button class="bt-x" id="btX" title="收起">×</button></div>'+
    '<div class="bt-body">'+
    '<div class="bt-row"><label><input type="checkbox" id="btOn" '+(cfg.on?'checked':'')+'> 启用标签</label>'+
    '<span class="bt-mute" id="btStat">本页命中 '+stat.hit+' / 共 '+stat.total+'</span></div>'+
    '<details class="bt-fold" open><summary>地区（命中=想去的城市）<span class="bt-mute">'+cfg.areas.length+' 条 · 卡片底行地点子串命中</span></summary><div class="bt-foldbody">'+
    '<textarea id="btAreas" style="height:96px">'+escHtml(cfg.areas.join('\n'))+'</textarea>'+
    '<div class="bt-hint">一行一个**想去**的城市/地区名（如「深圳」），子串匹配：写深圳也会命中「深圳·福田区·梅林」。命中算「命中」，不会被「隐藏未命中」藏掉；任何正向规则都没命中的卡才会被「隐藏未命中」藏。**不想去**的城市请写到过滤脚本的「地点黑名单」。</div></div></details>'+
    '<details class="bt-fold" open><summary>岗位名<span class="bt-mute">'+cfg.keywords.length+' 条 · 卡片上方岗位名命中才打标</span></summary><div class="bt-foldbody">'+
    '<textarea id="btKeywords" style="height:96px">'+escHtml(cfg.keywords.join('\n'))+'</textarea>'+
    '<div class="bt-hint">一行一个岗位名关键词（如「技术支持」「售后」）。只匹配卡片上方那行岗位名；负向排除词请写到过滤脚本的排除词。</div></div></details>'+
    '<details class="bt-fold"><summary>公司名<span class="bt-mute">'+cfg.companies.length+' 条 · 按公司名命中</span></summary><div class="bt-foldbody">'+
    '<textarea id="btCompanies" style="height:72px">'+escHtml(cfg.companies.join('\n'))+'</textarea>'+
    '<div class="bt-hint">留空 = 不按公司名打标签。写关键词也行（如「劳务」）。</div></div></details>'+
    '<div class="bt-hint" style="margin:6px 0">薪资阈值已移到过滤脚本（月薪/日薪上下限，命中直接隐藏）；本脚本只做正向标记。<br><b>打标</b>＝命中规则的卡片右上角画个角标：本地动作，不隐藏、不改站点数据。点小条上的「隐藏未命中」才会把没打标的藏起来，随时可点「退出隐藏」恢复。<br>用例：本脚本管<b>岗位卡片</b>；聊天会话的打标与隐藏，在「聊天体检」脚本里。</div>'+
    '<div class="bt-row"><button class="bt-save" id="btSave">保存</button>'+
    '<button class="bt-ghost" id="btReset">恢复默认</button>'+
    '<button class="bt-ghost" id="btResetPos">复位面板位置</button>'+
    '<button class="bt-ghost" id="btClearUnmark">清空取消标记名单（'+Object.keys(UNMARKED).length+'）</button>'+
    '<span class="bt-mute">改完自动保存（800ms），也可以点「保存」</span>'+
    '<span class="bt-mute" id="btDirty"></span></div>'+
    '</div>';
  applyPanelPos(p);
  const xb=p.querySelector('#btX');
  if(xb) xb.addEventListener('click',()=>{ p.style.display='none'; });
  const head=p.querySelector('#btHead');
  if(head) makeDraggable(head,p);
  ['btAreas','btKeywords','btCompanies'].forEach(id=>{
    const ta=p.querySelector('#'+id);
    if(ta) ta.addEventListener('input',scheduleSave);
  });
  const onEl=p.querySelector('#btOn');
  if(onEl) onEl.addEventListener('change',()=>{ cfg.on=!!onEl.checked; saveCfg(); applyTags(); renderPanel(); updateChip(); syncOnOff(); });
  p.querySelector('#btSave').addEventListener('click',()=>{
    doSave();
    renderPanel();
    const b=p.querySelector('#btSave'); if(b) b.textContent='已保存 ✓';
    setTimeout(()=>{ const bb=p.querySelector('#btSave'); if(bb) bb.textContent='保存'; },1200);
  });
  p.querySelector('#btReset').addEventListener('click',()=>{
    // v1.2.5：不再整表重置。默认地区表已改成空表，如果照旧 freshDefaults()，
    // 点一下「恢复默认」会把你写好的地区表/关键词/公司名/薪资阈值全部清空，
    // 而「隐藏未命中」还开着 → 所有卡都算「未命中」→ 整页岗位被藏光。现在只重置开关。
    cfg=Object.assign(freshDefaults(),{
      on:cfg.on,
      areas:(cfg.areas||[]).slice(), keywords:(cfg.keywords||[]).slice(), companies:(cfg.companies||[]).slice(),
      minMonthly:cfg.minMonthly, maxMonthly:cfg.maxMonthly, homeAreas:(cfg.homeAreas||[]).slice()
    });
    saveCfg();
    skipRestore=true;
    // v1.2.5：恢复默认会把 focus 关掉，但状态条按钮文案原来是靠「输入框变化」才刷新的 →
    // 恢复后按钮仍显示「退出隐藏」，你点一下反而**开始**隐藏（且此时地区表已换成默认表，杀伤力叠加）。
    applyTags(); renderPanel(); updateChip(); syncFocusBtn(); syncOnOff();
  });
  p.querySelector('#btClearUnmark').addEventListener('click',()=>{
    Object.keys(UNMARKED).forEach(k=>{ DELETED_UNMARK[k]=1; });
    UNMARKED={}; saveUnmarked(); applyTags(); renderPanel();
  });
  p.querySelector('#btResetPos').addEventListener('click',()=>{
    uiPos.panel=null; saveUiPos();
    p.style.left=''; p.style.top=''; p.style.bottom='';
    applyPanelPos(p);
  });
  if(skipRestore){ skipRestore=false; }else{ panelRestore(p,keep); }
}

// ---------- 规则自动保存（改完 800ms）----------
let saveTimer=null;
function markDirty(){
  const el=document.getElementById('btDirty');
  if(el){ el.textContent='有未保存改动，正在自动保存…'; el.style.color='#b45309'; }
}
function doSave(){
  const p=ui&&ui.panel;
  if(!p) return;
  const g=(id)=>{ const el=p.querySelector('#'+id); return el?el.value:null; };
  if(g('btAreas')!==null) cfg.areas=cleanWords(g('btAreas'));
  if(g('btKeywords')!==null) cfg.keywords=cleanWords(g('btKeywords'));
  if(g('btCompanies')!==null) cfg.companies=cleanWords(g('btCompanies'));
  saveCfg();
  applyTags();
}
function scheduleSave(){
  markDirty();
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    saveTimer=null;
    doSave();
    renderPanel();
    const el=document.getElementById('btDirty');
    if(el){ el.textContent='已自动保存 '+new Date().toLocaleTimeString('zh-CN',{hour12:false}); el.style.color='#15803d'; }
  },800);
}

// ---------- v1.2.0：右键「取消标记 / 恢复标记」（人工复核误标）----------
let btMenuEl=null;
function closeTagMenu(){ if(btMenuEl){ btMenuEl.remove(); btMenuEl=null; } }
function cardKeyOf(card){
  try{
    const a=card.querySelector('a[href*="job_detail"],a[href*="job-detail"]');
    const id=cardJobId(card,a);
    if(id) return String(id);
    const nm=domPick(card,['.job-name','[class*="job-name"]','[class*="jobName"]','.job-title']);
    const co=domPick(card,['.company-name','[class*="company-name"]','[class*="companyName"]','[class*="brandName"]']);
    return fallbackKey({company:co,name:nm});
  }catch(e){ return ''; }
}
function showTagMenu(x,y,key,hasHit,unmarked){
  closeTagMenu();
  btMenuEl=document.createElement('div');
  btMenuEl.className='bt-menu';
  btMenuEl.innerHTML=(hasHit?'<button data-m="unmark">取消标记（复核误标：这张不再打标）</button>':'')+
    (unmarked?'<button data-m="remark">恢复标记</button>':'')+
    '<button data-m="close">关闭</button>';
  document.body.appendChild(btMenuEl);
  btMenuEl.style.left=Math.max(0,Math.min(x,window.innerWidth-200))+'px';
  btMenuEl.style.top=Math.max(0,Math.min(y,window.innerHeight-100))+'px';
  btMenuEl.addEventListener('click',(e)=>{
    const b=e.target&&e.target.closest?e.target.closest('button[data-m]'):null;
    if(!b) return;
    const m=b.getAttribute('data-m');
    if(m==='unmark'){ UNMARKED[key]=1; delete DELETED_UNMARK[key]; saveUnmarked(); applyTags(); }
    else if(m==='remark'){ delete UNMARKED[key]; DELETED_UNMARK[key]=1; saveUnmarked(); applyTags(); }
    closeTagMenu();
  });
}
document.addEventListener('mousedown',(ev)=>{ if(btMenuEl&&!(btMenuEl===ev.target||(btMenuEl.contains&&btMenuEl.contains(ev.target)))) closeTagMenu(); },true);
document.addEventListener('contextmenu',(ev)=>{
  try{
    const card=ev.target&&ev.target.closest?ev.target.closest('li.job-card-wrapper,[class*="job-card"]'):null;
    if(!card||!document.body.contains(card)) return;
    if(card.closest&&card.closest('.bt-wrap')) return;
    const key=cardKeyOf(card);
    if(!key) return;
    // v1.2.5：胶囊以前带 pointer-events:none，右键永远打不到它 → 这里再加一条退路：
    // 在卡片右上角区域（胶囊所在位置）右键，等同于右键胶囊。
    let cap=ev.target&&ev.target.closest?ev.target.closest('.bt-tag'):null;
    if(!cap){
      try{
        const r=card.getBoundingClientRect();
        const dx=ev.clientX-r.left, dy=ev.clientY-r.top;
        if(dx>r.width-140&&dy<34) cap=card.querySelector('.bt-tag')||card;
      }catch(e){}
    }
    const hasHit=card.getAttribute('data-bt-hit')==='1';
    const un=!!UNMARKED[key];
    if(cap&&hasHit){ ev.preventDefault(); ev.stopPropagation(); showTagMenu(ev.clientX,ev.clientY,key,true,un); return; }
    if(!un) return;   // 卡片本体右键留给过滤脚本/浏览器原生菜单
    ev.preventDefault(); ev.stopPropagation();
    showTagMenu(ev.clientX,ev.clientY,key,false,true);
  }catch(e){}
},true);
// ---------- 触发时机 ----------
let timer=null;
function schedule(){
  if(timer) return;
  timer=setTimeout(()=>{ timer=null; applyTags(); },350);
}
try{
  const mo=new MutationObserver(()=>{ if(!applying) schedule(); });
  mo.observe(document.documentElement,{childList:true,subtree:true});
}catch(e){}
setInterval(()=>{ if(document.visibilityState==='visible') applyTags(); },2000);
window.addEventListener('scroll',schedule,{passive:true});
loadUiPos();
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ applyTags(); },{once:true});
else{ applyTags(); }
})();
