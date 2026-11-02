(() => {
  "use strict";
  const C = window.COURSE;
  const T = window.CONTENT || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const chById = Object.fromEntries(C.chapters.map((c) => [c.id, c]));
  const ALL = C.lessons;
  const byId = Object.fromEntries(ALL.map((l) => [l.id, l]));
  const LESSONS = ALL.filter((l) => !l.checkpoint);
  const STORE = "digital-logic-progress-v1";
  const DSTORE = "digital-logic-diag-v1";
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const fmtH = (h) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
  const TOTAL = sum(ALL.map((l) => l.hours));

  const load = (k, fb) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      return v == null ? fb : v;
    } catch (e) {
      return fb;
    }
  };
  let done = new Set(load(STORE, []));
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify([...done]));
    } catch (e) {}
    renderProgress();
  };

  function renderMath(el) {
    if (!el || typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  const pips = (n, star = false) =>
    `<span class="pips${star ? " star" : ""}" aria-label="${n} / 5">${Array.from({ length: 5 }, (_, i) => `<span class="${i < n ? "on" : "off"}">${star ? "★" : "■"}</span>`).join("")}</span>`;
  const lessonRange = (ids) => (ids || []).filter((k) => byId[k]);

  /* ---------------- hero ---------------- */
  function renderHeroStats() {
    const stats = [
      [LESSONS.length, "个课时"],
      ["9 + 1", "章测 + 综合"],
      [`≈${Math.round(TOTAL)} h`, "总时长（估计值）"],
      [C.labs.length, "个交互实验"],
    ];
    $("#heroStats").innerHTML = stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");
  }

  /* ---------------- thread ---------------- */
  function sigPath(seed) {
    // 由序号生成一段确定的数字波形（纯装饰，但每段都是合法的 0/1 序列）
    const bits = [];
    let s = seed * 37 + 11;
    for (let i = 0; i < 12; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      bits.push((s >> 16) & 1);
    }
    const w = 100 / bits.length;
    let d = `M0 ${bits[0] ? 4 : 22}`;
    bits.forEach((b, i) => {
      const y = b ? 4 : 22;
      d += ` L${(i * w).toFixed(2)} ${y} L${((i + 1) * w).toFixed(2)} ${y}`;
    });
    return d;
  }
  function renderThread() {
    $("#thread-band").innerHTML = C.thread
      .map(
        (t, i) => `<div class="th-step ch-${t.ch}">
          <div class="th-sig" aria-hidden="true"><svg viewBox="0 0 100 26" preserveAspectRatio="none"><path d="${sigPath(i + 1)}"/></svg></div>
          <span class="th-no">${chById[t.ch].no} · ${esc(chById[t.ch].name)}</span>
          <h3>${esc(t.stage)}</h3>
          <p class="th-rule">${esc(t.rule)}</p>
          <p class="th-f">${t.formula}</p>
          <p class="th-q">${esc(t.q)}</p>
        </div>`
      )
      .join("");
    renderMath($("#thread"));
  }

  /* ---------------- map ---------------- */
  const MAP = { x0: 176, colW: 114, nodeW: 96, nodeH: 44, top: 44, laneH: 80 };
  const children = {};
  LESSONS.forEach((l) => l.pre.forEach((p) => (children[p] = children[p] || []).push(l.id)));
  const colOf = {};
  C.chapters.forEach((ch) => LESSONS.filter((l) => l.ch === ch.id).forEach((l, i) => (colOf[l.id] = i)));
  const laneOf = Object.fromEntries(C.chapters.map((c, i) => [c.id, i]));
  let selected = "L10";

  function closure(id, next) {
    const out = new Set();
    const stack = [...(next(id) || [])];
    while (stack.length) {
      const k = stack.pop();
      if (out.has(k)) continue;
      out.add(k);
      (next(k) || []).forEach((n) => stack.push(n));
    }
    return out;
  }
  const ancestors = (id) => closure(id, (k) => byId[k].pre);
  const descendants = (id) => closure(id, (k) => children[k]);
  const order = (ids) => [...ids].sort((a, b) => ALL.indexOf(byId[a]) - ALL.indexOf(byId[b]));

  function renderMap() {
    const { x0, colW, nodeW, nodeH, top, laneH } = MAP;
    const maxCols = Math.max(...Object.values(colOf)) + 1;
    const W = x0 + maxCols * colW + 10;
    const H = top + C.chapters.length * laneH;
    const svg = $("#mapSvg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.minWidth = `${Math.round(W * 0.82)}px`;
    const left = (l) => x0 + colOf[l.id] * colW;
    const cx = (l) => left(l) + nodeW / 2;
    const cy = (l) => top + laneOf[l.ch] * laneH + laneH / 2 - 8;
    const out = [];
    const marker = (id, color) =>
      `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1.5 1.5L8.5 5L1.5 8.5" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
    out.push(`<defs>${marker("mDim", "#b9b19c")}${marker("mUp", "#16181b")}${marker("mDown", "#8a8a84")}</defs>`);

    C.chapters.forEach((ch, i) => {
      const ls = LESSONS.filter((l) => l.ch === ch.id);
      const y = cy(ls[0]);
      out.push(`<g class="ch-${ch.id}">
        <line class="mtrack" x1="${x0 - 14}" y1="${y}" x2="${cx(ls[ls.length - 1])}" y2="${y}"/>
        <text class="mlabel-no" x="14" y="${y - 12}">${ch.no}</text>
        <text class="mlabel-name" x="14" y="${y + 7}">${esc(ch.name)}</text>
        <text class="mlabel-en" x="14" y="${y + 22}">${esc(ch.en)}</text>
      </g>`);
    });

    LESSONS.forEach((t) =>
      t.pre.forEach((pid) => {
        const s = byId[pid];
        let d;
        let cls = "medge";
        if (s.ch === t.ch) {
          const dc = colOf[t.id] - colOf[s.id];
          if (dc === 1) {
            d = `M${left(s) + nodeW + 1} ${cy(s)} L${left(t) - 2} ${cy(t)}`;
          } else {
            const yy = cy(s) - nodeH / 2;
            const ctrl = yy - Math.min(26, 10 + 5 * dc);
            d = `M${cx(s) + 8} ${yy} C${cx(s) + 8} ${ctrl} ${cx(t) - 8} ${ctrl} ${cx(t) - 8} ${yy - 2}`;
          }
        } else {
          cls += " cross";
          const sy = cy(s) + nodeH / 2;
          const ty = cy(t) - nodeH / 2 - 2;
          const sx = cx(s) + 10;
          const tx = cx(t) - 10;
          const k = Math.min(60, (ty - sy) * 0.5);
          d = `M${sx} ${sy} C${sx} ${sy + k} ${tx} ${ty - k} ${tx} ${ty}`;
        }
        out.push(`<path class="${cls}" data-s="${pid}" data-t="${t.id}" d="${d}"/>`);
      })
    );

    LESSONS.forEach((l) => {
      const x = left(l);
      const y = cy(l) - nodeH / 2;
      out.push(`<g class="mnode ch-${l.ch}${done.has(l.id) ? " done" : ""}" data-id="${l.id}" tabindex="0" role="button" aria-label="${l.id} ${esc(l.title)}">
        ${l.gate ? `<rect class="gate" x="${x - 4}" y="${y - 4}" width="${nodeW + 8}" height="${nodeH + 8}" rx="7"/>` : ""}
        <rect class="box" x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="4"/>
        <text class="nid" x="${x + nodeW / 2}" y="${y + 15}" text-anchor="middle">${l.id}</text>
        <text class="nt" x="${x + nodeW / 2}" y="${y + 33}" text-anchor="middle">${esc(l.short)}</text>
        ${l.minimal ? `<circle class="min" cx="${x + nodeW - 8}" cy="${y + 8}" r="2.8"/>` : ""}
        <circle class="donec" cx="${x + 8}" cy="${y + 8}" r="3.2" style="display:${done.has(l.id) ? "block" : "none"}"/>
      </g>`);
    });
    svg.innerHTML = out.join("");

    $$(".mnode", svg).forEach((g) => {
      g.addEventListener("click", () => selectNode(g.dataset.id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNode(g.dataset.id);
        }
      });
    });

    $("#mapLegend").innerHTML = `
      ${C.chapters.map((c) => `<span class="ch-${c.id}"><i class="lg-swatch"></i>${esc(c.name)}</span>`).join("")}
      <span><i class="lg-gate"></i>关卡课</span>
      <span><i class="lg-dot"></i>期末最小必学</span>
      <span><i class="lg-line"></i>先修链</span>
      <span><i class="lg-line dash"></i>会解锁</span>`;
    selectNode(selected);
  }

  function selectNode(id, scroll = false) {
    selected = id;
    const anc = ancestors(id);
    const desc = descendants(id);
    $$(".mnode").forEach((g) => {
      const k = g.dataset.id;
      g.classList.toggle("sel", k === id);
      g.classList.toggle("up", anc.has(k));
      g.classList.toggle("down", desc.has(k));
      g.classList.toggle("dim", k !== id && !anc.has(k) && !desc.has(k));
      g.setAttribute("aria-pressed", String(k === id));
    });
    $$(".medge").forEach((p) => {
      const s = p.dataset.s;
      const t = p.dataset.t;
      const up = (t === id || anc.has(t)) && anc.has(s);
      const down = !up && (s === id || desc.has(s)) && desc.has(t);
      p.classList.toggle("up", up);
      p.classList.toggle("down", down);
      p.classList.toggle("dim", !up && !down);
      p.style.markerEnd = up ? "url(#mUp)" : down ? "url(#mDown)" : "url(#mDim)";
      if (up || down) p.parentNode.appendChild(p); // 高亮边置顶
    });
    $$(".mnode").forEach((g) => g.parentNode.appendChild(g)); // 节点始终在边之上
    renderDetail(id, anc, desc);
    if (scroll) $("#map").scrollIntoView({ behavior: "smooth" });
  }

  function renderDetail(id, anc, desc) {
    const l = byId[id];
    const ch = chById[l.ch];
    const direct = new Set(l.pre);
    const chip = (k, isDirect) =>
      `<button class="md-chip ch-${byId[k].ch}${isDirect ? " direct" : ""}" data-go="${k}" type="button">${k} ${esc(byId[k].short)}</button>`;
    const ancHtml = anc.size ? order(anc).map((k) => chip(k, direct.has(k))).join("") : `<span class="md-empty">没有先修课，可以直接开始。</span>`;
    const kids = children[id] || [];
    const descHtml = kids.length
      ? order(kids).map((k) => chip(k, true)).join("") + (desc.size > kids.length ? `<span class="md-empty">间接影响共 ${desc.size} 课</span>` : "")
      : `<span class="md-empty">这是一条支线的终点。</span>`;
    const lab = l.lab ? C.labs.find((x) => x.id === l.lab) : null;
    const el = $("#mapDetail");
    el.className = `map-detail ch-${l.ch}`;
    el.innerHTML = `
      <div class="md-top"><span class="md-id">${l.id}</span><span>${ch.no} ${esc(ch.name)} · ${l.cls} 类${l.gate ? " · 关卡课" : ""}</span></div>
      <h3>${esc(l.title)}</h3>
      <p class="md-core">${l.core}</p>
      <dl class="md-meta">
        <div><dt>难度</dt><dd>${pips(l.diff)}</dd></div>
        <div><dt>考试重要程度（经验）</dt><dd>${pips(l.exam, true)}</dd></div>
        <div><dt>类别</dt><dd>${l.cls} · ${esc(C.classes[l.cls])}</dd></div>
        <div><dt>预计时间</dt><dd>${fmtH(l.hours)} h</dd></div>
      </dl>
      ${l.need && l.need !== "—" ? `<p class="md-need"><b>先修知识：</b>${esc(l.need)}</p>` : ""}
      <div class="md-block"><h4>学它之前要先懂（实线 = 直接先修）</h4><div class="md-chips">${ancHtml}</div></div>
      <div class="md-block"><h4>它会解锁</h4><div class="md-chips">${descHtml}</div></div>
      <div class="md-actions">
        <button class="mini-btn" type="button" data-card="${l.id}">在课时计划中查看</button>
        ${lab ? `<button class="mini-btn solid" type="button" data-lab="${lab.id}">打开实验：${esc(lab.name)}</button>` : ""}
      </div>`;
    renderMath(el);
    $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => selectNode(b.dataset.go)));
    $$("[data-card]", el).forEach((b) => b.addEventListener("click", () => gotoCard(b.dataset.card)));
    $$("[data-lab]", el).forEach((b) => b.addEventListener("click", () => openLab(b.dataset.lab)));
  }

  /* ---------------- route ---------------- */
  const FILTERS = [
    { id: "all", label: "全部", test: () => true, cps: true },
    { id: "minimal", label: "期末最小必学", test: (l) => l.minimal },
    { id: "gate", label: "关卡课", test: (l) => l.gate },
    { id: "A", label: "A 核心必学", test: (l) => l.cls === "A" },
    { id: "B", label: "B 考试常见", test: (l) => l.cls === "B" },
    { id: "C", label: "C 工程拓展", test: (l) => l.cls === "C" },
    { id: "hot", label: "重要程度 ★5", test: (l) => l.exam >= 5 },
    { id: "lab", label: "有配套实验", test: (l) => !!l.lab },
    { id: "todo", label: "未学完", test: (l) => !done.has(l.id), cps: true },
  ];
  let filter = "all";
  let view = "cards";
  const projAfter = {};
  (C.projects || []).forEach((p) => (projAfter[p.after] = p));

  function cardHtml(l) {
    if (l.checkpoint) {
      return `<article class="lesson-card checkpoint ch-${l.ch || "all"}${done.has(l.id) ? " done" : ""}" id="card-${l.id}" data-id="${l.id}">
        <div class="lc-top"><span class="lc-id">${l.id}</span><div class="lc-badges"><span class="badge">${l.final ? "综合" : "章节测试"}</span></div></div>
        <h4>${esc(l.title)}</h4>
        <p class="lc-core">${esc(l.core)}</p>
        <dl class="lc-meta"><div><dt>时长</dt><dd>${fmtH(l.hours)} h</dd></div></dl>
        <div class="lc-foot"><label class="lc-check"><input type="checkbox" ${done.has(l.id) ? "checked" : ""} data-done="${l.id}"/>已完成</label></div>
      </article>`;
    }
    const badges = [
      `<span class="badge cls cls-${l.cls}" title="${esc(C.classes[l.cls])}">${l.cls}</span>`,
      l.gate ? `<span class="badge gate">关卡</span>` : "",
      l.minimal ? `<span class="badge min">必学</span>` : "",
    ].join("");
    const p = projAfter[l.id];
    return `<article class="lesson-card ch-${l.ch}${done.has(l.id) ? " done" : ""}" id="card-${l.id}" data-id="${l.id}">
      <div class="lc-top"><span class="lc-id">${l.id}</span><div class="lc-badges">${badges}</div></div>
      <h4>${esc(l.title)}</h4>
      <p class="lc-core">${l.core}</p>
      ${l.need && l.need !== "—" ? `<p class="lc-need"><b>先修：</b>${esc(l.need)}</p>` : ""}
      <dl class="lc-meta">
        <div><dt>难度</dt><dd>${pips(l.diff)}</dd></div>
        <div><dt>考试（经验）</dt><dd>${pips(l.exam, true)}</dd></div>
        <div><dt>时长</dt><dd>${fmtH(l.hours)} h</dd></div>
      </dl>
      ${p ? `<p class="lc-proj"><b>${p.id} 工程实践（C 类，可选）</b> ${esc(p.title)}</p>` : ""}
      <div class="lc-foot">
        <label class="lc-check"><input type="checkbox" ${done.has(l.id) ? "checked" : ""} data-done="${l.id}"/>已学完</label>
        <button class="lc-link" type="button" data-map="${l.id}">地图</button>
        ${l.lab ? `<button class="lc-link" type="button" data-lab="${l.lab}">实验</button>` : ""}
      </div>
    </article>`;
  }

  function groups() {
    return [...C.chapters.map((c) => ({ id: c.id, name: `${c.no} ${c.name}`, en: c.en })), { id: null, name: "综合", en: "Synthesis" }];
  }

  function renderRoute() {
    $("#routeGroups").innerHTML = groups()
      .map((g) => {
        const items = ALL.filter((l) => l.ch === g.id);
        const hh = sum(items.map((l) => l.hours));
        return `<div class="route-group ch-${g.id || "all"}" data-group="${g.id || "all"}">
          <div class="rg-head"><h3>${esc(g.name)}</h3><em>${esc(g.en)}</em><span>${items.length} 项 · ${fmtH(hh)} h</span></div>
          <div class="lesson-grid">${items.map(cardHtml).join("")}</div>
        </div>`;
      })
      .join("");
    renderMath($("#routeGroups"));
    renderTable();

    const onChange = (e) => {
      const id = e.target.dataset.done;
      if (!id) return;
      if (e.target.checked) done.add(id);
      else done.delete(id);
      $$(`[data-done="${id}"]`).forEach((x) => (x.checked = e.target.checked));
      save();
      $(`#card-${id}`).classList.toggle("done", done.has(id));
      const g = $(`.mnode[data-id="${id}"]`);
      if (g) {
        g.classList.toggle("done", done.has(id));
        $(".donec", g).style.display = done.has(id) ? "block" : "none";
      }
      const tr = $(`tr[data-row="${id}"]`);
      if (tr) tr.classList.toggle("done", done.has(id));
      if (filter === "todo") applyFilter();
      if (e.target.checked) toast(`${id} 已标记为完成`);
    };
    $("#routeGroups").addEventListener("change", onChange);
    $("#routeGroups").addEventListener("click", (e) => {
      const m = e.target.closest("[data-map]");
      if (m) selectNode(m.dataset.map, true);
      const b = e.target.closest("[data-lab]");
      if (b) openLab(b.dataset.lab);
    });

    $("#routeFilters").innerHTML = FILTERS.map(
      (f) => `<button class="chip" type="button" data-f="${f.id}" aria-pressed="${f.id === filter}">${esc(f.label)}<small></small></button>`
    ).join("");
    $$("#routeFilters .chip").forEach((b) =>
      b.addEventListener("click", () => {
        filter = b.dataset.f;
        $$("#routeFilters .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        applyFilter();
      })
    );
    $$("#routeView .seg-btn").forEach((b) =>
      b.addEventListener("click", () => {
        view = b.dataset.v;
        $$("#routeView .seg-btn").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        $("#routeGroups").hidden = view !== "cards";
        $("#routeTable").hidden = view !== "table";
      })
    );
    applyFilter();
  }

  function passes(l) {
    const f = FILTERS.find((x) => x.id === filter);
    if (l.checkpoint) return !!f.cps && f.test(l);
    return f.test(l);
  }

  function applyFilter() {
    ALL.forEach((l) => {
      const ok = passes(l);
      const card = $(`#card-${l.id}`);
      if (card) card.hidden = !ok;
      const tr = $(`tr[data-row="${l.id}"]`);
      if (tr) tr.hidden = !ok;
    });
    $$(".route-group").forEach((g) => (g.hidden = !$$(".lesson-card", g).some((c) => !c.hidden)));
    $$("#routeFilters .chip").forEach((b) => {
      const f = FILTERS.find((x) => x.id === b.dataset.f);
      const n = ALL.filter((l) => (l.checkpoint ? f.cps && f.test(l) : f.test(l))).length;
      $("small", b).textContent = n;
    });
  }

  function renderTable() {
    const rows = [];
    ALL.forEach((l) => {
      const ch = l.ch ? chById[l.ch] : null;
      const chName = ch ? `${ch.no} ${ch.name}` : "综合";
      if (l.checkpoint) {
        rows.push(`<tr class="cp ch-${l.ch || "all"}${done.has(l.id) ? " done" : ""}" data-row="${l.id}"><td>${l.id}</td><td>${esc(chName)}</td><td>${esc(l.title)}：${esc(l.core)}</td><td>本章全部课时</td><td class="num">—</td><td class="num">—</td><td class="num">${fmtH(l.hours)} h</td></tr>`);
      } else {
        const pre = l.pre.length ? l.pre.map((p) => `${p} ${byId[p].short}`).join("、") : "无";
        const need = l.need && l.need !== "—" ? `；${l.need}` : "";
        rows.push(`<tr class="ch-${l.ch}${done.has(l.id) ? " done" : ""}" data-row="${l.id}"><td>${l.id}</td><td>${esc(chName)}</td><td><b>${esc(l.title)}</b><br><span style="color:var(--ink-2)">${l.core}</span></td><td>${esc(pre + need)}</td><td class="num">${pips(l.diff)}</td><td class="num">${pips(l.exam, true)}</td><td class="num">${fmtH(l.hours)} h</td></tr>`);
      }
      const p = projAfter[l.id];
      if (p) rows.push(`<tr class="pj ch-all"><td>${p.id}</td><td>工程实践（C 类，可选）</td><td><b>${esc(p.title)}</b> — ${esc(p.what)}</td><td>学完 ${p.after}</td><td class="num">—</td><td class="num">—</td><td class="num">${esc(p.tool)}</td></tr>`);
    });
    $("#routeTable").innerHTML = `<div class="route-table-wrap"><table class="plan-table">
      <thead><tr><th>课时</th><th>章节</th><th>知识点</th><th>先修知识</th><th>难度</th><th>考试重要程度</th><th>预计时间</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
      <tfoot><tr><td colspan="6">合计（不含工程实践）</td><td class="num">${fmtH(TOTAL)} h</td></tr></tfoot>
    </table></div>`;
    renderMath($("#routeTable"));
  }

  function renderProgress() {
    const n = LESSONS.filter((l) => done.has(l.id)).length;
    const hDone = sum(ALL.filter((l) => done.has(l.id)).map((l) => l.hours));
    const pct = Math.round((n / LESSONS.length) * 100);
    $("#routeProgress").innerHTML = `<span>${n} / ${LESSONS.length} 课</span><span class="rp-bar"><i style="width:${pct}%"></i></span><span>${fmtH(hDone)} / ${fmtH(TOTAL)} h</span>`;
    $("#navProgress").innerHTML = `<span>${n}/${LESSONS.length}</span><span class="np-bar"><i style="width:${pct}%"></i></span>`;
    renderTimeBars();
  }

  function gotoCard(id) {
    if (view !== "cards") $('#routeView .seg-btn[data-v="cards"]').click();
    if (!passes(byId[id])) $('#routeFilters .chip[data-f="all"]').click();
    const c = $(`#card-${id}`);
    c.scrollIntoView({ behavior: "smooth", block: "center" });
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }

  function openLab(id) {
    if (window.Labs) window.Labs.show(id);
    $("#lab").scrollIntoView({ behavior: "smooth" });
  }

  /* ---------------- tree ---------------- */
  let treeFilter = "all";
  function renderTree() {
    if (!T.tree) return;
    $("#treeGrid").innerHTML = T.tree
      .map((t, i) => {
        const ch = chById[t.ch];
        return `<article class="tree-card ch-${t.ch} reveal" style="--d:${(i % 3) * 0.06}s">
          <h3><small>${ch.no}</small>${esc(ch.name)}</h3>
          <p class="tree-sum">${t.summary || ""}</p>
          ${(t.modules || [])
            .map(
              (m) => `<div class="tree-mod"><h4>${esc(m.name)}</h4><div class="tree-items">${(m.items || [])
                .map((it) => `<span class="ti cls-${it.cls}" data-cls="${it.cls}"><i>${it.cls}</i>${it.t}</span>`)
                .join("")}</div></div>`
            )
            .join("")}
          ${t.feeds && t.feeds.length ? `<ul class="tree-feeds">${t.feeds.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
        </article>`;
      })
      .join("");
    const opts = [
      ["all", "全部"],
      ["A", "A 教材核心必学"],
      ["B", "B 考试常见"],
      ["C", "C 工程拓展"],
    ];
    $("#treeFilters").innerHTML = opts.map(([v, t]) => `<button class="chip" type="button" data-t="${v}" aria-pressed="${v === treeFilter}">${t}</button>`).join("");
    $$("#treeFilters .chip").forEach((b) =>
      b.addEventListener("click", () => {
        treeFilter = b.dataset.t;
        $$("#treeFilters .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        $$(".ti").forEach((s) => s.classList.toggle("off", treeFilter !== "all" && s.dataset.cls !== treeFilter));
      })
    );
    if (T.links && T.links.length) {
      $("#treeLinks").innerHTML = `<h3>模块之间的关键联系</h3>${T.links
        .map((k) => {
          const a = chById[k.from];
          const b = chById[k.to];
          if (!a || !b) return "";
          return `<div class="link-row"><span class="lk ch-${k.from}">${a.no} ${esc(a.name)}</span><span class="ar">→</span><span class="lk ch-${k.to}">${b.no} ${esc(b.name)}</span><span class="why">${k.why}</span></div>`;
        })
        .join("")}`;
    }
    renderMath($("#tree"));
  }

  /* ---------------- points ---------------- */
  const lessonTags = (ids) => lessonRange(ids).join(" · ");
  function renderPoints() {
    if (T.core15) {
      $("#coreList").innerHTML =
        `<li>最重要的 15 个知识点</li>` +
        T.core15
          .map(
            (c) => `<li class="core-item"><b>${c.t}<span class="ci-l">${lessonTags(c.lessons)}</span></b><p>${c.why || ""}</p>${c.how ? `<p class="ci-how">考法：${c.how}</p>` : ""}</li>`
          )
          .join("");
    }
    if (T.pitfalls15) {
      $("#flipGrid").innerHTML =
        `<div class="flip-head">最容易出错的 15 个知识点 · 点击翻面</div>` +
        T.pitfalls15
          .map(
            (p, i) => `<button class="flip" type="button" aria-pressed="false"><div class="flip-in">
              <div class="flip-f"><span class="flip-k">易错 ${String(i + 1).padStart(2, "0")} · 错误想法</span><q>${p.wrong}</q><small>${lessonTags(p.lessons)} · 先自己说出错在哪</small></div>
              <div class="flip-b"><span class="flip-k">正确理解</span><p>${p.right}</p>${p.why ? `<p class="why">为什么错：${p.why}</p>` : ""}${p.check ? `<p class="chk">自检：${p.check}</p>` : ""}</div>
            </div></button>`
          )
          .join("");
      $$(".flip").forEach((f) => f.addEventListener("click", () => f.setAttribute("aria-pressed", String(f.getAttribute("aria-pressed") !== "true"))));
      // 让翻卡高度适应背面内容
      requestAnimationFrame(fitFlips);
    }
    renderMath($("#points"));
  }
  function fitFlips() {
    $$(".flip").forEach((f) => {
      const fr = $(".flip-f", f);
      const bk = $(".flip-b", f);
      [fr, bk].forEach((x) => (x.style.position = "relative"));
      const hgt = Math.max(fr.scrollHeight, bk.scrollHeight, 196);
      [fr, bk].forEach((x) => (x.style.position = ""));
      $(".flip-in", f).style.minHeight = hgt + "px";
      f.style.minHeight = hgt + "px";
    });
  }

  /* ---------------- exam ---------------- */
  function renderExam() {
    if (!T.examTypes) return;
    $("#examList").innerHTML = T.examTypes
      .map(
        (e, i) => `<details class="exam-item reveal" style="--d:${Math.min(i * 0.03, 0.3)}s"${i === 0 ? " open" : ""}>
          <summary><span class="en">${String(i + 1).padStart(2, "0")}</span><span><b>${e.type}</b></span><span class="ew">${e.weight || ""}</span></summary>
          <div class="exam-body">
            ${e.form ? `<p class="exam-form">${e.form}</p>` : ""}
            <div><h4>标准作答步骤（按评分点）</h4><ol class="exam-steps">${(e.steps || []).map((s) => `<li>${s}</li>`).join("")}</ol></div>
            <div class="exam-side">
              <h4>学习策略</h4><p>${e.strategy || ""}</p>
              ${e.lose ? `<h4>常见丢分点</h4><p class="lose">${e.lose}</p>` : ""}
              <h4>对应课时</h4><div class="exam-ls">${lessonRange(e.lessons)
                .map((k) => `<button class="md-chip direct ch-${byId[k].ch}" type="button" data-go="${k}">${k} ${esc(byId[k].short)}</button>`)
                .join("")}</div>
            </div>
          </div>
        </details>`
      )
      .join("");
    $$("#examList [data-go]").forEach((b) => b.addEventListener("click", () => selectNode(b.dataset.go, true)));
    renderMath($("#examList"));
  }

  /* ---------------- growth ---------------- */
  function renderGrowth() {
    if (T.growth) {
      $("#growthPath").innerHTML = T.growth
        .map(
          (g, i) => `<div class="g-step reveal" style="--d:${i * 0.07}s"><span class="g-lv">${esc(g.level)}</span>
            <h3>${g.title}</h3>
            <ul>${(g.can || []).map((c) => `<li>${c}</li>`).join("")}</ul>
            ${g.proof ? `<p class="g-proof"><b>达标验证：</b>${g.proof}</p>` : ""}
            <p class="g-meta">${esc(g.lessons || "")}${g.tools ? `<br>${esc(g.tools)}` : ""}</p>
          </div>`
        )
        .join("");
      renderMath($("#growthPath"));
    }
    $("#projects").innerHTML = (C.projects || [])
      .map((p) => `<div class="proj"><span class="proj-k">${p.id} · 学完 ${p.after} 后 · C 类</span><h4>${esc(p.title)}</h4><p>${esc(p.what)}</p><small>${esc(p.tool)} · 设计 → 仿真 → 验证</small></div>`)
      .join("");
  }

  /* ---------------- time ---------------- */
  function renderTimeBars() {
    const rows = groups().map((g) => {
      const items = ALL.filter((l) => l.ch === g.id);
      const les = items.filter((l) => !l.checkpoint);
      const cps = items.filter((l) => l.checkpoint);
      const dn = sum(items.filter((l) => done.has(l.id)).map((l) => l.hours));
      const lh = sum(les.map((l) => l.hours));
      const ch = sum(cps.map((l) => l.hours));
      return { g, dn, lh, ch, tot: lh + ch };
    });
    const max = Math.max(...rows.map((r) => r.tot));
    const pct = (v) => `${((v / max) * 100).toFixed(2)}%`;
    $("#timeBars").innerHTML = `<h3>各模块学时（课时 + 章测）</h3>${rows
      .map((r) => {
        const remainL = Math.max(0, r.lh - Math.min(r.dn, r.lh));
        const dnL = r.tot - remainL - r.ch;
        return `<div class="tb-row ch-${r.g.id || "all"}"><span class="tb-name">${esc(r.g.name)}</span><span class="tb-bar"><i class="dn" style="width:${pct(Math.max(0, dnL))}"></i><i style="width:${pct(remainL)}"></i><i class="cp" style="width:${pct(r.ch)}"></i></span><span class="tb-h">${fmtH(r.tot)} h</span></div>`;
      })
      .join("")}
      <div class="tb-total"><span>合计（不含工程实践）</span><span>${fmtH(TOTAL)} h ⚠️待验证</span></div>
      <div class="tb-key"><span><i></i>课时</span><span><i class="cp"></i>章测 / 综合</span><span><i class="dn"></i>已完成</span></div>`;
  }

  function renderPlan() {
    const P = T.plan;
    if (!P) return;
    $("#plan").innerHTML = `
      ${P.tracks ? `<div class="tracks">${P.tracks.map((t) => `<div class="track"><b>${esc(t.name)}</b><span class="th">≈${t.hours} h</span><p>${t.desc}</p></div>`).join("")}</div>` : ""}
      ${P.phases ? `<div class="phases">${P.phases.map((p) => `<div class="phase"><span class="pw">${esc(p.weeks)}</span><div><b>${esc(p.name)}</b><span class="pl">${esc(p.lessons)}</span><div class="pg">${p.goal || ""}</div></div><span class="ph">${p.hours} h</span></div>`).join("")}</div>` : ""}
      ${P.weekly ? `<ul class="weekly">${P.weekly.map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
      ${P.note ? `<p class="plan-note">${P.note}</p>` : ""}`;
    renderMath($("#plan"));
  }

  /* ---------------- diagnostic ---------------- */
  let ans = load(DSTORE, {});
  function renderDiag() {
    const D = T.diagnostic;
    if (!D) {
      $("#diagBox").innerHTML = `<div class="diag-top"><p>诊断测试正在生成。</p></div>`;
      return;
    }
    const items = D.sections.flatMap((s) => s.items);
    const answered = () => items.filter((q) => (ans[q.no] || "").toString().trim()).length;
    const qHtml = (q) => {
      let a = "";
      const v = ans[q.no] || "";
      if (q.kind === "choice") {
        a = `<div class="dq-opts" role="radiogroup">${(q.options || [])
          .map((o, i) => {
            const key = (o.match(/^\s*([A-Z])[.．、]/) || [])[1] || String.fromCharCode(65 + i);
            return `<label><input type="radio" name="dq${q.no}" value="${key}" ${v === key ? "checked" : ""}/><span>${o}</span></label>`;
          })
          .join("")}</div>`;
      } else if (q.kind === "fill") {
        a = `<input class="ctl-input" type="text" data-q="${q.no}" placeholder="填写你的答案" value="${esc(v)}"/>`;
      } else {
        a = `<textarea class="ctl-input" data-q="${q.no}" placeholder="写出你的思路，不会就写“不会”或你卡在哪里">${esc(v)}</textarea>`;
      }
      return `<div class="dq" id="dq-${q.no}"><span class="dq-no">${String(q.no).padStart(2, "0")}</span><div class="dq-q">${q.q}</div><div class="dq-ans">${a}</div><span class="dq-checks">${esc(q.checks || "")}${q.lesson ? ` · ${q.lesson}` : ""}</span></div>`;
    };
    $("#diagBox").innerHTML = `
      <div class="diag-top"><p>${D.intro || ""}</p><div class="diag-meta"><span>${items.length} 题</span><span>建议用时 ${esc(D.time || "")}</span><span id="diagCount"></span></div></div>
      ${D.sections.map((s) => `<div class="diag-sec"><h3>${esc(s.name)}</h3>${s.items.map(qHtml).join("")}</div>`).join("")}
      <div class="diag-foot"><span class="grow">作答只保存在本机浏览器。不会的题请直接写“不会”，这比猜更有诊断价值。</span>
        <button class="ctl-btn" type="button" id="diagClear">清空作答</button>
        <button class="ctl-btn primary" type="button" id="diagCopy">复制我的作答</button></div>`;
    const count = () => ($("#diagCount").textContent = `已答 ${answered()} / ${items.length}`);
    count();
    const store = () => {
      try {
        localStorage.setItem(DSTORE, JSON.stringify(ans));
      } catch (e) {}
      count();
    };
    $("#diagBox").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.q) ans[t.dataset.q] = t.value;
      else if (t.type === "radio") ans[t.name.slice(2)] = t.value;
      else return;
      store();
    });
    $("#diagCopy").addEventListener("click", async () => {
      const lines = [`数电基础诊断测试作答（${new Date().toLocaleDateString("zh-CN")}）`];
      D.sections.forEach((s) => {
        lines.push(`\n【${s.name}】`);
        s.items.forEach((q) => lines.push(`${q.no}. ${(ans[q.no] || "（未作答）").toString().trim()}`));
      });
      const text = lines.join("\n");
      try {
        await navigator.clipboard.writeText(text);
        toast("已复制，粘贴到对话里即可批改");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("已复制");
      }
    });
    $("#diagClear").addEventListener("click", () => {
      if (!confirm("清空全部诊断作答？")) return;
      ans = {};
      store();
      renderDiag();
    });
    renderMath($("#diagBox"));
  }

  /* ---------------- misc ---------------- */
  function renderRules() {
    const rules = [
      "一次只讲一个主要知识点",
      "讲完立刻做理解检查",
      "练习答案不提前公布",
      "批改：错在哪一步 / 为什么 / 正确方法 / 如何避免",
      "答错先分析原因，再换一种讲法",
      "重要公式必须说明适用条件",
      "电路分析必须逻辑正确，能验证",
      "你确认后才进入下一课",
    ];
    $("#rules").innerHTML = rules.map((r, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span>${r}</li>`).join("");
  }

  function renderFooter() {
    $("#evidenceList").innerHTML = [
      `教材：${esc(C.meta.textbook)}。尚未拿到你们学校的教材版本、老师 PPT 或历年试卷。`,
      "「考试重要程度」星级与题型占比 = 一般本科《数字电子技术基础》课程经验判断，<b>不是</b>你学校的真实考点统计。",
      "上传 PPT / 教材 / 历年试卷后，会重新分析考试范围并调整课时优先级。",
      "学习时间为估计值 ⚠️待验证，学完 L1–L2 后按实际速度校准。",
      "A 类 = 教材核心必学；B 类 = 考试常见；C 类 = 工程拓展（核心内容掌握后再做）。",
    ]
      .map((s) => `<li>${s}</li>`)
      .join("");
    $("#footerMeta").textContent = `更新于 ${C.meta.updated} · ${LESSONS.length} 课时 · ${fmtH(TOTAL)} h`;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:") $("#localFiles").hidden = false;
  }

  function reveal() {
    const els = $$(".reveal");
    if (!document.documentElement.classList.contains("js") || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (en) =>
        en.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((e) => io.observe(e));
  }

  function init() {
    renderHeroStats();
    renderThread();
    renderMap();
    renderRoute();
    renderTree();
    renderPoints();
    renderExam();
    renderGrowth();
    renderPlan();
    renderDiag();
    renderRules();
    renderFooter();
    renderProgress();
    if (window.Labs) {
      window.Labs.init({ tabs: $("#labTabs"), stage: $("#labStage"), labs: C.labs });
      window.Labs.hero($("#heroCanvas"));
    }
    reveal();
    window.addEventListener("resize", () => {
      clearTimeout(init._r);
      init._r = setTimeout(fitFlips, 150);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitFlips);
  }

  if (window.renderMathInElement) init();
  else window.addEventListener("load", init);
})();
