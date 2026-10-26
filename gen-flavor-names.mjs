#!/usr/bin/env node
// Noms alternatifs imprimés en gros sur certaines cartes (Secret Lair, Final Fantasy « Through the Ages », Godzilla…) : « Thrum of the Vestige » au-dessus de
// « Lightning Bolt » en petit. Scryfall les donne dans flavor_name ; nos catalogues de noms n'ont que les vrais noms, le scan ne les reconnaissait pas.
// Une ligne par impression : « nom alternatif \t nom anglais \t extension|numéro \t langue Scryfall », triées ; le scan reconnaît le nom alternatif et pose l'édition.
//   node gen-flavor-names.mjs [fichier de sortie]      → pwa/names-flavor.tsv (≈ 750 lignes, ≈ 40 Ko ; Node ≥ 18, aucune dépendance, quelques secondes)
// Lancé par .github/workflows/fr-names.yml avec les catalogues des noms. Le fichier existant n'est remplacé que si le nouveau est plausible (≥ 300 lignes).
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const UA = 'ManaOrbit-flavor-names/1.0 (+https://manaorbit.app)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Une impression Scryfall → ligne, ou '' (pas de nom alternatif, champs bizarres). */
export function flavorRow(c) {
  const f = c && (c.flavor_name || (c.card_faces && c.card_faces[0] && c.card_faces[0].flavor_name)), ok = s => typeof s === 'string' && s && !/[\t\n|]/.test(s);
  if (!ok(f) || !ok(c.name) || !ok(c.set) || !ok(c.collector_number) || !ok(c.lang) || f === c.name) return '';
  return f + '\t' + c.name + '\t' + c.set + '|' + c.collector_number + '\t' + c.lang;
}
async function main() {
  const out = process.argv[2] || join(here, 'pwa', 'names-flavor.tsv'), rows = new Set();
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('has:flavorname lang:any') + '&unique=prints&include_extras=true&order=name';
  while (url) {
    let j = null;
    for (let i = 0; i < 5 && !j; i++) { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (r.ok) j = await r.json(); else if (r.status === 404) break; else await sleep(2000 * (i + 1)); }
    if (!j) throw new Error('Scryfall : ' + url);
    for (const c of j.data || []) { const r = flavorRow(c); if (r) rows.add(r); }
    url = j.has_more && typeof j.next_page === 'string' && /^https:\/\/api\.scryfall\.com\//.test(j.next_page) ? j.next_page : '';
    await sleep(250);
  }
  const list = [...rows].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (list.length < 300) { console.error(`names-flavor : seulement ${list.length} lignes : fichier existant conservé.`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });
  const tmp = out + '.tmp'; writeFileSync(tmp, list.join('\n') + '\n'); renameSync(tmp, out);
  console.log(`names-flavor : ${list.length} noms alternatifs → ${out}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e.message || e); process.exit(1); });
