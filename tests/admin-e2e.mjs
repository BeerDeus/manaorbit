// E2E panneau d'administration (/admin) : vrai proxy.mjs branché sur les faux Firebase (jetons, OAuth2), Identity Toolkit et Firestore (admin-fakes.mjs),
// faux SDK Firebase servi à l'adresse du vrai (la CSP stricte de la page s'applique). Déconnecté : « Se connecter avec Google », aucune donnée demandée ;
// autre compte : « Accès réservé » et rien d'autre ; éditeur : chiffres, graphiques (inscriptions, actifs par jour), liste des comptes (tri, recherche, pages,
// en-têtes cliquables sur ordinateur), export CSV, « Rafraîchir » ; actions confirmées (désactiver / réactiver, rôle IAM manquant, retirer un deck public),
// journal ; déjà connecté dans l'appli : tableau de bord d'emblée ; sombre ; Discord (/api/admin/discord simulé par des routes : section cachée sur 404,
// bot non configuré, salons groupés, pings, publier, envoi confirmé, historique, suppression, erreur, 360 px) ; aucune erreur (CSP comprise).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { startFakes } from './amis-fakes.mjs';
import { startAdminFakes, routeAdminPage, ADMIN } from './admin-fakes.mjs';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = m => console.log('✓ ' + m);
const F = await startFakes(), A = await startAdminFakes(); A.seed(Date.now(), 120);
const PORT = 19410, URL0 = `http://127.0.0.1:${PORT}/admin`;
const proxy = spawn('node', ['proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', PORT: String(PORT), CARDTRADER_TOKEN: 'tok', ALERTS: '0', PUBDECKS: '0', BAD_KEY_DELAY_MS: '20', ...F.env, ...A.env, ADMIN_EMAILS: ADMIN, ADMIN_REFRESH_GAP_MS: '1500' }, stdio: 'ignore' });
process.on('exit', () => { try { proxy.kill(); } catch {} A.stop(); F.stop(); });
for (let t = 0; t < 60; t++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/__ping`)).ok) break; } catch { /* démarrage */ } await sleep(100); }

const ADM = { uid: 'uid-admin-00', email: ADMIN, tok: F.jwt('uid-admin-00', 3 * 3600, { email: ADMIN, email_verified: true }) };
const JEANNE = { uid: 'uid-jeanne-01', email: 'jeanne.dupont@gmail.com', tok: F.jwt('uid-jeanne-01', 3 * 3600, { email: 'jeanne.dupont@gmail.com', email_verified: true }) };
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const txt = (p, sel) => p.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());
const visible = (p, sel) => p.$eval(sel, e => !e.hidden && e.offsetParent !== null).catch(() => false);
/** Nouvelle page (téléphone par défaut) ; user : compte déjà connecté (même origine que l'appli). Erreurs de la page et de la console relevées (CSP comprise). */
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || opts.phone || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !opts.vp, hasTouch: !opts.vp, serviceWorkers: 'block', colorScheme: opts.dark ? 'dark' : 'light' });
  await routeAdminPage(ctx); if (opts.before) await opts.before(ctx);
  const p = await ctx.newPage(), errs = [], api = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('request', r => { if (r.url().includes('/api/admin')) api.push(r.method() + ' ' + new URL(r.url()).pathname + new URL(r.url()).search); });
  if (opts.user) await p.addInitScript(u => { window.__fbUser = u; }, opts.user);
  await p.goto(URL0);
  return { ctx, p, errs, api };
}
const dash = p => p.waitForSelector('#vMain:not([hidden]) #ulist tr[data-id]', { timeout: 10000 });
const settle = p => p.waitForFunction(() => !document.querySelector('#ulist.busy'), null, { timeout: 8000 }).then(() => p.waitForTimeout(80));

/* ── Déconnecté, puis autre compte : rien ───────────────────────────────────────────────────────────────────────────────────── */
{
  const { ctx, p, errs, api } = await open();
  await p.waitForSelector('#vOut:not([hidden])');
  assert.equal(await txt(p, '#btnIn'), 'Se connecter avec Google'); assert.equal(await visible(p, '#vMain'), false); assert.equal(await visible(p, '#acts'), false);
  assert.deepEqual(api, [], 'déconnecté : aucune demande au serveur');
  assert.deepEqual(await p.evaluate(() => window.__fbCfg && window.__fbCfg.projectId), 'm2s-mtg', 'configuration Firebase de l\'appli');
  await p.click('#btnIn'); await p.waitForTimeout(150);
  assert.equal(await visible(p, '#vOut'), true, 'fenêtre fermée : rien ne change'); assert.equal(await visible(p, '#inErr'), false);
  ok('déconnecté : « Se connecter avec Google », aucune demande au serveur ; fenêtre Google fermée : rien ne change');

  await p.evaluate(u => { window.__nextUser = u; }, JEANNE);
  await p.click('#btnIn'); await p.waitForSelector('#vDeny:not([hidden])');
  assert.equal(await txt(p, '#vDeny h1'), 'Accès réservé');
  assert.equal(await visible(p, '#vMain'), false); assert.equal(await p.$('#ulist tr'), null); assert.equal(await txt(p, '#kpis').catch(() => ''), '');
  assert.equal(await p.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' ').trim()), 'Accès réservé Changer de compte', 'rien d\'autre');
  assert.deepEqual(api, ['GET /api/admin?page=1&sort=created&dir=desc']);
  ok('autre compte : « Accès réservé » (403) et rien d\'autre');

  // changer de compte → l'éditeur
  await p.evaluate(u => { window.__nextUser = u; }, ADM);
  await p.click('#btnSwitch'); await dash(p);
  assert.equal(await p.$$eval('#kpis .kpi', e => e.length), 9, '8 chiffres + scans signalés');
  assert.match(await txt(p, '#kpis [data-k="scans"]'), /Scans signalés 0 0 en 7 jours/i);
  await p.waitForSelector('#scans:not([hidden]) .empty'); assert.match(await txt(p, '#scans'), /Scans signalés .*Aucun scan signalé pour l'instant/);      // fiches, photo et suppression : scanreport-e2e.mjs
  assert.match(await txt(p, '#kpis [data-k="users"]'), /Comptes 124 123 avec des données Mana Orbit/i);
  assert.match(await txt(p, '#kpis [data-k="decks"]'), /Decks 183 2 publiés · 1 signalement/i);
  assert.match(await txt(p, '#kpis [data-k="value"]'), /123 €/);
  assert.equal(await p.$$eval('#chart svg .bar', e => e.length), 30); assert.ok(await p.$$eval('#chart svg .fill', e => e.length) >= 5);
  assert.match(await p.$eval('#chart svg .bar:last-of-type title', e => e.textContent), /\d+ inscriptions?$/);
  assert.equal(await p.$$eval('#achart svg .pt', e => e.length), 30); assert.equal(await p.$$eval('#achart svg .dot', e => e.length), 1, 'actifs : un seul jour relevé (aujourd\'hui)');
  assert.match(await p.$eval('#achart svg .pt:last-of-type title', e => e.textContent), /: \d+ comptes? actifs?$/); assert.match(await p.$eval('#achart svg .pt:first-of-type title', e => e.textContent), /pas de relevé$/);
  assert.match(await txt(p, '#achart'), /Actifs par jour \d+ aujourd'hui/); assert.match(await txt(p, '#achart'), /chaque heure/);
  assert.match(await txt(p, '#pubrep'), /Decks publics signalés 1 deck .*Atraxa, Praetors' Voice par Jeanne · Jeanne D\. \(je•••@gmail\.com\).*1 signalement Retirer/);
  assert.match(await txt(p, '#journal'), /Aucune action pour l'instant/);
  assert.equal(await p.$$eval('#ulist tr[data-id]', e => e.length), 50); assert.equal(await txt(p, '#pager .pg'), 'Page 1 / 3'); assert.equal(await txt(p, '#uCount'), '(124)');
  assert.match(await txt(p, '#meta'), /source : Firebase Authentication \+ Firestore/);
  assert.match(await txt(p, '#mix'), /Google 123 · E-mail 1/); assert.match(await txt(p, '#srv'), /Serveur/); assert.match(await txt(p, '#srv'), /Échanges en direct/);
  assert.equal(await visible(p, '#acts'), true);
  const body = await p.evaluate(() => document.body.innerText);
  assert.ok(!/jeanne\.dupont@|Dupont|uid-/.test(body), 'page : ni e-mail complet, ni nom complet, ni UID');
  ok('changer de compte → éditeur : 9 chiffres (dont les scans signalés), inscriptions et actifs sur 30 jours (SVG, survol), 50 comptes, page 1 / 3, comptes, decks signalés, journal, serveur ; rien d\'identifiant');

  // recherche, tri, pages
  await p.fill('#q', 'jeanne'); await p.waitForFunction(() => document.querySelectorAll('#ulist tr[data-id]').length === 1, null, { timeout: 5000 });
  const row = await p.$eval('#ulist tr[data-id]', tr => ({ who: tr.querySelector('.who').textContent, ...Object.fromEntries([...tr.querySelectorAll('td[data-l]')].map(td => [td.dataset.l, td.textContent.replace(/\s+/g, ' ').trim()])) }));
  assert.equal(row.who, 'JJeanne D.je•••@gmail.comGoogleFRDésactiverDecks publics (2)');
  assert.deepEqual([row.Cartes, row.Decks, row.Publics, row['Échange'], row.Amis, row.Valeur, row.Connexion], ['26 ex.', '3', '2', 'Lien actif2 decks partagés · 3 cherchées', '11 reçue', '123 €', 'il y a 1 h']);
  assert.equal(await txt(p, '#pager'), '', 'une seule page : pas de pagination');
  await p.fill('#q', 'personne'); await p.waitForSelector('#ulist .empty'); assert.match(await txt(p, '#ulist'), /Aucun compte pour « personne »/);
  await p.fill('#q', ''); await p.waitForFunction(() => document.querySelectorAll('#ulist tr[data-id]').length === 50, null, { timeout: 5000 });
  await p.selectOption('#sort', 'decks'); await settle(p);
  await p.waitForFunction(() => document.querySelector('#ulist tr[data-id] td[data-l="Decks"] .v').textContent === '3', null, { timeout: 5000 });
  let v = await p.$$eval('#ulist td[data-l="Decks"] .v', e => e.map(x => Number(x.textContent)));
  assert.deepEqual(v, v.slice().sort((a, b) => b - a), 'decks décroissants');
  await p.click('#dir'); await p.waitForFunction(() => document.querySelector('#dir').textContent === '↑', null, { timeout: 5000 }); await settle(p);
  v = await p.$$eval('#ulist td[data-l="Decks"] .v', e => e.map(x => Number(x.textContent))); assert.deepEqual(v, v.slice().sort((a, b) => a - b), 'puis croissants'); assert.equal(v[0], 0);
  await p.click('#pager [data-page="2"]'); await p.waitForFunction(() => /Page 2 \/ 3/.test(document.querySelector('#pager').innerText), null, { timeout: 5000 });
  await p.click('#pager [data-page="3"]'); await p.waitForFunction(() => /Page 3 \/ 3/.test(document.querySelector('#pager').innerText), null, { timeout: 5000 });
  assert.equal(await p.$$eval('#ulist tr[data-id]', e => e.length), 24); assert.equal(await p.$eval('#pager [data-page="4"]', b => b.disabled), true);
  assert.ok(api.some(a => /sort=decks&dir=asc/.test(a) && /page=3/.test(a)));
  ok('recherche (nom réduit, ligne complète), « aucun compte », tri par decks dans les deux sens, pages 2 et 3 (24 comptes, « Suivante » grisée)');

  // CSV : la liste en cours (tri par decks croissant), mêmes champs réduits
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnCsv')]);
  assert.match(dl.suggestedFilename(), /^comptes-mana-orbit-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, ''), lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 125); assert.match(lines[0], /^Nom;E-mail \(masqué\);Connexion;/); assert.ok(!/jeanne\.dupont@|uid-|Dupont/.test(csv));
  const dk = lines.slice(1).map(l => Number(l.split(';')[11])); assert.deepEqual(dk, dk.slice().sort((a, b) => a - b), 'tri en cours (decks croissants)');
  assert.ok(api.some(a => /^GET \/api\/admin\/export\?.*sort=decks&dir=asc/.test(a))); await p.waitForSelector('.toast.on'); assert.match(await txt(p, '.toast'), /124 comptes exportés/);
  ok('CSV : téléchargé avec le tri en cours (124 comptes, champs réduits)');

  // Rafraîchir : trop tôt → message ; ensuite recalculé
  const done = () => p.waitForFunction(() => !document.querySelector('#btnRefresh').disabled, null, { timeout: 8000 });
  await p.waitForTimeout(1600); await p.click('#btnRefresh'); await done();      // recalcul (plus de 1,5 s après le précédent : ADMIN_REFRESH_GAP_MS)
  await p.click('#btnRefresh'); await p.waitForFunction(() => /moins d'une minute/.test((document.querySelector('.toast.on') || {}).textContent || ''), null, { timeout: 5000 });      // le message de l'export peut être encore affiché : on attend le nouveau
  assert.equal(await p.$$eval('#ulist tr[data-id]', e => e.length), 24, 'refusé : la liste reste affichée');
  await p.waitForTimeout(1600); const before = A.it.calls.length;
  await p.click('#btnRefresh'); await done();
  assert.ok(A.it.calls.length > before, 'recalculé'); assert.ok(api.some(a => a.startsWith('POST /api/admin/refresh')));
  ok('« Rafraîchir » : trop tôt → « Déjà rafraîchi il y a moins d\'une minute » ; ensuite recalcul');

  // se déconnecter : plus rien à l'écran
  await p.click('#btnOut'); await p.waitForSelector('#vOut:not([hidden])');
  assert.equal(await p.$('#ulist tr'), null); assert.equal(await txt(p, '#kpis').catch(() => ''), '');
  assert.deepEqual(errs, []); await ctx.close();
  ok('se déconnecter : retour à la connexion, plus aucune donnée dans la page ; aucune erreur (CSP comprise)');
}

/* ── Déjà connecté dans l'appli (même origine) : tableau de bord d'emblée ; ordinateur : tableau, en-têtes cliquables ; sombre ──────── */
{
  const { ctx, p, errs, api } = await open({ user: ADM, vp: { width: 1280, height: 900 }, dark: true });
  await dash(p);
  assert.equal(await p.evaluate(() => window.__popups || 0), 0, 'aucune fenêtre de connexion');
  assert.equal(await p.$eval('.ut thead', e => getComputedStyle(e).display), 'table-header-group', 'ordinateur : vrai tableau');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 15, 28)', 'thème sombre');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForSelector('.ut th[data-sort="cards"].on'); await settle(p);
  const v = await p.$$eval('#ulist td[data-l="Cartes"] .v', e => e.map(x => Number(x.textContent.replace(/\s/g, ''))));
  assert.deepEqual(v, v.slice().sort((a, b) => b - a)); assert.equal(await p.$eval('#sort', s => s.value), 'cards');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForFunction(() => document.querySelector('.ut th[data-sort="cards"]').getAttribute('aria-sort') === 'ascending', null, { timeout: 5000 });
  const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 1280, 'pas de défilement de côté (' + w + ')');
  ok('déjà connecté dans l\'appli : tableau de bord sans fenêtre de connexion ; ordinateur : tableau, tri par en-tête (deux sens) ; thème sombre');

  // Désactiver : fenêtre de confirmation (Annuler : rien ne part), puis effet ; réactiver refusé (rôle IAM manquant : message dans la fenêtre), puis accepté
  const posts = () => api.filter(a => a.startsWith('POST /api/admin/disable')).length;
  await p.fill('#q', 'jeanne'); await p.waitForFunction(() => document.querySelectorAll('#ulist tr[data-id]').length === 1, null, { timeout: 5000 });
  assert.equal(await p.$eval('#ulist .uacts', e => getComputedStyle(e).opacity), '0', 'ordinateur : actions au survol de la ligne');
  await p.hover('#ulist tr[data-id]'); await p.waitForFunction(() => getComputedStyle(document.querySelector('#ulist .uacts')).opacity === '1', null, { timeout: 3000 });
  await p.click('#ulist [data-act="off"]'); await p.waitForSelector('#dlg[open]');
  assert.match(await txt(p, '#dlg'), /^Désactiver Jeanne D\. \? Jeanne D\. · je•••@gmail\.com Le compte ne pourra plus se connecter/);
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Annuler', 'Annuler a le focus');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('#dlg').open); assert.equal(posts(), 0, 'Échap : rien envoyé');
  await p.click('#ulist [data-act="off"]'); await p.click('#dlg [data-v=""]'); assert.equal(posts(), 0, 'Annuler : rien envoyé');
  await p.click('#ulist [data-act="off"]'); await p.click('#dlg [data-v="ok"]');
  await p.waitForSelector('#ulist tr[data-id] .tag.bad'); assert.match(await txt(p, '#ulist tr[data-id] .who'), /désactivé.*Réactiver/);
  assert.match(await txt(p, '.toast'), /Compte désactivé/); assert.equal(A.it.updates.at(-1).disableUser, true);
  assert.match(await txt(p, '#journal'), /Compte désactivé Jeanne D\. · je•••@gmail\.com · .* · par ad•••@e•••\.org/);
  assert.match(await txt(p, '#mix'), /Comptes désactivés 2/);
  A.it.denyUpdate = 1;
  await p.click('#ulist [data-act="on"]'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg h2'), /^Réactiver Jeanne D\. \?$/); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => document.querySelector('#dlg').open && /Action impossible/.test(document.querySelector('#dlg').innerText), null, { timeout: 5000 });
  assert.match(await txt(p, '#dlg'), /Réactivation refusée au compte de service \(HTTP 403\)\. Rôle IAM à ajouter au compte de service : « Administrateur Firebase Authentication » \(roles\/firebaseauth\.admin\)/);
  await p.click('#dlg [data-v="ok"]'); A.it.denyUpdate = 0;
  assert.match(await txt(p, '#journal'), /^Journal des actions 2 dernières .*Réactivation refusée .*HTTP 403 Compte désactivé/);
  await p.click('#ulist [data-act="on"]'); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => !document.querySelector('#ulist tr[data-id] .tag.bad'), null, { timeout: 5000 }); assert.equal(A.it.updates.at(-1).disableUser, false);
  ok('désactiver : fenêtre qui dit quel compte (Échap, Annuler : rien envoyé), puis désactivé (étiquette, chiffres, journal) ; rôle IAM manquant : message clair dans la fenêtre ; réactivé');

  // Decks publics du compte (fenêtre), retrait en deux appuis ; la liste des signalés se vide, la ligne et le journal suivent
  const T0 = (await import('./admin-fakes.mjs')).tag('uid-jeanne-01');
  await p.click('#ulist [data-act="pub"]'); await p.waitForSelector('#dlg[open] .pdr');
  assert.match(await txt(p, '#dlg'), /^Decks publics de Jeanne D\. je•••@gmail\.com .*Atraxa, Praetors' Voice par Jeanne · emplacement 1 · publié le .*1 signalement Retirer Krenko, Mob Boss par Jeanne · emplacement 2/);
  const del = '#dlg .pdr:first-child .sdel';
  await p.click(del); assert.equal(await txt(p, del), 'Confirmer le retrait'); assert.ok(A.fs.docs.has(`pubdecks/${T0}_0`), 'un appui : rien');
  await p.click(del); await p.waitForFunction(() => document.querySelectorAll('#dlg .pdr').length === 1, null, { timeout: 5000 });
  assert.ok(!A.fs.docs.has(`pubdecks/${T0}_0`)); assert.match(await txt(p, '.toast'), /Deck retiré de la Communauté/);
  await p.click('#dlg [data-v=""]'); await p.waitForFunction(() => /Aucun deck signalé/.test(document.querySelector('#pubrep').innerText), null, { timeout: 5000 });
  await p.waitForFunction(() => /Decks publics \(1\)/.test(document.querySelector('#ulist .uacts').innerText), null, { timeout: 5000 });
  assert.match(await txt(p, '#journal'), /^Journal des actions 4 dernières .*Deck public retiré Jeanne D\. · je•••@gmail\.com · Atraxa, Praetors' Voice · par Jeanne/);
  assert.match(await txt(p, '#kpis [data-k="decks"]'), /1 publié/);
  const shot = process.env.ADMIN_SHOT; if (shot) await p.screenshot({ path: shot, fullPage: true });
  assert.deepEqual(errs, []); await ctx.close();
  ok('decks publics : fenêtre des decks du compte, « Retirer » puis « Confirmer le retrait » (un appui : rien), deck effacé, signalés vidés, ligne, chiffres et journal à jour ; aucune erreur');
}
{
  // téléphone : aucune largeur qui déborde
  const { ctx, p, errs } = await open({ user: ADM });
  await dash(p);
  const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 390, 'téléphone : pas de défilement de côté (' + w + ')');
  assert.deepEqual(errs, []); await ctx.close();
  ok('téléphone (390 px) : fiches, pas de défilement de côté');
}
/* ── Discord : /api/admin/discord* simulé par des routes (le contrat : salons, rôles, historique ; send, delete) ─────────────────────────── */
const DC_CH = [
  { id: '100', name: 'hors-catégorie', type: 0, cat: null },
  { id: '101', name: 'bienvenue', type: 0, cat: 'Bienvenue' }, { id: '102', name: 'règles', type: 0, cat: 'Bienvenue' }, { id: '103', name: 'annonces', type: 5, cat: 'Bienvenue' },
  { id: '104', name: 'général', type: 0, cat: 'Communauté' }, { id: '105', name: '🃏・decks', type: 0, cat: 'Communauté' },
  { id: '106', name: 'changelog', type: 5, cat: 'Équipe' },
];
const DC_ROLES = [{ id: '201', name: 'Équipe', color: 0x9fb4ff }, { id: '202', name: 'Testeur', color: 0xf0b45a }, { id: '203', name: 'Annonces', color: 0 }, { id: '204', name: 'Événements', color: 0 }, { id: '205', name: 'Changelog', color: 0 }, { id: '206', name: 'Carte mystère', color: 0x7be8c8 }];
const DC = { mode: 'on', delay: 0, fail: null, posts: [], n: 0, sent: [] };
const dcOld = () => [{ t: Date.now() - 3 * 3600e3, ch: '104', chn: 'général', id: '800', url: 'https://discord.com/channels/9/104/800', text: 'Ancien message', ping: [] }];
async function routeDiscord(ctx) {
  await ctx.route('**/api/admin/discord**', async r => {
    const q = r.request(), u = new URL(q.url()), j = (status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (DC.mode === '404') return j(404, { error: 'not_found' });
    if (u.pathname === '/api/admin/discord' && q.method() === 'GET') {
      return j(200, DC.mode === 'off' ? { on: false, guild: null, channels: [], roles: [], sent: [], message: 'Bot Discord non configuré (DISCORD_BOT_TOKEN absent).' }
        : { on: true, guild: { id: '9', name: 'Mana Orbit' }, channels: DC_CH, roles: DC_ROLES, sent: DC.sent });
    }
    const b = JSON.parse(q.postData() || '{}');
    DC.posts.push({ path: u.pathname, body: b, tok: q.headers()['x-firebase-token'] || '', type: q.headers()['content-type'] });
    if (DC.delay) await sleep(DC.delay);
    if (DC.fail) return j(DC.fail[0], DC.fail[1]);
    if (u.pathname === '/api/admin/discord/send') {
      const c = DC_CH.find(x => x.id === b.channel), id = String(900 + ++DC.n), url = `https://discord.com/channels/9/${c.id}/${id}`;
      DC.sent.unshift({ t: Date.now(), ch: c.id, chn: c.name, id, url, text: b.content.slice(0, 140), ping: [...b.roles.map(x => DC_ROLES.find(y => y.id === x).name), ...(b.everyone ? ['everyone'] : [])] });
      return j(200, { ok: true, msg: { id, url }, sent: DC.sent });
    }
    if (u.pathname === '/api/admin/discord/delete') { DC.sent = DC.sent.filter(x => x.id !== b.id); return j(200, { ok: true, sent: DC.sent }); }
    return j(404, { error: 'not_found' });
  });
}
const toastIs = (p, re) => p.waitForFunction(r => new RegExp(r).test((document.querySelector('.toast.on') || {}).textContent || ''), re.source, { timeout: 5000 });
const dcAsked = (api) => (async () => { for (let i = 0; i < 100 && !api.some(a => a === 'GET /api/admin/discord'); i++) await sleep(50); })();
{
  // route absente (ou DISCORD=0) : section cachée ; sombre
  DC.mode = '404';
  const { ctx, p, errs, api } = await open({ user: ADM, before: routeDiscord, dark: true });
  await dash(p); await dcAsked(api); await p.waitForTimeout(200);
  assert.ok(api.includes('GET /api/admin/discord')); assert.equal(await p.$eval('#discord', e => e.hidden), true, '404 : section cachée'); assert.equal(await p.$('#discord *'), null);
  assert.deepEqual(errs, []); await ctx.close();
  ok('Discord : 404 → section cachée');
}
{
  // bot non configuré (on: false) : le message du serveur et rien d'autre
  DC.mode = 'off';
  const { ctx, p, errs } = await open({ user: ADM, before: routeDiscord });
  await dash(p); await p.waitForSelector('#discord:not([hidden]) .note');
  assert.equal(await txt(p, '#discord'), 'Discord Bot Discord non configuré (DISCORD_BOT_TOKEN absent).');
  assert.equal(await p.$$eval('#discord select, #discord textarea, #discord button, #discord input', e => e.length), 0, 'rien d\'autre');
  assert.deepEqual(errs, []); await ctx.close();
  ok('Discord : on false → le message du serveur seulement');
}
{
  DC.mode = 'on'; DC.sent = dcOld();
  const { ctx, p, errs, api } = await open({ user: ADM, before: routeDiscord, phone: { width: 360, height: 740 } });
  await dash(p); await p.waitForSelector('#discord:not([hidden]) #dcCh');
  const groups = await p.$$eval('#dcCh optgroup', g => g.map(x => [x.label, ...[...x.children].map(o => o.value + ' ' + o.textContent)]));
  assert.deepEqual(groups, [['Sans catégorie', '100 # hors-catégorie'], ['Bienvenue', '101 # bienvenue', '102 # règles', '103 📢 annonces'], ['Communauté', '104 # général', '105 # 🃏・decks'], ['Équipe', '106 📢 changelog']]);
  assert.match(await txt(p, '#discord .chead'), /^Discord Mana Orbit$/);
  assert.equal(await p.$eval('#dcCh', e => e.value), '103', 'rien de gardé : le premier salon « annonces »');
  assert.equal(await visible(p, '#dcPubL'), true); assert.equal(await p.$eval('#dcPub', e => e.checked), true, 'publier : coché d\'office');
  await p.selectOption('#dcCh', '104'); assert.equal(await visible(p, '#dcPubL'), false, 'salon écrit : pas de « Publier »');
  await p.selectOption('#dcCh', '106'); assert.equal(await visible(p, '#dcPubL'), true, 'autre salon d\'annonces : « Publier »');
  await p.reload(); await dash(p); await p.waitForSelector('#dcCh');
  assert.equal(await p.$eval('#dcCh', e => e.value), '106', 'dernier salon choisi gardé sur l\'appareil');
  await p.selectOption('#dcCh', '103');
  ok('Discord : salons groupés par catégorie (<optgroup>, 📢 pour les annonces), #annonces d\'office puis le dernier choisi, « Publier » seulement pour un salon d\'annonces');

  // historique d'avant ; texte, aperçu (gras, sauts de ligne, rien d'interprété), compteur
  assert.equal(await p.$$eval('#dcSent .dcr', e => e.length), 1); assert.match(await txt(p, '#dcSent .dcr'), /^Ancien message .* · général Ouvrir Supprimer$/);
  assert.equal(await p.$eval('#dcSend', b => b.disabled), true, 'texte vide : Envoyer grisé');
  const content = 'Nouvelle version **1.0.11** !\nScan plus rapide <img src=x onerror="window.__xss=1"> <b>pas gras</b>';
  await p.fill('#dcTxt', content);
  assert.deepEqual(await p.$$eval('#dcPrev b', e => e.map(x => x.textContent)), ['1.0.11']); assert.equal(await p.$$eval('#dcPrev br', e => e.length), 1);
  assert.equal(await p.$$eval('#dcPrev img', e => e.length), 0, 'aperçu : aucune balise du texte interprétée');
  assert.match(await txt(p, '#dcPrev'), /<img src=x onerror="window\.__xss=1"> <b>pas gras<\/b>$/);
  assert.equal(await txt(p, '#dcCount'), content.length + ' / 2 000'); assert.equal(await p.$eval('#dcSend', b => b.disabled), false);

  // pings : 5 rôles au plus, @everyone avec avertissement ; mentions dans le compteur et l'aperçu
  for (const id of ['201', '202', '203', '204', '205']) await p.check(`[data-role="${id}"]`);
  assert.equal(await p.$eval('[data-role="206"]', e => e.disabled), true, '5 rôles : le 6e grisé');
  for (const id of ['203', '204', '205']) await p.uncheck(`[data-role="${id}"]`);
  assert.equal(await p.$eval('[data-role="206"]', e => e.disabled), false);
  assert.equal(await visible(p, '#dcWarn'), false); await p.check('#dcEvery'); assert.equal(await visible(p, '#dcWarn'), true, '@everyone : avertissement');
  assert.match(await txt(p, '#dcWarn'), /tous les membres du serveur/);
  const withM = content.length + '<@&201> <@&202> @everyone\n'.length;
  assert.equal(await txt(p, '#dcCount'), withM + ' / 2 000 (mentions comprises)');
  assert.deepEqual(await p.$$eval('#dcPrev .dcm', e => e.map(x => x.textContent)), ['@Équipe', '@Testeur', '@everyone']);
  ok('Discord : aperçu (gras, saut de ligne, balises laissées en texte), compteur sur 2 000 mentions comprises, 5 rôles au plus, @everyone avec avertissement');

  // Envoyer : confirmation qui redit le salon et les pings (Annuler : rien), puis corps exact, boutons grisés pendant l'envoi, texte vidé, historique
  await p.click('#dcSend'); await p.waitForSelector('#dlg[open]');
  assert.match(await txt(p, '#dlg'), /^Envoyer le message \? 📢 annonces · Bienvenue Pings : @Équipe, @Testeur, @everyone @everyone : tous les membres du serveur seront notifiés\. Publié aussi aux serveurs abonnés\. Nouvelle version \*\*1\.0\.11\*\* ! Scan plus rapide/);
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Annuler');
  await p.click('#dlg [data-v=""]'); await p.waitForTimeout(100); assert.equal(DC.posts.length, 0, 'Annuler : rien envoyé');
  DC.delay = 600;
  await p.click('#dcSend'); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => document.querySelector('#dcSend').disabled && document.querySelector('#dcSend').textContent === 'Envoi…', null, { timeout: 3000 });
  assert.equal(await p.$eval('#dcTxt', e => e.readOnly), true); assert.equal(await p.$eval('#dcCh', e => e.disabled), true);
  await toastIs(p, /Message envoyé dans annonces\./); DC.delay = 0;
  assert.equal(DC.posts.length, 1); assert.equal(DC.posts[0].path, '/api/admin/discord/send'); assert.ok(DC.posts[0].tok, 'avec le jeton'); assert.match(DC.posts[0].type, /application\/json/);
  assert.deepEqual(DC.posts[0].body, { channel: '103', content, roles: ['201', '202'], everyone: true, publish: true }, 'corps exact');
  assert.equal(await p.$eval('#dcTxt', e => e.value), '', 'texte vidé'); assert.equal(await p.$eval('#dcTxt', e => e.readOnly), false);
  assert.equal(await p.$$eval('#discord .dcp input:checked', e => e.length), 0, 'pings remis à zéro'); assert.equal(await visible(p, '#dcWarn'), false);
  assert.equal(await p.$eval('#dcCh', e => e.value), '103', 'même salon');
  assert.equal(await p.$$eval('#dcSent .dcr', e => e.length), 2);
  assert.match(await txt(p, '#dcSent .dcr:first-child'), /^Nouvelle version \*\*1\.0\.11\*\* ! Scan plus rapide .* · annonces · @Équipe @Testeur @everyone Ouvrir Supprimer$/);
  assert.deepEqual(await p.$eval('#dcSent .dcr:first-child a', a => [a.getAttribute('href'), a.target, a.rel]), ['https://discord.com/channels/9/103/901', '_blank', 'noopener noreferrer']);
  ok('Discord : Envoyer → confirmation (salon, pings, @everyone, publier ; Annuler : rien), corps exact, grisé pendant l\'envoi, toast, texte et pings vidés, historique en tête (Ouvrir : nouvel onglet, noopener)');

  // salon écrit : publish false ; salon d'annonces décoché : publish false ; trop long : grisé
  await p.selectOption('#dcCh', '104'); await p.fill('#dcTxt', 'Salut tout le monde');
  await p.click('#dcSend'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg'), /^Envoyer le message \? # général · Communauté Aucun ping\. Salut tout le monde Annuler Envoyer$/);
  await p.click('#dlg [data-v="ok"]'); await toastIs(p, /Message envoyé dans général\./);
  assert.deepEqual(DC.posts[1].body, { channel: '104', content: 'Salut tout le monde', roles: [], everyone: false, publish: false });
  await p.selectOption('#dcCh', '106'); await p.uncheck('#dcPub'); await p.fill('#dcTxt', 'Changelog 1.0.11'); await p.check('[data-role="206"]');
  await p.click('#dcSend'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg'), /Pings : @Carte mystère Pas publié aux serveurs abonnés\./);
  await p.click('#dlg [data-v="ok"]'); await toastIs(p, /Message envoyé dans changelog\./);
  assert.deepEqual(DC.posts[2].body, { channel: '106', content: 'Changelog 1.0.11', roles: ['206'], everyone: false, publish: false });
  assert.deepEqual(await p.$$eval('#dcSent .dcr', e => e.map(x => x.dataset.id)), ['903', '902', '901', '800'], 'le plus récent en haut');
  await p.fill('#dcTxt', 'x'.repeat(1995)); assert.equal(await p.$eval('#dcSend', b => b.disabled), false);
  await p.check('[data-role="201"]'); assert.equal(await txt(p, '#dcCount'), '2 003 / 2 000 (mentions comprises)');
  assert.equal(await p.$eval('#dcCount', e => e.classList.contains('over')), true); assert.equal(await p.$eval('#dcSend', b => b.disabled), true, 'trop long : grisé');
  await p.uncheck('[data-role="201"]');
  ok('Discord : salon écrit et annonce décochée → publish false ; historique du plus récent au plus ancien ; plus de 2 000 caractères mentions comprises : Envoyer grisé');

  // erreur du serveur (502 : Discord a refusé) : son message, texte gardé
  DC.fail = [502, { error: 'discord', message: 'Discord a refusé le message : Missing Permissions.' }];
  await p.fill('#dcTxt', 'Test erreur'); await p.click('#dcSend'); await p.click('#dlg [data-v="ok"]');
  await toastIs(p, /^Discord a refusé le message : Missing Permissions\.$/); DC.fail = null;
  assert.equal(await p.$eval('#dcTxt', e => e.value), 'Test erreur', 'texte gardé'); assert.equal(await p.$eval('#dcSend', b => b.disabled), false);
  assert.equal(await p.$$eval('#dcSent .dcr', e => e.length), 4);
  ok('Discord : 502 → message du serveur dans un toast, texte gardé, Envoyer rendu');

  // Supprimer : deux appuis → POST /delete { id }, historique à jour ; erreur : message, ligne gardée
  const n0 = DC.posts.length, del = '#dcSent .dcr[data-id="902"] .sdel';
  await p.click(del); assert.equal(await txt(p, del), 'Confirmer la suppression'); await p.waitForTimeout(100); assert.equal(DC.posts.length, n0, 'un appui : rien');
  await p.click(del); await toastIs(p, /Message supprimé de Discord\./);
  assert.deepEqual(DC.posts.at(-1), { path: '/api/admin/discord/delete', body: { id: '902' }, tok: DC.posts.at(-1).tok, type: DC.posts.at(-1).type });
  assert.deepEqual(await p.$$eval('#dcSent .dcr', e => e.map(x => x.dataset.id)), ['903', '901', '800']);
  DC.fail = [404, { error: 'not_found', message: 'Message introuvable sur Discord.' }];
  await p.click('#dcSent .dcr[data-id="800"] .sdel'); await p.click('#dcSent .dcr[data-id="800"] .sdel'); await toastIs(p, /Message introuvable sur Discord\./); DC.fail = null;
  assert.equal(await p.$$eval('#dcSent .dcr', e => e.length), 3); assert.equal(await txt(p, '#dcSent .dcr[data-id="800"] .sdel'), 'Supprimer');
  ok('Discord : Supprimer en deux appuis → POST /api/admin/discord/delete { id }, historique à jour ; refus : message du serveur, ligne gardée');

  // repeint du panneau (tri) : brouillon gardé ; 360 px : rien ne déborde
  await p.fill('#dcTxt', 'Brouillon'); await p.selectOption('#sort', 'cards'); await settle(p);
  assert.equal(await p.$eval('#dcTxt', e => e.value), 'Brouillon', 'brouillon gardé quand le panneau se repeint');
  const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 360, '360 px : pas de défilement de côté (' + w + ')');
  const out = await p.$$eval('#discord *', e => e.filter(x => x.getClientRects().length && x.getBoundingClientRect().right > 360.5).map(x => x.tagName + '.' + x.className));
  assert.deepEqual(out, [], 'rien hors de l\'écran');
  const shot = process.env.ADMIN_DC_SHOT; if (shot) await p.locator('#discord').screenshot({ path: shot });
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.deepEqual(errs, []); await ctx.close();
  ok('Discord : brouillon gardé au repeint ; 360 px sans défilement de côté ; aucune erreur (CSP comprise)');
}
await browser.close();
console.log('\nADMIN E2E OK');
process.exit(0);
