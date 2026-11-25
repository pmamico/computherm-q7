import { DAYS, DAY_HU, DAY_SHORT, PRESETS, compile, buildPlan, fmtTime, fmtTemp, parseTime } from './planner.js';
import { thermostatSvg, showStep, KEY_LABEL } from './thermostat.js';

const $ = (s) => document.querySelector(s);
const STORE = 'q7-state-v1';

let state = load() || structuredClone(PRESETS.hetkoznap.state);
let plan = null, stepIdx = 0, liveTimer = null;

function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<kbd>$1</kbd>');

function tempColor(t) {
  // hideg: kék, langyos: halvány, meleg: narancs (RGB-keverés, hogy ne menjen át zöldbe)
  const x = Math.min(1, Math.max(0, (t - 16) / 7));
  const mix = (a, b) => Math.round(a + (b - a) * x);
  return `rgb(${mix(116, 255)}, ${mix(192, 146)}, ${mix(252, 43)})`;
}

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
  state.profiles.forEach((p, pi) => {
    const card = document.createElement('div');
    card.className = 'profile';
    card.innerHTML = `
      <div class="row spread">
        <div class="days">${DAYS.map((d) => `<button class="day ${p.days.includes(d) ? 'on' : ''}" data-day="${d}" title="${DAY_HU[d]}">${DAY_SHORT[d]}</button>`).join('')}
          <button class="link" data-act="wd">hétköznap</button><button class="link" data-act="we">hétvége</button><button class="link" data-act="all">mind</button></div>
        ${state.profiles.length > 1 ? '<button class="link danger" data-act="del">törlés</button>' : ''}
      </div>
      <div class="row"><label>Alaphőfok: <input type="number" class="temp" step="0.5" min="5" max="40" value="${p.base_temp}" data-f="base"> °C</label>
        </div>
      <div class="periods">${p.periods.map((x, i) => `
        <div class="period" data-i="${i}">
          <input class="time" inputmode="numeric" placeholder="06:00" value="${esc(x.from)}" data-f="from"> –
          <input class="time" inputmode="numeric" placeholder="22:00" value="${esc(x.to)}" data-f="to">
          <input type="number" class="temp" step="0.5" min="5" max="40" value="${x.temp}" data-f="temp"> °C
          <button class="link danger" data-act="delp" title="sáv törlése">✕</button>
        </div>`).join('')}</div>
      <button class="link" data-act="addp">+ idősáv</button>`;
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.day) return setDays(pi, [b.dataset.day], !p.days.includes(b.dataset.day));
      const act = b.dataset.act;
      if (act === 'wd') setDays(pi, DAYS.slice(0, 5), true);
      if (act === 'we') setDays(pi, DAYS.slice(5), true);
      if (act === 'all') setDays(pi, DAYS, true);
      if (act === 'del') { state.profiles.splice(pi, 1); changed(true); }
      if (act === 'addp') {
        const last = p.periods.at(-1);
        p.periods.push(last ? { from: last.to, to: '22:00', temp: 21.5 } : { from: '06:00', to: '22:00', temp: 21.5 });
        changed(true);
      }
      if (act === 'delp') { p.periods.splice(Number(b.closest('.period').dataset.i), 1); changed(true); }
    });
    card.addEventListener('change', (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      if (f === 'base') p.base_temp = Number(e.target.value);
      else {
        const per = p.periods[Number(e.target.closest('.period').dataset.i)];
        if (f === 'temp') per[f] = Number(e.target.value);
        else { const m = parseTime(e.target.value); per[f] = m === null ? e.target.value : fmtTime(m); e.target.value = per[f]; }
      }
      changed(false);
    });
    box.appendChild(card);
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

function changed(rerender) {
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
    if (!sw) return `<div class="week-row"><span>${DAY_SHORT[d]}</span><div class="bar empty">nincs megadva – marad a régi</div><span></span></div>`;
    const segs = sw.map((s, i) => {
      const end = i + 1 < sw.length ? sw[i + 1].time : 1440;
      const w = (end - s.time) / 1440 * 100;
      return `<div class="seg" style="width:${w}%;background:${tempColor(s.temp)}" title="${fmtTime(s.time)}–${fmtTime(end % 1440)}: ${fmtTemp(s.temp)} °C">${w > 7 ? fmtTemp(s.temp) : ''}</div>`;
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
  state = structuredClone(PRESETS[e.target.value].state);
  e.target.value = '';
  $('#ai-notes').hidden = true;
  changed(true);
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
    if (!r.ok) throw new Error(data.error || 'Hiba történt.');
    // egységes "HH:MM" alak: "6" → "06:00"
    const hhmm = (t) => { const m = parseTime(t); return m === null ? t : fmtTime(m); };
    data.profiles.forEach((p) => p.periods.forEach((x) => { x.from = hhmm(x.from); x.to = hhmm(x.to); }));
    state = { mode: data.mode, profiles: data.profiles.length ? data.profiles : state.profiles };
    $('#opt-mode').checked = data.mode === 'cool';
    $('#ai-msg').textContent = '✅ Kész, lent átírhatod.';
    $('#ai-notes').hidden = !data.notes;
    $('#ai-notes').textContent = data.notes ? `💡 ${data.notes}` : '';
    changed(true);
  } catch (e) {
    $('#ai-msg').textContent = `⚠️ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---- útmutató -------------------------------------------------------------
$('#device').innerHTML = thermostatSvg();

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
  return { nap: `${code} (${DAY_HU[code]})`, óra: String(now.getHours()).padStart(2, '0'), perc: String(now.getMinutes()).padStart(2, '0'), code, now };
}

function keyChip(k) {
  const how = { hold: 'nyomva', long: `${k.seconds || 3} mp`, repeat: 'többször', tap: '' }[k.how || 'tap'];
  return `<span class="keychip"><kbd>${KEY_LABEL[k.key]}</kbd>${how ? `<small>${how}</small>` : ''}</span>`;
}

function summaryHtml() {
  const rows = plan.groups.map((g) => `<tr><th>${g.days.map((d) => DAY_SHORT[d]).join(', ')}</th>${g.switches.map((s, i) => `<td><small>PROG ${i}</small><br>${fmtTime(s.time)}<br><b>${fmtTemp(s.temp)} °C</b></td>`).join('')}</tr>`).join('');
  return `<table class="summary">${rows}</table>`;
}

function renderStep() {
  clearInterval(liveTimer);
  const s = structuredClone(plan.steps[stepIdx]);
  const draw = () => {
    const live = liveValues();
    const fill = (t) => t.replace(/\{(nap|óra|perc)\}/g, (_, k) => live[k]);
    if (s.live === 'day') s.lcd.days = [live.code];
    if (['hour', 'minute', 'clock'].includes(s.live)) { s.lcd.days = [live.code]; s.lcd.time = `${live.óra}:${live.perc}`; }
    $('#step-body').innerHTML = s.body.map((p) => `<p>${md(fill(p))}</p>`).join('');
    showStep($('#device'), s);
  };
  $('#step-section').textContent = s.section;
  $('#step-count').textContent = `${stepIdx + 1} / ${plan.steps.length}`;
  $('#step-title').textContent = s.title;
  $('#step-keys').innerHTML = s.keys.map((k, i) => (i ? '<span class="then">→</span>' : '') + keyChip(k)).join('');
  if (s.keys.length > 1 && s.keys[0].how === 'hold') $('#step-keys').innerHTML = keyChip(s.keys[0]) + '<span class="then">+</span>' + s.keys.slice(1).map(keyChip).join('<span class="then">→</span>');
  $('#step-hint').hidden = !s.hint;
  $('#step-hint').textContent = s.hint ? `💡 ${s.hint}` : '';
  $('#step-summary').hidden = !s.summary;
  $('#step-summary').innerHTML = s.summary ? summaryHtml() : '';
  $('#prev').disabled = stepIdx === 0;
  $('#next').textContent = stepIdx === plan.steps.length - 1 ? 'Vissza a programhoz' : 'Tovább →';
  $('#progress-bar').style.width = `${((stepIdx + 1) / plan.steps.length) * 100}%`;
  document.querySelectorAll('#step-list li').forEach((li, i) => { li.classList.toggle('current', i === stepIdx); li.classList.toggle('done', i < stepIdx); });
  draw();
  if (s.live) liveTimer = setInterval(draw, 5000);
}

// ---- indulás ------------------------------------------------------------------
$('#opt-mode').checked = state.mode === 'cool';
renderProfiles();
renderWeek();
