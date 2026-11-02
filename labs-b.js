// 《数字电子技术》交互实验 B 组：ff 触发器时序 / counter 任意进制计数器 / fsm 序列检测器 / timer 555 / adc AD·DA
// 纯逻辑部分不依赖 DOM，挂在 window.LabsLogicB 上供 _tests/test-labs-b.js 用 node 验证。
(() => {
  "use strict";

  /* =====================================================================
   * 一、纯逻辑
   * ===================================================================== */
  const NOT = (v) => (v === 0 ? 1 : v === 1 ? 0 : null);

  /* ---------- 1. 触发器 ---------- */
  // 时间轴单位 = 1/4 时钟周期（每个“半拍”分 2 个子格，便于在 CLK=1 期间改变输入以演示透明/空翻）
  const FF_DEV = {
    srnand: { name: "与非型 SR 锁存器", short: "与非SR", ins: ["S", "R"], names: ["S′", "R′"], clk: false, edge: null },
    srnor: { name: "或非型 SR 锁存器", short: "或非SR", ins: ["S", "R"], names: ["S", "R"], clk: false, edge: null },
    dlatch: { name: "门控 D 锁存器（CLK=1 透明）", short: "D锁存", ins: ["D"], names: ["D"], clk: true, edge: null },
    dff: { name: "上升沿 D 触发器", short: "D↑", ins: ["D"], names: ["D"], clk: true, edge: "up" },
    jk: { name: "下降沿 JK 触发器（74HC112）", short: "JK↓", ins: ["J", "K"], names: ["J", "K"], clk: true, edge: "down" },
    tff: { name: "上升沿 T 触发器", short: "T↑", ins: ["T"], names: ["T"], clk: true, edge: "up" },
  };
  function ffClock(n) {
    const c = [];
    for (let i = 0; i < n; i++) c.push(Math.floor(i / 2) % 2);
    return c;
  }
  function jkNext(J, K, q) {
    if (J && !K) return 1;
    if (!J && K) return 0;
    if (!J && !K) return q;
    return NOT(q);
  }
  // inp: { n, D/J/K/T/S/R: 数组, SD/RD: 低有效数组（async=true 时生效）, q0, clk? }
  // 返回 { clk, Q, Qn, viol, asyncOn, edges:[{i,dir,ins,qb,q,ignored}] }
  function ffSim(dev, inp) {
    const n = inp.n;
    const clk = inp.clk || ffClock(n);
    const g = (k, i) => (inp[k] && inp[k][i] != null ? inp[k][i] : 0);
    const D = FF_DEV[dev];
    const Q = [], Qn = [], viol = [], asyncOn = [], edges = [];
    let q = inp.q0 == null ? 0 : inp.q0;
    let qn = NOT(q);
    let prevViol = false;
    const isSR = dev === "srnand" || dev === "srnor";
    for (let i = 0; i < n; i++) {
      let v = false;
      const qb = q;
      if (isSR) {
        let s, r;
        if (dev === "srnand") { s = 1 - g("S", i); r = 1 - g("R", i); }
        else { s = g("S", i); r = g("R", i); }
        if (s && r) { v = true; q = dev === "srnand" ? 1 : 0; qn = q; }
        else if (s) { q = 1; qn = 0; }
        else if (r) { q = 0; qn = 1; }
        else if (prevViol) { q = null; qn = null; } // 约束同时撤销 → 不定
        asyncOn.push(false);
      } else {
        const sd = inp.async ? g("SD", i) : 1;
        const rd = inp.async ? g("RD", i) : 1;
        let edge = null;
        if (i > 0 && D.edge === "up" && clk[i - 1] === 0 && clk[i] === 1) edge = "up";
        if (i > 0 && D.edge === "down" && clk[i - 1] === 1 && clk[i] === 0) edge = "down";
        if (!sd || !rd) {
          asyncOn.push(true);
          if (!sd && !rd) { v = true; q = 1; qn = 1; }
          else if (!sd) { q = 1; qn = 0; }
          else { q = 0; qn = 1; }
          if (edge) edges.push({ i, dir: edge, ins: pick(i - 1), qb: Q[i - 1], q, ignored: true, sd, rd });
        } else {
          asyncOn.push(false);
          if (prevViol) { q = null; qn = null; }
          if (dev === "dlatch") {
            if (clk[i] === 1) { q = g("D", i); qn = NOT(q); }
          } else if (edge) {
            const ins = pick(i - 1);
            const qPrev = q;
            if (dev === "dff") q = ins.D;
            else if (dev === "jk") q = jkNext(ins.J, ins.K, qPrev);
            else if (dev === "tff") q = ins.T ? NOT(qPrev) : qPrev;
            qn = NOT(q);
            edges.push({ i, dir: edge, ins, qb: qPrev, q, ignored: false });
          }
          if (!v && q !== null && qn === q) qn = NOT(q);
        }
      }
      prevViol = v;
      Q.push(q);
      Qn.push(qn);
      viol.push(v);
      void qb;
    }
    function pick(i) {
      const o = {};
      D.ins.forEach((k) => (o[k] = g(k, i)));
      return o;
    }
    return { clk, Q, Qn, viol, asyncOn, edges };
  }

  /* ---------- 2. 74x161 / 74x160 ---------- */
  const CNT_MAX = { 161: 15, 160: 9 };
  function cntNext(chip, s, c) {
    // c: { clr, ld, D, et, ep } ；clr/ld 为引脚电平（低有效）
    if (!c.clr) return 0;
    if (!c.ld) return c.D & 15;
    if (c.et && c.ep) {
      if (+chip === 160) return s >= 9 ? (s === 9 ? 0 : (s + 1) & 15) : s + 1;
      return (s + 1) & 15;
    }
    return s;
  }
  function cntCO(chip, s, et = 1) {
    if (!et) return 0;
    return +chip === 160 ? ((s & 9) === 9 ? 1 : 0) : s === 15 ? 1 : 0;
  }
  // 设计：method = "async"（异步清零，检测 S_N）| "sync"（同步置数，检测 S_{start+N-1}）
  function cntDesign(chip, N, method, start = 0) {
    const max = CNT_MAX[chip];
    if (method === "async") start = 0;
    const det = method === "async" ? N : start + N - 1;
    const ok = N >= 2 && det <= max && (method === "sync" || N <= max);
    const bitsUsed = [3, 2, 1, 0].filter((b) => (det >> b) & 1);
    const pin = method === "async" ? "CLR" : "LD";
    const inner = bitsUsed.map((b) => `Q_${b}`).join("");
    const tex = `\\overline{${pin}}=\\overline{${inner || "1"}}`;
    return { chip: +chip, N, method, start, det, mask: det, bitsUsed, pin, tex, ok, max };
  }
  const detHit = (d, s) => (s & d.mask) === d.mask;
  // 一个时钟沿：返回 { next, transient }
  function cntEdge(d, s) {
    const ld = d.method === "sync" && detHit(d, s) ? 0 : 1;
    let next = cntNext(d.chip, s, { clr: 1, ld, D: d.start, et: 1, ep: 1 });
    let transient = null;
    if (d.method === "async" && detHit(d, next)) {
      transient = next;
      next = cntNext(d.chip, next, { clr: 0 });
    }
    return { next, transient, ld };
  }
  function cntRun(d, s0, edges) {
    const out = [{ s: s0, tr: null }];
    let s = s0;
    for (let k = 0; k < edges; k++) {
      const e = cntEdge(d, s);
      s = e.next;
      out.push({ s, tr: e.transient });
    }
    return out;
  }

  /* ---------- 3. 序列检测器 ---------- */
  function lsp(p, s) {
    for (let L = Math.min(s.length, p.length); L > 0; L--) if (s.endsWith(p.slice(0, L))) return L;
    return 0;
  }
  // type: "mealy" | "moore"
  function buildFSM(p, type, overlap) {
    const m = p.length;
    const ns = type === "mealy" ? m : m + 1;
    const trans = [];
    const out = [];
    const meaning = [];
    for (let k = 0; k < ns; k++) {
      const row = [];
      for (let x = 0; x < 2; x++) {
        const xs = String(x);
        if (type === "mealy") {
          const s = p.slice(0, k) + xs;
          const L = lsp(p, s);
          if (L === m) row.push({ next: overlap ? lsp(p, p.slice(1)) : 0, z: 1 });
          else row.push({ next: L, z: 0 });
        } else {
          const hist = k === m ? (overlap ? p : "") : p.slice(0, k);
          row.push({ next: lsp(p, hist + xs), z: null });
        }
      }
      trans.push(row);
      out.push(type === "moore" ? (k === m ? 1 : 0) : null);
      meaning.push(k === m ? `检测到 ${p}` : k === 0 ? "无有效前缀" : `已收到 ${p.slice(0, k)}`);
    }
    if (type === "moore") trans.forEach((row) => row.forEach((t) => (t.z = out[t.next])));
    return { p, m, type, overlap, ns, trans, out, meaning };
  }
  function fsmRun(f, bits, s0 = 0) {
    const s = [s0];
    const z = [];
    for (let t = 0; t < bits.length; t++) {
      const tr = f.trans[s[t]][bits[t]];
      s.push(tr.next);
      // Mealy：z_t = 输入 x_t 当拍的输出；Moore：x_t 被采样后进入的状态的输出（晚一拍出现）
      z.push(f.type === "mealy" ? tr.z : f.out[tr.next]);
    }
    return { s, z };
  }
  function refDetect(bits, p, overlap) {
    const m = p.length;
    const z = [];
    let last = -1;
    const str = bits.join("");
    for (let t = 0; t < bits.length; t++) {
      const st = t - m + 1;
      let hit = 0;
      if (st >= 0 && str.slice(st, t + 1) === p && (overlap || st > last)) {
        hit = 1;
        last = t;
      }
      z.push(hit);
    }
    return z;
  }
  // 最小化（精确覆盖，变量 ≤ 4）。f: 长度 2^nv 的 0/1/"d"
  function popcnt(x) {
    let c = 0;
    while (x) { c += x & 1; x >>= 1; }
    return c;
  }
  function minimizeSOP(nv, f) {
    const N = 1 << nv;
    const okm = (m) => f[m] === 1 || f[m] === "d";
    const imps = [];
    for (let care = 0; care < N; care++)
      for (let val = 0; val < N; val++) {
        if (val & ~care) continue;
        let all = true, any1 = false;
        for (let mm = 0; mm < N; mm++)
          if ((mm & care) === val) {
            if (!okm(mm)) { all = false; break; }
            if (f[mm] === 1) any1 = true;
          }
        if (all && any1) imps.push({ care, val });
      }
    const contains = (B, A) => (B.care & ~A.care) === 0 && (A.val & B.care) === B.val; // B ⊇ A
    const primes = imps.filter((A) => !imps.some((B) => B !== A && contains(B, A) && B.care !== A.care));
    const ones = [];
    for (let mm = 0; mm < N; mm++) if (f[mm] === 1) ones.push(mm);
    if (!ones.length) return [];
    const covers = (c, mm) => (mm & c.care) === c.val;
    const P = primes.length;
    for (let k = 1; k <= P; k++) {
      let best = null, bestLit = Infinity;
      const idx = [];
      const rec = (st) => {
        if (idx.length === k) {
          if (ones.every((mm) => idx.some((i) => covers(primes[i], mm)))) {
            const lit = idx.reduce((a, i) => a + popcnt(primes[i].care), 0);
            if (lit < bestLit) { bestLit = lit; best = idx.map((i) => primes[i]); }
          }
          return;
        }
        for (let i = st; i < P; i++) { idx.push(i); rec(i + 1); idx.pop(); }
      };
      rec(0);
      if (best) return best;
    }
    return primes;
  }
  const evalSOP = (cubes, mm) => (cubes.some((c) => (mm & c.care) === c.val) ? 1 : 0);
  function sopTex(cubes, names) {
    if (!cubes.length) return "0";
    const nv = names.length;
    return cubes
      .map((c) => {
        let s = "";
        for (let b = nv - 1; b >= 0; b--)
          if ((c.care >> b) & 1) s += (c.val >> b) & 1 ? names[nv - 1 - b] : `\\overline{${names[nv - 1 - b]}}`;
        return s || "1";
      })
      .join("+");
  }
  // 用 D 触发器实现：状态按序号二进制编码，未用编码作无关项
  function fsmImpl(f) {
    const nb = Math.max(1, Math.ceil(Math.log2(f.ns)));
    const nv = nb + 1;
    const names = [];
    for (let b = nb - 1; b >= 0; b--) names.push(`Q_${b}`);
    names.push("X");
    const D = [];
    for (let b = nb - 1; b >= 0; b--) {
      const tab = [];
      for (let mm = 0; mm < 1 << nv; mm++) {
        const code = mm >> 1, x = mm & 1;
        tab.push(code < f.ns ? (f.trans[code][x].next >> b) & 1 : "d");
      }
      const cubes = minimizeSOP(nv, tab);
      D.push({ b, cubes, tex: sopTex(cubes, names) });
    }
    let Z;
    if (f.type === "mealy") {
      const tab = [];
      for (let mm = 0; mm < 1 << nv; mm++) {
        const code = mm >> 1, x = mm & 1;
        tab.push(code < f.ns ? f.trans[code][x].z : "d");
      }
      const cubes = minimizeSOP(nv, tab);
      Z = { cubes, tex: sopTex(cubes, names), nv };
    } else {
      const zn = names.slice(0, nb);
      const tab = [];
      for (let c = 0; c < 1 << nb; c++) tab.push(c < f.ns ? f.out[c] : "d");
      const cubes = minimizeSOP(nb, tab);
      Z = { cubes, tex: sopTex(cubes, zn), nv: nb };
    }
    // 真值验证：所有有效 (状态, X) 组合逐一代入
    let verified = true;
    for (let c = 0; c < f.ns; c++)
      for (let x = 0; x < 2; x++) {
        const mm = (c << 1) | x;
        let nx = 0;
        D.forEach((d) => (nx |= evalSOP(d.cubes, mm) << d.b));
        const z = f.type === "mealy" ? evalSOP(Z.cubes, mm) : evalSOP(Z.cubes, c);
        const want = f.type === "mealy" ? f.trans[c][x].z : f.out[c];
        if (nx !== f.trans[c][x].next || z !== want) verified = false;
      }
    return { nb, names, D, Z, verified };
  }

  /* ---------- 4. 555 定时器 ---------- */
  const LN2 = Math.LN2, LN3 = Math.log(3);
  function th555(VCC, VCO) {
    const v1 = VCO != null ? VCO : (2 / 3) * VCC;
    return { v1, v2: v1 / 2 };
  }
  // 内部 SR 锁存器（阎石功能表）：TR<V_R2 → 置 1（优先）；TH>V_R1 → 置 0；否则保持
  function latch555(q, th, tr, v1, v2) {
    if (tr < v2) return 1;
    if (th > v1) return 0;
    return q;
  }
  function rk4(v, vinf, tau, h) {
    const fd = (y) => (vinf - y) / tau;
    const k1 = fd(v), k2 = fd(v + (h / 2) * k1), k3 = fd(v + (h / 2) * k2), k4 = fd(v + h * k3);
    return v + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  // st: { t, vc, q }；p: { mode:"astable"|"mono", R1,R2,R,C,VCC,VCO, vtr(t), Rdis }
  function step555(st, p, h) {
    const { v1, v2 } = th555(p.VCC, p.VCO);
    let vinf, tau;
    if (p.mode === "astable") {
      if (st.q) { vinf = p.VCC; tau = (p.R1 + p.R2) * p.C; }
      else { vinf = 0; tau = p.R2 * p.C; }
    } else if (st.q) { vinf = p.VCC; tau = p.R * p.C; }
    else { vinf = 0; tau = (p.Rdis || p.R / 300) * p.C; }
    const v0 = st.vc;
    const t0 = st.t;
    const v = rk4(v0, vinf, tau, h);
    st.t = t0 + h;
    st.vc = v;
    const tr = p.mode === "astable" ? v : p.vtr(st.t);
    const q0 = st.q;
    st.q = latch555(st.q, v, tr, v1, v2);
    st.event = null;
    if (st.q !== q0) {
      let tc = st.t;
      const thr = st.q === 0 ? v1 : v2;
      const byVc = p.mode === "astable" || st.q === 0;
      if (byVc && (v0 - thr) * (v - thr) <= 0 && v !== v0) tc = t0 + (h * (thr - v0)) / (v - v0);
      st.event = { t: tc, q: st.q };
    }
    return st;
  }
  function init555(p, t = 0) {
    const st = { t, vc: 0, q: 0, event: null };
    const { v1, v2 } = th555(p.VCC, p.VCO);
    const tr = p.mode === "astable" ? 0 : p.vtr(t);
    st.q = latch555(0, 0, tr, v1, v2);
    return st;
  }
  // 测试用：仿真到 tEnd，返回输出跳变事件
  function sim555(p, tEnd, h) {
    const st = init555(p);
    const ev = [{ t: 0, q: st.q }];
    while (st.t < tEnd) {
      step555(st, p, h);
      if (st.event) ev.push(st.event);
    }
    return ev;
  }

  /* ---------- 5. AD / DA ---------- */
  // 约定：Δ = V_REF / 2^n（简化约定），输出码 0 … 2^n−1
  function quantize(v, n, vref, mode) {
    const d = vref / (1 << n);
    const max = (1 << n) - 1;
    let code = mode === "round" ? Math.floor(v / d + 0.5) : Math.floor(v / d);
    code = Math.max(0, Math.min(max, code));
    return { code, vq: code * d, err: v - code * d, d };
  }
  function sarConvert(v, n, vref) {
    const d = vref / (1 << n);
    let code = 0;
    const steps = [];
    for (let b = n - 1; b >= 0; b--) {
      const trial = code | (1 << b);
      const vdac = trial * d;
      const keep = v >= vdac;
      if (keep) code = trial;
      steps.push({ bit: b, trial, vdac, keep, code });
    }
    return { code, steps, d, vq: code * d };
  }
  // 倒 T 形 R-2R 网络：节点分析（高斯消元）求各支路电流；开关两端都在 0 V（虚地/地）
  function r2rNodal(nb, vref, R) {
    // 节点 0..nb-1：节点 0 接 V_REF（经 R? 不，倒 T 形中 V_REF 直接接最高位节点 A_{nb-1}）
    // 这里令 A[nb-1] = V_REF，A[k] 与 A[k-1] 之间 R，每个 A[k] 经 2R 到 0 V，A[0] 另有 2R 终端电阻到地
    const n = nb; // 未知数：A[0..nb-2]
    const unk = n - 1;
    const M = [];
    for (let k = 0; k < unk; k++) {
      const row = new Array(unk + 1).fill(0);
      const G = 1 / R, G2 = 1 / (2 * R);
      // KCL at A[k]: (Ak - A(k+1))/R + (Ak - A(k-1))/R [k>0] + Ak/2R + (k==0 ? Ak/2R : 0) = 0
      row[k] += G + G2 + (k === 0 ? G2 : G);
      if (k > 0) row[k - 1] -= G;
      if (k + 1 < unk) row[k + 1] -= G;
      else row[unk] += G * vref; // 邻接 A[nb-1] = V_REF
      M.push(row);
    }
    for (let c = 0; c < unk; c++) {
      let piv = c;
      for (let r = c + 1; r < unk; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < unk; r++)
        if (r !== c) {
          const k = M[r][c] / M[c][c];
          for (let j = c; j <= unk; j++) M[r][j] -= k * M[c][j];
        }
    }
    const A = [];
    for (let k = 0; k < unk; k++) A.push(M[k][unk] / M[k][k]);
    A.push(vref);
    const leg = A.map((v) => v / (2 * R)); // 第 k 位支路电流
    const iRef = (vref - A[n - 2 >= 0 ? n - 2 : 0]) / R + vref / (2 * R);
    return { A, leg, iRef };
  }
  function dacR2R(bits /* 高位在前 */, vref, R, Rf = R) {
    const nb = bits.length;
    const nod = r2rNodal(nb, vref, R);
    let iSum = 0;
    bits.forEach((b, i) => {
      const k = nb - 1 - i;
      if (b) iSum += nod.leg[k];
    });
    const val = bits.reduce((a, b) => a * 2 + b, 0);
    return { leg: nod.leg, node: nod.A, iRef: nod.iRef, iSum, vo: -Rf * iSum, voFormula: (-vref / (1 << nb)) * val * (Rf / R), val, I: vref / R };
  }
  const aliasFreq = (f, fs) => Math.abs(f - Math.round(f / fs) * fs);

  const Logic = {
    FF_DEV, ffClock, ffSim, jkNext,
    CNT_MAX, cntNext, cntCO, cntDesign, cntEdge, cntRun, detHit,
    lsp, buildFSM, fsmRun, refDetect, minimizeSOP, evalSOP, sopTex, fsmImpl,
    LN2, LN3, th555, latch555, step555, init555, sim555,
    quantize, sarConvert, r2rNodal, dacR2R, aliasFreq,
  };


  if (typeof window !== "undefined") window.LabsLogicB = Logic;
})();
