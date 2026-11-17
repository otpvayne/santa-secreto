import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import {
  actorFromSession,
  assertOrganizer,
  createPresentationCode,
  getSessionByToken,
  listLoginNames,
  login,
  logout,
  redeemPresentationCode,
} from "@/server/services/auth";
import { createTestDb, expectAppError, seedEvent } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe("identificación", () => {
  it("lista solo nombres (sin números ni ids) del evento actual", async () => {
    const s = await seedEvent(db, 3);
    await seedEvent(db, 2, 1, { current: false });
    const res = await listLoginNames(db);
    expect(res.names).toEqual(["Persona 000", "Persona 001", "Persona 002"]);
    expect(JSON.stringify(res)).not.toContain(s.ids[0]);
  });

  it("ingresa con nombre (sin importar mayúsculas/acentos/espacios) y número", async () => {
    const s = await seedEvent(db, 3, 1);
    const res = await login(db, { fullName: "  persona   001 ", identifier: "01" }, "1.1.1.1");
    expect(res.participantId).toBe(s.ids[1]);
    expect(res.role).toBe("PARTICIPANT");
    const session = await getSessionByToken(db, res.token);
    expect(session?.participant?.id).toBe(s.ids[1]);
    expect(session?.event.id).toBe(s.eventId);
  });

  it("solo se guarda el hash del token en la base de datos", async () => {
    await seedEvent(db, 2);
    const res = await login(db, { fullName: "Persona 000", identifier: "00" }, "ip");
    const { rows } = await db.query<{ token_hash: string }>("select token_hash from santa.sessions");
    expect(rows[0].token_hash).not.toBe(res.token);
    expect(rows[0].token_hash).toHaveLength(64);
  });

  it("rechaza nombre inexistente, número incorrecto y participantes inactivos", async () => {
    const s = await seedEvent(db, 3);
    await expectAppError(login(db, { fullName: "Nadie", identifier: "00" }, "ip"), "NAME_NOT_FOUND");
    await expectAppError(login(db, { fullName: "Persona 001", identifier: "1" }, "ip"), "WRONG_IDENTIFIER");
    await db.query("update santa.participants set is_active = false where id = $1", [s.ids[2]]);
    await expectAppError(login(db, { fullName: "Persona 002", identifier: "02" }, "ip"), "PARTICIPANT_INACTIVE");
  });

  it("limita los intentos fallidos por nombre", async () => {
    await seedEvent(db, 2);
    for (let i = 0; i < 6; i++) {
      await expectAppError(login(db, { fullName: "Persona 001", identifier: "9" + i }, `ip-${i}`), "WRONG_IDENTIFIER");
    }
    // Incluso con el número correcto queda bloqueado temporalmente.
    await expectAppError(login(db, { fullName: "Persona 001", identifier: "01" }, "otra-ip"), "RATE_LIMITED");
    // Otra persona no se ve afectada.
    await login(db, { fullName: "Persona 000", identifier: "00" }, "otra-ip");
  });

  it("rechaza sesiones expiradas, cerradas o de participantes desactivados", async () => {
    const s = await seedEvent(db, 3);
    const a = await login(db, { fullName: "Persona 001", identifier: "01" }, "ip");
    await db.query("update santa.sessions set expires_at = now() - interval '1 second'");
    expect(await getSessionByToken(db, a.token)).toBeNull();

    const b = await login(db, { fullName: "Persona 001", identifier: "01" }, "ip");
    await logout(db, b.token);
    expect(await getSessionByToken(db, b.token)).toBeNull();

    const c = await login(db, { fullName: "Persona 002", identifier: "02" }, "ip");
    await db.query("update santa.participants set is_active = false where id = $1", [s.ids[2]]);
    expect(await getSessionByToken(db, c.token)).toBeNull();

    expect(await getSessionByToken(db, "token-inventado-que-no-existe-123")).toBeNull();
    expect(await getSessionByToken(db, undefined)).toBeNull();
  });

  it("el rol se obtiene siempre de la base de datos", async () => {
    const s = await seedEvent(db, 3, 2);
    const res = await login(db, { fullName: "Persona 001", identifier: "01" }, "ip");
    let session = await getSessionByToken(db, res.token);
    expect(session?.participant?.role).toBe("ORGANIZER");
    // Si le quitan el rol, la misma sesión deja de ser organizadora de inmediato.
    await db.query("update santa.participants set role = 'PARTICIPANT' where id = $1", [s.ids[1]]);
    session = await getSessionByToken(db, res.token);
    expect(session?.participant?.role).toBe("PARTICIPANT");
    expect(() => assertOrganizer(actorFromSession(session!))).toThrow();
  });
});

describe("pantalla de presentación", () => {
  it("un código de un solo uso crea una sesión de solo lectura", async () => {
    const s = await seedEvent(db, 3);
    await expectAppError(createPresentationCode(db, s.participant), "FORBIDDEN");
    const { code } = await createPresentationCode(db, s.organizer);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const tv = await redeemPresentationCode(db, code.toLowerCase(), "tv-ip");
    const session = await getSessionByToken(db, tv.token);
    expect(session?.kind).toBe("PRESENTATION");
    expect(session?.participant).toBeNull();
    // La sesión del TV no puede actuar como participante ni organizador.
    expect(() => actorFromSession(session!)).toThrow();
    // El código no se puede reutilizar.
    await expectAppError(redeemPresentationCode(db, code, "tv-ip"), "INVALID_CODE");
  });

  it("los códigos expiran", async () => {
    const s = await seedEvent(db, 2);
    const { code } = await createPresentationCode(db, s.organizer);
    await db.query("update santa.presentation_codes set expires_at = now() - interval '1 second'");
    await expectAppError(redeemPresentationCode(db, code, "tv-ip"), "INVALID_CODE");
  });
});
