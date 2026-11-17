/**
 * Herramienta de línea de comandos para la base de datos.
 *
 *   npm run db:migrate                         Aplica las migraciones pendientes.
 *   npm run db:bootstrap -- --nombre "Pablo Monroy" --id 00 [--evento "Santa Secreto"] [--anio 2026]
 *                                              Crea el evento inicial y su primer organizador.
 *   npm run db:demo                            Carga 50 participantes de DEMOSTRACIÓN (solo modo local).
 */
import { createPgDb, createPgliteDb } from "../src/server/db/adapters";
import { runMigrations } from "../src/server/db/migrate";
import type { Db } from "../src/server/db/types";
import { cleanDisplayName, cleanIdentifier, normalizeName, IDENTIFIER_PATTERN } from "../src/domain/normalize";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function connect(): Promise<{ db: Db; local: boolean }> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✖ Falta DATABASE_URL. Copia .env.example a .env.local y complétalo (ver README).");
    process.exit(1);
  }
  if (url.startsWith("pglite:")) {
    return { db: await createPgliteDb(url.slice("pglite:".length) || undefined), local: true };
  }
  return { db: await createPgDb(url), local: false };
}

async function ensureBucket() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const bucket = process.env.SUPABASE_PHOTO_BUCKET ?? "participant-photos";
  const { data } = await client.storage.getBucket(bucket);
  if (data) {
    if (data.public) {
      await client.storage.updateBucket(bucket, { public: false });
      console.log(`✔ Bucket "${bucket}" cambiado a PRIVADO.`);
    } else {
      console.log(`✔ Bucket privado "${bucket}" listo.`);
    }
    return;
  }
  const { error } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/webp"],
  });
  if (error) console.warn(`⚠ No se pudo crear el bucket "${bucket}": ${error.message}`);
  else console.log(`✔ Bucket privado "${bucket}" creado.`);
}

async function bootstrap(db: Db) {
  const fullName = cleanDisplayName(arg("nombre") ?? "");
  const identifier = cleanIdentifier(arg("id") ?? "");
  const eventName = cleanDisplayName(arg("evento") ?? "Santa Secreto");
  const year = Number(arg("anio") ?? new Date().getFullYear());
  if (fullName.length < 2 || !IDENTIFIER_PATTERN.test(identifier)) {
    console.error('✖ Uso: npm run db:bootstrap -- --nombre "Nombre Completo" --id 00');
    process.exit(1);
  }

  let { rows } = await db.query<{ id: string; name: string }>("select id, name from santa.events where is_current");
  if (!rows[0]) {
    rows = (
      await db.query<{ id: string; name: string }>(
        `insert into santa.events (name, year, description, is_current)
         values ($1, $2, 'Amigo secreto de la familia', true) returning id, name`,
        [eventName, year],
      )
    ).rows;
    console.log(`✔ Evento creado: ${rows[0].name} (${year})`);
  } else {
    console.log(`ℹ Ya existe el evento actual: ${rows[0].name}`);
  }
  const eventId = rows[0].id;
  const nameNorm = normalizeName(fullName);
  const { rows: existing } = await db.query<{ id: string }>(
    "select id from santa.participants where event_id = $1 and (name_normalized = $2 or identifier = $3)",
    [eventId, nameNorm, identifier],
  );
  if (existing[0]) {
    await db.query("update santa.participants set role = 'ORGANIZER', is_active = true where id = $1", [existing[0].id]);
    console.log(`✔ ${fullName} ya existía; ahora es ORGANIZADOR.`);
  } else {
    await db.query(
      `insert into santa.participants (event_id, full_name, name_normalized, identifier, role)
       values ($1, $2, $3, $4, 'ORGANIZER')`,
      [eventId, fullName, nameNorm, identifier],
    );
    console.log(`✔ Organizador creado: ${fullName} (número ${identifier})`);
  }
  await db.query(
    "insert into santa.audit_logs (event_id, actor_name, action, scope) values ($1, 'Instalación', 'BOOTSTRAP', 'EVENT')",
    [eventId],
  );
}

const DEMO_NAMES = [
  "Pablo Monroy", "Laura Rodríguez", "Carlos Martínez", "Camila Gómez", "Andrés López", "Valentina Díaz",
  "Santiago Torres", "Mariana Ramírez", "Felipe Castro", "Daniela Herrera", "Juan Esteban Ruiz", "Sofía Vargas",
  "Mateo Rojas", "Isabella Moreno", "Sebastián Jiménez", "Lucía Ortiz", "Nicolás Silva", "Gabriela Mendoza",
  "Tomás Navarro", "Paula Cárdenas", "Diego Guerrero", "Natalia Peña", "Martín Ríos", "Juliana Salazar",
  "Alejandro Vega", "Manuela Cruz", "Samuel Pineda", "Antonia Rincón", "Emilio Suárez", "Catalina Acosta",
  "Joaquín Medina", "Renata Castillo", "Simón Aguilar", "Victoria Parra", "Gabriel Ospina", "Elena Cortés",
  "Benjamín León", "Abuela Rosa Monroy", "Abuelo Jorge Monroy", "Tía Carmen Díaz", "Tío Luis Herrera",
  "Prima Ana María", "Primo Ricardo", "Clara Beltrán", "Héctor Quintero", "Teresa Gil", "Ramiro Franco",
  "Silvia Montoya", "Óscar Rueda", "Pilar Arango",
];

async function demo(db: Db, local: boolean) {
  if (!local && !process.argv.includes("--forzar")) {
    console.error("✖ Los datos de demostración solo se cargan en modo local (pglite). Usa --forzar bajo tu riesgo.");
    process.exit(1);
  }
  await db.query("update santa.events set is_current = false where is_current");
  const { rows } = await db.query<{ id: string }>(
    `insert into santa.events (name, year, description, is_current)
     values ('Santa Secreto (DEMO)', 2026, 'Evento de demostración con datos ficticios', true) returning id`,
  );
  const eventId = rows[0].id;
  for (let i = 0; i < DEMO_NAMES.length; i++) {
    const name = DEMO_NAMES[i];
    await db.query(
      `insert into santa.participants (event_id, full_name, name_normalized, identifier, role)
       values ($1, $2, $3, $4, $5)`,
      [eventId, name, normalizeName(name), String(i).padStart(2, "0"), i < 2 ? "ORGANIZER" : "PARTICIPANT"],
    );
  }
  console.log(`✔ Evento DEMO con ${DEMO_NAMES.length} participantes ficticios.`);
  console.log('  Organizadores: "Pablo Monroy" (00) y "Laura Rodríguez" (01). Los demás: su posición 02…49.');
}

async function main() {
  const command = process.argv[2];
  const { db, local } = await connect();
  try {
    await runMigrations(db, undefined, console.log);
    if (command === "migrate") {
      console.log("✔ Base de datos al día.");
      await ensureBucket();
    } else if (command === "bootstrap") {
      await bootstrap(db);
      await ensureBucket();
    } else if (command === "demo") {
      await demo(db, local);
    } else {
      console.error("Comandos: migrate | bootstrap | demo");
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
