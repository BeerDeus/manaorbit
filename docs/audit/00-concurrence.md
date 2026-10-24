# Étude concurrentielle : applis compagnon Magic face à Mana Orbit

*24 octobre 2026. Référence Mana Orbit : `README.md`, `docs/a-faire.md`, `docs/store/fiche.md` (aucun code lu). Comparatif précédent du propriétaire : https://claude.ai/artifact/9zxjtrAn6nMvZ3E1QgXMwf (repris et élargi ici).*

**Méthode et limites.** Les pages des concurrents n'ont pas pu être ouvertes directement : le proxy de l'environnement refuse apps.apple.com, manabox.app, draftsim.com, etc. Les informations viennent de résultats de recherche web : fiches des stores, sites des éditeurs, comparatifs 2026. Beaucoup de comparatifs sont écrits par des éditeurs concurrents (ScanYourMTG, TurnZero, ManaForge, Scrytics) : leurs notes sont des avis, pas des mesures. « ? » = non vérifié. Les URL sont en fin de document.

---

## 1. Ce que fait déjà Mana Orbit (rappel)

- **Scan OCR sur l'appareil** (ML Kit dans l'APK, Tesseract dans le navigateur) : 11 langues dont japonais, coréen, chinois et russe ; noms imprimés en français d'abord ; édition lue sur la ligne du bas, sinon reconnue à l'illustration ou au symbole d'extension ; scan automatique en continu ; lampe ; fiche « à vérifier » avec la photo ; « Prix rapide » ; scan mobile du téléphone vers le PC ; signalement de scan raté ; **session d'ouverture de boosters** (bilan gain ou perte) et **mode streamer**.
- **Collection** : import CSV (ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens), langue, édition, foil et état par exemplaire, signée, altérée, erreur d'impression, **proxys à part** ; emplacements (classeurs, boîtes, « à vendre ») et rangement en masse ; « À aller chercher » pour un deck ; **masterset** ; stats, valeur jour après jour (courbe, variations à 7 et 30 jours) ; synchro entre appareils fusionnée carte par carte ; fonctionne hors ligne ; export CSV au format Moxfield et en texte.
- **Prix** : tendance Cardmarket (relevé quotidien) ; **panier CardTrader optimisé, port compris** (avec un token), foil et langue par ligne, éditions exactes ; historique de prix par deck ; **alertes de baisse** (push ou MP Discord) sur les cartes qui manquent aux decks ou suivies à la main.
- **Decks** : builder Standard et Commander (règles de copies, identité de couleur), scan vers un deck, viewer (courbe, tri mana, prix, écart à la référence), main de départ avec **probabilités de terrains (hypergéométrique)**, decks montés qui réservent les cartes, **decks EDHREC « à monter » classés selon la collection** (« 62/99 possédées, 37 à acheter, ≈ 84 € »), tier, **bracket estimé (Game Changers)**, thèmes, decks Archidekt et decks de la communauté, import de liens EDHREC et Archidekt, partage de deck.
- **Échange** : liste d'échange calculée seule (doublons moins les cartes des decks), « Je recherche » (manquantes des decks et liste de souhaits), **lien public ou QR lisible sans appli ni compte**, vue **classeur**, « Pour toi » (correspondances des deux côtés), amis, **échange en direct face à face** avec balance, puis mise à jour des deux collections, widget QR.
- **Compteur de vie** : Commander, Standard, Libre ; 2 à 8 joueurs ; 3 dispositions ; blessures de commandant (partenaires compris), poison, impôt, énergie, expérience, monarque, initiative ; élimination proposée ; annulation ; premier joueur au hasard ; illustration du commandant en fond ; **les autres téléphones rejoignent la table par QR** ; table en direct ; **sans réseau grâce aux QR joueurs** ; grande table sur deux téléphones ; QR du résultat ; « Mes parties » et statistiques (par format, « Commandants à ta table »).
- **Social et rétention** : Carte mystère quotidienne avec classements, niveau 1 à 999 et 78 badges, bot Discord (`/moi`, `/partie`, rôles, spoilers, alertes en MP), decks publics avec modération, widgets Android, raccourcis, partage vers l'appli.
- **Modèle** : gratuit et sans plafond, un bandeau AdMob (jamais pendant le scan ni les parties), compte facultatif, interface en 6 langues, Android + PWA (pas d'appli iOS native).

---

## 2. Fiches par concurrent

### ManaBox (iOS, Android) : le leader « scanner et collection »
- **Fonctions phares** : scanner intégré ; classeurs et listes triés ; deck builder avec stats, simulateur (« deck tester ») et dossiers ; liens de deck lisibles dans n'importe quel navigateur ; outil d'échange avec choix de l'impression ; prix TCGplayer, Card Kingdom, Star City Games et Cardmarket ; filtres de légalité, graphiques de deck ; export des proxys et des cartes signées (v4.2.1, sept.-oct. 2026) ; synchro « Data Sync » (PRO).
- **UX** : référence de l'ajout rapide (« façon ManaBox », dont Mana Orbit s'inspire déjà) ; le scanner est le point le plus critiqué (fond clair conseillé, foils et illustrations sombres difficiles, ralentissements récents) ; note de 4,3/5 sur environ 10 800 avis.
- **Pas de compteur de vie** (des utilisateurs le réclament).
- **Modèle** : gratuit avec pub ; PRO à 2,49 $/mois ou 22,99 $/an (prix US, peut-être daté) ; 5 decks au plus en gratuit.

### Mythic Tools (iOS, Android, web) : le leader « à la table »
- **Fonctions phares** : compteur de vie de 2 à 8 joueurs (blessures de commandant, poison, énergie, mana flottant, compteur de tempête, monarque à glisser, Planechase et Archenemy selon Draftsim), BO3 et pendule d'échecs ; **groupes de jeu** (amis, decks partagés, chat, classements avec taux de victoire), statistiques par deck et par confrontation ; scanner (toutes langues, prix TCGplayer et Cardmarket, texte Oracle et rulings) ; collection (cartes utilisées dans les decks) ; deck builder avec légalité ; intégration EDHREC.
- **UX** : numéro 1 du classement des compteurs de Draftsim en 2026 (icônes claires, liens vers les règles, personnalisation des fonds, polices et animations).
- **Modèle** : cœur gratuit avec un compte ; **Mythic+** à 9,99 $ et 89,99 $ (probablement mois et an) : notation des decks (« Smart Deck », un seul deck noté en gratuit) et recommandations de cartes.

### Moxfield (web) : la référence du deck building
- **Fonctions phares** : builder et vue du deck sur le même écran, **tous les formats** (Standard à Duel Commander), mainboard, sideboard et maybeboard, regroupement par type, couleur, coût, rareté ou **tags personnalisés**, « packages » de cartes réutilisables ; import de fichiers, d'URL (Archidekt, TappedOut) ou de texte ; légalité en temps réel ; prix TCGplayer, Cardmarket et Cardhoarder ; bouton d'achat vers Mana Pool ; playtest (pioche, main, statistique des terrains ; **sans mulligan** selon Draftsim) ; « Get Proxies » (vue imprimable) ; collection riche (impression, finition, état, langue, **prix d'achat**, papier, Arena ou MTGO, classeurs, contrôle « possédée dans cette impression ou dans une autre »).
- **UX** : jugé le builder le plus propre (Draftsim), recherche puissante, raccourcis clavier. Pas de scanner, **pas d'API publique** (Mana Orbit ne peut pas lire ses liens).
- **Modèle** : gratuit, soutien optionnel.

### Archidekt (web) : deck building visuel
- **Fonctions phares** : piles visuelles « comme sur une table », vues texte et tableur, catégories, 16 tris ; **statistiques** (courbe déclinée par couleur, catégorie et type ; **table de probabilités de pioche** par carte, catégorie ou type) ; sandbox et comparaison de decks ; playtester avec jetons et journal ; collection (« construire avec ce que je possède ») ; intégration EDHREC et Commander Spellbook (combos) ; prix TCGplayer, Card Kingdom, Cardmarket et Cardhoarder ; concours mensuel de construction.
- **Modèle** : gratuit avec pub ; Patreon (environ 4 600 membres payants) pour retirer la pub.

### Dragon Shield MTG Card Manager (iOS, Android, web)
- **Fonctions phares** : scan de toutes les langues, **traduction en réalité augmentée** (iOS) ; prix TCGplayer, Cardmarket, Card Kingdom et MTGMintCard, **historique de prix sur 30 jours par carte**, plus fortes hausses et baisses ; dossiers ; outil d'échange (écart de valeur), rapprochement des listes de souhaits et d'échange avec les amis ; voir la collection, les decks et les listes de ses amis ; deck builder (réserve, ajout depuis la collection, courbe, couleurs) ; texte Oracle, légalité, rulings ; export CSV et texte ; partenariat EDHREC.
- **Modèle** : gratuit avec achats intégrés (plafond de 100 cartes signalé par le comparatif précédent).

### Delver Lens (Android) : le scanner rapide
- **Fonctions phares** : scanner rapide (cartes, jetons, emblèmes, d'Alpha à aujourd'hui) ; prix TCGplayer et Cardmarket ; **achat et vente vers Card Kingdom** ; export vers Deckbox, Archidekt, TappedOut… ; recherche avancée dans la collection ; **texte Oracle hors ligne** ; decks.
- **UX** : réputé plus précis que ManaBox (ScanYourMTG) ; développé par une seule personne.
- **Modèle** : gratuit ; export plafonné à 100 cartes (comparatif précédent).

### TCGplayer (iOS, Android) : scanner de la place de marché américaine
- **Fonctions phares** : scan multi-jeux (Magic, Pokémon, Yu-Gi-Oh!, Lorcana…) ; « Market Price » tiré des ventes réelles ; suivi de la valeur de la collection et de ce qui manque ; achat et vente sur TCGplayer.
- **UX** : avis mitigés (foils mal lus, bugs de collection).
- **Modèle** : gratuit, financé par la place de marché ; prix en USD seulement.

### Deckbox (web, Android) : le pionnier de l'échange
- **Fonctions phares** : inventaire, liste d'échange et liste de souhaits par jeu ; **rapprochement automatique** des listes de souhaits et d'échange **entre tous les utilisateurs**, valeurs données et reçues ; place de marché (vendeurs qui ont ta liste de souhaits) ; **système de retours** sur les échangeurs.
- **UX** : daté ; rapprochement trop strict (le foil doit correspondre).
- **Modèle** : gratuit et sans plafond ; Premium à 5,99 $/mois (non confirmé).

### Collectr (iOS, Android, web) : le « portefeuille » de collectionneur
- **Fonctions phares** : valeur des cartes nues, **gradées et scellées**, gains et pertes, tendances du marché ; scan de **pages de classeur (9 cartes à la fois)** ; historique de prix (plus de 5 ans en PRO).
- **Modèle** : PRO à 7,99 $/mois ou 59,99 $/an (scans illimités, exports, historique, filtres).

### Compteurs de vie spécialisés
- **Lifetap** (iOS, Android, gratuit, sans pub selon l'éditeur) : 1 à 6 joueurs ; blessures de commandant par source (partenaires compris) ; poison, trésors, expérience, impôt, monarque, initiative, énergie, **jour/nuit, bénédiction de la cité** ; **Planechase et Archenemy complets** ; mini-jeu Bounty ; **menu de dés, pile ou face, tirage d'un joueur** ; **historique tour par tour**, exports CSV et JSON (janvier 2026) ; plus de 30 000 illustrations de fond.
- **Lotus** : **jusqu'à 10 joueurs** ; poison, énergie, expérience, tempête, charge, impôt, **compteurs personnalisés** ; dés D4 à D20, pièce, **chrono de partie** ; recherche de cartes (prix, légalité) ; Planechase et Archenemy ; abonnement ou achat unique.
- **Life Counter Magic** (iOS) : compteurs de 2026 (Vitesse, Anneau, Tempête, Donjon), pastilles d'état pour l'initiative, le monarque et le jour/nuit, préréglages de format.
- **« Counter »** (Android) : menu dés et pièce, **chrono par tour et pour la partie**.
- **Lifelinker** : vie seulement, roulette pour le premier joueur (11e chez Draftsim).
- **TurnZero HQ** (2026) : glisser pour infliger des dégâts, blessures de commandant par attaquant, mana flottant, compteurs personnalisés ; **MMR par deck** dans le groupe ; **soirée à plusieurs tables** (pods simultanés, un classement commun, invités sans compte via un code) ; jusqu'à 6 joueurs par partie.

### Magic: The Gathering Companion (Wizards, officiel)
- Rejoindre un événement en boutique (code ou QR, EventLink), appariements, résultats et classements sur le téléphone, notifications de ronde, **tournois à la maison** jusqu'à 8 joueurs (Constructed, Sealed, Draft ; BO1 ou BO3 ; Troll à deux têtes), boutique favorite et ses événements, historique des événements, compteur de vie intégré (critiqué : compteurs mal gérés). Compte Wizards exigé. **Seule appli pour les tournois sanctionnés WPN.**

### TopDecked MTG (iOS, Android, web)
- Builder avec légalité (Commander, Oathbreaker, Brawl, Standard, Modern, Legacy, Vintage…), courbe, import et export Arena et MTGO ; **simulateur de champ de bataille à 4 decks** ; compteur jusqu'à 6 joueurs ; listes de possessions et de recherches ; synchro téléphone, tablette et web. Gratuit avec « Power-ups » payants.

### Services spécialisés (souvent utilisés avec une appli compagnon)
- **EDHREC** : recommandations par commandant (synergie), decks moyens, thèmes, budget (moins cher et plus cher), combos, **indice « salt »** (sondage annuel). Gratuit avec pub et Patreon.
- **Scryfall** : recherche avancée (syntaxe complète : couleur, type, texte, légalité, tags d'illustration et de fonction), rulings Oracle et notes, API et exports quotidiens. Gratuit. C'est la source de Mana Orbit.
- **Commander Spellbook** : base de combos, et « salt » des combos.
- **Vérificateurs de bracket** (EDHcheck, BracketCheck, commanderbracket.app…) : Game Changers, combos à deux cartes, destruction de terrains, tours supplémentaires, avec les cartes responsables du bracket.
- **CubeCobra** : gestion de cube open source, draft en ligne (Draftmancer, bots), modes multijoueur, scellé et grid draft, paquets d'exemple, « Records » des drafts réels.
- **17lands** : traqueur Arena, statistiques de limité (GIH WR, ALSA, OH WR, IWD), données publiques par extension.
- **SpellTable** (Wizards) et **Convoke** : Magic papier par webcam, reconnaissance des cartes (Convoke : amis, salons publics, intégration Moxfield).
- **MTGGoldfish** : métagame et listes de tournois (prix papier et MTGO), mouvements de prix ; **Premium** à 5,99 $/mois : alertes illimitées (hausse ou baisse), **prix d'achat et de vente, profit dans le temps**, **SuperBrew** (decks à monter avec sa collection) et « My Price » (prix d'un deck moins les cartes possédées), synchro de la collection Arena.
- **Card Kingdom** : pas d'appli officielle trouvée ; sa buylist est utilisée via Delver Lens et des outils web.
- **Cardmarket** : **pas d'appli mobile officielle** (seulement le site et une extension non officielle). Mana Orbit occupe donc ce vide pour l'Europe.
- **MTG Melee / TopDeck.gg** : inscription par QR, decklists, rondes suisses, résultats saisis par les joueurs, mode hors ligne pour l'organisateur (TopDeck.gg), bot Discord.
- **Règles** : MTG Guide (iOS) et MTG Familiar (Android, open source) : règles complètes, règles de tournoi et IPG, rulings, **hors ligne**.

---

## 3. Matrice comparative

Légende : ✅ oui · 🟡 partiel · ❌ non · ? non vérifié. MO = Mana Orbit, MB = ManaBox, MT = Mythic Tools, Mox = Moxfield, Arc = Archidekt, DS = Dragon Shield, DL = Delver Lens, TCG = TCGplayer, DB = Deckbox, Col = Collectr, LT = Lifetap, Lot = Lotus, WotC = Companion, TD = TopDecked.

### 3.1 Scan et collection

| Fonction | MO | MB | MT | Mox | Arc | DS | DL | TCG | DB | Col |
|---|---|---|---|---|---|---|---|---|---|---|
| Scanner photo | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Scan automatique en continu | ✅ | ✅ | ? | ❌ | ❌ | ? | ✅ | ? | ❌ | ? |
| Plusieurs cartes par photo (page de classeur) | ❌ | ? | ? | ❌ | ❌ | ? | ? | ? | ❌ | ✅ |
| Cartes non anglaises (noms imprimés) | ✅ 11 langues, CJK sur l'appareil | ? | ✅ | ❌ | ❌ | ✅ | ? | ? | ❌ | 🟡 |
| Édition exacte (ligne du bas, illustration) | ✅ | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | ✅ | ❌ | ✅ |
| Traduction en réalité augmentée | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ iOS | ❌ | ❌ | ❌ | ❌ |
| Session d'ouverture de boosters (gain ou perte) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Scan au téléphone vers le PC | ✅ | ? | ? | ❌ | ❌ | ? | ? | ? | ❌ | ? |
| Emplacements, classeurs, dossiers | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ? | ? | 🟡 | ✅ |
| Langue, foil, état par exemplaire | ✅ | ✅ | ? | ✅ | ? | ? | ? | ? | ✅ | ✅ |
| Prix d'achat et plus-value | ❌ | ? | ? | ✅ | ? | ? | ? | ❌ | ? | ✅ |
| Proxys suivis à part | ✅ | ✅ | ? | ? | ? | ? | ? | ❌ | ❌ | ❌ |
| Masterset (progression par extension) | ✅ | ? | ? | ❌ | ❌ | ? | ? | 🟡 | ❌ | 🟡 |
| Cartes gradées et produits scellés | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ✅ |
| Import CSV depuis les autres applis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ? | ✅ | ? |
| Exports vers d'autres formats | 🟡 CSV Moxfield, texte | ✅ | ? | ✅ | ✅ | ✅ | ✅ (plafond) | ? | ✅ | PRO |
| Hors ligne (collection) | ✅ | ? | ? | ❌ | ❌ | ? | ✅ (Oracle) | ? | ❌ | ? |
| Widget de valeur | ✅ Android | ? | ? | ❌ | ❌ | ? | ❌ | ? | ❌ | ? |

### 3.2 Prix

| Fonction | MO | MB | MT | Mox | Arc | DS | DL | TCG | Col | MTGGoldfish |
|---|---|---|---|---|---|---|---|---|---|---|
| Cardmarket (EUR) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ? | 🟡 |
| TCGplayer, Card Kingdom (USD) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Panier le moins cher, port compris | ✅ CardTrader | ❌ | ❌ | 🟡 Mana Pool | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Valeur de la collection dans le temps | ✅ | ? | ? | ? | ? | ? | ? | ✅ | ✅ | ✅ |
| Historique de prix par carte (courbe) | 🟡 variations 7 et 30 j | ? | ? | ? | ? | ✅ 30 j | ? | ? | ✅ 5 ans+ | ✅ |
| Hausses et baisses du marché | 🟡 dans sa collection | ? | ? | ❌ | ❌ | ✅ | ? | ? | ✅ | ✅ |
| Alertes de prix | ✅ baisse | ? | ? | ❌ | ❌ | ? | ❌ | ❌ | ? | ✅ hausse et baisse |
| Vente ou buylist | ❌ | ? | ? | ❌ | ❌ | ❌ | ✅ CK | ✅ | ❌ | ❌ |

### 3.3 Decks

| Fonction | MO | MB | MT | Mox | Arc | DS | TD | EDHREC | MTGGoldfish |
|---|---|---|---|---|---|---|---|---|---|
| Builder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Formats couverts | 🟡 Standard, Commander | ✅ | ✅ | ✅ tous | ✅ | ? | ✅ | Commander | ✅ |
| Contrôle de légalité, bannies | 🟡 copies, identité de couleur | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Courbe de mana et répartitions | ✅ | ✅ | ? | ✅ | ✅ très fin | ✅ | ✅ | ✅ | ✅ |
| Probabilités de pioche | 🟡 terrains en main de départ | ? | ? | 🟡 | ✅ | ? | ? | ❌ | ❌ |
| Playtest (pioche, tours, mulligan) | 🟡 main de départ | ✅ | ? | 🟡 sans mulligan | ✅ | ? | ✅ 4 decks | ❌ | ❌ |
| Tags, catégories, maybeboard | ❌ | ? | ? | ✅ | ✅ | ? | ? | ❌ | ❌ |
| Recommandations de cartes | ❌ | ? | ✅ Mythic+ | ❌ | 🟡 EDHREC | ? | ? | ✅ | ❌ |
| Combos repérés | ❌ | ? | ? | ? | ✅ Spellbook | ❌ | ? | ✅ | ❌ |
| Bracket et Game Changers | 🟡 decks EDHREC seulement | ? | ✅ notation | 🟡 | ? | ❌ | ? | 🟡 | ❌ |
| Decks à monter selon la collection | ✅ classés, coût pour finir | ? | 🟡 | 🟡 | 🟡 | ? | ? | ❌ | ✅ SuperBrew (Premium) |
| Prix du deck sans les cartes possédées | ✅ | ? | ? | 🟡 | 🟡 | ? | ? | ❌ | ✅ Premium |
| Cartes à aller chercher (emplacement) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Impression de proxys | ❌ | 🟡 export | ❌ | 🟡 | 🟡 export | ❌ | ❌ | ❌ | ❌ |
| Export Arena, MTGO | ❌ | ? | ? | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Decks publics, communauté | ✅ | ✅ lien | ✅ groupe | ✅ | ✅ | 🟡 amis | ✅ | ✅ | ✅ |

### 3.4 Échange et social

| Fonction | MO | MB | MT | DS | DB | Mox | TD |
|---|---|---|---|---|---|---|---|
| Liste d'échange calculée seule (doublons moins decks) | ✅ | 🟡 | ? | 🟡 | 🟡 manuelle | ❌ | 🟡 |
| Liste de souhaits | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ✅ |
| Lien ou QR lisible sans appli ni compte | ✅ | 🟡 decks | ? | ❌ | ✅ web | ✅ profil | ? |
| Correspondances entre amis (« Pour toi ») | ✅ | ? | ? | ✅ | ✅ | ❌ | ? |
| Correspondances avec tous les inconnus | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Balance de valeur d'un échange | ✅ | ✅ | ? | ✅ | ✅ | ❌ | ? |
| Échange en direct à deux téléphones, collections mises à jour | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Vue classeur à feuilleter | ✅ | ? | ? | ? | ❌ | ❌ | ❌ |
| Réputation des échangeurs | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Amis | ✅ | ? | ✅ groupes | ✅ | 🟡 | 🟡 | ? |
| Chat de groupe | ❌ (Discord) | ❌ | ✅ | ❌ | 🟡 forum | ❌ | ❌ |
| Jeu quotidien, niveaux, badges | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bot Discord | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 3.5 Compteur de vie et jeu

| Fonction | MO | MT | LT | Lot | TurnZero | WotC | TD |
|---|---|---|---|---|---|---|---|
| Joueurs | 2 à 8 | 2 à 8 | 1 à 6 | jusqu'à 10 | jusqu'à 6 | ✅ | jusqu'à 6 |
| Blessures de commandant (partenaires) | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ✅ |
| Poison, énergie, expérience, impôt | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| Monarque, initiative | ✅ | ✅ | ✅ | ? | 🟡 monarque | ? | ? |
| Jour/nuit, bénédiction de la cité, trésors, tempête, Vitesse, Anneau, Donjon | ❌ | 🟡 tempête | ✅ | 🟡 tempête, charge | ❌ | ❌ | ❌ |
| Mana flottant | ❌ | ✅ | ? | ? | ✅ | ❌ | ❌ |
| Compteurs personnalisés | ❌ | ? | ? | ✅ | ✅ | ❌ | ? |
| Dés, pile ou face | ❌ | ? | ✅ | ✅ | ? | ? | ? |
| Tirage du premier joueur | ✅ | ? | ✅ | ? | ? | ? | ? |
| Chrono (partie, tour, pendule d'échecs) | ❌ | ✅ pendule | ? | ✅ | ? | 🟡 rondes | ? |
| Planechase, Archenemy | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Annuler, historique de la partie | ✅ annuler | ? | ✅ tour par tour | ? | ? | ? | ? |
| BO3 en 1 contre 1 | ❌ (prévu) | ✅ | ? | ? | ? | ✅ | ? |
| Autres téléphones à la table | ✅ QR, table en direct | 🟡 groupe | ❌ | ❌ | ✅ code | ✅ événement | ❌ |
| Sans réseau | ✅ QR joueurs | ? | ✅ | ✅ | ? | ❌ | ? |
| Fond illustré | ✅ deck du joueur | ✅ | ✅ 30 000 illustrations | ? | ? | ❌ | ? |
| Stats de parties | 🟡 historique, par format | ✅ | 🟡 historique, export | ❌ | ✅ | 🟡 | ❌ |
| Taux de victoire par deck, MMR | ❌ (prévu) | ✅ | ❌ | ❌ | ✅ MMR | ❌ | ❌ |
| Soirée à plusieurs tables, tournoi | ❌ (idée « mode organisateur ») | ❌ | ❌ | ❌ | ✅ pods | ✅ maison ≤ 8, boutique | ❌ |

### 3.6 Référence, recherche, autres

| Fonction | MO | MB | MT | Mox | Arc | DS | DL | Scryfall | MTG Guide, Familiar |
|---|---|---|---|---|---|---|---|---|---|
| Texte Oracle, rulings | ❌ (images seulement d'après la doc) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ hors ligne | ✅ | ✅ hors ligne |
| Légalité par format sur la fiche d'une carte | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ✅ | ✅ |
| Règles complètes, règles de tournoi | ❌ | ❌ | 🟡 liens | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Recherche avancée (syntaxe, texte, type) | 🟡 nom, couleur, famille, coût | ✅ | ? | ✅ | ✅ | ? | ✅ | ✅ | ✅ |
| Prochaines extensions, spoilers | ✅ | ? | ? | ❌ | ❌ | ? | ? | ✅ | ✅ |
| Draft, limité (notes 17lands, simulateur) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cube | ❌ | ❌ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ |
| Interface en français | ✅ native | ? | ? | ❌ | ❌ | ? | ? | ❌ | ❌ |
| iOS natif | ❌ (PWA) | ✅ | ✅ | web | web | ✅ | ❌ | web | ✅ |
| Gratuit sans plafond | ✅ (pub) | 🟡 5 decks | 🟡 Mythic+ | ✅ | ✅ (pub) | 🟡 | 🟡 export 100 | ✅ | ✅ |

---

## 4. Ce qui manque à Mana Orbit (ou qu'elle fait moins bien)

Classé par valeur pour un joueur, puis par effort. Effort : **F** faible (quelques jours, données déjà disponibles chez Scryfall ou dans l'appli), **M** moyen (une à deux semaines), **É** élevé (plus de deux semaines, natif ou serveur).

### Valeur forte

| # | Manque | Effort | Pourquoi |
|---|---|---|---|
| 1 | **Texte Oracle, rulings et légalité par format dans la carte en grand** | F | Tout le monde l'a (ManaBox, Mythic Tools, Dragon Shield, Delver Lens) et c'est l'usage le plus fréquent à la table (« elle fait quoi, cette carte ? »). Scryfall fournit `oracle_text`, `printed_text` en français, `legalities` et `/rulings`. Delver Lens les garde hors ligne. |
| 2 | **Outils de table manquants : dés, pile ou face, chrono (partie, tour, pendule BO3)** | F | Présents chez Lifetap, Lotus, Counter et Mythic Tools. Sans eux, le joueur garde une deuxième appli ouverte. Le README n'en parle pas (seulement le premier joueur au hasard). |
| 3 | **Compteurs de jeu récents** : jour/nuit, bénédiction de la cité, trésors, tempête, Vitesse, Anneau, Donjon, mana flottant, compteurs personnalisés | F | Lifetap et Life Counter Magic les ont en 2026. Un compteur « personnalisé » libre couvre les mécaniques futures sans mise à jour. |
| 4 | **Taux de victoire par deck, statistiques de groupe** (« playgroup ») | F à M | Point fort de Mythic Tools et de TurnZero (MMR). Mana Orbit a déjà l'historique, les decks et les comptes à la table : il ne manque que l'agrégat. C'est déjà prévu dans `a-faire.md`. C'est ce qui fait revenir chaque semaine. |
| 5 | **Formats de deck au-delà de Standard et Commander** (Modern, Pioneer, Pauper, Legacy, Brawl, Oathbreaker, Duel Commander) **et cartes bannies** | M | Le builder ne connaît que 2 formats ; Moxfield, TopDecked et ManaBox les couvrent tous. `legalities` de Scryfall suffit pour la légalité ; chaque format a ses règles de taille et de copies. Le Pauper et le Duel Commander sont populaires en France. |
| 6 | **Recommandations de cartes pour un deck Commander** (synergie EDHREC, « il te manque un retrait de bibliothèque ») et **combos** (Commander Spellbook) | M | EDHREC, Archidekt, Mythic+ (payant). Mana Orbit lit déjà EDHREC pour les decks moyens : proposer « les cartes de ta collection qui vont dans ce deck » serait unique (gratuit et fondé sur la collection). Les combos complètent le bracket (aujourd'hui sur les seuls Game Changers). |
| 7 | **Bracket estimé pour tous les decks** (Mes decks, decks partagés), avec les cartes responsables | F | Aujourd'hui limité aux decks EDHREC. EDHcheck et BracketCheck nomment les cartes qui placent le deck dans son bracket. C'est la question de chaque soirée Commander depuis 2025. |
| 8 | **Appli iOS native** | É | ManaBox, Mythic Tools, Dragon Shield et Lifetap sont sur iPhone. La PWA iOS n'a ni ML Kit (scan moins bon), ni widgets, ni notifications sans installation. C'est déjà la piste « si l'appli prend sur Android ». |

### Valeur moyenne

| # | Manque | Effort | Pourquoi |
|---|---|---|---|
| 9 | **Historique de prix par carte** (courbe sur 30 jours ou plus) et **hausses et baisses du marché** (pas seulement dans sa collection) | M | Dragon Shield (30 j), Collectr, MTGGoldfish. Mana Orbit garde 7 à 14 jours par carte sur l'appareil. Il faudrait un historique côté serveur, tiré de `prices.tsv` chaque jour. |
| 10 | **Prix d'achat et plus-value par exemplaire** | F à M | Moxfield, Collectr et MTGGoldfish Premium l'ont ; l'idée a été écartée le 15 octobre. La session d'ouverture a déjà un « prix payé » : l'étendre aux achats CardTrader (« J'ai acheté ») serait presque automatique. |
| 11 | **Playtest au-delà de la main de départ** : mulligan de Londres, pioche tour par tour, petit champ de bataille | M | Archidekt, TopDecked, ManaBox et Moxfield (sans mulligan). La main de départ avec probabilités est déjà meilleure que Moxfield ; le mulligan et « tours 2 à 5 » sont la suite naturelle. |
| 12 | **Probabilités de pioche par catégorie** (« au moins 1 rampe au tour 3 ») et **tags, catégories, maybeboard** dans le builder | M | Archidekt et Moxfield. Le moteur hypergéométrique existe déjà. |
| 13 | **Prix en USD (TCGplayer, Card Kingdom)** selon la région | F | La fiche Play est en anglais par défaut et vise l'international : un joueur américain ne lit pas les euros de Cardmarket. Scryfall fournit `usd` et `usd_foil`. Valeur forte hors d'Europe, faible en France. |
| 14 | **Exports** : Arena, MTGO, liste Moxfield ou Archidekt d'un deck, CSV ManaBox ou Deckbox de la collection ; import d'un lien Moxfield (impossible sans API) | F | Tous les builders le font. Un export « copier pour Arena » rend un deck Mana Orbit utilisable partout. |
| 15 | **Vendre ses doublons** : export d'un stock Cardmarket ou CardTrader, valeur nette après frais | M | Delver Lens (Card Kingdom), TCGplayer. Aucune appli ne le fait pour Cardmarket : vrai créneau européen (déjà dans les « idées du comparatif »). Le partenariat CardTrader demandé le prévoit. |
| 16 | **Recherche avancée** (texte de règles, type, sous-type, force, endurance, légalité, syntaxe Scryfall) | M | Pour construire un deck sans connaître le nom des cartes. Aujourd'hui, la recherche se fait par nom, couleur, famille et coût. Un champ « syntaxe Scryfall » serait un raccourci pour les experts. |
| 17 | **Soirée à plusieurs tables, tournois maison** (pods, rondes suisses, BO3, classement commun) | É | TurnZero (pods), Companion (maison, 8 joueurs), TopDeck.gg. Déjà conçu dans `a-faire.md` (mode organisateur). Fort pour les boutiques, moyen pour le joueur seul. |
| 18 | **Impression de proxys** (PDF 3×3 aux bonnes dimensions) | M | Moxfield (« Get Proxies ») et des sites dédiés. Mana Orbit suit déjà les proxys à part. À cadrer avec la Fan Content Policy : rester sur des proxys de test non vendables. |
| 19 | **Rapprochement des échanges au-delà des amis** (joueurs d'une boutique ou d'une ville, sur inscription) et **réputation** | M à É | Deckbox est le seul à le faire. Mana Orbit a les briques (« Pour toi » calculé par le serveur) ; le risque est la confidentialité et la modération (idée « échanges en boutique » du comparatif précédent). |
| 20 | **Scan de plusieurs cartes par photo** (page de classeur de 9 cartes) | É | Collectr. Gain de temps réel pour numériser un classeur existant, mais difficile avec l'OCR actuel (un nom par bande). |

### Valeur faible (ou hors cible)

| # | Manque | Effort | Pourquoi |
|---|---|---|---|
| 21 | Planechase et Archenemy dans le compteur | M | Lifetap, Lotus, Mythic Tools. Variante de niche, mais attendue par les fans de Commander « fun ». |
| 22 | Règles complètes, règles de tournoi et IPG hors ligne | F à M | MTG Guide et Familiar. Utile aux arbitres et aux joueurs de tournoi ; peu demandé par un public casual. |
| 23 | Traduction en réalité augmentée | É | Dragon Shield (iOS seulement). Le scan dans 11 langues et l'image française affichée couvrent déjà l'essentiel. |
| 24 | Cartes gradées et produits scellés | M | Collectr. Public spéculateur, pas joueur. |
| 25 | Draft et limité (notes 17lands, simulateur de draft, scan du pool scellé) | É | Public différent (Arena) ; le scan du pool scellé en avant-première serait le seul cas « papier ». |
| 26 | Cube (liste, paquets, draft) | M à É | CubeCobra domine, c'est gratuit et open source ; mieux vaut importer et exporter vers CubeCobra. |
| 27 | Jeu par webcam | É | SpellTable et Convoke : hors périmètre. |
| 28 | Chat de groupe | M | Mythic Tools ; Mana Orbit renvoie déjà vers Discord. |

### Ce qui est réellement différenciant chez Mana Orbit

1. **Le scan pensé pour l'Europe et l'Asie, entièrement sur l'appareil** : noms imprimés en français d'abord, 11 langues dont CJK et russe avec ML Kit, édition retrouvée à l'illustration ou au symbole, photo jamais envoyée. Les concurrents sont centrés sur l'anglais et souvent critiqués sur les langues et les éditions.
2. **Prix Cardmarket et panier CardTrader optimisé, port compris**, avec éditions exactes, foil et langue par ligne. Aucun concurrent ne le fait, et Cardmarket n'a pas d'appli mobile.
3. **Decks à monter à partir de sa collection** (EDHREC, Archidekt, communauté), classés par cartes possédées et coût pour finir, plus alertes de baisse sur les manquantes. Seul MTGGoldfish SuperBrew s'en approche, en payant, en USD et sur le web.
4. **L'échange de bout en bout** : liste calculée seule, lien ou QR lisible sans appli, « Pour toi », vue classeur, **échange en direct qui met à jour les deux collections**. Personne d'autre ne boucle la transaction.
5. **Le compteur multi-téléphone** : QR de table, table en direct, mode sans réseau par QR joueurs, grande table sur deux téléphones, QR du résultat pour ceux qui n'ont pas l'appli. Les compteurs spécialisés restent sur un seul téléphone.
6. **Collection « physique »** : emplacements, « À aller chercher », decks montés qui réservent les cartes, masterset avec « chercher les manquantes ».
7. **Session d'ouverture et mode streamer**, **Carte mystère et badges**, **bot Discord** : aucun équivalent chez les concurrents.
8. **Gratuit sans plafond**, compte facultatif, interface native dans 6 langues européennes, widgets Android.

---

## 5. Points de comparaison pour les auditeurs

Pour chaque domaine : les concurrents qui servent de référence, et ce qu'il faut mesurer chez Mana Orbit.

### Scan
- **Références** : Delver Lens (vitesse en rafale, réputé le plus précis), Dragon Shield (langues, pochettes, réalité augmentée), Collectr (page de classeur de 9 cartes), ManaBox (flux d'ajout simple, mais fond clair conseillé et foils difficiles), TCGplayer (prix au scan).
- **À évaluer** : nombre de cartes par minute en scan automatique ; taux d'erreur sur les foils, les illustrations sombres, les pochettes et les cartes d'avant 2014 ; nombre de gestes entre « carte reconnue » et « ajoutée » ; clarté de la file « à vérifier » ; correction d'une édition en moins de 3 gestes ; comportement hors ligne (Scrytics : « un scanner qui dépend du réseau échoue en boutique »). Point fort à confirmer : les cartes françaises et CJK, là où les concurrents échouent.

### Collection
- **Références** : Moxfield (richesse par exemplaire : impression, finition, état, langue, prix d'achat, classeurs, contrôle « possédée dans une autre impression »), ManaBox (classeurs et listes, ajout rapide), Collectr (tableau de bord gains et pertes, historique long), Dragon Shield (historique de 30 jours par carte, hausses et baisses).
- **À évaluer** : temps pour trouver une carte et dire où elle est rangée ; lisibilité de la valeur et de sa variation ; import ManaBox sans perte (classeurs devenus emplacements, listes de souhaits laissées de côté) ; export vers les autres sites (aller-retour sans perte) ; découvrabilité du masterset et du rangement (« rien ne s'affiche tant qu'on ne s'en sert pas »).

### Decks
- **Références** : Moxfield (builder et vue sur le même écran, tags, packages, tous les formats), Archidekt (statistiques : courbes déclinées, probabilités de pioche, playtester, combos), EDHREC (recommandations, thèmes, budget), Mythic Tools (notation de deck), vérificateurs de bracket (cartes responsables).
- **À évaluer** : temps pour créer un deck Commander de 100 cartes depuis la collection ; signalement des erreurs de légalité ; profondeur de l'analyse (courbe, couleurs des sources de mana, probabilités) ; main de départ et mulligan ; clarté de « à monter » (possédées, à acheter, coût) face à SuperBrew ; formats manquants ; export Arena ou Moxfield.

### Échange
- **Références** : Deckbox (rapprochement avec tous les utilisateurs, réputation), Dragon Shield (rapprochement avec les amis, balance), ManaBox (outil d'échange avec choix de l'impression).
- **À évaluer** : temps pour montrer sa liste à un inconnu en boutique (QR, luminosité, lecture sans appli) ; justesse de « Pour toi » (foil et édition pris en compte sans être trop stricts, le défaut de Deckbox) ; lisibilité de la balance ; sûreté de l'échange en direct (rien n'est appliqué avant les deux validations ; erreur facile à annuler) ; ce qui se passe si l'autre n'a pas l'appli.

### Compteur de vie
- **Références** : Mythic Tools (numéro 1 de Draftsim 2026 : icônes claires, liens vers les règles, groupes et taux de victoire, BO3, pendule), Lifetap (compteurs complets, Planechase, Archenemy, dés, historique tour par tour, gratuit sans pub), Lotus (10 joueurs, compteurs personnalisés, chrono), TurnZero (glisser pour infliger des dégâts, plusieurs tables, MMR), Companion (événements officiels).
- **À évaluer** : nombre de touchers pour infliger 7 blessures de commandant d'un joueur à un autre ; risque de toucher par erreur (téléphone posé au centre, lecture de chaque côté) ; accès aux dés, à la pièce et au chrono (absents) ; tenue de 6 à 8 joueurs sur un petit écran ; annulation ; reprise après mise en veille ; valeur réelle du multi-téléphone face au simple « un téléphone au centre ».

### Prix
- **Références** : MTGGoldfish (alertes de hausse et de baisse, prix d'achat et profit, mouvements du marché), Dragon Shield (4 sources, 30 jours), Collectr (historique long), Delver Lens et TCGplayer (vente, buylist).
- **À évaluer** : fraîcheur affichée des prix (date, source CM ou CT compréhensible pour un débutant) ; écart entre la tendance Cardmarket et le panier CardTrader réel ; utilité des alertes (bruit, délai jusqu'à 24 h) ; absence de prix USD pour les utilisateurs hors d'Europe ; parcours « liste, panier, achat » face à « Buy with Mana Pool » de Moxfield.

### Social
- **Références** : Mythic Tools (groupes de jeu, chat, classements), TurnZero (soirée à plusieurs tables, invités sans compte), Deckbox (communauté d'échangeurs, réputation), Moxfield et Archidekt (decks publics, concours), Companion (boutique favorite et événements).
- **À évaluer** : ajout d'un ami (aujourd'hui seulement depuis une liste d'échange) ; ce qu'un ami voit et ce qui reste privé ; utilité des decks de la communauté (10 par compte, modération) ; boucle de rétention (Carte mystère, badges, Discord) face aux groupes de Mythic Tools ; risque de dispersion (beaucoup de fonctions sociales, aucune centrale).

---

## 6. Sources

Mana Orbit : `README.md`, `docs/a-faire.md`, `docs/store/fiche.md` ; comparatif précédent https://claude.ai/artifact/9zxjtrAn6nMvZ3E1QgXMwf

- ManaBox : https://apps.apple.com/us/app/manabox-mtg/id1460407674 · https://www.scanyourmtg.com/review/manabox/ · https://www.scanyourmtg.com/compare/manabox-vs-delver-lens/ · https://marlvel.ai/apps/manabox-mtg · https://bsky.app/profile/manabox.app · https://manabox.soft112.com/ · https://www.appbrain.com/app/manabox-mtg/skilldevs.com.manabox
- Mythic Tools : https://mythic.tools/ · https://apps.apple.com/us/app/mtg-life-counter-mythic-tools/id1669698500 · https://play.google.com/store/apps/details?id=com.studiolaganne.lengendarylens · https://www.scanyourmtg.com/compare/manabox-vs-mythic-tools/ · https://turnzerohq.com/guides/turnzero-vs-mythic-tools
- Moxfield : https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features · https://draftsim.com/best-mtg-deck-builder/ · https://moxfield.nolt.io/895 · https://manapool.com/library/platform/2025/05/30/moxfield-manapool-integration.html · https://draftsim.com/mtg-deck-tester/
- Archidekt : https://archidekt.com/features · https://archidekt.com/news/9287631 · https://archidekt.com/sandbox · https://edhrec.com/articles/how-to-use-archidekt-the-mtg-deckbuilding-site · https://www.patreon.com/archidekt/about · https://archidekt.com/forum/thread/3837770/1
- Comparatifs de collection : https://www.manaarchive.com/guides/mtg-collection-tracker-comparison/ · https://www.scanyourmtg.com/compare/archidekt-vs-moxfield/ · https://manaforge.tools/en/blog/manaforge-vs-moxfield-vs-archidekt · https://turnzerohq.com/guides/best-mtg-collection-tracker-apps · https://scrytics.com/blog/best-mtg-card-scanner-app-2026
- Dragon Shield : https://apps.apple.com/us/app/mtg-scanner-dragon-shield/id1460657155 · https://mtg.dragonshield.com/ · https://magicuntapped.com/index.php/features/mtg-scanner-dragon-shields-free-to-use-smartphone-app-for-magic-the-gathering-players · https://edhrec.com/articles/?p=76048
- Delver Lens : https://play.google.com/store/apps/details?id=delverlab.delverlens · https://chrome-stats.com/d/delverlab.delverlens
- TCGplayer : https://play.google.com/store/apps/details?id=com.tcgplayer.tcgplayer · https://www.tcgplayer.com/content/article/Scan-and-Track-Your-Collection-at-Instant-Speed-with-the-Improved-TCGplayer-App/f209ded2-0eca-4940-aeca-2230cfbbccca/
- Deckbox : https://deckbox.org/ · https://deckbox.org/help/start · https://www.myweeklygrind.com/blog/deckboxorg-trading-guide-for-magic-the-gathering · https://deckbox.org/forum/viewtopic.php?id=26203
- Collectr : https://getcollectr.com/scan · https://app.getcollectr.com/portfolio · https://tcgscanners.com/blog/collectr-vs-tcgplayer/ · https://tcgindex.io/best-card-collection-tracker-apps
- Compteurs : https://draftsim.com/best-mtg-life-counter-app/ · https://getlifetap.com/ · https://apps.apple.com/us/app/lifetap-life-counter-for-mtg/id1508241754 · https://apps.apple.com/us/app/-/id1498057193 (Lotus) · https://apps.apple.com/us/app/life-counter-magic-mtg/id1447990952 · https://play.google.com/store/apps/details?id=com.counter.trigrh · https://turnzerohq.com/ · https://turnzerohq.com/guides/best-commander-life-tracker-apps · https://www.rolldice.games/blog/magic-the-gathering-life-counter-apps-reviewed/
- Wizards Companion : https://magic.wizards.com/en/products/companion-app · https://play.google.com/store/apps/details?id=com.wizards.winter_orb · https://wpn.wizards.com/fr/news/eventlink-better-companion · https://magic-support.wizards.com/hc/en-us/articles/360032291692-Magic-The-Gathering-Companion-App-FAQ
- TopDecked : https://www.topdecked.com/ · https://play.google.com/store/apps/details?id=com.maritlabs.topdecked.mtg
- EDHREC, Commander Spellbook, brackets : https://draftsim.com/how-to-use-edhrec/ · https://edhrec.com/articles/introducing-commander-spellbooks-salt-score · https://edhrec.com/articles/edhrec-just-got-an-upgrade · https://edhcheck.com/ · https://www.bracketcheck.com/ · https://commanderbracket.app/guides/commander-brackets · https://www.tabletopmeta.com/blog/mtg-game-changers-list-commander-brackets
- Scryfall : https://scryfall.com/docs/syntax · https://scryfall.com/docs/api
- CubeCobra : https://cubecobra.com/ · https://alternativeto.net/software/cube-cobra
- 17lands : https://articles.starcitygames.com/2021/03/25/using-17lands-com-as-a-resource-to-improve-at-limited/
- SpellTable, Convoke : https://mtg.wiki/page/SpellTable · https://convoke.games/en/what-is-convoke · https://topdeck.gg/blog/convoke-support-discord-bot-20260404
- MTGGoldfish : https://www.mtggoldfish.com/premium · https://www.mtggoldfish.com/articles/mtggoldfish-arena-companion-app
- Card Kingdom (par des tiers) : https://www.scanyourmtg.com/how-to/scan-and-sell-to-buylist/ · https://mtgbulkcaster.com/tools/card-kingdom
- Cardmarket (pas d'appli officielle) : https://ruyetolsen.nl/project-cardmarket.html · https://enhanced-cardmarket.mave.me/
- Tournois : https://topdeck.gg/features/tournament-operations · https://topdeck.gg/features/player-experience
- Règles : https://apps.apple.com/app/id378754271 (MTG Guide) · https://f-droid.org/de/packages/com.gelakinetic.mtgfam/ (MTG Familiar)
