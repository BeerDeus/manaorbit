// Fiches des commandants (data/cmd-brief.json) : applique les verdicts d'une relecture ciblée (arbitre IA sur le texte Oracle) des notes 0 et pièges suspects
// (tools/cmd-brief-suspects.mjs). Entrée : fichiers JSON [{ slug, card, kind: « note 0 » | « piège », verdict: « garder » | « changer », note?: 0-3, trap?: false, why }].
//   node tools/cmd-brief-review.mjs <verdicts.json…> [--file data/cmd-brief.json] [--dry]
// « changer » : la note de la carte (syn) prend la nouvelle note ; un piège retiré (trap: false) sort de trap. Rien d'autre ne bouge.
import { readFileSync, writeFileSync } from 'node:fs';
import { readBriefs, briefText, BRIEF_FILE } from './cmd-brief-merge.mjs';

const nk = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Applique les verdicts aux fiches (Map slug → fiche) ; → { seen, kept, notes, traps, missing: [] } */
export function applyReview(cmds, verdicts) {
  const st = { seen: 0, kept: 0, notes: 0, traps: 0, missing: [] };
  for (const v of verdicts) {
    st.seen++; const b = cmds.get(v.slug); if (!b) { st.missing.push(v.slug); continue; }
    if (v.verdict !== 'changer') { st.kept++; continue; }
    const k = nk(v.card), note = Math.round(Number(v.note));
    if (v.trap === false || (v.kind === 'piège' && v.trap !== true)) { const n0 = (b.trap || []).length; b.trap = (b.trap || []).filter(n => nk(n) !== k); if (b.trap.length < n0) st.traps++; }
    if (note >= 0 && note <= 3) {
      const e = (b.syn || (b.syn = [])).find(([n]) => nk(n) === k);
      if (e) { if (e[1] !== note) { e[1] = note; st.notes++; } } else { b.syn.push([v.card, note]); st.notes++; }
    }
  }
  return st;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; }, files = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--file');
  if (!files.length) { console.log('Usage : node tools/cmd-brief-review.mjs <verdicts.json…> [--file data/cmd-brief.json] [--dry]'); process.exit(1); }
  const file = opt('--file') || BRIEF_FILE, { at, cmds } = readBriefs(file), all = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')));
  const st = applyReview(cmds, all);
  console.log(`${st.seen} verdicts · gardés ${st.kept} · notes changées ${st.notes} · pièges retirés ${st.traps}${st.missing.length ? ' · fiches introuvables : ' + st.missing.slice(0, 5).join(', ') : ''}`);
  if (!a.includes('--dry')) { writeFileSync(file, briefText(cmds, at)); console.log('→ ' + file); }
}
