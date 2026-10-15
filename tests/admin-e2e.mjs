// E2E panneau d'administration (/admin) : vrai proxy.mjs branché sur les faux Firebase (jetons, OAuth2), Identity Toolkit et Firestore (admin-fakes.mjs),
// faux SDK Firebase servi à l'adresse du vrai (la CSP stricte de la page s'applique). Déconnecté : « Se connecter avec Google », aucune donnée demandée ;
// autre compte : « Accès réservé » et rien d'autre ; éditeur : chiffres, graphique des inscriptions, liste des comptes (tri, recherche, pages, en-têtes
// cliquables sur ordinateur), « Rafraîchir » ; déjà connecté dans l'appli : tableau de bord d'emblée ; sombre ; aucune erreur (CSP comprise).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
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
  assert.equal(await p.$$eval('#ulist tr[data-id]', e => e.length), 50); assert.equal(await txt(p, '#pager .pg'), 'Page 1 / 3'); assert.equal(await txt(p, '#uCount'), '(124)');
  assert.match(await txt(p, '#meta'), /source : Firebase Authentication \+ Firestore/);
  assert.match(await txt(p, '#mix'), /Google 123 · E-mail 1/); assert.match(await txt(p, '#srv'), /Serveur/); assert.match(await txt(p, '#srv'), /Échanges en direct/);
  assert.equal(await visible(p, '#acts'), true);
  const body = await p.evaluate(() => document.body.innerText);
  assert.ok(!/jeanne\.dupont@|Dupont|uid-/.test(body), 'page : ni e-mail complet, ni nom complet, ni UID');
  ok('changer de compte → éditeur : 9 chiffres (dont les scans signalés), inscriptions sur 30 jours (SVG, survol), 50 comptes, page 1 / 3, comptes, serveur ; rien d\'identifiant');

  // recherche, tri, pages
  await p.fill('#q', 'jeanne'); await p.waitForFunction(() => document.querySelectorAll('#ulist tr[data-id]').length === 1, null, { timeout: 5000 });
  const row = await p.$eval('#ulist tr[data-id]', tr => ({ who: tr.querySelector('.who').textContent, ...Object.fromEntries([...tr.querySelectorAll('td[data-l]')].map(td => [td.dataset.l, td.textContent.replace(/\s+/g, ' ').trim()])) }));
  assert.equal(row.who, 'JJeanne D.je•••@gmail.comGoogleFR');
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
  const { ctx, p, errs } = await open({ user: ADM, vp: { width: 1280, height: 900 }, dark: true });
  await dash(p);
  assert.equal(await p.evaluate(() => window.__popups || 0), 0, 'aucune fenêtre de connexion');
  assert.equal(await p.$eval('.ut thead', e => getComputedStyle(e).display), 'table-header-group', 'ordinateur : vrai tableau');
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 15, 28)', 'thème sombre');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForSelector('.ut th[data-sort="cards"].on'); await settle(p);
  const v = await p.$$eval('#ulist td[data-l="Cartes"] .v', e => e.map(x => Number(x.textContent.replace(/\s/g, ''))));
  assert.deepEqual(v, v.slice().sort((a, b) => b - a)); assert.equal(await p.$eval('#sort', s => s.value), 'cards');
  await p.click('.ut th[data-sort="cards"]'); await p.waitForFunction(() => document.querySelector('.ut th[data-sort="cards"]').getAttribute('aria-sort') === 'ascending', null, { timeout: 5000 });
  const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 1280, 'pas de défilement de côté (' + w + ')');
  assert.deepEqual(errs, []); await ctx.close();
  ok('déjà connecté dans l\'appli : tableau de bord sans fenêtre de connexion ; ordinateur : tableau, tri par en-tête (deux sens) ; thème sombre ; aucune erreur');
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
