// Astuces du scan : réglages qu'on ne regarde jamais (README › Scan des cartes).
export default {
  id: '02-scan-astuces',
  titre: '6 astuces pour scanner sa collection',
  resume: 'Post « astuces » : ce que le scan lit vraiment, le mode Auto, les foils, la langue, l\'alerte de prix pendant le scan, les cartes à vérifier. Utile aux nouveaux comme à ceux qui scannent déjà.',
  type: 'Astuces',
  quand: 'Semaine 1, mercredi',
  diapos: [
    { g: 'couverture', kicker: 'Astuces · Scan', titre: 'Scanner sa collection *sans y passer la nuit*', sous: '6 réglages du scan que presque personne ne touche', sousL: 560,
      visuel: { tel: { ecran: 'scan-6', x: 560, y: 620, l: 470, rot: 6 } } },
    { g: 'carte', kicker: 'Astuces · Scan', titre: 'Le nom, *rien que le nom*', texte: 'L\'appli lit la bande du titre et la compare au catalogue des cartes. Cadre le nom bien droit : le reste de la carte ne compte pas.',
      carte: { scry: 'Sol Ring', lang: 'fr', cadreNom: true }, x: 280, y: 520, l: 520, rot: -3 },
    { g: 'ecran', kicker: 'Astuces · Scan', num: '2', titre: 'Active le mode *Auto*', texte: 'La carte entre dès que deux lectures de suite donnent le même nom. Tu poses, tu retires, la suivante. Délai réglable : 0,5, 1 ou 1,5 s.',
      tel: { ecran: 'scan-6', y: 720, ty: 700 }, loupes: [{ crop: [770, 1360, 214, 200], x: 700, y: 900, l: 300, rot: 3 }] },
    { g: 'carte', kicker: 'Astuces · Scan', titre: 'Un foil qui *brille trop* ?', texte: 'Si le nom est illisible, la ligne du bas prend le relais : extension et numéro retrouvent l\'impression exacte.',
      carte: { scry: 'Edgar Markov', lang: 'fr' }, x: 320, y: 520, l: 480, rot: 4,
      pastilles: [{ t: '← extension · n° · **langue**', x: 470, y: 1190, rot: -3, c: 'a' }, { t: 'Nom illisible', x: 110, y: 600, rot: -4, c: 'r' }] },
    { g: 'ecran', kicker: 'Astuces · Scan', num: '4', titre: 'Un lot mélangé ? *Laisse Auto*', texte: 'Chaque carte garde sa langue, lue sur la carte. Une boîte entière en japonais : impose la langue dans les réglages, c\'est plus sûr.',
      tel: { ecran: 'scan-6', y: 720, ty: 820 }, loupes: [{ crop: [0, 1010, 984, 360], x: 90, y: 860, l: 900, rot: -2 }] },
    { g: 'chiffre', kicker: 'Astuces · Scan', gros: '10 €', taille: 300, titre: 'Une alerte *pendant le scan*', texte: 'Mets un montant dans les réglages : chaque carte qui vaut plus s\'annonce à l\'écran, et tu la mets de côté. Idéal pour trier un carton de bulk.', mana: 'R' },
    { g: 'rangs', kicker: 'Astuces · Scan', titre: 'Rien n\'entre *sans toi*', texte: 'Selon la ressemblance entre ta photo et la carte trouvée :', y: 470, rangs: [
      ['✓', '#6fd08c', 'Ajoutée', 'à partir de 84 %', 'Tu la vois dans la liste avec sa miniature.'],
      ['?', '#ffd479', 'À vérifier', 'de 72 à 84 %', 'Ta photo à côté de la carte proposée, tu valides d\'un appui.'],
      ['✎', '#ff8fc3', 'À saisir', 'en dessous', 'Tu tapes le début du nom, la carte rejoint le scan.'],
    ] },
    { g: 'fin', texte: 'Le scan tourne sur ton téléphone : tes photos ne sont pas enregistrées.' },
  ],
  legende: `Le scan, c'est la fonction que tout le monde utilise et dont personne n'ouvre les réglages. Petit tour de ce qui change vraiment la vie quand t'as 300 cartes à rentrer.

Mon préféré c'est l'alerte de prix : tu fixes 5 ou 10 €, tu scannes ton bulk, et l'appli te prévient quand une carte mérite d'être sortie du carton.

Et si t'as une astuce de scan à toi, je prends.`,
  hashtags: ['#mtg', '#magicthegathering', '#mtgfrance', '#mtgcollection', '#mtgbulk'],
  commentaire: 'Vous scannez plutôt carte par carte ou en mode Auto ?',
  alt: [
    'Couverture : « Scanner sa collection sans y passer la nuit », téléphone ouvert sur l\'écran de scan de Mana Orbit avec six cartes reconnues.',
    'Astuce 1 : la carte Anneau solaire, avec seulement la bande du nom entourée : c\'est elle que le scan lit.',
    'Astuce 2 : le mode Auto, interrupteur en bas à droite de l\'écran de scan.',
    'Astuce 3 : la carte Edgar Markov, avec la ligne du bas (extension, numéro, langue) qui retrouve l\'impression quand le nom est illisible.',
    'Astuce 4 : liste des cartes scannées, chacune avec le drapeau de sa langue.',
    'Astuce 5 : une alerte à 10 € pendant le scan pour repérer les cartes chères.',
    'Astuce 6 : les trois cas selon la ressemblance, ajoutée à partir de 84 %, à vérifier entre 72 et 84 %, à saisir en dessous.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Post à republier en story le lendemain (« Nouveau post »), c\'est le genre qu\'on enregistre.',
    'Si quelqu\'un demande l\'iPhone en commentaire : l\'appli web marche sur iPhone via manaorbit.app (le scan aussi, dans le navigateur).',
  ],
};
