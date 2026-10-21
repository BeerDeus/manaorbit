# Ta voix sur les vidéos de lancement

Un fichier par vidéo, envoyé tel quel (mémo vocal du téléphone en .m4a, ou .mp3, .wav) et nommé par la vidéo (`l2-classeur.m4a`…). Je le nettoie et je le pose, et la vidéo se recale toute seule sur ta voix : sous-titres, écrans, zooms, durée.

## Pour que ça sonne bien
- Pièce calme et « molle » (rideaux, canapé, placard à vêtements) plutôt que cuisine ou salle de bain ; pas de musique ni de télé.
- Téléphone à 15-20 cm, un peu sur le côté de la bouche (pas de souffle sur le micro) ; mode avion pour éviter un appel en plein milieu.
- Une seconde de silence avant de parler et après le dernier mot : je coupe le reste.
- Parle comme à un pote à la table de jeu, pas comme une pub. Plusieurs prises, garde celle qui te plaît.
- Rythme : environ la durée indiquée ; plus long ou plus court, la vidéo s'adapte (évite juste de dépasser de beaucoup).

## Les textes
Le mieux est de les lire tels quels. Si tu changes un mot, dis-le moi : les sous-titres affichent ce texte, et certaines apparitions sont accrochées à un mot (« scanne », « QR code »…).

**l1-lancement** (≈ 15 s)
> Ça fait des mois que je code l'appli que j'aurais voulu avoir en tant que joueur de Magic. Tu scannes tes cartes, tu vois ce qu'elles valent, tu ranges ton classeur, tu échanges tes doublons, et tu joues tes parties de Commander. Elle s'appelle Mana Orbit, elle est gratuite, et elle est enfin sur Google Play.

**l2-classeur** (≈ 9 s)
> Ton classeur Magic, tu sais vraiment combien il vaut ? Scanne tes cartes : Mana Orbit les reconnaît, et te donne leur cote Cardmarket. Et chaque jour, tu vois ce qui monte.

**l4-echange** (≈ 9 s)
> Ton pote te demande ce que t'as en double ? Pas besoin de sortir tout ton classeur. Tu lui montres ton QR code : il le scanne, et il voit ta liste d'échange, toujours à jour.

**l5-decks** (≈ 9 s)
> Tu as peut-être déjà presque tout un deck Commander, sans le savoir. Mana Orbit compare ta collection aux decks les plus joués, et te dit ce qu'il te manque, et combien ça coûte.

**l7-mystere** (≈ 8,5 s)
> Chaque soir à dix-huit heures, une nouvelle carte mystère. Un indice après l'autre, à toi de la deviner avant les autres. Tu la trouves en combien ?

**l8-manabox** (≈ 8,5 s)
> Tu utilises ManaBox ? Exporte ta collection en CSV, importe le fichier dans Mana Orbit, et c'est fait. Tes cartes, tes quantités, tes langues : rien ne se perd.

l3-langues et l6-partie n'ont pas de voix (musique seule) ; si tu veux en mettre une, je t'écris un texte.

## De mon côté (pour mémoire)
`node tools/shorts/ma-voix.mjs <id> <fichier>` (nettoyage, voix Gemini gardée en `voix/<id>.gemini.wav`), `node tools/shorts/ecoute.mjs <id>` (le texte lu correspond-il ?), `node tools/shorts/rendu.mjs <id>`, contrôle des images, puis copie dans `docs/videos/`. Source des textes : `tools/shorts/voix.json`.
