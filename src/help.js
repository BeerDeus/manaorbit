/* ── help.js : aide « Comment ça marche », « Signaler un bug ou une idée » (Discord ou e-mail), avis sur Google Play, demande de note ──────────────
   · Réglages › « Aide et avis » (helpSettings, emplacement #helpBox) : en tête « Signaler un bug ou une idée », puis l'aide, la visite guidée,
     « Laisser un avis sur Google Play » (partout sauf sur iPhone et iPad), « Rejoindre le Discord » (DISCORD_URL).
   · Aide : questions courantes, réponses courtes, d'après ce que fait vraiment le code (prix, ajout de cartes, venir de ManaBox (guide de switch.js),
     valeur, decks EDHREC, échange, amis, compte, notifications, effacement). Ouverte aussi par « Comment ça marche ? » en bas de l'accueil.
     En tête, « Visite guidée » (tour.js, s'il est là), aussi dans « Aide et avis ». Pied : « Signaler un bug ou une idée ».
   · « Signaler un bug ou une idée » (lien data-help="report" des réglages et du pied de l'aide ; ligne à part du menu « Compte et réglages », me.js › helpReport) :
     serveur avec le bot Discord (/__ping feedback → CTX.feedback) et réseau là : fenêtre (fbOpen, type Bug par défaut) → POST api/feedback (proxy.mjs),
     qui ouvre un fil public dans le forum #bugs, #idées ou #aide du Discord de Mana Orbit.
     Type (bug, idée, question), partie de l'appli (étiquette du forum), titre (3 à 90), description (1 500 caractères, 30 lignes), 3 captures au plus
     (réduites ici : JPEG 1 600 px de côté, qualité 0,82, plus petites au-delà de 1,5 Mo), pseudo Discord facultatif pour être recontacté ; part avec :
     version, plateforme, version de l'APK, langue, navigateur (jamais la collection) ; connecté : jeton Firebase (le serveur n'en garde qu'une empreinte, budget).
     Brouillon gardé à la fermeture (mémoire, textes aussi dans sessionStorage), vidé après un envoi réussi ; « Merci ! » : « Voir sur Discord » (le fil),
     « Rejoindre le serveur ». Serveur ancien (pas de feedback), hors ligne, ou 404 (bot coupé : CTX.feedback = false) : mailto comme avant.
     Badge « Voix du peuple » (progress.js, prgAdd('fb')) : après un envoi réussi, ou au clic sur le mailto.
   · Repli par e-mail : mailto avec la version, la plateforme, la langue et le navigateur (pour reproduire un bug) ; jamais la collection.
   · « Laisser un avis sur Google Play » (data-help="rate") : lien vers la fiche (PLAY_URL, onglet à part) ; dans l'appli Android, la coque Capacitor
     confie toute adresse d'un autre site à Android (intention VIEW), qui ouvre l'appli Play Store sur la fiche (comme « Mettre à jour » de pwa.js et
     « L'installer » d'applink.js). Absent sur iPhone et iPad (PWA.ios : aucune appli iOS). Au clic : rateDone (plus de demande de note) ; pas de badge
     (une note n'est pas un avis envoyé). Jamais la carte In-App Review de Google depuis ce bouton (Google le déconseille : son quota peut être atteint,
     rien ne s'afficherait).
   · Note : demande neutre (« Noter » / « Plus tard », aucune question sur l'avis avant : Google interdit de trier les gens selon leur réponse),
     seulement dans l'appli Android, après un bon moment (5 cartes ou plus ajoutées d'un scan, un deck enregistré qui devient complet),
     si l'appli sert depuis au moins 4 jours et qu'aucune erreur n'a eu lieu pendant la session ; au plus une fois tous les 120 jours, 3 fois en tout,
     plus jamais après « Noter ». Entièrement coupée tant que RATE_ASK est faux. APK 1.0.6 et plus : au même moment et dans les mêmes limites, la carte de note
     de Google Play s'ouvre dans l'appli (In-App Review, ManaOrbit.requestReview, neutre elle aussi) au lieu de notre feuille. */
/** Invitation permanente du serveur Discord de Mana Orbit : « Rejoindre le Discord » des réglages, « Rejoindre le serveur » après un avis envoyé. */
const DISCORD_URL = 'https://discord.gg/TTwrP94agb';
/** Fiche Play Store de l'appli, seule adresse du Play Store dans le code : « Laisser un avis sur Google Play », « Noter », lien « L'installer » et repli du bouton « Ouvrir dans l'appli »
 *  de la barre du navigateur Android (applink.js). À remplacer au besoin (lien d'inscription au test, autre fiche). */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.manaorbit';
/** Demande automatique de note (rateMoment, rateSheet, In-App Review) : à passer à true une fois l'appli publiée (fiche publique) ; false = aucune demande.
 *  Sans effet sur « Laisser un avis sur Google Play » des réglages (toujours là, sauf sur iPhone et iPad). */
const RATE_ASK = false;
/* Option « Supporter » (achat intégré) : volontairement absente, en attente de l'analyse Fan Content Policy / Google Play Billing. Point d'accroche prévu :
   const SUPPORTER_SKU = '';      // identifiant du produit Play Billing ; vide = rien d'affiché. Entrée sous « Signaler un bug ou une idée » dans helpSettings, appli Android seulement. */
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
/** Repli e-mail de « Signaler un bug ou une idée » : objet fixe, corps prérempli (une place pour le message, puis de quoi reproduire un bug). apk : version de l'appli Android, lue à part ;
 *  pre : message déjà écrit (feuille d'avis, envoi par le Discord coupé), mis à la place des lignes vides. */
function feedbackHref(apk, pre) {
  const nat = typeof isNativeApp === 'function' && isNativeApp();
  let web = T('web');
  try { if (!nat && PWA.state() === 'standalone') web = T('web, application installée'); } catch (e) { /* PWA indisponible */ }
  const body = [...(pre ? [String(pre).replace(/\r?\n/g, '\r\n'), ''] : ['', '', '']), '———', T('Ces informations aident à reproduire un bug. Ta collection n\'est pas envoyée.'),
    T('Version : {v}', { v: typeof DD_BUILD === 'string' ? DD_BUILD : 'dev' }),
    T('Plateforme : {p}', { p: nat ? T('appli Android') + (apk ? ' ' + apk : '') : web }),
    T('Langue : {l}', { l: I18N.lang + ' (' + I18N.nav + ')' }),
    T('Navigateur : {ua}', { ua: typeof navigator !== 'undefined' ? navigator.userAgent : '?' })].join('\r\n');      // fins de ligne CRLF : la forme attendue dans un mailto (RFC 6068)
  return 'mailto:' + HELP_MAIL + '?subject=' + encodeURIComponent(HELP_SUBJECT) + '&body=' + encodeURIComponent(body);
}
/** Version de l'APK (« 1.0 (3) »), lue une fois auprès de la coque ; '' ailleurs ou si la coque ne la donne pas. */
let helpApkP = null, helpApkV = '';      // helpApkV : la même, une fois lue (helpReport, sans attendre)
function helpApk() {
  if (!helpApkP) { const mo = typeof natPlugin === 'function' && natPlugin('ManaOrbit'); helpApkP = mo ? Promise.resolve().then(() => mo.info()).then(i => (helpApkV = i && i.version ? i.version + (i.build ? ' (' + i.build + ')' : '') : ''), () => '') : Promise.resolve(''); }
  return helpApkP;
}
/** Lien « Signaler un bug ou une idée » (mailto, data-help="report"), le même partout ; cls : classes du bouton. */
const helpReportA = cls => `<a class="${cls}" data-help="report" href="${esc(feedbackHref(helpApkV))}"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg><span>${T('Signaler un bug ou une idée')}</span></a>`;
/** Liens « Signaler un bug ou une idée » d'un bloc : complétés par la version de l'APK dès qu'elle est connue.
 *  Serveur avec le bot Discord (CTX.feedback) et réseau là : la fenêtre (fbOpen) au lieu du mailto ; sinon le mailto, et le badge « Voix du peuple » (progress.js). */
function helpMailLinks(root) {
  helpApk().then(v => { if (v) $$('a[data-help="report"]', root).forEach(a => { a.href = feedbackHref(v); }); });
  $$('a[data-help="report"]', root).forEach(a => a.addEventListener('click', e => {
    if (fbOn()) { e.preventDefault(); haptic('tap'); fbOpen(); return; }
    if (typeof prgAdd === 'function') prgAdd('fb');
  }));
}
/** « Signaler un bug ou une idée » depuis un bouton (ligne du menu « Compte et réglages », me.js) : la fenêtre si fbOn, sinon le même mailto,
 *  suivi par un lien posé le temps du clic (badge au clic, comme le lien des réglages). */
function helpReport() {
  if (fbOn()) { fbOpen(); return; }
  if (typeof prgAdd === 'function') prgAdd('fb');
  const a = document.createElement('a'); a.href = feedbackHref(helpApkV); a.dataset.help = 'report'; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove();
}
/** « Laisser un avis sur Google Play » : partout sauf sur iPhone et iPad (aucune appli iOS ; iPadOS se dit Mac : PWA.ios le reconnaît au toucher). */
const helpPlayOk = () => { try { return !PWA.ios(); } catch (e) { return true; } };

/** Réglages › « Aide et avis ». */
function helpSettings(el, own) {      // own : dans sa propre fiche « Aide et avis » (le titre y est déjà)
  if (!el) return;
  const play = helpPlayOk();
  el.innerHTML = `${own ? '' : `<div class="sec-title">${T('Aide et avis')}</div>`}
    <div class="installbox"><p class="hint">${helpNb((fbOn() ? T('Les réponses aux questions courantes. Un bug, une idée, une question ? Dis-le-nous : ça arrive sur le Discord de Mana Orbit, avec la version de l\'appli déjà notée.') : T('Les réponses aux questions courantes. Un bug, une idée ? Écris-nous : ton appli mail s\'ouvre avec la version de Mana Orbit déjà notée.'))
      + (play ? ' ' + T('Un avis sur l\'appli ? Laisse-le sur Google Play, il aide d\'autres joueurs à la trouver.') : ''))}</p>
      <div class="cart-actions">${helpReportA('btn small')}<button class="btn ghost small" type="button" data-help="open">${T('Comment ça marche')}</button>${typeof tourHelpBtn === 'function' ? tourHelpBtn() : ''}${play ? `<a class="btn ghost small" data-help="rate" href="${esc(PLAY_URL)}" target="_blank" rel="noopener"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg><span>${T('Laisser un avis sur Google Play')}</span></a>` : ''}<a class="btn ghost small" data-help="discord" href="${esc(DISCORD_URL)}" target="_blank" rel="noopener">${T('Rejoindre le Discord')}</a></div>
      <p class="hint hp-mail">${T('Ou écris à {mail}', { mail: `<span>${HELP_MAIL}</span>` })}</p></div>`;
  $('[data-help="open"]', el).onclick = () => { haptic('tap'); openHelp(); };
  const tb = $('[data-help="tour"]', el); if (tb) tb.onclick = () => { haptic('tap'); tourStart({ from: 'settings' }); };      // visite guidée (tour.js)
  const r = $('[data-help="rate"]', el); if (r) r.addEventListener('click', () => { haptic('tap'); rateDone(); });      // la fiche Play (l'appli Play Store, dans l'appli Android) ; plus de demande de note ; pas de badge
  helpMailLinks(el);
}
/** Feuille « Comment ça marche » : questions repliées, une seule ouverte à la fois. */
function openHelp() {
  openSheet(T('Comment ça marche'), T('Les questions qu\'on se pose souvent'), api => {
    api.wrap.classList.add('hp-sheet');
    api.body.innerHTML = `${typeof tourHelpHtml === 'function' ? tourHelpHtml() : ''}<div class="hp-list">${HELP_QA.map(([q, a], i) => `<details class="hp-q" data-i="${i}"><summary><span>${helpNb(T(q))}</span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></summary><p>${helpNb(typeof a === 'function' ? a() : T(a))}</p></details>`).join('')}</div>
      <p class="hint hp-more">${helpNb(T('Une autre question, un bug, une idée ? Écris-nous, on lit tout.'))}</p>`;
    api.setFoot(`${helpReportA('btn ghost')}<button class="btn" type="button" data-close>${T('Fermer')}</button>`);
    // une question ouverte referme les autres : la liste reste courte sur un téléphone
    api.body.addEventListener('toggle', e => { const d = e.target; if (d.open) $$('.hp-q[open]', api.body).forEach(x => { if (x !== d) x.open = false; }); }, true);
    api.body.addEventListener('click', e => { if (e.target.closest('[data-help="switch"]')) { haptic('tap'); swgOpen({ from: 'help' }); } else if (e.target.closest('[data-help="tour"]')) { haptic('tap'); tourStart({ from: 'help' }); } });      // « Visite guidée » (tour.js), en tête      // « Je viens de ManaBox » : le guide (switch.js), par-dessus l'aide
    helpMailLinks(api.foot);
  });
}

/* ── Avis par le Discord (CTX.feedback) : fenêtre « Signaler un bug ou une idée » → POST api/feedback ─────────────────────────────────────────── */
/** Types (kind du serveur → forum #bugs, #idées, #aide) et parties de l'appli (area → étiquette du forum, tools/discord-setup.mjs) : valeur envoyée, libellé. */
const FB_KINDS = [['bug', 'Bug'], ['idea', 'Idée'], ['help', 'Question']];
const FB_AREAS = [['scan', 'Scan'], ['collection', 'Collection'], ['decks', 'Decks'], ['prix', 'Prix'], ['compte', 'Compte et synchro'], ['alertes', 'Alertes'],
  ['echange', 'Échange'], ['partie', 'Partie'], ['mystere', 'Carte mystère'], ['amis', 'Amis'], ['autre', 'Autre']];
/** Bornes du contrat (proxy.mjs › /api/feedback) ; side, q, bytes : taille, qualité et poids des captures ; draft : brouillon de la session (captures comprises). */
const FB = { max: 3, side: 1600, q: 0.82, bytes: 1.5 * 1024 * 1024, title: 90, text: 1500, lines: 30, contact: 60, key: 'deckdeal:fb', draft: null };
/** La feuille remplace-t-elle le mailto ? Serveur qui l'annonce (/__ping feedback) et réseau là (hors ligne : le mailto, qui partira plus tard). */
const fbOn = () => typeof CTX !== 'undefined' && CTX.feedback === true && !collOffline();
/** Titre, pseudo : caractères de contrôle retirés, espaces resserrés (comme le serveur). Description : sauts de ligne gardés, 2 lignes vides de suite au plus. */
const fbLine = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const fbBody = s => String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const fbPick = (v, list) => (list.some(([k]) => k === v) ? v : list[list.length - 1][0]);
/** Brouillon : en mémoire (captures comprises) ; type, partie et textes aussi dans sessionStorage (rechargement de la page). */
function fbDraft() {
  if (FB.draft) return FB.draft;
  let o = null; try { o = JSON.parse(sessionStorage.getItem(FB.key) || 'null'); } catch (e) { o = null; }
  o = o && typeof o === 'object' ? o : {};
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  FB.draft = { kind: o.kind === 'idea' || o.kind === 'help' ? o.kind : 'bug', area: fbPick(o.area, FB_AREAS), title: str(o.title, FB.title), text: str(o.text, FB.text), contact: str(o.contact, FB.contact), imgs: [] };
  return FB.draft;
}
function fbKeep() { const d = FB.draft; if (!d) return; try { sessionStorage.setItem(FB.key, JSON.stringify({ kind: d.kind, area: d.area, title: d.title, text: d.text, contact: d.contact })); } catch (e) { /* stockage indisponible : brouillon en mémoire seulement */ } }
function fbForget() { FB.draft = null; try { sessionStorage.removeItem(FB.key); } catch (e) { /* ignore */ } }
const fbDataUrl = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
/** Capture choisie → { url (data:image/jpeg;base64), w, h, kb } : 1 600 px au plus de côté, qualité 0,82, refaite plus petite tant qu'elle dépasse 1,5 Mo ;
 *  fond blanc (PNG transparent). Image illisible (pas une image, format inconnu, fichier abîmé) : rejet. */
async function fbShrink(file) {
  if (!file || (file.type && !/^image\//.test(file.type))) throw new Error('not_image');
  const u = URL.createObjectURL(file), im = new Image(), c = document.createElement('canvas');
  try {
    im.src = u; await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight; if (!(W > 0 && H > 0)) throw new Error('empty');
    const enc = q => new Promise(r => { try { c.toBlob(b => r(b), 'image/jpeg', q); } catch (e) { r(null); } });
    let k = Math.min(1, FB.side / Math.max(W, H));
    for (let i = 0; i < 10; i++) {
      c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
      const b = await enc(i < 5 ? FB.q : 0.7); if (!b) throw new Error('encode');
      if (b.size <= FB.bytes) return { url: await fbDataUrl(b), w: c.width, h: c.height, kb: Math.round(b.size / 1024) };
      k *= 0.8;
    }
    throw new Error('too_big');
  } finally { URL.revokeObjectURL(u); c.width = c.height = 0; }
}
/** Ce qui part avec l'avis (contrat : textes de 300 caractères au plus) : version, plateforme (comme feedbackHref), version de l'APK, langue, navigateur. */
async function fbMeta() {
  const nat = typeof isNativeApp === 'function' && isNativeApp(), cut = s => String(s || '').slice(0, 300);
  let pwa = false; try { pwa = !nat && PWA.state() === 'standalone'; } catch (e) { /* PWA indisponible */ }
  const apk = nat ? await Promise.race([helpApk(), new Promise(r => setTimeout(() => r(''), 800))]) : '';      // coque muette : envoyé sans
  return { v: cut(typeof DD_BUILD === 'string' ? DD_BUILD : 'dev'), plat: nat ? 'android' : pwa ? 'pwa' : 'web', apk: cut(apk), lang: cut(I18N.lang), nav: cut(I18N.nav), ua: cut(typeof navigator !== 'undefined' ? navigator.userAgent : '') };
}
/** POST api/feedback ; connecté : jeton Firebase (renouvelé une fois s'il a expiré ; indisponible : envoyé sans compte), comme scanreport.js › srPost.
 *  → { status (0 : réseau), code, message, url, retry (secondes, 429) }. */
async function fbPost(o) {
  const u = typeof D !== 'undefined' && D.user, body = JSON.stringify(o);
  for (let a = 0; a < 2; a++) {
    let tok = ''; if (u) { try { tok = await u.getIdToken(a > 0); } catch (e) { tok = ''; } }
    let r; try { r = await fetch('api/feedback', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(tok ? { 'x-firebase-token': tok } : {}) }, body }); } catch (e) { return { status: 0, code: 'net' }; }
    const j = await r.json().catch(() => null);
    if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
    const ra = Number(r.headers.get('retry-after')) || 0;
    return { status: r.status, code: (j && typeof j.error === 'string' && j.error) || '', message: (j && typeof j.message === 'string' && j.message) || '', url: (j && typeof j.url === 'string' && j.url) || '', retry: Number(j && j.retry) || ra };
  }
  return { status: 401, code: 'token_expired' };
}
/** Message d'un envoi refusé : la saisie reste dans la feuille (sauf 404 : repli e-mail, fbMail). */
function fbErrText(r) {
  if (!r.status) return collOffline() ? T('Hors ligne : ton avis n\'est pas parti. Réessaie une fois connecté, ton message est gardé.') : T('Serveur injoignable : ton avis n\'est pas parti. Réessaie plus tard, ton message est gardé.');
  if (r.status === 429) return T('Trop d\'avis envoyés d\'ici pour le moment : réessaie dans {n} min.', { n: Math.max(1, Math.ceil((r.retry || 60) / 60)) });
  if (r.status === 413) return T('Captures trop lourdes : retire-en une et réessaie.');
  if (r.status === 400) {
    const known = { bad_title: T('Le titre doit faire de 3 à 90 caractères.'), bad_text: T('La description doit faire de 1 à 1500 caractères, sur 30 lignes au plus.'),
      bad_image: T('Une capture n\'a pas été acceptée : retire-la ou choisis-en une autre.'), bad_contact: T('Le pseudo Discord fait 60 caractères au plus.') };
    return known[r.code] || (I18N.lang === 'fr' && r.message) || T('Avis refusé par le serveur : vérifie les champs et réessaie.');      // message du serveur : en français
  }
  return T('Envoi impossible pour le moment : réessaie plus tard, ton message est gardé.');
}
const fbPlaceholders = k => (k === 'idea' ? [T('Par exemple : trier mes decks par couleur'), T('Ton idée, et ce qu\'elle changerait pour toi.')]
  : k === 'help' ? [T('Par exemple : comment exporter ma collection ?'), T('Ta question, le plus précisément possible : ce que tu cherches à faire, où tu bloques.')]
    : [T('Par exemple : le scan ne lit pas les cartes japonaises'), T('Étapes : ce que tu as fait.\nAttendu : ce qui devait se passer.\nObtenu : ce qui s\'est passé à la place.')]);
/** Fenêtre « Signaler un bug ou une idée » : type (Bug par défaut, sinon celui du brouillon), partie de l'appli, titre, description, captures, pseudo Discord ; « Envoyer » → fil public sur le Discord de Mana Orbit. */
function fbOpen() {
  const d = fbDraft(); let busy = 0, sending = false;      // busy : captures en cours de réduction
  const api = openSheet(T('Signaler un bug ou une idée'), T('Ton message arrive sur le Discord de Mana Orbit'), a => a.wrap.classList.add('fb-sheet'));
  api.body.innerHTML = `<form class="fb" novalidate>
      <div class="field-in"><span class="label" id="fbKindL">${T('Type')}</span><div class="seg fb-kind" role="radiogroup" aria-labelledby="fbKindL"></div></div>
      <div class="field-in"><label class="label" for="fbArea">${T('Partie de l\'appli')}</label><div class="sel"><select id="fbArea">${FB_AREAS.map(([v, l]) => `<option value="${v}">${esc(T(l))}</option>`).join('')}</select></div></div>
      <div class="field-in"><label class="label" for="fbTitle">${T('Titre')}</label><input type="text" id="fbTitle" maxlength="${FB.title}" required aria-required="true" autocomplete="off" enterkeyhint="next"></div>
      <div class="field-in"><div class="fb-lh"><label class="label" for="fbText">${T('Description')}</label><span class="fb-cnt" id="fbCnt"></span></div>
        <textarea id="fbText" class="fb-text" rows="5" maxlength="${FB.text}" required aria-required="true" aria-describedby="fbCnt"></textarea></div>
      <div class="field-in"><span class="label" id="fbImgL">${T('Captures d\'écran')}</span><div class="fb-imgs" role="list" aria-labelledby="fbImgL"></div>
        <button type="button" class="btn ghost small fb-add" aria-describedby="fbImgH"><svg class="i" aria-hidden="true"><use href="#i-image"/></svg><span>${T('Ajouter une capture')}</span></button>
        <span class="hint" id="fbImgH">${T('3 au plus, réduites avant l\'envoi.')}</span><input type="file" id="fbFile" accept="image/*" multiple hidden></div>
      <div class="field-in"><label class="label" for="fbContact">${T('Pseudo Discord (facultatif)')}</label><input type="text" id="fbContact" class="fb-contact" maxlength="${FB.contact}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="fbContactH">
        <span class="hint" id="fbContactH">${T('Pour qu\'on puisse te recontacter.')}</span></div>
      <p class="hint fb-why">${helpNb(T('Envoyé avec ton message : la version de Mana Orbit, la plateforme, la langue et le navigateur ; jamais ta collection. Ton message sera public sur le Discord de Mana Orbit.'))}</p>
      <p class="fb-err" role="alert" hidden></p></form>`;
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-fb="go">${T('Envoyer')}</button>`);
  const $b = s => $(s, api.body), form = $b('.fb'), seg = $b('.fb-kind'), areaS = $b('#fbArea'), tI = $b('#fbTitle'), xI = $b('#fbText'), cI = $b('#fbContact'), cnt = $b('#fbCnt');
  const imgs = $b('.fb-imgs'), addB = $b('.fb-add'), fileI = $b('#fbFile'), err = $b('.fb-err'), goB = $('[data-fb="go"]', api.foot);
  areaS.value = d.area; tI.value = d.title; xI.value = d.text; cI.value = d.contact;
  const fail = (t, el) => { err.textContent = t; err.hidden = false; haptic('warn'); if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } };
  const calm = () => { err.hidden = true; [tI, xI].forEach(x => x.removeAttribute('aria-invalid')); };
  const paint = () => {
    const [pt, px] = fbPlaceholders(d.kind); tI.placeholder = pt; xI.placeholder = px;
    cnt.textContent = xI.value.length + ' / ' + FB.text;
    cnt.classList.toggle('warn', xI.value.length > FB.text - 100);
    const full = d.imgs.length + busy >= FB.max; addB.disabled = full || sending; $('span', addB).textContent = T('Ajouter une capture') + (d.imgs.length ? ` (${d.imgs.length}/${FB.max})` : '');
    goB.disabled = sending || busy > 0; goB.textContent = sending ? T('Envoi…') : T('Envoyer');
    [areaS, tI, xI, cI].forEach(x => { x.disabled = sending; }); seg.classList.toggle('dim', sending);
  };
  const paintImgs = () => {
    imgs.innerHTML = d.imgs.map((x, i) => `<div class="fb-th" role="listitem"><img src="${x.url}" alt="${esc(T('Capture {n}', { n: i + 1 }))}" width="${x.w}" height="${x.h}"><button type="button" class="fb-x" data-fb-x="${i}" aria-label="${esc(T('Retirer la capture {n}', { n: i + 1 }))}"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button></div>`).join('')
      + Array.from({ length: busy }, () => `<div class="fb-th busy" role="listitem" aria-label="${esc(T('Préparation de la capture…'))}"></div>`).join('');
    imgs.hidden = !d.imgs.length && !busy; paint();
  };
  mountSeg(seg, FB_KINDS.map(([v, l]) => ({ v, label: T(l) })), d.kind, v => { d.kind = v; fbKeep(); paint(); });
  const sync = () => { d.area = areaS.value; d.title = tI.value; d.text = xI.value; d.contact = cI.value; fbKeep(); };
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', e => { sync(); if (e.target.getAttribute('aria-invalid')) calm(); paint(); });      // champ corrigé : le message s'efface
  areaS.addEventListener('change', sync);
  tI.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); xI.focus(); } });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); goB.click(); } });      // Ctrl+Entrée : envoyer
  addB.addEventListener('click', () => { haptic('tap'); fileI.value = ''; fileI.click(); });
  fileI.addEventListener('change', async () => {
    const files = [...(fileI.files || [])]; fileI.value = ''; if (!files.length) return;
    calm();
    const room = FB.max - d.imgs.length - busy, take = files.slice(0, Math.max(0, room)), msgs = [];
    if (files.length > take.length) msgs.push(T('3 captures au plus : les autres ne sont pas ajoutées.'));
    busy += take.length; paintImgs();
    for (const f of take) {
      let x = null; try { x = await fbShrink(f); } catch (e) { msgs.push(T('Image illisible : {name}. Choisis une capture d\'écran en PNG ou en JPEG.', { name: String(f.name || '?').slice(0, 60) })); }
      busy--; if (x && d.imgs.length < FB.max) d.imgs.push(x);
      if (sheets.includes(api)) paintImgs();
    }
    if (msgs.length && sheets.includes(api)) fail(msgs.join(' '));
  });
  imgs.addEventListener('click', e => {
    const b = e.target.closest('[data-fb-x]'); if (!b || sending) return;
    const i = Number(b.dataset.fbX); haptic('tap'); d.imgs.splice(i, 1); paintImgs();
    const nx = $$('.fb-x', imgs)[Math.min(i, d.imgs.length - 1)]; (nx || addB).focus();      // le focus reste dans la liste (ou passe au bouton d'ajout)
  });
  goB.addEventListener('click', async () => {
    if (sending || busy) return;
    calm(); sync();
    const title = fbLine(d.title), text = fbBody(d.text), contact = fbLine(d.contact).slice(0, FB.contact);
    if (title.length < 3) { fail(T('Donne un titre à ton avis (3 caractères au moins).'), tI); return; }
    if (!text) { fail(T('Décris ton avis en quelques mots.'), xI); return; }
    if (text.split('\n').length > FB.lines) { fail(T('La description doit faire de 1 à 1500 caractères, sur 30 lignes au plus.'), xI); return; }
    if (collOffline()) { fail(T('Hors ligne : ton avis n\'est pas parti. Réessaie une fois connecté, ton message est gardé.')); return; }
    sending = true; paint();
    let r; try { r = await fbPost({ kind: d.kind, title: title.slice(0, FB.title), text: text.slice(0, FB.text), area: d.area, contact, meta: await fbMeta(), imgs: d.imgs.map(x => x.url) }); } catch (e) { r = { status: 0, code: 'net' }; }
    sending = false;
    const open = sheets.includes(api);
    if (r.status === 200) {
      fbForget(); haptic('ok'); if (typeof prgAdd === 'function') prgAdd('fb');      // avis envoyé : badge « Voix du peuple » (progress.js)
      if (open) fbDone(api, r.url); else toast(T('Merci ! Ton avis est publié sur le Discord de Mana Orbit.'));
      return;
    }
    if (r.status === 404) { CTX.feedback = false; if (open) fbMail(api, title, text); return; }      // bot coupé sur le serveur : « Signaler un bug ou une idée » repasse au mailto
    if (!open) { toast(fbErrText(r)); return; }
    paint(); fail(fbErrText(r));
  });
  paintImgs();
  return api;
}
/** Avis publié : « Merci ! », le fil sur Discord (adresse reçue, seulement si c'est bien un lien Discord) et l'invitation au serveur. */
function fbDone(api, url) {
  const see = /^https:\/\/(?:[a-z]+\.)?discord\.com\/channels\/\d+\/\d+(?:\/\d+)?$/.test(url || '');
  api.body.innerHTML = `<div class="fb-done"><span class="fb-ok" aria-hidden="true"><svg class="i"><use href="#i-check"/></svg></span>
      <h3 tabindex="-1">${T('Merci !')}</h3><p>${helpNb(T('Ton avis est publié sur le Discord de Mana Orbit. L\'équipe y répond : suis la discussion là-bas.'))}</p>
      <div class="fb-links">${see ? `<a class="btn" data-fb="see" href="${esc(url)}" target="_blank" rel="noopener">${T('Voir sur Discord')}</a>` : ''}<a class="btn ghost" data-fb="join" href="${esc(DISCORD_URL)}" target="_blank" rel="noopener">${T('Rejoindre le serveur')}</a></div></div>`;
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button>`);
  const h = $('h3', api.body); try { h.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}
/** Envoi par le Discord coupé (404) : le message, déjà écrit, part par e-mail (mailto prérempli). */
function fbMail(api, title, text) {
  const err = $('.fb-err', api.body);
  err.textContent = T('L\'envoi par le Discord est coupé pour le moment : envoie ton avis par e-mail, ton message y est déjà recopié.'); err.hidden = false; haptic('warn');
  const pre = title + '\n\n' + text;
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><a class="btn" data-fb="mail" href="${esc(feedbackHref('', pre))}">${T('Écrire un e-mail')}</a>`);
  const a = $('[data-fb="mail"]', api.foot);
  helpApk().then(v => { if (v) a.href = feedbackHref(v, pre); });
  a.addEventListener('click', () => { if (typeof prgAdd === 'function') prgAdd('fb'); setTimeout(() => api.close(), 0); });
  a.focus();
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
/** La demande, comptée tout de suite (120 jours avant la suivante, 3 en tout). APK 1.0.6 et plus : la carte de Google Play dans l'appli (In-App Review) ; Google décide
 *  seul de l'afficher (quota) et ne dit jamais si une note a été laissée : la demande reste comptée, sans « plus jamais » ni badge. APK plus ancienne, appli installée
 *  hors du Play Store ou refus du Play Store : notre feuille (rateSheet). */
function rateShow() {
  RATE.pend = '';
  const st = rateRead(); st.n = (st.n || 0) + 1; st.at = Date.now(); rateWrite(st);
  const mo = typeof natPlugin === 'function' && natPlugin('ManaOrbit');
  if (mo && typeof mo.requestReview === 'function') { Promise.resolve().then(() => mo.requestReview()).catch(() => { if (rateQuiet()) rateSheet(); }); return; }      // refus : notre feuille, si l'écran est toujours calme
  rateSheet();
}
/** Notre demande : neutre, « Noter » ouvre la fiche Play Store ; « Plus tard », la croix ou Retour la repoussent de 120 jours. */
function rateSheet() {
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
