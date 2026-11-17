import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createLocalStorage, type PhotoStorage } from "@/server/storage";
import {
  confirmImport,
  createParticipant,
  deleteParticipant,
  listParticipants,
  previewImport,
  readParticipantPhoto,
  removeParticipantPhoto,
  setParticipantPhoto,
  updateParticipant,
} from "@/server/services/participants";
import { startDraw } from "@/server/services/draw";
import { createTestDb, expectAppError, seedEvent } from "../helpers/db";

let db: Db;
let storage: PhotoStorage;
let dir: string;
beforeEach(async () => {
  db = await createTestDb();
  dir = await mkdtemp(path.join(os.tmpdir(), "santa-fotos-"));
  storage = createLocalStorage(dir);
});
afterEach(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe("CRUD de participantes", () => {
  it("crea, consulta, modifica y elimina en preparación", async () => {
    const s = await seedEvent(db, 2);
    const p = await createParticipant(db, s.organizer, { fullName: "  Laura   Rodríguez ", identifier: "07" });
    expect(p.fullName).toBe("Laura Rodríguez");
    expect(p.identifier).toBe("07");
    const updated = await updateParticipant(db, s.organizer, { id: p.id, fullName: "Laura R.", role: "ORGANIZER" });
    expect(updated).toMatchObject({ fullName: "Laura R.", role: "ORGANIZER" });
    expect((await listParticipants(db, s.organizer)).map((x) => x.fullName)).toContain("Laura R.");
    await deleteParticipant(db, storage, s.organizer, p.id);
    expect(await listParticipants(db, s.organizer)).toHaveLength(2);
  });

  it("impide identificadores y nombres duplicados (normalizados)", async () => {
    const s = await seedEvent(db, 2);
    await expectAppError(createParticipant(db, s.organizer, { fullName: "Otra", identifier: "01" }), "DUPLICATE_IDENTIFIER");
    await expectAppError(createParticipant(db, s.organizer, { fullName: "PERSONA   001", identifier: "55" }), "DUPLICATE_NAME");
    await expectAppError(createParticipant(db, s.organizer, { fullName: "X", identifier: "56" }), "INVALID_INPUT");
    await expectAppError(createParticipant(db, s.organizer, { fullName: "Ana", identifier: "5a" }), "INVALID_INPUT");
  });

  it("un participante normal no puede administrar", async () => {
    const s = await seedEvent(db, 3);
    await expectAppError(listParticipants(db, s.participant), "FORBIDDEN");
    await expectAppError(createParticipant(db, s.participant, { fullName: "Ana", identifier: "77" }), "FORBIDDEN");
    await expectAppError(updateParticipant(db, s.participant, { id: s.participant.participantId, role: "ORGANIZER" }), "FORBIDDEN");
  });

  it("no se puede eliminar, desactivar ni degradar al último organizador", async () => {
    const s = await seedEvent(db, 3, 1);
    await expectAppError(
      updateParticipant(db, s.organizer, { id: s.organizer.participantId, role: "PARTICIPANT" }),
      "LAST_ORGANIZER",
    );
    await expectAppError(
      updateParticipant(db, s.organizer, { id: s.organizer.participantId, isActive: false }),
      "LAST_ORGANIZER",
    );
    await expectAppError(db.query("delete from santa.participants where id = $1", [s.ids[0]]), "LAST_ORGANIZER");
    // Con un segundo organizador sí se puede.
    await updateParticipant(db, s.organizer, { id: s.ids[1], role: "ORGANIZER" });
    await updateParticipant(db, s.organizer, { id: s.ids[1], isActive: false });
  });

  it("después del sorteo solo permite correcciones seguras", async () => {
    const s = await seedEvent(db, 3);
    await startDraw(db, s.organizer);
    await expectAppError(createParticipant(db, s.organizer, { fullName: "Nuevo", identifier: "88" }), "PARTICIPANTS_LOCKED");
    await expectAppError(deleteParticipant(db, storage, s.organizer, s.ids[2]), "PARTICIPANTS_LOCKED");
    await expectAppError(updateParticipant(db, s.organizer, { id: s.ids[2], identifier: "99" }), "PARTICIPANTS_LOCKED");
    await expectAppError(updateParticipant(db, s.organizer, { id: s.ids[2], isActive: false }), "PARTICIPANTS_LOCKED");
    const fixed = await updateParticipant(db, s.organizer, { id: s.ids[2], fullName: "Nombre Corregido" });
    expect(fixed.fullName).toBe("Nombre Corregido");
  });

  it("no permite operar sobre participantes de otro evento", async () => {
    const s = await seedEvent(db, 2);
    const other = await seedEvent(db, 2, 1, { current: false });
    await expectAppError(updateParticipant(db, s.organizer, { id: other.ids[1], fullName: "Hack" }), "NOT_FOUND");
    await expectAppError(deleteParticipant(db, storage, s.organizer, other.ids[1]), "NOT_FOUND");
  });
});

describe("fotografías", () => {
  async function pngWithExif(): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 20, b: 20 } } })
      .withExif({ IFD0: { Copyright: "secreto", Artist: "GPS-123" } })
      .jpeg()
      .toBuffer();
  }

  it("valida, optimiza, elimina metadatos y guarda en almacenamiento privado", async () => {
    const s = await seedEvent(db, 2);
    const input = await pngWithExif();
    const sharp = (await import("sharp")).default;
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const row = await setParticipantPhoto(db, storage, s.organizer, s.ids[1], input);
    expect(row.photoUrl).toMatch(new RegExp(`^/api/fotos/${s.ids[1]}\\?v=1$`));
    const stored = await readParticipantPhoto(db, storage, s.eventId, s.ids[1]);
    const meta = await sharp(stored!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(900);

    // La ruta interna usa UUID, no el nombre de la persona.
    const { rows } = await db.query<{ photo_path: string }>("select photo_path from santa.participants where id = $1", [s.ids[1]]);
    expect(rows[0].photo_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);

    await removeParticipantPhoto(db, storage, s.organizer, s.ids[1]);
    expect(await readParticipantPhoto(db, storage, s.eventId, s.ids[1])).toBeNull();
  });

  it("rechaza archivos que no son imágenes reales aunque digan serlo", async () => {
    const s = await seedEvent(db, 2);
    await expectAppError(
      setParticipantPhoto(db, storage, s.organizer, s.ids[1], Buffer.from("<script>alert(1)</script>")),
      "INVALID_PHOTO",
    );
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("no soy una imagen")]);
    await expectAppError(setParticipantPhoto(db, storage, s.organizer, s.ids[1], fakeJpeg), "INVALID_PHOTO");
  });

  it("solo organizadores pueden cambiar fotografías", async () => {
    const s = await seedEvent(db, 2);
    await expectAppError(setParticipantPhoto(db, storage, s.participant, s.ids[1], await pngWithExif()), "FORBIDDEN");
  });
});

describe("importación", () => {
  const table = [
    ["nombre_completo", "numero_identificador", "rol"],
    ["Pablo Monroy", "10", "ORGANIZER"],
    ["Laura Rodríguez", "11", "PARTICIPANT"],
    ["Carlos Martínez", "12", null],
  ];

  it("vista previa sin escribir y confirmación atómica", async () => {
    const s = await seedEvent(db, 2);
    const preview = await previewImport(db, s.organizer, table);
    expect(preview.validCount).toBe(3);
    expect(await listParticipants(db, s.organizer)).toHaveLength(2);
    expect(await confirmImport(db, s.organizer, table)).toBe(3);
    expect(await listParticipants(db, s.organizer)).toHaveLength(5);
  });

  it("no hace importaciones parciales si hay errores", async () => {
    const s = await seedEvent(db, 2);
    const bad = [...table, ["Persona 001", "13", null]]; // nombre existente
    await expectAppError(confirmImport(db, s.organizer, bad), "INVALID_INPUT");
    expect(await listParticipants(db, s.organizer)).toHaveLength(2);
  });

  it("no se puede importar después del sorteo", async () => {
    const s = await seedEvent(db, 2);
    await startDraw(db, s.organizer);
    await expectAppError(confirmImport(db, s.organizer, table), "PARTICIPANTS_LOCKED");
  });
});
