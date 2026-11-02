// 实验室框架：注册表 + 通用控件 + 画布封装
// 各实验写在 labs-a.js / labs-b.js 里，通过 Labs.register(id, { title, desc, note, make }) 注册。
// make({ canvas, controls, readouts, L }) 必须返回 { frame?(dt), touch?() }：
//   frame(dt) 每帧调用（仅当实验可见），touch() 在切换到该实验 / 字体加载完成时调用（用于重绘）。
(() => {
  "use strict";

  /* ---------------- 颜色：从 CSS 变量读取，保证与页面一致 ---------------- */
  const cssVar = (name, fb) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  };
  const COL = {};
  function readColors() {
    Object.assign(COL, {
      paper: cssVar("--paper", "#f2efe6"),
      paper2: cssVar("--paper-2", "#e8e3d5"),
      ink: cssVar("--ink", "#16181b"),
      ink2: cssVar("--ink-2", "#4b4f55"),
      ink3: cssVar("--ink-3", "#8a8a84"),
      rule: cssVar("--rule", "#cdc6b4"),
      hi: cssVar("--hi", "#e2462c"), //   逻辑 1 / 强调（朱红）
      clk: cssVar("--clk", "#c98a12"), //  时钟（琥珀）
      data: cssVar("--data", "#2161a6"), // 数据 / 输入（钴蓝）
      ok: cssVar("--ok", "#2c8a57"), //    正确 / 输出（绿）
      warn: cssVar("--warn", "#b0359a"), // 不定 / 冒险（品红）
      scr: cssVar("--scr", "#111316"), //  暗屏背景（示波器插页）
      scrInk: cssVar("--scr-ink", "#e9e6dc"),
      scrDim: cssVar("--scr-dim", "#5d625f"),
      scrGrid: cssVar("--scr-grid", "#22262a"),
      trace: cssVar("--trace", "#7dfa9c"), // 暗屏上的波形（荧光绿）
    });
  }
  readColors();

  const FONT = {
    mono: '"Martian Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
    sans: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif',
  };

  /* ---------------- 小工具 ---------------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const h = (tag, cls = "", text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function renderMath(el) {
    if (el && typeof window.renderMathInElement === "function") {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }

  /* ---------------- 控件（统一样式，类名见 styles.css 的 .ctl-*） ---------------- */
  // 滑块：返回 { el, get(), set(v) }
  function slider(parent, { label, min, max, step = 1, value, fmt = (v) => String(v), onInput }) {
    const wrap = h("label", "ctl ctl-slider");
    const top = h("span", "ctl-top");
    const name = h("span", "ctl-name", label);
    const val = h("output", "ctl-val", fmt(value));
    top.append(name, val);
    const inp = h("input");
    Object.assign(inp, { type: "range", min, max, step, value });
    inp.addEventListener("input", () => {
      val.textContent = fmt(+inp.value);
      onInput && onInput(+inp.value);
    });
    wrap.append(top, inp);
    parent.append(wrap);
    return {
      el: wrap,
      get: () => +inp.value,
      set(v) {
        inp.value = v;
        val.textContent = fmt(+inp.value);
      },
    };
  }

  // 分段选择：options = [{ v, t }]，返回 { el, get(), set(v) }
  function seg(parent, { label, options, value, onChange }) {
    const wrap = h("div", "ctl ctl-seg");
    if (label) wrap.append(h("span", "ctl-name", label));
    const row = h("div", "seg-row");
    row.setAttribute("role", "radiogroup");
    if (label) row.setAttribute("aria-label", label);
    let cur = value;
    const btns = options.map((o) => {
      const b = h("button", "seg-btn");
      b.type = "button";
      b.innerHTML = o.html || esc(o.t);
      b.dataset.v = o.v;
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => {
        set(o.v);
        onChange && onChange(o.v);
      });
      row.append(b);
      return b;
    });
    function set(v) {
      cur = v;
      btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));
    }
    set(value);
    wrap.append(row);
    parent.append(wrap);
    return { el: wrap, get: () => cur, set };
  }

  // 开关：返回 { el, get(), set(b) }
  function toggle(parent, { label, value = false, onChange }) {
    const b = h("button", "ctl ctl-toggle");
    b.type = "button";
    b.setAttribute("role", "switch");
    b.innerHTML = `<span class="tg-track"><span class="tg-knob"></span></span><span class="ctl-name">${esc(label)}</span>`;
    let cur = value;
    const set = (v) => {
      cur = !!v;
      b.setAttribute("aria-checked", String(cur));
    };
    set(value);
    b.addEventListener("click", () => {
      set(!cur);
      onChange && onChange(cur);
    });
    parent.append(b);
    return { el: b, get: () => cur, set };
  }

  // 按钮：kind = "primary" | "ghost"
  function button(parent, { label, kind = "ghost", onClick }) {
    const b = h("button", `ctl-btn ${kind}`, label);
    b.type = "button";
    b.addEventListener("click", () => onClick && onClick());
    parent.append(b);
    return b;
  }

  // 一行按钮容器
  function row(parent, cls = "") {
    const r = h("div", `ctl-row ${cls}`);
    parent.append(r);
    return r;
  }

  // 位开关（0/1 拨码）：返回 { el, get(), set(bits) }；bits 为 0/1 数组，高位在前
  function bits(parent, { label, n, value, names, onChange }) {
    const wrap = h("div", "ctl ctl-bits");
    if (label) wrap.append(h("span", "ctl-name", label));
    const r = h("div", "bit-row");
    let cur = (value || Array(n).fill(0)).slice();
    const btns = cur.map((_, i) => {
      const b = h("button", "bit");
      b.type = "button";
      b.innerHTML = `<b></b><small>${esc(names ? names[i] : n - 1 - i)}</small>`;
      b.addEventListener("click", () => {
        cur[i] ^= 1;
        paint();
        onChange && onChange(cur.slice());
      });
      r.append(b);
      return b;
    });
    function paint() {
      btns.forEach((b, i) => {
        b.dataset.on = cur[i];
        b.querySelector("b").textContent = cur[i];
        b.setAttribute("aria-pressed", String(!!cur[i]));
      });
    }
    paint();
    wrap.append(r);
    parent.append(wrap);
    return {
      el: wrap,
      get: () => cur.slice(),
      set(v) {
        cur = v.slice();
        paint();
      },
    };
  }

  // 读数：返回 setter(text | html)。readouts 是 <dl>
  function readout(dl, label, { html = false } = {}) {
    const dt = h("dt", "", label);
    const dd = h("dd");
    dl.append(dt, dd);
    return (v) => {
      if (html) {
        dd.innerHTML = v;
        renderMath(dd);
      } else dd.textContent = v;
    };
  }

  /* ---------------- 画布封装 ---------------- */
  // stage(container, { height, dark, draw(ctx, W, H) })
  // height：数字（px）或函数 (W) => px；dark：暗屏风格（示波器插页）
  // 返回 { cvs, ctx, W, H, redraw(), resize(), el }
  const allStages = new Set();
  function stage(container, { height = 360, dark = false, draw, cls = "" }) {
    const box = h("div", `stage ${dark ? "dark" : ""} ${cls}`);
    const cvs = h("canvas");
    box.append(cvs);
    container.append(box);
    const ctx = cvs.getContext("2d");
    const st = { cvs, ctx, W: 0, H: 0, el: box };
    st.resize = () => {
      const W = box.clientWidth;
      if (!W) return;
      const H = typeof height === "function" ? height(W) : height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.style.height = H + "px";
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.W = W;
      st.H = H;
      st.redraw();
    };
    st.redraw = () => {
      if (!st.W) return;
      ctx.clearRect(0, 0, st.W, st.H);
      draw && draw(ctx, st.W, st.H);
    };
    new ResizeObserver(() => st.resize()).observe(box);
    allStages.add(st);
    return st;
  }

  // 画布上的文字
  function txt(ctx, s, x, y, { size = 12, color = COL.ink, align = "left", base = "middle", weight = 400, font = "mono" } = {}) {
    ctx.font = `${weight} ${size}px ${FONT[font] || font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(s, x, y);
  }

  // 数字波形：values 为每个时间格的 0/1/null(不定)/"z"(高阻)；x0..x1 均分
  function wave(ctx, values, { x0, x1, y, hgt = 18, color = COL.ink, lw = 2, xColor = COL.warn } = {}) {
    const n = values.length;
    if (!n) return;
    const dx = (x1 - x0) / n;
    const yHi = y - hgt / 2;
    const yLo = y + hgt / 2;
    const yOf = (v) => (v === 1 ? yHi : v === 0 ? yLo : y);
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      const v = values[i];
      const xa = x0 + i * dx;
      const xb = xa + dx;
      if (v === null || v === undefined || v === "x") {
        ctx.fillStyle = xColor + "33";
        ctx.fillRect(xa, yHi, dx, hgt);
        ctx.strokeStyle = xColor;
        ctx.beginPath();
        ctx.moveTo(xa, yHi);
        ctx.lineTo(xb, yHi);
        ctx.moveTo(xa, yLo);
        ctx.lineTo(xb, yLo);
        ctx.stroke();
        continue;
      }
      ctx.strokeStyle = v === "z" ? COL.ink3 : color;
      ctx.beginPath();
      const prev = i > 0 ? values[i - 1] : v;
      if (i > 0 && prev !== v && prev !== null && prev !== "x") {
        ctx.moveTo(xa, yOf(prev));
        ctx.lineTo(xa, yOf(v));
      } else ctx.moveTo(xa, yOf(v));
      ctx.lineTo(xb, yOf(v));
      ctx.stroke();
    }
  }

  // 有效沿标记（小三角箭头）：dir = "up" | "down"
  function edgeMark(ctx, x, y, { dir = "up", color = COL.clk, s = 5 } = {}) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (dir === "up") {
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x, y - s * 0.6);
    } else {
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y - s);
      ctx.lineTo(x, y + s * 0.6);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 注册表与切换 ---------------- */
  const INFO = {};
  const panels = {};
  const insts = {};
  let tabsEl = null;
  let stageEl = null;
  let active = null;
  let visible = false;
  let heroFn = null;

  function register(id, info) {
    INFO[id] = info;
  }

  function build(id) {
    const info = INFO[id];
    const meta = (window.COURSE.labs || []).find((l) => l.id === id) || {};
    const p = h("div", "lab-panel");
    p.dataset.lab = id;
    p.id = `lab-${id}`;
    p.setAttribute("role", "tabpanel");
    const head = h("div", "lab-head");
    const hh = h("h3", "", info.title);
    const ls = h("span", "lh-lessons", meta.lessons || "");
    const desc = h("p", "lab-desc");
    desc.innerHTML = info.desc || "";
    head.append(hh, ls, desc);
    const body = h("div", "lab-body");
    const canvas = h("div", "lab-canvas");
    const side = h("aside", "lab-side");
    const controls = h("div", "lab-controls");
    const ro = h("dl", "lab-readouts");
    side.append(controls, ro);
    body.append(canvas, side);
    const note = h("p", "lab-note");
    note.innerHTML = info.note || "";
    p.append(head, body, note);
    stageEl.append(p);
    panels[id] = p;
    try {
      insts[id] = info.make({ canvas, controls, readouts: ro, L: API }) || {};
    } catch (err) {
      console.error(`[lab ${id}]`, err);
      canvas.append(h("p", "lab-error", `实验 ${id} 加载失败：${err.message}`));
      insts[id] = {};
    }
    renderMath(p);
  }

  function show(id) {
    if (!INFO[id]) return;
    if (!panels[id]) build(id);
    Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== id));
    if (tabsEl) tabsEl.querySelectorAll(".lab-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.lab === id)));
    active = insts[id];
    allStages.forEach((s) => s.resize());
    if (active.touch) active.touch();
  }

  function init({ tabs, stage: stg, labs }) {
    tabsEl = tabs;
    stageEl = stg;
    const list = labs.filter((l) => INFO[l.id]);
    tabs.innerHTML = list
      .map(
        (l, i) =>
          `<button class="lab-tab" type="button" role="tab" data-lab="${l.id}" aria-controls="lab-${l.id}"><span class="lt-no">${String(i + 1).padStart(2, "0")}</span><b>${esc(l.name)}</b><small>${esc(l.sub)} · ${esc(l.lessons)}</small></button>`
      )
      .join("");
    tabs.querySelectorAll(".lab-tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.lab)));
    if (list.length) show(list[0].id);
    const io = new IntersectionObserver((en) => en.forEach((e) => (visible = e.isIntersecting)), { rootMargin: "120px" });
    io.observe(stg);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (active && active.frame && visible && !document.hidden) active.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        readColors();
        allStages.forEach((s) => s.redraw());
        Object.values(insts).forEach((x) => x.touch && x.touch());
      });
  }

  // 首屏动画（由 labs-a.js 通过 Labs.setHero(fn) 提供）
  function setHero(fn) {
    heroFn = fn;
  }
  function hero(canvas) {
    if (heroFn) heroFn(canvas, API);
  }

  const API = {
    COL, FONT, clamp, h, esc, reduceMotion, renderMath,
    slider, seg, toggle, button, row, bits, readout,
    stage, txt, wave, edgeMark,
  };

  window.Labs = Object.assign(API, { register, init, show, hero, setHero, readColors });
})();
