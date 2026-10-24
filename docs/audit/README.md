# Audit complet Mana Orbit — 24 octobre 2026

Synthèse de 7 analyses (1 étude concurrentielle + 6 audits par domaine). Détail, étapes de reproduction et références fichier:ligne dans les rapports :

| Rapport | Domaine |
|---|---|
| [00-concurrence.md](00-concurrence.md) | ManaBox, Mythic Tools, Moxfield, Archidekt, Dragon Shield, Delver Lens, Collectr, Lifetap, TurnZero… : matrices, manques classés |
| [10-coquille-android.md](10-coquille-android.md) | Accueil, navigation, premier lancement, visite, Compte et réglages, langues, accessibilité, APK (widgets, raccourcis, pub, plein écran) |
| [20-collection.md](20-collection.md) | Liste, filtres, Stats, import/export, éditions/foil, masterset, rangement, 5 000 cartes |
| [30-scan.md](30-scan.md) | Scan photo/auto, prix rapide, scan mobile, session d'ouverture, mode streamer (banc OCR de 54 images) |
| [40-decks-prix.md](40-decks-prix.md) | Mes decks, À monter, Communauté, builder, viewer, Prix d'une liste, panier |
| [50-echange-social.md](50-echange-social.md) | Échange, classeur, liens/QR, échange en direct, amis, Carte mystère, niveaux |
| [60-compteur-de-vie.md](60-compteur-de-vie.md) | Commander / Standard / Libre, 2 à 8 joueurs, affichages A/B/C, portrait/paysage, multi-téléphone |

**Couverture** : environ 1 900 captures au total (360, 375, 393, 412, 430 px, tablette 820, PC 1280 et 1890 px ; clair et sombre ; vide, rempli, déconnecté, connecté, hors ligne ; pont Android simulé). Pour le compteur de vie : 630 dispositions mesurées, plus une partie à 5 téléphones. Les captures sont restées dans la session d'audit et ne sont pas versionnées ; `tests/menus-e2e.mjs` (UI_FULL=1) les régénère.
**État global** : aucune erreur JS ni console sur l'ensemble des parcours, aucun défilement horizontal. Les problèmes sont surtout des **cas limites de données** (foil, sections d'import), des **adaptations PC / paysage** et des **manques fonctionnels** face aux concurrents.

---

## 1. Bugs à corriger en priorité

### P0 — données faussées ou fonction cassée
| # | Bug | Où | Effort |
|---|---|---|---|
| 1 | **Échange en direct : le foil est perdu.** Le serveur rejette la clé `en*`, la ligne arrive sans langue ni foil. Le donneur perd un exemplaire non foil, le receveur reçoit une carte sans langue ni foil. L'édition saute aussi | `proxy.mjs:1685` `trocG` | S |
| 2 | **Compteur de vie : deux appuis simultanés = un seul compté.** Le compteur ne retient qu'un appui à la fois. Le relâché d'un joueur peut appliquer le geste d'un autre, et l'appui long d'un joueur s'annule si quelqu'un d'autre touche | `partie-ui.js:397-406` (`PU.hold`) | S |
| 3 | **APK : l'écran se met en veille** pendant la partie, l'échange en direct et l'affichage d'un QR. Ces écrans appellent `navigator.wakeLock`, absent du WebView, au lieu de `natAwake()` (utilisé seulement par le scan) | `partie-ui.js:98,808`, `partie-qr.js:85`, `troc.js:314`, `share.js:466` | S |
| 4 | **Premier lancement cassé au-delà de 520 px** (PC, tablette, paysage) : diapositives décalées hors de l'écran (vu en capture) | `style.css:1532` + `onboard.js` › `obGo` | S |
| 5 | **Import de decklist : Maybeboard et Tokens** (exports Moxfield/Archidekt) comptés, chiffrés et cherchés. Le Sideboard est traité différemment selon la syntaxe | `core.js:173-195` | S |
| 6 | **Scan « Saisir »** sur une ligne non reconnue : la carte va directement dans la collection du téléphone, sans édition ni rangement, et ni dans le deck ou le lot ni sur le PC en scan mobile. **« + » du prix rapide** : ignore « Ranger dans », l'édition et le foil | `scan.js:1309`, `scan.js:1291` | S |
| 7 | **Foil valorisé au prix non foil** : total du scan, récap et bilan d'ouverture, balance de l'échange | `scaned.js:18`, `scan.js:231,269`, `opening.js:64`, `share.js:82`, `proxy.mjs:1704` | S-M |
| 8 | **« Remplacer ma collection »** sans confirmation (seulement un toast « Annuler »). **Réimporter le même fichier** en mode Ajouter double les quantités sans prévenir | `collection.js` (import) | S |
| 9 | **Builder** : il refuse les cartes autorisées en nombre quelconque (Relentless Rats, Shadowborn Apostle, Persistent Petitioners…) | `builder.js:157`, `core.js:939` | S |
| 10 | **Annuler un échange en direct** : 6,5 s dans un toast, d'un seul côté. L'autre joueur n'est pas prévenu et les deux collections divergent | `app.js:185` | M |

### P1 — erreurs visibles
- Collection, tri « Édition » : une ligne est rangée sous une extension qui n'est pas la sienne (`collection.js:986`). Sur PC, les intertitres prennent une case de la grille (`zz-desktop.css:114`, il manque `grid-column:1/-1`).
- PC : la courbe « Valeur dans le temps » est étirée sur toute la largeur, plus haute qu'un écran, avec un texte d'environ 28 px (vu en capture, `.vl-svg`, `style.css:1054`).
- Le bandeau « N cartes sans langue » compte toute la collection, même filtrée, et son bouton modifie des cartes invisibles (`collection.js:1200`).
- Résultats de prix : toucher une carte possédée affiche « Aucune offre ne correspond » (`app.js:870`). Le compte des cartes possédées diffère entre le viewer et « À aller chercher », à cause des terrains de base.
- « Publier » un deck n'applique pas les règles du format : 4 Sol Ring ou des cartes hors identité passent (`pubdecks.js:115`).
- Les couleurs d'un deck ne sont déduites que des terrains de base (`core.js:922`), donc le filtre couleur se trompe.
- « Chercher les manquantes » (deck EDHREC) charge la liste sans lancer la recherche. « Exemple » et « Vider » écrasent la saisie sans confirmation ni annulation (`app.js:1318`).
- Recherche hors ligne : le bouton propose « Réglages » au lieu de « Réessayer », les étapes continuent de tourner, et hors proxy le joueur lit « Lance le proxy local (node proxy.mjs) » (`app.js:539`).
- Le pseudo public de la Carte mystère est pré-rempli avec le nom Google (prénom + initiale, `daily.js:144`), contrairement à ce que dit le README. **Point de confidentialité.**
- La vibration est coupée dès que le téléphone demande de réduire les animations, même avec Vibration activée (`app.js:153`).
- Pastille d'état « réussite » toujours orange (`style.css:262` vise `.sy-d` au lieu de `.dot`). Champ Pseudo sans style (`decks.js:276`, pas de `type`).
- Compteur : bandeau « Éliminer ? » qui cache « Fin du tour ». PV à 4 chiffres qui débordent. Un hôte sans pseudo s'appelle « Moi » chez tout le monde.
- Échange : l'hôte lit « Échange avec <son propre nom> ». Élisions fausses (« de Alice »). « Pour toi » de l'accueil en retard sur la page de l'ami.
- Scan : noms coupés au milieu d'un mot à 360 px (`style.css:1040`, `overflow-wrap:anywhere`). L'aide « ? » sur deux colonnes pousse « Auto » hors de l'écran. Hors ligne au premier usage : « Nom non reconnu » alors que le bandeau promet la lecture.
- Accessibilité : au premier lancement, ni piège de focus ni Échap. `#nav` reste joignable derrière les fiches. Liens d'aide en bleu navigateur (contraste ≈ 2:1 en sombre).
- i18n :
  - pluriels de la fiche Compte écrits avec `n > 1` (« 0 card » en anglais, `me.js:47`) ;
  - clé `decks` manquante dans les 5 dictionnaires ;
  - chevauchements en allemand à 360 px ;
  - mélange « cards » / « cartas » en portugais.
- Textes faux ou périmés :
  - la feuille Importer dit que les éditions s'additionnent (`collection.js:1495`) ;
  - le guide ManaBox affirme que le foil, l'état et les classeurs ne sont pas importés (`switch.js:36-40`, `pwa/passer-de-manabox.html:123-127`) ;
  - « Nouveau panier » reste dans les raccourcis Android, le manifeste et la fiche Prix ;
  - « Laisser un avis sur Google Play » est proposé alors que l'accueil annonce « Bientôt » ;
  - des messages techniques s'affichent aux joueurs (« SDK Firebase bloqué », « Ajoute VAPID_PUBLIC_KEY… (voir README) ») ;
  - la page hors ligne de l'APK n'existe qu'en français.

---

## 2. Améliorations UI / UX (menus, parcours)

### Gains rapides (effort S)
- **Cibles tactiles < 44 px** partout (constat commun aux 6 audits) :
  - pastille « Niv. » 49×20 ;
  - − / + de la collection 30×36 ;
  - choix Ajouter / Prix du scan 88×28 ;
  - boutons de la fiche joueur et des blessures de commandant 28-30 ;
  - pastilles de langue de l'échange 32 ;
  - icônes de l'en-tête 34.

  Corriger en un lot CSS, avec une garde dans `menus-e2e` (`UI_STRICT`).
- **Accueil vide** : remplacer « elles seront déduites du panier » par une carte « Pour commencer » (Scanner · Importer · Je viens de ManaBox) ; masquer QR et Partager tant que la collection est vide ; passer la carte Discord sous le compteur de vie.
- **Premier lancement, étape 3** : proposer la sauvegarde par compte Google en une touche au lieu du token CardTrader. Sur l'écran de connexion, mettre Google en premier, avec son logo.
- **Compte et réglages** (2,5 écrans) : fusionner les entrées d'aide en double, et donner une vraie ligne « Niveau et badges ».
- **Icône de la Carte mystère** : aujourd'hui un « ? » qu'on confond avec l'aide.
- **Retrait d'un exemplaire** (collection, scan) : supprimer la confirmation de chaque « − » et proposer « Annuler » à la place.
- **Confirmations manquantes** : « Nouveau lien » et « Arrêter le partage » (échange), suppression d'un deck (pas d'Annuler).
- **Verbes cohérents** : « Ouvrir » (feuille d'un deck) et « Modifier la liste » (viewer) chargent la liste dans Prix d'une liste au lieu d'ouvrir le viewer ou l'éditeur.
- **Indicateur hors ligne** : « Hors ligne · prix du 23/10 » dans l'en-tête.
- **Compteur de vie** : verrouiller le portrait, ou gérer le paysage. En paysage, l'affichage A devient illisible : noms réduits à « H… », PV à 26 px.

### Chantiers moyens (effort M)
- **Densité sur téléphone** :
  - collection : la 1re carte commence à 55 % de l'écran à 393 px, seulement 3 cartes visibles ;
  - échange : la liste commence vers y = 700 ;
  - Mes decks : 2 decks par écran à 360 px.

  Proposer un en-tête qui se replie au défilement, une vue compacte et une vue grille.
- **Fiche carte unique** en touchant la ligne : +/−, exemplaires par langue et par édition, prix CM, CT et foil, courbe, decks qui l'utilisent, échange, « Suivre le prix ». Aujourd'hui, seule la vignette ouvre l'image.
- **Viewer d'un deck** : 8 actions au même niveau. Garder 2 actions principales et ranger le reste dans « ⋯ ».
- **Scan** :
  - un interrupteur Foil sur l'écran, avec une puce ✦ par ligne (1 appui au lieu de 3) ;
  - un bandeau « Édition de la 1re carte » réduit à une ligne ;
  - une seule feuille de fin de lot ;
  - le prix affiché sur chaque ligne ;
  - un bouton « Pas cette carte ? ».
- **Compteur de vie** :
  - fiche joueur ouverte dans sa tuile, tournée vers lui ;
  - blessures de commandant plus rapides (±5, appui long, mode « attaque » : attaquant puis défenseurs ; aujourd'hui 9 touchers pour 7 blessures) ;
  - réordonner les joueurs en préparation (le moteur et le serveur le savent déjà) ;
  - plan de la table pour choisir sa place ;
  - QR de table agrandissable.
- **Échange** : « Proposer un échange en direct » sur la page publique d'un autre joueur. Un visiteur sans correspondance arrive sur « À échanger » plutôt que sur « Pour toi 0 ».
- **PC (≥ 1100 px)** — les écrans restent souvent sur une seule colonne étroite :
  - viewer et éditeur sur 2 colonnes (comme Moxfield) ;
  - vue tableau de la collection, avec sélection multiple ;
  - Stats sur 2 colonnes ;
  - masterset adapté à la largeur ;
  - échange en direct et Carte mystère sur 2 colonnes ;
  - 3e colonne de l'accueil à remplir à 1890 px ;
  - scan PC : proposer d'abord « Scanner avec ton téléphone » plutôt que la webcam.

---

## 3. Fonctionnalités existantes à améliorer
- **Démarrage** : la page fait 4,66 Mo (1,41 Mo en gzip), dont 1,76 Mo pour les 5 dictionnaires toujours inclus et du JS non minifié. Charger seulement la langue utilisée, minifier, héberger les polices soi-même (RGPD).
- **Recherche de la collection** : elle ne porte que sur le nom. Ajouter des filtres langue, foil, rareté, prix, doublons et emplacement, et une mini-syntaxe Scryfall (`t:` `e:` `r:` `is:foil`).
- **Export sans perte** : sauvegarde complète réimportable (emplacements, détails, proxys, dates), aussi sans compte (JSON local). À l'import, lire aussi les colonnes ignorées : dossiers Dragon Shield, Proxy, Alter et Misprint de Moxfield, prix d'achat.
- **Alertes de prix** : aujourd'hui seulement les baisses des cartes manquantes. Ajouter « Suivre le prix » d'une carte possédée, avec alerte à la hausse.
- **Stats** : qu'elles suivent le filtre et l'emplacement affichés.
- **Balance d'échange juste** (édition, foil, état). « Pour toi » qui pré-remplit une proposition. Historique des échanges synchronisé sur le compte (aujourd'hui : 50 échanges, sur l'appareil seulement).
- **Scan mobile** : appairage du téléphone par QR, sans compte.
- **Prix rapide fidèle** au scan : édition, foil et langue lus sur la carte.
- **Scan des foils** : conseil immédiat en cas de reflet, puis relecture par la ligne du bas, l'illustration ou le symbole (0/8 lus avec un reflet sur le nom).
- **Taux de victoire par deck** : il existe dans les stats de parties ; l'afficher aussi dans le viewer du deck, avec le nombre de joueurs et l'avantage du premier joueur.
- **Widgets Android** : bouton d'ajout direct (`requestPinAppWidget`), thème clair et Material You, icône thématisée (Android 13).
- **Raccourcis** : « Nouvelle partie » et « Carte mystère », raccourcis dynamiques, tuile des réglages rapides « Scanner ».
- **APK** : mises à jour dans l'appli (Play In-App Updates). Version lisible, avec « Quoi de neuf ».

---

## 4. Nouvelles fonctionnalités (classées par valeur / effort)

Les points forts sans équivalent chez les concurrents sont à garder et à mettre en avant :
- la chaîne d'échange complète (liste calculée seule, lien ou QR lisible sans appli, échange en direct) ;
- le scan en français et en langues asiatiques ;
- le panier CardTrader optimisé, port compris ;
- les decks à monter classés selon la collection ;
- le compteur multi-téléphone avec mode sans réseau ;
- le widget de valeur ;
- la gratuité sans plafond.

| Prio | Fonctionnalité | Référence | Impact | Effort |
|---|---|---|---|---|
| 1 | **Dés (D4 à D20), pile ou face, tirage animé du premier joueur** dans le compteur | Tous les compteurs | Fort | S |
| 2 | **Compteurs libres « + Compteur »** : le moteur en accepte déjà 8. Préréglages trésors, tempête, l'Anneau, Vitesse, mana flottant, plus des pastilles jour/nuit et bénédiction de la cité | Lifetap, Lotus | Fort | S |
| 3 | **Texte Oracle (FR et EN), légalités et rulings** dans la carte en grand (Scryfall, données déjà lues) | Tous | Fort | S |
| 4 | **Légalité multi-formats et cartes bannies** dans le builder et la publication : Modern, Pioneer, Pauper, Duel Commander, Brawl, Oathbreaker | Moxfield, Archidekt | Fort | M |
| 5 | **Export « Copier pour Arena / MTGO / Moxfield »** | Moxfield, ManaBox | Fort | S |
| 6 | **Historique des PV** (courbe, tour par tour, CSV) **+ chrono de partie et horloge de tour** (pendule en 1 contre 1) | Lifetap, Mythic Tools | Fort / Moyen | M |
| 7 | **Recherche avancée de la collection, avec recherches enregistrées** | Moxfield, Delver Lens | Fort | M |
| 8 | **« Cartes de ta collection pour ce deck »** : synergie EDHREC croisée avec la collection, une fonction unique | EDHREC, Mythic+ | Fort | M |
| 9 | **Courbe de prix sur 30 à 90 jours par carte**, plus « Ça bouge dans ta collection » (écran et widget) | Dragon Shield, Collectr | Moyen | M |
| 10 | **Main de départ avec mulligan de Londres**, pioche des tours 2 à 5, probabilités et sources de mana | Archidekt, TopDecked | Moyen | M |
| 11 | **Combos repérés** (Commander Spellbook) dans le viewer, qui alimentent le bracket | Archidekt, EDHREC | Moyen | M |
| 12 | **Réputation des échangeurs** après un échange validé des deux côtés, **ajout d'ami par pseudo ou code** | Deckbox | Moyen | M |
| 13 | **Étiquettes libres** par carte ou par exemplaire, **prêts** (« prêtée à… » avec rappel), **liste À vendre** enrichie (valeur nette, export de stock CM/CT) | Moxfield, aucun pour les prêts | Moyen | M |
| 14 | **Prix d'achat et plus-value** (facultatifs, repliés). Décision du 15 octobre à revoir : les données arrivent déjà par les imports, « J'ai acheté » et les sessions d'ouverture | Collectr, MTGGoldfish | Moyen | M |
| 15 | **Stats de groupe** : graphe dans le temps, classement du groupe, résultats selon la place du premier joueur | Mythic Tools, TurnZero | Moyen | M |
| 16 | **Widget « Carte mystère du jour »** (compte à rebours, série), **raccourci et widget « Compteur de vie »** | aucun | Moyen | S-M |
| 17 | **Proxys imprimables** des cartes manquantes (PDF 3×3) | Moxfield | Moyen | M |
| 18 | **Prix en USD** selon la région (la fiche Play est en anglais par défaut) | MTGGoldfish, ManaBox | Moyen hors UE | S |
| 19 | **Vue streamer pour OBS** ; en session d'ouverture, meilleure carte affichée en direct | aucun | Faible à moyen | M |
| 20 | Tags et maybeboard du builder, playtest « goldfish », comparaison de decks, Planechase et Archenemy | Moxfield, Archidekt, Lifetap | Faible à moyen | M-L |

Déjà prévus dans `docs/a-faire.md` (non repris ici) : appli iOS, mode organisateur et tournois, BO3, table sans réseau en Bluetooth, bracket pour tous les decks, tri du vrac, manifeste en 6 langues, partage de la progression du masterset.

---

## 5. Plan suggéré
1. **Lot correctifs P0** (≈ 1 à 2 jours, effort S chacun) : bugs P0 1 à 9. Chacun avec un test e2e de régression, dans le test existant du domaine.
2. **Lot « table de jeu »** : dés, pile ou face, premier joueur ; compteurs libres ; portrait verrouillé ; ±5 et appui long sur les blessures ; fiche dans la tuile ; ordre des joueurs. C'est le domaine où l'écart avec les concurrents est le plus visible et le moins coûteux à combler.
3. **Lot « fiche carte »** : Oracle, légalités, rulings, prix et courbe, +/−, suivre le prix. Ce lot sert à la fois la collection, les decks, le scan et l'échange.
4. **Lot UI transversal** : cibles de 44 px, accueil vide, premier lancement, Compte et réglages, densité des listes, mises en page PC sur 2 colonnes.
5. **Lot decks** : formats et bannies, export Arena/MTGO, mulligan, « cartes de ta collection pour ce deck ».
6. **Lot performance** : dictionnaires chargés à la demande, minification. Relancer `tests/perf-e2e.mjs` sur une machine au repos : les mesures de l'audit ont été faites sous forte charge.
