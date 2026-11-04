// Classement des cartes par mécaniques (coach Commander) : fusionne les lots classés par les agents IA en un seul fichier versionné, data/card-mech.json.
// Chaque lot (60 cartes) a été classé par un agent puis relu et corrigé par un arbitre, d'après data/card-mech-taxonomy.md (étiquettes et règles).
//   node tools/card-mech-merge.mjs <dossier des lots> [--vanilla vanilla.json] [--into data/card-mech.json]
// <dossier> contient in/b-NNNN.json (cartes envoyées : name, ci, mana, type, text) et out/b-NNNN.json (classement final de l'arbitre ;
// draft/b-NNNN.json, celui du premier agent, sert si l'arbitre manque). Avec --into, un fichier existant est complété (nouvelles extensions) :
// les cartes déjà classées sont gardées, celles du lot les remplacent si elles y figurent.
// Contrôles : nom présent dans le lot envoyé, étiquettes de la taxonomie seulement (les autres sont retirées et comptées), power entre 1 et 5.
// Format du fichier : { v, at, tax, roles:[…], tags:[…], cards: { nom: [roles, provides, wants, tribes, power, note] } }
//   roles / provides / wants : indices dans `roles` / `tags` ; tribes : noms de types de créature (anglais, singulier) ; une carte par ligne (diffs lisibles).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
export const TAX_FILE = join(root, 'data', 'card-mech-taxonomy.md');

/** Vocabulaire de la taxonomie : { version, roles:[…], tags:[…] } (lignes « - étiquette : … » des sections provides/wants, ligne sous « ## roles »). */
export function taxonomy(md = readFileSync(TAX_FILE, 'utf8')) {
  const lines = md.split('\n'), roles = [], tags = []; let sec = '';
  const version = (/v(\d+(?:\.\d+)?)/.exec(lines[0] || '') || [])[1] || '';
  for (const l of lines) {
    if (/^## /.test(l)) { sec = /^## roles/.test(l) ? 'roles' : /provides/.test(l) ? 'tags' : ''; continue; }
    if (sec === 'roles' && /^[a-z]/.test(l)) roles.push(...l.split(',').map(s => s.trim()).filter(Boolean));
    if (sec === 'tags') { const m = /^- ([a-z0-9-]+) :/.exec(l); if (m) tags.push(m[1]); }
  }
  return { version, roles, tags };
}
/** Lit le fichier fusionné → Map(nom → { roles, provides, wants, tribes, power, note }) (noms d'étiquettes). */
export function readMech(file) {
  const j = JSON.parse(readFileSync(file, 'utf8')), out = new Map();
  for (const [n, [r, p, w, t, pw, note]] of Object.entries(j.cards || {})) out.set(n, { roles: r.map(i => j.roles[i]), provides: p.map(i => j.tags[i]), wants: w.map(i => j.tags[i]), tribes: t, power: pw, note: note || '' });
  return { meta: { v: j.v, at: j.at, tax: j.tax }, cards: out };
}
const tribeName = s => String(s || '').trim().replace(/^./, c => c.toUpperCase());      // type de créature : anglais, singulier (demandé aux agents), majuscule initiale

/** Fusion : { cards: Map, stats } d'après les lots du dossier. */
export function mergeBatches(dir, tax, vanilla = []) {
  const R = new Set(tax.roles), G = new Set(tax.tags), cards = new Map();
  const st = { batches: 0, fromDraft: 0, missingBatch: [], cards: 0, notSent: 0, missingCards: [], dropped: {}, power: 0 };
  const drop = t => { st.dropped[t] = (st.dropped[t] || 0) + 1; };
  for (const f of readdirSync(join(dir, 'in')).filter(f => /^b-\d+\.json$/.test(f)).sort()) {
    const sent = JSON.parse(readFileSync(join(dir, 'in', f), 'utf8')), names = new Set(sent.map(c => c.name));
    const pick = ['out', 'draft'].map(d => join(dir, d, f)).find(p => existsSync(p));
    if (!pick) { st.missingBatch.push(f); continue; }
    let got; try { got = JSON.parse(readFileSync(pick, 'utf8')); } catch (e) { st.missingBatch.push(f + ' (illisible)'); continue; }
    if (!Array.isArray(got)) got = got && Array.isArray(got.cards) ? got.cards : [];
    st.batches++; if (/draft/.test(pick)) st.fromDraft++;
    const seen = new Set();
    for (const c of got) {
      if (!c || !names.has(c.name)) { st.notSent++; continue; }
      const keep = (l, ok) => [...new Set((Array.isArray(l) ? l : []).map(x => String(x).trim().toLowerCase()).filter(x => { if (ok.has(x)) return true; drop(x); return false; }))];
      const roles = keep(c.roles, R), provides = keep(c.provides, G), wants = keep(c.wants, G);
      const tribes = [...new Set((Array.isArray(c.tribes) ? c.tribes : []).map(tribeName).filter(Boolean))];
      let power = Math.round(Number(c.power)); if (!(power >= 1 && power <= 5)) { power = 2; st.power++; }
      cards.set(c.name, { roles, provides, wants, tribes, power, note: String(c.notes || c.note || '').slice(0, 240) }); seen.add(c.name);
    }
    for (const n of names) if (!seen.has(n)) st.missingCards.push(n);
  }
  for (const n of vanilla) if (!cards.has(n)) cards.set(n, { roles: [], provides: [], wants: [], tribes: [], power: 1, note: '' });      // sans texte (créature vanilla) : rien à classer
  st.cards = cards.size;
  return { cards, stats: st };
}
/** Texte du fichier fusionné (une carte par ligne, triées par nom). */
export function mechText(cards, tax, at) {
  const ri = new Map(tax.roles.map((r, i) => [r, i])), ti = new Map(tax.tags.map((t, i) => [t, i]));
  const rows = [...cards.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([n, c]) =>
    JSON.stringify(n) + ':' + JSON.stringify([c.roles.map(r => ri.get(r)), c.provides.map(t => ti.get(t)), c.wants.map(t => ti.get(t)), c.tribes, c.power, c.note]));
  return `{"v":1,"at":${JSON.stringify(at)},"tax":${JSON.stringify(tax.version)},\n"roles":${JSON.stringify(tax.roles)},\n"tags":${JSON.stringify(tax.tags)},\n"cards":{\n${rows.join(',\n')}\n}}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), dir = a[0], opt = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : null; };
  if (!dir) { console.log('Usage : node tools/card-mech-merge.mjs <dossier des lots> [--vanilla vanilla.json] [--into data/card-mech.json]'); process.exit(1); }
  const tax = taxonomy(), into = opt('--into') || join(root, 'data', 'card-mech.json');
  const vanilla = opt('--vanilla') ? JSON.parse(readFileSync(opt('--vanilla'), 'utf8')) : [];
  const { cards, stats } = mergeBatches(dir, tax, vanilla);
  let all = cards;
  if (a.includes('--into') && existsSync(into)) { const old = readMech(into).cards; all = new Map([...old, ...cards]); }
  writeFileSync(into, mechText(all, tax, new Date().toISOString().slice(0, 10)));
  console.log(`taxonomie v${tax.version} : ${tax.roles.length} rôles, ${tax.tags.length} étiquettes`);
  console.log(`lots : ${stats.batches} (dont ${stats.fromDraft} sans arbitre) ; manquants : ${stats.missingBatch.length ? stats.missingBatch.join(', ') : 'aucun'}`);
  console.log(`cartes : ${stats.cards} classées, ${stats.missingCards.length} oubliées par les agents, ${stats.notSent} noms inconnus ignorés, ${stats.power} power corrigés`);
  if (stats.missingCards.length) console.log('  oubliées (extrait) : ' + stats.missingCards.slice(0, 20).join(' · '));
  const d = Object.entries(stats.dropped).sort((x, y) => y[1] - x[1]); if (d.length) console.log('  étiquettes hors taxonomie retirées : ' + d.slice(0, 20).map(([t, n]) => `${t} ×${n}`).join(', '));
  console.log(`→ ${into} : ${all.size} cartes`);
}
