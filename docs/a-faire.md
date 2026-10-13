# À faire

## Pour reprendre (nouvelle session)
- Lire d'abord ce fichier et `docs/passation.md` (état au 12 octobre : test interne Play validé, test fermé à ouvrir), puis `README.md` (fonctionnement), `DEV.md` (build, tests, CI), `docs/android.md` (APK, widget, natif) et `docs/store/` (fiche Play Store, test fermé).
- Branche de travail, puis `main` (Hostinger déploie `main`). `node build.mjs` après chaque changement de `src/` ; `deck-deal.html` est committé.
- **Pousser d'abord** (branche puis `main`), puis tests en fond ; échec → corriger, repousser, relancer jusqu'à tout vert (préférence du propriétaire, `docs/passation.md`).
- Tests : `bash tests/run-tests.sh` (tous, ~30 min) ou une sélection ; la CI GitHub (`tests.yml`, `rules.yml`) les relance à chaque push.
- Jamais dans le dépôt : `google-services.json`, la clé FCM, les variables Hostinger (voir `README.md`).
- Code natif (Java, XML Android) modifié → `versionCode` + 1 dans `android-app/android/app/build.gradle`, puis le propriétaire refait un `.aab` signé (Android Studio › Generate Signed App Bundle, sa clé `.jks`) et l'envoie sur la piste de test. Le reste (site) arrive dans l'appli sans la refaire ; Hostinger redéploie à chaque push sur `main`.

## Prochaines améliorations (prévues)
- **Deuxième widget Android « QR code d'échange » : fait le 9 octobre, testé et validé sur le téléphone par le propriétaire le 11 octobre.** `TradeWidget.java`, `res/layout/widget_trade.xml`, `res/xml/widget_trade_info.xml` ; le site envoie la matrice du QR (`src/widget.js`, `setTradeWidget`). Détail dans `docs/android.md` (« Widget « QR code d'échange » »).
- **Bannière de pub : emplacement choisi le 9 octobre (variante C).** En haut, seulement sur les écrans de consultation (accueil, collection, Mes decks, liste d'un autre joueur) ; masquée pendant la saisie, la recherche et les résultats, l'éditeur de deck (en plus du scan, de la carte en grand, de l'accueil du premier lancement). `adsBusy` dans `src/ads.js`, test `ads-e2e.mjs`. Variantes écartées : A (haut partout), B (bas partout : sous « Chercher les offres » / « Remplir le panier », zone du pouce).
  - **Rythme : décidé le 11 octobre, on garde l'affichage continu** sur ces écrans (pas de « 2 min toutes les 5 min » : moins de revenus, et un bandeau qui revient au milieu d'une page fait sauter le contenu sous le doigt, risque de clics accidentels pour AdMob).
- **Page d'une extension : faite le 10 octobre.** Toucher une extension de l'accueil ouvre ses cartes révélées (recherche, filtres, rareté, tri, étoiles « liste de souhaits », carte en grand) au lieu de Scryfall. À voir sur le téléphone avec une vraie extension à venir. Idée : y ajouter les decks Commander rattachés.
- **Édition par ligne + « Ajouter des cartes » façon ManaBox : faits le 11 octobre.** Chaque ligne de la collection peut avoir son édition (`2 Sol Ring (CMM) 400 *FR*`), choisie dans Carte en grand › Illustrations (symbole, extension et prix sous chaque illustration) ; prix de l'édition sur la ligne et dans la valeur. Bouton **+** de la collection : page « Ajouter des cartes » (recherche, carte en grand, édition, quantité, langue, Ajouter ; extension collante ; liste du lot modifiable ; Scanner). Détail dans `README.md` (« Édition par ligne », « Ajouter des cartes »). À voir sur le téléphone : lisibilité des symboles en thème sombre, taille de la carte sur petit écran, rapidité du choix d'édition.
  - Pas encore : foil et état (Near Mint…) par ligne, prix d'achat ; décks Commander dans la page d'une extension.
- **Recherche dans toutes les langues (« Ajouter des cartes », « Ajouter une carte ») : faite le 11 octobre** (names-all.tsv). À voir sur le téléphone : temps de la première recherche (index ≈ 145 000 noms construit à la demande).
- **Édition au scan : faite le 11 octobre, revue le 12** (extensions du scan, voir « Scanner revu »). Chaque carte scannée a son symbole d'édition, posée d'office le plus souvent possible (extension unique, collante, majorité du scan, même carte), sinon « à choisir » ; confirmation à l'ajout s'il en reste ; scan mobile compris. Détail dans `README.md` (« Édition des cartes scannées »). À voir sur le téléphone : place du symbole sur petit écran, justesse de la majorité sur un vrai paquet.
- **Scanner revu : fait le 12 octobre** (maquettes « Scanner · proposition 2 » du canevas, `docs/prochaine-session.md` § 1 bis). Caméra compacte, éditions par extensions du scan (1re carte à la main, « Nouvelle extension », majorité), réglages du scan dans le compte, écran « Éditions à choisir », scan automatique, lampe. Détail dans `README.md` (« Scan des cartes »).
  - **À faire par le propriétaire** : republier les **règles Firestore** (nouveau document `users/{uid}/meta/prefs`) ; sans elles, les réglages du scan restent sur l'appareil.
  - À essayer sur le téléphone : scan automatique sur un vrai paquet (cartes posées sur la table, en main), « Encore X ? » quand on repose la même carte, lampe ; seuils dans `src/scanauto.js`.
- **Scan mobile : fait le 11 octobre.** PC (page « Ajouter des cartes ») › Scan mobile › Activer ; le téléphone sur le même compte affiche « Ton PC attend des cartes » › Scanner : chaque carte arrive dans le lot du PC. Détail dans `README.md` (« Scan mobile »).
  - Règles Firestore (document `users/{uid}/meta/scan`) : republiées par le propriétaire le 11 octobre.
  - À essayer : PC (Chrome) + téléphone (APK et navigateur), réseau mobile, téléphone qui se met en veille pendant le scan.
- **Nouvelle navigation : faite le 12 octobre** (barre du bas, sections, accueil épuré, pub sous l'en-tête, plein écran ; README › « Navigation »).
  - **versionCode 3 (1.0.2) publiée** (en-tête sur la ligne de la caméra). Ajouté ensuite : bande de 24 px en haut (scan compris), barre d'état recachée après le volet des notifications (site, toutes les APK).
  - **1.0.3 (versionCode 4) faite par le propriétaire** (13 octobre) : barre d'état seulement passagère (glissé du haut, volet). **Prochaine : 1.0.4 (versionCode 5)**, `build.gradle` déjà à jour : luminosité à fond pendant le QR code d'échange (`ManaOrbit.brightness`) + ajouts natifs de la nuit du 13 octobre (partage d'images…) ; sans elle, le site fait tout le reste.
- **Système d'amis (WIP, demandé le 12 octobre)** : pour l'instant « Pour toi » sur l'accueil montre les listes d'amis ouvertes par un lien (sur cet appareil, nombre relevé à l'ouverture). À concevoir : ajouter un ami (lien, QR, pseudo), sa liste toujours à jour sans rouvrir le lien, « Pour toi » recalculé, notifications quand un ami a une carte recherchée ; règles Firestore, confidentialité (ce que voit un ami), modération (pseudo, photo). Maquettes d'abord.
- **Decks publics « Communauté » : faits le 12 octobre** (10 par compte, filtre de mots, vraies cartes seulement ; README › « Decks publics »).
  - **À faire par le propriétaire** : republier les **règles Firestore** (`pubdecks`, `pubreports` ; sans elles, « Publication refusée : règles Firestore à publier ») ; rien à ajouter sur Hostinger : le serveur lit Firestore avec le compte de service déjà en place (`FCM_SERVICE_ACCOUNT`). Vérifier `/__ping` › `pub: true` après le déploiement.
  - Fiche Play › Sécurité des données / Contenu généré par les utilisateurs : déclarer les decks publiés (pseudo, liste), le signalement dans l'appli et le retrait.
  - Modération : un deck se retire à la main en supprimant son document dans la console Firebase (`pubdecks/…`), ou par `PUBDECKS_HIDE`.
- **Réglages épurés : faits le 12 octobre** (3 maquettes sur le canevas, page « Réglages · 3 pistes » ; choix du propriétaire : le contenu de la piste C dans une fiche du bas). Un seul bouton dans l'en-tête (l'avatar) ouvre « Compte et réglages » : compte, chiffres, Mon compte, Préférences (langue, thème, vibrations sur place), Prix, Plus ; chaque rubrique dans sa fiche. README › « Compte et réglages ».
- **« Passer de ManaBox » + images à partager : faits le 13 octobre** (branche `feat/partage` ; README › « Ma collection » › « Venir d'une autre appli », « Images à partager »).
  - **À faire par le propriétaire** : APK / `.aab` **1.0.4** (versionCode 5) avec `ManaOrbit.shareImage` (menu Partager d'Android avec l'image, FileProvider déjà au manifeste, chemin `share/` ajouté à `res/xml/file_paths.xml`) et `ManaOrbit.saveImage` (Photos › Pictures/Mana Orbit, Android 10+) ; sans elle, l'appli partage le lien ou montre l'image en grand (appui long). Code Java vérifié ici à la compilation contre l'API Android (bouchons Capacitor), pas sur un téléphone.
  - **Page publique** `https://manaorbit.app/passer-de-manabox` : la déclarer dans Google Search Console (et la relier depuis la fiche Play / les réseaux) ; ajouter le lien Google Play sur la page quand l'appli sera publique (PLAY_URL vide pour l'instant, test fermé).
  - À vérifier avec un vrai export ManaBox : chemin du menu (onglet Collection › menu en haut à droite › Export › CSV), colonnes, valeur de « Binder Type » pour une liste (`list` attendu : ces lignes sont laissées de côté).
  - Pas encore : foil et état gardés à l'import (la collection ne les connaît pas) ; Deckbox : édition à partir du nom d'extension.
- **Classeur d'échange visuel : fait le 13 octobre** (branche `feat/classeur` ; README › « Liste d'échange » › Classeur). Interrupteur Liste | Classeur (section Échange, page publique), pages de 3 × 3 cartes, « Mon classeur » (couleur, tri, cartes épinglées). Rien à faire côté Firestore ni Hostinger : les réglages voyagent dans le partage déjà autorisé.
  - À voir sur le téléphone : glisser entre les pages, pastilles (× et prix) sur de vraies cartes, couvertures en thème clair et sombre.
  - Pas encore : foil (pas gardé par la collection), saut direct à une page.
- **Proposition d'échange équilibrée** (plus tard) : cocher des cartes des deux côtés, balance de valeur, récapitulatif à partager.
- **Outils de partie** (plus tard, rien dans le code) : pas de compteur de vies dans Mana Orbit ; éventuellement un lien vers l'appli du propriétaire sur Google Play.
- **Langues, suites** : interface en fr, en, de, es, it, pt depuis le 9 octobre. Restent en français / anglais seulement : `pwa/manifest.webmanifest`, `pwa/privacy.html`, `<html lang>` et la description de `build.mjs`, la fiche Play Store (`docs/store/`), le texte d'aide « Nom français ou anglais » de la recherche de la liste publique. Poids : chaque langue ajoute ≈ 57 Ko compressés à la page (≈ 630 Ko en tout) : charger les dictionnaires à la demande si ça devient gênant. Japonais et chinois : clé de nom Unicode et modèles OCR à faire avant.
- Fait et validé par le propriétaire : système d'échange (« Pour toi », QR, valeurs), widget de valeur (4 tailles, courbe 4×2, bouton Scanner / Prix rapide).

## Si EDHREC ou Archidekt refusent (plan B, à préparer avant la production)
- **Interrupteur côté serveur : fait le 9 octobre.** Variables Hostinger `EDHREC_OFF=1` ou `ARCHIDEKT_OFF=1`, puis redémarrer l'app Node (détail dans `README.md`). Pour arrêter aussi la collecte : `EDH_ARCH: '0'` dans `.github/workflows/edhrec.yml` (Archidekt), ou désactiver le workflow (EDHREC).
- **Sources sans autorisation à demander**, pour garder « quels decks je peux monter, combien pour finir » :
  - decks préconstruits officiels (MTGJSON, licence MIT : toutes les listes Commander de Wizards) ;
  - decks générés par Mana Orbit depuis Scryfall (commandants populaires, cartes les plus jouées dans leurs couleurs, quotas terrains / mana / pioche / retraits) ;
  - cEDH : EDHTop16 / TopDeck.gg (API publique, crédit déjà affiché) ;
  - à terme : deck moyen « Mana Orbit » à partir des decks des utilisateurs, anonymisés (ligne à ajouter à la politique de confidentialité).

## Avant la publication sur le Play Store
- **Nom de domaine : `manaorbit.app`, fait le 12 octobre.** Acheté et relié au site par le propriétaire, contact `contact@manaorbit.app` créé ; dépôt GitHub renommé `BeerDeus/manaorbit`.
  - Code basculé : APK (`server.url`, `allowNavigation` vers l'ancienne adresse, page hors ligne, `PRICES_URL` du widget, QR d'aperçu régénéré), contact de l'aide, du signalement et de la politique de confidentialité, docs et fiche Play.
  - Ancienne adresse `card.m2s-photo.fr` : page de déménagement qui emporte les données de l'appareil, service worker qui se désinstalle, ancienne APK servie comme avant (`README.md` › « Adresse du site »). **Elle doit rester reliée au même site Hostinger.**
  - **À faire par le propriétaire** : nouvelle APK ; Firebase › domaines autorisés : `manaorbit.app`.
  - À vérifier : ouvrir un ancien lien d'échange `https://card.m2s-photo.fr/?p=…` depuis un navigateur qui a des données → arrive sur manaorbit.app, liste affichée, toast « tes données ont suivi ».
- **EDHREC et Archidekt** : réponses aux deux mails toujours en attente (`docs/mails-partenaires.md`).
  - Lancer le test fermé sans attendre (pas public, accord non nécessaire) ; envoyer la relance avec une échéance claire.
  - Sans réponse à la mise en production : publier avec crédit et lien (déjà là), lecture hebdomadaire par le serveur seulement, et l'interrupteur ci-dessus prêt. En cas de refus : basculer sur le plan B.
- AdMob : identifiants réels.
  - `admob_app_id` : fait le 12 octobre (`ca-app-pub-9859793504995886~7202291377`, `strings.xml`) ; `app-ads.txt` servi d'office avec cet éditeur.
  - `ADMOB_BANNER_ID` sur Hostinger : à la mise en production seulement (ID du bloc « Bannière », retrouvable dans AdMob › Applis › Mana Orbit › Blocs d'annonces).
- Créer la clé de signature release (`.jks`, à garder précieusement).
- Après le premier `.aab`, ajouter dans Firebase le SHA-1 de la clé de signature Play (`docs/android.md`).
- Vérifier auprès de l'URSSAF (ou d'un comptable) si l'édition d'une appli financée par la publicité doit être ajoutée aux activités de Martin Stuis EI.
- Compte développeur personnel récent : test fermé obligatoire (12 testeurs pendant 14 jours) avant la production.
- Play Console : remplir la fiche et le formulaire Sécurité des données d'après `docs/store/fiche.md`.
- **Test fermé** : étapes, groupe Google et textes dans `docs/store/test-ferme.md`. Envoyer d'abord la relance à EDHREC et Archidekt (`docs/mails-partenaires.md`).
- **AdMob pendant le test fermé** : `.aab` avec le vrai `admob_app_id`, mais `ADMOB_BANNER_ID` **vide** sur Hostinger jusqu'à la production (bandeau de test de Google, pas de trafic invalide).
  - Ne jamais toucher une vraie annonce ; appareils de test déclarés (`docs/android.md`).
  - Message de consentement Europe publié dans AdMob avant la production (`docs/android.md`, § 4).
- **app-ads.txt** : exigé par l'examen de l'appli dans AdMob (sans lui, annonces limitées).
  - Servi d'office sur `https://manaorbit.app/app-ads.txt` (le site web de la fiche), éditeur `pub-9859793504995886`.
  - Relier l'appli AdMob à la fiche Play dès la production.
- **Contrôles de blocage AdMob** : bloquer les catégories sensibles (jeux d'argent, rencontres, argent facile…) : public de 13 ans et plus, et la Fan Content Policy interdit un sponsor nuisible à Wizards. `maxAdContentRating` est déjà à « accord parental » (`src/ads.js`).
- **Statut de professionnel (DSA)** : vérifié le 12 octobre 2026, la Play Console (compte personnel) n'a pas de déclaration à part. Compte de développeur › Profil de développeur Play : « si vous choisissez de générer des revenus sur Google Play, votre adresse légale complète sera visible publiquement ». Les revenus sur Google Play, ce sont les achats intégrés ou une appli payante (profil marchand) ; le bandeau AdMob n'en fait pas partie, donc rien à faire aujourd'hui. E-mail public du développeur : `contact@manaorbit.app` (fait). Le jour de l'achat « Soutenir » (phase 2) : l'adresse légale devient publique, prévoir une domiciliation de l'EI avant si l'adresse personnelle ne doit pas s'afficher.
- **Import Moxfield : retiré le 12 octobre 2026.** Moxfield n'a pas d'API publique : `/api/import` refuse ses liens sans l'appeler, l'appli affiche « Liens Moxfield non lus : exporte la liste… ». Le collage de la liste et le CSV (format Moxfield) marchent toujours. À rouvrir seulement avec une autorisation écrite de Moxfield.
- **EDHTop16 / TopDeck.gg** : `gen-edhrec.mjs` lit l'API GraphQL publique d'EDHTop16 (données TopDeck.gg). Crédit et lien déjà dans Mentions et sources ; leur envoyer un mot de courtoisie.
- **Interrupteur EDHREC / Archidekt** : prêt (`EDHREC_OFF`, `ARCHIDEKT_OFF` sur Hostinger, voir « Si EDHREC ou Archidekt refusent »).
- **Décisions du 12 octobre 2026** : (1) la collection Firestore `games` de l'autre appli du propriétaire reste lisible par tout compte connecté (`firestore.rules`), parce qu'elle ne contient rien de personnel (ni nom ni e-mail) ; à fermer si ça change ; (2) titres des decks Archidekt : plus affichés (feuille d'un deck : commandant et type « Archidekt · Budget »…), ni gardés dans le fichier (`gen-edhrec.mjs`, à partir de la prochaine génération) : contenu de joueurs non modéré.
- **Politique de confidentialité** : une phrase sur « Signaler ce partage » et ce qu'il advient d'un lien signalé (règle Google sur le contenu publié par les utilisateurs).

## Plus tard : achat « Soutenir » (phase 2, après 4 à 8 semaines d'usage réel)
- **Ce que permet Wizards** (Fan Content Policy) : pub et dons, oui ; rendre payant l'accès au contenu ou une fonction, non.
  - Un achat unique qui retire seulement le bandeau se lit comme un don : zone grise, mais faible risque s'il ne débloque rien, ne s'appelle ni « Pro » ni « Premium », et si la version web reste complète et gratuite.
  - Pas de badge payant en v1 (EDHREC et Archidekt ont lu « aucune fonction payante »).
- **Google Play** : retirer la pub est un bien numérique, donc **Google Play Billing obligatoire**.
  - Aucun lien de don externe (Ko-fi, Buy Me a Coffee, Open Collective…) dans l'APK ni sur la fiche : en 2026, Google a bloqué les mises à jour d'AnkiDroid pour un lien Open Collective.
  - Un lien Ko-fi est possible sur le web seulement, caché quand `isNativeApp()`.
- **Technique** : produit non consommable `supporter` (≈ 3,99 €), via `@capgo/native-purchases` (Billing 9) ou environ 120 lignes Java dans `ManaOrbitPlugin`.
  - Accuser réception sous 3 jours (sinon remboursé), gérer l'état « en attente », relire `getPurchases()` à chaque lancement (réinstallation, remboursement).
  - `src/ads.js` : ajouter `|| AD.paid` à la condition qui retire le bandeau. Point d'accroche prévu dans `src/help.js` (`SUPPORTER_SKU`).
- **Avant de l'activer** : profil de paiement Play Console (Martin Stuis EI), produit intégré, comptes de test de licence ; IARC « Achats de biens numériques » → Oui (`docs/store/fiche.md`) ; politique de confidentialité ; prévenir EDHREC et Archidekt (la relance l'annonce déjà).
