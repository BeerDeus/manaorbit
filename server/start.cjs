// Point d'entrée du serveur (Hostinger › Fichier d'entrée : server/start.cjs). CommonJS : certains hébergeurs chargent l'entry file avec require(),
// ce qui échoue (ERR_REQUIRE_ESM) sur un .mjs. import() fonctionne partout, Node ≥ 18.
// Dossier de travail ramené à la racine du dépôt : les modules du serveur y rangent .data/ par défaut, quel que soit le dossier d'où l'hébergeur lance Node.
process.chdir(require('node:path').join(__dirname, '..'));
import('./proxy.mjs').catch(err => {
  console.error('Mana Orbit : démarrage impossible\n', err);
  process.exit(1);
});
