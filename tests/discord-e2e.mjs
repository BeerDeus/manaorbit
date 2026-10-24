// E2E invitation au Discord et liaison du compte Discord (src/dsclink.js ; serveur : tests/test-discord-srv.mjs) : bloc « Rejoins le Discord de Mana Orbit »
// de l'accueil (juste après le bloc des parties, le compteur de vie, aussi sur ordinateur ; « Rejoindre » : invitation exacte, onglet à part ; ✕ : caché 30 jours sur l'appareil,
// revenu après ; sans compte : ni liaison ni appel au serveur) ; connecté : « J'y suis déjà : lier mon compte Discord » (POST api/discord/link avec le jeton,
// onglet dirigé vers l'adresse de Discord), retour sur l'appli (visibilitychange) : lié et membre → caché, lié pas membre → affiché sans le bouton de liaison ;
// cache de l'appareil (pas de clignotement le temps de la réponse) ; serveur sans liaison (/__ping discordLink absent) : Rejoindre seul, aucun appel ;
// Compte et réglages : ligne « Discord » (Lier, pseudo, « Pas membre du serveur »), feuille (lier, délier, rejoindre), mode streamer sans la ligne ; anglais ;
// 360 px sans débordement. /__ping et api/discord/* simulés par page.route (port 19815).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome, openMe, closeSheets, signInFake } from './e2e-world.mjs';

const world = await startWorld({ port: 19815 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const INVITE = 'https://discord.gg/TTwrP94agb', AUTH = 'https://discord.com/oauth2/authorize?response_type=code&client_id=950000000000000001&scope=identify&state=abc&prompt=consent';
const errsAll = [];

/** Page de l'appli ; o.link (défaut true) : /__ping avec discordLink ; api/discord/* simulés : dl.me (réponse de /me), dl.calls ({ m, sub, tok }), dl.delay (ms avant /me). */
async function page(o = {}) {
  const dl = { me: { linked: false }, calls: [], delay: 0, link: { status: 200, json: { url: AUTH } } };
  const pg = await newPage(browser, world, { goto: false, ...(o.ctx ? { ctx: o.ctx } : {}), init: o.init });
  await pg.p.route(u => new URL(u).pathname.endsWith('/__ping'), async route => { const r = await route.fetch(), j = await r.json(); return route.fulfill({ response: r, json: { ...j, ...(o.link === false ? {} : { discordLink: true }) } }); });
  await pg.p.route(u => /\/api\/discord\//.test(new URL(u).pathname), async route => {
    const req = route.request(), sub = new URL(req.url()).pathname.split('/api/discord/')[1];
    dl.calls.push({ m: req.method(), sub, tok: req.headers()['x-firebase-token'] || '', ct: req.headers()['content-type'] || '' });
    if (sub === 'me') { if (dl.delay) await new Promise(r => setTimeout(r, dl.delay)); return route.fulfill({ status: 200, json: dl.me }); }
    if (sub === 'link') return route.fulfill({ status: dl.link.status, json: dl.link.json });
    if (sub === 'unlink') { dl.me = { linked: false }; return route.fulfill({ status: 200, json: { ok: true } }); }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
  await pg.ctx.route(/^https:\/\/(discord\.gg|discord\.com)\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Discord</title>' }));
  await pg.p.goto(world.url + (o.path || '')); await pg.p.waitForTimeout(700);
  await pg.p.waitForFunction(() => CTX.proxy === true && !!document.getElementById('hmPartie'), null, { timeout: 8000 });
  errsAll.push(pg.errs);
  return { ...pg, dl };
}
const shown = p => p.$eval('#hmDiscord', e => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 40);
/** Compte factice avec un jeton (signInFake : getIdToken lit window.__idTok). */
const signIn = async p => { await p.evaluate(() => { window.__idTok = 'jeton-firebase-test'; }); await signInFake(p, { uid: 'u-dsc-1' }); };
const backToApp = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));      // retour sur l'appli (document.hidden reste false sous Playwright)

/* ── 1) Sans compte : bloc après les parties, Rejoindre, ✕ pour 30 jours ───────────────────────────────────────────── */
{
  const { p, ctx, dl } = await page();
  await toHome(p);
  assert.equal(await shown(p), true, 'bloc affiché sans compte');
  assert.equal(await p.$eval('#hmDiscord', e => e.previousElementSibling && e.previousElementSibling.id), 'hmPartie', 'juste après le bloc des parties (compteur de vie)');
  assert.equal(await p.$eval('#hmPartie', e => e.previousElementSibling && e.previousElementSibling.id), 'hmTrade', 'les parties sous l\'Échange');
  assert.equal(await txt(p, '#hmDscT'), 'Rejoins le Discord de Mana Orbit');
  assert.equal(await txt(p, '#hmDiscord .hm-dsc-sub'), 'Bugs, idées, parties, Carte mystère : on en parle là-bas.');
  assert.deepEqual(await p.$eval('#hmDiscord a[data-dl="join"]', a => [a.href, a.target, a.rel, a.textContent.trim()]), [INVITE, '_blank', 'noopener', 'Rejoindre']);
  assert.equal(await p.$eval('#hmDiscord [data-dl="link"]', b => b.hidden), true, 'sans compte : pas de liaison');
  assert.equal(dl.calls.length, 0, 'sans compte : rien demandé au serveur');
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('#hmDiscord a[data-dl="join"]')]);
  await pop.waitForLoadState(); assert.equal(pop.url(), INVITE, 'Rejoindre : l\'invitation, dans un onglet à part'); await pop.close();
  for (const w of [360, 390]) {
    await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(150);
    assert.deepEqual(await p.evaluate(() => { const b = document.getElementById('hmDiscord').getBoundingClientRect(), x = document.querySelector('#hmDiscord .hm-dsc-x').getBoundingClientRect(); return [document.documentElement.scrollWidth <= innerWidth, b.right <= innerWidth + 0.5, x.right <= b.right + 0.5, x.width >= 32]; }), [true, true, true, true], w + ' px : rien ne déborde');
  }
  await p.click('#hmDiscord [data-dl="x"]');
  assert.equal(await shown(p), false, '✕ : caché');
  const until = await p.evaluate(() => Number(localStorage.getItem('deckdeal:dsc-x')));
  assert.ok(Math.abs(until - Date.now() - 30 * 86400e3) < 60e3, 'caché 30 jours sur l\'appareil');
  assert.match(await txt(p, '#toast'), /masquée pendant 30 jours/);
  await p.reload(); await p.waitForFunction(() => CTX.proxy === true && !!document.getElementById('hmPartie'), null, { timeout: 8000 });
  assert.equal(await shown(p), false, 'toujours caché après un rechargement');
  await p.evaluate(() => { localStorage.setItem('deckdeal:dsc-x', String(Date.now() - 1000)); dlPaint(); });
  assert.equal(await shown(p), true, '30 jours passés : revenu');
  await ctx.close();
}
ok('sans compte : bloc « Rejoins le Discord de Mana Orbit » juste après le bloc des parties (compteur de vie), Rejoindre (invitation exacte, onglet à part), pas de liaison ni d\'appel au serveur ; ✕ : caché 30 jours (rechargement compris), revenu ensuite ; 360 et 390 px sans débordement');

/* ── 2) Connecté : lier, retour sur l'appli, membre → caché ; pas membre → affiché ───────────────────────────────────────── */
{
  const { p, ctx, dl } = await page();
  await signIn(p); await toHome(p);
  await p.waitForFunction(() => !document.querySelector('#hmDiscord [data-dl="link"]').hidden, null, { timeout: 5000 });
  assert.deepEqual(dl.calls.filter(c => c.sub === 'me').map(c => [c.m, c.tok]), [['GET', 'jeton-firebase-test']], 'état lu une fois, avec le jeton du compte');
  assert.equal(await txt(p, '#hmDiscord [data-dl="link"]'), 'J\'y suis déjà : lier mon compte Discord');
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('#hmDiscord [data-dl="link"]')]);
  await pop.waitForURL(u => u.href.startsWith('https://discord.com/oauth2/authorize'), { timeout: 5000 });
  assert.equal(pop.url(), AUTH, 'onglet dirigé vers l\'adresse d\'autorisation du serveur');
  assert.deepEqual(dl.calls.filter(c => c.sub === 'link').map(c => [c.m, c.tok, /^application\/json/.test(c.ct)]), [['POST', 'jeton-firebase-test', true]]);
  assert.equal(await pop.evaluate(() => window.opener), null, 'onglet sans accès à l\'appli (opener)');
  await pop.close();
  dl.me = { linked: true, name: 'Jeanne', member: true }; await backToApp(p);
  await p.waitForFunction(() => document.getElementById('hmDiscord').hidden, null, { timeout: 5000 });
  assert.equal(await shown(p), false, 'lié et membre : caché');
  const cache = await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:dsc:v1')));
  assert.deepEqual([cache.l, cache.m, cache.n, typeof cache.u, JSON.stringify(cache).includes('u-dsc-1')], [true, true, 'Jeanne', 'string', false], 'gardé sur l\'appareil (empreinte du compte, jamais l\'identifiant)');
  const n0 = dl.calls.length; await backToApp(p); await p.waitForTimeout(300);
  assert.equal(dl.calls.length, n0, 'retour sur l\'appli dans les 30 s : pas relu');
  dl.me = { linked: true, name: 'Jeanne', member: false }; await p.evaluate(() => { DL.at = 0; }); await backToApp(p);
  await p.waitForFunction(() => !document.getElementById('hmDiscord').hidden, null, { timeout: 5000 });
  assert.equal(await txt(p, '#hmDiscord .hm-dsc-sub'), 'Ton compte Discord est lié, mais tu n\'es pas encore sur le serveur.');
  assert.equal(await p.$eval('#hmDiscord [data-dl="link"]', b => b.hidden), true, 'lié pas membre : Rejoindre seul');
  assert.equal(await p.$eval('#hmDiscord a[data-dl="join"]', a => a.offsetParent !== null), true);
  // cache : pas de clignotement le temps de la réponse (membre en cache, réponse lente)
  await p.evaluate(() => { const s = { ...DL.st, m: true }; dlSave(s); dlPaint(); });
  dl.delay = 1500; dl.me = { linked: true, name: 'Jeanne', member: true };
  await p.evaluate(() => { DL.st = null; dlCheck(true); });
  assert.equal(await shown(p), false, 'état de l\'appareil : caché avant la réponse');
  await p.waitForTimeout(1700); assert.equal(await shown(p), false); dl.delay = 0;
  // liaison refusée par le serveur : onglet refermé, message
  dl.me = { linked: false }; await p.evaluate(() => dlCheck(true)); await p.waitForFunction(() => !document.querySelector('#hmDiscord [data-dl="link"]').hidden);
  dl.link = { status: 429, json: { error: 'rate_limited' } };
  const pops = []; p.on('popup', x => pops.push(x));
  await p.click('#hmDiscord [data-dl="link"]'); await p.waitForTimeout(500);
  assert.match(await txt(p, '#toast'), /Trop d'essais/); assert.ok(pops.every(x => x.isClosed()), 'onglet ouvert pour rien : refermé');
  await ctx.close();
}
ok('connecté : « J\'y suis déjà : lier mon compte Discord » (POST api/discord/link avec le jeton, onglet dirigé vers Discord, sans opener) ; retour sur l\'appli : lié et membre → caché (gardé sur l\'appareil, sans l\'identifiant), relu au plus toutes les 30 s ; lié pas membre → affiché, Rejoindre seul ; cache sans clignotement ; refus (429) : onglet refermé, message');

/* ── 3) Compte et réglages : ligne « Discord » et sa feuille ; mode streamer ; serveur sans liaison ─────────────────────────── */
{
  const { p, ctx, dl } = await page();
  await signIn(p); await p.waitForFunction(() => DL.st && DL.st.l === false, null, { timeout: 5000 });
  await openMe(p);
  assert.deepEqual(await p.$eval('#meDsc', r => [r.querySelector('.me-t').textContent, r.querySelector('.me-v').textContent, r.closest('.me-g').previousElementSibling.textContent]), ['Discord', 'Lier', 'Mon compte']);
  await p.click('#meDsc'); await p.waitForSelector('.dl-sheet.open');
  assert.match(await txt(p, '.dl-sheet .sheet-body'), /Compte Discord non lié/); assert.match(await txt(p, '.dl-sheet .sheet-body'), /Seuls ton identifiant et ton pseudo Discord sont gardés/);
  assert.deepEqual(await p.$$eval('.dl-sheet .sheet-foot .btn', l => l.map(b => b.textContent.trim())), ['Rejoindre', 'Lier mon compte Discord']);
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('.dl-sheet [data-dls="link"]')]);
  await pop.waitForURL(u => u.href.startsWith('https://discord.com/'), { timeout: 5000 }); await pop.close();
  dl.me = { linked: true, name: 'Jeanne <b>', member: true }; await backToApp(p);
  await p.waitForFunction(() => { const v = document.querySelector('#meDsc .me-v'); return v && v.textContent === 'Jeanne <b>'; }, null, { timeout: 5000 });
  assert.equal(await p.$eval('#meDsc .me-v', v => v.classList.contains('warn')), false, 'pseudo lié (échappé)');
  dl.me = { linked: true, name: 'Jeanne', member: false }; await p.evaluate(() => dlCheck(true));
  await p.waitForFunction(() => document.querySelector('#meDsc .me-v').textContent === 'Pas membre du serveur', null, { timeout: 5000 });
  assert.equal(await p.$eval('#meDsc .me-v', v => v.classList.contains('warn')), true, 'pas membre : signalé');
  await p.click('#meDsc'); await p.waitForSelector('.dl-sheet.open');
  await p.waitForFunction(() => /Lié à Jeanne/.test(document.querySelector('.dl-sheet .sheet-body').textContent));
  assert.match(await txt(p, '.dl-sheet .sheet-body'), /Pas encore membre du serveur/);
  assert.deepEqual(await p.$$eval('.dl-sheet .sheet-foot .btn', l => l.map(b => [b.textContent.trim(), b.getAttribute('href')])), [['Délier', null], ['Rejoindre', INVITE]]);
  await p.click('.dl-sheet [data-dls="unlink"]');
  await p.waitForFunction(() => !document.querySelector('.dl-sheet.open'), null, { timeout: 5000 });
  assert.match(await txt(p, '#toast'), /Compte Discord délié/); assert.deepEqual(dl.calls.filter(c => c.sub === 'unlink').map(c => [c.m, c.tok]), [['POST', 'jeton-firebase-test']]);
  await p.waitForFunction(() => document.querySelector('#meDsc .me-v').textContent === 'Lier', null, { timeout: 5000 });
  await closeSheets(p); await toHome(p); assert.equal(await shown(p), true, 'délié : l\'invitation revient');
  // mode streamer : ni la ligne ni le pseudo
  dl.me = { linked: true, name: 'PseudoSecret', member: false }; await p.evaluate(() => dlCheck(true)); await p.waitForFunction(() => DL.st && DL.st.n === 'PseudoSecret');
  await p.evaluate(() => { OPN.cur = { id: 'o1', name: 'Test', at: Date.now(), paid: 0, st: false, rows: [] }; opnStreamer(true); });
  await openMe(p); assert.equal(await p.$('#meDsc'), null, 'mode streamer : pas de ligne Discord');
  assert.doesNotMatch(await txt(p, '.me-sheet'), /PseudoSecret/); assert.doesNotMatch(await txt(p, '#viewHome'), /PseudoSecret/);
  await closeSheets(p);
  await ctx.close();
}
{
  const { p, ctx, dl } = await page({ link: false });
  await signIn(p); await toHome(p); await p.waitForTimeout(400);
  assert.equal(await shown(p), true); assert.equal(await p.$eval('#hmDiscord [data-dl="link"]', b => b.hidden), true, 'serveur sans liaison : Rejoindre seul');
  await openMe(p); assert.equal(await p.$('#meDsc'), null, 'ni ligne Discord');
  assert.equal(dl.calls.length, 0, 'rien demandé au serveur');
  await ctx.close();
}
ok('Compte et réglages : ligne « Discord » dans Mon compte (Lier, pseudo échappé, « Pas membre du serveur » signalé), feuille (non lié : Rejoindre / Lier ; lié : Délier / Rejoindre ; texte sur ce qui est gardé), Délier → POST unlink, invitation revenue ; mode streamer : ni ligne ni pseudo ; serveur sans liaison : Rejoindre seul, aucune ligne, aucun appel');

/* ── 4) Anglais, ordinateur ─────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const { p, ctx } = await page({ path: '?lang=en' });
  assert.equal(await txt(p, '#hmDscT'), 'Join the Mana Orbit Discord'); assert.equal(await txt(p, '#hmDiscord a[data-dl="join"]'), 'Join');
  assert.equal(await txt(p, '#hmDiscord .hm-dsc-sub'), 'Bugs, ideas, games, Mystery card: we talk about it there.');
  await signIn(p); await p.waitForFunction(() => !document.querySelector('#hmDiscord [data-dl="link"]').hidden, null, { timeout: 5000 });
  assert.equal(await txt(p, '#hmDiscord [data-dl="link"]'), 'I\'m already there: link my Discord account');
  await openMe(p); assert.equal(await txt(p, '#meDsc .me-v'), 'Link');
  await ctx.close();
}
{
  const { p, ctx } = await page({ ctx: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } });
  await toHome(p); await p.waitForSelector('.hm-cols .hm-c2 #hmDiscord');
  assert.deepEqual(await p.$$eval('.hm-c2 > *', l => l.map(e => e.id || e.className.split(' ')[0])).then(l => l.filter(x => ['hmTrade', 'hmDiscord', 'hmPartie'].includes(x))), ['hmTrade', 'hmPartie', 'hmDiscord'], 'ordinateur : dans la colonne du milieu, après les parties');
  assert.equal(await shown(p), true);
  await p.setViewportSize({ width: 800, height: 900 }); await p.waitForFunction(() => !document.querySelector('.hm-cols'));
  assert.equal(await p.$eval('#hmDiscord', e => e.previousElementSibling && e.previousElementSibling.id), 'hmPartie', 'fenêtre rétrécie : toujours après les parties');
  await ctx.close();
}
ok('anglais (titre, ligne, Join, liaison, Link) ; ordinateur : colonne du milieu après les parties, ordre gardé quand la fenêtre rétrécit');

const errs = errsAll.flat().filter(e => !/Firebase|firestore|gstatic|googleapis|ERR_|net::/i.test(e));
assert.deepEqual(errs, [], 'aucune erreur de page');
await browser.close(); world.stop();
console.log('OK discord-e2e');
process.exit(0);
