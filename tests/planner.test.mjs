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

// ---- típusváltozatok ----------------------------------------------------------
import { fixedSlots, VARIANTS } from '../web/planner.js';

test('24:00-ig tartó és egész napos sáv', () => {
  assert.equal(sw(daySwitches({ base_temp: 18, periods: [{ from: '20:00', to: '24:00', temp: 21 }] })), '00:00=18 20:00=21');
  assert.equal(sw(daySwitches({ base_temp: 18, periods: [{ from: '00:00', to: '24:00', temp: 21 }] })), '00:00=21');
});

test('régi típus: pontosan 6 kapcsolás, az éjféli pont elhagyható', () => {
  const s = daySwitches(PRESETS.kezikonyv.state.profiles[0]); // 00:00=20 05:30=22 07:00=18 15:00=22 22:00=20
  const slots = fixedSlots(s, true);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].time, 330);            // P1 = 05:30
  assert.ok(slots.some((x) => x.filler));
  for (let i = 1; i < 6; i++) assert.ok(slots[i].time > slots[i - 1].time);
  assert.equal(fixedSlots(s, false)[0].time, 0); // ha nem hagyható el, P1 = 00:00
});

test('Q7 RF: napokként külön programozás, számozott napok, SET a P6 után', () => {
  const plan = buildPlan({ ...PRESETS.hetkoznap.state, variant: 'q7rf' }, { useCopy: true });
  assert.ok(plan.ok, JSON.stringify(plan.issues));
  assert.equal(plan.groups.every((g) => g.slots.length === 6), true);
  const p6temp = plan.steps.filter((s) => /^P6: .*°C$/.test(s.title));
  assert.equal(p6temp.length, 2);                 // hétfő + szombat, a többit másolja
  assert.ok(p6temp.every((s) => s.keys.at(-1).key === 'SET'));
  assert.ok(plan.steps.some((s) => s.body.join(' ').includes('`2`')));   // kedd = 2
  assert.ok(plan.steps.some((s) => s.body.join(' ').includes('5 mp')));  // COPY 5 mp
  assert.ok(!plan.steps.some((s) => s.section === 'Üzemmód'));
});

test('régi típus: túl sok váltás hiba, hűtés nem állítható', () => {
  const periods = [['01:00', '02:00'], ['03:00', '04:00'], ['05:00', '06:00'], ['07:00', '08:00']].map(([from, to]) => ({ from, to, temp: 22 }));
  const c = compile({ variant: 'q7old', mode: 'cool', profiles: [{ days: DAYS, base_temp: 18, periods }] });
  assert.equal(c.ok, false);
  assert.equal(c.mode, 'heat');
});

test('minden változat minden mintára ad lépéseket', () => {
  for (const variant of Object.keys(VARIANTS))
    for (const p of Object.values(PRESETS)) {
      const plan = buildPlan({ ...p.state, variant }, { setClock: true });
      assert.ok(plan.ok && plan.steps.length > 5, `${variant} ${p.name}`);
    }
});
