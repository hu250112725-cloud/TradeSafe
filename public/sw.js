// Recibe las notificaciones aunque la app esté cerrada.
const VERSION = "ts-1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const titulo = d.title || "TradeSafe";
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || "tradesafe",
      renotify: true,
      data: { url: d.url || "/" },
      vibrate: [12, 60, 12],
    }),
  );
});

// Al tocar la notificación: si la app ya está abierta, se enfoca esa pestaña
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) { c.navigate?.(destino); return c.focus(); }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
