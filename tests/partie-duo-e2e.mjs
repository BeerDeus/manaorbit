// E2E compteur de vie, grande table sur deux téléphones (écran scindé) : vrai proxy.mjs (/api/partie), faux Firebase (amis-fakes), trois navigateurs.
// · Préparation : « Répartir sur 2 téléphones » proposé dès 5 joueurs ; répartition automatique (moitié haute de la table pour l'écran 2), ajustée place par place,
//   « Répartition automatique » ; un 2e téléphone scanne le QR code de la table et touche « Devenir l'écran 2 » (attente : les places qu'il montre), « Écran 2 connecté ».
// · Partie : chaque écran montre SA moitié en affichage A (tuiles tournées : 90° à gauche, 270° à droite), bouton rond sur une jointure (jamais sur un nom ni des PV,
//   boîtes englobantes, 390 et 360 px) ; saisie depuis l'écran 2 (−1, maintenu −10, fiche : blessures de commandant) vue par l'hôte, et l'inverse ; « Tour suivant »
//   (menu) et « Fin du tour » depuis l'écran 2 ; bascule « Ma moitié · L'autre moitié · Toute la table » sur chaque écran (pastille pour revenir) ; saisie coupée par
//   l'hôte : l'écran 2 compte toujours ; écran 2 hors ligne (sans planter, saisies envoyées au retour) ; arrêté par l'hôte : « Écran 2 arrêté ».
// · Table en direct d'un téléphone qui a rejoint : illustration du commandant en fond (art_crop, invité qui a tapé son commandant compris), clair et sombre.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, signInFake, toHome } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19335, env: { ...F.env, ALERTS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const txt = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const closeSheets = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
const IMG = n => `https://cards.scryfall.io/normal/front/a/b/${n}.jpg`;
async function login(p, uid, name) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name });
  await p.evaluate(n => { PROF.name = n; profStore(); }, name);
}
async function page(o = {}) { const x = await newPage(browser, world, { ctx: o.ctx }); await x.p.route('https://www.gstatic.com/**', r => r.abort()); return x; }
const launch = (X, code) => X.p.evaluate(c => { history.replaceState(null, '', '?table=' + c); handleLaunch(); }, code);
const hostLife = pos => A.p.evaluate(n => PU.st.places.find(p => p.pos === n).vie, pos);
const tiles = X => X.p.$$eval('.pu-t', t => t.map(x => Number(x.dataset.pos)).sort((a, b) => a - b));
const scrLife = (pos) => E.p.$eval(`.pu-t[data-pos="${pos}"] .pu-life`, e => e.firstChild.textContent.trim());
/** Bouton rond « … / Tour » : sur aucun nom, aucuns PV, aucun signe − / + ; les noms ne touchent pas les pastilles du haut. */
async function midFree(X, what) {
  const r = await X.p.evaluate(() => {
    const box = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }, hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const mid = box(document.querySelector('.pu-mid')), pills = [...document.querySelectorAll('.pu-pills > *')].map(box), out = [];
    for (const e of document.querySelectorAll('.pu-nm, .pu-life, .pu-hit > span, .pu-turn')) { const b = box(e); if (hit(b, mid)) out.push('rond : ' + e.className + ' ' + e.closest('.pu-t').dataset.pos); for (const p of pills) if (hit(b, p)) out.push('pastille : ' + e.className + ' ' + e.closest('.pu-t').dataset.pos); }
    return out;
  });
  assert.deepEqual(r, [], what);
}

/* ── Alice ouvre la table : 6 joueurs (Bob avec son téléphone, invité qui a tapé son commandant ; 4 invités sans téléphone) ─────────────── */
const A = await page();
await login(A.p, 'uid-alice-duo-e2e', 'Alice');
await A.p.waitForFunction(() => CTX.partie === true, null, { timeout: 8000 });
await toHome(A.p); await A.p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await A.p.waitForSelector('.pu.on .pu-qr-img svg', { timeout: 10000 });
await A.p.waitForFunction(() => PU.view && PU.view.st === 'wait', null, { timeout: 10000 });
const code = await A.p.evaluate(() => partieRoom().c);
await A.p.evaluate(async im => { PU.st = partieSetPlace(PU.st, 1, { deck: { nom: 'Atraxa', commandant: 'Atraxa, Praetors\' Voice', image: im } }); partieSave(PU.st); await partieRoomOp('me', { deck: PU.st.places[0].deck }); }, IMG('atraxa'));
const B = await page();
await launch(B, code); await B.p.waitForSelector('.pu-join.on [data-j="guest"]', { timeout: 10000 });
assert.equal(!!(await B.p.$('[data-j="ecran"]')), false, 'pas d\'écran 2 tant que l\'hôte ne l\'a pas ouvert');
await B.p.click('[data-j="guest"]'); await B.p.fill('#puJn', 'Bob'); await B.p.fill('#puJc', 'Edgar Markov');
await B.p.click('[data-seat="2"]'); await B.p.click('[data-j="go"]'); await B.p.waitForSelector('.pu-wait', { timeout: 10000 });
for (const [pos, n] of [[3, 'Carol'], [4, 'Dan']]) await A.p.evaluate(async ({ pos, n, im }) => { const v = await partieRoomOp('add', { pos, n, deck: { commandant: n + ' Cmd', image: im } }); PU.view = v; puSet(puFromRoom(PU.st, v)); }, { pos, n, im: IMG('c' + pos) });
await A.p.waitForFunction(() => PU.st.places.length === 4, null, { timeout: 10000 });
assert.equal(!!(await A.p.$('#puDuo')), false, 'moins de 5 joueurs : pas proposé');
for (const [pos, n] of [[5, 'Eve'], [6, 'Fred']]) await A.p.evaluate(async ({ pos, n, im }) => { const v = await partieRoomOp('add', { pos, n, deck: { commandant: n + ' Cmd', image: im } }); PU.view = v; puSet(puFromRoom(PU.st, v)); }, { pos, n, im: IMG('c' + pos) });
await A.p.waitForSelector('#puDuo'); assert.match(await txt(A.p, '.pu-duo'), /Répartir sur 2 téléphones/);
await A.p.click('label[for="puDuo"]');
await A.p.waitForFunction(() => PU.view.duo && PU.view.duo.b.join() === '2,3,4', null, { timeout: 8000 });
assert.deepEqual(await A.p.$$eval('.pu-dm.s2', b => b.map(x => Number(x.dataset.pos))), [3, 4, 2], 'moitié haute de la table (affichage A : rangées du haut) pour l\'écran 2');
assert.match(await txt(A.p, '.pu-duo-st'), /scanne le QR code de la table et touche « Devenir l'écran 2 »/);
ok('préparation : « Répartir sur 2 téléphones » dès 5 joueurs, répartition automatique (moitié haute pour l\'écran 2)');

/* ── L'écran 2 scanne le QR code de la table ; l'hôte ajuste la répartition ──────────────────────────────────────────────────────── */
const E = await page();
await launch(E, code); await E.p.waitForSelector('.pu-join.on [data-j="ecran"]', { timeout: 10000 });
await E.p.click('[data-j="ecran"]'); await E.p.waitForSelector('.pu-join.pu-scr.pu-game .pu-scr-wait', { timeout: 10000 });
assert.equal(await E.p.evaluate(() => partieRoom().ecran), true); assert.match(await txt(E.p, '.pu-scr-who'), /Cet écran montre : Bob, Carol, Dan/);
await A.p.waitForFunction(() => PU.on.includes(0) && /Écran 2 connecté/.test(document.querySelector('.pu-duo-st').textContent), null, { timeout: 10000 });
const X2 = await page(); await launch(X2, code); await X2.p.waitForSelector('.pu-join.on [data-j="ecran"]', { timeout: 10000 });
assert.equal(await X2.p.$eval('[data-j="ecran"]', b => b.disabled), true, 'écran 2 déjà là'); assert.match(await txt(X2.p, '[data-j="ecran"]'), /déjà là/); await X2.ctx.close();
await A.p.click('.pu-dm[data-pos="5"]'); await A.p.waitForFunction(() => PU.view.duo.b.join() === '2,3,4,5', null, { timeout: 8000 });
await E.p.waitForFunction(() => /Bob, Carol, Dan, Eve/.test(document.querySelector('.pu-scr-who').textContent), null, { timeout: 10000 });
for (const p of [2, 3, 4]) await A.p.click(`.pu-dm[data-pos="${p}"]`);
await A.p.waitForFunction(() => PU.view.duo.b.join() === '5', null, { timeout: 8000 });
await A.p.click('.pu-dm[data-pos="5"]'); assert.equal(await A.p.evaluate(() => PU.view.duo.b.join()), '5', 'au moins une place sur chaque écran');
await A.p.click('[data-pu="duo-auto"]'); await A.p.waitForFunction(() => PU.view.duo.b.join() === '2,3,4', null, { timeout: 8000 });
ok('écran 2 : « Devenir l\'écran 2 » (attente : ses places), « Écran 2 connecté » chez l\'hôte, un seul écran 2 ; répartition ajustée (au moins une place par écran), automatique');

/* ── Partie lancée : chaque écran sa moitié, tuiles tournées, bouton rond sur une jointure ────────────────────────────────────────── */
await A.p.evaluate(() => { puSet(partieFirst(PU.st, 1)); localStorage.setItem('deckdeal:partie:aff', 'A'); });
await A.p.click('[data-pu="start"]'); await A.p.waitForSelector('.pu.pu-game .pu-a.pu-h2', { timeout: 10000 });
await E.p.waitForSelector('.pu-join.pu-scr .pu-a.pu-h2 .pu-t', { timeout: 20000 });
assert.deepEqual(await tiles(A), [1, 5, 6], 'hôte : sa moitié'); assert.deepEqual(await tiles(E), [2, 3, 4], 'écran 2 : la sienne');
assert.deepEqual(await E.p.$$eval('.pu-t', t => t.map(x => x.dataset.pos + ':' + x.style.getPropertyValue('--r'))).then(a => a.sort()), ['2:90deg', '3:90deg', '4:270deg'], 'tournées vers les joueurs de ce côté');
assert.equal(await E.p.evaluate(() => !!document.querySelector('.pu-join.pu-game') && getComputedStyle(document.querySelector('.pu-join')).backgroundColor), 'rgb(5, 7, 15)', 'plein écran sombre');
assert.equal(await E.p.evaluate(() => typeof adsBusy === 'function' ? adsBusy() : true), true, 'pas de pub');
for (const w of [390, 360]) {
  for (const X of [A, E]) { await X.p.setViewportSize({ width: w, height: w === 360 ? 740 : 844 }); await X.p.waitForTimeout(250); await midFree(X, `${X === A ? 'hôte' : 'écran 2'} ${w} px`); }
}
await A.p.screenshot({ path: 'shots/partie-duo-1-hote.png' }); await E.p.screenshot({ path: 'shots/partie-duo-2-ecran2.png' });
// paysage : chaque moitié tournée d'un quart de tour, sur chaque écran (bouton rond toujours sur une jointure)
for (const X of [A, E]) {
  await X.p.setViewportSize({ width: 844, height: 390 }); await X.p.waitForFunction(() => document.querySelector('.pu-a.pu-h2.land'), null, { timeout: 5000 }); await midFree(X, (X === A ? 'hôte' : 'écran 2') + ' en paysage');
  const pv = await X.p.$$eval('.pu-t .pu-life', b => Math.min(...b.map(x => parseFloat(getComputedStyle(x).fontSize)))); assert.ok(pv >= 60, 'paysage : PV lisibles (' + pv + ')');
}
await E.p.screenshot({ path: 'shots/partie-duo-2b-ecran2-paysage.png' });
for (const X of [A, E]) { await X.p.setViewportSize({ width: 390, height: 844 }); await X.p.waitForFunction(() => !document.querySelector('.pu-a.land'), null, { timeout: 5000 }); }
ok('partie lancée : l\'hôte et l\'écran 2 montrent chacun leur moitié, tuiles tournées, plein écran sombre sans pub, bouton rond sur une jointure (390 et 360 px)');

/* ── Saisie depuis l'écran 2 vue par l'hôte, et l'inverse ; maintenu −10 ; fiche ─────────────────────────────────────────────────── */
await E.p.click('.pu-t[data-pos="3"] .pu-hit.m'); await E.p.click('.pu-t[data-pos="3"] .pu-hit.m');
assert.equal(await scrLife(3), '38', 'affiché tout de suite'); assert.equal(await E.p.$eval('.pu-t[data-pos="3"] .pu-dl', e => e.textContent), '-2', 'écart en exposant');
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 3).vie === 38, null, { timeout: 15000 });
assert.equal(await A.p.evaluate(() => PU.st.journal.filter(e => e.a === 'v' && e.p === 3).reduce((a, e) => a + e.n, 0)), -2, 'appliqué une fois, dans le journal');
await A.p.evaluate(() => puLife(2, -1));
await E.p.waitForFunction(() => document.querySelector('.pu-t[data-pos="2"] .pu-life').firstChild.textContent.trim() === '39', null, { timeout: 15000 });
const hb = await (await E.p.$('.pu-t[data-pos="4"] .pu-hit.m')).boundingBox();
await E.p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await E.p.mouse.down(); await E.p.waitForTimeout(700); await E.p.mouse.up();
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 4).vie === 30, null, { timeout: 15000 });
await E.p.click('.pu-t[data-pos="3"] .pu-nm'); await E.p.waitForSelector('.pu-lvsheet [data-k="b"][data-s="1"][data-n="1"]');
assert.equal(await E.p.evaluate(() => { const w = sheets[sheets.length - 1].wrap; return w.classList.contains('pu-tsheet') && w.querySelector('.sheet').style.getPropertyValue('--r'); }), '90deg', 'écran 2 : fiche sur la tuile du joueur, tournée vers lui');
await E.p.click('.pu-lvsheet [data-k="b"][data-s="1"][data-n="1"]'); await closeSheets(E.p);
await A.p.waitForFunction(() => { const p = PU.st.places.find(x => x.pos === 3); return p.blessures['1'] === 1 && p.vie === 37; }, null, { timeout: 15000 });
// deux joueurs qui touchent l'écran 2 presque ensemble : un appui suivi par doigt, chacun son ±1 au bon joueur (relâchés dans un ordre ou dans l'autre)
const touch = (ty, pos, d, id) => E.p.evaluate(([ty, pos, d, id]) => { document.querySelector(`.pu-t[data-pos="${pos}"] .pu-hit.${d < 0 ? 'm' : 'p'}`).dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11 })); }, [ty, pos, d, id]);
await touch('pointerdown', 2, -1, 11); await touch('pointerdown', 4, -1, 12); await touch('pointerup', 2, -1, 11); await touch('pointerup', 4, -1, 12);
assert.deepEqual([await scrLife(2), await scrLife(4)], ['38', '29'], 'deux doigts : −1 chacun');
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 2).vie === 38 && PU.st.places.find(p => p.pos === 4).vie === 29, null, { timeout: 15000 });
await touch('pointerdown', 2, 1, 11); await touch('pointerdown', 4, 1, 12); await touch('pointerup', 4, 1, 12); await touch('pointerup', 2, 1, 11);
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 2).vie === 39 && PU.st.places.find(p => p.pos === 4).vie === 30, null, { timeout: 15000 });
ok('saisie depuis l\'écran 2 (−1 ×2 : affiché tout de suite, écart « −2 » ; maintenu −10 ; fiche : blessures de commandant ; deux doigts en même temps : chacun le sien) appliquée par l\'hôte ; −1 de l\'hôte vu par l\'écran 2');

/* ── Tour suivant depuis l'écran 2 (menu du bouton rond, puis « Fin du tour » sur la tuile active) ────────────────────────────────── */
await E.p.click('.pu-mid'); await E.p.waitForSelector('.sheet [data-sm="next"]'); await E.p.click('.sheet [data-sm="next"]');
await A.p.waitForFunction(() => PU.st.actif === 2, null, { timeout: 15000 });
await E.p.waitForSelector('.pu-t.act[data-pos="2"] .pu-turn', { timeout: 15000 }); await E.p.click('.pu-t[data-pos="2"] .pu-turn');
await A.p.waitForFunction(() => PU.st.actif === 3, null, { timeout: 15000 });
ok('tour suivant depuis l\'écran 2 : menu du bouton rond, puis « Fin du tour » sur la tuile qui joue');

/* ── Bascule « Ma moitié · L'autre moitié · Toute la table » sur chaque écran ─────────────────────────────────────────────────────── */
for (const [X, mine, other] of [[E, [2, 3, 4], [1, 5, 6]], [A, [1, 5, 6], [2, 3, 4]]]) {
  await X.p.click('.pu-mid'); await X.p.waitForSelector('.sheet [data-see="other"]'); await X.p.click('.sheet [data-see="other"]');
  await X.p.waitForSelector('.pu-see'); assert.deepEqual(await tiles(X), other, 'l\'autre moitié'); assert.match(await txt(X.p, '.pu-see'), /L'autre moitié/); await midFree(X, 'l\'autre moitié');
  await X.p.click('.pu-mid'); await X.p.waitForSelector('.sheet [data-see="all"]'); await X.p.click('.sheet [data-see="all"]');
  await X.p.waitForFunction(() => document.querySelectorAll('.pu-t').length === 6); assert.match(await txt(X.p, '.pu-see'), /Toute la table/); await midFree(X, 'toute la table');
  await X.p.click('.pu-see'); await X.p.waitForFunction(n => document.querySelectorAll('.pu-t').length === n && !document.querySelector('.pu-see'), mine.length); assert.deepEqual(await tiles(X), mine, 'retour à ma moitié');
}
await E.p.click('.pu-mid'); await E.p.click('.sheet [data-see="other"]'); await E.p.waitForSelector('.pu-see');
await E.p.click('.pu-t[data-pos="5"] .pu-hit.p'); await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 5).vie === 41, null, { timeout: 15000 });
await E.p.click('.pu-see');
ok('bascule sur chaque écran : l\'autre moitié, toute la table, pastille pour revenir ; saisie sur l\'autre moitié depuis l\'écran 2');

/* ── Saisie coupée par l'hôte : l'écran 2 compte toujours (c'est le sien) ; Bob, non ──────────────────────────────────────────────── */
await A.p.evaluate(() => puSet(partieRemoteOff(PU.st, true)));
await B.p.waitForSelector('[data-j="show"]', { timeout: 20000 }); await B.p.click('[data-j="show"]');
await B.p.waitForFunction(() => /coupé la saisie/.test((document.querySelector('.pu-lv-why') || {}).textContent || ''), null, { timeout: 15000 });
await E.p.waitForTimeout(2500); await E.p.click('.pu-t[data-pos="2"] .pu-hit.p');
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 2).vie === 40, null, { timeout: 15000 });
await A.p.evaluate(() => puSet(partieRemoteOff(PU.st, false)));
ok('saisie coupée par l\'hôte : Bob en lecture, l\'écran 2 compte toujours');
// dé lancé chez l'hôte : dans chaque tuile de l'écran 2 aussi
await A.p.evaluate(() => puRoll('d6')); const d6 = await A.p.evaluate(() => String(PU.roll.v));
await E.p.waitForFunction(v => { const b = [...document.querySelectorAll('.pu-t .pu-roll b')]; return b.length && b.every(x => x.textContent === v); }, d6, { timeout: 15000 });
await E.p.click('.pu-roll'); await E.p.waitForFunction(() => !document.querySelector('.pu-roll')); await A.p.evaluate(() => { PU.roll = null; puPaint(); });
ok('dé lancé chez l\'hôte : le résultat dans chaque tuile de l\'écran 2, fermé d\'un toucher');

/* ── Table en direct de Bob : illustration du commandant en fond (deck de l'hôte, invité qui a tapé « Edgar Markov ») ────────────── */
await B.p.waitForFunction(() => document.querySelectorAll('.pu-lv.art img.pu-art').length >= 2, null, { timeout: 15000 });
const arts = await B.p.$$eval('.pu-lv', l => l.map(x => [x.dataset.lp, (x.querySelector('img.pu-art') || {}).src || ''].join(' ')));
assert.ok(arts.includes('1 https://cards.scryfall.io/art_crop/front/a/b/atraxa.jpg'), 'image du deck en art_crop : ' + arts);
assert.ok(arts.includes('2 https://cards.scryfall.io/art_crop/front/a/b/edgar-markov.jpg'), 'commandant tapé par l\'invité, lu sur Scryfall : ' + arts);
assert.equal(await B.p.$eval('.pu-lv[data-lp="1"] img.pu-art', i => i.loading), 'lazy');
await B.p.screenshot({ path: 'shots/partie-duo-3-table-direct.png' });
await B.p.emulateMedia({ colorScheme: 'dark' }); await B.p.waitForTimeout(300); await B.p.screenshot({ path: 'shots/partie-duo-4-table-direct-sombre.png' }); await B.p.emulateMedia({ colorScheme: 'light' });
assert.equal(await B.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'pas de défilement horizontal');
ok('table en direct (téléphone qui a rejoint) : illustration du commandant en fond (art_crop, chargement paresseux), clair et sombre');

/* ── Écran 2 hors ligne : sans planter, saisies envoyées au retour du réseau ─────────────────────────────────────────────────────── */
await E.p.click('.pu-t[data-pos="4"] .pu-hit.m'); await E.ctx.setOffline(true); assert.equal(await scrLife(4), '29', 'affiché tout de suite');      // envoyée 300 ms plus tard : hors ligne
await E.p.waitForSelector('.pu-scr-st', { timeout: 20000 }); assert.match(await txt(E.p, '.pu-scr-st'), /Hors ligne : l'écran 2 reprend au retour du réseau/);
assert.equal(await E.p.$$eval('.pu-hit', l => l.length), 0, 'hors ligne : en lecture'); assert.equal(await scrLife(4), '29', 'saisie gardée');
await A.p.waitForFunction(() => PU.on.includes(0) === false, null, { timeout: 25000 }); await A.p.waitForSelector('.pu-mid.warn', { timeout: 10000 });
assert.equal(await hostLife(4), 30, 'pas encore reçue');
await E.p.screenshot({ path: 'shots/partie-duo-5-ecran2-hors-ligne.png' });
await E.ctx.setOffline(false);
await A.p.waitForFunction(() => PU.st.places.find(p => p.pos === 4).vie === 29, null, { timeout: 25000 });
await E.p.waitForFunction(() => !document.querySelector('.pu-scr-st') && document.querySelector('.pu-hit'), null, { timeout: 20000 });
ok('écran 2 hors ligne : « Hors ligne », en lecture sans planter (point jaune chez l\'hôte), saisie gardée et envoyée au retour du réseau');

/* ── L'hôte arrête l'écran scindé : l'écran 2 se ferme avec la raison, l'hôte voit toute la table ─────────────────────────────────── */
await A.p.click('.pu-mid'); await A.p.waitForSelector('#puMDuo'); await A.p.click('label[for="puMDuo"]');
await E.p.waitForSelector('.pu-end', { timeout: 20000 }); assert.match(await txt(E.p, '.pu-end'), /Écran 2 arrêté ?Alice a arrêté l'écran 2/);
await A.p.waitForFunction(() => document.querySelectorAll('.pu-t').length === 6 && !document.querySelector('.pu-h2'), null, { timeout: 10000 });
assert.equal(await A.p.evaluate(() => PU.view.duo), undefined);
ok('l\'hôte arrête l\'écran scindé : « Écran 2 arrêté » sur l\'écran 2, toute la table chez l\'hôte');

const errs = [...A.errs, ...B.errs, ...E.errs].filter(e => !/gstatic|ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(e));
console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); F.stop && F.stop(); console.log('\nPARTIE DUO E2E OK'); process.exit(0);
