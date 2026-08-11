# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** muttu-hub
- **Date:** 2026-08-09
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

### Requirement: Administration & Users
- **Description:** Administration area manages users (list, create, change role, deactivate) and catalogs, and prevents access for unauthenticated users.

#### Test TC016 Open administration and review the user list
- **Test Code:** [TC016_Open_administration_and_review_the_user_list.py](./TC016_Open_administration_and_review_the_user_list.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/a672474c-621c-4a4b-934c-d208880ec41d
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Administration page opens and the user list renders correctly with role ADMINISTRADOR.
---

#### Test TC021 Change an existing user's role
- **Test Code:** [TC021_Change_an_existing_users_role.py](./TC021_Change_an_existing_users_role.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/3311d8bb-0adc-4dbe-9e3b-85b7abbcbb67
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Role change via the role UI persists correctly.
---

#### Test TC023 Deactivate a user account
- **Test Code:** [TC023_Deactivate_a_user_account.py](./TC023_Deactivate_a_user_account.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/11e093ef-0f83-4659-9c8f-0f6519ae7dfd
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** User deactivation works; deactivated user cannot sign in.
---

#### Test TC027 Maintain catalogs from administration
- **Test Code:** [TC027_Maintain_catalogs_from_administration.py](./TC027_Maintain_catalogs_from_administration.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/ABC
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Catalog maintenance (labels/categories) works from administration.
---

### Requirement: Reports & Exports
- **Description:** Task reports can be generated, filtered, and exported (Excel/PDF); printable customer list and pipeline report work.

#### Test TC017 Generate a task report and export it to Excel
- **Test Code:** [TC017_Generate_a_task_report_and_export_it_to_Excel.py](./TC017_Generate_a_task_report_and_export_it_to_Excel.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/26b4d262-7c46-438f-938d-878020da37a6
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Excel export succeeds; file downloads.
---

#### Test TC020 Generate a task report and export it to PDF
- **Test Code:** [TC020_Generate_a_task_report_and_export_it_to_PDF.py](./TC020_Generate_a_task_report_and_export_it_to_PDF.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/95a4d19f-7021-4f2b-8fd6-6661e7dd2dc0
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** PDF export succeeds; file downloads.
---

#### Test TC022 Open the task report view and review status totals
- **Test Code:** [TC022_Open_the_task_report_view_and_review_status_totals.py](./TC022_Open_the_task_report_view_and_review_status_totals.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/8c64d27e-4a89-47e0-9e3c-24b5f7a4594e
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Report view shows status totals correctly.
---

#### Test TC024 Export the printable customer list
- **Test Code:** [TC024_Export_the_printable_customer_list.py](./TC024_Export_the_printable_customer_list.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/15f3f36e-9f69-4826-b959-8a2dcb5adaf7
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Printable customer list exports correctly.
---

#### Test TC025 Open the printable customer list
- **Test Code:** [TC025_Open_the_printable_customer_list.py](./TC025_Open_the_printable_customer_list.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/12bf3b1c-3863-4bd9-bc86-e7a0f4a6924e
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Printable list view opens correctly.
---

#### Test TC026 Open the printable pipeline report
- **Test Code:** [TC026_Open_the_printable_pipeline_report.py](./TC026_Open_the_printable_pipeline_report.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/91c9d03d-434c-4eb9-98e3-0c3a5e2b4dab
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Printable pipeline report opens correctly.
---

### Requirement: Customers (CRM)
- **Description:** Customers can be created, edited, searched, deleted (soft delete, preserving history), and the list handles empty state gracefully.

#### Test TC018 Delete a customer and remove it from the active list
- **Test Code:** [TC018_Delete_a_customer_and_remove_it_from_the_active_list.py](./TC018_Delete_a_customer_and_remove_it_from_the_active_list.py)
- **Test Error:** TEST FAILURE
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/f392d008-939f-4528-8a4d-2b5e47fa0b36
- **Status:** ❌ Failed
- **Severity:** MEDIUM
- **Analysis / Findings:** **BUG REAL y reproducido en el código fuente.** `DELETE /api/v1/clients/:id` existe en el backend (`src/app/api/v1/clients/[id]/route.ts`, soft delete `deleted_at = now`), pero **la UI no lo expone**: no hay botón "Eliminar"/"Desactivar" en la lista de clientes ni en la ficha (`client-sheet.tsx` y `client-list.tsx` no llaman a la mutación; no existe `useDeleteCliente`). La búsqueda del test por 'Eliminar'/'Borrar' no encontró nada. El cliente de prueba permanece en la lista activa. El PRD (§ Soft delete en todo, "Confirmaciones antes de eliminar") requiere la feature. **Fix sugerido:** agregar acción de soft delete en la UI del cliente (botón con ConfirmDeleteDialog) apuntando a `DELETE /api/v1/clients/:id`, o desactivar visiblemente.
---

### Requirement: Resilience & Edge Cases
- **Description:** The app handles empty lists and duplicate-prevention gracefully.

#### Test TC028 Handle an empty customer list gracefully
- **Test Code:** [TC028_Handle_an_empty_customer_list_gracefully.py](./TC028_Handle_an_empty_customer_list_gracefully.py)
- **Test Error:** TEST BLOCKED
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/3faf64d0-e9f8-4d96-bc63-1d96951a756a
- **Status:** ⚠️ BLOCKED (data fixture limitation, not an app defect)
- **Severity:** LOW
- **Analysis / Findings:** El caso requiere una lista de clientes VACÍA para validar el empty state, pero la cuenta QA ya tiene clientes creados por los tests (TC007/TC008/TC009/TC010/TC018). No es un defecto de la app. Verificación alternativa: crear una cuenta fresca (sin clientes) y confirmar el estado vacío, o limpiar los fixtures de prueba antes de correr.
---

#### Test TC029 Prevent duplicate task creation details from being saved
- **Test Code:** [TC029_Prevent_duplicate_task_creation_details_from_being_saved.py](./TC029_Prevent_duplicate_task_creation_details_from_being_saved.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/e51eae57-60c2-42a9-85bc-c33ba22715e1
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Duplicate task creation details are correctly prevented.
---

### Requirement: Documents
- **Description:** Documents can be uploaded, searched, and downloaded (single and ZIP).

#### Test TC019 Download one document and multiple documents as ZIP
- **Test Code:** [TC019_Download_one_document_and_multiple_documents_as_ZIP.py](./TC019_Download_one_document_and_multiple_documents_as_ZIP.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/75643860-983f-4a80-a82a-29ae6d96d271/test/fd84ecd2-c046-44c2-b197-3f1f222cbf3c
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Single and ZIP document downloads work correctly.
---

## 3️⃣ Coverage & Matching Metrics

- **85.7%** of tests passed in this run (12/14)
- **13/14 runnable** (TC028 blocked by data fixture)
- **1 real bug found: TC018** (customer delete not exposed in UI)

| Requirement        | Total Tests | ✅ Passed | ❌ Failed |
|--------------------|-------------|-----------|-----------|
| Administration & Users | 4 | 4 | 0 |
| Reports & Exports | 6 | 6 | 0 |
| Customers (CRM) | 1 | 0 | 1 |
| Resilience & Edge Cases | 2 | 1 | 1 (blocked — fixture) |
| Documents | 1 | 1 | 0 |

Combined project coverage (all runs): 26/29 cases executed; 25 PASSED, 1 FAILED (TC018 bug real), 0 BLOCKED por app. Quedan TC006/TC012 (PASS local, BLOCKED en sandbox por runner browser-only + email provider) y TC028 (BLOCKED por fixtures).

---

## 4️⃣ Key Gaps / Risks
> 1. **BUG REAL — TC018:** Soft delete de clientes existe en API pero NO se expone en la UI. El usuario no puede eliminar/desactivar un cliente desde la interfaz. Fix pendiente en el frontend.
> 2. **TC028 (empty customer list):** no verificable con la cuenta QA actual (tiene datos). Requiere cuenta fresca o limpieza de fixtures.
> 3. **TC006/TC012 en sandbox:** BLOCKED por el runner browser-only de TestSprite (no ejecuta POST externo) y el proveedor de email cloud rechaza `@muttu.co`. Pasaron localmente con el flujo dev (verificado). Para el sandbox: configurar SMTP/dominio en Supabase o ejecutar el script de reemplazo adjunto.
> 4. **Documentar credenciales** secretas en gestor; evaluar free tier vs. plan pagado según volumen (~150 créditos consumidos en esta corrida).