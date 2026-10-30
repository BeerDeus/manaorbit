// E2E : filtre « Style » (plein art, sans bordure, illustration étendue, vitrine, sans texte) — styles lus avec les éditions des lignes (Scryfall), ligne sans
// édition écartée, édition lue avant le filtre (sans style) relue, recherche enregistrée, masterset (styles de l'édition). Port 18999.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18999 });
world.eds['cmm|400'] = { n: 'Sol Ring', langs: ['en'], c: { full_art: true } };
world.eds['neo|401'] = { n: 'Edgar Markov', langs: ['en'], c: { border_color: 'borderless', frame_effects: ['showcase'] } };
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Sol Ring (CMM) 400 *EN*\\n1 Edgar Markov (NEO) 401 *EN*\\n1 Arcane Signet *EN*', u: 1, s: '', b: null })); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
const names = () => p.$$eval('.coll .crow .row-name', r => [...new Set(r.map(x => x.textContent))]);
const filt = (v, on = true) => p.evaluate(([v, on]) => { if (on) COLL.f.sty.add(v); else COLL.f.sty.delete(v); collPaintBody(true); }, [v, on]);

await p.waitForTimeout(500); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => COLL.ed['cmm|400'] && COLL.ed['cmm|400'].st === 'fa' && COLL.ed['neo|401'] && COLL.ed['neo|401'].st === 'bl,sc', null, { timeout: 10000 });
ok('styles lus avec les éditions des lignes (cmm 400 : plein art ; neo 401 : sans bordure, vitrine)');

await filt('fa'); await p.waitForFunction(() => document.querySelectorAll('.coll .crow').length === 1, null, { timeout: 5000 });
assert.deepEqual(await names(), ['Sol Ring']);
await filt('fa', false); await filt('sc'); await p.waitForFunction(() => [...document.querySelectorAll('.coll .crow .row-name')].map(x => x.textContent).join() === 'Edgar Markov', null, { timeout: 5000 });
await filt('fa'); await p.waitForFunction(() => document.querySelectorAll('.coll .crow').length === 2, null, { timeout: 5000 });
assert.ok(!(await names()).includes('Arcane Signet'), 'sans édition : jamais comptée');
assert.deepEqual(await p.evaluate(() => [srchChips(COLL.f).filter(c => c.k === 'sty').map(c => c.t), srchSer(COLL.f).sy]), [['Plein art', 'Vitrine'], ['fa', 'sc']]);
assert.deepEqual(await p.evaluate(() => [...srchLoad(newFilter(), { sy: ['bl', 'xx'] }).sty]), ['bl'], 'recherche enregistrée : styles connus seulement');
ok('filtre Style : plein art, vitrine, une carte passe si une de ses lignes a le style ; sans édition écartée ; pastilles, recherche enregistrée');

// édition gardée avant le filtre (sans st) : relue, même fraîche
assert.deepEqual(await p.evaluate(() => { COLL.ed['neo|401'] = { eu: 500, ef: null, im: '', sn: 'NEO', r: 'rare', t: Date.now() }; return collEds(true); }), ['neo|401']);
await p.evaluate(() => edRefresh()); await p.waitForFunction(() => COLL.ed['neo|401'].st === 'bl,sc', null, { timeout: 8000 });
assert.deepEqual(await p.evaluate(() => collEds(true)), [], 'relue : plus rien à relire');
ok('édition lue avant le filtre : relue une fois (relecture forcée)');

// masterset : styles des cartes de l'édition, filtre propre au masterset
assert.equal(await p.evaluate(() => setvCard({ name: 'X', collector_number: '7', rarity: 'rare', full_art: true, border_color: 'borderless' }).st), 'fa,bl');
assert.deepEqual(await p.evaluate(() => { MS.sty.add('bl'); const l = msFilter('neo', [{ k: 'a', n: 'A', num: '1', st: 'bl' }, { k: 'b', n: 'B', num: '2', st: '' }, { k: 'c', n: 'C', num: '3' }]).map(x => x.k); MS.sty.clear(); return l; }), ['a']);
ok('masterset : styles lus avec les cartes de l\'édition, filtre Style');

assert.deepEqual(errs, []); await browser.close(); world.stop(); console.log('STYLE OK'); process.exit(0);
