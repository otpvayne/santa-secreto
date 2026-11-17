import "server-only";
import { createPgDb, createPgliteDb } from "./adapters";
import { runMigrations } from "./migrate";
import type { Db } from "./types";

export type { Db } from "./types";

const globalForDb = globalThis as unknown as { __santaDb?: Promise<Db> };

/**
 * Devuelve la conexión compartida del proceso.
 * - `postgres://…`  → PostgreSQL de Supabase (producción).
 * - `pglite:./ruta` → PostgreSQL embebido para probar en local sin credenciales (aplica migraciones solo).
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__santaDb) {
    globalForDb.__santaDb = createDb().catch((e) => {
      globalForDb.__santaDb = undefined;
      throw e;
    });
  }
  return globalForDb.__santaDb;
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta la variable de entorno DATABASE_URL. Revisa el archivo .env.local (ver README).");
  }
  if (url.startsWith("pglite:")) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
      throw new Error("PGlite es solo para desarrollo local. Configura DATABASE_URL con PostgreSQL de Supabase.");
    }
    const db = await createPgliteDb(url.slice("pglite:".length) || undefined);
    await runMigrations(db);
    return db;
  }
  return createPgDb(url);
}
