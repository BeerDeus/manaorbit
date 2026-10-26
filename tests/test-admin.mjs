// Panneau d'administration côté serveur : page /admin (sans données, CSP stricte, jamais en cache ni indexée) et /api/admin (compte de l'éditeur seulement :
// jeton vérifié, adresse vérifiée, empreinte de l'adresse dans ADMIN_EMAILS ; sinon 403 sans rien). Statistiques : comptes Firebase (faux Identity Toolkit),
// Firestore (faux REST : groupes de collections, listes avec masque), état du serveur ; minimisation (ni e-mail complet, ni UID, ni nom complet, ni photo),
// pages, tri, recherche, cache et « Rafraîchir » bornés, repli sur Firestore seul quand la liste des comptes est refusée. Aucun accès réseau réel.
import './setup-env.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFakes } from './amis-fakes.mjs';
import { startAdminFakes, ADMIN, tag } from './admin-fakes.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes(), A = await startAdminFakes();
const NOW = Date.now(), FX = A.seed(NOW, 120);

/* ── 0) Page : même configuration Firebase que l'appli ; empreinte seulement dans le serveur ─────────────────────────────────────── */
{
  const cfg = f => { const s = readFileSync(f, 'utf8'), m = /const FIREBASE_CONFIG = (\{[\s\S]*?\});/.exec(s), b = /const FB_BASE = '([^']+)'/.exec(s); return { c: new Function('FB_AUTH_SELF', 'return ' + m[1])(false), base: b[1] }; };      // hors manaorbit.app : domaine d'auth Firebase (la page admin reste en fenêtre)
  const app = cfg('src/cloud.js'), adm = cfg('pwa/admin.js');
  assert.deepEqual(adm.c, app.c, 'configuration Firebase de la page admin = celle de l\'appli'); assert.equal(adm.base, app.base, 'même version du SDK');
  const src = readFileSync('server/proxy.mjs', 'utf8'), def = /const ADMIN_DEFAULT = \['([0-9a-f]+)'\];/.exec(src);
  assert.ok(def && def[1].length === 64, 'liste par défaut : une empreinte SHA-256');
  for (const f of ['pwa/admin.html', 'pwa/admin.js', 'pwa/admin.css']) assert.doesNotMatch(readFileSync(f, 'utf8'), /[\w.+-]+@(gmail|googlemail|hotmail|outlook|yahoo|icloud)\.[a-z]+/i, f + ' : aucune adresse');
  assert.doesNotMatch(readFileSync('pwa/admin.html', 'utf8'), /<script>|<style>| style=| on[a-z]+=/i, 'page admin : rien en ligne (CSP stricte)');
  ok('page admin : configuration et SDK Firebase identiques à l\'appli ; aucune adresse dans les fichiers ; rien en ligne (CSP) ; serveur : liste par défaut = une empreinte');
}

const procs = [];
const start = (env, p) => new Promise((resolve, reject) => {
  const c = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(p), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.log = () => out;
  c.stdout.on('data', d => { out += d; if (/Mana Orbit →/.test(out)) resolve(c); }); c.stderr.on('data', d => { out += d; });
  c.on('exit', code => { if (code) reject(new Error('exit ' + code + ': ' + out)); });
  procs.push(c);
});
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch {} A.stop(); F.stop(); });
let BASE = '';
/** Appel de l'API admin ; tok : jeton ('' : aucun) ; hd : en-têtes en plus. */
const api = async (path = '', tok = '', { method = 'GET', hd = {} } = {}) => {
  const h = { ...(tok ? { 'x-firebase-token': tok } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...hd };
  const r = await fetch(BASE + '/api/admin' + path, { method, headers: h, ...(method === 'POST' ? { body: '{}' } : {}) });
  const t = await r.text(); let o; try { o = JSON.parse(t); } catch { o = t; } return { s: r.status, o, t, h: r.headers };
};
const ADM = (extra = {}) => F.jwt('uid-admin-00', 3600, { email: ADMIN, email_verified: true, ...extra });
const JEANNE = () => F.jwt('uid-jeanne-01', 3600, { email: 'jeanne.dupont@gmail.com', email_verified: true });
const ENV = { ...F.env, ...A.env, ADMIN_EMAILS: `${ADMIN}, second@example.org`, ADMIN_REFRESH_GAP_MS: '700', ADMIN_REFRESH_PER_H: '2', ADMIN_TTL_MS: '8000', ADMIN_ACTIONS_PER_H: '3' };

/* ── 1) ADMIN=0 : coupé ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const P = await start({ ...ENV, ADMIN: '0' }, 19400); BASE = 'http://127.0.0.1:19400';
  assert.equal((await fetch(BASE + '/admin')).status, 404); assert.equal((await api('', ADM())).s, 404);
  assert.doesNotMatch(P.log(), /Administration/); P.kill();
  ok('ADMIN=0 : page et API absentes (404)');
}

/* ── 2) Sans compte de service : seul l'état du serveur ─────────────────────────────────────────────────────────────────────── */
{
  const P = await start({ FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: ADMIN }, 19401); BASE = 'http://127.0.0.1:19401';
  for (let t = 0; t < 40 && !/Administration/.test(P.log()); t++) await sleep(50);
  assert.match(P.log(), /Administration : \/admin, 1 adresse autorisée \(ADMIN_EMAILS\)/);
  assert.equal((await api('', JEANNE())).s, 403);
  const r = await api('', ADM()); assert.equal(r.s, 200);
  assert.equal(r.o.src, 'none'); assert.deepEqual(r.o.notes.map(n => n.k), ['sa']); assert.equal(r.o.ov.users, 0); assert.equal(r.o.users.total, 0);
  assert.equal(r.o.srv.flags.fcm, false); assert.equal(typeof r.o.srv.up, 'number'); assert.ok(r.o.srv.troc && r.o.srv.prices && r.o.srv.edh);
  P.kill(); ok('sans compte de service : avis « compte de service absent », aucun compte, état du serveur seulement');
}

/* ── 3) Page, accès, statistiques, minimisation ─────────────────────────────────────────────────────────────────────────────── */
const P = await start(ENV, 19402); BASE = 'http://127.0.0.1:19402';
for (let t = 0; t < 40 && !/Administration/.test(P.log()); t++) await sleep(50);
assert.match(P.log(), /Administration : \/admin, 2 adresses autorisées \(ADMIN_EMAILS\)/);
{
  for (const u of ['/admin', '/admin/']) {
    const r = await fetch(BASE + u), html = await r.text(), csp = r.headers.get('content-security-policy') || '';
    assert.equal(r.status, 200, u); assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    for (const re of [/default-src 'none'/, /script-src 'self' https:\/\/www\.gstatic\.com https:\/\/apis\.google\.com;/, /frame-ancestors 'none'/, /base-uri 'none'/, /frame-src https:\/\/m2s-mtg\.firebaseapp\.com/]) assert.match(csp, re, u + ' CSP ' + re);
    assert.doesNotMatch(csp, /unsafe-(inline|eval)/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/); assert.match(html, /src="\/admin\/app\.js"/);
    assert.doesNotMatch(html, /Jeanne|BobLeMage|@example|uid-/, 'page : aucune donnée');
  }
  const js = await fetch(BASE + '/admin/app.js'), css = await fetch(BASE + '/admin/app.css');
  assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/); assert.equal(js.headers.get('cache-control'), 'no-store');
  assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(BASE + '/admin', { method: 'POST' })).status, 404); assert.equal((await fetch(BASE + '/admin/x.js')).status, 404);
  assert.equal(A.it.calls.length + A.fs.queries.length + A.fs.lists.length, 0, 'rien de lu avant la première demande');
  ok('/admin et /admin/ : page sans données, CSP stricte (rien en ligne, SDK Firebase et fenêtre Google seulement), no-store, noindex ; script et style à part');
}
{
  let r = await api(''); assert.equal(r.s, 401); assert.equal(r.o.error, 'auth_required');
  r = await api('', ADM().slice(0, -6) + 'AAAAAA'); assert.equal(r.s, 401); assert.equal(r.o.error, 'bad_token');
  r = await api('', F.jwt('uid-admin-00', -60, { email: ADMIN })); assert.equal(r.s, 401); assert.equal(r.o.error, 'token_expired');
  for (const [tok, why] of [[JEANNE(), 'autre compte'], [ADM({ email_verified: false }), 'adresse non vérifiée'], [ADM({ email: undefined }), 'sans adresse'], [ADM({ email: 'admin@example.org.evil.com' }), 'adresse voisine']]) {
    r = await api('', tok); assert.equal(r.s, 403, why); assert.deepEqual(r.o, { error: 'forbidden', message: 'Accès réservé.' }, why + ' : rien d\'autre');
    assert.equal(r.h.get('cache-control'), 'no-store'); assert.match(r.h.get('x-robots-tag'), /noindex/);
    r = await api('/refresh', tok, { method: 'POST' }); assert.equal(r.s, 403, why + ' (rafraîchir)');
  }
  assert.equal(A.it.calls.length + A.fs.queries.length + A.fs.lists.length, 0, 'refusés avant toute lecture');
  assert.equal((await api('', ADM({ email: 'Admin@EXAMPLE.org' }))).s, 200, 'adresse comparée sans la casse');
  assert.equal((await api('', F.jwt('uid-autre', 3600, { email: 'second@example.org' }))).s, 200, 'deuxième adresse de ADMIN_EMAILS');
  ok('accès : sans jeton 401, jeton falsifié ou expiré 401, autre compte / adresse non vérifiée / sans adresse / adresse voisine → 403 sans aucune donnée, avant toute lecture ; adresses de ADMIN_EMAILS (sans la casse)');
}
const fold = o => JSON.stringify(o);
const ROWKEYS = ['cards', 'copies', 'created', 'decks', 'disabled', 'dlinks', 'friends', 'id', 'inc', 'lang', 'login', 'mail', 'mo', 'name', 'out', 'prov', 'pub', 'seen', 'trade', 'value', 'verified', 'wish'];
const all = [];
{
  const r = await api('', ADM()); assert.equal(r.s, 200);
  assert.equal(r.h.get('cache-control'), 'no-store'); assert.match(r.h.get('x-robots-tag'), /noindex/);
  const { ov, users } = r.o;
  assert.equal(r.o.src, 'auth'); assert.deepEqual(r.o.notes, []); assert.ok(Math.abs(r.o.at - Date.now()) < 10000); assert.equal(r.o.ttl, 8000);
  assert.equal(ov.users, 124); assert.equal(ov.mo, 123, 'compte sans aucune donnée Mana Orbit (autre appli du projet) : compté à part'); assert.equal(ov.verified, 123); assert.equal(ov.disabled, 1);
  const since = d => FX.users.filter(u => Number(u.createdAt) > NOW - d * 86400e3).length;
  assert.equal(ov.new7, since(7)); assert.equal(ov.new30, since(30));
  assert.equal(ov.days.length, 30); assert.equal(ov.days[29][0], new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()), 'dernier jour : aujourd\'hui (heure de Paris)');
  const keys = new Set(ov.days.map(d => d[0])), inDays = FX.users.filter(u => keys.has(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Number(u.createdAt))))).length;
  assert.equal(ov.days.reduce((t, d) => t + d[1], 0), inDays);
  assert.deepEqual([ov.cards, ov.copies, ov.colls, ov.decks, ov.pub, ov.reports, ov.trade, ov.dlinks, ov.wish, ov.friendships, ov.pending, ov.amis, ov.value, ov.valued],
    [2 + 2 + 119, 6 + 9 + 7140, 121, 3 + 180, 2, 1, 1, 2, 3, 1, 2, 3, 12345, 1]);
  assert.deepEqual(ov.prov, { google: 123, mail: 1 }); assert.deepEqual(ov.langs, { fr: 1, en: 1, de: 1 });
  assert.ok(ov.act7 >= 1 && ov.act30 >= ov.act7 && ov.log30 >= ov.log7);
  assert.equal(users.total, 124); assert.equal(users.pages, 3); assert.equal(users.page, 1); assert.equal(users.per, 50); assert.equal(users.rows.length, 50); assert.equal(users.sort, 'created'); assert.equal(users.dir, 'desc');
  for (const row of users.rows) assert.deepEqual(Object.keys(row).sort(), ROWKEYS);
  ok('statistiques : 124 comptes (123 avec des données Mana Orbit), vérifiés, désactivés, nouveaux 7 j / 30 j, 30 jours d\'inscriptions (heure de Paris), cartes, exemplaires, decks, decks publics, signalements, liens, amitiés, demandes, valeur, connexion, langues');
  // pages : 50 + 50 + 24, toutes différentes ; page hors bornes ramenée à la dernière
  all.push(...users.rows);
  for (const pg of [2, 3]) { const x = await api('?page=' + pg, ADM()); assert.equal(x.o.users.page, pg); all.push(...x.o.users.rows); }
  assert.equal(all.length, 124); assert.equal(new Set(all.map(x => x.id)).size, 124); assert.ok(all.every(x => /^[\w-]{12}$/.test(x.id)), 'identifiant opaque de 12 caractères');
  assert.equal((await api('?page=99', ADM())).o.users.page, 3);
  const created = all.map(x => x.created); assert.deepEqual(created, created.slice().sort((a, b) => b - a), 'inscription : plus récents d\'abord');
  ok('pages de 50 (50, 50, 24 ; hors bornes : la dernière), identifiants opaques uniques, tri par défaut : inscription décroissante');
}
{
  // minimisation : rien qui identifie directement un compte
  const txt = fold(all) + (await api('', ADM())).t;
  for (const u of FX.users) { assert.ok(!txt.includes(u.email), 'e-mail complet ' + u.email); assert.ok(!txt.includes(u.localId), 'UID ' + u.localId); }
  for (const bad of ['uid-', 'Dupont', 'Ann Martin', 'lh3.googleusercontent', 'SECRETHASH', 'SECRETSALT', '+33600000000', 'data:image', 'ShareJeanne1', 'LinkA', 'Atraxa secret', 'Ancestral Recall', 'raw-', tag('uid-jeanne-01'), tag('uid-bob-02')])
    assert.ok(!txt.includes(bad), 'jamais envoyé : ' + bad);
  const one = async q => { const x = await api('?q=' + encodeURIComponent(q), ADM()); assert.equal(x.o.users.total, 1, q); return x.o.users.rows[0]; };
  const j = await one('jeanne');
  const { id, seen, created, login, ...rest } = j;
  assert.deepEqual(rest, { name: 'Jeanne D.', mail: 'je•••@gmail.com', prov: ['google'], verified: true, disabled: false, cards: 2, copies: 6, decks: 3, pub: 2, trade: true, dlinks: 2, wish: 3, friends: 1, inc: 1, out: 0, lang: 'fr', value: 12345, mo: true });
  assert.equal(created, NOW - 2 * 86400e3); assert.equal(login, NOW - 3600e3); assert.ok(Math.abs(seen - (NOW - 60e3)) < 5, 'activité : le document le plus récent (réglages, il y a 1 min)');
  const b = await one('boble');
  assert.deepEqual([b.name, b.mail, b.prov, b.verified, b.cards, b.copies, b.friends, b.out, b.lang], ['BobLeMage', 'b•••@e•••.fr', ['mail'], false, 2, 9, 1, 1, 'en'], 'pseudo d\'un mot gardé ; domaine privé masqué ; cartes distinctes comptées sans le champ count');
  const c = await one('carol');
  assert.deepEqual([c.name, c.mail, c.mo, c.lang, c.inc, c.out, c.cards], ['Carol M.', 'ca•••@outlook.com', true, 'de', 1, 1, 0], 'nom Google de trois mots : prénom + initiale du dernier');
  const d = await one('dave');
  assert.deepEqual([d.name, d.mail, d.disabled, d.mo, d.decks], ['Dave', 'd•••@icloud.com', true, false, 0]);
  assert.equal((await api('?q=dupont', ADM())).o.users.total, 0, 'recherche sur le nom réduit seulement');
  assert.equal((await api('?q=JEANNE', ADM())).o.users.total, 1, 'sans la casse');
  assert.equal((await api('?q=gmail', ADM())).o.users.total, 121, 'et sur l\'e-mail masqué');
  ok('minimisation : prénom + initiale, pseudo d\'un mot gardé, e-mail masqué (domaine privé aussi), jamais d\'e-mail complet, d\'UID, de nom complet, de photo, de hachage, de téléphone, de lien ni de nom de deck ; recherche sur ce qui est affiché');
}
{
  // tri et sens
  for (const [sort, dir] of [['cards', 'desc'], ['decks', 'desc'], ['created', 'asc'], ['login', 'desc'], ['seen', 'asc']]) {
    const x = await api(`?sort=${sort}&dir=${dir}`, ADM()), v = x.o.users.rows.map(r => r[sort]);
    assert.equal(x.o.users.sort, sort); assert.equal(x.o.users.dir, dir);
    assert.deepEqual(v, v.slice().sort((a, b) => (dir === 'asc' ? a - b : b - a)), sort + ' ' + dir);
  }
  const x = await api('?sort=decks&dir=desc', ADM()); assert.equal(x.o.users.rows[0].decks, 3);
  assert.equal((await api('?sort=mail', ADM())).o.users.sort, 'created', 'tri inconnu : inscription');
  ok('tri : cartes, decks, inscription, connexion, activité, dans les deux sens ; tri inconnu → inscription');
}
{
  // coût : champs demandés, une seule lecture pour toutes ces pages (cache)
  const meta = A.fs.queries.filter(q => q.col === 'meta'), decks = A.fs.queries.filter(q => q.col === 'decks');
  assert.ok(meta.length >= 1 && meta.every(q => q.all && q.order.includes('__name__')));
  assert.deepEqual(meta[0].sel.sort(), ['count', 'dsh', 'name', 'pts', 'share', 'text', 'updatedAt', 'wish'], 'meta : ni photo, ni liste gardée, ni decks montés, ni scan');
  assert.deepEqual(decks[0].sel, ['updatedAt'], 'decks : la date seulement');
  assert.deepEqual([...new Set(A.fs.lists.map(l => l.col + ':' + l.sel.join(',')))].sort(), ['amis:j', 'pubdecks:o,by,cmd,updatedAt', 'pubreports:d'], 'pubdecks : ce que la Communauté montre déjà (jamais le nom du deck ni ses cartes)');
  assert.equal(A.it.calls.length, 3, 'comptes : 3 pages (124 comptes, 50 par page)'); assert.ok(A.it.auth.every(a => /^Bearer ya29\.am-\d+$/.test(a)));
  assert.ok(F.oauth.scopes.includes('https://www.googleapis.com/auth/cloud-platform') && F.oauth.scopes.includes('https://www.googleapis.com/auth/datastore'));
  const docsRead = meta.reduce((t, q) => t + q.n, 0);
  assert.equal(docsRead, [...FX.docs.keys()].filter(p => /\/meta\//.test(p)).length, 'chaque document meta lu une fois');
  ok('coût : un calcul pour toutes les pages, tris et recherches (cache) ; masques de champs (meta, decks : updatedAt, pubdecks : o, by, cmd, updatedAt, pubreports : d, amis : j) ; ' + docsRead + ' documents meta lus ; Identity Toolkit par pages, portée cloud-platform');
}
{
  // « Rafraîchir » : une fois par ADMIN_REFRESH_GAP_MS, ADMIN_REFRESH_PER_H par heure et par réseau ; TTL : recalcul automatique
  const n0 = A.it.calls.length, XFF = { 'x-forwarded-for': '203.0.113.7' };
  let r = await api('/refresh', ADM(), { method: 'POST', hd: XFF });
  if (r.s === 429) { await sleep(800); r = await api('/refresh', ADM(), { method: 'POST', hd: XFF }); }
  assert.equal(r.s, 200); assert.equal(r.o.users.total, 124); assert.equal(A.it.calls.length, n0 + 3, 'relu');
  r = await api('/refresh', ADM(), { method: 'POST', hd: XFF }); assert.equal(r.s, 429); assert.equal(r.o.error, 'rate_limited'); assert.ok(Number(r.h.get('retry-after')) >= 1);
  assert.equal(A.it.calls.length, n0 + 3, 'refusé : rien relu');
  await sleep(800); r = await api('/refresh?sort=cards', ADM(), { method: 'POST', hd: XFF }); assert.equal(r.s, 200); assert.equal(r.o.users.sort, 'cards');
  await sleep(800); r = await api('/refresh', ADM(), { method: 'POST', hd: XFF }); assert.equal(r.s, 429, 'plus de 2 par heure (ADMIN_REFRESH_PER_H)');
  assert.equal(A.it.calls.length, n0 + 6);
  assert.equal((await api('/refresh', ADM())).s, 405, 'GET /refresh : refusé');
  await sleep(8200); const n1 = A.it.calls.length;
  r = await api('', ADM()); assert.equal(r.s, 200); assert.equal(A.it.calls.length, n1 + 3, 'plus vieux que ADMIN_TTL_MS : recalculé');
  ok('« Rafraîchir » : recalcul (avec le tri demandé), refusé dans la minute (429, Retry-After) et au-delà de ADMIN_REFRESH_PER_H par heure ; données plus vieilles que ADMIN_TTL_MS recalculées');
}
{
  // journal : aucune donnée d'un compte
  const log = P.log();
  for (const u of FX.users.slice(0, 6)) { assert.ok(!log.includes(u.email)); assert.ok(!log.includes(u.localId)); }
  for (const bad of ['Jeanne', 'Dupont', 'BobLeMage', ADMIN, 'second@example.org']) assert.ok(!log.includes(bad), 'journal : ' + bad);
  ok('journal : aucune adresse (ni celles de ADMIN_EMAILS), aucun UID, aucun nom');
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
{
  // Comptes actifs par jour : relevés à chaque calcul (ADMIN_DIR/actifs.json) ; avant le premier relevé, rien (null), jamais deviné
  const r = await api('', ADM()), { active } = r.o, rows = [];
  for (let pg = 1; pg <= r.o.users.pages; pg++) rows.push(...(await api('?page=' + pg, ADM())).o.users.rows);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }), n = rows.filter(x => x.seen > 0 && fmt.format(new Date(x.seen)) === today()).length;
  assert.ok(n >= 3, 'fixture : des comptes actifs aujourd\'hui (' + n + ')');
  assert.equal(active.days.length, 30); assert.deepEqual(active.days[29], [today(), n], 'aujourd\'hui : comptes dont la dernière activité est aujourd\'hui');
  assert.ok(active.days.slice(0, 29).every(d => d[1] === null), 'jours sans relevé : null'); assert.equal(active.since, today()); assert.equal(active.every, 3600e3);
  const f = JSON.parse(readFileSync(join(process.env.ADMIN_DIR, 'actifs.json'), 'utf8')); assert.deepEqual(Object.keys(f.days), [today()]); assert.equal(f.days[today()].a, n);
  ok('actifs par jour : ' + n + ' aujourd\'hui (même sens que « Actifs » : connexion, jeton renouvelé ou document modifié), gardés dans ADMIN_DIR/actifs.json ; jours sans relevé : vides');
}
{
  // Actions : désactiver / réactiver un compte, retirer un deck public — refus d'abord (rien d'écrit), puis effet, journal, rôle IAM manquant
  const act = (path, tok, body, hd = {}) => fetch(BASE + '/api/admin' + path, { method: 'POST', headers: { ...(tok ? { 'x-firebase-token': tok } : {}), 'Content-Type': 'application/json', ...hd }, body: JSON.stringify(body) })
    .then(async r => ({ s: r.status, o: await r.json().catch(() => null), h: r.headers }));
  const jid = (await api('?q=jeanne', ADM())).o.users.rows[0].id, u0 = A.it.updates.length, d0 = A.fs.deletes.length;
  assert.equal((await act('/disable', '', { id: jid, on: true })).s, 401, 'sans jeton');
  let x = await act('/disable', JEANNE(), { id: jid, on: true }); assert.equal(x.s, 403); assert.deepEqual(x.o, { error: 'forbidden', message: 'Accès réservé.' }, 'autre compte : rien d\'autre');
  const form = await fetch(BASE + '/api/admin/disable', { method: 'POST', headers: { 'x-firebase-token': ADM(), 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: jid, on: true }) });
  assert.equal(form.status, 415, 'pas en JSON (formulaire d\'une autre page) : refusé');
  assert.equal((await act('/disable', ADM(), { id: jid, on: true }, { 'sec-fetch-site': 'cross-site' })).s, 403, 'demande venue d\'un autre site');
  assert.equal((await act('/pubdel', ADM(), { k: 'x' }, { 'sec-fetch-site': 'same-site' })).s, 403, 'ni d\'un sous-domaine');
  assert.equal((await api('/disable', ADM())).s, 405, 'GET : refusé'); assert.equal((await api('/pubdel', ADM())).s, 405);
  assert.equal((await act('/disable', ADM(), { id: 'inconnu00000', on: true })).s, 404); assert.equal((await act('/disable', ADM(), { id: jid })).s, 400, 'on manquant');
  assert.equal((await act('/disable', ADM(), { id: jid, on: 'oui' })).s, 400); assert.equal((await act('/pubdel', ADM(), { k: 'inconnu' })).s, 404);
  assert.equal(A.it.updates.length, u0, 'refusés : rien envoyé à Firebase'); assert.equal(A.fs.deletes.length, d0);
  // désactiver, puis réactiver : Identity Toolkit accounts:update (disableUser), liste et chiffres à jour sans recalcul
  const n1 = A.it.calls.length - A.it.updates.length;
  x = await act('/disable', ADM(), { id: jid, on: true }, { 'sec-fetch-site': 'same-origin' });
  assert.equal(x.s, 200); assert.equal(x.h.get('cache-control'), 'no-store'); assert.equal(x.o.row.disabled, true); assert.equal(x.o.row.id, jid); assert.equal(x.o.ov.disabled, 2);
  assert.deepEqual(A.it.updates.at(-1), { localId: 'uid-jeanne-01', disableUser: true }); assert.equal(FX.users.find(u => u.localId === 'uid-jeanne-01').disabled, true);
  const { t, ...e1 } = x.o.log[0]; assert.ok(Math.abs(t - Date.now()) < 5000);
  assert.deepEqual(e1, { a: 'off', n: 'Jeanne D.', m: 'je•••@gmail.com', by: 'ad•••@e•••.org', ok: true }, 'journal : nom réduit, e-mail masqué, éditeur masqué');
  let j = (await api('?q=jeanne', ADM())).o; assert.equal(j.users.rows[0].disabled, true); assert.equal(j.ov.disabled, 2); assert.equal(j.log[0].a, 'off');
  assert.equal(A.it.calls.length - A.it.updates.length, n1, 'rien relu');
  x = await act('/disable', ADM(), { id: jid, on: false }); assert.equal(x.s, 200); assert.equal(x.o.row.disabled, false); assert.equal(x.o.ov.disabled, 1);
  assert.deepEqual(A.it.updates.at(-1), { localId: 'uid-jeanne-01', disableUser: false }); assert.equal(FX.users.find(u => u.localId === 'uid-jeanne-01').disabled, undefined);
  assert.deepEqual(x.o.log.slice(0, 2).map(l => l.a), ['on', 'off'], 'plus récente d\'abord');
  // rôle IAM manquant : message clair, rien changé, essai noté
  A.it.denyUpdate = 1; x = await act('/disable', ADM(), { id: jid, on: true }); A.it.denyUpdate = 0;
  assert.equal(x.s, 502); assert.equal(x.o.error, 'iam'); assert.match(x.o.message, /HTTP 403/);
  assert.match(x.o.message, /Rôle IAM à ajouter au compte de service : « Administrateur Firebase Authentication » \(roles\/firebaseauth\.admin\)/);
  assert.deepEqual([x.o.log[0].a, x.o.log[0].ok, x.o.log[0].e], ['off', false, 'HTTP 403']);
  assert.equal((await api('?q=jeanne', ADM())).o.users.rows[0].disabled, false, 'refusé : toujours actif');
  assert.match(P.log(), /Admin : désactivation impossible \(HTTP 403\)/);
  // compte administrateur (adresse de ADMIN_EMAILS, ici le sien) : jamais désactivé d'ici
  const cid = (await api('?q=carol', ADM())).o.users.rows[0].id, u1 = A.it.updates.length;
  x = await act('/disable', F.jwt('uid-carol-03', 3600, { email: 'second@example.org' }), { id: cid, on: true }); assert.equal(x.s, 400); assert.equal(x.o.error, 'admin_account');
  assert.equal(A.it.updates.length, u1);
  ok('désactiver / réactiver : refusés sans jeton, autre compte, pas en JSON, autre site, GET, compte inconnu, sans « on » (rien envoyé) ; accounts:update (disableUser), liste et chiffres à jour sans relecture ; rôle manquant → « Administrateur Firebase Authentication » (roles/firebaseauth.admin) ; son propre compte : refusé');

  // decks publics d'un compte, signalés, retrait
  const T0 = tag('uid-jeanne-01'), pd = (await api('/pubdecks?id=' + jid, ADM())).o.rows;
  assert.deepEqual(pd.map(d => [d.slot, d.by, d.cmd, d.rep, d.hid, d.owner, d.name, d.mail]), [[0, 'Jeanne', ['Atraxa, Praetors\' Voice'], 1, false, jid, 'Jeanne D.', 'je•••@gmail.com'], [1, 'Jeanne', ['Krenko, Mob Boss'], 0, false, jid, 'Jeanne D.', 'je•••@gmail.com']]);
  assert.ok(pd.every(d => /^[\w-]{12}$/.test(d.k) && d.at > 0)); assert.ok(!JSON.stringify(pd).includes(T0), 'jamais l\'identifiant du document (empreinte du compte)'); assert.ok(!JSON.stringify(pd).includes('Atraxa secret'), 'ni le nom du deck');
  assert.equal((await api('/pubdecks?id=inconnu00000', ADM())).s, 404);
  let m = (await api('', ADM())).o; assert.deepEqual(m.reported.map(d => [d.k, d.rep, d.owner]), [[pd[0].k, 1, jid]], 'decks signalés');
  A.fs.denyWrite = 1; x = await act('/pubdel', ADM(), { k: pd[0].k }); A.fs.denyWrite = 0;
  assert.equal(x.s, 502); assert.match(x.o.message, /HTTP 403/); assert.ok(A.fs.docs.has(`pubdecks/${T0}_0`)); assert.equal(x.o.log[0].ok, false);
  x = await act('/pubdel', ADM(), { k: pd[0].k }); assert.equal(x.s, 200); assert.equal(x.o.gone, false); assert.deepEqual(x.o.reported, []); assert.equal(x.o.ov.pub, 1);
  assert.equal(A.fs.deletes.at(-1), `pubdecks/${T0}_0?exists`, 'effacé seulement s\'il existe encore'); assert.ok(!A.fs.docs.has(`pubdecks/${T0}_0`)); assert.ok(A.fs.docs.has(`pubreports/${T0}_0~${tag('r1')}`), 'ses signalements restent');
  assert.deepEqual([x.o.log[0].a, x.o.log[0].n, x.o.log[0].d, x.o.log[0].ok], ['pub', 'Jeanne D.', 'Atraxa, Praetors\' Voice · par Jeanne', true]);
  m = (await api('?q=jeanne', ADM())).o; assert.equal(m.users.rows[0].pub, 1); assert.equal(m.ov.pub, 1); assert.equal((await api('/pubdecks?id=' + jid, ADM())).o.rows.length, 1);
  assert.equal((await act('/pubdel', ADM(), { k: pd[0].k })).s, 404, 'déjà retiré d\'ici');
  A.fs.docs.delete(`pubdecks/${T0}_1`);      // retiré entre-temps par son propriétaire
  x = await act('/pubdel', ADM(), { k: pd[1].k }); assert.equal(x.s, 200); assert.equal(x.o.gone, true); assert.equal(x.o.log[0].e, 'déjà retiré'); assert.equal(x.o.ov.pub, 0);
  ok('decks publics : ceux d\'un compte et les signalés (clé opaque, pseudo, commandants, signalements ; jamais l\'identifiant du document ni le nom du deck) ; retrait (document effacé, signalements gardés, chiffres à jour), refus de Firestore, déjà retiré');

  // budget : ADMIN_ACTIONS_PER_H par heure et par réseau
  const XFF = { 'x-forwarded-for': '203.0.113.9' }, codes = [];
  for (let i = 0; i < 4; i++) codes.push((await act('/disable', ADM(), { id: jid, on: false }, XFF)).s);
  assert.deepEqual(codes, [200, 200, 200, 429], 'ADMIN_ACTIONS_PER_H=3');
  // journal sur le disque : jamais d'UID ni d'adresse complète
  const jf = readFileSync(join(process.env.ADMIN_DIR, 'journal.json'), 'utf8'), jl = JSON.parse(jf).list;
  assert.equal(jl.length, 9); for (const bad of ['uid-', 'jeanne.dupont', ADMIN, T0]) assert.ok(!jf.includes(bad), 'journal.json : ' + bad);
  for (const bad of ['Jeanne', 'jeanne.dupont', ADMIN]) assert.ok(!P.log().includes(bad), 'journal du serveur : ' + bad);
  ok('budget des actions (429 au-delà de ADMIN_ACTIONS_PER_H) ; journal des actions dans ADMIN_DIR/journal.json (9 essais), sans UID ni adresse complète');
}
{
  // Export CSV : même liste (tri, recherche), mêmes champs réduits ; formules neutralisées ; borné
  A.fs.docs.set('users/uid-gen-005/meta/profile', { name: '=HYPERLINK("https://x.example")', updatedAt: NOW }); A.fs.docs.set('users/uid-gen-006/meta/profile', { name: 'Le;Mage "X"', updatedAt: NOW });
  let r = await api('/refresh', ADM(), { method: 'POST' }); if (r.s === 429) { await sleep(800); r = await api('/refresh', ADM(), { method: 'POST' }); } assert.equal(r.s, 200);
  const e = await fetch(BASE + '/api/admin/export?sort=cards&dir=desc&q=gen', { headers: { 'x-firebase-token': ADM() } }), buf = Buffer.from(await e.arrayBuffer());
  assert.equal(e.status, 200); assert.match(e.headers.get('content-type'), /^text\/csv; charset=utf-8/); assert.equal(e.headers.get('cache-control'), 'no-store'); assert.match(e.headers.get('x-robots-tag'), /noindex/);
  assert.match(e.headers.get('content-disposition'), /^attachment; filename="comptes-mana-orbit-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM (Excel)');
  const csv = buf.toString('utf8').slice(1), lines = csv.trimEnd().split('\r\n'), q = (await api('?q=gen&sort=cards&dir=desc', ADM())).o.users;
  assert.equal(lines[0], 'Nom;E-mail (masqué);Connexion;Adresse vérifiée;Désactivé;Données Mana Orbit;Inscription;Dernière connexion;Dernière activité;Cartes;Exemplaires;Decks;Decks publics;Lien d\'échange;Decks partagés;Cartes recherchées;Amis;Demandes reçues;Demandes envoyées;Langue;Valeur (€)');
  assert.equal(lines.length, q.total + 1); assert.equal(q.total, 118, 'recherche « gen » : les noms (deux pseudos changés ci-dessus n\'y sont plus)');
  const cell = v => (/^[=+\-@]/.test(v) ? '\'' + v : /[;"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  assert.ok(lines[1].startsWith(cell(q.rows[0].name) + ';' + q.rows[0].mail + ';Google;oui;non;oui;'), 'même ordre que la liste : ' + lines[1]);
  const cards = lines.slice(1).map(l => Number(l.split(';')[9])); assert.deepEqual(cards, cards.slice().sort((a, b) => b - a), 'tri par cartes');
  assert.match(lines[1], /;\d{4}-\d{2}-\d{2} \d{2}:\d{2};/, 'dates : heure de Paris');
  for (const u of FX.users) { assert.ok(!csv.includes(u.email), 'e-mail complet'); assert.ok(!csv.includes(u.localId), 'UID'); }
  assert.ok(!/uid-|Dupont|ShareJeanne1|data:image/.test(csv));
  const all = (await (await fetch(BASE + '/api/admin/export', { headers: { 'x-firebase-token': ADM() } })).text()).trimEnd().split('\r\n');
  assert.equal(all.length, 125); assert.ok(all.some(l => l.startsWith('\'=HYPERLINK;')), 'formule neutralisée (apostrophe)'); assert.ok(all.some(l => l.startsWith('"Le;Mage X.";')), 'point-virgule : entre guillemets');
  assert.ok(all.some(l => l.startsWith('Jeanne D.;je•••@gmail.com;Google;oui;non;oui;') && /;123,45$/.test(l)), 'valeur en euros');
  assert.equal((await fetch(BASE + '/api/admin/export', { headers: { 'x-firebase-token': JEANNE() } })).status, 403); assert.equal((await fetch(BASE + '/api/admin/export')).status, 401);
  const XFF = { 'x-forwarded-for': '203.0.113.11' }, codes = [];
  for (let i = 0; i < 21; i++) codes.push((await fetch(BASE + '/api/admin/export', { headers: { 'x-firebase-token': ADM(), ...XFF } })).status);
  assert.deepEqual([codes.slice(0, 20).every(c => c === 200), codes[20]], [true, 429], '20 exports par heure et par réseau');
  ok('export CSV : la liste en cours (recherche, tri), mêmes champs réduits, BOM et point-virgule, dates de Paris, valeur en euros ; jamais d\'e-mail complet ni d\'UID ; formules neutralisées ; éditeur seulement ; 20 par heure');
}

/* ── 4) Liste des comptes refusée (rôle IAM manquant) : Firestore seul ─────────────────────────────────────────────────────────── */
{
  A.it.deny = 1; await sleep(800);
  let r = await api('/refresh', ADM(), { method: 'POST' }); assert.equal(r.s, 200);
  assert.equal(r.o.src, 'firestore'); assert.deepEqual(r.o.notes.map(n => n.k), ['auth']); assert.match(r.o.notes[0].t, /roles\/firebaseauth\.viewer/); assert.match(r.o.notes[0].t, /HTTP 403/);
  assert.equal(r.o.ov.users, 123, 'comptes trouvés dans Firestore (users/…/meta et decks), dont un compte supprimé de Firebase'); assert.equal(r.o.ov.verified, null); assert.equal(r.o.ov.new30, 0);
  assert.equal(r.o.ov.cards, 123); assert.equal(r.o.ov.decks, 184);
  const j = (await api('?q=jeanne', ADM())).o.users.rows[0];
  assert.deepEqual([j.name, j.mail, j.created, j.login, j.verified, j.prov, j.cards, j.decks, j.friends], ['Jeanne D.', '', 0, 0, null, [], 2, 3, 1]);
  assert.ok(!fold((await api('?page=3', ADM())).o).includes('uid-'), 'repli : toujours aucun UID');
  assert.match(P.log(), /Admin : liste des comptes Firebase impossible \(HTTP 403\)/);
  A.it.deny = 0;
  ok('liste des comptes refusée (403) : repli sur Firestore (comptes tirés des documents, sans e-mail ni dates), avis avec le rôle IAM à ajouter (roles/firebaseauth.viewer)');
}

/* ── 5) Firestore en panne ou refusé : comptes Firebase seuls ; les deux : rien ─────────────────────────────────────────────────── */
{
  A.fs.down = 1; await sleep(800);
  let r = await api('/refresh', ADM(), { method: 'POST' }); assert.equal(r.s, 200);
  assert.equal(r.o.src, 'auth'); assert.deepEqual(r.o.notes.map(n => n.k), ['fs']); assert.match(r.o.notes[0].t, /HTTP 503/);
  assert.equal(r.o.ov.users, 124); assert.equal(r.o.ov.cards, 0); assert.equal(r.o.ov.fs, false);
  A.fs.down = 0; A.fs.deny = 1; A.it.deny = 1; await sleep(800);
  r = await api('/refresh', ADM(), { method: 'POST' }); assert.equal(r.s, 200);
  assert.equal(r.o.src, 'none'); assert.deepEqual(r.o.notes.map(n => n.k), ['auth', 'fs']); assert.match(r.o.notes[1].t, /HTTP 403/); assert.equal(r.o.users.total, 0);
  A.fs.deny = 0; A.it.deny = 0;
  ok('Firestore en panne : comptes Firebase sans statistiques, avis ; tout refusé : aucun compte, deux avis ; jamais d\'erreur 500');
}
P.kill();

/* ── 6) Relevé régulier des comptes actifs (ADMIN_ACTIVE_EVERY_MS) : liste des comptes Firebase seulement, sans demande ni lecture Firestore ─────── */
{
  const dir = join(mkdtempSync(join(tmpdir(), 'deckdeal-admtick-')), 'admin'), day = k => new Date(Date.parse(today() + 'T12:00:00Z') - k * 86400e3).toISOString().slice(0, 10);
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'actifs.json'), JSON.stringify({ v: 1, days: { [day(3)]: { a: 7, at: 1 }, [day(1)]: { a: 0, at: 1 } } }));      // relevés plus anciens
  const q0 = A.fs.queries.length + A.fs.lists.length, c0 = A.it.calls.length;
  const Tb = tag('uid-bob-02'); A.fs.docs.set(`pubdecks/${Tb}_3`, { o: Tb, by: 'Bob', name: 'Gobelins', cmd: ['Krenko, Mob Boss'], ci: 'R', cards: ['99 Forest'], v: 1, updatedAt: NOW });      // deck public servi (Communauté allumée ici)
  const P2 = await start({ ...ENV, ADMIN_DIR: dir, ADMIN_ACTIVE_EVERY_MS: '1000', PUBDECKS: '1', SCRYFALL_UPSTREAM: 'http://127.0.0.1:9' }, 19403); BASE = 'http://127.0.0.1:19403';
  const read = () => JSON.parse(readFileSync(join(dir, 'actifs.json'), 'utf8')).days;
  for (let t = 0; t < 60 && !read()[today()]; t++) await sleep(100);
  const f = read();
  assert.ok(f[today()] && f[today()].a >= 3, 'relevé du jour sans aucune demande'); assert.equal(f[day(3)].a, 7, 'historique gardé');
  assert.ok(f[day(1)].a >= 3, 'veille déjà relevée : complétée (le plus haut relevé)'); assert.equal(f[day(2)], undefined, 'jour jamais relevé : pas deviné le lendemain');
  assert.ok(A.it.calls.length > c0); assert.equal(A.fs.queries.length + A.fs.lists.length, q0, 'aucune lecture Firestore');
  const r = await api('', ADM()), dd = new Map(r.o.active.days);
  assert.equal(r.o.active.since, day(3)); assert.equal(dd.get(day(3)), 7); assert.equal(dd.get(day(2)), null); assert.equal(dd.get(today()), read()[today()].a); assert.ok(dd.get(today()) >= f[today()].a, 'calcul complet : le plus haut relevé'); assert.equal(r.o.active.every, 1000);
  // deck public retiré : enlevé tout de suite de la liste servie à tous (/api/pubdecks), sans relecture de Firestore
  const pub = async () => (await (await fetch(BASE + '/api/pubdecks')).json()).decks.map(d => d.id);
  assert.deepEqual(await pub(), [Tb + '_3'], 'liste servie (noms non contrôlés : catalogue Scryfall injoignable ici)');
  const bid = (await api('?q=boble', ADM())).o.users.rows[0].id, k = (await api('/pubdecks?id=' + bid, ADM())).o.rows[0].k, l0 = A.fs.lists.length;
  const x = await fetch(BASE + '/api/admin/pubdel', { method: 'POST', headers: { 'x-firebase-token': ADM(), 'Content-Type': 'application/json' }, body: JSON.stringify({ k }) });
  assert.equal(x.status, 200); assert.deepEqual(await pub(), [], 'retiré de la liste servie'); assert.equal(A.fs.lists.length, l0, 'sans relecture');
  P2.kill();
  ok('deck public retiré depuis le panneau : enlevé aussitôt de /api/pubdecks, sans relecture');
  ok('relevé régulier des comptes actifs : Identity Toolkit seulement (aucune lecture Firestore), historique gardé, veille complétée seulement si déjà relevée ; courbe : jours sans relevé vides');
}
console.log('\nADMIN OK');
process.exit(0);
