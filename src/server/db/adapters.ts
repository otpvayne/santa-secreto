import type { Db } from "./types";

/** Conexión a PostgreSQL (Supabase) mediante un pool de `pg`. */
export async function createPgDb(connectionString: string): Promise<Db> {
  const pg = await import("pg");
  const { Pool, types } = pg.default ?? pg;
  // `date` como texto (evita desfases de zona horaria); int8 como número.
  types.setTypeParser(1082, (v: string) => v);
  types.setTypeParser(20, (v: string) => Number(v));

  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const sslSetting = process.env.DATABASE_SSL ?? (sslmode === "disable" ? "disable" : "no-verify");
  const ca = process.env.DATABASE_CA_CERT;
  const ssl =
    sslSetting === "disable"
      ? false
      : sslSetting === "verify"
        ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
        : { rejectUnauthorized: false };

  const pool = new Pool({
    connectionString: url.toString(),
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as unknown[]);
      return { rows: res.rows as T[] };
    },
    async execScript(sql: string) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** PostgreSQL embebido (WASM). Solo para desarrollo local y pruebas automatizadas. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await db.query<T>(text, params);
      return { rows: res.rows };
    },
    async execScript(sql: string) {
      await db.transaction(async (tx) => {
        await tx.exec(sql);
      });
    },
    async close() {
      await db.close();
    },
  };
}
