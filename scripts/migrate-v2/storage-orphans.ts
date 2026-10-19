/**
 * WHY: v2 never deletes a file and never moves a storage object, so drift between
 * `storage_path` rows and the bucket goes unnoticed unless something reports it.
 * This script is that read-only check: it lists which storage-path rows have no
 * object and which objects under the `proyectos/` prefix have no row.
 *
 * It only ever calls `list()` — never upload, remove, move, mv or copy — and it
 * opens no write path. It runs against the local generic storage through the
 * service-role client, so the guard must pass before anything is constructed.
 */
import { describeTarget } from "./_guard"

import { db } from "../../src/lib/db"

import { createSupabaseAdmin } from "../../src/lib/supabase/admin"
import { printTable, renderStorageTable, type StorageReport } from "./_harness"

const PROJECTS_PREFIX = "proyectos/"

type RawClient = { $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T> }
type ColumnRow = { table_name: string }
type PathRow = { storage_path: string }
type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

async function dbStoragePaths(): Promise<string[]> {
  const client = db as unknown as RawClient

  const tables = await client.$queryRawUnsafe<ColumnRow[]>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'storage_path'
      ORDER BY table_name`,
  )

  const paths = new Set<string>()
  for (const { table_name: table } of tables) {
    // Table names come from the catalog, never from user input.
    const rows = await client.$queryRawUnsafe<PathRow[]>(
      `SELECT storage_path FROM "public"."${table}" WHERE storage_path IS NOT NULL`,
    )
    for (const row of rows) if (row.storage_path) paths.add(row.storage_path)
  }

  return [...paths].sort()
}

async function listObjects(admin: SupabaseAdmin, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 12) throw new Error(`storage listing exceeded the folder-depth limit at "${prefix}"`)

  const keys: string[] = []
  const limit = 1000
  let offset = 0

  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit, offset })
    if (error) throw new Error(error.message)

    const entries = data ?? []
    for (const entry of entries) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) keys.push(...(await listObjects(admin, bucket, key, depth + 1)))
      else keys.push(key)
    }

    if (entries.length < limit) break
    offset += limit
  }

  return keys
}

async function main(): Promise<void> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET is not set. Load .env.local first.")

  const admin = createSupabaseAdmin()
  const rowPaths = await dbStoragePaths()
  const objectKeys = await listObjects(admin, bucket, "")

  const rowSet = new Set(rowPaths)
  const objectSet = new Set(objectKeys)

  const rowsWithoutObject = rowPaths.filter((path) => !objectSet.has(path))
  const objectsWithoutRow = objectKeys.filter((key) => key.startsWith(PROJECTS_PREFIX) && !rowSet.has(key))

  const report: StorageReport = {
    rows: rowPaths.length,
    objects: objectKeys.length,
    rows_without_object: rowsWithoutObject.length,
    objects_without_row: objectsWithoutRow.length,
  }

  console.log(`# Storage orphan report  (bucket: ${bucket})  (db host: ${describeTarget()})`)
  console.log("## Storage")
  renderStorageTable(report)

  if (rowsWithoutObject.length > 0) {
    console.log("")
    console.log("## Rows without object")
    printTable(["storage_path"], rowsWithoutObject.map((path) => [path]))
  }

  if (objectsWithoutRow.length > 0) {
    console.log("")
    console.log(`## Objects without row (${PROJECTS_PREFIX})`)
    printTable(["object key"], objectsWithoutRow.map((key) => [key]))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
