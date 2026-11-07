// Fonction : idées de decks comparées à la collection, ce qu'il manque, le Coach.
export default {
  id: '06-decks-a-monter',
  titre: 'Le deck Commander que tu as déjà presque',
  resume: 'Post « fonction » : les decks les plus joués comparés à ta collection (cartes possédées, à acheter, prix), les trois budgets, puis le Coach (note, catégories, bracket, échanges).',
  type: 'Fonction',
  quand: 'Semaine 3, lundi',
  diapos: [
    { g: 'couverture', kicker: 'Decks Commander', titre: 'Le deck que tu as *déjà presque*', sous: 'Ta collection comparée aux decks les plus joués', sousL: 500,
      visuel: { tel: { ecran: 'decks', x: 560, y: 590, l: 470, rot: 6 } } },
    { g: 'ecran', kicker: 'Decks Commander', num: '1', titre: 'Commandant par commandant', texte: 'Pour chaque deck : les cartes que tu as déjà, celles qui manquent, et ce que coûte le reste au prix du jour.',
      tel: { ecran: 'decks' }, loupes: [{ crop: [0, 270, 984, 360], x: 70, y: 820, l: 940, rot: -2 }] },
    { g: 'ecran', kicker: 'Decks Commander', num: '2', titre: 'Le reste, *chiffré*', texte: 'La liste complète et le total à acheter. Tu sais combien ça coûte avant de commander quoi que ce soit.',
      tel: { ecran: 'deck' }, pastilles: [{ t: 'à acheter **≈ 204 €**', x: 120, y: 1000, rot: -4 }] },
    { g: 'rangs', kicker: 'Decks Commander', titre: 'Le même plan, *trois budgets*', texte: 'Selon ce que tu veux mettre dedans :', y: 470, rangs: [
      ['€', '#86d79c', 'Budget', '', 'Les cartes qui font le travail, sans les plus chères.'],
      ['€€', '#9cc3ff', 'Moyen', '', 'Le deck tel qu\'on le croise le plus souvent.'],
      ['€€€', '#ffd479', 'Premium', '', 'Les meilleures cartes du thème, prix compris.'],
    ] },
    { g: 'etapes', kicker: 'Decks Commander', titre: 'Et ton deck à toi : *le Coach*', texte: 'Dans l\'aperçu de n\'importe quel deck Commander.', y: 470, mini: true, etapes: [
      ['Une note sur 100', 'Et une phrase : « Solide, il manque des tuteurs ».', '1'],
      ['Ce qui manque, par catégorie', 'Terrains, rampe, pioche, retraits, balayages : face à ce que jouent des milliers de decks.', '2'],
      ['Le bracket estimé', 'Game Changers, combos à 2 cartes, tours supplémentaires repérés dans ta liste.', '3'],
      ['Des échanges conseillés', 'Ta collection d\'abord, avec le pourquoi de chaque échange.', '4'],
    ] },
    { g: 'fin' },
  ],
  legende: `Il y a de bonnes chances que t'aies déjà les deux tiers d'un deck Commander qui dort dans tes classeurs.

L'appli compare ta collection aux listes les plus jouées pour chaque commandant, et te sort ce qu'il te manque avec le prix. C'est comme ça qu'on découvre qu'un Edgar Markov qu'on croyait hors de prix ne demande plus que dix cartes.

Et pour les decks que t'as déjà, le Coach donne une note et dit où ça coince.`,
  hashtags: ['#commander', '#edh', '#mtg', '#mtgfrance', '#edhdeck'],
  commentaire: 'Ton prochain commandant, c\'est qui ?',
  alt: [
    'Couverture : « Le deck que tu as déjà presque », téléphone ouvert sur les idées de decks de Mana Orbit.',
    'Les decks Edgar Markov avec le nombre de cartes possédées et le prix de celles à acheter.',
    'La liste d\'un deck avec sa valeur et le total à acheter.',
    'Trois budgets pour un même commandant : budget, moyen, premium.',
    'Le Coach : une note sur 100, les catégories qui manquent, le bracket estimé, des échanges conseillés.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Si tu as monté un deck grâce à cette fonction, le dire dans la légende à la place de l\'exemple d\'Edgar Markov : une vraie histoire marche mieux.',
  ],
};
