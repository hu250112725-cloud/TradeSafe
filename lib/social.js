// Comprobación de la identidad devuelta por Google o Facebook.
// Solo se activan si existen las variables de entorno correspondientes.

export const googleActivo = () => !!process.env.GOOGLE_CLIENT_ID;
export const facebookActivo = () => !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);

/* Google: se valida el token contra el propio Google y se comprueba
   que fue emitido para NUESTRA aplicación (si no, cualquiera podría
   colar un token de otra web). */
export async function verificarGoogle(credential) {
  if (!googleActivo()) throw "El acceso con Google no está configurado";
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!r.ok) throw "No se pudo validar el acceso con Google";
  const d = await r.json();
  if (d.aud !== process.env.GOOGLE_CLIENT_ID) throw "Este acceso no pertenece a esta aplicación";
  if (!["accounts.google.com", "https://accounts.google.com"].includes(d.iss)) throw "Emisor no válido";
  if (Number(d.exp) * 1000 < Date.now()) throw "El acceso ha caducado, inténtalo de nuevo";
  if (d.email_verified !== "true" && d.email_verified !== true) throw "Tu correo de Google no está verificado";
  return { sub: String(d.sub), email: String(d.email || "").toLowerCase(), nombre: d.name || d.given_name || "" };
}

/* Facebook: primero se comprueba con debug_token que el token es de
   nuestra app, y solo después se piden los datos. */
export async function verificarFacebook(accessToken) {
  if (!facebookActivo()) throw "El acceso con Facebook no está configurado";
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const dbg = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`);
  if (!dbg.ok) throw "No se pudo validar el acceso con Facebook";
  const { data } = await dbg.json();
  if (!data?.is_valid) throw "El acceso con Facebook no es válido";
  if (String(data.app_id) !== String(process.env.FACEBOOK_APP_ID)) throw "Este acceso no pertenece a esta aplicación";

  const me = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
  if (!me.ok) throw "No se pudieron leer tus datos de Facebook";
  const d = await me.json();
  return { id: String(d.id), email: String(d.email || "").toLowerCase(), nombre: d.name || "" };
}
