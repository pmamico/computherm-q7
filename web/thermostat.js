// A Computherm Q7 előlapjának animálható SVG-másolata (sematikus), típusváltozatonként.
import { DAYS, dayLabel } from './planner.js';

export const KEY_LABEL = { PLUS: '+', MINUS: '−' };
export const keyLabel = (k) => KEY_LABEL[k] || k;

export function thermostatSvg(v) {
  const days = DAYS.map((d, i) => `<text class="lcd-day" data-day="${d}" x="${v.dayLabels === 'names' ? 66 + i * 33 : 74 + i * 31}" y="97">${dayLabel(v, d)}</text>`).join('');
  const n = v.buttons.length, gap = 480 / n, w = Math.min(62, gap - 10);
  const small = v.buttons.map((k, i) => {
    const x = 60 + i * gap + (gap - w) / 2;
    return `<g class="btn small" id="btn-${k}" data-key="${k}">
      <rect class="ring" x="${x - 5}" y="337" width="${w + 10}" height="40" rx="12"/>
      <rect class="cap" x="${x}" y="342" width="${w}" height="30" rx="8"/>
      <text x="${x + w / 2}" y="362">${k}</text></g>`;
  }).join('');
  return `
<svg viewBox="0 0 600 400" class="q7" role="img" aria-label="Computherm ${v.short} termosztát">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfb"/><stop offset="1" stop-color="#e4e4e4"/></linearGradient>
    <linearGradient id="lcdbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d3dccd"/><stop offset="1" stop-color="#b9c4b3"/></linearGradient>
    <linearGradient id="key" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d9d9"/><stop offset="1" stop-color="#b9b9b9"/></linearGradient>
  </defs>
  <rect x="12" y="12" width="576" height="300" rx="24" fill="url(#body)" stroke="#bdbdbd" stroke-width="2"/>
  <path d="M30 44 H570" stroke="#d6d6d6" stroke-width="2"/>
  <path d="M30 262 H570" stroke="#d6d6d6" stroke-width="2"/>
  <rect x="48" y="66" width="262" height="186" rx="8" fill="#55595c"/>
  <rect x="56" y="74" width="246" height="170" rx="4" fill="url(#lcdbg)"/>
  <g class="lcd">
    <g class="lcd-days" id="lcd-days">${days}</g>
    ${v.prog === 'PROG' ? '<text class="lcd-small" x="68" y="117">TIME</text><text class="lcd-small" x="182" y="117">PROG</text><text class="lcd-small" x="236" y="117">SET TEMP</text>' : ''}
    <text class="lcd-big" id="lcd-time" x="66" y="150"></text>
    <text class="${v.prog === 'PROG' ? 'lcd-big' : 'lcd-mid'}" id="lcd-prog" x="${v.prog === 'PROG' ? 188 : 192}" y="${v.prog === 'PROG' ? 150 : 148}"></text>
    <text class="lcd-mid" id="lcd-temp" x="234" y="148"></text>
    ${v.prog === 'PROG' ? '<text class="lcd-small" x="96" y="180">ROOM TEMP</text>' : ''}
    <text class="lcd-huge" id="lcd-room" x="118" y="232"></text>
    <text class="lcd-mid" x="250" y="210">°C</text>
    <text class="lcd-icon" id="lcd-mode" x="66" y="232"></text>
  </g>
  <g class="btn big" id="btn-PLUS" data-key="PLUS">
    <rect class="ring" x="342" y="80" width="214" height="64" rx="16"/>
    <rect class="cap" x="348" y="86" width="202" height="52" rx="10"/>
    <text x="449" y="122">+</text></g>
  <g class="btn big" id="btn-MINUS" data-key="MINUS">
    <rect class="ring" x="342" y="164" width="214" height="64" rx="16"/>
    <rect class="cap" x="348" y="170" width="202" height="52" rx="10"/>
    <text x="449" y="206">−</text></g>
  <text x="560" y="288" class="brand" text-anchor="end">COMPUTHERM</text>
  <text x="560" y="303" class="brand-sub" text-anchor="end">${v.radio ? 'Wireless Thermo Control System' : 'Thermo Control System'}</text>
  <rect x="52" y="326" width="496" height="62" rx="14" fill="#e9e9e9" stroke="#c9c9c9"/>
  <text x="300" y="398" class="strip-label" text-anchor="middle">kis gombok (az elrendezés jelzésszerű)</text>
  ${small}
</svg>`;
}

/** Kijelző és gombanimáció beállítása egy lépéshez. */
export function showStep(root, step) {
  const lcd = step.lcd || {};
  const q = (s) => root.querySelector(s);
  root.querySelectorAll('.lcd-day').forEach((el) => {
    const d = el.dataset.day;
    const on = (lcd.days || []).includes(d);
    el.classList.toggle('off', !on);
    el.classList.toggle('blink', on && (lcd.daysBlink === true || lcd.daysBlink === d));
  });
  const time = q('#lcd-time');
  if (lcd.label) {
    time.innerHTML = `<tspan class="${lcd.timeBlink ? 'blink' : ''}">${lcd.label}</tspan>`;
  } else {
    const [h, m] = (lcd.time || '').split(':');
    const hb = lcd.timeBlink === true || lcd.timeBlink === 'hour', mb = lcd.timeBlink === true || lcd.timeBlink === 'minute';
    time.innerHTML = `<tspan class="${hb ? 'blink' : ''}">${h ?? ''}</tspan>:<tspan class="${mb ? 'blink' : ''}">${m ?? ''}</tspan>`;
  }
  q('#lcd-prog').textContent = lcd.prog ?? '';
  const temp = q('#lcd-temp');
  temp.textContent = lcd.temp ?? '';
  temp.classList.toggle('blink', !!lcd.tempBlink);
  q('#lcd-room').textContent = lcd.room ?? '';
  q('#lcd-mode').textContent = lcd.mode === 'cool' ? '❄' : '♨';

  root.querySelectorAll('.btn').forEach((b) => {
    b.classList.remove('active', 'tap', 'hold', 'long', 'repeat');
    b.style.removeProperty('--d');
  });
  for (const k of step.keys || []) {
    const b = q(`#btn-${k.key}`);
    if (!b) continue;
    b.classList.add('active', k.how || 'tap');
    b.style.setProperty('--d', `${k.delay || 0}s`);
  }
}
