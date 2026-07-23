// Validadores del servidor (fuente de verdad; el cliente tiene copia para UX).
const MONEY = [
  /\b\d+\s?(eur|euros?|usd|d[oó]lares?|mxn|ars|clp|cop|pesos?)\b/i,
  /\d+\s?(€|\$|£)/,
  /(€|\$|£)\s?\d+/,
  /\b(paypal|bizum|venmo|cashapp|zelle|transferencia|western union|crypto|btc|eth|usdt)\b/i,
  /\b(vendo|compro|se vende|precio|pago real|dinero real|real money|rmt|wts|wtb)\b/i,
  /\b(tarjeta\s+regalo|gift\s?card|eshop\s+card)\b/i,
];
const hasMoney = (t) => MONEY.some((r) => r.test(String(t || "")));
const hasOffsite = (t) => /\b(whatsapp|discord|telegram|instagram|snap|dm|md|priv|hablamos\s+por|añ[aá]deme)\b/i.test(String(t || ""));

// Especies con el shiny bloqueado en TODOS los juegos donde se obtienen legalmente
const SHINY_LOCKED = [
  "victini", "keldeo", "meloetta", "hoopa", "volcanion", "magearna", "marshadow",
  "cosmog", "cosmoem", "zeraora",
  "kubfu", "urshifu", "glastrier", "spectrier", "calyrex", "zarude",
  "enamorus", "koraidon", "miraidon",
  "wo-chien", "chien-pao", "ting-lu", "chi-yu",
  "walking wake", "iron leaves", "gouging fire", "raging bolt", "iron boulder", "iron crown",
  "okidogi", "munkidori", "fezandipiti", "ogerpon", "terapagos", "pecharunt",
];
// Nivel mínimo al que puede existir cada especie (encuentros legales más bajos conocidos)
const MIN_LEVEL = {
  "koraidon": 68, "miraidon": 68, "eternatus": 60, "zacian": 70, "zamazenta": 70,
  "calyrex": 80, "glastrier": 75, "spectrier": 75, "kubfu": 10,
  "terapagos": 85, "pecharunt": 88, "ogerpon": 20,
  "wo-chien": 60, "chien-pao": 60, "ting-lu": 60, "chi-yu": 60,
  "mewtwo": 70, "rayquaza": 70, "kyogre": 70, "groudon": 70,
};
// Legendarios/singulares que en juego traen mínimo 3 IVs perfectos garantizados
const THREE_PERFECT = [
  "mewtwo", "mew", "lugia", "ho-oh", "celebi", "kyogre", "groudon", "rayquaza",
  "dialga", "palkia", "giratina", "arceus", "reshiram", "zekrom", "kyurem",
  "xerneas", "yveltal", "zygarde", "solgaleo", "lunala", "necrozma",
  "zacian", "zamazenta", "eternatus", "koraidon", "miraidon", "terapagos",
  "wo-chien", "chien-pao", "ting-lu", "chi-yu", "ogerpon", "pecharunt",
];

function checkLegality({ species, level, isShiny, ivs }) {
  const reasons = [];
  const sp = String(species || "").trim().toLowerCase();
  const lv = Number(level);
  if (!(lv >= 1 && lv <= 100)) reasons.push("Nivel fuera de rango (1–100)");
  if (!Array.isArray(ivs) || ivs.length !== 6 || ivs.some((v) => !(v >= 0 && v <= 31))) reasons.push("IVs fuera de rango (0–31)");
  if (isShiny && SHINY_LOCKED.includes(sp))
    reasons.push(`${species} tiene el shiny bloqueado en todos los juegos`);
  if (MIN_LEVEL[sp] && lv < MIN_LEVEL[sp])
    reasons.push(`${species} no puede existir por debajo del nivel ${MIN_LEVEL[sp]}`);
  const warnings = [];
  if (THREE_PERFECT.includes(sp) && Array.isArray(ivs) && ivs.length === 6 && ivs.filter((v) => v === 31).length < 3)
    warnings.push(`${species} legítimo trae al menos 3 IVs perfectos; esta ficha tiene menos (posible hack o error)`);
  return { flag: reasons.length ? "impossible" : warnings.length ? "warning" : "ok", reasons: reasons.concat(warnings) };
}

export { hasMoney, hasOffsite, checkLegality };
