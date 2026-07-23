import { useState, useEffect, useReducer } from "react";
import * as api from "./api.js";
import { fecha, userById, sanctionsOf } from "./api.js";
import { tx, tErr, tSys, stateLabel, getLang, setLang } from "./i18n.js";

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
      {u.verified ? <span className="tag verde">{tx().verificado}</span> : <span className="tag tenue">{tx().sinVerificar}</span>}
      <span className="tag tenue">{u.trades} {tx().trades}</span>
      {u.rating && <span className="tag oro">★ {u.rating}</span>}
      {u.sanctions > 0 && <span className="tag lacre">{u.sanctions} {tx().sancion}</span>}
      {u.newAccount && <span className="tag lacre">{tx().cuentaNueva}</span>}
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

/* Banner para confirmar el email con el código de 6 dígitos */
function EmailBanner({ me, refresh }) {
  const [code, setCode] = useState("");
  const [hecho, setHecho] = useState(false);
  const { run, busy, err } = useRun(refresh);
  if (me.emailVerified && !hecho) return null;
  if (hecho) return <div style={{ marginBottom: 14 }}><Aviso tipo="verde">{tx().emailListo}</Aviso></div>;
  return (
    <div className="ficha" style={{ marginBottom: 14, borderColor: "var(--oro)", boxShadow: "4px 4px 0 var(--oro)" }}>
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
          <div className="h1">{mode === "setup" ? tx().configInicial : mode === "login" ? tx().entrar : tx().crearCuenta}</div>
          <p className="txt-s suave mt-6">
            {mode === "setup" ? tx().setupIntro : mode === "login" ? tx().loginIntro : tx().registerIntro}
          </p>
          <div className="mt-14">
            {mode !== "login" && (
              <>
                <Campo label={tx().lblNombre}><input value={f.name || ""} onChange={set("name")} placeholder={tx().phNombre} /></Campo>
                <Campo label={tx().lblEntrenador}><input value={f.trainer || ""} onChange={set("trainer")} placeholder={tx().phEntrenador} /></Campo>
                <Campo label={tx().lblClave}><input value={f.friendCode || ""} onChange={set("friendCode")} placeholder={tx().phClave} autoCapitalize="characters" className="mono" /></Campo>
              </>
            )}
            <Campo label={tx().lblEmail}><input type="email" value={f.email || ""} onChange={set("email")} inputMode="email" autoCapitalize="none" /></Campo>
            <Campo label={mode === "login" ? tx().lblPass : tx().lblPass12}>
              <input type="password" value={f.pass || ""} onChange={set("pass")} />
            </Campo>
            {err && <Aviso tipo="lacre">{err}</Aviso>}
            <button className="btn mt-14" disabled={busy} onClick={submit}>
              {busy ? "…" : mode === "setup" ? tx().btnSetup : mode === "login" ? tx().btnEntrar : tx().btnCrear}
            </button>
          </div>
        </div>
        {hasUsers && (
          <div className="ticket-talon centrado">
            <button className="enlace-volver" onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>
              {mode === "login" ? tx().irRegistro : tx().irLogin}
            </button>
          </div>
        )}
      </div>
      <p className="txt-xs suave centrado mt-14">{tx().aceptasTerminos}</p>
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
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().publicarOferta}</h1>
      <div className="ficha">
        <Campo label={tx().lblEspecie}><input value={f.species || ""} onChange={set("species")} placeholder={tx().phEspecie} /></Campo>
        <div className="fila-2">
          <Campo label={tx().lblNivel}><input type="number" min="1" max="100" value={f.level} onChange={set("level")} /></Campo>
          <Campo label={tx().lblNaturaleza}><input value={f.nature || ""} onChange={set("nature")} placeholder={tx().phNaturaleza} /></Campo>
        </div>
        <div className="fila-2">
          <Campo label={tx().lblHabilidad}><input value={f.ability || ""} onChange={set("ability")} /></Campo>
          <Campo label={tx().lblBall}><input value={f.ball || ""} onChange={set("ball")} placeholder={tx().phBall} /></Campo>
        </div>
        <Campo label={tx().lblIvs}><input value={f.ivs} onChange={set("ivs")} className="mono" /></Campo>
        <Campo label={tx().lblMoves}><input value={f.moves || ""} onChange={set("moves")} /></Campo>
        <Campo label={tx().lblOrigen}><input value={f.origin || ""} onChange={set("origin")} placeholder={tx().phOrigen} /></Campo>
        <label className="check"><input type="checkbox" checked={!!f.shiny} onChange={set("shiny")} /> {tx().esShiny}</label>
        <Campo label={tx().lblBuscas}><textarea value={f.wants || ""} onChange={set("wants")} placeholder={tx().phBuscas} /></Campo>
        <Aviso tipo="oro">{tx().avisoCaptura}</Aviso>
        {err && <div className="mt-10"><Aviso tipo="lacre">{err}</Aviso></div>}
        <button className="btn mt-14" disabled={busy} onClick={submit}>{busy ? "…" : tx().btnPublicar}</button>
      </div>
    </div>
  );
}

/* ================= Mercado ================= */
function Mercado({ me, refresh, onOffenders }) {
  const [open, setOpen] = useState(null);
  const [give, setGive] = useState("");
  const [busca, setBusca] = useState("");
  const [soloShiny, setSoloShiny] = useState(false);
  const { run, busy, err } = useRun(refresh);
  const offers = api.snap.offers.filter((o) => o.status === "active")
    .filter((o) => !soloShiny || o.isShiny)
    .filter((o) => !busca.trim() || (o.species + " " + o.wants).toLowerCase().includes(busca.trim().toLowerCase()));

  if (open) {
    const o = api.snap.offers.find((x) => x.id === open);
    if (!o || o.status !== "active") { setOpen(null); return null; }
    return (
      <div>
        <button className="enlace-volver" onClick={() => setOpen(null)}>{tx().volverMercado}</button>
        <div className="ticket mt-14">
          <div className="ticket-cuerpo">
            <div className="tags">
              <span className="h1">{o.species}</span>
              {o.isShiny && <span className="tag oro">⭐ Shiny</span>}
              <span className="tag tenue">{tx().nv} {o.level}</span>
            </div>
            <div className="txt-xs suave mt-6">{o.nature} · {o.ability} · {o.ball} · {tx().origen} {o.origin}</div>
            <div className="ivs mt-14">
              {o.ivs.map((v, i) => (
                <div key={i} className={`iv ${v === 31 ? "max" : ""}`}>
                  <div className="l">{tx().ivLabels[i]}</div><div className="n">{v}</div>
                </div>
              ))}
            </div>
            {o.moves?.length > 0 && <div className="tags mt-10">{o.moves.map((m) => <span key={m} className="tag">{m}</span>)}</div>}
          </div>
          <div className="ticket-talon"><span className="txt-xs">{tx().busca} {o.wants}</span></div>
        </div>
        <div className="ficha mt-14">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().ofrecidoPor}</div>
          <Rep userId={o.ownerId} />
          {sanctionsOf(o.ownerId).map((s) => (
            <div className="mt-10" key={s.id}><Aviso tipo="lacre"><b>{tx().sancionActiva}</b> {s.summary}</Aviso></div>
          ))}
          {userById(o.ownerId)?.newAccount && <div className="mt-10"><Aviso tipo="lacre">{tx().avisoCuentaNueva}</Aviso></div>}
        </div>
        {o.ownerId === me.id ? (
          <button className="btn peligro mt-14" disabled={busy} onClick={() => run(async () => { await api.removeOffer(o.id); setOpen(null); })}>
            {tx().retirarOferta}
          </button>
        ) : (
          <div className="ficha mt-14">
            <Campo label={tx().lblQueOfreces} error={err}>
              <textarea value={give} onChange={(e) => setGive(e.target.value)} placeholder={tx().phQueOfreces} />
            </Campo>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await api.propose(o.id, give); setOpen(null); setGive(""); })}>
              {busy ? "…" : tx().btnProponer}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 className="h1">{tx().mercado}</h1>
        <button className="btn mini secundario" onClick={onOffenders}>{tx().infractoresBtn}</button>
      </div>
      <input className="buscador" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={tx().phBuscar} />
      <label className="check"><input type="checkbox" checked={soloShiny} onChange={(e) => setSoloShiny(e.target.checked)} /> {tx().soloShinys}</label>
      {offers.length === 0 ? (
        <Vacio icono="📦">{busca || soloShiny ? tx().sinCoincidencias : <>{tx().sinOfertas1}<br />{tx().sinOfertas2} <b>{tx().tabPublicar}</b>.</>}</Vacio>
      ) : offers.map((o) => (
        <button key={o.id} className="ficha" style={{ marginBottom: 14 }} onClick={() => setOpen(o.id)}>
          <div className="tags">
            <span className="h2">{o.species}</span>
            {o.isShiny && <span className="tag oro">⭐ Shiny</span>}
            <span className="tag tenue">{tx().nv} {o.level}</span>
            {o.ownerId === me.id && <span className="tag verde">{tx().tuya}</span>}
          </div>
          <p className="txt-s suave mt-6" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx().busca} {o.wants}</p>
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
      <button className="enlace-volver" onClick={onBack}>{tx().volverMercado}</button>
      <h1 className="h1" style={{ margin: "14px 0" }}>{tx().listaInfractores}</h1>
      <div style={{ marginBottom: 14 }}>
        <Aviso tipo="verde">{tx().infractoresIntro}</Aviso>
      </div>
      <input className="buscador" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx().phBuscarNombre} />
      {shown.length === 0 ? (
        <Vacio icono="✅">{tx().sinInfractores(q)}</Vacio>
      ) : shown.map((s) => {
        const u = userById(s.userId);
        return (
          <div key={s.id} className="ticket" style={{ marginBottom: 14, borderColor: "var(--lacre)", boxShadow: "4px 4px 0 var(--lacre)" }}>
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
        <button className="enlace-volver" onClick={onBack}>{tx().misTradesVolver}</button>
        <Sello code={t.code} />
      </div>
      <Via state={t.state} />

      <div className="ticket mt-14">
        <div className="contrato-grid">
          <div>
            <div className="eyebrow">{soyA ? tx().tuEntregas : tx().entrega(otro?.displayName ?? "—")}</div>
            <p className="txt-s mt-6">{t.aGive}</p>
          </div>
          <div>
            <div className="eyebrow">{soyA ? tx().recibes : tx().tuEntregas}</div>
            <div className="h2 mt-6">{offer ? `${offer.species}${offer.isShiny ? " ⭐" : ""}` : "—"}</div>
            <div className="txt-xs suave">{offer ? `${tx().nv} ${offer.level} · ${offer.nature}` : ""}</div>
          </div>
        </div>
        {(t.signedA && t.signedB) && (
          <div className="ticket-talon oro centrado">
            <span className="txt-xs" style={{ color: "var(--oro)", fontWeight: 700 }}>{tx().terminosCongelados}</span>
          </div>
        )}
      </div>

      <div className="ficha mt-14"><div className="eyebrow" style={{ marginBottom: 6 }}>{tx().contraparte}</div><Rep userId={otroId} /></div>
      {["proposal", "contract", "pre_proof"].includes(t.state) && (
        <p className="txt-xs suave mt-6">{tx().avisoCaducidad}</p>
      )}
      {err && <div className="mt-14"><Aviso tipo="lacre">{err}</Aviso></div>}

      {t.state === "proposal" && (soyA ? (
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
              <div style={{ fontSize: 36 }}>🎉</div>
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
                  <button key={n} className={n <= rated ? "on" : ""} onClick={() => setRated(n)} aria-label={`${n} estrellas`}>⭐</button>
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

      {["in_progress", "post_proof"].includes(t.state) && (
        <>
          <div className="ticket mt-14">
            <div className="eyebrow" style={{ padding: "10px 14px 0" }}>{tx().chatTitulo}</div>
            <div className="chat-caja">
              {t.messages.length === 0 && <div className="txt-xs suave centrado">{tx().chatVacio}</div>}
              {t.messages.map((m, i) => m.system
                ? <Aviso key={i} tipo={m.kind}>{tSys(m.text)}</Aviso>
                : <div key={i} className={`burbuja ${m.by === me.id ? "mia" : "suya"}`}>{m.text}</div>)}
            </div>
            <div className="chat-form">
              <input className="chat-input" value={msg} onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) { run(() => api.sendMessage(t.id, msg.trim())); setMsg(""); } }}
                placeholder={tx().phMensaje} />
              <button className="btn mini" disabled={busy} onClick={() => { if (msg.trim()) { run(() => api.sendMessage(t.id, msg.trim())); setMsg(""); } }}>{tx().btnEnviar}</button>
            </div>
          </div>
          {!showDispute ? (
            <button className="btn peligro mt-14" onClick={() => setShowDispute(true)}>{tx().btnAbrirDisputa}</button>
          ) : (
            <div className="ficha mt-14">
              <Campo label={tx().lblQueOcurrio}>
                <textarea value={claim} onChange={(e) => setClaim(e.target.value)} />
              </Campo>
              <Aviso tipo="oro">{tx().avisoReportesFalsos}</Aviso>
              <button className="btn peligro mt-14" disabled={busy}
                onClick={() => run(async () => { await api.openDispute(t.id, claim); setShowDispute(false); setClaim(""); })}>
                {tx().btnEnviarReporte}
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
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().misIntercambios}</h1>
      {mine.length === 0 ? (
        <Vacio icono="🤝">{tx().sinTrades1}<br />{tx().sinTrades2} <b>{tx().tabMercado}</b> {tx().sinTrades3}</Vacio>
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
            </div>
            <p className="txt-s mt-10">{offer?.species ?? "—"} ⇄ {tx().con} <b>{otro?.displayName ?? "—"}</b></p>
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
    if (!confirm(tx().confirmEliminar)) return;
    run(() => api.deleteMe());
  };
  const misSanciones = api.snap.sanctions.filter((s) => s.userId === me.id);
  const [apelaId, setApelaId] = useState(null);
  const [apelaTxt, setApelaTxt] = useState("");
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
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tx().privacidadCuenta}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn mini secundario" disabled={busy} onClick={exportar}>{tx().btnExportar}</button>
          <button className="btn mini peligro" style={{ boxShadow: "3px 3px 0 var(--lacre)" }} disabled={busy} onClick={borrar}>{tx().btnEliminar}</button>
        </div>
      </div>
      <button className="btn secundario mt-14" onClick={() => { api.logout(); refresh(); }}>{tx().btnSalir}</button>
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
  const apelaciones = api.snap.sanctions.filter((s) => s.appealStatus === "open");

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 14 }}>{tx().panelStaff}</h1>
      <div className="tags" style={{ marginBottom: 14 }}>
        {[["disputas", tx().tDisputas(abiertas.length)], ["verif", tx().tVerif(pendVerif.length)], ["apela", tx().tApela(apelaciones.length)], ...(esAdmin ? [["usuarios", tx().tUsuarios], ["metricas", tx().tMetricas], ["audit", tx().tAudit]] : [])].map(([id, l]) => (
          <button key={id} className={`btn mini ${pane === id ? "" : "secundario"}`} onClick={() => setPane(id)}>{l}</button>
        ))}
      </div>
      {err && <div style={{ marginBottom: 14 }}><Aviso tipo="lacre">{err}</Aviso></div>}

      {pane === "disputas" && (abiertas.length === 0 ? <Vacio icono="⚖️">{tx().sinDisputas}</Vacio> :
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
                  <button className="btn mini peligro" style={{ boxShadow: "3px 3px 0 var(--lacre)" }} onClick={() => { setDecideId(d.id); setResumen(""); }}>{tx().btnSancionar}</button>
                </div>
              )}
            </div>
          );
        }))}

      {pane === "verif" && (pendVerif.length === 0 ? <Vacio icono="🪪">{tx().sinVerifs}</Vacio> :
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

      {pane === "apela" && (apelaciones.length === 0 ? <Vacio icono="🕊️">{tx().sinApelaciones}</Vacio> :
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
                  <button className="btn mini peligro" style={{ boxShadow: "3px 3px 0 var(--lacre)" }} disabled={busy} onClick={() => run(() => api.decideAppeal(s.id, false))}>{tx().btnMantenerSancion}</button>
                </div>
              )}
            </div>
          );
        }))}

      {pane === "usuarios" && esAdmin && (
        <div className="ficha" style={{ overflowX: "auto" }}>
          <table className="tabla">
            <thead><tr><th>{tx().thUsuario}</th><th>{tx().thRol}</th><th>{tx().thEstado}</th><th></th></tr></thead>
            <tbody>
              {api.snap.users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b>{(u.dupFriend || u.dupFp) && <span className="tag lacre" style={{ marginLeft: 6 }}>⚠</span>}<br /><span className="suave">{u.trainerName}</span></td>
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
                        {u.status === "suspended" ? tx().btnReactivar : tx().btnSuspender}
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

      {pane === "audit" && esAdmin && (api.snap.audit.length === 0 ? <Vacio icono="📜">{tx().sinAudit}</Vacio> : (
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
  const tabs = [["mercado", tx().tabMercado], ["publicar", tx().tabPublicar], ["trades", pendientes > 0 ? tx().tabTrades + " ●" : tx().tabTrades], ["perfil", tx().tabPerfil], ...(esStaff ? [["staff", tx().tabStaff]] : [])];

  return (
    <div className="frame">
      <header className="masthead">
        <div>
          <div className="wordmark">Trade<span className="safe">Safe</span></div>
          <div className="masthead-sub">{tx().subtitulo}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <Sello code="BETA" verde />
          <button className="enlace-volver mono" style={{ fontSize: 11 }}
            onClick={() => { setLang(getLang() === "es" ? "en" : "es"); refresh(); }}>
            {getLang() === "es" ? "ES → EN" : "EN → ES"}
          </button>
        </div>
      </header>

      <main className="content">
        {me && me.status === "active" && phase === "listo" && <EmailBanner me={me} refresh={refresh} />}
        {me && me.status === "active" && pendientes > 0 && tab !== "trades" && !verInfractores && phase === "listo" && (
          <button className="ficha" style={{ marginBottom: 14, borderColor: "var(--lacre)", boxShadow: "4px 4px 0 var(--lacre)" }} onClick={() => setTab("trades")}>
            <b style={{ color: "var(--lacre)" }}>{tx().pendientes(pendientes)}</b>
            <span className="txt-s suave">{tx().irTrades}</span>
          </button>
        )}
        {phase === "cargando" ? (
          <Vacio icono="◈">{tx().conectando}</Vacio>
        ) : phase === "sin-conexion" ? (
          <Vacio icono="📡">{tx().sinConexion1}<br />{tx().sinConexion2} <b className="mono">DATABASE_URL</b> · <b className="mono">JWT_SECRET</b> {tx().enVercel}</Vacio>
        ) : !me ? (
          <AuthScreen refresh={refresh} hasUsers={hasUsers} />
        ) : me.status === "suspended" ? (
          <Perfil me={me} refresh={refresh} />
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
