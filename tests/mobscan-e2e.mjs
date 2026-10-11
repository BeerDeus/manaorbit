// E2E « Scan mobile » : un PC (page « Ajouter des cartes », souris, grand écran) et un téléphone sur le même compte, face à un faux document Firestore partagé
// users/u1/meta/scan (setDoc, updateDoc, arrayUnion, arrayRemove, écoute temps réel). Le PC attend ; le téléphone voit « Ton PC attend des cartes », scanne en mode
// « vers ton PC » ; chaque carte (et chaque correction, édition comprise) arrive dans le lot du PC, avec l'édition décidée sur le téléphone (scaned.js) ;
// « Terminer » avec des cartes sans édition : confirmation ; « Arrêter », signe de vie trop vieux, compte absent.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18997 });
world.psets['Wrath of God'] = ['m21', 'lea'];      // pas en 2X2 : reste à choisir
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = { scan: null, subs: new Map(), pushes: 0, takes: 0, deny: false };
const clone = o => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const broadcast = () => { for (const pg of server.subs.values()) setTimeout(() => pg.evaluate(d => window.__scanCb && window.__scanCb(d), server.scan).catch(() => {}), 30); };
const sets = { object: 'list', data: [{ code: '2x2', name: 'Double Masters 2022', icon_svg_uri: 'https://svgs.scryfall.io/sets/2x2.svg?1' }] };

async function device(name, opts = {}) {
  const pg = await newPage(browser, world, { goto: false, ...opts });
  const { p } = pg;
  await p.route('https://www.gstatic.com/**', r => r.abort());      // pas de vrai SDK : faux compte injoigné ci-dessous
  await p.route('https://api.scryfall.com/sets', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: sets }));
  await p.exposeFunction('__scanGet', async () => clone(server.scan));
  await p.exposeFunction('__scanSet', async doc => { server.scan = doc; broadcast(); return 1; });
  await p.exposeFunction('__scanUpd', async patch => { if (!server.scan) return { err: 'not-found' }; Object.assign(server.scan, patch); broadcast(); return 1; });
  await p.exposeFunction('__scanPush', async items => { if (server.deny) return { err: 'permission-denied' }; if (!server.scan) return { err: 'not-found' }; server.pushes++; for (const x of items) if (!server.scan.items.some(y => same(y, x))) server.scan.items.push(x); broadcast(); return 1; });
  await p.exposeFunction('__scanTake', async items => { if (!server.scan) return 1; server.takes++; server.scan.items = server.scan.items.filter(y => !items.some(x => same(x, y))); broadcast(); return 1; });
  await p.exposeFunction('__scanSub', () => { server.subs.set(name, p); });
  await p.goto(world.url); await p.waitForFunction(() => D.authReady, null, { timeout: 15000 });
  return pg;
}
async function signIn(p) {
  await p.evaluate(() => {
    const err = r => { if (r && r.err) throw Object.assign(new Error(r.err), { code: r.err }); };
    D.cloud = {
      onUser() {}, watch: (uid, cb) => { cb([], false); return () => {}; }, newId: () => 'x', save: async () => {}, remove: async () => {}, saveColl: async () => {},
      watchColl(uid, cb) { cb(null, false, false); return () => {}; }, txColl: async (uid, fn) => { const out = fn(window.__collDoc || null); if (out) window.__collDoc = out; return out; }, pullColl: async () => ({ data: window.__collDoc || null }),
      watchMeta(uid, id, cb) {
        if (id !== 'scan') { cb(null, false, false); return () => {}; }
        window.__scanCb = d => cb(d, false, false); window.__scanSub(); window.__scanGet().then(d => cb(d, false, false)); return () => { window.__scanCb = null; };
      },
      saveMeta: async (uid, id, doc) => { if (id === 'scan') err(await window.__scanSet(JSON.parse(JSON.stringify(doc)))); },
      updMeta: async (uid, id, patch) => { if (id === 'scan') err(await window.__scanUpd(JSON.parse(JSON.stringify(patch)))); },
      scanPush: async (uid, items) => err(await window.__scanPush(JSON.parse(JSON.stringify(items)))),
      scanTake: async (uid, items) => err(await window.__scanTake(JSON.parse(JSON.stringify(items)))),
      pullMeta: async () => ({ data: null }), signOut: async () => { onUser(null); }, provider: () => 'password',
    };
    D.state = 'ready'; D.err = '';
    onUser({ uid: 'u1', email: 'beer@example.com', displayName: 'Beer', reload: async () => {} });
  });
}
const lotRows = p => p.$$eval('.lot-it', r => r.map(x => ({ name: x.querySelector('.row-name').textContent, tags: [...x.querySelectorAll('.tag')].map(t => t.textContent.trim()) })));
const collX = (p, k) => p.evaluate(k => { const x = COLL.map[k]; return x ? x.x || { [x.l || '']: x.q } : null; }, k);

/* ── 1) le PC (souris, grand écran) : encadré « Scan mobile » ; sans compte : explication et connexion ─────────────────── */
const PC = await device('pc', { ctx: { isMobile: false, hasTouch: false, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 },
  init: `try { localStorage.setItem('deckdeal:lot:v1', JSON.stringify({ list: [], set: '2x2', lang: '' })); } catch (e) {}` });
const pc = PC.p;
await toHome(pc); await pc.evaluate(() => openLot()); await pc.waitForSelector('.lot.on .mob-pc:not([hidden])');
assert.match(await txt(pc, '.mob-pc'), /Scan mobile Scanne avec ton téléphone : chaque carte arrive ici\. Activer/);
await pc.click('.mob-pc [data-act="mobgo"]'); await pc.waitForSelector('.sheet-wrap.open [data-go]');
assert.match(await txt(pc, '.sheet-wrap.open'), /Connecte-toi avec le même compte sur ce PC et sur ton téléphone/);
await pc.keyboard.press('Escape'); await pc.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.equal(server.scan, null, 'rien écrit sans compte');
ok('PC : encadré « Scan mobile » (ordinateur seulement) ; sans compte : « connecte-toi avec le même compte », rien d\'écrit');

/* ── 2) PC connecté : « Activer » → document « scan » ; le téléphone voit « Ton PC attend des cartes », pas le PC ───────────── */
await signIn(pc); await pc.click('.mob-pc [data-act="mobgo"]');
await pc.waitForFunction(() => document.querySelector('.mob-pc').dataset.on === '1');
assert.equal(server.scan.on, true); assert.deepEqual(server.scan.items, []); assert.match(server.scan.by, /Chrome/); assert.ok(server.scan.s && server.scan.dev);
assert.match(await txt(pc, '.mob-pc'), /Scan mobile activé Ouvre Mana Orbit sur ton téléphone/);
const PH = await device('phone'); const ph = PH.p;
assert.equal(await ph.$('.lot .mob-pc:not([hidden])'), null);
await signIn(ph); await ph.waitForSelector('#mobBar', { timeout: 5000 });
assert.match(await txt(ph, '#mobBar'), /Ton PC attend des cartes Chrome/);
await sleep(300); assert.equal(await pc.$('#mobBar'), null, 'le PC ne se propose pas à lui-même');
await ph.screenshot({ path: 'shots/mobscan-1-telephone.png' });
ok('PC connecté : « Activer » écrit { on, s, dev, by, at, items: [] } ; le téléphone (même compte) voit « Ton PC attend des cartes · Chrome… », pas le PC');

/* ── 3) le téléphone scanne « vers ton PC » : chaque carte arrive dans le lot du PC avec l'édition du téléphone ; corrections suivies ─────── */
await ph.click('#mobBar [data-act="go"]'); await ph.waitForSelector('.dv.scan.remote.on'); assert.equal(await ph.$('#mobBar'), null, 'bandeau caché pendant le scan');
assert.equal(await txt(ph, '.dv-foot [data-act="done"]'), 'Terminer');
await ph.evaluate(() => scanAdd({ key: 'sol ring', name: 'Sol Ring', card: 'fr', score: 1, raw: 'Anneau solaire' }, 1, false));
await pc.waitForFunction(() => document.querySelectorAll('.lot-it').length === 1, null, { timeout: 8000 });
await pc.waitForFunction(() => COLL.map['sol ring'], null, { timeout: 5000 });
assert.deepEqual(await collX(pc, 'sol ring'), { fr: 1 }, 'langue lue au scan ; première carte du scan : édition à choisir (sur le téléphone), pas l\'extension du lot du PC');
await pc.waitForFunction(() => /1 carte reçue · Sol Ring/.test(document.querySelector('.mob-pc').textContent));
// édition choisie sur le téléphone : la ligne du lot du PC suit (retrait de la ligne sans édition, ajout sur celle de l'édition), sans « reçue » de plus
await ph.click('.sc-item[data-k="sol ring"] .sc-ed.todo'); await ph.waitForSelector('.ced-sheet .ced-t[data-i]');
await ph.locator('.ced-sheet .ced-t', { hasText: '2X2 101' }).first().click();
await pc.waitForFunction(() => { const x = COLL.map['sol ring']; return x && x.x && x.x['fr|2x2|101'] === 1 && !x.x.fr; }, null, { timeout: 8000 });
await pc.waitForFunction(() => document.querySelectorAll('.lot-it').length === 1 && /Double Masters 2022 #101/.test(document.querySelector('.lot-it').textContent), null, { timeout: 5000 });
assert.match(await txt(pc, '.mob-pc'), /1 carte reçue · Sol Ring/, 'une correction n\'est pas une carte de plus');
await ph.waitForFunction(() => /1 carte envoyée/.test((document.querySelector('.sc-remote') || {}).textContent || ''));
await sleep(200); assert.deepEqual(server.scan.items, [], 'reçue : retirée du document par le PC'); assert.equal(await ph.evaluate(() => collQty('sol ring')), 0, 'rien dans la collection du téléphone');
// « + » sur le téléphone : un exemplaire de plus sur la même ligne du lot
await ph.click('.sc-item [data-a="inc"]');
await pc.waitForFunction(() => { const x = COLL.map['sol ring']; return x && x.q === 2; }, null, { timeout: 5000 });
assert.equal(await pc.$$eval('.lot-it', r => r.length), 1, 'même carte, même ligne : le lot la regroupe'); assert.ok((await lotRows(pc))[0].tags.includes('× 2'));
// deuxième carte, puis retirée (✕) sur le téléphone : elle repart du lot et de la collection du PC
await ph.evaluate(() => scanAdd({ key: 'arcane signet', name: 'Arcane Signet', card: 'en', score: 1, raw: 'Arcane Signet' }, 1, false));
await pc.waitForFunction(() => document.querySelectorAll('.lot-it').length === 2, null, { timeout: 8000 });
assert.deepEqual(await collX(pc, 'arcane signet'), { 'en|2x2|101': 1 }, 'extension choisie sur le téléphone : posée d\'office sur la carte suivante, envoyée avec');
await ph.click('.sc-item[data-k="arcane signet"] [data-a="del"]');
await pc.waitForFunction(() => document.querySelectorAll('.lot-it').length === 1 && !COLL.map['arcane signet'], null, { timeout: 8000 });
await pc.screenshot({ path: 'shots/mobscan-2-pc.png' });
ok('téléphone → PC : carte reçue dans le lot (langue lue), édition choisie sur le téléphone suivie, posée d\'office sur la suivante ; retirée du document ; « + » regroupé, ✕ retiré du lot et de la collection du PC');

/* ── 4) « Terminer » : le bandeau revient tant que le PC attend ; « Arrêter » ou PC muet : il disparaît ──────────────────────────── */
await ph.evaluate(() => scanAdd({ key: 'wrath of god', name: 'Wrath of God', card: 'en', score: 1, raw: 'Wrath of God' }, 1, false));
await pc.waitForFunction(() => COLL.map['wrath of god'], null, { timeout: 8000 });
await ph.click('.dv-foot [data-act="done"]'); await ph.waitForSelector('.sheet-wrap.open [data-go]');
assert.match(await txt(ph, '.sheet-wrap.open .cf-msg'), /1 carte est partie vers ton PC sans édition/, 'Terminer : carte sans édition signalée');
await ph.click('.sheet-wrap.open [data-go]'); await ph.waitForFunction(() => !document.querySelector('.dv.scan'));
await ph.waitForSelector('#mobBar', { timeout: 3000 });
await ph.click('#mobBar [data-act="no"]'); await ph.waitForFunction(() => !document.querySelector('#mobBar')); await sleep(300);
assert.equal(await ph.$('#mobBar'), null, '« Plus tard » : caché pour cette session du PC');
await pc.click('.mob-pc [data-act="mobstop"]'); await pc.waitForFunction(() => document.querySelector('.mob-pc').dataset.on === '0');
assert.equal(server.scan.on, false, 'Arrêter : on = false');
await pc.click('.mob-pc [data-act="mobgo"]'); await pc.waitForFunction(() => document.querySelector('.mob-pc').dataset.on === '1');
await ph.waitForSelector('#mobBar', { timeout: 5000 }); ok('nouvelle session du PC : le bandeau revient malgré « Plus tard »');
server.scan.at = Date.now() - 4 * 60e3; broadcast();
await ph.waitForFunction(() => !document.querySelector('#mobBar'), null, { timeout: 5000 });
ok('« Terminer » : bandeau de retour ; « Plus tard » ; « Arrêter » (on = false) ; PC muet depuis plus de 3 min : plus de bandeau');

/* ── 5) fermer la page du PC arrête l'attente ; règles non publiées : message clair des deux côtés ─────────────────────────── */
server.scan.at = Date.now(); broadcast(); await ph.waitForSelector('#mobBar', { timeout: 5000 });
await pc.keyboard.press('Escape'); await pc.waitForFunction(() => !document.querySelector('.lot'));
await sleep(300); assert.equal(server.scan.on, false, 'page fermée : le PC n\'attend plus');
await ph.waitForFunction(() => !document.querySelector('#mobBar'), null, { timeout: 5000 });
await pc.evaluate(() => openLot()); await pc.waitForSelector('.lot.on .mob-pc'); await pc.click('.mob-pc [data-act="mobgo"]'); await ph.waitForSelector('#mobBar', { timeout: 5000 });
server.deny = true; await ph.click('#mobBar [data-act="go"]'); await ph.waitForSelector('.dv.scan.remote.on');
await ph.evaluate(() => scanAdd({ key: 'sol ring', name: 'Sol Ring', card: 'fr', score: 1, raw: 'x' }, 1, false));
await ph.waitForFunction(() => /règles Firestore à publier/.test((document.querySelector('.sc-remote') || {}).textContent || ''), null, { timeout: 5000 });
server.deny = false; await pc.waitForFunction(() => COLL.map['sol ring'] && COLL.map['sol ring'].q === 3 && COLL.map['sol ring'].x.fr === 1, null, { timeout: 9000 });
ok('page du PC fermée : attente arrêtée ; envoi refusé (règles) : signalé sur le téléphone, puis parti au nouvel essai');

for (const [n, e] of [['PC', PC.errs], ['téléphone', PH.errs]]) assert.deepEqual(e.filter(x => !/getUserMedia|NotFoundError|Requested device|camera|Tesseract|worker/i.test(x)), [], `erreurs ${n} : ` + e.join(' | '));
await browser.close(); world.stop();
console.log('\nMOBSCAN E2E OK');
