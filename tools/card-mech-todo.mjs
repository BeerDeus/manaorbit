// Nouvelles cartes à classer (nouvelle extension) : compare les cartes de la base du coach (corpus de la branche deck-corpus, fiches Scryfall) au
// classement data/card-mech.json et écrit les lots de celles qui manquent, au même format que le grand tour (in/b-NNNN.json : name, ci, mana, type, text).
//   git show origin/deck-corpus:corpus.json.gz > /tmp/corpus.json.gz
//   node tools/card-mech-todo.mjs /tmp/corpus.json.gz <dossier de sortie> [--size 60]
// Ensuite : faire classer chaque lot par un agent puis relire par un arbitre (même consigne que le grand tour : data/card-mech-taxonomy.md,
// draft/ puis out/), et fusionner : node tools/card-mech-merge.mjs <dossier> --into data/card-mech.json --vanilla <dossier>/vanilla.json
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusLoad } from '../gen-deckdb.mjs';
import { readMech } from './card-mech-merge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);

/** Cartes à classer : légales en Commander, pas des terrains de base, absentes du classement. → { todo:[ligne scry], vanilla:[nom] } (plus jouées d'abord). */
export function mechTodo(C, known) {
  const rows = Object.values(C.scry || {}).filter(r => r[7] && !BASICS.has(r[0]) && !/^Basic/.test(r[3]) && !known.has(r[0]));
  const todo = rows.filter(r => r[4] && r[4].trim()).sort((a, b) => (a[10] || 1e9) - (b[10] || 1e9) || (a[0] < b[0] ? -1 : 1));
  return { todo, vanilla: rows.filter(r => !(r[4] && r[4].trim())).map(r => r[0]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [corpus, out] = process.argv.slice(2), i = process.argv.indexOf('--size'), N = i > 0 ? Number(process.argv[i + 1]) || 60 : 60;
  if (!corpus || !out) { console.log('Usage : node tools/card-mech-todo.mjs <corpus.json.gz> <dossier de sortie> [--size 60]'); process.exit(1); }
  const file = join(here, '..', 'data', 'card-mech.json'), known = existsSync(file) ? readMech(file).cards : new Map();
  const { todo, vanilla } = mechTodo(corpusLoad(corpus), known);
  mkdirSync(join(out, 'in'), { recursive: true }); mkdirSync(join(out, 'draft'), { recursive: true }); mkdirSync(join(out, 'out'), { recursive: true });
  let n = 0; for (let k = 0; k < todo.length; k += N) { writeFileSync(join(out, 'in', `b-${String(n).padStart(4, '0')}.json`), JSON.stringify(todo.slice(k, k + N).map(x => ({ name: x[0], ci: x[1], mana: x[9], type: x[3], text: x[4] })))); n++; }
  writeFileSync(join(out, 'vanilla.json'), JSON.stringify(vanilla));
  console.log(`${known.size} cartes déjà classées · ${todo.length} à classer en ${n} lots de ${N} · ${vanilla.length} sans texte → ${out}`);
}
