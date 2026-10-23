// Mana Orbit — bot Discord : Carte mystère du jour annoncée et classement de la semaine dans #carte-mystère (aucune dépendance npm). Créé par discord-srv.mjs
// (discordMake → dscDailyMake, avec ses helpers : find, post, log…), appelé par daily-srv.mjs au tour de garde (o.announce, o.weekly), qui décide QUAND
// (une fois par jour ou par semaine, état gardé dans DAILY_DIR/discord-daily.json, nouvel essai si Discord échoue) ; ici seulement QUOI et OÙ. Testé par
// tests/test-discord-daily.mjs.
//   · announce({ day, no }) : « 🔮 Carte mystère n° 43 : une nouvelle carte t'attend ! » (FR + EN, lien vers le jeu, aucun indice), avec le ping du rôle
//     « 🔮 Carte mystère » (trouvé par son nom, emoji, accents et casse ignorés ; absent ou impossible à pinger : message sans ping) ; allowed_mentions : ce rôle seul ;
//   · weekly({ week, total, rows, hour, tz }) : top 10 de la semaine (rang 🥇🥈🥉, pseudo, points, jours joués), nombre de joueurs classés, rappel que la dernière
//     carte se joue jusqu'à lundi 18 h et que le classement final est dans l'appli ; aucun ping (allowed_mentions vide).

/** Comparaison des noms (comme discord-srv.mjs) : sans accents ni casse. */
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
/** Nom d'un rôle comparé : plié, emoji et ponctuation retirés (« 🔮 Carte mystère » → « carte mystere »). */
export const dscRoleKey = s => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ROLE_NAMES = ['carte mystere', 'mystery card'];
/** Texte d'une ligne : sans caractère de contrôle ni de mise en forme invisible, espaces resserrés. */
const line = s => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Markdown de Discord neutralisé (pseudos affichés tels quels, jamais une mention). */
const md = s => String(s).replace(/[\\`*_~|>[\]()<@]/g, '\\$&');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MEDAL = ['🥇', '🥈', '🥉'];

/** Message de la nouvelle carte (info : { no }) ; role : id du rôle à pinger, ou '' ; game : lien vers le jeu. Aucun indice sur la carte. */
export function dscAnnounceMsg(info, role, game) {
  const no = Math.max(0, Math.floor(Number(info && info.no) || 0)), fr = no ? ` n° ${no}` : '', en = no ? ` #${no}` : '', r = /^\d{5,25}$/.test(String(role || '')) ? String(role) : '';
  const content = `${r ? `<@&${r}> ` : ''}🔮 **Carte mystère${fr} : une nouvelle carte t'attend !**\n🔮 **Mystery card${en}: a new card is waiting for you!**\n<${game}>`;
  return { content, allowed_mentions: r ? { parse: [], roles: [r] } : { parse: [] } };
}

/** Message du classement de la semaine (info : { week : lundi « AAAA-MM-JJ », total, rows : [{ r, n, s, d, x }] (top 10), hour, tz }) ; game : lien vers le jeu. */
export function dscWeeklyMsg(info, game) {
  const [, m, d] = String(info.week || '').split('-').map(Number), mi = Math.max(0, Math.min(11, (m || 1) - 1));
  const h = Math.max(0, Math.min(23, Math.floor(Number(info.hour ?? 18)) || 0)), paris = !info.tz || info.tz === 'Europe/Paris';
  const hEn = h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm', tzEn = paris ? 'Paris time' : line(info.tz).slice(0, 40);
  const num = v => Math.max(0, Math.round(Number(v) || 0)).toLocaleString('fr-FR'), total = Math.max(0, Math.floor(Number(info.total) || 0));
  const rows = (Array.isArray(info.rows) ? info.rows : []).slice(0, 10).map((x, i) => {
    const r = Math.max(1, Math.floor(Number(x.r) || i + 1)), n = x.x ? '*pseudo masqué · hidden name*' : `**${md(line(x.n || '?').slice(0, 24))}**`, dd = Math.max(1, Math.floor(Number(x.d) || 1));
    return `${MEDAL[r - 1] || `**${r}.**`} ${n} — ${num(x.s)} pts · ${dd} j`;
  });
  const content = [
    `🏆 **Carte mystère : classement de la semaine du ${d === 1 ? '1er' : d || '?'} ${MOIS[mi]}**`,
    `🏆 **Mystery card: leaderboard for the week of ${MONTHS[mi]} ${d || '?'}**`,
    '',
    ...rows,
    '',
    `${total} joueur${total > 1 ? 's' : ''} classé${total > 1 ? 's' : ''} · ${total} ranked player${total === 1 ? '' : 's'}`,
    `La dernière carte de la semaine se joue jusqu'à lundi ${h} h${paris ? '' : ` (${tzEn})`} : classement final dans l'appli.`,
    `The week's last card is open until Monday ${hEn} (${tzEn}): final leaderboard in the app.`,
    `<${game}>`,
    '-# pts : points · j : jours joués (days played) · comptes vérifiés seulement (verified accounts only)',
  ].join('\n');
  return { content: content.slice(0, 2000), allowed_mentions: { parse: [] } };
}

/** h : { on, find, post, log, dErr, TX, NEWS, P_MENTION, game } (helpers de discordMake). → { announce, weekly } : erreur levée si rien n'est parti (daily-srv.mjs réessaie). */
export function dscDailyMake(h) {
  const { find, post, log, dErr, TX, NEWS, P_MENTION, game } = h, W = { noRole: false, noPing: false };
  async function chan() {
    if (!h.on) throw dErr('setup', 'bot Discord non configuré');
    const r = await find(['carte-mystère'], [TX, NEWS]);
    if (!r.c) throw dErr('setup', 'salon #carte-mystère introuvable');
    return r;
  }
  /** Rôle « 🔮 Carte mystère » à pinger dans ce salon → id, sinon '' (absent, géré par un bot, ou non mentionnable sans la permission « Mentionner tous les rôles »). */
  function roleOf(d, c) {
    const r = (d.roles || []).find(x => x && x.id !== d.gid && !x.managed && ROLE_NAMES.includes(dscRoleKey(x.name)));
    if (!r) { if (!W.noRole) { W.noRole = true; log.warn('Discord : rôle « 🔮 Carte mystère » introuvable, annonce sans ping'); } return ''; }
    W.noRole = false;
    if (!r.mentionable && !d.can(c, P_MENTION)) { if (!W.noPing) { W.noPing = true; log.warn('Discord : rôle « 🔮 Carte mystère » non mentionnable et bot sans « Mentionner @everyone, @here et tous les rôles » dans #carte-mystère, annonce sans ping'); } return ''; }
    W.noPing = false;
    return String(r.id);
  }
  /** Nouvelle carte du jour annoncée (info : { day, no }). */
  async function announce(info) {
    const { d, c } = await chan(), role = roleOf(d, c);
    await post(c, `/channels/${c.id}/messages`, dscAnnounceMsg(info, role, game));
    log.log(`Discord : Carte mystère n° ${info.no} annoncée dans #carte-mystère${role ? ' (rôle pingé)' : ' (sans ping)'}.`);
    return true;
  }
  /** Classement de la semaine (info : { week, total, rows… }). */
  async function weekly(info) {
    const { c } = await chan();
    await post(c, `/channels/${c.id}/messages`, dscWeeklyMsg(info, game));
    log.log(`Discord : classement de la semaine du ${info.week} posté dans #carte-mystère (${info.total} joueur${info.total > 1 ? 's' : ''} classé${info.total > 1 ? 's' : ''}).`);
    return true;
  }
  return { announce, weekly };
}
