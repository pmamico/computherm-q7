// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { daySwitches, compile, buildPlan, parseTime, PRESETS, DAYS } from '../web/planner.js';

const sw = (s) => s.map((x) => `${String(Math.floor(x.time / 60)).padStart(2, '0')}:${String(x.time % 60).padStart(2, '0')}=${x.temp}`).join(' ');

test('parseTime', () => {
  assert.equal(parseTime('6'), 360);
  assert.equal(parseTime('06:30'), 390);
  assert.equal(parseTime('6.30'), 390);
  assert.equal(parseTime('24:00'), 1440);
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('abc'), null);
});

test('a kézikönyv mintaprogramja (25. oldal)', () => {
  const s = daySwitches(PRESETS.kezikonyv.state.profiles[0]);
  assert.equal(sw(s), '00:00=20 05:30=22 07:00=18 15:00=22 22:00=20');
});

test('éjfélen átnyúló sáv a nap elejére és végére is kerül', () => {
  const s = daySwitches({ base_temp: 21, periods: [{ from: '22:00', to: '06:00', temp: 18 }] });
  assert.equal(sw(s), '00:00=18 06:00=21 22:00=18');
});

test('kerekítés 10 percre és 0,5 fokra', () => {
  const issues = [];
  const s = daySwitches({ base_temp: 19.3, periods: [{ from: '06:44', to: '08:00', temp: '21,7' }] }, issues);
  assert.equal(sw(s), '00:00=19.5 06:40=21.5 08:00=19.5');
  assert.ok(issues.some((i) => i.level === 'info'));
});

test('túl sok kapcsolás hiba', () => {
  const periods = Array.from({ length: 4 }, (_, i) => ({ from: `${6 + i * 3}:00`, to: `${7 + i * 3}:00`, temp: 22 }));
  const c = compile({ profiles: [{ days: ['MON'], base_temp: 18, periods }] });
  assert.equal(c.ok, false);
});

test('azonos napok egy csoportba kerülnek, minden nap egyszerre programozható', () => {
  const plan = buildPlan(PRESETS.kezikonyv.state, { useCopy: true });
  assert.equal(plan.groups.length, 1);
  assert.ok(plan.steps.some((s) => s.title === 'Minden nap'));
  assert.ok(!plan.steps.some((s) => s.section.startsWith('Másolás')));
});

test('két csoport: első napok programozása, aztán másolás', () => {
  const plan = buildPlan(PRESETS.hetkoznap.state, { useCopy: true, setClock: true });
  assert.ok(plan.ok);
  const titles = plan.steps.map((s) => s.title);
  assert.ok(titles.includes('Nap: hétfő'));
  assert.ok(titles.includes('Nap: szombat'));
  assert.ok(titles.includes('Hová: péntek'));
  assert.ok(titles.includes('Hová: vasárnap'));
  assert.ok(titles.includes('Óra'));
  // minden lépésnek van kijelző-állapota és érvényes gombja
  const keys = new Set(['SET', 'DAY', 'PROG', 'COPY', 'HOLD', 'LIGHT', 'PLUS', 'MINUS']);
  for (const s of plan.steps) {
    assert.ok(s.lcd);
    for (const k of s.keys) assert.ok(keys.has(k.key), k.key);
  }
});

test('másolás nélkül minden nap külön', () => {
  const plan = buildPlan(PRESETS.hetkoznap.state, { useCopy: false });
  for (const d of DAYS) assert.ok(plan.steps.some((s) => s.title.startsWith('Nap:') && s.lcd.days[0] === d));
});

test('hűtés módnál üzemmódváltás lépés', () => {
  const plan = buildPlan({ ...PRESETS.otthon.state, mode: 'cool' });
  assert.ok(plan.steps.some((s) => s.section === 'Üzemmód'));
});

test('6 szabad kapcsolásnál nincs külön lezárás', () => {
  const periods = [['01:00', '02:00'], ['03:00', '04:00'], ['05:00', '06:00']].map(([from, to]) => ({ from, to, temp: 22 }));
  const plan = buildPlan({ profiles: [{ days: DAYS, base_temp: 18, periods }] });
  assert.ok(plan.ok);
  assert.ok(plan.steps.some((s) => s.title === 'A nap kész'));
});
