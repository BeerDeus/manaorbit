# Publication des vidéos de lancement (Instagram Reels, TikTok, YouTube Shorts)

8 vidéos verticales (1080 × 1920, 11 à 17 s), rendues par `node tools/shorts/rendu.mjs <id>` (mode d'emploi : `LISEZMOI.md`). Copie livrée : `docs/videos/` (MP4 + couverture JPEG).
On part de zéro : les anciennes vidéos (série s0, test fermé) sont supprimées, rien n'en est republié.

| Id | Sujet | Durée | Voix |
|---|---|---|---|
| l1-lancement | « Mon appli Magic est sortie » : tout en 15 s | 17,2 s | oui |
| l2-classeur | Combien vaut ton classeur ? (scan → cote Cardmarket → ce qui monte) | 12,4 s | oui |
| l3-langues | Le scan lit tes cartes en 11 langues | 11,8 s | non (musique) |
| l4-echange | Tes doublons en un QR code | 12,4 s | oui |
| l5-decks | Le deck Commander que tu as presque | 12,2 s | oui |
| l6-partie | Le compteur de vie de la table de Commander | 11,4 s | non (musique) |
| l7-mystere | La carte mystère de 18 h | 11,8 s | oui |
| l8-manabox | Passer de ManaBox en 2 minutes | 12,2 s | oui |

## À faire une fois (propriétaire)

- **Instagram** (@manaorbit.app, existant) : nouvelle bio ci-dessous, lien de la bio, et archiver (pas supprimer) les publications du test fermé s'il y en a.
- **TikTok** : créer le compte **@manaorbit** (sinon @manaorbit.app), même photo de profil (logo). Compte **personnel**, pas « Entreprise » : un compte Entreprise n'a que la bibliothèque musicale commerciale, sans les sons tendance qui portent la portée. Limite : le lien cliquable de la bio n'arrive qu'avec un certain nombre d'abonnés (1 000 aujourd'hui selon TikTok) ; d'ici là, écrire `manaorbit.app` en clair dans la bio et dire « Mana Orbit sur Google Play » dans la description.
- **YouTube** : chaîne « Mana Orbit » (identifiant @manaorbit), même logo, bannière facultative (le visuel de fonctionnalité de la fiche Play convient).
- Activer les **notifications de commentaires** sur les trois : répondre dans la première heure compte autant que la vidéo.

## Bios

Instagram (150 caractères au plus) :
```
L'appli des joueurs de Magic 🇫🇷
Scan en 11 langues, cote Cardmarket, decks Commander, échanges.
Gratuite sur Google Play 👇
```
TikTok (80 caractères au plus) :
```
L'appli des joueurs de Magic 🇫🇷 Scan, cote, decks. Gratuite 👇 manaorbit.app
```
YouTube (description de la chaîne) :
```
Mana Orbit, l'appli gratuite des joueurs de Magic: The Gathering : scan de cartes en 11 langues, cote Cardmarket de ta collection, classeur, échanges de doublons par lien ou QR code, decks Commander à monter avec tes cartes, compteur de vie pour tes parties, carte mystère chaque soir à 18 h.
Android : Google Play · iPhone et ordinateur : https://manaorbit.app
Mana Orbit est un contenu de fan non officiel, ni approuvé ni soutenu par Wizards of the Coast.
```
Lien de la bio (les trois) : `https://manaorbit.app` (le site propose Google Play et ouvre l'appli web sur iPhone et ordinateur). Pour savoir quel réseau amène les installations, je peux ajouter des adresses `/insta`, `/tiktok`, `/youtube` qui font comme `/flyer` (Android → Google Play avec la source, le reste → le site).

## Calendrier

J = jour où l'appli est visible par tous sur Google Play (accès production accordé). Même vidéo le même jour sur les trois réseaux. Heure : **18 h 30 en semaine, 11 h le week-end** (après les cours et le travail ; le week-end, avant les parties de l'après-midi).

| Jour | Vidéo | Pourquoi à ce moment |
|---|---|---|
| J | l1-lancement | l'annonce |
| J+1 | l2-classeur | la question que tout le monde se pose |
| J+3 | l4-echange | le plus partageable (on l'envoie à son pote) |
| J+5 | l3-langues | se démarque de la concurrence (japonais, coréen, chinois) |
| J+7 | l5-decks | Commander, le format le plus joué |
| J+9 | l7-mystere | donne une raison de revenir chaque soir (publier vers 17 h 30, avant la carte de 18 h) |
| J+11 | l8-manabox | vise les joueurs déjà équipés d'une autre appli |
| J+13 | l6-partie | le compteur de vie, utile à chaque partie |

Ensuite : 2 à 3 vidéos par semaine. Les meilleures des 8 (vues, partages, abonnés gagnés au bout de 3 jours) disent quoi décliner.

## Son

- **Vidéos avec voix** (l1, l2, l4, l5, l7, l8) : ajouter dans l'appli du réseau un son tendance **instrumental**, volume de la musique à **10-15 %** (la voix doit rester devant), volume du son d'origine à 100 %.
- **Vidéos sans voix** (l3, l6) : son tendance plein volume ; les sous-titres portent le message.
- Jamais de musique ajoutée hors des bibliothèques des réseaux (droits d'auteur : son coupé ou vidéo bloquée). Sur YouTube, la bibliothèque audio de YouTube Studio, ou rien.
- La voix est générée (Gemini) ; Instagram et TikTok demandent parfois d'indiquer un contenu généré par l'IA : cocher l'option « contenu généré par l'IA » si l'appli la propose pour la voix, c'est sans effet sur la portée.

## Publication, réseau par réseau

- **Couverture** : `docs/videos/<id>.jpg` (titre en grand, sans sous-titres). Instagram : « Modifier la couverture » › « Ajouter depuis la pellicule ». TikTok : « Couverture » › image. YouTube Shorts : la couverture se choisit dans la vidéo seulement (choisir l'image de fin, avec le logo).
- **Instagram** : partager aussi dans le fil (option par défaut) ; lieu facultatif ; « Ajouter un sujet » : Magic: The Gathering. Après publication : story « Nouvelle vidéo » avec l'autocollant de lien vers `manaorbit.app`.
- **TikTok** : description courte, 3 à 5 hashtags, épingler en commentaire « Gratuit sur Google Play : cherche Mana Orbit » ; ne pas mettre de lien dans la vidéo (portée réduite).
- **YouTube Shorts** : titre = première ligne de la description (moins de 70 caractères), le reste en description ; catégorie Jeux ; public « pas conçu pour les enfants ».
- Toujours **publier le fichier d'origine** sur chaque réseau (pas une vidéo téléchargée d'un autre réseau avec son filigrane : les deux réseaux la font moins voir).

## Descriptions

Hashtags : Instagram 5 à 8, TikTok 3 à 5, YouTube 2 à 3 (en fin de description). Réserve : `#mtg #magicthegathering #mtgfrance #mtgcommunity #commander #edh #mtgcollection #cardmarket #mtgfr #tcg`.

### l1-lancement · Mon appli Magic est sortie
```
Des mois de code, et elle est enfin là 🎉 Mana Orbit, l'appli que j'aurais voulu avoir en tant que joueur de Magic : tu scannes tes cartes, tu vois leur cote, tu ranges ton classeur, tu échanges tes doublons et tu joues tes parties de Commander.
Gratuite sur Google Play (iPhone et ordi : manaorbit.app). Dis-moi ce que tu en penses 👇
```
Instagram : `#mtg #magicthegathering #mtgfrance #commander #edh #mtgcollection` · TikTok : `#mtg #magicthegathering #mtgfrance #commander` · YouTube : `#mtg #magicthegathering`

### l2-classeur · Combien vaut ton classeur ?
```
Ton classeur Magic, tu sais vraiment combien il vaut ? 👀 Scanne tes cartes, Mana Orbit les reconnaît et te donne leur cote Cardmarket. Et chaque jour, tu vois ce qui monte 📈
Gratuit sur Google Play · Combien vaut le tien ? Réponds en commentaire 👇
```
Instagram : `#mtg #magicthegathering #mtgfrance #mtgcollection #cardmarket #mtgfinance` · TikTok : `#mtg #mtgcollection #cardmarket #mtgfrance` · YouTube : `#mtg #mtgcollection`

### l3-langues · Le scan lit tes cartes en 11 langues
```
Ta carte est en japonais ? Le scan la lit quand même 🇯🇵 Français, anglais, allemand, espagnol, italien, portugais, russe, japonais, coréen, chinois simplifié et traditionnel : 11 langues, sur ton téléphone.
Mana Orbit, gratuit sur Google Play. Quelle est ta carte la plus exotique ? 👇
```
Instagram : `#mtg #magicthegathering #mtgjapanese #mtgcollection #mtgfrance #edh` · TikTok : `#mtg #mtgjapanese #mtgcollection #magicthegathering` · YouTube : `#mtg #magicthegathering`

### l4-echange · Tes doublons en un QR code
```
« T'as quoi en double ? » Plus besoin de sortir tout ton classeur 😅 Tu montres ton QR code, ton pote le scanne, et il voit ta liste d'échange, toujours à jour. Sans installer l'appli.
Mana Orbit, gratuit sur Google Play. Identifie le pote qui te demande toujours tes doublons 👇
```
Instagram : `#mtg #magicthegathering #mtgfrance #mtgtrade #commander #edh` · TikTok : `#mtg #mtgtrade #magicthegathering #mtgfrance` · YouTube : `#mtg #mtgtrade`

### l5-decks · Le deck Commander que tu as presque
```
Tu as peut-être déjà presque tout un deck Commander sans le savoir 🤯 Mana Orbit compare ta collection aux decks les plus joués et te dit ce qu'il te manque, et combien ça coûte.
Gratuit sur Google Play. Ton prochain commandant, c'est qui ? 👇
```
Instagram : `#mtg #commander #edh #magicthegathering #mtgfrance #edhdeck` · TikTok : `#mtg #commander #edh #mtgfrance` · YouTube : `#commander #edh`

### l6-partie · Le compteur de vie de la table
```
Ta prochaine partie de Commander, sur un seul téléphone 📱 Points de vie, blessures de commandant, poison, monarque, initiative, tours… et le premier joueur tiré au hasard 🎲
Mana Orbit, gratuit sur Google Play. Vous êtes combien autour de la table ? 👇
```
Instagram : `#mtg #commander #edh #magicthegathering #mtgfrance #lifecounter` · TikTok : `#mtg #commander #edh #lifecounter` · YouTube : `#commander #edh`

### l7-mystere · La carte mystère de 18 h
```
Chaque soir à 18 h, une nouvelle carte mystère 🔮 Un indice après l'autre, à toi de la deviner avant les autres. Tu la trouves en combien ?
Mana Orbit, gratuit sur Google Play. Ton score de ce soir en commentaire 👇
```
Instagram : `#mtg #magicthegathering #mtgfrance #mtgquiz #commander #edh` · TikTok : `#mtg #mtgquiz #magicthegathering #mtgfrance` · YouTube : `#mtg #mtgquiz`

### l8-manabox · Passer de ManaBox en 2 minutes
```
Tu utilises ManaBox ? Exporte ta collection en CSV, importe le fichier dans Mana Orbit, et c'est fait ✅ Tes cartes, tes quantités, tes langues : rien ne se perd. Marche aussi depuis Moxfield, Delver Lens et Dragon Shield.
Gratuit sur Google Play.
```
Instagram : `#mtg #magicthegathering #mtgcollection #manabox #mtgfrance #edh` · TikTok : `#mtg #mtgcollection #manabox #mtgfrance` · YouTube : `#mtg #mtgcollection`

## Publicité payante (plus tard, petit budget)

- Booster seulement une vidéo qui marche déjà seule (plus de vues et de partages que les autres au bout de 3 jours) : l'argent amplifie, il ne rattrape pas.
- **Propriété intellectuelle** : la politique de contenu de fan de Wizards demande un contenu gratuit et non officiel ; une publicité payée qui montre leurs symboles est une zone grise. Ces vidéos montrent des noms de cartes et des symboles de mana : pour une campagne, faire rendre une variante sans symboles de mana (orbites à points de couleur, comme le flyer classique) et sans l'illustration de Lightning Bolt. Jamais le logo Magic.
- Cible de départ : France, Belgique, Suisse, Canada (Québec), 16-40 ans, intérêts Magic: The Gathering / jeux de cartes à collectionner ; Android seulement tant que l'appli iPhone n'existe pas.
