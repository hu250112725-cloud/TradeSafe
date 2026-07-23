# TradeSafe — Full-stack (web + API + PostgreSQL)

App completa de intercambios seguros para Pokémon HOME: frontend React (Vite), backend Express como funciones serverless de Vercel y base de datos PostgreSQL. Multi-dispositivo real: todos los usuarios comparten los mismos datos.

## Desplegar desde el celular (15 min, todo desde el navegador)

**1. Base de datos (Neon, gratis)**
- Entra a neon.tech → crea cuenta → "Create project".
- Copia la **connection string** (empieza por `postgres://…`). Las tablas se crean solas en el primer arranque.

**2. Repositorio**
- github.com → nuevo repositorio → "uploading an existing file" → sube el contenido de esta carpeta.

**3. Vercel**
- vercel.com → Add New Project → importa el repo (detecta Vite solo).
- Antes de "Deploy", en **Environment Variables** añade:
  - `DATABASE_URL` = la connection string de Neon
  - `JWT_SECRET` = una frase larga aleatoria inventada por ti (30+ caracteres)
- Deploy. Abre tu URL: la app te pedirá **crear la cuenta de administrador** (no hay contraseñas por defecto).

Cada cambio que subas al repo se redespliega solo.

## Qué incluye
Cuentas con roles (usuario/mediador/moderador/admin) · mercado y publicación con validador de legalidad y bloqueo de dinero real · flujo de intercambio completo (propuesta → contrato firmado → pruebas con código → entrega → cierre y valoración) con máquina de estados en servidor y registro de eventos · chat con filtros anti-estafa · disputas con 72 h de defensa y recusación de moderadores implicados · sanciones de 3 niveles y lista pública de infractores · panel de staff y admin (verificaciones, usuarios, métricas, auditoría) · exportación y borrado de cuenta.

Probado end-to-end (36 aserciones) contra PostgreSQL: `node test/smoke.mjs` con una BD local.

## Desarrollo local
```bash
npm install
# API (necesita un Postgres):
DATABASE_URL=postgres://... JWT_SECRET=dev node -e "import('./api/index.js').then(m=>m.default.listen(3000))"
# Frontend en otra terminal (proxy a la API en vite.config.js):
npm run dev
```

## Pendiente para versión 2 (documentado en /docs del proyecto original)
2FA TOTP, subida real de capturas con URLs firmadas, rate limiting con Redis, timeouts automáticos de estados, apelaciones formales, sistema de mediadores.
