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

const SHINY_LOCKED = ["keldeo", "victini", "meloetta", "hoopa", "volcanion", "cosmog", "cosmoem", "magearna", "kubfu", "urshifu", "glastrier", "spectrier", "calyrex", "koraidon", "miraidon", "zarude", "meltan", "melmetal"];

function checkLegality({ species, level, isShiny, ivs }) {
  const reasons = [];
  const lv = Number(level);
  if (!(lv >= 1 && lv <= 100)) reasons.push("Nivel fuera de rango (1–100)");
  if (!Array.isArray(ivs) || ivs.length !== 6 || ivs.some((v) => !(v >= 0 && v <= 31))) reasons.push("IVs fuera de rango (0–31)");
  if (isShiny && SHINY_LOCKED.includes(String(species || "").trim().toLowerCase()))
    reasons.push(`${species} tiene el shiny bloqueado en todos los juegos`);
  return { flag: reasons.length ? "impossible" : "ok", reasons };
}

export { hasMoney, hasOffsite, checkLegality };
