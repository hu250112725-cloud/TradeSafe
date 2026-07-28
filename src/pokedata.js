// Movimientos, naturalezas y Poké Balls (ES/EN) para reconocer texto de capturas.
// Los datos viven en /pokedata.json y solo se descargan cuando hacen falta.
let D = null;
export async function cargarDatos() {
  if (!D) D = await fetch("/pokedata.json").then((r) => r.json());
  return D;
}

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const buscar = (a, es, en) => (txt, lang = "es") => {
  if (!D) return null;
  const id = D[a][norm(txt)];
  if (!id) return null;
  return (lang === "en" ? D[en][id] || D[es][id] : D[es][id] || D[en][id]) || null;
};
export const movimiento = buscar("M_A", "M_ES", "M_EN");
export const naturaleza = buscar("N_A", "N_ES", "N_EN");
export const pokeball = buscar("B_A", "B_ES", "B_EN");
