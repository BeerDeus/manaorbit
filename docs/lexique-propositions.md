# Lexique : propositions (audit U6, 6 novembre 2026)

Rapport : `docs/audit/70-regles-et-ux-6-novembre.md` › U6. Rien n'est codé : choisir une version par famille, puis appliquer (textes, 5 langues, tests).
Règle visée : **un nom par action, une action par nom, le même titre pour le bouton et l'écran qu'il ouvre.** Numéros de ligne : branche du lot G (6 novembre).

## 1. « Modifier » (3 actions)

Inventaire :
- `decks.js:367` « Modifier le deck » : ligne de la feuille ⋯ d'un deck → feuille `decks.js:450` « Modifier le deck » (nom, image, format, tags).
- `viewer.js:615` « Modifier les cartes » : viewer d'un deck enregistré → éditeur de deck (onglets Deck / Ajouter / Coach).
- `viewer.js:821` « Modifier la liste » : pied du viewer en mode prix → retour à l'écran Decks › Prix d'une liste (texte collé).
- Ailleurs, « Modifier » seul, sans ambiguïté (profil, rangement, réglages) : `me.js:48`, `places.js:199`, `pubdecks.js:143`, `troc.js:457`, `deckana.js:193`.

Versions :
- **A** : « Renommer et image… » (feuille du deck) · « Modifier les cartes » · « Modifier la liste ». Le mot « Modifier » reste aux cartes.
- **B** : « Infos du deck » (feuille, titre « Infos du deck ») · « Éditer le deck » (éditeur) · « Revenir à la liste » (Prix d'une liste).
- **C** : « Réglages du deck » · « Cartes du deck » (bouton et titre de l'éditeur) · « Changer la liste ».

Recommandation : **B**. « Éditer » = l'éditeur (le nom de l'écran), « Infos » = ce que la feuille contient, « Revenir à la liste » dit que l'on retourne à un écran déjà vu.

## 2. « Monter » (3 sens)

Inventaire :
- `nav.js:76` onglet « À monter » (Decks) : idées de decks EDHREC classées par ce que ta collection couvre ; `tour.js:117`.
- `decks.js:368` interrupteur « Deck monté » ; `decks.js:191` et `cardsheet.js:228` pastille « monté » ; `extras.js:125` « Deck monté : cartes réservées » ; `places.js:394` « Démonter » : les exemplaires sont réservés à ce deck.
- `decks.js:370`, `viewer.js:615` « … ; monter le deck » (Où trouver mes cartes) ; `deckwiz.js:954` « Tu prévois de le monter » ; `builder.js:668` toast « Deck créé · N cartes réservées de ta collection » : le deck est monté sans qu'on le demande.

Versions :
- **A** : onglet « Idées de decks » ; « Deck monté » garde son sens (cartes réservées) ; « monter le deck » = « réserver ses cartes ». Toast : « Deck créé · Réserver mes N cartes ? » (choix, plus d'effet caché).
- **B** : onglet « À construire » ; « Deck assemblé » (interrupteur, pastille « assemblé ») ; « Assembler le deck ».
- **C** : onglet « À monter » gardé ; « Cartes réservées » (interrupteur et pastille « réservé ») ; plus aucun « monter » ailleurs.

Recommandation : **A**. « Idées de decks » dit ce qu'est l'onglet ; « monté » ne garde qu'un sens, celui que le joueur connaît (deck physique), et le toast cesse de décider pour lui.

## 3. Cartes manquantes (7 noms)

Inventaire :
- `decks.js:369` « Suivre les cartes manquantes » : interrupteur, les manquantes du deck vont dans Échange › Je recherche.
- `edh.js:439` « Ajouter les manquantes à Je recherche » / « Manquantes dans Je recherche » : même chose pour une idée À monter.
- `edh.js:440` « Surveiller leurs prix » ; `cardsheet.js:251` « Suivre le prix » : alertes de prix.
- `edh.js:524` « Chercher les manquantes » ; `viewer.js:739` « Chercher les offres » : recherche d'offres CardTrader.
- `viewer.js:615` « Manquantes · Cardmarket » ; `share.js:384` et `share.js:309`, `app.js:693` « Copier pour Cardmarket » : liste copiée pour une Wants list Cardmarket.
- `viewer.js:615`, `ctwish.js:16` « Envoyer sur CardTrader ».

Versions :
- **A** (verbe + lieu) : « Mettre dans Je recherche » · « Alerte de prix » · « Chercher les offres » · « Copier pour Cardmarket » · « Envoyer sur CardTrader ».
- **B** (nom « à acheter ») : « Ajouter à ma liste d'achat » · « Prévenir si le prix baisse » · « Trouver à acheter » · « Copier ma liste d'achat (Cardmarket) ».
- **C** (le minimum) : garder les noms actuels, mais un seul par action : « Suivre les manquantes » (Je recherche), « Suivre le prix » (alertes), « Chercher les offres », « Copier pour Cardmarket ».

Recommandation : **A**. Chaque bouton dit où vont les cartes (« Je recherche », Cardmarket, CardTrader) ; « Suivre » n'a plus deux sens (liste d'échange et alertes).

## 4. Coach / Analyser

Inventaire :
- `viewer.js:615` « Coach » (viewer) ; `builder.js:248` onglet « Coach » (éditeur) ; `deckana.js:114` titre « Coach ».
- `edh.js:495` « Analyser » (feuille d'une idée À monter) : ouvre le même Coach (`deckana.js`).
- `deckana.js:202`, `deckrep.js:116`, `deckux.js:54`, `deckwiz.js:576` « Rapport du coach ».

Versions :
- **A** : « Coach » partout (À monter compris) ; « Rapport du coach » inchangé.
- **B** : « Analyser » partout (bouton), titre « Analyse du deck » ; onglet de l'éditeur « Conseils ».
- **C** : « Coach » pour l'onglet et le bouton, « Analyse » pour le rapport (« Voir l'analyse »).

Recommandation : **A** (un seul nom, celui que l'appli met déjà en avant).

## 5. Ajouter / Importer / Scanner / ManaBox

Inventaire :
- Ajouter : `collection.js:1276` « Ajouter à la main » (collection vide) ; `collection.js:1407` icône « Ajouter des cartes » et `lot.js:227` titre « Ajouter des cartes » ; `collection.js:1635` feuille « Ajouter une carte » ; `share.js:384`, `troc.js:395` « Ajouter une carte » (souhait, échange en direct) ; « + » d'une suggestion (`lot.js`).
- Importer : `collection.js:1276` / `1408` / `1691` « Importer » ; `collection.js:1679`, `share.js:669` « Importer ma collection » ; `onboard.js:43` « Importer un fichier » ; `tour.js:74` « Importer ta collection » ; `switch.js:49` « Importer mon fichier ».
- Scanner : `collection.js:1276`, `widget.js:170` « Scanner » ; `nav.js:13`, `scan.js:1312`, `lot.js:230`, `builder.js:570` « Scanner des cartes » ; `onboard.js:44` « Scanner mes cartes » ; `tour.js:68` « Scanner tes cartes » ; `deckwiz.js:964` « Scanner le deck ».
- ManaBox : accueil « Je viens de ManaBox » (`body.html`, carte Pour commencer) ; `collection.js:1278` « Tu viens de ManaBox ? Le guide en 2 minutes » ; `onboard.js:41` « Tu viens de ManaBox ? Voir comment l'exporter » ; `switch.js:23` titre « Passer de ManaBox en 2 minutes ».
- Pléonasme : `collection.js:1275` « Pas encore de cartes pour l'instant ».

Versions :
- **A** (verbe + objet, partout) : « Ajouter des cartes » (écran) et « Ajouter une carte » (une seule, à la main) ; « Importer un fichier » ; « Scanner des cartes » (« Scanner le deck » dans un deck) ; « Venir de ManaBox » (bouton et titre du guide).
- **B** (verbe seul, l'icône dit le reste) : « Ajouter », « Importer », « Scanner », « Depuis ManaBox » ; titres d'écran identiques.
- **C** (possessif) : « Ajouter mes cartes », « Importer ma collection », « Scanner mes cartes », « J'ai ManaBox ».

Recommandation : **A** ; vide : « Pas encore de cartes ». Le bouton et l'écran qu'il ouvre portent le même texte (« Ajouter des cartes » → écran « Ajouter des cartes »).
