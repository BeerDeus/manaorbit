// Budget de performance, CPU ×4 (≈ téléphone Android moyen) : collection de 5 000 cartes. Aucun port : page en file://, faux Scryfall par routes Playwright.
// Mesures du 9 oct. 2026 (avant → après) : ouverture 1 530 → 375 ms ; « Afficher plus » 1 070 → 85 ms, 1 830 → 130 ms à 1 200 lignes ;
// lecture des infos Scryfall, liste ouverte, 15 premières s : ~790 → ~2 000 cartes lues, tâches longues ~65 % → ~8 % du temps.
// 20 oct. 2026 : tâches longues revenues à ~4,1 – 5,6 s (accueil caché repeint à chaque lot, liste d'échange recalculée, localeCompare(…, 'en'), Intl.NumberFormat
// recréé à chaque image du chiffre de l'orbe, comptes de l'en-tête faits même pendant la lecture) → ~2,2 – 2,5 s.
// 31 oct. 2026 : relevé des prix du jour (67 lots) et images dans la langue des cartes : chaque lot repeignait l'accueil (liste d'échange refaite et triée) ;
// 15 premières s après le lancement, temps processeur du fil principal : JS (FunctionCall) 1 550 → 430 ms, minuteries 1 630 → 470 ms ; fermer la collection 726 → 89 ms.
// 31 oct. 2026, panneau des filtres : 1re ouverture, style et mise en page 120 – 190 → ~30 ms (préchauffage au repos, symboles de mana compris), jusqu'à l'image
// ~170 – 290 → ~80 ms ; retirer le dernier filtre ~180 – 260 → ~90 ms (20 000 cartes : ~500 → ~140 ms : liste triée gardée) ; ~50 flous retirés du panneau.
// Budgets avec ~3× de marge (CI plus lente) : ils attrapent un retour en arrière grossier (tri sans collator, liste repeinte à chaque lot), pas une variation.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium } from './e2e-world.mjs';

const N = 5000, CPU = 4, URL0 = 'file://' + process.cwd() + '/deck-deal.html';
const PLUS_MAX = 450;      // « + » d'une carte (mesuré ~115 – 165 ms, CPU ×4)
const A = ['Æther', 'Élan', 'elan', 'Bol', 'Cra', 'Dre', 'Écume', 'Fyr', 'Gor', 'Hal', 'Ith', 'Jun', 'Kor', 'Lum', 'Mor', 'Nex', 'Œil', 'Pyr', 'Qua', 'Rav', 'Sol', 'Tir', 'Umb', 'Vex', 'Wyr', 'Zéphyr'];
const names = Array.from({ length: N }, (_, i) => `${A[i % 26]}${A[(i * 7 + 3) % 26].toLowerCase()} ${i % 97} of ${A[(i * 11) % 26]}${A[(i * 5 + 1) % 26].toLowerCase()} ${i}`);
const LANGS = ['FR', 'EN', 'DE', '', 'FR', 'IT'];
const text = names.map((n, i) => `${1 + (i % 3)} ${n}${LANGS[i % 6] ? ' *' + LANGS[i % 6] + '*' : ''}`).join('\n');
const seed = `try { localStorage.setItem('deckdeal:lang', 'fr'); localStorage.setItem('deckdeal:onboard', '1');
  if (!localStorage.getItem('__perf')) { localStorage.setItem('__perf', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(text)}, u: 1, s: '', b: null })); } } catch (e) {}
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}`;
const ok = m => console.log('✓', m);

const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'fr-FR' });
  const errs = [];
  await ctx.route(/^https?:\/\//, route => {      // faux Scryfall : infos de chaque carte demandée ; images factices ; tout le reste coupé
    const r = route.request(), u = new URL(r.url()), h = { 'access-control-allow-origin': '*' };
    if (u.hostname === 'cards.scryfall.io') return route.fulfill({ status: 200, headers: h, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"/>' });
    if (u.hostname !== 'api.scryfall.com') return route.abort();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
    if (u.pathname === '/cards/collection') {
      const ids = JSON.parse(r.postData() || '{}').identifiers || [];
      return route.fulfill({ status: 200, headers: h, json: { object: 'list', not_found: [], data: ids.map((x, i) => ({ object: 'card', name: x.name, lang: 'en', cmc: i % 7, type_line: i % 4 ? 'Creature — Elf' : 'Instant', mana_cost: '{1}{U}', colors: ['U'], color_identity: ['U'], legalities: { commander: 'legal' }, prices: { eur: (1 + i % 40).toFixed(2) }, image_uris: { small: `https://cards.scryfall.io/small/front/x/${i}.jpg` } })) } });
    }
    return route.fulfill({ status: 404, headers: h, json: { object: 'error', code: 'not_found' } });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(seed); await p.goto(URL0); await p.waitForTimeout(800);
  return { ctx, p, errs, cpu: async () => { const c = await ctx.newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); } };
}
const timed = (p, src) => p.evaluate(async s => { const t = performance.now(); await (0, eval)(s)(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); }, src);

/* ── 1) ouverture et « Afficher plus », infos des cartes déjà sur l'appareil ───────────────────── */
{
  const { ctx, p, errs, cpu } = await page();
  await p.evaluate(async () => { const meta = {}; let i = 0; for (const k of Object.keys(COLL.map)) { i++; meta[k] = { cm: i % 7, mc: '{1}{U}', tl: i % 4 ? 'Creature — Elf' : 'Instant', cl: 'U', ci: 'U', cd: 0, im: '', eu: 10 + (i * 37) % 4000, ar: 'X' }; } await Cache.set('coll:meta', meta); await new Promise(r => setTimeout(r, 1200)); });
  await p.goto(URL0); await p.waitForTimeout(2500); await cpu();
  const open = await timed(p, '() => openCollection("list")'); await p.waitForTimeout(800);
  const more = []; for (let i = 0; i < 3; i++) { more.push(await timed(p, '() => document.querySelector(".coll-more").click()')); await p.waitForTimeout(100); }
  await p.evaluate(() => { COLL.shown = 1200; collPaintBody(true); }); await p.waitForTimeout(800);
  const more1200 = await timed(p, '() => document.querySelector(".coll-more").click()');
  console.log(JSON.stringify({ open, more, more1200, rows: await p.$$eval('.coll-list .crow', r => r.length) }));
  assert.ok(open < 1200, `ouverture de la collection : ${open} ms (budget 1 200)`);
  assert.ok(Math.max(...more) < 400, `« Afficher plus » : ${more.join(', ')} ms (budget 400)`);
  assert.ok(more1200 < 500, `« Afficher plus » à 1 200 lignes : ${more1200} ms (budget 500)`);
  await p.evaluate(() => { COLL.shown = COLL_PAGE; collPaintBody(true); }); await p.waitForTimeout(400);
  // « + » d'une ligne (vue détaillée ; collBump → collChanged) : un enregistrement sur l'appareil, sans refaire le texte de la base (collection déjà synchronisée :
  // base = la collection), valeur de la collection calculée une fois pour l'en-tête et l'accueil (collValue, COLL.seq). 6 nov. 2026, CPU ×4 : ~160 → ~125 ms.
  await p.evaluate(() => { CVW.v = 'detail'; COLL.base = collDocClone(collDocNow()); COLL.s = 'perf'; collPaintBody(true); }); await p.waitForTimeout(600);
  const plus = []; for (let i = 0; i < 4; i++) { plus.push(await timed(p, `() => document.querySelector('.coll-list .crow .qstep button[data-d="1"]').click()`)); await p.waitForTimeout(300); }
  const plusQ = await p.evaluate(() => { const r = document.querySelector('.coll-list .crow'); return { q: COLL.map[r.dataset.k].q, disk: JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t.length > 0 }; });
  console.log(JSON.stringify({ plus, plusQ }));
  assert.ok(plusQ.q >= 5 && plusQ.disk, `« + » : 4 exemplaires ajoutés et enregistrés (${JSON.stringify(plusQ)})`);
  assert.ok(Math.max(...plus) < PLUS_MAX, `« + » d'une carte : ${plus.join(', ')} ms (budget ${PLUS_MAX})`);
  await p.evaluate(() => { CVW.v = 'compact'; COLL.base = null; COLL.s = ''; collPaintBody(true); }); await p.waitForTimeout(400);
  // panneau des filtres (filters.js) : 1re ouverture (style et mise en page préparés au repos : fltWarmSoon ; symboles de mana en SVG), pastilles (liste triée gardée : collSortIn), fermeture
  const fopen = await p.evaluate(() => new Promise(res => { const b = document.querySelector('.coll .fbtn'), t0 = performance.now(); b.click(); document.body.offsetHeight; const t1 = performance.now();
    requestAnimationFrame(() => setTimeout(() => res({ sync: Math.round(t1 - t0), frame: Math.round(performance.now() - t0), open: !document.querySelector('.coll .fpanel').hidden }), 0)); }));
  await p.waitForTimeout(400);
  const fchg = []; for (const s of ['.fpanel .fcol[data-c="U"]', '.fpanel [data-t="Créatures"]', '.fpanel [data-t="Créatures"]', '.fpanel .fcol[data-c="U"]']) { fchg.push(await timed(p, `() => document.querySelector('${s}').click()`)); await p.waitForTimeout(150); }
  const fclose = await timed(p, '() => document.querySelector(".coll .fbtn").click()'); await p.waitForTimeout(200);
  const fst = await p.evaluate(() => ({ shut: document.querySelector('.coll .fpanel').hidden, act: filterActive(COLL.f), rows: document.querySelectorAll('.coll-list .crow').length, page: COLL_PAGE }));
  console.log(JSON.stringify({ fopen, fchg, fclose, fst }));
  assert.ok(fopen.open && fst.shut && !fst.act && fst.rows === fst.page, `panneau des filtres ouvert puis fermé, aucun filtre resté : ${JSON.stringify({ fopen, fst })}`);
  assert.ok(fopen.sync < 100, `1re ouverture des filtres, style et mise en page : ${fopen.sync} ms (budget 100 ; ~120 – 200 sans le préchauffage)`);
  assert.ok(fopen.frame < 500, `1re ouverture des filtres, jusqu'à l'image : ${fopen.frame} ms (budget 500)`);
  assert.ok(Math.max(...fchg) < 700, `pastilles des filtres : ${fchg.join(', ')} ms (budget 700)`);
  assert.ok(fclose < 300, `fermeture des filtres : ${fclose} ms (budget 300)`);
  // recherche avancée (search.js) : lignes préparées une fois, puis chaque frappe ne refait que le filtre et le tri
  const adv = await timed(p, '() => { COLL.f.lang.add("fr"); COLL.f.px = "1-5"; COLL.f.dup = true; COLL.fb.fire(); }'); await p.waitForTimeout(200);
  const typed = []; for (const q of ['e', 'el', 'ela']) { typed.push(await timed(p, `() => { COLL.f.q = "${q}"; COLL.fb.fire(); }`)); await p.waitForTimeout(100); }
  const advRows = await p.$$eval('.coll-list .crow', r => r.length);
  console.log(JSON.stringify({ adv, typed, advRows }));
  assert.ok(advRows > 0, 'filtres avancés : des cartes restent');
  assert.ok(adv < 1200, `filtres avancés, 1re fois : ${adv} ms (budget 1 200)`);
  assert.ok(Math.max(...typed) < 600, `frappe avec filtres avancés : ${typed.join(', ')} ms (budget 600)`);
  assert.deepEqual(errs, []); await ctx.close();
  ok('5 000 cartes : ouverture, « Afficher plus » et recherche avancée dans le budget');
}

/* ── 2) première lecture des infos Scryfall, liste ouverte ─────────────────────────────────────── */
{
  const { ctx, p, errs, cpu } = await page();
  await cpu();
  await p.evaluate(() => { window.__lt.length = 0; openCollection('list'); });
  await p.waitForTimeout(15000);
  const r = await p.evaluate(() => ({ read: Object.keys(COLL.meta).length, lt: Math.round(window.__lt.reduce((a, b) => a + b, 0)), ltMax: Math.round(Math.max(0, ...window.__lt)) }));
  console.log(JSON.stringify(r));
  assert.ok(r.read >= 1200, `cartes lues en 15 s : ${r.read} (budget ≥ 1 200 ; le rendu ne doit pas freiner la lecture)`);
  assert.ok(r.lt < 4500, `tâches longues pendant la lecture : ${r.lt} ms sur 15 s (budget 4 500)`);
  assert.deepEqual(errs, []); await ctx.close();
  ok('lecture des infos : l\'écran reste fluide et la lecture avance au rythme de Scryfall');
}
await browser.close();
console.log('\nPERF E2E OK'); process.exit(0);
