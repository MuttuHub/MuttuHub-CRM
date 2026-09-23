// Baja definitiva de fzapata@camarabaq.org.co: todo lo que tenía asignado o
// registrado a su nombre pasa a felipe@muttu.co, y su cuenta (fila `usuarios`
// + usuario de Supabase Auth) se borra por completo.
//
// Incluye tablas sin relación FK declarada en el schema (documento_versiones.
// subido_por_id, comentarios_tareas.autor_id) porque son columnas "log-only"
// (mismo patrón que solicitudes_acceso.revisado_por) — no bloquean el borrado,
// pero igual se reescriben para que no quede ningún id huérfano.
//
// Uso:
//   npm exec tsx scripts/offboard-camarabaq.ts            (dry-run: solo cuenta filas)
//   npm exec tsx scripts/offboard-camarabaq.ts --apply    (ejecuta de verdad)
//
// Idempotente: si fzapata ya no existe en `usuarios`, no hace nada.

import "dotenv/config";
import { db } from "../src/lib/db";
import { createSupabaseAdmin } from "../src/lib/supabase/admin";

const OLD_EMAIL = "fzapata@camarabaq.org.co";
const NEW_EMAIL = "felipe@muttu.co";

const apply = process.argv.includes("--apply");

async function main() {
  const oldUser = await db.usuario.findUnique({ where: { email: OLD_EMAIL } });
  if (!oldUser) {
    console.log(`[offboard] ${OLD_EMAIL} no existe en usuarios — nada que hacer.`);
    return;
  }

  const newUser = await db.usuario.findUnique({ where: { email: NEW_EMAIL } });
  if (!newUser) {
    throw new Error(`[offboard] ${NEW_EMAIL} no existe en usuarios — no hay a dónde reasignar.`);
  }

  const [
    clientes,
    tareas,
    bitacora,
    documentos,
    documentoVersiones,
    comentarios,
    auditorias,
    accesos,
    notificaciones,
  ] = await Promise.all([
    db.cliente.count({ where: { responsable_id: oldUser.id } }),
    db.tarea.count({ where: { responsable_id: oldUser.id } }),
    db.bitacoraEntrada.count({ where: { autor_id: oldUser.id } }),
    db.documento.count({ where: { autor_id: oldUser.id } }),
    db.documentoVersion.count({ where: { subido_por_id: oldUser.id } }),
    db.comentarioTarea.count({ where: { autor_id: oldUser.id } }),
    db.auditoria.count({ where: { usuario_id: oldUser.id } }),
    db.acceso.count({ where: { usuario_id: oldUser.id } }),
    db.notificacion.count({ where: { usuario_id: oldUser.id } }),
  ]);

  console.log(`[offboard] ${OLD_EMAIL} (${oldUser.id}) -> ${NEW_EMAIL} (${newUser.id})`);
  console.log(`[offboard] clientes: ${clientes} · tareas: ${tareas} · bitacora: ${bitacora}`);
  console.log(`[offboard] documentos (autor): ${documentos} · documento_versiones (subido_por): ${documentoVersiones}`);
  console.log(`[offboard] comentarios_tareas: ${comentarios} · auditoria: ${auditorias} · accesos: ${accesos} · notificaciones: ${notificaciones}`);

  if (!apply) {
    console.log("[offboard] dry-run — no se escribió nada. Corré con --apply para ejecutar.");
    return;
  }

  await db.$transaction([
    db.cliente.updateMany({ where: { responsable_id: oldUser.id }, data: { responsable_id: newUser.id } }),
    db.tarea.updateMany({ where: { responsable_id: oldUser.id }, data: { responsable_id: newUser.id } }),
    db.bitacoraEntrada.updateMany({ where: { autor_id: oldUser.id }, data: { autor_id: newUser.id } }),
    db.documento.updateMany({ where: { autor_id: oldUser.id }, data: { autor_id: newUser.id } }),
    db.documentoVersion.updateMany({ where: { subido_por_id: oldUser.id }, data: { subido_por_id: newUser.id } }),
    db.comentarioTarea.updateMany({ where: { autor_id: oldUser.id }, data: { autor_id: newUser.id } }),
    db.auditoria.updateMany({ where: { usuario_id: oldUser.id }, data: { usuario_id: newUser.id } }),
    db.acceso.updateMany({ where: { usuario_id: oldUser.id }, data: { usuario_id: newUser.id } }),
    db.notificacion.updateMany({ where: { usuario_id: oldUser.id }, data: { usuario_id: newUser.id } }),
    db.usuario.delete({ where: { id: oldUser.id } }),
  ]);
  console.log(`[offboard] fila usuarios/${oldUser.id} borrada, todo reasignado a ${NEW_EMAIL}.`);

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(oldUser.id);
  if (error) {
    console.error(`[offboard] la baja en Supabase Auth falló (limpiar a mano): ${error.message}`);
  } else {
    console.log(`[offboard] usuario de Supabase Auth ${oldUser.id} borrado.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[offboard] failed:", err);
    process.exit(1);
  });
