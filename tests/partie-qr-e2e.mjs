// E2E compteur de vie SANS RÉSEAU (soirée en boutique) : carte joueur et QR code joueur. Vrai proxy.mjs (/api/partie), faux Firebase (amis-fakes), deux navigateurs.
// Bob (compte) reçoit sa carte joueur signée, affiche « Mon QR joueur » (carte « Compteur de vie » de l'accueil) avec son deck ; le réseau tombe chez les deux
// (context.setOffline) : sa carte reste affichée. Alice (compte, hors ligne) prépare la partie : ni QR code de la table ni co-hôte, un message le dit ; « Ajouter un
// joueur par QR » (caméra simulée, texte du QR code injecté : qrScanFeed) : Bob ajouté avec son compte, son deck et son commandant (une seule place s'il est relu),
// Zoé sans compte en invité, une carte falsifiée en invité avec un message ; partie jouée hors ligne, Bob gagne ; fin : « résultat gardé… » ; réseau revenu :
// envoyé tout seul, dans l'historique des comptes d'Alice ET de Bob (sa place). Puis Bob, hors ligne, réclame un résultat par son QR code : gardé, envoyé au retour du réseau.
// Captures : PU_SHOTS=<dossier> (apres-*.png), sinon shots/partie-qr-*.png.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, signInFake, toHome } from './e2e-world.mjs';
import { startFakes, tag } from './amis-fakes.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19345, env: { ...F.env, ALERTS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const UA = 'uid-alice-qr-e2e', UB = 'uid-bob-qr-e2e';
const IMG = 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg';
const DIR = process.env.PU_SHOTS || 'shots', PRE = process.env.PU_SHOTS ? 'apres-' : 'partie-qr-'; mkdirSync(DIR, { recursive: true });
const shot = (X, n) => X.p.screenshot({ path: `${DIR}/${PRE}${n}.png` });
const txt = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const hist = uid => { const d = F.fs.docs.get('parties/' + tag(uid)); return d ? JSON.parse(d.j).h : []; };
async function login(p, uid, name) {
  await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3 * 3600));
  await signInFake(p, { uid, email: uid + '@test.dev', displayName: name });
  await p.evaluate(n => { PROF.name = n; profStore(); }, name);
}
async function page() {
  const x = await newPage(browser, world, { perms: ['camera'] });
  await x.p.route('https://www.gstatic.com/**', r => r.abort());      // pas de SDK Firebase : comptes simulés
  await x.p.route('https://cdn.jsdelivr.net/**', r => r.abort());     // jsQR (lecteur de secours) : pas de réseau réel
  x.ctx = x.p.context(); return x;
}
const at360 = async (X, n, f) => { await X.p.setViewportSize({ width: 360, height: 740 }); if (f) await f(); await X.p.waitForTimeout(250); await shot(X, n + '-360'); await X.p.setViewportSize({ width: 390, height: 844 }); await X.p.waitForTimeout(150); };

/* ── Bob : carte joueur reçue avec du réseau, « Mon QR joueur » depuis l'accueil ─────────────────────────────────────── */
const B = await page();
await login(B.p, UB, 'Bob');
await B.p.evaluate(im => { D.list = [{ id: 'dk-bob', name: 'Vampires', text: 'Commandant\n1 Edgar Markov\n\n1 Sol Ring' }]; COLL.meta[ownKey('Edgar Markov')] = { ...(COLL.meta[ownKey('Edgar Markov')] || {}), im }; }, IMG);
await B.p.waitForFunction(() => CTX.partie === true && partiePk(), null, { timeout: 8000 });
await toHome(B.p); await B.p.waitForSelector('#hmPartie .hm-pu-qr');
assert.equal(await B.p.$eval('#hmPartie .hm-pu-qr', b => b.getAttribute('aria-label')), 'Mon QR joueur');
await B.p.$eval('#hmPartie', e => e.scrollIntoView({ block: 'center' })); await B.p.waitForTimeout(250);
await (await B.p.$('#hmPartie')).screenshot({ path: `${DIR}/${PRE}accueil-390.png` });
await at360(B, 'accueil', async () => { await B.p.$eval('#hmPartie', e => e.scrollIntoView({ block: 'center' })); });
await B.p.click('#hmPartie .hm-pu-qr'); await B.p.waitForSelector('.pu-myqr .qr-img svg');
await B.p.waitForFunction(() => /Carte joueur liée à ton compte/.test(document.querySelector('.pu-myqr-st').textContent), null, { timeout: 10000 });
await B.p.selectOption('#puQd', 'dk-bob');
await B.p.waitForFunction(() => /Edgar Markov/.test((document.querySelector('.pu-myqr-dk') || {}).textContent || ''));
const qrB = await B.p.$eval('.pu-myqr .qr-img', e => e.dataset.qr);
assert.match(qrB, /^MO1\|[\w-]{100,}\|\|Vampires\|Edgar Markov\|f[\w-]{22}$/, 'carte signée + deck, commandant, image'); assert.ok(qrB.length <= 360);
assert.equal(await B.p.$eval('.pu-myqr-n', e => e.hidden), true, 'compte : pas de prénom à taper');
assert.equal(await B.p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:partie:join')).d), 'dk-bob', 'deck gardé pour la fois suivante');
await B.p.waitForTimeout(300); await shot(B, 'mon-qr-joueur-390'); await at360(B, 'mon-qr-joueur');
ok('Bob : carte joueur reçue (signée), « Mon QR joueur » de l\'accueil avec son deck (' + qrB.length + ' caractères)');

/* ── Réseau coupé chez les deux : la carte de Bob reste là ───────────────────────────────────────────────────────── */
const A = await page();
await A.p.evaluate(() => { window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }; });      // lecteur du navigateur comme sur Android (rien à lire dans l'image simulée : texte injecté)
await login(A.p, UA, 'Alice');
await A.p.waitForFunction(() => CTX.partie === true && partiePk(), null, { timeout: 8000 });      // clé publique du serveur gardée (/__ping) : cartes vérifiées sans réseau
await A.ctx.setOffline(true); await B.ctx.setOffline(true);
await B.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await B.p.waitForTimeout(500);
await B.p.click('#hmPartie .hm-pu-qr'); await B.p.waitForSelector('.pu-myqr .qr-img svg');
assert.match(await txt(B.p, '.pu-myqr-st'), /Carte joueur liée à ton compte, valable jusqu'au/); assert.equal(await B.p.$eval('.pu-myqr .qr-img', e => e.dataset.qr), qrB, 'même QR code sans réseau');
await shot(B, 'mon-qr-joueur-hors-ligne-390');
ok('hors ligne : la carte de Bob s\'affiche toujours (gardée sur son téléphone)');

/* ── Alice, hors ligne : préparation sans table ni co-hôte ; Bob ajouté par son QR code ──────────────────────────── */
await toHome(A.p); await A.p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await A.p.waitForSelector('.pu.on .pu-setup'); await A.p.waitForTimeout(400);
assert.equal(await A.p.$eval('.pu .dv-head [data-pu="myqr"]', b => b.getAttribute('aria-label')), 'Mon QR joueur', 'bouton QR en haut à droite de l\'en-tête');
const hb = await A.p.$eval('.pu .dv-head [data-pu="myqr"]', b => { const r = b.getBoundingClientRect(); return [r.right, innerWidth]; }); assert.ok(hb[1] - hb[0] < 24, 'contre le bord droit');
assert.equal(await A.p.$('.pu-qr-img'), null, 'hors ligne : pas de QR code de la table'); assert.equal(await A.p.$('#puAllco'), null, 'ni « Tout le monde est co-hôte »');
assert.match(await txt(A.p, '.pu-off'), /les autres téléphones ne suivent pas la partie/);
await shot(A, 'preparation-hors-ligne-390'); await at360(A, 'preparation-hors-ligne');
await A.p.click('[data-pu="scan"]'); await A.p.waitForSelector('.qrs-sheet video');
await A.p.waitForFunction(() => { const v = document.querySelector('.qrs-sheet video'); return v && v.videoWidth > 0; }, null, { timeout: 8000 }).catch(() => {});      // caméra simulée de Chromium
assert.equal(await A.p.evaluate(() => sheets[sheets.length - 1].wrap.querySelector('h2').textContent), 'Ajouter un joueur par QR');
await A.p.evaluate(t => qrScanFeed(t), qrB);
await A.p.waitForFunction(() => /Bob ajouté : la partie ira dans son historique/.test(document.querySelector('.qrs-msg').textContent), null, { timeout: 5000 });
await A.p.waitForTimeout(200); await shot(A, 'ajouter-par-qr-390');
let pl = await A.p.evaluate(() => PU.st.places.map(p => [p.pos, p.sorte, p.nom, (p.deck || {}).nom || '', (p.deck || {}).commandant || '', !!(p.deck || {}).image, (p.uid || '').length > 100]));
assert.deepEqual(pl, [[1, 'moi', 'Alice', '', '', false, false], [2, 'compte', 'Bob', 'Vampires', 'Edgar Markov', true, true]]);
await A.p.waitForTimeout(2600); await A.p.evaluate(t => qrScanFeed(t), qrB);
await A.p.waitForFunction(() => /Bob est déjà à la table/.test(document.querySelector('.qrs-msg').textContent));
assert.equal(await A.p.evaluate(() => PU.st.places.length), 2, 'même carte relue : une seule place');
await A.p.evaluate(() => qrScanFeed('MO1||Zo%C3%A9|Elfes|Lathril'));
await A.p.waitForFunction(() => /Zoé ajouté en invité \(sans compte\)/.test(document.querySelector('.qrs-msg').textContent));
const forged = await A.p.evaluate(t => { const b = Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), c => c.charCodeAt(0)); const n = new TextEncoder().encode('Mallory'), x = new Uint8Array(101 + n.length); x.set(b.subarray(0, 101)); x.set(n, 101); let s = ''; for (const v of x) s += String.fromCharCode(v); return 'MO1|' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, qrB.split('|')[1]);
await A.p.evaluate(t => qrScanFeed(t), forged);
await A.p.waitForFunction(() => /Carte de Mallory non reconnue : ajouté en invité/.test(document.querySelector('.qrs-msg').textContent));
assert.equal(await A.p.$eval('.qrs-msg', e => e.classList.contains('bad')), true, 'message mis en avant');
await A.p.evaluate(() => qrScanFeed('https://manaorbit.app/?table=ABC234'));
await A.p.waitForFunction(() => /C'est le QR code d'une table/.test(document.querySelector('.qrs-msg').textContent));
await A.p.click('.qrs-sheet .sheet-foot [data-close]'); await A.p.waitForFunction(() => !sheets.length);
assert.equal(await A.p.evaluate(() => !!document.querySelector('.qrs-sheet video') && document.querySelector('.qrs-sheet video').srcObject && document.querySelector('.qrs-sheet video').srcObject.active), false, 'caméra arrêtée');
pl = await A.p.evaluate(() => PU.st.places.map(p => [p.pos, p.sorte, p.nom]));
assert.deepEqual(pl, [[1, 'moi', 'Alice'], [2, 'compte', 'Bob'], [3, 'invite', 'Zoé'], [4, 'invite', 'Mallory']]);
assert.match(await txt(A.p, '.pu-seats li:nth-child(2)'), /Bob ?QR joueur ?Edgar Markov/);
assert.equal(await A.p.$$eval('.pu-seats .pu-ctag', x => x.length), 1, 'pastille « QR joueur » : Bob seul (compte)');
await A.p.$eval('.pu-seats', e => e.scrollIntoView({ block: 'center' })); await A.p.waitForTimeout(200);
await shot(A, 'place-ajoutee-hors-ligne-390'); await at360(A, 'place-ajoutee-hors-ligne', async () => { await A.p.$eval('.pu-seats', e => e.scrollIntoView({ block: 'center' })); });
ok('Alice hors ligne : ni table ni co-hôte (message) ; Bob ajouté par son QR code (compte, deck, commandant, image), une seule place relu ; Zoé invitée ; carte falsifiée : invité avec un message');

/* ── Partie jouée hors ligne ; fin : résultat gardé ; réseau revenu : envoyé, dans l'historique des deux comptes ─────── */
await A.p.click('[data-pu="first"][data-pos="1"]'); await A.p.click('[data-pu="start"]'); await A.p.waitForSelector('.pu.pu-game');
assert.ok(await A.p.$('.pu-t[data-pos="2"].art img.pu-art'), 'illustration du commandant de Bob en fond (chargée dès que le réseau le permet)');
await A.p.click('.pu-t[data-pos="2"] .pu-hit.m'); await A.p.click('.pu-t[data-pos="1"] .pu-hit.m');
await A.p.evaluate(() => puMenu()); await A.p.waitForSelector('.pu-sheet .pu-off');
assert.equal(await A.p.$('#puMAllco'), null); await A.p.$eval('.pu-sheet .pu-off', e => e.scrollIntoView({ block: 'end' })); await A.p.waitForTimeout(500); await shot(A, 'menu-hors-ligne-390');
await A.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
await A.p.evaluate(() => { for (const pos of [1, 3, 4]) puSet(partieEliminate(PU.st, pos, 'vie')); });
await A.p.evaluate(() => puEndSheet()); await A.p.waitForSelector('.pu-wins [data-w="2"][aria-pressed="true"]');
await A.p.click('.sheet [data-ok]'); await A.p.waitForSelector('.pu-rank');
assert.match(await txt(A.p, '.pu-net.off'), /Hors ligne : le résultat est gardé sur ce téléphone et partira dès le retour du réseau\. Elle ira aussi dans l'historique de Bob \(QR joueur\)\./);
assert.equal(await A.p.evaluate(() => partieQueue().length), 1); assert.equal(hist(UA).length + hist(UB).length, 0, 'rien n\'est parti');
await A.p.waitForTimeout(300); await shot(A, 'fin-hors-ligne-390');
await A.ctx.setOffline(false);
await A.p.waitForFunction(() => partieQueue().length === 0, null, { timeout: 15000 });
await A.p.waitForSelector('.pu-net.ok'); assert.match(await txt(A.p, '.pu-net.ok'), /Résultat envoyé : partie enregistrée\. Aussi dans l'historique de Bob\./);
await A.p.waitForTimeout(200); await shot(A, 'fin-envoyee-390');
const ha = hist(UA), hbb = hist(UB);
assert.equal(ha.length, 1); assert.equal(hbb.length, 1, 'dans l\'historique du compte de Bob'); assert.equal(ha[0].id, hbb[0].id);
assert.deepEqual([hbb[0].moi, hbb[0].src, hbb[0].places.find(p => p.pos === 2).vainqueur, hbb[0].places.find(p => p.pos === 2).commandant], [2, 's', true, 'Edgar Markov']);
assert.deepEqual(ha[0].places.map(p => [p.nom, p.sorte]), [['Alice', 'moi'], ['Bob', 'compte'], ['Zoé', 'invite'], ['Mallory', 'invite']]);
assert.ok(!JSON.stringify(hbb).includes(qrB.split('|')[1].slice(0, 30)), 'la carte n\'est pas gardée');
ok('partie hors ligne : résultat gardé, puis envoyé au retour du réseau ; dans l\'historique des comptes d\'Alice et de Bob (sa place, sa victoire)');

/* ── Bob, hors ligne, scanne le QR code d'un résultat : réclamation gardée, envoyée au retour du réseau ─────────────── */
const link = await A.p.evaluate(() => { const st = partieEnd(partieStart(partieAddPlace(partieNew({ moi: { nom: 'Alice' } }), { sorte: 'invite', nom: 'Bob' })), [2]); return partieResultLink(partieResult(st), { max: PU_QR_MAX }); });
await B.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
await B.p.evaluate(l => { history.replaceState(null, '', l.replace(/^https:\/\/manaorbit\.app\//, location.pathname)); handleLaunch(); }, link);
await B.p.waitForSelector('.pu-sheet [data-cl="2"]', { timeout: 5000 });
assert.match(await txt(B.p, '.pu-sheet .hint'), /Hors ligne : ajoutée à « Mes parties » tout de suite, envoyée à ton compte au retour du réseau\./);
await shot(B, 'reclamation-hors-ligne-390');
await B.p.click('.pu-sheet [data-cl="2"]'); await B.p.waitForFunction(() => partieQueue().some(x => x.k === 'claim'));
assert.equal(hist(UB).length, 1, 'pas encore envoyée');
await B.ctx.setOffline(false);
await B.p.waitForFunction(() => !partieQueue().length, null, { timeout: 15000 });
assert.equal(hist(UB).length, 2); assert.deepEqual([hist(UB).find(x => x.src === 'q').moi], [2]);
ok('réclamation par le QR code du résultat sans réseau : gardée, envoyée au retour du réseau (historique du compte de Bob)');

for (const X of [A, B]) assert.equal(await X.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'pas de défilement horizontal');
const errs = [...A.errs, ...B.errs].filter(e => !/gstatic|jsdelivr|ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(e));
console.log('erreurs page :', errs.length ? errs : 'aucune'); assert.deepEqual(errs, []);
await browser.close(); world.stop(); F.stop && F.stop(); console.log('\nPARTIE QR E2E OK'); process.exit(0);
