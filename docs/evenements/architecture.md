# Événements saisonniers : architecture

Moteur générique + un « pack » par fête. Premier pack : **Halloween 2026** (chasse aux citrouilles, 25 octobre → 8 novembre 2026).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/evpacks.js` | Packs (données pures) : dates (Pâques compris), objets, quota, palette, textes, badges, messages Discord ; catalogue des cachettes (`EV_SPOTS`) ; calendrier (`evActive`, `evDay`, `evUpcoming`…). Lu tel quel par le serveur (`createRequire`). |
| `src/event.js` | Moteur côté appli : calendrier reçu du serveur, chasse (cachettes, envol, compteur, messages), carte de l'accueil, message d'arrivée, interrupteur « Décorations de fête », badges (`progress.js`), progression (appareil + `users/{uid}/meta/events`). |
| `src/evart.js` | Dessins des objets à trouver (citrouille…) et du compteur. |
| `src/evamb.js` + `src/css/ev-<pack>.css` | Ambiance d'un pack (fond, brume, chauves-souris, toiles…) : `EV_AMB[pack]()` → balisage, styles sous `html[data-event="<pack>"]`. |
| `src/evlogo.js` | Logo de l'appli aux couleurs de chaque fête (symbole SVG, même `viewBox` que `#i-logo`). |
| `src/css/event.css` | Styles du moteur (objets, envol, compteur, messages, carte, arrivée, bordure du grade ultime). |
| `event-srv.mjs` | Moteur côté serveur (chargé par `proxy.mjs`) : calendrier, `/api/event…`, cachettes du jour signées, quota, progression, statistiques et interrupteur de `/admin`. |
| `discord-events.mjs` | Annonces Discord (`#annonces`) : J-3, J0, mi-parcours, J-1, fin. |
| `tools/gen-event-badges.mjs` | Générateur des badges d'une édition (fond fixe par fête + année en tracés SVG), lancé par `.github/workflows/event-badges.yml`. |
| `tools/make-event-logos.mjs` | Logos d'appli par fête (SVG + PNG). |

## Contrats

### Ambiance (`EV_AMB`)
- `EV_AMB[pack]()` → chaîne HTML posée une fois dans `<div class="ev-amb" aria-hidden="true">` (enfant de `<body>`, derrière l'appli : `z-index` 0, `pointer-events: none`).
- Classes posées par le moteur sur `<html>` : `data-event="<pack>"` (fête en cours, toujours, même décorations coupées : palette des objets),
  `.ev-deco` (décorations allumées : ambiance et palette de l'appli), `.ev-quiet` (écran où rien ne doit bouger ni s'afficher : scan, échange en direct,
  compteur de vie → ambiance cachée), `.ev-pause` (appli en arrière-plan ou ambiance hors écran : animations en pause).
- Uniquement `transform` et `opacity` animés, peu de particules, clair **et** sombre (`prefers-color-scheme` et `html[data-theme]` comme `style.css`),
  « réduire les animations » : rien ne bouge (décor fixe).

### Fichiers servis
- Badges : `pwa/icons/events/badges/<édition>-<palier>.svg` (palier 0 à 3 : seuils `badge.tiers` du pack), servis en `/icons/events/badges/…`.
- Logos : `pwa/icons/events/<pack>/` : `icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`, `discord-512.png`, `social-1200x630.png` ; sources dans `docs/evenements/logos/<pack>/`.
- `proxy.mjs` sert tout fichier existant de `pwa/icons/events/` (liste construite au démarrage, aucun chemin pris dans l'URL).

### Serveur (`event-srv.mjs`)
- `/__ping` › `event` : `{ id, pack, from, to, day } | null` (édition en cours, `EVENT=0` : null ; `EVENT_FORCE=<id>` : forcée).
- `GET /api/event?c=<capacités>` (jeton Firebase facultatif, `x-event-device`) → `{ on, ev, now, next, me: { n, day, found, spots: [{ s, t }], left, jours, sig }, dev? }`.
- `POST /api/event/claim { ev, day, s, t, n? }` → `{ ok, n, found, left, sig }` ; refus : `bad_token` (403), `wrong_day` (410), `day_quota` (409), `no_event` (404).
- `POST /api/event/sync { ev, jours, sig }` (compte) : progression relue depuis Firestore (reçus signés) quand le serveur l'a perdue.
- `POST /api/event/merge { ev }` (compte + appareil) : la progression sans compte de cet appareil rejoint le compte (une seule fois, jamais vers un 2e compte).
- `GET /api/event/board?ev=` : chasseurs, à 30/30, top des pseudos publics.
- `GET /api/admin/events` · `POST /api/admin/events/switch { id, on }` : statistiques et interrupteur à chaud.

### Discord (`discord-events.mjs`)
- `evDscMake(h)` (helpers de `discordMake`, comme `dscDailyMake`) → `{ tick({ now, stats, off }) }` : appelé chaque minute par `proxy.mjs` ;
  `stats(id)` → `{ hunters, full, top: [{ n, c }] }`, `off()` → identifiants coupés. État dans `ADMIN_DIR/discord-events.json`.
