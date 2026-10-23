// E2E fils des avis côté appli (src/help.js ; serveur : tests/test-discord-forum.mjs) : nonce de l'envoi (tiré au premier « Envoyer », gardé dans le brouillon
// de la session — rechargement compris — et renvoyé tel quel après un échec ; oublié après le succès, l'avis suivant en a un autre) ; notification « Du nouveau
// sur ton avis » touchée (./?avis=<fil>&g=<serveur> : ouverture de l'appli, ou pushOpen appli ouverte) → feuille « Ton avis sur Discord » avec « Voir sur
// Discord » (lien exact, onglet à part) ; adresse mal formée : rien ; anglais. /__ping et api/feedback simulés par page.route (port 19864).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, closeSheets } from './e2e-world.mjs';

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

const errs = errsAll.flat().filter(e => !/Firebase|firestore|gstatic|googleapis|ERR_|net::/i.test(e));
assert.deepEqual(errs, [], 'aucune erreur de page');
await browser.close(); world.stop();
console.log('OK avis-e2e');
process.exit(0);
