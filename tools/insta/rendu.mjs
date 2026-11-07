// Moteur des posts Instagram : tools/insta/posts/<id>.mjs (diapos + légende) → docs/instagram/<id>/01.jpg… + description.md, index et aperçu de la grille.
// Écrans de l'appli : node tools/store-assets.mjs video fr (shots/video/fr-*.png, non versionnés). Mode d'emploi : tools/insta/LISEZMOI.md.
//   node tools/insta/rendu.mjs                 tous les posts, l'index et l'aperçu de la grille
//   node tools/insta/rendu.mjs 03 07           ces posts seulement (début de l'id)
//   node tools/insta/rendu.mjs --textes        description.md et index seulement (aucune image)
//   node tools/insta/rendu.mjs --une           couvertures « À la une » (docs/instagram/a-la-une/)
//   node tools/insta/rendu.mjs --nouveau=11-mon-sujet    crée tools/insta/posts/11-mon-sujet.mjs à partir du modèle
import { readdirSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { W, H, page, panoSvg, unePage, ecranOk } from './gabarits.mjs';
import { carteImage } from './scryfall.mjs';
import { UNE } from './a-la-une.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
const POSTS = join(DIR, 'posts'), OUT = join(ROOT, 'docs', 'instagram'), TMP = join(DIR, 'rendu');
const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith('--' + k));
const only = args.filter(a => !a.startsWith('--'));

/* ── Nouveau post à partir du modèle ── */
const nouveau = opt('nouveau');
if (nouveau) {
  const id = nouveau.split('=')[1], f = join(POSTS, id + '.mjs');
  if (!id || existsSync(f)) { console.error(id ? `${f} existe déjà` : 'Usage : --nouveau=<nn-sujet>'); process.exit(1); }
  writeFileSync(f, readFileSync(join(DIR, 'modele.mjs'), 'utf8').replace(/__ID__/g, id));
  console.log(f); process.exit(0);
}

/* ── Posts ── */
const files = readdirSync(POSTS).filter(f => /^\d.*\.mjs$/.test(f)).sort();
const posts = [];
for (const f of files) {
  const p = (await import(pathToFileURL(join(POSTS, f)).href)).default;
  if (p.id !== f.replace(/\.mjs$/, '')) throw new Error(`${f} : id « ${p.id} » différent du nom du fichier`);
  if (p.alt && p.alt.length !== p.diapos.length) throw new Error(`${p.id} : ${p.alt.length} textes alternatifs pour ${p.diapos.length} diapos`);
  if ((p.hashtags || []).length > 5) throw new Error(`${p.id} : ${p.hashtags.length} hashtags, Instagram en accepte 5`);
  posts.push(p);
}
const todo = posts.filter(p => !only.length || only.some(o => p.id.startsWith(o)));
if (!todo.length) { console.error('Aucun post : ' + only.join(', ')); process.exit(1); }

/* ── description.md ── */
const fence = s => '```\n' + s.trim() + '\n```';
function description(p) {
  const n = p.diapos.length, imgs = Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0') + '.jpg');
  const legende = p.legende.trim() + (p.hashtags?.length ? '\n\n' + p.hashtags.join(' ') : '');
  return `# ${p.titre}

${p.resume}

**Images** : ${imgs.join(', ')} (1080 × 1350, dans cet ordre)${p.epingle ? '  \n**À épingler** sur le profil.' : ''}

## Légende

${fence(legende)}
${p.commentaire ? `
## Premier commentaire

Le publier soi-même juste après, pour lancer la discussion.

${fence(p.commentaire)}
` : ''}${p.alt ? `
## Texte alternatif

Pour chaque image : « Paramètres avancés › Accessibilité › Écrire un texte alternatif » (lu aux personnes malvoyantes, et aide Instagram à comprendre le post).

${p.alt.map((a, i) => `${i + 1}. ${a}`).join('\n')}
` : ''}
## Publication

${(p.publication || []).map(l => '- ' + l).join('\n')}
`;
}

/* ── Index ── */
function index() {
  const UNE_LIST = UNE.map(u => `- \`${u.id}.jpg\` : **${u.titre}**`).join('\n');
  const rows = posts.map((p, i) => `| ${i + 1} | [${p.titre}](${p.id}/description.md) | ${p.diapos.length} | ${p.type} | ${p.quand} |`).join('\n');
  return `# Posts Instagram

Carrousels pour le fil du compte (onglet « Publications »), en plus des Reels. Générés par \`node tools/insta/rendu.mjs\` (mode d'emploi : \`tools/insta/LISEZMOI.md\`) : ne pas retoucher les images ici, changer le post dans \`tools/insta/posts/\` et relancer.

Chaque dossier : les images dans l'ordre (\`01.jpg\`, \`02.jpg\`…) et \`description.md\` (légende à copier, premier commentaire, textes alternatifs, conseils).
\`apercu-grille.jpg\` : la grille du profil une fois les ${posts.length} posts publiés (le plus récent en haut à gauche). \`a-la-une/\` : couvertures des stories à la une.

| # | Post | Images | Genre | Quand |
|---|---|---|---|---|
${rows}

## Comment publier un carrousel

- **Format** : les images sont en 4:5 (1080 × 1350). À l'import, Instagram propose parfois de recadrer en carré : toucher l'icône de recadrage pour revenir au format d'origine, sur la première image (les suivantes suivent).
- **Ordre** : sélectionner les images de \`01\` à la dernière, dans l'ordre. La première est la couverture, c'est elle qui apparaît dans la grille (rognée sur les côtés en 3:4 : rien d'important n'y est au bord).
- **Légende** : copier le bloc de \`description.md\` tel quel. La première ligne est la seule visible avant « plus » : elle doit donner envie d'ouvrir.
- **Hashtags** : 5 au plus (Instagram en accepte 5 par publication). Les mots de la légende comptent autant pour la recherche : on y écrit naturellement « Magic », « Commander », « collection ».
- **Musique** : facultative sur un carrousel. Si tu en mets une, instrumentale et calme, depuis la bibliothèque d'Instagram.
- **Heure** : comme les Reels, 18 h 30 en semaine, 11 h le week-end. Un carrousel entre deux Reels, pas le même jour.
- **Après** : répondre aux commentaires dans la première heure. Les posts « astuce » et « règles » se partagent en story : les republier en story le lendemain avec un autocollant « Nouveau post ».
- **Épingler** : jusqu'à 3 posts en haut du profil (\`…\` › Épingler sur le profil). Conseillé : le post 1 (présentation) et le post 3 (règles), puis celui qui marche le mieux.
- **Données des écrans** : une collection d'exemple (vraies cartes, prix plausibles), comme sur la fiche Google Play.
- **Cartes Magic** : vraies images Scryfall, jamais recadrées ni déformées (le nom de l'artiste et le © restent visibles). La dernière image de chaque post porte la mention de la Fan Content Policy de Wizards : ne pas la couper. Jamais le logo Magic.

## À la une

Couvertures dans \`a-la-une/\` (stories 1080 × 1920, seul le rond du centre se voit). Pour chacune : publier l'image en story, puis « Mettre à la une » › Nouvelle, et choisir l'image comme couverture. Noms conseillés, dans l'ordre :

${UNE_LIST}
`;
}

/* ── Rendu ── */
mkdirSync(OUT, { recursive: true });
for (const p of posts) { mkdirSync(join(OUT, p.id), { recursive: true }); writeFileSync(join(OUT, p.id, 'description.md'), description(p)); }
writeFileSync(join(OUT, 'LISEZMOI.md'), index());
console.log(`${posts.length} descriptions + index`);
if (opt('textes')) process.exit(0);

const need = new Set(); const walk = o => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'ecran' && typeof v === 'string') need.add(v); else walk(v); } };
todo.forEach(p => walk(p.diapos));
const miss = [...need].filter(n => !ecranOk(n));
if (miss.length) { console.error(`Écrans absents de shots/video/ : ${miss.join(', ')}\n→ node tools/store-assets.mjs video fr`); process.exit(1); }

/* vraies cartes (scry: 'Nom anglais', lang) : image Scryfall téléchargée une fois (shots/cartes/), sinon carte dessinée */
const cartes = []; const walkC = o => { if (o && typeof o === 'object') { if (typeof o.scry === 'string') cartes.push(o); Object.values(o).forEach(walkC); } };
todo.forEach(p => walkC(p.diapos));
for (const c of cartes) { c._img = await carteImage(c.scry, { lang: c.lang || 'fr', size: 'large', set: c.set || '' }); if (!c._img) console.log(`  ! ${c.scry} : image introuvable, carte dessinée`); }

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--font-render-hinting=none', '--allow-file-access-from-files'] });
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('requestfailed', r => errs.push('introuvable : ' + r.url()));
mkdirSync(TMP, { recursive: true });
async function shoot(html, file, w = W, h = H) {
  const f = join(TMP, 'page.html'); writeFileSync(f, html);
  await pg.setViewportSize({ width: w, height: h }); await pg.goto(pathToFileURL(f).href);
  await pg.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]));
  await pg.screenshot({ path: file, type: 'jpeg', quality: 93 });
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
}

if (opt('une')) {
  const d = join(OUT, 'a-la-une'); mkdirSync(d, { recursive: true });
  for (const u of UNE) { await shoot(unePage(u, u.id), join(d, u.id + '.jpg'), 1080, 1920); console.log('  ' + join(d, u.id + '.jpg')); }
  await browser.close(); process.exit(0);
}

for (const p of todo) {
  const dir = join(OUT, p.id), n = p.diapos.length, pano = panoSvg(n, p.id);
  for (const f of readdirSync(dir)) if (/^\d\d\.jpg$/.test(f)) rmSync(join(dir, f));      // diapos d'un rendu précédent (une diapo retirée ne doit pas rester)
  for (let i = 0; i < n; i++) await shoot(page(p.diapos[i], { i, n, post: p }, pano), join(dir, String(i + 1).padStart(2, '0') + '.jpg'));
  // planche de contrôle : toutes les diapos côte à côte (tools/insta/rendu/, non versionnée)
  const imgs = Array.from({ length: n }, (_, i) => `<img src="${pathToFileURL(join(dir, String(i + 1).padStart(2, '0') + '.jpg')).href}">`).join('');
  await shoot(`<!doctype html><style>body{margin:0;background:#222;display:flex;gap:12px;padding:12px}img{width:432px;height:540px}</style>${imgs}`, join(TMP, p.id + '.jpg'), 12 + n * 444, 564);
  console.log(`  ${p.id} : ${n} images`);
}

/* aperçu de la grille du profil : couvertures en 3:4, la plus récente en haut à gauche */
const cov = posts.slice().reverse().map(p => `<div><img src="${pathToFileURL(join(OUT, p.id, '01.jpg')).href}"></div>`).join('');
const rows = Math.ceil(posts.length / 3);
await shoot(`<!doctype html><style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(3,360px);gap:3px}div{width:360px;height:480px;overflow:hidden}img{width:100%;height:100%;object-fit:cover}</style>${cov}`,
  join(OUT, 'apercu-grille.jpg'), 3 * 360 + 6, rows * 480 + (rows - 1) * 3);
await browser.close();
console.log(join(OUT, 'apercu-grille.jpg'));
