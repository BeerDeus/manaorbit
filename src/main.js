/* ── main.js : démarrage ─────────────────────────────────────────────────────────────────────── */
init();
navInit();
backInit();
if (typeof prgDay === 'function') setTimeout(() => { prgDay(); prgSoon(); }, 4000);      // niveau et badges (progress.js) : un jour d'utilisation, nouveaux paliers
