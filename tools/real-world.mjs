// Banc « vrai monde » pour regarder l'interface : vrai proxy, vraie base du coach (DKW_FILE), vrai Scryfall lu par Node (page.route) avec cache disque,
// vraies images de cartes. Sert aux captures avant / après (tools/ui-shots.mjs) et à reproduire les bugs d'affichage (images tardives, rôles du coach).
// Variables : RW_PORT (19977), RW_GAP (ms entre deux requêtes Scryfall, 110), RW_CACHE (dossier du cache Scryfall, défaut tests/.tmp/scry-cache), DKW_FILE (dkw.json.gz du dépôt deck-corpus), RW_IMG_DELAY (ms : images retardées au hasard jusqu'à cette valeur).
import '../tests/setup-env.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { routeFonts } from '../tests/fonts.mjs';
export const { chromium } = createRequire(new URL('../tests/', import.meta.url).pathname + 'x.js')('playwright-core');

const CACHE = process.env.RW_CACHE || 'tests/.tmp/scry-cache'; mkdirSync(CACHE, { recursive: true });
let last = 0;
const GAP = Number(process.env.RW_GAP || 110);
const gap = async () => { const w = last + GAP - Date.now(); last = Math.max(Date.now(), last + GAP); if (w > 0) await new Promise(r => setTimeout(r, w)); };      // Scryfall : 10 requêtes / s au plus
/** Requête Scryfall faite par Node (le navigateur du conteneur ne la joint pas), gardée sur disque. */
async function scry(url, method, body, bin) {
  const h = createHash('sha1').update(method + ' ' + url + ' ' + (body || '')).digest('hex'), f = `${CACHE}/${h}`;
  if (existsSync(f)) { const m = JSON.parse(readFileSync(f + '.m', 'utf8')); return { ...m, body: readFileSync(f) }; }
  await gap();
  let r; try { r = await fetch(url, { method, body: body || undefined, headers: { 'content-type': 'application/json', 'user-agent': 'ManaOrbitTests/1.0', accept: bin ? '*/*' : 'application/json' } }); } catch (e) { return { status: 502, ct: 'text/plain', body: Buffer.from('') }; }
  const buf = Buffer.from(await r.arrayBuffer()), m = { status: r.status, ct: r.headers.get('content-type') || '' };
  if (r.status === 200 || r.status === 404) { writeFileSync(f, buf); writeFileSync(f + '.m', JSON.stringify(m)); }
  return { ...m, body: buf };
}

export async function startWorld({ port = Number(process.env.RW_PORT || 19977), env = {} } = {}) {
  const proxy = spawn('node', ['server/proxy.mjs'], { env: { ...process.env, EDH_SOURCE_URL: '', DKW_SOURCE_URL: '', PORT: String(port), APK_LATEST: '0', ...env }, stdio: process.env.RW_LOG ? 'inherit' : 'ignore' });
  process.on('exit', () => { try { proxy.kill(); } catch {} });
  await new Promise(r => setTimeout(r, 1200));
  return { url: `http://127.0.0.1:${port}/`, stop: () => { try { proxy.kill(); } catch {} } };
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
/** Page de téléphone : { width, height, scale (taille du texte : 1, 1.3), dark, init (script avant la page), lang }. */
/** Police système agrandie (WebView Android) : chaque font-size / line-height absolu × FS, comme tests/overflow-audit.mjs. */
const scaleFn = () => {
  const FS = window.__FS; if (!(FS > 1)) return;
  const done = new WeakSet(), abs = /(\d(px|rem|vw|vh|vmin|vmax|cq[a-z]*))\b/;
  const fix = rules => { for (const r of rules) {
    if (r.style) for (const p of ['font-size', 'line-height']) { const v = r.style.getPropertyValue(p).trim(); if (!v || !abs.test(v) || /^(inherit|initial|unset|normal)$/.test(v)) continue; r.style.setProperty(p, `calc(${v} * ${FS})`, r.style.getPropertyPriority(p)); }
    if (r.cssRules) fix(r.cssRules);
  } };
  const run = () => { for (const s of document.styleSheets) { if (done.has(s)) continue; try { fix(s.cssRules); done.add(s); } catch (e) { done.add(s); } } };
  document.addEventListener('DOMContentLoaded', run);
  new MutationObserver(m => { if (m.some(x => [...x.addedNodes].some(n => n.nodeName === 'STYLE' || n.nodeName === 'LINK'))) run(); }).observe(document, { childList: true, subtree: true });
};
export async function newPage(browser, world, { width = 375, height = 667, dark = false, init = '', lang = '', fs = 1, imgDelay = Number(process.env.RW_IMG_DELAY || 0) } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: dark ? 'dark' : 'light', locale: lang || 'fr-FR' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.route('https://api.scryfall.com/**', async route => {
    const rq = route.request(); if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const r = await scry(rq.url(), rq.method(), rq.postData(), false);
    return route.fulfill({ status: r.status, headers: CORS, contentType: r.ct, body: r.body });
  });
  await p.route(/https:\/\/(cards|svgs)\.scryfall\.io\//, async route => {
    const r = await scry(route.request().url(), 'GET', '', true);
    if (imgDelay) await new Promise(res => setTimeout(res, Math.random() * imgDelay));
    return route.fulfill({ status: r.status, headers: CORS, contentType: r.ct, body: r.body });
  });
  await routeFonts(p);
  await p.addInitScript(`window.__FS = ${fs}; (${scaleFn.toString()})(); try { ${lang ? `localStorage.setItem('deckdeal:lang', ${JSON.stringify(lang)});` : ''} } catch (e) {}`);
  if (init) await p.addInitScript(init);
  await p.goto(world.url); await p.waitForTimeout(800);
  return { ctx, p, errs };
}

/** Deck Commander réel de 100 cartes (Edgar Markov, vampires Mardu). */
export const EDGAR = `Commander
1 Edgar Markov

Deck
1 Sol Ring
1 Arcane Signet
1 Boros Signet
1 Orzhov Signet
1 Rakdos Signet
1 Talisman of Conviction
1 Talisman of Hierarchy
1 Talisman of Indulgence
1 Fellwar Stone
1 Mind Stone
1 Swords to Plowshares
1 Path to Exile
1 Vindicate
1 Anguished Unmaking
1 Mortify
1 Terminate
1 Despark
1 Wrath of God
1 Blasphemous Act
1 Vault of the Archangel
1 Night's Whisper
1 Phyrexian Arena
1 Sign in Blood
1 Read the Bones
1 Skullclamp
1 Bloodline Keeper
1 Sorin, Lord of Innistrad
1 Sorin, Vengeful Bloodlord
1 Elenda, the Dusk Rose
1 Captivating Vampire
1 Stromkirk Captain
1 Legion Lieutenant
1 Vampire Nocturnus
1 Bloodlord of Vaasgoth
1 Cordial Vampire
1 Indulgent Aristocrat
1 Vampire of the Dire Moon
1 Bloodghast
1 Kalastria Highborn
1 Vito, Thorn of the Dusk Rose
1 Sanctum Seeker
1 Champion of Dusk
1 Twilight Prophet
1 Butcher of Malakir
1 Drana, Liberator of Malakir
1 Olivia Voldaren
1 Stromkirk Noble
1 Falkenrath Noble
1 Necropolis Regent
1 New Blood
1 Exquisite Blood
1 Sanguine Bond
1 Heirloom Blade
1 Door of Destinies
1 Shared Animosity
1 Cathars' Crusade
1 Return to Dust
1 Feed the Swarm
1 Lightning Greaves
1 Swiftfoot Boots
1 Teferi's Protection
1 Boros Charm
1 Dark Ritual
1 Demonic Tutor
1 Command Tower
1 Exotic Orchard
1 Path of Ancestry
1 Unclaimed Territory
1 Cavern of Souls
1 Sacred Foundry
1 Godless Shrine
1 Blood Crypt
1 Clifftop Retreat
1 Isolated Chapel
1 Dragonskull Summit
1 Battlefield Forge
1 Caves of Koilos
1 Sulfurous Springs
1 Nomad Outpost
1 Savai Triome
1 Smoldering Marsh
1 Scoured Barrens
1 Temple of Triumph
1 Temple of Silence
1 Temple of Malice
5 Plains
5 Swamp
4 Mountain
`;
/** Graine localStorage : un deck enregistré (Mes decks), une petite collection, la vue du viewer. */
export const seedDecks = (decks, extra = {}) => `try { if (!localStorage.getItem('rw:seeded')) { localStorage.setItem('rw:seeded', '1'); localStorage.setItem('deckdeal:decks:v1', ${JSON.stringify(JSON.stringify(decks.map((d, i) => ({ id: d.id || 'rw' + i, name: d.name, text: d.text, opts: {}, cards: [], history: [], createdAt: Date.now() - 1e6, updatedAt: Date.now() - i * 1000 }))))});
  ${Object.entries(extra).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} } } catch (e) {}`;
