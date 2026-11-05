// Fiches des commandants (data/cmd-brief.json) déjà fusionnées : même nettoyage du texte du plan que la fusion (cmd-brief-merge.mjs › cleanPlan) :
// coupé à la fin d'une phrase (90 plans coupés au milieu d'un mot par l'ancienne fusion), phrases qui citent une carte hors des couleurs ou interdite retirées.
//   node tools/cmd-brief-clean.mjs --dkw <dkw.json.gz> [--file data/cmd-brief.json] [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readBriefs, briefText, cleanPlan, cardsOf, BRIEF_FILE } from './cmd-brief-merge.mjs';
import { normKey } from '../gen-edhrec.mjs';

const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (!opt('--dkw')) { console.log('Usage : node tools/cmd-brief-clean.mjs --dkw <dkw.json.gz> [--file data/cmd-brief.json] [--dry]'); process.exit(1); }
const file = opt('--file') || BRIEF_FILE, D = JSON.parse(gunzipSync(readFileSync(opt('--dkw'))).toString('utf8')), cards = cardsOf(D);
const slugOf = n => normKey(n).replace(/ /g, '-'), bySlug = new Map(D.cards.filter(r => r[3] & 256).map(r => [slugOf(r[0]), r]));
/** Commandant(s) d'un slug : un seul, ou deux partenaires (slug des deux noms collés). */
const cmdOf = sl => { if (bySlug.has(sl)) return [bySlug.get(sl)]; for (let i = 1; i < sl.length; i++) if (sl[i] === '-' && bySlug.has(sl.slice(0, i)) && bySlug.has(sl.slice(i + 1))) return [bySlug.get(sl.slice(0, i)), bySlug.get(sl.slice(i + 1))]; return null; };
const { at, cmds } = readBriefs(file), st = { n: 0, cut: 0, drop: 0, unk: [] }, ex = [];
for (const [sl, b] of cmds) {
  st.n++; const cm = cmdOf(sl); if (!cm) st.unk.push(sl);
  const ci = cm ? new Set(cm.flatMap(r => [...String(r[1] || '')])) : null, self = new Set((cm || []).map(r => normKey(r[0])));
  const r = cleanPlan(b.plan, { cards: cm ? cards : null, ci, self });
  if (r.cut) st.cut++; if (r.dropped.length) { st.drop++; if (ex.length < 12) ex.push(`${sl} : ${[...new Set(r.dropped)].join(', ')}`); }
  b.plan = r.plan;
}
console.log(`${st.n} fiches · plans recoupés à une fin de phrase : ${st.cut} · plans où une carte hors couleurs ou interdite a été retirée : ${st.drop}${st.unk.length ? ` · commandant introuvable dans la base (plan non filtré) : ${st.unk.length} (${st.unk.slice(0, 5).join(', ')})` : ''}`);
for (const e of ex) console.log('  ' + e);
if (!a.includes('--dry')) { writeFileSync(file, briefText(cmds, at)); console.log('→ ' + file); }
