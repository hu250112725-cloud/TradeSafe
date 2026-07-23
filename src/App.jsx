import { useState, useEffect, useReducer } from "react";
import * as api from "./api.js";
import { fecha, userById, sanctionsOf } from "./api.js";

/* ================= Piezas de UI ================= */
const Sello = ({ code, verde, grande }) => (
  <span className={`sello ${verde ? "verde" : ""} ${grande ? "grande" : ""}`}>◈ {code}</span>
);
const Aviso = ({ tipo, children }) => <div className={`aviso ${tipo}`}>{children}</div>;
const Vacio = ({ icono, children }) => (
  <div className="vacio"><div className="icono">{icono}</div><div className="txt-s">{children}</div></div>
);
const Campo = ({ label, error, children }) => (
  <label className="campo"><span>{label}</span>{children}{error && <div className="error">{error}</div>}</label>
);

function Rep({ userId }) {
  const u = userById(userId);
  if (!u) return null;
  return (
    <div className="tags">
      <b style={{ fontSize: 14 }}>{u.displayName}</b>
      {u.verified ? <span className="tag verde">✓ Verificado</span> : <span className="tag tenue">Sin verificar</span>}
      <span className="tag tenue">{u.trades} trades</span>
      {u.rating && <span className="tag oro">★ {u.rating}</span>}
      {u.sanctions > 0 && <span className="tag lacre">{u.sanctions} sanción</span>}
      {u.newAccount && <span className="tag lacre">Cuenta nueva</span>}
    </div>
  );
}

const STATES = { proposal: "Propuesta", contract: "Contrato", pre_proof: "Prueba previa", in_progress: "En curso", post_proof: "Prueba final", closed: "Cerrado", disputed: "En disputa", cancelled: "Cancelado" };
const ORDER = ["proposal", "contract", "pre_proof", "in_progress", "post_proof", "closed"];

function Via({ state }) {
  const idx = ORDER.indexOf(state);
  return (
    <>
      <div className="via">
        {ORDER.map((s, i) => (
          <span key={s} style={{ display: "contents" }}>
            {i > 0 && <span className={`via-linea ${idx >= 0 && i > idx ? "pendiente" : ""}`} />}
            <span className={`via-punto ${idx > i ? "hecho" : idx === i ? "actual" : ""}`}>{idx > i ? "✓" : i + 1}</span>
          </span>
        ))}
      </div>
      <div className="via-etiqueta" style={state === "disputed" || state === "cancelled" ? { color: "var(--lacre)" } : {}}>
        {STATES[state]}
      </div>
    </>
  );
}

/* Ejecuta una acción de API mostrando el error si falla */
function useRun(refresh) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); refresh(); }
    catch (e) { setErr(e.message); refresh(); }
    finally { setBusy(false); }
  };
  return { run, busy, err, setErr };
}

/* Abre el selector de fotos y devuelve la imagen comprimida como dataURL */
function pickImage() {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const file = inp.files && inp.files[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const max = 1100;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    };
    inp.click();
  });
}

/* Miniaturas de pruebas subidas */
function Pruebas({ trade, kind, me }) {
  const list = (trade.proofs || []).filter((p) => p.kind === kind);
  if (!list.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      {list.map((p) => (
        <a key={p.id} href={api.imageUrl(p.id)} target="_blank" rel="noreferrer">
          <img src={api.imageUrl(p.id)} alt="prueba"
            style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `2px solid var(--tinta)` }} />
        </a>
      ))}
    </div>
  );
}

/* ================= Autenticación ================= */
function AuthScreen({ refresh, hasUsers }) {
  const [mode, setMode] = useState(hasUsers ? "login" : "setup");
  const [f, setF] = useState({});
  const { run, busy, err, setErr } = useRun(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = () => run(async () => {
    if (mode === "login") return api.login({ email: f.email, pass: f.pass });
    const d = { name: f.name, trainer: f.trainer, email: f.email, pass: f.pass, friendCode: f.friendCode };
    return mode === "setup" ? api.setup(d) : api.register(d);
  });

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="ticket">
        <div className="ticket-cuerpo">
          <div className="h1">{mode === "setup" ? "Configuración inicial" : mode === "login" ? "Entrar" : "Crear cuenta"}</div>
          <p className="txt-s suave mt-6">
            {mode === "setup"
              ? "Esta instancia no tiene usuarios todavía. Crea la cuenta de administrador, que también gestiona la moderación."
              : mode === "login" ? "Accede con tu cuenta de TradeSafe." : "Solo pedimos lo mínimo. Nunca tu nombre real ni tu teléfono."}
          </p>
          <div className="mt-14">
            {mode !== "login" && (
              <>
                <Campo label="Nombre público en TradeSafe"><input value={f.name || ""} onChange={set("name")} placeholder="p. ej. AlexTrades" /></Campo>
                <Campo label="Nombre de entrenador (Pokémon HOME)"><input value={f.trainer || ""} onChange={set("trainer")} placeholder="El que aparece en tu perfil de HOME" /></Campo>
                <Campo label="Código de amigo (para añadirse en HOME)"><input value={f.friendCode || ""} onChange={set("friendCode")} placeholder="SW-1234-5678-9012" inputMode="numeric" className="mono" /></Campo>
              </>
            )}
            <Campo label="Email"><input type="email" value={f.email || ""} onChange={set("email")} inputMode="email" autoCapitalize="none" /></Campo>
            <Campo label={mode === "login" ? "Contraseña" : "Contraseña (mínimo 12 caracteres)"}>
              <input type="password" value={f.pass || ""} onChange={set("pass")} />
            </Campo>
            {err && <Aviso tipo="lacre">{err}</Aviso>}
            <button className="btn mt-14" disabled={busy} onClick={submit}>
              {busy ? "…" : mode === "setup" ? "Crear cuenta de administrador" : mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </div>
        </div>
        {hasUsers && (
          <div className="ticket-talon centrado">
            <button className="enlace-volver" onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>
              {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
            </button>
          </div>
        )}
      </div>
      <p className="txt-xs suave centrado mt-14">
        Al continuar aceptas los Términos: solo trueques jugador-a-jugador, nada de dinero real ni Pokémon modificados.
      </p>
    </div>
  );
}

/* ================= Publicar oferta ================= */
function Publicar({ refresh, done }) {
  const [f, setF] = useState({ level: 50, ivs: "31,31,31,31,31,31" });
  const { run, busy, err } = useRun(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = () => run(async () => {
    await api.createOffer({
      species: f.species, level: Number(f.level), nature: f.nature, ability: f.ability,
      ball: f.ball, isShiny: !!f.shiny,
      ivs: String(f.ivs).split(",").map((x) => parseInt(x.trim(), 10)),
      moves: (f.moves || "").split(",").map((m) => m.trim()).filter(Boolean),
      origin: f.origin, wants: f.wants,
    });
    done();
  });

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>Publicar oferta</h1>
      <div className="ficha">
        <Campo label="Especie"><input value={f.species || ""} onChange={set("species")} placeholder="p. ej. Gengar" /></Campo>
        <div className="fila-2">
          <Campo label="Nivel"><input type="number" min="1" max="100" value={f.level} onChange={set("level")} /></Campo>
          <Campo label="Naturaleza"><input value={f.nature || ""} onChange={set("nature")} placeholder="Tímida" /></Campo>
        </div>
        <div className="fila-2">
          <Campo label="Habilidad"><input value={f.ability || ""} onChange={set("ability")} /></Campo>
          <Campo label="Poké Ball"><input value={f.ball || ""} onChange={set("ball")} placeholder="Lujo Ball" /></Campo>
        </div>
        <Campo label="IVs (PS,Atq,Def,AtE,DfE,Vel)"><input value={f.ivs} onChange={set("ivs")} className="mono" /></Campo>
        <Campo label="Movimientos (separados por comas)"><input value={f.moves || ""} onChange={set("moves")} /></Campo>
        <Campo label="Juego de origen"><input value={f.origin || ""} onChange={set("origin")} placeholder="Escarlata" /></Campo>
        <label className="check"><input type="checkbox" checked={!!f.shiny} onChange={set("shiny")} /> ⭐ Es shiny</label>
        <Campo label="Qué buscas a cambio"><textarea value={f.wants || ""} onChange={set("wants")} placeholder="p. ej. Dreepy con habilidad oculta" /></Campo>
        <Aviso tipo="oro">La captura de HOME con el código de verificación se pedirá al iniciar cada intercambio.</Aviso>
        {err && <div className="mt-10"><Aviso tipo="lacre">{err}</Aviso></div>}
        <button className="btn mt-14" disabled={busy} onClick={submit}>{busy ? "…" : "Publicar"}</button>
      </div>
    </div>
  );
}

/* ================= Mercado ================= */
function Mercado({ me, refresh, onOffenders }) {
  const [open, setOpen] = useState(null);
  const [give, setGive] = useState("");
  const { run, busy, err } = useRun(refresh);
  const offers = api.snap.offers.filter((o) => o.status === "active");

  if (open) {
    const o = api.snap.offers.find((x) => x.id === open);
    if (!o || o.status !== "active") { setOpen(null); return null; }
    return (
      <div>
        <button className="enlace-volver" onClick={() => setOpen(null)}>← Volver al mercado</button>
        <div className="ticket mt-14">
          <div className="ticket-cuerpo">
            <div className="tags">
              <span className="h1">{o.species}</span>
              {o.isShiny && <span className="tag oro">⭐ Shiny</span>}
              <span className="tag tenue">Nv. {o.level}</span>
            </div>
            <div className="txt-xs suave mt-6">{o.nature} · {o.ability} · {o.ball} · Origen: {o.origin}</div>
            <div className="ivs mt-14">
              {o.ivs.map((v, i) => (
                <div key={i} className={`iv ${v === 31 ? "max" : ""}`}>
                  <div className="l">{["PS", "Atq", "Def", "AtE", "DfE", "Vel"][i]}</div><div className="n">{v}</div>
                </div>
              ))}
            </div>
            {o.moves?.length > 0 && <div className="tags mt-10">{o.moves.map((m) => <span key={m} className="tag">{m}</span>)}</div>}
          </div>
          <div className="ticket-talon"><span className="txt-xs">Busca: {o.wants}</span></div>
        </div>
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Ofrecido por</div>
          <Rep userId={o.ownerId} />
          {sanctionsOf(o.ownerId).map((s) => (
            <div className="mt-10" key={s.id}><Aviso tipo="lacre"><b>Sanción activa:</b> {s.summary}</Aviso></div>
          ))}
          {userById(o.ownerId)?.newAccount && <div className="mt-10"><Aviso tipo="lacre">Cuenta con menos de 30 días y poco historial. Extrema la precaución.</Aviso></div>}
        </div>
        {o.ownerId === me.id ? (
          <button className="btn peligro mt-14" disabled={busy} onClick={() => run(async () => { await api.removeOffer(o.id); setOpen(null); })}>
            Retirar mi oferta
          </button>
        ) : (
          <div className="ficha mt-14">
            <Campo label="¿Qué ofreces tú a cambio?" error={err}>
              <textarea value={give} onChange={(e) => setGive(e.target.value)} placeholder="p. ej. Dreepy nv.1, Miedosa, habilidad oculta, en Ente Ball" />
            </Campo>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await api.propose(o.id, give); setOpen(null); setGive(""); })}>
              {busy ? "…" : "Proponer intercambio"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 className="h1">Mercado</h1>
        <button className="btn mini secundario" onClick={onOffenders}>⚑ Infractores</button>
      </div>
      {offers.length === 0 ? (
        <Vacio icono="📦">Todavía no hay ofertas publicadas.<br />Sé quien estrene el mercado desde la pestaña <b>Publicar</b>.</Vacio>
      ) : offers.map((o) => (
        <button key={o.id} className="ficha" style={{ marginBottom: 14 }} onClick={() => setOpen(o.id)}>
          <div className="tags">
            <span className="h2">{o.species}</span>
            {o.isShiny && <span className="tag oro">⭐ Shiny</span>}
            <span className="tag tenue">Nv. {o.level}</span>
            {o.ownerId === me.id && <span className="tag verde">Tuya</span>}
          </div>
          <p className="txt-s suave mt-6" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Busca: {o.wants}</p>
          <div className="mt-10"><Rep userId={o.ownerId} /></div>
        </button>
      ))}
    </div>
  );
}
/* ================= Infractores ================= */
function Infractores({ onBack }) {
  const [q, setQ] = useState("");
  const shown = api.snap.sanctions.filter((s) => {
    const u = userById(s.userId);
    return ((u?.displayName ?? "") + " " + (u?.trainerName ?? "")).toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div>
      <button className="enlace-volver" onClick={onBack}>← Volver al mercado</button>
      <h1 className="h1" style={{ margin: "14px 0" }}>Lista de infractores</h1>
      <div style={{ marginBottom: 14 }}>
        <Aviso tipo="verde">Todas las marcas provienen de disputas resueltas con derecho a defensa y apelación. Sin datos personales, por diseño.</Aviso>
      </div>
      <input className="buscador" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" />
      {shown.length === 0 ? (
        <Vacio icono="✅">No hay infractores registrados{q ? " con ese nombre" : ""}.</Vacio>
      ) : shown.map((s) => {
        const u = userById(s.userId);
        return (
          <div key={s.id} className="ticket" style={{ marginBottom: 14, borderColor: "var(--lacre)", boxShadow: "4px 4px 0 var(--lacre)" }}>
            <div className="ticket-cuerpo">
              <div className="tags">
                <b style={{ color: "var(--lacre)", fontSize: 15 }}>{u?.displayName ?? "usuario eliminado"}</b>
                {u && <span className="tag tenue">Entrenador: {u.trainerName}</span>}
              </div>
              <p className="txt-s suave mt-10">{s.summary}</p>
            </div>
            <div className="ticket-talon lacre">
              <span className="txt-xs" style={{ color: "var(--lacre)", fontWeight: 700 }}>
                {s.expires ? `Caduca ${fecha(s.expires)}` : "⬛ Marca permanente"} · {fecha(s.at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Trades ================= */
function TradeView({ trade: id, me, refresh, onBack }) {
  const t = api.snap.trades.find((x) => x.id === id);
  const [msg, setMsg] = useState("");
  const [claim, setClaim] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [rated, setRated] = useState(0);
  const { run, busy, err } = useRun(refresh);
  if (!t) return null;
  const soyA = t.aId === me.id;
  const otroId = soyA ? t.bId : t.aId;
  const otro = userById(otroId);
  const offer = api.snap.offers.find((o) => o.id === t.offerId);
  const yoFirme = soyA ? t.signedA : t.signedB;
  const yoProbe = soyA ? t.proofA : t.proofB;
  const yoEntregue = soyA ? t.deliveredA : t.deliveredB;
  const yoConfirme = soyA ? t.confirmedA : t.confirmedB;
  const miDisputa = api.snap.disputes.find((d) => d.tradeId === t.id);
  const act = (action, value) => run(() => api.tradeAction(t.id, action, value));
  const act2 = (action, value, image) => run(() => api.tradeAction(t.id, action, value, image));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="enlace-volver" onClick={onBack}>← Mis trades</button>
        <Sello code={t.code} />
      </div>
      <Via state={t.state} />

      <div className="ticket mt-14">
        <div className="contrato-grid">
          <div>
            <div className="eyebrow">{soyA ? "Tú entregas" : `${otro?.displayName ?? "—"} entrega`}</div>
            <p className="txt-s mt-6">{t.aGive}</p>
          </div>
          <div>
            <div className="eyebrow">{soyA ? "Recibes" : "Tú entregas"}</div>
            <div className="h2 mt-6">{offer ? `${offer.species}${offer.isShiny ? " ⭐" : ""}` : "—"}</div>
            <div className="txt-xs suave">{offer ? `Nv. ${offer.level} · ${offer.nature}` : ""}</div>
          </div>
        </div>
        {(t.signedA && t.signedB) && (
          <div className="ticket-talon oro centrado">
            <span className="txt-xs" style={{ color: "var(--oro)", fontWeight: 700 }}>◈ Términos congelados y firmados · registro inmutable</span>
          </div>
        )}
      </div>

      <div className="ficha mt-14"><div className="eyebrow" style={{ marginBottom: 6 }}>Contraparte</div><Rep userId={otroId} /></div>
      {err && <div className="mt-14"><Aviso tipo="lacre">{err}</Aviso></div>}

      {t.state === "proposal" && (soyA ? (
        <div className="mt-14"><Aviso tipo="verde">Propuesta enviada. Esperando a que {otro?.displayName} la acepte.</Aviso>
          <button className="btn peligro mt-14" disabled={busy} onClick={() => act("cancel")}>Retirar propuesta</button></div>
      ) : (
        <div className="mt-14">
          <Aviso tipo="verde">{otro?.displayName} te propone este intercambio por tu oferta.</Aviso>
          <button className="btn mt-14" disabled={busy} onClick={() => act("accept")}>Aceptar y pasar al contrato</button>
          <button className="btn peligro" disabled={busy} onClick={() => act("decline")}>Rechazar</button>
        </div>
      ))}

      {t.state === "contract" && (
        <div className="mt-14">
          <div className="ficha txt-s">
            <div className="fila"><span>Tu firma</span><b style={{ color: yoFirme ? "var(--verde)" : "var(--tinta-suave)" }}>{yoFirme ? "✓ Firmado" : "Pendiente"}</b></div>
            <div className="fila"><span>Firma de {otro?.displayName}</span><b style={{ color: (soyA ? t.signedB : t.signedA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.signedB : t.signedA) ? "✓ Firmado" : "Pendiente"}</b></div>
          </div>
          {!yoFirme && <button className="btn mt-14" disabled={busy} onClick={() => act("sign")}>✍️ Firmar contrato</button>}
        </div>
      )}

      {t.state === "pre_proof" && (
        <div className="mt-14">
          <Aviso tipo="oro">Renombra una caja de HOME como <b className="mono">{t.code}</b>, mete dentro lo prometido y sube la captura. Así la prueba es de <b>este</b> intercambio, no una foto antigua.</Aviso>
          <div className="ficha mt-14 txt-s">
            <div className="fila"><span>Tu prueba</span><b style={{ color: yoProbe ? "var(--verde)" : "var(--tinta-suave)" }}>{yoProbe ? "✓ Recibida" : "Pendiente"}</b></div>
            <div className="fila"><span>Prueba de {otro?.displayName}</span><b style={{ color: (soyA ? t.proofB : t.proofA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.proofB : t.proofA) ? "✓ Recibida" : "Pendiente"}</b></div>
          </div>
          <Pruebas trade={t} kind="proof_pre" me={me} />
          {!yoProbe && (
            <button className="btn mt-14" disabled={busy} onClick={async () => {
              const img = await pickImage();
              if (img) act2("proof", null, img);
            }}>📷 Elegir captura con el código</button>
          )}
        </div>
      )}

      {t.state === "in_progress" && (
        <div className="mt-14">
          <div className="ficha txt-s">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Instrucciones</div>
            {(soyA ? t.friendB : t.friendA) && (
              <p style={{ marginBottom: 6 }}>Código de amigo de {otro?.displayName}: <b className="mono">{soyA ? t.friendB : t.friendA}</b></p>
            )}
            <p>Añádanse como amigos en HOME y realicen el intercambio ahí. {(() => {
              const ra = userById(t.aId), rb = userById(t.bId);
              if (!ra || !rb || ra.trades === rb.trades) return "Recomendado: intercambio simultáneo.";
              const primero = ra.trades < rb.trades ? t.aId : t.bId;
              return primero === me.id
                ? "Tú entregas primero: tu reputación es menor. Esta regla protege a quien más historial tiene que perder."
                : `${otro?.displayName} entrega primero (menor reputación).`;
            })()}</p>
          </div>
          <div className="ficha mt-14 txt-s">
            <div className="fila"><span>Tu entrega</span><b style={{ color: yoEntregue ? "var(--verde)" : "var(--tinta-suave)" }}>{yoEntregue ? "✓ Entregado" : "Pendiente"}</b></div>
            <div className="fila"><span>Entrega de {otro?.displayName}</span><b style={{ color: (soyA ? t.deliveredB : t.deliveredA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.deliveredB : t.deliveredA) ? "✓ Entregado" : "Pendiente"}</b></div>
          </div>
          {!yoEntregue && <button className="btn mt-14" disabled={busy} onClick={() => act("delivered")}>He entregado en el juego</button>}
        </div>
      )}

      {t.state === "post_proof" && (
        <div className="mt-14">
          <Aviso tipo="verde">Comprueba que lo recibido coincide con el contrato, sube la captura final y confirma.</Aviso>
          <Pruebas trade={t} kind="proof_post" me={me} />
          {!yoConfirme ? (
            <button className="btn mt-14" disabled={busy} onClick={async () => {
              const img = await pickImage();
              if (img) act2("confirm", null, img);
            }}>📷 Elegir captura final y confirmar</button>
          ) : (
            <div className="mt-14"><Aviso tipo="verde">Esperando la confirmación de {otro?.displayName}…</Aviso></div>
          )}
        </div>
      )}

      {t.state === "closed" && (
        <div className="mt-14">
          <div className="ticket">
            <div className="ticket-cuerpo centrado">
              <div style={{ fontSize: 36 }}>🎉</div>
              <div className="h1 mt-6" style={{ color: "var(--verde)" }}>Intercambio cerrado</div>
              <div className="mt-10"><Sello code={t.code} verde grande /></div>
            </div>
            <div className="ticket-talon centrado"><span className="txt-xs">Recibo sellado · {t.events.length} eventos con marca de tiempo</span></div>
          </div>
          {!(soyA ? t.ratingForB : t.ratingForA) && (
            <div className="ficha mt-14 centrado">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Valora a {otro?.displayName}</div>
              <div className="estrellas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={n <= rated ? "on" : ""} onClick={() => setRated(n)} aria-label={`${n} estrellas`}>⭐</button>
                ))}
              </div>
              <button className="btn mini" disabled={!rated || busy} style={{ margin: "12px auto 0", display: "block" }}
                onClick={() => act("rate", rated)}>
                Enviar valoración
              </button>
            </div>
          )}
        </div>
      )}

      {t.state === "disputed" && miDisputa && (
        <div className="mt-14">
          <Aviso tipo="lacre">
            <b>Disputa abierta {fecha(miDisputa.at)}.</b> {miDisputa.accusedId === me.id
              ? "Has sido reportado. Tienes 72 h para presentar tu defensa; un moderador humano decidirá después."
              : `${otro?.displayName} ha sido notificado y tiene 72 h de defensa antes de cualquier decisión.`}
          </Aviso>
          <div className="ficha mt-14 txt-s">
            <div className="eyebrow" style={{ marginBottom: 4 }}>Reporte</div>
            <p className="suave">{miDisputa.claim}</p>
            {miDisputa.defense && (<><div className="eyebrow" style={{ margin: "10px 0 4px" }}>Defensa</div><p className="suave">{miDisputa.defense}</p></>)}
          </div>
          {miDisputa.accusedId === me.id && !miDisputa.defense && miDisputa.status === "open" && (
            <div className="ficha mt-14">
              <Campo label="Tu defensa (con toda la evidencia que tengas)">
                <textarea value={claim} onChange={(e) => setClaim(e.target.value)} />
              </Campo>
              <button className="btn" disabled={busy} onClick={() => run(async () => { await api.defend(miDisputa.id, claim); setClaim(""); })}>
                Presentar defensa
              </button>
            </div>
          )}
        </div>
      )}

      {["in_progress", "post_proof"].includes(t.state) && (
        <>
          <div className="ticket mt-14">
            <div className="eyebrow" style={{ padding: "10px 14px 0" }}>Chat · guardado como evidencia</div>
            <div className="chat-caja">
              {t.messages.length === 0 && <div className="txt-xs suave centrado">Coordina aquí el intercambio. Nunca fuera de la app.</div>}
              {t.messages.map((m, i) => m.system
                ? <Aviso key={i} tipo={m.kind}>{m.text}</Aviso>
                : <div key={i} className={`burbuja ${m.by === me.id ? "mia" : "suya"}`}>{m.text}</div>)}
            </div>
            <div className="chat-form">
              <input className="chat-input" value={msg} onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) { run(() => api.sendMessage(t.id, msg.trim())); setMsg(""); } }}
                placeholder="Escribe un mensaje…" />
              <button className="btn mini" disabled={busy} onClick={() => { if (msg.trim()) { run(() => api.sendMessage(t.id, msg.trim())); setMsg(""); } }}>Enviar</button>
            </div>
          </div>
          {!showDispute ? (
            <button className="btn peligro mt-14" onClick={() => setShowDispute(true)}>⚑ Abrir disputa</button>
          ) : (
            <div className="ficha mt-14">
              <Campo label="¿Qué ocurrió? (el contrato, pruebas y chat se adjuntan solos)">
                <textarea value={claim} onChange={(e) => setClaim(e.target.value)} />
              </Campo>
              <Aviso tipo="oro">Los reportes falsos se penalizan.</Aviso>
              <button className="btn peligro mt-14" disabled={busy}
                onClick={() => run(async () => { await api.openDispute(t.id, claim); setShowDispute(false); setClaim(""); })}>
                Enviar reporte
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MisTrades({ me, refresh }) {
  const [open, setOpen] = useState(null);
  const mine = api.snap.trades.filter((t) => t.aId === me.id || t.bId === me.id);
  if (open) return <TradeView trade={open} me={me} refresh={refresh} onBack={() => setOpen(null)} />;
  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>Mis intercambios</h1>
      {mine.length === 0 ? (
        <Vacio icono="🤝">Aún no tienes intercambios.<br />Encuentra una oferta en el <b>Mercado</b> y haz tu primera propuesta.</Vacio>
      ) : mine.map((t) => {
        const otro = userById(t.aId === me.id ? t.bId : t.aId);
        const offer = api.snap.offers.find((o) => o.id === t.offerId);
        const pend = (t.state === "proposal" && t.bId === me.id) ||
          (t.state === "contract" && !(t.aId === me.id ? t.signedA : t.signedB)) ||
          (t.state === "pre_proof" && !(t.aId === me.id ? t.proofA : t.proofB));
        return (
          <button key={t.id} className="ficha" style={{ marginBottom: 14 }} onClick={() => setOpen(t.id)}>
            <div className="tags">
              <Sello code={t.code} />
              <span className={`tag ${t.state === "closed" ? "verde" : ["disputed", "cancelled"].includes(t.state) ? "lacre" : "tenue"}`}>{STATES[t.state]}</span>
              {pend && <span className="tag lacre">Te toca</span>}
            </div>
            <p className="txt-s mt-10">{offer?.species ?? "—"} ⇄ con <b>{otro?.displayName ?? "—"}</b></p>
          </button>
        );
      })}
    </div>
  );
}

/* ================= Perfil ================= */
function Perfil({ me, refresh }) {
  const u = userById(me.id);
  const { run, busy } = useRun(refresh);
  const exportar = () => run(async () => {
    const data = await api.exportMe();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "tradesafe-mis-datos.json"; a.click();
  });
  const borrar = () => {
    if (!confirm("¿Eliminar tu cuenta? Tus sanciones (si las hay) se conservan de forma anonimizada, como indica la política de privacidad.")) return;
    run(() => api.deleteMe());
  };
  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>Mi perfil</h1>
      <div className="ticket">
        <div className="ticket-cuerpo">
          <div className="h2">{me.displayName}</div>
          <div className="txt-xs suave">Entrenador HOME: <b>{me.trainerName}</b> · Rol: {me.role}</div>
          {me.friendCode && <div className="txt-xs suave mt-6">Código de amigo: <b className="mono">{me.friendCode}</b> <span className="suave">(visible solo para tu contraparte durante un intercambio)</span></div>}
          <div className="tags mt-10">
            {me.verified ? <span className="tag verde">✓ Cuenta verificada</span> : <span className="tag oro">Verificación pendiente</span>}
            <span className="tag tenue">{u?.trades ?? 0} intercambios</span>
            {u?.rating && <span className="tag oro">★ {u.rating}</span>}
            <span className="tag tenue">Desde {fecha(me.createdAt)}</span>
          </div>
        </div>
        <div className="ticket-talon"><span className="txt-xs">Tu perfil público nunca muestra tu email ni datos personales.</span></div>
      </div>
      {!me.verified && (
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Verificar mi cuenta HOME</div>
          {!me.verifCode ? (
            <>
              <p className="txt-s suave">Demuestra que la cuenta HOME es tuya: genera un código, escríbelo en tu mensaje de perfil (o en el nombre de una caja) y sube una captura donde se vea.</p>
              <button className="btn mini mt-10" disabled={busy} onClick={() => run(() => api.requestVerifCode())}>Generar código de verificación</button>
            </>
          ) : (
            <>
              <p className="txt-s">1. Escribe este código en tu perfil de HOME:</p>
              <div className="centrado mt-10"><Sello code={me.verifCode} grande /></div>
              <p className="txt-s mt-10">2. Haz una captura donde se vea el código y súbela:</p>
              <button className="btn mini mt-10" disabled={busy} onClick={async () => {
                const img = await pickImage();
                if (img) run(() => api.submitVerification(img));
              }}>📷 Subir captura de verificación</button>
              <p className="txt-xs suave mt-10">Un moderador la revisará y activará tu insignia ✓.</p>
            </>
          )}
        </div>
      )}
      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Privacidad y cuenta</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn mini secundario" disabled={busy} onClick={exportar}>Exportar mis datos</button>
          <button className="btn mini peligro" style={{ boxShadow: "3px 3px 0 var(--lacre)" }} disabled={busy} onClick={borrar}>Eliminar cuenta</button>
        </div>
      </div>
      <button className="btn secundario mt-14" onClick={() => { api.logout(); refresh(); }}>Cerrar sesión</button>
    </div>
  );
}

/* ================= Staff ================= */
function Staff({ me, refresh }) {
  const [pane, setPane] = useState("disputas");
  const [decideId, setDecideId] = useState(null);
  const [resumen, setResumen] = useState("");
  const [nivel, setNivel] = useState("minor");
  const { run, busy, err } = useRun(refresh);
  const esAdmin = me.role === "admin";
  const pendVerif = api.snap.users.filter((u) => !u.verified && u.status === "active");
  const abiertas = api.snap.disputes.filter((d) => d.status === "open");

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>Panel de staff</h1>
      <div className="tags" style={{ marginBottom: 14 }}>
        {[["disputas", `Disputas (${abiertas.length})`], ["verif", `Verificaciones (${pendVerif.length})`], ...(esAdmin ? [["usuarios", "Usuarios"], ["metricas", "Métricas"], ["audit", "Auditoría"]] : [])].map(([id, l]) => (
          <button key={id} className={`btn mini ${pane === id ? "" : "secundario"}`} onClick={() => setPane(id)}>{l}</button>
        ))}
      </div>
      {err && <div style={{ marginBottom: 14 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      {pane === "disputas" && (abiertas.length === 0 ? <Vacio icono="⚖️">No hay disputas abiertas.</Vacio> :
        abiertas.map((d) => {
          const rep = userById(d.reporterId);
          const acc = userById(d.accusedId);
          const t = api.snap.trades.find((x) => x.id === d.tradeId);
          const soyParte = d.reporterId === me.id || d.accusedId === me.id;
          return (
            <div key={d.id} className="ficha" style={{ marginBottom: 14 }}>
              <div className="tags"><Sello code={t?.code ?? "—"} /><span className="tag lacre">Abierta {fecha(d.at)}</span><span className="tag tenue">Defensa hasta {fecha(d.deadline)}</span></div>
              <p className="txt-s mt-10"><b>{rep?.displayName}</b> reporta a <b>{acc?.displayName}</b></p>
              <div className="txt-s suave mt-6"><b>Reporte:</b> {d.claim}</div>
              <div className="txt-s suave mt-6"><b>Defensa:</b> {d.defense ?? <i>aún sin presentar</i>}</div>
              {t && <div className="txt-xs suave mt-6"><b>Expediente:</b> {t.events.length} eventos · {t.messages.filter((m) => !m.system).length} mensajes de chat</div>}
              {soyParte ? (
                <div className="mt-10"><Aviso tipo="oro">Eres parte de este caso: debe decidirlo otro miembro del staff (recusación obligatoria).</Aviso></div>
              ) : decideId === d.id ? (
                <div className="mt-10">
                  <Campo label="Nivel de sanción">
                    <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
                      <option value="minor">Marca menor (pública, caduca en 12 meses)</option>
                      <option value="major">Marca mayor (pública, permanente)</option>
                      <option value="ban">Ban permanente + marca pública</option>
                    </select>
                  </Campo>
                  <Campo label="Resumen público del caso (sin datos personales, mín. 20 caracteres)">
                    <textarea value={resumen} onChange={(e) => setResumen(e.target.value)} />
                  </Campo>
                  {!d.defense && new Date(d.deadline) > new Date() && (
                    <Aviso tipo="oro">El plazo de defensa (72 h) sigue abierto y el acusado no ha respondido. Valora esperar antes de sancionar.</Aviso>
                  )}
                  <button className="btn peligro mt-14" disabled={busy}
                    onClick={() => run(async () => { await api.decide(d.id, { sanction: true, level: nivel, summary: resumen }); setDecideId(null); setResumen(""); })}>
                    Confirmar sanción
                  </button>
                  <button className="btn secundario" onClick={() => setDecideId(null)}>Cancelar</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn mini" disabled={busy} onClick={() => run(() => api.decide(d.id, { sanction: false }))}>Resolver sin sanción</button>
                  <button className="btn mini peligro" style={{ boxShadow: "3px 3px 0 var(--lacre)" }} onClick={() => { setDecideId(d.id); setResumen(""); }}>Sancionar…</button>
                </div>
              )}
            </div>
          );
        }))}

      {pane === "verif" && (pendVerif.length === 0 ? <Vacio icono="🪪">No hay verificaciones pendientes.</Vacio> :
        pendVerif.map((u) => (
          <div key={u.id} className="ficha" style={{ marginBottom: 14 }}>
            <div className="tags"><b>{u.displayName}</b><span className="tag tenue">Entrenador: {u.trainerName}</span><span className="tag tenue">Alta {fecha(u.createdAt)}</span></div>
            {u.verifCode
              ? <p className="txt-xs mt-6">Código asignado: <b className="mono">{u.verifCode}</b> — comprueba que aparece en la captura.</p>
              : <p className="txt-xs suave mt-6">Aún no ha generado su código de verificación.</p>}
            {u.verifImage ? (
              <a href={api.imageUrl(u.verifImage)} target="_blank" rel="noreferrer">
                <img src={api.imageUrl(u.verifImage)} alt="captura de verificación"
                  style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: "2px solid var(--tinta)", marginTop: 8, background: "#fff" }} />
              </a>
            ) : <p className="txt-xs suave mt-6">Sin captura subida todavía.</p>}
            {u.verifImage && (
              <button className="btn mini mt-10" disabled={busy} onClick={() => run(() => api.verifyUser(u.id))}>
                ✓ Marcar como verificado
              </button>
            )}
          </div>
        )))}

      {pane === "usuarios" && esAdmin && (
        <div className="ficha" style={{ overflowX: "auto" }}>
          <table className="tabla">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {api.snap.users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b><br /><span className="suave">{u.trainerName}</span></td>
                  <td>
                    <select className="select-mini" value={u.role} disabled={u.id === me.id || busy}
                      onChange={(e) => run(() => api.setRole(u.id, e.target.value))}>
                      {["user", "mediator", "moderator", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{u.status}</td>
                  <td>
                    {u.id !== me.id && (
                      <button className="btn mini secundario" disabled={busy}
                        onClick={() => run(() => api.setStatus(u.id, u.status === "suspended" ? "active" : "suspended"))}>
                        {u.status === "suspended" ? "Reactivar" : "Suspender"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pane === "metricas" && esAdmin && (
        <div className="metricas">
          {[
            ["Usuarios activos", api.snap.users.filter((u) => u.status === "active").length],
            ["Ofertas activas", api.snap.offers.filter((o) => o.status === "active").length],
            ["Trades cerrados", api.snap.trades.filter((t) => t.state === "closed").length],
            ["Trades en curso", api.snap.trades.filter((t) => !["closed", "cancelled"].includes(t.state)).length],
            ["Disputas abiertas", abiertas.length],
            ["Sanciones activas", api.snap.sanctions.length],
          ].map(([l, n]) => (
            <div className="metrica" key={l}><div className="num">{n}</div><div className="lab">{l}</div></div>
          ))}
        </div>
      )}

      {pane === "audit" && esAdmin && (api.snap.audit.length === 0 ? <Vacio icono="📜">Sin acciones registradas.</Vacio> : (
        <div className="ficha txt-xs" style={{ maxHeight: 340, overflowY: "auto" }}>
          {api.snap.audit.map((a) => (
            <div key={a.id} style={{ padding: "7px 0", borderBottom: "1px solid #d8ded9" }}>
              <b className="mono">{a.action}</b> · {userById(a.actorId)?.displayName ?? "sistema"} · {fecha(a.at)}
              <div className="suave">{a.reason}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================= App ================= */
export default function App() {
  const [, force] = useReducer((x) => x + 1, 0);
  const refresh = () => force();
  const [tab, setTab] = useState("mercado");
  const [verInfractores, setVerInfractores] = useState(false);
  const [phase, setPhase] = useState("cargando"); // cargando | sin-conexion | listo
  const [hasUsers, setHasUsers] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const b = await api.bootstrap();
        if (!vivo) return;
        setHasUsers(b.hasUsers);
        if (api.getToken()) { try { await api.sync(); } catch { /* sesión caducada */ } }
        setPhase("listo");
      } catch {
        if (vivo) setPhase("sin-conexion");
      }
    })();
    const iv = setInterval(async () => {
      if (api.getToken()) { try { await api.sync(); force(); } catch { /* red */ } }
    }, 8000);
    return () => { vivo = false; clearInterval(iv); };
  }, []);

  const me = api.snap?.me ?? null;
  const esStaff = me && ["moderator", "admin"].includes(me.role);
  const tabs = [["mercado", "Mercado"], ["publicar", "Publicar"], ["trades", "Trades"], ["perfil", "Perfil"], ...(esStaff ? [["staff", "Staff"]] : [])];

  return (
    <div className="frame">
      <header className="masthead">
        <div>
          <div className="wordmark">Trade<span className="safe">Safe</span></div>
          <div className="masthead-sub">Intercambios sellados · beta</div>
        </div>
        <Sello code="BETA" verde />
      </header>

      <main className="content">
        {phase === "cargando" ? (
          <Vacio icono="◈">Conectando…</Vacio>
        ) : phase === "sin-conexion" ? (
          <Vacio icono="📡">No se pudo conectar con el servidor.<br />Si acabas de desplegar, comprueba las variables <b className="mono">DATABASE_URL</b> y <b className="mono">JWT_SECRET</b> en Vercel.</Vacio>
        ) : !me ? (
          <AuthScreen refresh={refresh} hasUsers={hasUsers} />
        ) : verInfractores ? (
          <Infractores onBack={() => setVerInfractores(false)} />
        ) : tab === "mercado" ? (
          <Mercado me={me} refresh={refresh} onOffenders={() => setVerInfractores(true)} />
        ) : tab === "publicar" ? (
          <Publicar refresh={refresh} done={() => setTab("mercado")} />
        ) : tab === "trades" ? (
          <MisTrades me={me} refresh={refresh} />
        ) : tab === "perfil" ? (
          <Perfil me={me} refresh={refresh} />
        ) : (
          <Staff me={me} refresh={refresh} />
        )}
      </main>

      {me && phase === "listo" && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            {tabs.map(([id, label]) => (
              <button key={id} className={`tab ${tab === id && !verInfractores ? "activa" : ""}`}
                onClick={() => { setTab(id); setVerInfractores(false); }}>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
