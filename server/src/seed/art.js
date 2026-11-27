/**
 * Product pictures for the demo catalog, drawn as flat SVG illustrations so
 * the seed works offline. Real shops upload photos; these are placeholders
 * with a consistent look.
 */
const PALETTES = [
  ['#F6E7DF', '#D4402B', '#8E2A1C', '#F2B35E'],
  ['#E3EDF3', '#2F6690', '#1D425E', '#F4D35E'],
  ['#E7F0E3', '#4F772D', '#2F4F1F', '#DDE89A'],
  ['#F4E5EE', '#A23B72', '#6B254B', '#F3B3CF'],
  ['#FAEFD8', '#E09F3E', '#9A671C', '#335C67'],
  ['#E8E6F4', '#5E548E', '#3A335F', '#E0B1CB'],
  ['#E1F1EE', '#2A9D8F', '#1A675E', '#E9C46A'],
  ['#ECEAE7', '#3D405B', '#25273C', '#E07A5F'],
];

// Each pictogram is drawn in a 400x400 box. c = main colour, d = dark, a = accent.
const SHAPES = {
  mug: (c, d, a) => `<path d="M286 172h18a44 44 0 0 1 0 88h-18" fill="none" stroke="${d}" stroke-width="18"/><rect x="118" y="140" width="172" height="170" rx="20" fill="${c}"/><rect x="118" y="140" width="172" height="26" rx="13" fill="${d}"/><path d="M170 112q-14-18 0-34M214 112q-14-18 0-34" fill="none" stroke="${a}" stroke-width="9" stroke-linecap="round"/>`,
  kettle: (c, d, a) => `<path d="M292 190l52-36 12 16-52 62z" fill="${d}"/><path d="M130 150a74 74 0 0 1 148 0" fill="none" stroke="${d}" stroke-width="14"/><path d="M108 310q-8-128 96-128t96 128z" fill="${c}"/><rect x="176" y="164" width="56" height="22" rx="8" fill="${d}"/><circle cx="204" cy="158" r="11" fill="${a}"/><rect x="100" y="304" width="208" height="14" rx="7" fill="${d}"/>`,
  bowl: (c, d, a) => `<path d="M82 196h236a118 118 0 0 1-236 0z" fill="${c}"/><rect x="74" y="182" width="252" height="22" rx="11" fill="${d}"/><rect x="160" y="306" width="80" height="14" rx="7" fill="${d}"/><circle cx="160" cy="166" r="14" fill="${a}"/><circle cx="204" cy="158" r="18" fill="${a}"/><circle cx="246" cy="168" r="12" fill="${a}"/>`,
  candle: (c, d, a) => `<rect x="130" y="176" width="140" height="150" rx="16" fill="${c}"/><rect x="130" y="176" width="140" height="24" fill="${d}" opacity=".55"/><rect x="150" y="226" width="100" height="56" rx="6" fill="#fff" opacity=".85"/><path d="M200 176v-26" stroke="${d}" stroke-width="5"/><path d="M200 82q26 34 0 62q-26-28 0-62z" fill="${a}"/>`,
  headphones: (c, d, a) => `<path d="M96 232a104 104 0 0 1 208 0" fill="none" stroke="${d}" stroke-width="20" stroke-linecap="round"/><rect x="70" y="214" width="58" height="104" rx="24" fill="${c}"/><rect x="272" y="214" width="58" height="104" rx="24" fill="${c}"/><rect x="88" y="236" width="12" height="60" rx="6" fill="${a}"/><rect x="300" y="236" width="12" height="60" rx="6" fill="${a}"/>`,
  speaker: (c, d, a) => `<rect x="112" y="86" width="176" height="244" rx="26" fill="${c}"/><circle cx="200" cy="244" r="54" fill="${d}"/><circle cx="200" cy="244" r="22" fill="${a}"/><circle cx="200" cy="140" r="24" fill="${d}"/><circle cx="200" cy="140" r="9" fill="${a}"/>`,
  keyboard: (c, d, a) => `<rect x="54" y="150" width="292" height="126" rx="16" fill="${c}"/>${[0, 1, 2].map((r) => Array.from({ length: 9 }, (_, i) => `<rect x="${74 + i * 29}" y="${168 + r * 30}" width="21" height="21" rx="4" fill="${r === 1 && i === 4 ? a : d}"/>`).join('')).join('')}<rect x="132" y="258" width="136" height="0" />`,
  lamp: (c, d, a) => `<path d="M138 92h124l40 110H98z" fill="${c}"/><rect x="192" y="202" width="16" height="108" fill="${d}"/><rect x="140" y="306" width="120" height="18" rx="9" fill="${d}"/><path d="M118 214h164l-14 20H132z" fill="${a}" opacity=".7"/>`,
  charger: (c, d, a) => `<rect x="128" y="80" width="144" height="250" rx="26" fill="${c}"/><rect x="150" y="104" width="100" height="60" rx="8" fill="${d}"/>${[0, 1, 2, 3].map((i) => `<circle cx="${164 + i * 24}" cy="296" r="7" fill="${i < 3 ? a : d}"/>`).join('')}<path d="M208 190l-30 44h22l-8 40 32-48h-22z" fill="${a}"/>`,
  jacket: (c, d, a) => `<path d="M150 84l50 24 50-24 78 50-34 56-34-20v152H140V170l-34 20-34-56z" fill="${c}"/><path d="M200 108v214" stroke="${d}" stroke-width="6"/><path d="M150 84l50 24 50-24-16-8-34 16-34-16z" fill="${d}"/><rect x="216" y="216" width="30" height="34" rx="4" fill="${a}"/>`,
  backpack: (c, d, a) => `<path d="M150 104a50 50 0 0 1 100 0" fill="none" stroke="${d}" stroke-width="14"/><rect x="104" y="104" width="192" height="226" rx="46" fill="${c}"/><rect x="136" y="210" width="128" height="88" rx="16" fill="${d}"/><rect x="176" y="232" width="48" height="12" rx="6" fill="${a}"/><rect x="136" y="150" width="128" height="12" rx="6" fill="${d}" opacity=".6"/>`,
  shoe: (c, d, a) => `<path d="M62 262q0-70 52-70h34l56 44 100 22q34 8 34 44v6H62z" fill="${c}"/><rect x="54" y="300" width="292" height="24" rx="12" fill="${d}"/><path d="M168 208l22 26M196 224l22 26M226 238l20 24" stroke="${a}" stroke-width="8" stroke-linecap="round"/>`,
  bottle: (c, d, a) => `<rect x="172" y="64" width="56" height="40" rx="8" fill="${d}"/><path d="M160 108h80q26 26 26 60v142a20 20 0 0 1-20 20h-92a20 20 0 0 1-20-20V168q0-34 26-60z" fill="${c}"/><rect x="134" y="206" width="132" height="62" fill="#fff" opacity=".8"/><rect x="152" y="226" width="96" height="10" rx="5" fill="${a}"/>`,
  book: (c, d, a) => `<rect x="110" y="84" width="190" height="244" rx="10" fill="${c}"/><rect x="110" y="84" width="30" height="244" fill="${d}"/><rect x="166" y="130" width="108" height="16" rx="8" fill="#fff" opacity=".9"/><rect x="166" y="158" width="72" height="12" rx="6" fill="#fff" opacity=".6"/><circle cx="220" cy="246" r="34" fill="${a}"/>`,
  notebook: (c, d, a) => `<rect x="118" y="80" width="184" height="250" rx="12" fill="${c}"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="118" cy="${104 + i * 29}" r="8" fill="${d}"/>`).join('')}<rect x="254" y="80" width="16" height="250" fill="${a}"/><rect x="152" y="124" width="84" height="40" rx="6" fill="#fff" opacity=".85"/>`,
  pen: (c, d, a) => `<g transform="rotate(38 200 200)"><rect x="184" y="60" width="32" height="216" rx="8" fill="${c}"/><rect x="184" y="60" width="32" height="40" rx="8" fill="${d}"/><path d="M184 276h32l-16 50z" fill="${d}"/><rect x="216" y="78" width="8" height="84" rx="4" fill="${a}"/></g>`,
  plant: (c, d, a) => `<ellipse cx="150" cy="150" rx="34" ry="66" transform="rotate(-28 150 150)" fill="${c}"/><ellipse cx="250" cy="150" rx="34" ry="66" transform="rotate(28 250 150)" fill="${c}"/><ellipse cx="200" cy="124" rx="32" ry="74" fill="${d}"/><path d="M134 220h132l-18 108H152z" fill="${a}"/><rect x="124" y="208" width="152" height="24" rx="8" fill="${a}"/><rect x="124" y="208" width="152" height="24" rx="8" fill="#000" opacity=".12"/>`,
  planter: (c, d, a) => `<path d="M104 150h192l-26 172H130z" fill="${c}"/><rect x="92" y="130" width="216" height="34" rx="10" fill="${d}"/><path d="M128 208h144" stroke="${a}" stroke-width="12"/><path d="M134 248h132" stroke="${a}" stroke-width="12" opacity=".6"/>`,
  soap: (c, d, a) => `<rect x="92" y="186" width="216" height="118" rx="34" fill="${c}"/><rect x="132" y="218" width="136" height="54" rx="20" fill="${d}" opacity=".35"/><circle cx="128" cy="140" r="24" fill="${a}" opacity=".8"/><circle cx="178" cy="108" r="15" fill="${a}" opacity=".6"/><circle cx="270" cy="134" r="19" fill="${a}" opacity=".7"/>`,
  blocks: (c, d, a) => `<rect x="92" y="216" width="104" height="104" rx="12" fill="${c}"/><rect x="204" y="216" width="104" height="104" rx="12" fill="${d}"/><rect x="148" y="104" width="104" height="104" rx="12" fill="${a}"/><circle cx="144" cy="268" r="18" fill="#fff" opacity=".8"/><path d="M236 246h40M256 226v40" stroke="#fff" stroke-width="10" opacity=".8"/><path d="M178 178l22-44 22 44z" fill="#fff" opacity=".8"/>`,
  dice: (c, d, a) => `<rect x="80" y="130" width="150" height="150" rx="24" fill="${c}" transform="rotate(-10 155 205)"/><rect x="196" y="176" width="130" height="130" rx="22" fill="${d}" transform="rotate(12 261 241)"/>${[[122, 178], [155, 205], [188, 232]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#fff"/>`).join('')}<circle cx="240" cy="222" r="10" fill="${a}"/><circle cx="284" cy="264" r="10" fill="${a}"/>`,
  ball: (c, d, a) => `<circle cx="200" cy="206" r="118" fill="${c}"/><path d="M200 88v236M82 206h236" stroke="${d}" stroke-width="9"/><path d="M118 122q84 84 0 168M282 122q-84 84 0 168" fill="none" stroke="${d}" stroke-width="9"/><circle cx="200" cy="206" r="118" fill="none" stroke="${a}" stroke-width="6" opacity=".5"/>`,
  watch: (c, d, a) => `<rect x="162" y="48" width="76" height="304" rx="18" fill="${d}"/><circle cx="200" cy="200" r="86" fill="${c}"/><circle cx="200" cy="200" r="64" fill="#fff" opacity=".92"/><path d="M200 200v-42M200 200l30 18" stroke="${d}" stroke-width="9" stroke-linecap="round"/><circle cx="200" cy="200" r="8" fill="${a}"/>`,
  tent: (c, d, a) => `<path d="M200 92l150 226H50z" fill="${c}"/><path d="M200 92l52 226h-104z" fill="${d}"/><path d="M200 196l28 122h-56z" fill="${a}"/><rect x="40" y="314" width="320" height="12" rx="6" fill="${d}"/>`,
};

export const KINDS = Object.keys(SHAPES);

/** Returns an 800x800 SVG. `closeUp` gives a second, zoomed view for the product gallery. */
export function productArt(kind, paletteIndex = 0, { closeUp = false } = {}) {
  const [bg, c, d, a] = PALETTES[paletteIndex % PALETTES.length];
  const shape = (SHAPES[kind] || SHAPES.mug)(c, d, a);
  const body = closeUp
    ? `<rect width="400" height="400" fill="${a}" opacity=".35"/><g transform="translate(200 210) scale(1.5) translate(-200 -200)">${shape}</g>`
    : `<circle cx="200" cy="196" r="158" fill="#fff" opacity=".55"/><ellipse cx="200" cy="340" rx="112" ry="12" fill="#000" opacity=".1"/>${shape}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800"><rect width="400" height="400" fill="${bg}"/>${body}</svg>`;
}
