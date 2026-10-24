// E2E panneau d'administration (/admin) : vrai proxy.mjs branché sur les faux Firebase (jetons, OAuth2), Identity Toolkit et Firestore (admin-fakes.mjs),
// faux SDK Firebase servi à l'adresse du vrai (la CSP stricte de la page s'applique). Déconnecté : « Se connecter avec Google », aucune donnée demandée ;
// autre compte : « Accès réservé » et rien d'autre ; éditeur : chiffres, graphiques (inscriptions, actifs par jour), liste des comptes (tri, recherche, pages,
// en-têtes cliquables sur ordinateur), export CSV, « Rafraîchir » ; actions confirmées (désactiver / réactiver, rôle IAM manquant, retirer un deck public),
// journal ; déjà connecté dans l'appli : tableau de bord d'emblée ; sombre. Onglets (clic, #adresse, retour, rechargement, lien direct, clavier, pastilles,
// onglets masqués quand une partie est coupée), Carte mystère (/api/admin/daily simulé : en-tête, bloc repliable gardé au rechargement, actions), Événements
// (/api/admin/events et …/switch simulés : cartes, tuiles, trouvées par jour, répartition, top 20, interrupteur confirmé, refus 403, EVENT=0, EVENT_FORCE,
// onglet masqué sur 404 ou 405, journal, 360 px sombre), Discord
// (/api/admin/discord simulé par des routes : onglet caché sur 404, bot non configuré, salons groupés, raccourcis, modèles, pings, publier, envoi confirmé,
// historique, suppression, erreur, 360 px), Fils des forums (/api/admin/discord/threads… simulés : filtres, fil, étiquettes, fermer, verrouiller, renommer,
// répondre, supprimer, téléphone), QR codes fixes (vrai serveur : cartes, scans, destination confirmée, création, renommer, Tester, SVG, PNG ≥ 2 048 px,
// aucune suppression), ni « null » ni « undefined » à l'écran, 360 px clair et sombre sans défilement de côté ; aucune erreur (CSP comprise).
// Captures de chaque onglet (1280 et 390 px, clair et sombre) : ADMIN_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
const visible = (p, sel) => p.$eval(sel, e => !e.hidden && e.offsetParent !== null && e.checkVisibility()).catch(() => false);      // checkVisibility : aussi le contenu d'un <details> fermé
/** Nouvelle page (téléphone par défaut) ; user : compte déjà connecté (même origine que l'appli). Erreurs de la page et de la console relevées (CSP comprise). */
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || opts.phone || { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 2, isMobile: !opts.vp, hasTouch: !opts.vp, serviceWorkers: 'block', colorScheme: opts.dark ? 'dark' : 'light' });
  await routeAdminPage(ctx); if (opts.before) for (const f of [].concat(opts.before)) await f(ctx);
  const p = await ctx.newPage(), errs = [], api = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('request', r => { if (r.url().includes('/api/admin')) api.push(r.method() + ' ' + new URL(r.url()).pathname + new URL(r.url()).search); });
  if (opts.user) await p.addInitScript(u => { window.__fbUser = u; }, opts.user);
  await p.goto(URL0 + (opts.hash || ''));
  return { ctx, p, errs, api };
}
const dash = p => p.waitForSelector('#vMain:not([hidden]) #ulist tr[data-id]', { state: 'attached', timeout: 10000 });
const settle = p => p.waitForFunction(() => !document.querySelector('#ulist.busy'), null, { timeout: 8000 }).then(() => p.waitForTimeout(80));
/** Onglet par un clic (comme l'éditeur) ; attend sa partie affichée. */
async function tab(p, k) {
  await p.click('#t-' + k);
  await p.waitForFunction(k => !document.querySelector('#p-' + k).hidden && document.querySelector('#t-' + k).getAttribute('aria-selected') === 'true', k, { timeout: 5000 });
}
const curTab = p => p.evaluate(() => { const t = document.querySelector('#tabl [aria-selected="true"]'); return t ? t.dataset.tab : ''; });
const shownPanels = p => p.$$eval('.panel', e => e.filter(x => !x.hidden).map(x => x.id));
const tabsShown = p => p.$$eval('#tabl .tab', e => e.filter(x => !x.hidden).map(x => x.dataset.tab));
const badgeOf = (p, k) => p.$eval('#t-' + k + ' .badge', b => (b.hidden ? '' : b.firstChild ? b.firstChild.textContent : ''));
/** Rien de « null » / « undefined » / « NaN » écrit dans la page (onglet affiché). */
const noJunk = async (p, where) => { const t = await p.evaluate(() => document.body.innerText); assert.doesNotMatch(t, /\bnull\b|\bundefined\b|\bNaN\b|\[object /, where + ' : texte parasite'); };
/** Largeur : pas de défilement de côté, rien hors de l'écran. */
async function noOverflow(p, w, where) {
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= w, where + ' : pas de défilement de côté (' + sw + ')');
  const out = await p.$$eval('#vMain *, .top *', (e, w) => e.filter(x => x.getClientRects().length && x.getBoundingClientRect().right > w + 0.5 && !x.closest('.tabl')).map(x => x.tagName + '.' + x.className + ' ' + Math.round(x.getBoundingClientRect().right)), w);
  assert.deepEqual(out, [], where + ' : rien hors de l\'écran');
}
const TAB_ORDER = ['apercu', 'comptes', 'mystere', 'evenements', 'discord', 'fils', 'qr', 'signalements', 'journal', 'serveur'];

/* ── Déconnecté, puis autre compte : rien ───────────────────────────────────────────────────────────────────────────────────── */
{
  const { ctx, p, errs, api } = await open();
  await p.waitForSelector('#vOut:not([hidden])');
  assert.equal(await txt(p, '#btnIn'), 'Se connecter avec Google'); assert.equal(await visible(p, '#vMain'), false); assert.equal(await visible(p, '#acts'), false);
  assert.equal(await visible(p, '#tabs'), false, 'déconnecté : pas d\'onglets');
  assert.deepEqual(api, [], 'déconnecté : aucune demande au serveur');
  assert.deepEqual(await p.evaluate(() => window.__fbCfg && window.__fbCfg.projectId), 'm2s-mtg', 'configuration Firebase de l\'appli');
  await p.click('#btnIn'); await p.waitForTimeout(150);
  assert.equal(await visible(p, '#vOut'), true, 'fenêtre fermée : rien ne change'); assert.equal(await visible(p, '#inErr'), false);
  ok('déconnecté : « Se connecter avec Google », aucune demande au serveur, pas d\'onglets ; fenêtre Google fermée : rien ne change');

  await p.evaluate(u => { window.__nextUser = u; }, JEANNE);
  await p.click('#btnIn'); await p.waitForSelector('#vDeny:not([hidden])');
  assert.equal(await txt(p, '#vDeny h1'), 'Accès réservé');
  assert.equal(await visible(p, '#vMain'), false); assert.equal(await p.$('#ulist tr'), null); assert.equal(await txt(p, '#kpis').catch(() => ''), '');
  assert.equal(await p.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' ').trim()), 'Accès réservé Changer de compte', 'rien d\'autre');
  assert.equal(await visible(p, '#tabs'), false);
  assert.deepEqual(api, ['GET /api/admin?page=1&sort=created&dir=desc']);
  ok('autre compte : « Accès réservé » (403) et rien d\'autre');

  // changer de compte → l'éditeur (vue d'ensemble d'abord)
  await p.evaluate(u => { window.__nextUser = u; }, ADM);
  await p.click('#btnSwitch'); await dash(p);
  assert.equal(await curTab(p), 'apercu'); assert.deepEqual(await shownPanels(p), ['p-apercu']);
  assert.equal(await p.$$eval('#kpis .kpi', e => e.length), 9, '8 chiffres + scans signalés');
  assert.match(await txt(p, '#kpis [data-k="scans"]'), /Scans signalés 0 0 en 7 jours/i);
  assert.match(await txt(p, '#kpis [data-k="users"]'), /Comptes 124 123 avec des données Mana Orbit/i);
  assert.match(await txt(p, '#kpis [data-k="decks"]'), /Decks 183 2 publiés · 1 signalement/i);
  assert.match(await txt(p, '#kpis [data-k="value"]'), /123 €/);
  assert.equal(await p.$$eval('#chart svg .bar', e => e.length), 30); assert.ok(await p.$$eval('#chart svg .fill', e => e.length) >= 5);
  assert.match(await p.$eval('#chart svg .bar:last-of-type title', e => e.textContent), /\d+ inscriptions?$/);
  assert.equal(await p.$$eval('#achart svg .pt', e => e.length), 30); assert.equal(await p.$$eval('#achart svg .dot', e => e.length), 1, 'actifs : un seul jour relevé (aujourd\'hui)');
  assert.match(await p.$eval('#achart svg .pt:last-of-type title', e => e.textContent), /: \d+ comptes? actifs?$/); assert.match(await p.$eval('#achart svg .pt:first-of-type title', e => e.textContent), /pas de relevé$/);
  assert.match(await txt(p, '#achart'), /Actifs par jour \d+ aujourd'hui/); assert.match(await txt(p, '#achart'), /chaque heure/);
  assert.ok(await p.$eval('#chart svg', s => Number(s.getAttribute('width')) > 300), 'graphique à la largeur de sa carte');
  assert.match(await txt(p, '#mix'), /Google 123 · E-mail 1/);
  assert.equal(await p.$('#testers'), null, 'plus de section « Testeurs inscrits »'); assert.ok(!api.some(a => a.includes('/testeurs')), 'ni sa liste demandée');
  assert.match(await txt(p, '#meta'), /source : Firebase Authentication \+ Firestore/);
  assert.equal(await visible(p, '#acts'), true); assert.equal(await visible(p, '#tabs'), true);
  await tab(p, 'signalements');
  await p.waitForSelector('#scans:not([hidden]) .empty'); assert.match(await txt(p, '#scans'), /Scans signalés .*Aucun scan signalé pour l'instant/);      // fiches, photo et suppression : scanreport-e2e.mjs
  assert.match(await txt(p, '#pubrep'), /Decks publics signalés 1 deck .*Atraxa, Praetors' Voice par Jeanne · Jeanne D\. \(je•••@gmail\.com\).*1 signalement Retirer/);
  await tab(p, 'journal'); assert.match(await txt(p, '#journal'), /Aucune action pour l'instant/);
  await tab(p, 'serveur'); await p.waitForSelector('#health .hvd'); assert.match(await txt(p, '#srv'), /^Services/); assert.match(await txt(p, '#health'), /Échanges en direct ouverts 0 \/ 300/);
  await tab(p, 'comptes');
  assert.equal(await p.$$eval('#ulist tr[data-id]', e => e.length), 50); assert.equal(await txt(p, '#pager .pg'), 'Page 1 / 3'); assert.equal(await txt(p, '#uCount'), '(124)');
  const body = await p.evaluate(() => document.body.textContent);
  assert.ok(!/jeanne\.dupont@|Dupont|uid-/.test(body), 'page : ni e-mail complet, ni nom complet, ni UID');
  ok('changer de compte → éditeur, vue d\'ensemble : 9 chiffres (dont les scans signalés), inscriptions et actifs sur 30 jours (SVG, survol), comptes ; Signalements (scans, decks), Journal, Serveur, Utilisateurs (50 comptes, page 1 / 3) ; plus de « Testeurs » ; rien d\'identifiant');

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
  assert.equal(await curTab(p), 'comptes', 'repeint de la liste : on reste sur l\'onglet');
  ok('recherche (nom réduit, ligne complète), « aucun compte », tri par decks dans les deux sens, pages 2 et 3 (24 comptes, « Suivante » grisée), toujours sur l\'onglet Utilisateurs');

  // CSV : la liste en cours (tri par decks croissant), mêmes champs réduits
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnCsv')]);
  assert.match(dl.suggestedFilename(), /^comptes-mana-orbit-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''), lines = csv.trimEnd().split('\r\n');
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
  assert.equal(await p.$('#ulist tr'), null); assert.equal(await txt(p, '#kpis').catch(() => ''), ''); assert.equal(await visible(p, '#tabs'), false);
  assert.deepEqual(errs, []); await ctx.close();
  ok('se déconnecter : retour à la connexion, plus aucune donnée dans la page ni d\'onglets ; aucune erreur (CSP comprise)');
}

/* ── Déjà connecté dans l'appli (même origine) : tableau de bord d'emblée ; ordinateur : tableau, en-têtes cliquables ; sombre ──────── */
{
  const { ctx, p, errs, api } = await open({ user: ADM, vp: { width: 1280, height: 900 }, dark: true, hash: '#comptes' });
  await dash(p);
  assert.equal(await curTab(p), 'comptes', 'lien direct vers un onglet');
  assert.equal(await p.evaluate(() => window.__popups || 0), 0, 'aucune fenêtre de connexion');
  assert.equal(await p.$eval('.ut thead', e => getComputedStyle(e).display), 'table-header-group', 'ordinateur : vrai tableau');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 15, 28)', 'thème sombre');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForSelector('.ut th[data-sort="cards"].on'); await settle(p);
  const v = await p.$$eval('#ulist td[data-l="Cartes"] .v', e => e.map(x => Number(x.textContent.replace(/\s/g, ''))));
  assert.deepEqual(v, v.slice().sort((a, b) => b - a)); assert.equal(await p.$eval('#sort', s => s.value), 'cards');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForFunction(() => document.querySelector('.ut th[data-sort="cards"]').getAttribute('aria-sort') === 'ascending', null, { timeout: 5000 });
  const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 1280, 'pas de défilement de côté (' + w + ')');
  ok('déjà connecté dans l\'appli : tableau de bord sans fenêtre de connexion, lien direct #comptes ; ordinateur : tableau, tri par en-tête (deux sens) ; thème sombre');

  // Désactiver : fenêtre de confirmation (Annuler : rien ne part), puis effet ; réactiver refusé (rôle IAM manquant : message dans la fenêtre), puis accepté
  const posts = () => api.filter(a => a.startsWith('POST /api/admin/disable')).length;
  const seeTxt = async (k, sel) => { await tab(p, k); const t = await txt(p, sel); await tab(p, 'comptes'); return t; };
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
  assert.match(await seeTxt('journal', '#journal'), /Compte désactivé Jeanne D\. · je•••@gmail\.com · .* · par ad•••@e•••\.org/);
  assert.match(await seeTxt('apercu', '#mix'), /Comptes désactivés 2/);
  A.it.denyUpdate = 1;
  await p.click('#ulist [data-act="on"]'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg h2'), /^Réactiver Jeanne D\. \?$/); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => document.querySelector('#dlg').open && /Action impossible/.test(document.querySelector('#dlg').innerText), null, { timeout: 5000 });
  assert.match(await txt(p, '#dlg'), /Réactivation refusée au compte de service \(HTTP 403\)\. Rôle IAM à ajouter au compte de service : « Administrateur Firebase Authentication » \(roles\/firebaseauth\.admin\)/);
  await p.click('#dlg [data-v="ok"]'); A.it.denyUpdate = 0;
  assert.match(await seeTxt('journal', '#journal'), /^Journal des actions 2 dernières .*Réactivation refusée .*HTTP 403 Compte désactivé/);
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
  await p.click('#dlg [data-v=""]'); await p.waitForFunction(() => /Aucun deck signalé/.test(document.querySelector('#pubrep').textContent), null, { timeout: 5000 });
  await p.waitForFunction(() => /Decks publics \(1\)/.test(document.querySelector('#ulist .uacts').innerText), null, { timeout: 5000 });
  assert.match(await seeTxt('journal', '#journal'), /^Journal des actions 4 dernières .*Deck public retiré Jeanne D\. · je•••@gmail\.com · Atraxa, Praetors' Voice · par Jeanne/);
  assert.match(await seeTxt('apercu', '#kpis [data-k="decks"]'), /1 publié/);
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

/* ── Routes simulées : Discord (salons, rôles, historique ; send, delete), Fils des forums, Carte mystère, réponse de /api/admin modifiée ─────── */
const DC_CH = [
  { id: '100', name: 'hors-catégorie', type: 0, cat: null },
  { id: '101', name: 'bienvenue', type: 0, cat: 'Bienvenue' }, { id: '102', name: 'règles', type: 0, cat: 'Bienvenue' }, { id: '103', name: 'annonces', type: 5, cat: 'Bienvenue' },
  { id: '104', name: 'général', type: 0, cat: 'Communauté' }, { id: '105', name: '🃏・decks', type: 0, cat: 'Communauté' },
  { id: '106', name: 'changelog', type: 5, cat: 'Équipe' },
];
const DC_ROLES = [{ id: '201', name: 'Équipe', color: 0x9fb4ff }, { id: '202', name: 'Testeur', color: 0xf0b45a }, { id: '203', name: 'Annonces', color: 0 }, { id: '204', name: 'Événements', color: 0 }, { id: '205', name: 'Changelog', color: 0 }, { id: '206', name: 'Carte mystère', color: 0x7be8c8 }];
const DC = { mode: 'on', delay: 0, fail: null, posts: [], n: 0, sent: [] };
const dcOld = () => [{ t: Date.now() - 3 * 3600e3, ch: '104', chn: 'général', id: '800', url: 'https://discord.com/channels/9/104/800', text: 'Ancien message', ping: [] }];
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function routeDiscord(ctx) {
  await ctx.route(u => u.pathname === '/api/admin/discord' || /^\/api\/admin\/discord\/(send|delete)$/.test(u.pathname), async r => {
    const q = r.request(), u = new URL(q.url()), j = (status, body) => json(r, status, body);
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
// Fils des forums (contrat : scratchpad contract-threads.md) : 3 forums et leurs étiquettes ; fils ouverts et fermés ; un fil : ses messages
const TH_FORUMS = [
  { key: 'bugs', id: '300', name: '🐞・bugs', tags: [{ id: 'a1', name: 'Android', emoji: '🤖', moderated: false }, { id: 'a2', name: 'Confirmé', emoji: '✅', moderated: true }, { id: 'a3', name: 'Corrigé', emoji: '🛠️', moderated: true }, { id: 'a4', name: 'Prochaine version', emoji: 'pv', moderated: true }] },
  { key: 'idées', id: '301', name: '💡・idées', tags: [{ id: 'b1', name: 'Retenue', emoji: '👍', moderated: true }] },
  { key: 'aide', id: '302', name: '❓・aide', tags: [] },
];
const H = 3600e3;
const thSeed = () => [
  { id: '700', forum: 'bugs', name: 'Le scan plante sur Android', tags: ['a1'], created: Date.now() - 5 * H, last: Date.now() - 1 * H, count: 3, archived: false, locked: false, by: { name: 'Mana Orbit', bot: true }, first: 'Quand je scanne une carte en japonais, l\'appli se ferme.' },
  { id: '701', forum: 'bugs', name: 'Prix faux pour les foils', tags: ['a2'], created: Date.now() - 30 * H, last: Date.now() - 2 * H, count: 1, archived: false, locked: false, by: { name: 'Lucie', bot: false }, first: '' },
  { id: '702', forum: 'idées', name: 'Mode sombre plus contrasté', tags: [], created: Date.now() - 50 * H, last: Date.now() - 3 * H, count: 0, archived: false, locked: false, by: { name: 'Paul', bot: false }, first: '', firstHidden: true },
  ...[1, 2, 3].map(i => ({ id: '71' + i, forum: 'bugs', name: 'Ancien bug ' + i, tags: ['a3'], created: Date.now() - (100 + i * 10) * H, last: Date.now() - (90 + i * 10) * H, closed: Date.now() - (90 + i * 10) * H, count: 2, archived: true, locked: i === 1, by: { name: 'Mana Orbit', bot: true }, first: 'Réglé.' })),
].map(t => ({ ...t, url: 'https://discord.com/channels/9/' + t.id }));
const TH = { mode: 'on', fail: null, closeFail: false, posts: [], gets: [], list: thSeed(), msgs: {} };
const thMsgs = id => TH.msgs[id] || (TH.msgs[id] = id === '700' ? [
  { id: '700', by: { name: 'Mana Orbit', bot: true }, t: Date.now() - 5 * H, content: 'Quand je scanne une carte en japonais, l\'appli se ferme.\n\nAndroid 14 · APK 1.0.11', edited: false, attachments: [{ url: '/icons/icon.svg', name: 'capture-1.jpg', type: 'image/jpeg', w: 192, h: 192 }, { url: 'https://evil.example/x.png', name: 'piege.png', type: 'image/png' }] },
  { id: '7001', by: { name: 'Lucie', bot: false }, t: Date.now() - 2 * H, content: '', hidden: true, edited: false, attachments: [] },
  { id: '7002', by: { name: 'Paul', bot: false }, t: Date.now() - 1 * H, content: 'Pareil chez moi <img src=x onerror="window.__xss=1">', edited: true, attachments: [] },
] : [{ id, by: { name: 'Lucie', bot: false }, t: Date.now() - 3 * H, content: 'Premier message', edited: false, attachments: [] }]);
async function routeThreads(ctx) {
  await ctx.route(u => /^\/api\/admin\/discord\/(threads|thread|reply|thread-delete)$/.test(u.pathname), async r => {
    const q = r.request(), u = new URL(q.url()), j = (status, body) => json(r, status, body);
    if (TH.mode === '404') return j(404, { error: 'not_found' });
    if (q.method() === 'GET') TH.gets.push(u.pathname + u.search);
    if (u.pathname === '/api/admin/discord/threads') {
      if (TH.mode === 'off') return j(200, { on: false, message: 'Bot Discord non configuré (DISCORD_BOT_TOKEN absent).', forums: [], threads: [] });
      const f = u.searchParams.get('forum'), closed = u.searchParams.get('state') === 'closed', b0 = u.searchParams.get('before') || '', bef = b0.startsWith('cur-') ? Number(b0.slice(4)) : Infinity;
      if (f === 'aide') return j(200, { on: true, forums: TH_FORUMS, threads: [], message: 'Forum « aide » introuvable sur le serveur Discord.' });
      const all = TH.list.filter(t => (!f || t.forum === f) && t.archived === closed && t.last < bef).sort((a, b) => b.last - a.last), page = closed ? all.slice(0, 2) : all;
      return j(200, { on: true, forums: TH_FORUMS, threads: page, more: closed && all.length > 2, ...(closed && all.length > 2 ? { next: 'cur-' + page.at(-1).last } : {}) });      // next : chaîne opaque (comme Discord)
    }
    if (u.pathname === '/api/admin/discord/thread' && q.method() === 'GET') {
      const t = TH.list.find(x => x.id === u.searchParams.get('id')); if (!t) return j(404, { error: 'not_found', message: 'Fil introuvable.' });
      return j(200, { thread: t, messages: thMsgs(t.id), more: t.id === '700' });
    }
    const b = JSON.parse(q.postData() || '{}'); TH.posts.push({ path: u.pathname, body: b, tok: q.headers()['x-firebase-token'] || '', type: q.headers()['content-type'] });
    if (TH.fail) return j(TH.fail[0], TH.fail[1]);
    const t = TH.list.find(x => x.id === b.id); if (!t) return j(404, { error: 'not_found', message: 'Fil introuvable.' });
    if (u.pathname === '/api/admin/discord/thread') { for (const k of ['tags', 'archived', 'locked', 'name']) if (b[k] !== undefined) t[k] = b[k]; return j(200, { ok: true, thread: t }); }
    if (u.pathname === '/api/admin/discord/reply') {
      const id = String(7100 + TH.posts.length); thMsgs(t.id).push({ id, by: { name: 'Mana Orbit', bot: true }, t: Date.now(), content: b.content, edited: false, attachments: [] });
      t.count++; t.last = Date.now();
      if (b.close && TH.closeFail) return j(200, { ok: true, closed: false, message: 'Réponse envoyée, mais Discord a refusé de fermer le fil.', msg: { id, url: t.url + '/' + id }, thread: t });
      if (b.close) { t.archived = true; t.closed = Date.now(); }
      return j(200, { ok: true, msg: { id, url: t.url + '/' + id }, thread: t });
    }
    if (u.pathname === '/api/admin/discord/thread-delete') { TH.list = TH.list.filter(x => x.id !== b.id); return j(200, { ok: true }); }
    return j(404, { error: 'not_found' });
  });
}
// Carte mystère (/api/admin/daily ; DAILY=0 sur ce serveur de test : sans cette route, l'onglet est masqué)
const DY = { mode: 'on', prep: false, posts: [] };
const dySeed = () => ({
  rows: [{ id: 'p1', n: 'BobLeMage', s: 980, d: 3, last: '2026-10-22', lv: 4 }, { id: 'p2', n: 'Zoé', s: 400, d: 1, last: '2026-10-21' }, { id: 'p3', n: 'Masquée', s: 120, d: 1, last: '2026-10-20', x: 1 }],
  chk: [{ id: '2026-10-22:p4', day: '2026-10-22', n: 'Rapide', s: 1000, step: 1, ms: 12000, by: 'win', gap: 30, other: 0 }],
  sus: [{ id: 'p5', n: 'Chanceux', c: 5, of: 7, rate: 4.2 }],
  reports: [{ id: 'p6', n: 'VilainPseudo', k: 2, at: Date.now() - H, hid: false }, { id: 'p7', n: 'Grossier', k: 3, at: Date.now() - 2 * H, hid: true }],
});
let DYS = dySeed();
const dyView = () => ({ day: '2026-10-22', no: 8, st: DY.prep ? 'prep' : 'ready', next: '2026-10-23', plays: 1, done: 1, fb: [], card: DY.prep ? null : { en: 'Lightning Bolt', set: 'Magic 2010', fr: 'Foudre' },
  rows: DYS.rows, hidden: DYS.rows.filter(r => r.x).length, chk: DYS.chk, sus: DYS.sus, minAge: 0, prep: DY.prep ? { since: Date.now() - 60e3, err: null } : null, reports: DYS.reports, repHide: 3 });
async function routeDaily(ctx) {
  await ctx.route(u => /^\/api\/admin\/daily(\/|$)/.test(u.pathname), async r => {
    const q = r.request(), u = new URL(q.url()), j = (status, body) => json(r, status, body);
    if (DY.mode === '404') return j(404, { error: 'not_found' });
    if (q.method() === 'GET') return j(200, dyView());
    const b = JSON.parse(q.postData() || '{}'); DY.posts.push({ path: u.pathname, body: b });
    if (u.pathname === '/api/admin/daily/hide') { for (const r0 of DYS.rows) if (r0.id === b.id) r0.x = b.on ? 1 : undefined; DYS.reports = DYS.reports.filter(x => !(x.id === b.id && b.on === false)).map(x => (x.id === b.id ? { ...x, hid: !!b.on } : x)); }
    if (u.pathname === '/api/admin/daily/report') DYS.reports = DYS.reports.filter(x => x.id !== b.id);
    if (u.pathname === '/api/admin/daily/ok') { DYS.chk = DYS.chk.filter(x => x.id !== b.id); DYS.sus = DYS.sus.filter(x => x.id !== b.id); }
    return j(200, { ok: true, ...dyView() });
  });
}
// Événements (/api/admin/events, …/switch ; contrat du module event-srv.mjs) : Halloween en cours (jour 3 / 15), Noël à venir, anniversaire de Magic terminé
const EVT = { mode: 'on', fail: null, posts: [], gets: 0, log: null };
const EV_AT = (d, hh, mm) => Date.UTC(2026, 9, d, hh, mm);      // 27 octobre 2026 13:32 UTC = 14:32 à Paris (heure d'hiver depuis le 25)
const EV_TOP = () => ['BobLeMage', 'Zoé', '<img src=x onerror="window.__xss=1">', ...Array.from({ length: 19 }, (_, i) => 'Chasseur' + (i + 4))].slice(0, 20)
  .map((n, i) => ({ n, c: i < 3 ? 30 : Math.max(5, 29 - i), at: EV_AT(27 - (i % 3), 13 - (i % 5), 32) }));
const evSeed = () => ({
  on: true, force: '', day: '2026-10-27', cur: 'halloween-2026',
  list: [
    { id: 'halloween-2026', pack: 'halloween', name: 'Halloween', emoji: '🎃', obj: 'citrouilles', from: '2026-10-25', to: '2026-11-08', total: 30, per: 5, state: 'live', off: false },
    { id: 'noel-2026', pack: 'noel', name: 'Noël', emoji: '🎄', obj: 'boules de Noël', from: '2026-12-18', to: '2027-01-01', total: 30, per: 5, state: 'soon', off: false },
    { id: 'magic-2026', pack: 'magic', name: 'Anniversaire de Magic', emoji: '🎂', obj: 'cartes dorées', from: '2026-07-30', to: '2026-08-12', total: 30, per: 5, state: 'past', off: false },
  ],
  stats: {
    'halloween-2026': { hunters: 412, accounts: 380, devices: 32, full: 17, finds: 3120,
      days: [{ day: '2026-10-25', finds: 900, hunters: 230 }, { day: '2026-10-26', finds: 1250, hunters: 300 }, { day: '2026-10-27', finds: 970, hunters: 260 }],
      dist: [12, 13, 16, 18, 21, 24, 25, 39, 27, 27, 25, 24, 21, 18, 16, 13, 11, 8, 7, 5, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 17], top: EV_TOP() },
    'magic-2026': { hunters: 50, accounts: 45, devices: 5, full: 6, finds: 600,
      days: Array.from({ length: 14 }, (_, i) => ({ day: '2026-' + (i < 2 ? '07-' + (30 + i) : '08-' + String(i - 1).padStart(2, '0')), finds: 20 + (i * 7) % 40, hunters: 10 + (i * 3) % 15 })),
      dist: [2, 3, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 6], top: [{ n: 'Zoé', c: 30, at: Date.UTC(2026, 7, 9, 18, 5) }] },
  },
});
let EVS = evSeed();
async function routeEvents(ctx) {
  await ctx.route(u => /^\/api\/admin\/events(\/switch)?$/.test(u.pathname), async r => {
    const q = r.request(), u = new URL(q.url()), j = (status, body) => json(r, status, body);
    if (EVT.mode === '404') return j(404, { error: 'not_found' });
    if (EVT.mode === '405') return j(405, { error: 'method_not_allowed' });      // serveur sans le module : /api/admin/<inconnu>
    if (u.pathname === '/api/admin/events' && q.method() === 'GET') { EVT.gets++; return j(200, EVS); }
    const b = JSON.parse(q.postData() || '{}'); EVT.posts.push({ path: u.pathname, body: b, tok: q.headers()['x-firebase-token'] || '', type: q.headers()['content-type'] });
    if (EVT.fail) return j(EVT.fail[0], EVT.fail[1]);
    const e = EVS.list.find(x => x.id === b.id); if (!e) return j(404, { error: 'not_found', message: 'Événement inconnu.' });
    e.off = !b.on;
    return j(200, { ok: true, off: EVS.list.filter(x => x.off).map(x => x.id), ...(EVT.log ? { log: EVT.log } : {}) });      // log : facultatif (ne pas en dépendre)
  });
}
/** Réponse de /api/admin retouchée (ex. scans coupés sur le serveur : scans null). */
const routeAdminPatch = patch => async ctx => ctx.route(u => u.pathname === '/api/admin', async r => { const res = await r.fetch(); const b = await res.json(); return r.fulfill({ response: res, body: JSON.stringify(patch(b)) }); });
const ALL = [routeDiscord, routeThreads, routeDaily, routeEvents];
const toastIs = (p, re) => p.waitForFunction(r => new RegExp(r).test((document.querySelector('.toast.on') || {}).textContent || ''), re.source, { timeout: 5000 });
const asked = (api, path) => (async () => { for (let i = 0; i < 100 && !api.some(a => a.startsWith('GET ' + path)); i++) await sleep(50); })();

/* ── Onglets : clic, adresse, retour, rechargement, lien direct, clavier, pastilles, tuiles ─────────────────────────────────────────── */
{
  DC.mode = 'on'; DC.sent = dcOld(); TH.mode = 'on'; DY.mode = 'on';
  const { ctx, p, errs, api } = await open({ user: ADM, before: ALL, vp: { width: 1280, height: 900 } });
  await dash(p); await p.waitForSelector('#kpis [data-k="pseudos"]'); await p.waitForFunction(() => !document.querySelector('#t-fils .badge').hidden, null, { timeout: 5000 });
  assert.deepEqual(await tabsShown(p), TAB_ORDER, 'tous les onglets (Carte mystère, Discord et Fils servis)');
  assert.equal(await p.$eval('#tabl', e => e.getAttribute('role')), 'tablist');
  assert.deepEqual(await p.$$eval('#tabl .tab', e => e.map(x => [x.getAttribute('role'), x.getAttribute('aria-controls'), x.tabIndex])), TAB_ORDER.map(k => ['tab', 'p-' + k, k === 'apercu' ? 0 : -1]), 'role tab, aria-controls, un seul dans l\'ordre de tabulation');
  assert.equal(await p.evaluate(() => location.hash), '', 'adresse sans onglet : vue d\'ensemble');
  // pastilles : Signalements = 2 pseudos + 0 deck (retiré plus haut) + 0 scan ; Carte mystère = 1 à vérifier + 1 soupçon ; Fils = fils ouverts sans étiquette d'équipe (700, 702)
  assert.equal(await badgeOf(p, 'signalements'), '2'); assert.equal(await badgeOf(p, 'mystere'), '2'); assert.equal(await badgeOf(p, 'fils'), '2');
  await p.waitForSelector('#health .hvd', { state: 'attached' }); const nBad = await p.$$eval('#srv dd.bad, #health .hi[data-lv="bad"]', e => e.length); assert.equal(await badgeOf(p, 'serveur'), nBad ? String(nBad) : '', 'Serveur : une pastille par point en rouge');
  assert.match(await p.$eval('#t-signalements', e => e.textContent), /Signalements2 : 2 pseudos à traiter/, 'pastille lue par un lecteur d\'écran');
  assert.equal(await p.$$eval('#kpis .kpi', e => e.length), 10, '8 chiffres + scans + pseudos signalés');
  ok('onglets : tablist / tab, un seul tabulable ; pastilles Signalements (2), Carte mystère (2), Fils (2), Serveur (points en rouge)');

  await tab(p, 'journal'); assert.equal(await p.evaluate(() => location.hash), '#journal'); assert.deepEqual(await shownPanels(p), ['p-journal']);
  await tab(p, 'serveur'); assert.equal(await p.evaluate(() => location.hash), '#serveur');
  await p.goBack(); await p.waitForFunction(() => document.querySelector('#t-journal').getAttribute('aria-selected') === 'true'); assert.deepEqual(await shownPanels(p), ['p-journal'], 'retour : l\'onglet d\'avant');
  await p.goBack(); await p.waitForFunction(() => document.querySelector('#t-apercu').getAttribute('aria-selected') === 'true'); assert.deepEqual(await shownPanels(p), ['p-apercu']);
  await p.goForward(); await p.waitForFunction(() => document.querySelector('#t-journal').getAttribute('aria-selected') === 'true');
  await tab(p, 'mystere'); await p.reload(); await dash(p); await p.waitForSelector('#daily .dyhead');
  assert.equal(await curTab(p), 'mystere', 'rechargement : même onglet'); assert.deepEqual(await shownPanels(p), ['p-mystere']);
  await p.goto(URL0 + '#discord'); await dash(p); await p.waitForSelector('#dcCh');
  assert.equal(await curTab(p), 'discord', 'lien direct #discord'); assert.equal(await visible(p, '#dcCh'), true);
  await p.goto(URL0 + '#inconnu'); await dash(p); assert.equal(await curTab(p), 'apercu'); assert.equal(await p.evaluate(() => location.hash), '#apercu', 'onglet inconnu : vue d\'ensemble');
  ok('onglets : clic → #adresse, retour / avancer, rechargement sur le même onglet, lien direct #discord, adresse inconnue → vue d\'ensemble');

  // clavier : flèches, Début, Fin (en boucle), focus visible, l'onglet choisi suit
  await p.focus('#t-apercu'); await p.keyboard.press('ArrowRight');
  assert.equal(await p.evaluate(() => document.activeElement.id), 't-comptes'); assert.equal(await curTab(p), 'comptes'); assert.equal(await p.evaluate(() => location.hash), '#comptes');
  assert.equal(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'focus visible au clavier');
  await p.keyboard.press('End'); assert.equal(await curTab(p), 'serveur'); assert.equal(await p.evaluate(() => document.activeElement.id), 't-serveur');
  await p.keyboard.press('ArrowRight'); assert.equal(await curTab(p), 'apercu', 'après le dernier : le premier');
  await p.keyboard.press('ArrowLeft'); assert.equal(await curTab(p), 'serveur');
  await p.keyboard.press('Home'); assert.equal(await curTab(p), 'apercu');
  assert.deepEqual(await p.$$eval('#tabl .tab', e => e.filter(x => x.tabIndex === 0).map(x => x.id)), ['t-apercu']);
  await p.keyboard.press('Tab'); assert.notEqual(await p.evaluate(() => document.activeElement.closest('#tabl') ? 1 : 0), 1, 'Tab : sort de la barre');
  ok('onglets au clavier : → ← Début Fin (en boucle), focus visible, un seul onglet tabulable, Tab quitte la barre');

  // tuiles : « Pseudos signalés » → Signalements (carte des pseudos) ; « Comptes » → Utilisateurs
  await p.click('#kpis [data-k="pseudos"]'); assert.equal(await curTab(p), 'signalements'); assert.equal(await visible(p, '#dyRepCard'), true);
  assert.match(await txt(p, '#dyRepCard'), /^Pseudos signalés 2 pseudos .*VilainPseudo 2 signalements .*Masquer Ignorer Grossier 3 signalements .*masqué Rétablir Ignorer$/);
  await p.click('#dyRepCard .dyr:first-child button:last-child'); await toastIs(p, /Signalements effacés\./);
  assert.deepEqual(DY.posts.at(-1), { path: '/api/admin/daily/report', body: { id: 'p6' } });
  await p.waitForFunction(() => document.querySelector('#t-signalements .badge').firstChild.textContent === '1'); assert.match(await p.$eval('#kpis [data-k="pseudos"]', e => e.textContent), /^Pseudos signalés11 masqué/);
  await tab(p, 'apercu'); await p.click('#kpis [data-k="users"]'); assert.equal(await curTab(p), 'comptes');
  await noJunk(p, 'onglets');
  assert.deepEqual(errs, []); await ctx.close(); DYS = dySeed();
  ok('tuiles : « Pseudos signalés » → Signalements (Ignorer : pastille et tuile à jour), « Comptes » → Utilisateurs ; aucune erreur');
}

/* ── Onglets masqués : Carte mystère (DAILY=0), Discord et Fils (404), scans coupés ; adresse vers un onglet masqué ───────────────── */
{
  DC.mode = '404'; TH.mode = '404'; EVT.mode = '404';
  const { ctx, p, errs, api } = await open({ user: ADM, before: [routeDiscord, routeThreads, routeEvents, routeAdminPatch(b => ({ ...b, scans: null }))], dark: true, hash: '#discord' });
  await dash(p); await asked(api, '/api/admin/discord'); await asked(api, '/api/admin/daily'); await asked(api, '/api/admin/discord/threads'); await asked(api, '/api/admin/events'); await p.waitForTimeout(250);
  assert.ok(api.includes('GET /api/admin/discord')); assert.equal(await p.$eval('#discord', e => e.hidden), true, '404 : section cachée'); assert.equal(await p.$('#discord *'), null);
  assert.deepEqual(await tabsShown(p), ['apercu', 'comptes', 'qr', 'signalements', 'journal', 'serveur'], 'Carte mystère (DAILY=0), Événements, Discord et Fils (404) masqués');
  assert.equal(await curTab(p), 'apercu', '#discord coupé : vue d\'ensemble'); assert.equal(await p.evaluate(() => location.hash), '#apercu');
  assert.equal(await p.$('#kpis [data-k="scans"]'), null, 'scans coupés : pas de tuile'); assert.equal(await p.$('#kpis [data-k="pseudos"]'), null);
  await tab(p, 'signalements'); assert.equal(await p.$eval('#scans', e => e.hidden), true, 'scans coupés : carte cachée'); assert.equal(await p.$eval('#dyRepCard', e => e.hidden), true);
  assert.equal(await visible(p, '#pubrep'), true, 'decks signalés toujours là'); assert.equal(await badgeOf(p, 'signalements'), '', 'rien à traiter : pas de pastille');
  await p.focus('#t-signalements'); await p.keyboard.press('ArrowLeft'); assert.equal(await curTab(p), 'qr'); await p.keyboard.press('ArrowLeft'); assert.equal(await curTab(p), 'comptes', 'flèches : les onglets masqués sautés');
  assert.deepEqual(errs, []); await ctx.close(); DC.mode = 'on'; TH.mode = 'on'; EVT.mode = 'on';
  ok('onglets masqués : Carte mystère (DAILY=0), Événements, Discord et Fils (404), lien #discord → vue d\'ensemble ; scans coupés : ni tuile ni carte, l\'onglet Signalements reste ; flèches sautent les masqués');
}

/* ── Carte mystère : en-tête toujours là, réponse et joueurs dans un bloc repliable (gardé au rechargement), actions, carte en préparation ── */
{
  DY.mode = 'on'; DY.prep = false; DYS = dySeed();
  const { ctx, p, errs } = await open({ user: ADM, before: routeDaily, hash: '#mystere' });
  await dash(p); await p.waitForSelector('#daily .dyhead');
  assert.equal(await txt(p, '#daily .dyhead'), 'Carte mystère n° 8 · 2026-10-22 · 1 terminée sur 1 · 1 masqué');
  await noJunk(p, 'Carte mystère'); assert.doesNotMatch(await p.$eval('#daily', e => e.textContent), /null|undefined/, 'plus de « null » sous l\'en-tête');
  assert.equal(await p.$eval('#dyPlayers', d => d.open), true, 'ouvert d\'office');
  assert.match(await txt(p, '#dyPlayers'), /^Réponse du jour et joueurs 3 joueurs Réponse du jour Joueurs des 7 derniers jours .* BobLeMage 980 pts · 3 jours · 2026-10-22 · niv\. 4 Masquer Zoé .* Masquée .*masqué Rétablir$/);
  { const hh = await p.$eval('#dyPlayers > summary', e => e.getBoundingClientRect().height); assert.ok(Math.round(hh) >= 44, 'titre du bloc : 44 px au moins (' + hh + ')'); }
  await p.click('#dyPlayers .dyans summary'); assert.match(await txt(p, '#dyPlayers .dyans'), /Lightning Bolt \(Foudre\) · Magic 2010/);
  await p.fill('#dyPlayers input[type="search"]', 'zoe'); assert.equal(await p.$$eval('#dyList .dyr', e => e.length), 1); assert.equal(await txt(p, '#dyN'), '1 sur 3');
  await p.fill('#dyPlayers input[type="search"]', '');
  assert.match(await txt(p, '#dyChk'), /^À vérifier 1 .*Rapide 2026-10-22 · 1 000 pts · étape 1 en 0:12 · 30 s après une victoire sur ce réseau à vérifier Valider$/);
  assert.match(await txt(p, '#dySus'), /^Trop souvent à l'étape 1 1 .*Chanceux 5 fois sur ses 7 dernières parties · 4,2 % pour tous soupçon Valider$/);
  // replier : en-tête toujours là, le reste caché ; gardé au rechargement et au repeint
  await p.click('#dyPlayers > summary');
  assert.equal(await p.$eval('#dyPlayers', d => d.open), false); assert.equal(await visible(p, '#dyList'), false); assert.equal(await visible(p, '#dyPlayers input[type="search"]'), false);
  assert.equal(await visible(p, '#daily .dyhead'), true, 'en-tête toujours visible');
  await p.waitForFunction(() => /false/.test(localStorage.getItem('manaorbit:admin:fold') || ''), null, { timeout: 3000 });      // état gardé par l'événement « toggle » (après le clic) : enregistré avant de recharger
  await p.reload(); await dash(p); await p.waitForSelector('#daily .dyhead');
  assert.equal(await p.$eval('#dyPlayers', d => d.open), false, 'replié : gardé après le rechargement');
  await p.click('#dyChk .dyr button'); await toastIs(p, /Partie remise au classement\./);
  assert.deepEqual(DY.posts.at(-1), { path: '/api/admin/daily/ok', body: { id: '2026-10-22:p4' } });
  assert.equal(await p.$eval('#dyPlayers', d => d.open), false, 'repeint après une action : toujours replié');
  assert.match(await txt(p, '#dyChk'), /Aucune partie à vérifier/); assert.equal(await badgeOf(p, 'mystere'), '1');
  await p.click('#dyPlayers > summary'); assert.equal(await p.$eval('#dyPlayers', d => d.open), true);
  await p.click('#dyList .dyr:first-child button'); await toastIs(p, /Pseudo masqué dans les classements\./);
  assert.deepEqual(DY.posts.at(-1), { path: '/api/admin/daily/hide', body: { id: 'p1', on: true } });
  assert.match(await txt(p, '#daily .dyhead'), /2 masqués$/);
  await noOverflow(p, 390, 'Carte mystère 390 px');
  // carte du jour en préparation : la note, ni réponse ni « null »
  DY.prep = true; await p.reload(); await dash(p); await p.waitForSelector('#daily .dyhead');
  assert.match(await txt(p, '#daily'), /Carte du jour en préparation depuis .* \(tirage et images : une à deux minutes\)/); assert.equal(await p.$('#daily .dyans'), null);
  await noJunk(p, 'Carte mystère en préparation'); DY.prep = false;
  assert.deepEqual(errs, []); await ctx.close(); DYS = dySeed();
  ok('Carte mystère : en-tête toujours visible, plus de « null » ; réponse, aide, recherche et joueurs dans un bloc repliable (44 px, gardé au rechargement et au repeint) ; à vérifier et soupçons repliables, Valider, Masquer ; carte en préparation');
}

/* ── Événements : lien direct #evenements, cartes (dates, état), tuiles, trouvées par jour + chasseurs, répartition, top 20 ; interrupteur (confirmation pour
   couper, POST avec le jeton, état et pastille à jour, journal ; rallumer sans fenêtre ; refus 403 dans la fenêtre), relu à l'affichage et par « Actualiser »,
   EVENT=0 et EVENT_FORCE ; onglet masqué sur 404 et 405 ; 360 px sombre ─────────────────────────────────────────────────────────────────────────────── */
{
  EVT.mode = 'on'; EVT.posts = []; EVT.fail = null; EVT.gets = 0; EVT.log = null; EVS = evSeed();
  const { ctx, p, errs } = await open({ user: ADM, before: routeEvents, vp: { width: 1280, height: 900 }, hash: '#evenements' });
  await dash(p); await p.waitForSelector('#events .evc .evch svg');
  assert.equal(await curTab(p), 'evenements', 'lien direct #evenements'); assert.deepEqual(await shownPanels(p), ['p-evenements']);
  assert.equal(await p.$eval('#t-evenements', t => [t.getAttribute('role'), t.getAttribute('aria-controls')].join(' ')), 'tab p-evenements');
  assert.equal(await p.$eval('#t-evenements .badge', b => b.hidden), true, 'rien de coupé : pas de pastille');
  const H1 = '#events .evc[data-id="halloween-2026"]', N1 = '#events .evc[data-id="noel-2026"]', M1 = '#events .evc[data-id="magic-2026"]';
  assert.deepEqual(await p.$$eval('#events .evc', e => e.map(x => x.dataset.id)), ['halloween-2026', 'noel-2026', 'magic-2026']);
  assert.match(await txt(p, '#events .evhead'), /^Événements Aujourd'hui : 27 oct\. \(heure de Paris\) Actualiser Éditions en cours/);
  assert.equal(await p.$('#events .evhead .note'), null, 'ni EVENT=0 ni EVENT_FORCE : pas d\'avertissement');
  assert.equal(await txt(p, H1 + ' .evtop'), '🎃 Halloween 2026 du 25 oct. au 8 nov. 2026 · 30 citrouilles, 5 par jour au plus En cours · jour 3 / 15 Événement actif Chasse et décorations visibles dans l\'appli.');
  assert.equal(await txt(p, N1 + ' .evtop'), '🎄 Noël 2026 du 18 déc. 2026 au 1 janv. 2027 · 30 boules de Noël, 5 par jour au plus Dans 52 jours Événement actif S\'ouvrira tout seul le 18 déc. 2026.');
  assert.match(await txt(p, N1), /Pas encore commencé : les statistiques arrivent dès le premier jour\.$/);
  assert.equal(await txt(p, M1 + ' .evtop'), '🎂 Anniversaire de Magic 2026 du 30 juil. au 12 août 2026 · 30 cartes dorées, 5 par jour au plus Terminé le 12 août');
  assert.equal(await p.$(M1 + ' .evsw'), null, 'terminé : pas d\'interrupteur'); assert.equal(await p.$eval(M1 + ' .evtop20', d => d.open), false, 'terminé : top replié d\'office');
  ok('Événements : lien direct #evenements, 3 éditions (en cours « jour 3 / 15 », à venir « Dans 52 jours », terminée « Terminé le 12 août »), dates, quotas ; interrupteur sauf pour la terminée');

  // tuiles
  assert.match(await txt(p, H1 + ' .kpi[data-k="hunters"]'), /^Chasseurs 412 380 avec un compte · 32 sans compte$/i);
  assert.match(await txt(p, H1 + ' .kpi[data-k="full"]'), /^À 30 \/ 30 17 4 % des chasseurs$/i);
  assert.match(await txt(p, H1 + ' .kpi[data-k="finds"]'), /^Citrouilles trouvées 3 120 7,6 par chasseur en moyenne$/i);
  assert.match(await txt(p, H1 + ' .kpi[data-k="today"]'), /^Aujourd'hui 970 par 260 chasseurs$/i);
  assert.match(await txt(p, M1 + ' .kpi[data-k="best"]'), /^Meilleur jour 57 10 août$/i);
  // trouvées par jour : 15 jours (3 passés, 12 à venir), courbe des chasseurs
  const D1 = H1 + ' .evch[data-k="days"] svg';
  assert.equal(await p.$$eval(D1 + ' .bar', e => e.length), 15); assert.equal(await p.$$eval(D1 + ' .fill', e => e.length), 3); assert.equal(await p.$$eval(D1 + ' .bar.fut', e => e.length), 12);
  assert.equal(await p.$$eval(D1 + ' .line', e => e.length), 1); assert.equal(await p.$$eval(D1 + ' .dot', e => e.length), 3);
  const t1 = await p.$$eval(D1 + ' .bar title', e => e.map(x => x.textContent));
  assert.deepEqual([t1[0], t1[2], t1[14]], ['25 oct. : 900 citrouilles · 230 chasseurs', '27 oct. : 970 citrouilles · 260 chasseurs', '8 nov. : à venir']);
  assert.match(await p.$eval(D1, s => s.getAttribute('aria-label')), /^Citrouilles trouvées par jour : 3\s120 en tout/);
  assert.deepEqual(await p.$$eval(D1 + ' text.ax', e => e.map(x => x.textContent.replace(/\s/g, ' '))), ['1 500', '750', '25 oct.', '1 nov.', '8 nov.'], 'repères ronds, premier, milieu et dernier jour');
  assert.ok(await p.$eval(D1, s => Number(s.getAttribute('width')) > 400), 'graphique à la largeur de sa colonne');
  assert.match(await txt(p, H1 + ' .evs .evleg'), /trouvées chasseurs/);
  // répartition : 0 à 30, 30 / 30 en vert
  const S1 = H1 + ' .evch[data-k="dist"] svg';
  assert.equal(await p.$$eval(S1 + ' .bar', e => e.length), 31); assert.equal(await p.$$eval(S1 + ' .full .fill', e => e.length), 1);
  const t2 = await p.$$eval(S1 + ' .bar title', e => e.map(x => x.textContent)); assert.deepEqual([t2[0], t2[30]], ['0 / 30 : 12 chasseurs', '30 / 30 : 17 chasseurs']);
  assert.equal(await p.$eval(S1 + ' .full .fill', f => getComputedStyle(f).fill), await p.evaluate(() => { const t = document.createElement('i'); t.style.color = getComputedStyle(document.documentElement).getPropertyValue('--good'); document.body.append(t); const c = getComputedStyle(t).color; t.remove(); return c; }), '30 / 30 en vert');
  // top 20 : rang, pseudo (texte seulement), trouvées, date à l'heure de Paris
  assert.equal(await p.$$eval(H1 + ' .evtl li', e => e.length), 20); assert.equal(await p.$$eval(H1 + ' .evtl li.done', e => e.length), 3);
  assert.match(await txt(p, H1 + ' .evtl li:first-child'), /^1 BobLeMage 30 \/ 30 27 oct\.,? (à )?14:32$/);
  assert.match(await txt(p, H1 + ' .evtl li:nth-child(3)'), /^3 <img src=x onerror="window\.__xss=1"> 30 \/ 30 /);
  assert.equal(await p.$$eval('#events img', e => e.length), 0); assert.equal(await p.evaluate(() => window.__xss), undefined, 'pseudo écrit en texte');
  assert.match(await txt(p, H1 + ' .evtop20 > summary'), /^Top 20 des chasseurs 20 pseudos$/);
  await noJunk(p, 'Événements');
  ok('Événements : tuiles (412 chasseurs dont 380 comptes et 32 sans compte, 17 à 30 / 30, 3 120 trouvées, aujourd\'hui), trouvées par jour (15 jours, 12 à venir, courbe des chasseurs, infobulles), répartition (31 barres, 30 / 30 en vert), top 20 (textContent, heure de Paris)');

  // interrupteur : couper (confirmation ; Annuler : rien), POST avec le jeton, état, pastille, journal
  const SW = H1 + ' .evsw';
  assert.deepEqual(await p.$eval(SW, b => [b.getAttribute('role'), b.getAttribute('aria-checked'), b.textContent, document.getElementById(b.getAttribute('aria-describedby')).textContent, b.getBoundingClientRect().height >= 44]),
    ['switch', 'true', 'Événement actif', 'Chasse et décorations visibles dans l\'appli.', true]);
  await p.click(SW); await p.waitForSelector('#dlg[open]');
  assert.match(await txt(p, '#dlg'), /^Couper Halloween 2026 \? 🎃 · Halloween 2026 · du 25 oct\. au 8 nov\. 2026 Plus personne ne verra la chasse ni les décorations ; les progressions sont gardées\. Effet immédiat.* Annuler Couper l'événement$/);
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Annuler', 'Annuler a le focus');
  await p.click('#dlg [data-v=""]'); await p.waitForTimeout(100); assert.equal(EVT.posts.length, 0, 'Annuler : rien envoyé'); assert.equal(await p.$eval(SW, b => b.getAttribute('aria-checked')), 'true');
  EVT.log = [{ t: Date.now(), a: 'event', n: '', m: '', d: 'halloween-2026 : coupé', by: 'ad•••@e•••.org', ok: true }];
  await p.click(SW); await p.click('#dlg [data-v="ok"]'); await toastIs(p, /Halloween 2026 coupé : plus de chasse ni de décorations\./);
  assert.equal(EVT.posts.length, 1); assert.equal(EVT.posts[0].path, '/api/admin/events/switch'); assert.deepEqual(EVT.posts[0].body, { id: 'halloween-2026', on: false }, 'corps exact');
  assert.ok(EVT.posts[0].tok, 'avec le jeton dans l\'en-tête'); assert.match(EVT.posts[0].type, /application\/json/);
  assert.equal(await p.$eval(SW, b => b.getAttribute('aria-checked')), 'false'); assert.equal(await p.$eval(H1, e => e.classList.contains('cut')), true);
  assert.match(await txt(p, H1 + ' .evtags'), /^En cours · jour 3 \/ 15 coupé$/); assert.equal(await txt(p, H1 + ' .evswd'), 'Coupé : ni chasse ni décorations ; progressions gardées.');
  assert.equal(await p.evaluate(() => document.activeElement.matches('.evsw[data-id="halloween-2026"]')), true, 'focus rendu à l\'interrupteur');
  assert.equal(await p.$eval('#t-evenements .badge', b => b.hidden), false, 'édition en cours coupée : un point'); assert.match(await p.$eval('#t-evenements', e => e.textContent), /Événements : événement en cours coupé$/);
  assert.equal(await p.$eval('#t-evenements .badge', b => Math.round(b.getBoundingClientRect().width)), 10, 'un point, sans nombre');
  await tab(p, 'journal'); const jt = await txt(p, '#journal');
  assert.match(jt, /Événement halloween-2026 : coupé · \d+ \S+ \d\d:\d\d · par ad•••@e•••\.org/); assert.doesNotMatch(jt, /Sans nom|undefined|null/, 'journal : rien de parasite');
  EVT.log = null;
  ok('Événements : interrupteur (role switch, aria-checked, 44 px) → fenêtre « Plus personne ne verra la chasse ni les décorations ; les progressions sont gardées. » (Annuler : rien), POST { id, on: false } en JSON avec le jeton, carte coupée, point sur l\'onglet, ligne « Événement » du journal');

  // relu à l'affichage de l'onglet ; rallumer : sans fenêtre
  const g0 = EVT.gets; await tab(p, 'evenements'); for (let i = 0; i < 100 && EVT.gets === g0; i++) await sleep(30); await p.waitForTimeout(150);
  assert.equal(EVT.gets, g0 + 1, 'relu à l\'affichage de l\'onglet'); assert.equal(await p.$eval(SW, b => b.getAttribute('aria-checked')), 'false', 'toujours coupé (serveur)');
  await p.click(SW); await toastIs(p, /Halloween 2026 rallumé\./);
  assert.equal(await p.$eval('#dlg', d => d.open), false, 'rallumer : pas de fenêtre'); assert.deepEqual(EVT.posts[1].body, { id: 'halloween-2026', on: true });
  assert.equal(await p.$eval(SW, b => b.getAttribute('aria-checked')), 'true'); assert.equal(await p.$eval('#t-evenements .badge', b => b.hidden), true, 'plus de point');
  // refus (403) : message dans la fenêtre, rien ne change
  EVT.fail = [403, { error: 'forbidden', message: 'Action refusée : la demande doit venir du panneau.' }];
  await p.click(SW); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => document.querySelector('#dlg').open && /Action impossible/.test(document.querySelector('#dlg').innerText), null, { timeout: 5000 });
  assert.equal(await txt(p, '#dlg'), 'Action impossible Action refusée : la demande doit venir du panneau. OK');
  await p.click('#dlg [data-v="ok"]'); EVT.fail = null;
  assert.equal(EVT.posts.length, 3); assert.deepEqual(await p.$eval(SW, b => [b.getAttribute('aria-checked'), b.disabled]), ['true', false], 'refusé : toujours actif, interrupteur rendu');
  ok('Événements : relu à l\'affichage de l\'onglet ; rallumer sans fenêtre (POST { on: true }, point retiré) ; refus 403 : « Action impossible » et le message du serveur, état inchangé');

  // « Actualiser » : EVENT=0 et EVENT_FORCE
  EVS.on = false; EVS.force = 'halloween-2026'; const g1 = EVT.gets;
  await p.click('#evGo'); await p.waitForSelector('#events .note[data-k="off"]'); assert.equal(EVT.gets, g1 + 1, '« Actualiser » : relu');
  assert.match(await txt(p, '#events .note[data-k="off"]'), /^EVENT=0 sur le serveur : tout est coupé\. /);
  assert.match(await txt(p, '#events .note[data-k="force"]'), /^Forcé par EVENT_FORCE : Halloween 2026\. Réservé aux essais/);
  assert.match(await txt(p, H1 + ' .evtags'), /forcé par EVENT_FORCE$/); assert.equal(await txt(p, H1 + ' .evswd'), 'Allumé ici, mais EVENT=0 coupe tout sur le serveur.');
  assert.equal(await p.$eval('#t-evenements .badge', b => b.hidden), false, 'EVENT=0 pendant une édition : un point');
  await noJunk(p, 'Événements EVENT=0');
  assert.deepEqual(errs, []); await ctx.close(); EVS = evSeed();
  ok('Événements : « Actualiser » relit ; EVENT=0 (« tout est coupé », point sur l\'onglet) et EVENT_FORCE (avertissement, étiquette « forcé par EVENT_FORCE ») ; aucune erreur');
}
{
  // serveur sans le module : 404 (ou 405 : /api/admin/<inconnu> d'un serveur plus ancien) → onglet masqué, #evenements → vue d'ensemble
  EVT.mode = '404';
  const { ctx, p, errs, api } = await open({ user: ADM, before: routeEvents, hash: '#evenements' });
  await dash(p); await asked(api, '/api/admin/events'); await p.waitForFunction(() => document.querySelector('#t-evenements').hidden, null, { timeout: 5000 });
  assert.equal(await curTab(p), 'apercu'); assert.equal(await p.evaluate(() => location.hash), '#apercu'); assert.equal(await p.$('#events *'), null);
  EVT.mode = '405'; await p.goto(URL0 + '#evenements'); await dash(p); await p.waitForFunction(() => document.querySelector('#t-evenements').hidden, null, { timeout: 5000 });
  assert.equal(await curTab(p), 'apercu', '405 : masqué aussi'); assert.ok(!(await tabsShown(p)).includes('evenements'));
  assert.deepEqual(errs, []); await ctx.close(); EVT.mode = 'on';
  ok('Événements : 404 ou 405 (serveur sans le module) → onglet masqué, #evenements ramené à la vue d\'ensemble');
}
{
  // 360 px sombre : cartes, graphiques et top sans défilement de côté
  EVT.mode = 'on'; EVS = evSeed();
  const { ctx, p, errs } = await open({ user: ADM, before: routeEvents, phone: { width: 360, height: 740 }, dark: true, hash: '#evenements' });
  await dash(p); await p.waitForSelector('#events .evc .evch svg');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 15, 28)', 'sombre');
  await noOverflow(p, 360, 'Événements 360 px sombre'); await noJunk(p, 'Événements 360 px');
  assert.ok(await p.$eval('#events .evsw', b => b.getBoundingClientRect().height >= 44), 'interrupteur : 44 px au moins');
  assert.ok(await p.$eval('#events .evch[data-k="days"] svg', s => s.getBoundingClientRect().right <= 360 - 16), 'graphique dans la carte');
  assert.deepEqual(errs, []); await ctx.close();
  ok('Événements à 360 px sombre : sans défilement de côté ni texte parasite, interrupteur ≥ 44 px');
}

/* ── Discord : bot non configuré ; onglet dédié (salons, raccourcis, modèles, pings, aperçu, envoi, historique) ─────────────────────── */
{
  // bot non configuré (on: false) : le message du serveur et rien d'autre
  DC.mode = 'off';
  const { ctx, p, errs } = await open({ user: ADM, before: routeDiscord, hash: '#discord' });
  await dash(p); await p.waitForSelector('#discord:not([hidden]) .note');
  assert.equal(await txt(p, '#discord'), 'Bot Discord Indisponible Bot Discord non configuré (DISCORD_BOT_TOKEN absent).');
  assert.equal(await p.$$eval('#discord select, #discord textarea, #discord button, #discord input', e => e.length), 0, 'rien d\'autre');
  assert.equal(await visible(p, '#t-discord'), true, 'on false : l\'onglet reste (il dit pourquoi)');
  assert.deepEqual(errs, []); await ctx.close();
  ok('Discord : on false → l\'état du bot et le message du serveur seulement');
}
{
  DC.mode = 'on'; DC.sent = dcOld(); DC.posts = [];
  const { ctx, p, errs, api } = await open({ user: ADM, before: routeDiscord, phone: { width: 360, height: 740 }, hash: '#discord' });
  await dash(p); await p.waitForSelector('#discord:not([hidden]) #dcCh');
  const groups = await p.$$eval('#dcCh optgroup', g => g.map(x => [x.label, ...[...x.children].map(o => o.value + ' ' + o.textContent)]));
  assert.deepEqual(groups, [['Sans catégorie', '100 # hors-catégorie'], ['Bienvenue', '101 # bienvenue', '102 # règles', '103 📢 annonces'], ['Communauté', '104 # général', '105 # 🃏・decks'], ['Équipe', '106 📢 changelog']]);
  assert.match(await txt(p, '#dcStat'), /^Bot Discord En ligne Serveur Mana Orbit Salons 7 · 2 d'annonces Rôles à pinger 6 Messages gardés 1 Le message part au nom du bot/i);
  assert.equal(await p.$eval('#dcCh', e => e.value), '103', 'rien de gardé : le premier salon « annonces »');
  assert.deepEqual(await p.$$eval('#dcForm [data-ch]', e => e.map(x => [x.dataset.ch, x.textContent, x.getAttribute('aria-pressed')])), [['103', '📢 annonces', 'true'], ['106', '📢 changelog', 'false']], 'raccourcis #annonces et #changelog');
  assert.equal(await visible(p, '#dcPubL'), true); assert.equal(await p.$eval('#dcPub', e => e.checked), true, 'publier : coché d\'office');
  await p.selectOption('#dcCh', '104'); assert.equal(await visible(p, '#dcPubL'), false, 'salon écrit : pas de « Publier »');
  assert.deepEqual(await p.$$eval('#dcForm [data-ch]', e => e.map(x => x.getAttribute('aria-pressed'))), ['false', 'false']);
  await p.click('#dcForm [data-ch="106"]'); assert.equal(await p.$eval('#dcCh', e => e.value), '106', 'raccourci → salon choisi'); assert.equal(await visible(p, '#dcPubL'), true, 'autre salon d\'annonces : « Publier »');
  assert.equal(await txt(p, '#dcPrevCh'), '📢 changelog · Équipe', 'aperçu : le salon');
  await p.reload(); await dash(p); await p.waitForSelector('#dcCh');
  assert.equal(await p.$eval('#dcCh', e => e.value), '106', 'dernier salon choisi gardé sur l\'appareil'); assert.equal(await curTab(p), 'discord');
  await p.click('#dcForm [data-ch="103"]');
  ok('Discord : état du bot (serveur, salons, rôles), salons groupés par catégorie (<optgroup>, 📢), raccourcis #annonces / #changelog, #annonces d\'office puis le dernier choisi, « Publier » seulement pour un salon d\'annonces');

  // modèles : début de message en tête, une fois ; « x.y » sélectionné
  await p.click('#dcForm [data-tpl="changelog"]');
  assert.equal(await p.$eval('#dcTxt', e => e.value), '🆕 **Version x.y**\n• ');
  assert.deepEqual(await p.$eval('#dcTxt', e => [document.activeElement === e, e.value.slice(e.selectionStart, e.selectionEnd)]), [true, 'x.y'], 'version à taper : sélectionnée');
  await p.keyboard.type('1.0.12'); assert.equal(await p.$eval('#dcTxt', e => e.value), '🆕 **Version 1.0.12**\n• ');
  await p.fill('#dcTxt', 'Le scan est plus rapide'); await p.click('#dcForm [data-tpl="annonce"]');
  assert.equal(await p.$eval('#dcTxt', e => e.value), '📢 **Nouveauté** : \nLe scan est plus rapide', 'texte déjà là : le modèle en tête');
  await p.click('#dcForm [data-tpl="annonce"]'); assert.equal(await p.$eval('#dcTxt', e => e.value), '📢 **Nouveauté** : \nLe scan est plus rapide', 'deux fois : pas deux en-têtes');
  assert.deepEqual(await p.$$eval('#dcPrev b', e => e.map(x => x.textContent)), ['Nouveauté']);
  await p.fill('#dcTxt', '');
  ok('Discord : modèles « Annonce » et « Changelog » (début de message en tête une seule fois, « x.y » sélectionné, aperçu)');

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
  await p.focus('#dcTxt'); await p.keyboard.press('Control+Enter'); await p.waitForSelector('#dlg[open]'); await p.click('#dlg [data-v="ok"]');      // Ctrl+Entrée : la même confirmation
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
  ok('Discord : Envoyer (ou Ctrl+Entrée) → confirmation (salon, pings, @everyone, publier ; Annuler : rien), corps exact, grisé pendant l\'envoi, toast, texte et pings vidés, historique en tête (Ouvrir : nouvel onglet, noopener)');

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

  // repeint du panneau (tri, autre onglet) : brouillon gardé ; 360 px : rien ne déborde
  await p.fill('#dcTxt', 'Brouillon'); await tab(p, 'comptes'); await p.selectOption('#sort', 'cards'); await settle(p); await tab(p, 'discord');
  assert.equal(await p.$eval('#dcTxt', e => e.value), 'Brouillon', 'brouillon gardé quand le panneau se repeint');
  await noOverflow(p, 360, 'Discord 360 px');
  const shot = process.env.ADMIN_DC_SHOT; if (shot) await p.locator('#discord').screenshot({ path: shot });
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.deepEqual(errs, []); await ctx.close();
  ok('Discord : brouillon gardé au repeint et d\'un onglet à l\'autre ; 360 px sans défilement de côté ; aucune erreur (CSP comprise)');
}

/* ── Fils des forums : filtres, un fil (messages, captures, texte illisible), étiquettes, fermer, verrouiller, renommer, répondre, supprimer ── */
{
  TH.mode = 'on'; TH.list = thSeed(); TH.msgs = {}; TH.posts = []; TH.gets = [];
  const { ctx, p, errs } = await open({ user: ADM, before: routeThreads, vp: { width: 1280, height: 900 }, hash: '#fils' });
  await dash(p); await p.waitForSelector('#thList .thi');
  assert.deepEqual(TH.gets.filter(g => /state=open/.test(g)).map(g => new URLSearchParams(g.split('?')[1]).get('forum')).sort(), ['aide', 'bugs', 'idées'], 'fils ouverts des trois forums');
  assert.deepEqual(await p.$$eval('#threads .seg:first-child .chip', e => e.map(x => [x.dataset.k, x.textContent, x.getAttribute('aria-pressed')])), [['tous', 'Tous2 à trier', 'true'], ['bugs', 'Bugs1 à trier', 'false'], ['idées', 'Idées1 à trier', 'false'], ['aide', 'Questions', 'false']], 'filtre forum, à trier par forum');
  assert.match(await txt(p, '#threads .chead'), /^Fils des forums 3 fils ouverts · 2 à trier$/);
  assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['700', '701', '702'], 'Tous : les trois forums, le plus récent d\'abord');
  assert.match(await txt(p, '#thList .thi[data-id="702"]'), /^Mode sombre plus contrasté à trier \(texte non lisible : active Message Content Intent sur le portail Discord\) Idées · Paul · il y a 3 h · 0 message$/, 'premier message illisible : l\'avertissement');
  await p.click('#threads .seg:first-child [data-k="bugs"]'); assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['700', '701']);
  assert.match(await txt(p, '#thList .thi[data-id="700"]'), /^Le scan plante sur Android à trier 🤖 Android Quand je scanne une carte en japonais, l'appli se ferme\. Mana Orbit \(bot\) · il y a 1 h · 3 messages$/);
  assert.match(await txt(p, '#thList .thi[data-id="701"]'), /^Prix faux pour les foils ✅ Confirmé Lucie · il y a 2 h · 1 message$/, 'étiquette d\'équipe : pas « à trier »');
  assert.match(await txt(p, '#thDet'), /Choisis un fil dans la liste/);
  await p.click('#threads .seg:first-child [data-k="idées"]'); assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['702']);
  await p.click('#threads .seg:first-child [data-k="aide"]'); assert.match(await txt(p, '#thList'), /^Forum « aide » introuvable sur le serveur Discord\. Aucun fil ouvert dans ce forum\.$/, 'message du serveur affiché');
  await p.click('#threads .seg:first-child [data-k="bugs"]');
  ok('Fils : fils ouverts des trois forums, filtre Tous / Bugs / Idées / Questions (à trier par forum), fiche (titre, étiquettes avec emoji, auteur, date, messages, début du texte ou avertissement s\'il est illisible, « à trier »), message du serveur pour un forum introuvable');

  // un fil : #fils/700, messages (texte en textContent, illisible : intention à activer, captures en loading=lazy dans un nouvel onglet, rien d'une autre adresse)
  await p.click('#thList .thi[data-id="700"]'); await p.waitForSelector('#thDet .thm');
  assert.equal(await p.evaluate(() => location.hash), '#fils/700');
  assert.match(await txt(p, '#thDet .thdh'), /^Le scan plante sur Android Bugs · par Mana Orbit \(bot\) · ouvert il y a 5 h · 3 messages ouvert 🤖 Android$/);
  assert.equal(await p.$$eval('#thDet .thm', e => e.length), 3); assert.match(await txt(p, '#thDet .thms'), /^Messages plus anciens : sur Discord\./);
  assert.equal(await p.$eval('#thDet .thm[data-id="700"] .thc', e => e.textContent), 'Quand je scanne une carte en japonais, l\'appli se ferme.\n\nAndroid 14 · APK 1.0.11');
  assert.equal(await txt(p, '#thDet .thm[data-id="7001"] .thhid'), '(texte non lisible : active Message Content Intent sur le portail Discord)');
  assert.match(await txt(p, '#thDet .thm[data-id="7002"]'), /^Paul .* · modifié Pareil chez moi <img src=x onerror="window\.__xss=1">$/); assert.equal(await p.$$eval('#thDet .thc img', e => e.length), 0);
  assert.deepEqual(await p.$$eval('#thDet .thimg', e => e.map(a => [a.getAttribute('href'), a.target, a.rel, a.querySelector('img').getAttribute('loading'), a.querySelector('img').alt])), [[`http://127.0.0.1:${PORT}/icons/icon.svg`, '_blank', 'noopener noreferrer', 'lazy', 'capture-1.jpg']], 'capture : <img loading=lazy>, en grand dans un nouvel onglet ; autre adresse ignorée');
  assert.deepEqual(await p.$eval('#thDet .thact a', a => [a.textContent, a.getAttribute('href'), a.target]), ['Ouvrir sur Discord', 'https://discord.com/channels/9/700', '_blank']);
  assert.equal(await p.$eval('#thList .thi[data-id="700"]', e => e.classList.contains('on')), true, 'grand écran : la liste reste à côté');
  ok('Fils : un fil (#fils/700) : messages (textContent, illisible → « active Message Content Intent »), capture en <img loading=lazy> (nouvel onglet), adresse étrangère ignorée, Ouvrir sur Discord');

  // étiquettes : celles de l'équipe d'abord ; Enregistrer seulement quand ça change ; la pastille suit
  assert.deepEqual(await p.$$eval('#thDet .thtags label', e => e.map(x => [x.textContent, x.classList.contains('team'), x.querySelector('input').checked])), [['✅ Confirmé', true, false], ['🛠️ Corrigé', true, false], ['Prochaine version', true, false], ['🤖 Android', false, true]], 'étiquettes d\'équipe en premier (emoji personnalisé ignoré)');
  assert.equal(await p.$eval('#thTagSave', b => b.disabled), true);
  await p.check('#thDet [data-tag="a2"]'); assert.equal(await p.$eval('#thTagSave', b => b.disabled), false);
  await p.click('#thTagSave'); await toastIs(p, /Étiquettes enregistrées\./);
  assert.deepEqual(TH.posts.at(-1).body, { id: '700', tags: ['a2', 'a1'] }); assert.match(TH.posts.at(-1).type, /application\/json/); assert.ok(TH.posts.at(-1).tok);
  assert.equal(await badgeOf(p, 'fils'), '1', 'trié : pastille à 1'); assert.doesNotMatch(await txt(p, '#thList .thi[data-id="700"]'), /à trier/);
  // verrouiller, renommer (fenêtre), fermer (passe chez les fermés), rouvrir
  await p.click('#thDet [data-act="lock"]'); await toastIs(p, /Fil verrouillé/); assert.deepEqual(TH.posts.at(-1).body, { id: '700', locked: true });
  assert.match(await txt(p, '#thDet .thdh'), /🔒 verrouillé/); assert.equal(await txt(p, '#thDet [data-act="lock"]'), 'Déverrouiller');
  await p.click('#thDet [data-act="rename"]'); await p.waitForSelector('#dlg[open] .dlgi');
  assert.equal(await p.evaluate(() => document.activeElement.className), 'dlgi', 'le titre a le focus');
  await p.fill('#dlg .dlgi', 'Le scan plante (japonais)'); await p.keyboard.press('Enter'); await toastIs(p, /Fil renommé\./);
  assert.deepEqual(TH.posts.at(-1).body, { id: '700', name: 'Le scan plante (japonais)' }); assert.equal(await txt(p, '#thTitle'), 'Le scan plante (japonais)');
  const nRen = TH.posts.length; await p.click('#thDet [data-act="rename"]'); await p.click('#dlg [data-v=""]'); await p.waitForTimeout(100); assert.equal(TH.posts.length, nRen, 'Annuler : rien');
  await p.click('#thDet [data-act="archive"]'); await toastIs(p, /Fil fermé\./); assert.deepEqual(TH.posts.at(-1).body, { id: '700', archived: true });
  assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['701'], 'fermé : plus dans les ouverts'); assert.equal(await txt(p, '#thDet [data-act="archive"]'), 'Rouvrir');
  await p.click('#threads .seg:last-child [data-k="closed"]'); await p.waitForSelector('#thList .thi');
  assert.ok(TH.gets.some(g => /forum=bugs&state=closed$/.test(g)));
  assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['700', '711']); await p.click('#thMore'); await p.waitForFunction(() => document.querySelectorAll('#thList .thi').length === 4);
  const nx = 'cur-' + TH.list.find(t => t.id === '711').last;
  assert.ok(TH.gets.includes('/api/admin/discord/threads?' + new URLSearchParams({ forum: 'bugs', state: 'closed', before: nx })), 'Plus anciens : before = next de la réponse, tel quel'); assert.equal(await p.$('#thMore'), null, 'plus rien : pas de bouton');
  assert.match(await txt(p, '#thList .thi[data-id="711"]'), /Mana Orbit \(bot\) · fermé il y a 4 j/, 'fermé : depuis quand');
  await p.click('#threads .seg:first-child [data-k="tous"]'); await p.waitForFunction(() => document.querySelectorAll('#thList .thi').length === 2);
  assert.equal(TH.gets.at(-1), '/api/admin/discord/threads?state=closed', 'Tous les fermés : sans forum'); await p.click('#threads .seg:first-child [data-k="bugs"]'); await p.waitForSelector('#thList .thi');
  await p.click('#thDet [data-act="archive"]'); await toastIs(p, /Fil rouvert\./); assert.deepEqual(TH.posts.at(-1).body, { id: '700', archived: false });
  await p.click('#threads .seg:last-child [data-k="open"]'); assert.deepEqual(await p.$$eval('#thList .thi', e => e.map(x => x.dataset.id)), ['700', '701']);
  ok('Fils : étiquettes (équipe d\'abord, Enregistrer quand ça change, pastille), Verrouiller, Renommer (fenêtre, Entrée, Annuler), Fermer → chez les fermés (depuis quand), « Plus anciens » (before = next), Tous les fermés (sans forum), Rouvrir');

  // répondre (confirmé, aucun ping), répondre et fermer, erreur du serveur ; supprimer (confirmé)
  await p.fill('#thReply', 'Merci, corrigé dans la 1.0.12 !');
  await p.click('#thSend'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg'), /^Répondre dans le fil \? Le scan plante \(japonais\) Réponse publique du bot « Mana Orbit », sans ping\. Merci, corrigé/);
  await p.click('#dlg [data-v=""]'); assert.notEqual(TH.posts.at(-1).path, '/api/admin/discord/reply', 'Annuler : rien');
  TH.fail = [502, { error: 'discord', message: 'Discord a refusé la réponse : Missing Access.' }];
  await p.click('#thSend'); await p.click('#dlg [data-v="ok"]'); await toastIs(p, /^Discord a refusé la réponse : Missing Access\.$/); TH.fail = null;
  assert.equal(await p.$eval('#thReply', e => e.value), 'Merci, corrigé dans la 1.0.12 !', 'refus : texte gardé');
  TH.closeFail = true; await p.click('#thSendClose'); await p.click('#dlg [data-v="ok"]');
  await toastIs(p, /^Réponse envoyée, mais Discord a refusé de fermer le fil\.$/); TH.closeFail = false;
  assert.equal(await txt(p, '#thDet [data-act="archive"]'), 'Fermer', 'fermeture refusée : fil laissé ouvert'); await p.waitForFunction(() => document.querySelectorAll('#thDet .thm').length === 4);
  await p.fill('#thReply', 'Merci, corrigé dans la 1.0.12 !');
  await p.click('#thSendClose'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg'), /Le fil est fermé ensuite\./); await p.click('#dlg [data-v="ok"]');
  await toastIs(p, /Réponse envoyée, fil fermé\./); assert.deepEqual(TH.posts.at(-1).body, { id: '700', content: 'Merci, corrigé dans la 1.0.12 !', close: true });
  await p.waitForFunction(() => document.querySelectorAll('#thDet .thm').length === 5); assert.equal(await p.$eval('#thReply', e => e.value), '', 'réponse partie : texte vidé');
  assert.match(await txt(p, '#thDet .thm:last-child'), /^Mana Orbit APP .*Merci, corrigé dans la 1\.0\.12 !$/);
  await p.click('#thDet [data-act="delete"]'); await p.waitForSelector('#dlg[open]'); assert.match(await txt(p, '#dlg'), /^Supprimer le fil \? Le scan plante \(japonais\) Le fil et tous ses messages sont effacés de Discord/);
  await p.click('#dlg [data-v="ok"]'); await toastIs(p, /Fil supprimé de Discord\./); assert.deepEqual(TH.posts.at(-1).body, { id: '700' }); assert.equal(TH.posts.at(-1).path, '/api/admin/discord/thread-delete');
  assert.equal(await p.evaluate(() => location.hash), '#fils'); assert.match(await txt(p, '#thDet'), /Choisis un fil/);
  await noJunk(p, 'Fils');
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.deepEqual(errs, []); await ctx.close();
  ok('Fils : Répondre (confirmé, sans ping ; refus : message, texte gardé), « Répondre et fermer » (fermeture refusée : message, fil ouvert), Supprimer (confirmé) → retour à la liste ; aucune erreur');
}
{
  // téléphone : la liste, puis le fil seul (← Fils, retour du navigateur) ; bot non configuré
  TH.list = thSeed(); TH.msgs = {};
  const { ctx, p, errs } = await open({ user: ADM, before: routeThreads, phone: { width: 360, height: 740 }, hash: '#fils' });
  await dash(p); await p.waitForSelector('#thList .thi');
  assert.equal(await visible(p, '#thDet'), false, 'téléphone : la liste seule');
  await noOverflow(p, 360, 'Fils 360 px (liste)');
  await p.click('#thList .thi[data-id="700"]'); await p.waitForSelector('#thDet .thm');
  assert.equal(await visible(p, '#thList'), false, 'puis le fil seul'); assert.equal(await visible(p, '#thDet .thback'), true);
  await noOverflow(p, 360, 'Fils 360 px (fil)');
  await p.goBack(); await p.waitForFunction(() => document.querySelector('#thList').offsetParent !== null); assert.equal(await p.evaluate(() => location.hash), '#fils'); assert.equal(await visible(p, '#thList'), true, 'retour du navigateur : la liste');
  await p.click('#thList .thi[data-id="701"]'); await p.waitForSelector('#thDet .thm'); await p.click('#thDet .thback'); await p.waitForFunction(() => location.hash === '#fils');
  assert.equal(await visible(p, '#thList'), true, '« ← Fils » : la liste');
  await p.goto(URL0 + '#fils/702'); await dash(p); await p.waitForSelector('#thDet .thm'); assert.equal(await txt(p, '#thTitle'), 'Mode sombre plus contrasté', 'lien direct vers un fil');
  await p.click('#thDet .thback'); assert.equal(await p.evaluate(() => location.hash), '#fils'); assert.equal(await visible(p, '#thList'), true);
  TH.mode = 'off'; await p.reload(); await dash(p); await p.waitForSelector('#threads .note');
  assert.equal(await txt(p, '#threads'), 'Fils des forums Bot Discord non configuré (DISCORD_BOT_TOKEN absent).'); TH.mode = 'on';
  assert.deepEqual(errs, []); await ctx.close();
  ok('Fils au téléphone (360 px) : la liste, puis le fil seul, retour du navigateur et « ← Fils », lien direct #fils/702 ; bot non configuré : le message');
}

/* ── QR codes fixes (vrai serveur : /api/admin/qr, /q/…) : cartes Flyers et Discord, scans, destination modifiable (confirmée, journal), création, renommer,
   Tester, téléchargements SVG et PNG (≥ 2 048 px), aucune suppression ; captures (ADMIN_SHOTS) : onglet, création, modification ──────────────────────── */
{
  const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
  const goQ = (path, ua = AND) => fetch(`http://127.0.0.1:${PORT}${path}`, { redirect: 'manual', headers: { 'user-agent': ua } }).then(r => r.headers.get('location'));
  assert.equal(await goQ('/q/discord'), 'https://discord.gg/TTwrP94agb'); await goQ('/flyer'); await goQ('/flyer', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1');
  const shots = process.env.ADMIN_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
  const { ctx, p, errs, api } = await open({ user: ADM, before: ALL, hash: '#qr' });
  await dash(p); await p.waitForSelector('#qcList .qc[data-id="discord"]');
  assert.equal(await curTab(p), 'qr', 'lien direct #qr'); assert.deepEqual(await shownPanels(p), ['p-qr']);
  assert.deepEqual(await p.$$eval('#qcList .qc', e => e.map(x => x.dataset.id)), ['flyer', 'discord'], 'créés d\'office : Flyers puis Discord');
  assert.match(await txt(p, '.qchead .chead'), /^QR codes fixes 2 QR codes · 3 scans$/);
  assert.match(await txt(p, '.qc[data-id="flyer"] .qch'), /^Flyers Renommer QR imprimé : https:\/\/manaorbit\.app\/flyer 2 scans aujourd'hui 2 · 7 j : 2 · 30 j : 2 Android 1 · iPhone 1 · autre 0/);
  assert.match(await txt(p, '.qc[data-id="discord"] .qch'), /^Discord Renommer QR imprimé : https:\/\/manaorbit\.app\/q\/discord 1 scan aujourd'hui 1 .* Android 1 · iPhone 0 · autre 0/);
  assert.equal(await p.$$eval('.qc[data-id="flyer"] .qcbars .bar', e => e.length), 30, '30 jours en barres');
  assert.ok(await p.$eval('.qc[data-id="flyer"] img.qcimg', i => i.complete && i.naturalWidth > 0 && i.src.startsWith('data:image/svg+xml;base64,')), 'aperçu du QR (SVG du serveur, data:)');
  assert.equal(await p.$eval('.qc[data-id="flyer"] .qcseg [data-k="app"]', b => b.getAttribute('aria-pressed')), 'true', 'Flyers : selon le téléphone');
  assert.equal(await visible(p, '.qc[data-id="flyer"] .qcin'), false); assert.match(await txt(p, '.qc[data-id="flyer"] .qcapp'), /^Android → fiche Google Play/);
  assert.equal(await p.$eval('.qc[data-id="discord"] .qcin', i => i.value), 'https://discord.gg/TTwrP94agb');
  assert.deepEqual(await p.$$eval('.qc[data-id="discord"] .qcacts > *', e => e.map(x => x.textContent)), ['Tester ↗', 'Télécharger SVG', 'Télécharger PNG']);
  assert.deepEqual(await p.$eval('.qc[data-id="discord"] [data-act="test"]', a => [a.getAttribute('href'), a.target, a.rel]), ['/q/discord?test=1', '_blank', 'noopener noreferrer'], 'Tester : le lien, pas compté');
  assert.equal(await p.$eval('.qc[data-id="discord"] [data-act="save"]', b => b.disabled), true, 'Enregistrer grisé tant que rien ne change');
  assert.equal(await p.$$eval('#qrcodes button, #qrcodes a', e => e.filter(x => /suppr|retir|effac/i.test(x.textContent)).length), 0, 'aucun bouton de suppression');
  assert.equal(await p.$eval('.qcnew', d => d.open), false, 'création : bloc fermé d\'office');
  ok('QR codes (#qr) : cartes Flyers et Discord (aperçu, nom, lien imprimé, scans du jour, 7 et 30 jours, plateformes, barres), destination modifiable, Tester ↗ (?test=1), SVG, PNG ; aucun bouton de suppression');
  if (shots) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: join(shots, 'qr-390-clair.png'), fullPage: true }); }

  // Modification : confirmée (avant → après, « les QR déjà imprimés suivront ») ; Annuler : rien envoyé
  const dcard = '.qc[data-id="discord"]';
  await p.fill(dcard + ' .qcin', 'https://discord.gg/nouveau');
  assert.equal(await p.$eval(dcard, c => c.classList.contains('dirty')), true); assert.equal(await visible(p, dcard + ' [data-act="undo"]'), true);
  await p.click(dcard + ' [data-act="undo"]'); assert.equal(await p.$eval(dcard + ' .qcin', i => i.value), 'https://discord.gg/TTwrP94agb', 'Annuler : la destination d\'avant');
  await p.fill(dcard + ' .qcin', 'http://pas-https.example'); assert.equal(await p.$eval(dcard + ' [data-act="save"]', b => b.disabled), true, 'http:// : grisé');
  await p.fill(dcard + ' .qcin', 'https://discord.gg/nouveau'); await p.click(dcard + ' [data-act="save"]'); await p.waitForSelector('#dlg[open]');
  assert.match(await txt(p, '#dlg'), /^Changer la destination \? Discord · https:\/\/manaorbit\.app\/q\/discord Avant : https:\/\/discord\.gg\/TTwrP94agb Après : https:\/\/discord\.gg\/nouveau Les QR déjà imprimés \(et partagés\) suivront la nouvelle destination dès maintenant\. Annuler Changer la destination$/);
  if (shots) await p.screenshot({ path: join(shots, 'qr-modification.png') });
  await p.click('#dlg [data-v=""]'); await p.waitForTimeout(150);
  assert.ok(!api.some(a => a.startsWith('POST /api/admin/qr')), 'Annuler : rien envoyé'); assert.equal(await goQ('/q/discord?test=1'), 'https://discord.gg/TTwrP94agb');
  await p.click(dcard + ' [data-act="save"]'); await p.waitForSelector('#dlg[open]'); await p.click('#dlg [data-v="ok"]'); await toastIs(p, /Destination changée/);
  assert.ok(api.includes('POST /api/admin/qr/discord')); assert.equal(await goQ('/q/discord?test=1'), 'https://discord.gg/nouveau', 'le serveur redirige déjà vers la nouvelle destination');
  assert.equal(await p.$eval(dcard + ' .qcin', i => i.value), 'https://discord.gg/nouveau'); assert.equal(await p.$eval(dcard, c => c.classList.contains('dirty')), false);
  assert.match(await txt(p, dcard + ' .qcm'), /^modifié à l'instant$/);
  // « Selon le téléphone » : le champ disparaît, l'explication s'affiche ; on revient sans enregistrer
  await p.click(dcard + ' .qcseg [data-k="app"]'); assert.equal(await visible(p, dcard + ' .qcin'), false); assert.equal(await visible(p, dcard + ' .qcapp'), true);
  assert.equal(await p.$eval(dcard + ' [data-act="save"]', b => b.disabled), false); await p.click(dcard + ' [data-act="undo"]');
  assert.equal(await p.$eval(dcard + ' .qcseg [data-k="url"]', b => b.getAttribute('aria-pressed')), 'true');
  await tab(p, 'journal'); assert.match(await txt(p, '#journal'), /Destination d'un QR code changée Discord · \/q\/discord : https:\/\/discord\.gg\/TTwrP94agb → https:\/\/discord\.gg\/nouveau · .* · par ad•••@e•••\.org/);
  await tab(p, 'qr');
  ok('modification : brouillon (Annuler), http:// grisé, fenêtre « avant → après, les QR déjà imprimés suivront » (Annuler : rien envoyé), enregistrée sur le serveur, journal ; « Selon le téléphone » cache le champ');

  // Création : nom → lien proposé, lien pris ou invalide, destination ; fenêtre « ne pourra plus jamais changer » ; refus du serveur (lien réservé) dans une fenêtre
  await p.click('.qcnew > summary'); await p.waitForSelector('#qcName', { state: 'visible' });
  await p.fill('#qcName', 'Affiche boutique Lyon'); assert.equal(await p.$eval('#qcId', i => i.value), 'affiche-boutique-lyon', 'lien tiré du nom');
  await p.fill('#qcId', 'discord'); assert.match(await txt(p, '#qcIdTip'), /^Ce lien existe déjà\.$/); assert.equal(await p.$eval('#qcCreate', b => b.disabled), true);
  await p.fill('#qcId', 'Affiche_Lyon!'); assert.equal(await p.$eval('#qcId', i => i.value), 'affichelyon', 'minuscules, chiffres et tirets seulement');
  await p.fill('#qcId', 'affiche-lyon'); assert.match(await txt(p, '#qcIdTip'), /^QR imprimé : https:\/\/manaorbit\.app\/q\/affiche-lyon \(figé une fois créé\)$/);
  assert.equal(await p.$eval('#qcCreate', b => b.disabled), true, 'sans destination : grisé');
  await p.fill('#qcNewTo', 'https://example.org/lyon'); assert.equal(await p.$eval('#qcCreate', b => b.disabled), false);
  if (shots) { await p.$eval('.qchead', e => e.scrollIntoView()); await p.screenshot({ path: join(shots, 'qr-creation.png'), fullPage: true }); }
  await p.click('#qcCreate'); await p.waitForSelector('#dlg[open]');
  assert.match(await txt(p, '#dlg'), /^Créer ce QR code \? Affiche boutique Lyon · https:\/\/manaorbit\.app\/q\/affiche-lyon Destination : https:\/\/example\.org\/lyon Le lien https:\/\/manaorbit\.app\/q\/affiche-lyon ne pourra plus jamais changer, et le QR code ne pourra pas être supprimé/);
  if (shots) await p.screenshot({ path: join(shots, 'qr-creation-confirmer.png') });
  await p.click('#dlg [data-v="ok"]'); await toastIs(p, /QR code créé : manaorbit\.app\/q\/affiche-lyon\./);
  assert.deepEqual(await p.$$eval('#qcList .qc', e => e.map(x => x.dataset.id)), ['flyer', 'discord', 'affiche-lyon']);
  assert.equal(await goQ('/q/affiche-lyon?test=1'), 'https://example.org/lyon');
  assert.equal(await p.$eval('#qcName', i => i.value), '', 'formulaire vidé'); assert.equal(await p.$eval('#qcId', i => i.value), '');
  await p.fill('#qcName', 'Pirate'); await p.fill('#qcId', 'admin'); await p.click('.qcnew .qcseg [data-k="app"]');
  await p.click('#qcCreate'); await p.waitForSelector('#dlg[open]'); await p.click('#dlg [data-v="ok"]');
  await p.waitForFunction(() => /Action impossible Lien réservé : choisis-en un autre\./.test(document.querySelector('#dlg[open]') ? document.querySelector('#dlg').innerText.replace(/\s+/g, ' ') : ''), null, { timeout: 5000 });
  await p.click('#dlg [data-v="ok"]'); assert.equal(await p.$$eval('#qcList .qc', e => e.length), 3);
  ok('création : lien tiré du nom, nettoyé, « existe déjà » ; destination exigée ; fenêtre « ne pourra plus jamais changer ni être supprimé » ; carte ajoutée, redirection en place ; lien réservé : message du serveur');

  // Renommer (fenêtre, Entrée) ; le lien ne change pas
  await p.click('.qc[data-id="affiche-lyon"] [data-act="rename"]'); await p.waitForSelector('#dlg[open] #qcRen');
  await p.fill('#qcRen', 'Affiche Lyon centre'); await p.press('#qcRen', 'Enter'); await toastIs(p, /QR code renommé\./);
  assert.equal(await txt(p, '.qc[data-id="affiche-lyon"] h3'), 'Affiche Lyon centre'); assert.match(await txt(p, '.qc[data-id="affiche-lyon"] .qclink'), /\/q\/affiche-lyon$/);
  ok('renommer : fenêtre (Entrée), nom changé, lien identique');

  // Téléchargements : SVG (celui du serveur, qrSvgLogo version 5) et PNG (≥ 2 048 px, multiple du côté du QR : modules nets)
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('.qc[data-id="flyer"] [data-act="svg"]')]);
  assert.equal(d1.suggestedFilename(), 'qr-mana-orbit-flyer.svg');
  const svg = readFileSync(await d1.path(), 'utf8'), Q = createRequire(import.meta.url)('../src/qr.js');
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 45 45"/);
  assert.equal(svg.split('\n')[1].replace(/qrf\d+/g, 'qrf'), Q.qrSvgLogo('https://manaorbit.app/flyer', { minV: 5 }).svg.replace(/qrf\d+/g, 'qrf'), 'le même QR que les flyers imprimés');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('.qc[data-id="discord"] [data-act="png"]')]);
  assert.equal(d2.suggestedFilename(), 'qr-mana-orbit-discord.png');
  const png = readFileSync(await d2.path()), W = png.readUInt32BE(16), Hh = png.readUInt32BE(20);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG'); assert.equal(W, Hh); assert.ok(W >= 2048, 'au moins 2 048 px : ' + W); assert.equal(W % 45, 0, 'modules entiers (45 de côté)');
  await toastIs(p, /PNG 2\s070 × 2\s070 px téléchargé\./);
  ok('téléchargements : SVG (« qr-mana-orbit-flyer.svg », le même que tools/flyer.mjs) et PNG ' + W + ' × ' + Hh + ' px (« qr-mana-orbit-discord.png ») dessiné dans la page');

  assert.ok(!api.some(a => /^(DELETE|PUT|PATCH) /.test(a)), 'jamais de suppression demandée');
  await noOverflow(p, 390, 'QR codes 390 px'); await noJunk(p, 'QR codes');
  assert.deepEqual(errs, []); await ctx.close();
  if (shots) for (const dark of [false, true]) {
    const o = await open({ user: ADM, before: ALL, hash: '#qr', dark, dpr: 2 }); await dash(o.p); await o.p.waitForSelector('#qcList .qc'); await o.p.waitForTimeout(250);
    await o.p.screenshot({ path: join(shots, `qr-390-${dark ? 'sombre' : 'clair'}-fin.png`), fullPage: true });
    if (dark) { await o.p.click('.qcnew > summary'); await o.p.fill('#qcName', 'Flyer tournoi'); await o.p.waitForTimeout(100); await o.p.screenshot({ path: join(shots, 'qr-390-sombre-creation.png'), fullPage: true }); }
    await o.ctx.close();
  }
  ok('QR codes à 390 px : sans défilement de côté ni texte parasite ; aucune erreur');
}

/* ── Serveur : santé (vrai /api/admin/server) : mémoire et caches, démarrage, requêtes par minute, en direct, disque, historique des prix, avis « VPS » ;
   relu toutes les __hcEvery ms seulement sur l'onglet et page visible, « Actualiser » (?disk=1) ; serveur saturé simulé (route) : couleurs, pastille, avis ── */
const routeHealth = patch => async ctx => ctx.route(u => u.pathname === '/api/admin/server', async r => { const res = await r.fetch(); const b = await res.json(); return r.fulfill({ response: res, body: JSON.stringify(patch ? patch(b) : b) }); });
const healthCalls = api => api.filter(a => a.startsWith('GET /api/admin/server')).length;
const hidden = (p, on) => p.evaluate(on => { Object.defineProperty(document, 'visibilityState', { value: on ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, on);
{
  const { ctx, p, errs, api } = await open({ user: ADM, phone: { width: 393, height: 852 }, hash: '#serveur', before: async c => { await c.addInitScript(() => { window.__hcEvery = 700; }); } });
  await dash(p); await p.waitForSelector('#health .hvd');
  assert.equal(await curTab(p), 'serveur');
  const ping = await (await fetch(`http://127.0.0.1:${PORT}/__ping`)).json();
  assert.match(await txt(p, '#health .hvd'), /^Serveur (en forme|à surveiller) Actualiser Relu à \d\d:\d\d · de nouveau toutes les 1 s tant que cet onglet est affiché /);
  assert.match(await txt(p, '#health .hvd'), /Plafond de mémoire de l'offre inconnu : indique-le dans SERVER_MEM_MB/);
  assert.equal(await p.$eval('#health .hfold', d => d.open), false, '« Quand envisager un VPS ? » replié d\'office');
  await p.click('#health .hfold > summary'); assert.match(await txt(p, '#health .hvps'), /70 % du plafond .*Redémarrages imprévus .*JOB_MAX_RUNNING.*EDH_DATA_DIR/);
  const mem = await txt(p, '#hcMem');
  assert.match(mem, /^Mémoire plafond inconnu Mémoire du processus \(rss\) [\d,]+ Mo /); assert.match(mem, /Mémoire de Node \(tas\) [\d,]+ Mo \/ [\d,]+ Mo utilisé \/ réservé · limite de Node/);
  for (const [l, v] of [['Catalogues CardTrader', 'CACHE_MAX_MB'], ['Offres CardTrader', 'OFFERS_CACHE_MB'], ['Résultats des recherches', 'JOB_RESULTS_MB'], ['Listes des échanges en direct', 'TROC_MB'], ['Parties en cours (au plus)', 'PARTIE_LIVE_KB'], ['Historiques des parties', 'PARTIE_CACHE_MB'], ['Amis', 'FRIENDS_CACHE_MB']]) assert.ok(mem.includes(l) && mem.includes(v), 'cache ' + l);
  assert.match(mem, /Catalogues CardTrader 0 o \/ 48 Mo/); assert.equal(await p.$eval('#hcMem [data-k="c-ct"] .hbar i', i => i.style.width), '0%');
  const boot = await txt(p, '#hcBoot'); assert.ok(boot.includes('Version servie ' + ping.build), 'version de /__ping'); assert.match(boot, /Node v\d+/); assert.match(boot, /Dernier démarrage \d+ \S+ \d\d:\d\d en marche depuis \d+ min/); assert.match(boot, /Redémarrages imprévus \(24 h\) 0 /);
  assert.equal(await p.$$eval('#hcReq .hf', e => e.length), 9, '9 familles de routes');
  assert.match(await txt(p, '#hcReq'), /Page et fichiers \d+ Prix et recherches CardTrader \d+ Alertes de prix \d+ Échange en direct \d+ Parties \(compteur de vie\) \d+ Carte mystère \d+ Discord et avis \d+ Administration [1-9]\d* Autres/);
  assert.match(await txt(p, '#hcReq'), /pic de l'heure : \d+ \/ min/);
  assert.match(await txt(p, '#hcLive'), /Échanges en direct ouverts 0 \/ 300 0 à deux .*Recherches CardTrader en cours 0 \/ 8 aucune refusée en 1 h .*Requêtes vers CardTrader 0 \/ 12 0 en file d'attente/);
  assert.match(await txt(p, '#hcDisk'), /Dossier des données (\(à surveiller\) )?\d+ fichiers? · .*Plus ancien fichier .*Si cette date se remet à aujourd'hui après chaque déploiement, le disque est vidé/);
  assert.match(await txt(p, '#hcHist'), /^Historique des prix coupé/);
  // relu tout seul sur l'onglet, plus ailleurs ni page cachée ; « Actualiser » : dossier relu (?disk=1)
  const n0 = healthCalls(api); await sleep(1700); const n1 = healthCalls(api); assert.ok(n1 >= n0 + 2, 'relu sur l\'onglet (' + n0 + ' → ' + n1 + ')');
  await tab(p, 'journal'); await sleep(300); const n2 = healthCalls(api); await sleep(1500); assert.equal(healthCalls(api), n2, 'autre onglet : plus relu');
  await hidden(p, true); await tab(p, 'serveur'); await sleep(300); const n3 = healthCalls(api); await sleep(1500); assert.equal(healthCalls(api), n3, 'page cachée : plus relu');
  await hidden(p, false); await sleep(1600); assert.ok(healthCalls(api) >= n3 + 1, 'page revenue : relu');
  await p.click('#hcGo'); await sleep(400); assert.ok(api.includes('GET /api/admin/server?disk=1'), '« Actualiser » : dossier relu');
  await noOverflow(p, 393, 'Serveur 393 px'); await noJunk(p, 'Serveur');
  assert.deepEqual(errs, []); await ctx.close();
  ok('Serveur : avis, mémoire (rss, tas, plafond inconnu), 7 caches et leurs plafonds, démarrage et version (= /__ping), 9 familles de requêtes et pic, en direct, disque (phrase sur les déploiements), historique coupé ; relu sur l\'onglet seulement et page visible, « Actualiser » (?disk=1) ; 393 px');
}
{
  // serveur saturé (réponse retouchée) : avis rouge, indicateurs rouges comptés dans la pastille de l'onglet, couleurs claires et sombres
  const sat = b => ({ ...b, mem: { ...b.mem, limit: Math.round(b.mem.rss / 0.9), from: 'env' }, lv: { ...b.lv, rss: 'bad', restarts: 'bad', jobs: 'warn' }, vps: { lv: 'bad', bad: ['rss', 'restarts'], warn: ['jobs'] },
    boot: { ...b.boot, restarts24: 6, deploys24: 1, known: 3, recent: [{ t: Date.now() - 600e3, b: 'abc', k: 'crash' }, { t: Date.now() - 3600e3, b: 'abc', k: 'deploy' }, { t: Date.now() - 7200e3, b: 'old', k: '' }] },
    live: { ...b.live, jobs: { ...b.live.jobs, busy: 3, busyAt: Date.now() - 120e3 } } });
  for (const dark of [false, true]) {
    const { ctx, p, errs } = await open({ user: ADM, phone: { width: 360, height: 780 }, hash: '#serveur', dark, before: routeHealth(sat) });
    await dash(p); await p.waitForSelector('#health .hvd[data-v="bad"]');
    assert.match(await txt(p, '#health .hvd'), /^Serveur saturé .*Signes de saturation : mémoire proche du plafond de l'offre, redémarrages imprévus \(plantages\)\. Si ça se répète plusieurs jours, un VPS/);
    assert.doesNotMatch(await txt(p, '#health .hvd'), /Plafond de mémoire de l'offre inconnu/);
    assert.match(await txt(p, '#hcMem [data-k="rss"]'), /\(à traiter\) [\d,]+ Mo · 90 %/); assert.equal(await p.$eval('#hcMem [data-k="rss"] .hbar i', i => i.style.width), '90%');
    assert.match(await txt(p, '#hcBoot [data-k="restarts"]'), /Redémarrages imprévus \(24 h\) \(à traiter\) 6 plantage, mémoire, processus tué · en 24 h aussi : 1 déploiement/);
    assert.match(await txt(p, '#hcLive [data-k="jobs"]'), /3 refusées \(serveur complet\) en 1 h, la dernière il y a 2 min/);
    await p.click('#hcBoot .hboots > summary'); assert.match(await txt(p, '#hcBoot .hboots'), /abc · imprévu .*abc · nouvelle version .*old$/);
    const col = await p.evaluate(() => {
      const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), c = s => getComputedStyle(document.querySelector(s)).backgroundColor, t = document.createElement('i'); document.body.append(t);
      const rgb = x => { t.style.color = x; return getComputedStyle(t).color; };
      const out = { bad: c('#hcMem [data-k="rss"] .hdot') === rgb(v('--bad')), warn: c('#hcLive [data-k="jobs"] .hdot') === rgb(v('--warn')), ok: c('#hcLive [data-k="troc"] .hdot') === rgb(v('--good')) }; t.remove(); return out;
    });
    assert.deepEqual(col, { bad: true, warn: true, ok: true }, 'couleurs des niveaux');
    const nBad = await p.$$eval('#srv dd.bad, #health .hi[data-lv="bad"]', e => e.length); assert.ok(nBad >= 2); assert.equal(await badgeOf(p, 'serveur'), String(nBad), 'pastille : points en rouge');
    assert.match(await p.$eval('#t-serveur', e => e.textContent), /points à regarder/);
    await noOverflow(p, 360, 'Serveur saturé 360 px'); await noJunk(p, 'Serveur saturé');
    assert.deepEqual(errs, []); await ctx.close();
  }
  ok('serveur saturé (simulé) : « Serveur saturé », avis VPS avec les signaux, rss 90 % en rouge, redémarrages, recherches refusées en orange, derniers démarrages (redémarrage / nouvelle version), couleurs ok / warn / bad, pastille de l\'onglet ; 360 px clair et sombre');
}
/* Captures de l'onglet Serveur (393 et 1280 px, clair et sombre ; saturé à 393 px clair), chiffres d'un serveur occupé simulés : ADMIN_SRV_SHOTS=<dossier> (ou ADMIN_SHOTS) */
if (process.env.ADMIN_SRV_SHOTS || process.env.ADMIN_SHOTS) {
  const dir = process.env.ADMIN_SRV_SHOTS || process.env.ADMIN_SHOTS; mkdirSync(dir, { recursive: true });
  const PART = { ct: 0.62, offers: 0.93, jobs: 0.21, troc: 0.04, ptlive: 0.03, pthist: 0.12, amis: 0.35 };
  const busy = b => ({ ...b, mem: { ...b.mem, limit: Math.round(b.mem.rss / 0.74), from: 'env' }, lv: { ...b.lv, rss: 'warn', hist: 'ok' }, vps: { lv: 'warn', bad: [], warn: ['rss'] },
    req: { ...b.req, total: 412, win: 60, peak: { n: 655, at: Date.now() - 1500e3 }, all: 182455, fams: { page: 120, prix: 96, alertes: 14, troc: 22, partie: 61, mystere: 47, discord: 3, admin: 9, autres: 40 } },
    caches: b.caches.map(c => ({ ...c, used: c.max ? Math.round(c.max * PART[c.k]) : c.k === 'files' ? 4.2e6 : 3.1e6, n: c.max ? 40 : 6, lv: c.k === 'offers' ? 'warn' : c.lv })),
    live: { ...b.live, troc: { open: 7, two: 4, max: 300 }, partie: { ...b.live.partie, open: 12, live: 9, phones: 31 }, jobs: { ...b.live.jobs, run: 3 }, up: { active: 2, conc: 12, queue: 0 } },
    hist: { on: true, from: 'GitHub', d0: '2026-09-25', d1: '2026-10-24', days: 30, cards: 31250, bytes: 2.4e6, check: new Date(Date.now() - 2400e3).toISOString(), err: '' } });
  const sature = b => { const x = busy(b); return { ...x, lv: { ...x.lv, rss: 'bad', restarts: 'bad', lag: 'warn' }, vps: { lv: 'bad', bad: ['rss', 'restarts'], warn: ['lag'] }, mem: { ...x.mem, limit: Math.round(x.mem.rss / 0.91) }, boot: { ...x.boot, restarts24: 5 } }; };
  for (const [name, vp] of [['393', null], ['1280', { width: 1280, height: 900 }]]) for (const dark of [false, true]) for (const [kind, patch] of [['', busy], ...(name === '393' && !dark ? [['-sature', sature]] : [])]) {
    const { ctx, p } = await open({ user: ADM, vp: vp || undefined, phone: vp ? undefined : { width: 393, height: 852 }, dark, dpr: 1, hash: '#serveur', before: routeHealth(patch) });
    await dash(p); await p.waitForSelector('#health .hvd'); await p.evaluate(() => { document.querySelector('#health .hfold').open = true; document.activeElement.blur(); scrollTo(0, 0); }); await p.waitForTimeout(400);
    await p.screenshot({ path: join(dir, `serveur-${name}-${dark ? 'sombre' : 'clair'}${kind}.png`), fullPage: true });
    await ctx.close();
  }
  ok('captures de l\'onglet Serveur dans ' + dir);
}

/* ── 360 px, clair et sombre : chaque onglet sans défilement de côté, cibles des onglets ≥ 44 px, ni « null » ni « undefined » ───────── */
for (const dark of [false, true]) {
  DC.mode = 'on'; DC.sent = dcOld(); TH.mode = 'on'; TH.list = thSeed(); DY.mode = 'on'; DYS = dySeed(); EVT.mode = 'on'; EVS = evSeed();
  const { ctx, p, errs } = await open({ user: ADM, before: ALL, phone: { width: 360, height: 740 }, dark });
  await dash(p); await p.waitForSelector('#kpis [data-k="pseudos"]'); await p.waitForSelector('#dcCh', { state: 'attached' }); await p.waitForSelector('#thList', { state: 'attached' });
  assert.ok(await p.$$eval('#tabl .tab', e => e.every(x => x.getBoundingClientRect().height >= 44)), 'onglets : 44 px de haut au moins');
  assert.ok(await p.$eval('#tabl', e => e.scrollWidth > e.clientWidth), '360 px : la barre défile de côté');
  for (const k of TAB_ORDER) {
    await tab(p, k); await p.waitForTimeout(60);
    assert.ok(await p.$eval('#t-' + k, b => { const r = b.getBoundingClientRect(), l = b.parentElement.getBoundingClientRect(); return r.left >= l.left - 1 && r.right <= l.right + 1; }), k + ' : onglet choisi ramené dans la barre');
    await noOverflow(p, 360, k + (dark ? ' sombre' : ' clair') + ' 360 px'); await noJunk(p, k);
  }
  assert.deepEqual(errs, []); await ctx.close();
  ok('360 px ' + (dark ? 'sombre' : 'clair') + ' : les ' + TAB_ORDER.length + ' onglets sans défilement de côté ni texte parasite, onglet choisi ramené dans la barre, cibles ≥ 44 px');
}

/* ── Captures (ADMIN_SHOTS=<dossier>) : chaque onglet, 1280 et 390 px, clair et sombre ────────────────────────────────────────────── */
if (process.env.ADMIN_SHOTS) {
  const dir = process.env.ADMIN_SHOTS; mkdirSync(dir, { recursive: true });
  for (const [name, vp] of [['1280', { width: 1280, height: 900 }], ['390', null]]) for (const dark of [false, true]) {
    DC.sent = dcOld(); TH.list = thSeed(); TH.msgs = {}; DYS = dySeed(); EVT.mode = 'on'; EVS = evSeed();
    const { ctx, p } = await open({ user: ADM, before: ALL, vp: vp || undefined, phone: vp ? undefined : { width: 390, height: 844 }, dark, dpr: 1 });
    await dash(p); await p.waitForSelector('#kpis [data-k="pseudos"]'); await p.waitForSelector('#dcCh', { state: 'attached' }); await p.waitForSelector('#thList .thi', { state: 'attached' });
    for (const k of TAB_ORDER) {
      await tab(p, k); await p.waitForTimeout(250);
      if (k === 'discord') { await p.fill('#dcTxt', '📢 **Nouveauté** : le scan lit maintenant les cartes japonaises.\nÀ essayer dans la 1.0.12 !'); await p.check('[data-role="202"]'); }
      await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await p.waitForTimeout(80);
      await p.screenshot({ path: join(dir, `${name}-${dark ? 'sombre' : 'clair'}-${k}.png`), fullPage: true });
      if (k === 'fils') { await p.click('#thList .thi[data-id="700"]'); await p.waitForSelector('#thDet .thm'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(250); await p.screenshot({ path: join(dir, `${name}-${dark ? 'sombre' : 'clair'}-fils-fil.png`), fullPage: true }); await p.goBack(); }
    }
    await ctx.close();
  }
  ok('captures dans ' + dir);
}
await browser.close();
console.log('\nADMIN E2E OK');
process.exit(0);
