#!/bin/bash
# Lance les tests UN PAR UN (ports fixes : jamais en parallèle). Usage : bash run-tests.sh [fichier.mjs …]  (sans argument : tout ; --node : sans navigateur)
# Résumé dans tests/run-tests.out, log de chaque test dans tests/logs/<test>.txt. Code retour 1 si un test échoue.
# Lancé depuis la racine du dépôt (les tests lancent « node proxy.mjs » et lisent deck-deal.html). Un nouveau test s'ajoute ici : la CI lance ces listes.
cd "$(dirname "$0")/.." || exit 1
mkdir -p tests/logs; : > tests/run-tests.out
NODE=(test.mjs test-i18n-langs.mjs test-prices.mjs test-hist.mjs test-trade.mjs test-cloud.mjs test-jobs.mjs test-proxy.mjs test-push.mjs test-alerts.mjs test-fcm.mjs test-edh-gen.mjs test-intl.mjs test-android-xml.mjs test-pubdecks.mjs test-amis.mjs test-troc.mjs test-partie.mjs test-partie-srv.mjs smoke.mjs
  test-import.mjs test-admin.mjs test-scanfoot.mjs test-scanart.mjs test-scansym.mjs test-places.mjs test-scanreport.mjs test-progress.mjs test-badgeart.mjs test-daily.mjs test-blueprints.mjs test-discord-setup.mjs test-discord-srv.mjs test-discord-gw.mjs test-discord-daily.mjs test-discord-cmd.mjs test-discord-roles.mjs test-discord-sets.mjs test-discord-deck.mjs test-discord-forum.mjs test-discord-dm.mjs test-qrcodes.mjs)
BROWSER=(
  ui-e2e.mjs cm-e2e.mjs i18n-e2e.mjs list-e2e.mjs value-e2e.mjs frcat-e2e.mjs alerts-e2e.mjs dklist-e2e.mjs back-e2e.mjs
  lang-e2e.mjs art-e2e.mjs edition-e2e.mjs colled-e2e.mjs search-e2e.mjs scaned-e2e.mjs scanfoot-e2e.mjs scanlot-e2e.mjs scanasia-e2e.mjs scanapk-e2e.mjs partiestats-e2e.mjs progress-e2e.mjs scanart-e2e.mjs scansym-e2e.mjs scanauto-e2e.mjs migrate-e2e.mjs lot-e2e.mjs mobscan-e2e.mjs warm-e2e.mjs viewer-e2e.mjs zoom-e2e.mjs builder-e2e.mjs coll-e2e.mjs extras-e2e.mjs edh-e2e.mjs
  frnames-e2e.mjs prix-e2e.mjs pwa-e2e.mjs sw-e2e.mjs push-client-e2e.mjs push-native-e2e.mjs sync-e2e.mjs e2e-account.mjs scan-e2e.mjs ads-e2e.mjs live-e2e.mjs trade-e2e.mjs motion-e2e.mjs widget-e2e.mjs content-e2e.mjs perf-e2e.mjs intl-e2e.mjs names-de-e2e.mjs rules-test.mjs
  sharedeck-e2e.mjs de-e2e.mjs
  natshare-e2e.mjs
  gate-e2e.mjs
  splash-e2e.mjs
  scanlang-e2e.mjs
  scanall-e2e.mjs
  pubdecks-e2e.mjs
  partage-e2e.mjs
  binder-e2e.mjs
  opening-e2e.mjs
  amis-e2e.mjs
  troc-e2e.mjs
  tour-e2e.mjs
  admin-e2e.mjs
  lectures-e2e.mjs
  places-e2e.mjs
  cardsheet-e2e.mjs
  partie-ui-e2e.mjs
  partie-room-e2e.mjs
  partie-live-e2e.mjs
  partie-qr-e2e.mjs
  partie-duo-e2e.mjs
  menus-e2e.mjs
  applink-e2e.mjs
  apkupd-e2e.mjs
  scanreport-e2e.mjs
  scansess-e2e.mjs
  daily-e2e.mjs
  daily-push-e2e.mjs
  masterset-e2e.mjs
  collowner-e2e.mjs
  discord-e2e.mjs
  discord-cmd-e2e.mjs
  discord-deck-e2e.mjs
  avis-e2e.mjs
  alerts-dm-e2e.mjs
)
T=("$@")
if [ ${#T[@]} -eq 0 ]; then T=("${NODE[@]}" "${BROWSER[@]}"); elif [ "$1" = --node ]; then T=("${NODE[@]}"); fi
fail=0
for t in "${T[@]}"; do
  # node:test : sortie dès le dernier test fini (même code retour) ; une poignée restée ouverte (une fois sur la CI, test-daily : 21 tests passés) gardait sinon le processus jusqu'au timeout
  f=(); grep -q "from 'node:test'" "tests/$t" && f=(--test-force-exit)
  to=420; [ "$t" = menus-e2e.mjs ] && to=900      # tour de l'interface : 4 passes × 48 écrans
  s=$(date +%s); timeout $to node "${f[@]}" "tests/$t" > "tests/logs/$t.txt" 2>&1; rc=$?
  echo "$t rc=$rc $(( $(date +%s)-s ))s" | tee -a tests/run-tests.out
  # Échec : la fin du log s'affiche aussi (lisible directement dans le journal de la CI, sans télécharger l'artefact).
  if [ $rc -ne 0 ]; then fail=$((fail+1)); tail -n 30 "tests/logs/$t.txt" | sed 's/^/    │ /'; fi
done
echo "FIN (échecs : $fail)" | tee -a tests/run-tests.out
[ $fail -eq 0 ]
