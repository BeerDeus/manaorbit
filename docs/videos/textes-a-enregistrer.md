# Ta voix sur les vidéos de lancement

Un fichier par vidéo, **brut** (sans effet ni normalisation : je m'en occupe), nommé par la vidéo (`l2-classeur.wav`…). Je le nettoie et je le pose, et la vidéo se recale toute seule sur ta voix : sous-titres, écrans, zooms, durée.

## Sur le PC : Rode PodMic + Scarlett Solo (3e génération), Windows
1. **Pilote** : focusrite.com › Téléchargements › Scarlett Solo 3rd Gen › « Focusrite USB Driver » (la Solo 3e génération n'a pas besoin de Focusrite Control). Si, une fois branchée, la Scarlett apparaît comme une clé USB (« Easy Start ») : garde le bouton **48V** appuyé 5 s, elle redémarre en carte son normale.
2. **Windows** : Paramètres › Son › entrée « Analogue 1 + 2 (Focusrite USB Audio) » › Propriétés : **24 bits, 48 000 Hz**, « Améliorations audio » désactivées.
3. **Branchement** : le PodMic en **XLR** sur l'entrée de gauche (la prise micro, avec 48V et AIR à côté), pas sur la prise jack « INST ».
4. **Boutons de la Scarlett** :
   - **48V éteint** : le PodMic est dynamique, il n'en a pas besoin.
   - **AIR allumé** : le PodMic est un peu sourd, AIR rend la voix plus claire. Compare avec et sans au casque, garde ce qui sonne le plus naturel.
   - **DIRECT MONITOR allumé**, casque branché sur la Scarlett, volume avec le gros bouton MONITOR. Jamais d'enceintes pendant la prise.
5. **Position** : on parle **dans le bout rond** du PodMic (pas sur le côté), à **5-10 cm** de la bouche, micro un peu de biais. Son filtre anti-pop est intégré. Micro sur un pied ou un bras, pas posé sur le bureau où tu tapes (chaque choc s'entend).
6. **Gain** : le PodMic demande beaucoup de gain, la Solo sera presque au maximum, c'est normal. Parle comme pour la vraie prise : cercle vert, orange seulement sur les mots les plus forts, jamais rouge. Si tout au bout le son reste faible, rapproche-toi (5 cm) plutôt que de crier.
7. **Audacity** (gratuit, audacityteam.org) : Paramètres audio › hôte **Windows WASAPI**, enregistrement « Analogue 1 + 2 (Focusrite USB Audio) », **1 canal (mono)**, fréquence du projet **48 000 Hz**. Crêtes vers **-18 à -6 dB** au vumètre : plus bas que -6 n'est pas grave, je remonte le niveau ; ce qui compte, c'est de ne jamais toucher 0.
8. **Test** : 10 s de silence, puis réécoute au casque, volume fort. Un léger souffle au gain maximum est normal (je l'enlève) ; un ronronnement (ventilateur du PC, frigo) : éloigne le micro de la tour, coupe ce qui tourne.
9. **Prises** : chaque texte 2 ou 3 fois d'affilée sur la même piste, une seconde de silence entre les prises. Sélectionne la meilleure, puis Fichier › Exporter l'audio (ou « Exporter la sélection ») : **WAV, PCM 24 bits, mono**, nommé `l2-classeur.wav`…

## Pour que ça sonne bien
- Pièce calme et « molle » (rideaux, canapé, lit, placard à vêtements derrière toi) plutôt qu'un mur nu, une cuisine ou une salle de bain. Pas de musique ni de télé.
- Une seconde de silence avant de parler et après le dernier mot : je coupe le reste.
- Assis droit ou debout, de l'eau à portée (pas de café ni de lait juste avant). Lis chaque texte une fois à voix haute pour te chauffer.
- Parle comme à un pote à la table de jeu, pas comme une pub ; souris en parlant, ça s'entend.
- Rythme : environ la durée indiquée ; plus long ou plus court, la vidéo s'adapte (évite juste de dépasser de beaucoup).
- Sans le PC : un mémo vocal du téléphone marche aussi (.m4a), téléphone à 15-20 cm, mode avion.

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
