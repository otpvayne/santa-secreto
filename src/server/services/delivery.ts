import { cryptoRandomInt, type RandomInt } from "@/domain/derangement";
import type { EventStatus } from "@/domain/event-state";
import { parseInput, reasonSchema } from "@/lib/validation/schemas";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import type { Actor, PublicPerson } from "../types";
import { photoUrl } from "../types";
import { assertOrganizerInDb } from "./auth";

export type TurnMode = "RANDOM" | "MANUAL";

interface PersonRow {
  id: string;
  full_name: string;
  has_photo: boolean;
  photo_version: number;
}

function person(r: PersonRow): PublicPerson {
  return { id: r.id, fullName: r.full_name, photoUrl: photoUrl(r.id, r.has_photo, r.photo_version) };
}

export async function startDelivery(db: Db, actor: Actor): Promise<void> {
  await assertOrganizerInDb(db, actor);
  await db.query("select santa.start_delivery($1, $2)", [actor.eventId, actor.participantId]);
}

/** Participantes del sorteo que aún no han recibido su regalo (entrega no confirmada). */
async function pendingReceivers(db: Db, eventId: string): Promise<PersonRow[]> {
  const { rows } = await db.query<PersonRow>(
    `select p.id, p.full_name, p.photo_path is not null as has_photo, p.photo_version
       from santa.assignments a
       join santa.participants p on p.id = a.receiver_id
      where a.event_id = $1
        and not exists (select 1 from santa.delivery_turns t
                         where t.event_id = $1 and t.receiver_id = a.receiver_id and t.status = 'COMPLETED')
      order by p.full_name`,
    [eventId],
  );
  return rows;
}

/**
 * Inicia un turno. En modo aleatorio el servidor elige con aleatoriedad criptográfica entre quienes
 * todavía no recibieron su regalo; en modo manual el organizador indica a la persona.
 */
export async function startTurn(
  db: Db,
  actor: Actor,
  mode: TurnMode,
  receiverId: string | null,
  random: RandomInt = cryptoRandomInt,
): Promise<{ turnId: string; receiverId: string }> {
  await assertOrganizerInDb(db, actor);
  let target = receiverId;
  if (mode === "RANDOM") {
    const pending = await pendingReceivers(db, actor.eventId);
    if (pending.length === 0) throw new AppError("NOBODY_PENDING");
    target = pending[random(pending.length)].id;
  }
  if (!target) throw new AppError("INVALID_INPUT", "Escoge a la persona que recibirá su regalo.");
  const { rows } = await db.query<{ id: string }>("select santa.start_turn($1, $2, $3, $4) as id", [
    actor.eventId,
    actor.participantId,
    target,
    mode,
  ]);
  return { turnId: rows[0].id, receiverId: target };
}

export async function cancelTurn(db: Db, actor: Actor, turnId: string): Promise<void> {
  await assertOrganizerInDb(db, actor);
  await db.query("select santa.cancel_turn($1, $2, $3)", [actor.eventId, actor.participantId, turnId]);
}

/** Regalador esperado del turno ACTIVO. Solo para que el organizador valide la entrega (queda auditado). */
export async function getExpectedGiver(db: Db, actor: Actor, turnId: string): Promise<PublicPerson & { identifier: string }> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<{ giver_id: string; giver_name: string; giver_identifier: string }>(
    "select * from santa.expected_giver($1, $2, $3)",
    [actor.eventId, actor.participantId, turnId],
  );
  const r = rows[0];
  if (!r) throw new AppError("NOT_IN_DRAW");
  const { rows: p } = await db.query<PersonRow>(
    "select id, full_name, photo_path is not null as has_photo, photo_version from santa.participants where id = $1",
    [r.giver_id],
  );
  return { ...person(p[0]), identifier: r.giver_identifier };
}

export async function confirmDelivery(
  db: Db,
  actor: Actor,
  turnId: string,
): Promise<{ result: "OK" | "ALREADY_CONFIRMED" }> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<{ result: "OK" | "ALREADY_CONFIRMED" }>(
    "select result from santa.confirm_delivery($1, $2, $3)",
    [actor.eventId, actor.participantId, turnId],
  );
  return { result: rows[0].result };
}

export async function revertDelivery(db: Db, actor: Actor, turnId: string, reason: string): Promise<void> {
  await assertOrganizerInDb(db, actor);
  const why = parseInput(reasonSchema, reason);
  await db.query("select santa.revert_delivery($1, $2, $3, $4)", [actor.eventId, actor.participantId, turnId, why]);
}

export async function finishEvent(db: Db, actor: Actor, force: boolean, reason: string | null): Promise<void> {
  await assertOrganizerInDb(db, actor);
  const why = force ? parseInput(reasonSchema, reason ?? "") : null;
  await db.query("select santa.finish_event($1, $2, $3, $4)", [actor.eventId, actor.participantId, force, why]);
}

// ---------------------------------------------------------------------------
// Estados de lectura
// ---------------------------------------------------------------------------
export interface CompletedTurn {
  turnId: string;
  receiver: PublicPerson;
  giver: PublicPerson;
  confirmedAt: Date;
  confirmedByName: string | null;
  mode: TurnMode;
}

export interface DeliveryStats {
  total: number;
  delivered: number;
  pending: number;
  percent: number;
}

interface ActiveTurnRow extends PersonRow {
  turn_id: string;
  mode: TurnMode;
  started_at: Date;
}

async function loadEventStatus(db: Db, eventId: string) {
  const { rows } = await db.query<{ name: string; year: number; status: EventStatus }>(
    "select name, year, status from santa.events where id = $1",
    [eventId],
  );
  if (!rows[0]) throw new AppError("EVENT_NOT_FOUND");
  return rows[0];
}

async function activeTurn(db: Db, eventId: string): Promise<ActiveTurnRow | null> {
  const { rows } = await db.query<ActiveTurnRow>(
    `select t.id as turn_id, t.mode, t.started_at,
            p.id, p.full_name, p.photo_path is not null as has_photo, p.photo_version
       from santa.delivery_turns t join santa.participants p on p.id = t.receiver_id
      where t.event_id = $1 and t.status = 'ACTIVE'`,
    [eventId],
  );
  return rows[0] ?? null;
}

async function completedTurns(db: Db, eventId: string): Promise<CompletedTurn[]> {
  const { rows } = await db.query<{
    turn_id: string;
    mode: TurnMode;
    confirmed_at: Date;
    confirmed_by_name: string | null;
    r_id: string;
    r_name: string;
    r_photo: boolean;
    r_version: number;
    g_id: string;
    g_name: string;
    g_photo: boolean;
    g_version: number;
  }>(
    `select t.id as turn_id, t.mode, t.confirmed_at, c.full_name as confirmed_by_name,
            r.id as r_id, r.full_name as r_name, r.photo_path is not null as r_photo, r.photo_version as r_version,
            g.id as g_id, g.full_name as g_name, g.photo_path is not null as g_photo, g.photo_version as g_version
       from santa.delivery_turns t
       join santa.participants r on r.id = t.receiver_id
       join santa.participants g on g.id = t.giver_id
       left join santa.participants c on c.id = t.confirmed_by
      where t.event_id = $1 and t.status = 'COMPLETED'
      order by t.confirmed_at desc`,
    [eventId],
  );
  return rows.map((r) => ({
    turnId: r.turn_id,
    mode: r.mode,
    confirmedAt: r.confirmed_at,
    confirmedByName: r.confirmed_by_name,
    receiver: { id: r.r_id, fullName: r.r_name, photoUrl: photoUrl(r.r_id, r.r_photo, r.r_version) },
    giver: { id: r.g_id, fullName: r.g_name, photoUrl: photoUrl(r.g_id, r.g_photo, r.g_version) },
  }));
}

function stats(total: number, delivered: number): DeliveryStats {
  return {
    total,
    delivered,
    pending: Math.max(total - delivered, 0),
    percent: total > 0 ? Math.round((delivered / total) * 100) : 0,
  };
}

/** Estado completo para el panel del organizador (no incluye al regalador del turno activo). */
export async function getOrganizerDeliveryState(db: Db, actor: Actor) {
  await assertOrganizerInDb(db, actor);
  const event = await loadEventStatus(db, actor.eventId);
  const [pending, active, completed] = await Promise.all([
    pendingReceivers(db, actor.eventId),
    activeTurn(db, actor.eventId),
    completedTurns(db, actor.eventId),
  ]);
  return {
    event,
    stats: stats(pending.length + completed.length, completed.length),
    activeTurn: active
      ? { turnId: active.turn_id, mode: active.mode, startedAt: active.started_at, receiver: person(active) }
      : null,
    pending: pending.map(person),
    completed,
  };
}

export interface PresentationState {
  event: { name: string; year: number; status: EventStatus };
  stats: DeliveryStats;
  drawProgress: { revealed: number; total: number } | null;
  activeTurn: { turnId: string; startedAt: string; receiver: PublicPerson } | null;
  /** Para la animación aleatoria: solo personas pendientes, sin ningún dato de asignación. */
  pending: PublicPerson[];
  /** Revelaciones YA confirmadas (el regalador solo aparece después de la entrega física). */
  completed: { turnId: string; confirmedAt: string; receiver: PublicPerson; giver: PublicPerson }[];
  mosaic: PublicPerson[];
}

/**
 * Estado PÚBLICO para la pantalla del televisor.
 * Nunca incluye el regalador de un turno no confirmado ni asignaciones de personas pendientes.
 */
export async function getPresentationState(db: Db, eventId: string): Promise<PresentationState> {
  const event = await loadEventStatus(db, eventId);
  const base: PresentationState = {
    event,
    stats: stats(0, 0),
    drawProgress: null,
    activeTurn: null,
    pending: [],
    completed: [],
    mosaic: [],
  };

  if (event.status === "DRAFT") return base;
  if (event.status === "DRAW_OPEN") {
    const { rows } = await db.query<{ total: number; revealed: number }>(
      `select count(*)::int as total, count(revealed_at)::int as revealed
         from santa.participants p
        where p.event_id = $1 and exists (select 1 from santa.assignments a where a.event_id = $1 and a.giver_id = p.id)`,
      [eventId],
    );
    return { ...base, drawProgress: rows[0] };
  }

  const [pending, active, completed] = await Promise.all([
    pendingReceivers(db, eventId),
    activeTurn(db, eventId),
    completedTurns(db, eventId),
  ]);
  const all = [...pending.map(person), ...completed.map((c) => c.receiver)].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "es"),
  );
  return {
    ...base,
    stats: stats(pending.length + completed.length, completed.length),
    activeTurn: active
      ? { turnId: active.turn_id, startedAt: active.started_at.toISOString(), receiver: person(active) }
      : null,
    pending: pending.map(person),
    completed: completed.slice(0, 12).map((c) => ({
      turnId: c.turnId,
      confirmedAt: c.confirmedAt.toISOString(),
      receiver: c.receiver,
      giver: c.giver,
    })),
    mosaic: all,
  };
}
