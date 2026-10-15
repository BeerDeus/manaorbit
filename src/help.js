/* ── help.js : aide « Comment ça marche », avis, demande de note ──────────────────────────────────────────────────────
   · Réglages › « Aide et avis » (helpSettings, emplacement #helpBox) : l'aide, « Envoyer un avis » (e-mail prérempli), « Noter » (appli Android).
   · Aide : questions courantes, réponses courtes, d'après ce que fait vraiment le code (prix, ajout de cartes, venir de ManaBox (guide de switch.js),
     valeur, decks EDHREC, échange, amis, compte, notifications, effacement). Ouverte aussi par « Comment ça marche ? » en bas de l'accueil.
     En tête, « Visite guidée » (tour.js, s'il est là), aussi dans « Aide et avis ».
   · Avis : mailto avec la version, la plateforme, la langue et le navigateur (pour reproduire un bug) ; jamais la collection.
   · Note : demande neutre (« Noter » / « Plus tard », aucune question sur l'avis avant : Google interdit de trier les gens selon leur réponse),
     seulement dans l'appli Android, après un bon moment (5 cartes ou plus ajoutées d'un scan, un deck enregistré qui devient complet),
     si l'appli sert depuis au moins 4 jours et qu'aucune erreur n'a eu lieu pendant la session ; au plus une fois tous les 120 jours, 3 fois en tout,
     plus jamais après « Noter ». Entièrement coupée tant que RATE_ASK est faux. */
/** Fiche Play Store de l'appli, seule adresse du Play Store dans le code : bouton « Noter », lien « L'installer » et repli du bouton « Ouvrir dans l'appli »
 *  de la barre du navigateur Android (applink.js). À remplacer au besoin (lien d'inscription au test, autre fiche). */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.manaorbit';
/** Demande de note et bouton « Noter sur le Play Store » : à passer à true une fois l'appli publiée (fiche publique) ; false = aucune demande, aucun bouton. */
const RATE_ASK = false;
/* Option « Supporter » (achat intégré) : volontairement absente, en attente de l'analyse Fan Content Policy / Google Play Billing. Point d'accroche prévu :
   const SUPPORTER_SKU = '';      // identifiant du produit Play Billing ; vide = rien d'affiché. Entrée sous « Envoyer un avis » dans helpSettings, appli Android seulement. */
const HELP_MAIL = 'contact@manaorbit.app', HELP_SUBJECT = 'Mana Orbit · avis';      // objet fixe dans toutes les langues : les avis se trient d'un seul filtre
/** Questions et réponses de l'aide (texte français, traduit par T ; HTML fixe, aucune donnée de l'utilisateur). Réponse en fonction : texte qui dépend de l'appli (langue des noms lus au scan, nmT). */
const HELP_QA = [
  ['Cardmarket ou CardTrader : quels prix ?', 'Par défaut, Mana Orbit affiche le <b>prix tendance Cardmarket</b>, relevé chaque jour : gratuit et sans compte, idéal pour estimer. <b>CardTrader</b> donne les vraies offres des vendeurs (état, langue, port) et remplit ton panier, avec ton token CardTrader (Réglages). Le choix se fait dans Decks › « Prix d\'une liste » › Critères › <b>Prix</b> ; sans token, choisir CardTrader explique comment l\'obtenir.'],
  ['Comment ajouter mes cartes ?', () => nmT('Touche <b>Collection</b> dans la barre du bas, puis les boutons du haut : <b>Importer</b> un fichier CSV (ManaBox, Moxfield, Dragon Shield, Archidekt, Deckbox…) ou une liste « 3 Sol Ring » ; <b>Scanner</b> (le rond du milieu de la barre) : l\'appareil photo lit le nom de la carte, en français ou en anglais ; <b>+</b> pour chercher une carte par son nom.', 'Touche <b>Collection</b> dans la barre du bas, puis les boutons du haut : <b>Importer</b> un fichier CSV (ManaBox, Moxfield, Dragon Shield, Archidekt, Deckbox…) ou une liste « 3 Sol Ring » ; <b>Scanner</b> (le rond du milieu de la barre) : l\'appareil photo lit le nom de la carte, en {lang} ou en anglais ; <b>+</b> pour chercher une carte par son nom.', 'Touche <b>Collection</b> dans la barre du bas, puis les boutons du haut : <b>Importer</b> un fichier CSV (ManaBox, Moxfield, Dragon Shield, Archidekt, Deckbox…) ou une liste « 3 Sol Ring » ; <b>Scanner</b> (le rond du milieu de la barre) : l\'appareil photo lit le nom de la carte ; <b>+</b> pour chercher une carte par son nom.')],
  ['Je viens de ManaBox (ou Moxfield…) : comment tout récupérer ?', 'Exporte ta collection en CSV depuis ton ancienne appli (ManaBox : onglet Collection › menu en haut à droite › <b>Export</b>), puis <b>Collection</b> › <b>Importer</b> › <b>Choisir un fichier</b> : quantités, éditions et langues suivent. <button class="link-btn hp-swg" type="button" data-help="switch">Le guide pas à pas</button>'],
  ['Comment scanner tout un paquet ?', 'Dans le scan, active <b>Auto</b> (en bas à droite) : pose les cartes l\'une après l\'autre, le nom dans la bande ; chacune s\'ajoute dès que son nom est lu deux fois de suite, sans toucher l\'écran ; retire-la (ou montre la suivante) pour continuer. <b>Éditions</b> : choisis celle de la 1re carte, les suivantes la prennent si elles existent dans les extensions du scan ; une carte d\'une autre extension te demande la sienne. Pour un deck ou un classeur, les <b>réglages</b> du scan proposent de tout choisir à la fin, en voyant les illustrations (ou de scanner sans édition). Une seule langue dans le paquet : impose-la dans les réglages, c\'est plus rapide.'],
  ['Comment est calculée la valeur de ma collection ?', 'Pour chaque carte, le <b>prix tendance Cardmarket</b> (relevé par Scryfall) multiplié par tes exemplaires. C\'est une estimation : l\'édition, l\'état et le foil ne changent rien, et une carte sans prix n\'est pas comptée. Les prix sont relus une fois par jour au plus ; la courbe garde un relevé par jour. Dans « Prix d\'une liste », le prix Cardmarket est un « à partir de » : la tendance de l\'impression la moins chère.'],
  ['Quels decks EDHREC puis-je monter ?', '<b>Decks</b> › À monter compare ta collection aux decks des commandants les plus joués : deck moyen EDHREC et decks récents d\'Archidekt (Budget, Premium, cEDH). Tu vois la part que tu as déjà, les cartes à acheter et leur prix. Un deck monté ? Marque-le « Deck monté » : ses cartes lui sont réservées. Il faut un compte (Google, ou e-mail vérifié par le lien reçu).'],
  ['Comment publier un deck dans la communauté ?', 'Ouvre ton deck dans <b>Mes decks</b> et touche <b>Publier</b> : un deck Commander de 100 cartes pile, commandant compris, sous ton pseudo (compte vérifié, 10 decks au plus). Il apparaît pour tous dans <b>Decks</b> › À monter, type <b>Communauté</b>, d\'ici quelques minutes. <b>Mettre à jour</b> envoie ta liste du moment, <b>Retirer</b> l\'enlève (supprimer le deck aussi). Un deck choquant ? <b>Signaler ce deck</b>, dans sa feuille : il disparaît de ton appli, et de la communauté après plusieurs signalements.'],
  ['À quoi sert la liste d\'échange ?', '<b>Échange</b> (barre du bas) réunit tes doublons (les exemplaires que tes decks n\'utilisent pas, au-delà de ce que tu gardes) et les cartes que tu cherches (celles qui manquent à tes decks, plus tes souhaits). Avec un compte, crée un <b>lien public</b> : tes amis voient ta liste, toujours à jour, sans rien pouvoir modifier.'],
  ['Comment montrer mes cartes comme dans un classeur ?', 'Dans <b>Échange</b>, l\'interrupteur au-dessus de la liste (icônes liste et grille) passe en <b>classeur</b> : des pages de 9 cartes à feuilleter. <b>Personnaliser</b> choisit sa couleur, les cartes épinglées en tête et le tri des autres (valeur, couleur, extension, nom). Tes amis voient le même classeur sur ton lien public, et peuvent repasser en liste.'],
  ['Comment ajouter un ami ?', 'Ouvre le lien d\'échange de ton ami (ou scanne son QR code) et touche <b>Ajouter en ami</b>, à côté de son nom. Il accepte dans Compte et réglages › <b>Amis</b>. Entre amis, vous voyez la liste d\'échange, les decks et, si chacun l\'autorise, la collection de l\'autre, toujours à jour ; une notification te prévient quand un ami ajoute une carte que tu cherches (une fois par jour au plus).'],
  ['Faut-il un compte ?', 'Non : sans compte, tout reste sur cet appareil. Un compte (e-mail ou Google) sauvegarde ta collection, tes decks, l\'historique de valeur et ta liste d\'échange, et les retrouve sur tous tes appareils. Ton token CardTrader, lui, reste sur l\'appareil.'],
  ['Alertes et notifications ?', 'Compte et réglages (ton avatar, en haut) › <b>Notifications</b> : « Fin de recherche » te prévient quand une recherche CardTrader se termine après que tu as quitté l\'appli ; les <b>alertes de prix</b> signalent une forte baisse d\'une carte qui manque à tes decks ou d\'une carte suivie (le serveur vérifie toutes les 6 heures). Dans ta collection, les cartes dont le prix a beaucoup bougé sont aussi signalées.'],
  ['Comment effacer mes données ?', 'Compte et réglages › Données de l\'appareil › <b>Effacer les données de cet appareil</b> : collection, decks, réglages et caches. Avec un compte, Compte et réglages › Gérer le compte › <b>Supprimer mon compte</b> efface aussi tout ce qui est en ligne (decks, collection, historique, liste d\'échange, liens partagés). C\'est définitif.'],
];

/** Typographie française à l'affichage : espace insécable avant « ; : ? ! » et dans les guillemets (jamais un « ; » seul en début de ligne). Sans effet en anglais. */
const helpNb = s => String(s).replace(/ ([;:!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
/** Lien « Envoyer un avis » : objet fixe, corps prérempli (une place pour le message, puis de quoi reproduire un bug). apk : version de l'appli Android, lue à part. */
function feedbackHref(apk) {
  const nat = typeof isNativeApp === 'function' && isNativeApp();
  let web = T('web');
  try { if (!nat && PWA.state() === 'standalone') web = T('web, application installée'); } catch (e) { /* PWA indisponible */ }
  const body = ['', '', '', '———', T('Ces informations aident à reproduire un bug. Ta collection n\'est pas envoyée.'),
    T('Version : {v}', { v: typeof DD_BUILD === 'string' ? DD_BUILD : 'dev' }),
    T('Plateforme : {p}', { p: nat ? T('appli Android') + (apk ? ' ' + apk : '') : web }),
    T('Langue : {l}', { l: I18N.lang + ' (' + I18N.nav + ')' }),
    T('Navigateur : {ua}', { ua: typeof navigator !== 'undefined' ? navigator.userAgent : '?' })].join('\r\n');      // fins de ligne CRLF : la forme attendue dans un mailto (RFC 6068)
  return 'mailto:' + HELP_MAIL + '?subject=' + encodeURIComponent(HELP_SUBJECT) + '&body=' + encodeURIComponent(body);
}
/** Version de l'APK (« 1.0 (3) »), lue une fois auprès de la coque ; '' ailleurs ou si la coque ne la donne pas. */
let helpApkP = null;
function helpApk() {
  if (!helpApkP) { const mo = typeof natPlugin === 'function' && natPlugin('ManaOrbit'); helpApkP = mo ? Promise.resolve().then(() => mo.info()).then(i => (i && i.version ? i.version + (i.build ? ' (' + i.build + ')' : '') : ''), () => '') : Promise.resolve(''); }
  return helpApkP;
}
/** Liens d'avis d'un bloc : complétés par la version de l'APK dès qu'elle est connue. */
function helpMailLinks(root) { helpApk().then(v => { if (v) $$('a[data-help="mail"]', root).forEach(a => { a.href = feedbackHref(v); }); }); }

/** Réglages › « Aide et avis ». */
function helpSettings(el, own) {      // own : dans sa propre fiche « Aide et avis » (le titre y est déjà)
  if (!el) return;
  const rate = RATE.url && isNativeApp();
  el.innerHTML = `${own ? '' : `<div class="sec-title">${T('Aide et avis')}</div>`}
    <div class="installbox"><p class="hint">${helpNb(T('Les réponses aux questions courantes. Un bug, une idée ? Écris-nous : ton appli mail s\'ouvre avec la version de Mana Orbit déjà notée.'))}</p>
      <div class="cart-actions"><button class="btn ghost small" type="button" data-help="open">${T('Comment ça marche')}</button>${typeof tourHelpBtn === 'function' ? tourHelpBtn() : ''}<a class="btn ghost small" data-help="mail" href="${esc(feedbackHref())}">${T('Envoyer un avis')}</a>${rate ? `<a class="btn ghost small" data-help="rate" href="${esc(RATE.url)}" target="_blank" rel="noopener">${T('Noter sur le Play Store')}</a>` : ''}</div>
      <p class="hint hp-mail">${T('Ou écris à {mail}', { mail: `<span>${HELP_MAIL}</span>` })}</p></div>`;
  $('[data-help="open"]', el).onclick = () => { haptic('tap'); openHelp(); };
  const tb = $('[data-help="tour"]', el); if (tb) tb.onclick = () => { haptic('tap'); tourStart({ from: 'settings' }); };      // visite guidée (tour.js)
  const r = $('[data-help="rate"]', el); if (r) r.addEventListener('click', () => rateDone());
  helpMailLinks(el);
}
/** Feuille « Comment ça marche » : questions repliées, une seule ouverte à la fois. */
function openHelp() {
  openSheet(T('Comment ça marche'), T('Les questions qu\'on se pose souvent'), api => {
    api.wrap.classList.add('hp-sheet');
    api.body.innerHTML = `${typeof tourHelpHtml === 'function' ? tourHelpHtml() : ''}<div class="hp-list">${HELP_QA.map(([q, a], i) => `<details class="hp-q" data-i="${i}"><summary><span>${helpNb(T(q))}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></summary><p>${helpNb(typeof a === 'function' ? a() : T(a))}</p></details>`).join('')}</div>
      <p class="hint hp-more">${helpNb(T('Une autre question, un bug, une idée ? Écris-nous, on lit tout.'))}</p>`;
    api.setFoot(`<a class="btn ghost" data-help="mail" href="${esc(feedbackHref())}">${T('Envoyer un avis')}</a><button class="btn" type="button" data-close>${T('Fermer')}</button>`);
    // une question ouverte referme les autres : la liste reste courte sur un téléphone
    api.body.addEventListener('toggle', e => { const d = e.target; if (d.open) $$('.hp-q[open]', api.body).forEach(x => { if (x !== d) x.open = false; }); }, true);
    api.body.addEventListener('click', e => { if (e.target.closest('[data-help="switch"]')) { haptic('tap'); swgOpen({ from: 'help' }); } else if (e.target.closest('[data-help="tour"]')) { haptic('tap'); tourStart({ from: 'help' }); } });      // « Visite guidée » (tour.js), en tête      // « Je viens de ManaBox » : le guide (switch.js), par-dessus l'aide
    helpMailLinks(api.foot);
  });
}

/* ── Demande de note (appli Android) ─────────────────────────────────────────────────────────────── */
const RATE_KEY = 'deckdeal:rate', RATE_GAP = 120 * DAY, RATE_MAX = 3, RATE_AGE = 4 * DAY, RATE_SCAN = 5;
/** url : la fiche Play Store (PLAY_URL si RATE_ASK, sinon vide ; les tests la remplacent) · bad : une erreur a eu lieu dans cette session · pend : bon moment en attente d'un écran calme. */
const RATE = { url: RATE_ASK ? PLAY_URL : '', bad: false, pend: '', until: 0, t: 0, wait: 1500 };
const rateOn = () => !!RATE.url && typeof isNativeApp === 'function' && isNativeApp();
function rateRead() { try { const o = JSON.parse(localStorage.getItem(RATE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function rateWrite(o) { try { localStorage.setItem(RATE_KEY, JSON.stringify(o)); } catch (e) { /* stockage indisponible : la demande peut revenir, rien de grave */ } }
/** La demande peut-elle s'afficher maintenant ? (hors moment : appli, fréquence, ancienneté, session sans erreur) */
function rateOk(now = Date.now()) {
  if (!rateOn() || RATE.bad) return false;
  const st = rateRead(); if (st.done || (st.n || 0) >= RATE_MAX || (st.at && now - st.at < RATE_GAP)) return false;
  let first = 0; try { first = Number(localStorage.getItem(OB_KEY)) || 0; } catch (e) { /* stockage indisponible */ }
  return first > 0 && now - first >= RATE_AGE;                                       // première utilisation (onboard.js) : au moins 4 jours
}
/** Appelé à chaque repeint de l'accueil (homePaint, aussi déclenché par les decks montés) : erreurs de recherche, decks devenus complets. */
function rateTick() {
  if (!rateOn()) return;
  if (S.run && S.run.status === 'error') RATE.bad = true;
  const ids = Object.keys(XS.eng).filter(engIsOn), st = rateRead();
  if (!Array.isArray(st.dk)) { st.dk = ids.slice(-200); rateWrite(st); return; }      // première fois : les decks déjà complets ne comptent pas
  const fresh = ids.filter(id => !st.dk.includes(id)); if (!fresh.length) return;
  st.dk = st.dk.concat(fresh).slice(-200); rateWrite(st);
  if (fresh.some(id => Date.now() - (XS.eng[id].at || 0) < 10 * 60e3)) rateMoment('deck');      // complet à l'instant sur cet appareil (pas un deck reçu du compte)
}
/** Un bon moment vient d'avoir lieu : la demande attend un écran calme (5 minutes au plus). */
function rateMoment(kind) {
  if (!rateOk()) return;
  RATE.pend = kind; RATE.until = Date.now() + 5 * 60e3; rateWait();
}
/** Écran calme : rien d'ouvert par-dessus (feuille, scan, carte en grand, éditeur, premier lancement), aucun toast (son « Annuler » resterait accessible), pas de recherche en cours. */
function rateQuiet() {
  return !document.hidden && !sheets.length && !SC.el && !imgView && !OB.el && !document.querySelector('body > .dv.bd.on')
    && !$('#toast').classList.contains('on') && !(S.run && S.run.status === 'running');
}
function rateWait() {
  clearTimeout(RATE.t);
  RATE.t = setTimeout(() => {
    if (!RATE.pend) return;
    if (Date.now() > RATE.until || !rateOk()) { RATE.pend = ''; return; }
    if (rateQuiet()) rateShow(); else rateWait();
  }, RATE.wait);
}
function rateDone() { const st = rateRead(); st.done = 1; rateWrite(st); }
/** La demande : neutre, « Noter » ouvre la fiche Play Store ; « Plus tard », la croix ou Retour la repoussent de 120 jours. */
function rateShow() {
  RATE.pend = '';
  const st = rateRead(); st.n = (st.n || 0) + 1; st.at = Date.now(); rateWrite(st);
  openSheet(T('Noter Mana Orbit'), '', api => {
    api.wrap.classList.add('rate-sheet');
    api.body.innerHTML = `<div class="rate-hero"><span class="rate-logo" aria-hidden="true"><svg class="logo"><use href="#i-logo"/></svg></span>
      <p>${T('Si Mana Orbit t\'est utile, une note sur le Play Store aide beaucoup.')}</p></div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Plus tard')}</button><a class="btn" data-rate="go" href="${esc(RATE.url)}" target="_blank" rel="noopener">${T('Noter')}</a>`);
    $('[data-rate="go"]', api.foot).addEventListener('click', () => { rateDone(); haptic('ok'); setTimeout(() => api.close(), 0); });
  });
}
// Session avec une erreur : pas de demande (une erreur JavaScript, une promesse rejetée sans traitement, une recherche échouée).
if (typeof window !== 'undefined') {
  window.addEventListener('error', () => { RATE.bad = true; });
  window.addEventListener('unhandledrejection', () => { RATE.bad = true; });
}
// « Ajouter N cartes » (ou « Ajouter quand même » : cartes sans édition) à la fin d'un scan (fiche récap de scan.js) : 5 exemplaires ou plus ajoutés = bon moment.
// Écouté en capture, avant l'ajout, pour compter avant / après (« Ajouter » qui demande d'abord une confirmation n'ajoute rien : pas de demande).
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  if (!rateOn() || !e.target || !e.target.closest || !e.target.closest('.rc-sheet [data-rc="go"], .rc-sheet [data-rc="force"]')) return;
  const before = collCopies();
  setTimeout(() => { if (collCopies() - before >= RATE_SCAN) rateMoment('scan'); }, 0);
}, true);
