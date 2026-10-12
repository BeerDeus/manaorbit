/* ── pubdecks.js : decks publics (« Communauté ») ────────────────────────────────────────────────────────────────────────────
   Publier : un deck Commander de Mes decks (100 cartes, commandant compris), depuis son viewer, par un compte à adresse vérifiée et sous son pseudo ;
   10 decks par compte (PUB_MAX). Document pubdecks/{empreinte SHA-256 de l'UID}_{0…9} (firestore.rules) : une copie de la liste, « Mettre à jour » renvoie
   celle du moment, supprimer le deck de Mes decks le retire aussi (pdDeckGone).
   Le serveur relit ces documents (proxy.mjs › /api/pubdecks), écarte ceux qui sortent du format ou sont signalés 3 fois et sert la liste à tous ;
   l'appli l'ajoute aux decks EDHREC de « À monter » (type Communauté, core.js › edhAddComm). « Signaler ce deck » (feuille du deck) : un signalement
   par compte (pubreports), et le deck disparaît tout de suite de cet appareil. */
const PD = { list: null, at: 0, comm: [], mine: null, mineUid: '', mineP: null, tag: '', tagUid: '' };
const PD_CACHE = 'pub:list', PD_FRESH = 10 * 60e3, PD_WAIT = 1500, PD_HIDE_KEY = 'deckdeal:pubhide:v1';

/* ── Liste de la communauté ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const pdHidden = () => { try { const a = JSON.parse(localStorage.getItem(PD_HIDE_KEY) || '[]'); return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : []); } catch (e) { return new Set(); } };
/** Decks de la liste à montrer ici : sans ceux signalés depuis cet appareil. */
const pdShown = list => { const h = pdHidden(); return (list || []).filter(d => d && typeof d.id === 'string' && !h.has(d.id)); };
/** Liste du serveur ({ at, decks }) ; fresh : relue tout de suite (juste après une publication). null : pas de serveur, hors ligne, liste illisible. */
async function pdFetch(fresh, ms = 6000) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch('api/pubdecks' + (fresh ? '?fresh=1' : ''), { signal: ctl.signal, cache: 'no-cache', headers: { Accept: 'application/json' } });
    const j = r.ok ? await r.json() : null; if (!j || !Array.isArray(j.decks)) return null;
    PD.list = j.decks; PD.at = Date.now(); Cache.set(PD_CACHE, { at: PD.at, decks: j.decks });
    return j.decks;
  } catch (e) { return null; } finally { clearTimeout(t); }
}
/** Decks de la communauté pour « À monter » : la liste de moins de 10 min (mémoire, puis appareil), sinon celle du serveur, sinon une plus ancienne de l'appareil. */
async function pdList() {
  if (PD.list && Date.now() - PD.at < PD_FRESH) return pdShown(PD.list);
  const c = await Cache.get(PD_CACHE, 7 * DAY).catch(() => null), ok = c && Array.isArray(c.decks);
  if (ok && Date.now() - c.at < PD_FRESH) { PD.list = c.decks; PD.at = c.at; return pdShown(c.decks); }
  const got = await pdFetch(false);
  if (got) return pdShown(got);
  if (ok) { PD.list = c.decks; PD.at = c.at; return pdShown(c.decks); }
  return [];
}
const pdSig = list => (list || []).map(d => d.id + ':' + (d.u || '') + ':' + (d.cards ? d.cards.length : 0)).join(',');
/** Données EDHREC chargées : la liste arrive (ou change) → index refait avec elle (edhRead garde l'enregistrement lu). */
function pdApply(list) {
  if (pdSig(list) === pdSig(PD.comm)) return;
  PD.comm = list;
  if (!EDH.rec) return;
  const x = edhRead(EDH.rec); if (!x) return;
  EDH.data = x; EDH.memo = null; if (COLL.el) collPaintBody(true);
}
/** Pour edhLoad : la liste, attendue au plus 1,5 s (au-delà, les decks EDHREC s'affichent sans elle et elle s'ajoute à son arrivée). */
async function pdForEdh() {
  const p = pdList().catch(() => []);
  const first = await Promise.race([p, new Promise(r => setTimeout(() => r(null), PD_WAIT))]);
  if (first) { PD.comm = first; return; }
  p.then(list => { if (list && list.length) pdApply(list); });
}
/** Masque un deck sur cet appareil (signalé). */
function pdHide(id) {
  const h = pdHidden(); h.add(id);
  try { localStorage.setItem(PD_HIDE_KEY, JSON.stringify([...h].slice(-500))); } catch (e) { /* ignore */ }
  pdApply(pdShown(PD.list || PD.comm));
}

/* ── Mes decks publiés ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Empreinte du compte (celle des identifiants pubdecks/{empreinte}_{n}). */
async function pdTag() {
  if (!D.user) return '';
  if (PD.tagUid !== D.user.uid) { PD.tag = await ownerTag(D.user.uid); PD.tagUid = D.user.uid; }
  return PD.tag;
}
/** Decks publiés par le compte : Map id du deck (Mes decks) → { id (document), at, sig }. Lus une fois par compte, tenus à jour ensuite. */
function pdMine(force) {
  const u = D.user; if (!u || !cloudOn() || !D.cloud.pubMine) return Promise.resolve(new Map());
  if (!force && PD.mine && PD.mineUid === u.uid) return Promise.resolve(PD.mine);
  if (!force && PD.mineP && PD.mineUid === u.uid) return PD.mineP;
  PD.mineUid = u.uid;
  const p = PD.mineP = (async () => {
    const tag = await pdTag(), docs = await D.cloud.pubMine(tag), m = new Map();
    for (const d of docs) if (d && d.data && typeof d.data.deck === 'string') m.set(d.data.deck, { id: d.id, at: Number(d.data.updatedAt) || 0, sig: pdDocSig(d.data) });
    if (PD.mineUid === u.uid) PD.mine = m;
    return m;
  })().finally(() => { if (PD.mineP === p) PD.mineP = null; });
  return p;
}
const pdDocSig = x => hash32(JSON.stringify([x.by, x.cmd, x.ci, x.cards]));
/** Première place libre (0 … 9) du compte, ou '' : toutes prises. */
function pdSlot(tag, mine) {
  const used = new Set([...mine.values()].map(v => v.id));
  for (let i = 0; i < PUB_MAX; i++) if (!used.has(tag + '_' + i)) return tag + '_' + i;
  return '';
}

/** Identité de couleur d'une carte (clé de ownKey) : fiche de la collection, cache des decks, sinon commandant EDHREC seul ; null si inconnue. */
function pdCiOf(k) {
  for (const m of [COLL.meta[k], DM[k]]) if (m && typeof m.ci === 'string') return m.ci;
  const e = EDH.data && EDH.data.by.get(k); return e && e.keys.length === 1 ? e.ci : null;
}
/** Identité de couleur des commandants ([{ k, name }]) : lue sur Scryfall si besoin ; null si toujours inconnue (hors ligne). */
async function pdCi(cmd) {
  const need = cmd.filter(c => pdCiOf(c.k) === null);
  if (need.length && scryLeft() <= 0) {
    try { const got = await scryCollection(need.map(c => c.name)); let n = 0; for (const [k, m] of got) if (m && typeof m.ci === 'string') { DM[k] = { ...(DM[k] || {}), eu: m.eu, ci: m.ci, cd: m.cd, im: m.im, cm: m.cm, mc: m.mc, tl: m.tl, cl: m.cl, ar: m.ar }; n++; } if (n) dmSave(); }
    catch (e) { /* hors ligne */ }
  }
  const all = cmd.map(c => pdCiOf(c.k)); if (all.some(x => x === null)) return null;
  const s = new Set(all.join('')); return 'WUBRG'.split('').filter(x => s.has(x)).join('');
}
/** Noms du deck que Scryfall ne connaît pas (le serveur n'accepte que de vraies cartes : aucun texte libre) ; null si la vérification n'a pas pu se faire (hors ligne). */
async function pdUnknown(names) {
  const need = [...new Map(names.map(n => [ownKey(n), n])).entries()].filter(([k]) => !COLL.meta[k] && !DM[k]).map(([, n]) => n), bad = [];
  try {
    for (let i = 0; i < need.length; i += 75) {
      const j = await httpJson(limScry, 'https://api.scryfall.com/cards/collection', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: need.slice(i, i + 75).map(n => ({ name: n.split('//')[0].trim() })) }) });
      for (const x of j.not_found || []) if (x && typeof x.name === 'string') bad.push(x.name);
    }
  } catch (e) { return null; }
  return bad;
}
/** Ce qu'il faut pour publier ce deck : { cmd: [{ k, name }], pub (pubFromText), why: [raisons d'empêchement], long (plus de 100 lignes), bad (nom refusé par le filtre de mots, ou '') }. */
function pdCheck(d) {
  const text = String(d.text || ''), pd = parseDeck(text), keys = [...commandersOf(text, pd.cards, c => dmOf(ownKey(c.key)))].slice(0, 2);
  const pub = pubFromText(text, keys), cmd = keys.map(k => { const c = pd.cards.find(x => x.key === k); return { k: ownKey(k), name: c ? c.name : k }; }), why = [];
  if (!cmd.length) why.push(T('Aucun commandant : mets-le en tête de liste, dans une section « Commander ».'));
  if (pub.n !== PUB_SIZE) why.push(T('Il faut 100 cartes pile, commandant compris : ce deck en a {n}.', { n: nf0(pub.n) }));
  const long = pub.cards.length > PUB_SIZE; if (long) why.push(T('Liste trop longue.'));
  const bad = [...pub.cmd, ...pub.cards.map(l => l.replace(/^\d+ /, ''))].find(n => pubBad(n)) || '';      // mêmes mots refusés que le serveur (core.js › pubBad)
  if (bad) why.push(T('Nom refusé dans la liste : « {name} »', { name: bad }));
  return { cmd, pub, why, long, bad };
}

/* ── Feuille « Publier dans la communauté » (viewer d'un deck de Mes decks) ──────────────────────────────────────────────────── */
async function openPubSheet(deckId) {
  const d = findDeck(deckId); if (!d) return;
  if (!cloudOn()) { toast(T('Connecte-toi pour publier un deck'), { label: T('Compte'), fn: openAccount }); return; }
  if (!acctVerified(D.user)) { toast(T('Vérifie ton adresse e-mail pour publier un deck'), { label: T('Compte'), fn: openAccount }); return; }
  openSheet(T('Publier dans la communauté'), d.name, api => {
    const b = api.body; let mine = null, busy = false, msg = '', ci, unk;      // unk : noms inconnus de Scryfall (undefined : vérification en cours ; null : impossible, le serveur tranchera)
    const chk = pdCheck(d);
    const li = (okk, txt, extra = '') => `<li class="${okk ? 'ok' : 'ko'}"><svg class="i" aria-hidden="true"><use href="#${okk ? 'i-check' : 'i-alert'}"/></svg><span>${txt}</span>${extra}</li>`;
    const paint = () => {
      const cur = mine && mine.get(d.id), used = mine ? mine.size : 0, sig = ci != null && chk.cmd.length ? pdDocSig({ by: PROF.name, cmd: chk.pub.cmd, ci, cards: chk.pub.cards }) : 0;
      const badName = !!PROF.name && !!pubBad(PROF.name), can = !chk.why.length && !!PROF.name && !badName && ci != null && unk !== undefined && !(unk && unk.length) && mine && (cur || used < PUB_MAX) && CTX.pub !== false;
      b.innerHTML = `<p class="hint pub-intro">${T('Ton deck apparaît dans Decks › À monter, type « Communauté », sous ton pseudo. Chacun peut le comparer à sa collection et l\'enregistrer. C\'est une copie : « Mettre à jour » envoie la liste du moment.')}</p>
        <ul class="pub-checks">
          ${li(chk.cmd.length > 0 && ci !== null, chk.cmd.length ? T('Commandant : {name}', { name: esc(chk.cmd.map(c => c.name).join(' + ')) }) + (ci === undefined ? ' · ' + T('couleurs…') : ci === null ? ' · ' + T('couleurs inconnues (hors ligne ?)') : ci ? ' · ' + esc(ci) : ' · ' + T('incolore')) : esc(chk.why[0]))}
          ${li(chk.pub.n === PUB_SIZE, chk.pub.n === PUB_SIZE ? T('100 cartes, commandant compris') : T('Il faut 100 cartes pile, commandant compris : ce deck en a {n}.', { n: nf0(chk.pub.n) }))}
          ${chk.pub.n === PUB_SIZE ? li(!(unk && unk.length), unk === undefined ? T('Vérification des cartes…') : unk === null ? T('Cartes non vérifiées (hors ligne ?) : le serveur les vérifiera') : unk.length ? T('Carte inconnue de Scryfall : {list}', { list: unk.slice(0, 3).map(n => '« ' + esc(n) + ' »').join(', ') + (unk.length > 3 ? ' +' + (unk.length - 3) : '') }) : T('Toutes les cartes existent')) : ''}
          ${li(!!PROF.name && !badName, !PROF.name ? T('Choisis d\'abord un pseudo') : badName ? T('Pseudo refusé pour la communauté : choisis-en un autre') : T('Publié sous le pseudo {name}', { name: '<b>' + esc(PROF.name) + '</b>' }), `<button class="link-btn" type="button" data-pub="prof">${PROF.name ? T('Modifier') : T('Choisir')}</button>`)}
          ${chk.long ? li(false, T('Liste trop longue.')) : ''}${chk.bad ? li(false, T('Nom refusé dans la liste : « {name} »', { name: esc(chk.bad) })) : ''}
          ${li(!mine || !!cur || used < PUB_MAX, mine ? T('{n} / {max} decks publiés', { n: nf0(used), max: PUB_MAX }) + (!cur && used >= PUB_MAX ? ' · ' + T('retire-en un pour publier celui-ci') : '') : T('Lecture de tes decks publiés…'))}
        </ul>
        ${CTX.pub === false ? `<p class="hint pub-off">${T('Ce serveur ne relaie pas encore les decks publics : ils n\'apparaîtront pas dans À monter.')}</p>` : ''}
        ${cur ? `<p class="hint pub-state">${T('Publié le {date}', { date: esc(new Date(cur.at).toLocaleDateString(LOC())) })}${cur.sig !== sig && sig ? ' · ' + T('la liste a changé depuis') : ''}</p>` : ''}
        <p class="hint pub-rules">${T('Pas de contenu offensant dans le pseudo ou le nom : un deck signalé plusieurs fois est retiré.')}</p>
        <div class="status pub-msg" role="status"${msg ? '' : ' hidden'}><span class="dot"></span><span>${esc(msg)}</span></div>`;
      api.setFoot(cur ? `<button class="btn ghost" type="button" data-pub="drop"${busy ? ' disabled' : ''}>${T('Retirer')}</button><button class="btn" type="button" data-pub="go"${busy || !can || cur.sig === sig ? ' disabled' : ''}>${cur.sig === sig ? '✓ ' + T('À jour') : T('Mettre à jour')}</button>`
        : `<button class="btn" type="button" data-pub="go"${busy || !can ? ' disabled' : ''}>${T('Publier')}</button>`);
    };
    const say = m => { msg = m; paint(); };
    api.wrap.addEventListener('click', async e => {
      const x = e.target.closest('[data-pub]'); if (!x || x.disabled) return;
      const act = x.dataset.pub;
      if (act === 'prof') { openProfile(); return; }
      if (busy || !mine) return;
      busy = true; paint();
      try {
        const tag = await pdTag(), cur = mine.get(d.id);
        if (act === 'drop') {
          await D.cloud.pubDrop(cur.id); mine.delete(d.id); haptic('ok'); msg = T('Deck retiré de la communauté');
        } else {
          const id = cur ? cur.id : pdSlot(tag, mine); if (!id) { busy = false; say(T('{max} decks publiés au plus : retire-en un pour publier celui-ci.', { max: PUB_MAX })); return; }
          const data = { o: tag, by: PROF.name, deck: d.id, name: String(d.name || '').slice(0, 120), cmd: chk.pub.cmd, ci, cards: chk.pub.cards, updatedAt: Date.now(), v: 1 };
          await D.cloud.pubSave(id, data); mine.set(d.id, { id, at: data.updatedAt, sig: pdDocSig(data) }); haptic('ok');
          msg = cur ? T('Deck mis à jour : visible dans À monter d\'ici quelques minutes') : T('Deck publié : visible dans À monter d\'ici quelques minutes');
        }
        pdFetch(true).then(list => { if (list) pdApply(pdShown(list)); });
        dvPubPaint();
      } catch (err) { msg = err && err.code === 'permission-denied' ? T('Publication refusée : règles Firestore à publier, ou adresse e-mail pas encore vérifiée.') : T('Publication impossible : réessaie en ligne.'); }
      busy = false; paint();
    });
    const again = () => { if (api.wrap.isConnected) paint(); };
    paint();
    pdMine().then(m => { mine = m; again(); }, () => { mine = new Map(); msg = T('Tes decks publiés sont illisibles : réessaie en ligne.'); again(); });
    if (chk.cmd.length) { ci = undefined; pdCi(chk.cmd).then(v => { ci = v; again(); }); } else ci = null;
    if (chk.pub.n === PUB_SIZE) pdUnknown([...chk.pub.cmd, ...chk.pub.cards.map(l => l.replace(/^\d+ /, ''))]).then(v => { unk = v; again(); }); else unk = [];
    const onProf = () => again(); document.addEventListener('profchange', onProf); const close = api.close; api.close = () => { document.removeEventListener('profchange', onProf); close(); };
  });
}
/** Bouton « Publier » du viewer : « ✓ Publié » si le deck l'est déjà. */
function dvPubPaint() {
  const b = DV.el && $('.dv-pubb', DV.el); if (!b) return;
  const on = !!(PD.mine && PD.mineUid === (D.user && D.user.uid) && PD.mine.has(DV.deckId));
  b.innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-globe"/></svg>${on ? '✓ ' + T('Publié') : T('Publier')}`;
  b.classList.toggle('on', on);
}
/** Le viewer peut-il proposer « Publier » ? Deck de Mes decks, au format Commander. */
const dvPubOk = () => !!(DV.deckId && !DV.live && !DV.pub && !DV.adhoc && findDeck(DV.deckId) && dkFmtOf(DV.text) === 'commander');

/** Deck supprimé de Mes decks (removeDeck) : sa copie publique aussi. */
function pdDeckGone(id) {
  if (!cloudOn() || !D.cloud.pubDrop) return;
  pdMine().then(m => { const p = m.get(id); if (!p) return; m.delete(id); return D.cloud.pubDrop(p.id).then(() => pdFetch(true).then(list => { if (list) pdApply(pdShown(list)); })); }).catch(() => { /* hors ligne : le serveur garde la copie ; la retirer depuis un autre deck n'est plus possible, la suppression du compte l'efface */ });
}
/** Changement de compte : ses decks publiés seront relus. */
function pdUser() { PD.mine = null; PD.mineP = null; PD.mineUid = ''; }

/* ── Signaler un deck de la communauté (feuille du deck, « À monter ») ──────────────────────────────────────────────────────── */
function openPubReport(pid, done) {
  if (!cloudOn()) { toast(T('Connecte-toi pour signaler un deck'), { label: T('Compte'), fn: openAccount }); return; }
  openSheet(T('Signaler ce deck'), null, api => {
    api.body.innerHTML = `<p class="hint">${T('Pseudo ou nom offensant, liste fantaisiste, publicité : signale-le. Il disparaît tout de suite de ton appli, et de la communauté après plusieurs signalements.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-rep="go">${T('Signaler')}</button>`);
    $('[data-rep="go"]', api.foot).onclick = async e => {
      e.target.disabled = true;
      try { await D.cloud.pubReport(pid, await pdTag()); }
      catch (err) { if (!(err && err.code === 'permission-denied')) { e.target.disabled = false; toast(T('Signalement impossible : réessaie en ligne')); return; } }      // déjà signalé par ce compte : refusé par les règles, c'est fait
      pdHide(pid); api.close(); haptic('ok'); toast(T('Merci : ce deck est signalé et masqué pour toi')); if (done) done();
    };
  });
}
