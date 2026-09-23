// 仪表盘端到端测试：加载 dashboard.html，走「文件导入 → 渲染 → 筛选 → 展开详情」全链路。
// 依赖：Playwright
//   npm i playwright
//   node tests/test_dashboard.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PAGE = 'file:///' + path.join(__dirname, '..', 'dashboard.html').replace(/\\/g, '/');
const T = 1700000000000;

const FIXTURE = {
  jobs: {
    job1: {
      jobId: 'job1',
      meta: { name: '前端工程师', company: '测试科技', city: '上海', exp: '3-5年', edu: '本科', boss: '张经理', url: 'https://www.zhipin.com/' },
      first: { ts: T - 259200000, salary: '20-30K', jd: '负责前端开发\n熟悉 React\n入职需先交培训费', status: '在招', active: null },
      last: { ts: T, salary: '25-35K', jd: '负责前端开发\n熟悉 React\n熟悉 Vue', status: '在招', active: null },
      snapshots: [{ ts: T - 259200000, salary: '20-30K', jd: '负责前端开发\n熟悉 React\n入职需先交培训费', status: '在招', active: null }],
      changes: [{ ts: T, type: 'job', jobName: '前端工程师', company: '测试科技', changes: ['薪资：20-30K → 25-35K'] }],
      risk: { score: 0, level: '低', hits: [] }
    },
    job2: {
      jobId: 'job2',
      meta: { name: 'Java开发（培训生）', company: '某教育咨询', city: '上海', exp: '经验不限', edu: '大专', boss: '李老师', url: '' },
      first: { ts: T - 86400000, salary: '8-15K', jd: '零基础可做\n入职前需参加培训\n培训费可分期', status: '在招', active: null },
      last: { ts: T - 7200000, salary: '8-15K', jd: '零基础可做\n入职前需参加培训\n培训费可分期', status: '下线', active: null },
      snapshots: [],
      changes: [{ ts: T - 7200000, type: 'job', jobName: 'Java开发（培训生）', company: '某教育咨询', changes: ['状态：在招 → 下线'] }],
      risk: { score: 50, level: '中', hits: [{ name: '先交费/培训贷', cat: '收费陷阱', weight: 30, kw: ['培训费'] }] }
    }
  },
  chats: {
    f1: {
      meta: { sessionId: 'f1', company: '测试科技', boss: '张经理', jobId: 'job1', jobName: '前端工程师', lastTime: T, unread: 1 },
      messages: [
        { mid: 'm1', dir: 'me', ts: T - 600000, text: '您好，我对贵司岗位感兴趣' },
        { mid: 'm2', dir: 'them', ts: T - 540000, text: '你好，方便发下简历吗' },
        { mid: 'm3', dir: 'me', ts: T - 300000, text: '您好，方便发下简历吗' },
        { mid: 'm4', dir: 'them', ts: T - 240000, text: '可以的，加微信详聊' }
      ]
    }
  },
  changelog: [
    { id: 'c2', ts: T - 7200000, jobName: 'Java开发（培训生）', company: '某教育咨询', changes: ['状态：在招 → 下线'] },
    { id: 'c1', ts: T, jobName: '前端工程师', company: '测试科技', changes: ['薪资：20-30K → 25-35K'] }
  ],
  riskHits: [
    { ts: T, src: 'jd', company: '某教育咨询', jobName: 'Java开发（培训生）', text: '零基础可做 入职前需参加培训', score: 50, level: '中', hits: [{ name: '先交费/培训贷', cat: '收费陷阱', weight: 30 }] },
    { ts: T - 7200000, src: 'chat', company: '某教育咨询', jobName: 'Java开发（培训生）', text: '先交培训费，培训完安排上岗', score: 30, level: '中', hits: [{ name: '先交费/培训贷', cat: '收费陷阱', weight: 30 }] }
  ],
  rules: [], settings: { chat: { replyWindowHours: 24 } }
};

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}
function text(page, id) { return page.evaluate((i) => { const e = document.getElementById(i); return e ? e.textContent : '(missing)'; }, id); }

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const errors = [];
  context.on('page', (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  });
  const page = await context.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });

  console.log('初始状态');
  check('页面标题正确', (await page.title()).includes('仪表盘'));
  check('无数据时只显示导入区', await page.evaluate(() => !document.getElementById('drop').classList.contains('hidden') && document.getElementById('dash').classList.contains('hidden')));

  console.log('导入备份文件（真实 file input → FileReader → 渲染）');
  await page.setInputFiles('#file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(FIXTURE), 'utf8') });
  await page.waitForTimeout(300);
  check('导入后切换到仪表盘', await page.evaluate(() => document.getElementById('drop').classList.contains('hidden') && !document.getElementById('dash').classList.contains('hidden')));

  const cards = await text(page, 'cards');
  check('概览卡片：岗位/风险/变更/会话/消息/命中', cards.includes('监控岗位') && cards.includes('2') && cards.includes('中高风险岗位') && cards.includes('变更记录') && cards.includes('会话') && cards.includes('风险命中记录'), cards.slice(0, 160));

  const jobs = await text(page, 'jobs');
  check('岗位表：岗位与公司', jobs.includes('前端工程师') && jobs.includes('测试科技'));
  check('岗位表：薪资与状态', jobs.includes('25-35K') && jobs.includes('下线'));
  check('岗位表：风险等级徽标', jobs.includes('中 50'));
  check('岗位表：最近变更摘要', jobs.includes('薪资：20-30K → 25-35K'));

  console.log('展开岗位详情');
  await page.evaluate(() => document.querySelector('[data-act=open][data-id=job1]').click());
  await page.waitForTimeout(150);
  const jobs2 = await text(page, 'jobs');
  check('详情：显示 JD 原文', jobs2.includes('熟悉 Vue'));
  check('详情：显示快照历史', jobs2.includes('快照历史'));
  check('详情：显示变更历史', jobs2.includes('变更历史'));
  check('详情：按钮变为收起', jobs2.includes('收起'));
  await page.evaluate(() => document.querySelector('[data-act=open][data-id=job2]').click());
  await page.waitForTimeout(150);
  check('详情：显示风险命中规则', (await text(page, 'jobs')).includes('先交费/培训贷'));

  console.log('筛选与排序');
  await page.fill('#q', '前端');
  await page.waitForTimeout(150);
  const filtered = await text(page, 'jobs');
  check('搜索过滤生效', filtered.includes('前端工程师') && !filtered.includes('Java开发'));
  await page.fill('#q', '');
  await page.selectOption('#fStatus', '下线');
  await page.waitForTimeout(150);
  const byStatus = await text(page, 'jobs');
  check('状态筛选生效', byStatus.includes('Java开发') && !byStatus.includes('前端工程师'));
  await page.selectOption('#fStatus', '');
  await page.selectOption('#fSort', 'risk');
  await page.waitForTimeout(150);
  const sorted = await page.evaluate(() => Array.from(document.querySelectorAll('#jobs tr.row td:first-child b')).map((e) => e.textContent));
  check('按风险分排序（高风险在前）', sorted[0] === 'Java开发（培训生）', sorted.join(' | '));
  await page.selectOption('#fSort', 'recent');

  console.log('聊天统计');
  const chat = await text(page, 'chat');
  const chatCards = await text(page, 'chatCards');
  check('聊天卡片：有我/对方消息量', chatCards.includes('我 2 / 对方 2'));
  check('平均首响正确（1 分钟）', chatCards.includes('1 分钟'), chatCards);
  check('话术回复率 100%', chat.includes('100%'));
  check('话术样本正确', chat.includes('您好，我对贵司岗位感兴趣'));
  const histRows = await page.evaluate(() => document.querySelectorAll('#hist .hist-col').length);
  check('活跃时段直方图渲染 24 格', histRows === 24, String(histRows));

  console.log('变更日志与风险命中');
  const changes = await text(page, 'changes');
  check('变更日志含薪资变化', changes.includes('薪资：20-30K → 25-35K'));
  check('变更日志含状态变化', changes.includes('状态：在招 → 下线'));
  const risk = await text(page, 'risk');
  check('风险命中：规则排行统计', risk.includes('命中规则排行') && risk.includes('先交费/培训贷') && risk.includes('× 2'));
  check('风险命中：来源区分 JD 与聊天', risk.includes('JD') && risk.includes('聊天'));

  console.log('会话明细与清空');
  const sessions = await text(page, 'sessions');
  check('会话明细：公司/首响', sessions.includes('测试科技') && sessions.includes('1 分钟'));
  await page.click('#reset');
  await page.waitForTimeout(150);
  check('清空后回到导入区', await page.evaluate(() => !document.getElementById('drop').classList.contains('hidden')));

  console.log('示例数据');
  await page.click('#demo');
  await page.waitForTimeout(200);
  check('示例数据可载入', (await text(page, 'jobs')).includes('前端工程师'));

  check('无运行时错误', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failures ? '\n存在 ' + failures + ' 项失败' : '\n全部通过 ✔');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
