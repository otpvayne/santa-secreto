import type { EventStatus } from "@/domain/event-state";
import { eventSchema, parseInput } from "@/lib/validation/schemas";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import type { PhotoStorage } from "../storage";
import type { Actor } from "../types";
import { assertOrganizerInDb } from "./auth";
import { audit } from "./audit";

export interface EventInfo {
  id: string;
  name: string;
  year: number;
  description: string | null;
  status: EventStatus;
  isCurrent: boolean;
  drawLocked: boolean;
  deliveryDate: string | null;
  createdAt: Date;
  drawStartedAt: Date | null;
  deliveryStartedAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  participantCount: number;
}

const SELECT_EVENT = `
  select e.id, e.name, e.year, e.description, e.status, e.is_current, e.draw_locked,
         e.delivery_date::text as delivery_date, e.created_at, e.draw_started_at, e.delivery_started_at,
         e.completed_at, e.archived_at,
         (select count(*)::int from santa.participants p where p.event_id = e.id) as participant_count
    from santa.events e`;

interface EventDbRow {
  id: string;
  name: string;
  year: number;
  description: string | null;
  status: EventStatus;
  is_current: boolean;
  draw_locked: boolean;
  delivery_date: string | null;
  created_at: Date;
  draw_started_at: Date | null;
  delivery_started_at: Date | null;
  completed_at: Date | null;
  archived_at: Date | null;
  participant_count: number;
}

function toInfo(r: EventDbRow): EventInfo {
  return {
    id: r.id,
    name: r.name,
    year: r.year,
    description: r.description,
    status: r.status,
    isCurrent: r.is_current,
    drawLocked: r.draw_locked,
    deliveryDate: r.delivery_date,
    createdAt: r.created_at,
    drawStartedAt: r.draw_started_at,
    deliveryStartedAt: r.delivery_started_at,
    completedAt: r.completed_at,
    archivedAt: r.archived_at,
    participantCount: r.participant_count,
  };
}

export async function getEvent(db: Db, eventId: string): Promise<EventInfo> {
  const { rows } = await db.query<EventDbRow>(`${SELECT_EVENT} where e.id = $1`, [eventId]);
  if (!rows[0]) throw new AppError("EVENT_NOT_FOUND");
  return toInfo(rows[0]);
}

export async function listEvents(db: Db, actor: Actor): Promise<EventInfo[]> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<EventDbRow>(`${SELECT_EVENT} order by e.year desc, e.created_at desc`);
  return rows.map(toInfo);
}

export async function updateEvent(db: Db, actor: Actor, input: unknown): Promise<EventInfo> {
  await assertOrganizerInDb(db, actor);
  const data = parseInput(eventSchema, input);
  const current = await getEvent(db, actor.eventId);
  if (current.status === "ARCHIVED") throw new AppError("EVENT_ARCHIVED");
  await db.query(
    `update santa.events set name = $2, year = $3, description = nullif($4, ''), delivery_date = nullif($5, '')::date
      where id = $1`,
    [actor.eventId, data.name, data.year, data.description, data.deliveryDate],
  );
  await audit(db, actor, "EVENT_UPDATED", "EVENT", { name: data.name, year: data.year });
  return getEvent(db, actor.eventId);
}

export async function createEvent(db: Db, actor: Actor, input: unknown, copyParticipants: boolean): Promise<string> {
  await assertOrganizerInDb(db, actor);
  const data = parseInput(eventSchema, input);
  const { rows } = await db.query<{ id: string }>(
    "select santa.create_event($1, $2, $3, $4, $5, nullif($6, '')::date, $7) as id",
    [actor.eventId, actor.participantId, data.name, data.year, data.description, data.deliveryDate, copyParticipants],
  );
  return rows[0].id;
}

export async function activateEvent(db: Db, actor: Actor, targetId: string): Promise<void> {
  await assertOrganizerInDb(db, actor);
  await db.query("select santa.activate_event($1, $2, $3)", [actor.eventId, actor.participantId, targetId]);
}

export async function archiveEvent(db: Db, actor: Actor): Promise<void> {
  await assertOrganizerInDb(db, actor);
  await db.query("select santa.archive_event($1, $2)", [actor.eventId, actor.participantId]);
}

/** Borra fotos (o el evento completo) de un evento archivado que no es el actual. */
export async function purgeEvent(
  db: Db,
  storage: PhotoStorage | null,
  actor: Actor,
  targetId: string,
  mode: "PHOTOS" | "ALL",
): Promise<number> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<{ photo_path: string }>("select * from santa.purge_event($1, $2, $3, $4)", [
    actor.eventId,
    actor.participantId,
    targetId,
    mode,
  ]);
  const paths = rows.map((r) => r.photo_path).filter(Boolean);
  if (storage && paths.length > 0) await storage.remove(paths);
  return paths.length;
}
