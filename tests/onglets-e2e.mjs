// E2E deux onglets de l'appli (PWA et navigateur, ou deux onglets ; port 19975) : même stockage de l'appareil, chacun ajoute de son côté, rien n'est perdu
// (collection.js › collStorage, decks.js › decksStorage, share.js › trStorage : fusion à trois sur l'événement « storage ») ; deck supprimé dans un onglet : supprimé dans l'autre.
// Délai maximal des appels au serveur (data.js › fetchT) : serveur qui ne répond pas → erreur réseau (code 'net') au lieu d'une attente sans fin.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19975 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const init = `localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 99 }));`;
const { p: a, errs } = await newPage(browser, world, { init });
const b = await a.context().newPage(); const errsB = []; b.on('pageerror', e => errsB.push(e.message));
await b.goto(world.url); await b.waitForTimeout(700);
const keys = p => p.evaluate(() => Object.keys(COLL.map).sort());
const stored = p => p.evaluate(() => Object.keys(collDocFromText(JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t).map).sort());

/* ── 1) Collection : chaque onglet ajoute une carte, puis retire ── */
await a.evaluate(() => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }], 'add'));
await b.waitForFunction(() => !!COLL.map['sol ring']);
await b.evaluate(() => collAdd([{ k: 'llanowar elves', n: 'Llanowar Elves', q: 1 }], 'add'));
await a.waitForFunction(() => !!COLL.map['llanowar elves']);
assert.deepEqual([await keys(a), await keys(b), await stored(a)], [['llanowar elves', 'sol ring'], ['llanowar elves', 'sol ring'], ['llanowar elves', 'sol ring']], 'les deux ajouts dans les deux onglets et sur l\'appareil');
assert.equal(await b.evaluate(() => COLL.map['sol ring'].q), 2, 'quantité reprise telle quelle');
await a.evaluate(() => collAdd([{ k: 'arcane signet', n: 'Arcane Signet', q: 1 }], 'add')); await b.waitForFunction(() => !!COLL.map['arcane signet']);
await b.evaluate(() => { delete COLL.map['llanowar elves']; collChanged(); }); await a.waitForFunction(() => !COLL.map['llanowar elves']);
assert.deepEqual([await keys(a), await stored(b)], [['arcane signet', 'sol ring'], ['arcane signet', 'sol ring']], 'retrait dans un onglet : retiré dans l\'autre, l\'ajout de l\'autre reste');
ok('collection : ajouts des deux onglets gardés, retrait suivi, appareil à jour');

/* ── 2) Decks sans compte : un deck par onglet, puis suppression ── */
await a.evaluate(() => putDeck('dA', deckDoc({ name: 'Deck A', text: '1 Sol Ring' })));
await b.waitForFunction(() => D.localList.some(d => d.id === 'dA'));
await b.evaluate(() => putDeck('dB', deckDoc({ name: 'Deck B', text: '1 Arcane Signet' })));
await a.waitForFunction(() => D.localList.some(d => d.id === 'dB'));
const ids = p => p.evaluate(() => D.localList.map(d => d.id).sort());
assert.deepEqual([await ids(a), await ids(b)], [['dA', 'dB'], ['dA', 'dB']], 'deux decks, un par onglet');
await b.evaluate(() => removeDeck('dA')); await a.waitForFunction(() => !D.localList.some(d => d.id === 'dA'));
assert.deepEqual(await a.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:decks:v1')).map(d => d.id)), ['dB'], 'deck supprimé dans un onglet : supprimé dans l\'autre');
ok('decks sans compte : un deck créé dans chaque onglet, les deux gardés ; suppression suivie');

/* ── 3) Échange : un souhait par onglet ── */
await a.evaluate(() => { TR.wish[ownKey('Sol Ring')] = { n: 'Sol Ring', q: 1 }; trChanged(); });
await b.waitForFunction(() => !!TR.wish['sol ring']);
await b.evaluate(() => { TR.wish[ownKey('Command Tower')] = { n: 'Command Tower', q: 2 }; trChanged(); });
await a.waitForFunction(() => !!TR.wish['command tower']);
assert.deepEqual(await a.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('deckdeal:trade:v1')).wish).sort()), ['command tower', 'sol ring'], 'les deux souhaits gardés');
ok('échange : souhaits ajoutés dans deux onglets, les deux gardés');

/* ── 4) Serveur qui ne répond pas : erreur réseau au bout du délai ── */
await a.route('**/api/hist**', () => { /* jamais de réponse */ });
const t0 = Date.now(), code = await a.evaluate(() => { HTTP_TIMEOUT.srv = 400; return fetchT('api/hist?n=x').then(() => 'ok', e => e.code); });
assert.equal(code, 'net', 'requête pendue : erreur réseau'); assert.ok(Date.now() - t0 < 5000, 'coupée au bout du délai');
ok('fetchT : serveur muet → erreur réseau au bout du délai');

assert.deepEqual([...errs, ...errsB].filter(e => !/scryfall|ERR_|net::|Failed to load/i.test(e)), []);
await browser.close(); world.stop();
console.log('ONGLETS E2E OK');
