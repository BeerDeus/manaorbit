// Banc d'essai du coach : le coach de l'appli (src/deckwiz.js, chargé tel quel dans une vm) face à de vrais decks qu'il n'a jamais vus.
// Decks du banc : 5 % du corpus Archidekt (heldOut, gen-deckdb.mjs), jamais utilisés pour apprendre (cibles, cartes du corpus, paires).
// Pour chaque deck : 10 sorts retirés au hasard (graine fixe), puis les 40 premières suggestions du coach (« plan de jeu ») sur les 89 cartes restantes ;
// rappel@k = part des cartes retirées retrouvées dans les k premières suggestions. Réglage automatique : les poids de dwVal (inclusion, synergie,
// decks Archidekt, popularité) et des paires sont ajustés un par un sur une moitié des decks (descente par coordonnées), gardés seulement s'ils
// font mieux sur l'autre moitié (pas de sur-apprentissage). Résultat dans dkw.json.gz (w, bench), relu par l'appli.
// Usage : node bench-coach.mjs <dossier contenant dkw.json.gz et corpus.json.gz> (sinon appelé par gen-deckdb.mjs après les agrégats).
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normKey } from './gen-edhrec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const W0 = { incl: 1, syn: 0.8, th: 0.9, g: 0.4, cx: 0.5, rank: 0.5, pair: 0.04 };
const BASICS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow covered plains', 'snow covered island', 'snow covered swamp', 'snow covered mountain', 'snow covered forest']);

/** Le coach de l'appli dans une vm : seules les fonctions de calcul servent (aucun affichage). */
export function coachVm(src = ['brackets.js', 'deckwiz.js', 'deckmech.js'].map(f => readFileSync(join(here, 'src', f), 'utf8')).join('\n;\n')) {
  const ctx = { console, Map, Set, Math, Number, String, Object, Array, JSON, Date, Infinity, isFinite, Promise, setTimeout,
    DAY: 864e5, BASIC_NAMES: BASICS, ownKey: normKey, dmOf: () => null, collQty: () => 0, ownFree: () => 0, mkUs: () => false, PXT: null, T: s => s, TN: (n, a) => a,
    BD: { main: new Map(), cmdr: [] }, labOn: () => false, localStorage: null };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.DW = DW; this.dwSuggest = dwSuggest; this.dwProfile = dwProfile; this.dwTargets = dwTargets; this.dwIndex = dwIndex; this.dwInfo = dwInfo;', ctx);
  return ctx;
}
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Cas du banc : decks mis de côté dont le commandant a sa page dans la base. held : [{ cmdNames, cards: [[nom, qté]] }]. */
export function benchCases(ctx, D, held, { max = 1200, hide = 10, seed = 2026 } = {}) {
  const r = rng(seed), bySlugName = new Map(Object.keys(D.cmd).map(s => [s, s])), cases = [];
  const slugOf = names => { for (const l of [names, [...names].reverse()]) { const s = l.map(n => normKey(n).replace(/ /g, '-')).join('-'); if (bySlugName.has(s)) return s; } return null; };      // duos : dans un sens ou dans l'autre
  for (const d of held) {
    if (cases.length >= max) break;
    const slug = slugOf(d.cmdNames), pack = slug && D.cmd[slug]; if (!pack) continue;
    const ckeys = d.cmdNames.map(normKey), ci = new Set(); for (const k of ckeys) for (const c of String((ctx.DW.byKey.get(k) || [])[1] || '')) ci.add(c);
    const main = new Map(); for (const [n, q] of d.cards) { const k = normKey(n); if (!k || ckeys.includes(k)) continue; const cur = main.get(k); if (cur) cur.qty += q; else main.set(k, { key: k, name: n, qty: q }); }
    const spells = [...main.values()].filter(c => { const row = ctx.DW.byKey.get(c.key); return row && !(row[4] & 1) && !BASICS.has(c.key) && c.qty === 1 && [...String(row[1])].every(x => ci.has(x)); });
    if (spells.length < 30) continue;
    for (let i = spells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [spells[i], spells[j]] = [spells[j], spells[i]]; }
    const hidden = spells.slice(0, hide).map(c => c.key); for (const k of hidden) main.delete(k);
    const cmd = { slug, names: d.cmdNames, keys: ckeys, ci: 'WUBRG'.split('').filter(c => ci.has(c)).join('') };
    const X = { main, cmdr: d.cmdNames.map((n, i) => ({ key: ckeys[i], name: n })), wiz: { th: [], br: d.br || 3, bud: 0, own: false } };
    cases.push({ X, cmd, pack, hidden });
  }
  for (const c of cases) { c.prof = ctx.dwProfile(c.X); c.tgt = ctx.dwTargets(c.prof, c.cmd, c.pack, c.X.wiz); c.X.info = ctx.dwInfo(c.pack, c.X.wiz, c.cmd); }
  return cases;
}
/** Rappel@10, @20, @40 (en %) avec les poids w. */
export function benchEval(ctx, D, cases, w) {
  D.w = w; let h10 = 0, h20 = 0, h40 = 0, tot = 0;
  for (const c of cases) {
    const got = ctx.dwSuggest('', c.cmd, c.pack, c.prof, c.tgt, 40, c.X).map(s => s.k), hid = new Set(c.hidden);
    got.forEach((k, i) => { if (hid.has(k)) { if (i < 10) h10++; if (i < 20) h20++; h40++; } }); tot += c.hidden.length;
  }
  const p = x => tot ? Math.round(x / tot * 1000) / 10 : 0;
  return { r10: p(h10), r20: p(h20), r40: p(h40), n: cases.length };
}
/** Banc complet et réglage : { w (poids gardés), bench: { at, n, base, tuned, kept, w } }. */
export function benchCoach(D, held, opts = {}) {
  const ctx = coachVm(opts.src); ctx.DW.core = D; ctx.DW.byKey = ctx.dwIndex(D);
  const cases = benchCases(ctx, D, held, opts); if (cases.length < 40) return null;
  const train = cases.filter((c, i) => i % 2 === 0), val = cases.filter((c, i) => i % 2 === 1);
  let w = { ...W0 }, best = benchEval(ctx, D, train, w).r20;
  const keys = ['incl', 'syn', 'cx', 'rank', 'pair'];      // th, g : sans thème choisi sur les decks du banc, sans effet
  const t0 = Date.now(), ms = opts.ms || 180000;      // réglage borné dans le temps (passage de nuit : 3 min au plus)
  for (let round = 0; round < 2; round++) for (const k of keys) {
    if (k === 'incl') continue;      // l'inclusion reste l'étalon (1) : les autres poids s'expriment par rapport à elle
    for (const m of [0.25, 0.5, 0.75, 1.5, 2, 3]) {
      if (Date.now() - t0 > ms) break;
      const v = Math.round(Math.max(W0[k] * 0.25, Math.min(W0[k] * 4, w[k] * m)) * 1000) / 1000, w2 = { ...w, [k]: v }, r = benchEval(ctx, D, train, w2).r20;      // entre le quart et 4 fois le poids d'origine : la synergie ne disparaît jamais (sinon le coach copierait les decks moyens)
      if (r > best + 0.2) { best = r; w = w2; }
    }
  }
  const base = benchEval(ctx, D, val, W0), tuned = benchEval(ctx, D, val, w), kept = tuned.r20 >= base.r20 + 0.3;
  const all0 = benchEval(ctx, D, cases, W0), all1 = kept ? benchEval(ctx, D, cases, w) : all0;
  D.w = kept ? w : undefined;
  return { w: kept ? w : null, bench: { at: new Date().toISOString().slice(0, 10), n: cases.length, hide: opts.hide || 10, base: all0, tuned: all1, kept, w: kept ? w : W0 } };
}
/** Decks du banc depuis le corpus : [{ cmdNames, cards, br }]. */
export function heldFromCorpus(C, isHeld) {
  const out = [];
  for (const d of Object.values(C.decks)) if (!d.skip && d.c && isHeld(d)) out.push({ cmdNames: d.cmd.map(i => C.names[i]), cards: d.c.map(([i, q]) => [C.names[i], q]), br: d.br || 3 });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dir = process.argv[2] || join(here, 'deckdb-out');
  const { corpusLoad, heldOut } = await import('./gen-deckdb.mjs');
  const D = JSON.parse(gunzipSync(readFileSync(join(dir, 'dkw.json.gz'))).toString('utf8')), C = corpusLoad(join(dir, 'corpus.json.gz'));
  const t = Date.now(), r = benchCoach(D, heldFromCorpus(C, heldOut));
  if (!r) { console.log('Banc : pas assez de decks mis de côté'); process.exit(0); }
  const b = r.bench; console.log(`Banc : ${b.n} decks, ${b.hide} sorts retirés chacun · rappel@10/20/40 : ${b.base.r10} / ${b.base.r20} / ${b.base.r40} %` + (b.kept ? ` → réglé ${b.tuned.r10} / ${b.tuned.r20} / ${b.tuned.r40} % (poids ${JSON.stringify(r.w)})` : ' (poids d\'origine gardés)') + ` · ${Math.round((Date.now() - t) / 1000)} s`);
  if (process.argv.includes('--write')) { D.bench = b; if (r.w) D.w = r.w; writeFileSync(join(dir, 'dkw.json.gz'), gzipSync(Buffer.from(JSON.stringify(D)), { level: 9 })); }
}
