# Audit Échange et social — Mana Orbit (24 oct. 2026)

Périmètre : onglet Échange (liste, recherchées, filtres, réserve, rangements, classeur et « Mon classeur »), lien public et QR, image à partager, page d'un autre joueur, « Pour toi », Amis, échange en direct, Discord (invitation, liaison), avis, Carte mystère, niveaux et badges.
Méthode : monde de test (`tests/e2e-world.mjs`, faux Firebase `amis-fakes.mjs`, faux Scryfall serveur `daily-fakes.mjs`), ports 19580-19584, deux contextes navigateur (Alice et Bob), déconnecté puis connecté, 360×780 et 393×852 tactiles, 1280×800 souris, clair et sombre. Une partie complète de Carte mystère jouée (trouvée à l'étape 9, 249 points), une abandonnée, une sur ordinateur.
Scripts : `echange/s1-solo.mjs` (33 écrans × 6 configurations), `s2-duo.mjs` (lien public, amis, échange en direct complet), `s3-daily.mjs`, `s4-cas.mjs` (cas limites), `s5-classeur.mjs`. Journal des constats : `echange/findings.log`. Contrôles automatiques : `echange/ui-report.jsonl`.
Captures : `/tmp/claude-0/-home-user-manaorbit/15f70d1d-7785-5c9d-9985-8c1381d82b88/scratchpad/echange/<config>/…png`.

Bilan technique : aucune erreur console, aucun défilement horizontal ni texte coupé sans « … » détecté sur les 200 captures. Les tests existants couvrent bien les parcours nominaux. Les vrais problèmes sont la **fidélité des données échangées** (foil) et la **découvrabilité et l'ergonomie** du social.

---

## (a) Bugs

| # | Constat | Repro / preuve | Proposition | Impact | Effort |
|---|---|---|---|---|---|
| A1 | **Échange en direct : un exemplaire foil perd sa finition et sa langue, et le donneur perd le mauvais exemplaire.** L'appli envoie la ligne `en*` (`src/troc.js:56` `trocMine`) ; le serveur ne garde que les langues connues (`proxy.mjs:1684` `trocG` : `"en*"` n'est pas une langue, donc `''`). Chez Alice, `trocDrop` (`troc.js:619`) retire alors un exemplaire **non foil** (`en:3,en*:2` → `en:2,en*:2`) ; Bob reçoit « Llanowar Elves » **sans langue ni foil**. Pour une ligne foil avec édition (`fr\|cmm\|400*`), l'édition est aussi perdue (le `*` fait échouer la regex d'édition). | `s2-duo.mjs`, `findings.log` (« Alice avant / après », « Bob après ») ; `duo-alice-light/a05-donner-liste.png` | Accepter un suffixe `*` dans `trocG` (langue, édition et foil), l'afficher (✦) sur les pastilles, les tuiles, le récapitulatif et l'historique, et le tester dans `troc-e2e` | **Fort** (collection fausse des deux côtés, sans qu'on le voie) | S |
| A2 | **Le foil est invisible dans l'échange en direct.** Deux pastilles identiques « 🇬🇧 × 2 » pour la ligne normale et la ligne foil (`trocRowHtml`, `troc.js:498`) ; ni tuile (`trocTile`, `troc.js:357`), ni récapitulatif, ni « Mes échanges » ne montrent ✦ | `duo-alice-light/a05-donner-liste.png`, `a11-recap.png` | Pastille « ✦ » et voile foil comme dans le classeur ; drapeau, édition et foil aussi dans le récapitulatif (aujourd'hui : nom et prix seulement) | Fort | S |
| A3 | **Valeurs d'échange au prix de l'impression la moins chère** (sans foil, sans édition) : liste d'échange, page publique, « Pour toi », balance de l'échange en direct (`share.js:82` `trPrice`, `proxy.mjs:1704` `trocPxLoad`). Or la valeur de la collection compte le prix de l'édition et le prix foil de chaque ligne. Un foil ou une vieille édition est donc sous-évalué dans la balance | `m393-light/13-echange-apercu.png` (Llanowar foil à 0,20 €) | Prix par ligne (édition, foil) quand il est connu, sinon celui de la carte avec la mention « prix de base » ; même règle côté serveur | Fort (équité, confiance) | M |
| A4 | **« Annuler » un échange appliqué : 6,5 s, dans un toast, d'un seul côté.** (`app.js:185`). L'autre joueur n'est pas prévenu, et les deux collections divergent. Ensuite, plus aucun moyen d'annuler (« Mes échanges » permet seulement « Supprimer de l'historique ») | `findings.log` (« Toast Annuler encore actif après ~4 s : false ») ; `duo-bob-dark/b18-fait.png` | Bouton « Annuler cet échange » dans l'écran de fin et dans le détail de l'historique pendant 24 h, qui **propose** l'annulation à l'autre (une session inverse pré-remplie) | Moyen | M |
| A5 | **Accueil « Pour toi » périmé** juste après une amitié : « Alice · rien pour toi pour l'instant », alors que sa page et la feuille Amis disent « 2 cartes pour toi · 2 à lui proposer » | `duo-bob-dark/b08-accueil-pour-toi.png` vs `b09-page-ami.png`, `b11-amis-un-ami.png` | Relire l'accueil quand la liste des amis change (`amRefresh` → `homeSoon`), ou écrire « calcul en cours » tant que le serveur n'a pas les listes | Moyen | S |
| A6 | **Pseudo public pré-rempli avec le nom Google** (prénom + initiale, `daily.js:144` `dlyNickHint`). Un appui sur « C'est parti » publie un vrai prénom dans le classement, alors que le README promet « jamais le nom Google » | `daily-m393-light/g01-participer-pseudo.png` | Champ vide avec une suggestion neutre (« Planeswalker 3FA2 ») ou un bouton « Utiliser mon prénom » | Moyen (vie privée, Play) | S |
| A7 | **L'hôte lit son propre nom** : sur l'écran d'attente, « Échange avec Alice » est affiché à Alice (`troc.js:344`) | `m393-light/25-direct-hote.png` | « Scanne pour échanger avec Alice » | Faible | S |
| A8 | **Élision française** : « Liste d'échange de Alice », « Decks de Alice », « Tu as ce que Élodie cherche », « de Ivo »… (≈ 20 chaînes `de {name}`) | `m360-dark/12-echange-qr.png`, `cas-bob-android-dark/c04…png` | Petit utilitaire `deNom()` (« d'Alice ») et `queNom()` pour le français | Faible | S |
| A9 | **Le classeur reste sur la page 3** après un changement de tri ou d'épingle : l'utilisateur ne voit pas l'effet (les épinglées sont en page 1) | `bnd-m360-light/k06-classeur-bordeaux.png` | Revenir à la page 1 après un changement de « Mon classeur » | Faible | S |
| A10 | Comptes différents entre le propriétaire (« À échanger 3 · 3 cartes ») et l'aperçu ou le visiteur (« À échanger 4 · 4 cartes », une ligne par langue) ; l'image dit « 3 cartes à échanger » | `m393-light/07…png`, `13-echange-apercu.png`, `14-echange-image.png` | Même unité partout (cartes et exemplaires) | Faible | S |
| A11 | Avis envoyé vide : seul le focus passe au titre, sans message | `cas-alice-light/c11-avis-vide.png` | Message sous le champ (« Titre : 3 caractères au moins ») | Faible | S |

Non retenus (artefacts du banc de test) : lien périmé encore lisible (le faux `dropShare` n'efface rien) ; « 17-direct-code » (code invalide : le comportement réel est correct, voir `findings.log`).

---

## (b) UI / UX

| # | Constat | Proposition | Impact | Effort |
|---|---|---|---|---|
| B1 | **La liste n'est presque pas visible sur l'écran de l'Échange** (393×852 : 1re carte à y≈700) : recherche, gros encadré du lien (8 actions), réserve 0-4, Mes rangements et sous-onglets passent avant (`m393-light/07-echange-lien.png`). Sur 360, rien de la liste au-dessus du pli | Une fois le lien créé, le replier en une barre « Lien actif · QR · Partager · ⋯ » ; réserve et rangements dans une feuille « Réglages de l'échange » ; la recherche et les filtres collés à la liste | Fort | M |
| B2 | **Le visiteur ouvre sur « Pour toi 0 »** (onglet par défaut, `share.js:504`), même déconnecté et sans aucune correspondance : deux encadrés vides au lieu des 301 cartes (`cas-bob-android-dark/c04-visiteur-android-barre.png`) | « Pour toi » par défaut seulement s'il a des cartes, sinon « À échanger » | Fort (premier contact en boutique) | S |
| B3 | **Deux QR différents pour un même joueur** : celui de la liste (lecture seule) et celui de l'échange en direct. Un inconnu qui scanne la liste n'a **aucun bouton pour proposer un échange** ; seule la page d'un ami a « Échange en direct » | Sur la page publique (visiteur connecté) : « Proposer un échange en direct » → invitation au propriétaire (comme pour un ami) avec les correspondances de « Pour toi » pré-remplies | Fort | M |
| B4 | **Échange en direct sur ordinateur** : colonne de 600 px au centre, mais boutons du pied sur 1 250 px ; « Tu reçois » et « Tu donnes » l'un sous l'autre, donc il faut défiler (`duo-alice-1280-light/a10-direct-1280.png`) | Deux colonnes côte à côte avec la balance au milieu (la « fenêtre d'échange » des RPG) ; pied à la largeur du contenu | Moyen | S |
| B5 | **Carte mystère sur ordinateur** : une seule colonne étroite, la ligne de type, le texte et « Indice suivant » sous le pli à 800 px (`daily-d1280-light/g08-etape7.png`) | Illustration à gauche, indices et nom à trous à droite, comme sur une tablette | Moyen | S |
| B6 | **Cibles tactiles < 44 px** sur des actions clés : pastilles de langue du sélecteur d'échange (h. 32), « Garder » (26), Liste/Classeur (41×32), « Nouveau lien » / « Arrêter » (32), icônes Carte mystère et Classements (34×34), « Signaler le pseudo » (30), épingle de badge « ＋ » (24), pastille « Niv. 5 » (20), « Signaler ce partage » (15), couleurs du classeur (38) | 44 px minimum (zone de toucher élargie par `::before` comme `.coll-dot`) | Moyen | S |
| B7 | **Actions destructrices sans confirmation** : « Nouveau lien » et « Arrêter le partage » cassent tout de suite le lien, le QR imprimé et le widget (`share.js:166`) | Feuille de confirmation : « Ton QR code, ton widget et les liens déjà envoyés ne marcheront plus » | Moyen | S |
| B8 | **Amis difficiles à trouver** : seulement Compte › Mon compte › Amis (et un point rouge sur l'avatar). Ni l'onglet Échange ni l'accueil sans ami ne l'expliquent | Entrée « Amis » dans l'onglet Échange (à côté d'Échange en direct) et dans « Pour toi » vide (« Ajoute un ami avec son QR ») | Moyen | S |
| B9 | **« Équilibrer » propose des cartes que je ne cherche pas** (glouton sur le prix, `troc.js:590`) : à Alice qui a 4 Sol Ring en trop, il propose « Sol Ring × 2 » (`duo-alice-light/a09-equilibrer.png`) | Priorité : mes recherchées, puis les cartes que je n'ai pas, puis le reste | Moyen | S |
| B10 | **« Toute ma collection » dans l'échange en direct** ne signale pas les cartes de mes decks : on peut casser un deck sans le savoir | Étiquette « dans 2 decks » sur la pastille ; avertissement dans le récapitulatif | Moyen | S |
| B11 | Lien mort : « Ce lien ne marche plus » avec seulement « Fermer » | « Demande-lui son nouveau lien » + « Crée ta propre liste » | Faible | S |
| B12 | « Signaler ce partage » est un `mailto:` (`share.js:496`) : sans client mail (ordinateur), rien ne se passe | Signalement serveur, comme pour les pseudos de la Carte mystère | Faible | S |
| B13 | « 6 paliers obtenus sur 261 · 📌 : sur ta liste d'échange (0 / 3) » : phrase obscure, épingle de 24 px | « Montre jusqu'à 3 badges sur ta liste : touche 📌 sur un badge obtenu » | Faible | S |
| B14 | Carte mystère perdue ou abandonnée : « Place 2 sur 2 · 0 point » | « Non classée cette fois » (les perdants comptés à part) | Faible | S |
| B15 | Recherche de la Carte mystère : seulement le **début du nom** (« serra » ne trouve pas « Ange de Serra ») et pas l'anglais en interface française | Début de **chaque mot** (le nom à trous montre justement la fin) | Faible | S |
| B16 | Avis : « Ton message sera public » n'apparaît qu'en bas, sous le pli | Le dire dans le sous-titre | Faible | S |

Points positifs : clair et sombre soignés et cohérents ; QR net avec logo, luminosité et écran allumé ; classeur réussi (deux pages dès 760 px, clavier, glisser, aller à la page) ; règles de l'échange en direct sûres (rien ne change avant les deux validations, « Prêt » retiré au moindre changement) ; Carte mystère fluide (décompte, chrono serveur, partage façon Wordle sans la réponse) ; barre « Ouvrir dans l'appli » discrète sur Android.

---

## (c) Fonctionnalités à améliorer

| # | Proposition | Référence | Impact | Effort |
|---|---|---|---|---|
| C1 | **Historique des échanges synchronisé** (aujourd'hui sur l'appareil seulement, 50 au plus), **exportable**, avec le bilan « gagné / perdu en valeur » | Deckbox (historique), Dragon Shield | Fort | M |
| C2 | **Balance plus juste** : prix par édition, foil et état (NM, EX…) choisis par ligne ; source affichée (« tendance CM du 23/10 ») ; tolérance réglable (« entre amis : ±10 % ») | ManaBox (choix de l'impression), Dragon Shield (écart de valeur) | Fort | M |
| C3 | **« Pour toi » actionnable** : bouton « Proposer cet échange » qui pré-remplit une session avec les correspondances des deux côtés, et une estimation (« tu reçois 10,20 €, tu donnes 6,20 € ») | Deckbox (trade proposal) | Fort | M |
| C4 | **Échange à distance (asynchrone)** : proposition envoyée à un ami, acceptée ou contre-proposée plus tard (aujourd'hui, les deux doivent être là en même temps ; session de 30 min) | Deckbox, Dragon Shield | Moyen | L |
| C5 | Notifications d'échange : « Bob a validé », « Bob a annulé de son côté », rappel d'un échange en attente | — | Moyen | S |
| C6 | Carte mystère : statistiques personnelles (série, répartition par étape, moyenne), et un **classement entre amis** | Wordle, groupes Mythic Tools | Moyen | S |
| C7 | Page publique : valeur totale visible du visiteur ; tri par prix ; filtre par langue et foil | Deckbox | Faible | S |
| C8 | Ami : ajout **par pseudo ou code ami** (aujourd'hui seulement par lien ou QR d'une liste d'échange) | Mythic Tools, Dragon Shield | Moyen | M |

## (d) Nouvelles fonctionnalités

| # | Proposition | Référence | Impact | Effort |
|---|---|---|---|---|
| D1 | **Réputation des échangeurs** : après un échange en direct validé des deux côtés, une note (👍 / 👎 + étiquettes « ponctuel », « état conforme »), compteur « 12 échanges réussis » sur la page publique | Deckbox (seul à l'avoir) | Fort (échanges entre inconnus) | M |
| D2 | **Messagerie légère par échange** (fil attaché à une proposition ou à une liste, messages courts prédéfinis : « dispo samedi ? », « je passe à la boutique ») ; aujourd'hui tout part sur Discord | Mythic Tools (chat), Deckbox (forum) | Moyen | M |
| D3 | **Boutique ou ville** : rapprochement des listes avec les joueurs inscrits dans une boutique (opt-in, pseudo seulement), « qui a ce que je cherche près de moi », QR de boutique | Deckbox (tous les utilisateurs), Companion (boutique favorite) ; `a-faire.md` prévoit déjà le mode organisateur et le profil de boutique | Fort | L |
| D4 | **Événements locaux** : soirées d'échange dans une boutique (date, lieu, participants inscrits, correspondances calculées à l'avance) | Companion, TopDeck.gg | Moyen | L |
| D5 | **Wishlist partagée de groupe** (pod Commander : « ce qui manque à nos decks », qui l'a) | Mythic Tools (groupes) | Moyen | M |
| D6 | Alerte « un ami ou un joueur de ta boutique a ajouté une carte que tu cherches » étendue aux non-amis inscrits (aujourd'hui amis seulement) | Deckbox | Moyen | M |

Déjà prévu dans `docs/a-faire.md` : mode organisateur et tournois maison (D4 en partie), profil de boutique « plus tard », « Annuler des deux côtés » et historique synchronisé (C1, A4) cités comme « pas encore ».

---

## Comparaison aux références (échange et social)

| Critère | Mana Orbit (constaté) | Deckbox | Dragon Shield | Mythic Tools | TurnZero |
|---|---|---|---|---|---|
| Balance de valeur | ✅ en € et %, couleur, « Équilibrer » ; ❌ foil, édition et état ignorés (A3), suggestions hors souhaits (B9) | ✅ | ✅ écart de valeur | ? | ❌ |
| Historique des échanges | 🟡 sur l'appareil, 50, non synchronisé, sans export | ✅ | ? | ❌ | ❌ |
| Notation des partenaires | ❌ | ✅ | ❌ | ❌ | ❌ |
| Messagerie | ❌ (Discord à côté) | 🟡 forum | ❌ | ✅ chat de groupe | ❌ |
| Wishlist partagée | ✅ « Recherchées » publiques, illustration choisie, copie Cardmarket | ✅ | ✅ avec les amis | ? | ❌ |
| Rapprochement | ✅ amis et liens ouverts ; ❌ inconnus, boutique | ✅ tous les utilisateurs | ✅ amis | ❌ | ❌ |
| Événements locaux, boutiques | ❌ (prévu) | ❌ | ❌ | 🟡 groupes | ✅ pods, invités sans compte |
| Échange face à face qui met à jour les deux collections | ✅ (unique), mais A1 et A2 | ❌ | ❌ | ❌ | ❌ |

« Temps pour montrer sa liste à un inconnu » : 1 appui depuis l'accueil (« QR code »), ou le widget ; lisible sans appli ni compte. Mais l'inconnu arrive sur « Pour toi 0 » (B2) et ne peut rien proposer (B3).

---

## Captures utiles
- Échange (6 configurations) : `echange/{m360,m393,d1280}-{light,dark}/06…25-*.png` (07 lien, 10 classeur, 11 Mon classeur, 12 QR, 13 aperçu, 14 image, 16 direct, 18 amis, 19 badges, 20 Discord, 21 avis, 25 hôte).
- Deux joueurs : `echange/duo-bob-dark/b01…b19`, `echange/duo-alice-light/a01…a15`, `echange/duo-alice-1280-light/a10-direct-1280.png`.
- Carte mystère : `echange/daily-m393-light/g01…g18`, `daily-m360-dark/g04…g11`, `daily-d1280-light/g04…g12`, `daily-m393-dark/g20-21` (déconnecté).
- Cas limites : `echange/cas-alice-light/c01…c12`, `cas-bob-android-dark/c04-c05` ; classeur : `echange/bnd-m360-light/k01…k06`, `bnd-d1280-dark/`.
