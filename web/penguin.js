// Pingvin társ: a sarokban lakik, pislog, totyog, néha arrébb sétál; a hőfokra és az útmutatóra reagál.
// Plusz konfetti a végére. Külső kép/könyvtár nélkül (SVG + CSS + canvas).

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const SVG = `
<svg viewBox="0 0 100 120" class="peng-svg" aria-hidden="true">
  <g class="peng-snow"><text x="72" y="16" font-size="16">❄</text></g>
  <g class="peng-sweat"><path d="M80 30 q5 8 0 12 q-5 -4 0 -12z" fill="#74c0fc"/></g>
  <g class="peng-body">
    <ellipse cx="50" cy="112" rx="26" ry="5" fill="#0002"/>
    <g class="peng-foot-l"><ellipse cx="38" cy="108" rx="9" ry="4.5" fill="#ff922b"/></g>
    <g class="peng-foot-r"><ellipse cx="62" cy="108" rx="9" ry="4.5" fill="#ff922b"/></g>
    <g class="peng-wing-l"><path d="M22 58 q-12 18 -4 36 q8 -6 10 -18z" fill="#2b2d42"/></g>
    <g class="peng-wing-r"><path d="M78 58 q12 18 4 36 q-8 -6 -10 -18z" fill="#2b2d42"/></g>
    <ellipse cx="50" cy="68" rx="30" ry="40" fill="#2b2d42"/>
    <ellipse cx="50" cy="76" rx="21" ry="30" fill="#fff"/>
    <ellipse cx="50" cy="40" rx="22" ry="17" fill="#fff"/>
    <ellipse cx="35" cy="50" rx="5" ry="3" fill="#ffc9c9"/>
    <ellipse cx="65" cy="50" rx="5" ry="3" fill="#ffc9c9"/>
    <g class="peng-eyes">
      <ellipse cx="42" cy="40" rx="3.6" ry="4.4" fill="#222"/><circle cx="43.2" cy="38.6" r="1.2" fill="#fff"/>
      <ellipse cx="58" cy="40" rx="3.6" ry="4.4" fill="#222"/><circle cx="59.2" cy="38.6" r="1.2" fill="#fff"/>
    </g>
    <path d="M45 47 q5 6 10 0 q-5 -2 -10 0z" fill="#ff922b"/>
  </g>
</svg>
<div class="peng-say" hidden></div>`;

const TIPS = [
  'Szia! Én vagyok a pingvin, segítek beállítani a termosztátot. 🐧',
  'Minden 1 fokkal kevesebb fűtés kb. 6% energiát spórol.',
  'Pingvinként a hideget szeretem, de te ne fázz!',
  'Ha elakadtál, a ← gombbal visszaléphetsz.',
  'Éjszakára elég 18–19 fok, napközben 21–22.',
  'A felfűtés időbe telik: a kapcsolást érdemes fél órával korábbra tenni.',
];

export function mountPenguin(onHide) {
  const el = document.createElement('div');
  el.className = 'peng';
  el.innerHTML = SVG;
  el.title = 'Pingvin – kattints rám!';
  document.body.appendChild(el);
  const bubble = el.querySelector('.peng-say');
  let x = 0, sayTimer = null, walkTimer = null, tip = 0;

  function say(text, ms = 4000) {
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { bubble.hidden = true; }, ms);
  }
  function anim(cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;   // újraindítom az animációt
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
  const hop = () => anim('hop', 700);

  // időnként arrébb totyog (a jobb alsó sarok közelében)
  function walk() {
    if (!reduced() && !el.hidden) {
      const max = innerWidth < 600 ? 70 : 160;
      const nx = Math.round(Math.random() * max);
      el.classList.toggle('face-left', nx > x);
      el.classList.add('walking');
      el.style.setProperty('--x', `${-nx}px`);
      x = nx;
      setTimeout(() => el.classList.remove('walking'), 1600);
    }
    walkTimer = setTimeout(walk, 9000 + Math.random() * 9000);
  }
  walkTimer = setTimeout(walk, 6000);

  el.addEventListener('click', () => {
    hop();
    say(TIPS[tip++ % TIPS.length]);
  });

  return {
    el,
    hop,
    say,
    /** hangulat a program legmagasabb hőfoka alapján: 'cold' | 'warm' | 'hot' */
    mood(maxTemp) {
      el.classList.toggle('cold', maxTemp <= 19);
      el.classList.toggle('hot', maxTemp >= 24);
    },
    celebrate() {
      anim('party', 2400);
      say('Hurrá, kész! 🎉', 3500);
      confetti();
    },
    setVisible(on) { el.hidden = !on; },
    destroy() { clearTimeout(walkTimer); el.remove(); onHide?.(); },
  };
}

/** Konfetti-eső egy átmeneti canvason. */
export function confetti() {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#ff922b', '#e8590c', '#74c0fc', '#1c7ed6', '#ffd43b', '#69db7c', '#f783ac'];
  const n = reduced() ? 40 : 180;
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t - start < 3500) requestAnimationFrame(frame); else c.remove();
  })(start);
}
