// E2E compteur de vie (interface) : carte « Compteur de vie » de l'accueil, préparation avec invités (sans compte), compteur (3 affichages, ±1, ±10 maintenu, fiche d'un joueur),
// proposition d'élimination, menu « … », fin de partie (classement, QR code du résultat), Mes parties, lien ?partie= (c'était moi), lien ?table= sans compte ; formats à 360 px (un appui : Commander, Standard, Libre ±, gardé pour la fois suivante), partie Standard à deux (20 PV, invité avec son deck, ni blessures de commandant ni impôt ni monarque, poison), Mes parties marquées, statistiques par format, lien du résultat Standard ; bouton rond « … » sur une jointure à 2–8 joueurs (boîtes englobantes, 360 à 430 px, A B C), tuiles sans chevauchement, nom-bouton (réglages, compteurs), illustration du commandant en fond (art_crop), image de mon deck lue à la préparation.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18928 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);
const st = () => p.evaluate(() => PU.st);
const sheetTop = () => p.evaluate(() => { const s = sheets[sheets.length - 1]; return s ? s.wrap.querySelector('h2').textContent : ''; });
const closeSheets = () => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });

/* ── Accueil ─────────────────────────────────────────────────────────────────────────────────── */
await toHome(p); await p.waitForSelector('#hmPartie');
assert.equal(await p.evaluate(() => { let e = document.querySelector('#hmTrade').nextElementSibling; if (e && e.id === 'hmDiscord') e = e.nextElementSibling; return e && e.id; }), 'hmPartie', 'sous l\'Échange (et l\'invitation au Discord, dsclink.js)');
assert.equal(await p.evaluate(() => { let e = document.querySelector('#hmPartie').nextElementSibling; if (e && e.id === 'hmDiscord') e = e.nextElementSibling; return e && e.id; }), 'hmSets', 'au-dessus de Prochaines extensions (et de l\'invitation au Discord, selon sa place)');
assert.match(await txt(p, '#hmPartie'), /^Compteur de vie Commander, Standard ou libre Nouvelle partie Mes parties/);
await p.$eval('#hmPartie', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/partie-0-accueil.png' });
ok('accueil : carte sous l\'Échange, au-dessus de « Prochaines extensions »');

/* ── Partie en attente : supprimée à la main (accueil, écran de préparation) ou laissée de côté (12 h en préparation, 48 h commencée) ── */
assert.equal(await p.$eval('#hmPartie .hm-pu-drop', b => b.hidden), true, 'aucune partie : pas de corbeille');
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-setup');
assert.equal(await txt(p, '.pu-foot [data-pu="drop"]'), 'Supprimer cette partie');
await p.evaluate(() => puSet(partieSetFormat(PU.st, 30)));      // un réglage : la partie est enregistrée
await p.click('.pu [data-pu="close"]'); await p.waitForFunction(() => !document.querySelector('.pu'));
assert.match(await txt(p, '#hmPartie'), /En préparation · 1 joueur Reprendre/);
assert.equal(await p.$eval('#hmPartie .hm-pu-drop', b => [b.hidden, b.getAttribute('aria-label')].join()), 'false,Supprimer la partie');
await p.click('#hmPartie .hm-pu-drop'); await p.waitForFunction(() => sheets.length === 1);
assert.equal(await sheetTop(), 'Supprimer la partie ?'); assert.match(await txt(p, '.sheet .cf-msg'), /en préparation est effacée/);
await p.click('.sheet [data-ok]'); await p.waitForFunction(() => !sheets.length);
assert.equal(await p.evaluate(() => partieLoad()), null); assert.match(await txt(p, '#hmPartie'), /Nouvelle partie/); assert.equal(await p.$eval('#hmPartie .hm-pu-drop', b => b.hidden), true);
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-setup');
await p.click('.pu-foot [data-pu="drop"]'); await p.waitForFunction(() => sheets.length === 1); await p.click('.sheet [data-ok]');
await p.waitForFunction(() => !document.querySelector('.pu') && !sheets.length); assert.equal(await p.evaluate(() => partieLoad()), null, 'depuis la préparation');
await p.evaluate(() => { partieSave(partieNew({ moi: { nom: 'Max' }, now: Date.now() - 13 * 3600e3 })); localStorage.setItem('deckdeal:partie:at', String(Date.now() - 13 * 3600e3)); puHomePaint(); });
assert.equal(await p.evaluate(() => partieLoad()), null, '13 h en préparation : effacée'); assert.match(await txt(p, '#hmPartie'), /Nouvelle partie/);
await p.evaluate(() => { const g = partieStart(partieAddPlace(partieNew({ moi: { nom: 'Max' }, now: Date.now() - 50 * 3600e3 }), { nom: 'Bob' }), { now: Date.now() - 50 * 3600e3 }); partieSave(g); localStorage.setItem('deckdeal:partie:at', String(Date.now() - 30 * 3600e3)); puHomePaint(); });
assert.ok(await p.evaluate(() => partieLoad()), 'commencée il y a 50 h, dernière action il y a 30 h : gardée'); assert.equal(await p.$eval('#hmPartie .hm-pu-drop', b => b.getAttribute('aria-label')), 'Abandonner la partie');
await p.evaluate(() => { localStorage.setItem('deckdeal:partie:at', String(Date.now() - 49 * 3600e3)); puHomePaint(); });
assert.equal(await p.evaluate(() => partieLoad()), null, '49 h sans action : effacée');
ok('partie en attente : corbeille de l\'accueil, « Supprimer cette partie » en préparation ; effacée seule après 12 h (préparation) ou 48 h (commencée)');

/* ── Préparation sans compte : invités ───────────────────────────────────────────────────────── */
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-setup');
assert.match(await txt(p, '.pu-qr'), /Connecte-toi pour que les autres rejoignent la table/);
assert.equal(await p.$eval('[data-pu="start"]', b => b.disabled), true, 'seul : pas de lancement');
for (const n of ['Léa', 'Paul', 'Zoé']) {
  await p.click('[data-pu="guest"]'); await p.waitForSelector('#puGn'); await p.fill('#puGn', n);
  if (n === 'Léa') await p.fill('#puGc', 'Atraxa, Praetors\' Voice');
  await p.click('.sheet [data-ok]'); await p.waitForFunction(n => [...document.querySelectorAll('.pu-seat b')].some(b => b.textContent.startsWith(n)), n);
}
assert.deepEqual(await p.$$eval('.pu-seat .pu-pos', x => x.map(e => e.textContent)), ['1', '2', '3', '4']);
await p.click('.pu-fmt [data-v="30"]'); assert.equal((await st()).format, 30);
await p.click('[data-pu="first"][data-pos="2"]'); assert.equal((await st()).premier, 2);
await p.screenshot({ path: 'shots/partie-1-preparation.png' });
assert.ok(await p.evaluate(() => partieLoad() && partieLoad().places.length === 4), 'préparation gardée sur l\'appareil');
await p.click('[data-pu="start"]'); await p.waitForSelector('.pu.pu-game .pu-a');
let s = await st(); assert.ok(s.debut > 0); assert.equal(s.actif, 2); assert.equal(s.places[0].vie, 30);
ok('préparation : 3 invités, 30 points, premier joueur, lancement');

/* ── Compteur A : ±1, ±10 maintenu, tuiles tournées ──────────────────────────────────────────── */
assert.deepEqual(await p.$$eval('.pu-t', t => t.map(x => x.style.getPropertyValue('--r'))), ['90deg', '270deg', '90deg', '270deg']);
await p.click('.pu-t[data-pos="3"] .pu-hit.m'); await p.click('.pu-t[data-pos="3"] .pu-hit.m'); await p.click('.pu-t[data-pos="3"] .pu-hit.p');
assert.equal((await st()).places[2].vie, 29); assert.equal(await txt(p, '.pu-t[data-pos="3"] .pu-dl'), '-1');
const box = await (await p.$('.pu-t[data-pos="1"] .pu-hit.m')).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
assert.equal((await st()).places[0].vie, 20, 'maintenu : −10');
await p.screenshot({ path: 'shots/partie-2-compteur-A.png' });
ok('compteur A : ±1 au toucher, −10 maintenu, chaque joueur tourné vers lui');
// plusieurs doigts en même temps (joueurs différents) : chaque appui compte le sien, au bon joueur ; l'appui d'un autre n'annule pas un appui maintenu
const touch = (ty, pos, d, id) => p.evaluate(([ty, pos, d, id]) => { document.querySelector(`.pu-t[data-pos="${pos}"] .pu-hit.${d < 0 ? 'm' : 'p'}`).dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11 })); }, [ty, pos, d, id]);
const lives = async () => (await st()).places.map(x => x.vie);
const keep = await st(); let v0 = await lives();
await touch('pointerdown', 2, -1, 11); await touch('pointerdown', 4, -1, 12); await touch('pointerup', 2, -1, 11); await touch('pointerup', 4, -1, 12);
assert.deepEqual(await lives(), [v0[0], v0[1] - 1, v0[2], v0[3] - 1], 'deux doigts presque ensemble : −1 chacun, au bon joueur');
v0 = await lives();
for (const [i, pos] of [1, 2, 3, 4].entries()) await touch('pointerdown', pos, -1, 21 + i);
for (const [i, pos] of [1, 2, 3, 4].entries()) await touch('pointerup', pos, -1, 21 + i);
assert.deepEqual(await lives(), v0.map(x => x - 1), 'quatre doigts (balayage du plateau) : quatre −1');
v0 = await lives();
await touch('pointerdown', 1, 1, 31); await p.waitForTimeout(200); await touch('pointerdown', 3, -1, 32); await touch('pointerup', 3, -1, 32);
await p.waitForTimeout(350); await touch('pointerup', 1, 1, 31);
assert.deepEqual(await lives(), [v0[0] + 10, v0[1], v0[2] - 1, v0[3]], 'appui maintenu (+10) pendant le −1 d\'un autre joueur : les deux comptent');
await p.evaluate(g => puSet(g), keep);      // vies d'avant (la suite les attend)
ok('compteur A : plusieurs doigts en même temps (un appui suivi par doigt) : chacun son ±1 ou son appui maintenu, au bon joueur');

/* ── Fiche d'un joueur : blessures de commandant, poison, monarque ───────────────────────────── */
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await sheetTop(), 'Hôte', 'créateur sans pseudo : « Hôte » (avant : « Moi », gardé dans l\'historique des autres)');
for (let i = 0; i < 3; i++) await p.click('.pu-sheet [data-k="b"][data-s="2"][data-n="1"]');
await p.click('.pu-sheet [data-k="c"][data-c="poison"][data-n="1"]'); await p.click('.pu-sheet [data-mk="monarque"]');
s = await st(); assert.equal(s.places[0].blessures['2'], 3); assert.equal(s.places[0].vie, 17, 'blessures de commandant : autant de vie en moins'); assert.equal(s.places[0].compteurs.poison, 1); assert.equal(s.monarque, 1);
await p.screenshot({ path: 'shots/partie-3-fiche.png' });
await closeSheets();
assert.match(await txt(p, '.pu-t[data-pos="1"] .pu-tags'), /1.*3/); assert.deepEqual(await p.$$eval('.pu-t[data-pos="1"] .pu-tags use', l => l.map(u => u.getAttribute('href'))), ['#i-crown', '#i-poison', '#i-sword'], 'monarque, poison, blessures de commandant : icônes du sprite');
ok('fiche : blessures de commandant (et la vie), poison, monarque');

/* ── Proposition d'élimination, élimination ─────────────────────────────────────────────────── */
await p.evaluate(() => puSet(partieLife(PU.st, 4, -30)));
await p.waitForSelector('.pu-t[data-pos="4"] .pu-pin'); assert.match(await txt(p, '.pu-t[data-pos="4"] .pu-pin'), /Zoé n'a plus de points de vie/);
assert.equal(await p.$('.pu-prop'), null, 'proposition dans la tuile de Zoé, plus en bas de l\'écran (elle cachait « Fin du tour »)');
assert.equal(await p.$eval('.pu-t[data-pos="4"] .pu-pin', e => getComputedStyle(e.closest('.pu-in')).transform !== 'none'), true, 'tournée vers Zoé, comme sa tuile');
await p.click('.pu-pin [data-pu="elim"]'); await p.waitForSelector('.sheet [data-ok]');
assert.equal(await p.evaluate(() => sheets[sheets.length - 1].wrap.classList.contains('pu-tsheet')), true, '« Éliminer Zoé ? » posée sur sa tuile');
await p.click('.sheet [data-ok]');
await p.waitForFunction(() => PU.st.places[3].elimine && !document.querySelector('.pu-pin'));
assert.equal(await p.$eval('.pu-t[data-pos="4"]', t => t.classList.contains('dead')), true);
ok('élimination proposée (jamais d\'office), puis faite');

/* ── Menu « … » : affichages B et C, tour suivant, annuler ───────────────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('.pu-affs');
await p.click('.pu-affs [data-aff="B"]'); await p.waitForSelector('.pu-g.aff-B .pu-b');
assert.match(await txt(p, '.pu-bar'), /Tour 1 · Léa joue/);
await p.click('.pu-bar [data-pu="next"]'); s = await st(); assert.equal(s.actif, 3);
await p.screenshot({ path: 'shots/partie-4-compteur-B.png' });
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('.pu-affs'); await p.click('.pu-affs [data-aff="C"]'); await p.waitForSelector('.pu-g.aff-C .pu-c');
await p.screenshot({ path: 'shots/partie-5-compteur-C.png' });
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('[data-m="undo"]'); await p.click('[data-m="undo"]');
assert.equal((await st()).actif, 2, 'annuler : tour suivant défait');
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:partie:aff')), 'C', 'affichage gardé');
await p.click('.pu-bar [data-pu="menu"]'); await p.waitForSelector('.pu-affs'); await p.click('.pu-affs [data-aff="A"]'); await p.waitForSelector('.pu-g.aff-A');
ok('menu « … » : trois affichages, tour suivant, annuler');

/* ── Pause, reprise depuis l'accueil ─────────────────────────────────────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('[data-m="pause"]'); await p.click('[data-m="pause"]');
await p.waitForFunction(() => !document.querySelector('.pu'));
assert.match(await txt(p, '#hmPartie'), /En cours · tour 1 · 4 joueurs Reprendre/);
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.pu-game');
ok('pause : reprise depuis l\'accueil');

/* ── Fin : vainqueur, classement, QR code du résultat, Mes parties ───────────────────────────── */
await p.click('.pu-mid'); await p.waitForSelector('[data-m="end"]'); await p.click('[data-m="end"]');
await p.waitForSelector('.pu-wins'); await p.click('.pu-wins [data-w="2"]'); await p.click('.sheet [data-ok]');
await p.waitForSelector('.pu-rank');
assert.deepEqual(await p.$$eval('.pu-rank li b', b => b.map(x => x.textContent)), ['Léa', 'Hôte', 'Paul', 'Zoé']);

assert.ok(await p.$('.pu-qr-img svg'), 'QR code du résultat');
await p.screenshot({ path: 'shots/partie-6-fin.png' });
assert.equal(await p.evaluate(() => partieLoad()), null, 'partie en cours effacée');
const hist = await p.evaluate(() => partieHist()); assert.equal(hist.length, 1); assert.equal(hist[0].moi, 1);
await p.click('.pu-foot [data-pu="close"]'); await p.waitForFunction(() => !document.querySelector('.pu'));
await p.click('#hmPartie [data-pu="hist"]'); await p.waitForSelector('.pu-hist li');
assert.match(await txt(p, '.pu-hist'), /Hôte, Léa, Paul, Zoé.*vainqueur : Léa.*1 tour/);
await closeSheets();
ok('fin : classement, QR code du résultat, Mes parties');

/* ── Lien ?partie= (résultat scanné) : c'était moi ───────────────────────────────────────────── */
const link = await p.evaluate(() => { const r = partieHist()[0]; return partieResultLink({ ...r, id: 'abcdefgh1234' }); });
const q = await newPage(browser, world, { path: link.slice(link.indexOf('?')) });
await q.p.waitForSelector('.pu-sheet [data-cl]', { timeout: 8000 });
await q.p.click('.pu-sheet [data-cl="3"]'); await q.p.waitForFunction(() => partieHist().length === 1);
assert.equal(await q.p.evaluate(() => partieHist()[0].moi), 3);
ok('lien du résultat : « c\'était moi » → Mes parties');

/* ── Lien ?table= sans compte : se connecter ou continuer en invité ──────────────────────────── */
const j = await newPage(browser, world, { path: '?table=ABCDEF' });
await j.p.waitForSelector('.pu-join.on');
await j.p.waitForFunction(() => /Table introuvable|Se connecter/.test(document.querySelector('.pu-join').textContent), null, { timeout: 8000 });
await j.p.screenshot({ path: 'shots/partie-7-rejoindre.png' });
ok('lien de la table : écran « Rejoindre la partie »');

/* ── Formats à 360 px : choix en un appui (Commander, Standard, Libre), gardé pour la fois suivante ; partie Standard à deux (20 PV, sans blessures de commandant) ── */
await j.p.close(); await q.p.close();
await p.setViewportSize({ width: 360, height: 740 }); await toHome(p);
const noOverflow = () => p.evaluate(() => {
  const W = document.documentElement.clientWidth, out = [];
  if (document.documentElement.scrollWidth > W) out.push('défilement horizontal ' + document.documentElement.scrollWidth);
  for (const e of document.querySelectorAll('.pu.on *, .sheet-wrap.open .sheet *')) { const r = e.getBoundingClientRect(); if (r.width && e.offsetParent && (r.left < -1 || r.right > W + 1) && !e.closest('.pu-qr-img, .seg-thumb')) out.push(e.className || e.tagName); }
  return [...new Set(out)].slice(0, 8);
});
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-setup .pu-jeu');
assert.equal(await p.$eval('.pu.on', e => e.getAttribute('aria-label')), 'Compteur de vie', 'nom global de l\'écran');
assert.deepEqual(await p.$$eval('.pu-jeu .seg-opt', b => b.map(x => [x.dataset.v, x.querySelector('span').textContent, x.querySelector('small').textContent, x.getAttribute('aria-checked')])),
  [['commander', 'Commander', 'jusqu\'à 8', 'true'], ['standard', 'Standard', '1 contre 1', 'false'], ['libre', 'Libre', 'PV au choix', 'false']], 'format visible, Commander par défaut');
s = await st(); assert.deepEqual([s.jeu, s.format], ['commander', 30], 'points de départ de Commander de la dernière fois (30)');
assert.ok(await p.$('.pu-fmt'), 'Commander : 40, 30, 25, 20');
await p.click('.pu-jeu [data-v="libre"]'); await p.waitForSelector('.pu-vie');
s = await st(); assert.deepEqual([s.jeu, s.format], ['libre', 20]); assert.equal(await p.$('.pu-fmt'), null);
await p.click('.pu-vie [data-n="10"]'); await p.click('.pu-vie [data-n="1"]'); assert.equal((await st()).format, 31); assert.equal(await txt(p, '.pu-vie b'), '31');
assert.match(await txt(p, '.pu-jeu-hint'), /Points de vie au choix.*Sans blessures de commandant/);
await p.click('.pu-jeu [data-v="standard"]'); await p.waitForFunction(() => PU.st.jeu === 'standard');
s = await st(); assert.deepEqual([s.jeu, s.format, s.places[0].vie], ['standard', 20, 20], 'Standard : un appui, 20 PV');
assert.equal(await p.$('.pu-fmt, .pu-vie'), null, 'Standard : pas de choix des points'); assert.match(await txt(p, '.pu-jeu-hint'), /20 points de vie, 1 contre 1.*Ni commandant ni blessures de commandant/);
assert.deepEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('deckdeal:partie:jeu'))), { j: 'standard', f: { commander: 30, standard: 20, libre: 31 } }, 'choix gardé sur l\'appareil');
assert.deepEqual(await noOverflow(), [], '360 px : rien ne déborde');
await p.screenshot({ path: 'shots/partie-8-format-360.png' });
// retenu pour la fois suivante : partie supprimée, nouvelle partie → Standard
await p.click('.pu-foot [data-pu="drop"]'); await p.waitForSelector('.sheet [data-ok]'); await p.click('.sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.pu') && !sheets.length);
await p.click('#hmPartie .hm-tr-acts [data-pu="go"]'); await p.waitForSelector('.pu.on .pu-jeu');
assert.equal(await p.$eval('.pu-jeu .seg-opt[aria-checked="true"]', b => b.dataset.v), 'standard', 'format de la dernière fois'); assert.equal((await st()).format, 20);
await p.click('[data-pu="guest"]'); await p.waitForSelector('#puGc');
assert.equal(await txt(p, 'label[for="puGc"]'), 'Deck (facultatif)', 'Standard : le deck de l\'invité, pas de commandant');
await p.fill('#puGn', 'Bob'); await p.fill('#puGc', 'Mono-vert'); await p.click('.sheet [data-ok]');
await p.waitForFunction(() => PU.st.places.length === 2);
assert.deepEqual(await p.evaluate(() => PU.st.places[1].deck), { nom: 'Mono-vert' }); assert.match(await txt(p, '.pu-seats'), /Bob Mono-vert/);
await p.click('[data-pu="start"]'); await p.waitForSelector('.pu.pu-game .pu-a');
assert.deepEqual(await p.$$eval('.pu-t', t => t.map(x => [x.dataset.pos, x.style.getPropertyValue('--r')])), [['2', '180deg'], ['1', '0deg']], 'à deux : face à face');
await p.waitForSelector('.pu-roll.j1', { timeout: 6000 }); await p.click('.pu-roll'); assert.equal(await p.$('.pu-roll'), null, 'premier joueur tiré au lancement : affiché jusqu\'à un toucher');
assert.deepEqual(await p.$$eval('.pu-t .pu-life', b => b.map(x => x.textContent)), ['20', '20']);
await p.click('.pu-t[data-pos="2"] .pu-hit.m'); assert.equal((await st()).places[1].vie, 19);
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await p.$('.pu-sheet [data-k="b"]'), null, 'pas de blessures de commandant'); assert.equal(await p.$('.pu-sheet [data-c="impot"]'), null, 'pas d\'impôt de commandant');
assert.equal(await p.$('.pu-sheet [data-mk]'), null, 'ni monarque ni initiative'); assert.doesNotMatch(await txt(p, '.pu-sheet'), /commandant/i);
assert.deepEqual(await p.$$eval('.pu-sheet [data-k="c"][data-n="1"]', b => b.map(x => x.dataset.c)), ['poison', 'energie', 'experience']);
assert.deepEqual(await noOverflow(), [], '360 px : fiche du joueur');
for (let i = 0; i < 10; i++) await p.click('.pu-sheet [data-k="c"][data-c="poison"][data-n="1"]');
await closeSheets(); await p.waitForSelector('.pu-pin'); assert.match(await txt(p, '.pu-t[data-pos="1"] .pu-pin'), /Hôte a 10 marqueurs poison/);
await p.screenshot({ path: 'shots/partie-9-standard-360.png' });
await p.click('.pu-pin [data-pu="elim"]'); await p.waitForSelector('.sheet [data-c]');
assert.deepEqual(await p.$$eval('.sheet [data-c]', b => b.map(x => x.dataset.c)), ['vie', 'poison', 'abandon', 'autre'], 'causes : pas de blessures de commandant');
await p.click('.sheet [data-c="poison"]'); await p.click('.sheet [data-ok]'); await p.waitForFunction(() => PU.st.places[0].elimine);
await p.evaluate(() => puEndSheet()); await p.waitForSelector('.pu-wins [data-w="2"][aria-pressed="true"]'); await p.click('.sheet [data-ok]'); await p.waitForSelector('.pu-rank');
assert.match(await txt(p, '.pu .dv-title span'), /^Standard · 1 tour/); assert.deepEqual(await p.$$eval('.pu-rank li b', b => b.map(x => x.textContent)), ['Bob', 'Hôte']);
const h2 = await p.evaluate(() => partieHist()); assert.deepEqual([h2.length, h2[0].jeu, h2[0].format, h2[1].jeu], [2, 'standard', 20, undefined], 'historique : partie Standard marquée');
assert.deepEqual(await noOverflow(), [], '360 px : fin de partie');
await p.click('.pu-foot [data-pu="close"]'); await p.waitForFunction(() => !document.querySelector('.pu'));
await p.click('#hmPartie [data-pu="hist"]'); await p.waitForSelector('.pu-hist li');
assert.equal(await p.$$eval('.pu-hist .pu-jtag', t => t.map(x => x.textContent).join()), 'Standard', 'Mes parties : la partie Standard marquée');
await p.click('.pu-tabs [data-v="stats"]'); await p.waitForSelector('.pu-sjeu');
assert.deepEqual(await p.$$eval('.pu-sjeu button', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim())), ['Tous 2', 'Commander 1', 'Standard 1'], 'statistiques : Standard compté à part');
await p.click('.pu-sjeu [data-sj="standard"]'); await p.waitForFunction(() => document.querySelector('.pu-sjeu [data-sj="standard"]').getAttribute('aria-pressed') === 'true');
assert.deepEqual((await p.$$eval('.pu-kpis > div', d => d.map(x => [...x.children].map(c => c.textContent).join(' ')))).slice(0, 2), ['1 partie', '0 % 0 victoire'], 'Standard seul');
assert.match(await txt(p, '.pu-hbody'), /Adversaires.*Bob/); assert.doesNotMatch(await txt(p, '.pu-hbody'), /Commandants à ta table/, 'Standard : pas de commandants à ta table');
await p.click('.pu-sjeu [data-sj="commander"]'); await p.waitForFunction(() => /Commandants à ta table/.test(document.querySelector('.pu-hbody').textContent));
assert.deepEqual(await noOverflow(), [], '360 px : statistiques');
await p.screenshot({ path: 'shots/partie-10-stats-formats-360.png' });
await closeSheets();
// résultat Standard scanné (?partie=) : le format suit
const linkS = await p.evaluate(() => partieResultLink({ ...partieHist()[0], id: 'stdlink00001' }));
const qs = await newPage(browser, world, { path: linkS.slice(linkS.indexOf('?')) });
await qs.p.waitForSelector('.pu-sheet [data-cl]', { timeout: 8000 }); assert.match(await qs.p.evaluate(() => sheets[sheets.length - 1].wrap.querySelector('.sheet-head').textContent), /Standard/);
await qs.p.click('.pu-sheet [data-cl="2"]'); await qs.p.waitForFunction(() => partieHist().length === 1);
assert.deepEqual(await qs.p.evaluate(() => [partieHist()[0].jeu, partieHist()[0].moi]), ['standard', 2]);
assert.deepEqual(qs.errs, []); await qs.p.close();
ok('formats à 360 px : un appui (Commander, Standard, Libre ±), gardé pour la fois suivante ; Standard à deux : 20 PV, invité avec son deck, ni blessures de commandant ni impôt ni monarque, poison ; fin, Mes parties marquées, statistiques par format, lien du résultat');

/* ── Bouton rond, tailles, illustrations, nom-bouton : de 2 à 8 joueurs, trois affichages, quatre écrans ───────────────────────── */
// partie de n joueurs ouverte d'office (moi : Martin, avec l'image de son deck ; Léa : poison, monarque ; les autres sans image)
const IMG = 'https://cards.scryfall.io/small/front/a/b/x0.jpg';
const game = (n, aff) => p.evaluate(async ({ n, aff, IMG }) => {
  if (PU.el) { puClose(); await new Promise(r => setTimeout(r, 300)); }
  while (sheets.length) sheets[sheets.length - 1].close();
  const names = ['Martin', 'Léa', 'Paul', 'Zoé', 'Hugo', 'Inès', 'Noah', 'Jade'];
  let g = partieNew({ moi: { nom: names[0], deck: { nom: 'Atraxa', commandant: 'Atraxa, Praetors\' Voice', image: IMG } }, now: Date.now() });
  for (let i = 1; i < n; i++) g = partieAddPlace(g, { nom: names[i], deck: { commandant: i === 1 ? 'Yuriko, the Tiger\'s Shadow' : 'Commandant numéro ' + i } });
  g = partieFirst(partieStart(g), 1); g = partieMark(partieCounter(g, 2, 'poison', 3), 'monarque', 2);
  partieSave(g); localStorage.setItem('deckdeal:partie:aff', aff); puGo();
}, { n, aff, IMG }).then(() => p.waitForSelector('.pu.on .pu-g.aff-' + aff + ' .pu-t')).then(() => p.waitForTimeout(400));      // l'écran finit d'arriver (glissé de 14 px)
// boîtes englobantes : le bouton rond ne touche ni un nom, ni des PV, ni un signe − / +, ni « Fin du tour » ; il est sur une jointure (entre deux tuiles) ;
// les tuiles ne se chevauchent pas et restent dans l'écran ; dans chaque tuile, les PV (sans le blanc de leur ligne) ne touchent ni le nom ni « Fin du tour »
const layout = () => p.evaluate(() => {
  const out = [], R = e => e.getBoundingClientRect(), X = (a, b, m = 0) => a.left < b.right - m && a.right > b.left + m && a.top < b.bottom - m && a.bottom > b.top + m;
  const mid = document.querySelector('.pu-mid'), ts = [...document.querySelectorAll('.pu-t')];
  if (mid) {
    const m = R(mid), c = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
    for (const e of document.querySelectorAll('.pu-nm, .pu-life, .pu-hit > span, .pu-turn')) if (X(R(e), m)) out.push('rond sur ' + e.className + ' (' + e.closest('.pu-t').dataset.pos + ')');
    if (ts.some(t => { const r = R(t); return c.x > r.left + 2 && c.x < r.right - 2 && c.y > r.top + 2 && c.y < r.bottom - 2; })) out.push('rond au milieu d\'une tuile');
  }
  for (let i = 0; i < ts.length; i++) {
    const a = R(ts[i]); if (a.left < -1 || a.right > innerWidth + 1 || a.top < -1 || a.bottom > innerHeight + 1) out.push('tuile hors de l\'écran ' + ts[i].dataset.pos);
    for (let k = i + 1; k < ts.length; k++) if (X(a, R(ts[k]))) out.push('tuiles l\'une sur l\'autre ' + ts[i].dataset.pos + '/' + ts[k].dataset.pos);
    const l = R(ts[i].querySelector('.pu-life')), rv = ts[i].classList.contains('rv'), dx = rv ? l.width * .2 : 0, dy = rv ? 0 : l.height * .2, L = { left: l.left + dx, right: l.right - dx, top: l.top + dy, bottom: l.bottom - dy };
    for (const e of ts[i].querySelectorAll('.pu-nm, .pu-turn')) if (X(R(e), L, 3)) out.push('PV sur ' + e.className + ' (' + ts[i].dataset.pos + ')');
  }
  return out;
});
const lifePx = () => p.$$eval('.pu-t .pu-life', b => b.map(x => parseFloat(getComputedStyle(x).fontSize)));
for (const [W, H] of [[390, 844], [360, 740], [360, 640], [430, 932]]) {
  await p.setViewportSize({ width: W, height: H });
  for (let n = 2; n <= 8; n++) for (const aff of ['A', 'B', 'C']) {
    await game(n, aff);
    assert.deepEqual(await layout(), [], `${W}×${H}, ${n} joueurs, affichage ${aff}`);
    assert.ok(Math.min(...await lifePx()) >= (n <= 4 ? 44 : 34), `${W}×${H}, ${n} joueurs, ${aff} : PV lisibles (${await lifePx()})`);
    if (aff === 'A') {
      const midOn = await p.evaluate(() => [...document.querySelectorAll('.pu-t[data-m]')].map(t => t.dataset.m).sort().join(''));
      assert.equal(midOn, n === 2 ? 'cc' : n === 3 ? 'clr' : 'llrr', `${n} joueurs : les tuiles qui touchent le bouton rond écartent leur nom`);
    }
  }
}
await game(5, 'A'); await p.screenshot({ path: 'shots/partie-11-A-5.png' });
ok('bouton rond « … » sur une jointure (jamais sur un nom, des PV, un signe − / +), tuiles sans chevauchement, PV à la taille des tuiles : 2 à 8 joueurs, A B C, 360 à 430 px');

// nom : un bouton (icône de réglages, bordure), assez grand au doigt, les compteurs non nuls dedans ; il ouvre la fiche (son commandant en sous-titre)
await p.setViewportSize({ width: 390, height: 844 }); await game(4, 'A');
const nm = await p.$eval('.pu-t[data-pos="2"] .pu-nm', b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { tags: [...b.querySelectorAll('.pu-tags use')].map(u => u.getAttribute('href')), ic: !!b.querySelector('.pu-nm-i use[href="#i-sliders"]'), thick: Math.min(r.width, r.height), border: cs.borderTopWidth, title: b.title }; });
assert.deepEqual(nm.tags, ['#i-crown', '#i-poison'], 'monarque et poison dans le bouton du nom'); assert.ok(nm.ic, 'icône de réglages'); assert.ok(nm.thick >= 36, 'au doigt : ' + nm.thick); assert.equal(nm.border, '1px'); assert.match(nm.title, /Fiche du joueur/);
await p.click('.pu-t[data-pos="2"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await sheetTop(), 'Léa'); assert.match(await p.evaluate(() => sheets[sheets.length - 1].wrap.querySelector('.sheet-head').textContent), /Yuriko, the Tiger's Shadow/, 'fiche : son commandant en sous-titre');
await p.click('.pu-sheet [data-k="v"][data-n="-10"]'); await closeSheets();
await p.click('.pu-mid'); await p.waitForSelector('[data-m="undo"]'); assert.equal(await txt(p, '[data-m="undo"] small'), 'Léa : −10 PV', 'annuler : ce qui sera défait, en clair'); await closeSheets();
await p.click('.pu-t[data-pos="3"] .pu-hit.p'); assert.equal(await p.$eval('.pu-t[data-pos="3"] .pu-hit.p', h => h.classList.contains('fl')), true, '+1 : la moitié touchée s\'allume');
assert.equal(await p.evaluate(() => { const d = TIP_DEFS.pnm; return d[0](PU.el) && d[1](PU.el) === PU.el.querySelector('.pu-nm'); }), true, 'astuce de la première fois (tour.js) : le nom d\'un joueur');
ok('nom d\'un joueur : bouton (réglages, bordure, compteurs dedans), fiche avec son commandant ; « Annuler » dit quoi ; ±1 visible ; astuce');

// illustration du commandant en fond (art_crop), gardée d'un appui à l'autre ; invité qui a tapé un nom connu de Scryfall : son image retrouvée ; sans image : rien
const arts = () => p.$$eval('.pu-t', t => t.map(x => [x.dataset.pos, (x.querySelector('img.pu-art') || {}).src || ''].join(' ')));
assert.deepEqual((await arts()).filter(x => !x.endsWith(' ')), ['1 https://cards.scryfall.io/art_crop/front/a/b/x0.jpg'], 'image du deck en art_crop ; sans image (commandant inconnu de Scryfall) : rien');
assert.equal(await p.$eval('.pu-t[data-pos="1"]', t => t.classList.contains('art') && getComputedStyle(t.querySelector('.pu-bg'), '::after').backgroundImage.includes('gradient')), true, 'dégradé de sa couleur par-dessus');
const img1 = await p.$('.pu-t[data-pos="1"] img.pu-art'); await p.click('.pu-t[data-pos="1"] .pu-hit.m');
assert.equal(await img1.evaluate(e => e.isConnected && !!e.closest('.pu-t[data-pos="1"]')), true, 'la même image après −1 (pas de clignotement)');
for (const aff of ['B', 'C']) { await game(3, aff); assert.match((await arts()).find(a => a.startsWith('1 ')), /art_crop\/front\/a\/b\/x0\.jpg$/, 'affichage ' + aff); }
await p.evaluate(() => { const g = partieAddPlace(partieNew({ moi: { nom: 'Max' } }), { sorte: 'invite', nom: 'Bob', deck: { commandant: 'Edgar Markov' } }); partieSave(partieStart(g)); localStorage.setItem('deckdeal:partie:aff', 'A'); puClose(); });
await p.waitForTimeout(300); await p.evaluate(() => puGo());
await p.waitForFunction(() => /art_crop\/front\/a\/b\/edgar-markov\.jpg/.test((document.querySelector('.pu-t[data-pos="2"] img.pu-art') || {}).src || ''), null, { timeout: 8000 });
assert.equal(await p.$('.pu-t[data-pos="1"] img.pu-art'), null, 'sans deck : pas d\'image');
assert.equal(await p.evaluate(() => puArtUrl('https://cards.scryfall.io/png/front/1/2/abc.png?123')), 'https://cards.scryfall.io/art_crop/front/1/2/abc.jpg?123'); assert.equal(await p.evaluate(() => puArtUrl('https://example.com/small/a.jpg')), '');
// mon deck à la préparation : commandant hors de la collection, fiche jamais lue (« Mes decks » pas ouvert) → lue à l'instant, l'image suit la place
await p.evaluate(() => { puClose(); partieClear(); D.localList.push({ id: 'dkv', name: 'Vampires', text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring', updatedAt: Date.now() }); for (const k in DM) delete DM[k]; dmTried.clear(); });
await p.waitForTimeout(300); await p.evaluate(() => puGo()); await p.waitForSelector('.pu.on select[data-pu="mydeck"]');
assert.equal(await p.evaluate(() => puDeckImg(D.localList.find(d => d.id === 'dkv'))), '', 'fiche pas encore connue');
await p.selectOption('select[data-pu="mydeck"]', 'dkv');
await p.waitForFunction(() => (PU.st.places[0].deck || {}).image === 'https://cards.scryfall.io/small/front/a/b/edgar-markov.jpg', null, { timeout: 8000 });
await p.waitForSelector('.pu-mydk img.pu-art[src*="art_crop/front/a/b/edgar-markov.jpg"]'); assert.match(await txt(p, '.pu-mydk'), /Edgar Markov/);
await p.screenshot({ path: 'shots/partie-12-mon-deck.png' });
// deck sans commandant (Standard « Elfes ») : l'image choisie pour le deck (ligne « Deck Deal cover »), comme dans « Mes decks »
await p.evaluate(() => D.localList.push({ id: 'dke', name: 'Elfes', text: '// Deck Deal cover : Craterhoof Behemoth\nDeck\n4 Llanowar Elves\n1 Craterhoof Behemoth\n16 Forest', updatedAt: Date.now() }));
assert.equal(await p.evaluate(() => puDeckImgLoad(D.localList.find(d => d.id === 'dke'))), 'https://cards.scryfall.io/small/front/a/b/craterhoof-behemoth.jpg', 'Standard : la carte de présentation choisie');
await p.click('.pu-foot [data-pu="drop"]'); await p.waitForSelector('.sheet [data-ok]'); await p.click('.sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.pu') && !sheets.length);
ok('illustration du commandant en fond (art_crop, dégradé, A B C), gardée d\'un appui à l\'autre ; invité : retrouvée par son nom ; mon deck : fiche lue à l\'instant, l\'image suit ; deck sans commandant : son image de présentation');

/* ── Paysage : téléphone posé à plat qui bascule, tablette, ordinateur ─────────────────────────────────────────────────────────────────────────────
   A : la table du portrait tournée d'un quart de tour (rangées à 0° et 180°, le joueur seul à un bout), chaque tuile vue par son joueur à la même taille qu'en portrait ;
   B : plusieurs colonnes ; C : deux rangées autour de la table. Sens d'après l'écran (angle 270 : dans l'autre sens) ; repeint quand l'écran tourne ; orientation gardée. */
const tilesPv = () => p.$$eval('.pu-t', t => t.map(x => {
  const r = ((parseFloat(getComputedStyle(x).getPropertyValue('--r')) || 0) % 360 + 360) % 360, rv = r === 90 || r === 270, h = x.querySelector('.pu-hit'), hb = h && h.getBoundingClientRect(), b = x.querySelector('.pu-nm-w b');
  return { pos: +x.dataset.pos, r, pv: Math.round(parseFloat(getComputedStyle(x.querySelector('.pu-life')).fontSize)), hit: hb ? Math.round(rv ? hb.height : hb.width) : 0, cut: b.scrollWidth > b.clientWidth + 1 };
}));
for (const [W, H] of [[393, 852], [360, 780], [430, 932]]) for (let n = 2; n <= 8; n++) {
  await p.setViewportSize({ width: W, height: H }); await game(n, 'A'); const por = await tilesPv();
  await p.setViewportSize({ width: H, height: W }); await p.waitForFunction(() => document.querySelector('.pu-a.land'), null, { timeout: 3000 }); await p.waitForTimeout(150);
  const lan = await tilesPv();
  assert.deepEqual(await layout(), [], `${H}×${W} (paysage), ${n} joueurs, A`);
  assert.ok(Math.min(...lan.map(x => x.pv)) >= Math.min(...por.map(x => x.pv)) - 1, `${n} joueurs : PV en paysage (${lan.map(x => x.pv)}) au moins ceux du portrait (${por.map(x => x.pv)})`);
  assert.ok(Math.min(...lan.map(x => x.hit)) >= 44, `${n} joueurs : moitiés − / + d'au moins 44 px vues par le joueur (${lan.map(x => x.hit)})`);
  assert.ok(lan.filter(x => x.cut).length <= por.filter(x => x.cut).length, `${n} joueurs : pas plus de noms coupés qu'en portrait`);
  for (const aff of ['B', 'C']) {
    await game(n, aff); assert.deepEqual(await layout(), [], `${H}×${W} (paysage), ${n} joueurs, ${aff}`);
    const pv = Math.min(...(await tilesPv()).map(x => x.pv)), hit = Math.min(...(await p.$$eval('.pu-t .pu-hit', h => h.map(x => Math.round(Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width))))));
    assert.ok(pv >= (n <= 4 ? 80 : 54), `${H}×${W}, ${n} joueurs, ${aff} : PV lisibles en paysage (${pv})`); assert.ok(hit >= 44, `${n} joueurs, ${aff} : cibles de 44 px (${hit})`);
  }
}
await p.setViewportSize({ width: 852, height: 393 }); await game(4, 'A');
const cellsOf = () => p.$$eval('.pu-cell', c => c.map(x => { const t = x.querySelector('.pu-t'); return [+t.dataset.pos, t.style.getPropertyValue('--r'), x.style.gridRow.split(' ')[0], x.style.gridColumn.split(' ')[0]].join(' '); }).sort());
assert.deepEqual(await cellsOf(), ['1 0deg 2 2', '2 0deg 2 1', '3 180deg 1 1', '4 180deg 1 2'], 'paysage : colonne de gauche du portrait en bas (0°), la droite en haut (180°), dans le même ordre autour de la table');
await p.evaluate(() => { Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => 270 }); puPaint(); });
assert.deepEqual(await cellsOf(), ['1 180deg 1 1', '2 180deg 1 2', '3 0deg 2 2', '4 0deg 2 1'], 'écran tourné dans l\'autre sens (270°) : la table aussi (chaque tuile reste sur le même bord du téléphone)');
await p.evaluate(() => { delete screen.orientation.angle; });
await game(5, 'A'); assert.equal(await p.$eval('.pu-t[data-pos="1"]', t => t.style.getPropertyValue('--r')), '270deg', '5 joueurs : le joueur seul à un bout, tourné vers lui');
await p.setViewportSize({ width: 393, height: 852 }); await p.waitForFunction(() => !document.querySelector('.pu-a.land'), null, { timeout: 3000 });
assert.equal(await p.$eval('.pu-t[data-pos="1"]', t => t.style.getPropertyValue('--r')), '0deg', 'l\'écran tourne : remis en page sans rouvrir la partie');
await p.screenshot({ path: 'shots/partie-13-paysage-retour.png' });
// orientation gardée pendant la partie (navigateur : screen.orientation.lock sur l'orientation du moment), rendue à la fermeture
await p.evaluate(() => { puClose(); window.__ol = []; screen.orientation.lock = t => { window.__ol.push(t); return Promise.resolve(); }; screen.orientation.unlock = () => window.__ol.push('unlock'); });
await p.waitForTimeout(300); await p.evaluate(() => puGo()); await p.waitForSelector('.pu.on .pu-t');
assert.deepEqual(await p.evaluate(() => window.__ol), ['portrait-primary'], 'compteur : orientation gardée');
await p.evaluate(() => puClose()); assert.deepEqual(await p.evaluate(() => window.__ol), ['portrait-primary', 'unlock'], 'fermé : rendue');
ok('paysage : A tourné d\'un quart de tour (PV, noms, cibles ≥ portrait), B en colonnes, C en deux rangées, 2 à 8 joueurs, 360 à 430 px ; sens de l\'écran, remis en page quand il tourne ; orientation gardée pendant la partie');

/* ── Tuile qui joue : « Fin du tour » posé en bas (44 px au doigt), ses PV aussi grands que ceux des autres ; 4 chiffres ; clavier ─────── */
for (const [W, H, n] of [[360, 780, 4], [393, 852, 3], [393, 852, 6], [820, 1180, 4]]) {
  await p.setViewportSize({ width: W, height: H }); await game(n, 'A');
  const pv = await tilesPv(), act = await p.evaluate(() => PU.st.actif), me = pv.find(x => x.pos === act), peers = pv.filter(x => x.pos !== act && x.r === me.r);
  if (peers.length) assert.ok(me.pv >= Math.min(...peers.map(x => x.pv)) - 1, `${W}×${H}, ${n} joueurs : PV de la tuile qui joue aussi grands que ceux des autres (${pv.map(x => x.pos + ':' + x.pv)})`);
  assert.deepEqual(await layout(), [], 'PV jamais sous « Fin du tour »');
  const hitOk = await p.$eval('.pu-t.act .pu-turn', b => { const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rv = r.width < r.height, d = 4; const pts = rv ? [[r.left - d, cy], [r.right + d, cy]] : [[cx, r.top - d], [cx, r.bottom + d]]; return pts.every(([x, y]) => document.elementFromPoint(x, y) === b) && Math.min(r.width, r.height) >= 34; });
  assert.ok(hitOk, '« Fin du tour » : 44 px au doigt');
}
await p.setViewportSize({ width: 393, height: 852 }); await game(4, 'A');
await p.evaluate(() => puSet(partieLife(PU.st, 3, 1000 - PU.st.places[2].vie)));
assert.equal(await p.$eval('.pu-t[data-pos="3"] .pu-life', e => e.classList.contains('l4')), true, '4 chiffres : plus petits');
assert.equal(await p.$eval('.pu-t[data-pos="3"]', t => { const l = t.querySelector('.pu-life').getBoundingClientRect(), s = [...t.querySelectorAll('.pu-hit > span')].map(x => x.getBoundingClientRect()); return s.every(x => x.bottom < l.top || x.top > l.bottom || x.right < l.left || x.left > l.right); }), true, '« 1000 » ne passe pas sur le − ni le +');
await p.focus('.pu-t[data-pos="2"] .pu-hit.m'); await p.keyboard.press('Enter'); await p.keyboard.press(' ');
assert.equal(await p.evaluate(() => PU.st.places[1].vie), 38, 'clavier : Entrée puis Espace, deux fois −1');
assert.equal(await p.evaluate(() => document.activeElement.matches('.pu-t[data-pos="2"] .pu-hit.m')), true, 'le focus reste sur « − » après le repeint de la tuile');
ok('tuile qui joue : « Fin du tour » posé en bas (44 px), PV de même taille que les autres ; 4 chiffres plus petits ; clavier : le focus reste après ±1');

/* ── Fiche sur la tuile du joueur, tournée vers lui (A, C) ; B : feuille du bas. ±5 et − / + maintenus pour les blessures de commandant ────────── */
await game(4, 'A');
for (const pos of [1, 2, 3, 4]) {
  await p.click(`.pu-t[data-pos="${pos}"] .pu-nm`); await p.waitForSelector('.pu-tsheet.open .pu-lifebig');
  await p.waitForTimeout(350);      // fin du zoom d'ouverture
  const f = await p.evaluate(pos => { const s = document.querySelector('.pu-tsheet .sheet'), t = document.querySelector(`.pu-t[data-pos="${pos}"]`), b = s.getBoundingClientRect(), tb = t.getBoundingClientRect(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    return { r: s.style.getPropertyValue('--r'), tr: t.style.getPropertyValue('--r'), in: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, over: !(tb.right < b.left || tb.left > b.right || tb.bottom < b.top || tb.top > b.bottom),
      btn: Math.min(...[...s.querySelectorAll('.qstep button, .pu-lifebig button, .pu-marks button')].map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); })) }; }, pos);
  assert.equal(f.r, f.tr, `fiche de ${pos} tournée comme sa tuile`); assert.ok(f.in && f.over, `fiche de ${pos} sur sa tuile, dans l'écran ${JSON.stringify(f)}`); assert.ok(f.btn >= 44, `fiche : boutons de 44 px (${f.btn})`);
  if (pos === 2) await p.screenshot({ path: 'shots/partie-14-fiche-tuile.png' });
  await closeSheets(); await p.waitForTimeout(250);
}
const bl = () => p.evaluate(() => [PU.st.places[1].blessures['1'] || 0, PU.st.places[1].vie]);
await p.click('.pu-t[data-pos="2"] .pu-nm'); await p.waitForSelector('.pu-tsheet.open [data-k="b"][data-s="1"][data-n="5"]');
const vb0 = (await bl())[1];
await p.click('.pu-tsheet [data-k="b"][data-s="1"][data-n="5"]'); assert.deepEqual(await bl(), [5, vb0 - 5], '+5 blessures du commandant de Martin (les PV suivent)');
const hb = await (await p.$('.pu-tsheet [data-k="b"][data-s="1"][data-n="1"]')).boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up(); await p.waitForTimeout(200);
const held = (await bl())[0]; assert.ok(held >= 8 && held <= 14, '+ maintenu : répété (' + held + ')');
await p.click('.pu-tsheet [data-k="b"][data-s="1"][data-n="-5"]'); assert.equal((await bl())[0], held - 5, '−5');
await closeSheets(); await p.waitForTimeout(250);
await p.evaluate(() => { localStorage.setItem('deckdeal:partie:aff', 'B'); puPaint(); }); await p.click('.pu-t[data-pos="2"] .pu-nm'); await p.waitForSelector('.pu-sheet.open .pu-lifebig');
assert.equal(await p.evaluate(() => sheets[sheets.length - 1].wrap.classList.contains('pu-tsheet')), false, 'B (liste) : la feuille du bas, comme avant'); await closeSheets(); await p.waitForTimeout(250);
await p.evaluate(() => { localStorage.setItem('deckdeal:partie:aff', 'C'); puPaint(); }); await p.click('.pu-t[data-pos="3"] .pu-nm'); await p.waitForSelector('.pu-tsheet.open .pu-lifebig');
await closeSheets(); await p.waitForTimeout(250);
ok('fiche du joueur sur sa tuile, tournée vers lui (A, C ; 4 joueurs, chaque côté), dans l\'écran, boutons de 44 px ; blessures de commandant ±5 et + maintenu ; B : feuille du bas');

/* ── Mode « attaque » : l'attaquant (fiche › Attaquer), − / + sur chaque défenseur touché ; Fin de l'attaque, Retour, tour suivant ──────── */
await game(4, 'A');
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-tsheet [data-x="atk"]'); await p.click('.pu-tsheet [data-x="atk"]');
await p.waitForSelector('.pu-t.atk-a[data-pos="1"] [data-pu="atk-end"]');
assert.deepEqual((await p.$$eval('.pu-t.atk-d', t => t.map(x => [x.dataset.pos, x.querySelector('.pu-atk-n').textContent.replace(/\s+/g, ' ').trim()]))).sort(), [['2', 'de Martin0'], ['3', 'de Martin0'], ['4', 'de Martin0']], 'chaque défenseur : ses blessures reçues de l\'attaquant');
const lv = () => p.evaluate(() => PU.st.places.map(x => [x.vie, x.blessures['1'] || 0]));
const l0 = await lv();
await p.click('.pu-t[data-pos="2"] .pu-hit.p'); await p.click('.pu-t[data-pos="2"] .pu-hit.p'); await p.click('.pu-t[data-pos="4"] .pu-hit.p');
const l1 = await lv(); assert.deepEqual([l1[1], l1[3]], [[l0[1][0] - 2, 2], [l0[3][0] - 1, 1]], '+ sur un défenseur : une blessure de plus, un point de vie de moins');
assert.match(await txt(p, '.pu-t[data-pos="2"] .pu-atk-n'), /de Martin ?2/); assert.equal(await p.$('.pu-t[data-pos="1"] .pu-hit'), null, 'l\'attaquant ne se touche pas');
const hp = await (await p.$('.pu-t[data-pos="3"] .pu-hit.p')).boundingBox();
await p.mouse.move(hp.x + hp.width / 2, hp.y + hp.height / 2); await p.mouse.down(); await p.waitForTimeout(1000); await p.mouse.up();
const h3 = (await lv())[2][1]; assert.ok(h3 >= 2 && h3 <= 4, '+ maintenu : +1 répété (' + h3 + ')');
await p.screenshot({ path: 'shots/partie-15-attaque.png' });
assert.equal(await p.evaluate(() => backClose()), true); assert.equal((await p.evaluate(() => [!!PU.atk, !!PU.el])).join(), 'false,true', 'Retour : fin de l\'attaque, la partie reste ouverte');
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.click('.pu-tsheet [data-x="atk"]'); await p.waitForSelector('.pu-t.atk-a');
await p.evaluate(() => puSet(partieNextTurn(PU.st))); assert.equal(await p.evaluate(() => PU.atk), null, 'tour suivant : fin de l\'attaque');
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.click('.pu-tsheet [data-x="atk"]'); await p.click('[data-pu="atk-end"]'); assert.equal(await p.$('.pu-t.atk-a'), null, '« Fin de l\'attaque »');
assert.equal(await p.evaluate(() => PU.st.journal.filter(e => e.a === 'b').length > 0), true, 'dans le journal (annuler)');
ok('mode « attaque » : attaquant choisi par sa fiche, − / + sur chaque défenseur (blessures et PV), maintenu répété ; fin par le bouton, Retour ou le tour suivant');

/* ── Dés et pièce (crypto.getRandomValues), résultat dans chaque tuile tourné vers son joueur ; premier joueur tiré au lancement, animé ─────── */
await game(4, 'A');
await p.evaluate(() => { window.__cr = 0; const g = crypto.getRandomValues.bind(crypto); crypto.getRandomValues = a => { window.__cr++; return g(a); }; });
await p.click('.pu-mid'); await p.waitForSelector('.pu-dice [data-roll="d20"]');
assert.deepEqual(await p.$$eval('.pu-dice button', b => b.map(x => x.dataset.roll)), ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'pf']);
assert.ok(Math.min(...await p.$$eval('.pu-dice button', b => b.map(x => x.getBoundingClientRect().height))) >= 44, 'dés : 44 px');
await p.click('[data-roll="d20"]'); await p.waitForTimeout(900);
const roll = await p.evaluate(() => ({ v: PU.roll.v, shown: [...document.querySelectorAll('.pu-t .pu-roll b')].map(b => b.textContent), r: [...document.querySelectorAll('.pu-t')].map(t => t.querySelector('.pu-roll') ? t.style.getPropertyValue('--r') : '') }));
assert.ok(roll.v >= 1 && roll.v <= 20, 'd20 : ' + roll.v); assert.deepEqual(roll.shown, Array(4).fill(String(roll.v)), 'le même résultat dans chaque tuile'); assert.ok(roll.r.every(Boolean), 'dans chaque tuile, tourné avec elle');
assert.ok(await p.evaluate(() => window.__cr) > 0, 'hasard : crypto.getRandomValues');
await p.screenshot({ path: 'shots/partie-16-de.png' });
await p.click('.pu-t[data-pos="3"] .pu-roll'); assert.equal(await p.$('.pu-roll'), null, 'toucher : fermé partout');
const freq = await p.evaluate(() => { const c = Array(6).fill(0); for (let i = 0; i < 6000; i++) c[puRandInt(6)]++; return c; }); assert.ok(freq.every(x => x > 850 && x < 1150), 'd6 uniforme : ' + freq);
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.click('.pu-mid'); await p.click('[data-roll="pf"]');
assert.match(await p.$eval('.pu-roll b', b => b.textContent), /^(Pile|Face)$/, 'pile ou face, sans animation (prefers-reduced-motion) : tout de suite');
assert.equal(await p.evaluate(() => backClose()), true, 'Retour : le résultat se ferme'); assert.equal(await p.$('.pu-roll'), null);
await p.emulateMedia({ reducedMotion: 'no-preference' });
// premier joueur tiré au lancement (« Au hasard ») : les tuiles s'allument tour à tour, puis « Léa commence » partout (« Tu commences ! » chez elle)
await p.evaluate(async () => { puClose(); await new Promise(r => setTimeout(r, 300)); let g = partieNew({ moi: { nom: 'Martin' } }); for (const n of ['Léa', 'Paul', 'Zoé']) g = partieAddPlace(g, { nom: n }); partieSave(g); localStorage.setItem('deckdeal:partie:aff', 'A'); puGo(); });
await p.waitForSelector('.pu-setup [data-pu="first"][data-pos="0"][aria-pressed="true"]'); await p.click('[data-pu="start"]');
await p.waitForFunction(() => document.querySelector('.pu-t.spin'), null, { timeout: 3000 });
await p.waitForSelector('.pu-roll.j1', { timeout: 6000 });
const dr = await p.evaluate(() => ({ prem: PU.st.premier, actif: PU.st.actif, v: PU.roll.v, me: document.querySelector('.pu-roll.j1.me').closest('.pu-t').dataset.pos, txt: [...document.querySelectorAll('.pu-roll.j1 b')].map(b => b.textContent) }));
assert.equal(dr.v, dr.prem); assert.equal(dr.actif, dr.prem); assert.equal(Number(dr.me), dr.prem, 'sa tuile : « Tu commences ! »');
assert.equal(dr.txt.filter(t => t === 'Tu commences !').length, 1); assert.equal(dr.txt.filter(t => / commence$/.test(t)).length, 3);
await p.screenshot({ path: 'shots/partie-17-premier-joueur.png' });
await p.click('.pu-roll'); await p.click('.pu-mid'); await p.click('[data-m="first"]'); await p.waitForSelector('.pu-roll.j1', { timeout: 6000 });
assert.equal(await p.evaluate(() => PU.roll.v === PU.st.premier && PU.st.journal.some(e => e.a === 'f')), true, 'tirage du menu : premier joueur noté (annulable)'); await p.click('.pu-roll');
ok('dés (d4 à d20) et pile ou face : crypto.getRandomValues, uniforme, résultat dans chaque tuile tournée, animation coupée par prefers-reduced-motion, Retour ; premier joueur tiré au lancement (tuiles allumées tour à tour, « Tu commences ! ») et au menu');

/* ── Chrono : durée au centre du bouton rond, temps du tour en option (menu, gardé) ; B et C : dans la barre ──────────────────────────────── */
const ago42 = () => p.evaluate(() => { PU.st.debut = Date.now() - 42 * 60e3; puPaint(); });
await game(4, 'A'); await ago42();
assert.equal(await txt(p, '.pu-mid .pu-clk'), '42 min', 'durée de la partie au centre du bouton rond');
await p.click('.pu-mid'); await p.waitForSelector('#puMClkT'); await p.click('label[for="puMClkT"]'); await closeSheets();
assert.match(await p.$$eval('.pu-mid .pu-clk', c => c.map(x => x.textContent).join(' | ')), /^42 min \| \d+:\d\d$/, 'et le temps du tour');
await p.evaluate(() => puSet(partieNextTurn(PU.st))); assert.match(await txt(p, '.pu-mid .pu-clk[data-c="t"]'), /^0:0\d$/, 'nouveau tour : remis à zéro');
await p.waitForTimeout(2100); assert.match(await txt(p, '.pu-mid .pu-clk[data-c="t"]'), /^0:0[1-9]$/, 'il avance');
await p.screenshot({ path: 'shots/partie-18-chrono.png' });
await p.click('.pu-mid'); await p.click('label[for="puMClkD"]'); await p.click('label[for="puMClkT"]'); await closeSheets();
assert.equal(await p.$('.pu-clk'), null, 'masqué'); assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:partie:clk')), '{"d":0,"t":0}', 'gardé sur l\'appareil');
await p.evaluate(() => localStorage.removeItem('deckdeal:partie:clk')); await game(3, 'B'); await ago42(); assert.equal(await txt(p, '.pu-bar .pu-clk'), '42 min', 'B : dans la barre du haut');
ok('chrono : durée de la partie au centre du bouton rond (B, C : barre du haut), temps du tour en option (remis à zéro, avance), masqué au menu, gardé');

/* ── Préparation : plan de la table, « Changer l'ordre » (↑ / ↓, glisser, clavier), le premier joueur suit ; mon prénom (« Hôte ») ─────────── */
await p.evaluate(async () => { puClose(); await new Promise(r => setTimeout(r, 300)); partieClear(); puGo(); }); await p.waitForSelector('.pu.on .pu-setup');
for (const n of ['Léa', 'Paul', 'Zoé']) await p.evaluate(nom => puSet(partieAddPlace(PU.st, { sorte: 'invite', nom })), n);
await p.click('[data-pu="first"][data-pos="3"]');
const names = () => p.evaluate(() => PU.st.places.map(x => x.nom));
assert.deepEqual(await p.$$eval('.pu-plan .pu-pl', l => l.map(x => x.textContent.trim())), ['2Léa', '3Paul1er', '1Hôte', '4Zoé'], 'plan : la table de l\'affichage A, l\'ordre du tour, le premier joueur');
assert.match(await txt(p, '.pu-plan-t'), /Paul commence, puis le tour passe à sa gauche/);
await p.click('[data-pu="ord"]'); await p.waitForSelector('.pu-seat.ord .pu-grip');
assert.ok(Math.min(...await p.$$eval('.pu-seat.ord .pu-grip, .pu-seat.ord .pu-ud button', b => b.map(x => Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height)))) >= 44, 'poignées et flèches : 44 px');
await p.click('.pu-seat:nth-child(3) [data-pu="seat-up"]'); assert.deepEqual(await names(), ['Hôte', 'Paul', 'Léa', 'Zoé'], '↑ : Paul monte');
assert.equal(await p.evaluate(() => PU.st.premier), 2, 'le premier joueur le suit');
assert.equal(await p.evaluate(() => document.activeElement.dataset.pu + ' ' + [...document.querySelectorAll('.pu-seat')].indexOf(document.activeElement.closest('.pu-seat'))), 'seat-up 1', 'le focus suit la place');
await p.keyboard.press('Enter'); assert.deepEqual(await names(), ['Paul', 'Hôte', 'Léa', 'Zoé'], 'Entrée : encore');
await p.focus('.pu-seat:nth-child(2) .pu-grip'); await p.keyboard.press('ArrowDown'); assert.deepEqual(await names(), ['Paul', 'Léa', 'Hôte', 'Zoé'], 'poignée : flèche bas');
const g4 = await (await p.$('.pu-seat:nth-child(4) .pu-grip')).boundingBox(), r1 = await (await p.$('.pu-seat:nth-child(1)')).boundingBox();
await p.mouse.move(g4.x + 20, g4.y + 20); await p.mouse.down(); await p.mouse.move(g4.x + 20, g4.y, { steps: 3 }); await p.mouse.move(g4.x + 20, r1.y + 8, { steps: 10 });
await p.screenshot({ path: 'shots/partie-19-ordre-glisser.png' }); await p.mouse.up();
assert.deepEqual(await names(), ['Zoé', 'Paul', 'Léa', 'Hôte'], 'glisser-déposer : Zoé en premier, les autres gardent leur ordre');
assert.deepEqual(await p.evaluate(() => PU.st.places.map(x => x.pos)), [1, 2, 3, 4]);
await p.click('[data-pu="ord"]'); assert.equal(await p.$('.pu-grip'), null, 'Terminé');
await p.screenshot({ path: 'shots/partie-20-ordre-plan.png' });
await p.click('.pu-seat [data-pu="ren"]'); await p.waitForSelector('#puRn'); assert.equal(await p.$eval('#puRn', e => e.value), 'Hôte');
await p.fill('#puRn', 'Martin'); await p.click('.sheet [data-ok]'); assert.equal((await names())[3], 'Martin', 'le créateur se donne un prénom');
await p.click('.pu-foot [data-pu="drop"]'); await p.waitForSelector('.sheet [data-ok]'); await p.click('.sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.pu') && !sheets.length);
ok('préparation : plan de la table (ordre du tour, premier joueur), « Changer l\'ordre » : ↑ / ↓, flèches du clavier sur la poignée, glisser-déposer ; le premier joueur suit ; crayon : le prénom du créateur');

/* ── Appli Android (WebView sans navigator.wakeLock, ManaOrbit.keepAwake de l'APK 1.0.10) : écran gardé allumé par la coque ── */
const w = await newPage(browser, world, { goto: false });
await w.p.addInitScript(() => {
  try { Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => undefined, configurable: true }); } catch (e) { /* déjà absent */ }
  window.__aw = []; window.__or = []; const P = { ManaOrbit: { keepAwake: async o => { window.__aw.push(o.on); return o; }, brightness: async o => o, orientation: async o => { window.__or.push(o.lock); return o; } } };      // orientation : méthode de l'APK 1.0.12 et plus
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => !!P[n], Plugins: P, getPlatform: () => 'android' };
});
await w.p.goto(world.url); await toHome(w.p);
const aw = () => w.p.evaluate(() => [window.__aw, sessionStorage.getItem('deckdeal:awake')]);
assert.equal(await w.p.evaluate(() => !!navigator.wakeLock), false, 'WebView simulée : pas de Wake Lock');
await w.p.evaluate(() => { partieSave(partieStart(partieAddPlace(partieNew({ moi: { nom: 'Max' } }), { nom: 'Bob' }))); puGo(); }); await w.p.waitForSelector('.pu.pu-game');
await w.p.waitForFunction(() => window.__aw.length === 1); assert.deepEqual(await aw(), [[true], '1'], 'compteur : écran gardé allumé par la coque');
await w.p.evaluate(() => puMyQr()); await w.p.waitForSelector('.pu-myqr'); await w.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
await w.p.waitForTimeout(200); assert.deepEqual(await aw(), [[true], '1'], 'QR joueur ouvert puis fermé par-dessus le compteur : l\'écran reste allumé');
await w.p.evaluate(() => puClose()); await w.p.waitForFunction(() => window.__aw.length === 2); assert.deepEqual(await aw(), [[true, false], null], 'compteur fermé : veille rendue');
assert.deepEqual(await w.p.evaluate(() => window.__or), [true, false], 'APK avec ManaOrbit.orientation : orientation gardée pendant la partie, rendue à la fermeture');
await w.p.evaluate(() => { TR.share = 'abc123'; trQrOpen(); }); await w.p.waitForSelector('.sheet-wrap.open .qr-img svg');
await w.p.waitForFunction(() => window.__aw.length === 3 && !document.querySelector('.qr-lock').hidden);
await w.p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await w.p.waitForFunction(() => window.__aw.length === 4);
await w.p.evaluate(() => trocOpenWin()); await w.p.waitForFunction(() => window.__aw.length === 5);
await w.p.evaluate(() => trocCloseWin()); await w.p.waitForFunction(() => window.__aw.length === 6);
assert.deepEqual(await aw(), [[true, false, true, false, true, false], null], 'QR code d\'échange, échange en vrai : gardé allumé puis rendu');
assert.deepEqual(w.errs, []); await w.p.context().close();
ok('appli Android (pas de Wake Lock dans le WebView) : compteur, QR joueur, QR code d\'échange et échange en vrai gardent l\'écran allumé par la coque (keepAwake), rendu à la fermeture ; un écran refermé par-dessus un autre ne rend pas la veille');

const all = [...errs, ...q.errs, ...j.errs];
console.log('erreurs page :', all.length ? all : 'aucune'); assert.deepEqual(all, []);
await browser.close(); world.stop(); console.log('\nPARTIE UI E2E OK'); process.exit(0);
