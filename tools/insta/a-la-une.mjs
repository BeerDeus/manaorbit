// Couvertures des stories « À la une » du profil (1080 × 1920, l'icône au centre : Instagram n'en montre qu'un rond).
// node tools/insta/rendu.mjs --une → docs/instagram/a-la-une/<id>.jpg
const ico = (d, c = '#f2f4ff') => `<svg viewBox="0 0 48 48" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const UNE = [
  { id: '1-scan', titre: 'Scan', icone: ico('<path d="M8 16v-5a3 3 0 0 1 3-3h5M32 8h5a3 3 0 0 1 3 3v5M40 32v5a3 3 0 0 1-3 3h-5M16 40h-5a3 3 0 0 1-3-3v-5"/><rect x="17" y="13" width="14" height="22" rx="2.5"/><path d="M20 18h8" stroke="#ffd479"/>') },
  { id: '2-cote', titre: 'Cote', icone: ico('<path d="M7 36l10-11 7 6 16-17"/><path d="M31 14h9v9" stroke="#6fd08c"/>') },
  { id: '3-echange', titre: 'Échange', icone: ico('<path d="M10 17h26l-6-6M38 31H12l6 6"/><path d="M36 17l-6 6" stroke="#ff8fc3"/>') },
  { id: '4-decks', titre: 'Decks', icone: ico('<rect x="9" y="14" width="18" height="26" rx="3" transform="rotate(-10 18 27)"/><rect x="21" y="9" width="18" height="26" rx="3" transform="rotate(8 30 22)" stroke="#7fb0ff"/>') },
  { id: '5-parties', titre: 'Parties', icone: ico('<path d="M24 41s-14-8.5-14-19a8 8 0 0 1 14-5.3A8 8 0 0 1 38 22c0 10.5-14 19-14 19z"/><path d="M19 24h10M24 19v10" stroke="#ff7a5c"/>') },
  { id: '6-mystere', titre: 'Mystère', icone: ico('<rect x="13" y="7" width="22" height="34" rx="3.5"/><path d="M20 19a4 4 0 1 1 6 3.4c-1.3.8-2 1.6-2 3.1M24 31v.5" stroke="#c79bff"/>') },
];
