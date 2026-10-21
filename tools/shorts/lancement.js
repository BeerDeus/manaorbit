// Série de lancement (à charger après base.js) : instants calés sur la voix, écrans de l'appli, loupes, compteurs, orbites de mana, sous-titres, carte de fin.
// rendu.mjs injecte window.MOTS_VOIX (mots de voix.json avec leurs instants dans voix/<id>.wav, tools/shorts/mots.mjs) et window.MANA (symboles de mana).
// Instants : data-in / data-out / data-zin / data-zout = secondes (« 2.4 ») ou mot de la voix (« scannes », « tu#3 » = 3e « tu », « valent> » = fin du mot,
// « doublons+0.2 » = décalage) → variables CSS --in / --out / --zin / --zout. Sans voix : window.SOUS_TITRES = [[début, fin, 'texte <em>accent</em>'], …].
(() => {
  const DEC = window.DECALAGE_VOIX || 0, LANGUE = window.LANGUE || 'fr', SHOTS = '../../shots/video/';
  const MOTS = (window.MOTS_VOIX || []).map(m => ({ ...m, t0: m.t0 + DEC, t1: m.t1 + DEC }));
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").replace(/[^a-z0-9']/g, '');
  const temps = v => {
    if (/^-?[\d.]+$/.test(v)) return Number(v);
    const m = /^(.+?)(?:#(\d+))?(>)?([+-][\d.]+)?$/.exec(v), k = norm(m[1]);
    const hits = MOTS.filter(x => { const n = norm(x.w); return n === k || n.endsWith("'" + k); }), w = hits[(Number(m[2]) || 1) - 1];
    if (!w) throw new Error(`mot « ${v} » absent de la voix`);
    return (m[3] ? w.t1 : w.t0) + Number(m[4] || 0);
  };
  window.temps = temps;
  for (const [a, cssVar] of [['in', '--in'], ['out', '--out'], ['zin', '--zin'], ['zout', '--zout']])
    for (const e of document.querySelectorAll(`[data-${a}]`)) e.style.setProperty(cssVar, temps(e.dataset[a]).toFixed(3) + 's');
  const src = n => `${SHOTS}${LANGUE}-${n}.png`;

  // écrans de l'appli et loupes (capture 984 × 1584)
  for (const e of document.querySelectorAll('.ecr[data-src]')) e.innerHTML = `<img src="${src(e.dataset.src)}" alt="">`;
  for (const e of document.querySelectorAll('.loupe[data-src]')) {
    const [x, y, w, h] = e.dataset.crop.split(',').map(Number), W = parseFloat(e.style.width), s = W / w;
    Object.assign(e.style, { height: (h * s).toFixed(1) + 'px', backgroundImage: `url(${src(e.dataset.src)})`, backgroundSize: `${(984 * s).toFixed(1)}px auto`, backgroundPosition: `${(-x * s).toFixed(1)}px ${(-y * s).toFixed(1)}px` });
  }

  // symboles de mana (mêmes teintes que tools/flyer.mjs)
  const BG = { W: '#fffbd5', U: '#aae0fa', B: '#cbc2bf', R: '#f9aa8f', G: '#9bd3ae', C: '#cac5c0' };
  const mana = m => `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${BG[m] || BG.C}"/><path d="${(window.MANA || {})[m] || ''}" fill="#0d0f0f" transform="translate(4.8 4.8) scale(.7)"/></svg>`;
  window.mana = mana;
  for (const e of document.querySelectorAll('[data-mana-sym]')) e.innerHTML = mana(e.dataset.manaSym);

  // orbites : anneau + symboles ; deux calques (derrière / devant) pour passer derrière le téléphone ou le logo
  const orbites = root => {
    for (const e of root.querySelectorAll('.orbite[data-rx]')) {
      const rx = Number(e.dataset.rx), ry = Number(e.dataset.ry), syms = [...(e.dataset.mana || 'WUBRG')], d = `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0 A ${rx} ${ry} 0 0 0 ${-rx} 0`;
      const tour = parseFloat(getComputedStyle(e).getPropertyValue('--tour')) || 14;
      const ring = half => `<svg class="anneau" width="1" height="1"><path d="${half ? `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0` : `M ${rx} 0 A ${rx} ${ry} 0 0 0 ${-rx} 0`}" fill="none" stroke="rgba(154,163,184,${half ? .34 : .2})" stroke-width="3"/></svg>`;
      const back = e.cloneNode(false);
      back.classList.add('derriere'); e.classList.add('devant');
      const sym = (m, i, front) => `<i class="sym" style="offset-path:path('${d}');animation-name:${front ? 'tour-av' : 'tour-ar'};animation-delay:${(-tour * i / syms.length).toFixed(3)}s">${mana(m)}</i>`;
      e.innerHTML = ring(true) + syms.map((m, i) => sym(m, i, true)).join('');
      back.innerHTML = ring(false) + syms.map((m, i) => sym(m, i, false)).join('');
      e.parentNode.insertBefore(back, e.parentNode.firstElementChild?.classList.contains('bg') ? e.parentNode.firstElementChild.nextSibling : e.parentNode.firstChild);
    }
  };

  // carte de fin
  for (const e of document.querySelectorAll('.fin')) {
    e.innerHTML = `<div class="fond"></div><div class="orbite" data-rx="330" data-ry="96" data-mana="WUBRG" style="--y:560px;--deg:-16deg;--tour:9s;--s:76px"></div>
      <div class="logo2"><svg viewBox="0 0 512 512"><use href="#logo"/></svg></div><h1>Mana Orbit</h1>
      <div class="gp"><span>Gratuit sur Google Play</span></div>
      <p class="plus">iPhone et ordi : <b>manaorbit.app</b><br><i>Lien en bio</i></p>`;
  }
  orbites(document);

  // grain fixe (bruit pseudo-aléatoire à graine : même image à chaque rendu)
  { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256); let s = 7;
    for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = s >> 23; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); const g = document.createElement('div'); g.className = 'grain'; g.style.backgroundImage = `url(${c.toDataURL()})`; document.querySelector('.scene').appendChild(g); }

  // compteurs : data-de → data-a entre --in et --in + data-duree, data-dec décimales, data-suffixe
  const comptes = [...document.querySelectorAll('.compte')].map(e => ({ e, de: Number(e.dataset.de || 0), a: Number(e.dataset.a), t: temps(e.dataset.in || '0'), d: Number(e.dataset.duree || 1.2), dec: Number(e.dataset.dec || 0), suf: e.dataset.suffixe || '' }));
  const fmt = (v, dec) => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // sous-titres : groupes de 1 à 4 mots (coupés aux ponctuations, jamais après un petit mot), mot prononcé en couleur
  const PETITS = new Set(['de', 'a', 'tes', 'ton', 'ta', 'le', 'la', 'les', 'un', 'une', 'en', 'et', 'ce', 'que', 'qui', 'tu', 'il', 'sur', 'aux', 'du', 'des', 'se', 'ne', 'te', 'lui', 'leur', 'sans', 'dans', 'pas', 'est', 'elle', 'ca', 'je', 'au', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'chaque', 'tout']);
  const groupes = [];
  { let g = [];
    MOTS.forEach((m, i) => { g.push(m); const lettres = g.reduce((a, x) => a + x.w.length, 0), dernier = i === MOTS.length - 1;
      if (dernier || m.ponct || ((g.length >= 3 || lettres >= 15) && !PETITS.has(norm(m.w))) || g.length >= 4) { groupes.push(g); g = []; } }); }
  const st = document.createElement('div'); st.className = 'st'; st.innerHTML = '<p></p>'; document.querySelector('.scene').appendChild(st);
  const p = st.firstChild;
  const plages = groupes.map((g, i) => { const a = g[0].t0 - 0.06, n = groupes[i + 1], fin = g[g.length - 1].t1; return { g, a, b: n && n[0].t0 - 0.06 - fin < 0.5 ? n[0].t0 - 0.06 : fin + 0.4 }; });
  for (const [a, b, html] of window.SOUS_TITRES || []) plages.push({ a, b, html });
  let affiche = null;
  const sousTitres = t => {
    const r = plages.find(x => t >= x.a && t < x.b);
    if (r !== affiche) { affiche = r; p.innerHTML = !r ? '' : r.html || r.g.map(m => `<span>${m.w.replace(/ /g, '&nbsp;')}</span>`).join(' '); }
    if (!r) return;
    const k = Math.min(1, (t - r.a) / 0.16), e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);      // sortie de ressort
    p.style.opacity = Math.min(1, k * 1.6); p.style.transform = `scale(${(0.82 + 0.18 * e).toFixed(4)}) translateY(${((1 - k) * 24).toFixed(1)}px)`;
    if (r.g) [...p.children].forEach((s, i) => { const m = r.g[i], n = r.g[i + 1]; s.className = t >= m.t0 && (!n || t < n.t0) ? 'dit' : ''; });
  };

  const seek = window.seek;
  window.seek = ms => { seek(ms); const t = ms / 1000;
    for (const c of comptes) { const k = Math.max(0, Math.min(1, (t - c.t) / c.d)), e = 1 - Math.pow(1 - k, 3); c.e.textContent = fmt(c.de + (c.a - c.de) * e, c.dec) + c.suf; }
    sousTitres(t); };
})();
