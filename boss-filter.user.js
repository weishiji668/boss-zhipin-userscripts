// ==UserScript==
// @name         BOSS直聘 · 页面过滤（垃圾岗位直接隐藏）
// @namespace    local.boss-filter
// @version      1.3.4
// @description  在职位列表页把不想要的岗位直接隐藏：三层排除词（绝对 = 命中即隐藏；卡片 = 只看列表卡片上的字段；详情 = 只看岗位详情正文，需先取到详情）+ 薪资范围（月薪下限/上限、日薪下限、面议可选）。v1.2.0 起在卡片上点右键就能「隐藏这条岗位 / 把选中的词加进排除词 / 公司进黑名单」。规则可在页面上随时改。默认不发请求；「补取详情」要你手动勾选并点按钮才发。v1.2.3：修「隐藏看过的岗位」一直不生效（时间戳在判定前就被刷新）+ 补上「N 天内」上限；修「恢复默认」被导入数据污染（第二次恢复不干净）；「显示被过滤」模式下重复推荐卡也标红不隐藏；安全阀自动恢复不再放出右键隐藏的卡；清理已离开页面的临时隐藏卡引用。v1.2.4：修改完规则后面板输入框被重绘前的旧值盖回（加词/加黑名单/导入/恢复默认）；修右键把列表页非卡片的 li（下拉/导航/消息）误当卡片拦截原生菜单；修「薪资 小于/大于」把日薪时薪当低月薪误藏；修恢复默认漏掉的 4 个数字框；修 JD 详情缓存只增不减（补 TTL 清理）；修「不包含」在字段取不到值时于空串恒真误藏；修自动保存与保存按钮提示被面板重绘吞掉；修安全阀每 2 秒重复「先隐藏再恢复」白写 DOM；修 Vue 状态缓存每轮失效重建；修找卡 O(n²) 去重。v1.2.5：修「详情工作地址取到后，地点黑名单的卡片命中就失效」——卡片文字与详情工作地址改为双源并列，任一命中即隐藏（原因文案区分来源）；隐藏新增协同标记 data-bwf-hide，恢复显示前先看其它脚本的隐藏标记（data-bt-focus / data-bc-hide），都没有才恢复 display，避免与 tag「只看命中」/一致性脚本互撤。v1.2.8：自检——页面有 ≥8 个 li.job-card-box 但 findCards 识别 0 张时，顶部提示条明示一次（可能没渲染完或站点改版换选择器），不再静默失效。v1.2.8：自检——页面有 ≥8 个 li.job-card-box 但 findCards 识别 0 张时，顶部提示条明示一次（可能没渲染完或站点改版换选择器），不再静默失效。v1.2.9（审核修复）：修「整键覆盖规则表」——storage 监听原来只处理详情缓存、不重读规则，两个标签页时后写的那个用启动时的旧快照整键覆盖，把你右键隐藏的岗位、拉黑的公司、刚加的排除词全部抹掉且无提示（岗位一「复活」就重新变成可投状态）；现在写盘前先跟盘上做名单并集合并，storage 事件也重读规则并重跑过滤。修「MutationObserver 自激」——原来只有 applying 一个闸，而 MutationObserver 回调是微任务，等它跑到时 applyFilter 的 finally 早已把 applying 置回 false，闸门形同虚设；于是每轮无条件写 tag.textContent（即使字符串完全相同也会产生 childList 变更记录）→ 触发自己的 observer → 350ms 后再跑一轮 → 永不停止，60 张卡的列表页约每秒 180+ 次强制同步布局，tag 也被拖着重扫 3 轮/秒。现在加静音窗口 + 全部写入改等值判断。修「跨标签页清空攒了几天的详情缓存」——storage 事件把内存缓存掏空却不取消已排队的 800ms 写盘，定时器触发时把空对象写回磁盘（不可逆）；现在先 clearTimeout。修「标记类规则先于薪资判定返回」——模板里默认启用的「在招职位数>100 → 标记」一命中就直接 return，后面的「月薪 < 4000 → 隐藏」永远轮不到，而这些卡恰是人力外包、且 deliver 不认「标记」状态仍会投；现在标记类规则只记下、等所有隐藏判定跑完再采纳。修「卡片文字混进脚本自己画的角标」——判定读 card.innerText 而角标就挂在卡片内，形成「命中→画角标→角标又被当卡片文字→继续命中」的自证循环，命中原因指向卡片上不存在的词；现在克隆后剥掉自家节点再取文字。修「补取详情没有失败冷却、没有超时」——限流时照发满 20 次烧掉当日额度，请求挂住则 jdBusy 永远为 true、按钮静默失效刷新前无法恢复；现在 15 秒超时 + 风控识别（403/429/503/验证页）+ 连续失败 3 次即停并冷却 15 分钟，jdBusy 放 finally 释放。修「右键加词与 800ms 自动保存抢同一个输入框」——你正在输入但还没满 800ms 的词会被静默丢弃而 toast 还显示「已加入」；现在右键加词前先取消排队中的保存并把输入框内容并入。修「AI判定字段全项目没有写入方」——用它写的规则永久空转却仍被算进「表格规则 N 条」；现在命中时明确提示该字段无数据源。修「自检提示条只置不清」+ 同一句话显示两遍。修「恢复默认把今日补取额度与看过记录一起清零」（当日实际可发请求翻倍）。JD 详情缓存上限 1000 条降到 400 条并补总字符数封顶（原上限本身就超过 localStorage 5MB 配额，写盘必失败且被静默吞掉），配额错误不再静默、会减半重试并如实提示。隐藏协同协议补上 insight 的 data-bi-hidden-key。v1.3.0（审核修复）：文案与实际上限对齐——详情正文缓存「最多 3000 条」是旧值，实际是 400 条 / 120 万字符（超出会静默写不进 localStorage）。只改说明文字，行为不变。v1.3.1（审核复核）：修「删除被写盘合并撤销」—— v1.2.9 的「写盘前跟盘上求并集」修好了多标签页互相覆盖，但也把删除一并撤销了：delete cfg.hideIds[id] 之后 saveCfg() 又从盘上把它并回来，于是右键「撤销刚才的隐藏」、面板「恢复」与「清空名单」、删词表、清空表格规则全部静默失效（岗位藏了却放不出来）。现在删除/替换时留墓碑（本次会话内有效），写盘时压过盘上旧条目；数组类字段（已投名单 / 公司·地点黑名单 / 三层词表 / 表格规则）改为按内容求并集，不再用「盘上更长就整表覆盖」这种会复活删除的规则。v1.3.2（用户反馈「详细的过滤没生效」）：修「详情正文被取成了站点的卡片摘要」——内联 JSON 的候选里原来带 description，而卡片摘要的字段名就是它、且通常排在正文之前，于是「XX招聘，薪资：…地点：…要求：…福利：…刚刚在线，随时随地直接开聊。」被当成正文写进缓存（本机实测 18 条里 15 条是这种）：详情排除词永不命中，hasJd() 还认为这些岗位「已取」，再点「补取本页详情」只回「本页岗位都已经取过」。现在内联 JSON 只认 jobDescription / jobDesc，并新增 jdLooksReal 正文可信度校验（摘要签名直接判否 + 要求正文小标题或 ≥300 字；DOM 选择器、DOM 兜底、被动缓存、补取、入库、读出六处统一过闸），启动时清掉缓存里的摘要条目让它们重新进入待取队列；站点验证页（请稍候 / 正在验证等）计入风控冷却。v1.3.3（用户反馈「详细页一次只检测几条，多了就风控，检测不完」）：详情正文不再只能靠补取——① 列表页点一下卡片，右侧本来就会渲染该岗位的详情面板（职位描述/任职要求/工作地址），脚本顺手缓存，零请求；② 页面钩子扩到详情类接口（/wapi/zpgeek/job/detail.json 等），页面自己发的详情响应顺手抄一份，零请求；③ 补取改为优先走 JSON 详情接口（用列表接口里的 securityId+lid，头 Zp_token=cookie bst），失败再回退整页 HTML。同时把面板里的「工作地址」一并缓存（地点黑名单的「工作地址」那一腿不再只依赖监控脚本的镜像）。v1.3.4（用户反馈「地点黑名单我都是写详细地址的 + 这一栏 UI 没做好」）：公司黑名单与地点黑名单改为宽松匹配 —— 两侧的空白与常见分隔符（空格 / 全角空格 / · / 、 / ， / / / - / 括号等）先抹掉再比，写「深圳龙岗区银信中心B座」「荣丰中心A栋」「龙华」都能命中，命中原因显示你自己写的那一条；面板把两栏各加一行加粗标题 + 当前条数、输入框补 placeholder 示例，说明挪到框下面写清「关键词或详细地址都行」。
// @author       weishiji668
// @license      MIT
// @homepageURL  https://github.com/weishiji668/jiajianchengchu-boss
// @supportURL   https://github.com/weishiji668/jiajianchengchu-boss/issues
// @updateURL    https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/weishiji668/jiajianchengchu-boss/main/boss-filter.user.js
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function(){
'use strict';

// ===== v1.2.0 变更说明（2026-09-20，用户要求「能不能直接做一个鼠标右键隐藏」）=====
// ===== v1.2.1 变更说明（2026-09-20，用户反馈「排除词失效了」）=====
// ===== v1.2.2 变更说明（2026-09-20，用户反馈「公司黑名单不生效」）=====
// ===== v1.2.3 变更说明（2026-09-21，代码评审）=====
// ===== v1.3.2 变更说明（2026-09-23）=====
// ===== v1.3.3 变更说明（2026-09-23，用户反馈「详细页一次只检测几条，多了就风控，检测不完」）=====
// ===== v1.3.4 变更说明（2026-09-23，用户反馈「地点黑名单我都是写详细地址的 + 这一栏 UI 没做好」）=====
// N1 匹配改宽松：原来黑名单是「原样子串」比较，而站点给的文本自带分隔符 ——
//    卡片上是「深圳·龙岗区·坂田」，面板地址是「深圳龙岗区 荣丰中心A栋」；
//    你按习惯写「深圳龙岗区银信中心B座」时，空格/圆点对不上就漏判。
//    现在公司黑名单与地点黑名单都先把两侧的空白与常见分隔符（空格 / 全角空格 / · / 、 / ， / / / - / 括号等）抹掉再比，
//    写「深圳龙岗区银信中心B座」「荣丰中心A栋」「龙华」都能命中；命中原因里显示你自己写的那一条。
// N2 面板 UI：地点黑名单原来只有一行灰色说明、还被 v1.2.2 的注释隔开，看不出是哪个框。现在：
//    ① 公司黑名单 / 地点黑名单 各有一行加粗标题 + 当前条数；② 两个输入框都加了 placeholder 示例；
//    ③ 说明挪到两个框下面，写清「关键词或详细地址都行、空格与分隔符不影响匹配」与判定来源。
// L1 问题：详情正文只能靠「补取」——脚本对 /job_detail/<id>.html 整页拉取，间隔 1.2~2.5 秒；
//    站点对这种连续整页请求很快回「请稍候」校验页（实测第 6 条就被拦），于是整个列表永远检测不完。
// L2 关键点：列表页右侧本来就有**页面内的职位详情面板**（职位描述 / 任职要求 / 工作地址）——
//    你点一下卡片，它就渲染在同一页里；数据是站点自己取的，脚本只要「顺手抄一份」，零额外请求、零风控。
// L3 修法（在原有补取之外，加两条零请求来源，并把补取本身换成更轻的接口）：
//    ① 面板抓取：点卡片时记住这张卡的 jobId，等面板正文与「点之前的正文」不同了再缓存（最多等 6 轮，等不到就放弃，不硬塞）；
//       面板里的「工作地址」一并存下 —— 地点黑名单的「工作地址」那一腿不再只依赖监控脚本的镜像；
//    ② 接口抓取：页面钩子扩到详情类接口（/wapi/zpgeek/job/detail.json 等），页面自己发的详情响应顺手抄一份
//       （正文 + 工作地址 + 响应里的 encryptJobId 三者齐全才入库，认不准就放弃，绝不张冠李戴）；
//    ③ 补取优先走 JSON 详情接口（用列表接口里的 securityId + lid，头 Zp_token=cookie bst），失败再回退整页 HTML。
//    「详情」页签的提示文案同步改成：点一下卡片就能缓存，不必再靠补取。
// L4 缓存条目结构不变（多一个可选 addr 字段），旧缓存继续可用；判定口径（取不到就不判）不变。
// K1 本轮两件事：①（本会话）修「详细的过滤没生效」的详情正文脏数据，见下方 J1-J4；
//    ②（并入另一个会话在开源副本里做的 v1.3.1 删除墓碑修复）修「右键撤销隐藏 / 面板恢复 /
//    清空右键名单 / 清空表格规则 / 黑名单·已投·词表改成整表替换」全部静默失效 ——
//    v1.2.9 的「写盘前跟盘上求并集」治好了多标签页互相覆盖，却把「删除」一起撤销了：
//    delete cfg.hideIds[id] 之后 saveCfg() 又把盘上的旧条目并回来，岗位藏了放不出来。
//    现在删除/替换时留墓碑（TOMB），写盘合并时压过盘上的旧条目；数组类改成「按内容求并集」。
//    该修复在那边的测试里全绿（本文件并入后同套用例同样全绿）。
// J1 现象：面板「详情」页签里写着 英语 / 两年以上 / 2年以上（条数显示 3），列表上 JD 明明含这些词的岗位照样显示；
// J1 现象：面板「详情」页签里写着 英语 / 两年以上 / 2年以上（条数显示 3），列表上 JD 明明含这些词的岗位照样显示；
//    点「补取本页详情」还只回一句「本页岗位都已经取过」，怎么点都没反应。
// J2 实测取证（只读解析本机 Chrome profile 里站点 localStorage 的 bwf_jd_cache）：共 18 条，其中 15 条是
//    「XX招聘，薪资：5-6K，地点：深圳，要求：经验不限，学历：大专，福利：…，HR刚刚在线，随时随地直接开聊。」——
//    那是站点的**卡片摘要 / SEO description**，不是职位正文；当天 14:32 那批（5~6 条）正是这么写进去的。
// J3 根因：取正文用的是内联 JSON 正则 /"(?:jobDescription|jobDesc|description)"…/，
//    而摘要的字段名恰好就叫 description、且通常排在正文之前 → 摘要先被匹配；长度又超过 JD_MIN(30)，于是被当成正文入库。
//    连锁反应两层：① 详情排除词永远命中不了（缓存里根本没有正文）；② hasJd() 认为这些岗位「已取」，
//    pagePendingIds() 把它们从待取队列里排掉 → 再点补取只会回「本页岗位都已经取过」，脏数据要等 7 天 TTL 才过期。
// J4 修法：① 内联 JSON 只认 jobDescription / jobDesc（连 jdFromVue 里的 d.description 一起去掉），多候选逐个校验；
//    ② 新增 jdLooksReal() 正文可信度校验：先看有没有摘要签名（刚刚在线 / 随时随地直接开聊 / 薪资：…地点：…要求：… / 招聘，薪资…地点：…），
//       再看有没有正文小标题（职位描述 / 岗位职责 / 任职要求 / 工作内容 / …），都没有就得是 ≥300 字的整段文本；
//       DOM 选择器、DOM 兜底、被动缓存、补取、入库(setJd)、读出(jdTextOf) 六处全部过这道闸；
//    ③ 启动 pruneJd 时清掉缓存里「不是正文」的脏条目 → 它们重新进入待取队列，点一次补取就能重取（不必手动「清空已取详情」）；
//    ④ 站点验证页（请稍候 / 正在验证 / 安全校验 / 滑动验证）计入风控冷却，原来这类响应只算一次普通失败；
//    ⑤ 详情页签状态行补一句「未勾『允许补取详情』，这 N 张卡的详情词不会判」，把「没数据所以不判」写在脸上。
// 其余判定（绝对/卡片排除词、黑名单、薪资、表格规则、右键隐藏）与 v1.3.0 一行未改。
// V1 P0「隐藏看过的岗位」功能一直不生效：applyFilter 在 decide() 判定**之前**就把 seen[jobId] 刷成当前时间，
//    判定里读到的「距上次看到」永远≈0，永远小于 1 小时 → 规则永远不触发。
//    修法：时间戳更新挪到判定之后；被该规则命中的岗位不再刷新时间戳（否则隐藏↔显示来回振荡）。
// V2 P0 同一条规则没有「N 天内」上限：面板写「隐藏看过的岗位 N 天内」，实现里却是「只要 1 小时前看过就永久隐藏」，
//    N 根本没参与判断。修法：判定加 age<=seenDays*86400*1000 上限，超过 N 天的老记录不再隐藏。
// V3 P1「恢复默认」会被导入数据污染：loadCfg / 恢复默认都用 Object.assign({},DEFAULTS,...) 浅拷贝，
//    cfg.rules / blackCompanies 等数组和 DEFAULTS 常量共享同一个引用，表格导入 push 进去的规则直接写进了"默认值"，
//    导致同一次页面会话里第二次点「恢复默认」恢复不干净。修法：新增 freshDefaults() 深拷贝，两处都改用它。
// V4 P2「显示被过滤」模式下，重复推荐的卡片仍被直接隐藏（其他命中都走红框标记），口径不一致 → 补上 reveal 分支。
// V5 P2 安全阀「命中过多自动恢复」会把右键隐藏的卡也放出来，违背「右键隐藏比任何规则都硬」→ 自动恢复时跳过右键隐藏名单。
// V6 P2 TEMP_HIDDEN（没识别到职位ID的临时隐藏卡）持有已离开页面的 DOM 引用且从不清理 → 每轮过滤前剔除不在文档里的元素。
// 其余判定（三层排除词 / 薪资 / 黑名单 / 表格规则 / 补取详情）一行未改。
// H1 根因：公司名只有两条来源（列表接口 / DOM 选择器）。服务端直出的首屏卡片没有接口数据，
//    DOM 选择器一旦对不上（站点改版 / 公司名换了容器），ctx.company 就是空 —— 黑名单自然不命中。
// H2 修法一（多来源）：公司名依次取「页面 Vue 组件状态（jobList[i].brandName）→ 列表接口 → DOM 选择器（扩充）→ 卡片文字」；
//    岗位名同理（Vue 的 jobName 是明文，比 DOM 干净）；薪资也优先用 Vue 的 salaryDesc（明文，不受字体反爬影响）。
// H3 修法二（兜底匹配）：公司黑名单在「公司名字段」没命中时，退回**整张卡片文字**匹配
//    （你写在卡片上的公司名，只要这张卡片任何位置出现，就算命中）—— 宁可多藏一条，也别漏掉你明确拉黑的公司。
// H4 修法三（更好用）：右键卡片时，若选中了文字，菜单多一项「把选中的「X」加进公司黑名单」——
//    就算脚本认不出公司名，你自己框一下也能一键拉黑。
// 其余判定（三层排除词 / 薪资 / 表格规则 / 已投名单）与 v1.2.1 的自动保存、安全阀默认关等改动，一行未动。
// N1 排除词输入框：改完 800ms 自动保存（保留「保存」按钮），面板上显示「有未保存改动 / 已自动保存」——
//    以前打完字不点保存就不生效，看起来就是「排除词失效」。
// N2 安全阀默认关：命中率再高也不整页自动恢复（旧行为会偷偷把命中的岗位全放出来）；
//    想要旧行为可在「基础开关与薪资」里勾「命中过多时自动恢复」。
// N3 「显示被过滤」模式：页面顶部挂常驻提示条，命中的卡片除红虚线框外再打红角标 ——
//    这个模式下命中的岗位本来就不隐藏，不说明白会以为脚本坏了。
// N4 面板「已隐藏 / 共 N」跟着每轮过滤实时刷新（以前只在打开面板那一刻算一次，数字会停住）。
// N5 词表统一清洗（去空行 / 去重 / 去首尾空格），面板上的条数 = 真正生效的条数。
// 过滤判定本身（三层排除词 / 薪资 / 黑名单 / 表格规则）一行未改。
// R1 右键卡片 = 快捷处理菜单（不铺开新 UI，只有右键时才出现）：
//    ① 隐藏这条岗位：按职位ID 记在本机（cfg.hideIds），刷新 / 换页都还在；菜单里可「恢复显示」；
//    ② 把选中的词加进排除词：在卡片上选中一段字再右键 →「卡片排除词 / 绝对排除词」二选一；
//    ③ 把公司加进黑名单：一键拉黑整家公司（和黑名单同一份数据）；
//    ④ 撤销刚才的隐藏。
// R2 详情页也能用：选中 JD 里的词右键 → 直接加进「详情排除词 / 绝对排除词」（不用回列表页填面板）。
// R3 管理入口：规则面板新增「右键隐藏」折叠区（N 条 / 单条恢复 / 清空全部）；「恢复默认」不清右键隐藏名单。
// R4 诚实口径：没识别到职位ID 的卡片只能「临时隐藏」（刷新会回来，菜单里写明）；过滤关闭时右键隐藏会提示「开启后生效」。
// ===== v1.0.0 变更说明（2026-09-20，用户反馈「把隐藏脚本的 UI 也优化一下」）=====
// U1 小条加状态点：绿=过滤中、橙=命中过多自动恢复、灰=过滤已关闭（原来只有一行文字）
// U2 规则面板重排：顶部吸附标题（版本 / ✕ 收起）+ 4 张统计卡（已隐藏·本页 / 排除词 / 表格规则 / 黑名单）
//    + 分组折叠区（基础开关与薪资 / 排除词 / 黑名单 / 已投名单 / 表格规则），常用组默认展开
// U3 视觉与「聊天助手 v1.4.7」「一键投递 v1.1.0」统一：白底圆角卡 / 主色按钮 / 统一圆角与间距；面板 340→470px
// U4 打开规则面板时自动收起「投递面板」（两者都在左下角，避免叠在一起）
// 行为不变：所有元素 id、保存/导入/导出逻辑、过滤口径与规则判定一行未改
// ===== v1.1.0 变更说明（2026-09-20，用户要求「排除词分绝对 / 相对，相对再分卡片 / 详情」）=====
// E1 排除词分三层（都还是「每行一个」的纯文本，UI 仍只有一个输入框，不铺开）：
//    ① 绝对排除词：命中「卡片 + 详情正文」任一处 → 隐藏（老配置里的 words 原样归到这一层，不用重填）；
//    ② 卡片排除词（相对·卡片）：只看列表卡片上能看到的字段（岗位名/公司/标签/薪资/地点/卡片全文），详情正文里出现不算；
//    ③ 详情排除词（相对·详情）：只看岗位详情正文（职位描述/任职要求/工作地址），卡片上判断不了的词放这里。
// E2 详情正文从哪来（都只读、只存本机）：
//    ① 你点开过的岗位详情页 → 脚本自动把正文按 jobId 缓存（7 天，最多 400 条 / 120 万字符）；
//    ② 没点开过的 → 面板「补取本页详情」按钮（默认关，勾「允许补取详情」才生效；每条间隔 1.2~2.5 秒、每日限 40 条）。
//    取不到就不判（宁可不判，也别判错）。
// E3 UI：排除词折叠区里加三个小页签（绝对 / 卡片 / 详情，各带条数），同一时间只显示一个输入框；
//    详情页签里带一行状态（已取 / 本页待取 / 今日补取）。其余面板结构、元素 id 一行未动。
// E4 口径诚实化：面板不再写「不发任何请求」，改成「默认不发请求；只有你点『补取详情』时才发」。
// ===== v0.9.1 变更说明（2026-09-20）=====
// F1 性能：镜像数据（公司信息 / 工作地址 / AI 判定）加 800ms 缓存 —— 原来每张卡片 × 每条规则都要 JSON.parse(localStorage)
// F2 稳健：面板渲染统一转义（排除词 / 黑名单 / 已投 / 规则值），导入的表格内容不再可能注入 HTML
// F3 稳健：接口薪资索引加上限 3000（无限滚动时不再只增不减）
// F4 面板显示版本号，便于排查

const VERSION='1.3.4';
const LS_KEY='bwf_rules_v1';
const JD_KEY='bwf_jd_cache';           // 详情正文缓存（按 jobId）：{ [jobId]: {ts, jd} }
const DEFAULT_WORDS=['电销','电话销售','外呼','催收','催缴','装配','测试','软件开发','软件工程','前端','后端','全栈','算法',
  '嵌入式','硬件工程','电气工程','机械工程','结构工程','电子工程','光电工程','PLC','C++','Java','Python','开发工程师',
  '研发工程','工艺工程','质量工程','中介','劳务','派遣','房产经纪','置业','保险代理','话术','电商','新媒体','客服'];
const DEFAULTS={ on:true, reveal:false, hideSalaryOut:true, hideNegotiable:false,
  minMonthly:4000, maxMonthly:10000, minDaily:150,
  safeValve:false,       // v1.2.1：安全阀默认关（命中率过高不再偷偷整页恢复，只提示）
  words:DEFAULT_WORDS,   // 绝对排除词（老版本就叫 words，老配置直接落在这层）
  wordsCard:[],          // 相对·卡片排除词：只看列表卡片上能看到的字段
  wordsJd:[],            // 相对·详情排除词：只看岗位详情正文（要先取到详情）
  jdFetch:false, jdDaily:40, jdUsed:{date:'',used:0}, tab:'abs',
  hideIds:{},            // v1.2.0 右键隐藏的岗位：{ [jobId]: {t:时间, n:岗位名, c:公司} }
  rules:[],
  blackCompanies:[], blackAreas:[], applied:[], seenDays:0, seen:{} };

// 表格导入的规范格式（一行一条规则）
const TABLE_HEAD=['类型','字段','匹配','值','动作','启用','备注'];
const TABLE_FIELDS=['岗位名','公司名','行业','规模','融资','在招职位数','AI判定','标签','薪资','卡片全文','全部'];
const TABLE_OPS=['包含','不包含','等于','正则','小于','大于'];
const TEMPLATE_ROWS=[
  ['关键词','岗位名','包含','电销','隐藏','是','岗位名里带「电销」就隐藏'],
  ['关键词','公司名','包含','中介','隐藏','是','公司名里带「中介」就隐藏'],
  ['关键词','标签','包含','外包','隐藏','否','标签里带「外包」才隐藏（默认关）'],
  ['关键词','卡片全文','正则','^.*实习.*$','隐藏','否','正则写法示例（默认关）'],
  ['薪资','薪资','小于','4000','隐藏','是','起步月薪低于 4000 隐藏'],
  ['薪资','薪资','大于','10000','隐藏','是','起步月薪高于 10000 隐藏'],
  ['薪资','薪资','等于','面议','隐藏','否','薪资面议的隐藏（默认关）']
  ,['黑名单','公司名','','某某劳务派遣有限公司','隐藏','是','绝对隐藏：公司名命中即隐藏（可只写关键词，如「劳务」）']
  ,['黑名单','地点','','龙华','隐藏','是','绝对隐藏：卡片里出现该地点即隐藏（如「坂田」「南山科技园」）']
  ,['关键词','行业','包含','中介服务','隐藏','是','站点筛不出的行业排除（行业值来自列表接口）']
  ,['关键词','规模','等于','0-20人','隐藏','否','规模排除示例（默认关）']
  ,['关键词','融资','包含','未融资','隐藏','否','融资阶段排除示例（默认关）']
  ,['关键词','在招职位数','大于','100','标记','是','在招职位数>100 → 大概率人力/外包公司（打角标，不隐藏）']
  ,['关键词','AI判定','包含','中介','标记','否','AI 判定为中介/劳务时打角标（需先开 AI 且查过该公司）']
  ,['已投','公司名','','某某科技有限公司','隐藏','是','已投递的公司：整家公司隐藏（一行一条，也可写岗位名/职位ID）']
  ,['已投','岗位名','','运营专员','隐藏','是','已投递的岗位名（一行一条）']
];

// v1.2.3 V3：DEFAULTS 深拷贝 —— Object.assign 浅拷贝会让 cfg.rules / blackCompanies 等数组
// 和 DEFAULTS 常量共享引用，导入表格时 push 会直接污染"默认值"（第二次「恢复默认」恢复不干净）
function freshDefaults(){
  return {
    on:DEFAULTS.on, reveal:DEFAULTS.reveal, hideSalaryOut:DEFAULTS.hideSalaryOut, hideNegotiable:DEFAULTS.hideNegotiable,
    minMonthly:DEFAULTS.minMonthly, maxMonthly:DEFAULTS.maxMonthly, minDaily:DEFAULTS.minDaily,
    safeValve:DEFAULTS.safeValve,
    words:DEFAULTS.words.slice(), wordsCard:[], wordsJd:[],
    jdFetch:false, jdDaily:DEFAULTS.jdDaily, jdUsed:{date:'',used:0}, tab:'abs',
    hideIds:{}, rules:[], blackCompanies:[], blackAreas:[], applied:[], seenDays:0, seen:{}
  };
}
function loadCfg(){
  let o={};
  try{ o=JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; }catch(e){ o={}; }
  const c=Object.assign(freshDefaults(),o);
  // v1.1.0：只在「第一次用 / 配置坏了」时补默认排除词；你手动清空绝对排除词就保持空
  //（老逻辑只要 words 为空就塞回 46 条默认词，想只用「卡片 / 详情」两层时会被它偷偷加回来）
  if(!Array.isArray(o.words)) c.words=DEFAULT_WORDS.slice();
  if(!Array.isArray(c.words)) c.words=[];
  // v1.1.0 迁移：老配置只有 words（= 绝对排除词），两层相对排除词默认空，不用重填
  if(!Array.isArray(c.wordsCard)) c.wordsCard=[];
  if(!Array.isArray(c.wordsJd)) c.wordsJd=[];
  if(typeof c.jdFetch!=='boolean') c.jdFetch=false;
  c.jdDaily=Math.max(0,parseInt(c.jdDaily,10)||40);
  if(!c.jdUsed||typeof c.jdUsed!=='object') c.jdUsed={date:'',used:0};
  if(['abs','card','jd'].indexOf(c.tab)<0) c.tab='abs';
  if(typeof c.safeValve!=='boolean') c.safeValve=false;   // v1.2.1：安全阀默认关
  // v1.2.0：右键隐藏名单（按职位ID）
  if(!c.hideIds||typeof c.hideIds!=='object') c.hideIds={};
  return c;
}
let cfg=loadCfg();
// v1.3.1（并入）：删除墓碑。v1.2.9 的「写盘前跟盘上求并集」修好了多标签页互相覆盖，但也把「删除」一起撤销了 ——
// delete cfg.hideIds[id] 之后 saveCfg() 又从盘上把它并回来，于是「右键撤销隐藏 / 面板恢复 / 清空名单 /
// 删词 / 清空表格规则」全部静默失效（岗位藏了放不出来）。现在删除/替换时留墓碑，写盘时压过盘上的旧条目。
// 墓碑只活在本次页面会话内：另一个标签页下次写盘时读到的已经是删除后的版本。
const TOMB={};
function sigOf(v){ try{ return typeof v==='string'?v:JSON.stringify(v); }catch(e){ return String(v); } }
function markDel(list,key){ try{ (TOMB[list]=TOMB[list]||{})[String(key)]=1; }catch(e){} }
function mapDelete(list,key){ markDel(list,key); try{ if(cfg[list]) delete cfg[list][String(key)]; }catch(e){} }
function mapClear(list){ try{ const cur=cfg[list]||{}; Object.keys(cur).forEach(k=>markDel(list,k)); }catch(e){} cfg[list]={}; }
function replaceList(list,next){
  try{
    const cur=Array.isArray(cfg[list])?cfg[list]:[]; const keep={}; (next||[]).forEach(v=>{ keep[sigOf(v)]=1; });
    cur.forEach(v=>{ if(!keep[sigOf(v)]) markDel(list,sigOf(v)); });
  }catch(e){}
  cfg[list]=next;
}
// v1.2.9：写盘前先跟盘上合并「规则类」字段。
// 原来 saveCfg() 直接 JSON.stringify(cfg) 整键覆盖：两个标签页时，后写的那个用的是**启动时的旧快照**，
// 会把你在另一个标签页右键隐藏的岗位（hideIds）、拉黑的公司、刚加的排除词全部抹掉，且无任何提示。
// 岗位一「复活」就重新变成可投状态，deliver 会照样投。计数类（jdUsed/seen）不合并，否则跨日重置会失灵。
function mergeCfgFromDisk(){
  try{
    const disk=JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{};
    if(!disk||typeof disk!=='object') return;
    // v1.3.1（并入）：对象映射类（右键隐藏名单 / 看过）按 key 求并集
    ['hideIds','seen'].forEach(k=>{
      const d=disk[k], m=cfg[k];
      if(!d||typeof d!=='object') return;
      if(!m||typeof m!=='object'){ cfg[k]=d; return; }
      Object.keys(d).forEach(x=>{ if(!(x in m)) m[x]=d[x]; });
    });
    // v1.3.1（并入）：数组类（已投名单 / 公司·地点黑名单 / 三层词表 / 表格规则）改成「按内容求并集」。
    // 原来 applied 被当成对象映射按索引并（数组当对象用，删一条就索引错位），rules / words 用的是
    // 「盘上条数更多就整表覆盖」—— 于是你删掉的词、清空的表格规则会因为盘上那份更长而整表复活。
    ['applied','blackCompanies','blackAreas','words','wordsCard','wordsJd','rules'].forEach(k=>{
      const d=disk[k], m=cfg[k];
      if(!Array.isArray(d)) return;
      if(!Array.isArray(m)){ cfg[k]=d.slice(); return; }
      const have={}; m.forEach(v=>{ have[sigOf(v)]=1; });
      d.forEach(v=>{ const s=sigOf(v); if(!have[s]){ m.push(v); have[s]=1; } });
    });
    // v1.3.1（并入）：应用删除墓碑 —— 本页删掉的条目不再被盘上的旧值并回来
    Object.keys(TOMB).forEach(k=>{
      const t=TOMB[k], cur=cfg[k];
      if(!t||!cur) return;
      if(Array.isArray(cur)) cfg[k]=cur.filter(v=>!t[sigOf(v)]);
      else Object.keys(t).forEach(x=>{ delete cur[x]; });
    });
  }catch(e){}
}
function saveCfg(){ try{ mergeCfgFromDisk(); localStorage.setItem(LS_KEY,JSON.stringify(cfg)); }catch(e){} }
// v1.2.1：词表统一清洗（去空行 / 去重 / 去首尾空格）——面板上的条数要和真正生效的一致
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
// v1.2.1：词表自动保存（输入后 800ms），并提示「有未保存改动」
let wordSaveTimer=null, wordDirty=false;
function markWordDirty(){
  wordDirty=true;
  try{ const el=document.getElementById('bwfDirty'); if(el){ el.textContent='有未保存改动，正在自动保存…'; el.style.color='#c2600a'; } }catch(e){}
}
// v1.2.9：把「输入框 → cfg」这一步单独抽出来。右键加词时要先把它跑一遍，
// 否则你正在输入、还没到 800ms 的词会被随后的自动保存整段覆盖（toast 却显示「已加入」）。
function commitWordInputs(){
  try{
    const p=document.getElementById('bwfPanel');
    if(!p) return;
    const g=(id)=>{ const el=p.querySelector('#'+id); return el?el.value:null; };
    const w=g('bwfWords'), wc=g('bwfWordsCard'), wj=g('bwfWordsJd');
    if(w!==null) replaceList('words',cleanWords(w));
    if(wc!==null) replaceList('wordsCard',cleanWords(wc));
    if(wj!==null) replaceList('wordsJd',cleanWords(wj));
  }catch(e){}
}
function autoSaveWords(){
  try{
    commitWordInputs();
    saveCfg(); applyFilter();
    wordDirty=false;
    renderPanel();
    const el=document.getElementById('bwfDirty');
    if(el){ el.textContent='已自动保存 '+new Date().toLocaleTimeString('zh-CN',{hour12:false}); el.style.color='#15803d'; }
  }catch(e){}
}
function scheduleWordSave(){
  markWordDirty();
  if(wordSaveTimer) clearTimeout(wordSaveTimer);
  wordSaveTimer=setTimeout(autoSaveWords,800);
}

// ---------- 薪资解析（沿用「筛选助手」的规则）----------
// BOSS 有字体反爬：页面上的薪资数字可能是私用区字符，DOM 读出来是乱码。
// 所以薪资优先用页面自己接口返回的明文 salaryDesc（见下方 apiJobs）。
function garbled(s){
  const t=String(s||'');
  if(!t) return false;
  if(/[\uE000-\uF8FF\uFFFD]/.test(t)) return true;
  return false;
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
// 把卡片拆成结构化字段（优先用接口明文，其次 DOM）
// ---------- v1.2.2：公司名 / 岗位名的多来源（页面 Vue 状态优先，DOM 兜底）----------
const vueJobCache={t:0,map:{}};
function vueJobMap(){
  const t=Date.now();
  if(t-vueJobCache.t<2600) return vueJobCache.map;
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
// v1.2.9：卡片文字里混着脚本自己画的角标（.bwf-tag / #bwfBanner 之类）→ 自证循环。
// 判定读的是 card.innerText，而角标就挂在卡片内部：命中 → 画角标 → 角标又被当成卡片文字 → 继续命中，
// 命中原因指向一个卡片上根本不存在的词，用户怎么删词表都删不干净。tag 侧早就做了过滤，filter 一处都没有。
// 这里克隆一份、剥掉脚本自己的节点再取文字。
function cardTextOf(card){
  try{
    const c=card.cloneNode(true);
    c.querySelectorAll('.bwf-tag,.bwf-cap,#bwfBanner,#bwfChip,[data-bwf-own]').forEach(el=>el.remove());
    return String(c.innerText||c.textContent||'').replace(/\s+/g,' ').trim();
  }catch(e){
    return String(card.innerText||card.textContent||'').replace(/\s+/g,' ').trim();
  }
}
function buildCtx(card,apiInfo,jobId){
  const cardText=cardTextOf(card);
  const vj=vueJobOf(jobId);                       // v1.2.2：页面 Vue 状态（明文、字段干净）
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
  const industry=apiInfo&&apiInfo.industry?String(apiInfo.industry).trim():'';
  const scale=apiInfo&&apiInfo.scale?String(apiInfo.scale).trim():'';
  const stage=apiInfo&&apiInfo.stage?String(apiInfo.stage).trim():'';
  return {name, company, tags, cardText, salaryText, salary:parseSalary(salaryText), industry, scale, stage, jobId:String(jobId||'')};
}
function fieldText(ctx,field){
  switch(String(field||'全部').trim()){
    case '岗位名': return ctx.name;
    case '公司名': return ctx.company;
    // 公司页抓到的信息（规模/行业/融资）比列表接口更可信，优先用
    case '行业': return ctx.industry||companyInfo(ctx.company).industry||'';
    case '规模': return ctx.scale||companyInfo(ctx.company).scale||'';
    case '融资': return ctx.stage||companyInfo(ctx.company).stage||'';
    case 'AI判定': return companyAiVerdict(ctx.company);
    case '标签': return ctx.tags;
    case '薪资': return ctx.salaryText;
    case '卡片全文': return ctx.cardText;
    default: return [ctx.name,ctx.company,ctx.industry,ctx.scale,ctx.stage,ctx.tags,ctx.cardText].join(' ');
  }
}
function testRule(r,ctx){
  // v1.2.9：「AI判定」字段没有数据源 —— 第一次用到就明确提示一次，别让规则静默空转
  if(String(r&&r.field||'').trim()==='AI判定'&&!aiFieldWarned&&!aiVerdictAvailable()){
    aiFieldWarned=true;
    try{ toast('规则「'+[r.field,r.op,r.value].filter(Boolean).join(' ')+'」用的是「AI判定」字段，但当前没有任何脚本在写 bw_company_intel —— 这条规则不会命中。想按公司名排除请改用「公司名」+黑名单。',6000); }catch(e){}
  }
  const field=String(r.field||'全部').trim();
  const op=String(r.op||'包含').trim();
  const val=String(r.value||'').trim();
  if(!val) return false;
  if(field==='薪资'&&(op==='小于'||op==='大于')){
    const num=parseFloat(val);
    const p=ctx.salary;
    if(isNaN(num)||p.low==null||p.type!=='month') return false;
    return op==='小于'?p.low<num:p.low>num;
  }
  if(field==='薪资'&&op==='等于'){
    if(/面议|不限/.test(val)) return ctx.salary.type==='unknown'&&/面议|不限/.test(ctx.salaryText||'');
    return String(ctx.salaryText||'').includes(val);
  }
  if(field==='在招职位数'&&(op==='小于'||op==='大于')){
    const n=companyJobCount(ctx.company);
    const num=parseFloat(val);
    if(n==null||isNaN(num)) return false;
    return op==='小于'?n<num:n>num;
  }
  const raw=String(fieldText(ctx,field)||'');
  if(!raw) return false;   // 字段没取到值就不判：避免「不包含」在空串上恒真把卡片误藏
  const hay=raw.toLowerCase();
  const needle=val.toLowerCase();
  if(op==='等于') return hay.trim()===needle;
  if(op==='不包含') return !hay.includes(needle);
  if(op==='正则'){ try{ return new RegExp(val,'i').test(raw); }catch(e){ return false; } }
  return hay.includes(needle);
}
// 公司「在招职位数」由监控脚本抓取后镜像到 localStorage（多脚本配合）
function companyJobCount(name){
  const v=companyInfo(name);
  return typeof v.count==='number'&&v.count>0?v.count:null;
}
// F1：镜像数据加 800ms 缓存 —— 一轮过滤会对每张卡片 × 每条规则读取镜像，
// 之前每次都 JSON.parse(localStorage)（大对象时明显吃 CPU）；跨标签页写入时立即失效。
const MIRROR_TTL=800;
const mirrorCache={t:0, companyJobs:null, jobAddr:null, intel:null};
function resetMirrorCache(){ mirrorCache.t=Date.now(); mirrorCache.companyJobs=null; mirrorCache.jobAddr=null; mirrorCache.intel=null; }
try{ window.addEventListener('storage',(ev)=>{
  resetMirrorCache();
  // v1.2.9：别的标签页改了配置（右键隐藏、拉黑公司、加排除词）→ 本页重新读规则。
  // 原来这个监听只处理详情缓存、**不重读规则**，于是本页一保存就把对方的改动整键覆盖掉。
  try{
    if(ev&&ev.key===LS_KEY){
      const fresh=loadCfg();
      // 只接管规则类字段，不动本页正在编辑的输入框状态
      ['hideIds','blackCompanies','blackAreas','applied','seen','rules','words','wordsCard','wordsJd'].forEach(k=>{
        if(fresh[k]!==undefined) cfg[k]=fresh[k];
      });
      schedule();
    }
  }catch(e){}
  // 别的标签页写了详情缓存 → 本页重新读（避免两边各存一份旧数据）
  // v1.2.9：原来这里只把内存缓存掏空，**没有取消已经排队的 800ms 写盘** →
  // 定时器触发时会把空对象写回磁盘，把攒了几天的详情缓存整份归零（不可逆），还会吞掉对方刚写的数据。
  try{
    if(ev&&ev.key===JD_KEY){
      if(jdSaveT){ clearTimeout(jdSaveT); jdSaveT=null; }
      jdLoaded=false;
      Object.keys(jdCache).forEach(k=>{ delete jdCache[k]; });
    }
  }catch(e){}
}); }catch(e){}
function readJSON(k){
  try{ return JSON.parse(localStorage.getItem(k)||'{}')||{}; }catch(e){ return {}; }
}
function mirror(key,lsKey){
  const t=Date.now();
  if(!mirrorCache.t||(t-mirrorCache.t)>MIRROR_TTL) resetMirrorCache();
  if(!mirrorCache[key]) mirrorCache[key]=readJSON(lsKey);
  return mirrorCache[key];
}
function companyInfo(name){ return mirror('companyJobs','bw_company_jobs')[String(name||'').trim()]||{}; }
// 该岗位的真实工作地址（监控脚本打开详情页时抓的，按 jobId 镜像过来）
function jobAddrOf(jobId){ return mirror('jobAddr','bw_job_addr')[String(jobId||'').trim()]||{}; }
// AI 公司判定（监控脚本镜像过来）：返回「直招/中介劳务/外包/不确定」
// v1.2.9：「AI判定」字段全项目**没有任何写入方**（全仓库只有本脚本读 bw_company_intel，零处写），
// 所以用它写的规则永久空转，而面板还把它算进「表格规则 N 条」里，看不出失效。
// 这里返回一个特殊标记，让规则命中时给出明确提示，而不是静默失效。
let aiFieldWarned=false;
function aiVerdictAvailable(){ try{ return Object.keys(mirror('intel','bw_company_intel')).length>0; }catch(e){ return false; } }
function companyAiVerdict(name){
  const v=mirror('intel','bw_company_intel')[String(name||'').trim()];
  return v?String(v.type||''):'';
}
// F2：面板/列表统一转义（用户数据、导入的表格内容都可能带尖括号）
function escHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// ---------- v1.1.0：三层排除词的匹配助手 ----------
// 命中就返回命中的那个词（原样返回，便于提示「是哪个词」），没命中返回 ''
function wordHit(list,text,low){
  const hay=low?String(text||''):String(text||'').toLowerCase();
  if(!hay) return '';
  for(const w of (list||[])){
    const k=String(w||'').trim().toLowerCase();
    if(k&&hay.indexOf(k)>=0) return String(w).trim();
  }
  return '';
}
// ---------- v1.1.0：详情正文（JD）—— 只读缓存 ----------
// 为什么按 jobId 缓存：列表卡片上根本没有 JD，只有点进详情页才拿得到；
// 取到就存下来（7 天 / 最多 400 条 / 120 万字符，双上限），下次在列表页就能按「详情排除词」判断。取不到就什么都不做。
// v1.2.9：上限从 1000 条降到 400 条，并补一个总字符数封顶。
// 1000 条 × 单条最多 6000 字符 = 600 万字符，而 localStorage 通常只有 5MB —— 写盘必失败，
// 而 persistJd 的 catch(e){} 把配额错误完全吞掉 → 缓存静默失效 → 每次点按钮都重拉全部详情页，
// 请求量翻几十倍；写满还会让同源下所有脚本（watcher 的盯岗数据、insight 的镜像）的落盘一起失效。
const JD_TTL=7*24*3600*1000, JD_MAX=400, JD_MIN=30, JD_MAX_CHARS=1200000;
// v1.3.1：详情正文的「像不像正文」校验
// 站点把卡片摘要（SEO description）也塞在内联 JSON 里，形如：
//   「XX招聘，薪资：5-6K，地点：深圳，要求：经验不限，学历：大专，福利：…，HR刚刚在线，随时随地直接开聊。」
// 它同样 30+ 字，旧代码把它当正文缓存 → 详情排除词永远命中不了，还占住「已取」名额挡住重新补取。
const JD_JUNK=/(刚刚在线|随时随地直接开聊)|薪资\s*[：:][^，,\n]{1,24}[，,]\s*地点\s*[：:][^，,\n]{1,24}[，,]\s*要求\s*[：:]|招聘\s*[，,]\s*薪资[\s\S]{0,60}?地点\s*[：:]/;
const JD_MARK=/职位(描述|详情|要求|诱惑)|岗位职责|任职要求|工作职责|职责描述|工作内容|岗位要求|任职资格|你将负责|主要职责|加分项|我们提供/;
function jdLooksReal(t){
  const s=String(t||'').trim();
  if(s.length<JD_MIN) return false;
  if(JD_JUNK.test(s)) return false;      // 卡片摘要 / SEO 描述：再长也不是正文
  if(JD_MARK.test(s)) return true;       // 正文常见小标题
  return s.length>=300;                  // 没有小标题的长文本（有些岗位正文就是整段）
}
const jdCache={};
let jdLoaded=false, jdSaveT=null;
function loadJd(){
  if(jdLoaded) return;
  jdLoaded=true;
  try{
    const o=JSON.parse(localStorage.getItem(JD_KEY)||'{}')||{};
    Object.keys(o).forEach(k=>{ if(o[k]&&typeof o[k]==='object') jdCache[k]=o[k]; });
  }catch(e){}
  pruneJd();
}
function persistJd(){
  if(jdSaveT) return;
  jdSaveT=setTimeout(()=>{
    jdSaveT=null;
    pruneJd();
    try{ localStorage.setItem(JD_KEY, JSON.stringify(jdCache)); }
    catch(e){
      // v1.2.9：配额错误不再静默 —— 写不下就砍掉一半再试一次，仍失败就如实提示，
      // 否则缓存静默失效、你每次点按钮都重拉全部详情页，请求量翻几十倍。
      try{
        const ks=Object.keys(jdCache).sort((a,b)=>((jdCache[a]||{}).ts||0)-((jdCache[b]||{}).ts||0));
        ks.slice(0,Math.floor(ks.length/2)).forEach(k=>{ delete jdCache[k]; });
        localStorage.setItem(JD_KEY, JSON.stringify(jdCache));
        toast('本机存储紧张：详情缓存已自动减半（'+Object.keys(jdCache).length+' 条）。别的脚本的落盘可能也受影响。',5000);
      }catch(e2){
        toast('本机存储已满：详情缓存写不进去，本次补取的详情刷新后会丢。建议清掉一些别家脚本的存储。',6000);
      }
    }
  },800);
}
function pruneJd(){
  const now=Date.now();
  Object.keys(jdCache).forEach(k=>{
    const r=jdCache[k];
    if(!r||typeof r!=='object'||(now-(r.ts||0))>JD_TTL){ delete jdCache[k]; return; }
    // v1.3.1：顺手清掉「不是正文」的脏条目 —— 否则它们占着「已取」名额，7 天内不会再被补取
    if(!jdLooksReal(r.jd)) delete jdCache[k];
  });
  let ks=Object.keys(jdCache);
  // v1.2.9：先按条数裁，再按总字符数裁（双闸，任一条超了就削）
  if(ks.length>JD_MAX){
    ks.sort((a,b)=>((jdCache[a]||{}).ts||0)-((jdCache[b]||{}).ts||0)).slice(0,ks.length-JD_MAX).forEach(k=>{ delete jdCache[k]; });
    ks=Object.keys(jdCache);
  }
  let total=0; ks.forEach(k=>{ total+=String((jdCache[k]||{}).jd||'').length; });
  if(total>JD_MAX_CHARS){
    ks.sort((a,b)=>((jdCache[a]||{}).ts||0)-((jdCache[b]||{}).ts||0));
    while(total>JD_MAX_CHARS&&ks.length>JD_MIN){
      const k=ks.shift(); total-=String((jdCache[k]||{}).jd||'').length; delete jdCache[k];
    }
  }
}
function jdTextOf(jobId){
  loadJd();
  const r=jdCache[String(jobId||'').trim()];
  if(!r) return '';
  if(Date.now()-(r.ts||0)>JD_TTL) return '';
  const t=String(r.jd||'');
  // v1.3.1：不可信的条目（卡片摘要等）一律当作「没有正文」→ 不参与判定，也会重新进入待取队列
  return jdLooksReal(t)?t:'';
}
function hasJd(jobId){ return !!jdTextOf(jobId); }
function setJd(jobId,jdText,addr){
  const k=String(jobId||'').trim();
  if(!k) return false;
  const t=String(jdText||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,8000);
  if(t.length<JD_MIN) return false;
  // v1.3.1：不是正文就别入库 —— 存进去反而会占住「已取」名额，把真正的补取挡在门外
  if(!jdLooksReal(t)) return false;
  const a=String(addr||'').replace(/\s+/g,' ').trim().slice(0,60);   // v1.3.3：顺手存「工作地址」（页面内面板 / 详情接口都能给）
  loadJd();
  const prev=jdCache[k];
  const nextA=a||(prev&&prev.addr)||'';
  if(prev&&prev.jd===t){
    prev.ts=Date.now();
    if(nextA&&nextA!==(prev.addr||'')){ prev.addr=nextA; persistJd(); return true; }   // 正文没变但补到了地址
    return false;
  }
  jdCache[k]={ts:Date.now(), jd:t};
  if(nextA) jdCache[k].addr=nextA;
  pruneJd(); persistJd();
  return true;
}
// v1.3.3：本脚本自己缓存的「工作地址」（与监控脚本的镜像双源并列，任一命中即隐藏）
function jdAddrOf(jobId){
  loadJd();
  const r=jdCache[String(jobId||'').trim()];
  if(!r) return '';
  if(Date.now()-(r.ts||0)>JD_TTL) return '';
  if(!jdLooksReal(r.jd)) return '';
  return String(r.addr||'');
}
function jdCount(){
  loadJd();
  const t=Date.now();
  return Object.keys(jdCache).filter(k=>(t-((jdCache[k]||{}).ts||0))<=JD_TTL).length;
}
function clearJdCache(){ loadJd(); Object.keys(jdCache).forEach(k=>{ delete jdCache[k]; }); persistJd(); }
// 详情正文：优先读页面 Vue 组件状态（字段干净），取不到再退回 DOM 选择器（沿用监控脚本那套）
function domText(el){ return String((el&&(el.innerText||el.textContent))||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function jdFromDom(root){
  try{
    const sels=['.job-sec-text','[class*="job-sec-text"]','.job-detail-section .text','.detail-content .text','.job-detail .text'];
    for(const s of sels){
      const t=Array.prototype.slice.call(root.querySelectorAll(s)).map(domText).filter(x=>x.length>30).join('\n');
      if(jdLooksReal(t)) return t.slice(0,6000);   // v1.3.1：取到的必须像正文
    }
  }catch(e){}
  let best='';
  try{
    Array.prototype.slice.call(root.querySelectorAll('div,section')).forEach(el=>{
      if(el.children.length>3) return;
      const t=domText(el);
      if(t.length>best.length&&t.length>80&&!JD_JUNK.test(t)) best=t;   // v1.3.1：兜底也别把卡片摘要当正文
    });
  }catch(e){}
  return jdLooksReal(best)?best.slice(0,6000):'';
}
function jdFromVue(){
  try{
    const all=document.querySelectorAll('div,section,main,article');
    for(let i=0;i<all.length&&i<6000;i++){
      const v=all[i].__vue__;
      if(!v) continue;
      const d=v.jobDetail||v.jobInfo||v.detailData||v.jobData;
      if(!d||typeof d!=='object') continue;
      const jd=String(d.jobDescription||d.jobDesc||'');   // v1.3.1：不收 d.description（那是卡片摘要）
      if(!jdLooksReal(jd)) continue;
      const addr=String(d.locationName||d.locationAddress||d.address||d.jobAddress||'');
      const name=String(d.jobName||d.jobTitle||'');
      return [name,addr,jd].filter(Boolean).join('\n').slice(0,6000);
    }
  }catch(e){}
  return '';
}
function detailJobId(){
  const m=String(location.pathname||'').match(/job[_\-]?detail\/([^.\/?#]+)/i);
  return m?m[1]:'';
}
function detailRootEl(){
  try{ return document.querySelector('.job-detail-box,.job-detail,.page-detail-wrapper,.page-job-detail,.job-primary,#main')||document.body; }catch(e){ return document.body; }
}
let capAt=0, capHit='';
function detailTextNow(){ return jdFromVue()||jdFromDom(detailRootEl()); }
// 从拉回来的详情页 HTML 里抠正文：先找内联 JSON 的 jobDescription/jobDesc（**不收 description**），再退回按 DOM 解析
// v1.3.1：原来把 description 也算候选，而卡片摘要的字段名就是它、且通常排在正文前面 →
// 每次都把「XX招聘，薪资：…地点：…要求：…福利：…刚刚在线，随时随地直接开聊。」当成正文存了下来。
// v1.3.3：把「从一段文本里抠 jobDescription」单独抽出来 —— HTML 详情页、JSON 详情接口、页面钩子抄到的响应都用它
function jdCandsFromText(t){
  const cands=[];
  try{
    const re=/"job(?:Description|Desc)"\s*:\s*"((?:[^"\\]|\\.){20,})"/g;
    let m, n=0;
    while((m=re.exec(t))&&n<8){
      n++;
      try{ cands.push(JSON.parse('"'+m[1]+'"')); }catch(e){}
    }
  }catch(e){}
  return cands;
}
function jdJsonOnly(t){ for(const c of jdCandsFromText(String(t||''))){ if(jdLooksReal(c)) return String(c).slice(0,6000); } return ''; }
function jdFromHtml(html){
  const t=String(html||'');
  const s=jdJsonOnly(t);
  if(s) return s;
  try{
    const doc=new DOMParser().parseFromString(t,'text/html');
    const s2=jdFromDom(doc);
    if(jdLooksReal(s2)) return s2;
  }catch(e){}
  return '';
}
// v1.3.3：从响应里认岗位 ID 与工作地址（都只认「像样」的值，认不准就放弃 —— 宁可没有，也不能张冠李戴）
function jdIdInText(t){
  const s=String(t||'');
  // v1.3.3：长度只做极宽松的护栏（原来写 6 字符下限，短 ID 会被整条丢掉、看着像「钩子没生效」）
  const m=s.match(/"encryptJobId"\s*:\s*"([^"\\]{2,120})"/)||s.match(/"jobId"\s*:\s*"([^"\\]{2,120})"/)||s.match(/"encryptId"\s*:\s*"([^"\\]{2,120})"/);
  return m?m[1]:'';
}
function jdAddrInText(t){
  const s=String(t||'');
  const m=s.match(/"(?:locationName|locationAddress|jobAddress|address)"\s*:\s*"((?:[^"\\]|\\.){2,80})"/);
  if(!m) return '';
  let v=m[1];
  try{ v=JSON.parse('"'+v+'"'); }catch(e){}
  v=String(v).replace(/\s+/g,' ').trim();
  if(v.length<4||v.length>60) return '';
  return /[区路号栋座楼层街镇村大厦中心园广场]/.test(v)?v:'';
}
// v1.3.3：把「一段响应文本」变成缓存（页面钩子 / 详情接口共用）
function ingestDetailText(text,hintJobId){
  const s=String(text||'');
  if(!s||s.length>1500000) return 0;
  if(s.indexOf('jobDescription')<0&&s.indexOf('jobDesc')<0) return 0;   // 便宜的前置过滤，避免白解析
  const jd=jdJsonOnly(s);
  if(!jd) return 0;
  const id=String(hintJobId||jdIdInText(s)||'').trim();
  if(!id) return 0;
  return setJd(id,jd,jdAddrInText(s))?1:0;
}
// 只有「你点开的详情页」才会走这里：被动缓存当页正文 + 顺手算一下这页命中没命中（只用于小条提示）
function captureDetail(){
  const id=detailJobId();
  if(!id) return;
  const t=Date.now();
  if(t-capAt<2000) return;
  capAt=t;
  const domNow=detailTextNow();
  if(jdLooksReal(domNow)) setJd(id,domNow);   // v1.3.1：不似正文就不缓存（取不到就不判）
  const jd=String((jdTextOf(id)||domNow)||'').toLowerCase();
  const hitJd=wordHit(cfg.wordsJd,jd,true), hitAbs=wordHit(cfg.words,jd,true);
  const next=hitJd?('详情排除词：'+hitJd):(hitAbs?('绝对排除词：'+hitAbs):'');
  if(next!==capHit){ capHit=next; updateChip(); }
}
// ---------- v1.3.3：页面内的职位详情面板（列表页右侧）—— 点一下卡片就缓存，零请求 ----------
// 口径：只认「不在卡片内部」的正文容器；面板正文必须与「点击前的正文」不同才算换了岗位，
// 否则宁可放弃（最多等 6 轮），也不能把上一个岗位的正文记到新卡上。
let paneWantId='', paneBase='', paneTries=0, paneZeroReq=0;
// 这些位置一律不算「职位详情面板」：卡片内部、脚本自己的面板、列表/推荐位容器（含 2 个以上岗位链接）
function paneBadRoot(el){
  try{
    if(!el) return true;
    if(el.closest&&el.closest('.bwf-wrap')) return true;
    if(el.closest&&el.closest('li.job-card-wrapper,li.job-card-box,li[class*="job-card"],.job-card-body,.job-card-left')) return true;
    if(el.querySelectorAll&&el.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]').length>1) return true;
  }catch(e){}
  return false;
}
function paneTextNow(){
  try{
    const nodes=document.querySelectorAll('.job-sec-text,[class*="job-sec-text"],.job-detail-section .text,.detail-content .text');
    for(let i=0;i<nodes.length;i++){
      const el=nodes[i];
      if(paneBadRoot(el)) continue;
      const t=domText(el);
      if(jdLooksReal(t)) return t;
    }
  }catch(e){}
  let best='';
  try{
    const all=document.querySelectorAll('div,section,article');
    for(let i=0;i<all.length&&i<1500;i++){
      const el=all[i];
      if(el.children.length>3||paneBadRoot(el)) continue;
      const t=domText(el);
      if(t.length>best.length&&t.length>80&&jdLooksReal(t)) best=t;
    }
  }catch(e){}
  return best;
}
// v1.3.3：面板里的「工作地址」取法 —— 站点真实形态是「工作地址」标题 + 一行「深圳龙岗区 荣丰中心A栋」+ 一张地图。
// 所以：先找「包含『工作地址』且整体不太长」的容器（从小到大试），再从它的文本里取「工作地址」后面那一行 ——
// 这样地图上的路名/园区名在下一行，不会被当成地址拼进来。
function addrFromText(t){
  const s=String(t||'').replace(/\r/g,'');
  const i=s.lastIndexOf('工作地址');
  if(i<0) return '';
  let rest=s.slice(i+'工作地址'.length).replace(/^[：:\s·|]+/,'');
  rest=rest.split('\n')[0].replace(/^\s*[📍📌]\s*/,'').replace(/\s+/g,' ').trim();
  if(rest.length<4||rest.length>60) return '';
  return /[区路号栋座楼层街镇村大厦中心园广场]/.test(rest)?rest:'';
}
function paneAddrNow(){
  try{
    const all=document.querySelectorAll('div,section,article');
    const cand=[];
    for(let i=0;i<all.length&&i<1500;i++){
      const el=all[i];
      if(paneBadRoot(el)) continue;
      const t=domText(el);
      if(t.indexOf('工作地址')<0||t.length>400) continue;   // 太长的容器（含地图/推荐位）不要
      cand.push({el, len:t.length});
    }
    cand.sort((a,b)=>a.len-b.len);                          // 从小到大：先试最贴近地址的那一层
    for(const c of cand){ const v=addrFromText(domText(c.el)); if(v) return v; }
  }catch(e){}
  return '';
}
function paneCardJobId(el){
  try{
    let cur=el;
    for(let i=0;i<8&&cur;i++){
      if(cur.tagName==='A'&&/job[_\-]?detail\//i.test(cur.getAttribute('href')||'')) return jobIdFromHref(cur.getAttribute('href')||cur.href||'');
      if(cur.querySelector){
        const a=cur.querySelector('a[href*="job_detail"],a[href*="job-detail"]');
        if(a){ const id=jobIdFromHref(a.getAttribute('href')||a.href||''); if(id) return id; }
      }
      cur=cur.parentElement;
    }
  }catch(e){}
  return '';
}
function paneClick(ev){
  try{
    const id=paneCardJobId(ev.target);
    if(!id) return;
    paneWantId=id;
    paneBase=paneTextNow();      // 记下「点之前的正文」，等它换成新岗位的再缓存
    paneTries=0;
  }catch(e){}
}
document.addEventListener('pointerdown',paneClick,true);
document.addEventListener('click',paneClick,true);
function capturePane(){
  if(!paneWantId) return;
  if(hasJd(paneWantId)){ paneWantId=''; return; }
  const t=paneTextNow();
  if(!t||!jdLooksReal(t)) return;
  if(t===paneBase){ if(++paneTries>6) paneWantId=''; return; }   // 面板没换（或正文在别处）→ 放弃，别硬塞
  if(setJd(paneWantId,t,paneAddrNow())){
    paneZeroReq++;
    paneWantId='';
    if(ui&&ui.panel&&ui.panel.style.display==='block') renderJdStat();
    schedule();
  }
}
// ---------- v1.1.0：补取详情（默认关；只有你勾了 + 点了按钮才发请求）----------
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function jdTodayStr(){
  const d=new Date(), p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function jdUsedToday(){
  if(!cfg.jdUsed||typeof cfg.jdUsed!=='object') cfg.jdUsed={date:'',used:0};
  if(cfg.jdUsed.date!==jdTodayStr()) cfg.jdUsed={date:jdTodayStr(),used:0};
  return cfg.jdUsed.used||0;
}
function jdDailyLeft(){ return Math.max(0,(cfg.jdDaily||40)-jdUsedToday()); }
// v1.2.9：失败冷却 + 超时。
// 原来站点限流时照发满 20 次并烧掉当日额度；请求挂住则 jdBusy 永远是 true →
// 按钮静默失效、刷新前无法恢复、也没有任何提示。
let jdCoolUntil=0, jdStreak=0;
function jdCooling(){ return Date.now()<jdCoolUntil; }
// v1.3.3：风控文案统一一处（整页 HTML 与 JSON 接口共用）
function riskText(t){
  return /操作过于频繁|安全验证|访问过于频繁|请完成验证|异常流量|环境存在异常|verify-slider|security-check|请稍候|请稍后|正在验证|安全校验|滑动验证/.test(String(t||''));
}
function bstToken(){
  try{ const m=String(document.cookie||'').match(/(?:^|;\s*)bst=([^;]+)/); return m?m[1]:''; }catch(e){ return ''; }
}
// v1.3.3：站点的 JSON 详情接口（点卡片时站点自己走的那条路，比整页轻）—— 需要列表接口给的 securityId + lid
function detailApiInfo(jobId){
  const a=apiJobs[String(jobId||'').trim()];
  if(!a||!a.securityId||!a.lid) return null;
  return {securityId:String(a.securityId), lid:String(a.lid)};
}
async function fetchOneDetailApi(jobId){
  const info=detailApiInfo(jobId);
  if(!info) return {skip:true};
  const url='/wapi/zpgeek/job/detail.json?securityId='+encodeURIComponent(info.securityId)+'&lid='+encodeURIComponent(info.lid);
  let res;
  try{
    res=await Promise.race([
      fetch(url,{credentials:'same-origin',headers:{'Zp_token':bstToken()||''}}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000))
    ]);
  }catch(e){ return {ok:false, why:e&&e.message==='timeout'?'接口超时（15 秒）':'接口网络错误', cool:true}; }
  if(!res||!res.ok) return {ok:false, why:'接口 HTTP '+(res?res.status:0), cool:!!res&&[403,429,503].indexOf(res.status)>=0};
  let txt='';
  try{ txt=await res.text(); }catch(e){ return {ok:false, why:'接口响应读取失败'}; }
  if(riskText(txt)) return {ok:false, why:'站点限流/验证页', cool:true};
  if(!ingestDetailText(txt,jobId)) return {ok:false, why:'接口里没读到职位描述'};
  return {ok:true, via:'api'};
}
async function fetchOneDetail(href,jobId){
  // v1.3.3：先走 JSON 详情接口（轻），被拦或读不到再回退整页 HTML
  const api=await fetchOneDetailApi(jobId);
  if(api.ok) return api;
  if(api.cool) return api;                       // 接口已经撞上验证页 → 别再补一刀整页请求
  const url=href||('/job_detail/'+encodeURIComponent(jobId)+'.html');
  let res;
  try{
    res=await Promise.race([
      fetch(url,{credentials:'same-origin'}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000))
    ]);
  }catch(e){ return {ok:false, why:e&&e.message==='timeout'?'请求超时（15 秒）':'网络错误', cool:true}; }
  if(!res||!res.ok){
    const st=res?res.status:0;
    return {ok:false, why:'HTTP '+st, cool:(st===403||st===429||st===503)};
  }
  let html='';
  try{ html=await res.text(); }catch(e){ return {ok:false, why:'响应读取失败', cool:true}; }
  // v1.3.1：补上站点验证页的真实文案（实测未带 cookie 拉详情页会返回「请稍候 - BOSS直聘」），
  // 这类响应原来只算一次普通失败、不进冷却，会继续按节奏把整批发完。
  if(riskText(html))
    return {ok:false, why:'站点限流/验证页', cool:true};
  const jd=jdFromHtml(html);
  if(!jd) return {ok:false, why:'页面里没读到职位描述'};
  setJd(jobId,jd,jdAddrInText(html));
  return {ok:true};
}
let jdBusy=false, jdLastMsg='';
function pagePendingIds(){
  const todo=[], seen={};
  findCards().forEach(it=>{
    if(!it.jobId||seen[it.jobId]) return;
    seen[it.jobId]=1;
    if(!hasJd(it.jobId)) todo.push({id:it.jobId, href:it.href});
  });
  return todo;
}
async function fetchPageDetails(){
  if(jdBusy) return;
  if(!cfg.jdFetch){ jdLastMsg='未开始：先勾上「允许补取详情」'; renderJdStat(); return; }
  if(!(cfg.wordsJd||[]).length){ jdLastMsg='未开始：详情排除词还是空的'; renderJdStat(); return; }
  if(jdCooling()){ jdLastMsg='冷却中：还要 '+Math.ceil((jdCoolUntil-Date.now())/60000)+' 分钟（上次被站点限流）'; renderJdStat(); return; }
  const todo=pagePendingIds();
  const n=Math.min(todo.length, jdDailyLeft(), 20);
  if(!n){
    // v1.3.1：分清「都取过了」和「一张卡都没认出来」——后者补取是发不出任何请求的
    const all=findCards().length;
    jdLastMsg=todo.length?('今日补取额度用完了（上限 '+(cfg.jdDaily||40)+'）'):(all?('本页岗位都已经取过（'+all+' 张卡都有正文）'):'没识别到职位卡片，没法补取');
    renderJdStat(); return;
  }
  jdBusy=true;
  let ok=0, fail=0, cooled=false;
  try{
    for(let i=0;i<n;i++){
      if(!cfg.jdFetch) break;
      await sleep(1200+Math.random()*1300);
      let r;
      try{ r=await fetchOneDetail(todo[i].href, todo[i].id); }catch(e){ r={ok:false, why:'异常：'+(e&&e.message||'')}; }
      if(r.ok){ ok++; jdStreak=0; schedule(); }   // 取到一条就先刷一次列表，不用等整批跑完
      else{
        fail++;
        // v1.2.9：连续失败即停 —— 站点限流时不要照发满 20 次、白烧当日额度
        if(r.cool||++jdStreak>=3){
          jdCoolUntil=Date.now()+15*60*1000;
          cooled=true;
          jdLastMsg='已停：连续 '+(r.cool?'被站点限流':jdStreak+' 次')+'（'+(r.why||'')+'），冷却 15 分钟';
          break;
        }
      }
      cfg.jdUsed.used=(cfg.jdUsed.used||0)+1; saveCfg();
      jdLastMsg='补取中… '+(i+1)+'/'+n; renderJdStat();
    }
  }finally{
    jdBusy=false;   // v1.2.9：放 finally 里 —— 原来中途 return/抛异常会让 jdBusy 永远为 true，按钮静默失效
  }
  if(!cooled) jdLastMsg='补取完成：成功 '+ok+' 条'+(fail?(' · 失败 '+fail+' 条'):'');
  applyFilter(); renderPanel();
}
function renderJdStat(){
  const el=document.getElementById('bwfJdStat');
  if(!el) return;
  const pend=pagePendingIds().length;
  let s='已取 '+jdCount()+' 条 · 本页待取 '+pend+' · 今日补取 '+jdUsedToday()+'/'+(cfg.jdDaily||40);
  // v1.3.3：页面内面板/接口抄来的条数（零请求）单独点出来，让「不用补取也能覆盖」看得见
  if(paneZeroReq) s+=' · 其中页面内零请求 '+paneZeroReq+' 条';
  // v1.3.1：把「为什么不判」写在脸上 —— 没取到正文时详情排除词是不判的，别让人以为过滤坏了
  if(pend&&!cfg.jdFetch) s+=' · 未勾「允许补取详情」，这 '+pend+' 张卡的详情词不会判';
  if(jdLastMsg) s+=' · '+jdLastMsg;
  el.textContent=s;
}
// v1.3.4：黑名单的「宽松包含」——站点给的文本自带空格/圆点（「深圳·龙岗区·坂田」「深圳龙岗区 荣丰中心A栋」），
// 你按习惯写「深圳龙岗区银信中心B座」时会因分隔符对不上而漏判；两侧都先抹掉空白与常见分隔符再比。
function looseKey(s){
  return String(s||'').toLowerCase().replace(/[\s\u00a0·、,，.。;；/\|_\-—－()（）[\]【】「」]+/g,'');
}
function decide(ctx){
  // 0) 黑名单是「绝对」项：命中就隐藏，不参与后续相对规则的权衡
  const compLow=String(ctx.company||'').toLowerCase(), cardLow=String(ctx.cardText||'').toLowerCase();
  const compKey=looseKey(ctx.company), cardKey=looseKey(ctx.cardText);
  for(const c of (cfg.blackCompanies||[])){
    const k=String(c||'').trim();
    if(!k) continue;
    const kk=looseKey(k), kLow=k.toLowerCase();
    if(!kk) continue;
    if(compKey.includes(kk)||compLow.includes(kLow)) return {text:'黑名单·公司：'+k, action:'隐藏'};
    // v1.2.2：公司名字段没取到/对不上时，退回整张卡片文字匹配（你写在卡片上的名字，出现即算）
    if(cardKey.includes(kk)||cardLow.includes(kLow)) return {text:'黑名单·公司：'+k+'（卡片文字命中）', action:'隐藏'};
  }
  const realAddr=jobAddrOf(ctx.jobId);          // 详情页的「工作地址」（卡片上的区可能不准）
  const ownAddr=jdAddrOf(ctx.jobId);            // v1.3.3：本脚本自己缓存的「工作地址」（页面内面板 / 详情接口）
  for(const a of (cfg.blackAreas||[])){
    const k=String(a||'').trim();
    if(!k) continue;
    const kk=looseKey(k), kLow=k.toLowerCase();
    if(!kk) continue;
    const inCard=cardKey.includes(kk)||cardLow.includes(kLow);
    const inReal=looseKey([String(realAddr.addr||''),String(realAddr.area||''),String(ownAddr||'')].join(' ')).includes(kk);
    if(inReal) return {text:'黑名单·工作地址：'+k, action:'隐藏'};
    if(inCard) return {text:'黑名单·地点(卡片)：'+k, action:'隐藏'};   // v1.2.5：双源并列——详情地址存在时卡片命中仍生效
  }
  // 0.5) 已投递名单（由导入表格维护：一行一个公司名/岗位名/职位ID）
  for(const a of (cfg.applied||[])){
    const k=String(a||'').trim();
    if(!k) continue;
    if(ctx.jobId&&ctx.jobId===k) return {text:'已投递：'+k, action:'隐藏'};
    if(String(ctx.company||'').includes(k)||String(ctx.name||'').includes(k)) return {text:'已投递：'+k, action:'隐藏'};
  }
  // 0.6) 看过的岗位（跨会话去重，默认关）
  // v1.2.3 V2：补上「N 天内」上限 —— 原实现只要 1 小时前看过就永久隐藏，面板上的天数根本没参与判断；
  // 1 小时内不隐藏（正在本页刷的岗位）保持不变
  if((cfg.seenDays||0)>0&&ctx.jobId){
    const t=(cfg.seen||{})[ctx.jobId];
    if(t){
      const age=Date.now()-t;
      if(age>3600*1000&&age<=(cfg.seenDays*86400*1000)) return {text:'看过的岗位', action:'隐藏', seenHit:true};
    }
  }
  // 三层排除词（v1.1.0）
  //   绝对 = 卡片字段 + 详情正文；卡片 = 只看卡片字段；详情 = 只看详情正文（详情没取到就不判）
  const t=[ctx.name,ctx.company,ctx.tags,ctx.cardText].join(' ').toLowerCase();   // 快捷卡片上能看到的字段
  const addr=realAddr;                                                // 详情页的真实工作地址（监控脚本镜像过来的）
  const jd=[jdTextOf(ctx.jobId), addr.addr||'', addr.area||'', ownAddr].filter(Boolean).join('\n').toLowerCase();
  const hitAbs=wordHit(cfg.words, t+'\n'+jd, true);
  if(hitAbs) return {text:'绝对排除词：'+hitAbs, action:'隐藏'};
  const hitCard=wordHit(cfg.wordsCard, t, true);
  if(hitCard) return {text:'卡片排除词：'+hitCard, action:'隐藏'};
  if(jd){
    const hitJd=wordHit(cfg.wordsJd, jd, true);
    if(hitJd) return {text:'详情排除词：'+hitJd, action:'隐藏'};
  }
  // v1.2.9：「标记」类规则不能先于薪资判定返回。
  // 模板里默认启用的「在招职位数>100 → 标记」一旦命中就直接 return，后面的「月薪 < 4000 → 隐藏」
  // 永远轮不到 —— 而这些卡恰恰来自你最想避开的人力外包公司，且 deliver 不认「标记」状态、仍会投。
  // 现在：先跑「隐藏」类规则（命中即返回），「标记」类规则只记下第一条，等所有隐藏判定都跑完再采纳。
  let pendingMark=null;
  for(const r of (cfg.rules||[])){
    if(r.enabled===false) continue;
    try{
      if(testRule(r,ctx)){
        const isMark=/标记|mark/i.test(r.action||'');
        const hit={text:'规则：'+[r.field,r.op,r.value].filter(Boolean).join(' ')+(r.note?('（'+r.note+'）'):''),
          action:isMark?'标记':'隐藏'};
        if(!isMark) return hit;
        if(!pendingMark) pendingMark=hit;
      }
    }catch(e){}
  }
  // 薪资：优先接口明文，其次 DOM；DOM 是乱码就跳过薪资判断（宁可不判，也别判错）
  const p=ctx.salary;
  if(cfg.hideSalaryOut){
    if(p.type==='month'){
      if(p.low<cfg.minMonthly) return {text:'月薪 < '+cfg.minMonthly, action:'隐藏'};
      if(p.low>cfg.maxMonthly) return {text:'月薪 > '+cfg.maxMonthly, action:'隐藏'};
    }else if(p.type==='day'&&p.low<cfg.minDaily) return {text:'日薪 < '+cfg.minDaily, action:'隐藏'};
  }
  if(p.type==='unknown'&&cfg.hideNegotiable&&/面议|不限/.test(ctx.salaryText||'')) return {text:'薪资面议/无法识别', action:'隐藏'};
  if(pendingMark) return pendingMark;   // v1.2.9：所有隐藏判定都轮过之后，才轮到「标记」
  return null;
}

// ---------- 表格导入 / 导出（CSV / TSV，Excel 直接复制粘贴也行）----------
function splitCsvLine(line,delim){
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){
      if(c==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else q=false; }
      else cur+=c;
    }else{
      if(c==='"') q=true;
      else if(c===delim){ out.push(cur); cur=''; }
      else cur+=c;
    }
  }
  out.push(cur);
  return out;
}
function parseTable(text){
  const t=String(text||'').replace(/^\uFEFF/,'');
  const lines=t.split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length<2) return [];
  const head=lines[0];
  const delim=(head.split('\t').length>head.split(',').length)?'\t':',';
  const cols=splitCsvLine(head,delim).map(s=>s.trim());
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cells=splitCsvLine(lines[i],delim);
    if(!cells.join('').trim()) continue;
    const o={};
    cols.forEach((c,j)=>{ o[c]=String(cells[j]===undefined?'':cells[j]).trim(); });
    rows.push(o);
  }
  return rows;
}
function csvEscape(s){ s=String(s==null?'':s); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function toCsv(rows){ return '\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n'); }
function importRows(rows){
  let n=0;
  rows.forEach(o=>{
    const value=String(o['值']||o['value']||o['关键词']||o['排除词']||'').trim();
    if(!value) return;
    const type=String(o['类型']||o['type']||'关键词').trim();
    const field=String(o['字段']||o['field']||'全部').trim();
    // 黑名单：绝对项，按公司名 / 地点单独存
    if(/黑名单|blacklist/i.test(type)){
      if(/地点|区域|地区|位置|area|location/i.test(field)||/地点/.test(type)){
        cfg.blackAreas.push(value);
      }else{
        cfg.blackCompanies.push(value);
      }
      n++;
      return;
    }
    // 已投递名单：一行一个公司名/岗位名/职位ID
    if(/已投|投递|applied/i.test(type)){
      cfg.applied=cfg.applied||[];
      cfg.applied.push(value);
      n++;
      return;
    }
    const enabled=!/^(否|no|false|0|停用)$/i.test(String(o['启用']||o['enabled']||'是').trim());
    cfg.rules.push({
      type,
      field,
      op:String(o['匹配']||o['op']||'包含').trim(),
      value,
      action:String(o['动作']||'隐藏').trim(),
      enabled,
      note:String(o['备注']||o['note']||'').trim()
    });
    n++;
  });
  return n;
}
function downloadText(name,text,mime){
  try{
    const blob=new Blob([text],{type:(mime||'text/csv')+';charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }catch(e){}
}
function downloadTemplate(){ downloadText('过滤规则模板.csv', toCsv([TABLE_HEAD].concat(TEMPLATE_ROWS))); }
// ---------- 生成 .xlsx 模板（列宽 / 冻结表头 / 加粗 / 下拉 / 说明页）----------
function crc32(buf){
  let table=crc32._t;
  if(!table){
    table=crc32._t=new Uint32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); table[n]=c>>>0; }
  }
  let crc=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) crc=table[(crc^buf[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function txt2u8(s){ return new TextEncoder().encode(s); }
function zipStore(files){
  const nb=(v,n)=>{ const a=new Uint8Array(n); for(let i=0;i<n;i++) a[i]=(v>>>(i*8))&0xFF; return a; };
  const cat=(...as)=>{ const n=as.reduce((s,a)=>s+a.length,0); const o=new Uint8Array(n); let p=0; as.forEach(a=>{ o.set(a,p); p+=a.length; }); return o; };
  const d=new Date();
  const time=((((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|((d.getSeconds()/2)&31)))&0xFFFF;
  const date=((((d.getFullYear()-1980)&127)<<9)|(((d.getMonth()+1)&15)<<5)|(d.getDate()&31))&0xFFFF;
  const parts=[], central=[]; let off=0;
  files.forEach(f=>{
    const name=txt2u8(f.name), data=f.data, crc=crc32(data);
    const lh=cat(nb(0x04034b50,4),nb(20,2),nb(0x0800,2),nb(0,2),nb(time,2),nb(date,2),nb(crc,4),nb(data.length,4),nb(data.length,4),nb(name.length,2),nb(0,2));
    parts.push(lh,name,data);
    central.push(cat(nb(0x02014b50,4),nb(20,2),nb(20,2),nb(0x0800,2),nb(0,2),nb(time,2),nb(date,2),nb(crc,4),nb(data.length,4),nb(data.length,4),nb(name.length,2),nb(0,2),nb(0,2),nb(0,2),nb(0,2),nb(0,4),nb(off,4)),name);
    off+=lh.length+name.length+data.length;
  });
  const cd=cat(...central);
  const eocd=cat(nb(0x06054b50,4),nb(0,2),nb(0,2),nb(files.length,2),nb(files.length,2),nb(cd.length,4),nb(off,4),nb(0,2));
  return cat(...parts,cd,eocd);
}
function xlsxColName(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
function xlsxEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function sheetXml(rows,opts){
  opts=opts||{};
  const cols=(opts.widths||[]).map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
  const body=rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
    const ref=xlsxColName(ci)+(ri+1);
    const bold=(ri===0&&opts.boldHeader)?' s="1"':'';
    if(typeof v==='number'&&isFinite(v)) return '<c r="'+ref+'"'+bold+'><v>'+v+'</v></c>';
    return '<c r="'+ref+'"'+bold+' t="inlineStr"><is><t xml:space="preserve">'+xlsxEsc(String(v==null?'':v).slice(0,32000))+'</t></is></c>';
  }).join('')+'</row>').join('');
  const dv=(opts.validations||[]).map(v=>'<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="'+v.range+'"><formula1>'+xlsxEsc(v.list)+'</formula1></dataValidation>').join('');
  const freeze=opts.freeze?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    freeze+(cols?'<cols>'+cols+'</cols>':'')+'<sheetData>'+body+'</sheetData>'+
    (dv?'<dataValidations count="'+(opts.validations.length)+'">'+dv+'</dataValidations>':'')+'</worksheet>';
}
function buildXlsx(sheets){
  const H='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS='http://schemas.openxmlformats.org/package/2006/relationships';
  const ct=H+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
  const rels=H+'<Relationships xmlns="'+NS+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb=H+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
    sheets.map((s,i)=>'<sheet name="'+xlsxEsc(String(s.name||('Sheet'+(i+1))).replace(/[\[\]\*\?\/\\:]/g,'_').slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
  const wbr=H+'<Relationships xmlns="'+NS+'"'+
    '><Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
    sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>';
  const styles=H+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'+
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'+
    '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files=[{name:'[Content_Types].xml',data:txt2u8(ct)},{name:'_rels/.rels',data:txt2u8(rels)},
    {name:'xl/workbook.xml',data:txt2u8(wb)},{name:'xl/_rels/workbook.xml.rels',data:txt2u8(wbr)},
    {name:'xl/styles.xml',data:txt2u8(styles)}];
  sheets.forEach((s,i)=>files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:txt2u8(sheetXml(s.rows,s))}));
  return zipStore(files);
}
function downloadBin(name,bytes,mime){
  try{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([bytes],{type:mime||'application/octet-stream'}));
    a.download=name;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
  }catch(e){}
}
function downloadTemplateXlsx(){
  const sheets=[
    {name:'规则', rows:[TABLE_HEAD].concat(TEMPLATE_ROWS), widths:[10,12,8,30,8,8,46], boldHeader:true, freeze:true,
      validations:[
        {range:'A2:A300', list:'类型,关键词,薪资,黑名单'},
        {range:'B2:B300', list:'字段,'+TABLE_FIELDS.join(',')},
        {range:'C2:C300', list:'匹配,'+TABLE_OPS.join(',')},
        {range:'E2:E300', list:'动作,隐藏,标记'},
        {range:'F2:F300', list:'启用,是,否'}
      ]},
    {name:'说明', rows:[
      ['列','怎么填'],
      ['类型','关键词 / 薪资 / 黑名单（只是分类，黑名单会走"绝对隐藏"）'],
      ['字段','规则作用在哪个字段上：岗位名、公司名、行业、规模、融资、在招职位数、AI判定、标签、薪资、卡片全文、全部'],
      ['匹配','包含 / 不包含 / 等于 / 正则 / 小于 / 大于（小于、大于只对「薪资」「在招职位数」有效）'],
      ['值','关键词、数字或正则：电销、4000、^客服、面议、100'],
      ['动作','隐藏 = 卡片不显示；标记 = 卡片保留，右上角打红角标'],
      ['启用','填「否」= 保留规则但不生效'],
      ['备注','会显示在卡片的过滤原因里'],
      ['',''],
      ['黑名单','类型填「黑名单」，字段填「公司名」或「地点」，值填公司关键词/地点（如 劳务、龙华）'],
      ['在招职位数','需要先用监控脚本打开过该公司/岗位详情页，脚本才知道数字（>100 基本是人力外包）'],
      ['AI判定','需要监控脚本里开启 AI 并查过该公司；判定为中介/劳务/外包时可用于标记'],
      ['工作地址','地点黑名单优先用详情页的「工作地址」（卡片上的区可能不准）'],
      ['导入','改完保存为 .csv，或直接在页面里粘贴；也可以点「导出规则」把当前规则导出成同样格式']
    ], widths:[14,86], boldHeader:true, freeze:true}
  ];
  downloadBin('过滤规则模板.xlsx', buildXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function templateText(){ return toCsv([TABLE_HEAD].concat(TEMPLATE_ROWS)); }
// 复制到剪贴板（下载被浏览器拦时的备选路径：直接粘进 Excel）
function copyText(text){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text); return true; }
  }catch(e){}
  try{
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    return true;
  }catch(e){ return false; }
}
function exportRules(){
  const rows=[TABLE_HEAD]
    .concat((cfg.blackCompanies||[]).map(c=>['黑名单','公司名','',''+c,'隐藏','是','绝对隐藏']))
    .concat((cfg.blackAreas||[]).map(a=>['黑名单','地点','',''+a,'隐藏','是','绝对隐藏']))
    .concat((cfg.rules||[]).map(r=>[r.type||'关键词',r.field||'全部',r.op||'包含',r.value||'',r.action||'隐藏',r.enabled===false?'否':'是',r.note||'']));
  downloadText('过滤规则导出.csv', toCsv(rows));
}

// ---------- 找到列表卡片（宁可不动，也绝不误伤容器）----------
// ---------- 页面接口数据：明文薪资（绕开字体反爬）----------
const apiJobs={};
// F3：索引上限 —— 列表无限滚动时旧条目会被淘汰（否则只增不减，白占内存）
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
        labels:[].concat(it.jobLabels||[],it.skills||[],it.welfareList||[]).join(' '),
        industry:String(it.brandIndustry||it.industry||''),
        scale:String(it.brandScaleName||it.brandScale||it.scale||''),
        stage:String(it.brandStageName||it.brandStage||it.stage||it.financeStage||''),
        // v1.3.3：详情接口补取要用这两样（列表接口每次都会给，等于白拿）
        securityId:String(it.securityId||''),
        lid:String(it.lid||'')
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
// v1.3.3：详情类接口（点卡片时站点自己会取详情）—— 只抄不发
function isDetailApi(u){
  let s=String(u||'');
  if(s.charAt(0)==='/') s='https://www.zhipin.com'+s;
  if(!/zhipin\.com/i.test(s)) return false;
  return /job\/detail|job_detail|jobdetail|detail\.json/i.test(s);
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
        if(isDetailApi(u)){
          // v1.3.3：页面自己取详情时顺手抄一份（零额外请求）
          p.then(res=>{
            try{ res.clone().text().then(t=>{ if(ingestDetailText(t,'')) schedule(); },()=>{}); }catch(e){}
          },()=>{});
        }
        return p;
      };
    }
    const X=window.XMLHttpRequest;
    if(X&&X.prototype){
      const oOpen=X.prototype.open, oSend=X.prototype.send;
      X.prototype.open=function(m,u){
        try{ this.__bwfUrl=(typeof u==='string')?u:(u&&u.url)||''; }catch(e){}
        return oOpen.apply(this,arguments);
      };
      X.prototype.send=function(){
        const self=this;
        try{
          self.addEventListener('load',function(){
            try{
              const u=self.__bwfUrl||'';
              let t=null;
              if(isJobListApi(u)||isDetailApi(u)){
                if(self.responseType===''||self.responseType==='text') t=self.responseText;
                else if(self.responseType==='json'&&self.response) t=JSON.stringify(self.response);
              }
              if(!t) return;
              // v1.3.3：详情响应也顺手抄（正文 + 工作地址 + 响应里的 encryptJobId 齐全才入库）
              if(isDetailApi(u)){ if(ingestDetailText(t,'')) schedule(); }
              if(isJobListApi(u)&&ingestApi(t)) schedule();
            }catch(e){}
          });
        }catch(e){}
        return oSend.apply(this,arguments);
      };
    }
  }catch(e){}
})();
function jobIdFromHref(u){
  const m=String(u||'').match(/job[_\-]?detail\/([^.\/?#]+)/i);
  return m?m[1]:'';
}
function isCardLike(el){
  try{
    if(el.tagName!=='LI'&&!/job-card|job-item|card-wrapper|job-list-item/i.test(String(el.className||''))) return false;
    return !!el.querySelector('a[href*="job_detail"],a[href*="job-detail"]');
  }catch(e){ return false; }
}
function isTooBig(el){
  try{
    // 含 3 个以上岗位链接 = 列表容器，不是卡片
    if(el.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]').length>2) return true;
    const r=el.getBoundingClientRect();
    if(r.height>window.innerHeight*0.6) return true;      // 高过 60% 视口 = 容器
    if(r.width>window.innerWidth*0.95&&r.height>240) return true;
  }catch(e){}
  return false;
}
function findCards(){
  const out=[], seenCard=new Set();
  let links=[];
  try{ links=Array.prototype.slice.call(document.querySelectorAll('a[href*="job_detail"],a[href*="job-detail"]')); }catch(e){}
  links.forEach(a=>{
    let card=null, cur=a;
    for(let i=0;i<6&&cur;i++){
      cur=cur.parentElement;
      if(!cur||cur===document.body||cur===document.documentElement) break;
      if(isCardLike(cur)&&!isTooBig(cur)) card=cur; // 一路取最外层的「卡片级」祖先
    }
    if(!card) return;          // 认不出卡片 → 什么都不做
    if(seenCard.has(card)) return;
    seenCard.add(card);
    const href=a.getAttribute('href')||a.href||'';
    out.push({card, jobId:jobIdFromHref(href), href:String(href)});   // v1.1.0：href 供「补取详情」用
  });
  return out;
}
const MARK='data-bwf';
function hideCard(card,reason){
  card.setAttribute(MARK,'hidden');
  card.setAttribute('data-bwf-reason',reason);
  card.setAttribute('data-bwf-hide','1');   // v1.2.5 协同协议标记
  card.style.display='none';
  card.style.outline='';
}
function showCard(card,reason){
  card.setAttribute(MARK,'shown');
  card.removeAttribute('data-bwf-reason');
  card.removeAttribute('data-bwf-hide');
  // v1.2.5 协同协议：其它脚本还藏着这张卡时不恢复显示
  card.style.display=(card.hasAttribute('data-bt-focus')||card.hasAttribute('data-bc-hide')||card.hasAttribute('data-bt-hide')||card.hasAttribute('data-bi-hidden-key'))?'none':'';   // v1.2.9：补上 insight 的本地隐藏标记，否则它被静默解除且不再自愈
  card.style.outline='';
}
function revealCard(card,reason){
  card.setAttribute(MARK,'revealed');
  card.setAttribute('data-bwf-reason',reason);
  card.style.display='';
  card.style.outline='2px dashed #ef4444';
  card.style.outlineOffset='-2px';
  // v1.2.1：这个模式下命中的卡不隐藏 → 除了红虚线框，再打一个红角标，一眼能看出「是命中的」
  try{
    let tag=card.querySelector('.bwf-tag');
    if(!tag){
      if(getComputedStyle(card).position==='static') card.style.position='relative';
      tag=document.createElement('div');
      tag.className='bwf-tag';
      card.appendChild(tag);
    }
    // v1.2.9：等值判断 —— 即使字符串一模一样，赋值也会产生 childList 变更记录，进而触发自己的 observer
    const tv=String(reason||'').replace(/^规则：/,'').replace(/^黑名单·/,'').slice(0,16);
    if(tag.textContent!==tv) tag.textContent=tv;
  }catch(e){}
}
// 标记（不隐藏）：卡片右上角打个红角标，提示"外包/人力"之类
function markCard(card,reason){
  card.setAttribute(MARK,'marked');
  card.setAttribute('data-bwf-reason',reason);
  card.style.display='';
  card.style.outline='';
  try{
    let tag=card.querySelector('.bwf-tag');
    if(!tag){
      if(getComputedStyle(card).position==='static') card.style.position='relative';
      tag=document.createElement('div');
      tag.className='bwf-tag';
      card.appendChild(tag);
    }
    // v1.2.9：等值判断 —— 即使字符串一模一样，赋值也会产生 childList 变更记录，进而触发自己的 observer
    const tv=String(reason||'').replace(/^规则：/,'').replace(/^黑名单·/,'').slice(0,16);
    if(tag.textContent!==tv) tag.textContent=tv;
  }catch(e){}
}
function clearMark(card){
  try{ const t=card.querySelector('.bwf-tag'); if(t) t.remove(); }catch(e){}
}
function resetCard(card){
  card.removeAttribute(MARK);
  card.removeAttribute('data-bwf-reason');
  card.removeAttribute('data-bwf-hide');
  // v1.2.5 协同协议：其它脚本还藏着这张卡时不恢复显示
  card.style.display=(card.hasAttribute('data-bt-focus')||card.hasAttribute('data-bc-hide')||card.hasAttribute('data-bt-hide')||card.hasAttribute('data-bi-hidden-key'))?'none':'';   // v1.2.9：补上 insight 的本地隐藏标记，否则它被静默解除且不再自愈
  card.style.outline='';
}

let stat={hidden:0,total:0};
let applying=false;
// v1.2.9：自己的 DOM 写入要「静音」一段时间的 MutationObserver。
// 原来只有 applying 这一个闸，但 MutationObserver 回调是**微任务**——等它跑到时，applyFilter 的
// finally 早已把 applying 置回 false，闸门形同虚设。于是：每轮都无条件写 tag.textContent
// （即使字符串完全相同，赋值也会产生 childList 变更记录）→ 触发自己的 observer → 350ms 后再跑一轮
// → 永不停止。60 张卡的列表页 ≈ 每秒 180+ 次强制同步布局，滚动掉帧、风扇起、掉电快，tag 也被一起拖着重扫。
// 现在：凡是脚本自己写 DOM 的地方都记一个静音截止时间，observer 在窗口内一律忽略。
let muteMOUntil=0;
function muteMO(ms){ muteMOUntil=Date.now()+(ms||600); }
function applyFilter(){
  if(applying) return;
  applying=true;
  try{
    // v1.2.3 V6：临时隐藏名单里的卡片可能已随翻页离开文档，先剔掉引用（否则数组只增不减）
    for(let i=TEMP_HIDDEN.length-1;i>=0;i--){ if(!document.contains(TEMP_HIDDEN[i])) TEMP_HIDDEN.splice(i,1); }
    const cards=findCards();
    // v1.2.8 自检：页面有卡片容器但脚本识别 0 → 明示一次
    // v1.2.9：修「只置不清」—— 一次误判（页面还没渲染完）会让这条假警报长期挂在页面顶部，
    // 现在识别正常时把它清掉，不再永久占着提示条。（原来这段还整块重复了一遍）
    try{
      const siteCards=document.querySelectorAll('li.job-card-box').length;
      if(siteCards>=8&&cards.length===0){
        if(!window.__bwfSelfCheck) window.__bwfSelfCheck='自检：页面有 '+siteCards+' 个卡片容器（li.job-card-box）但脚本识别到 0 张——可能页面没渲染完或站点改版换了选择器；刷新后仍出现请截图反馈以更新选择器';
      }else if(cards.length>0){
        window.__bwfSelfCheck='';
      }
    }catch(e){}
    if(!cfg.on){
      cards.forEach(it=>resetCard(it.card));
      stat={hidden:0,total:cards.length};
      updateChip();
      return;
    }
    let hidden=0;
    const passSeen={};          // 同一页里重复出现的岗位只留第一条
    let seenDirty=false;
    const latched=!!stat.warn;   // 上一轮已触发安全阀：本轮不再重复「先隐藏再恢复」地白写 DOM
    cards.forEach(it=>{
      const card=it.card;
      // v1.2.0：右键隐藏优先（你自己点的，比任何规则都硬；reveal 模式下照旧放出来给你恢复）
      const rj=it.jobId?hideRec(it.jobId):null;
      if(rj||TEMP_HIDDEN.indexOf(card)>=0){
        hidden++;
        clearMark(card);
        const rsn=rj?('右键隐藏'+(rj.n?('：'+rj.n):'')):'右键隐藏（临时）';
        if(cfg.reveal) revealCard(card,rsn); else hideCard(card,rsn);
        return;
      }
      if(it.jobId&&passSeen[it.jobId]){
        hidden++;
        // v1.2.3 V4：「显示被过滤」模式下重复推荐也只标红框，不直接隐藏（和其他命中口径一致）
        if(cfg.reveal) revealCard(card,'重复推荐（同一页出现多次）'); else hideCard(card,'重复推荐（同一页出现多次）');
        return;
      }
      if(it.jobId) passSeen[it.jobId]=1;
      const apiInfo=it.jobId?apiJobs[it.jobId]:null;
      const ctx=buildCtx(card,apiInfo,it.jobId);
      const hit=(ctx.cardText||apiInfo)?decide(ctx):null;
      // v1.2.3 V1：「看过」时间戳必须在判定**之后**再刷 —— 原来在判定前刷新，判定读到的间隔永远≈0，
      // 「隐藏看过的岗位」从未生效过；被该规则命中的岗位也不能刷新（否则隐藏↔显示来回振荡）
      if(it.jobId&&(cfg.seenDays||0)>0&&!(hit&&hit.seenHit)){
        cfg.seen=cfg.seen||{};
        const nowS=Date.now(), prevS=cfg.seen[it.jobId]||0;
        if(nowS-prevS>60000){ cfg.seen[it.jobId]=nowS; seenDirty=true; }
      }
      if(hit&&hit.action==='标记'){
        markCard(card,hit.text);   // 内部已处理显示与角标，不要再调 showCard（会覆盖标记状态）
      }else if(hit){
        hidden++;
        if(!latched){ clearMark(card); if(cfg.reveal) revealCard(card,hit.text); else hideCard(card,hit.text); }
      }else{
        clearMark(card);
        showCard(card,'');
      }
    });
    if(seenDirty){
      const ks=Object.keys(cfg.seen||{});
      if(ks.length>5000){ ks.sort((a,b)=>(cfg.seen[a]||0)-(cfg.seen[b]||0)).slice(0,ks.length-5000).forEach(k=>{ delete cfg.seen[k]; }); }
      saveCfg();
    }
    // v1.2.1：安全阀默认关 —— 命中率过高时不再偷偷整页恢复（用户会以为「排除词失效」），
    // 只把小条标成「命中率偏高」并挂提示条；要旧行为就在面板里勾「命中过多时自动恢复」。
    const hot=!cfg.reveal&&cards.length>=8&&hidden/cards.length>0.9;
    if(hot&&cfg.safeValve){
      // v1.2.3 V5：自动恢复只放「规则命中」的卡；右键隐藏是你自己点的，比任何规则都硬，不能被安全阀放出来
      let stillHidden=0;
      cards.forEach(it=>{
        const rj=it.jobId?hideRec(it.jobId):null;
        if(rj||TEMP_HIDDEN.indexOf(it.card)>=0){ stillHidden++; return; }
        if(!latched) resetCard(it.card);
      });
      stat={hidden:stillHidden,total:cards.length,warn:true};
      updateChip();
      return;
    }
    stat={hidden,total:cards.length,hot:hot&&!cfg.safeValve};
    updateChip();
  }catch(e){}finally{ applying=false; muteMO(700); }   // v1.2.9：本轮自己写的 DOM 在 700ms 内不触发自己的 observer
}

// ---------- 页面上的小控件 ----------
let ui=null;
function ensureUi(){
  if(ui&&document.body.contains(ui.wrap)) return ui;
  const style=document.createElement('style');
  style.textContent=
    '.bwf-wrap{position:fixed;left:16px;bottom:16px;z-index:2147483000;font:13px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#1f2430;--bwf:#2f6bff;--bwf-line:#e6ebf3;--bwf-mute:#7a8396}'+
    '.bwf-chip{display:flex;align-items:center;gap:8px;background:#111827;color:#fff;border-radius:999px;padding:6px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28)}'+
    '.bwf-chip b{font-weight:600}'+
    '.bwf-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18);flex:0 0 auto}'+
    '.bwf-dot.off{background:#94a3b8;box-shadow:0 0 0 3px rgba(148,163,184,.2)}'+
    '.bwf-dot.warn{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}'+
    '.bwf-btn{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:999px;padding:3px 11px;cursor:pointer;font-size:12px;font-family:inherit}'+
    '.bwf-btn:hover{background:rgba(255,255,255,.14)}'+
    '.bwf-panel{display:none;position:absolute;left:0;bottom:46px;width:470px;max-width:calc(100vw - 32px);max-height:76vh;overflow:auto;background:#fff;color:#1f2430;border:1px solid var(--bwf-line);border-radius:16px;box-shadow:0 18px 50px rgba(20,30,60,.22)}'+
    '.bwf-head{position:sticky;top:0;z-index:3;height:44px;padding:0 14px;display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid var(--bwf-line);border-radius:16px 16px 0 0}'+
    '.bwf-head .bwf-mute{margin-left:auto;text-align:right}'+
    '.bwf-x{border:none;background:none;font-size:20px;line-height:1;cursor:pointer;color:#7a8396;padding:0 2px}'+
    '.bwf-x:hover{color:#1f2430}'+
    '.bwf-body{padding:12px 14px 14px}'+
    '.bwf-mute{color:var(--bwf-mute);font-size:12px}'+
    '.bwf-lbl{font-weight:600;color:#1f2430}'+          // v1.3.4：黑名单两栏的标题（原来地点那栏只有灰色说明，看不出是哪个框）
    '.bwf-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'+
    '.bwf-card{background:linear-gradient(180deg,#fbfcff,#f4f8ff);border:1px solid var(--bwf-line);border-radius:12px;padding:8px 10px}'+
    '.bwf-card b{display:block;font-size:19px;line-height:1.3;color:var(--bwf)}'+
    '.bwf-card span{font-size:11px;color:var(--bwf-mute)}'+
    '.bwf-row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}'+
    '.bwf-row input[type=number]{width:80px;border:1px solid #d7dce6;border-radius:8px;padding:3px 6px}'+
    '.bwf-panel textarea{width:100%;border:1px solid #d7dce6;border-radius:10px;padding:6px 8px;font:12px/1.5 monospace;outline:none;resize:vertical}'+
    '.bwf-panel textarea:focus{border-color:#9dbcff;box-shadow:0 0 0 2px rgba(47,107,255,.12)}'+
    '.bwf-save{background:#2f6bff;color:#fff;border:none;border-radius:9px;padding:6px 12px;cursor:pointer;font-family:inherit}'+
    '.bwf-save:hover{background:#1f5bef}'+
    '.bwf-ghost{background:#eef2fb;color:#2f6bff;border:none;border-radius:9px;padding:6px 12px;cursor:pointer;font-family:inherit}'+
    '.bwf-ghost:hover{background:#e2ebff}'+
    '.bwf-fold{border:1px solid var(--bwf-line);border-radius:12px;background:#fcfdff;margin:8px 0;overflow:hidden}'+
    '.bwf-fold>summary{cursor:pointer;padding:8px 12px;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;list-style:none}'+
    '.bwf-fold>summary::-webkit-details-marker{display:none}'+
    '.bwf-fold>summary::before{content:"\\25B8";color:var(--bwf-mute);font-weight:400}'+
    '.bwf-fold[open]>summary::before{content:"\\25BE"}'+
    '.bwf-fold>summary:hover{background:#f5f8ff}'+
    '.bwf-foldbody{padding:6px 12px 10px;border-top:1px solid #eef1f6}'+
    '.bwf-tabs{display:flex;gap:6px;margin:2px 0 8px}'+
    '.bwf-tab{border:1px solid var(--bwf-line);background:#fff;color:#4b5563;border-radius:999px;padding:3px 10px;cursor:pointer;font:12px/1.5 inherit;font-family:inherit}'+
    '.bwf-tab:hover{background:#f5f8ff}'+
    '.bwf-tab.on{background:#eef2fb;border-color:#c7d6ff;color:#2f6bff;font-weight:600}'+
    '.bwf-hint{color:var(--bwf-mute);font-size:12px;line-height:1.5;margin:0 0 6px}'+
    '.bwf-tag{position:absolute;top:34px;right:6px;   /* v1.2.6：右上第一排让给 tag 胶囊 */background:#ef4444;color:#fff;font-size:11px;line-height:1.5;padding:1px 6px;border-radius:6px;z-index:5;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.2)}'+
    // v1.2.0：右键菜单 + 轻提示
    '.bwf-menu{position:fixed;z-index:2147483001;min-width:208px;max-width:320px;background:#fff;border:1px solid var(--bwf-line);border-radius:12px;box-shadow:0 16px 40px rgba(20,30,60,.24);padding:6px;color:#1f2430}'+
    '.bwf-menu .bwf-mh{padding:4px 8px;color:var(--bwf-mute);font-size:12px}'+
    '.bwf-menu .bwf-mi{display:block;width:100%;text-align:left;border:none;background:transparent;color:#1f2430;padding:7px 8px;border-radius:8px;cursor:pointer;font:13px/1.5 inherit;font-family:inherit}'+
    '.bwf-menu .bwf-mi:hover{background:#f2f6ff;color:#2f6bff}'+
    '.bwf-menu .bwf-msep{height:1px;background:#eef1f6;margin:4px 6px}'+
    '.bwf-toast{display:none;position:absolute;left:0;bottom:52px;z-index:2147483002;max-width:440px;background:#111827;color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.28)}';
  const wrap=document.createElement('div');
  wrap.className='bwf-wrap';
  wrap.innerHTML='<div class="bwf-panel" id="bwfPanel"></div>'+
    '<div class="bwf-chip"><span class="bwf-dot" id="bwfDot" title="过滤中"></span><b id="bwfCount">过滤中…</b>'+
    '<button class="bwf-btn" id="bwfReveal">显示被过滤</button>'+
    '<button class="bwf-btn" id="bwfRules">规则</button>'+
    '<button class="bwf-btn" id="bwfOnOff">关闭过滤</button></div>';
  document.body.appendChild(style);
  document.body.appendChild(wrap);
  ui={wrap, count:wrap.querySelector('#bwfCount'), panel:wrap.querySelector('#bwfPanel')};
  wrap.querySelector('#bwfReveal').addEventListener('click',()=>{
    cfg.reveal=!cfg.reveal; saveCfg(); applyFilter();
    ui.wrap.querySelector('#bwfReveal').textContent=cfg.reveal?'隐藏被过滤':'显示被过滤';
  });
  wrap.querySelector('#bwfOnOff').addEventListener('click',()=>{
    cfg.on=!cfg.on; saveCfg(); applyFilter(); renderPanel();
    ui.wrap.querySelector('#bwfOnOff').textContent=cfg.on?'关闭过滤':'开启过滤';
  });
  wrap.querySelector('#bwfRules').addEventListener('click',()=>{
    const open=ui.panel.style.display==='block';
    ui.panel.style.display=open?'none':'block';
    if(!open){
      try{ const bp=document.getElementById('bdPanel'); if(bp&&bp.style.display==='block') bp.style.display='none'; }catch(e){}
      renderPanel();
    }
  });
  wrap.querySelector('#bwfReveal').textContent=cfg.reveal?'隐藏被过滤':'显示被过滤';
  wrap.querySelector('#bwfOnOff').textContent=cfg.on?'关闭过滤':'开启过滤';
  return ui;
}
function updateChip(){
  const u=ensureUi();
  if(!u) return;
  const did=detailJobId();
  // 详情页：小条改成显示「这页命中没命中」，比「已过滤 0/0」有用
  if(did){
    u.count.textContent=capHit?('此岗位命中 '+capHit):('详情页 · 正文'+(hasJd(did)?'已取 ✓':'没取到')+'（列表页按「详情排除词」判）');
  }else{
    u.count.textContent=stat.warn?('⚠ 命中过多已自动恢复（共 '+stat.total+' 条）'):
      (cfg.on?(stat.hot?('已过滤 '+stat.hidden+' / '+stat.total+' · 命中率偏高'):('已过滤 '+stat.hidden+' / '+stat.total)):('过滤已关闭（共 '+stat.total+' 条）'));
  }
  const dot=u.wrap.querySelector('#bwfDot');
  if(dot){
    if(did&&capHit){ dot.className='bwf-dot warn'; dot.title='此岗位命中排除词'; }
    else{
      dot.className='bwf-dot'+(cfg.on?((stat.warn||stat.hot)?' warn':''):' off');
      dot.title=cfg.on?(stat.warn?'命中过多，已自动恢复显示':(stat.hot?'命中率偏高（不会自动恢复）':'过滤中')):'过滤已关闭';
    }
  }
  // v1.2.1：面板上的「已隐藏 / 共 N」跟着每轮过滤实时更新（以前只在打开面板那一刻算一次）
  // v1.2.9：等值判断 + 静音 —— 这段每轮都跑，无条件赋值同样会产生 DOM 变更记录
  try{
    const h=document.getElementById('bwfStatHidden'), t=document.getElementById('bwfStatTotal');
    if(h&&h.textContent!==String(stat.hidden||0)) h.textContent=String(stat.hidden||0);
    if(t&&t.textContent!=='已隐藏 / 共 '+(stat.total||0)) t.textContent='已隐藏 / 共 '+(stat.total||0);
    muteMO(600);
  }catch(e){}
  syncBanner();
}
// v1.2.1：两条常驻提示条 —— ① 「显示被过滤」模式（命中的不隐藏，只标出来）；② 命中率偏高
let bannerEl=null, bannerKey='';
function syncBanner(){
  try{
    const msgs=[];
    if(window.__bwfSelfCheck) msgs.push(window.__bwfSelfCheck);   // v1.2.9：原来这行写了两遍，同一句话在提示条上显示两遍
    if(cfg.on&&cfg.reveal) msgs.push('当前是「显示被过滤」模式：命中的岗位不会隐藏，只标红框 + 角标（点小条上的「隐藏被过滤」切回隐藏）');
    if(cfg.on&&stat.hot) msgs.push('本页 '+stat.hidden+'/'+stat.total+' 命中排除词（比例偏高，脚本不会自动恢复显示；确认词表没问题就行）');
    const key=msgs.join('|');
    if(!key){ if(bannerEl&&bannerEl.parentNode){ bannerEl.parentNode.removeChild(bannerEl); } bannerEl=null; bannerKey=''; return; }
    if(key===bannerKey&&bannerEl&&bannerEl.parentNode) return;
    bannerKey=key;
    if(!bannerEl){
      bannerEl=document.createElement('div');
      bannerEl.id='bwfBanner';
      bannerEl.style.cssText='position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483001;max-width:76vw;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:6px 12px;font:12px/1.6 "Microsoft YaHei",system-ui,sans-serif;box-shadow:0 6px 18px rgba(20,30,60,.12)';
      document.body.appendChild(bannerEl);
    }
    bannerEl.textContent=msgs.join(' ｜ '); muteMO(600);
  }catch(e){}
}
// v1.1.0：面板重绘不吃掉你正在看 / 正在填的东西（折叠区展开状态、滚动位置、输入框里的值、焦点）
function panelSnapshot(p){
  const snap={folds:[], vals:{}, scroll:0, focus:'', sel:null};
  try{
    const folds=p.querySelectorAll('details.bwf-fold');
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
    const folds=p.querySelectorAll('details.bwf-fold');
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
function renderPanel(){
  const u=ensureUi();
  if(!u) return;
  const p=u.panel;
  const keep=panelSnapshot(p);   // v1.1.0：重绘前记住「折叠区展开状态 / 滚动 / 输入框里的值」，重绘后放回
  p.innerHTML=
    '<div class="bwf-head"><span class="bwf-dot'+(cfg.on?(stat.warn?' warn':''):' off')+'"></span><b>过滤规则</b>'+
    '<span class="bwf-mute">v'+VERSION+' · 默认不发请求（补取详情除外）· 只存本机</span>'+
    '<button class="bwf-x" id="bwfX" title="收起">×</button></div>'+
    '<div class="bwf-body">'+
    '<div class="bwf-cards">'+
    '<div class="bwf-card"><b id="bwfStatHidden">'+stat.hidden+'</b><span id="bwfStatTotal">已隐藏 / 共 '+stat.total+'</span></div>'+
    '<div class="bwf-card" title="绝对 '+cfg.words.length+' · 卡片 '+cfg.wordsCard.length+' · 详情 '+cfg.wordsJd.length+'"><b>'+((cfg.words||[]).length+(cfg.wordsCard||[]).length+(cfg.wordsJd||[]).length)+'</b><span>排除词</span></div>'+
    '<div class="bwf-card"><b>'+((cfg.rules||[]).length)+'</b><span>表格规则</span></div>'+
    '<div class="bwf-card"><b>'+(((cfg.blackCompanies||[]).length)+((cfg.blackAreas||[]).length))+'</b><span>黑名单 公司+地点</span></div></div>'+
    '<details class="bwf-fold" open><summary>基础开关与薪资<span class="bwf-mute">'+(cfg.on?'过滤中':'已关闭')+'</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-row"><label><input type="checkbox" id="bwfOn" '+(cfg.on?'checked':'')+'> 启用过滤</label>'+
    '<label><input type="checkbox" id="bwfSal" '+(cfg.hideSalaryOut?'checked':'')+'> 按薪资范围过滤</label>'+
    '<label><input type="checkbox" id="bwfNeg" '+(cfg.hideNegotiable?'checked':'')+'> 隐藏面议</label>'+
    '<label title="默认关：命中率再高也不会自动恢复显示（旧版会整页恢复，看起来像「排除词失效」）"><input type="checkbox" id="bwfValve" '+(cfg.safeValve?'checked':'')+'> 命中过多时自动恢复</label></div>'+
    '<div class="bwf-row">月薪下限 <input type="number" id="bwfMinM" value="'+cfg.minMonthly+'">'+
    '上限 <input type="number" id="bwfMaxM" value="'+cfg.maxMonthly+'">'+
    '日薪下限 <input type="number" id="bwfMinD" value="'+cfg.minDaily+'"></div>'+
    '</div></details>'+
    '<details class="bwf-fold" open><summary>排除词<span class="bwf-mute">绝对 '+cfg.words.length+' · 卡片 '+cfg.wordsCard.length+' · 详情 '+cfg.wordsJd.length+' · 每行一个</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-tabs">'+
    '<button class="bwf-tab" data-tab="abs" title="绝对排除词：命中卡片字段或详情正文任一处就隐藏">绝对 '+cfg.words.length+'</button>'+
    '<button class="bwf-tab" data-tab="card" title="相对·卡片排除词：只看列表卡片上能看到的字段">卡片 '+cfg.wordsCard.length+'</button>'+
    '<button class="bwf-tab" data-tab="jd" title="相对·详情排除词：只看岗位详情正文（要先取到详情）">详情 '+cfg.wordsJd.length+'</button>'+
    '</div>'+
    '<div class="bwf-pane" data-pane="abs"><div class="bwf-hint">命中即隐藏：岗位名 / 公司 / 标签 / 卡片全文 + 详情正文（详情要取到才算）</div>'+
    '<textarea id="bwfWords" style="height:132px">'+escHtml(cfg.words.join('\n'))+'</textarea></div>'+
    '<div class="bwf-pane" data-pane="card" hidden><div class="bwf-hint">只看列表卡片上能看到的字段（岗位名 / 公司 / 标签 / 薪资 / 地点 / 卡片全文）；详情正文里出现不算</div>'+
    '<textarea id="bwfWordsCard" style="height:132px">'+escHtml((cfg.wordsCard||[]).join('\n'))+'</textarea></div>'+
    '<div class="bwf-pane" data-pane="jd" hidden><div class="bwf-hint">只按「详细页面」正文（职位描述 / 任职要求 / 工作地址）判断 —— 取不到就不判。取正文有两条**零请求**路：① 在列表页点一下卡片，右侧本来就会渲染这个岗位的详情，脚本顺手缓存；② 你在详情页浏览时自动缓存。（补取按钮是给「懒得点开」兜底的，整页拉取容易被站点限流）</div>'+
    '<textarea id="bwfWordsJd" style="height:132px">'+escHtml((cfg.wordsJd||[]).join('\n'))+'</textarea>'+
    '<div class="bwf-row"><label><input type="checkbox" id="bwfJdFetch" '+(cfg.jdFetch?'checked':'')+'> 允许补取详情</label>'+
    '<button class="bwf-ghost" id="bwfJdGo">补取本页详情</button>'+
    '<button class="bwf-ghost" id="bwfJdClear">清空已取详情</button></div>'+
    '<div class="bwf-row bwf-mute" id="bwfJdStat"></div>'+
    '</div>'+
    '<div class="bwf-row"><button class="bwf-save" id="bwfSave">保存</button>'+
    '<button class="bwf-ghost" id="bwfReset">恢复默认</button>'+
    '<span class="bwf-mute">改完自动保存（800ms），也可以点「保存」立即生效</span>'+
    '<span class="bwf-mute" id="bwfDirty"></span></div>'+
    '</div></details>'+
    '<details class="bwf-fold" open><summary>黑名单<span class="bwf-mute">绝对项：命中就隐藏 · 公司 '+((cfg.blackCompanies||[]).length)+' 条 / 地点 '+((cfg.blackAreas||[]).length)+' 条</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-row"><span class="bwf-lbl">公司黑名单</span><span class="bwf-mute">每行一个公司名，可只写关键词 · 当前 '+((cfg.blackCompanies||[]).length)+' 条</span></div>'+
    '<textarea id="bwfBlackC" style="height:56px" placeholder="智玩店科技&#10;贝壳找房&#10;跨越速运集团有限公司">'+escHtml((cfg.blackCompanies||[]).join('\n'))+'</textarea>'+
    '<div class="bwf-row" style="margin-top:10px"><span class="bwf-lbl">地点黑名单</span><span class="bwf-mute">每行一个地点或详细地址 · 当前 '+((cfg.blackAreas||[]).length)+' 条</span></div>'+
    '<textarea id="bwfBlackA" style="height:56px" placeholder="龙华&#10;坂田&#10;深圳龙岗区 荣丰中心A栋">'+escHtml((cfg.blackAreas||[]).join('\n'))+'</textarea>'+
    '<div class="bwf-row bwf-mute" style="font-size:11px">两栏都是「命中就隐藏」的绝对项。写关键词（龙华 / 坂田 / 荣丰中心）或直接粘详细地址（深圳龙岗区银信中心B座）都行 —— 空格、·、/ 这类分隔符不影响匹配。地点判定三处并列：① 页面内详情面板 / 详情接口拿到的「工作地址」；② 监控脚本镜像的地址；③ 卡片上的地点文字（如「深圳·龙岗区·坂田」）。任一处命中即隐藏，原因里写明是哪一路；三处都没有就不判（不误杀）。公司名依次取「页面组件状态 → 接口 → DOM」（v1.2.2 修），都取不到时退回整张卡片文字匹配。</div>'+
    '<div class="bwf-row"><button class="bwf-save" id="bwfBlackSave">保存黑名单</button></div>'+
    '</div></details>'+
    '<details class="bwf-fold"><summary>右键隐藏<span class="bwf-mute">'+Object.keys(cfg.hideIds||{}).length+' 条 · 在卡片上点右键即可隐藏 / 恢复</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-row bwf-mute">右键卡片：隐藏这条岗位 / 把选中的词加进排除词 / 公司进黑名单。隐藏按职位ID记在本机，刷新、换页都还在。</div>'+
    '<div id="bwfHideList" style="font-size:12px;color:#4b5563;max-height:130px;overflow:auto"></div>'+
    '<div class="bwf-row"><button class="bwf-ghost" id="bwfHideClear">清空全部</button>'+
    '<span class="bwf-mute">单条点「恢复」即可</span></div>'+
    '</div></details>'+
    '<details class="bwf-fold"><summary>已投递名单<span class="bwf-mute">已投 '+((cfg.applied||[]).length)+' 条 · 看过 '+Object.keys(cfg.seen||{}).length+' 个</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-row bwf-mute">一行一个：公司名 / 岗位名 / 职位ID（表格导入时用 类型=已投）</div>'+
    '<textarea id="bwfApplied" style="height:56px">'+escHtml((cfg.applied||[]).join('\n'))+'</textarea>'+
    '<div class="bwf-row"><button class="bwf-save" id="bwfAppliedSave">保存已投名单</button>'+
    '<label class="bwf-mute">隐藏看过的岗位 <input type="number" id="bwfSeenDays" value="'+(cfg.seenDays||0)+'" style="width:60px"> 天内（0=关）</label></div>'+
    '</div></details>'+
    '<details class="bwf-fold" open><summary>表格规则<span class="bwf-mute">'+((cfg.rules||[]).length)+' 条 · 一行一条，可导入 / 导出</span></summary><div class="bwf-foldbody">'+
    '<div class="bwf-row"><button class="bwf-ghost" id="bwfTplX">下载模板(.xlsx)</button>'+
    '<button class="bwf-ghost" id="bwfTpl">下载模板(.csv)</button>'+
    '<button class="bwf-ghost" id="bwfTplCopy">复制模板</button>'+
    '<button class="bwf-ghost" id="bwfPick">导入表格文件</button>'+
    '<button class="bwf-ghost" id="bwfExport">导出规则</button>'+
    '<button class="bwf-ghost" id="bwfClearRules">清空表格规则</button>'+
    '<input type="file" id="bwfFile" accept=".csv,.tsv,.txt" style="display:none"></div>'+
    '<div class="bwf-row bwf-mute">列：'+TABLE_HEAD.join(' / ')+
    '（字段可选：'+TABLE_FIELDS.join('、')+'；匹配可选：'+TABLE_OPS.join('、')+'）</div>'+
    '<textarea id="bwfPaste" style="height:70px" placeholder="也可以从 Excel 直接复制整块表格，粘贴到这里再点「粘贴导入」"></textarea>'+
    '<div class="bwf-row"><button class="bwf-save" id="bwfPasteGo">粘贴导入</button>'+
    '<span class="bwf-mute">当前表格规则：<b id="bwfRuleCount">'+((cfg.rules||[]).length)+'</b> 条</span></div>'+
    '<div id="bwfRuleList" style="font-size:12px;color:#4b5563;max-height:120px;overflow:auto"></div>'+
    '</div></details></div>';
  const rl=p.querySelector('#bwfRuleList');
  if(rl){
    rl.innerHTML=(cfg.rules||[]).slice(0,30).map((r,i)=>'<div>'+(i+1)+'. '+(r.enabled===false?'(停用) ':'')+
      escHtml(r.field||'全部')+' '+escHtml(r.op||'包含')+' 「'+escHtml(r.value||'')+'」'+(r.note?(' — '+escHtml(r.note)):'')+'</div>').join('')
      ||'<div style="color:#9aa3b2">（还没有表格规则）</div>';
  }
  const afterImport=(n)=>{
    if(n){ saveCfg(); applyFilter();
      const setIV=(s,v)=>{ const el=p.querySelector(s); if(el&&document.activeElement!==el) el.value=v; };
      setIV('#bwfBlackC',(cfg.blackCompanies||[]).join('\n')); setIV('#bwfBlackA',(cfg.blackAreas||[]).join('\n')); setIV('#bwfApplied',(cfg.applied||[]).join('\n'));
      renderPanel(); }
    else alert('没有读到有效行：请确认第一行是表头（'+TABLE_HEAD.join(',')+'），每行至少要有「值」');
  };
  const xb=p.querySelector('#bwfX');
  if(xb) xb.addEventListener('click',()=>{ p.style.display='none'; });
  // v1.1.0：排除词三个页签（同一时间只显示一个输入框，视觉上还是原来一个框）
  const tabs=p.querySelectorAll('.bwf-tab'), panes=p.querySelectorAll('.bwf-pane');
  const showTab=(id)=>{
    cfg.tab=id;
    Array.prototype.forEach.call(tabs,b=>{ b.classList.toggle('on',b.getAttribute('data-tab')===id); });
    Array.prototype.forEach.call(panes,el=>{ el.hidden=el.getAttribute('data-pane')!==id; });
    if(id==='jd') renderJdStat();
  };
  Array.prototype.forEach.call(tabs,b=>b.addEventListener('click',()=>showTab(b.getAttribute('data-tab'))));
  showTab(cfg.tab||'abs');
  // v1.2.1：三个排除词输入框改完 800ms 自动保存（不用记得点「保存」；条数按清洗后的算）
  ['bwfWords','bwfWordsCard','bwfWordsJd'].forEach(id=>{
    const ta=p.querySelector('#'+id);
    if(ta) ta.addEventListener('input',()=>scheduleWordSave());
  });
  const valve=p.querySelector('#bwfValve');
  if(valve) valve.addEventListener('change',()=>{ cfg.safeValve=!!valve.checked; saveCfg(); applyFilter(); });
  const jdGo=p.querySelector('#bwfJdGo');
  if(jdGo) jdGo.addEventListener('click',()=>{ fetchPageDetails(); });
  const jdCk=p.querySelector('#bwfJdFetch');
  if(jdCk) jdCk.addEventListener('change',()=>{
    cfg.jdFetch=!!jdCk.checked; saveCfg();
    jdLastMsg=cfg.jdFetch?'已允许补取（点「补取本页详情」才开始）':'已关闭补取';
    renderJdStat();
  });
  const jdCl=p.querySelector('#bwfJdClear');
  if(jdCl) jdCl.addEventListener('click',()=>{
    if(!confirm('清空本机缓存的详情正文？（排除词不受影响）')) return;
    clearJdCache(); jdLastMsg='已清空'; renderJdStat(); applyFilter();
  });
  p.querySelector('#bwfTpl').addEventListener('click',()=>{
    downloadTemplate();
    const b=p.querySelector('#bwfTpl');
    b.textContent='已生成 ✓ 看浏览器下载';
    setTimeout(()=>{ b.textContent='下载模板'; },2500);
  });
  p.querySelector('#bwfTplX').addEventListener('click',()=>{
    downloadTemplateXlsx();
    const b=p.querySelector('#bwfTplX');
    b.textContent='已生成 ✓ 看浏览器下载';
    setTimeout(()=>{ b.textContent='下载模板(.xlsx)'; },2500);
  });
  p.querySelector('#bwfTplCopy').addEventListener('click',()=>{
    const ok=copyText(templateText());
    const b=p.querySelector('#bwfTplCopy');
    b.textContent=ok?'已复制 ✓ 去 Excel 粘贴':'复制失败，请手动选';
    setTimeout(()=>{ b.textContent='复制模板'; },2500);
  });
  p.querySelector('#bwfBlackSave').addEventListener('click',()=>{
    const split=(v)=>String(v||'').split(/\r?\n|,|，/).map(s=>s.trim()).filter(Boolean);
    replaceList('blackCompanies',split(p.querySelector('#bwfBlackC').value));
    replaceList('blackAreas',split(p.querySelector('#bwfBlackA').value));
    saveCfg(); applyFilter(); renderPanel();
  });
  p.querySelector('#bwfAppliedSave').addEventListener('click',()=>{
    const split=(v)=>String(v||'').split(/\r?\n|,|，/).map(s=>s.trim()).filter(Boolean);
    replaceList('applied',split(p.querySelector('#bwfApplied').value));
    cfg.seenDays=Math.max(0,parseInt(p.querySelector('#bwfSeenDays').value,10)||0);
    saveCfg(); applyFilter(); renderPanel();
  });
  // v1.2.0：右键隐藏名单（单条恢复 / 清空全部）
  const hl=p.querySelector('#bwfHideList');
  if(hl){
    const ids=Object.keys(cfg.hideIds||{}).sort((a,b)=>((cfg.hideIds[b]||{}).t||0)-((cfg.hideIds[a]||{}).t||0));
    hl.innerHTML=ids.length?ids.slice(0,50).map(id=>{
      const m=cfg.hideIds[id]||{};
      return '<div class="bwf-row" style="margin:2px 0"><span style="flex:1">'+escHtml(m.n||id)+(m.c?(' · '+escHtml(m.c)):'')+'</span>'+
        '<button class="bwf-ghost" data-hide="'+escHtml(id)+'" style="padding:2px 8px">恢复</button></div>';
    }).join(''):'<div style="color:#9aa3b2">（还没有右键隐藏的岗位）</div>';
    hl.addEventListener('click',(ev)=>{
      const b=ev.target&&ev.target.closest?ev.target.closest('[data-hide]'):null;
      if(!b) return;
      unhideJob(b.getAttribute('data-hide'));
    });
  }
  const hc=p.querySelector('#bwfHideClear');
  if(hc) hc.addEventListener('click',()=>{
    if(!Object.keys(cfg.hideIds||{}).length) return;
    if(!confirm('清空全部「右键隐藏」的岗位？（清空后它们会重新出现在列表里）')) return;
    mapClear('hideIds'); saveCfg(); applyFilter(); renderPanel();
  });
  p.querySelector('#bwfExport').addEventListener('click',exportRules);
  p.querySelector('#bwfClearRules').addEventListener('click',()=>{
    if(!confirm('清空所有表格规则？（排除词和薪资范围不受影响）')) return;
    replaceList('rules',[]); saveCfg(); applyFilter(); renderPanel();
  });
  p.querySelector('#bwfPick').addEventListener('click',()=>p.querySelector('#bwfFile').click());
  p.querySelector('#bwfFile').addEventListener('change',(ev)=>{
    const f=ev.target.files&&ev.target.files[0];
    if(!f) return;
    const fr=new FileReader();
    fr.onload=()=>afterImport(importRows(parseTable(String(fr.result||''))));
    fr.onerror=()=>alert('文件读取失败');
    fr.readAsText(f,'utf-8');
  });
  p.querySelector('#bwfPasteGo').addEventListener('click',()=>{
    afterImport(importRows(parseTable(p.querySelector('#bwfPaste').value)));
  });
  p.querySelector('#bwfSave').addEventListener('click',()=>{
    cfg.on=p.querySelector('#bwfOn').checked;
    cfg.hideSalaryOut=p.querySelector('#bwfSal').checked;
    cfg.hideNegotiable=p.querySelector('#bwfNeg').checked;
    const valveEl=p.querySelector('#bwfValve'); if(valveEl) cfg.safeValve=!!valveEl.checked;
    cfg.minMonthly=Number(p.querySelector('#bwfMinM').value)||0;
    cfg.maxMonthly=Number(p.querySelector('#bwfMaxM').value)||999999;
    cfg.minDaily=Number(p.querySelector('#bwfMinD').value)||0;
    cfg.words=cleanWords((p.querySelector('#bwfWords')||{}).value);
    cfg.wordsCard=cleanWords((p.querySelector('#bwfWordsCard')||{}).value);
    cfg.wordsJd=cleanWords((p.querySelector('#bwfWordsJd')||{}).value);
    saveCfg(); applyFilter();
    wordDirty=false;
    u.wrap.querySelector('#bwfOnOff').textContent=cfg.on?'关闭过滤':'开启过滤';
    renderPanel();
    const sb=p.querySelector('#bwfSave'); if(sb) sb.textContent='已保存 ✓';
    setTimeout(()=>{ const b=p.querySelector('#bwfSave'); if(b) b.textContent='保存'; },1200);
  });
  p.querySelector('#bwfReset').addEventListener('click',()=>{
    // v1.2.3 V3：改用深拷贝的 freshDefaults() —— 原来的浅拷贝会让 cfg 的数组和 DEFAULTS 常量共享引用，
    // 导入过的规则/黑名单会"写进默认值"，导致第二次恢复默认恢复不干净
    // v1.2.9：保留今日补取额度与「看过」记录 —— 原来「恢复默认」把它们一起清零，
    // 等于把当日实际可发出的请求翻倍，seen 记录也会全丢。
    const keepJdUsed=cfg.jdUsed, keepSeen=cfg.seen;
    cfg=Object.assign(freshDefaults(),{reveal:cfg.reveal,tab:cfg.tab,hideIds:cfg.hideIds||{},jdUsed:keepJdUsed,seen:keepSeen});
    saveCfg();
    // v1.1.0：恢复默认前先清空输入框（否则会被「保留未保存输入」的逻辑再放回来）
    ['#bwfWords','#bwfWordsCard','#bwfWordsJd','#bwfBlackC','#bwfBlackA','#bwfApplied'].forEach(s=>{
      const el=p.querySelector(s); if(el) el.value='';
    });
    const setN=(s,v)=>{ const el=p.querySelector(s); if(el) el.value=v; };
    setN('#bwfMinM',cfg.minMonthly); setN('#bwfMaxM',cfg.maxMonthly); setN('#bwfMinD',cfg.minDaily); setN('#bwfSeenDays',cfg.seenDays||0);
    applyFilter(); renderPanel();
    u.wrap.querySelector('#bwfOnOff').textContent=cfg.on?'关闭过滤':'开启过滤';
  });
  panelRestore(p,keep);   // v1.1.0：把展开状态 / 滚动 / 未保存的输入放回去
}

// ---------- v1.2.0：右键快速处理（隐藏这条 / 把词加进排除词 / 公司进黑名单）----------
const TEMP_HIDDEN=[];                     // 没识别到职位ID 的卡片：只在本页临时隐藏
let lastHide=null, menuEl=null, toastEl=null, toastT=null;
function cardOf(el){
  let cur=el, card=null;
  for(let i=0;i<8&&cur&&cur!==document.body&&cur!==document.documentElement;i++){
    if(isCardLike(cur)&&!isTooBig(cur)) card=cur;   // 与 findCards 同一套「卡片」判断
    cur=cur.parentElement;
  }
  return card;
}
function cardJobId(card){
  try{
    const a=card.querySelector('a[href*="job_detail"],a[href*="job-detail"]');
    return a?jobIdFromHref(a.getAttribute('href')||a.href||''):'';
  }catch(e){ return ''; }
}
function hideRec(jobId){ const m=(cfg.hideIds||{})[jobId]; return (m&&typeof m==='object')?m:null; }
function offNote(){ return cfg.on?'':'（过滤已关闭，开启后生效）'; }
function hideThis(card){
  const jobId=cardJobId(card);
  const ctx=buildCtx(card,null,jobId);
  if(!jobId){
    if(TEMP_HIDDEN.indexOf(card)<0) TEMP_HIDDEN.push(card);
    applyFilter();
    toast('已临时隐藏（这条没识别到职位ID，刷新后会回来）');
    return;
  }
  cfg.hideIds=cfg.hideIds||{};
  cfg.hideIds[jobId]={t:Date.now(),n:String(ctx.name||'').slice(0,60),c:String(ctx.company||'').slice(0,60)};
  saveCfg(); lastHide={jobId:jobId,n:String(ctx.name||'')};
  applyFilter();
  if(ui&&ui.panel&&ui.panel.style.display==='block') renderPanel();
  toast('已隐藏：'+(ctx.name||'这条岗位')+'（右键可恢复）'+offNote());
}
function unhideJob(jobId){
  if(!jobId||!cfg.hideIds||!cfg.hideIds[jobId]) return;
  const n=String((cfg.hideIds[jobId]||{}).n||'');
  mapDelete('hideIds',jobId);
  saveCfg(); applyFilter();
  if(ui&&ui.panel&&ui.panel.style.display==='block') renderPanel();
  toast('已恢复：'+(n||jobId));
}
function addWord(list,word){
  const w=String(word||'').trim();
  if(!w) return;
  // v1.2.9：先取消排队中的 800ms 自动保存，并把输入框里「还没到 800ms 的字」先并进 cfg ——
  // 否则那个定时器稍后会把输入框的旧内容整段写回 cfg，把你刚加的词静默冲掉（toast 还显示「已加入」）。
  if(wordSaveTimer){ clearTimeout(wordSaveTimer); wordSaveTimer=null; commitWordInputs(); }
  if(!Array.isArray(cfg[list])) cfg[list]=[];
  if(cfg[list].indexOf(w)<0) cfg[list].push(w);
  saveCfg(); applyFilter();
  const taW=ui&&ui.panel?ui.panel.querySelector(list==='words'?'#bwfWords':(list==='wordsCard'?'#bwfWordsCard':'#bwfWordsJd')):null;
  // 输入框正在编辑时也要把新词接上去（原来只在「没聚焦」时才回写，聚焦状态下你会以为加成功了其实没进框）
  if(taW) taW.value=(cfg[list]||[]).join('\n');
  if(ui&&ui.panel&&ui.panel.style.display==='block') renderPanel();
  toast('已加入「'+(list==='words'?'绝对':(list==='wordsCard'?'卡片':'详情'))+'排除词」：'+w+offNote());
}
function addBlackCompany(name){
  const c=String(name||'').trim();
  if(!c) return;
  if(!Array.isArray(cfg.blackCompanies)) cfg.blackCompanies=[];
  if(cfg.blackCompanies.indexOf(c)<0) cfg.blackCompanies.push(c);
  saveCfg(); applyFilter();
  const taB=ui&&ui.panel?ui.panel.querySelector('#bwfBlackC'):null;
  // v1.2.9：同 addWord —— 输入框正在编辑时也要回写，否则你会以为加进去了其实没进框
  if(taB) taB.value=(cfg.blackCompanies||[]).join('\n');
  if(ui&&ui.panel&&ui.panel.style.display==='block') renderPanel();
  toast('已加入公司黑名单：'+c+offNote());
}
function selText(scopeEl){
  try{
    const s=window.getSelection();
    if(!s||!s.rangeCount||s.isCollapsed) return '';
    const t=String(s.toString()||'').replace(/\s+/g,' ').trim();
    if(!t||t.length>30) return '';
    if(scopeEl){
      const node=s.anchorNode;
      const host=node&&node.nodeType===1?node:(node&&node.parentNode);
      if(!host||!scopeEl.contains(host)) return '';
    }
    return t;
  }catch(e){ return ''; }
}
function closeMenu(){ try{ if(menuEl&&menuEl.parentNode) menuEl.parentNode.removeChild(menuEl); }catch(e){} menuEl=null; }
function openMenu(x,y,items){
  closeMenu();
  const m=document.createElement('div');
  m.className='bwf-menu'; m.id='bwfMenu';
  m.innerHTML=items.map((it,i)=>it.sep?'<div class="bwf-msep"></div>':
    it.head?('<div class="bwf-mh">'+escHtml(it.head)+'</div>'):
    ('<button class="bwf-mi" data-mi="'+i+'">'+escHtml(it.label)+'</button>')).join('');
  document.body.appendChild(m);
  const r=m.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(x,window.innerWidth-r.width-8))+'px';
  m.style.top=Math.max(8,Math.min(y,window.innerHeight-r.height-8))+'px';
  m.addEventListener('click',(ev)=>{
    const b=ev.target&&ev.target.closest?ev.target.closest('.bwf-mi'):null;
    if(!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const it=items[Number(b.getAttribute('data-mi'))];
    closeMenu();
    try{ if(it&&it.fn) it.fn(); }catch(e){}
  },true);
  menuEl=m;
}
function toast(msg,ms){
  try{
    const u=ensureUi();
    if(!u) return;
    if(!toastEl||!u.wrap.contains(toastEl)){ toastEl=document.createElement('div'); toastEl.className='bwf-toast'; u.wrap.appendChild(toastEl); }
    toastEl.textContent=String(msg||'');
    toastEl.style.display='block';
    if(toastT) clearTimeout(toastT);
    toastT=setTimeout(()=>{ try{ toastEl.style.display='none'; }catch(e){} },Math.max(1200,Number(ms)||2600));
  }catch(e){}
}
function hideByIdFromDetail(jobId,name){
  if(!jobId) return;
  cfg.hideIds=cfg.hideIds||{};
  cfg.hideIds[jobId]={t:Date.now(),n:String(name||'').slice(0,60),c:''};
  saveCfg(); lastHide={jobId:jobId,n:String(name||'')};
  toast('已隐藏：'+(name||jobId)+'（列表里不再出现）'+offNote());
}
document.addEventListener('contextmenu',(ev)=>{
  try{
    const wasMenu=menuEl;
    closeMenu();
    if(wasMenu&&wasMenu.contains&&wasMenu.contains(ev.target)){ ev.preventDefault(); return; }   // 右键自己的菜单：不弹浏览器菜单
    const card=cardOf(ev.target);
    const onDetail=/job[_\-]?detail\//i.test(String(location.pathname||''));
    if(!card){
      if(!onDetail) return;                       // 列表页非卡片区域：保持浏览器默认右键
      const s=selText(null);
      if(!s) return;                              // 详情页没选词：不打扰
      ev.preventDefault(); ev.stopPropagation();
      const jobId=detailJobId();
      const title=String(document.title||'').split(/[|_]/)[0].replace(/[「」]/g,'').slice(0,40);
      const items=[{head:'把选中的「'+s.slice(0,14)+'」加进…'}];
      items.push({label:'详情排除词（只看 JD 正文）',fn:()=>addWord('wordsJd',s)});
      items.push({label:'绝对排除词（卡片或详情都算）',fn:()=>addWord('words',s)});
      if(jobId) items.push({sep:true},{label:'隐藏这条岗位（列表里不再出现）',fn:()=>hideByIdFromDetail(jobId,title)});
      openMenu(ev.clientX||0,ev.clientY||0,items);
      return;
    }
    ev.preventDefault(); ev.stopPropagation();
    const jobId=cardJobId(card);
    const ctx=buildCtx(card,null,jobId);
    const sel=selText(card);
    const rec=jobId?hideRec(jobId):null;
    const items=[];
    if(rec) items.push({label:'恢复显示（取消右键隐藏）',fn:()=>unhideJob(jobId)});
    else items.push({label:'隐藏这条岗位'+(jobId?'':'（临时，刷新会回来）'),fn:()=>hideThis(card)});
    if(sel){
      items.push({sep:true},{head:'把选中的「'+sel.slice(0,14)+'」加进…'});
      items.push({label:'卡片排除词（只看列表卡片）',fn:()=>addWord('wordsCard',sel)});
      items.push({label:'绝对排除词（卡片或详情都算）',fn:()=>addWord('words',sel)});
      items.push({label:'公司黑名单（这家公司的岗位全隐藏）',fn:()=>addBlackCompany(sel)});   // v1.2.2
    }else if(ctx.name){
      items.push({sep:true},{label:'把岗位名「'+ctx.name.slice(0,14)+'」加进卡片排除词',fn:()=>addWord('wordsCard',ctx.name)});
    }
    if(ctx.company) items.push({sep:true},{label:'把公司「'+ctx.company.slice(0,14)+'」加进黑名单',fn:()=>addBlackCompany(ctx.company)});
    else items.push({sep:true},{label:'公司名没认出来 → 在卡片上选中公司名再右键',fn:()=>{}});
    if(lastHide&&lastHide.jobId&&hideRec(lastHide.jobId)) items.push({sep:true},{label:'撤销刚才的隐藏（'+String(lastHide.n||'').slice(0,12)+'）',fn:()=>unhideJob(lastHide.jobId)});
    openMenu(ev.clientX||0,ev.clientY||0,items);
  }catch(e){}
},true);
document.addEventListener('mousedown',(ev)=>{ if(menuEl&&!(menuEl===ev.target||(menuEl.contains&&menuEl.contains(ev.target)))) closeMenu(); },true);
document.addEventListener('keydown',(ev)=>{ if(ev.key==='Escape') closeMenu(); },true);
window.addEventListener('scroll',()=>closeMenu(),{passive:true});
window.addEventListener('resize',()=>closeMenu());

// ---------- 触发时机 ----------
let timer=null;
function schedule(){
  if(timer) return;
  timer=setTimeout(()=>{ timer=null; applyFilter(); captureDetail(); capturePane(); },350);
}
try{
  const mo=new MutationObserver(()=>{ if(applying||Date.now()<muteMOUntil) return; schedule(); });   // v1.2.9：静音窗口内忽略自己造成的变更
  mo.observe(document.documentElement,{childList:true,subtree:true});
}catch(e){}
setInterval(()=>{ if(document.visibilityState==='visible'){ applyFilter(); captureDetail(); capturePane(); } },2000);
window.addEventListener('scroll',schedule,{passive:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ applyFilter(); captureDetail(); capturePane(); },{once:true});
else{ applyFilter(); captureDetail(); capturePane(); }
})();
