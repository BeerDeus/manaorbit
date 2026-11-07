// Erreurs JavaScript des appareils, côté serveur (proxy.mjs › /api/errlog, /api/admin/errors ; appli : src/errlog.js) : envoi valide (champs validés, tronqués,
// caractères de contrôle retirés, adresses réduites au nom du fichier, e-mails et jetons masqués, champs inconnus ignorés, ni IP ni compte), regroupement par
// signature (message + emplacement + version : compteur, premier et dernier vu, écrans, plateformes, langues, appareils distincts par empreinte salée),
// refus (méthode, JSON, nombre de rapports, sans message, corps de plus de 8 Ko, text/plain en local), limite par réseau, plafond ERRLOG_MAX et durée
// ERRLOG_DAYS, fichier illisible jamais réécrit, écriture à l'arrêt propre, panneau (/api/admin/errors : lecture, pages, effacer une signature, tout effacer)
// réservé au compte de l'éditeur, ERRLOG=0 (404, /__ping errlog: false). Dictionnaires : les textes du réglage dans les 5 langues. Ports 19970 à 19974.
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakes } from './amis-fakes.mjs';
import { ADMIN } from './admin-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes();
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} F.stop(); });
const start = (env, port) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(port), CARDTRADER_TOKEN: '', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, ERRLOG_SAVE_MS: '40', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
const j = async (url, init = {}) => { const r = await fetch(url, init); const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, h: r.headers }; };
let ipN = 0;
const ip = () => '198.51.100.' + (++ipN % 250);      // une adresse par envoi : la limite par réseau ne gêne pas les autres essais
const R = (o = {}) => ({ m: 'TypeError: Cannot read properties of undefined (reading \'name\')', at: 'page:1234:56', st: 'TypeError: Cannot read properties of undefined (reading \'name\')\nat collPaint (page:1234:56)\nat page:99:1', b: 'abc12345', v: 'coll', l: 'fr', p: 'web', k: 'error', t: Date.now(), ...o });
const send = (B, r, { from = ip(), raw = null, type = 'application/json' } = {}) => j(B + '/api/errlog', { method: 'POST', headers: { 'Content-Type': type, 'X-Forwarded-For': from }, body: raw != null ? raw : JSON.stringify({ r: Array.isArray(r) ? r : [r] }) });
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const JEANNE = () => F.jwt('uid-jeanne-01', 3600, { email: 'jeanne@example.net', email_verified: true });
const adm = (B, path = '', { tok = ADM(), method = 'GET' } = {}) => j(B + '/api/admin/errors' + path, { method, headers: tok ? { 'x-firebase-token': tok } : {} });
const fileOf = async (f, ms = 1500) => { for (let t = 0; t < ms / 20; t++) { if (existsSync(f)) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { /* écriture en cours */ } } await sleep(20); } return null; };
const settle = () => sleep(150);      // écriture différée (ERRLOG_SAVE_MS = 40)

/* ── 1) Envoi valide : nettoyage, troncature, regroupement ─────────────────────────────────────────────────────────────────── */
const D1 = mkdtempSync(join(tmpdir(), 'errlog-')), F1 = join(D1, 'errlog.json');
const P1 = await start({ ERRLOG_FILE: F1, ERRLOG_PER_H: '5' }, 19970), B1 = 'http://127.0.0.1:19970';
for (let t = 0; t < 40 && !/Erreurs JS des appareils/.test(P1.log()); t++) await sleep(50);
assert.match(P1.log(), /Erreurs JS des appareils : 2000 signatures au plus, gardées 90 jours/);
{
  const ping = await j(B1 + '/__ping'); assert.equal(ping.o.errlog, true, '/__ping errlog : l\'appli envoie');
  const weird = R({
    m: 'Uncaught\u0007 Error:\n boom https://manaorbit.app/x/app.js?v=2&tok=secret:10:5 pour jeanne.dupont@example.net jeton eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9abcdefgh ' + 'mot '.repeat(100),
    at: 'https://manaorbit.app/deck-deal.html?u=1:12:3', st: 'Error: boom\n\tat f (https://manaorbit.app/?q=1:10:5)‮\n' + 'ligne de pile\n'.repeat(200),
    b: 'abc 123!', v: 'coll>me-sheet', l: 'fr-FR-x', p: 'iphone', k: 'oops', uid: 'uid-jeanne-01', email: 'jeanne@example.net', token: 'eyJxxx', url: 'https://manaorbit.app/?deck=1',
  });
  const r = await send(B1, [weird, R(), R({ v: 'home', p: 'android', l: 'de' })], { from: '203.0.113.5' });
  assert.equal(r.s, 200, JSON.stringify(r.o)); assert.deepEqual(r.o, { ok: true, n: 3 });
  await settle();
  const f = await fileOf(F1); assert.ok(f && f.v === 1 && Array.isArray(f.sigs), 'fichier écrit en différé');
  assert.equal(f.sigs.length, 2, 'deux signatures : la même erreur deux fois, regroupée');
  const w = f.sigs.find(x => /boom/.test(x.m)), g = f.sigs.find(x => !/boom/.test(x.m));
  assert.ok(!/[\u0000-\u001f‮]/.test(w.m), 'message : caractères de contrôle et d\'inversion retirés');
  assert.ok(w.m.startsWith('Uncaught Error: boom app.js:10:5 pour [e-mail] jeton …'), 'adresse réduite au nom du fichier (sans query string), e-mail et jeton masqués : ' + w.m.slice(0, 80));
  assert.equal([...w.m].length, 300, 'message : 300 caractères au plus');
  assert.equal(w.at, 'deck-deal.html:12:3', 'emplacement : nom du fichier, ligne, colonne');
  assert.ok(w.st.startsWith('Error: boom\nat f (page:10:5)\n'), 'pile : lignes gardées, chemins réduits : ' + JSON.stringify(w.st.slice(0, 40)));
  assert.equal([...w.st].length, 1200, 'pile : 1 200 caractères au plus');
  assert.equal(w.b, '', 'version invalide : vide'); assert.deepEqual(w.v, { 'coll>me-sheet': 1 }, 'écran compté'); assert.deepEqual(w.lg, {}, 'langue invalide : non comptée'); assert.deepEqual(w.p, {}, 'plateforme inconnue : non comptée'); assert.equal(w.k, 'error');
  assert.equal(g.n, 2); assert.deepEqual(g.v, { coll: 1, home: 1 }); assert.deepEqual(g.p, { web: 1, android: 1 }); assert.deepEqual(g.lg, { fr: 1, de: 1 }); assert.equal(g.b, 'abc12345'); assert.equal(g.at, 'page:1234:56');
  assert.ok(g.f > 0 && g.l >= g.f); assert.equal(g.d.length, 1, 'même réseau : un seul appareil'); assert.match(g.d[0], /^[0-9a-f]{10}$/, 'empreinte salée de 10 caractères');
  const all = readFileSync(F1, 'utf8');
  assert.ok(!/203\.0\.113|198\.51\.100|127\.0\.0\.1|uid-jeanne|jeanne|eyJ|secret|deck=1|manaorbit\.app/.test(all), 'ni IP, ni compte, ni e-mail, ni jeton, ni adresse complète');
  ok('envoi valide : contrôles retirés, message 300 et pile 1 200 caractères, adresses réduites au nom du fichier, e-mail et jeton masqués, champs invalides vidés, champs inconnus ignorés, ni IP ni compte ; même erreur regroupée (compteur, écrans, plateformes, langues, une empreinte par réseau)');

  await send(B1, R({ v: 'decks' }), { from: '203.0.113.6' }); await send(B1, R({ b: 'def67890' }), { from: '203.0.113.6' }); await settle();
  const f2 = await fileOf(F1), g2 = f2.sigs.find(x => x.id === g.id);
  assert.equal(g2.n, 3); assert.equal(g2.d.length, 2, 'autre réseau : un appareil de plus'); assert.equal(f2.sigs.length, 3, 'autre version : autre signature');
  ok('regroupement : message + emplacement + version ; appareils distincts comptés par empreinte');
}

/* ── 2) Refus ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const before = readFileSync(F1, 'utf8');
  let r = await j(B1 + '/api/errlog'); assert.equal(r.s, 405, 'GET : rien à lire publiquement');
  r = await send(B1, null, { raw: '{abîmé' }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_request');
  r = await send(B1, null, { raw: '{"r":{"m":"x"}}' }); assert.equal(r.s, 400, 'r : un tableau');
  r = await send(B1, null, { raw: '{"r":[]}' }); assert.equal(r.s, 400, 'aucun rapport');
  r = await send(B1, Array.from({ length: 11 }, () => R({ m: 'court' }))); assert.equal(r.s, 400, '11 rapports : refusé');
  r = await send(B1, [{ m: '' }, { m: 42 }, { at: 'x' }, 'texte', null]); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_report', 'sans message : rien de gardé');
  r = await send(B1, null, { raw: JSON.stringify({ r: [R({ m: 'x'.repeat(9000) })] }) }); assert.equal(r.s, 413, 'corps de plus de 8 Ko'); assert.equal(r.o.error, 'too_large');
  r = await send(B1, R(), { type: 'text/plain' }); assert.equal(r.s, 415, 'serveur local : JSON exigé');
  await settle(); assert.equal(readFileSync(F1, 'utf8'), before, 'rien d\'écrit pour un refus');
  ok('refus : GET 405, JSON invalide, r absent ou vide, plus de 10 rapports, rapports sans message (bad_report), corps de plus de 8 Ko (413), text/plain en local (415) ; rien n\'est écrit');
}

/* ── 3) Limite par réseau ─────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  let r; const from = '192.0.2.44';
  for (let i = 0; i < 5; i++) { r = await send(B1, R({ m: 'limite ' + i }), { from }); assert.equal(r.s, 200, 'envoi ' + (i + 1)); }
  r = await send(B1, R(), { from }); assert.equal(r.s, 429, '6e envoi de l\'heure depuis ce réseau'); assert.equal(r.o.error, 'rate_limited'); assert.ok(Number(r.h.get('retry-after')) >= 1);
  r = await send(B1, R(), { from: '192.0.2.45' }); assert.equal(r.s, 200, 'autre réseau : son propre budget');
  ok('limite : ERRLOG_PER_H envois par heure et par réseau (429, Retry-After), autre réseau libre');
}

/* ── 4) Panneau : accès réservé, lecture, pages, effacer ─────────────────────────────────────────────────────────────────── */
{
  let r = await adm(B1, '', { tok: '' }); assert.equal(r.s, 401, 'sans jeton'); assert.ok(!('rows' in r.o));
  r = await adm(B1, '', { tok: JEANNE() }); assert.equal(r.s, 403, 'autre compte'); assert.ok(!('rows' in r.o));
  r = await adm(B1, '', { tok: F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: false }) }); assert.equal(r.s, 403, 'adresse non vérifiée');
  r = await adm(B1, '', { tok: JEANNE(), method: 'DELETE' }); assert.equal(r.s, 403, 'effacer : autre compte refusé');
  r = await adm(B1); assert.equal(r.s, 200, JSON.stringify(r.o));
  assert.equal(r.o.sigs, 8); assert.equal(r.o.max, 2000); assert.equal(r.o.days, 90); assert.equal(r.o.page, 1); assert.equal(r.o.pages, 1); assert.equal(r.o.bad, false);
  const ls = r.o.rows.map(x => x.l); assert.deepEqual(ls, ls.slice().sort((a, b) => b - a), 'triées par dernier vu');
  assert.ok(r.o.rows.every(x => !('d' in x) && Number.isInteger(x.dev) && x.devMax === 50), 'empreintes jamais envoyées : leur nombre seulement');
  assert.equal(r.o.reports, r.o.rows.reduce((a, x) => a + x.n, 0));
  assert.match(r.h.get('x-robots-tag') || '', /noindex/);
  const one = r.o.rows.find(x => x.m === 'limite 0');
  r = await adm(B1, '/' + one.id, { method: 'GET' }); assert.equal(r.s, 405);
  r = await adm(B1, '/zzz', { method: 'DELETE' }); assert.equal(r.s, 404);
  r = await adm(B1, '/' + one.id, { method: 'DELETE' }); assert.equal(r.s, 200); assert.equal(r.o.sigs, 7);
  r = await adm(B1, '/' + one.id, { method: 'DELETE' }); assert.equal(r.s, 404, 'déjà effacée');
  await settle(); assert.ok(!(await fileOf(F1)).sigs.some(x => x.id === one.id), 'effacée du fichier');
  r = await adm(B1, '', { method: 'PUT' }); assert.equal(r.s, 405);
  r = await adm(B1, '', { method: 'DELETE' }); assert.equal(r.s, 200); assert.equal(r.o.sigs, 0);
  await settle(); assert.deepEqual((await fileOf(F1)).sigs, [], 'tout effacé, fichier compris');
  r = await adm(B1); assert.equal(r.o.sigs, 0); assert.deepEqual(r.o.rows, []);
  ok('panneau : sans jeton 401, autre compte ou adresse non vérifiée 403 (sans données) ; liste triée par dernier vu, sans empreintes ; effacer une signature, tout effacer (fichier compris)');
}

/* ── 5) Plafond, durée, pages, fichier illisible, arrêt propre ───────────────────────────────────────────────────────────── */
{
  const D2 = mkdtempSync(join(tmpdir(), 'errlog-')), F2 = join(D2, 'errlog.json'), now = Date.now();
  const sig = (id, m, l) => ({ id, m, at: 'page:1:1', st: '', k: 'error', b: 'abc', n: 1, f: l, l, v: {}, p: {}, lg: {}, d: [] });
  writeFileSync(F2, JSON.stringify({ v: 1, sigs: [sig('aaaaaaaaaaaa', 'vieille', now - 91 * 86400e3), sig('bbbbbbbbbbbb', 'récente', now - 2 * 86400e3), sig('nothex', 'abîmée', now)] }));
  const P2 = await start({ ERRLOG_FILE: F2, ERRLOG_MAX: '3', ERRLOG_PER_H: '0' }, 19971), B2 = 'http://127.0.0.1:19971';
  let r = await adm(B2); assert.equal(r.s, 200);
  assert.deepEqual(r.o.rows.map(x => x.m), ['récente'], 'plus de 90 jours et fiche abîmée : oubliées à la lecture');
  for (let i = 0; i < 3; i++) { assert.equal((await send(B2, R({ m: 'nouvelle ' + i, t: now + i })) ).s, 200); await sleep(5); }
  r = await adm(B2); assert.deepEqual(r.o.rows.map(x => x.m).sort(), ['nouvelle 0', 'nouvelle 1', 'nouvelle 2'], 'ERRLOG_MAX : la moins récemment vue part');
  P2.kill('SIGTERM'); await sleep(300);
  const D3 = mkdtempSync(join(tmpdir(), 'errlog-')), F3 = join(D3, 'errlog.json');
  const P3 = await start({ ERRLOG_FILE: F3, ERRLOG_SAVE_MS: '600000', ERRLOG_PER_H: '0' }, 19972), B3 = 'http://127.0.0.1:19972';
  for (let i = 0; i < 52; i++) assert.equal((await send(B3, R({ m: 'page ' + i }))).s, 200);
  r = await adm(B3); assert.equal(r.o.sigs, 52); assert.equal(r.o.pages, 2); assert.equal(r.o.rows.length, 50);
  r = await adm(B3, '?page=2'); assert.equal(r.o.page, 2); assert.equal(r.o.rows.length, 2);
  await sleep(100); assert.ok(!existsSync(F3), 'écriture différée : rien encore');
  P3.kill('SIGTERM'); const f3 = await fileOf(F3, 3000); assert.ok(f3 && f3.sigs.length === 52, 'arrêt propre (SIGTERM) : écrit tout de suite');
  ok('durée (ERRLOG_DAYS) et fiches abîmées à la lecture, plafond ERRLOG_MAX (les moins récemment vues partent), pages de 50, arrêt propre : fichier écrit sans attendre');

  const D4 = mkdtempSync(join(tmpdir(), 'errlog-')), F4 = join(D4, 'errlog.json'); writeFileSync(F4, '{abîmé');
  const P4 = await start({ ERRLOG_FILE: F4, ERRLOG_PER_H: '0' }, 19973), B4 = 'http://127.0.0.1:19973';
  assert.equal((await send(B4, R())).s, 200, 'fichier illisible : envoi accepté (en mémoire)');
  r = await adm(B4); assert.equal(r.o.bad, true); assert.equal(r.o.sigs, 1);
  r = await adm(B4, '', { method: 'DELETE' }); assert.equal(r.s, 503, 'tout effacer refusé : le fichier n\'est jamais réécrit');
  await settle(); assert.equal(readFileSync(F4, 'utf8'), '{abîmé', 'fichier illisible jamais réécrit');
  assert.match(P4.log(), /illisible, jamais réécrit/);
  ok('fichier illisible : jamais réécrit (envois gardés en mémoire, effacement refusé 503)');
}

/* ── 6) ERRLOG=0 ; dictionnaires ──────────────────────────────────────────────────────────────────────────────────────────── */
{
  const P5 = await start({ ERRLOG: '0' }, 19974), B5 = 'http://127.0.0.1:19974';
  assert.equal((await j(B5 + '/__ping')).o.errlog, false, '/__ping errlog: false : l\'appli n\'envoie rien');
  assert.equal((await send(B5, R())).s, 404); assert.equal((await adm(B5)).s, 404);
  assert.ok(!/Erreurs JS des appareils/.test(P5.log()));
  const src = readFileSync('src/app.js', 'utf8') + readFileSync('src/errlog.js', 'utf8');
  const keys = ['Envoyer les rapports d\'erreur anonymes', 'En cas de bug : le message d\'erreur, la version et l\'écran, sans tes cartes, tes decks ni ton compte.'];
  for (const k of keys) assert.ok(src.includes("T('" + k.replace(/'/g, "\\'") + "')"), 'texte du réglage : ' + k);
  for (const l of ['en', 'de', 'es', 'it', 'pt']) { const d = JSON.parse(readFileSync('src/i18n/' + l + '.errlog.json', 'utf8')); for (const k of keys) assert.ok(d[k] && d[k] !== k, l + ' : ' + k); }
  ok('ERRLOG=0 : 404 partout, /__ping errlog: false ; textes du réglage traduits dans les 5 langues');
}
process.exit(0);
