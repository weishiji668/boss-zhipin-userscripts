const assert = require('assert');
const T = require('../boss-watcher.user.js');   // 岗位监控
const C = require('../boss-chat.user.js');      // 聊天（已拆分）

let passed = 0;
function ok(name, fn){
  try{ fn(); passed++; console.log('  ✓ ' + name); }
  catch(e){ console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('normText / jdNorm / salaryChanged / lineDiff');
ok('归一化：去空白标点、全角转半角、数字占位', ()=>{
  assert.strictEqual(T.normText('您好， 我是 小明！123'), '您好我是小明#');
  assert.strictEqual(T.normText('ＡＢＣ'), 'abc');
});
ok('JD 归一化：统一换行与空白', ()=>{
  assert.strictEqual(T.jdNorm('a\r\n  b\r\n\r\n\r\nc'), 'a\n b\n\nc');
});
ok('薪资变化检测', ()=>{
  assert.strictEqual(T.salaryChanged('15-25K', '15-30K'), true);
  assert.strictEqual(T.salaryChanged('15-25K·14薪', '15-25K·14薪'), false);
});
ok('JD 行级 diff：增删识别', ()=>{
  const d = T.lineDiff('熟悉 React\n熟悉 Vue', '熟悉 React\n熟悉 Vue\n熟悉 Node.js');
  assert.deepStrictEqual(d.added, ['熟悉 Node.js']);
  assert.deepStrictEqual(d.removed, []);
});
ok('时间解析：毫秒/秒/日期字符串', ()=>{
  assert.strictEqual(T.toTs(1700000000000), 1700000000000);
  assert.strictEqual(T.toTs(1700000000), 1700000000000);
  assert.ok(T.toTs('2024-01-01 10:00:00') > 0);
  assert.strictEqual(T.toTs(''), 0);
});
ok('CSV 转义', ()=>{
  assert.strictEqual(T.csvEsc('a,b'), '"a,b"');
  assert.strictEqual(T.csvEsc('plain'), 'plain');
});


console.log('岗位状态检测');
ok('风控码/接口错误 → 获取失败', ()=>{
  assert.strictEqual(T.detectStatus({code:31, msg:'访问频繁'}, 'https://www.zhipin.com/job_detail/x.html'), '获取失败');
});
ok('响应含「职位已下线」→ 下线', ()=>{
  assert.strictEqual(T.detectStatus({zpData:{message:'该职位已下线'}}, 'https://www.zhipin.com/job_detail/x.html'), '下线');
});
ok('详情页无岗位数据 → 下线(疑似)', ()=>{
  assert.strictEqual(T.detectStatus({zpData:{}}, 'https://www.zhipin.com/job_detail/abc123.html?x=1'), '下线(疑似)');
});
ok('正常详情 → 在招', ()=>{
  assert.strictEqual(T.detectStatus({zpData:{jobDetail:{jobId:'a', jobName:'前端'}}}, 'https://www.zhipin.com/job_detail/a.html'), '在招');
});
ok('风控码识别', ()=>{
  assert.ok(T.riskCode('{"code":37,"msg":"您的环境存在异常"}'));
  assert.ok(T.riskCode('{"code":0,"msg":"ok"}') === null);
});
ok('风控识别：验证码 HTML 页不再漏判', ()=>{
  assert.ok(T.riskCode('<html><head><title>安全验证</title></head><body>请完成安全验证</body></html>'));
  assert.ok(T.riskCode('<html><body><div>请输入验证码</div></body></html>'));
  assert.equal(T.riskCode('{"code":0,"message":"Success","zpData":{"jobList":[]}}'), null);
  const big = '<html><body>' + '正常内容'.repeat(6000) + '验证码相关说明</body></html>';
  assert.equal(T.riskCode(big), null, '长页面里的普通验证码字样不该误判');
});
ok('风控熔断：触发后当日阻断，可手动解除', ()=>{
  T.store.settings = JSON.parse(JSON.stringify(T.DEFAULTS));
  assert.equal(T.isBlocked(), false);
  const until = T.blockTillTomorrow('风控/验证页面');
  assert.ok(until > Date.now(), '熔断时刻应在未来');
  assert.equal(T.isBlocked(), true);
  assert.ok(T.blockedText().length > 0);
  assert.equal(new Date(until).getHours(), 0, '应熔断到次日 0 点');
  T.clearBlock();
  assert.equal(T.isBlocked(), false);
});
ok('URL 提取 jobId / friendId', ()=>{
  assert.strictEqual(T.jobIdFromUrl('https://www.zhipin.com/job_detail/a1b2.html?lid=x'), 'a1b2');
  assert.strictEqual(C.sessionIdFromUrl('https://www.zhipin.com/wapi/zpgeek/friend/message.json?friendId=f9'), 'f9');
});
ok('响应分类：列表/详情/会话/消息', ()=>{
  assert.strictEqual(T.classify('https://www.zhipin.com/wapi/zpgeek/search/joblist.json?query=x', {zpData:{list:[{jobId:'1',jobName:'前端'}]}}), 'jobList');
  assert.strictEqual(T.classify('https://www.zhipin.com/job_detail/1.html', {zpData:{jobDetail:{jobId:'1'}}}), 'jobDetail');
  assert.strictEqual(T.classify('https://www.zhipin.com/wapi/zpgeek/friend/message.json?friendId=f', {zpData:{list:[{msgId:'1',content:'hi'}]}}), 'chatMessages');
  assert.strictEqual(T.classify('https://www.zhipin.com/wapi/zpgeek/friend/list.json', {zpData:{list:[{friendId:'f',brandName:'某某'}]}}), 'chatList');
});
ok('深层数组/详情对象查找', ()=>{
  assert.deepStrictEqual(T.findArr({a:{b:[{x:1}]}}, 0), [{x:1}]);
  const d = T.findJobDetail({zpData:{jobDetail:{jobId:'j', jobName:'N', jobDesc:'D'}}}, 0);
  assert.strictEqual(d.jobDesc, 'D');
});

console.log('聊天统计');
const mkSid = (sid, msgs)=>({meta:{sessionId:sid}, messages:msgs});
ok('首响时长 = 对方首条回复 - 我首条消息', ()=>{
  const s = mkSid('s1', [
    {mid:'1', dir:'me', ts:1700000000000, text:'您好'},
    {mid:'2', dir:'them', ts:1700000060000, text:'你好'},
    {mid:'3', dir:'them', ts:1700000070000, text:'看到简历了'}
  ]);
  assert.strictEqual(C.firstReplyMinutes(s), 1);
});
ok('话术聚类与 24h 回复率', ()=>{
  const s = mkSid('s1', [
    {mid:'1', dir:'me', ts:1700000000000, text:'您好，我对贵司岗位感兴趣'},
    {mid:'2', dir:'them', ts:1700000006000, text:'您好'},
    {mid:'3', dir:'me', ts:1700007200000, text:'您好，我对贵司岗位感兴趣'},
    {mid:'4', dir:'me', ts:1700009000000, text:'请问还在招吗'}
  ]);
  const clusters = C.clusterMessages([s], 24*3600*1000);
  const c = clusters.find(x=>x.key.startsWith('您好我对贵司岗位感兴趣'));
  assert.ok(c, '应聚类出该话术组');
  assert.strictEqual(c.count, 2);
  assert.strictEqual(c.replied, 1);
  assert.strictEqual(c.rate, 50);
});
ok('聚合统计：总量与活跃时段', ()=>{
  const s = mkSid('s1', [
    {mid:'1', dir:'me', ts:1700000000000, text:'您好'},
    {mid:'2', dir:'them', ts:1700000060000, text:'你好'}
  ]);
  const st = C.computeChatStats([s]);
  assert.strictEqual(st.sessions, 1);
  assert.strictEqual(st.total, 2);
  assert.strictEqual(st.me, 1);
  assert.strictEqual(st.them, 1);
  assert.strictEqual(st.avgFirstReply, 1);
  const hour = new Date(1700000060000).getHours();
  assert.strictEqual(st.histogram[hour], 1);
});
ok('mergeDeep 嵌套合并', ()=>{
  const m = T.mergeDeep({a:1, sub:{x:1, y:2}}, {sub:{y:9}, b:2});
  assert.deepStrictEqual(m, {a:1, sub:{x:1, y:9}, b:2});
});

console.log('投递复盘导出（会话汇总）');
ok('打招呼方式分类 + 跟进情况', ()=>{
  const now = Date.now();
  const s = { meta:{sessionId:'s'}, messages:[
    {mid:'1', dir:'me', ts:now-3*86400000, text:'您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'},
    {mid:'2', dir:'them', ts:now-3*86400000+60000, text:'你好'}
  ]};
  const s2 = { meta:{sessionId:'s2'}, messages:[
    {mid:'3', dir:'me', ts:now-5*86400000, text:'我是应届生，能给个联系方式吗'},
    {mid:'4', dir:'me', ts:now-4*86400000, text:'在吗'}
  ]};
  assert.strictEqual(C.greetingKind('您好，我对您发布的职位非常感兴趣，希望能加入贵公司。'), '模板招呼');
  assert.strictEqual(C.greetingKind('我是应届生，能给个联系方式吗'), '自我介绍');
  assert.strictEqual(C.greetingKind('请问还在招吗'), '问岗位详情');
  const gs = C.greetingStats([s,s2], 24*3600*1000);
  const tpl = gs.find(x=>x.kind==='模板招呼');
  assert.ok(tpl && tpl.count===1 && tpl.rate===100, JSON.stringify(tpl));
  const fu = C.followUpStats([s,s2]);
  assert.strictEqual(fu.waiting, 1, 's2 我最后发言 4 天没回 → 待跟进');
  assert.strictEqual(fu.theirs, 1, 's 最后发言是对方 → 等我回');
  assert.strictEqual(fu.done, 0);
});
ok('一行一个会话，统计我发/对方回/首响/待跟进', ()=>{
  const now = Date.now();
  C.store.chats = {
    f1: { meta:{sessionId:'f1', company:'甲公司', jobName:'运营', boss:'张经理'}, messages:[
      {mid:'a', dir:'me', ts:now-5*86400000, text:'您好，我对贵司岗位很感兴趣'},
      {mid:'b', dir:'them', ts:now-5*86400000+60000, text:'方便发份简历吗'},
      {mid:'c', dir:'me', ts:now-3*86400000, text:'已发送，请查收'}
    ]},
    f2: { meta:{sessionId:'f2', company:'乙公司', jobName:'客服'}, messages:[
      {mid:'d', dir:'them', ts:now-3600000, text:'你好'}
    ]},
    f3: { meta:{sessionId:'f3', company:'空会话'}, messages:[] }
  };
  const rows = C.chatSessionRows();
  const head = rows[0];
  const col = (name)=>{ const i=head.indexOf(name); assert.ok(i>=0, '表头缺少列：'+name); return i; };
  assert.strictEqual(rows.length, 3, '只导出有消息的会话（表头 + 2 行）');
  const a = rows.find(r=>r[0]==='甲公司');
  assert.strictEqual(a.length, head.length, '每行列数与表头一致');
  assert.strictEqual(a[col('消息总数')], 3);
  assert.strictEqual(a[col('我发')], 2);
  assert.strictEqual(a[col('对方回')], 1);
  assert.strictEqual(a[col('首响(分钟)')], 1, '首响 1 分钟');
  assert.ok(/待跟进/.test(a[col('跟进标记')]), '我最后发言且 3 天没回 → 待跟进');
  const b = rows.find(r=>r[0]==='乙公司');
  assert.ok(!/待跟进/.test(b[col('跟进标记')]), '对方最后发言 → 不标待跟进');
});
ok('HR 上下线状态记进会话（用于判断"已读不回"）', ()=>{
  const s = { meta:{sessionId:'f9'}, messages:[] };
  C.noteHrStatus(s, '3天前活跃');
  assert.strictEqual(s.meta.hrStatus, '3天前活跃');
  assert.ok(s.meta.hrStatusAt > 0, '记录观察时间');
  C.noteHrStatus(s, '在线');
  assert.strictEqual(s.meta.hrLog.length, 2, '状态变化进时间线');
  assert.strictEqual(s.meta.hrLog[0].status, '在线');
  assert.ok(s.meta.hrLastOnlineAt > 0, '记录「最近在线时间」');
  assert.strictEqual(C.hrStatusFromItem({bossOnline:true}), '在线');
  assert.strictEqual(C.hrStatusFromItem({bossOnline:false}), '离线');
  assert.strictEqual(C.hrStatusFromItem({}), '');
});

console.log('P0 修复：导出 BOM / HTML 转义 / 额度换日');
ok('T1 导出编码：CSV 带 BOM，JSON / JSONL 保持纯净可解析', ()=>{
  // 回归依据：带 BOM 的 JSON 无法解析
  let threw=false; try{ JSON.parse('\uFEFF{"a":1}'); }catch(e){ threw=true; }
  assert.ok(threw, 'BOM 会让 JSON.parse 失败（旧行为）');
  // CSV 仍带 BOM（Excel 中文不乱码）
  assert.strictEqual(C.bomFor('text/csv'), '\uFEFF');
  assert.strictEqual(C.payloadFor('a,b','text/csv').charCodeAt(0), 0xFEFF);
  // JSON / JSONL 不带 BOM，可直接解析
  assert.strictEqual(C.bomFor('application/json'), '');
  assert.strictEqual(C.bomFor('application/x-ndjson'), '');
  assert.strictEqual(C.bomFor('text/markdown'), '');
  assert.deepStrictEqual(JSON.parse(C.payloadFor(JSON.stringify({a:1}),'application/json')), {a:1});
  assert.deepStrictEqual(JSON.parse(C.payloadFor(JSON.stringify({t:'hi'}),'application/x-ndjson')), {t:'hi'});
  assert.strictEqual(C.payloadFor('x','application/json').indexOf('\uFEFF'), -1);
});
ok('T2 HTML 转义：引号不再撑破属性', ()=>{
  assert.strictEqual(C.esc('a"b<c'), 'a&quot;b&lt;c');
  assert.strictEqual(C.esc("a'b"), 'a&#39;b');
  assert.strictEqual(C.esc('&">'), '&amp;&quot;&gt;');
  assert.strictEqual(C.esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  // 属性注入场景：Key 含引号时不能闭合 value="..."
  const attr='value="'+C.esc('sk-"onmouseover="alert(1)')+'"';
  assert.strictEqual(attr, 'value="sk-&quot;onmouseover=&quot;alert(1)"');
  assert.ok(!/value="sk-"onmouseover/.test(attr), '不能出现裸引号闭合属性');
});
ok('T4 每日额度按本地日期换日（不再用 UTC）', ()=>{
  const now=new Date(), p=x=>String(x).padStart(2,'0');
  assert.strictEqual(C.localDateStr(now), now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate()));
  // 本地 00:30：东八区下 UTC 还是前一天，旧实现不会重置
  const early=new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30, 0);
  assert.strictEqual(C.localDateStr(early), now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate()));
  if (early.toISOString().slice(0,10)!==C.localDateStr(early)) {
    assert.ok(true, '本地日期 != UTC 日期（换日时点正确落在本地 0 点）');
  }
  // 额度重置：昨天用过 → 调用后重置为今天
  C.store.settings=JSON.parse(JSON.stringify(C.DEFAULTS));
  C.store.settings.ai.maxPerDay=5; C.store.settings.ai.usedToday=4;
  C.store.settings.ai.usedDate=C.localDateStr(new Date(now.getTime()-86400000));
  assert.strictEqual(C.aiBudgetOk(), true);
  assert.strictEqual(C.store.settings.ai.usedDate, C.localDateStr(now), 'usedDate 记的是本地今天');
  assert.strictEqual(C.store.settings.ai.usedToday, 0, '跨日清零');
  // 用满 → 拒绝；同日不误清零
  C.store.settings.ai.usedToday=5;
  assert.strictEqual(C.aiBudgetOk(), false);
  C.store.settings.ai.usedToday=2;
  assert.strictEqual(C.aiBudgetOk(), true);
  assert.strictEqual(C.store.settings.ai.usedToday, 2, '同一天内不清零');
});
ok('版本号自洽（脚本内 VERSION 常量与油猴头部 @version 一致）', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  const head=(src.match(/\/\/\s*@version\s+([\d.]+)/)||[])[1];
  assert.ok(head, '头部能读到 @version');
  assert.strictEqual(C.VERSION, head, '脚本内常量与头部同步（v'+head+'）');
});

console.log('P1/P2 修复：写入策略 / 去重 / 调试样本 / 清理');
ok('T5 save 防抖合并 + 分键写入（高频调用只写脏键）', ()=>{
  const writes=[];
  const orig=global.GM_setValue;
  global.GM_setValue=(k)=>{ writes.push(k); };
  try{
    C.flushSave();               // 清掉此前测试遗留的脏键
    writes.length=0;
    // 连续 5 次热路径写入 → 合并成一次
    for(let i=0;i<5;i++){ C.store.logs=[{ts:i,msg:'x'}]; C.save(['logs']); }
    C.flushSave();
    assert.strictEqual(writes.length, 1, '多次 save 合并为一次写入');
    assert.deepStrictEqual(writes, ['bc_logs'], '只写脏键，不牵动 chats/settings');
    // 分键：chats 不影响 settings
    writes.length=0;
    C.save(['chats']); C.flushSave();
    assert.deepStrictEqual(writes, ['bc_chats'], 'chats 单独写入');
    // 一次调用多个键
    writes.length=0;
    C.save(['settings','diag']); C.flushSave();
    assert.deepStrictEqual(writes.slice().sort(), ['bc_diag','bc_settings']);
  } finally {
    if(orig===undefined) delete global.GM_setValue; else global.GM_setValue=orig;
  }
});
ok('T8 双钩子统一去重：同响应判重、等长不同响应不误杀', ()=>{
  const u='https://www.zhipin.com/wapi/zpgeek/friend/list.json?x=1';
  const a=JSON.stringify({code:0,zpData:{list:[{friendId:'d1'}]}});
  const b=JSON.stringify({code:0,zpData:{list:[{friendId:'d2'}]}});
  assert.strictEqual(a.length, b.length, '用例前提：两条响应等长（旧实现按长度会误判为同一条）');
  assert.strictEqual(C.capKeyOf(u,a), C.capKeyOf(u,a), '同响应 → 同键');
  assert.notStrictEqual(C.capKeyOf(u,a), C.capKeyOf(u,b), '不同响应 → 不同键');
  assert.strictEqual(C.capSeenRecently(C.capKeyOf(u,a)), false, '首次捕获不判重');
  assert.strictEqual(C.capSeenRecently(C.capKeyOf(u,a)), true, '两条钩子拿到同一响应 → 只入库一次');
  assert.strictEqual(C.capSeenRecently(C.capKeyOf(u,b)), false, '等长但内容不同 → 不判重');
});
ok('T9 调试样本默认不写，仅「观察模式」开启时留', ()=>{
  C.store.settings=JSON.parse(JSON.stringify(C.DEFAULTS));   // observe:false
  C.store.diag={}; C.store.captured={}; C.store.chats={};
  const mk=fid=>JSON.stringify({code:0,zpData:{list:[{friendId:fid,brandName:'甲公司'}]}});
  C.maybeStoreResponse('https://www.zhipin.com/wapi/zpgeek/friend/list.json?a=1',
    'https://www.zhipin.com/wapi/zpgeek/friend/list.json?a=1', mk('o1'), 'test');
  assert.ok(!C.store.diag.samples, '默认不写响应样本');
  assert.ok(!C.store.diag.items, '默认不写原始会话条目');
  C.store.settings.observe=true;
  C.maybeStoreResponse('https://www.zhipin.com/wapi/zpgeek/friend/list.json?b=2',
    'https://www.zhipin.com/wapi/zpgeek/friend/list.json?b=2', mk('o2'), 'test');
  assert.ok(C.store.diag.samples && Object.keys(C.store.diag.samples).length===1, '观察模式才留响应样本');
  assert.ok(C.store.diag.items && Object.keys(C.store.diag.items).length===1, '观察模式才留原始条目');
});
ok('T12 消息去重改 Map 索引：重复入库不新增', ()=>{
  C.store.chats={}; C.store.settings=JSON.parse(JSON.stringify(C.DEFAULTS));
  const payload={code:0,zpData:{messages:[
    {mid:11,time:1700000000000,from:{uid:100},body:{text:'你好'}},
    {mid:12,time:1700000060000,from:{uid:200},body:{text:'在吗'}}
  ]}};
  C.processMessages(payload,'t12','');
  assert.strictEqual(C.store.chats.t12.messages.length, 2, '首次入库 2 条');
  C.processMessages(payload,'t12','');   // 同一批再来一次
  assert.strictEqual(C.store.chats.t12.messages.length, 2, '二次入库不重复（Map 命中）');
  C.processMessages({code:0,zpData:{messages:[{mid:13,time:1700000120000,from:{uid:100},body:{text:'好的'}}]}},'t12','');
  assert.strictEqual(C.store.chats.t12.messages.length, 3, '新消息仍然入库');
});
ok('T11 无用函数已清理（uid / fmtTime / relDay 定义与导出同步删除）', ()=>{
  assert.strictEqual(typeof C.uid, 'undefined', 'uid 不再导出');
  assert.strictEqual(typeof C.fmtTime, 'undefined', 'fmtTime 不再导出');
  assert.strictEqual(typeof C.relDay, 'undefined', 'relDay 不再导出');
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(!/function uid\(/.test(src), 'uid 定义已删');
  assert.ok(!/function relDay\(/.test(src), 'relDay 定义已删');
  assert.ok(/flushSave/.test(src) && /capKeyOf/.test(src), '新增的 save/去重接口在导出中');
});
ok('T6 工具按钮只渲染一组（去重）', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  const scan=(src.match(/data-act="chatscan"/g)||[]).length;
  const clean=(src.match(/data-act="chatclean"/g)||[]).length;
  assert.strictEqual(scan, 1, '「收录当前会话」按钮只出现 1 次（实际 '+scan+'）');
  assert.strictEqual(clean, 1, '「清理异常会话」按钮只出现 1 次（实际 '+clean+'）');
});
ok('T7 bc-note / bc-lv 已有 CSS 定义', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/#bcPanel \.bc-note\{/.test(src), 'bc-note 有样式定义');
  assert.ok(/#bcPanel \.bc-lv\{/.test(src), 'bc-lv 有样式定义');
});

ok('T3/SC-2 Key 不回填 DOM：渲染代码无 Key 值写入，且有更换/清除入口', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(!/esc\(ai\.key/.test(src), '渲染处不再出现 esc(ai.key…（Key 明文不进 DOM）');
  assert.ok(/data-key="ai\.key" value=""/.test(src), 'Key 输入框固定为空 value');
  assert.ok(/data-act="keysave"/.test(src), '有「保存」按钮');
  assert.ok(/data-act="keyclear"/.test(src), '有「清除 Key」按钮');
  // 逐键写入已取消：input 处理器对 key 直接 return
  assert.ok(/if\(k==='key'\) return;/.test(src), 'Key 不逐键写入（只走保存按钮）');
});
ok('T3/SC-3 文案口径：不再宣称「只存本机」，且不称「出境」', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(!/数据仅存本机(?!\u0000)/.test(src.replace(/除 AI 判定外数据仅存本机/g,'')), '面板头部已改为「除 AI 判定外数据仅存本机」');
  assert.ok(/除 AI 判定外数据仅存本机/.test(src), '头部含准确表述');
  assert.ok(/除 AI 判定外，数据只存本机/.test(src), '底部含准确表述');
  assert.ok(!/出境/.test(src), '脚本内不出现「出境」措辞');
  assert.ok(/仅填写可信地址/.test(src), 'baseUrl 旁有可信地址提示');
  assert.ok(/数据将发送至该地址/.test(src), 'baseUrl 提示说明数据流向');
});
ok('T3/SC-3 首次启用弹一次性确认（含范围/目的地/对方消息）', ()=>{
  const t=C.AI_CONSENT_TEXT;
  assert.ok(/10 条消息/.test(t), '写明发送范围（默认最近 10 条）');
  assert.ok(/公司名与岗位名/.test(t), '写明随附字段');
  assert.ok(/api\.deepseek\.com/.test(t), '写明默认目的地');
  assert.ok(/对方（HR）发送的消息也会被发送/.test(t), '明确对方消息也会外发');
  assert.ok(/仅存本机/.test(t), '写明结果留存方式');
  assert.ok(/脱敏/.test(t), '写明发送前会本地脱敏');
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/if\(el\.checked&&!store\.settings\.ai\.ackAt\)/.test(src), '启用时检查是否已确认过');
  assert.ok(/ackAt/.test(src), '确认状态落盘（只弹一次）');
});
ok('T3/SC-1 Key 存储风险提示 + 清除按钮', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/Key 以明文保存在浏览器扩展存储中/.test(src), '有明文存储风险提示');
  assert.ok(/专用 Key/.test(src)&&/共用电脑/.test(src), '提示专用 Key 与共用电脑风险');
  assert.ok(/store\.settings\.ai\.key=''/.test(src), '清除按钮会把 Key 从设置中移除');
});

console.log('v1.4.3 SC-4 + v1.4.4 修订：脱敏 / 数据面缩减 / 顺序限流');
ok('SC-4a 发送前脱敏：手机号 / 身份证 / 邮箱 / 微信号 / QQ 都打码（v1.4.4：含分隔写法与全角）', ()=>{
  const out=C.maskSensitive('加我微信：abc12345 手机13812345678 邮箱 zhang.san@qq.com QQ:123456789 身份证 440305199001011234');
  assert.ok(!/13812345678/.test(out), '手机号不再原样出现');
  assert.ok(/138\*\*\*\*78/.test(out), '手机号打码为 138****78');
  assert.ok(!/abc12345/.test(out), '微信号不再原样出现');
  assert.ok(/z\*\*\*@qq\.com/.test(out), '邮箱打码且保留域名');
  assert.ok(!/123456789\b/.test(out), 'QQ 号不再原样出现');
  assert.ok(!/440305199001011234/.test(out), '身份证号不再原样出现');
  // ===== v1.4.4 修订（交付后实测发现的盲区，补强断言）=====
  assert.ok(/4403\*{10}34/.test(out), '身份证完整掩码 4403**********34（19xx 出生不再被手机号规则咬掉）');
  const sep1=C.maskSensitive('电话 138 1234 5678');
  assert.ok(!/138 1234 5678/.test(sep1)&&/138\*\*\*\*78/.test(sep1), '空格分隔手机号打码（原先完全漏打）');
  assert.ok(/138\*\*\*\*78/.test(C.maskSensitive('电话 138-1234-5678')), '横线分隔手机号打码');
  assert.ok(/138\*\*\*\*78/.test(C.maskSensitive('电话１３８１２３４５６７８')), '全角手机号打码');
  assert.ok(/4403\*{10}34/.test(C.maskSensitive('身份证 440301 19900101 1234')), '分隔写法身份证打码');
  const combo=C.maskSensitive('手机13812345678 身份证440305199001011234');
  assert.ok(/138\*\*\*\*78/.test(combo)&&/4403\*{10}34/.test(combo), '手机+身份证同句各自正确打码');
  assert.ok(/\+86138\*\*\*\*78/.test(C.maskSensitive('电话 +8613812345678')), '+86 前缀手机号打码（前缀保留）');
  assert.ok(!/199001011234/.test(C.maskSensitive('身份证440301199001011234')), '身份证中段不再以 11 位形态残留');
});
ok('SC-4b 数据面可调且有边界（4–20 条 / 60–200 字）', ()=>{
  assert.deepStrictEqual(C.aiMsgWindow(undefined), {n:10, chars:120});
  assert.deepStrictEqual(C.aiMsgWindow({msgCount:99, msgChars:5}), {n:20, chars:60});
  assert.deepStrictEqual(C.aiMsgWindow({msgCount:2, msgChars:999}), {n:4, chars:200});
  assert.deepStrictEqual(C.aiMsgWindow({msgCount:'12', msgChars:'150'}), {n:12, chars:150});
});
ok('SC-4c 批量判定顺序化限流：逐个发送 + 连续失败即停（不再是并发 forEach）', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(!/list\.forEach\(\(\[sid\]\)=>\{ if\(aiSessionJudge\(sid\)\) n\+\+; \}\)/.test(src), '旧的并发提交已移除');
  assert.ok(/judgeBatchRunning/.test(src), '有批量进行中标记（防重入）');
  assert.ok(/连续失败 2 次/.test(src), '连续失败会停止批量');
  assert.ok(/nextSoon\(ok===null\?120:gap\)/.test(src), '每个请求之间按间隔排队');
});

console.log('v1.4.5 修复：一键收录回放页面真实请求（securityId 令牌）');
ok('secIdFromUrl 能从真实请求 URL 里取出 securityId 令牌', ()=>{
  assert.strictEqual(C.secIdFromUrl('https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId=abc&maxMsgId=0&c=20&page=1&src=0&securityId=ABC-_123~~'), 'ABC-_123~~');
  assert.strictEqual(C.secIdFromUrl('https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId=abc'), '', '没有令牌就返回空串');
  assert.strictEqual(C.secIdFromUrl(''), '');
});
ok('historyUrlFor 优先回放真实请求：保留 securityId / page / src，游标归零', ()=>{
  const sid='8af7745f352e20d70n180966FlU~';
  C.store.chats[sid]={meta:{sessionId:sid},messages:[],msgUrl:'https://www.zhipin.com/wapi/zpchat/geek/historyMsg?bossId='+sid+'&maxMsgId=987&c=20&page=1&src=0&securityId=SeJT8-token~~'};
  const r=C.historyUrlFor(sid);
  assert.strictEqual(r.token, true, '识别出有令牌');
  assert.ok(/securityId=SeJT8-token~~/.test(r.url), '保留真实请求里的 securityId');
  assert.ok(/[?&]page=1&src=0/.test(r.url), '保留 page/src 参数');
  assert.ok(/maxMsgId=0/.test(r.url) && !/maxMsgId=987/.test(r.url), '游标归零（拉最新一页）');
});
ok('historyUrlFor：无 msgUrl 时用 meta.securityId 拼 URL；完全没令牌则 token=false', ()=>{
  C.store.chats['59683001']={meta:{sessionId:'59683001',securityId:'tok-9~~'},messages:[]};
  const a=C.historyUrlFor('59683001');
  assert.ok(/securityId=tok-9~~/.test(a.url) && /[?&]page=1&src=0/.test(a.url), '带上令牌与 page/src');
  assert.strictEqual(a.token, true);
  C.store.chats['59683002']={meta:{sessionId:'59683002'},messages:[]};
  const b=C.historyUrlFor('59683002');
  assert.strictEqual(b.token, false, '没点开过的会话拿不到令牌');
  assert.ok(/bossId=59683002/.test(b.url), 'URL 仍带 bossId');
});
ok('批量收录走 historyUrlFor，且无令牌会话计入「跳过」不再假装成功', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(!/historyMsg\?bossId='\+encodeURIComponent\(sid\)\+'&maxMsgId=0&c='/.test(src), '旧的缺参自拼 URL 已移除（这就是“成功 N · 新增 0 条”的原因）');
  assert.ok(/const r=historyUrlFor\(sid\)/.test(src), '收录请求改走 historyUrlFor');
  assert.ok(/noTokenMiss/.test(src), '连续无令牌会提前停止空跑');
  assert.ok(/bulkState\.skip/.test(src) && /跳过/.test(src), '面板/日志会显示跳过数');
});
ok('会话可记录 securityId 令牌（来自真实请求或列表项）', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/s\.meta\.securityId=sec/.test(src), 'processMessages 记住请求里的令牌');
  assert.ok(/pick\(it,\['securityId','secId'\]\)/.test(src), 'upsertChatMeta 从列表项兜底取令牌');
});

ok('对方活跃时段：按 HR 消息的小时分布统计（含条数）', ()=>{
  const T=(h,m)=>new Date(2026,8,20,h,m).getTime();
  const s={meta:{},messages:[
    {dir:'them',ts:T(9,12),text:'a'},{dir:'them',ts:T(9,40),text:'b'},
    {dir:'them',ts:T(17,5),text:'c'},{dir:'me',ts:T(10,0),text:'d'}
  ]};
  const a=C.activeHoursOf(s);
  assert.strictEqual(a.total,3,'只统计对方消息（我发的不算）');
  assert.strictEqual(a.hist[9],2);
  assert.strictEqual(a.hist[17],1);
  assert.strictEqual(a.hist[10],0);
  const t=C.activeHoursText(s,3);
  assert.strictEqual(t.text,'09点(2) 17点(1)','按次数降序输出「小时+条数」');
  assert.strictEqual(t.hits.length,2,'命中 2 个小时');
  assert.strictEqual(t.top,9);
  const top=C.activeHoursText({meta:{},messages:[{dir:'them',ts:T(1,1),text:'x'},{dir:'them',ts:T(2,1),text:'y'},{dir:'them',ts:T(3,1),text:'z'},{dir:'them',ts:T(4,1),text:'w'}]},3);
  assert.strictEqual(top.text.split(' ').length,3,'最多显示 3 个时段');
  assert.strictEqual(top.hits.length,4,'但 hits 保留全部命中小时');
});
ok('对方活跃窗口：最早–最晚小时（HR 上下线的近似）', ()=>{
  const T=(h,m)=>new Date(2026,8,20,h,m).getTime();
  const s={meta:{},messages:[
    {dir:'them',ts:T(9,12),text:'a'},{dir:'them',ts:T(17,5),text:'c'},{dir:'me',ts:T(10,0),text:'d'}
  ]};
  const a=C.activeHoursOf(s);
  assert.strictEqual(a.first,9,'first=最早发消息的小时');
  assert.strictEqual(a.last,17,'last=最晚发消息的小时');
  const w=C.activeWindowText(s);
  assert.strictEqual(w.text,'09–17点','窗口＝最早–最晚（补零）');
  assert.strictEqual(w.total,2,'条数只算对方消息');
  assert.strictEqual(C.activeWindowText({meta:{},messages:[{dir:'them',ts:T(17,5),text:'c'},{dir:'me',ts:T(9,1),text:'x'}]}).text,'17点','只有一个小时时不显示区间');
  assert.strictEqual(C.activeWindowText({meta:{},messages:[{dir:'me',ts:T(9,1),text:'x'}]}).text,'','我发的消息不算——没有对方消息时窗口为空');
});
ok('v1.4.6：列表按最后活动排序 / 状态列去噪 / 活跃数字直接显示 / 令牌过期提示', ()=>{
  const T=(h,m)=>new Date(2026,8,20,h,m).getTime();
  const a={meta:{},messages:[{dir:'them',ts:T(9,10),text:'x'}]};
  const b={meta:{},messages:[{dir:'them',ts:T(17,10),text:'y'}]};
  assert.ok(C.lastActiveTs(b)>C.lastActiveTs(a),'lastActiveTs：取最后一条消息时间');
  assert.strictEqual(C.lastActiveTs({meta:{lastTime:'2026-09-20 08:00'},messages:[]})>0,true,'没有消息时回退 meta.lastTime');
  assert.strictEqual(C.lastActiveTs({meta:{},messages:[]}),0,'都没有则为 0（排在最后）');
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/last:lastActiveTs\(e\.s\)/.test(src)&&/b\.last-a\.last/.test(src),'列表改用最后活动时间排序（先预计算 last 再比较，不再依赖空的 meta.lastTime）');
  assert.ok(/v===false\|\|v===0\|\|v==='0'/.test(src),'状态列过滤 0 / false / 空串标记');
  assert.ok(/if\(url\)\{ s\.msgUrl=url; s\.msgUrlAt=now\(\); \}/.test(src),'msgUrl 每次捕获都刷新（securityId 会轮换）');
  assert.ok(/const actNums=/.test(src)&&/esc\(actNums\)/.test(src),'每小时条数直接写进列表（不只放在悬停提示里）');
  assert.ok(/都返回空列表/.test(src),'收录全返回空时提示「令牌可能已过期」');
});

ok('v1.4.7 UI：直方图竖列 / 每行活跃条 / 整行可点 / 搜索 / 折叠区 / 顶部状态点', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/#bcPanel \.bc-hist\{/.test(src) && /#bcPanel \.bc-col .bc-bar\{/.test(src), '24 小时直方图改成竖列（.bc-hist / .bc-col .bc-bar 有样式）');
  assert.ok(!/bc-hist-row/.test(src), '旧的 24 行横条（bc-hist-row）已删除');
  assert.ok(/function onlineText\(s\)\{/.test(src) && /在线时间线/.test(src) && /推进信号/.test(src), 'v1.5.1：「对方活跃时段」已换成「在线时间线 + 推进信号」');
  assert.ok(/function heatStrip\(s\)\{/.test(src) && /#bcPanel \.bc-heat i\.on\{/.test(src), '会话列表每行有 24 格活跃条（heatStrip + CSS）');
  assert.ok(/heatStrip\(s\)/.test(src), '活跃条接进了列表渲染');
  assert.ok(src.indexOf('data-open')>=0 && (src.indexOf("esc(e.k)")>=0 || src.indexOf("esc(it.e.k)")>=0), '列表行带 data-open（整行可点）');
  assert.ok(/tr\[data-open\]/.test(src) && /function openSessionInPage\(key\)\{/.test(src), '有点开会话的处理函数与样式');
  assert.ok(/el\.closest\('#bcRoot'\)/.test(src), '找会话时排除自己面板里的元素（不会误点面板自身）');
  assert.ok(/id="bcQ"/.test(src) && /function renderList\(\)\{/.test(src), '会话列表有搜索框，且只重画列表（输入框不失焦）');
  assert.ok(/details class="bc-fold"/.test(src) && /#bcPanel details\.bc-fold\{/.test(src), '导出/设置/AI/日志收进折叠区');
  assert.ok(/id="bcDot"/.test(src) && /ui\.dot\.className='bc-dot'/.test(src), '顶部状态点显示钩子状态');
  assert.ok(/bc-btn bc-primary/.test(src), '主操作按钮有主色样式');
})
ok('v1.5.4 UI：推进信号三个带框卡片 / 首响列下架', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/\.bc-sig\{display:grid/.test(src), '推进信号容器是三列 grid');
  assert.ok(/\.bc-sigbox\{/.test(src) && /bc-sig-amber/.test(src) && /bc-sig-red/.test(src) && /bc-sig-green/.test(src), '三个框各有配色');
  assert.ok(/function sigBox\(/.test(src), 'sigBox 渲染函数存在');
  assert.ok(src.indexOf('<th class="bc-nowrap">首响</th>')<0, '会话列表表头不再有首响列');
  assert.ok(/closest\('\[data-open\]'\)/.test(src), '点击委托扩到 [data-open]（框内会话可点）');
  assert.ok(/首响\(分钟\)/.test(src), '首响数据保留在复盘 CSV（不丢数据）');
  assert.ok(/bc-sigitem/.test(src) && /data-open=/.test(src), '框内会话带 data-open 可点击');
});
ok('v0.9.4 / v1.5.5 / v0.5.3：watcher / chat / insight 面板可拖动（位置存本机）', ()=>{
  const fs2=require('fs'), pj=require('path');
  const w=fs2.readFileSync(pj.join(__dirname,'..','boss-watcher.user.js'),'utf8');
  const c=fs2.readFileSync(pj.join(__dirname,'..','boss-chat.user.js'),'utf8');
  const i2=fs2.readFileSync(pj.join(__dirname,'..','boss-insight.user.js'),'utf8');
  assert.ok(/function makePanelDraggable\(/.test(w)&&/bw_panelpos/.test(w)&&/applyPanelPos\(bwUi\.panel/.test(w), 'watcher 面板可拖且接线');
  assert.ok(/function makePanelDraggable\(/.test(c)&&/bc_panelpos/.test(c)&&/applyPanelPos\(ui\.panel/.test(c), 'chat 面板可拖且接线');
  assert.ok(/function makePanelDraggable\(/.test(i2)&&/bi_panelpos/.test(i2)&&/applyPanelPos\(ui\.panel/.test(i2), 'insight 面板可拖且接线');
  assert.ok(/position:fixed;right:18px;bottom:210px/.test(i2), 'insight 面板改 fixed 定位');
});
ok('v0.5.5/v1.5.7：悬浮球可拖 + 面板按尺寸钳位 + 越界自愈', ()=>{
  const ins=require('fs').readFileSync(require('path').join(__dirname,'..','boss-insight.user.js'),'utf8');
  const ch=require('fs').readFileSync(require('path').join(__dirname,'..','boss-chat.user.js'),'utf8');
  assert.ok(/bi_fabpos/.test(ins) && /bc_fabpos/.test(ch), '球位置存储键存在');
  assert.ok(/applyFabPos\(ui\.fab/.test(ins) && /applyFabPos\(ui\.fab/.test(ch), '球位置恢复接进 buildUI');
  assert.ok(/makePanelDraggable\(ui\.fab,ui\.fab/.test(ins) && /makePanelDraggable\(ui\.fab,ui\.fab/.test(ch), '球本身可拖');
  assert.ok(/p!==handle&&e\.target/.test(ins) && /p!==handle&&e\.target/.test(ch), '拖把手本身时不跳过 button 守卫');
  // v0.5.7：insight 把「只在拖悬浮球时吞」放宽成「任何拖动后都吞」—— 面板把手拖完，落点也可能压着开关；
  // 同时不再假设 pointerup 之后一定有 click（触屏上可能没有，原来那样会白等并吞掉下一次真实点击）。
  assert.ok(/if\(moved\)\{/.test(ins), '拖动后吞掉误触的 click（insight：v0.5.7 起任何拖动都吞）');
  assert.ok(/moved&&p===handle/.test(ch), '拖动后吞掉误触的 click（chat：仅拖球时吞）');
  assert.ok(/offsetWidth\|\|560/.test(ins) && /offsetWidth\|\|660/.test(ch), '钳位按面板实际宽度算');
  assert.ok(/localStorage\.removeItem\('bi_panelpos'\)/.test(ins) && /localStorage\.removeItem\('bc_panelpos'\)/.test(ch), '打开时越界自愈回默认位');
});

ok('会话导出带上「对方活跃时段 / 活跃点数」两列', ()=>{
  const T=(h,m)=>new Date(2026,8,20,h,m).getTime();
  C.store.chats['59689001']={meta:{sessionId:'59689001',company:'测试公司',boss:'张三'},messages:[
    {dir:'them',ts:T(11,5),text:'在吗'},{dir:'them',ts:T(11,30),text:'在的'},{dir:'me',ts:T(11,40),text:'你好'}]};
  const rows=C.chatSessionRows();
  const head=rows[0];
  const i=head.indexOf('对方活跃时段');
  assert.ok(i>=0,'表头有「对方活跃时段」');
  assert.strictEqual(head[i+1],'对方活跃点数','后面紧跟「对方活跃点数」');
  const row=rows.find(r=>r[3]==='59689001');
  assert.ok(!!row,'导出行存在');
  assert.strictEqual(row[i],'11:2','活跃时段按「小时:条数」输出');
  assert.strictEqual(row[i+1],1,'活跃点数=1（只统计对方发消息的小时）');
});

console.log('v0.7.2 监控脚本：Key / 备份 / 换日 / 检查时间');
ok('W3 额度/预算按本地日期换日（不再用 UTC 的 toISOString）', ()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','boss-watcher.user.js'),'utf8');
  assert.ok(!/toISOString\(\)\.slice\(0,10\)/.test(src), '脚本内已无 UTC 换日写法');
  const d=new Date(), p=x=>String(x).padStart(2,'0');
  const local=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  assert.strictEqual(T.localDateStr(), local, 'localDateStr 返回本地日期');
  assert.strictEqual(T.budgetDate(), local, '监控预算按本地日期');
});
console.log('v0.7.3 修复：要求拔高误报（DOM 脏值 / 等级相同）');
ok('W8 经验等级解析：先抓年限数字、再判「不限」（脏串不再被误判为 0）', ()=>{
  assert.strictEqual(T.expRank('1-3年·学历不限·单体店·有奶茶店经验'), 3, '脏串取年限 3，而不是被「学历不限」判 0');
  assert.strictEqual(T.expRank('3-5年·学历不限'), 5);
  assert.strictEqual(T.expRank('1至3年'), 3, '支持「至」写法');
  assert.strictEqual(T.expRank('经验不限'), 0);
  assert.strictEqual(T.expRank('无需经验'), 0);
  assert.strictEqual(T.expRank('在校生'), 0);
  assert.strictEqual(T.expRank(''), null);
});
ok('W8b DOM 标签只挑经验项；脏值展示前清洗', ()=>{
  assert.strictEqual(T.pickExpTag(['1-3年','学历不限','单体店','有奶茶店经验']), '1-3年');
  assert.strictEqual(T.pickExpTag(['经验不限','大专']), '经验不限');
  assert.strictEqual(T.pickExpTag(['大专','深圳']), '', '挑不出经验标签时留空（宁缺毋滥）');
  assert.strictEqual(T.fmtExp('3-5年·学历不限'), '3-5年');
  assert.strictEqual(T.fmtExp('3-5年'), '3-5年');
});

console.log('');
console.log('变更日志：首次补全不记变更 / 批量清理（watcher v0.7.5）');
ok('W9c isNoiseChange：只认「全是未知→值」且没备注、没标跟进', ()=>{
  assert.strictEqual(T.isNoiseChange({changes:['Boss活跃：未知 → false']}), true);
  assert.strictEqual(T.isNoiseChange({changes:['学历要求：未知 → 中专/中技','经验要求：未知 → 1-3年']}), true);
  assert.strictEqual(T.isNoiseChange({changes:['Boss活跃：未知 → false','薪资（下调）：20-30K → 15-20K']}), false, '混了真变更不算');
  assert.strictEqual(T.isNoiseChange({changes:['学历要求：未知 → 大专'], done:true}), false, '标了跟进不动');
  assert.strictEqual(T.isNoiseChange({changes:['学历要求：未知 → 大专'], note:'已加微信'}), false, '有备注不动');
  assert.strictEqual(T.isNoiseChange({changes:['薪资（下调）：20-30K → 15-20K']}), false);
  assert.strictEqual(T.isNoiseChange({changes:[]}), false);
});
ok('W9d removeChanges 批量删除 + undoRemoveChanges 按时间倒序恢复', ()=>{
  const keep=T.store.changelog;
  try{
    T.store.changelog=[
      {id:'x1',ts:3000,jobName:'A',changes:['薪资（下调）：20-30K → 15-20K']},
      {id:'x2',ts:2000,jobName:'B',changes:['学历要求：未知 → 大专']},
      {id:'x3',ts:1000,jobName:'C',changes:['Boss活跃：未知 → false']}
    ];
    assert.deepStrictEqual(T.noiseChangeIds().sort(), ['x2','x3'], '只挑出「未知→值」补全类');
    assert.strictEqual(T.removeChanges(['x1','x3']), 2, '批量删 2 条');
    assert.deepStrictEqual(T.store.changelog.map(c=>c.id), ['x2']);
    assert.strictEqual(T.removeChanges(['不存在']), 0, '无匹配返回 0');
    assert.strictEqual(T.undoRemoveChanges(), 2, '撤销恢复 2 条');
    assert.deepStrictEqual(T.store.changelog.map(c=>c.id), ['x1','x2','x3'], '恢复后按 ts 倒序');
  } finally { T.store.changelog=keep; }
});

console.log('v0.8.0：实时页面数据 / 值归一化 / 历史误报清理 / AI 大脑');
ok('V1a canonExp：脏标签串与干净值归一化到同一形态', ()=>{
  assert.strictEqual(T.canonExp('1-3年·学历不限·单体店，有奶茶店经验'), '1-3年');
  assert.strictEqual(T.canonExp('3-5年 · 学历不限'), '3-5年');
  assert.strictEqual(T.canonExp('1年以内 · 学历不限 · 工商变更'), '1年以内');
  assert.strictEqual(T.canonExp('1至3年'), '1-3年');
  assert.strictEqual(T.canonExp('经验不限 · 学历不限'), '经验不限');
  assert.strictEqual(T.canonExp('不限'), '经验不限');
  assert.strictEqual(T.canonExp(''), '');
});
ok('V1b canonEdu：学历统一成等级词', ()=>{
  assert.strictEqual(T.canonEdu('学历不限 · 大专以上'), '大专');
  assert.strictEqual(T.canonEdu('本科'), '本科');
  assert.strictEqual(T.canonEdu('中专/中技'), '中专/中技');
  assert.strictEqual(T.canonEdu('不限'), '学历不限');
  assert.strictEqual(T.canonEdu(''), '');
});
ok('V2a reqLineBogus：识别「等级相同却报拔高」的变化行', ()=>{
  assert.strictEqual(T.reqLineBogus('经验要求：1-3年 · 学历不限 · 单体店 · 有奶茶店经验 → 1-3年'), true);
  assert.strictEqual(T.reqLineBogus('经验要求：1年以内 · 学历不限 · 工商变更 · 工商外勤 → 1年以内'), true);
  assert.strictEqual(T.reqLineBogus('经验要求：3-5年 · 学历不限 → 3-5年'), true);
  assert.strictEqual(T.reqLineBogus('经验要求：1-3年 → 3-5年'), false, '真拔高不算误报');
  assert.strictEqual(T.reqLineBogus('薪资（下调）：20-30K → 15-20K'), false);
});
ok('V2b isBogusChange：你截图里那 9 条会被判定为误报（且不动人工资产）', ()=>{
  const thx={level:'warn',jobName:'网红奶茶店店员',company:'赛奋荣',
    changes:['Boss活跃：未知 → true','经验要求：1-3年 · 学历不限 · 单体店 · 有奶茶店经验 → 1-3年'],
    signals:[{level:'warn',text:'要求拔高（经验要求：1-3年 · 学历不限 · 单体店 · 有奶茶店经验 → 1-3年）'}]};
  assert.strictEqual(T.isBogusChange(thx), true);
  assert.strictEqual(T.isBogusChange(Object.assign({},thx,{done:true})), false, '标了跟进不动');
  assert.strictEqual(T.isBogusChange(Object.assign({},thx,{note:'已联系'})), false, '有备注不动');
  const real={level:'warn',changes:['经验要求：1-3年 → 3-5年'],signals:[{level:'warn',text:'要求拔高（经验要求：1-3年 → 3-5年）'}]};
  assert.strictEqual(T.isBogusChange(real), false, '真拔高必须保留');
  const mixed={level:'info',changes:['薪资（下调）：20-30K → 15-20K'],signals:[]};
  assert.strictEqual(T.isBogusChange(mixed), false);
});
ok('V2c bogusChangeIds + cleanBogusChanges 一键清理（可撤销）', ()=>{
  const keep=T.store.changelog;
  try{
    T.store.changelog=[
      {id:'b1',ts:5000,changes:['经验要求：1-3年 · 学历不限 → 1-3年'],signals:[{level:'warn',text:'要求拔高（经验要求：1-3年 · 学历不限 → 1-3年）'}]},
      {id:'b2',ts:4000,changes:['经验要求：1-3年 → 3-5年'],signals:[{level:'warn',text:'要求拔高（经验要求：1-3年 → 3-5年）'}]},
      {id:'b3',ts:3000,changes:['薪资（下调）：20-30K → 15-20K'],signals:[{level:'warn',text:'薪资（下调）'}]}
    ];
    assert.deepStrictEqual(T.bogusChangeIds(), ['b1']);
    assert.strictEqual(T.cleanBogusChanges(), 1);
    assert.deepStrictEqual(T.store.changelog.map(c=>c.id), ['b2','b3']);
    assert.strictEqual(T.undoRemoveChanges(), 1, '可撤销恢复');
  } finally { T.store.changelog=keep; }
});
ok('V3b 默认不再「浏览即建档」（v0.9.0 按需收录；v0.9.2/v0.9.5 删掉死开关）', ()=>{
  // 原来这里断言两个开关的取值（autoList=false / onlyWatch=true）。v0.9.2 起这两个开关被删除：
  // 只有 UI 行、没有任何逻辑读，勾了什么都不发生（功能性欺骗）。所以现在的正确断言是「键不存在」，
  // 而不是「值为 false」—— 否则测试会永远红。
  assert.ok(!('autoList' in T.DEFAULTS.monitor), '已无「列表页自动收录」开关（v0.9.2 删除死开关）');
  assert.ok(T.DEFAULTS.watch && T.DEFAULTS.watch.snapHistory>=5 && T.DEFAULTS.watch.chgMax>=100, '监控项配置存在');
  assert.ok(!('onlyWatch' in T.DEFAULTS.monitor), '已无「只检查盯住的」开关（口径固定：只查盯住的）');
  assert.strictEqual(T.DEFAULTS.monitor.active, false, '低频自动检查默认关');
  assert.ok('compareCount' in T.DEFAULTS.monitor && 'lastCompareAt' in T.DEFAULTS.monitor, '对比计数口径存在');
});
ok('V4a vueJobOf：列表项/详情项都能映射成建档入参', ()=>{
  const list=T.vueJobOf({jobId:'j1',name:'运营',salary:'15-20K',exp:'1-3年',edu:'大专',company:'某公司',city:'深圳',area:'南山区',online:1,publish:1700000000000,labels:['双休'],sec:'SEC123'},'list');
  assert.strictEqual(list.partial, true, '列表没有 JD，必须 partial');
  assert.strictEqual(list.source, 'vue-list');
  assert.strictEqual(list.active, true);
  assert.strictEqual(list.sec, 'SEC123');
  const det=T.vueJobOf({jobId:'j1',name:'运营',salary:'15-20K',jd:'岗位职责…',addr:'深圳市南山区科技园',status:'在招'},'detail');
  assert.strictEqual(det.partial, undefined);
  assert.strictEqual(det.jd, '岗位职责…');
  assert.strictEqual(det.status, '在招');
  assert.ok('detailUrl' in det, '详情项带链接字段（浏览器里是当前详情页地址；Node 下为空串）');
});
ok('V4b vueJobOf：缺 jobId 直接丢弃（宁缺毋滥）', ()=>{
  assert.strictEqual(T.vueJobOf({name:'x'},'list'), null);
});
ok('V6 vueIngest：没收录的岗位一行都不记；收录后才对比（v0.9.0 端到端）', ()=>{
  const keep={jobs:T.store.jobs,watch:T.store.watch,changelog:T.store.changelog,settings:T.store.settings,logs:T.store.logs,signals:T.store.signals};
  try{
    T.store.jobs={}; T.store.watch={}; T.store.changelog=[]; T.store.signals=[]; T.store.logs=[];
    T.store.settings={monitor:{compareDate:'', compareCount:0, lastCompareAt:0}, risk:{scanJd:true}, watch:{snapHistory:20, chgMax:300, sigMax:200}};
    T.vueIngest({list:[{jobId:'v1',name:'前端工程师',salary:'20-30K',exp:'1-3年',edu:'大专',company:'A公司',city:'深圳·南山区',online:1}]});
    assert.strictEqual(Object.keys(T.store.jobs).length, 0, '没收录 → 一行都不记（整页预处理已删）');
    assert.strictEqual(T.store.changelog.length, 0, '变更日志不受未收录岗位影响');
    // 收录后再喂数据 → 只对比已收录项
    const it=T.upsertWatchItem({type:'job',jobId:'v1',company:'A公司',name:'前端工程师',source:'test'});
    it.last=T.snapFromJob({jobId:'v1',name:'前端工程师',salary:'20-30K',exp:'1-3年',edu:'大专',company:'A公司',city:'深圳·南山区',status:'在招'},null);
    T.vueIngest({list:[{jobId:'v1',name:'前端工程师',salary:'15-20K',exp:'1-3年',edu:'大专',company:'A公司',city:'深圳·南山区',online:0}]});
    assert.ok(T.store.changelog.length>=1, '再次遇到 → 写变更日志');
    assert.ok(/下调/.test(JSON.stringify(T.store.changelog[0])), '下调信号');
    assert.ok(T.store.changelog[0].itemId, '流水带监控项ID');
    assert.ok(T.store.signals.length>=1, '跟进信号（待办）已生成');
    assert.ok(/薪资/.test(T.store.signals[0].kind||''), '信号类型=薪资变化');
    assert.ok(T.store.settings.monitor.compareCount>=1, '对比计数已累加');
    assert.ok(T.store.settings.monitor.lastCompareAt>0, '最后对比时间已更新');
    assert.strictEqual(T.store.jobs['v1'].last.salary,'15-20K', '快照已更新');
    // 同样的数据再喂一遍（2.5 秒去重窗口内）→ 不重复写日志
    const n1=T.store.changelog.length;
    T.vueIngest({list:[{jobId:'v1',name:'前端工程师',salary:'15-20K',exp:'1-3年',edu:'大专',company:'A公司',city:'深圳·南山区',online:0}]});
    assert.strictEqual(T.store.changelog.length, n1, '重复数据不重复记账');
  } finally { T.store.jobs=keep.jobs; T.store.watch=keep.watch; T.store.changelog=keep.changelog; T.store.settings=keep.settings; T.store.logs=keep.logs; T.store.signals=keep.signals; }
});
ok('V7 vueFetchHtml：Node（无 location）不抛异常，安全返回空串', ()=>{
  assert.strictEqual(T.vueFetchHtml(), '');
});

// ===== v0.9.0：按需收录（粘贴 → 搜索定位 → 快照）+ 字段级对比 + 导出导入 + 迁移 =====
console.log('v0.9.0：按需收录 / 监控项 / 跟进信号');
ok('X1 parseRecordLine：公司+职位 / 分隔符 / 链接 / 职位ID / 只有职位名', ()=>{
  const a=T.parseRecordLine('深圳乐有家控股集团 管培生');
  assert.strictEqual(a.company,'深圳乐有家控股集团');
  assert.strictEqual(a.jobName,'管培生');
  const b=T.parseRecordLine('乐有家 | 管培生');
  assert.strictEqual(b.company,'乐有家');
  assert.strictEqual(b.jobName,'管培生');
  const c=T.parseRecordLine('https://www.zhipin.com/job_detail/1d18559d696cdc4d0nJ-2Ny0FFVY.html');
  assert.strictEqual(c.jobId,'1d18559d696cdc4d0nJ-2Ny0FFVY');
  const d=T.parseRecordLine('1d18559d696cdc4d0nJ-2Ny0FFVY');
  assert.strictEqual(d.jobId,'1d18559d696cdc4d0nJ-2Ny0FFVY');
  const e=T.parseRecordLine('前端工程师');
  assert.strictEqual(e.jobName,'前端工程师');
  assert.strictEqual(T.parseRecordLine('   '), null);
});
ok('X2 scoreCandidates：公司+职位都命中排第一；都不沾的直接丢掉', ()=>{
  const list=[
    {jobId:'a',name:'管培生',company:'深圳乐有家控股集团'},
    {jobId:'b',name:'管培生',company:'别的公司'},
    {jobId:'c',name:'销售',company:'深圳乐有家控股集团'}
  ];
  const r=T.scoreCandidates(list,{company:'深圳乐有家控股集团',jobName:'管培生'});
  assert.strictEqual(r[0].c.jobId,'a');
  assert.ok(r[0].score>=100, '公司和职位都对上 = 高置信');
  assert.strictEqual(T.scoreCandidates([{jobId:'z',name:'x',company:'y'}],{company:'A',jobName:'B'}).length,0);
});
ok('X3 diffWatch：首次补全不记 / 拼接串不记 / HR 换人记一条', ()=>{
  assert.deepStrictEqual(T.diffWatch({salary:'',exp:'',edu:'',hr:''},{salary:'15-20K',exp:'1-3年',edu:'大专',hr:'张三'}), [], '未知 → 值 = 补全，不是变化');
  const same=T.diffWatch({salary:'15-20K',exp:'3-5年',edu:'大专',hr:'张三',jd:'a'},{salary:'15-20K',exp:'3-5年',edu:'大专',hr:'张三',jd:'a'});
  assert.strictEqual(same.length,0,'完全一样 → 0 条');
  const hr=T.diffWatch({salary:'15-20K',hr:'张三'},{salary:'15-20K',hr:'李四'});
  assert.strictEqual(hr.length,1);
  assert.strictEqual(hr[0].field,'HR');
  assert.ok(/换人/.test(hr[0].text));
});
ok('X4 diffWatch：薪资下调=warn / 要求拔高=warn / 等级相同不报', ()=>{
  const down=T.diffWatch({salary:'20-30K'},{salary:'15-20K'});
  assert.strictEqual(down[0].field,'薪资');
  assert.strictEqual(down[0].level,'warn');
  assert.ok(/下调/.test(down[0].text));
  const up=T.diffWatch({exp:'1-3年'},{exp:'3-5年'});
  assert.strictEqual(up[0].field,'经验');
  assert.strictEqual(up[0].level,'warn');
  assert.strictEqual(T.diffWatch({exp:'1-3年'},{exp:'1-3年'}).length,0,'同等级不报');
  assert.strictEqual(T.diffWatch({exp:'1-3年'},{exp:''}).length,0,'新值空 → 不报');
});
ok('X5 applyWatchChanges：写原始流水（itemId/字段/旧→新）+ 生成待办', ()=>{
  const keep={changelog:T.store.changelog,signals:T.store.signals};
  try{
    T.store.changelog=[]; T.store.signals=[];
    const item={id:'job:abc', jobId:'abc', jobName:'管培生', company:'乐有家', hr:'张三'};
    const n=T.applyWatchChanges(item,[{field:'薪资',from:'20-30K',to:'15-20K',level:'warn',text:'薪资（下调）：20-30K → 15-20K'}],'page');
    assert.strictEqual(n,1);
    assert.strictEqual(T.store.changelog[0].itemId,'job:abc');
    assert.strictEqual(T.store.changelog[0].field,'薪资');
    assert.strictEqual(T.store.changelog[0].from,'20-30K');
    assert.strictEqual(T.store.changelog[0].to,'15-20K');
    assert.strictEqual(T.store.signals.length,1,'待办已生成');
    assert.ok(/乐有家|管培生/.test(T.store.signals[0].text));
    // 同一条变化 10 分钟内不重复
    assert.strictEqual(T.applyWatchChanges(item,[{field:'薪资',from:'20-30K',to:'15-20K',level:'warn',text:'x'}],'page'),0);
  } finally { T.store.changelog=keep.changelog; T.store.signals=keep.signals; }
});
ok('X6 observeJob：没收录的岗位不产生任何记录', ()=>{
  const keep={jobs:T.store.jobs,watch:T.store.watch,changelog:T.store.changelog,signals:T.store.signals};
  try{
    T.store.jobs={}; T.store.watch={}; T.store.changelog=[]; T.store.signals=[];
    T.observeJob({jobId:'nope',name:'X',salary:'1-2K',company:'Y',source:'test'});
    assert.strictEqual(Object.keys(T.store.jobs).length,0);
    assert.strictEqual(T.store.changelog.length,0);
  } finally { T.store.jobs=keep.jobs; T.store.watch=keep.watch; T.store.changelog=keep.changelog; T.store.signals=keep.signals; }
});
ok('X7 监控项身份：同一岗位不同 HR = 两个监控项', ()=>{
  assert.notStrictEqual(T.itemIdOfJob({jobId:'j1',company:'A',name:'运营',hr:'张三'}), T.itemIdOfJob({jobId:'j2',company:'A',name:'运营',hr:'李四'}));
  assert.strictEqual(T.itemIdOfCompany('深圳乐有家控股集团'), T.itemIdOfCompany(' 深圳乐有家控股集团 '),'公司名归一化');
});
ok('X8 导出 → 清空 → 导入：监控项/HR/快照往返一致', ()=>{
  const keep={jobs:T.store.jobs,watch:T.store.watch,signals:T.store.signals,changelog:T.store.changelog,settings:T.store.settings};
  try{
    T.store.jobs={}; T.store.watch={}; T.store.signals=[]; T.store.changelog=[];
    T.store.settings=Object.assign({},T.store.settings,{watch:{snapHistory:20,chgMax:300,sigMax:200}});
    const it=T.upsertWatchItem({type:'job',jobId:'imp1',company:'某公司',name:'运营专员',hr:'王女士',url:'https://www.zhipin.com/job_detail/imp1.html',source:'test'});
    it.last=T.snapFromJob({jobId:'imp1',name:'运营专员',company:'某公司',hr:'王女士',salary:'12-18K',exp:'1-3年',status:'在招'},null);
    T.store.signals=[{id:'s1',itemId:'job:imp1',ts:Date.now(),kind:'薪资变化',level:'warn',text:'x',status:'open'}];
    const dump=JSON.stringify(T.watchExportData());
    assert.ok(/imp1/.test(dump)&&/王女士/.test(dump),'导出包含监控项与 HR');
    T.clearWatchData();
    assert.strictEqual(Object.keys(T.store.watch).length,0,'清空生效');
    const r=T.importWatchJSON(dump);
    assert.strictEqual(r.add,1);
    const back=T.store.watch['job:imp1'];
    assert.ok(back,'导入后监控项回来');
    assert.strictEqual(back.hr,'王女士','HR 保留');
    assert.strictEqual(back.last.salary,'12-18K','快照保留');
    assert.strictEqual(T.store.signals.length,1,'待办保留');
  } finally { T.store.jobs=keep.jobs; T.store.watch=keep.watch; T.store.signals=keep.signals; T.store.changelog=keep.changelog; T.store.settings=keep.settings; }
});
ok('X9 migrateTo090：只保留你盯住的，清掉自动档案 + 历史噪音', ()=>{
  const keep={jobs:T.store.jobs,watch:T.store.watch,changelog:T.store.changelog,settings:T.store.settings,signals:T.store.signals};
  try{
    T.store.watch={}; T.store.signals=[]; T.store.settings=Object.assign({},T.store.settings,{watch:{snapHistory:20,chgMax:300,sigMax:200}});
    T.store.jobs={
      keep1:{jobId:'keep1',watch:true,meta:{name:'运营',company:'A公司'},last:{ts:1,salary:'10-15K',status:'在招'},first:{ts:1},snapshots:[],changes:[]},
      drop1:{jobId:'drop1',watch:false,meta:{name:'销售',company:'B公司'},last:{ts:1},first:{ts:1}},
      drop2:{jobId:'drop2',watch:false,meta:{name:'客服',company:'C公司'},last:{ts:1},first:{ts:1}}
    };
    T.store.changelog=[{id:'n1',ts:1,jobId:'x',jobName:'x',changes:['经验要求：未知 → 1-3年'],level:'info'}];
    T.migrateTo090();
    assert.ok(T.store.watch['job:keep1'],'盯住的岗位转成监控项');
    assert.strictEqual(Object.keys(T.store.jobs).length,1,'未盯住的自动档案被清掉');
    assert.strictEqual(T.store.jobs['keep1'].itemId,'job:keep1','监控项与 jobs 同对象');
    assert.strictEqual(T.store.changelog.filter(c=>/未知 →/.test((c.changes||[]).join(''))).length,0,'历史「未知 → 值」噪音已清');
  } finally { T.store.jobs=keep.jobs; T.store.watch=keep.watch; T.store.changelog=keep.changelog; T.store.settings=keep.settings; T.store.signals=keep.signals; }
});

console.log('通过 ' + passed + ' 项断言');
if (process.exitCode) { console.error('存在失败项'); process.exit(1); }
