import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { startDraw, resetDraw } from "@/server/services/draw";
import {
  cancelTurn,
  confirmDelivery,
  finishEvent,
  getExpectedGiver,
  getOrganizerDeliveryState,
  getPresentationState,
  revertDelivery,
  startDelivery,
  startTurn,
} from "@/server/services/delivery";
import { archiveEvent } from "@/server/services/events";
import { createTestDb, eventStatus, expectAppError, getAssignments, revealAll, seedEvent, type Seeded } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

async function readyEvent(n: number): Promise<Seeded> {
  const s = await seedEvent(db, n, 2);
  await startDraw(db, s.organizer);
  await revealAll(db, s);
  expect(await eventStatus(db, s.eventId)).toBe("READY_FOR_DELIVERY");
  return s;
}

describe("día de entrega", () => {
  it("no inicia antes de que todos revelen", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    await expectAppError(startDelivery(db, s.organizer), "INVALID_STATE");
  });

  it("solo organizadores controlan la entrega", async () => {
    const s = await readyEvent(4);
    await expectAppError(startDelivery(db, s.participant), "FORBIDDEN");
    await startDelivery(db, s.organizer);
    await expectAppError(startTurn(db, s.participant, "RANDOM", null), "FORBIDDEN");
    await expectAppError(getOrganizerDeliveryState(db, s.participant), "FORBIDDEN");
  });

  it("flujo completo aleatorio: nadie recibe dos veces y el evento finaliza", async () => {
    const n = 6;
    const s = await readyEvent(n);
    await startDelivery(db, s.organizer);
    const assignments = await getAssignments(db, s.eventId);
    const seen = new Set<string>();

    for (let i = 0; i < n; i++) {
      const { turnId, receiverId } = await startTurn(db, s.organizer, "RANDOM", null);
      expect(seen.has(receiverId)).toBe(false); // excluye a quienes ya recibieron
      seen.add(receiverId);

      // No puede haber dos turnos activos.
      await expectAppError(startTurn(db, s.organizer, "RANDOM", null), "TURN_ALREADY_ACTIVE");

      const expected = await getExpectedGiver(db, s.organizer, turnId);
      expect(expected.id).toBe(assignments.find((a) => a.receiver_id === receiverId)!.giver_id);

      if (i < n - 1) await expectAppError(finishEvent(db, s.organizer, false, null), "TURN_STILL_ACTIVE");
      expect((await confirmDelivery(db, s.organizer, turnId)).result).toBe("OK");
      // Confirmación duplicada: controlada, sin efectos.
      expect((await confirmDelivery(db, s.organizer, turnId)).result).toBe("ALREADY_CONFIRMED");
      if (i < n - 1) await expectAppError(finishEvent(db, s.organizer, false, null), "GIFTS_PENDING");
    }
    expect(seen.size).toBe(n);
    await expectAppError(startTurn(db, s.organizer, "RANDOM", null), "NOBODY_PENDING");

    const state = await getOrganizerDeliveryState(db, s.organizer);
    expect(state.stats).toEqual({ total: n, delivered: n, pending: 0, percent: 100 });

    const { rows } = await db.query<{ receiver_id: string; giver_id: string; confirmed_by: string }>(
      "select receiver_id, giver_id, confirmed_by from santa.delivery_turns where event_id = $1 and status = 'COMPLETED'",
      [s.eventId],
    );
    expect(rows).toHaveLength(n);
    for (const r of rows) {
      expect(r.giver_id).toBe(assignments.find((a) => a.receiver_id === r.receiver_id)!.giver_id);
      expect(r.confirmed_by).toBe(s.organizer.participantId);
    }

    await finishEvent(db, s.organizer, false, null);
    expect(await eventStatus(db, s.eventId)).toBe("COMPLETED");
    await archiveEvent(db, s.organizer);
    expect(await eventStatus(db, s.eventId)).toBe("ARCHIVED");
  });

  it("selección manual y omisión de turno", async () => {
    const s = await readyEvent(4);
    await startDelivery(db, s.organizer);
    const target = s.ids[3];
    const t1 = await startTurn(db, s.organizer, "MANUAL", target);
    expect(t1.receiverId).toBe(target);
    await cancelTurn(db, s.organizer, t1.turnId);
    // Omitido: sigue pendiente y se puede volver a elegir.
    const t2 = await startTurn(db, s.organizer, "MANUAL", target);
    await confirmDelivery(db, s.organizer, t2.turnId);
    await expectAppError(startTurn(db, s.organizer, "MANUAL", target), "ALREADY_RECEIVED");
    // No se puede elegir a alguien de otro evento.
    const other = await seedEvent(db, 2, 1, { current: false });
    await expectAppError(startTurn(db, s.organizer, "MANUAL", other.ids[0]), "NOT_IN_DRAW");
  });

  it("dos confirmaciones simultáneas del mismo turno registran una sola entrega", async () => {
    const s = await readyEvent(3);
    await startDelivery(db, s.organizer);
    const { turnId } = await startTurn(db, s.organizer, "RANDOM", null);
    const other = s.actorOf(s.ids[1], "ORGANIZER");
    const results = await Promise.all([
      confirmDelivery(db, s.organizer, turnId),
      confirmDelivery(db, other, turnId),
    ]);
    expect(results.map((r) => r.result).sort()).toEqual(["ALREADY_CONFIRMED", "OK"]);
  });

  it("corrección auditada de una confirmación equivocada", async () => {
    const s = await readyEvent(3);
    await startDelivery(db, s.organizer);
    const { turnId, receiverId } = await startTurn(db, s.organizer, "RANDOM", null);
    await confirmDelivery(db, s.organizer, turnId);
    await expectAppError(revertDelivery(db, s.organizer, turnId, ""), "INVALID_INPUT");
    await revertDelivery(db, s.organizer, turnId, "Se confirmó por error");
    const state = await getOrganizerDeliveryState(db, s.organizer);
    expect(state.pending.map((p) => p.id)).toContain(receiverId);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from santa.audit_logs where event_id = $1 and action = 'DELIVERY_REVERTED'",
      [s.eventId],
    );
    expect(rows[0].n).toBe(1);
    // Se puede repetir el turno de esa persona.
    const again = await startTurn(db, s.organizer, "MANUAL", receiverId);
    expect((await confirmDelivery(db, s.organizer, again.turnId)).result).toBe("OK");
  });

  it("finalización excepcional con regalos pendientes exige motivo y queda identificada", async () => {
    const s = await readyEvent(4);
    await startDelivery(db, s.organizer);
    await expectAppError(finishEvent(db, s.organizer, false, null), "GIFTS_PENDING");
    await expectAppError(finishEvent(db, s.organizer, true, ""), "INVALID_INPUT");
    await finishEvent(db, s.organizer, true, "Se fue la luz, terminamos mañana");
    expect(await eventStatus(db, s.eventId)).toBe("COMPLETED");
    const { rows } = await db.query<{ action: string }>(
      "select action from santa.audit_logs where event_id = $1 and action like 'EVENT_%COMPLETED'",
      [s.eventId],
    );
    expect(rows.map((r) => r.action)).toEqual(["EVENT_FORCE_COMPLETED"]);
  });

  it("no se puede reiniciar el sorteo una vez iniciada la entrega", async () => {
    const s = await readyEvent(3);
    await startDelivery(db, s.organizer);
    await expectAppError(resetDraw(db, s.organizer, "intento"), "INVALID_STATE");
  });
});

describe("pantalla de presentación (TV)", () => {
  it("no recibe secretos antes de la revelación", async () => {
    const s = await readyEvent(5);
    const assignments = await getAssignments(db, s.eventId);
    await startDelivery(db, s.organizer);
    const { turnId, receiverId } = await startTurn(db, s.organizer, "RANDOM", null);
    const expectedGiver = assignments.find((a) => a.receiver_id === receiverId)!.giver_id;

    const before = await getPresentationState(db, s.eventId);
    expect(before.activeTurn?.receiver.id).toBe(receiverId);
    expect(before.completed).toEqual([]);
    const json = JSON.stringify(before);
    // El regalador del turno activo no aparece en ninguna parte de la respuesta…
    expect(json).not.toMatch(/giver/i);
    // …y ningún dato permite reconstruir asignaciones: solo hay personas, sin parejas.
    expect(Object.keys(before.activeTurn!)).toEqual(["turnId", "startedAt", "receiver"]);
    for (const p of before.pending) expect(Object.keys(p).sort()).toEqual(["fullName", "id", "photoUrl"]);

    await confirmDelivery(db, s.organizer, turnId);
    const after = await getPresentationState(db, s.eventId);
    expect(after.completed[0].giver.id).toBe(expectedGiver);
    expect(after.completed[0].receiver.id).toBe(receiverId);
    expect(after.stats).toMatchObject({ total: 5, delivered: 1, pending: 4 });
  });

  it("durante el sorteo solo muestra el avance", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    const st = await getPresentationState(db, s.eventId);
    expect(st.drawProgress).toEqual({ total: 4, revealed: 0 });
    expect(st.pending).toEqual([]);
    expect(st.mosaic).toEqual([]);
  });
});
