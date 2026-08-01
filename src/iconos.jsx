// Iconos de trazo dibujados a medida. Pesan unos pocos kilobytes y heredan
// el color y el tamaño del texto, así que encajan siempre con el diseño.
const D = {
  // Navegación
  inicio: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  inventario: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM3.5 7.5 12 12m0 9v-9m8.5-4.5L12 12",
  buzon: "M4 5.5h16v10H8.5L4 19.5v-14Z",
  atras: "M15 5 8 12l7 7",
  cerrar: "m6 6 12 12M18 6 6 18",
  mas: "M12 5v14M5 12h14",
  puntos: "M6 12h.01M12 12h.01M18 12h.01",
  flecha: "M5 12h14m-6-6 6 6-6 6",
  arriba: "M12 19V5m-6 6 6-6 6 6",
  abajo: "M12 5v14m6-6-6 6-6-6",

  // Intercambio
  trueque: "M4 8h13m-3-3 3 3-3 3M20 16H7m3-3-3 3 3 3",
  contrato: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h7M10 17h5",
  sello: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9 9.4 9 12 3.5Z",
  hecho: "M20 6 9 17l-5-5",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2",

  // Estado
  aviso: "M12 3.5 22 20H2L12 3.5ZM12 10v4m0 3h.01",
  bandera: "M5 21V4m0 0h11l-2 3.5L16 11H5",
  escudo: "M12 3 5 6v6c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z",
  candado: "M6 11h12v9H6v-9Zm3 0V8a3 3 0 0 1 6 0v3",
  llave: "M15.5 9.5a3.5 3.5 0 1 0-3.4 3.5L10 15l-1.5-1L7 15.5 5 17l1 2 2-1 1.5-1.5L11 17l2.1-2.1a3.5 3.5 0 0 0 2.4-5.4Z",
  bloqueado: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM6 6l12 12",

  // Contenido
  camara: "M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  imagen: "M4 5h16v14H4V5Zm2.5 10.5 3.5-4 3 3.5 2.5-2.5 3.5 4",
  estrella: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9 9.4 9 12 3.5Z",
  brillo: "M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9 12 3.5ZM18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z",
  regalo: "M3.5 9h17v3.5h-17V9Zm1.5 3.5h14V20H5v-7.5ZM12 9v11M12 9S9.5 4 7.5 5.5 9.5 9 12 9Zm0 0s2.5-5 4.5-3.5S14.5 9 12 9Z",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21c.7-4 3.8-6 7.5-6s6.8 2 7.5 6",
  personas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.5 3.2-5.5 6-5.5s5.4 2 6 5.5M16 5a3.5 3.5 0 0 1 0 7m1.5 2.7c2.2.6 3.9 2.4 4.5 5.3",
  chat: "M4 5.5h16v10H8.5L4 19.5v-14Z",
  campana: "M18 15V10a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 15ZM10 20.5a2.2 2.2 0 0 0 4 0",
  ayuda: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.6m0 3h.01",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3c0-.6-.1-1.2-.2-1.7l2-1.6-2-3.4-2.4 1a8 8 0 0 0-3-1.7L14 2h-4l-.4 2.6a8 8 0 0 0-3 1.7l-2.4-1-2 3.4 2 1.6a8.2 8.2 0 0 0 0 3.4l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 3 1.7L10 22h4l.4-2.6a8 8 0 0 0 3-1.7l2.4 1 2-3.4-2-1.6c.1-.5.2-1.1.2-1.7Z",
  buscar: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5",
  filtro: "M4 6h16M7 12h10M10 18h4",
  compartir: "M14 4h6v6m0-6L10.5 13.5M18 14v6H4V6h6",
  descargar: "M12 4v11m-5-5 5 5 5-5M4 20h16",
  editar: "M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4",
  borrar: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  copiar: "M9 9h11v11H9V9ZM5 15H4V4h11v1",
  enviar: "M4.5 12 20 4.5 14 20l-3-6-6.5-2Z",
  balanza: "M12 4v16M6 20h12M5 8h14M5 8 2.5 14h5L5 8Zm14 0-2.5 6h5L19 8Z",
  medalla: "M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-3 .8L7.5 21 12 19l4.5 2L15 14.8",
  caja: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM3.5 7.5 12 12m0 9v-9m8.5-4.5L12 12",
  etiqueta: "M3 11V4h7l10 10-7 7L3 11Zm4-3.5h.01",
};

export function Icono({ tipo, tam = 20, grosor = 1.7, className = "", ...resto }) {
  const d = D[tipo];
  if (!d) return null;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      className={"ic " + className} stroke="currentColor" strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round" {...resto}>
      <path d={d} />
    </svg>
  );
}

/* Versión rellena, para estrellas y marcas destacadas */
export function IconoLleno({ tipo, tam = 20, className = "", ...resto }) {
  const d = D[tipo];
  if (!d) return null;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true"
      className={"ic " + className} fill="currentColor" stroke="currentColor"
      strokeWidth="1.2" strokeLinejoin="round" {...resto}>
      <path d={d} />
    </svg>
  );
}

export const ICONOS = Object.keys(D);
