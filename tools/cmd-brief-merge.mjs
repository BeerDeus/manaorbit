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
      out.set(s.slug, { plan: String(b.plan || '').replace(/\s+/g, ' ').trim().slice(0, 600), tags, tribes: [...new Set((Array.isArray(b.tribes) ? b.tribes : []).map(t => String(t).trim()).filter(Boolean))].slice(0, 4),
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
  let cards = null; if (opt('--dkw')) { const { gunzipSync } = await import('node:zlib'), D = JSON.parse(gunzipSync(readFileSync(opt('--dkw'))).toString('utf8')); cards = new Map(D.cards.map(r => [nk(r[0]), { name: r[0], ci: String(r[1] || ''), fl: r[6] || 0 }])); for (const r of D.cards) if (r[0].includes(' // ')) { const k = nk(r[0].split(' // ')[0]); if (!cards.has(k)) cards.set(k, cards.get(nk(r[0]))); } }
  const into = opt('--into') || BRIEF_FILE, { cmds, stats } = mergeBriefs(dir, taxonomy(), null, cards), old = readBriefs(into).cmds, all = new Map([...old, ...cmds]);
  writeFileSync(into, briefText(all, new Date().toISOString().slice(0, 10)));
  console.log(`lots : ${stats.lots} (${stats.arb || 0} relus par l'arbitre) · fiches : ${stats.cmds} (${stats.cmds ? Math.round(stats.syn / stats.cmds) : 0} cartes notées en moyenne) · manquantes : ${stats.missing.length}${stats.missing.length ? ' (' + stats.missing.slice(0, 10).join(', ') + ')' : ''} · étiquettes hors taxonomie : ${stats.badTags} · cartes inconnues : ${stats.badCards}`);
  console.log(`→ ${into} : ${all.size} commandants`);
}
