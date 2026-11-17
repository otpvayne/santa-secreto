/**
 * Servidor para las pruebas end-to-end: crea una base PGlite NUEVA con datos de prueba
 * (claramente separados de producción) y arranca la aplicación en modo producción.
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { createPgliteDb } from "../src/server/db/adapters";
import { runMigrations } from "../src/server/db/migrate";
import { normalizeName } from "../src/domain/normalize";

// Sugerencias de regalo de prueba (Ana María no tiene: se prueba el mensaje alternativo).
export const E2E_PEOPLE = [
  { name: "Pablo Monroy", id: "00", role: "ORGANIZER", wishes: "Una camiseta talla M, algo relacionado con fútbol\no una billetera" },
  { name: "Laura Rodríguez", id: "01", role: "ORGANIZER", wishes: "Libros de misterio" },
  { name: "Carlos Martínez", id: "02", role: "PARTICIPANT", wishes: "Audífonos; chocolates & café ☕" },
  { name: "Camila Gómez", id: "03", role: "PARTICIPANT", wishes: "Plantas 🌱\nUna taza bonita" },
  { name: "José Pérez", id: "04", role: "PARTICIPANT", wishes: "Cualquier detalle que me sorprenda (ideas: https://www.example.com/regalos?talla=M&color=rojo)." },
  { name: "Ana María Díaz", id: "05", role: "PARTICIPANT", wishes: null },
];

async function main() {
  const port = process.env.E2E_PORT ?? "3200";
  const dir = path.join(process.cwd(), ".data", "e2e");
  await rm(dir, { recursive: true, force: true });
  const db = await createPgliteDb(dir);
  await runMigrations(db);
  const { rows } = await db.query<{ id: string }>(
    "insert into santa.events (name, year, is_current) values ('Santa Secreto E2E', 2026, true) returning id",
  );
  for (const p of E2E_PEOPLE) {
    await db.query(
      "insert into santa.participants (event_id, full_name, name_normalized, identifier, role, gift_wishes) values ($1,$2,$3,$4,$5,$6)",
      [rows[0].id, p.name, normalizeName(p.name), p.id, p.role, p.wishes],
    );
  }
  await db.close();

  const child = spawn(`npx next start -p ${port}`, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: `pglite:${dir}`,
      ALLOW_PGLITE_IN_PRODUCTION: "true",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
    },
  });
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
