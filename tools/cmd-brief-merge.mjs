// Fiches des commandants écrites par IA : fusionne les lots (out/c-NNNN.json, consigne data/cmd-brief-guide.md) en data/cmd-brief.json.
//   node tools/cmd-brief-merge.mjs <dossier des lots> [--into data/cmd-brief.json] [--dkw dkw.json.gz]
// Relecture : un arbitre (consigne data/cmd-brief-arbiter.md) écrit arb/c-NNNN.json, préféré à out/ ; --dkw : cartes hors couleurs, interdites ou inconnues retirées.
// Contrôles : slug présent dans le lot envoyé (in/), étiquettes de la taxonomie seulement, notes 0-3, noms de cartes présents dans la base du coach
// (candidates du lot, sinon --names : liste des cartes connues), textes bornés. Un fichier existant est complété (les fiches du lot remplacent les anciennes).
// Format : { v, at, cmds: { slug: { plan, tags, tribes, win, eng: [[libellé, [cartes]]], trap, syn: [[carte, note]], extra } } } (une fiche par ligne).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taxonomy } from './card-mech-merge.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
export const BRIEF_FILE = join(root, 'data', 'cmd-brief.json');
const nk = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Lit le fichier fusionné → { at, cmds: Map(slug → fiche) }. */
export function readBriefs(file = BRIEF_FILE) {
  if (!existsSync(file)) return { at: '', cmds: new Map() };
  const j = JSON.parse(readFileSync(file, 'utf8')); return { at: j.at || '', cmds: new Map(Object.entries(j.cmds || {})) };
}
/** Cartes de la base du coach (dkw) : nom normalisé → { name, ci, fl } (face avant d'une carte double aussi). */
export function cardsOf(D) {
  const cards = new Map(D.cards.map(r => [nk(r[0]), { name: r[0], ci: String(r[1] || ''), fl: r[6] || 0 }]));
  for (const r of D.cards) if (r[0].includes(' // ')) { const k = nk(r[0].split(' // ')[0]); if (!cards.has(k)) cards.set(k, cards.get(nk(r[0]))); }
  return cards;
}
/** Texte du plan : coupé à la fin d'une phrase (jamais au milieu d'un mot) ; cards (facultatif : nom normalisé → { name, ci, fl }) : une carte citée hors des couleurs
 *  (ci : identité du ou des commandants) ou interdite en Commander est retirée de sa liste, sinon sa phrase est retirée (le plan est affiché tel quel dans « Plan du deck »).
 *  self : noms normalisés des commandants (toujours permis, même marqués interdits : commandants pas encore légaux). → { plan, cut, dropped: [noms] } */
const PLAN_MAX = 600;
let NAME_RE = null, NAME_SRC = null;
export function cleanPlan(text, { cards = null, ci = null, self = new Set() } = {}) {
  let t = String(text || '').replace(/\s+/g, ' ').trim(), cut = false; const dropped = [];
  if (t.length > PLAN_MAX || (t.length >= PLAN_MAX - 12 && !/[.!?…»")]$/.test(t))) {      // trop long, ou coupé net à 600 caractères par une fusion d'avant ce contrôle : jusqu'à la dernière fin de phrase
    const head = t.slice(0, PLAN_MAX), m = [...head.matchAll(/[.!?…][»"')]?(?=\s|$)/g)].pop();
    if (m && m.index > 80) t = head.slice(0, m.index + m[0].length); else { const sp = head.lastIndexOf(' '); t = (sp > 0 ? head.slice(0, sp) : head).replace(/[,;:\s]+$/, '') + '…'; }
    cut = true;
  }
  if (cards && ci) {
    if (NAME_SRC !== cards) {      // noms de cartes cherchés tels qu'écrits (majuscules) : au moins 2 mots ou 10 lettres, pour éviter les mots courants (Illusion, Destined…)
      const names = [...new Set([...cards.values()].map(r => r.name.split(' // ')[0]).filter(n => /\s/.test(n) || n.length >= 10))].sort((a, b) => b.length - a.length);
      NAME_RE = new RegExp('(?<![\\p{L}\\d])(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\d])', 'gu'); NAME_SRC = cards;
    }
    const words = new Set([...self].flatMap(k => k.split(' ')));      // nom court du commandant (« Greensleeves », « Abomination ») : pas une autre carte
    const bad = n => { const k = nk(n), r = cards.get(k); if (!r || self.has(k) || (!k.includes(' ') && words.has(k))) return false; return !!(r.fl & 16) || [...r.ci].some(c => !ci.has(c)); };
    const parts = t.match(/[^.!?…]+(?:[.!?…]+[»"')]*|$)\s*/g) || [t];
    const rx = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keep = parts.map(ph => {      // carte citée dans une liste (« A, Propaganda et B ») : retirée de la liste ; sinon la phrase entière part
      const hit = [...new Set([...ph.matchAll(NAME_RE)].map(m => m[1]).filter(bad))]; if (!hit.length) return ph;
      dropped.push(...hit);
      for (const n of hit) { const r = ph.replace(new RegExp('(?:,\\s*|\\s+(?:et|ou)\\s+)' + rx(n) + '(?![\\p{L}\\d])', 'u'), '').replace(new RegExp('(?<![\\p{L}\\d])' + rx(n) + ',\\s*', 'u'), ''); if (r === ph) return null; ph = r; }
      return ph;
    }).filter(ph => ph !== null);
    if (keep.length) t = keep.join('').replace(/\s+/g, ' ').trim();
  }
  return { plan: t, cut, dropped };
}
/** Fusion des lots : { cmds: Map, stats }. known : Set de noms normalisés connus (facultatif ; sinon les candidates du lot et les cartes nommées passent). */
export function mergeBriefs(dir, tax = taxonomy(), known = null, cards = null) {
  const T = new Set(tax.tags), st = { lots: 0, cmds: 0, missing: [], badTags: 0, badCards: 0, syn: 0 }, out = new Map();
  for (const f of readdirSync(join(dir, 'in')).filter(f => /^c-\d+\.json$/.test(f)).sort()) {
    const sent = JSON.parse(readFileSync(join(dir, 'in', f), 'utf8')), arb2 = join(dir, 'arb2', f), arb = existsSync(arb2) ? arb2 : join(dir, 'arb', f), p = existsSync(arb) ? arb : join(dir, 'out', f);      // fiche relue par l'arbitre d'abord (arb2 : deuxième relecture, sur le texte Oracle)
    if (p === arb) st.arb = (st.arb || 0) + 1;
    if (!existsSync(p)) { st.missing.push(f); continue; }
    let got; try { got = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { st.missing.push(f + ' (illisible)'); continue; }
    if (!Array.isArray(got)) got = got && Array.isArray(got.cmds) ? got.cmds : [];
    st.lots++;
    for (const s of sent) {
      const b = got.find(x => x && x.slug === s.slug); if (!b) { st.missing.push(s.slug); continue; }
      const ci = new Set([...String(s.ci || '')]), okCard = k => { if (!cards) return true; const r = cards.get(k); return !!r && !(r.fl & 16) && [...r.ci].every(c => ci.has(c)); };      // base du coach : carte connue, permise en Commander, dans les couleurs
      const cand = new Map(s.cands.map(c => [nk(c[0]), c[0]])), name = n => { const k = nk(n); if (!okCard(k)) { st.badCards++; return null; } if (cand.has(k)) return cand.get(k); if (cards) return cards.get(k).name; if (!known || known.has(k)) return String(n).trim(); st.badCards++; return null; };
      const names = l => [...new Set((Array.isArray(l) ? l : []).map(name).filter(Boolean))];
      const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(t => String(t).trim().toLowerCase()).filter(t => { if (T.has(t)) return true; st.badTags++; return false; }))].slice(0, 6);
      const syn = []; for (const e of Array.isArray(b.syn) ? b.syn : []) { if (!Array.isArray(e)) continue; const n = name(e[0]), v = Math.round(Number(e[1])); if (n && v >= 0 && v <= 3) syn.push([n, v]); }
      const eng = (Array.isArray(b.engines) ? b.engines : []).map(e => e && [String(e.label || '').slice(0, 60), names(e.cards).slice(0, 5)]).filter(e => e && e[0] && e[1].length).slice(0, 5);
      const pos = new Set(syn.filter(([, v]) => v >= 1).map(([n]) => nk(n))), trap = names(b.traps).filter(n => !pos.has(nk(n)));      // notée positivement : pas un piège (contradiction relevée par les arbitres)
      out.set(s.slug, { plan: cleanPlan(b.plan, { cards, ci, self: new Set((s.names || []).map(nk)) }).plan, tags, tribes: [...new Set((Array.isArray(b.tribes) ? b.tribes : []).map(t => String(t).trim()).filter(Boolean))].slice(0, 4),
        win: names(b.win).slice(0, 8), eng, trap: trap.slice(0, 10), syn: syn.slice(0, 120), extra: names(b.extra).slice(0, 15) });
      st.cmds++; st.syn += syn.length;
    }
  }
  return { cmds: out, stats: st };
}
/** Texte du fichier (une fiche par ligne, triées par slug). */
export function briefText(cmds, at) {
  const rows = [...cmds.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([s, b]) => JSON.stringify(s) + ':' + JSON.stringify(b));
  return `{"v":1,"at":${JSON.stringify(at)},\n"cmds":{\n${rows.join(',\n')}\n}}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), dir = a[0], opt = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : null; };
  if (!dir) { console.log('Usage : node tools/cmd-brief-merge.mjs <dossier des lots> [--into data/cmd-brief.json]'); process.exit(1); }
  let cards = null; if (opt('--dkw')) { const { gunzipSync } = await import('node:zlib'); cards = cardsOf(JSON.parse(gunzipSync(readFileSync(opt('--dkw'))).toString('utf8'))); }
  const into = opt('--into') || BRIEF_FILE, { cmds, stats } = mergeBriefs(dir, taxonomy(), null, cards), old = readBriefs(into).cmds, all = new Map([...old, ...cmds]);
  writeFileSync(into, briefText(all, new Date().toISOString().slice(0, 10)));
  console.log(`lots : ${stats.lots} (${stats.arb || 0} relus par l'arbitre) · fiches : ${stats.cmds} (${stats.cmds ? Math.round(stats.syn / stats.cmds) : 0} cartes notées en moyenne) · manquantes : ${stats.missing.length}${stats.missing.length ? ' (' + stats.missing.slice(0, 10).join(', ') + ')' : ''} · étiquettes hors taxonomie : ${stats.badTags} · cartes inconnues : ${stats.badCards}`);
  console.log(`→ ${into} : ${all.size} commandants`);
}
