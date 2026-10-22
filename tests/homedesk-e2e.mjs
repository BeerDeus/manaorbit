// E2E accueil sur ordinateur (souris, écran ≥ 1 100 px) : tableau de bord en trois colonnes à la hauteur de l'écran (rien à faire défiler),
// chiffres et courbe de valeur, raccourcis, 8 prochaines extensions, boutons Google Play / App Store (« Bientôt »), retour à l'ordre du téléphone
// quand la fenêtre rétrécit ; téléphone : aucun bloc de l'ordinateur.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok } from './e2e-world.mjs';

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
const closeSheets = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });

/* ── Ordinateur 1890 × 900 ── */
const { p, errs } = await newPage(browser, world, { init, ctx: { viewport: { width: 1890, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } });
await p.waitForSelector('.hm-cols'); await sets()(p); await p.waitForTimeout(1000);      // fin de l'arrivée animée des extensions (hmDeal)
const lay = await p.evaluate(() => ({ cols: [...document.querySelectorAll('.hm-col')].map(c => [...c.children].map(x => x.id || x.className.split(' ')[0]).join(',')), over: document.documentElement.scrollHeight - innerHeight,
  tops: ['.hm-hero', '.hm-dk-acts', '#hmSets'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().top)), head: document.querySelector('.hm-cols > .hm-dk-head') ? Math.round(document.querySelector('.hm-dk-head').getBoundingClientRect().bottom) : -1 }));
assert.deepEqual(lay.cols, ['hm-hero,hm-dk', 'hm-dk,hmTrade,hmDiscord,hmPartie,hmStores', 'installWrap,buyBar,hmSets,btnHelp'], JSON.stringify(lay.cols));
assert.ok(lay.over <= 0, 'rien à faire défiler (' + lay.over + ' px de trop)');
assert.equal(new Set(lay.tops).size, 1, 'orbe, raccourcis et extensions (barre d\'installation fermée) à la même hauteur : ' + lay.tops); assert.ok(lay.head > 0 && lay.head < lay.tops[0], 'salutation au-dessus, sur toute la largeur');
assert.match(await txt(p, '#hmDkHi'), /^Bon(jour|soir)$/); assert.ok((await txt(p, '#hmDkDate')).length > 6, 'date du jour');
assert.match(await txt(p, '#hmDkKpi'), /^3 cartes différentes 9 exemplaires [+−].+€ sur 7 jours [+−].+€ sur 30 jours/);
assert.equal(await p.$$eval('#hmDkChart svg.vl-svg', l => l.length), 1, 'courbe de valeur');
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
ok('Google Play et App Store : fenêtre « Bientôt » ; liens Confidentialité et Mentions légales');

await p.setViewportSize({ width: 900, height: 900 }); await p.waitForFunction(() => !document.querySelector('.hm-cols'));
assert.deepEqual(await p.evaluate(() => [...document.querySelector('#viewHome').children].map(x => x.id || x.className.split(' ')[0])),
  ['installWrap', 'buyBar', 'hm-dk', 'hm-hero', 'hm-dk', 'hm-dk', 'hmTrade', 'hmDiscord', 'hmPartie', 'hmSets', 'hmStores', 'btnHelp'], 'ordre du téléphone rendu');
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

await browser.close(); world.stop(); process.exit(0);
