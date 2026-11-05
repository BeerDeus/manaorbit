// Mesure du coach (construction des decks) : le vrai code de l'appli (src/deckwiz.js, deckmech.js, deckopt.js, decksim.js) chargé dans une vm Node,
// sans interface, face à la vraie base (dkw.json.gz de la branche deck-corpus, ou régénérée en local). Pour chaque commandant de test : les versions
// (équilibrée, agressive, contrôle, moins chère) construites comme dans l'appli (dsBuild : construction, amélioration, essais en partie), deux tirages
// (graines différentes) ; puis les mesures : recouvrement des sorts entre tirages et entre versions, part des sorts qui servent le thème demandé,
// popularité des cartes (rang EDHREC), note du coach, simulation (mains gardées, commandant à temps, couleurs ; face à la table depuis le 5 novembre :
// adversaires éliminés, moteur qui tient), part de protection, retraits, balayages et récursion, contrôles (100 cartes, couleurs, doublons, interdites,
// bracket, budget, terrains, condition de victoire, sources de couleur).
//   node tools/coach-eval.mjs --dkw <dkw.json.gz> [--src <dossier contenant deckwiz.js…>] [--out mesures.json] [--only <n,n>] [--seeds 2] [--jobs 4]
// Le thème est mesuré avec le classement data/card-mech.json (indépendant du code mesuré : la même règle avant et après).
import vm from 'node:vm';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { normKey } from '../gen-edhrec.mjs';
import { readMech } from './card-mech-merge.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const BASICS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow covered plains', 'snow covered island', 'snow covered swamp', 'snow covered mountain', 'snow covered forest', 'snow covered wastes']);

/** Commandants de test : variés (tribal, group hug, pet cards, sans page EDHREC, incolore, duo cEDH, petits budgets). th : thèmes EDHREC ; mech, tribe, pets, ban, avoid, orig : réglages de personnalisation. */
export const CASES = [
  { id: 'edgar', cmd: ['Edgar Markov'], br: 3, th: ['vampires'], want: { tribe: 'Vampire' } },
  { id: 'lathril', cmd: ['Lathril, Blade of the Elves'], br: 2, bud: 10000, tribe: 'Elf', want: { tribe: 'Elf' } },
  { id: 'urdragon', cmd: ['The Ur-Dragon'], br: 4, want: { tribe: 'Dragon' } },
  { id: 'phelddagrif', cmd: ['Phelddagrif'], br: 2, mech: ['group-hug'], want: { tags: ['group-hug', 'politics'] } },
  { id: 'kynaios', cmd: ['Kynaios and Tiro of Meletis'], br: 2, th: ['group-hug'], want: { tags: ['group-hug', 'politics'] } },
  { id: 'atraxa', cmd: ["Atraxa, Praetors' Voice"], br: 4, th: ['planeswalkers'], want: { tags: ['superfriends', 'proliferate'] } },
  { id: 'krenko-pets', cmd: ['Krenko, Mob Boss'], br: 3, pets: ['Mogg Fanatic', 'Goblin King', 'Boggart Shenanigans', 'Siege-Gang Commander', 'Squee, Goblin Nabob', 'Beetleback Chief', 'Goblin Goon', 'Mogg War Marshal'], want: { tribe: 'Goblin' } },
  { id: 'teysa', cmd: ['Teysa Karlov'], br: 3, th: ['aristocrats'], want: { tags: ['sacrifice', 'sacrifice-outlet', 'dies-trigger', 'drain'] } },
  { id: 'korvold', cmd: ['Korvold, Fae-Cursed King'], br: 4 },
  { id: 'muldrotha', cmd: ['Muldrotha, the Gravetide'], br: 3, mech: ['self-mill'], want: { tags: ['self-mill', 'graveyard-cast', 'reanimation', 'recursion'] } },
  { id: 'yuriko', cmd: ["Yuriko, the Tiger's Shadow"], br: 4, want: { tags: ['ninjutsu', 'evasion'] } },
  { id: 'talrand', cmd: ['Talrand, Sky Summoner'], br: 2, bud: 5000, want: { tags: ['spells', 'cast-trigger', 'copy'] } },
  { id: 'windgrace', cmd: ['Lord Windgrace'], br: 3, th: ['landfall'], want: { tags: ['landfall', 'extra-lands', 'lands-graveyard'] } },
  { id: 'brago', cmd: ['Brago, King Eternal'], br: 3, th: ['blink'], want: { tags: ['blink', 'etb'] } },
  { id: 'sram', cmd: ['Sram, Senior Edificer'], br: 2, bud: 5000, want: { tags: ['equipment', 'auras', 'voltron'] } },
  { id: 'kenrith', cmd: ['Kenrith, the Returned King'], br: 3, bud: 15000 },
  { id: 'kaalia', cmd: ['Kaalia of the Vast'], br: 3, th: ['aggro'], want: { tags: ['attack', 'combat-damage', 'haste', 'evasion'] } },
  { id: 'zur', cmd: ['Zur the Enchanter'], br: 4 },
  { id: 'ghave', cmd: ['Ghave, Guru of Spores'], br: 3, mech: ['counters-p1', 'tokens-creature'], want: { tags: ['counters-p1', 'tokens-creature', 'proliferate', 'sacrifice-outlet'] } },
  { id: 'sythis', cmd: ["Sythis, Harvest's Hand"], br: 2, th: ['enchantress'], want: { tags: ['enchantments'] } },
  { id: 'kozilek', cmd: ['Kozilek, the Great Distortion'], br: 3 },
  { id: 'ayula', cmd: ['Ayula, Queen Among Bears'], br: 2, tribe: 'Bear', want: { tribe: 'Bear' } },
  { id: 'isshin', cmd: ['Isshin, Two Heavens as One'], br: 3, want: { tags: ['attack', 'trigger-doubling', 'combat-damage'] } },
  { id: 'prosper', cmd: ['Prosper, Tome-Bound'], br: 3, bud: 10000, want: { tags: ['impulse', 'treasure', 'cast-others'] } },
  { id: 'gorm', cmd: ['Gorm the Great'], br: 2, mech: ['politics'], want: { tags: ['politics', 'group-hug'] } },
  { id: 'squee', cmd: ['Squee, the Immortal'], br: 2 },
  { id: 'kangee', cmd: ['Kangee, Aerie Keeper'], br: 2, tribe: 'Bird', want: { tribe: 'Bird' } },
  { id: 'thrasios-tymna', cmd: ['Thrasios, Triton Hero', 'Tymna the Weaver'], br: 5 },
  { id: 'zedruu', cmd: ['Zedruu the Greathearted'], br: 2, th: ['donate'], want: { tags: ['politics', 'group-hug', 'steal'] } },
  { id: 'galea', cmd: ['Galea, Kindler of Hope'], br: 3, mech: ['equipment'], want: { tags: ['equipment', 'auras', 'voltron'] } },
  { id: 'sekkuar', cmd: ["Sek'Kuar, Deathkeeper"], br: 2, bud: 2500, want: { tags: ['sacrifice', 'dies-trigger', 'sacrifice-outlet'] } },
  { id: 'gishath', cmd: ["Gishath, Sun's Avatar"], br: 3, orig: 80, want: { tribe: 'Dinosaur' } },
];

/** Le coach dans une vm : globals de l'appli remplacés par des doublures (ni écran, ni collection, ni fiches). */
export function coachCtx(srcDir, D) {
  const ctx = { console, Map, Set, Math, Number, String, Object, Array, JSON, Date, Infinity, isFinite, Promise, setTimeout, Float64Array, Uint8Array, Int32Array,
    DAY: 864e5, BASIC_NAMES: BASICS, ownKey: normKey, dmOf: () => null, collQty: () => 0, mkUs: () => false, PXT: null, T: (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m), TN: (n, a, b, v) => (n > 1 ? b : a).replace(/\{(\w+)\}/g, (m, k) => k === 'n' ? n : v && v[k] != null ? v[k] : m),
    LOC: () => 'fr-FR', fmt: (c) => (c / 100).toFixed(2) + ' €', mkCur: () => 'EUR', nf0: n => String(Math.round(n)), esc: s => String(s), haptic: () => {}, toast: () => {}, bdPaint: () => {}, bdMetaSoon: () => {}, bdList: () => {},
    BD: { main: new Map(), cmdr: [], el: {} }, labOn: () => false, localStorage: null, sheets: [], EDH: undefined };
  vm.createContext(ctx);
  const files = ['deckwiz.js', 'deckmech.js', 'deckopt.js', 'decksim.js'].filter(f => existsSync(join(srcDir, f)));
  vm.runInContext(files.map(f => readFileSync(join(srcDir, f), 'utf8')).join('\n;\n') + '\n;this.DW = DW; this.BD = BD;', ctx, { filename: 'coach.js' });
  ctx.DW.core = D; ctx.DW.byKey = ctx.dwIndex(D);
  for (const [s, p] of Object.entries(D.themes || {})) ctx.DW.th.set(s, { slug: s, ...p });
  return ctx;
}
/** Résultats de simulation gardés dans la mesure : tous les chiffres (anciens et nouveaux, selon le code mesuré). */
const simPick = r => r ? Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== 'n' && (typeof v === 'number' || v === null))) : null;
/** Réglages d'une version (style) pour un cas : ceux de buildCase, plus le style de la version (plan du deck : decksim.js › dsimDeck). */
const wizOf = (cs, vid) => ({ th: cs.th || [], br: cs.br || 3, bud: cs.bud || 0, own: false, mech: cs.mech || [], tribe: cs.tribe || '', pets: cs.pets || [], ban: cs.ban || [], avoid: cs.avoid || [], ...(vid === 'agg' ? { arch: 'aggro', style: 'aggro' } : vid === 'ctl' ? { arch: 'control', style: 'control' } : vid === 'eco' ? { style: 'eco' } : {}) });
const slugOf = (D, names) => { for (const l of [names, [...names].reverse()]) { const s = l.map(n => normKey(n).replace(/ /g, '-')).join('-'); if (D.cmd[s]) return s; } return names.map(n => normKey(n).replace(/ /g, '-')).join('-'); };

/** Construit les versions d'un cas avec une graine : [{ id, keys (sorts), main, sc, sim, prof, tgt }]. */
async function buildCase(ctx, D, cs, seed) {
  const slug = slugOf(D, cs.cmd), pack = D.cmd[slug] ? { slug, ...D.cmd[slug] } : null;
  ctx.DW.cmd.clear(); ctx.DW.cmd.set(slug, pack);
  const ckeys = cs.cmd.map(normKey), BD = ctx.BD;
  BD.cmdr = cs.cmd.map((n, i) => ({ key: ckeys[i], name: n })); BD.main = new Map(); BD.el = {}; BD.id = '';
  const wiz = { th: cs.th || [], br: cs.br || 3, bud: cs.bud || 0, own: false, mech: cs.mech || [], tribe: cs.tribe || '', pets: cs.pets || [], ban: cs.ban || [], avoid: cs.avoid || [], orig: cs.orig == null ? undefined : cs.orig, seed };
  if (wiz.orig === undefined) delete wiz.orig;
  BD.wiz = wiz;
  const cmd = ctx.dwCmdOf(BD); if (!cmd) return null;
  let res;
  if (typeof ctx.dsMake === 'function') res = await ctx.dsMake({ seed, empty: true });
  else {      // code d'avant (sans dsMake) : la boucle de dsBuild, telle quelle
    res = []; const base = new Map(), mine = new Set(), wiz0 = { ...wiz };
    for (const v of ctx.DS_VARIANTS_ALL || vm.runInContext('DS_VARIANTS', ctx)) {
      let bud = wiz0.bud;
      if (v.eco) { const eqv = res[0] ? res[0].prof.cents : 0, cc = res[0] ? res[0].prof.cmdCents || 0 : 0; bud = Math.round((wiz0.bud > 0 ? Math.min(wiz0.bud, eqv) : eqv) * v.eco); if (!(eqv > 3000) || cc >= bud * 0.5) continue; }
      BD.main = new Map(base); BD.wiz = { ...wiz0, bud, ...(v.arch ? { arch: v.arch } : {}) };
      ctx.dwAutoBuild(undefined, true);
      await ctx.dsOptimize(mine, 900);
      const tune = await ctx.dsSimTune(mine);
      res.push({ v, main: new Map([...BD.main].map(([k, c]) => [k, { ...c }])), wiz: { ...BD.wiz }, sc: ctx.dsScore(BD), prof: ctx.dwProfile(), sim: tune.r });
    }
  }
  const out = [];
  for (const r of res) {
    BD.main = r.main; BD.wiz = r.wiz;
    const prof = ctx.dwProfile(), tgt = ctx.dwTargets(prof, cmd, pack, r.wiz), sim = r.sim || await ctx.dsimRun(BD, 1500);
    out.push({ id: r.v.id, main: [...r.main.values()].map(c => [c.key, c.qty]), sc: r.sc.total, parts: r.sc.parts.map(p => Math.round(p.pts * 10) / 10), sim: simPick(sim),
      prof: { n: prof.n, land: prof.land, mv: Math.round(prof.mv * 100) / 100, cents: prof.cents, gc: prof.gc.length, mld: prof.mld.length, xt: prof.xt.length, combos: prof.combos.length, wincon: prof.wincon, src: prof.src, need: prof.need }, tgt: { land: tgt.land, wincon: tgt.wincon },
      story: (() => { const st = typeof ctx.dwDeckStory === 'function' ? ctx.dwDeckStory(BD) : null; if (st) delete st.plan; return st && JSON.parse(JSON.stringify(st)); })() });
  }
  return { cmd: { ci: cmd.ci, slug, pack: !!pack }, vers: out };
}

/* ── Mesures ─────────────────────────────────────────────────────────────────────────────────────── */
const spellsOf = (D, by, main) => main.filter(([k]) => !BASICS.has(k) && !((by.get(k) || [])[4] & 1) && !/\bLand\b/.test('')).map(([k]) => k).filter(k => { const r = by.get(k); return r && !(r[3] & 1); });
const overlap = (a, b) => { const A = new Set(a), n = b.filter(k => A.has(k)).length; return a.length + b.length ? 2 * n / (a.length + b.length) : 0; };
function themeTags(cs) { return cs.want || null; }
/** Part des sorts qui servent le thème demandé (classement card-mech, types de créature). */
function themeShare(spells, want, mech, scry) {
  if (!want) return null;
  let ok = 0;
  for (const k of spells) {
    const m = mech.get(k), s = scry.get(k) || {};
    const sub = String(s.type || ''), f0 = sub.split(' // ')[0], tags = m ? [...m.provides, ...m.wants, ...m.roles] : [];
    for (const [t, re] of [['spells', /\b(Instant|Sorcery)\b/], ['equipment', /\bEquipment\b/], ['auras', /\bAura\b/], ['enchantments', /\bEnchantment\b/], ['superfriends', /\bPlaneswalker\b/], ['artifacts', /\bArtifact\b/]]) if (re.test(f0)) tags.push(t);      // ce que fournit la ligne de type
    const hit = (want.tags || []).some(t => tags.includes(t)) || (want.tribe && (new RegExp('\\b' + want.tribe + '\\b').test(sub) || /Changeling/.test(s.text || '') || (m && m.tribes.includes(want.tribe))));
    if (hit) ok++;
  }
  return spells.length ? ok / spells.length : 0;
}
function checks(D, by, cs, cmd, v) {
  const bad = [], ci = new Set([...cmd.ci]), b = cs.br || 3;
  if (v.prof.n !== 100) bad.push('n=' + v.prof.n);
  for (const [k, q] of v.main) { const r = by.get(k); if (!r) continue; if ([...String(r[1])].some(c => !ci.has(c))) bad.push('couleur:' + k); if (q > 1 && !BASICS.has(k)) bad.push('doublon:' + k); if (r[6] & 16) bad.push('interdite:' + k); }
  if (v.prof.gc > [0, 0, 0, 3, 99, 99][b]) bad.push('gc');
  if (v.prof.mld && b <= 3) bad.push('mld'); if (v.prof.xt && b <= 2) bad.push('xt'); if (v.prof.combos && b <= 2) bad.push('combo');
  const bud = v.id === 'eco' ? 0 : cs.bud || 0; if (bud && v.prof.cents > bud * 1.001) bad.push('budget');
  if (v.prof.land < v.tgt.land[0] || v.prof.land > v.tgt.land[2]) bad.push('terrains ' + v.prof.land + ' hors ' + v.tgt.land.join('-'));
  if (!(v.prof.wincon >= 1)) bad.push('sans wincon');
  for (const c of cmd.ci) if ((v.prof.src[c] || 0) + 0.5 < (v.prof.need[c] || 0)) bad.push('sources ' + c + ' ' + Math.round(v.prof.src[c] || 0) + '/' + v.prof.need[c]);
  return bad;
}
const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const avg = a => { const s = a.filter(x => x != null && !Number.isNaN(x)); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const r1 = x => x == null ? null : Math.round(x * 1000) / 10;

/** Decks d'une mesure précédente rejoués (simulation) avec cette base : même étalon de rôles et de couleurs pour l'avant et l'après. */
async function resim(ctx, D, prev, i) {
  const g = prev.raw.find(x => x.i === i); if (!g) return null;
  const cs = CASES[i], BD = ctx.BD, ckeys = cs.cmd.map(normKey), slug = slugOf(D, cs.cmd);
  ctx.DW.cmd.clear(); ctx.DW.cmd.set(slug, D.cmd[slug] ? { slug, ...D.cmd[slug] } : null);      // fiche du commandant : le plan (moteur) comme à la construction
  BD.cmdr = cs.cmd.map((n, j) => ({ key: ckeys[j], name: n }));
  for (const d of g.draws) for (const v of d.vers || []) { BD.main = new Map(v.main.map(([k, q]) => [k, { key: k, name: k, qty: q }])); BD.wiz = wizOf(cs, v.id); const r = await ctx.dsimRun(BD, 1500); v.sim = simPick(r); }
  return g;
}
async function worker(args) {
  const D = JSON.parse(gunzipSync(readFileSync(args.dkw)).toString('utf8')), ctx = coachCtx(args.src, D);
  const out = [];
  if (args.resim) { const prev = JSON.parse(readFileSync(args.resim, 'utf8')); for (const i of args.idx) { const g = await resim(ctx, D, prev, i); if (g) out.push(g); } return out; }
  for (const i of args.idx) {
    const cs = CASES[i], t0 = Date.now(), draws = [];
    for (let s = 0; s < args.seeds; s++) { try { draws.push(await buildCase(ctx, D, cs, 1000 + s * 7919)); } catch (e) { draws.push({ err: String(e && e.stack || e).slice(0, 600) }); } }
    out.push({ i, id: cs.id, ms: Date.now() - t0, draws });
  }
  return out;
}
if (process.env.COACH_EVAL_CHILD) {
  process.on('message', async a => { try { const r = await worker(a); process.send(JSON.parse(JSON.stringify(r)), () => process.exit(0)); } catch (e) { console.error(e); process.exit(1); } });
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const dkw = opt('--dkw'), src = opt('--src', join(root, 'src')), outF = opt('--out', ''), resimF = opt('--resim', ''), seeds = Number(opt('--seeds', 2)), jobs = Number(opt('--jobs', 4));
  const only = opt('--only', ''); const idx = only ? only.split(',').map(s => CASES.findIndex(c => c.id === s || String(CASES.indexOf(c)) === s)).filter(i => i >= 0) : CASES.map((c, i) => i);
  if (!dkw) { console.log('Usage : node tools/coach-eval.mjs --dkw <dkw.json.gz> [--src dir] [--out f.json] [--only id,id] [--seeds 2] [--jobs 4]'); process.exit(1); }
  const t0 = Date.now(), parts = Array.from({ length: jobs }, () => []); idx.forEach((i, j) => parts[j % jobs].push(i));
  const got = (await Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => { const c = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, COACH_EVAL_CHILD: '1' }, execArgv: ['--max-old-space-size=4000'] }); c.on('message', res); c.on('error', rej); c.send({ dkw, src, seeds, idx: p, resim: resimF }); })))).flat().sort((x, y) => x.i - y.i);
  // mesures
  const D = JSON.parse(gunzipSync(readFileSync(dkw)).toString('utf8')), by = new Map(D.cards.map(r => [normKey(r[0]), r]));
  const mech = new Map([...readMech(join(root, 'data', 'card-mech.json')).cards].map(([n, m]) => [normKey(n), m]));
  let scry = new Map(); try { const C = JSON.parse(gunzipSync(readFileSync(join(dirname(dkw), 'corpus.json.gz'))).toString('utf8')); for (const [k, x] of Object.entries(C.scry || {})) scry.set(k, { type: x[3], text: x[4] }); } catch (e) { /* sans corpus : types d'après card-mech seulement */ }
  const rows = [], agg = { draws: [], vers: [], theme: [], score: [], keep7: [], cmdOn: [], screw4: [], kill10: [], killT: [], eng: [], seen6: [], rank: [], staple: [], bad: 0, decks: 0, errs: 0 }, vAgg = {};
  const SIMX = ['elim10', 'table', 'tableT', 'cmdKill', 'engKeep', 'wipeSurv', 'wiped', 'saved', 'lost'], simX = Object.fromEntries(SIMX.map(k => [k, []]));      // chiffres de la simulation avec adversaires (absents du code d'avant)
  const RL = ['protect', 'removal', 'wipe', 'recursion'], rlBit = Object.fromEntries(RL.map(r => [r, 1 << (D.roles || []).indexOf(r)])), rlAll = Object.fromEntries(RL.map(r => [r, []]));      // part de protection, retraits, balayages, récursion dans les decks (rôles de la base)
  for (const g of got) {
    const cs = CASES[g.i], ok = g.draws.filter(d => d && d.vers);
    if (ok.length < g.draws.length) agg.errs += g.draws.length - ok.length;
    if (!ok.length) { rows.push({ id: cs.id, err: (g.draws[0] || {}).err }); continue; }
    const d0 = ok[0], sp = d => d.vers.map(v => spellsOf(D, by, v.main));
    const S0 = sp(d0), eq0 = S0[0], row = { id: cs.id, pack: d0.cmd.pack, ms: g.ms };
    if (ok[1]) { row.draw = r1(overlap(eq0, sp(ok[1])[0])); agg.draws.push(row.draw); }
    const ov = []; for (let i = 0; i < S0.length; i++) for (let j = i + 1; j < S0.length; j++) ov.push(overlap(S0[i], S0[j]));
    row.vers = r1(avg(ov)); row.versMax = r1(Math.max(0, ...ov)); if (ov.length) agg.vers.push(row.vers);
    row.v = d0.vers.map((v, i) => {
      const th = themeShare(S0[i], themeTags(cs), mech, scry), bad = checks(D, by, cs, d0.cmd, v), ranks = S0[i].map(k => (by.get(k) || [])[8] || 99999);
      agg.decks++; if (bad.length) agg.bad++;
      const x = { id: v.id, sc: v.sc, th: r1(th), rank: med(ranks), staple: r1(ranks.filter(r => r > 0 && r < 300).length / Math.max(1, ranks.length)), sim: v.sim, land: v.prof.land, mv: v.prof.mv, eur: Math.round(v.prof.cents / 100), bad, theme: v.story ? (v.story.tags || []).slice(0, 3).map(t => t.label + ' ' + t.n).join(', ') : '' };
      (vAgg[v.id] = vAgg[v.id] || { sc: [], th: [], keep7: [], cmdOn: [], screw4: [] });
      vAgg[v.id].sc.push(v.sc); vAgg[v.id].th.push(th); if (v.sim) { vAgg[v.id].keep7.push(v.sim.keep7); vAgg[v.id].cmdOn.push(v.sim.cmdOn); vAgg[v.id].screw4.push(v.sim.screw4); }
      for (const r of RL) rlAll[r].push(v.main.reduce((a, [k, q]) => a + ((((by.get(k) || [])[4] || 0) & rlBit[r]) ? q : 0), 0));
      if (i === 0 && v.sim) for (const k of SIMX) if (v.sim[k] != null) simX[k].push(v.sim[k]);
      if (i === 0) { if (th != null) agg.theme.push(th); agg.score.push(v.sc); if (v.sim) { agg.keep7.push(v.sim.keep7); agg.cmdOn.push(v.sim.cmdOn); agg.screw4.push(v.sim.screw4); agg.kill10.push(v.sim.kill10); agg.killT.push(v.sim.killT); agg.eng.push(v.sim.eng); agg.seen6.push(v.sim.seen6); } agg.rank.push(x.rank); agg.staple.push(x.staple); }
      return x;
    });
    rows.push(row);
  }
  const sum = { at: new Date().toISOString(), src, dkw, cases: got.length, seeds, s: Math.round((Date.now() - t0) / 1000),
    recouvrementTirages: r1(avg(agg.draws) / 100), recouvrementVersions: r1(avg(agg.vers) / 100), partTheme: r1(avg(agg.theme)), noteMed: med(agg.score), noteMoy: avg(agg.score) && Math.round(avg(agg.score) * 10) / 10,
    keep7: avg(agg.keep7) && Math.round(avg(agg.keep7)), cmdOn: avg(agg.cmdOn) && Math.round(avg(agg.cmdOn)), screw4: avg(agg.screw4) && Math.round(avg(agg.screw4)), adversaireMort10: avg(agg.kill10) == null ? null : Math.round(avg(agg.kill10)), tourMort: avg(agg.killT) == null ? null : Math.round(avg(agg.killT) * 10) / 10, moteurEnPlace: avg(agg.eng) == null ? null : Math.round(avg(agg.eng)), cartesVues6: avg(agg.seen6) == null ? null : Math.round(avg(agg.seen6) * 10) / 10, rangMed: med(agg.rank), partStaples: avg(agg.staple) && Math.round(avg(agg.staple) * 10) / 10,
    adversaires: Object.fromEntries(SIMX.map(k => [k, avg(simX[k]) == null ? null : Math.round(avg(simX[k]) * 10) / 10])), roles: Object.fromEntries(RL.map(r => [r, avg(rlAll[r]) == null ? null : Math.round(avg(rlAll[r]) * 10) / 10])),
    decks: agg.decks, decksEnDefaut: agg.bad, erreurs: agg.errs,
    versions: Object.fromEntries(Object.entries(vAgg).map(([k, v]) => [k, { note: Math.round(avg(v.sc) * 10) / 10, theme: r1(avg(v.th)), keep7: Math.round(avg(v.keep7)), cmdOn: Math.round(avg(v.cmdOn)), screw4: Math.round(avg(v.screw4)) }])) };
  console.log(JSON.stringify(sum, null, 1));
  for (const r of rows) console.log(r.err ? `${r.id} ERREUR ${r.err}` : `${r.id.padEnd(15)} ${r.pack ? 'P' : '-'} tirages ${r.draw ?? '-'} % · versions ${r.vers ?? '-'} % (max ${r.versMax ?? '-'}) · ` + r.v.map(v => `${v.id} ${v.sc} th${v.th ?? '-'} rg${v.rank} st${v.staple} k${v.sim ? v.sim.keep7 : '-'}/c${v.sim ? v.sim.cmdOn : '-'}/s${v.sim ? v.sim.screw4 : '-'}${v.sim && v.sim.elim10 != null ? `/a${v.sim.kill10}/m${v.sim.engKeep ?? '-'}` : ''} L${v.land} ${v.eur}€${v.bad.length ? ' !' + v.bad.join(';') : ''}${v.theme ? ' [' + v.theme + ']' : ''}`).join(' | '));
  if (outF) writeFileSync(outF, JSON.stringify({ sum, rows, raw: got }, null, 0));
}
