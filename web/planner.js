// A Computherm Q7 programozási modellje és a gombnyomás-sorozatok előállítása.
// Forrás: a gyártó kezelési útmutatója, összefoglalva: docs/q7-modell.md
// Böngészőben és node-ban (tesztek) is fut, ezért nincs benne DOM-hívás.

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DAY_HU = { MON: 'hétfő', TUE: 'kedd', WED: 'szerda', THU: 'csütörtök', FRI: 'péntek', SAT: 'szombat', SUN: 'vasárnap' };
export const DAY_SHORT = { MON: 'H', TUE: 'K', WED: 'Sze', THU: 'Cs', FRI: 'P', SAT: 'Szo', SUN: 'V' };

export const Q7 = {
  minTemp: 5, maxTemp: 40, tempStep: 0.5,
  slotMinutes: 10,          // kapcsolási időpontok lépésköze
  maxSwitches: 7,           // PROG 0 (00:00, rögzített) + PROG 1–6
  firstFree: 10, lastFree: 23 * 60 + 50,
  factoryTemp: 20,          // PROG 0 és az újonnan aktivált kapcsolások gyári hőfoka
  comfort: 22, eco: 18,     // a nagy + / − gomb gyári gyorsértéke kézi módosításkor
};

const SLOTS = 24 * 60 / Q7.slotMinutes;

// ---- segédek ---------------------------------------------------------------

/** "6", "6:30", "06.30", "0630", "24:00" → percek (0–1440), egyébként null. */
export function parseTime(value) {
  if (typeof value === 'number') return value >= 0 && value <= 1440 ? value : null;
  const s = String(value ?? '').trim().replace(/\s*(h|óra|ó)$/i, '');
  let m = s.match(/^(\d{1,2})(?:[:.h ](\d{1,2}))?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export const fmtTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const roundTime = (minutes) => Math.round(minutes / Q7.slotMinutes) * Q7.slotMinutes;

export function roundTemp(t) {
  const n = Number(String(t).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(Q7.maxTemp, Math.max(Q7.minTemp, Math.round(n / Q7.tempStep) * Q7.tempStep));
}

export const fmtTemp = (t) => t.toFixed(1).replace('.', ',');   // magyar kijelzés: 21,5
const lcdTemp = (t) => t.toFixed(1);                             // a kijelzőn: 21.5

// ---- napi program: idősávokból kapcsolási pontok ------------------------

/**
 * Egy profil (alaphőfok + idősávok) → a nap kapcsolási pontjai [{time, temp}], az első mindig 00:00.
 * A napot 144 db 10 perces cellára bontjuk; a később felsorolt sáv felülírja a korábbit;
 * az éjfélen átnyúló sáv (pl. 22:00–06:00) a nap elejére és végére is kerül.
 */
export function daySwitches(profile, issues = []) {
  const base = roundTemp(profile.base_temp ?? profile.base);
  const cells = new Array(SLOTS).fill(base ?? Q7.factoryTemp);
  if (base === null) issues.push({ level: 'error', text: 'Hiányzik az alaphőfok.' });
  for (const p of profile.periods || []) {
    const from = parseTime(p.from), to = parseTime(p.to), temp = roundTemp(p.temp);
    if (from === null || to === null || temp === null) {
      issues.push({ level: 'error', text: `Hibás idősáv: ${p.from ?? '?'}–${p.to ?? '?'}, ${p.temp ?? '?'} °C.` });
      continue;
    }
    const a = roundTime(from) / Q7.slotMinutes, b = roundTime(to) / Q7.slotMinutes;
    if (roundTime(from) !== from || roundTime(to) !== to)
      issues.push({ level: 'info', text: `${p.from}–${p.to}: a termosztát 10 percre kerekít → ${fmtTime(a * 10)}–${fmtTime(b * 10)}.` });
    if (Number(String(p.temp).replace(',', '.')) !== temp)
      issues.push({ level: 'info', text: `${p.temp} °C helyett ${fmtTemp(temp)} °C (0,5 °C lépés, 5–40 °C).` });
    if (a === b) continue;
    for (let i = a; i !== b; i = (i + 1) % SLOTS) cells[i] = temp;
  }
  const switches = [{ time: 0, temp: cells[0] }];
  for (let i = 1; i < SLOTS; i++) if (cells[i] !== cells[i - 1]) switches.push({ time: i * Q7.slotMinutes, temp: cells[i] });
  return switches;
}

/**
 * A teljes beállítás ellenőrzése és napokra bontása.
 * state = { mode: 'heat'|'cool', profiles: [{ days: ['MON',…], base_temp, periods: [{from,to,temp}] }] }
 * → { days: {MON: switches|null}, groups: [{days, switches}], issues }
 */
export function compile(state) {
  const issues = [];
  const days = Object.fromEntries(DAYS.map((d) => [d, null]));
  const owner = {};
  (state.profiles || []).forEach((profile, idx) => {
    const own = [];
    const switches = daySwitches(profile, own);
    own.forEach((i) => issues.push({ ...i, text: `${idx + 1}. csoport: ${i.text}` }));
    if (!profile.days?.length) issues.push({ level: 'warn', text: `${idx + 1}. csoport: nincs kiválasztva nap.` });
    if (switches.length > Q7.maxSwitches)
      issues.push({ level: 'error', text: `${idx + 1}. csoport: ${switches.length - 1} kapcsolás adódna, a Q7 naponta legfeljebb 6-ot tud (+ az éjféli PROG 0). Vonj össze sávokat.` });
    for (const d of profile.days || []) {
      if (!DAYS.includes(d)) continue;
      if (owner[d] !== undefined) issues.push({ level: 'warn', text: `${DAY_HU[d]} több csoportban is szerepel, a(z) ${idx + 1}. csoport érvényes.` });
      owner[d] = idx;
      days[d] = switches;
    }
  });
  const missing = DAYS.filter((d) => !days[d]);
  if (missing.length && missing.length < 7)
    issues.push({ level: 'warn', text: `Nincs beállítva: ${missing.map((d) => DAY_HU[d]).join(', ')} (ezek maradnak, ahogy vannak).` });
  if (missing.length === 7) issues.push({ level: 'error', text: 'Egyik naphoz sincs program.' });

  const groups = [];
  for (const d of DAYS) {
    if (!days[d]) continue;
    const key = JSON.stringify(days[d]);
    const g = groups.find((x) => x.key === key);
    if (g) g.days.push(d); else groups.push({ key, days: [d], switches: days[d] });
  }
  return { mode: state.mode === 'cool' ? 'cool' : 'heat', days, groups, issues, ok: !issues.some((i) => i.level === 'error') };
}

// ---- lépések ---------------------------------------------------------------

function pressHint(from, to) {
  if (from === to) return null;
  const n = Math.round(Math.abs(to - from) / Q7.tempStep);
  return `Gyári ${fmtTemp(from)} °C-ról ez ${n}× ${to > from ? '+' : '−'}.`;
}

const tempKey = (from, to) => ({ key: to >= from ? 'PLUS' : 'MINUS', how: 'repeat' });

/**
 * Lépésről lépésre útmutató.
 * opts: { setClock, useCopy, checkMode }
 * Egy lépés: { section, title, body: [string], keys: [{key, how, delay?, seconds?}], lcd, hint? }
 *   key: SET DAY PROG COPY HOLD LIGHT PLUS MINUS;  how: tap | hold | long | repeat
 *   A szövegben **félkövér** és `gomb` jelölés használható; {nap} {óra} {perc} a megjelenítéskor élő értékre cserélődik.
 */
export function buildPlan(state, opts = {}) {
  const compiled = compile(state);
  const { mode, groups } = compiled;
  const steps = [];
  if (!compiled.ok) return { ...compiled, steps };
  const useCopy = opts.useCopy !== false;
  const lcd = { days: ['MON'], daysBlink: false, time: '12:00', timeBlink: false, prog: 0, temp: '20.0', tempBlink: false, room: '21.5', label: null, mode };
  const snap = () => JSON.parse(JSON.stringify(lcd));
  const add = (section, title, body, keys, extra = {}) => steps.push({ section, title, body, keys, lcd: snap(), ...extra });
  const home = (section) => {
    Object.assign(lcd, { daysBlink: false, timeBlink: false, tempBlink: false, label: null, time: '12:00', prog: 0, temp: '20.0' });
    add(section, 'Alapképernyő', ['Nyomd meg a `SET`-et, hogy az alapképernyőn legyél.'], [{ key: 'SET', how: 'tap' }]);
  };

  add('Előkészület', 'A gombok', [
    'A nagy `+` / `−` mindig a **villogó** értéket állítja.',
    'Ha 15 mp-ig (programozásnál 1 percig) nem nyomsz semmit, a termosztát magától ment és kilép.',
    'A `LIGHT` 15 mp-re bekapcsolja a világítást.',
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

  if (mode === 'cool' || opts.checkMode) {
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
  const toProgram = allTogether ? [{ days: DAYS, switches: groups[0].switches, label: 'minden nap' }]
    : useCopy ? groups.map((g) => ({ days: [g.days[0]], copyTo: g.days.slice(1), switches: g.switches }))
      : groups.flatMap((g) => g.days.map((d) => ({ days: [d], switches: g.switches })));

  home('Programozás');
  Object.assign(lcd, { days: ['MON'], daysBlink: true, prog: null, temp: null, time: '12:00' });
  add('Programozás', 'Programozás indítása', [
    'Tartsd nyomva a `SET`-et, és közben nyomd meg a `PROG`-ot. Villogni kezd a nap.',
  ], [{ key: 'SET', how: 'hold' }, { key: 'PROG', how: 'tap', delay: 0.8 }]);

  toProgram.forEach((item) => {
    const sec = `Program: ${item.label || item.days.map((d) => DAY_HU[d]).join(', ')}`;
    const many = item.days.length > 1;
    Object.assign(lcd, { days: item.days, daysBlink: true, prog: null, temp: null, tempBlink: false, timeBlink: false, time: '12:00' });
    add(sec, many ? 'Minden nap' : `Nap: ${DAY_HU[item.days[0]]}`, [
      many ? '`+` / `−`, amíg **mind a 7 nap** villog, aztán `PROG`.'
        : `\`+\` / \`−\`, amíg **csak a \`${item.days[0]}\`** villog, aztán \`PROG\`.`,
    ], [{ key: 'PLUS', how: 'repeat' }, { key: 'PROG', how: 'tap', delay: 1.4 }], {
      hint: many ? 'Így később is csak együtt módosíthatók a napok.' : null,
    });

    const sw = item.switches;
    lcd.daysBlink = false;
    Object.assign(lcd, { prog: 0, time: '00:00', temp: lcdTemp(sw[0].temp), tempBlink: true });
    add(sec, `PROG 0: éjféltől ${fmtTemp(sw[0].temp)} °C`, [
      `Villog a hőfok. \`+\` / \`−\`: **${fmtTemp(sw[0].temp)} °C**, aztán \`PROG\`.`,
    ], [tempKey(Q7.factoryTemp, sw[0].temp), { key: 'PROG', how: 'tap', delay: 1.4 }], { hint: pressHint(Q7.factoryTemp, sw[0].temp) });

    for (let n = 1; n < sw.length; n++) {
      const { time, temp } = sw[n];
      Object.assign(lcd, { prog: n, time: fmtTime(time), timeBlink: true, temp: null, tempBlink: false });
      add(sec, `PROG ${n}: ${fmtTime(time)}`, [
        `Villog az időpont (újnál \`--:--\`). \`+\` / \`−\`: **${fmtTime(time)}**, aztán \`PROG\`.`,
      ], [{ key: 'PLUS', how: 'repeat' }, { key: 'PROG', how: 'tap', delay: 1.4 }], {
        hint: n === 1 ? '10 percenként lép. Nyomva tartva általában gyorsabb.' : null,
      });
      Object.assign(lcd, { timeBlink: false, temp: lcdTemp(temp), tempBlink: true });
      add(sec, `PROG ${n}: ${fmtTemp(temp)} °C`, [
        `Villog a hőfok. \`+\` / \`−\`: **${fmtTemp(temp)} °C**, aztán \`PROG\`.`,
      ], [tempKey(Q7.factoryTemp, temp), { key: 'PROG', how: 'tap', delay: 1.4 }], { hint: pressHint(Q7.factoryTemp, temp) });
    }

    const last = sw.length - 1;
    if (last < 6) {
      Object.assign(lcd, { prog: last + 1, time: '--:--', timeBlink: true, temp: null, tempBlink: false });
      add(sec, 'Nap lezárása', [
        `Most a PROG ${last + 1} villog, erre nincs szükség.`,
        '`--:--` látszik: nyomd meg a `PROG`-ot, és visszakerülsz a napválasztásra.',
        'Régi időpont látszik: `DAY` (ettől `--:--` lesz), majd `PROG`. Ismételd, amíg a nap nem kezd villogni.',
      ], [{ key: 'PROG', how: 'tap' }]);
    } else {
      add(sec, 'A nap kész', ['Mind a 6 kapcsolás foglalt, a termosztát magától visszalép a napválasztásra.'], []);
    }
  });

  Object.assign(lcd, { days: ['MON'], daysBlink: false, prog: 0, time: '12:00', timeBlink: false, temp: lcdTemp(toProgram[0].switches[0].temp), tempBlink: false });
  add('Programozás', 'Mentés', ['Nyomd meg a `SET`-et, és a program elmentődik.'], [{ key: 'SET', how: 'tap' }]);

  toProgram.filter((t) => t.copyTo?.length).forEach((item) => {
    const src = item.days[0];
    const sec = `Másolás: ${DAY_HU[src]} → ${item.copyTo.map((d) => DAY_HU[d]).join(', ')}`;
    home(sec);
    Object.assign(lcd, { label: 'COPY', days: ['MON'], daysBlink: true, prog: null, temp: null });
    add(sec, 'Másolás indítása', ['Tartsd nyomva a `COPY`-t kb. **3 mp-ig**, amíg megjelenik a `COPY` felirat.'],
      [{ key: 'COPY', how: 'long', seconds: 3 }]);
    Object.assign(lcd, { days: [src], daysBlink: true });
    add(sec, `Honnan: ${DAY_HU[src]}`, [`\`+\` / \`−\`: **\`${src}\`**, aztán \`COPY\`.`],
      [{ key: 'PLUS', how: 'repeat' }, { key: 'COPY', how: 'tap', delay: 1.4 }]);
    const done = [src];
    item.copyTo.forEach((d) => {
      Object.assign(lcd, { days: [...done, d], daysBlink: d });
      add(sec, `Hová: ${DAY_HU[d]}`, [`\`+\` / \`−\`: **\`${d}\`**, aztán \`COPY\`. Ha a nap már nem villog, sikerült a másolás.`],
        [{ key: 'PLUS', how: 'repeat' }, { key: 'COPY', how: 'tap', delay: 1.4 }]);
      done.push(d);
    });
    Object.assign(lcd, { label: null, days: ['MON'], daysBlink: false, prog: 0, temp: lcdTemp(item.switches[0].temp) });
    add(sec, 'Mentés', ['Nyomd meg a `SET`-et.'], [{ key: 'SET', how: 'tap' }]);
  });

  home('Ellenőrzés');
  Object.assign(lcd, { days: toProgram[0].days, prog: 0, time: '00:00', temp: lcdTemp(toProgram[0].switches[0].temp) });
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
