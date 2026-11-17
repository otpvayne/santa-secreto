import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { startDraw } from "@/server/services/draw";
import { finishEvent, startDelivery } from "@/server/services/delivery";
import {
  activateEvent,
  archiveEvent,
  createEvent,
  listEvents,
  purgeEvent,
  updateEvent,
} from "@/server/services/events";
import { login } from "@/server/services/auth";
import { createTestDb, eventStatus, expectAppError, getAssignments, revealAll, seedEvent } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe("múltiples eventos", () => {
  it("crea un evento nuevo copiando participantes sin reutilizar asignaciones", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    const newId = await createEvent(db, s.organizer, { name: "Navidad 2027", year: 2027 }, true);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from santa.participants where event_id = $1",
      [newId],
    );
    expect(rows[0].n).toBe(4);
    expect(await getAssignments(db, newId)).toEqual([]);
    expect(await eventStatus(db, newId)).toBe("DRAFT");
    expect((await listEvents(db, s.organizer)).map((e) => e.name)).toContain("Navidad 2027");
  });

  it("sin copia, el creador queda como único organizador", async () => {
    const s = await seedEvent(db, 3);
    const newId = await createEvent(db, s.organizer, { name: "Otro", year: 2027 }, false);
    const { rows } = await db.query<{ role: string }>("select role from santa.participants where event_id = $1", [newId]);
    expect(rows).toEqual([{ role: "ORGANIZER" }]);
  });

  it("no se puede cambiar de evento mientras el actual está en curso", async () => {
    const s = await seedEvent(db, 3);
    const newId = await createEvent(db, s.organizer, { name: "2027", year: 2027 }, true);
    await startDraw(db, s.organizer);
    await expectAppError(activateEvent(db, s.organizer, newId), "EVENT_IN_PROGRESS");
  });

  it("activar otro evento cierra todas las sesiones", async () => {
    const s = await seedEvent(db, 3);
    await login(db, { fullName: "Persona 001", identifier: "01" }, "ip");
    const newId = await createEvent(db, s.organizer, { name: "2027", year: 2027 }, true);
    await activateEvent(db, s.organizer, newId);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from santa.sessions");
    expect(rows[0].n).toBe(0);
    const { rows: cur } = await db.query<{ id: string }>("select id from santa.events where is_current");
    expect(cur).toEqual([{ id: newId }]);
  });

  it("los eventos archivados no se modifican y se pueden purgar", async () => {
    const s = await seedEvent(db, 3, 2);
    await startDraw(db, s.organizer);
    await revealAll(db, s);
    await startDelivery(db, s.organizer);
    await finishEvent(db, s.organizer, true, "prueba");
    await archiveEvent(db, s.organizer);
    await expectAppError(updateEvent(db, s.organizer, { name: "x", year: 2026 }), "EVENT_ARCHIVED");
    await expectAppError(
      db.query("update santa.participants set full_name = 'Cambio' where id = $1", [s.ids[2]]),
      "EVENT_ARCHIVED",
    );
    // No se puede purgar el evento actual.
    await expectAppError(purgeEvent(db, null, s.organizer, s.eventId, "ALL"), "PURGE_NOT_ALLOWED");

    const newId = await createEvent(db, s.organizer, { name: "2027", year: 2027 }, true);
    await activateEvent(db, s.organizer, newId);
    const { rows: p } = await db.query<{ id: string }>(
      "select id from santa.participants where event_id = $1 and role = 'ORGANIZER' limit 1",
      [newId],
    );
    const newOrganizer = { participantId: p[0].id, eventId: newId, role: "ORGANIZER" as const };
    await purgeEvent(db, null, newOrganizer, s.eventId, "ALL");
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from santa.events where id = $1", [s.eventId]);
    expect(rows[0].n).toBe(0);
    // La auditoría se conserva.
    const { rows: logs } = await db.query<{ n: number }>(
      "select count(*)::int as n from santa.audit_logs where action = 'EVENT_PURGED'",
    );
    expect(logs[0].n).toBe(1);
  });
});
