// QR codes fixes (proxy.mjs › /flyer, /q/<lien>, /api/admin/qr), vrai proxy.mjs : QR créés d'office une seule fois (Flyers, Discord), redirections (302, no-store,
// noindex ; /flyer identique à avant pour Android, iPhone et ordinateur ; lien inconnu → l'accueil), compteurs (total, jour, plateforme ; robots d'aperçu, HEAD,
// « Tester » et navigateur sans nom non comptés ; écrits en différé, rien de personnel dans le fichier), création (lien invalide, réservé, pris ; destination
// invalide ou en boucle), modification (nom, destination ; lien jamais modifiable), aucune suppression possible (405), garde-fous des actions (autre page,
// JSON, débit), accès refusé hors éditeur, journal du panneau, fichier gardé au redémarrage (jamais recréé), fichier illisible (jamais réécrit).
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { startFakes } from './amis-fakes.mjs';
import { DSC_INVITE } from '../discord-srv.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes();
const ADMIN = 'admin@example.org';
const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', APP_STORE_URL: '', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN, QR_SAVE_MS: '150', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/QR codes fixes :/.test(out) && /Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} F.stop(); });
const stop = async c => { c.kill(); await new Promise(r => c.once('exit', r)); };
let BASE = '';
const ADM = () => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true });
const JEANNE = () => F.jwt('uid-jeanne-01', 3600, { email: 'jeanne.dupont@gmail.com', email_verified: true });
/** Appel de l'API admin des QR codes ; body : objet (JSON) ou texte brut. */
const api = async (path = '', { tok = ADM(), method = 'GET', body, hd = {} } = {}) => {
  const h = { ...(tok ? { 'x-firebase-token': tok } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...hd };
  const r = await fetch(BASE + '/api/admin/qr' + path, { method, headers: h, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, h: r.headers };
};
const post = (path, body, o = {}) => api(path, { method: 'POST', body, ...o });
const go = (path, ua, method = 'GET') => fetch(BASE + path, { method, redirect: 'manual', headers: ua == null ? {} : { 'user-agent': ua } });
const loc = async (path, ua, method) => { const r = await go(path, ua, method); assert.equal(r.status, 302, path); assert.equal(r.headers.get('cache-control'), 'no-store', path); assert.equal(r.headers.get('x-robots-tag'), 'noindex', path); return r.headers.get('location'); };
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const PLAY = src => 'https://play.google.com/store/apps/details?id=app.manaorbit&referrer=' + encodeURIComponent('utm_source=' + src + '&utm_medium=print');
const DIR = process.env.ADMIN_DIR, FILE = join(DIR, 'qrcodes.json'), readQ = () => JSON.parse(readFileSync(FILE, 'utf8'));
const byId = (o, id) => o.list.find(q => q.id === id);
/** Attend que le fichier ait écrit les compteurs (écriture différée). */
async function fileHas(fn, what) { for (let t = 0; t < 200; t++) { try { if (fn(readQ())) return; } catch { /* en cours d'écriture */ } await sleep(50); } assert.fail('fichier : ' + what); }

/* ── 1) Premier démarrage : Flyers et Discord créés d'office, fichier écrit ─────────────────────────────────────────────────────────── */
assert.ok(!existsSync(FILE), 'aucun fichier avant le premier démarrage');
let P = await start({ ADMIN_ACTIONS_PER_H: '200' }, 19950); BASE = 'http://127.0.0.1:19950';
assert.match(P.log(), /QR codes fixes : 2 \(\/flyer, \/q\/…\)\./);
{
  const f = readQ(); assert.equal(f.v, 1); assert.deepEqual(f.list.map(q => [q.id, q.name, q.to, q.n]), [['flyer', 'Flyers', 'app', 0], ['discord', 'Discord', DSC_INVITE, 0]]);
  ok('premier démarrage : « Flyers » (/flyer, selon le téléphone) et « Discord » (/q/discord → invitation du serveur) créés d\'office dans ADMIN_DIR/qrcodes.json');
}

/* ── 2) Redirections : /flyer identique à avant, /q/<lien>, lien inconnu → l'accueil ─────────────────────────────────────────────────── */
{
  assert.equal(await loc('/flyer', AND), PLAY('flyer'), 'Android → Google Play (source « flyer »), comme avant');
  assert.equal(PLAY('flyer'), 'https://play.google.com/store/apps/details?id=app.manaorbit&referrer=utm_source%3Dflyer%26utm_medium%3Dprint', 'même adresse qu\'avant, au caractère près');
  assert.equal(await loc('/flyer', IOS), '/?ref=flyer', 'iPhone sans APP_STORE_URL → le site');
  assert.equal(await loc('/flyer', IPAD), '/?ref=flyer');
  assert.equal(await loc('/flyer', PC), '/?ref=flyer', 'ordinateur → le site');
  assert.equal(await loc('/flyer?utm=x', PC), '/?ref=flyer', 'paramètres ignorés');
  assert.equal(await loc('/flyer', PC, 'HEAD'), '/?ref=flyer', 'HEAD : même réponse');
  assert.equal(await loc('/q/discord', AND), DSC_INVITE); assert.equal(await loc('/q/discord', PC), DSC_INVITE);
  assert.equal(await loc('/q/DISCORD/', IOS), DSC_INVITE, 'majuscules et barre finale tolérées');
  for (const u of ['/q/inconnu', '/q/', '/q', '/q/flyer', '/q/a%ZZ', '/q/discord/plus', '/q/' + 'x'.repeat(40)]) assert.equal(await loc(u, AND), '/', u + ' → l\'accueil');
  const r = await go('/q/discord', AND); assert.equal(await r.text(), '', 'corps vide');
  ok('/flyer identique à avant (Android → Play « flyer », iPhone, iPad et ordinateur → /?ref=flyer ; 302, no-store, noindex) ; /q/discord → invitation ; lien inconnu, abîmé ou /q/flyer → l\'accueil');
}

/* ── 3) Compteurs : total, jour, plateforme ; robots, HEAD, « Tester » et navigateur sans nom non comptés ; rien de personnel gardé ──────── */
{
  // déjà comptés : /flyer Android 1, iPhone 1, iPad 1, PC 2 (HEAD non) ; /q/discord Android 2 (dont la lecture du corps), PC 1, iPhone 1
  for (const ua of ['Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Twitterbot/1.0', 'TelegramBot (like TwitterBot)', 'WhatsApp/2.23.20.0', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (Macintosh) HeadlessChrome/120.0', 'curl/8.5.0', '']) {
    assert.equal(await loc('/q/discord', ua), DSC_INVITE, 'robot redirigé pareil : ' + ua);
  }
  await loc('/q/discord?test=1', AND); await loc('/q/discord', AND, 'HEAD'); await loc('/flyer?test=1', IOS);
  assert.equal(await loc('/q/discord', 'Mozilla/5.0 (Linux; Android 13; CUBOT X30) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), DSC_INVITE);      // un vrai téléphone (« bot » dans la marque)
  const r = await api(); assert.equal(r.s, 200); assert.equal(r.o.origin, 'https://manaorbit.app'); assert.equal(r.o.bad, false);
  const fl = byId(r.o, 'flyer'), dc = byId(r.o, 'discord');
  assert.deepEqual([fl.n, fl.p, fl.today, fl.d7, fl.d30], [5, { a: 1, i: 2, o: 2 }, 5, 5, 5], 'Flyers : 5 scans (Android 1, iPhone/iPad 2, ordinateur 2)');
  assert.deepEqual([dc.n, dc.p], [5, { a: 3, i: 1, o: 1 }], 'Discord : robots, HEAD, ?test=1 et navigateur sans nom non comptés ; téléphone Cubot compté');
  assert.equal(fl.days.length, 30); assert.equal(fl.days[29][1], 5); assert.match(fl.days[29][0], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(fl.link, 'https://manaorbit.app/flyer'); assert.equal(fl.path, '/flyer'); assert.equal(dc.link, 'https://manaorbit.app/q/discord');
  assert.match(fl.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 45 45"/); assert.match(fl.svg, /fill="#10152b"/); assert.match(fl.svg, /linearGradient/, 'logo de l\'appli au centre');
  assert.equal(fl.side, 45, 'version 5 (37 modules) + marge : comme les flyers imprimés');
  const Q = createRequire(import.meta.url)('../src/qr.js');
  assert.equal(fl.svg.replace(/qrf\d+/g, 'qrf'), Q.qrSvgLogo('https://manaorbit.app/flyer', { minV: 5 }).svg.replace(/qrf\d+/g, 'qrf'), 'SVG = celui de tools/flyer.mjs (qrSvgLogo, version 5)');
  await fileHas(f => f.list.find(q => q.id === 'discord').n === 5 && f.list.find(q => q.id === 'flyer').n === 5, 'compteurs écrits en différé');
  const raw = readFileSync(FILE, 'utf8'); assert.doesNotMatch(raw, /Mozilla|Android 14|127\.0\.0\.1|::1|Discordbot|iPhone OS/, 'ni adresse ni navigateur dans le fichier');
  assert.deepEqual(readQ().list.find(q => q.id === 'flyer').p, { a: 1, i: 2, o: 2 });
  ok('compteurs : total, jour, plateforme (Android / iPhone / autre) ; robots d\'aperçu (Discord, Facebook, Slack, X, Telegram, WhatsApp, Google, navigateur sans tête, curl), HEAD, « Tester » et navigateur sans nom non comptés ; écrits en différé, ni adresse ni navigateur gardés ; SVG = celui des flyers');
}

/* ── 4) Accès : éditeur seulement ─────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  let r = await api('', { tok: '' }); assert.equal(r.s, 401); assert.equal(r.o.list, undefined);
  r = await api('', { tok: JEANNE() }); assert.equal(r.s, 403); assert.deepEqual(r.o, { error: 'forbidden', message: 'Accès réservé.' });
  r = await post('', { id: 'pirate', name: 'Pirate', to: 'https://evil.example' }, { tok: JEANNE() }); assert.equal(r.s, 403);
  r = await post('/discord', { to: 'https://evil.example' }, { tok: '' }); assert.equal(r.s, 401);
  assert.equal(await loc('/q/discord', PC), DSC_INVITE, 'destination inchangée'); assert.equal(await loc('/q/pirate', PC), '/', 'rien de créé');
  ok('hors éditeur : 401 sans compte, 403 « Accès réservé » pour un autre compte (lecture, création, modification), rien de changé');
}

/* ── 5) Création : lien invalide, réservé, pris ; destination invalide ou en boucle ; nom ─────────────────────────────────────────── */
{
  const bad = async (body, st, err, what) => { const r = await post('', body); assert.equal(r.s, st, what + ' ' + JSON.stringify(r.o)); assert.equal(r.o.error, err, what); assert.ok(r.o.message, what + ' : message'); };
  for (const id of ['a', 'A b', '-ab', 'ab-', 'x'.repeat(33), 'été', 'a_b', 'a/b', 'a.b', '', 42, null]) await bad({ id, name: 'X', to: 'https://example.org' }, 400, 'bad_id', 'lien ' + JSON.stringify(id));
  for (const id of ['admin', 'api', 'flyer', 'qr', 'test', 'APP']) await bad({ id, name: 'X', to: 'https://example.org' }, 400, 'reserved_id', 'lien réservé ' + id);
  await bad({ id: 'discord', name: 'Autre', to: 'https://example.org' }, 409, 'id_taken', 'lien déjà pris');
  for (const to of ['http://example.org', 'javascript:alert(1)', '//evil.example', 'ftp://example.org/x', 'example.org', 'https://localhost/x', 'https://user:pw@example.org/', 'https://exa mple.org', '/a\\b', '', 'x'.repeat(501)])
    await bad({ id: 'essai', name: 'Essai', to }, 400, 'bad_to', 'destination ' + to.slice(0, 30));
  for (const to of ['/q/discord', '/flyer', 'https://manaorbit.app/q/discord', 'https://www.manaorbit.app/flyer', '/Q/x']) await bad({ id: 'essai', name: 'Essai', to }, 400, 'bad_to', 'boucle ' + to);
  await bad({ id: 'essai', name: '   ', to: 'https://example.org' }, 400, 'bad_name', 'nom vide');
  await bad({ id: 'essai', to: 'https://example.org' }, 400, 'bad_request', 'nom absent');
  assert.equal(byId((await api()).o, 'essai'), undefined, 'rien de créé');

  let r = await post('', { id: 'affiche-lyon', name: '  Affiche   boutique <Lyon>  ', to: 'https://example.org/promo?x=1' });
  assert.equal(r.s, 201); assert.equal(r.o.qr.id, 'affiche-lyon'); assert.equal(r.o.qr.name, 'Affiche boutique Lyon'); assert.equal(r.o.qr.link, 'https://manaorbit.app/q/affiche-lyon'); assert.equal(r.o.qr.n, 0);
  assert.match(r.o.qr.svg, /^<svg/); assert.ok(r.o.list.some(q => q.id === 'affiche-lyon'));
  assert.deepEqual([r.o.log[0].a, r.o.log[0].ok, r.o.log[0].n, r.o.log[0].d, r.o.log[0].by], ['qrnew', true, 'Affiche boutique Lyon', '/q/affiche-lyon → https://example.org/promo?x=1', 'ad•••@e•••.org']);
  assert.equal(await loc('/q/affiche-lyon', AND), 'https://example.org/promo?x=1');
  r = await post('', { id: 'Tournoi-2026', name: 'Tournoi', to: 'app' }); assert.equal(r.s, 201); assert.equal(r.o.qr.id, 'tournoi-2026', 'lien en minuscules');
  assert.equal(await loc('/q/tournoi-2026', AND), PLAY('tournoi-2026'), 'selon le téléphone : referrer au nom du lien');
  assert.equal(await loc('/q/tournoi-2026', IOS), '/?ref=tournoi-2026'); assert.equal(await loc('/q/tournoi-2026', PC), '/?ref=tournoi-2026');
  r = await post('', { id: 'mystere', name: 'Carte mystère', to: '/?mystere=1#jeu' }); assert.equal(r.s, 201);
  assert.equal(await loc('/q/mystere', PC), '/?mystere=1#jeu', 'chemin du site');
  r = await post('', { id: 'affiche-lyon', name: 'Doublon', to: 'https://example.org' }); assert.equal(r.s, 409, 'pris (créé à l\'instant)');
  assert.deepEqual(readQ().list.map(q => q.id), ['flyer', 'discord', 'affiche-lyon', 'tournoi-2026', 'mystere'], 'écrit tout de suite');
  ok('création : liens invalides (format, longueur, accents, tiret au bord), réservés et pris refusés ; destinations invalides (http, javascript:, //, sans https, localhost, identifiants, espaces) ou en boucle (/q/…, /flyer) refusées ; nom nettoyé ; adresse, « selon le téléphone » (referrer au nom du lien) et chemin du site ; journal');
}

/* ── 6) Modification : nom et destination ; le lien ne change jamais ──────────────────────────────────────────────────────────────── */
{
  let r = await post('/discord', { to: 'https://discord.gg/nouveau' });
  assert.equal(r.s, 200); assert.equal(r.o.qr.to, 'https://discord.gg/nouveau'); assert.equal(r.o.qr.link, 'https://manaorbit.app/q/discord'); assert.ok(r.o.qr.n >= 5, 'compteurs gardés');
  assert.deepEqual([r.o.log[0].a, r.o.log[0].n, r.o.log[0].d], ['qrto', 'Discord', '/q/discord : ' + DSC_INVITE + ' → https://discord.gg/nouveau']);
  assert.equal(await loc('/q/discord', IOS), 'https://discord.gg/nouveau', 'les QR déjà imprimés suivent');
  r = await post('/flyer', { name: 'Flyers A5' }); assert.equal(r.s, 200); assert.equal(r.o.qr.name, 'Flyers A5');
  assert.deepEqual([r.o.log[0].a, r.o.log[0].d], ['qrname', '/flyer · avant « Flyers »']);
  assert.equal(await loc('/flyer', AND), PLAY('flyer'), 'renommé : /flyer répond pareil');
  r = await post('/flyer', { to: 'https://example.org/salon', name: 'Flyers salon' }); assert.equal(r.s, 200);
  assert.deepEqual([r.o.log[0].a, r.o.log[0].d], ['qrto', '/flyer : selon le téléphone → https://example.org/salon · avant « Flyers A5 »']);
  assert.equal(await loc('/flyer', AND), 'https://example.org/salon');
  r = await post('/flyer', { to: 'app' }); assert.equal(r.s, 200); assert.equal(await loc('/flyer', AND), PLAY('flyer'), 'retour à « selon le téléphone » : l\'adresse d\'avant');
  const n = r.o.log.length;
  r = await post('/flyer', { to: 'app' }); assert.equal(r.s, 200); assert.equal(r.o.same, true, 'rien de changé'); assert.equal(r.o.log.length, n, 'rien de noté');
  r = await post('/discord', { id: 'autre' }); assert.equal(r.s, 400, 'le lien ne se change pas'); assert.equal(r.o.error, 'bad_request');
  r = await post('/discord', { id: 'autre', to: 'https://discord.gg/nouveau2' }); assert.equal(r.s, 200); assert.equal(r.o.qr.id, 'discord'); assert.equal(r.o.qr.link, 'https://manaorbit.app/q/discord', 'id ignoré');
  assert.equal(await loc('/q/autre', PC), '/'); assert.equal(r.o.log.length, n + 1);
  r = await post('/discord', { to: 'http://insecure.example' }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_to');
  r = await post('/discord', { name: '' }); assert.equal(r.s, 400); assert.equal(r.o.error, 'bad_name');
  r = await post('/inconnu', { name: 'X' }); assert.equal(r.s, 404);
  assert.equal(await loc('/q/discord', PC), 'https://discord.gg/nouveau2');
  ok('modification : destination (journal : avant → après ; les QR imprimés suivent), nom (journal), les deux ; lien jamais modifiable (id ignoré) ; refus : destination invalide, nom vide, QR inconnu');
}

/* ── 7) Aucune suppression possible ────────────────────────────────────────────────────────────────────────────────────────────── */
{
  for (const [m, path] of [['DELETE', '/discord'], ['DELETE', ''], ['PUT', '/discord'], ['PATCH', '/discord'], ['POST', '/discord/delete'], ['GET', '/discord']]) {
    const r = await api(path, { method: m, ...(m !== 'GET' && m !== 'DELETE' ? { body: {} } : {}) });
    assert.equal(r.s, 405, m + ' ' + path); assert.match(r.o.message, /ne se supprime jamais/);
  }
  let r = await post('/discord', { delete: true }); assert.equal(r.s, 400, 'pas de champ de suppression');
  r = await post('/discord', { to: null }); assert.equal(r.s, 400);
  const l = (await api()).o.list.map(q => q.id); assert.deepEqual(l, ['flyer', 'discord', 'affiche-lyon', 'tournoi-2026', 'mystere'], 'tous encore là');
  assert.equal(await loc('/q/discord', PC), 'https://discord.gg/nouveau2');
  ok('aucune suppression : DELETE, PUT, PATCH, …/delete → 405 « ne se supprime jamais » ; tous les QR encore là');
}

let MEM = [];
/* ── 8) Garde-fous des actions : autre page, JSON, débit ─────────────────────────────────────────────────────────────────────────── */
{
  let r = await post('/discord', { to: 'https://evil.example' }, { hd: { 'Sec-Fetch-Site': 'cross-site' } }); assert.equal(r.s, 403); assert.equal(r.o.error, 'cross_site');
  r = await api('/discord', { method: 'POST', body: 'to=https://evil.example', hd: { 'Content-Type': 'application/x-www-form-urlencoded' } }); assert.equal(r.s, 415);
  r = await post('/discord', '{pas du json'); assert.equal(r.s, 400);
  r = await post('/discord', [1, 2]); assert.equal(r.s, 400);
  r = await post('/discord', { name: 'x'.repeat(5000) }); assert.equal(r.s, 413);
  assert.equal(await loc('/q/discord', PC), 'https://discord.gg/nouveau2', 'rien de changé');
  MEM = (await api()).o.list.map(q => [q.id, q.n]);      // compteurs en mémoire : écrits avant l'arrêt (différé)
  await fileHas(f => MEM.every(([id, n]) => f.list.find(q => q.id === id).n === n), 'compteurs à jour avant l\'arrêt');
  await stop(P);
  P = await start({ ADMIN_ACTIONS_PER_H: '2' }, 19951); BASE = 'http://127.0.0.1:19951';
  const XFF = { hd: { 'x-forwarded-for': '203.0.113.21' } };      // un réseau (le serveur local n'est pas compté)
  assert.equal((await post('/mystere', { name: 'Un' }, XFF)).s, 200); assert.equal((await post('/mystere', { name: 'Deux' }, XFF)).s, 200);
  r = await post('/mystere', { name: 'Trois' }, XFF); assert.equal(r.s, 429, 'ADMIN_ACTIONS_PER_H');
  assert.equal(byId((await api()).o, 'mystere').name, 'Deux');
  ok('garde-fous : autre page (Sec-Fetch-Site) 403, formulaire 415, JSON invalide 400, trop gros 413, ADMIN_ACTIONS_PER_H 429');
}

/* ── 9) Redémarrage : fichier relu (rien de recréé, noms et compteurs gardés) ─────────────────────────────────────────────────────── */
{
  const r = await api(), fl = byId(r.o, 'flyer'), dc = byId(r.o, 'discord');
  assert.match(P.log(), /QR codes fixes : 5 /);
  assert.deepEqual(r.o.list.map(q => q.id), ['flyer', 'discord', 'affiche-lyon', 'tournoi-2026', 'mystere'], 'Flyers et Discord pas recréés');
  assert.equal(fl.name, 'Flyers salon', 'renommé : gardé'); assert.deepEqual(r.o.list.map(q => [q.id, q.n]), MEM, 'compteurs gardés'); assert.equal(dc.to, 'https://discord.gg/nouveau2');
  assert.equal(await loc('/flyer', AND), PLAY('flyer'));
  await stop(P);
  const f = readQ(); f.list = f.list.filter(q => q.id !== 'discord'); writeFileSync(FILE, JSON.stringify(f));      // retiré à la main du fichier : pas recréé
  P = await start({}, 19951); BASE = 'http://127.0.0.1:19951';
  assert.equal(byId((await api()).o, 'discord'), undefined, 'jamais recréé d\'office');
  assert.equal(await loc('/q/discord', AND), '/', 'lien inconnu : l\'accueil');
  await stop(P);
  ok('redémarrage : fichier relu, noms, destinations et compteurs gardés ; QR créés d\'office jamais recréés');
}

/* ── 10) Fichier illisible : jamais réécrit ; /flyer et les QR d'office marchent ; modifications refusées ─────────────────────────── */
{
  const d = join(mkdtempSync(join(tmpdir(), 'deckdeal-qr-')), 'admin'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'qrcodes.json'), '{abîmé');
  P = await start({ ADMIN_DIR: d }, 19952); BASE = 'http://127.0.0.1:19952';
  for (let t = 0; t < 40 && !/illisible/.test(P.log()); t++) await sleep(50);
  assert.match(P.log(), /qrcodes\.json illisible, jamais réécrit/);
  assert.equal(await loc('/flyer', AND), PLAY('flyer'), '/flyer marche toujours'); assert.equal(await loc('/flyer', PC), '/?ref=flyer');
  assert.equal(await loc('/q/discord', AND), DSC_INVITE);
  const r = await api(); assert.equal(r.s, 200); assert.equal(r.o.bad, true);
  assert.equal((await post('', { id: 'nouveau', name: 'N', to: 'https://example.org' })).s, 503);
  assert.equal((await post('/discord', { to: 'https://example.org' })).s, 503);
  await sleep(500); assert.equal(readFileSync(join(d, 'qrcodes.json'), 'utf8'), '{abîmé', 'jamais réécrit');
  await stop(P);
  ok('fichier illisible : jamais réécrit (ni compteurs ni modification : 503), /flyer et /q/discord servis d\'office');
}
console.log('\nQR CODES OK');
process.exit(0);
