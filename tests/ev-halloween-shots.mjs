// Captures de l'ambiance Halloween (src/evart.js, src/css/ev-halloween.css) pour relecture : outil hors run-tests.sh.
// Reconstruit la page, lance le monde de test (proxy sur un port libre entre 19900 et 19909), puis pose lui-même ce que fera le moteur (event.js) :
// data-event="halloween" et .ev-deco sur <html>, <div class="ev-amb"> + EV_AMB.halloween() après #app, trois citrouilles de 28 px dans l'accueil.
// Si la page ne contient pas encore evart.js (build.mjs sans le module), le fichier est injecté par addScriptTag.
// Captures → shots/ev-halloween/ : accueil 393 × 852 et 360 × 780 (clair, sombre), 1280 × 800 (clair, sombre), une section (en-tête), planche des dessins
// (citrouille à 160 px, allumée, à 28 px, chauve-souris, lune, compteur). Contrôles : propriétés animées (transform / opacity seulement),
// nombre d'éléments animés de l'ambiance (≤ 12), « réduire les animations » (rien ne bouge, citrouille visible), .ev-quiet (ambiance cachée).
import './setup-env.mjs';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium, startWorld, newPage } from './e2e-world.mjs';

const root = process.cwd(), OUT = join(root, 'shots', 'ev-halloween');
mkdirSync(OUT, { recursive: true });
execSync('node build.mjs', { stdio: 'inherit' });
const free = p => new Promise(r => { const s = createServer().once('error', () => r(false)).listen(p, '127.0.0.1', () => s.close(() => r(true))); });
let port = 0; for (let p = 19900; p <= 19909 && !port; p++) if (await free(p)) port = p;
if (!port) { console.error('Aucun port libre entre 19900 et 19909'); process.exit(1); }
const world = await startWorld({ port });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const evart = readFileSync(join(root, 'src', 'evart.js'), 'utf8');
const fails = [];
const check = (ok, m) => { console.log((ok ? '✓ ' : '✗ ') + m); if (!ok) fails.push(m); };

/** Pose ce que fera le moteur, puis place les chauves-souris en plein vol (instants choisis) et fige tout pour une capture stable. */
async function dress(p, { bats = true } = {}) {
  if (!(await p.evaluate(() => typeof EV_ART !== 'undefined'))) await p.addScriptTag({ content: evart });
  await p.waitForFunction(() => !document.querySelector('#splash') || getComputedStyle(document.querySelector('#splash')).visibility === 'hidden', null, { timeout: 12000 }).catch(() => {});
  await p.evaluate(() => {
    const de = document.documentElement; de.dataset.event = 'halloween'; de.classList.add('ev-deco');
    if (!document.querySelector('.ev-amb')) { const a = document.createElement('div'); a.className = 'ev-amb'; a.setAttribute('aria-hidden', 'true'); a.innerHTML = EV_AMB.halloween(); document.body.appendChild(a); }
    const home = document.querySelector('#viewHome'); if (getComputedStyle(home).position === 'static') home.style.position = 'relative';
    [['left:18px;top:232px'], ['right:34px;top:326px'], ['right:22px;top:600px']].forEach(([pos]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'evshot-pk'; b.setAttribute('aria-label', 'Une citrouille cachée : touche-la pour la récolter');
      b.style.cssText = `position:absolute;${pos};z-index:5;width:28px;height:28px;padding:0;border:0;background:none`;
      b.innerHTML = EV_ART.pumpkin(); b.firstChild.style.cssText = 'width:28px;height:28px'; home.appendChild(b);
    });
  });
  await p.waitForTimeout(400);
  await p.evaluate(on => {
    const at = { 'eva-b1': .07, 'eva-b2': .055, 'eva-b3': .5, 'eva-b4': .172 };      // b3 : entre deux passages
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.target, k = t && Object.keys(at).find(c => t.classList && t.classList.contains(c)), tm = a.effect.getTiming();
      if (k) a.currentTime = on ? tm.delay + at[k] * tm.duration : 0;
      else if (t && t.closest && t.closest(".ev-amb, .evo")) a.currentTime = 0;      // ailes ouvertes, bougie au repos : capture lisible
      a.pause();
    }
  }, bats);
}
/** Propriétés animées et nombre d'éléments animés (ambiance, citrouilles). */
const audit = p => p.evaluate(() => {
  const props = new Set(), amb = new Set(), evo = new Set();
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target; if (!t || !t.closest) continue;
    const inAmb = t.closest('.ev-amb'), inEvo = t.closest('.evo'); if (!inAmb && !inEvo) continue;
    (inAmb ? amb : evo).add(t);
    for (const kf of a.effect.getKeyframes()) for (const k of Object.keys(kf)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(k)) props.add(k);
  }
  return { props: [...props], amb: amb.size, evo: evo.size };
});

const shots = [
  { name: 'accueil-393-clair', w: 393, h: 852, theme: 'light' },
  { name: 'accueil-393-sombre', w: 393, h: 852, theme: 'dark' },
  { name: 'accueil-360-clair', w: 360, h: 780, theme: 'light' },
  { name: 'accueil-360-sombre', w: 360, h: 780, theme: 'dark' },
  { name: 'accueil-1280-clair', w: 1280, h: 800, theme: 'light', desk: true },
  { name: 'accueil-1280-sombre', w: 1280, h: 800, theme: 'dark', desk: true },
];
for (const s of shots) {
  const { ctx, p, errs } = await newPage(browser, world, { ctx: { viewport: { width: s.w, height: s.h }, colorScheme: s.theme, ...(s.desk ? { isMobile: false, hasTouch: false, deviceScaleFactor: 1 } : {}) } });
  await dress(p);
  await p.screenshot({ path: join(OUT, s.name + '.png') });
  console.log('→ shots/ev-halloween/' + s.name + '.png');
  if (s.name === 'accueil-393-clair') {
    const a = await audit(p);
    check(a.props.every(k => k === 'transform' || k === 'opacity'), 'propriétés animées : ' + a.props.join(', '));
    check(a.amb > 0 && a.amb <= 12, 'éléments animés de l\'ambiance : ' + a.amb + ' (≤ 12) ; citrouilles : ' + a.evo + ' (1 par citrouille)');
    const ptr = await p.evaluate(() => [...document.querySelectorAll('.ev-amb, .ev-amb *')].every(e => getComputedStyle(e).pointerEvents === 'none'));
    check(ptr, 'ambiance : aucun toucher capté (pointer-events: none)');
    await p.evaluate(() => document.documentElement.classList.add('ev-quiet'));
    check(await p.evaluate(() => getComputedStyle(document.querySelector('.ev-amb')).display === 'none'), '.ev-quiet : ambiance cachée');
    await p.evaluate(() => { document.documentElement.classList.remove('ev-quiet'); document.documentElement.classList.add('ev-pause'); document.getAnimations().forEach(a => a.play()); });
    check(await p.evaluate(() => [...document.querySelectorAll('.ev-amb *, .evo *')].filter(e => getComputedStyle(e).animationName !== 'none').every(e => getComputedStyle(e).animationPlayState === 'paused')), '.ev-pause : animations en pause');
    await p.evaluate(() => document.documentElement.classList.remove('ev-pause'));
    // une section plein format : seulement le filet de lueur sous l'en-tête (l'ambiance reste derrière)
    await p.evaluate(() => { const b = document.querySelector('.nav-b[data-nav="coll"]'); if (b) b.click(); });
    await p.waitForTimeout(900); await p.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    await p.screenshot({ path: join(OUT, 'section-393-clair.png') }); console.log('→ shots/ev-halloween/section-393-clair.png');
  }
  if (s.name === 'accueil-393-sombre') {
    await p.evaluate(() => { const b = document.querySelector('.nav-b[data-nav="coll"]'); if (b) b.click(); });
    await p.waitForTimeout(900); await p.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    await p.screenshot({ path: join(OUT, 'section-393-sombre.png') }); console.log('→ shots/ev-halloween/section-393-sombre.png');
  }
  if (errs.length) check(false, s.name + ' : ' + errs.join(' | '));
  await ctx.close();
}

// « Réduire les animations » : rien ne bouge, chauves-souris absentes, citrouilles toujours là
{
  const { ctx, p } = await newPage(browser, world, { ctx: { reducedMotion: 'reduce', viewport: { width: 393, height: 852 } } });
  await dress(p, { bats: false });
  const r = await p.evaluate(() => ({
    moving: [...document.querySelectorAll('.ev-amb *, .evo *')].filter(e => getComputedStyle(e).animationName !== 'none').length,
    bats: [...document.querySelectorAll('.eva-bat')].filter(e => getComputedStyle(e).display !== 'none').length,
    pk: [...document.querySelectorAll('.evshot-pk .evo-pumpkin')].filter(e => e.getBoundingClientRect().width >= 26).length,
  }));
  check(r.moving === 0 && r.bats === 0 && r.pk === 3, `mouvement réduit : ${r.moving} animation(s), ${r.bats} chauve(s)-souris, ${r.pk} citrouilles visibles`);
  await p.screenshot({ path: join(OUT, 'accueil-393-reduit.png') }); console.log('→ shots/ev-halloween/accueil-393-reduit.png');
  await ctx.close();
}

// planche des dessins : citrouille 160 px (normale, allumée), à 28 px sur les fonds de l'appli, chauve-souris, lune, compteur
for (const theme of ['light', 'dark']) {
  const { ctx, p } = await newPage(browser, world, { ctx: { viewport: { width: 760, height: 560 }, colorScheme: theme, isMobile: false, hasTouch: false } });
  await dress(p, { bats: false });
  await p.evaluate(() => {
    const d = document.createElement('div'); d.id = 'evboard';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;grid-template-columns:200px 200px 1fr;gap:18px;align-content:start;padding:24px;background:var(--bg);color:var(--ink);font:600 13px/1.3 var(--font-body)';
    const cell = (html, cap, st = '') => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;${st}">${html}<small style="color:var(--ink-3)">${cap}</small></div>`;
    const sized = (svg, w, h = w) => svg.replace('<svg ', `<svg style="width:${w}px;height:${h}px" `);
    const row28 = [28, 28, 28].map(() => sized(EV_ART.pumpkin(), 28)).join('');
    d.innerHTML = cell(sized(EV_ART.pumpkin(), 160), 'citrouille · 160 px') + cell(sized(EV_ART.pumpkin({ lit: true }), 160), 'allumée (célébration) · 160 px')
      + `<div style="display:flex;flex-direction:column;gap:14px">`
      + `<div style="display:flex;gap:14px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow)">${row28}<span>28 px sur une carte</span></div>`
      + `<div style="display:flex;gap:14px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--surface-2)">${sized(EV_ART.pumpkin(), 26)}${sized(EV_ART.pumpkin(), 30)}<span>26 et 30 px</span></div>`
      + `<div style="display:inline-flex;gap:8px;align-items:center;align-self:flex-start;padding:8px 14px 8px 10px;border-radius:99px;background:var(--surface);box-shadow:var(--shadow);font:800 17px var(--font-display)">${sized(EV_ART.counter(), 22)}<span>12 / 30</span></div>`
      + `<div style="display:inline-flex;gap:8px;align-items:center;align-self:flex-start;padding:6px 12px 6px 8px;border-radius:99px;background:var(--surface-2);font:700 13px var(--font-body)">${sized(EV_ART.counter(), 16)}<span>3 / 5 aujourd'hui</span></div>`
      + `</div>`
      + cell(sized(EV_ART.bat(), 120, 60), 'chauve-souris (messages)') + cell(sized(EV_ART.moon(), 110), 'lune')
      + cell(sized(EV_ART.counter(), 96), 'compteur · 96 px');
    document.body.appendChild(d);
  });
  await p.waitForTimeout(200); await p.evaluate(() => document.getAnimations().forEach(a => { a.currentTime = 0; a.pause(); }));
  const f = `dessins-${theme === 'light' ? 'clair' : 'sombre'}.png`;
  await p.screenshot({ path: join(OUT, f) }); console.log('→ shots/ev-halloween/' + f);
  await ctx.close();
}

await browser.close(); world.stop();
if (fails.length) { console.error(fails.length + ' contrôle(s) en échec'); process.exit(1); }
console.log('Captures dans shots/ev-halloween/');
process.exit(0);
