import { useState, useEffect, useReducer, useRef } from "react";
import * as api from "./api.js";
import { fecha, hora, horaEn, diaCorto, mismoDia, userById, sanctionsOf } from "./api.js";
import { tx, tErr, tSys, stateLabel, getLang, setLang } from "./i18n.js";
import { SPECIES, spriteShiny, sprite as spriteDe, spriteAlt, detectarEspecie, pideShiny, cargarFormas, nombreLimpio } from "./species.js";
import { dibujarTarjeta, aBlob } from "./card.js";

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

const RANGOS = { novato: "rankNovato", bronce: "rankBronce", plata: "rankPlata", oro: "rankOro", marcado: "rankMarcado" };

/* Marca de tiempo de la última lectura de cada chat (por dispositivo) */
const LEIDOS = "ts_chat_leido";
function leidos() {
  try { return JSON.parse(localStorage.getItem(LEIDOS) || "{}"); } catch { return {}; }
}
function marcarLeido(tradeId) {
  try {
    const m = leidos(); m[tradeId] = Date.now();
    localStorage.setItem(LEIDOS, JSON.stringify(m));
  } catch { /* sin almacenamiento */ }
}
/* Mensajes de la otra parte que aún no he visto */
function sinLeer(t, miId) {
  const desde = leidos()[t.id] || 0;
  return (t.messages || []).filter((m) => !m.system && m.by !== miId && new Date(m.at).getTime() > desde).length;
}

/* "En línea" o "Visto hace X" */
function Presencia({ lastSeen }) {
  if (!lastSeen) return null;
  const min = Math.floor((Date.now() - new Date(lastSeen)) / 60000);
  if (min < 3) return <span className="tag verde">{tx().enLinea}</span>;
  const t = min < 60 ? tx().haceMin(min)
    : min < 1440 ? tx().haceHoras(Math.floor(min / 60))
    : tx().haceDias(Math.floor(min / 1440));
  return <span className="tag tenue">{tx().visto(t)}</span>;
}

/* "hace 9 min" / "hace 3 h" / "hace 2 d" */
function haceRato(iso) {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return tx().ahoraMismo;
  return min < 60 ? tx().haceMin(min)
    : min < 1440 ? tx().haceHoras(Math.floor(min / 60))
    : tx().haceDias(Math.floor(min / 1440));
}

// Sprite shiny del Pokémon (se oculta solo si no carga)
function Sprite({ nombre, tam = 44, shiny = true, halo = false }) {
  const [paso, setPaso] = useState(0);   // 0 = principal · 1 = alternativo · 2 = sin sprite
  const url = !nombre ? null : paso === 0 ? spriteDe(nombre, shiny) : paso === 1 ? spriteAlt(nombre, shiny) : null;
  // Si no hay conexión al CDN o la especie no existe, se deja un hueco del mismo
  // tamaño para que la interfaz no dé saltos.
  if (!url) return (
    <span aria-hidden="true" style={{ width: tam, height: tam, flexShrink: 0, opacity: .3,
      display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: tam * 0.6 }}>◈</span>
  );
  const img = (
    <img src={url} alt="" width={tam} height={tam} loading="lazy"
      onError={() => setPaso(paso + 1)}
      style={{ width: tam, height: tam, objectFit: "contain", flexShrink: 0,
        filter: shiny ? "drop-shadow(0 2px 4px rgba(224,185,63,.45))" : "none" }} />
  );
  if (!halo) return img;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: tam + 12, height: tam + 12, borderRadius: "50%", flexShrink: 0,
      background: shiny
        ? "radial-gradient(circle, rgba(224,185,63,.28), rgba(224,185,63,0) 70%)"
        : "radial-gradient(circle, rgba(10,107,60,.14), rgba(10,107,60,0) 70%)" }}>
      {img}
    </span>
  );
}

function CampoEspecie({ label, value, onChange, placeholder }) {
  const [foco, setFoco] = useState(false);
  const v = String(value || "");
  const sug = v.length >= 2
    ? SPECIES.filter((e) => e.toLowerCase().startsWith(v.toLowerCase())).slice(0, 6)
    : [];
  const exacta = SPECIES.some((e) => e.toLowerCase() === v.toLowerCase());
  return (
    <div style={{ position: "relative" }}>
      <Campo label={label}>
        <input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 150)} autoComplete="off" />
      </Campo>
      {foco && sug.length > 0 && !exacta && (
        <div className="ficha" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: -6, padding: 6 }}>
          {sug.map((e) => (
            <button key={e} className="fila" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", font: "inherit", padding: "7px 6px" }}
              onMouseDown={() => onChange(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Rep({ userId, onFicha }) {
  const u = userById(userId);
  if (!u) return null;
  return (
    <div className="tags">
      {u.avatarId && (
        <img src={api.imageUrl(u.avatarId)} alt="" style={{ width: 26, height: 26, borderRadius: "50%",
          objectFit: "cover", border: "1.5px solid var(--tinta)" }} />
      )}
      <b style={{ fontSize: 14, cursor: onFicha ? "pointer" : "default", textDecoration: onFicha ? "underline" : "none", textUnderlineOffset: 3 }}
        onClick={onFicha ? () => onFicha(u.id) : undefined}>{u.displayName}</b>
      {u.rank && u.rank !== "novato" && (
        <span className={`tag ${u.rank === "oro" ? "oro" : u.rank === "marcado" ? "lacre" : "tenue"}`}>{tx()[RANGOS[u.rank]]}</span>
      )}
      {u.verified ? <span className="tag verde">{tx().verificado}</span> : <span className="tag tenue">{tx().sinVerificar}</span>}
      <span className="tag tenue">{u.trades} {tx().trades}</span>
      {u.rating && <span className="tag oro">★ {u.rating}</span>}
      {u.sanctions > 0 && <span className="tag lacre">{u.sanctions} {tx().sancion}</span>}
      {u.newAccount && <span className={`tag ${u.trades > 0 ? "tenue" : "oro"}`}>{u.trades > 0 ? tx().nuevo : tx().cuentaNueva}</span>}
    </div>
  );
}

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
        {stateLabel(state)}
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
    catch (e) { setErr(tErr(e.message)); refresh(); }
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

/* Construye la lista de avisos a partir del estado actual.
   Cada aviso tiene una clave estable para saber si ya se mostró. */
function calcularAvisos(me, esStaff) {
  if (!api.snap || !me) return [];
  const t9 = tx();
  const out = [];
  const nombre = (id) => userById(id)?.displayName ?? "—";
  for (const t of api.snap.trades) {
    const soyA = t.aId === me.id, soyB = t.bId === me.id;
    if (!soyA && !soyB) continue;
    const otro = nombre(soyA ? t.bId : t.aId);
    const base = { tradeId: t.id, code: t.code, at: t.events?.at(-1)?.at || t.createdAt };
    const push = (tipo, texto) => out.push({ ...base, key: `${t.id}:${tipo}:${t.state}`, texto });
    const nuevos = sinLeer(t, me.id);
    if (nuevos > 0) out.push({ ...base, key: `${t.id}:msg:${t.messages.at(-1)?.at}`, texto: t9.n_mensaje(otro) });
    if (t.state === "proposal" && soyB) push("proposal", t9.n_proposal(otro));
    else if (t.state === "contract") {
      const yoFirme = soyA ? t.signedA : t.signedB;
      const otroFirmo = soyA ? t.signedB : t.signedA;
      if (!yoFirme && otroFirmo) push("sign", t9.n_sign(otro));
      else if (!yoFirme) push("accepted", t9.n_accepted);
    }
    else if (t.state === "pre_proof" && !(soyA ? t.proofA : t.proofB)) push("pre_proof", t9.n_pre_proof);
    else if (t.state === "in_progress" && !(soyA ? t.deliveredA : t.deliveredB)) push("in_progress", t9.n_in_progress);
    else if (t.state === "post_proof" && !(soyA ? t.confirmedA : t.confirmedB)) push("post_proof", t9.n_post_proof);
    else if (t.state === "closed" && !(soyA ? t.ratingForB : t.ratingForA)) push("closed", t9.n_closed);
    else if (t.state === "disputed") {
      const d = api.snap.disputes.find((x) => x.tradeId === t.id && x.status === "open");
      if (d && d.accusedId === me.id && !d.defense) push("disputed", t9.n_disputed);
    }
  }
  for (const s of api.snap.sanctions.filter((x) => x.userId === me.id)) {
    if (s.appealStatus === "upheld" || s.appealStatus === "overturned")
      out.push({ key: `sanc:${s.id}:${s.appealStatus}`, texto: t9.n_appeal, at: s.at, tab: "perfil" });
    else if (s.appealStatus === "none")
      out.push({ key: `sanc:${s.id}:new`, texto: t9.n_sanction, at: s.at, tab: "perfil" });
  }
  for (const d of (api.snap.dm || [])) {
    if (sinLeerDM(d, me.id) > 0)
      out.push({ key: `dm:${d.id}:${d.messages.at(-1)?.at}`, texto: t9.n_mensaje(userById(d.otherId)?.displayName ?? "—"),
        at: d.lastAt, dm: d.id });
  }
  if (["mediator", "moderator", "admin"].includes(me.role)) {
    for (const t of api.snap.trades.filter((x) => x.aId !== me.id && x.bId !== me.id && x.mediationRequested && !x.mediatorId))
      out.push({ key: `med:${t.id}`, texto: t9.n_mediacion, at: t.events?.at(-1)?.at || t.createdAt, tradeId: t.id, code: t.code });
  }
  if (esStaff) {
    for (const d of api.snap.disputes.filter((x) => x.status === "open" && x.reporterId !== me.id && x.accusedId !== me.id))
      out.push({ key: `stf:disp:${d.id}`, texto: t9.n_staff_dispute, at: d.at, tab: "staff" });
    for (const u of api.snap.users.filter((x) => !x.verified && x.status === "active" && x.verifImage))
      out.push({ key: `stf:ver:${u.id}:${u.verifImage}`, texto: t9.n_staff_verif, at: u.createdAt, tab: "staff" });
    for (const s of api.snap.sanctions.filter((x) => x.appealStatus === "open"))
      out.push({ key: `stf:ape:${s.id}`, texto: t9.n_staff_appeal, at: s.appealedAt || s.at, tab: "staff" });
  }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/* Panel desplegable de notificaciones */
function Notificaciones({ avisos, noLeidas, onAbrirTrade, onAbrirDM, onIrTab, onLeerTodo, onCerrar }) {
  const [permiso, setPermiso] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  return (
    <div className="ficha" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="eyebrow">{tx().notiTitulo}</div>
        <button className="enlace-volver" onClick={onCerrar}>✕</button>
      </div>
      {permiso === "default" && (
        <button className="btn mini secundario" style={{ marginBottom: 10 }}
          onClick={async () => { try { setPermiso(await Notification.requestPermission()); } catch { /* no soportado */ } }}>
          {tx().notiActivar}
        </button>
      )}
      {permiso === "granted" && <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().notiActivas}</p>}
      {permiso === "denied" && <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().notiBloqueadas}</p>}
      {avisos.length === 0 ? (
        <p className="txt-s suave">{tx().notiVacio}</p>
      ) : (
        <>
          {avisos.slice(0, 12).map((a) => (
            <button key={a.key} className="fila" style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #d8ded9", padding: "9px 0", cursor: "pointer", font: "inherit" }}
              onClick={() => { a.dm ? onAbrirDM(a.dm) : a.tradeId ? onAbrirTrade(a.tradeId) : onIrTab(a.tab || "trades"); onCerrar(); }}>
              <span className="txt-s">
                {noLeidas.has(a.key) && <b style={{ color: "var(--lacre)" }}>● </b>}
                {a.texto}
              </span>
              {a.code && <Sello code={a.code} />}
            </button>
          ))}
          <button className="btn mini secundario mt-10" onClick={onLeerTodo}>{tx().notiMarcarLeidas}</button>
        </>
      )}
    </div>
  );
}

/* Banner para confirmar el email con el código de 6 dígitos */
function EmailBanner({ me, refresh }) {
  const [code, setCode] = useState("");
  const [hecho, setHecho] = useState(false);
  const [menu, setMenu] = useState(false);
  const [avisoVisto, setAvisoVisto] = useState(() => {
    try { return localStorage.getItem("ts_aviso_dm") === "1"; } catch { return false; }
  });
  const { run, busy, err } = useRun(refresh);
  if (me.emailVerified && !hecho) return null;
  if (hecho) return <div style={{ marginBottom: 14 }}><Aviso tipo="verde">{tx().emailListo}</Aviso></div>;
  return (
    <div className="ficha" style={{ marginBottom: 14, borderColor: "var(--oro)" }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{tx().emailTitulo}</div>
      <p className="txt-s suave">{tx().emailIntro}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input className="chat-input mono" style={{ flex: "1 1 120px", letterSpacing: 4, textAlign: "center" }}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric" placeholder={tx().phCodigoEmail} />
        <button className="btn mini" disabled={busy || code.length !== 6}
          onClick={() => run(async () => { await api.verifyEmail(code); setHecho(true); })}>{tx().btnConfirmarEmail}</button>
        <button className="btn mini secundario" disabled={busy}
          onClick={() => run(() => api.resendEmail())}>{tx().btnReenviar}</button>
      </div>
      {err && <div className="mt-10"><Aviso tipo="lacre">{err}</Aviso></div>}
    </div>
  );
}

/* Miniaturas de pruebas subidas */
function Pruebas({ trade, kind, me }) {
  const list = (trade.proofs || []).filter((p) => p.kind === kind);
  if (!list.length) return null;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      {list.map((p) => (
        <div key={p.id}>
          <a href={api.imageUrl(p.id)} target="_blank" rel="noreferrer">
            <img src={api.imageUrl(p.id)} alt="prueba"
              style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid var(--linea)" }} />
          </a>
          {p.revision && (
            <div className={`revision ${p.revision.codigoVisible && !p.revision.sospechas?.length ? "ok" : "duda"}`}
              title={p.revision.resumen}>
              {p.revision.codigoVisible && !p.revision.sospechas?.length
                ? `✓ ${tx().codigoOk}`
                : `⚠ ${p.revision.codigoVisible ? tx().revisionIA : tx().codigoNo}`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* Muestra el código de recuperación una sola vez, obligando a confirmarlo */
function CodigoRecuperacion({ code, onListo }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="ficha" style={{ borderColor: "var(--oro)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().codigoRecuperacion}</div>
      <Aviso tipo="oro">{tx().guardaCodigo}</Aviso>
      <div className="centrado mt-14">
        <span className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, wordBreak: "break-all" }}>{code}</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn mini secundario" onClick={async () => {
          try { await navigator.clipboard.writeText(code); } catch { /* sin permiso */ }
          setCopiado(true); setTimeout(() => setCopiado(false), 2500);
        }}>{copiado ? tx().certCopiado : tx().copiarCodigo}</button>
        <button className="btn mini" onClick={onListo}>{tx().yaLoGuarde}</button>
      </div>
    </div>
  );
}

/* Botones de acceso con Google y Facebook.
   Solo aparecen si el servidor tiene configuradas esas credenciales. */
function AccesoSocial({ cfg, onEntrar, onError, busy }) {
  const [cargando, setCargando] = useState(null);
  if (!cfg?.google && !cfg?.facebook) return null;

  const cargarScript = (src, id) => new Promise((ok, no) => {
    if (document.getElementById(id)) return ok();
    const s = document.createElement("script");
    s.src = src; s.id = id; s.async = true;
    s.onload = ok; s.onerror = () => no(new Error("script"));
    document.head.appendChild(s);
  });

  const google = async () => {
    setCargando("google");
    try {
      await cargarScript("https://accounts.google.com/gsi/client", "gsi");
      await new Promise((r) => setTimeout(r, 120));
      window.google.accounts.id.initialize({
        client_id: cfg.google,
        callback: async ({ credential }) => {
          try { onEntrar(await api.entrarGoogle(credential)); }
          catch (e) { onError(tErr(e.message)); }
          setCargando(null);
        },
      });
      window.google.accounts.id.prompt((n) => {
        // Si el aviso nativo no sale, se abre el diálogo completo
        if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) {
          const div = document.getElementById("gbtn");
          if (div) { window.google.accounts.id.renderButton(div, { theme: "outline", size: "large", width: 300 }); div.style.display = "block"; }
          setCargando(null);
        }
      });
    } catch { onError(tErr("Error de conexión con el servidor")); setCargando(null); }
  };

  const facebook = async () => {
    setCargando("facebook");
    try {
      await cargarScript("https://connect.facebook.net/es_ES/sdk.js", "fbsdk");
      window.FB.init({ appId: cfg.facebook, cookie: true, xfbml: false, version: "v19.0" });
      window.FB.login(async (resp) => {
        if (resp.authResponse?.accessToken) {
          try { onEntrar(await api.entrarFacebook(resp.authResponse.accessToken)); }
          catch (e) { onError(tErr(e.message)); }
        }
        setCargando(null);
      }, { scope: "public_profile,email" });
    } catch { onError(tErr("Error de conexión con el servidor")); setCargando(null); }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {cfg.google && (
        <button className="btn-social" disabled={busy || cargando} onClick={google}>
          <span className="ic-social">G</span>{cargando === "google" ? "…" : tx().conGoogle}
        </button>
      )}
      <div id="gbtn" style={{ display: "none", margin: "10px 0" }} />
      {cfg.facebook && (
        <button className="btn-social fb" disabled={busy || cargando} onClick={facebook}>
          <span className="ic-social">f</span>{cargando === "facebook" ? "…" : tx().conFacebook}
        </button>
      )}
      <div className="separador-o"><span>{tx().oBien}</span></div>
    </div>
  );
}

/* Faltan entrenador y clave de amigo tras entrar con Google o Facebook */
function CompletarPerfil({ onListo }) {
  const [f, setF] = useState({});
  const { run, busy, err } = useRun(() => {});
  return (
    <div style={{ paddingTop: 12 }}>
      <div className="ficha">
        <div className="h1">{tx().completarTitulo}</div>
        <p className="txt-s suave mt-6">{tx().completarIntro}</p>
        <div className="mt-14">
          <Campo label={tx().lblEntrenador}>
            <input value={f.trainer || ""} onChange={(e) => setF({ ...f, trainer: e.target.value })} placeholder={tx().phEntrenador} />
          </Campo>
          <Campo label={tx().lblClave}>
            <input value={f.friendCode || ""} onChange={(e) => setF({ ...f, friendCode: e.target.value })}
              placeholder={tx().phClave} autoCapitalize="characters" className="mono" />
          </Campo>
          <Campo label={tx().lblNombrePublico}>
            <input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tx().phNombre} />
          </Campo>
          {err && <Aviso tipo="lacre">{err}</Aviso>}
          <button className="btn mt-14" disabled={busy || !f.trainer || !f.friendCode}
            onClick={() => run(async () => onListo(await api.completarPerfil(f)))}>
            {busy ? "…" : tx().btnCompletar}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Se muestra cuando un invitado intenta algo que requiere cuenta */
function PideCuenta({ onCrear, onCerrar }) {
  return (
    <div className="ficha" style={{ marginBottom: 14, borderColor: "var(--verde)" }}>
      <div className="h2">{tx().necesitaCuenta}</div>
      <p className="txt-s suave mt-6">{tx().necesitaCuentaTxt}</p>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn mini" onClick={onCrear}>{tx().crearGratis}</button>
        <button className="btn mini secundario" onClick={onCerrar}>{tx().soloMirar}</button>
      </div>
    </div>
  );
}

/* Anuncios del staff: lo primero que se ve al entrar.
   Los urgentes no se pueden ocultar; el resto se recuerda por dispositivo. */
function Anuncios() {
  const [ocultos, setOcultos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ts_anuncios") || "[]"); } catch { return []; }
  });
  // Los urgentes se muestran a pantalla completa hasta que se confirman
  const [vistos, setVistos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ts_anuncios_vistos") || "[]"); } catch { return []; }
  });
  // Los avisos personales solo se muestran a su destinatario: el staff los ve
  // en su panel, pero no le interrumpen la pantalla.
  const mio = api.snap.me?.id;
  const activos = (api.snap.announcements || [])
    .filter((a) => a.active !== false)
    .filter((a) => !a.userId || a.userId === mio);
  const urgente = activos.find((a) => a.level === "critical" && !vistos.includes(a.id));

  const confirmar = (id) => {
    const n = [...vistos, id].slice(-50);
    setVistos(n);
    try { localStorage.setItem("ts_anuncios_vistos", JSON.stringify(n)); } catch { /* nada */ }
  };

  const lista = activos.filter((a) => a.level === "critical" || !ocultos.includes(a.id));

  const ocultar = (id) => {
    const n = [...ocultos, id].slice(-30);
    setOcultos(n);
    try { localStorage.setItem("ts_anuncios", JSON.stringify(n)); } catch { /* nada */ }
  };

  if (urgente) return (
    <div className="modal-anuncio" role="dialog" aria-modal="true">
      <div className="modal-caja">
        <div className="modal-icono">⚠</div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().nivelCritico}</div>
        <div className="h1" style={{ fontSize: 24, lineHeight: 1.2 }}>{urgente.title}</div>
        <p className="txt-s mt-14" style={{ lineHeight: 1.5 }}>{urgente.body}</p>
        <button className="btn mt-14" onClick={() => confirmar(urgente.id)}>{tx().entendidoAnuncio}</button>
      </div>
    </div>
  );

  if (!lista.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {lista.map((a) => (
        <div key={a.id} className={`anuncio ${a.level}`}>
          <div className="anuncio-cab">
            <b>{a.title}</b>
            {a.level !== "critical" && (
              <button className="anuncio-x" onClick={() => ocultar(a.id)} aria-label={tx().entendidoAnuncio}>✕</button>
            )}
          </div>
          <p className="txt-s">{a.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= Autenticación ================= */
function AuthScreen({ refresh, hasUsers, onCodigo, cfg, onCompletar }) {
  const [mode, setMode] = useState(hasUsers ? "login" : "setup");
  const [f, setF] = useState({});
  const { run, busy, err, setErr } = useRun(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = () => run(async () => {
    if (mode === "login") return api.login({ email: f.email, pass: f.pass });
    if (mode === "recover") {
      const c = await api.recover({ email: f.email, code: f.code, pass: f.pass });
      onCodigo(c); return;
    }
    const d = { name: f.name, trainer: f.trainer, email: f.email, pass: f.pass, friendCode: f.friendCode };
    const c = mode === "setup" ? await api.setup(d) : await api.register(d);
    onCodigo(c);
  });

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="ticket">
        <div className="ticket-cuerpo">
          <div className="h1">
            {mode === "setup" ? tx().configInicial : mode === "login" ? tx().entrar
              : mode === "recover" ? tx().recuperarTitulo : tx().crearCuenta}
          </div>
          <p className="txt-s suave mt-6">
            {mode === "setup" ? tx().setupIntro : mode === "login" ? tx().loginIntro
              : mode === "recover" ? tx().recuperarIntro : tx().registerIntro}
          </p>
          <div className="mt-14">
            {mode !== "recover" && (
              <AccesoSocial cfg={cfg} busy={busy}
                onEntrar={(falta) => { if (falta) onCompletar(); else refresh(); }}
                onError={(m) => setErr(m)} />
            )}
            {!["login", "recover"].includes(mode) && (
              <>
                <Campo label={tx().lblNombre}><input value={f.name || ""} onChange={set("name")} placeholder={tx().phNombre} /></Campo>
                <Campo label={tx().lblEntrenador}><input value={f.trainer || ""} onChange={set("trainer")} placeholder={tx().phEntrenador} /></Campo>
                <Campo label={tx().lblClave}><input value={f.friendCode || ""} onChange={set("friendCode")} placeholder={tx().phClave} autoCapitalize="characters" className="mono" /></Campo>
              </>
            )}
            <Campo label={tx().lblEmail}><input type="email" value={f.email || ""} onChange={set("email")} inputMode="email" autoCapitalize="none" /></Campo>
            {mode === "recover" && (
              <Campo label={tx().lblCodigoRec}>
                <input value={f.code || ""} onChange={set("code")} placeholder={tx().phCodigoRec}
                  className="mono" autoCapitalize="characters" />
              </Campo>
            )}
            <Campo label={mode === "login" ? tx().lblPass : mode === "recover" ? tx().lblNuevaPass : tx().lblPass12}>
              <input type="password" value={f.pass || ""} onChange={set("pass")} />
            </Campo>
            {err && <Aviso tipo="lacre">{err}</Aviso>}
            <button className="btn mt-14" disabled={busy} onClick={submit}>
              {busy ? "…" : mode === "setup" ? tx().btnSetup : mode === "login" ? tx().btnEntrar
                : mode === "recover" ? tx().btnRecuperar : tx().btnCrear}
            </button>
          </div>
        </div>
        {mode !== "setup" && (
          <div className="ticket-talon centrado">
            {mode === "recover" ? (
              <button className="enlace-volver" onClick={() => { setErr(""); setMode("login"); }}>{tx().volverEntrar}</button>
            ) : (
              <>
                <button className="enlace-volver" onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>
                  {mode === "login" ? tx().irRegistro : tx().irLogin}
                </button>
                {mode === "login" && (
                  <div style={{ marginTop: 8 }}>
                    <button className="enlace-volver txt-xs" onClick={() => { setErr(""); setMode("recover"); }}>
                      {tx().olvideContrasena}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <p className="txt-xs suave centrado mt-14">{tx().aceptasTerminos}</p>
    </div>
  );
}

/* ================= Publicar oferta ================= */
function Publicar({ refresh, done, cfgIA }) {
  const [f, setF] = useState({});
  const [detalles, setDetalles] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [leido, setLeido] = useState(null);
  const [restantes, setRestantes] = useState(null);
  const { run, busy, err } = useRun(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = () => run(async () => {
    await api.createOffer({
      species: f.species, level: f.level || null, nature: f.nature, ability: f.ability,
      ball: f.ball, isShiny: !!f.shiny,
      moves: (f.moves || "").split(",").map((m) => m.trim()).filter(Boolean),
      origin: f.origin, wants: f.wants, originImage: f.originImage,
    });
    done();
  });

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().publicarOferta}</h1>
      <div className="ficha">
        <p className="txt-xs suave" style={{ marginBottom: 12 }}>{tx().soloObligatorio}</p>

        <div style={{ marginBottom: 16 }}>
          <button className="btn mini secundario" disabled={leyendo} onClick={async () => {
            const img = await pickImage();
            if (!img) return;
            setLeyendo(true); setLeido(null); setRestantes(null);
            try {
              // Primero la IA, que lee mucho mejor; si no está o falla,
              // se usa el lector local del propio teléfono.
              let d = null;
              if (cfgIA) {
                try {
                  const r = await api.leerCapturaIA(img);
                  setRestantes(r.restantes);
                  d = { especie: r.species, nivel: r.level, naturaleza: r.nature, habilidad: r.ability,
                        ball: r.ball, origen: r.origin, shiny: r.shiny, movimientos: r.moves || [], ivs: r.ivs || [] };
                } catch { /* se intenta en local */ }
              }
              if (!d) {
                const { leerCaptura } = await import("./ocr.js");
                d = await leerCaptura(img, getLang());
              }
              const nuevo = { ...f };
              let n = 0;
              if (d.especie) { nuevo.species = d.especie; n++; }
              if (d.nivel) { nuevo.level = d.nivel; n++; }
              if (d.naturaleza) { nuevo.nature = d.naturaleza; n++; }
              if (d.ball) { nuevo.ball = d.ball; n++; }
              if (d.origen) { nuevo.origin = d.origen; n++; }
              if (d.habilidad) { nuevo.ability = d.habilidad; n++; }
              if (d.movimientos?.length) { nuevo.moves = d.movimientos.join(", "); n++; }
              if (d.ivs?.length === 6) { nuevo.ivs = d.ivs; n++; }
              if (d.shiny) { nuevo.shiny = true; n++; }
              nuevo.originImage = img;              // la captura queda como prueba de origen
              setF(nuevo);
              if (n > 0) setDetalles(true);
              setLeido(n);
            } catch { setLeido(0); }
            setLeyendo(false);
          }}>{leyendo ? (cfgIA ? tx().leyendoIA : tx().leyendoFoto) : (cfgIA ? tx().leerConIA : tx().rellenarFoto)}</button>
          {restantes !== null && <p className="txt-xs suave mt-6">{tx().iaRestantes(restantes)}</p>}
          <p className="txt-xs suave mt-6">{tx().fotoAviso} {tx().fotoDescarga}</p>
          {leido !== null && (
            <div className="mt-10">
              <Aviso tipo={leido > 0 ? "verde" : "oro"}>{leido > 0 ? tx().fotoLeida(leido) : tx().fotoSinDatos}</Aviso>
            </div>
          )}

          {/* El lector no puede saber si es shiny: se elige mirando las dos versiones */}
          {leido > 0 && f.species && (
            <div className="ficha mt-10" style={{ padding: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().cualEs}</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[false, true].map((sh) => (
                  <button key={String(sh)} className={`opcion-shiny ${!!f.shiny === sh ? "elegida" : ""}`}
                    onClick={() => setF({ ...f, shiny: sh })}>
                    <Sprite nombre={f.species} tam={62} shiny={sh} />
                    <span className="txt-xs">{sh ? `✦ ${tx().shinyOpc}` : tx().normalOpc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <CampoEspecie label={tx().lblEspecie} value={f.species} onChange={(v) => setF({ ...f, species: v })} placeholder={tx().phEspecie} />
        <label className="check"><input type="checkbox" checked={!!f.shiny} onChange={set("shiny")} /> {tx().esShiny}</label>
        <Campo label={tx().lblBuscas}><textarea value={f.wants || ""} onChange={set("wants")} placeholder={tx().phBuscas} /></Campo>
        <div style={{ marginBottom: 12 }}>
          {f.originImage
            ? <p className="txt-s" style={{ color: "var(--verde)" }}>{tx().conPrueba} ✓</p>
            : <button className="btn mini secundario" onClick={async () => { const img = await pickImage(); if (img) setF({ ...f, originImage: img }); }}>{tx().lblPruebaOrigen}</button>}
          <p className="txt-xs suave mt-6">{tx().ayudaPruebaOrigen}</p>
        </div>
        <button className="enlace-volver" style={{ marginBottom: 12 }} onClick={() => setDetalles(!detalles)}>
          {detalles ? tx().menosDetalles : tx().masDetalles}
        </button>
        {detalles && (
          <>
            <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().detallesAyuda}</p>
            <div className="fila-2">
              <Campo label={tx().lblNivel}><input type="number" min="1" max="100" value={f.level || ""} onChange={set("level")} /></Campo>
              <Campo label={tx().lblNaturaleza}><input value={f.nature || ""} onChange={set("nature")} placeholder={tx().phNaturaleza} /></Campo>
            </div>
            <div className="fila-2">
              <Campo label={tx().lblHabilidad}><input value={f.ability || ""} onChange={set("ability")} /></Campo>
              <Campo label={tx().lblBall}><input value={f.ball || ""} onChange={set("ball")} placeholder={tx().phBall} /></Campo>
            </div>
            <Campo label={tx().lblMoves}><input value={f.moves || ""} onChange={set("moves")} /></Campo>
            <Campo label={tx().lblOrigen}><input value={f.origin || ""} onChange={set("origin")} placeholder={tx().phOrigen} /></Campo>
          </>
        )}
        <Aviso tipo="oro">{tx().avisoCaptura}</Aviso>
        {err && <div className="mt-10"><Aviso tipo="lacre">{err}</Aviso></div>}
        <button className="btn mt-14" disabled={busy} onClick={submit}>{busy ? "…" : tx().btnPublicar}</button>
      </div>
    </div>
  );
}

/* Iconos de la barra inferior, en trazo fino */
const ICONOS = {
  inicio: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  inventario: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM3.5 7.5 12 12m0 9v-9m8.5-4.5L12 12",
  buzon: "M4 5.5h16v10H8.5L4 19.5v-14Z",
};
function Icono({ tipo, activo }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={activo ? "var(--verde)" : "currentColor"} strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONOS[tipo]} />
    </svg>
  );
}

/* Barra superior compacta para pantallas de detalle */
function BarraDetalle({ titulo, onVolver }) {
  return (
    <div className="barra-det">
      <button className="volver-ic" onClick={onVolver} aria-label="←">‹</button>
      <span className="barra-det-tit">{titulo}</span>
      <span style={{ width: 30 }} />
    </div>
  );
}

/* Fila del entrenador, estilo cabecera de ficha */
function FilaEntrenador({ userId, cuando, onFicha }) {
  const u = userById(userId);
  if (!u) return null;
  return (
    <div className="fila-entrenador">
      {u.avatarId
        ? <img className="ent-avatar" src={api.imageUrl(u.avatarId)} alt="" />
        : <span className="ent-avatar ent-inicial">{u.displayName.slice(0, 1).toUpperCase()}</span>}
      <button className="ent-nombre" onClick={() => onFicha && onFicha(u.id)}>{u.displayName}</button>
      {cuando && <span className="txt-xs suave">· {haceRato(cuando)}</span>}
      {u.verified && <span className="tag verde">✓</span>}
      {u.newAccount && u.trades === 0 && <span className="tag tenue">{tx().nuevoTrader}</span>}
      {u.trades > 0 && <span className="tag tenue">{u.trades} {tx().trades}</span>}
    </div>
  );
}

/* Tarjeta del mercado: se ve de un vistazo qué se ofrece y qué se busca */
function CartaOferta({ o, me, onAbrir }) {
  const dueno = userById(o.ownerId);
  const buscado = detectarEspecie(o.wants);
  const buscadoShiny = pideShiny(o.wants);
  const detalles = [o.nature, o.ivs?.length === 6 && (o.ivs.every((v) => v === 31) ? "6IV" : `${o.ivs.filter((v) => v === 31).length}IV`), o.ball]
    .filter(Boolean).join(" · ");
  const enLinea = dueno?.lastSeen && (Date.now() - new Date(dueno.lastSeen)) / 60000 < 3;
  return (
    <button className="ficha carta-oferta" style={{ marginBottom: 12 }} onClick={onAbrir}>
      <div className="trueque">
        <div className="lado">
          <Sprite nombre={o.species} tam={52} shiny={o.isShiny} halo />
          <div className="lado-txt">
            <b className="nombre-pk">{nombreLimpio(o.species)}</b>
            <span className="sub-pk">
              {o.isShiny && <span className="marca-shiny">★ Shiny</span>}
              {detalles && <span className="suave">{detalles}</span>}
              {o.level && <span className="suave">{tx().nv} {o.level}</span>}
            </span>
          </div>
        </div>
        <span className="flecha">⇄</span>
        <div className="lado derecha">
          <div className="lado-txt der">
            <b className="nombre-pk">{buscado ? nombreLimpio(buscado) : tx().cualquierCosa}</b>
            <span className="sub-pk der">
              {buscado && buscadoShiny && <span className="marca-shiny">★ Shiny</span>}
              <span className="suave">{o.wants.length > 26 ? o.wants.slice(0, 25) + "…" : o.wants}</span>
            </span>
          </div>
          {buscado
            ? <Sprite nombre={buscado} tam={52} shiny={buscadoShiny} halo />
            : <span className="sprite-hueco">?</span>}
        </div>
      </div>
      <div className="pie-oferta">
        <span className="tags" style={{ gap: 6 }}>
          {dueno?.avatarId
            ? <img className="mini-avatar" src={api.imageUrl(dueno.avatarId)} alt="" />
            : <span className="mini-avatar mini-inicial">{(dueno?.displayName ?? "?").slice(0, 1).toUpperCase()}</span>}
          <b className="txt-s">{dueno?.displayName ?? "—"}</b>
          {enLinea && <span className="punto-online" />}
          {dueno?.verified && <span className="tag verde">✓ {tx().verificado.replace("✓ ", "")}</span>}
          <span className="tag tenue">{dueno?.trades ?? 0} {tx().trades}</span>
          {o.ownerId === me?.id && <span className="tag verde">{tx().tuya}</span>}
          {o.inTrade && <span className="tag oro">{tx().enTrato}</span>}
          {o.originImage && <span className="tag verde">◎</span>}
        </span>
        <span className="txt-xs suave">{haceRato(o.createdAt)}</span>
      </div>
    </button>
  );
}

/* ================= Mercado ================= */
function Mercado({ me, refresh, onOffenders, onFicha, abrir, onAbierto, esStaff, irAPublicar, onIrAlChat, stats, onPideCuenta, cfgIA }) {
  const [vista, setVista] = useState("ofertas");
  const [open, setOpen] = useState(null);
  useEffect(() => { if (abrir) { setOpen(abrir); onAbierto && onAbierto(); } }, [abrir]);
  useEffect(() => { if (irAPublicar) setVista("publicar"); }, [irAPublicar]);
  const [give, setGive] = useState("");
  const [busca, setBusca] = useState("");
  const [soloShiny, setSoloShiny] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [reportado, setReportado] = useState(false);
  const [proponiendo, setProponiendo] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const { run, busy, err } = useRun(refresh);
  const [orden, setOrden] = useState("reciente");
  const [tope, setTope] = useState(20);
  const [verFiltros, setVerFiltros] = useState(false);
  const [soloVerif, setSoloVerif] = useState(false);
  const [soloPrueba, setSoloPrueba] = useState(false);
  const [ocultarTrato, setOcultarTrato] = useState(false);
  const nFiltros = [soloShiny, soloVerif, soloPrueba, ocultarTrato].filter(Boolean).length;
  const todas = api.snap.offers.filter((o) => o.status === "active")
    .filter((o) => !soloShiny || o.isShiny)
    .filter((o) => !soloVerif || userById(o.ownerId)?.verified)
    .filter((o) => !soloPrueba || o.originImage)
    .filter((o) => !ocultarTrato || !o.inTrade)
    .filter((o) => !busca.trim() || (o.species + " " + o.wants).toLowerCase().includes(busca.trim().toLowerCase()));
  if (orden === "reputacion") {
    todas.sort((a, b) => {
      const ua = userById(a.ownerId), ub = userById(b.ownerId);
      return ((ub?.trades ?? 0) - (ua?.trades ?? 0)) || (Number(ub?.verified) - Number(ua?.verified));
    });
  }
  const offers = todas.slice(0, tope);

  if (open) {
    const o = api.snap.offers.find((x) => x.id === open);
    if (!o || o.status !== "active") { setOpen(null); return null; }
    return (
      <div>
        <div className="barra-det">
          <button className="volver-ic" onClick={() => setOpen(null)} aria-label="←">‹</button>
          <span className="barra-det-tit">{tx().detalleOferta}</span>
          <button className="volver-ic" style={{ fontSize: 20 }} aria-label={tx().compartir}
            onClick={async () => {
              const url = `${location.origin}/o/${o.id}`;
              const texto = tx().textoCompartir(nombreLimpio(o.species), o.wants);
              try {
                if (navigator.share) await navigator.share({ title: "TradeSafe", text: texto, url });
                else { await navigator.clipboard.writeText(`${texto}\n${url}`); setCopiadoLink(true); setTimeout(() => setCopiadoLink(false), 2500); }
              } catch { /* el usuario canceló */ }
            }}>↗</button>
        </div>
        {copiadoLink && <div style={{ marginBottom: 10 }}><Aviso tipo="verde">{tx().enlaceCopiado}</Aviso></div>}
        <FilaEntrenador userId={o.ownerId} cuando={o.createdAt} onFicha={onFicha} />
        {/* OFRECE */}
        <div className="ficha bloque-pk">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().ofrece}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Sprite nombre={o.species} tam={62} shiny={o.isShiny} halo />
            <div style={{ minWidth: 0 }}>
              <div className="h1" style={{ lineHeight: 1.15, fontSize: 26 }}>{nombreLimpio(o.species)}</div>
              {o.isShiny && <div style={{ color: "var(--oro)", fontWeight: 800, fontSize: 14 }}>✦ Shiny</div>}
              {o.inTrade && <span className="tag oro mt-6" style={{ display: "inline-block" }}>{tx().enTrato}</span>}
            </div>
          </div>

          {[o.level, o.nature, o.ability, o.ball, o.origin].some(Boolean) && (
            <div className="datos-pk">
              {[[tx().nivelLbl, o.level], [tx().naturalezaLbl, o.nature], [tx().habilidadLbl, o.ability],
                [tx().ballLbl, o.ball], [tx().origenLbl, o.origin]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="dato-fila"><span className="suave">{k}</span><b>{v}</b></div>
                ))}
            </div>
          )}

          {o.moves?.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: "14px 0 6px" }}>{tx().movimientos}</div>
              <div className="datos-pk">
                {o.moves.map((m, i) => (
                  <div key={i} className="dato-fila"><span className="suave">{i + 1}</span><b>{m}</b></div>
                ))}
              </div>
            </>
          )}

          {o.ivs?.length === 6 && (
            <div className="ivs mt-14">
              {o.ivs.map((v, i) => (
                <div key={i} className={`iv ${v === 31 ? "max" : ""}`}>
                  <div className="l">{tx().ivLabels[i]}</div><div className="n">{v}</div>
                </div>
              ))}
            </div>
          )}

          {o.originImage && (
            <>
              <div className="eyebrow" style={{ margin: "16px 0 8px" }}>{tx().capturas}</div>
              <a href={api.imageUrl(o.originImage)} target="_blank" rel="noreferrer">
                <img src={api.imageUrl(o.originImage)} alt={tx().pruebaOrigen} className="captura-prueba" />
              </a>
            </>
          )}
        </div>

        <div className="separador-trueque">⇅</div>

        {/* BUSCA */}
        <div className="ficha bloque-pk">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().buscaCol}</div>
          {(() => {
            const b = detectarEspecie(o.wants), bs = pideShiny(o.wants);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {b ? <Sprite nombre={b} tam={62} shiny={bs} halo /> : <span className="sprite-hueco" style={{ width: 62, height: 62, fontSize: 24 }}>?</span>}
                <div style={{ minWidth: 0 }}>
                  <div className="h1" style={{ lineHeight: 1.15, fontSize: 26 }}>{b ? nombreLimpio(b) : tx().cualquierCosa}</div>
                  {b && bs && <div style={{ color: "var(--oro)", fontWeight: 800, fontSize: 14 }}>✦ Shiny</div>}
                </div>
              </div>
            );
          })()}
          <div className="datos-pk">
            <div className="dato-fila"><span className="suave">{tx().requisitos}</span><b style={{ textAlign: "right" }}>{o.wants}</b></div>
          </div>
        </div>
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().ofrecidoPor}</div>
          <Rep userId={o.ownerId} onFicha={onFicha} />
          <div className="tags mt-6"><Presencia lastSeen={userById(o.ownerId)?.lastSeen} /></div>
          {userById(o.ownerId)?.availability && (
            <p className="txt-xs suave mt-6">◷ {userById(o.ownerId).availability}</p>
          )}
          {sanctionsOf(o.ownerId).map((s) => (
            <div className="mt-10" key={s.id}><Aviso tipo="lacre"><b>{tx().sancionActiva}</b> {s.summary}</Aviso></div>
          ))}
          {userById(o.ownerId)?.newAccount && userById(o.ownerId)?.trades === 0 && (
            <p className="txt-xs suave mt-10">⚠ {tx().avisoCuentaNueva}</p>
          )}
        </div>
        {!me ? null : o.ownerId === me?.id ? (
          <button className="btn peligro mt-14" disabled={busy} onClick={() => run(async () => { await api.removeOffer(o.id); setOpen(null); })}>
            {tx().retirarOferta}
          </button>
        ) : proponiendo ? (
          <div className="ficha mt-14">
            <Campo label={tx().lblItems} error={err}>
              <textarea value={give} onChange={(e) => setGive(e.target.value)} placeholder={tx().phItems} style={{ minHeight: 90 }} autoFocus />
            </Campo>
            <button className="btn" disabled={busy || !give.trim()} onClick={() => run(async () => {
              const id = await api.propose(o.id, give.split("\n").map((x) => x.trim()).filter(Boolean));
              setOpen(null); setGive(""); setProponiendo(false);
              onIrAlChat && onIrAlChat(id);
            })}>
              {busy ? "…" : tx().btnProponer}
            </button>
            <button className="btn secundario" onClick={() => setProponiendo(false)}>{tx().btnCancelar}</button>
          </div>
        ) : (
          <button className="btn mt-14" onClick={() => setProponiendo(true)}>➤ {tx().empezarChat}</button>
        )}
        <div style={{ height: 8 }} />
        {me && o.ownerId !== me?.id && (reportado ? (
          <div className="mt-14"><Aviso tipo="verde">{tx().reporteEnviado}</Aviso></div>
        ) : reportando ? (
          <div className="ficha mt-14">
            <Campo label={tx().lblMotivoReporte}><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
            <button className="btn peligro" disabled={busy} onClick={() => run(async () => { await api.reportOffer(o.id, motivo); setReportando(false); setMotivo(""); setReportado(true); })}>{tx().btnEnviarReporteOferta}</button>
            <button className="btn secundario" onClick={() => setReportando(false)}>{tx().btnCancelar}</button>
          </div>
        ) : (
          <button className="btn mini secundario mt-14" onClick={() => setReportando(true)}>{tx().reportarOferta}</button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 className="h1">{vista === "publicar" ? tx().publicarOferta : vista === "deseos" ? tx().deseosTitulo
              : vista === "comunidad" ? tx().tabComunidad : tx().mercado}</h1>
        <button className={`btn mini ${vista === "publicar" ? "secundario" : ""}`}
          onClick={() => { if (!me) return onPideCuenta(); setVista(vista === "publicar" ? "ofertas" : "publicar"); }}>
          {vista === "publicar" ? tx().btnCancelar : tx().nuevaOferta}
        </button>
      </div>
      <div className="tags" style={{ marginBottom: 14 }}>
        <button className={`btn mini ${vista === "ofertas" ? "" : "secundario"}`} onClick={() => setVista("ofertas")}>{tx().verOfertas}</button>
        <button className={`btn mini ${vista === "deseos" ? "" : "secundario"}`} onClick={() => { if (!me) return onPideCuenta(); setVista("deseos"); }}>
          {tx().tabDeseos}{(api.snap.matches?.length || 0) > 0 ? " ●" : ""}
        </button>
        <button className={`btn mini ${vista === "comunidad" ? "" : "secundario"}`} onClick={() => { if (!me) return onPideCuenta(); setVista("comunidad"); }}>
          {tx().tabComunidad}
        </button>
      </div>

      {vista === "publicar" && <Publicar refresh={refresh} done={() => setVista("ofertas")} cfgIA={cfgIA} />}
      {vista === "deseos" && (
        <Deseos me={me} refresh={refresh}
          onAbrirOferta={(id) => { setVista("ofertas"); setOpen(id); }} />
      )}
      {vista === "comunidad" && (
        <Comunidad me={me} refresh={refresh} esStaff={esStaff} onFicha={onFicha} onOffenders={onOffenders} />
      )}
      {vista === "ofertas" && (<>
      {todas.length <= 3 && !busca && (
        <div className="ficha" style={{ marginBottom: 14, borderColor: "var(--verde)" }}>
          <div className="h2" style={{ marginBottom: 8 }}>{tx().bienvenidaTitulo}</div>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {tx().bienvenidaPasos.map((p, i) => <li key={i} className="txt-s" style={{ marginBottom: 6 }}>{p}</li>)}
          </ol>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="buscador" style={{ marginBottom: 0 }} value={busca}
          onChange={(e) => { setBusca(e.target.value); setTope(20); }} placeholder={tx().phBuscar} />
        <button className={`btn mini ${nFiltros ? "" : "secundario"}`} style={{ whiteSpace: "nowrap" }}
          onClick={() => setVerFiltros(!verFiltros)}>
          ⚙ {tx().filtros}{nFiltros ? ` (${nFiltros})` : ""}
        </button>
      </div>

      {verFiltros && (
        <div className="ficha" style={{ marginBottom: 12 }}>
          <label className="check"><input type="checkbox" checked={soloShiny} onChange={(e) => { setSoloShiny(e.target.checked); setTope(20); }} /> {tx().soloShinys}</label>
          <label className="check"><input type="checkbox" checked={soloVerif} onChange={(e) => { setSoloVerif(e.target.checked); setTope(20); }} /> {tx().soloVerificadosF}</label>
          <label className="check"><input type="checkbox" checked={soloPrueba} onChange={(e) => { setSoloPrueba(e.target.checked); setTope(20); }} /> {tx().soloConPrueba}</label>
          <label className="check"><input type="checkbox" checked={ocultarTrato} onChange={(e) => { setOcultarTrato(e.target.checked); setTope(20); }} /> {tx().ocultarEnTrato}</label>
          <Campo label={tx().ordenar}>
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="reciente">{tx().ordenReciente}</option>
              <option value="reputacion">{tx().ordenReputacion}</option>
            </select>
          </Campo>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn mini secundario" style={{ flex: 1 }}
              onClick={() => { setSoloShiny(false); setSoloVerif(false); setSoloPrueba(false); setOcultarTrato(false); setOrden("reciente"); }}>
              {tx().limpiar}
            </button>
            <button className="btn mini" style={{ flex: 1 }} onClick={() => setVerFiltros(false)}>{tx().aplicar}</button>
          </div>
        </div>
      )}

      {stats && stats.cerrados > 0 && (
        <div className="franja-confianza">
          <span className="fc-icono">◈</span>
          <span><b>{tx().franjaSegura(stats.cerrados)}</b><span className="suave"> · {tx().franjaProtegido}</span></span>
        </div>
      )}
      {todas.length > 0 && (
        <>
          <div className="txt-xs suave" style={{ marginBottom: 8 }}>{tx().nResultados(todas.length)}</div>
          <div className="cols-mercado"><span>{tx().ofrece}</span><span>{tx().buscaCol}</span></div>
        </>
      )}
      {offers.length === 0 ? (
        <Vacio icono="▣">{busca || soloShiny ? tx().sinCoincidencias : <>{tx().sinOfertas1}<br />{tx().sinOfertas2} <b>{tx().tabPublicar}</b>.</>}</Vacio>
      ) : offers.map((o) => (
        <CartaOferta key={o.id} o={o} me={me} onAbrir={() => setOpen(o.id)} />
      ))}
      {todas.length > offers.length && (
        <button className="btn secundario" onClick={() => setTope(tope + 20)}>
          {tx().verMas} ({todas.length - offers.length})
        </button>
      )}
      </>)}
    </div>
  );
}

/* ================= Centro de ayuda: vídeo tutorial ================= */
function Asistente({ onCerrar, onIrAlChat }) {
  const [hist, setHist] = useState([]);
  const [txt, setTxt] = useState("");
  const [pensando, setPensando] = useState(false);
  const caja = useRef(null);
  useEffect(() => { const c = caja.current; if (c) c.scrollTop = c.scrollHeight; }, [hist.length, pensando]);

  const preguntar = async (pregunta) => {
    const p = String(pregunta || txt).trim();
    if (!p || pensando) return;
    setTxt(""); setPensando(true);
    const previo = [...hist, { role: "user", content: p }];
    setHist(previo);
    try {
      const r = await api.preguntarIA(p, hist);
      setHist([...previo, { role: "assistant", content: r.text }]);
    } catch (e) {
      setHist([...previo, { role: "assistant", content: tErr(e.message), error: true }]);
    }
    setPensando(false);
  };

  const escalar = async () => {
    setPensando(true);
    try {
      const id = await api.escalarAStaff(hist, "");
      onIrAlChat(id);
    } catch (e) {
      setHist([...hist, { role: "assistant", content: tErr(e.message), error: true }]);
    }
    setPensando(false);
  };

  return (
    <div className="hoja-asistente" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="hoja-caja">
        <div className="hoja-cab">
          <span className="eyebrow">{tx().asistente}</span>
          <button className="enlace-volver" onClick={onCerrar}>✕</button>
        </div>
        <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().asistenteIntro}</p>

      {hist.length > 0 && (
        <div className="chat-asistente" ref={caja}>
          {hist.map((m, i) => (
            <div key={i} className={`msg ${m.role === "user" ? "mia" : "suya"} inicio-grupo`}>
              <div className={`burbuja ${m.role === "user" ? "mia" : "suya"} ${m.error ? "err" : ""}`}>{m.content}</div>
            </div>
          ))}
          {pensando && <div className="msg suya inicio-grupo"><div className="burbuja suya">{tx().asistentePensando}</div></div>}
        </div>
      )}

      {hist.length === 0 && (
        <div className="rapidas" style={{ padding: "0 0 10px" }}>
          {[tx().sugerencia1, tx().sugerencia2, tx().sugerencia3].map((q) => (
            <button key={q} className="rapida" onClick={() => preguntar(q)}>{q}</button>
          ))}
        </div>
      )}

      <div className="chat-form" style={{ borderRadius: 999, border: "1px solid var(--linea)", padding: 6 }}>
        <input className="chat-input" value={txt} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") preguntar(); }} placeholder={tx().phAsistente} />
        <button className="btn-enviar" disabled={pensando || !txt.trim()} onClick={() => preguntar()}>↑</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }}>
        <p className="txt-xs suave" style={{ margin: 0, flex: 1 }}>{tx().asistenteAviso}</p>
        <button className="btn mini secundario" disabled={pensando} onClick={escalar} style={{ whiteSpace: "nowrap" }}>
          {pensando ? tx().escalando : tx().hablarStaff}
        </button>
      </div>
      </div>
    </div>
  );
}

function Ayuda({ onCerrar }) {
  return (
    <div className="ficha" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="eyebrow">{tx().ayuda}</div>
        <button className="enlace-volver" onClick={onCerrar}>✕</button>
      </div>
      <video controls playsInline preload="metadata" poster={`/poster-${getLang()}.jpg`}
        style={{ display: "block", width: "100%", maxHeight: "58vh", aspectRatio: "9 / 16",
          objectFit: "contain", borderRadius: 12, border: "2px solid var(--tinta)",
          background: "#000", margin: "0 auto" }}>
        <source src={`/tutorial-${getLang()}.mp4`} type="video/mp4" />
      </video>
      <a className="btn mini secundario mt-10" style={{ textDecoration: "none", textAlign: "center", display: "block" }}
        href={`/tutorial-${getLang()}.mp4`} download>{tx().descargarVideo}</a>
    </div>
  );
}

/* ================= Comunidad: sorteos y tablón ================= */
function Comunidad({ me, refresh, esStaff, onFicha, onOffenders }) {
  const [msg, setMsg] = useState("");
  const [crear, setCrear] = useState(false);
  const [f, setF] = useState({ days: 7, minTrades: 0 });
  const { run, busy, err } = useRun(refresh);
  const sorteos = api.snap.giveaways || [];

  return (
    <div>
      <div className="tags" style={{ marginBottom: 14 }}>
        <button className="btn mini secundario" onClick={onOffenders}>{tx().infractoresBtn}</button>
      </div>
      {err && <div style={{ marginBottom: 14 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      {(
        <>
          {esStaff && (crear ? (
            <div className="ficha" style={{ marginBottom: 14 }}>
              <Campo label={tx().lblTituloSorteo}><input value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Campo>
              <Campo label={tx().lblDescSorteo}><textarea value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Campo>
              <Campo label={tx().lblPremios}><textarea value={f.prizesText || ""} onChange={(e) => setF({ ...f, prizesText: e.target.value })} placeholder={"Shiny Gengar\nDreepy HA\nDitto 6IV"} /></Campo>
              <div className="fila-2">
                <Campo label={tx().lblDiasSorteo}><input type="number" min="1" max="30" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Campo>
                <Campo label={tx().lblMinTrades}><input type="number" min="0" value={f.minTrades} onChange={(e) => setF({ ...f, minTrades: e.target.value })} /></Campo>
              </div>
              <button className="btn" disabled={busy} onClick={() => run(async () => {
                await api.createGiveaway({ title: f.title, description: f.description, days: Number(f.days), minTrades: Number(f.minTrades),
                  prizes: String(f.prizesText || "").split("\n").map((x) => x.trim()).filter(Boolean) });
                setCrear(false); setF({ days: 7, minTrades: 0 });
              })}>{tx().crearSorteo}</button>
              <button className="btn secundario" onClick={() => setCrear(false)}>{tx().btnCancelar}</button>
            </div>
          ) : (
            <button className="btn mini secundario" style={{ marginBottom: 14 }} onClick={() => setCrear(true)}>+ {tx().crearSorteo}</button>
          ))}

          {sorteos.length === 0 ? <Vacio icono="◆">{tx().sinSorteos}</Vacio> : sorteos.map((g) => (
            <div key={g.id} className="ticket" style={{ marginBottom: 14 }}>
              <div className="ticket-cuerpo">
                <div className="tags">
                  <span className="h2">{g.title}</span>
                  {g.status === "drawn" && <span className="tag verde">{tx().ganadores}</span>}
                  {g.status === "cancelled" && <span className="tag lacre">✕</span>}
                </div>
                {g.description && <p className="txt-s suave mt-6">{g.description}</p>}
                <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{tx().premios}</div>
                {g.prizes.map((p, i) => (
                  <div key={i} className="fila" style={{ padding: "3px 0" }}>
                    <span className="txt-s">{["🥇","🥈","🥉","◆"][i] || "◆"} {p}</span>
                    {g.winners?.[i] && <b className="txt-s" style={{ color: "var(--verde)" }}>{g.winners[i].name}</b>}
                  </div>
                ))}
                <div className="txt-xs suave mt-10">
                  {tx().organiza} {userById(g.hostId)?.displayName ?? "—"} · {tx().participantes(g.entries)}
                  {g.minTrades > 0 && <> · {tx().requisitoTrades(g.minTrades)}</>}
                </div>
                {g.status === "drawn" && g.seed && (
                  <p className="txt-xs suave mono mt-6">{tx().sorteoVerificable}: {g.seed}</p>
                )}
              </div>
              <div className="ticket-talon">
                {g.status === "open" ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="txt-xs">{tx().terminaEl} {fecha(g.endsAt)}</span>
                    {g.hostId !== me?.id && (g.mine
                      ? <span className="tag verde">{tx().yaParticipas}</span>
                      : <button className="btn mini" disabled={busy} onClick={() => run(() => api.enterGiveaway(g.id))}>{tx().btnParticipar}</button>)}
                    {esStaff && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn mini" disabled={busy} onClick={() => run(() => api.drawGiveaway(g.id))}>{tx().btnSortear}</button>
                        <button className="btn mini secundario" disabled={busy} onClick={() => run(() => api.cancelGiveaway(g.id))}>{tx().btnCancelarSorteo}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="txt-xs">{g.drawnAt ? fecha(g.drawnAt) : ""}</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}

    </div>
  );
}

/* ================= Mensaje directo ================= */
function ChatDirecto({ hilo, me, refresh, onVolver, onFicha }) {
  const t = api.snap.dm.find((x) => x.id === hilo);
  const [msg, setMsg] = useState("");
  const [offsite, setOffsite] = useState(null);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [hecho, setHecho] = useState(false);
  const [menu, setMenu] = useState(false);
  const [avisoVisto, setAvisoVisto] = useState(() => {
    try { return localStorage.getItem("ts_aviso_dm") === "1"; } catch { return false; }
  });
  const { run, busy, err } = useRun(refresh);
  const caja = useRef(null);
  const campoMsg = useRef(null);
  useEffect(() => { api.setRitmo(2500); return () => api.setRitmo(8000); }, []);
  const otro = userById(t?.otherId);
  const bloqueado = (api.snap.blocked || []).includes(t?.otherId);

  useEffect(() => { if (t) marcarLeido("dm:" + t.id); }, [t?.id, t?.messages?.length]);
  useEffect(() => { const c = caja.current; if (c) c.scrollTop = c.scrollHeight; }, [t?.messages?.length]);
  if (!t) return null;

  const { pendientes, enviar: enviarPend, quitar, limpiar } = usePendientes(
    (texto, conf) => api.enviarDM(t.id, texto, conf));
  useEffect(() => { limpiar(t?.messages || []); }, [t?.messages?.length]);

  const enviar = async () => {
    const texto = msg.trim();
    if (!texto) return;
    setMsg("");
    campoMsg.current?.focus();
    const r = await enviarPend(texto);
    if (r.ok) return refresh();
    const m = String(r.error?.message || "");
    if (m.includes("táctica") || m.includes("tactic")) { setOffsite(texto); quitar(); }
  };

  return (
    <div className="pantalla-chat">
      <div className="barra-det" style={{ paddingBottom: 8 }}>
        <button className="volver-ic" onClick={onVolver} aria-label="←">‹</button>
        <span className="barra-det-tit">{tx().chatDirecto}</span>
        <button className="volver-ic" style={{ fontSize: 19 }} onClick={() => setMenu(!menu)} aria-label="⋯">⋯</button>
      </div>

      {menu && (
        <div className="menu-chat">
          <button onClick={() => { setMenu(false); setReportando(true); }}>{tx().reportarChat}</button>
          <button onClick={() => {
            setMenu(false);
            if (bloqueado) return run(() => api.desbloquear(otro.id));
            if (confirm(tx().confirmBloquear)) run(() => api.bloquear(otro.id));
          }}>{bloqueado ? tx().desbloquear : tx().bloquear}</button>
        </div>
      )}

      <div className="fila-entrenador" style={{ marginBottom: 10 }}>
        {otro?.avatarId
          ? <img className="ent-avatar" src={api.imageUrl(otro.avatarId)} alt="" />
          : <span className="ent-avatar ent-inicial">{(otro?.displayName ?? "?").slice(0, 1).toUpperCase()}</span>}
        <button className="ent-nombre" onClick={() => onFicha && onFicha(otro?.id)}>{otro?.displayName ?? "—"}</button>
        <Presencia lastSeen={otro?.lastSeen} />
        {bloqueado && <span className="tag lacre">{tx().bloqueado}</span>}
      </div>

      {!avisoVisto && (
        <button className="aviso-fino" onClick={() => {
          setAvisoVisto(true);
          try { localStorage.setItem("ts_aviso_dm", "1"); } catch { /* nada */ }
        }}>
          <span>⚠ {tx().avisoDirecto}</span><span className="aviso-x">✕</span>
        </button>
      )}
      {err && <div style={{ marginBottom: 8 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      <div className="chat-mensajes" ref={caja}>
        {t.messages.map((m, i) => {
          const previo = t.messages[i - 1];
          const nuevoDia = !previo || !mismoDia(previo.at, m.at);
          const esHoy = mismoDia(m.at, new Date());
          const esAyer = mismoDia(m.at, Date.now() - 86400000);
          if (m.system) return (
            <span key={i} style={{ display: "contents" }}>
              {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
              <Aviso tipo={m.kind}>{tSys(m.text)}</Aviso>
            </span>
          );
          const mia = m.by === me?.id;
          const inicio = nuevoDia || !previo || previo.system || previo.by !== m.by
            || new Date(m.at) - new Date(previo.at) > 300000;
          return (
            <span key={i} style={{ display: "contents" }}>
              {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
              <div className={`msg ${mia ? "mia" : "suya"} ${inicio ? "inicio-grupo" : ""}`}>
                {!mia && (inicio && otro?.avatarId
                  ? <img className="msg-avatar" src={api.imageUrl(otro.avatarId)} alt="" />
                  : <span className={`msg-avatar ${inicio ? "" : "hueco"}`}>{inicio ? "◍" : ""}</span>)}
                <div className={`burbuja ${mia ? "mia" : "suya"}`}>
                  {m.text}
                  <span className="hora-msg">{hora(m.at)}</span>
                </div>
              </div>
            </span>
          );
        })}
      </div>

      {pendientes.map((p) => (
        <div key={p.clave} className={`msg mia pendiente ${p.estado === "error" ? "fallo" : ""}`}>
          <div className="burbuja mia">
            {p.text}
            <span className="hora-msg">{p.estado === "error" ? tx().noEnviado : tx().enviando}</span>
          </div>
        </div>
      ))}

      {offsite && (
        <div className="ficha" style={{ margin: "8px 0" }}>
          <Aviso tipo="lacre">{tx().avisoOffsite}</Aviso>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn mini secundario" onClick={() => setOffsite(null)}>{tx().btnCancelar}</button>
            <button className="btn mini peligro" disabled={busy}
              onClick={() => { run(() => api.enviarDM(t.id, offsite, true)); setOffsite(null); }}>
              {tx().btnEnviarIgual}
            </button>
          </div>
        </div>
      )}

      {hecho ? (
        <div style={{ marginTop: 8 }}><Aviso tipo="verde">{tx().chatReportado}</Aviso></div>
      ) : reportando ? (
        <div className="ficha" style={{ marginTop: 8 }}>
          <Campo label={tx().lblMotivoChat}>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <button className="btn mini peligro" disabled={busy}
            onClick={() => run(async () => { await api.reportarDM(t.id, motivo); setReportando(false); setMotivo(""); setHecho(true); })}>
            {tx().btnEnviarReporte}
          </button>
          <button className="btn mini secundario" style={{ marginLeft: 8 }} onClick={() => setReportando(false)}>{tx().btnCancelar}</button>
        </div>
      ) : null}

      {!bloqueado && (
        <div className="chat-form">
          <input ref={campoMsg} className="chat-input" value={msg} onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} placeholder={tx().phMensaje} />
          <button className="btn-enviar" disabled={!msg.trim()} onClick={enviar} aria-label={tx().enviarMsg}>↑</button>
        </div>
      )}
    </div>
  );
}

/* ================= Inventario: mi colección ================= */
function FormPokemon({ inicial, cfgIA, onGuardar, onCancelar, busy }) {
  const [f, setF] = useState(inicial || {});
  const [leyendo, setLeyendo] = useState(false);
  const [leido, setLeido] = useState(null);

  const leer = async () => {
    const img = await pickImage();
    if (!img) return;
    setLeyendo(true); setLeido(null);
    try {
      let d = null;
      if (cfgIA) {
        try {
          const r = await api.leerCapturaIA(img);
          d = { especie: r.species, nivel: r.level, naturaleza: r.nature, habilidad: r.ability,
                ball: r.ball, origen: r.origin, shiny: r.shiny, movimientos: r.moves || [], ivs: r.ivs || [] };
        } catch { /* se intenta en local */ }
      }
      if (!d) { const { leerCaptura } = await import("./ocr.js"); d = await leerCaptura(img, getLang()); }
      const n = { ...f, image: img };
      let c = 0;
      if (d.especie) { n.species = d.especie; c++; }
      if (d.nivel) { n.level = d.nivel; c++; }
      if (d.naturaleza) { n.nature = d.naturaleza; c++; }
      if (d.habilidad) { n.ability = d.habilidad; c++; }
      if (d.ball) { n.ball = d.ball; c++; }
      if (d.origen) { n.origin = d.origen; c++; }
      if (d.movimientos?.length) { n.moves = d.movimientos.join(", "); c++; }
      if (d.ivs?.length === 6) { n.ivs = d.ivs; c++; }
      if (d.shiny) { n.isShiny = true; c++; }
      setF(n); setLeido(c);
    } catch { setLeido(0); }
    setLeyendo(false);
  };

  return (
    <div className="ficha" style={{ marginBottom: 14 }}>
      <button className="btn mini secundario" disabled={leyendo} onClick={leer}>
        {leyendo ? tx().leyendoIA : "◎ " + tx().desdeCaptura}
      </button>
      {leido !== null && (
        <div className="mt-10">
          <Aviso tipo={leido > 0 ? "verde" : "oro"}>{leido > 0 ? tx().fotoLeida(leido) : tx().fotoSinDatos}</Aviso>
        </div>
      )}

      <div className="mt-14">
        <CampoEspecie label={tx().lblEspecie} value={f.species || ""}
          onChange={(v) => setF({ ...f, species: v })} placeholder={tx().phEspecie} />
        {f.species && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {[false, true].map((sh) => (
              <button key={String(sh)} className={`opcion-shiny ${!!f.isShiny === sh ? "elegida" : ""}`}
                onClick={() => setF({ ...f, isShiny: sh })}>
                <Sprite nombre={f.species} tam={54} shiny={sh} />
                <span className="txt-xs">{sh ? "✦ " + tx().shinyOpc : tx().normalOpc}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><Campo label={tx().lblNivel}>
            <input type="number" min="1" max="100" value={f.level || ""} onChange={(e) => setF({ ...f, level: e.target.value })} />
          </Campo></div>
          <div style={{ flex: 1 }}><Campo label={tx().lblNaturaleza}>
            <input value={f.nature || ""} onChange={(e) => setF({ ...f, nature: e.target.value })} placeholder={tx().phNaturaleza} />
          </Campo></div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><Campo label={tx().lblHabilidad}>
            <input value={f.ability || ""} onChange={(e) => setF({ ...f, ability: e.target.value })} />
          </Campo></div>
          <div style={{ flex: 1 }}><Campo label={tx().lblBall}>
            <input value={f.ball || ""} onChange={(e) => setF({ ...f, ball: e.target.value })} placeholder={tx().phBall} />
          </Campo></div>
        </div>
        <Campo label={tx().lblMoves}>
          <input value={f.moves || ""} onChange={(e) => setF({ ...f, moves: e.target.value })} placeholder={tx().phMoves} />
        </Campo>
        <Campo label={tx().lblOrigen}>
          <input value={f.origin || ""} onChange={(e) => setF({ ...f, origin: e.target.value })} placeholder={tx().phOrigen} />
        </Campo>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn mini" style={{ flex: 1 }} disabled={busy || !(f.species || "").trim()}
          onClick={() => onGuardar(f)}>{tx().guardarPk}</button>
        <button className="btn mini secundario" onClick={onCancelar}>{tx().btnCancelar}</button>
      </div>
    </div>
  );
}

function Inventario({ me, refresh, onAbrirOferta, cfgIA }) {
  const [sub, setSub] = useState("coleccion");
  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(null);   // id o "nuevo"
  const [publicando, setPublicando] = useState(null);
  const [wants, setWants] = useState("");
  const { run, busy, err } = useRun(refresh);

  const todos = api.snap.pokemon || [];
  const coleccion = todos.filter((p) => p.status === "owned");
  const publicados = todos.filter((p) => p.status === "listed");
  const cerrados = todos.filter((p) => p.status === "traded");
  const lista = sub === "coleccion" ? coleccion : sub === "publicadas" ? publicados : cerrados;
  const abierto = todos.find((p) => p.id === detalle);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 className="h1">{tx().tabInventario}</h1>
        <button className="btn mini" onClick={() => { setEditando("nuevo"); setDetalle(null); }}>{tx().anadirPokemon}</button>
      </div>

      <div className="tags" style={{ marginBottom: 14 }}>
        {[["coleccion", `${tx().miColeccion} (${coleccion.length})`],
          ["publicadas", `${tx().invPublicadas} (${publicados.length})`],
          ["intercambiadas", `${tx().invIntercambiadas} (${cerrados.length})`]].map(([id, l]) => (
          <button key={id} className={`btn mini ${sub === id ? "" : "secundario"}`}
            onClick={() => { setSub(id); setDetalle(null); }}>{l}</button>
        ))}
      </div>

      {err && <div style={{ marginBottom: 14 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      {editando && (
        <FormPokemon
          inicial={editando === "nuevo" ? {} : todos.find((p) => p.id === editando)}
          cfgIA={cfgIA} busy={busy}
          onCancelar={() => setEditando(null)}
          onGuardar={(f) => run(async () => {
            const datos = {
              species: f.species, isShiny: !!f.isShiny, level: f.level ? Number(f.level) : null,
              nature: f.nature, ability: f.ability, ball: f.ball, origin: f.origin,
              moves: String(f.moves || "").split(",").map((m) => m.trim()).filter(Boolean),
              ivs: f.ivs || [], image: f.image,
            };
            if (editando === "nuevo") await api.crearPokemon(datos);
            else await api.editarPokemon(editando, datos);
            setEditando(null);
          })}
        />
      )}

      {lista.length === 0 && !editando ? (
        <Vacio icono={sub === "coleccion" ? "▣" : sub === "publicadas" ? "▭" : "◈"}>
          {sub === "coleccion" ? tx().coleccionVacia : sub === "publicadas" ? tx().invVacio : tx().invSinTrades}
        </Vacio>
      ) : (
        <>
          <div className="rejilla-inv">
            {lista.map((p) => (
              <button key={p.id} className="casilla-inv" onClick={() => { setDetalle(detalle === p.id ? null : p.id); setPublicando(null); }}>
                {p.isShiny && <span className="insignia-inv izq">✦</span>}
                {p.featured && <span className="insignia-inv">★</span>}
                <Sprite nombre={p.species} tam={54} shiny={p.isShiny} />
                <span className="nom">{nombreLimpio(p.species)}</span>
              </button>
            ))}
          </div>

          {abierto && (
            <div className="ficha mt-14">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Sprite nombre={abierto.species} tam={58} shiny={abierto.isShiny} halo />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b className="txt-s">{nombreLimpio(abierto.species)}</b>
                  <div className="txt-xs suave">
                    {[abierto.isShiny && "✦ Shiny", abierto.level && `${tx().nv} ${abierto.level}`, abierto.nature]
                      .filter(Boolean).join(" · ")}
                  </div>
                  {abierto.moves?.length > 0 && <div className="txt-xs suave">{abierto.moves.join(", ")}</div>}
                </div>
              </div>

              {abierto.status === "owned" && (
                publicando === abierto.id ? (
                  <div className="mt-14">
                    <Campo label={tx().lblQueBuscasEste}>
                      <textarea value={wants} onChange={(e) => setWants(e.target.value)} placeholder={tx().phBuscas} />
                    </Campo>
                    <button className="btn mini" disabled={busy || wants.trim().length < 3}
                      onClick={() => run(async () => { await api.publicarPokemon(abierto.id, wants); setPublicando(null); setWants(""); setSub("publicadas"); })}>
                      {tx().publicarEste}
                    </button>
                    <button className="btn mini secundario" style={{ marginLeft: 8 }} onClick={() => setPublicando(null)}>{tx().btnCancelar}</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <button className="btn mini" onClick={() => { setPublicando(abierto.id); setWants(""); }}>{tx().publicarEste}</button>
                    <button className="btn mini secundario" disabled={busy}
                      onClick={() => run(() => api.destacarPokemon(abierto.id))}>
                      {abierto.featured ? tx().noDestacar : tx().destacar}
                    </button>
                    <button className="btn mini secundario" onClick={() => setEditando(abierto.id)}>{tx().editarPk}</button>
                    <button className="btn mini peligro" disabled={busy}
                      onClick={() => { if (confirm(tx().confirmBorrarPk)) run(async () => { await api.borrarPokemon(abierto.id); setDetalle(null); }); }}>
                      {tx().borrarPk}
                    </button>
                  </div>
                )
              )}

              {abierto.status === "listed" && (
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn mini secundario" onClick={() => onAbrirOferta(abierto.offerId)}>{tx().verOfertas}</button>
                  <button className="btn mini peligro" disabled={busy}
                    onClick={() => run(() => api.retirarPokemon(abierto.id))}>{tx().retirar}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================= Lista de deseos ================= */
function Deseos({ me, refresh, onAbrirOferta }) {
  const [f, setF] = useState({});
  const { run, busy, err } = useRun(refresh);
  const lista = api.snap.wishlist || [];
  const matches = api.snap.matches || [];
  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().deseosTitulo}</h1>
      <p className="txt-s suave" style={{ marginBottom: 14 }}>{tx().deseosIntro}</p>

      {matches.length > 0 && (
        <div className="ficha" style={{ marginBottom: 14, borderColor: "var(--verde)" }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: "var(--verde)" }}>{tx().coincidencias(matches.length)}</div>
          {matches.map((m) => (
            <button key={m.offerId} className="fila" style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #d8ded9", cursor: "pointer", font: "inherit", padding: "9px 0" }}
              onClick={() => onAbrirOferta(m.offerId)}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sprite nombre={m.species} tam={32} shiny={m.isShiny} />
                <span className="txt-s"><b>{m.species}</b>{m.isShiny ? " ★" : ""} — {userById(m.ownerId)?.displayName ?? "—"}</span>
              </span>
              <span className="txt-xs suave">{fecha(m.at)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ficha">
        <CampoEspecie label={tx().lblDeseo} value={f.species} onChange={(v) => setF({ ...f, species: v })} placeholder={tx().phEspecie} />
        <label className="check"><input type="checkbox" checked={!!f.shinyOnly} onChange={(e) => setF({ ...f, shinyOnly: e.target.checked })} /> {tx().soloShinyDeseo}</label>
        <Campo label={tx().lblNotaDeseo}><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <Aviso tipo="lacre">{err}</Aviso>}
        <button className="btn mt-10" disabled={busy || !f.species} onClick={() => run(async () => { await api.addWish(f); setF({}); })}>
          {tx().btnAddDeseo}
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="mt-14"><Vacio icono="✦">{tx().sinDeseos}</Vacio></div>
      ) : (
        <div className="ficha mt-14">
          {lista.map((w) => (
            <div key={w.id} className="fila" style={{ borderTop: "1px solid #d8ded9", padding: "9px 0" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Sprite nombre={w.species} tam={34} shiny={w.shinyOnly} />
                <span className="txt-s"><b>{w.species}</b>{w.shinyOnly ? " ★" : ""}{w.note ? <span className="suave"> — {w.note}</span> : null}</span>
              </span>
              <button className="enlace-volver" disabled={busy} onClick={() => run(() => api.delWish(w.id))}>{tx().quitar}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Ficha pública del entrenador ================= */
function FichaUsuario({ userId, onBack, onEscribir, miId }) {
  const u = userById(userId);
  if (!u) return null;
  const sanc = sanctionsOf(userId);
  const ofertas = api.snap.offers.filter((o) => o.ownerId === userId && o.status === "active");
  return (
    <div>
      <button className="enlace-volver" onClick={onBack}>{tx().volverMercado}</button>
      <h1 className="h1" style={{ margin: "14px 0" }}>{tx().fichaPublica}</h1>
      <div className="ticket">
        <div className="ticket-cuerpo">
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {u.avatarId && (
              <img src={api.imageUrl(u.avatarId)} alt="" style={{ width: 68, height: 68, borderRadius: "50%",
                objectFit: "cover", border: "2px solid var(--tinta)", flexShrink: 0 }} />
            )}
            <div>
              <div className="h2">{u.displayName}</div>
              <div className="txt-xs suave">{tx().entrenador} {u.trainerName}</div>
              {u.favorite && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Sprite nombre={u.favorite} tam={34} />
                  <span className="txt-xs" style={{ color: "var(--verde)", fontWeight: 700 }}>★ {u.favorite}</span>
                </div>
              )}
            </div>
          </div>
          <div className="tags mt-10">
            {u.rank && <span className={`tag ${u.rank === "oro" ? "oro" : u.rank === "marcado" ? "lacre" : "tenue"}`}>{tx()[RANGOS[u.rank]]}</span>}
            {u.verified ? <span className="tag verde">{tx().verificado}</span> : <span className="tag tenue">{tx().sinVerificar}</span>}
            <span className="tag tenue">{u.trades} {tx().trades}</span>
            {u.rating && <span className="tag oro">★ {u.rating}</span>}
            {u.newAccount && <span className={`tag ${u.trades > 0 ? "tenue" : "oro"}`}>{u.trades > 0 ? tx().nuevo : tx().cuentaNueva}</span>}
          </div>
          <div className="tags mt-10"><Presencia lastSeen={u.lastSeen} /></div>
          {u.availability && <p className="txt-xs suave mt-6">◷ {u.availability}</p>}
          <div className="txt-xs suave mt-10">{tx().miembroDesde} {fecha(u.createdAt)}</div>
          <div className="txt-xs suave">{u.lastTrade ? `${tx().ultimoTrade} ${fecha(u.lastTrade)}` : tx().sinTradesAun}</div>
          {u.bio && <p className="txt-s mt-10">{u.bio}</p>}
        </div>
      </div>
      {(() => {
        const dest = (api.snap.featured || []).filter((p) => p.ownerId === u.id);
        if (!dest.length) return null;
        return (
          <div className="ficha mt-14">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().vitrina}</div>
            <div className="rejilla-inv">
              {dest.map((p) => (
                <div key={p.id} className="casilla-inv" style={{ cursor: "default" }}>
                  {p.isShiny && <span className="insignia-inv izq">✦</span>}
                  <Sprite nombre={p.species} tam={52} shiny={p.isShiny} />
                  <span className="nom">{nombreLimpio(p.species)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {onEscribir && u.id !== miId && (
        <button className="btn mt-14" onClick={() => onEscribir(u.id)}>{tx().escribirA}</button>
      )}
      {sanc.map((s) => (
        <div className="mt-14" key={s.id}><Aviso tipo="lacre"><b>{tx().sancionActiva}</b> {s.summary}</Aviso></div>
      ))}
      {ofertas.length > 0 && (
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().mercado}</div>
          {ofertas.map((o) => (
            <div key={o.id} className="fila"><span className="txt-s">{o.species}{o.isShiny ? " ★" : ""}</span><span className="txt-xs suave">{o.wants?.slice(0, 30)}</span></div>
          ))}
        </div>
      )}
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
      <button className="enlace-volver" onClick={onBack}>{tx().volverMercado}</button>
      <h1 className="h1" style={{ margin: "14px 0" }}>{tx().listaInfractores}</h1>
      <div style={{ marginBottom: 14 }}>
        <Aviso tipo="verde">{tx().infractoresIntro}</Aviso>
      </div>
      <input className="buscador" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx().phBuscarNombre} />
      {shown.length === 0 ? (
        <Vacio icono="✓">{tx().sinInfractores(q)}</Vacio>
      ) : shown.map((s) => {
        const u = userById(s.userId);
        return (
          <div key={s.id} className="ticket" style={{ marginBottom: 14, borderColor: "var(--lacre)" }}>
            <div className="ticket-cuerpo">
              <div className="tags">
                <b style={{ color: "var(--lacre)", fontSize: 15 }}>{u?.displayName ?? tx().usuarioEliminado}</b>
                {u && <span className="tag tenue">{tx().entrenador} {u.trainerName}</span>}
              </div>
              <p className="txt-s suave mt-10">{s.summary}</p>
            </div>
            <div className="ticket-talon lacre">
              <span className="txt-xs" style={{ color: "var(--lacre)", fontWeight: 700 }}>
                {s.expires ? `${tx().caduca} ${fecha(s.expires)}` : tx().marcaPermanente} · {fecha(s.at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Gestiona los mensajes que aún no ha confirmado el servidor:
   aparecen al instante en gris y se marcan si fallan. */
function usePendientes(enviarReal) {
  const [pendientes, setPendientes] = useState([]);
  const enviar = async (texto, extra) => {
    const clave = Math.random().toString(36).slice(2);
    setPendientes((p) => [...p, { clave, text: texto, at: new Date().toISOString(), estado: "enviando" }]);
    try {
      await enviarReal(texto, extra);
      setPendientes((p) => p.filter((x) => x.clave !== clave));
      return { ok: true };
    } catch (e) {
      setPendientes((p) => p.map((x) => x.clave === clave ? { ...x, estado: "error" } : x));
      return { ok: false, error: e };
    }
  };
  const quitar = (clave) => setPendientes((p) => p.filter((x) => x.clave !== clave));
  // Si el mensaje ya llegó por el estado, deja de estar pendiente
  const limpiar = (mensajes) => setPendientes((p) =>
    p.filter((x) => x.estado === "error" || !mensajes.some((m) => m.text === x.text && !m.system)));
  return { pendientes, enviar, quitar, limpiar };
}

/* Barra de acción: el siguiente paso del intercambio, dentro del chat */
function BarraAccion({ t, me, soyA, act, act2, busy, offer }) {
  const T = tx();
  const paso = ORDER.indexOf(t.state) + 1;
  let contenido = null;

  if (t.state === "proposal" && !soyA) {
    contenido = { txt: T.tePropone(userById(t.aId)?.displayName ?? "—"), mio: true, botones: (
      <>
        <button className="btn mini" disabled={busy} onClick={() => act("accept")}>{T.btnAceptar}</button>
        <button className="btn mini secundario" disabled={busy} onClick={() => act("decline")}>{T.btnRechazar}</button>
      </>
    ) };
  } else if (t.state === "proposal") {
    contenido = { txt: T.propuestaEnviada(userById(t.bId)?.displayName ?? "—"), mio: false };
  } else if (t.state === "contract") {
    const yoFirme = soyA ? t.signedA : t.signedB;
    contenido = yoFirme
      ? { txt: T.esperando, mio: false }
      : { txt: T.btnFirmar, mio: true, botones: <button className="btn mini" disabled={busy} onClick={() => act("sign")}>{T.btnFirmar}</button> };
  } else if (t.state === "pre_proof") {
    const yoProbe = soyA ? t.proofA : t.proofB;
    contenido = yoProbe
      ? { txt: T.esperando, mio: false }
      : { txt: T.pasoCaptura, mio: true, codigo: t.code, botones: (
          <button className="btn mini" disabled={busy} onClick={async () => { const i = await pickImage(); if (i) act2("proof", null, i); }}>
            {T.btnCaptura}
          </button>
        ) };
  } else if (t.state === "in_progress") {
    const yoEnt = soyA ? t.deliveredA : t.deliveredB;
    contenido = yoEnt
      ? { txt: T.esperando, mio: false }
      : { txt: T.addAmigos, mio: true, botones: <button className="btn mini" disabled={busy} onClick={() => act("delivered")}>{T.btnEntregue}</button> };
  } else if (t.state === "post_proof") {
    const yoConf = soyA ? t.confirmedA : t.confirmedB;
    contenido = yoConf
      ? { txt: T.esperandoConfirm(userById(soyA ? t.bId : t.aId)?.displayName ?? "—"), mio: false }
      : { txt: T.avisoPostProof, mio: true, botones: (
          <button className="btn mini" disabled={busy} onClick={async () => { const i = await pickImage(); if (i) act2("confirm", null, i); }}>
            {T.btnCapturaFinal}
          </button>
        ) };
  } else if (t.state === "closed") {
    contenido = { txt: T.cerrado + " ✦", mio: false, cerrado: true };
  }
  if (!contenido) return null;

  return (
    <div className={`barra-accion ${contenido.mio ? "activa" : ""} ${contenido.cerrado ? "hecho" : ""}`}>
      {!contenido.cerrado && (
        <div className="barra-accion-cab">
          <span className="eyebrow">{contenido.mio ? T.tuTurno : T.pasoDe(paso, 5)}</span>
          {contenido.codigo && <span className="codigo-chip">{contenido.codigo}</span>}
        </div>
      )}
      <p className="barra-accion-txt">{contenido.txt}</p>
      {contenido.botones && <div className="barra-accion-btns">{contenido.botones}</div>}
    </div>
  );
}

/* Cabecera del chat: qué das y qué recibes, siempre a la vista */
function CabeceraChat({ t, offer, soyA }) {
  const miItems = soyA ? (t.aItems?.length ? t.aItems : [t.aGive]) : null;
  return (
    <div className="chat-cab">
      <div className="chat-cab-lado">
        <span className="chat-cab-lbl">{tx().tuDas}</span>
        {soyA ? (
          <span className="chat-cab-txt">{(miItems || []).join(" + ") || "—"}</span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {offer && <Sprite nombre={offer.species} tam={34} shiny={offer.isShiny} />}
            <span className="chat-cab-txt">{offer?.species ?? "—"}</span>
          </span>
        )}
      </div>
      <span className="chat-cab-flecha">⇄</span>
      <div className="chat-cab-lado der">
        <span className="chat-cab-lbl">{tx().tuRecibes}</span>
        {soyA ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="chat-cab-txt">{offer?.species ?? "—"}</span>
            {offer && <Sprite nombre={offer.species} tam={34} shiny={offer.isShiny} />}
          </span>
        ) : (
          <span className="chat-cab-txt">{(t.aItems?.length ? t.aItems : [t.aGive]).join(" + ")}</span>
        )}
      </div>
    </div>
  );
}

/* Clave de amigo copiable */
function ClaveChip({ clave }) {
  const [copiada, setCopiada] = useState(false);
  if (!clave) return null;
  return (
    <button className="clave-chip" onClick={async () => {
      try { await navigator.clipboard.writeText(clave); } catch { /* sin permiso */ }
      setCopiada(true); setTimeout(() => setCopiada(false), 2000);
    }}>
      <span className="mono">⚿ {clave}</span>
      <span className="txt-xs">{copiada ? tx().claveCopiada : tx().copiarClave}</span>
    </button>
  );
}

/* ================= Trades ================= */
function TradeView({ trade: id, me, refresh, onBack }) {
  const t = api.snap.trades.find((x) => x.id === id);
  const [msg, setMsg] = useState("");
  const [claim, setClaim] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [offsitePend, setOffsitePend] = useState(null);
  const [problemas, setProblemas] = useState(false);
  const [modo, setModo] = useState("chat");
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const esStaff = ["moderator", "admin"].includes(me.role);
  // El chat se abre en cuanto el intercambio está en marcha, o si hay mediación
  const chatAbierto = ["in_progress", "post_proof"].includes(t.state)
    || !!t.mediationRequested || !!t.mediatorId;
  const [editandoItems, setEditandoItems] = useState(false);
  const [itemsTxt, setItemsTxt] = useState("");
  const [notaMed, setNotaMed] = useState("");
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
  const puedeMediar = ["mediator", "moderator", "admin"].includes(me.role);
  const cajaChat = useRef(null);
  const campoMsg = useRef(null);
  // Con el chat abierto se consulta más a menudo, para que no parezca muerto
  useEffect(() => { api.setRitmo(2500); return () => api.setRitmo(8000); }, []);
  useEffect(() => { marcarLeido(t.id); }, [t.id, t.messages?.length]);
  // Bajar al último mensaje al abrir el chat y al recibir uno nuevo
  useEffect(() => {
    const c = cajaChat.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [t.messages?.length, t.id]);
  const act = (action, value) => run(() => api.tradeAction(t.id, action, value));
  const act2 = (action, value, image) => run(() => api.tradeAction(t.id, action, value, image));
  const { pendientes, enviar: enviarPend, quitar, limpiar } = usePendientes(
    (texto, conf) => api.sendMessage(t.id, texto, conf));
  useEffect(() => { limpiar(t.messages || []); }, [t.messages?.length]);

  const enviar = async () => {
    const texto = msg.trim();
    if (!texto) return;
    setMsg("");
    campoMsg.current?.focus();          // el teclado no se cierra
    const r = await enviarPend(texto);
    if (r.ok) return refresh();
    const m = String(r.error?.message || "");
    if (m.includes("táctica") || m.includes("tactic")) { setOffsitePend(texto); quitar(); }
  };

  // Vista principal: chat a pantalla completa con el paso actual integrado
  if (modo === "chat") {
    return (
      <div className="pantalla-chat">
        <div className="barra-det" style={{ paddingBottom: 8 }}>
          <button className="volver-ic" onClick={onBack} aria-label="←">‹</button>
          <span className="barra-det-tit">{tx().chatTrade}</span>
          <button className="volver-ic" style={{ fontSize: 19 }} onClick={() => setModo("detalles")} aria-label={tx().verDetalles}>⋯</button>
        </div>

        <button className="chat-cab-btn" onClick={() => setModo("detalles")}>
          <CabeceraChat t={t} offer={offer} soyA={soyA} />
          <span className="chat-cab-mas">›</span>
        </button>

        <div className="fila-entrenador" style={{ margin: "10px 0" }}>
          {otro?.avatarId
            ? <img className="ent-avatar" src={api.imageUrl(otro.avatarId)} alt="" />
            : <span className="ent-avatar ent-inicial">{(otro?.displayName ?? "?").slice(0, 1).toUpperCase()}</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span className="ent-nombre" style={{ cursor: "default" }}>{otro?.displayName ?? "—"}</span>
            <span className="txt-xs suave">
              {otro?.lastSeen ? tx().visto(haceRato(otro.lastSeen)) : ""}
              {otro?.timezone && horaEn(otro.timezone) ? ` · ${horaEn(otro.timezone)}` : ""}
            </span>
          </div>
          <span style={{ marginLeft: "auto" }}><Sello code={t.code} /></span>
        </div>

        {(soyA ? t.friendB : t.friendA) && (
          <div style={{ marginBottom: 10 }}><ClaveChip clave={soyA ? t.friendB : t.friendA} /></div>
        )}

        {err && <div style={{ marginBottom: 10 }}><Aviso tipo="lacre">{err}</Aviso></div>}

        <div className="chat-mensajes" ref={cajaChat}>
          {t.messages.length === 0 && (
            <div className="chat-vacio txt-s"><span className="ic">✉</span>{tx().chatVacio}</div>
          )}
          {t.messages.map((m, i) => {
            const previo = t.messages[i - 1];
            const nuevoDia = !previo || !mismoDia(previo.at, m.at);
            const esHoy = mismoDia(m.at, new Date());
            const esAyer = mismoDia(m.at, Date.now() - 86400000);
            if (m.system) {
              return (
                <span key={i} style={{ display: "contents" }}>
                  {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
                  <Aviso tipo={m.kind}>{tSys(m.text)}</Aviso>
                </span>
              );
            }
            const mia = m.by === me.id;
            const inicio = nuevoDia || !previo || previo.system || previo.by !== m.by
              || new Date(m.at) - new Date(previo.at) > 300000;
            const autor = mia ? null : userById(m.by);
            return (
              <span key={i} style={{ display: "contents" }}>
                {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
                <div className={`msg ${mia ? "mia" : "suya"} ${inicio ? "inicio-grupo" : ""}`}>
                  {!mia && (inicio && autor?.avatarId
                    ? <img className="msg-avatar" src={api.imageUrl(autor.avatarId)} alt="" />
                    : <span className={`msg-avatar ${inicio ? "" : "hueco"}`}>{inicio ? "◍" : ""}</span>)}
                  <div className={`burbuja ${mia ? "mia" : "suya"}`}>
                    {m.text}
                    <span className="hora-msg">{hora(m.at)}</span>
                  </div>
                </div>
              </span>
            );
          })}
        </div>

        {pendientes.map((p) => (
          <div key={p.clave} className={`msg mia pendiente ${p.estado === "error" ? "fallo" : ""}`}>
            <div className="burbuja mia">
              {p.text}
              <span className="hora-msg">{p.estado === "error" ? tx().noEnviado : tx().enviando}</span>
            </div>
          </div>
        ))}

        <BarraAccion t={t} me={me} soyA={soyA} act={act} act2={act2} busy={busy} offer={offer} />

        {offsitePend && (
          <div className="ficha" style={{ margin: "10px 0" }}>
            <Aviso tipo="lacre">{tx().avisoOffsite}</Aviso>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="btn mini secundario" onClick={() => setOffsitePend(null)}>{tx().btnCancelar}</button>
              <button className="btn mini peligro" disabled={busy}
                onClick={() => { run(() => api.sendMessage(t.id, offsitePend, true)); setOffsitePend(null); }}>
                {tx().btnEnviarIgual}
              </button>
            </div>
          </div>
        )}

        {chatAbierto && (
          <>
            <div className="rapidas">
              {[tx().rr1, tx().rr2, tx().rr3, tx().rr4].map((r) => (
                <button key={r} className="rapida" disabled={busy}
                  onClick={() => run(() => api.sendMessage(t.id, r))}>{r}</button>
              ))}
            </div>
            <div className="chat-form">
              <input ref={campoMsg} className="chat-input" value={msg} onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} placeholder={tx().phMensaje} />
              <button className="btn-enviar" disabled={!msg.trim()} onClick={enviar} aria-label={tx().enviarMsg}>↑</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="barra-det">
        <button className="volver-ic" onClick={() => setModo("chat")} aria-label="←">‹</button>
        <span className="barra-det-tit">{tx().detalleOferta}</span>
        <span style={{ width: 34 }} />
      </div>
      <Via state={t.state} />

      <div className="ticket mt-14">
        <div className="contrato-grid">
          <div>
            <div className="eyebrow">{soyA ? tx().tuEntregas : tx().entrega(otro?.displayName ?? "—")}</div>
            {(t.aItems?.length ? t.aItems : [t.aGive]).map((it, i) => (
              <p key={i} className="txt-s mt-6">• {it}</p>
            ))}
          </div>
          <div>
            <div className="eyebrow">{soyA ? tx().recibes : tx().tuEntregas}</div>
            {offer && <div style={{ margin: "4px 0 2px" }}><Sprite nombre={offer.species} tam={56} shiny={offer.isShiny} halo /></div>}
            <div className="h2">{offer ? `${offer.species}${offer.isShiny ? " ★" : ""}` : "—"}</div>
            <div className="txt-xs suave">{offer ? [offer.level && `${tx().nv} ${offer.level}`, offer.nature].filter(Boolean).join(" · ") : ""}</div>
            {t.bItems?.map((it, i) => <p key={i} className="txt-s mt-6">• {it}</p>)}
          </div>
        </div>
        {(t.signedA && t.signedB) && (
          <div className="ticket-talon oro centrado">
            <span className="txt-xs" style={{ color: "var(--oro)", fontWeight: 700 }}>{tx().terminosCongelados}</span>
          </div>
        )}
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 6 }}>{tx().contraparte}</div>
        <Rep userId={otroId} />
        <div className="tags mt-6"><Presencia lastSeen={otro?.lastSeen} /></div>
        {otro?.timezone && horaEn(otro.timezone) && (
          <p className="txt-xs suave mt-6">
            ◷ {tx().suHora}: <b>{horaEn(otro.timezone)}</b>
            <span className="suave"> · {tx().tuHora}: {hora(new Date().toISOString())}</span>
          </p>
        )}
        {otro?.availability && <p className="txt-xs suave mt-6">▦ {otro.availability}</p>}
      </div>
      {["proposal", "contract", "pre_proof"].includes(t.state) && (
        <p className="txt-xs suave mt-6">{tx().avisoCaducidad}</p>
      )}
      {esStaff && !["closed", "cancelled"].includes(t.state) && (
        cancelando ? (
          <div className="ficha mt-14">
            <Campo label={tx().lblMotivoCancel}>
              <textarea value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} />
            </Campo>
            <button className="btn mini peligro" disabled={busy || motivoCancel.length < 10}
              onClick={() => run(async () => { await api.cancelarTradeStaff(t.id, motivoCancel); setCancelando(false); setMotivoCancel(""); })}>
              {tx().cancelarTrade}
            </button>
            <button className="btn mini secundario" style={{ marginLeft: 8 }} onClick={() => setCancelando(false)}>{tx().btnCancelar}</button>
          </div>
        ) : (
          <button className="btn mini secundario mt-14" onClick={() => setCancelando(true)}>⚑ {tx().cancelarTrade}</button>
        )
      )}

      {t.state === "cancelled" && t.cancelReason === "offer_traded" && (
        <div className="mt-14"><Aviso tipo="oro">{tx().canceladoPorTrato}</Aviso></div>
      )}
      {err && <div className="mt-14"><Aviso tipo="lacre">{err}</Aviso></div>}

      {["proposal", "contract"].includes(t.state) && !t.signedA && !t.signedB && (
        editandoItems ? (
          <div className="ficha mt-14">
            <Campo label={tx().lblItems}>
              <textarea value={itemsTxt} onChange={(e) => setItemsTxt(e.target.value)} placeholder={tx().phItems} style={{ minHeight: 90 }} />
            </Campo>
            <button className="btn mini" disabled={busy} onClick={() => run(async () => {
              await api.setItems(t.id, itemsTxt.split("\n").map((x) => x.trim()).filter(Boolean));
              setEditandoItems(false);
            })}>{tx().btnGuardarTerminos}</button>
            <button className="btn mini secundario" style={{ marginLeft: 8 }} onClick={() => setEditandoItems(false)}>{tx().btnCancelar}</button>
          </div>
        ) : (
          <button className="btn mini secundario mt-14" onClick={() => {
            setItemsTxt((soyA ? (t.aItems?.length ? t.aItems : [t.aGive]) : (t.bItems || [])).join("\n"));
            setEditandoItems(true);
          }}>{tx().editarTerminos}</button>
        )
      )}

      {(t.aId !== me.id && t.bId !== me.id) && (
        <div className="mt-14"><Aviso tipo="verde">{tx().mediadorActual(userById(t.mediatorId)?.displayName ?? "—")}</Aviso></div>
      )}

      {(t.aId === me.id || t.bId === me.id) && t.state === "proposal" && (soyA ? (
        <div className="mt-14"><Aviso tipo="verde">{tx().propuestaEnviada(otro?.displayName)}</Aviso>
          <button className="btn peligro mt-14" disabled={busy} onClick={() => act("cancel")}>{tx().retirarPropuesta}</button></div>
      ) : (
        <div className="mt-14">
          <Aviso tipo="verde">{tx().tePropone(otro?.displayName)}</Aviso>
          <button className="btn mt-14" disabled={busy} onClick={() => act("accept")}>{tx().btnAceptar}</button>
          <button className="btn peligro" disabled={busy} onClick={() => act("decline")}>{tx().btnRechazar}</button>
        </div>
      ))}

      {t.state === "contract" && (
        <div className="mt-14">
          <div className="ficha txt-s">
            <div className="fila"><span>{tx().tuFirma}</span><b style={{ color: yoFirme ? "var(--verde)" : "var(--tinta-suave)" }}>{yoFirme ? tx().firmado : tx().pendiente}</b></div>
            <div className="fila"><span>{tx().firmaDe(otro?.displayName)}</span><b style={{ color: (soyA ? t.signedB : t.signedA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.signedB : t.signedA) ? tx().firmado : tx().pendiente}</b></div>
          </div>
          {!yoFirme && <button className="btn mt-14" disabled={busy} onClick={() => act("sign")}>{tx().btnFirmar}</button>}
        </div>
      )}

      {t.state === "pre_proof" && (
        <div className="mt-14">
          <Aviso tipo="oro">{tx().avisoPreProof(t.code)}</Aviso>
          <div className="ficha mt-14 txt-s">
            <div className="fila"><span>{tx().tuPrueba}</span><b style={{ color: yoProbe ? "var(--verde)" : "var(--tinta-suave)" }}>{yoProbe ? tx().recibida : tx().pendiente}</b></div>
            <div className="fila"><span>{tx().pruebaDe(otro?.displayName)}</span><b style={{ color: (soyA ? t.proofB : t.proofA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.proofB : t.proofA) ? tx().recibida : tx().pendiente}</b></div>
          </div>
          <Pruebas trade={t} kind="proof_pre" me={me} />
          {!yoProbe && (
            <button className="btn mt-14" disabled={busy} onClick={async () => {
              const img = await pickImage();
              if (img) act2("proof", null, img);
            }}>{tx().btnCaptura}</button>
          )}
        </div>
      )}

      {t.state === "in_progress" && (
        <div className="mt-14">
          <div className="ficha txt-s">
            <div className="eyebrow" style={{ marginBottom: 6 }}>{tx().instrucciones}</div>
            {(soyA ? t.friendB : t.friendA) && (
              <p style={{ marginBottom: 6 }}>{tx().claveDe(otro?.displayName)} <b className="mono">{soyA ? t.friendB : t.friendA}</b></p>
            )}
            <p>{tx().addAmigos} {(() => {
              const ra = userById(t.aId), rb = userById(t.bId);
              if (!ra || !rb || ra.trades === rb.trades) return tx().simultaneo;
              const primero = ra.trades < rb.trades ? t.aId : t.bId;
              return primero === me.id ? tx().entregasPrimero : tx().entregaPrimero(otro?.displayName);
            })()}</p>
          </div>
          <div className="ficha mt-14 txt-s">
            <div className="fila"><span>{tx().tuEntrega}</span><b style={{ color: yoEntregue ? "var(--verde)" : "var(--tinta-suave)" }}>{yoEntregue ? tx().entregado : tx().pendiente}</b></div>
            <div className="fila"><span>{tx().entregaDe(otro?.displayName)}</span><b style={{ color: (soyA ? t.deliveredB : t.deliveredA) ? "var(--verde)" : "var(--tinta-suave)" }}>{(soyA ? t.deliveredB : t.deliveredA) ? tx().entregado : tx().pendiente}</b></div>
          </div>
          {!yoEntregue && <button className="btn mt-14" disabled={busy} onClick={() => act("delivered")}>{tx().btnEntregue}</button>}
        </div>
      )}

      {t.state === "post_proof" && (
        <div className="mt-14">
          <Aviso tipo="verde">{tx().avisoPostProof}</Aviso>
          <Pruebas trade={t} kind="proof_post" me={me} />
          {!yoConfirme ? (
            <button className="btn mt-14" disabled={busy} onClick={async () => {
              const img = await pickImage();
              if (img) act2("confirm", null, img);
            }}>{tx().btnCapturaFinal}</button>
          ) : (
            <div className="mt-14"><Aviso tipo="verde">{tx().esperandoConfirm(otro?.displayName)}</Aviso></div>
          )}
        </div>
      )}

      {t.state === "closed" && (
        <div className="mt-14">
          <div className="ticket">
            <div className="ticket-cuerpo centrado">
              <div style={{ fontSize: 36 }}>✦</div>
              <div className="h1 mt-6" style={{ color: "var(--verde)" }}>{tx().cerrado}</div>
              <div className="mt-10"><Sello code={t.code} verde grande /></div>
            </div>
            <div className="ticket-talon centrado"><span className="txt-xs">{tx().reciboSellado(t.events.length)}</span></div>
          </div>
          {!(soyA ? t.ratingForB : t.ratingForA) && (
            <div className="ficha mt-14 centrado">
              <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().valoraA(otro?.displayName)}</div>
              <div className="estrellas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={n <= rated ? "on" : ""} onClick={() => setRated(n)} aria-label={`${n} estrellas`}>★</button>
                ))}
              </div>
              <button className="btn mini" disabled={!rated || busy} style={{ margin: "12px auto 0", display: "block" }}
                onClick={() => act("rate", rated)}>
                {tx().btnValorar}
              </button>
            </div>
          )}
        </div>
      )}

      {t.state === "disputed" && miDisputa && (
        <div className="mt-14">
          <Aviso tipo="lacre">
            <b>{tx().disputaAbierta(fecha(miDisputa.at))}</b> {miDisputa.accusedId === me.id ? tx().fuisteReportado : tx().fueNotificado(otro?.displayName)}
          </Aviso>
          <div className="ficha mt-14 txt-s">
            <div className="eyebrow" style={{ marginBottom: 4 }}>{tx().reporte}</div>
            <p className="suave">{miDisputa.claim}</p>
            {miDisputa.defense && (<><div className="eyebrow" style={{ margin: "10px 0 4px" }}>{tx().defensa}</div><p className="suave">{miDisputa.defense}</p></>)}
          </div>
          {miDisputa.accusedId === me.id && !miDisputa.defense && miDisputa.status === "open" && (
            <div className="ficha mt-14">
              <Campo label={tx().lblTuDefensa}>
                <textarea value={claim} onChange={(e) => setClaim(e.target.value)} />
              </Campo>
              <button className="btn" disabled={busy} onClick={() => run(async () => { await api.defend(miDisputa.id, claim); setClaim(""); })}>
                {tx().btnDefensa}
              </button>
            </div>
          )}
        </div>
      )}

      {(["in_progress", "post_proof"].includes(t.state) || t.mediationRequested || t.mediatorId) && (
        <>
          <div className="ticket mt-14">
            <CabeceraChat t={t} offer={offer} soyA={soyA} />
            {(soyA ? t.friendB : t.friendA) && (
              <div style={{ padding: "10px 12px 0" }}>
                <ClaveChip clave={soyA ? t.friendB : t.friendA} />
              </div>
            )}
            <div className="eyebrow" style={{ padding: "10px 14px 0" }}>{tx().chatTitulo}</div>
            <div className="chat-caja" ref={cajaChat}>
              {t.messages.length === 0 && (
                <div className="chat-vacio txt-s"><span className="ic">✉</span>{tx().chatVacio}</div>
              )}
              {t.messages.map((m, i) => {
                const previo = t.messages[i - 1];
                const nuevoDia = !previo || !mismoDia(previo.at, m.at);
                const esHoy = mismoDia(m.at, new Date());
                const esAyer = mismoDia(m.at, Date.now() - 86400000);
                if (m.system) {
                  return (
                    <span key={i} style={{ display: "contents" }}>
                      {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
                      <Aviso tipo={m.kind}>{tSys(m.text)}</Aviso>
                    </span>
                  );
                }
                const mia = m.by === me.id;
                // Primer mensaje de una tanda de la misma persona
                const inicio = nuevoDia || !previo || previo.system || previo.by !== m.by
                  || new Date(m.at) - new Date(previo.at) > 300000;
                const autor = mia ? null : userById(m.by);
                return (
                  <span key={i} style={{ display: "contents" }}>
                    {nuevoDia && <div className="dia-sep">{esHoy ? tx().hoy : esAyer ? tx().ayer : diaCorto(m.at)}</div>}
                    {inicio && !mia && autor && <div className="autor-msg">{autor.displayName}</div>}
                    <div className={`msg ${mia ? "mia" : "suya"} ${inicio ? "inicio-grupo" : ""}`}>
                      {!mia && (inicio && autor?.avatarId
                        ? <img className="msg-avatar" src={api.imageUrl(autor.avatarId)} alt="" />
                        : <span className={`msg-avatar ${inicio ? "" : "hueco"}`}>{inicio ? "◍" : ""}</span>)}
                      <div className={`burbuja ${mia ? "mia" : "suya"}`}>
                        {m.text}
                        <span className="hora-msg">{hora(m.at)}</span>
                      </div>
                    </div>
                  </span>
                );
              })}
            </div>
            <div className="rapidas">
              {[tx().rr1, tx().rr2, tx().rr3, tx().rr4].map((r) => (
                <button key={r} className="rapida" disabled={busy}
                  onClick={() => run(() => api.sendMessage(t.id, r))}>{r}</button>
              ))}
            </div>
            <div className="chat-form">
              <input className="chat-input" value={msg} onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
                placeholder={tx().phMensaje} />
              <button className="btn-enviar" disabled={busy || !msg.trim()} onClick={enviar} aria-label={tx().enviarMsg}>➤</button>
            </div>
          </div>
          {offsitePend && (
            <div className="ficha mt-14" style={{ borderColor: "var(--lacre)" }}>
              <Aviso tipo="lacre">{tx().avisoOffsite}</Aviso>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn mini secundario" onClick={() => setOffsitePend(null)}>{tx().btnCancelar}</button>
                <button className="btn mini peligro" disabled={busy}
                  onClick={() => { run(() => api.sendMessage(t.id, offsitePend, true)); setOffsitePend(null); }}>{tx().btnEnviarIgual}</button>
              </div>
            </div>
          )}
        </>
      )}

      {["contract", "pre_proof", "in_progress", "post_proof"].includes(t.state) && (
        problemas || t.mediationRequested || t.mediatorId ? (
          <div className="mt-14">
            <div className="ficha">
          <div className="eyebrow" style={{ marginBottom: 6 }}>{tx().mediacion}</div>
          {t.mediatorId ? (
            <>
              <p className="txt-s">{tx().mediadorActual(userById(t.mediatorId)?.displayName ?? "—")}</p>
              {t.mediatorId === me.id && (
                <div className="mt-10">
                  <Campo label={tx().lblNotaMediacion}><input value={notaMed} onChange={(e) => setNotaMed(e.target.value)} /></Campo>
                  <button className="btn mini" disabled={busy} onClick={() => run(async () => { await api.closeMediation(t.id, notaMed); setNotaMed(""); })}>
                    {tx().btnCerrarMediacion}
                  </button>
                </div>
              )}
            </>
          ) : t.mediationRequested ? (
            <>
              <Aviso tipo="oro">{tx().mediacionPedida}</Aviso>
              {puedeMediar && t.aId !== me.id && t.bId !== me.id && (
                <button className="btn mini mt-10" disabled={busy} onClick={() => run(() => api.takeMediation(t.id))}>{tx().btnTomarCaso}</button>
              )}
            </>
          ) : (t.aId === me.id || t.bId === me.id) ? (
            <>
              <p className="txt-xs suave">{tx().mediacionAyuda}</p>
              <button className="btn mini secundario mt-10" disabled={busy} onClick={() => run(() => api.askMediation(t.id))}>{tx().pedirMediacion}</button>
            </>
          ) : null}
            </div>
            {["in_progress", "post_proof"].includes(t.state) && (
              showDispute ? (
                <div className="ficha mt-14">
                  <Campo label={tx().lblQueOcurrio}>
                    <textarea value={claim} onChange={(e) => setClaim(e.target.value)} />
                  </Campo>
                  <Aviso tipo="oro">{tx().avisoReportesFalsos}</Aviso>
                  <button className="btn peligro mt-14" disabled={busy}
                    onClick={() => run(async () => { await api.openDispute(t.id, claim); setShowDispute(false); setClaim(""); })}>
                    {tx().btnEnviarReporte}
                  </button>
                  <button className="btn secundario" onClick={() => setShowDispute(false)}>{tx().btnCancelar}</button>
                </div>
              ) : (
                <button className="btn peligro mt-14" onClick={() => setShowDispute(true)}>{tx().btnAbrirDisputa}</button>
              )
            )}
          </div>
        ) : (
          <button className="enlace-volver mt-14" style={{ display: "block", margin: "14px auto 0" }}
            onClick={() => setProblemas(true)}>{tx().algoVaMal}</button>
        )
      )}
    </div>
  );
}

// Mensajes sin leer de una conversación directa
function sinLeerDM(d, miId) {
  const desde = leidos()["dm:" + d.id] || 0;
  return (d.messages || []).filter((m) => !m.system && m.by !== miId && new Date(m.at).getTime() > desde).length;
}

function MisTrades({ me, refresh, abrir, onAbierto, onAbrirDM }) {
  const [seccion, setSeccion] = useState("trades");
  const [open, setOpen] = useState(null);
  useEffect(() => { if (abrir) { setOpen(abrir); onAbierto && onAbierto(); } }, [abrir]);
  const [verHistorial, setVerHistorial] = useState(false);
  const todos = api.snap.trades.filter((t) => t.aId === me.id || t.bId === me.id);
  const terminados = todos.filter((t) => ["closed", "cancelled"].includes(t.state));
  const mine = verHistorial ? terminados : todos.filter((t) => !["closed", "cancelled"].includes(t.state));
  const puedeMediar = ["mediator", "moderator", "admin"].includes(me.role);
  const casos = puedeMediar
    ? api.snap.trades.filter((t) => t.aId !== me.id && t.bId !== me.id && (t.mediationRequested || t.mediatorId === me.id))
    : [];
  if (open) return <TradeView trade={open} me={me} refresh={refresh} onBack={() => setOpen(null)} />;
  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 12 }}>{tx().tabBuzon}</h1>
      <div className="tags" style={{ marginBottom: 14 }}>
        <button className={`btn mini ${seccion === "trades" ? "" : "secundario"}`} onClick={() => setSeccion("trades")}>
          {tx().intercambiosTab}
        </button>
        <button className={`btn mini ${seccion === "dm" ? "" : "secundario"}`} onClick={() => setSeccion("dm")}>
          {tx().mensajes}{(api.snap.dm || []).some((d) => sinLeerDM(d, me.id) > 0) ? " ●" : ""}
        </button>
      </div>

      {seccion === "dm" && (
        (api.snap.dm || []).length === 0
          ? <Vacio icono="✉">{tx().sinMensajes}</Vacio>
          : (api.snap.dm || []).map((d) => {
              const u = userById(d.otherId);
              const ultimo = [...d.messages].reverse().find((m) => !m.system);
              const nuevos = sinLeerDM(d, me.id);
              return (
                <button key={d.id} className="ficha" style={{ marginBottom: 10 }} onClick={() => onAbrirDM(d.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {u?.avatarId
                      ? <img className="ent-avatar" style={{ width: 42, height: 42 }} src={api.imageUrl(u.avatarId)} alt="" />
                      : <span className="ent-avatar ent-inicial" style={{ width: 42, height: 42 }}>{(u?.displayName ?? "?").slice(0, 1).toUpperCase()}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <b className="txt-s">{u?.displayName ?? "—"}</b>
                        <span className="txt-xs suave">{haceRato(d.lastAt)}</span>
                      </div>
                      <div className="txt-xs suave" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ultimo ? ultimo.text : "—"}
                      </div>
                    </div>
                    {nuevos > 0 && <span className="tag lacre">{nuevos}</span>}
                  </div>
                </button>
              );
            })
      )}

      {seccion === "trades" && (<>
      {puedeMediar && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().casosMediacion(casos.length)}</div>
          {casos.length === 0 ? (
            <p className="txt-xs suave">{tx().sinCasosMediacion}</p>
          ) : casos.map((t) => (
            <button key={t.id} className="ficha" style={{ marginBottom: 10, borderColor: "var(--oro)" }}
              onClick={() => setOpen(t.id)}>
              <div className="tags">
                <Sello code={t.code} />
                <span className="tag oro">{t.mediatorId === me.id ? tx().mediacion : tx().btnTomarCaso}</span>
                <span className="tag tenue">{stateLabel(t.state)}</span>
              </div>
              <p className="txt-s mt-10">{userById(t.aId)?.displayName ?? "—"} ⇄ {userById(t.bId)?.displayName ?? "—"}</p>
            </button>
          ))}
        </div>
      )}
      <div className="tags" style={{ marginBottom: 14 }}>
        <button className={`btn mini ${verHistorial ? "secundario" : ""}`} onClick={() => setVerHistorial(false)}>
          {tx().enCurso} ({todos.length - terminados.length})
        </button>
        <button className={`btn mini ${verHistorial ? "" : "secundario"}`} onClick={() => setVerHistorial(true)}>
          {tx().historial} ({terminados.length})
        </button>
      </div>
      {mine.length === 0 ? (
        todos.length === 0
          ? <Vacio icono="◈">{tx().sinTrades1}<br />{tx().sinTrades2} <b>{tx().tabMercado}</b> {tx().sinTrades3}</Vacio>
          : <Vacio icono={verHistorial ? "▤" : "✓"}>{verHistorial ? tx().sinHistorial : tx().sinActivos}</Vacio>
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
              <span className={`tag ${t.state === "closed" ? "verde" : ["disputed", "cancelled"].includes(t.state) ? "lacre" : "tenue"}`}>{stateLabel(t.state)}</span>
              {pend && <span className="tag lacre">{tx().teToca}</span>}
              {sinLeer(t, me.id) > 0 && <span className="tag lacre">✉ {tx().nuevosMensajes(sinLeer(t, me.id))}</span>}
            </div>
            <div className="mt-10" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {offer && <Sprite nombre={offer.species} tam={38} shiny={offer.isShiny} />}
              <p className="txt-s">{offer?.species ?? "—"} ⇄ {tx().con} <b>{otro?.displayName ?? "—"}</b></p>
            </div>
          </button>
        );
      })}
      </>)}
    </div>
  );
}

/* ================= Perfil ================= */
function Perfil({ me, refresh, onStaff, oscuro, setOscuro }) {
  const u = userById(me.id);
  const { run, busy } = useRun(refresh);
  const exportar = () => run(async () => {
    const data = await api.exportMe();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "tradesafe-mis-datos.json"; a.click();
  });
  const borrar = () => {
    if (!confirm(tx().confirmEliminar)) return;
    run(() => api.deleteMe());
  };
  const misSanciones = api.snap.sanctions.filter((s) => s.userId === me.id);
  const [apelaId, setApelaId] = useState(null);
  const [apelaTxt, setApelaTxt] = useState("");
  const [bio, setBio] = useState(u?.bio || "");
  const [guardado, setGuardado] = useState(false);
  const [fav, setFav] = useState(me.favorite || "");
  const [disp, setDisp] = useState(me.availability || "");
  const [avatarPrev, setAvatarPrev] = useState(null);
  const [avatarNuevo, setAvatarNuevo] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [codRec, setCodRec] = useState(null);
  const [passRec, setPassRec] = useState("");
  const certUrl = `${typeof location !== "undefined" ? location.origin : ""}/api/cert/${me.id}`;
  const [tarjeta, setTarjeta] = useState(null);
  const [blobTarjeta, setBlobTarjeta] = useState(null);
  const [haciendo, setHaciendo] = useState(false);
  const [errTarjeta, setErrTarjeta] = useState(false);

  const crearTarjeta = async () => {
    setHaciendo(true);
    try {
      const cv = await dibujarTarjeta({
        trainer: me.displayName, homeName: me.trainerName, verified: me.verified,
        memberSince: me.createdAt, closedTrades: u?.trades ?? 0, rating: u?.rating,
        rank: u?.rank || "novato", favorite: me.favorite,
        avatarUrl: me.avatarId ? api.imageUrl(me.avatarId) : null,
      }, certUrl, getLang());
      const b = await aBlob(cv);
      setBlobTarjeta(b);
      setTarjeta(URL.createObjectURL(b));
    } catch { setErrTarjeta(true); }
    setHaciendo(false);
  };

  const compartirTarjeta = async () => {
    if (!blobTarjeta) return;
    const file = new File([blobTarjeta], `tradesafe-${me.displayName}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: certUrl });
      else await navigator.share({ url: certUrl });
    } catch { /* el usuario canceló */ }
  };
  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().miPerfil}</h1>
      {me.status === "suspended" && (
        <div style={{ marginBottom: 14 }}>
          <Aviso tipo="lacre"><b>{tx().suspendida}</b>{tx().suspendidaTxt}</Aviso>
        </div>
      )}
      <div className="ticket">
        <div className="ticket-cuerpo">
          <div className="h2">{me.displayName}</div>
          <div className="txt-xs suave">{tx().entrenadorHome} <b>{me.trainerName}</b> · {tx().rol} {me.role}</div>
          {me.friendCode && <div className="txt-xs suave mt-6">{tx().claveAmigo} <b className="mono">{me.friendCode}</b> <span className="suave">{tx().claveVisible}</span></div>}
          <div className="tags mt-10">
            {me.verified ? <span className="tag verde">{tx().cuentaVerificada}</span> : <span className="tag oro">{tx().verifPendiente}</span>}
            <span className="tag tenue">{u?.trades ?? 0} {tx().intercambios}</span>
            {u?.rating && <span className="tag oro">★ {u.rating}</span>}
            <span className="tag tenue">{tx().desde} {fecha(me.createdAt)}</span>
          </div>
        </div>
        <div className="ticket-talon"><span className="txt-xs">{tx().perfilPrivado}</span></div>
      </div>
      {!me.verified && me.status !== "suspended" && (
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().verifTitulo}</div>
          {!me.verifCode ? (
            <>
              <p className="txt-s suave">{tx().verifIntro}</p>
              <button className="btn mini mt-10" disabled={busy} onClick={() => run(() => api.requestVerifCode())}>{tx().btnGenerarCodigo}</button>
            </>
          ) : (
            <>
              <p className="txt-s">{tx().verifPaso1}</p>
              <div className="centrado mt-10"><Sello code={me.verifCode} grande /></div>
              <p className="txt-s mt-10">{tx().verifPaso2}</p>
              <button className="btn mini mt-10" disabled={busy} onClick={async () => {
                const img = await pickImage();
                if (img) run(() => api.submitVerification(img));
              }}>{tx().btnSubirVerif}</button>
              <p className="txt-xs suave mt-10">{tx().verifRevision}</p>
            </>
          )}
        </div>
      )}
      {misSanciones.length > 0 && (
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().misSanciones}</div>
          {misSanciones.map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid #d8ded9", paddingTop: 10, marginTop: 10 }}>
              <div className="tags">
                <span className="tag lacre">{s.level === "ban" ? tx().ban : s.level === "major" ? tx().marcaMayor : tx().marcaMenor}</span>
                {s.appealStatus === "open" && <span className="tag oro">{tx().apelaEnRevision}</span>}
                {s.appealStatus === "upheld" && <span className="tag lacre">{tx().apelaDenegada}</span>}
                {s.appealStatus === "overturned" && <span className="tag verde">{tx().apelaAnulada}</span>}
              </div>
              <p className="txt-s suave mt-6">{s.summary}</p>
              {s.appealStatus === "none" && (apelaId === s.id ? (
                <div className="mt-10">
                  <Campo label={tx().lblApelacion}>
                    <textarea value={apelaTxt} onChange={(e) => setApelaTxt(e.target.value)} />
                  </Campo>
                  <button className="btn mini" disabled={busy} onClick={() => run(async () => { await api.appeal(s.id, apelaTxt); setApelaId(null); setApelaTxt(""); })}>{tx().btnEnviarApelacion}</button>
                  <button className="btn mini secundario" style={{ marginLeft: 8 }} onClick={() => setApelaId(null)}>{tx().btnCancelar}</button>
                </div>
              ) : (
                <button className="btn mini secundario mt-10" onClick={() => { setApelaId(s.id); setApelaTxt(""); }}>{tx().btnApelar}</button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 12 }}>{tx().misDatos}</div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
          <div style={{ width: 74, height: 74, borderRadius: "50%", overflow: "hidden",
            border: "2px solid var(--tinta)", background: "var(--cielo)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
            {avatarPrev || me.avatarId
              ? <img src={avatarPrev || api.imageUrl(me.avatarId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : "◍"}
          </div>
          <button className="btn mini secundario" onClick={async () => {
            const img = await pickImage();
            if (img) { setAvatarPrev(img); setAvatarNuevo(img); }
          }}>{me.avatarId || avatarPrev ? tx().btnCambiarFoto : tx().btnFoto}</button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <CampoEspecie label={tx().lblFavorito} value={fav} onChange={setFav} placeholder={tx().phEspecie} />
          </div>
          <div style={{ marginBottom: 12 }}><Sprite nombre={fav} tam={58} /></div>
        </div>

        <Campo label={tx().lblBio}>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={tx().phBio} maxLength={300} />
        </Campo>
        <Campo label={tx().lblDisponibilidad}>
          <input value={disp} onChange={(e) => setDisp(e.target.value)} placeholder={tx().phDisponibilidad} maxLength={120} />
        </Campo>

        <button className="btn mt-10" disabled={busy} onClick={() => run(async () => {
          await api.saveProfile({ bio, favorite: fav, availability: disp, avatar: avatarNuevo });
          setAvatarNuevo(null); setGuardado("datos"); setTimeout(() => setGuardado(false), 3000);
        })}>{tx().btnGuardarDatos}</button>
        {guardado === "datos" && <div className="mt-10"><Aviso tipo="verde">{tx().perfilGuardado}</Aviso></div>}
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().tarjeta}</div>
        <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().tarjetaIntro}</p>
        {tarjeta && (
          <img src={tarjeta} alt={tx().tarjeta}
            style={{ width: "100%", borderRadius: 12, border: "1px solid var(--linea)", marginBottom: 10, display: "block" }} />
        )}
        {errTarjeta && <div style={{ marginBottom: 10 }}><Aviso tipo="lacre">{tx().errorGenerico}</Aviso></div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!tarjeta ? (
            <button className="btn mini" disabled={haciendo} onClick={() => { setErrTarjeta(false); crearTarjeta(); }}>
              {haciendo ? tx().generando : tx().btnGenerarTarjeta}
            </button>
          ) : (
            <>
              {typeof navigator !== "undefined" && navigator.canShare && (
                <button className="btn mini" onClick={compartirTarjeta}>{tx().btnCompartirTarjeta}</button>
              )}
              <a className="btn mini secundario" style={{ textDecoration: "none", textAlign: "center" }}
                href={tarjeta} download={`tradesafe-${me.displayName}.png`}>{tx().btnDescargarTarjeta}</a>
              <a className="btn mini secundario" style={{ textDecoration: "none", textAlign: "center" }}
                href={certUrl + "?lang=" + getLang()} target="_blank" rel="noreferrer">{tx().verCert}</a>
            </>
          )}
        </div>
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().ajustes}</div>
        <div className="fila" style={{ padding: "10px 0", borderBottom: "1px solid var(--linea)" }}>
          <span className="txt-s">{oscuro ? tx().modoOscuro : tx().modoClaro}</span>
          <button className="btn mini secundario" onClick={() => setOscuro(!oscuro)}>{oscuro ? "○" : "●"}</button>
        </div>
        <div className="fila" style={{ padding: "10px 0" }}>
          <span className="txt-s">{tx().idioma}</span>
          <button className="btn mini secundario mono" onClick={() => { setLang(getLang() === "es" ? "en" : "es"); refresh(); }}>
            {getLang() === "es" ? "ES → EN" : "EN → ES"}
          </button>
        </div>
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().miCodigoRec}</div>
        {codRec ? (
          <>
            <Aviso tipo="oro">{tx().guardaCodigo}</Aviso>
            <div className="centrado mt-10">
              <span className="mono" style={{ fontSize: 19, fontWeight: 800, letterSpacing: 1.5, wordBreak: "break-all" }}>{codRec}</span>
            </div>
            <button className="btn mini secundario mt-10" onClick={() => setCodRec(null)}>{tx().yaLoGuarde}</button>
          </>
        ) : (
          <>
            <p className="txt-xs suave" style={{ marginBottom: 10 }}>{tx().sinCodigoAviso}</p>
            <Campo label={tx().lblTuPass}>
              <input type="password" value={passRec} onChange={(e) => setPassRec(e.target.value)} />
            </Campo>
            <button className="btn mini secundario" disabled={busy || passRec.length < 8}
              onClick={() => run(async () => { setCodRec(await api.reissueRecovery(passRec)); setPassRec(""); })}>
              {tx().regenerarCodigo}
            </button>
          </>
        )}
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().privacidadCuenta}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn mini secundario" disabled={busy} onClick={exportar}>{tx().btnExportar}</button>
          <button className="btn mini peligro" disabled={busy} onClick={borrar}>{tx().btnEliminar}</button>
        </div>
      </div>
      {["moderator", "admin"].includes(me.role) && onStaff && (
        <button className="btn secundario mt-14" onClick={onStaff}>{tx().panelStaffBtn}</button>
      )}
      <button className="btn secundario mt-14" onClick={() => { api.logout(); refresh(); }}>{tx().btnSalir}</button>
    </div>
  );
}

/* ================= Staff ================= */
/* Ficha de moderación: todo sobre un usuario y las acciones sobre él */
function FichaModeracion({ userId, onVolver, refresh }) {
  const [d, setD] = useState(null);
  const [accion, setAccion] = useState(null);
  const [f, setF] = useState({ days: 7 });
  const [hecho, setHecho] = useState("");
  const { run, busy, err } = useRun(refresh);

  const cargar = () => api.fichaModeracion(userId).then(setD).catch(() => setD(false));
  useEffect(() => { cargar(); }, [userId]);
  if (d === false) return <div><button className="enlace-volver" onClick={onVolver}>{tx().volverLista}</button><Vacio icono="⚠">—</Vacio></div>;
  if (!d) return <div className="txt-s suave">…</div>;

  const u = d.user;
  const silencio = d.sanctions.find((s) => s.level === "mute" && (!s.expires || new Date(s.expires) > new Date()));

  return (
    <div>
      <div className="barra-det">
        <button className="volver-ic" onClick={onVolver} aria-label="←">‹</button>
        <span className="barra-det-tit">{tx().fichaMod}</span>
        <span style={{ width: 34 }} />
      </div>

      <div className="ficha">
        <div className="h2">{u.display_name}</div>
        <div className="txt-xs suave">{tx().entrenador} {u.trainer_name || "—"} · {u.role} · {u.status}</div>
        <div className="tags mt-10">
          {u.verified ? <span className="tag verde">✓</span> : <span className="tag tenue">{tx().sinVerificar}</span>}
          <span className="tag tenue">{d.trades.length} {tx().trades}</span>
          <span className="tag tenue">{d.offers.length} {tx().ofertas}</span>
          {d.reportsAgainst > 0 && <span className="tag lacre">{tx().reportadoVeces(d.reportsAgainst)}</span>}
          {silencio && <span className="tag lacre">{tx().silenciado}</span>}
        </div>
        <div className="txt-xs suave mt-10">{tx().miembroDesde} {fecha(u.created_at)}</div>
      </div>

      {err && <div className="mt-14"><Aviso tipo="lacre">{err}</Aviso></div>}
      {hecho && <div className="mt-14"><Aviso tipo="verde">{tx().accionHecha}</Aviso></div>}

      <div className="tags mt-14">
        <button className="btn mini secundario" onClick={() => { setAccion(accion === "avisar" ? null : "avisar"); setHecho(""); }}>{tx().avisarU}</button>
        {silencio
          ? <button className="btn mini secundario" disabled={busy}
              onClick={() => run(async () => { await api.quitarSilencio(userId); await cargar(); setHecho("1"); })}>{tx().quitarSilencio}</button>
          : <button className="btn mini secundario" onClick={() => { setAccion(accion === "silenciar" ? null : "silenciar"); setHecho(""); }}>{tx().silenciar}</button>}
      </div>

      {accion === "avisar" && (
        <div className="ficha mt-14">
          <Campo label={tx().lblTituloAviso}><input value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Campo>
          <Campo label={tx().lblCuerpoAviso}><textarea value={f.body || ""} onChange={(e) => setF({ ...f, body: e.target.value })} /></Campo>
          <button className="btn mini" disabled={busy || !f.title || !f.body}
            onClick={() => run(async () => {
              await api.avisarUsuario(userId, { title: f.title, body: f.body });
              setAccion(null); setF({ days: 7 }); setHecho("1");
            })}>{tx().avisarU}</button>
        </div>
      )}

      {accion === "silenciar" && (
        <div className="ficha mt-14">
          <Campo label={tx().lblDias}><input type="number" min="1" max="90" value={f.days}
            onChange={(e) => setF({ ...f, days: e.target.value })} /></Campo>
          <Campo label={tx().lblMotivoMod}><textarea value={f.reason || ""} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Campo>
          <button className="btn mini peligro" disabled={busy || (f.reason || "").length < 10}
            onClick={() => run(async () => {
              await api.silenciar(userId, { days: Number(f.days), reason: f.reason });
              setAccion(null); setF({ days: 7 }); await cargar(); setHecho("1");
            })}>{tx().silenciar}</button>
        </div>
      )}

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().susSanciones}</div>
        {d.sanctions.length === 0 ? <p className="txt-xs suave">{tx().sinSanciones}</p>
          : d.sanctions.map((x) => (
            <div key={x.id} className="fila" style={{ borderTop: "1px solid var(--linea)", padding: "9px 0" }}>
              <span className="txt-s"><b>{x.level}</b> · {x.summary}</span>
              <span className="txt-xs suave">{fecha(x.created_at)}</span>
            </div>
          ))}
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().susTrades}</div>
        {d.trades.length === 0 ? <p className="txt-xs suave">—</p>
          : d.trades.map((t) => (
            <div key={t.id} className="fila" style={{ borderTop: "1px solid var(--linea)", padding: "9px 0" }}>
              <span className="txt-s"><Sello code={t.code} /> {stateLabel(t.state)}</span>
              <span className="txt-xs suave">{fecha(t.at)}</span>
            </div>
          ))}
      </div>

      <div className="ficha mt-14">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().susOfertas}</div>
        {d.offers.length === 0 ? <p className="txt-xs suave">—</p>
          : d.offers.map((o) => (
            <div key={o.id} className="fila" style={{ borderTop: "1px solid var(--linea)", padding: "9px 0" }}>
              <span className="txt-s">{o.species}{o.isShiny ? " ★" : ""}</span>
              <span className="txt-xs suave">{o.status}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function Staff({ me, refresh }) {
  const [pane, setPane] = useState("disputas");
  const [decideId, setDecideId] = useState(null);
  const [resumen, setResumen] = useState("");
  const [nivel, setNivel] = useState("minor");
  const [emitido, setEmitido] = useState(null);
  const [buscaU, setBuscaU] = useState("");
  const [fichaMod, setFichaMod] = useState(null);
  const [anTit, setAnTit] = useState("");
  const [anTxt, setAnTxt] = useState("");
  const [anNivel, setAnNivel] = useState("info");
  const [anDias, setAnDias] = useState("");
  const { run, busy, err } = useRun(refresh);
  const esAdmin = me.role === "admin";
  const pendVerif = api.snap.users.filter((u) => !u.verified && u.status === "active");
  const abiertas = api.snap.disputes.filter((d) => d.status === "open");
  const apelaciones = api.snap.sanctions.filter((s) => s.appealStatus === "open");
  const reportes = api.snap.offerReports || [];
  const chatsReportados = api.snap.dmReports || [];

  if (fichaMod) return <FichaModeracion userId={fichaMod} onVolver={() => setFichaMod(null)} refresh={refresh} />;

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().panelStaff}</h1>

      {(() => {
        const items = [
          [abiertas.length, tx().disputasCorto, "disputas"],
          [pendVerif.length, tx().verifCorto, "verif"],
          [apelaciones.length, tx().apelaCorto, "apela"],
          [reportes.length, tx().reportesCorto, "reportes"],
          [chatsReportados.length, tx().chatsCorto, "chats"],
        ].filter(([n]) => n > 0);
        return (
          <div className="resumen-staff">
            <div className="eyebrow" style={{ marginBottom: items.length ? 10 : 0 }}>{tx().resumenStaff}</div>
            {items.length === 0
              ? <p className="txt-s suave">{tx().todoAlDia}</p>
              : (
                <div className="resumen-items">
                  {items.map(([n, etiqueta, id]) => (
                    <button key={id} className="resumen-item" onClick={() => setPane(id)}>
                      <span className="resumen-n">{n}</span>
                      <span className="resumen-l">{etiqueta}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        );
      })()}

      <div className="tags tabs-staff" style={{ marginBottom: 14 }}>
        {[["disputas", tx().tDisputas(abiertas.length)], ["verif", tx().tVerif(pendVerif.length)], ["apela", tx().tApela(apelaciones.length)], ["reportes", tx().tReportes(reportes.length)], ["chats", tx().tReportesChat(chatsReportados.length)],
    ["anuncios", tx().anuncios], ["usuarios", tx().tUsuarios], ...(esAdmin ? [["metricas", tx().tMetricas], ["audit", tx().tAudit]] : [])].map(([id, l]) => (
          <button key={id} className={`btn mini ${pane === id ? "" : "secundario"}`} onClick={() => setPane(id)}>{l}</button>
        ))}
      </div>
      {err && <div style={{ marginBottom: 14 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      {pane === "disputas" && (abiertas.length === 0 ? <Vacio icono="⚖">{tx().sinDisputas}</Vacio> :
        abiertas.map((d) => {
          const rep = userById(d.reporterId);
          const acc = userById(d.accusedId);
          const t = api.snap.trades.find((x) => x.id === d.tradeId);
          const soyParte = d.reporterId === me.id || d.accusedId === me.id;
          return (
            <div key={d.id} className="ficha" style={{ marginBottom: 14 }}>
              <div className="tags"><Sello code={t?.code ?? "—"} /><span className="tag lacre">{tx().abierta} {fecha(d.at)}</span><span className="tag tenue">{tx().defensaHasta} {fecha(d.deadline)}</span></div>
              <p className="txt-s mt-10">{tx().reportaA(rep?.displayName, acc?.displayName)}</p>
              <div className="txt-s suave mt-6"><b>{tx().reporte}:</b> {d.claim}</div>
              <div className="txt-s suave mt-6"><b>{tx().defensa}:</b> {d.defense ?? <i>{tx().sinPresentar}</i>}</div>
              {t && <div className="txt-xs suave mt-6"><b>{tx().expediente}</b> {t.events.length} {tx().eventos} · {t.messages.filter((m) => !m.system).length} {tx().mensajesChat}</div>}
              {soyParte ? (
                <div className="mt-10"><Aviso tipo="oro">{tx().eresParte}</Aviso></div>
              ) : decideId === d.id ? (
                <div className="mt-10">
                  <Campo label={tx().lblNivelSancion}>
                    <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
                      <option value="minor">{tx().opMinor}</option>
                      <option value="major">{tx().opMajor}</option>
                      <option value="ban">{tx().opBan}</option>
                    </select>
                  </Campo>
                  <Campo label={tx().lblResumen}>
                    <textarea value={resumen} onChange={(e) => setResumen(e.target.value)} />
                  </Campo>
                  {!d.defense && new Date(d.deadline) > new Date() && (
                    <Aviso tipo="oro">{tx().avisoPlazoDefensa}</Aviso>
                  )}
                  <button className="btn peligro mt-14" disabled={busy}
                    onClick={() => run(async () => { await api.decide(d.id, { sanction: true, level: nivel, summary: resumen }); setDecideId(null); setResumen(""); })}>
                    {tx().btnConfirmarSancion}
                  </button>
                  <button className="btn secundario" onClick={() => setDecideId(null)}>{tx().btnCancelar}</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn mini" disabled={busy} onClick={() => run(() => api.decide(d.id, { sanction: false }))}>{tx().btnSinSancion}</button>
                  <button className="btn mini peligro" onClick={() => { setDecideId(d.id); setResumen(""); }}>{tx().btnSancionar}</button>
                </div>
              )}
            </div>
          );
        }))}

      {pane === "verif" && (pendVerif.length === 0 ? <Vacio icono="▭">{tx().sinVerifs}</Vacio> :
        pendVerif.map((u) => (
          <div key={u.id} className="ficha" style={{ marginBottom: 14 }}>
            <div className="tags"><b>{u.displayName}</b><span className="tag tenue">{tx().entrenador} {u.trainerName}</span><span className="tag tenue">{tx().alta} {fecha(u.createdAt)}</span>{(u.dupFriend || u.dupFp) && <span className="tag lacre">{tx().posibleMulti}</span>}</div>
            {u.verifCode
              ? <p className="txt-xs mt-6">{tx().codigoAsignado} <b className="mono">{u.verifCode}</b> {tx().compruebaCaptura}</p>
              : <p className="txt-xs suave mt-6">{tx().sinCodigoAun}</p>}
            {u.verifImage ? (
              <a href={api.imageUrl(u.verifImage)} target="_blank" rel="noreferrer">
                <img src={api.imageUrl(u.verifImage)} alt="captura de verificación"
                  style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: "2px solid var(--tinta)", marginTop: 8, background: "#fff" }} />
              </a>
            ) : <p className="txt-xs suave mt-6">{tx().sinCapturaAun}</p>}
            {u.verifImage && (
              <button className="btn mini mt-10" disabled={busy} onClick={() => run(() => api.verifyUser(u.id))}>
                {tx().btnMarcarVerificado}
              </button>
            )}
          </div>
        )))}

      {pane === "apela" && (apelaciones.length === 0 ? <Vacio icono="◈">{tx().sinApelaciones}</Vacio> :
        apelaciones.map((s) => {
          const u = userById(s.userId);
          const yoDecidi = s.disputeDecidedBy === me.id;
          return (
            <div key={s.id} className="ficha" style={{ marginBottom: 14 }}>
              <div className="tags"><b>{u?.displayName ?? "—"}</b><span className="tag lacre">{s.level}</span><span className="tag tenue">{tx().apelo} {s.appealedAt ? fecha(s.appealedAt) : ""}</span></div>
              <div className="txt-s suave mt-6"><b>{tx().sancionLbl}</b> {s.summary}</div>
              <div className="txt-s suave mt-6"><b>{tx().apelacionLbl}</b> {s.appealText}</div>
              {yoDecidi ? (
                <div className="mt-10"><Aviso tipo="oro">{tx().tuDecidiste}</Aviso></div>
              ) : (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn mini" disabled={busy} onClick={() => run(() => api.decideAppeal(s.id, true))}>{tx().btnAnularSancion}</button>
                  <button className="btn mini peligro" disabled={busy} onClick={() => run(() => api.decideAppeal(s.id, false))}>{tx().btnMantenerSancion}</button>
                </div>
              )}
            </div>
          );
        }))}

      {pane === "reportes" && (reportes.length === 0 ? <Vacio icono="⚑">{tx().sinReportes}</Vacio> :
        reportes.map((r) => (
          <div key={r.id} className="ficha" style={{ marginBottom: 14 }}>
            <div className="tags">
              <b>{r.species}</b>
              <span className="tag tenue">{tx().ofrecidoPor} {userById(r.ownerId)?.displayName ?? "—"}</span>
              <span className="tag lacre">{tx().reportadaPor} {userById(r.byId)?.displayName ?? "—"}</span>
            </div>
            <p className="txt-s suave mt-6">{r.reason}</p>
            <button className="btn mini peligro mt-10" disabled={busy}
              onClick={() => run(() => api.staffRemoveOffer(r.offerId, r.reason))}>{tx().btnRetirarOferta}</button>
          </div>
        )))}

      {pane === "chats" && (chatsReportados.length === 0 ? <Vacio icono="✉">{tx().sinReportesChat}</Vacio> :
        chatsReportados.map((r) => (
          <div key={r.id} className="ficha" style={{ marginBottom: 12 }}>
            <div className="tags">
              <span className="tag lacre">{fecha(r.at)}</span>
              <span className="txt-s">{tx().entre} <b>{userById(r.aId)?.displayName ?? "—"}</b> y <b>{userById(r.bId)?.displayName ?? "—"}</b></span>
            </div>
            <p className="txt-s suave mt-6"><b>{tx().reportadaPor}</b> {userById(r.byId)?.displayName ?? "—"}: {r.reason}</p>
          </div>
        )))}

      {pane === "anuncios" && (
        <>
          <div className="ficha" style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().nuevoAnuncio}</div>
            <Campo label={tx().lblTituloAnuncio}>
              <input value={anTit} onChange={(e) => setAnTit(e.target.value)} maxLength={80} />
            </Campo>
            <Campo label={tx().lblCuerpoAnuncio}>
              <textarea value={anTxt} onChange={(e) => setAnTxt(e.target.value)} maxLength={600} />
            </Campo>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Campo label={tx().lblImportancia}>
                  <select value={anNivel} onChange={(e) => setAnNivel(e.target.value)}>
                    <option value="info">{tx().nivelInfo}</option>
                    <option value="warning">{tx().nivelAviso}</option>
                    <option value="critical">{tx().nivelCritico}</option>
                  </select>
                </Campo>
              </div>
              <div style={{ flex: 1 }}>
                <Campo label={tx().lblCaduca}>
                  <input type="number" min="1" value={anDias} onChange={(e) => setAnDias(e.target.value)} />
                </Campo>
              </div>
            </div>
            <button className="btn" disabled={busy || anTit.trim().length < 3 || anTxt.trim().length < 3}
              onClick={() => run(async () => {
                await api.crearAnuncio({ title: anTit, body: anTxt, level: anNivel, days: anDias ? Number(anDias) : null });
                setAnTit(""); setAnTxt(""); setAnDias("");
              })}>{tx().btnPublicarAnuncio}</button>
          </div>

          {(api.snap.announcements || []).length === 0
            ? <Vacio icono="▤">{tx().sinAnuncios}</Vacio>
            : (api.snap.announcements || []).map((a) => (
              <div key={a.id} className={`anuncio ${a.level}`} style={{ opacity: a.active === false ? .55 : 1 }}>
                <div className="anuncio-cab"><b>{a.title}</b>
                  <span className={`tag ${a.active === false ? "tenue" : "verde"}`}>
                    {a.active === false ? tx().inactivo : tx().activo}
                  </span>
                </div>
                <p className="txt-s">{a.body}</p>
                <div className="txt-xs suave mt-6">{fecha(a.at)}{a.expiresAt ? ` · ${tx().caduca} ${fecha(a.expiresAt)}` : ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn mini secundario" disabled={busy} onClick={() => run(() => api.alternarAnuncio(a.id))}>
                    {a.active === false ? tx().btnMostrar : tx().btnOcultar}
                  </button>
                  <button className="btn mini peligro" disabled={busy} onClick={() => run(() => api.borrarAnuncio(a.id))}>
                    {tx().btnBorrar}
                  </button>
                </div>
              </div>
            ))}
        </>
      )}

      {pane === "usuarios" && (
        <div className="ficha">
          <input className="buscador" value={buscaU} onChange={(e) => setBuscaU(e.target.value)}
            placeholder={tx().buscarUsuario} />
          <div style={{ marginBottom: 12 }}>
            <Aviso tipo="oro">{tx().codigoEmitido.replace(":", ".")} {tx().soloVerificados}.</Aviso>
          </div>
          <div style={{ overflowX: "auto" }}>
          <table className="tabla">
            <thead><tr><th>{tx().thUsuario}</th><th>{tx().thRol}</th><th>{tx().thEstado}</th><th></th></tr></thead>
            <tbody>
              {api.snap.users
                .filter((u) => !buscaU.trim() ||
                  (u.displayName + " " + (u.trainerName || "")).toLowerCase().includes(buscaU.trim().toLowerCase()))
                .map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b>{(u.dupFriend || u.dupFp) && <span className="tag lacre" style={{ marginLeft: 6 }}>⚠</span>}<br /><span className="suave">{u.trainerName}</span></td>
                  <td>
                    {esAdmin ? (
                      <select className="select-mini" value={u.role} disabled={u.id === me.id || busy}
                        onChange={(e) => run(() => api.setRole(u.id, e.target.value))}>
                        {["user", "mediator", "moderator", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : u.role}
                  </td>
                  <td>{u.status}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                      {esAdmin && u.id !== me.id && (
                        <button className="btn mini secundario" disabled={busy}
                          onClick={() => run(() => api.setStatus(u.id, u.status === "suspended" ? "active" : "suspended"))}>
                          {u.status === "suspended" ? tx().btnReactivar : tx().btnSuspender}
                        </button>
                      )}
                      <button className="btn mini secundario" onClick={() => setFichaMod(u.id)}>{tx().verFicha}</button>
                      {u.verified ? (
                        <button className="btn mini secundario" disabled={busy}
                          onClick={() => run(async () => setEmitido({ id: u.id, code: await api.staffRecovery(u.id) }))}>
                          {tx().emitirCodigo}
                        </button>
                      ) : <span className="txt-xs suave">{tx().soloVerificados}</span>}
                      {emitido?.id === u.id && (
                        <span className="mono txt-xs" style={{ color: "var(--verde)", fontWeight: 700, wordBreak: "break-all" }}>
                          {emitido.code}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {pane === "metricas" && esAdmin && (
        <div className="metricas">
          {[
            [tx().mUsuariosActivos, api.snap.users.filter((u) => u.status === "active").length],
            [tx().mOfertasActivas, api.snap.offers.filter((o) => o.status === "active").length],
            [tx().mTradesCerrados, api.snap.trades.filter((t) => t.state === "closed").length],
            [tx().mTradesCurso, api.snap.trades.filter((t) => !["closed", "cancelled"].includes(t.state)).length],
            [tx().mDisputasAbiertas, abiertas.length],
            [tx().mSancionesActivas, api.snap.sanctions.length],
          ].map(([l, n]) => (
            <div className="metrica" key={l}><div className="num">{n}</div><div className="lab">{l}</div></div>
          ))}
        </div>
      )}

      {pane === "audit" && esAdmin && (api.snap.audit.length === 0 ? <Vacio icono="▤">{tx().sinAudit}</Vacio> : (
        <div className="ficha txt-xs" style={{ maxHeight: 340, overflowY: "auto" }}>
          {api.snap.audit.map((a) => (
            <div key={a.id} style={{ padding: "7px 0", borderBottom: "1px solid #d8ded9" }}>
              <b className="mono">{a.action}</b> · {userById(a.actorId)?.displayName ?? tx().sistema} · {fecha(a.at)}
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
  const [verNotis, setVerNotis] = useState(false);
  const [abrirTrade, setAbrirTrade] = useState(null);
  const [abrirDM, setAbrirDM] = useState(null);
  const [verFicha, setVerFicha] = useState(null);
  const [abrirOferta, setAbrirOferta] = useState(() => {
    // Si se llega desde un enlace compartido, se abre esa oferta
    try {
      const id = new URLSearchParams(location.search).get("o");
      if (id) history.replaceState(null, "", location.pathname);
      return id;
    } catch { return null; }
  });
  const [irAPublicar, setIrAPublicar] = useState(null);
  const [stats, setStats] = useState(null);
  const [verAyuda, setVerAyuda] = useState(false);
  const [verAsistente, setVerAsistente] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState(null);
  const [tourVisto, setTourVisto] = useState(() => {
    try { return localStorage.getItem("ts_tour") === "1"; } catch { return true; }
  });
  const [oscuro, setOscuro] = useState(() => {
    try {
      const g = localStorage.getItem("ts_tema");
      if (g) return g === "oscuro";
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });
  useEffect(() => {
    document.body.classList.toggle("oscuro", oscuro);
    try { localStorage.setItem("ts_tema", oscuro ? "oscuro" : "claro"); } catch { /* nada */ }
  }, [oscuro]);
  const [vistas, setVistas] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ts_notis_vistas") || "[]")); } catch { return new Set(); }
  });
  const guardarVistas = (set) => {
    setVistas(new Set(set));
    try { localStorage.setItem("ts_notis_vistas", JSON.stringify([...set].slice(-200))); } catch { /* sin storage */ }
  };
  const [phase, setPhase] = useState("cargando"); // cargando | sin-conexion | listo
  const [hasUsers, setHasUsers] = useState(true);
  const [cfg, setCfg] = useState(null);
  const [completar, setCompletar] = useState(false);
  const [mostrarAcceso, setMostrarAcceso] = useState(false);
  const [pideCuenta, setPideCuenta] = useState(false);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => { /* opcional */ });
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const b = await api.bootstrap();
        if (!vivo) return;
        setHasUsers(b.hasUsers);
        setCfg({ google: b.google, facebook: b.facebook, ia: b.ia });
        // Las formas especiales (Flor Eterna, regionales, megas) se cargan aparte
        cargarFormas().then(() => vivo && force()).catch(() => {});
        if (api.getToken()) { try { await api.sync(); } catch { /* sesión caducada */ } }
        if (!api.snap?.me) { try { await api.verPublico(); } catch { /* sin escaparate */ } }
        setPhase("listo");
      } catch {
        if (vivo) setPhase("sin-conexion");
      }
    })();
    // Se reprograma sola: con un chat abierto va más rápido
    let tmr;
    const tic = async () => {
      try {
        if (api.getToken()) await api.sync();
        else if (!mostrarAcceso) await api.verPublico();
        force();
      } catch { /* red */ }
      tmr = setTimeout(tic, api.getRitmo());
    };
    tmr = setTimeout(tic, api.getRitmo());
    const iv = { close: () => clearTimeout(tmr) };
    return () => { vivo = false; iv.close(); };
  }, []);

  const me = api.snap?.me ?? null;
  const esStaff = me && ["moderator", "admin"].includes(me.role);
  const pendientes = !me ? 0 : api.snap.trades.filter((t) => {
    const soyA = t.aId === me.id, soyB = t.bId === me.id;
    if (!soyA && !soyB) return false;
    if (t.state === "proposal") return soyB;
    if (t.state === "contract") return !(soyA ? t.signedA : t.signedB);
    if (t.state === "pre_proof") return !(soyA ? t.proofA : t.proofB);
    if (t.state === "post_proof") return !(soyA ? t.confirmedA : t.confirmedB);
    if (t.state === "disputed") {
      const d = api.snap.disputes.find((x) => x.tradeId === t.id && x.status === "open");
      return d && d.accusedId === me.id && !d.defense;
    }
    return false;
  }).length + (esStaff ? api.snap.disputes.filter((d) => d.status === "open").length : 0);
  useEffect(() => { document.title = pendientes > 0 ? `(${pendientes}) TradeSafe` : "TradeSafe"; }, [pendientes]);
  const avisos = me ? calcularAvisos(me, esStaff) : [];
  const noLeidas = new Set(avisos.map((a) => a.key).filter((k) => !vistas.has(k)));

  useEffect(() => {
    if (!avisos.length || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const nuevos = avisos.filter((a) => !vistas.has(a.key));
    if (!nuevos.length) return;
    // Un solo aviso si hay varios, para no saturar
    const texto = nuevos.length === 1 ? nuevos[0].texto : tx().pendientes(nuevos.length).replace("⚑ ", "");
    try { new Notification("TradeSafe", { body: texto, icon: "/icon-192.png", tag: "tradesafe" }); } catch { /* nada */ }
    const set = new Set(vistas); nuevos.forEach((a) => set.add(a.key)); guardarVistas(set);
  }, [avisos.map((a) => a.key).join("|")]);

  // Primera vez con sesión iniciada: se ofrece el tour solo
  useEffect(() => {
    if (me && !tourVisto && phase === "listo") {
      setVerAyuda(true);
      setTourVisto(true);
      try { localStorage.setItem("ts_tour", "1"); } catch { /* nada */ }
    }
  }, [me, phase]);

  // Si hemos tenido sesión, es que la instancia ya está configurada:
  // sin esto, al cerrar sesión volvía a pedir "Configuración inicial".
  useEffect(() => { if (me) setHasUsers(true); }, [me]);

  const nMatches = api.snap?.matches?.length || 0;
  const tabs = [
    ["mercado", "inicio", tx().tabInicio, nMatches > 0],
    ["inventario", "inventario", tx().tabInventario, false],
    ["trades", "buzon", tx().tabBuzon, pendientes > 0]];

  return (
    <div className="frame">
      <header className="masthead">
        <div className="wordmark">Trade<span className="safe">Safe</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="enlace-volver" style={{ fontSize: 17, textDecoration: "none", lineHeight: 1,
              border: "2px solid var(--tinta)", borderRadius: 999, width: 27, height: 27, fontWeight: 700 }}
              onClick={() => { setVerAyuda(!verAyuda); setVerNotis(false); }} aria-label={tx().ayuda}>?</button>
            {me && phase === "listo" && (
              <button className="enlace-volver" style={{ fontSize: 20, textDecoration: "none", position: "relative", lineHeight: 1 }}
                onClick={() => { setVerNotis(!verNotis); setVerAyuda(false); }} aria-label={tx().notiTitulo}>
                ◔
                {noLeidas.size > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -6, background: "var(--lacre)", color: "#fff",
                    borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "1px 5px", border: "1.5px solid var(--tinta)" }}>
                    {noLeidas.size}
                  </span>
                )}
              </button>
            )}
            {!me && phase === "listo" && !mostrarAcceso && (
              <button className="enlace-volver" style={{ fontSize: 13, fontWeight: 700 }}
                onClick={() => setMostrarAcceso(true)}>{tx().yaTengo}</button>
            )}
            {me && phase === "listo" && (
              <button className="avatar-cab" aria-label={tx().irAlPerfil}
                onClick={() => { setTab("perfil"); setVerInfractores(false); setVerFicha(null); }}>
                {me.avatarId
                  ? <img src={api.imageUrl(me.avatarId)} alt="" />
                  : <span>{me.displayName.slice(0, 1).toUpperCase()}</span>}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        {me && me.status === "active" && phase === "listo" && <EmailBanner me={me} refresh={refresh} />}
        {me && phase === "listo" && !abrirDM && !abrirTrade && <Anuncios />}
        {verAyuda && <Ayuda onCerrar={() => setVerAyuda(false)} />}
        {me && phase === "listo" && verNotis && (
          <Notificaciones avisos={avisos} noLeidas={noLeidas}
            onAbrirTrade={(id) => { setTab("trades"); setVerInfractores(false); setAbrirTrade(id); }}
            onAbrirDM={(id) => { setTab("trades"); setVerInfractores(false); setAbrirDM(id); }}
            onIrTab={(t) => { setTab(t); setVerInfractores(false); }}
            onLeerTodo={() => guardarVistas(new Set([...vistas, ...avisos.map((a) => a.key)]))}
            onCerrar={() => setVerNotis(false)} />
        )}
        {me && me.status === "active" && pendientes > 0 && tab !== "trades" && !verInfractores && phase === "listo" && (
          <button className="ficha" style={{ marginBottom: 14, borderColor: "var(--lacre)" }} onClick={() => setTab("trades")}>
            <b style={{ color: "var(--lacre)" }}>{tx().pendientes(pendientes)}</b>
            <span className="txt-s suave">{tx().irTrades}</span>
          </button>
        )}
        {phase === "cargando" ? (
          <Vacio icono="◈">{tx().conectando}</Vacio>
        ) : phase === "sin-conexion" ? (
          <Vacio icono="⚠">{tx().sinConexion1}<br />{tx().sinConexion2} <b className="mono">DATABASE_URL</b> · <b className="mono">JWT_SECRET</b> {tx().enVercel}</Vacio>
        ) : completar ? (
          <CompletarPerfil onListo={(rec) => { setCompletar(false); setCodigoNuevo(rec); }} />
        ) : codigoNuevo ? (
          <div style={{ paddingTop: 12 }}>
            <CodigoRecuperacion code={codigoNuevo} onListo={() => { setCodigoNuevo(null); refresh(); }} />
          </div>
        ) : !me && mostrarAcceso ? (
          <>
            <div className="barra-det">
              <button className="volver-ic" onClick={() => setMostrarAcceso(false)} aria-label="←">‹</button>
              <span className="barra-det-tit">{tx().entrar}</span>
              <span style={{ width: 34 }} />
            </div>
            <AuthScreen refresh={refresh} hasUsers={hasUsers} onCodigo={setCodigoNuevo} cfg={cfg}
              onCompletar={() => setCompletar(true)} />
            {stats && stats.usuarios > 0 && (
              <div className="ficha mt-14">
                <div className="eyebrow" style={{ marginBottom: 10 }}>{tx().statsTitulo}</div>
                <div className="metricas">
                  <div className="metrica"><div className="num">{stats.usuarios}</div><div className="lab">{tx().statUsuarios}</div></div>
                  <div className="metrica"><div className="num">{stats.cerrados}</div><div className="lab">{tx().statCerrados}</div></div>
                  <div className="metrica"><div className="num">{stats.ofertas}</div><div className="lab">{tx().statOfertas}</div></div>
                  <div className="metrica"><div className="num">{stats.resueltas}</div><div className="lab">{tx().statResueltas}</div></div>
                </div>
              </div>
            )}
          </>
        ) : !me ? (
          <>
            <Anuncios />
            <div className="linea-invitado">{tx().invitado}</div>
            {pideCuenta && (
              <PideCuenta onCrear={() => { setPideCuenta(false); setMostrarAcceso(true); }}
                onCerrar={() => setPideCuenta(false)} />
            )}
            <Mercado me={null} refresh={refresh} onFicha={setVerFicha} stats={stats}
              onOffenders={() => setPideCuenta(true)} onPideCuenta={() => setPideCuenta(true)}
              abrir={abrirOferta} onAbierto={() => setAbrirOferta(null)} />
          </>
        ) : me.status === "suspended" ? (
          <Perfil me={me} refresh={refresh} onStaff={() => setTab("staff")} oscuro={oscuro} setOscuro={setOscuro} />
        ) : abrirDM ? (
          <ChatDirecto hilo={abrirDM} me={me} refresh={refresh}
            onVolver={() => setAbrirDM(null)} onFicha={(id) => { setAbrirDM(null); setVerFicha(id); }} />
        ) : verFicha ? (
          <FichaUsuario userId={verFicha} onBack={() => setVerFicha(null)} miId={me.id}
            onEscribir={async (uid) => {
              try { const id = await api.abrirDM(uid); setVerFicha(null); setTab("trades"); setAbrirDM(id); }
              catch (e) { alert(tErr(e.message)); }
            }} />
        ) : verInfractores ? (
          <Infractores onBack={() => setVerInfractores(false)} />
        ) : tab === "mercado" ? (
          <Mercado me={me} refresh={refresh} onOffenders={() => setVerInfractores(true)} onFicha={setVerFicha}
            abrir={abrirOferta} onAbierto={() => setAbrirOferta(null)} esStaff={esStaff}
            irAPublicar={irAPublicar} cfgIA={cfg?.ia}
            onIrAlChat={(id) => { setTab("trades"); setAbrirTrade(id); }} stats={stats} />
        ) : tab === "inventario" ? (
          <Inventario me={me} refresh={refresh} cfgIA={cfg?.ia}
            onAbrirOferta={(id) => { setTab("mercado"); setAbrirOferta(id); }} />
        ) : tab === "trades" ? (
          <MisTrades me={me} refresh={refresh} abrir={abrirTrade} onAbierto={() => setAbrirTrade(null)}
            onAbrirDM={setAbrirDM} />
        ) : tab === "perfil" ? (
          <Perfil me={me} refresh={refresh} onStaff={() => setTab("staff")} oscuro={oscuro} setOscuro={setOscuro} />
        ) : (
          <Staff me={me} refresh={refresh} />
        )}
      </main>

      {!me && !mostrarAcceso && phase === "listo" && (
        <nav className="tabbar">
          <div className="tabbar-inner barra-invitado">
            <span className="txt-xs suave">{tx().entrarPara}</span>
            <button className="btn mini" onClick={() => setMostrarAcceso(true)}>{tx().crearGratis}</button>
          </div>
        </nav>
      )}

      {me && phase === "listo" && cfg?.ia && !verAsistente && !abrirDM && (
        <button className="fab-ayuda" onClick={() => setVerAsistente(true)} aria-label={tx().asistente}>?</button>
      )}
      {verAsistente && (
        <Asistente onCerrar={() => setVerAsistente(false)}
          onIrAlChat={(id) => { setVerAsistente(false); setTab("trades"); setAbrirDM(id); }} />
      )}

      {me && phase === "listo" && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            {tabs.map(([id, icono, label, punto]) => {
              const activo = tab === id && !verInfractores && !verFicha;
              return (
                <button key={id} className={`tab ${activo ? "activa" : ""}`}
                  onClick={() => { setTab(id); setVerInfractores(false); setVerFicha(null); }}>
                  <span className="tab-ic">
                    <Icono tipo={icono} activo={activo} />
                    {punto && <span className="tab-punto" />}
                  </span>
                  <span className="tab-tx">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
