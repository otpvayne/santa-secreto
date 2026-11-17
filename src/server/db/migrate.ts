import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./types";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/**
 * Aplica, en orden, las migraciones SQL que aún no se han ejecutado.
 * Cada migración corre en su propia transacción y queda registrada en santa.schema_migrations.
 */
export async function runMigrations(db: Db, dir = MIGRATIONS_DIR, log: (m: string) => void = () => {}) {
  await db.execScript(`
    create schema if not exists santa;
    create table if not exists santa.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const { rows } = await db.query<{ name: string }>("select name from santa.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(/*turbopackIgnore: true*/ `${dir}/${file}`, "utf8");
    const safeName = file.replace(/'/g, "''");
    await db.execScript(`${sql}\n;insert into santa.schema_migrations (name) values ('${safeName}');`);
    newlyApplied.push(file);
    log(`✔ Migración aplicada: ${file}`);
  }
  return newlyApplied;
}
