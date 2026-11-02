// 实验 ff：触发器时序（L24–L27）。纯逻辑在 labs-b.js（window.LabsLogicB.ffSim），这里只做界面。
(() => {
  "use strict";
  const X = window.LabsLogicB;
  if (!window.Labs || !X) return;
  const Labs = window.Labs;
  const DEVS = X.FF_DEV;

  /* ---------- 小工具（本文件私有） ---------- */
  const alpha = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c);
  const hasCJK = (s) => /[一-鿿]/.test(s);
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
  function tw(ctx, L, s, size, font = "mono", w = 400) {
    ctx.font = `${w} ${size}px ${L.FONT[font] || font}`;
    return ctx.measureText(s).width;
  }
  function runs(n, pred) {
    const out = [];
    let i = 0;
    while (i < n) {
      if (pred(i)) {
        let j = i;
        while (j + 1 < n && pred(j + 1)) j++;
        out.push([i, j]);
        i = j + 1;
      } else i++;
    }
    return out;
  }
  const v2s = (v) => (v === null || v === undefined ? "?" : String(v));
  const inv = (v) => (v === 0 ? 1 : v === 1 ? 0 : "?");

  /* ---------- 默认输入（48 个子格 = 24 个半拍；每个半拍 2 个子格） ---------- */
  const MAXN = 48;
  const bitsOf = (parts) => parts.join("").split("").map(Number);
  const pairs = (a) => a.flatMap((v) => [v, v]);
  // 每 4 个子格 = 1 个时钟周期（CLK：0 0 1 1）。上升沿在 4k+2 格起点，采样 4k+1 格；下降沿在 4k+4 格起点，采样 4k+3 格
  const P_D = bitsOf(["0001", "1100", "0110", "0011", "1001", "1110", "0000", "0100", "1111", "0011", "0110", "0011"]);
  const P_J = bitsOf(["1111", "0000", "1111", "1111", "1111", "0000", "0000", "1111", "0110", "1111", "0000", "1111"]);
  const P_K = bitsOf(["0000", "0000", "1111", "1111", "0000", "1111", "0000", "1111", "0000", "0000", "1111", "1111"]);
  const P_T = bitsOf(["0111", "1111", "0000", "0110", "1111", "0011", "0000", "1111", "1111", "0000", "0110", "1111"]);
  const P_SN = pairs([1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1]);
  const P_RN = pairs([1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1]);
  const ones = () => Array(MAXN).fill(1);
  function defaults(dev) {
    const RD = ones(), SD = ones();
    for (let i = 23; i <= 26; i++) RD[i] = 0; // 覆盖一个下降沿（24）和一个上升沿（26）
    for (let i = 32; i <= 34; i++) SD[i] = 0;
    const o = { SD, RD };
    if (dev === "srnand") Object.assign(o, { S: P_SN.slice(), R: P_RN.slice() });
    else if (dev === "srnor") Object.assign(o, { S: P_SN.map((v) => 1 - v), R: P_RN.map((v) => 1 - v) });
    else if (dev === "jk") Object.assign(o, { J: P_J.slice(), K: P_K.slice() });
    else if (dev === "tff") Object.assign(o, { T: P_T.slice() });
    else Object.assign(o, { D: P_D.slice() });
    return o;
  }

  /* ---------- 特性表 ---------- */
  const TABLES = {
    srnand: { head: ["S′", "R′", "Q", "Q*", "功能"], rows: [[1, 1, 0, 0, "保持"], [1, 1, 1, 1, "保持"], [0, 1, 0, 1, "置 1"], [0, 1, 1, 1, "置 1"], [1, 0, 0, 0, "置 0"], [1, 0, 1, 0, "置 0"], [0, 0, 0, "1*", "违反约束"], [0, 0, 1, "1*", "违反约束"]], foot: "1*：Q=Q′=1；S′、R′ 同时回到 1 后状态不定" },
    srnor: { head: ["S", "R", "Q", "Q*", "功能"], rows: [[0, 0, 0, 0, "保持"], [0, 0, 1, 1, "保持"], [1, 0, 0, 1, "置 1"], [1, 0, 1, 1, "置 1"], [0, 1, 0, 0, "置 0"], [0, 1, 1, 0, "置 0"], [1, 1, 0, "0*", "违反约束"], [1, 1, 1, "0*", "违反约束"]], foot: "0*：Q=Q′=0；S、R 同时回到 0 后状态不定" },
    dlatch: { head: ["CLK", "D", "Q*", "功能"], rows: [[0, "×", "Q", "保持（锁存）"], [1, 0, 0, "透明"], [1, 1, 1, "透明"]], foot: "电平触发：CLK=1 的整段时间 Q 都跟随 D" },
    dff: { head: ["D", "Q", "Q*", "功能"], rows: [[0, 0, 0, "置 0"], [0, 1, 0, "置 0"], [1, 0, 1, "置 1"], [1, 1, 1, "置 1"]], foot: "只在 CLK↑ 那一瞬间采样 D" },
    jk: { head: ["J", "K", "Q", "Q*", "功能"], rows: [[0, 0, 0, 0, "保持"], [0, 0, 1, 1, "保持"], [0, 1, 0, 0, "置 0"], [0, 1, 1, 0, "置 0"], [1, 0, 0, 1, "置 1"], [1, 0, 1, 1, "置 1"], [1, 1, 0, 1, "翻转"], [1, 1, 1, 0, "翻转"]], foot: "只在 CLK↓ 那一瞬间采样 J、K" },
    tff: { head: ["T", "Q", "Q*", "功能"], rows: [[0, 0, 0, "保持"], [0, 1, 1, "保持"], [1, 0, 1, "翻转"], [1, 1, 0, "翻转"]], foot: "只在 CLK↑ 那一瞬间采样 T" },
  };
  const EQ = {
    srnand: "$Q^*=S+\\bar R\\,Q$，约束 $SR=0$（$S=\\overline{S'}$、$R=\\overline{R'}$，低电平有效）",
    srnor: "$Q^*=S+\\bar R\\,Q$，约束 $SR=0$",
    dlatch: "$Q^*=D$（CLK=1 期间，电平触发）",
    dff: "$Q^*=D$（仅 CLK↑ 时刻）",
    jk: "$Q^*=J\\bar Q+\\bar K Q$（仅 CLK↓ 时刻）",
    tff: "$Q^*=T\\oplus Q=T\\bar Q+\\bar T Q$（仅 CLK↑ 时刻）",
  };
  const matchRow = (row, vals) => vals.every((v, k) => row[k] === "×" || row[k] === "Q" || row[k] === v);

  function make({ canvas, controls, readouts, L }) {
    const S = { dev: "jk", halves: 20, async: false, cmp: false, hide: false, q0: 0, hover: null, pin: null, paint: null };
    const data = {};
    const key = () => (S.cmp ? "cmp" : S.dev);
    const get = (k = key()) => data[k] || (data[k] = defaults(k === "cmp" ? "dff" : k));
    const dv = () => DEVS[S.dev];
    const isSR = () => S.dev === "srnand" || S.dev === "srnor";
    const edgeDir = () => (S.cmp ? "up" : dv().edge);

    function sim() {
      const n = S.halves * 2;
      const d = get();
      if (S.cmp) {
        const base = { n, D: d.D, q0: S.q0 };
        return { n, lat: X.ffSim("dlatch", base), ff: X.ffSim("dff", base) };
      }
      return { n, r: X.ffSim(S.dev, Object.assign({ n, q0: S.q0, async: S.async && !isSR() }, d)) };
    }
    function edgeCells(n) {
      const dir = edgeDir();
      const c = X.ffClock(n);
      const out = [];
      if (!dir) return out;
      for (let i = 1; i < n; i++) if ((dir === "up" && !c[i - 1] && c[i]) || (dir === "down" && c[i - 1] && !c[i])) out.push(i);
      return out;
    }
    function rowsSpec() {
      const R = [];
      if (S.cmp) {
        R.push({ k: "CLK", lab: "CLK", t: "clk" }, { k: "D", lab: "D", t: "in" }, { t: "lane" }, { k: "QL", lab: "Q锁存", t: "out" }, { k: "QF", lab: "Q触发", t: "out" });
        return R;
      }
      const d = dv();
      if (d.clk) R.push({ k: "CLK", lab: "CLK", t: "clk" });
      d.ins.forEach((k, i) => R.push({ k, lab: d.names[i], t: "in" }));
      if (S.async && !isSR()) R.push({ k: "SD", lab: "SD′", t: "in", async: true }, { k: "RD", lab: "RD′", t: "in", async: true });
      R.push({ t: "lane" }, { k: "Q", lab: "Q", t: "out" }, { k: "Qn", lab: "Q′", t: "out" });
      return R;
    }
    function layout(W) {
      const nar = W < 520;
      const LW = nar ? 46 : 64, RH = nar ? 30 : 34, LANE = 22, TOP = 20;
      const n = S.halves * 2;
      const x0 = LW, x1 = W - 10;
      let y = TOP;
      const rows = rowsSpec().map((r) => {
        const h = r.t === "lane" ? LANE : RH;
        const o = Object.assign({}, r, { y0: y, y: y + h / 2, h });
        y += h;
        return o;
      });
      return { nar, LW, RH, n, x0, x1, dx: (x1 - x0) / n, rows, top: TOP, H: y + 8 };
    }

    /* ---------- 绘图 ---------- */
    function draw(ctx, W, H) {
      const C = L.COL;
      const G = layout(W);
      const n = G.n;
      const R = sim();
      const clk = X.ffClock(n);
      const d = get();
      const edges = edgeCells(n);
      const xs = (i) => G.x0 + i * G.dx;
      const yTop = G.top, yBot = H - 4;
      const sel = S.hover || S.pin;
      const transparent = S.cmp || S.dev === "dlatch";

      // 透明区（CLK=1）底色
      if (transparent)
        for (let i = 0; i < n; i++)
          if (clk[i]) {
            ctx.fillStyle = alpha(C.paper2, 0.9);
            ctx.fillRect(xs(i), yTop, G.dx + 0.5, yBot - yTop);
          }
      // 半拍网格
      for (let i = 0; i <= n; i += 2) ln(ctx, xs(i) + 0.5, yTop, xs(i) + 0.5, yBot, alpha(C.rule, 0.55));
      // “透明”字样（放得下才写）
      if (S.dev === "dlatch" && !S.cmp && 2 * G.dx >= tw(ctx, L, "透明", 9.5, "sans") + 4)
        for (let i = 1; i < n; i++) if (clk[i] && !clk[i - 1]) L.txt(ctx, "透明", xs(i) + G.dx, 10, { size: 9.5, color: C.ink3, align: "center", font: "sans" });
      // 有效沿：竖向虚线 + 编号
      const numEvery = 4 * G.dx >= 16 ? 1 : 2;
      edges.forEach((e, k) => {
        const x = xs(e);
        const on = sel && sel.kind === "edge" && sel.i === e;
        ln(ctx, x, yTop, x, yBot, on ? C.hi : alpha(C.clk, 0.6), on ? 1.8 : 1, on ? null : [3, 3]);
        if (k % numEvery === 0 || on) L.txt(ctx, String(k + 1), x, 10, { size: 9.5, color: on ? C.hi : C.ink3, align: "center", weight: on ? 700 : 400 });
      });
      // 单元格（锁存器 / 非沿位置）选中：整列描边
      if (sel && sel.kind === "cell") {
        ctx.save();
        ctx.strokeStyle = C.hi;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(xs(sel.i) + 0.5, yTop + 0.5, G.dx - 1, yBot - yTop - 1);
        ctx.restore();
      }

      G.rows.forEach((r) => {
        if (r.t === "lane") return drawLane(ctx, G, R, r);
        const color = r.t === "clk" ? C.clk : r.t === "in" ? (r.async ? C.warn : C.data) : C.ok;
        L.txt(ctx, r.lab, 6, r.y, { size: G.nar ? 10.5 : 12, color, weight: 600, font: hasCJK(r.lab) ? "sans" : "mono" });
        let vals;
        if (r.t === "clk") vals = clk;
        else if (r.t === "in") vals = d[r.k].slice(0, n);
        else if (S.cmp) vals = r.k === "QL" ? R.lat.Q : R.ff.Q;
        else vals = r.k === "Q" ? R.r.Q : R.r.Qn;
        if (r.t === "in") {
          // 可编辑行：浅底 + 子格刻度，提示“可以点”
          ctx.fillStyle = alpha(C.data, 0.05);
          ctx.fillRect(G.x0, r.y0 + 3, G.x1 - G.x0, r.h - 6);
          for (let i = 0; i <= n; i++) ln(ctx, xs(i) + 0.5, r.y0 + r.h - 6, xs(i) + 0.5, r.y0 + r.h - (i % 2 ? 4 : 2), alpha(C.ink3, 0.7));
        }
        if (r.t === "out" && S.hide) {
          ctx.save();
          ctx.strokeStyle = alpha(C.ink3, 0.6);
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(G.x0 + 0.5, r.y0 + 5.5, G.x1 - G.x0 - 1, r.h - 11);
          ctx.restore();
          L.txt(ctx, "？先在纸上画出 " + r.lab + "，再关闭“遮住输出”", (G.x0 + G.x1) / 2, r.y, { size: G.nar ? 9.5 : 11, color: C.ink3, align: "center", font: "sans" });
          return;
        }
        L.wave(ctx, vals, { x0: G.x0, x1: G.x1, y: r.y, hgt: G.RH * 0.5, color, lw: 2 });
        if (r.t === "clk") edges.forEach((e) => L.edgeMark(ctx, xs(e), r.y, { dir: edgeDir(), color: C.clk, s: 4.5 }));
        // 选中沿：圈出被采样的“沿前一格”
        if (r.t === "in" && sel && sel.kind === "edge") {
          ctx.save();
          ctx.strokeStyle = C.hi;
          ctx.lineWidth = 1.6;
          ctx.strokeRect(xs(sel.i - 1) + 1, r.y0 + 4, G.dx - 2, r.h - 8);
          ctx.restore();
        }
      });
    }
    function laneMark(ctx, G, a, b, y, text, short, color) {
      const xa = G.x0 + a * G.dx + 1, xb = G.x0 + (b + 1) * G.dx - 1;
      ctx.fillStyle = alpha(color, 0.13);
      ctx.fillRect(xa, y - 8, xb - xa, 16);
      ln(ctx, xa, y + 8, xb, y + 8, color, 1.5);
      const w = xb - xa;
      const t = tw(ctx, L, text, 10, "sans", 600) <= w - 2 ? text : short;
      if (tw(ctx, L, t, 10, "sans", 600) <= w + 6) L.txt(ctx, t, (xa + xb) / 2, y, { size: 10, color, align: "center", font: "sans", weight: 600 });
    }
    function drawLane(ctx, G, R, r) {
      const C = L.COL;
      if (S.cmp) {
        if (S.hide) return;
        runs(G.n, (i) => R.lat.Q[i] !== R.ff.Q[i]).forEach(([a, b]) => laneMark(ctx, G, a, b, r.y, "两者不同", "≠", C.warn));
        return;
      }
      runs(G.n, (i) => R.r.viol[i]).forEach(([a, b]) => laneMark(ctx, G, a, b, r.y, "违反约束", "!", C.warn));
      if (!S.hide) runs(G.n, (i) => R.r.Q[i] === null).forEach(([a, b]) => laneMark(ctx, G, a, b, r.y, "不定", "?", C.warn));
      if (S.async && !isSR()) runs(G.n, (i) => R.r.asyncOn[i] && !R.r.viol[i]).forEach(([a, b]) => laneMark(ctx, G, a, b, r.y, "异步", "A", C.ink3));
    }

    /* ---------- 计算过程（读数） ---------- */
    function edgeNo(i) {
      return edgeCells(S.halves * 2).indexOf(i) + 1;
    }
    // 返回 { html, tab, vals }：tab 为要高亮的特性表，vals 为匹配列
    function explain(tg) {
      if (!tg) return { html: "把鼠标移到时序图上的有效沿（虚线）或某一格，或点击固定" };
      const R = sim();
      const d = get();
      const i = tg.i;
      const clk = X.ffClock(R.n);
      const hideQ = (q) => (S.hide ? "?" : v2s(q));
      if (S.cmp) {
        if (tg.kind === "edge") {
          const D = d.D[i - 1];
          return {
            html: `第 ${edgeNo(i)} 个 ↑沿前 D=${D} → 触发器 $Q^*=D=${hideQ(R.ff.Q[i])}$；锁存器此后在 CLK=1 期间一直跟随 D（当前 D=${d.D[i]}）`,
            tab: "dff",
            vals: [D, R.ff.Q[i - 1]],
          };
        }
        return {
          html: clk[i]
            ? `CLK=1：锁存器透明，Q=D=${hideQ(R.lat.Q[i])}；触发器不理会 D，保持 ${hideQ(R.ff.Q[i])}`
            : `CLK=0：两者都保持（锁存器 ${hideQ(R.lat.Q[i])}，触发器 ${hideQ(R.ff.Q[i])}）`,
          tab: "dlatch",
          vals: [clk[i], d.D[i]],
        };
      }
      const r = R.r;
      const qb = i > 0 ? r.Q[i - 1] : S.q0;
      if (isSR()) {
        const a = d.S[i], b = d.R[i];
        const nand = S.dev === "srnand";
        const s = nand ? 1 - a : a, rr = nand ? 1 - b : b;
        let tail;
        if (r.viol[i]) tail = `${nand ? "S′=R′=0" : "S=R=1"}：违反约束，Q=Q′=${nand ? 1 : 0}`;
        else if (r.Q[i] === null) tail = "约束同时撤销 → 竞争，状态不定";
        else tail = `$Q^*=S+\\bar RQ=${s}+${inv(rr)}\\cdot${v2s(qb)}=${hideQ(r.Q[i])}$`;
        return {
          html: `${nand ? `S′=${a}, R′=${b}（S=${s}, R=${rr}）` : `S=${a}, R=${b}`}, Q=${hideQ(qb)} → ${S.hide ? "Q*=？" : tail}`,
          tab: S.dev,
          vals: [a, b, qb],
        };
      }
      if (S.async && r.asyncOn[i]) {
        const sd = d.SD[i], rd = d.RD[i];
        const what = !sd && !rd ? "SD′=RD′=0：违反约束，Q=Q′=1" : !sd ? "SD′=0：异步置 1" : "RD′=0：异步清 0";
        return { html: `${tg.kind === "edge" ? `第 ${edgeNo(i)} 个沿到来时 ` : ""}${what}，优先于时钟${tg.kind === "edge" ? "，此沿被忽略" : ""} → Q=${hideQ(r.Q[i])}` };
      }
      if (S.dev === "dlatch")
        return {
          html: clk[i] ? `CLK=1 透明：Q 跟随 D=${d.D[i]} → Q=${hideQ(r.Q[i])}` : `CLK=0 锁存：Q 保持 ${hideQ(r.Q[i])}`,
          tab: "dlatch",
          vals: [clk[i], d.D[i]],
        };
      const e = tg.kind === "edge" ? r.edges.find((x) => x.i === i) : null;
      if (!e) return { html: `第 ${i} 格不是有效沿：Q 保持 ${hideQ(r.Q[i])}（边沿触发器只在${edgeDir() === "up" ? "上升" : "下降"}沿动作）` };
      const k = edgeNo(i);
      const arrow = e.dir === "up" ? "↑" : "↓";
      const q = S.hide ? "?" : v2s(e.q);
      const qq = v2s(e.qb);
      if (S.dev === "dff") return { html: `第 ${k} 个 ${arrow}沿前 D=${e.ins.D}, Q=${qq} → $Q^*=D=${q}$`, tab: "dff", vals: [e.ins.D, e.qb] };
      if (S.dev === "tff") return { html: `第 ${k} 个 ${arrow}沿前 T=${e.ins.T}, Q=${qq} → $Q^*=T\\oplus Q=${e.ins.T}\\oplus ${qq}=${q}$`, tab: "tff", vals: [e.ins.T, e.qb] };
      const J = e.ins.J, K = e.ins.K;
      return {
        html: `第 ${k} 个 ${arrow}沿前 J=${J}, K=${K}, Q=${qq} → $Q^*=J\\bar Q+\\bar KQ=${J}\\cdot ${inv(e.qb)}+${inv(K)}\\cdot ${qq}=${q}$`,
        tab: "jk",
        vals: [J, K, e.qb],
      };
    }

    /* ---------- 画布 + 信息区 ---------- */
    const st = L.stage(canvas, { height: (W) => layout(W).H, draw, cls: "lb-ff-stage" });
    const info = L.h("div", "lb-ff-info");
    const eqBox = L.h("div", "lb-ff-eq");
    const tabBox = L.h("div", "lb-ff-tabs");
    info.append(eqBox, tabBox);
    canvas.append(info);
    let infoKey = "";
    function renderInfo(ex) {
      const tabs = S.cmp ? ["dlatch", "dff"] : [S.dev];
      const cur = {};
      if (ex && ex.tab) cur[ex.tab] = TABLES[ex.tab].rows.findIndex((row) => matchRow(row, ex.vals));
      const k = tabs.join() + JSON.stringify(cur) + S.hide;
      if (k === infoKey) return;
      infoKey = k;
      eqBox.innerHTML = S.cmp
        ? `<b>特性方程</b> D 锁存器：${EQ.dlatch}　D 触发器：${EQ.dff}`
        : `<b>特性方程</b> ${EQ[S.dev]}`;
      tabBox.innerHTML = tabs
        .map((t) => {
          const tb = TABLES[t];
          const ci = cur[t] == null ? -1 : cur[t];
          let s = `<figure class="lb-ff-tab"><figcaption>${DEVS[t].name}</figcaption><table class="tt"><thead><tr>${tb.head.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>`;
          tb.rows.forEach((row, ri) => {
            s += `<tr class="${ri === ci ? "cur" : ""}">${row
              .map((c, j) => {
                const isQs = tb.head[j] === "Q*";
                const cls = String(c).includes("*") ? "x" : isQs && c === 1 ? "on" : "";
                return `<td class="${cls}">${c}</td>`;
              })
              .join("")}</tr>`;
          });
          return s + `</tbody></table><figcaption class="lb-ff-foot">${tb.foot}</figcaption></figure>`;
        })
        .join("");
      L.renderMath(eqBox);
    }

    /* ---------- 读数 ---------- */
    const roDev = L.readout(readouts, "器件");
    const roCalc = L.readout(readouts, "计算过程", { html: true });
    const roStat = L.readout(readouts, "统计");
    let calcKey = "";
    function update() {
      const tg = S.hover || S.pin;
      const ex = explain(tg);
      roDev(S.cmp ? "门控 D 锁存器 vs 上升沿 D 触发器（同一组 D）" : DEVS[S.dev].name);
      const ck = ex.html + S.hide;
      if (ck !== calcKey) {
        calcKey = ck;
        roCalc(ex.html);
      }
      const R = sim();
      const flips = (Q) => Q.reduce((a, q, i) => a + (i > 0 && q !== Q[i - 1] && q !== null && Q[i - 1] !== null ? 1 : 0), 0);
      const ne = edgeCells(R.n).length;
      if (S.hide) roStat(`有效沿 ${ne} 个；输出已遮住`);
      else if (S.cmp) roStat(`有效沿 ${ne} 个；Q 跳变：锁存器 ${flips(R.lat.Q)} 次，触发器 ${flips(R.ff.Q)} 次`);
      else roStat(`${ne ? `有效沿 ${ne} 个；` : ""}Q 跳变 ${flips(R.r.Q)} 次${R.r.viol.some(Boolean) ? "；含违反约束段" : ""}`);
      renderInfo(ex);
    }

    /* ---------- 交互：点击 / 拖动编辑输入，悬停 / 点击选沿 ---------- */
    function pick(x, y) {
      if (!st.W) return null;
      const G = layout(st.W);
      if (x < G.x0 || x > G.x1) return null;
      const c = Math.max(0, Math.min(G.n - 1, Math.floor((x - G.x0) / G.dx)));
      const row = G.rows.find((r) => y >= r.y0 && y < r.y0 + r.h) || null;
      let best = null, bd = 1e9;
      edgeCells(G.n).forEach((e) => {
        const dd = Math.abs(x - (G.x0 + e * G.dx));
        if (dd < bd) {
          bd = dd;
          best = e;
        }
      });
      const target = best !== null && bd <= G.dx * 1.2 ? { kind: "edge", i: best } : { kind: "cell", i: c };
      return { c, row, target };
    }
    const same = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.i === b.i);
    function setHover(t) {
      if (same(t, S.hover)) return;
      S.hover = t;
      st.redraw();
      update();
    }
    const cvs = st.cvs;
    cvs.style.touchAction = "pan-y";
    cvs.style.cursor = "crosshair";
    const pos = (e) => {
      const r = cvs.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    cvs.addEventListener("pointerdown", (e) => {
      const p = pick(...pos(e));
      if (!p) return;
      if (p.row && p.row.t === "in") {
        const arr = get()[p.row.k];
        const v = 1 - arr[p.c];
        arr[p.c] = v;
        S.paint = { k: p.row.k, v };
        try {
          cvs.setPointerCapture(e.pointerId);
        } catch (_) {}
        st.redraw();
        update();
        return;
      }
      S.pin = same(S.pin, p.target) ? null : p.target;
      st.redraw();
      update();
    });
    cvs.addEventListener("pointermove", (e) => {
      const p = pick(...pos(e));
      if (S.paint) {
        if (p) {
          const arr = get()[S.paint.k];
          if (arr[p.c] !== S.paint.v) {
            arr[p.c] = S.paint.v;
            st.redraw();
            update();
          }
        }
        return;
      }
      if (e.pointerType === "mouse") setHover(p ? p.target : null);
    });
    const endPaint = () => (S.paint = null);
    cvs.addEventListener("pointerup", endPaint);
    cvs.addEventListener("pointercancel", endPaint);
    cvs.addEventListener("pointerleave", () => {
      if (!S.paint) setHover(null);
    });

    /* ---------- 控件 ---------- */
    function refresh(rows) {
      S.hover = null;
      S.pin = null;
      devSeg.el.classList.toggle("lb-dim", S.cmp);
      asyncT.el.classList.toggle("lb-dim", S.cmp || isSR());
      if (rows) st.resize();
      else st.redraw();
      update();
    }
    const devSeg = L.seg(controls, {
      label: "器件",
      options: Object.keys(DEVS).map((k) => ({ v: k, t: DEVS[k].short })),
      value: S.dev,
      onChange: (v) => {
        S.dev = v;
        S.cmp = false;
        cmpT.set(false);
        refresh(true);
      },
    });
    L.slider(controls, {
      label: "时间轴长度",
      min: 16,
      max: 24,
      step: 2,
      value: S.halves,
      fmt: (v) => `${v} 个半拍（${v / 2} 个时钟周期）`,
      onInput: (v) => {
        S.halves = v;
        refresh(false);
      },
    });
    L.seg(controls, {
      label: "初态 Q",
      options: [{ v: 0, t: "0" }, { v: 1, t: "1" }],
      value: 0,
      onChange: (v) => {
        S.q0 = +v;
        refresh(false);
      },
    });
    const asyncT = L.toggle(controls, {
      label: "异步置位 SD′ / 复位 RD′（低有效）",
      value: false,
      onChange: (v) => {
        S.async = v;
        refresh(true);
      },
    });
    const cmpT = L.toggle(controls, {
      label: "对照：D 锁存器 vs ↑D 触发器",
      value: false,
      onChange: (v) => {
        S.cmp = v;
        refresh(true);
      },
    });
    L.toggle(controls, {
      label: "遮住输出（先预测再验证）",
      value: false,
      onChange: (v) => {
        S.hide = v;
        calcKey = "";
        refresh(false);
      },
    });
    const btns = L.row(controls);
    L.button(btns, { label: "随机输入", kind: "primary", onClick: () => (randomize(), refresh(false)) });
    L.button(btns, { label: "清空", onClick: () => (clearIns(), refresh(false)) });
    L.button(btns, { label: "恢复示例", onClick: () => ((data[key()] = defaults(S.cmp ? "dff" : S.dev)), refresh(false)) });
    controls.append(Object.assign(L.h("p", "lb-ff-hint"), { textContent: "在蓝色输入行上点击切换 0/1，按住拖动可连续涂改；每个半拍分 2 个子格。" }));

    function insKeys() {
      return S.cmp ? ["D"] : DEVS[S.dev].ins;
    }
    function clearIns() {
      const d = get();
      const idle = S.dev === "srnand" && !S.cmp ? 1 : 0;
      insKeys().forEach((k) => d[k].fill(idle));
      d.SD.fill(1);
      d.RD.fill(1);
    }
    function randomize() {
      const d = get();
      const rnd = Math.random;
      if (isSR() && !S.cmp) {
        const nand = S.dev === "srnand";
        for (let h = 0; h < MAXN / 2; h++) {
          const u = rnd();
          let s = 0, r = 0; // 高有效含义
          if (u < 0.22) s = 1;
          else if (u < 0.44) r = 1;
          else if (u < 0.54) s = r = 1;
          for (const i of [2 * h, 2 * h + 1]) {
            d.S[i] = nand ? 1 - s : s;
            d.R[i] = nand ? 1 - r : r;
          }
        }
        return;
      }
      insKeys().forEach((k) => {
        for (let h = 0; h < MAXN / 2; h++) {
          const v = rnd() < 0.5 ? 1 : 0;
          d[k][2 * h] = d[k][2 * h + 1] = v;
          if (rnd() < 0.2) d[k][2 * h + (rnd() < 0.5 ? 0 : 1)] = 1 - v; // 子格毛刺，演示“只看沿前一瞬间”
        }
      });
      d.SD.fill(1);
      d.RD.fill(1);
      const a = 4 + Math.floor(rnd() * 30);
      for (let i = a; i < a + 2 + Math.floor(rnd() * 3); i++) d.RD[i] = 0;
      if (rnd() < 0.6) {
        const b = 4 + Math.floor(rnd() * 34);
        for (let i = b; i < b + 2 + Math.floor(rnd() * 2); i++) d.SD[i] = 0;
      }
    }

    refresh(false);
    return {
      touch() {
        st.redraw();
        update();
      },
    };
  }

  Labs.register("ff", {
    title: "触发器时序：锁存器 vs 边沿",
    desc:
      "选器件，在蓝色输入行上点击/拖动画出 D、J、K、T 或 S、R 波形；Q、Q′ 按器件规则逐格计算。把鼠标移到某个有效沿（橙色虚线）上，右侧给出“沿前输入 → $Q^*$”的计算，下方特性表同步高亮。可先打开“遮住输出”自己预测，再揭开验证。",
    note:
      "约定：时间轴每个半拍分 2 个子格（CLK 从 0 开始），边沿触发器在有效沿采样<b>沿前一个子格</b>的输入（相当于满足建立时间）；锁存器在 CLK=1 的整段时间里跟随 D，所以 CLK=1 期间 D 的每次变化都会传到 Q（“空翻/透明”），而触发器一个周期最多动作一次。异步端 SD′、RD′ 低有效、优先于时钟；若它与时钟沿在同一格撤销，按“先撤销、后来沿”处理。SR 锁存器出现 S=R=1（或非型）/ S′=R′=0（与非型）时 Q=Q′，标“违反约束”；两端同时撤销时用品红阴影表示状态不定。",
    make,
  });
})();
