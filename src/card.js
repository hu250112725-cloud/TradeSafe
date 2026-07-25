// Dibuja la tarjeta de entrenador en un canvas y la devuelve como imagen.
// Formato 1080x1350 (4:5), el que mejor se ve en Facebook e Instagram.
import QRCode from "qrcode";
import { spriteShiny, spriteShinyAlt } from "./species.js";

const C = {
  papel: "#f5f8f4", alto: "#ffffff", tinta: "#121a16", suave: "#4a5a51",
  verde: "#0a6b3c", lacre: "#c93a17", oro: "#7c5e0a", oroP: "#faf1d8", cielo: "#ddeee2",
};

const RANGOS = {
  oro: { es: "Oro", en: "Gold", ic: "🥇" },
  plata: { es: "Plata", en: "Silver", ic: "🥈" },
  bronce: { es: "Bronce", en: "Bronze", ic: "🥉" },
  novato: { es: "Novato", en: "Rookie", ic: "◈" },
  marcado: { es: "Marcado", en: "Flagged", ic: "⚑" },
};

const TXT = {
  es: { titulo: "TARJETA DE ENTRENADOR", home: "Entrenador en HOME", rango: "Rango",
        trades: "INTERCAMBIOS", val: "VALORACIÓN", desde: "Miembro desde",
        verificado: "CUENTA VERIFICADA", sinVerificar: "SIN VERIFICAR",
        escanea: "Escanea para ver mi ficha", sinVal: "—", favorito: "POKÉMON FAVORITO" },
  en: { titulo: "TRAINER CARD", home: "HOME trainer", rango: "Rank",
        trades: "TRADES", val: "RATING", desde: "Member since",
        verificado: "VERIFIED ACCOUNT", sinVerificar: "UNVERIFIED",
        escanea: "Scan to see my profile", sinVal: "—", favorito: "FAVOURITE POKÉMON" },
};

// Rectángulo redondeado con el borde grueso y la sombra dura de la app
function ficha(x, y, w, h, r, ctx, { relleno = C.alto, borde = C.tinta, sombra = 8 } = {}) {
  const camino = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  if (sombra) {
    ctx.save(); ctx.translate(sombra, sombra);
    camino(); ctx.fillStyle = borde; ctx.fill(); ctx.restore();
  }
  camino();
  ctx.fillStyle = relleno; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = borde; ctx.stroke();
}

// Ajusta el tamaño de fuente hasta que el texto quepa en el ancho dado
function encaja(ctx, texto, max, base, peso = 900) {
  let t = base;
  do {
    ctx.font = `${peso} ${t}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    t -= 4;
  } while (ctx.measureText(texto).width > max && t > 26);
  return t;
}

// Carga una imagen y espera a que esté lista (null si falla)
function cargar(src) {
  return new Promise((ok) => {
    if (!src) return ok(null);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

export async function dibujarTarjeta(datos, url, lang = "es") {
  const T = TXT[lang] || TXT.es;
  const r = RANGOS[datos.rank] || RANGOS.novato;
  const marcado = datos.rank === "marcado";
  const W = 1080, H = 1350;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const fuente = (t, p = 700) => { ctx.font = `${p} ${t}px system-ui, -apple-system, "Segoe UI", sans-serif`; };

  // Fondo de papel con la trama de puntos
  ctx.fillStyle = C.papel; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(18,26,22,.07)";
  for (let x = 20; x < W; x += 34) for (let y = 20; y < H; y += 34) ctx.fillRect(x, y, 3, 3);

  // Marco principal
  ficha(46, 46, W - 100, H - 100, 34, ctx, { sombra: 12 });

  // Cabecera
  fuente(58, 900);
  ctx.fillStyle = C.tinta; ctx.textAlign = "left";
  ctx.fillText("Trade", 100, 160);
  const anchoTrade = ctx.measureText("Trade").width;
  ctx.fillStyle = C.verde; ctx.fillText("Safe", 100 + anchoTrade, 160);
  fuente(18, 700);
  ctx.fillStyle = C.suave;
  ctx.fillText(T.titulo.split("").join("\u2009"), 102, 196);

  // Sello del rango, arriba a la derecha
  ctx.save();
  ctx.translate(W - 210, 150); ctx.rotate(-0.05);
  const col = marcado ? C.lacre : C.verde;
  const fondo = marcado ? "#fdeee8" : C.cielo;
  ficha(-110, -42, 220, 84, 14, ctx, { relleno: fondo, borde: col, sombra: 0 });
  ctx.lineWidth = 4; ctx.strokeStyle = col;
  ctx.strokeRect(-120, -52, 240, 104);
  fuente(30, 900); ctx.fillStyle = col; ctx.textAlign = "center";
  ctx.fillText(`◈ ${(lang === "en" ? r.en : r.es).toUpperCase()}`, 0, 12);
  ctx.restore();

  // Línea doble bajo la cabecera
  ctx.strokeStyle = C.tinta; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(100, 232); ctx.lineTo(W - 100, 232); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(100, 242); ctx.lineTo(W - 100, 242); ctx.stroke();

  // Avatar circular (si lo hay) y nombre del entrenador
  const av = await cargar(datos.avatarUrl);
  const AVX = 100, AVY = 268, AVD = 190;
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(AVX + AVD / 2, AVY + AVD / 2, AVD / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    const lado = Math.min(av.width, av.height);
    ctx.drawImage(av, (av.width - lado) / 2, (av.height - lado) / 2, lado, lado, AVX, AVY, AVD, AVD);
    ctx.restore();
    ctx.beginPath(); ctx.arc(AVX + AVD / 2, AVY + AVD / 2, AVD / 2, 0, Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = C.tinta; ctx.stroke();
  }
  const nx = av ? AVX + AVD + 34 : 100;
  ctx.textAlign = "left";
  const anchoNombre = (datos.favorite ? W - 330 : W - 110) - nx;
  encaja(ctx, datos.trainer, anchoNombre, av ? 84 : 104);
  ctx.fillStyle = C.tinta;
  ctx.fillText(datos.trainer, nx, 348);
  fuente(27, 500); ctx.fillStyle = C.suave;
  ctx.fillText(`${T.home}: ${datos.homeName}`, nx, 390);
  // Sprite shiny del Pokémon favorito, a la derecha
  let sprite = null;
  if (datos.favorite) {
    sprite = await cargar(spriteShiny(datos.favorite));
    if (!sprite) sprite = await cargar(spriteShinyAlt(datos.favorite));
  }
  const SPD = 200, SPX = W - 118 - SPD, SPY = 258;
  if (sprite) {
    // halo suave para que destaque sobre el papel
    const g = ctx.createRadialGradient(SPX + SPD / 2, SPY + SPD / 2, 10, SPX + SPD / 2, SPY + SPD / 2, SPD / 2);
    g.addColorStop(0, "rgba(224,185,63,.30)");
    g.addColorStop(1, "rgba(224,185,63,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(SPX + SPD / 2, SPY + SPD / 2, SPD / 2, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(sprite, SPX, SPY, SPD, SPD);
  }
  if (datos.favorite) {
    fuente(17, 800); ctx.fillStyle = C.verde;
    ctx.fillText(T.favorito.split("").join("\u2009"), nx, 428);
    fuente(29, 800); ctx.fillStyle = C.tinta;
    ctx.fillText(`★ ${datos.favorite}`, nx, 462);
  }

  // Franja del rango
  ficha(100, 486, W - 200, 118, 20, ctx, {
    relleno: marcado ? "#fdeee8" : C.oroP, borde: marcado ? C.lacre : C.oro, sombra: 6,
  });
  fuente(64, 400); ctx.textAlign = "left";
  ctx.fillText(r.ic, 140, 570);
  fuente(20, 800); ctx.fillStyle = C.suave;
  ctx.fillText(T.rango.toUpperCase().split("").join("\u2009"), 232, 532);
  fuente(48, 900); ctx.fillStyle = C.tinta;
  ctx.fillText(lang === "en" ? r.en : r.es, 230, 586);

  // Dos cajas de estadísticas
  const cajaW = (W - 220) / 2;
  ficha(100, 628, cajaW, 156, 20, ctx, { sombra: 6 });
  ficha(120 + cajaW, 628, cajaW, 156, 20, ctx, { sombra: 6 });
  ctx.textAlign = "center";
  fuente(72, 900); ctx.fillStyle = C.tinta;
  ctx.fillText(String(datos.closedTrades), 100 + cajaW / 2, 716);
  ctx.fillText(datos.rating ? `★ ${datos.rating}` : T.sinVal, 120 + cajaW + cajaW / 2, 716);
  fuente(19, 800); ctx.fillStyle = C.suave;
  ctx.fillText(T.trades.split("").join("\u2009"), 100 + cajaW / 2, 756);
  ctx.fillText(T.val.split("").join("\u2009"), 120 + cajaW + cajaW / 2, 756);

  // Verificación y antigüedad
  ctx.textAlign = "left";
  fuente(30, 800);
  ctx.fillStyle = datos.verified ? C.verde : C.suave;
  ctx.fillText(`${datos.verified ? "✓" : "○"}  ${datos.verified ? T.verificado : T.sinVerificar}`, 100, 832);
  fuente(27, 500); ctx.fillStyle = C.suave;
  const desde = new Date(datos.memberSince).toLocaleDateString(lang === "en" ? "en-GB" : "es",
    { month: "long", year: "numeric" });
  ctx.fillText(`${T.desde} ${desde}`, 100, 872);

  // Código QR
  const qrURL = await QRCode.toDataURL(url, { margin: 1, width: 340, errorCorrectionLevel: "M",
    color: { dark: "#121a16", light: "#ffffff" } });
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = qrURL; });
  ficha(100, 900, 330, 330, 18, ctx, { sombra: 6 });
  ctx.drawImage(img, 112, 912, 306, 306);

  // Texto junto al QR
  fuente(30, 800); ctx.fillStyle = C.tinta;
  ctx.fillText(T.escanea, 466, 972);
  fuente(26, 700); ctx.fillStyle = C.verde;
  const corta = url.replace(/^https?:\/\//, "");
  ctx.fillText(corta.length > 28 ? corta.slice(0, 27) + "…" : corta, 466, 1012);

  // Pie
  ficha(466, 1048, W - 566, 182, 18, ctx, { relleno: C.cielo, sombra: 6 });
  fuente(25, 700); ctx.fillStyle = C.tinta;
  const nota = lang === "en"
    ? ["Every trade sealed with", "a signed contract and", "photo proof from both sides."]
    : ["Cada intercambio sellado", "con contrato firmado y", "pruebas de ambas partes."];
  nota.forEach((l, i) => ctx.fillText(l, 494, 1100 + i * 40));

  return cv;
}

export function aBlob(canvas) {
  return new Promise((ok) => canvas.toBlob((b) => ok(b), "image/png", 0.95));
}
