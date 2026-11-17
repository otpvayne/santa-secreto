import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { MIGRATIONS_DIR, runMigrations } from "@/server/db/migrate";
import { createPgliteDb } from "@/server/db/adapters";
import {
  claimCard,
  getCardsState,
  getDrawProgress,
  getMyCard,
  getMySecretFriend,
  startDraw,
} from "@/server/services/draw";
import { createEvent } from "@/server/services/events";
import {
  confirmGiftWishesImport,
  createParticipant,
  listParticipants,
  previewGiftWishesImport,
  updateParticipant,
} from "@/server/services/participants";
import type { RawCell } from "@/server/import/spreadsheet";
import { createTestDb, eventStatus, expectAppError, getAssignments, seedEvent, type Seeded } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

async function wishesOf(id: string): Promise<string | null> {
  const { rows } = await db.query<{ gift_wishes: string | null }>("select gift_wishes from santa.participants where id = $1", [id]);
  return rows[0].gift_wishes;
}

async function snapshot(s: Seeded) {
  const { rows: cards } = await db.query("select card_number, claimed_by from santa.draw_cards where event_id = $1 order by card_number", [s.eventId]);
  const { rows: people } = await db.query(
    "select id, identifier, role, photo_path, photo_version, revealed_at, is_active from santa.participants where event_id = $1 order by id",
    [s.eventId],
  );
  const { rows: ev } = await db.query("select status, draw_round, draw_locked from santa.events where id = $1", [s.eventId]);
  const assignments = (await getAssignments(db, s.eventId)).sort((a, b) => a.giver_id.localeCompare(b.giver_id));
  return { cards, people, ev, assignments };
}

/** Quién le regala a `receiverId`. */
async function giverOf(s: Seeded, receiverId: string) {
  const a = (await getAssignments(db, s.eventId)).find((x) => x.receiver_id === receiverId)!;
  return s.actorOf(a.giver_id);
}

describe("migración 0004 (sugerencias de regalo)", () => {
  it("es aditiva: los participantes existentes quedan intactos y con gift_wishes NULL", async () => {
    // Base con solo las migraciones 0001–0003 (como producción hoy) y datos reales simulados.
    const old = await createPgliteDb();
    try {
      const dir = MIGRATIONS_DIR;
      for (const f of ["0001_schema.sql", "0002_functions.sql", "0003_security_and_storage.sql"]) {
        await old.execScript(await readFile(path.join(dir, f), "utf8"));
      }
      await old.execScript(`create table if not exists santa.schema_migrations (name text primary key, applied_at timestamptz not null default now());
        insert into santa.schema_migrations (name) values ('0001_schema.sql'), ('0002_functions.sql'), ('0003_security_and_storage.sql');`);
      const s = await seedEvent(old, 4);
      await startDraw(old, s.organizer);
      const before = await old.query("select * from santa.participants order by id");
      const beforeAssign = await old.query("select * from santa.assignments order by giver_id");

      const applied = await runMigrations(old);
      expect(applied).toEqual(["0004_gift_wishes.sql"]);
      expect(await runMigrations(old)).toEqual([]); // idempotente

      const after = await old.query<Record<string, unknown>>("select * from santa.participants order by id");
      expect(after.rows.map(({ gift_wishes, ...rest }) => (expect(gift_wishes).toBeNull(), rest))).toEqual(before.rows);
      expect((await old.query("select * from santa.assignments order by giver_id")).rows).toEqual(beforeAssign.rows);
    } finally {
      await old.close();
    }
  });
});

describe("sugerencias de regalo: administración manual", () => {
  it("crea y edita con texto libre (comas, sin comas, saltos de línea, tildes, especiales)", async () => {
    const s = await seedEvent(db, 3);
    const texts = [
      "Una camiseta talla M, algo relacionado con fútbol, una billetera",
      "Cualquier detalle que me sorprenda sin necesidad de separadores",
      "Línea uno\nLínea dos\n\n— Ñandú & «café» 🎄 <script>",
    ];
    const p = await createParticipant(db, s.organizer, { fullName: "Nueva Persona", identifier: "50", giftWishes: texts[0] });
    expect(p.giftWishes).toBe(texts[0]);
    for (const t of texts) {
      const row = await updateParticipant(db, s.organizer, { id: p.id, giftWishes: t });
      expect(row.giftWishes).toBe(t);
      expect(await wishesOf(p.id)).toBe(t);
    }
    // Sin el campo: no se toca.
    await updateParticipant(db, s.organizer, { id: p.id, fullName: "Nueva Persona Dos" });
    expect(await wishesOf(p.id)).toBe(texts[2]);
    // Vacío: borrado explícito.
    await updateParticipant(db, s.organizer, { id: p.id, giftWishes: "" });
    expect(await wishesOf(p.id)).toBeNull();
    const list = await listParticipants(db, s.organizer);
    expect(list.find((x) => x.id === p.id)?.giftWishes).toBeNull();
  });

  it("un participante normal no puede editar sugerencias (ni las propias)", async () => {
    const s = await seedEvent(db, 3);
    await expectAppError(updateParticipant(db, s.participant, { id: s.participant.participantId, giftWishes: "Un carro" }), "FORBIDDEN");
    await expectAppError(listParticipants(db, s.participant), "FORBIDDEN");
    await expectAppError(previewGiftWishesImport(db, s.participant, [["nombre", "regalo"]]), "FORBIDDEN");
    await expectAppError(confirmGiftWishesImport(db, s.participant, [["nombre", "regalo"]], null, []), "FORBIDDEN");
    await expectAppError(db.query("select santa.update_gift_wishes($1, $2, '[]'::jsonb)", [s.eventId, s.participant.participantId]), "FORBIDDEN");
    expect(await wishesOf(s.participant.participantId)).toBeNull();
  });

  it("se pueden corregir después de iniciar el sorteo sin alterar asignaciones, tarjetas ni progreso", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    await claimCard(db, s.actorOf(s.ids[1]), 2);
    const before = await snapshot(s);
    const progressBefore = await getDrawProgress(db, s.eventId);

    await updateParticipant(db, s.organizer, { id: s.ids[2], giftWishes: "Unos guantes" });
    await updateParticipant(db, s.organizer, { id: s.ids[2], giftWishes: "Unos guantes\no una bufanda" });

    expect(await snapshot(s)).toEqual(before);
    expect(await getDrawProgress(db, s.eventId)).toEqual(progressBefore);
    expect(await eventStatus(db, s.eventId)).toBe("DRAW_OPEN");
  });

  it("no se pueden editar en un evento archivado", async () => {
    const s = await seedEvent(db, 2);
    await db.query("update santa.events set status = 'ARCHIVED' where id = $1", [s.eventId]);
    await expectAppError(updateParticipant(db, s.organizer, { id: s.ids[1], giftWishes: "x" }), "EVENT_ARCHIVED");
    await expectAppError(confirmGiftWishesImport(db, s.organizer, [["nombre_completo", "regalo"], ["Persona 001", "x"]], null, [{ row: 2, participantId: s.ids[1] }]), "EVENT_ARCHIVED");
  });
});

describe("sugerencias de regalo: importación desde Excel", () => {
  const header: RawCell[] = ["nombre_completo", "numero_identificador", "Sugerencias de regalo"];

  it("actualiza SOLO las sugerencias de participantes existentes; no crea duplicados; es idempotente", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer); // funciona incluso con el sorteo en curso
    await updateParticipant(db, s.organizer, { id: s.ids[3], giftWishes: "Texto anterior" });
    const before = await snapshot(s);

    const table: RawCell[][] = [
      header,
      ["Persona 000", "00", "Una camiseta talla M, algo de fútbol"],
      ["persona 001", "01", "Línea 1\nLínea 2"],
      ["Persona 002", "02", null], // vacía → no borra
      ["Persona 003", "03", ""], // vacía → conserva "Texto anterior"
      ["Persona Nueva", "77", "No debe crearse"],
    ];
    const preview = await previewGiftWishesImport(db, s.organizer, table);
    expect(preview.rows.map((r) => r.status)).toEqual(["UPDATE", "UPDATE", "EMPTY", "EMPTY", "NOT_FOUND"]);
    expect(preview.rows[3].current).toBe("Texto anterior");

    const selection = preview.rows.filter((r) => r.status === "UPDATE").map((r) => ({ row: r.row, participantId: r.participantId! }));
    const res = await confirmGiftWishesImport(db, s.organizer, table, null, selection);
    expect(res).toEqual({ updated: 2, selected: 2 });

    expect(await wishesOf(s.ids[0])).toBe("Una camiseta talla M, algo de fútbol");
    expect(await wishesOf(s.ids[1])).toBe("Línea 1\nLínea 2");
    expect(await wishesOf(s.ids[2])).toBeNull();
    expect(await wishesOf(s.ids[3])).toBe("Texto anterior");

    // Nada más cambió: mismos participantes (sin duplicados), ids, roles, fotos, asignaciones, tarjetas y estado.
    const after = await snapshot(s);
    expect(after.people).toEqual(before.people);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.cards).toEqual(before.cards);
    expect(after.ev).toEqual(before.ev);

    // Repetir la misma importación no reescribe nada.
    const again = await previewGiftWishesImport(db, s.organizer, table);
    expect(again.rows.slice(0, 2).map((r) => r.status)).toEqual(["UNCHANGED", "UNCHANGED"]);
    expect(await db.query("select santa.update_gift_wishes($1, $2, $3::jsonb) as n", [
      s.eventId,
      s.organizer.participantId,
      JSON.stringify([{ id: s.ids[0], gift_wishes: "Una camiseta talla M, algo de fútbol" }]),
    ])).toEqual({ rows: [{ n: 0 }] });

    const { rows: audit } = await db.query<{ details: { updated: number } }>(
      "select details from santa.audit_logs where event_id = $1 and action = 'GIFT_WISHES_IMPORTED' order by id",
      [s.eventId],
    );
    expect(audit[0].details.updated).toBe(2);
  });

  it("rechaza filas no revisadas, en conflicto o que cambiaron desde la vista previa", async () => {
    const s = await seedEvent(db, 3);
    const table: RawCell[][] = [header, ["Persona 001", "00", "Conflicto: número de otra persona"], ["Persona 002", "02", "Ok"]];
    const preview = await previewGiftWishesImport(db, s.organizer, table);
    expect(preview.rows[0].status).toBe("CONFLICT");
    // Intentar forzar la fila en conflicto apuntando a cualquiera de los dos participantes.
    await expectAppError(confirmGiftWishesImport(db, s.organizer, table, null, [{ row: 2, participantId: s.ids[0] }]), "INVALID_INPUT");
    await expectAppError(confirmGiftWishesImport(db, s.organizer, table, null, [{ row: 2, participantId: s.ids[1] }]), "INVALID_INPUT");
    // Fila válida pero con otro participante del que se revisó.
    await expectAppError(confirmGiftWishesImport(db, s.organizer, table, null, [{ row: 3, participantId: s.ids[1] }]), "INVALID_INPUT");
    // Si es todo o nada: nada se escribió.
    for (const id of s.ids) expect(await wishesOf(id)).toBeNull();
  });

  it("la función SQL rechaza participantes de otro evento (transaccional: todo o nada)", async () => {
    const a = await seedEvent(db, 2);
    const b = await seedEvent(db, 2, 1, { current: false });
    await expectAppError(
      db.query("select santa.update_gift_wishes($1, $2, $3::jsonb)", [
        a.eventId,
        a.organizer.participantId,
        JSON.stringify([
          { id: a.ids[1], gift_wishes: "Válido" },
          { id: b.ids[1], gift_wishes: "De otro evento" },
        ]),
      ]),
      "NOT_FOUND",
    );
    expect(await wishesOf(a.ids[1])).toBeNull();
    expect(await wishesOf(b.ids[1])).toBeNull();
  });
});

describe("sugerencias de regalo: separación entre eventos", () => {
  it("cada evento tiene las suyas; copiar participantes a un evento nuevo no copia sugerencias", async () => {
    const a = await seedEvent(db, 3);
    await updateParticipant(db, a.organizer, { id: a.ids[1], giftWishes: "Solo para el evento A" });
    const newId = await createEvent(db, a.organizer, { name: "Navidad 2027", year: 2027 }, true);
    const { rows } = await db.query<{ gift_wishes: string | null }>("select gift_wishes from santa.participants where event_id = $1", [newId]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.gift_wishes === null)).toBe(true);

    // La importación solo ve participantes del evento del organizador.
    const b = await seedEvent(db, 3, 1, { current: false });
    const table: RawCell[][] = [["nombre_completo", "numero_identificador", "regalo"], ["Persona 001", "01", "Para B"]];
    const preview = await previewGiftWishesImport(db, b.organizer, table);
    expect(preview.rows[0].participantId).toBe(b.ids[1]);
    await confirmGiftWishesImport(db, b.organizer, table, null, [{ row: 2, participantId: b.ids[1] }]);
    expect(await wishesOf(b.ids[1])).toBe("Para B");
    expect(await wishesOf(a.ids[1])).toBe("Solo para el evento A");
    // Un organizador de B no puede editar a alguien de A.
    await expectAppError(updateParticipant(db, b.organizer, { id: a.ids[1], giftWishes: "hack" }), "NOT_FOUND");
  });
});

describe("revelación privada del amigo secreto", () => {
  it("reclamar registra la participación; el resultado solo se obtiene con la consulta propia", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    const me = s.actorOf(s.ids[2]);
    expect(await getMySecretFriend(db, me)).toBeNull(); // aún no participa
    expect(await getMyCard(db, me)).toBeNull();

    const claim = await claimCard(db, me, 3);
    expect(claim.status).toBe("OK");
    expect((await getCardsState(db, s.eventId)).taken).toEqual([3]);

    const card = await getMyCard(db, me);
    expect(card).toEqual({ cardNumber: 3, totalCards: 4 });
    expect(Object.keys(card!)).not.toContain("receiver"); // la tarjeta no lleva datos secretos

    const assigned = (await getAssignments(db, s.eventId)).find((a) => a.giver_id === me.participantId)!.receiver_id;
    const friend = await getMySecretFriend(db, me);
    expect(friend?.receiver.id).toBe(assigned);
    expect(friend?.giftWishes).toBeNull();
  });

  it("mostrar/ocultar (consultar varias veces) no reclama otra tarjeta ni cambia la asignación", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    const me = s.actorOf(s.ids[1]);
    await claimCard(db, me, 1);
    const before = await snapshot(s);
    const first = await getMySecretFriend(db, me);
    for (let i = 0; i < 5; i++) expect(await getMySecretFriend(db, me)).toEqual(first);
    expect(await snapshot(s)).toEqual(before);
    // Intentar una segunda tarjeta devuelve la misma.
    const second = await claimCard(db, me, 2);
    expect(second).toMatchObject({ status: "ALREADY_REVEALED", cardNumber: 1 });
    expect(await snapshot(s)).toEqual(before);
  });

  it("muestra las sugerencias ACTUALES del destinatario (no una copia)", async () => {
    const s = await seedEvent(db, 3);
    await startDraw(db, s.organizer);
    const receiver = s.ids[0];
    const giver = await giverOf(s, receiver);
    await claimCard(db, giver, 1);
    expect((await getMySecretFriend(db, giver))?.giftWishes).toBeNull();
    await updateParticipant(db, s.organizer, { id: receiver, giftWishes: "Un rompecabezas\nde 1000 piezas" });
    expect((await getMySecretFriend(db, giver))?.giftWishes).toBe("Un rompecabezas\nde 1000 piezas");
    await updateParticipant(db, s.organizer, { id: receiver, giftWishes: "Mejor un libro" });
    expect((await getMySecretFriend(db, giver))?.giftWishes).toBe("Mejor un libro");
  });

  it("cada participante solo puede consultar su propia asignación (y nunca la de otro evento)", async () => {
    const s = await seedEvent(db, 4);
    await startDraw(db, s.organizer);
    for (const [i, id] of s.ids.entries()) await claimCard(db, s.actorOf(id), i + 1);
    const assignments = await getAssignments(db, s.eventId);
    for (const id of s.ids) {
      const friend = await getMySecretFriend(db, s.actorOf(id));
      expect(friend?.receiver.id).toBe(assignments.find((a) => a.giver_id === id)!.receiver_id);
    }
    const other = await seedEvent(db, 2, 1, { current: false });
    expect(await getMySecretFriend(db, { ...other.organizer, participantId: s.ids[1] })).toBeNull();
    expect(await getMySecretFriend(db, { ...s.organizer, participantId: other.ids[1] })).toBeNull();
  });
});
