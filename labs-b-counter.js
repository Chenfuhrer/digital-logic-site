// 实验 counter：任意进制计数器（L33–L35）。纯逻辑在 labs-b.js（cntDesign / cntEdge / cntCO），这里只做界面。
(() => {
  "use strict";
  const X = window.LabsLogicB;
  if (!window.Labs || !X) return;
  const Labs = window.Labs;

  const alpha = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c);
  const bin4 = (s) => s.toString(2).padStart(4, "0");
  function ln(ctx, x1, y1, x2, y2, color, lw = 1, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
  function poly(ctx, pts, color, lw = 1.4) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }
  function head(ctx, x, y, ang, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s, -s * 0.5);
    ctx.lineTo(-s, s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function dot(ctx, x, y, r, color, fill = true) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  function tw(ctx, L, s, size, font = "mono", w = 400) {
    ctx.font = `${w} ${size}px ${L.FONT[font] || font}`;
    return ctx.measureText(s).width;
  }

  /* ---------- 原理图：74x161 + 检测门（虚拟坐标 360×236，按宽度缩放） ---------- */
  const SVW = 360, SVH = 236;
  function drawSchematic(ctx, W, H, L, M) {
    const C = L.COL;
    const k = Math.min(W / SVW, 1.3);
    ctx.save();
    ctx.translate((W - SVW * k) / 2, (H - SVH * k) / 2);
    ctx.scale(k, k);
    const t = (s, x, y, o = {}) => L.txt(ctx, s, x, y, Object.assign({ size: 10, color: C.ink }, o));
    const d = M.design;
    const s = M.s;
    const cl = 122, ct = 44, cw = 150, ch = 104;
    const cr = cl + cw, cb = ct + ch;
    const target = d.method === "async" ? "CLR′" : "LD′";
    const other = d.method === "async" ? "LD′" : "CLR′";
    const detOut = X.detHit(d, M.shown) ? 0 : 1; // 门输出（低有效）
    const active = detOut === 0;

    // 芯片
    ctx.fillStyle = C.paper;
    ctx.fillRect(cl, ct, cw, ch);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cl, ct, cw, ch);
    t(`74HC${d.chip}`, cl + cw / 2 + 14, ct + ch / 2 - 6, { size: 12, weight: 700, align: "center" });
    t(d.chip === 161 ? "4 位二进制" : "十进制", cl + cw / 2 + 14, ct + ch / 2 + 10, { size: 9.5, color: C.ink3, align: "center", font: "sans" });

    // 顶部 D3..D0
    const px = (j) => cl + 46 + 29 * j; // j=0 → 第 3 位
    for (let j = 0; j < 4; j++) {
      const b = 3 - j;
      const x = px(j);
      ln(ctx, x, ct - 12, x, ct, C.ink, 1.2);
      t(`D${b}`, x, ct + 9, { size: 9, align: "center", color: C.ink2 });
      const v = d.method === "sync" ? (d.start >> b) & 1 : "×";
      t(String(v), x, ct - 19, { size: 10, align: "center", color: v === 1 ? C.hi : C.ink3, weight: 600 });
    }
    // 底部 Q3..Q0：引脚值 + 往下的引线
    const qx = {};
    const used = d.bitsUsed; // 高位在前
    const lineY = (idx) => cb + 18 + 12 * idx;
    for (let j = 0; j < 4; j++) {
      const b = 3 - j;
      const x = px(j);
      qx[b] = x;
      const v = (M.shown >> b) & 1;
      t(`Q${b}`, x, cb - 9, { size: 9, align: "center", color: C.ink2 });
      const ui = used.indexOf(b);
      const yEnd = ui >= 0 ? lineY(ui) : cb + 10;
      ln(ctx, x, cb, x, yEnd, ui >= 0 ? C.data : C.ink3, ui >= 0 ? 1.4 : 1.2);
      if (ui >= 0) dot(ctx, x, yEnd, 2.4, C.data);
      t(String(v), x + 7, cb + 8, { size: 9, color: v ? C.hi : C.ink3, weight: 600 });
    }
    // 右侧 CO
    const co = X.cntCO(d.chip, M.shown);
    ln(ctx, cr, ct + 24, cr + 14, ct + 24, C.ink, 1.2);
    t("CO", cr - 6, ct + 24, { size: 9, align: "right", color: C.ink2 });
    t(`=${co}`, cr + 17, ct + 24, { size: 10, color: co ? C.hi : C.ink3, weight: 600 });
    t(d.chip === 161 ? "Q3Q2Q1Q0·ET" : "Q3Q0·ET", cr + 4, ct + 40, { size: 8, color: C.ink3 });

    // 左侧引脚：CLK、EP、ET、另一个控制端（接 1）、目标端（接检测门）
    const pins = [
      { n: "CLK", y: ct + 16, ext: "CLK", clk: true },
      { n: "EP", y: ct + 35, ext: "1" },
      { n: "ET", y: ct + 52, ext: "1" },
      { n: other, y: ct + 70, ext: "1", bub: true },
      { n: target, y: ct + 90, bub: true, tgt: true },
    ];
    pins.forEach((p) => {
      ln(ctx, cl - 14, p.y, p.bub ? cl - 6 : cl, p.y, p.tgt ? (active ? C.hi : C.ink) : C.ink, p.tgt ? 1.6 : 1.2);
      if (p.bub) {
        ctx.lineWidth = 1.2;
        dot(ctx, cl - 3, p.y, 3, p.tgt && active ? C.hi : C.ink, false);
      }
      if (p.clk) {
        ctx.strokeStyle = C.ink;
        ctx.beginPath();
        ctx.moveTo(cl, p.y - 5);
        ctx.lineTo(cl + 7, p.y);
        ctx.lineTo(cl, p.y + 5);
        ctx.stroke();
      }
      t(p.n, cl + (p.clk ? 10 : 5), p.y, { size: 9, color: p.tgt ? (active ? C.hi : C.ink) : C.ink2, weight: p.tgt ? 700 : 400 });
      if (p.ext) t(p.ext, cl - 18, p.y, { size: 9.5, align: "right", color: p.ext === "CLK" ? C.clk : C.ink3 });
    });

    // 检测门（输出朝左）：k=1 时是反相器，否则与非门
    const n = used.length;
    const y0 = lineY(0), yN = lineY(n - 1);
    const cy = (y0 + yN) / 2;
    const gh = Math.max(24, 12 * n + 8);
    const gx1 = cl - 4, gx0 = gx1 - 34;
    ctx.save();
    ctx.fillStyle = C.paper;
    ctx.strokeStyle = active ? C.hi : C.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (n === 1) {
      ctx.moveTo(gx1, cy - gh / 2);
      ctx.lineTo(gx0, cy);
      ctx.lineTo(gx1, cy + gh / 2);
      ctx.closePath();
    } else {
      const r = gh / 2;
      ctx.moveTo(gx1, cy - r);
      ctx.lineTo(gx0 + r, cy - r);
      ctx.arc(gx0 + r, cy, r, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(gx1, cy + r);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    dot(ctx, gx0 - 3.5, cy, 3.5, ctx.strokeStyle, false);
    ctx.restore();
    // 门输入：从门右侧水平连到对应 Q 的竖线
    used.forEach((b, i) => {
      const y = lineY(i);
      ln(ctx, gx1, y, qx[b], y, C.data, 1.4);
    });
    // 门输出 → 左绕 → 目标引脚
    const wx = cl - 54;
    const tp = pins[4].y;
    poly(ctx, [[gx0 - 7, cy], [wx, cy], [wx, tp], [cl - 14, tp]], active ? C.hi : C.ink, 1.6);
    t(`=${detOut}`, wx - 4, (cy + tp) / 2, { size: 10, align: "right", color: active ? C.hi : C.ink3, weight: 700 });
    // 表达式
    const expr = `${target} = (${used.map((b) => "Q" + b).join("·")})′`;
    t(expr, gx0 - 10, SVH - 10, { size: 10.5, color: C.ink, weight: 600, align: "left" });
    t(`检测 S${d.det}=${bin4(d.det)}`, cr + 14, SVH - 10, { size: 10, color: C.ink2, align: "right", font: "sans" });
    ctx.restore();
  }

  /* ---------- 状态循环图（虚拟坐标 300×236） ---------- */
  const CVW = 300, CVH = 236;
  function drawCycle(ctx, W, H, L, M) {
    const C = L.COL;
    const k = Math.min(W / CVW, 1.3);
    ctx.save();
    ctx.translate((W - CVW * k) / 2, (H - CVH * k) / 2);
    ctx.scale(k, k);
    const d = M.design;
    const N = d.N;
    const r = N > 10 ? 14 : 16;
    const R = Math.max(50, (N * (2 * r + 8)) / (2 * Math.PI));
    const cx = 132, cy = CVH / 2 + 2;
    const states = [];
    for (let i = 0; i < N; i++) states.push(d.start + i);
    const ang = (i) => Math.PI / N + (i * 2 * Math.PI) / N;
    const P = (i, rr = R) => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
    const cur = M.shown;
    // 连线 S_i → S_{i+1}
    const arrowBetween = (a, b, color, dash, lw = 1.3) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L0 = Math.hypot(dx, dy);
      const ux = dx / L0, uy = dy / L0;
      const p0 = [a[0] + ux * (r + 2), a[1] + uy * (r + 2)];
      const p1 = [b[0] - ux * (r + 3), b[1] - uy * (r + 3)];
      ln(ctx, p0[0], p0[1], p1[0], p1[1], color, lw, dash);
      head(ctx, p1[0], p1[1], Math.atan2(uy, ux), 7, color);
    };
    for (let i = 0; i < N - 1; i++) {
      const lastEdge = M.lastFrom === states[i] && !M.lastTr;
      arrowBetween(P(i), P(i + 1), lastEdge ? C.hi : C.ink2, null, lastEdge ? 2 : 1.3);
    }
    // 闭合：异步 → 经过渡态；同步 → 置数
    if (d.method === "async") {
      const tp = [cx + R + 2.6 * r, cy];
      const hot = M.flash > 0;
      arrowBetween(P(N - 1), tp, hot ? C.warn : alpha(C.warn, 0.8), [4, 3]);
      arrowBetween(tp, P(0), hot ? C.warn : alpha(C.warn, 0.8), [4, 3]);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.fillStyle = hot ? alpha(C.warn, 0.25 + 0.5 * M.flash) : C.paper;
      ctx.strokeStyle = C.warn;
      ctx.beginPath();
      ctx.arc(tp[0], tp[1], r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      L.txt(ctx, `S${d.det}`, tp[0], tp[1] - 4, { size: 8.5, color: C.warn, align: "center" });
      L.txt(ctx, bin4(d.det), tp[0], tp[1] + 6, { size: 8.5, color: C.warn, align: "center" });
      L.txt(ctx, "过渡态", tp[0], tp[1] - r - 9, { size: 9.5, color: C.warn, align: "center", font: "sans", weight: 600 });
      L.txt(ctx, "不计入", tp[0], tp[1] + r + 9, { size: 9, color: C.warn, align: "center", font: "sans" });
    } else {
      const hot = M.lastFrom === states[N - 1];
      arrowBetween(P(N - 1), P(0), hot ? C.hi : C.data, null, hot ? 2 : 1.5);
      const lp = [cx + R + r + 6, cy];
      L.txt(ctx, "LD′=0", lp[0], lp[1] - 7, { size: 9, color: C.data, weight: 600 });
      L.txt(ctx, `置入 ${bin4(d.start)}`, lp[0], lp[1] + 7, { size: 9, color: C.data, font: "sans" });
    }
    // 状态圆
    states.forEach((sv, i) => {
      const [x, y] = P(i);
      const on = sv === cur;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? C.hi : C.paper;
      ctx.fill();
      ctx.lineWidth = on ? 2 : 1.3;
      ctx.strokeStyle = on ? C.hi : C.ink;
      ctx.stroke();
      L.txt(ctx, `S${sv}`, x, y - 5, { size: 8.5, color: on ? C.paper : C.ink2, align: "center" });
      L.txt(ctx, bin4(sv), x, y + 5.5, { size: 8.5, color: on ? C.paper : C.ink, align: "center", weight: 600 });
    });
    // 中心说明
    L.txt(ctx, `模 ${N}`, cx, cy - 7, { size: 13, color: C.ink, align: "center", weight: 700, font: "sans" });
    L.txt(ctx, `${N} 个有效状态`, cx, cy + 10, { size: 9.5, color: C.ink3, align: "center", font: "sans" });
    if (!states.includes(cur) && cur !== d.det)
      L.txt(ctx, `当前 S${cur} 不在循环内`, cx, CVH - 6, { size: 9.5, color: C.warn, align: "center", font: "sans" });
    ctx.restore();
  }

  /* ---------- 时序图（暗屏） ---------- */
  const tLayout = (W) => {
    const nar = W < 520;
    const RH = nar ? 25 : 27;
    return { nar, P: nar ? 8 : 12, LW: nar ? 50 : 64, TOP: 22, RH, H: 22 + RH * 8 + 14 };
  };
  function drawTiming(ctx, W, H, L, M) {
    const C = L.COL;
    const G = tLayout(W);
    ctx.fillStyle = C.scr;
    ctx.fillRect(0, 0, W, H);
    const d = M.design;
    const x0 = G.LW, x1 = W - 10;
    const pw = (x1 - x0) / G.P;
    const off = Math.max(0, M.hist.length - G.P);
    const vis = M.hist.slice(off);
    const SUB = 20, TRS = 2; // 过渡态宽 = 1/10 周期（示意：实际只有几十 ns）
    const yb = G.TOP + G.RH * 8;
    // 网格
    ctx.strokeStyle = C.scrGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= G.P; k++) {
      const x = Math.round(x0 + k * pw) + 0.5;
      ctx.moveTo(x, G.TOP);
      ctx.lineTo(x, yb);
    }
    for (let r = 0; r <= 8; r++) {
      const y = Math.round(G.TOP + r * G.RH) + 0.5;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    // 采样数组
    const stAt = (e, j) => (e.tr != null && j < TRS ? e.tr : e.s);
    const arr = (f) => vis.flatMap((e) => Array.from({ length: SUB }, (_, j) => f(e, j)));
    const clk = arr((e, j) => (j < SUB / 2 ? 1 : 0));
    const q = [0, 1, 2, 3].map((b) => arr((e, j) => (stAt(e, j) >> b) & 1));
    const det = arr((e, j) => (d.method === "async" ? (X.detHit(d, stAt(e, j)) ? 0 : 1) : X.detHit(d, e.s) ? 0 : 1));
    const co = arr((e, j) => X.cntCO(d.chip, stAt(e, j)));
    const xe = x0 + vis.length * pw;
    const pin = d.method === "async" ? "CLR′" : "LD′";
    const rows = [
      { lab: "CLK", v: clk, c: C.clk },
      { lab: "Q0", v: q[0], c: C.trace },
      { lab: "Q1", v: q[1], c: C.trace },
      { lab: "Q2", v: q[2], c: C.trace },
      { lab: "Q3", v: q[3], c: C.trace },
      { lab: pin, v: det, c: C.hi },
      { lab: "CO", v: co, c: C.scrInk },
      { lab: "状态", bus: true },
    ];
    // 过渡态阴影（Q 行到检测行）
    vis.forEach((e, k) => {
      if (e.tr == null) return;
      const x = x0 + k * pw;
      const w = Math.max(3, (pw * TRS) / SUB);
      ctx.fillStyle = alpha(C.warn, 0.35);
      ctx.fillRect(x, G.TOP + G.RH, w, G.RH * 5);
      const lab = tw(ctx, L, `过渡S${e.tr}`, 9.5, "sans") < pw * 0.92 ? `过渡S${e.tr}` : `S${e.tr}`;
      L.txt(ctx, lab, x + 2, 11, { size: 9.5, color: C.warn, font: "sans", weight: 600 });
    });
    // 有效沿
    vis.forEach((e, k) => {
      if (off + k === 0) return;
      const x = x0 + k * pw;
      ln(ctx, x + 0.5, G.TOP, x + 0.5, yb, alpha(C.clk, 0.45), 1, [3, 3]);
    });
    rows.forEach((r, i) => {
      const y = G.TOP + G.RH * i + G.RH / 2;
      L.txt(ctx, r.lab, 8, y, { size: G.nar ? 10 : 11, color: r.c || C.scrInk, weight: 600, font: r.lab === "状态" ? "sans" : "mono" });
      if (!vis.length) return;
      if (r.bus) {
        vis.forEach((e, k) => {
          const a = x0 + k * pw, b = a + pw, s = Math.min(4, pw / 4), hh = G.RH * 0.6;
          const cur = k === vis.length - 1;
          ctx.save();
          ctx.strokeStyle = cur ? C.hi : C.scrInk;
          ctx.fillStyle = cur ? alpha(C.hi, 0.25) : "transparent";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(a + 1, y);
          ctx.lineTo(a + 1 + s, y - hh / 2);
          ctx.lineTo(b - 1 - s, y - hh / 2);
          ctx.lineTo(b - 1, y);
          ctx.lineTo(b - 1 - s, y + hh / 2);
          ctx.lineTo(a + 1 + s, y + hh / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          L.txt(ctx, `S${e.s}`, (a + b) / 2, y + 0.5, { size: 9.5, color: C.scrInk, align: "center" });
        });
        return;
      }
      L.wave(ctx, r.v, { x0, x1: xe, y, hgt: G.RH * 0.52, color: r.c, lw: 1.8 });
      if (i === 0) vis.forEach((e, k) => off + k > 0 && L.edgeMark(ctx, x0 + k * pw, y, { dir: "up", color: C.clk, s: 4 }));
    });
    // “现在”标记：最后一个周期下方小三角
    if (vis.length) {
      const xm = x0 + (vis.length - 0.5) * pw;
      ctx.fillStyle = C.hi;
      ctx.beginPath();
      ctx.moveTo(xm, yb + 2);
      ctx.lineTo(xm - 5, yb + 10);
      ctx.lineTo(xm + 5, yb + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- 实验本体 ---------- */
  function make({ canvas, controls, readouts, L }) {
    const M = { chip: 161, method: "async", N: 6, start: 0, hist: [], s: 0, shown: 0, lastFrom: null, lastTr: null, flash: 0, auto: false, acc: 0, speed: 1.5, edges: 0, design: null };

    const pair = L.h("div", "lb-cnt-pair");
    canvas.append(pair);
    const sch = L.stage(pair, { height: (W) => Math.round(SVH * Math.min(W / SVW, 1.3)), draw: (c, W, H) => drawSchematic(c, W, H, L, M) });
    const cyc = L.stage(pair, { height: (W) => Math.round(CVH * Math.min(W / CVW, 1.3)), draw: (c, W, H) => drawCycle(c, W, H, L, M) });
    const tim = L.stage(canvas, { height: (W) => tLayout(W).H, dark: true, draw: (c, W, H) => drawTiming(c, W, H, L, M) });
    const why = L.h("p", "lb-cnt-why");
    canvas.append(why);

    const roMeth = L.readout(readouts, "芯片 / 方法");
    const roState = L.readout(readouts, "当前状态");
    const roGate = L.readout(readouts, "检测门", { html: true });
    const roLoop = L.readout(readouts, "有效循环");
    const roLast = L.readout(readouts, "上一个时钟沿");
    const roCO = L.readout(readouts, "进位 CO");
    let gateKey = "", whyKey = "";

    function redrawAll() {
      sch.redraw();
      cyc.redraw();
      tim.redraw();
    }
    function update() {
      const d = M.design;
      const chipN = `74HC${d.chip}`;
      roMeth(`${chipN} · ${d.method === "async" ? `异步清零法（检测 S${d.det}）` : `同步置数法（检测 S${d.det}）`}`);
      roState(`Q3Q2Q1Q0 = ${bin4(M.s)} = S${M.s}`);
      const gk = d.tex + d.det;
      if (gk !== gateKey) {
        gateKey = gk;
        roGate(`$${d.tex}$<br>检测 S${d.det} = ${bin4(d.det)}，只取其中为 1 的位`);
      }
      const seq = [];
      for (let i = 0; i < d.N; i++) seq.push(d.start + i);
      roLoop((d.N <= 6 ? seq.map((s) => "S" + s).join("→") : `S${seq[0]}→S${seq[1]}→…→S${seq[d.N - 1]}`) + `（模 ${d.N}）`);
      if (M.lastFrom === null) roLast("尚未加时钟（点“单步时钟”）");
      else if (M.lastTr != null) roLast(`S${M.lastFrom} → S${M.lastTr}（过渡）→ 立即清零 S${M.s}`);
      else if (d.method === "sync" && X.detHit(d, M.lastFrom)) roLast(`S${M.lastFrom} 时 LD′=0 → 沿到来置入 S${M.s}`);
      else roLast(`S${M.lastFrom} → S${M.s}（加 1）`);
      const co = X.cntCO(d.chip, M.s);
      const full = d.chip === 161 ? 15 : 9;
      roCO(`${co}（CO=1 需状态 S${full}${seq.includes(full) ? "，本循环会出现" : "，本循环不会出现"}）`);
      const wk = d.method + d.N + d.start + d.chip;
      if (wk !== whyKey) {
        whyKey = wk;
        why.innerHTML =
          d.method === "async"
            ? `<b>为什么异步清零检测 $S_N$：</b>$\\overline{CLR}$ 是异步端，一变 0 立刻清零、不等时钟。计数器必须先真的进入 $S_${d.N}=${bin4(d.N)}$，检测门才输出 0，随即被清成 0000——$S_${d.N}$ 只存在门延迟加清零延迟那么短（几十 ns，图中的窄条是放大示意），不占一个时钟周期，所以有效循环是 $S_0\\sim S_{${d.N - 1}}$ 共 ${d.N} 个状态。代价：过渡态极短，各触发器清零快慢不一时可能清不干净。`
            : `<b>为什么同步置数检测 $S_{N-1}$：</b>$\\overline{LD}$ 是同步端，变 0 只是“预约”，要等下一个 CLK↑ 才把 D3–D0 置入。所以在最后一个有效状态 $S_{${d.det}}=${bin4(d.det)}$ 期间就让 $\\overline{LD}=0$，下一个沿直接回到起点 $S_{${d.start}}$——没有过渡态，每个状态都占满一个时钟周期，循环 $S_{${d.start}}\\sim S_{${d.det}}$ 共 ${d.N} 个状态${d.start ? `（起点非零时检测状态 = 起点 + N − 1 = ${d.start}+${d.N}−1 = ${d.det}）` : ""}。`;
        L.renderMath(why);
      }
    }
    function reset() {
      M.design = X.cntDesign(M.chip, M.N, M.method, M.start);
      M.s = M.method === "sync" ? M.design.start : 0;
      M.shown = M.s;
      M.hist = [{ s: M.s, tr: null }];
      M.lastFrom = null;
      M.lastTr = null;
      M.flash = 0;
      M.edges = 0;
      redrawAll();
      update();
    }
    function step() {
      const e = X.cntEdge(M.design, M.s);
      M.lastFrom = M.s;
      M.lastTr = e.transient;
      M.s = e.next;
      M.shown = M.s;
      M.hist.push({ s: e.next, tr: e.transient });
      if (M.hist.length > 200) M.hist.splice(0, M.hist.length - 200);
      if (e.transient != null) M.flash = 1;
      M.edges++;
      redrawAll();
      update();
    }
    function clampCfg() {
      const max = X.CNT_MAX[M.chip];
      M.N = Math.max(2, Math.min(M.N, max));
      if (M.method === "sync") M.start = Math.max(0, Math.min(M.start, max - (M.N - 1)));
      nIn.max = max;
      nSl.set(M.N);
      startBits.set([3, 2, 1, 0].map((b) => (M.start >> b) & 1));
      startWrap.classList.toggle("lb-hide", M.method !== "sync");
      startNote.textContent = M.method === "sync" ? `起点可取 0–${max - (M.N - 1)}（保证 起点+N−1 ≤ ${max}）` : "";
    }

    L.seg(controls, {
      label: "芯片",
      options: [{ v: 161, t: "74x161 二进制" }, { v: 160, t: "74x160 十进制" }],
      value: 161,
      onChange: (v) => {
        M.chip = +v;
        clampCfg();
        reset();
      },
    });
    L.seg(controls, {
      label: "方法",
      options: [{ v: "async", t: "异步清零法" }, { v: "sync", t: "同步置数法" }],
      value: "async",
      onChange: (v) => {
        M.method = v;
        clampCfg();
        reset();
      },
    });
    const nSl = L.slider(controls, {
      label: "目标模 N",
      min: 2,
      max: 15,
      step: 1,
      value: M.N,
      fmt: (v) => `N = ${v}`,
      onInput: (v) => {
        M.N = v;
        clampCfg();
        reset();
      },
    });
    const nIn = nSl.el.querySelector("input");
    const startWrap = L.h("div", "lb-cnt-start");
    controls.append(startWrap);
    const startBits = L.bits(startWrap, {
      label: "置入值 D3–D0（循环起点）",
      n: 4,
      names: ["D3", "D2", "D1", "D0"],
      value: [0, 0, 0, 0],
      onChange: (b) => {
        M.start = b.reduce((a, x) => a * 2 + x, 0);
        clampCfg();
        reset();
      },
    });
    const startNote = L.h("p", "lb-cnt-hint");
    startWrap.append(startNote);
    const r1 = L.row(controls);
    L.button(r1, { label: "单步时钟 ↑", kind: "primary", onClick: step });
    L.button(r1, { label: "复位到起点", onClick: reset });
    L.toggle(controls, {
      label: "自动运行",
      value: false,
      onChange: (v) => {
        M.auto = v;
        M.acc = 0;
      },
    });
    L.slider(controls, {
      label: "自动运行速度",
      min: 0.5,
      max: 5,
      step: 0.5,
      value: M.speed,
      fmt: (v) => `${v} 拍/秒`,
      onInput: (v) => (M.speed = v),
    });
    controls.append(Object.assign(L.h("p", "lb-cnt-hint"), { textContent: "先预测：再来一个 CLK↑，Q3–Q0 会变成多少？检测门会不会动作？然后点“单步时钟”验证。" }));

    clampCfg();
    reset();
    return {
      frame(dt) {
        if (M.auto) {
          M.acc += dt;
          if (M.acc >= 1 / M.speed) {
            M.acc = 0;
            step();
          }
        }
        if (M.flash > 0) {
          M.flash = Math.max(0, M.flash - dt * 1.2);
          cyc.redraw();
        }
      },
      touch() {
        redrawAll();
        update();
      },
    };
  }

  Labs.register("counter", {
    title: "任意进制计数器：74x161 / 74x160",
    desc:
      "选芯片、方法和目标模 N，自动生成检测门、状态循环图和时序图。异步清零法检测 $S_N$（会出现一闪而过的过渡态），同步置数法检测 $S_{N-1}$（或 起点+N−1）。单步加时钟，看检测门何时动作。",
    note:
      "器件规则：74x161 为 4 位同步二进制计数器，$\\overline{CLR}$ 异步清零（低有效，优先级最高），$\\overline{LD}$ 同步置数（低有效，下一个 CLK↑ 才置入 D3–D0），EP=ET=1 时计数，$CO=Q_3Q_2Q_1Q_0\\cdot ET$；74x160 为同步十进制，$CO=Q_3Q_0\\cdot ET$。检测门只取检测状态中为 1 的位相与非（例如 N=6 异步清零：$\\overline{CLR}=\\overline{Q_2Q_1}$；同步置数检测 S5：$\\overline{LD}=\\overline{Q_2Q_0}$），因为循环中比它小的状态不可能同时含这些 1。时序图中过渡态的宽度为示意（放大到 1/10 周期），实际只有几十 ns。",
    make,
  });
})();
