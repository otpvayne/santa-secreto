import { describe, expect, it } from "vitest";
import { decodeText, parseCsv, readSpreadsheet, validateImport, type RawCell } from "@/server/import/spreadsheet";

const empty = { names: new Set<string>(), identifiers: new Set<string>() };

describe("lectura de CSV", () => {
  it("detecta punto y coma y respeta comillas", () => {
    const rows = parseCsv('nombre_completo;numero_identificador;rol\n"Pérez; Juan";00;ORGANIZER\r\nLaura;01;PARTICIPANT\n');
    expect(rows).toEqual([
      ["nombre_completo", "numero_identificador", "rol"],
      ["Pérez; Juan", "00", "ORGANIZER"],
      ["Laura", "01", "PARTICIPANT"],
    ]);
  });
  it("decodifica CSV de Excel en Windows-1252", () => {
    const buf = Buffer.from([0x4a, 0x6f, 0x73, 0xe9]); // "José" en latin1
    expect(decodeText(buf)).toBe("José");
  });
});

describe("validación de importación", () => {
  const header: RawCell[] = ["nombre_completo", "numero_identificador", "rol"];

  it("acepta filas válidas y conserva ceros iniciales", () => {
    const res = validateImport(
      [header, ["Pablo Monroy", "00", "ORGANIZER"], ["Laura Rodríguez", "01", "participante"], ["Carlos Martínez", "02", null]],
      empty,
    );
    expect(res.fileErrors).toEqual([]);
    expect(res.errorCount).toBe(0);
    expect(res.rows.map((r) => [r.identifier, r.role])).toEqual([
      ["00", "ORGANIZER"],
      ["01", "PARTICIPANT"],
      ["02", "PARTICIPANT"],
    ]);
  });

  it("detecta nombres vacíos, identificadores inválidos, roles desconocidos y duplicados", () => {
    const res = validateImport(
      [
        header,
        [null, "03", "PARTICIPANT"],
        ["Ana", "x1", "PARTICIPANT"],
        ["Beto", "04", "JEFE"],
        ["José Pérez", "05", null],
        ["jose  perez", "06", null],
        ["Carla", "05", null],
      ],
      empty,
    );
    expect(res.errorCount).toBe(6);
    expect(res.rows[0].errors.join()).toMatch(/vacío/);
    expect(res.rows[1].errors.join()).toMatch(/solo números/);
    expect(res.rows[2].errors.join()).toMatch(/Rol desconocido/);
    expect(res.rows[3].errors.join()).toMatch(/Nombre repetido/);
    expect(res.rows[5].errors.join()).toMatch(/Identificador repetido/);
  });

  it("detecta duplicados contra participantes existentes", () => {
    const res = validateImport([header, ["Laura Rodriguez", "09", null]], {
      names: new Set(["laura rodriguez"]),
      identifiers: new Set(["09"]),
    });
    expect(res.rows[0].errors).toHaveLength(2);
  });

  it("completa ceros cuando Excel guardó el identificador como número y lo advierte", () => {
    const res = validateImport([header, ["Pablo", { num: "0" }, null], ["Laura", "01", null]], empty);
    expect(res.rows[0].identifier).toBe("00");
    expect(res.rows[0].warnings[0]).toMatch(/00/);
  });

  it("informa columnas faltantes", () => {
    const res = validateImport([["nombre", "edad"], ["Ana", 3 as unknown as RawCell]], empty);
    expect(res.fileErrors.join()).toMatch(/numero_identificador/);
  });

  it("lee un .xlsx real generado con la plantilla", async () => {
    const writeXlsxFile = (await import("write-excel-file/node")).default;
    const buffer = await writeXlsxFile([
      [{ value: "nombre_completo" }, { value: "numero_identificador" }, { value: "rol" }],
      [{ value: "Pablo Monroy" }, { value: "00", type: String }, { value: "ORGANIZER" }],
      [{ value: "Laura Rodríguez" }, { value: 1, type: Number }, { value: "PARTICIPANT" }],
    ]).toBuffer();
    const table = await readSpreadsheet(Buffer.from(buffer), "familia.xlsx");
    const res = validateImport(table, empty);
    expect(res.errorCount).toBe(0);
    expect(res.rows.map((r) => r.identifier)).toEqual(["00", "01"]);
    expect(res.rows[1].fullName).toBe("Laura Rodríguez");
  });

  it("rechaza archivos que no son hojas de cálculo", async () => {
    await expect(readSpreadsheet(Buffer.from("hola"), "foto.png")).rejects.toThrow();
    await expect(readSpreadsheet(Buffer.from("no es zip"), "a.xlsx")).rejects.toThrow();
  });
});
