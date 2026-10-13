# Prochaine session : épurer l'appli, Decks à part, decks publics

Demandé par le propriétaire le 12 octobre 2026. Ordre à suivre : 1 → 6. **Maquettes d'abord** (étape 1) : rien ne change dans le code de navigation avant son choix.
Règles habituelles : `docs/passation.md` (pousser d'abord, tests en fond jusqu'à tout vert, six langues pour chaque texte visible, jamais de secret dans le dépôt).
L'appli est en **test fermé** pendant ces travaux : le site se met à jour chez les testeurs à chaque push sur `main` (Hostinger), sans nouvelle APK. Rien ne doit casser ce qui marche.

## Objectif général
- Une appli **plus claire, plus épurée, centrée sur la collection et les échanges**.
- Les **Decks** deviennent une section à part entière, au lieu d'être répartis entre l'onglet Decks de « Ma collection », « Mes decks », la tuile « Deck à monter » et « Nouveau panier ».

---

## 1. Maquettes (avant tout code de navigation)
- Proposer **2 ou 3 variantes** en images, dans un artefact visuel, en thème sombre (celui de l'appli) et au format téléphone :
  - la **navigation** : barre en bas avec Accueil · Collection · **Scanner** (gros bouton au centre) · Échange · Decks ; variante sans Accueil, ou avec Decks dans un menu ;
  - l'**accueil épuré** : cote de la collection, échanges (« Pour toi », QR), prochaines extensions ; plus de tuile « Deck à monter » si Decks a sa section ;
  - l'**onglet Decks** avec le bouton « Filtres » (point 4) et l'aide réécrite (point 5).
- Le propriétaire choisit, puis on code. Il aime choisir entre 2 ou 3 versions pour le visuel.
- **Fait le 12 octobre** : maquettes dans le canevas https://claude.ai/artifact/Q78cqZyb3PEDPkNTH5YZfR (page « Version retenue » ; pistes A, B, C sur l'autre page). Faites d'après des captures de la vraie appli (390 × 844, thème sombre, monde des tests), pas d'après les images de la fiche Play. **Choix du propriétaire** :
  - barre du bas **A** : Accueil · Collection · **Scanner** (gros bouton foil au centre) · Échange · Decks ;
  - **accueil A** : orbite comme aujourd'hui (rayon 112 px, cercles de 44 px, entièrement visibles en tournant) + **cercle de l'orbite en pointillés** ; carte Échange (QR, Partager, « Pour toi » : listes d'amis ouvertes récemment, nouvelle fonction) ; prochaines extensions ; plus de tuiles « Deck à monter », « Prix rapide », ni « Nouveau panier » ;
  - **Decks B** : onglets soulignés **Mes decks** (écran d'arrivée) · À monter · Prix d'une liste ; « À monter » : recherche (Commandant / Carte), « Classer … puis … » en liste déroulante, bouton « Filtres (N) », pastilles des filtres actifs ; cartes de deck compactes ;
  - **Collection B** : carte de valeur (courbe 7 j) en haut, onglets Cartes · Stats, **symbole d'édition par ligne gardé** (rond plein / pointillés « à choisir ») ;
  - filtres des Decks dans une **feuille du bas** (« Voir N decks ») ; aide des Decks réécrite (une info par ligne) validée ;
  - icône du bouton Scanner : **n° 1 « Carte visée »** (viseur + carte + rayon de scan, SVG) ;
  - **pub sous l'en-tête** (bandeau natif pleine largeur, fixe, écart avec les boutons au-dessus et en dessous) ;
  - **plein écran** : barre d'état cachée (en-tête sur la ligne de la caméra frontale, position de la découpe transmise par l'appli), **barre de gestes gardée** en bas. Code natif : versionCode + 1.
- **Avant de mettre la nouvelle navigation en production** : revoir le **scanner** (plus beau, plus simple, plus rapide, extension choisie dès la première carte). Maquettes à proposer, voir l'étape 1 bis.

## 1 bis. Scanner revu (après le choix des maquettes du scanner)
- À faire avant la mise en production de la nouvelle navigation (demande du 12 octobre). Propositions et maquettes : pages « Scanner · proposition 2 » (retenue) et « Scanner · proposition 1 » du canevas.
- **Fait le 12 octobre** (détails : README › « Scan des cartes » et « Édition des cartes scannées ») :
  - caméra **compacte** (seul le nom est lu), boutons posés sur l'image, « Ajouter | Prix », pastille « Éditions », aide **fermée au départ** (« ? »), plus de bouton « Appareil » ;
  - éditions par **extensions du scan** : 1re carte choisie à la main (sauf extension unique), carte d'une extension connue du scan → posée d'office, de plusieurs → la majorité, d'aucune → « **Nouvelle extension** » ; bandeau de choix en tête de la liste (« Plus tard ») ;
  - **Réglages du scan** dans le compte (`users/{uid}/meta/prefs`) : éditions comme la 1re / carte par carte / sans édition, scan automatique (délai, même carte à la suite), langue imposée, vibration, son ; « Auto » en **interrupteur** (pas de barre « Manuelle | Auto ») ;
  - écran **« Éditions à choisir »** à la fin (une carte à la fois, illustrations) ;
  - **scan automatique** (nom immobile 0,4 s → lu, attend que la carte change ; « Encore X ? » +1 / Non) et **lampe**.
  - **À faire par le propriétaire** : republier les **règles Firestore** (nouveau document `meta/prefs`) ; essayer l'auto et la lampe sur un vrai téléphone (seuils réglables dans `src/scanauto.js` : `AU_STILL`, `AU_SAME`, `AU_GONE`, `AU_INK`).

## 2. Onglet CardTrader toujours visible, même sans token (petit)
- Aujourd'hui : le choix Cardmarket / CardTrader de « Nouveau panier » (`modeLabel`, `src/app.js`) est caché sans token (`ctReady()`), ainsi que la bascule CM / CT de la tuile valeur (Stats).
- À faire : **CardTrader toujours sélectionnable**. Sans token, le choisir affiche un encart à la place des offres :
  - « Pour voir les vrais prix CardTrader et remplir ton panier, il faut ton token CardTrader. » ;
  - bouton **« Obtenir mon token »** → `https://www.cardtrader.com/fr-FR/full_api_app` (nouvel onglet ; adresse `/en/` pour une appli en anglais si elle existe) ;
  - le **champ pour coller le token** directement dans l'encart (le même que Réglages › Prix), puis « Tester » ;
  - avertissement : « Ce token donne accès à ton compte CardTrader : ne le partage avec personne. Mana Orbit le garde sur ton appareil et ne l'envoie qu'avec tes recherches CardTrader. »
- Corriger aussi le texte de Réglages › Prix (« Paramètres › API ») avec le même lien.
- Rien à changer dans la fiche Play (token déjà déclaré dans la sécurité des données).
- **Fait le 12 octobre** (README › « Prix : Cardmarket par défaut, CardTrader avec un token »). Adresse `/en/full_api_app` hors français : pas vérifiable d'ici (cardtrader.com bloqué par le réseau du conteneur), **à essayer par le propriétaire** sur l'appli en anglais.

## 3. Texte d'aide des Decks (petit)
- **Intro de l'onglet**, raccourcie : « Decks des commandants les plus joués, comparés à ta collection. Prix Cardmarket du {date}. »
- **« Decks, tier, Game Changers et thèmes : comment lire »** : remis en forme, **une information par ligne** (nom en gras, puis l'explication), dans cet ordre : Moyen, Budget, Premium, cEDH, Populaire, (Communauté au point 6), Tier, Game Changers et bracket, Thèmes, Classer par… puis…, terrains de base ignorés, sources (EDHREC, Archidekt, EDHTop16).

## 4. Onglet Decks : filtres sous un bouton « Filtres » (moyen)
- Restent visibles : la **recherche** (commandant / carte) et le **tri** (« Classer par »).
- Un bouton **« Filtres »** avec le nombre de filtres actifs (« Filtres (3) ») ouvre une feuille : type de deck, tier, couleurs permises, budget maximum, thèmes, « J'ai le commandant », « Puis par ».
- Sous la barre : les filtres actifs en **pastilles** qu'on retire d'un ×, et « Tout effacer ».
- Même principe visuel que le bouton Filtres de la collection.
- **Points 3 et 4 faits le 12 octobre** (maquettes « À monter », « Filtres · feuille du bas », « Aide des Decks » du canevas ; README › « Onglet Decks »). « Communauté » arrivera avec le point 6.

## 5. Nouvelle navigation : Decks à part, appli épurée (gros, après le choix du point 1)
- Section **Decks** : decks à monter (EDHREC, Archidekt, Communauté), Mes decks, prix d'une liste (« Nouveau panier »).
- **Collection** : cartes et stats ; **Échange** : sa propre section (ma liste, Je recherche, « Pour toi », lien, QR).
- Retirer les doublons d'accès, alléger l'accueil, garder les raccourcis Android (scan, prix rapide, échange, nouveau panier) et le retour arrière (`back.js`) cohérents.
- Ensuite : refaire les **captures de la fiche Play** (`node tools/store-assets.mjs`, ordre dans `docs/store/fiche.md` § 9), mettre à jour l'aide intégrée (`src/help.js`), le README et les tests touchés.
- À faire **avant la production** (vers le 20-25 novembre) : les testeurs du test fermé donnent leur avis dessus.
- **Fait le 12 octobre** (README › « Navigation ») : barre du bas A, sections Collection · Échange · Decks (Mes decks · À monter · Prix d'une liste), accueil A (orbite en pointillés, carte Échange avec QR / Partager, « Pour toi » : listes d'amis ouvertes récemment), pub sous l'en-tête, plein écran (barre d'état cachée ; en-tête sur la ligne de la caméra avec l'APK 1.0.2).
  - **versionCode 3 (1.0.2) publiée** par le propriétaire. Ensuite : bande de 24 px en haut de l'écran (l'appli ne touche plus le bord, scan compris), barre d'état recachée après le volet des notifications (site). **APK 1.0.3 (versionCode 4)** faite par le propriétaire (barre d'état seulement passagère, MainActivity) ; prochaine **1.0.4 (versionCode 5)** (`build.gradle` à jour) : luminosité à fond pendant le QR code d'échange (`ManaOrbit.brightness`) et ajouts natifs de la nuit du 13 octobre.
  - Reste : refaire les captures de la fiche Play (`node tools/store-assets.mjs`) ; **système d'amis** demandé le 12 octobre : en WIP (`docs/a-faire.md`).

## 6. Decks publics des utilisateurs (gros, en dernier)
- **Fait le 12 octobre** (README › « Decks publics »). Choix du propriétaire : **10 decks par compte** ; filtre de mots sur ce qui est publié. Écarts avec le plan ci-dessous : le nom du deck est gardé dans le document mais jamais servi ; les cartes sont contrôlées contre le catalogue Scryfall (appli et serveur) ; un commandant absent d'EDHREC est ajouté sans tier ni rang.
- Un utilisateur connecté peut **publier** un de ses decks Commander. Les decks publics apparaissent dans la recherche de decks, comme un **type « Communauté »**, placé **juste avant « Moyen »** dans le filtre Decks.
- **Regroupés par commandant**, avec le même calcul que les autres : cartes possédées / à acheter, **prix estimé** (tendance Cardmarket), tier du commandant, Game Changers et bracket.
- **Modération (règles Google sur le contenu créé par les utilisateurs)** :
  - **aucun texte libre** : pas de titre ni de description ; nom affiché « Commandant · deck de {pseudo} » ; les cartes viennent du catalogue Scryfall ;
  - **« Signaler ce deck »** sur chaque deck public ; masqué automatiquement après quelques signalements ; le propriétaire de l'appli peut retirer un deck ;
  - garde-fous : deck Commander valide (100 cartes, commandant reconnu), **quelques decks publics au plus par compte**, dépublier en un geste, deck supprimé = retiré.
- **Technique proposée** : Firestore (document par deck public, écriture par son auteur seul, règles testées dans `tests/rules-test.mjs`) ; le **serveur** rassemble régulièrement les decks publics dans un petit fichier statique (comme `edh.bin.gz`), l'appli les classe avec le même moteur (`edhRank`). Pas de liste Firestore côté client (coût et abus).
- **Documents** : politique de confidentialité (decks publics : ce qui est visible, comment retirer) ; mentions légales : « Règles de publication » ; fiche Play à revoir si besoin (description, sécurité des données : contenu publié par l'utilisateur lui-même).

## 7. « Passer de ManaBox » et images à partager (faits le 13 octobre, branche `feat/partage`)
- **Guide « Passer de ManaBox en 2 minutes »** (`src/switch.js`, feuille) : depuis Importer, la collection vide, le premier lancement et l'aide ; page web publique `/passer-de-manabox` (`pwa/passer-de-manabox.html`) avec « Importer ma collection » → `./?import`. Import vérifié sur de vrais exports (`tests/test-import.mjs`) et corrigé : TCGplayer (« Simple Name »), Deckbox (nom d'extension jamais pris pour un code), Dragon Shield (« sep=, » entre guillemets), Decked Builder (foil compté), listes ManaBox (souhaits) laissées de côté, langues inconnues → non précisée.
- **Images à partager** (`src/simg.js`, `simgShare(spec)`, PNG 1080 × 1350) : Stats › « Partager en image », « Partager le deck » › « Partager en image » (aussi sans compte), Échange › « Image avec QR » ; `kind: 'opening'` pour la session d'ouverture (contrat dans l'en-tête de `src/simg.js`). APK **1.0.4** : `ManaOrbit.shareImage` / `saveImage` (FileProvider) ; plus ancienne : lien ou image en grand.
- À voir sur le téléphone : vrai export ManaBox (chemin du menu, valeur de « Binder Type » d'une liste), menu Partager d'Android avec l'image (APK 1.0.4), rendu des images avec de vraies cartes Scryfall.
## 8. Classeur d'échange visuel (demandé le 12 octobre, fait le 13 octobre, branche `feat/classeur`)
- Demande : « en option, sur la page d'échange on peut switch avec un interrupteur entre le visu actuel et le classeur ; configurable depuis son espace (cartes en premier…) ». Réponses du propriétaire : épingler des cartes en tête, choix du tri (valeur, couleur, extension, nom), couleur du classeur visible des visiteurs ; pas d'ordre entièrement manuel.
- **Fait** (README › « Liste d'échange » › Classeur) : interrupteur Liste | Classeur (icônes) dans la section Échange et sur la page publique, pages de 3 × 3 pochettes (glisser, flèches, clavier ; deux pages côte à côte sur grand écran), « Mon classeur » (Personnaliser : couleur, tri, 18 épingles). Réglages publiés dans le champ `d` du partage : **aucune règle Firestore à republier**.
- **À voir sur le téléphone** : fluidité du glisser (Android bas de gamme), lisibilité des pastilles sur de vraies cartes, couleurs des couvertures en thème clair et sombre ; choix par défaut du visiteur (classeur seulement si le propriétaire a réglé le sien).
- Pas fait : indication foil (la collection ne garde pas le foil), ordre entièrement manuel (écarté par le propriétaire), saut direct à une page (au-delà de ~20 pages, la recherche est plus rapide).
## 9. Session d'ouverture et mode streamer (demandés le 13 octobre)
- **Fait le 13 octobre** (README › « Session d'ouverture et mode streamer ») : une seule entrée (scan › Réglages › Session d'ouverture), lot à part ajouté à la collection à la fin, bilan booster (prix payé, gain ou perte, meilleures cartes, partage si `simgShare` existe), « Mes ouvertures » (sur l'appareil, export texte) ; option **mode streamer** (`streamOn()`) : seules la session et sa valeur à l'écran, ni e-mail, ni lien ou QR d'échange, ni pub, ni notification dans l'appli ; la vraie collection reste synchronisée et le widget garde ses chiffres.
- Le propriétaire n'était « pas totalement sûr » de l'ouverture de boosters : la partie bilan s'enlève seule (`opnbilan.js`), toute la fonction aussi (README › « Retirer la fonction »).
- Captures : `scratchpad/morning/ouverture/` de la session du 13 octobre (non versionnées).

## Petits rappels
- Chaque texte visible : dans les six `src/i18n/*.json` (`tests/test-i18n-langs.mjs`).
- Code natif touché → `versionCode` + 1 et nouvel `.aab` par le propriétaire ; sinon rien à refaire côté Android.
- Mettre à jour `docs/a-faire.md` et `docs/passation.md` au fil des étapes.
