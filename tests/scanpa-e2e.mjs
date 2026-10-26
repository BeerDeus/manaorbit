// E2E « Alerte de prix » du scan (Réglages du scan, scanset.js ; scan.js › scanPaCheck) : seuil et emplacement réglés, carte au-dessus annoncée sur l'aperçu
// (« Mettre à part » / « Laisser »), une seule fois par ligne, section « À ranger dans … », pastille pour changer, ajout dans l'emplacement (le reste selon
// « Ranger dans »), session gardée ; coupée en prix rapide ; seuil choisi sans emplacement → demandé. Réglages : cadrage et éditions en tuiles, liste des choix.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19173 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { ctx: { colorScheme: 'dark' } });
const nb = s => String(s).replace(/[\u00a0\u202f]/g, ' '), tx = async sel => nb(await txt(p, sel));      // espaces insécables des prix
const closeAll = () => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }).then(() => p.waitForFunction(() => !document.querySelector('.sheet-wrap')));

/* ── Réglages : tuiles Cadrage / Éditions, alerte de prix ─────────────────────────────────────── */
const B5 = await p.evaluate(() => { const a = plcCreate('box', 'Boîte 5 € et +'), b = plcCreate('box', 'Boîte 20 €'); window.__pl = { a, b }; return a; });
await p.evaluate(() => scsSheet()); await p.waitForSelector('.scs-sheet .scs-picks');
assert.deepEqual(await p.$$eval('.scs-pick', b => b.map(x => x.dataset.pick + ':' + x.querySelector('small').textContent)), ['frame:Cadrage', 'ed:Éditions'], 'cadrage et éditions côte à côte');
assert.equal(await p.$('.scs-sheet .scs-ed') === null, true, 'plus de longue liste dans les réglages');
await p.click('.scs-pick[data-pick="ed"]'); await p.waitForSelector('.sheet .scs-ed[data-v="card"]');
await p.click('.sheet .scs-ed[data-v="none"]'); await p.waitForFunction(() => SCS.ed === 'none' && /Sans édition/.test(document.querySelector('.scs-pick[data-pick="ed"] b').textContent));
assert.equal(await p.$eval('.scs-pa input', i => i.value), '', 'alerte coupée : champ vide');
await p.fill('.scs-pa input', '4,5'); await p.press('.scs-pa input', 'Enter'); await p.$eval('.scs-pa input', i => i.blur());
await p.waitForFunction(() => SCS.pa === 450 && document.querySelector('.scs-pa input').value === '4,50');
await p.fill('.scs-pa input', '5'); await p.$eval('.scs-pa input', i => i.blur()); await p.waitForFunction(() => SCS.pa === 500);
assert.match(await tx('.scs-sheet .scs-pa + .scs-note'), /5 € ou plus/, 'explication avec le montant');
assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem('deckdeal:scanset'))).s.pa, 500, 'gardé sur l\'appareil');
await p.fill('.scs-pa input', ''); await p.$eval('.scs-pa input', i => i.blur()); await p.waitForFunction(() => SCS.pa === 0);
await p.fill('.scs-pa input', '5'); await p.$eval('.scs-pa input', i => i.blur()); await p.waitForFunction(() => SCS.pa === 500);
await closeAll();
ok('réglages : cadrage et éditions en tuiles (liste des choix à part), alerte de prix : montant libre (4,5 → 4,50 €, vide : coupée), gardé');

/* ── Scan : carte au-dessus du seuil annoncée, mise à part, laissée ───────────────────────────────── */
await p.evaluate(() => openScan()); await p.waitForSelector('.scan .sc-list');
const add = (key, name, eu, q = 1) => p.evaluate(([key, name, eu, q]) => { COLL.meta[key] = { ...(COLL.meta[key] || {}), eu }; SC.items.set(key + '|en', { id: key + '|en', key, name, q, fq: 0, maybe: false, l: 'en', shot: '', via: '', e: '', es: 'none', pk: null, ft: null }); scanPaintList(); }, [key, name, eu, q]);
await add('llanowar elves', 'Llanowar Elves', 35, 2);
assert.equal(await p.$('.sc-pa') === null, true, 'sous le seuil : rien');
await add('craterhoof behemoth', 'Craterhoof Behemoth', 2890); await add('sol ring', 'Sol Ring', 500);
await p.waitForSelector('.sc-pa');
assert.match(await tx('.sc-pa'), /Craterhoof Behemoth · 28,90 €.*Alerte de prix : 5 € ou plus.*1 autre en attente/, 'bandeau : carte, prix, seuil, file');
await p.click('.sc-pa [data-act="pa1"]'); await p.waitForSelector('.sheet .plc-opt');
assert.match(nb(await p.evaluate(() => [...document.querySelectorAll('.sheet-wrap')].pop().querySelector('.sheet-head').textContent)), /Mettre à part.*Craterhoof Behemoth · 28,90 €/, '« Mettre à part » : la liste des emplacements');
await closeAll(); await p.waitForSelector('.sc-pa'); assert.match(await tx('.sc-pa'), /Craterhoof/, 'fermée sans choix : la carte reste annoncée');
await p.click('.sc-pa [data-act="pa1"]'); await p.waitForSelector('.sheet .plc-opt'); await p.click(`.sheet .plc-opt[data-p="${B5}"]`);
await p.waitForFunction(() => /Sol Ring · 5,00 €/.test(((document.querySelector('.sc-pa') || {}).textContent || '').replace(/[\u00a0\u202f]/g, ' ')));
assert.equal(await p.evaluate(() => SCS.pp), B5, 'dernier emplacement retenu');
await p.click('.sc-pa [data-act="pa1"]'); await p.waitForSelector('.sheet .plc-opt');
assert.equal(await p.$eval('.sheet .plc-opt[aria-checked="true"]', e => e.dataset.p), B5, 'proposé d\'office la fois suivante');
await closeAll(); await p.waitForSelector('.sc-pa');
await p.click('.sc-pa [data-act="pa0"]'); await p.waitForFunction(() => !document.querySelector('.sc-pa'));
const st = Object.fromEntries(await p.evaluate(() => [...SC.items.values()].map(x => [x.key, [x.dp || '', x.pa || '']])));
assert.deepEqual(st, { 'llanowar elves': ['', ''], 'craterhoof behemoth': [B5, 'done'], 'sol ring': ['', 'no'] }, 'mise à part (son emplacement), laissée, sous le seuil');
assert.deepEqual(await p.$$eval('.sc-list .sc-h', h => h.map(x => x.textContent.replace(/[\u00a0\u202f]/g, ' '))), ['À ranger dans « Boîte 5 € et + »', 'Dans le scan'], 'section à part, puis le reste');
assert.match(await tx('.sc-item[data-k="craterhoof behemoth"] .sc-dp'), /Boîte 5 € et \+/, 'pastille de l\'emplacement');
await p.evaluate(() => { SC.items.get('sol ring|en').q = 2; scanPaintList(); }); assert.equal(await p.$('.sc-pa') === null, true, 'laissée : plus jamais annoncée (même ligne, relue une 2e fois)');
ok('scan : carte au-dessus du seuil annoncée (prix, file), « Mettre à part » → liste des emplacements (dernier retenu), section « À ranger dans … », « Laisser » → une seule fois');

/* ── Pastille : autre emplacement ; ajout : chacune à sa place ───────────────────────────────────── */
await p.click('.sc-item[data-k="craterhoof behemoth"] .sc-dp'); await p.waitForSelector('.sheet .plc-opt');
await p.evaluate(() => document.querySelector(`.sheet .plc-opt[data-p="${window.__pl.b}"]`).click());
await p.waitForFunction(() => /Boîte 20 €/.test(document.querySelector('.sc-list .sc-h').textContent.replace(/[\u00a0\u202f]/g, ' ')));
await p.evaluate(() => sssSave());
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:scansess:coll')).items.find(x => x.key === 'craterhoof behemoth'));
assert.equal(kept.dp, await p.evaluate(() => window.__pl.b), 'session gardée avec la mise à part');
await p.click('.sc-head [data-act="done"]'); await p.waitForSelector('.rc-sheet .rc-apart');
assert.match(await tx('.rc-sheet .rc-apart'), /1 carte mise à part ira dans « Boîte 20 € »/, 'récap : où ira la carte mise à part');
await closeAll();
const placeOf = await p.evaluate(() => { scanKeep(scanLive()); const pl = k => collLines(COLL.map[k]).map(([g, q]) => [plcOf(g) || '', q]); return { hoof: pl('craterhoof behemoth'), sol: pl('sol ring'), elves: pl('llanowar elves') }; });
assert.deepEqual(placeOf.hoof.filter(x => x[1]).map(x => x[0]).filter(Boolean), [await p.evaluate(() => window.__pl.b)], 'ajout : la carte mise à part dans son emplacement');
assert.ok(!placeOf.elves.some(x => x[0]) && !placeOf.sol.some(x => x[0]), 'les autres : « Ranger dans » du scan (non rangées ici)');
ok('pastille : autre emplacement ; session gardée ; récap ; ajout : la mise à part dans son emplacement, le reste selon « Ranger dans »');

/* ── Prix rapide : pas d'alerte ──────────────────────────────────────────────────────────────────── */
await p.evaluate(() => { SC.items.clear(); scanPriceMode(true); }); await add('ancient tomb', 'Ancient Tomb', 9000);
assert.equal(await p.$('.sc-pa') === null, true, 'prix rapide : aucune alerte');
assert.deepEqual(errs, [], 'aucune erreur de page');
ok('prix rapide : pas d\'alerte');
await browser.close(); world.stop();
