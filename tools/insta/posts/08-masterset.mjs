// Fonction : le masterset (README › Masterset).
export default {
  id: '08-masterset',
  titre: 'Compléter une extension carte par carte',
  resume: 'Post « fonction » pour les collectionneurs : la grille de l\'extension (possédées en couleur, manquantes en gris, prix de chacune), ce qu\'il reste à payer, et les options (foil, variantes, souhaits).',
  type: 'Fonction',
  quand: 'Semaine 3, samedi (ou la semaine d\'une sortie d\'extension)',
  diapos: [
    { g: 'couverture', kicker: 'Masterset', titre: 'Compléter une extension, *carte par carte*', sous: 'Pour ceux qui veulent tout le set, dans l\'ordre', sousL: 500,
      visuel: { tel: { ecran: 'masterset', x: 560, y: 600, l: 470, rot: 6 } } },
    { g: 'ecran', kicker: 'Masterset', num: '1', titre: 'En couleur ce que tu as, *en gris ce qui manque*', texte: 'Toutes les cartes de l\'extension dans l\'ordre des numéros, avec le prix de chacune.',
      tel: { ecran: 'masterset', ty: 200 }, loupes: [{ crop: [0, 440, 984, 520], x: 70, y: 860, l: 940, rot: -2 }] },
    { g: 'chiffre', kicker: 'Masterset', gros: '87 €', taille: 290, titre: 'Ce qu\'il te *reste* à payer', texte: 'En haut de la grille : « il te manque ≈ 87 € · l\'édition complète ≈ 399 € ». Tu sais où tu en es.',
      cartes: [{ scry: 'Bloodline Keeper', gris: true }, { scry: 'Anointed Procession', gris: true }, { scry: 'Exquisite Blood', gris: true }], eventail: { x: 110, y: 830, l: 300, ecart: 270, angle: 8 } },
    { g: 'etapes', kicker: 'Masterset', titre: 'Les options *des complétistes*', y: 370, mini: true, etapes: [
      ['Version foil aussi', 'Chaque carte en double, normale et foil côte à côte.', 'W'],
      ['Les variantes', 'Vitrine, sans bordure, illustration étendue : à la suite de la base.', 'U'],
      ['Souhaiter les manquantes', 'Toutes d\'un coup dans ta liste de souhaits, avec l\'illustration de cette édition.', 'B'],
      ['Le prix des manquantes', 'Toute la liste chiffrée en un appui.', 'R'],
    ] },
    { g: 'carte', kicker: 'Masterset', titre: 'Une carte *sans édition* ?', texte: 'Un petit ⚠ le signale dans la grille. Tu ouvres la carte, l\'appli demande « est-ce celle-ci ? », un appui pose la bonne édition.',
      carte: { scry: 'Vampire Nighthawk' }, x: 300, y: 560, l: 460, rot: -4, pastilles: [{ t: '⚠ **Est-ce celle-ci ?**', x: 420, y: 1150, rot: -3 }] },
    { g: 'fin' },
  ],
  legende: `Les collectionneurs vont comprendre : il manque toujours cinq cartes, et c'est toujours les cinq plus chères.

La grille de l'extension montre tout dans l'ordre, ce que t'as en couleur, le reste en gris, avec le prix de chaque trou. Et en haut, combien il reste à mettre pour finir.

Ça marche avec n'importe quelle extension papier, même une que t'as pas encore commencée.`,
  hashtags: ['#mtg', '#mtgcollection', '#mtgcollector', '#mtgfrance', '#magicthegathering'],
  commentaire: 'C\'est quoi l\'extension que tu rêverais de compléter ?',
  alt: [
    'Couverture : « Compléter une extension, carte par carte », téléphone ouvert sur la grille Commander Masters.',
    'La grille de l\'extension : cartes possédées en couleur, cartes manquantes en noir et blanc, numéro et prix sous chaque carte.',
    'Ce qu\'il reste à payer : il manque environ 87 €, l\'édition complète vaut environ 399 €, avec trois cartes manquantes en noir et blanc.',
    'Les options : foil aussi, variantes, souhaiter les manquantes, prix des manquantes.',
    'Une carte sans édition (Faucon de nuit vampire) est signalée dans la grille et se corrige en un appui.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Bon moment : la semaine d\'une sortie d\'extension, quand tout le monde ouvre des boosters.',
  ],
};
