// E2E visite guidée et astuces (tour.js) :
// 1) nouvel utilisateur : fin du premier lancement → « Une visite de 2 min… ? » (Visiter, Plus tard), une seule fois ;
// 2) utilisateur existant : pastille « Découvre les nouveautés » une fois (cachée sous une feuille, revenue ensuite ; ✕ définitif ; expirée au lancement
//    suivant ; jamais en mode streamer ni après un lien ouvert de l'extérieur ; rien sans ?tour dans un navigateur piloté, rien de lu au démarrage) ;
//    visite de la version 1 déjà vue (ou sa pastille laissée) : la pastille revient une fois, et seulement les 4 nouvelles étapes (astuces vues gardées) ;
// 3) les 13 étapes (compte, amis, échange en direct, decks publics, Carte mystère et partie actifs) à 390 × 844 clair et 360 × 640 sombre, puis 360 × 640
//    avec la bande du haut de l'appli : halo autour du bon élément, bulle dans l'écran sans toucher la cible, dialogue nommé, focus dedans, flèches et Tab,
//    caméra jamais ouverte, pub masquée, écran de départ remis ;
// 4) étapes adaptées : déconnecté sans amis, échange en direct ni Carte mystère, collection vide (10 étapes, textes « Avec un compte », masterset sans
//    interrupteur), ordinateur (scan mobile : 14 étapes), web (installer) / Android (widgets et raccourcis, APK sans plugin ManaOrbit : raccourcis seuls) ;
// 5) Aide : « Visite guidée » en tête (16 questions), Compte et réglages › Aide et avis, Échap, Retour du téléphone, mode streamer refusé ;
// 6) astuces : classeur de l'Échange, Stats, scan (session d'ouverture, mode Auto), liste d'un autre joueur, rond de l'édition, filtre Extension, options
//    du masterset, « Ranger ces cartes… » ; une fois chacune, une à la fois, jamais pendant la visite ni en mode streamer, sans décaler la page,
//    interrupteur « Astuces » de Compte et réglages › Préférences.
// Captures des nouvelles étapes et des astuces : TOUR_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, signInFake, openMe, closeSheets } from './e2e-world.mjs';

const world = await startWorld({ port: 19360 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const errsAll = [];
const COLL3 = () => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 3 }, { k: 'craterhoof behemoth', n: 'Craterhoof Behemoth', q: 2 }, { k: 'arcane signet', n: 'Arcane Signet', q: 1 }], 'add');
const SEEN = () => { try { localStorage.setItem('deckdeal:onboard', '1'); } catch (e) { /* ignore */ } };      // premier lancement déjà passé (utilisateur existant)
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:tour') || '{}'));
const SEEN2 = () => { localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1, ver: 2 })); };      // visite de cette version déjà vue : aucune offre
const NEW = ['mystery', 'partie', 'places', 'masterset'];      // étapes de la version 2 (téléphone)
const SHOT = (p, n) => (process.env.TOUR_SHOTS ? p.screenshot({ path: `${process.env.TOUR_SHOTS}/${n}.png` }).catch(() => {}) : null);
/** Page : opts.path (?tour…), opts.init (script avant le chargement), opts.ping (drapeaux du serveur ; daily : Carte mystère, état du jour simulé), opts.vp,
 *  opts.dark, opts.desk (ordinateur : souris, pas d'écran tactile). */
async function page(o = {}) {
  const pg = await newPage(browser, world, { goto: false, ctx: { viewport: o.vp || { width: 390, height: 844 }, colorScheme: o.dark ? 'dark' : 'light', ...(o.desk ? { isMobile: false, hasTouch: false, deviceScaleFactor: 1 } : {}) } });
  errsAll.push(pg.errs);
  if (o.ping) await pg.p.route('**/__ping', async r => { const res = await r.fetch(); r.fulfill({ response: res, json: { ...(await res.json()), ...o.ping } }); });
  if (o.ping && o.ping.daily) await pg.p.route('**/api/daily?**', r => r.fulfill({ json: { on: true, day: '2026-10-19', no: 5, st: 'ready', next: Date.now() + 3600e3, now: Date.now(), steps: 10, max: 6, n: 3, ranked: true } }));
  await pg.p.addInitScript(() => { window.__gum = 0; if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__gum++; throw Object.assign(new Error('pas de caméra'), { name: 'NotFoundError' }); }; });
  for (const f of [].concat(o.init || [])) await pg.p.addInitScript(f);
  await pg.p.goto(world.url + (o.path || '')); await pg.p.waitForTimeout(700);
  return pg;
}
/** Relance l'appli avec ?tour (l'adresse est nettoyée au démarrage : un simple rechargement le perdrait). */
const relaunch = (p, path = '?tour') => p.goto(world.url + path).then(() => p.waitForTimeout(700));
const pillOn = (p, sel = '.tour-pill.on', t = 9000) => p.waitForSelector(sel, { timeout: t });
const noPill = async (p, ms, msg) => { await p.waitForTimeout(ms); assert.equal(await p.$('.tour-pill'), null, msg); };
/** Étape affichée et géométrie : halo, bulle, cibles (union), fenêtre. */
const geo = p => p.evaluate(() => {
  const s = TOUR.steps[TOUR.i], R = tourRect(s), els = tourEls(s), b = document.querySelector('.tour-b').getBoundingClientRect(), h = document.querySelector('.tour-hole').getBoundingClientRect();
  const rr = x => ({ x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width ?? x.w), h: Math.round(x.height ?? x.h) });
  return { id: s.id, i: TOUR.i, n: TOUR.steps.length, R: R && rr(R), hole: rr(h), b: rr(b), vw: innerWidth, vh: innerHeight, top: tourTopIn(),
    el: els.map(e => e.id || e.className.baseVal || e.className), title: document.querySelector('.tour-t').textContent, text: document.querySelector('.tour-x').textContent,
    act: document.activeElement && document.activeElement.dataset.tour, role: document.querySelector('.tour-b').getAttribute('role'), modal: document.querySelector('.tour-b').getAttribute('aria-modal'),
    label: document.getElementById(document.querySelector('.tour-b').getAttribute('aria-labelledby')).textContent, sr: document.querySelector('.tour-sr').textContent };
});
/** Étape affichée, halo arrivé : transition de .38 s, relancée si la cible bouge encore (écran qui finit d'entrer ; CI lente) ; pas arrivé : checkStep le dit. */
const shown = p => p.waitForFunction(() => TOUR.on && !TOUR.busy && document.querySelector('.tour-b.on'), null, { timeout: 8000 })
  .then(() => p.waitForFunction(() => { const s = TOUR.steps[TOUR.i], R = s && tourRect(s), h = document.querySelector('.tour-hole').getBoundingClientRect(); return !R || [h.x - R.x, h.y - R.y, h.width - R.w, h.height - R.h].every(d => Math.abs(d) < 1.5); }, null, { timeout: 4000 }).catch(() => {}))
  .then(() => p.waitForTimeout(450));
/** Vérifie une étape : halo autour des cibles, bulle entière dans l'écran, jamais sur la cible. */
async function checkStep(p, tag) {
  const g = await geo(p);
  const inside = (a, b, e = 2) => a.x >= b.x - e && a.y >= b.y - e && a.x + a.w <= b.x + b.w + e && a.y + a.h <= b.y + b.h + e;
  const cross = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.ok(g.b.x >= 0 && g.b.y >= g.top && g.b.x + g.b.w <= g.vw && g.b.y + g.b.h <= g.vh, `${tag} ${g.id} : bulle dans l'écran ${JSON.stringify(g.b)} (${g.vw}×${g.vh})`);
  if (g.R) {
    assert.ok(inside(g.R, g.hole), `${tag} ${g.id} : halo autour de la cible ${JSON.stringify(g.R)} ⊂ ${JSON.stringify(g.hole)}`);
    assert.ok(!cross(g.b, g.R), `${tag} ${g.id} : la bulle ne couvre pas la cible ${JSON.stringify(g.b)} / ${JSON.stringify(g.R)}`);
  }
  assert.equal(g.role, 'dialog'); assert.equal(g.modal, 'true'); assert.equal(g.label, g.title, 'dialogue nommé par son titre');
  assert.match(g.sr, new RegExp(`^Étape ${g.i + 1} sur ${g.n}\\. `), 'étape annoncée aux lecteurs d\'écran');
  return g;
}
const next = p => p.click('.tour-b [data-tour="next"]');

/* ── 1) Nouvel utilisateur : fin du premier lancement ─────────────────────────────────────────────────────────── */
{
  const { p } = await page({ path: '?onboarding&tour' });
  await p.waitForSelector('.ob.on');
  assert.equal(await p.$('.tour-pill'), null, 'rien pendant le premier lancement');
  await p.click('.ob [data-ob="skip"]');
  await pillOn(p, '.tour-pill.new.on');
  assert.match(await p.textContent('.tour-pill'), /Une visite de 2 min pour trouver l'essentiel \?/);
  assert.deepEqual(Object.keys(await st(p)).sort(), ['offer', 'shownAt', 'ver'], 'offre « new » montrée');
  // une feuille passe devant : la pastille se cache, puis revient
  await p.click('#btnAccount'); await p.waitForSelector('.me-sheet.open');
  await p.waitForFunction(() => !document.querySelector('.tour-pill'), null, { timeout: 3000 });
  await closeSheets(p); await pillOn(p, '.tour-pill.new.on');
  await p.click('.tour-pill [data-tp="go"]'); await shown(p);
  assert.equal((await geo(p)).id, 'scan', 'Visiter : la visite démarre au Scanner');
  assert.equal((await st(p)).how, 'go');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !TOUR.on && !document.querySelector('.tour'));
  const s1 = await st(p); assert.ok(s1.done && s1.skip && s1.step === 1, 'passée à la 1re étape : ' + JSON.stringify(s1));
  await relaunch(p); await noPill(p, 5500, 'jamais deux fois');
  ok('nouvel utilisateur : « Une visite de 2 min… ? » après le premier lancement (caché sous une feuille), Visiter → visite, Échap, plus jamais ensuite');
  await p.context().close();
}
{
  const { p } = await page({ path: '?onboarding&tour' });
  await p.waitForSelector('.ob.on'); await p.click('.ob [data-ob="skip"]');
  await pillOn(p, '.tour-pill.new.on'); await p.click('.tour-pill [data-tp="later"]');
  await p.waitForFunction(() => /Comment ça marche/.test(document.querySelector('#toast').textContent));
  assert.equal((await st(p)).how, 'later'); assert.equal(await p.evaluate(() => TOUR.on), false);
  await relaunch(p); await noPill(p, 5500, '« Plus tard » : plus de proposition automatique');
  ok('nouvel utilisateur : « Plus tard » → toast (la visite reste dans l\'aide), plus de proposition');
  await p.context().close();
}

/* ── 2) Utilisateur existant : pastille « Découvre les nouveautés » ─────────────────────────────────────────────── */
{
  const { p } = await page({ path: '?tour', init: SEEN });
  await p.evaluate(COLL3);
  await pillOn(p);
  assert.match(await p.textContent('.tour-pill'), /Découvre les nouveautés/);
  assert.equal(await p.$('.tour-pill.new'), null);
  const s = await st(p); assert.equal(s.offer, 'news'); assert.ok(s.shownAt); assert.equal(s.ver, 2); assert.equal(s.since, undefined, 'jamais vue : la visite complète');
  // pastille posée par-dessus : la page ne bouge pas, au-dessus de la barre du bas
  const pr = await p.evaluate(() => { const a = document.querySelector('.tour-pill').getBoundingClientRect(), n = document.querySelector('#nav').getBoundingClientRect(); return { bottom: a.bottom, nav: n.top, pos: getComputedStyle(document.querySelector('.tour-pill')).position }; });
  assert.equal(pr.pos, 'fixed'); assert.ok(pr.bottom <= pr.nav, 'au-dessus de la barre du bas');
  // un écran passe devant (Échange) : cachée, puis revient sur l'accueil
  await p.click('#nav [data-nav="trade"]'); await p.waitForFunction(() => !document.querySelector('.tour-pill'), null, { timeout: 3000 });
  await p.click('#nav [data-nav="home"]'); await pillOn(p);
  await p.click('.tour-pill [data-tp="x"]');
  await p.waitForFunction(() => !document.querySelector('.tour-pill'));
  assert.equal((await st(p)).how, 'x'); assert.equal(await p.evaluate(() => TOUR.on), false, '✕ : pas de visite');
  await relaunch(p); await noPill(p, 5500, '✕ : plus jamais');
  ok('utilisateur existant : pastille « Découvre les nouveautés » au-dessus de la barre (cachée sous un écran, revenue), ✕ définitif');
  // montrée à un lancement précédent sans réponse : expirée
  await p.evaluate(() => localStorage.setItem('deckdeal:tour', JSON.stringify({ offer: 'news', shownAt: Date.now() - 86400e3, ver: 2 })));
  await relaunch(p); await p.waitForTimeout(4200);
  assert.equal(await p.$('.tour-pill'), null); assert.equal((await st(p)).how, 'exp', 'déjà montrée : expirée, pas d\'insistance');
  ok('pastille vue à un lancement précédent sans réponse : plus montrée');
  // mode streamer : jamais
  await p.evaluate(() => { localStorage.removeItem('deckdeal:tour'); localStorage.setItem('deckdeal:opn:cur', JSON.stringify({ id: 'o1', name: 'Stream', at: Date.now(), st: true, rows: [] })); });
  await relaunch(p); await noPill(p, 6000, 'mode streamer : pas de pastille');
  assert.equal(await p.evaluate(() => streamOn()), true);
  await p.evaluate(() => { localStorage.removeItem('deckdeal:opn:cur'); localStorage.removeItem('deckdeal:tour'); });
  ok('mode streamer : aucune pastille');
  await p.context().close();
}
{ // lien ouvert de l'extérieur (?collection, ?p=…) : pas de pastille pendant cette session ; sans ?tour, un navigateur piloté ne voit rien et rien n'est lu
  const { p, errs } = await page({ path: '?collection&tour', init: SEEN });
  assert.equal(await p.evaluate(() => TOUR_EXT), true);
  await p.waitForSelector('.coll.on'); await p.click('#nav [data-nav="home"]');
  await noPill(p, 6000, 'lancé par un lien : pas de pastille');
  assert.deepEqual(await st(p), {}, 'rien d\'enregistré : la pastille viendra au prochain lancement normal');
  await p.goto(world.url); await p.waitForTimeout(4500);
  assert.equal(await p.evaluate(() => [TOUR_FORCE, tourAuto(), TOUR.st]).then(JSON.stringify), JSON.stringify([false, false, null]), 'navigateur piloté sans ?tour : état jamais lu, aucune offre');
  assert.equal(await p.$('.tour-pill'), null);
  ok('lien ouvert de l\'extérieur : pas de pastille ; navigateur de test sans ?tour : rien (état non lu au démarrage)');
  errs.splice(0, errs.length, ...errs.filter(e => !/navigator\.vibrate/.test(e)));      // ?collection : vibration demandée avant tout toucher (app.js, sans rapport avec la visite)
  await p.context().close();
}
{ // visite de la version 1 déjà vue (sans « ver ») : pastille une fois, seulement les nouvelles étapes ; astuces vues et interrupteur gardés
  const V1 = () => { if (!localStorage.getItem('deckdeal:tour')) localStorage.setItem('deckdeal:tour', JSON.stringify({ offer: 'news', shownAt: Date.now() - 864e5, done: Date.now() - 864e5, how: 'go', fin: Date.now() - 864e5, step: 9, runs: 1, tips: { bnd: 1 } })); };
  const { p } = await page({ path: '?tour', init: [SEEN, V1], ping: { daily: true, partie: true } });
  await p.evaluate(COLL3);
  await pillOn(p);
  assert.match(await p.textContent('.tour-pill'), /Découvre les nouveautés/);
  const s0 = await st(p); assert.deepEqual([s0.offer, s0.since, s0.ver, s0.done, s0.tips], ['news', 1, 2, undefined, { bnd: 1 }], 'nouvelle offre pour la version 2, astuces vues gardées : ' + JSON.stringify(s0));
  await SHOT(p, 'news-pill');
  await p.click('.tour-pill [data-tp="go"]'); await shown(p);
  assert.deepEqual(await p.evaluate(() => TOUR.steps.map(s => s.id)), NEW, 'seulement les nouvelles étapes, jamais les anciennes');
  assert.equal(await p.$$eval('.tour-dots i', d => d.length), NEW.length);
  for (let i = 0; i < NEW.length; i++) { const g = await checkStep(p, 'nouveautés'); assert.equal(g.id, NEW[i]); if (i < NEW.length - 1) { await next(p); await shown(p); } }
  await next(p); await p.waitForFunction(() => !TOUR.on && !document.querySelector('.tour'), null, { timeout: 5000 });
  const s1 = await st(p); assert.ok(s1.fin && s1.done && s1.ver === 2 && s1.how === 'go', 'nouveautés vues : ' + JSON.stringify(s1));
  await relaunch(p); await noPill(p, 5500, 'version 2 vue : plus de pastille');
  ok('visite de la version 1 déjà vue : pastille « Découvre les nouveautés » une fois, Visiter → les 4 nouvelles étapes seulement (Carte mystère, partie, rangement, masterset), puis plus rien');
  // pastille de la version 1 laissée sans réponse (montrée à un lancement précédent) : expirée, puis offerte une fois pour les nouveautés
  await p.evaluate(() => localStorage.setItem('deckdeal:tour', JSON.stringify({ offer: 'news', shownAt: Date.now() - 864e5 })));
  await relaunch(p); await pillOn(p);
  const s2 = await st(p); assert.deepEqual([s2.offer, s2.since, s2.ver], ['news', 1, 2]);
  await p.click('.tour-pill [data-tp="x"]'); await p.waitForFunction(() => !document.querySelector('.tour-pill'));
  await relaunch(p); await noPill(p, 5500, '✕ : plus jamais');
  ok('pastille de la version 1 laissée sans réponse : offerte une fois pour les nouveautés, ✕ définitif');
  await p.context().close();
}

/* ── 3) Les 13 étapes, 390 × 844 clair, 360 × 640 sombre, 360 × 640 avec la bande du haut de l'appli ─────────────────── */
const ALL = ['scan', 'opening', 'trade', 'binder', 'live', 'friends', 'mystery', 'partie', 'places', 'masterset', 'build', 'price', 'more'];
const TARGET = { scan: /nav-foil/, opening: /opn-scs/, trade: /hm-tr-acts/, binder: /^trView$/, live: /trc-entry/, friends: /^btnAccount$/, mystery: /^dlyHbs$/, partie: /^hmPartie$/,
  places: /seg-opt/, masterset: /coll-ms/, build: /dk-tab/, price: /field-head/, more: /link-btn/ };
const FLAGS = { amis: true, troc: true, pub: true, daily: true, partie: true };
for (const [vp, dark, fs] of [[{ width: 390, height: 844 }, false], [{ width: 360, height: 640 }, true], [{ width: 360, height: 640 }, false, true]]) {
  const tag = `${vp.width}×${vp.height}${dark ? ' sombre' : ''}${fs ? ' bande du haut' : ''}`;
  const { p } = await page({ vp, dark, ping: FLAGS, init: () => { localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1 })); } });
  if (fs) await p.evaluate(() => document.documentElement.classList.add('fs'));      // appli Android plein écran : bande de 24 px en haut (native.js)
  await p.evaluate(COLL3); await signInFake(p); await p.waitForTimeout(500);
  // ancrage du défilement coupé : un bloc de l'accueil qui grandit après coup (chargement en fond) décalait scrollY de quelques pixels (48 / 33), sans rapport avec la remise de la visite
  await p.addStyleTag({ content: 'html,body{overflow-anchor:none}' });
  await p.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' })); await p.waitForTimeout(100);      // sans le défilement doux de la page : y0 mesuré une fois arrivé (sinon en route, selon la charge)
  const y0 = await p.evaluate(() => window.scrollY);
  await p.evaluate(() => tourStart({ from: 'test' })); await shown(p);
  assert.deepEqual(await p.evaluate(() => TOUR.steps.map(s => s.id)), ALL, tag + ' : 13 étapes');
  const seen = [];
  for (let i = 0; i < ALL.length; i++) {
    const g = await checkStep(p, tag);
    assert.equal(g.id, ALL[i]); assert.match(g.el[0], TARGET[g.id], `${tag} ${g.id} : bonne cible (${g.el})`);
    assert.equal(g.act, 'next', `${tag} ${g.id} : focus sur « Suivant »`);
    if (g.id === 'opening') assert.equal(await p.evaluate(() => !!document.querySelector('.scs-sheet.open')), true, 'réglages du scan ouverts en feuille');
    if (g.id === 'binder') assert.match(g.text, /Personnaliser/);
    if (g.id === 'live') assert.match(g.text, /6 caractères/);
    if (g.id === 'friends') assert.match(g.text, /Ajouter en ami/);
    if (g.id === 'mystery') { assert.match(g.text, /^Une carte par jour.*Le podium ouvre les classements\..*niveau.*badges.*Niv\./); assert.equal(g.R.y >= g.top, true, 'icônes sous la bande du haut'); }
    if (g.id === 'partie') assert.match(g.text, /jusqu'à 8 joueurs.*QR code.*chez chacun/, 'connecté, serveur qui l\'annonce : le QR code de la table');
    if (g.id === 'places') { assert.match(g.text, /Ranger ces cartes….*proxys/); assert.equal(await p.evaluate(() => COLL.tab), 'places', 'onglet Rangement ouvert'); }
    if (g.id === 'masterset') { assert.match(g.text, /^Une extension à la fois.*roue crantée.*Filtres.›.Extension/); assert.equal(await p.evaluate(() => COLL.tab), 'list'); }
    if (g.id === 'build') assert.match(g.text, /Communauté/);
    if (NEW.includes(g.id)) await SHOT(p, `etape-${g.id}-${vp.width}${dark ? '-sombre' : ''}${fs ? '-bande' : ''}`);
    if (g.id === 'more') { assert.match(g.text, /Installe aussi l'appli/, 'web : installer l\'appli'); assert.equal(await p.textContent('.tour-b [data-tour="next"]'), 'Terminer'); }
    if (i === 0) assert.equal(await p.isHidden('.tour-b [data-tour="prev"]'), true, '1re étape : pas de « Précédent »');
    assert.equal(await p.evaluate(() => adsBusy()), true, 'pub masquée pendant la visite');
    seen.push(g.id);
    if (i < ALL.length - 1) { await next(p); await shown(p); }
  }
  // clavier : ← revient, → avance, Tab reste dans la bulle
  await p.keyboard.press('ArrowLeft'); await shown(p); assert.equal((await geo(p)).id, 'price');
  for (let k = 0; k < 4; k++) await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.querySelector('.tour-b').contains(document.activeElement)), true, 'Tab : le focus reste dans la bulle');
  await p.keyboard.press('ArrowRight'); await shown(p); assert.equal((await geo(p)).id, 'more');
  await next(p);      // Terminer
  await p.waitForFunction(() => !TOUR.on && !document.querySelector('.tour'), null, { timeout: 5000 }); await p.waitForTimeout(500);
  await p.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, y0, { timeout: 3000 }).catch(() => {});      // défilement doux encore en cours (CI lente) : mesuré une fois posé
  const end = await p.evaluate(() => ({ view: S.view, coll: !!COLL.el, sheets: sheets.length, ctab: COLL.ctab, y: window.scrollY, gum: window.__gum, sc: !!SC.el, toast: document.querySelector('#toast').textContent }));
  assert.deepEqual([end.view, end.coll, end.sheets, end.ctab, end.sc, end.gum], ['home', false, 0, 'list', false, 0], tag + ' : accueil remis, aucune feuille, onglet de la collection inchangé, caméra jamais ouverte ' + JSON.stringify(end));
  assert.ok(Math.abs(end.y - y0) <= 2, `défilement remis (${end.y} / ${y0})`);
  assert.match(end.toast, /Visite terminée/);
  const s = await st(p); assert.ok(s.fin && s.step === 13 && s.ver === 2, 'terminée, étape 13 atteinte, version 2 vue : ' + JSON.stringify(s));
  ok(`${tag} : 13 étapes (Scanner, Session d'ouverture en feuille, lien et QR, classeur, échange en direct, amis, Carte mystère, partie, rangement, masterset, À monter, prix d'une liste, partager) ; halo sur la bonne cible, bulle dans l'écran sans la couvrir ; flèches, Tab ; accueil et défilement remis ; caméra jamais ouverte`);
  if (!dark && !fs) {
    // depuis la collection (onglet Cartes, défilée) par l'aide : la collection revient telle quelle ; l'aide reste fermée
    await p.click('#nav [data-nav="coll"]'); await p.waitForSelector('.coll.on');
    await p.evaluate(() => openHelp()); await p.waitForSelector('.hp-sheet.open .tour-help');
    assert.equal(await p.evaluate(() => document.querySelector('.hp-sheet .sheet-body').firstElementChild.classList.contains('tour-help')), true, '« Visite guidée » en tête de l\'aide');
    assert.equal(await p.$$eval('.hp-sheet .hp-q', q => q.length), 16, '16 questions (dont « Où sont les fonctions moins visibles ? »)');
    await p.click('.hp-sheet .tour-help'); await shown(p);
    assert.equal(await p.evaluate(() => sheets.length), 0, 'l\'aide se ferme pour la visite');
    await next(p); await shown(p); assert.equal((await geo(p)).id, 'opening');
    await p.evaluate(() => backClose()); await p.waitForFunction(() => !TOUR.on);      // Retour du téléphone
    await p.waitForTimeout(600);
    assert.deepEqual(await p.evaluate(() => [!!COLL.el && COLL.tab, sheets.length, S.view]), ['list', 0, 'home'], 'collection (onglet Cartes) remise, réglages du scan refermés');
    // Compte et réglages › Aide et avis › « Visite guidée »
    await closeSheets(p); await p.click('#nav [data-nav="home"]'); await p.waitForTimeout(400);
    await openMe(p, 'aide'); await p.click('.sheet-wrap.open [data-help="tour"]'); await shown(p);
    assert.equal((await geo(p)).id, 'scan'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !TOUR.on);
    ok('Aide : « Visite guidée » en tête (16 questions), depuis la collection : Retour du téléphone la quitte, la collection revient ; Compte et réglages › Aide et avis › Visite guidée');
  }
  await p.context().close();
}

/* ── 4) Étapes adaptées ───────────────────────────────────────────────────────────────────────────────────────── */
{ // déconnecté, serveur sans amis, échange en direct ni Carte mystère, collection vide, web
  const { p } = await page({ ping: { amis: false, troc: false, pub: false }, init: () => { localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1 })); } });
  await p.evaluate(() => tourStart()); await shown(p);
  const ids = ['scan', 'opening', 'trade', 'binder', 'partie', 'places', 'masterset', 'build', 'price', 'more'];
  assert.deepEqual(await p.evaluate(() => TOUR.steps.map(s => s.id)), ids, 'sans amis, échange en direct ni Carte mystère : 10 étapes');
  const texts = {};
  for (let i = 0; i < ids.length; i++) { const g = await checkStep(p, 'déconnecté'); texts[g.id] = g; if (i < ids.length - 1) { await next(p); await shown(p); } }
  assert.match(texts.trade.text, /^Avec un compte, crée ton lien public/);
  assert.match(texts.binder.text, /^Dès que ta liste a des cartes/); assert.match(texts.binder.el[0], /seg|trSub/, 'liste vide : les onglets de la liste à la place de l\'interrupteur');
  assert.match(texts.partie.text, /l'historique de tes parties\.$/); assert.doesNotMatch(texts.partie.text, /QR code/, 'déconnecté : pas de salle d\'attente');
  assert.match(texts.places.el[0], /seg-opt/, 'collection vide : l\'onglet Rangement reste');
  assert.match(texts.masterset.text, /^Dès que tu as des cartes, l'onglet Cartes a un interrupteur Masterset/); assert.match(texts.masterset.el[0], /seg-opt/, 'collection vide : l\'onglet Cartes à la place de l\'interrupteur');
  assert.match(texts.build.text, /Il faut un compte\./); assert.doesNotMatch(texts.build.text, /Communauté/, 'sans decks publics : pas de Communauté');
  assert.match(texts.more.text, /^Collection › Stats/); assert.match(texts.more.el[0], /nav-i/, 'collection vide : le bouton Collection de la barre');
  await next(p); await p.waitForFunction(() => !TOUR.on);
  ok('déconnecté, serveur sans amis, échange en direct ni Carte mystère, collection vide : 10 étapes, textes « Avec un compte », interrupteurs absents → onglets, Stats → bouton Collection');
  // mode streamer : refusée
  await p.evaluate(() => { OPN.cur = { id: 'o', name: 'S', at: Date.now(), st: true, rows: [] }; });
  assert.equal(await p.evaluate(() => tourStart()), false);
  assert.match(await p.textContent('#toast'), /indisponible en mode streamer/);
  await p.evaluate(() => { OPN.cur = null; });
  ok('mode streamer : visite refusée (toast)');
  await p.context().close();
}
{ // ordinateur (souris, grand écran) : « Scan mobile » sur le « + » de la collection, seulement là
  const { p } = await page({ vp: { width: 1100, height: 800 }, desk: true, init: SEEN2, ping: { amis: false, troc: false } });
  await p.evaluate(COLL3);
  await p.evaluate(() => tourStart()); await shown(p);
  const ids = await p.evaluate(() => TOUR.steps.map(s => s.id));
  assert.equal(ids.length, 11, 'ordinateur, déconnecté, sans amis, échange en direct ni Carte mystère : 11 étapes ' + ids); assert.equal(ids[ids.indexOf('masterset') + 1], 'mobile', 'scan mobile après le masterset (même écran)');
  await p.evaluate(n => { TOUR.busy = false; tourGo(n); }, ids.indexOf('mobile')); await shown(p);
  const g = await checkStep(p, 'ordinateur');
  assert.equal(g.id, 'mobile'); assert.equal(await p.evaluate(() => TOUR.steps[TOUR.i].el().dataset.act), 'add', 'halo sur « + » (Ajouter des cartes)');
  assert.match(g.text, /^«.\+.» ouvre «.Ajouter des cartes.».: active le scan mobile.*Il faut un compte\.$/);      // espaces insécables (tourNb)
  await SHOT(p, 'etape-mobile-ordinateur');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !TOUR.on);
  ok('ordinateur : étape « Scan mobile » sur le « + » de la collection (jamais sur téléphone)');
  await p.context().close();
}
/** Faux pont Android (comme ads-e2e) ; mo : plugin ManaOrbit présent (APK récente) ou non. */
const fakeAndroid = mo => {
  const any = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : k === 'addListener' ? () => ({ remove: async () => {} }) : async () => ({})) });
  const Plugins = mo ? { ManaOrbit: any } : {};
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n in Plugins, Plugins };
  localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1 }));
};
for (const mo of [true, false]) {
  const { p } = await page({ init: [`(${fakeAndroid})(${mo})`] });
  await p.evaluate(COLL3);
  assert.equal(await p.evaluate(() => isNativeApp()), true);
  await p.evaluate(() => { tourStart(); }); await shown(p);
  const n = await p.evaluate(() => TOUR.steps.length);
  await p.evaluate(n => { TOUR.busy = false; tourGo(n - 1); }, n); await shown(p);
  const g = await checkStep(p, 'Android');
  assert.equal(g.id, 'more');
  if (mo) assert.match(g.text, /Sur Android : les widgets Mana Orbit .*appui long sur l'icône/);
  else { assert.match(g.text, /Sur Android : un appui long sur l'icône de l'appli ouvre ses raccourcis/); assert.doesNotMatch(g.text, /widgets/); }
  assert.doesNotMatch(g.text, /Installe aussi/, 'Android : pas d\'installation web');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !TOUR.on);
  await p.context().close();
}
ok('Android : widgets et raccourcis (APK récente), raccourcis seuls (APK sans plugin ManaOrbit), jamais « installer »');

/* ── 5) Astuces ───────────────────────────────────────────────────────────────────────────────────────────────── */
const tipOn = (p, re, t = 6000) => p.waitForFunction(re => { const e = document.querySelector('.tip.on'); return e && new RegExp(re).test(e.textContent); }, re.source, { timeout: t });
const tipGone = p => p.waitForFunction(() => !document.querySelector('.tip'), null, { timeout: 9000 });
const tipGeo = p => p.evaluate(() => { const t = document.querySelector('.tip').getBoundingClientRect(), g = TIP.tgt.getBoundingClientRect(); return { t: [t.x, t.y, t.width, t.height], g: [g.x, g.y, g.width, g.height], vw: innerWidth, vh: innerHeight, pe: getComputedStyle(document.querySelector('.tip')).pointerEvents, pos: getComputedStyle(document.querySelector('.tip')).position }; });
const tipCheckGeo = (g, tag) => {
  const [x, y, w, h] = g.t, [gx, gy, gw, gh] = g.g;
  assert.ok(x >= 0 && y >= 0 && x + w <= g.vw && y + h <= g.vh, tag + ' : bulle dans l\'écran');
  assert.ok(!(x < gx + gw && gx < x + w && y < gy + gh && gy < y + h), tag + ' : bulle à côté de la cible ' + JSON.stringify(g));
  assert.equal(g.pe, 'none', tag + ' : les touchers passent au travers'); assert.equal(g.pos, 'fixed', tag + ' : par-dessus la page');
};
{
  const { p, errs } = await page({ path: '?tour', ping: { amis: true }, init: [SEEN, () => { if (!localStorage.getItem('deckdeal:tour')) localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1, ver: 2 })); }] });
  await p.evaluate(COLL3); await p.waitForTimeout(300);
  // pendant la visite : aucune astuce (l'Échange s'ouvre pour l'étape du classeur)
  await p.evaluate(() => tourStart()); await shown(p);
  for (let i = 0; i < 3; i++) { await next(p); await shown(p); }
  assert.equal((await geo(p)).id, 'binder'); await p.waitForTimeout(2000);
  assert.equal(await p.$('.tip'), null, 'pas d\'astuce pendant la visite'); assert.equal(((await st(p)).tips || {}).bnd, undefined);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !TOUR.on); await p.waitForTimeout(500);
  // Échange : interrupteur liste / classeur (la page ne bouge pas)
  await p.click('#nav [data-nav="trade"]'); await p.waitForSelector('#trView');
  await tipOn(p, /Passe en mode classeur ici/); await p.waitForTimeout(350);
  tipCheckGeo(await tipGeo(p), 'classeur');
  assert.equal(await p.evaluate(() => { const r = () => JSON.stringify([document.querySelector('#trView').getBoundingClientRect(), document.documentElement.scrollHeight]), a = r(), t = document.querySelector('.tip'), g = document.querySelector('.tip-ring'), pa = t.parentNode;
    pa.removeChild(t); pa.removeChild(g); const b = r(); pa.append(g, t); return a === b; }), true, 'astuce par-dessus : rien ne bouge sans elle');
  assert.equal(await p.evaluate(() => document.querySelector('.tip').getAttribute('role')), 'status');
  await p.screenshot({ path: process.env.TOUR_SHOTS ? process.env.TOUR_SHOTS + '/tip-classeur.png' : '/dev/null' }).catch(() => {});
  await p.mouse.click(30, 300); await tipGone(p);      // un toucher ailleurs l'efface
  assert.ok((await st(p)).tips.bnd);
  await p.click('#nav [data-nav="home"]'); await p.waitForTimeout(400); await p.click('#nav [data-nav="trade"]'); await p.waitForTimeout(2500);
  assert.equal(await p.$('.tip'), null, 'jamais deux fois');
  ok('astuce Échange : « Passe en mode classeur ici » sur l\'interrupteur, par-dessus (rien ne bouge, touchers qui passent), effacée au toucher, une seule fois ; jamais pendant la visite');
  // Stats : « Partage ta collection en image »
  await p.click('#nav [data-nav="coll"]'); await p.waitForSelector('#collSeg'); await p.click('#collSeg [data-v="stats"]');
  await tipOn(p, /Partage ta collection en image/); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'stats');
  assert.equal(await p.evaluate(() => document.querySelectorAll('.tip').length), 1, 'une seule à la fois');
  await p.waitForFunction(() => !document.querySelector('.tip'), null, { timeout: 10000 });      // s'efface seule après quelques secondes
  ok('astuce Stats : « Partage ta collection en image », effacée seule après quelques secondes');
  // scan : réglages (session d'ouverture)
  await p.click('#nav [data-nav="home"]'); await p.waitForTimeout(400);
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
  await tipOn(p, /Tu ouvres des boosters \? Lance une session d'ouverture ici\./, 8000); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'scan');
  assert.match(await p.evaluate(() => TIP.tgt.className), /sc-set/);
  await p.keyboard.press('Escape'); await tipGone(p);      // une touche l'efface (et Échap ferme le scan)
  await p.evaluate(() => { if (SC.el) SC.el.__close('done'); }); await p.waitForTimeout(400);
  ok('astuce scan : « Tu ouvres des boosters ? » sur les réglages du scan');
  // liste d'échange d'un autre joueur : « Ajoute-le en ami » (déconnecté : le bouton invite à se connecter)
  await p.evaluate(() => openPublicTrade(readShare('trade', { have: [trCard('sol ring', 'Sol Ring', 1, '')], want: [], by: 'Léa', at: Date.now() }), false, 'AbcDef123456'));
  await p.waitForSelector('.pubv.on [data-am="add"]', { timeout: 8000 });
  await tipOn(p, /Ajoute-le en ami/); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'ami');
  await p.evaluate(() => TR.pub.el.__close()); await tipGone(p);      // l'écran se ferme : l'astuce aussi
  ok('astuce liste d\'un autre joueur : « Ajoute-le en ami » sur le bouton, fermée avec l\'écran');
  assert.deepEqual(Object.keys((await st(p)).tips).sort(), ['ami', 'bnd', 'opn', 'simg']);
  // jamais deux fois : mêmes écrans rouverts
  await p.evaluate(() => openPublicTrade(readShare('trade', { have: [trCard('sol ring', 'Sol Ring', 1, '')], want: [], by: 'Léa', at: Date.now() }), false, 'AbcDef123456'));
  await p.waitForSelector('.pubv.on [data-am="add"]'); await p.waitForTimeout(2500); assert.equal(await p.$('.tip'), null, 'Ajouter en ami : une seule fois');
  await p.evaluate(() => TR.pub.el.__close()); await p.waitForTimeout(300);
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on'); await p.waitForTimeout(3000); assert.equal(await p.$('.tip'), null, 'scan : une seule fois');
  await p.evaluate(() => SC.el.__close('done')); await p.waitForTimeout(300);
  await p.click('#nav [data-nav="coll"]'); await p.waitForSelector('#collSeg'); await p.waitForTimeout(2500); assert.equal(await p.$('.tip'), null, 'Stats : une seule fois');
  ok('astuces : chacune une seule fois (écrans rouverts)');
  // Cartes : le rond de l'édition d'une ligne (« . » : espace insécable du français avant « : », tourNb)
  await p.click('#collSeg [data-v="list"]');
  await tipOn(p, /Touche ce rond.: l'édition exacte de ta carte, et foil ✦ ou non\./); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'édition');
  assert.match(await p.evaluate(() => TIP.tgt.className), /row-ed/);
  await SHOT(p, 'astuce-edition');
  await p.keyboard.press('Shift'); await tipGone(p);      // une touche l'efface
  // panneau des filtres ouvert : le filtre Extension, en bas du panneau (sous la barre du bas : l'astuce attend qu'on y descende)
  await p.click('#collF .fbtn'); await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('#collF .fset').scrollIntoView({ block: 'center' }));
  await tipOn(p, /Une seule extension à la fois.: cherche-la/); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'extension');
  assert.match(await p.evaluate(() => TIP.tgt.className), /fset/);
  await p.keyboard.press('Shift'); await tipGone(p); await p.click('#collF .fbtn');
  // masterset allumé : ses options (roue crantée)
  await p.click('.coll-ms');
  await tipOn(p, /Les options du masterset.: version foil/); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'masterset');
  assert.match(await p.evaluate(() => TIP.tgt.className), /ms-opt/);
  await SHOT(p, 'astuce-masterset');
  await p.keyboard.press('Shift'); await tipGone(p); await p.click('.coll-ms'); await p.waitForTimeout(300);
  // emplacement ouvert : « Ranger ces cartes… »
  await p.evaluate(() => plcShow(plcCreate('box', 'Boîte bleue')));
  await tipOn(p, /Range d'un coup toutes les cartes affichées ici/); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'ranger');
  assert.match(await p.evaluate(() => TIP.tgt.className), /plc-mv/);
  await SHOT(p, 'astuce-ranger');
  await p.keyboard.press('Shift'); await tipGone(p);
  await p.evaluate(() => COLL.el.__close()); await p.waitForTimeout(300);
  // scan : le mode Auto, après la session d'ouverture (pas de caméra dans ce test : l'interrupteur est montré à la main)
  await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on'); await p.waitForTimeout(1800);
  assert.equal(await p.$('.tip'), null, 'sans caméra, pas d\'interrupteur Auto : pas d\'astuce');
  await p.evaluate(() => { SC.el.querySelector('.sc-auto').hidden = false; tipSoon(0); });
  await tipOn(p, /Auto.: pose tes cartes l'une après l'autre, le scan les lit tout seul\./); await p.waitForTimeout(350); tipCheckGeo(await tipGeo(p), 'auto');
  assert.match(await p.evaluate(() => TIP.tgt.className), /sc-auto/);
  await p.keyboard.press('Shift'); await tipGone(p);
  await p.evaluate(() => SC.el.__close('done')); await p.waitForTimeout(400);
  assert.deepEqual(Object.keys((await st(p)).tips).sort(), ['ami', 'auto', 'bnd', 'ed', 'fset', 'msopt', 'opn', 'rng', 'simg']);
  ok('astuces de la version 2 : rond de l\'édition (Cartes), filtre Extension (filtres ouverts), options du masterset, « Ranger ces cartes… » (emplacement ouvert), mode Auto du scan');
  assert.deepEqual(errs, []);
  await p.context().close();
}
{ // mode streamer : aucune astuce ; interrupteur « Astuces » (Compte et réglages › Préférences)
  const { p } = await page({ path: '?tour', init: [SEEN, () => { if (!localStorage.getItem('deckdeal:tour')) localStorage.setItem('deckdeal:tour', JSON.stringify({ done: 1, ver: 2 })); }] });
  await p.evaluate(COLL3);
  await p.evaluate(() => { OPN.cur = { id: 'o', name: 'S', at: Date.now(), st: true, rows: [] }; opnFlags(); });
  await p.click('#nav [data-nav="trade"]'); await p.waitForTimeout(2500);
  assert.equal(await p.$('.tip'), null, 'mode streamer : pas d\'astuce'); assert.equal((await st(p)).tips, undefined);
  await p.evaluate(() => { OPN.cur = null; opnFlags(); navGo('home'); }); await p.waitForTimeout(400);
  await openMe(p);
  assert.equal(await p.isChecked('#setTips'), true, 'Astuces : activées par défaut');
  assert.match(await p.textContent('label[for="setTips"]'), /Astuces.*Petites bulles d'aide, une fois par écran/);
  await p.click('label[for="setTips"] .switch'); await p.waitForTimeout(150);
  assert.equal((await st(p)).tipsOff, true);
  await closeSheets(p);
  await p.click('#nav [data-nav="trade"]'); await p.waitForTimeout(2500);
  assert.equal(await p.$('.tip'), null, 'astuces coupées : rien');
  await p.click('#nav [data-nav="home"]'); await p.waitForTimeout(300); await openMe(p);
  assert.equal(await p.isChecked('#setTips'), false, 'réglage gardé');
  ok('astuces : jamais en mode streamer ; interrupteur « Astuces » de Compte et réglages › Préférences (activé par défaut, coupe tout)');
  await p.context().close();
}

errsAll.forEach((e, i) => assert.deepEqual(e, [], `aucune erreur dans la page n° ${i + 1}`));
await browser.close(); world.stop();
console.log('tour-e2e : OK');
