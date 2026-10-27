// E2E musée de Magic (pack « magic », EVENT_FORCE=magic-2027, 1er jour ; port 19889) : carte du musée de l'accueil (5 salles, frise de la salle en cours :
// 6 places et leurs années), 5 reliques du jour trouvées → cartel de chaque relique dans l'ordre de l'histoire (1993 · Le carnet du prototype…), fiche d'une
// relique exposée ; la 6e (progression simulée) inaugure la salle : plein écran « La salle « Les origines » est inaugurée ! », badge « Visiteur » ; badges
// comptés en salles (1, 2, 4, 5), galerie de la feuille de la fête ; 5e salle : célébration « Les 5 salles du musée sont ouvertes ». Puis (port 19890, lotus
// d'or forcé : EVENT_GOLD_P=1, aperçu du compte de l'éditeur au jour choisi) : jour J (5 août : gâteau en plein écran une fois, 10 reliques, data-evphase="bday"),
// lotus d'or trouvé (plein écran, couleur de classeur « Lotus d'or » acquise). Captures : MUSEUM_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, signInFake, ok } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';

const world = await startWorld({ port: 19889, env: { EVENT: '1', EVENT_FORCE: 'magic-2027', EVENT_SECRET: 'e2e', EVENT_GOLD_P: '0' } });      // pas de lotus d'or ici (tiré au hasard : 1 %)
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.MUSEUM_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const ready = p => p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });
const tap = async (p, s) => {      // pose la cachette s dans le haut de l'accueil, puis la touche
  await p.evaluate(x => { EV_HIDE[x] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, s);
  await p.waitForFunction(x => { evScan(); const y = EV.pks.get(x); return y && y.ok; }, s, { timeout: 8000 });
  await p.evaluate(x => EV.pks.get(x).el.click(), s);
};
const home = p => p.evaluate(() => { document.querySelectorAll('.ev-msg').forEach(e => e.remove()); evHomePaint(); document.getElementById('hmEvent').scrollIntoView({ block: 'center' }); }).then(() => p.waitForTimeout(300));

const { p, errs } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'magic-2027': 1 } })); });
await p.goto(world.url + '?event'); await ready(p);

/* ── 1) Accueil : le musée ── */
assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'magic');
await p.waitForSelector('#hmEvent.hm-mus .mus-halls');
await home(p);
assert.equal(await p.$$eval('#hmEvent .mus-h', l => l.length), 5, '5 salles');
assert.equal(await p.$$eval('#hmEvent .mus-h.cur', l => l.map(f => f.dataset.i).join()), '0', 'la 1re en cours');
assert.equal(await p.$$eval('#hmEvent .mus-r', l => l.length), 6, '6 places sur la frise');
assert.equal(await p.$$eval('#hmEvent .mus-r.on', l => l.length), 0, 'aucune relique exposée');
assert.deepEqual(await p.$$eval('#hmEvent .mus-r b', l => l.map(b => b.textContent)), ['1993', '1993', '1993', '1993', '1993', '1994'], 'années de la salle 1');
assert.match(await p.textContent('#hmEvent .hm-ev-h'), /Musée de Magic 2027.*Encore 5 reliques à dénicher aujourd'hui.*0\s*\/\s*30/s);
assert.match(await p.textContent('#hmEvent .mus-cur'), /Salle 1 sur 5 · Les origines.*1993 – 1994/s);
assert.equal(await p.$$eval('#hmEvent svg', l => l.length > 6), true, 'dessins SVG');
await shot(p, 'musee-0');
ok('accueil : le musée, 5 salles, la frise de la salle 1 (6 places, leurs années), 0 / 30 reliques');

/* ── 2) Les 5 reliques du jour : cartel de chacune, dans l'ordre de l'histoire ── */
const me = await p.evaluate(() => EV.st.me); assert.equal(me.spots.length, 5);
const names = ['1993 · Le carnet du prototype', '1993 · Le booster d\'Alpha', '1993 · Les coins d\'Alpha', '1993 · Le dé des 20 points de vie', '1993 · La lampe d\'Arabian Nights'];
for (const [i, x] of me.spots.entries()) {
  await tap(p, x.s);
  await p.waitForFunction(k => !EV.fly && EV.st.me.found.length === k + 1, i, { timeout: 8000 });
  await p.waitForSelector('.ev-msg.mus-msg.on', { timeout: 5000 });
  assert.equal(await p.textContent('.mus-msg .ev-msg-t > b'), names[i], 'cartel ' + (i + 1));
  if (i === 1) await shot(p, 'cartel');
}
assert.match(await p.textContent('.mus-msg'), /Toutes les reliques du jour sont au musée/);
await home(p);
assert.equal(await p.$$eval('#hmEvent .mus-r.on', l => l.length), 5); assert.match(await p.textContent('#hmEvent .hm-ev-h'), /5\s*\/\s*30/);
assert.equal(await p.$$('.adv-open').then(l => l.length), 0, 'pas d\'inauguration avant la 6e');
await shot(p, 'musee-5');
ok('5 reliques : un cartel par trouvaille, dans l\'ordre de l\'histoire (carnet, booster d\'Alpha…), 5 exposées sur la frise');

/* ── 3) Fiche d'une relique exposée ── */
await p.click('#hmEvent .mus-r.on[data-mus="1"]'); await p.waitForSelector('.mus-sheet.open .mus-card');
assert.match(await p.textContent('.mus-sheet.open'), /Le booster d'Alpha.*1993.*Relique 2 sur 30 · Les origines.*5 août 1993.*295 cartes/s);
await shot(p, 'fiche');
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('relique exposée touchée : sa fiche (nom, année, salle, histoire)');

/* ── 4) 6e relique (progression simulée) : la salle est inaugurée ── */
await p.evaluate(() => { EV.st.me.n = 6; EV.st.me.jours = { ...EV.st.me.jours, '2027-07-30': ['x'] }; musAfterFind(5, null, EV.st.me); });
await p.waitForSelector('.mus-open.on', { timeout: 8000 });
assert.match(await p.textContent('.mus-open'), /Salle 1 sur 5.*La salle « Les origines » est inaugurée !.*1 sur 5 : la salle suivante t'attend.*Badge « Visiteur »/s);
assert.equal(await p.$$eval('.mus-open .mus-open-r > span', l => l.length), 6, 'les 6 reliques de la salle');
assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.mus-open')).position), 'fixed');
await p.waitForTimeout(2600); await shot(p, 'inauguration');
await p.click('.mus-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.mus-open'));
await home(p);
assert.equal(await p.$$eval('#hmEvent .mus-h.done', l => l.length), 1); assert.equal(await p.$$eval('#hmEvent .mus-h.cur', l => l.map(f => f.dataset.i).join()), '1');
assert.match(await p.textContent('#hmEvent .mus-cur'), /Salle 2 sur 5 · L'âge d'or/); assert.match(await p.textContent('#hmEvent .hm-ev-ft'), /prochain badge à 2 salles/);
ok('6e relique : inauguration de « Les origines » (plein écran, 6 reliques, badge « Visiteur »), salle 2 en cours');

/* ── 5) Badges comptés en salles, galerie de la feuille de la fête ── */
const b = await p.evaluate(() => { const x = evBadges().find(z => z.ev === 'magic-2027'); return { v: x.v(), tiers: x.tiers, d: x.d, names: x.names }; });
assert.deepEqual(b.tiers, [1, 2, 4, 5]); assert.equal(b.v, 1); assert.deepEqual(b.d, ['{n} salle inaugurée', '{n} salles inaugurées']);
assert.deepEqual(b.names, ['Visiteur', 'Guide du musée', 'Archiviste', 'Conservateur légendaire']);
await p.evaluate(() => evSheetOpen()); await p.waitForSelector('.ev-sheet.open .mus-g');
assert.match(await p.textContent('.ev-sheet.open .ev-sh-top'), /1 salle inaugurée/);
assert.equal(await p.$$eval('.ev-sheet.open .mus-g', l => l.length), 5); assert.equal(await p.$$eval('.ev-sheet.open .mus-gr.on', l => l.length), 6);
assert.match(await p.textContent('.ev-sheet.open .ev-sbs'), /Guide du musée.*2 salles inaugurées.*Conservateur légendaire.*5 salles inaugurées/s);
await shot(p, 'galerie');
await p.click('.ev-sheet.open .mus-gr.on[data-mus="5"]'); await p.waitForSelector('.mus-sheet.open'); assert.match(await p.textContent('.mus-sheet.open'), /Les engrenages d'Antiquities.*1994/s);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('badges du musée : 1, 2, 4, 5 salles inaugurées ; galerie salle par salle dans la feuille de la fête');

/* ── 6) Dernière salle (progression simulée) : inauguration puis célébration ── */
await p.evaluate(() => { EV.st.me.n = 30; musAfterFind(29, null, EV.st.me); });
await p.waitForSelector('.mus-open.on'); assert.match(await p.textContent('.mus-open'), /Salle 5 sur 5.*« Aujourd'hui ».*Les 5 salles sont ouvertes.*Conservateur légendaire/s);
await p.click('.mus-open [data-adv-close]'); await p.waitForSelector('.ev-party.on', { timeout: 5000 });
assert.match(await p.textContent('.ev-party'), /5 sur 5.*Les 5 salles du musée sont ouvertes/s);
await p.waitForTimeout(900); await shot(p, 'fin');
ok('5e salle : inauguration, puis « Les 5 salles du musée sont ouvertes » (Conservateur légendaire)');

assert.deepEqual(errs, []);
world.stop();

/* ── 7) Jour J et lotus d'or (aperçu de l'éditeur, jour choisi) ── */
const F = await startFakes();
const w2 = await startWorld({ port: 19890, env: { EVENT: '1', EVENT_SECRET: 'e2e', EVENT_GOLD_P: '1', ADMIN_EMAILS: 'uid-e2e-ed@test.dev', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL } });
{
  const { p, errs } = await newPage(browser, w2, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
  await p.addInitScript(() => { localStorage.setItem('deckdeal:ev', JSON.stringify({ seen: { 'magic-2026': 1 } })); });
  await p.goto(w2.url + '?event'); await p.waitForTimeout(500);
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-e2e-ed')); await signInFake(p);
  await p.evaluate(() => { EV.adm = EV.uid; evPvSet('magic~7', true); });      // veille du jour J
  await p.waitForFunction(() => EV.st && EV.st.ev.preview && EV.st.ev.day === '2026-08-04' && EV.st.me, null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => document.documentElement.dataset.evphase), undefined); assert.equal(await p.evaluate(() => EV.st.me.spots.length), 5);
  await p.evaluate(() => { EV.adm = EV.uid; openSettings(); }); await p.waitForSelector('[data-evpv="next"]');      // « Passer au jour suivant » : 4 → 5 août
  assert.match(await p.textContent('#setEvPvD'), /Jour 8 · .*🎂 anniversaire de Magic/s);
  assert.match(await p.textContent('[data-evpv="next"]'), /Jour 7 → jour 8/); await p.click('[data-evpv="next"]');
  await p.waitForFunction(() => EV.st && EV.st.ev.day === '2026-08-05' && EV.pv === 'magic~8' && EV.st.me && EV.st.me.spots.length === 10, null, { timeout: 15000 });
  await p.evaluate(() => { evLsSet({ seen: { ...evLs().seen, 'magic-2026': 1 } }); while (sheets.length) sheets[sheets.length - 1].close(); evHomePaint(); });
  await p.waitForSelector('.mus-bday.on', { timeout: 15000 });
  assert.match(await p.textContent('.mus-bday'), /5 août 2026.*Joyeux anniversaire, Magic !.*33 ans plus tard.*5 reliques de plus/s);
  assert.match(await p.textContent('.mus-bday-age'), /^33$/);
  await p.waitForTimeout(1600); await shot(p, 'jour-j');
  await p.click('.mus-bday [data-mb="go"]'); await p.waitForFunction(() => !document.querySelector('.mus-bday'));
  assert.equal(await p.evaluate(() => document.documentElement.dataset.evphase), 'bday');
  await home(p); assert.match(await p.textContent('#hmEvent .mus-n-bday'), /Magic a 33 ans aujourd'hui : 5 reliques de plus/);
  assert.match(await p.textContent('#hmEvent .hm-ev-h'), /Encore 10 reliques/);
  await p.evaluate(() => { evHomePaint(); }); assert.equal(await p.$$('.mus-bday.on').then(l => l.length), 0, 'une fois par jour');
  ok('« Passer au jour suivant » jusqu\'au jour J : gâteau en plein écran (une fois, 33 ans), 10 reliques, data-evphase="bday"');
  // lotus d'or (forcé) : en or dans sa cachette, trouvé → plein écran, couleur rare acquise
  const x = await p.evaluate(() => EV.st.me.spots[0]); assert.equal(x.g, 1);
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, x.s);
  await p.waitForFunction(s => { evScan(); const y = EV.pks.get(s); return y && y.ok; }, x.s, { timeout: 8000 });
  assert.equal(await p.evaluate(s => EV.pks.get(s).el.classList.contains('ev-gold'), x.s), true, 'lotus d\'or dans sa cachette');
  await shot(p, 'lotus-cachette');
  await p.evaluate(s => EV.pks.get(s).el.click(), x.s);
  await p.waitForSelector('.mus-open.mus-goldo.on', { timeout: 8000 });
  assert.match(await p.textContent('.mus-open'), /Relique légendaire.*Le lotus d'or !.*Couleur rare : « Lotus d'or »/s);
  await p.waitForTimeout(1600); await shot(p, 'lotus');
  await p.click('.mus-open [data-adv-close]'); await p.waitForFunction(() => !document.querySelector('.mus-open'));
  assert.equal(await p.evaluate(() => evCoverOk('lotus')), true, 'couleur « Lotus d\'or » acquise');
  await home(p); assert.match(await p.textContent('#hmEvent .mus-n-gold'), /lotus d'or/); await shot(p, 'musee-lotus');
  ok('lotus d\'or : en or dans sa cachette, plein écran, couleur de classeur « Lotus d\'or » acquise, mot sur la carte');
  assert.deepEqual(errs, []);
}
w2.stop(); F.stop(); await browser.close();
console.log('MUSEUM E2E OK');
