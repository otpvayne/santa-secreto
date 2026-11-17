import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import {
  claimCard,
  emergencyAssignments,
  exportTracking,
  getCardsState,
  getDrawProgress,
  getMyResult,
  resetDraw,
  setDrawLocked,
  startDraw,
} from "@/server/services/draw";
import { createTestDb, eventStatus, expectAppError, getAssignments, revealAll, seedEvent } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

function checkPermutation(ids: string[], rows: { giver_id: string; receiver_id: string }[]) {
  expect(rows).toHaveLength(ids.length);
  expect(new Set(rows.map((r) => r.giver_id))).toEqual(new Set(ids));
  expect(new Set(rows.map((r) => r.receiver_id))).toEqual(new Set(ids));
  for (const r of rows) expect(r.giver_id).not.toBe(r.receiver_id);
}

describe("generación del sorteo", () => {
  for (const n of [2, 3, 7, 50]) {
    it(`asigna correctamente a ${n} participantes (incluidos organizadores)`, async () => {
      const s = await seedEvent(db, n, Math.min(2, n));
      const count = await startDraw(db, s.organizer);
      expect(count).toBe(n);
      checkPermutation(s.ids, await getAssignments(db, s.eventId));
      expect(await eventStatus(db, s.eventId)).toBe("DRAW_OPEN");
      const cards = await getCardsState(db, s.eventId);
      expect(cards.total).toBe(n);
      expect(cards.taken).toEqual([]);
    });
  }

  it("excluye a los participantes inactivos", async () => {
    const s = await seedEvent(db, 5);
    await db.query("update santa.participants set is_active = false where id = $1", [s.ids[4]]);
    await startDraw(db, s.organizer);
    checkPermutation(s.ids.slice(0, 4), await getAssignments(db, s.eventId));
  });

  it("impide iniciar con menos de 2 participantes activos", async () => {
    const s = await seedEvent(db, 1);
    await expectAppError(startDraw(db, s.organizer), "NOT_ENOUGH_PARTICIPANTS");
  });

  it("no permite generar dos sorteos accidentalmente", async () => {
    const s = await seedEvent(db, 6);
    await startDraw(db, s.organizer);
    const before = await getAssignments(db, s.eventId);
    await expectAppError(startDraw(db, s.organizer), "DRAW_ALREADY_STARTED");
    expect(await getAssignments(db, s.eventId)).toEqual(before);
  });

  it("un participante normal no puede iniciar el sorteo (ni saltándose la capa de servicio)", async () => {
    const s = await seedEvent(db, 4);
    await expectAppError(startDraw(db, s.participant), "FORBIDDEN");
    // Aunque alguien falsifique el rol en el actor, la base de datos verifica el rol real.
    await expectAppError(startDraw(db, { ...s.participant, role: "ORGANIZER" }), "FORBIDDEN");
  });

  it("la base de datos rechaza asignaciones inválidas aunque la aplicación falle", async () => {
    const s = await seedEvent(db, 3);
    const [a, b, c] = s.ids;
    const call = (g: string[], r: string[]) =>
      db.query("select santa.start_draw($1, $2, $3::uuid[], $4::uuid[])", [s.eventId, s.organizer.participantId, g, r]);
    await expectAppError(call([a, b, c], [a, c, b]), "INVALID_DRAW"); // autoasignación
    await expectAppError(call([a, b, c], [b, a, a]), "INVALID_DRAW"); // destinatario repetido
    await expectAppError(call([a, b], [b, a]), "INVALID_DRAW"); // falta un participante
    expect(await getAssignments(db, s.eventId)).toEqual([]);
    expect(await eventStatus(db, s.eventId)).toBe("DRAFT");
    // Y las constraints protegen incluso inserciones directas.
    await expectAppError(
      db.query("insert into santa.assignments (event_id, giver_id, receiver_id) values ($1, $2, $2)", [s.eventId, a]),
      "INVALID_INPUT",
    );
  });

  it("no mezcla participantes de otro evento", async () => {
    const s = await seedEvent(db, 3);
    const other = await seedEvent(db, 3, 1, { current: false });
    const [a, b] = s.ids;
    await expectAppError(
      db.query("select santa.start_draw($1, $2, $3::uuid[], $4::uuid[])", [
        s.eventId,
        s.organizer.participantId,
        [a, b, other.ids[0]],
        [b, other.ids[0], a],
      ]),
      "INVALID_DRAW",
    );
  });
});

describe("tarjetas y revelación", () => {
  it("revela solo el propio destinatario y la asignación permanece estable", async () => {
    const s = await seedEvent(db, 5);
    await startDraw(db, s.organizer);
    const assignments = await getAssignments(db, s.eventId);
    const me = s.actorOf(s.ids[2]);
    const expected = assignments.find((a) => a.giver_id === me.participantId)!.receiver_id;

    const first = await claimCard(db, me, 3);
    expect(first.status).toBe("OK");
    if (first.status !== "OK") throw new Error();
    expect(first.receiver.id).toBe(expected);
    expect(first.cardNumber).toBe(3);

    // Reintento con otra tarjeta: no cambia nada (idempotente).
    const retry = await claimCard(db, me, 4);
    expect(retry.status).toBe("ALREADY_REVEALED");
    if (retry.status !== "ALREADY_REVEALED") throw new Error();
    expect(retry.receiver.id).toBe(expected);
    expect(retry.cardNumber).toBe(3);
    expect((await getCardsState(db, s.eventId)).taken).toEqual([3]);

    // Consulta posterior desde cualquier dispositivo: mismo resultado.
    const later = await getMyResult(db, me);
    expect(later?.receiver.id).toBe(expected);
    expect(later?.cardNumber).toBe(3);
    expect(await getAssignments(db, s.eventId)).toEqual(assignments);
  });

  it("una tarjeta ocupada devuelve un resultado controlado", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    expect((await claimCard(db, s.actorOf(s.ids[1]), 2)).status).toBe("OK");
    const second = await claimCard(db, s.actorOf(s.ids[2]), 2);
    expect(second.status).toBe("CARD_TAKEN");
    // El segundo usuario puede escoger otra.
    expect((await claimCard(db, s.actorOf(s.ids[2]), 1)).status).toBe("OK");
  });

  it("dos personas reclamando la misma tarjeta a la vez: solo una gana", async () => {
    const s = await seedEvent(db, 10);
    await startDraw(db, s.organizer);
    const results = await Promise.all(s.ids.map((id) => claimCard(db, s.actorOf(id), 7)));
    expect(results.filter((r) => r.status === "OK")).toHaveLength(1);
    expect(results.filter((r) => r.status === "CARD_TAKEN")).toHaveLength(9);
  });

  it("un usuario no obtiene dos tarjetas aunque haga muchos clics simultáneos", async () => {
    const s = await seedEvent(db, 6);
    await startDraw(db, s.organizer);
    const me = s.actorOf(s.ids[3]);
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => claimCard(db, me, n)));
    expect(results.filter((r) => r.status === "OK")).toHaveLength(1);
    expect(results.filter((r) => r.status === "ALREADY_REVEALED")).toHaveLength(5);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from santa.draw_cards where event_id = $1 and claimed_by = $2",
      [s.eventId, me.participantId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("no permite revelar antes de iniciar ni durante una pausa", async () => {
    const s = await seedEvent(db, 3);
    expect((await claimCard(db, s.participant, 1)).status).toBe("DRAW_NOT_STARTED");
    await startDraw(db, s.organizer);
    await setDrawLocked(db, s.organizer, true);
    expect((await claimCard(db, s.participant, 1)).status).toBe("DRAW_LOCKED");
    await setDrawLocked(db, s.organizer, false);
    expect((await claimCard(db, s.participant, 1)).status).toBe("OK");
  });

  it("la pausa no borra resultados existentes", async () => {
    const s = await seedEvent(db, 3);
    await startDraw(db, s.organizer);
    await claimCard(db, s.participant, 1);
    await setDrawLocked(db, s.organizer, true);
    expect((await getMyResult(db, s.participant))?.cardNumber).toBe(1);
  });

  it("un participante no puede consultar la asignación de otra persona", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    await claimCard(db, s.actorOf(s.ids[1]), 1);
    // ids[2] no ha revelado: no hay resultado, aunque ids[1] sí.
    expect(await getMyResult(db, s.actorOf(s.ids[2]))).toBeNull();
    // El actor siempre es el de la sesión; un actor de otro evento no obtiene nada.
    const other = await seedEvent(db, 2, 1, { current: false });
    expect(await getMyResult(db, { ...other.organizer, participantId: s.ids[1] })).toBeNull();
  });

  it("READY_FOR_DELIVERY solo cuando TODOS revelaron", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    for (let i = 0; i < 3; i++) {
      await claimCard(db, s.actorOf(s.ids[i]), i + 1);
      expect(await eventStatus(db, s.eventId)).toBe("DRAW_OPEN");
    }
    const progress = await getDrawProgress(db, s.eventId);
    expect(progress).toMatchObject({ revealed: 3, pending: 1, percent: 75, cardsAvailable: 1 });
    await claimCard(db, s.actorOf(s.ids[3]), 4);
    expect(await eventStatus(db, s.eventId)).toBe("READY_FOR_DELIVERY");
    // Después de cerrar el sorteo, todos pueden seguir consultando su resultado.
    expect(await getMyResult(db, s.actorOf(s.ids[0]))).not.toBeNull();
  });
});

describe("reinicio y restricciones del CRUD", () => {
  it("después del sorteo no se pueden agregar/eliminar participantes ni cambiar identificadores", async () => {
    const s = await seedEvent(db, 3);
    await startDraw(db, s.organizer);
    await expectAppError(
      db.query(
        "insert into santa.participants (event_id, full_name, name_normalized, identifier) values ($1, 'Nuevo', 'nuevo', '99')",
        [s.eventId],
      ),
      "PARTICIPANTS_LOCKED",
    );
    await expectAppError(db.query("delete from santa.participants where id = $1", [s.ids[2]]), "PARTICIPANTS_LOCKED");
    await expectAppError(
      db.query("update santa.participants set identifier = '77' where id = $1", [s.ids[2]]),
      "PARTICIPANTS_LOCKED",
    );
    // Corrección segura de nombre: permitida y no altera las asignaciones.
    const before = await getAssignments(db, s.eventId);
    await db.query("update santa.participants set full_name = 'Persona Corregida', name_normalized = 'persona corregida' where id = $1", [s.ids[2]]);
    expect(await getAssignments(db, s.eventId)).toEqual(before);
  });

  it("un reinicio controlado limpia asignaciones, tarjetas y revelaciones", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    await claimCard(db, s.participant, 2);
    await expectAppError(resetDraw(db, s.organizer, ""), "INVALID_INPUT");
    await expectAppError(resetDraw(db, s.participant, "porque sí"), "FORBIDDEN");
    await resetDraw(db, s.organizer, "Se agregó un primo");
    expect(await eventStatus(db, s.eventId)).toBe("DRAFT");
    expect(await getAssignments(db, s.eventId)).toEqual([]);
    expect((await getCardsState(db, s.eventId)).total).toBe(0);
    expect(await getMyResult(db, s.participant)).toBeNull();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from santa.participants where event_id = $1 and revealed_at is not null",
      [s.eventId],
    );
    expect(rows[0].n).toBe(0);
    const { rows: logs } = await db.query<{ action: string }>(
      "select action from santa.audit_logs where event_id = $1 and action = 'DRAW_RESET'",
      [s.eventId],
    );
    expect(logs).toHaveLength(1);
    // Se puede volver a sortear y la lista vuelve a ser editable.
    await db.query(
      "insert into santa.participants (event_id, full_name, name_normalized, identifier) values ($1, 'Primo Nuevo', 'primo nuevo', '50')",
      [s.eventId],
    );
    expect(await startDraw(db, s.organizer)).toBe(5);
  });
});

describe("consulta de emergencia y exportación", () => {
  it("solo organizadores, exige motivo y queda auditada", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    await expectAppError(emergencyAssignments(db, s.participant, null, "curiosidad"), "FORBIDDEN");
    await expectAppError(emergencyAssignments(db, s.organizer, null, ""), "INVALID_INPUT");
    const all = await emergencyAssignments(db, s.organizer, null, "Alguien perdió el celular");
    expect(all).toHaveLength(4);
    const one = await emergencyAssignments(db, s.organizer, s.ids[1], "Tía no recuerda");
    expect(one).toHaveLength(1);
    const { rows } = await db.query<{ scope: string; actor_name: string }>(
      "select scope, actor_name from santa.audit_logs where event_id = $1 and action = 'EMERGENCY_VIEW' order by id",
      [s.eventId],
    );
    expect(rows.map((r) => r.scope)).toEqual(["ALL_ASSIGNMENTS", `PARTICIPANT:${s.ids[1]}`]);
    expect(rows[0].actor_name).toBe("Persona 000");
  });

  it("la exportación de seguimiento no contiene asignaciones", async () => {
    const s = await seedEvent(db, 3);
    await startDraw(db, s.organizer);
    await claimCard(db, s.participant, 1);
    const rows = await exportTracking(db, s.organizer);
    expect(rows.filter((r) => r.status === "COMPLETADO")).toHaveLength(1);
    const json = JSON.stringify(rows);
    for (const id of s.ids) expect(json).not.toContain(id);
    await expectAppError(exportTracking(db, s.participant), "FORBIDDEN");
  });

  it("revealAll de ayuda deja el evento listo", async () => {
    const s = await seedEvent(db, 5);
    await startDraw(db, s.organizer);
    await revealAll(db, s);
    expect(await eventStatus(db, s.eventId)).toBe("READY_FOR_DELIVERY");
  });
});
