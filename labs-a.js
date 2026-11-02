// 实验 A 组：首屏逻辑分析仪 + 进制与编码 / 逻辑函数 / 卡诺图 / 译码器·数据选择器
// 结构：第 1 部分是不依赖 DOM 的纯逻辑（可在 node 中测试）；第 2 部分注册实验（仅当 window.Labs 存在时执行）；
// 末尾把纯逻辑挂到 window.LabsLogicA。
(() => {
  "use strict";

  /* =====================================================================
   * 第 1 部分：纯逻辑
   * ===================================================================== */
  const VARS = ["A", "B", "C", "D"];
  const popcnt = (x) => {
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  };
  const toBin = (u, n) => (u >>> 0).toString(2).padStart(n, "0").slice(-n);

  /* ---------- 数制与编码 ---------- */
  function toSigned(u, n = 8) {
    const M = 1 << n;
    u = ((u % M) + M) % M;
    return u >= M >> 1 ? u - M : u;
  }
  function fromSigned(v, n = 8) {
    const M = 1 << n;
    return ((v % M) + M) % M;
  }
  // 给定符号与绝对值，求 n 位原码 / 反码 / 补码（不可表示时为 null）。sign=1,mag=0 表示 −0。
  function signCodes(sign, mag, n = 8) {
    const max = (1 << (n - 1)) - 1;
    const ok = mag <= max;
    const orig = ok ? (sign ? "1" : "0") + toBin(mag, n - 1) : null;
    const ones = ok ? (sign ? "1" + toBin(~mag & max, n - 1) : orig) : null;
    const v = sign ? -mag : mag;
    const twos = v >= -(max + 1) && v <= max ? toBin(fromSigned(v, n), n) : null;
    return { orig, ones, twos, value: v };
  }
  const bin2gray = (b) => b ^ (b >> 1);
  function gray2bin(g) {
    let b = 0;
    for (; g; g >>= 1) b ^= g;
    return b;
  }
  // 十进制数 → 8421BCD 字符串数组（每位十进制一个 4 位组）
  const toBCD = (x) => String(x).split("").map((d) => toBin(+d, 4));
  function fromBCD(groups) {
    let v = 0;
    for (const g of groups) {
      const d = parseInt(g, 2);
      if (d > 9) return null;
      v = v * 10 + d;
    }
    return v;
  }
  // 除 2 取余：返回每一步 { n, q, r }
  function divSteps(x) {
    if (x === 0) return [{ n: 0, q: 0, r: 0 }];
    const st = [];
    while (x > 0) {
      st.push({ n: x, q: x >> 1, r: x & 1 });
      x >>= 1;
    }
    return st;
  }
  // n 位补码加法：x、y 为有符号真值
  function addTwos(x, y, n) {
    const ux = fromSigned(x, n);
    const uy = fromSigned(y, n);
    const c = [0];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = (ux >> i) & 1;
      const b = (uy >> i) & 1;
      s |= (a ^ b ^ c[i]) << i;
      c.push((a & b) | (a & c[i]) | (b & c[i]));
    }
    const cout = c[n];
    const cmsb = c[n - 1];
    return { ux, uy, sum: s, carries: c, cout, cmsb, overflow: cout ^ cmsb, trueSum: x + y, result: toSigned(s, n) };
  }

  /* ---------- 逻辑表达式解析 ---------- */
  // 优先级（高→低）：非（' 后缀 / ! ~ ¬ 前缀） > 与（· * & 或并列） > 异或 ^ ⊕、同或 ⊙ > 或（+ |）
  class ExprError extends Error {
    constructor(msg, pos) {
      super(msg);
      this.pos = pos;
    }
  }
  function tokenize(src) {
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (/\s/.test(ch)) continue;
      const up = ch.toUpperCase();
      if (/[A-Za-z]/.test(ch)) {
        const k = VARS.indexOf(up);
        if (k < 0) throw new ExprError(`未知变量「${ch}」：只支持 A、B、C、D`, i);
        out.push({ k: "var", i: k, pos: i });
      } else if (ch === "0" || ch === "1") out.push({ k: "const", v: +ch, pos: i });
      else if (/[2-9]/.test(ch)) throw new ExprError(`常量只能是 0 或 1，这里是「${ch}」`, i);
      else if ("'’′`".includes(ch)) out.push({ k: "post", pos: i });
      else if ("!~¬".includes(ch)) out.push({ k: "not", pos: i });
      else if ("+|∨".includes(ch)) out.push({ k: "or", pos: i });
      else if ("*·⋅•&∧.".includes(ch)) out.push({ k: "and", pos: i });
      else if ("^⊕".includes(ch)) out.push({ k: "xor", pos: i });
      else if (ch === "⊙") out.push({ k: "xnor", pos: i });
      else if (ch === "(" || ch === "（") out.push({ k: "(", pos: i });
      else if (ch === ")" || ch === "）") out.push({ k: ")", pos: i });
      else throw new ExprError(`无法识别的符号「${ch}」`, i);
    }
    return out;
  }
  function parseExpr(src) {
    const tk = tokenize(String(src));
    if (!tk.length) throw new ExprError("表达式为空", 0);
    let p = 0;
    const end = String(src).length;
    const peek = () => tk[p];
    const posOf = () => (tk[p] ? tk[p].pos : end);
    const startsPrimary = (t) => t && (t.k === "var" || t.k === "const" || t.k === "(" || t.k === "not");
    function pOr() {
      let a = pXor();
      while (peek() && peek().k === "or") {
        p++;
        a = { t: "or", a, b: pXor() };
      }
      return a;
    }
    function pXor() {
      let a = pAnd();
      while (peek() && (peek().k === "xor" || peek().k === "xnor")) {
        const k = tk[p++].k;
        a = { t: k, a, b: pAnd() };
      }
      return a;
    }
    function pAnd() {
      let a = pUnary();
      for (;;) {
        const t = peek();
        if (t && t.k === "and") {
          p++;
          a = { t: "and", a, b: pUnary() };
        } else if (startsPrimary(t)) a = { t: "and", a, b: pUnary() };
        else break;
      }
      return a;
    }
    function pUnary() {
      const t = peek();
      if (t && t.k === "not") {
        p++;
        return { t: "not", a: pUnary() };
      }
      let x = pPrimary();
      while (peek() && peek().k === "post") {
        p++;
        x = { t: "not", a: x };
      }
      return x;
    }
    function pPrimary() {
      const t = peek();
      if (!t) throw new ExprError("表达式不完整：末尾缺少变量或括号内容", end);
      if (t.k === "var") {
        p++;
        return { t: "var", i: t.i };
      }
      if (t.k === "const") {
        p++;
        return { t: "const", v: t.v };
      }
      if (t.k === "(") {
        p++;
        if (peek() && peek().k === ")") throw new ExprError("括号里是空的", peek().pos);
        const e = pOr();
        if (!peek() || peek().k !== ")") throw new ExprError(`缺少右括号「)」，与第 ${t.pos + 1} 个字符处的「(」配对`, posOf());
        p++;
        return e;
      }
      const names = { or: "「+」", and: "「·」", xor: "「^」", xnor: "「⊙」", post: "「'」", ")": "「)」" };
      if (t.k === ")") throw new ExprError("多余的右括号「)」，或它前面缺少操作数", t.pos);
      throw new ExprError(`${names[t.k] || "运算符"} 前面缺少操作数`, t.pos);
    }
    const ast = pOr();
    if (p < tk.length) {
      const t = tk[p];
      throw new ExprError(t.k === ")" ? "多余的右括号「)」" : "这里无法继续解析", t.pos);
    }
    return ast;
  }
  function evalAst(ast, env) {
    switch (ast.t) {
      case "var":
        return env[ast.i];
      case "const":
        return ast.v;
      case "not":
        return 1 - evalAst(ast.a, env);
      case "and":
        return evalAst(ast.a, env) & evalAst(ast.b, env);
      case "or":
        return evalAst(ast.a, env) | evalAst(ast.b, env);
      case "xor":
        return evalAst(ast.a, env) ^ evalAst(ast.b, env);
      case "xnor":
        return 1 - (evalAst(ast.a, env) ^ evalAst(ast.b, env));
    }
    throw new Error("bad node");
  }
  function maxVar(ast) {
    if (ast.t === "var") return ast.i;
    if (ast.t === "const") return -1;
    return Math.max(maxVar(ast.a), ast.b ? maxVar(ast.b) : -1);
  }
  // 变量 i（A=0）取第 m 行的值：A 为最高位
  const bitOf = (m, i, n) => (m >> (n - 1 - i)) & 1;
  function truthTable(ast, n) {
    const out = [];
    for (let m = 0; m < 1 << n; m++) {
      const env = [];
      for (let i = 0; i < n; i++) env.push(bitOf(m, i, n));
      for (let i = n; i < 4; i++) env.push(0);
      out.push(evalAst(ast, env));
    }
    return out;
  }
  // 最小项 m 的文字：变量为 1 写原变量，为 0 写反变量；最大项相反
  const mintermLits = (m, n) => VARS.slice(0, n).map((_, i) => ({ v: i, neg: !bitOf(m, i, n) }));
  const maxtermLits = (m, n) => VARS.slice(0, n).map((_, i) => ({ v: i, neg: !!bitOf(m, i, n) }));
  const litsText = (lits) => lits.map((l) => VARS[l.v] + (l.neg ? "'" : "")).join("");

  /* ---------- Quine–McCluskey + 精确最小覆盖 ---------- */
  // 立方体 cube = { v, m }：m 的 1 位为“–”（该变量消去），v 在“–”位上为 0
  const cubeCovers = (c, x) => (x & ~c.m) === c.v;
  function cubeMinterms(c, n) {
    const r = [];
    for (let x = 0; x < 1 << n; x++) if (cubeCovers(c, x)) r.push(x);
    return r;
  }
  const cubeLitCount = (c, n) => n - popcnt(c.m);
  // 乘积项的文字（SOP）
  function cubeLits(c, n) {
    const r = [];
    for (let i = 0; i < n; i++) {
      const b = 1 << (n - 1 - i);
      if (c.m & b) continue;
      r.push({ v: i, neg: !(c.v & b) });
    }
    return r;
  }
  // 和项的文字（POS，对 F' 的立方体取反）
  const cubeSumLits = (c, n) => cubeLits(c, n).map((l) => ({ v: l.v, neg: !l.neg }));
  function cubeDash(c, n) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const b = 1 << (n - 1 - i);
      s += c.m & b ? "–" : c.v & b ? "1" : "0";
    }
    return s;
  }

  function qmPrimes(n, on, dc) {
    let cur = new Map();
    for (const x of new Set([...on, ...dc])) cur.set(x, { v: x, m: 0 });
    const primes = [];
    while (cur.size) {
      const arr = [...cur.values()];
      const used = new Array(arr.length).fill(false);
      const next = new Map();
      // 按“1 的个数”分组，只比较相邻组（经典 QM 表格法）
      const groups = new Map();
      arr.forEach((c, i) => {
        const g = popcnt(c.v);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(i);
      });
      for (const [g, idxs] of groups) {
        const nxt = groups.get(g + 1);
        if (!nxt) continue;
        for (const i of idxs)
          for (const j of nxt) {
            const a = arr[i];
            const b = arr[j];
            if (a.m !== b.m) continue;
            const d = a.v ^ b.v;
            if (d & (d - 1)) continue;
            const c = { v: a.v & ~d, m: a.m | d };
            next.set(c.m * 64 + c.v, c);
            used[i] = used[j] = true;
          }
      }
      arr.forEach((c, i) => !used[i] && primes.push(c));
      cur = next;
    }
    // 排序：大圈在前，再按最小编号
    primes.sort((a, b) => popcnt(b.m) - popcnt(a.m) || cubeMin(a) - cubeMin(b));
    return primes;
  }
  const cubeMin = (c) => c.v;

  // 精确最小覆盖：先取必要质蕴涵项，再分支定界；代价 = (项数, 文字数) 字典序
  function minCover(n, on, primes) {
    const onArr = [...new Set(on)].sort((a, b) => a - b);
    const N = onArr.length;
    if (!N) return { sols: [[]], essentials: [], terms: 0, lits: 0, onArr };
    const FULL = (1 << N) - 1; // N ≤ 16
    const cand = [];
    primes.forEach((p, i) => {
      let cov = 0;
      onArr.forEach((x, k) => cubeCovers(p, x) && (cov |= 1 << k));
      if (cov) cand.push({ i, cov, lits: cubeLitCount(p, n) });
    });
    const coverers = onArr.map((_, k) => cand.filter((c) => (c.cov >> k) & 1));
    const ess = [];
    coverers.forEach((cs) => cs.length === 1 && !ess.includes(cs[0]) && ess.push(cs[0]));
    let bestT = Infinity;
    let bestL = Infinity;
    let sols = new Map();
    function rec(chosen, covered, lits) {
      if (covered === FULL) {
        const t = chosen.length;
        if (t < bestT || (t === bestT && lits < bestL)) {
          bestT = t;
          bestL = lits;
          sols = new Map();
        }
        if (t === bestT && lits === bestL) {
          const key = chosen.map((c) => c.i).sort((a, b) => a - b);
          sols.set(key.join(","), key);
        }
        return;
      }
      if (chosen.length + 1 > bestT) return;
      let bk = -1;
      let bc = Infinity;
      for (let k = 0; k < N; k++)
        if (!((covered >> k) & 1) && coverers[k].length < bc) {
          bc = coverers[k].length;
          bk = k;
        }
      for (const c of coverers[bk]) {
        if (chosen.length + 1 === bestT && lits + c.lits > bestL) continue;
        chosen.push(c);
        rec(chosen, covered | c.cov, lits + c.lits);
        chosen.pop();
      }
    }
    let cov0 = 0;
    let lit0 = 0;
    ess.forEach((c) => {
      cov0 |= c.cov;
      lit0 += c.lits;
    });
    rec(ess.slice(), cov0, lit0);
    return { sols: [...sols.values()], essentials: ess.map((c) => c.i), terms: bestT, lits: bestL, onArr };
  }

  // 求最简与或式（kind="sop"，对 1 格画圈）或最简或与式（kind="pos"，对 0 格画圈）
  function minimize(n, on, dc, kind = "sop") {
    const all = 1 << n;
    const onS = new Set(on);
    const dcS = new Set(dc.filter((x) => !onS.has(x)));
    const off = [];
    for (let x = 0; x < all; x++) if (!onS.has(x) && !dcS.has(x)) off.push(x);
    const target = kind === "sop" ? [...onS].sort((a, b) => a - b) : off;
    const primes = qmPrimes(n, target, [...dcS]);
    const cov = minCover(n, target, primes);
    const sol = cov.sols[0] || [];
    const essSet = new Set(cov.essentials);
    // 显示顺序：必要质蕴涵项在前；同类按圈大小降序、最小编号升序
    const order = sol.slice().sort((a, b) => (essSet.has(b) - essSet.has(a)) || popcnt(primes[b].m) - popcnt(primes[a].m) || primes[a].v - primes[b].v);
    const chosen = order.map((i) => primes[i]);
    // 每个选中圈的说明（逐步模式）
    const steps = [];
    const covered = new Set();
    const tgtSet = new Set(target);
    for (const i of order) {
      const p = primes[i];
      const mins = cubeMinterms(p, n);
      const tg = mins.filter((x) => tgtSet.has(x));
      const newly = tg.filter((x) => !covered.has(x));
      const remainingBefore = target.filter((x) => !covered.has(x));
      let only = [];
      if (essSet.has(i)) only = tg.filter((x) => primes.filter((q) => cubeCovers(q, x)).length === 1);
      newly.forEach((x) => covered.add(x));
      steps.push({ prime: i, cube: p, minterms: mins, cover: tg, newly, essential: essSet.has(i), only, remainingBefore, dcUsed: mins.filter((x) => dcS.has(x)) });
    }
    return {
      n, kind, on: [...onS].sort((a, b) => a - b), dc: [...dcS].sort((a, b) => a - b), off, target,
      primes, essentials: cov.essentials, chosen, order, steps,
      terms: target.length ? cov.terms : 0,
      lits: target.length ? cov.lits : 0,
      nSolutions: cov.sols.length,
      allSolutions: cov.sols,
      // const: 结果恒为 0 / 1 的情形
      constant: kind === "sop" ? (!target.length ? 0 : chosen.length === 1 && chosen[0].m === all - 1 ? 1 : null) : !target.length ? 1 : chosen.length === 1 && chosen[0].m === all - 1 ? 0 : null,
    };
  }
  // 用最简结果求值（验证用）
  function evalMin(res, x) {
    const hit = res.chosen.some((c) => cubeCovers(c, x));
    return res.kind === "sop" ? +hit : +!hit;
  }
  function minText(res) {
    if (res.constant === 0) return "0";
    if (res.constant === 1) return "1";
    if (res.kind === "sop") return res.chosen.map((c) => litsText(cubeLits(c, res.n))).join(" + ");
    return res.chosen.map((c) => "(" + cubeSumLits(c, res.n).map((l) => VARS[l.v] + (l.neg ? "'" : "")).join("+") + ")").join("");
  }

  /* ---------- 卡诺图布局 ---------- */
  const GRAY2 = [0, 1, 3, 2];
  function kmapLayout(n) {
    const rowBits = n === 4 ? 2 : 1;
    const colBits = n - rowBits;
    const codes = (b) => (b === 2 ? GRAY2 : [0, 1]);
    return {
      n, rowBits, colBits,
      rows: codes(rowBits), cols: codes(colBits),
      rowVars: VARS.slice(0, rowBits).join(""),
      colVars: VARS.slice(rowBits, n).join(""),
    };
  }
  const kmapCell = (lay, r, c) => (lay.rows[r] << lay.colBits) | lay.cols[c];
  // 把一个立方体拆成若干矩形段（处理左右 / 上下 / 四角环绕）
  function axisSegs(codes, dashMask, val) {
    const pos = [];
    codes.forEach((code, i) => (code & ~dashMask) === val && pos.push(i));
    const L = codes.length;
    if (pos.length === L) return [{ a: 0, b: L - 1, openA: false, openB: false }];
    if (pos[pos.length - 1] - pos[0] === pos.length - 1) return [{ a: pos[0], b: pos[pos.length - 1], openA: false, openB: false }];
    // 环绕：拆成贴着两侧边缘的两段
    let k = 1;
    while (k < pos.length && pos[k] === pos[k - 1] + 1) k++;
    const head = pos.slice(0, k);
    const tail = pos.slice(k);
    return [
      { a: head[0], b: head[head.length - 1], openA: true, openB: false },
      { a: tail[0], b: tail[tail.length - 1], openA: false, openB: true },
    ];
  }
  function cubeRects(lay, c) {
    const cm = (1 << lay.colBits) - 1;
    const rs = axisSegs(lay.rows, c.m >> lay.colBits, c.v >> lay.colBits);
    const cs = axisSegs(lay.cols, c.m & cm, c.v & cm);
    const out = [];
    for (const r of rs) for (const k of cs) out.push({ r0: r.a, r1: r.b, c0: k.a, c1: k.b, openT: r.openA, openB: r.openB, openL: k.openA, openR: k.openB });
    return out;
  }

  // 解析 “Σm(…) + Σd(…)” / “ΠM(…)” / 纯数字列表
  function parseMinterms(str, n) {
    const s = String(str).trim();
    const N = 1 << n;
    if (!s) return { on: [], dc: [] };
    const isPi = /[Π∏]|prod/i.test(s);
    const grp = [...s.matchAll(/([mMdD])\s*[(（]([^)）]*)[)）]/g)];
    const nums = (t, what) => {
      const parts = t.split(/[\s,，、;；]+/).filter(Boolean);
      return parts.map((p) => {
        const r = p.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
        if (r) return { range: [+r[1], +r[2]] };
        if (!/^\d+$/.test(p)) throw new ExprError(`${what} 里有无法识别的内容「${p}」`, s.indexOf(p));
        return +p;
      }).flatMap((x) => {
        if (typeof x === "number") return [x];
        const out = [];
        for (let k = x.range[0]; k <= x.range[1]; k++) out.push(k);
        return out;
      });
    };
    let list = [];
    let dc = [];
    if (!grp.length) {
      if (/[^\d\s,，、;；\-–~]/.test(s)) throw new ExprError("格式应为 Σm(1,3,5)+Σd(2,7)，或直接写 1,3,5", 0);
      list = nums(s, "列表");
    } else {
      for (const g of grp) {
        const k = g[1];
        if (k === "d" || k === "D") dc = dc.concat(nums(g[2], "Σd(…)"));
        else list = list.concat(nums(g[2], isPi ? "ΠM(…)" : "Σm(…)"));
      }
    }
    for (const x of [...list, ...dc]) if (x >= N) throw new ExprError(`编号 ${x} 超出范围：${n} 变量只有 0–${N - 1}`, s.indexOf(String(x)));
    const ls = new Set(list);
    for (const x of dc) if (ls.has(x)) throw new ExprError(`${x} 同时出现在 ${isPi ? "M" : "m"} 和 d 中`, s.indexOf(String(x)));
    let on = [...ls];
    if (isPi) {
      const ds = new Set(dc);
      on = [];
      for (let x = 0; x < N; x++) if (!ls.has(x) && !ds.has(x)) on.push(x);
    }
    return { on: on.sort((a, b) => a - b), dc: [...new Set(dc)].sort((a, b) => a - b) };
  }

  /* ---------- 74HC138 / 74HC151 ---------- */
  // 138：返回 Y0'..Y7' 的电平（低有效）
  function dec138(addr, g1, g2a, g2b) {
    const en = g1 === 1 && g2a === 0 && g2b === 0;
    return Array.from({ length: 8 }, (_, i) => (en && i === addr ? 0 : 1));
  }
  // 用与非门接 Yi'（i ∈ 最小项集合）：F = NAND(Yi')
  function f138(minterms, addr, g1 = 1, g2a = 0, g2b = 0) {
    if (!minterms.length) return 0;
    const y = dec138(addr, g1, g2a, g2b);
    return minterms.every((i) => y[i] === 1) ? 0 : 1;
  }
  // 151 降维：truth 为 16 行（A 最高位，D 最低位）。地址 A2A1A0 = ABC，D 作数据输入
  function reduce151(truth) {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const f0 = truth[2 * i];
      const f1 = truth[2 * i + 1];
      out.push(f0 === f1 ? String(f0) : f1 ? "D" : "D'");
    }
    return out;
  }
  const diVal = (code, d) => (code === "0" ? 0 : code === "1" ? 1 : code === "D" ? d : 1 - d);
  // 151：Y = S'=0 时选中 D_addr；S'=1 时 Y=0
  const eval151 = (codes, addr, d = 0, sN = 0) => (sN ? 0 : diVal(codes[addr], d));

  /* ---------- 七段码（共阴，1=亮；顺序 a b c d e f g） ---------- */
  const SEG7 = [
    "1111110", "0110000", "1101101", "1111001", "0110011",
    "1011011", "1011111", "1110000", "1111111", "1111011",
    "1110111", "0011111", "1001110", "0111101", "1001111", "1000111", // A b C d E F（十六进制字形）
  ].map((s) => s.split("").map(Number));
  // 不带尾巴的 6、9（部分译码芯片的字形）
  const SEG7_NOTAIL = { 6: [0, 0, 1, 1, 1, 1, 1], 9: [1, 1, 1, 0, 0, 1, 1] };
  // 4511 行为：LT'=0 全亮（优先）；BI'=0 消隐；输入 10–15 消隐
  function seg4511(bcd, ltN = 1, biN = 1, tails = true) {
    if (!ltN) return [1, 1, 1, 1, 1, 1, 1];
    if (!biN || bcd > 9) return [0, 0, 0, 0, 0, 0, 0];
    if (!tails && SEG7_NOTAIL[bcd]) return SEG7_NOTAIL[bcd].slice();
    return SEG7[bcd].slice();
  }

  /* ---------- 同步计数器（74x160 / 74x161） ---------- */
  // 十进制：9 → 0；为简化，非法状态 10–15 也直接回到 0
  const counterNext = (s, mod) => (mod === 10 ? (s >= 9 ? 0 : s + 1) : (s + 1) & 15);
  const counterCO = (s, mod) => (mod === 10 ? (s >> 3) & s & 1 : +(s === 15));
  function counterSeq(start, mod, len) {
    const r = [];
    let s = start;
    for (let i = 0; i < len; i++) {
      r.push({ s, q: [s & 1, (s >> 1) & 1, (s >> 2) & 1, (s >> 3) & 1], co: counterCO(s, mod) });
      s = counterNext(s, mod);
    }
    return r;
  }

  const LogicA = {
    VARS, popcnt, toBin,
    toSigned, fromSigned, signCodes, bin2gray, gray2bin, toBCD, fromBCD, divSteps, addTwos,
    ExprError, tokenize, parseExpr, evalAst, maxVar, truthTable, bitOf, mintermLits, maxtermLits, litsText,
    cubeCovers, cubeMinterms, cubeLits, cubeSumLits, cubeLitCount, cubeDash, qmPrimes, minCover, minimize, evalMin, minText,
    kmapLayout, kmapCell, cubeRects, parseMinterms,
    dec138, f138, reduce151, diVal, eval151,
    SEG7, SEG7_NOTAIL, seg4511,
    counterNext, counterCO, counterSeq,
  };

  /* =====================================================================
   * 第 2 部分：实验（DOM）
   * ===================================================================== */
  function registerAll(Labs) {
    const X = LogicA;
    const esc = Labs.esc;
    const PI = Math.PI;

    /* ---------- 通用小工具 ---------- */
    const $h = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    };
    function rgba(c, a) {
      c = String(c || "").trim();
      let m = c.match(/^#([0-9a-f]{3})$/i);
      if (m) c = "#" + m[1].split("").map((d) => d + d).join("");
      m = c.match(/^#([0-9a-f]{6})/i);
      if (m) {
        const v = parseInt(m[1], 16);
        return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
      }
      m = c.match(/^rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(",").map((s) => s.trim());
        return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
      }
      return c;
    }
    const cssv = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
    function rr(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function setFont(L, ctx, size, weight = 400, font = "mono") {
      ctx.font = `${weight} ${size}px ${L.FONT[font] || font}`;
    }
    // 文字放不下时自动缩小（不低于 8px）
    function fitTxt(L, ctx, s, x, y, maxW, o = {}) {
      let size = o.size || 12;
      setFont(L, ctx, size, o.weight, o.font);
      while (size > 8 && ctx.measureText(s).width > maxW) {
        size -= 0.5;
        setFont(L, ctx, size, o.weight, o.font);
      }
      L.txt(ctx, s, x, y, Object.assign({}, o, { size }));
      return size;
    }
    // 带上划线的文字（低有效引脚名）：s 为主体，sub 为下标
    function ovTxt(L, ctx, s, x, y, o = {}) {
      const size = o.size || 11;
      setFont(L, ctx, size, o.weight, o.font);
      const w = ctx.measureText(s).width;
      L.txt(ctx, s, x, y, o);
      const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
      ctx.strokeStyle = o.color || L.COL.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y - size * 0.68);
      ctx.lineTo(x0 + w, y - size * 0.68);
      ctx.stroke();
      return w;
    }
    function pin(L, ctx, x, y, v, { r = 10, on = L.COL.hi, size = 11 } = {}) {
      const C = L.COL;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * PI);
      ctx.fillStyle = v ? on : cssv("--card", "#f8f6f0");
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = v ? on : C.ink;
      ctx.stroke();
      L.txt(ctx, String(v), x, y + 0.5, { size, color: v ? "#fff" : C.ink, align: "center", weight: 600 });
    }
    const ov = (s) => `<span class="la-ov">${s}</span>`;
    const litHTML = (l) => (l.neg ? ov(X.VARS[l.v]) : X.VARS[l.v]);
    const prodHTML = (lits) => (lits.length ? lits.map(litHTML).join("") : "1");
    const sumHTML = (lits) => (!lits.length ? "0" : lits.length === 1 ? litHTML(lits[0]) : "(" + lits.map(litHTML).join("+") + ")");
    function minHTML(res) {
      if (res.constant === 0) return "0";
      if (res.constant === 1) return "1";
      if (res.kind === "sop") return res.chosen.map((c) => prodHTML(X.cubeLits(c, res.n))).join(" + ");
      return res.chosen.map((c) => sumHTML(X.cubeSumLits(c, res.n))).join("");
    }
    const cubeHTML = (c, n, kind) => (kind === "sop" ? prodHTML(X.cubeLits(c, n)) : sumHTML(X.cubeSumLits(c, n)));
    const mList = (arr, p = "m") => (arr.length ? arr.map((x) => p + x).join(", ") : "—");
    function sec(parent, title, cls = "") {
      const s = $h("section", "la-sec " + cls);
      if (title) s.append($h("h4", "la-h", title));
      parent.append(s);
      return s;
    }
    function textField(parent, { label, value = "", placeholder = "", onInput, onEnter }) {
      const wrap = $h("label", "ctl la-field");
      wrap.append($h("span", "ctl-name", esc(label)));
      const inp = document.createElement("input");
      inp.className = "ctl-input la-input";
      inp.type = "text";
      inp.value = value;
      inp.placeholder = placeholder;
      inp.spellcheck = false;
      inp.autocomplete = "off";
      inp.setAttribute("autocapitalize", "off");
      inp.addEventListener("input", () => onInput && onInput(inp.value));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onEnter && onEnter(inp.value);
      });
      wrap.append(inp);
      parent.append(wrap);
      return { el: wrap, inp, get: () => inp.value, set: (v) => (inp.value = v) };
    }
    function subhead(parent, text) {
      const d = $h("div", "la-ctl-h", esc(text));
      parent.append(d);
      return d;
    }
    function errBox(src, e) {
      const pos = Math.max(0, Math.min(e.pos || 0, src.length));
      return `<div class="la-err" role="alert"><b>输入有误：</b>${esc(e.message)}<pre>${esc(src) || " "}\n${" ".repeat(pos)}^ 第 ${pos + 1} 个字符</pre></div>`;
    }
    function canvasXY(cvs, e) {
      const r = cvs.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    let pendingKmap = null; // 逻辑函数实验 → 卡诺图实验 的传递

    /* =================================================================
     * 0. 首屏：逻辑分析仪（同步计数器 74x160 / 74x161）
     * ================================================================= */
    Labs.setHero((el, L) => {
      const C = L.COL;
      let cvs = el;
      if (!el || el.tagName !== "CANVAS") {
        cvs = document.createElement("canvas");
        cvs.className = "la-hero-cvs";
        el.append(cvs);
      }
      const ctx = cvs.getContext("2d");
      let W = 0;
      let H = 0;
      const P = 0.9; // 每个时钟周期（秒）
      const TPD = 0.05; // 示意的传输延迟（周期的比例）
      let mode = 10;
      let t = 3.62 * P; // 起始时刻，保证首帧就能看到 CO 脉冲
      const hist = new Map([[0, { s: 0, mod: 10 }]]);
      let kMin = 0;
      let kMax = 0;
      function stateAt(k) {
        if (k < kMin) {
          const s0 = hist.get(kMin);
          if (s0.mod === 10) return { s: (((s0.s - (kMin - k)) % 10) + 10) % 10, mod: 10 };
          return { s: (((s0.s - (kMin - k)) % 16) + 16) % 16, mod: 16 };
        }
        while (kMax < k) {
          const prev = hist.get(kMax);
          kMax++;
          hist.set(kMax, { s: X.counterNext(prev.s, mode), mod: mode });
        }
        return hist.get(k);
      }
      const caption = document.getElementById("heroCaption");
      function setCaption() {
        if (!caption) return;
        caption.textContent =
          mode === 10
            ? "背景：同步十进制计数器 74x160 的实时波形——每个 CLK 上升沿 Q3Q2Q1Q0 加 1，计到 9 时进位 CO = Q3·Q0 = 1。点击画面切换为十六进制 74x161。"
            : "背景：同步十六进制计数器 74x161 的实时波形——每个 CLK 上升沿 Q3Q2Q1Q0 加 1，计到 15 时进位 CO = Q3Q2Q1Q0 = 1。点击画面切换回十进制 74x160。";
      }
      // 七段数码管
      function seg7(x, y, w, h, segs, on, off, glow) {
        const th = w * 0.17;
        const g = th * 0.16;
        const hl = w - th; // 横段长度（含尖角）
        const vl = (h - th) / 2;
        const hseg = (cx, cy) => {
          ctx.beginPath();
          ctx.moveTo(cx - hl / 2 + g, cy);
          ctx.lineTo(cx - hl / 2 + th / 2 + g, cy - th / 2);
          ctx.lineTo(cx + hl / 2 - th / 2 - g, cy - th / 2);
          ctx.lineTo(cx + hl / 2 - g, cy);
          ctx.lineTo(cx + hl / 2 - th / 2 - g, cy + th / 2);
          ctx.lineTo(cx - hl / 2 + th / 2 + g, cy + th / 2);
          ctx.closePath();
        };
        const vseg = (cx, cy) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - vl / 2 + g);
          ctx.lineTo(cx + th / 2, cy - vl / 2 + th / 2 + g);
          ctx.lineTo(cx + th / 2, cy + vl / 2 - th / 2 - g);
          ctx.lineTo(cx, cy + vl / 2 - g);
          ctx.lineTo(cx - th / 2, cy + vl / 2 - th / 2 - g);
          ctx.lineTo(cx - th / 2, cy - vl / 2 + th / 2 + g);
          ctx.closePath();
        };
        const L0 = x + th / 2;
        const R0 = x + w - th / 2;
        const T0 = y + th / 2;
        const M0 = y + h / 2;
        const B0 = y + h - th / 2;
        const cx = x + w / 2;
        const paths = [
          () => hseg(cx, T0), // a
          () => vseg(R0, (T0 + M0) / 2), // b
          () => vseg(R0, (M0 + B0) / 2), // c
          () => hseg(cx, B0), // d
          () => vseg(L0, (M0 + B0) / 2), // e
          () => vseg(L0, (T0 + M0) / 2), // f
          () => hseg(cx, M0), // g
        ];
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.transform(1, 0, -0.07, 1, 0, 0);
        ctx.translate(-(x + w / 2), -(y + h / 2));
        paths.forEach((p, i) => {
          p();
          if (segs[i]) {
            ctx.shadowColor = glow ? on : "transparent";
            ctx.shadowBlur = glow ? 18 : 0;
            ctx.fillStyle = on;
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = off;
          }
          ctx.fill();
        });
        ctx.restore();
      }
      function draw() {
        if (!W || !H) return;
        L.readColors && L.readColors();
        const wide = W >= 860;
        ctx.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.scr;
        ctx.fillRect(0, 0, W, H);
        const kNow = Math.floor(t / P);
        stateAt(kNow + 1);
        // 清理过旧的历史
        while (kMin < kNow - 120) {
          hist.delete(kMin);
          kMin++;
        }
        let segW, segH, segX, segY, x1, labelX, xb, xg, rowH, yTop;
        if (wide) {
          const padR = L.clamp(W * 0.045, 28, 72);
          segW = L.clamp(W * 0.115, 110, 180);
          segH = segW * 1.72;
          segX = W - padR - segW;
          x1 = segX - L.clamp(W * 0.045, 44, 76);
          labelX = W * 0.56;
          xb = labelX + 50;
          xg = W * 0.2;
          rowH = L.clamp(H * 0.082, 40, 62);
          yTop = H * 0.5 - rowH * 3 - 6;
          segY = yTop + rowH * 3 - segH / 2;
        } else {
          rowH = L.clamp(H * 0.07, 30, 46);
          yTop = H * 0.56 - rowH * 3;
          labelX = 14;
          xb = 58;
          xg = xb;
          x1 = W - 16;
          segW = L.clamp(W * 0.2, 60, 110);
          segH = segW * 1.72;
          segX = W - segW - 18;
          segY = Math.max(70, yTop - segH - 30);
        }
        const pxc = (x1 - xb) / (wide ? 8.5 : 6.5); // 每周期像素
        const xOf = (tt) => x1 - ((t - tt) / P) * pxc;
        const tA = t - ((x1 - xg) / pxc) * P;
        const kA = Math.floor(tA / P) - 1;
        const base = wide ? 1 : 0.32;
        const fadeGrad = (col, a = 1) => {
          if (!wide) return rgba(col, a);
          const g = ctx.createLinearGradient(xg, 0, labelX, 0);
          g.addColorStop(0, rgba(col, 0));
          g.addColorStop(1, rgba(col, a));
          return g;
        };
        ctx.globalAlpha = base;
        // 网格基线
        ctx.lineWidth = 1;
        for (let ch = 0; ch < 6; ch++) {
          const y = yTop + rowH * (ch + 0.5);
          ctx.strokeStyle = fadeGrad(C.scrGrid, 1);
          ctx.beginPath();
          ctx.moveTo(xg, y + rowH * 0.23);
          ctx.lineTo(x1, y + rowH * 0.23);
          ctx.stroke();
        }
        // CLK 上升沿参考线（极淡）
        ctx.strokeStyle = fadeGrad(C.trace, 0.09);
        ctx.beginPath();
        for (let k = kA; k <= kNow; k++) {
          const x = xOf(k * P);
          if (x < xg || x > x1) continue;
          ctx.moveTo(x, yTop - 4);
          ctx.lineTo(x, yTop + rowH * 6 + 4);
        }
        ctx.stroke();
        // 波形
        const chans = [
          { name: "CLK", col: C.clk, clk: true },
          { name: "Q0", col: C.trace, f: (st) => st.s & 1 },
          { name: "Q1", col: C.trace, f: (st) => (st.s >> 1) & 1 },
          { name: "Q2", col: C.trace, f: (st) => (st.s >> 2) & 1 },
          { name: "Q3", col: C.trace, f: (st) => (st.s >> 3) & 1 },
          { name: "CO", col: C.hi, f: (st) => X.counterCO(st.s, st.mod) },
        ];
        const nowState = stateAt(t - kNow * P >= TPD * P ? kNow : kNow - 1);
        chans.forEach((chn, ch) => {
          const y = yTop + rowH * (ch + 0.5);
          const amp = rowH * 0.23;
          const segs = [];
          for (let k = kA; k <= kNow; k++) {
            if (chn.clk) {
              segs.push([k * P, k * P + P / 2, 1], [k * P + P / 2, (k + 1) * P, 0]);
            } else segs.push([k * P + TPD * P, (k + 1) * P + TPD * P, chn.f(stateAt(k))]);
          }
          if (!chn.clk) segs.unshift([(kA - 1) * P, kA * P + TPD * P, chn.f(stateAt(kA - 1))]);
          ctx.beginPath();
          let started = false;
          let prevY = null;
          for (const [a, b, v] of segs) {
            const ta = Math.max(a, tA);
            const tb = Math.min(b, t);
            if (tb <= ta) continue;
            const yy = v ? y - amp : y + amp;
            const xa = xOf(ta);
            const xb2 = xOf(tb);
            if (!started) {
              ctx.moveTo(xa, yy);
              started = true;
            } else if (prevY !== yy) ctx.lineTo(xa, yy);
            ctx.lineTo(xb2, yy);
            prevY = yy;
          }
          ctx.strokeStyle = fadeGrad(chn.col, 1);
          ctx.lineWidth = 1.7;
          ctx.lineJoin = "miter";
          ctx.shadowColor = chn.col;
          ctx.shadowBlur = wide ? 7 : 0;
          ctx.stroke();
          ctx.shadowBlur = 0;
          // 标签（带底色块，遮住下面的波形）
          if (wide) {
            ctx.fillStyle = C.scr;
            ctx.fillRect(labelX - 8, y - rowH / 2 + 3, 50, rowH - 6);
            L.txt(ctx, chn.name, labelX, y, { size: 11, color: chn.clk ? C.clk : chn.name === "CO" ? C.hi : rgba(C.scrInk, 0.82) });
            // 当前电平
            const v = chn.clk ? +(t - kNow * P < P / 2) : chn.f(nowState);
            L.txt(ctx, String(v), x1 + 12, y, { size: 11, color: v ? chn.col : C.scrDim });
          } else {
            L.txt(ctx, chn.name, labelX, y, { size: 10, color: rgba(C.scrInk, 0.7) });
          }
        });
        // “现在”光标
        ctx.strokeStyle = rgba(C.scrInk, 0.25);
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yTop - 6);
        ctx.lineTo(x1, yTop + rowH * 6 + 6);
        ctx.stroke();
        ctx.setLineDash([]);
        // 七段数码管
        const s = nowState.s;
        const glyph = nowState.mod === 10 && s > 9 ? X.SEG7[0].map(() => 0) : X.SEG7[s];
        ctx.fillStyle = rgba(C.scrInk, wide ? 0.03 : 0.02);
        rr(ctx, segX - segW * 0.14, segY - segW * 0.14, segW * 1.28, segH + segW * 0.28, 10);
        ctx.fill();
        seg7(segX, segY, segW, segH, glyph, C.trace, rgba(C.scrInk, 0.06), wide);
        if (wide) {
          const cx = segX + segW / 2;
          const maxW = segW * 1.28 + 20;
          fitTxt(L, ctx, mode === 10 ? "DEC · 74x160 · mod 10" : "HEX · 74x161 · mod 16", cx, segY - segW * 0.3, maxW, { size: 11, color: rgba(C.scrInk, 0.85), align: "center" });
          const q = X.toBin(s, 4);
          fitTxt(L, ctx, `Q3Q2Q1Q0 = ${q}`, cx, segY + segH + segW * 0.3, maxW, { size: 11, color: rgba(C.scrInk, 0.75), align: "center" });
          const co = X.counterCO(s, nowState.mod);
          fitTxt(L, ctx, (nowState.mod === 10 ? "CO = Q3·Q0 = " : "CO = Q3Q2Q1Q0 = ") + co, cx, segY + segH + segW * 0.3 + 20, maxW, { size: 11, color: co ? C.hi : C.scrDim, align: "center" });
          // 波形区标题与提示
          const avail = x1 - labelX + 20;
          fitTxt(L, ctx, "LOGIC ANALYZER · 6 CH · 同步计数器", labelX - 8, yTop - 22, avail, { size: 11, color: rgba(C.scrInk, 0.6) });
          fitTxt(L, ctx, mode === 10 ? "点击画面：切换到十六进制（74x161）" : "点击画面：切换回十进制（74x160）", labelX - 8, yTop + rowH * 6 + 22, avail, { size: 11, color: C.scrDim });
        }
        ctx.globalAlpha = 1;
      }
      function resize() {
        const w = cvs.clientWidth || (cvs.parentElement && cvs.parentElement.clientWidth) || 0;
        const hh = cvs.clientHeight || (cvs.parentElement && cvs.parentElement.clientHeight) || 0;
        if (!w || !hh) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        W = w;
        H = hh;
        cvs.width = Math.round(W * dpr);
        cvs.height = Math.round(H * dpr);
        draw();
      }
      // 动画循环：离屏 / 页面隐藏 / 减少动态效果 时不跑
      let raf = 0;
      let last = 0;
      let onScreen = true;
      function tick(now) {
        raf = 0;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        t += dt;
        draw();
        schedule();
      }
      function schedule() {
        if (raf || L.reduceMotion || !onScreen || document.hidden) return;
        last = 0;
        raf = requestAnimationFrame((now) => {
          last = now;
          raf = requestAnimationFrame(tick);
        });
      }
      new ResizeObserver(resize).observe(cvs);
      if ("IntersectionObserver" in window)
        new IntersectionObserver((en) => {
          onScreen = en.some((e) => e.isIntersecting);
          if (onScreen) schedule();
        }).observe(cvs);
      document.addEventListener("visibilitychange", () => !document.hidden && schedule());
      cvs.addEventListener("click", () => {
        mode = mode === 10 ? 16 : 10;
        setCaption();
        draw();
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      setCaption();
      resize();
      schedule();
    });

    /* =================================================================
     * 1. 进制与编码
     * ================================================================= */
    Labs.register("radix", {
      title: "进制与编码",
      desc: "同一串 8 位 0/1，按不同规则去读就是不同的数。拨位开关（或点画布上的位、拖十进制滑块），先猜它的补码真值和格雷码，再看结果。下方还有除 2 取余和补码加法溢出。",
      note: String.raw`补码真值 $=-b_7\cdot 2^7+\sum_{i=0}^{6} b_i 2^i$；格雷码 $g_7=b_7,\ g_i=b_{i+1}\oplus b_i$，即 $g=b\oplus(b\gg 1)$。补码加法溢出 $V=C_n\oplus C_{n-1}$（$C_n$ 为最高位向外的进位，$C_{n-1}$ 为次高位向最高位的进位），等价于“同号相加、结果异号”。`,
      make({ canvas, controls, readouts, L }) {
        const C = L.COL;
        let u = 0b10011011;
        const bitsArr = (x) => X.toBin(x, 8).split("").map(Number);
        // ---- 控件 ----
        const bitsCtl = L.bits(controls, { label: "8 位二进制 b7…b0", n: 8, value: bitsArr(u), names: ["b7", "b6", "b5", "b4", "b3", "b2", "b1", "b0"], onChange: (v) => setU(parseInt(v.join(""), 2), "bits") });
        const decSl = L.slider(controls, { label: "十进制输入（0–255，无符号）", min: 0, max: 255, value: u, onInput: (v) => setU(v, "slider") });
        const r1 = L.row(controls);
        L.button(r1, { label: "逐位取反", onClick: () => setU(~u & 255) });
        L.button(r1, { label: "+1", onClick: () => setU((u + 1) & 255) });
        L.button(r1, { label: "求 −x（取反加一）", onClick: () => setU(X.fromSigned(-X.toSigned(u, 8), 8)) });
        const r2 = L.row(controls);
        [["0", 0], ["127", 127], ["−1", 255], ["−128", 128], ["99", 99]].forEach(([t, v]) => L.button(r2, { label: t, onClick: () => setU(v) }));
        subhead(controls, "补码加法实验");
        let addN = 4;
        let ax = 5;
        let ay = 4;
        const wSeg = L.seg(controls, {
          label: "位宽",
          options: [
            { v: "4", t: "4 位（−8…7）" },
            { v: "8", t: "8 位（−128…127）" },
          ],
          value: "4",
          onChange: (v) => {
            addN = +v;
            if (addN === 4) [ax, ay] = [5, 4];
            else [ax, ay] = [100, 50];
            buildAddSliders();
            renderAdd();
          },
        });
        void wSeg;
        const addBox = $h("div", "la-ctlgroup");
        controls.append(addBox);
        function buildAddSliders() {
          addBox.innerHTML = "";
          const lo = -(1 << (addN - 1));
          const hi = (1 << (addN - 1)) - 1;
          const fmt = (v) => (v > 0 ? "+" + v : v < 0 ? "−" + -v : "0");
          L.slider(addBox, { label: "X", min: lo, max: hi, value: ax, fmt, onInput: (v) => ((ax = v), renderAdd()) });
          L.slider(addBox, { label: "Y", min: lo, max: hi, value: ay, fmt, onInput: (v) => ((ay = v), renderAdd()) });
        }
        buildAddSliders();

        // ---- 位视图（含格雷码异或过程） ----
        let geo = null;
        const hOf = (W) => {
          const cw = Math.min(54, (W - 24 - (W < 480 ? 50 : 70)) / 8);
          const bh = Math.min(34, cw - 4);
          return 34 + bh + 60 + bh + 40;
        };
        const st = L.stage(canvas, {
          height: hOf,
          draw(ctx, W, H) {
            const labW = W < 480 ? 50 : 70;
            const cw = Math.min(54, (W - 24 - labW) / 8);
            const box = cw - Math.max(3, cw * 0.12);
            const bh = Math.min(34, cw - 4);
            const x0 = 12 + labW + (W - 24 - labW - 8 * cw) / 2;
            const cx = (j) => x0 + j * cw + cw / 2;
            const yI = 11;
            const yW = 25;
            const yB = 34;
            const yX = yB + bh + 30;
            const yG = yX + 30;
            const yF = yG + bh + 22;
            const b = bitsArr(u);
            const gv = X.bin2gray(u);
            const g = X.toBin(gv, 8).split("").map(Number);
            const fs = Math.max(9, Math.min(11, cw * 0.27));
            L.txt(ctx, "位 / 权", 12, yI + 7, { size: 10, color: C.ink3, font: "sans" });
            for (let j = 0; j < 8; j++) {
              L.txt(ctx, "b" + (7 - j), cx(j), yI, { size: fs - 1, color: C.ink3, align: "center" });
              L.txt(ctx, String(1 << (7 - j)), cx(j), yW, { size: fs, color: C.ink2, align: "center" });
            }
            L.txt(ctx, "二进制 b", 12, yB + bh / 2, { size: 11, color: C.ink, font: "sans", weight: 600 });
            L.txt(ctx, "格雷码 g", 12, yG + bh / 2, { size: 11, color: C.ink, font: "sans", weight: 600 });
            // 异或连线
            for (let j = 0; j < 8; j++) {
              const i = 7 - j;
              const gi = g[j];
              const col = gi ? C.hi : C.ink3;
              ctx.lineWidth = gi ? 1.8 : 1.2;
              ctx.strokeStyle = col;
              if (j === 0) {
                ctx.beginPath();
                ctx.moveTo(cx(0), yB + bh);
                ctx.lineTo(cx(0), yG);
                ctx.stroke();
                L.txt(ctx, "照抄", cx(0) - 6, yX, { size: 10, color: C.ink3, align: "right", font: "sans" });
                continue;
              }
              const r = Math.min(7, cw * 0.18);
              ctx.beginPath();
              ctx.moveTo(cx(j), yB + bh);
              ctx.lineTo(cx(j), yX - r);
              ctx.moveTo(cx(j - 1), yB + bh);
              ctx.lineTo(cx(j) - r * 0.72, yX - r * 0.72);
              ctx.moveTo(cx(j), yX + r);
              ctx.lineTo(cx(j), yG);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(cx(j), yX, r, 0, 2 * PI);
              ctx.fillStyle = cssv("--card", "#f8f6f0");
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(cx(j) - r, yX);
              ctx.lineTo(cx(j) + r, yX);
              ctx.moveTo(cx(j), yX - r);
              ctx.lineTo(cx(j), yX + r);
              ctx.stroke();
              void i;
            }
            // 位框
            const drawBox = (j, y, v, onCol) => {
              rr(ctx, cx(j) - box / 2, y, box, bh, 4);
              ctx.fillStyle = v ? onCol : cssv("--card", "#f8f6f0");
              ctx.fill();
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = v ? onCol : C.rule;
              ctx.stroke();
              L.txt(ctx, String(v), cx(j), y + bh / 2 + 1, { size: Math.min(16, bh * 0.5), color: v ? "#fff" : C.ink2, align: "center", weight: 600 });
            };
            for (let j = 0; j < 8; j++) {
              drawBox(j, yB, b[j], C.hi);
              drawBox(j, yG, g[j], C.data);
            }
            fitTxt(L, ctx, `g = b ⊕ (b≫1) = ${X.toBin(u, 8)} ⊕ ${X.toBin(u >> 1, 8)} = ${X.toBin(gv, 8)}`, W / 2, yF, W - 24, { size: 11, color: C.ink2, align: "center" });
            geo = { x0, cw, yB, bh };
            void H;
          },
        });
        st.el.classList.add("la-click");
        st.cvs.addEventListener("click", (e) => {
          if (!geo) return;
          const { x, y } = canvasXY(st.cvs, e);
          const j = Math.floor((x - geo.x0) / geo.cw);
          if (j < 0 || j > 7 || y < geo.yB - 4 || y > geo.yB + geo.bh + 4) return;
          setU(u ^ (1 << (7 - j)));
        });

        // ---- 读法表 ----
        const sRead = sec(canvas, "同一串位的几种读法");
        const readBox = $h("div", "la-scroll");
        sRead.append(readBox);
        const sCode = sec(canvas, "原码 · 反码 · 补码（8 位，最高位为符号位）");
        const codeBox = $h("div", "la-scroll");
        const codeNote = $h("p", "la-p");
        sCode.append(codeBox, codeNote);
        const sDiv = sec(canvas, "十进制 → 二进制：除 2 取余，余数自下而上读");
        const divBox = $h("div", "la-scroll");
        sDiv.append(divBox);
        const sAdd = sec(canvas, "补码加法与溢出");
        const addBoxL = $h("div", "la-scroll");
        const addNote = $h("p", "la-p");
        sAdd.append(addBoxL, addNote);

        const roU = L.readout(readouts, "无符号");
        const roS = L.readout(readouts, "补码真值");
        const roH = L.readout(readouts, "十六进制");
        const roG = L.readout(readouts, "格雷码");
        const roV = L.readout(readouts, "加法溢出 V");

        const sb = (s) => (s == null ? `<span class="la-dim">无法表示</span>` : `<span class="la-sb">${s[0]}</span>${s.slice(1)}`);
        const grp = (s, k) => {
          const out = [];
          for (let i = s.length; i > 0; i -= k) out.unshift(s.slice(Math.max(0, i - k), i));
          return out;
        };
        function renderRead() {
          const bs = X.toBin(u, 8);
          const v = X.toSigned(u, 8);
          const o3 = grp(bs, 3);
          const h4 = grp(bs, 4);
          const g = X.toBin(X.bin2gray(u), 8);
          const terms = [];
          for (let i = 7; i >= 0; i--) if ((u >> i) & 1) terms.push(String(1 << i));
          const sTerms = [];
          if (u & 128) sTerms.push("−128");
          for (let i = 6; i >= 0; i--) if ((u >> i) & 1) sTerms.push(String(1 << i));
          let bcd;
          if (u <= 99) {
            const d = X.toBCD(u).map((x) => x);
            const two = (u < 10 ? ["0000"] : []).concat(d);
            bcd = `<span class="la-mono">${two.join(" ")}</span> <span class="la-dim">（${String(u).padStart(2, "0").split("").join(" ")} 各占 4 位）</span>`;
          } else bcd = `<span class="la-bad">超出两位 BCD 的范围 0–99</span> <span class="la-dim">（三位 BCD 为 ${X.toBCD(u).join(" ")}，需 12 位）</span>`;
          readBox.innerHTML = `<table class="tt la-kv"><tbody>
            <tr><th>无符号十进制</th><td><span class="la-mono">${terms.join(" + ") || "0"} = <b>${u}</b></span></td></tr>
            <tr><th>补码（有符号）</th><td><span class="la-mono">${sTerms.join(" + ").replace(/\+ −/g, "− ") || "0"} = <b>${v < 0 ? "−" + -v : v}</b></span>${u & 128 ? ` <span class="la-dim">（b7 的权是 −128）</span>` : ""}</td></tr>
            <tr><th>八进制</th><td><span class="la-mono">${o3.join(" ")} → ${o3.map((x) => parseInt(x, 2)).join(" ")} = <b>(${u.toString(8)})₈</b></span> <span class="la-dim">（从低位起每 3 位一组）</span></td></tr>
            <tr><th>十六进制</th><td><span class="la-mono">${h4.join(" ")} → ${h4.map((x) => parseInt(x, 2).toString(16).toUpperCase()).join(" ")} = <b>0x${u.toString(16).toUpperCase().padStart(2, "0")}</b></span> <span class="la-dim">（每 4 位一组）</span></td></tr>
            <tr><th>8421 BCD</th><td>${u <= 99 ? `十进制 ${u} → ` : ""}${bcd}</td></tr>
            <tr><th>格雷码</th><td><span class="la-mono"><b>${g}</b></span> <span class="la-dim">（回到二进制：$b_7=g_7$，$b_i=b_{i+1}\\oplus g_i$）</span></td></tr>
          </tbody></table>`;
          L.renderMath(readBox);
          // 原码 / 反码 / 补码
          const mag = Math.abs(v);
          const pos = X.signCodes(0, mag, 8);
          const neg = X.signCodes(1, mag, 8);
          const curNeg = v < 0;
          codeBox.innerHTML = `<table class="tt la-codes"><thead><tr><th>真值</th><th>原码</th><th>反码</th><th>补码</th></tr></thead><tbody>
            <tr class="${!curNeg ? "cur" : ""}"><td>+${mag}</td><td>${sb(pos.orig)}</td><td>${sb(pos.ones)}</td><td>${sb(pos.twos)}</td></tr>
            <tr class="${curNeg ? "cur" : ""}"><td>−${mag}</td><td>${sb(neg.orig)}</td><td>${sb(neg.ones)}</td><td>${sb(neg.twos)}</td></tr>
          </tbody></table>`;
          let t;
          if (mag === 128) t = "当前位串 1000 0000 按补码读是 −128。8 位原码和反码的数值位只有 7 位，最大只能表示 ±127，所以 −128 只有补码、没有原码和反码；+128 在 8 位补码里也表示不了。";
          else if (mag === 0) t = "0 的特例：原码和反码都有“+0”和“−0”两种写法（00000000 / 10000000，00000000 / 11111111），补码只有一个 0（−0 的反码加 1 进位溢出被丢掉）。这正是补码能多表示一个 −128 的原因。";
          else if (!curNeg) t = `正数 +${mag}：原码、反码、补码三者相同（高亮行）。对比下一行 −${mag}：原码只把符号位改成 1；反码 = 原码的数值位逐位取反；补码 = 反码 + 1 = 2⁸ − ${mag} = ${256 - mag}。`;
          else t = `负数 −${mag}（高亮行）：原码 = 符号位 1 + ${mag} 的 7 位二进制；反码 = 原码的数值位逐位取反（符号位不动）；补码 = 反码 + 1 = 2⁸ − ${mag} = ${256 - mag}，也就是当前拨码的无符号值。上一行 +${mag} 的三种码都相同。`;
          codeNote.textContent = t;
          // 除 2 取余
          const steps = X.divSteps(u);
          divBox.innerHTML = `<table class="tt la-div"><thead><tr><th>被除数</th><th>÷ 2 = 商</th><th>余数</th><th>得到</th></tr></thead><tbody>
            ${steps.map((s, k) => `<tr><td>${s.n}</td><td>${s.q}</td><td class="${s.r ? "on" : ""}">${s.r}</td><td>b${k}${k === steps.length - 1 ? " ↑" : ""}</td></tr>`).join("")}
          </tbody></table>
          <p class="la-p">商为 0 时停止。余数<b>自下而上</b>读：(${u})₁₀ = (<span class="la-mono">${steps.map((s) => s.r).reverse().join("")}</span>)₂${steps.length < 8 ? `，高位补 0 成 8 位：<span class="la-mono">${X.toBin(u, 8)}</span>` : ""}。</p>`;
          roU.textContent;
          roU(String(u));
          roS(v < 0 ? "−" + -v : String(v));
          roH("0x" + u.toString(16).toUpperCase().padStart(2, "0"));
          roG(g);
        }
        function renderAdd() {
          const n = addN;
          const r = X.addTwos(ax, ay, n);
          const xb = X.toBin(r.ux, n);
          const yb = X.toBin(r.uy, n);
          const sb2 = X.toBin(r.sum, n);
          const fmt = (v) => (v > 0 ? "+" + v : v < 0 ? "−" + -v : "0");
          const cells = (s, cls = () => "") => s.split("").map((c, j) => `<td class="${cls(j, c)}">${c}</td>`).join("");
          // 进位行：列 n 为 C_n，第 i 位上方写进入该位的进位 C_i
          let carry = `<td class="la-cy ${r.overflow ? "la-cy-bad" : ""}">${r.cout}</td>`;
          for (let i = n - 1; i >= 0; i--) carry += `<td class="${i === n - 1 ? "la-cy " + (r.overflow ? "la-cy-bad" : "") : "la-dim"}">${i === 0 ? "" : r.carries[i]}</td>`;
          addBoxL.innerHTML = `<table class="tt la-add"><tbody>
            <tr class="la-crow"><th>进位</th>${carry}<td></td></tr>
            <tr><th>X</th><td></td>${cells(xb, (j) => (j === 0 ? "la-sbc" : ""))}<td class="la-dec">${fmt(ax)}</td></tr>
            <tr><th>+ Y</th><td></td>${cells(yb, (j) => (j === 0 ? "la-sbc" : ""))}<td class="la-dec">${fmt(ay)}</td></tr>
            <tr class="la-sum"><th>和</th><td class="la-drop">${r.cout}</td>${cells(sb2, (j) => (j === 0 ? "la-sbc" : ""))}<td class="la-dec ${r.overflow ? "la-bad" : ""}">${fmt(r.result)}</td></tr>
          </tbody></table>`;
          const lo = -(1 << (n - 1));
          const hi = (1 << (n - 1)) - 1;
          let t = `$C_n=${r.cout}$，$C_{n-1}=${r.cmsb}$，$V=C_n\\oplus C_{n-1}=${r.overflow}$。`;
          if (r.overflow) {
            const both = ax >= 0 ? "两个正数（或非负数）" : "两个负数";
            t += ` <b class="la-bad">溢出</b>：${both}相加，结果的符号位却是 ${sb2[0]}。真实的和 ${fmt(r.trueSum)} 超出 ${n} 位补码范围 ${lo}…+${hi}；加法器只保留低 ${n} 位，相当于 ${fmt(r.trueSum)} ${r.trueSum > 0 ? "−" : "+"} 2<sup>${n}</sup> = ${fmt(r.result)}，所以结果是错的。`;
          } else {
            t += ` <b class="la-good">无溢出</b>：结果 ${fmt(r.result)} 正确。`;
            if (r.cout) t += ` 最高位向外的进位 $C_n=1$ 被自然丢弃（模 $2^${n}$ 运算），不影响结果——补码正是这样把减法变成加法的。`;
            if ((ax < 0) !== (ay < 0)) t += " 异号相加永远不会溢出。";
          }
          addNote.innerHTML = t;
          L.renderMath(addNote);
          roV(r.overflow ? "1（溢出）" : "0");
        }
        function setU(v, from) {
          u = v & 255;
          if (from !== "bits") bitsCtl.set(bitsArr(u));
          if (from !== "slider") decSl.set(u);
          st.redraw();
          renderRead();
        }
        renderRead();
        renderAdd();
        return { touch: () => st.redraw() };
      },
    });

    /* =================================================================
     * 2. 逻辑函数
     * ================================================================= */
    const GATES = {
      AND: { gb: "&", inv: false, f: (a, b) => a & b, expr: "Y = AB", one: false },
      OR: { gb: "≥1", inv: false, f: (a, b) => a | b, expr: "Y = A + B" },
      NOT: { gb: "1", inv: true, f: (a) => 1 - a, expr: `Y = ${ov("A")}`, one: true },
      NAND: { gb: "&", inv: true, f: (a, b) => 1 - (a & b), expr: `Y = ${ov("AB")}` },
      NOR: { gb: "≥1", inv: true, f: (a, b) => 1 - (a | b), expr: `Y = ${ov("A + B")}` },
      XOR: { gb: "=1", inv: false, f: (a, b) => a ^ b, expr: "Y = A ⊕ B" },
      XNOR: { gb: "=1", inv: true, f: (a, b) => 1 - (a ^ b), expr: "Y = A ⊙ B" },
    };
    const GATE_CN = { AND: "与门", OR: "或门", NOT: "非门", NAND: "与非门", NOR: "或非门", XOR: "异或门", XNOR: "同或门" };

    Labs.register("logic", {
      title: "逻辑函数",
      desc: "输入一个逻辑表达式（变量 A B C D），实时得到真值表、最小项 / 最大项编号和两种标准形式；打开比较模式可逐行验证德摩根定律、吸收律等是否成立。下方是 7 种基本门：点输入端切换 0/1。",
      note: String.raw`写法：非用后缀 ' 或前缀 ! ~；与用 · * 或直接并列；或用 +；异或 ^（⊕），同或 ⊙；优先级 非 > 与 > 异或/同或 > 或，拿不准就加括号。行号 $m$ 是把 A B C D 当二进制数读（A 为最高位）。$m_i$ 与 $M_i$ 互补：$M_i=\overline{m_i}$，所以 $F=\sum m(\dots)$ 时 $F=\prod M(\text{其余编号})$。`,
      make({ canvas, controls, readouts, L }) {
        const C = L.COL;
        let cmp = false;
        const fF = textField(controls, { label: "F =", value: "AB + A'C", placeholder: "例如 AB + A'C", onInput: render });
        const pr = L.row(controls, "la-presets");
        const presets = [
          ["AB + A'C", "AB + A'C", null],
          ["(A+B)(A'+C)", "(A+B)(A'+C)", null],
          ["A^B^C", "A^B^C", null],
          ["德摩根", "(AB)'", "A' + B'"],
          ["吸收律", "A + AB", "A"],
          ["冗余项定理", "AB + A'C + BC", "AB + A'C"],
          ["常见错误", "(A+B)'", "A' + B'"],
        ];
        presets.forEach(([lab, f, g]) =>
          L.button(pr, {
            label: lab,
            onClick: () => {
              fF.set(f);
              if (g != null) {
                fG.set(g);
                setCmp(true);
              }
              render();
            },
          })
        );
        const cmpT = L.toggle(controls, { label: "比较模式：再输入 G，逐行比较", value: false, onChange: (v) => setCmp(v) });
        const fG = textField(controls, { label: "G =", value: "A' + B'", placeholder: "第二个表达式", onInput: render });
        function setCmp(v) {
          cmp = v;
          cmpT.set(v);
          fG.el.hidden = !v;
          render();
        }
        fG.el.hidden = true;
        L.button(controls, {
          label: "把 F 送到卡诺图化简 →",
          onClick: () => {
            if (!lastF) return;
            pendingKmap = { n: Math.max(2, lastN), on: lastF.map((v, i) => (v ? i : -1)).filter((i) => i >= 0) };
            Labs.show("kmap");
          },
        });
        subhead(controls, "基本门电路");
        let gate = "NAND";
        let ga = 1;
        let gb = 0;
        const gSeg = L.seg(controls, { label: "门类型", options: Object.keys(GATES).map((k) => ({ v: k, t: k })), value: gate, onChange: (v) => ((gate = v), renderGate()) });
        void gSeg;
        const gBits = L.bits(controls, { label: "输入（也可直接点图中的输入端）", n: 2, value: [ga, gb], names: ["A", "B"], onChange: (v) => (([ga, gb] = v), renderGate()) });

        // ---- 左侧 ----
        const sTT = sec(canvas, "真值表");
        const msg = $h("div", "la-msg");
        const ttBox = $h("div", "la-scroll");
        sTT.append(msg, ttBox);
        const sForm = sec(canvas, "最小项 · 最大项 · 标准形式");
        const formBox = $h("div", "la-forms");
        sForm.append(formBox);
        const sGate = sec(canvas, "基本门：IEEE 特异形符号 与 国标矩形符号");
        const gateWrap = $h("div", "la-gate");
        sGate.append(gateWrap);
        const gateCv = $h("div", "la-gate-cv");
        const gateSide = $h("div", "la-gate-side");
        gateWrap.append(gateCv, gateSide);

        const roF = L.readout(readouts, "F", { html: true });
        const roG = L.readout(readouts, "G", { html: true });
        const roE = L.readout(readouts, "F 与 G");
        const roY = L.readout(readouts, "门输出 Y");

        let lastF = null;
        let lastN = 3;
        function parseSafe(src) {
          try {
            return { ast: X.parseExpr(src) };
          } catch (e) {
            if (e instanceof X.ExprError) return { err: e };
            throw e;
          }
        }
        function formsHTML(name, tt, n) {
          const on = [];
          const off = [];
          tt.forEach((v, i) => (v ? on : off).push(i));
          const sop = on.length ? on.map((m) => prodHTML(X.mintermLits(m, n))).join(" + ") : "0";
          const pos = off.length ? off.map((m) => sumHTML(X.maxtermLits(m, n))).join("") : "1";
          const res = X.minimize(n, on, [], "sop");
          const resP = X.minimize(n, on, [], "pos");
          return `<div class="la-form"><span class="la-fl">${name} = Σm</span><span class="la-mono">(${on.join(", ")})</span>${on.length ? "" : '<span class="la-dim">　没有最小项，F ≡ 0</span>'}</div>
            <div class="la-form"><span class="la-fl">${name} = ΠM</span><span class="la-mono">(${off.join(", ")})</span>${off.length ? "" : '<span class="la-dim">　没有最大项，F ≡ 1</span>'}</div>
            <div class="la-form"><span class="la-fl">标准与或式</span><span class="la-expr">${name} = ${sop}</span></div>
            <div class="la-form"><span class="la-fl">标准或与式</span><span class="la-expr">${name} = ${pos}</span></div>
            <div class="la-form la-form-min"><span class="la-fl">最简与或式</span><span class="la-expr">${name} = ${minHTML(res)}</span></div>
            <div class="la-form la-form-min"><span class="la-fl">最简或与式</span><span class="la-expr">${name} = ${minHTML(resP)}</span></div>`;
        }
        function render() {
          const srcF = fF.get();
          const srcG = fG.get();
          const pf = parseSafe(srcF);
          const pg = cmp ? parseSafe(srcG) : null;
          let m = "";
          if (pf.err) m += errBox(srcF, pf.err).replace("输入有误", "F 输入有误");
          if (pg && pg.err) m += errBox(srcG, pg.err).replace("输入有误", "G 输入有误");
          if (pf.err || (pg && pg.err)) {
            msg.innerHTML = m;
            ttBox.classList.add("la-stale");
            formBox.classList.add("la-stale");
            return;
          }
          ttBox.classList.remove("la-stale");
          formBox.classList.remove("la-stale");
          let n = Math.max(2, X.maxVar(pf.ast) + 1);
          if (pg) n = Math.max(n, X.maxVar(pg.ast) + 1);
          const tf = X.truthTable(pf.ast, n);
          const tg = pg ? X.truthTable(pg.ast, n) : null;
          lastF = tf;
          lastN = n;
          const diff = [];
          if (tg) tf.forEach((v, i) => v !== tg[i] && diff.push(i));
          const vars = X.VARS.slice(0, n);
          let head = `<tr><th>m</th>${vars.map((v) => `<th>${v}</th>`).join("")}<th class="la-fcol">F</th>${tg ? '<th class="la-fcol">G</th><th>F=G?</th>' : ""}</tr>`;
          let rows = "";
          for (let i = 0; i < 1 << n; i++) {
            const bad = tg && tf[i] !== tg[i];
            rows += `<tr class="${bad ? "bad" : ""}"><td class="la-dim">${i}</td>${vars.map((_, k) => `<td class="${X.bitOf(i, k, n) ? "on" : ""}">${X.bitOf(i, k, n)}</td>`).join("")}<td class="la-fcol ${tf[i] ? "on" : ""}">${tf[i]}</td>${tg ? `<td class="la-fcol ${tg[i] ? "on" : ""}">${tg[i]}</td><td>${bad ? '<b class="la-bad">✗</b>' : '<span class="la-good">✓</span>'}</td>` : ""}</tr>`;
          }
          ttBox.innerHTML = `<table class="tt la-truth"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
          let info = `<p class="la-p la-dim">共 ${n} 个变量、${1 << n} 行；行号 m = (${vars.join("")})₂，A 为最高位。</p>`;
          if (tg) {
            info =
              (diff.length
                ? `<p class="la-verdict la-verdict-bad">F ≢ G：有 ${diff.length} 行不同（${mList(diff)}，表中标红），两式<b>不等价</b>。</p>`
                : `<p class="la-verdict la-verdict-ok">F ≡ G：全部 ${1 << n} 行取值相同，两式<b>等价</b>。</p>`) + info;
          }
          msg.innerHTML = info;
          formBox.innerHTML = formsHTML("F", tf, n) + (tg ? '<hr class="la-hr">' + formsHTML("G", tg, n) : "");
          const onF = tf.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
          roF(`Σm(${onF.join(",")})`);
          if (tg) {
            const onG = tg.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
            roG(`Σm(${onG.join(",")})`);
            roE(diff.length ? `不等价（${diff.length} 行不同）` : "等价");
          } else {
            roG("—");
            roE("（未开启比较）");
          }
        }

        // ---- 门电路画布 ----
        let pins = [];
        const gst = L.stage(gateCv, {
          height: (W) => (W < 430 ? 300 : 176),
          draw(ctx, W, H) {
            const g = GATES[gate];
            const one = !!g.one;
            const y0 = g.f(ga, gb);
            const stacked = W < 430;
            const ink = C.ink;
            const card = cssv("--card", "#f8f6f0");
            pins = [];
            // ---- IEEE 特异形 ----
            const areaW = stacked ? W : W * 0.6;
            const cy = stacked ? 82 : H / 2 - 8;
            const gw = L.clamp(areaW * 0.28, 64, 96);
            const gh = gw * 0.8;
            const xPin = 34;
            const bodyL = Math.max(xPin + 40, (areaW - gw) / 2 - 10);
            const bodyR = bodyL + gw;
            const top = cy - gh / 2;
            const yA = one ? cy : cy - gh * 0.27;
            const yB = cy + gh * 0.27;
            const isOr = gate === "OR" || gate === "NOR" || gate === "XOR" || gate === "XNOR";
            const isX = gate === "XOR" || gate === "XNOR";
            const bx = isX ? bodyL + 8 : bodyL;
            const backX = (y) => {
              if (!isOr) return bx;
              const s = (y - top) / gh;
              return bx + gw * 0.5 * s * (1 - s) * 1.0;
            };
            // 输入线
            const wire = (x1, y1, x2, y2, v) => {
              ctx.strokeStyle = v ? C.hi : C.ink3;
              ctx.lineWidth = v ? 2.2 : 1.6;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            };
            wire(xPin, yA, backX(yA), yA, ga);
            if (!one) wire(xPin, yB, backX(yB), yB, gb);
            // 主体
            ctx.beginPath();
            if (gate === "NOT") {
              ctx.moveTo(bodyL, top);
              ctx.lineTo(bodyR - 10, cy);
              ctx.lineTo(bodyL, top + gh);
              ctx.closePath();
            } else if (!isOr) {
              ctx.moveTo(bodyL, top);
              ctx.lineTo(bodyR - gh / 2, top);
              ctx.arc(bodyR - gh / 2, cy, gh / 2, -PI / 2, PI / 2);
              ctx.lineTo(bodyL, top + gh);
              ctx.closePath();
            } else {
              ctx.moveTo(bx, top);
              ctx.quadraticCurveTo(bx + gw * 0.25, cy, bx, top + gh);
              ctx.quadraticCurveTo(bx + (bodyR - bx) * 0.62, top + gh, bodyR, cy);
              ctx.quadraticCurveTo(bx + (bodyR - bx) * 0.62, top, bx, top);
              ctx.closePath();
            }
            ctx.fillStyle = card;
            ctx.fill();
            ctx.strokeStyle = ink;
            ctx.lineWidth = 2;
            ctx.stroke();
            if (isX) {
              ctx.beginPath();
              ctx.moveTo(bodyL, top);
              ctx.quadraticCurveTo(bodyL + gw * 0.25, cy, bodyL, top + gh);
              ctx.stroke();
            }
            let outX = gate === "NOT" ? bodyR - 10 : bodyR;
            if (g.inv) {
              ctx.beginPath();
              ctx.arc(outX + 5, cy, 5, 0, 2 * PI);
              ctx.fillStyle = card;
              ctx.fill();
              ctx.stroke();
              outX += 10;
            }
            const xOut = Math.min(areaW - 34, bodyR + 52);
            ctx.strokeStyle = y0 ? C.ok : C.ink3;
            ctx.lineWidth = y0 ? 2.4 : 1.6;
            ctx.beginPath();
            ctx.moveTo(outX, cy);
            ctx.lineTo(xOut, cy);
            ctx.stroke();
            pin(L, ctx, xPin, yA, ga);
            pins.push({ x: xPin, y: yA, k: 0 });
            L.txt(ctx, "A", xPin - 16, yA, { size: 12, color: C.data, align: "right", weight: 600 });
            if (!one) {
              pin(L, ctx, xPin, yB, gb);
              pins.push({ x: xPin, y: yB, k: 1 });
              L.txt(ctx, "B", xPin - 16, yB, { size: 12, color: C.data, align: "right", weight: 600 });
            }
            pin(L, ctx, xOut, cy, y0, { on: C.ok });
            L.txt(ctx, "Y", xOut + 16, cy, { size: 12, color: C.ok, weight: 600 });
            fitTxt(L, ctx, `IEEE 特异形 · ${gate}`, areaW / 2, cy + gh / 2 + 24, areaW - 16, { size: 11, color: C.ink2, align: "center" });
            // ---- 国标矩形 ----
            const ox = stacked ? W / 2 : W * 0.6 + (W * 0.4) / 2;
            const oy = stacked ? 222 : H / 2 - 8;
            const bw = 46;
            const bh = 60;
            const bl = ox - bw / 2;
            const bt = oy - bh / 2;
            const ya2 = one ? oy : bt + bh * 0.28;
            const yb2 = bt + bh * 0.72;
            wire(bl - 30, ya2, bl, ya2, ga);
            if (!one) wire(bl - 30, yb2, bl, yb2, gb);
            ctx.strokeStyle = ink;
            ctx.lineWidth = 2;
            ctx.fillStyle = card;
            ctx.fillRect(bl, bt, bw, bh);
            ctx.strokeRect(bl, bt, bw, bh);
            L.txt(ctx, g.gb, ox, bt + 15, { size: 13, color: ink, align: "center", weight: 600 });
            let ox2 = bl + bw;
            if (g.inv) {
              ctx.beginPath();
              ctx.arc(ox2 + 5, oy, 5, 0, 2 * PI);
              ctx.fillStyle = card;
              ctx.fill();
              ctx.strokeStyle = ink;
              ctx.stroke();
              ox2 += 10;
            }
            wire(ox2, oy, bl + bw + 34, oy, y0);
            L.txt(ctx, "A", bl - 34, ya2, { size: 11, color: C.data, align: "right" });
            if (!one) L.txt(ctx, "B", bl - 34, yb2, { size: 11, color: C.data, align: "right" });
            L.txt(ctx, "Y", bl + bw + 38, oy, { size: 11, color: C.ok });
            fitTxt(L, ctx, "国标 GB/T 4728（矩形）", ox, bt + bh + 24, stacked ? W - 16 : W * 0.4 - 12, { size: 11, color: C.ink2, align: "center" });
          },
        });
        gst.el.classList.add("la-click");
        gst.cvs.addEventListener("click", (e) => {
          const { x, y } = canvasXY(gst.cvs, e);
          const p = pins.find((q) => Math.hypot(q.x - x, q.y - y) < 18);
          if (!p) return;
          if (p.k === 0) ga ^= 1;
          else gb ^= 1;
          gBits.set([ga, gb]);
          renderGate();
        });
        function renderGate() {
          const g = GATES[gate];
          const one = !!g.one;
          let rows = "";
          if (one) for (let a = 0; a < 2; a++) rows += `<tr class="${a === ga ? "cur" : ""}"><td class="${a ? "on" : ""}">${a}</td><td class="${g.f(a) ? "on" : ""}">${g.f(a)}</td></tr>`;
          else
            for (let a = 0; a < 2; a++)
              for (let b = 0; b < 2; b++) rows += `<tr class="${a === ga && b === gb ? "cur" : ""}"><td class="${a ? "on" : ""}">${a}</td><td class="${b ? "on" : ""}">${b}</td><td class="${g.f(a, b) ? "on" : ""}">${g.f(a, b)}</td></tr>`;
          const rule = {
            AND: "全 1 出 1，有 0 出 0",
            OR: "有 1 出 1，全 0 出 0",
            NOT: "入 0 出 1，入 1 出 0",
            NAND: "全 1 出 0，有 0 出 1",
            NOR: "有 1 出 0，全 0 出 1",
            XOR: "相异出 1，相同出 0",
            XNOR: "相同出 1，相异出 0",
          }[gate];
          gateSide.innerHTML = `<div class="la-gname">${GATE_CN[gate]} <span class="la-mono">${gate}</span></div><div class="la-expr">${g.expr}</div><div class="la-dim la-small">${rule}</div>
            <table class="tt la-gtt"><thead><tr><th>A</th>${one ? "" : "<th>B</th>"}<th>Y</th></tr></thead><tbody>${rows}</tbody></table>`;
          gBits.el.querySelectorAll(".bit")[1].disabled = one;
          roY(`${GATE_CN[gate]}：Y = ${g.f(ga, gb)}`);
          gst.redraw();
        }
        render();
        renderGate();
        return { touch: () => gst.redraw() };
      },
    });

    /* =================================================================
     * 3. 卡诺图
     * ================================================================= */
    Labs.register("kmap", {
      title: "卡诺图",
      desc: "点格子在 0 → 1 → ×（无关项）之间切换，或输入 Σm(…)+Σd(…) 一键填充。程序用 Quine–McCluskey 找出全部质蕴涵项，再精确求最小覆盖，把选中的圈画在图上（含左右、上下、四角的环绕圈）。打开逐步模式，看每个圈为什么被选。",
      note: String.raw`“最简”的标准：先比乘积项数，再比文字数。无关项 × 只用来把圈画大，不要求被圈到。行列按格雷码 00, 01, 11, 10 排列，所以最左列与最右列、最上行与最下行也相邻。或与式：对 0 格画圈得到 $\overline F$ 的最简与或式，再用德摩根定律取反。`,
      make({ canvas, controls, readouts, L }) {
        const C = L.COL;
        let n = 4;
        let vals = new Array(16).fill(0); // 0 / 1 / 2(×)
        let kind = "sop";
        let stepMode = false;
        let step = 0;
        let res = null;
        const nSeg = L.seg(controls, {
          label: "变量数",
          options: [
            { v: "2", t: "2 变量" },
            { v: "3", t: "3 变量" },
            { v: "4", t: "4 变量" },
          ],
          value: "4",
          onChange: (v) => {
            setN(+v);
            update(true);
          },
        });
        const kSeg = L.seg(controls, {
          label: "化简目标",
          options: [
            { v: "sop", t: "最简与或式（圈 1）" },
            { v: "pos", t: "最简或与式（圈 0）" },
          ],
          value: kind,
          onChange: (v) => {
            kind = v;
            step = 0;
            update(false);
          },
        });
        void kSeg;
        const fIn = textField(controls, { label: "输入 Σm(…) + Σd(…)，或 ΠM(…)", value: "", placeholder: "如 Σm(0,2,5,7)+Σd(8)", onEnter: () => applyText() });
        const r0 = L.row(controls);
        L.button(r0, { label: "填入", kind: "primary", onClick: () => applyText() });
        L.button(r0, { label: "清空", onClick: () => ((vals = vals.map(() => 0)), update(true)) });
        L.button(r0, {
          label: "随机",
          onClick: () => {
            const N = 1 << n;
            vals = Array.from({ length: N }, () => {
              const r = Math.random();
              return r < 0.12 ? 2 : r < 0.55 ? 1 : 0;
            });
            update(true);
          },
        });
        const fErr = $h("div", "la-msg");
        controls.append(fErr);
        subhead(controls, "例题");
        const pr = L.row(controls, "la-presets");
        const presets = [
          ["B'D' + BD", 4, "m(0,2,5,7,8,10,13,15)"],
          ["四角", 4, "m(0,2,8,10)"],
          ["无关项", 4, "m(1,3,7,11,15)+d(0,2,5)"],
          ["BCD ≥ 5", 4, "m(5,6,7,8,9)+d(10-15)"],
          ["多解（循环）", 3, "m(0,1,2,5,6,7)"],
          ["棋盘（不能合并）", 4, "m(1,2,4,7,8,11,13,14)"],
        ];
        presets.forEach(([lab, nn, s]) =>
          L.button(pr, {
            label: lab,
            onClick: () => {
              setN(nn);
              nSeg.set(String(nn));
              fIn.set(s.replace(/^m/, "Σm").replace("+d", " + Σd"));
              applyText();
            },
          })
        );
        const stepT = L.toggle(controls, { label: "逐步模式：一步加一个圈", value: false, onChange: (v) => ((stepMode = v), (step = 0), update(false)) });
        void stepT;
        const rs = L.row(controls);
        const bPrev = L.button(rs, { label: "← 上一步", onClick: () => ((step = Math.max(0, step - 1)), update(false)) });
        const bNext = L.button(rs, { label: "下一步 →", kind: "primary", onClick: () => ((step = Math.min(res.steps.length, step + 1)), update(false)) });

        // ---- 左侧 ----
        const stepBox = $h("div", "la-step");
        let geo = null;
        const st = L.stage(canvas, {
          height: (W) => {
            const lay = X.kmapLayout(n);
            const R = lay.rows.length;
            const Cc = lay.cols.length;
            const cs = L.clamp((W - 24 - 50) / Cc, 40, 84);
            return Math.round(12 + 44 + R * cs + 18);
          },
          draw(ctx, W, H) {
            const lay = X.kmapLayout(n);
            const R = lay.rows.length;
            const Cc = lay.cols.length;
            const hdrW = 50;
            const hdrH = 44;
            const cs = L.clamp((W - 24 - hdrW) / Cc, 40, 84);
            const gw = Cc * cs;
            const gh = R * cs;
            const ox = Math.round((W - (hdrW + gw)) / 2 + hdrW);
            const oy = 12 + hdrH;
            geo = { ox, oy, cs, R, Cc };
            const card = cssv("--card", "#f8f6f0");
            // 角标
            ctx.strokeStyle = C.ink2;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ox - hdrW + 4, oy - hdrH + 4);
            ctx.lineTo(ox, oy);
            ctx.stroke();
            L.txt(ctx, lay.rowVars, ox - hdrW + 6, oy - 8, { size: 12, color: C.data, weight: 600 });
            L.txt(ctx, lay.colVars, ox - 4, oy - hdrH + 12, { size: 12, color: C.data, weight: 600, align: "right" });
            // 行列标题（格雷码）
            for (let c = 0; c < Cc; c++) L.txt(ctx, X.toBin(lay.cols[c], lay.colBits), ox + c * cs + cs / 2, oy - 12, { size: 12, color: C.ink2, align: "center" });
            for (let r = 0; r < R; r++) L.txt(ctx, X.toBin(lay.rows[r], lay.rowBits), ox - 10, oy + r * cs + cs / 2, { size: 12, color: C.ink2, align: "right" });
            // 当前步已覆盖的格
            const shown = res ? (stepMode ? res.steps.slice(0, step) : res.steps) : [];
            const coveredNow = new Set(shown.flatMap((s) => s.cover));
            // 格子
            for (let r = 0; r < R; r++)
              for (let c = 0; c < Cc; c++) {
                const m = X.kmapCell(lay, r, c);
                const x = ox + c * cs;
                const y = oy + r * cs;
                ctx.fillStyle = card;
                ctx.fillRect(x, y, cs, cs);
                const v = vals[m];
                const isTgt = (kind === "sop" && v === 1) || (kind === "pos" && v === 0);
                if (stepMode && isTgt && !coveredNow.has(m)) {
                  ctx.fillStyle = rgba(C.clk, 0.13);
                  ctx.fillRect(x, y, cs, cs);
                }
                ctx.strokeStyle = C.rule;
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
                L.txt(ctx, "m" + m, x + 4, y + 4, { size: cs < 50 ? 9 : 10, color: C.ink3, base: "top" });
                const sym = v === 2 ? "×" : String(v);
                const col = v === 2 ? C.warn : isTgt ? (kind === "sop" ? C.hi : C.data) : C.ink3;
                L.txt(ctx, sym, x + cs / 2, y + cs * 0.6, { size: Math.round(cs * 0.36), color: col, align: "center", weight: isTgt ? 700 : 400 });
              }
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(ox, oy, gw, gh);
            // 圈
            if (res) {
              const pal = [C.hi, C.data, C.ok, C.warn, C.clk, cssv("--c-bool", "#5b4bb0"), cssv("--c-gate", "#2f7d8a"), cssv("--c-mem", "#8a5a2b")];
              ctx.save();
              ctx.beginPath();
              ctx.rect(ox - 3, oy - 3, gw + 6, gh + 6);
              ctx.clip();
              shown.forEach((s, k) => {
                const col = pal[k % pal.length];
                const ins = 4 + (k % 4) * 3.5;
                const cur = stepMode && k === step - 1;
                for (const q of X.cubeRects(lay, s.cube)) {
                  let xl = ox + q.c0 * cs + ins;
                  let xr = ox + (q.c1 + 1) * cs - ins;
                  let yt = oy + q.r0 * cs + ins;
                  let yb = oy + (q.r1 + 1) * cs - ins;
                  if (q.openL) xl = ox - cs * 0.5;
                  if (q.openR) xr = ox + gw + cs * 0.5;
                  if (q.openT) yt = oy - cs * 0.5;
                  if (q.openB) yb = oy + gh + cs * 0.5;
                  rr(ctx, xl, yt, xr - xl, yb - yt, Math.min(16, cs * 0.32));
                  ctx.fillStyle = rgba(col, cur ? 0.16 : 0.08);
                  ctx.fill();
                  ctx.strokeStyle = col;
                  ctx.lineWidth = cur ? 3.4 : 2.2;
                  ctx.stroke();
                }
              });
              ctx.restore();
            }
            void H;
          },
        });
        st.el.classList.add("la-click");
        canvas.append(stepBox);
        const sRes = sec(canvas, "化简结果");
        const resBox = $h("div", "la-res");
        sRes.append(resBox);
        const listBox = $h("ol", "la-cirlist");
        sRes.append(listBox);
        const det = $h("details", "la-details");
        det.append($h("summary", "", "全部质蕴涵项（Quine–McCluskey 结果）"));
        const primeBox = $h("div", "la-scroll");
        det.append(primeBox);
        sRes.append(det);

        const roF = L.readout(readouts, "最简式", { html: true });
        const roN = L.readout(readouts, "项数 · 文字数");
        const roP = L.readout(readouts, "质蕴涵项");
        const roU = L.readout(readouts, "最简结果");

        st.cvs.addEventListener("click", (e) => {
          if (!geo) return;
          const { x, y } = canvasXY(st.cvs, e);
          const c = Math.floor((x - geo.ox) / geo.cs);
          const r = Math.floor((y - geo.oy) / geo.cs);
          if (c < 0 || r < 0 || c >= geo.Cc || r >= geo.R) return;
          const m = X.kmapCell(X.kmapLayout(n), r, c);
          vals[m] = (vals[m] + 1) % 3;
          update(true);
        });
        function setN(nn) {
          if (nn === n) return;
          n = nn;
          vals = new Array(1 << n).fill(0);
          step = 0;
        }
        function applyText() {
          try {
            const { on, dc } = X.parseMinterms(fIn.get(), n);
            vals = new Array(1 << n).fill(0);
            on.forEach((x) => (vals[x] = 1));
            dc.forEach((x) => (vals[x] = 2));
            fErr.innerHTML = "";
            step = 0;
            update(false);
          } catch (e) {
            if (!(e instanceof X.ExprError)) throw e;
            fErr.innerHTML = errBox(fIn.get(), e);
          }
        }
        function syncText() {
          const on = [];
          const dc = [];
          vals.forEach((v, i) => (v === 1 ? on.push(i) : v === 2 && dc.push(i)));
          fIn.set(`Σm(${on.join(",")})` + (dc.length ? ` + Σd(${dc.join(",")})` : ""));
          fErr.innerHTML = "";
        }
        function update(fromCells) {
          if (fromCells) {
            syncText();
            step = 0;
          }
          const on = [];
          const dc = [];
          vals.forEach((v, i) => (v === 1 ? on.push(i) : v === 2 && dc.push(i)));
          res = X.minimize(n, on, dc, kind);
          const what = kind === "sop" ? "1" : "0";
          const S = res.steps.length;
          if (step > S) step = S;
          st.resize();
          // 结果
          const fH = minHTML(res);
          const tail = kind === "pos" && res.constant == null ? `<div class="la-dim la-small">对 0 格画圈得 ${ov("F")} = ${res.chosen.map((c) => prodHTML(X.cubeLits(c, n))).join(" + ")}，两边取反（德摩根）即得上式。</div>` : "";
          let uniq = "";
          if (res.nSolutions > 1) {
            const alts = res.allSolutions.slice(1, 4).map((sol) => {
              const ch = sol.map((i) => res.primes[i]);
              return kind === "sop" ? ch.map((c) => prodHTML(X.cubeLits(c, n))).join(" + ") : ch.map((c) => sumHTML(X.cubeSumLits(c, n))).join("");
            });
            uniq = `<p class="la-p la-warnline">存在 ${res.nSolutions} 个同样最简的结果，这里给出其一。其他：${alts.map((a) => `<span class="la-expr">F = ${a}</span>`).join("；")}${res.nSolutions > 4 ? " …" : ""}</p>`;
          }
          resBox.innerHTML = `<div class="la-big"><span class="la-expr">F = ${fH}</span></div>${tail}
            <p class="la-p la-dim">${res.terms} 个${kind === "sop" ? "乘积项" : "和项"}，共 ${res.lits} 个文字；${what} 格 ${res.target.length} 个，无关项 ${res.dc.length} 个；质蕴涵项 ${res.primes.length} 个，其中必要 ${res.essentials.length} 个。</p>${uniq}`;
          const pal = ["hi", "data", "ok", "warn", "clk", "c-bool", "c-gate", "c-mem"];
          const shown = stepMode ? res.steps.slice(0, step) : res.steps;
          listBox.innerHTML = shown
            .map(
              (s, k) => `<li><i class="la-sw" style="border-color:var(--${pal[k % pal.length]})"></i><span class="la-expr">${cubeHTML(s.cube, n, kind)}</span>
              <span class="la-small">覆盖 ${mList(s.cover)}${s.dcUsed.length ? `，借用无关项 ${mList(s.dcUsed)}` : ""}</span>${s.essential ? '<span class="la-tag">必要</span>' : ""}</li>`
            )
            .join("");
          if (!res.target.length) listBox.innerHTML = `<li class="la-dim">没有${what}格，不需要画圈：F ≡ ${kind === "sop" ? 0 : 1}。</li>`;
          // QM 表
          const chosenSet = new Set(res.order);
          const essSet = new Set(res.essentials);
          primeBox.innerHTML = res.primes.length
            ? `<table class="tt la-primes"><thead><tr><th>${X.VARS.slice(0, n).join("")}</th><th>${kind === "sop" ? "乘积项" : "和项"}</th><th>包含的格</th><th>必要</th><th>选中</th></tr></thead><tbody>
              ${res.primes
                .map((p, i) => {
                  const ms = X.cubeMinterms(p, n);
                  return `<tr class="${chosenSet.has(i) ? "cur" : ""}"><td>${X.cubeDash(p, n)}</td><td class="la-expr">${cubeHTML(p, n, kind)}</td><td>${ms.map((x) => (vals[x] === 2 ? `<span class="la-dcm">${x}</span>` : x)).join(", ")}</td><td>${essSet.has(i) ? "✓" : ""}</td><td>${chosenSet.has(i) ? "✓" : ""}</td></tr>`;
                })
                .join("")}</tbody></table><p class="la-p la-dim la-small">“–”表示该变量被消去；品红编号是无关项。只含无关项的质蕴涵项不会被选用。</p>`
            : `<p class="la-p la-dim">没有质蕴涵项。</p>`;
          // 逐步说明
          stepBox.hidden = !stepMode;
          bPrev.disabled = !stepMode || step === 0;
          bNext.disabled = !stepMode || step >= S;
          if (stepMode) {
            let t;
            if (!res.target.length) t = `没有${what}格，F ≡ ${kind === "sop" ? 0 : 1}，无需画圈。`;
            else if (step === 0)
              t = `<b>第 0 步</b>：先找出全部质蕴涵项（共 ${res.primes.length} 个，见下方表格）。再看每个${what}格被几个质蕴涵项覆盖——只被一个覆盖的格，那个圈就是<b>必要质蕴涵项</b>，必须选。黄色底的格尚未覆盖。`;
            else {
              const s = res.steps[step - 1];
              const term = `<span class="la-expr">${cubeHTML(s.cube, n, kind)}</span>`;
              if (s.essential)
                t = `<b>第 ${step} 步 · 必要质蕴涵项</b> ${term}：格 ${mList(s.only)} 只能被这个圈覆盖，所以必须选。它覆盖 ${mList(s.cover)}${s.dcUsed.length ? `（借用无关项 ${mList(s.dcUsed)} 把圈扩大）` : ""}，新覆盖 ${mList(s.newly)}。`;
              else
                t = `<b>第 ${step} 步 · 选择性的圈</b> ${term}：必要质蕴涵项选完后，还剩 ${mList(s.remainingBefore)} 未覆盖，它们都能被不止一个质蕴涵项覆盖。精确搜索所有组合后，选这个圈能让总项数最少、其次文字最少；它新覆盖 ${mList(s.newly)}。${res.nSolutions > 1 ? "（换成其他等大的圈也同样最简，见“化简结果”。）" : ""}`;
              if (step === S) t += `<br><b>完成</b>：全部${what}格都已覆盖，F = ${fH}。`;
            }
            stepBox.innerHTML = `<div class="la-step-n">${step} / ${S}</div><div>${t}</div>`;
          }
          roF(`F = ${fH}`);
          roN(`${res.terms} 项 · ${res.lits} 个文字`);
          roP(`${res.primes.length} 个（必要 ${res.essentials.length}）`);
          roU(res.nSolutions > 1 ? `不唯一（${res.nSolutions} 个）` : "唯一");
        }
        // 默认例题
        fIn.set("Σm(0,2,5,7,8,10,13,15)");
        applyText();
        return {
          touch() {
            if (pendingKmap) {
              const p = pendingKmap;
              pendingKmap = null;
              setN(p.n);
              nSeg.set(String(p.n));
              vals = new Array(1 << n).fill(0);
              p.on.forEach((x) => (vals[x] = 1));
              update(true);
            } else st.redraw();
          },
        };
      },
    });

    /* =================================================================
     * 4. 译码器 · 数据选择器 · 七段译码
     * ================================================================= */
    Labs.register("msi", {
      title: "译码器 · 数据选择器",
      desc: "用中规模芯片实现逻辑函数。74HC138：每个输出就是一个最小项的反，挑出函数的最小项接到与非门。74HC151：地址选中哪一路数据，就输出哪一路；4 变量函数要“降维”，把 D 当数据接进去。点图中的圆形输入端可直接拨动。",
      note: String.raw`138 使能有效（$G_1=1,\ \overline{G_{2A}}=\overline{G_{2B}}=0$；教材记作 $S_1,\bar S_2,\bar S_3$，NXP 手册记作 $E_3,\bar E_1,\bar E_2$）时 $\overline{Y_i}=\overline{m_i}$，地址 $A_2A_1A_0$ 中 $A_2$ 为最高位。151：$Y=\sum_{i=0}^{7} m_i D_i$，$\overline S=0$ 时工作，$W=\overline Y$。七段：共阴极，段为 1 时亮；4511 输入 10–15（伪码）时消隐。`,
      make({ canvas, controls, readouts, L }) {
        const C = L.COL;
        let mode = "138";
        // 138 状态
        let f138 = [1, 2, 4, 7];
        let a138 = [1, 0, 1]; // A2 A1 A0
        let en138 = [1, 0, 0]; // G1 G2A' G2B'
        // 151 状态
        let n151 = 4;
        let tt151 = null;
        let a151 = [0, 1, 1];
        let d151 = 1;
        let s151 = 0;
        // 七段
        let bcd = 5;
        let ltN = 1;
        let biN = 1;
        let tails = false; // CD4511 / 74HC4511、7448 的 6、9 均不带尾巴

        L.seg(controls, {
          label: "芯片",
          options: [
            { v: "138", t: "74HC138 译码器" },
            { v: "151", t: "74HC151 选择器" },
            { v: "seg", t: "七段译码" },
          ],
          value: mode,
          onChange: (v) => {
            mode = v;
            showMode();
          },
        });
        const c138 = $h("div", "la-ctlgroup");
        const c151 = $h("div", "la-ctlgroup");
        const cSeg = $h("div", "la-ctlgroup");
        controls.append(c138, c151, cSeg);
        const v138 = $h("div", "la-modebox");
        const v151 = $h("div", "la-modebox");
        const vSeg = $h("div", "la-modebox");
        canvas.append(v138, v151, vSeg);

        // 函数输入：Σm 列表或表达式
        function parseFunc(src, nv) {
          const s = src.trim();
          if (/[mMΣ∑Π∏]/.test(s) || /^[\d\s,，、\-–]+$/.test(s)) {
            const r = X.parseMinterms(s, nv);
            if (r.dc.length) throw new X.ExprError("这里不支持无关项 d(…)", s.search(/d/i));
            return r.on;
          }
          const ast = X.parseExpr(s);
          if (X.maxVar(ast) >= nv) throw new X.ExprError(`${nv} 变量函数只能用 ${X.VARS.slice(0, nv).join(" ")}`, 0);
          return X.truthTable(ast, nv)
            .map((v, i) => (v ? i : -1))
            .filter((i) => i >= 0);
        }

        /* ---------- (a) 138 ---------- */
        const fx138 = textField(c138, {
          label: "F(A,B,C) = Σm(…) 或表达式",
          value: "m(1,2,4,7)",
          onInput: (v) => {
            try {
              f138 = parseFunc(v, 3);
              mBits.set(Array.from({ length: 8 }, (_, i) => +f138.includes(i)));
              err138.innerHTML = "";
            } catch (e) {
              if (!(e instanceof X.ExprError)) throw e;
              err138.innerHTML = errBox(v, e);
            }
            render138();
          },
        });
        const err138 = $h("div", "la-msg");
        c138.append(err138);
        const p138 = L.row(c138, "la-presets");
        [
          ["全加器和 S", "m(1,2,4,7)"],
          ["全加器进位 / 三人表决", "m(3,5,6,7)"],
          ["A ⊙ C", "A ⊙ C"],
        ].forEach(([t, v]) =>
          L.button(p138, {
            label: t,
            onClick: () => {
              fx138.set(v);
              fx138.inp.dispatchEvent(new Event("input"));
            },
          })
        );
        const mBits = L.bits(c138, {
          label: "或直接勾选最小项",
          n: 8,
          value: Array.from({ length: 8 }, (_, i) => +f138.includes(i)),
          names: ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"],
          onChange: (v) => {
            f138 = v.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
            fx138.set(`m(${f138.join(",")})`);
            err138.innerHTML = "";
            render138();
          },
        });
        const aBits = L.bits(c138, { label: "地址 A2 A1 A0（= A B C）", n: 3, value: a138, names: ["A2", "A1", "A0"], onChange: (v) => ((a138 = v), render138()) });
        const eBits = L.bits(c138, { label: "使能 G1 · G2A' · G2B'", n: 3, value: en138, names: ["G1", "G2A'", "G2B'"], onChange: (v) => ((en138 = v), render138()) });

        let hit138 = [];
        const st138 = L.stage(v138, {
          height: (W) => {
            const p = L.clamp(W / 26, 20, 26);
            return Math.round(28 + 22 + 8 * p + 14 + 30);
          },
          draw(ctx, W, H) {
            const p = L.clamp(W / 26, 20, 26);
            const addr = a138[0] * 4 + a138[1] * 2 + a138[2];
            const ys = X.dec138(addr, en138[0], en138[1], en138[2]);
            const F = X.f138(f138, addr, en138[0], en138[1], en138[2]);
            const card = cssv("--card", "#f8f6f0");
            const fs = W < 480 ? 10 : 11;
            const xCirc = 32;
            const lead1 = W < 480 ? 22 : 36;
            const chipW = L.clamp(W * 0.24, 96, 150);
            const boxL = xCirc + 10 + lead1;
            const boxR = boxL + chipW;
            const boxT = 28;
            const headH = 22;
            const rowY = (i) => boxT + headH + i * p + p / 2;
            const boxB = boxT + headH + 8 * p + 6;
            hit138 = [];
            // 芯片
            ctx.fillStyle = card;
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.6;
            ctx.fillRect(boxL, boxT, chipW, boxB - boxT);
            ctx.strokeRect(boxL, boxT, chipW, boxB - boxT);
            L.txt(ctx, "74HC138", (boxL + boxR) / 2, boxT + 12, { size: fs + 1, color: C.ink, align: "center", weight: 600 });
            // 左侧输入
            const leftPins = [
              { row: 0, name: "A0", v: a138[2], low: false, src: "C", k: ["a", 2] },
              { row: 1, name: "A1", v: a138[1], low: false, src: "B", k: ["a", 1] },
              { row: 2, name: "A2", v: a138[0], low: false, src: "A", k: ["a", 0] },
              { row: 5, name: "G1", v: en138[0], low: false, src: "", k: ["e", 0] },
              { row: 6, name: "G2A", v: en138[1], low: true, src: "", k: ["e", 1] },
              { row: 7, name: "G2B", v: en138[2], low: true, src: "", k: ["e", 2] },
            ];
            for (const q of leftPins) {
              const y = rowY(q.row);
              const end = q.low ? boxL - 8 : boxL;
              ctx.strokeStyle = q.v ? C.hi : C.ink3;
              ctx.lineWidth = q.v ? 2 : 1.4;
              ctx.beginPath();
              ctx.moveTo(xCirc + 10, y);
              ctx.lineTo(end, y);
              ctx.stroke();
              if (q.low) {
                ctx.beginPath();
                ctx.arc(boxL - 4, y, 4, 0, 2 * PI);
                ctx.fillStyle = card;
                ctx.fill();
                ctx.strokeStyle = C.ink;
                ctx.lineWidth = 1.3;
                ctx.stroke();
              }
              if (q.low) ovTxt(L, ctx, q.name, boxL + 6, y, { size: fs, color: C.ink2 });
              else L.txt(ctx, q.name, boxL + 6, y, { size: fs, color: C.ink2 });
              pin(L, ctx, xCirc, y, q.v, { r: 9, size: 10 });
              hit138.push({ x: xCirc, y, k: q.k });
              if (q.src) L.txt(ctx, q.src, xCirc - 14, y, { size: 12, color: C.data, align: "right", weight: 600 });
            }
            // 右侧输出 + 与非门
            const ms = f138.slice().sort((a, b) => a - b);
            const gwid = L.clamp(W * 0.1, 44, 66);
            const xF = W - 34;
            const gateR = xF - 11 - 22;
            const gateX = gateR - 10 - gwid;
            const leadEnd = boxR + 8 + (W < 480 ? 16 : 24);
            for (let i = 0; i < 8; i++) {
              const y = rowY(i);
              const lv = ys[i];
              ovTxt(L, ctx, "Y" + i, boxR - 6, y, { size: fs, color: lv ? C.ink2 : C.ok, align: "right", weight: lv ? 400 : 700 });
              ctx.beginPath();
              ctx.arc(boxR + 4, y, 4, 0, 2 * PI);
              ctx.fillStyle = card;
              ctx.fill();
              ctx.strokeStyle = C.ink;
              ctx.lineWidth = 1.3;
              ctx.stroke();
              const used = ms.includes(i);
              ctx.strokeStyle = used ? (lv ? C.hi : C.ok) : rgba(C.ink3, 0.6);
              ctx.lineWidth = used ? (lv ? 2 : 2.6) : 1.2;
              ctx.beginPath();
              ctx.moveTo(boxR + 8, y);
              ctx.lineTo(used ? gateX : leadEnd, y);
              ctx.stroke();
              if (!used) {
                ctx.beginPath();
                ctx.arc(leadEnd + 3, y, 3, 0, 2 * PI);
                ctx.strokeStyle = rgba(C.ink3, 0.6);
                ctx.stroke();
              } else {
                ctx.fillStyle = lv ? C.hi : C.ok;
                ctx.beginPath();
                ctx.arc(gateX, y, 2.6, 0, 2 * PI);
                ctx.fill();
              }
              L.txt(ctx, String(lv), boxR + 12, y - 7, { size: 9, color: lv ? C.ink3 : C.ok, weight: lv ? 400 : 700 });
            }
            if (!ms.length) {
              fitTxt(L, ctx, "F 没有最小项 → 直接接地，F ≡ 0", (boxR + W) / 2 + 10, rowY(3.5), W - boxR - 30, { size: 11, color: C.ink2, align: "center", font: "sans" });
              void H;
              return;
            }
            const yMin = rowY(ms[0]);
            const yMax = rowY(ms[ms.length - 1]);
            const gh = L.clamp(p * 3, 54, 76);
            const gcy = L.clamp((yMin + yMax) / 2, boxT + gh / 2 + 2, boxB - gh / 2 - 2);
            const gt = gcy - gh / 2;
            // 输入延长线
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(gateX, Math.min(yMin, gt));
            ctx.lineTo(gateX, Math.max(yMax, gt + gh));
            ctx.stroke();
            // 与非门本体
            ctx.beginPath();
            ctx.moveTo(gateX, gt);
            ctx.lineTo(gateX + gwid - gh / 2, gt);
            ctx.arc(gateX + gwid - gh / 2, gcy, gh / 2, -PI / 2, PI / 2);
            ctx.lineTo(gateX, gt + gh);
            ctx.closePath();
            ctx.fillStyle = card;
            ctx.fill();
            ctx.stroke();
            L.txt(ctx, "&", gateX + (gwid - gh / 2) / 2 + 2, gcy, { size: 11, color: C.ink3, align: "center" });
            ctx.beginPath();
            ctx.arc(gateX + gwid + 5, gcy, 5, 0, 2 * PI);
            ctx.fillStyle = card;
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = F ? C.ok : C.ink3;
            ctx.lineWidth = F ? 2.4 : 1.5;
            ctx.beginPath();
            ctx.moveTo(gateX + gwid + 10, gcy);
            ctx.lineTo(xF - 11, gcy);
            ctx.stroke();
            pin(L, ctx, xF, gcy, F, { on: C.ok });
            L.txt(ctx, "F", xF + 15, gcy, { size: 12, color: C.ok, weight: 700 });
            fitTxt(L, ctx, `${ms.length} 输入与非门`, gateX + gwid / 2, gt + gh + 14, gwid + 40, { size: 10, color: C.ink3, align: "center", font: "sans" });
            // 底部说明
            const en = en138[0] === 1 && en138[1] === 0 && en138[2] === 0;
            fitTxt(L, ctx, en ? `ABC = ${a138.join("")} → m${addr}，只有 Y${addr}' 为 0` : "使能无效：Y0'–Y7' 全为 1，与非门输出 0", boxL, boxB + 18, W - boxL - 8, { size: 11, color: en ? C.ink2 : C.hi });
            void H;
          },
        });
        st138.el.classList.add("la-click");
        st138.cvs.addEventListener("click", (e) => {
          const { x, y } = canvasXY(st138.cvs, e);
          const q = hit138.find((h) => Math.hypot(h.x - x, h.y - y) < 15);
          if (!q) return;
          if (q.k[0] === "a") {
            a138[q.k[1]] ^= 1;
            aBits.set(a138);
          } else {
            en138[q.k[1]] ^= 1;
            eBits.set(en138);
          }
          render138();
        });
        const der138 = $h("div", "la-deriv");
        v138.append(der138);
        const ro = {
          in: L.readout(readouts, "输入"),
          st: L.readout(readouts, "状态"),
          out: L.readout(readouts, "电路输出"),
          want: L.readout(readouts, "函数应为"),
        };
        function render138() {
          st138.redraw();
          const ms = f138.slice().sort((a, b) => a - b);
          const addr = a138[0] * 4 + a138[1] * 2 + a138[2];
          const en = en138[0] === 1 && en138[1] === 0 && en138[2] === 0;
          const F = X.f138(ms, addr, ...en138);
          const want = +ms.includes(addr);
          let tex;
          if (!ms.length) tex = "$F=0$：没有最小项，输出直接接地。";
          else {
            const mm = ms.map((i) => `m_{${i}}`).join("+");
            const nm = ms.map((i) => `\\overline{m_{${i}}}`).join("\\,");
            const ny = ms.map((i) => `\\overline{Y_{${i}}}`).join("\\,");
            tex = `$F=\\sum m(${ms.join(",")})=${mm}=\\overline{${nm}}=\\overline{${ny}}$`;
          }
          der138.innerHTML = `<p class="la-p"><b>推导</b>（两次取反，再用德摩根定律）：${tex}</p>
            <p class="la-p">所以把 ${ms.length ? ms.map((i) => `Y${i}′`).join("、") : "（无）"} 接到一个 ${ms.length} 输入与非门。${en ? `当前 ABC = ${a138.join("")}，选中 m${addr}，${ms.includes(addr) ? `Y${addr}′ = 0 接在与非门上，与非门“有 0 出 1”，F = 1。` : `Y${addr}′ 没接到与非门，门的输入全是 1，F = 0。`}` : `<span class="la-bad">使能无效</span>：138 所有输出都是 1，与非门输出 0——此时电路不再实现 F，这就是使能端要接成 G1 = 1、G2A′ = G2B′ = 0 的原因。`}</p>`;
          L.renderMath(der138);
          ro.in.textContent;
          ro.in(`ABC = ${a138.join("")}（m${addr}）`);
          ro.st(en ? "使能有效" : "使能无效");
          ro.out(`F = ${F}`);
          ro.want(en ? `F = ${want}${F === want ? " ✓" : " ✗"}` : `F = ${want}（未使能）`);
        }

        /* ---------- (b) 151 ---------- */
        L.seg(c151, {
          label: "函数变量数",
          options: [
            { v: "3", t: "3 变量（直接接 0/1）" },
            { v: "4", t: "4 变量（降维）" },
          ],
          value: "4",
          onChange: (v) => {
            n151 = +v;
            fx151.set(n151 === 4 ? "m(1,2,4,7,8,9,13,15)" : "m(1,2,4,7)");
            dBits.el.hidden = n151 === 3;
            parse151();
          },
        });
        const fx151 = textField(c151, { label: "F = Σm(…) 或表达式", value: "m(1,2,4,7,8,9,13,15)", onInput: () => parse151() });
        const err151 = $h("div", "la-msg");
        c151.append(err151);
        const p151 = L.row(c151, "la-presets");
        [
          ["例：m(1,2,4,7,8,9,13,15)", "m(1,2,4,7,8,9,13,15)", 4],
          ["A⊕B⊕C⊕D", "A^B^C^D", 4],
          ["AB + CD", "AB + CD", 4],
          ["三人表决", "AB+BC+AC", 3],
        ].forEach(([t, v, nn]) =>
          L.button(p151, {
            label: t,
            onClick: () => {
              if (nn !== n151) {
                n151 = nn;
                dBits.el.hidden = n151 === 3;
                c151.querySelector(".seg-row") && c151.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(nn))));
              }
              fx151.set(v);
              parse151();
            },
          })
        );
        const a151Bits = L.bits(c151, { label: "地址 A2 A1 A0（= A B C）", n: 3, value: a151, names: ["A2", "A1", "A0"], onChange: (v) => ((a151 = v), render151()) });
        const dBits = L.bits(c151, { label: "数据变量 D", n: 1, value: [d151], names: ["D"], onChange: (v) => ((d151 = v[0]), render151()) });
        const sBits = L.bits(c151, { label: "选通 S'（低有效）", n: 1, value: [s151], names: ["S'"], onChange: (v) => ((s151 = v[0]), render151()) });
        let hit151 = [];
        const st151 = L.stage(v151, {
          height: (W) => {
            const p = L.clamp(W / 26, 20, 26);
            return Math.round(16 + 22 + 8 * p + 8 + 74);
          },
          draw(ctx, W, H) {
            if (!tt151) return;
            const p = L.clamp(W / 26, 20, 26);
            const codes = n151 === 4 ? X.reduce151(tt151) : tt151.map(String);
            const addr = a151[0] * 4 + a151[1] * 2 + a151[2];
            const Y = X.eval151(codes, addr, d151, s151);
            const card = cssv("--card", "#f8f6f0");
            const fs = W < 480 ? 10 : 11;
            const tagW = 30;
            const xTag = 10;
            const chipW = L.clamp(W * 0.3, 130, 190);
            const boxL = Math.max(xTag + tagW + 30, (W - chipW) / 2 - 30);
            const boxR = boxL + chipW;
            const boxT = 16;
            const headH = 22;
            const rowY = (i) => boxT + headH + i * p + p / 2;
            const boxB = boxT + headH + 8 * p + 8;
            hit151 = [];
            ctx.fillStyle = card;
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.6;
            ctx.fillRect(boxL, boxT, chipW, boxB - boxT);
            ctx.strokeRect(boxL, boxT, chipW, boxB - boxT);
            L.txt(ctx, "74HC151", (boxL + boxR) / 2, boxT + 12, { size: fs + 1, color: C.ink, align: "center", weight: 600 });
            // D0–D7
            for (let i = 0; i < 8; i++) {
              const y = rowY(i);
              const code = codes[i];
              const v = X.diVal(code, d151);
              const isD = code === "D" || code === "D'";
              ctx.strokeStyle = v ? C.hi : C.ink3;
              ctx.lineWidth = v ? 2 : 1.4;
              ctx.beginPath();
              ctx.moveTo(xTag + tagW, y);
              ctx.lineTo(boxL, y);
              ctx.stroke();
              rr(ctx, xTag, y - 9, tagW, 18, 3);
              ctx.fillStyle = isD ? rgba(C.data, 0.12) : v ? rgba(C.hi, 0.12) : card;
              ctx.fill();
              ctx.strokeStyle = isD ? C.data : v ? C.hi : C.rule;
              ctx.lineWidth = 1.2;
              ctx.stroke();
              if (code === "D'") ovTxt(L, ctx, "D", xTag + tagW / 2, y + 1, { size: 11, color: C.data, align: "center", weight: 600 });
              else L.txt(ctx, code, xTag + tagW / 2, y + 1, { size: 11, color: isD ? C.data : v ? C.hi : C.ink2, align: "center", weight: 600 });
              L.txt(ctx, "D" + i, boxL + 6, y, { size: fs, color: i === addr ? C.ok : C.ink2, weight: i === addr ? 700 : 400 });
            }
            // 选择通路
            const yY = rowY(3);
            const yW = rowY(5);
            if (!s151) {
              ctx.strokeStyle = rgba(C.ok, 0.85);
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 4]);
              ctx.beginPath();
              ctx.moveTo(boxL + 30, rowY(addr));
              ctx.lineTo(boxR - 40, yY);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            L.txt(ctx, "Y", boxR - 8, yY, { size: fs, color: C.ink2, align: "right" });
            L.txt(ctx, "W", boxR - 8, yW, { size: fs, color: C.ink2, align: "right" });
            const xo = Math.min(W - 40, boxR + 60);
            const out = (y, v, inv, name) => {
              let x0 = boxR;
              if (inv) {
                ctx.beginPath();
                ctx.arc(boxR + 4, y, 4, 0, 2 * PI);
                ctx.fillStyle = card;
                ctx.fill();
                ctx.strokeStyle = C.ink;
                ctx.lineWidth = 1.3;
                ctx.stroke();
                x0 += 8;
              }
              ctx.strokeStyle = v ? C.ok : C.ink3;
              ctx.lineWidth = v ? 2.4 : 1.5;
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(xo - 10, y);
              ctx.stroke();
              pin(L, ctx, xo, y, v, { on: C.ok, r: 10 });
              L.txt(ctx, name, xo + 15, y, { size: 12, color: C.ok, weight: 700 });
            };
            out(yY, Y, false, "Y");
            out(yW, 1 - Y, true, "W");
            // 底部：A2 A1 A0 S'
            const bot = [
              { name: "A2", v: a151[0], k: ["a", 0], src: "A" },
              { name: "A1", v: a151[1], k: ["a", 1], src: "B" },
              { name: "A0", v: a151[2], k: ["a", 2], src: "C" },
              { name: "S", v: s151, k: ["s", 0], low: true, src: "" },
            ];
            const sp = chipW / 5;
            bot.forEach((q, j) => {
              const x = boxL + sp * (j + 1);
              const yc = boxB + 44;
              ctx.strokeStyle = q.v ? C.hi : C.ink3;
              ctx.lineWidth = q.v ? 2 : 1.4;
              ctx.beginPath();
              ctx.moveTo(x, yc - 9);
              ctx.lineTo(x, q.low ? boxB + 8 : boxB);
              ctx.stroke();
              if (q.low) {
                ctx.beginPath();
                ctx.arc(x, boxB + 4, 4, 0, 2 * PI);
                ctx.fillStyle = card;
                ctx.fill();
                ctx.strokeStyle = C.ink;
                ctx.lineWidth = 1.3;
                ctx.stroke();
                ovTxt(L, ctx, q.name, x, boxB - 10, { size: fs, color: C.ink2, align: "center" });
              } else L.txt(ctx, q.name, x, boxB - 10, { size: fs, color: C.ink2, align: "center" });
              pin(L, ctx, x, yc, q.v, { r: 9, size: 10 });
              hit151.push({ x, y: yc, k: q.k });
              if (q.src) L.txt(ctx, q.src, x + 13, yc + 2, { size: 11, color: C.data, weight: 600 });
            });
            void H;
          },
        });
        st151.el.classList.add("la-click");
        st151.cvs.addEventListener("click", (e) => {
          const { x, y } = canvasXY(st151.cvs, e);
          const q = hit151.find((h) => Math.hypot(h.x - x, h.y - y) < 15);
          if (!q) return;
          if (q.k[0] === "a") {
            a151[q.k[1]] ^= 1;
            a151Bits.set(a151);
          } else {
            s151 ^= 1;
            sBits.set([s151]);
          }
          render151();
        });
        const tab151 = $h("div", "la-scroll");
        const der151 = $h("div", "la-deriv");
        v151.append(der151, tab151);
        function parse151() {
          const src = fx151.get();
          try {
            const on = parseFunc(src, n151);
            tt151 = Array.from({ length: 1 << n151 }, (_, i) => +on.includes(i));
            err151.innerHTML = "";
          } catch (e) {
            if (!(e instanceof X.ExprError)) throw e;
            err151.innerHTML = errBox(src, e);
          }
          render151();
        }
        function render151() {
          if (!tt151) return;
          st151.redraw();
          const codes = n151 === 4 ? X.reduce151(tt151) : tt151.map(String);
          const addr = a151[0] * 4 + a151[1] * 2 + a151[2];
          const Y = X.eval151(codes, addr, d151, s151);
          const cell = (c) => (c === "D'" ? ov("D") : c === "D" ? "D" : c);
          if (n151 === 4) {
            tab151.innerHTML = `<table class="tt la-red"><thead><tr><th>A B C</th><th>地址</th><th>F（D=0）</th><th>F（D=1）</th><th>Dᵢ 接</th></tr></thead><tbody>
              ${codes
                .map(
                  (c, i) =>
                    `<tr class="${i === addr ? "cur" : ""}"><td>${X.toBin(i, 3).split("").join(" ")}</td><td>D${i}</td><td class="${tt151[2 * i] ? "on" : ""}">${tt151[2 * i]} <span class="la-dim">(m${2 * i})</span></td><td class="${tt151[2 * i + 1] ? "on" : ""}">${tt151[2 * i + 1]} <span class="la-dim">(m${2 * i + 1})</span></td><td class="la-di">${cell(c)}</td></tr>`
                )
                .join("")}</tbody></table>`;
            der151.innerHTML = `<p class="la-p"><b>降维</b>：$Y=\\sum_{i=0}^{7} m_i D_i$，其中 $m_i$ 是 A B C 的最小项。把 4 变量真值表按 A B C 两行一组，每组的两行只差 D：两行 F 都是 0 → $D_i=0$；都是 1 → $D_i=1$；F 与 D 相同 → $D_i=D$；F 与 D 相反 → $D_i=\\overline D$。</p>`;
          } else {
            tab151.innerHTML = `<table class="tt la-red"><thead><tr><th>A B C</th><th>地址</th><th>F</th><th>Dᵢ 接</th></tr></thead><tbody>
              ${codes.map((c, i) => `<tr class="${i === addr ? "cur" : ""}"><td>${X.toBin(i, 3).split("").join(" ")}</td><td>D${i}</td><td class="${tt151[i] ? "on" : ""}">${tt151[i]}</td><td class="la-di">${c}</td></tr>`).join("")}</tbody></table>`;
            der151.innerHTML = `<p class="la-p"><b>直接实现</b>：$Y=\\sum_{i=0}^{7} m_i D_i$。A B C 接地址后，第 i 行的函数值 F 就是 $D_i$：F = 1 的数据端接高电平，F = 0 的接地。</p>`;
          }
          L.renderMath(der151);
          const want = n151 === 4 ? tt151[addr * 2 + d151] : tt151[addr];
          ro.in(n151 === 4 ? `ABCD = ${a151.join("")}${d151}` : `ABC = ${a151.join("")}`);
          ro.st(s151 ? "S' = 1，禁止（Y = 0）" : `选中 D${addr} = ${codes[addr]}`);
          ro.out(`Y = ${Y}`);
          ro.want(s151 ? `F = ${want}（未选通）` : `F = ${want}${Y === want ? " ✓" : " ✗"}`);
        }

        /* ---------- (c) 七段 ---------- */
        const segBits = L.bits(cSeg, { label: "BCD 输入 D C B A（D 为最高位）", n: 4, value: X.toBin(bcd, 4).split("").map(Number), names: ["D", "C", "B", "A"], onChange: (v) => ((bcd = parseInt(v.join(""), 2)), renderSeg()) });
        const rSeg = L.row(cSeg);
        L.button(rSeg, { label: "+1", onClick: () => ((bcd = (bcd + 1) & 15), segBits.set(X.toBin(bcd, 4).split("").map(Number)), renderSeg()) });
        L.button(rSeg, { label: "−1", onClick: () => ((bcd = (bcd + 15) & 15), segBits.set(X.toBin(bcd, 4).split("").map(Number)), renderSeg()) });
        L.bits(cSeg, { label: "LT'（灯测试）· BI'（消隐），低有效", n: 2, value: [ltN, biN], names: ["LT'", "BI'"], onChange: (v) => (([ltN, biN] = v), renderSeg()) });
        L.toggle(cSeg, { label: "6 和 9 带“尾巴”", value: tails, onChange: (v) => ((tails = v), renderSeg()) });
        const stSeg = L.stage(vSeg, {
          height: (W) => (W < 480 ? 300 : 240),
          draw(ctx, W, H) {
            const segs = X.seg4511(bcd, ltN, biN, tails);
            const narrow = W < 480;
            const dw = narrow ? 92 : 104;
            const dh = dw * 1.7;
            const dx = narrow ? 48 : 60;
            const dy = 30;
            // 数码管外壳
            rr(ctx, dx - 22, dy - 16, dw + 44, dh + 32, 8);
            ctx.fillStyle = C.scr;
            ctx.fill();
            // 段
            const th = dw * 0.16;
            const g = th * 0.18;
            const hl = dw - th;
            const vl = (dh - th) / 2;
            const L0 = dx + th / 2;
            const R0 = dx + dw - th / 2;
            const T0 = dy + th / 2;
            const M0 = dy + dh / 2;
            const B0 = dy + dh - th / 2;
            const cx = dx + dw / 2;
            const hseg = (x, y) => {
              ctx.beginPath();
              ctx.moveTo(x - hl / 2 + g, y);
              ctx.lineTo(x - hl / 2 + th / 2 + g, y - th / 2);
              ctx.lineTo(x + hl / 2 - th / 2 - g, y - th / 2);
              ctx.lineTo(x + hl / 2 - g, y);
              ctx.lineTo(x + hl / 2 - th / 2 - g, y + th / 2);
              ctx.lineTo(x - hl / 2 + th / 2 + g, y + th / 2);
              ctx.closePath();
            };
            const vseg = (x, y) => {
              ctx.beginPath();
              ctx.moveTo(x, y - vl / 2 + g);
              ctx.lineTo(x + th / 2, y - vl / 2 + th / 2 + g);
              ctx.lineTo(x + th / 2, y + vl / 2 - th / 2 - g);
              ctx.lineTo(x, y + vl / 2 - g);
              ctx.lineTo(x - th / 2, y + vl / 2 - th / 2 - g);
              ctx.lineTo(x - th / 2, y - vl / 2 + th / 2 + g);
              ctx.closePath();
            };
            const defs = [
              [() => hseg(cx, T0), cx, dy - 26 + 4, "center"],
              [() => vseg(R0, (T0 + M0) / 2), dx + dw + 30, (T0 + M0) / 2, "left"],
              [() => vseg(R0, (M0 + B0) / 2), dx + dw + 30, (M0 + B0) / 2, "left"],
              [() => hseg(cx, B0), cx, dy + dh + 26 - 4, "center"],
              [() => vseg(L0, (M0 + B0) / 2), dx - 30, (M0 + B0) / 2, "right"],
              [() => vseg(L0, (T0 + M0) / 2), dx - 30, (T0 + M0) / 2, "right"],
              [() => hseg(cx, M0), dx + dw + 30, M0, "left"],
            ];
            defs.forEach(([fn, lx, ly, al], i) => {
              fn();
              ctx.fillStyle = segs[i] ? C.hi : rgba(C.scrInk, 0.08);
              ctx.shadowColor = segs[i] ? C.hi : "transparent";
              ctx.shadowBlur = segs[i] ? 12 : 0;
              ctx.fill();
              ctx.shadowBlur = 0;
              L.txt(ctx, "abcdefg"[i], lx, ly, { size: 11, color: segs[i] ? C.hi : C.ink3, align: al, weight: 600 });
            });
            // 右侧（或下方）段码
            const bx = narrow ? 14 : dx + dw + 70;
            const by = narrow ? dy + dh + 56 : dy + 6;
            const cw = narrow ? Math.min(34, (W - 28) / 7) : Math.min(34, (W - bx - 14) / 7);
            L.txt(ctx, `DCBA = ${X.toBin(bcd, 4)}（${bcd}）`, bx, by, { size: 12, color: C.ink, weight: 600 });
            for (let i = 0; i < 7; i++) {
              const x = bx + i * cw;
              L.txt(ctx, "abcdefg"[i], x + cw / 2, by + 24, { size: 11, color: C.ink3, align: "center" });
              rr(ctx, x + 2, by + 34, cw - 4, 24, 3);
              ctx.fillStyle = segs[i] ? C.hi : cssv("--card", "#f8f6f0");
              ctx.fill();
              ctx.strokeStyle = segs[i] ? C.hi : C.rule;
              ctx.stroke();
              L.txt(ctx, String(segs[i]), x + cw / 2, by + 46, { size: 12, color: segs[i] ? "#fff" : C.ink2, align: "center", weight: 600 });
            }
            if (!narrow) {
              const st = !ltN ? "LT' = 0：灯测试，全部段点亮" : !biN ? "BI' = 0：强制消隐" : bcd > 9 ? `${bcd} 不是 BCD 码（伪码），4511 消隐` : `显示 ${bcd}`;
              fitTxt(L, ctx, st, bx, by + 82, W - bx - 12, { size: 12, color: bcd > 9 || !biN ? C.warn : C.ink2, font: "sans" });
            }
            void H;
          },
        });
        const segTab = $h("div", "la-scroll");
        const segNote = $h("p", "la-p");
        vSeg.append(segNote, segTab);
        function renderSeg() {
          stSeg.redraw();
          let rows = "";
          for (let d = 0; d < 16; d++) {
            const s = X.seg4511(d, 1, 1, tails);
            rows += `<tr class="${d === bcd ? "cur" : ""}"><td>${X.toBin(d, 4)}</td><td>${d}</td>${s.map((b) => `<td class="${b ? "on" : ""}">${b}</td>`).join("")}<td>${d > 9 ? '<span class="la-dim">消隐（伪码）</span>' : d}</td></tr>`;
          }
          segTab.innerHTML = `<table class="tt la-segtab"><thead><tr><th>DCBA</th><th>十进制</th>${"abcdefg"
            .split("")
            .map((c) => `<th>${c}</th>`)
            .join("")}<th>显示</th></tr></thead><tbody>${rows}</tbody></table>`;
          segNote.innerHTML = `共阴极数码管：段输入为 1 时点亮。a 在顶，顺时针 b c d e f，g 在中间。${tails ? "6 点亮 a 段、9 点亮 d 段（“带尾巴”；4511 / 7448 本身不带，这里只是对照）。" : "不带尾巴的字形：6 不亮 a，9 不亮 d——4511、7448 都是这样（以所用器件的数据手册为准）。"}${!ltN ? " 当前 LT′ = 0，灯测试优先于一切。" : !biN ? " 当前 BI′ = 0，强制消隐。" : ""}`;
          const segs = X.seg4511(bcd, ltN, biN, tails);
          ro.in(`DCBA = ${X.toBin(bcd, 4)}`);
          ro.st(!ltN ? "灯测试" : !biN ? "消隐" : bcd > 9 ? "伪码 → 消隐" : "正常译码");
          ro.out(`abcdefg = ${segs.join("")}`);
          ro.want(!ltN ? "8（全亮）" : !biN || bcd > 9 ? "不显示" : String(bcd));
        }

        function showMode() {
          c138.hidden = mode !== "138";
          v138.hidden = mode !== "138";
          c151.hidden = mode !== "151";
          v151.hidden = mode !== "151";
          cSeg.hidden = mode !== "seg";
          vSeg.hidden = mode !== "seg";
          if (mode === "138") {
            st138.resize();
            render138();
          } else if (mode === "151") {
            st151.resize();
            render151();
          } else {
            stSeg.resize();
            renderSeg();
          }
        }
        parse151();
        showMode();
        return {
          touch() {
            showMode();
          },
        };
      },
    });
  }

  if (typeof window !== "undefined" && window.Labs && typeof document !== "undefined") registerAll(window.Labs);
  window.LabsLogicA = LogicA;
})();
