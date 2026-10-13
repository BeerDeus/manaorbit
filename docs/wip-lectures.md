# WIP — Réduire les lectures Firestore (branche `feat/lectures`, en pause)

## Objectif
Le projet est sur le quota gratuit (50 000 lectures/jour pour tous les comptes). Viser ~10× moins de lectures par compte, sans perte
de qualité (synchro entre appareils en direct, mêmes indicateurs « Synchronisé » / « Synchronisation… », même hors ligne), sans jamais
perdre ni écraser de données.

## Mesures (vrai SDK 12.19 + émulateur Firestore, facturation Firestore reproduite par `tests/lectures-lib.mjs`)
L'émulateur ignore les jetons de reprise : chaque relance = le cas « après plus de 30 min » (le plus cher). Compte de test : 10 decks + 6 documents annexes.

| Scénario | Avant | Après (mesuré) |
|---|---|---|
| Relance de l'appli (> 30 min) | 16 (17 en prod : document scan absent compté) | **1** (3 quand la vérification tombe, au plus toutes les 6 h) |
| Première ouverture d'un compte sur un appareil | 16–17 | 17 (écoutes d'avant) ; 34 une seule fois pour le 1er appareil qui crée le sommaire |
| 30 cartes ajoutées une à une (1,5 s d'écart), appareil qui ajoute | 60 (30 transactions + 30 échos) | **18** (9 envois groupés × 2) |
| … deuxième appareil ouvert | 30 | 18 (sommaire + collection par envoi) |
| Deck modifié : appareil qui écrit / autre appareil | 1 / 1 | 3 / 2 mesurés → corrigé (copie en attente de confiance), attendu **1 / 2** — à remesurer |
| Liste d'échange modifiée : écrit / autre | 1 / 1 | 1 / 2 |
| Deck supprimé : écrit / autre | 0 / 0 | 1 / 1 |

Écritures : chaque écriture d'un document du compte écrit aussi le sommaire (×2 écritures par modification isolée), compensé en partie
par l'envoi groupé de la collection. **À signaler au propriétaire** : quota gratuit d'écritures = 20 000/jour ; après ce changement les
écritures pourraient devenir la limite avant les lectures (estimation journée type : ~36 écritures avant, ~30–60 après selon l'usage).

Côté serveur (`proxy.mjs`) : `/api/pubdecks` relit TOUS les decks publics + signalements toutes les 10 min quand on le demande
(N + R lectures par relecture). Idée non faite : 2 agrégations (nombre + somme des dates, 2 lectures) avant de tout relire, relecture
complète seulement si quelque chose a changé. Amis (10 min par compte) et admin (10 min) : rien d'évident.

## Conception retenue
Document `users/{uid}/meta/sommaire` = `{ v: 1, p: { collection, engaged, history, trade, prefs, profile, scan: leur updatedAt }, d: { idDeck: updatedAt }, at, old? }`
(jamais de champ `updatedAt`, pour ne pas fausser la vérification).
- Écrit dans le **même lot / la même transaction** que chaque document du compte (decks : `save`, `remove`, `saveMany` ; annexes : `saveMeta`,
  `updMeta` avec `updatedAt` ; collection : `txColl`). Suppression d'un deck : `d.<id>: deleteField()`.
- Un appareil n'écoute plus que le sommaire et ne relit sur le serveur que les documents dont la date diffère de sa copie (cache persistant
  du SDK, `getDocFromCache`/`getDocsFromCache`) ; decks : `getDocFromServer` par deck changé (au-delà de 5 : une requête). Copie écrite ici
  et pas encore partie : la plus récente (jamais relue). Collection écrite par transaction : gardée en mémoire (`mem`) pour éviter de la relire.
- Tout est dans `src/cloud.js` (`makeSum`) : `watch`, `watchColl`, `watchMeta` rendent les mêmes rappels qu'avant → aucun module de l'appli
  à changer pour la lecture, et les faux `D.cloud` des tests e2e existants ne passent pas par ce code.
- Modes par compte : `wait` (copie locale livrée comme « vient du cache ») → `sum` (sommaire du serveur) ou `legacy` (écoutes d'avant, code d'origine).
  - `legacy` quand : première ouverture du compte sur cet appareil (`deckdeal:sum:v1[uid].ok` absent), sommaire absent / sans `v`,
    écriture du sommaire refusée (règles pas publiées : essai suivant dans 24 h, `den`), écart constaté (`old`, 24 h), erreur d'écoute.
  - Création : écriture d'essai `{ at }` (refus = règles pas publiées, rien relu), puis relecture complète + transaction (`repair`, fusion
    `sumMerge` : ce qu'un autre appareil a changé entre-temps dans le sommaire est gardé). Pas recréé si le sommaire disparaît en cours de
    session (compte effacé ailleurs) ni si `acctHeld(uid)`.
  - Écritures faites sans le sommaire (pas encore permis) : notées (`plain`), dates reportées ensuite par transaction (`restamp`).
- **Filet de sécurité** (versions mélangées, écritures sans sommaire) : au plus toutes les 6 h, avant de passer en `sum`, 2 agrégations
  `count + sum(updatedAt)` sur `decks` et `meta` (`where updatedAt > 0`) comparées au sommaire (2 lectures). Écart → relecture complète,
  sommaire réparé avec `old: now` → tous les appareils du compte repassent aux écoutes d'avant pendant 24 h, puis revérifient.
  NB : l'émulateur exclut du `count()` les documents sans le champ sommé → d'où le filtre `updatedAt > 0` (les deux sémantiques marchent).
- Scan mobile : `scan` écouté en direct (« hot ») tant que `on: true` ; `scanPush`/`scanTake` et le signe de vie du PC (`mobBeat`) ne
  changent plus `updatedAt` (rien à relire pour les autres appareils) ; ouverture/fermeture de session changent la date (sommaire).
- `pullColl`/`pullMeta` : en mode `sum` avec sommaire à jour → copie confirmée, sans lecture.
- Envoi groupé de la collection (`src/collection.js`, `COLL_PUSH`) : changement isolé 0,7 s ; rafale (3 changements en 20 s) → au plus un
  envoi toutes les 6 s. `syncFlush()` (`src/decks.js`) : envois en attente (collection, engaged/history, trade, prefs) partis tout de suite
  en arrière-plan (`collSleep`) et avant la déconnexion (`me.js › meSignOut`, `#acOut`), 3 s au plus.
- Règles : nouveau bloc `match /users/{uid}/meta/sommaire` (champs `v, p, d, at, old`, `p` ≤ 30, `d` ≤ 3 000, types) ; lecture/suppression
  par la règle des documents annexes. `wipe` efface le sommaire en premier.

## Fait (non testé par la batterie : AUCUN test existant relancé après les changements)
- `src/cloud.js` : section « Sommaire du compte » (SUM, sumGet/sumNote, stampOf, sumMerge, makeSum) ; makeCloud branché dessus ;
  `sumState(uid)` (tests) ; `wipe` + sommaire ; exports Node `SUM, SUM_ID, sumMerge`.
- `src/collection.js` : `COLL_PUSH`, `COLL.chg`, `COLL.pushAt`, `collPushSoon` par rafales, `collSleep` → `syncFlush`.
- `src/decks.js` : `syncFlush()` ; `#acOut` l'attend avant `signOut`. `src/me.js` : idem dans `meSignOut`.
- `src/extras.js`, `src/share.js`, `src/scanset.js` : `pushT` remis à 0 à l'envoi et au changement de compte (repère « envoi en attente »).
- `src/mobscan.js` : signe de vie sans `updatedAt` ; en-tête documenté.
- `firestore.rules` : bloc `sommaire`. `tests/rules-test.mjs` : cas permis/refusés du sommaire, lot et transaction avec le sommaire,
  agrégations (compte seul), `wipe` avec le sommaire — **pas encore lancé**.
- `tests/lectures-lib.mjs` : banc (SDK servi depuis `tests/.tmp/fb-shared.js`, Firestore branché sur l'émulateur avec `mockUserToken`,
  long polling, compteur de lectures/écritures côté Node, semis REST « owner »).
- `tests/lectures-e2e.mjs` : écrit, **jamais lancé** (coûts, 2 appareils, scan mobile, écriture sans sommaire, hors ligne, envoi groupé,
  règles sans sommaire puis publiées). S'ignore sans émulateur (comme rules-test).
- `deck-deal.html` reconstruit.

## Reste à faire
1. Lancer et corriger `tests/lectures-e2e.mjs` (attendus à vérifier : deck modifié = 1 lecture sur l'appareil qui écrit après la correction
   « copie en attente de confiance » ; seuils des rafales ; section 5 = le test d'arrière-plan doit prouver l'envoi < 2,5 s).
2. `syncFlush` : si un envoi de la collection est déjà en cours (`COLL.pushing`), attendre sa fin puis renvoyer ce qui reste (aujourd'hui
   `collPush` repasse `again` et l'envoi suivant pourrait être annulé par la déconnexion — rien de perdu, il repart à la prochaine connexion).
3. `tests/test-cloud.mjs` : `wipe` efface maintenant 11 documents → attendu `'batch:11'` au lieu de `'batch:10'` ; le reste devrait passer
   (sans localStorage sous Node → mode `legacy`, comme avant).
4. Lancer (via flock) : rules-test (émulateur), test-cloud, sync-e2e, e2e-account, coll-e2e, mobscan-e2e, extras-e2e, dklist-e2e,
   viewer-e2e, builder-e2e, lot-e2e, scan-e2e, opening-e2e, amis-e2e, troc-e2e, trade-e2e, widget-e2e, alerts-e2e, value-e2e, pwa-e2e,
   sw-e2e, gate-e2e, test-i18n-langs, i18n-e2e, smoke, test.mjs (+ perf-e2e pour le démarrage).
5. Ajouter `lectures-e2e.mjs` à `tests/run-tests.sh` (s'ignore sans émulateur) et au workflow `.github/workflows/rules.yml`
   (installer les dépendances de tests + Chromium, déclencheurs `src/cloud.js`, `tests/lectures-*.mjs`).
6. Optionnel serveur : `/api/pubdecks` avec agrégations avant relecture complète (+ cas dans `tests/test-pubdecks.mjs`) ; si `proxy.mjs`
   est touché, rebaser sur `claude/mana-orbit-mockups-skisuo` (commit e1cf51b).
7. Docs : README (section synchro), `docs/a-faire.md` (**publier les règles Firestore** avec le bloc `sommaire` ; ne jamais republier une
   version des règles sans lui), `docs/prochaine-session.md`. Pas de texte d'interface nouveau (pas d'i18n).
8. Captures : rien de visible à montrer (même interface) — éventuellement l'écran « Mes decks » synchronisé en clair/sombre.

## Risques / questions ouvertes
- Écritures ×2 pour les modifications isolées (voir plus haut) : à valider avec le propriétaire.
- Deuxième appareil ouvert : 2 lectures par modification faite ailleurs (sommaire + document) au lieu de 1 ; compensé par l'envoi groupé
  et largement par les ouvertures (1 au lieu de 17).
- Règles republiées SANS le bloc sommaire alors que des appareils l'utilisent : écritures en lot refusées → repli écriture seule si l'appli
  est ouverte ; une écriture faite hors ligne puis appli fermée avant le retour du réseau serait perdue → ne jamais retirer ce bloc.
- Fenêtre « version d'avant ouverte ailleurs » : ses écritures ne sont vues qu'à la vérification suivante (≤ 6 h, ou à la relance) ; le
  service worker recharge l'ancienne page vite (DD_BUILD), donc fenêtre courte. Collection toujours sûre (transaction + fusion).
- `count()` avec `sum()` : sémantique de production à confirmer (filtre `updatedAt > 0` choisi pour être juste dans les deux cas).
- Cache persistant indisponible (navigation privée, Firefox sans IndexedDB) : mode `sum` relit tout à chaque ouverture (coût d'avant + 1).

## Reprendre
```
cd <worktree> && git checkout feat/lectures
ln -s /home/user/manaorbit/tests/node_modules tests/node_modules; mkdir -p tests/.tmp && cp /home/user/manaorbit/tests/.tmp/fb-shared.js tests/.tmp/
# émulateur pour le développement (port de la plage 19450–19499) :
java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar --host 127.0.0.1 --port 19460 &
FIRESTORE_EMULATOR_HOST=127.0.0.1:19460 flock <scratchpad>/e2e.lock timeout 420 node tests/lectures-e2e.mjs
# règles (comme la CI) :
S=<scratchpad>; RULES_DEPS=$S/rules-deps/node_modules $S/rules-deps/node_modules/.bin/firebase emulators:exec --only firestore --project demo-deckdeal "node tests/rules-test.mjs"
```
Sondes de mesure (hors dépôt) : `<scratchpad>/lec/probe.mjs` (état d'avant, à lancer sur un checkout d'avant) et `probe2.mjs` (avec sommaire),
`WT=<worktree> FIRESTORE_EMULATOR_HOST=127.0.0.1:19460 node <scratchpad>/lec/probe2.mjs` (V=1 : noms des documents lus).
