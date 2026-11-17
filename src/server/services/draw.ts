import { cryptoRandomInt, generateDerangement, validateDraw, type RandomInt } from "@/domain/derangement";
import type { EventStatus } from "@/domain/event-state";
import { cleanGiftWishes } from "@/domain/gift-wishes";
import { reasonSchema, parseInput } from "@/lib/validation/schemas";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import type { Actor, PublicPerson, Role } from "../types";
import { photoUrl } from "../types";
import { assertOrganizerInDb } from "./auth";

/**
 * Inicia el sorteo: genera un derangement con aleatoriedad criptográfica, lo valida y lo guarda
 * en una única transacción (santa.start_draw vuelve a validarlo todo en la base de datos).
 */
export async function startDraw(db: Db, actor: Actor, random: RandomInt = cryptoRandomInt): Promise<number> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<{ id: string }>(
    "select id from santa.participants where event_id = $1 and is_active order by id",
    [actor.eventId],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length < 2) throw new AppError("NOT_ENOUGH_PARTICIPANTS");

  const pairs = generateDerangement(ids, random);
  if (validateDraw(ids, pairs).length > 0) throw new AppError("INVALID_DRAW");

  const { rows: res } = await db.query<{ n: number }>("select santa.start_draw($1, $2, $3::uuid[], $4::uuid[]) as n", [
    actor.eventId,
    actor.participantId,
    pairs.map((p) => p.giver),
    pairs.map((p) => p.receiver),
  ]);
  return Number(res[0].n);
}

export type ClaimOutcome =
  | { status: "OK" | "ALREADY_REVEALED"; cardNumber: number; receiver: PublicPerson }
  | {
      status:
        | "CARD_TAKEN"
        | "CARD_NOT_FOUND"
        | "DRAW_NOT_STARTED"
        | "DRAW_CLOSED"
        | "DRAW_LOCKED"
        | "NOT_IN_DRAW";
    };

/**
 * Reclama una tarjeta para el participante de la sesión y devuelve SOLO su propio amigo secreto.
 * El participante sale siempre de la sesión: nunca de un parámetro enviado por el navegador.
 */
export async function claimCard(db: Db, actor: Actor, cardNumber: number): Promise<ClaimOutcome> {
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > 9999) throw new AppError("CARD_NOT_FOUND");
  const { rows } = await db.query<{ result: string; card_number: number | null; receiver_id: string | null }>(
    "select * from santa.claim_card($1, $2, $3)",
    [actor.eventId, actor.participantId, cardNumber],
  );
  const r = rows[0];
  if ((r.result === "OK" || r.result === "ALREADY_REVEALED") && r.receiver_id && r.card_number) {
    const receiver = await getPerson(db, actor.eventId, r.receiver_id);
    return { status: r.result, cardNumber: r.card_number, receiver };
  }
  return { status: r.result as Exclude<ClaimOutcome["status"], "OK" | "ALREADY_REVEALED"> };
}

async function getPerson(db: Db, eventId: string, id: string): Promise<PublicPerson> {
  const { rows } = await db.query<{ id: string; full_name: string; has_photo: boolean; photo_version: number }>(
    `select id, full_name, photo_path is not null as has_photo, photo_version
       from santa.participants where id = $1 and event_id = $2`,
    [id, eventId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND");
  return { id: rows[0].id, fullName: rows[0].full_name, photoUrl: photoUrl(rows[0].id, rows[0].has_photo, rows[0].photo_version) };
}

/** Resultado propio (para accesos posteriores). Null si todavía no ha revelado. */
export async function getMyResult(
  db: Db,
  actor: Actor,
): Promise<{ cardNumber: number; totalCards: number; revealedAt: Date; receiver: PublicPerson } | null> {
  const { rows } = await db.query<{
    card_number: number;
    revealed_at: Date;
    receiver_id: string;
    total: number;
  }>(
    `select c.card_number, p.revealed_at, a.receiver_id,
            (select count(*)::int from santa.draw_cards where event_id = p.event_id) as total
       from santa.participants p
       join santa.assignments a on a.event_id = p.event_id and a.giver_id = p.id
       join santa.draw_cards c on c.event_id = p.event_id and c.claimed_by = p.id
      where p.id = $1 and p.event_id = $2 and p.revealed_at is not null`,
    [actor.participantId, actor.eventId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    cardNumber: r.card_number,
    totalCards: r.total,
    revealedAt: r.revealed_at,
    receiver: await getPerson(db, actor.eventId, r.receiver_id),
  };
}

/**
 * Tarjeta propia SIN el destinatario. Es lo único que se renderiza en el HTML inicial:
 * el resultado aparece cubierto hasta que la persona pulsa "Mostrar".
 */
export async function getMyCard(db: Db, actor: Actor): Promise<{ cardNumber: number; totalCards: number } | null> {
  const { rows } = await db.query<{ card_number: number; total: number }>(
    `select c.card_number,
            (select count(*)::int from santa.draw_cards where event_id = p.event_id) as total
       from santa.participants p
       join santa.draw_cards c on c.event_id = p.event_id and c.claimed_by = p.id
      where p.id = $1 and p.event_id = $2 and p.revealed_at is not null`,
    [actor.participantId, actor.eventId],
  );
  const r = rows[0];
  return r ? { cardNumber: r.card_number, totalCards: r.total } : null;
}

export interface SecretFriendDetails {
  receiver: PublicPerson;
  /** Sugerencias ACTUALES del destinatario (no se copian en la asignación). null = sin sugerencias. */
  giftWishes: string | null;
}

/**
 * Amigo secreto del participante de la sesión (y solo de él): foto, nombre y sugerencias vigentes.
 * Se pide únicamente cuando la persona pulsa "Mostrar". El giver sale SIEMPRE del actor (sesión).
 */
export async function getMySecretFriend(db: Db, actor: Actor): Promise<SecretFriendDetails | null> {
  const { rows } = await db.query<{
    id: string;
    full_name: string;
    has_photo: boolean;
    photo_version: number;
    gift_wishes: string | null;
  }>(
    `select r.id, r.full_name, r.photo_path is not null as has_photo, r.photo_version, r.gift_wishes
       from santa.participants g
       join santa.draw_cards c on c.event_id = g.event_id and c.claimed_by = g.id
       join santa.assignments a on a.event_id = g.event_id and a.giver_id = g.id
       join santa.participants r on r.id = a.receiver_id and r.event_id = a.event_id
      where g.id = $1 and g.event_id = $2 and g.revealed_at is not null`,
    [actor.participantId, actor.eventId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    receiver: { id: r.id, fullName: r.full_name, photoUrl: photoUrl(r.id, r.has_photo, r.photo_version) },
    giftWishes: cleanGiftWishes(r.gift_wishes),
  };
}

/** Estado público de las tarjetas: números ocupados, sin decir quién los tomó. */
export async function getCardsState(
  db: Db,
  eventId: string,
): Promise<{ status: EventStatus; drawLocked: boolean; total: number; taken: number[] }> {
  const { rows: ev } = await db.query<{ status: EventStatus; draw_locked: boolean }>(
    "select status, draw_locked from santa.events where id = $1",
    [eventId],
  );
  if (!ev[0]) throw new AppError("EVENT_NOT_FOUND");
  const { rows } = await db.query<{ card_number: number; taken: boolean }>(
    "select card_number, claimed_by is not null as taken from santa.draw_cards where event_id = $1 order by card_number",
    [eventId],
  );
  return {
    status: ev[0].status,
    drawLocked: ev[0].draw_locked,
    total: rows.length,
    taken: rows.filter((r) => r.taken).map((r) => r.card_number),
  };
}

export interface DrawProgress {
  status: EventStatus;
  drawLocked: boolean;
  activeParticipants: number;
  revealed: number;
  pending: number;
  percent: number;
  cardsTotal: number;
  cardsUsed: number;
  cardsAvailable: number;
  organizers: number;
}

export async function getDrawProgress(db: Db, eventId: string): Promise<DrawProgress> {
  const { rows } = await db.query<{
    status: EventStatus;
    draw_locked: boolean;
    active: number;
    revealed: number;
    organizers: number;
    cards_total: number;
    cards_used: number;
  }>(
    `select e.status, e.draw_locked,
            (select count(*)::int from santa.participants where event_id = e.id and is_active) as active,
            (select count(*)::int from santa.participants where event_id = e.id and is_active and revealed_at is not null) as revealed,
            (select count(*)::int from santa.participants where event_id = e.id and is_active and role = 'ORGANIZER') as organizers,
            (select count(*)::int from santa.draw_cards where event_id = e.id) as cards_total,
            (select count(*)::int from santa.draw_cards where event_id = e.id and claimed_by is not null) as cards_used
       from santa.events e where e.id = $1`,
    [eventId],
  );
  const r = rows[0];
  if (!r) throw new AppError("EVENT_NOT_FOUND");
  const inDraw = r.status === "DRAFT" ? 0 : r.cards_total;
  const revealed = r.status === "DRAFT" ? 0 : r.revealed;
  const base = r.status === "DRAFT" ? r.active : inDraw;
  return {
    status: r.status,
    drawLocked: r.draw_locked,
    activeParticipants: r.active,
    revealed,
    pending: Math.max(base - revealed, 0),
    percent: base > 0 ? Math.round((revealed / base) * 100) : 0,
    cardsTotal: r.cards_total,
    cardsUsed: r.cards_used,
    cardsAvailable: r.cards_total - r.cards_used,
    organizers: r.organizers,
  };
}

export async function resetDraw(db: Db, actor: Actor, reason: string): Promise<void> {
  await assertOrganizerInDb(db, actor);
  const why = parseInput(reasonSchema, reason);
  await db.query("select santa.reset_draw($1, $2, $3)", [actor.eventId, actor.participantId, why]);
}

export async function setDrawLocked(db: Db, actor: Actor, locked: boolean): Promise<void> {
  await assertOrganizerInDb(db, actor);
  await db.query("select santa.set_draw_locked($1, $2, $3)", [actor.eventId, actor.participantId, locked]);
}

export interface EmergencyRow {
  giverId: string;
  giverName: string;
  giverIdentifier: string;
  receiverId: string;
  receiverName: string;
  receiverIdentifier: string;
  revealed: boolean;
}

/** Consulta de emergencia. Queda registrada en auditoría dentro de la misma transacción. */
export async function emergencyAssignments(
  db: Db,
  actor: Actor,
  giverId: string | null,
  reason: string,
): Promise<EmergencyRow[]> {
  await assertOrganizerInDb(db, actor);
  const why = parseInput(reasonSchema, reason);
  const { rows } = await db.query<{
    giver_id: string;
    giver_name: string;
    giver_identifier: string;
    receiver_id: string;
    receiver_name: string;
    receiver_identifier: string;
    revealed: boolean;
  }>("select * from santa.emergency_assignments($1, $2, $3, $4)", [
    actor.eventId,
    actor.participantId,
    giverId,
    why,
  ]);
  return rows.map((r) => ({
    giverId: r.giver_id,
    giverName: r.giver_name,
    giverIdentifier: r.giver_identifier,
    receiverId: r.receiver_id,
    receiverName: r.receiver_name,
    receiverIdentifier: r.receiver_identifier,
    revealed: r.revealed,
  }));
}

export interface TrackingRow {
  fullName: string;
  identifier: string;
  role: Role;
  isActive: boolean;
  status: "PENDIENTE" | "COMPLETADO";
  revealedAt: Date | null;
}

/** Exportación de seguimiento. NO incluye asignaciones secretas. */
export async function exportTracking(db: Db, actor: Actor): Promise<TrackingRow[]> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<{
    full_name: string;
    identifier: string;
    role: Role;
    is_active: boolean;
    revealed_at: Date | null;
  }>(
    "select full_name, identifier, role, is_active, revealed_at from santa.participants where event_id = $1",
    [actor.eventId],
  );
  return rows
    .map((r) => ({
      fullName: r.full_name,
      identifier: r.identifier,
      role: r.role,
      isActive: r.is_active,
      status: (r.revealed_at ? "COMPLETADO" : "PENDIENTE") as TrackingRow["status"],
      revealedAt: r.revealed_at,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}
