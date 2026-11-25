import { DAYS, DAY_HU, DAY_SHORT, PRESETS, VARIANTS, dayCells, cellsToProfile, DEFAULT_VARIANT, variantOf, dayLabel, progLabel, compile, buildPlan, fmtTime, fmtTemp, parseTime } from './planner.js';
import { thermostatSvg, showStep, keyLabel } from './thermostat.js';
import { mountDayEditor, tempColor } from './dayeditor.js';
import { VERSION } from './version.js';

const $ = (s) => document.querySelector(s);
const STORE = 'q7-state-v1';

let state = load() || structuredClone(PRESETS.hetkoznap.state);
if (!VARIANTS[state.variant]) state.variant = DEFAULT_VARIANT;
let plan = null, stepIdx = 0, liveTimer = null;

function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<kbd>$1</kbd>');


// ---- nézetek ------------------------------------------------------------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name !== 'guide') clearInterval(liveTimer);
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  if (t.dataset.view === 'guide') return startGuide();
  showView(t.dataset.view);
}));

// ---- szerkesztő -----------------------------------------------------------
function renderProfiles() {
  const box = $('#profiles');
  box.innerHTML = '';
  const v = variantOf(state);
  state.profiles.forEach((p, pi) => {
    const card = document.createElement('div');
    card.className = 'profile';
    card.innerHTML = `
      <div class="row spread">
        <div class="days">${DAYS.map((d) => `<button class="day ${p.days.includes(d) ? 'on' : ''}" data-day="${d}" title="${DAY_HU[d]}">${DAY_SHORT[d]}</button>`).join('')}</div>
        <div class="day-quick"><button class="link" data-act="wd">hétköznap</button><button class="link" data-act="we">hétvége</button><button class="link" data-act="all">mind</button>
        ${state.profiles.length > 1 ? '<button class="link danger" data-act="del">törlés</button>' : ''}</div>
      </div>
      <div class="ed"></div>`;
    card.querySelector('.row').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.day) return setDays(pi, [b.dataset.day], !p.days.includes(b.dataset.day));
      const act = b.dataset.act;
      if (act === 'wd') setDays(pi, DAYS.slice(0, 5), true);
      if (act === 'we') setDays(pi, DAYS.slice(5), true);
      if (act === 'all') setDays(pi, DAYS, true);
      if (act === 'del') { state.profiles.splice(pi, 1); changed(true); }
    });
    box.appendChild(card);
    mountDayEditor(card.querySelector('.ed'), {
      cells: dayCells(p, [], v), variant: v,
      onChange: (cells) => { Object.assign(p, cellsToProfile(cells)); changed(false); },
    });
  });
}

function setDays(pi, days, on) {
  for (const d of days) {
    state.profiles.forEach((p, i) => {
      p.days = p.days.filter((x) => x !== d);
      if (on && i === pi) p.days.push(d);
    });
  }
  state.profiles.forEach((p) => p.days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)));
  changed(true);
}

// visszavonás / újra: állapot-pillanatképek
const undo = [], redo = [];
let lastState = null;
function syncUndoButtons() {
  $('#undo').disabled = !undo.length;
  $('#redo').disabled = !redo.length;
}
function changed(rerender) {
  if (lastState !== null) undo.push(lastState);
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  lastState = JSON.stringify(state);
  syncUndoButtons();
  save();
  if (rerender) renderProfiles();
  renderWeek();
}

function renderWeek() {
  document.querySelectorAll('input[name=mode]').forEach((r) => { r.checked = r.value === (state.mode || 'heat'); });
  const c = compile(state);
  const hours = Array.from({ length: 9 }, (_, i) => `<span style="left:${(i * 3) / 24 * 100}%">${i * 3}</span>`).join('');
  $('#week').innerHTML = `<div class="week-row axis"><span></span><div class="bar">${hours}</div><span></span></div>` + DAYS.map((d) => {
    const sw = c.days[d];
    if (!sw) return `<div class="week-row"><span>${DAY_SHORT[d]}</span><div class="bar empty">nincs megadva – nem nyúlok hozzá</div><span></span></div>`;
    const segs = sw.map((s, i) => {
      const end = i + 1 < sw.length ? sw[i + 1].time : 1440;
      const w = (end - s.time) / 1440 * 100;
      return `<div class="seg" style="width:${w}%;background:${tempColor(s.temp)}" title="${fmtTime(s.time)}–${fmtTime(end % 1440)}: ${fmtTemp(s.temp)} °C">${w > 9 ? fmtTemp(s.temp) : ''}</div>`;
    }).join('');
    const n = sw.length - 1;
    return `<div class="week-row"><span>${DAY_SHORT[d]}</span><div class="bar">${segs}</div><span class="badge ${n > 6 ? 'bad' : ''}">${n}/6</span></div>`;
  }).join('');
  $('#issues').innerHTML = c.issues.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join('');
  $('#go-guide').disabled = !c.ok;
}

document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { state.mode = r.value; $('#opt-mode').checked = r.value === 'cool'; changed(false); }));
$('#add-profile').addEventListener('click', () => {
  const used = new Set(state.profiles.flatMap((p) => p.days));
  const free = DAYS.filter((d) => !used.has(d));
  state.profiles.push({ days: free, base_temp: 19, periods: [{ from: '07:00', to: '22:00', temp: 21.5 }] });
  changed(true);
});
for (const [k, p] of Object.entries(PRESETS)) $('#preset').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(p.name)}</option>`);
$('#preset').addEventListener('change', (e) => {
  if (!e.target.value) return;
  state = { ...structuredClone(PRESETS[e.target.value].state), variant: state.variant };
  e.target.value = '';
  $('#ai-notes').hidden = true;
  changed(true);
});

function restore(from, to) {
  if (!from.length) return;
  to.push(lastState);
  state = JSON.parse(from.pop());
  lastState = JSON.stringify(state);
  syncUndoButtons();
  save();
  renderVariant();
  renderProfiles();
  renderWeek();
}
const doUndo = () => restore(undo, redo);
const doRedo = () => restore(redo, undo);
$('#undo').addEventListener('click', doUndo);
$('#redo').addEventListener('click', doRedo);

// Ctrl+Z / Cmd+Z: vissza; Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y: újra.
// Szövegmezőben a böngésző saját visszavonása marad.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.target.matches('input, textarea, [contenteditable]') || !$('#view-plan').classList.contains('active')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
  else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey)) { e.preventDefault(); doRedo(); }
});

// ---- AI ---------------------------------------------------------------------
// opcionális: a szöveges doboz csak akkor jelenik meg, ha a szerveren van AI-kulcs
fetch('api/status').then((r) => r.json()).then((s) => { $('#ai-card').hidden = !s.ai; }).catch(() => {});

$('#ai-go').addEventListener('click', async () => {
  const text = $('#ai-text').value.trim();
  if (!text) return $('#ai-text').focus();
  const btn = $('#ai-go');
  btn.disabled = true;
  $('#ai-msg').textContent = '⏳ Értelmezem…';
  try {
    const r = await fetch('api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Valami hiba történt nálam.');
    // egységes "HH:MM" alak: "6" → "06:00"
    const hhmm = (t) => { const m = parseTime(t); return m === null ? t : fmtTime(m); };
    data.profiles.forEach((p) => p.periods.forEach((x) => { x.from = hhmm(x.from); x.to = hhmm(x.to); }));
    state = { variant: state.variant, mode: data.mode, profiles: data.profiles.length ? data.profiles : state.profiles };
    $('#opt-mode').checked = data.mode === 'cool';
    $('#ai-msg').textContent = '✅ Beírtam lent, ott átírhatod.';
    $('#ai-notes').hidden = !data.notes;
    $('#ai-notes').textContent = data.notes ? `💡 ${data.notes}` : '';
    changed(true);
  } catch (e) {
    $('#ai-msg').textContent = `⚠️ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---- típusváltozat ----------------------------------------------------------
function renderVariant() {
  const v = variantOf(state);
  $('#variants').innerHTML = Object.entries(VARIANTS).map(([k, x]) => `
    <label class="variant ${k === state.variant ? 'on' : ''}">
      <input type="radio" name="variant" value="${k}" ${k === state.variant ? 'checked' : ''}>
      <b>${esc(x.name)}</b><span class="vbtns">${x.buttons.map((b) => `<kbd>${b}</kbd>`).join(' ')}</span>
      <small class="muted">${esc(x.hint)}</small>
    </label>`).join('');
  $('#mode-row').hidden = !v.hasMode;
  $('#opt-mode').closest('label').hidden = !v.hasMode;
  $('#device').innerHTML = thermostatSvg(v);
  renderCheat(v);
}
$('#variants').addEventListener('change', (e) => {
  if (e.target.name !== 'variant') return;
  state.variant = e.target.value;
  renderVariant();
  changed(true);   // a szerkesztők hőfoktartománya típusfüggő
});

function renderCheat(v) {
  const old = v.logic === 'fixed6';
  const rows = [
    ['A következő kapcsolásig', '`+`/`−`'],
    old ? ['Party (1–9 óra)', '`+`/`−`, majd `DAY` annyiszor, ahány óra'] : ['Party (1–99 óra)', '`+`/`−`, `DAY`, `+`/`−` óraszám'],
    ['Szabadság (1–99 nap)', '`+`/`−`, `HOLD` 2 mp, `+`/`−` napszám'],
    ['Tartósan', '`+`/`−`, `HOLD` röviden'],
    ['Vissza a programhoz', '`SET`'],
  ];
  const other = [
    ['Program átnézése', '`PROG` többször, napváltás `+`/`−`, vége `SET`'],
    ['Pontos idő', '`DAY` nap → `DAY` óra → `DAY` perc → `SET`'],
    ...(v.hasMode ? [
      ['Fűtés ↔ hűtés', '`SET` nyomva + `COPY`, `+`/`−`, `SET`'],
      ['Komfort/takarék gyorsérték', '`SET` nyomva + `+` (vagy `−`), `+`/`−`, `SET`'],
      ['Gombzár be/ki', '`+` és `−` együtt 5 mp'],
      ['Hőmérő kalibrálása', '`DAY`, `HOLD`, `+`/`−` (±3 °C), `SET`'],
    ] : []),
    ...(v.radio ? [
      ['Hatótáv-teszt', '`TEST` 2 mp-ig: 2 percig 5 mp-enként ki-be kapcsoló jelet küld, a vevőn a piros LED követi'],
      ['Párosítás a vevővel', 'vevőn `M/A` ~10 mp (zöld LED villog), majd a termosztáton `SET` + `DAY` együtt ~10 mp. Csak ha nem működik a kapcsolat!'],
    ] : []),
    ['Világítás', v.hasMode ? '`LIGHT` (5 mp: minden gombnyomásra világít)' : '`LIGHT`'],
    ['Gyári alaphelyzet', '`RESET` – a programot is törli'],
  ];
  const table = (r) => `<table class="cheat">${r.map(([a, b]) => `<tr><td>${a}</td><td>${md(b)}</td></tr>`).join('')}</table>`;
  $('#cheat').innerHTML = `<h2>🖐️ Ideiglenes eltérés a programtól</h2>${table(rows)}<h2>⚙️ Egyebek (${esc(v.short)})</h2>${table(other)}`;
}

// ---- útmutató -------------------------------------------------------------

function startGuide() {
  plan = buildPlan(state, { setClock: $('#opt-clock').checked, useCopy: $('#opt-copy').checked, checkMode: $('#opt-mode').checked });
  if (!plan.ok) { showView('plan'); return; }
  $('#step-list').innerHTML = plan.steps.map((s, i) => `<li data-i="${i}"><span class="muted">${esc(s.section)}</span> – ${esc(s.title)}</li>`).join('');
  stepIdx = 0;
  showView('guide');
  renderStep();
}
$('#go-guide').addEventListener('click', startGuide);
$('#step-list').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) { stepIdx = Number(li.dataset.i); renderStep(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
$('#prev').addEventListener('click', () => { if (stepIdx > 0) { stepIdx--; renderStep(); } });
$('#next').addEventListener('click', () => {
  if (stepIdx < plan.steps.length - 1) { stepIdx++; renderStep(); } else showView('plan');
});
document.addEventListener('keydown', (e) => {
  if (!$('#view-guide').classList.contains('active') || e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowRight') $('#next').click();
  if (e.key === 'ArrowLeft') $('#prev').click();
});

function liveValues() {
  const now = new Date();
  const code = DAYS[(now.getDay() + 6) % 7];
  return { nap: `${dayLabel(variantOf(state), code)} (${DAY_HU[code]})`, óra: String(now.getHours()).padStart(2, '0'), perc: String(now.getMinutes()).padStart(2, '0'), code, now };
}

function keyChip(k) {
  const how = { hold: 'nyomva', long: `${k.seconds || 3} mp`, repeat: 'többször', tap: '' }[k.how || 'tap'];
  return `<span class="keychip"><kbd>${keyLabel(k.key)}</kbd>${how ? `<small>${how}</small>` : ''}</span>`;
}

function summaryHtml() {
  const v = plan.variant, fixed = v.logic === 'fixed6';
  const rows = plan.groups.map((g) => {
    const pts = fixed ? g.slots : g.switches;
    return `<tr><th>${g.days.map((d) => DAY_SHORT[d]).join(', ')}</th>${pts.map((s, i) => `<td class="${s.filler ? 'filler' : ''}" title="${s.filler ? 'kitöltés, nem vált hőfokot' : ''}"><small>${progLabel(v, fixed ? i + 1 : i)}</small><br>${fmtTime(s.time)}<br><b>${fmtTemp(s.temp)} °C</b></td>`).join('')}</tr>`;
  }).join('');
  return `<table class="summary">${rows}</table>`;
}

function slotListHtml(slots) {
  return `<table class="summary slots">${slots.map((x, i) => `<tr class="${x.filler ? 'filler' : ''}"><th>P${i + 1}</th><td>${fmtTime(x.time)}</td><td><b>${fmtTemp(x.temp)} °C</b></td><td>${x.filler ? 'kitöltés' : 'a programod része'}</td></tr>`).join('')}</table>`;
}

function renderStep() {
  clearInterval(liveTimer);
  const s = structuredClone(plan.steps[stepIdx]);
  const draw = () => {
    const live = liveValues();
    const fill = (t) => t.replace(/\{(nap|óra|perc)\}/g, (_, k) => live[k]);
    // minden frissítésnél az eredeti lépésből indulok, hogy az élő értékek (nap, idő) mindig aktuálisak legyenek
    const st = structuredClone(s);
    if (st.lcd.days?.includes('TODAY')) st.lcd.days = [live.code];
    if (st.lcd.time === 'now') st.lcd.time = `${live.óra}:${live.perc}`;
    if (st.live === 'day') st.lcd.days = [live.code];
    if (['hour', 'minute', 'clock'].includes(st.live)) { st.lcd.days = [live.code]; st.lcd.time = `${live.óra}:${live.perc}`; }
    $('#step-body').innerHTML = st.body.map((p) => `<p>${md(fill(p))}</p>`).join('');
    showStep($('#device'), st);
  };
  $('#step-section').textContent = s.section;
  $('#step-count').textContent = `${stepIdx + 1} / ${plan.steps.length}`;
  $('#step-title').textContent = s.title;
  $('#step-keys').innerHTML = s.keys.map((k, i) => (i ? '<span class="then">→</span>' : '') + keyChip(k)).join('');
  if (s.keys.length > 1 && s.keys[0].how === 'hold') $('#step-keys').innerHTML = keyChip(s.keys[0]) + '<span class="then">+</span>' + s.keys.slice(1).map(keyChip).join('<span class="then">→</span>');
  $('#step-hint').hidden = !s.hint;
  $('#step-hint').textContent = s.hint ? `💡 ${s.hint}` : '';
  $('#step-summary').hidden = !s.summary && !s.slotList;
  $('#step-summary').innerHTML = s.summary ? summaryHtml() : s.slotList ? slotListHtml(s.slotList) : '';
  $('#prev').disabled = stepIdx === 0;
  $('#next').textContent = stepIdx === plan.steps.length - 1 ? 'Vissza a programhoz' : 'Tovább →';
  $('#progress-bar').style.width = `${((stepIdx + 1) / plan.steps.length) * 100}%`;
  document.querySelectorAll('#step-list li').forEach((li, i) => { li.classList.toggle('current', i === stepIdx); li.classList.toggle('done', i < stepIdx); });
  draw();
  if (s.live || plan.steps[stepIdx].lcd.time === 'now') liveTimer = setInterval(draw, 5000);
}

// ---- indulás ------------------------------------------------------------------
$('#version').textContent = `v${VERSION}`;
$('#opt-mode').checked = state.mode === 'cool';
renderVariant();
renderProfiles();
renderWeek();
lastState = JSON.stringify(state);
