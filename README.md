# ERP Todo Pallets (Aserradero)

ERP para operación de aserraderos: producción por lotes/paquetes, componentes (madera, separadores, tacos), cubicación en $p^2$, stock en playa, pallets/recetas, RRHH (empleados, turnos, adelantos, liquidaciones, partes diarios), clientes/salidas y respaldos. Soporta **multi-aserradero** y roles (administrador general vs. asignado).

## Stack
- **Backend**: NestJS (TypeScript ESM, Node 22), TypeORM, PostgreSQL 15.
- **Frontend**: `index.html` en la raíz (servido por la app).
- **Calidad**: Vitest + Oxlint.
- **Infra**: Docker Compose (`app` + `db`).

## Requisitos
- Node.js 22+ y npm (desarrollo local).
- Docker + Docker Compose (ejecución recomendada).

## Instalación en Windows (cliente, recomendada)
La instalación en equipos cliente se realiza mediante el **instalador `setup.exe` (Inno Setup, un solo clic)** proporcionado al cliente.  
- El instalador despliega los artefactos de producción (`docker-compose.prod.yml`, `.env.example`, `bootstrap.ps1`) y ejecuta el bootstrap interno de forma oculta: verifica Docker activo, crea `dbdata/`, `backups/`, `license/`, genera `.env` con credenciales seguras si no existe y levanta el stack con `docker compose -f docker-compose.prod.yml up -d`.
- Crea un acceso directo **"Sistema Aserradero ERP"** a `http://localhost:3000`.
- Requisito: **Docker Desktop instalado y en ejecución**. Detalles de compilación/empaquetado: `docs/windows-packaging.md`.

> La instalación manual por consola (`install.sh` / `install.bat`) está **deprecada y fue eliminada** del repositorio.

## Configuración (desarrollo / referencia)
1. Copiá `.env.example` a `.env` y ajustá credenciales/puertos (en instalación cliente esto lo realiza automáticamente el bootstrap del `setup.exe`).
   ```bash
   # PowerShell
   Copy-Item .env.example .env
   ```
2. `docker-compose.yml` (dev) y `deploy/docker-compose.prod.yml` (prod) cargan `.env` (gitignored). No uses credenciales de ejemplo en entornos compartidos/producción.

### Licenciamiento y actualizaciones on-prem (Pilar 2, producción/piloto F5)
- **Servidor de licencias (producción):** `LICENSE_SERVER_URL=https://licencias.example.com` (ajustar si la URL pública difiere).
- **Clave pública RSA productiva pinneada** (verificación RS256 de licencia/manifiestos; **sin claves privadas**):
  - `LICENSE_PUBLIC_KEY_PEM` en `.env`/`.env.example` (PEM con `\n` escapados). La clave pública es segura para distribuir y debe coincidir con la publicada por el Pilar 1 (`/.well-known/license-jwks.json`, `kid` activo).
- **Piloto / hardening de despliegue inicial (obligatorio en esta etapa):**
  - `LICENSE_ENFORCEMENT=grace` (no `strict` durante piloto).
  - `UPDATES_AUTO_ENABLED=false` (**no habilitar auto-update estricto**).
- **Seguridad/volúmenes:** `./license` (estado/identidad D4) y `./backups` con permisos restringidos (bootstrap/instalador + `Dockerfile`); DB aislada en `deploy/docker-compose.prod.yml` (sin puertos publicados, red interna). Headers de seguridad vía `helmet` en `src/main.ts` (CSP deshabilitada por compatibilidad SPA inline; resto de protecciones activas). Revisar CORS/TLS en el reverse proxy.

## Ejecución con Docker (desarrollo)
```bash
docker-compose up -d --build
```
- App: <http://localhost:3000>
- PostgreSQL: `localhost:${DB_PORT_PUBLISH:-5432}` (según `.env`)

**Producción (cliente Windows):** usar el `setup.exe` (ver arriba). El stack productivo usa `deploy/docker-compose.prod.yml` con imagen GHCR y `.env` autogenerado.

## Desarrollo local
```bash
npm install
npm run start:dev
```
Configurá variables de conexión a la DB (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`) para apuntar a tu PostgreSQL.

## Scripts útiles
| Comando | Descripción |
|---|---|
| `npm run build` | Compila a `dist/` |
| `npm run start:prod` | Ejecuta `dist/main` |
| `npm run lint` | Oxlint (`src/`, `test/`) |
| `npm test` | Vitest |
| `npm run test:e2e` | Tests e2e (`vitest.config.e2e.ts`) |
| `npm run auth:reset-admin` | Restablece contraseña admin (flujo canónico, `scripts/reset-admin-password.cjs`; no pases la clave en texto plano por CLI compartida) |

## Estructura relevante
- `src/` — módulos NestJS (`auth`, `produccion`, `aserraderos`, `empleados`, `turnos`, `adelantos`, `liquidaciones`, `partes-diarios`, `clientes`, `salidas-stock`, `backups`, etc.).
- `test/` — e2e.
- `scripts/` — utilidades canónicas.
- `docs/`, `specs/` — documentación y artefactos SDD.
- `AGENTS.md`, `MEMORY.md` — guías/memoria vigente para agentes. `.opencode/` contiene agentes, comandos y skills del proyecto.

## Notas
- Existe deuda de tests preexistentes por DI en algunos módulos de prueba (adelantos, empleados, liquidaciones, partes-diarios). Ver `AGENTS.md` / `CHECKPOINT_CONTEXT.md`.
- Los respaldos se guardan en `./backups` (volumen). Scripts/artefactos legacy fueron retirados; `/archive/` está ignorada por git para cuarentenas locales puntuales.
