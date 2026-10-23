/* ── partie-qr.js : compteur de vie sans réseau (soirée en boutique) : QR code joueur, ajout d'un joueur par QR code, partie et fin hors ligne ─────────────
   · « Mon QR joueur » (bouton QR de l'en-tête de la préparation, et de la carte « Compteur de vie » de l'accueil pour celui qui ne crée pas la partie) : feuille avec
     le QR code en grand (écran à pleine luminosité dans l'appli Android, gardé allumé), le pseudo, le deck pour cette partie (gardé pour la fois suivante, comme à
     l'écran Rejoindre : deckdeal:partie:join › d) ; il contient la carte joueur signée du compte (partie.js › partieCarte, renouvelée seule avec du réseau) et le deck
     (nom, commandant, image Scryfall). Sans compte, ou carte pas encore reçue : prénom (› n) et deck, l'hôte l'ajoute en invité.
   · « Ajouter un joueur par QR » (préparation, sous « + Invité ») : lecteur de QR code de l'appli (qrscan.js), en continu (un joueur après l'autre). Carte valable
     (signature vérifiée ici, sans réseau) : place « compte » (la partie ira dans son historique) ; expirée, falsifiée : invité, avec un message ; même carte deux
     fois : une seule place ; table ouverte (réseau) : la place s'ajoute aussi à la salle, comme un invité de l'hôte (sa carte reste sur ce téléphone : partieFromRoom).
   · Hors ligne : ni QR code de la table ni « Tout le monde est co-hôte » (préparation), ni « Téléphones de la table » (menu « … ») : un message court le dit.
   · Fin : « Hors ligne : résultat gardé sur ce téléphone… », puis « Résultat envoyé » quand la file part (événement partie-sent de partie.js) ; illustrations
     ratées sans réseau rechargées au retour du réseau. */

/** Joueur ajouté par sa carte joueur (place « compte » dont le jeton est une carte) : pastille « QR joueur » dans la liste de la préparation. */
function puCarteTag(p) { return p && p.sorte === 'compte' && partieCarteRead(p.uid) ? ` <span class="pu-ctag" title="${T('Ajouté par son QR joueur : la partie ira dans son historique')}"><svg class="i" aria-hidden="true"><use href="#i-qr"/></svg>${T('QR joueur')}</span>` : ''; }
/** Message court sans réseau : les autres téléphones ne suivent pas la partie (préparation, menu « … »). */
function puOffHtml() { return `<p class="pu-off" role="status"><svg class="i" aria-hidden="true"><use href="#i-alert"/></svg><span>${T('Hors ligne : les autres téléphones ne suivent pas la partie (ni table en direct ni co-hôte).')}</span></p>`; }
/** Préparation ouverte : lecteur de secours mis de côté pendant qu'il y a du réseau, ma carte joueur renouvelée au besoin (une fois par ouverture). */
function puQrSetup() { if (PU.qrw === PU.st.id) return; PU.qrw = PU.st.id; if (typeof qrScanWarm === 'function') qrScanWarm(); if (D.user && puOnline()) partieCarteSoon({ n: puMe() }).catch(() => {}); }
/** Réseau perdu ou revenu, écran de la partie ouvert : préparation et fin repeintes (options de la table, état de l'envoi) ; compteur : illustrations ratées rechargées. */
function puNetPaint() {
  if (!PU.el || !PU.st) return;
  if (PU.mode === 'setup' || PU.mode === 'end' || (PU.mode === 'game' && puOnline())) puPaint();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', puNetPaint); window.addEventListener('offline', puNetPaint);
  window.addEventListener('partie-sent', e => {      // la file est partie (partie.js › partieFlush)
    if (PU.el && PU.mode === 'end') puPaint();
    else if (e.detail && e.detail.late) toast(TN(e.detail.sent, 'Partie envoyée à ton compte', '{n} parties envoyées à ton compte'));
  });
}
/** Fin de partie : où en est l'envoi du résultat (hors ligne, en cours, envoyé) et les comptes venus par leur QR joueur. */
function puEndNet(r) {
  const cards = r.places.filter(p => p.sorte === 'compte' && partieCarteRead(p.uid)).map(p => p.nom || T('Joueur {n}', { n: p.pos })), q = partieQueue().find(x => x.k === 'res' && x.id === r.id);
  const who = cards.length ? ' ' + T('Elle ira aussi dans l\'historique de {names} (QR joueur).', { names: cards.join(', ') }) : '';
  if (q && q.err) return '';
  if (q && !puOnline()) return `<p class="pu-net off" role="status"><svg class="i" aria-hidden="true"><use href="#i-alert"/></svg><span>${T('Hors ligne : le résultat est gardé sur ce téléphone et partira dès le retour du réseau.')}${esc(who)}</span></p>`;
  if (q) return `<p class="pu-net" role="status"><span>${D.user ? T('Envoi du résultat…') : T('Connecte-toi pour envoyer le résultat : il ira dans ton historique et celui de chaque joueur.')}${esc(who)}</span></p>`;
  return D.user ? `<p class="pu-net ok" role="status"><svg class="i" aria-hidden="true"><use href="#i-check"/></svg><span>${T('Résultat envoyé : partie enregistrée.')}${cards.length ? ' ' + esc(T('Aussi dans l\'historique de {names}.', { names: cards.join(', ') })) : ''}</span></p>` : '';
}

/* ── Mon QR joueur ─────────────────────────────────────────────────────────────────────────────── */
function puMyQr() {
  const decks = () => (typeof allDecks === 'function' ? allDecks().filter(d => d && d.name) : []), pref = puJoinPref();
  let dk = typeof pref.d === 'string' ? pref.d : '', nm = (typeof pref.n === 'string' && pref.n) || (D.user ? puMe() : ''), cmd = typeof pref.c === 'string' ? pref.c : '';
  if (!dk && PU.el && PU.st) { const me = PU.st.places.find(p => p.sorte === 'moi'), d = me && me.deck && decks().find(x => partieStr(x.name, PRT_LEN.deck) === me.deck.nom); if (d) dk = d.id; }      // préparation ouverte : mon deck de cette partie
  openSheet(T('Mon QR joueur'), T('À faire scanner par le téléphone de l\'hôte'), api => {
    api.wrap.classList.add('pu-sheet', 'pu-myqr');
    const ds = decks();
    api.body.innerHTML = `<div class="pu-myqr-show"></div><div class="pu-myqr-opts">
        <div class="field-in pu-myqr-n"><label class="label" for="puQn">${T('Prénom')}</label><input type="text" id="puQn" maxlength="24" autocomplete="off" value="${esc(nm)}"></div>
        ${ds.length ? `<div class="field-in"><label class="label" for="puQd">${T('Mon deck pour cette partie')}</label><label class="sortsel pu-deck"><select id="puQd"><option value="">${T('Aucun')}</option>${ds.map(d => `<option value="${esc(d.id)}"${d.id === dk ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label></div>`
          : `<div class="field-in"><label class="label" for="puQc">${T('Commandant ou deck (facultatif)')}</label><input type="text" id="puQc" maxlength="80" autocomplete="off" value="${esc(cmd)}"></div>`}</div>`;
    const show = $('.pu-myqr-show', api.body), nIn = $('#puQn', api.body), sel = $('#puQd', api.body), cIn = $('#puQc', api.body);
    let img = '', imgFor = '', wait = !!(D.user && puOnline() && CTX.partie);      // wait : carte demandée au serveur, réponse pas encore là
    const paint = () => {
      const card = partieCarte(), now = Date.now(), ok = !!(card && card.x > now), d = ds.find(x => x.id === dk);
      if (d && imgFor !== d.id) { imgFor = d.id; img = puDeckImg(d); if (!img) puDeckImgLoad(d).then(im => { if (im && imgFor === d.id && sheets.includes(api)) { img = im; paint(); } }); }      // image du commandant : connue de l'appli, sinon lue à l'instant
      const deck = d ? partieDeckOf(d, img) : partieDeck({ commandant: cmd }), name = ok ? card.n : partieStr(nm, PRT_LEN.nom);
      $('.pu-myqr-n', api.body).hidden = ok;
      const text = name ? partieJoueurText({ t: ok ? card.t : '', n: name, deck }) : ''; let q = null; try { q = text ? qrSvgLogo(text) : null; } catch (e) { q = null; }
      const st = ok ? T('Carte joueur liée à ton compte, valable jusqu\'au {d} : la partie ira dans ton historique, même sans réseau à la table.', { d: new Date(card.x).toLocaleDateString(LOC(), { day: 'numeric', month: 'long' }) })
        : D.user ? (card ? T('Carte joueur expirée : elle se renouvelle seule dès que le réseau revient. En attendant, l\'hôte t\'ajoute en invité.') : wait ? T('Préparation de ta carte joueur…') : T('Ta carte joueur arrive à la prochaine ouverture de l\'appli avec du réseau. En attendant, l\'hôte t\'ajoute en invité.'))
        : T('Sans compte : l\'hôte t\'ajoute en invité. Connecte-toi pour garder tes parties dans ton historique.');
      show.innerHTML = `<div class="qr-card"><div class="qr-who"><b>${esc(name || T('Ton prénom'))}</b>${ok ? `<span class="pu-ctag"><svg class="i" aria-hidden="true"><use href="#i-check"/></svg>${T('Compte')}</span>` : ''}</div>
          ${q ? `<div class="qr-img" role="img" aria-label="${T('QR code joueur')}" data-qr="${esc(text)}">${q.svg}</div>` : `<p class="hint">${T('Écris ton prénom pour afficher ton QR code.')}</p>`}
          ${deck && (deck.commandant || deck.nom) ? `<small class="pu-myqr-dk">${esc(deck.commandant || deck.nom)}</small>` : ''}</div>
        <p class="hint pu-myqr-st${ok ? ' ok' : ''}">${st}</p>${!D.user && puOnline() ? `<button class="btn ghost small" type="button" data-login>${T('Se connecter')}</button>` : ''}`;
      const box = $('.qr-img', show), svg = box && $('svg', box);
      if (svg) { const fit = () => { const w = Math.min(box.clientWidth || 300, 360), r = window.devicePixelRatio || 1, px = Math.max(2, Math.floor(w * r / q.n)) * q.n / r; svg.style.width = svg.style.height = px + 'px'; }; fit(); requestAnimationFrame(fit); }      // un nombre entier de pixels par module (comme le QR code d'échange)
    };
    paint();
    nIn.addEventListener('input', () => { nm = nIn.value; puJoinPrefSet({ n: partieStr(nm, PRT_LEN.nom) }); paint(); });
    if (sel) sel.onchange = () => { dk = sel.value; puJoinPrefSet({ d: dk }); paint(); };
    if (cIn) cIn.addEventListener('input', () => { cmd = cIn.value; puJoinPrefSet({ c: partieStr(cmd, PRT_LEN.cmd) }); paint(); });
    show.addEventListener('click', e => { if (e.target.closest('[data-login]')) { api.close(); openAccount(); } });
    if (D.user && puOnline()) { const done = () => { wait = false; if (sheets.includes(api)) paint(); }; partieCarteSoon({ n: puMe() }).then(done, done); }      // carte absente, vieille ou d'un autre pseudo : renouvelée
    let wl = null, on = true;
    const lock = async () => { if (!on || wl || !navigator.wakeLock || document.visibilityState !== 'visible') return; try { const l = await navigator.wakeLock.request('screen'); if (!on) { l.release(); return; } wl = l; } catch (e) { wl = null; } };
    const vis = () => { if (document.visibilityState === 'visible') { wl = null; lock(); } };
    document.addEventListener('visibilitychange', vis); lock(); natBright(true);
    const close = api.close;
    api.close = () => { on = false; natBright(false); document.removeEventListener('visibilitychange', vis); try { if (wl) wl.release(); } catch (e) { /* déjà relâché */ } wl = null; close(); };
  });
}

/* ── Ajouter un joueur par QR (préparation) ────────────────────────────────────────────────────── */
function puScanAdd() {
  if (!PU.el || PU.mode !== 'setup') return;
  qrScanOpen({ title: T('Ajouter un joueur par QR'), sub: T('Son QR joueur : « Compteur de vie » › QR, sur son téléphone'), hint: T('Vise le QR joueur : chaque joueur est ajouté dès qu\'il est lu.'), onText: puCardAdd });
}
/** Texte lu sur un QR code joueur → place ajoutée (ou refus) ; → { ok (true : compte, null : rien de neuf ou invité sans compte, false : à lire), msg }. */
async function puCardAdd(text) {
  if (!PU.el || PU.mode !== 'setup' || !PU.st) return { ok: false, msg: T('La partie a déjà commencé.') };
  const j = partieJoueurParse(text);
  if (!j) { const x = partieParseUrl(text); return { ok: false, msg: x && x.table ? T('C\'est le QR code d\'une table : scanne le QR joueur (« Compteur de vie » › QR sur son téléphone).') : T('Ce n\'est pas un QR joueur Mana Orbit.') }; }
  const mine = partieCarte(); if (j.t && mine && partieCarteRead(mine.t).id === partieCarteRead(j.t).id) return { ok: null, msg: T('C\'est ta propre carte joueur : tu es déjà à la table.') };
  if (PU.st.places.length >= PRT_POS_MAX) return { ok: false, msg: T('Table complète : 8 joueurs au plus.') };
  let why = j.bad ? 'bad' : '', acct = false;
  if (j.t) { const ck = await partieCarteCheck(j.t); if (ck.ok === false) why = ck.why; else acct = true; }      // ok null : clé du serveur inconnue ici, le serveur tranchera à l'envoi
  if (!PU.el || PU.mode !== 'setup') return { ok: false, msg: T('La partie a déjà commencé.') };
  const id = acct ? partieCarteRead(j.t).id : '', dup = acct ? PU.st.places.find(p => p.uid && (partieCarteRead(p.uid) || {}).id === id)      // même compte (carte relue, ou renouvelée entre-temps) : une seule place
    : PU.st.places.find(p => p.sorte === 'invite' && partieKey(p.nom) === partieKey(j.n) && puCmd(p) === ((j.deck && (j.deck.commandant || j.deck.nom)) || ''));      // invité : même prénom, même deck
  if (dup) return { ok: null, msg: T('{name} est déjà à la table.', { name: dup.nom || dup.pos }) };
  const next = partieAddPlace(PU.st, { sorte: acct ? 'compte' : 'invite', nom: j.n, ...(acct ? { uid: j.t } : {}), deck: j.deck });
  if (next === PU.st) return { ok: false, msg: T('Table complète : 8 joueurs au plus.') };
  const pos = next.places.find(p => !PU.st.places.some(q => q.pos === p.pos)).pos;
  if (partieRoom() && PU.view && puOnline()) {      // table ouverte : la place s'ajoute aussi à la salle (invité de l'hôte), la carte reste ici
    try {
      if (pos > (PU.view.size || 8)) PU.view = await partieRoomOp('opts', { size: pos });
      const v = await partieRoomOp('add', { pos, n: j.n, ...(j.deck ? { deck: j.deck } : {}) }); PU.view = v; puSet(puFromRoom(next, v));
    } catch (e) { puSet(next); }      // salle injoignable : ici seulement
  } else puSet(next);
  const n = j.n;
  if (acct) return { ok: true, msg: T('{name} ajouté : la partie ira dans son historique.', { name: n }) };
  if (why === 'exp') return { ok: false, msg: T('Carte de {name} expirée : ajouté en invité, la partie n\'ira pas dans son historique. Elle se renouvelle quand son téléphone a du réseau.', { name: n }) };
  if (why === 'bad') return { ok: false, msg: T('Carte de {name} non reconnue : ajouté en invité, la partie n\'ira pas dans son historique.', { name: n }) };
  return { ok: null, msg: T('{name} ajouté en invité (sans compte).', { name: n }) };
}
