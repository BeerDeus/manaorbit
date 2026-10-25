// E2E cachettes des événements (src/evpacks.js › EV_SPOTS, src/event.js › EV_HIDE) : CHAQUE cachette qui sait s'ouvrir (event-open.mjs › OPEN), anciennes et nouvelles,
// sur un vrai écran (port 19886, Halloween 2026 forcée) : son écran ouvert comme le ferait le joueur, EV_HIDE donne un bloc à l'écran ; mise dans les cachettes du jour,
// l'objet s'y pose (dans le même écran ou la même feuille), petit, jamais sur un bouton ni un champ. Sans toucher (jeton factice). Ordinateur (1280 × 800) pour les
// cachettes qui le demandent (EV_CAPS.desk), compte connecté pour celles du compte (EV_CAPS.acct), téléphone (393 × 852) pour les autres ; collection, liste d'échange et deck d'exemple : toutes les capacités utiles allumées.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, signInFake, ok } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';
import { OPEN } from './event-open.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19886, env: { EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_SECRET: 'e2e', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const closeAll = p => p.evaluate(() => { EV.st.me.spots = []; evScan(); while (sheets.length) sheets[sheets.length - 1].close(); for (const d of document.querySelectorAll('body > .dv.on')) if (d.__close) d.__close(); navGo('home'); if (S.view !== 'home') showView('home'); window.scrollTo(0, 0); });
const spots = await (async () => { const { p, ctx } = await newPage(browser, world, { path: '?event' }); const r = await p.evaluate(() => EV_SPOTS.map(s => ({ ...s, hint: EV_HINT[s.id] }))); await ctx.close(); return r; })();
assert.deepEqual(spots.filter(s => !s.hint).map(s => s.id), [], 'une devinette par cachette');
assert.deepEqual(Object.keys(OPEN).filter(id => !spots.some(s => s.id === id)), [], 'OPEN : seulement des cachettes qui existent');
const bad = [];

/** Une cachette : écran ouvert, bloc donné par EV_HIDE, objet posé (même écran, pas sur un bouton) ; '' si tout va bien, sinon la raison. */
async function check(p, s) {
  await closeAll(p); await p.waitForTimeout(400);
  try { if (OPEN[s.id]) await p.evaluate(`(async () => { ${OPEN[s.id]}; })()`); } catch (e) { return 'ouverture : ' + e.message.split('\n')[0]; }
  await p.waitForTimeout(1000);
  const h = await p.evaluate(id => { let el = null; try { el = EV_HIDE[id](); } catch (e) { return 'EV_HIDE : ' + e.message; } return !el ? 'EV_HIDE : null' : !el.isConnected ? 'EV_HIDE : bloc détaché' : !el.getClientRects().length || el.closest('[hidden]') ? 'EV_HIDE : bloc invisible' : ''; }, s.id);
  if (h) return h;
  return p.evaluate(async id => {
    const force = () => { const m = EV.st.me; if (m.spots.length !== 1 || m.spots[0].s !== id) m.spots = [{ s: id, t: 'x'.repeat(16), f: 0 }]; m.left = Math.max(1, m.left || 0); };      // le serveur l'aurait tirée aujourd'hui (redit à chaque tour : une relecture du serveur la remplacerait)
    for (let i = 0; i < 40; i++) {
      force(); evScan(); const x = EV.pks.get(id);
      if (x && x.dead) return 'aucun creux libre dans son bloc ni ses replis';
      if (x && !x.ok && x.el.isConnected) x.el.scrollIntoView({ block: 'center' });
      if (x && x.ok) {
        const b = x.el, rc = b.getBoundingClientRect(); b.style.pointerEvents = 'none'; const under = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2); b.style.pointerEvents = '';
        const inter = under && under.closest('button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="tab"]');
        if (inter && inter !== b) return 'posé sur ' + inter.tagName.toLowerCase() + '.' + inter.className;
        if (!(rc.width >= 18 && rc.width <= 46)) return 'taille ' + rc.width;
        const box = x.root.closest('.sheet-wrap, body > .dv, #viewHome, #viewInput');
        if (!box || !box.contains(b)) return 'posé hors de son écran';
        const top = sheets.length ? sheets[sheets.length - 1].wrap : navTopDv() || document.querySelector('#view' + S.view[0].toUpperCase() + S.view.slice(1));
        if (box !== top) return 'pas sur l\'écran du dessus';
        if (!/citrouille/.test(b.getAttribute('aria-label') || '')) return 'libellé';
        return '';
      }
      await new Promise(r => setTimeout(r, 250));
    }
    const x = EV.pks.get(id); return x ? 'pas posé (zone ' + x.k + ' sur ' + x.zones.length + ')' : 'pas monté';
  }, s.id);
}

for (const [desk, acct] of [[false, false], [false, true], [true, false]]) {      // téléphone sans compte, téléphone avec un compte (cachettes EV_CAPS.acct), ordinateur
  const list = spots.filter(s => OPEN[s.id] !== undefined && !!(s.need & 8) === desk && !!(s.need & 1) === acct), where = desk ? 'ordinateur' : acct ? 'téléphone, compte' : 'téléphone';
  const { p, errs, ctx } = await newPage(browser, world, { path: '?event', ctx: desk ? { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false } : { viewport: { width: 393, height: 852 } } });
  await p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });
  await p.waitForSelector('.ev-intro.on', { timeout: 8000 }); await p.click('.ev-in-go'); await p.waitForFunction(() => !document.querySelector('.ev-intro'));
  await p.evaluate(() => {
    collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }, { k: 'arcane signet', n: 'Arcane Signet', q: 1 }, { k: 'llanowar elves', n: 'Llanowar Elves', q: 3 }, { k: 'wrath of god', n: 'Wrath of God', q: 1 }]);
    D.localList.push({ id: 'dk-spots', name: 'Elfes', text: 'Deck\n4 Llanowar Elves\n1 Craterhoof Behemoth\n1 Sol Ring\n1 Arcane Signet\n16 Forest', updatedAt: Date.now(), history: [] }); renderDecks();
  });
  if (acct) { await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-spots')); await signInFake(p); await p.waitForFunction(() => EV.st && EV.st.acct && EV.st.me, null, { timeout: 15000 }); }
  const caps = await p.evaluate(() => evCaps());
  assert.equal(caps & (2 | 4 | 32), 2 | 4 | 32, 'capacités : cartes, decks, échange (' + caps + ')'); assert.equal(!!(caps & 8), desk, 'ordinateur : ' + desk); assert.equal(!!(caps & 1), acct, 'compte : ' + acct);
  for (const s of list) {
    const why = await check(p, s);
    if (why) bad.push(`${s.id} (${where}) : ${why}`); else ok(`${s.id} [${s.need}, niv. ${s.lvl}] : posée · « ${s.hint} »`);
  }
  await closeAll(p);
  assert.deepEqual(errs, [], 'aucune erreur dans la page');
  await ctx.close();
}
const none = spots.filter(s => OPEN[s.id] === undefined).map(s => s.id);
console.log(`${spots.length} cachettes, ${spots.length - none.length} vérifiées ; sans ouverture simple (event-open.mjs) : ${none.join(', ')}`);
world.stop(); F.stop(); await browser.close();
assert.deepEqual(bad, [], 'cachettes en défaut :\n  ' + bad.join('\n  '));
console.log('SPOTS E2E OK');
process.exit(0);
