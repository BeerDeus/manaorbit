# Posts Instagram (carrousels) : générateur

Tout est en code, comme les vidéos (`tools/shorts/`) : un fichier par post dans `posts/`, rendu en images 1080 × 1350 (4:5) dans la DA de la fiche Google Play (nuit, aurores, orbite foil continue d'une image à l'autre, Bricolage Grotesque + Instrument Sans, vrais écrans de l'appli dans un téléphone incliné, vraies cartes Scryfall). Sortie : `docs/instagram/<id>/` (images + `description.md`), l'index `docs/instagram/LISEZMOI.md` et `apercu-grille.jpg` (la grille du profil).

## Commandes

```
VRAIES_CARTES=1 node tools/store-assets.mjs video fr    # écrans de l'appli → shots/video/fr-*.png (une fois, ≈ 3 min ; à refaire quand l'appli change)
node tools/insta/rendu.mjs                              # tous les posts + index + aperçu de la grille (≈ 1 min)
node tools/insta/rendu.mjs 03 07                        # ces posts seulement (début de l'id)
node tools/insta/rendu.mjs --textes                     # description.md et index seulement
node tools/insta/rendu.mjs --une                        # couvertures « À la une » (a-la-une.mjs)
node tools/insta/rendu.mjs --nouveau=11-mon-sujet       # nouveau post à partir de modele.mjs
```

Planche de contrôle de chaque post (toutes les images côte à côte) : `tools/insta/rendu/<id>.jpg` (non versionnée).

## Fichiers
- `gabarits.mjs` : DA (CSS, fond, logo, téléphone, loupe, carte) et les gabarits de diapos.
- `rendu.mjs` : posts → images (Playwright, JPEG), `description.md`, index, aperçu de la grille.
- `scryfall.mjs` : vraies images de cartes, téléchargées une fois dans `shots/cartes/` (curl, une requête toutes les 120 ms). Impression de la langue demandée, présentation classique d'abord ; sinon l'anglaise. Aussi utilisé par `store-assets.mjs` avec `VRAIES_CARTES=1`.
- `posts/<nn-sujet>.mjs` : un post. `modele.mjs` : point de départ. `a-la-une.mjs` : couvertures des stories à la une.

## Un post

```js
export default {
  id: '11-mon-sujet',            // = nom du fichier ; l'ordre des numéros = l'ordre de publication conseillé
  titre, resume, type, quand,    // pour l'index et description.md
  epingle: true,                 // facultatif : à épingler sur le profil
  diapos: [ { g: 'couverture', … }, …, { g: 'fin' } ],
  legende: `…`,                  // texte de la légende, sans les hashtags
  hashtags: ['#mtg', …],         // 5 au plus (refusé au-delà : limite d'Instagram)
  commentaire: '…',              // premier commentaire, facultatif
  alt: ['…', …],                 // texte alternatif, un par diapo (vérifié)
  publication: ['…'],            // conseils, dans description.md
};
```

Texte des diapos : `*mot*` = dégradé foil, `**mot**` = gras blanc, `\n` = retour à la ligne, `{W}` `{U}` `{B}` `{R}` `{G}` = symbole de mana.

## Gabarits

| `g` | Champs | Pour |
|---|---|---|
| `couverture` | `kicker`, `titre`, `sous`, `sousL`, `taille`, `visuel` : `{ tel: { ecran, x, y, l, rot, ty } }` · `{ carte: {…}, x, y, l, rot }` · `{ cartes: [ … ], x, y, l, ecart, angle }` (éventail) · `{ dos: true }` · `{ gros: '4', taille }` · `{ mana: 'WUBRG' }` ; `loupes`, `pastilles`, `glisse` (texte, ou `false`) | 1re image, celle de la grille |
| `ecran` | `kicker`, `num`, `titre`, `texte`, `tel: { ecran, ty, x, y, l, rot }`, `loupes: [{ crop: [x, y, l, h], x, y, l, rot }]`, `pastilles` | un écran de l'appli, un détail en loupe |
| `chiffre` | `gros`, `taille`, `titre`, `texte`, `mana` ou `carte: { scry, x, y, l, rot }`, `cartes` + `eventail`, `pastilles` | un nombre qui dit tout |
| `etapes` | `titre`, `texte`, `y`, `mini`, `etapes: [[titre, texte, marque]]` (marque : chiffre, ✓, ✕, ou `W`…`G`) | pas à pas, liste de points |
| `rangs` | `titre`, `texte`, `y`, `rangs: [[clé, couleur, titre, petit, texte]]` | niveaux, applis, budgets |
| `texte` | `titre`, `texte` (paragraphes séparés par une ligne vide), `taille`, `signature`, `pastilles` | histoire, avis |
| `carte` | `titre`, `texte`, `carte`, `x`, `y`, `l`, `rot`, `pastilles` | une carte en grand |
| `indice` | `num`, `texte`, `sur` | devinette (dos de carte « ? ») |
| `fin` | `titre`, `texte`, `plus` | logo, Google Play, site, mention Fan Content Policy |

- **Carte** : `{ scry: 'Sol Ring', lang: 'fr', set: 'cmm', gris: true, cadreNom: true }` = vraie image (nom **anglais** ; `lang` par défaut `fr` ; `gris` : noir et blanc ; `cadreNom` : bande du nom entourée). Sans `scry` : carte dessinée (`{ nom, cout: '{1}', type, couleur: 'C', texte }`).
- **Écrans** (`ecran`) : `accueil`, `scan-0` à `scan-6`, `classeur`, `echange`, `qr`, `liste`, `decks`, `deck`, `partie`, `valeur`, `collection`, `manabox`, `masterset`, `mystere-0` à `mystere-5` (984 × 1584). `ty` cache le haut de la capture (px de la capture), `crop` d'une loupe aussi en px de la capture.
- **Pastille** : `{ t: '**21** de Paul', x, y, rot, c }` (`c` : `ok` vert, `a` violet, `r` rose, rien : jaune).

## Règles de la série
- **Légende** : la voix de Martin, à un autre joueur (tutoiement, phrases courtes, un avis, une anecdote). Elle ne répète pas les images : elle dit ce qu'elles ne disent pas. Pas de liste à puces ni d'émojis en rafale ; un « 👇 » au plus.
- **Images** : une idée par image, 2 phrases au plus. La couverture doit se comprendre en vignette (titre en haut, gros).
- **Vrai** : rien que l'appli ne fasse (vérifier dans le README), règles de Magic vérifiées. Les cartes : vraies images, jamais recadrées ; la mention de la Fan Content Policy reste sur la dernière image ; jamais le logo Magic. Ni Archidekt ni EDHREC cités (comme les vidéos).
- **Grille** : la couverture est rognée en 3:4 sur le profil (≈ 34 px de chaque côté) : rien d'important au bord.
- Idées de suite : d'autres « Devine la carte » (copier `07-devine-la-carte.mjs`), Standard au compteur de vie, l'échange en direct en détail, la carte joueur QR pour les soirées sans réseau, les cartes qui ont le plus monté du mois, une extension qui sort (masterset).
