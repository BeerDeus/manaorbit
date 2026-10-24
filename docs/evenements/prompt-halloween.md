# Prompt — Événements de Mana Orbit : chasse aux citrouilles d'Halloween 2026

> À coller dans un chat dédié (Claude Code sur le dépôt `BeerDeus/manaorbit`). Réponses en français, directes, en listes.

## Mission

Tu construis **le système d'événements saisonniers** de Mana Orbit et son **premier pack : Halloween 2026**, avec une **mise en production au plus tard demain (25 octobre 2026)**. Tu gères tout de bout en bout : conception, code, SVG, animations, tests, doc, fusion sur `main`. Tu peux lancer plusieurs agents en parallèle (worktrees), à toi de découper. Le propriétaire veut quelque chose de **vraiment stylé et complet** : animations soignées, messages classes, rien de cheap.

## Avant de commencer (obligatoire)

- Lis `DEV.md` (build, tests, ports fixes par fichier de test), puis dans `README.md` : « Niveau, badges », « Carte mystère », « Bot Discord », « Interface et mouvement », « Visite guidée et astuces », « Administration », « Installation (PWA) ». Lis aussi `docs/a-faire.md` et `docs/audit/README.md` (audit du 24 octobre).
- Code concerné :
  - badges et niveaux : `src/progress.js`, `src/badgeart.js` (glyphes SVG en mini-langage) ;
  - jeu quotidien et anti-triche serveur à imiter : `src/daily.js`, `daily-srv.mjs` ;
  - bot Discord : `discord-srv.mjs` (helpers `find`, `post`), `discord-daily.mjs` (annonces planifiées) ;
  - fond « Roue de mana » : `src/style.css`, `.dv` et `.hm-aura` ;
  - animations : `src/motion.js` ;
  - préférences : `src/me.js` ;
  - panneau admin : `pwa/admin.*` ;
  - icônes : `tools/make-icons.mjs`, `pwa/icons/`, `pwa/manifest.webmanifest`.
- **Branche** : crée `claude/evenements-halloween` depuis `origin/main` et travaille uniquement dessus.
  - Un autre chantier est encore en cours sur le **compteur de vie** (`src/partie*.js`, `src/css/partie*.css`, `tests/partie-*`) : n'y touche pas.
  - Avant de fusionner, fais `git fetch origin main` et intègre `main`.
- Conventions du dépôt, à respecter strictement :
  - aucune dépendance à la racine ;
  - `node build.mjs`, puis committer `src/` **et** `deck-deal.html` ensemble ;
  - textes via `T()` / `TN()`, traductions dans `src/i18n/<lang>.<module>.json` (en, de, es, it, pt ; le français est la langue des clés) ;
  - CSS nouveau dans `src/css/<module>.css` ;
  - nouveau module JS ajouté à la liste de `build.mjs` ;
  - tests e2e dans le style existant, avec un **port libre** ;
  - compatibilité avec la version précédente de l'appli et de l'API (README « À chaque déploiement ») ;
  - tutoiement dans l'appli ;
  - nouvelle règle Firestore autorisée pour la progression des événements (voir § 2) ; le propriétaire republie `firestore.rules`.
- Commits fréquents (la session peut s'interrompre). Messages de commit en français.

## Ce qu'on construit

### 1. Moteur d'événements générique (réutilisable pour Noël, Nouvel an, Pâques, anniversaire de Magic le 5 août…)

- **Un « pack » par événement** :
  - id, dates (calcul de Pâques compris), palette, fond, animations ;
  - SVG des objets à trouver et des badges, police de l'événement ;
  - nombre d'objets et quota par jour, cachettes, textes, messages Discord.
  - Ajouter une fête = ajouter un pack, sans toucher au moteur.
- **Calendrier côté serveur** (`/__ping` ou une route dédiée) : l'appli sait quel événement est actif.
  - Variables d'environnement `EVENT=0` (coupe tout) et `EVENT_FORCE=<id>` (tests, essai sur `/test`).
  - Un interrupteur dans `/admin` pour couper un événement à chaud, plus les statistiques de l'événement : chasseurs, objets trouvés par jour, nombre de chasseurs à 30/30.
- **Halloween 2026** : du **25 octobre au 8 novembre 2026** (15 jours, Halloween au milieu). Pour les fêtes suivantes, recalcule la durée et le quota selon la même règle : il faut **au moins 6 jours de jeu** pour tout trouver, sur une période d'environ 2 semaines.

### 2. La chasse aux citrouilles

- **30 citrouilles au total, 5 par jour** au maximum. Le jour suit l'heure de Paris et bascule à minuit, comme la Carte mystère.
- **Cachettes** :
  - un catalogue d'une quarantaine d'endroits répartis dans l'appli : accueil, collection et ses onglets, Stats, fiche carte, page d'extension, classeur de l'échange, decks, viewer, éditeur, compte et réglages, aide, Carte mystère…
  - **jamais** sur le scan, l'échange en direct, le compteur de vie, une saisie de paiement ou de token, ni pendant le premier lancement, la visite guidée ou le mode streamer.
  - **Placement du jour** : 5 cachettes tirées par jour et par joueur, de façon déterministe (graine = compte ou appareil + jour), pour que chacun ait les siennes.
- **Rendu** :
  - une citrouille SVG **en couleur**, petite mais trouvable, avec une légère animation (flottement, lueur de bougie qui vacille) ;
  - elle ne recouvre jamais un bouton, et a un libellé pour les lecteurs d'écran ;
  - « réduire les animations » coupe le mouvement, pas la citrouille.
- **Au toucher**, une animation forte :
  - la citrouille **vole jusqu'au milieu de l'écran** (FLIP, agrandissement, lueur, éclats ou étincelles) ;
  - puis elle **rejoint le compteur global** « 🎃 12 / 30 », qui s'incrémente avec un petit rebond ;
  - un message élégant : « Bien vu ! Il te reste **3 citrouilles** à trouver aujourd'hui » ; à la 5e : « Tu as trouvé toutes les citrouilles du jour, reviens demain » ; à la 30e : une célébration plein écran.
  - retour haptique (`haptic`) et son ? Pas de son par défaut.
- **Progression et anti-triche** : comme la Carte mystère (`daily-srv.mjs`).
  - Le serveur fournit les 5 cachettes du jour signées (HMAC).
  - L'appli réclame une citrouille avec son jeton ; le serveur refuse au-delà de 5 par jour, ou avec un jeton invalide ou d'un autre jour.
  - **Avec un compte** : la progression est **sauvegardée dans Firebase (Firestore)**, synchronisée entre appareils, et validée par le serveur (classement possible).
    - Document `users/{uid}/meta/events`, ou un champ dédié du document de progression : `{ <id événement>: { n, jours: { 'AAAA-MM-JJ': [cachettes trouvées] }, badges } }`.
    - Compteurs qui ne baissent jamais, fusion « le plus grand gagne », comme `progress.js`.
    - Le propriétaire accepte de **modifier `firestore.rules`** : ajoute la règle avec un schéma strict (champs et tailles bornés), son test dans `tests/rules-test.mjs`, et dis-lui de republier les règles **avant** la mise en production.
    - Pense au sommaire du compte (`cloud.js` › `makeSum`, README « Synchro et quota Firestore »), pour ne pas multiplier les lectures facturées.
  - **Sans compte** : progression sur l'appareil, et l'invitation « crée un compte pour garder tes citrouilles » ; la progression se rattache au compte à la connexion, si c'est sûr.
- **Petit classement des chasseurs** (pseudo public de la Carte mystère, jamais le nom Google) : facultatif. Si le temps manque, garde seulement le nombre de chasseurs à 30/30.

### 3. Badges « Événements » (nouvelle catégorie dans `progress.js`)

- **Paliers Halloween 2026** : 1 citrouille, 10, 20, puis **30/30 = grade ultime**. Le grade ultime a une **bordure 100 % personnalisée, animée et très tape-à-l'œil**, propre aux badges d'événement : flammes violettes et orange qui tournent, braises, reflet, ou mieux si tu trouves.
- **Badges collector** : ils restent obtenables seulement pendant l'événement, et restent ensuite dans le profil avec l'année.
- **Générateur automatique** (script Node sans dépendance, dans `tools/` ou à la racine comme `gen-*.mjs`) :
  - un fond SVG fixe par fête ;
  - devant, **l'année stylisée dans la police de l'événement**, convertie en tracés SVG (pas de dépendance à une police web) ;
  - lancé **automatiquement quelques jours avant chaque période** par une GitHub Action planifiée, qui génère et committe les SVG de l'année (ou les publie sur la branche `data`, comme les prix) ;
  - pour 2026, génère-les tout de suite et committe-les ;
  - les SVG sont **en couleur**, cohérents avec le style des badges existants (`badgeart.js`).

### 4. Ambiance Halloween (CSS et animations)

- **Pack CSS** `html[data-event="halloween"]` :
  - palette (orange citrouille, violet nuit, vert poison) par-dessus la roue de mana ;
  - fond teinté : brume qui dérive, quelques chauves-souris qui traversent de temps en temps, toiles d'araignée discrètes dans des coins, lueurs ;
  - uniquement `transform` et `opacity`, peu de particules, en pause hors écran ou appli en arrière-plan ;
  - rien sur le scan, le compteur de vie ni l'échange en direct ;
  - clair **et** sombre.
- **Interrupteur « Décorations de fête »** dans Compte et réglages › Préférences, activé par défaut. Le coupe, la chasse reste accessible.
- **Accueil** : une carte de l'événement (compteur 🎃 12 / 30, citrouilles du jour restantes, jours restants, badges à gagner) et une entrée dans « Niveau et badges ».
- **Message d'arrivée** à la première ouverture pendant l'événement :
  - une courte introduction très soignée : citrouilles qui s'allument, titre « La chasse aux citrouilles est ouverte », 3 lignes de règles, bouton ;
  - une seule fois ;
  - pas pendant le premier lancement, la visite guidée, le mode streamer ou un lien ouvert de l'extérieur ;
  - « réduire les animations » donne une version sans mouvement.
- Pense aussi à : une notification push « La chasse commence » (`push.js` / FCM existants, si l'utilisateur les a acceptées), et une astuce `tour.js` la première fois qu'une citrouille est visible.

### 5. Annonces Discord automatiques (canal `#annonces`)

- Avec le bot existant, état gardé comme `discord-daily.json`, nouvel essai si Discord échoue :
  - **J-3** « La chasse aux citrouilles arrive » ;
  - **J0** « La chasse est ouverte » ;
  - **mi-parcours** « Il reste X jours » ;
  - **J-1** « Dernier jour » ;
  - **fin** : récapitulatif (nombre de chasseurs, combien à 30/30, top pseudos publics si classement).
- Messages FR et EN avec embed et visuel de l'événement ; ping d'un rôle seulement s'il existe ; `allowed_mentions` restreint.
- Canal et activation par variables d'environnement (`DISCORD_EVENTS_CHANNEL`, `DISCORD_EVENTS=0`), documentées dans le README.
- Tests dans le style de `tests/test-discord-daily.mjs`.

### 6. Logos d'appli aux couleurs des événements

- Génère le logo Mana Orbit dans le style de **chaque événement** : Halloween, Noël, Nouvel an, Pâques, anniversaire de Magic.
  - Formats : SVG source plus les PNG des tailles de `tools/make-icons.mjs` (512, 192, adaptative Android, favicon, Discord, réseaux sociaux).
  - Rangement : `docs/evenements/logos/<événement>/` pour les sources ; les tailles utiles dans `pwa/icons/events/`.
- **Pendant l'événement, dans l'appli** : logo de l'en-tête, écran de lancement, favicon du site. Le service worker doit servir les nouveaux fichiers.
- **Icône de l'appli Android** : changer l'icône installée exige une nouvelle APK (`activity-alias` + `PackageManager`). Ce n'est **pas faisable d'ici demain** sans publier une APK. Prépare-le dans `docs/evenements/` (marche à suivre, alias prêts) pour une prochaine APK, sans le livrer maintenant. Même chose pour l'icône de la PWA installée : le navigateur la met à jour tout seul, de façon peu fiable, donc ne pas compter dessus.

## Qualité attendue

- Captures avant/après (393×852 et 360×780 clair/sombre, 1280×800) des moments clés : arrivée, citrouille cachée, envol au centre, message « il te reste X », 5/5 du jour, 30/30, badges et bordure, carte de l'accueil, Préférences. Montre-les au propriétaire **avant** la mise en production.
- Tests :
  - un e2e `tests/event-e2e.mjs` : calendrier, `EVENT_FORCE`, cachettes du jour, quota de 5, jetons refusés, sans compte puis avec compte, réduire les animations, interrupteur, rien sur scan, compteur ni échange en direct, i18n ;
  - un test Node du générateur de badges ;
  - un test des annonces Discord ;
  - lance aussi les tests existants que tu touches (progress, tour, ui, homedesk, discord-*, admin) et `bash tests/run-tests.sh --node`.
- Performance : aucune régression mesurable (`tests/perf-e2e.mjs` sur machine calme). Aucun travail au démarrage hors événement.

## Mise en production (demain au plus tard)

1. Fusionne `main` dans ta branche, puis rebuild, tests, captures validées par le propriétaire.
2. Fais avancer `main` jusqu'à ta branche (ou fusion sans réécrire l'historique de `main`), puis pousse.
3. Liste au propriétaire ce qu'il doit faire :
   - variables d'environnement Hostinger ;
   - redéploiement du serveur (`proxy.mjs` et modules changent) ;
   - règles Firestore à republier si besoin ;
   - rôle Discord à créer si tu en utilises un ;
   - lancer une fois l'Action de génération des badges si elle n'a pas tourné.
4. Pas de nouvelle APK : l'appli Android charge le site.

## Si le temps manque (ordre de priorité)

1. Moteur, pack Halloween, chasse (30 / 5 par jour, envol au centre, messages), badges et bordure du grade ultime.
2. Ambiance CSS, carte de l'accueil, message d'arrivée.
3. Annonces Discord.
4. Générateur annuel automatique (pour 2026 : SVG générés une fois et committés).
5. Logos des autres fêtes, classement, notification push.

Ce qui n'est pas livré demain est listé au propriétaire avec un plan.
