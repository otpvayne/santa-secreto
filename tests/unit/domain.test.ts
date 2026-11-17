import { describe, expect, it } from "vitest";
import { cleanDisplayName, cleanIdentifier, filterNames, normalizeName } from "@/domain/normalize";
import { canTransition, TRANSITIONS, EVENT_STATUSES } from "@/domain/event-state";
import { canViewPhoto, type PhotoViewer } from "@/domain/photo-access";
import { cardLabel } from "@/domain/cards";
import { toAppError } from "@/server/errors";

describe("normalización de nombres", () => {
  it("ignora mayúsculas, acentos y espacios extra", () => {
    expect(normalizeName("  José   PÉREZ ")).toBe("jose perez");
    expect(normalizeName("Laura Rodríguez")).toBe(normalizeName("laura rodriguez"));
    expect(normalizeName("Ñandú Muñoz")).toBe("nandu munoz");
  });
  it("limpia el nombre visible sin perder acentos", () => {
    expect(cleanDisplayName("  Laura    Rodríguez ")).toBe("Laura Rodríguez");
  });
  it("conserva los ceros iniciales del identificador", () => {
    expect(cleanIdentifier(" 07 ")).toBe("07");
    expect(cleanIdentifier("00")).toBe("00");
  });
});

describe("búsqueda de nombres en el ingreso", () => {
  const names = [
    "Adriano Gómez",
    "Alejandra Ruiz",
    "Diego Alejandro Medina Martinez",
    "Diego Torres",
    "Lucía Medina",
    "Sofía Hernández",
  ];

  it("busca por nombre en cualquier parte, sin mostrar los que no coinciden", () => {
    expect(filterNames(names, "diego")).toEqual(["Diego Alejandro Medina Martinez", "Diego Torres"]);
    expect(filterNames(names, "ejan")).toEqual(["Alejandra Ruiz", "Diego Alejandro Medina Martinez"]);
  });
  it("busca por apellido", () => {
    expect(filterNames(names, "medina")).toEqual(["Diego Alejandro Medina Martinez", "Lucía Medina"]);
  });
  it("ignora tildes en ambos sentidos", () => {
    expect(filterNames(names, "hernandez")).toEqual(["Sofía Hernández"]);
    expect(filterNames(names, "Martínez")).toEqual(["Diego Alejandro Medina Martinez"]);
  });
  it("ignora mayúsculas y espacios extra", () => {
    expect(filterNames(names, "  LUCIA  ")).toEqual(["Lucía Medina"]);
  });
  it("acepta varios términos no consecutivos y en cualquier orden", () => {
    expect(filterNames(names, "diego medina")).toEqual(["Diego Alejandro Medina Martinez"]);
    expect(filterNames(names, "martinez   diego")).toEqual(["Diego Alejandro Medina Martinez"]);
  });
  it("devuelve una lista vacía si nadie coincide", () => {
    expect(filterNames(names, "zacarías")).toEqual([]);
  });
  it("con la búsqueda vacía devuelve todos", () => {
    expect(filterNames(names, "")).toEqual(names);
    expect(filterNames(names, "   ")).toEqual(names);
  });
});

describe("máquina de estados", () => {
  it("define las transiciones permitidas", () => {
    expect(canTransition("DRAFT", "START_DRAW")).toBe(true);
    expect(canTransition("DRAW_OPEN", "START_DRAW")).toBe(false);
    expect(canTransition("DRAW_OPEN", "START_DELIVERY")).toBe(false);
    expect(canTransition("READY_FOR_DELIVERY", "START_DELIVERY")).toBe(true);
    expect(canTransition("DELIVERY_ACTIVE", "RESET_DRAW")).toBe(false);
    expect(canTransition("COMPLETED", "ARCHIVE")).toBe(true);
    expect(canTransition("ARCHIVED", "ARCHIVE")).toBe(false);
  });
  it("solo usa estados conocidos", () => {
    for (const t of Object.values(TRANSITIONS)) {
      for (const s of [...t.from, t.to]) expect(EVENT_STATUSES).toContain(s);
    }
  });
});

describe("acceso a fotografías", () => {
  const participant: PhotoViewer = { kind: "PARTICIPANT", participantId: "a", role: "PARTICIPANT", eventId: "e1" };
  const organizer: PhotoViewer = { kind: "PARTICIPANT", participantId: "o", role: "ORGANIZER", eventId: "e1" };
  const tv: PhotoViewer = { kind: "PRESENTATION", participantId: null, role: null, eventId: "e1" };
  const other = { participantId: "b", eventId: "e1" };
  const ctx = { eventStatus: "DRAW_OPEN" as const, targetIsViewersRevealedReceiver: false };

  it("un participante ve su propia foto pero no la de otros durante el sorteo", () => {
    expect(canViewPhoto(participant, { participantId: "a", eventId: "e1" }, ctx)).toBe(true);
    expect(canViewPhoto(participant, other, ctx)).toBe(false);
  });
  it("un participante ve la foto de su amigo secreto después de revelarlo", () => {
    expect(canViewPhoto(participant, other, { ...ctx, targetIsViewersRevealedReceiver: true })).toBe(true);
  });
  it("durante la entrega todos ven las fotos", () => {
    expect(canViewPhoto(participant, other, { ...ctx, eventStatus: "DELIVERY_ACTIVE" })).toBe(true);
  });
  it("los organizadores ven todas las fotos de su evento", () => {
    expect(canViewPhoto(organizer, other, ctx)).toBe(true);
  });
  it("nunca se cruzan eventos", () => {
    expect(canViewPhoto(organizer, { participantId: "b", eventId: "e2" }, ctx)).toBe(false);
  });
  it("el TV solo ve fotos cuando el sorteo terminó", () => {
    expect(canViewPhoto(tv, other, ctx)).toBe(false);
    expect(canViewPhoto(tv, other, { ...ctx, eventStatus: "DELIVERY_ACTIVE" })).toBe(true);
  });
});

describe("utilidades", () => {
  it("formatea las etiquetas de tarjetas", () => {
    expect(cardLabel(1, 50)).toBe("01");
    expect(cardLabel(50, 50)).toBe("50");
    expect(cardLabel(7, 120)).toBe("007");
  });
  it("traduce errores de PostgreSQL sin filtrar detalles técnicos", () => {
    expect(toAppError({ code: "P0001", message: "SANTA:CARD_TAKEN" }).code).toBe("CARD_TAKEN");
    expect(
      toAppError({ code: "23505", message: 'duplicate key value violates unique constraint "participants_identifier_unique"' }).code,
    ).toBe("DUPLICATE_IDENTIFIER");
    const internal = toAppError(new Error('relation "santa.x" does not exist'));
    expect(internal.code).toBe("INTERNAL");
    expect(internal.message).not.toMatch(/relation|santa/);
  });
});
