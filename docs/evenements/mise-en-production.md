# Événements : mise en production (Halloween 2026)

Ouverture automatique le **25 octobre 2026 à minuit (heure de Paris)**, fin le **8 novembre à minuit**. Rien à forcer.

## À faire par le propriétaire, dans cet ordre

1. **Règles Firestore** : republier `firestore.rules` (console Firebase › Firestore › Règles) **avant** le déploiement : bloc `docId == 'events'` (copie de la progression des comptes). Sans lui, la progression reste sur l'appareil et le serveur (rien ne casse), mais pas dans le compte.
2. **Variables Hostinger** :
   - `EVENT_SECRET` : **recommandé**, 64 caractères hexadécimaux au hasard (ex. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Sans lui, le secret est tiré une fois et gardé dans `.data/events/.secret` : si le dossier des données est vidé au déploiement, les jetons du jour et les reçus gardés dans les comptes ne seraient plus reconnus.
   - Facultatif : `DISCORD_EVENTS_CHANNEL` (autre salon que `annonces`), `DISCORD_EVENTS=0` (couper les annonces), `EVENT=0` (couper tout l'événement).
   - Ne pas définir `EVENT_FORCE` en production (essais seulement).
   - Notifications push des événements : **rien à ajouter** si `FCM_SERVICE_ACCOUNT` est déjà là (celui de la Carte mystère) ; `EVENT_PUSH=0` pour les couper.
3. **Redéployer le serveur** (fichiers changés ou nouveaux) : `proxy.mjs`, `event-srv.mjs`, `event-push.mjs` (nouveau), `daily-srv.mjs`, `discord-events.mjs`, `discord-srv.mjs`, `src/evpacks.js` (lu par le serveur), `deck-deal.html`, `pwa/sw.js`, `pwa/admin.*`, `pwa/icons/events/**`, `firestore.rules` (pour mémoire). Au démarrage : rien de spécial dans le journal tant qu'aucun joueur n'a joué.
   - **Notifications** : les appareils s'enregistrent quand ils ouvrent la nouvelle version (ceux dont les notifications sont déjà actives : d'office ; les nouveaux : étape du premier lancement). Pour laisser le temps de venir, **aucune annonce automatique pendant les 2 h qui suivent le premier démarrage** ; l'annonce « La chasse est ouverte » du 25 octobre ne part que le jour même entre 10 h et 21 h : **déployer avant 19 h** pour qu'elle parte (sinon, la suivante est celle du mi-parcours le 1er novembre ; un envoi manuel depuis `/admin` › Événements › Notifications peut la remplacer). Pas de nouvelle APK : le plugin de notifications est déjà dans l'appli.
4. **Discord** (facultatif) : créer le rôle **🎃 Événements** pour que les membres qui le prennent soient pingés par les annonces ; le bot doit pouvoir écrire dans `#annonces` (salon en lecture seule : « Envoyer des messages » et « Intégrer des liens » au rôle Support). L'annonce J-3 (« arrive demain ») part au premier tour du bot si le serveur est déployé avant minuit, puis « La chasse est ouverte » le 25.
5. **Badges** : ceux d'Halloween 2026 sont déjà dans le dépôt. L'Action « Badges des événements » (`.github/workflows/event-badges.yml`) génère les suivants toute seule, 7 jours avant chaque fête ; si la branche par défaut est protégée, autoriser `github-actions` à y pousser. La lancer une fois à la main n'est pas nécessaire pour Halloween.
6. **Google Play** : icône de la fiche d'Halloween `docs/evenements/logos/halloween/play/play-icon-512.png` (remettre l'icône normale après le 8 novembre). L'icône de l'appli installée change toute seule à partir de l'APK 1.0.13 (`docs/android.md` › APK 1.0.13, `docs/evenements/icones-android.md`).

## Débogage

- `/admin` › **Événements** : interrupteur à chaud, statistiques, liste des chasseurs, « Réinitialiser » (un joueur, ou sa propre avancée) : progression à zéro et message « La chasse est ouverte » revu sur ses appareils à la prochaine ouverture de l'appli (ou relecture, toutes les 10 min).
- `https://manaorbit.app/?evreset=1` : l'appareil oublie ses événements (message d'arrivée revu, progression locale effacée) ; sur le téléphone, le lien s'ouvre dans l'appli. Faire d'abord « Réinitialiser mon avancée » dans `/admin`.
- Essai d'une autre fête : `EVENT_FORCE=noel` (sur un serveur d'essai).
- Notifications : `/admin` › Événements › **Notifications** (prochaine annonce, appareils, historique avec appareils touchés et échecs) ; journal du serveur : « Événements : notification « … » : N appareils prévenus ». Essai sur son téléphone : un envoi manuel (un par heure).

## Livré plus tard

- Noël (calendrier de l'Avent, du 1er au 26 décembre) : **prêt** (`ready: true`), s'ouvre tout seul ; badges `noel-2026-*` déjà dans le dépôt ; rien à faire (le rôle Discord 🎃 Événements sert pour toutes les fêtes).
- Nouvel an (nuit des étoiles filantes, du 27 décembre au 10 janvier) : **prêt** (`ready: true`), s'ouvre tout seul ; badges `nouvelan-2026-*` dans le dépôt ; icône Android déjà dans l'APK ; rien à faire.
- Noël : **cadeau de secours** (3 cadeaux cachés par jour pour 2 à trouver) ; rien à faire.
- Pâques (nid de Pâques, du 21 mars au 4 avril 2027) : **prêt** (`ready: true`), s'ouvre tout seul ; annonces Discord et notifications prêtes (le rôle 🎃 Événements sert aussi) ; badges `paques-2027-*` dans le dépôt ; couleur de classeur rare « Œuf d'or ». À faire :
  - **APK** : le logo de Pâques a été redessiné ; les mipmaps `ic_launcher_paques*` sont à jour dans `android-app/` : les publier avec une APK avant mars 2027 (sinon l'appli installée garde l'ancien dessin de Pâques, rien ne casse).
  - **Google Play** (facultatif) : icône de la fiche `docs/evenements/logos/paques/play/play-icon-512.png` pendant la fête.
  - Essayer avant : « Aperçu d'une fête » (Compte et réglages › Préférences, compte de l'éditeur) : jour choisi, « Passer au jour suivant » (Jeudi saint : jour 5 ; dimanche de Pâques : jour 8).
- Anniversaire de Magic (musée de Magic, du 29 juillet au 12 août 2027, jour J le 5 août) : **prêt** (`ready: true`), s'ouvre tout seul ; annonces Discord et notifications prêtes (le rôle 🎃 Événements sert aussi) ; badges `magic-2027-*` générés par l'Action 7 jours avant (ou déjà dans le dépôt) ; couleur de classeur rare « Lotus d'or ». À faire :
  - **APK** : mipmaps `ic_launcher_magic*` à jour dans `android-app/` : les publier avec une APK avant fin juillet 2027 (sinon l'appli installée garde l'icône précédente de la fête, rien ne casse).
  - **Google Play** (facultatif) : icône de la fiche `docs/evenements/logos/magic/play/play-icon-512.png` pendant la fête.
  - Essayer avant : « Aperçu d'une fête » (Compte et réglages › Préférences, compte de l'éditeur) : jour choisi, « Passer au jour suivant » (jour J : jour 8).
