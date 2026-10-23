// E2E « Partager sur Discord » d'un deck public (src/pubdecks.js ; serveur : tests/test-discord-deck.mjs) : bouton dans la feuille « Publier » d'un deck publié
// (pas d'un deck non publié) et dans la feuille de son deck de « À monter » (pas sur le deck d'un autre) ; caché sans bot (/__ping feedback), hors ligne, en mode
// streamer, ou quand le serveur n'a pas la route (404 not_found) ; confirmation (pseudo de l'appli, ou compte Discord lié), POST api/discord/deck { id } avec le jeton,
// toast « Partagé sur Discord » et « Voir » (le message, onglet à part) ; déjà partagé, quota du jour ; lien du message (?pd=<id>) : le deck dans le viewer,
// deck retiré : la raison. /__ping, api/pubdecks et api/discord/* simulés par page.route (port 19836).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, startWorld, newPage, txt, ok, signInFake, closeSheets } from './e2e-world.mjs';

const world = await startWorld({ port: 19836 }); world.basics = true;
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const MSG = 'https://discord.com/channels/910000000000000001/930000000000000020/1300000000000007001';
const filler = (n, from = 0, w = 'Filler') => Array.from({ length: n }, (_, i) => `K\t1\t${w} ${from + i}`);
const FILE = ['#edh\t1\t2026-10-03T04:00:00Z', 'C\tedgar-markov\t12345\tWBR\tEdgar Markov', 'D\tedgar-markov\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/edgar-markov', 'K\t1\tSol Ring', 'K\t8\tPlains', ...filler(24)].join('\n');
const BOB = 'b'.repeat(64) + '_0';
const UID = 'u-dsc-deck-1', tag = createHash('sha256').update(UID).digest('hex'), MINE = tag + '_0';      // empreinte du compte (pubdecks.js › pdTag)
const many = (w, n) => Array.from({ length: n }, (_, i) => [w + ' ' + i, 1]), cards = [['Sol Ring', 1], ['Arcane Signet', 1], ...many('Max Card', 25), ['Plains', 72]];      // au moins 20 cartes hors terrains de base (À monter)
const S = { served: [{ id: MINE, by: 'Max', cmd: ['Edgar Markov'], ci: 'WBR', cards, u: '2026-10-20' }, { id: BOB, by: 'Bob', cmd: ['Edgar Markov'], ci: 'WBR', cards: [['Sol Ring', 1], ...many('Bob Card', 25), ['Plains', 73]], u: '2026-10-08' }], calls: [], reply: { status: 200, json: { ok: true, url: MSG } }, feedback: true };

const { p, ctx, errs } = await newPage(browser, world, { goto: false });
await p.route('**/edh.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: FILE }));
await p.route('**/api/pubdecks*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ at: Date.now(), decks: S.served }) }));
await p.route(u => new URL(u).pathname.endsWith('/__ping'), async route => { const r = await route.fetch(), j = await r.json(); return route.fulfill({ response: r, json: { ...j, feedback: S.feedback, pub: true } }); });
await p.route(u => /\/api\/discord\//.test(new URL(u).pathname), route => {
  const req = route.request(), sub = new URL(req.url()).pathname.split('/api/discord/')[1];
  if (sub !== 'deck') return route.fulfill({ status: 200, json: { linked: false } });
  S.calls.push({ m: req.method(), tok: req.headers()['x-firebase-token'] || '', ct: req.headers()['content-type'] || '', body: req.postDataJSON() });
  return route.fulfill({ status: S.reply.status, json: S.reply.json });
});
await ctx.route(/^https:\/\/discord\.com\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Discord</title>' }));
await p.goto(world.url); await p.waitForTimeout(700);
await p.waitForFunction(() => CTX.proxy === true && CTX.feedback === true && CTX.pub === true, null, { timeout: 8000 });
await p.evaluate(() => { window.__idTok = 'jeton-firebase-test'; });
await signInFake(p, { uid: UID });
await p.evaluate(() => profSave({ name: 'Max' }));
assert.equal(await p.evaluate(() => pdTag()), tag, 'empreinte du compte (SHA-256 de l\'UID)');

/* ── 1) Feuille « Publier » : bouton seulement pour un deck publié ─────────────────────────────── */
const text = 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n30 Plains\n30 Swamp\n37 Mountain';
const id = await p.evaluate(t => { const id = newIdFor(); putDeck(id, deckDoc({ name: 'Edgar de Max', text: t, opts: { ...S.opts } })); return id; }, text);
await p.waitForFunction(i => !!findDeck(i), id);
const pubSheet = async () => {
  await p.evaluate(i => { while (sheets.length) sheets[sheets.length - 1].close(); closeDeckViewer(); PD.mine = null; openDeckViewer({ id: i }); }, id);
  await p.waitForSelector('.dv.on .dv-pubb'); await p.click('.dv.on .dv-pubb'); await p.waitForSelector('.sheet-wrap.open .pub-checks');
  await p.waitForFunction(() => !/Lecture de tes decks publiés/.test(document.querySelector('.sheet-wrap.open .pub-checks').textContent));
};
const dscBtn = () => p.$('.sheet-wrap.open [data-pub="dsc"]');
await pubSheet();
assert.equal(await dscBtn(), null, 'deck pas encore publié : pas de bouton');
await p.evaluate(([t, i]) => { (window.__pubs || (window.__pubs = new Map())).set(t + '_0', { o: t, by: 'Max', deck: i, name: 'Edgar de Max', cmd: ['Edgar Markov'], ci: 'WBR', cards: [], updatedAt: Date.now(), v: 1 }); }, [tag, id]);
await pubSheet();
assert.ok(await dscBtn(), 'deck publié : « Partager sur Discord »');
assert.equal(await txt(p, '.sheet-wrap.open [data-pub="dsc"]'), 'Partager sur Discord');
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/dscdeck-1-publier.png' });

// confirmation, puis partage
await p.click('.sheet-wrap.open [data-pub="dsc"]'); await p.waitForSelector('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
assert.match(await txt(p, '.sheet-wrap.open.pub-dsc-sheet .sheet-body'), /posté dans le salon #decks du Discord de Mana Orbit.*Auteur : ton pseudo public de l'appli\..*Un même deck une fois par jour, 5 partages par jour au plus\./);
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/dscdeck-2-confirmer.png' });
assert.equal(S.calls.length, 0, 'rien d\'envoyé avant la confirmation');
await p.click('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
await p.waitForFunction(() => document.querySelector('#toast.on') && /Partagé sur Discord/.test(document.querySelector('#toast').textContent));
assert.deepEqual(S.calls, [{ m: 'POST', tok: 'jeton-firebase-test', ct: 'application/json', body: { id: MINE } }], 'POST api/discord/deck { id } avec le jeton');
assert.equal(await txt(p, '#toast .toast-act'), 'Voir');
await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open.pub-dsc-sheet'), null, { timeout: 3000 });      // confirmation fermée
const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('#toast .toast-act')]);
await pop.waitForLoadState(); assert.equal(pop.url(), MSG, '« Voir » : le message sur Discord, onglet à part'); await pop.close();
ok('feuille « Publier » : bouton pour un deck publié seulement ; confirmation (salon, auteur), POST avec le jeton, toast « Partagé sur Discord » et « Voir » (le message)');

// déjà partagé aujourd'hui ; quota ; compte Discord lié dans la confirmation
S.reply = { status: 200, json: { ok: true, url: MSG, again: true } };
await p.click('.sheet-wrap.open [data-pub="dsc"]'); await p.click('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
await p.waitForFunction(() => /Déjà partagé sur Discord aujourd'hui/.test(document.querySelector('#toast').textContent));
S.reply = { status: 429, json: { error: 'daily_limit', retry: 3600 } };
await p.evaluate(() => dlSave({ u: dlWho(), l: true, n: 'Jeanne', m: true, t: Date.now() }));
await p.click('.sheet-wrap.open [data-pub="dsc"]'); await p.waitForSelector('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
assert.match(await txt(p, '.sheet-wrap.open.pub-dsc-sheet .pub-dsc-who'), /^Auteur : ton compte Discord Jeanne \(mentionné, sans notification\)\.$/);
await p.click('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
await p.waitForFunction(() => /Assez de partages pour aujourd'hui : réessaie demain\./.test(document.querySelector('#toast').textContent));
assert.equal(await p.$eval('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]', b => b.disabled), false, 'refusé : la confirmation reste, le bouton revient');
await p.evaluate(() => sheets[sheets.length - 1].close()); await p.waitForTimeout(250);
ok('déjà partagé : « Déjà partagé sur Discord aujourd\'hui » ; 5 par jour : la raison ; compte Discord lié : nommé dans la confirmation');

/* ── 2) Caché : sans bot, hors ligne, mode streamer, route absente du serveur ──────────────────── */
await p.evaluate(() => { CTX.feedback = false; }); await pubSheet(); assert.equal(await dscBtn(), null, 'sans bot (/__ping feedback) : caché');
await p.evaluate(() => { CTX.feedback = true; }); await ctx.setOffline(true); await pubSheet(); assert.equal(await dscBtn(), null, 'hors ligne : caché');
await ctx.setOffline(false); await p.evaluate(() => { OPN.cur = { st: true, rows: [] }; }); await pubSheet(); assert.equal(await dscBtn(), null, 'mode streamer : caché');
await p.evaluate(() => { OPN.cur = null; }); await pubSheet(); assert.ok(await dscBtn(), 'de retour');
S.reply = { status: 404, json: { error: 'not_found' } };
await p.click('.sheet-wrap.open [data-pub="dsc"]'); await p.click('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
await p.waitForFunction(() => /Partage sur Discord indisponible sur ce serveur\./.test(document.querySelector('#toast').textContent));
assert.equal(await p.evaluate(() => CTX.dscDeck), false);
await pubSheet(); assert.equal(await dscBtn(), null, 'serveur sans la route : caché');
await p.evaluate(() => { CTX.dscDeck = undefined; }); S.reply = { status: 200, json: { ok: true, url: MSG } };
await closeSheets(p); await p.evaluate(() => closeDeckViewer());
ok('bouton caché sans bot, hors ligne, en mode streamer, et quand le serveur répond 404 not_found');

/* ── 3) « À monter » : feuille de son deck (bouton), du deck d'un autre (pas de bouton) ───────── */
await p.evaluate(() => navOpen(() => openCollection('decks'))); await p.waitForSelector('.crow.dk');
await p.waitForFunction(() => document.querySelectorAll('.crow.dk').length === 3);
const openComm = async by => { await p.$$eval('.crow.dk', (r, b) => r.find(x => [...x.querySelectorAll('.tag')].some(t => t.textContent.trim() === b)).click(), by); await p.waitForSelector('.sheet-wrap.open .dk-info'); };
await openComm('Bob');
assert.equal(await p.$('.sheet-wrap.open [data-act="dkdsc"]'), null, 'deck d\'un autre : pas de bouton'); assert.ok(await p.$('.sheet-wrap.open [data-act="dkrep"]'));
await closeSheets(p);
await openComm('Max');
assert.match(await txt(p, '.sheet-wrap.open .pub-own'), /C'est ton deck .* Partager sur Discord$/);
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/dscdeck-3-amonter.png' });
S.calls.length = 0;
await p.click('.sheet-wrap.open [data-act="dkdsc"]'); await p.click('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
await p.waitForFunction(() => /Partagé sur Discord/.test(document.querySelector('#toast').textContent));
assert.deepEqual(S.calls.map(c => c.body), [{ id: MINE }]);
await closeSheets(p); await p.evaluate(() => closeCollection()); await p.waitForTimeout(300);
ok('À monter : « Partager sur Discord » dans la feuille de son deck (« C\'est ton deck »), jamais sur celle d\'un autre');

/* ── 4) Lien du message (?pd=<id>) : le deck dans le viewer ; deck retiré : la raison ────────── */
await p.goto(world.url + '/?pd=' + BOB); await p.waitForSelector('.dv.on', { timeout: 10000 });
assert.equal(await txt(p, '.dv.on .dv-title b'), 'Edgar Markov');
assert.equal(await p.evaluate(() => DV.saveName), 'Edgar Markov · deck de Bob');
assert.ok(await p.evaluate(() => /^Commander\n1 Edgar Markov\n\n1 Sol Ring\n1 Bob Card 0\n[^]*\n1 Bob Card 24\n73 Plains$/.test(DV.text)), 'liste : commandant en tête');
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/dscdeck-4-lien.png' });
await p.goto(world.url + '/?pd=' + 'c'.repeat(64) + '_3');
await p.waitForFunction(() => /Ce deck n'est plus dans la communauté\./.test(document.querySelector('#toast').textContent), null, { timeout: 10000 });
ok('lien « Voir le deck » (?pd=<id>) : le deck public dans le viewer (sans compte), deck retiré : « Ce deck n\'est plus dans la communauté. »');

/* ── 5) 360 px : la confirmation tient ───────────────────────────────────────────────────────── */
await p.setViewportSize({ width: 360, height: 760 });
await p.evaluate(() => { window.__idTok = 'jeton-firebase-test'; });
await signInFake(p, { uid: UID });
await p.evaluate(m => pdDscShare(m), MINE); await p.waitForSelector('.sheet-wrap.open.pub-dsc-sheet [data-dsc="go"]');
assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '360 px : rien ne déborde');
await closeSheets(p);
ok('360 px : la confirmation tient sans débordement');

assert.deepEqual(errs, []);
await browser.close(); world.close?.();
console.log('\nDISCORD DECK E2E OK');
process.exit(0);
