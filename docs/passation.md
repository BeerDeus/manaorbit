# Passation — reprise dans un nouveau chat

**À lire en premier : `docs/a-faire.md`** (section « Pour reprendre », puis « Prochaines améliorations »). Ce fichier-ci résume où on en est au **12 octobre 2026 au soir** : appli en **test interne** sur Google Play, prête pour le test fermé (voir « Fait le 12 octobre » et « Où on en est »).

## Le projet
- **Mana Orbit** : appli Magic: The Gathering (collection, scan, prix Cardmarket/CardTrader, decks EDHREC/Archidekt, échanges, alertes).
- PWA en ligne : https://manaorbit.app depuis le 12 octobre (avant : card.m2s-photo.fr, qui fait déménager les appareils ; Hostinger déploie `main` du dépôt `BeerDeus/manaorbit` ; serveur Node `proxy.mjs`).
- APK Android (Capacitor 8, `android-app/`) qui charge le site en ligne : un changement de `src/` arrive sur le téléphone sans refaire l'APK ; seul le natif (Java, XML Android) en demande une nouvelle.
- But : que l'appli **s'autofinance** (pub, plus tard achat « Soutenir »), pas faire du profit.

## Façon de travailler (préférences du propriétaire)
- Réponses en français, directes, en listes, sans préambule ; code d'abord.
- **Pousser d'abord, tester ensuite** (demandé le 11 octobre) : dès qu'un changement est prêt (`node build.mjs` fait), pousser sur la branche de travail puis sur `main` ; ensuite la batterie de tests tourne en fond (`bash tests/run-tests.sh` et la CI). Un échec : corriger, repousser, relancer, jusqu'à tout vert. Le propriétaire teste sur son téléphone pendant ce temps.
- Commits en français, terminés par les lignes d'attribution de la session. Aucun nom de modèle ailleurs.
- Pas de pull request sauf demande.
- Jamais dans le dépôt : `google-services.json`, clé du compte de service FCM, variables Hostinger. Ne jamais demander ni taper de mot de passe.
- Poser des questions si une décision lui revient (il aime choisir entre 2–3 versions pour le visuel).

## Technique : l'essentiel
- `node build.mjs` assemble `src/*.js` (liste fixe), `src/css/*.css`, `src/i18n/<langue>.json` dans `deck-deal.html` (committé). Toujours reconstruire après un changement de `src/`.
- Version affichée dans Réglages = empreinte du contenu de la page (ex. `b966ea3e`), **pas** le numéro de commit.
- Tests : `bash tests/run-tests.sh [fichiers]` (tous ≈ 30 min). CI : `tests.yml` (tout), `rules.yml` (règles Firestore, émulateur), `fr-names.yml` (catalogues des noms, hebdo), `prices.yml`, `edhrec.yml`.
- Interface en 6 langues (fr, en, de, es, it, pt) : toute chaîne visible ajoutée doit l'être dans **les six** `src/i18n/*.json` (`tests/test-i18n-langs.mjs` le vérifie).
- Pièges déjà rencontrés :
  - un `// commentaire` inséré au milieu d'une ligne avale la suite : commentaires en fin de ligne seulement, puis `node --check` ;
  - `--` interdit dans un commentaire XML Android (Gradle refuse) : `tests/test-android-xml.mjs` le vérifie ;
  - Firestore refuse les tableaux imbriqués (historique de valeur stocké en objets) ;
  - Hostinger **redéploie tout seul à chaque push sur `main`** (site et serveur `proxy.mjs`) : rien à faire à la main.

## Fait pendant ce chat (tout est sur `main`, CI verte au commit `db65bce`)
- Aperçu de carte → grand format partout ; images dans le chiffrage Cardmarket d'un deck.
- Internationalisation : langue des cartes et des prix selon la langue de l'appli ; interface traduite en allemand, espagnol, italien, portugais.
- Prochaines extensions : lien Secret Lair, lien « Précommander » Cardmarket ; explication Mystery Booster / Commander.
- Decks : enregistrer dans « Mes decks » un deck reçu par lien ou un deck EDHREC/Archidekt ; onglet Decks réservé aux comptes Google ou e-mail vérifié (envoi du mail de vérification depuis l'appli).
- Collection vide : les onglets restent visibles avec « Scanne pour débuter ».
- « Partager » ouvre le menu de partage Android dans l'APK (WhatsApp, Messages, Messenger…), sinon partage du navigateur, sinon copie.
- Écran de lancement animé (mélange A + B, 60 i/s, animations sur le compositeur) : complet au démarrage, court (0,6 s) pour les liens et rechargements ; Firebase chargé après.
- Scan multilingue : langue de l'appli, puis anglais, puis les autres langues **sur l'appareil** (`pwa/names-all.tsv`, ≈ 1,4 Mo compressé, téléchargé en Wi‑Fi à l'ouverture du scan, gardé 14 jours) ; le serveur (`/api/names/find`) prend le relais tant que le fichier n'est pas là. Texte lu affiché sous « Nom non reconnu ».
- Correctifs : notification push sans contenu (service worker), tests instables en CI (sw, trade, motion, extras, de), workflow des catalogues qui se recale sur `main` avant d'envoyer.
- `docs/a-faire.md` mis à jour : 2e widget (QR du lien d'échange), emplacement de la bannière de pub, plan B EDHREC/Archidekt, nom de domaine, achat « Soutenir ».

## Fait ensuite (9 octobre, fin de soirée)
- **Widget Android « QR code d'échange »** (`TradeWidget.java`, `widget_trade*.xml`) : QR du lien public de la liste d'échange, pseudo et « Liste d'échange » dessous, fond blanc ; sans lien « Crée ton lien d'échange » ; toucher → onglet Échange. Le site envoie la matrice du QR (`src/widget.js`, `setTradeWidget`) quand le compte est connu et que le lien, le pseudo ou la langue changent. Astuces dans Réglages › Widget et la feuille du QR code. **Nouvelle APK à faire.**
  - Vérifié ici sans SDK Android : Java compilé contre le framework Android (Robolectric `android-all`), rendu du bitmap décodé par un lecteur QR indépendant (jsQR) = bon lien ; ressources XML relues (aapt2 inaccessible : dl.google.com bloqué). La vraie compilation des XML se fait à la construction de l'APK.
- **Pub : emplacement « C » choisi** : en haut, seulement sur les écrans de consultation (accueil, collection, Mes decks, liste d'un autre joueur) ; masquée pendant saisie, recherche, résultats, éditeur de deck (`adsBusy`, `src/ads.js`).
- Scan de « Fulmine » (italien, appli en français) : reconnu après le redémarrage Node.
- **Interrupteurs EDHREC / Archidekt** : `EDHREC_OFF=1` / `ARCHIDEKT_OFF=1` sur Hostinger (`README.md`), sans nouvelle APK. Fichier EDH filtré (`edhFilter`, `src/edhbin.js`) ou refusé (410), import de liens refusé, l'appli cache et efface.

## Fait la nuit du 10 au 11 octobre
- **Édition par ligne** (comme ManaBox) : « 2 Sol Ring (CMM) 400 *FR* », choisie dans Carte en grand › Illustrations (symbole, extension, prix sous chaque illustration) ; prix de l'édition sur la ligne et dans la valeur ; import ManaBox / Moxfield avec éditions, export CSV avec « Collector Number ».
- **« Ajouter des cartes »** (bouton + de la collection) : recherche, carte en grand, édition, quantité, langue, Ajouter ; extension collante ; liste du lot modifiable ; Scanner vers le lot.
- **Édition au scan** (`scaned.js`) : symbole d'édition par carte scannée, posée d'office (extension unique, collante, majorité du scan, même carte), sinon à choisir ; confirmation à l'ajout ; le téléphone du scan mobile envoie l'édition (`e`) avec chaque carte.
- **Scan mobile** : PC › Ajouter des cartes › Scan mobile › Activer ; le téléphone (même compte) propose « Scanner » et chaque carte arrive dans le lot du PC (document Firestore `meta/scan`).
- Tests `edition-e2e`, `lot-e2e`, `mobscan-e2e`, règles (`rules-test.mjs`, vérifiées sur l'émulateur Firestore).

## Fait le 12 octobre (tout sur `main`)
- **Domaine manaorbit.app** : page de déménagement sur card.m2s-photo.fr (inutile en pratique : pas d'autres utilisateurs ; le sous-domaine peut être détaché), `app-ads.txt`, contact `contact@manaorbit.app`.
- **AdMob** : vrai ID d'application dans l'APK (bandeau de test tant que `ADMOB_BANNER_ID` est vide sur Hostinger), message RGPD publié, blocages, téléphone en appareil de test.
- **Play Console** : appli créée (`app.manaorbit`), clé `.jks` (chez le propriétaire, jamais dans le dépôt), **test interne en versionCode 2 (1.0.1)** validé sur le téléphone ; SHA-1 Play (signature + importation) et PC dans Firebase ; contenu de l'appli (classification IARC : PEGI « accord parental », USK/ClassInd 16, ESRB Teen ; public 13+ ; annonces ; ID publicitaire) ; sécurité des données (§ 8 de `docs/store/fiche.md`) ; fiches FR et EN ; profil de développeur (nom « Mana Orbit », e-mail public contact@, site vérifié dans Search Console, en-tête `docs/store/developer-header.jpg`). Compte **personnel** gardé ; statut de professionnel DSA : rien à déclarer tant qu'il n'y a pas de revenus Google Play (achats intégrés).
- **Fiche** : l'échange mis en avant (description courte, accroche, capture n° 3), captures refaites sur manaorbit.app (`node tools/store-assets.mjs`).
- **Premier lancement de l'APK** : plus de détour par l'ancienne adresse pour une appli installée après le 12 octobre (`info().installed`, `src/migrate.js`).
- **Mentions légales** `pwa/legal.html` sur `/legal` (EI, adresse, SIRET, téléphone pro, hébergeur), reliées depuis `/privacy` et les Réglages.
- **Import Moxfield par lien retiré** (pas d'API publique) ; **titres des decks Archidekt masqués** et plus gardés par `gen-edhrec.mjs` ; collection Firestore `games` gardée lisible (rien de personnel).
- Checklist de lancement (artefact) : https://claude.ai/artifact/Hcmx4KRojNrcC79iZuAjiY — la relire avant de la republier (le propriétaire y coche).

## Où on en est (12 octobre au soir)
1. **Test fermé** à ouvrir avec l'entourage seulement (groupe Google `mana-orbit-testeurs`, canal Test fermé, release v2 promue, examen Google 1 à 7 jours) : `docs/store/test-ferme.md`.
2. **Relance EDHREC / Archidekt envoyée le 15 octobre** (au lancement du test fermé), date limite 19 novembre (`docs/mails-partenaires.md`) ; recrutement public seulement après.
3. 12 testeurs inscrits 14 jours d'affilée ; testeurs : ouvrir l'appli 2-3 fois par semaine, 2 petits questionnaires (ou 1 à la fin).
4. Production vers le 20-25 novembre : demande d'accès, puis `ADMOB_BANNER_ID` sur Hostinger et liaison AdMob ↔ fiche Play.
5. **Prochaine session : `docs/prochaine-session.md`** (maquettes, onglet CardTrader sans token, aide des Decks, bouton Filtres, nouvelle navigation avec Decks à part, decks publics).
   - Fait le 12 octobre (nuit, suite) : **Compte et réglages** réunis dans une seule fiche du bas (piste C choisie par le propriétaire ; un seul bouton dans l'en-tête), captures Play refaites avec la nouvelle navigation.
   - Fait le 12 octobre (nuit) : **decks publics « Communauté »** (§ 6 : 10 par compte, publier / mettre à jour / retirer depuis le viewer, type Communauté dans À monter, « Signaler ce deck », filtre de mots, vraies cartes seulement ; serveur `/api/pubdecks` avec le compte de service FCM). **Règles Firestore à republier** (`pubdecks`, `pubreports`). Correctifs : dézoom de « Prix d'une liste », vol du splash vers l'accueil.
   - Fait le 12 octobre (soir, suite) : CardTrader proposé sans token (§ 2), aide et filtres des Decks (§ 3-4), **nouvelle navigation** (§ 5 : barre du bas, sections, accueil, pub sous l'en-tête, plein écran — APK 1.0.2 / versionCode 3 à refaire), scan automatique corrigé (confirmation sur le nom lu). Système d'amis et Réglages épurés : en attente (WIP / maquettes).
   - Fait le 12 octobre (soir) : maquettes choisies (§ 1) et **scanner revu** (§ 1 bis : extensions du scan, réglages dans le compte, « Éditions à choisir », scan automatique, lampe). **Règles Firestore à republier** (document `meta/prefs`).

## Actions du propriétaire en attente (avant le 12 octobre)
- Fait le 11 octobre : règles Firestore republiées (scan mobile), widget « QR code d'échange » testé et validé, bandeau de pub gardé en continu sur les écrans de consultation.
- Firebase › Authentication › Modèles › Vérification de l'adresse e-mail : nom d'expéditeur « Mana Orbit », langue française.
- Firebase › Authentication › Domaines autorisés : `manaorbit.app` (et garder `card.m2s-photo.fr`).
- **Nouvelle APK** après la bascule de domaine (`android-app` : `git pull`, `npm run setup`, `npm run apk`).
- **Mails EDHREC et Archidekt toujours sans réponse** (`docs/mails-partenaires.md`). Stratégie retenue :
  - lancer le test fermé sans attendre (pas public, accord non nécessaire) ;
  - envoyer une relance avec une échéance claire ;
  - sans réponse à la mise en production : publier avec crédit et lien (déjà là), lecture hebdomadaire par le serveur uniquement, interrupteur côté serveur prêt ;
  - en cas de refus : plan B (decks préconstruits MTGJSON, decks générés depuis Scryfall, EDHTop16 pour le cEDH) — détail dans `docs/a-faire.md`.

## Prochaine étape proposée
1. Voir « Où on en est (12 octobre au soir) » plus haut.
