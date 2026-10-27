// E2E événements saisonniers (src/event.js + event-srv.mjs) : chasse aux citrouilles d'Halloween 2026 forcée par EVENT_FORCE (port 19878).
// Calendrier (décor, carte de l'accueil, message d'arrivée une seule fois), cachettes du jour (5, au plus 1 en vue et 2 à un geste), chaque cachette du jour
// ouverte pour de vrai (objet posé sans couvrir de bouton), toucher (compteur, message « il te reste », 5/5 « reviens demain »), quota de 5 et jetons refusés
// (faux, autre cachette, autre jour), sans compte puis avec un compte (progression rattachée, copie dans le compte), « réduire les animations » (objet là, sans
// mouvement), interrupteur « Décorations de fête » (la chasse reste), rien sur le scan, le compteur de vie ni l'échange en direct, anglais, badges « Événements ».
// Captures : EV_SHOTS=<dossier> (393×852 et 360×780 clair / sombre, 1280×800).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, signInFake, ok } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';
import { OPEN } from './event-open.mjs';

const F = await startFakes();
const world = await startWorld({ port: 19878, env: { EVENT: '1', EVENT_FORCE: 'halloween-2026', EVENT_SECRET: 'e2e', FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, ADMIN_EMAILS: 'uid-e2e-zoe@test.dev' } });      // ce compte : aperçu des fêtes permis
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const SHOTS = process.env.EV_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const api = (p, path, body, h = {}) => p.evaluate(async ([path, body, h]) => { const r = await fetch('api/event' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(EV.dev ? { 'x-event-device': EV.dev } : {}), ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json() }; }, [path, body, h]);
const ready = p => p.waitForFunction(() => typeof EV !== 'undefined' && EV.st && EV.st.me, null, { timeout: 15000 });
const closeAll = p => p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); for (const d of document.querySelectorAll('body > .dv.on')) if (d.__close) d.__close(); if (typeof navGo === 'function') navGo('home'); window.scrollTo(0, 0); });
/** Trouve l'objet d'une cachette à l'écran (posé, visible), le vérifie (libellé, pas sur un bouton), puis le touche ; true si trouvé. */
async function findAndTap(p, s, forced) {
  const r = await p.evaluate(async ([s, forced]) => {
    if (forced) EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero');
    for (let i = 0; i < 40; i++) {
      evScan(); const x = EV.pks.get(s);
      if (x && !x.ok && x.el.isConnected) x.el.scrollIntoView({ block: 'center' });
      if (x && x.ok) {
        const b = x.el, rc = b.getBoundingClientRect(); b.style.pointerEvents = 'none'; const under = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2); b.style.pointerEvents = '';
        const inter = under && under.closest('button, a, input, select, textarea, [role="button"]');
        return { ok: true, label: b.getAttribute('aria-label'), onButton: !!(inter && inter !== b), w: Math.round(rc.width) };
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return { ok: false };
  }, [s, forced]);
  if (!r.ok) return r;
  assert.match(r.label, /citrouille/); assert.equal(r.onButton, false, s + ' : jamais sur un bouton'); assert.ok(r.w >= 18 && r.w <= 46, 'petite mais trouvable : ' + r.w);
  await p.evaluate(s => EV.pks.get(s).el.click(), s);
  await p.waitForFunction(s => !EV.fly && EV.st.me.found.includes(s), s, { timeout: 8000 });
  return r;
}

/* ── 1) Calendrier, décor, carte de l'accueil, message d'arrivée une seule fois ── */
{
  const { p, errs, ctx } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: 393, height: 852 } } });
  await ready(p);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'halloween');
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('ev-deco')), true);
  assert.equal(await p.$$eval('body > .ev-amb, body > .ev-amb-top', l => l.length), 2, 'ambiance et feuilles posées');
  await p.waitForSelector('.ev-intro.on', { timeout: 8000 });
  assert.match(await p.textContent('.ev-intro h2'), /La chasse aux citrouilles est ouverte/); assert.equal(await p.$$eval('.ev-in-rules li', l => l.length), 3);
  await p.waitForTimeout(1600); await shot(p, 'arrivee-393-clair');
  await p.click('.ev-in-go'); await p.waitForFunction(() => !document.querySelector('.ev-intro'));
  assert.match(await p.textContent('#hmEvent'), /Chasse aux citrouilles 2026/); assert.match(await p.textContent('#hmEvent .hm-ev-n'), /0\s*\/\s*30/);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.bar .brand .logo')).display !== 'none' && document.getElementById('i-logo').innerHTML.includes('evl-halloween')), true, 'logo de la fête dans l\'en-tête');
  assert.match(await p.evaluate(() => document.querySelector('link[rel="icon"][type="image/png"]').getAttribute('href')), /icons\/events\/halloween\/favicon-32\.png/);
  const fav = await p.evaluate(() => fetch('icons/events/halloween/favicon-32.png').then(r => r.status)); assert.equal(fav, 200, 'icône de la fête servie');
  ok('calendrier forcé : décor, ambiance, logo et icône de la fête, carte de l\'accueil, message d\'arrivée');
  await p.reload(); await ready(p); await p.waitForTimeout(3200);
  assert.equal(await p.$('.ev-intro'), null, 'message d\'arrivée : une seule fois');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.event), 'halloween', 'décor gardé au rechargement');
  ok('message d\'arrivée vu une seule fois');
  const rsSeen = () => p.evaluate(() => !!(evLs().seen || {})[EV.st.ev.id]);
  await p.evaluate(() => { EV.st.me = { ...EV.st.me, rs: Date.now() }; evKeep(EV.st.ev.id, EV.st.me); });      // « Réinitialiser » du panneau : rs plus récent reçu du serveur
  assert.equal(await rsSeen(), false, 'remise à zéro : message d\'arrivée à revoir');
  await p.evaluate(() => evIntroTry()); await p.waitForSelector('.ev-intro.on', { timeout: 8000 }); await p.click('.ev-in-go'); await p.waitForFunction(() => !document.querySelector('.ev-intro'));
  await p.evaluate(() => evKeep(EV.st.ev.id, EV.st.me)); assert.equal(await rsSeen(), true, 'remise à zéro : message d\'arrivée revu une seule fois');
  ok('remise à zéro par le panneau : message d\'arrivée revu');
  const ic = await p.evaluate(async () => {      // appli Android (APK 1.0.13) : icône de la fête demandée à ManaOrbit.setIcon, une fois par changement
    const calls = [], C0 = window.Capacitor; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'ManaOrbit', Plugins: { ManaOrbit: { setIcon: a => { calls.push(a); return Promise.resolve({}); } } } };
    const tick = () => new Promise(r => setTimeout(r, 30)), ev = { ...EV.cal, forced: false };
    try {
      evApply(); await tick();      // fête forcée (EVENT_FORCE) : icône normale
      evNatIcon(ev); await tick(); evNatIcon(ev); await tick(); evNatIcon(null); await tick();
      return { calls, to: EV.cal.to };
    } finally { window.Capacitor = C0; localStorage.removeItem('deckdeal:ev:icon'); }
  });
  assert.deepEqual(ic.calls, [{ pack: null, until: 0 }, { pack: 'halloween', until: Date.parse(ic.to + 'T23:00:00Z') }, { pack: null, until: 0 }], 'setIcon : ' + JSON.stringify(ic.calls));
  ok('appli Android : icône de la fête demandée (retour à minuit après le dernier jour), une fois ; fête forcée ou finie : icône normale');

  /* ── 2) Cachettes du jour : 5, au plus 1 en vue et 2 à un geste ; chacune trouvée pour de vrai ── */
  await p.evaluate(() => collAdd([{ k: 'sol ring', n: 'Sol Ring', q: 2 }, { k: 'arcane signet', n: 'Arcane Signet', q: 1 }]));
  await p.evaluate(() => evStatus(true)); await ready(p);
  const me = await p.evaluate(() => EV.st.me), lv = await p.evaluate(sp => sp.map(x => EV_SPOTS.find(s => s.id === x.s).lvl), me.spots);
  assert.equal(me.spots.length, 5); assert.ok(lv.filter(l => l === 0).length <= 1 && lv.filter(l => l === 1).length <= 2, 'cachées surtout dans les sous-menus : ' + lv);
  ok('cachettes du jour : ' + me.spots.map(x => x.s).join(', '));
  let n = 0, real = 0;
  for (const x of me.spots) {
    await closeAll(p); await p.waitForTimeout(350);
    const code = OPEN[x.s]; let r = { ok: false };
    if (code !== undefined) { if (code) await p.evaluate(`(async () => { ${code}; })()`); await p.waitForTimeout(900); r = await findAndTap(p, x.s, false); if (r.ok) real++; }
    if (!r.ok) { await closeAll(p); await p.waitForTimeout(300); r = await findAndTap(p, x.s, true); }
    assert.ok(r.ok, x.s + ' : objet trouvé');
    n++;
    if (n === 1) {
      await p.waitForSelector('.ev-msg.on'); assert.match(await p.textContent('.ev-msg'), /Bien vu !.*Il te reste 4 citrouilles à trouver aujourd'hui/s);
      assert.match(await p.textContent('.ev-cnt'), /1 \/ 30/); assert.match(await p.textContent('.ev-msg'), /Crée un compte pour garder tes citrouilles/);
    }
  }
  assert.ok(real >= 2, 'au moins 2 cachettes trouvées dans leur vrai écran (' + real + ')');
  await p.waitForSelector('.ev-msg.on'); assert.match(await p.textContent('.ev-msg'), /Tu as trouvé toutes les citrouilles du jour, reviens demain/);
  assert.equal(await p.evaluate(() => [EV.st.me.n, EV.st.me.left, EV.pks.size].join()), '5,0,0');
  ok('5 citrouilles trouvées (' + real + ' dans leur écran) : compteur, « il te reste 4 », « reviens demain », plus rien à l\'écran');

  /* ── 3) Quota et jetons ── */
  const day = me.day, sp = (await api(p, '?c=255')).j.me.spots.find(x => !x.f);
  if (sp) { const r = await api(p, '/claim', { ev: 'halloween-2026', day, s: sp.s, t: sp.t }); assert.equal(r.status, 409); assert.equal(r.j.error, 'day_quota'); }
  assert.equal((await api(p, '/claim', { ev: 'halloween-2026', day, s: me.spots[0].s, t: 'A'.repeat(16) })).status, 403, 'jeton faux');
  assert.equal((await api(p, '/claim', { ev: 'halloween-2026', day: '2026-10-24', s: me.spots[0].s, t: me.spots[0].t })).status, 410, 'autre jour');
  assert.equal((await api(p, '/claim', { ev: 'noel-2026', day, s: me.spots[0].s, t: me.spots[0].t })).status, 404, 'autre événement');
  ok('6e citrouille refusée (quota), jetons faux, d\'un autre jour ou d\'un autre événement refusés');
  await closeAll(p); await p.evaluate(() => document.getElementById('hmEvent').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  assert.match(await p.textContent('#hmEvent'), /5\s*\/\s*30/); assert.match(await p.textContent('#hmEvent'), /reviens demain/);
  await shot(p, 'carte-accueil-393-clair');

  /* ── 4) Avec un compte : la progression de l'appareil rejoint le compte, copiée dans users/{uid}/meta/events ── */
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-e2e-zoe'));
  await signInFake(p);
  await p.evaluate(() => { const s0 = D.cloud.saveMeta; D.cloud.saveMeta = async (uid, id, d) => { if (id === 'events') window.__evDoc = JSON.parse(JSON.stringify(d)); return s0(uid, id, d); }; });
  await p.waitForFunction(() => EV.st && EV.st.acct && EV.st.me && EV.st.me.n === 5, null, { timeout: 15000 });
  await p.waitForFunction(() => window.__evDoc && window.__evDoc.e['halloween-2026'] && window.__evDoc.e['halloween-2026'].n === 5, null, { timeout: 15000 });
  const doc = await p.evaluate(() => window.__evDoc.e['halloween-2026']); assert.equal(Object.values(doc.jours)[0].length, 5); assert.ok(Object.values(doc.sig)[0].length === 22, 'reçu du serveur gardé');
  ok('connexion : les 5 citrouilles rejoignent le compte (serveur) et sa copie Firestore (jours et reçus)');

  /* ── 5) Badges « Événements » ── */
  await p.evaluate(() => prgSheet('ev_halloween-2026')); await p.waitForSelector('.prg-sheet.open .prg-b[data-b="ev_halloween-2026"]');
  const bd = await p.$eval('.prg-b[data-b="ev_halloween-2026"]', b => ({ t: b.textContent, img: b.querySelector('.evb img') && b.querySelector('.evb img').getAttribute('src') }));
  assert.match(bd.t, /Apprenti chasseur/); assert.match(bd.img, /icons\/events\/badges\/halloween-2026-0\.svg/);
  await p.waitForFunction(() => { const i = document.querySelector('.prg-b[data-b="ev_halloween-2026"] .evb img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
  assert.match(await p.textContent('.prg-sheet .prg-h'), /Événements/);
  await shot(p, 'badges-393-clair');
  await p.click('.prg-sheet .prg-b[data-b="ev_halloween-2026"] .prg-ic'); await p.waitForSelector('.prg-bs.open .prg-bs-tiers');
  const bs = await p.textContent('.prg-bs .sheet-body');
  assert.match(bs, /Comment l'obtenir\s*30 citrouilles se cachent dans l'appli jusqu'au 8 novembre\..*Les indices du jour sont sur la carte de la fête/s, 'fenêtre du badge : règles de la fête, où sont les indices');
  assert.deepEqual(await p.$$eval('.prg-bs-tiers li b', l => l.map(x => x.textContent)), ['Apprenti chasseur', 'Traqueur de citrouilles', 'Maître des citrouilles', 'Seigneur d\'Halloween']);
  assert.match(bs, /grade ultime/, '4e palier : grade ultime'); assert.equal(await p.$eval('.prg-bs .sheet-foot', f => f.hidden), true, 'badge d\'événement : pas de vitrine');
  await shot(p, 'badge-fenetre-393-clair'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.prg-bs'));
  ok('badges : catégorie « Événements », palier 1 « Apprenti chasseur », badge généré servi ; sa fenêtre (règles, indices, 4 paliers)');

  /* ── 6) Interrupteur « Décorations de fête » : décor coupé, la chasse reste ── */
  await closeAll(p); await p.evaluate(() => openSettings()); await p.waitForSelector('#setEvDeco');
  await p.$eval('#setEvDeco', i => i.closest('.me-row').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await shot(p, 'preferences-393-clair');
  await p.$eval('#setEvDeco', i => { i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await p.evaluate(() => [document.documentElement.classList.contains('ev-deco'), !!document.querySelector('body > .ev-amb'), document.documentElement.dataset.event].join()), 'false,false,halloween');
  assert.equal(await p.evaluate(() => document.getElementById('i-logo').innerHTML.includes('evl-halloween')), false, 'logo d\'origine');
  await p.$eval('#setEvDeco', i => { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('ev-deco')), true);
  ok('« Décorations de fête » : décor, ambiance et logo coupés puis remis, la fête reste');

  /* ── 6 bis) Aperçu d'une fête (compte de l'éditeur) : Noël à la place d'Halloween, progression d'essai jamais gardée, puis retour ── */
  const ls0 = await p.evaluate(() => localStorage.getItem('deckdeal:ev'));
  assert.equal(await p.$('#setEvPv'), null, 'choix caché : pas l\'adresse de l\'éditeur côté appli');
  await p.evaluate(() => { EV.adm = EV.uid; mePaint(); }); await p.waitForSelector('#setEvPv');      // empreinte de l'éditeur (EV_ADM) simulée ; le serveur, lui, vérifie ADMIN_EMAILS
  assert.ok((await p.$$eval('#setEvPv option', o => o.map(x => x.value))).includes('paques'), 'packs en préparation compris');
  await p.selectOption('#setEvPv', 'noel');
  await p.waitForFunction(() => EV.st && EV.st.ev.id === 'noel-2026' && EV.st.ev.preview && EV.st.me, null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => [document.documentElement.dataset.event, localStorage.getItem('deckdeal:ev:pv'), EV.st.me.n, EV.st.me.spots.length].join()), 'noel,noel,0,3');      // 2 cadeaux + 1 de secours
  const pvs = await p.evaluate(() => { evLsSet({ seen: { ...evLs().seen, 'noel-2026': 1 } }); clearTimeout(EV.introT); document.querySelectorAll('.ev-intro').forEach(e => e.remove()); return EV.st.me.spots[0].s; }); await closeAll(p);      // message d'arrivée (revu en aperçu) : vu
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); window.scrollTo(0, 0); evScan(); }, pvs);
  await p.waitForFunction(s => EV.pks.has(s), pvs, { timeout: 8000 });      // posé (la place exacte est vérifiée plus haut, avec les citrouilles : ici, la progression d'essai)
  await p.evaluate(s => evTap(s), pvs); await p.waitForFunction(() => EV.st.me.n === 1 && !EV.fly, null, { timeout: 8000 }); await p.waitForTimeout(3200);
  assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:ev')), ls0, 'rien de réécrit sur l\'appareil');
  assert.equal(await p.evaluate(() => !!(window.__evDoc && window.__evDoc.e['noel-2026'])), false, 'rien dans le compte');
  assert.equal(await p.evaluate(() => evBadges().find(b => b.ev === 'noel-2026').pv), true, 'badge d\'essai : jamais gardé ni annoncé');
  await p.evaluate(() => { document.querySelectorAll('.ev-msg, .adv-open, .adv-x').forEach(e => e.remove()); while (sheets.length) sheets[sheets.length - 1].close(); openSettings(); }); await p.waitForSelector('#setEvPv');
  await p.selectOption('#setEvPv', 'paques');      // pack en préparation (ready: false) : décor, ambiance, logo, cachettes
  await p.waitForFunction(() => EV.st && EV.st.ev.id === 'paques-2026' && EV.st.ev.preview && EV.st.me && EV.st.me.spots.length === 5, null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => [document.documentElement.dataset.event, !!document.querySelector('body > .ev-amb[data-p="paques"]'), document.getElementById('i-logo').innerHTML.includes('evl-halloween')].join()), 'paques,true,false');
  if (SHOTS) { await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForTimeout(1200); await shot(p, 'apercu-paques-393-clair'); await p.evaluate(() => openSettings()); await p.waitForSelector('#setEvPv'); }
  await p.selectOption('#setEvPv', '');
  await p.waitForFunction(() => EV.st && EV.st.ev.id === 'halloween-2026' && !EV.st.ev.preview && EV.st.me && EV.st.me.n === 5, null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => [document.documentElement.dataset.event, localStorage.getItem('deckdeal:ev:pv'), evCount('halloween-2026')].join()), 'halloween,,5');
  ok('aperçu (éditeur) : Noël à la place d\'Halloween, cadeau d\'essai jamais gardé (appareil, compte, badges), Pâques (en préparation), retour à la vraie fête');
  // un autre compte : le serveur refuse, l'aperçu s'arrête
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-e2e-max'));
  await p.selectOption('#setEvPv', 'nouvelan');
  await p.waitForFunction(() => !EV.pv && localStorage.getItem('deckdeal:ev:pv') === null && document.documentElement.dataset.event === 'halloween', null, { timeout: 15000 });
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-e2e-zoe')); await p.evaluate(() => evStatus(true)); await p.waitForFunction(() => EV.st && EV.st.me && EV.st.me.n === 5, null, { timeout: 15000 });
  await p.evaluate(() => { EV.adm = ''; while (sheets.length) sheets[sheets.length - 1].close(); });
  ok('aperçu refusé par le serveur pour un autre compte : fin de l\'aperçu, la vraie fête revient');
  assert.deepEqual(errs, []);
  await ctx.close();
}

/* ── 7) Rien sur le scan, le compteur de vie ni l'échange en direct ; « réduire les animations » ── */
{
  const { p, errs, ctx } = await newPage(browser, world, { ctx: { reducedMotion: 'reduce', colorScheme: 'dark', viewport: { width: 360, height: 780 } } });
  await ready(p);
  const s = await p.evaluate(() => EV.st.me.spots[0].s);
  await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); evScan(); }, s);
  await p.waitForFunction(s => EV.pks.get(s) && EV.pks.get(s).ok, s, { timeout: 8000 });
  const st = await p.evaluate(s => { const b = EV.pks.get(s).el, c = getComputedStyle(b); return { an: c.animationName, op: c.opacity, rot: b.style.getPropertyValue('--r') }; }, s);
  assert.equal(st.an, 'none', 'réduire les animations : pas de flottement'); assert.equal(st.op, '1', 'mais la citrouille est là'); assert.match(st.rot, /deg$/);
  await shot(p, 'cachee-360-sombre');
  for (const [name, code] of [['scan', 'openScan()'], ['compteur de vie', 'puGo()'], ['échange en direct', "document.body.insertAdjacentHTML('beforeend', '<div class=\"dv trc on\" id=\"fakeTrc\"></div>')"]]) {
    await p.evaluate(code); await p.waitForTimeout(1500); await p.evaluate(() => evScan());
    assert.equal(await p.evaluate(() => [document.documentElement.classList.contains('ev-quiet'), document.querySelectorAll('.ev-pk:not(.ev-wait)').length].join()), 'true,0', name + ' : ni ambiance ni citrouille');
    await p.evaluate(() => { const f = document.getElementById('fakeTrc'); if (f) f.remove(); for (const d of document.querySelectorAll('body > .dv.on')) if (d.__close) d.__close(); });
    if (name === 'scan' && await p.$('.sss-sheet')) await p.click('.sss-sheet [data-ss="del"]');
    await p.waitForTimeout(600);
  }
  ok('rien sur le scan, le compteur de vie ni l\'échange en direct');
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); navGo('home'); window.scrollTo(0, 0); }); await p.waitForTimeout(400);
  await p.evaluate(s => { evScan(); }, s); await p.waitForFunction(s => EV.pks.get(s) && EV.pks.get(s).ok, s, { timeout: 8000 });
  await p.evaluate(s => EV.pks.get(s).el.click(), s); await p.waitForFunction(() => !EV.fly && EV.st.me.n === 1, null, { timeout: 8000 });
  assert.equal(await p.$$eval('.ev-flyo', l => l.length), 0, 'sans envol'); assert.match(await p.textContent('.ev-cnt'), /1 \/ 30/);
  ok('réduire les animations : citrouille visible et fixe, toucher sans envol, compteur à jour');
  assert.deepEqual(errs, []);
  await ctx.close();
}

/* ── 8) Anglais ── */
{
  const { p, errs, ctx } = await newPage(browser, world, { path: '?lang=en&event' });
  await ready(p); await p.waitForSelector('.ev-intro.on', { timeout: 8000 });
  assert.match(await p.textContent('.ev-intro h2'), /The pumpkin hunt is on/); assert.match(await p.textContent('.ev-in-rules'), /30 pumpkins are hiding in the app/);
  await p.click('.ev-in-go'); assert.match(await p.textContent('#hmEvent'), /Pumpkin hunt 2026/); assert.match(await p.textContent('#hmEvent'), /5 left to find today/);
  ok('anglais : message d\'arrivée et carte traduits');
  assert.deepEqual(errs, []);
  await ctx.close();
}

/* ── 9) Captures (EV_SHOTS) : moments clés aux autres tailles ── */
if (SHOTS) {
  for (const [w, h, sch] of [[393, 852, 'dark'], [360, 780, 'light'], [360, 780, 'dark'], [1280, 800, 'light'], [1280, 800, 'dark']]) {
    const { p, ctx } = await newPage(browser, world, { path: '?event', ctx: { viewport: { width: w, height: h }, colorScheme: sch, ...(w > 1000 ? { isMobile: false, hasTouch: false } : {}) } });
    const k = `${w}-${sch === 'dark' ? 'sombre' : 'clair'}`;
    await ready(p); await p.waitForSelector('.ev-intro.on', { timeout: 8000 }); await p.waitForTimeout(1600); await shot(p, 'arrivee-' + k);
    await p.click('.ev-in-go'); await p.waitForTimeout(600); await shot(p, 'accueil-' + k);
    const s = await p.evaluate(() => EV.st.me.spots[0].s);
    await p.evaluate(s => { EV_HIDE[s] = () => document.querySelector('#viewHome .hm-hero'); evScan(); }, s); await p.waitForFunction(s => EV.pks.get(s) && EV.pks.get(s).ok, s);
    await p.evaluate(s => EV.pks.get(s).el.click(), s); await p.waitForTimeout(560); await shot(p, 'envol-' + k);
    await p.waitForTimeout(1500); await shot(p, 'message-' + k);
    await p.evaluate(() => { EV.st.me.n = 30; evParty(); }); await p.waitForTimeout(1300); await shot(p, '30-sur-30-' + k);
    await ctx.close();
  }
  ok('captures dans ' + SHOTS);
}

world.stop(); F.stop(); await browser.close();
console.log('EVENT E2E OK');
process.exit(0);
