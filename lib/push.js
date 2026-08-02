// Notificaciones que llegan aunque la app esté cerrada (Web Push).
// Si no hay claves configuradas, todo esto queda inactivo sin romper nada.
import webpush from "web-push";
import { q } from "./db.js";

const PUB = process.env.VAPID_PUBLIC;
const PRIV = process.env.VAPID_PRIVATE;
const CONTACTO = process.env.VAPID_CONTACT || "mailto:soporte@tradesafe.app";

export const pushActivo = () => !!(PUB && PRIV);
export const clavePublica = () => PUB || null;

if (pushActivo()) {
  try { webpush.setVapidDetails(CONTACTO, PUB, PRIV); }
  catch (e) { console.error("vapid", e); }
}

/* Envía a todos los dispositivos de una persona.
   Los que ya no valen (desinstaló la app, revocó permiso) se borran solos. */
export async function enviarPush(userId, { titulo, cuerpo, url, tag }) {
  if (!pushActivo() || !userId) return 0;
  const subs = await q(`SELECT id, endpoint, p256dh, auth FROM push_subs WHERE user_id=$1`, [userId]);
  if (!subs.rowCount) return 0;

  const carga = JSON.stringify({
    title: String(titulo || "TradeSafe").slice(0, 80),
    body: String(cuerpo || "").slice(0, 180),
    url: url || "/",
    tag: tag || "tradesafe",
  });

  let enviados = 0;
  await Promise.all(subs.rows.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga,
        { TTL: 86400, urgency: "normal" },
      );
      enviados++;
    } catch (e) {
      // 404 o 410: el navegador ya no acepta ese destino
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await q(`DELETE FROM push_subs WHERE id=$1`, [s.id]).catch(() => {});
      } else {
        console.error("push", e?.statusCode || e?.message);
      }
    }
  }));
  return enviados;
}

/* Varios destinatarios a la vez */
export async function enviarPushVarios(userIds, datos) {
  const unicos = [...new Set((userIds || []).filter(Boolean))];
  const r = await Promise.all(unicos.map((u) => enviarPush(u, datos).catch(() => 0)));
  return r.reduce((a, b) => a + b, 0);
}
