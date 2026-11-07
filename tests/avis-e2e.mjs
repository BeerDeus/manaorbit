// E2E fils des avis côté appli (src/help.js ; serveur : tests/test-discord-forum.mjs) : nonce de l'envoi (tiré au premier « Envoyer », gardé dans le brouillon
// de la session — rechargement compris — et renvoyé tel quel après un échec ; oublié après le succès, l'avis suivant en a un autre) ; notification « Du nouveau
// sur ton avis » touchée (./?avis=<fil>&g=<serveur> : ouverture de l'appli, ou pushOpen appli ouverte) → feuille « Ton avis sur Discord » avec « Voir sur
// Discord » (lien exact, onglet à part) ; adresse mal formée : rien ; anglais. /__ping et api/feedback simulés par page.route (port 19864).
// Rapports d'erreur anonymes (src/errlog.js ; serveur : tests/test-errlog.mjs) : erreur et promesse rejetée → un envoi groupé (api/errlog simulé), sans donnée
// de collection ; arrière-plan → sendBeacon ; Réglages › Confidentialité › interrupteur coupé → plus rien.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, closeSheets, openMe } from './e2e-world.mjs';

const world = await startWorld({ port: 19864 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const errsAll = [], G = '910000000000000001', TH = '1300000000000000077', FIL = `https://discord.com/channels/${G}/${TH}`;

/** Page avec le bot annoncé (/__ping feedback: true) et api/feedback simulé : fb.calls (corps), fb.next (réponses suivantes : { status, json, abort }). */
async function page(o = {}) {
  const fb = { calls: [], next: [] };
  const pg = await newPage(browser, world, { goto: false, ...(o.ctx ? { ctx: o.ctx } : {}) });
  await pg.p.route(u => new URL(u).pathname.endsWith('/__ping'), async route => { const r = await route.fetch(), j = await r.json(); return route.fulfill({ response: r, json: { ...j, feedback: true } }); });
  await pg.p.route(u => new URL(u).pathname.endsWith('/api/feedback'), route => {
    const r = fb.next.shift() || { status: 200, json: { ok: true, url: FIL, id: TH } }; fb.calls.push(route.request().postDataJSON());
    return r.abort ? route.abort('connectionrefused') : route.fulfill({ status: r.status, json: r.json });
  });
  await pg.ctx.route(/^https:\/\/(discord\.gg|discord\.com)\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Discord</title>' }));
  await pg.p.goto(world.url + (o.path || '')); await pg.p.waitForTimeout(700);
  await pg.p.waitForFunction(() => CTX.feedback === true, null, { timeout: 8000 });
  errsAll.push(pg.errs);
  return { ...pg, fb };
}
const send = async p => { await p.click('.fb-sheet [data-fb="go"]'); await p.waitForFunction(() => { const b = document.querySelector('.fb-sheet [data-fb="go"]'); return !b || !b.disabled; }, null, { timeout: 10000 }); };
const kept = p => p.evaluate(() => JSON.parse(sessionStorage.getItem('deckdeal:fb') || 'null'));

/* ── 1) Nonce : gardé jusqu'au succès, même après un rechargement ───────────────────────────────────────────────────────── */
{
  const { p, ctx, fb } = await page();
  await p.evaluate(() => fbOpen()); await p.waitForSelector('.fb-sheet.open');
  await p.fill('#fbTitle', 'Le scan plante'); await p.fill('#fbText', 'Il plante au lancement.');
  fb.next.push({ abort: true }); await send(p);
  assert.match(await txt(p, '.fb-sheet .fb-err'), /injoignable|Hors ligne/, 'échec réseau : message, saisie gardée');
  const n1 = fb.calls[0].nonce;
  assert.match(n1, /^[\w-]{22}$/, 'nonce envoyé (16 octets en base64url)');
  assert.equal((await kept(p)).nonce, n1, 'gardé dans le brouillon de la session');
  fb.next.push({ status: 503, json: { error: 'unavailable', message: 'x' } }); await send(p);
  assert.equal(fb.calls[1].nonce, n1, 'nouvel essai : le même nonce');
  await p.reload(); await p.waitForFunction(() => CTX.feedback === true, null, { timeout: 8000 });
  await p.evaluate(() => fbOpen()); await p.waitForSelector('.fb-sheet.open');
  assert.equal(await p.inputValue('#fbTitle'), 'Le scan plante', 'brouillon repris après un rechargement');
  await send(p); await p.waitForSelector('.fb-sheet .fb-done');
  assert.equal(fb.calls[2].nonce, n1, 'après un rechargement : toujours le même envoi');
  assert.equal(await kept(p), null, 'succès : brouillon (et nonce) oublié');
  await closeSheets(p);
  await p.evaluate(() => fbOpen()); await p.waitForSelector('.fb-sheet.open');
  await p.fill('#fbTitle', 'Autre avis'); await p.fill('#fbText', 'Autre chose.'); await send(p); await p.waitForSelector('.fb-sheet .fb-done');
  assert.match(fb.calls[3].nonce, /^[\w-]{22}$/); assert.notEqual(fb.calls[3].nonce, n1, 'avis suivant : un autre nonce');
  await ctx.close();
}
ok('nonce : tiré au premier envoi, gardé dans le brouillon (rechargement compris) et renvoyé tel quel après un échec ; oublié après le succès, l\'avis suivant en a un autre');

/* ── 2) Notification touchée : ./?avis=<fil>&g=<serveur> ────────────────────────────────────────────────────────────────── */
{
  const { p, ctx } = await page({ path: `?avis=${TH}&g=${G}` });
  await p.waitForSelector('.fb-avis.open', { timeout: 5000 });
  assert.equal(await txt(p, '.fb-avis .sheet-head h2'), 'Ton avis sur Discord');
  assert.match(await txt(p, '.fb-avis .sheet-body'), /Du nouveau sur ton avis/);
  assert.deepEqual(await p.$eval('.fb-avis [data-fb="see"]', a => [a.href, a.target, a.rel, a.textContent.trim()]), [FIL, '_blank', 'noopener', 'Voir sur Discord'], 'le fil exact, onglet à part');
  assert.equal(await p.evaluate(() => location.search), '', 'adresse nettoyée');
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('.fb-avis [data-fb="see"]')]);
  await pop.waitForLoadState(); assert.equal(pop.url(), FIL); await pop.close();
  await p.waitForFunction(() => !document.querySelector('.fb-avis'), null, { timeout: 5000 });
  // appli ouverte : notification touchée (service worker → pushOpen)
  await p.evaluate(u => pushOpen(u), `./?avis=${TH}&g=${G}`); await p.waitForSelector('.fb-avis.open', { timeout: 5000 });
  await closeSheets(p);
  assert.equal(await p.evaluate(u => fbAvisOpen(u), './?avis=abc&g=1'), false, 'adresse mal formée : rien');
  await p.waitForTimeout(700); assert.equal(await p.$('.fb-avis'), null);
  await ctx.close();
}
{
  const { p, ctx } = await page({ path: `?lang=en&avis=${TH}&g=${G}` });
  await p.waitForSelector('.fb-avis.open', { timeout: 5000 });
  assert.equal(await txt(p, '.fb-avis .sheet-head h2'), 'Your feedback on Discord'); assert.equal(await txt(p, '.fb-avis [data-fb="see"]'), 'View on Discord');
  await ctx.close();
}
ok('notification « Du nouveau sur ton avis » touchée (./?avis=<fil>&g=<serveur>, au lancement ou appli ouverte) : feuille « Ton avis sur Discord », « Voir sur Discord » vers le fil exact ; adresse mal formée : rien ; anglais');

/* ── 3) Rapports d'erreur anonymes (src/errlog.js) : une erreur de la page → un rapport, sans donnée de collection ; réglage coupé → rien ───────────── */
{
  const { p, ctx } = await newPage(browser, world, { goto: false });      // erreurs lancées exprès : pas dans errsAll
  const got = [], hits = [];
  await ctx.addInitScript(() => {
    window.__errlogTest = true;      // sous Playwright (navigator.webdriver), rien ne part sans cette variable
    try { if (!localStorage.getItem('deckdeal:coll:v1')) localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring\n1 Edgar Markov', u: 1, s: '', b: null })); } catch (e) { /* ignore */ }
  });
  p.on('request', r => { if (new URL(r.url()).pathname.endsWith('/api/errlog')) hits.push({ type: r.resourceType(), body: r.postData() || '' }); });
  await p.route(u => new URL(u).pathname.endsWith('/api/errlog'), route => { got.push(route.request().postData() || ''); return route.fulfill({ status: 200, json: { ok: true } }); });
  // un script de la page (adresse avec query string) qui lève une erreur : son emplacement est connu
  await p.route(u => new URL(u).pathname.endsWith('/errtest.js'), route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__boom = function () {\n  throw new Error(\'Carte « Sol Ring » introuvable dans "Edgar Markov" pour jeanne@example.net\');\n};\n' }));
  await p.goto(world.url); await p.waitForTimeout(700);
  await p.waitForFunction(() => CTX.errlog === true && !S.demo && collCount() > 0, null, { timeout: 8000 });
  await p.evaluate(() => new Promise(ok => { const sc = document.createElement('script'); sc.src = 'errtest.js?u=secret'; sc.onload = ok; document.head.append(sc); }));
  await p.evaluate(() => {
    ERL.wait = 150;
    setTimeout(__boom, 0); setTimeout(__boom, 10);      // la même erreur deux fois : un seul rapport
    Promise.reject(new TypeError('Cannot read properties of undefined (reading \'name\')'));
  });
  await p.waitForFunction(() => !ERL.q.length && !ERL.t, null, { timeout: 5000 }); await p.waitForTimeout(300);
  assert.equal(got.length, 1, 'un seul envoi groupé'); assert.equal(hits[0].type, 'fetch', 'en différé : fetch keepalive');
  const body = JSON.parse(got[0]), [e1, e2] = body.r, build = await p.evaluate(() => DD_BUILD);
  assert.equal(body.r.length, 2, 'erreur et promesse rejetée ; la même erreur une fois');
  assert.equal(e1.m, 'Error: Carte «…» introuvable dans "…" pour [e-mail]', 'textes cités et e-mail retirés du message');
  assert.equal(e1.k, 'error'); assert.equal(e1.at, 'errtest.js:2:9', 'fichier:ligne:colonne, sans origine ni query string'); assert.match(e1.st, /^Error: Carte «…»/);
  assert.equal(e2.m, 'TypeError: Cannot read properties of undefined (reading \'name\')', 'nom de propriété gardé'); assert.equal(e2.k, 'rejection');
  for (const e of body.r) {
    assert.deepEqual(Object.keys(e).sort(), ['at', 'b', 'k', 'l', 'm', 'p', 'st', 't', 'v'], 'champs du rapport, rien d\'autre');
    assert.equal(e.b, build); assert.equal(e.l, 'fr'); assert.equal(e.p, 'web'); assert.equal(e.v, 'home'); assert.ok(Math.abs(e.t - Date.now()) < 60e3);
  }
  assert.ok(!/Sol Ring|Edgar|jeanne|127\.0\.0\.1|localhost|deckdeal|secret|uid|token/i.test(got[0]), 'ni carte, ni e-mail, ni adresse de la page, ni compte : ' + got[0].slice(0, 200));
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:errlog')).n), 2, 'comptés pour la borne du jour');
  // mise en arrière-plan : navigator.sendBeacon, sans attendre la minuterie
  await p.evaluate(() => { ERL.wait = 60e3; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); setTimeout(() => { throw new Error('arrière-plan'); }, 0); });
  await p.waitForFunction(() => ERL.q.length === 1, null, { timeout: 3000 });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(500);
  assert.equal(got.length, 2, 'rapport parti à la mise en arrière-plan'); assert.equal(hits[1].type, 'ping', 'par navigator.sendBeacon');
  assert.equal(JSON.parse(got[1]).r[0].m, 'Error: arrière-plan');
  await p.evaluate(() => { delete document.visibilityState; ERL.wait = 150; });
  // réglage coupé (Réglages › Confidentialité) : plus rien, même après un rechargement
  await openMe(p, 'conf'); await p.waitForSelector('#setErrRep');
  assert.equal(await p.isChecked('#setErrRep'), true, 'activé par défaut');
  assert.match(await txt(p, 'label[for="setErrRep"]'), /Envoyer les rapports d'erreur anonymes/);
  await p.click('label[for="setErrRep"]');
  assert.equal(await p.evaluate(() => [S.errRep, JSON.parse(localStorage.getItem('deckdeal:v1')).errRep].join()), 'false,false', 'gardé avec les réglages');
  await closeSheets(p);
  await p.evaluate(() => { setTimeout(() => { throw new Error('après le réglage'); }, 0); Promise.reject(new Error('rejet après le réglage')); });
  await p.waitForTimeout(600);
  await p.reload(); await p.waitForFunction(() => CTX.errlog === true, null, { timeout: 8000 });
  await p.evaluate(() => { ERL.wait = 100; setTimeout(() => { throw new Error('après rechargement'); }, 0); }); await p.waitForTimeout(600);
  assert.equal(await p.evaluate(() => S.errRep), false);
  assert.equal(got.length, 2, 'réglage coupé : aucun rapport'); assert.equal(hits.length, 2);
  await ctx.close();
}
ok('rapports d\'erreur anonymes : erreur et promesse rejetée → un envoi groupé en différé (fetch keepalive), la même erreur une fois, textes cités et e-mail retirés, champs minimaux (version, écran, langue, plateforme), rien de la collection ; arrière-plan : sendBeacon ; réglage coupé : plus rien, rechargement compris');

const errs = errsAll.flat().filter(e => !/Firebase|firestore|gstatic|googleapis|ERR_|net::/i.test(e));
assert.deepEqual(errs, [], 'aucune erreur de page');
await browser.close(); world.stop();
console.log('OK avis-e2e');
process.exit(0);
