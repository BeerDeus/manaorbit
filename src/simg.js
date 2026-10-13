/* ── simg.js : images à partager (PNG 1080 × 1350, le format portrait des réseaux) ───────────────────────────────────────────────────
   simgShare(spec) dessine une image aux couleurs de Mana Orbit (fond « aurore » sombre de l'accueil, liseré foil, logo et nom, adresse du site en pied
   discret), l'affiche aussitôt dans une feuille d'aperçu (« Enregistrer » / « Partager ») et la partage. Retourne une promesse { blob, w, h } (null : échec).
   Sortes (spec.kind), montants en euros (nombres, pas en centimes) :
   · 'coll'    { value, n (cartes différentes), copies, top: [{ name, img, eur }] (3 plus chères), date }      Stats de la collection (simgColl)
   · 'deck'    { name, sub (commandant ou format), colors ('WUBRG'), img (carte de présentation), value, part (valeur partielle), n, url? }   « Partager le deck » (simgDeck)
   · 'trade'   { by (pseudo), n (cartes à échanger), copies, value, want (cartes recherchées), top: [...], url (lien public → QR, qrSvg de qr.js) }   Échange (simgTrade)
   · 'opening' CONTRAT avec la session d'ouverture (une autre fonction l'appelle depuis son bilan) :
               simgShare({ kind: 'opening', name, date (ms), n (cartes), value (€), paid (€ ou null), best: [{ name, img (image Scryfall « normal »), eur }] (5 au plus) })
               → nom de la session, valeur, payé et gain ou perte (si payé), meilleures cartes avec leurs images.
   Images des cartes : seulement Scryfall (SHARE_IMG_RE). cards.scryfall.io répond en CORS (Access-Control-Allow-Origin: *, le service worker les lit déjà ainsi) :
   lues par fetch (CORS, sans cookie) puis décodées par createImageBitmap, hors du fil principal ; le canvas n'est jamais « teinté » et l'export PNG marche.
   Image injoignable ou refusée (6 s au plus) : un dos de carte aux couleurs de l'appli, avec le nom de la carte.
   Rendu : décodage des images et encodage PNG (toBlob) hors du fil principal ; le dessin lui-même prend quelques millisecondes. Polices de la page
   (Bricolage Grotesque, Instrument Sans) attendues avant de dessiner (1,5 s au plus, sinon celles du système).
   Partage : APK 1.0.4 et plus → ManaOrbit.shareImage({ data (PNG en base64), name, text, title, chooser }) : menu « Partager » d'Android (la WebView n'a pas
   navigator.share) ; navigateur → navigator.share({ files }) si canShare l'accepte, sinon téléchargement. « Enregistrer » : APK 1.0.4 → ManaOrbit.saveImage
   (Photos, dossier Pictures/Mana Orbit, Android 10 et plus) ; navigateur → téléchargement. APK plus ancienne (méthodes absentes, promesse refusée) :
   le lien (deck, liste d'échange) part par le partage habituel (shareOut) ; sinon l'image s'affiche en grand, « appui long pour l'enregistrer ».
   Rien au démarrage : tout est construit quand une image est demandée. */
const SIMG_W = 1080, SIMG_H = 1350, SIMG_M = 72, SIMG_SITE = 'manaorbit.app';
const SIMG_FD = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif', SIMG_FB = '"Instrument Sans", "Segoe UI", system-ui, -apple-system, sans-serif';
const SIMG_INK = '#eaeefb', SIMG_MUTE = 'rgba(234,238,251,.62)', SIMG_ACC = '#9fb4ff', SIMG_GOOD = '#4fd1a1', SIMG_BAD = '#ff8091';
const SIMG_FOIL = [[0, '#ff8fc3'], [0.26, '#ffd479'], [0.5, '#7be8c8'], [0.74, '#7fb0ff'], [1, '#c79bff']];
const SIMG_PIPS = { W: '#f8f6d8', U: '#7fb0ff', B: '#b5a3c8', R: '#ff7a5c', G: '#6fd08c' };      // les planètes du logo
const SIMG = { api: null, seq: 0 };

/* ── Petits outils de dessin ─────────────────────────────────────────────────────────────────────── */
/** Chemin d'un rectangle arrondi (ctx.roundRect n'existe pas partout). */
function simgRR(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
const simgFont = (x, w, px, fam) => { x.font = `${w} ${Math.round(px)}px ${fam}`; };
/** Texte coupé d'un « … » pour tenir dans max px. */
function simgClip(x, s, max) {
  s = String(s || ''); if (x.measureText(s).width <= max) return s;
  while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
/** Taille de police (de big à small) qui fait tenir s sur une ligne de max px ; coupé en dernier recours. Retourne le texte à écrire. */
function simgFit(x, s, w, big, small, fam, max) {
  let px = big; simgFont(x, w, px, fam);
  while (px > small && x.measureText(s).width > max) { px -= 4; simgFont(x, w, px, fam); }
  return simgClip(x, s, max);
}
/** Lignes (lines au plus) de s pour max px ; la dernière coupée d'un « … ». */
function simgWrap(x, s, max, lines) {
  const out = []; let cur = '';
  for (const w of String(s || '').split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || x.measureText(t).width <= max) cur = t; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) out.splice(lines - 1, out.length, out.slice(lines - 1).join(' '));      // le reste sur la dernière ligne, coupé d'un « … »
  return out.map(l => simgClip(x, l, max));
}
/** Dégradé foil horizontal sur [a, b]. */
function simgFoil(x, a, b) { const g = x.createLinearGradient(a, 0, b, 0); for (const [o, c] of SIMG_FOIL) g.addColorStop(o, c); return g; }
/** Euros : « 1 234,56 € » ; whole : sans centimes (gros montants). */
const simgEur = (v, whole) => new Intl.NumberFormat(LOC(), { style: 'currency', currency: 'EUR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(Number(v) || 0);
const simgDate = t => new Date(Number(t) || Date.now()).toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' });
/** Espacement des lettres (titres en capitales) quand le navigateur le permet. */
const simgTrack = (x, px) => { try { if ('letterSpacing' in x) x.letterSpacing = px + 'px'; } catch (e) { /* ancien navigateur : sans */ } };

/* ── Fond, logo, en-tête, pied ───────────────────────────────────────────────────────────────────── */
function simgBg(x) {
  x.fillStyle = '#0b0f1c'; x.fillRect(0, 0, SIMG_W, SIMG_H);
  const glow = (cx, cy, r, rgb, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(0, 0, SIMG_W, SIMG_H); };
  glow(220, -40, 1150, '29,37,82', 1);                // le fond du premier lancement (.ob)
  glow(-60, 140, 620, '63,143,224', 0.36);            // l'aurore de l'accueil (.hm-aura) : bleu, rouge, vert, violet
  glow(1140, 470, 560, '224,83,61', 0.24);
  glow(-40, 1060, 560, '58,154,94', 0.22);
  glow(1120, 1390, 660, '199,155,255', 0.3);
  x.fillStyle = simgFoil(x, 0, SIMG_W); x.fillRect(0, 0, SIMG_W, 8);      // liseré foil, l'accent de la marque
}
/** Logo (symbole #i-logo de body.html, redessiné : l'orbite, la carte foil, les cinq planètes), carré de côté s en (a, b). */
function simgLogo(x, a, b, s) {
  x.save(); x.translate(a, b); x.scale(s / 88, s / 88); x.translate(-6, -8);
  const rot = (deg, cx, cy) => { x.translate(cx, cy); x.rotate(deg * Math.PI / 180); x.translate(-cx, -cy); };
  const orbit = d => { x.strokeStyle = '#9aa3b8'; x.lineWidth = 2.6; x.lineCap = 'round'; x.stroke(new Path2D(d)); };
  const planet = (cx, cy, r, c, so) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = c; x.fill(); x.strokeStyle = `rgba(234,238,251,${so})`; x.lineWidth = 0.8; x.stroke(); };
  x.save(); rot(-20, 50, 52); orbit('M12 52A38 13 0 0 1 88 52'); planet(27.7, 41.5, 3.6, '#ff7a5c', 0.25); planet(72.3, 41.5, 3.6, '#6fd08c', 0.25); x.restore();
  x.save(); rot(-11, 51, 50);
  const g = x.createLinearGradient(37, 27, 65, 68); for (const [o, c] of SIMG_FOIL) g.addColorStop(o, c);
  simgRR(x, 37, 27, 28, 41, 5); x.fillStyle = g; x.fill();
  simgRR(x, 39.6, 29.6, 22.8, 35.8, 3.2); x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.2; x.stroke(); x.restore();
  x.save(); rot(-20, 50, 52); orbit('M12 52A38 13 0 0 0 88 52'); planet(86.1, 56, 4.6, '#7fb0ff', 0.3); planet(50, 65, 4.6, '#f8f6d8', 0.3); planet(13.9, 56, 4.6, '#b5a3c8', 0.3); x.restore();
  x.restore();
}
function simgHead(x, right) {
  simgLogo(x, SIMG_M - 6, 52, 92);
  x.fillStyle = SIMG_INK; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; simgTrack(x, -1);
  simgFont(x, 700, 46, SIMG_FD); x.fillText('Mana Orbit', SIMG_M + 100, 114); simgTrack(x, 0);
  if (right) { x.textAlign = 'right'; x.fillStyle = SIMG_MUTE; x.fillText(simgFit(x, right, 500, 30, 22, SIMG_FB, 420), SIMG_W - SIMG_M, 110); x.textAlign = 'left'; }
}
function simgFoot(x) {
  x.textAlign = 'center'; x.fillStyle = 'rgba(234,238,251,.5)'; simgFont(x, 500, 28, SIMG_FB); simgTrack(x, 1);
  x.fillText(SIMG_SITE, SIMG_W / 2, SIMG_H - 52); simgTrack(x, 0); x.textAlign = 'left';
}
/** Petit titre en capitales, couleur d'accent. */
function simgKicker(x, s, y) { x.fillStyle = SIMG_ACC; simgTrack(x, 3); x.fillText(simgFit(x, String(s).toUpperCase(), 650, 27, 20, SIMG_FB, SIMG_W - 2 * SIMG_M), SIMG_M, y); simgTrack(x, 0); }

/* ── Cartes ─────────────────────────────────────────────────────────────────────────────────────── */
const SIMG_RATIO = 680 / 488;      // image Scryfall « normal »
/** Adresse d'image Scryfall en taille « normal » (les vignettes de l'appli sont « small », floues à cette taille) ; '' si ce n'est pas une image Scryfall. */
const simgBig = u => { const s = String(u || '').replace(/\/(small|art_crop|large|png|border_crop)\//, '/normal/'); return SHARE_IMG_RE.test(s) ? s : ''; };
/** Image décodée (ImageBitmap ou <img>), ou null. Lue en CORS : le canvas reste exportable. */
async function simgImg(url, ms = 6000) {
  url = simgBig(url); if (!url) return null;
  const go = (async () => {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' }); if (!r.ok) return null;
    const b = await r.blob();
    try { if (typeof createImageBitmap === 'function') return await createImageBitmap(b); } catch (e) { /* format que createImageBitmap ne lit pas (SVG) : par une image */ }
    const u = URL.createObjectURL(b), im = new Image();
    try { im.src = u; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
  })().catch(() => null);
  return Promise.race([go, sleep(ms).then(() => null)]);
}
/** Une carte de largeur w centrée en (cx, cy), tournée de deg degrés : image, sinon un dos aux couleurs de l'appli avec son nom. */
function simgCard(x, im, cx, cy, w, deg, name) {
  const h = w * SIMG_RATIO, r = w * 0.048;
  x.save(); x.translate(cx, cy); x.rotate((deg || 0) * Math.PI / 180);
  x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 44; x.shadowOffsetY = 20;
  simgRR(x, -w / 2, -h / 2, w, h, r); x.fillStyle = '#131a2b'; x.fill();
  x.shadowColor = 'transparent';
  x.save(); simgRR(x, -w / 2, -h / 2, w, h, r); x.clip();
  if (im) x.drawImage(im, -w / 2, -h / 2, w, h);
  else {
    const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, '#232b5c'); g.addColorStop(1, '#0f1426'); x.fillStyle = g; x.fillRect(-w / 2, -h / 2, w, h);
    x.globalAlpha = 0.9; simgLogo(x, -w * 0.22, -h * 0.28, w * 0.44); x.globalAlpha = 1;
    x.fillStyle = SIMG_INK; x.textAlign = 'center'; simgFont(x, 650, Math.max(18, w * 0.085), SIMG_FD);
    simgWrap(x, name || '', w * 0.82, 3).forEach((l, i) => x.fillText(l, 0, h * 0.14 + i * w * 0.11));
    x.textAlign = 'left';
  }
  x.restore();
  simgRR(x, -w / 2, -h / 2, w, h, r); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.stroke();
  x.restore();
}
/** Éventail de cartes (la plus chère au milieu, devant), centré en (540, cy). list : [{ name, im }] dans l'ordre de valeur. */
function simgFan(x, list, cy, w) {
  const n = list.length; if (!n) return;
  const order = []; list.forEach((c, i) => { if (i % 2) order.unshift(i); else order.push(i); });      // rangs 4 2 1 3 5 de gauche à droite
  const gap = n > 1 ? Math.min(w * 0.82, (SIMG_W - 2 * SIMG_M - w) / (n - 1)) : 0, mid = (n - 1) / 2;
  const at = order.map((rank, pos) => ({ rank, cx: SIMG_W / 2 + (pos - mid) * gap, cy: cy + Math.pow(Math.abs(pos - mid), 2) * 14, deg: (pos - mid) * (n > 3 ? 6 : 8) }));
  for (const p of at.slice().sort((a, b) => b.rank - a.rank)) simgCard(x, list[p.rank].im, p.cx, p.cy, w, p.deg, list[p.rank].name);      // les moins chères d'abord : la meilleure par-dessus
}
/** Éventail dans la bande [top, bottom] : cartes d'autant plus grandes qu'elles sont peu nombreuses (big : largeur pour une seule), centré dans la bande. */
function simgFanIn(x, list, top, bottom, big) {
  const n = list.length; if (!n) return;
  const extra = n > 2 ? 30 + (n > 3 ? 40 : 0) : 12, avail = bottom - top - extra;      // place des cartes du bord, plus basses et tournées
  const w = Math.min(big * [1, 1, 0.84, 0.76, 0.6, 0.6][n], avail / SIMG_RATIO);
  simgFan(x, list, top + (bottom - top - extra) / 2, w);
}
/** Liste classée sous l'éventail : « 1  Nom ………… 12,34 € », une ligne par carte, à partir de y. */
function simgRanks(x, list, y, step) {
  const L = SIMG_M, R = SIMG_W - SIMG_M;
  list.forEach((c, i) => {
    const yy = y + i * step;
    x.fillStyle = 'rgba(255,255,255,.08)'; simgRR(x, L, yy - 30, 40, 40, 12); x.fill();
    x.fillStyle = SIMG_ACC; x.textAlign = 'center'; simgFont(x, 700, 24, SIMG_FB); x.fillText(String(i + 1), L + 20, yy - 2);
    x.textAlign = 'right'; x.fillStyle = SIMG_INK; simgFont(x, 700, 30, SIMG_FB); const p = c.eur > 0 ? simgEur(c.eur) : '—'; x.fillText(p, R, yy); const pw = x.measureText(p).width;
    x.textAlign = 'left'; simgFont(x, 550, 30, SIMG_FB); x.fillStyle = 'rgba(234,238,251,.88)'; x.fillText(simgClip(x, c.name, R - pw - 32 - (L + 60)), L + 60, yy);
  });
}
/** Grand montant en foil, centré ou à gauche. */
function simgAmount(x, s, y, big, align) {
  const max = SIMG_W - 2 * SIMG_M, t = simgFit(x, s, 800, big, 64, SIMG_FD, max), w = x.measureText(t).width, a = align === 'center' ? (SIMG_W - w) / 2 : SIMG_M;
  simgTrack(x, -2); x.fillStyle = simgFoil(x, a, a + w); x.fillText(t, a, y); simgTrack(x, 0);
}
/** Pastilles des couleurs (WUBRG) à partir de (a, y). Retourne la largeur prise. */
function simgPips(x, colors, a, y) {
  const cs = [...String(colors || '')].filter(c => SIMG_PIPS[c]); let w = 0;
  for (const c of cs) { x.beginPath(); x.arc(a + w + 13, y - 11, 13, 0, Math.PI * 2); x.fillStyle = SIMG_PIPS[c]; x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.stroke(); w += 34; }
  return w;
}

/* ── Les quatre images ──────────────────────────────────────────────────────────────────────────── */
/** Images Scryfall de la liste, lues en parallèle : [{ name, eur, im }]. */
const simgLoad = list => Promise.all((list || []).map(async c => ({ name: String(c && c.name || ''), eur: Number(c && c.eur) || 0, im: await simgImg(c && c.img) })));

async function simgDrawColl(x, s) {
  const top = await simgLoad((s.top || []).slice(0, 3));
  simgHead(x, simgDate(s.date)); simgFont(x, 650, 27, SIMG_FB); simgKicker(x, T('Ma collection Magic'), 232);
  simgAmount(x, s.value > 0 ? simgEur(s.value, s.value >= 1000) : '—', 372, 150);
  x.fillStyle = 'rgba(234,238,251,.78)'; simgFont(x, 500, 36, SIMG_FB);
  x.fillText(simgClip(x, [TN(s.n || 0, '{n} carte', '{n} cartes'), TN(s.copies || 0, '{n} exemplaire', '{n} exemplaires')].join(' · '), SIMG_W - 2 * SIMG_M), SIMG_M, 438);
  if (top.length) {
    x.fillStyle = SIMG_INK; simgFont(x, 700, 34, SIMG_FD); x.fillText(T('Les plus chères'), SIMG_M, 540);
    const listY = SIMG_H - 140 - (top.length - 1) * 52;
    simgFanIn(x, top, 572, listY - 50, 360);
    simgRanks(x, top, listY, 52);
  }
  simgFoot(x);
}
async function simgDrawDeck(x, s) {
  const [im] = await Promise.all([simgImg(s.img)]);
  if (im) {      // la carte, agrandie et floutée, en toile de fond
    x.save(); x.globalAlpha = 0.28; try { x.filter = 'blur(42px)'; } catch (e) { /* sans flou : plus discret encore */ } if (!x.filter || x.filter === 'none') x.globalAlpha = 0.12;
    x.drawImage(im, -180, 140, SIMG_W + 360, (SIMG_W + 360) * SIMG_RATIO); x.restore();
    x.fillStyle = 'rgba(11,15,28,.35)'; x.fillRect(0, 0, SIMG_W, SIMG_H); x.fillStyle = simgFoil(x, 0, SIMG_W); x.fillRect(0, 0, SIMG_W, 8);
  }
  simgHead(x, simgDate(s.date)); simgFont(x, 650, 27, SIMG_FB); simgKicker(x, T('Mon deck'), 232);
  x.fillStyle = SIMG_INK; simgFont(x, 800, 80, SIMG_FD); simgTrack(x, -1.5);
  const lines = simgWrap(x, s.name || 'Deck', SIMG_W - 2 * SIMG_M, 2); lines.forEach((l, i) => x.fillText(l, SIMG_M, 318 + i * 86)); simgTrack(x, 0);
  let y = 318 + (lines.length - 1) * 86 + 58;
  const pw = simgPips(x, s.colors, SIMG_M, y);
  if (s.sub) { x.fillStyle = 'rgba(234,238,251,.78)'; simgFont(x, 500, 32, SIMG_FB); x.fillText(simgClip(x, s.sub, SIMG_W - 2 * SIMG_M - pw - 12), SIMG_M + pw + (pw ? 12 : 0), y); }
  const cw = lines.length > 1 ? 420 : 460, top = y + 40, ch = cw * SIMG_RATIO, avail = 1112 - top;
  const w = ch > avail ? avail / SIMG_RATIO : cw;
  simgCard(x, im, SIMG_W / 2, top + w * SIMG_RATIO / 2, w, -3, s.cover || s.name);
  // valeur et nombre de cartes
  x.textAlign = 'left'; simgFont(x, 500, 26, SIMG_FB); x.fillStyle = SIMG_MUTE;
  x.fillText(T('Valeur estimée'), SIMG_M, 1170);
  x.textAlign = 'right'; x.fillText(T('Cartes'), SIMG_W - SIMG_M, 1170);
  x.textAlign = 'left'; simgFont(x, 800, 56, SIMG_FD);
  const v = s.value > 0 ? '≈ ' + simgEur(s.value, s.value >= 1000) + (s.part ? '+' : '') : '—'; x.fillStyle = simgFoil(x, SIMG_M, SIMG_M + x.measureText(v).width); x.fillText(v, SIMG_M, 1230);
  x.textAlign = 'right'; x.fillStyle = SIMG_INK; x.fillText((Number(s.n) || 0).toLocaleString(LOC()), SIMG_W - SIMG_M, 1230); x.textAlign = 'left';
  simgFoot(x);
}
async function simgDrawTrade(x, s) {
  const top = await simgLoad((s.top || []).slice(0, 3));
  simgHead(x, s.by ? simgClip(x, s.by, 420) : simgDate(s.date)); simgFont(x, 650, 27, SIMG_FB); simgKicker(x, T('Ma liste d\'échange'), 232);
  x.fillStyle = SIMG_INK; simgFont(x, 800, 76, SIMG_FD); simgTrack(x, -1.5);
  x.fillText(simgFit(x, TN(s.n || 0, '{n} carte à échanger', '{n} cartes à échanger'), 800, 76, 48, SIMG_FD, SIMG_W - 2 * SIMG_M), SIMG_M, 318); simgTrack(x, 0);
  x.fillStyle = 'rgba(234,238,251,.78)'; simgFont(x, 500, 34, SIMG_FB);
  const sub = [s.value > 0 ? '≈ ' + simgEur(s.value, s.value >= 1000) : '', s.want ? TN(s.want, '{n} carte recherchée', '{n} cartes recherchées') : ''].filter(Boolean).join(' · ');
  if (sub) x.fillText(simgClip(x, sub, SIMG_W - 2 * SIMG_M), SIMG_M, 378);
  if (top.length) { const listY = 960 - (top.length - 1) * 48; simgFanIn(x, top, 410, listY - 46, 300); simgRanks(x, top, listY, 48); }
  // QR code du lien public : modules noirs sur blanc (ce qu'attend un lecteur), dessinés depuis le chemin de qrSvg (net : un nombre entier de pixels par module)
  let q = null; try { q = s.url ? qrSvg(s.url) : null; } catch (e) { q = null; }
  if (q) {
    const box = 252, by = 1004, d = (/ d="([^"]+)"/.exec(q.svg) || [])[1] || '', k = Math.floor((box - 24) / q.n), side = k * q.n, pad = (box - side) / 2;
    x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 30; x.shadowOffsetY = 12; simgRR(x, SIMG_M, by, box, box, 26); x.fillStyle = '#fff'; x.fill(); x.restore();
    x.save(); x.translate(SIMG_M + pad, by + pad); x.scale(k, k); x.fillStyle = '#000'; x.fill(new Path2D(d)); x.restore();
    const tx = SIMG_M + box + 40, tw = SIMG_W - SIMG_M - tx;
    x.fillStyle = SIMG_INK; simgFont(x, 700, 38, SIMG_FD); simgWrap(x, T('Scanne pour voir toute ma liste'), tw, 2).forEach((l, i) => x.fillText(l, tx, by + 92 + i * 46));
    x.fillStyle = SIMG_MUTE; simgFont(x, 500, 24, SIMG_FB); x.fillText(simgClip(x, String(s.url).replace(/^https?:\/\//, ''), tw), tx, by + 172);
  }
  simgFoot(x);
}
async function simgDrawOpening(x, s) {
  const best = await simgLoad((s.best || []).slice(0, 5));
  simgHead(x, simgDate(s.date)); simgFont(x, 650, 27, SIMG_FB); simgKicker(x, T('Session d\'ouverture'), 232);
  x.fillStyle = SIMG_INK; simgFont(x, 800, 76, SIMG_FD); simgTrack(x, -1.5);
  const lines = simgWrap(x, s.name || T('Session d\'ouverture'), SIMG_W - 2 * SIMG_M, 2); lines.forEach((l, i) => x.fillText(l, SIMG_M, 316 + i * 82)); simgTrack(x, 0);
  // tuiles : valeur · payé · gain (ou valeur · cartes, sans prix payé)
  const paid = s.paid == null || s.paid === '' || !Number.isFinite(Number(s.paid)) ? null : Number(s.paid), val = Number(s.value) || 0, diff = paid == null ? null : val - paid;
  const tiles = paid == null ? [[T('Valeur'), simgEur(val), null], [T('Cartes'), (Number(s.n) || 0).toLocaleString(LOC()), null]]
    : [[T('Valeur'), simgEur(val), null], [T('Payé'), simgEur(paid), null], [diff >= 0 ? T('Gain') : T('Perte'), (diff >= 0 ? '+' : '−') + simgEur(Math.abs(diff)), diff >= 0 ? SIMG_GOOD : SIMG_BAD]];
  const ty = 316 + (lines.length - 1) * 82 + 48, gap = 16, tw = (SIMG_W - 2 * SIMG_M - gap * (tiles.length - 1)) / tiles.length, th = 136;
  tiles.forEach(([lab, v, col], i) => {
    const a = SIMG_M + i * (tw + gap);
    simgRR(x, a, ty, tw, th, 24); x.fillStyle = 'rgba(255,255,255,.07)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = SIMG_MUTE; simgFont(x, 500, 26, SIMG_FB); x.fillText(simgClip(x, lab, tw - 44), a + 22, ty + 44);
    const t = simgFit(x, v, 800, 46, 28, SIMG_FD, tw - 44); x.fillStyle = col || (i === 0 ? simgFoil(x, a + 22, a + 22 + x.measureText(t).width) : SIMG_INK); x.fillText(t, a + 22, ty + 106);
  });
  if (best.length) {
    const fy = ty + th + 64; x.fillStyle = SIMG_INK; simgFont(x, 700, 34, SIMG_FD); x.fillText(best.length > 1 ? T('Meilleures cartes') : T('Meilleure carte'), SIMG_M, fy);
    const listY = SIMG_H - 140 - (best.length - 1) * 44;
    simgFanIn(x, best, fy + 34, listY - 50, 360);
    simgRanks(x, best, listY, 44);
  }
  simgFoot(x);
}
const SIMG_DRAW = { coll: simgDrawColl, deck: simgDrawDeck, trade: simgDrawTrade, opening: simgDrawOpening };

/** Polices de la page, prêtes avant de dessiner (1,5 s au plus). */
async function simgFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return;
  const want = [`800 80px ${SIMG_FD}`, `700 40px ${SIMG_FD}`, `500 30px ${SIMG_FB}`, `700 30px ${SIMG_FB}`];
  await Promise.race([Promise.all(want.map(f => document.fonts.load(f).catch(() => null))), sleep(1500)]);
}
/** Dessine l'image d'un spec → Blob PNG 1080 × 1350 (rejette si la sorte est inconnue ou si le navigateur refuse l'export). */
async function simgRender(spec) {
  const draw = spec && SIMG_DRAW[spec.kind]; if (!draw) throw new Error('simg : sorte inconnue');
  await simgFonts();
  const c = document.createElement('canvas'); c.width = SIMG_W; c.height = SIMG_H;
  const x = c.getContext('2d'); x.textBaseline = 'alphabetic'; x.imageSmoothingQuality = 'high';
  // séparateur des milliers en français (espace fine insécable, U+202F) : absent des polices de la page, « 1235 € » sans espace → espace insécable ordinaire
  const nb = t => String(t).replace(/\u202f/g, '\u00a0'), ft = x.fillText.bind(x), mt = x.measureText.bind(x);
  x.fillText = (t, a, b, m) => (m === undefined ? ft(nb(t), a, b) : ft(nb(t), a, b, m)); x.measureText = t => mt(nb(t));
  simgBg(x); await draw(x, spec);
  const blob = await new Promise((ok, ko) => { try { c.toBlob(b => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'); } catch (e) { ko(e); } });
  c.width = c.height = 0;      // mémoire du canvas rendue tout de suite (téléphones modestes)
  return blob;
}

/* ── Feuille d'aperçu, partage, enregistrement ───────────────────────────────────────────────────── */
const SIMG_TITLES = { coll: 'Ma collection', deck: 'Mon deck', trade: 'Ma liste d\'échange', opening: 'Session d\'ouverture' };
const simgFile = kind => 'mana-orbit-' + kind + '-' + new Date().toISOString().slice(0, 10) + '.png';
/** Message joint au partage (le lien, s'il y en a un, va dans url). */
function simgText(s) {
  if (s.kind === 'deck') return T('{name} · deck Magic', { name: s.name || 'Deck' });
  if (s.kind === 'trade') return T('Ma liste d\'échange Magic');
  if (s.kind === 'opening') return T('{name} · session d\'ouverture Magic', { name: s.name || '' }) + ' · ' + SIMG_SITE;
  return T('Ma collection Magic sur Mana Orbit') + ' · ' + SIMG_SITE;
}
const simgNat = () => { const mo = typeof natPlugin === 'function' && natPlugin('ManaOrbit'); return mo || null; };
const simgB64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
/** Téléchargement (navigateur, PWA). */
function simgDownload(blob, name) {
  const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 4000);
  toast(T('Image téléchargée'));
}
/** APK sans les méthodes d'image : l'image en grand, à enregistrer par un appui long. */
function simgFull(url) {
  openSheet(T('Enregistrer l\'image'), T('Appui long sur l\'image pour l\'enregistrer'), api => {
    api.wrap.classList.add('simg-full-sheet');
    api.body.innerHTML = `<img class="simg-full" src="${esc(url)}" alt="${T('Image à partager')}">`;
  });
}
/** « Partager » : menu de partage du téléphone avec le fichier ; repli selon la plateforme (voir l'en-tête). */
async function simgSend(st) {
  const { blob, spec } = st, name = simgFile(spec.kind), text = simgText(spec), title = T(SIMG_TITLES[spec.kind] || 'Mana Orbit'), mo = simgNat();
  if (mo) {
    if (typeof mo.shareImage === 'function') {
      try { st.b64 = st.b64 || await simgB64(blob); await mo.shareImage({ data: st.b64, name, text: spec.url ? text + ' ' + spec.url : text, title, chooser: T('Partager') }); return 'native'; }
      catch (e) { /* coque qui refuse : repli ci-dessous */ }
    }
    if (spec.url && typeof shareOut === 'function') { shareOut({ title, text, url: spec.url }); return 'link'; }      // APK plus ancienne : le lien, par le partage habituel
    simgFull(st.url); return 'full';
  }
  let file = null; try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text: spec.url ? text + ' ' + spec.url : text }); return 'web'; }
    catch (e) { if (e && e.name === 'AbortError') return 'abort'; }      // abandon : rien ; autre refus : téléchargement
  }
  simgDownload(blob, name); return 'download';
}
/** « Enregistrer » : Photos (APK 1.0.4), sinon téléchargement ; APK plus ancienne : l'image en grand. */
async function simgSave(st) {
  const { blob, spec } = st, name = simgFile(spec.kind), mo = simgNat();
  if (mo) {
    if (typeof mo.saveImage === 'function') {
      try { st.b64 = st.b64 || await simgB64(blob); await mo.saveImage({ data: st.b64, name }); toast(T('Image enregistrée dans tes photos')); haptic('ok'); return 'native'; }
      catch (e) { /* Android 9 et moins, ou refus : l'image en grand */ }
    }
    simgFull(st.url); return 'full';
  }
  simgDownload(blob, name); return 'download';
}
/**
 * Point d'entrée (contrat ci-dessus) : feuille d'aperçu ouverte tout de suite (squelette), image dessinée, puis « Enregistrer » et « Partager » actifs.
 * Retourne { blob, w, h } une fois l'image prête, null en cas d'échec (message dans la feuille, jamais d'erreur dans la console).
 */
function simgShare(spec) {
  if (!spec || !SIMG_DRAW[spec.kind]) return Promise.resolve(null);
  const seq = ++SIMG.seq, st = { spec, blob: null, url: '', b64: '' };
  let api = null;
  openSheet(T('Image à partager'), T(SIMG_TITLES[spec.kind]), a => {
    api = SIMG.api = a; a.wrap.classList.add('simg-sheet');
    a.body.innerHTML = `<div class="simg-prev" data-st="wait"><div class="simg-sk" aria-hidden="true"><i></i></div><img alt="${esc(T('Aperçu de l\'image à partager'))}" hidden></div>
      <p class="hint simg-note" role="status">${T('Préparation de l\'image…')}</p>`;
    a.setFoot(`<button class="btn ghost" type="button" data-simg="save" disabled>${T('Enregistrer')}</button><button class="btn" type="button" data-simg="share" disabled>${T('Partager')}</button>`);
    a.foot.addEventListener('click', async e => {
      const b = e.target.closest('[data-simg]'); if (!b || !st.blob) return;
      haptic('tap');
      if (b.dataset.simg === 'share') await simgSend(st); else await simgSave(st);
    });
    const close = a.close; a.close = () => { close(); if (st.url) setTimeout(() => URL.revokeObjectURL(st.url), 600); if (SIMG.api === a) SIMG.api = null; };
  });
  return simgRender(spec).then(blob => {
    st.blob = blob; st.url = URL.createObjectURL(blob);
    if (seq === SIMG.seq && api && sheets.includes(api)) {
      const box = $('.simg-prev', api.body), img = $('img', box);
      img.onload = () => { box.dataset.st = 'ok'; img.hidden = false; };
      img.src = st.url;
      const mo = simgNat(), note = $('.simg-note', api.body);
      note.textContent = mo && typeof mo.shareImage !== 'function' && !spec.url ? T('Appui long sur l\'image pour l\'enregistrer') : T('1080 × 1350 px · prête pour WhatsApp, Instagram, Discord…');
      $$('[data-simg]', api.foot).forEach(x => { x.disabled = false; });
    }
    return { blob, w: SIMG_W, h: SIMG_H };
  }).catch(() => {
    if (api && sheets.includes(api)) { const box = $('.simg-prev', api.body); box.dataset.st = 'err'; $('.simg-note', api.body).textContent = T('Image impossible à créer sur cet appareil.'); }
    return null;
  });
}

/* ── Ce que chaque écran met dans l'image ────────────────────────────────────────────────────────── */
/** Stats de la collection : valeur (source affichée : Cardmarket, ou CardTrader si choisi), cartes, exemplaires, les 3 plus chères (prix d'un exemplaire). */
function simgColl() {
  const items = collAll().all; if (!items.length) { toast(T('Pas encore de cartes à montrer')); return null; }
  const ctOff = !(typeof ctReady === 'function' && ctReady()) && !items.some(i => i.rp > 0), st = collStats(items, ctOff ? 'cm' : COLL.src);
  const top = st.topUnit.slice(0, 3).map(i => ({ name: i.dn || i.n, img: collImage(i.k, i.l, i.im).src, eur: i.up / 100 }));
  return simgShare({ kind: 'coll', value: st.valued ? st.value / 100 : 0, n: st.unique, copies: st.copies, top, date: Date.now() });
}
/** Deck enregistré ({ id }) ou liste ({ text, name }) : nom, commandant ou format, couleurs, carte de présentation, valeur estimée (tendance Cardmarket), cartes. */
function simgDeckSpec(o) {
  const d = o && o.id ? findDeck(o.id) : null, text = d ? d.text : String((o && o.text) || ''), name = d ? d.name : String((o && o.name) || 'Deck');
  const pd = parseDeck(text), cmd = commanderKeys(text).map(k => pd.cards.find(c => c.key === k)).filter(Boolean), fk = dkFmtOf(text);
  const cv = dkCoverCard(text, dmOf), v = dkValue(text, dmOf);
  const ci = cmd.length ? [...new Set(cmd.flatMap(c => [...String((dmOf(ownKey(c.key)) || {}).ci || '')]))].join('') : '';
  const colors = [...'WUBRG'].filter(c => (ci || dkColors(text)).includes(c)).join('');
  const sub = cmd.length ? cmd.map(c => c.dn || c.name).join(' & ') : fk && DK_FORMATS[fk] ? DK_FORMATS[fk].label : '';
  return { kind: 'deck', name, sub, colors, img: cv ? coverUrl(cv) : '', cover: cv ? cv.name : '', value: v.known ? v.cents / 100 : 0, part: v.known > 0 && v.known < v.total, n: pd.copies, date: Date.now(), ...(o && o.url ? { url: o.url } : {}) };
}
const simgDeck = o => simgShare(simgDeckSpec(o));
/** Échange (lien actif) : doublons à échanger, valeur estimée, cartes recherchées, les 3 doublons les plus chers, QR code du lien public. */
function simgTrade() {
  if (!TR.share) return null;
  const st = TR.st || trState(), { rows, sum } = tradeView(st.have, { price: trPrice, sort: 'price', min: 0 });
  const top = rows.filter(r => r.u > 0).slice(0, 3).map(r => { const it = trItem(r.k, r.n, r.q, r.lines && r.lines[0] ? lineLang(r.lines[0][0]) : ''); return { name: it.dn || it.n, img: collImage(r.k, it.l, it.im).src, eur: r.u / 100 }; });
  return simgShare({ kind: 'trade', by: profShare().by || '', n: sum.n, copies: sum.q, value: sum.v / 100, want: st.want.length, top, url: shareUrl(TR.share), date: Date.now() });
}
