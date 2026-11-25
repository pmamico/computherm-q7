// Grafikus napszerkesztő: vízszintesen az idő (0–24 h), függőlegesen a hőfok.
//  - vízszintes húzás: a húzott idősáv a mutató magasságának megfelelő hőfokot kapja
//  - függőleges húzás egy sávon: a sáv hőfoka változik
//  - koppintás egy sávra: kijelölés; a kijelölt sáv széleit húzva szűkíthető/tágítható,
//    alatta finomhangolás gombokkal (10 perc, 0,5 °C)
import { SLOT_COUNT, runsOf, fmtTime, fmtTemp } from './planner.js';

const H = 200, M = { l: 30, r: 6, t: 10, b: 22 };

/** hideg: kék, langyos: szürkés, meleg: narancs (RGB-keverés, hogy ne menjen át zöldbe) */
export function tempColor(t) {
  const x = Math.min(1, Math.max(0, (t - 16) / 7));
  const mix = (a, b) => Math.round(a + (b - a) * x);
  return `rgb(${mix(116, 255)}, ${mix(192, 146)}, ${mix(252, 43)})`;
}

const hhmm = (slot) => fmtTime(slot * 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function mountDayEditor(root, { cells, variant, onChange }) {
  let cur = cells.slice();
  let sel = null;          // kiválasztott sáv: { a, b }
  let drag = null;
  let W = 320;
  let range = calcRange();

  root.classList.add('dayed');
  root.innerHTML = `
    <div class="dayed-graph"><svg height="${H}"></svg><div class="dayed-tip" hidden></div></div>
    <div class="dayed-runs"></div>
    <div class="dayed-fine" hidden></div>`;
  const graph = root.querySelector('.dayed-graph');
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.dayed-tip');
  const runsBox = root.querySelector('.dayed-runs');
  const fine = root.querySelector('.dayed-fine');

  function calcRange() {
    const lo = Math.max(variant.minTemp - 1, Math.min(14, Math.floor(Math.min(...cur)) - 1));
    const hi = Math.min(variant.maxTemp, Math.max(25, Math.ceil(Math.max(...cur))));
    return [lo, hi];
  }
  const plotW = () => W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const xOf = (slot) => M.l + (slot / SLOT_COUNT) * plotW();
  const yOf = (t) => M.t + ((range[1] - t) / (range[1] - range[0])) * plotH;
  // telefonon (keskeny sáv) félórás, asztalon 10 perces rácsra illeszt
  const snap = () => (plotW() / SLOT_COUNT < 3 ? 3 : 1);
  const slotAt = (px) => clamp(Math.round(((px - M.l) / plotW()) * SLOT_COUNT / snap()) * snap(), 0, SLOT_COUNT);
  const cellAt = (px) => clamp(Math.floor(((px - M.l) / plotW()) * SLOT_COUNT), 0, SLOT_COUNT - 1);
  const tempAt = (py) => {
    const t = range[1] - ((py - M.t) / plotH) * (range[1] - range[0]);
    return clamp(Math.round(t * 2) / 2, Math.max(range[0] + 0.5, variant.minTemp), Math.min(range[1], variant.maxTemp));
  };
  const runAt = (cellsArr, i) => runsOf(cellsArr).find((r) => i >= r.a && i < r.b);

  function draw() {
    const [lo, hi] = range;
    let g = '';
    const tStep = hi - lo > 14 ? 4 : 2;
    for (let t = Math.ceil(lo); t <= hi; t++) {
      const y = yOf(t);
      g += `<line class="grid ${t % tStep ? 'minor' : ''}" x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}"/>`;
      if (t % tStep === 0) g += `<text class="ylab" x="${M.l - 4}" y="${y + 4}">${t}°</text>`;
    }
    for (let h = 0; h <= 24; h++) {
      const x = xOf(h * 6);
      g += `<line class="grid ${h % 3 ? 'minor' : ''}" x1="${x}" x2="${x}" y1="${M.t}" y2="${H - M.b}"/>`;
      if (h % 3 === 0 && (W > 420 || h % 6 === 0)) g += `<text class="xlab" x="${x}" y="${H - 6}">${h}</text>`;
    }
    for (const r of runsOf(cur)) {
      const x = xOf(r.a), w = xOf(r.b) - x, y = yOf(r.temp);
      const isSel = sel && r.a === sel.a && r.b === sel.b;
      g += `<rect class="blk ${isSel ? 'sel' : ''}" x="${x}" y="${y}" width="${w}" height="${H - M.b - y}" fill="${tempColor(r.temp)}"/>`;
      g += `<line class="bartop" x1="${x}" x2="${x + w}" y1="${y}" y2="${y}"/>`;
      if (w > 30) g += `<text class="barlab" x="${x + w / 2}" y="${y + 14}">${fmtTemp(r.temp)}</text>`;
    }
    if (drag?.mode === 'paint') {
      g += `<rect class="paint" x="${xOf(drag.a)}" y="${M.t}" width="${xOf(drag.b) - xOf(drag.a)}" height="${plotH}"/>`;
    }
    // kijelölt sáv: húzható fogantyúk a két szélén
    const hs = drag?.mode?.startsWith('edge') ? { a: drag.a, b: drag.b } : drag?.mode ? null : sel;
    if (hs) {
      const t = cur[hs.a], yMid = (yOf(t) + H - M.b) / 2;
      for (const [edge, slot] of [['a', hs.a], ['b', hs.b]]) {
        if ((edge === 'a' && slot === 0) || (edge === 'b' && slot === SLOT_COUNT)) continue;
        const x = xOf(slot);
        g += `<line class="edge" x1="${x}" x2="${x}" y1="${M.t}" y2="${H - M.b}"/>`;
        g += `<rect class="grip" x="${x - 6}" y="${yMid - 16}" width="12" height="32" rx="4"/>`;
        g += `<line class="griplines" x1="${x - 2}" x2="${x - 2}" y1="${yMid - 8}" y2="${yMid + 8}"/><line class="griplines" x1="${x + 2}" x2="${x + 2}" y1="${yMid - 8}" y2="${yMid + 8}"/>`;
      }
    }
    svg.innerHTML = g;
  }

  function showTip(px, text) {
    tip.hidden = false;
    tip.textContent = text;
    const w = tip.offsetWidth;
    tip.style.left = `${clamp(px - w / 2, 0, W - w)}px`;
  }

  function renderRuns() {
    runsBox.innerHTML = runsOf(cur).map((r) => {
      const isSel = sel && r.a === sel.a && r.b === sel.b;
      return `<button type="button" class="runchip ${isSel ? 'on' : ''}" data-a="${r.a}" style="--c:${tempColor(r.temp)}">
        ${hhmm(r.a)}–${hhmm(r.b)} <b>${fmtTemp(r.temp)}°</b></button>`;
    }).join('');
    renderFine();
  }

  function renderFine() {
    const runs = runsOf(cur);
    const i = sel ? runs.findIndex((r) => r.a === sel.a && r.b === sel.b) : -1;
    if (i < 0) { sel = null; fine.hidden = true; return; }
    const r = runs[i];
    fine.hidden = false;
    fine.innerHTML = `
      <div class="step-row"><span>Kezdete</span><button type="button" data-f="a-" ${r.a === 0 ? 'disabled' : ''}>−</button><b>${hhmm(r.a)}</b><button type="button" data-f="a+" ${r.a === 0 || r.b - r.a <= 1 ? 'disabled' : ''}>+</button></div>
      <div class="step-row"><span>Vége</span><button type="button" data-f="b-" ${r.b === SLOT_COUNT || r.b - r.a <= 1 ? 'disabled' : ''}>−</button><b>${hhmm(r.b)}</b><button type="button" data-f="b+" ${r.b === SLOT_COUNT ? 'disabled' : ''}>+</button></div>
      <div class="step-row"><span>Hőfok</span><button type="button" data-f="t-" ${r.temp <= variant.minTemp ? 'disabled' : ''}>−</button><b>${fmtTemp(r.temp)} °C</b><button type="button" data-f="t+" ${r.temp >= variant.maxTemp ? 'disabled' : ''}>+</button></div>
      <div class="step-row end">${runs.length > 1 ? '<button type="button" class="link danger" data-f="del">sáv törlése</button>' : ''}<button type="button" class="link" data-f="close">kész</button></div>`;
  }

  /** Egy finomhangoló gomb hatása a kiválasztott sávra. */
  function nudge(f) {
    const runs = runsOf(cur);
    const i = runs.findIndex((r) => r.a === sel?.a && r.b === sel?.b);
    if (i < 0) return;
    const r = runs[i], prev = runs[i - 1], next = runs[i + 1];
    const c = cur.slice();
    let { a, b } = r;
    if (f === 'a-' && a > 0) { a--; c[a] = r.temp; }
    if (f === 'a+' && prev && b - a > 1) { c[a] = prev.temp; a++; }
    if (f === 'b+' && b < SLOT_COUNT) { c[b] = r.temp; b++; }
    if (f === 'b-' && next && b - a > 1) { b--; c[b] = next.temp; }
    if (f === 't+' || f === 't-') {
      const t = clamp(r.temp + (f === 't+' ? 0.5 : -0.5), variant.minTemp, variant.maxTemp);
      for (let k = a; k < b; k++) c[k] = t;
    }
    if (f === 'del') {
      const t = (prev || next).temp;
      for (let k = a; k < b; k++) c[k] = t;
      sel = null;
    }
    cur = c;
    if (sel) {
      const nr = runAt(cur, f === 'a+' ? b - 1 : a);
      sel = nr ? { a: nr.a, b: nr.b } : null;
    }
    commit();
  }

  function commit() {
    range = calcRange();
    draw();
    renderRuns();
    onChange(cur.slice());
  }

  // ---- húzás ----
  const pt = (e) => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* szintetikus esemény */ }
    const p = pt(e);
    drag = { x0: p.x, y0: p.y, orig: cur.slice(), mode: edgeAt(p.x, e.pointerType) };
    if (drag.mode) { drag.s = { ...sel }; drag.a = sel.a; drag.b = sel.b; }
  });
  /** A kijelölt sáv melyik szélén van a mutató? ('edge-a' | 'edge-b' | null) */
  function edgeAt(px, type) {
    if (!sel) return null;
    const tol = type === 'touch' ? 22 : 10;
    const da = sel.a > 0 ? Math.abs(px - xOf(sel.a)) : Infinity;
    const db = sel.b < SLOT_COUNT ? Math.abs(px - xOf(sel.b)) : Infinity;
    if (Math.min(da, db) > tol) return null;
    return da <= db ? 'edge-a' : 'edge-b';
  }
  // egérmutató: szélén ↔, kijelölt sávon ↕, máshol célkereszt
  svg.addEventListener('pointermove', (e) => {
    if (drag || e.pointerType !== 'mouse') return;
    const p = pt(e);
    const onSel = sel && cellAt(p.x) >= sel.a && cellAt(p.x) < sel.b;
    svg.style.cursor = edgeAt(p.x, 'mouse') ? 'ew-resize' : onSel ? 'ns-resize' : 'crosshair';
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e);
    const dx = p.x - drag.x0, dy = p.y - drag.y0;
    if (!drag.mode && Math.hypot(dx, dy) > 6) drag.mode = Math.abs(dy) > Math.abs(dx) ? 'lift' : 'paint';
    if (!drag.mode) return;
    cur = drag.orig.slice();
    if (drag.mode.startsWith('edge')) {
      const s = drag.s, o = drag.orig, temp = o[s.a];
      if (drag.mode === 'edge-a') {
        const na = Math.min(slotAt(xOf(s.a) + p.x - drag.x0), s.b - 1);   // a megfogás helyéhez képest mozdul
        if (na < s.a) for (let k = na; k < s.a; k++) cur[k] = temp;
        else for (let k = s.a; k < na; k++) cur[k] = o[s.a - 1];
        drag.a = na; drag.b = s.b;
      } else {
        const nb = Math.max(slotAt(xOf(s.b) + p.x - drag.x0), s.a + 1);
        if (nb > s.b) for (let k = s.b; k < nb; k++) cur[k] = temp;
        else for (let k = nb; k < s.b; k++) cur[k] = o[s.b];
        drag.a = s.a; drag.b = nb;
      }
      showTip(xOf(drag.mode === 'edge-a' ? drag.a : drag.b), `${hhmm(drag.a)}–${hhmm(drag.b)} · ${fmtTemp(temp)} °C`);
      draw();
      return;
    }
    const t = tempAt(p.y);
    if (drag.mode === 'lift') {
      const r = runAt(drag.orig, cellAt(drag.x0));
      for (let k = r.a; k < r.b; k++) cur[k] = t;
      drag.a = r.a; drag.b = r.b;
      showTip(xOf((r.a + r.b) / 2), `${hhmm(r.a)}–${hhmm(r.b)} · ${fmtTemp(t)} °C`);
    } else {
      let a = slotAt(Math.min(drag.x0, p.x)), b = slotAt(Math.max(drag.x0, p.x));
      if (b === a) b = Math.min(SLOT_COUNT, a + snap());
      for (let k = a; k < b; k++) cur[k] = t;
      drag.a = a; drag.b = b;
      showTip(p.x, `${hhmm(a)}–${hhmm(b)} · ${fmtTemp(t)} °C`);
    }
    draw();
  });
  const end = (e, cancel) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    tip.hidden = true;
    if (cancel) { cur = d.orig; draw(); return; }
    if (!d.mode) {
      // koppintás: sáv kiválasztása finomhangoláshoz
      const r = runAt(cur, cellAt(d.x0));
      sel = sel && r && sel.a === r.a && sel.b === r.b ? null : r && { a: r.a, b: r.b };
      draw();
      renderRuns();
      return;
    }
    const r = runAt(cur, d.a);
    sel = r ? { a: r.a, b: r.b } : null;
    commit();
  };
  svg.addEventListener('pointerup', (e) => end(e, false));
  svg.addEventListener('pointercancel', (e) => end(e, true));

  runsBox.addEventListener('click', (e) => {
    const b = e.target.closest('.runchip');
    if (!b) return;
    const r = runAt(cur, Number(b.dataset.a));
    sel = sel && sel.a === r.a ? null : { a: r.a, b: r.b };
    draw();
    renderRuns();
  });

  // finomhangoló gombok: nyomva tartva ismétel
  let rep = null;
  const stopRep = () => { clearTimeout(rep); clearInterval(rep); rep = null; };
  fine.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b || b.disabled) return;
    const f = b.dataset.f;
    if (f === 'close') { sel = null; draw(); renderRuns(); return; }
    e.preventDefault();
    nudge(f);
    if (f !== 'del') rep = setTimeout(() => { rep = setInterval(() => nudge(f), 90); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => fine.addEventListener(ev, stopRep));
  document.addEventListener('pointerup', stopRep);

  new ResizeObserver(() => {
    const w = graph.clientWidth;
    if (w && w !== W) { W = w; svg.setAttribute('width', W); draw(); }
  }).observe(graph);

  W = graph.clientWidth || W;
  svg.setAttribute('width', W);
  draw();
  renderRuns();
}
