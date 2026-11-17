/**
 * ENTORNO DE PRUEBA LOCAL — no toca Supabase ni Vercel.
 *
 *   npm run prueba:local                                   Evento pequeño con 6 personas ficticias y sugerencias.
 *   npm run prueba:local -- --excel "archivo.xlsx"         Mismos nombres del Excel (sin sugerencias) para probar la importación.
 *   npm run prueba:local -- --conservar                    Reabre la prueba anterior sin borrarla.
 *
 * Base de datos: PostgreSQL embebido en .data/prueba-local. Fotos: .data/fotos. Realtime: desactivado (usa sondeo).
 * Todas las credenciales de .env.local se anulan explícitamente para este proceso.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createPgliteDb } from "../src/server/db/adapters";
import { runMigrations } from "../src/server/db/migrate";
import { cleanDisplayName, normalizeName } from "../src/domain/normalize";
import { readSpreadsheet } from "../src/server/import/spreadsheet";
import { detectColumns } from "../src/server/import/gift-wishes";

const PORT = "3300";
const DIR = path.join(process.cwd(), ".data", "prueba-local");

// Anula TODO lo que pueda apuntar a producción. Next.js no reemplaza variables ya definidas en el proceso.
const SAFE_ENV = {
  DATABASE_URL: `pglite:${DIR}`,
  DATABASE_SSL: "",
  DATABASE_CA_CERT: "",
  SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  SUPABASE_PHOTO_BUCKET: "",
  VERCEL_OIDC_TOKEN: "",
};

const DEMO = [
  { name: "Organizador Prueba", id: "00", role: "ORGANIZER", wishes: "Una camiseta talla M, algo relacionado con fútbol\no una billetera" },
  { name: "Ana Prueba", id: "01", role: "PARTICIPANT", wishes: "Libros de misterio. Me encanta este: https://www.buscalibre.com.co/libros/misterio" },
  { name: "Bruno Prueba", id: "02", role: "PARTICIPANT", wishes: "Audífonos; chocolates & café ☕" },
  { name: "Carla Prueba", id: "03", role: "PARTICIPANT", wishes: "Plantas 🌱\nUna taza bonita\n(ideas: www.example.com/tazas)" },
  { name: "Diego Prueba", id: "04", role: "PARTICIPANT", wishes: null },
  { name: "Elena Prueba", id: "05", role: "PARTICIPANT", wishes: "Cualquier detalle que me sorprenda" },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function namesFromExcel(file: string): Promise<string[]> {
  const table = await readSpreadsheet(await readFile(file), file);
  const header = table.find((r) => r.some((c) => c !== null)) ?? [];
  const col = detectColumns(header).name;
  if (col === undefined) throw new Error('El Excel no tiene una columna de nombre ("Nombre completo").');
  const start = table.indexOf(header) + 1;
  const names = table
    .slice(start)
    .map((r) => r[col])
    .map((c) => cleanDisplayName(c === null || c === undefined ? "" : typeof c === "string" ? c : c.num))
    .filter((n) => n.length >= 2);
  return [...new Map(names.map((n) => [normalizeName(n), n])).values()];
}

async function seed() {
  await rm(DIR, { recursive: true, force: true });
  await rm(path.join(process.cwd(), ".data", "fotos"), { recursive: true, force: true });
  const db = await createPgliteDb(DIR);
  try {
    await runMigrations(db);
    const { rows } = await db.query<{ id: string }>(
      "insert into santa.events (name, year, description, is_current) values ('🧪 Prueba local', 2026, 'Evento de prueba en tu computador', true) returning id",
    );
    const eventId = rows[0].id;
    const excel = arg("excel");
    const people = excel
      ? [
          { name: "Organizador Prueba", id: "000", role: "ORGANIZER", wishes: null },
          ...(await namesFromExcel(excel))
            .filter((n) => normalizeName(n) !== normalizeName("Organizador Prueba"))
            .map((name, i) => ({ name, id: String(i + 1).padStart(3, "0"), role: "PARTICIPANT", wishes: null })),
        ]
      : DEMO;
    for (const p of people) {
      await db.query(
        `insert into santa.participants (event_id, full_name, name_normalized, identifier, role, gift_wishes)
         values ($1, $2, $3, $4, $5, $6)`,
        [eventId, p.name, normalizeName(p.name), p.id, p.role, p.wishes],
      );
    }
    console.log(`\n✔ Evento "🧪 Prueba local" creado con ${people.length} participantes ${excel ? "(nombres del Excel, sin sugerencias)" : "ficticios"}.`);
    console.log("  Organizador: \"Organizador Prueba\", número " + people[0].id);
    if (!excel) console.log("  Participantes: Ana/Bruno/Carla/Diego/Elena Prueba → números 01, 02, 03, 04, 05");
    else console.log("  Los demás participantes tienen los números 001, 002, … (míralos en Administración → Participantes).");
  } finally {
    await db.close();
  }
}

async function main() {
  if (!process.argv.includes("--conservar") || !existsSync(DIR)) await seed();
  else console.log("\n✔ Se conserva la prueba anterior (.data/prueba-local).");

  // Compilación propia SIN credenciales (las variables NEXT_PUBLIC_ se incrustan al compilar) y modo producción:
  // así no choca con un `next dev` que ya esté abierto y nada apunta a Supabase.
  const env = { ...process.env, ...SAFE_ENV, ALLOW_PGLITE_IN_PRODUCTION: "true" };
  console.log("\n⏳ Compilando la aplicación para la prueba (≈1 minuto)…");
  const build = spawn("npx next build", { stdio: "inherit", shell: true, env });
  const ok = await new Promise<boolean>((resolve) => build.on("exit", (code) => resolve(code === 0)));
  if (!ok) throw new Error("La compilación falló.");

  console.log(`\n🧪 Abre http://localhost:${PORT}  (en el celular: usa la IP de tu computador en la misma red Wi-Fi)`);
  console.log("   Base de datos LOCAL. Supabase y Vercel NO se usan. Ctrl+C para terminar.\n");

  const child = spawn(`npx next start -p ${PORT}`, { stdio: "inherit", shell: true, env });
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
