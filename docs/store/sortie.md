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

Tout est créé par `tools/discord-setup.mjs` avec un bot à toi (≈ 10 min, dont 5 sur le portail Discord). Un bot pour ton propre serveur ne passe par aucune validation : il marche dès qu'il est invité. Relancé, le script ne crée rien en double et remet les textes à jour.

### Mise en place
1. **Serveur** : Discord › « + » › Créer le mien › Pour moi et mes amis › nom **Mana Orbit** (l'icône est posée par le script).
2. **Bot** : https://discord.com/developers/applications › **New Application** (« Mana Orbit Setup ») ›
   - onglet **Bot** › **Reset Token** › **Copy** : c'est le jeton, garde-le pour toi (jamais dans le dépôt ni dans une conversation) ; décoche **Public Bot** ; aucun « Privileged Gateway Intent » à cocher ;
   - onglet **OAuth2** › **URL Generator** : cocher `bot`, puis la permission **Administrator** ; ouvrir le lien généré, choisir le serveur Mana Orbit, **Autoriser**.
3. **Script** (PowerShell, dans le dossier du dépôt, après `git pull`) :
   ```
   $env:DISCORD_TOKEN = "colle-le-jeton-ici"
   node tools/discord-setup.mjs --dry
   node tools/discord-setup.mjs
   ```
   `--dry` montre ce qui serait fait, sans rien changer. Le vrai lancement affiche le **lien d'invitation permanent** à la fin.
4. **Après** : expulse le bot du serveur (clic droit › Expulser) et, sur le portail, **Reset Token** (l'ancien jeton ne marche plus). Pour relancer plus tard : réinviter le bot (même lien OAuth2) et un nouveau jeton.
5. **À la main** : le rôle **Testeur** aux testeurs qui arrivent (clic droit sur un membre › Rôles).

Si le script dit « mode communauté non activé » : Paramètres du serveur › **Activer la communauté** ; à l'étape des salons, choisir **#règles** pour les règles et **#modération** pour les mises à jour de Discord (pas « Créer pour moi ») ; puis relancer le script (il ajoute #annonces et les forums).

### Ce que fait le script
- **Réglages** : mode communauté ; vérification **moyenne** ; filtre de contenu explicite pour **tous les membres** ; notifications par défaut **@mentions seulement** ; langue française ; icône (`pwa/icons/icon-512.png`) si le serveur n'en a pas.
- **Rôles** : **Équipe** (toi : gérer les messages et les fils, expulser, bannir, exclure temporairement, rendre muet ; jamais administrateur), **Testeur** (couleur à part, affiché à part). @everyone : plus de @everyone / @here.
- **AutoMod** (bloqué + alerte dans #modération, Équipe exemptée) : arnaques (« free nitro », « discord.gift », « airdrop »…), spam, mentions en masse (5 et plus), contenu sexuel et insultes (listes de Discord).
- **Lien d'invitation** permanent (n'expire jamais, sans limite), sur #bienvenue.

### Salons
**BIENVENUE** (lecture seule, sauf Équipe)
- `#bienvenue` : présentation, liens (Play Store, site, guide « Passer de ManaBox »), renvois vers les salons.
- `#règles`
- `#annonces` : salon d'annonces (les autres serveurs peuvent le suivre) : sorties, nouveautés.

**APPLI** (forums : un fil par sujet)
- `#aide` : étiquettes Scan · Collection · Decks · Prix · Compte et synchro · Autre.
- `#bugs` : mêmes étiquettes + Corrigé · Prochaine version (posées par l'équipe) ; consigne : appareil, version (Réglages), étapes, capture.
- `#idées` : Envisagé · Prévu · Fait · Pas pour l'instant (posées par l'équipe).

**COMMUNAUTÉ**
- `#général` (le salon du serveur neuf, déplacé ; mode lent 10 s), `#ouvertures`, `#decks`, `#échanges` (rappel : entre membres, Mana Orbit n'est pas intermédiaire), `#english`, vocal `Commander` (le vocal « Général » renommé).

**ÉQUIPE** (invisible pour les membres)
- `#modération` : alertes AutoMod, messages de Discord pour les modérateurs.

Les textes de #bienvenue et #règles (français puis anglais) sont dans le script (`welcome`, `rulesText`) : les changer là puis relancer.

### Après
- Lien Discord à mettre : message aux testeurs (§ 1), page /testeurs, réseaux (bio), et dans l'appli (Réglages, à ajouter quand le lien existe).
- Possible plus tard : publication automatique de chaque nouvelle version dans `#annonces` (webhook Discord appelé par le serveur).

## 3. Flyers pour les boutiques (A5, fond sombre)

Piste retenue le 20 octobre (unanimité) : « Combien vaut ton classeur ? » (valeur de la collection dans l'orbite foil, les cinq parties : Scan, Échange, Cote, Classeur, Commander). Six déclinaisons, refaites par `node tools/flyer.mjs` (A5 ; `node tools/flyer.mjs solo-d` pour une seule ; `node tools/flyer.mjs a4` pour une affiche A4) :
- `solo-a` : liste à gauche, téléphone à droite ;
- `solo-b` : centrée, les cinq orbes en rangée sous le téléphone ;
- `solo-c` : miroir (téléphone à gauche, liste à droite) ;
- `solo-d` : téléphone géant qui déborde à droite ;
- `solo-e` : titre géant sur trois lignes, parties en pastilles ;
- `solo-f` : une carte foil qui entre dans le téléphone (cadre du scan).
- `solo-a-mana` : la A (retenue le 20 octobre), orbes et puces en **vrais symboles de mana** (Scan blanc, Échange bleu, Cote vert, Classeur noir, Commander rouge) ;
- `solo-a-carte` : la même, avec une silhouette de carte et son coût de mana derrière le téléphone.

**Fichiers** : `docs/print/flyer-a5-<déclinaison>.pdf` (à envoyer à l'imprimeur : texte, dessin et QR en vectoriel) et `.png` (aperçu, imprimable aussi : 300 dpi). En A4 (affiche au mur d'une boutique) : `flyer-a4-<déclinaison>`.

**Format** : A5 avec **fond perdu de 3 mm** (fichier de 154 × 216 mm, coupé à 148 × 210). Ce n'est pas l'A4 réduit : petits textes et QR agrandis pour l'A5 (mentions à 6 pt, QR ≈ 25 mm), textes à 10 mm du bord au moins. Ne pas laisser l'imprimeur réduire le fichier A4 : mentions illisibles, fond perdu trop court.

**Vistaprint** : Flyers › A5 (14,8 × 21 cm) › recto › papier épais (170 g ou plus), **mat** de préférence (pas de reflet sur le QR) › « Importer votre design » › le PDF A5. Vérifier l'aperçu (ligne de coupe, zone de sécurité). Le fond sombre ressort un peu moins foncé qu'à l'écran (conversion en quadrichromie).

**Symboles de mana** (`solo-a-mana`, `solo-a-carte`) : tracés de la police Mana d'Andrew Gioia (`tools/fonts/mana-symbols.mjs`, licence `tools/fonts/OFL-Mana.txt`), symboles © Wizards of the Coast, permis comme contenu de fan (ce ne sont ni le logo ni le symbole des planeswalkers).

**Magic en toutes lettres** : titre « Combien vaut ton classeur Magic ? », pastille « Pour Magic: The Gathering », « Scanne tes cartes Magic… ». Jamais le logo Magic ni le symbole des planeswalkers : la Fan Content Policy de Wizards interdit leurs logos et symboles (le nom du jeu en texte est permis), et un logo ferait croire à une appli officielle.

**QR** : `https://manaorbit.app/flyer`, **ne change jamais** (test `pwa-e2e.mjs`). Le serveur décide où il mène : Android → fiche Google Play (source « flyer » dans Play Console › Statistiques › Acquisition), iPhone et ordinateur → le site. Avant d'en commander 500 : en imprimer un chez soi et le scanner avec un Android et un iPhone.

**En boutique** : demander au gérant avant de déposer ; 20 à 30 près de la caisse ou des tables de jeu ; un exemplaire au tableau d'affichage s'il y en a un.
