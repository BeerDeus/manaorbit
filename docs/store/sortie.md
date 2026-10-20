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

Je ne peux pas piloter ton navigateur depuis cette session (conteneur dans le cloud). Deux façons :
- **À la main, ≈ 20 min** avec le plan ci-dessous ;
- **Script** : je peux écrire `tools/discord-setup.mjs` qui crée tout (rôles, salons, permissions, messages) via un bot à toi. Tu crées l'application sur https://discord.com/developers, invites le bot sur le serveur, et lances le script sur ton PC avec le jeton en variable d'environnement (jamais dans le dépôt, jamais dans une conversation).

### Réglages du serveur
- Nom **Mana Orbit**, icône `pwa/icons/icon-512.png`.
- **Activer la communauté** (Paramètres du serveur › Activer la communauté) : salon des règles = `#règles`, salon des mises à jour = `#annonces`.
- Niveau de vérification : **Moyen** ; filtre de contenu explicite : **tous les membres** ; notifications par défaut : **@mentions seulement**.
- **AutoMod** : spam, spam de mentions, mots-clés « nitro », « free », « gift », « airdrop » (liens d'arnaque) → bloquer le message.
- **Intégration** (Accueil / Onboarding) : question « Tu parles ? » Français / English → rôle de langue ; question « Notifications ? » → rôle @Annonces.
- Lien d'invitation **permanent** (n'expire jamais, sans limite), depuis `#bienvenue`.

### Rôles
- **@Équipe** : toi (et un modérateur plus tard) ; gérer les messages, expulser, exclure temporairement.
- **@Testeur** : les testeurs du test fermé (badge de reconnaissance, couleur à part).
- **@Annonces** : ceux qui veulent être prévenus (mentionné à chaque nouvelle version, jamais @everyone).
- **@FR**, **@EN** : langue (affiche ou non `#english`).
- @everyone : pas de @everyone / @here, pas de création de fils dans les salons d'annonces.

### Salons
**BIENVENUE** (lecture seule pour tous sauf @Équipe)
- `#bienvenue` : présentation, liens (Play Store, site, guide « Passer de ManaBox »).
- `#règles`
- `#annonces` : salon d'annonces (les autres serveurs peuvent le suivre) : sorties, nouveautés.

**APPLI**
- `#aide` : salon **forum**, étiquettes Scan · Collection · Decks · Prix · Compte et synchro · Autre.
- `#bugs` : forum, étiquettes Ouvert · Corrigé · Prochaine version ; modèle de message : appareil, version (Réglages), étapes, capture.
- `#idées` : forum, étiquettes Envisagé · Prévu · Fait · Pas pour l'instant.

**COMMUNAUTÉ**
- `#général` (mode lent 10 s)
- `#ouvertures` : photos de boosters et de sessions d'ouverture.
- `#decks` : liens de decks partagés depuis l'appli.
- `#échanges` : listes d'échange (liens de l'appli) ; rappel : échanges entre membres, Mana Orbit n'est pas intermédiaire.
- `#english` (rôle @EN)
- 🔊 `Commander` (vocal)

### Textes

**#bienvenue**
> **Bienvenue sur le Discord de Mana Orbit** 👋
> Mana Orbit : scanne tes cartes Magic, suis la valeur de ta collection, construis et partage tes decks.
> 📲 Google Play : https://play.google.com/store/apps/details?id=app.manaorbit
> 🌐 Site : https://manaorbit.app · 🔁 Tu viens de ManaBox ? https://manaorbit.app/passer-de-manabox
> ❓ Une question → #aide · 🐞 Un bug → #bugs · 💡 Une idée → #idées
> Commence par lire #règles.
>
> **Welcome to the Mana Orbit Discord** · questions → #aide, bugs → #bugs, ideas → #idées, English chat → #english.

**#règles**
> 1. Respect : pas d'insulte, de harcèlement ni de propos discriminatoires.
> 2. Pas de spam ni de pub sans accord de l'équipe.
> 3. Échanges et ventes : à vos risques, entre membres ; Mana Orbit n'est pas intermédiaire. Jamais de paiement « entre proches ».
> 4. Pas de contenu piraté ni de fuite non officielle.
> 5. Un bug : un fil dans #bugs avec ta version (Réglages) et les étapes.
> 6. L'équipe peut supprimer un message ou exclure sans préavis.
> Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy, ni approuvé ni soutenu par Wizards of the Coast.
>
> *English: be respectful, no spam or ads, trades at your own risk between members, no pirated content or leaks, bugs in #bugs with your version. Mods may remove messages or members.*

### Après
- Lien Discord à mettre : message aux testeurs, page /testeurs, réseaux (bio), et dans l'appli (Réglages, à ajouter quand le lien existe).
- Possible plus tard : publication automatique de chaque nouvelle version dans `#annonces` (webhook Discord appelé par le serveur).
