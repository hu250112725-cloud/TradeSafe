// Certificado de reputación en HTML, listo para imprimir o guardar como PDF.
// Mismo lenguaje visual que la app: dos tintas sobre papel.

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const RANGOS = {
  oro: { es: "Oro", en: "Gold", icono: "🥇" },
  plata: { es: "Plata", en: "Silver", icono: "🥈" },
  bronce: { es: "Bronce", en: "Bronze", icono: "🥉" },
  novato: { es: "Novato", en: "Rookie", icono: "◈" },
  marcado: { es: "Marcado", en: "Flagged", icono: "⚑" },
};

const fecha = (iso, lang) => iso
  ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "es", { day: "numeric", month: "long", year: "numeric" })
  : "—";

export function certHtml(c, url, lang = "es") {
  const en = lang === "en";
  const r = RANGOS[c.rank] || RANGOS.novato;
  const marcado = c.rank === "marcado";
  const T = en ? {
    titulo: "Reputation certificate", sub: "Sealed trades · TradeSafe",
    home: "HOME trainer", rango: "Rank",
    cerrados: "Closed trades", val: "Average rating", desde: "Member since", ultimo: "Last trade",
    verificado: "HOME account verified", noVerificado: "HOME account not verified",
    limpio: "No active sanctions", sancion: (n) => `${n} active sanction(s)`,
    emitido: "Issued on", verifica: "Verify this certificate at",
    nota: "This certificate reflects trades completed inside TradeSafe, each one with a signed contract and photographic proof from both parties.",
    imprimir: "🖨 Save as PDF",
  } : {
    titulo: "Certificado de reputación", sub: "Intercambios sellados · TradeSafe",
    home: "Entrenador en HOME", rango: "Rango",
    cerrados: "Intercambios cerrados", val: "Valoración media", desde: "Miembro desde", ultimo: "Último intercambio",
    verificado: "Cuenta de HOME verificada", noVerificado: "Cuenta de HOME sin verificar",
    limpio: "Sin sanciones activas", sancion: (n) => `${n} sanción(es) activa(s)`,
    emitido: "Emitido el", verifica: "Verifica este certificado en",
    nota: "Este certificado refleja intercambios completados dentro de TradeSafe, cada uno con contrato firmado y pruebas fotográficas de ambas partes.",
    imprimir: "🖨 Guardar como PDF",
  };

  return `<!doctype html>
<html lang="${en ? "en" : "es"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(c.trainer)} · ${T.titulo} · TradeSafe</title>
<style>
  :root {
    --papel:#f5f8f4; --papel-alto:#fff; --tinta:#121a16; --tinta-suave:#4a5a51;
    --verde:#0a6b3c; --lacre:#c93a17; --oro:#7c5e0a; --oro-papel:#faf1d8; --cielo:#ddeee2;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--papel);
    background-image:radial-gradient(rgba(18,26,22,.06) 1px,transparent 1px);background-size:18px 18px;
    color:var(--tinta);line-height:1.45;padding:20px 14px 40px;
  }
  .hoja{max-width:560px;margin:0 auto;background:var(--papel-alto);
    border:3px solid var(--tinta);border-radius:14px;box-shadow:6px 6px 0 var(--tinta);overflow:hidden}
  .cab{padding:22px 22px 16px;border-bottom:3px double var(--tinta);
    display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .marca{font-size:24px;font-weight:900;letter-spacing:-.5px;line-height:1}
  .marca span{color:var(--verde)}
  .sub{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--tinta-suave);margin-top:5px}
  .sello{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:2px;
    color:var(--verde);border:2px solid var(--verde);outline:2px solid var(--verde);outline-offset:2px;
    border-radius:6px;padding:5px 11px;transform:rotate(-2.5deg);background:var(--cielo)}
  .sello.rojo{color:var(--lacre);border-color:var(--lacre);outline-color:var(--lacre);background:#fdeee8}
  .cuerpo{padding:22px}
  .eyebrow{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--tinta-suave)}
  h1{font-size:15px;letter-spacing:1px;text-transform:uppercase;color:var(--tinta-suave);font-weight:700}
  .nombre{font-size:34px;font-weight:900;letter-spacing:-1px;line-height:1.05;margin:10px 0 4px;word-break:break-word}
  .home{font-size:13px;color:var(--tinta-suave)}
  .rango{display:flex;align-items:center;gap:10px;margin:18px 0;padding:12px 14px;
    border:2px solid var(--oro);background:var(--oro-papel);border-radius:10px}
  .rango.marcado{border-color:var(--lacre);background:#fdeee8}
  .rango .ic{font-size:26px;line-height:1}
  .rango .tx{font-size:19px;font-weight:800}
  .rango .lb{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--tinta-suave)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}
  .caja{border:2px solid var(--tinta);border-radius:10px;padding:11px 13px;box-shadow:3px 3px 0 var(--tinta)}
  .caja .n{font-size:24px;font-weight:900;line-height:1.1}
  .caja .l{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--tinta-suave);margin-top:2px}
  .linea{display:flex;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-top:1px solid #d8ded9}
  .ok{color:var(--verde);font-weight:700}
  .no{color:var(--lacre);font-weight:700}
  .nota{font-size:11.5px;color:var(--tinta-suave);margin-top:16px;padding-top:14px;border-top:2px dashed var(--tinta)}
  .pie{background:var(--cielo);padding:14px 22px;border-top:3px double var(--tinta);
    font-size:10.5px;color:var(--tinta-suave);word-break:break-all}
  .pie b{color:var(--tinta)}
  .btn{display:block;width:100%;max-width:560px;margin:16px auto 0;padding:13px;
    font-size:13px;font-weight:800;border:2px solid var(--tinta);border-radius:999px;
    background:var(--verde);color:#fff;box-shadow:4px 4px 0 var(--tinta);cursor:pointer}
  .btn:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--tinta)}
  @media print{
    body{background:#fff;padding:0}
    .hoja{box-shadow:none;border-width:2px;max-width:100%}
    .caja{box-shadow:none}
    .btn{display:none}
    @page{margin:14mm}
  }
</style>
</head>
<body>
  <div class="hoja">
    <div class="cab">
      <div>
        <div class="marca">Trade<span>Safe</span></div>
        <div class="sub">${T.sub}</div>
      </div>
      <div class="sello${marcado ? " rojo" : ""}">◈ ${esc(en ? r.en : r.es).toUpperCase()}</div>
    </div>

    <div class="cuerpo">
      <h1>${T.titulo}</h1>
      <div class="nombre">${esc(c.trainer)}</div>
      <div class="home">${T.home}: <b>${esc(c.homeName)}</b></div>

      <div class="rango${marcado ? " marcado" : ""}">
        <span class="ic">${r.icono}</span>
        <span>
          <span class="lb">${T.rango}</span><br />
          <span class="tx">${esc(en ? r.en : r.es)}</span>
        </span>
      </div>

      <div class="grid">
        <div class="caja"><div class="n">${c.closedTrades}</div><div class="l">${T.cerrados}</div></div>
        <div class="caja"><div class="n">${c.rating ? "★ " + esc(c.rating) : "—"}</div><div class="l">${T.val}</div></div>
      </div>

      <div class="linea"><span>${T.desde}</span><b style="margin-left:auto">${fecha(c.memberSince, lang)}</b></div>
      <div class="linea"><span>${T.ultimo}</span><b style="margin-left:auto">${fecha(c.lastTrade, lang)}</b></div>
      <div class="linea">
        <span class="${c.verified ? "ok" : "no"}">${c.verified ? "✓" : "✕"}</span>
        <span>${c.verified ? T.verificado : T.noVerificado}</span>
      </div>
      <div class="linea">
        <span class="${c.activeSanctions ? "no" : "ok"}">${c.activeSanctions ? "⚑" : "✓"}</span>
        <span>${c.activeSanctions ? T.sancion(c.activeSanctions) : T.limpio}</span>
      </div>

      <p class="nota">${T.nota}</p>
    </div>

    <div class="pie">
      ${T.emitido} <b>${fecha(c.issuedAt, lang)}</b><br />
      ${T.verifica} <b>${esc(url)}</b>
    </div>
  </div>
  <button class="btn" onclick="window.print()">${T.imprimir}</button>
</body>
</html>`;
}
