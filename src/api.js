/* Cliente de la API de TradeSafe.
   Mantiene un snapshot local del estado y lo refresca tras cada acción
   (y cada pocos segundos, para ver los movimientos de la otra parte). */

const BASE = "/api";

// token en localStorage con respaldo en memoria
let memToken = null;
const canLS = (() => { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch { return false; } })();
export const getToken = () => (canLS ? localStorage.getItem("ts_token") : memToken);
export const setToken = (t) => { if (canLS) { t ? localStorage.setItem("ts_token", t) : localStorage.removeItem("ts_token"); } else memToken = t; };

export let snap = null; // { me, users, offers, trades, disputes, sanctions, audit }

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    if (res.status === 401) { setToken(null); snap = null; }
    throw new Error(data?.error?.message || "Error de conexión con el servidor");
  }
  return data;
}

export const bootstrap = () => call("/bootstrap");
export async function setup(d) { const r = await call("/setup", { method: "POST", body: d }); setToken(r.token); await sync(); }
export async function register(d) { const r = await call("/register", { method: "POST", body: d }); setToken(r.token); await sync(); }
export async function login(d) { const r = await call("/login", { method: "POST", body: d }); setToken(r.token); await sync(); }
export function logout() { setToken(null); snap = null; }

let etag = null;
export async function sync() {
  if (!getToken()) { snap = null; etag = null; return; }
  const res = await fetch(BASE + "/state", {
    headers: { Authorization: "Bearer " + getToken(), ...(etag ? { "If-None-Match": etag } : {}) },
  });
  if (res.status === 304) return;            // nada cambió: ahorra datos y batería
  if (res.status === 401) { setToken(null); snap = null; etag = null; throw new Error("Sesión caducada, entra de nuevo"); }
  if (!res.ok) throw new Error("Error de conexión con el servidor");
  etag = res.headers.get("ETag");
  snap = await res.json();
}

export async function createOffer(d) { await call("/offers", { method: "POST", body: d }); await sync(); }
export async function removeOffer(id) { await call(`/offers/${id}`, { method: "DELETE" }); await sync(); }
export async function propose(offerId, items) { await call("/trades", { method: "POST", body: { offerId, items } }); await sync(); }
export async function setItems(id, items) { await call(`/trades/${id}/items`, { method: "POST", body: { items } }); await sync(); }
export async function askMediation(id) { await call(`/trades/${id}/mediation`, { method: "POST" }); await sync(); }
export async function takeMediation(id) { await call(`/trades/${id}/mediation/take`, { method: "POST" }); await sync(); }
export async function closeMediation(id, note) { await call(`/trades/${id}/mediation/close`, { method: "POST", body: { note } }); await sync(); }
export async function tradeAction(id, action, value, image) { await call(`/trades/${id}/action`, { method: "POST", body: { action, value, image } }); await sync(); }
export async function sendMessage(id, text, confirmOffsite) { await call(`/trades/${id}/message`, { method: "POST", body: { text, confirmOffsite } }); await sync(); }
export async function reportOffer(id, reason) { await call(`/offers/${id}/report`, { method: "POST", body: { reason } }); await sync(); }
export async function staffRemoveOffer(id, reason) { await call(`/offers/${id}/remove`, { method: "POST", body: { reason } }); await sync(); }
export async function openDispute(tradeId, claim) { await call("/disputes", { method: "POST", body: { tradeId, claim } }); await sync(); }
export async function defend(id, text) { await call(`/disputes/${id}/defense`, { method: "POST", body: { text } }); await sync(); }
export async function decide(id, body) { await call(`/disputes/${id}/decide`, { method: "POST", body }); await sync(); }
export async function verifyUser(id) { await call(`/users/${id}/verify`, { method: "POST" }); await sync(); }
export async function setRole(id, role) { await call(`/users/${id}/role`, { method: "POST", body: { role } }); await sync(); }
export async function setStatus(id, status) { await call(`/users/${id}/status`, { method: "POST", body: { status } }); await sync(); }
export async function deleteMe() { await call("/me", { method: "DELETE" }); logout(); }
export const exportMe = () => call("/me/export");
export async function requestVerifCode() { const r = await call("/verification-code", { method: "POST" }); await sync(); return r.code; }
export async function submitVerification(image) { await call("/verification", { method: "POST", body: { image } }); await sync(); }
export async function addWish(d) { await call("/wishlist", { method: "POST", body: d }); await sync(); }
export async function delWish(id) { await call(`/wishlist/${id}`, { method: "DELETE" }); await sync(); }
export async function saveProfile(d) { await call("/me/showcase", { method: "POST", body: d }); await sync(); }
export const getStats = () => call("/stats");
export async function createGiveaway(d) { await call("/giveaways", { method: "POST", body: d }); await sync(); }
export async function enterGiveaway(id) { await call(`/giveaways/${id}/enter`, { method: "POST" }); await sync(); }
export async function drawGiveaway(id) { const r = await call(`/giveaways/${id}/draw`, { method: "POST" }); await sync(); return r; }
export async function cancelGiveaway(id) { await call(`/giveaways/${id}/cancel`, { method: "POST" }); await sync(); }
export async function postBoard(body) { await call("/board", { method: "POST", body: { body } }); await sync(); }
export async function delBoard(id) { await call(`/board/${id}`, { method: "DELETE" }); await sync(); }
export const imageUrl = (id) => `/api/images/${id}?token=${encodeURIComponent(getToken() || "")}`;
export async function appeal(sanctionId, text) { await call(`/sanctions/${sanctionId}/appeal`, { method: "POST", body: { text } }); await sync(); }
export async function verifyEmail(code) { await call("/email/verify", { method: "POST", body: { code } }); await sync(); }
export async function resendEmail() { await call("/email/resend", { method: "POST" }); await sync(); }
export async function decideAppeal(sanctionId, overturn) { await call(`/sanctions/${sanctionId}/appeal/decide`, { method: "POST", body: { overturn } }); await sync(); }

import { getLang } from "./i18n.js";
export const fecha = (iso) => new Date(iso).toLocaleDateString(getLang(), { day: "numeric", month: "short", year: "numeric" });
export const userById = (id) => snap?.users.find((u) => u.id === id) ?? null;
export const sanctionsOf = (id) => snap?.sanctions.filter((s) => s.userId === id) ?? [];
