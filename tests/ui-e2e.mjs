// E2E interactions de la passe UI/UX : feuille glissable (swipe pour fermer), sens des transitions de vue, filet de la barre au scroll,
// reflet du total, fondu des onglets de la collection, illustration de collection vide.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, done, toInput, toHome, closeSheets } from './e2e-world.mjs';

const world = await startWorld({ port: 18940 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);

/* feuille : un petit glissé revient, un grand glissé (> 28 % de la hauteur) ferme ; les boutons de l'en-tête ne lancent pas de glissé */
const drag = (sel, dy, dt = 400) => p.evaluate(([sel, dy, dt]) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + 40, y = r.top + 8;
  const ev = (t, yy) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: yy, isPrimary: true }));
  return new Promise(res => { ev('pointerdown', y); const sh = document.querySelector('.sheet'); setTimeout(() => { ev('pointermove', y + dy); const mid = { tr: sh.style.transform, cls: sh.classList.contains('drag'), bd: document.querySelector('.sheet-backdrop').style.opacity }; ev('pointerup', y + dy); res(mid); }, dt); });
}, [sel, dy, dt]);
await p.evaluate(() => openSheet('Essai', 'sous-titre', api => { api.body.innerHTML = '<p style="height:900px">corps</p>'; }));
await p.waitForSelector('.sheet-wrap.open');
const small = await drag('.sheet .grab', 30);
assert.match(small.tr, /translate\(-50%,\s*30px\)/, 'la feuille suit le doigt : ' + small.tr); assert.equal(small.cls, true, 'classe .drag pendant le glissé (pas de transition)');
await p.waitForTimeout(500);
assert.equal(await p.$$eval('.sheet-wrap.open', e => e.length), 1, 'petit glissé : la feuille reste ouverte');
assert.equal(await p.$eval('.sheet', e => e.style.transform), '', 'transform en ligne retiré (retour animé par la CSS)');
assert.equal(await p.$eval('.sheet', e => e.classList.contains('drag')), false);
ok('feuille : suit le doigt, revient après un petit glissé');
const big = await drag('.sheet .sheet-head', 400, 120);
assert.ok(parseFloat(big.bd) < 0.8, 'fond qui s’éclaircit pendant le glissé : ' + big.bd);
await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
assert.equal(await p.$eval('#app', a => a.inert), false, 'page rendue à nouveau active après la fermeture');
ok('feuille : grand glissé (poignée ou en-tête) ferme, fond et inert restaurés');
await p.evaluate(() => openSheet('Essai', '', api => { api.body.innerHTML = 'x'; }));
await p.waitForSelector('.sheet-wrap.open');
await p.evaluate(() => { const b = document.querySelector('.sheet-head .icon-btn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', clientY: 10 })); });
assert.equal(await p.$eval('.sheet', e => e.classList.contains('drag')), false, 'pointerdown sur le bouton fermer : pas de glissé');
await p.click('.sheet-head .icon-btn'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
ok('feuille : le bouton fermer reste un bouton');

/* barre : filet seulement quand le contenu passe dessous */
assert.equal(await p.$eval('.bar', b => b.classList.contains('scrolled')), false);
await toInput(p); await p.click('#btnSample'); await p.waitForTimeout(200);
await p.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' })); await p.waitForTimeout(500);
assert.equal(await p.$eval('.bar', b => b.classList.contains('scrolled')), true, 'filet sous la barre après scroll');
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.waitForFunction(() => !document.querySelector('.bar').classList.contains('scrolled'), null, { timeout: 3000 }).catch(() => {});
assert.equal(await p.$eval('.bar', b => b.classList.contains('scrolled')), false, 'filet retiré en haut de page (scrollY ' + await p.evaluate(() => scrollY) + ')');
ok('barre : filet au scroll seulement');

/* transitions de vue : de la droite en avançant, de la gauche en revenant ; reflet sur le total à l'arrivée */
await toInput(p); await p.fill('#deckText', '1 Sol Ring\n1 Swords to Plowshares\n1 Arcane Signet'); await p.waitForTimeout(300);
await toInput(p); await p.click('#btnRun'); await done(p);
assert.equal(await p.$eval('#viewResults', e => e.classList.contains('fwd') && !e.classList.contains('back')), true, 'résultats : classe fwd');
assert.equal(await p.$eval('#hero', e => e.classList.contains('shine')), true, 'reflet sur le total');
await p.click('#btnBack'); await p.waitForTimeout(100);
assert.equal(await p.$eval('#viewInput', e => e.classList.contains('back') && !e.classList.contains('fwd')), true, 'saisie : classe back');
assert.equal(await p.$eval('#viewResults', e => e.hidden), true);
ok('vues : sens des transitions (fwd / back) et reflet du total');

/* collection vide : illustration + fondu des onglets */
await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
assert.equal(await p.$$eval('.empty-art i', e => e.length), 3, 'collection vide : trois cartes en éventail'); assert.match(await txt(p, '.dv-empty'), /Pas encore de cartes pour l'instant/);
ok('collection vide : illustration');
await p.click('.coll-tools [data-act="import"]'); await p.waitForSelector('#ciText');
await p.fill('#ciText', '1 Sol Ring\n1 Llanowar Elves'); await p.waitForTimeout(150); await p.click('#ciGo');
await p.waitForFunction(() => document.querySelectorAll('.crow').length === 2);
await p.waitForTimeout(500); if (await p.$('.sheet-wrap.open')) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
if (!(await p.$('#collSeg'))) { await toHome(p); await p.click('#btnColl'); await p.waitForSelector('#collSeg'); }
await p.click('#collSeg [data-v="stats"]'); await p.waitForSelector('.cs-tiles');
assert.equal(await p.$eval('.coll-main', e => e.classList.contains('tabin')), true, 'onglet : fondu à l’arrivée');
await p.click('#collSeg [data-v="list"]'); await p.waitForSelector('.crow');
assert.equal(await p.$eval('.coll-main', e => e.classList.contains('tabin')), true);
ok('collection : fondu des onglets');

// premier lancement sur un petit écran (ou police système agrandie) : l'écran défile, « Commencer » reste atteignable
{ const S2 = await newPage(browser, world, { ctx: { viewport: { width: 360, height: 520 } } });
  await S2.p.evaluate(() => obOpen()); await S2.p.waitForSelector('.ob.on'); await S2.p.waitForTimeout(400);
  const g = await S2.p.$eval('.ob-s', s => ({ sh: s.scrollHeight, ch: s.clientHeight }));
  assert.ok(g.sh > g.ch, 'contenu plus haut que l\'écran : la première page défile (' + JSON.stringify(g) + ')');
  await S2.p.$eval('.ob-s', s => { s.scrollTop = s.scrollHeight; }); await S2.p.waitForTimeout(200);
  const r = await S2.p.$eval('.ob-s [data-ob="next"]', b => { const x = b.getBoundingClientRect(); return { top: x.top, bottom: x.bottom, vh: innerHeight }; });
  assert.ok(r.top >= 0 && r.bottom <= r.vh, '« Commencer » visible en bas après défilement : ' + JSON.stringify(r));
  await S2.p.click('.ob-s [data-ob="next"]'); await S2.p.waitForTimeout(500);
  assert.deepEqual(S2.errs, []); await S2.ctx.close(); }
ok('premier lancement : défile sur un petit écran, « Commencer » atteignable');

// premier lancement plus large que 520 px (ordinateur, tablette, téléphone à l'horizontale) : à chaque étape, l'écran actif seul, entier et centré
for (const [w, h, rm] of [[1280, 800], [1890, 1000, 'reduce'], [820, 1180], [844, 390], [360, 780]]) {
  const S3 = await newPage(browser, world, { ctx: { viewport: { width: w, height: h }, reducedMotion: rm || 'no-preference' } });
  await S3.p.evaluate(() => obOpen()); await S3.p.waitForSelector('.ob.on');
  for (let i = 0; i < 3; i++) {
    await S3.p.evaluate(i => obGo(i), i); await S3.p.waitForTimeout(rm ? 80 : 600);
    const g = await S3.p.evaluate(() => {
      const vw = innerWidth, ss = [...document.querySelectorAll('.ob-s')], a = ss[OB.i], kids = [...a.children].map(k => k.getBoundingClientRect()).filter(r => r.width);
      const L = Math.min(...kids.map(r => r.left)), R = Math.max(...kids.map(r => r.right));
      const ar = a.getBoundingClientRect(), cs = getComputedStyle(a), cl = ar.left + parseFloat(cs.paddingLeft), cr = ar.right - parseFloat(cs.paddingRight);      // colonne : boîte de contenu
      return { vw, L: Math.round(L), R: Math.round(R), mid: Math.round((cl + cr) / 2), cw: Math.round(cr - cl), sc: document.querySelector('.ob').scrollLeft,
        others: ss.filter(s => s !== a).map(s => s.getBoundingClientRect()).filter(r => r.right > 1 && r.left < vw - 1).length };
    });
    const tag = `${w}×${h} étape ${i + 1} : ${JSON.stringify(g)}`;
    assert.ok(g.L >= 0 && g.R <= g.vw, 'contenu de l\'écran actif entier dans la fenêtre — ' + tag);
    assert.ok(Math.abs(g.mid - g.vw / 2) <= 2, 'écran actif centré — ' + tag);
    assert.ok(g.cw <= 472 && g.cw >= Math.min(472, g.vw - 48), 'colonne de 520 px au plus, marges de 24 px comprises — ' + tag);
    assert.equal(g.others, 0, 'les autres écrans hors de la fenêtre — ' + tag); assert.equal(g.sc, 0, tag);
  }
  // dialogue modal : l'appli dessous est inerte ; Échap = « Passer »
  assert.equal(await S3.p.$eval('#app', a => a.inert), true, 'appli inerte sous le premier lancement');
  await S3.p.keyboard.press('Escape'); await S3.p.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 3000 });
  assert.equal(await S3.p.$eval('#app', a => a.inert), false, 'Échap : premier lancement fermé, appli rendue active');
  assert.equal(await S3.p.evaluate(() => !!localStorage.getItem('deckdeal:onboard')), true, 'Échap : marqué comme vu');
  assert.deepEqual(S3.errs, []); await S3.ctx.close();
}
ok('premier lancement à 1280, 1890 (sans animation), 820, 844 × 390 et 360 px : chaque étape entière et centrée ; appli inerte, Échap = Passer');

// premier lancement, étape 3 « Sauvegarde ta collection » : Google en une touche (même connexion que la feuille Compte), e-mail en lien, Plus tard ;
// plus de token CardTrader demandé (lien discret vers Compte et réglages › Prix) ; hors ligne : un mot humain et « Plus tard » seulement
{ const S4 = await newPage(browser, world, { ctx: { viewport: { width: 393, height: 852 } } }), q = S4.p;
  const step3 = async st => { await q.evaluate(st => { window.__gg = 0; window.__ggErr = null; D.state = st; D.cloud = { google: async () => { window.__gg++; if (window.__ggErr) throw window.__ggErr; } }; obOpen(); obGo(2); }, st); await q.waitForSelector('.ob.on'); await q.waitForTimeout(500); };
  const acts = () => q.$$eval('#obSave button:not([hidden])', l => l.map(b => b.textContent.trim()));
  await step3('ready');
  assert.equal(await q.$eval('.ob-s:nth-child(3) h2', h => h.textContent), 'Sauvegarde ta collection');
  assert.equal(await q.$('#obToken'), null, 'plus de champ de token CardTrader');
  assert.deepEqual(await acts(), ['Continuer avec Google', 'Autres options (e-mail)', 'Plus tard', 'Tu as un token CardTrader ?']);
  assert.deepEqual(await q.$$eval('#obSave .btn-g .g-logo path', l => l.map(x => x.getAttribute('fill'))), ['#EA4335', '#4285F4', '#FBBC05', '#34A853'], 'logo Google aux couleurs de la charte');
  assert.equal(await q.$eval('#obSave .btn-g', b => getComputedStyle(b).backgroundColor), 'rgb(255, 255, 255)', 'bouton Google blanc sur le fond sombre');
  assert.equal(await q.$eval('.ob-skip', b => b.hidden), true, 'dernière étape : pas de « Passer » (« Plus tard » à la place)');
  // Google refusé : message ; fenêtre fermée : rien ; accepté : premier lancement fermé, appli rendue active
  await q.evaluate(() => { window.__ggErr = Object.assign(new Error('x'), { code: 'auth/popup-blocked' }); }); await q.click('#obSave [data-ob="google"]'); await q.waitForSelector('#obMsg:not([hidden])');
  assert.match(await txt(q, '#obMsg'), /Fenêtre bloquée/); assert.equal(await q.$eval('#obSave [data-ob="google"]', b => b.disabled), false);
  await q.evaluate(() => { window.__ggErr = Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); }); await q.click('#obSave [data-ob="google"]'); await q.waitForTimeout(200);
  assert.equal(await q.$eval('#obMsg', m => m.hidden), true, 'fenêtre fermée par l\'utilisateur : aucun message');
  await q.evaluate(() => { window.__ggErr = null; }); await q.click('#obSave [data-ob="google"]'); await q.waitForFunction(() => !document.querySelector('.ob'), null, { timeout: 3000 });
  assert.equal(await q.evaluate(() => window.__gg), 3, 'D.cloud.google appelé à chaque touche'); assert.equal(await q.$eval('#app', a => a.inert), false); assert.match(await q.textContent('#toast'), /Connecté/);
  // SDK encore en chargement : Google grisé, puis prêt dès que l'état change (paintAccount → obSavePaint)
  await step3('loading'); assert.equal(await q.$eval('#obSave [data-ob="google"]', b => b.disabled), true, 'chargement : Google grisé');
  await q.evaluate(() => { D.state = 'ready'; paintAccount(); }); assert.equal(await q.$eval('#obSave [data-ob="google"]', b => b.disabled), false, 'prêt : Google actif');
  // « Autres options (e-mail) » → feuille Compte ; « Tu as un token CardTrader ? » → Compte et réglages › Prix
  await q.click('#obSave [data-ob="account"]'); await q.waitForSelector('.sheet-wrap.open #acEmail'); await closeSheets(q);
  await step3('ready'); await q.click('#obSave [data-ob="ct"]'); await q.waitForSelector('.sheet-wrap.open #setToken', { timeout: 5000 });
  assert.equal(await q.evaluate(() => !!document.querySelector('.ob')), false, 'lien CardTrader : Compte et réglages › Prix (champ du token)'); await closeSheets(q);
  // hors ligne (réseau coupé, ou service de compte injoignable) : message humain, « Plus tard » seul ; retour du réseau : Google revient
  await step3('ready'); await S4.ctx.setOffline(true); await q.waitForSelector('#obSave .ob-save-off');
  assert.deepEqual(await acts(), ['Plus tard']); const off = await txt(q, '#obSave .ob-save-off');
  assert.match(off, /^Pas de connexion pour l'instant\. Ta collection reste sur cet appareil/); assert.doesNotMatch(off, /Firebase|SDK/);
  await S4.ctx.setOffline(false); await q.waitForSelector('#obSave [data-ob="google"]');
  await q.click('#obSave [data-ob="done"]'); await q.waitForFunction(() => !document.querySelector('.ob'));
  await step3('unavailable'); assert.deepEqual(await acts(), ['Plus tard'], 'Firebase indisponible : « Plus tard » seulement'); assert.doesNotMatch(await txt(q, '#obSave'), /Firebase|SDK/);
  await q.keyboard.press('Escape'); await q.waitForFunction(() => !document.querySelector('.ob'));
  assert.deepEqual(S4.errs, []); await S4.ctx.close(); }
ok('premier lancement, étape 3 : « Sauvegarde ta collection » (Google avec son logo, refus et fenêtre fermée, chargement, e-mail, token CardTrader en lien), hors ligne : « Plus tard » seul');

// feuille Compte : « Continuer avec Google » en premier, avec son logo ; l'e-mail ensuite ; œil du mot de passe
{ const S5 = await newPage(browser, world, { ctx: { viewport: { width: 393, height: 852 } } }), q = S5.p;
  await q.evaluate(() => { window.__gg = 0; D.state = 'ready'; D.cloud = { google: async () => { window.__gg++; throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); } }; openAccount(); });
  await q.waitForSelector('.sheet-wrap.open #acEmail');
  assert.deepEqual(await q.$$eval('.sheet-wrap.open .auth > *', l => l.map(e => e.id || e.className.split(' ').slice(0, 2).join('.'))), ['acGoogle', 'divider', 'acSeg', 'acForm', 'hint'], 'Google d\'abord, puis Connexion / Créer un compte et le formulaire');
  assert.equal(await txt(q, '#acGoogle'), 'Continuer avec Google'); assert.equal(await q.$$eval('#acGoogle .g-logo path', l => l.length), 4, 'logo Google');
  assert.equal(await txt(q, '.sheet-wrap.open .divider'), 'ou avec ton e-mail');
  await q.click('#acGoogle'); await q.waitForTimeout(200); assert.equal(await q.evaluate(() => window.__gg), 1);
  await q.fill('#acPw', 'secret12'); assert.equal(await q.$eval('#acPw', i => i.type), 'password');
  assert.equal(await q.$eval('#acPwEye', b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')].join('|')), 'Afficher le mot de passe|false');
  await q.click('#acPwEye');
  assert.deepEqual(await q.evaluate(() => [acPw.type, acPwEye.getAttribute('aria-pressed'), acPwEye.getAttribute('aria-label'), document.activeElement.id, acPw.value]), ['text', 'true', 'Masquer le mot de passe', 'acPw', 'secret12'], 'œil : mot de passe en clair, focus gardé dans le champ');
  const r = await q.$eval('#acPwEye', b => { const x = b.getBoundingClientRect(); return [x.width, x.height]; }); assert.ok(r[0] >= 44 && r[1] >= 44, 'œil : cible de 44 px : ' + r);
  await q.click('#acPwEye'); assert.equal(await q.$eval('#acPw', i => i.type), 'password', 'deuxième touche : masqué');
  await q.click('#acSeg [data-v="up"]'); await q.waitForSelector('#acGo'); assert.equal(await txt(q, '#acGo'), 'Créer mon compte'); assert.ok(await q.$('#acPwEye'), 'création de compte : œil aussi');
  await q.emulateMedia({ colorScheme: 'dark' }); await q.waitForTimeout(100);
  assert.equal(await q.$eval('#acGoogle', b => getComputedStyle(b).backgroundColor), 'rgb(19, 19, 20)', 'thème sombre : bouton Google #131314 (charte)');
  assert.deepEqual(S5.errs, []); await S5.ctx.close(); }
ok('connexion : « Continuer avec Google » en premier avec son logo, e-mail ensuite ; œil du mot de passe (clair / masqué, focus gardé, 44 px) ; bouton sombre en thème sombre');

/* Réglages : chaque contrôle a un nom accessible (arbre d'accessibilité, comme TalkBack) ; texte secondaire (--ink-3) ≥ 4,5:1 sur les fonds, en clair et en sombre */
await p.evaluate(() => openSettings()); await p.waitForSelector('.sheet-wrap.open #setHaptic');
assert.equal(await p.getByRole('checkbox', { name: /^Vibrations/ }).count(), 1, '« Vibrations » : interrupteur nommé');
{ const cdp = await p.context().newCDPSession(p); const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const ROLES = ['checkbox', 'switch', 'button', 'combobox', 'textbox', 'radio', 'slider', 'link'];
  const sheet = await p.evaluate(() => { const ids = []; document.querySelectorAll('.sheet-wrap.open input, .sheet-wrap.open button, .sheet-wrap.open select, .sheet-wrap.open a, .sheet-wrap.open textarea').forEach((e, i) => { if (!e.id) e.id = '__ax' + i; ids.push(e.id); }); return ids; });
  const byDom = new Map(); for (const n of nodes) if (n.backendDOMNodeId) byDom.set(n.backendDOMNodeId, n);
  const unnamed = []; let seen = 0;
  for (const id of sheet) {
    const { node } = await cdp.send('DOM.describeNode', { objectId: (await cdp.send('Runtime.evaluate', { expression: `document.getElementById(${JSON.stringify(id)})` })).result.objectId });
    const ax = byDom.get(node.backendNodeId);
    if (ax && !ax.ignored && ROLES.includes(ax.role && ax.role.value)) { seen++; if (!(ax.name && String(ax.name.value).trim())) unnamed.push(id); }
  }
  assert.ok(seen >= 8, 'contrôles des Réglages lus dans l\'arbre d\'accessibilité : ' + seen); assert.deepEqual(unnamed, [], 'Réglages : contrôles sans nom accessible'); await cdp.detach(); }
await p.click('.sheet-head .icon-btn'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
const contrast = await p.evaluate(() => {
  const L = c => { const m = c.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }, r = document.documentElement, was = r.getAttribute('data-theme'), out = {};
  for (const th of ['light', 'dark']) { r.setAttribute('data-theme', th); const cs = getComputedStyle(r), v = n => cs.getPropertyValue(n).trim(); for (const bg of ['--bg', '--surface', '--surface-2']) out[th + ' ' + bg] = +cr(v('--ink-3'), v(bg)).toFixed(2); }
  if (was) r.setAttribute('data-theme', was); else r.removeAttribute('data-theme');
  return out;
});
assert.ok(Object.values(contrast).every(x => x >= 4.5), 'texte secondaire ≥ 4,5:1 : ' + JSON.stringify(contrast));
ok('Réglages : « Vibrations » et tous les contrôles nommés ; texte secondaire lisible (AA) en clair et en sombre');

assert.deepEqual(errs, [], 'aucune erreur page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('OK');
