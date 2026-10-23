// E2E « Signaler un problème de scan » (scanreport.js) avec le vrai Tesseract (servi depuis node_modules à la place du CDN) et le vrai proxy.mjs :
// capture d'une carte entière (scanEnqueue, comme scanfoot-e2e) gardée en mémoire réduite (≤ 900 px, ≤ 250 Ko), photo illisible (« Photos ») ; bouton discret
// dans la carte en grand et sur la ligne « Nom non reconnu » ; feuille (photo, ce qui ne va pas, commentaire, ce qui part), envoi reçu par le serveur
// (photo + lecture : texte, ligne du bas, carte, moteur, cadrage, version, langue ; compte connecté : empreinte seulement), toast, « Signalé » ;
// hors ligne : message clair, rien d'envoyé ; serveur qui coupe la fonction : bouton caché ; scan fermé : captures libérées.
// Puis le panneau /admin (faux SDK Firebase, compte de l'éditeur) : section « Scans signalés », compteur, photo, données, suppression. Port 19615.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, startWorld, newPage, ok, toHome, signInFake, scanClose } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';
import { routeAdminPage, ADMIN } from './admin-fakes.mjs';

const TESS_DIR = process.env.TESS_DIR || new URL('../tests/node_modules', import.meta.url).pathname;
if (!existsSync(TESS_DIR + '/tesseract.js')) { console.log('· tesseract.js absent (TESS_DIR) : test OCR ignoré'); process.exit(0); }
const FX = new URL('./fixtures/', import.meta.url).pathname, fx = n => FX + n;
const map = [
  [/\/npm\/tesseract\.js@5\.1\.1\/dist\/(.+)$/, m => `${TESS_DIR}/tesseract.js/dist/${m[1]}`, 'text/javascript'],
  [/\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, m => `${TESS_DIR}/tesseract.js-core/${m[1]}`, null],
  [/\/npm\/@tesseract\.js-data\/(eng|fra)\/4\.0\.0_best_int\/(.+)$/, m => `${TESS_DIR}/@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[2]}`, 'application/gzip'],
];
const DIR = process.env.SCAN_REPORTS_DIR;      // dossier temporaire (setup-env.mjs)
const F = await startFakes();
const world = await startWorld({ port: 19615, env: { FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, SCAN_REPORTS_DIR: DIR } });
process.on('exit', () => { try { world.stop(); } catch {} F.stop(); });
Object.assign(world.psets, { 'Command Tower': ['cmm', 'blb'] });      // BLB 201 : « Tour de commandement », « BLB • FR » en bas
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { ctx, p, errs } = await newPage(browser, world, { goto: false });
await ctx.route('https://cdn.jsdelivr.net/**', route => {
  const u = new URL(route.request().url());
  for (const [re, file, type] of map) {
    const m = re.exec(u.pathname); if (!m) continue;
    const f = file(m); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: type || (f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'), body: readFileSync(f) });
  }
  return route.fulfill({ status: 404, body: 'nf' });
});
const posts = []; p.on('request', r => { if (r.url().includes('/api/scan-report')) posts.push({ m: r.method(), tok: r.headers()['x-firebase-token'] || '' }); });
await p.goto(world.url); await p.waitForTimeout(700); await toHome(p);
await p.waitForFunction(() => CTX.proxy && CTX.scanrep === true, null, { timeout: 8000 });
const reports = () => (existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(DIR + '/' + f, 'utf8'))).sort((a, b) => a.t - b.t) : []);
let seen = 0;
const idle = async (ms = 200000) => {
  seen++;
  await p.waitForFunction(n => [...SC.items.values()].reduce((a, x) => a + x.q, 0) + SC.miss.length >= n, seen, { timeout: ms });
  await p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: ms });
};
const shoot = f => p.evaluate(async b64 => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
  scanEnqueue({ label: 'Carte', src: c, strip: false, card: true, thumb: '' });
}, readFileSync(fx(f)).toString('base64'));
const vis = sel => p.$eval(sel, e => !e.hidden && !!e.offsetParent).catch(() => false);

/* ── Captures gardées en mémoire, réduites ─────────────────────────────────────────────────────────────────────────────────── */
await p.evaluate(() => scsSet({ frame: 'card' }));
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
await shoot('foot-blb-fr.jpg'); await idle();
const tower = await p.evaluate(() => { const x = [...SC.items.values()].find(i => i.key === 'command tower'); return x && { id: x.id, l: x.l, e: x.e }; });
assert.ok(tower, 'Command Tower reconnue'); assert.equal(tower.l, 'fr');
await p.setInputFiles('#scFile', fx('nonsense.jpg')); await idle();
assert.equal(await p.evaluate(() => SC.miss.length), 1, 'photo illisible : ligne « Nom non reconnu »');
await p.waitForFunction(() => SR.keep.length === 2 && SR.keep.every(e => e.blob), null, { timeout: 10000 });
const kept = await p.evaluate(() => SR.keep.map(e => ({ w: e.w, h: e.h, size: e.blob.size, type: e.blob.type, src: e.read.src, frame: e.read.frame, hit: e.read.hit && e.read.hit.name, foot: e.read.foot && e.read.foot.raw, ocr: e.read.ocr })));
console.log('  gardé :', JSON.stringify(kept));
for (const k of kept) { assert.ok(Math.max(k.w, k.h) <= 900 && Math.max(k.w, k.h) >= 600, 'grand côté ≈ 900 px'); assert.ok(k.size <= 250 * 1024, '250 Ko au plus'); assert.equal(k.type, 'image/jpeg'); }
assert.deepEqual([kept[0].src, kept[0].frame, kept[0].hit, kept[0].ocr], ['webcam', 'card', 'Command Tower', 'tesseract']); assert.match(kept[0].foot, /BLB/);
assert.deepEqual([kept[1].src, kept[1].hit], ['photo', null]);
assert.equal(await p.evaluate(() => ['localStorage', 'sessionStorage'].some(s => Object.keys(window[s]).some(k => /scan-?rep|srkeep/i.test(k)))), false, 'rien d\'enregistré sur l\'appareil');
ok('captures du scan (carte reconnue et non reconnue) gardées en mémoire : JPEG réduit (≤ 900 px, ≤ 250 Ko), lecture (texte, ligne du bas, carte, moteur, cadrage) ; rien sur l\'appareil');

/* ── Carte en grand → « Signaler un problème de scan » → feuille → envoi ───────────────────────────────────────────────────── */
assert.equal(await p.textContent('.sc-item.miss [data-sr]'), 'Signaler ce scan', 'ligne « Nom non reconnu » : petit lien');
await p.screenshot({ path: 'shots/scanreport-liste.png' }).catch(() => {});
await p.click(`.sc-item[data-k="command tower"] .sc-th`); await p.waitForSelector('.imgv.on');
assert.equal(await vis('.imgv-rep'), true, 'bouton visible dans la carte en grand'); assert.equal(await p.textContent('.imgv-rep'), 'Signaler un problème de scan');
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/scanreport-carte.png' }).catch(() => {});
await p.click('.imgv-rep'); await p.waitForSelector('.sr-sheet .sheet-body .sr');
await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 });
assert.match(await p.textContent('.sr-sheet h2'), /Signaler un problème de scan/); assert.match(await p.textContent('.sr-sheet .sheet-head p'), /Tour de commandement|Command Tower/);
await p.waitForFunction(() => /^data:image\/jpeg;base64,/.test(document.querySelector('.sr-sheet .sr-ph img').src), null, { timeout: 5000 });
assert.equal(await vis('.sr-sheet .sr-ph img'), true, 'aperçu de la photo');
assert.deepEqual(await p.$$eval('.sr-sheet [data-w]', b => b.map(x => x.textContent)), ['Mauvaise carte', 'Mauvaise langue', 'Mauvaise édition', 'Non reconnue', 'Autre']);
assert.equal(await p.$eval('.sr-sheet [data-sr-go]', b => b.disabled), true, 'carte reconnue : rien de choisi, « Envoyer » attend');
assert.match(await p.textContent('.sr-sheet .sr-why'), /La photo de la carte et ce que l'appli a lu sont envoyés à l'équipe Mana Orbit pour améliorer le scan\. Rien d'autre\./);
assert.equal(await p.$eval('#srNote', t => t.maxLength), 300);
await p.click('.sr-sheet summary'); assert.match(await p.textContent('.sr-sheet .sr-det'), /Command Tower · FR/); assert.match(await p.textContent('.sr-sheet .sr-det'), /BLB/); assert.match(await p.textContent('.sr-sheet .sr-det'), /Tesseract/);
await p.screenshot({ path: 'shots/scanreport-feuille.png' }).catch(() => {});
await p.click('.sr-sheet [data-w="lang"]'); assert.equal(await p.getAttribute('.sr-sheet [data-w="lang"]', 'aria-pressed'), 'true');
await p.fill('#srNote', 'Carte française, lue en allemand ?');
assert.equal(await p.$eval('.sr-sheet [data-sr-go]', b => b.disabled), false);
await p.click('.sr-sheet [data-sr-go]');
await p.waitForFunction(() => /Merci/.test(document.querySelector('#toast').textContent) && !document.querySelector('.sr-sheet.open'), null, { timeout: 8000 });
let R = reports(); assert.equal(R.length, 1, 'reçu par le serveur');
let r = R[0];
assert.equal(r.what, 'lang'); assert.equal(r.note, 'Carte française, lue en allemand ?'); assert.equal(r.acct, '', 'sans compte');
const build = await p.evaluate(() => DD_BUILD);
assert.deepEqual([r.meta.build, r.meta.app, r.meta.ui, r.meta.scan.frame, r.meta.line.name, r.meta.line.l, r.meta.read.hit.name, r.meta.read.hit.card, r.meta.read.ocr, r.meta.read.frame], [build, 'web', 'fr', 'card', 'Command Tower', 'fr', 'Command Tower', 'fr', 'tesseract', 'card']);
assert.match(r.meta.read.foot.raw, /BLB/); assert.deepEqual(r.meta.read.foot.ft.codes.slice(0, 1), ['BLB']); assert.equal(r.meta.read.foot.ft.lang, 'fr'); assert.ok(r.meta.read.raw.length > 3, 'texte lu du nom');
assert.ok(r.meta.read.diag && 'fps' in r.meta.read.diag, 'diagnostic'); assert.ok(Array.isArray(r.meta.read.langs) && r.meta.read.langs.includes('fra'));
const jpg = readFileSync(`${DIR}/${r.id}.jpg`); assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8]); assert.equal(r.img.bytes, jpg.length); assert.ok(Math.max(r.img.w, r.img.h) <= 900);
assert.ok(!JSON.stringify(r).includes('127.0.0.1'), 'ni adresse IP');
assert.deepEqual(posts.map(x => x.m), ['POST']);
await p.click(`.sc-item[data-k="command tower"] .sc-th`); await p.waitForSelector('.imgv.on');
assert.equal(await p.textContent('.imgv-rep'), 'Scan signalé, merci'); assert.equal(await p.$eval('.imgv-rep', b => b.disabled), true, 'déjà envoyé : pas de second envoi');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 });
ok('carte en grand : « Signaler un problème de scan » → feuille (photo, ce qui ne va pas, commentaire 300 caractères, ce qui part, ce que l\'appli a lu) → envoi reçu (photo JPEG, lecture, version, appli, langue) → toast ; « Scan signalé, merci » ensuite');

/* ── Ligne « Nom non reconnu » : hors ligne, puis envoi avec un compte connecté ───────────────────────────────────────────────── */
const uid = 'uid-tester-e2e'; await p.evaluate(t => { window.__idTok = t; }, F.jwt(uid, 3600));
await signInFake(p, { uid });
await p.click('.sc-item.miss [data-sr]'); await p.waitForSelector('.sr-sheet .sheet-body .sr');
assert.match(await p.textContent('.sr-sheet .sheet-head p'), /Nom non reconnu/);
assert.equal(await p.getAttribute('.sr-sheet [data-w="miss"]', 'aria-pressed'), 'true', 'non reconnue : déjà choisi');
await p.waitForFunction(() => !document.querySelector('.sr-sheet [data-sr-go]').disabled, null, { timeout: 5000 });
await ctx.setOffline(true);
await p.click('.sr-sheet [data-sr-go]');
await p.waitForFunction(() => !document.querySelector('.sr-sheet .sr-err').hidden, null, { timeout: 3000 });
assert.match(await p.textContent('.sr-sheet .sr-err'), /Hors ligne : le signalement n'est pas parti/); assert.equal(reports().length, 1, 'hors ligne : rien d\'envoyé'); assert.ok(await p.$('.sr-sheet.open'), 'la feuille reste ouverte');
await ctx.setOffline(false);
await p.click('.sr-sheet [data-sr-go]');
await p.waitForFunction(() => /Merci/.test(document.querySelector('#toast').textContent) && !document.querySelector('.sr-sheet.open'), null, { timeout: 8000 });
R = reports(); assert.equal(R.length, 2); r = R[1];
assert.equal(r.what, 'miss'); assert.equal(r.note, ''); assert.equal(r.acct, createHash('sha256').update(uid).digest('hex').slice(0, 16), 'connecté : empreinte du compte');
assert.ok(!JSON.stringify(r).includes(uid), 'jamais l\'UID'); assert.equal(posts.at(-1).tok.length > 20, true, 'jeton Firebase joint');
assert.deepEqual([r.meta.read.src, r.meta.read.hit, r.meta.line.raw !== undefined], ['photo', null, true]);
await p.waitForFunction(() => document.querySelector('.sc-item.miss [data-sr]').disabled, null, { timeout: 3000 });
assert.equal(await p.textContent('.sc-item.miss [data-sr]'), 'Signalé');
ok('ligne « Nom non reconnu » : « Signaler ce scan » (type choisi d\'office) ; hors ligne : message clair, feuille gardée, rien d\'envoyé ; connecté : jeton joint, empreinte du compte seulement ; « Signalé » ensuite');

/* ── Serveur qui coupe la fonction, fermeture du scan ─────────────────────────────────────────────────────────────────────── */
await p.evaluate(() => { CTX.scanrep = false; scanPaintList(); });
await p.click(`.sc-item[data-k="command tower"] .sc-th`); await p.waitForSelector('.imgv.on');
assert.equal(await vis('.imgv-rep'), false, 'fonction coupée (/__ping scanrep: false) : bouton caché');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 });
assert.equal(await p.$('.sc-item.miss [data-sr]'), null);
await p.evaluate(() => { CTX.scanrep = true; });
await scanClose(p); await p.waitForFunction(() => !SC.el);
assert.equal(await p.evaluate(() => SR.keep.length), 0, 'scan fermé : captures libérées');
assert.deepEqual(errs.filter(e => !/getUserMedia|NotFoundError|Requested device/.test(e)), [], 'erreurs page');
ok('fonction coupée par le serveur : bouton caché (carte en grand et ligne non reconnue) ; scan fermé : captures libérées ; aucune erreur');
await ctx.close();

/* ── Panneau /admin : « Scans signalés » ─────────────────────────────────────────────────────────────────────────────────── */
{
  const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await routeAdminPage(actx);
  const ap = await actx.newPage(), aerr = [];
  ap.on('pageerror', e => aerr.push('pageerror: ' + e.message)); ap.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) aerr.push('console: ' + m.text()); });
  await ap.addInitScript(u => { window.__fbUser = u; }, { uid: 'uid-admin-00', email: ADMIN, tok: F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true }) });
  await ap.goto(world.url + 'admin');
  await ap.waitForSelector('#scans:not([hidden]) .scr', { state: 'attached', timeout: 10000 });      // onglet « Vue d'ensemble » d'abord : la carte est chargée mais pas affichée
  assert.equal(await ap.$$eval('#scans .scph img', a => a.filter(i => i.src).length), 0, 'onglet Signalements fermé : aucune photo demandée');
  await ap.click('#t-signalements'); await ap.waitForSelector('#scans:not([hidden]) .scr', { timeout: 10000 });      // scans signalés : onglet Signalements (refonte du panneau)
  assert.equal(await ap.$$eval('#scans .scr', a => a.length), 2);
  assert.match(await ap.textContent('#kpis [data-k="scans"]'), /Scans signalés\s*2\s*2 en 7 jours/);
  assert.match(await ap.textContent('#scCount'), /2 signalements · .* Mo · gardés 90 jours/);
  const first = await ap.$eval('#scans .scr', a => a.innerText);
  assert.match(first, /Non reconnue/); assert.match(first, /Tesseract/); assert.match(first, /compte [0-9a-f]{8}/);
  const second = await ap.$eval('#scans .scr:nth-child(2)', a => a.innerText);
  assert.match(second, /Mauvaise langue/); assert.match(second, /Command Tower/); assert.match(second, /FR/); assert.match(second, /BLB/); assert.match(second, /Carte française, lue en allemand/); assert.match(second, /version [0-9a-f]{8}/); assert.match(second, /sans compte/);
  await ap.$eval('#scans', e => e.scrollIntoView());
  await ap.waitForFunction(() => [...document.querySelectorAll('#scans .scph img')].every(i => /^data:image\/jpeg/.test(i.src)), null, { timeout: 8000 });
  await ap.click('#scans .scr:nth-child(2) .scph'); assert.equal(await ap.$eval('#scans .scr:nth-child(2) .scph', b => b.classList.contains('big')), true, 'photo en grand');
  await ap.click('#scans .scr:nth-child(2) summary'); assert.match(await ap.textContent('#scans .scr:nth-child(2) pre'), /"raw": "/);
  const ids = await ap.$$eval('#scans .scr', a => a.map(x => x.dataset.id));
  await ap.click('#scans .scr:nth-child(2) .sdel'); assert.equal(await ap.textContent('#scans .scr:nth-child(2) .sdel'), 'Confirmer la suppression');
  await ap.click('#scans .scr:nth-child(2) .sdel');
  await ap.waitForFunction(() => document.querySelectorAll('#scans .scr').length === 1, null, { timeout: 5000 });
  assert.ok(!existsSync(`${DIR}/${ids[1]}.json`) && !existsSync(`${DIR}/${ids[1]}.jpg`), 'effacé du serveur'); assert.equal(reports().length, 1);
  assert.match(await ap.textContent('#scCount'), /^1 signalement/); assert.match(await ap.textContent('#kpis [data-k="scans"] b'), /^1$/);
  const w = await ap.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) console.log('  dépasse :', await ap.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 390.5).slice(0, 8).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | ')));
  assert.ok(w <= 390, 'téléphone : pas de défilement de côté (' + w + ')');
  await ap.screenshot({ path: 'shots/scanreport-admin.png', fullPage: true }).catch(() => {});
  assert.deepEqual(aerr, [], 'erreurs du panneau (CSP comprise)');
  await actx.close();
  ok('panneau /admin : « Scans signalés » (compteur dans le résumé, fiches : type, carte, langue, édition, moteur, version, compte, commentaire), photo par la route admin, données dépliables, suppression en deux appuis ; aucune erreur (CSP)');
}
await browser.close();
console.log('\nSCANREPORT E2E OK');
process.exit(0);
