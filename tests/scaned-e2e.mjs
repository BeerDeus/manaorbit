// E2E : édition des cartes scannées (scaned.js). Extensions du scan : choisies à la main et extensions uniques. Posée d'office : extension unique,
// extension du scan où la carte existe (la plus fournie), même carte ; sinon « à choisir » (la première carte d'un scan l'est), demandée tout de suite dans le
// bandeau de la liste (« Édition de la 1re carte », puis « Nouvelle extension » ; « Plus tard »). Symbole par ligne, feuille des éditions (celles du scan d'abord),
// cartes « à choisir » revues après chaque choix, une ligne par édition ; récap : prix de l'édition, confirmation des cartes sans édition (choisir / ajouter quand même).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome, signInFake, scanClose } from './e2e-world.mjs';

const world = await startWorld({ port: 18986 });
Object.assign(world.psets, {
  'Sol Ring': ['cmm', 'blb', 'dsk', 'm21'], 'Arcane Signet': ['cmm', 'dsk'], 'Command Tower': ['cmm', 'blb'], "Ranger's Hawk": ['blb', 'pblb'],      // pblb : promo, ne compte pas
  'Llanowar Elves': ['dsk'], 'Swords to Plowshares': ['cmm', 'lea', 'm21'], 'Wrath of God': ['m21', 'lea'], 'Edgar Markov': ['lea', 'm21'],
});
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { init: `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Edgar Markov *EN*', u: 1, s: '', b: null })); } } catch (e) {}` });
await p.route('https://api.scryfall.com/sets', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: ['cmm', 'blb', 'dsk', 'm21', 'lea'].map(c => ({ code: c, name: c.toUpperCase() + ' Set', icon_svg_uri: `https://svgs.scryfall.io/sets/${c}.svg?1` })) } }));
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + (x.e ? ' ' + x.e : ''), x.es + ' ×' + x.q])));
const add = (name, l = 'en') => p.evaluate(([name, l]) => scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: l }, 1, false), [name, l]);
const settle = () => p.waitForFunction(() => SC.items.size && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: 8000 });
const tile = label => p.locator('.ced-sheet .ced-t', { hasText: label }).first().click();
const pick = async (key, label) => {
  await p.click(`.sc-item[data-k="${key}"] .sc-ed`); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
  await tile(label); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
};

await p.waitForTimeout(400); await toHome(p);
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');

/* ── 1) première carte : à choisir, demandée dans le bandeau ; choisie à la main → extension du scan, les cartes à choisir sont revues ─────────────── */
const askOf = () => p.evaluate(() => { const a = document.querySelector('.sc-ask'); return a ? { id: a.dataset.id, h: a.querySelector('.sc-ask-h b').textContent, t: [...a.querySelectorAll('.sc-ask-t .sc-ask-c b')].map(b => b.textContent), all: a.querySelector('.sc-ask-all').textContent } : null; });
await add('Sol Ring'); await settle();
assert.deepEqual(await lines(), { 'sol ring': 'pend ×1' }, 'première carte (plusieurs extensions) : à choisir');
assert.equal(await p.$$eval('.sc-item.ed .sc-ed.todo', b => b.length), 1, 'symbole « à choisir » sur la ligne'); assert.match(await txt(p, '.sc-sub'), /1 édition à choisir/);
assert.deepEqual(await askOf(), { id: 'sol ring|en', h: 'Édition de la 1re carte', t: ['CMM', 'BLB', 'DSK', 'M21'], all: 'Toutes (4)' }, 'bandeau : ses éditions, la plus récente d\'abord');
await add('Arcane Signet'); await settle();
assert.equal((await lines())['arcane signet'], 'pend ×1', 'aucune extension dans le scan : à choisir aussi');
assert.equal((await askOf()).id, 'sol ring|en', 'bandeau : la plus ancienne à choisir');
await p.click('.sc-ask [data-a="later"]'); assert.equal((await askOf()).id, 'arcane signet|en', '« Plus tard » : la suivante');
await p.click('.sc-ask [data-a="later"]'); assert.equal(await askOf(), null, 'plus rien à demander');
await p.click('.sc-item[data-k="sol ring"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
assert.deepEqual(await p.$$eval('.ced-sheet .ced-t:not(.none) .ced-n', b => b.map(x => x.textContent)), ['CMM 200', 'BLB 201', 'DSK 202', 'M21 203'], 'feuille : toutes les éditions de la carte');
await tile('DSK 202'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.deepEqual(await lines(), { 'sol ring dsk|202': 'man ×1', 'arcane signet dsk|201': 'auto ×1' }, 'choisie à la main ; Arcane Signet (existe en DSK) la prend d\'office');
assert.equal(await p.$$eval('.sc-ed.todo', b => b.length), 0); assert.equal(await p.$$eval('.sc-item[data-k="arcane signet"] .sc-ed.on.auto', b => b.length), 1, 'posée d\'office : point');
await p.waitForFunction(() => document.querySelector('.sc-item[data-k="sol ring"] .sc-ed .set-ic'), null, { timeout: 5000 });
assert.match(await p.$eval('.sc-item[data-k="sol ring"] .sc-th', i => i.src), /sol-ring-dsk\.jpg$/, 'miniature : l\'impression de l\'édition');
ok('première carte à choisir (bandeau, « Plus tard ») ; choisie à la main → extension du scan, cartes à choisir revues (posées d\'office), symbole et miniature de l\'édition');

/* ── 2) extension unique : posée, rejoint les extensions du scan ; la plus fournie quand la carte est dans plusieurs ; même carte ───────── */
await add('Command Tower'); await settle();
assert.equal((await lines())['command tower'], 'pend ×1', 'pas en DSK (seule extension du scan) : à choisir');
assert.deepEqual(await askOf(), { id: 'command tower|en', h: 'Nouvelle extension', t: ['CMM', 'BLB'], all: 'Toutes (2)' }, 'bandeau : nouvelle extension');
await add("Ranger's Hawk"); await settle();
let L = await lines();
assert.equal(L['rangers hawk blb|200'], 'solo ×1', 'une seule extension (promo à part) : posée'); assert.equal(L['command tower blb|201'], 'auto ×1', 'BLB rejoint les extensions du scan : Command Tower la prend');
assert.equal(await askOf(), null, 'plus rien à demander');
await add('Llanowar Elves'); await settle();
assert.equal((await lines())['llanowar elves dsk|200'], 'solo ×1');
await add('Swords to Plowshares'); await settle();
assert.equal((await lines())['swords to plowshares'], 'pend ×1', 'ni en DSK ni en BLB : à choisir');
await add('Sol Ring'); await settle();
assert.equal((await lines())['sol ring dsk|202'], 'man ×2', '2e Sol Ring : DSK (3 cartes) plutôt que BLB (2), même ligne');
assert.deepEqual(await p.$$eval('.sc-list > :not(.sc-ask)', r => r.map(x => x.classList.contains('sc-h') ? '# ' + x.textContent : x.dataset.k)),
  ['# 1 édition à choisir', 'swords to plowshares', '# Dans le scan', 'sol ring', 'llanowar elves', 'rangers hawk', 'command tower', 'arcane signet'], 'à choisir en tête ; Sol Ring rescanné : remonté en haut');
assert.equal(await p.$$eval('.sc-item.last', r => r.map(x => x.dataset.k).join()), 'sol ring', 'dernière carte lue : mise en avant');
await p.locator('.sc-ask .sc-ask-t', { hasText: 'CMM' }).click(); await p.waitForFunction(() => !document.querySelector('.sc-ask'));
assert.equal((await lines())['swords to plowshares cmm|200'], 'man ×1', 'choisie dans le bandeau');
await add('Sol Ring'); await settle();
L = await lines(); assert.equal(L['sol ring dsk|202'], 'man ×3', 'DSK, CMM et BLB possibles : DSK, la plus fournie du scan'); assert.equal(L['sol ring cmm|200'], undefined);
await add('Wrath of God'); await settle();
assert.equal((await lines())['wrath of god'], 'pend ×1', 'aucune extension du scan : à choisir');
// feuille : les extensions du scan d'abord (la collante en tête)
await p.click('.sc-item[data-k="wrath of god"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
assert.equal(await p.$$eval('.ced-sheet .ced-h', h => h.length), 0, 'aucune extension du scan pour Wrath of God : pas de groupe');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.click('.sc-item[data-k="command tower"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-h');
assert.deepEqual(await p.$$eval('.ced-sheet .ced-h, .ced-sheet .ced-t:not(.none) .ced-n', b => b.map(x => x.textContent)), ['Dans ce scan', 'BLB 201', 'CMM 200'], 'extensions du scan d\'abord (la plus fournie : BLB, puis CMM)');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.screenshot({ path: 'shots/scan-editions.png' });
ok('extension unique posée ; extension du scan la plus fournie ; même carte même ligne (remontée en haut) ; bandeau « Nouvelle extension » ; cartes à choisir en tête ; feuille : extensions du scan d\'abord');

/* ── 3) récap : prix de l'édition, confirmation des cartes sans édition ─────────────────────────────────────────── */
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
assert.match(await txt(p, '.rc-facts'), /Éditions\s*1 sans édition · 8 posées/);
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet .rc-ask');
assert.match(await txt(p, '.rc-ask'), /1 carte n'a pas d'édition/); assert.ok(await p.$('.rc-sheet [data-rc="force"]')); assert.equal(await p.$('.scan.on') !== null, true, 'rien d\'ajouté');
await p.click('.rc-sheet [data-rc="pick"]'); await p.waitForSelector('.sc-ef.on .sc-ef-t');
assert.match(await txt(p, '.sc-ef-card'), /Wrath of God/, 'Choisir les éditions : écran « Éditions à choisir », la carte sans édition');
assert.equal(await txt(p, '.sc-ef-n'), '1 sur 1'); assert.equal(await txt(p, '.sc-ef [data-ef="next"]'), 'Terminer');
await p.locator('.sc-ef-t', { hasText: 'M21' }).click(); await p.waitForSelector('.sc-ef', { state: 'detached' });
await p.waitForSelector('.rc-sheet [data-rc="go"]');
assert.match(await txt(p, '.rc-facts'), /Éditions\s*toutes posées/);
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 3000 });
const coll = await p.evaluate(() => Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [k, x.x || { [x.l || '']: x.q }])));
assert.deepEqual(coll['sol ring'], { 'en|dsk|202': 3 }, 'collection : l\'édition de chaque ligne');
assert.deepEqual(coll['wrath of god'], { 'en|m21|200': 1 }); assert.deepEqual(coll['rangers hawk'], { 'en|blb|200': 1 });
assert.equal(await p.evaluate(() => (COLL.ed['dsk|202'] || {}).sn), 'DSK Set', 'infos de l\'édition gardées');
ok('récap : cartes sans édition → confirmation, « Choisir les éditions » ouvre l\'écran « Éditions à choisir » puis revient au récap ; ajout avec une ligne par édition');

/* ── 4) « Ajouter quand même » ; « Sans édition » choisi à la main ─────────────────────────────────────────────── */
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
await add('Edgar Markov'); await settle(); await add('Swords to Plowshares'); await settle();
assert.deepEqual(await lines(), { 'edgar markov': 'pend ×1', 'swords to plowshares': 'pend ×1' }, 'nouveau scan : rien de collant');
await pick('edgar markov', 'Sans édition');
assert.equal(await p.$$eval('.sc-item[data-k="edgar markov"] .sc-ed.todo', b => b.length), 0, '« Sans édition » choisi : plus à choisir');
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet .rc-ask'); assert.match(await txt(p, '.rc-ask'), /1 carte n'a pas d'édition/, 'seulement celle qui reste à choisir');
await p.click('.rc-sheet [data-rc="force"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 3000 });
assert.deepEqual(await p.evaluate(() => COLL.map['swords to plowshares'].x), { 'en|cmm|200': 1, en: 1 }, 'ajoutée sans édition (à côté de celle du 1er scan)');
ok('« Ajouter quand même » ; « Sans édition » choisi à la main ne redemande pas');

/* ── 5) réglages du scan : carte par carte (rien demandé, écran « Éditions à choisir » à la fin), sans édition, langue imposée, compte ───────────── */
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
assert.match(await txt(p, '.sc-edm'), /Éditions : comme la 1re/);
await p.click('.sc-edm'); await p.waitForSelector('.scs-sheet .scs-pick[data-pick="ed"]');
await p.click('.scs-pick[data-pick="ed"]'); await p.waitForSelector('.sheet .scs-ed[data-v="card"]'); await p.click('.sheet .scs-ed[data-v="card"]');      // tuile « Éditions » : la liste des choix
assert.equal(await p.evaluate(() => SCS.ed), 'card'); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:scanset')).s.ed), 'card', 'gardé sur l\'appareil');
await p.waitForFunction(() => /Carte par carte/.test(document.querySelector('.scs-pick[data-pick="ed"] b').textContent), null, { timeout: 3000 });
await p.click('label[for="scsAuto"] .switch'); assert.equal(await p.evaluate(() => SCS.auto), true); assert.ok(await p.$('.scs-sheet [data-s="delay"]'), 'automatique : délai et même carte proposés');
await p.click('label[for="scsAuto"] .switch'); assert.equal(await p.evaluate(() => SCS.auto), false);
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.match(await txt(p, '.sc-edm'), /Éditions : à la fin/);
await add('Sol Ring'); await settle(); await add('Arcane Signet'); await settle(); await add("Ranger's Hawk"); await settle(); await add('Command Tower'); await settle();
L = await lines();
assert.deepEqual([L['sol ring'], L['arcane signet'], L['rangers hawk blb|200'], L['command tower']], ['pend ×1', 'pend ×1', 'solo ×1', 'pend ×1'], 'carte par carte : extension unique posée, rien d\'autre');
assert.equal(await p.$('.sc-ask'), null, 'rien demandé pendant le scan');
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet .rc-ask'); await p.click('.rc-sheet [data-rc="pick"]');
await p.waitForSelector('.sc-ef.on .sc-ef-t');
const ef = async () => [await txt(p, '.sc-ef-n'), (await txt(p, '.sc-ef-card')).replace(/\s+/g, ' ').trim()];
assert.deepEqual(await ef(), ['1 sur 3', 'Sol Ring'], 'écran « Éditions à choisir » : la première');
assert.equal(await p.$$eval('.sc-ef-t', t => t.length), 4, 'toutes ses éditions en illustrations');
await p.locator('.sc-ef-t', { hasText: 'DSK' }).click(); await p.waitForFunction(() => /2 sur 3/.test(document.querySelector('.sc-ef-n').textContent));
assert.deepEqual(await ef(), ['2 sur 3', 'Arcane Signet']);
await p.click('.sc-ef [data-ef="prev"]'); assert.deepEqual(await ef(), ['1 sur 3', 'Sol Ring'], 'Précédente');
assert.match(await p.$eval('.sc-ef-t[aria-checked="true"]', b => b.textContent), /DSK/, 'le choix fait est coché');
await p.click('.sc-ef [data-ef="next"]'); assert.deepEqual(await ef(), ['2 sur 3', 'Arcane Signet']);
await p.click('.sc-ef [data-ef="none"]'); await p.waitForFunction(() => /3 sur 3/.test(document.querySelector('.sc-ef-n').textContent));
assert.deepEqual(await ef(), ['3 sur 3', 'Command Tower']); assert.equal(await txt(p, '.sc-ef [data-ef="next"]'), 'Terminer');
await p.locator('.sc-ef-t', { hasText: 'BLB' }).click(); await p.waitForSelector('.sc-ef', { state: 'detached' });
await p.waitForSelector('.rc-sheet [data-rc="go"]');
L = await lines(); assert.deepEqual([L['sol ring dsk|202'], L['arcane signet'], L['command tower blb|201']], ['man ×1', 'pend ×1', 'man ×1'], 'choisies à la fin ; « Sans édition »');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
ok('réglages : carte par carte → rien demandé pendant le scan, écran « Éditions à choisir » à la fin (Précédente, Sans édition, Terminer → récap)');
// sans édition : rien lu ; retour au réglage normal : lue et décidée
await p.evaluate(() => scsSet({ ed: 'none' })); assert.match(await txt(p, '.sc-edm'), /Sans édition/);
await add('Swords to Plowshares');
assert.equal((await lines())['swords to plowshares'], 'off ×1', 'sans édition : aucune impression lue'); assert.equal(await p.$$eval('.sc-item[data-k="swords to plowshares"] .sc-ed', b => b.length), 0, 'pas de symbole');
await p.evaluate(() => scsSet({ ed: 'scan' })); await settle();
assert.equal((await lines())['swords to plowshares'], 'pend ×1', 'réglage normal : lue, à choisir (aucune extension du scan)');
assert.equal((await p.evaluate(() => { const a = document.querySelector('.sc-ask'); return a && a.dataset.id; })), 'swords to plowshares|en', 'demandée dans le bandeau');
// langue imposée
await p.evaluate(() => scsSet({ lang: 'de' })); await add('Wrath of God', 'en');
assert.equal(await p.evaluate(() => [...SC.items.values()].find(x => x.key === 'wrath of god').l), 'de', 'langue imposée : la carte prend l\'allemand');
await p.evaluate(() => scsSet({ lang: '' }));
ok('réglages : sans édition (rien lu), retour au réglage normal, langue imposée');
// compte : réglages de l'appareil envoyés au compte vide ; réglages plus récents du compte appliqués
await signInFake(p); await p.waitForFunction(async () => { const d = (await D.cloud.pullMeta(D.uid, 'prefs')).data; return d && d.scan && d.scan.ed === 'scan'; }, null, { timeout: 5000 });
await p.evaluate(async () => { await D.cloud.saveMeta(D.uid, 'prefs', { scan: { ...scsClean(SCS), ed: 'card', snd: true }, updatedAt: Date.now() + 5000 }); scsUser(D.user); });
await p.waitForFunction(() => SCS.ed === 'card' && SCS.snd === true, null, { timeout: 5000 });
assert.match(await txt(p, '.sc-edm'), /à la fin/, 'écran de scan ouvert : suit les réglages du compte');
await p.evaluate(() => scsSet({ ed: 'scan', snd: false }));
ok('réglages du scan dans le compte : envoyés au compte vide, ceux du compte (plus récents) appliqués');

/* ── recherche d'une extension (dès 2 impressions) : bandeau › « Chercher une extension » → feuille ouverte sur la recherche ── */
world.psets['Craterhoof Behemoth'] = ['neo', 'mh3', 'woe', 'ltr', 'one', 'mom', 'lci', 'mkm', 'otj', 'fdn'];      // aucune dans le scan : à choisir
await p.evaluate(() => { for (const x of SC.items.values()) x.later = true; scanPaintList(); });
await add('Craterhoof Behemoth'); await settle();
await p.waitForFunction(() => { const a = document.querySelector('.sc-ask'); return a && a.dataset.id === 'craterhoof behemoth|en' && a.querySelector('[data-a="edq"]'); }, null, { timeout: 5000 });
await p.click('.sc-ask [data-a="edq"]'); await p.waitForSelector('.ced-sheet [data-edq]');
await p.waitForFunction(() => document.activeElement && document.activeElement.matches('.ced-sheet [data-edq]'), null, { timeout: 3000 });
const shown = () => p.$$eval('.ced-sheet .ced-t:not(.none):not(.ed-off) .ced-n', b => b.map(x => x.textContent));
assert.equal((await shown()).length, 10, 'toutes les éditions avant la recherche');
await p.keyboard.type('WO'); assert.deepEqual(await shown(), ['WOE 202'], 'début du code ou du nom, sans casse');
await p.fill('.ced-sheet [data-edq]', '2021'); assert.deepEqual(await shown(), ['LTR 203'], 'année');
await p.fill('.ced-sheet [data-edq]', 'zzz'); assert.deepEqual(await shown(), [], 'rien ne correspond');
assert.match(await txt(p, '.ced-sheet .ed-q-none'), /zzz/); assert.equal(await p.$$eval('.ced-sheet .ced-t.none:not(.ed-off)', b => b.length), 1, '« Sans édition » reste');
await p.fill('.ced-sheet [data-edq]', 'mkm set'); assert.deepEqual(await shown(), ['MKM 207'], 'plusieurs mots');
assert.equal(await p.$('.ced-sheet .ed-q-none'), null);
await tile('MKM'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.equal((await lines())['craterhoof behemoth mkm|207'], 'man ×1', 'édition trouvée par la recherche : posée');
ok('recherche d\'une extension : bandeau › feuille sur la recherche (code, nom, année, plusieurs mots, aucune), choix posé');

/* ── ligne du bas lue (cadrage « carte entière », scanfoot.js) : l'édition exacte, avant toute déduction ── */
await p.evaluate(() => scsSet({ ed: 'scan', frame: 'card' })); await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on.full');
assert.ok(await p.$('.scan .sc-g-foot'), 'cadre de carte : coin de la ligne du bas marqué');
const addFt = (name, foot) => p.evaluate(([name, foot]) => scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: 'en', ft: footParse(foot) }, 1, false), [name, foot]);
await p.evaluate(() => { const f = x => footParse(x); scanAdd({ key: 'sol ring', name: 'Sol Ring', score: 0.99, raw: '', card: 'en', ft: f(['0202 U', 'DSK • EN']) }, 1, false); scanAdd({ key: 'sol ring', name: 'Sol Ring', score: 0.99, raw: '', card: 'en', ft: f(['200/300 U', 'CMM • EN']) }, 1, false); });
await settle();
assert.deepEqual(await lines(), { 'sol ring dsk|202': 'read ×1', 'sol ring cmm|200': 'read ×1' }, 'deux exemplaires lus avant l\'arrivée des impressions : chacun son édition, rien à choisir');
assert.equal(await p.$('.sc-ask'), null, 'première carte : rien demandé');
assert.match(await p.getAttribute('.scan.on .sc-item[data-k="sol ring"] .sc-ed', 'aria-label'), /lue sur la carte/);
await addFt('Sol Ring', ['O2O3 U', 'M2l • EN']); assert.equal((await lines())['sol ring m21|203'], 'read ×1', 'fautes de lecture (O2O3, M2l)');
await addFt('Arcane Signet', ['Arcane Signet']); await settle();
assert.equal((await lines())['arcane signet cmm|200'], 'auto ×1', 'ligne du bas illisible : extension du scan (lues sur les cartes précédentes), comme avant');
await addFt('Command Tower', ['BLB • EN']); await settle();
assert.equal((await lines())['command tower blb|201'], 'read ×1', 'extension seule, une impression dedans');
await p.evaluate(() => scsSet({ frame: 'name' })); assert.equal(await p.$eval('.scan.on', s => s.classList.contains('full')), false, 'réglage « Nom seulement » : caméra compacte');
await p.evaluate(() => scsSet({ frame: 'card' }));
ok('ligne du bas lue : édition exacte (deux exemplaires différents, fautes de lecture, extension seule), illisible : comme avant ; cadrage changeable');

/* ── même carte lue deux fois, rangée sur une ligne (ligne du bas illisible) : « Exemplaires concernés » sépare les éditions ─────────────── */
await p.evaluate(() => { SC.items = new Map(); scanPaintList(); });
await add('Wrath of God'); await settle(); await pick('wrath of god', 'M21');
await add('Wrath of God'); await settle();
assert.deepEqual(await lines(), { 'wrath of god m21|200': 'man ×2' }, 'même carte : même édition, une seule ligne');
await p.click('.sc-item[data-k="wrath of god"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-cnt');
assert.equal(await txt(p, '.ced-cnt b'), '2'); await p.click('.ced-cnt [data-cn="-1"]');
await tile('LEA'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.deepEqual(await lines(), { 'wrath of god m21|200': 'man ×1', 'wrath of god lea|201': 'man ×1' }, '1 exemplaire en LEA sur sa ligne, l\'autre reste en M21');
assert.deepEqual(await p.$$eval('.sc-item[data-k="wrath of god"]', r => r.length), 2, 'deux lignes dans la liste');
ok('même carte lue deux fois (une ligne ×2) : « Exemplaires concernés » → 1 en M21, 1 en LEA');

/* ── « Saisir » sur une ligne non reconnue : la carte choisie remplace la ligne et rejoint le scan comme une carte lue (édition, récap) ; rien dans la collection ── */
await p.evaluate(() => { SC.items = new Map(); SC.miss = [{ id: 901, label: 'Photo 3', thumb: '', shot: '', raw: 'Wr4th 0f G0d' }]; scanPaintList(); });
const wq0 = await p.evaluate(() => collQty('wrath of god'));
await p.click('.sc-item.miss [data-a="type"]'); await p.waitForSelector('.sheet-wrap.open #caName');
await p.fill('.sheet-wrap.open #caName', 'wrath'); await p.click('.sheet-wrap.open .ca-opt[data-n="Wrath of God"]');
await p.waitForFunction(() => !document.querySelector('.sheet-wrap')); await settle();
assert.deepEqual(await p.evaluate(() => [SC.miss.length, document.querySelectorAll('.sc-item.miss').length]), [0, 0], 'la ligne non reconnue est remplacée');
assert.deepEqual(await p.evaluate(() => [...SC.items.values()].map(x => [x.name, x.q, x.maybe, x.l, x.es !== 'load'])), [['Wrath of God', 1, false, 'en', true]], 'dans la liste du scan, sûre, son édition décidée comme une carte lue');
assert.ok(await p.$('.sc-item[data-k="wrath of god"] .sc-ed'), 'symbole d\'édition sur la ligne (feuille d\'édition, foil)'); assert.match(await txt(p, '.sc-count'), /^1 carte$/);
assert.equal(await p.evaluate(() => collQty('wrath of god')), wq0, 'rien dans la collection avant « Ajouter »');
ok('« Saisir » : la carte choisie remplace la ligne non reconnue et rejoint le scan (édition, foil, récap), rien dans la collection');

/* ── foil au scan : « Foil ✦ − n + » dans la feuille d'édition (2 foil sur 3), ajoutés foil à la collection ; carte relue : remonte en haut ─────────────── */
await p.evaluate(() => { SC.items = new Map(); scanPaintList(); });
await add('Wrath of God'); await settle(); await add('Wrath of God'); await add('Wrath of God'); await settle();
const wr = () => p.evaluate(() => { const x = [...SC.items.values()].find(y => y.key === 'wrath of god'); return x ? [x.q, x.fq || 0, x.e] : null; });
assert.equal((await wr())[0], 3);
await p.click('.sc-item[data-k="wrath of god"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-foiln');
assert.equal((await txt(p, '.ced-foiln')).replace(/\s/g, ''), 'Foil✦Combiendetesexemplairessontfoil?−0+/3');
await p.click('.ced-foiln [data-fn="1"]'); await p.click('.ced-foiln [data-fn="1"]');
assert.equal(await txt(p, '.ced-foiln .qstep b'), '2'); assert.equal((await wr())[1], 2, '2 foil sur 3, tout de suite');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.equal(await txt(p, '.sc-item[data-k="wrath of god"] .sc-foil'), '✦ 2', 'étiquette « ✦ 2 » sur la ligne');
await add('Command Tower'); await settle();
const top = () => p.$$eval('.sc-list .sc-item', r => r.map(x => [x.dataset.k, x.classList.contains('last')]));
assert.equal((await top())[0][0], 'command tower', 'dernière lue en haut');
// relue avec une ligne à part le temps de lire son édition (ligne du bas, illustration) : elle rejoint la sienne ET remonte en haut
await p.evaluate(() => { const it = [...SC.items.values()].find(x => x.key === 'wrath of god'), tmp = { ...it, id: it.id + '#t', q: 1, fq: 0 }; SC.items.set(tmp.id, tmp); SC.lastIt = tmp; scanRekey(tmp, it.id); scanPaintList(); });
assert.deepEqual((await top())[0], ['wrath of god', true], 'doublon relu : en haut, surligné'); assert.deepEqual(await wr(), [4, 2, (await wr())[2]], '4 exemplaires, dont 2 foil');
const foilQ = () => p.evaluate(() => collLines(COLL.map['wrath of god']).filter(([g]) => lineFoil(g)).reduce((a, [, q]) => a + q, 0)), allQ = () => p.evaluate(() => (COLL.map['wrath of god'] || { q: 0 }).q);
const f0 = await foilQ(), q0 = await allQ(), ed = (await wr())[2];
// valeur : les foil au prix foil de leur édition (avant : au prix normal), en-tête du scan et récap (« Les plus chères » : ✦ Foil)
await p.evaluate(() => { for (const x of [...SC.items.values()]) { if (x.key === 'wrath of god') x.pk = { ...x.pk, eu: 100, ef: 500 }; else SC.items.delete(x.id); } scanPaintList(); });
assert.match(await txt(p, '.sc-sub'), /^≈ 12,00\s€/, '2 × 1 € + 2 foil × 5 €');
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
assert.match(await txt(p, '.rc-sheet .rc-val b'), /^12,00\s€$/, 'récap : même valeur');
assert.deepEqual(await p.$$eval('.rc-sheet .cs-top .crow', r => r.map(x => [x.dataset.k, !!x.querySelector('.tag.foil'), x.querySelector('.row-price b').textContent.replace(/\s/g, ' ')])), [['wrath of god', true, '5,00 €'], ['wrath of god', false, '1,00 €']], 'les plus chères : la foil à part, à son prix');
await p.click('.rc-sheet [data-rc="go"]');
await p.waitForFunction(() => !document.querySelector('.scan') || document.querySelector('.rc-sheet [data-rc="force"]'), null, { timeout: 4000 });
if (await p.$('.rc-sheet [data-rc="force"]')) { await p.click('.rc-sheet [data-rc="force"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 4000 }); }
assert.deepEqual([await allQ() - q0, await foilQ() - f0], [4, 2], 'collection : 4 Wrath of God dont 2 foil');
assert.equal(await p.evaluate(e => (COLL.map['wrath of god'].x || {})['en|' + e + '*'] >= 2, ed), true, 'foil sur la ligne de leur édition');
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
ok('foil au scan : « Foil ✦ » 2 sur 3, étiquette ✦ 2, ajoutés foil à la collection ; carte relue (ligne à part puis rangée) : remonte en haut');
await scanClose(p);

/* ── cadre « carte entière » réduit (carte vers 15 cm), textes dans les bandes de côté ; carte ajoutée : son symbole d'édition descend sur sa ligne ── */
await p.evaluate(() => { scsSet({ frame: 'card' }); openScan(); }); await p.waitForFunction(() => SC.el && SC.el.classList.contains('full') && SC.el.classList.contains('on'));
{
  const geo = await p.evaluate(() => { SC.el.querySelector('.sc-stage').dataset.cam = 'on'; const r = e => SC.el.querySelector(e).getBoundingClientRect(), g = r('.sc-guide'), c = r('.sc-cap'); scanHint(camHint(), ''); const h = r('.sc-hint'); return { gw: g.width / innerWidth, cap: c.right <= g.left, hint: h.left >= g.right, text: SC.el.querySelector('.sc-hint').textContent, at: [g.left, g.right, c.left, c.right, h.left, h.right].join() }; });      // SC.el : l'écran de scan d'avant peut encore être là (fermeture animée)
  assert.ok(geo.gw > 0.4 && geo.gw < 0.52, 'cadre ≈ 48 % de la largeur (' + geo.gw + ')'); assert.ok(geo.cap && geo.hint, '« Carte entière » à gauche du cadre, le message à droite : rien dans le cadre (' + geo.at + ')');
  assert.match(geo.text, /15 cm/);
}
await p.evaluate(() => { SC_FLY.ms = 900; SC.items.set('sol ring', { id: 'sol ring', key: 'sol ring', name: 'Sol Ring', q: 1, score: 1, l: 'en', e: edKey('m21', '1'), es: 'read', maybe: false, fly: Date.now() }); SC.lastIt = SC.items.get('sol ring'); scanPaintList(); });
await p.waitForSelector('.scan .sc-fly'); await p.waitForSelector('.scan .sc-fly', { state: 'detached', timeout: 4000 });
assert.equal(await p.$eval('.sc-item[data-id="sol ring"]', r => r.classList.contains('got')), true, 'arrivé : la ligne s\'éclaire');
assert.equal(await p.evaluate(() => 'fly' in SC.items.get('sol ring')), false, 'une fois');
await p.evaluate(() => { SC.items.set('swords', { id: 'swords', key: 'swords to plowshares', name: 'Swords to Plowshares', q: 1, score: 1, l: 'en', e: edKey('m21', '2'), es: 'man', maybe: false, fly: Date.now() }); scanPaintList(); });
await p.waitForTimeout(150); assert.equal(await p.$('.scan .sc-fly'), null, 'édition choisie à la main : rien ne descend');
// appli Android (html.nat-cam), thème sombre : la pastille reste blanche (le fond de l'écran la rendait noire, symbole invisible)
await p.evaluate(() => { document.documentElement.classList.add('nat-cam'); document.documentElement.dataset.theme = 'dark'; SC_FLY.ms = 3000; SC.items.set('bolt', { id: 'bolt', key: 'lightning bolt', name: 'Lightning Bolt', q: 1, score: 1, l: 'en', e: edKey('m21', '3'), es: 'read', maybe: false, fly: Date.now() }); scanPaintList(); });
await p.waitForSelector('.scan .sc-fly');
assert.deepEqual(await p.evaluate(() => { const f = SC.el.querySelector('.sc-fly'); return [getComputedStyle(f).backgroundColor, getComputedStyle(f.querySelector('.set-ic')).filter]; }), ['rgb(255, 255, 255)', 'none'], 'pastille blanche, symbole noir');
await p.evaluate(() => { document.documentElement.classList.remove('nat-cam'); delete document.documentElement.dataset.theme; });
// « Ranger dans » affiché : la pastille des éditions devient la roue des réglages (le texte se coupait en « comme »)
await p.evaluate(() => { SCD.p = plcCreate('binder', 'Classeur du scan'); scanPaintTools(); });
assert.equal(await p.evaluate(() => { const b = SC.el.querySelector('.sc-edm'); return [b.classList.contains('ico'), !!b.querySelector('.ms-gear'), getComputedStyle(b.querySelector('.sc-edm-t')).display, b.getAttribute('aria-label')].join(); }), 'true,true,none,Réglages du scan · Éditions : comme la 1re');
await p.evaluate(() => { SCD.p = ''; scanPaintTools(); }); assert.equal(await p.evaluate(() => SC.el.querySelector('.sc-edm').classList.contains('ico')), false);
ok('cadre « carte entière » ≈ 48 % (carte vers 15 cm), textes hors du cadre ; symbole de l\'édition trouvée : du bas du cadre à sa ligne, qui s\'éclaire (pastille blanche dans l\'appli en thème sombre) ; « Ranger dans » : roue des réglages');
await scanClose(p);

/* ── longue session : les 10 dernières cartes montrées, « Afficher plus » ajoute les autres (la liste se repeint à chaque carte) ── */
await p.evaluate(() => { scsSet({ frame: 'name' }); openScan(); }); await p.waitForFunction(() => SC.el && SC.el.classList.contains('on'));
await p.waitForTimeout(500); await p.evaluate(() => { SC.items = new Map(); SC.resume = null; for (let i = 0; i < 25; i++) SC.items.set('c' + i, { id: 'c' + i, key: 'c' + i, name: 'Carte ' + i, q: 1, score: 1, l: 'en', e: edKey('m21', String(i + 1)), es: 'man', maybe: false }); SC.lastIt = SC.items.get('c3'); scanPaintList(); });
const shownIds = () => p.$$eval('.scan .sc-list .sc-item[data-id]', r => r.map(x => x.dataset.id));
let ids = await shownIds();
assert.deepEqual(ids, ['c24', 'c23', 'c22', 'c21', 'c20', 'c19', 'c18', 'c17', 'c16', 'c15', 'c3'], 'les 10 dernières, plus la dernière touchée (+1 sur une carte plus ancienne)');
assert.match(await txt(p, '.scan .sc-more'), /Afficher plus \(14 autres\)/);
assert.match(await txt(p, '.scan .sc-count'), /25 cartes/, 'le total compte toutes les cartes');
await p.click('.scan .sc-more'); ids = await shownIds();
assert.equal(ids.length, 25, 'puis 20 de plus : toutes ici (25)'); assert.equal(await p.$('.scan .sc-more'), null);
ok('longue session : 10 cartes montrées, « Afficher plus (14 autres) » ajoute la suite, total sur toutes');
await scanClose(p);

assert.deepEqual(errs, [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nSCANED E2E OK');
