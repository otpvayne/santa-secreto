import { randomUUID } from "node:crypto";
import { cleanGiftWishes } from "@/domain/gift-wishes";
import { normalizeName } from "@/domain/normalize";
import { participantsEditable, type EventStatus } from "@/domain/event-state";
import {
  parseInput,
  participantCreateSchema,
  participantUpdateSchema,
} from "@/lib/validation/schemas";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import { processPhoto } from "../images";
import { validateImport, type ImportPreview, type ImportRow, type RawCell } from "../import/spreadsheet";
import { analyzeGiftWishes, selectApplicable, type WishSelection, type WishesPreview } from "../import/gift-wishes";
import type { PhotoStorage } from "../storage";
import type { Actor, Role } from "../types";
import { photoUrl } from "../types";
import { assertOrganizerInDb } from "./auth";
import { audit } from "./audit";

export interface ParticipantRow {
  id: string;
  fullName: string;
  identifier: string;
  role: Role;
  isActive: boolean;
  photoUrl: string | null;
  revealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Sugerencias de regalo (texto libre). Solo se envía a organizadores o al amigo secreto autorizado. */
  giftWishes: string | null;
}

interface DbParticipant {
  id: string;
  full_name: string;
  identifier: string;
  role: Role;
  is_active: boolean;
  photo_path: string | null;
  photo_version: number;
  revealed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  gift_wishes: string | null;
}

const PARTICIPANT_COLUMNS = `id, full_name, identifier, role, is_active, photo_path, photo_version,
                             revealed_at, created_at, updated_at, gift_wishes`;
const SELECT_PARTICIPANT = `select ${PARTICIPANT_COLUMNS} from santa.participants`;

function toRow(p: DbParticipant): ParticipantRow {
  return {
    id: p.id,
    fullName: p.full_name,
    identifier: p.identifier,
    role: p.role,
    isActive: p.is_active,
    photoUrl: photoUrl(p.id, !!p.photo_path, p.photo_version),
    revealedAt: p.revealed_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    giftWishes: cleanGiftWishes(p.gift_wishes),
  };
}

/** Lista para el panel administrativo. No incluye asignaciones. */
export async function listParticipants(db: Db, actor: Actor): Promise<ParticipantRow[]> {
  await assertOrganizerInDb(db, actor);
  const { rows } = await db.query<DbParticipant>(`${SELECT_PARTICIPANT} where event_id = $1`, [actor.eventId]);
  return rows.map(toRow).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

async function getEventStatus(db: Db, eventId: string): Promise<EventStatus> {
  const { rows } = await db.query<{ status: EventStatus }>("select status from santa.events where id = $1", [eventId]);
  if (!rows[0]) throw new AppError("EVENT_NOT_FOUND");
  return rows[0].status;
}

async function getOwnParticipant(db: Db, actor: Actor, id: string): Promise<DbParticipant> {
  const { rows } = await db.query<DbParticipant>(`${SELECT_PARTICIPANT} where id = $1 and event_id = $2`, [
    id,
    actor.eventId,
  ]);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Ese participante no existe en este evento.");
  return rows[0];
}

export async function createParticipant(db: Db, actor: Actor, input: unknown): Promise<ParticipantRow> {
  await assertOrganizerInDb(db, actor);
  const data = parseInput(participantCreateSchema, input);
  const status = await getEventStatus(db, actor.eventId);
  if (!participantsEditable(status)) throw new AppError("PARTICIPANTS_LOCKED");

  const { rows } = await db.query<DbParticipant>(
    `insert into santa.participants (event_id, full_name, name_normalized, identifier, role, is_active, gift_wishes)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${PARTICIPANT_COLUMNS}`,
    [actor.eventId, data.fullName, normalizeName(data.fullName), data.identifier, data.role, data.isActive, data.giftWishes ?? null],
  );
  await audit(db, actor, "PARTICIPANT_CREATED", `PARTICIPANT:${rows[0].id}`, {
    full_name: data.fullName,
    identifier: data.identifier,
    role: data.role,
    ...(data.giftWishes ? { gift_wishes: "added" } : {}),
  });
  return toRow(rows[0]);
}

/**
 * Actualiza un participante. Después de generar el sorteo solo se permiten correcciones seguras
 * (nombre, rol, fotografía, sugerencias de regalo); el identificador y el estado activo quedan bloqueados.
 * Cambiar las sugerencias NUNCA toca asignaciones, tarjetas, revelaciones ni el estado del evento.
 */
export async function updateParticipant(db: Db, actor: Actor, input: unknown): Promise<ParticipantRow> {
  await assertOrganizerInDb(db, actor);
  const data = parseInput(participantUpdateSchema, input);
  const current = await getOwnParticipant(db, actor, data.id);
  const status = await getEventStatus(db, actor.eventId);

  if (status === "ARCHIVED") throw new AppError("EVENT_ARCHIVED");
  const changesLockedFields =
    (data.identifier !== undefined && data.identifier !== current.identifier) ||
    (data.isActive !== undefined && data.isActive !== current.is_active);
  if (changesLockedFields && !participantsEditable(status)) throw new AppError("PARTICIPANTS_LOCKED");

  const fullName = data.fullName ?? current.full_name;
  const { rows } = await db.query<DbParticipant>(
    `update santa.participants
        set full_name = $3, name_normalized = $4, identifier = $5, role = $6, is_active = $7,
            gift_wishes = case when $8::boolean then $9::text else gift_wishes end
      where id = $1 and event_id = $2
      returning ${PARTICIPANT_COLUMNS}`,
    [
      data.id,
      actor.eventId,
      fullName,
      normalizeName(fullName),
      data.identifier ?? current.identifier,
      data.role ?? current.role,
      data.isActive ?? current.is_active,
      data.giftWishes !== undefined,
      data.giftWishes ?? null,
    ],
  );
  const changes: Record<string, unknown> = {};
  if (fullName !== current.full_name) changes.full_name = { from: current.full_name, to: fullName };
  if (data.identifier !== undefined && data.identifier !== current.identifier)
    changes.identifier = { from: current.identifier, to: data.identifier };
  if (data.role !== undefined && data.role !== current.role) changes.role = { from: current.role, to: data.role };
  if (data.isActive !== undefined && data.isActive !== current.is_active)
    changes.is_active = { from: current.is_active, to: data.isActive };
  const currentWishes = cleanGiftWishes(current.gift_wishes);
  if (data.giftWishes !== undefined && data.giftWishes !== currentWishes)
    changes.gift_wishes = data.giftWishes === null ? "removed" : currentWishes ? "updated" : "added";
  await audit(db, actor, "PARTICIPANT_UPDATED", `PARTICIPANT:${data.id}`, changes);
  return toRow(rows[0]);
}

export async function deleteParticipant(db: Db, storage: PhotoStorage | null, actor: Actor, id: string) {
  await assertOrganizerInDb(db, actor);
  const current = await getOwnParticipant(db, actor, id);
  const status = await getEventStatus(db, actor.eventId);
  if (!participantsEditable(status)) throw new AppError("PARTICIPANTS_LOCKED");
  if (current.id === actor.participantId) {
    throw new AppError("INVALID_OPERATION", "No puedes eliminarte a ti mismo. Pide a otro organizador que lo haga.");
  }

  await db.query("delete from santa.participants where id = $1 and event_id = $2", [id, actor.eventId]);
  await audit(db, actor, "PARTICIPANT_DELETED", `PARTICIPANT:${id}`, {
    full_name: current.full_name,
    identifier: current.identifier,
  });
  if (current.photo_path && storage) await removeIfUnreferenced(db, storage, current.photo_path);
}

async function removeIfUnreferenced(db: Db, storage: PhotoStorage, objectPath: string) {
  const { rows } = await db.query<{ used: boolean }>(
    "select exists (select 1 from santa.participants where photo_path = $1) as used",
    [objectPath],
  );
  if (!rows[0]?.used) await storage.remove([objectPath]);
}

// ---------------------------------------------------------------------------
// Fotografías (solo organizadores)
// ---------------------------------------------------------------------------
export async function setParticipantPhoto(
  db: Db,
  storage: PhotoStorage,
  actor: Actor,
  participantId: string,
  file: Buffer,
): Promise<ParticipantRow> {
  await assertOrganizerInDb(db, actor);
  const current = await getOwnParticipant(db, actor, participantId);
  const status = await getEventStatus(db, actor.eventId);
  if (status === "ARCHIVED") throw new AppError("EVENT_ARCHIVED");

  const webp = await processPhoto(file);
  const objectPath = `${actor.eventId}/${participantId}/${randomUUID()}.webp`;
  await storage.put(objectPath, webp, "image/webp");

  const { rows } = await db.query<DbParticipant>(
    `update santa.participants set photo_path = $3, photo_version = photo_version + 1
      where id = $1 and event_id = $2
      returning ${PARTICIPANT_COLUMNS}`,
    [participantId, actor.eventId, objectPath],
  );
  await audit(db, actor, "PHOTO_UPDATED", `PARTICIPANT:${participantId}`, { bytes: webp.length });
  if (current.photo_path) await removeIfUnreferenced(db, storage, current.photo_path);
  return toRow(rows[0]);
}

export async function removeParticipantPhoto(
  db: Db,
  storage: PhotoStorage,
  actor: Actor,
  participantId: string,
): Promise<void> {
  await assertOrganizerInDb(db, actor);
  const current = await getOwnParticipant(db, actor, participantId);
  if (!current.photo_path) return;
  await db.query(
    `update santa.participants set photo_path = null, photo_version = photo_version + 1
      where id = $1 and event_id = $2`,
    [participantId, actor.eventId],
  );
  await audit(db, actor, "PHOTO_REMOVED", `PARTICIPANT:${participantId}`);
  await removeIfUnreferenced(db, storage, current.photo_path);
}

/** Lee la foto de un participante. La autorización se decide ANTES de llamar a esta función. */
export async function readParticipantPhoto(
  db: Db,
  storage: PhotoStorage,
  eventId: string,
  participantId: string,
): Promise<Buffer | null> {
  const { rows } = await db.query<{ photo_path: string | null }>(
    "select photo_path from santa.participants where id = $1 and event_id = $2",
    [participantId, eventId],
  );
  const objectPath = rows[0]?.photo_path;
  if (!objectPath) return null;
  return storage.get(objectPath);
}

// ---------------------------------------------------------------------------
// Importación masiva
// ---------------------------------------------------------------------------
async function existingSets(db: Db, eventId: string) {
  const { rows } = await db.query<{ name_normalized: string; identifier: string }>(
    "select name_normalized, identifier from santa.participants where event_id = $1",
    [eventId],
  );
  return {
    names: new Set(rows.map((r) => r.name_normalized)),
    identifiers: new Set(rows.map((r) => r.identifier)),
  };
}

/** Vista previa: valida todo y NO escribe nada. */
export async function previewImport(db: Db, actor: Actor, table: RawCell[][]): Promise<ImportPreview> {
  await assertOrganizerInDb(db, actor);
  return validateImport(table, await existingSets(db, actor.eventId));
}

/**
 * Confirma la importación: vuelve a validar en el servidor (no se confía en la vista previa del navegador)
 * y la inserta de forma atómica. Si una sola fila falla, no se importa ninguna.
 */
export async function confirmImport(db: Db, actor: Actor, table: RawCell[][]): Promise<number> {
  await assertOrganizerInDb(db, actor);
  const status = await getEventStatus(db, actor.eventId);
  if (!participantsEditable(status)) throw new AppError("PARTICIPANTS_LOCKED");

  const preview = validateImport(table, await existingSets(db, actor.eventId));
  if (preview.fileErrors.length > 0) throw new AppError("INVALID_FILE", preview.fileErrors[0]);
  if (preview.errorCount > 0) {
    throw new AppError("INVALID_INPUT", `Hay ${preview.errorCount} fila(s) con errores. Corrígelas antes de importar.`);
  }
  if (preview.rows.length === 0) throw new AppError("INVALID_FILE", "El archivo no tiene filas para importar.");

  const payload = preview.rows.map((r: ImportRow) => ({
    full_name: r.fullName,
    name_normalized: r.nameNormalized,
    identifier: r.identifier,
    role: r.role,
  }));
  const { rows } = await db.query<{ count: number }>(
    "select santa.import_participants($1, $2, $3::jsonb) as count",
    [actor.eventId, actor.participantId, JSON.stringify(payload)],
  );
  return Number(rows[0].count);
}

// ---------------------------------------------------------------------------
// Sugerencias de regalo desde Excel (solo participantes EXISTENTES; nunca crea ni borra)
// ---------------------------------------------------------------------------
async function wishesParticipants(db: Db, eventId: string) {
  const { rows } = await db.query<{ id: string; full_name: string; identifier: string; gift_wishes: string | null }>(
    "select id, full_name, identifier, gift_wishes from santa.participants where event_id = $1",
    [eventId],
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name, identifier: r.identifier, giftWishes: r.gift_wishes }));
}

/** Vista previa de la actualización de sugerencias. No escribe nada. */
export async function previewGiftWishesImport(
  db: Db,
  actor: Actor,
  table: RawCell[][],
  wishesColumn: number | null = null,
): Promise<WishesPreview> {
  await assertOrganizerInDb(db, actor);
  return analyzeGiftWishes(table, await wishesParticipants(db, actor.eventId), { wishesColumn });
}

/**
 * Aplica SOLO las filas elegidas por el organizador. Se vuelve a analizar el archivo en el servidor
 * (no se confía en la vista previa del navegador) y cada fila debe apuntar al mismo participante que se revisó.
 * La escritura es atómica (santa.update_gift_wishes) e idempotente (los textos idénticos no se reescriben).
 */
export async function confirmGiftWishesImport(
  db: Db,
  actor: Actor,
  table: RawCell[][],
  wishesColumn: number | null,
  selection: WishSelection[],
): Promise<{ updated: number; selected: number }> {
  await assertOrganizerInDb(db, actor);
  const status = await getEventStatus(db, actor.eventId);
  if (status === "ARCHIVED") throw new AppError("EVENT_ARCHIVED");
  if (selection.length === 0) throw new AppError("INVALID_INPUT", "Marca al menos una fila para actualizar.");

  const preview = analyzeGiftWishes(table, await wishesParticipants(db, actor.eventId), { wishesColumn });
  if (preview.fileErrors.length > 0) throw new AppError("INVALID_FILE", preview.fileErrors[0]);
  if (!preview.wishesColumnResolved) throw new AppError("INVALID_INPUT", "Elige la columna de sugerencias de regalo.");

  let payload: { id: string; gift_wishes: string }[];
  try {
    payload = selectApplicable(preview, selection);
  } catch {
    throw new AppError(
      "INVALID_INPUT",
      "Los datos cambiaron desde la vista previa. Vuelve a analizar el archivo antes de confirmar.",
    );
  }
  const { rows } = await db.query<{ count: number }>("select santa.update_gift_wishes($1, $2, $3::jsonb) as count", [
    actor.eventId,
    actor.participantId,
    JSON.stringify(payload),
  ]);
  return { updated: Number(rows[0].count), selected: payload.length };
}
