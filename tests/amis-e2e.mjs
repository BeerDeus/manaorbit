// E2E amis : vrai proxy.mjs (/api/friends) branché sur un faux Firebase (jetons, OAuth2, Firestore REST, FCM), deux navigateurs (Alice, Bob).
// Lien d'échange d'Alice ouvert par Bob → « Ajouter en ami » (déconnecté : connexion d'abord) → demande → point sur le bouton du compte d'Alice et ligne
// « Amis · 1 demande » → acceptée → listes envoyées au serveur → page d'Alice chez Bob : « Pour toi », ses decks (viewer), sa collection seulement si elle
// l'autorise → accueil « Pour toi » → notification touchée (./?ami=, ./?amis=1) → mode streamer (pas de point) → retrait dans les deux sens.
// Serveur sans amis : rien n'apparaît. Captures : AMIS_SHOTS (dossier, facultatif).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, signInFake, openMe, closeSheets } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19110, env: { ...F.env, FRIENDS_WANT_GAP_MS: '3000' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.AMIS_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(450); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());      // texte même hors écran (lignes en content-visibility)
const T0 = Date.now(); process.on('exit', () => console.log('durée : ' + Math.round((Date.now() - T0) / 1000) + ' s'));
const UA = 'uid-alice-e2e', UB = 'uid-bob-e2e', TA = tag(UA), TB = tag(UB);
const amDoc = t => { const d = F.fs.docs.get('amis/' + t); return d ? JSON.parse(d.j) : null; };
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms && !(await fn()); t += 100) await sleep(100); return fn(); };

/** Lecture publique d'un partage (shareFetch du visiteur) : le faux Firestore du serveur, vu par l'API REST publique. */
async function routeRest(p) {
  await p.route('https://firestore.googleapis.com/**', route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()), s = F.fs.docs.get('shares/' + id), h = { 'access-control-allow-origin': '*' };
    if (!s) return route.fulfill({ status: 404, headers: h, json: { error: { code: 404, status: 'NOT_FOUND' } } });
    route.fulfill({ status: 200, headers: h, json: { name: 'projects/m2s-mtg/databases/(default)/documents/shares/' + id, fields: { o: { stringValue: s.o }, kind: { stringValue: s.kind }, v: { integerValue: '1' }, updatedAt: { integerValue: String(s.updatedAt) }, d: { stringValue: s.d } } } });
  });
  await p.route('https://www.gstatic.com/**', r => r.abort());      // pas de SDK Firebase : comptes simulés (signInFake)
}
/** Compte connecté (faux cloud de e2e-world), jeton signé que le serveur vérifie ; partages écrits dans le faux Firestore du serveur. */
async function login(p, uid, name, deck) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name });
  await p.evaluate(([n, d]) => {
    PROF.name = n; profStore();
    D.cloud.saveShare = async (id, data) => { await window.__share(id, data); };
    D.cloud.shareId = () => 'Share' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
    if (d) D.cloud.save(D.uid, 'deck-' + n, { name: d.name, text: d.text, createdAt: 1, updatedAt: 2 });
  }, [name, deck]);
}
const seed = coll => `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(coll)}, u: 1, s: '', b: null })); } catch (e) {}`;

/* ── Alice : collection, un deck, son lien d'échange ───────────────────────────────────────────── */
const A = await newPage(browser, world, { goto: false, init: seed('5 Sol Ring\n2 Swords to Plowshares\n2 Craterhoof Behemoth\n3 Llanowar Elves') });
const pa = A.p;
await routeRest(pa); await pa.exposeFunction('__share', (id, data) => { F.fs.docs.set('shares/' + id, data); });
await pa.goto(world.url); await pa.waitForTimeout(600);
await login(pa, UA, 'Alice', { name: 'Edgar Vampires', text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Swords to Plowshares\n30 Plains' });
await pa.waitForFunction(() => CTX.amis === true, null, { timeout: 8000 });
await pa.evaluate(() => trShareOn()); await pa.waitForFunction(() => !!TR.share, null, { timeout: 10000 });
const SID = await pa.evaluate(() => TR.share);
assert.ok(F.fs.docs.get('shares/' + SID).o === TA, 'partage : empreinte d\'Alice');
await openMe(pa); await pa.waitForSelector('#meAmis');
assert.equal(await pa.$eval('#meAmis .me-t', e => e.textContent), 'Amis'); assert.equal(await pa.$('#meAmis .me-v'), null, 'pas encore d\'ami : rien à droite');
await closeSheets(pa);
ok('Alice : lien d\'échange créé (empreinte de son compte), ligne « Amis » dans Compte et réglages');

/* ── Bob : ouvre le lien d'Alice, déconnecté puis connecté ─────────────────────────────────────── */
const B = await newPage(browser, world, { goto: false, init: seed('1 Arcane Signet\n4 Wrath of God\n1 Llanowar Elves') });
const pb = B.p;
await routeRest(pb); await pb.exposeFunction('__share', (id, data) => { F.fs.docs.set('shares/' + id, data); });
await pb.goto(world.url + '?p=' + SID); await pb.waitForSelector('.pubv.on');
await pb.waitForFunction(() => D.authReady && CTX.amis === true, null, { timeout: 10000 });
await pb.evaluate(() => AM.pubCheck && AM.pubCheck());      // sans SDK Firebase, onUser(null) n'arrive jamais : le bouton se recalcule à la main
await pb.waitForSelector('.am-pub:not([hidden]) [data-am="add"]');
assert.equal(await tc(pb, '.am-pub [data-am="add"]'), 'Ajouter en ami'); assert.equal(await tc(pb, '.pubv .dv-title b'), 'Alice', 'bouton affiché : le pseudo en titre'); assert.match(await tc(pb, '.pubv .dv-title span'), /^Liste d'échange · Mise à jour/);
await shot(pb, '01-lien-ajouter');
await pb.click('.am-pub [data-am="add"]'); await pb.waitForFunction(() => sheets.length === 1);
assert.match(await tc(pb, '#toast'), /Connecte-toi pour ajouter un ami/); await closeSheets(pb);
await login(pb, UB, 'Bob', { name: 'Hoof', text: '1 Craterhoof Behemoth\n1 Sol Ring\n1 Arcane Signet\n20 Forest' });
await pb.waitForSelector('.am-pub [data-am="add"]');
await pb.click('.am-pub [data-am="add"]'); await pb.waitForSelector('.am-pub[data-st="sent"] .am-pill.off');
assert.equal(await tc(pb, '.am-pub'), 'Demande envoyée'); assert.match(await tc(pb, '#toast'), /Demande envoyée à Alice/);
assert.ok(amDoc(TA).i[TB] > 0 && amDoc(TB).o[TA] > 0, 'demande enregistrée des deux côtés');
await shot(pb, '02-lien-demande-envoyee');
ok('Bob : « Ajouter en ami » sur la liste d\'Alice (déconnecté : connexion d\'abord), puis « Demande envoyée »');

/* ── Alice : point, « 1 demande », acceptée ────────────────────────────────────────────────────── */
await pa.evaluate(() => amRefresh(true)); await pa.waitForSelector('#btnAccount[data-dot="1"]');
await openMe(pa); await pa.waitForSelector('#meAmis .am-hot');
assert.equal(await tc(pa, '#meAmis .me-v'), '1 demande');
await shot(pa, '03-compte-demande');
await pa.click('#meAmis'); await pa.waitForSelector('.am-sheet .am-row[data-id="' + TB + '"] [data-am="yes"]');
assert.equal(await tc(pa, '.am-sheet .am-row[data-id="' + TB + '"] .am-t b'), 'Bob'); assert.equal(await tc(pa, '.am-sheet .am-row[data-id="' + TB + '"] .am-t small'), 'à l\'instant');
assert.ok(await pa.$('.am-sheet .am-empty'), 'pas encore d\'ami : comment en ajouter');
await shot(pa, '04-amis-demande');
await pa.click('.am-sheet [data-am="yes"]'); await pa.waitForSelector('.am-sheet .am-row[data-am="open"][data-id="' + TB + '"]');
assert.match(await tc(pa, '#toast'), /Vous êtes amis/);
assert.equal(await pa.$eval('#btnAccount', b => b.dataset.dot), '0', 'plus de demande : plus de point');
assert.ok(amDoc(TA).f[TB] && amDoc(TB).f[TA], 'amis des deux côtés');
// collection partagée : coupée par défaut, allumée ici
assert.equal(await pa.$eval('#amColl', e => e.checked), false);
await pa.click('label[for="amColl"]'); await pa.waitForFunction(() => /visible|voient/.test(document.querySelector('#toast').textContent));
assert.equal(amDoc(TA).c, 1);
await shot(pa, '05-amis-liste');
await closeSheets(pa);
ok('Alice : point sur le bouton du compte, « Amis · 1 demande » en couleur, acceptée ; collection partagée (coupée par défaut)');

/* ── Listes envoyées au serveur (liste d'échange, decks, collection) ───────────────────────────── */
for (const p of [pa, pb]) { await p.waitForFunction(() => COLL.live, null, { timeout: 10000 }); await p.evaluate(() => amRefresh(true).then(() => amData())); }
await until(() => ['t', 'd', 'c'].every(x => F.fs.docs.has(`amisdata/${TA}_${x}`)) && F.fs.docs.has(`amisdata/${TB}_t`));
const at = JSON.parse(F.fs.docs.get(`amisdata/${TA}_t`).j);
assert.deepEqual(at.have.map(x => x.n).sort(), ['Craterhoof Behemoth', 'Llanowar Elves', 'Sol Ring'], 'liste d\'échange d\'Alice (celle du lien)');
assert.deepEqual(JSON.parse(F.fs.docs.get(`amisdata/${TA}_d`).j).map(d => d.n), ['Edgar Vampires']);
assert.equal(F.fs.docs.has(`amisdata/${TB}_c`), false, 'Bob ne partage pas sa collection : rien envoyé');
const n0 = F.fs.ops.filter(o => o.startsWith('PATCH amisdata')).length; await pa.evaluate(() => amData()); await sleep(400);
assert.equal(F.fs.ops.filter(o => o.startsWith('PATCH amisdata')).length, n0, 'rien de changé : rien de renvoyé');
ok('listes envoyées au serveur : liste d\'échange et decks ; collection seulement chez qui la partage ; rien de renvoyé sans changement');

/* ── Bob : page d'Alice (feuille Amis), ses decks, sa collection ──────────────────────────────── */
await pb.evaluate(() => { if (TR.pub && TR.pub.el) TR.pub.el.__close(); return amRefresh(true); });
await openMe(pb); await pb.waitForFunction(() => /^1$/.test((document.querySelector('#meAmis .me-v') || {}).textContent || ''));
await pb.click('#meAmis'); await pb.waitForSelector('.am-sheet .am-row[data-id="' + TA + '"]');
assert.match(await tc(pb, '.am-sheet .am-row[data-id="' + TA + '"] small'), /2 cartes pour toi/);
await pb.click('.am-sheet .am-row[data-id="' + TA + '"]'); await pb.waitForSelector('.pubv.on .am-chips');
assert.equal(await tc(pb, '.pubv .dv-title b'), 'Alice'); assert.match(await tc(pb, '.pubv .dv-title span'), /^Ami · Mise à jour/);
assert.equal(await pb.$('.pubv .am-pub:not([hidden])'), null, 'page d\'un ami : pas de bouton d\'ajout');
assert.deepEqual(await pb.$$eval('.pubv .am-chip', b => b.map(x => [...x.children].map(c => c.textContent).filter(Boolean).join(' '))), ['Ses decks 1', 'Sa collection 4', 'Échange en direct'], 'puces de la page d\'un ami (échange en direct : troc.js)');
await pb.waitForSelector('.pubv .pm-block[data-side="get"] .pm-row');
assert.deepEqual((await pb.$$eval('.pubv .pm-block[data-side="get"] .pm-row', r => r.map(x => x.dataset.k))).sort(), ['craterhoof behemoth', 'sol ring'], 'Pour toi : ce qu\'Alice a et que Bob cherche');
await shot(pb, '06-page-ami');
await pb.click('.pubv [data-am="decks"]'); await pb.waitForSelector('.sheet-wrap.open .am-deck');
assert.match(await tc(pb, '.sheet-wrap.open .am-deck'), /Edgar Vampires/);
await shot(pb, '07-decks-ami');
await pb.click('.sheet-wrap.open .am-deck'); await pb.waitForFunction(() => DV.pub && document.querySelector('.dv.on:not(.pubv) .dv-title b'));
assert.equal(await tc(pb, '.dv.on:not(.pubv) .dv-title b'), 'Edgar Vampires'); assert.match(await tc(pb, '.dv.on:not(.pubv) .dv-title span'), /partagé par Alice/);
await pb.evaluate(() => closeDeckViewer()); await pb.waitForFunction(() => !document.querySelector('.dv.on:not(.pubv)'));
await pb.click('.pubv [data-am="coll"]'); await pb.waitForSelector('.am-coll-sheet .am-crow');
assert.deepEqual(await pb.$$eval('.am-coll-sheet .am-crow', r => r.map(x => x.dataset.k)), ['craterhoof behemoth', 'llanowar elves', 'sol ring', 'swords to plowshares']);
assert.match(await tc(pb, '.am-coll-sheet .am-crow[data-k="sol ring"]'), /tu la cherches × 1/);
await shot(pb, '08-collection-ami');
await pb.fill('.am-coll-sheet .fsearch input', 'sol'); await pb.waitForFunction(() => document.querySelectorAll('.am-coll-sheet .am-crow').length === 1);
await closeSheets(pb);
ok('Bob : page d\'Alice (« Ami », « Pour toi »), ses decks (viewer en lecture seule), sa collection (recherche, ce que Bob cherche signalé)');

/* ── Accueil « Pour toi », notifications touchées, mode streamer ───────────────────────────────── */
await pb.evaluate(() => { if (TR.pub && TR.pub.el) TR.pub.el.__close(); showView('home'); homePaint(); });
await pb.waitForSelector('#hmForYou:not([hidden]) [data-fa="' + TA + '"]');
assert.equal(await tc(pb, '#hmForYou .hm-fy-h'), 'Pour toi · tes amis'); assert.equal(await tc(pb, '#hmForYou .hm-fy-t'), 'Alice · 2 cartes pour toi');
await shot(pb, '09-accueil-pour-toi');
await pb.click('#hmForYou [data-fa="' + TA + '"]'); await pb.waitForSelector('.pubv.on .am-chips');
await pb.evaluate(() => TR.pub.el.__close()); await pb.waitForFunction(() => !document.querySelector('.pubv.on'));
await pb.evaluate(t => pushOpen('./?ami=' + t), TA); await pb.waitForSelector('.pubv.on .am-chips', { timeout: 8000 });
await pb.evaluate(() => TR.pub.el.__close());
await pb.evaluate(() => pushOpen('./?amis=1')); await pb.waitForSelector('.am-sheet.open', { timeout: 8000 }); await closeSheets(pb);
ok('accueil : « Pour toi · tes amis » ; notification touchée → page de l\'ami (./?ami=) ou feuille Amis (./?amis=1)');

// Alice coupe le partage de sa collection : effacée du serveur, plus de « Sa collection » chez Bob
await openMe(pa, 'amis'); await pa.waitForSelector('#amColl:checked'); await pa.click('label[for="amColl"]');
await pa.waitForFunction(() => /plus visible/.test(document.querySelector('#toast').textContent)); await closeSheets(pa);
assert.equal(F.fs.docs.has(`amisdata/${TA}_c`), false, 'collection effacée du serveur');
await pb.evaluate(() => { AM.parts.clear(); return amRefresh(true); });
await pb.evaluate(t => amOpenFriend(t), TA); await pb.waitForSelector('.pubv.on .am-chips');
assert.deepEqual(await pb.$$eval('.pubv .am-chip', b => b.map(x => [...x.children].map(c => c.textContent).filter(Boolean).join(' '))), ['Ses decks 1', 'Échange en direct'], 'collection plus partagée : plus de bouton');
await pb.evaluate(() => TR.pub.el.__close());
ok('collection plus partagée : effacée du serveur, plus visible chez Bob');

// une nouvelle demande pendant une session en mode streamer : pas de point
await pa.evaluate(() => { window.streamOn = () => true; AM.l.inc.push({ id: 'f'.repeat(64), n: 'Zoé', at: Date.now() }); amPaint(); });
assert.equal(await pa.$eval('#btnAccount', b => b.dataset.dot), '0', 'mode streamer : pas de point');
await pa.evaluate(() => { window.streamOn = () => false; amPaint(); }); assert.equal(await pa.$eval('#btnAccount', b => b.dataset.dot), '1');
await pa.evaluate(() => { delete window.streamOn; return amRefresh(true); });
ok('mode streamer (streamOn) : le point des demandes n\'apparaît pas');

/* ── Appli Android (plugin PushNotifications simulé) : appareil enregistré, demande notifiée, toucher → feuille Amis ─ */
const UC = 'uid-carol-e2e', TC = tag(UC), TOKC = 'eC3:APA91b' + 'x'.repeat(40) + Date.now().toString(36).padEnd(70, 'q');
const shell = tok => {
  const L = {}, held = {}; let perm = 'prompt';
  const fire = (ev, data) => { if (L[ev] && L[ev].length) L[ev].forEach(f => f(data)); else (held[ev] = held[ev] || []).push(data); };
  window.__pn = { fire };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'PushNotifications', Plugins: { PushNotifications: {
    checkPermissions: async () => ({ receive: perm }), requestPermissions: async () => { perm = 'granted'; return { receive: perm }; },
    register: async () => { setTimeout(() => fire('registration', { value: tok }), 50); }, unregister: async () => {},
    addListener: async (ev, fn) => { (L[ev] = L[ev] || []).push(fn); for (const d of (held[ev] || []).splice(0)) setTimeout(() => fn(d), 0); return { remove: async () => {} }; },
  } } };
};
const Cc = await newPage(browser, world, { goto: false, init: `(${shell})(${JSON.stringify(TOKC)});` + seed('1 Island') });
const pc = Cc.p;
await routeRest(pc); await pc.exposeFunction('__share', (id, data) => { F.fs.docs.set('shares/' + id, data); });
await pc.goto(world.url); await pc.waitForTimeout(600);
await login(pc, UC, 'Carol'); await pc.waitForFunction(() => CTX.amis === true && CTX.fcm === true, null, { timeout: 8000 });
await pc.evaluate(() => trShareOn()); await pc.waitForFunction(() => !!TR.share, null, { timeout: 10000 }); const SIDC = await pc.evaluate(() => TR.share);
await openMe(pc, 'amis'); await pc.waitForSelector('.am-sheet [data-am="push"] #amPushV');
await pc.waitForFunction(() => document.querySelector('#amPushV').textContent === 'Activer');
await pc.click('.am-sheet [data-am="push"]'); await pc.waitForFunction(() => /prévenu des demandes/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
await until(() => (amDoc(TC) || { d: [] }).d.some(x => x.sub.fcm === TOKC)); assert.equal(amDoc(TC).d.length, 1, 'appareil enregistré pour le compte (jeton FCM)'); assert.equal(amDoc(TC).d[0].l, 'fr');
assert.equal(amDoc(TC).n, '', 'sans ami ni demande : ni pseudo ni photo envoyés avec l\'appareil');
await closeSheets(pc);
await pb.evaluate(id => openPublicLink(id), SIDC); await pb.waitForSelector('.pubv.on .am-pub [data-am="add"]');
await pb.click('.am-pub [data-am="add"]'); await pb.waitForSelector('.am-pub[data-st="sent"]');
await until(() => F.fcmFor(TOKC).length === 1);
const mc = F.fcmFor(TOKC)[0]; assert.deepEqual(mc.notification, { title: 'Demande d\'ami', body: 'Bob veut t\'ajouter en ami sur Mana Orbit.' }); assert.equal(mc.data.url, './?amis=1');
await pb.evaluate(() => TR.pub.el.__close());
await pc.evaluate(n => window.__pn.fire('pushNotificationReceived', { title: n.notification.title, body: n.notification.body, data: n.data }), mc);
await pc.waitForSelector('#btnAccount[data-dot="1"]', { timeout: 8000 }); assert.match(await tc(pc, '#toast'), /^Demande d'ami · Bob veut t'ajouter en ami sur Mana Orbit\.Voir$/);
await pc.evaluate(u => window.__pn.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: u } } }), mc.data.url);
await pc.waitForSelector('.am-sheet.open .am-row[data-id="' + TB + '"] [data-am="no"]', { timeout: 8000 });
await pc.click('.am-sheet [data-am="no"]'); await pc.waitForFunction(() => /Demande refusée/.test(document.querySelector('#toast').textContent));
assert.equal(await pc.$eval('#btnAccount', b => b.dataset.dot), '0'); assert.ok(!amDoc(TC).i[TB] && amDoc(TB).o[TC], 'refusée : rien chez Carol, toujours « envoyée » chez Bob');
await closeSheets(pc);
await pc.evaluate(() => amOut()); await until(() => !amDoc(TC).d.length); assert.equal(amDoc(TC).d.length, 0, 'déconnexion : appareil retiré du compte');
assert.deepEqual(Cc.errs, [], 'aucune erreur dans la console (Carol, appli)');
ok('appli Android : appareil enregistré (feuille Amis › Notifications), demande notifiée par FCM, reçue appli ouverte (toast, point), touchée → feuille Amis ; refus ; déconnexion → appareil retiré');

/* ── Retrait : plus rien dans un sens ni dans l'autre ─────────────────────────────────────────── */
await pb.evaluate(t => amOpenFriend(t), TA); await pb.waitForSelector('.pubv.on .am-rm:not([hidden]) [data-am="rm"]');
assert.equal(await tc(pb, '.pubv .am-rm'), 'Retirer Alice de mes amis');
await pb.click('.pubv [data-am="rm"]'); await pb.waitForSelector('#amRmGo');
await shot(pb, '10-retirer');
await pb.click('#amRmGo'); await pb.waitForFunction(() => !document.querySelector('.pubv.on'));
assert.match(await tc(pb, '#toast'), /Alice n'est plus dans tes amis/);
assert.ok(!amDoc(TA).f[TB] && !amDoc(TB).f[TA], 'retirée des deux côtés');
await until(() => !F.fs.docs.has(`amisdata/${TA}_t`)); assert.equal(F.fs.docs.has(`amisdata/${TA}_t`), false, 'plus d\'ami : ses listes sont effacées du serveur');
await pa.evaluate(() => amRefresh(true)); await openMe(pa, 'amis'); await pa.waitForSelector('.am-sheet .am-empty');
await closeSheets(pa);
ok('retrait : plus amis des deux côtés, listes effacées du serveur, feuille d\'Alice vide');

/* ── Serveur sans amis : rien n'apparaît ───────────────────────────────────────────────────────── */
await pb.evaluate(() => { CTX.amis = false; AM.l = null; amPaint(); });
await openMe(pb); assert.equal(await pb.$('#meAmis'), null, 'pas de ligne « Amis »'); await closeSheets(pb);
await pb.evaluate(id => openPublicLink(id), SID); await pb.waitForSelector('.pubv.on'); await pb.waitForTimeout(400);
assert.equal(await pb.$('.pubv .am-pub:not([hidden])'), null, 'pas de bouton « Ajouter en ami »');
ok('serveur sans amis (/__ping amis: false) : ni ligne, ni bouton');

for (const [n, e] of [['Alice', A.errs], ['Bob', B.errs]]) assert.deepEqual(e, [], 'aucune erreur dans la console (' + n + ')');
await browser.close(); world.stop(); F.stop();
console.log('AMIS E2E OK');
process.exit(0);
