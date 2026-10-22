// E2E panneau d'administration (/admin) : vrai proxy.mjs branché sur les faux Firebase (jetons, OAuth2), Identity Toolkit et Firestore (admin-fakes.mjs),
// faux SDK Firebase servi à l'adresse du vrai (la CSP stricte de la page s'applique). Déconnecté : « Se connecter avec Google », aucune donnée demandée ;
// autre compte : « Accès réservé » et rien d'autre ; éditeur : chiffres, graphiques (inscriptions, actifs par jour), liste des comptes (tri, recherche, pages,
// en-têtes cliquables sur ordinateur), export CSV, « Rafraîchir » ; actions confirmées (désactiver / réactiver, rôle IAM manquant, retirer un deck public),
// journal ; déjà connecté dans l'appli : tableau de bord d'emblée ; sombre ; aucune erreur (CSP comprise).
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
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !opts.vp, hasTouch: !opts.vp, serviceWorkers: 'block', colorScheme: opts.dark ? 'dark' : 'light' });
  await routeAdminPage(ctx);
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
  await p.click('#btnRefresh'); await p.waitForSelector('.toast.on'); assert.match(await txt(p, '.toast'), /moins d'une minute/);
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
await browser.close();
console.log('\nADMIN E2E OK');
process.exit(0);
