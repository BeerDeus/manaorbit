# Demande d'accès à la production : Mana Orbit

Play Console › Tableau de bord › **Demander l'accès à la production** (possible dès que 12 testeurs sont inscrits sans interruption depuis 14 jours : 29 octobre 2026). Google répond en 7 jours au plus.
Réponses préparées le 20 octobre 2026 d'après `docs/a-faire.md` et le README, raccourcies le 29 octobre : **300 caractères au plus par champ** (espaces compris), chaque bloc tient avec ses `[crochets]` remplacés par un nombre court. Remplace les `[crochets]` (chiffres que seul le propriétaire voit) ; le reste est prêt à coller. Le français si la Play Console est en français, l'anglais sinon (les deux disent la même chose).

Où trouver les chiffres :
- Testeurs inscrits : Play Console › Tests › Test fermé › Testeurs.
- Comptes actifs par jour, scans signalés : `https://manaorbit.app/admin`.
- Plantages et ANR : Play Console › Qualité › Android vitals ; rapport de pré-lancement : Tests › Rapport de pré-lancement (version 1.0.14, versionCode 15).
- Retours sur Discord : forums `#🆘・aide` et `#🐞・bugs`, `#🧪・bêta-feedback`.
- Avis reçus : boîte `contact@manaorbit.app` (objet « Mana Orbit · avis ») et fils des avis sur Discord (« Aide et avis » de l'appli, depuis le 22 octobre).

Règles : rien d'inventé (Google compare avec le test réel), des faits datés, aucune promesse de fonction absente.

---

## 1. À propos du test fermé

### Comment avez-vous recruté les testeurs ?

```
Joueurs de Magic: The Gathering de mon entourage et de mon groupe de jeu, puis inscrits via manaorbit.app/testeurs et le groupe Google des testeurs. Aucune agence ni testeur payé. 12 testeurs inscrits sans interruption depuis le [15] octobre 2026.
```

```
Magic: The Gathering players from my circle and local play group, then sign-ups via manaorbit.app/testeurs and the testers' Google Group. No agency or paid testers. 12 testers opted in continuously since October [15], 2026.
```

Boutique, serveurs Discord ou créateurs contactés : à ajouter seulement s'il reste de la place (« et ma boutique » / « and my game store »).

### Le recrutement a-t-il été facile ? (choix)

Réponds franchement : « Difficile » si tu as dû relancer pour atteindre 12, sinon « Ni facile ni difficile ».

### Décrivez l'engagement des testeurs

```
Usage réel avec leurs propres cartes : import ManaBox, scan auto (validé sur 2 400 cartes), scan du téléphone vers l'ordinateur, classeur, échange en direct, amis, boosters, parties de Commander. Peu essayé : cartes russes. [N] à [N] comptes actifs par jour.
```

```
Real use with their own cards: ManaBox import, auto scan (validated on 2,400 cards), phone-to-computer scanning, binder, live trades, friends, boosters, Commander games. Rarely tried: Russian cards. [N] to [N] daily active accounts.
```

### Résumez les retours et comment vous les avez recueillis

```
Via « Aide et avis » (Discord ou e-mail), « Signaler un problème de scan », le Discord des testeurs et de vive voix. Positif : scan auto, import ManaBox, échange. Problèmes : cartes asiatiques mal lues, ancienne collection réapparue, faux nouveaux badges, liste d'amis en retard.
```

```
Via in-app "Help and feedback" (Discord or email), "Report a scan problem", the testers' Discord and in person. Positive: auto scan, ManaBox import, trades. Issues: Asian cards misread, old account's collection reappearing, old badges shown as new, friend list lagging.
```

## 2. À propos de l'appli

### Qui est le public visé ?

```
Joueurs de Magic: The Gathering de 13 ans et plus ayant des cartes physiques : collectionneurs qui suivent la valeur de leurs cartes, joueurs de Commander, joueurs qui échangent entre amis ou en boutique. D'abord l'Europe francophone, puis anglais, allemand, espagnol, italien, portugais.
```

```
Magic: The Gathering players aged 13+ who own physical cards: collectors tracking their collection's value, Commander players, players trading with friends or at their game store. French-speaking Europe first, then English, German, Spanish, Italian and Portuguese.
```

### Comment l'appli apporte-t-elle de la valeur ?

```
Une appli gratuite au lieu de plusieurs outils : scan des cartes en 11 langues sur le téléphone, valeur de la collection au prix Cardmarket, rangement, masterset, decks Commander déjà constructibles, liste d'échange par lien ou QR code, échange face à face. Sans compte, tout marche hors ligne.
```

```
One free app instead of several tools: card scanning in 11 languages on the phone, collection value at Cardmarket prices, storage, master sets, Commander decks the collection can already build, trade list by link or QR code, face-to-face trades. No account needed, works offline.
```

### Combien d'installations la première année ? (choix)

**0 à 10 000** : appli de niche, sans budget publicitaire au lancement. Une estimation honnête ne pénalise pas la demande.

## 3. Prêt pour la production

### Quels changements avez-vous faits d'après le test ?

```
- Cartes chinoises, japonaises, coréennes : lecture ML Kit (1.0.6)
- Collection d'un ancien compte proposée, plus fusionnée d'office
- Badges et liste d'amis corrigés
- Caméra du scan réparée (1.0.9)
- Scans signalés mieux reconnus
- Clignotement et zoom au pincement corrigés (1.0.14)
```

```
- Chinese, Japanese, Korean cards: ML Kit text recognition (1.0.6)
- Old account's collection offered, no longer merged automatically
- Badges and friend list fixed
- Scan camera fixed (1.0.9)
- Reported scans better recognized
- Flicker and pinch zoom fixed (1.0.14)
```

### Comment avez-vous décidé que l'appli était prête ?

```
Test de 14 jours avec 12 testeurs terminé, problèmes corrigés, vérifiés sur de vrais téléphones (1.0.14 via Google Play). [N] % de sessions sans plantage. Plus de 100 tests automatisés par modification. Fiche, données, confidentialité, suppression du compte en place. Sortie suivie de près.
```

```
14-day test with 12 testers complete, issues fixed and verified on real phones (1.0.14 from Google Play). [N]% crash-free sessions. Over 100 automated tests on every change. Store listing, data safety, privacy policy and account deletion in place. Release closely monitored.
```

Taux sans plantage : Android vitals. S'il n'est pas encore affiché, retire la phrase.

---

## Le jour de la production (avec Claude, dans la conversation du lancement)

1. **Avant d'envoyer la demande** : 12 testeurs ou plus toujours inscrits ; garder tout le monde inscrit jusqu'à l'accord.
2. **Fiche** : langue par défaut en-US, textes et notes de version de `docs/store/fiche.md` (§ 0 à 4), nouveaux visuels (§ 9).
3. **À l'accord de Google** :
   - `ADMOB_BANNER_ID` sur Hostinger (AdMob › Applis › Mana Orbit › Blocs d'annonces › « Bannière »), puis redémarrer l'app Node.
   - `PLAY_PUBLIC=1` sur Hostinger (avec `ADMOB_BANNER_ID`, un seul redémarrage) : bouton Google Play de l'accueil sur ordinateur vers la fiche.
   - `RATE_ASK = true` dans `src/help.js` (Claude, push sur `main`) : demande de note (carte de Google Play, APK 1.0.6 et plus). Peut attendre quelques jours de vrais utilisateurs.
   - `APK_LATEST=15` sur Hostinger (1.0.14 ; `proxy.mjs` l'a aussi par défaut depuis le 28 octobre).
   - Production › Créer une version › promouvoir la **1.0.14 (versionCode 15)** du test fermé, notes de version (§ 4 de la fiche), **déploiement à 100 % dès le départ** : pour une première version, un déploiement progressif à 20 % ne laisse installer que 20 % des visiteurs de la fiche (les autres lisent « appli non disponible »), alors que les flyers sont en boutique ; personne n'a encore de version de production à protéger. Le déploiement progressif sert aux mises à jour suivantes.
   - `/admin` › QR codes : « Flyers » et « carte-de-visite » sur « selon le téléphone » (Android → la fiche ; iPhone → le site tant que `APP_STORE_URL` est vide).
4. **Après** : Google Search Console (`manaorbit.app`, page `/passer-de-manabox`), vidéos courtes, prévenir les testeurs (ils peuvent quitter le test), supprimer `.data/testeurs.json` sur le serveur (fin du test).
