// Lee una captura de Pokémon HOME y saca lo que puede: especie, nivel,
// naturaleza, ball y movimientos. Es una ayuda, no una verdad absoluta:
// el usuario siempre revisa y corrige antes de publicar.
import { detectarEspecie, dexId, nombrePorId } from "./species.js";
import { movimiento, naturaleza, pokeball, cargarDatos } from "./pokedata.js";

const CDN_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm";

let motor = null;
async function cargarMotor(lang) {
  if (motor?.lang === lang) return motor.worker;
  const { createWorker } = await import(/* @vite-ignore */ CDN_TESSERACT);
  const worker = await createWorker(lang === "en" ? "eng" : "spa");
  motor = { lang, worker };
  return worker;
}

/* Divide el texto en líneas limpias */
const lineas = (txt) => String(txt || "")
  .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

/* Ventanas de 1 a 3 palabras, sin reutilizar las ya consumidas:
   así "Air Slash" no produce además un "Slash" suelto. */
function* ventanas(linea) {
  const p = linea.split(" ").filter(Boolean);
  const usada = new Array(p.length).fill(false);
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= p.length; i++) {
      if (usada.slice(i, i + n).some(Boolean)) continue;
      const marcar = () => { for (let k = i; k < i + n; k++) usada[k] = true; };
      yield [p.slice(i, i + n).join(" "), marcar];
    }
  }
}

export function analizarTexto(txt, lang = "es") {
  const ls = lineas(txt);
  const todo = ls.join(" ");
  const r = { especie: null, nivel: null, naturaleza: null, ball: null, movimientos: [], shiny: false, origen: null };

  // Primero el nombre escrito: una coincidencia literal es la prueba más fuerte.
  // Si no aparece, se recurre al número de la Pokédex (N.º 0745), que va sobre
  // fondo claro; pero un dígito mal leído daría otra especie, así que va después.
  r.especie = detectarEspecie(todo);
  if (!r.especie) {
    const num = todo.match(/n\.?\s*[ºo°]?\s*(\d{3,4})\b/i);
    if (num) r.especie = nombrePorId(parseInt(num[1], 10), lang);
  }

  const nivel = todo.match(/(?:n[.\s]*v|lv|lvl|nivel|level)\.?\s*:?\s*(\d{1,3})\b/i);
  if (nivel && +nivel[1] >= 1 && +nivel[1] <= 100) r.nivel = +nivel[1];

  r.shiny = /\bshiny\b|variocolor|✦|★|✨/i.test(todo);

  const juego = todo.match(/(escarlata|p[uú]rpura|scarlet|violet|espada|escudo|sword|shield|arceus|legends[:\s]*z-?a|let'?s go|pok[eé]mon go|home)/i);
  if (juego) r.origen = juego[1].replace(/\s+/g, " ").trim();

  const vistos = new Set();
  for (const l of ls) {
    for (const [v, marcar] of ventanas(l)) {
      if (!r.naturaleza) { const n = naturaleza(v, lang); if (n) { r.naturaleza = n; marcar(); continue; } }
      if (!r.ball && /ball/i.test(v)) { const b = pokeball(v, lang); if (b) { r.ball = b; marcar(); continue; } }
      const m = movimiento(v, lang);
      // Se descartan los que coinciden con una especie (para no confundir
      // el nombre del Pokémon con un movimiento) y los repetidos
      if (m && !vistos.has(m) && r.movimientos.length < 4 && !dexId(v)) {
        vistos.add(m); r.movimientos.push(m); marcar();
      }
    }
  }
  return r;
}

/* Amplía y realza la imagen: el OCR acierta bastante más así */
function prepararImagen(dataUrl) {
  return new Promise((ok) => {
    const im = new Image();
    im.onerror = () => ok(dataUrl);
    im.onload = () => {
      try {
        const escala = Math.min(2.5, Math.max(1, 1600 / Math.max(im.width, im.height)));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * escala);
        c.height = Math.round(im.height * escala);
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(im, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          // gris y curva de contraste suave
          const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          const v = Math.max(0, Math.min(255, (g - 128) * 1.45 + 128));
          p[i] = p[i + 1] = p[i + 2] = v;
        }
        ctx.putImageData(d, 0, 0);
        ok(c.toDataURL("image/png"));
      } catch { ok(dataUrl); }
    };
    im.src = dataUrl;
  });
}

export async function leerCaptura(dataUrl, lang = "es", onProgreso) {
  await cargarDatos();
  const worker = await cargarMotor(lang);
  if (onProgreso) onProgreso(0.5);
  const preparada = await prepararImagen(dataUrl);
  const { data } = await worker.recognize(preparada);
  if (onProgreso) onProgreso(1);
  return { ...analizarTexto(data.text, lang), textoBruto: data.text };
}
