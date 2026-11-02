// 实验 fsm：序列检测器（L36–L37）。纯逻辑在 labs-b.js（window.LabsLogicB），这里只做界面。
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
  // 带底色的标签（避免与线条混在一起）
  function tag(L, ctx, s, x, y, o = {}) {
    const size = o.size || 11;
    setFont(L, ctx, size, o.weight || 600, o.font);
    const w = ctx.measureText(s).width;
    ctx.fillStyle = o.bg || L.COL.paper;
    ctx.fillRect(x - w / 2 - 3, y - size * 0.62, w + 6, size * 1.24);
    L.txt(ctx, s, x, y, Object.assign({ align: "center", weight: 600 }, o, { size }));
    return w;
  }
  function arrowHead(ctx, x, y, ang, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(ang - 0.42), y - s * Math.sin(ang - 0.42));
    ctx.lineTo(x - s * Math.cos(ang + 0.42), y - s * Math.sin(ang + 0.42));
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
  function textField(parent, { label, value = "", placeholder = "", onEnter }) {
    const wrap = $h("label", "ctl lb2-field");
    wrap.append($h("span", "ctl-name", Labs.esc(label)));
    const inp = document.createElement("input");
    inp.className = "ctl-input lb2-input";
    inp.type = "text";
    inp.value = value;
    inp.placeholder = placeholder;
    inp.spellcheck = false;
    inp.autocomplete = "off";
    inp.inputMode = "numeric";
    inp.addEventListener("keydown", (e) => e.key === "Enter" && onEnter && onEnter());
    wrap.append(inp);
    parent.append(wrap);
    return { el: wrap, inp, get: () => inp.value, set: (v) => (inp.value = v) };
  }

  /* ---------- 注册 ---------- */
  Labs.register("fsm", {
    title: "序列检测器",
    desc: "选择要检测的序列、是否允许重叠、Mealy 还是 Moore，程序按“已收到的最长有效前缀”自动构造原始状态图。逐位输入 X（点 0 / 1，或输入一串比特后单步 / 自动播放），看当前状态和刚走过的边如何变化，以及下方时序图里两种模型的输出 Z 差在哪一拍。",
    note: String.raw`<b>状态的含义</b>：$S_k$ = “已收到的、与目标序列开头吻合的最长后缀长度为 $k$”（圈内第二行写出这个前缀，ε 表示空）。收到新的一位后，次态 = 把这一位接在前缀后面，再取与目标序列开头吻合的最长后缀；<b>允许重叠</b>时，检测成功后保留可以复用的尾巴（如 1011 检测到后保留“1”），<b>不允许重叠</b>时直接回到 $S_0$。<br><b>Mealy vs Moore</b>：Mealy 的输出 $Z=f(S,X)$，最后一位 X 一出现（时钟沿到来之前），Z 就在<b>同一拍</b>内变为 1，所以 $m$ 位序列只需 $m$ 个状态；Moore 的输出 $Z=g(S)$ 只取决于状态，必须等时钟沿把电路送进“检测到”状态才输出 1，所以要多一个状态（$m+1$ 个），输出<b>晚一拍</b>，但不受输入毛刺影响、持续整整一个周期。时序图约定：X 在每个上升沿（↑）之后改变，下一个上升沿采样它。<br><b>实现</b>：状态按序号做自然二进制编码，未用编码作无关项，用卡诺图（精确最小覆盖）化简得到 D 触发器驱动方程 $Q^{n+1}=D$；你的教材可能用别的编码或先做状态化简，结果形式会不同 ⚠️以教材为准。`,
    make({ canvas, controls, readouts, L }) {
      const C = L.COL;
      let pat = "1011";
      let overlap = true;
      let type = "mealy";
      let hist = []; //   已输入的位
      let queue = ""; //  比特串（待播放）
      let qpos = 0; //    已播放到的位置
      let playing = false;
      let acc = 0;
      let showImpl = false;
      let F = null; //    当前机型
      let Fm = null; //   Mealy（时序图对比用）
      let Fo = null; //   Moore
      let runM = null;
      let runO = null;

      /* ---- 控件 ---- */
      L.seg(controls, {
        label: "检测序列",
        options: [
          { v: "101", t: "101" },
          { v: "110", t: "110" },
          { v: "1011", t: "1011" },
        ],
        value: pat,
        onChange: (v) => ((pat = v), update()),
      });
      L.seg(controls, {
        label: "重叠",
        options: [
          { v: "1", t: "允许重叠" },
          { v: "0", t: "不允许重叠" },
        ],
        value: "1",
        onChange: (v) => ((overlap = v === "1"), update()),
      });
      L.seg(controls, {
        label: "模型",
        options: [
          { v: "mealy", t: "Mealy 型" },
          { v: "moore", t: "Moore 型" },
        ],
        value: type,
        onChange: (v) => ((type = v), update()),
      });
      subhead(controls, "逐位输入 X（每按一次 = 一个时钟上升沿）");
      const r1 = L.row(controls);
      L.button(r1, { label: "输入 0", onClick: () => (stop(), push(0)) });
      L.button(r1, { label: "输入 1", kind: "primary", onClick: () => (stop(), push(1)) });
      L.button(r1, { label: "复位", onClick: () => (stop(), (hist = []), (qpos = 0), update()) });
      const fIn = textField(controls, { label: "比特串（只取 0 / 1）", value: "0101101101011", placeholder: "如 0101101101011", onEnter: () => load() });
      const r2 = L.row(controls);
      L.button(r2, { label: "载入并复位", onClick: () => load() });
      const bStep = L.button(r2, { label: "单步 ▶", kind: "primary", onClick: () => (stop(), stepQueue()) });
      const bPlay = L.button(r2, { label: "自动播放", onClick: () => (playing ? stop() : play()) });
      const qLine = $h("div", "lb2-queue");
      controls.append(qLine);
      L.toggle(controls, { label: "显示二进制编码与 D 触发器驱动方程", value: false, onChange: (v) => ((showImpl = v), update()) });

      function push(b) {
        hist.push(b);
        if (hist.length > 400) hist = hist.slice(-400);
        update();
      }
      function load() {
        stop();
        queue = (fIn.get().match(/[01]/g) || []).join("");
        fIn.set(queue);
        qpos = 0;
        hist = [];
        update();
      }
      function stepQueue() {
        if (!queue) load();
        if (qpos >= queue.length) return false;
        push(+queue[qpos++]);
        return true;
      }
      function play() {
        if (!queue) load();
        if (qpos >= queue.length) ((hist = []), (qpos = 0));
        playing = true;
        acc = 0.4;
        update();
      }
      function stop() {
        if (!playing) return;
        playing = false;
        update();
      }

      /* ---- 左侧：状态图 ---- */
      const sDia = sec(canvas, "原始状态图");
      function edgesOf(f) {
        const map = new Map();
        f.trans.forEach((row, k) =>
          row.forEach((t, x) => {
            const key = k + ">" + t.next;
            if (!map.has(key)) map.set(key, { from: k, to: t.next, items: [] });
            map.get(key).items.push({ x, z: t.z });
          })
        );
        return [...map.values()].map((e) => {
          e.label = f.type === "mealy" ? e.items.map((i) => `${i.x}/${i.z}`).join(",") : e.items.map((i) => i.x).join(",");
          e.hit = f.type === "mealy" && e.items.some((i) => i.z === 1);
          e.kind = e.to === e.from ? "self" : e.to === e.from + 1 ? "fwd" : e.to < e.from ? "back" : "jump";
          return e;
        });
      }
      function geom(W) {
        const ns = F.ns;
        const padX = 40;
        const sp = ns > 1 ? (W - 2 * padX) / (ns - 1) : 0;
        const r = L.clamp(sp * 0.26, 17, 27);
        const dy = L.clamp(sp * 0.25, 18, 28);
        const y0 = Math.round(r * 2.25 + 44);
        const es = edgesOf(F);
        const maxSpan = Math.max(1, ...es.filter((e) => e.kind === "back" || e.kind === "jump").map((e) => Math.abs(e.from - e.to)));
        const xs = [];
        for (let k = 0; k < ns; k++) xs.push(padX + k * sp);
        const H = Math.round(y0 + 0.45 * r + r * 0.5 + maxSpan * dy + 26);
        return { ns, sp, r, dy, y0, es, xs, H };
      }
      const stDia = L.stage(sDia, {
        height: (W) => (F ? geom(W).H : 220),
        draw(ctx, W) {
          if (!F) return;
          const g = geom(W);
          const { r, y0, xs, es } = g;
          const n = hist.length;
          const run = type === "mealy" ? runM : runO;
          const cur = run.s[n];
          const last = n ? { from: run.s[n - 1], to: cur, x: hist[n - 1] } : null;
          const lab = r < 21 ? 10 : 11;
          // 边
          es.forEach((e) => {
            const isLast = last && e.from === last.from && e.to === last.to;
            const col = isLast ? C.hi : C.ink2;
            const lcol = isLast ? C.hi : e.hit ? C.ok : C.ink;
            ctx.strokeStyle = col;
            ctx.lineWidth = isLast ? 2.6 : 1.4;
            const xa = xs[e.from];
            const xb = xs[e.to];
            if (e.kind === "self") {
              const a1 = (-115 * PI) / 180, a2 = (-65 * PI) / 180;
              const p1 = [xa + r * Math.cos(a1), y0 + r * Math.sin(a1)];
              const p2 = [xa + r * Math.cos(a2), y0 + r * Math.sin(a2)];
              const c1 = [xa - r * 1.15, y0 - r * 2.45];
              const c2 = [xa + r * 1.15, y0 - r * 2.45];
              ctx.beginPath();
              ctx.moveTo(p1[0], p1[1]);
              ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
              ctx.stroke();
              arrowHead(ctx, p2[0], p2[1], Math.atan2(p2[1] - c2[1], p2[0] - c2[0]), 8, col);
              tag(L, ctx, e.label, xa, y0 - r * 2.08 - 9, { size: lab, color: lcol });
            } else if (e.kind === "fwd") {
              const xs0 = xa + r, xe = xb - r;
              ctx.beginPath();
              ctx.moveTo(xs0, y0);
              ctx.lineTo(xe, y0);
              ctx.stroke();
              arrowHead(ctx, xe, y0, 0, 8, col);
              tag(L, ctx, e.label, (xs0 + xe) / 2, y0 - 10, { size: lab, color: lcol });
            } else {
              // 回退边（以及理论上的跳跃边）：画在下方的弧线
              const span = Math.abs(e.from - e.to);
              const dir = e.to < e.from ? 1 : -1;
              const aS = ((90 + dir * 25) * PI) / 180;
              const aE = ((90 - dir * 25) * PI) / 180;
              const ps = [xa + r * Math.cos(aS), y0 + r * Math.sin(aS)];
              const pe = [xb + r * Math.cos(aE), y0 + r * Math.sin(aE)];
              const depth = r * 0.5 + span * g.dy;
              const cp = [(ps[0] + pe[0]) / 2, y0 + 2 * depth];
              ctx.beginPath();
              ctx.moveTo(ps[0], ps[1]);
              ctx.quadraticCurveTo(cp[0], cp[1], pe[0], pe[1]);
              ctx.stroke();
              arrowHead(ctx, pe[0], pe[1], Math.atan2(pe[1] - cp[1], pe[0] - cp[0]), 8, col);
              const vy = 0.25 * ps[1] + 0.5 * cp[1] + 0.25 * pe[1];
              tag(L, ctx, e.label, cp[0], vy, { size: lab, color: lcol });
            }
          });
          // 状态圈
          const card = cssv("--card", "#f8f6f0");
          for (let k = 0; k < g.ns; k++) {
            const x = xs[k];
            const on = k === cur;
            ctx.beginPath();
            ctx.arc(x, y0, r, 0, 2 * PI);
            ctx.fillStyle = on ? rgba(C.hi, 0.16) : card;
            ctx.fill();
            ctx.lineWidth = on ? 2.8 : 1.5;
            ctx.strokeStyle = on ? C.hi : C.ink;
            ctx.stroke();
            if (F.type === "moore" && F.out[k] === 1) {
              ctx.beginPath();
              ctx.arc(x, y0, r - 4, 0, 2 * PI);
              ctx.lineWidth = 1;
              ctx.strokeStyle = on ? C.hi : C.ok;
              ctx.stroke();
            }
            const name = F.type === "moore" ? `S${k}/${F.out[k]}` : `S${k}`;
            const nameCol = F.type === "moore" && F.out[k] === 1 ? C.ok : on ? C.hi : C.ink;
            const dbl = F.type === "moore" && F.out[k] === 1;
            fitTxt(L, ctx, name, x, y0 - r * 0.24, dbl ? r * 1.25 : r * 1.55, { size: r < 21 ? 11 : 12.5, weight: 700, align: "center", color: nameCol });
            const pre = k === 0 && !(F.type === "moore" && F.out[k]) ? "ε" : F.p.slice(0, Math.min(k, F.m));
            fitTxt(L, ctx, pre, x, y0 + r * 0.38, dbl ? r * 1.15 : r * 1.5, { size: r < 21 ? 9.5 : 10.5, align: "center", color: C.ink3 });
          }
          // 输入端标注
          L.txt(ctx, "X 输入 → 状态", 8, 12, { size: 10.5, color: C.data, font: "sans" });
          L.txt(ctx, F.type === "mealy" ? "边标注 X/Z" : "圈内 S/Z · 边标注 X", W - 8, 12, { size: 10.5, color: C.ok, align: "right", font: "sans" });
        },
      });
      const legend = $h("p", "lb2-legend");
      sDia.append(legend);
      const alertBox = $h("div", "lb2-alert");
      alertBox.setAttribute("role", "status");
      canvas.append(alertBox);

      /* ---- 左侧：时序图 ---- */
      const sTim = sec(canvas, "时序图（同一输入下 Mealy 与 Moore 对比）");
      const ROWS = 5;
      const stTim = L.stage(sTim, {
        height: () => 24 + ROWS * 36 + 26,
        draw(ctx, W, H) {
          if (!F) return;
          const n = hist.length;
          const labW = 66;
          const x0 = labW + 6;
          const xR = W - 12;
          const minCell = 24;
          const maxCells = Math.max(4, Math.floor((xR - x0) / minCell));
          const N = Math.min(n + 1, maxCells);
          const t0 = n + 1 - N;
          const cw = Math.min(46, (xR - x0) / N);
          const xEnd = x0 + N * cw;
          const xOf = (t) => x0 + (t - t0) * cw;
          const yRow = (i) => 26 + i * 36 + (i >= 4 ? 8 : 0);
          const hg = 16;
          const mine = type === "mealy" ? 3 : 4;
          const names = ["CLK", "X", type === "mealy" ? "S·Mealy" : "S·Moore", "Z·Mealy", "Z·Moore"];
          const cols = [C.clk, C.data, C.ink, C.ok, C.ok];
          names.forEach((s, i) => {
            const bold = i === mine || i < 3;
            L.txt(ctx, s, 6, yRow(i), { size: 11, weight: bold ? 700 : 400, color: i >= 3 && i !== mine ? C.ink3 : cols[i] });
          });
          // 上升沿竖虚线 + 箭头
          ctx.save();
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = C.rule;
          ctx.lineWidth = 1;
          for (let t = t0; t <= n; t++) {
            const x = xOf(t);
            ctx.beginPath();
            ctx.moveTo(x, yRow(0) + hg / 2);
            ctx.lineTo(x, yRow(4) + hg / 2 + 4);
            ctx.stroke();
          }
          ctx.restore();
          // Z=1 底色
          const runS = type === "mealy" ? runM : runO;
          for (let t = t0; t <= n; t++) {
            if (t < n && runM.z[t] === 1) {
              ctx.fillStyle = rgba(C.ok, 0.14);
              ctx.fillRect(xOf(t), yRow(3) - hg / 2 - 3, cw, hg + 6);
            }
            if (Fo.out[runO.s[t]] === 1) {
              ctx.fillStyle = rgba(C.ok, 0.14);
              ctx.fillRect(xOf(t), yRow(4) - hg / 2 - 3, cw, hg + 6);
            }
          }
          // 当前拍底色
          ctx.fillStyle = rgba(C.hi, 0.07);
          ctx.fillRect(xOf(n), yRow(0) - hg / 2 - 6, cw, yRow(4) - yRow(0) + hg + 12);
          // CLK
          const clk = [];
          for (let i = 0; i < N; i++) clk.push(1, 0);
          L.wave(ctx, clk, { x0, x1: xEnd, y: yRow(0), hgt: hg, color: C.clk });
          for (let t = t0; t <= n; t++) L.edgeMark(ctx, xOf(t), yRow(0) - 1, { dir: "up", color: C.clk, s: 4 });
          // X（最后一拍尚未输入）
          if (n > t0) {
            L.wave(ctx, hist.slice(t0, n), { x0, x1: xOf(n), y: yRow(1), hgt: hg, color: C.data });
            for (let t = t0; t < n; t++) L.txt(ctx, String(hist[t]), xOf(t) + cw / 2, yRow(1) + (hist[t] ? 5 : -5), { size: 9, color: C.data, align: "center" });
          }
          L.txt(ctx, "?", xOf(n) + cw / 2, yRow(1), { size: 10, color: C.ink3, align: "center" });
          // 状态（总线画法）
          for (let t = t0; t <= n; t++) {
            const xa = xOf(t) + 1.5, xb = xOf(t + 1) - 1.5, y = yRow(2), hh = hg / 2, k = 3;
            ctx.beginPath();
            ctx.moveTo(xa, y);
            ctx.lineTo(xa + k, y - hh);
            ctx.lineTo(xb - k, y - hh);
            ctx.lineTo(xb, y);
            ctx.lineTo(xb - k, y + hh);
            ctx.lineTo(xa + k, y + hh);
            ctx.closePath();
            ctx.fillStyle = t === n ? rgba(C.hi, 0.16) : cssv("--card", "#f8f6f0");
            ctx.fill();
            ctx.strokeStyle = t === n ? C.hi : C.ink2;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            fitTxt(L, ctx, "S" + runS.s[t], (xa + xb) / 2, y + 0.5, xb - xa - 4, { size: 10, align: "center", weight: 600, color: t === n ? C.hi : C.ink });
          }
          // Z·Mealy：最后一拍取决于尚未到来的 X，画成未知
          if (n > t0) L.wave(ctx, runM.z.slice(t0, n), { x0, x1: xOf(n), y: yRow(3), hgt: hg, color: mine === 3 ? C.ok : C.ink3 });
          L.txt(ctx, "?", xOf(n) + cw / 2, yRow(3), { size: 10, color: C.ink3, align: "center" });
          const zo = [];
          for (let t = t0; t <= n; t++) zo.push(Fo.out[runO.s[t]]);
          L.wave(ctx, zo, { x0, x1: xEnd, y: yRow(4), hgt: hg, color: mine === 4 ? C.ok : C.ink3 });
          // 最近一次检测：Mealy 同拍 → Moore 晚一拍
          let lastHit = -1;
          for (let t = n - 1; t >= t0; t--)
            if (runM.z[t] === 1) {
              lastHit = t;
              break;
            }
          if (lastHit >= 0 && lastHit + 1 <= n) {
            const xa = xOf(lastHit) + cw / 2, ya = yRow(3) + hg / 2 + 3;
            const xb = xOf(lastHit + 1) + cw / 2, yb = yRow(4) - hg / 2 - 3;
            ctx.strokeStyle = C.warn;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(xa, ya);
            ctx.quadraticCurveTo(xa, yb, xb - 4, yb);
            ctx.stroke();
            arrowHead(ctx, xb, yb, 0, 6, C.warn);
            const right = xb + 8 + 40 < W;
            L.txt(ctx, "晚一拍", right ? xb + 8 : xa - 6, (ya + yb) / 2 + 1, { size: 10.5, color: C.warn, font: "sans", align: right ? "left" : "right", weight: 600 });
          }
          // 底部说明
          fitTxt(L, ctx, "↑ 上升沿：采样 X、状态更新" + (t0 > 0 ? `；仅显示最近 ${N} 拍` : ""), 6, H - 12, W - 12, { size: 10.5, color: C.clk, font: "sans" });
        },
      });

      /* ---- 状态转换表 + 实现 ---- */
      const sTab = sec(canvas, "状态转换表");
      const tabBox = $h("div", "lb2-scroll");
      sTab.append(tabBox);
      const sImp = sec(canvas, "二进制编码与 D 触发器驱动方程");
      const impBox = $h("div", "lb2-eq");
      sImp.append(impBox);

      const roN = L.readout(readouts, "状态数");
      const roS = L.readout(readouts, "当前状态");
      const roZ = L.readout(readouts, "当前输出 Z");
      const roC = L.readout(readouts, "已输入 · 检测");

      function update() {
        F = X.buildFSM(pat, type, overlap);
        Fm = X.buildFSM(pat, "mealy", overlap);
        Fo = X.buildFSM(pat, "moore", overlap);
        runM = X.fsmRun(Fm, hist, 0);
        runO = X.fsmRun(Fo, hist, 0);
        const run = type === "mealy" ? runM : runO;
        const n = hist.length;
        const cur = run.s[n];
        const prev = n ? run.s[n - 1] : -1;
        // 图例
        legend.innerHTML = `圈内第一行为状态${type === "moore" ? "/输出" : ""}，第二行为“已收到的最长有效前缀”（ε 为空）。<span class="lb2-k-hi">朱红</span>：当前状态与刚走过的边；<span class="lb2-k-ok">绿色</span>：${type === "mealy" ? "输出 Z=1 的转换" : "输出 Z=1 的状态（双圈）"}。前进边画在中线上，回退边画在下方，自环画在圈顶。`;
        // 提示
        let msg = "",
          cls = "";
        if (!n) msg = "从 S0 开始。点“输入 0 / 1”，或载入比特串后单步 / 自动播放。";
        else if (type === "mealy" && runM.z[n - 1] === 1) {
          msg = `<b>Z = 1</b>：第 ${n} 位 X=${hist[n - 1]} 到来时，S${prev} 与 X 组合立即使 Z=1——<b>同一拍</b>、时钟沿之前就输出（检测到 ${pat}）。`;
          cls = "ok";
        } else if (type === "moore" && Fo.out[cur] === 1) {
          msg = `<b>Z = 1</b>：时钟沿把电路送进 S${cur}（检测到 ${pat}），Moore 输出只看状态，所以比 Mealy <b>晚一拍</b>出现，并保持整个周期。`;
          cls = "ok";
        } else msg = `第 ${n} 位 X=${hist[n - 1]}：S${prev} → S${cur}，${F.meaning[cur]}。`;
        alertBox.className = "lb2-alert " + cls;
        alertBox.innerHTML = msg;
        // 状态转换表
        const lastX = n ? hist[n - 1] : -1;
        let th = `<tr><th rowspan="2">现态</th><th rowspan="2">含义（最长有效前缀）</th><th colspan="2">次态${type === "mealy" ? " / 输出 Z" : ""}</th>${type === "moore" ? '<th rowspan="2">输出 Z</th>' : ""}</tr><tr><th>X=0</th><th>X=1</th></tr>`;
        let tb = "";
        F.trans.forEach((row, k) => {
          const cells = row
            .map((t, x) => {
              const used = k === prev && x === lastX;
              const z1 = type === "mealy" && t.z === 1;
              const txt = type === "mealy" ? `S${t.next} / ${t.z}` : `S${t.next}`;
              return `<td class="${z1 ? "on " : ""}${used ? "lb2-last" : ""}">${txt}</td>`;
            })
            .join("");
          tb += `<tr class="${k === cur ? "cur" : ""}"><td><b>S${k}</b></td><td class="lb2-l">${Labs.esc(F.meaning[k])}</td>${cells}${type === "moore" ? `<td class="${F.out[k] ? "on" : ""}">${F.out[k]}</td>` : ""}</tr>`;
        });
        tabBox.innerHTML = `<table class="tt lb2-tt"><thead>${th}</thead><tbody>${tb}</tbody></table><p class="lb2-p lb2-dim">浅绿行 = 当前状态；虚框 = 刚用到的那一格。${type === "mealy" ? "红字为 Z=1 的转换。" : "Moore 表的输出单独一列，只与现态有关。"}</p>`;
        // 实现
        sImp.hidden = !showImpl;
        if (showImpl) {
          const im = X.fsmImpl(F);
          const code = (k) => k.toString(2).padStart(im.nb, "0");
          const enc = [];
          for (let k = 0; k < F.ns; k++) enc.push(`<span class="lb2-code">S${k} = ${code(k)}</span>`);
          const unused = [];
          for (let c = F.ns; c < 1 << im.nb; c++) unused.push(code(c));
          const qn = "$" + im.names.slice(0, im.nb).join("") + "$";
          const eqs = im.D.map((d) => `<div>$Q_${d.b}^{n+1}=D_${d.b}=${d.tex}$</div>`).join("");
          const zq = type === "mealy" ? `<div>$Z=${im.Z.tex}$　<span class="lb2-dim">（含 X：Mealy）</span></div>` : `<div>$Z=${im.Z.tex}$　<span class="lb2-dim">（只含 Q：Moore）</span></div>`;
          impBox.innerHTML = `<p class="lb2-p">编码 ${qn}：${enc.join(" ")}${unused.length ? `；未用编码 ${unused.join("、")} 作无关项` : ""}。需要 ${im.nb} 个 D 触发器。</p>${eqs}${zq}<p class="lb2-p lb2-dim">${im.verified ? "✓ 已把每个有效（状态, X）组合代回方程逐一验证。" : "⚠ 方程验证未通过"}</p>`;
          L.renderMath(impBox);
        }
        // 读数
        roN(`Mealy ${Fm.ns} · Moore ${Fo.ns}`);
        roS(`S${cur}（${F.meaning[cur]}）`);
        roZ(type === "mealy" ? (n ? `上一拍 Z=${runM.z[n - 1]}（本拍待 X）` : "待 X") : `Z=${Fo.out[cur]}（只看状态）`);
        const hits = runM.z.reduce((a, b) => a + b, 0);
        roC(`${n} 位 · ${hits} 次`);
        // 比特串进度
        if (queue) {
          const done = Labs.esc(queue.slice(0, qpos));
          const nx = qpos < queue.length ? `<b>${queue[qpos]}</b>` : "";
          qLine.innerHTML = `<span class="lb2-dim">已播：</span>${done}<span class="lb2-next">${nx}</span><span class="lb2-dim">${Labs.esc(queue.slice(qpos + 1))}</span>`;
        } else qLine.innerHTML = `<span class="lb2-dim">（尚未载入比特串）</span>`;
        bStep.disabled = !!queue && qpos >= queue.length;
        bPlay.textContent = playing ? "暂停" : "自动播放";
        stDia.resize();
        stTim.redraw();
      }

      // 默认：载入示例并先播放 9 位
      load();
      for (let i = 0; i < 9; i++) stepQueue();

      return {
        frame(dt) {
          if (!playing) return;
          acc += dt;
          if (acc >= 0.6) {
            acc = 0;
            if (!stepQueue()) stop();
          }
        },
        touch() {
          stDia.resize();
          stTim.redraw();
        },
      };
    },
  });
})();
