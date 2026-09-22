/**
 * Phase 1 固定案件数据 + 四 AI mock。
 * 注意：secretClues / truth 在真实架构中仅存于服务端；
 * 此处为静态原型，仅供本地 UI 演示。
 */

const CASE_META = {
  id: "AM-0407",
  title: "青砚山庄 · 雨夜收藏家之死",
  subtitle: "The Qingyan Estate Blackout",
  location: "郊野青砚山庄",
  date: "11 月 7 日（周四）",
  weather: "暴雨，夜间能见度极低",
  victim: {
    id: "victim",
    name: "沈墨白",
    age: 62,
    role: "知名收藏家、画廊主理人",
    detail:
      "沈墨白以近现代水墨与青年画家发掘闻名。案发当晚，他在山庄举办小型私人展览「回声」，来宾二十余人。21:05 以头痛为由离席，独自进入东侧书房，至 21:45 被发现死亡。",
  },
  background:
    "暴雨切断了山庄与外界的唯一公路。21:12，主宅突发停电；21:28 电力恢复后，佣人发现沈墨白死于书房。尸检指向乌头碱中毒——毒下在他睡前常饮的那杯雪莉酒里。没有破门痕迹，没有外伤。山庄内的五人，每一个都有理由希望他沉默。",
};

const SUSPECTS = [
  {
    id: "S1",
    name: "林晚舟",
    age: 29,
    role: "策展助理",
    motive:
      "三年来薪资微薄，曾多次被沈墨白公开羞辱「只配订画框」。若画廊易主，她的职位将不保。",
    background:
      "负责当晚酒水与展陈动线。21:08 刷卡进入酒窖取雪莉酒，21:10 退出并送至书房。声称自己随后一直在大厅协助撤展。",
  },
  {
    id: "S2",
    name: "顾承嗣",
    age: 51,
    role: "画廊合伙人、主要债权人",
    motive:
      "以私人名义为沈墨白担保两千万贷款。若沈墨白在本周末前去世，担保结构重组，顾承嗣将面临巨额坏账与基金问责。",
    background:
      "电气工程出身，早年做过工业控制。案发时声称整晚（21:00–21:45）未离开台球室。",
  },
  {
    id: "S3",
    name: "苏泠",
    age: 26,
    role: "青年画家",
    motive:
      "沈墨白掌握其早期作品的代笔证据，并计划在展览结束后公开鉴定报告，足以终结她的职业声誉。",
    background:
      "「回声」展览的主打艺术家。声称 21:35–21:45 一直在温室写生，未离开半步。",
  },
  {
    id: "S4",
    name: "邵闻",
    age: 38,
    role: "艺术评论家、业余摄影爱好者",
    motive:
      "曾收受顾承嗣资助出版文集，与沈墨白有长期笔战。若山庄出事，他的深度报道将成为职业生涯的顶点。",
    background:
      "携带胶片与数码双机。其相机在 21:29–21:33 对走廊进行了间隔连拍。",
  },
  {
    id: "S5",
    name: "阮芷",
    age: 34,
    role: "沈墨白的侄女",
    motive:
      "遗嘱修订传闻已久。若沈墨白未及签署新版遗嘱，她将按旧版获得山庄产权，远超目前份额。",
    background:
      "案发当晚较少露面，自称 21:00 起在西翼客房整理行李，无人证实。",
  },
];

const PUBLIC_EVIDENCE = [
  {
    id: "EV-01",
    title: "尸检摘要",
    body: "死亡时间推定 21:25–21:45。胃内容物含雪莉酒与少量杏仁酥。体表无创伤。血液与肝组织检出乌头碱，剂量足以在 15–30 分钟内致死。",
    tags: ["法医", "毒理"],
  },
  {
    id: "EV-02",
    title: "半杯雪莉酒",
    body: "书房书桌上的高脚杯，杯沿与残留酒液均检出乌头碱。杯身仅有死者指纹；杯腹外侧见环形擦拭痕，疑似被人用布抹去指纹后放回。",
    tags: ["物证", "关键"],
  },
  {
    id: "EV-03",
    title: "供电日志与发电机",
    body: "21:12 主宅断电，21:28 恢复。检修发现备用发电机保险丝被人用细铜线跨接熔断——属于蓄意破坏，需要基本电工知识。配电箱旁拾获一根 4cm 细铜线。",
    tags: ["物证", "关键"],
  },
  {
    id: "EV-04",
    title: "走廊摄像头",
    body: "21:31，东侧走廊摄像头拍到顾承嗣出现在书房门口，停留约 3 秒，画面清晰可辨。台球室无摄像头。",
    tags: ["影像", "关键"],
  },
  {
    id: "EV-05",
    title: "顾承嗣证词",
    body: "「21:00 到 21:45，我一直在台球室，没有离开过。没有见过任何人。」——与 EV-04 直接冲突。他解释「记错时间」，拒绝进一步说明。",
    tags: ["证词", "矛盾"],
  },
  {
    id: "EV-06",
    title: "担保与债务文件",
    body: "顾承嗣为沈墨白的两千万贷款提供个人担保。若债权人在本周末前无法完成重组，顾将承担主要损失。文件截止日期：11 月 9 日。",
    tags: ["动机", "文件"],
  },
  {
    id: "EV-07",
    title: "温室延时记录",
    body: "温室门于 20:58 开启后至 21:52 未再开启。苏泠称 21:35–21:45 在温室写生；延时摄影显示画架上的作品最后一笔完成于 20:50，此后无新增笔触。她解释「只是在观察构图」。",
    tags: ["影像", "误导"],
  },
  {
    id: "EV-08",
    title: "酒窖门禁记录",
    body: "21:08 林晚舟刷卡进入酒窖取酒，21:10 退出。这是停电前最后一次合法取酒记录。酒款为「Oloroso 2011」，与尸检样本批号一致。",
    tags: ["门禁", "误导"],
  },
  {
    id: "EV-09",
    title: "邵闻的连拍",
    body: "21:29–21:33 对走廊的间隔连拍中，21:31 一帧清晰（见 EV-04）。21:29 与 21:33 两帧模糊，可见一个戴半指手套的身影。公开相册跳过了这两帧。",
    tags: ["影像", "线索"],
  },
  {
    id: "EV-10",
    title: "书桌上的遗嘱草稿",
    body: "最新版遗嘱仍为未签字状态，见证人栏空白。若本周末前未签署，旧版遗嘱继续生效，山庄产权归阮芷。",
    tags: ["文件", "动机"],
  },
];

/** Round 3 才投放的最后一批公共证据 */
const LATE_EVIDENCE = [
  {
    id: "EV-11",
    title: "台球室痕迹",
    body: "台球室烟灰缸有顾承嗣的雪茄烟蒂，时间戳光学比对约为 21:02 之前。21:10–21:35 之间台球室无任何新鲜使用痕迹（球杆未动、记分牌未更新）。",
    tags: ["物证", "关键"],
  },
  {
    id: "EV-12",
    title: "山庄平面与步行耗时",
    body: "台球室 → 酒窖：约 90 秒；台球室 → 东侧走廊：约 2 分钟。停电期间无照明，但走廊有应急灯，21:31 画面亮度与应急照明一致。",
    tags: ["空间", "关键"],
  },
];

/**
 * 秘密线索 —— 每个 AI 一条，彼此隔离。
 * 服务端按 player_id 单独注入 context。
 */
const SECRET_CLUES = {
  claude: {
    id: "SEC-CLAUDE",
    title: "被跳过的中间帧",
    body: "你获得了邵闻相机的原始文件。21:33 那帧虽然模糊，但经增强可见人影从酒窖方向返回，右手袖口有湿润反光（疑似酒渍）。顾承嗣当晚佩戴的正是铂金袖扣与深色西装——而他从未承认去过酒窖一侧。",
  },
  gpt: {
    id: "SEC-GPT",
    title: "死者手机云端草稿",
    body: "沈墨白 20:55 自动同步到云端的未发送草稿：「承嗣又提签字的事。若今晚不成，他会毁掉一切。我不能再拖。」发送对象栏为空。",
  },
  deepseek: {
    id: "SEC-DEEPSEEK",
    title: "山庄药房出库单",
    body: "三周前，顾承嗣以「花园除草」名义签收附子（乌头碱原料）300 克，经办人休假未能复核。出库数量与尸检推算摄入量的来源损耗吻合。",
  },
  doubao: {
    id: "SEC-DOUBAO",
    title: "酒窖备用钥匙借出簿",
    body: "前台备用钥匙登记簿显示：20:45–21:02，酒窖备用钥匙被借出，签名缩写为「G.C.」，事由栏写着「查酒单」。归还时经办人未核对签名。这意味着毒可能在 21:08 林晚舟正常取酒之前就已入瓶。",
  },
};

/** 服务端保留的真相 —— 前端任何请求都不得携带 */
const TRUTH = {
  killerId: "S2",
  killerName: "顾承嗣",
  solution:
    "顾承嗣在 20:45 借走酒窖备用钥匙（SEC-DOUBAO），用三周前以园艺名义领取的附子提取乌头碱，投入 Oloroso 2011 酒瓶，再于 21:02 前归还钥匙。林晚舟 21:08 的正常取酒，实际上取走了已被下毒的酒。21:12，顾用细铜线熔断发电机保险丝（EV-03），制造时间窗并干扰判断；他 21:02 前离开台球室（EV-11），21:29 从酒窖方向返回、袖口沾酒（SEC-CLAUDE），21:31 出现在书房门口（EV-04），确认毒发后离开，并向邵闻作了虚假的「整晚未离开」证词（EV-05）。动机是周末到期的两千万担保（EV-06）与死者手机里的对峙草稿（SEC-GPT）。真相必须拼合：门禁钥匙 + 药房出库 + 摄像头谎言 + 电力破坏 + 债务动机。",
  redHerrings: ["EV-08", "EV-07"],
  keyCombinations: [
    ["EV-04", "EV-05", "EV-06"],
    ["EV-01", "EV-02", "EV-03"],
    ["EV-03", "EV-11", "EV-12"],
  ],
};

const AI_PLAYERS = [
  { id: "claude", name: "Claude", provider: "Anthropic", accent: "claude" },
  { id: "gpt", name: "Grok", provider: "xAI", accent: "grok" },
  { id: "deepseek", name: "DeepSeek", provider: "DeepSeek", accent: "deepseek" },
  { id: "doubao", name: "Gemini", provider: "Google", accent: "gemini" },
];

/* ------------------------------------------------------------------ */
/* Mock 轮次发言（Phase 1：无真实 API，结构与 Phase 2+ 的 schema 对齐） */
/* ------------------------------------------------------------------ */

const MOCK_ROUNDS = {
  round1: {
    label: "Round 1 — Initial Investigation",
    results: {
      claude: {
        suspect: "S3",
        confidence: 44,
        reasoning_summary:
          "苏泠有最迫切的声誉动机，且温室延时记录让她的不在场证明显得空洞。我倾向于她利用停电窗口接近书房，但毒在酒中这一点说明投毒更早，她是否有机会接触酒窖仍待查。",
        evidence: ["EV-07", "EV-01", "EV-02"],
        question: "毒是在 21:08 取酒之前还是之后进入酒瓶？谁在那之前接触过酒窖？",
        status: "已完成分析",
      },
      gpt: {
        suspect: "S1",
        confidence: 51,
        reasoning_summary:
          "林晚舟是最后一个经手酒的人，门禁时间与毒物载体完全重合。杯身擦拭痕迹像有人想抹掉「经手者」的痕迹。我暂把她列为首位嫌疑人。",
        evidence: ["EV-08", "EV-02", "EV-01"],
        question: "如果她下毒，为何还要留下自己的门禁记录？是否有第二条进入酒窖的路径？",
        status: "已完成分析",
      },
      deepseek: {
        suspect: "S2",
        confidence: 58,
        reasoning_summary:
          "顾的证词与摄像头直接矛盾，这不是记错时间能轻易解释的。再叠加周末到期的担保，动机与谎言同时指向他。电力破坏需要电工知识，他的履历吻合。",
        evidence: ["EV-04", "EV-05", "EV-06", "EV-03"],
        question: "他在 21:31 出现在门口时，死者是否已经中毒？投毒动作发生在何时？",
        status: "已完成分析",
      },
      doubao: {
        suspect: "S4",
        confidence: 39,
        reasoning_summary:
          "邵闻的相机是唯一主动记录走廊的设备，他清楚什么被拍下、什么没有。公开相册跳过两帧的细节很可疑——他在控制叙事。但直接杀人动机弱于债务纠纷。",
        evidence: ["EV-09", "EV-04", "EV-06"],
        question: "邵闻是否受人指使删帧？他自己有没有在 21:29 前后出现在画面里？",
        status: "已完成分析",
      },
    },
  },
  round2: {
    label: "Round 2 — Cross Examination",
    results: {
      claude: {
        suspect: "S3",
        confidence: 36,
        reasoning_summary:
          "Grok 对林晚舟的怀疑有一个结构性漏洞：她若下毒，门禁与尸检批号都会把她钉死，这对一个策展助理来说过于粗糙。我下调对苏泠的置信度，开始认真考虑被忽视的债务线。",
        challenge: {
          target_ai: "gpt",
          argument:
            "你把「最后一个经手酒的人」当成凶手，但忽略了一个问题——杯身被擦拭，说明凶手怕指纹；一个明知自己会被门禁拍下的人，为什么还要擦杯子？这更像真凶在替「经手者」清场。",
        },
        evidence: ["EV-08", "EV-02", "EV-05"],
        status: "已发言",
      },
      gpt: {
        suspect: "S1",
        confidence: 47,
        reasoning_summary:
          "我部分接受 Claude 的质疑：擦拭杯子与门禁暴露之间确实存在张力。但我仍认为林晚舟掌握酒窖流程，不可能完全无辜。维持首位判断，置信度略降。",
        challenge: {
          target_ai: "deepseek",
          argument:
            "你把电力破坏直接算到顾头上，但他电气背景是履历信息，不是案发当晚的痕迹。铜线只能证明「有人懂电」，不能证明「就是他」。你跳过了阮芷——旧版遗嘱对她最有利。",
        },
        evidence: ["EV-08", "EV-10", "EV-03"],
        status: "已发言",
      },
      deepseek: {
        suspect: "S2",
        confidence: 71,
        reasoning_summary:
          "回应 Grok：铜线单独确实不充分，但「铜线 + 摄像头谎言 + 周末担保」三者同时成立时，概率结构变了。我把顾上调到 71%。苏泠的不在场证明漏洞是表演性的，不像预谋投毒。",
        challenge: {
          target_ai: "doubao",
          argument:
            "你怀疑邵闻控制叙事，但他若想隐瞒，直接不发 21:31 那帧即可。留下最致命的一帧、删掉模糊的两帧，更像业余者的整理习惯，而不是共犯的销毁。你的方向可能在追影子。",
        },
        evidence: ["EV-04", "EV-05", "EV-06", "EV-03", "EV-09"],
        status: "已发言",
      },
      doubao: {
        suspect: "S1",
        confidence: 45,
        reasoning_summary:
          "接受 DeepSeek 关于删帧逻辑的反驳，邵闻的嫌疑下调。我更新到林晚舟：取酒窗口、流程熟悉度、以及擦拭痕迹更像内部人操作。但我也认为顾的谎言至少是重大隐瞒。",
        challenge: {
          target_ai: "claude",
          argument:
            "你质疑「为什么留下门禁记录」，可如果真凶想嫁祸，最干净的做法就是留下一个明显的经手者——门禁不是林晚舟的保护色，可能正是凶手需要的靶子。你的反驳反过来支持有人更早进过酒窖。",
        },
        evidence: ["EV-08", "EV-02", "EV-04", "EV-05"],
        status: "已发言",
      },
    },
  },
  round3: {
    label: "Round 3 — Final Investigation",
    results: {
      claude: {
        suspect: "S2",
        confidence: 84,
        reasoning_summary:
          "新增的台球室痕迹与步行耗时补齐了时间结构：顾 21:02 后已不在台球室，有充足往返酒窖与走廊的时间。结合擦拭的酒杯与电力破坏，预谋链条闭合。我改指顾承嗣。",
        evidence: ["EV-04", "EV-05", "EV-06", "EV-11", "EV-12", "EV-03"],
        question: "",
        status: "最终分析完成",
      },
      gpt: {
        suspect: "S1",
        confidence: 62,
        reasoning_summary:
          "台球室痕迹确实削弱了顾的「全程在场」，但 EV-11 只能证明他离开过，不能证明他下毒。林晚舟仍是唯一有完整酒窖操作链的人。我上调对她的置信度，准备维持指控。",
        evidence: ["EV-08", "EV-02", "EV-01", "EV-11"],
        question: "",
        status: "最终分析完成",
      },
      deepseek: {
        suspect: "S2",
        confidence: 91,
        reasoning_summary:
          "EV-11 + EV-12 消除了他最后的时间借口：21:02 前离开台球室 → 有窗口投毒/破坏 → 21:31 确认。谎言、机会、动机、手段四链闭合。维持顾承嗣，置信度 91。",
        evidence: ["EV-03", "EV-04", "EV-05", "EV-06", "EV-11", "EV-12"],
        question: "",
        status: "最终分析完成",
      },
      doubao: {
        suspect: "S2",
        confidence: 76,
        reasoning_summary:
          "Claude 对「留下门禁记录」的结构性质疑是对的：有人需要一个显眼的经手者。顾的谎言 + 电力知识 + 债务到期，使他从「隐瞒者」升级为「执行者」。我从林晚舟改指顾承嗣。",
        evidence: ["EV-04", "EV-05", "EV-06", "EV-03", "EV-11"],
        question: "",
        status: "最终分析完成",
      },
    },
  },
  final: {
    label: "Final Accusation",
    results: {
      claude: {
        killer: "S2",
        confidence: 88,
        reasoning_summary:
          "证词与影像的正面冲突、周末到期的担保、被跨接的保险丝、以及台球室的空窗期，共同指向顾承嗣。他需要一场可控的混乱来掩盖早于取酒的投毒。",
        key_evidence: ["EV-04", "EV-05", "EV-06", "EV-03"],
      },
      gpt: {
        killer: "S1",
        confidence: 71,
        reasoning_summary:
          "我仍相信毒经由合法取酒流程进入书房。林晚舟是唯一完整接触该流程的人；顾的谎言或许只是丑闻掩盖，未必等于投毒者。",
        key_evidence: ["EV-08", "EV-02", "EV-01"],
      },
      deepseek: {
        killer: "S2",
        confidence: 94,
        reasoning_summary:
          "时间线、能力、动机三项独立收敛于顾承嗣：21:02 后的行动自由、电工手段、两千万担保截止日。其他嫌疑人无法同时解释电力破坏与影像谎言。",
        key_evidence: ["EV-05", "EV-11", "EV-06", "EV-03"],
      },
      doubao: {
        killer: "S2",
        confidence: 79,
        reasoning_summary:
          "门禁上的显眼经手者更像被安排的靶子；真正需要隐藏的是更早的入场者。顾的证词破产后，其余证据开始互相咬合。",
        key_evidence: ["EV-04", "EV-05", "EV-03", "EV-11"],
      },
    },
  },
};

/** 服务器端评分结果（Phase 1 预置；Phase 9 将由 Scoring Engine 计算） */
const MOCK_SCORES = [
  {
    id: "claude",
    name: "Claude",
    total: 87,
    correct: true,
    finalSuspect: "S2",
    breakdown: {
      accuracy: 33,
      evidence: 17,
      logic: 13,
      contradiction: 14,
      debate: 6,
      calibration: 4,
    },
    note: "最终指控正确；Round 2 准确识别「经手者靶子」结构，证据组合完整。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    total: 84,
    correct: true,
    finalSuspect: "S2",
    breakdown: {
      accuracy: 32,
      evidence: 15,
      logic: 14,
      contradiction: 12,
      debate: 7,
      calibration: 4,
    },
    note: "最早锁定正确方向，逻辑链最完整；对邵闻的反驳精准。",
  },
  {
    id: "doubao",
    name: "Gemini",
    total: 77,
    correct: true,
    finalSuspect: "S2",
    breakdown: {
      accuracy: 30,
      evidence: 15,
      logic: 11,
      contradiction: 10,
      debate: 7,
      calibration: 4,
    },
    note: "中期误判后完成修正；Round 2 反质询推动了 Claude 的推理。",
  },
  {
    id: "gpt",
    name: "Grok",
    total: 53,
    correct: false,
    finalSuspect: "S1",
    breakdown: {
      accuracy: 15,
      evidence: 14,
      logic: 9,
      contradiction: 6,
      debate: 6,
      calibration: 3,
    },
    note: "早期置信度分配合理，但被误导证据 EV-08 锁死，终局未转向。",
  },
];

const SCORE_DIMENSIONS = [
  { key: "accuracy", label: "Accuracy", max: 35, desc: "最终与过程中对真凶的锁定程度" },
  { key: "evidence", label: "Evidence Usage", max: 20, desc: "引用关键证据的覆盖率与有效性" },
  { key: "logic", label: "Logical Consistency", max: 15, desc: "各轮推理是否自洽、无跳步" },
  { key: "contradiction", label: "Contradiction Detection", max: 15, desc: "发现证词/时间线冲突的能力" },
  { key: "debate", label: "Debate Quality", max: 10, desc: "质疑与支持的质量" },
  { key: "calibration", label: "Confidence Calibration", max: 5, desc: "置信度与证据强度是否匹配" },
];

/* Node / vm 校验脚本需要显式挂到 globalThis（浏览器 script 作用域外不可见） */
(function attachGlobals(g) {
  const bag = {
    CASE_META,
    SUSPECTS,
    PUBLIC_EVIDENCE,
    LATE_EVIDENCE,
    SECRET_CLUES,
    TRUTH,
    AI_PLAYERS,
    MOCK_ROUNDS,
    MOCK_SCORES,
    SCORE_DIMENSIONS,
  };
  if (!g) return;
  for (const [k, v] of Object.entries(bag)) {
    try {
      g[k] = v;
    } catch (_) {
      /* ignore read-only */
    }
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = bag;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
