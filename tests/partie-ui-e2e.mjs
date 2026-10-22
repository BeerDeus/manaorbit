// E2E compteur de vie (interface) : carte « Compteur de vie » de l'accueil, préparation avec invités (sans compte), compteur (3 affichages, ±1, ±10 maintenu, fiche d'un joueur),
// proposition d'élimination, menu « … », fin de partie (classement, QR code du résultat), Mes parties, lien ?partie= (c'était moi), lien ?table= sans compte ; formats à 360 px (un appui : Commander, Standard, Libre ±, gardé pour la fois suivante), partie Standard à deux (20 PV, invité avec son deck, ni blessures de commandant ni impôt ni monarque, poison), Mes parties marquées, statistiques par format, lien du résultat Standard.
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
assert.equal(await p.evaluate(() => document.querySelector('#hmTrade').nextElementSibling.id), 'hmPartie', 'sous l\'Échange');
assert.equal(await p.evaluate(() => document.querySelector('#hmPartie').nextElementSibling.id), 'hmSets', 'au-dessus de Prochaines extensions');
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

/* ── Fiche d'un joueur : blessures de commandant, poison, monarque ───────────────────────────── */
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await sheetTop(), 'Moi');
for (let i = 0; i < 3; i++) await p.click('.pu-sheet [data-k="b"][data-s="2"][data-n="1"]');
await p.click('.pu-sheet [data-k="c"][data-c="poison"][data-n="1"]'); await p.click('.pu-sheet [data-mk="monarque"]');
s = await st(); assert.equal(s.places[0].blessures['2'], 3); assert.equal(s.places[0].vie, 17, 'blessures de commandant : autant de vie en moins'); assert.equal(s.places[0].compteurs.poison, 1); assert.equal(s.monarque, 1);
await p.screenshot({ path: 'shots/partie-3-fiche.png' });
await closeSheets();
assert.match(await txt(p, '.pu-t[data-pos="1"] .pu-tags'), /1.*3/); assert.deepEqual(await p.$$eval('.pu-t[data-pos="1"] .pu-tags use', l => l.map(u => u.getAttribute('href'))), ['#i-crown', '#i-poison', '#i-sword'], 'monarque, poison, blessures de commandant : icônes du sprite');
ok('fiche : blessures de commandant (et la vie), poison, monarque');

/* ── Proposition d'élimination, élimination ─────────────────────────────────────────────────── */
await p.evaluate(() => puSet(partieLife(PU.st, 4, -30)));
await p.waitForSelector('.pu-prop'); assert.match(await txt(p, '.pu-prop'), /Zoé n'a plus de points de vie/);
await p.click('.pu-prop [data-pu="elim"]'); await p.waitForSelector('.sheet [data-ok]'); await p.click('.sheet [data-ok]');
await p.waitForFunction(() => PU.st.places[3].elimine && !document.querySelector('.pu-prop'));
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
assert.deepEqual(await p.$$eval('.pu-rank li b', b => b.map(x => x.textContent)), ['Léa', 'Moi', 'Paul', 'Zoé']);

assert.ok(await p.$('.pu-qr-img svg'), 'QR code du résultat');
await p.screenshot({ path: 'shots/partie-6-fin.png' });
assert.equal(await p.evaluate(() => partieLoad()), null, 'partie en cours effacée');
const hist = await p.evaluate(() => partieHist()); assert.equal(hist.length, 1); assert.equal(hist[0].moi, 1);
await p.click('.pu-foot [data-pu="close"]'); await p.waitForFunction(() => !document.querySelector('.pu'));
await p.click('#hmPartie [data-pu="hist"]'); await p.waitForSelector('.pu-hist li');
assert.match(await txt(p, '.pu-hist'), /Moi, Léa, Paul, Zoé.*vainqueur : Léa.*1 tour/);
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
assert.deepEqual(await p.$$eval('.pu-t .pu-life', b => b.map(x => x.textContent)), ['20', '20']);
await p.click('.pu-t[data-pos="2"] .pu-hit.m'); assert.equal((await st()).places[1].vie, 19);
await p.click('.pu-t[data-pos="1"] .pu-nm'); await p.waitForSelector('.pu-sheet .pu-lifebig');
assert.equal(await p.$('.pu-sheet [data-k="b"]'), null, 'pas de blessures de commandant'); assert.equal(await p.$('.pu-sheet [data-c="impot"]'), null, 'pas d\'impôt de commandant');
assert.equal(await p.$('.pu-sheet [data-mk]'), null, 'ni monarque ni initiative'); assert.doesNotMatch(await txt(p, '.pu-sheet'), /commandant/i);
assert.deepEqual(await p.$$eval('.pu-sheet [data-k="c"][data-n="1"]', b => b.map(x => x.dataset.c)), ['poison', 'energie', 'experience']);
assert.deepEqual(await noOverflow(), [], '360 px : fiche du joueur');
for (let i = 0; i < 10; i++) await p.click('.pu-sheet [data-k="c"][data-c="poison"][data-n="1"]');
await closeSheets(); await p.waitForSelector('.pu-prop'); assert.match(await txt(p, '.pu-prop'), /Moi a 10 marqueurs poison/);
await p.screenshot({ path: 'shots/partie-9-standard-360.png' });
await p.click('.pu-prop [data-pu="elim"]'); await p.waitForSelector('.sheet [data-c]');
assert.deepEqual(await p.$$eval('.sheet [data-c]', b => b.map(x => x.dataset.c)), ['vie', 'poison', 'abandon', 'autre'], 'causes : pas de blessures de commandant');
await p.click('.sheet [data-c="poison"]'); await p.click('.sheet [data-ok]'); await p.waitForFunction(() => PU.st.places[0].elimine);
await p.evaluate(() => puEndSheet()); await p.waitForSelector('.pu-wins [data-w="2"][aria-pressed="true"]'); await p.click('.sheet [data-ok]'); await p.waitForSelector('.pu-rank');
assert.match(await txt(p, '.pu .dv-title span'), /^Standard · 1 tour/); assert.deepEqual(await p.$$eval('.pu-rank li b', b => b.map(x => x.textContent)), ['Bob', 'Moi']);
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

const all = [...errs, ...q.errs, ...j.errs];
console.log('erreurs page :', all.length ? all : 'aucune'); assert.deepEqual(all, []);
await browser.close(); world.stop(); console.log('\nPARTIE UI E2E OK'); process.exit(0);
