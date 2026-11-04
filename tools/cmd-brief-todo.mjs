// Fiches des commandants écrites par IA (coach Commander) : lots à faire lire par des agents (consigne : data/cmd-brief-guide.md).
// Pour chaque commandant : son texte, ses mécaniques (data/card-mech.json via la base du coach), ses thèmes EDHREC, et ses candidates : les cartes de sa page
// EDHREC (hors terrains, les plus jouées d'abord) et celles des couleurs qui servent son plan d'après les mécaniques (deckmech.js › dmxPool), même jamais jouées.
//   git show origin/deck-corpus:dkw.json.gz > /tmp/dkw.json.gz ; git show origin/deck-corpus:corpus.json.gz > /tmp/corpus.json.gz
//   node tools/cmd-brief-todo.mjs --dkw /tmp/dkw.json.gz --corpus /tmp/corpus.json.gz --out <dossier> [--top 100] [--cmds "Nom|Nom + Partenaire|…"] [--per 5] [--skip data/cmd-brief.json]
// Écrit <dossier>/in/c-NNNN.json (per commandants par lot) ; les agents écrivent <dossier>/out/c-NNNN.json ; fusion : node tools/cmd-brief-merge.mjs <dossier>.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normKey } from '../gen-edhrec.mjs';
import { cmdsFromEdh } from '../gen-deckdb.mjs';
import { coachCtx } from './coach-eval.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const TYPES = [[1, 'Land'], [2, 'Creature'], [4, 'Artifact'], [8, 'Enchantment'], [16, 'Instant'], [32, 'Sorcery'], [64, 'Planeswalker'], [128, 'Battle']];
export const slugOfNames = names => names.map(n => normKey(n).replace(/ /g, '-')).join('-');

/** Fiche à lire pour un commandant (names : 1 ou 2 noms). */
export function briefInput(ctx, D, scry, names, slug, nCands = 150, nPool = 80) {
  const by = ctx.DW.byKey, keys = names.map(normKey), rows = keys.map(k => by.get(k)); if (rows.some(r => !r)) return null;
  const ci = [...new Set(rows.flatMap(r => [...String(r[1])]))].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('');
  const tags = (D.mech && D.mech.tags) || [], tl = l => (l || []).map(i => tags[i]).filter(Boolean).join(',');
  const mechOf = r => Array.isArray(r[10]) ? [tl(r[10][1]) && 'p:' + tl(r[10][1]), tl(r[10][2]) && 'w:' + tl(r[10][2]), Array.isArray(r[10][3]) ? 't:' + r[10][3].join(',') : '', 'pw' + r[10][4]].filter(Boolean).join(' ') : '';
  const line = (r, incl) => [r[0], r[2], TYPES.filter(([b]) => r[3] & b).map(([, t]) => t).join('/') + (r[11] ? ' — ' + r[11] : ''), mechOf(r), incl || 0];
  const pack = D.cmd[slug] || null, out = [], seen = new Set(keys);
  for (const [nm, inc] of (pack && pack.cards) || []) { const k = normKey(nm), r = by.get(k); if (!r || r[4] & 1 || seen.has(k)) continue; seen.add(k); out.push(line(r, inc)); if (out.length >= nCands) break; }
  const cmd = { keys, names, ci }, plan = ctx.dmxPlan(cmd, {}), pool = plan ? ctx.dmxPool(cmd, plan) : [];
  let np = 0; for (const [k, r] of pool) { if (seen.has(k) || r[4] & 1) continue; seen.add(k); out.push(line(r, 0)); if (++np >= nPool) break; }
  return { slug, names, ci, cards: rows.map((r, i) => { const s = scry[keys[i]] || []; return { name: r[0], mana: r[9] || s[9] || '', type: s[3] || '', text: s[4] || '', mech: mechOf(r) }; }),
    themes: ((pack && pack.thl) || []).slice(0, 8).map(t => t[1]), decks: pack ? pack.n || 0 : 0, cands: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const dkw = opt('--dkw'), corpus = opt('--corpus'), out = opt('--out'), per = Number(opt('--per', 5)), top = Number(opt('--top', 0)), skipF = opt('--skip', join(root, 'data', 'cmd-brief.json'));
  if (!dkw || !corpus || !out) { console.log('Usage : node tools/cmd-brief-todo.mjs --dkw <dkw.json.gz> --corpus <corpus.json.gz> --out <dossier> [--top N] [--cmds "A|B + C"] [--per 5]'); process.exit(1); }
  const D = JSON.parse(gunzipSync(readFileSync(dkw)).toString('utf8')), C = JSON.parse(gunzipSync(readFileSync(corpus)).toString('utf8')), ctx = coachCtx(join(root, 'src'), D);
  const done = existsSync(skipF) ? new Set(Object.keys(JSON.parse(readFileSync(skipF, 'utf8')).cmds || {})) : new Set();
  const list = [];
  for (const s of (opt('--cmds', '') || '').split('|').map(x => x.trim()).filter(Boolean)) { const names = s.split(' + ').map(x => x.trim()); list.push([names, D.cmd[slugOfNames(names)] ? slugOfNames(names) : D.cmd[slugOfNames([...names].reverse())] ? slugOfNames([...names].reverse()) : slugOfNames(names)]); }
  if (top) for (const c of cmdsFromEdh(join(root, 'pwa', 'edh.bin.gz')).filter(c => D.cmd[c.slug]).sort((x, y) => y.decks - x.decks).slice(0, top)) list.push([c.names, c.slug]);
  const todo = [], seen = new Set();
  for (const [names, slug] of list) { if (seen.has(slug) || done.has(slug)) continue; seen.add(slug); const b = briefInput(ctx, D, C.scry || {}, names, slug); if (b) todo.push(b); else console.log('  inconnu : ' + names.join(' + ')); }
  mkdirSync(join(out, 'in'), { recursive: true }); mkdirSync(join(out, 'out'), { recursive: true });
  let n = 0; for (let k = 0; k < todo.length; k += per) { writeFileSync(join(out, 'in', `c-${String(n).padStart(4, '0')}.json`), JSON.stringify(todo.slice(k, k + per))); n++; }
  console.log(`${todo.length} commandants (${done.size} déjà faits) en ${n} lots de ${per} → ${out}`);
}
