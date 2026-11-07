// Nouveau post : node tools/insta/rendu.mjs --nouveau=<nn-sujet> copie ce fichier dans posts/. Champs et gabarits : tools/insta/LISEZMOI.md.
export default {
  id: '__ID__',
  titre: 'Titre du post (pour l\'index, pas affiché)',
  resume: 'Une phrase : de quoi parle le post, pour qui.',
  type: 'Astuces',      // Astuces · Règles · Jeu · Fonction · Guide · Présentation
  quand: 'Semaine N',
  diapos: [
    { g: 'couverture', kicker: 'Série', titre: 'Le titre, avec un *mot en foil*', sous: 'Une ligne qui donne envie de glisser', visuel: { tel: { ecran: 'accueil' } } },
    { g: 'ecran', kicker: 'Série', num: '1', titre: 'Un point', texte: 'Deux phrases au plus.', tel: { ecran: 'collection' } },
    { g: 'fin' },
  ],
  legende: `Première ligne : l'accroche, seule visible avant « plus ».

Ce que les images ne disent pas. Écrit comme à un pote.`,
  hashtags: ['#mtg', '#magicthegathering', '#mtgfrance'],
  commentaire: 'Une question simple.',
  alt: ['Couverture : …', 'Diapo 2 : …', 'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.'],
  publication: ['Conseil de publication.'],
};
