# Ta voix sur les vidéos de lancement

Un fichier par vidéo, **brut** (sans effet ni normalisation : je m'en occupe), nommé par la vidéo (`l2-classeur.wav`…). Je le nettoie et je le pose, et la vidéo se recale toute seule sur ta voix : sous-titres, écrans, zooms, durée.

## Sur le PC (micro Rode + Scarlett, Windows)
1. **Pilote** : Focusrite Control (Scarlett 3e génération) ou Focusrite Control 2 (4e) sur focusrite.com. Si la Scarlett apparaît comme une clé USB (« Easy Start ») : 3e génération, garder le bouton 48V appuyé 5 s puis la rebrancher ; 4e génération, l'installation de Focusrite Control 2 s'en charge.
2. **Windows** : Paramètres › Son › Focusrite (entrée) › Propriétés : format 24 bits, 48 000 Hz, « Améliorations audio » désactivées. Mêmes réglages pour la sortie casque.
3. **Micro** : entrée 1 de la Scarlett, câble XLR.
   - Condensateur (NT1, NT1-A, NT2-A…) : **48V allumé** ; on parle **sur la face** (logo / point doré face à la bouche) à 15-20 cm, avec un filtre anti-pop.
   - Dynamique (PodMic, Procaster) : **48V éteint** ; on parle **dans le bout** à 5-10 cm ; il faut beaucoup de gain (bouton aux trois quarts, c'est normal).
   - USB (NT-USB, PodMic USB) : branché directement au PC, la Scarlett ne sert pas.
   - Dans tous les cas : micro un peu de biais (15-30°), pas pile face à la bouche : les « p » de « pote », « parties », « Google Play » ne claquent pas.
4. **Casque** branché sur la Scarlett, **Direct Monitor** allumé (bouton en façade en 3e génération, Focusrite Control 2 en 4e) : tu t'entends sans décalage. Jamais d'enceintes pendant la prise.
5. **Gain** : parle comme pour la vraie prise ; le cercle autour du bouton reste vert, orange seulement sur les mots les plus forts, jamais rouge (une saturation ne se répare pas). 4e génération : « Auto Gain » (appui, puis 10 s de parole) fait le réglage. **Air** : à essayer, souvent mieux sur la voix ; garder ce qui sonne le plus naturel au casque.
6. **Audacity** (gratuit, audacityteam.org) : Paramètres audio › hôte **Windows WASAPI**, enregistrement « Focusrite USB » (Analogue 1), **1 canal (mono)**, fréquence du projet **48 000 Hz**. Pendant la prise, les crêtes du vumètre vers **-12 à -6 dB**.
7. **Test** : 10 s de silence, puis réécoute au casque, volume fort. Souffle, ventilateur, frigo, PC ? Éloigne le micro de la tour, coupe ce qui ronronne.
8. **Prises** : chaque texte 2 ou 3 fois d'affilée sur la même piste, une seconde de silence entre les prises. Sélectionne la meilleure, puis Fichier › Exporter l'audio (ou « Exporter la sélection ») : **WAV, PCM 24 bits, mono**.

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
