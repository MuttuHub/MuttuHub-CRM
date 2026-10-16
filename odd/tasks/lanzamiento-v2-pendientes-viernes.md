# Viernes 2026-10-16: primeras tareas del día

Haz esto antes de cualquier otra cosa. El plan completo está en `odd/tasks/lanzamiento-v2-fin-de-semana.md`.

## 1. Sacar el respaldo (dump) de producción (unos 15 minutos)

**Por qué:** el ensayo de migraciones (R4) aplica las 23 migraciones sobre una copia real de producción. Decide si se
lanza el domingo. Este mismo procedimiento se repite el domingo, justo antes de migrar.

**Qué hace:** solo **lee** producción, no modifica nada. Usa el CLI de Supabase, que ya está instalado y usa Docker por
dentro.

### Paso 1. Copiar la cadena de conexión

1. Entra a <https://supabase.com/dashboard> y abre el **proyecto de producción**, el que usan los usuarios reales.
2. Botón **«Connect»** (arriba) → pestaña **«Session pooler»** → copia la URI. Se ve así:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres`.
3. Reemplaza `[YOUR-PASSWORD]` por la contraseña de la base.
   - Si no la sabes, **no la restablezcas sin avisarle a Claude**: cambiarla puede dejar a Vercel sin conexión.

### Paso 2. Guardarla en un archivo privado

Hazlo en la terminal de WSL, **no en el chat de Claude**. La contraseña nunca debe quedar en una conversación.

```bash
nano ~/.muttu-prod-url        # pega la URI completa · Ctrl+O guarda · Ctrl+X sale
chmod 600 ~/.muttu-prod-url
```

### Paso 3. Sacar el dump

Escríbelo en el prompt de Claude Code con el prefijo `!`. Lee la URL del archivo, así que la contraseña no aparece:

```
! mkdir -p ~/muttu-backups/2026-10-16 && cd ~/muttu-backups/2026-10-16 && U="$(cat ~/.muttu-prod-url)" && supabase db dump --db-url "$U" -f roles.sql --role-only && supabase db dump --db-url "$U" -f schema.sql && supabase db dump --db-url "$U" -f data.sql --use-copy --data-only && ls -lh
```

Deben quedar 3 archivos: `roles.sql`, `schema.sql` y `data.sql`.

- **Si falla por red (Fortinet):** pégale el error a Claude, sin la URL.
- **Si funciona:** dile a Claude «ya está el dump». Claude lo restaura en un **contenedor aparte**, no en tu Docker de
  desarrollo, y corre el ensayo R4.

**Cuidado:** el dump contiene **datos reales de clientes**.

- Vive en `~/muttu-backups`, fuera del repositorio, para que nunca termine en un commit.
- No lo compartas.
- Se borra después del lanzamiento.

## 2. Recorrer la ficha nueva en el navegador (unos 20 minutos)

Nadie la ha visto con los ojos todavía, porque los agentes no pueden abrir un navegador. Abre
`http://localhost:3000/proyectos`, elige un proyecto **en ejecución** y revisa:

- [ ] **Encabezado:** semáforos (al hacer clic llevan a Actividades o Finanzas), «Registrar avance», «Registrar gasto» y
  el menú «Más acciones».
- [ ] **Resumen:**
  - estado técnico y financiero con su frase de causa;
  - «Requiere atención» con enlaces;
  - datos generales;
  - equipo;
  - el botón **«Editar datos generales»**.
- [ ] **Actividades:**
  - las vistas Lista, Gantt y **Tablero**; una tarjeta del Tablero debe llevarte a la actividad;
  - «Opciones avanzadas».
- [ ] **Finanzas:**
  - los segmentos Resumen, Gastos y Presupuesto;
  - la barra de ejecución;
  - en Presupuesto, escribe y **borra** dígitos de un monto: el valor no debe cambiar solo.
- [ ] **Documentos:** agrupados por origen, con filtro y buscador.
- [ ] **Historial:** Modificaciones, Versiones y Auditoría.
- [ ] **Más acciones → Imprimir / PDF → Ctrl+P:** debe salir solo la hoja, sin el menú lateral.
- [ ] **Un proyecto en borrador:** la lista de «Próximos pasos» y, en Actividades, «Cargar desde Excel».
- [ ] **Crear un proyecto nuevo:** empieza por el cliente, muestra su tarjeta y la lista de sus oportunidades, y tiene
  las ayudas ⓘ.
- [ ] **Clientes → un cliente:** el botón «Crear proyecto».
- [ ] **En el celular, o con la ventana angosta:** que nada se salga de la pantalla.

Anota lo que se vea raro o confuso y pásaselo a Claude, mejor con una captura.

## 3. Checklist de los paneles (unos 10 minutos)

- [ ] **Supabase → Storage:** el bucket `muttu-docs` existe y es **privado**.
- [ ] **Supabase → Database → Cron:** los jobs `muttu-daily-8am` y `muttu-retry-830` están activos.
- [ ] **Supabase → Database → Backups:** hay respaldo diario o PITR activo.
- [ ] **Supabase → Authentication → URL Configuration:** la URL de producción `/auth/confirm` está en la lista.
- [ ] **Vercel → Settings → Environment Variables:** `ENABLE_DEV_ROUTES` **no** está en `true`.
- [ ] **Vercel → Settings → General:** anota la versión de Node.

## 4. DeepSeek (opencode)

- Lote 2 (Y1 filtros del portafolio, Y2 fecha legible, Y3 ocultar pestañas vacías de Clientes): Claude lo integra
  apenas DeepSeek marca «LISTO». Revisa en el plan si quedó integrado durante la noche.
- Si DeepSeek se detuvo con una «PREGUNTA» o un «PEDIDO A CLAUDE» en
  `odd/tasks/lanzamiento-v2-deepseek-log.md`, pásaselo a Claude.
- **Estado al cierre del jueves (22:30 aprox.):**
  - DeepSeek quedó detenido en **Y1, sin commit**. En su worktree hay `portafolio-filtros.tsx` y
    `portafolio-filtros.test.tsx`, que son nuevos, y cambios en `project-list.test.tsx`.
  - Para retomarlo, ábrelo en la misma carpeta y dile: «Continúa con Y1 desde donde quedaste, corre las tres
    verificaciones y haz el commit con su entrada en el log; luego sigue con Y2 e Y3».
  - En esa carpeta hay una carpeta suelta, `node_modules_stale_…/`, que quedó de un `npm ci`. Dile que **no** la
    agregue a ningún commit (nada de `git add -A`) y que la borre.

## Lo que sigue después (lo lleva Claude)

| Cuándo | Tarea |
|---|---|
| Viernes | R4 ensayo 1 con el dump · R6b revisión de entrega (permisos, migraciones, dinero, borrados) |
| Sábado 12:00 | Congelamiento · R6 integración y suite completa · `v2.0.0-rc1` · R7 ensayo 2 · R8 runbook |
| Domingo en la mañana | R9 lanzamiento: respaldo, `migrate deploy`, merge a `main`, deploy y humo |
