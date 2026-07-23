// Envío de correos vía Resend. Variable de entorno: RESEND_API_KEY.
// Si no hay clave o el envío falla, devolvemos ok:false y la app sigue
// funcionando (fail-open) para no bloquear a nadie por un problema de correo.

const FROM = process.env.MAIL_FROM || "TradeSafe <onboarding@resend.dev>";

export async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "sin-clave" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!r.ok) return { ok: false, reason: "envio-" + r.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: "red" };
  }
}

const wrap = (inner) => `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;
  background:#f5f8f4;color:#121a16;border:2px solid #121a16;border-radius:12px">
  <div style="font-weight:900;font-size:22px;margin-bottom:4px">Trade<span style="color:#0a6b3c">Safe</span></div>
  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4a5a51;margin-bottom:18px">
    Intercambios sellados · Sealed trades</div>
  ${inner}
  <p style="font-size:11px;color:#4a5a51;margin-top:20px">
    No respondas a este correo · Do not reply to this email</p>
</div>`;

export function mailCodigo(code) {
  return {
    subject: `TradeSafe: tu código es ${code} / your code is ${code}`,
    html: wrap(`
      <p><b>ES</b> — Confirma tu email escribiendo este código en la app:</p>
      <p><b>EN</b> — Confirm your email by entering this code in the app:</p>
      <div style="font-family:monospace;font-size:30px;font-weight:700;letter-spacing:6px;
        text-align:center;background:#fff;border:2px solid #0a6b3c;border-radius:10px;
        padding:14px;margin:14px 0;color:#0a6b3c">${code}</div>
      <p style="font-size:12px;color:#4a5a51">El código caduca en 24 horas · The code expires in 24 hours</p>`),
  };
}

const AVISOS = {
  proposal:  ["Nueva propuesta de intercambio", "New trade proposal", "Alguien propuso un intercambio por tu oferta.", "Someone proposed a trade for your offer."],
  accepted:  ["Propuesta aceptada", "Proposal accepted", "Aceptaron tu propuesta: toca firmar el contrato.", "Your proposal was accepted: time to sign the contract."],
  sign:      ["Falta tu firma", "Your signature is pending", "La otra parte ya firmó el contrato.", "The other party already signed the contract."],
  pre_proof: ["Toca subir la prueba", "Proof upload pending", "El contrato está firmado: sube tu captura con el código.", "The contract is signed: upload your screenshot with the code."],
  in_progress: ["¡A intercambiar!", "Time to trade!", "Ambas pruebas recibidas: hagan el intercambio en HOME.", "Both proofs received: make the trade in HOME."],
  post_proof:  ["Confirma tu intercambio", "Confirm your trade", "Ambos marcaron la entrega: sube la captura final y confirma.", "Both marked delivery: upload the final screenshot and confirm."],
  closed:    ["Intercambio cerrado 🎉", "Trade closed 🎉", "El intercambio quedó sellado. ¡Valora a tu contraparte!", "The trade is sealed. Rate your counterparty!"],
  disputed:  ["Has sido reportado", "You have been reported", "Se abrió una disputa en tu contra. Tienes 72 h para presentar tu defensa en la app.", "A dispute was opened against you. You have 72 h to submit your defense in the app."],
  sanction:  ["Decisión de moderación", "Moderation decision", "Se resolvió una disputa en la que eras parte. Revisa el resultado en la app; puedes apelar en 60 días.", "A dispute you were part of has been resolved. Check the outcome in the app; you may appeal within 60 days."],
  appeal:    ["Tu apelación fue decidida", "Your appeal was decided", "Un moderador distinto revisó tu apelación. Entra a la app para ver el resultado.", "A different moderator reviewed your appeal. Open the app to see the outcome."],
};

export function mailAviso(tipo, code) {
  const [sES, sEN, bES, bEN] = AVISOS[tipo] || AVISOS.closed;
  const sello = code ? ` (◈ ${code})` : "";
  return {
    subject: `TradeSafe: ${sES} / ${sEN}${sello}`,
    html: wrap(`
      <p><b>ES</b> — ${bES}</p>
      <p><b>EN</b> — ${bEN}</p>
      ${code ? `<p style="font-family:monospace;font-weight:700;color:#c93a17">◈ ${code}</p>` : ""}`),
  };
}
