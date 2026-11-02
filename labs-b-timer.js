// 实验 timer：555 定时器（L38–L41）。纯逻辑（RC 指数仿真、内部锁存器）在 labs-b.js（window.LabsLogicB），这里只做界面。
(() => {
  "use strict";
  const X = window.LabsLogicB;
  if (!window.Labs || !X) return;
  const Labs = window.Labs;
  const PI = Math.PI;

  /* ---------- 小工具（本文件私有） ---------- */
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
  const setFont = (L, ctx, size, weight = 400, font = "mono") => (ctx.font = `${weight} ${size}px ${L.FONT[font] || font}`);
  function fitTxt(L, ctx, s, x, y, maxW, o = {}) {
    let size = o.size || 12;
    setFont(L, ctx, size, o.weight, o.font);
    while (size > 7.5 && ctx.measureText(s).width > maxW) {
      size -= 0.5;
      setFont(L, ctx, size, o.weight, o.font);
    }
    L.txt(ctx, s, x, y, Object.assign({}, o, { size }));
    return size;
  }
  function tagTxt(L, ctx, s, x, y, o = {}) {
    const size = o.size || 10.5;
    setFont(L, ctx, size, o.weight || 400, o.font);
    const w = ctx.measureText(s).width;
    const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    ctx.fillStyle = o.bg;
    ctx.fillRect(x0 - 3, y - size * 0.65, w + 6, size * 1.3);
    L.txt(ctx, s, x, y, Object.assign({}, o, { size }));
    return w;
  }
  function line(ctx, pts, color, lw = 1.4, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.restore();
  }
  function arrowHead(ctx, x, y, ang, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(ang - 0.45), y - s * Math.sin(ang - 0.45));
    ctx.lineTo(x - s * Math.cos(ang + 0.45), y - s * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }
  function sec(parent, title, cls = "") {
    const s = $h("section", "lb2-sec " + cls);
    if (title) s.append($h("h4", "lb2-h", title));
    parent.append(s);
    return s;
  }
  function subhead(parent, text) {
    const d = $h("div", "lb2-ctl-h", Labs.esc(text));
    parent.append(d);
    return d;
  }
  // 有效数字格式化
  const sig = (v, n = 3) => {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a === 0) return "0";
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
    return v.toFixed(Math.min(d, 6)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  };
  // 时间：自动选 s / ms / μs
  function fmtT(t) {
    const a = Math.abs(t);
    if (a >= 1) return { v: sig(t), u: "s", k: 1 };
    if (a >= 1e-3) return { v: sig(t * 1e3), u: "ms", k: 1e3 };
    return { v: sig(t * 1e6), u: "μs", k: 1e6 };
  }
  const tStr = (t) => {
    const o = fmtT(t);
    return `${o.v} ${o.u}`;
  };
  function fStr(f) {
    if (f >= 1e6) return `${sig(f / 1e6)} MHz`;
    if (f >= 1e3) return `${sig(f / 1e3)} kHz`;
    return `${sig(f)} Hz`;
  }
  function rStr(r) {
    if (r >= 1e6) return `${sig(r / 1e6)} MΩ`;
    if (r >= 1e3) return `${sig(r / 1e3)} kΩ`;
    return `${sig(r)} Ω`;
  }
  function cStr(c) {
    if (c >= 1e-6) return `${sig(c * 1e6)} μF`;
    if (c >= 1e-9) return `${sig(c * 1e9)} nF`;
    return `${sig(c * 1e12)} pF`;
  }
  // TeX 中的单位
  const texU = (s) => s.replace(/μ/g, "\\mu ").replace(/Ω/g, "\\Omega").replace(/ /g, "\\,");
  // E6 系列：电阻 1 kΩ–1 MΩ，电容 1 nF–10 μF
  const E6 = [1, 1.5, 2.2, 3.3, 4.7, 6.8];
  const RLIST = [];
  [1e3, 1e4, 1e5].forEach((d) => E6.forEach((m) => RLIST.push(+(m * d).toPrecision(3))));
  RLIST.push(1e6);
  const CLIST = [];
  [1e-9, 1e-8, 1e-7, 1e-6].forEach((d) => E6.forEach((m) => CLIST.push(+(m * d).toPrecision(3))));
  CLIST.push(1e-5);
  const idxOf = (list, v) => list.reduce((bi, x, i) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(list[bi] / v)) ? i : bi), 0);
  // 可复现的伪随机数（噪声用）
  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 仿真（调用 LabsLogicB 的 init555 / step555 / latch555） ---------- */
  // 返回 { t:[], vc:[], th:[], tr:[], q:[], ev:[], tEnd, vin? }
  function simAstable(R1, R2, C, VCC) {
    const T = X.LN2 * (R1 + 2 * R2) * C;
    const tUp = X.LN3 * (R1 + R2) * C; // 首次从 0 充到 2/3 V_CC
    const tEnd = tUp + 3.1 * T;
    const h = T / 500;
    const p = { mode: "astable", R1, R2, C, VCC };
    const st = X.init555(p);
    const o = { t: [0], vc: [0], th: [0], tr: [0], q: [st.q], ev: [{ t: 0, q: st.q }], tEnd };
    while (st.t < tEnd) {
      X.step555(st, p, h);
      o.t.push(st.t);
      o.vc.push(st.vc);
      o.th.push(st.vc);
      o.tr.push(st.vc);
      o.q.push(st.q);
      if (st.event) o.ev.push(st.event);
    }
    return o;
  }
  function simMono(R, C, VCC, tTrig, wTrig) {
    const tw = X.LN3 * R * C;
    const tEnd = tTrig + Math.max(tw, wTrig) + 1.3 * tw;
    const h = tw / 1500;
    const vtr = (t) => (t >= tTrig && t < tTrig + wTrig ? 0 : VCC);
    const p = { mode: "mono", R, C, VCC, vtr };
    const st = X.init555(p);
    const o = { t: [0], vc: [0], th: [0], tr: [vtr(0)], q: [st.q], ev: [{ t: 0, q: st.q }], tEnd };
    while (st.t < tEnd) {
      X.step555(st, p, h);
      o.t.push(st.t);
      o.vc.push(st.vc);
      o.th.push(st.vc);
      o.tr.push(vtr(st.t));
      o.q.push(st.q);
      if (st.event) o.ev.push(st.event);
    }
    return o;
  }
  // 施密特：TH 与 TR 并接输入 v_I；另算一个阈值取中点的无回差比较器（同样反相输出）
  function simSchmitt(VCC, VCO, shape, amp, noise, seed) {
    const { v1, v2 } = X.th555(VCC, VCO);
    const mid = (v1 + v2) / 2;
    const N = 900;
    const fIn = 1000;
    const tEnd = 2 / fIn;
    const rnd = mulberry32(seed);
    let nz = 0;
    const o = { t: [], vin: [], th: [], tr: [], q: [], qc: [], tEnd, mid, v1, v2, flips: 0, flipsC: 0, nMin: 0, nMax: 0 };
    let q = 1;
    let qc = 1;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tEnd;
      const ph = 2 * PI * fIn * t;
      const base = shape === "tri" ? (2 / PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
      nz = 0.55 * nz + 0.45 * (rnd() * 2 - 1);
      const nv = noise * nz * 1.6;
      o.nMin = Math.min(o.nMin, nv);
      o.nMax = Math.max(o.nMax, nv);
      const v = L_clamp(mid + amp * base + nv, 0, VCC);
      const q2 = X.latch555(q, v, v, v1, v2);
      const qc2 = v > mid ? 0 : 1;
      if (i && q2 !== q) o.flips++;
      if (i && qc2 !== qc) o.flipsC++;
      q = q2;
      qc = qc2;
      o.t.push(t);
      o.vin.push(v);
      o.th.push(v);
      o.tr.push(v);
      o.q.push(q);
      o.qc.push(qc);
    }
    return o;
  }
  const L_clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ---------- 注册 ---------- */
  Labs.register("timer", {
    title: "555 定时器",
    desc: "同一块 555，外接不同的 R、C 就成了三种电路：多谐振荡器（自己振荡）、单稳态触发器（触发一次出一个定宽脉冲）、施密特触发器（带回差的整形）。示波器里的 $v_C$ 由 RC 指数充放电逐步仿真得到；扫描光标走到哪里，右侧内部框图就高亮那一刻在起作用的比较器、锁存器状态和放电管通断。",
    note: String.raw`<b>内部</b>：三个 5 kΩ 电阻分压得 $V_{R1}=\tfrac23V_{CC}$、$V_{R2}=\tfrac13V_{CC}$（控制端 CO 外加 $V_{CO}$ 时变为 $V_{CO}$ 与 $V_{CO}/2$）。$v_{TH}>V_{R1}$ → $C_1$ 输出低 → 锁存器置 0，放电管导通；$v_{TR}\lt V_{R2}$ → $C_2$ 输出低 → 置 1（两者同时成立时置 1 优先），放电管截止；否则保持。<br><b>多谐</b>：$v_C$ 在 $\tfrac13V_{CC}$ 与 $\tfrac23V_{CC}$ 之间往返，充电经 $R_1+R_2$、放电只经 $R_2$，$t_{PH}=(R_1+R_2)C\ln2$，$t_{PL}=R_2C\ln2$，$T=(R_1+2R_2)C\ln2\approx0.7(R_1+2R_2)C$，占空比 $q=\frac{R_1+R_2}{R_1+2R_2}>50\%$。第一个高电平更长，因为电容从 0 V 而不是从 $\tfrac13V_{CC}$ 开始充。<br><b>单稳</b>：$v_C$ 从 0 充到 $\tfrac23V_{CC}$，$t_w=RC\ln3\approx1.1RC$。触发负脉冲必须在 $t_w$ 结束前撤销，否则 TR 仍低于 $\tfrac13V_{CC}$、置 1 优先，输出被拉宽到触发撤销为止——这时要在 TR 前加 RC 微分电路，把宽脉冲变成窄的负尖脉冲。<br><b>施密特</b>：TH、TR 并接输入，$V_{T+}=\tfrac23V_{CC}$、$V_{T-}=\tfrac13V_{CC}$，回差 $\Delta V_T=\tfrac13V_{CC}$（加 $V_{CO}$ 后 $\Delta V_T=V_{CO}/2$），输出与输入反相。只要噪声峰峰值小于回差，输入每越过一次阈值区，输出只翻转一次；无回差比较器（阈值取两者中点）在过零附近会被噪声反复触发。<br>理想化：输出高电平按 $V_{CC}$ 画，未计输出级压降、比较器延迟和放电管饱和压降；单稳放电电阻按 $R/300$ 估计。`,
    make({ canvas, controls, readouts, L }) {
      const C = L.COL;
      const S = {
        mode: "astable",
        VCC: 12,
        R1: 10e3,
        R2: 10e3,
        C: 10e-9,
        R: 10e3,
        Cm: 10e-9,
        wk: 0.25, //  触发脉宽 / t_w
        shape: "sin",
        amp: 4,
        noise: 0.5,
        useCO: false,
        VCO: 8,
        seed: 7,
      };
      let sim = null;
      let tc = 0; //    光标时间
      let sweep = 0; // 0..1
      let sweepDur = 5;
      let statusStr = "";

      /* ---- 控件 ---- */
      L.seg(controls, {
        label: "电路",
        options: [
          { v: "astable", t: "多谐振荡器" },
          { v: "mono", t: "单稳态" },
          { v: "schmitt", t: "施密特" },
        ],
        value: S.mode,
        onChange: (v) => ((S.mode = v), rebuild(true)),
      });
      L.seg(controls, {
        label: "电源 V_CC",
        options: [
          { v: "5", t: "5 V" },
          { v: "12", t: "12 V" },
        ],
        value: "12",
        onChange: (v) => {
          S.VCC = +v;
          S.VCO = L.clamp(S.VCO, 0.3 * S.VCC, 0.9 * S.VCC);
          coS.set(S.VCO);
          S.amp = Math.min(S.amp, S.VCC / 2);
          ampS.set(S.amp);
          rebuild(true);
        },
      });
      const gA = $h("div", "lb2-grp");
      const gM = $h("div", "lb2-grp");
      const gS = $h("div", "lb2-grp");
      controls.append(gA, gM, gS);
      const rSlider = (g, label, key) =>
        L.slider(g, { label, min: 0, max: RLIST.length - 1, step: 1, value: idxOf(RLIST, S[key]), fmt: (i) => rStr(RLIST[i]), onInput: (i) => ((S[key] = RLIST[i]), rebuild(false)) });
      const cSlider = (g, label, key) =>
        L.slider(g, { label, min: 0, max: CLIST.length - 1, step: 1, value: idxOf(CLIST, S[key]), fmt: (i) => cStr(CLIST[i]), onInput: (i) => ((S[key] = CLIST[i]), rebuild(false)) });
      subhead(gA, "外接元件（E6 系列）");
      rSlider(gA, "R1", "R1");
      rSlider(gA, "R2", "R2");
      cSlider(gA, "C", "C");
      subhead(gM, "外接元件（E6 系列）");
      rSlider(gM, "R", "R");
      cSlider(gM, "C", "Cm");
      L.slider(gM, { label: "触发负脉冲宽度", min: 0.05, max: 1.6, step: 0.05, value: S.wk, fmt: (v) => `${v.toFixed(2)} × t_w`, onInput: (v) => ((S.wk = v), rebuild(false)) });
      const rT = L.row(gM);
      L.button(rT, { label: "触发 ▼（负脉冲）", kind: "primary", onClick: () => rebuild(true) });
      subhead(gS, "输入信号 v_I（1 kHz）");
      L.seg(gS, {
        label: "波形",
        options: [
          { v: "sin", t: "正弦" },
          { v: "tri", t: "三角" },
        ],
        value: S.shape,
        onChange: (v) => ((S.shape = v), rebuild(false)),
      });
      const ampS = L.slider(gS, { label: "幅度（峰值）", min: 0.5, max: 6, step: 0.1, value: S.amp, fmt: (v) => `${v.toFixed(1)} V`, onInput: (v) => ((S.amp = Math.min(v, S.VCC / 2)), rebuild(false)) });
      L.slider(gS, { label: "噪声", min: 0, max: 2, step: 0.05, value: S.noise, fmt: (v) => `±${v.toFixed(2)} V`, onInput: (v) => ((S.noise = v), rebuild(false)) });
      const rN = L.row(gS);
      L.button(rN, { label: "换一组噪声", onClick: () => ((S.seed = (S.seed * 7919 + 13) % 100003), rebuild(false)) });
      L.toggle(gS, { label: "控制端 CO 外加 V_CO", value: S.useCO, onChange: (v) => ((S.useCO = v), (coS.el.hidden = !v), rebuild(false)) });
      const coS = L.slider(gS, { label: "V_CO", min: 1.5, max: 10.8, step: 0.1, value: S.VCO, fmt: (v) => `${v.toFixed(1)} V`, onInput: (v) => ((S.VCO = L.clamp(v, 0.3 * S.VCC, 0.9 * S.VCC)), rebuild(false)) });
      coS.el.classList.add("lb2-field");
      coS.el.hidden = true;

      /* ---- 左侧 ---- */
      const sScope = sec(canvas, "示波器");
      const alertBox = $h("div", "lb2-alert");
      alertBox.setAttribute("role", "status");
      const sBlk = sec(canvas, "555 内部简化框图（随光标时刻高亮）");
      const sF = sec(canvas, "公式代入");
      const fBox = $h("div", "lb2-formula");
      sF.append(fBox);

      const roA = L.readout(readouts, "f");
      const roB = L.readout(readouts, "T");
      const roC = L.readout(readouts, "—");
      const roD = L.readout(readouts, "—");
      const roE = L.readout(readouts, "—");
      const dts = readouts.querySelectorAll("dt");

      /* ---- 示波器（暗屏） ---- */
      const thr = () => X.th555(S.VCC, S.mode === "schmitt" && S.useCO ? S.VCO : null);
      function channels() {
        const V = S.VCC;
        const { v1, v2 } = thr();
        if (S.mode === "astable")
          return [
            { name: "v_C", sub: "=TH=TR", arr: sim.vc, h: 118, color: C.trace, thr: [{ v: v1, l: `⅔V_CC = ${sig(v1)} V`, pos: "above" }, { v: v2, l: `⅓V_CC = ${sig(v2)} V`, pos: "below" }] },
            { name: "v_O", sub: "③", arr: sim.q, dig: true, h: 84, color: C.clk },
          ];
        if (S.mode === "mono")
          return [
            { name: "v_I", sub: "→TR②", arr: sim.tr, h: 60, color: C.scrInk, thr: [{ v: v2, l: `⅓V_CC = ${sig(v2)} V`, pos: "above" }] },
            { name: "v_C", sub: "=TH", arr: sim.vc, h: 104, color: C.trace, thr: [{ v: v1, l: `⅔V_CC = ${sig(v1)} V`, pos: "above" }] },
            { name: "v_O", sub: "③", arr: sim.q, dig: true, h: 64, color: C.clk },
          ];
        return [
          { name: "v_I", sub: "=TH=TR", arr: sim.vin, h: 132, color: C.trace, thr: [{ v: v1, l: `V_T+ = ${sig(v1)} V`, pos: "above" }, { v: v2, l: `V_T− = ${sig(v2)} V`, pos: "below" }, { v: sim.mid, l: "无回差阈值", pos: "left" }] },
          { name: "v_O", sub: "施密特", arr: sim.q, dig: true, h: 60, color: C.clk },
          { name: "v_O′", sub: "比较器", arr: sim.qc, dig: true, h: 60, color: C.warn },
        ];
      }
      const GAP = 14;
      const scopeH = () => {
        if (!sim) return 300;
        const ch = channels();
        return 12 + ch.reduce((a, c) => a + c.h, 0) + GAP * (ch.length - 1) + 36;
      };
      function niceStep(x) {
        const p = Math.pow(10, Math.floor(Math.log10(x)));
        const m = x / p;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
      }
      function dimH(ctx, xa, xb, y, label, color, bg, lift = 0) {
        line(ctx, [[xa, y], [xb, y]], color, 1.2);
        arrowHead(ctx, xa, y, PI, 6, color);
        arrowHead(ctx, xb, y, 0, 6, color);
        setFont(L, ctx, 10.5, 600);
        const w = ctx.measureText(label).width;
        const cx = L.clamp((xa + xb) / 2, 4 + w / 2, scope.W - 4 - w / 2);
        tagTxt(L, ctx, label, cx, y - 10 - lift, { size: 10.5, color, align: "center", weight: 600, bg });
        return { a: cx - w / 2 - 3, b: cx + w / 2 + 3 };
      }
      const scope = L.stage(sScope, {
        dark: true,
        height: () => scopeH(),
        draw(ctx, W, H) {
          if (!sim) return;
          const bg = cssv("--scr", "#111316");
          const x0 = 50;
          const x1 = W - 10;
          const tEnd = sim.tEnd;
          const xOf = (t) => x0 + (t / tEnd) * (x1 - x0);
          const V = S.VCC;
          const ch = channels();
          // 时间轴网格
          const tu = fmtT(tEnd);
          const step = niceStep((tEnd * tu.k) / 5) / tu.k;
          let y = 12;
          const bands = ch.map((c) => {
            const b = { c, yT: y, yB: y + c.h };
            y += c.h + GAP;
            return b;
          });
          const yAxis = H - 26;
          ctx.strokeStyle = C.scrGrid;
          ctx.lineWidth = 1;
          for (let t = 0; t <= tEnd * 1.0001; t += step) {
            const x = Math.round(xOf(t)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 12);
            ctx.lineTo(x, yAxis);
            ctx.stroke();
            L.txt(ctx, sig(t * tu.k, 3), x, yAxis + 10, { size: 9.5, color: C.scrDim, align: "center" });
          }
          L.txt(ctx, `t / ${tu.u}`, 6, yAxis + 10, { size: 9.5, color: C.scrDim });
          const tCur = tc;
          bands.forEach(({ c, yT, yB }) => {
            const top = yT + 6;
            const bot = yB - 4;
            const yv = (v) => bot - (v / V) * (bot - top);
            // 框与 0 / V_CC 刻度
            ctx.strokeStyle = C.scrGrid;
            ctx.strokeRect(x0 + 0.5, yT + 0.5, x1 - x0 - 1, yB - yT - 1);
            L.txt(ctx, `${V}V`, x0 - 4, top + 3, { size: 9, color: C.scrDim, align: "right" });
            L.txt(ctx, "0", x0 - 4, bot - 2, { size: 9, color: C.scrDim, align: "right" });
            const ym = (yT + yB) / 2;
            fitTxt(L, ctx, c.name, 4, ym - 6, x0 - 22, { size: 11.5, color: c.color, weight: 700 });
            fitTxt(L, ctx, c.sub, 4, ym + 9, x0 - 6, { size: 9, color: C.scrDim, font: /[一-鿿]/.test(c.sub) ? "sans" : "mono" });
            // 阈值线
            (c.thr || []).forEach((h) => {
              const yy = yv(h.v);
              line(ctx, [[x0, yy], [x1, yy]], h.pos === "left" ? C.scrDim : C.hi, 1, [4, 4]);
              if (h.pos === "left") tagTxt(L, ctx, h.l, x0 + 4, yy - 8, { size: 9.5, color: C.scrInk, bg, font: "sans" });
              else tagTxt(L, ctx, h.l, x1 - (S.mode === "schmitt" ? 22 : 4), h.pos === "above" ? yy - 8 : yy + 8, { size: 9.5, color: C.hi, align: "right", bg });
            });
            // 波形：光标之前亮、之后暗
            const n = sim.t.length;
            const val = (i) => (c.dig ? c.arr[i] * V : c.arr[i]);
            const path = (from, to) => {
              ctx.beginPath();
              for (let i = from; i <= to && i < n; i++) {
                const x = xOf(sim.t[i]);
                const yy = yv(val(i));
                if (i === from) ctx.moveTo(x, yy);
                else if (c.dig && c.arr[i] !== c.arr[i - 1]) {
                  ctx.lineTo(x, yv(val(i - 1)));
                  ctx.lineTo(x, yy);
                } else ctx.lineTo(x, yy);
              }
              ctx.stroke();
            };
            const ic = idxAt(tCur);
            ctx.lineJoin = "round";
            ctx.strokeStyle = rgba(c.color, 0.28);
            ctx.lineWidth = 1.6;
            path(ic, n - 1);
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 2;
            path(0, ic);
            ctx.fillStyle = c.color;
            ctx.beginPath();
            ctx.arc(xOf(sim.t[ic]), yv(val(ic)), 3.2, 0, 2 * PI);
            ctx.fill();
          });
          // 测量标注
          const dimCol = C.scrInk;
          const bO = bands.find((b) => b.c.name === "v_O");
          const ev = sim.ev || [];
          if (S.mode === "astable" && ev.length >= 4) {
            const ym = (bO.yT + bO.yB) / 2 - 2;
            setFont(L, ctx, 10.5, 600);
            const wl = ctx.measureText("t_PL").width + 6;
            const cl = (xOf(ev[1].t) + xOf(ev[2].t)) / 2, ch2 = (xOf(ev[2].t) + xOf(ev[3].t)) / 2;
            const clash = cl + wl / 2 + 4 > ch2 - wl / 2;
            dimH(ctx, xOf(ev[2].t), xOf(ev[3].t), ym, "t_PH", dimCol, bg);
            dimH(ctx, xOf(ev[1].t), xOf(ev[2].t), ym, "t_PL", dimCol, bg, clash ? 14 : 0);
            const bC = bands[0];
            void bC;
            if (ev.length >= 6) dimH(ctx, xOf(ev[3].t), xOf(ev[5].t), bO.yB - 14, "T", dimCol, bg);
          }
          if (S.mode === "mono") {
            const up = ev.findIndex((e, i) => i > 0 && e.q === 1);
            if (up > 0 && ev[up + 1]) dimH(ctx, xOf(ev[up].t), xOf(ev[up + 1].t), (bO.yT + bO.yB) / 2 + 4, "t_w", dimCol, bg);
          }
          if (S.mode === "schmitt") {
            const bI = bands[0];
            const top = bI.yT + 6, bot = bI.yB - 4;
            const yv = (v) => bot - (v / V) * (bot - top);
            const ya = yv(sim.v1), yb = yv(sim.v2), xx = x1 - 10;
            line(ctx, [[xx, ya], [xx, yb]], C.hi, 1.3);
            arrowHead(ctx, xx, ya, -PI / 2, 6, C.hi);
            arrowHead(ctx, xx, yb, PI / 2, 6, C.hi);
            tagTxt(L, ctx, "ΔV_T", xx - 6, (ya + yb) / 2, { size: 10, color: C.hi, align: "right", weight: 600, bg });
          }
          // 扫描光标
          const xc = xOf(tCur);
          line(ctx, [[xc, 12], [xc, yAxis]], rgba(C.scrInk, 0.55), 1, [2, 3]);
        },
      });
      sScope.append(alertBox);
      function idxAt(t) {
        const a = sim.t;
        let lo = 0, hi = a.length - 1;
        if (t >= a[hi]) return hi;
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (a[m] <= t) lo = m;
          else hi = m;
        }
        return lo;
      }

      /* ---- 内部框图（虚拟坐标 360×252，按宽度缩放） ---- */
      const VW = 360, VH = 252;
      const blkScale = (W) => L.clamp(W / VW, 0.8, 1.45);
      function ovTxt(ctx, s, x, y, o) {
        setFont(L, ctx, o.size, o.weight || 600, o.font);
        const w = ctx.measureText(s).width;
        L.txt(ctx, s, x, y, o);
        const xa = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
        line(ctx, [[xa, y - o.size * 0.7], [xa + w, y - o.size * 0.7]], o.color, 1);
      }
      function stateAt() {
        const i = idxAt(tc);
        const { v1, v2 } = thr();
        const th = sim.th[i], tr = sim.tr[i], q = sim.q[i];
        return { i, v1, v2, th, tr, q, c1: th > v1, c2: tr < v2 };
      }
      const blk = L.stage(sBlk, {
        height: (W) => Math.round(VH * blkScale(W)),
        draw(ctx, W) {
          if (!sim) return;
          const k = blkScale(W);
          const st = stateAt();
          const card = cssv("--card", "#f8f6f0");
          ctx.save();
          ctx.translate(Math.max(0, (W - VW * k) / 2), 0);
          ctx.scale(k, k);
          const ink = C.ink2;
          const T = (s, x, y, o = {}) => L.txt(ctx, s, x, y, Object.assign({ size: 10.5 }, o));
          // 分压器
          line(ctx, [[28, 22], [28, 222]], ink);
          T("V_CC⑧", 6, 11, { size: 10.5, weight: 600, color: C.ink });
          T(`${S.VCC} V`, 34, 27, { size: 9.5, color: C.ink2 });
          [51.5, 120, 190].forEach((yc) => {
            ctx.fillStyle = card;
            ctx.fillRect(23, yc - 12, 10, 24);
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(23, yc - 12, 10, 24);
            T("5k", 19, yc, { size: 9.5, color: C.ink3, align: "right" });
          });
          [[222, 16], [226, 10], [230, 4]].forEach(([yy, w]) => line(ctx, [[28 - w / 2, yy], [28 + w / 2, yy]], C.ink, 1.3));
          const dot = (x, y) => {
            ctx.fillStyle = C.ink;
            ctx.beginPath();
            ctx.arc(x, y, 2.6, 0, 2 * PI);
            ctx.fill();
          };
          dot(28, 81);
          dot(28, 159);
          line(ctx, [[28, 81], [110, 81]], ink);
          line(ctx, [[28, 159], [110, 159]], ink);
          T(`V_R1 ${sig(st.v1)}V`, 38, 72, { size: 9.5, color: C.data });
          T(`V_R2 ${sig(st.v2)}V`, 38, 150, { size: 9.5, color: C.data });
          T(S.mode === "schmitt" && S.useCO ? "CO⑤ 接 V_CO" : "CO⑤", 36, 93, { size: 9, color: S.mode === "schmitt" && S.useCO ? C.warn : C.ink3, font: "mono" });
          // 输入引脚
          line(ctx, [[95, 24], [95, 59], [110, 59]], C.data, 1.6);
          line(ctx, [[95, 234], [95, 181], [110, 181]], C.data, 1.6);
          T("TH⑥", 95, 13, { size: 10.5, weight: 600, color: C.data, align: "center" });
          T("TR②", 95, 244, { size: 10.5, weight: 600, color: C.data, align: "center" });
          T(`${sig(st.th)}V`, 100, 37, { size: 9.5, color: st.c1 ? C.hi : C.ink2 });
          T(`${sig(st.tr)}V`, 100, 207, { size: 9.5, color: st.c2 ? C.hi : C.ink2 });
          // 比较器
          const comp = (yc, act, name, upSign, loSign) => {
            ctx.beginPath();
            ctx.moveTo(110, yc - 22);
            ctx.lineTo(110, yc + 22);
            ctx.lineTo(160, yc);
            ctx.closePath();
            ctx.fillStyle = act ? rgba(C.hi, 0.18) : card;
            ctx.fill();
            ctx.lineWidth = act ? 2.2 : 1.3;
            ctx.strokeStyle = act ? C.hi : C.ink;
            ctx.stroke();
            T(upSign, 115, yc - 11, { size: 10, weight: 700, color: C.ink2 });
            T(loSign, 115, yc + 11, { size: 10, weight: 700, color: C.ink2 });
            T(name, 128, yc, { size: 10.5, weight: 700, color: act ? C.hi : C.ink });
          };
          comp(70, st.c1, "C1", "−", "+");
          comp(170, st.c2, "C2", "−", "+");
          // 比较器输出 → 锁存器
          const o1 = st.c1 ? 0 : 1, o2 = st.c2 ? 0 : 1;
          line(ctx, [[160, 70], [205, 70]], st.c1 ? C.hi : ink, st.c1 ? 2 : 1.3);
          line(ctx, [[160, 170], [205, 170]], st.c2 ? C.hi : ink, st.c2 ? 2 : 1.3);
          T(String(o1), 182, 62, { size: 10, weight: 700, color: st.c1 ? C.hi : C.ink3, align: "center" });
          T(String(o2), 182, 162, { size: 10, weight: 700, color: st.c2 ? C.hi : C.ink3, align: "center" });
          // SR 锁存器
          ctx.fillStyle = card;
          ctx.fillRect(205, 50, 55, 140);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = C.ink;
          ctx.strokeRect(205, 50, 55, 140);
          ovTxt(ctx, "R", 210, 70, { size: 10.5, color: C.ink });
          ovTxt(ctx, "S", 210, 170, { size: 10.5, color: C.ink });
          T("Q", 255, 95, { size: 10.5, weight: 600, align: "right", color: C.ink });
          ovTxt(ctx, "Q", 255, 155, { size: 10.5, color: C.ink, align: "right" });
          T("锁存器", 232, 120, { size: 9.5, align: "center", color: C.ink3, font: "sans" });
          T(`Q=${st.q}`, 232, 136, { size: 12, weight: 700, align: "center", color: st.q ? C.hi : C.ink });
          const act = st.c2 ? "置 1" : st.c1 ? "置 0" : "保持";
          T(act, 232, 152, { size: 9.5, align: "center", color: st.c1 || st.c2 ? C.hi : C.ink3, font: "sans" });
          // 输出缓冲
          line(ctx, [[260, 95], [280, 95]], st.q ? C.hi : ink, 1.5);
          ctx.beginPath();
          ctx.moveTo(280, 84);
          ctx.lineTo(280, 106);
          ctx.lineTo(299, 95);
          ctx.closePath();
          ctx.fillStyle = card;
          ctx.fill();
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          line(ctx, [[299, 95], [322, 95]], st.q ? C.hi : ink, st.q ? 2.2 : 1.5);
          T("v_O③", 324, 95, { size: 10, weight: 700, color: C.ok });
          T(st.q ? `${S.VCC}V` : "0V", 324, 109, { size: 9.5, color: st.q ? C.hi : C.ink3 });
          // 放电管
          const on = !st.q;
          line(ctx, [[260, 155], [280, 155], [280, 190], [292, 190]], ink, 1.3);
          ctx.beginPath();
          ctx.arc(302, 190, 13, 0, 2 * PI);
          ctx.fillStyle = on ? rgba(C.hi, 0.18) : card;
          ctx.fill();
          ctx.strokeStyle = on ? C.hi : C.ink;
          ctx.lineWidth = on ? 2 : 1.3;
          ctx.stroke();
          line(ctx, [[297, 181], [297, 199]], C.ink, 1.8);
          line(ctx, [[297, 186], [306, 179], [306, 135], [324, 135]], on ? C.hi : ink, on ? 2 : 1.3);
          line(ctx, [[297, 194], [306, 201], [306, 222]], on ? C.hi : ink, on ? 2 : 1.3);
          arrowHead(ctx, 305, 200.5, Math.atan2(7, 9), 5, on ? C.hi : C.ink);
          [[222, 14], [226, 9], [230, 4]].forEach(([yy, w]) => line(ctx, [[306 - w / 2, yy], [306 + w / 2, yy]], C.ink, 1.3));
          T("DIS⑦", 326, 135, { size: 10, weight: 600, color: C.data });
          T(`T_D ${on ? "导通" : "截止"}`, 289, 214, { size: 9.5, color: on ? C.hi : C.ink3, align: "right", font: "sans", weight: 600 });
          ctx.restore();
        },
      });
      const blkStatus = $h("p", "lb2-legend");
      sBlk.append(blkStatus);
      const WIRING = {
        astable: "接法：TH、TR 并接电容 $C$；DIS 接 $R_1$、$R_2$ 中点（放电只经 $R_2$）。",
        mono: "接法：触发信号接 TR，TH 与 DIS 并接电容 $C$，$R$ 接 $V_{CC}$。",
        schmitt: "接法：TH、TR 并接输入 $v_I$；DIS 不用（也可经上拉电阻得到另一路输出）。",
      };
      function updStatus() {
        const st = stateAt();
        const s = `<b>光标 t = ${tStr(sim.t[st.i])}</b>：TH = ${sig(st.th)} V ${st.c1 ? "&gt;" : "≤"} V<sub>R1</sub> → C1 输出 ${st.c1 ? "<b class=\"lb2-k-hi\">0（置 0）</b>" : "1"}；TR = ${sig(st.tr)} V ${st.c2 ? "&lt;" : "≥"} V<sub>R2</sub> → C2 输出 ${st.c2 ? "<b class=\"lb2-k-hi\">0（置 1）</b>" : "1"}；锁存器 ${st.c2 ? "置 1" : st.c1 ? "置 0" : "保持"}，Q = ${st.q}，放电管${st.q ? "截止" : "<b class=\"lb2-k-hi\">导通</b>"}。`;
        if (s !== statusStr) {
          statusStr = s;
          blkStatus.innerHTML = s + `<br><span class="lb2-dim">${WIRING[S.mode]}</span>`;
          L.renderMath(blkStatus);
        }
      }

      /* ---- 重建仿真 + 读数 ---- */
      const texQ = (str) => str.replace(/^(\S+) (.+)$/, (m, v, u) => `${v}\\,\\mathrm{${u.replace(/μ/g, "\\mu ").replace(/Ω/g, "\\Omega")}}`);
      const setRo = (labels, vals) => {
        [roA, roB, roC, roD, roE].forEach((fn, i) => fn(vals[i]));
        dts.forEach((d, i) => (d.textContent = labels[i]));
      };
      function rebuild(restart) {
        gA.hidden = S.mode !== "astable";
        gM.hidden = S.mode !== "mono";
        gS.hidden = S.mode !== "schmitt";
        let alert = "", acls = "", ftex = "";
        if (S.mode === "astable") {
          const { R1, R2, C: Cc, VCC } = S;
          sim = simAstable(R1, R2, Cc, VCC);
          const tph = X.LN2 * (R1 + R2) * Cc, tpl = X.LN2 * R2 * Cc, T = tph + tpl, q = (R1 + R2) / (R1 + 2 * R2);
          const ev = sim.ev;
          const Tm = ev.length >= 6 ? ev[5].t - ev[3].t : NaN;
          setRo(["f", "T", "t_PH / t_PL", "占空比 q", "仿真测得 T"], [fStr(1 / T), tStr(T), `${tStr(tph)} / ${tStr(tpl)}`, `${(q * 100).toFixed(1)} %`, isFinite(Tm) ? tStr(Tm) : "—"]);
          ftex = `<div>$t_{PH}=(R_1+R_2)C\\ln2=(${texQ(rStr(R1))}+${texQ(rStr(R2))})\\times${texQ(cStr(Cc))}\\times0.693=${texQ(tStr(tph))}$</div>
            <div>$t_{PL}=R_2C\\ln2=${texQ(rStr(R2))}\\times${texQ(cStr(Cc))}\\times0.693=${texQ(tStr(tpl))}$</div>
            <div>$T=(R_1+2R_2)C\\ln2=${texQ(tStr(T))}$，$f=\\dfrac1T=${texQ(fStr(1 / T))}$</div>
            <div>$q=\\dfrac{R_1+R_2}{R_1+2R_2}=${(q * 100).toFixed(1)}\\%$</div>`;
          alert = `RC 指数仿真测得 T = ${tStr(Tm)}，与公式 ${tStr(T)} 相差 ${(Math.abs(Tm - T) / T * 100).toFixed(2)} %。第一个高电平最长（${tStr(ev[1] ? ev[1].t : NaN)} = (R₁+R₂)C·ln3），因为电容从 0 V 开始充电。`;
          acls = "ok";
        } else if (S.mode === "mono") {
          const { R, Cm, VCC } = S;
          const tw = X.LN3 * R * Cm;
          const wT = S.wk * tw;
          sim = simMono(R, Cm, VCC, 0.3 * tw, wT);
          const ev = sim.ev;
          const up = ev.findIndex((e, i) => i > 0 && e.q === 1);
          const twm = up > 0 && ev[up + 1] ? ev[up + 1].t - ev[up].t : NaN;
          const wide = wT > tw;
          setRo(["t_w（公式）", "输出脉宽（仿真）", "触发脉宽", "R · C", "结论"], [tStr(tw), tStr(twm), tStr(wT), `${rStr(R)} · ${cStr(Cm)}`, wide ? "被触发拉宽 ⚠" : "由 RC 决定 ✓"]);
          ftex = `<div>$t_w=RC\\ln3=${texQ(rStr(R))}\\times${texQ(cStr(Cm))}\\times1.099=${texQ(tStr(tw))}\\approx1.1RC$</div>
            <div>触发负脉冲宽度 $=${S.wk.toFixed(2)}\\,t_w=${texQ(tStr(wT))}$ ${wide ? "$\\gt t_w$" : "$\\lt t_w$"}</div>`;
          if (wide) {
            alert = `<b>触发脉冲（${tStr(wT)}）宽于 t<sub>w</sub>（${tStr(tw)}）</b>：v<sub>C</sub> 已到 ⅔V<sub>CC</sub>，但 TR 仍低于 ⅓V<sub>CC</sub>，置 1 优先，输出被拉宽到 ${tStr(twm)}。需要在 TR 前加 RC <b>微分电路</b>，把宽脉冲变成窄的负尖脉冲。`;
            acls = "warn";
          } else {
            alert = `触发脉冲（${tStr(wT)}）窄于 t<sub>w</sub>：输出脉宽 ${tStr(twm)} 只由 RC 决定，与触发脉宽无关。点“触发 ▼”重新扫描。`;
            acls = "ok";
          }
        } else {
          const VCO = S.useCO ? S.VCO : null;
          sim = simSchmitt(S.VCC, VCO, S.shape, S.amp, S.noise, S.seed);
          const dV = sim.v1 - sim.v2;
          const nPP = sim.nMax - sim.nMin;
          setRo(["V_T+", "V_T−", "回差 ΔV_T", "翻转次数", "噪声峰峰值"], [`${sig(sim.v1)} V`, `${sig(sim.v2)} V`, `${sig(dV)} V`, `施密特 ${sim.flips} · 比较器 ${sim.flipsC}`, `${sig(nPP)} V`]);
          ftex = S.useCO
            ? `<div>$V_{T+}=V_{CO}=${sig(sim.v1)}\\,\\mathrm V$，$V_{T-}=\\tfrac12V_{CO}=${sig(sim.v2)}\\,\\mathrm V$，$\\Delta V_T=\\tfrac12V_{CO}=${sig(dV)}\\,\\mathrm V$</div>`
            : `<div>$V_{T+}=\\tfrac23V_{CC}=${sig(sim.v1)}\\,\\mathrm V$，$V_{T-}=\\tfrac13V_{CC}=${sig(sim.v2)}\\,\\mathrm V$，$\\Delta V_T=\\tfrac13V_{CC}=${sig(dV)}\\,\\mathrm V$</div>`;
          if (S.amp + nPP / 2 < dV / 2) {
            alert = `输入峰值没有越过 V<sub>T+</sub> / V<sub>T−</sub>，施密特输出不翻转；把幅度调大。`;
            acls = "warn";
          } else if (nPP < dV) {
            alert = `噪声峰峰值 ≈ ${sig(nPP)} V &lt; 回差 ${sig(dV)} V：施密特每个输入周期只翻转 2 次（共 ${sim.flips} 次），无回差比较器翻转 ${sim.flipsC} 次。`;
            acls = "ok";
          } else {
            alert = `噪声峰峰值 ≈ ${sig(nPP)} V ≥ 回差 ${sig(dV)} V：连施密特也可能多次翻转（${sim.flips} 次）；无回差比较器 ${sim.flipsC} 次。`;
            acls = "warn";
          }
        }
        alertBox.className = "lb2-alert " + acls;
        alertBox.innerHTML = alert;
        fBox.innerHTML = ftex;
        L.renderMath(fBox);
        if (restart) sweep = Labs.reduceMotion ? 1 : 0;
        tc = Math.min(1, sweep) * sim.tEnd;
        statusStr = "";
        scope.resize();
        blk.resize();
        updStatus();
      }

      sweep = Labs.reduceMotion ? 1 : 0.62;
      rebuild(false);

      return {
        frame(dt) {
          if (Labs.reduceMotion || !sim) return;
          sweep += dt / sweepDur;
          if (sweep > 1.25) sweep = 0;
          tc = Math.min(1, sweep) * sim.tEnd;
          scope.redraw();
          blk.redraw();
          updStatus();
        },
        touch() {
          scope.resize();
          blk.resize();
        },
      };
    },
  });
})();
