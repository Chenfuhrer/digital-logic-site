// 课程骨架数据：与 ../数字电子技术_课程大纲.md 保持一致
// 难度 diff / 考试重要程度 exam 均为 1–5；exam 为一般本科课程经验判断，不是学校真实考点统计。
const R = String.raw;

window.COURSE = {
  meta: {
    updated: "2026-11-02",
    textbook: "未提供（默认参考阎石《数字电子技术基础》第 6 版的章节顺序）",
  },

  chapters: [
    { id: "num", no: "M1", name: "数制与编码", en: "Number Systems & Codes" },
    { id: "bool", no: "M2", name: "逻辑代数", en: "Boolean Algebra" },
    { id: "gate", no: "M3", name: "逻辑门电路", en: "Logic Gates" },
    { id: "comb", no: "M4", name: "组合逻辑电路", en: "Combinational Logic" },
    { id: "ff", no: "M5", name: "锁存器与触发器", en: "Latches & Flip-flops" },
    { id: "seq", no: "M6", name: "时序逻辑电路", en: "Sequential Logic" },
    { id: "pulse", no: "M7", name: "脉冲产生与整形", en: "Pulse Circuits" },
    { id: "mem", no: "M8", name: "存储器与可编程逻辑", en: "Memory & PLD" },
    { id: "adc", no: "M9", name: "ADC 与 DAC", en: "A/D & D/A" },
  ],

  classes: {
    A: "教材核心必学",
    B: "考试常见（经验）",
    C: "工程拓展",
  },

  // 主线：输出由什么决定
  thread: [
    { stage: "信号", ch: "num", rule: "连续量 → 0 / 1", formula: R`$N=\sum k_i\,2^i$`, q: "怎样用两个电平表示任何信息" },
    { stage: "逻辑", ch: "bool", rule: "Y = f(A, B, …)", formula: R`$\overline{A+B}=\bar A\,\bar B$`, q: "怎样用代数描述、化简“因为…所以…”" },
    { stage: "门", ch: "gate", rule: "代数 → 晶体管", formula: R`$V_{NH}=V_{OH(\min)}-V_{IH(\min)}$`, q: "真实的 0 / 1 有多“干净”、多快" },
    { stage: "组合", ch: "comb", rule: "Y = f(现在的输入)", formula: R`$Y=\sum m_i D_i$`, q: "没有记忆的电路能做什么" },
    { stage: "记忆", ch: "ff", rule: "Q* = f(输入, Q)", formula: R`$Q^{*}=J\bar Q+\bar K Q$`, q: "怎样让电路记住一位" },
    { stage: "时序", ch: "seq", rule: "状态 + 时钟 → 系统", formula: R`$Q^{*}=F(X,Q)\quad Y=G(X,Q)$`, q: "怎样按节拍一步步走状态" },
    { stage: "时钟", ch: "pulse", rule: "节拍从哪里来", formula: R`$T\approx0.7(R_1+2R_2)C$`, q: "怎样产生和整形脉冲" },
    { stage: "系统", ch: "mem", rule: "存储 + 可编程", formula: R`容量 $=2^{n}\times m$`, q: "怎样把大量逻辑和数据装进芯片" },
    { stage: "接口", ch: "adc", rule: "0 / 1 ↔ 连续量", formula: R`$\Delta=\dfrac{V_{\mathrm{REF}}}{2^{n}}$（只舍不入）`, q: "数字系统怎样回到真实世界" },
  ],

  // pre：真正的先修依赖（知识地图连线）；need：需要的数学 / 电路先修知识
  // gate：关卡课（没过关不进入下一课）；minimal：期末最小必学路径
  lessons: [
    { id: "L1", ch: "num", short: "数字信号", title: "模拟信号、数字信号与数字电路", core: "高低电平 · 正负逻辑 · 为什么用二进制", diff: 1, exam: 2, cls: "A", hours: 1.5, pre: [], need: "高中物理：电压、电流" , minimal: true },
    { id: "L2", ch: "num", short: "进制转换", title: "进制与进制转换", core: "按权展开 · 除基取余 / 乘基取整 · 二↔八↔十六分组", diff: 2, exam: 4, cls: "A", hours: 2, pre: ["L1"], need: "幂运算", minimal: true, lab: "radix" },
    { id: "L3", ch: "num", short: "补码", title: "二进制运算、原码 / 反码 / 补码", core: R`补码加减 · $n$ 位范围 $-2^{n-1}\sim2^{n-1}-1$ · 溢出判断`, diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L2"], need: "模运算的直观理解", minimal: true, lab: "radix" },
    { id: "L4", ch: "num", short: "BCD·格雷", title: "BCD 码、格雷码与常用编码", core: "8421 / 余 3 / 2421 · 格雷码相邻只变一位 · 奇偶校验", diff: 2, exam: 4, cls: "A", hours: 1.5, pre: ["L2"], need: "—", minimal: true, lab: "radix" },
    { id: "C1", ch: "num", checkpoint: true, title: "M1 章节复习与测试", core: "知识树 · 公式表 · 题型 · 测验 · 错题", hours: 1 },

    { id: "L5", ch: "bool", short: "逻辑运算", title: "基本逻辑运算与复合逻辑运算", core: "与 / 或 / 非 · 与非 / 或非 / 异或 / 同或 · 国标与 IEEE 符号", diff: 1, exam: 4, cls: "A", hours: 2, pre: ["L1"], need: "—", minimal: true, lab: "logic" },
    { id: "L6", ch: "bool", short: "表示方法", title: "逻辑函数的五种表示及互相转换", core: "真值表 · 表达式 · 逻辑图 · 波形图 · 卡诺图（预告）", diff: 2, exam: 5, cls: "A", hours: 2, pre: ["L5"], need: "—", minimal: true, gate: true, lab: "logic" },
    { id: "L7", ch: "bool", short: "定律·德摩根", title: "基本定律、德摩根定律与三条规则", core: "吸收律 · 冗余律 · 代入 / 反演 / 对偶规则", diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L6"], need: "集合运算（可选）", minimal: true, lab: "logic" },
    { id: "L8", ch: "bool", short: "最小项", title: "最小项、最大项与标准形式", core: R`$m_i$ 与 $M_i$ 的编号 · $\overline{m_i}=M_i$ · 标准与或式 / 或与式`, diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L6", "L2"], need: "二进制编号", minimal: true, gate: true, lab: "logic" },
    { id: "L9", ch: "bool", short: "公式化简", title: "公式法化简", core: "并项 · 吸收 · 消项 · 配项 · 最简的标准", diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L7"], need: "—", minimal: true },
    { id: "L10", ch: "bool", short: "卡诺图", title: "卡诺图化简", core: R`格雷码排列 · 每个圈含 $2^k$ 个格 · 圈大、圈少、每圈有新格`, diff: 3, exam: 5, cls: "A", hours: 3, pre: ["L8", "L4"], need: "—", minimal: true, gate: true, lab: "kmap" },
    { id: "L11", ch: "bool", short: "无关项", title: "无关项与多输出函数化简", core: "约束项 · 任意项 · × 的取舍 · 共享乘积项", diff: 4, exam: 5, cls: "A", hours: 2, pre: ["L10"], need: "—", minimal: true, lab: "kmap" },
    { id: "C2", ch: "bool", checkpoint: true, title: "M2 章节复习与测试", core: "知识树 · 公式表 · 题型 · 测验 · 错题", hours: 2 },

    { id: "L12", ch: "gate", short: "开关特性", title: "半导体器件的开关特性（先修检查）", core: "二极管 · BJT 饱和 / 截止 · MOS 管导通条件", diff: 3, exam: 2, cls: "A", hours: 2, pre: ["L1"], need: "模电：PN 结、三极管、MOS 管（先做检查）" },
    { id: "L13", ch: "gate", short: "CMOS 门", title: "CMOS 反相器与 CMOS 门电路", core: "互补结构 · 电压传输特性 · 与非 / 或非的串并联", diff: 4, exam: 3, cls: "A", hours: 2.5, pre: ["L12", "L5"], need: "串联 / 并联开关" },
    { id: "L14", ch: "gate", short: "电气参数", title: "逻辑电平、噪声容限、扇出、延迟与功耗", core: R`$V_{NH},V_{NL}$ · 扇出系数 · $t_{pd}$ · 静态 / 动态功耗`, diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L13"], need: "欧姆定律", minimal: true },
    { id: "L15", ch: "gate", short: "三态·OD", title: "三态门、OD / OC 门与线与", core: "高阻态 · 总线分时 · 上拉电阻的作用", diff: 3, exam: 4, cls: "B", hours: 2, pre: ["L13"], need: "—", minimal: true },
    { id: "L16", ch: "gate", short: "TTL·使用", title: "TTL 门要点与集成电路使用基础", core: "TTL 输入端悬空 · 多余输入端处理 · CMOS/TTL 接口", diff: 3, exam: 3, cls: "B", hours: 1.5, pre: ["L12", "L14"], need: "—" },
    { id: "C3", ch: "gate", checkpoint: true, title: "M3 章节复习与测试", core: "知识树 · 参数表 · 题型 · 测验 · 错题", hours: 1.5 },

    { id: "L17", ch: "comb", short: "组合分析", title: "组合逻辑电路的分析", core: "逻辑图 → 表达式 → 化简 → 真值表 → 功能", diff: 2, exam: 5, cls: "A", hours: 2, pre: ["L6", "L9"], need: "—", minimal: true, gate: true },
    { id: "L18", ch: "comb", short: "组合设计", title: "组合逻辑电路的设计", core: "需求 → 逻辑抽象 → 真值表 → 化简 → 变换 → 电路", diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L17", "L11"], need: "—", minimal: true, gate: true, project: "P1" },
    { id: "L19", ch: "comb", short: "编码器", title: "编码器与优先编码器", core: "74HC148 · 低电平有效 · 扩展端", diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L18"], need: "—" },
    { id: "L20", ch: "comb", short: "译码器", title: "译码器与显示译码", core: "74HC138 · 用译码器实现函数 · 七段数码管", diff: 3, exam: 5, cls: "A", hours: 3, pre: ["L18", "L8"], need: "—", minimal: true, lab: "msi", project: "P2" },
    { id: "L21", ch: "comb", short: "数据选择器", title: "数据选择器与数据分配器", core: R`74HC151 / 153 · $Y=\sum m_iD_i$ · 降维实现函数`, diff: 4, exam: 5, cls: "A", hours: 3, pre: ["L20"], need: "—", minimal: true, gate: true, lab: "msi" },
    { id: "L22", ch: "comb", short: "加法·比较", title: "加法器与数值比较器", core: "半加 / 全加 · 串行进位 vs 超前进位 · 74HC283 / 85", diff: 3, exam: 4, cls: "A", hours: 2.5, pre: ["L18", "L3"], need: "—", minimal: true },
    { id: "L23", ch: "comb", short: "竞争冒险", title: "竞争与冒险", core: R`$A+\bar A$ / $A\bar A$ 型判断 · 卡诺图相切 · 消除方法`, diff: 4, exam: 4, cls: "B", hours: 2, pre: ["L17", "L14", "L10"], need: "传播延迟" },
    { id: "C4", ch: "comb", checkpoint: true, title: "M4 章节复习与测试", core: "知识树 · 器件表 · 题型 · 测验 · 错题", hours: 2.5 },

    { id: "L24", ch: "ff", short: "SR 锁存器", title: "双稳态与 SR 锁存器", core: R`或非 / 与非结构 · 约束 $SR=0$（与非型为 $\bar S_D+\bar R_D=1$）· 不定状态`, diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L5", "L17"], need: "反馈的概念", minimal: true, gate: true, lab: "ff" },
    { id: "L25", ch: "ff", short: "触发方式", title: "门控锁存器与触发方式", core: "电平触发 · 脉冲（主从）触发 · 边沿触发 · 空翻", diff: 4, exam: 5, cls: "A", hours: 2, pre: ["L24"], need: "—", minimal: true, lab: "ff" },
    { id: "L26", ch: "ff", short: "D·JK·T", title: "D、JK、T、T′ 触发器的逻辑功能", core: "特性表 · 特性方程 · 状态转换图", diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L25"], need: "—", minimal: true, gate: true, lab: "ff" },
    { id: "L27", ch: "ff", short: "波形·激励", title: "时序波形、激励表、触发器转换", core: "按有效沿画波形 · 异步置位 / 复位优先 · 激励表", diff: 4, exam: 5, cls: "A", hours: 2.5, pre: ["L26"], need: "—", minimal: true, lab: "ff", project: "P3" },
    { id: "L28", ch: "ff", short: "时序参数", title: "建立时间、保持时间与最高时钟频率", core: R`$t_{su},t_h,t_{pd}$ · $f_{\max}$ 的估算`, diff: 4, exam: 3, cls: "B", hours: 1.5, pre: ["L27", "L14"], need: "—" },
    { id: "C5", ch: "ff", checkpoint: true, title: "M5 章节复习与测试", core: "知识树 · 方程表 · 题型 · 测验 · 错题", hours: 2 },

    { id: "L29", ch: "seq", short: "描述方法", title: "时序电路的结构与描述方法", core: "Mealy / Moore · 驱动 / 状态 / 输出方程 · 状态表 / 状态图", diff: 3, exam: 5, cls: "A", hours: 2, pre: ["L26", "L6"], need: "—", minimal: true },
    { id: "L30", ch: "seq", short: "同步分析", title: "同步时序电路的分析", core: "驱动方程 → 状态方程 → 状态表 → 状态图 → 功能 · 自启动", diff: 4, exam: 5, cls: "A", hours: 3, pre: ["L29", "L27"], need: "—", minimal: true, gate: true },
    { id: "L31", ch: "seq", short: "异步分析", title: "异步时序电路的分析", core: "每个触发器自己的时钟 · 先判断有没有有效沿", diff: 4, exam: 4, cls: "B", hours: 2, pre: ["L30"], need: "—" },
    { id: "L32", ch: "seq", short: "移位寄存器", title: "寄存器与移位寄存器", core: "74HC194 · 串入并出 · 环形 / 扭环形计数器", diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L27", "L29"], need: "—", minimal: true },
    { id: "L33", ch: "seq", short: "同步计数器", title: "同步计数器", core: "二进制 / 十进制 · 74HC161 / 160 功能表", diff: 4, exam: 5, cls: "A", hours: 2.5, pre: ["L30"], need: "—", minimal: true, gate: true, lab: "counter" },
    { id: "L34", ch: "seq", short: "异步计数器", title: "异步计数器", core: "T′ 触发器级联 · 加 / 减计数的接法 · 速度限制", diff: 3, exam: 4, cls: "B", hours: 1.5, pre: ["L33", "L31"], need: "—" },
    { id: "L35", ch: "seq", short: "任意进制", title: "任意进制计数器", core: "异步清零法 vs 同步置数法 · 过渡状态 · 级联", diff: 4, exam: 5, cls: "A", hours: 3, pre: ["L33"], need: "—", minimal: true, gate: true, lab: "counter", project: "P4" },
    { id: "L36", ch: "seq", short: "同步设计", title: "同步时序电路的设计", core: "原始状态图 → 化简 → 编码 → 次态卡诺图 → 驱动方程 → 自启动检查", diff: 5, exam: 5, cls: "A", hours: 3.5, pre: ["L30", "L11", "L27"], need: "—", minimal: true, gate: true, lab: "fsm" },
    { id: "L37", ch: "seq", short: "状态机实例", title: "有限状态机：序列检测器与交通灯", core: "Mealy vs Moore 的状态数 · 重叠检测", diff: 5, exam: 4, cls: "B", hours: 2.5, pre: ["L36"], need: "—", lab: "fsm", project: "P5" },
    { id: "C6", ch: "seq", checkpoint: true, title: "M6 章节复习与测试", core: "知识树 · 流程卡 · 题型 · 测验 · 错题", hours: 3 },

    { id: "L38", ch: "pulse", short: "施密特", title: "脉冲参数与施密特触发器", core: R`$t_r,t_f,t_w,q$ · 回差 $\Delta V_T$ · 整形与鉴幅`, diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L1", "L14"], need: "RC 充放电（电路分析）", minimal: true, lab: "timer" },
    { id: "L39", ch: "pulse", short: "单稳态", title: "单稳态触发器", core: R`暂稳态 · $t_w$ 由 RC 决定 · 定时与延时`, diff: 3, exam: 3, cls: "B", hours: 1.5, pre: ["L38"], need: "一阶 RC 三要素法" },
    { id: "L40", ch: "pulse", short: "多谐振荡", title: "多谐振荡器", core: "没有稳态 · 两个暂稳态交替 · 石英晶体振荡", diff: 3, exam: 3, cls: "B", hours: 1.5, pre: ["L38"], need: "一阶 RC 三要素法" },
    { id: "L41", ch: "pulse", short: "555", title: "555 定时器及其三种应用", core: R`施密特 / 单稳 $t_w=1.1RC$ / 多谐 $T=0.7(R_1+2R_2)C$`, diff: 4, exam: 5, cls: "A", hours: 3, pre: ["L39", "L40"], need: "一阶 RC 三要素法", minimal: true, gate: true, lab: "timer" },
    { id: "L42", ch: "pulse", short: "按键消抖", title: "按键消抖与脉冲整形（工程）", core: "RC + 施密特 · SR 锁存器消抖 · 软件消抖对照", diff: 2, exam: 2, cls: "C", hours: 1, pre: ["L38", "L24"], need: "—" },
    { id: "C7", ch: "pulse", checkpoint: true, title: "M7 章节复习与测试", core: "知识树 · 公式表 · 题型 · 测验 · 错题", hours: 1.5 },

    { id: "L43", ch: "mem", short: "ROM", title: "ROM 及用 ROM 实现组合逻辑", core: "地址译码 + 存储矩阵 · 点阵图 · 查表即函数", diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L20", "L8"], need: "—", minimal: true },
    { id: "L44", ch: "mem", short: "RAM", title: "RAM：SRAM 与 DRAM", core: "六管 SRAM 单元 · DRAM 电容与刷新 · 读写时序", diff: 2, exam: 3, cls: "B", hours: 1.5, pre: ["L24"], need: "—" },
    { id: "L45", ch: "mem", short: "容量·扩展", title: "存储容量与扩展", core: R`容量 $=2^n\times m$ · 位扩展 · 字扩展 · 片选译码`, diff: 3, exam: 5, cls: "A", hours: 2.5, pre: ["L43", "L44", "L20"], need: "—", minimal: true, gate: true },
    { id: "L46", ch: "mem", short: "PLD·FPGA", title: "PLA、PAL、CPLD 与 FPGA 基本概念", core: "与阵列 / 或阵列谁可编程 · LUT 本质是小 ROM", diff: 3, exam: 2, cls: "B", hours: 2, pre: ["L43", "L11"], need: "—" },
    { id: "C8", ch: "mem", checkpoint: true, title: "M8 章节复习与测试", core: "知识树 · 公式表 · 题型 · 测验 · 错题", hours: 1.5 },

    { id: "L47", ch: "adc", short: "DAC", title: "D/A 转换器", core: R`权电阻网络 · 倒 T 形电阻网络 · $v_O=-\dfrac{V_{\mathrm{REF}}}{2^n}\sum_{i=0}^{n-1}D_i2^i$（$R_f=R$）`, diff: 3, exam: 4, cls: "A", hours: 2.5, pre: ["L2"], need: "运放虚短虚断（先做检查）", minimal: true, lab: "adc" },
    { id: "L48", ch: "adc", short: "采样量化", title: "A/D 转换的基本原理", core: "采样定理 · 采样保持 · 量化单位 · 两种量化误差", diff: 3, exam: 4, cls: "A", hours: 2, pre: ["L47"], need: "采样的直观概念", minimal: true, lab: "adc" },
    { id: "L49", ch: "adc", short: "ADC 结构", title: "常见 ADC：并联比较、逐次逼近、双积分", core: "速度 vs 精度 · SAR：n 次逐位比较（阎石电路一次转换需 n+2 个时钟周期 ⚠️以教材为准）· 双积分抗干扰", diff: 4, exam: 4, cls: "B", hours: 2.5, pre: ["L48", "L32"], need: "—", lab: "adc" },
    { id: "C9", ch: "adc", checkpoint: true, title: "M9 章节复习与测试", core: "知识树 · 公式表 · 题型 · 测验 · 错题", hours: 1.5 },

    { id: "Z", ch: null, checkpoint: true, final: true, title: "期末综合复习与模拟卷", core: "全书知识树 · 综合题 · 两套模拟卷 · 错题回炉", hours: 6 },
  ],

  // 工程实践（C 类，课程基础掌握后再做）
  projects: [
    { id: "P1", after: "L18", title: "多数表决 / 报警逻辑", tool: "Logisim Evolution", what: "三人表决 + 故障报警，门级实现并仿真全部输入组合" },
    { id: "P2", after: "L20", title: "数码管显示电路", tool: "Logisim Evolution", what: "BCD → 七段译码，验证 0–9 全部字形" },
    { id: "P3", after: "L27", title: "状态记忆电路", tool: "Logisim Evolution", what: "按键置位 / 复位指示灯，加 SR 锁存器消抖" },
    { id: "P4", after: "L35", title: "数字计时器（00–59）", tool: "Logisim / Multisim", what: "两片 74x160 级联 + 译码显示，测出每一位的进位时刻" },
    { id: "P5", after: "L37", title: "交通信号灯控制器", tool: "Logisim Evolution", what: "Moore 状态机 + 计数器定时，画状态图并逐状态仿真" },
    { id: "P6", after: "Z", title: "Verilog 入门与 FPGA 实现", tool: "Icarus Verilog / Vivado", what: "把 P4、P5 改写成 Verilog，写 testbench 对照波形" },
  ],

  labs: [
    { id: "radix", name: "进制与编码", sub: "补码 · BCD · 格雷", lessons: "L2–L4" },
    { id: "logic", name: "逻辑函数", sub: "表达式 ↔ 真值表", lessons: "L5–L8" },
    { id: "kmap", name: "卡诺图", sub: "画圈化简 · 无关项", lessons: "L10–L11" },
    { id: "msi", name: "译码器 · 选择器", sub: "138 / 151 实现函数", lessons: "L20–L21" },
    { id: "ff", name: "触发器时序", sub: "锁存器 vs 边沿", lessons: "L24–L27" },
    { id: "counter", name: "任意进制计数器", sub: "74x161 清零 / 置数", lessons: "L33–L35" },
    { id: "fsm", name: "序列检测器", sub: "Mealy vs Moore", lessons: "L36–L37" },
    { id: "timer", name: "555 定时器", sub: "多谐 · 单稳 · 施密特", lessons: "L38–L41" },
    { id: "adc", name: "AD / DA", sub: "量化 · 逐次逼近", lessons: "L47–L49" },
  ],
};
