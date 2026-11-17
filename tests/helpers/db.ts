import { createPgliteDb } from "@/server/db/adapters";
import { runMigrations } from "@/server/db/migrate";
import type { Db } from "@/server/db/types";
import { normalizeName } from "@/domain/normalize";
import type { Actor, Role } from "@/server/types";

/** Base de datos PostgreSQL real (PGlite, en memoria) con todas las migraciones aplicadas. */
export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  await runMigrations(db);
  return db;
}

export interface Seeded {
  eventId: string;
  ids: string[];
  organizer: Actor;
  participant: Actor;
  actorOf: (id: string, role?: Role) => Actor;
}

/**
 * Crea un evento actual con `n` participantes. Los primeros `organizers` son ORGANIZER.
 * Identificadores "00", "01", …
 */
export async function seedEvent(db: Db, n: number, organizers = 1, opts: { current?: boolean } = {}): Promise<Seeded> {
  const { rows } = await db.query<{ id: string }>(
    "insert into santa.events (name, year, is_current) values ('Navidad de prueba', 2026, $1) returning id",
    [opts.current ?? true],
  );
  const eventId = rows[0].id;
  const ids: string[] = [];
  const width = Math.max(2, String(n - 1).length);
  for (let i = 0; i < n; i++) {
    const name = `Persona ${i.toString().padStart(3, "0")}`;
    const { rows: p } = await db.query<{ id: string }>(
      `insert into santa.participants (event_id, full_name, name_normalized, identifier, role)
       values ($1, $2, $3, $4, $5) returning id`,
      [eventId, name, normalizeName(name), String(i).padStart(width, "0"), i < organizers ? "ORGANIZER" : "PARTICIPANT"],
    );
    ids.push(p[0].id);
  }
  const actorOf = (id: string, role?: Role): Actor => ({
    participantId: id,
    eventId,
    role: role ?? (ids.indexOf(id) < organizers ? "ORGANIZER" : "PARTICIPANT"),
  });
  return {
    eventId,
    ids,
    organizer: actorOf(ids[0]),
    participant: actorOf(ids[n - 1]),
    actorOf,
  };
}

export async function getAssignments(db: Db, eventId: string) {
  const { rows } = await db.query<{ giver_id: string; receiver_id: string }>(
    "select giver_id, receiver_id from santa.assignments where event_id = $1",
    [eventId],
  );
  return rows;
}

export async function eventStatus(db: Db, eventId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>("select status from santa.events where id = $1", [eventId]);
  return rows[0].status;
}

/** Hace que todos los participantes revelen (cada uno toma la primera tarjeta libre). */
export async function revealAll(db: Db, seeded: Seeded) {
  const { claimCard } = await import("@/server/services/draw");
  for (const id of seeded.ids) {
    const { rows } = await db.query<{ card_number: number }>(
      "select card_number from santa.draw_cards where event_id = $1 and claimed_by is null order by card_number limit 1",
      [seeded.eventId],
    );
    await claimCard(db, seeded.actorOf(id), rows[0].card_number);
  }
}

export async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e) {
    const { toAppError } = await import("@/server/errors");
    const err = toAppError(e);
    if (err.code !== code) {
      throw new Error(`Se esperaba el error ${code} y se obtuvo ${err.code}: ${(e as Error).message}`);
    }
    return;
  }
  throw new Error(`Se esperaba el error ${code} pero la operación terminó bien`);
}
