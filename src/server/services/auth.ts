import { createHash, randomBytes, randomInt } from "node:crypto";
import { cleanIdentifier, normalizeName } from "@/domain/normalize";
import type { EventStatus } from "@/domain/event-state";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import type { Actor, Role, Session } from "../types";

export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 días
export const PRESENTATION_TTL_SECONDS = 12 * 60 * 60; // 12 horas
export const PRESENTATION_CODE_TTL_SECONDS = 15 * 60; // 15 minutos

const LOGIN_WINDOW_SECONDS = 10 * 60;
/** Fallos permitidos por red (IP). Generoso: en la reunión familiar todos comparten el mismo Wi-Fi. */
const LOGIN_MAX_FAILURES_PER_IP = 40;
/** Fallos permitidos por nombre: frena que alguien adivine el número de otra persona. */
const LOGIN_MAX_FAILURES_PER_NAME = 6;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Nombres que se muestran en el selector de ingreso (solo nombres: ni números ni fotos). */
export async function listLoginNames(db: Db): Promise<{ event: { name: string; year: number } | null; names: string[] }> {
  const { rows: events } = await db.query<{ id: string; name: string; year: number }>(
    "select id, name, year from santa.events where is_current",
  );
  const event = events[0];
  if (!event) return { event: null, names: [] };
  const { rows } = await db.query<{ full_name: string }>(
    `select full_name from santa.participants
      where event_id = $1 and is_active`,
    [event.id],
  );
  const names = rows.map((r) => r.full_name).sort((a, b) => a.localeCompare(b, "es"));
  return { event: { name: event.name, year: event.year }, names };
}

export interface LoginInput {
  fullName: string;
  identifier: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  participantId: string;
  role: Role;
}

/**
 * Identificación por nombre completo + número identificador.
 * ADVERTENCIA: no es autenticación fuerte. Quien conozca ambos datos de otra persona puede suplantarla.
 */
export async function login(db: Db, input: LoginInput, clientKey: string): Promise<LoginResult> {
  const { rows: events } = await db.query<{ id: string }>("select id from santa.events where is_current");
  const event = events[0];
  if (!event) throw new AppError("NO_CURRENT_EVENT");

  const nameNorm = normalizeName(input.fullName);
  const identifier = cleanIdentifier(input.identifier);
  const ipKey = `login:ip:${hashKey(clientKey)}`;
  const nameKey = `login:name:${event.id}:${hashKey(nameNorm)}`;

  const { rows: limits } = await db.query<{ ip: boolean; name: boolean }>(
    "select santa.rate_limit_exceeded($1, $2, $3) as ip, santa.rate_limit_exceeded($4, $5, $3) as name",
    [ipKey, LOGIN_MAX_FAILURES_PER_IP, LOGIN_WINDOW_SECONDS, nameKey, LOGIN_MAX_FAILURES_PER_NAME],
  );
  if (limits[0]?.ip || limits[0]?.name) throw new AppError("RATE_LIMITED");

  const fail = async (code: "NAME_NOT_FOUND" | "WRONG_IDENTIFIER") => {
    await db.query("select santa.rate_limit_hit($1, $3), santa.rate_limit_hit($2, $3)", [
      ipKey,
      nameKey,
      LOGIN_WINDOW_SECONDS,
    ]);
    throw new AppError(code);
  };

  const { rows } = await db.query<{ id: string; identifier: string; role: Role; is_active: boolean }>(
    `select id, identifier, role, is_active from santa.participants
      where event_id = $1 and name_normalized = $2`,
    [event.id, nameNorm],
  );
  const participant = rows[0];
  if (!participant) return fail("NAME_NOT_FOUND");
  if (participant.identifier !== identifier) return fail("WRONG_IDENTIFIER");
  if (!participant.is_active) throw new AppError("PARTICIPANT_INACTIVE");

  await db.query("delete from santa.sessions where expires_at < now()");

  const token = newToken();
  const { rows: created } = await db.query<{ expires_at: Date }>(
    `insert into santa.sessions (token_hash, kind, event_id, participant_id, expires_at)
     values ($1, 'PARTICIPANT', $2, $3, now() + make_interval(secs => $4))
     returning expires_at`,
    [hashToken(token), event.id, participant.id, SESSION_TTL_SECONDS],
  );
  return { token, expiresAt: created[0].expires_at, participantId: participant.id, role: participant.role };
}

interface SessionRow {
  id: string;
  kind: "PARTICIPANT" | "PRESENTATION";
  expires_at: Date;
  event_id: string;
  event_name: string;
  event_year: number;
  event_status: EventStatus;
  draw_locked: boolean;
  is_current: boolean;
  participant_id: string | null;
  full_name: string | null;
  identifier: string | null;
  role: Role | null;
  is_active: boolean | null;
  has_photo: boolean | null;
  photo_version: number | null;
  revealed_at: Date | null;
}

/**
 * Resuelve una sesión a partir del token de la cookie. El rol se lee SIEMPRE de la base de datos.
 * Devuelve null si el token no existe, expiró, el evento ya no es el actual o el participante fue desactivado.
 */
export async function getSessionByToken(db: Db, token: string | undefined | null): Promise<Session | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const { rows } = await db.query<SessionRow>(
    `select s.id, s.kind, s.expires_at,
            e.id as event_id, e.name as event_name, e.year as event_year, e.status as event_status,
            e.draw_locked, e.is_current,
            p.id as participant_id, p.full_name, p.identifier, p.role, p.is_active,
            (p.photo_path is not null) as has_photo, p.photo_version, p.revealed_at
       from santa.sessions s
       join santa.events e on e.id = s.event_id
       left join santa.participants p on p.id = s.participant_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row || !row.is_current) return null;
  if (row.kind === "PARTICIPANT" && (!row.participant_id || !row.is_active)) return null;

  return {
    id: row.id,
    kind: row.kind,
    expiresAt: row.expires_at,
    event: {
      id: row.event_id,
      name: row.event_name,
      year: row.event_year,
      status: row.event_status,
      drawLocked: row.draw_locked,
    },
    participant:
      row.kind === "PARTICIPANT" && row.participant_id
        ? {
            id: row.participant_id,
            fullName: row.full_name!,
            identifier: row.identifier!,
            role: row.role!,
            hasPhoto: !!row.has_photo,
            photoVersion: row.photo_version ?? 0,
            revealedAt: row.revealed_at,
          }
        : null,
  };
}

export async function logout(db: Db, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.query("delete from santa.sessions where token_hash = $1", [hashToken(token)]);
}

export function actorFromSession(session: Session): Actor {
  if (session.kind !== "PARTICIPANT" || !session.participant) throw new AppError("FORBIDDEN");
  return { participantId: session.participant.id, eventId: session.event.id, role: session.participant.role };
}

export function assertOrganizer(actor: Actor): void {
  if (actor.role !== "ORGANIZER") throw new AppError("FORBIDDEN");
}

/** Revalida contra la BD que el actor sigue siendo organizador activo del evento. */
export async function assertOrganizerInDb(db: Db, actor: Actor): Promise<void> {
  assertOrganizer(actor);
  const { rows } = await db.query<{ ok: boolean }>(
    `select exists (select 1 from santa.participants
                     where id = $1 and event_id = $2 and role = 'ORGANIZER' and is_active) as ok`,
    [actor.participantId, actor.eventId],
  );
  if (!rows[0]?.ok) throw new AppError("FORBIDDEN");
}

// ---------------------------------------------------------------------------
// Pantalla de presentación (TV)
// ---------------------------------------------------------------------------
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I para leerlo fácil en el TV

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function createPresentationCode(db: Db, actor: Actor): Promise<{ code: string; expiresAt: Date }> {
  await assertOrganizerInDb(db, actor);
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  await db.query("delete from santa.presentation_codes where expires_at < now()");
  const { rows } = await db.query<{ expires_at: Date }>(
    `insert into santa.presentation_codes (code_hash, event_id, created_by, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4)) returning expires_at`,
    [hashToken(code), actor.eventId, actor.participantId, PRESENTATION_CODE_TTL_SECONDS],
  );
  await db.query(
    `insert into santa.audit_logs (event_id, actor_id, actor_name, action, scope)
     select $1, $2, full_name, 'PRESENTATION_CODE_CREATED', 'EVENT' from santa.participants where id = $2`,
    [actor.eventId, actor.participantId],
  );
  return { code, expiresAt: rows[0].expires_at };
}

/** Canjea un código de un solo uso por una sesión de presentación de solo lectura. */
export async function redeemPresentationCode(
  db: Db,
  rawCode: string,
  clientKey: string,
): Promise<{ token: string; expiresAt: Date }> {
  const key = `tv:ip:${hashKey(clientKey)}`;
  const { rows: lim } = await db.query<{ exceeded: boolean }>(
    "select santa.rate_limit_exceeded($1, 15, 600) as exceeded",
    [key],
  );
  if (lim[0]?.exceeded) throw new AppError("RATE_LIMITED");

  const code = normalizeCode(rawCode);
  const { rows } = await db.query<{ event_id: string }>(
    `delete from santa.presentation_codes c
      using santa.events e
      where c.code_hash = $1 and c.expires_at > now() and e.id = c.event_id and e.is_current
      returning c.event_id`,
    [hashToken(code)],
  );
  if (!rows[0]) {
    await db.query("select santa.rate_limit_hit($1, 600)", [key]);
    throw new AppError("INVALID_CODE");
  }
  const token = newToken();
  const { rows: created } = await db.query<{ expires_at: Date }>(
    `insert into santa.sessions (token_hash, kind, event_id, expires_at)
     values ($1, 'PRESENTATION', $2, now() + make_interval(secs => $3)) returning expires_at`,
    [hashToken(token), rows[0].event_id, PRESENTATION_TTL_SECONDS],
  );
  return { token, expiresAt: created[0].expires_at };
}
