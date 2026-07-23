// TradeSafe API — Express sobre funciones serverless de Vercel.
// Variables de entorno necesarias: DATABASE_URL, JWT_SECRET.
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { q } from "../lib/db.js";
import { hasMoney, hasOffsite, checkLegality } from "../lib/validators.js";

const app = express();
app.use(express.json({ limit: "4mb" }));

const SECRET = process.env.JWT_SECRET || "cambia-esto-en-vercel";
const err = (res, code, status, message) => res.status(status).json({ error: { code, message } });
const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const shortCode = () => Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join("");

/* ---------- Auth middleware ---------- */
async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return err(res, "unauthorized", 401, "Sesión requerida");
  try {
    const p = jwt.verify(h.slice(7), SECRET);
    const r = await q("SELECT * FROM users WHERE id=$1", [p.sub]);
    if (!r.rowCount || r.rows[0].status !== "active") return err(res, "unauthorized", 401, "Cuenta no activa");
    req.me = r.rows[0];
    next();
  } catch {
    return err(res, "unauthorized", 401, "Sesión caducada, entra de nuevo");
  }
}
const staff = (req, res, next) => ["moderator", "admin"].includes(req.me.role) ? next() : err(res, "forbidden", 403, "Solo staff");
const admin = (req, res, next) => req.me.role === "admin" ? next() : err(res, "forbidden", 403, "Solo administración");
const token = (u) => jwt.sign({ sub: u.id, role: u.role }, SECRET, { expiresIn: "7d" });
const audit = (actorId, action, target, reason) =>
  q("INSERT INTO audit (actor_id, action, target, reason) VALUES ($1,$2,$3,$4)", [actorId, action, target ?? null, reason ?? null]);

/* ---------- Bootstrap / registro / login ---------- */
app.get("/api/bootstrap", async (_req, res) => {
  const r = await q("SELECT count(*)::int AS n FROM users");
  res.json({ hasUsers: r.rows[0].n > 0 });
});

async function createUser({ name, trainer, email, pass, friendCode }, role, verified) {
  if (!name || name.trim().length < 3) throw "El nombre público necesita al menos 3 caracteres";
  if (!trainer || !trainer.trim()) throw "Falta tu nombre de entrenador de HOME";
  if (!email || !/.+@.+\..+/.test(email)) throw "Email no válido";
  if (!pass || pass.length < 12) throw "La contraseña necesita al menos 12 caracteres";
  const limpio = String(friendCode || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (limpio.length !== 12) throw "La clave de amigo debe tener 12 caracteres (la de HOME, p. ej. ZVNUKXJHKHHM, o la de Switch de 12 dígitos)";
  const fc = /^\d{12}$/.test(limpio)
    ? "SW-" + limpio.slice(0, 4) + "-" + limpio.slice(4, 8) + "-" + limpio.slice(8, 12)
    : limpio;
  const hash = await bcrypt.hash(pass, 10);
  const r = await q(
    `INSERT INTO users (email, pass_hash, display_name, trainer_name, role, verified, friend_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [email.trim().toLowerCase(), hash, name.trim(), trainer.trim(), role, verified, fc]
  );
  return r.rows[0];
}

app.post("/api/setup", async (req, res) => {
  const n = await q("SELECT count(*)::int AS n FROM users");
  if (n.rows[0].n > 0) return err(res, "conflict", 409, "La instancia ya está configurada");
  try {
    const u = await createUser(req.body, "admin", true);
    await audit(u.id, "setup.admin_created", u.id, "Configuración inicial");
    res.status(201).json({ token: token(u) });
  } catch (e) {
    if (e && e.code === "23505") return err(res, "conflict", 409, "Email o nombre ya en uso");
    return err(res, "validation_error", 422, typeof e === "string" ? e : "Datos inválidos");
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const u = await createUser(req.body, "user", false);
    res.status(201).json({ token: token(u) });
  } catch (e) {
    if (e && e.code === "23505") return err(res, "conflict", 409, "Email o nombre ya en uso");
    return err(res, "validation_error", 422, typeof e === "string" ? e : "Datos inválidos");
  }
});

app.post("/api/login", async (req, res) => {
  const { email, pass } = req.body || {};
  const r = await q("SELECT * FROM users WHERE email=$1", [String(email || "").trim().toLowerCase()]);
  if (!r.rowCount || !(await bcrypt.compare(pass || "", r.rows[0].pass_hash)))
    return err(res, "unauthorized", 401, "Credenciales incorrectas");
  const u = r.rows[0];
  if (u.status === "suspended") return err(res, "forbidden", 403, "Cuenta suspendida por moderación");
  if (u.status === "deleted") return err(res, "unauthorized", 401, "Credenciales incorrectas");
  res.json({ token: token(u) });
});

/* ---------- Imágenes ---------- */
const IMG_RE = /^data:image\/(png|jpe?g|webp);base64,/;
async function saveImage(ownerId, tradeId, kind, dataUrl) {
  if (!IMG_RE.test(String(dataUrl || ""))) throw "Adjunta una imagen válida (captura de pantalla)";
  if (dataUrl.length > 3_500_000) throw "La imagen es demasiado grande; vuelve a intentarlo";
  const r = await q(`INSERT INTO images (owner_id, trade_id, kind, data) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ownerId, tradeId, kind, dataUrl]);
  return r.rows[0].id;
}

// Sirve una imagen; acepta el token por cabecera o por ?token= (para <img>)
app.get("/api/images/:id", async (req, res) => {
  const raw = (req.headers.authorization || "").startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : String(req.query.token || "");
  let viewer;
  try { viewer = jwt.verify(raw, SECRET); } catch { return err(res, "unauthorized", 401, "Sesión requerida"); }
  const r = await q(`SELECT * FROM images WHERE id=$1`, [req.params.id]);
  if (!r.rowCount) return err(res, "not_found", 404, "Imagen no encontrada");
  const img = r.rows[0];
  const uR = await q(`SELECT role FROM users WHERE id=$1`, [viewer.sub]);
  const esStaff = ["moderator", "admin"].includes(uR.rows[0]?.role);
  let ok = esStaff || img.owner_id === viewer.sub;
  if (!ok && img.trade_id) {
    const t = await q(`SELECT 1 FROM trades WHERE id=$1 AND (a_id=$2 OR b_id=$2)`, [img.trade_id, viewer.sub]);
    ok = t.rowCount > 0;
  }
  if (!ok) return err(res, "forbidden", 403, "Sin acceso a esta imagen");
  const m = img.data.match(IMG_RE);
  const b64 = img.data.slice(img.data.indexOf(",") + 1);
  res.setHeader("Content-Type", "image/" + (m[1] === "jpg" ? "jpeg" : m[1]));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(Buffer.from(b64, "base64"));
});

/* ---------- Verificación de cuenta HOME ---------- */
app.post("/api/verification-code", auth, async (req, res) => {
  if (req.me.verified) return err(res, "conflict", 409, "Tu cuenta ya está verificada");
  const code = shortCode() + shortCode().slice(0, 2);
  await q(`UPDATE users SET verif_code=$2 WHERE id=$1`, [req.me.id, code]);
  res.json({ code });
});

app.post("/api/verification", auth, async (req, res) => {
  if (req.me.verified) return err(res, "conflict", 409, "Tu cuenta ya está verificada");
  if (!req.me.verif_code) return err(res, "state_invalid", 409, "Genera primero tu código de verificación");
  try {
    await saveImage(req.me.id, null, "verification", req.body?.image);
  } catch (e) { return err(res, "validation_error", 422, typeof e === "string" ? e : "Imagen inválida"); }
  res.status(201).json({ ok: true });
});

/* ---------- Estado (una sola llamada trae todo lo visible) ---------- */
app.get("/api/state", auth, async (req, res) => {
  const me = req.me;
  const esStaff = ["moderator", "admin"].includes(me.role);

  const usersR = await q(`
    SELECT u.id, u.display_name, u.trainer_name, u.role, u.status, u.verified, u.created_at,
      u.friend_code, u.verif_code,
      (SELECT i.id FROM images i WHERE i.owner_id=u.id AND i.kind='verification'
       ORDER BY i.created_at DESC LIMIT 1) AS verif_image,
      (SELECT count(*)::int FROM trades t WHERE t.state='closed' AND (t.a_id=u.id OR t.b_id=u.id)) AS trades_done,
      (SELECT round(avg(CASE WHEN t.a_id=u.id THEN (t.flags->>'ratingForA')::numeric ELSE (t.flags->>'ratingForB')::numeric END),1)
         FROM trades t WHERE t.state='closed' AND (t.a_id=u.id OR t.b_id=u.id)
         AND (CASE WHEN t.a_id=u.id THEN t.flags->>'ratingForA' ELSE t.flags->>'ratingForB' END) IS NOT NULL) AS rating,
      (SELECT count(*)::int FROM sanctions s WHERE s.user_id=u.id AND (s.expires IS NULL OR s.expires>now())) AS sanctions_n
    FROM users u WHERE u.status <> 'deleted'`);

  const offersR = await q(`SELECT * FROM offers WHERE status='active' OR owner_id=$1 ORDER BY created_at DESC LIMIT 200`, [me.id]);

  const tradesR = esStaff
    ? await q(`SELECT * FROM trades WHERE a_id=$1 OR b_id=$1
               OR id IN (SELECT trade_id FROM disputes WHERE status='open') ORDER BY created_at DESC LIMIT 200`, [me.id])
    : await q(`SELECT * FROM trades WHERE a_id=$1 OR b_id=$1 ORDER BY created_at DESC LIMIT 200`, [me.id]);

  const tradeIds = tradesR.rows.map((t) => t.id);
  const msgsR = tradeIds.length
    ? await q(`SELECT * FROM messages WHERE trade_id = ANY($1) ORDER BY id`, [tradeIds])
    : { rows: [] };
  const proofsR = tradeIds.length
    ? await q(`SELECT id, trade_id, owner_id, kind FROM images WHERE trade_id = ANY($1) ORDER BY created_at`, [tradeIds])
    : { rows: [] };
  const fcByUser = Object.fromEntries(usersR.rows.map((u) => [u.id, u.friend_code]));

  const disputesR = esStaff
    ? await q(`SELECT * FROM disputes ORDER BY created_at DESC LIMIT 200`)
    : await q(`SELECT * FROM disputes WHERE reporter_id=$1 OR accused_id=$1 ORDER BY created_at DESC`, [me.id]);

  const sanctionsR = await q(`SELECT * FROM sanctions WHERE expires IS NULL OR expires>now() ORDER BY created_at DESC LIMIT 200`);
  const auditR = me.role === "admin" ? await q(`SELECT * FROM audit ORDER BY id DESC LIMIT 200`) : { rows: [] };

  res.json({
    me: { id: me.id, displayName: me.display_name, trainerName: me.trainer_name, role: me.role, verified: me.verified, createdAt: me.created_at, email: me.email, friendCode: me.friend_code, verifCode: me.verif_code },
    users: usersR.rows.map((u) => ({
      id: u.id, displayName: u.display_name, trainerName: u.trainer_name, role: u.role, status: u.status,
      verified: u.verified, createdAt: u.created_at,
      trades: u.trades_done, rating: u.rating, sanctions: u.sanctions_n,
      newAccount: (Date.now() - new Date(u.created_at)) / 86400000 < 30,
      ...(esStaff ? { verifCode: u.verif_code, verifImage: u.verif_image } : {}),
    })),
    offers: offersR.rows.map((o) => ({ id: o.id, ownerId: o.owner_id, status: o.status, createdAt: o.created_at, ...o.data })),
    trades: tradesR.rows.map((t) => ({
      id: t.id, code: t.code, offerId: t.offer_id, aId: t.a_id, bId: t.b_id, aGive: t.a_give,
      state: t.state, ...t.flags, events: t.events, createdAt: t.created_at,
      messages: msgsR.rows.filter((m) => m.trade_id === t.id).map((m) => ({ by: m.sender_id, system: !m.sender_id, kind: m.kind, text: m.body, at: m.created_at })),
      proofs: proofsR.rows.filter((p) => p.trade_id === t.id).map((p) => ({ id: p.id, by: p.owner_id, kind: p.kind })),
      ...(["in_progress", "post_proof", "disputed"].includes(t.state)
        ? { friendA: fcByUser[t.a_id] ?? null, friendB: fcByUser[t.b_id] ?? null } : {}),
    })),
    disputes: disputesR.rows.map((d) => ({
      id: d.id, tradeId: d.trade_id, reporterId: d.reporter_id, accusedId: d.accused_id,
      claim: d.claim, defense: d.defense, status: d.status, deadline: d.deadline, at: d.created_at,
    })),
    sanctions: sanctionsR.rows.map((s) => ({ id: s.id, userId: s.user_id, level: s.level, summary: s.summary, expires: s.expires, at: s.created_at, public: true })),
    audit: auditR.rows.map((a) => ({ id: a.id, actorId: a.actor_id, action: a.action, target: a.target, reason: a.reason, at: a.created_at })),
  });
});

/* ---------- Ofertas ---------- */
app.post("/api/offers", auth, async (req, res) => {
  const b = req.body || {};
  if (!b.species) return err(res, "validation_error", 422, "Falta la especie");
  if (!b.wants || b.wants.length < 3) return err(res, "validation_error", 422, "Describe qué buscas a cambio");
  if (hasMoney(b.wants) || hasMoney(b.species))
    return err(res, "money_offer_blocked", 422, "Detectamos una oferta con dinero real. TradeSafe es solo para trueques jugador-a-jugador.");
  const ivs = Array.isArray(b.ivs) ? b.ivs.map(Number) : [];
  const leg = checkLegality({ species: b.species, level: b.level, isShiny: !!b.isShiny, ivs });
  if (leg.flag === "impossible") return err(res, "impossible_pokemon", 422, "Ficha imposible: " + leg.reasons.join(" · "));
  const data = {
    species: String(b.species).trim(), level: Number(b.level), nature: b.nature || "—", ability: b.ability || "—",
    ball: b.ball || "Poké Ball", isShiny: !!b.isShiny, ivs,
    moves: (Array.isArray(b.moves) ? b.moves : []).map((m) => String(m).trim()).filter(Boolean).slice(0, 4),
    origin: b.origin || "—", wants: String(b.wants).trim(), legality: leg,
  };
  const r = await q(`INSERT INTO offers (owner_id, data) VALUES ($1,$2) RETURNING id`, [req.me.id, data]);
  res.status(201).json({ id: r.rows[0].id });
});

app.delete("/api/offers/:id", auth, async (req, res) => {
  await q(`UPDATE offers SET status='removed' WHERE id=$1 AND owner_id=$2`, [req.params.id, req.me.id]);
  res.json({ ok: true });
});

/* ---------- Intercambios ---------- */
async function getTrade(id) {
  const r = await q(`SELECT * FROM trades WHERE id=$1`, [id]);
  return r.rows[0] ?? null;
}
async function setTrade(t, patch, state, eventBy, eventTo) {
  const flags = { ...t.flags, ...patch };
  const events = eventTo ? [...t.events, { at: new Date().toISOString(), by: eventBy, to: eventTo }] : t.events;
  await q(`UPDATE trades SET flags=$2, state=$3, events=$4 WHERE id=$1`, [t.id, flags, state ?? t.state, JSON.stringify(events)]);
}

app.post("/api/trades", auth, async (req, res) => {
  const { offerId, give } = req.body || {};
  if (!give || give.trim().length < 3) return err(res, "validation_error", 422, "Describe qué ofreces tú");
  if (hasMoney(give)) return err(res, "money_offer_blocked", 422, "Las ofertas con dinero real están prohibidas");
  const o = await q(`SELECT * FROM offers WHERE id=$1 AND status='active'`, [offerId]);
  if (!o.rowCount) return err(res, "not_found", 404, "Oferta no disponible");
  if (o.rows[0].owner_id === req.me.id) return err(res, "conflict", 409, "No puedes proponerte a ti mismo");
  const r = await q(
    `INSERT INTO trades (code, offer_id, a_id, b_id, a_give, events)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [shortCode(), offerId, req.me.id, o.rows[0].owner_id, give.trim(),
     JSON.stringify([{ at: new Date().toISOString(), by: req.me.id, to: "proposal" }])]
  );
  res.status(201).json({ id: r.rows[0].id });
});

app.post("/api/trades/:id/action", auth, async (req, res) => {
  const t = await getTrade(req.params.id);
  if (!t || (t.a_id !== req.me.id && t.b_id !== req.me.id)) return err(res, "not_found", 404, "Intercambio no encontrado");
  const soyA = t.a_id === req.me.id;
  const me = req.me.id;
  const { action, value, image } = req.body || {};
  const f = t.flags;

  const invalid = () => err(res, "state_invalid", 409, "Acción no permitida en el estado actual");

  switch (action) {
    case "accept":
      if (t.state !== "proposal" || soyA) return invalid();
      await setTrade(t, {}, "contract", me, "contract"); break;
    case "decline":
    case "cancel":
      if (!["proposal", "contract"].includes(t.state)) return invalid();
      await setTrade(t, {}, "cancelled", me, "cancelled"); break;
    case "sign": {
      if (t.state !== "contract") return invalid();
      const p = soyA ? { signedA: true } : { signedB: true };
      const both = (soyA ? f.signedB : f.signedA) === true;
      await setTrade(t, p, both ? "pre_proof" : "contract", me, both ? "pre_proof" : "signed"); break;
    }
    case "proof": {
      if (t.state !== "pre_proof") return invalid();
      try { await saveImage(me, t.id, "proof_pre", image); }
      catch (e) { return err(res, "validation_error", 422, typeof e === "string" ? e : "Adjunta la captura con el código visible"); }
      const p = soyA ? { proofA: true } : { proofB: true };
      const both = (soyA ? f.proofB : f.proofA) === true;
      await setTrade(t, p, both ? "in_progress" : "pre_proof", me, both ? "in_progress" : "proof_pre"); break;
    }
    case "delivered": {
      if (t.state !== "in_progress") return invalid();
      const p = soyA ? { deliveredA: true } : { deliveredB: true };
      const both = (soyA ? f.deliveredB : f.deliveredA) === true;
      await setTrade(t, p, both ? "post_proof" : "in_progress", me, both ? "post_proof" : "delivered"); break;
    }
    case "confirm": {
      if (t.state !== "post_proof") return invalid();
      try { await saveImage(me, t.id, "proof_post", image); }
      catch (e) { return err(res, "validation_error", 422, typeof e === "string" ? e : "Adjunta la captura final"); }
      const p = soyA ? { confirmedA: true } : { confirmedB: true };
      const both = (soyA ? f.confirmedB : f.confirmedA) === true;
      await setTrade(t, p, both ? "closed" : "post_proof", me, both ? "closed" : "confirmed"); break;
    }
    case "rate": {
      if (t.state !== "closed") return invalid();
      const n = Number(value);
      if (!(n >= 1 && n <= 5)) return err(res, "validation_error", 422, "Valoración de 1 a 5");
      await setTrade(t, soyA ? { ratingForB: n } : { ratingForA: n }, null, me, null); break;
    }
    default:
      return err(res, "validation_error", 422, "Acción desconocida");
  }
  res.json({ ok: true });
});

app.post("/api/trades/:id/message", auth, async (req, res) => {
  const t = await getTrade(req.params.id);
  if (!t || (t.a_id !== req.me.id && t.b_id !== req.me.id)) return err(res, "not_found", 404, "Intercambio no encontrado");
  if (!["in_progress", "post_proof"].includes(t.state)) return err(res, "state_invalid", 409, "El chat se abre durante el intercambio");
  const texto = String(req.body?.text || "").trim().slice(0, 2000);
  if (!texto) return err(res, "validation_error", 422, "Mensaje vacío");
  if (hasMoney(texto)) {
    await q(`INSERT INTO messages (trade_id, sender_id, kind, body) VALUES ($1,NULL,'lacre',$2)`,
      [t.id, "🚫 Mensaje bloqueado: ofertas con dinero real prohibidas y registradas."]);
    return res.json({ ok: true, blocked: true });
  }
  await q(`INSERT INTO messages (trade_id, sender_id, body) VALUES ($1,$2,$3)`, [t.id, req.me.id, texto]);
  if (hasOffsite(texto))
    await q(`INSERT INTO messages (trade_id, sender_id, kind, body) VALUES ($1,NULL,'oro',$2)`,
      [t.id, "⚠ Llevar el trato fuera de TradeSafe elimina tu protección. Es la táctica nº1 de los estafadores."]);
  res.json({ ok: true });
});

/* ---------- Disputas ---------- */
app.post("/api/disputes", auth, async (req, res) => {
  const { tradeId, claim } = req.body || {};
  if (!claim || claim.trim().length < 20) return err(res, "validation_error", 422, "Describe lo ocurrido (mínimo 20 caracteres)");
  const t = await getTrade(tradeId);
  if (!t || (t.a_id !== req.me.id && t.b_id !== req.me.id)) return err(res, "not_found", 404, "Intercambio no encontrado");
  const accused = t.a_id === req.me.id ? t.b_id : t.a_id;
  await q(`INSERT INTO disputes (trade_id, reporter_id, accused_id, claim, deadline)
           VALUES ($1,$2,$3,$4, now() + interval '72 hours')`, [t.id, req.me.id, accused, claim.trim()]);
  await setTrade(t, {}, "disputed", req.me.id, "disputed");
  res.status(201).json({ ok: true });
});

app.post("/api/disputes/:id/defense", auth, async (req, res) => {
  const d = await q(`SELECT * FROM disputes WHERE id=$1`, [req.params.id]);
  if (!d.rowCount || d.rows[0].accused_id !== req.me.id) return err(res, "not_found", 404, "Disputa no encontrada");
  if (d.rows[0].status !== "open") return err(res, "state_invalid", 409, "La disputa ya está decidida");
  const texto = String(req.body?.text || "").trim();
  if (texto.length < 20) return err(res, "validation_error", 422, "Escribe tu defensa (mínimo 20 caracteres)");
  await q(`UPDATE disputes SET defense=$2 WHERE id=$1`, [req.params.id, texto]);
  res.json({ ok: true });
});

app.post("/api/disputes/:id/decide", auth, staff, async (req, res) => {
  const dR = await q(`SELECT * FROM disputes WHERE id=$1 AND status='open'`, [req.params.id]);
  if (!dR.rowCount) return err(res, "not_found", 404, "Disputa no encontrada o ya decidida");
  const d = dR.rows[0];
  if (d.reporter_id === req.me.id || d.accused_id === req.me.id)
    return err(res, "forbidden", 403, "No puedes decidir un caso en el que eres parte");
  const { sanction, level, summary } = req.body || {};
  if (sanction) {
    if (!["minor", "major", "ban"].includes(level)) return err(res, "validation_error", 422, "Nivel de sanción inválido");
    if (!summary || summary.trim().length < 20) return err(res, "validation_error", 422, "Escribe el resumen público del caso (mín. 20 caracteres, sin datos personales)");
    await q(`UPDATE disputes SET status='resolved_sanction', decided_by=$2 WHERE id=$1`, [d.id, req.me.id]);
    await q(`INSERT INTO sanctions (user_id, dispute_id, level, summary, expires)
             VALUES ($1,$2,$3,$4, CASE WHEN $3='minor' THEN now() + interval '365 days' ELSE NULL END)`,
      [d.accused_id, d.id, level, summary.trim()]);
    if (level === "ban") await q(`UPDATE users SET status='suspended' WHERE id=$1`, [d.accused_id]);
    await audit(req.me.id, "dispute.sanction." + level, d.id, summary.trim());
  } else {
    await q(`UPDATE disputes SET status='resolved_no_fault', decided_by=$2 WHERE id=$1`, [d.id, req.me.id]);
    const t = await getTrade(d.trade_id);
    if (t && t.state === "disputed") await setTrade(t, {}, "closed", req.me.id, "closed");
    await audit(req.me.id, "dispute.no_fault", d.id, "Sin infracción probada");
  }
  res.json({ ok: true });
});

/* ---------- Staff / admin ---------- */
app.post("/api/users/:id/verify", auth, staff, async (req, res) => {
  await q(`UPDATE users SET verified=true, verif_code=NULL WHERE id=$1`, [req.params.id]);
  await audit(req.me.id, "user.verify", req.params.id, "Captura con código correcta");
  res.json({ ok: true });
});

app.post("/api/users/:id/role", auth, admin, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "mediator", "moderator", "admin"].includes(role)) return err(res, "validation_error", 422, "Rol inválido");
  if (req.params.id === req.me.id) return err(res, "forbidden", 403, "No puedes cambiar tu propio rol");
  await q(`UPDATE users SET role=$2 WHERE id=$1`, [req.params.id, role]);
  await audit(req.me.id, "user.role", req.params.id, "→ " + role);
  res.json({ ok: true });
});

app.post("/api/users/:id/status", auth, admin, async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "suspended"].includes(status)) return err(res, "validation_error", 422, "Estado inválido");
  if (req.params.id === req.me.id) return err(res, "forbidden", 403, "No puedes suspenderte a ti mismo");
  await q(`UPDATE users SET status=$2 WHERE id=$1`, [req.params.id, status]);
  await audit(req.me.id, "user." + status, req.params.id, "Acción manual de admin");
  res.json({ ok: true });
});

/* ---------- Mi cuenta ---------- */
app.delete("/api/me", auth, async (req, res) => {
  await q(`UPDATE offers SET status='removed' WHERE owner_id=$1`, [req.me.id]);
  await q(`UPDATE users SET status='deleted', email='borrado-'||id, display_name='usuario-'||left(id::text,8), pass_hash='x' WHERE id=$1`, [req.me.id]);
  res.json({ ok: true });
});

app.get("/api/me/export", auth, async (req, res) => {
  const offers = await q(`SELECT * FROM offers WHERE owner_id=$1`, [req.me.id]);
  const trades = await q(`SELECT * FROM trades WHERE a_id=$1 OR b_id=$1`, [req.me.id]);
  res.json({
    perfil: { displayName: req.me.display_name, trainerName: req.me.trainer_name, email: req.me.email, createdAt: req.me.created_at },
    ofertas: offers.rows, intercambios: trades.rows,
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((e, _req, res, _next) => {
  console.error(e);
  err(res, "internal", 500, e.message === "Falta DATABASE_URL"
    ? "El servidor no tiene base de datos configurada (variable DATABASE_URL en Vercel)."
    : "Error interno del servidor");
});

export default app;
