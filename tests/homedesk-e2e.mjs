// E2E accueil sur ordinateur (souris, écran ≥ 1 100 px) : tableau de bord en trois colonnes à la hauteur de l'écran (rien à faire défiler),
// chiffres et courbe de valeur, raccourcis, 8 prochaines extensions, boutons Google Play / App Store (« Bientôt »), retour à l'ordre du téléphone
// quand la fenêtre rétrécit ; téléphone : aucun bloc de l'ordinateur. Collection vide : « Pour commencer » (Scanner, Importer, « Je viens de ManaBox »)
// sous l'orbe (case de la courbe sur ordinateur), QR code et Partager remplacés par une phrase, Discord après le compteur de vie. Stats de la collection
// sur ordinateur : deux colonnes, courbe de valeur à sa taille réelle (1280 et 1890 px) ; téléphone inchangé.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, closeSheets, scanClose } from './e2e-world.mjs';

const world = await startWorld({ port: 19741 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const init = () => {
  localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '4 Sol Ring *FR*\n2 Swords to Plowshares *EN*\n3 Llanowar Elves *FR*', u: 1, s: '', b: null }));
  localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 9 }));
  const h = []; for (let i = 40; i >= 0; i--) h.push({ t: Date.now() - i * 864e5, v: 80000 + (40 - i) * 150 }); localStorage.setItem('deckdeal:coll:hist', JSON.stringify(h));
};
const sets = () => p => p.evaluate(() => {
  const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  SETS.list = Array.from({ length: 10 }, (_, i) => ({ code: 'zz' + i, name: 'Extension ' + i, at: d(5 + i * 20), icon: '', url: '', type: 'expansion' })); SETS.sig = ''; setsPaint();
});

/* ── Ordinateur 1890 × 900 ── */
const { p, errs } = await newPage(browser, world, { init, ctx: { viewport: { width: 1890, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } });
await p.waitForSelector('.hm-cols'); await sets()(p); await p.waitForTimeout(1000);      // fin de l'arrivée animée des extensions (hmDeal)
const lay = await p.evaluate(() => ({ cols: [...document.querySelectorAll('.hm-col')].map(c => [...c.children].map(x => x.id || x.className.split(' ')[0]).join(',')), over: document.documentElement.scrollHeight - innerHeight,
  tops: ['.hm-hero', '.hm-dk-acts', '#hmSets'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().top)), head: document.querySelector('.hm-cols > .hm-dk-head') ? Math.round(document.querySelector('.hm-dk-head').getBoundingClientRect().bottom) : -1 }));
assert.deepEqual(lay.cols, ['hm-hero,hmStart,hm-dk', 'hm-dk,hmTrade,hmPartie,hmDiscord,hmStores', 'installWrap,buyBar,hmSets,btnHelp'], JSON.stringify(lay.cols));
assert.deepEqual(await p.evaluate(() => [hmStart.hidden, document.querySelector('.hm-dk-val').hidden, document.querySelector('#hmTrade .hm-tr-acts').hidden, hmTradeNote.hidden]), [true, false, false, true], 'collection remplie : ni « Pour commencer » ni phrase, courbe et QR code / Partager');
assert.ok(lay.over <= 0, 'rien à faire défiler (' + lay.over + ' px de trop)');
assert.equal(new Set(lay.tops).size, 1, 'orbe, raccourcis et extensions (barre d\'installation fermée) à la même hauteur : ' + lay.tops); assert.ok(lay.head > 0 && lay.head < lay.tops[0], 'salutation au-dessus, sur toute la largeur');
assert.match(await txt(p, '#hmDkHi'), /^Bon(jour|soir)$/); assert.ok((await txt(p, '#hmDkDate')).length > 6, 'date du jour');
assert.match(await txt(p, '#hmDkKpi'), /^3 cartes différentes 9 exemplaires [+−].+€ sur 7 jours [+−].+€ sur 30 jours/);
assert.equal(await p.$$eval('#hmDkChart svg.vl-svg', l => l.length), 1, 'courbe de valeur');
{ const g = await p.$eval('#hmDkChart', el => { const s = el.querySelector('svg'), vb = s.getAttribute('viewBox').split(' ').map(Number), r = s.getBoundingClientRect(); return { vb, w: Math.round(r.width), h: Math.round(r.height), cw: el.clientWidth, ch: el.clientHeight, fs: getComputedStyle(s.querySelector('.vl-txt')).fontSize }; });
  assert.ok(Math.abs(g.vb[2] - g.cw) <= 1 && Math.abs(g.vb[3] - g.ch) <= 1 && g.w === g.cw, 'courbe de l\'accueil : dessinée à la taille de sa case, comme avant : ' + JSON.stringify(g)); assert.equal(g.fs, '9.5px', 'textes de la courbe de l\'accueil inchangés'); }
assert.equal(await p.$$eval('#hmSetsList > li', l => l.length), 8, '8 prochaines extensions');
await p.evaluate(() => { const w = document.getElementById('installWrap'); w.classList.remove('closed'); w.removeAttribute('aria-hidden'); }); await p.waitForTimeout(700);
assert.equal(await p.evaluate(() => Math.round(document.querySelector('#installBar').getBoundingClientRect().top) - Math.round(document.querySelector('.hm-hero').getBoundingClientRect().top)), 0, 'barre d\'installation ouverte : alignée sur l\'orbe');
assert.ok(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'toujours rien à faire défiler');
ok('ordinateur : salutation sur toute la largeur, trois colonnes alignées à la hauteur de l\'écran, chiffres, courbe, 8 extensions');

await p.click('.hm-dk-a[data-hm="import"]'); await p.waitForFunction(() => sheets.length === 1); await closeSheets(p);
await p.click('.hm-dk-a[data-hm="price"]'); await p.waitForFunction(() => S.view === 'input'); await p.evaluate(() => homePaint()); await p.click('.nav-b[data-nav="home"]'); await p.waitForFunction(() => S.view === 'home');
await p.waitForSelector('#hmDkChart svg.vl-svg');      // repeinte pendant que l'accueil était caché : la courbe revient avec lui
await p.click('.hm-dk-a[data-hm="build"]'); await p.waitForFunction(() => COLL.el && COLL.mode === 'decks'); await p.click('.nav-b[data-nav="home"]'); await p.waitForFunction(() => !COLL.el);
await p.click('[data-hm="stats"]'); await p.waitForFunction(() => COLL.el && COLL.tab === 'stats'); await p.click('.nav-b[data-nav="home"]'); await p.waitForFunction(() => !COLL.el);
ok('raccourcis : Importer, Prix d\'une liste, Decks à monter, Statistiques');

for (const [k, t] of [['play', /Bientôt Appli Android · Google Play.*arrive très bientôt sur Google Play/], ['ios', /Bientôt Appli iPhone · App Store.*en préparation/]]) {
  await p.click(`[data-store="${k}"]`); await p.waitForFunction(() => sheets.length === 1);
  assert.match(await txt(p, '.sheet'), t); await p.click('.sheet-foot [data-close]'); await p.waitForFunction(() => !sheets.length);
}
assert.deepEqual(await p.$$eval('#hmStores .hm-st-lg a', l => l.map(a => [a.getAttribute('href'), a.textContent])), [['privacy', 'Politique de confidentialité'], ['legal', 'Mentions légales']], 'accueil → confidentialité et mentions légales');
await p.evaluate(() => { CTX.play = true; window.__open = []; window.open = (...a) => { window.__open.push(a); return null; }; });      // PLAY_PUBLIC=1 : fiche publique
await p.click('[data-store="play"]'); await p.waitForTimeout(200);
assert.deepEqual(await p.evaluate(() => [window.__open, sheets.length]), [[['https://play.google.com/store/apps/details?id=app.manaorbit', '_blank', 'noopener']], 0], 'fiche publique : Google Play ouvre la fiche');
assert.equal(await p.evaluate(() => RATE.url), '', 'sans RATE_ASK : pas de demande de note');
await p.click('[data-store="ios"]'); await p.waitForFunction(() => sheets.length === 1); assert.match(await txt(p, '.sheet'), /en préparation/); await p.click('.sheet-foot [data-close]'); await p.waitForFunction(() => !sheets.length);
await p.evaluate(() => { CTX.play = false; });
ok('Google Play et App Store : fenêtre « Bientôt » ; fiche publique (PLAY_PUBLIC=1) : Google Play mène à la fiche, App Store toujours « Bientôt », pas de demande de note ; liens Confidentialité et Mentions légales');

await p.setViewportSize({ width: 900, height: 900 }); await p.waitForFunction(() => !document.querySelector('.hm-cols'));
assert.deepEqual(await p.evaluate(() => [...document.querySelector('#viewHome').children].map(x => x.id || x.className.split(' ')[0])),
  ['installWrap', 'buyBar', 'hm-dk', 'hm-hero', 'hmStart', 'hm-dk', 'hm-dk', 'hmTrade', 'hmPartie', 'hmDiscord', 'hmSets', 'hmStores', 'btnHelp'], 'ordre du téléphone rendu');
assert.equal(await p.$$eval('#hmSetsList > li', l => l.length), 4, 'de nouveau 4 extensions');
await p.setViewportSize({ width: 1890, height: 900 }); await p.waitForSelector('.hm-cols');
ok('fenêtre étroite : colonnes défaites, ordre d\'origine ; élargie : tableau de bord de retour');
assert.deepEqual(errs, []);

/* ── Téléphone : rien de l'ordinateur ── */
const m = await newPage(browser, world, { init });
assert.equal(await m.p.evaluate(() => !!document.querySelector('.hm-cols')), false);
assert.deepEqual(await m.p.$$eval('.hm-dk', l => l.map(e => getComputedStyle(e).display)), ['none', 'none', 'none', 'none', 'none']);
assert.deepEqual(m.errs, []);
ok('téléphone : accueil inchangé (aucun bloc de l\'ordinateur affiché)');

/* ── Collection vide : « Pour commencer » (téléphone 393 et 360 px, ordinateur 1890 et 1280 px) ── */
const seen = () => { localStorage.setItem('deckdeal:onboard', String(Date.now() - 864e5 * 30)); localStorage.setItem('deckdeal:tour', JSON.stringify({ fin: Date.now(), done: Date.now(), ver: 9 })); };
const homeOrder = p => p.evaluate(() => [...document.querySelector('#viewHome').children].filter(x => !x.hidden && x.id !== 'installWrap' && getComputedStyle(x).display !== 'none').map(x => x.id || x.className.split(' ')[0]));      // barre d'installation : fermée (hauteur nulle) dans un navigateur piloté
for (const vp of [{ width: 393, height: 852 }, { width: 360, height: 780 }]) {
  const e = await newPage(browser, world, { init: seen, ctx: { viewport: vp } }), q = e.p, tag = vp.width + ' px';
  await q.waitForTimeout(300);
  assert.deepEqual(await homeOrder(q), ['hm-hero', 'hmStart', 'hmTrade', 'hmPartie', 'hmDiscord', 'btnHelp'], tag + ' : orbe, « Pour commencer », Échange, compteur de vie, puis Discord');
  assert.equal(await q.$eval('#collSub', x => x.hidden), true, tag + ' : plus la phrase « déduites du panier »');
  assert.match(await txt(q, '#hmStart'), /^Pour commencer Ajoute tes cartes : Mana Orbit suit leur valeur/);
  assert.deepEqual(await q.$$eval('#hmStart .hm-go-a', l => l.map(b => [b.dataset.hm, b.querySelector('b').textContent])), [['scan', 'Scanner'], ['import', 'Importer'], ['swg', 'Je viens de ManaBox']]);
  assert.ok((await q.$$eval('#hmStart .hm-go-a', l => l.map(b => b.getBoundingClientRect().height))).every(h => h >= 44), tag + ' : cibles de 44 px au moins');
  assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, tag + ' : rien ne dépasse sur le côté');
  assert.deepEqual(await q.evaluate(() => [document.querySelector('#hmTrade .hm-tr-acts').hidden, hmTradeNote.hidden]), [true, false], tag + ' : ni QR code ni Partager à vide');
  assert.match(await txt(q, '#hmTradeNote'), /proposés dès que tu auras des doublons/);
  assert.match(await txt(q, '#btnColl'), /Commencer/, 'l\'orbe « Commencer » reste');
  if (vp.width === 393) {
    await q.click('#hmStart [data-hm="swg"]'); await q.waitForSelector('.swg-sheet.open'); assert.match(await txt(q, '.swg-sheet .sheet-head'), /Passer de ManaBox/); await closeSheets(q);
    await q.click('#hmStart [data-hm="import"]'); await q.waitForFunction(() => sheets.length === 1 && !!document.querySelector('#ciText')); await closeSheets(q);
    await q.click('#hmStart [data-hm="scan"]'); await q.waitForFunction(() => !!SC.el); await scanClose(q);
    // une carte ajoutée : tout redevient comme avant (orbe, phrase, QR code / Partager)
    await q.evaluate(() => { collAdd([{ k: ownKey('Sol Ring'), n: 'Sol Ring', q: 2 }, { k: ownKey('Arcane Signet'), n: 'Arcane Signet', q: 1 }], 'add'); }); await q.waitForFunction(() => hmStart.hidden, null, { timeout: 5000 });
    await q.evaluate(() => homePaint());
    assert.deepEqual(await q.evaluate(() => [hmStart.hidden, collSub.hidden, document.querySelector('#hmTrade .hm-tr-acts').hidden, hmTradeNote.hidden]), [true, false, false, true], 'collection remplie : accueil d\'avant');
    assert.deepEqual(await homeOrder(q), ['hm-hero', 'hmTrade', 'hmPartie', 'hmDiscord', 'btnHelp'], 'remplie : seul l\'ordre du Discord change');
  }
  assert.deepEqual(e.errs, []); await e.ctx.close();
}
ok('téléphone, collection vide : « Pour commencer » (Scanner, Importer, Je viens de ManaBox) à la place de « déduites du panier », Échange sans QR code ni Partager, Discord après le compteur de vie ; remplie : comme avant');
for (const vp of [{ width: 1890, height: 900 }, { width: 1280, height: 800 }]) {
  const e = await newPage(browser, world, { init: seen, ctx: { viewport: vp, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } }), q = e.p, tag = vp.width + ' px';
  await q.waitForSelector('.hm-cols'); await q.waitForTimeout(400);
  const g = await q.evaluate(() => ({ c1: [...document.querySelector('.hm-c1').children].filter(x => !x.hidden).map(x => x.id || x.className.split(' ')[0]), over: document.documentElement.scrollHeight - innerHeight,
    acts: [...document.querySelectorAll('.hm-dk-acts .hm-dk-a')].map(b => b.dataset.hm), start: Math.round(hmStart.getBoundingClientRect().height) }));
  assert.deepEqual(g.c1, ['hm-hero', 'hmStart'], tag + ' : « Pour commencer » à la place de la courbe vide');
  assert.deepEqual(g.acts, ['scan', 'import', 'price', 'build'], tag + ' : raccourcis inchangés (mêmes Scanner et Importer)');
  if (vp.width === 1890) assert.ok(g.over <= 0, 'toujours rien à faire défiler (' + g.over + ')');
  await q.click('#hmStart [data-hm="swg"]'); await q.waitForSelector('.swg-sheet.open'); await closeSheets(q);
  assert.deepEqual(e.errs, []); await e.ctx.close();
}
ok('ordinateur, collection vide : « Pour commencer » dans la case de la courbe, raccourcis inchangés, sans défilement à 1890 × 900');

/* ── Stats de la collection : deux colonnes et courbe à sa taille sur ordinateur, téléphone inchangé ── */
const stats = async (vp, desk) => {
  const e = await newPage(browser, world, { init, ctx: { viewport: vp, ...(desk ? { isMobile: false, hasTouch: false, deviceScaleFactor: 1 } : {}) } }), q = e.p;
  await q.evaluate(() => navOpen(() => openCollection('stats'))); await q.waitForSelector('.vl-box .vl-svg'); await q.waitForTimeout(400);
  const g = await q.evaluate(() => {
    const s = document.querySelector('.vl-box .vl-svg'), r = s.getBoundingClientRect(), vb = s.getAttribute('viewBox').split(' ').map(Number), cols = [...document.querySelectorAll('.cs-col')];
    return { vb, w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(getComputedStyle(s.querySelector('.vl-txt')).fontSize) * r.width / vb[2], disp: getComputedStyle(document.querySelector('.cs-cols')).display,
      left: cols.map(c => Math.round(c.getBoundingClientRect().left)), heads: cols.map(c => [...c.querySelectorAll(':scope > .cs-h')].map(h => h.firstChild.textContent.trim())) };
  });
  return { e, q, g };
};
for (const vp of [{ width: 1280, height: 800 }, { width: 1890, height: 1000 }]) {
  const { e, q, g } = await stats(vp, true), tag = vp.width + ' px : ' + JSON.stringify(g);
  assert.equal(g.disp, 'grid', tag); assert.ok(g.left[1] - g.left[0] > 300, 'deux colonnes côte à côte — ' + tag);
  assert.deepEqual([g.heads[0], g.heads[1].slice(0, 3)], [['Valeur dans le temps', 'Variations des prix'], ['Courbe de mana', 'Couleurs', 'Familles']], tag);      // puis « Les plus chères » quand des prix sont connus
  assert.ok(Math.abs(g.vb[2] - g.w) <= 1, 'courbe dessinée à sa largeur réelle (pas étirée) — ' + tag);
  assert.ok(g.h >= 150 && g.h <= 230, 'hauteur bornée — ' + tag); assert.ok(g.fs >= 10.5 && g.fs <= 12, 'textes de la courbe à 11 px — ' + tag);
  if (vp.width === 1280) {      // fenêtre élargie : redessinée à sa nouvelle largeur
    await q.setViewportSize({ width: 1600, height: 800 }); await q.waitForTimeout(500);
    const w2 = await q.$eval('.vl-box .vl-svg', s => [Number(s.getAttribute('viewBox').split(' ')[2]), Math.round(s.getBoundingClientRect().width)]);
    assert.ok(w2[1] > g.w && Math.abs(w2[0] - w2[1]) <= 1, 'fenêtre élargie : courbe redessinée ' + w2);
  }
  assert.deepEqual(e.errs, []); await e.ctx.close();
}
{ const { e, g } = await stats({ width: 393, height: 852 }, false);
  assert.equal(g.disp, 'contents', 'téléphone : pas de colonnes'); assert.deepEqual(g.vb, [0, 0, 320, 132], 'téléphone : dessin de 320 × 132 comme avant');
  assert.equal(new Set(g.left).size <= 1 || g.left.every(x => x === 0), true);
  assert.deepEqual(e.errs, []); await e.ctx.close(); }
ok('Stats de la collection : ordinateur 1280 et 1890 px en deux colonnes (valeur et variations | mana, couleurs, familles, les plus chères), courbe à sa taille réelle (150 à 230 px de haut, textes à 11 px), redessinée quand la fenêtre change ; téléphone : comme avant');

await browser.close(); world.stop(); process.exit(0);
