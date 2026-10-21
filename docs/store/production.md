# Demande d'accès à la production : Mana Orbit

Play Console › Tableau de bord › **Demander l'accès à la production** (possible dès que 12 testeurs sont inscrits sans interruption depuis 14 jours : vers le 29 octobre 2026). Google répond en 7 jours au plus.
Réponses préparées le 20 octobre 2026 d'après `docs/a-faire.md` et le README. Remplace les `[crochets]` (chiffres que seul le propriétaire voit) ; le reste est prêt à coller. Le français si la Play Console est en français, l'anglais sinon (les deux disent la même chose).

Où trouver les chiffres :
- Testeurs inscrits : Play Console › Tests › Test fermé › Testeurs.
- Comptes actifs par jour, scans signalés : `https://manaorbit.app/admin`.
- Plantages et ANR : Play Console › Qualité › Android vitals ; rapport de pré-lancement : Tests › Rapport de pré-lancement (version 1.0.6).
- Avis reçus : boîte `contact@manaorbit.app` (objet « Mana Orbit · avis »).

Règles : rien d'inventé (Google compare avec le test réel), des faits datés, aucune promesse de fonction absente.

---

## 1. À propos du test fermé

### Comment avez-vous recruté les testeurs ?

```
Des joueurs de Magic: The Gathering de mon entourage et de mon groupe de jeu, puis des joueurs inscrits par la page manaorbit.app/testeurs et le groupe Google des testeurs. [Ajoute s'il y a lieu : boutique, serveurs Discord, créateurs contactés.] Aucune agence ni service de testeurs payant. 12 testeurs inscrits sans interruption depuis le [15] octobre 2026.
```

```
Magic: The Gathering players from my circle and my local play group, then players who signed up on the manaorbit.app/testeurs page and the testers' Google Group. [Add if relevant: game store, Discord servers, creators contacted.] No testing agency or paid tester service. 12 testers opted in continuously since October [15], 2026.
```

### Le recrutement a-t-il été facile ? (choix)

Réponds franchement : « Difficile » si tu as dû relancer pour atteindre 12, sinon « Ni facile ni difficile ».

### Décrivez l'engagement des testeurs

```
Les testeurs se sont servis de l'appli comme en production, avec leurs vraies cartes : import de collections ManaBox, scan automatique (validé sur 2 400 cartes réelles), scan au téléphone vers l'ordinateur, classeur et liste d'échange, échange en direct entre deux téléphones, amis, sessions d'ouverture de boosters, parties de Commander et Carte mystère quotidienne. Peu essayé : le scan de cartes russes. [Comptes actifs par jour pendant le test : N à N.]
```

```
Testers used the app as they would in production, with their real cards: ManaBox collection imports, auto scan (validated on 2,400 real cards), scanning with the phone straight to the computer, binder and trade list, live trades between two phones, friends, booster opening sessions, Commander games and the daily Mystery card. Rarely tried: scanning Russian cards. [Daily active accounts during the test: N to N.]
```

### Résumez les retours et comment vous les avez recueillis

```
Recueillis par le bouton « Envoyer un avis » de l'appli (e-mail prérempli avec la version et l'appareil), par « Signaler un problème de scan » (photo de la carte ratée et ce que l'appli a lu, consultés dans notre panneau d'administration), par messages et de vive voix avec le groupe de jeu. Points positifs : scan automatique fiable (sauf reflet de la lampe sur certaines cartes), scan téléphone vers ordinateur, import ManaBox, classeur, échange en direct. Problèmes signalés : cartes chinoises, japonaises et coréennes mal lues dans l'appli Android ; collection d'un ancien compte réapparue dans un compte neuf sur le même téléphone ; anciens badges annoncés comme nouveaux ; demande d'ami acceptée sans mise à jour immédiate de la liste.
```

```
Collected through the in-app "Send feedback" button (pre-filled email with app version and device), "Report a scan problem" (photo of the failed card and what the app read, reviewed in our admin panel), direct messages and in person with the play group. Positive: reliable auto scan (except lamp glare on some cards), phone-to-computer scanning, ManaBox import, binder, live trades. Issues reported: Chinese, Japanese and Korean cards poorly read in the Android app; an old deleted account's collection reappearing in a new account on the same phone; old badges announced as new; accepting a friend request not refreshing the list right away.
```

## 2. À propos de l'appli

### Qui est le public visé ?

```
Les joueurs de Magic: The Gathering de 13 ans et plus qui possèdent des cartes physiques : collectionneurs qui veulent connaître la valeur de leur collection, joueurs de Commander qui montent des decks avec leurs propres cartes, joueurs qui échangent entre amis ou en boutique. D'abord l'Europe francophone (prix Cardmarket, cartes en français), puis les cinq autres langues de l'appli : anglais, allemand, espagnol, italien, portugais.
```

```
Magic: The Gathering players aged 13 and over who own physical cards: collectors who want to know what their collection is worth, Commander players who build decks from their own cards, players who trade with friends or at their game store. French-speaking Europe first (Cardmarket prices, French cards), then the app's five other languages: English, German, Spanish, Italian, Portuguese.
```

### Comment l'appli apporte-t-elle de la valeur ?

```
Mana Orbit réunit en une appli gratuite ce qui demande d'habitude plusieurs outils : scanner ses cartes dans 11 langues directement sur le téléphone (y compris japonais, coréen, chinois et russe, avec l'édition exacte lue en bas de la carte), suivre la valeur de sa collection au prix Cardmarket jour après jour, savoir où chaque carte est rangée, compléter une extension (masterset), trouver les decks Commander que sa collection permet déjà de monter et ce qu'il manque, partager sa liste d'échange en un lien ou un QR code lisible sans appli, échanger face à face avec mise à jour des deux collections, et tenir les points d'une partie de Commander. Sans compte, tout reste sur le téléphone et marche hors ligne ; aucune donnée n'est vendue.
```

```
Mana Orbit brings together in one free app what usually takes several tools: scanning cards in 11 languages right on the phone (including Japanese, Korean, Chinese and Russian, with the exact printing read at the bottom of the card), tracking the collection's value at Cardmarket prices day after day, knowing where each card is stored, completing a set (master set), finding the Commander decks the collection can already build and what is missing, sharing a trade list by link or QR code that opens without the app, trading face to face with both collections updated, and keeping score in Commander games. Without an account, everything stays on the phone and works offline; no data is ever sold.
```

### Combien d'installations la première année ? (choix)

**0 à 10 000** : appli de niche, sans budget publicitaire au lancement. Une estimation honnête ne pénalise pas la demande.

## 3. Prêt pour la production

### Quels changements avez-vous faits d'après le test ?

```
- Cartes chinoises, japonaises, coréennes et russes dans l'appli Android : les moteurs de lecture de ces langues sont essayés sans réglage (19 octobre), puis la version 1.0.6 ajoute la reconnaissance de texte ML Kit pour le chinois, le japonais et le coréen.
- Collection d'un ancien compte : elle n'est plus fusionnée d'office dans un nouveau compte, elle est mise de côté et proposée (« L'ajouter à ce compte » / « Ne pas l'ajouter »).
- Badges : plus d'anciens badges annoncés comme nouveaux ; badge qui récompensait une note retiré (règles de Google Play).
- Amis : une demande acceptée met la liste à jour tout de suite.
- Scan et rangement : cadre plus petit, rangement en masse, filtre par extension, classeur qui montre l'impression exacte de chaque carte.
- Liens https://manaorbit.app vérifiés (App Links) : un lien d'échange ou un QR code ouvre directement l'appli.
```

```
- Chinese, Japanese, Korean and Russian cards in the Android app: the readers for these languages are now tried with no setting (October 19), then version 1.0.6 adds ML Kit text recognition for Chinese, Japanese and Korean.
- Old account's collection: no longer merged into a new account automatically; it is set aside and offered ("Add it to this account" / "Don't add it").
- Badges: old badges no longer announced as new; a badge that rewarded leaving a rating was removed (Google Play policy).
- Friends: an accepted request refreshes the list right away.
- Scan and storage: smaller scan frame, bulk storage, filter by set, binder showing the exact printing of each card.
- Verified https://manaorbit.app links (App Links): a trade link or QR code opens the app directly.
```

### Comment avez-vous décidé que l'appli était prête ?

```
Les 14 jours de test fermé avec 12 testeurs sont terminés et les problèmes signalés sont corrigés et vérifiés sur de vrais téléphones, avec la version 1.0.6 installée depuis Google Play. [Android vitals : N % de sessions sans plantage, N ANR.] [Rapport de pré-lancement : aucune erreur bloquante.] Chaque modification passe plus de 100 tests automatisés (navigateur, serveur, règles de la base de données) avant d'être publiée. Fiche, sécurité des données, politique de confidentialité, suppression du compte depuis l'appli et le web, classification du contenu [et message de consentement publicitaire pour l'Europe] sont en place. La sortie se fera en déploiement progressif.
```

```
The 14-day closed test with 12 testers is complete and the reported issues are fixed and verified on real phones, with version 1.0.6 installed from Google Play. [Android vitals: N% crash-free sessions, N ANRs.] [Pre-launch report: no blocking issues.] Every change goes through more than 100 automated tests (browser, server, database rules) before release. Store listing, data safety, privacy policy, account deletion from the app and the web, content rating [and the European ad consent message] are in place. The release will use a staged rollout.
```

Le message de consentement AdMob (Europe) n'est cité que s'il est publié (AdMob › Confidentialité et messages) ; sinon retire le crochet.

---

## Le jour de la production (avec Claude, dans la conversation du lancement)

1. **Avant d'envoyer la demande** : 12 testeurs ou plus toujours inscrits ; garder tout le monde inscrit jusqu'à l'accord.
2. **Fiche** : langue par défaut en-US, textes et notes de version de `docs/store/fiche.md` (§ 0 à 4), nouveaux visuels (§ 9).
3. **À l'accord de Google** :
   - `ADMOB_BANNER_ID` sur Hostinger (AdMob › Applis › Mana Orbit › Blocs d'annonces › « Bannière »), puis redémarrer l'app Node.
   - `RATE_ASK = true` dans `src/help.js` : demande de note (carte de Google Play dans la 1.0.6) et bouton Google Play de l'accueil sur ordinateur vers la fiche.
   - `APK_LATEST=10` sur Hostinger (déjà fait si la 1.0.9 est en ligne sur le test fermé).
   - Production › Créer une version › promouvoir la **1.0.9 (versionCode 10)** du test fermé (code natif de la 1.0.6, caméra vérifiée), notes de version (§ 4 de la fiche), **déploiement progressif** 20 % → 50 % → 100 % (quelques jours à chaque palier, Android vitals entre deux).
4. **Après** : Google Search Console (`manaorbit.app`, page `/passer-de-manabox`), vidéos courtes, prévenir les testeurs (ils peuvent quitter le test), supprimer `.data/testeurs.json` sur le serveur (fin du test).
