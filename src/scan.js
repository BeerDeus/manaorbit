/* ── scan.js : reconnaître les noms de cartes par OCR ──────────────────────────────────────────────────────────
   Deux façons de scanner, même file d'attente (lecture en arrière-plan, une carte après l'autre) :
   · aperçu de l'appareil photo dans l'app : AUCUN calcul pendant l'aperçu ; le cercle prend la photo de la bande « nom · mana » ; on enchaîne ;
   · « Photos » (galerie, ou l'appareil photo du téléphone selon ce que propose le système) : photo de la carte entière en portrait, seul le tiers haut est lu.
   Seul le NOM est lu, puis comparé au catalogue Scryfall : on n'ajoute jamais le texte brut, toujours la carte officielle. Français d'abord (catalogue des noms imprimés Scryfall, local), puis anglais,
   puis, si rien n'est sûr, les autres langues (catalogue de l'appareil, sinon celui du serveur) ; la langue de la carte est enregistrée.
   ≥ 84 % de ressemblance = ajoutée (miniature Scryfall pour vérifier) · 72–84 % = à confirmer avec la miniature · en dessous = rien.
   Les photos ne sont jamais enregistrées : décodées au moment de la lecture, puis vidées (il ne reste, en mémoire le temps du scan, qu'une vignette de ~3 Ko de la zone lue et, pour les cartes à vérifier ou non reconnues, une photo lisible de la bande du nom).
   Tesseract.js est chargé à la demande depuis un CDN (modèle français d'abord, ≈ 3 Mo, gardé ensuite par le navigateur ; l'anglais seulement si le français ne trouve rien). */
const TESS_V = '5.1.1', CDN = 'https://cdn.jsdelivr.net/npm/';
const TESS = {
  js: `${CDN}tesseract.js@${TESS_V}/dist/tesseract.min.js`, worker: `${CDN}tesseract.js@${TESS_V}/dist/worker.min.js`, core: `${CDN}tesseract.js-core@${TESS_V}`,
  langs: { eng: `${CDN}@tesseract.js-data/eng/4.0.0_best_int`, fra: `${CDN}@tesseract.js-data/fra/4.0.0_best_int`, deu: `${CDN}@tesseract.js-data/deu/4.0.0_best_int`,
    spa: `${CDN}@tesseract.js-data/spa/4.0.0_best_int`, ita: `${CDN}@tesseract.js-data/ita/4.0.0_best_int`, por: `${CDN}@tesseract.js-data/por/4.0.0_best_int`, rus: `${CDN}@tesseract.js-data/rus/4.0.0_best_int`,
    jpn: `${CDN}@tesseract.js-data/jpn/4.0.0_best_int`, kor: `${CDN}@tesseract.js-data/kor/4.0.0_best_int`, chi_sim: `${CDN}@tesseract.js-data/chi_sim/4.0.0_best_int`, chi_tra: `${CDN}@tesseract.js-data/chi_tra/4.0.0_best_int` },      // japonais, coréen, chinois : ≈ 1,6 à 2 Mo chacun, seulement si une carte de cette langue est scannée
};
/** Moteur OCR de la langue des noms reconnus (collection.js › namesLang) ; lu d'abord, puis l'anglais. Cartes anglaises (aucun catalogue) : l'anglais seul. */
const TESS_OF = { fr: 'fra', de: 'deu', es: 'spa', it: 'ita', pt: 'por', ru: 'rus', jp: 'jpn', kr: 'kor', 'zh-CN': 'chi_sim', 'zh-TW': 'chi_tra' };
/** Moteurs d'une écriture non latine → langue des cartes : leurs lignes sont comparées aux noms imprimés de cette langue seulement (asiaMatch). */
const TESS_ASIA = { jpn: 'jp', kor: 'kr', chi_sim: 'zh-CN', chi_tra: 'zh-TW' };
/** Moteurs que ML Kit remplace dans l'appli Android (alphabet latin) ; russe, japonais, coréen, chinois : Tesseract, comme dans le navigateur. */
const NAT_OCR_OK = new Set(['eng', 'fra', 'deu', 'spa', 'ita', 'por']);
/** Moteurs dans l'ordre : langue imposée (réglages du scan), sinon langue du lot si elle a son propre moteur (pile de cartes japonaises : le japonais d'abord,
 *  puis la langue des noms de l'appli), sinon celle des noms ; l'anglais en dernier. */
const ocrLangs = () => {
  if (SCS.lang === 'en') return ['eng'];
  const n = TESS_OF[namesLang()], t = TESS_OF[SCS.lang] || TESS_OF[scanLotTop()] || n;
  return [...new Set([t, !SCS.lang ? n : '', 'eng'].filter(Boolean))];
};
const OCR = { lib: null, workers: {}, onProg: null };
/** Lettres admises dans un nom de carte : écarte les symboles de mana, filets et bruits que Tesseract prendrait pour du texte. */
const LETTERS = { eng: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,'’-:!", fra: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆàâäçéèêëîïôöùûüÿœæ ,'’-:!",
  deu: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß ,'’-:!", spa: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÑÓÚÜáéíñóúü¡¿ ,'’-:!",
  ita: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÈÉÌÍÒÓÙÚàèéìíòóùú ,'’-:!", por: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÇÉÊÍÓÔÕÚÜàáâãçéêíóôõúü ,'’-:!",
  rus: "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,'’-:!" };      // russe : cyrillique + latin (noms propres gardés en anglais sur certaines cartes)
function ocrLib() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve(Tesseract);
  if (!OCR.lib) OCR.lib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = TESS.js; s.async = true;
    s.onload = () => (typeof Tesseract !== 'undefined' ? res(Tesseract) : rej(Object.assign(new Error('OCR indisponible'), { code: 'cdn' })));
    s.onerror = () => { OCR.lib = null; rej(Object.assign(new Error('OCR indisponible'), { code: 'cdn' })); };
    document.head.appendChild(s);
  });
  return OCR.lib;
}
/** Un moteur OCR par langue (eng, fra), créé une fois : le modèle se télécharge à la première utilisation. */
function ocrWorker(lang) {
  if (!OCR.workers[lang]) OCR.workers[lang] = (async () => {
    const T = await ocrLib();
    const w = await T.createWorker(lang, 1, { workerPath: TESS.worker, corePath: TESS.core, langPath: TESS.langs[lang], logger: m => { if (OCR.onProg) OCR.onProg(m); } });
    return w;
  })().catch(e => { delete OCR.workers[lang]; throw e; });
  return OCR.workers[lang];
}
/** Lit une image (canvas) : lignes de texte [{ text }]. psm : '6' bloc (bande du nom) · '11' texte épars (carte entière). Seul le texte est demandé (pas de hocr/tsv/blocs). */
async function ocrLines(canvas, lang, psm, wl) {      // wl : caractères admis à la place des lettres d'un nom (ligne du bas : chiffres, majuscules, /)
  if (natOcr() && NAT_OCR_OK.has(lang)) { if (!canvas.__ml) canvas.__ml = natLines(canvas); try { return await canvas.__ml; } catch (e) { delete canvas.__ml; } }      // appli Android : ML Kit (repli Tesseract en cas d'erreur) ; ML Kit ne lit que l'alphabet latin : russe, japonais, coréen, chinois passent par Tesseract
  const w = await ocrWorker(lang), mode = psm || '6';
  const keep = wl != null ? wl : LETTERS[lang] || '';
  if (w.__psm !== mode || w.__wl !== keep) { await w.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: keep }); w.__psm = mode; w.__wl = keep; }
  const r = await w.recognize(canvas, {}, { text: true }), d = (r && r.data) || {};
  if ((w.__cnt = (w.__cnt || 0) + 1) >= 300 && OCR.workers[lang]) { delete OCR.workers[lang]; Promise.resolve(w.terminate()).catch(() => {}); }   // moteur recréé de temps en temps : la mémoire de WebAssembly ne fait que grossir
  return String(d.text || '').split(/\r?\n/).map(t => ({ text: t.trim() })).filter(l => l.text);
}
async function ocrStop() { const ws = Object.values(OCR.workers); OCR.workers = {}; for (const p of ws) { try { (await p).terminate(); } catch (e) { /* ignore */ } } }

/** Découpe une zone d'une source (vidéo, image, canvas), la met à largeur utile et la convertit en niveaux de gris contrastés
    (inversée si le fond est sombre ; pol : 1 = forcer l'inversion, 0 = ne pas inverser, absent = automatique). Le résultat porte .inv (choix fait). */
function prepCanvas(src, r, outW, pol) {
  const scale = Math.min(2.5, Math.max(outW / r.w, 0.4)), c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(r.w * scale)); c.height = Math.max(8, Math.round(r.h * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data, n = c.width * c.height, g = new Uint8Array(n), hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (a[j] * 77 + a[j + 1] * 150 + a[j + 2] * 29) >> 8; g[i] = v; hist[v]++; sum += v; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const span = Math.max(48, hi - lo), inv = pol === undefined || pol === null ? sum / n < 105 : !!pol;
  for (let i = 0, j = 0; i < n; i++, j += 4) { let v = (g[i] - lo) * 255 / span; v = v < 0 ? 0 : v > 255 ? 255 : v; if (inv) v = 255 - v; a[j] = a[j + 1] = a[j + 2] = v; a[j + 3] = 255; }
  ctx.putImageData(d, 0, 0);
  const m = 18, o = document.createElement('canvas'); o.width = c.width + 2 * m; o.height = c.height + 2 * m;     // marge blanche : Tesseract lit mal un texte collé au bord de l'image
  const ox = o.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, o.width, o.height); ox.drawImage(c, m, m); o.inv = inv;
  return o;
}

/* ── Écran de scan ────────────────────────────────────────────────────────────────────────────── */
/** Aide du scan : fermée au départ, « ? » l'ouvre et la referme. */
function scNoteShow(on) { const n = $('.sc-note', SC.el), h = $('.sc-help', SC.el); if (n) n.hidden = !on; if (h) h.setAttribute('aria-pressed', String(on)); }
const SC = { sets: new Map(), setN: 0, lastIt: null, warm: false, el: null, stream: null, items: new Map(), miss: [], mid: 0, pend: [], queue: [], working: false, cap: 0, session: 0, alive: false, hintT: 0, watch: null, fpsMin: 10, fps: 0, fixed: false, gen: 0, rbusy: false, rf: { n: 0, at: 0 }, restarts: 0, workEnd: 0, slowN: 0, ms: 0, diagT: 0, lt: [], pr: new Map(), prq: new Map(), stick: '', lv: [] };
const camSlow = () => { try { return localStorage.getItem('deckdeal:cam2') === 'slow'; } catch (e) { return false; } };      // 'cam2' : l'ancien indicateur (posé quand la lecture tournait pendant l'aperçu) est abandonné
const camSetSlow = on => { try { localStorage.removeItem('deckdeal:cam'); if (on) localStorage.setItem('deckdeal:cam2', 'slow'); else localStorage.removeItem('deckdeal:cam2'); } catch (e) { /* ignore */ } };

/** Miniature officielle de Scryfall (vérification visuelle : on voit tout de suite si c'est la bonne carte). */
const scImg = n => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n) + '&format=image&version=small';
/** Identifiant d'une ligne du scan : carte + langue + édition (scaned.js). */
const scanId = (key, l, e) => key + '|' + (l || '') + (e ? '|' + e : '');
/** Change la langue d'une ligne du scan ; si la carte existe déjà dans cette langue (même édition), les exemplaires s'y ajoutent. L'ordre de la liste est gardé.
 *  Impressions relues dans la nouvelle langue : l'édition reste (image de cette langue), ou se décide si elle n'était pas posée. */
function scanSetLang(it, l) {
  if ((it.l || '') === l) return;
  it.l = l; if (!it.e) { it.es = 'load'; it.pk = null; }
  scanEdNeed(scanRekey(it, scanId(it.key, l, it.e)));
}
function scanTotals() { let n = 0, maybe = 0; for (const e of SC.items.values()) { if (e.maybe) maybe++; else n += e.q; } return { n, maybe }; }
/** Langue imposée dans les réglages du scan (scanset.js) : la carte lue prend cette langue (image de cette langue demandée à Scryfall). */
function scanLangOf(m) {
  if (!SCS.lang || m.card === SCS.lang) return m;
  if (SCS.lang !== 'en') langImgFor(m.key, m.name, SCS.lang);
  return { ...m, card: SCS.lang, img: '', via: '' };
}
function scanAdd(m, d, maybe, shot) {
  m = scanLangOf(m);
  const l = m.card || 'en', ed = scanEdNew(m.key, m.name, l, maybe, m.ft, m.sig);
  let id = scanId(m.key, l, ed.e), cur = SC.items.get(id);
  const artq = !!m.sig && !['read', 'solo', 'off', 'none'].includes(ed.es);      // illustration à comparer (scanart.js) : l'édition peut encore changer
  if (cur && ((m.ft && !ed.e && ed.es === 'load') || artq)) { id += '#' + (++SC.mid); cur = null; }      // ligne du bas ou illustration à lire, édition pas encore sûre : sa propre ligne, rangée avec son édition ensuite (scanEdApply, scanArtRun)      // une ligne par carte, langue ET édition : la même carte lue en français puis en anglais fait deux lignes
  if (m.img && l !== 'en') { COLL.li[liKey(l, m.key)] = m.img; collMetaSave(); }       // image de la carte dans sa langue, vue pendant la lecture : gardée pour la collection
  else if (m.via && l !== 'en') langImgFor(m.key, m.name, l);      // trouvée sur l'appareil (catalogue sans images) : celle de sa langue demandée à Scryfall, l'anglaise en attendant
  if (cur) { SC.items.delete(id); SC.items.set(id, cur); SC.lastIt = cur; cur.q = Math.max(1, cur.q + d); if (m.ft && !cur.ft) cur.ft = m.ft; if (!maybe) { cur.maybe = false; cur.shot = ''; } else if (cur.maybe && shot) cur.shot = shot; if (m.score > cur.score) { cur.score = m.score; cur.raw = m.raw; } if (m.via) cur.via = m.via; }
  else { const it = { id, key: m.key, name: m.name, q: Math.max(1, d), score: m.score, raw: m.raw, maybe: !!maybe, l, shot: maybe ? shot || '' : '', via: m.via || '', e: ed.e, es: ed.es, pk: ed.pk, nx: false, ft: m.ft || null, sig: m.sig || null, sym: (artq && m.sym) || null, artq, lot: !!m.lot, ambBy: m.ambBy || '', alts: m.amb || m.ambBy ? m.alts || null : null }; SC.items.set(id, it); SC.lastIt = it; if (ed.es === 'load') scanEdNeed(it); }      // via : langue trouvée par la recherche des autres langues
  if (d > 0 && SC.lastIt) SC.lastIt.fly = Date.now();      // carte ajoutée : son symbole d'édition descendra dans la liste dès que l'édition est connue (scanFlyCheck)
  if (ed.e) scanEdPass();      // une édition posée : les cartes « à choisir » sont revues
  scanPaintList();
  if (artq) scanArtRun();
}
/** Nom imprimé de plusieurs cartes : un bouton par autre carte possible (« Plutôt Way of the Pyromancer »). */
function scanAltsHtml(e) {
  const o = Array.isArray(e.alts) ? e.alts.filter(n => ownKey(n) !== e.key) : [];
  return o.length ? `<span class="sc-alts">${o.map(n => `<button type="button" class="tag sc-alt" data-a="alt" data-n="${esc(n)}">${T('Plutôt {name}', { name: esc(n) })}</button>`).join('')}</span>` : '';
}
/** « Plutôt … » : la ligne devient l'autre carte (confirmée), son édition est relue. */
function scanAltPick(it, name) {
  if (!name || !Array.isArray(it.alts) || !it.alts.includes(name)) return;
  Object.assign(it, { key: ownKey(name), name, maybe: false, shot: '', ambBy: 'man', e: '', es: 'load', pk: null, artq: false, sig: null, ft: null });
  const nit = scanRekey(it, scanId(it.key, it.l, '') + '#' + (++SC.mid)); SC.lastIt = nit;
  scanEdNeed(nit); scanPaintList();
}
/** Carte du scan pour la visionneuse (appui sur sa miniature) : image dans sa langue si Scryfall l'a donnée, sinon anglaise ; photo prise au scan si la carte est « à vérifier ». */
function scanViewItem(e) {
  const l = e.l || 'en', u = scanThumb(e), pk = e.pk, lang = pk ? ({ ja: 'jp', zhs: 'zh-CN' }[pk.l] || pk.l || 'en') : l !== 'en' && COLL.li[liKey(l, e.key)] ? l : 'en', rn = scanReadNote(e, !!(e.raw && e.score < 0.97));
  return { key: e.key, lid: e.id || e.key, name: scanShown(e), ln: e.name, wl: l !== 'en' && lang === 'en' ? l : '', small: u, big: pk ? pk.urls[0] || pk.th : lang === 'en' ? 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(e.name) + '&format=image&version=large' : '', lang, plain: true, shot: e.maybe ? e.shot || '' : '',
    extra: TN(e.q, '{n} exemplaire', '{n} exemplaires') + (e.e ? ' · ' + [(pk && pk.sn) || setName(edSet(e.e)), edLabel(e.e)].filter(Boolean).join(' ') : '') + (e.maybe ? ' · ' + T('à vérifier') : '') + (l !== 'en' && lang === 'en' ? ' · ' + T('image anglaise (pas encore d\'image {lang})', { lang: LANGS[l] || l }) : '') + (rn ? ' · ' + rn : '') };
}
/** Texte lu d'une ligne du scan (« lu « … » ») ; carte trouvée dans une autre langue que celle de l'appli, tant qu'elle garde cette langue : « lu en italien ». h : échappement HTML. */
function scanReadNote(e, raw, h = x => x) {
  if (e.via === 'foot') return T('retrouvée par la ligne du bas');      // nom illisible : extension et numéro (footIdentify)
  if (e.ambBy === 'man') return '';
  if (e.ambBy) return e.ambBy === 'foot' ? T('nom de plusieurs cartes : celle-ci d\'après la ligne du bas') : T('nom de plusieurs cartes : celle-ci d\'après l\'illustration');      // « Voie de la pyromancienne » (scanAmbArt, footIdentify)
  if (e.alts && e.alts.length > 1) return T('nom de plusieurs cartes : {list}', { list: e.alts.join(' · ') });
  if (e.lot) return T('langue du lot ({lang}) : nom identique d\'une langue à l\'autre', { lang: LANGS[e.l] || e.l });      // scanLotLang
  const v = e.via && e.via === e.l ? LANGS[e.via] || e.via : '';
  if (!v) return raw ? T('lu « {raw} »', { raw: h(e.raw || '') }) : '';
  return raw ? T('lu en {lang} : « {raw} »', { lang: v, raw: h(e.raw || '') }) : T('lu en {lang}', { lang: v });
}
/** Miniature d'une carte du scan : dans sa langue si Scryfall l'a donnée, sinon l'image anglaise. */
function scanThumb(e) { if (e.pk && e.pk.th) return e.pk.th; const u = e.l && e.l !== 'en' ? COLL.li[liKey(e.l, e.key)] : ''; return u || scImg(e.name); }      // édition posée : l'image de cette impression
function scanPaintList() {
  const el = SC.el; if (!el) return;
  const list = $('.sc-list', el), arr = [...SC.items.values()].reverse(), t = scanTotals();
  if (document.activeElement && document.activeElement.matches && document.activeElement.matches('.lchip select') && list.contains(document.activeElement)) { SC.dirty = true; return; }      // un choix de langue est ouvert : on ne le ferme pas, la liste se met à jour après
  const th = u => (u ? `<img class="sc-th" alt="" src="${esc(u)}">` : '<span class="sc-th"></span>');
  const pend = SC.pend.map((p, k) => `<div class="sc-item pend" data-p="${p.id}">${th(p.thumb)}<span class="sc-n"><b>${T('Lecture…')}</b><small>${esc(p.label)}${k ? ' · ' + T('{n} avant', { n: k }) : ''}</small></span><span class="sc-spin" aria-hidden="true"></span></div>`).join('');
  const pic = u => (u ? `<span class="sc-pic"><img alt="${T('Ta photo')}" src="${esc(u)}"><i>${T('Ta photo')}</i></span>` : '');
  const miss = SC.miss.map(m => `<div class="sc-item miss" data-m="${m.id}">${pic(m.shot)}${th(m.thumb)}<span class="sc-n"><b>${esc(m.label)}</b><small>${T('Nom non reconnu')}${m.raw ? ' · ' + T('lu « {raw} »', { raw: esc(m.raw) }) : ''}</small>${typeof srMissBtn === 'function' ? srMissBtn(m) : ''}</span><button type="button" class="btn ghost small" data-a="type">${T('Saisir')}</button><button type="button" class="sc-x" data-a="rm" aria-label="${T('Ignorer {name}', { name: esc(m.label) })}"><svg class="i"><use href="#i-close"/></svg></button></div>`).join('');
  const head = (count, sub) => { $('.sc-count', el).textContent = count; $('.sc-sub', el).textContent = sub; };
  if (SC.pm) {      // prix rapide : la liste montre des prix, rien à ajouter
    list.innerHTML = pend + miss + (SC.pq.length ? SC.pq.map(scanPriceRow).join('') : pend || miss ? '' : '<p class="hint sc-empty">' + T('Prix rapide : cadre une carte et appuie sur le cercle. Tu vois sa tendance Cardmarket et l\'offre CardTrader la moins chère ; rien n\'est ajouté à ta collection (le bouton + le fait si tu la gardes).') + '</p>');
    $('.sc-head [data-act="done"]', el).hidden = true;
    head(T('Prix rapide'), SC.pq.length ? TN(SC.pq.length, '{n} carte lue', '{n} cartes lues') : T('Rien n\'est ajouté à ta collection'));
    const tot = $('.sc-total', el); tot.hidden = !SC.pq.length; if (SC.pq.length) tot.innerHTML = scanLotHtml(scanLot());
    const prog = $('.sc-prog', el); prog.hidden = !SC.pend.length; prog.textContent = TN(SC.pend.length, '{n} en lecture', '{n} en lecture');
    return;
  }
  $('.sc-head [data-act="done"]', el).hidden = false; $('.sc-total', el).hidden = true;
  const ae = document.activeElement, keep = ae && ae !== list && list.contains(ae) ? { row: ae.closest('.sc-item'), a: ae.dataset.a, cls: ae.classList[0] } : null;      // focus clavier dans la liste : rendu à son équivalent après le repeint (éditions qui arrivent…)
  const row = e => `<div class="sc-item${e.maybe ? ' maybe' : ' ed'}${e === SC.lastIt ? ' last' : ''}" data-k="${esc(e.key)}" data-id="${esc(e.id)}">${e.maybe ? pic(e.shot) : ''}<img class="sc-th" alt="" loading="lazy" decoding="async" src="${esc(scanThumb(e))}"${zoomAt('scan', scanShown(e))}><span class="sc-n"><span class="sc-top"><b>${esc(scanShown(e))}</b>${langChip(e.key, e.l || '', e.name)}${!e.maybe && e.fq > 0 ? `<span class="tag foil sc-foil" title="${esc(TN(Math.min(e.fq, e.q), '{n} exemplaire foil', '{n} exemplaires foil'))}">✦ ${e.fq >= e.q ? T('Foil') : nf0(e.fq)}</span>` : ''}</span>${e.maybe ? `<small>${T(e.shot ? 'À vérifier : ta photo ci-dessus est-elle bien celle-ci ?' : 'À vérifier : ta carte est-elle bien celle-ci ?')} · ${scanReadNote(e, true, esc)}</small>` : (n => (n ? `<small>${n}</small>` : ''))(scanReadNote(e, !!(e.score < 0.97 && e.raw), esc))}${scanAltsHtml(e)}</span>
      ${e.maybe ? `<button type="button" class="sc-ok" data-a="ok" aria-label="${T('Confirmer {name}', { name: esc(e.name) })}"><svg class="i"><use href="#i-check"/></svg></button>` : `${scanEdBtn(e)}<span class="qstep"><button type="button" data-a="dec" aria-label="${T('Retirer un exemplaire')}">−</button><b>${e.q}</b><button type="button" data-a="inc" aria-label="${T('Ajouter un exemplaire')}">+</button></span>`}
      <button type="button" class="sc-x" data-a="del" aria-label="${T('Retirer {name}', { name: esc(e.name) })}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
  const maybe = arr.filter(x => x.maybe), todo = arr.filter(scanEdIsTodo), rest = arr.filter(x => !x.maybe && !scanEdIsTodo(x)), many = (maybe.length ? 1 : 0) + (todo.length ? 1 : 0) + (rest.length ? 1 : 0) > 1;      // à vérifier, puis éditions à choisir, puis le reste (dernière lue en haut)
  const sec = (h, cls, rows) => (rows.length ? (many ? `<p class="sc-h${cls}">${esc(h)}</p>` : '') + rows.map(row).join('') : '');
  const ask = scanEdAsk();
  list.innerHTML = (ask ? scanEdAskHtml(ask) : '') + pend + miss + (arr.length ? sec(T('À vérifier'), ' warn', maybe) + sec(TN(todo.reduce((a, x) => a + x.q, 0), '{n} édition à choisir', '{n} éditions à choisir'), ' todo', todo) + sec(T('Dans le scan'), '', rest)
    : pend || miss ? '' : '<p class="hint sc-empty">' + T('Les cartes reconnues apparaîtront ici avec leur miniature Scryfall. Tu peux corriger les quantités avant d\'ajouter.') + '</p>');
  if (keep && keep.row) {
    const rows = [...list.querySelectorAll('.sc-item')], r = (keep.row.dataset.id && rows.find(x => x.dataset.id === keep.row.dataset.id)) || rows.find(x => x.dataset.k && x.dataset.k === keep.row.dataset.k);
    const f = r && (keep.a ? $(`[data-a="${keep.a}"]`, r) : keep.cls ? $('.' + CSS.escape(keep.cls), r) : null); if (f) f.focus({ preventScroll: true });
  }
  const go = $('.sc-head [data-act="done"]', el);
  go.disabled = !t.n; go.textContent = SC.deck ? T('Au deck') : T('Ajouter');      // mode deck (builder.js › bdScan) : les cartes vont dans le deck
  const td = scanEdTodo(), nTodo = td.n - td.load;
  let val = 0; for (const x of SC.items.values()) { if (x.maybe) continue; const eu = pkEu(x.pk) || ((COLL.meta[x.key] || {}).eu > 0 ? COLL.meta[x.key].eu : 0); val += eu * x.q; }
  head(TN(t.n, '{n} carte', '{n} cartes'), SC.items.size ? [val > 0 ? '≈ ' + fmt(val, 'EUR') : '', t.maybe ? T('{n} à vérifier', { n: t.maybe }) : '', nTodo ? TN(nTodo, '{n} édition à choisir', '{n} éditions à choisir') : ''].filter(Boolean).join(' · ') || TN(t.n, '{n} reconnue', '{n} reconnues') : scanFull() ? T('Carte entière dans le cadre') : T('Nom de la carte dans la bande'));
  if (SC.remote) { go.disabled = false; go.textContent = T('Terminer'); mobSync(); scanPaintRemote(); }      // scan mobile : chaque carte (et chaque correction) part vers le PC
  const prog = $('.sc-prog', el); prog.hidden = !SC.pend.length; prog.textContent = TN(SC.pend.length, '{n} en lecture', '{n} en lecture');
  if (SC.recap) SC.recap();
  if (SC.ef) SC.ef();      // écran « Éditions à choisir » : les éditions arrivent
  scanFlyCheck();
}
/** Boutons de l'écran de scan qui suivent les réglages (scanset.js) : pastille des éditions. */
/** Mode deck (builder.js › bdScan) : « Deck : <nom> », l'emplacement où les cartes sont rangées à l'enregistrement du deck ('' hors mode deck). */
const scanDeckPlace = () => (SC.deck && typeof BD !== 'undefined' && BD.el ? T('Deck : {name}', { name: BD.name.trim() || T('Deck') }) : '');
function scanPaintTools() {
  const el = SC.el; if (!el) return;
  const b = $('.sc-edm', el); if (b) { b.innerHTML = `<span class="sc-edm-t">${esc(scsEdLabel())}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg>${typeof MS_GEAR === 'string' ? MS_GEAR : ''}`; b.setAttribute('aria-label', T('Réglages du scan') + ' · ' + scsEdLabel()); b.title = scsEdLabel(); }      // roue (masterset.js) : pastille réduite à côté de « Ranger dans »
  const d = $('.sc-dest', el), dk = scanDeckPlace();
  if (d && dk) { d.hidden = false; d.innerHTML = `<i style="--c:#c79bff"></i><span>${esc(dk)}</span>`; d.setAttribute('aria-label', T('Ranger dans') + ' · ' + dk); }      // mode deck : l'emplacement du deck, pas celui du scan
  else if (d) { d.hidden = !scdSet(); d.innerHTML = `<i style="--c:${SCD.x ? '#c79bff' : plcColor(scdPlace())}"></i><span>${esc(scdLabel())}</span>`; d.setAttribute('aria-label', T('Ranger dans') + ' · ' + scdLabel()); }      // pastille « Ranger dans » : seulement si le scan range ailleurs
  if (b && d) b.classList.toggle('ico', !d.hidden);      // « Ranger dans » affiché : plus la place pour « Éditions : comme la 1re » (coupé en « comme ») → la roue des réglages seule
  auSync();      // scan automatique : interrupteur, cercle, lecture en continu (scanauto.js)
}
/** Fiche récap au tap sur « Ajouter » : exemplaires, valeur estimée Cardmarket, les plus chères, nouvelles / déjà possédées, langues. Suit la liste du scan en direct ; « Ajouter » dans la fiche fait l'ajout. Les prix des cartes pas encore lues par Scryfall sont lus ici (un lot). */
/** Cartes lues du scan (pas celles « à vérifier ») : { k, n, q, f (exemplaires foil), l, e, p (édition posée et son impression, scaned.js) }. */
const scanLive = () => [...SC.items.values()].filter(x => !x.maybe).map(x => ({ k: x.key, n: x.name, q: x.q, f: Math.min(x.fq || 0, x.q), l: x.l || '', e: x.e || '', p: x.e ? x.pk : null }));
function scanRecap() {
  const live = scanLive;
  /** Une ligne du scan en lignes de la collection : les non foil, puis les foil (même langue, même édition). */
  const byFoil = x => [{ ...x, q: x.q - x.f, f: 0 }, { ...x, q: x.f, f: 1 }].filter(y => y.q > 0);
  if (!live().length || sheets.some(x => x.wrap.classList.contains('rc-sheet'))) return;
  const asked = new Set(), got = new Map(); let err = '', busy = false, sure = false;      // sure : « Ajouter » touché avec des cartes sans édition → confirmation
  const info = k => (got.has(k) ? got.get(k) : COLL.meta[k]);      // undefined : pas encore lu · null : inconnue de Scryfall · objet { eu, … }
  const api = openSheet(T('Ajouter'), '', a => { a.wrap.classList.add('rc-sheet'); a.body.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true); });      // les miniatures n'apparaissent qu'une fois chargées (classe ok)
  const paint = () => {
    if (!sheets.includes(api)) { if (SC.recap === hook) SC.recap = null; return; }
    const items = live(); if (!items.length) { api.close(); return; }
    const n = items.reduce((a, x) => a + x.q, 0);
    let val = 0, priced = 0, nopx = 0, wait = 0; const rows = [];
    for (const x of items) {
      const pe = pkEu(x.p); if (pe > 0) { val += pe * x.q; priced += x.q; rows.push({ x, eu: pe }); continue; }      // prix de l'édition posée
      const m = info(x.k);
      if (m === undefined) { if (!err) wait += x.q; else nopx += x.q; }
      else if (m && m.eu > 0) { val += m.eu * x.q; priced += x.q; rows.push({ x, eu: m.eu }); }
      else nopx += x.q;
    }
    const uniq = new Set(items.map(x => x.k)), haveK = new Set([...uniq].filter(k => collQty(k) > 0)), have = items.filter(x => haveK.has(x.k)), haveN = have.reduce((a, x) => a + x.q, 0), langs = new Map();
    for (const x of items) langs.set(x.l, (langs.get(x.l) || 0) + x.q);
    const td = scanEdTodo(), edN = items.reduce((a, x) => a + (x.e ? x.q : 0), 0); if (!td.n) sure = false;
    rows.sort((a, b) => b.eu - a.eu || byName(a.x, b.x));
    $('h2', api.wrap).textContent = TN(n, 'Ajouter {n} carte', 'Ajouter {n} cartes'); let sub = $('.sheet-head p', api.wrap);
    if (!sub) { sub = document.createElement('p'); $('.sheet-head > div', api.wrap).appendChild(sub); } sub.textContent = TN(uniq.size, '{n} carte différente', '{n} cartes différentes');
    const note = wait ? T('Lecture des prix…') : !nopx ? '' : err ? T(priced ? 'Valeur partielle : {err}.' : 'Prix indisponibles : {err}.', { err }) : TN(nopx, '{n} exemplaire sans prix Cardmarket, non comptés.', '{n} exemplaires sans prix Cardmarket, non comptés.');
    api.body.innerHTML = `<div class="rc">${typeof opnRcNote === 'function' ? opnRcNote() : ''}${SC.lot || (typeof opnOn === 'function' && opnOn()) ? '' : scdRowHtml()}${sure ? `<p class="rc-ask" role="alert"><b>${esc(TN(td.n, '{n} carte n\'a pas d\'édition.', '{n} cartes n\'ont pas d\'édition.'))}</b> ${esc(td.load ? T('Lecture des éditions…') : T('Ajoutées sans édition : tu pourras la choisir plus tard dans ta collection.'))}</p>` : ''}<div class="cs-tiles"><div><b>${nf0(uniq.size)}</b><span>${TN(uniq.size, 'carte différente', 'cartes différentes')}</span></div><div><b>${nf0(n)}</b><span>${TN(n, 'exemplaire', 'exemplaires')}</span></div><div class="rc-val"><b>${wait || (!priced && err) ? (wait ? '…' : '—') : priced ? esc(fmt(val, 'EUR')) : '—'}</b><span>${T('valeur estimée · tendance Cardmarket')}</span></div></div>
      ${note ? `<p class="hint rc-note">${esc(note)}</p>` : ''}
      ${rows.length && !wait ? `<h3 class="cs-h">${T('Les plus chères')}</h3><div class="cs-top">${rows.slice(0, 3).map(({ x, eu }) => `<div class="crow ro" data-k="${esc(x.k)}" data-n="${esc(x.n)}" data-q="${x.q}" data-ln="${esc(x.l)}"><span class="thumb" style="--h:${hash32(x.k) % 360}"${zoomAt('rc', x.n)}>${esc((x.n.trim()[0] || '?').toUpperCase())}<img alt="" loading="lazy" decoding="async" src="${esc(scanThumb({ key: x.k, name: x.n, l: x.l, pk: x.p }))}"></span><span class="row-main"><span class="row-name">${esc(x.n)}</span><span class="row-meta">${x.e ? `<span class="tag ed">${setIcHtml(edSet(x.e))}${esc(edLabel(x.e))}</span>` : ''}${x.q > 1 ? `<span class="tag accent">× ${nf0(x.q)}</span>` : ''}</span></span><span class="row-price"><b>${esc(fmt(eu, 'EUR'))}</b>${x.q > 1 ? `<small>${T('{p} le lot', { p: esc(fmt(eu * x.q, 'EUR')) })}</small>` : ''}</span></div>`).join('')}</div>` : ''}
      <dl class="rc-facts"><div><dt>${T('Nouvelles dans ta collection')}</dt><dd>${TN(uniq.size - haveK.size, '{n} carte', '{n} cartes')}</dd></div>
        <div><dt>${T('Déjà possédées')}</dt><dd>${haveK.size ? TN(haveK.size, '{n} carte', '{n} cartes') + ' · ' + T('+{n} ex.', { n: nf0(haveN) }) : T('aucune')}</dd></div>
        <div><dt>${T('Éditions')}</dt><dd>${SCS.ed === 'none' && !edN ? T('sans (réglage du scan)') : td.n ? esc(TN(td.n, '{n} sans édition', '{n} sans édition')) + (edN ? ' · ' + esc(TN(edN, '{n} posée', '{n} posées')) : '') : T('toutes posées')}</dd></div>
        <div><dt>${T('Langues')}</dt><dd>${[...langs].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l ? esc(langCode(l)) : T('Langue ?')} × ${nf0(c)}`).join(' · ')}</dd></div></dl></div>`;
    api.setFoot(sure ? `<button class="btn ghost" type="button" data-rc="pick">${T('Choisir les éditions')}</button><button class="btn" type="button" data-rc="force">${T('Ajouter quand même')}</button>`
      : `<button class="btn ghost" type="button" data-close>${T('Retour')}</button><button class="btn" type="button" data-rc="go">${TN(n, 'Ajouter {n} carte', 'Ajouter {n} cartes')}</button>`);
  };
  const ask = async () => {
    if (busy || !sheets.includes(api)) return;
    const seen = new Set(), todo = live().filter(x => info(x.k) === undefined && !asked.has(x.k) && !seen.has(x.k) && seen.add(x.k)); if (!todo.length) return;
    todo.forEach(x => asked.add(x.k));
    if (scryLeft() > 0) { err = T('Scryfall demande une pause'); paint(); return; }
    busy = true;
    try { const r = await scryCollection(todo.map(x => x.n)); for (const x of todo) got.set(x.k, r.get(x.k) || null); err = ''; }
    catch (e) { err = T('Scryfall injoignable'); }
    busy = false; paint(); ask();
  };
  const hook = () => { paint(); ask(); };
  api.body.addEventListener('click', e => { if (e.target.closest('[data-rcd]')) scdPick(() => { paint(); scanPaintTools(); }); });      // « Ranger dans » (places.js)
  api.foot.addEventListener('click', e => {
    const b = e.target.closest('[data-rc]'); if (!b) return;
    if (b.dataset.rc === 'pick') { api.close(); SC.recap = null; scanEdFocus(); return; }
    if (b.dataset.rc === 'go' && scanEdTodo().n) { sure = true; haptic('tap'); paint(); return; }      // cartes sans édition : on demande d'abord
    const items = live(); if (!items.length) return;
    if (typeof prgScan === 'function') prgScan([...SC.items.values()].filter(x => !x.maybe));      // niveau et badges (progress.js) : cartes, langues, éditions lues…
    const before = COLL.map, n = items.reduce((a, x) => a + x.q, 0);
    if (typeof opnTake === 'function' && opnTake(items.flatMap(byFoil).map(x => ({ k: x.k, n: x.n, q: x.q, l: lineKey(x.l, x.e, !!x.f), p: x.e ? x.p : null })), { toast: true })) {      // session d'ouverture (opening.js) : les cartes vont dans la session, ajoutées à la collection à la fin
      api.close(); SC.recap = null; if (SC.el) SC.el.__close(); haptic('ok'); return;
    }
    if (SC.lot && LOT.el) {      // depuis le lot : chaque carte y rejoint aussi la liste, avec l'extension collante si elle y existe
      api.close(); SC.recap = null; if (SC.el) SC.el.__close(); haptic('ok');
      lotFromScan(items.flatMap(byFoil)).then(() => toast(TN(n, '{n} carte ajoutée au lot', '{n} cartes ajoutées au lot', { n })));
      return;
    }
    for (const x of items) if (x.e && x.p) edRemember(x.k, x.l, x.e, edInfoOf(x.p, x.l));      // infos de l'édition (prix, extension, image) gardées tout de suite
    const add = items.flatMap(byFoil).map(x => ({ k: x.k, n: x.n, q: x.q, l: scdLine(x.l, x.e, x.f) })), px0 = COLL.prox, where = scdPlace() ? ' · ' + plcName(scdPlace()) : '';      // « Ranger dans » : emplacement, ou proxys (places.js)
    if (SCD.x) proxAdd(add); else collAdd(add, 'add');
    api.close(); SC.recap = null; if (SC.el) SC.el.__close(); haptic('ok');
    toast((SCD.x ? TN(n, '{n} proxy ajouté', '{n} proxys ajoutés', { n }) : TN(n, '{n} carte ajoutée à ta collection', '{n} cartes ajoutées à ta collection')) + where, { label: T('Annuler'), fn: () => { COLL.map = before; COLL.prox = px0; collChanged(); } });
    collEnrich();
  });
  SC.recap = hook; hook();
}
/* ── Prix rapide : lire une carte sans l'ajouter (bourse, échange, vide-grenier) ───────────────────────────────────────────
   Même lecture que l'ajout, mais la carte va dans une liste de prix : tendance Cardmarket (Scryfall) tout de suite, offre CardTrader la moins chère
   ensuite (une carte à la fois, dans sa langue), quantité déjà possédée. Un bouton ajoute la carte à la collection si on la garde. */
const SCP = { chain: Promise.resolve() };
function scanPriceMode(on) {
  SC.pm = !!on; const el = SC.el; if (!el) return;
  el.classList.toggle('pm', SC.pm); $$('.sc-seg [data-act="pmode"]', el).forEach(b => b.setAttribute('aria-checked', String((b.dataset.v === '1') === SC.pm)));
  scanHint('', ''); scanPaintList();
}
/** Total estimé du lot lu en « prix rapide » : tendance Cardmarket (CM) et offres CardTrader les plus basses (CT, en euros), exemplaires compris. */
function scanLot() {
  const t = { n: 0, cm: 0, ct: 0, cmN: 0, ctN: 0, noCm: 0, noCt: 0, wait: false, ctOn: false };
  for (const e of SC.pq) {
    const k = e.n || 1; t.n += k;
    if (e.cm === undefined || e.cm === 'wait') t.wait = true; else if (Number.isFinite(e.cm)) { t.cm += e.cm * k; t.cmN++; } else t.noCm++;
    if (e.ct === 'off') continue;
    t.ctOn = true;
    if (e.ct === undefined || e.ct === 'wait' || e.ct === 'busy') t.wait = true; else if (e.ct && Number.isFinite(e.ct.p) && (!e.ct.c || e.ct.c === 'EUR')) { t.ct += e.ct.p * k; t.ctN++; } else t.noCt++;
  }
  return t;
}
function scanLotHtml(t) {
  const note = [TN(t.n, '{n} carte', '{n} cartes'), t.wait ? T('calcul…') : '', !t.wait && t.noCm ? T('{n} sans prix CM', { n: t.noCm }) : '', !t.wait && t.ctOn && t.noCt ? T('{n} sans offre CT', { n: t.noCt }) : ''].filter(Boolean).join(' · ');
  const part = (l, v, n) => `<span class="px ${l.toLowerCase()}"><i>${l}</i> <b>${n ? esc(fmt(v, 'EUR')) : '—'}</b></span>`;
  return `<small>${T('Lot : {note}', { note: esc(note) })}</small><span class="lot-v">${part('CM', t.cm, t.cmN)}${t.ctOn ? part('CT', t.ct, t.ctN) : ''}</span>`;
}
function scanPriceAdd(m) {
  if (typeof prgAdd === 'function') prgAdd('pq');      // prix rapides (progress.js)
  m = scanLangOf(m);
  const l = m.card || 'en'; let e = SC.pq.find(x => x.key === m.key);
  if (e) { SC.pq = [e, ...SC.pq.filter(x => x !== e)]; e.n = (e.n || 1) + 1; e.maybe = m.score < 0.84; e.raw = m.raw; e.l = l; if (e.cm === 'err') e.cm = undefined; }
  else { e = { key: m.key, name: m.name, l, maybe: m.score < 0.84, raw: m.raw, cm: undefined, ct: undefined, t: Date.now() }; SC.pq.unshift(e); if (SC.pq.length > 40) SC.pq.length = 40; }
  if (m.img && l !== 'en') { COLL.li[liKey(l, m.key)] = m.img; collMetaSave(); } else if (m.via && l !== 'en') langImgFor(m.key, m.name, l);
  scanPaintList(); scanPriceFetch(e);
}
async function scanPriceFetch(e) {
  if (e.cm === undefined) {
    e.cm = 'wait';
    try { const r = await scryCollection([e.name]), g = r.get(e.key); e.cm = g && g.eu > 0 ? g.eu : null; if (g && g.im) e.im = g.im; }
    catch (x) { e.cm = 'err'; }
    scanPaintList();
  }
  scanCtPrice(e);
}
/** Offre CardTrader la moins chère de la carte (dans sa langue), une lecture à la fois ; ne bouscule pas une recherche en cours. */
function scanCtPrice(e) {
  const cur = COLL.px[e.key], lang = e.l || S.opts.lang;
  if (S.demo || (!CTX.proxy && !CTX.token)) { e.ct = 'off'; scanPaintList(); return; }
  if (cur && Number.isFinite(cur.p) && Date.now() - cur.t < 6 * 3600e3 && !e.l) { e.ct = { p: cur.p, c: cur.c || 'EUR' }; scanPaintList(); return; }
  if (e.ct && e.ct !== 'err' && e.ct !== 'busy') return;
  e.ct = 'wait';
  SCP.chain = SCP.chain.then(async () => {
    if (!SC.el || !SC.pq.includes(e)) return;
    if (S.run && S.run.status === 'running') { e.ct = 'busy'; scanPaintList(); return; }
    try {
      readOpts(); const opts = { ...S.opts, lang, fallbackEn: false, skip: new Set(), fresh: false, push: null }; let off = null;
      await runLive([{ key: e.key, name: e.name, qty: 1 }], opts, { step() {}, progress() {}, rate() {}, hint() {}, cacheAge() {}, needsEn: () => false, card: (key, p) => { off = p.notFound ? null : cheapestOffer(p.offers, opts); } }, new AbortController().signal);
      e.ct = off ? { p: off.price, c: off.cur } : null;
    } catch (x) { e.ct = x && x.code === 'auth' ? 'auth' : 'err'; }
    scanPaintList();
  }).catch(() => { /* la file continue */ });
}
/** Nom affiché d'une ligne du scan : nom imprimé français si la carte est lue en FR et que le catalogue la connaît, sinon le nom anglais. */
const scanShown = e => frName(e.key, e.l) || e.name;
function scanPriceRow(e) {
  const th = scanThumb({ key: e.key, name: e.name, l: e.l }), own = collQty(e.key);
  const cm = e.cm === 'wait' || e.cm === undefined ? '<span class="px cm wait"><i>CM</i> <b>…</b></span>' : Number.isFinite(e.cm) ? `<span class="px cm"><i>CM</i> <b>${esc(fmt(e.cm, 'EUR'))}</b></span>` : e.cm === 'err' ? '<span class="px cm none"><i>CM</i> <b>' + T('indisponible') + '</b></span>' : '<span class="px cm none"><i>CM</i> <b>' + T('sans prix') + '</b></span>';
  const ct = e.ct === 'wait' || e.ct === undefined ? '<span class="px ct wait"><i>CT</i> <b>…</b></span>' : e.ct && e.ct.p != null ? `<span class="px ct"><i>CT</i> <b>${esc(fmt(e.ct.p, e.ct.c || 'EUR'))}</b></span>`
    : e.ct === 'off' ? '' : e.ct === 'busy' ? '<span class="px ct none"><i>CT</i> <b>' + T('recherche en cours') + '</b></span>' : e.ct === 'auth' ? '<span class="px ct none"><i>CT</i> <b>' + T('connexion requise') + '</b></span>' : e.ct === 'err' ? '<span class="px ct none"><i>CT</i> <b>' + T('indisponible') + '</b></span>' : '<span class="px ct none"><i>CT</i> <b>' + T('aucune offre') + '</b></span>';
  return `<div class="sc-item pr${e.maybe ? ' maybe' : ''}" data-k="${esc(e.key)}"><img class="sc-th" alt="" loading="lazy" decoding="async" src="${esc(th)}"${zoomAt('scan', scanShown(e))}><span class="sc-n"><span class="sc-top"><b>${esc(scanShown(e))}</b>${e.l ? flag(e.l) : ''}</span>${own || e.n > 1 ? `<span class="sc-meta">${e.n > 1 ? `<button type="button" class="tag accent sc-cnt" data-a="pdec" aria-label="${T('Ce lot compte {n} exemplaires de {name} : en retirer un', { n: e.n, name: esc(e.name) })}">× ${e.n} <span aria-hidden="true">−</span></button>` : ''}${own ? `<span class="tag good">${own > 1 ? T('× {n} possédée', { n: nf0(own) }) : T('possédée')}</span>` : ''}</span>` : ''}${e.maybe ? `<small>${T('À vérifier')} · ${T('lu « {raw} »', { raw: esc(e.raw || '') })}</small>` : ''}</span>
    <span class="row-px">${cm}${ct}</span>
    <button type="button" class="btn ghost small sc-keep" data-a="padd" aria-label="${T('Ajouter {name} à ma collection', { name: esc(e.name) })}">+</button><button type="button" class="sc-x" data-a="prm" aria-label="${T('Retirer {name} de la liste', { name: esc(e.name) })}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
}
function scanHint(t, kind) {
  const h = $('.sc-hint', SC.el); if (!h) return; clearTimeout(SC.hintT);
  h.textContent = t || ''; h.dataset.k = kind || ''; h.hidden = !t;
  if (t && kind === 'ok') SC.hintT = setTimeout(() => { if (SC.el && h.textContent === t) { h.hidden = true; h.textContent = ''; } }, 2500);
}
function scanFlash() { const f = $('.sc-flash', SC.el); if (!f) return; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
/** Éditions trouvées seules (lue sur la carte, la seule impression, comme la 1re, illustration, symbole) : celles qui « tombent » dans la liste. Choisie à la main : rien ne bouge. */
const SC_FLY_ES = ['auto', 'solo', 'read', 'art', 'sym'];
/** Après chaque rendu de la liste : une carte ajoutée il y a moins de 12 s dont l'édition vient d'être trouvée → son symbole part du bas du cadre vers sa ligne. */
function scanFlyCheck() {
  const now = Date.now();
  for (const x of SC.items.values()) {
    if (!x.fly) continue;
    if (now - x.fly > 12000 || x.maybe) { if (now - x.fly > 12000) delete x.fly; continue; }      // à vérifier : il partira une fois confirmé (dans le délai)
    if (!x.e) continue;
    delete x.fly; if (SC_FLY_ES.includes(x.es)) scanFly(x);
  }
}
/** Le symbole de l'édition apparaît en bas du cadre, puis descend se poser sur le bouton d'édition de la ligne (« c'est ajouté ») ; la ligne s'éclaire.
 *  Cible relue à chaque image : la liste peut bouger pendant le vol (lectures en cours, bandeaux) ; ligne hors de vue : il plonge vers le haut de la liste.
 *  Animations réduites : la ligne s'éclaire seulement. SC_FLY.ms : durée (les tests la rallongent). */
const SC_FLY = { ms: 1250, S: 46 };
function scanFly(x) {
  const el = SC.el, ic = setIcHtml(edSet(x.e)), g = el && $('.sc-guide', el), list = el && $('.sc-list', el); if (!ic || !g || !list) return;
  const rowOf = () => $(`.sc-item[data-id="${CSS.escape(x.id)}"]`, el);
  const lit = () => { const row = rowOf(); if (!row) return; row.classList.remove('got'); void row.offsetWidth; row.classList.add('got'); };
  if (typeof reduceMotion === 'function' && reduceMotion()) { lit(); return; }
  const S = SC_FLY.S, gr = g.getBoundingClientRect(), x0 = gr.left + gr.width / 2 - S / 2, y0 = gr.bottom - S - gr.height * 0.1;
  const target = () => {
    const lr = list.getBoundingClientRect(), row = rowOf(), dst = row && ($('.sc-ed', row) || row), dr = dst && dst.getBoundingClientRect();
    return dr && dr.bottom > lr.top + 8 && dr.top < lr.bottom - 8 ? { x: dr.left + dr.width / 2 - S / 2, y: dr.top + dr.height / 2 - S / 2, k: Math.max(0.5, dr.width / S) } : { x: lr.left + lr.width / 2 - S / 2, y: lr.top - S / 2, k: 0.6 };
  };
  const f = document.createElement('div'); f.className = 'sc-fly'; f.setAttribute('aria-hidden', 'true'); f.innerHTML = ic; el.appendChild(f);
  const t0 = performance.now(), io = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const step = now => {
    if (SC.el !== el || !f.isConnected) { f.remove(); return; }
    const t = Math.min(1, (now - t0) / SC_FLY.ms); let px = x0, py = y0, sc = 1, op = 1;
    if (t < 0.16) { sc = 0.3 + 0.82 * (t / 0.16); op = t / 0.16; }      // apparaît en bas du cadre
    else if (t < 0.26) sc = 1.12 - 0.12 * ((t - 0.16) / 0.1);
    else if (t >= 0.46) { const tg = target(), u = io(Math.min(1, (t - 0.46) / 0.44)); px = x0 + (tg.x - x0) * u; py = y0 + (tg.y - y0) * u; sc = 1 + (tg.k - 1) * u; if (t > 0.9) op = 1 - (t - 0.9) / 0.1; }      // descend sur sa ligne
    f.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(${sc.toFixed(3)})`; f.style.opacity = String(op);
    if (t < 1) requestAnimationFrame(step); else { f.remove(); lit(); }
  };
  requestAnimationFrame(step);
}

/* ── Catalogue des noms français (data.js › scryFrCatalog) : chargé depuis l'appareil dès l'ouverture du scan, téléchargé une fois s'il manque ─── */
const FRC = { cat: null, at: 0, p: null, state: 'idle', done: 0, total: 0, err: '' };      // state : idle · run · ready · ask (réseau mobile : on demande) · err
const frcMetered = () => { try { const c = navigator.connection; return !!c && (c.saveData === true || c.type === 'cellular'); } catch (e) { return false; } };
async function frcWarm() {
  const l = namesLang(); if (!l) { FRC.state = 'idle'; frcPaint(); return; }      // cartes anglaises : aucun catalogue de noms imprimés
  namesSwitch(l);
  if (!FRC.cat) { const c = await scryFrCached(l).catch(() => null); if (c && !FRC.cat && FRX.l === l) { FRC.cat = frCatalog(c.rows, l); FRC.at = c.at; } }
  if (FRC.cat && Date.now() - FRC.at < FR_FRESH) { FRC.state = 'ready'; frcPaint(); frcNames(); return; }
  frcStart(false);
}
/** Charge (ou reprend, ou met à jour) le catalogue en arrière-plan : fichier du site (fr-names.tsv) d'abord, sinon pages Scryfall ; le scan sert déjà pendant ce temps (recherche réseau mot par mot). force : malgré le réseau mobile. */
/** Le catalogue vient d'arriver : les lignes FR déjà scannées passent sous leur nom imprimé. */
function frcNames() { if (SC.el && FRC.cat && FRC.cat.fr && FRC.cat.fr.size) scanPaintList(); }
function frcStart(force) {
  const l = namesLang(); if (!l) return null;
  namesSwitch(l);
  if (FRC.p) return FRC.p;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { FRC.state = FRC.cat ? 'ready' : 'err'; FRC.err = T('Hors ligne'); frcPaint(); return null; }
  FRC.state = 'run'; FRC.err = ''; FRC.done = 0; FRC.total = 0; frcPaint();
  const p = FRC.p = (async () => {
    if (!FRC.cat) { const st = await scryFrStatic(undefined, l).catch(() => null); if (FRX.l !== l) return; if (st) { FRC.cat = frCatalog(st.rows, l); FRC.at = st.at; FRC.state = 'ready'; return; } }      // fichier du site : petit, pas de question même en 4G
    if (!force && !FRC.cat && frcMetered()) { FRC.state = 'ask'; return; }
    const rec = await scryFrCatalog(null, (d, t) => { FRC.done = d; FRC.total = t; frcPaint(); }, l);
    if (FRX.l !== l) return;                                                           // langue changée pendant le téléchargement
    FRC.cat = frCatalog(rec.rows, l); FRC.at = rec.at; FRC.state = 'ready';
  })().catch(e => { if (FRX.l !== l) return; FRC.state = FRC.cat ? 'ready' : 'err'; FRC.err = e && e.code === 'rate' ? T('Scryfall demande une pause') : T('Téléchargement interrompu'); })
    .finally(() => { if (FRC.p === p) FRC.p = null; frcPaint(); frcNames(); });
  return p;
}
function frcPaint() {
  const el = SC.el && $('.sc-cat', SC.el); if (!el) return;
  const s = FRC.state, pct = FRC.total ? Math.min(99, Math.round(100 * FRC.done / FRC.total)) : 0;
  if (s === 'run' && !FRC.cat) { el.hidden = false; el.dataset.k = 'run'; el.innerHTML = `<span>${nmT('Catalogue des noms français : {pct} % · la lecture marche déjà, elle sera plus sûre ensuite', 'Catalogue des noms en {lang} : {pct} % · la lecture marche déjà, elle sera plus sûre ensuite', null, { pct })}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span>`; }
  else if (s === 'ask' && !FRC.cat) { el.hidden = false; el.dataset.k = 'idle'; el.innerHTML = '<span>' + nmT('Pour lire les cartes françaises avec précision : catalogue des noms (≈ 15 à 20 Mo, une seule fois).', 'Pour lire les cartes en {lang} avec précision : catalogue des noms (≈ 15 à 20 Mo, une seule fois).') + '</span><button class="link-btn" type="button" data-act="frc">' + T('Télécharger') + '</button>'; }
  else if (s === 'err' && !FRC.cat) { el.hidden = false; el.dataset.k = 'err'; el.innerHTML = `<span>${nmT('{err}. Les cartes françaises restent lues, moins sûrement.', '{err}. Les cartes en {lang} restent lues, moins sûrement.', null, { err: esc(FRC.err || T('Catalogue indisponible')) })}</span><button class="link-btn" type="button" data-act="frc">${T('Réessayer')}</button>`; }
  else el.hidden = true;
}

/** Recherches Scryfall de noms français déjà faites (mots → résultats) : une carte qui reste dans le cadre ne relance pas de requête. */
const FR_CACHE = new Map();
async function frSearch(words, signal) {
  const k = words.map(w => w.toLowerCase()).join(' ');
  if (FR_CACHE.has(k)) return FR_CACHE.get(k);
  let res = []; try { res = await scryForeign(words, SCRY_LANG[FRX.l] || 'fr', signal); } catch (e) { if (e.name === 'AbortError') throw e; return []; }   // erreur réseau : pas mise en cache
  if (FR_CACHE.size > 400) FR_CACHE.clear(); FR_CACHE.set(k, res); return res;
}
/** Un texte lu (nom français probable) → { name (anglais), key, score, raw } ou null : mots longs cherchés chez Scryfall, puis nom imprimé comparé. */
async function frenchName(text, signal, quick) {
  const words = frWords(text);
  if (!words.length) return null;
  let res = await frSearch(words.slice(0, 2), signal);
  for (let i = 0; !quick && !res.length && words.length > 1 && i < Math.min(3, words.length); i++) res = await frSearch([words[i]], signal);   // un mot mal lu fait échouer la recherche à deux mots : on essaie chaque mot seul
  if (!res.length) return null;
  const fm = matchName(text, nameIndex(res.map(r => r.printed)), 0.72); if (!fm) return null;
  const hit = res.find(r => frontName(r.printed) === frontName(fm.name));
  return hit ? { name: hit.name, key: ownKey(hit.name), score: fm.score, raw: text, card: FRX.l, img: hit.img || '' } : null;
}
/** Texte lu → carte reconnue. Deux catalogues locaux comparés sur les mêmes lignes : noms français imprimés (catalogue Scryfall téléchargé) et noms anglais ;
 *  la lecture la plus sûre gagne, à égalité (nom identique dans les deux langues) le français. Catalogue français absent ou rien de sûr : repli sur la recherche Scryfall des noms imprimés. */
async function scanMatch(lines, cat, lang) {
  if (TESS_ASIA[lang]) return asiaMatch(lines, TESS_ASIA[lang]);      // japonais, coréen, chinois : noms imprimés de cette langue seulement
  const en = bestMatch(lines, cat.idx); if (en) en.card = 'en';
  let m = bestOf(matchFr(lines, FRC.cat), en);
  if (lang !== 'eng' && lang === TESS_OF[FRX.l] && (!m || m.score < 0.84) && (!FRC.cat || !m)) {      // moteur de la langue des noms (fra, deu…) : repli sur la recherche Scryfall des noms imprimés
    for (const l of lines.slice(0, FRC.cat ? 2 : 3)) {
      const fm = await frenchName(l.text, undefined, !!FRC.cat);
      if (fm && (!m || fm.score > m.score)) m = fm;
      if (m && m.score >= 0.84) break;
    }
  }
  return m;
}
/* ── Autres langues : nom ni dans le catalogue de la langue des noms ni en anglais (carte italienne lue avec l'appli en français) ──────────────
   Les lignes lues sont cherchées dans les catalogues des autres langues : sur l'appareil (names-all.tsv, ci-dessous) s'il y est, sinon au serveur (proxy.mjs › /api/names/find,
   une requête) ; la carte trouvée garde sa langue (drapeau, image, exemplaire de la collection). Seulement quand rien n'est sûr : une carte de la langue de l'appli ou anglaise n'en déclenche pas. */
const OTH = { off: 0, memo: new Map() };      // off : heure jusqu'à laquelle le serveur n'est plus redemandé (route absente : serveur pas encore redémarré après une mise en ligne)
/** Petits mots de liaison des langues latines (di, del, de, der, el, do…). */
const LINK_WORDS = new Set(['di', 'del', 'della', 'delle', 'dello', 'dei', 'degli', 'dal', 'dalla', 'il', 'lo', 'gli', 'nel', 'nella', 'da', 'de', 'des', 'du', 'la', 'le', 'les', 'el', 'los', 'las', 'do', 'dos', 'das', 'der', 'die', 'den', 'dem', 'und', 'von', 'zu', 'zum', 'zur', 'al', 'en', 'em', 'com', 'con', 'per', 'sur', 'aux', 'au', 'ein', 'eine']);
/** Texte lu qui n'a pas l'air écrit dans la langue du nom reconnu (ref) : accents ou élision (l', dell'…) que ref n'a pas, ou un mot absent de ref qui est un mot de liaison
 *  ou finit par une voyelle (cognats : Foresta / Forest, Archivista / Archiviste, Erosione / Erosion). Mesuré sur les catalogues : 1,9 % des noms imprimés étrangers passent pour
 *  anglais à 0,84 ou plus, 79 % d'entre eux sous 0,92, dont 71 % repérés ici ; un nom anglais abîmé par la lecture (une lettre) n'est redemandé que 4 fois sur 100. */
function looksForeign(raw, ref) {
  const r = String(raw || ''), f = String(ref || ''), known = new Set(normPart(f).split(' ')), acc = /[À-ÖØ-öø-ÿ]/;
  return (acc.test(r) && !acc.test(f)) || (/(^|[\s-])(l|d|dell|all|nell|dall|sull|un)['’]\s*\p{L}/iu.test(r) && !/['’]/.test(f)) || normPart(r).split(' ').some(w => !known.has(w) && (LINK_WORDS.has(w) || (w.length >= 4 && /[aeio]$/.test(w))));
}
/** Lecture douteuse : reconnue de justesse (< 0,92) dans la langue des noms ou en anglais, sur un texte qui n'a pas l'air de cette langue : les autres langues d'abord (gardée si elles ne font pas mieux). */
const scanDoubt = m => !!m && m.score < 0.92 && looksForeign(m.raw, m.card === 'en' ? m.name : frName(m.key, m.card) || m.name);
/* ── Autres langues sur l'appareil, comme l'anglais : names-all.tsv (data.js › namesAllFetch), téléchargé en arrière-plan à l'ouverture du scan, en Wi-Fi seulement
   (réseau mobile : rien de nouveau n'est demandé, le serveur cherche à la place), mis à jour tous les 14 jours. Index d'une langue (≈ 3 à 5 Mo) construit par tranches
   à la première carte qui en a besoin, libéré à la fermeture du scan. Mêmes catalogues, même comparaison, même arbitrage entre langues que le serveur (core.js › nmMatch, nmPick). */
const OTHX = { at: -1, cats: {}, p: null, dl: null, gen: 0 };      // at : date du fichier gardé (0 : aucun, -1 : pas encore lue) ; cats : langue → catalogue (null : aucun nom dans cette langue)
const othTick = gen => new Promise(r => setTimeout(() => r(OTHX.gen === gen && !!SC.el), 0));      // false : scan fermé ou nouveau fichier, on abandonne
/** Ouverture du scan : fichier téléchargé s'il manque ou a plus de 14 jours (en ligne, hors réseau mobile). */
function othWarm() {
  if (OTHX.dl) return OTHX.dl;
  const p = OTHX.dl = (async () => {
    if (OTHX.at < 0) OTHX.at = await namesAllAt();
    if (OTHX.at && Date.now() - OTHX.at < FR_FRESH) return;
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || frcMetered()) return;
    const at = await namesAllFetch(); if (!at) return;      // absent du site, hors ligne : l'ancien fichier (s'il y en a un) sert encore
    OTHX.at = at; OTHX.gen++; OTHX.cats = {}; OTHX.p = null;      // nouveau fichier : index reconstruits à la prochaine carte
  })().catch(() => {}).finally(() => { if (OTHX.dl === p) OTHX.dl = null; });
  return p;
}
/** Scan fermé : index libérés (le fichier reste sur l'appareil). */
function othFree() { OTHX.gen++; OTHX.cats = {}; OTHX.p = null; ASIA.cats = {}; }      // index des langues d'Asie aussi
/** Catalogues des langues ls, construits à la première demande (une construction à la fois) : { langue: catalogue | null }, ou null (pas de fichier sur l'appareil, construction abandonnée). */
async function othCats(ls) {
  if (OTHX.at < 0) OTHX.at = await namesAllAt();
  if (!OTHX.at) return null;
  if (ls.some(l => !(l in OTHX.cats))) {
    const gen = OTHX.gen;
    await (OTHX.p = (OTHX.p || Promise.resolve()).then(async () => {
      const need = ls.filter(l => !(l in OTHX.cats)); if (!need.length || OTHX.gen !== gen || !SC.el) return;
      const t = await namesAllText(); if (OTHX.gen !== gen) return;
      if (!t) { OTHX.at = 0; return; }      // stockage effacé : retéléchargé à la prochaine ouverture du scan, le serveur cherche en attendant
      const c = await namesAllCats(t, need, () => othTick(gen));
      if (c && OTHX.gen === gen) for (const l of need) OTHX.cats[l] = c[l] || null;
    }).catch(() => {}));
  }
  return OTHX.at && ls.every(l => l in OTHX.cats) ? OTHX.cats : null;
}
/** Lignes lues → carte d'une autre langue trouvée sur l'appareil : { name, key, score, raw, card, img: '', via, amb? } ou null ; undefined : rien sur l'appareil (le serveur cherche). */
async function othLocal(qs, skip) {
  const ls = NAMES_LANGS.filter(l => l !== skip), cats = await othCats(ls);
  if (!cats || !ls.some(l => cats[l])) return undefined;
  const lines = qs.map(text => ({ text })), found = [], gen = OTHX.gen;
  for (const l of ls) {
    const m = cats[l] && nmMatch(cats[l], lines); if (m) found.push({ ...m, lang: l });
    if (!(await othTick(gen))) return undefined;      // une langue à la fois : l'écran respire entre deux
  }
  const h = nmPick(found);
  return h && h.score >= 0.72 ? { name: h.name, key: ownKey(h.name), score: h.score, raw: h.raw, card: h.lang, img: '', via: h.lang, ...(h.amb ? { amb: true, ...(h.alts ? { alts: h.alts } : {}) } : {}) } : null;
}
/* ── Japonais, coréen, chinois simplifié et traditionnel : lignes lues par le moteur de la langue (TESS_ASIA), comparées aux noms imprimés de cette langue
   (names-ja.tsv, names-ko.tsv, names-zhs.tsv, names-zht.tsv : gen-fr-names.mjs). Fichier téléchargé à la première carte qui en a besoin, gardé sur l'appareil
   (mis à jour tous les 14 jours), index libéré à la fermeture du scan ; pas de fichier (hors ligne, pas encore généré) : le serveur cherche (/api/names/find). */
const ASIA = { cats: {} };
/** Catalogue d'une langue d'Asie (core.js › frCatalog) ou null. */
function asiaCat(l) {
  if (!ASIA_LANGS.includes(l)) return Promise.resolve(null);
  if (!ASIA.cats[l]) ASIA.cats[l] = (async () => {
    let rec = await scryFrCached(l);
    if ((!rec || Date.now() - rec.at > FR_FRESH) && !collOffline()) rec = (await scryFrStatic(undefined, l).catch(() => null)) || rec;
    return rec ? frCatalog(rec.rows, l) : null;
  })().catch(() => null);
  return ASIA.cats[l];
}
/** Lignes lues (moteur de la langue l) → { name, key, score, raw, card: l, img, via: l, amb?, alts? } ou null. */
async function asiaMatch(lines, l) {
  const ls = lines.filter(x => CJK_RE.test(String(x.text || '')));
  if (!ls.length) return null;
  const cat = await asiaCat(l);
  if (cat) { const m = matchFr(ls, cat); return m ? { ...m, via: l } : null; }
  if (!SC.el || Date.now() < OTH.off || !CTX.proxy || collOffline()) return null;
  try {
    const qs = [...new Set(ls.map(x => String(x.text).trim()))].slice(0, 4), skip = NAMES_ALL_LANGS.filter(x => x !== l).join(',');
    const r = await fetch('api/names/find?' + new URLSearchParams([...qs.map(q => ['q', q.slice(0, 100)]), ['skip', skip]]), { headers: { Accept: 'application/json' } });
    const h = r.ok ? (await r.json()).hit : null;
    if (!h || h.lang !== l || typeof h.name !== 'string' || !h.name || !(h.score >= 0.72 && h.score <= 1)) return null;
    const img = typeof h.img === 'string' && /^https:\/\/cards\.scryfall\.io\/[\w/.-]+$/.test(h.img) ? h.img : '', alts = h.amb && Array.isArray(h.alts) ? h.alts.filter(x => typeof x === 'string' && x).slice(0, 6) : [];
    return { name: h.name, key: ownKey(h.name), score: h.score, raw: qs.includes(h.raw) ? h.raw : qs[0], card: l, img, via: l, ...(h.amb ? { amb: true, ...(alts.length > 1 ? { alts } : {}) } : {}) };
  } catch (e) { return null; }
}
/** Lignes lues → carte trouvée dans une autre langue : { name, key, score, raw, card, img, via } ou null. Sur l'appareil d'abord (names-all.tsv, sans réseau ni budget) ;
 *  sans fichier sur l'appareil : le serveur. st : budget de la carte pour le serveur (2 requêtes au plus). */
async function scanOther(lines, st) {
  const qs = [...new Set(lines.map(l => String(l.text || '').trim()).filter(t => t.length >= 3 && t.length <= 60 && !CJK_RE.test(t) && (t.match(NAME_LETTER_RE) || []).length >= t.length * 0.6))].slice(0, 4);      // mêmes lignes que core.js › ocrMatches ; japonais, coréen, chinois : asiaMatch
  if (!qs.length) return null;
  const skip = FRC.cat ? FRC.cat.l || FRX.l : '', k = skip + '\n' + qs.join('\n');      // langue des noms déjà comparée sur l'appareil ; catalogue pas encore là : cherchée aussi
  if (OTH.memo.has(k)) return OTH.memo.get(k);
  const loc = await othLocal(qs, skip);
  if (loc !== undefined) { if (OTH.memo.size > 200) OTH.memo.clear(); OTH.memo.set(k, loc); return loc; }
  if (!SC.el || Date.now() < OTH.off || !CTX.proxy || !(st.n < 2)) return null;
  st.n++; let hit = null;
  try {
    const r = await fetch('api/names/find?' + new URLSearchParams([...qs.map(q => ['q', q]), ['skip', skip]]), { headers: { Accept: 'application/json' } });
    if (!r.ok && !r.headers.get('retry-after') && r.status !== 400) { OTH.off = Date.now() + 5 * 60e3; return null; }      // serveur sans cette recherche (ancienne version, coupée) : redemandé 5 min plus tard ; 429 / occupé : la carte suivante redemande
    if (!r.ok) return null;
    const h = (await r.json()).hit;
    if (h && typeof h.name === 'string' && h.name && NAMES_LANGS.includes(h.lang) && h.score >= 0.72 && h.score <= 1) {
      const img = typeof h.img === 'string' && /^https:\/\/cards\.scryfall\.io\/[\w/.-]+$/.test(h.img) ? h.img : '';
      const alts = h.amb && Array.isArray(h.alts) ? h.alts.filter(x => typeof x === 'string' && x && x.length < 160).slice(0, 6) : [];
      hit = { name: h.name, key: ownKey(h.name), score: h.score, raw: qs.includes(h.raw) ? h.raw : qs[0], card: h.lang, img, via: h.lang, ...(h.amb ? { amb: true, ...(alts.length > 1 ? { alts } : {}) } : {}) };
    }
  } catch (e) { return null; }      // hors ligne : rien de retenu
  if (OTH.memo.size > 200) OTH.memo.clear(); OTH.memo.set(k, hit);
  return hit;
}
/** Lit une zone « nom » : français d'abord (la plupart des cartes), puis anglais ; le texte lu est comparé aux noms français ET anglais (une carte anglaise lue par le moteur français est reconnue aussi).
 *  Rien de sûr (ou anglais douteux) : les mêmes lignes sont cherchées dans les autres langues (appareil, sinon serveur). Polarité automatique puis inversée (texte clair sur fond sombre). S'arrête dès qu'un nom est sûr.
 *  st : { n } requêtes « autres langues » au serveur déjà faites pour cette carte. */
async function readNameAuto(src, box, outW, psm, cat, retry, st) {
  const langs = ocrLangs();
  let best = null, inv;
  for (let pass = 0; pass < (retry ? 2 : 1); pass++) {
    const c = prepCanvas(src, box, outW, pass ? (inv ? 0 : 1) : undefined); if (!pass) inv = c.inv;
    try {
      const read = [];
      for (const lang of langs) {
        if (!SC.el) return best;
        const lines = await ocrLines(c, lang, psm); read.push(...lines);
        if (!SC.raw) { const l = lines.find(x => String(x.text || '').replace(/[^\p{L}]/gu, '').length >= 3); if (l) SC.raw = String(l.text).trim().slice(0, 60); }      // premier texte lu de la carte : montré si le nom n'est pas reconnu
        const m = await scanMatch(lines, cat, lang);
        if (m && (!best || m.score > best.score)) { best = m; best.lang = lang; }
        if (best && best.score >= 0.84 && !scanDoubt(best)) return best;
      }
      if (st && SC.el) {
        let o = await scanOther(read, st);
        if (o && o.card !== FRX.l && FRX.l !== 'en' && o.score < 0.9 && !collOffline()) {      // trouvée de justesse dans une autre langue : le nom dans la langue de l'appli manque peut-être au catalogue (extension de la semaine) → recherche Scryfall des noms imprimés
          for (const l of read.filter(x => String(x.text || '').trim().length >= 3).slice(0, 3)) { const fm = await frenchName(l.text, undefined, true).catch(() => null); if (fm && fm.score >= Math.max(0.8, o.score - 0.02)) { o = fm; break; } if (!SC.el) break; }
        }
        if (o && (!best || o.score > best.score)) { o.lang = langs[langs.length - 1]; best = o; }
      }
      if (best && best.score >= 0.84) return best;
    } finally { c.width = c.height = 0; }
  }
  return best;
}
/** Zone lue d'une photo de carte (portrait) : le tiers haut, là où se trouvent le nom et le mana. Le reste de l'image n'est jamais lu. */
const thirdBox = src => ({ x: 0, y: 0, w: src.naturalWidth || src.width, h: Math.round((src.naturalHeight || src.height) / 3) });
/** Une capture → meilleure lecture. Aperçu de l'app : la capture EST la bande « nom + mana » (lue entière, les symboles de mana sont ignorés), puis en texte épars si rien de sûr.
 *  Photo d'une carte entière (« Photos ») : bande du titre en haut, puis le tiers haut si rien de sûr ; le reste de l'image n'est jamais lu. */
async function readCard(src, cat, strip, card) {
  const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, st = { n: 0 }; SC.raw = '';      // st : requêtes « autres langues » de cette carte (2 au plus)
  if (card) {      // cadrage « carte entière » : la capture EST la carte (cadre de l'écran) : le nom en haut, puis la ligne du bas
    let m = null;      // bande serrée en une ligne (Tesseract se perd dans les grandes zones sombres du bord et de l'illustration), puis la zone large, puis le tiers haut en texte épars
    for (const [b, psm, retry] of [[cardBandBox(W, H), '7', true], [cardNameBox(W, H), '6', false], [{ x: 0, y: 0, w: W, h: Math.round(H * 0.3) }, '11', false]]) {
      if ((m && m.score >= 0.84) || !SC.el) break;
      const t = await readNameAuto(src, b, 1400, psm, cat, retry, st); if (t && (!m || t.score > m.score)) m = t;
      if (natOcr()) break;      // ML Kit lit toute la zone d'un coup : une passe suffit
    }
    m = await footIdentify(m, src, cardFootBox(W, H));      // nom illisible ou douteux : l'extension et le numéro du bas retrouvent la carte
    return artAttach(await footAttach(m, src, cardFootBox(W, H)), src);
  }
  if (strip) {
    let m = await readNameAuto(src, { x: 0, y: 0, w: W, h: H }, 1400, '6', cat, true, st);
    if ((!m || m.score < 0.84) && SC.el) { const all = await readNameAuto(src, { x: 0, y: 0, w: W, h: H }, 1600, '11', cat, false, st); if (all && (!m || all.score > m.score)) m = all; }
    return m;
  }
  let m = await readNameAuto(src, { x: Math.round(W * 0.04), y: Math.round(H * 0.01), w: Math.round(W * 0.92), h: Math.round(H * 0.17) }, 1100, '6', cat, true, st);
  for (const [psm, retry] of [['6', true], ['11', false]]) {      // tiers haut : un bloc de texte d'abord, texte épars en dernier recours
    if ((m && m.score >= 0.84) || !SC.el) break;
    const t = await readNameAuto(src, thirdBox(src), 1600, psm, cat, retry, st); if (t && (!m || t.score > m.score)) m = t;
  }
  m = await footIdentify(m, src, cardFootBox(W, H));
  return footAttach(m, src, cardFootBox(W, H));      // photo de la carte entière : sa ligne du bas aussi
}

/* — Cadrage « carte entière » : la petite ligne en bas à gauche (numéro, extension, langue) donne l'édition exacte (scanfoot.js, scaned.js) — */
const scanFull = () => SCS.frame !== 'name';
/** Zone du nom dans une carte cadrée (marge pour une carte un peu décalée dans le cadre ; le mana à droite est ignoré par la comparaison des noms). */
const cardNameBox = (W, H) => ({ x: Math.round(W * 0.03), y: 0, w: Math.round(W * 0.94), h: Math.round(H * 0.15) });
/** Bande du nom seule (sans le mana ni le bord) : la première lecture d'une carte cadrée. */
const cardBandBox = (W, H) => ({ x: Math.round(W * 0.04), y: Math.round(H * 0.025), w: Math.round(W * 0.8), h: Math.round(H * 0.1) });
/** Coin bas gauche d'une carte cadrée : « 0123 R » / « MKM • FR » (et l'artiste à droite, ignoré). */
const cardFootBox = (W, H) => ({ x: 0, y: Math.round(H * 0.86), w: Math.round(W * 0.64), h: H - Math.round(H * 0.86) });
/** Caractères de la ligne du bas pour Tesseract (ML Kit lit tout). */
const FOOT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/. ';      // sans « * » : Tesseract y lit la puce « • » (faux foil)
/** Lit la ligne du bas (box) et l'ajoute à la carte reconnue m (m.ft : footParse) ; langue imprimée sur la carte retenue (sauf langue imposée). Rien de lu : m inchangée.
 *  Seulement pour une carte reconnue, hors prix rapide et réglage « Sans édition ». Le texte lu reste pour l'écran de diagnostic (5 appuis sur le titre). */
/** Lit la ligne du bas (box) une fois par capture (gardée sur src) : { ft (footParse), raw (texte lu, pour le diagnostic) }. */
async function footRead(src, box) {
  if (src.__foot) return src.__foot;
  let ft = null, raw = '';
  for (let pass = 0; pass < 2 && !ft && SC.el; pass++) {      // polarité automatique, puis inversée (Tesseract ; ML Kit lit les deux d'un coup)
    const c = prepCanvas(src, box, 1400, pass ? (box.inv ? 0 : 1) : undefined); if (!pass) box.inv = c.inv;
    try { const lines = await ocrLines(c, 'eng', '6', FOOT_CHARS); raw = lines.map(l => l.text).join(' / ').slice(0, 80) || raw; ft = footParse(lines); }
    catch (e) { break; }      // lecture refusée : la carte garde son nom, l'édition se décide comme avant
    finally { c.width = c.height = 0; }
    if (natOcr()) break;
  }
  return (src.__foot = { ft, raw });
}
async function footAttach(m, src, box) {
  if (!m || m.score < 0.72 || SC.pm || SCS.ed === 'none' || !SC.el || typeof footParse !== 'function') return m;
  const { ft, raw } = await footRead(src, box);
  SC.foot = { raw, ft, name: m.name, card: m.card || 'en', keep: '', via: m.via === 'foot' ? 'foot' : '' };
  if (!ft) return m;
  const out = { ...m, ft };
  out.lsure = scanNameSure(m) || !!(ft.lang && !SCS.lang && (ft.lsep || (typeof footKnown === 'function' && footKnown(ft.codes[0]) === true)));      // langue sûre : nom propre à sa langue, ou « CODE • LANGUE » lu en bas (vote pour la langue du lot)
  if (ft.lang && !SCS.lang && ft.lang !== (m.card || 'en') && LANGS[ft.lang]) {
    if (scanNameSure(m)) { SC.foot.keep = ft.lang; out.lsure = true; }      // nom imprimé propre à sa langue (« Anneau solaire ») : c'est lui qui dit la langue, la ligne du bas a pu lire un mot du texte
    else Object.assign(out, { card: ft.lang, img: '', via: m.via === 'foot' ? 'foot' : '' });      // nom identique dans les deux langues (« Edgar Markov »), ou lu en anglais : la langue imprimée en bas décide
  }
  return out;
}
/** Ressemblance de deux noms (0 à 1), accents, casse et ponctuation ignorés. */
const nameSimilar = (a, b) => { const x = normName(a), y = normName(b); if (!x || !y) return 0; const n = Math.max(x.length, y.length); return 1 - Math.min(n, lev(x, y, n)) / n; };
/** Code d'extension lu → code Scryfall (liste des extensions, aux confusions de l'OCR près : « M1S » → m15) ; liste pas encore là : tel quel. */
function footSetOf(code) {
  const c = String(code || '').toLowerCase(), m = typeof SETIC !== 'undefined' && SETIC && SETIC.m;
  if (!m || !Object.keys(m).length || m[c]) return c;
  return Object.keys(m).find(k => k.length === c.length && footSame(c.toUpperCase(), k.toUpperCase())) || '';
}
/**
 * Nom illisible ou reconnu de justesse (foil, reflet, police spéciale, nom abîmé) : la ligne du bas (extension + numéro) retrouve l'impression exacte chez Scryfall,
 * dans la langue imprimée en bas (sinon la langue imposée, sinon celle des noms de l'appli puis l'anglais, d'après le texte lu). Le nom lu la confirme : sûre (0,93) ;
 * sans nom lisible : « à vérifier » (0,8, la photo reste sous la carte). Un nom lu de justesse qui n'y ressemble pas reste celui retenu s'il ressemble plus au texte lu.
 */
async function footIdentify(m, src, box) {
  const weakOther = m && m.card && m.card !== 'en' && m.card !== FRX.l && m.score < 0.95;      // autre langue trouvée sans certitude : vérifiée par la ligne du bas
  if (!SC.el || (m && m.score >= 0.84 && !weakOther) || typeof footParse !== 'function' || typeof scryBySetNum !== 'function' || collOffline() || (typeof scryLeft === 'function' && scryLeft() > 0)) return m;
  const { ft, raw: fraw } = await footRead(src, box);
  if (!ft || !ft.nums.length || !ft.codes.length || !SC.el) return m;
  const raw = (m && m.raw) || SC.raw || '', want = SCS.lang || ft.lang || '';
  const sets = [...new Set(ft.codes.slice(0, 2).map(footSetOf).filter(Boolean))];
  let r = null;
  for (const set of sets) {
    for (const num of ft.nums.slice(0, 2)) {
      try { r = await scryBySetNum(set, num, want || FRX.l); } catch (e) { r = null; }
      if (r && !want && r.lang !== 'en' && raw && nameSimilar(raw, r.name) > nameSimilar(raw, r.printed)) { try { r = (await scryBySetNum(set, num, 'en')) || r; } catch (e) { /* garde la première */ } }      // texte lu plus proche du nom anglais : l'impression anglaise
      if (r) break;
    }
    if (r) break;
  }
  if (!r || !SC.el) return m;
  const l = (typeof FOOT_SL !== 'undefined' && FOOT_SL[r.lang]) || 'en';
  let sim = nameSimilar(raw, r.printed || r.name), araw = '';
  if (sim < 0.6 && r.printed && TESS_ASIA[TESS_OF[l]] && src && SC.el) {      // nom japonais, coréen, chinois : illisible pour le moteur latin, relu avec celui de la langue lue en bas
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, c = prepCanvas(src, cardBandBox(W, H), 1400);
    try { for (const x of await ocrLines(c, TESS_OF[l], '7')) { const v = nameSimilar(x.text, r.printed); if (v > sim) { sim = v; araw = String(x.text).trim().slice(0, 60); } } } catch (e) { /* moteur indisponible : à vérifier */ } finally { c.width = c.height = 0; }
  }
  SC.foot = { raw: fraw, ft, name: r.name, card: l, keep: '', via: 'foot' };
  const hit = { name: r.name, key: ownKey(r.name), score: sim >= 0.6 ? 0.93 : 0.8, raw: araw || raw || r.printed || r.name, card: l, img: r.img || '', via: 'foot', ft };
  if (!m) return hit;
  if (m.amb && (hit.key === m.key || (m.alts || []).some(a => ownKey(a) === hit.key) || sim >= 0.75)) {      // nom imprimé de plusieurs cartes (« Voie de la pyromancienne ») : l'extension et le numéro disent laquelle
    const same = hit.card === (m.card || 'en');
    return { ...m, name: hit.name, key: hit.key, score: Math.max(m.score, 0.92), img: same ? hit.img : hit.key === m.key ? m.img : '', amb: false, ambBy: 'foot', alts: m.alts || [m.name, hit.name].filter((x, i, a) => a.indexOf(x) === i) };
  }
  if (hit.key === m.key) return { ...m, score: Math.max(m.score, 0.92), ...(weakOther && ft.lang && hit.card !== m.card ? { card: hit.card, img: hit.img, via: 'foot' } : {}) };      // la ligne du bas confirme le nom lu de justesse (et sa langue, si elle y est lue)
  return sim > nameSimilar(raw, m.card && m.card !== 'en' ? frName(m.key, m.card) || m.name : m.name) ? hit : m;
}
/** Langue du lot, pour départager seulement : les cartes à la langue sûre (nom propre à sa langue, langue lue en bas) votent, les 8 dernières comptent (un lot
 *  mélangé d'extensions et de langues n'a pas de majorité ; une pile par langue en change). Une carte à la langue incertaine prend celle du lot (3 voix, 70 % ou plus)
 *  seulement si ce qui a été lu est aussi son nom dans cette langue (nom identique d'une langue à l'autre, « Edgar Markov ») : jamais contre ce qui est lu sur la carte. */
async function scanLotLang(m) {
  if (!m || SCS.lang || SC.pm) return m;
  const l = m.card || 'en', sure = m.lsure != null ? m.lsure : scanNameSure(m);
  if (sure) { SC.lv.push(l); if (SC.lv.length > 8) SC.lv.shift(); return m; }
  if (m.ft && m.ft.lang) return m;      // langue lue sur la ligne du bas : elle a déjà décidé (footAttach)
  const top = scanLotTop();
  if (!top || top === l) return m;
  const here = await lotSim(m, l), there = await lotSim(m, top);
  if (there < 0.75 || there + 0.05 < here) return m;      // le nom lu n'est pas (aussi bien) celui de la langue du lot
  SC.lotLast = { name: m.name, a: l, b: top };
  return { ...m, card: top, img: '', via: m.via === 'foot' ? 'foot' : '', lot: true };
}
/** Langue du lot : celle de 70 % ou plus des 8 dernières cartes à la langue sûre (3 au moins), sinon ''. Sert aussi à choisir le moteur OCR (ocrLangs). */
function scanLotTop() {
  if (!SC.el || SCS.lang || SC.lv.length < 3) return '';
  const by = {}; for (const x of SC.lv) by[x] = (by[x] || 0) + 1;
  const [top, n] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return n / SC.lv.length >= 0.7 && LANGS[top] ? top : '';
}
/** Ressemblance (0 à 1) entre le texte lu et le nom de la carte dans la langue l ; -1 : nom inconnu dans cette langue (rien n'est changé). */
async function lotSim(m, l) {
  const raw = m.raw || m.name;
  if (l === 'en') return nameSimilar(raw, m.name);
  if (l === FRX.l) { const f = frName(m.key, l); return f ? nameSimilar(raw, f) : -1; }
  if (!NAMES_LANGS.includes(l)) return -1;
  const cats = await othCats([l]), c = cats && cats[l]; if (!c) return -1;
  const h = nmMatch(c, [{ text: raw }]);
  return h && ownKey(h.name) === m.key ? h.score : 0;
}
/** Nom imprimé de plusieurs cartes, ligne du bas illisible ou absente (cartes d'avant 2015) : l'illustration de la photo est comparée aux impressions de chacune ;
 *  une impression nettement plus proche dit la carte (score 0,9 : plus « à vérifier »). Sinon la carte reste à vérifier, ses noms possibles affichés. */
async function scanAmbArt(m) {
  if (!m || !m.amb || !m.sig || !Array.isArray(m.alts) || m.alts.length < 2 || typeof artPick !== 'function' || collOffline()) return m;
  const l = m.card || 'en', lists = await Promise.all(m.alts.slice(0, 4).map(n => scryArtPrints(n, l, undefined, false).then(ps => (Array.isArray(ps) ? ps : []).map(p => ({ ...p, cn: n })), () => [])));
  if (!SC.el || lists.filter(x => x.length).length < 2) return m;
  const all = []; for (let i = 0; all.length < 24 && lists.some(x => x.length > i); i++) for (const x of lists) if (x[i]) all.push(x[i]);      // les impressions des cartes en alternance : chacune a sa chance dans la limite des comparaisons
  let r = null; try { r = await artPick(m.sig, all); } catch (e) { r = null; }
  const ns = r ? [...new Set((r.p ? [r.p] : r.group || []).map(p => p.cn))] : [];
  SC.art = { name: m.alts.join(' / '), res: !r ? '∅' : ns.length === 1 ? ns[0] + (r.p ? ' ' + r.p.set.toUpperCase() + ' ' + r.p.num : '') + ` · d ${r.d1.toFixed(2)} / ${Number.isFinite(r.d2) ? r.d2.toFixed(2) : '–'}` : '?' };
  if (ns.length !== 1) return m;
  return { ...m, name: ns[0], key: ownKey(ns[0]), score: Math.max(m.score, 0.9), img: ownKey(ns[0]) === m.key ? m.img : '', amb: false, ambBy: 'art' };
}
/** Le nom reconnu dit-il à lui seul la langue de la carte ? Oui s'il a été lu dans une autre langue que l'anglais et que ce nom imprimé n'est pas le nom anglais
 *  (à 20 % près) ; non pour un nom lu en anglais, un nom ambigu entre langues, ou identique à l'anglais (« Edgar Markov », « Atraxa »). */
function scanNameSure(m) {
  if (!m || !m.card || m.amb) return false;
  if (m.card === 'en') { const f = FRX.l !== 'en' && typeof frOf === 'function' ? frOf(m.key) : ''; if (!f) return false; const a = normName(f), b = normName(m.name), n = Math.max(a.length, b.length); return !!a && !!b && lev(a, b, Math.ceil(n * 0.3)) > n * 0.2; }      // lu en anglais alors que le nom de la langue de l'appli est différent : une carte anglaise
  if (m.card !== FRX.l && m.score < 0.9) return false;      // autre langue trouvée de justesse (nom proche d'une autre carte) : la ligne du bas décide
  const pn = (typeof frName === 'function' && frName(m.key, m.card)) || m.raw || '', a = normName(pn), b = normName(m.name || '');
  if (!a || !b) return false;
  const n = Math.max(a.length, b.length);
  return lev(a, b, Math.ceil(n * 0.3)) > n * 0.2;
}
/** Empreinte de l'illustration (scanart.js) et signature du symbole d'extension (scansym.js) ajoutées à la carte reconnue m, capture = la carte (cadrage « carte entière ») ;
 *  comparées aux impressions quand elles sont là (scaned.js). */
function artAttach(m, src) {
  if (!m || m.score < 0.72 || SC.pm || SCS.ed === 'none' || typeof artSig !== 'function') return m;
  const sig = artSig(src), sym = typeof symSig === 'function' ? symSig(src) : null; return sig ? { ...m, sig, ...(sym ? { sym } : {}) } : m;
}
/** Consigne sous la caméra, selon le cadrage. */
const camHint = () => (scanFull() ? T('Carte entière dans le cadre, à 15 cm environ') : CAM_HINT);      // un peu loin : la mise au point tient (trop près, sous la distance minimale de l'objectif, elle cherche)
const auHint = () => (scanFull() ? T('Dans le cadre, à 15 cm environ : elle s\'ajoute seule') : T('Pose la carte, le nom dans la bande : elle s\'ajoute seule'));
/** Cadrage changé (réglages) ou écran ouvert : cadre de l'écran, légendes ; caméra native replacée sur la nouvelle zone. */
async function scanFrameApply() {
  const el = SC.el; if (!el) return;
  const full = scanFull(), was = el.classList.contains('full'); el.classList.toggle('full', full);
  const cap = $('.sc-cap', el); if (cap && !el.classList.contains('auto')) cap.textContent = full ? T('Carte entière') : T('Nom de la carte');
  if (was === full) return;
  scanPaintList();
  if (NAT.on || NAT.p) { natStop(); if (await natStart()) { if (SC.el === el) scanHint(camHint(), ''); } }      // l'aperçu natif ne suit pas la page : arrêté puis reposé sur la nouvelle zone
  else if (SC.stream) scanHint(camHint(), '');
}

/* — File d'attente : les photos sont lues une par une en arrière-plan — */
/** Vignette minuscule (≈ 3 Ko) de la zone lue (box : tiers haut d'une photo), pour reconnaître une photo dans la liste. */
function thumbOf(src, box) {
  try {
    const W = box ? box.w : src.naturalWidth || src.width, H = box ? box.h : src.naturalHeight || src.height, k = Math.min(100 / H, 140 / W), c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(W * k)); c.height = Math.max(8, Math.round(H * k));
    if (box) c.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height); else c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.55); c.width = c.height = 0; return u;
  } catch (e) { return ''; }
}
/** Zone du titre d'une photo de carte entière (portrait) : la même que celle lue en premier. */
const titleBox = src => { const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height; return { x: Math.round(W * 0.04), y: Math.round(H * 0.01), w: Math.round(W * 0.92), h: Math.round(H * 0.17) }; };
/** Photo de la zone lue en bonne qualité (≈ 720 px de large, JPEG) : montrée au-dessus des cartes « à vérifier » ou non reconnues pour savoir de quelle carte il s'agit. Reste en mémoire le temps du scan, jamais enregistrée. */
function shotOf(src, box) {
  try {
    const W = box ? box.w : src.naturalWidth || src.width, H = box ? box.h : src.naturalHeight || src.height, k = Math.min(1, 720 / W), c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(W * k)); c.height = Math.max(8, Math.round(H * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    if (box) x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height); else x.drawImage(src, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.82); c.width = c.height = 0; return u;
  } catch (e) { return ''; }
}
/** Libère la mémoire d'une photo lue (canvas vidé, image détachée) : rien n'est gardé. */
function scanFree(src) {
  try { if (!src) return; if (src.getContext) src.width = src.height = 0; else if (src.removeAttribute) src.removeAttribute('src'); } catch (e) { /* ignore */ }
}
/** job : { label, src | file, thumb } (src : canvas déjà prêt ; file : image à décoder au moment de la lire, pour ne pas garder 20 photos en mémoire). */
function scanEnqueue(job) {
  job.id = ++SC.mid; job.s = SC.session;
  SC.pend.push({ id: job.id, label: job.label, thumb: job.thumb || '' }); SC.queue.push(job); scanPaintList(); scanWork();
}
async function scanWork() {
  if (SC.working) return; SC.working = true;
  try {
    while (SC.queue.length && SC.el) {
      const job = SC.queue.shift(), t0 = performance.now(); let m = null, fail = '';
      try {
        if (!job.src && job.file) { const img = await loadImage(job.file); job.src = img; job.thumb = thumbOf(img, thirdBox(img)); }
        m = await readCard(job.src, await collCatalog(), job.strip, job.card);
        if (!m || m.score < 0.84) job.shot = shotOf(job.src, job.strip ? null : job.card ? cardNameBox(job.src.width, job.src.height) : titleBox(job.src));      // lecture douteuse : on garde une photo lisible de la zone pour comparer
      } catch (e) { fail = e && e.code === 'cdn' ? T('Le module de lecture (OCR) n\'a pas pu être téléchargé. Vérifie ta connexion.') : e && e.code === 'rate' ? T('Scryfall demande une pause…') : ''; }
      if (typeof srKeep === 'function' && job.s === SC.session) srKeep(job, m, t0);      // « Signaler un problème de scan » (scanreport.js) : version réduite et lecture gardées en mémoire
      scanFree(job.src); job.src = null; job.file = null;
      if (!SC.el || job.s !== SC.session) continue;
      SC.ms = performance.now() - t0; SC.pend = SC.pend.filter(p => p.id !== job.id);
      if (m && m.amb && m.sig) m = await scanAmbArt(m);      // nom de plusieurs cartes : l'illustration tranche
      if (m && m.score >= 0.72) m = await scanLotLang(m);      // langue du lot
      if (m && m.score >= 0.72) { if (SC.pm) scanPriceAdd(m); else scanAdd(m, 1, m.score < 0.84, job.shot); scsCue(); scanHint(m.score >= 0.84 ? '✓ ' + m.name : T('À vérifier : {name}', { name: m.name }), m.score >= 0.84 ? 'ok' : 'busy'); }
      else { SC.miss.push({ id: job.id, label: job.label, thumb: job.thumb || '', shot: job.shot || '', raw: (m && m.raw) || SC.raw || '' }); if (fail) scanHint(fail, 'bad'); scanPaintList(); }
    }
  } finally { SC.working = false; SC.workEnd = performance.now(); }
}

/* — Appareil photo : aperçu simple, le cercle prend la photo — */
/** Bande « nom + mana » (le guide à l'écran) en pixels de la vidéo. */
function scanGuideBox() {
  const v = $('.sc-video', SC.el), stage = $('.sc-stage', SC.el), g = $('.sc-guide', SC.el);
  if (!v || !v.videoWidth) return null;
  const s = stage.getBoundingClientRect(), r = g.getBoundingClientRect();
  return coverMap(s.width, s.height, v.videoWidth, v.videoHeight, { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height });
}
function scanCapture() {
  if (!SC.el) return;
  if (NAT.on) {
    if (SC.queue.length >= 12) { toast(T('Patiente un instant : 12 cartes sont déjà en attente de lecture')); return; }
    haptic('tap'); scanFlash(); scanHint('', '');
    const full = scanFull();
    natCapture().then(c => { if (SC.el) scanEnqueue({ label: T('Carte {n}', { n: ++SC.cap }), src: c, strip: !full, card: full, thumb: thumbOf(c, full ? cardNameBox(c.width, c.height) : null) }); }, () => scanHint(T('L\'appareil photo n\'est pas prêt : utilise « Photos »'), 'bad'));
    return;
  }
  const box = scanGuideBox(); if (!box) { toast(T('L\'appareil photo n\'est pas prêt : utilise « Photos »')); return; }
  if (SC.rbusy) { toast(T('La caméra redémarre, une seconde…')); return; }
  if (SC.queue.length >= 12) { toast(T('Patiente un instant : 12 cartes sont déjà en attente de lecture')); return; }
  const c = document.createElement('canvas'); c.width = box.w; c.height = box.h;
  c.getContext('2d').drawImage($('.sc-video', SC.el), box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  haptic('tap'); scanFlash(); scanHint('', '');
  const full = scanFull();
  scanEnqueue({ label: T('Carte {n}', { n: ++SC.cap }), src: c, strip: !full, card: full, thumb: thumbOf(c, full ? cardNameBox(c.width, c.height) : null) });
}
function scanFail(msg) { scanHint(msg, 'bad'); }
/** Pas d'aperçu : la vraie cause remplace le message générique au centre de la zone, et rien dans la bande d'aide (deux messages qui se contredisaient). */
function scanNoCam(stage, msg) { stage.dataset.cam = 'no'; const p = $('.sc-nocam', stage); if (p) p.textContent = msg; scanHint('', ''); }
/** Aperçu qui rame (caméra du navigateur qui s'essouffle) : on la redémarre (2 fois), puis 2 fois en qualité réduite (720p), puis conseil « Photos » (photo de la carte entière). Le compteur repart à zéro après 20 s d'aperçu fluide.
 *  Pendant une lecture (OCR) et 3,5 s après, le téléphone est occupé : ça ne compte pas, la caméra n'y est pour rien. */
function scanWatch(v) {
  if (window.__noFpsWatch || !v.requestVideoFrameCallback) return;
  const el = SC.el, gen = SC.gen, t0 = performance.now(), w = SC.watch = makeFpsWatch(SC.fpsMin, 3000, 2000), wd = makeFpsWatch(0, 1e9, 2000); SC.fps = 0;      // w décide, wd ne fait qu'afficher les i/s
  const tick = now => {
    if (SC.el !== el || SC.gen !== gen || !SC.stream) return;
    SC.fps = wd.feed(now).fps;
    if (SC.working || SC.warm || now - SC.workEnd < 3500 || now - t0 < 2500) w.reset();      // + 2,5 s de mise en route de la caméra (toujours saccadée au démarrage)
    else if (w.feed(now).low) scanSlow();
    v.requestVideoFrameCallback(tick);
  };
  v.requestVideoFrameCallback(tick);
}
async function scanSlow() {
  if (!SC.el || SC.rbusy) return;
  const rf = SC.rf, now = performance.now(); if (now - rf.at > 20000) rf.n = 0;      // l'aperçu est resté fluide un moment : on repart de zéro
  rf.n++; rf.at = now; SC.slowN++;
  if (rf.n <= 4) { if (rf.n === 3) camSetSlow(true); scanHint(rf.n === 3 ? T('Caméra lente : redémarrage en qualité réduite…') : T('Aperçu qui rame : la caméra redémarre…'), 'busy'); await camRefresh(); }      // 2 redémarrages normaux, puis 2 en 720p
  else {
    const n = $('.sc-photo', SC.el); if (n) n.classList.add('hot');
    scanHint(T('La caméra du navigateur est lente sur cet appareil : utilise « Photos » (photo de la carte entière)'), 'bad');
  }
}
/** Redémarre la caméra (arrêt complet puis réouverture, résolution lue dans l'indicateur « lent ») : remet à zéro un flux qui s'est dégradé. */
async function camRefresh() {
  if (!SC.el || SC.rbusy) return; SC.rbusy = true;
  const el = SC.el, v = $('.sc-video', el), stage = $('.sc-stage', el);
  try {
    SC.gen++; if (SC.stream) SC.stream.getTracks().forEach(t => t.stop());      // une seule session par caméra : on libère avant de rouvrir (l'image reste figée à l'écran)
    let s = null;
    for (let i = 0; i < 3 && !s; i++) { await new Promise(r => setTimeout(r, i ? 500 : 200)); if (SC.el !== el) return; try { s = await camOpen(camSlow()); } catch (e) { if (i === 2) throw e; } }
    if (SC.el !== el) { s.getTracks().forEach(t => t.stop()); return; }
    SC.stream = s; SC.restarts++; v.srcObject = s; await v.play().catch(() => {});
    scanHint(camHint(), ''); scanWatch(v); auLampProbe();
  } catch (e) {
    if (SC.el === el) scanNoCam(stage, T('La caméra n\'a pas pu redémarrer. Utilise « Photos ».'));
  } finally { SC.rbusy = false; }
}
/** Écran de diagnostic (5 appuis sur le titre) : fluidité de l'aperçu, résolution réelle, durée de la dernière lecture, tâches longues du navigateur. */
function scanDiag(on) {
  const box = $('.sc-diag', SC.el); if (!box) return; clearInterval(SC.diagT); box.hidden = !on; if (!on) return;
  if (!SC.ltObs && typeof PerformanceObserver !== 'undefined') { try { SC.ltObs = new PerformanceObserver(l => { for (const e of l.getEntries()) SC.lt.push(performance.now()); }); SC.ltObs.observe({ type: 'longtask', buffered: false }); } catch (e) { SC.ltObs = null; } }
  const paint = () => {
    const tr = SC.stream && SC.stream.getVideoTracks()[0], st = (tr && tr.getSettings && tr.getSettings()) || {}, now = performance.now(); SC.lt = SC.lt.filter(t => now - t < 10000);
    box.textContent = [T('aperçu {n} i/s', { n: SC.fps ? SC.fps.toFixed(0) : '–' }), `${st.width || '?'}×${st.height || '?'}${st.frameRate ? ' @' + Math.round(st.frameRate) : ''}`, SC.fixed ? T('plancher 24 i/s') : T('i/s libre'), T('redémarrages {n}', { n: SC.restarts }), T('dernière lecture {n} ms', { n: SC.ms ? Math.round(SC.ms) : '–' }), T('tâches longues {n}/10 s', { n: SC.lt.length }), camSlow() ? T('mode lent (toucher ici : retour au mode normal)') : '', tr && tr.label ? tr.label : ''].filter(Boolean).join(' · ');
    const a = SC.art; if (a) box.textContent += '\n' + T('illustration · {name} : {res}', { name: a.name, res: a.res });      // dernière comparaison d'illustration (scanart.js)
    const y = SC.sym; if (y) box.textContent += '\n' + T('symbole · {name} : {res}', { name: y.name, res: y.res });      // dernière comparaison de symbole d'extension (scansym.js)
    const f = SC.foot; if (f) box.textContent += '\n' + T('ligne du bas · {name} : « {raw} » → {res}', { name: f.name, raw: f.raw || '—', res: f.ft ? [f.ft.codes.join(','), f.ft.nums.join(','), f.ft.lang, f.ft.foil ? '★' : '', f.keep ? T('langue {a} gardée (nom), {b} lue en bas ignorée', { a: langCode(f.card), b: langCode(f.keep) }) : ''].filter(Boolean).join(' ') : '∅' });      // cadrage « carte entière » : ce que la dernière carte a donné
    if (SC.lv.length) box.textContent += '\n' + T('langue du lot : {v}', { v: SC.lv.map(langCode).join(' ') }) + (SC.lotLast ? ` · ${SC.lotLast.name} : ${langCode(SC.lotLast.a)} → ${langCode(SC.lotLast.b)}` : '');      // voix des dernières cartes, dernière carte départagée
  };
  box.onclick = () => { camSetSlow(false); paint(); };
  paint(); SC.diagT = setInterval(paint, 500);
}
/** Ouvre la caméra avec un plancher de 24 i/s : en lumière faible, l'exposition automatique ralentit sinon l'image (15 i/s ou moins sur certains téléphones). Si l'appareil refuse ce plancher, simple préférence de 30 i/s. */
async function camOpen(slow) {
  const base = { facingMode: { ideal: 'environment' }, width: { ideal: slow ? 1280 : 1920 }, height: { ideal: slow ? 720 : 1080 } };
  let err;
  for (const fr of [{ min: 24, ideal: 30 }, { ideal: 30 }]) {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { ...base, frameRate: fr }, audio: false }); SC.fixed = !!fr.min; return s; }
    catch (e) { err = e; if (e && /^(NotAllowed|NotFound|Security|Abort|NotReadable)/.test(e.name)) throw e; }
  }
  throw err;
}
/** Prépare la lecture pendant que tu cadres la première carte : catalogue des noms, moteur OCR (puis le français si c'était la dernière langue lue).
 *  Sans ça, le premier appui attend le téléchargement et le démarrage du moteur (1 à plusieurs secondes). Compte comme « occupé » pour la surveillance de l'aperçu. */
async function scanWarm() {
  const s = SC.session; if (!SC.el || SC.warm) return; SC.warm = true;
  try {
    await Promise.all([collCatalog(), frcWarm()]);
    if (!SC.el || SC.session !== s || (natOcr() && NAT_OCR_OK.has(ocrLangs()[0]))) return; await ocrWorker(ocrLangs()[0]);      // appli Android : ML Kit, pas de moteur à télécharger      // français d'abord : l'anglais ne se charge que si le français ne trouve rien
  } catch (e) { /* hors ligne ou CDN bloqué : le premier appui retentera et dira pourquoi */ }
  finally { SC.warm = false; SC.workEnd = performance.now(); if (SC.el && SC.session === s) othWarm(); }      // autres langues : téléchargées après le moteur OCR (la 1re lecture d'abord)
}
const CAM_HINT = T('Nom de la carte dans la bande, puis appuie sur le cercle');
/* — Appli Android (Capacitor) : appareil photo natif, comme les applis photo (aperçu Camera1 du plugin camera-preview placé derrière la page, sous la bande du guide),
   et lecture du texte par ML Kit sur le téléphone. Dans un navigateur ou la PWA : getUserMedia + Tesseract, inchangés. — */
const NAT = { on: false };
function capPlugin(n) {
  try { const C = typeof window !== 'undefined' && window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.isPluginAvailable && C.isPluginAvailable(n) && C.Plugins && C.Plugins[n] || null; } catch (e) { return null; }
}
const natCam = () => capPlugin('CameraPreview'), natOcr = () => capPlugin('CapacitorPluginMlKitTextRecognition');
async function natStart() {
  const cam = natCam(), el = SC.el, stage = el && $('.sc-stage', el); if (!cam || !stage) return false;
  if (NAT.p) { try { await NAT.p; } catch (e) { /* ignore */ } }      // un démarrage précédent encore en cours : on l'attend (« caméra déjà démarrée » sinon)
  // L'aperçu natif ne se déplace plus une fois posé : on mesure la zone écran ouvert (transition de 0,3 s finie) et bandeau de pub retiré.
  for (let i = 0; i < 20 && SC.el === el && (!el.classList.contains('on') || document.documentElement.classList.contains('ad-on')); i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, reduceMotion() ? 0 : 320));
  if (SC.el !== el) return true;
  const r = stage.getBoundingClientRect();
  document.documentElement.classList.add('nat-cam');      // page transparente au-dessus de l'aperçu natif
  try {
    NAT.p = cam.start({ position: 'rear', toBack: true, x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), disableAudio: true, enableZoom: true, lockAndroidOrientation: true });
    await NAT.p;
    if (SC.el !== el) { await natHalt(); return true; }      // scan fermé pendant le démarrage : la caméra ne doit pas rester allumée
    NAT.on = true; stage.dataset.cam = 'on'; stage.dataset.native = '1'; return true;
  } catch (e) { await natHalt(); return false; }      // démarrage raté : aperçu, page transparente et orientation verrouillée défaits, sinon le repli web et le prochain start (« caméra déjà démarrée ») échouent
  finally { NAT.p = null; }
}
/** Arrêt de la caméra native, que l'aperçu soit déjà affiché ou encore en train de démarrer. */
async function natHalt() { NAT.on = false; document.documentElement.classList.remove('nat-cam'); try { await natCam().stop(); } catch (e) { /* déjà arrêtée */ } }
function natStop() {
  document.documentElement.classList.remove('nat-cam');
  if (NAT.p) { const p = NAT.p; p.then(() => natHalt(), () => {}); return; }      // en cours de démarrage : arrêt dès qu'elle a démarré
  if (!NAT.on) return; natHalt();
}
/** Image de l'aperçu natif → bande du guide (même recadrage que l'aperçu : remplissage centré), en canvas. */
async function natCapture(q = 90) {
  const res = await natCam().captureSample({ quality: q });      // q : 60 pour le scan automatique (comparer deux instants), 90 pour lire
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible')); i.src = 'data:image/jpeg;base64,' + res.value; });
  const stage = $('.sc-stage', SC.el), s = stage.getBoundingClientRect(), g = $('.sc-guide', SC.el).getBoundingClientRect();
  let src = img, W = img.naturalWidth, H = img.naturalHeight;
  // Le plugin rend l'image déjà tournée comme l'écran (portrait en portrait). Seulement si elle arrivait encore couchée par rapport à l'ÉCRAN (ni à la bande, toujours plus large que haute, ni à la fenêtre, plus large que haute en écran partagé haut/bas), on la redresse.
  const so = screen.orientation && screen.orientation.type, land = so ? so.startsWith('landscape') : screen.width > screen.height;
  if ((W > H) !== land) {
    const c = document.createElement('canvas'); c.width = H; c.height = W; const x = c.getContext('2d'); x.translate(H, 0); x.rotate(Math.PI / 2); x.drawImage(img, 0, 0); src = c; W = c.width; H = c.height;
  }
  const box = coverMap(s.width, s.height, W, H, { x: g.left - s.left, y: g.top - s.top, w: g.width, h: g.height });
  const c = document.createElement('canvas'); c.width = box.w; c.height = box.h;
  c.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  scanFree(src); return c;
}
/** ML Kit : toutes les lignes lues, en une passe (l'alphabet latin couvre le français et l'anglais). */
async function natLines(canvas) {
  const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  const r = await natOcr().detectText({ base64Image: b64, rotation: 0 });
  return ((r && r.blocks) || []).flatMap(b => (b.lines || []).map(l => ({ text: String(l.text || '').trim() }))).filter(l => l.text);
}

async function scanCamera() {
  const stage = $('.sc-stage', SC.el);
  if (natCam() && await natStart()) { if (SC.el) scanHint(camHint(), ''); return; }      // appli Android : caméra native
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || (typeof isSecureContext !== 'undefined' && !isSecureContext)) { scanNoCam(stage, T('Appareil photo indisponible ici (il demande https). Utilise « Photos ».')); return; }
  try {
    SC.stream = await camOpen(camSlow());      // appareil déjà repéré comme lent : on repart en 720p
    if (!SC.el) { SC.stream.getTracks().forEach(t => t.stop()); SC.stream = null; return; }
    const v = $('.sc-video', SC.el); v.srcObject = SC.stream; await v.play().catch(() => {});
    stage.dataset.cam = 'on'; scanHint(camHint(), ''); scanWatch(v);      // aucun calcul pendant l'aperçu : le moteur de lecture ne démarre qu'au premier appui
  } catch (e) {
    scanNoCam(stage, e && e.name === 'NotAllowedError' ? T('Accès à l\'appareil photo refusé : autorise-le dans les réglages du navigateur, ou utilise « Photos ».') : e && e.name === 'NotFoundError' ? T('Aucun appareil photo trouvé. Utilise « Photos ».') : T('Appareil photo indisponible. Utilise « Photos ».'));
  }
}

/* — Photos — */
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    img.src = url;
  });
}
/** Photos choisies avec « Photos » (galerie ou appareil photo du téléphone ; cam : une seule à la fois) : une carte par photo, lues l'une après l'autre en arrière-plan. */
function scanPhotos(files, cam) {
  const list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (list.length === 1) cam = true;      // une seule photo (souvent prise à l'instant avec l'appareil photo du téléphone) : comptée comme une capture
  if (cam && SC.queue.length + list.length > 12) { toast(T('Patiente un instant : 12 cartes sont déjà en attente de lecture')); return; }
  list.forEach((f, i) => scanEnqueue({ label: cam ? T('Carte {n}', { n: ++SC.cap }) : T('Photo {n}', { n: i + 1 }) + (f.name && f.name.length <= 24 ? ' · ' + f.name : ''), file: f }));
}

function closeScan() { if (SC.el) SC.el.__close(); }
/** o.lot : scan ouvert depuis « Ajouter des cartes » : « Ajouter » envoie les cartes dans le lot (extension collante) au lieu de la collection seule.
 *  o.remote : « Scan mobile » (téléphone) : chaque carte reconnue part tout de suite vers le lot du PC (mobscan.js), rien n'est ajouté ici ; « Terminer » ferme. */
function openScan(o) {
  closeScan();
  const wrap = document.createElement('div'); wrap.className = 'dv scan'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Scanner des cartes'));
  wrap.innerHTML = `<div class="sc-stage" data-cam="wait"><video class="sc-video" playsinline muted autoplay></video>
      <div class="sc-guide" aria-hidden="true"><span class="sc-cap">${T('Nom de la carte')}</span><i class="sc-g-name"></i><i class="sc-g-foot"></i></div>
      <div class="sc-flash"></div>
      <p class="sc-hint" hidden></p><p class="sc-prog" hidden></p>
      <p class="sc-nocam">${T('Pas d\'appareil photo : utilise « Photos » ci-dessous.')}</p>
      <div class="sc-tools"><button class="sc-ic" type="button" data-act="close" aria-label="${T('Fermer le scan')}"><svg class="i"><use href="#i-back"/></svg></button><h2 class="sc-ttl">${T('Scanner des cartes')}</h2>
        <span class="sc-tr"><button class="sc-ic sc-lamp" type="button" data-act="lamp" aria-pressed="false" aria-label="${T('Allumer la lampe')}" hidden><svg class="i"><use href="#i-bolt"/></svg></button><button class="sc-ic sc-set" type="button" data-act="scset" aria-label="${T('Réglages du scan')}"><svg class="i"><use href="#i-sliders"/></svg></button><button class="sc-ic sc-help" type="button" data-act="note" aria-label="${T('Afficher l\'aide')}" aria-pressed="false">?</button></span></div>
      <div class="sc-modes"><div class="sc-seg" role="radiogroup" aria-label="${T('Mode du scan')}"><button type="button" role="radio" class="sc-amode" data-act="pmode" data-v="0" aria-checked="true">${T('Ajouter')}</button><button type="button" role="radio" class="sc-pmode" data-act="pmode" data-v="1" aria-checked="false" aria-label="${T('Prix rapide : lire une carte sans l\'ajouter')}">${T('Prix')}</button></div><button type="button" class="sc-dest" data-act="scdest" hidden></button><button type="button" class="sc-edm" data-act="scset"></button></div></div>
    <div class="sc-remote" hidden aria-live="polite"></div>
    <div class="sc-cat coll-status" hidden></div>
    <div class="sc-note" hidden><p class="hint">${nmT('Mets le nom de la carte dans la bande et appuie sur le cercle : la lecture se fait en arrière-plan, tu peux enchaîner. Seul le nom est lu (français d\'abord, puis anglais), puis retrouvé dans Scryfall : vérifie la miniature (touche-la pour la voir en grand). Éditions : choisis celle de la 1re carte, les suivantes la prennent si elles y existent ; une carte d\'une autre extension te demande la sienne. « Photos » : une carte par photo, prise en entier et en portrait. Les photos ne sont jamais enregistrées. Auto (en bas à droite) : pose les cartes l\'une après l\'autre, chacune s\'ajoute dès que son nom est immobile. Réglages (en haut) : éditions, langue des cartes, vibration.',
      'Mets le nom de la carte dans la bande et appuie sur le cercle : la lecture se fait en arrière-plan, tu peux enchaîner. Seul le nom est lu ({lang} d\'abord, puis anglais), puis retrouvé dans Scryfall : vérifie la miniature (touche-la pour la voir en grand). Éditions : choisis celle de la 1re carte, les suivantes la prennent si elles y existent ; une carte d\'une autre extension te demande la sienne. « Photos » : une carte par photo, prise en entier et en portrait. Les photos ne sont jamais enregistrées. Auto (en bas à droite) : pose les cartes l\'une après l\'autre, chacune s\'ajoute dès que son nom est immobile. Réglages (en haut) : éditions, langue des cartes, vibration.',
      'Mets le nom de la carte dans la bande et appuie sur le cercle : la lecture se fait en arrière-plan, tu peux enchaîner. Seul le nom est lu (en anglais), puis retrouvé dans Scryfall : vérifie la miniature (touche-la pour la voir en grand). Éditions : choisis celle de la 1re carte, les suivantes la prennent si elles y existent ; une carte d\'une autre extension te demande la sienne. « Photos » : une carte par photo, prise en entier et en portrait. Les photos ne sont jamais enregistrées. Auto (en bas à droite) : pose les cartes l\'une après l\'autre, chacune s\'ajoute dès que son nom est immobile. Réglages (en haut) : éditions, langue des cartes, vibration.')}</p><p class="hint sc-note-full">${T('Carte entière (réglage du cadrage) : la petite ligne en bas à gauche (« 0123 R », « MKM • FR ») est lue aussi : l\'édition exacte est posée d\'office, et la langue imprimée sur la carte retenue. Cartes d\'avant 2014 : l\'édition se choisit comme d\'habitude.')}</p><button class="sc-x" type="button" data-act="note" aria-label="${T('Fermer l\'aide')}"><svg class="i"><use href="#i-close"/></svg></button></div>
    <div class="dv-foot sc-head"><div class="sc-headt"><b class="sc-count">${T('Scanner des cartes')}</b><span class="sc-sub">${T('Nom de la carte dans la bande')}</span></div><div class="sc-total" aria-live="polite" hidden></div><button class="btn" type="button" data-act="done" disabled>${T('Ajouter')}</button></div>
    <p class="sc-diag" hidden></p>
    <div class="dv-scroll sc-list"></div>
    <div class="sc-bar">
      <label class="sc-photo"><span class="sc-bi"><svg class="i"><use href="#i-image"/></svg></span>${T('Photos')}<input type="file" id="scFile" accept="image/*" multiple></label>
      <button class="sc-shot" type="button" data-act="shot" aria-label="${T('Prendre la photo de la carte')}"><i><svg class="i"><use href="#i-pause"/></svg></i></button>
      <span class="sc-bslot"><button class="sc-auto" type="button" role="switch" data-act="auto" aria-checked="false" hidden><span class="sc-sw" aria-hidden="true"><i></i></span>${T('Auto')}</button></span></div>`;
  if (scanFull()) { wrap.classList.add('full'); $('.sc-cap', wrap).textContent = T('Carte entière'); }      // cadrage « carte entière » (réglage par défaut) : cadre de carte, ligne du bas lue aussi
  SC.lot = !!(o && o.lot); SC.deck = !!(o && o.deck); SC.remote = !!(o && o.remote); if (SC.remote) { MOB.sent = new Map(); wrap.classList.add('remote'); } SC.recap = null; SC.el = wrap; SC.pm = false; SC.pq = []; SC.items = new Map(); SC.pr = new Map(); SC.prq = new Map(); SC.lv = []; SC.lotLast = null; SC.stick = SC.lot && LOT.set ? LOT.set : ''; SC.sets = new Map(SC.stick ? [[SC.stick, 1]] : []); SC.setN = 1; SC.lastIt = null; SC.miss = []; SC.pend = []; SC.queue = []; SC.cap = 0; SC.session++; SC.slowN = 0; SC.restarts = 0; SC.rf = { n: 0, at: 0 }; SC.alive = true; SC.warm = false; try { localStorage.removeItem('deckdeal:scpref'); localStorage.removeItem('deckdeal:scnote'); } catch (e) { /* ignore */ } const prevFocus = document.activeElement;
  auReset();
  const stop = () => { auReset(); SC.alive = false; SC.warm = false; clearInterval(SC.diagT); clearTimeout(SC.hintT); SC.queue.forEach(j => scanFree(j.src)); SC.queue = []; SC.pend = []; if (SC.stream) { SC.stream.getTracks().forEach(t => t.stop()); SC.stream = null; } natStop(); };
  const onKey = e => { if (e.key === 'Escape' && !imgView && !sheets.length) { e.stopPropagation(); if (SC.ef) $('.sc-ef [data-ef="close"]').click(); else wrap.__close(); } };      // écran « Éditions à choisir » ouvert : Échap le ferme seul
  wrap.__close = () => {
    if (SC.el !== wrap) return; SC.el = null; stop(); othFree(); if (typeof srFree === 'function') srFree(); document.removeEventListener('keydown', onKey, true);      // srFree : captures gardées pour « Signaler » (scanreport.js)
    if (SC.remote) { SC.remote = false; setTimeout(mobBar, 400); }      // scan mobile terminé : le bandeau revient tant que le PC attend
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240); releaseApp();
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('error', e => { if (e.target && e.target.classList && e.target.classList.contains('sc-th')) e.target.classList.add('bad'); }, true);
  $('#scFile', wrap).onchange = e => { scanPhotos(e.target.files); e.target.value = ''; };
  { let taps = 0, t0 = 0; $('.sc-count', wrap).onclick = () => { const n = performance.now(); taps = n - t0 < 2500 ? taps + 1 : 1; t0 = n; if (taps >= 5) { taps = 0; scanDiag($('.sc-diag', wrap).hidden); } }; }
  wrap.addEventListener('change', e => {
    const sel = e.target.closest && e.target.closest('.lchip select'); if (!sel) return;
    const row = sel.closest('.sc-item'), it = row && SC.items.get(row.dataset.id); if (!it) return;
    const l = sel.value; haptic('tap'); sel.blur(); SC.dirty = false; scanSetLang(it, l); scanPaintList(); langImgFor(it.key, it.name, l);
  });
  wrap.addEventListener('focusout', e => { if (SC.dirty && e.target.matches && e.target.matches('.lchip select')) setTimeout(() => { SC.dirty = false; scanPaintList(); }, 0); });
  wrap.addEventListener('click', e => {
    if (e.target.closest('.lchip')) return;
    const b = e.target.closest('[data-act]');
    if (b) {
      const act = b.dataset.act;
      if (act === 'close') wrap.__close();
      else if (act === 'shot') { if (auOn()) auPause(); else scanCapture(); }      // auto : le cercle met en pause / reprend
      else if (act === 'auto' || act === 'lamp' || act === 'au1' || act === 'au0') auAct(act);
      else if (act === 'frc') frcStart(true);
      else if (act === 'note') scNoteShow($('.sc-note', wrap).hidden);
      else if (act === 'scset') scsSheet();
      else if (act === 'scdest') { if (scanDeckPlace()) toast(T('Les cartes du deck sont rangées dans « {place} » à son enregistrement.', { place: scanDeckPlace() })); else scdPick(scanPaintTools); }
      else if (act === 'pmode') { const on = b.dataset.v === '1'; if (on !== SC.pm) { haptic('tap'); scanPriceMode(on); } }
      else if (act === 'done') { if (SC.remote) scanEdDone(() => wrap.__close()); else if (SC.deck && typeof bdScanDone === 'function' && BD.el) bdScanDone(); else scanRecap(); }      // cartes sans édition : confirmation (scaned.js)
      return;
    }
    if (SC.pm && e.target.closest('.sc-item.pr [data-a]')) {                      // liste de prix : garder la carte (+) ou la retirer de la liste
      const a = e.target.closest('[data-a]'), k = a.closest('.sc-item').dataset.k, it = SC.pq.find(x => x.key === k); if (!it) return;
      haptic('tap');
      if (a.dataset.a === 'pdec') { it.n = Math.max(1, (it.n || 1) - 1); scanPaintList(); }
      else if (a.dataset.a === 'padd') { const nn = it.n || 1, lang = it.l || ''; if (typeof opnTake === 'function' && opnTake([{ k, n: it.name, q: nn, l: lang, eu: Number.isFinite(it.cm) ? it.cm : null, im: it.im || '' }], { toast: true })) { scanPaintList(); return; } collBump(k, it.name, nn, { lang }); collEnrich(); toast(nn > 1 ? T('{n} × {name} ajoutées à ta collection', { n: nn, name: it.name }) : T('{name} ajoutée à ta collection', { name: it.name }), { label: T('Annuler'), fn: () => collBump(k, it.name, -nn, { lang }) }); scanPaintList(); }
      else { SC.pq = SC.pq.filter(x => x !== it); scanPaintList(); }
      return;
    }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const ask = a.closest('.sc-ask');
    if (ask) {                                                                    // bandeau « Édition de la 1re carte » / « Nouvelle extension »
      const it = SC.items.get(ask.dataset.id); if (!it) return;
      if (a.dataset.a === 'edp') { const pr = SC.pr.get(scanPk(it.key, it.l)), p = Array.isArray(pr) ? pr[Number(a.dataset.i)] : null; if (p) { haptic('ok'); scanEdChoose(it.id, p); } }
      else if (a.dataset.a === 'later') { haptic('tap'); scanEdLater(it); }
      else if (a.dataset.a === 'ed') scanEdPick(it);
      else if (a.dataset.a === 'edq') scanEdPick(it, true);      // bandeau : « Chercher une extension » ouvre toutes les éditions, sur la recherche
      return;
    }
    const row = a.closest('.sc-item'); if (!row) return;
    if (row.dataset.m) {
      haptic('tap');
      if (a.dataset.a === 'type') openCollAdd();
      else { SC.miss = SC.miss.filter(m => String(m.id) !== row.dataset.m); scanPaintList(); }
      return;
    }
    const it = SC.items.get(row.dataset.id); if (!it) return;
    if (a.dataset.a === 'ed') { scanEdPick(it); return; }
    haptic('tap');
    if (a.dataset.a === 'inc') it.q = Math.min(999, it.q + 1);
    else if (a.dataset.a === 'dec') {                       // « − » : confirmation d'abord
      confirmMinus(it.name, it.q, 'scan', () => { const c = SC.items.get(it.id); if (!c) return; if (c.q > 1) { c.q--; if (c.fq > c.q) c.fq = c.q; } else SC.items.delete(c.id); scanPaintList(); });
      return;
    }
    else if (a.dataset.a === 'ok') { it.maybe = false; it.shot = ''; }
    else if (a.dataset.a === 'alt') { scanAltPick(it, a.dataset.n); return; }
    else if (a.dataset.a === 'del') SC.items.delete(it.id);
    scanEdPass(); scanPaintList();
  });
  scNoteShow(false);      // aide fermée au départ : « ? » l'ouvre
  document.body.appendChild(wrap); holdApp(); scanPaintTools(); scanPaintList();
  if (typeof opnBands === 'function') opnBands();      // session d'ouverture (opening.js) : bandeau au-dessus de la liste
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); $('.sc-tools [data-act="close"]', wrap).focus({ preventScroll: true }); }));
  haptic('tap'); scanCamera().finally(() => { if (SC.el !== wrap) return; auLampProbe(); auSync(); if (auOn()) scanHint(auHint(), ''); scanWarm(); if (typeof tipSoon === 'function') tipSoon(1200); });      // astuce (tour.js) : session d'ouverture
}
document.addEventListener('visibilitychange', () => { if (document.hidden && SC.el && SC.watch) SC.watch.reset(); });
