// 实验 adc：AD / DA（L47–L49）。纯逻辑（quantize / sarConvert / dacR2R / aliasFreq）在 labs-b.js（window.LabsLogicB），这里只做界面。
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
  function tagTxt(L, ctx, s, x, y, o = {}) {
    const size = o.size || 10.5;
    setFont(L, ctx, size, o.weight || 400, o.font);
    const w = ctx.measureText(s).width;
    const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    ctx.fillStyle = o.bg || L.COL.paper;
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
  const sig = (v, n = 3) => {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a === 0) return "0";
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
    return v.toFixed(Math.min(d, 6)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  };
  const vStr = (v) => (Math.abs(v) < 1 && v !== 0 ? `${sig(v * 1e3)} mV` : `${sig(v)} V`);
  const iStr = (i) => (Math.abs(i) >= 1e-3 ? `${sig(i * 1e3)} mA` : `${sig(i * 1e6)} μA`);
  const fStr = (f) => (f >= 1e3 ? `${sig(f / 1e3)} kHz` : `${sig(f)} Hz`);
  const bin = (c, n) => c.toString(2).padStart(n, "0");
  // 采样率档位（Hz）
  const FS = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000];

  Labs.register("adc", {
    title: "AD / DA",
    desc: "三个子实验：<b>量化</b>——正弦输入经采样、量化变成阶梯，看量化误差和采样率不够时的混叠；<b>逐次逼近 SAR</b>——一拍试探一位，DAC 输出与 $v_I$ 比较后保留或清除，像二分查找；<b>倒 T 形电阻网络 DAC</b>——拨 4 位数码，看各支路电流如何逐级减半、在运放虚地处求和。",
    note: String.raw`<b>本实验的量化约定</b>（与 labs-b.js 的 quantize 一致）：输出码 $0\ldots2^n-1$，$\Delta=V_{REF}/2^n$（1 LSB）。<b>只舍不入</b>：$D=\lfloor v_I/\Delta\rfloor$，误差 $0\le\varepsilon\lt\Delta$，最大量化误差为 $\Delta$。<b>有舍有入</b>：$D=\lfloor v_I/\Delta+\tfrac12\rfloor$（上限钳在 $2^n-1$），误差 $|\varepsilon|\le\Delta/2$；但 $v_I\gt V_{REF}-\Delta/2$ 时被钳位，误差可接近 $\Delta$。阎石教材的有舍有入另取 $\Delta=\frac{2V_m}{2^{n+1}-1}$（$V_m$ 为输入最大值），使整个范围内最大误差都是 $\Delta/2$；两种写法的 $\Delta$ 略有不同，<b>以你的教材为准 ⚠️</b>。分辨率常见两种表述：$\frac{1}{2^n-1}$（DAC 最小输出与满量程之比）和 $\frac{V_{REF}}{2^n}$（1 LSB 对应的电压）。<br><b>采样定理</b>：$f_s\ge2f_{i(\max)}$，否则高频被“折叠”成低频（混叠），表观频率 $|f-kf_s|$（$k$ 取使其最小的整数）。<br><b>逐次逼近</b>：从最高位起逐位试探置 1，若 DAC 输出 $v_O\le v_I$ 则保留，否则清除，$n$ 拍之后 $D=\lfloor v_I/\Delta\rfloor$，与“只舍不入”量化完全一致。阎石书中的电路一次转换需 $n+2$ 个时钟周期（含起始与送出数据）⚠️以教材为准。<br><b>倒 T 形</b>：开关接 $I_\Sigma$（运放虚地）或接地，电位都是 0 V，所以节点电压从左到右依次减半、各支路电流 $I/2, I/4, I/8, I/16$（$I=V_{REF}/R$）与开关位置无关，转换速度快；$v_O=-R_fI_\Sigma=-\frac{V_{REF}}{2^4}\sum D_i2^i$（$R_f=R$）。`,
    make({ canvas, controls, readouts, L }) {
      const C = L.COL;
      const S = {
        mode: "quant",
        n: 3,
        vref: 8,
        amp: 3.6,
        f: 200,
        fsI: FS.indexOf(4000),
        round: false,
        sarV: 5.3,
        sarN: 4,
        sarK: 3,
        dac: [1, 0, 1, 1],
        R: 10e3,
      };
      let playing = false;
      let acc = 0;

      /* ---- 控件 ---- */
      L.seg(controls, {
        label: "子实验",
        options: [
          { v: "quant", t: "量化" },
          { v: "sar", t: "逐次逼近" },
          { v: "dac", t: "倒 T 形 DAC" },
        ],
        value: S.mode,
        onChange: (v) => ((S.mode = v), (playing = false), update()),
      });
      L.slider(controls, { label: "参考电压 V_REF", min: 1, max: 10, step: 0.5, value: S.vref, fmt: (v) => `${v.toFixed(1)} V`, onInput: (v) => ((S.vref = v), (S.amp = Math.min(S.amp, v / 2)), ampS.set(S.amp), (S.sarV = Math.min(S.sarV, v)), sarVS.set(S.sarV), update()) });
      const gQ = $h("div", "lb2-grp");
      const gS = $h("div", "lb2-grp");
      const gD = $h("div", "lb2-grp");
      controls.append(gQ, gS, gD);
      // 量化
      L.slider(gQ, { label: "位数 n", min: 2, max: 8, step: 1, value: S.n, fmt: (v) => `${v} 位（${1 << v} 级）`, onInput: (v) => ((S.n = v), update()) });
      L.seg(gQ, {
        label: "量化方式",
        options: [
          { v: "floor", t: "只舍不入" },
          { v: "round", t: "有舍有入" },
        ],
        value: "floor",
        onChange: (v) => ((S.round = v === "round"), update()),
      });
      subhead(gQ, "输入正弦 v_I = V_REF/2 + A·sin 2πft");
      const ampS = L.slider(gQ, { label: "幅度 A", min: 0.1, max: 5, step: 0.1, value: S.amp, fmt: (v) => `${v.toFixed(1)} V`, onInput: (v) => ((S.amp = Math.min(v, S.vref / 2)), update()) });
      L.slider(gQ, { label: "信号频率 f", min: 50, max: 1000, step: 10, value: S.f, fmt: (v) => `${v} Hz`, onInput: (v) => ((S.f = v), update()) });
      L.slider(gQ, { label: "采样率 f_s", min: 0, max: FS.length - 1, step: 1, value: S.fsI, fmt: (i) => fStr(FS[i]), onInput: (i) => ((S.fsI = i), update()) });
      const rQ = L.row(gQ, "lb2-presets");
      L.button(rQ, { label: "演示混叠（f_s < 2f）", onClick: () => ((S.f = 200), (S.fsI = FS.indexOf(250)), syncQ(), update()) });
      L.button(rQ, { label: "恢复 f_s = 20f", onClick: () => ((S.fsI = FS.indexOf(4000)), (S.f = 200), syncQ(), update()) });
      const qSliders = gQ.querySelectorAll("input[type=range]");
      function syncQ() {
        const sl = [...qSliders];
        sl[2].value = S.f;
        sl[2].dispatchEvent(new Event("input"));
        sl[3].value = S.fsI;
        sl[3].dispatchEvent(new Event("input"));
      }
      // SAR
      const sarVS = L.slider(gS, { label: "输入 v_I", min: 0, max: 10, step: 0.01, value: S.sarV, fmt: (v) => `${v.toFixed(2)} V`, onInput: (v) => ((S.sarV = Math.min(v, S.vref - 1e-9)), (S.sarK = S.sarN), update()) });
      L.slider(gS, { label: "位数 n", min: 4, max: 8, step: 1, value: S.sarN, fmt: (v) => `${v} 位`, onInput: (v) => ((S.sarN = v), (S.sarK = Math.min(S.sarK, v)), update()) });
      const rS = L.row(gS);
      L.button(rS, { label: "复位", onClick: () => ((playing = false), (S.sarK = 0), update()) });
      const bSarStep = L.button(rS, { label: "下一拍 ▶", kind: "primary", onClick: () => ((playing = false), (S.sarK = Math.min(S.sarN, S.sarK + 1)), update()) });
      const bSarPlay = L.button(rS, { label: "自动", onClick: () => ((playing = !playing), playing && S.sarK >= S.sarN && (S.sarK = 0), (acc = 0), update()) });
      // DAC
      const dBits = L.bits(gD, { label: "数字输入 D3 D2 D1 D0", n: 4, value: S.dac, names: ["D3", "D2", "D1", "D0"], onChange: (b) => ((S.dac = b), update()) });
      const rD = L.row(gD, "lb2-presets");
      [["0000", [0, 0, 0, 0]], ["0001", [0, 0, 0, 1]], ["1000", [1, 0, 0, 0]], ["1111", [1, 1, 1, 1]]].forEach(([t, b]) =>
        L.button(rD, { label: t, onClick: () => ((S.dac = b.slice()), dBits.set(b), update()) })
      );
      gD.append($h("p", "lb2-p lb2-dim", "R = 10 kΩ，R<sub>f</sub> = R。"));

      /* ---- 左侧容器 ---- */
      const boxQ = $h("div", "lb2-box lb2-sec");
      const boxS = $h("div", "lb2-box lb2-sec");
      const boxD = $h("div", "lb2-box lb2-sec");
      canvas.append(boxQ, boxS, boxD);
      const alertBox = $h("div", "lb2-alert");
      alertBox.setAttribute("role", "status");

      const ro = [0, 1, 2, 3, 4].map(() => L.readout(readouts, "—", { html: true }));
      const dts = readouts.querySelectorAll("dt");
      const setRo = (labels, vals) => {
        ro.forEach((fn, i) => fn(vals[i] == null ? "" : vals[i]));
        dts.forEach((d, i) => {
          d.textContent = labels[i] || "";
          d.hidden = !labels[i];
          d.nextElementSibling.hidden = !labels[i];
        });
      };

      /* =========== (a) 量化 =========== */
      const TW = 0.01; // 显示 10 ms
      const QH1 = 236, QH2 = 104;
      const quantData = () => {
        const fs = FS[S.fsI];
        const mode = S.round ? "round" : "floor";
        const vin = (t) => S.vref / 2 + S.amp * Math.sin(2 * PI * S.f * t);
        const smp = [];
        for (let k = 0; k * (1 / fs) <= TW + 1e-12; k++) {
          const t = k / fs;
          const v = vin(t);
          smp.push(Object.assign({ t, v }, X.quantize(v, S.n, S.vref, mode)));
        }
        return { fs, mode, vin, smp, d: S.vref / (1 << S.n), alias: fs < 2 * S.f, fa: X.aliasFreq(S.f, fs) };
      };
      const sQ = sec(boxQ, "采样 → 量化（上）与量化误差 ε = v_I − D·Δ（下）");
      const stQ = L.stage(sQ, {
        height: () => 10 + QH1 + 16 + QH2 + 30,
        draw(ctx, W, H) {
          const q = quantData();
          const d = q.d;
          const x0 = 54, x1 = W - 12;
          const xOf = (t) => x0 + (t / TW) * (x1 - x0);
          const yT = 10, yB = yT + QH1;
          const yv = (v) => yB - (v / S.vref) * (yB - yT - 8);
          const N = 1 << S.n;
          // 量化电平线与码标注
          const pxPer = (yB - yT - 8) / N;
          const every = Math.max(1, Math.pow(2, Math.ceil(Math.log2(13 / pxPer))));
          for (let c = 0; c < N; c++) {
            const y = Math.round(yv(c * d)) + 0.5;
            if (pxPer >= 3 || c % every === 0) line(ctx, [[x0, y], [x1, y]], rgba(C.rule, 0.9), 1);
            if (c % every === 0 && yv(S.vref) + 22 < y) L.txt(ctx, S.n <= 4 ? bin(c, S.n) : String(c), x0 - 5, y, { size: 9.5, color: C.ink3, align: "right" });
          }
          line(ctx, [[x0, yv(S.vref)], [x1, yv(S.vref)]], C.ink3, 1, [3, 3]);
          L.txt(ctx, `${sig(S.vref)}V`, x0 - 5, yv(S.vref), { size: 9, color: C.ink2, align: "right" });
          L.txt(ctx, "V_REF", x0 - 5, yv(S.vref) + 11, { size: 8, color: C.ink3, align: "right" });
          L.txt(ctx, "码", 4, (yT + yB) / 2, { size: 10, color: C.ink3, font: "sans" });
          // 原信号
          ctx.strokeStyle = C.ink3;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let i = 0; i <= 600; i++) {
            const t = (i / 600) * TW;
            const x = xOf(t), y = yv(q.vin(t));
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
          // 混叠：看起来的低频正弦
          if (q.alias && q.fa > 0) {
            const k = Math.round(S.f / q.fs);
            const sgn = Math.sign(S.f - k * q.fs) || 1;
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = C.warn;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let i = 0; i <= 400; i++) {
              const t = (i / 400) * TW;
              const y = yv(S.vref / 2 + sgn * S.amp * Math.sin(2 * PI * q.fa * t));
              i ? ctx.lineTo(xOf(t), y) : ctx.moveTo(xOf(t), y);
            }
            ctx.stroke();
            ctx.restore();
          }
          // 量化阶梯（采样保持）
          ctx.strokeStyle = C.hi;
          ctx.lineWidth = 2;
          ctx.beginPath();
          q.smp.forEach((s, i) => {
            const xa = xOf(s.t);
            const xb = i + 1 < q.smp.length ? xOf(q.smp[i + 1].t) : Math.min(x1, xOf(s.t + 1 / q.fs));
            const y = yv(s.vq);
            if (i) ctx.lineTo(xa, y);
            else ctx.moveTo(xa, y);
            ctx.lineTo(xb, y);
          });
          ctx.stroke();
          // 采样点
          const rr = q.smp.length > 80 ? 1.8 : 3;
          q.smp.forEach((s) => {
            ctx.fillStyle = C.data;
            ctx.beginPath();
            ctx.arc(xOf(s.t), yv(s.v), rr, 0, 2 * PI);
            ctx.fill();
          });
          // 图例
          const lg = [
            [C.ink3, "v_I"],
            [C.data, "采样点"],
            [C.hi, "量化阶梯"],
          ];
          if (q.alias) lg.push([C.warn, `混叠 ${sig(q.fa)} Hz`]);
          let lx = x0 + 4, ly = yT;
          setFont(L, ctx, 9.5, 400, "sans");
          lg.forEach(([col, s]) => {
            const w = ctx.measureText(s).width;
            if (lx + w + 16 > x1) ((lx = x0 + 4), (ly += 15));
            ctx.fillStyle = cssv("--paper", "#f2efe6");
            ctx.fillRect(lx - 2, ly + 1, w + 20, 14);
            ctx.fillStyle = col;
            ctx.fillRect(lx, ly + 7, 10, 3);
            L.txt(ctx, s, lx + 13, ly + 8.5, { size: 9.5, color: C.ink2, font: "sans" });
            lx += w + 24;
          });
          // ---- 误差带 ----
          const eT = yB + 16, eB = eT + QH2;
          const eMid = (eT + eB) / 2;
          const eS = (QH2 / 2 - 8) / (1.15 * d);
          const ye = (e) => eMid - e * eS;
          ctx.strokeStyle = C.rule;
          ctx.strokeRect(x0 + 0.5, eT + 0.5, x1 - x0 - 1, QH2 - 1);
          line(ctx, [[x0, ye(0)], [x1, ye(0)]], C.ink3, 1);
          const bnds = S.round ? [[d / 2, "+Δ/2"], [-d / 2, "−Δ/2"]] : [[d, "+Δ"]];
          bnds.forEach(([e, s]) => {
            line(ctx, [[x0, ye(e)], [x1, ye(e)]], C.warn, 1, [4, 3]);
            L.txt(ctx, s, x0 - 5, ye(e), { size: 9.5, color: C.warn, align: "right" });
          });
          L.txt(ctx, "0", x0 - 5, ye(0), { size: 9.5, color: C.ink3, align: "right" });
          L.txt(ctx, "ε", 6, eMid, { size: 12, color: C.ink2, weight: 700 });
          // 连续误差曲线（若每一时刻都量化）
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, eT, x1 - x0, QH2);
          ctx.clip();
          ctx.strokeStyle = rgba(C.ink3, 0.55);
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i <= 900; i++) {
            const t = (i / 900) * TW;
            const v = q.vin(t);
            const e = X.quantize(v, S.n, S.vref, q.mode).err;
            i ? ctx.lineTo(xOf(t), ye(e)) : ctx.moveTo(xOf(t), ye(e));
          }
          ctx.stroke();
          q.smp.forEach((s) => {
            const x = xOf(s.t);
            line(ctx, [[x, ye(0)], [x, ye(s.err)]], C.hi, 1.4);
            ctx.fillStyle = C.hi;
            ctx.beginPath();
            ctx.arc(x, ye(s.err), rr * 0.8, 0, 2 * PI);
            ctx.fill();
          });
          ctx.restore();
          // 时间轴
          for (let ms = 0; ms <= 10; ms += 2) {
            const x = xOf(ms / 1000);
            L.txt(ctx, String(ms), x, H - 12, { size: 9.5, color: C.ink3, align: "center" });
          }
          L.txt(ctx, "t / ms", 4, H - 12, { size: 9.5, color: C.ink3 });
        },
      });
      const qInfo = $h("div", "lb2-formula");
      boxQ.append(qInfo);

      /* =========== (b) 逐次逼近 =========== */
      const sS = sec(boxS, "DAC 试探输出与 v_I 比较（每拍一位，像二分查找）");
      const stS = L.stage(sS, {
        height: 270,
        draw(ctx, W, H) {
          const n = S.sarN, k = S.sarK;
          const res = X.sarConvert(S.sarV, n, S.vref);
          const x0 = 52, x1 = W - 12;
          const cw = (x1 - x0) / n;
          const yT = 14, yB = H - 44;
          const yv = (v) => yB - (v / S.vref) * (yB - yT);
          // 坐标
          [0, 0.5, 1].forEach((f) => {
            const y = yv(f * S.vref);
            line(ctx, [[x0, y], [x1, y]], C.rule, 1);
            if (Math.abs(y - yv(S.sarV)) > 12) L.txt(ctx, `${sig(f * S.vref)}V`, x0 - 5, y, { size: 9.5, color: C.ink3, align: "right" });
          });
          // 每拍：二分区间、试探值
          for (let j = 0; j < n; j++) {
            const xa = x0 + j * cw, xb = xa + cw;
            const st = res.steps[j];
            const lo = j ? res.steps[j - 1].code * res.d : 0;
            const hi = lo + (1 << (st.bit + 1)) * res.d;
            if (j === k) {
              ctx.fillStyle = rgba(C.clk, 0.1);
              ctx.fillRect(xa, yT, cw, yB - yT);
              ctx.strokeStyle = C.clk;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(xa + 0.75, yT + 0.75, cw - 1.5, yB - yT - 1.5);
            }
            if (j <= k && j < n) {
              ctx.fillStyle = rgba(C.data, j === k ? 0.16 : 0.09);
              ctx.fillRect(xa + 2, yv(Math.min(hi, S.vref)), cw - 4, yv(lo) - yv(Math.min(hi, S.vref)));
            }
            // 拍号与位名
            L.txt(ctx, `D${st.bit}`, xa + cw / 2, yB + 12, { size: cw < 30 ? 9.5 : 10.5, color: j === k ? C.clk : C.ink2, align: "center", weight: 600 });
            if (j < k) L.txt(ctx, st.keep ? "留" : "清", xa + cw / 2, yB + 28, { size: 10.5, color: st.keep ? C.ok : C.hi, align: "center", font: "sans", weight: 700 });
            else if (j === k) L.txt(ctx, "试", xa + cw / 2, yB + 28, { size: 10.5, color: C.clk, align: "center", font: "sans", weight: 700 });
          }
          L.txt(ctx, "位", 6, yB + 12, { size: 10, color: C.ink3, font: "sans" });
          L.txt(ctx, "结果", 6, yB + 28, { size: 10, color: C.ink3, font: "sans" });
          // v_I
          line(ctx, [[x0, yv(S.sarV)], [x1, yv(S.sarV)]], C.data, 1.6, [6, 4]);
          tagTxt(L, ctx, "v_I", x0 - 5, yv(S.sarV), { size: 10, color: C.data, align: "right", weight: 700 });
          // 试探阶梯（DAC 输出）
          const upto = Math.min(k + 1, n);
          ctx.strokeStyle = C.ink2;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let j = 0; j < upto; j++) {
            const xa = x0 + j * cw, xb = xa + cw;
            const y = yv(res.steps[j].vdac);
            j ? ctx.lineTo(xa, y) : ctx.moveTo(xa, y);
            ctx.lineTo(xb, y);
          }
          ctx.stroke();
          for (let j = 0; j < upto; j++) {
            const xa = x0 + j * cw;
            const st = res.steps[j];
            const col = j === k ? C.clk : st.keep ? C.ok : C.hi;
            line(ctx, [[xa + 3, yv(st.vdac)], [xa + cw - 3, yv(st.vdac)]], col, 3);
          }
          // 结果
          if (k >= n) {
            const y = yv(res.vq);
            line(ctx, [[x0, y], [x1, y]], C.ok, 1.4, [2, 3]);
            tagTxt(L, ctx, `D·Δ = ${sig(res.vq, 4)} V`, x1 - 2, y + 9, { size: 9.5, color: C.ok, align: "right", weight: 600 });
          }
        },
      });
      const regBox = $h("div", "lb2-reg");
      const sarTab = $h("div", "lb2-scroll");
      sS.append(regBox, sarTab);

      /* =========== (c) 倒 T 形 R–2R DAC =========== */
      const sD = sec(boxD, "倒 T 形电阻网络（4 位，R = 10 kΩ，R_f = R）");
      const DVW = 470, DVH = 292;
      const dScale = (W) => L.clamp(W / DVW, 0.85, 1.5);
      const dWrap = $h("div", "lb2-scroll");
      sD.append(dWrap);
      const stD = L.stage(dWrap, {
        height: (W) => Math.round(DVH * dScale(W)),
        draw(ctx, W) {
          const k = dScale(W);
          const r = X.dacR2R(S.dac, S.vref, S.R, S.R);
          const card = cssv("--card", "#f8f6f0");
          ctx.save();
          ctx.translate(Math.max(0, (W - DVW * k) / 2), 0);
          ctx.scale(k, k);
          const T = (s, x, y, o = {}) => L.txt(ctx, s, x, y, Object.assign({ size: 11 }, o));
          const res = (cx, cy, w, h) => {
            ctx.fillStyle = card;
            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.3;
            ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
          };
          const gnd = (x, y) => [[0, 14], [4, 9], [8, 4]].forEach(([dy, w]) => line(ctx, [[x - w / 2, y + dy], [x + w / 2, y + dy]], C.ink, 1.3));
          const dot = (x, y) => {
            ctx.fillStyle = C.ink;
            ctx.beginPath();
            ctx.arc(x, y, 2.8, 0, 2 * PI);
            ctx.fill();
          };
          const XS = [84, 160, 236, 312];
          const RAIL = 60, BUS = 218;
          // V_REF 与主干
          line(ctx, [[22, RAIL], [368, RAIL]], C.ink, 1.4);
          ctx.fillStyle = C.data;
          ctx.beginPath();
          ctx.arc(22, RAIL, 4, 0, 2 * PI);
          ctx.fill();
          T("V_REF", 8, RAIL + 18, { size: 11, weight: 700, color: C.data });
          T(`${sig(S.vref)} V`, 8, RAIL + 33, { size: 10.5, color: C.data });
          [122, 198, 274].forEach((cx) => {
            res(cx, RAIL, 28, 11);
            T("R", cx, RAIL - 14, { size: 10.5, align: "center", color: C.ink2 });
          });
          // 各支路
          const fr = ["I/2", "I/4", "I/8", "I/16"];
          XS.forEach((x, i) => {
            const b = S.dac[i];
            const kk = 3 - i;
            const col = b ? C.hi : C.ink3;
            dot(x, RAIL);
            T(`${sig(r.node[kk])}V`, x, RAIL - 30, { size: 10, align: "center", color: C.ink2 });
            T(`A${kk}`, x, RAIL - 44, { size: 9.5, align: "center", color: C.ink3 });
            line(ctx, [[x, RAIL], [x, 152]], col, b ? 2 : 1.4);
            res(x, 106, 11, 38);
            T("2R", x - 9, 106, { size: 10, align: "right", color: C.ink2 });
            T(fr[i], x + 9, 96, { size: 10.5, color: col, weight: 700 });
            T(iStr(r.leg[kk]), x + 9, 112, { size: 9.5, color: col });
            arrowHead(ctx, x, 142, PI / 2, 7, col);
            // 开关
            dot(x, 152);
            T(`S${kk}`, x - 10, 147, { size: 10, align: "right", color: C.ink, weight: 600 });
            line(ctx, [[x - 13, 182], [x - 13, 190]], C.ink2, 1.2);
            gnd(x - 13, 190);
            line(ctx, [[x + 13, 182], [x + 13, BUS]], b ? C.hi : C.ink2, b ? 2 : 1.2);
            T("0", x - 22, 181, { size: 9, color: C.ink3, align: "center" });
            T("1", x + 22, 181, { size: 9, color: C.ink3, align: "center" });
            line(ctx, [[x, 152], [b ? x + 13 : x - 13, 182]], col, 2.4);
            dot(x - 13, 182);
            dot(x + 13, 182);
            T(`D${kk}=${b}`, x - 13, 228, { size: 9.5, color: b ? C.hi : C.ink3, align: "center", weight: 600 });
          });
          // 终端 2R
          line(ctx, [[368, RAIL], [368, 150]], C.ink3, 1.4);
          res(368, 106, 11, 38);
          T("2R", 377, 106, { size: 10, color: C.ink2 });
          T(iStr(r.leg[0]), 377, 122, { size: 9.5, color: C.ink3 });
          gnd(368, 150);
          // I_Σ 总线 → 运放
          const any = S.dac.some((b) => b);
          line(ctx, [[XS[0] + 13, BUS], [392, BUS]], any ? C.hi : C.ink2, any ? 2 : 1.3);
          [1, 2, 3].forEach((i) => dot(XS[i] + 13, BUS));
          T(`I_Σ = ${iStr(r.iSum)}`, 150, BUS + 30, { size: 11, color: any ? C.hi : C.ink2, weight: 700 });
          // 运放
          ctx.beginPath();
          ctx.moveTo(392, 202);
          ctx.lineTo(392, 260);
          ctx.lineTo(440, 231);
          ctx.closePath();
          ctx.fillStyle = card;
          ctx.fill();
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          T("−", 397, BUS, { size: 11, weight: 700 });
          T("+", 397, 246, { size: 11, weight: 700 });
          line(ctx, [[392, 246], [380, 246], [380, 252]], C.ink2, 1.2);
          gnd(380, 252);
          // R_f
          line(ctx, [[384, BUS], [384, 178], [454, 178], [454, 231], [440, 231]], C.ink2, 1.3);
          dot(384, BUS);
          res(419, 178, 28, 11);
          T("R_f", 419, 164, { size: 10.5, align: "center", color: C.ink2 });
          dot(454, 231);
          T("v_O", 466, 252, { size: 11, weight: 700, color: C.ok, align: "right" });
          T(`${sig(r.vo, 4)} V`, 466, 268, { size: 10.5, color: C.ok, align: "right", weight: 600 });
          T("虚地 0 V", 356, BUS - 10, { size: 9.5, color: C.ink3, font: "sans", align: "center" });
          ctx.restore();
        },
      });
      stD.el.classList.add("lb2-wide");
      const dTab = $h("div", "lb2-scroll");
      const dInfo = $h("div", "lb2-formula");
      sD.append(dTab, dInfo);

      /* =========== 更新 =========== */
      const pct = (x) => `${sig(x * 100)} %`;
      function update() {
        const m = S.mode;
        boxQ.hidden = m !== "quant";
        boxS.hidden = m !== "sar";
        boxD.hidden = m !== "dac";
        gQ.hidden = m !== "quant";
        gS.hidden = m !== "sar";
        gD.hidden = m !== "dac";
        let alert = "", acls = "ok";
        if (m === "quant") {
          const q = quantData();
          const d = q.d, n = S.n;
          const maxE = q.smp.reduce((a, s) => Math.max(a, Math.abs(s.err)), 0);
          const clip = S.round && q.smp.some((s) => s.v > S.vref - d / 2);
          setRo(["Δ = V_REF/2ⁿ", "分辨率 1/(2ⁿ−1)", "最大量化误差", "采样实测 max|ε|", "f_s / f"], [
            vStr(d),
            pct(1 / ((1 << n) - 1)),
            S.round ? `Δ/2 = ${vStr(d / 2)}` : `Δ = ${vStr(d)}`,
            vStr(maxE),
            `${sig(q.fs / S.f)}`,
          ]);
          if (q.alias) {
            alert = `<b>f<sub>s</sub> = ${fStr(q.fs)} &lt; 2f = ${fStr(2 * S.f)}：混叠！</b>采样点（蓝点）看起来像一个 ${sig(q.fa)} Hz 的正弦（品红虚线），量化阶梯复现的是这个假的低频信号。`;
            acls = "warn";
          } else alert = `f<sub>s</sub> = ${fStr(q.fs)} ≥ 2f = ${fStr(2 * S.f)}，满足采样定理（每个信号周期 ${sig(q.fs / S.f)} 个采样点）。${S.round ? "有舍有入：误差落在 ±Δ/2 之间。" : "只舍不入：误差总在 0 ~ Δ 之间（永远为正）。"}`;
          if (clip) {
            alert += ` <b>注意</b>：有采样值超过 V<sub>REF</sub> − Δ/2，码已到最大 ${(1 << n) - 1}，误差超出 Δ/2。`;
            acls = "warn";
          }
          const yan = (2 * S.vref) / ((1 << (n + 1)) - 1);
          qInfo.innerHTML = `<div>$\\Delta=\\dfrac{V_{REF}}{2^n}=\\dfrac{${sig(S.vref)}\\,\\mathrm V}{2^{${n}}}=${sig(d, 4)}\\,\\mathrm V$；分辨率两种表述：$\\dfrac{1}{2^n-1}=\\dfrac1{${(1 << n) - 1}}\\approx${sig(100 / ((1 << n) - 1))}\\%$，或 $\\dfrac{V_{REF}}{2^n}=${sig(d, 4)}\\,\\mathrm V$</div>
            <div>${S.round ? `有舍有入：$D=\\lfloor v_I/\\Delta+\\tfrac12\\rfloor$，$|\\varepsilon|\\le\\Delta/2=${sig(d / 2, 4)}\\,\\mathrm V$（顶端钳位除外）` : `只舍不入：$D=\\lfloor v_I/\\Delta\\rfloor$，$0\\le\\varepsilon\\lt\\Delta=${sig(d, 4)}\\,\\mathrm V$`}</div>
            <div class="lb2-dim">对照阎石写法（取 $V_m=V_{REF}$）：有舍有入 $\\Delta'=\\dfrac{2V_m}{2^{n+1}-1}=${sig(yan, 4)}\\,\\mathrm V$，最大误差 $\\Delta'/2$ ⚠️以你的教材为准</div>`;
          L.renderMath(qInfo);
          boxQ.append(alertBox);
          stQ.resize();
        } else if (m === "sar") {
          const n = S.sarN, k = Math.min(S.sarK, n);
          const v = Math.min(S.sarV, S.vref - 1e-9);
          const res = X.sarConvert(v, n, S.vref);
          const fl = X.quantize(v, n, S.vref, "floor").code;
          // 寄存器
          let rh = "";
          for (let j = 0; j < n; j++) {
            const st = res.steps[j];
            const cls = j < k ? (st.keep ? "on" : "") : j === k ? "try" : "todo";
            const val = j < k ? (st.keep ? 1 : 0) : j === k ? 1 : "–";
            rh += `<div class="lb2-regbit ${cls}"><b>${val}</b><small>D${st.bit}</small></div>`;
          }
          regBox.innerHTML = `<span class="lb2-p lb2-dim">逐次逼近寄存器：</span>${rh}`;
          // 步骤表
          let tb = "";
          for (let j = 0; j < Math.min(k + 1, n); j++) {
            const st = res.steps[j];
            const done = j < k;
            tb += `<tr class="${j === k - 1 ? "cur" : ""}"><td>${j + 1}</td><td>D${st.bit} = 1</td><td>${bin(st.trial, n)}</td><td>${sig(st.vdac, 4)} V</td><td>${done ? (st.keep ? `${sig(v, 4)} ≥ ${sig(st.vdac, 4)}` : `${sig(v, 4)} &lt; ${sig(st.vdac, 4)}`) : "待比较"}</td><td class="${done ? (st.keep ? "lb2-ok" : "lb2-bad") : ""}">${done ? (st.keep ? "保留 1" : "清除为 0") : "…"}</td></tr>`;
          }
          sarTab.innerHTML = `<table class="tt lb2-tt"><thead><tr><th>拍</th><th>试探</th><th>试探码</th><th>DAC 输出 v<sub>O</sub></th><th>比较 v<sub>I</sub> 与 v<sub>O</sub></th><th>结果</th></tr></thead><tbody>${tb}</tbody></table>`;
          const cur = k ? res.steps[k - 1].code : 0;
          setRo(["输入 v_I", "Δ = V_REF/2ⁿ", "寄存器（已定位）", "结果 D", "⌊v_I/Δ⌋"], [
            `${sig(v, 4)} V`,
            vStr(res.d),
            `${bin(cur, n).slice(0, k)}${"·".repeat(n - k)}`,
            k >= n ? `${bin(res.code, n)}（${res.code}）` : "转换中…",
            `${fl} ${k >= n ? (fl === res.code ? "✓ 一致" : "✗") : ""}`,
          ]);
          if (k === 0) alert = `复位：寄存器清零。点“下一拍”，从最高位 D${n - 1} 开始试探（先令 D${n - 1}=1，DAC 输出 V<sub>REF</sub>/2 = ${sig(S.vref / 2)} V）。`;
          else if (k < n) {
            const st = res.steps[k - 1];
            alert = `第 ${k} 拍：试探 D${st.bit}=1 → DAC 输出 ${sig(st.vdac, 4)} V ${st.keep ? "≤" : "&gt;"} v<sub>I</sub>，所以 D${st.bit} ${st.keep ? "<b>保留 1</b>" : "<b>清除为 0</b>"}。v<sub>I</sub> 的可能范围缩小一半（蓝色区间）。`;
            acls = st.keep ? "ok" : "hi";
          } else {
            alert = `<b>转换完成</b>：D = ${bin(res.code, n)} = ${res.code}，D·Δ = ${sig(res.vq, 4)} V ≤ v<sub>I</sub>，正好等于 ⌊v<sub>I</sub>/Δ⌋ = ${fl}（与“只舍不入”量化一致）。${n} 位只要 ${n} 次比较；阎石书中电路一次转换需 n+2 = ${n + 2} 个时钟周期 ⚠️以教材为准。`;
          }
          bSarStep.disabled = k >= n;
          bSarPlay.textContent = playing ? "暂停" : "自动";
          boxS.append(alertBox);
          stS.redraw();
        } else {
          const r = X.dacR2R(S.dac, S.vref, S.R, S.R);
          const I = S.vref / S.R;
          setRo(["数字量 D", "I = V_REF/R", "I_Σ", "v_O（节点分析）", "公式 −V_REF·D/2⁴"], [
            `${S.dac.join("")}（${r.val}）`,
            iStr(I),
            iStr(r.iSum),
            `${sig(r.vo, 4)} V`,
            `${sig(r.voFormula, 4)} V`,
          ]);
          const fr = ["1/2", "1/4", "1/8", "1/16"];
          dTab.innerHTML = `<table class="tt lb2-tt"><thead><tr><th>位</th><th>D</th><th>节点电压</th><th>支路电流</th><th>= I×</th><th>流向</th></tr></thead><tbody>${S.dac
            .map((b, i) => {
              const kk = 3 - i;
              return `<tr><td>D${kk}</td><td class="${b ? "on" : ""}">${b}</td><td>A${kk} = ${sig(r.node[kk], 4)} V</td><td>${iStr(r.leg[kk])}</td><td>${fr[i]}</td><td>${b ? "→ I<sub>Σ</sub>（虚地）" : "→ 地"}</td></tr>`;
            })
            .join("")}</tbody></table>`;
          const sum = S.dac.map((b, i) => (b ? `2^${3 - i}` : null)).filter(Boolean).join("+") || "0";
          dInfo.innerHTML = `<div>$I=\\dfrac{V_{REF}}{R}=\\dfrac{${sig(S.vref)}\\,\\mathrm V}{10\\,\\mathrm{k\\Omega}}=${iStr(I).replace(" ", "\\,\\mathrm{").replace("μ", "\\mu ")}}$，$I_\\Sigma=\\sum D_i\\dfrac{I}{2^{4-i}}=${iStr(r.iSum).replace(" ", "\\,\\mathrm{").replace("μ", "\\mu ")}}$</div>
            <div>$v_O=-R_fI_\\Sigma=-\\dfrac{V_{REF}}{2^4}\\sum D_i2^i=-\\dfrac{${sig(S.vref)}}{16}\\times(${sum})=${sig(r.voFormula, 4)}\\,\\mathrm V$</div>`;
          L.renderMath(dInfo);
          alert = `开关 S<sub>i</sub> 接 1（I<sub>Σ</sub>，运放虚地）或接 0（地），支路下端都是 0 V，所以各支路电流 I/2、I/4、I/8、I/16 不随数码变化；数码只决定哪些电流被送进运放求和。节点分析得 v<sub>O</sub> = ${sig(r.vo, 4)} V，与公式 ${sig(r.voFormula, 4)} V 一致。`;
          boxD.append(alertBox);
          stD.resize();
        }
        alertBox.className = "lb2-alert " + acls;
        alertBox.innerHTML = alert;
      }

      update();

      return {
        frame(dt) {
          if (!playing || S.mode !== "sar") return;
          acc += dt;
          if (acc >= 0.85) {
            acc = 0;
            S.sarK = Math.min(S.sarN, S.sarK + 1);
            if (S.sarK >= S.sarN) playing = false;
            update();
          }
        },
        touch() {
          update();
        },
      };
    },
  });
})();
