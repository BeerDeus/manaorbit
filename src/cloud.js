/* ── cloud.js : compte + decks (Firebase Auth / Firestore). Chargé à la demande, jamais bloquant. ──
   Sans SDK (hors ligne, CSP, file://) l'app reste entièrement utilisable en mode local. */
/** Domaine d'authentification : manaorbit.app (proxy.mjs relaie /__/auth/* vers m2s-mtg.firebaseapp.com : la fenêtre Google dit « continuer vers manaorbit.app »,
 *  validé sur le lien de test le 20 octobre 2026) ; ailleurs (local, tests, ancienne adresse) celui de Firebase. Sans effet sur la session gardée
 *  (clé : apiKey et nom de l'appli) ni sur l'appli Android (connexion Google native). */
const FB_AUTH_SELF = typeof location !== 'undefined' && location.hostname === 'manaorbit.app';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCznNtazqWMhiYlPxce3O0Ss06mycgp6TY',
  authDomain: FB_AUTH_SELF ? 'manaorbit.app' : 'm2s-mtg.firebaseapp.com',
  projectId: 'm2s-mtg',
  storageBucket: 'm2s-mtg.firebasestorage.app',
  messagingSenderId: '760752938824',
  appId: '1:760752938824:web:92327fe6c051b8f2741d7d',
};
const FB_BASE = 'https://www.gstatic.com/firebasejs/12.19.0/';

/** Langue des e-mails Firebase (vérification, mot de passe oublié) et de la fenêtre Google : celle de l'appli (I18N vient de core.js ; absent sous Node). */
const fbLang = () => (typeof I18N !== 'undefined' && I18N && I18N.lang) || 'fr';
/** Traduction (T vient de core.js ; absent quand ce fichier est chargé seul sous Node, pour les tests). */
const tcl = (s, v) => (typeof T === 'function' ? T(s, v) : v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s);
/** Code d'erreur Firebase → message lisible. null = silence (l'utilisateur a juste fermé la fenêtre). */
function authMessage(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/missing-email': 'Saisis ton adresse email.',
    'auth/missing-password': 'Saisis ton mot de passe.',
    'auth/user-not-found': 'Email ou mot de passe incorrect.',
    'auth/wrong-password': 'Email ou mot de passe incorrect.',
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet email. Connecte-toi.',
    'auth/weak-password': 'Mot de passe trop court : 6 caractères minimum.',
    'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
    'auth/network-request-failed': 'Pas de connexion. Réessaie une fois en ligne.',
    'auth/popup-blocked': 'Fenêtre bloquée par le navigateur. Autorise-la ou utilise l\'email.',
    'auth/popup-closed-by-user': null,
    'auth/cancelled-popup-request': null,
    'auth/operation-not-allowed': 'Cette méthode n\'est pas activée dans la console Firebase (Authentication › Mode de connexion).',
    'auth/unauthorized-domain': 'Ce domaine n\'est pas autorisé : ajoute-le dans Firebase › Authentication › Paramètres › Domaines autorisés.',
    'auth/operation-not-supported-in-this-environment': 'La connexion n\'est pas disponible dans ce contexte. Ouvre l\'app en http(s).',
    'auth/user-disabled': 'Ce compte est désactivé.',
    'auth/requires-recent-login': 'Reconnecte-toi pour continuer.',
    'auth/native-google': 'Connexion Google impossible sur ce téléphone. Réessaie, ou utilise ton e-mail.',
    'auth/native-missing': 'Connexion Google indisponible dans cette version de l\'appli : mets-la à jour, ou utilise ton e-mail.',
    'auth/google-refused': 'Google a refusé la connexion : réessaie, ou utilise ton e-mail.',
  };
  if (c in m) return m[c] == null ? null : tcl(m[c]) + (c === 'auth/native-google' && e.detail ? ' (' + e.detail + ')' : '');      // message du plugin : seul indice du problème (« 10: » = empreinte SHA-1 absente de Firebase…)
  return c ? tcl('Connexion impossible ({code}).', { code: c.replace('auth/', '') }) : tcl('Connexion impossible.');
}
/** « Continuer avec Google » (feuille Compte, premier lancement) : le « G » de Google à ses quatre couleurs, bouton clair ou sombre comme le demande
 *  la charte de Google (css/start.css : blanc et bordure grise, ou #131314 avec le thème sombre ; light : toujours blanc, sur le fond sombre du premier lancement). */
const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const googleBtnHtml = (attrs, light) => `<button class="btn btn-g block${light ? ' light' : ''}" type="button" ${attrs}>${GOOGLE_G}<span>${tcl('Continuer avec Google')}</span></button>`;

/** Appli Android : connexion Google native (plugin @capacitor-firebase/authentication, skipNativeAuth). Google refuse sa fenêtre de connexion dans
 *  une WebView : le téléphone choisit le compte, le plugin rend un jeton d'identité Google, et c'est le SDK web qui ouvre la session Firebase avec. null hors appli. */
const natGoogle = () => (typeof natPlugin === 'function' ? natPlugin('FirebaseAuthentication') : null);
/** APK sans le plugin (ancienne, ou construite sans « npm install ») : la fenêtre Google du web y part dans le navigateur externe et ne revient jamais. */
const natGoogleMissing = () => typeof isNativeApp === 'function' && isNativeApp() && !natGoogle();
const natMissingErr = () => Object.assign(new Error('plugin absent'), { code: 'auth/native-missing' });
/** Message d'erreur du plugin, court et sans balisage, ajouté au texte affiché. */
const natShort = s => { const t = String(s || '').replace(/[\u0000-\u001f<>&"'`\\]/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > 80 ? t.slice(0, 79) + '…' : t; };
/** Flux Google : « invalid-credential » y veut dire jeton Google refusé, pas « email ou mot de passe incorrect ». */
const googleErr = e => { throw e && e.code === 'auth/invalid-credential' ? Object.assign(new Error(e.message), { code: 'auth/google-refused' }) : e; };
async function natGoogleCred(m) {
  let r;
  try { r = await natGoogle().signInWithGoogle({ skipNativeAuth: true }); }
  catch (e) {
    const msg = String(e && e.message || e), cancel = /cancel|annul|12501|16:/i.test(String(e && (e.message || e.code) || ''));
    if (!cancel) console.warn('Connexion Google native :', msg);
    throw Object.assign(new Error(msg), { code: cancel ? 'auth/popup-closed-by-user' : 'auth/native-google', detail: natShort(msg) });
  }
  const c = r && r.credential; if (!c || !c.idToken) throw Object.assign(new Error('sans jeton'), { code: 'auth/popup-closed-by-user' });
  return m.auth.GoogleAuthProvider.credential(c.idToken, c.accessToken || undefined);
}

/* ── Sommaire du compte (users/{uid}/meta/sommaire) : beaucoup moins de lectures Firestore ───────────────────────────────────
   Le projet est sur le quota gratuit (50 000 lectures par jour pour TOUS les comptes ; au-delà, Firestore s'arrête jusqu'au lendemain).
   Firestore facture un document envoyé par le serveur = une lecture : une écoute (re)lancée relit tout ce qu'elle suit (ouverture de l'appli,
   retour après plus de 30 min), et chaque modification coûte une lecture à chaque appareil qui l'écoute. Avant : 8 écoutes (decks + 7 documents
   annexes) = 17 lectures à chaque ouverture avec 10 decks. Maintenant :
     sommaire = { v: 1, p: { engaged, history, trade, prefs, profile, scan : leur updatedAt }, d: { idDeck: updatedAt }, at, old? }
   est écrit dans le MÊME lot que chaque deck ou document annexe. Un appareil n'écoute plus que lui et la collection (2 lectures à l'ouverture)
   et ne relit sur le serveur que les documents dont la date diffère de sa copie locale (cache persistant du SDK) ; une modification faite
   ailleurs arrive toujours en direct (sommaire, puis le document changé). L'appli ne voit aucune différence : watch, watchColl et watchMeta
   rendent les mêmes rappels qu'avant (données, écriture en attente, vient du cache).
   Écritures (quota gratuit : 20 000 par jour) : le sommaire coûte une écriture de plus par modification. La collection, de loin le document
   le plus souvent écrit (envois groupés, collection.js), reste donc hors du sommaire, écoutée directement comme avant : chaque envoi = 1 écriture
   (et 1 lecture par autre appareil ouvert, au lieu de 2), pour 1 lecture de plus à l'ouverture. Decks et documents annexes changent rarement :
   pour eux le sommaire fait gagner bien plus de lectures (à chaque ouverture) qu'il ne coûte d'écritures. Règle à tenir : un document modifié
   change TOUJOURS de date (updatedAt), sinon les autres appareils gardent leur copie (decks.js › setDeckCover : date + 1).
   Sécurités (jamais une donnée perdue ni écrasée, au pire quelques lectures de plus) :
   · première ouverture d'un compte sur un appareil, règles Firestore pas encore publiées (écriture du sommaire refusée), sommaire absent ou
     d'un autre format : écoutes d'avant (mode « legacy ») ; le sommaire est créé dès que les règles le permettent (essai une fois par jour) ;
   · au plus toutes les 6 h, avant de s'y fier : nombre et somme des dates des decks et des documents annexes (2 agrégations = 2 lectures)
     comparés au sommaire (plus la date de la collection, connue par son écoute). Écart confirmé par un 2e essai (version de l'appli d'avant
     encore ouverte ailleurs, écriture faite sans le sommaire) : relecture complète,
     sommaire réparé, et tous les appareils du compte repassent aux écoutes d'avant pendant 24 h (champ old) ;
   · scan mobile : le document scan est écouté en direct tant qu'une session est ouverte (on: true) ; les cartes et le signe de vie du PC ne
     changent pas sa date (rien à relire pour les autres appareils) ;
   · conflits gérés comme avant : transaction de la collection, écritures en attente, copie du cache jamais livrée comme venant du serveur
     sans que le sommaire du serveur le confirme. */
const SUM_ID = 'sommaire', SUM_V = 1, SUM_KEY = 'deckdeal:sum:v1', SUM_OUT = 'collection';      // SUM_OUT : document annexe hors du sommaire (écouté directement)
/** Délais (ms, réglables par les tests) : vérification, écoutes d'avant après un écart, nouvel essai de création refusée, 2e essai de la vérification,
 *  fenêtre des écritures groupées ; each : au-delà, les decks sont relus d'une seule requête. */
const SUM = { verify: 6 * 3600e3, legacy: 24 * 3600e3, denied: 24 * 3600e3, init: 3000, recheck: 1500, group: 30, each: 5 };
/** État noté sur l'appareil, par compte : ok (sommaire permis), v (dernière vérification), den (création refusée), leg (écoutes d'avant jusqu'à). */
const sumAll = () => { try { const o = JSON.parse(localStorage.getItem(SUM_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const sumGet = uid => sumAll()[uid] || {};
function sumNote(uid, patch) { try { const o = sumAll(); o[uid] = { ...(o[uid] || {}), ...patch }; localStorage.setItem(SUM_KEY, JSON.stringify(o)); } catch (e) { /* stockage indisponible : on refera le travail */ } }
/** Date d'un document du compte (celle que le sommaire garde) ; 0 sans date. */
const stampOf = d => (d && Number(d.updatedAt)) || 0;
/** Réparation : pour chaque clé, ce que le serveur a (ours) — sauf si un autre appareil l'a changée dans le sommaire pendant la relecture (m0 ≠ m1). */
function sumMerge(m0, m1, ours) {
  m0 = m0 || {}; m1 = m1 || {}; const out = {};
  for (const k of new Set([...Object.keys(m0), ...Object.keys(m1), ...Object.keys(ours)])) {
    if (m1[k] !== m0[k]) { if (k in m1) out[k] = m1[k]; } else if (k in ours) out[k] = ours[k];
  }
  return out;
}

/** Moteur du sommaire pour makeCloud : abonnements (watch*), écritures avec le sommaire, relectures. */
function makeSum(m, db, col) {
  const fs = m.fs, engines = new Map();
  const able = !!(fs.writeBatch && fs.getDocFromCache && fs.getDocsFromCache && fs.getDocFromServer && fs.getDocsFromServer && fs.runTransaction && fs.deleteField);
  const manRef = uid => fs.doc(db, 'users', uid, 'meta', SUM_ID);
  const metaRef = (uid, id) => fs.doc(db, 'users', uid, 'meta', id);
  const deckRef = (uid, id) => fs.doc(col(uid), id);
  const deckQ = uid => fs.query(col(uid), fs.orderBy('updatedAt', 'desc'));
  const refOf = (uid, key) => (key[0] === 'd' ? deckRef(uid, key.slice(2)) : metaRef(uid, key.slice(2)));
  const safe = (f, ...a) => { try { f(...a); } catch (e) { console.error(e); } };
  /** Abonnement suivi directement (écoute d'avant, quel que soit le mode) : la collection. */
  const direct = s => s.kind === 'meta' && s.id === SUM_OUT;

  /* ── Moteur d'un compte ── */
  function engine(uid) {
    let E = engines.get(uid); if (E) return E;
    const ls = sumGet(uid), now = Date.now();
    E = { uid, subs: new Set(), mode: 'wait', man: null, manOff: null, hot: null, plain: new Set(), q: new Map(), last: new Map(),
      canWrite: able && !!ls.ok, first: true, verifying: false, stopped: false, initT: 0 };
    E.ready = new Promise(r => { E.readyRes = r; });
    engines.set(uid, E);
    // première ouverture du compte ici, création refusée récemment, écart constaté : écoutes d'avant pour toute la session
    if (!E.canWrite || (ls.den && now - ls.den < SUM.denied) || (ls.leg && ls.leg > now)) { E.mode = 'legacy'; E.readyRes(); }
    if (able) E.manOff = fs.onSnapshot(manRef(uid), { includeMetadataChanges: true }, s => onMan(E, s), () => { stopMan(E); toLegacy(E); });
    return E;
  }
  function stopMan(E) { if (E.manOff) { const u = E.manOff; E.manOff = null; try { u(); } catch (e) { /* déjà arrêtée */ } } }
  function hotOff(E) { if (E.hot) { const u = E.hot; E.hot = null; try { u(); } catch (e) { /* déjà arrêtée */ } } }
  function legacyOn(E, s) {
    if (s.off || s.lu) return;
    const err = e => s.onErr && s.onErr(e);
    if (s.kind === 'decks') s.lu = fs.onSnapshot(deckQ(E.uid), { includeMetadataChanges: true }, snap => s.onData(snap.docs.map(d => ({ id: d.id, data: d.data() })), snap.metadata.hasPendingWrites), err);
    else s.lu = fs.onSnapshot(metaRef(E.uid, s.id), { includeMetadataChanges: true }, x => s.onData(x.exists() ? x.data() : null, x.metadata.hasPendingWrites, x.metadata.fromCache), err);
  }
  function toLegacy(E) {
    if (E.mode === 'legacy' || E.stopped) return;
    E.mode = 'legacy'; E.readyRes(); stopMan(E); hotOff(E);
    for (const s of E.subs) legacyOn(E, s);
  }
  function toSum(E) { if (E.mode !== 'wait' || E.stopped) return; E.mode = 'sum'; E.readyRes(); resolveAll(E, false); }

  /** Chaque version du sommaire (cache, écriture locale en attente, serveur). */
  function onMan(E, snap) {
    if (E.stopped) return;
    const data = snap.exists() ? snap.data() : null, md = snap.metadata, v1 = !!(data && data.v === SUM_V);
    E.man = { data, pending: md.hasPendingWrites, fromCache: md.fromCache };
    if (v1 && !E.canWrite) { E.canWrite = true; sumNote(E.uid, { ok: 1, den: 0 }); restamp(E); }      // créé ailleurs : les écritures d'ici le tiennent à jour aussi
    if (md.fromCache) { if (E.mode !== 'legacy') resolveAll(E, true); return; }
    const first = E.first; E.first = false;
    if (E.mode === 'legacy') {
      if (first && !v1) initSoon(E);
      if (!md.hasPendingWrites) stopMan(E);      // écoutes d'avant : suivre aussi le sommaire coûterait une lecture de plus par modification
      return;
    }
    if (data && data.old && Date.now() - data.old < SUM.legacy) { sumNote(E.uid, { leg: data.old + SUM.legacy, v: 0 }); return toLegacy(E); }      // écart constaté par un appareil du compte
    if (!v1) {
      if (first) { if (sumGet(E.uid).ok && !data) sumNote(E.uid, { ok: 0 }); else initSoon(E); }      // disparu (compte effacé ailleurs ?) : pas recréé cette fois
      return toLegacy(E);
    }
    if (E.mode === 'wait') { if (!E.verifying) { if (Date.now() - (sumGet(E.uid).v || 0) > SUM.verify) verify(E); else toSum(E); } return; }
    resolveAll(E, false);
  }

  /** Nombre et somme des dates des decks et des documents annexes (2 agrégations = 2 lectures) = ce que dit le sommaire ? true | false | null (impossible).
   *  Seuls les documents datés comptent (updatedAt > 0, exigé par les règles pour tous) : le sommaire, sans updatedAt, n'en fait pas partie ; la collection,
   *  hors du sommaire, y entre avec la date que donne son écoute (getDocFromServer partage la cible de l'écoute ouverte : aucune lecture de plus). */
  async function check(uid, man) {
    if (!(fs.getAggregateFromServer && fs.count && fs.sum && fs.where)) return null;
    const agg = c => fs.getAggregateFromServer(fs.query(c, fs.where('updatedAt', '>', 0)), { n: fs.count(), s: fs.sum('updatedAt') }).then(r => r.data());
    const [a, b, c] = await Promise.all([agg(col(uid)), agg(fs.collection(db, 'users', uid, 'meta')), fs.getDocFromServer(metaRef(uid, SUM_OUT))]);
    const p = { ...(man.p || {}) }; delete p[SUM_OUT];
    if (c.exists()) p[SUM_OUT] = stampOf(c.data());
    const same = (r, o) => { const v = Object.values(o || {}).map(Number).filter(x => x > 0); return Number(r.n) === v.length && Math.abs((Number(r.s) || 0) - v.reduce((x, y) => x + y, 0)) < 0.5; };
    return same(a, man.d) && same(b, p);
  }
  async function verify(E) {
    E.verifying = true;
    try {
      for (let i = 0, bad = 0; i < 4; i++) {
        const man = E.man.data, r = await check(E.uid, man);
        if (E.stopped) return;
        if (E.man.data !== man) continue;      // le sommaire a changé pendant la vérification : on recommence
        if (r === false && !bad++) { await new Promise(res => setTimeout(res, SUM.recheck)); if (E.stopped) return; continue; }      // écriture d'un autre appareil en plein milieu ? 2e essai avant de conclure
        if (r === false) { sumNote(E.uid, { leg: Date.now() + SUM.legacy, v: 0 }); toLegacy(E); repair(E, true).catch(() => {}); return; }
        if (r === true) sumNote(E.uid, { v: Date.now() });
        break;
      }
    } catch (e) { /* hors ligne : vérifié à la prochaine ouverture */ }
    finally { E.verifying = false; }
    toSum(E);
  }
  /** Relecture complète, puis sommaire réécrit (transaction : ce qu'un autre appareil y a changé entre-temps est gardé). old : écart constaté. */
  async function repair(E, old) {
    const uid = E.uid, m0 = (E.man && E.man.data) || {};
    const [ds, ms] = await Promise.all([fs.getDocsFromServer(col(uid)), fs.getDocsFromServer(fs.collection(db, 'users', uid, 'meta'))]);
    const p = {}, d = {};
    for (const x of ms.docs) if (x.id !== SUM_ID && x.id !== SUM_OUT) p[x.id] = stampOf(x.data());
    for (const x of ds.docs) d[x.id] = stampOf(x.data());
    await fs.runTransaction(db, async tx => {
      const s = await tx.get(manRef(uid)), m1 = s.exists() ? s.data() : {};
      const out = { v: SUM_V, p: sumMerge(m0.p, m1.p, p), d: sumMerge(m0.d, m1.d, d), at: Date.now() }, o = old ? Date.now() : m1.old;
      delete out.p[SUM_OUT];      // hors du sommaire (une version en développement l'y mettait)
      if (o) out.old = o;
      tx.set(manRef(uid), out);
    });
  }
  /** Sommaire absent : création (une écriture d'essai d'abord : règles pas publiées → refus, sans rien avoir relu). */
  function initSoon(E) {
    clearTimeout(E.initT);
    E.initT = setTimeout(async () => {
      const uid = E.uid, ls = sumGet(uid);
      if (E.stopped || (ls.den && Date.now() - ls.den < SUM.denied) || (typeof acctHeld === 'function' && acctHeld(uid))) return;      // compte en cours de suppression : rien n'est recréé
      try { await fs.setDoc(manRef(uid), { at: Date.now() }, { merge: true }); }
      catch (e) { if (e && e.code === 'permission-denied') sumNote(uid, { den: Date.now(), ok: 0 }); return; }
      if (E.stopped) return;
      try { await repair(E, false); } catch (e) { return; }
      E.canWrite = true; sumNote(uid, { ok: 1, den: 0, v: Date.now() }); restamp(E);
    }, SUM.init);
  }
  /** Écritures faites ici sans le sommaire (il n'était pas encore permis) : leurs dates y sont reportées, d'après le serveur (transaction). */
  async function restamp(E) {
    if (!E.plain.size || !E.canWrite || E.restamping) return;
    E.restamping = true;
    try {
      if (fs.waitForPendingWrites) await fs.waitForPendingWrites(db);
      const keys = [...E.plain];
      await fs.runTransaction(db, async tx => {
        const ms = await tx.get(manRef(E.uid)); if (!ms.exists() || ms.data().v !== SUM_V) return;
        const p = {}, d = {};
        for (const k of keys) { const s = await tx.get(refOf(E.uid, k)); (k[0] === 'd' ? d : p)[k.slice(2)] = s.exists() ? stampOf(s.data()) : fs.deleteField(); }
        tx.set(manRef(E.uid), { ...(Object.keys(p).length ? { p } : {}), ...(Object.keys(d).length ? { d } : {}) }, { merge: true });
      });
      keys.forEach(k => E.plain.delete(k));
    } catch (e) { sumNote(E.uid, { v: 0 }); }      // hors ligne, refus : la vérification de la prochaine ouverture s'en charge
    finally { E.restamping = false; }
  }

  /* ── Livraison aux abonnés : d'après le sommaire, la copie locale, ou une relecture ── */
  function resolveAll(E, cacheOnly) {
    if (E.mode === 'legacy') return;
    const keys = new Set(); for (const s of E.subs) if (!direct(s)) keys.add(s.kind === 'decks' ? 'decks' : 'p:' + s.id);
    for (const k of keys) resolve(E, k, cacheOnly);
  }
  /** Une livraison à la fois par document ; les demandes qui s'accumulent n'en font qu'une (cacheOnly : sans le serveur). */
  function resolve(E, key, cacheOnly) {
    let q = E.q.get(key); if (!q) E.q.set(key, q = { tail: Promise.resolve(), wait: null });
    if (q.wait) { q.wait.co = q.wait.co && cacheOnly; return q.wait.p; }
    const w = q.wait = { co: cacheOnly };
    w.p = q.tail.then(() => { if (q.wait === w) q.wait = null; return E.stopped || E.mode === 'legacy' ? null : key === 'decks' ? decksNow(E, w.co) : metaNow(E, key.slice(2), w.co); }).catch(e => { console.warn('Sommaire :', e && (e.code || e.message)); return null; });
    q.tail = w.p;
    return w.p;
  }
  const trusted = (E, co) => !co && E.mode === 'sum' && E.man && !E.man.fromCache && E.man.data && E.man.data.v === SUM_V;
  function emitMeta(E, id, data, pending, fromCache) {
    const k = stampOf(data) + '|' + (data ? 1 : 0) + '|' + !!pending + '|' + !!fromCache;
    if (E.last.get('p:' + id) === k) return;
    E.last.set('p:' + id, k);
    for (const s of E.subs) if (s.kind === 'meta' && s.id === id && !s.lu) safe(s.onData, data, !!pending, !!fromCache);
  }
  async function metaNow(E, id, co) {
    if (id === 'scan' && E.hot) return null;      // scan en direct : son écoute livre tout
    const key = 'p:' + id, md = E.man && E.man.data, trust = trusted(E, co), inMan = !!(md && md.p && Object.prototype.hasOwnProperty.call(md.p, id));
    const stamp = inMan ? Number(md.p[id]) || 0 : -1;
    if (trust && !E.man.pending && E.last.get(key) === (inMan ? stamp + '|1|false|false' : '0|0|false|false')) return { data: undefined, same: true };      // rien de neuf pour lui
    let c = null;
    try { const s = await fs.getDocFromCache(metaRef(E.uid, id)); c = { data: s.exists() ? s.data() : null, pending: s.metadata.hasPendingWrites }; } catch (e) { /* pas dans le cache */ }
    if (!trust) { emitMeta(E, id, c ? c.data : null, c && c.pending, true); return null; }
    if (!inMan) { emitMeta(E, id, null, c && c.pending, false); return { data: null }; }      // absent du compte (sommaire à jour)
    // copie confirmée par le sommaire, ou écrite ici et pas encore partie (la plus récente : le serveur la confirmera)
    if (c && c.data && (c.pending || stampOf(c.data) === stamp)) { emitMeta(E, id, c.data, c.pending, false); if (id === 'scan' && c.data.on === true) hotOn(E); return { data: c.data }; }
    if (id === 'scan') { hotOn(E); return null; }      // session de scan ouverte ou fermée ailleurs : écoute directe (1 lecture, comme une relecture)
    try {
      const s = await fs.getDocFromServer(metaRef(E.uid, id)), data = s.exists() ? s.data() : null;
      if (!E.stopped && E.mode !== 'legacy') emitMeta(E, id, data, false, false);
      return { data };
    } catch (e) { if (c) emitMeta(E, id, c.data, c.pending, true); return null; }      // hors ligne : la copie locale, en attendant
  }
  function emitDecks(E, docs, pending) {
    const k = docs.map(x => x.id + ':' + stampOf(x.data)).join(',') + '|' + !!pending;
    if (E.last.get('decks') === k) return;
    E.last.set('decks', k);
    for (const s of E.subs) if (s.kind === 'decks' && !s.lu) safe(s.onData, docs.map(x => ({ id: x.id, data: x.data })), !!pending);
  }
  async function decksNow(E, co) {
    const md = E.man && E.man.data, dm = md && md.v === SUM_V ? md.d || {} : null, trust = trusted(E, co);
    let snap = null; try { snap = await fs.getDocsFromCache(deckQ(E.uid)); } catch (e) { /* cache indisponible */ }
    const have = new Map(), pend = new Set();
    for (const x of snap ? snap.docs : []) { have.set(x.id, x.data()); if (x.metadata.hasPendingWrites) pend.add(x.id); }
    // decks du compte : ceux du sommaire, plus ceux écrits ici pas encore confirmés (ou écrits sans le sommaire)
    const keep = id => !dm || Object.prototype.hasOwnProperty.call((E.man && E.man.data && E.man.data.d) || dm, id) || pend.has(id) || E.plain.has('d:' + id);
    const list = () => [...have].filter(([id]) => keep(id)).map(([id, data]) => ({ id, data })).sort((a, b) => stampOf(b.data) - stampOf(a.data));
    if (trust) {
      const need = Object.keys(dm).filter(id => !pend.has(id) && !(have.has(id) && stampOf(have.get(id)) === (Number(dm[id]) || 0)));      // écrit ici, pas encore parti : la copie locale est la plus récente
      if (need.length) {
        try {
          if (need.length > SUM.each) { const all = await fs.getDocsFromServer(col(E.uid)); for (const x of all.docs) have.set(x.id, x.data()); }      // nouvel appareil : une seule requête
          else for (const r of await Promise.all(need.map(id => fs.getDocFromServer(deckRef(E.uid, id))))) { if (r.exists()) have.set(r.id, r.data()); else have.delete(r.id); }
        } catch (e) { emitDecks(E, list(), pend.size > 0); return null; }      // hors ligne : la copie locale
        if (E.stopped || E.mode === 'legacy') return null;
      }
    }
    emitDecks(E, list(), pend.size > 0);
    return { data: null };
  }
  /** Scan mobile : écoute directe du document tant qu'une session est ouverte. */
  function hotOn(E) {
    if (E.hot || E.stopped || E.mode === 'legacy') return;
    E.hot = fs.onSnapshot(metaRef(E.uid, 'scan'), { includeMetadataChanges: true }, s => {
      const data = s.exists() ? s.data() : null, md = s.metadata;
      E.last.delete('p:scan');
      for (const x of E.subs) if (x.kind === 'meta' && x.id === 'scan' && !x.lu) safe(x.onData, data, md.hasPendingWrites, md.fromCache);
      if (!md.fromCache && !md.hasPendingWrites && !(data && data.on === true)) { hotOff(E); E.last.set('p:scan', stampOf(data) + '|' + (data ? 1 : 0) + '|false|false'); }      // session fermée
    }, err => { hotOff(E); for (const x of E.subs) if (x.kind === 'meta' && x.id === 'scan' && x.onErr) safe(x.onErr, err); });
  }

  /* ── Écritures ── */
  /** Après une écriture locale : copie du cache relivrée (le sommaire en attente, s'il y en a un, relance la livraison lui aussi). */
  function touched(uid, keys) {
    const E = engines.get(uid); if (!E || E.mode !== 'wait') return;      // suivi par le sommaire : sa version en attente relance la livraison
    for (const k of keys) resolve(E, k[0] === 'd' ? 'decks' : k, E.mode !== 'sum');
  }
  function denied(uid) {
    sumNote(uid, { ok: 0, den: Date.now() });
    const E = engines.get(uid); if (E) { E.canWrite = false; toLegacy(E); }
  }
  const allowed = uid => { const E = engines.get(uid); return E ? E.canWrite : able && !!sumGet(uid).ok; };
  /** Écrit des documents du compte avec leurs dates dans le sommaire (même lot). entries : [[clé 'd:id' | 'p:id', date | null (supprimé)]].
   *  Écritures demandées dans la même fenêtre (SUM.group ms, imperceptible) : un seul lot, une seule mise à jour du sommaire (deck supprimé + deck
   *  monté + lien retiré : 3 écritures au lieu de 4 ; decks.js › metaFlush les fait partir ensemble). Sommaire pas (encore) permis : écriture seule,
   *  notée pour y être reportée plus tard. Refusé (règles retirées ?) : écriture seule. */
  function put(uid, entries, ops, plain) {
    const it = { keys: entries.map(e => e[0]), entries, ops, plain };
    if (!it.keys.length) return plain();
    if (!allowed(uid)) return putPlain(uid, it);
    let g = groups.get(uid);
    if (!g) { g = []; groups.set(uid, g); setTimeout(() => { if (groups.get(uid) === g) groups.delete(uid); commit(uid, g); }, SUM.group); }
    return new Promise((res, rej) => { it.res = res; it.rej = rej; g.push(it); });
  }
  const groups = new Map();
  function putPlain(uid, it) {
    const E = engines.get(uid); if (E) it.keys.forEach(k => E.plain.add(k));
    const pr = it.plain(); touched(uid, it.keys); return pr;
  }
  function commit(uid, items) {
    const settle = (x, pr) => pr.then(x.res, x.rej);
    if (!allowed(uid)) { items.forEach(x => settle(x, Promise.resolve().then(() => putPlain(uid, x)))); return; }      // refus constaté entre-temps
    const b = fs.writeBatch(db), p = {}, d = {}, keys = [];
    items = items.filter(x => { try { x.ops(fs.writeBatch(db)); return true; } catch (e) { x.rej(e); return false; } });      // données refusées par le SDK (champ undefined…), essayées sur un lot à part : ce document seul échoue
    if (!items.length) return;
    items.forEach(x => x.ops(b));
    for (const x of items) for (const [k, v] of x.entries) { (k[0] === 'd' ? d : p)[k.slice(2)] = v === null ? fs.deleteField() : v; keys.push(k); }
    b.set(manRef(uid), { ...(Object.keys(p).length ? { p } : {}), ...(Object.keys(d).length ? { d } : {}) }, { merge: true });
    const pr = b.commit();
    touched(uid, keys);
    pr.then(() => items.forEach(x => x.res()), err => {
      if (items.length > 1) { items.forEach(x => settle(x, Promise.resolve().then(() => commitOne(uid, x)))); return; }      // lot refusé : chacun seul, un document refusé ne fait pas échouer les autres
      settle(items[0], refused(uid, items[0], err));
    });
  }
  function commitOne(uid, x) {
    if (!allowed(uid)) return putPlain(uid, x);
    const b = fs.writeBatch(db), p = {}, d = {};
    x.ops(b);
    for (const [k, v] of x.entries) (k[0] === 'd' ? d : p)[k.slice(2)] = v === null ? fs.deleteField() : v;
    b.set(manRef(uid), { ...(Object.keys(p).length ? { p } : {}), ...(Object.keys(d).length ? { d } : {}) }, { merge: true });
    return b.commit().catch(err => refused(uid, x, err));
  }
  /** Lot refusé : permission refusée → l'écriture seule ; si elle passe, c'est le sommaire qui est refusé (règles pas publiées, ou republiées sans lui). */
  function refused(uid, x, err) {
    if (!(err && err.code === 'permission-denied')) return Promise.reject(err);
    return x.plain().then(r => { denied(uid); const E = engines.get(uid); if (E) x.keys.forEach(k => E.plain.add(k)); return r; });
  }
  /** Collection : transaction seule, comme avant (hors du sommaire : 1 lecture + 1 écriture par envoi). */
  function tx(uid, fn) {
    const ref = metaRef(uid, SUM_OUT);
    return fs.runTransaction(db, async t => {
      const s = await t.get(ref), out = fn(s.exists() ? s.data() : null);
      if (out) t.set(ref, out);
      return out;
    });
  }
  /** Lecture « sur le serveur » d'un document annexe : sommaire suivi et à jour → la copie confirmée (aucune lecture) ; sinon le serveur.
   *  Collection : le serveur (l'écoute ouverte en partage la cible : rien à relire si elle est à jour). */
  async function pull(uid, id) {
    const E = engines.get(uid);
    if (id === SUM_OUT) { const s = await fs.getDocFromServer(metaRef(uid, id)); return { data: s.exists() ? s.data() : null }; }
    if (E && E.mode === 'wait') await Promise.race([E.ready, new Promise(r => setTimeout(r, 4000))]);
    if (E && trusted(E, false)) { const r = await resolve(E, 'p:' + id, false); if (r && r.data !== undefined) return { data: r.data }; if (r && r.same) { const c = await fs.getDocFromCache(metaRef(uid, id)).catch(() => null); if (c) return { data: c.exists() ? c.data() : null }; } }
    const s = await fs.getDocFromServer(metaRef(uid, id)); return { data: s.exists() ? s.data() : null };
  }
  function sub(uid, s) {
    const E = engine(uid); E.subs.add(s);
    if (E.mode === 'legacy' || direct(s)) legacyOn(E, s);
    else { E.last.delete(s.kind === 'decks' ? 'decks' : 'p:' + s.id); resolve(E, s.kind === 'decks' ? 'decks' : 'p:' + s.id, E.mode !== 'sum'); }
    return () => {
      s.off = true; E.subs.delete(s);
      if (s.lu) { const u = s.lu; s.lu = null; try { u(); } catch (e) { /* déjà arrêtée */ } }
      if (!E.subs.size && engines.get(uid) === E) { E.stopped = true; clearTimeout(E.initT); stopMan(E); hotOff(E); engines.delete(uid); E.readyRes(); }
    };
  }
  return { sub, put, tx, pull, manRef, metaRef, deckRef, state: uid => { const E = engines.get(uid); return E ? { mode: E.mode, canWrite: E.canWrite, hot: !!E.hot, plain: [...E.plain] } : null; } };
}

/** Construit l'API cloud à partir des modules du SDK (injectables pour les tests). */
function makeCloud(m) {
  const app = m.app.getApps().length ? m.app.getApp() : m.app.initializeApp(FIREBASE_CONFIG);
  const auth = m.auth.getAuth(app);
  auth.languageCode = fbLang();
  let db;
  try { db = m.fs.initializeFirestore(app, { localCache: m.fs.persistentLocalCache({ tabManager: m.fs.persistentMultipleTabManager() }) }); }
  catch (e) { db = m.fs.getFirestore(app); }
  const col = uid => m.fs.collection(db, 'users', uid, 'decks');
  const sm = makeSum(m, db, col), mref = sm.metaRef, dref = sm.deckRef;
  return {
    onUser: cb => m.auth.onAuthStateChanged(auth, cb),
    signIn: (email, pw) => m.auth.signInWithEmailAndPassword(auth, email, pw),
    signUp: (email, pw) => m.auth.createUserWithEmailAndPassword(auth, email, pw),
    google: async () => {
      if (natGoogle()) return m.auth.signInWithCredential(auth, await natGoogleCred(m)).catch(googleErr);      // appli Android
      if (natGoogleMissing()) throw natMissingErr();
      const p = new m.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return m.auth.signInWithPopup(auth, p).catch(googleErr);
    },
    reset: email => { auth.languageCode = fbLang(); return m.auth.sendPasswordResetEmail(auth, email); },
    /** Lien de vérification de l'adresse (compte e-mail), dans la langue de l'appli. Retour vers l'appli après le clic (page https d'où il est demandé) ;
     *  adresse de retour refusée par Firebase (domaine absent des domaines autorisés) : lien par défaut, sans retour. */
    async verify() {
      const u = auth.currentUser; if (!u) throw Object.assign(new Error('déconnecté'), { code: 'auth/no-current-user' });
      auth.languageCode = fbLang();
      const back = typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin + location.pathname : '';
      if (back) {
        try { return await m.auth.sendEmailVerification(u, { url: back }); }
        catch (e) { if (!/continue-uri|unauthorized-domain/.test((e && e.code) || '')) throw e; }
      }
      return m.auth.sendEmailVerification(u);
    },
    /** Relit le compte sur le serveur (adresse vérifiée entre-temps ?) : Firebase met à jour l'objet utilisateur sur place, sans rappeler onUser. */
    reload: () => (auth.currentUser ? m.auth.reload(auth.currentUser) : Promise.resolve()),
    signOut: () => { const g = natGoogle(); if (g) Promise.resolve(g.signOut()).catch(() => {}); return m.auth.signOut(auth); },      // appli : oublie aussi le compte Google choisi (le sélecteur réapparaît)
    /** Decks de l'utilisateur en temps réel, du plus récent au plus ancien : onData([{ id, data }], écritureEnAttente). Par le sommaire (voir makeSum). */
    watch: (uid, onData, onErr) => sm.sub(uid, { kind: 'decks', onData, onErr }),
    newId: uid => m.fs.doc(col(uid)).id,
    save: (uid, id, data) => sm.put(uid, [['d:' + id, stampOf(data)]], b => b.set(dref(uid, id), data), () => m.fs.setDoc(dref(uid, id), data)),
    remove: (uid, id) => sm.put(uid, [['d:' + id, null]], b => b.delete(dref(uid, id)), () => m.fs.deleteDoc(dref(uid, id))),
    /** Collection possédée : un seul document users/{uid}/meta/collection { text, count, updatedAt }. onData(données | null, écritureEnAttente, vientDuCache).
     *  Écoutée directement (hors du sommaire, voir makeSum). */
    watchColl: (uid, onData, onErr) => sm.sub(uid, { kind: 'meta', id: 'collection', onData, onErr }),
    saveColl: (uid, data) => m.fs.setDoc(mref(uid, SUM_OUT), data),
    /** Lecture-modification-écriture atomique : fn(données | null) retourne le nouveau document (ou null = rien à écrire). Rejouée si un autre appareil écrit entre-temps. Exige le réseau. */
    txColl: (uid, fn) => sm.tx(uid, fn),
    /** Version du serveur : { data | null } (l'écoute ouverte à jour la donne sans relecture). */
    pullColl: uid => sm.pull(uid, 'collection'),
    /** Données annexes du compte (users/{uid}/meta/{engaged|history|trade|prefs|profile|scan}) : mêmes gestes que la collection. */
    watchMeta: (uid, id, onData, onErr) => sm.sub(uid, { kind: 'meta', id, onData, onErr }),
    saveMeta: (uid, id, data) => sm.put(uid, [['p:' + id, stampOf(data)]], b => b.set(mref(uid, id), data), () => m.fs.setDoc(mref(uid, id), data)),
    /** Modification de quelques champs (le reste du document est gardé). Avec updatedAt : date reportée dans le sommaire ; sans (signe de vie du scan mobile) : rien à relire ailleurs. */
    updMeta: (uid, id, data) => ('updatedAt' in data ? sm.put(uid, [['p:' + id, stampOf(data)]], b => b.update(mref(uid, id), data), () => m.fs.updateDoc(mref(uid, id), data)) : m.fs.updateDoc(mref(uid, id), data)),
    /** Scan mobile (users/{uid}/meta/scan) : le téléphone ajoute des cartes, le PC retire celles qu'il a reçues ; arrayUnion / arrayRemove : aucun conflit entre les deux.
     *  Date inchangée : les deux appareils écoutent le document en direct pendant la session, les autres n'ont rien à relire. */
    scanPush: (uid, items) => m.fs.updateDoc(mref(uid, 'scan'), { items: m.fs.arrayUnion(...items) }),
    scanTake: (uid, items) => m.fs.updateDoc(mref(uid, 'scan'), { items: m.fs.arrayRemove(...items) }),
    pullMeta: (uid, id) => sm.pull(uid, id),
    saveMany: (uid, items) => sm.put(uid, items.map(d => ['d:' + d.id, stampOf(d.data)]), b => items.forEach(d => b.set(dref(uid, d.id), d.data)), () => { const b = m.fs.writeBatch(db); items.forEach(d => b.set(dref(uid, d.id), d.data)); return b.commit(); }),
    /** État du sommaire pour un compte (tests, diagnostic) : { mode: 'wait' | 'sum' | 'legacy', canWrite, hot, plain } ou null. */
    sumState: uid => sm.state(uid),
    /** Partages publics (shares/{id}) : identifiant aléatoire (non devinable), écriture, suppression. Lus par le visiteur via l'API REST (shareFetch). */
    /** Suppression du compte. Firebase exige une connexion récente : mot de passe redemandé, ou fenêtre Google. */
    provider: () => { const u = auth.currentUser; return u && u.providerData.some(p => p.providerId === 'password') ? 'password' : 'google'; },
    reauth(pw) {
      const u = auth.currentUser; if (!u) return Promise.reject(Object.assign(new Error('déconnecté'), { code: 'auth/no-current-user' }));
      if (pw == null && natGoogle()) return natGoogleCred(m).then(c => m.auth.reauthenticateWithCredential(u, c)).catch(googleErr);
      if (pw == null && natGoogleMissing()) return Promise.reject(natMissingErr());
      if (pw == null) { const p = new m.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return m.auth.reauthenticateWithPopup(u, p).catch(googleErr); }
      return m.auth.reauthenticateWithCredential(u, m.auth.EmailAuthProvider.credential(u.email, pw));
    },
    /** Efface tout ce que le compte a en ligne : liens publics (liste d'échange, decks partagés), decks publics, decks, documents annexes. Exige le réseau.
     *  local : liens connus de cet appareil (créés ici, peut-être jamais arrivés dans le document « trade » du compte). */
    async wipe(uid, local = []) {
      const ref = (...p) => m.fs.doc(db, 'users', uid, ...p);
      // lectures en parallèle (hors ligne, chacune attend ~10 s avant d'échouer) ; decks illisibles : arrêt avant d'avoir rien effacé
      const slow = new Promise((ok, ko) => setTimeout(() => ko(Object.assign(new Error('Serveur injoignable'), { code: 'unavailable' })), 12000));      // le SDK peut attendre longtemps avant de se déclarer hors ligne
      const [tr, decks] = await Promise.race([Promise.all([m.fs.getDocFromServer(ref('meta', 'trade')).catch(() => null), m.fs.getDocsFromServer(col(uid))]), slow]), td = tr && tr.exists() ? tr.data() : {};
      const shares = [...new Set([td.share, ...Object.values(td.dsh || {}), ...local].filter(x => typeof x === 'string' && x))];
      let failed = 0;
      for (const id of shares) {
        const s = m.fs.doc(db, 'shares', id);
        // lien absent (déjà retiré, jamais créé) : rien à faire, et la règle refuserait de l'effacer (aucun propriétaire à comparer)
        try { if ((await m.fs.getDocFromServer(s)).exists()) await m.fs.deleteDoc(s); }
        catch (e) { if (e && e.code === 'not-found') continue; failed++; console.warn('Lien public non effacé :', id, e && e.code); }      // on continue : le reste du compte doit partir
      }
      // decks publics (Communauté) : ceux du compte (o = empreinte de l'UID), chacun à part ; les signalements faits par le compte ne portent que son empreinte
      const tag = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid)))].map(x => x.toString(16).padStart(2, '0')).join('');
      const pubs = await m.fs.getDocsFromServer(m.fs.query(m.fs.collection(db, 'pubdecks'), m.fs.where('o', '==', tag))).catch(e => { failed++; console.warn('Decks publics illisibles :', e && e.code); return { docs: [] }; });
      for (const d of pubs.docs) { try { await m.fs.deleteDoc(d.ref); } catch (e) { failed++; console.warn('Deck public non retiré :', d.id, e && e.code); } }
      // sommaire d'abord : les autres appareils repassent aussitôt aux écoutes d'avant et voient les documents disparaître (compte supprimé ailleurs, decks.js)
      const refs = [ref('meta', SUM_ID), ...decks.docs.map(d => d.ref), ...['collection', 'engaged', 'history', 'trade', 'profile', 'scan', 'prefs', 'masterset', 'progress', 'prices'].map(id => ref('meta', id)), ref('binder', 'lands')];
      for (let i = 0; i < refs.length; i += 400) { const b = m.fs.writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
      return { decks: decks.docs.length, shares: shares.length, pub: pubs.docs.length, failed };
    },
    deleteUser: () => m.auth.deleteUser(auth.currentUser),
    /** Cache hors ligne de Firestore (decks, collection… du compte) : arrêt du client, puis effacement. Ensuite plus rien ne marche sans recharger la page. */
    clearLocal: async () => { await m.fs.terminate(db); await m.fs.clearIndexedDbPersistence(db); },
    /** Decks publics (pubdecks/{empreinte}_{0…9}, voir pubdecks.js) : ceux du compte (lus sur le serveur), publier, retirer ; signaler celui d'un autre (pubreports, une fois par compte). */
    pubMine: tag => m.fs.getDocsFromServer(m.fs.query(m.fs.collection(db, 'pubdecks'), m.fs.where('o', '==', tag))).then(s => s.docs.map(d => ({ id: d.id, data: d.data() }))),
    pubSave: (id, data) => m.fs.setDoc(m.fs.doc(db, 'pubdecks', id), data),
    pubDrop: id => m.fs.deleteDoc(m.fs.doc(db, 'pubdecks', id)),
    pubReport: (id, tag) => m.fs.setDoc(m.fs.doc(db, 'pubreports', id + '~' + tag), { d: id, at: Date.now() }),
    shareId: () => m.fs.doc(m.fs.collection(db, 'shares')).id,
    saveShare: (id, data) => m.fs.setDoc(m.fs.doc(db, 'shares', id), data),
    dropShare: id => m.fs.deleteDoc(m.fs.doc(db, 'shares', id)),
  };
}

let cloudP = null;
/** Charge le SDK une seule fois ; en cas d'échec, un nouvel appel réessaie. */
function loadCloud() {
  if (cloudP) return cloudP;
  cloudP = (async () => {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) {
      throw Object.assign(new Error(tcl('Ouvre l\'app via http(s) (proxy local ou ton hébergement) pour te connecter.')), { code: 'env' });
    }
    const [app, auth, fs] = await Promise.all([import(FB_BASE + 'firebase-app.js'), import(FB_BASE + 'firebase-auth.js'), import(FB_BASE + 'firebase-firestore.js')]);
    return makeCloud({ app, auth, fs });
  })();
  cloudP.catch(() => { cloudP = null; });
  return cloudP;
}

/** Efface le cache Firestore de cet appareil (suppression du compte, effacement de l'appareil) : par le SDK s'il est chargé ; sinon, ou en échec
 *  (autre onglet ouvert…), en supprimant les bases IndexedDB « firestore/… ». Jamais bloquant : chaque étape a un délai. */
async function cloudClearLocal(c) {
  const late = (ms, v) => new Promise(r => setTimeout(() => r(v), ms)), within = (p, ms) => Promise.race([Promise.resolve(p).then(() => true, () => false), late(ms, false)]);
  if (c && c.clearLocal && await within(c.clearLocal(), 4000)) return true;
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB.databases) return false;
    for (const d of (await Promise.race([indexedDB.databases(), late(2000, [])])) || []) {
      if (d && typeof d.name === 'string' && d.name.startsWith('firestore/')) await within(new Promise((res, rej) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = res; q.onerror = q.onblocked = rej; }), 2000);
    }
  } catch (e) { /* navigateur sans indexedDB.databases() : rien de plus à faire */ }
  return false;
}

/** Partage public lu sans SDK ni compte (API REST Firestore) : { kind, at, … } (readShare), ou lève une erreur { code: 'gone' | 'denied' | 'net' | 'bad' }. */
const SHARE_ID_RE = /^[A-Za-z0-9]{12,40}$/;
async function shareFetch(id, fetchFn) {
  if (!SHARE_ID_RE.test(String(id || ''))) throw Object.assign(new Error('lien invalide'), { code: 'bad' });
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/shares/${id}?key=${FIREBASE_CONFIG.apiKey}`;
  let r;
  try { r = await (fetchFn || fetch)(url, { cache: 'no-store', credentials: 'omit' }); } catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
  if (r.status === 404) throw Object.assign(new Error('partage introuvable'), { code: 'gone' });
  if (r.status === 403 || r.status === 401) throw Object.assign(new Error('accès refusé'), { code: 'denied' });
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'net' });
  const f = ((await r.json()) || {}).fields || {}, str = k => (f[k] && typeof f[k].stringValue === 'string' ? f[k].stringValue : '');
  const out = (typeof readShare === 'function' ? readShare : require('./core.js').readShare)(str('kind'), str('d'));      // sous Node (tests) : core.js est un module à part
  if (!out) throw Object.assign(new Error('partage illisible'), { code: 'bad' });
  const o = str('o'); if (/^[0-9a-f]{64}$/.test(o)) out.o = o;      // empreinte du compte qui l'a créé (share.js › ownerTag) : sa propre liste n'est pas retenue dans « Pour toi »
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { FIREBASE_CONFIG, authMessage, makeCloud, shareFetch, SHARE_ID_RE, cloudClearLocal, SUM, SUM_ID, sumMerge };
