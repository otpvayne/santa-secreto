import { describe, expect, it } from "vitest";
import { cleanGiftWishes, hasGiftWishes } from "@/domain/gift-wishes";
import { giftWishesSchema, parseInput } from "@/lib/validation/schemas";
import { analyzeGiftWishes, detectColumns, selectApplicable, type WishesParticipant } from "@/server/import/gift-wishes";
import { parseCsv, readSpreadsheet, type RawCell } from "@/server/import/spreadsheet";

const PEOPLE: WishesParticipant[] = [
  { id: "a0000000-0000-4000-8000-000000000000", fullName: "Pablo Monroy", identifier: "00", giftWishes: null },
  { id: "a0000000-0000-4000-8000-000000000001", fullName: "Laura Rodríguez", identifier: "01", giftWishes: "Un libro" },
  { id: "a0000000-0000-4000-8000-000000000002", fullName: "José Pérez", identifier: "07", giftWishes: "Chocolates" },
  { id: "a0000000-0000-4000-8000-000000000003", fullName: "Ana María Díaz", identifier: "12", giftWishes: null },
];
const H: RawCell[] = ["nombre_completo", "numero_identificador", "¿Qué te gustaría recibir?"];

describe("texto de sugerencias", () => {
  it("conserva redacción, comas, tildes, emojis y saltos de línea", () => {
    const text = "Una camiseta talla M, algo de fútbol ⚽\no una billetera… ¡sorpréndeme! & <b>";
    expect(cleanGiftWishes(text)).toBe(text);
    expect(cleanGiftWishes("Un perfume sin comas y una frase completa")).toBe("Un perfume sin comas y una frase completa");
    expect(cleanGiftWishes("  línea 1\r\nlínea 2\r\n\r\nlínea 4  ")).toBe("línea 1\nlínea 2\n\nlínea 4");
  });
  it("vacío / null significan 'sin sugerencias' (nunca 'null' ni 'undefined')", () => {
    expect(cleanGiftWishes("")).toBeNull();
    expect(cleanGiftWishes("   \n ")).toBeNull();
    expect(cleanGiftWishes(null)).toBeNull();
    expect(cleanGiftWishes(undefined)).toBeNull();
    expect(hasGiftWishes(null)).toBe(false);
    expect(hasGiftWishes("Algo")).toBe(true);
  });
  it("el esquema convierte '' en null (borrado explícito) y limita la longitud", () => {
    expect(parseInput(giftWishesSchema, "")).toBeNull();
    expect(parseInput(giftWishesSchema, null)).toBeNull();
    expect(parseInput(giftWishesSchema, "Ñandú, café\ny más")).toBe("Ñandú, café\ny más");
    expect(() => parseInput(giftWishesSchema, "x".repeat(4001))).toThrow(/demasiado largas/);
  });
});

describe("detección de columnas", () => {
  it("reconoce encabezados habituales sin confundir 'nombre' con la columna de regalo", () => {
    expect(detectColumns(["Nombre completo", "Número identificador", "Opciones de regalo"])).toEqual({ name: 0, identifier: 1, wishes: 2 });
    expect(detectColumns(["Nombre del regalo que me gustaría", "N°", "Nombre"])).toEqual({ wishes: 0, identifier: 1, name: 2 });
    expect(detectColumns(["participante", "notas"])).toEqual({ name: 0, identifier: undefined, wishes: undefined });
  });
});

describe("análisis de importación de sugerencias", () => {
  it("empareja por identificador + nombre y conserva el texto original", () => {
    const res = analyzeGiftWishes(
      [
        H,
        ["Pablo Monroy", "00", "Una camiseta talla M, algo de fútbol\no una billetera"],
        ["laura rodriguez", "01", "Audífonos inalámbricos"], // nombre sin tildes ni mayúsculas
        ["José Pérez", "07", "Chocolates"], // igual al actual
      ],
      PEOPLE,
    );
    expect(res.fileErrors).toEqual([]);
    expect(res.rows.map((r) => r.status)).toEqual(["UPDATE", "UPDATE", "UNCHANGED"]);
    expect(res.rows[0].next).toBe("Una camiseta talla M, algo de fútbol\no una billetera");
    expect(res.rows[1]).toMatchObject({ participantId: PEOPLE[1].id, current: "Un libro", next: "Audífonos inalámbricos" });
    expect(res.summary).toMatchObject({ total: 3, found: 3, toUpdate: 2, unchanged: 1, withWishes: 3 });
  });

  it("celdas vacías: no borran nada y se informan", () => {
    const res = analyzeGiftWishes([H, ["Laura Rodríguez", "01", null], ["Ana María Díaz", "12", "   "]], PEOPLE);
    expect(res.rows.map((r) => r.status)).toEqual(["EMPTY", "EMPTY"]);
    expect(res.rows[0].messages.join()).toMatch(/se conservan/);
    expect(res.rows[1].messages.join()).toMatch(/Todavía no tiene/);
    expect(res.summary).toMatchObject({ withoutWishes: 2, toUpdate: 0 });
    expect(() => selectApplicable(res, [{ row: 2, participantId: PEOPLE[1].id }])).toThrow();
  });

  it("si número y nombre no coinciden: conflicto (nunca actualiza a la persona equivocada)", () => {
    const res = analyzeGiftWishes(
      [H, ["Laura Rodríguez", "00", "Algo"], ["Pedro Inexistente", "01", "Algo"], ["Ana María Díaz", "99", "Algo"]],
      PEOPLE,
    );
    expect(res.rows.map((r) => r.status)).toEqual(["CONFLICT", "CONFLICT", "CONFLICT"]);
    expect(res.rows.every((r) => r.participantId === null)).toBe(true);
    expect(res.rows[2].messages.join()).toMatch(/su número es 12/);
  });

  it("sin coincidencia: no crea participantes", () => {
    const res = analyzeGiftWishes([H, ["Nadie Conocido", "55", "Algo"], ["Otro Más", null, "Algo"]], PEOPLE);
    expect(res.rows.map((r) => r.status)).toEqual(["NOT_FOUND", "NOT_FOUND"]);
    expect(res.summary.notFound).toBe(2);
  });

  it("sin columna de identificador: solo nombre normalizado exacto", () => {
    const res = analyzeGiftWishes(
      [["Nombre", "Sugerencias"], ["JOSE   perez", "Un reloj"], ["José", "Algo"], ["Pérez José", "Algo"]],
      PEOPLE,
    );
    expect(res.rows.map((r) => r.status)).toEqual(["UPDATE", "NOT_FOUND", "NOT_FOUND"]);
    expect(res.rows[0]).toMatchObject({ matchedBy: "name", participantId: PEOPLE[2].id });
  });

  it("identificador numérico sin ceros iniciales: lo reconoce si es inequívoco", () => {
    const withName = analyzeGiftWishes([H, ["José Pérez", { num: "7" }, "Un reloj"]], PEOPLE);
    expect(withName.rows[0]).toMatchObject({ status: "UPDATE", participantId: PEOPLE[2].id });
    expect(withName.rows[0].messages.join()).toMatch(/ceros iniciales/);
    // Sin nombre no se puede comprobar: requiere revisión manual.
    const noName = analyzeGiftWishes([["numero_identificador", "regalo"], [{ num: "7" }, "Un reloj"]], PEOPLE);
    expect(noName.rows[0].status).toBe("REVIEW");
  });

  it("la misma persona en dos filas con texto: conflicto en ambas", () => {
    const res = analyzeGiftWishes([H, ["Pablo Monroy", "00", "A"], ["Pablo Monroy", "00", "B"]], PEOPLE);
    expect(res.rows.map((r) => r.status)).toEqual(["CONFLICT", "CONFLICT"]);
  });

  it("si no reconoce la columna, deja elegirla manualmente", () => {
    const table: RawCell[][] = [["nombre_completo", "numero_identificador", "Columna rara"], ["Pablo Monroy", "00", "Una bufanda"]];
    const auto = analyzeGiftWishes(table, PEOPLE);
    expect(auto.wishesColumnResolved).toBe(false);
    expect(auto.headers.map((h) => h.label)).toEqual(["nombre_completo", "numero_identificador", "Columna rara"]);
    const manual = analyzeGiftWishes(table, PEOPLE, { wishesColumn: 2 });
    expect(manual.rows[0]).toMatchObject({ status: "UPDATE", next: "Una bufanda" });
    expect(analyzeGiftWishes(table, PEOPLE, { wishesColumn: 9 }).fileErrors).toHaveLength(1);
  });

  it("la selección se revalida contra el análisis del servidor", () => {
    const res = analyzeGiftWishes([H, ["Pablo Monroy", "00", "Una bufanda"]], PEOPLE);
    expect(selectApplicable(res, [{ row: 2, participantId: PEOPLE[0].id }])).toEqual([
      { id: PEOPLE[0].id, gift_wishes: "Una bufanda" },
    ]);
    // Otra persona distinta de la revisada → se rechaza.
    expect(() => selectApplicable(res, [{ row: 2, participantId: PEOPLE[1].id }])).toThrow();
    expect(() => selectApplicable(res, [{ row: 3, participantId: PEOPLE[0].id }])).toThrow();
  });

  it("CSV con comillas conserva saltos de línea y comas dentro de la celda", () => {
    const table = parseCsv('nombre_completo;numero_identificador;regalo\nPablo Monroy;00;"Una camiseta, talla M\nAlgo de fútbol"\n');
    const res = analyzeGiftWishes(table, PEOPLE);
    expect(res.rows[0].next).toBe("Una camiseta, talla M\nAlgo de fútbol");
  });

  it("lee un .xlsx real con saltos de línea y caracteres especiales en la celda", async () => {
    const writeXlsxFile = (await import("write-excel-file/node")).default;
    const wish = "Perfume 🌸, una bufanda\ny chocolates «Jet» — ¡lo que sea!";
    const buffer = await writeXlsxFile([
      [{ value: "Nombre completo" }, { value: "Número identificador" }, { value: "Sugerencias de regalo" }],
      [{ value: "Ana María Díaz" }, { value: "12", type: String }, { value: wish }],
      [{ value: "Pablo Monroy" }, { value: 0, type: Number }, null],
    ]).toBuffer();
    const table = await readSpreadsheet(Buffer.from(buffer), "sugerencias.xlsx");
    const res = analyzeGiftWishes(table, PEOPLE);
    expect(res.rows[0]).toMatchObject({ status: "UPDATE", next: wish, participantId: PEOPLE[3].id });
    expect(res.rows[1]).toMatchObject({ status: "EMPTY", participantId: PEOPLE[0].id });
  });
});
