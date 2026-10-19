// E2E Carte mystère (port 19710) : faux Scryfall côté serveur (daily-fakes.mjs : carte PNG fabriquée, impressions par langue) derrière le vrai proxy.mjs,
// jetons Firebase signés par le test (amis-fakes.mjs). Ouvert à tous (16 octobre) ; serveur qui ne l'annonce pas (DAILY=0) : aucun bouton.
// Compte connecté (appli Android simulée) : « Participer ? », décompte, partie classée trouvée à l'étape 1, bandeau AdMob caché pendant le décompte et la partie,
// revenu au résultat ; classements jour, semaine, saison, niveaux (XP envoyée, plafonnée par le serveur), podium de la barre du haut, lien « Classement » de la
// fiche « Niveau et badges », dailyBadges(). Puis un second compte sur le même appareil : partie d'entraînement, non classée ; abandon sans la réponse.
// Sans compte : jouer demande de se connecter. Compte récent (français) : les deux icônes à côté du logo (orbites, pulsation ; voyant fixe si animations réduites), « Participer ? », décompte 3-2-1, chrono,
// étape 2 dévoilée toute seule à 12 s (image de l'étape 2 refusée avant), « Indice suivant » jusqu'à l'étape 8 (pixels, illustration, type, texte, nom par la
// fin), recherche « ange » en français seulement, mauvaise proposition (+10 s), trouvée, score du serveur au temps, partage sans la réponse, coche sur le bouton.
// Anti-triche : ni nom, ni extension, ni adresse Scryfall avant la fin. Captures : DAILY_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, startWorld, newPage, ok, signInFake } from './e2e-world.mjs';
import { startFakes } from './amis-fakes.mjs';
import { SERRA } from './daily-fakes.mjs';
import { dlyMask, dlyScore } from '../daily-srv.mjs';
const require = createRequire(import.meta.url);
const { prgLevel } = require('../src/progress.js');

const SHOTS = process.env.DAILY_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name, clip) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, name + '.png'), ...(clip ? { clip } : {}) }); };
// catalogue des noms français servi par le site (≥ 500 lignes) : « ange » doit trouver les trois premiers, jamais « Archange de Serra » ni un nom anglais
const FR = ['Ange de Serra\tSerra Angel\t', 'Ange gardien\tGuardian Angel\t', 'Angelot de lumière\tCherub of Light\t', 'Archange de Serra\tSerra Archangel\t', 'Anneau solaire\tSol Ring\t', 'Épées aux charrues\tSwords to Plowshares\t'];
for (let i = 0; i < 600; i++) FR.push(`Vrombl ${String(i).padStart(4, '0')} Quarnax\tVrombl Card ${i}\t`);
writeFileSync(join(process.env.PWA_DIR, 'fr-names.tsv'), FR.join('\n') + '\n');

const F = await startFakes();
// DAILY_MIN_AGE_DAYS=0 (la valeur par défaut depuis le 19 octobre 2026) : les comptes du test, tout neufs, sont classés (la règle facultative des N jours est vérifiée par test-daily.mjs)
const world = await startWorld({ port: 19710, daily: { cards: [SERRA] }, env: { FIREBASE_JWKS_URL: F.env.FIREBASE_JWKS_URL, DAILY_MIN_AGE_DAYS: '0' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const done = () => { try { world.stop(); F.stop(); } catch { /* ignore */ } };
process.on('exit', done);
for (let i = 0; i < 200; i++) { try { const j = await (await fetch(world.url + 'api/daily')).json(); if (j.st === 'ready') break; } catch { /* serveur pas encore là */ } await new Promise(r => setTimeout(r, 200)); }
const LEAK = /serra|anjo|scryfall|"tst"|"17"|test set/i;      // le nom (toutes langues : « … de Serra », « Serra-Engel »…), l'extension, le numéro, Scryfall

/** Page mobile ; test : window.MO_TEST ; native : appli Android simulée (faux AdMob, comme ads-e2e) ; ping : champs de /__ping remplacés. */
async function page(o = {}) {
  const pg = await newPage(browser, world, { goto: false, ctx: { timezoneId: 'Europe/Paris' } });
  await pg.p.route('https://www.gstatic.com/**', r => r.abort());      // SDK Firebase injoignable : compte connu tout de suite (signInFake)
  if (o.ping) await pg.p.route('**/__ping', async r => { const res = await r.fetch(); r.fulfill({ response: res, json: { ...(await res.json()), ...o.ping } }); });
  await pg.p.addInitScript(t => { if (t) window.MO_TEST = true; window.__shared = []; try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) { /* ignore */ } navigator.clipboard.writeText = async x => { window.__shared.push(x); }; }, o.test !== false);
  if (o.native) await pg.p.addInitScript(() => {
    const L = {}, emit = (ev, d) => (L[ev] || []).forEach(f => f(d)); let banner = false, visible = false; const log = window.__ad = { calls: [] };
    const AdMob = { addListener: (ev, f) => { (L[ev] = L[ev] || []).push(f); return { remove: async () => {} }; }, requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', canRequestAds: true }), showConsentForm: async () => ({ canRequestAds: true }), initialize: async () => {},
      showBanner: async () => { log.calls.push('showBanner'); banner = visible = true; setTimeout(() => { if (banner && visible) emit('bannerAdSizeChanged', { width: 390, height: 61 }); }, 60); },
      hideBanner: async () => { log.calls.push('hideBanner'); visible = false; emit('bannerAdSizeChanged', { width: 0, height: 0 }); },
      resumeBanner: async () => { log.calls.push('resumeBanner'); if (banner) { visible = true; emit('bannerAdSizeChanged', { width: 390, height: 61 }); } },
      removeBanner: async () => { log.calls.push('removeBanner'); if (banner) { banner = visible = false; setTimeout(() => emit('bannerAdSizeChanged', { width: 0, height: 0 }), 0); } }, showPrivacyOptionsForm: async () => {} };
    const Plugins = { AdMob }; window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n in Plugins, Plugins };
  });
  pg.bodies = []; pg.cards = [];
  pg.p.on('response', async r => { const u = r.url(); if (/\/api\/(daily|level)/.test(u) && !/\/img\?/.test(u)) { try { pg.bodies.push({ u, t: await r.text() }); } catch { /* ignore */ } } });
  pg.p.on('request', r => { if (/cards\.scryfall\.io/.test(r.url())) pg.cards.push(r.url()); });
  await pg.p.goto(world.url); await pg.p.waitForTimeout(500);
  return pg;
}
const step = p => p.$eval('.dly .dly-stp', e => e.textContent);
const stepIs = (p, n, timeout = 8000) => p.waitForFunction(t => { const e = document.querySelector('.dly .dly-stp'); return e && e.textContent === t; }, `Étape ${n} sur 10`, { timeout });
async function next(p, n) { await p.click('.dly [data-dly="next"]:not([disabled])'); await stepIs(p, n); }
const imgOk = (p, sel) => p.waitForFunction(s => { const f = document.querySelector(s); const i = f && f.querySelector('img'); return f && f.classList.contains('ok') && i.naturalWidth > 0; }, sel, { timeout: 8000 });
/** « Participer ? » → « C'est parti » → décompte → chrono (étape 1, image chargée). shots : captures de la feuille et du décompte. */
async function join_(p, shots, nick) {
  await p.click('#btnDaily'); await p.waitForSelector('.dly-ask.open [data-dly="go"]');
  if (nick) { assert.ok(await p.$('.dly-ask .dly-nick input'), 'sans pseudo dans le profil : demandé avant de jouer'); await p.fill('.dly-ask .dly-nick input', nick); }
  assert.match(await p.$eval('.dly-ask', e => e.textContent), /Participer à la Carte mystère du jour \?/);
  assert.deepEqual(await p.$$eval('.dly-ask .dly-rules li', l => l.map(x => x.textContent.slice(1))), ['10 indices, un nouveau toutes les 12 secondes.', 'Le score baisse avec le temps : 1 000 points au départ, 7,5 de moins par seconde.', '6 essais ; une mauvaise proposition coûte 10 secondes.', 'Une seule partie classée par jour.']);
  assert.equal(await p.$('.dly'), null, 'rien ne commence avant « C\'est parti »');
  if (shots) { await p.waitForTimeout(350); await shot(p, 'daily-2-participer'); }
  await p.click('.dly-ask [data-dly="go"]');
  await p.waitForFunction(() => { const c = document.querySelector('.dly .dly-cn'); return c && c.textContent === '3'; }, null, { timeout: 8000 });
  assert.ok(await p.$eval('.dly', e => e.classList.contains('dly-play')), 'décompte : déjà en jeu (pas de pub)');
  if (shots) { await p.waitForTimeout(450); await shot(p, 'daily-3-decompte'); }
  await p.waitForFunction(() => { const c = document.querySelector('.dly .dly-cn'); return c && c.textContent === '1'; }, null, { timeout: 4000 });
  await p.waitForSelector('.dly .dly-chrono', { timeout: 6000 }); await imgOk(p, '.dly-art');
  assert.equal(await step(p), 'Étape 1 sur 10');
}

{ // 1) adresse normale : ouvert à tous ; serveur qui ne l'annonce pas : rien
  const a = await page({ test: false });
  await a.p.waitForFunction(() => CTX.proxy === true && CTX.daily === true, null, { timeout: 15000 });
  await a.p.waitForSelector('#btnDaily', { timeout: 8000 }); assert.ok(await a.p.$('#btnRanks'), 'adresse normale : les deux boutons (ouvert à tous depuis le 16 octobre)');
  await a.ctx.close();
  const b = await page({ ping: { daily: false } });
  await b.p.waitForFunction(() => CTX.proxy === true, null, { timeout: 15000 }); await b.p.waitForTimeout(400);
  assert.equal(await b.p.$('#dlyHbs'), null, 'DAILY=0 sur le serveur : aucun bouton');
  await b.ctx.close();
  ok('adresse normale : boutons présents ; jeu coupé sur le serveur (DAILY=0) : ni boutons, ni écran, ni badges');
}

// classement des niveaux : deux autres joueurs déjà là (XP envoyée par leur appli)
for (const [uid, n, xp] of [['uid-zed', 'Zed', 49000], ['uid-max', 'Max', 1200]]) {
  const r = await fetch(world.url + 'api/level', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-firebase-token': F.jwt(uid) }, body: JSON.stringify({ xp, n }) });
  assert.equal(r.status, 200, await r.text());
}

{ // 2) appli Android simulée, compte connecté : partie classée, pub cachée pendant le décompte et la partie, revenue au résultat ; classements, niveaux, badges
  //    puis un second compte sur le même appareil : entraînement, non classé ; abandon : pas de réponse avant la carte suivante
  const { p, ctx, errs, bodies } = await page({ native: true });
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-ana'));
  await p.evaluate(() => { const real = prgNow; window.prgNow = () => ({ ...real(), xp: 23456 }); });      // XP du module niveau et badges (progress.js) : envoyée au classement des niveaux
  await signInFake(p, { uid: 'uid-ana', email: 'uid-ana@test.dev' });
  await p.waitForTimeout(400); await p.evaluate(() => { PROF.name = 'Ana'; });
  await p.evaluate(() => { AD.grace = 0; AD.offMs = 0; AD.delay = 300; AD.back = 100; AD.idle = 0; adsRefresh(); });
  await p.waitForFunction(() => document.documentElement.classList.contains('ad-on'), null, { timeout: 10000 });
  await p.waitForSelector('#btnDaily[data-new="1"]', { timeout: 15000 });
  await join_(p, false);
  await p.waitForFunction(() => !document.documentElement.classList.contains('ad-on'), null, { timeout: 8000 });
  assert.ok((await p.evaluate(() => window.__ad.calls)).includes('hideBanner'), 'partie en cours : bandeau caché');
  assert.equal(await p.$('.dly-note'), null, 'compte : partie classée'); assert.equal(await p.$eval('.dly-sub', e => e.textContent), 'Partie classée');
  await p.fill('.dly-q', 'ange de'); await p.waitForSelector('.dly-sug .dly-o >> text=Ange de Serra');
  await p.waitForTimeout(600); assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains('ad-on'))), 'recherche, liste ouverte : toujours pas de bandeau (clics accidentels)');
  await p.click('.dly-sug .dly-o >> text=Ange de Serra');
  await p.waitForSelector('.dly-res', { timeout: 8000 });
  await p.waitForFunction(() => document.documentElement.classList.contains('ad-on'), null, { timeout: 8000 });
  assert.ok((await p.evaluate(() => window.__ad.calls)).includes('resumeBanner'), 'résultat : le bandeau revient');
  assert.equal(await p.$eval('.dly .dv-head', e => getComputedStyle(e).marginBottom), (61 + 20) + 'px', 'la place du bandeau sous l\'en-tête');
  const res = await p.evaluate(() => DY.v.res);
  assert.ok(res.win && res.step === 1 && res.ms > 0 && res.ms < 12e3, 'trouvée à l\'étape 1 : ' + JSON.stringify(res));
  assert.equal(res.s, dlyScore(res.ms), 'score calculé par le serveur au temps de la bonne réponse');
  assert.equal(Number((await p.$eval('.dly-score b', e => e.textContent)).replace(/\D/g, '')), res.s);
  assert.match(await p.$eval('.dly-place', e => e.textContent), /Place 1 sur 1/);
  await p.waitForSelector('.dly-bd .dly-rows');
  assert.match(await p.$eval('.dly-bd .dly-row.me', e => e.textContent), /^1Ana toi\s*[\d\s  ]+$/, 'classement du jour : moi, avec mon pseudo');
  await p.click('#dlySeg [data-v="week"]'); await p.waitForFunction(() => /Semaine du/.test(document.querySelector('.dly-bd').textContent));
  assert.match(await p.$eval('.dly-bd .dly-row.me', e => e.textContent), /Ana.*1 jour/);
  await p.click('#dlySeg [data-v="season"]'); await p.waitForFunction(() => /Saison de/.test(document.querySelector('.dly-bd').textContent));
  await p.click('#dlySeg [data-v="level"]'); await p.waitForFunction(() => /Niveaux/.test((document.querySelector('.dly-bd .dly-when') || {}).textContent || ''));
  const lv = await p.$$eval('.dly-bd .dly-row', l => l.map(x => [x.querySelector('.dly-r').textContent, x.querySelector('.dly-n').textContent, x.querySelector('.dly-d').textContent, x.querySelector('.dly-s').textContent.replace(/\s/g, ' ')]));
  assert.deepEqual(lv, [['1', 'Zed', `Niv. ${prgLevel(49000).lv}`, '49 000 XP'], ['2', 'Ana toi', `Niv. ${prgLevel(23456).lv}`, '23 456 XP'], ['3', 'Max', `Niv. ${prgLevel(1200).lv}`, '1 200 XP']], 'classement des niveaux : mon XP envoyée, niveau, pseudo');
  await p.$eval('.dly-boards', e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(250); await shot(p, 'daily-9-classement-niveaux');
  assert.equal(await p.$('.dly-bd .dly-row.me .dly-rep'), null, 'pas de « Signaler » sur ma ligne'); assert.equal(await p.$$eval('.dly-bd .dly-rep', b => b.length), 2);
  await p.click('.dly-bd .dly-row:first-child .dly-rep'); await p.waitForSelector('.sheet [data-ok]'); assert.match(await p.$eval('.dly-repn', e => e.textContent), /Zed/);
  await shot(p, 'daily-9b-signaler-pseudo');
  await p.click('.sheet [data-ok]'); await p.waitForFunction(() => /Merci, c'est signalé/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  ok('classements : « Signaler ce pseudo » sur les autres lignes (confirmation, envoyé au serveur), jamais sur la sienne');
  const bd = Object.fromEntries((await p.evaluate(() => dailyBadges())).map(b => [b.id, b.n]));
  assert.deepEqual(['played', 'streak', 'top100', 'first', 'stage1', 'points'].map(k => bd[k]), [1, 1, 0, 0, 1, res.s], 'badges vérifiés par le serveur (top 100 et 1er : comptés à la fin de la journée)');
  await p.click('.dly [data-dly="close"]'); await p.waitForSelector('#btnDaily[data-done="1"]');
  // podium de la barre du haut : les classements seuls ; fiche « Niveau et badges » › « Classement » : les niveaux
  await p.click('#btnRanks'); await p.waitForSelector('.dly.on .dly-boards #dlySeg');
  assert.ok(!(await p.$eval('.dly', e => e.classList.contains('dly-play'))), 'classements : la pub reste permise'); assert.equal(await p.$('.dly-play-cta'), null, 'déjà jouée : pas de « Jouer »');
  await p.click('.dly [data-dly="close"]'); await p.waitForFunction(() => !document.querySelector('.dly'));
  await p.evaluate(() => prgSheet()); await p.waitForSelector('.prg-sheet [data-prg-rank]');
  await p.click('.prg-sheet [data-prg-rank]'); await p.waitForSelector('.dly.on #dlySeg [data-v="level"][aria-checked="true"]');
  await p.waitForSelector('.dly-bd .dly-row.me'); await p.click('.dly [data-dly="close"]'); await p.waitForFunction(() => !document.querySelector('.dly'));
  // second compte, même appareil : partie d'entraînement, non classée
  const mark = bodies.length;
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-ben'));
  await signInFake(p, { uid: 'uid-ben', email: 'uid-ben@test.dev' }); await p.evaluate(() => { PROF.name = 'Ben'; });
  await p.waitForSelector('#btnDaily[data-new="1"]', { timeout: 15000 });
  await join_(p, false);
  assert.match(await p.$eval('.dly-note', e => e.textContent), /Partie d'entraînement, non classée : cet appareil a déjà joué la carte du jour avec un autre compte\./);
  assert.equal(await p.$eval('.dly-sub', e => e.textContent), 'Partie d\'entraînement');
  await shot(p, 'daily-10-entrainement-non-classee');
  await p.click('.dly [data-dly="quit"]'); assert.equal(await p.$eval('.dly-quit', e => e.textContent), 'Touche encore pour abandonner');
  await p.click('.dly [data-dly="quit"]'); await p.waitForSelector('.dly-res[data-win="0"]', { timeout: 8000 });
  assert.ok(await p.$('.dly-res .dly-hidden'), 'perdue : carte cachée');
  assert.match(await p.$eval('.dly-reveal', e => e.textContent), /^Réponse à 18:00, avec la carte suivante\.$/);
  assert.equal(await p.$eval('.dly-place', e => e.textContent), 'Partie d\'entraînement');
  assert.doesNotMatch(await p.$eval('.dly-main', e => e.textContent), /serra|angel/i, 'perdue : jamais la réponse avant la carte suivante');
  for (const b of bodies.slice(mark)) assert.doesNotMatch(b.t, LEAK, 'second compte, réponse du serveur : ' + b.u + ' ' + b.t.slice(0, 200));
  await p.waitForSelector('.dly-bd .dly-rows'); assert.deepEqual(await p.$$eval('.dly-bd .dly-row .dly-n', l => l.map(x => x.textContent)), ['Ana'], 'entraînement : absent du classement');
  assert.ok(await p.$eval('.dly-foot', e => e.hidden), 'résultat : plus de recherche');
  await p.waitForTimeout(250); await shot(p, 'daily-11-perdue-sans-reponse');
  assert.deepEqual(errs, []);
  await ctx.close();
  ok('compte connecté (appli Android simulée) : « Participer ? », décompte, trouvée à l\'étape 1, score au temps, bandeau AdMob caché pendant la partie et revenu au résultat ; classements jour, semaine, saison et niveaux (XP envoyée), podium, lien de « Niveau et badges », dailyBadges() ; second compte sur le même appareil : entraînement non classé, abandon sans la réponse');
}

{ // 3) sans compte : classements visibles, jouer demande de se connecter ; puis un compte récent, en français : la partie entière, chronométrée
  const { p, ctx, errs, bodies, cards } = await page();
  await p.waitForSelector('#btnDaily[data-new="1"]', { timeout: 20000 });
  const pos = await p.evaluate(() => { const b = document.getElementById('btnDaily').getBoundingClientRect(), r = document.getElementById('btnRanks').getBoundingClientRect(), w = document.querySelector('.bar .brand .word').getBoundingClientRect(); return { gap: b.left - w.right, gap2: r.left - b.right, mid: Math.abs((b.top + b.bottom) / 2 - (w.top + w.bottom) / 2), w: b.width, w2: r.width }; });
  assert.ok(pos.gap >= 6 && pos.gap <= 24 && pos.gap2 >= 2 && pos.gap2 <= 12 && pos.mid < 6 && pos.w <= 40 && pos.w2 <= 40, 'deux icônes à côté du mot « Mana Orbit », discrètes : ' + JSON.stringify(pos));
  assert.match(await p.$eval('#btnDaily', b => b.getAttribute('aria-label')), /nouvelle carte à deviner/);
  assert.equal(await p.$eval('#btnRanks', b => b.getAttribute('aria-label')), 'Classements');
  const anim = () => p.evaluate(() => { const b = document.getElementById('btnDaily'), o = b.querySelector('.dly-orb'), d = b.querySelector('.dly-dot'); return [getComputedStyle(b).animationName, getComputedStyle(o).display, getComputedStyle(o.querySelector('i')).animationName, getComputedStyle(d).display, getComputedStyle(d).animationName, b.querySelectorAll('.dly-orb i').length]; });
  assert.deepEqual(await anim(), ['dlyPulse', 'block', 'dlyOrb', 'block', 'dlyBlink', 3], 'pas encore jouée : pulsation, trois points en orbite, voyant qui clignote');
  await p.waitForTimeout(500); await shot(p, 'daily-1-accueil-deux-icones', { x: 0, y: 0, width: 390, height: 110 });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(await anim(), ['none', 'none', 'dlyOrb', 'block', 'none', 3], 'animations réduites : rien ne bouge, voyant fixe');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  // podium avant de jouer : les classements et « Jouer la carte du jour »
  await p.click('#btnRanks'); await p.waitForSelector('.dly.on .dly-play-cta');
  assert.match(await p.$eval('.dly-main', e => e.textContent), /Connecte-toi pour apparaître au classement\./);
  await p.click('.dly-play-cta'); await p.waitForFunction(() => !document.querySelector('.dly'));
  await p.waitForFunction(() => sheets.length && /Connecte-toi pour jouer/.test(sheets[sheets.length - 1].wrap.textContent), null, { timeout: 5000 });
  assert.equal(await p.$('.dly-ask'), null, 'sans compte : pas de « Participer ? »'); await shot(p, 'daily-2a-connexion-obligatoire');
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForTimeout(300);
  await p.click('#btnDaily'); await p.waitForFunction(() => sheets.length && /Connecte-toi pour jouer/.test(sheets[sheets.length - 1].wrap.textContent), null, { timeout: 5000 });
  await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForTimeout(300);
  const st0 = await p.evaluate(async () => { const r = await fetch('api/daily/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return [r.status, (await r.json()).error]; });
  assert.deepEqual(st0, [401, 'auth_required'], 'serveur : compte obligatoire pour jouer');
  await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-leo')); await signInFake(p, { uid: 'uid-leo', email: 'uid-leo@test.dev' }); await p.waitForTimeout(400);
  await join_(p, true, 'Léo');
  assert.equal(await p.evaluate(() => DY.v.acct), true, 'partie du compte');
  assert.equal(await p.$eval('.dly-art img', i => i.naturalWidth), 480, 'étape 1 : gros plan fabriqué par le serveur');
  assert.equal(await p.$('.dly-art[data-zoom]'), null, 'étape 1 : pas de dézoom (rien avant)');
  const k = await p.evaluate(() => DY.v.k);
  assert.match(await p.$eval('.dly-art img', i => i.getAttribute('src')), new RegExp(`^api/daily/img\\?k=${k}&s=1$`));
  assert.equal(await p.$('.dly-type'), null); assert.equal(await p.$('.dly-mask'), null);
  assert.match(await p.$eval('.dly-time', e => e.textContent), /^0:0\d$/); assert.match(await p.$eval('.dly-pts', e => e.textContent), /^≈ (1\s000|9\d\d) points$/);
  assert.match(await p.$eval('.dly-next', e => e.textContent), /Indice suivant\s+dans \d+ s/);
  const locked = await p.evaluate(async k => { const r = await fetch('api/daily/img?k=' + k + '&s=2'); return [r.status, (await r.json()).error]; }, k);
  assert.deepEqual(locked, [403, 'locked'], 'image de l\'étape 2 refusée avant son heure');
  // l'étape 2 arrive toute seule à 12 s, sans toucher à rien
  await stepIs(p, 2, 16000); await imgOk(p, '.dly-art');
  assert.match(await p.$eval('.dly-art img', i => i.getAttribute('src')), /&s=2$/);
  assert.match(await p.$eval('.dly-art', e => e.getAttribute('style') || ''), /--zs:1\.\d+;--zx:[\d.]+%;--zy:[\d.]+%/, 'étape 2 : dézoom depuis le gros plan précédent');
  const c2 = await p.evaluate(() => dlyClock(DY.v)); assert.ok(c2 >= 12e3 && c2 < 16e3, 'horloge du serveur : ' + c2);
  await p.waitForTimeout(1500); await shot(p, 'daily-4-partie-chrono');
  for (let s = 3; s <= 5; s++) await next(p, s);
  await imgOk(p, '.dly-art'); assert.equal(await p.$eval('.dly-art img', i => i.naturalWidth), 480, 'étape 5 : illustration nette');
  assert.equal(await p.$eval('.dly-art img', i => i.getAttribute('alt')), 'Illustration de la carte', 'étape 5 : illustration entière');
  await next(p, 6); await imgOk(p, '.dly-type');
  await next(p, 7); await imgOk(p, '.dly-text');
  const c7 = await p.evaluate(() => dlyClock(DY.v)); assert.ok(c7 >= 6 * 12e3, '« Indice suivant » avance l\'horloge au début de l\'étape : ' + c7);
  await shot(p, 'daily-5-etape7-texte');
  await next(p, 8);
  assert.equal(await p.$eval('.dly-mask', e => [...e.children].map(c => (c.classList.contains('dly-ml') ? '_' : c.classList.contains('dly-sp') ? ' ' : c.textContent)).join('')), dlyMask('Ange de Serra', 8), 'étape 8 : le nom par la fin');
  await p.$eval('.dly-mask', e => e.scrollIntoView({ block: 'center' }));
  await shot(p, 'daily-6-etape8-nom');
  // recherche : « ange » → les noms français qui commencent par « ange », rien d'autre
  await p.fill('.dly-q', 'ange');
  await p.waitForFunction(() => document.querySelectorAll('.dly-sug .dly-o').length >= 3, null, { timeout: 8000 });
  assert.deepEqual(await p.$$eval('.dly-sug .dly-o', l => l.map(b => b.textContent)), ['Ange de Serra', 'Ange gardien', 'Angelot de lumière'], 'français seulement, par le début (ni « Archange de Serra », ni un nom anglais)');
  await shot(p, 'daily-7-recherche-ange');
  const before = await p.evaluate(() => dlyClock(DY.v));
  await p.click('.dly-sug .dly-o >> text=Ange gardien');
  await p.waitForSelector('.dly-wrong li'); assert.match(await p.$eval('.dly-wrong', e => e.textContent), /1 mauvaise proposition.*Ange gardien/s);
  assert.match(await p.$eval('#toast', e => e.textContent), /Non, ce n'est pas Ange gardien : \+10 s/);
  assert.ok((await p.evaluate(() => dlyClock(DY.v))) - before >= 10e3, 'mauvaise proposition : +10 s');
  assert.equal(await p.$eval('.dly-left', e => e.textContent), '5 essais'); assert.equal(await p.$eval('.dly-q', e => e.value), '', 'champ vidé');
  await p.fill('.dly-q', 'ange');
  await p.waitForFunction(() => document.querySelectorAll('.dly-sug .dly-o').length === 2, null, { timeout: 5000 });
  assert.ok(!(await p.$$eval('.dly-sug .dly-o', l => l.map(b => b.textContent))).includes('Ange gardien'), 'proposition déjà faite : retirée de la liste');
  // anti-triche : rien de la carte avant la fin
  assert.ok(bodies.length >= 9, 'réponses lues : ' + bodies.length);
  for (const b of bodies) assert.doesNotMatch(b.t, LEAK, 'réponse avant la fin : ' + b.u + ' ' + b.t.slice(0, 200));
  assert.deepEqual(cards, [], 'aucune image Scryfall chargée avant la fin');
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('img')].filter(i => /scryfall/.test(i.src)).length), 0);
  await p.fill('.dly-q', 'ange de s'); await p.waitForSelector('.dly-sug .dly-o >> text=Ange de Serra'); await p.press('.dly-q', 'Enter');
  await p.waitForSelector('.dly-res', { timeout: 8000 });
  assert.ok(!(await p.$eval('.dly', e => e.classList.contains('dly-play'))), 'fin : plus en jeu (le bandeau peut revenir)');
  assert.equal(await p.$eval('.dly-name', e => e.textContent), 'Ange de Serra'); assert.equal(await p.$eval('.dly-en', e => e.textContent), 'Serra Angel');
  assert.match(await p.$eval('.dly-verdict', e => e.textContent), /Trouvée à l'étape 8/);
  const res = await p.evaluate(() => DY.v.res);
  assert.ok(res.ms >= 7 * 12e3 + 10e3, 'temps : 7 étapes passées et la pénalité : ' + res.ms); assert.equal(res.s, dlyScore(res.ms));
  assert.equal(Number((await p.$eval('.dly-score b', e => e.textContent)).replace(/\D/g, '')), res.s);
  assert.match(await p.$eval('.dly-place', e => e.textContent), /Place 2 sur 2/, 'compte : classé (Ana devant)');
  assert.equal(await p.$eval('.dly-card img', i => i.getAttribute('src')), 'https://cards.scryfall.io/large/front/x/tst-17-fr.jpg', 'la carte entière, dans la langue, à la fin seulement');
  await p.waitForSelector('.dly-bd .dly-rows'); assert.match(await p.$eval('.dly-bd .dly-row.me', e => e.textContent), /Léo/, 'pseudo choisi avant de jouer, au classement');
  assert.deepEqual(await p.evaluate(() => [document.querySelector('.dly-foot').hidden, document.getElementById('toast').classList.contains('on')]), [true, false], 'résultat : plus de recherche ni de « Non, ce n\'est pas … »');
  await p.waitForTimeout(300); await shot(p, 'daily-8-resultat');
  await p.click('.dly [data-dly="share"]'); await p.waitForFunction(() => window.__shared.length === 1);
  const txt = await p.evaluate(() => window.__shared[0]);
  assert.match(txt, /^Carte mystère n° \d+ · Mana Orbit\n🟨🟨🟨🟨🟨🟨🟨🟩⬜⬜ ❌\n\d+ points, trouvée en \d:\d\d\nPlace 2 sur 2\nhttp:\/\/127\.0\.0\.1:19710\/\?mystere$/, 'résultat façon Wordle : ' + txt);
  assert.doesNotMatch(txt, /serra|ange de|angel/i, 'jamais la réponse');
  await p.click('.dly [data-dly="close"]'); await p.waitForFunction(() => !document.querySelector('.dly'));
  assert.equal(await p.$eval('#btnDaily', b => b.dataset.new + b.dataset.done), '01', 'jouée : plus de voyant');
  assert.deepEqual(await p.evaluate(() => { const b = document.getElementById('btnDaily'); return [getComputedStyle(b).animationName, getComputedStyle(b.querySelector('.dly-orb')).display, getComputedStyle(b.querySelector('.dly-done')).display]; }), ['none', 'none', 'grid'], 'jouée : calme, petite coche');
  assert.match(await p.$eval('#btnDaily', b => b.getAttribute('aria-label')), /classements/);
  await p.waitForTimeout(300); await shot(p, 'daily-12-accueil-jouee', { x: 0, y: 0, width: 390, height: 110 });
  await p.reload(); await p.evaluate(tok => { window.__idTok = tok; }, F.jwt('uid-leo')); await signInFake(p, { uid: 'uid-leo', email: 'uid-leo@test.dev' });
  await p.waitForSelector('#btnDaily[data-done="1"]', { timeout: 15000 });
  await p.click('#btnDaily'); await p.waitForSelector('.dly-res'); assert.ok(await p.$('.dly-boards #dlySeg'), 'une fois jouée : le résultat et les classements, sans « Participer ? »');
  assert.equal(await p.$('.dly-ask'), null);
  assert.deepEqual(errs, []);
  await ctx.close();
  ok('sans compte : deux icônes à côté du logo (orbites, pulsation ; fixe si animations réduites), « Participer ? », décompte, chrono, étape 2 toute seule à 12 s (image refusée avant), étapes jusqu\'au nom par la fin, recherche « ange » en français seulement, +10 s par erreur, score au temps, carte entière à la fin, partage sans la réponse, coche ; rien de la carte avant la fin');
}

await browser.close(); done();
console.log('daily-e2e : tout est passé');
process.exit(0);
