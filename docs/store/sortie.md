# Jour de sortie : message aux testeurs, Discord

## 1. Message aux testeurs

**Quand** : une fois la fiche de production en ligne (statut « Disponible sur Google Play », lien public qui s'ouvre sans être testeur).

**Comment l'envoyer à tout le monde** :
- **Groupe Google (le plus simple)** : https://groups.google.com/g/mana-orbit-testeurs › **Nouvelle conversation**, avec le compte propriétaire (les gestionnaires peuvent publier). Chaque membre le reçoit par e-mail, sans voir les adresses des autres. Avant : t'ajouter toi-même avec une 2e adresse pour vérifier la réception (un membre qui a choisi « Pas d'e-mail » ne le reçoit pas).
- **Repli** : /admin › Testeurs › export CSV, puis un seul e-mail en **Cci** (jamais en « À » : les adresses resteraient visibles). Cette liste ne contient que les inscrits de la page /testeurs.
- La Play Console n'a pas d'envoi groupé aux testeurs.

**Règles Google Play** : rien en échange d'un avis (ni bonus, ni concours), ne pas demander une note précise.

**Avis publics** : pendant un test, Google Play ne prend que des retours privés. À vérifier avec ton propre compte testeur le jour J ; si c'est le cas, garder la phrase « quitter le test » ci-dessous, sinon l'enlever.

### Français

**Objet** : Mana Orbit est sur Google Play, merci !

> Salut,
>
> Grâce à toi, Mana Orbit a passé le test fermé : l'appli est maintenant disponible pour tout le monde sur Google Play.
> https://play.google.com/store/apps/details?id=app.manaorbit
>
> - **Rien à faire** : garde l'appli installée, ta collection, tes decks et ton compte restent tels quels.
> - **Un avis aide énormément** une petite appli, qu'il soit bon ou mauvais : ce que tu en penses vraiment. Pendant le test, Google ne publie pas les avis des testeurs : pour en laisser un, quitte le test ici (l'appli et tes données ne bougent pas) : https://play.google.com/apps/testing/app.manaorbit
> - **Un bug, une idée** : Moi › Aide et avis dans l'appli, ou le Discord : [lien Discord]
> - **Partage-la** à ton groupe de jeu si elle te sert : c'est ce qui la fait vivre.
>
> Merci d'avoir été là depuis le début.
>
> Martin, Mana Orbit

### English

**Subject**: Mana Orbit is on Google Play, thank you!

> Hi,
>
> Thanks to you, Mana Orbit made it through closed testing: the app is now available to everyone on Google Play.
> https://play.google.com/store/apps/details?id=app.manaorbit
>
> - **Nothing to do**: keep the app installed, your collection, decks and account stay as they are.
> - **A review helps a small app a lot**, good or bad: just what you really think. Google doesn't publish testers' reviews during a test: to leave one, leave the test here (the app and your data stay put): https://play.google.com/apps/testing/app.manaorbit
> - **A bug, an idea**: Me › Help and feedback in the app, or on Discord: [Discord link]
> - **Share it** with your playgroup if it's useful to you: that's what keeps it alive.
>
> Thanks for being there from the start.
>
> Martin, Mana Orbit

Un seul envoi avec les deux langues (français d'abord, puis « English below » en tête) : la liste mélange les deux.

## 2. Discord

Tout est créé par `tools/discord-setup.mjs` avec un bot à toi (≈ 10 min, dont 5 sur le portail Discord). Un bot pour ton propre serveur ne passe par aucune validation : il marche dès qu'il est invité. Relancé, le script ne crée rien en double et remet les textes à jour. Un serveur déjà fait par l'ancienne version du script (Bienvenue, Appli, Communauté, Équipe) est repris tel quel : salons renommés et déplacés, messages, étiquettes et membres gardés. Les salons qu'il ne connaît pas (bot de tickets…) ne sont jamais touchés : pas besoin d'un nouveau serveur.

### Mise en place
1. **Serveur** (s'il n'existe pas encore) : Discord › « + » › Créer le mien › Pour moi et mes amis › nom **Mana Orbit** (l'icône est posée par le script).
2. **Bot** : https://discord.com/developers/applications › **New Application** (« Mana Orbit Setup ») ›
   - onglet **Installation** › **Install Link** : **None** (sinon Discord refuse de décocher Public Bot : « Une application privée ne peut pas avoir de lien d'autorisation par défaut ») ; Installation Contexts : **Guild Install** seulement ;
   - onglet **Bot** › décoche **Public Bot** › **Save** ; **Reset Token** › **Copy** : c'est le jeton, garde-le pour toi (jamais dans le dépôt ni dans une conversation) ; aucun « Privileged Gateway Intent » à cocher ;
   - onglet **OAuth2** › **URL Generator** : cocher `bot`, puis la permission **Administrator** ; ouvrir le lien généré, choisir le serveur Mana Orbit, **Autoriser**.
   - Paramètres du serveur › **Rôles** : glisse le rôle du bot (« Mana Orbit Setup ») **tout en haut** de la liste (il ne peut ranger que les rôles placés sous le sien).
3. **Script** (PowerShell, dans le dossier du dépôt, après `git pull`) :
   ```
   $env:DISCORD_TOKEN = "colle-le-jeton-ici"
   node tools/discord-setup.mjs --dry
   node tools/discord-setup.mjs
   ```
   `--dry` montre ce qui serait fait, sans rien changer. Le vrai lancement affiche à la fin le **lien d'invitation permanent**, les **adresses des webhooks GitHub** et la liste **À faire à la main**. Au 1er lancement sur un ancien serveur, Discord peut faire attendre quelques minutes (renommer un salon : 2 fois par 10 min) : laisser tourner.
4. **À la main** (le script le rappelle) :
   - **Écran des règles** : Paramètres › Sécurité (ou Onboarding) › Règles du serveur : coller les 8 lignes anglaises affichées par le script (Discord ne le permet pas aux bots) ;
   - **Guide du serveur** : Paramètres › Onboarding › Guide du serveur : message d'accueil, 3 premières actions (lire #règles, se présenter dans sa langue, partager un deck), ressources (site, Google Play) ;
   - **2FA** pour la modération : Paramètres › Sécurité (propriétaire seulement) ;
   - **Webhooks GitHub** : BeerDeus/manaorbit › Settings › Webhooks › Add webhook, une fois par adresse affichée (Content type `application/json`) : #changelog avec l'événement **Releases**, #bug-triage avec **Issues** ;
   - **Rôles** : Testeur aux testeurs, Admin / Modo / Modo FR / Modo EN / Support à l'équipe (clic droit sur un membre › Rôles) ;
   - **Bot permanent « Mana Orbit »** (celui de `DISCORD_BOT_TOKEN`, pas « Mana Orbit Setup ») : il crée, donne et retire les rôles des comptes liés, il lui faut **Gérer les rôles**. Paramètres du serveur › **Rôles** › **Mana Orbit** › onglet **Permissions** › cocher **Gérer les rôles** › **Enregistrer les modifications** (ou le réinviter avec le lien `https://discord.com/oauth2/authorize?client_id=<Application ID>&scope=bot&permissions=292326460416`, qui garde aussi ce qu'il faut aux fils). Son rôle doit rester **au-dessus** de ✅ Compte lié et des paliers (le script l'y range ; les rôles qu'il crée lui-même arrivent tout en bas) : s'il ne l'est pas, le glisser au-dessus dans la liste des rôles. Le script le rappelle dans « À faire à la main » tant que la permission manque.
5. **Après** : expulse le bot du serveur (clic droit › Expulser ; les webhooks restent) et, sur le portail, **Reset Token** (l'ancien jeton ne marche plus). Pour relancer plus tard : réinviter le bot (même lien OAuth2), le remettre en haut des rôles, nouveau jeton.

### Ce que fait le script
- **Réglages** : mode communauté ; vérification **moyenne** ; filtre de contenu explicite pour **tous les membres** ; notifications par défaut **@mentions seulement** ; arrivées, messages de Discord et alertes dans #modération ; langue française ; icône (`pwa/icons/icon-512.png`) si le serveur n'en a pas.
- **Rôles**, rangés de haut en bas : **👑 Créateur** (toi, affiché en haut, sans droit en plus : le propriétaire les a déjà), **Admin** (administrateur), **Modo** (l'ancien « Équipe » : gérer les messages, fils et pseudos, expulser, bannir, exclure temporairement, rendre muet), **Support** (gérer les messages et les fils : trier les forums), puis les rôles des autres bots (tickets…), **Modo FR**, **Modo EN** (gèrent leur catégorie seulement), **Testeur**, les 10 langues + **🌍 Toutes les langues**, notifications (**📢 Annonces**, **🔮 Carte mystère**, **🎲 LFG**), usage (**🌐 Site**, **📱 Android**, **🔭 Découverte**), formats (Commander, Modern, Pioneer, Standard, Pauper, Legacy, Limited ; mentionnables, comme 🎲 LFG), puis tout en bas les **rôles des comptes liés** (donnés et retirés par le bot permanent « Mana Orbit », `discord-roles.mjs` : **✅ Compte lié**, puis les paliers diamant, or, argent, bronze de trois badges de l'appli : 📅 Assidu / Régulier / Infatigable / Rituel sacré (série de la Carte mystère), 🥇 Top 100 / Élite / Crème de la crème / Panthéon (top 100 du jour), 🔍 Scanner / Scanner chevronné / Maître du scan / Oracle du scan (cartes scannées) ; couleurs bronze, argent, or, diamant ; non mentionnables). Le bot permanent les crée aussi de lui-même s'ils manquent : relancer le script n'est pas nécessaire pour eux. Les rôles des autres bots (dont celui du bot permanent « Mana Orbit ») sont rangés **au-dessus** d'eux. @everyone : plus de @everyone / @here.
- **Accueil (Onboarding)** : 4 questions à l'arrivée. **Langue(s)** obligatoire (choix multiple : donne l'accès aux catégories des langues choisies) ; usage, formats, notifications facultatifs. Salons par défaut : les salons publics. À changer plus tard par chaque membre : « Salons et rôles » en haut de la liste des salons.
- **AutoMod** (bloqué + alerte dans #modération, équipe exemptée) : arnaques (« free nitro », « discord.gift », « airdrop »…), invitations vers d'autres serveurs, spam, mentions en masse (5 et plus, plus 10 min d'exclusion), contenu sexuel et insultes (listes de Discord).
- **Lien d'invitation** permanent (n'expire jamais, sans limite), sur #bienvenue.

### Salons
Catégories au style `『…』` (l’ancien `╔ … ╝` est repris et renommé), salons `emoji・nom`.

- **『BIENVENUE』** (lecture seule, sauf l'équipe) : `👋・bienvenue` (présentation, liens, renvois), `📜・règles` (français, puis anglais), `📢・annonces` et `🆕・changelog` (salons d'annonces, que d'autres serveurs peuvent suivre ; changelog alimenté par GitHub), `❓・faq` (forum, fils ouverts par l'équipe).
- **『SUPPORT』** (forums, toutes langues) : `🆘・aide` (étiquettes Site · PWA · Android + Scan · Collection · Decks · Prix · Compte et synchro · Autre), `🐞・bugs` (les mêmes + Alertes · Échange · Partie · Carte mystère · Amis ; étiquette obligatoire ; Confirmé · Prochaine version · Corrigé · Pas un bug · Doublon posées par l'équipe ; modèle à remplir), `💡・idées` (👍 ; Envisagé · Prévu · Fait · Pas pour l'instant).
- **『COMMUNAUTÉ』** (toutes langues) : `🃏・decks`, `🖼️・collections`, `📦・ouvertures`, `🔮・carte-mystère` (mode lent 10 s, réponses sous spoiler), `🔁・échanges` (entre membres, Mana Orbit n'est pas intermédiaire), `💶・prix-et-marché`, `✨・spoilers`.
- **『JOUER』** : `🎲・lfg`, vocaux `🔊 Table 1` à `3` (5 places), `☕ Chill`.
- **Une catégorie par langue**, visible seulement avec le rôle de la langue (ou « Toutes les langues », et l'équipe) : **🇫🇷 FRANÇAIS** (`💬・général`, `🆘・entraide`, `🔊 Vocal FR`), **🇬🇧 ENGLISH** (`💬・general`, `🆘・help`, `🔊 Voice EN`), puis **DEUTSCH, ESPAÑOL, ITALIANO, PORTUGUÊS, РУССКИЙ, 日本語, 한국어, 中文** : les règles traduites (lecture seule ; le chinois en simplifié et en traditionnel) et une discussion.
- **『BÊTA』** (Testeur et équipe) : `📣・bêta-annonces`, `🧪・bêta-feedback`, `📦・builds-android`.
- **『ÉQUIPE』** (Modo, Support) : `🛡️・modération` (AutoMod, arrivées, messages de Discord), `💬・staff`, `🐞・bug-triage` (issues GitHub), `🚨・alertes-serveur`.

Les textes (accueil, règles et leurs traductions, sujets des salons, questions d'arrivée) sont dans le script (`welcome`, `RULES`, `L10N`, `PLAN`) : les changer là puis relancer. Les traductions des règles sont à faire relire par un membre natif quand il y en a un (le français fait foi, c'est écrit sous chaque traduction).

### Après
- Lien Discord à mettre : message aux testeurs (§ 1), page /testeurs, réseaux (bio), et dans l'appli (Réglages, à ajouter quand le lien existe).
- Possible plus tard : un bot à nous qui publie la Carte mystère du jour et les classements.

## 3. Flyers pour les boutiques (A5, fond sombre)

Piste retenue le 20 octobre (unanimité) : « Combien vaut ton classeur ? » (valeur de la collection dans l'orbite foil, les cinq parties : Scan, Échange, Cote, Classeur, Commander). Six déclinaisons, refaites par `node tools/flyer.mjs` (A5 ; `node tools/flyer.mjs solo-d` pour une seule ; `node tools/flyer.mjs a4` pour une affiche A4) :
- `solo-a` : liste à gauche, téléphone à droite ;
- `solo-b` : centrée, les cinq orbes en rangée sous le téléphone ;
- `solo-c` : miroir (téléphone à gauche, liste à droite) ;
- `solo-d` : téléphone géant qui déborde à droite ;
- `solo-e` : titre géant sur trois lignes, parties en pastilles ;
- `solo-f` : une carte foil qui entre dans le téléphone (cadre du scan).
- `solo-a-mana` : la A (retenue le 20 octobre), orbes et puces en **vrais symboles de mana** (Scan blanc, Échange bleu, Cote vert, Classeur noir, Commander rouge) ;
- `solo-a-bolt` : la même, avec derrière le téléphone une carte « Lightning Bolt » ({R}, éphémère) ;
- `solo-a-dragon` : pareil avec « The Ur-Dragon » ({4}{W}{U}{B}{R}{G} : les cinq couleurs des orbes).
  Nom et coût de vraies cartes en texte (permis). Illustration : la vraie pour Lightning Bolt (`tools/flyer-art/lightning-bolt.jpg`, recadrage « art crop » de Scryfall, Christopher Moeller, crédité dans les mentions) ; dégradé foil pour The Ur-Dragon tant que `the-ur-dragon.jpg` n'est pas déposée.
- **Retenue le 20 octobre : `solo-a-bolt`** (`docs/print/flyer-a5-solo-a-bolt.pdf`).

**Fichiers** (seule la déclinaison retenue est gardée dans `docs/print/`, les autres se refont avec `node tools/flyer.mjs <déclinaison>`) : `docs/print/flyer-a5-solo-a-bolt.pdf` (à envoyer à l'imprimeur) et `.png` (aperçu, imprimable aussi : 300 dpi, déclarés dans le fichier). En A4 (affiche au mur d'une boutique) : `flyer-a4-solo-a-bolt`.

**PDF sans police** : la page y est une image à 600 dpi (deux fois la résolution d'impression). Un PDF avec nos polices variables était refusé par Vistaprint (« polices non incorporées » : Chromium les intègre en Type 3). Vérifier avec `pdffonts docs/print/flyer-a5-solo-a-bolt.pdf` : aucune ligne sous l'en-tête.

**Format** : A5 avec **fond perdu de 3 mm** (fichier de 154 × 216 mm, coupé à 148 × 210). Ce n'est pas l'A4 réduit : petits textes et QR agrandis pour l'A5 (mentions à 6 pt, QR ≈ 25 mm), textes à 10 mm du bord au moins. Ne pas laisser l'imprimeur réduire le fichier A4 : mentions illisibles, fond perdu trop court.

**Vistaprint** : Flyers › A5 (14,8 × 21 cm) › recto › papier épais (170 g ou plus), **mat** de préférence (pas de reflet sur le QR) › « Importer votre design » › le PDF A5. Vérifier l'aperçu (ligne de coupe, zone de sécurité). Le fond sombre ressort un peu moins foncé qu'à l'écran (conversion en quadrichromie).

**Symboles de mana** (`solo-a-mana`, `solo-a-carte`) : tracés de la police Mana d'Andrew Gioia (`tools/fonts/mana-symbols.mjs`, licence `tools/fonts/OFL-Mana.txt`), symboles © Wizards of the Coast, permis comme contenu de fan (ce ne sont ni le logo ni le symbole des planeswalkers).

**Magic en toutes lettres** : titre « Combien vaut ton classeur Magic ? », pastille « Pour Magic: The Gathering », « Scanne tes cartes Magic… ». Jamais le logo Magic ni le symbole des planeswalkers : la Fan Content Policy de Wizards interdit leurs logos et symboles (le nom du jeu en texte est permis), et un logo ferait croire à une appli officielle.

**QR** : `https://manaorbit.app/flyer`, **ne change jamais** (test `pwa-e2e.mjs`). Le serveur décide où il mène : Android → fiche Google Play (source « flyer » dans Play Console › Statistiques › Acquisition), iPhone et ordinateur → le site. Avant d'en commander 500 : en imprimer un chez soi et le scanner avec un Android et un iPhone.

**En boutique** : demander au gérant avant de déposer ; 20 à 30 près de la caisse ou des tables de jeu ; un exemplaire au tableau d'affichage s'il y en a un.

## 4. Cartes de visite (à donner de la main à la main)

Pour les tournois, soirées Commander et discussions en boutique : ça tient dans une poche, un portefeuille ou une deck box.

- **Fichiers** : `docs/print/carte-visite-recto-verso.pdf` (2 pages : recto puis verso), ou `carte-visite-recto.pdf` et `carte-visite-verso.pdf` séparés ; aperçus `.png` (300 dpi). Refaits par `node tools/flyer.mjs carte`.
- **Format** : 85 × 55 mm, **fond perdu de 3 mm** (fichiers de 91 × 61 mm), textes à 4 mm du bord au moins ; PDF sans police (images 600 dpi), comme le flyer. Si Vistaprint demande une autre taille de fond perdu (indiquée sur leur page « Format du document »), changer `CB` dans `tools/flyer.mjs`.
- **Recto** : « Combien vaut ton classeur Magic ? », Lightning Bolt (illustration de Christopher Moeller, texte de règle) dans l'orbite des cinq symboles de mana, manaorbit.app · Gratuit.
- **Verso** : QR fixe (`https://manaorbit.app/flyer`, ≈ 26 mm, comme les flyers), « Scanne pour l'installer », Android / iPhone (à venir) / manaorbit.app, mentions (Fan Content Policy, crédit de l'illustration).
- **Vistaprint** : Cartes de visite › format standard (8,5 × 5,5 cm) › recto verso › papier épais, **mat**.
