/**
 * Pruebas de concurrencia REAL: PostgreSQL nativo con muchas conexiones simultáneas
 * (PGlite atiende una consulta a la vez, así que aquí se comprueban los bloqueos de verdad).
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgDb } from "@/server/db/adapters";
import { runMigrations } from "@/server/db/migrate";
import type { Db } from "@/server/db/types";
import { claimCard, getCardsState, startDraw } from "@/server/services/draw";
import { confirmDelivery, startDelivery, startTurn } from "@/server/services/delivery";
import { eventStatus, getAssignments, seedEvent } from "../helpers/db";

let pg: { stop: () => Promise<void> } | null = null;
let db: Db;
let dir: string;

beforeAll(async () => {
  process.env.DATABASE_POOL_MAX = "25";
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  dir = await mkdtemp(path.join(os.tmpdir(), "santa-pg-"));
  const port = 54000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  pg = server;
  db = await createPgDb(`postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`);
  await runMigrations(db);
}, 180_000);

afterAll(async () => {
  await db?.close();
  await pg?.stop();
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("concurrencia con PostgreSQL nativo", () => {
  it("50 personas reclamando la MISMA tarjeta a la vez: exactamente una la obtiene", async () => {
    const s = await seedEvent(db, 50, 2, { current: false });
    await startDraw(db, s.organizer);
    const results = await Promise.all(s.ids.map((id) => claimCard(db, s.actorOf(id), 15)));
    expect(results.filter((r) => r.status === "OK")).toHaveLength(1);
    expect(results.filter((r) => r.status === "CARD_TAKEN")).toHaveLength(49);
    expect((await getCardsState(db, s.eventId)).taken).toEqual([15]);
  });

  it("50 personas reclamando tarjetas distintas a la vez: todas reciben su asignación y el evento cierra", async () => {
    const s = await seedEvent(db, 50, 2, { current: false });
    await startDraw(db, s.organizer);
    const assignments = await getAssignments(db, s.eventId);
    const results = await Promise.all(s.ids.map((id, i) => claimCard(db, s.actorOf(id), i + 1)));
    expect(results.every((r) => r.status === "OK")).toBe(true);
    results.forEach((r, i) => {
      if (r.status !== "OK") throw new Error();
      expect(r.receiver.id).toBe(assignments.find((a) => a.giver_id === s.ids[i])!.receiver_id);
    });
    expect(await eventStatus(db, s.eventId)).toBe("READY_FOR_DELIVERY");
  });

  it("ráfaga de clics de una misma persona en muchas tarjetas: una sola tarjeta y el mismo destinatario", async () => {
    const s = await seedEvent(db, 20, 1, { current: false });
    await startDraw(db, s.organizer);
    const me = s.actorOf(s.ids[5]);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => claimCard(db, me, i + 1)));
    expect(results.filter((r) => r.status === "OK")).toHaveLength(1);
    const receivers = new Set(results.map((r) => ("receiver" in r ? r.receiver.id : null)));
    expect(receivers.size).toBe(1);
    expect((await getCardsState(db, s.eventId)).taken).toHaveLength(1);
  });

  it("carrera mezclada: muchas personas y tarjetas en disputa, sin dobles asignaciones", async () => {
    const s = await seedEvent(db, 30, 1, { current: false });
    await startDraw(db, s.organizer);
    // Cada persona intenta 3 tarjetas de un rango pequeño → mucha competencia.
    const attempts = s.ids.flatMap((id, i) => [0, 1, 2].map((k) => claimCard(db, s.actorOf(id), ((i + k) % 10) + 1)));
    await Promise.all(attempts);
    const { rows } = await db.query<{ claimed_by: string; n: number }>(
      `select claimed_by, count(*)::int as n from santa.draw_cards
        where event_id = $1 and claimed_by is not null group by claimed_by`,
      [s.eventId],
    );
    expect(rows.length).toBeLessThanOrEqual(10);
    for (const r of rows) expect(r.n).toBe(1);
  });

  it("dos organizadores eligiendo turno a la vez: un solo turno activo", async () => {
    const s = await seedEvent(db, 10, 3, { current: false });
    await startDraw(db, s.organizer);
    await Promise.all(s.ids.map((id, i) => claimCard(db, s.actorOf(id), i + 1)));
    await startDelivery(db, s.organizer);
    const orgs = [0, 1, 2].map((i) => s.actorOf(s.ids[i]));
    const settled = await Promise.allSettled(orgs.map((o) => startTurn(db, o, "RANDOM", null)));
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const turn = (settled.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ turnId: string }>).value;
    const confirmations = await Promise.all(orgs.map((o) => confirmDelivery(db, o, turn.turnId)));
    expect(confirmations.filter((c) => c.result === "OK")).toHaveLength(1);
  });
});
