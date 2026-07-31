// Conexión con Groq. La clave vive solo en el servidor: el navegador
// nunca la ve. Si no está configurada, las funciones de IA se apagan solas.

const API = "https://api.groq.com/openai/v1/chat/completions";

// Los modelos de Groq cambian a menudo; se pueden cambiar sin tocar el código
const MODELO_VISION = process.env.GROQ_MODEL_VISION || "qwen/qwen3.6-27b";
const MODELO_TEXTO = process.env.GROQ_MODEL_TEXTO || "openai/gpt-oss-120b";

export const iaActiva = () => !!process.env.GROQ_API_KEY;

async function llamar(cuerpo, segundos = 30) {
  if (!iaActiva()) throw "La asistencia con IA no está configurada";
  const corte = AbortSignal.timeout ? AbortSignal.timeout(segundos * 1000) : undefined;
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify(cuerpo),
    signal: corte,
  });
  if (r.status === 429) throw "La IA está saturada ahora mismo. Inténtalo en un minuto.";
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("groq", r.status, t.slice(0, 300));
    throw "La IA no pudo responder";
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "";
}

/* ---------- Leer la ficha de un Pokémon desde una captura ---------- */
const INSTRUCCIONES_FICHA = `Eres un lector de capturas de Pokémon HOME y de los juegos de Pokémon.
Extrae SOLO lo que veas escrito en la imagen. No inventes ni deduzcas nada.
Responde ÚNICAMENTE con un objeto JSON, sin texto alrededor y sin bloques de código, con esta forma:
{"species":string|null,"level":number|null,"nature":string|null,"ability":string|null,
 "ball":string|null,"origin":string|null,"gender":"M"|"F"|null,"shiny":boolean,
 "moves":string[],"ivs":number[]|null,"ot":string|null}
Reglas:
- "species": el nombre del Pokémon tal como aparece. Si ves una forma especial (Flor Eterna, de Galar, de Hisui, de Paldea, Mega...), inclúyela.
- "shiny": true solo si ves la marca de variocolor (estrella o destello) o la palabra shiny/variocolor.
- "moves": los movimientos listados, máximo 4, en el idioma de la imagen.
- "ivs": solo si la imagen muestra los seis valores numéricos; si no, null.
- Cualquier dato que no veas con claridad va como null.`;

export async function leerFicha(imagenBase64) {
  const txt = await llamar({
    model: MODELO_VISION,
    temperature: 0,
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INSTRUCCIONES_FICHA },
      {
        role: "user",
        content: [
          { type: "text", text: "Extrae la ficha de este Pokémon." },
          { type: "image_url", image_url: { url: imagenBase64 } },
        ],
      },
    ],
  }, 45);

  let d;
  try { d = JSON.parse(txt.replace(/^```(?:json)?|```$/g, "").trim()); }
  catch { throw "No se entendió la respuesta de la IA"; }

  const lista = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
  const nivel = Number(d.level);
  const ivs = Array.isArray(d.ivs) ? d.ivs.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 31) : [];
  return {
    species: d.species ? String(d.species).slice(0, 40) : null,
    level: Number.isFinite(nivel) && nivel >= 1 && nivel <= 100 ? nivel : null,
    nature: d.nature ? String(d.nature).slice(0, 30) : null,
    ability: d.ability ? String(d.ability).slice(0, 40) : null,
    ball: d.ball ? String(d.ball).slice(0, 30) : null,
    origin: d.origin ? String(d.origin).slice(0, 40) : null,
    gender: ["M", "F"].includes(d.gender) ? d.gender : null,
    shiny: !!d.shiny,
    moves: lista(d.moves).slice(0, 4).map((m) => m.slice(0, 40)),
    ivs: ivs.length === 6 ? ivs : [],
  };
}

/* ---------- Asistente de ayuda ---------- */
const INSTRUCCIONES_ASISTENTE = `Eres el asistente de TradeSafe, una aplicación para intercambiar Pokémon
de forma segura entre jugadores de Pokémon HOME. Respondes en el idioma de la persona, con frases cortas y claras.

Cómo funciona la app:
- Mercado: cada oferta muestra qué ofrece alguien y qué busca a cambio, con su reputación.
- Un intercambio pasa por 5 pasos: propuesta → contrato firmado por ambos → captura previa con el código del
  intercambio → intercambio real dentro de Pokémon HOME → captura final y confirmación de los dos.
- La captura previa se hace renombrando una caja de HOME con el código del intercambio. Así se demuestra que
  la foto es de ese trato y no una antigua.
- Las claves de amigo solo se revelan cuando el intercambio está en curso.
- Quien tiene menos reputación entrega primero.
- Hay disputas con 72 horas de defensa, arbitraje humano y derecho a apelar en 60 días.
- Está prohibido el dinero real y llevar el trato fuera de la app; ambas cosas se bloquean y registran.
- Inventario: la colección propia, desde donde se publica con un toque.
- Verificar la cuenta de HOME da la insignia y hace falta para sorteos y mensajes directos.

Reglas para ti:
- Ayuda con el uso de la app, la seguridad en intercambios y dudas generales de Pokémon HOME.
- No inventes funciones que no existan. Si no sabes algo, dilo y sugiere escribir al staff.
- No tases Pokémon ni digas si un intercambio es justo: eso lo decide cada persona.
- No des consejos que impliquen salir de la app ni usar dinero real; recuerda que eso está prohibido.
- Nunca pidas contraseñas, claves de amigo ni datos personales.
- Sé breve: dos o tres frases salvo que pidan detalle.`;

export async function asistente(historial, pregunta) {
  const previos = (Array.isArray(historial) ? historial : []).slice(-6).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 800),
  }));
  return llamar({
    model: MODELO_TEXTO,
    temperature: 0.3,
    max_tokens: 450,
    messages: [
      { role: "system", content: INSTRUCCIONES_ASISTENTE },
      ...previos,
      { role: "user", content: String(pregunta || "").slice(0, 800) },
    ],
  }, 30);
}
