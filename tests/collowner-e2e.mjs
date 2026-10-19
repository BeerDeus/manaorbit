// E2E collection d'un autre compte gardée sur l'appareil (collection.js › collAside) : un appareil qui gardait la collection d'un compte (supprimé depuis,
// ou celui de quelqu'un d'autre) ne la verse jamais d'office dans le compte qui se connecte : mise de côté, proposée (« L'ajouter à ce compte » /
// « Ne pas l'ajouter », Annuler) ; collection jamais synchronisée (cartes ajoutées avant de se connecter) ou du même compte : fusionnée comme avant.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, signInFake } from './e2e-world.mjs';

const world = await startWorld({ port: 19733 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const OLD = '5 Sol Ring\n2 Ponder\n1 Brainstorm';
const seed = s => `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(OLD)}, u: 1, s: ${JSON.stringify(s)}, b: null })); } } catch (e) {}`;
const state = p => p.evaluate(async () => { const r = await D.cloud.pullColl(D.uid); return { keys: Object.keys(COLL.map).sort(), s: COLL.s, remote: r.data ? r.data.text : null, aside: !!localStorage.getItem('deckdeal:coll:aside:v1') }; });
const errsAll = [];

/* ── 1. Copie d'un autre compte (compte supprimé puis recréé : nouvel identifiant) : mise de côté, rien d'envoyé, proposée ; « L'ajouter » ── */
{
  const { p, errs, ctx } = await newPage(browser, world, { init: seed('uid-ancien') }); errsAll.push(errs);
  assert.equal(await p.evaluate(() => Object.keys(COLL.map).length), 3, 'appareil : la collection de l\'ancien compte');
  await signInFake(p, { uid: 'uid-neuf' }, { owner: true });
  await p.waitForSelector('.sheet h2', { timeout: 8000 });
  assert.equal(await p.$eval('.sheet h2', e => e.textContent), 'Une autre collection sur cet appareil');
  assert.match(await p.$eval('.sheet .sheet-body', e => e.textContent), /3 cartes, 8 exemplaires\. Elle n'a pas été ajoutée à ce compte\./);
  let st = await state(p);
  assert.deepEqual(st.keys, [], 'compte neuf : collection vide sur l\'appareil'); assert.equal(st.remote, null, 'rien envoyé au compte'); assert.equal(st.s, 'uid-neuf'); assert.equal(st.aside, true);
  await p.click('.sheet [data-as="add"]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.waitForFunction(async () => { const r = await D.cloud.pullColl(D.uid); return r.data && /Brainstorm/.test(r.data.text); }, null, { timeout: 8000 });
  st = await state(p); assert.deepEqual(st.keys, ['brainstorm', 'ponder', 'sol ring']); assert.equal(st.aside, false);
  assert.match(await p.$eval('#toast', e => e.textContent), /3 cartes ajoutées à ce compte/);
  await ctx.close();
  ok('copie d\'un autre compte : mise de côté (rien d\'envoyé au compte neuf), proposée « 3 cartes, 8 exemplaires » ; « L\'ajouter à ce compte » l\'envoie');
}

/* ── 2. « Ne pas l'ajouter », puis Annuler (reproposée), puis plus tard : reproposée au lancement suivant ─────────────────── */
{
  const { p, errs, ctx } = await newPage(browser, world, { init: seed('uid-ancien') }); errsAll.push(errs);
  await signInFake(p, { uid: 'uid-autre' }, { owner: true }); await p.waitForSelector('.sheet [data-as="drop"]', { timeout: 8000 });
  await p.click('.sheet [data-as="drop"]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  assert.match(await p.$eval('#toast', e => e.textContent), /Collection de l'autre compte retirée de cet appareil/);
  let st = await state(p); assert.deepEqual(st.keys, []); assert.equal(st.aside, false); assert.equal(st.remote, null);
  await p.click('#toast button'); await p.waitForSelector('.sheet [data-as="add"]', { timeout: 6000 });
  assert.equal((await state(p)).aside, true, 'Annuler : remise de côté, reproposée');
  await p.click('.sheet [data-close]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.reload(); await signInFake(p, { uid: 'uid-autre' }, { owner: true }); await p.waitForSelector('.sheet [data-as="add"]', { timeout: 8000 });
  st = await state(p); assert.deepEqual(st.keys, [], 'toujours à part'); assert.equal(st.aside, true);
  await ctx.close();
  ok('« Ne pas l\'ajouter » : retirée (Annuler la remet de côté) ; fermée sans choix : reproposée au lancement suivant, jamais envoyée');
}

/* ── 3. Comme avant : collection jamais synchronisée (ajoutée avant de se connecter), ou du même compte ─────────────────── */
for (const [s, uid, what] of [['', 'uid-premier', 'jamais synchronisée'], ['uid-meme', 'uid-meme', 'du même compte']]) {
  const { p, errs, ctx } = await newPage(browser, world, { init: seed(s) }); errsAll.push(errs);
  await signInFake(p, { uid }, { owner: true });
  await p.waitForFunction(async () => { const r = await D.cloud.pullColl(D.uid); return r.data && /Brainstorm/.test(r.data.text); }, null, { timeout: 8000 });
  await p.waitForTimeout(900); assert.equal(await p.$('.sheet-wrap'), null, 'rien à proposer');
  const st = await state(p); assert.deepEqual(st.keys, ['brainstorm', 'ponder', 'sol ring']); assert.equal(st.aside, false);
  await ctx.close();
  ok('collection ' + what + ' : envoyée au compte comme avant, rien de mis de côté');
}

/* ── 4. Nettoyage temporaire « Retirer l'ancienne collection » (places.js › plcOldPlan) : exemplaires d'avant la création du compte, hors emplacements créés depuis ── */
{
  const { p, errs, ctx } = await newPage(browser, world, {}); errsAll.push(errs);
  const CREATED = Date.UTC(2026, 9, 17, 9), OLD = Math.floor(Date.UTC(2026, 9, 5) / 1000), NEW = Math.floor(Date.UTC(2026, 9, 18) / 1000);
  await signInFake(p, { uid: 'uid-recree', metadata: { creationTime: new Date(CREATED).toUTCString() } });
  const res = await p.evaluate(({ OLD, NEW, CREATED }) => {
    const oldP = Math.floor(Date.UTC(2026, 9, 16) / 1000).toString(36) + 'aa', newP = Math.floor(Date.UTC(2026, 9, 18) / 1000).toString(36) + 'bb';
    COLL.places = { [oldP]: { t: 'binder', n: 'Classeur' }, [newP]: { t: 'binder', n: 'Classeur' } };
    const L = (k, n, d, lines) => [k, { ...collFromLines({ n, d }, lines), d }];
    COLL.map = Object.fromEntries([
      L('sol ring', 'Sol Ring', OLD, [['fr#p' + oldP, 2], ['fr#p' + newP, 1]]),      // ancienne copie (ancien classeur) + rescannée (nouveau)
      L('ponder', 'Ponder', OLD, [['en', 3]]),                                     // ancienne seulement, non rangée
      L('brainstorm', 'Brainstorm', OLD, [['en#p' + oldP, 1]]),                    // ancienne seulement, dans l'ancien classeur
      L('arcane signet', 'Arcane Signet', NEW, [['en', 1]]),                       // ajoutée depuis, non rangée : gardée
    ]);
    collChanged(); return { oldP, newP };
  }, { OLD, NEW, CREATED });
  await p.evaluate(() => { openCollection(); }); await p.waitForSelector('#collSeg'); await p.click('#collSeg [data-v="places"]'); await p.waitForSelector('.plc-old');
  assert.match(await p.$eval('.plc-old', e => e.textContent), /Retirer l'ancienne collection6 exemplaires ajoutés avant la création de ton compte \(17 octobre\), hors emplacements créés depuis/);
  await p.click('.plc-old'); await p.waitForSelector('.sheet-wrap.open [data-ok]'); await p.click('.sheet-wrap.open [data-ok]'); await p.waitForFunction(() => !sheets.length);
  const after = await p.evaluate(() => ({ map: Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [k, collLines(x)])), places: Object.keys(COLL.places) }));
  assert.deepEqual(after.map, { 'sol ring': [['fr#p' + res.newP, 1]], 'arcane signet': [['en', 1]] }, 'seules les copies rescannées et les cartes ajoutées depuis restent');
  assert.deepEqual(after.places, [res.newP], 'ancien classeur vidé : supprimé');
  assert.match(await p.$eval('#toast', e => e.textContent), /6 exemplaires retirés de ta collection · 1 ancien emplacement supprimé/);
  assert.equal(await p.$('.plc-old'), null, 'plus rien à retirer : bouton caché');
  await p.click('#toast .toast-act'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => Object.keys(COLL.map).length), 4, 'Annuler : tout remis'); assert.equal(await p.evaluate(() => Object.keys(COLL.places).length), 2);
  await ctx.close();
  ok('nettoyage « Retirer l\'ancienne collection » : copies d\'avant la création du compte (non rangées ou dans un ancien emplacement) retirées, copies rescannées rangées depuis et cartes récentes gardées, ancien emplacement vide supprimé, Annuler');
}

for (const e of errsAll) assert.deepEqual(e, []);
await browser.close(); world.stop(); console.log('\nCOLLOWNER E2E OK'); process.exit(0);
