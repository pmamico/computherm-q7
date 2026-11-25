// A Computherm Q7 programozási modellje és a gombnyomás-sorozatok előállítása, típusváltozatonként.
// Források: a gyártó kezelési útmutatói, összefoglalva: docs/q7-modell.md
// Böngészőben és node-ban (tesztek) is fut, ezért nincs benne DOM-hívás.

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DAY_HU = { MON: 'hétfő', TUE: 'kedd', WED: 'szerda', THU: 'csütörtök', FRI: 'péntek', SAT: 'szombat', SUN: 'vasárnap' };
export const DAY_SHORT = { MON: 'H', TUE: 'K', WED: 'Sze', THU: 'Cs', FRI: 'P', SAT: 'Szo', SUN: 'V' };

const NEW_BUTTONS = ['SET', 'DAY', 'PROG', 'COPY', 'HOLD', 'LIGHT'];
const OLD_FACTORY = [[420, 20], [540, 17], [750, 20], [900, 19], [1050, 22], [1380, 17]].map(([time, temp]) => ({ time, temp }));

/**
 * Típusváltozatok.
 * logic 'p0':     PROG/P 0 rögzített 00:00 + 6 szabad, kikapcsolható (--:--) kapcsolás
 * logic 'fixed6': pontosan 6 kapcsolás (P1–P6), mindig mind aktív; a P6 hőfoka másnap P1-ig tart
 */
export const VARIANTS = {
  q7: {
    name: 'Q7 – újabb', short: 'Q7',
    hint: 'Napok betűvel (MON, TUE…), van PROG 0 (00:00).',
    logic: 'p0', dayLabels: 'names', prog: 'PROG', buttons: NEW_BUTTONS,
    minTemp: 5, maxTemp: 40, copySeconds: 3, hasMode: true, factoryTemp: 20,
  },
  q7num: {
    name: 'Q7 – „új szoftverrel”', short: 'Q7 (új szoftver)',
    hint: 'Napok számmal (1–7), van P0 (00:00).',
    logic: 'p0', dayLabels: 'numbers', prog: 'P', buttons: NEW_BUTTONS,
    minTemp: 5, maxTemp: 35, copySeconds: 3, hasMode: true, factoryTemp: 20,
  },
  q7old: {
    name: 'Q7 – régi', short: 'Q7 (régi)',
    hint: 'Napok számmal (1–7), fixen 6 kapcsolás (P1–P6).',
    logic: 'fixed6', dayLabels: 'numbers', prog: 'P', buttons: ['HOLD', 'DAY', 'LIGHT', 'RESET', 'COPY', 'PROG', 'SET'],
    minTemp: 7, maxTemp: 35, copySeconds: 5, hasMode: false, factory: OLD_FACTORY,
  },
  q7rf: {
    name: 'Q7 RF – rádiós (régi)', short: 'Q7 RF',
    hint: 'Vezeték nélküli, külön vevővel. Napok számmal (1–7), fixen 6 kapcsolás.',
    logic: 'fixed6', dayLabels: 'numbers', prog: 'P', buttons: ['HOLD', 'DAY', 'LIGHT', 'TEST', 'COPY', 'PROG', 'SET'],
    minTemp: 7, maxTemp: 35, copySeconds: 5, hasMode: false, factory: OLD_FACTORY, radio: true,
  },
};
export const DEFAULT_VARIANT = 'q7';
export const variantOf = (state) => VARIANTS[state?.variant] || VARIANTS[DEFAULT_VARIANT];

const STEP_MIN = 10, TEMP_STEP = 0.5, SLOTS = 24 * 60 / STEP_MIN;

// ---- segédek ---------------------------------------------------------------

/** "6", "6:30", "06.30", "0630", "24:00" → percek (0–1440), egyébként null. */
export function parseTime(value) {
  if (typeof value === 'number') return value >= 0 && value <= 1440 ? value : null;
  const s = String(value ?? '').trim().replace(/\s*(h|óra|ó)$/i, '');
  const m = s.match(/^(\d{1,2})(?:[:.h ](\d{1,2}))?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export const fmtTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const roundTime = (minutes) => Math.round(minutes / STEP_MIN) * STEP_MIN;

export function roundTemp(t, v = VARIANTS[DEFAULT_VARIANT]) {
  const n = Number(String(t).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(v.maxTemp, Math.max(v.minTemp, Math.round(n / TEMP_STEP) * TEMP_STEP));
}

export const fmtTemp = (t) => t.toFixed(1).replace('.', ',');   // magyar kijelzés: 21,5
const lcdTemp = (t) => t.toFixed(1);                             // a kijelzőn: 21.5

/** A nap jele a kijelzőn: MON… vagy 1… */
export const dayLabel = (v, d) => (v.dayLabels === 'names' ? d : String(DAYS.indexOf(d) + 1));
export const progLabel = (v, n) => (v.prog === 'PROG' ? `PROG ${n}` : `P${n}`);

// ---- napi program: idősávokból kapcsolási pontok ------------------------

/**
 * Egy profil (alaphőfok + idősávok) → a nap hőfokváltásai [{time, temp}], az első mindig 00:00.
 * A napot 144 db 10 perces cellára bontjuk; a később felsorolt sáv felülírja a korábbit;
 * az éjfélen átnyúló sáv (pl. 22:00–06:00) a nap elejére és végére is kerül.
 */
export function daySwitches(profile, issues = [], v = VARIANTS[DEFAULT_VARIANT]) {
  const base = roundTemp(profile.base_temp ?? profile.base, v);
  const cells = new Array(SLOTS).fill(base ?? 20);
  if (base === null) issues.push({ level: 'error', text: 'Hiányzik az alaphőfok.' });
  for (const p of profile.periods || []) {
    const from = parseTime(p.from), to = parseTime(p.to), temp = roundTemp(p.temp, v);
    if (from === null || to === null || temp === null) {
      issues.push({ level: 'error', text: `Hibás idősáv: ${p.from ?? '?'}–${p.to ?? '?'}, ${p.temp ?? '?'} °C.` });
      continue;
    }
    const a = roundTime(from) / STEP_MIN, b = roundTime(to) / STEP_MIN;
    if (roundTime(from) !== from || roundTime(to) !== to)
      issues.push({ level: 'info', text: `${p.from}–${p.to}: 10 percre kerekítve ${fmtTime(a * 10)}–${fmtTime(b * 10)}.` });
    if (Number(String(p.temp).replace(',', '.')) !== temp)
      issues.push({ level: 'info', text: `${p.temp} °C helyett ${fmtTemp(temp)} °C (0,5 fokos lépés, ${v.minTemp}–${v.maxTemp} °C).` });
    if (a === b) continue;
    // hossz cellákban; éjfélen átnyúló sávnál körbeér, a 00:00–24:00 pedig az egész nap
    const len = (b - a + SLOTS) % SLOTS || SLOTS;
    for (let k = 0; k < len; k++) cells[(a + k) % SLOTS] = temp;
  }
  const switches = [{ time: 0, temp: cells[0] }];
  for (let i = 1; i < SLOTS; i++) if (cells[i] !== cells[i - 1]) switches.push({ time: i * STEP_MIN, temp: cells[i] });
  return switches;
}

/**
 * Régi típusok: pontosan 6 kapcsolás kell. Ha az előző nap ugyanazzal a hőfokkal ér véget, mint amivel ez kezdődik,
 * az éjféli pont elhagyható (a P6 hőfoka átnyúlik). A hiányzó helyeket „töltelék” kapcsolások egészítik ki,
 * amelyek nem változtatnak a hőfokon.
 */
export function fixedSlots(switches, canDropMidnight) {
  let pts = switches.map((s) => ({ ...s }));
  if (canDropMidnight && pts.length > 1) pts = pts.slice(1);
  if (pts.length > 6) return null;
  while (pts.length < 6) {
    let done = false;
    for (let i = pts.length - 1; i >= 0 && !done; i--) {
      const next = i + 1 < pts.length ? pts[i + 1].time : 1440;
      if (next - pts[i].time >= 2 * STEP_MIN) {
        pts.splice(i + 1, 0, { time: pts[i].time + STEP_MIN, temp: pts[i].temp, filler: true });
        done = true;
      }
    }
    if (!done) return null;
  }
  return pts;
}

/**
 * A teljes beállítás ellenőrzése és napokra bontása.
 * state = { variant, mode: 'heat'|'cool', profiles: [{ days: ['MON',…], base_temp, periods: [{from,to,temp}] }] }
 * → { variant, days: {MON: switches|null}, groups: [{days, switches, slots?}], issues, ok }
 */
export function compile(state) {
  const v = variantOf(state);
  const issues = [];
  const days = Object.fromEntries(DAYS.map((d) => [d, null]));
  const owner = {};
  (state.profiles || []).forEach((profile, idx) => {
    const own = [];
    const switches = daySwitches(profile, own, v);
    own.forEach((i) => issues.push({ ...i, text: `${idx + 1}. csoport: ${i.text}` }));
    if (!profile.days?.length) issues.push({ level: 'warn', text: `${idx + 1}. csoport: nincs kiválasztva nap.` });
    if (v.logic === 'p0' && switches.length - 1 > 6)
      issues.push({ level: 'error', text: `${idx + 1}. csoport: ${switches.length - 1} hőfokváltás, de naponta csak 6 fér bele. Vonj össze sávokat.` });
    for (const d of profile.days || []) {
      if (!DAYS.includes(d)) continue;
      if (owner[d] !== undefined) issues.push({ level: 'warn', text: `${DAY_HU[d]} több csoportban is szerepel, a(z) ${idx + 1}. csoport érvényes.` });
      owner[d] = idx;
      days[d] = switches;
    }
  });
  const missing = DAYS.filter((d) => !days[d]);
  if (missing.length && missing.length < 7)
    issues.push({ level: 'warn', text: `Nincs megadva: ${missing.map((d) => DAY_HU[d]).join(', ')} (ezek maradnak, ahogy vannak).` });
  if (missing.length === 7) issues.push({ level: 'error', text: 'Egyik naphoz sincs program.' });

  const groups = [];
  for (const d of DAYS) {
    if (!days[d]) continue;
    const key = JSON.stringify(days[d]);
    const g = groups.find((x) => x.key === key);
    if (g) g.days.push(d); else groups.push({ key, days: [d], switches: days[d] });
  }

  if (v.logic === 'fixed6') {
    for (const g of groups) {
      const start = g.switches[0].temp;
      const canDrop = g.days.every((d) => {
        const prev = days[DAYS[(DAYS.indexOf(d) + 6) % 7]];
        return prev && prev.at(-1).temp === start;
      });
      g.slots = fixedSlots(g.switches, canDrop);
      if (!g.slots)
        issues.push({ level: 'error', text: `${g.days.map((d) => DAY_HU[d]).join(', ')}: ez a típus naponta pontosan 6 kapcsolást tud, ehhez túl sok a váltás. Vonj össze sávokat.` });
    }
  }
  return { variant: v, mode: v.hasMode && state.mode === 'cool' ? 'cool' : 'heat', days, groups, issues, ok: !issues.some((i) => i.level === 'error') };
}

// ---- lépések ---------------------------------------------------------------

function pressHint(from, to, prefix = 'Gyári') {
  if (from === to) return `${prefix} értéke is ennyi.`;
  const n = Math.round(Math.abs(to - from) / TEMP_STEP);
  return `${prefix} ${fmtTemp(from)} °C-ról ez ${n}× ${to > from ? '+' : '−'}.`;
}

function timeHint(from, to) {
  if (from === to) return `Gyári értéke is ${fmtTime(to)}.`;
  const n = Math.abs(to - from) / STEP_MIN;
  return `Gyári ${fmtTime(from)}-ról ez ${n}× ${to > from ? '+' : '−'} (nyomva tartva gyorsabb lehet).`;
}

const dirKey = (from, to) => ({ key: to >= from ? 'PLUS' : 'MINUS', how: 'repeat' });

/**
 * Lépésről lépésre útmutató.
 * opts: { setClock, useCopy, checkMode }
 * Egy lépés: { section, title, body: [string], keys: [{key, how, delay?, seconds?}], lcd, hint? }
 *   key: a gombok neve, ill. PLUS / MINUS;  how: tap | hold | long | repeat
 *   A szövegben **félkövér** és `gomb` jelölés használható; {nap} {óra} {perc} a megjelenítéskor élő értékre cserélődik.
 */
export function buildPlan(state, opts = {}) {
  const compiled = compile(state);
  const { mode, groups, variant: v } = compiled;
  const steps = [];
  if (!compiled.ok) return { ...compiled, steps };
  const fixed = v.logic === 'fixed6';
  const useCopy = opts.useCopy !== false;
  const D = (d) => `\`${dayLabel(v, d)}\``;
  const P = (n) => progLabel(v, n);
  const lp = (n) => (v.prog === 'P' ? `P${n}` : n);   // a kijelző programszám-mezője
  const lcd = { days: ['MON'], daysBlink: false, time: '12:00', timeBlink: false, prog: fixed ? 'P1' : lp(0), temp: '20.0', tempBlink: false, room: '21.5', label: null, mode };
  const snap = () => JSON.parse(JSON.stringify(lcd));
  const add = (section, title, body, keys, extra = {}) => steps.push({ section, title, body, keys, lcd: snap(), ...extra });
  const home = (section) => {
    Object.assign(lcd, { daysBlink: false, timeBlink: false, tempBlink: false, label: null, time: '12:00', prog: fixed ? 'P1' : lp(0), temp: '20.0' });
    add(section, 'Alaphelyzet', ['Nyomd meg a `SET`-et, hogy alaphelyzetben legyél.'], [{ key: 'SET', how: 'tap' }]);
  };

  add('Előkészület', 'A gombok', [
    'A nagy `+` / `−` mindig a **villogó** értéket állítja.',
    `Ha ${fixed ? '10' : '15'} mp-ig nem nyomsz semmit, a termosztát magától ment és kilép. Nyugodtan, de folyamatosan haladj.`,
    `A \`LIGHT\` ${fixed ? '10' : '15'} mp-re bekapcsolja a világítást.`,
  ], [{ key: 'LIGHT', how: 'tap' }]);

  if (opts.setClock) {
    home('Pontos idő');
    Object.assign(lcd, { days: ['MON'], daysBlink: true, time: '12:00' });
    add('Pontos idő', 'Nap', ['Nyomd meg a `DAY`-t, majd `+` / `−`: **{nap}**.'],
      [{ key: 'DAY', how: 'tap' }, { key: 'PLUS', how: 'repeat', delay: 0.9 }], { live: 'day' });
    Object.assign(lcd, { daysBlink: false, timeBlink: 'hour' });
    add('Pontos idő', 'Óra', ['Újra `DAY`, majd `+` / `−`: **{óra}**.'],
      [{ key: 'DAY', how: 'tap' }, { key: 'PLUS', how: 'repeat', delay: 0.9 }], { live: 'hour' });
    Object.assign(lcd, { timeBlink: 'minute' });
    add('Pontos idő', 'Perc', ['Újra `DAY`, majd `+` / `−`: **{perc}**.'],
      [{ key: 'DAY', how: 'tap' }, { key: 'PLUS', how: 'repeat', delay: 0.9 }], { live: 'minute' });
    Object.assign(lcd, { timeBlink: false });
    add('Pontos idő', 'Mentés', ['Nyomd meg a `SET`-et.'], [{ key: 'SET', how: 'tap' }], { live: 'clock' });
  }

  if (v.hasMode && (mode === 'cool' || opts.checkMode)) {
    const label = mode === 'cool' ? 'COOL' : 'HEAT';
    home('Üzemmód');
    Object.assign(lcd, { label, timeBlink: true });
    add('Üzemmód', mode === 'cool' ? 'Hűtés mód' : 'Fűtés mód', [
      `Tartsd nyomva a \`SET\`-et, és közben nyomd meg a \`COPY\`-t. \`+\` / \`−\`: **${label}**.`,
      'Fűtéshez és hűtéshez külön program tartozik, ezért előbb a mód.',
    ], [{ key: 'SET', how: 'hold' }, { key: 'COPY', how: 'tap', delay: 0.7 }, { key: 'PLUS', how: 'tap', delay: 1.6 }]);
    Object.assign(lcd, { label: null, timeBlink: false });
    add('Üzemmód', 'Mentés', ['Nyomd meg a `SET`-et.'], [{ key: 'SET', how: 'tap' }]);
  }

  const allTogether = groups.length === 1 && groups[0].days.length === 7;
  const toProgram = allTogether ? [{ ...groups[0], days: DAYS, label: 'minden nap' }]
    : useCopy ? groups.map((g) => ({ ...g, days: [g.days[0]], copyTo: g.days.slice(1) }))
      : groups.flatMap((g) => g.days.map((d) => ({ ...g, days: [d] })));

  const enter = (sec) => {
    Object.assign(lcd, { daysBlink: true, prog: null, temp: null, time: '12:00', label: null });
    add(sec, 'Programozás indítása', ['Tartsd nyomva a `SET`-et, és közben nyomd meg a `PROG`-ot. Villogni kezd a nap.'],
      [{ key: 'SET', how: 'hold' }, { key: 'PROG', how: 'tap', delay: 0.8 }]);
  };
  const selectDay = (sec, item) => {
    const many = item.days.length > 1;
    Object.assign(lcd, { days: item.days, daysBlink: true, prog: null, temp: null, tempBlink: false, timeBlink: false, time: '12:00' });
    add(sec, many ? 'Minden nap' : `Nap: ${DAY_HU[item.days[0]]}`, [
      many ? `\`+\` / \`−\`, amíg **mind a 7 nap** (${DAYS.map((d) => dayLabel(v, d)).join(' ')}) villog, aztán \`PROG\`.`
        : `\`+\` / \`−\`, amíg **csak a ${D(item.days[0])}** villog (${DAY_HU[item.days[0]]}), aztán \`PROG\`.`,
    ], [{ key: 'PLUS', how: 'repeat' }, { key: 'PROG', how: 'tap', delay: 1.4 }], {
      hint: many ? 'Így később is csak együtt módosíthatók a napok.' : null,
    });
    lcd.daysBlink = false;
  };
  const secOf = (item) => `Program: ${item.label || item.days.map((d) => DAY_HU[d]).join(', ')}`;

  if (!fixed) {
    // újabb típusok: egy programozási menetben több nap; PROG 0 + kikapcsolható kapcsolások
    home('Programozás');
    enter('Programozás');
    toProgram.forEach((item) => {
      const sec = secOf(item);
      selectDay(sec, item);
      const sw = item.switches;
      Object.assign(lcd, { prog: lp(0), time: '00:00', temp: lcdTemp(sw[0].temp), tempBlink: true });
      add(sec, `${P(0)}: éjféltől ${fmtTemp(sw[0].temp)} °C`, [
        `Villog a hőfok. \`+\` / \`−\`: **${fmtTemp(sw[0].temp)} °C**, aztán \`PROG\`.`,
      ], [dirKey(v.factoryTemp, sw[0].temp), { key: 'PROG', how: 'tap', delay: 1.4 }], { hint: pressHint(v.factoryTemp, sw[0].temp) });
      for (let n = 1; n < sw.length; n++) {
        const { time, temp } = sw[n];
        Object.assign(lcd, { prog: lp(n), time: fmtTime(time), timeBlink: true, temp: null, tempBlink: false });
        add(sec, `${P(n)}: ${fmtTime(time)}`, [
          `Villog az időpont (újnál \`--:--\`). \`+\` / \`−\`: **${fmtTime(time)}**, aztán \`PROG\`.`,
        ], [{ key: 'PLUS', how: 'repeat' }, { key: 'PROG', how: 'tap', delay: 1.4 }], {
          hint: n === 1 ? '10 percenként lép. Nyomva tartva általában gyorsabb.' : null,
        });
        Object.assign(lcd, { timeBlink: false, temp: lcdTemp(temp), tempBlink: true });
        add(sec, `${P(n)}: ${fmtTemp(temp)} °C`, [
          `Villog a hőfok. \`+\` / \`−\`: **${fmtTemp(temp)} °C**, aztán \`PROG\`.`,
        ], [dirKey(v.factoryTemp, temp), { key: 'PROG', how: 'tap', delay: 1.4 }], { hint: pressHint(v.factoryTemp, temp) });
      }
      const last = sw.length - 1;
      if (last < 6) {
        Object.assign(lcd, { prog: lp(last + 1), time: '--:--', timeBlink: true, temp: null, tempBlink: false });
        add(sec, 'Nap lezárása', [
          `Most a ${P(last + 1)} villog, erre nincs szükség.`,
          '`--:--` látszik: nyomd meg a `PROG`-ot, és visszakerülsz a napválasztásra.',
          'Régi időpont látszik: `DAY` (ettől `--:--` lesz), majd `PROG`. Ismételd, amíg a nap nem kezd villogni.',
        ], [{ key: 'PROG', how: 'tap' }]);
      } else {
        add(sec, 'A nap kész', ['Mind a 6 kapcsolás foglalt, a termosztát magától visszalép a napválasztásra.'], []);
      }
    });
    Object.assign(lcd, { days: ['MON'], daysBlink: false, prog: lp(0), time: '12:00', timeBlink: false, temp: lcdTemp(toProgram[0].switches[0].temp), tempBlink: false });
    add('Programozás', 'Mentés', ['Nyomd meg a `SET`-et, és a program elmentődik.'], [{ key: 'SET', how: 'tap' }]);
  } else {
    // régi típusok: napi pontosan 6 kapcsolás (P1–P6); napokként külön programozási menet
    toProgram.forEach((item) => {
      const sec = secOf(item);
      home(sec);
      enter(sec);
      selectDay(sec, item);
      item.slots.forEach((s, i) => {
        const n = i + 1, f = v.factory[i];
        const isLast = n === 6;
        Object.assign(lcd, { prog: `P${n}`, time: fmtTime(s.time), timeBlink: true, temp: null, tempBlink: false });
        add(sec, `P${n}: ${fmtTime(s.time)}`, [
          `Villog a P${n} időpontja. \`+\` / \`−\`: **${fmtTime(s.time)}**, aztán \`PROG\`.`,
          ...(s.filler ? ['(Ez csak kitöltés: ugyanaz a hőfok marad, mert ez a típus mindig 6 kapcsolást használ.)'] : []),
        ], [dirKey(f.time, s.time), { key: 'PROG', how: 'tap', delay: 1.4 }], { hint: timeHint(f.time, s.time) });
        Object.assign(lcd, { timeBlink: false, temp: lcdTemp(s.temp), tempBlink: true });
        add(sec, `P${n}: ${fmtTemp(s.temp)} °C`, [
          `Villog a hőfok. \`+\` / \`−\`: **${fmtTemp(s.temp)} °C**, aztán ${isLast ? '`SET` (mentés)' : '`PROG`'}.`,
          ...(isLast ? ['Ez a hőfok másnap P1-ig marad érvényben.'] : []),
        ], [dirKey(f.temp, s.temp), { key: isLast ? 'SET' : 'PROG', how: 'tap', delay: 1.4 }], { hint: pressHint(f.temp, s.temp) });
      });
    });
  }

  toProgram.filter((t) => t.copyTo?.length).forEach((item) => {
    const src = item.days[0];
    const sec = `Másolás: ${DAY_HU[src]} → ${item.copyTo.map((d) => DAY_HU[d]).join(', ')}`;
    home(sec);
    Object.assign(lcd, { label: 'COPY', days: ['MON'], daysBlink: true, prog: null, temp: null });
    add(sec, 'Másolás indítása', [`Tartsd nyomva a \`COPY\`-t kb. **${v.copySeconds} mp-ig**, amíg megjelenik a \`COPY\` felirat.`],
      [{ key: 'COPY', how: 'long', seconds: v.copySeconds }]);
    Object.assign(lcd, { days: [src], daysBlink: true });
    add(sec, `Honnan: ${DAY_HU[src]}`, [`\`+\` / \`−\`: **${D(src)}**, aztán \`COPY\`.`],
      [{ key: 'PLUS', how: 'repeat' }, { key: 'COPY', how: 'tap', delay: 1.4 }]);
    const done = [src];
    item.copyTo.forEach((d) => {
      Object.assign(lcd, { days: [...done, d], daysBlink: d });
      add(sec, `Hová: ${DAY_HU[d]}`, [`\`+\` / \`−\`: **${D(d)}**, aztán \`COPY\`. Ha a nap már nem villog, sikerült a másolás.`],
        [{ key: 'PLUS', how: 'repeat' }, { key: 'COPY', how: 'tap', delay: 1.4 }]);
      done.push(d);
    });
    Object.assign(lcd, { label: null, days: ['MON'], daysBlink: false, prog: fixed ? 'P1' : lp(0), temp: lcdTemp(item.switches[0].temp) });
    add(sec, 'Mentés', ['Nyomd meg a `SET`-et.'], [{ key: 'SET', how: 'tap' }]);
  });

  home('Ellenőrzés');
  const first = toProgram[0];
  Object.assign(lcd, fixed
    ? { days: first.days, prog: 'P1', time: fmtTime(first.slots[0].time), temp: lcdTemp(first.slots[0].temp) }
    : { days: first.days, prog: lp(0), time: '00:00', temp: lcdTemp(first.switches[0].temp) });
  add('Ellenőrzés', 'Átnézés', [
    'A `PROG` gombbal lépkedhetsz a kapcsolásokon, a `+` / `−` gombbal pedig a napok között. A végén nyomd meg a `SET`-et.',
  ], [{ key: 'PROG', how: 'tap' }, { key: 'PROG', how: 'tap', delay: 1.2 }], { summary: true });

  add('Kész', 'Kész! 🎉', ['A termosztát hétről hétre ezt követi. Ideiglenes eltéréshez nézd meg a Puskát.'], [], { summary: true });

  return { ...compiled, steps };
}

// ---- kész minták -----------------------------------------------------------

export const PRESETS = {
  kezikonyv: {
    name: 'A kézikönyv javaslata (dolgozó család)',
    state: { mode: 'heat', profiles: [{ days: DAYS.slice(), base_temp: 20, periods: [
      { from: '05:30', to: '07:00', temp: 22 }, { from: '07:00', to: '15:00', temp: 18 }, { from: '15:00', to: '22:00', temp: 22 }] }] },
  },
  hetkoznap: {
    name: 'Hétköznap munka, hétvégén otthon',
    state: { mode: 'heat', profiles: [
      { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], base_temp: 19, periods: [{ from: '06:00', to: '08:00', temp: 21.5 }, { from: '08:00', to: '16:00', temp: 18 }, { from: '16:00', to: '22:30', temp: 21.5 }] },
      { days: ['SAT', 'SUN'], base_temp: 19, periods: [{ from: '07:30', to: '23:00', temp: 21.5 }] }] },
  },
  otthon: {
    name: 'Egész nap otthon',
    state: { mode: 'heat', profiles: [{ days: DAYS.slice(), base_temp: 19, periods: [{ from: '06:30', to: '22:30', temp: 21.5 }] }] },
  },
};
