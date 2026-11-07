// Règles : les brackets Commander (Wizards, mise à jour du 9 février 2026 : src/brackets.js, docs/deckbuilder/recherche.md § 4.2 et 4.3), puis le Coach.
export default {
  id: '10-brackets-commander',
  titre: 'Les brackets Commander en 1 minute',
  resume: 'Post « règles » : les 5 brackets officiels (noms de l\'appli), les quatre lignes qui les séparent (Game Changers, destruction de terrains, tours supplémentaires, combos à 2 cartes), à quoi ça sert, et le bracket estimé par le Coach.',
  type: 'Règles',
  quand: 'Semaine 4, jeudi',
  diapos: [
    { g: 'couverture', kicker: 'Règles · Commander', titre: 'Les brackets *en 1 minute*', sous: 'Le système de Wizards pour dire le niveau de son deck avant de mélanger', sousL: 640,
      visuel: { cartes: [{ scry: 'Rhystic Study' }, { scry: 'Demonic Tutor' }, { scry: 'Cyclonic Rift' }], x: 150, y: 640, l: 340, ecart: 250, angle: 10 }, glisse: false },
    { g: 'rangs', kicker: 'Règles · Commander', titre: 'Cinq niveaux', y: 290, rangs: [
      ['1', '#f8f6d8', 'Décontracté', 'Exhibition', 'Le thème avant tout. Parties de 9 tours et plus.'],
      ['2', '#86d79c', 'Préconstruit', 'Core', 'Le niveau d\'un deck du commerce. 8 tours et plus.'],
      ['3', '#9cc3ff', 'Amélioré', 'Upgraded', 'Bien huilé, jusqu\'à 3 Game Changers. 6 tours et plus.'],
      ['4', '#ff9a7e', 'Optimisé', 'Optimized', 'Plus de limite, à part les cartes bannies.'],
      ['5', '#c79bff', 'Compétitif', 'cEDH', 'Le meilleur deck possible, méta de tournoi.'],
    ] },
    { g: 'etapes', kicker: 'Règles · Commander', titre: 'Les *4 lignes* qui les séparent', y: 340, mini: true, etapes: [
      ['Les Game Changers', 'Une liste officielle de 53 cartes (Étude rhystique, Précepteur diabolique, Faille cyclonique…). Aucune en 1 et 2, trois au plus en 3.', '1'],
      ['Détruire les terrains', 'La destruction massive de terrains : interdite jusqu\'au bracket 3.', '2'],
      ['Les tours supplémentaires', 'Aucun en 1, jamais enchaînés en 2 et 3.', '3'],
      ['Les combos à 2 cartes', 'Interdits en 1 et 2. En 3, pas avant le tour 6.', '4'],
    ] },
    { g: 'texte', kicker: 'Règles · Commander', titre: 'Ce n\'est pas *une note*', texte: 'Un bracket, c\'est une phrase à dire avant la partie : « mon deck est un 3 ». Le but, c\'est que quatre decks d\'un même niveau se retrouvent à la même table.\n\nUn deck 2 bien joué peut battre un 3. Ce qui compte, c\'est que personne ne se fasse rouler dessus au tour 4 sans l\'avoir vu venir.',
      pastilles: [{ t: '« Mon deck est un **3** »', x: 330, y: 1100, rot: -3, c: 'a' }] },
    { g: 'etapes', kicker: 'Règles · Commander', titre: 'Le Coach *estime le tien*', texte: 'D\'après ta liste, dans l\'aperçu du deck.', y: 470, mini: true, etapes: [
      ['Il compte tes Game Changers', 'Et te dit lesquels font monter le deck d\'un cran.', '1'],
      ['Il repère le reste', 'Destruction de terrains, tours supplémentaires, combos à 2 cartes.', '2'],
      ['Il construit au bon niveau', 'Choisis le bracket au départ : il respecte ses règles.', '3'],
    ] },
    { g: 'fin' },
  ],
  legende: `« Il est à quel niveau ton deck ? » « Euh… moyen ? » On a tous eu cette conversation.

Les brackets, c'est la réponse de Wizards à ça : cinq niveaux, et quatre critères clairs pour savoir où tu tombes. C'est pas parfait, mais ça évite pas mal de parties à sens unique.

Les règles changent de temps en temps (la dernière mise à jour date de février), je garde l'appli à jour.`,
  hashtags: ['#commander', '#edh', '#mtg', '#mtgfrance', '#cedh'],
  commentaire: 'Ton deck préféré, il est à quel bracket ? Sois honnête.',
  alt: [
    'Couverture : « Les brackets en 1 minute », trois Game Changers en éventail : Étude rhystique, Précepteur diabolique, Faille cyclonique.',
    'Les cinq brackets : décontracté, préconstruit, amélioré, optimisé, compétitif, avec le nombre de tours attendu.',
    'Les quatre critères : Game Changers, destruction massive de terrains, tours supplémentaires, combos à 2 cartes.',
    'Le bracket n\'est pas une note : c\'est une phrase à dire avant la partie.',
    'Le Coach de Mana Orbit estime le bracket d\'un deck et construit au niveau choisi.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Règles du 9 février 2026 (src/brackets.js). Si Wizards les change, mettre à jour ce post avant de le republier.',
    'Les noms français (Décontracté, Préconstruit…) sont ceux de l\'appli ; les noms officiels anglais sont à côté.',
  ],
};
