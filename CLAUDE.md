@AGENTS.md

## Entorno local (Docker/Supabase)

- Este proyecto tiene DOS `.env` distintos con datos completamente diferentes:
  - `.env` (raíz, cargado por `dotenv/config` default) → apunta a un proyecto Supabase
    remoto/compartido con datos que parecen reales (nombres de clientes reales).
  - `.env.local` → Docker local (`127.0.0.1:54322`), con la data demo ficticia del seed.
- **Cualquier script, comando o herramienta que deba tocar la base de datos DEBE cargar
  `.env.local` explícitamente** (`tsx --env-file=.env.local ...`), nunca depender del
  `.env` por default. Nunca asumas que `.env` es local — no lo es.
- Motivo: ya hubo un incidente de seed corriendo contra Supabase Cloud en vez de local
  (ver `DIAGNOSTICO-SEED-CLOUD.md`). Cualquier nuevo script de datos debe reusar o
  replicar el guard anti-producción de `prisma/seed.ts` (verifica que `DATABASE_URL`
  apunte a localhost antes de escribir).
