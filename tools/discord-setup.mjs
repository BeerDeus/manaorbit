// Serveur Discord de Mana Orbit, complet : réglages et mode communauté, rôles (équipe, langues, formats, notifications, comptes liés : discord-roles.mjs) rangés dans l'ordre, catégories « 『…』 »
// et salons avec leurs permissions (une catégorie par langue, visible avec le rôle de la langue), forums et leurs étiquettes, accueil (questions d'arrivée :
// langues, formats, notifications ; salons par défaut), écran des règles, AutoMod, messages (accueil, règles traduites dans chaque langue), webhooks GitHub,
// lien d'invitation permanent. Lancé sur le PC du propriétaire avec le jeton d'un bot à lui (docs/store/sortie.md § 2). Relancé, il ne crée rien en double :
// il complète et remet à jour (textes compris). Un serveur fait par l'ancienne version (Bienvenue, Appli, Communauté, Équipe) est repris tel quel : salons
// renommés et déplacés, messages et étiquettes gardés. Les salons qu'il ne connaît pas (bot de tickets…) ne sont jamais touchés.
// Jeton : variable d'environnement DISCORD_TOKEN seulement, jamais affiché ni écrit nulle part.
//   PowerShell : $env:DISCORD_TOKEN = "…" puis node tools/discord-setup.mjs          --dry : montre ce qui serait fait, sans rien changer
//   Bot présent sur plusieurs serveurs : node tools/discord-setup.mjs <identifiant du serveur>
// DISCORD_API : autre adresse de l'API (tests/test-discord-setup.mjs, faux Discord). Node 18 ou plus (fetch).
import { readFileSync, existsSync } from 'node:fs';
import { DSC_ROLE_DEFS } from '../discord-roles.mjs';      // rôles des comptes liés (Compte lié, paliers des badges) : mêmes noms et couleurs que le bot permanent

const API = (process.env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/$/, '');
const TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const ARGS = process.argv.slice(2), DRY = ARGS.includes('--dry'), GUILD_ARG = ARGS.find(a => /^\d{5,}$/.test(a)) || '';
const PLAY = 'https://play.google.com/store/apps/details?id=app.manaorbit', SITE = 'https://manaorbit.app';
const ICON = new URL('../pwa/icons/icon-512.png', import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bySnow = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);      // identifiants Discord (nombres en texte) dans l'ordre de création

// Permissions Discord (bits)
const B = n => 1n << BigInt(n);
const ADMIN = B(3), MANAGE_ROLES = B(28), VIEW = B(10), SEND = B(11), MANAGE_MSG = B(13), MENTION_ALL = B(17), MANAGE_THREADS = B(34), THREADS_PUB = B(35), THREADS_PRIV = B(36), SEND_THREADS = B(38);
const TEAM_PERMS = B(1) | B(2) | B(7) | MANAGE_MSG | MENTION_ALL | B(22) | B(24) | B(27) | MANAGE_THREADS | B(40);      // expulser, bannir, journal, gérer les messages, @everyone, rendre muet, déplacer, pseudos, gérer les fils, exclure temporairement
const SUPPORT_PERMS = MANAGE_MSG | MANAGE_THREADS | B(16) | SEND_THREADS;      // trier les forums (étiquettes, fils fermés), retirer un message, lire l'historique et répondre dans les fils (le bot a ce rôle : modération des fils depuis /admin)
const WRITE = SEND | THREADS_PUB | SEND_THREADS, RO_DENY = SEND | THREADS_PUB | THREADS_PRIV | SEND_THREADS, LANG_MOD = VIEW | WRITE | MANAGE_MSG | MANAGE_THREADS;
const TX = 0, VOICE = 2, CAT = 4, NEWS = 5, FORUM = 15, REQUIRE_TAG = 16;
const box = t => `『${t}』`, OLD_BOX = t => `╔ ${t} ╝`;      // ancien style des catégories : repris et renommé

let writes = 0;
async function api(method, path, body) {
  if (DRY && method !== 'GET') { writes++; console.log(`  (essai) ${method} ${path.split('?')[0]}`); return method === 'POST' ? { id: 'essai-' + writes, ...(body || {}) } : (body || null); }
  if (DRY && path.includes('/essai-')) return [];      // objet qui n'existerait qu'après une vraie création
  for (let i = 0; i < 6; i++) {
    const r = await fetch(API + path, { method, headers: { Authorization: 'Bot ' + TOKEN, 'User-Agent': 'DiscordBot (https://manaorbit.app, 1.0)', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 429) {      // limite de débit : on attend ce que Discord demande (renommer un salon : 2 fois par 10 min, d'où une attente possible au 1er lancement)
      const j = await r.json().catch(() => ({})), s = Number(j.retry_after) || 1;
      if (s > 5) console.log(`  … Discord demande d'attendre ${Math.ceil(s)} s`);
      await sleep(Math.ceil(s * 1000) + 50); continue;
    }
    if (r.status === 204) return null;
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* réponse non JSON */ }
    if (!r.ok) { const e = new Error(`${method} ${path.split('?')[0]} → ${r.status}${j && j.message ? ' ' + j.message : ''}${j && j.errors ? ' ' + JSON.stringify(j.errors).slice(0, 300) : ''}`); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  throw new Error(`${method} ${path} : refusé trop de fois (limite de débit)`);
}

// ── Langues ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Règles : {bugs}, {idees}, {carte} deviennent des liens vers les salons. Le français fait foi (dit en pied de chaque traduction).
const RULES = {
  fr: ['Respect : pas d\'insulte, de harcèlement ni de propos discriminatoires.',
    'Pas de spam, de pub ni d\'invitation vers un autre serveur sans accord de l\'équipe.',
    'Le bon salon : un bug dans {bugs}, une idée dans {idees}. Dans les salons d\'une langue, on écrit dans cette langue ; les autres salons acceptent toutes les langues.',
    'Échanges et ventes : entre membres, à vos risques ; Mana Orbit n\'est pas intermédiaire. Jamais de paiement « entre proches ».',
    'Pas de contenu NSFW ou piraté, de fausses cartes à vendre ni de fuite non officielle.',
    'Carte mystère ({carte}) : la réponse du jour toujours sous balise spoiler ||comme ça||.',
    'Ne donne jamais ton jeton CardTrader ni tes identifiants : l\'équipe ne te les demandera jamais.',
    'L\'équipe peut supprimer un message ou exclure sans préavis. Pour contester : ouvre un ticket.'],
  en: ['Be respectful: no insults, harassment or discrimination.',
    'No spam, ads or invites to other servers without the team\'s OK.',
    'Right channel: bugs in {bugs}, ideas in {idees}. In a language\'s channels, write in that language; other channels accept every language.',
    'Trades and sales are between members, at your own risk; Mana Orbit is not an intermediary. Never pay with "friends & family".',
    'No NSFW or pirated content, fake cards for sale or unofficial leaks.',
    'Mystery card ({carte}): always hide the day\'s answer in a spoiler ||like this||.',
    'Never share your CardTrader token or login: the team will never ask for them.',
    'The team may remove messages or members without notice. To appeal: open a ticket.'],
  de: ['Respekt: keine Beleidigungen, Belästigung oder Diskriminierung.',
    'Kein Spam, keine Werbung und keine Einladungen zu anderen Servern ohne Zustimmung des Teams.',
    'Der richtige Kanal: Bugs in {bugs}, Ideen in {idees}. In den Kanälen einer Sprache wird in dieser Sprache geschrieben; die anderen Kanäle nehmen alle Sprachen an.',
    'Tausch und Verkauf: zwischen Mitgliedern, auf eigenes Risiko; Mana Orbit ist kein Vermittler. Niemals per „Freunde & Familie“ bezahlen.',
    'Keine NSFW- oder Raubkopie-Inhalte, keine gefälschten Karten zum Verkauf, keine inoffiziellen Leaks.',
    'Mysterykarte ({carte}): die Lösung des Tages immer als Spoiler ||so||.',
    'Gib niemals deinen CardTrader-Token oder deine Zugangsdaten weiter: Das Team fragt nie danach.',
    'Das Team kann Nachrichten löschen oder Mitglieder ohne Vorwarnung entfernen. Einspruch: öffne ein Ticket.'],
  es: ['Respeto: nada de insultos, acoso ni discriminación.',
    'Nada de spam, publicidad ni invitaciones a otros servidores sin permiso del equipo.',
    'El canal correcto: los bugs en {bugs}, las ideas en {idees}. En los canales de un idioma se escribe en ese idioma; los demás canales aceptan todos los idiomas.',
    'Intercambios y ventas: entre miembros y bajo tu responsabilidad; Mana Orbit no es intermediario. Nunca pagues con «amigos y familiares».',
    'Nada de contenido NSFW o pirata, cartas falsas a la venta ni filtraciones no oficiales.',
    'Carta misteriosa ({carte}): la respuesta del día siempre en spoiler ||así||.',
    'Nunca compartas tu token de CardTrader ni tus datos de acceso: el equipo nunca te los pedirá.',
    'El equipo puede borrar mensajes o expulsar sin aviso. Para reclamar: abre un ticket.'],
  it: ['Rispetto: niente insulti, molestie o discriminazioni.',
    'Niente spam, pubblicità o inviti ad altri server senza l\'accordo del team.',
    'Il canale giusto: i bug in {bugs}, le idee in {idees}. Nei canali di una lingua si scrive in quella lingua; gli altri canali accettano tutte le lingue.',
    'Scambi e vendite: tra membri, a tuo rischio; Mana Orbit non fa da intermediario. Mai pagamenti «amici e familiari».',
    'Niente contenuti NSFW o pirata, carte false in vendita o leak non ufficiali.',
    'Carta misteriosa ({carte}): la risposta del giorno sempre sotto spoiler ||così||.',
    'Non condividere mai il tuo token CardTrader né le tue credenziali: il team non te li chiederà mai.',
    'Il team può eliminare messaggi o espellere senza preavviso. Per contestare: apri un ticket.'],
  pt: ['Respeito: nada de insultos, assédio ou discriminação.',
    'Nada de spam, publicidade ou convites para outros servidores sem o acordo da equipe.',
    'O canal certo: bugs em {bugs}, ideias em {idees}. Nos canais de um idioma, escreva nesse idioma; os outros canais aceitam todos os idiomas.',
    'Trocas e vendas: entre membros, por sua conta e risco; o Mana Orbit não é intermediário. Nunca pague como «amigos e família».',
    'Nada de conteúdo NSFW ou pirata, cartas falsas à venda ou vazamentos não oficiais.',
    'Carta mistério ({carte}): a resposta do dia sempre em spoiler ||assim||.',
    'Nunca compartilhe seu token CardTrader nem seus dados de login: a equipe nunca vai pedir.',
    'A equipe pode apagar mensagens ou expulsar sem aviso. Para contestar: abra um ticket.'],
  ru: ['Уважение: никаких оскорблений, травли и дискриминации.',
    'Никакого спама, рекламы и приглашений на другие серверы без согласия команды.',
    'Нужный канал: баги — в {bugs}, идеи — в {idees}. В каналах языка пишите на этом языке; остальные каналы принимают любой язык.',
    'Обмены и продажи — между участниками и на ваш риск; Mana Orbit не посредник. Никогда не платите переводом «друзьям и семье».',
    'Никакого NSFW и пиратского контента, поддельных карт на продажу и неофициальных утечек.',
    'Карта-загадка ({carte}): ответ дня — только под спойлером ||вот так||.',
    'Никогда не передавайте свой токен CardTrader и данные для входа: команда никогда их не попросит.',
    'Команда может удалить сообщение или исключить участника без предупреждения. Обжаловать — через тикет.'],
  ja: ['敬意を持って：侮辱、嫌がらせ、差別は禁止です。',
    'チームの許可なく、スパム、宣伝、他サーバーへの招待は禁止です。',
    '正しいチャンネルへ：バグは {bugs}、アイデアは {idees}。言語別チャンネルではその言語で書いてください。その他のチャンネルはどの言語でも大丈夫です。',
    'トレードと売買はメンバー同士、自己責任で。Mana Orbit は仲介しません。「友達・家族」送金での支払いは絶対にしないでください。',
    'NSFW・海賊版コンテンツ、偽造カードの販売、非公式リークは禁止です。',
    'ミステリーカード（{carte}）：その日の答えは必ずスポイラー ||このように|| で隠してください。',
    'CardTrader のトークンやログイン情報は絶対に共有しないでください。チームが求めることはありません。',
    'チームは予告なくメッセージを削除したり、メンバーを退出させたりできます。異議はチケットでどうぞ。'],
  ko: ['존중: 모욕, 괴롭힘, 차별 금지.',
    '팀의 허락 없는 스팸, 광고, 다른 서버 초대 금지.',
    '알맞은 채널: 버그는 {bugs}, 아이디어는 {idees}. 언어별 채널에서는 그 언어로 써 주세요. 다른 채널은 모든 언어를 받습니다.',
    '교환과 판매는 회원끼리, 본인 책임입니다. Mana Orbit은 중개하지 않습니다. "친구 및 가족" 송금으로는 절대 결제하지 마세요.',
    'NSFW·불법 복제 콘텐츠, 가짜 카드 판매, 비공식 유출 금지.',
    '미스터리 카드({carte}): 그날의 정답은 항상 스포일러 ||이렇게|| 로 가려 주세요.',
    'CardTrader 토큰이나 로그인 정보를 절대 공유하지 마세요. 팀은 절대 요구하지 않습니다.',
    '팀은 예고 없이 메시지를 삭제하거나 회원을 내보낼 수 있습니다. 이의 제기: 티켓을 열어 주세요.'],
  zhs: ['尊重他人：禁止辱骂、骚扰和歧视。',
    '未经团队同意，禁止刷屏、广告和其他服务器的邀请链接。',
    '选对频道：bug 发到 {bugs}，想法发到 {idees}。语言频道里请使用该语言；其他频道接受所有语言。',
    '交换和买卖仅限成员之间，风险自负；Mana Orbit 不做中间人。切勿使用「亲友付款」。',
    '禁止 NSFW 和盗版内容、出售假卡以及非官方泄露。',
    '神秘卡牌（{carte}）：当天的答案务必用剧透标记 ||像这样|| 隐藏。',
    '切勿分享你的 CardTrader 令牌或登录信息：团队绝不会向你索要。',
    '团队可不经通知删除消息或移除成员。如有异议：请开工单。'],
  zht: ['尊重他人：禁止辱罵、騷擾和歧視。',
    '未經團隊同意，禁止洗版、廣告和其他伺服器的邀請連結。',
    '選對頻道：bug 發到 {bugs}，想法發到 {idees}。語言頻道裡請使用該語言；其他頻道接受所有語言。',
    '交換和買賣僅限成員之間，風險自負；Mana Orbit 不做中間人。切勿使用「親友付款」。',
    '禁止 NSFW 和盜版內容、販售假卡以及非官方洩漏。',
    '神秘卡牌（{carte}）：當天的答案務必用暴雷標記 ||像這樣|| 隱藏。',
    '切勿分享你的 CardTrader 權杖或登入資訊：團隊絕不會向你索取。',
    '團隊可不經通知刪除訊息或移除成員。如有異議：請開工單。'],
};
// Texte de chaque langue : titre des règles, pied (« le français fait foi »), bienvenue, changer de langues (<id:customize> : « Salons et rôles » de Discord)
const L10N = {
  fr: { title: 'Règles du serveur' },
  en: { title: 'Server rules', foot: 'If in doubt, the French version prevails.' },
  de: { title: 'Serverregeln', foot: 'Im Zweifel gilt die französische Fassung.', hello: 'Willkommen im deutschsprachigen Bereich von Mana Orbit! 👋', change: 'Sprachen und Rollen ändern' },
  es: { title: 'Normas del servidor', foot: 'En caso de duda, prevalece la versión francesa.', hello: '¡Bienvenido/a a la zona en español de Mana Orbit! 👋', change: 'Cambiar idiomas y roles' },
  it: { title: 'Regole del server', foot: 'In caso di dubbio, fa fede la versione francese.', hello: 'Benvenuto/a nella zona italiana di Mana Orbit! 👋', change: 'Cambia lingue e ruoli' },
  pt: { title: 'Regras do servidor', foot: 'Em caso de dúvida, vale a versão francesa.', hello: 'Bem-vindo/a à área em português do Mana Orbit! 👋', change: 'Mudar idiomas e cargos' },
  ru: { title: 'Правила сервера', foot: 'В случае сомнений действует французская версия.', hello: 'Добро пожаловать в русскоязычный раздел Mana Orbit! 👋', change: 'Сменить языки и роли' },
  ja: { title: 'サーバールール', foot: '疑義がある場合はフランス語版が優先されます。', hello: 'Mana Orbit の日本語エリアへようこそ！👋', change: '言語とロールの変更' },
  ko: { title: '서버 규칙', foot: '해석에 차이가 있을 경우 프랑스어판이 우선합니다.', hello: 'Mana Orbit 한국어 공간에 오신 것을 환영합니다! 👋', change: '언어와 역할 변경' },
  zhs: { title: '服务器规则', foot: '如有疑问，以法语版本为准。', hello: '欢迎来到 Mana Orbit 中文区！👋', change: '更改语言和身份组' },
  zht: { title: '伺服器規則', foot: '如有疑義，以法語版本為準。', hello: '歡迎來到 Mana Orbit 中文區！👋', change: '變更語言和身分組' },
};
// Une catégorie par langue. fr et en : discussion, entraide et vocal (les règles sont dans #règles, en français et en anglais) ;
// les autres : leurs règles traduites et une discussion. was : ancien salon repris (renommé et déplacé, messages gardés).
const LANGS = [
  { k: 'fr', role: 'Français', emoji: '🇫🇷', cat: '🇫🇷 FRANÇAIS', mod: 'Modo FR', chans: [
    { name: '💬・général', topic: 'Discussion en français : Magic et Mana Orbit', was: [c => c.type === TX && /^g[eé]n[eé]ral$/i.test(c.name)] },
    { name: '🆘・entraide', topic: 'Entraide en français : règles du jeu, decks, l\'appli' }, { name: '🔊 Vocal FR', type: VOICE }] },
  { k: 'en', role: 'English', emoji: '🇬🇧', cat: '🇬🇧 ENGLISH', mod: 'Modo EN', chans: [
    { name: '💬・general', topic: 'English chat: Magic and Mana Orbit', was: ['english'] },
    { name: '🆘・help', topic: 'Help in English: game rules, decks, the app' }, { name: '🔊 Voice EN', type: VOICE }] },
  { k: 'de', role: 'Deutsch', emoji: '🇩🇪', cat: '🇩🇪 DEUTSCH', rules: '📜・regeln', chat: '💬・allgemein', topic: 'Deutscher Chat: Magic und Mana Orbit', rtopic: 'Serverregeln auf Deutsch' },
  { k: 'es', role: 'Español', emoji: '🇪🇸', cat: '🇪🇸 ESPAÑOL', rules: '📜・reglas', chat: '💬・general', topic: 'Chat en español: Magic y Mana Orbit', rtopic: 'Normas del servidor en español' },
  { k: 'it', role: 'Italiano', emoji: '🇮🇹', cat: '🇮🇹 ITALIANO', rules: '📜・regole', chat: '💬・generale', topic: 'Chat in italiano: Magic e Mana Orbit', rtopic: 'Regole del server in italiano' },
  { k: 'pt', role: 'Português', emoji: '🇧🇷', cat: '🇧🇷🇵🇹 PORTUGUÊS', rules: '📜・regras', chat: '💬・geral', topic: 'Chat em português: Magic e Mana Orbit', rtopic: 'Regras do servidor em português' },
  { k: 'ru', role: 'Русский', emoji: '🇷🇺', cat: '🇷🇺 РУССКИЙ', rules: '📜・правила', chat: '💬・общий', topic: 'Чат на русском: Magic и Mana Orbit', rtopic: 'Правила сервера на русском' },
  { k: 'ja', role: '日本語', emoji: '🇯🇵', cat: '🇯🇵 日本語', rules: '📜・ルール', chat: '💬・雑談', topic: 'Magic と Mana Orbit について日本語で雑談', rtopic: 'サーバールール（日本語）' },
  { k: 'ko', role: '한국어', emoji: '🇰🇷', cat: '🇰🇷 한국어', rules: '📜・규칙', chat: '💬・잡담', topic: '한국어 채팅: Magic과 Mana Orbit', rtopic: '서버 규칙 (한국어)' },
  { k: 'zh', role: '中文', emoji: '🀄', cat: '🀄 中文', rules: '📜・规则', chat: '💬・闲聊', topic: '中文聊天：Magic 与 Mana Orbit · 中文聊天：Magic 與 Mana Orbit', rtopic: '服务器规则 · 伺服器規則', texts: ['zhs', 'zht'] },
];
const ALL_LANGS = '🌍 Toutes les langues';

// Rôles, du plus haut au plus bas (rangés ainsi sous celui du bot ; les rôles d'autres bots et ceux faits à la main se placent sous Support)
const STAFF = [
  { name: '👑 Créateur', perms: 0n, color: 0xff6b9a, hoist: true },      // le propriétaire : affiché tout en haut (il a déjà tous les droits)
  { name: 'Admin', perms: ADMIN, color: 0xe8b04b, hoist: true },
  { name: 'Modo', was: ['Équipe'], perms: TEAM_PERMS, color: 0x9fb4ff, hoist: true },
  { name: 'Support', perms: SUPPORT_PERMS, color: 0x5fd4a0, hoist: true },
];
const NOTIFS = [['📢 Annonces', '📢', 'Les nouveautés et les sorties · News and releases'], ['🔮 Carte mystère', '🔮', 'Chaque jour à 18 h · Every day at 6 pm (Paris)'], ['🎲 LFG', '🎲', 'Quand quelqu\'un cherche des joueurs · When someone looks for players']];
const USES = [['🌐 Site', '🌐', 'manaorbit.app'], ['📱 Android', '📱', 'Google Play'], ['🔭 Découverte', '🔭', 'Pas encore · Not yet']];
const FORMATS = ['Commander', 'Modern', 'Pioneer', 'Standard', 'Pauper', 'Legacy', 'Limited'];
const MEMBER_ROLES = [
  ...LANGS.filter(l => l.mod).map(l => ({ name: l.mod, perms: 0n, color: 0x9fb4ff })),
  { name: 'Testeur', perms: 0n, color: 0xf0b45a, hoist: true },
  ...LANGS.map(l => ({ name: l.role, perms: 0n })), { name: ALL_LANGS, perms: 0n },
  ...NOTIFS.map(([name]) => ({ name, perms: 0n, mentionable: name === '🎲 LFG' })),
  ...USES.map(([name]) => ({ name, perms: 0n })),
  ...FORMATS.map(name => ({ name, perms: 0n, mentionable: true })),
  ...DSC_ROLE_DEFS.map(r => ({ name: r.name, perms: 0n, color: r.color, linked: true })),      // tout en bas : donnés et retirés par le bot permanent (discord-roles.mjs), qui doit être au-dessus
];

// ── Textes des salons ────────────────────────────────────────────────────────────────────────────────────────────────
const tags = (...l) => l.map(([name, emoji_name, moderated]) => ({ name, emoji_name, moderated: !!moderated }));
const PLATFORMS = [['Site', '🌐'], ['PWA', '📲'], ['Android', '🤖']];
const AREAS = [['Scan', '📷'], ['Collection', '🗂️'], ['Decks', '🃏'], ['Prix', '💶'], ['Compte et synchro', '🔄'], ['Autre', '💬']];
const AREAS_MORE = [['Alertes', '🔔'], ['Échange', '🔁'], ['Partie', '🎲'], ['Carte mystère', '🔮'], ['Amis', '👥']];
const TAGS = {
  aide: tags(...PLATFORMS, ...AREAS),
  bugs: tags(...PLATFORMS, ...AREAS, ...AREAS_MORE, ['Confirmé', '🔍', 1], ['Prochaine version', '🕐', 1], ['Corrigé', '✅', 1], ['Pas un bug', '❌', 1], ['Doublon', '🔁', 1]),
  'idées': tags(['Envisagé', '🤔', 1], ['Prévu', '📌', 1], ['Fait', '✅', 1], ['Pas pour l\'instant', '💤', 1]),
};
const BUG_TEMPLATE = `Un bug : un fil par bug, dans n'importe quelle langue. Une étiquette Site, PWA ou Android, et une pour la partie de l'appli.
Copie et remplis :
• Appareil et navigateur :
• Version de l'appli (Réglages) :
• Langue de l'appli :
• Ce que je faisais (étapes) :
• Ce que j'attendais :
• Ce qui s'est passé :
• Capture ou vidéo :
L'équipe ajoute Confirmé, Prochaine version ou Corrigé.

One thread per bug, any language. Tag Site / PWA / Android + the app area. Device, app version (Settings), steps, expected, actual, screenshot.`;
const welcome = c => `**Bienvenue sur le Discord de Mana Orbit** 👋
Mana Orbit : scanne tes cartes Magic, suis la valeur de ta collection, construis et partage tes decks.

📲 Google Play : ${PLAY}
🌐 Site : ${SITE}
🔁 Tu viens de ManaBox ? ${SITE}/passer-de-manabox

📜 Les règles → <#${c['règles']}>
🌍 Tes langues, formats et notifications → <id:customize>
🆘 Une question → <#${c.aide}> · 🐞 Un bug → <#${c.bugs}> · 💡 Une idée → <#${c['idées']}>
📢 Les nouveautés → <#${c.annonces}> · 🆕 Les versions → <#${c.changelog}>
🃏 Tes decks → <#${c.decks}> · 🔁 Échanges → <#${c['échanges']}> · 🎲 Trouver une table → <#${c.lfg}>

**Welcome!** Mana Orbit scans your Magic cards, tracks your collection's value and builds your decks.
Rules → <#${c['règles']}> · languages & roles → <id:customize> · help → <#${c.aide}> · bugs → <#${c.bugs}> · ideas → <#${c['idées']}>`;
const fill = (t, c) => t.replace(/\{(\w+)\}/g, (_, k) => `<#${c[{ idees: 'idées' }[k] || k]}>`);
const rulesOf = (k, c) => RULES[k].map((t, i) => `${i + 1}. ${fill(t, c)}`).join('\n');
const FAN = '*Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy, ni approuvé ni soutenu par Wizards of the Coast. Unofficial Fan Content permitted under the Fan Content Policy, not approved/endorsed by Wizards.*';
const mainRules = c => [`**📜 ${L10N.fr.title}**\n${rulesOf('fr', c)}`, `**📜 ${L10N.en.title}**\n${rulesOf('en', c)}\n\n*${L10N.en.foot}*\n\n${FAN}`];
const langRules = (k, c) => { const t = L10N[k]; return `**${t.hello}**\n🌍 ${t.change} → <id:customize> · 📲 ${PLAY}\n\n**📜 ${t.title}**\n${rulesOf(k, c)}\n\n*${t.foot}*`; };
const SCREEN = RULES.en.map(t => t.replace(/\{(\w+)\}/g, (_, k) => ({ bugs: '#bugs', idees: '#idées', carte: '#carte-mystère' })[k]));      // écran des règles : texte seul, pas de lien vers un salon

// ── Installation ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) { console.error('DISCORD_TOKEN manquant. PowerShell : $env:DISCORD_TOKEN = "<jeton du bot>" puis relance (docs/store/sortie.md § 2).'); process.exit(1); }
  if (DRY) console.log('Essai : rien n\'est changé sur le serveur.');
  const me = await api('GET', '/users/@me');
  let gid = GUILD_ARG;
  if (!gid) {
    const gs = await api('GET', '/users/@me/guilds');
    if (gs.length !== 1) { console.error(gs.length ? `Le bot est sur ${gs.length} serveurs : donne l'identifiant du bon (node tools/discord-setup.mjs <identifiant>).` : 'Le bot n\'est sur aucun serveur : invite-le d\'abord (lien de l\'étape « OAuth2 », docs/store/sortie.md § 2).'); process.exit(1); }
    gid = gs[0].id;
  }
  const guild = await api('GET', `/guilds/${gid}`);
  console.log(`Serveur « ${guild.name} »`);
  const todo = [];      // ce qui reste à faire à la main, affiché à la fin

  // ── Rôles ──
  const roles = await api('GET', `/guilds/${gid}/roles`), R = {};
  const role = async o => {
    const body = { name: o.name, permissions: String(o.perms), color: o.color || 0, hoist: !!o.hoist, mentionable: !!o.mentionable };
    const r = roles.find(x => x.name === o.name) || (o.was || []).map(w => roles.find(x => x.name === w)).find(Boolean);
    if (r) {
      const p = {}; for (const k of Object.keys(body)) if (k === 'permissions' ? BigInt(r.permissions) !== o.perms : r[k] !== body[k]) p[k] = body[k];
      if (Object.keys(p).length) { try { Object.assign(r, await api('PATCH', `/guilds/${gid}/roles/${r.id}`, p) || p); console.log(`✓ rôle ${o.name} (mis à jour)`); } catch (e) { console.log(`! rôle ${o.name} : ${e.message} (place le rôle du bot tout en haut : Paramètres › Rôles)`); } }
      else console.log(`✓ rôle ${o.name}`);
      return (R[o.name] = r.id);
    }
    const c = await api('POST', `/guilds/${gid}/roles`, body); roles.push(c); console.log(`✓ rôle ${o.name} (créé)`); return (R[o.name] = c.id);
  };
  for (const o of [...STAFF, ...MEMBER_ROLES]) await role(o);
  const every = roles.find(x => x.id === gid);
  if (every && (BigInt(every.permissions) & MENTION_ALL)) { await api('PATCH', `/guilds/${gid}/roles/${gid}`, { permissions: String(BigInt(every.permissions) & ~MENTION_ALL) }); console.log('✓ @everyone : plus de @everyone / @here pour les membres'); }
  if (guild.owner_id) { try { await api('PUT', `/guilds/${gid}/members/${guild.owner_id}/roles/${R['👑 Créateur']}`); console.log('✓ rôle 👑 Créateur donné au propriétaire du serveur'); } catch (e) { todo.push(`Te donner le rôle 👑 Créateur (${e.message})`); } }
  // Ordre : Créateur, Admin, Modo, Support, les rôles des autres (bots de tickets…), puis les nôtres ; tout ça sous le rôle le plus haut du bot (seuls ceux-là lui sont permis)
  try {
    const now = (await api('GET', `/guilds/${gid}/roles`)) || roles, bot = await api('GET', `/guilds/${gid}/members/${me.id}`);
    const top = Math.max(0, ...now.filter(r => (bot && bot.roles || []).includes(r.id)).map(r => r.position));
    const below = now.filter(r => r.id !== gid && r.position < top), ours = [...STAFF, ...MEMBER_ROLES].map(o => R[o.name]);
    const byPos = l => l.slice().sort((a, b) => b.position - a.position || bySnow(a.id, b.id));
    const want = [...STAFF.map(o => R[o.name]), ...byPos(below.filter(r => !ours.includes(r.id))).map(r => r.id), ...MEMBER_ROLES.map(o => R[o.name])].filter(id => below.some(r => r.id === id));
    const high = ours.filter(id => now.some(r => r.id === id) && !below.some(r => r.id === id));
    if (high.length) todo.push(`Rôles au-dessus de celui du bot, pas rangés : ${high.map(id => (now.find(r => r.id === id) || {}).name || id).join(', ')} (Paramètres › Rôles : glisse le rôle du bot tout en haut, puis relance)`);
    if (byPos(below).map(r => r.id).filter(id => want.includes(id)).join() !== want.join()) { await api('PATCH', `/guilds/${gid}/roles`, want.map((id, i) => ({ id, position: top - 1 - i }))); console.log('✓ rôles rangés'); }
    else console.log('✓ rôles déjà rangés');
  } catch (e) { todo.push(`Ranger les rôles à la main (${e.message})`); }
  // Bot permanent « Mana Orbit » (pas celui du script) : il donne les rôles des comptes liés, il lui faut « Gérer les rôles » et un rôle au-dessus d'eux
  try {
    const now = (await api('GET', `/guilds/${gid}/roles`)) || roles, low = Math.max(0, ...MEMBER_ROLES.filter(o => o.linked).map(o => (now.find(r => r.id === R[o.name]) || {}).position || 0));
    for (const r of now.filter(x => x.managed && x.tags && x.tags.bot_id && x.tags.bot_id !== me.id && /mana\s*orbit/i.test(x.name || ''))) {
      if (!(BigInt(r.permissions || 0) & (ADMIN | MANAGE_ROLES))) todo.push(`Bot « ${r.name} » : Paramètres › Rôles › ${r.name} › Permissions › coche « Gérer les rôles » (rôles des comptes liés)`);
      if ((r.position || 0) <= low) todo.push(`Bot « ${r.name} » : glisse son rôle au-dessus de « ${DSC_ROLE_DEFS[0].name} » et des paliers (Paramètres › Rôles)`);
    }
  } catch (e) { /* liste illisible : rien de plus à dire */ }

  // ── Permissions ──
  const ow = (id, allow, deny) => ({ id, type: 0, allow: String(allow), deny: String(deny) });
  const RO = (base, extra = []) => {      // lecture seule pour les membres, l'équipe (et le modo de la langue) écrit
    const l = base.map(o => ({ ...o })), add = (id, allow, deny) => { const o = l.find(x => x.id === id); if (o) { o.allow = String(BigInt(o.allow) | allow); o.deny = String(BigInt(o.deny) | deny); } else l.push(ow(id, allow, deny)); };
    add(gid, 0n, RO_DENY); for (const id of [R.Modo, R.Support, ...extra]) add(id, WRITE, 0n); return l;
  };
  const PUB = [], WELCOME = RO([]);
  const BETA = [ow(gid, 0n, VIEW), ow(R.Testeur, VIEW, 0n), ow(R.Modo, VIEW, 0n), ow(R.Support, VIEW, 0n)];
  const TEAM = [ow(gid, 0n, VIEW), ow(R.Modo, VIEW | SEND, 0n), ow(R.Support, VIEW | SEND, 0n)];
  const LANG = l => [ow(gid, 0n, VIEW), ow(R[l.role], VIEW, 0n), ow(R[ALL_LANGS], VIEW, 0n), ow(R.Modo, VIEW, 0n), ow(R.Support, VIEW, 0n), ...(l.mod ? [ow(R[l.mod], LANG_MOD, 0n)] : [])];

  // ── Plan des salons ── (k : nom court, pour les renvois dans les textes ; was : ancien salon repris)
  const PLAN = [
    { name: box('BIENVENUE'), was: ['Bienvenue'], ow: WELCOME, chans: [
      { k: 'bienvenue', name: '👋・bienvenue', topic: 'Bienvenue ! Présentation et liens utiles · Welcome and useful links', was: ['bienvenue'] },
      { k: 'règles', name: '📜・règles', topic: 'Les règles du serveur · Server rules', was: ['règles'] },
      { k: 'annonces', name: '📢・annonces', type: NEWS, topic: 'Nouveautés et sorties de Mana Orbit · News and releases', was: ['annonces'] },
      { k: 'changelog', name: '🆕・changelog', type: NEWS, topic: 'Chaque nouvelle version, publiée automatiquement depuis GitHub · Every release, posted from GitHub' },
      { k: 'faq', name: '❓・faq', type: FORUM, topic: 'Les questions qui reviennent, un fil par question · Frequently asked questions', layout: 1 }] },
    { name: box('SUPPORT'), was: ['Appli'], ow: PUB, chans: [
      { k: 'aide', name: '🆘・aide', type: FORUM, was: ['aide'], layout: 1, topic: 'Une question sur l\'appli : un fil par question, avec les étiquettes qui vont bien. Dis ton appareil et ta version (Réglages).\nOne thread per question, any language.' },
      { k: 'bugs', name: '🐞・bugs', type: FORUM, was: ['bugs'], layout: 1, sort: 1, requireTag: true, topic: BUG_TEMPLATE },
      { k: 'idées', name: '💡・idées', type: FORUM, was: ['idées'], layout: 1, react: '👍', topic: 'Une idée pour Mana Orbit : un fil par idée, les 👍 aident à choisir. L\'équipe indique où elle en est (Envisagé, Prévu, Fait, Pas pour l\'instant).\nOne thread per idea, upvote with 👍.' }] },
    { name: box('COMMUNAUTÉ'), was: ['Communauté'], ow: PUB, chans: [
      { k: 'decks', name: '🃏・decks', topic: 'Partage tes decks (liens de l\'appli), toutes langues · Share your decks, any language', was: ['decks'] },
      { k: 'collections', name: '🖼️・collections', topic: 'Classeurs, vitrines, belles pièces · Binders, showcases, prized cards' },
      { k: 'ouvertures', name: '📦・ouvertures', topic: 'Tes ouvertures de boosters, photos bienvenues · Your booster openings', was: ['ouvertures'] },
      { k: 'carte', name: '🔮・carte-mystère', rate: 10, topic: 'La Carte mystère du jour (18 h, Paris) : la réponse toujours sous spoiler ||comme ça|| · Mystery card: answers in ||spoilers|| only' },
      { k: 'échanges', name: '🔁・échanges', was: ['échanges'], topic: 'Listes d\'échange (liens de l\'appli). Entre membres, à vos risques : Mana Orbit n\'est pas intermédiaire. · Trade lists, at your own risk' },
      { k: 'prix', name: '💶・prix-et-marché', topic: 'Cotes, tendances, alertes de prix · Prices and market trends' },
      { k: 'spoilers', name: '✨・spoilers', topic: 'Nouvelles extensions et révélations · New sets and previews' }] },
    { name: box('JOUER'), ow: PUB, chans: [
      { k: 'lfg', name: '🎲・lfg', topic: 'Cherche des joueurs : format, heure, code de Partie de l\'appli. Ping @🎲 LFG · Looking for group' },
      { name: '🔊 Table 1', type: VOICE, limit: 5, was: ['Commander', c => c.type === VOICE && /^g[eé]n[eé]ral$/i.test(c.name)] },
      { name: '🔊 Table 2', type: VOICE, limit: 5 }, { name: '🔊 Table 3', type: VOICE, limit: 5 }, { name: '☕ Chill', type: VOICE }] },
    ...LANGS.map(l => ({ name: box(l.cat), ow: LANG(l), lang: l, chans: l.chans || [
      { k: 'rules-' + l.k, name: l.rules, topic: l.rtopic, ro: true }, { name: l.chat, topic: l.topic }] })),
    { name: box('BÊTA'), ow: BETA, chans: [
      { name: '📣・bêta-annonces', topic: 'Nouvelles versions de test · Test builds', ro: true },
      { name: '🧪・bêta-feedback', topic: 'Retours sur les versions de test · Beta feedback' },
      { name: '📦・builds-android', topic: 'APK de test · Android test builds', ro: true }] },
    { name: box('ÉQUIPE'), was: ['Équipe'], ow: TEAM, chans: [
      { k: 'modération', name: '🛡️・modération', topic: 'Équipe : alertes AutoMod, arrivées, messages de Discord', was: ['modération'] },
      { name: '💬・staff', topic: 'Équipe : discussion' },
      { k: 'triage', name: '🐞・bug-triage', topic: 'Équipe : bugs confirmés, issues GitHub' },
      { name: '🚨・alertes-serveur', topic: 'Équipe : erreurs et pannes du serveur' }] },
  ];

  // ── Salons : repris par nom (même catégorie d'abord), puis par ancien nom ; seuls les champs qui changent sont envoyés ──
  const chans = await api('GET', `/guilds/${gid}/channels`), claimed = new Set(), id = {};
  const fits = (c, type) => c.type === type || (type === NEWS && c.type === TX);
  const named = (n, type) => c => (type === CAT || type === VOICE) ? c.name.toLowerCase() === n.toLowerCase() : c.name === n;
  const find = (name, type, parent, was = []) => {
    const free = chans.filter(c => !claimed.has(c.id) && fits(c, type));
    return free.find(c => named(name, type)(c) && (c.parent_id || null) === (parent || null)) || free.find(named(name, type))
      || was.map(w => free.find(typeof w === 'function' ? w : named(w, type))).find(Boolean);
  };
  const owKey = l => (l || []).map(o => `${o.id}:${o.type}:${BigInt(o.allow)}:${BigInt(o.deny)}`).sort().join();
  const tagKey = l => (l || []).map(t => `${t.name}|${t.emoji_name || ''}|${!!t.moderated}`).join();
  const same = (k, a, v) => k === 'permission_overwrites' ? owKey(a) === owKey(v) : k === 'available_tags' ? tagKey(a) === tagKey(v)
    : k === 'default_reaction_emoji' ? (a && a.emoji_name) === (v && v.emoji_name) : k === 'topic' ? (a || '') === (v || '') : (a ?? null) === (v ?? null);
  let community = (guild.features || []).includes('COMMUNITY');
  const chan = async (d, parent, pos) => {
    const type = d.type ?? TX;
    if (type === FORUM && !community) { console.log(`… forum ${d.name} : après le mode communauté`); return null; }
    const want = { name: d.name, type: (type === NEWS && !community) ? TX : type, permission_overwrites: d.ow };
    if (parent) want.parent_id = parent;
    if (d.topic && type !== CAT && type !== VOICE) want.topic = d.topic;
    if (type === TX || type === NEWS || type === FORUM) want.rate_limit_per_user = d.rate || 0;
    if (type === VOICE) want.user_limit = d.limit || 0;
    if (type === FORUM) {
      want.default_forum_layout = d.layout || 0;
      if (d.sort !== undefined) want.default_sort_order = d.sort;
      if (d.react) want.default_reaction_emoji = { emoji_id: null, emoji_name: d.react };
      want.flags = d.requireTag ? REQUIRE_TAG : 0;
    }
    const ex = (d.id && chans.find(c => c.id === d.id)) || find(d.name, type, parent, d.was);      // id : déjà fait plus haut (#règles, #modération)
    const tagsFor = d.k && TAGS[d.k] && type === FORUM ? TAGS[d.k] : null;
    if (!ex) {
      const { flags, ...body } = want; if (tagsFor) body.available_tags = tagsFor;
      let c = await api('POST', `/guilds/${gid}/channels`, { ...body, position: pos }); chans.push(c); claimed.add(c.id);
      if (flags) c = Object.assign(c, await api('PATCH', `/channels/${c.id}`, { flags }) || { flags });
      console.log(`✓ ${type === CAT ? 'catégorie' : 'salon'} ${d.name} (créé)`); return c;
    }
    claimed.add(ex.id);
    if (tagsFor) want.available_tags = [...tagsFor.map(t => { const h = (ex.available_tags || []).find(x => x.name === t.name); return h ? { ...t, id: h.id } : t; }),
      ...(ex.available_tags || []).filter(h => !tagsFor.some(t => t.name === h.name))];      // étiquettes déjà posées sur des fils : gardées (mêmes identifiants)
    if (type === FORUM) want.flags = (Number(ex.flags) & ~REQUIRE_TAG) | want.flags;
    if (ex.type === want.type) delete want.type;      // seul changement de type possible : texte → annonces
    const p = {}; for (const [k, v] of Object.entries(want)) if (!same(k, ex[k], v)) p[k] = v;
    if (!Object.keys(p).length) { console.log(`✓ ${type === CAT ? 'catégorie' : 'salon'} ${d.name}`); return ex; }
    Object.assign(ex, await api('PATCH', `/channels/${ex.id}`, p) || p);
    console.log(`✓ ${type === CAT ? 'catégorie' : 'salon'} ${d.name} (${ex.name !== d.name || p.name ? 'repris, ' : ''}mis à jour : ${Object.keys(p).join(', ')})`); return ex;
  };
  const cats = [];
  for (const [i, c] of PLAN.entries()) cats.push(await chan({ ...c, type: CAT, was: [...(c.was || []), OLD_BOX(c.name.slice(1, -1))] }, null, i));
  const put = async (ci, k) => { const c = PLAN[ci], i = c.chans.findIndex(x => x.k === k), d = c.chans[i]; const r = await chan({ ...d, ow: d.ro ? RO(c.ow) : c.ow }, cats[ci].id, i); id[k] = d.id = r.id; return r; };
  await put(0, 'règles'); await put(PLAN.length - 1, 'modération');

  // Mode communauté : annonces, forums, accueil ; exige un salon des règles et un salon pour les messages de Discord (#modération, équipe seulement)
  const flagsSys = (Number(guild.system_channel_flags) || 0) | 4 | 8;      // pas de rappels de Discord ni d'autocollant « dis bonjour » ; arrivées affichées dans #modération
  const settings = { verification_level: 2, explicit_content_filter: 2, default_message_notifications: 1, rules_channel_id: id['règles'], public_updates_channel_id: id['modération'], safety_alerts_channel_id: id['modération'], system_channel_id: id['modération'], system_channel_flags: flagsSys, preferred_locale: 'fr' };
  if (!guild.icon && existsSync(ICON)) settings.icon = 'data:image/png;base64,' + readFileSync(ICON).toString('base64');
  try {
    await api('PATCH', `/guilds/${gid}`, { ...settings, ...(community ? {} : { features: [...(guild.features || []), 'COMMUNITY'] }), description: 'Scanne tes cartes Magic, suis la valeur de ta collection, construis et partage tes decks.' });
    community = true; console.log('✓ réglages : mode communauté, vérification moyenne, filtre de contenu pour tous, notifications @mentions seulement, arrivées dans #modération');
  } catch (e) {
    await api('PATCH', `/guilds/${gid}`, { verification_level: 2, explicit_content_filter: 2, default_message_notifications: 1, ...(settings.icon ? { icon: settings.icon } : {}) }).catch(() => {});
    todo.push(`Mode communauté non activé (${e.message}) : Paramètres du serveur › Activer la communauté, puis relance le script (annonces, forums, accueil)`);
  }

  for (const [ci, c] of PLAN.entries()) for (const [i, d] of c.chans.entries()) {
    const r = await chan({ ...d, ow: d.ro ? RO(c.ow, c.lang && c.lang.mod ? [R[c.lang.mod]] : []) : c.ow }, cats[ci].id, i);
    if (r) { d.id = r.id; if (d.k) id[d.k] = r.id; }
  }
  // Ordre des catégories et des salons : seulement s'il a changé (les salons d'autres bots gardent leur place)
  // (vocaux rangés à part des salons écrits, comme Discord les affiche ; objets de l'essai laissés de côté)
  const pos = c => (chans.find(x => x.id === c) || {}).position ?? 0, sorted = ids => ids.slice().sort((a, b) => pos(a) - pos(b) || bySnow(a, b)), real = x => x && !String(x).startsWith('essai');
  const kids = (ci, voice) => ({ ids: PLAN[ci].chans.filter(d => real(d.id) && ((d.type === VOICE) === voice)).map(d => d.id) });      // catégorie déjà posée salon par salon (Discord : un seul changement de catégorie par appel groupé)
  const wantOrder = [{ ids: cats.map(c => c.id).filter(real) }, ...PLAN.flatMap((c, ci) => real(cats[ci].id) ? [kids(ci, false), kids(ci, true)] : [])];
  if (wantOrder.some(g => sorted(g.ids).join() !== g.ids.join())) {
    try { await api('PATCH', `/guilds/${gid}/channels`, wantOrder.flatMap(g => g.ids.map((cid, i) => ({ id: cid, position: i })))); console.log('✓ catégories et salons rangés'); }
    catch (e) { todo.push(`Ranger les catégories et salons (glisser-déposer), ou relancer le script (${e.message})`); }
  }
  for (const c of chans.filter(c => c.type === CAT && !claimed.has(c.id) && /^(salons (textuels|vocaux)|text channels|voice channels)$/i.test(c.name))) {      // catégories du serveur neuf, vidées
    if (!chans.some(x => x.parent_id === c.id)) { await api('DELETE', `/channels/${c.id}`); console.log(`✓ catégorie vide « ${c.name} » retirée`); }
  }
  const ref = new Proxy(id, { get: (o, k) => o[k] || o['règles'] });      // sans mode communauté (pas encore de forums) : renvois vers #règles

  // ── Accueil (onboarding) : questions d'arrivée et salons par défaut ── (identifiants gardés d'un lancement à l'autre : les réponses des membres restent)
  if (community) {
    let seq = 0n; const snow = () => String(((BigInt(Date.now()) - 1420070400000n) << 22n) | (seq++ & 4095n));
    let ob = null; try { ob = await api('GET', `/guilds/${gid}/onboarding`); } catch { /* pas encore d'accueil */ }
    const opt = (title, emoji, roleName, description) => ({ title, emoji_name: emoji, role_ids: [R[roleName]], channel_ids: [], ...(description ? { description } : {}) });
    const want = [
      { title: 'Quelle(s) langue(s) parles-tu ? · Your language(s)?', required: true, options: [...LANGS.map(l => opt(l.role, l.emoji, l.role)), opt('Toutes · All', '🌍', ALL_LANGS, 'Voir les salons de toutes les langues · See every language')] },
      { title: 'Tu utilises Mana Orbit ? · Do you use Mana Orbit?', options: USES.map(([n, e, d]) => opt(n.replace(/^\S+ /, ''), e, n, d)) },
      { title: 'Tu joues à quoi ? · What do you play?', options: FORMATS.map(f => opt(f, '🃏', f)) },
      { title: 'Quelles notifications ? · Which notifications?', options: NOTIFS.map(([n, e, d]) => opt(n.replace(/^\S+ /, ''), e, n, d)) },
    ];
    const prompts = want.map(p => {
      const old = ((ob && ob.prompts) || []).find(o => (o.options || []).some(x => (x.role_ids || []).includes(p.options[0].role_ids[0])));
      return { id: old ? old.id : snow(), type: 0, title: p.title, single_select: false, required: !!p.required, in_onboarding: true,
        options: p.options.map(o => { const x = old && old.options.find(y => (y.role_ids || []).includes(o.role_ids[0])); return { id: x ? x.id : snow(), ...o }; }) };
    });
    const defaults = ['bienvenue', 'règles', 'annonces', 'aide', 'bugs', 'idées', 'decks', 'collections', 'ouvertures', 'carte', 'échanges', 'prix', 'lfg'].map(k => id[k]).filter(Boolean);
    try { await api('PUT', `/guilds/${gid}/onboarding`, { prompts, default_channel_ids: defaults, enabled: true, mode: 0 }); console.log(`✓ accueil : ${prompts.length} questions (langue obligatoire), ${defaults.length} salons par défaut`); }
    catch (e) { todo.push(`Accueil (Paramètres › Onboarding) refusé par Discord : ${e.message}`); }

    // Écran des règles (« Rules Screening ») : réservé aux comptes humains chez Discord, tenté quand même ; sinon à coller à la main
    try {
      await api('PATCH', `/guilds/${gid}/member-verification`, { enabled: true, description: 'Mana Orbit · Magic: The Gathering', form_fields: [{ field_type: 'TERMS', label: 'Read and agree to the server rules', required: true, values: SCREEN }] });
      console.log('✓ écran des règles (à accepter avant d\'écrire)');
    } catch { todo.push('Écran des règles : Paramètres du serveur › Sécurité (ou Onboarding) › Règles du serveur › colle les 8 lignes affichées plus bas'); }
  }

  // ── AutoMod (spam, mentions et listes toutes faites : une seule règle de chaque par serveur) ──
  const exempt = [R.Admin, R.Modo, R.Support], alert = { type: 2, metadata: { channel_id: id['modération'] } };
  const AUTOMOD = [
    { name: 'Arnaques', trigger_type: 1, trigger_metadata: { keyword_filter: ['*discord.gift*', '*free nitro*', '*nitro gratuit*', '*nitro free*', '*steamcommunity.ru*', '*airdrop*', '*crypto giveaway*', '*giveaway crypto*'] }, actions: [{ type: 1, metadata: { custom_message: 'Message bloqué : il ressemble à une arnaque. · Blocked: looks like a scam.' } }, alert] },
    { name: 'Invitations', trigger_type: 1, trigger_metadata: { keyword_filter: ['*discord.gg/*', '*discord.com/invite/*', '*discordapp.com/invite/*'] }, actions: [{ type: 1, metadata: { custom_message: 'Pas d\'invitation vers un autre serveur sans accord de l\'équipe. · No server invites.' } }, alert] },
    { name: 'Spam', trigger_type: 3, actions: [{ type: 1 }, alert] },
    { name: 'Mentions en masse', trigger_type: 5, trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, actions: [{ type: 1 }, alert, { type: 3, metadata: { duration_seconds: 600 } }] },
    { name: 'Contenu choquant', trigger_type: 4, trigger_metadata: { presets: [2, 3] }, actions: [{ type: 1 }, alert] },
  ];
  const have = (await api('GET', `/guilds/${gid}/auto-moderation/rules`)) || [], amKey = r => JSON.stringify([r.name, (r.actions || []).map(a => `${a.type}:${(a.metadata && (a.metadata.channel_id || a.metadata.duration_seconds || a.metadata.custom_message)) || ''}`), (r.exempt_roles || []).slice().sort(), r.trigger_metadata && (r.trigger_metadata.keyword_filter || r.trigger_metadata.presets || r.trigger_metadata.mention_total_limit), r.enabled !== false]);
  for (const r of AUTOMOD) {
    const body = { ...r, event_type: 1, enabled: true, exempt_roles: exempt }, h = have.find(x => x.name === r.name || (r.trigger_type !== 1 && x.trigger_type === r.trigger_type));
    try {
      if (!h) { await api('POST', `/guilds/${gid}/auto-moderation/rules`, body); console.log(`✓ AutoMod ${r.name} (créée)`); continue; }
      if (amKey(h) === amKey(body)) { console.log(`✓ AutoMod ${r.name}`); continue; }
      const { trigger_type, ...patch } = body; await api('PATCH', `/guilds/${gid}/auto-moderation/rules/${h.id}`, patch); console.log(`✓ AutoMod ${r.name} (mise à jour)`);
    } catch (e) { console.log(`! AutoMod ${r.name} : ${e.message}`); }
  }

  // ── Messages : ceux du bot dans le salon, du plus ancien au plus récent, remis à jour sur place ──
  const say = async (ch, contents, what) => {
    if (!ch) return;
    const msgs = (await api('GET', `/channels/${ch}/messages?limit=50`)) || [], mine = msgs.filter(m => m.author && m.author.id === me.id).reverse();
    for (const [i, content] of contents.entries()) {
      const body = { content, allowed_mentions: { parse: [] }, flags: 4 };      // 4 : sans aperçu des liens
      if (!mine[i]) { await api('POST', `/channels/${ch}/messages`, body); console.log(`✓ message ${what} (posté)`); }
      else if (mine[i].content !== content) { await api('PATCH', `/channels/${ch}/messages/${mine[i].id}`, body); console.log(`✓ message ${what} (mis à jour)`); }
      else console.log(`✓ message ${what}`);
    }
    for (const m of mine.slice(contents.length)) await api('DELETE', `/channels/${ch}/messages/${m.id}`);      // ancien message en trop (texte raccourci)
  };
  await say(id['règles'], mainRules(ref), 'des règles');
  await say(id.bienvenue, [welcome(ref)], 'd\'accueil');
  for (const l of LANGS.filter(l => l.rules)) await say(id['rules-' + l.k], (l.texts || [l.k]).map(k => langRules(k, ref)), `des règles (${l.role})`);

  // ── Webhooks GitHub : versions → #changelog, issues → #bug-triage ── (adresses secrètes : affichées ici seulement, à coller dans GitHub)
  const hooks = [];
  for (const [k, name] of [['changelog', 'GitHub'], ['triage', 'GitHub issues']]) {
    if (!id[k] || DRY) continue;
    try {
      const l = (await api('GET', `/channels/${id[k]}/webhooks`)) || [];
      const w = l.find(x => x.name === name && x.token) || await api('POST', `/channels/${id[k]}/webhooks`, { name });
      hooks.push([k, (w.url || `https://discord.com/api/webhooks/${w.id}/${w.token}`) + '/github']); console.log(`✓ webhook ${name}`);
    } catch (e) { todo.push(`Webhook ${name} : ${e.message}`); }
  }

  // ── Lien d'invitation permanent (#bienvenue) ──
  let inv = null;
  try { inv = ((await api('GET', `/guilds/${gid}/invites`)) || []).find(i => i.channel && i.channel.id === id.bienvenue && i.max_age === 0 && i.max_uses === 0 && !i.temporary); } catch { /* liste illisible : on en crée un */ }
  if (!inv) inv = await api('POST', `/channels/${id.bienvenue}/invites`, { max_age: 0, max_uses: 0, temporary: false, unique: false });

  console.log(`\nLien d'invitation permanent : ${inv && inv.code ? 'https://discord.gg/' + inv.code : '(créé au vrai lancement)'}`);
  if (hooks.length) {
    console.log('\nWebhooks GitHub (secrets : ne les colle que dans GitHub › BeerDeus/manaorbit › Settings › Webhooks › Add webhook, Content type application/json) :');
    for (const [k, u] of hooks) console.log(`  ${k === 'changelog' ? '#changelog, événement « Releases »' : '#bug-triage, événement « Issues »'} : ${u}`);
  }
  todo.push('Guide du serveur : Paramètres › Onboarding › Guide du serveur › message d\'accueil, 3 premières actions (lire #règles, se présenter dans sa langue, partager un deck), ressources (site, Google Play)');
  todo.push('2FA obligatoire pour la modération : Paramètres › Sécurité (le propriétaire seulement)');
  todo.push('Rôle Testeur aux testeurs (clic droit sur un membre › Rôles) ; Admin, Modo, Modo FR, Modo EN, Support à l\'équipe');
  todo.push('Ensuite : expulse le bot du serveur et, sur le portail Discord, Reset Token');
  console.log('\nÀ faire à la main :\n' + todo.map(t => '  • ' + t).join('\n'));
  if (todo.some(t => t.startsWith('Écran des règles'))) console.log('\nRègles pour l\'écran des règles :\n' + SCREEN.map(t => '  ' + t).join('\n'));
  if (DRY) console.log(`\nEssai terminé : ${writes} changement${writes > 1 ? 's' : ''} prévu${writes > 1 ? 's' : ''}.`);
}

main().catch(e => {
  const hint = e.status === 401 ? ' : jeton refusé, recopie-le (Bot › Reset Token)' : e.status === 403 ? ' : le bot n\'a pas les droits, réinvite-le avec la permission Administrateur et place son rôle tout en haut' : '';
  console.error('Échec : ' + e.message + hint); process.exit(1);
});
