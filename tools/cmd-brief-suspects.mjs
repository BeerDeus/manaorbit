// Fiches des commandants (data/cmd-brief.json) : tri AUTOMATIQUE (sans IA) des notes 0 et des pièges suspects, à faire relire ensuite (arbitre IA, texte Oracle).
// Suspect : (1) très jouée avec ce commandant (EDHREC : inclusion ≥ 30 % ou synergie ≥ 20 %) ; (2) fournit ce que veut le commandant, ou veut ce qu'il fournit
// (classement par mécaniques, colonne [10] de la base) ; (3) contradiction dans la fiche (citée en condition de victoire ou dans un moteur).
//   node tools/cmd-brief-suspects.mjs --dkw <dkw.json.gz> [--file data/cmd-brief.json] [--out suspects.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readBriefs, BRIEF_FILE } from './cmd-brief-merge.mjs';
import { normKey } from '../gen-edhrec.mjs';

const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (!opt('--dkw')) { console.log('Usage : node tools/cmd-brief-suspects.mjs --dkw <dkw.json.gz> [--file data/cmd-brief.json] [--out suspects.json]'); process.exit(1); }
const D = JSON.parse(gunzipSync(readFileSync(opt('--dkw'))).toString('utf8')), { cmds } = readBriefs(opt('--file') || BRIEF_FILE);
const by = new Map(D.cards.map(r => [normKey(r[0]), r])); for (const r of D.cards) if (r[0].includes(' // ')) { const k = normKey(r[0].split(' // ')[0]); if (!by.has(k)) by.set(k, r); }
const slugOf = n => normKey(n).replace(/ /g, '-'), bySlug = new Map(D.cards.filter(r => r[3] & 256).map(r => [slugOf(r[0]), r]));
const cmdOf = sl => { if (bySlug.has(sl)) return [bySlug.get(sl)]; for (let i = 1; i < sl.length; i++) if (sl[i] === '-' && bySlug.has(sl.slice(0, i)) && bySlug.has(sl.slice(i + 1))) return [bySlug.get(sl.slice(0, i)), bySlug.get(sl.slice(i + 1))]; return null; };
const tags = (D.mech && D.mech.tags) || [], mp = r => new Set(r && r[10] ? r[10][1] : []), mw = r => new Set(r && r[10] ? r[10][2] : []);
const out = [], st = { fiches: 0, zero: 0, trap: 0, flagged: 0, why: { edhrec: 0, mech: 0, contra: 0 }, cmds: new Set() };
for (const [sl, b] of cmds) {
  st.fiches++; const cm = cmdOf(sl) || [], cP = new Set(cm.flatMap(r => [...mp(r)])), cW = new Set(cm.flatMap(r => [...mw(r)]));
  const pack = D.cmd[sl], edh = new Map(((pack && pack.cards) || []).map(([n, incl, syn]) => [normKey(n), [incl, syn]]));
  const cited = new Set([...(b.win || []), ...(b.eng || []).flatMap(e => e[1])].map(normKey));
  const items = [...(b.syn || []).filter(([, v]) => v === 0).map(([n]) => [n, 'note 0']), ...(b.trap || []).map(n => [n, 'piège'])];
  for (const [n, kind] of items) {
    if (kind === 'note 0') st.zero++; else st.trap++;
    const k = normKey(n), r = by.get(k), e = edh.get(k), why = [];
    if (e && (e[0] >= 30 || e[1] >= 20)) { why.push(`EDHREC ${e[0]} % (synergie ${e[1]})`); st.why.edhrec++; }
    const pv = [...mp(r)].filter(i => cW.has(i)).map(i => tags[i]), wv = [...mw(r)].filter(i => cP.has(i)).map(i => tags[i]);
    if (pv.length || wv.length) { why.push('mécaniques : ' + [...pv.map(t => 'fournit ' + t), ...wv.map(t => 'veut ' + t)].slice(0, 3).join(', ')); st.why.mech++; }
    if (cited.has(k)) { why.push('citée en condition de victoire ou moteur'); st.why.contra++; }
    if (why.length) { out.push({ slug: sl, card: n, kind, why }); st.flagged++; st.cmds.add(sl); }
  }
}
const strong = out.filter(o => o.why.length >= 2 || o.why.some(w => w.startsWith('EDHREC') || w.startsWith('citée')));
console.log(`${st.fiches} fiches · notes 0 : ${st.zero} · pièges : ${st.trap} · suspects : ${st.flagged} (${st.cmds.size} fiches ; EDHREC ${st.why.edhrec}, mécaniques ${st.why.mech}, contradiction ${st.why.contra}) · suspects forts (EDHREC, contradiction, ou 2 raisons) : ${strong.length} (${new Set(strong.map(o => o.slug)).size} fiches)`);
for (const o of strong.slice(0, 15)) console.log(`  ${o.slug} · ${o.kind} ${o.card} : ${o.why.join(' ; ')}`);
if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify({ all: out, strong }, null, 1));
