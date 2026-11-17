import { IDENTIFIER_PATTERN, cleanDisplayName, cleanIdentifier, normalizeName } from "@/domain/normalize";
import { AppError } from "../errors";
import type { Role } from "../types";

/** Celda leída: texto, número (con su representación original) o vacía. */
export type RawCell = string | { num: string } | null;

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const TEMPLATE_HEADERS = ["nombre_completo", "numero_identificador", "rol"] as const;

export interface ImportRow {
  /** Número de fila en la hoja (la fila 1 son los encabezados). */
  row: number;
  fullName: string;
  nameNormalized: string;
  identifier: string;
  role: Role;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
  /** Errores generales del archivo (encabezados faltantes, etc.). */
  fileErrors: string[];
}

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------
export async function readSpreadsheet(buffer: Buffer, fileName: string): Promise<RawCell[][]> {
  if (buffer.length === 0) throw new AppError("INVALID_FILE", "El archivo está vacío.");
  if (buffer.length > MAX_IMPORT_BYTES) throw new AppError("INVALID_FILE", "El archivo supera 2 MB.");

  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK": los .xlsx son archivos ZIP
  const lower = fileName.toLowerCase();
  if (isZip || lower.endsWith(".xlsx")) {
    if (!isZip) throw new AppError("INVALID_FILE", "El archivo no es un Excel (.xlsx) válido.");
    try {
      const { readSheet } = await import("read-excel-file/node");
      const data = await readSheet<{ num: string }>(buffer, { parseNumber: (s: string) => ({ num: s }) });
      return data.map((row) =>
        row.map((cell): RawCell => {
          if (cell === null || cell === undefined) return null;
          if (typeof cell === "object" && cell !== null && "num" in cell) return { num: String(cell.num) };
          if (cell instanceof Date) return cell.toISOString().slice(0, 10);
          return String(cell);
        }),
      );
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("INVALID_FILE", "No pudimos leer el Excel. Verifica que sea un archivo .xlsx válido.");
    }
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsv(decodeText(buffer));
  }
  throw new AppError("INVALID_FILE", "Formato no soportado. Usa un archivo .xlsx o .csv.");
}

/** Decodifica UTF-8 y, si no es válido, Windows-1252 (CSV exportado por Excel en español). */
export function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Parser CSV con comillas; detecta el separador (coma, punto y coma o tabulación). */
export function parseCsv(text: string): RawCell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  const delimiter = candidates
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (c.trim() === "" ? null : c.trim())));
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
const HEADER_ALIASES: Record<string, "fullName" | "identifier" | "role"> = {
  nombre_completo: "fullName",
  nombre: "fullName",
  nombres: "fullName",
  numero_identificador: "identifier",
  identificador: "identifier",
  numero: "identifier",
  id: "identifier",
  rol: "role",
  role: "role",
};

function headerKey(value: RawCell): string {
  const text = value === null ? "" : typeof value === "string" ? value : value.num;
  return normalizeName(text).replace(/\s+/g, "_");
}

function cellText(value: RawCell | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : value.num;
}

export function parseRole(value: string): Role | null {
  const v = normalizeName(value);
  if (v === "" || v === "participant" || v === "participante") return "PARTICIPANT";
  if (v === "organizer" || v === "organizador" || v === "organizadora") return "ORGANIZER";
  return null;
}

export interface ExistingParticipants {
  names: Set<string>; // normalizados
  identifiers: Set<string>;
}

export function validateImport(table: RawCell[][], existing: ExistingParticipants): ImportPreview {
  const fileErrors: string[] = [];
  const nonEmpty = table.filter((r) => r.some((c) => cellText(c).trim() !== ""));
  if (nonEmpty.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, fileErrors: ["El archivo no tiene datos."] };
  }

  const headerRowIndex = table.indexOf(nonEmpty[0]);
  const header = nonEmpty[0].map(headerKey);
  const col: Partial<Record<"fullName" | "identifier" | "role", number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && col[key] === undefined) col[key] = i;
  });
  if (col.fullName === undefined) fileErrors.push('Falta la columna "nombre_completo".');
  if (col.identifier === undefined) fileErrors.push('Falta la columna "numero_identificador".');
  if (fileErrors.length > 0) return { rows: [], validCount: 0, errorCount: 0, fileErrors };

  const dataRows = table
    .map((cells, index) => ({ cells, rowNumber: index + 1 }))
    .slice(headerRowIndex + 1)
    .filter(({ cells }) => cells.some((c) => cellText(c).trim() !== ""));

  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      fileErrors: [`El archivo tiene ${dataRows.length} filas; el máximo es ${MAX_IMPORT_ROWS}.`],
    };
  }

  // Ancho de identificador para completar ceros si Excel guardó "07" como el número 7.
  const textIds = dataRows
    .map(({ cells }) => cells[col.identifier!])
    .filter((c): c is string => typeof c === "string")
    .map(cleanIdentifier)
    .filter((s) => IDENTIFIER_PATTERN.test(s));
  const padWidth = Math.max(2, ...textIds.map((s) => s.length), String(Math.max(dataRows.length - 1, 0)).length);

  const rows: ImportRow[] = dataRows.map(({ cells, rowNumber }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const fullName = cleanDisplayName(cellText(cells[col.fullName!]));
    const nameNormalized = normalizeName(fullName);
    if (!fullName) errors.push("El nombre está vacío.");
    else if (fullName.length < 2 || nameNormalized.length < 2) errors.push("El nombre es demasiado corto.");
    else if (fullName.length > 120) errors.push("El nombre supera 120 caracteres.");

    const rawId = cells[col.identifier!];
    let identifier = cleanIdentifier(cellText(rawId));
    if (rawId && typeof rawId === "object") {
      if (/^\d+$/.test(rawId.num)) {
        const padded = rawId.num.padStart(padWidth, "0");
        if (padded !== rawId.num) {
          warnings.push(`Excel guardó el identificador como número; se completó como "${padded}". Verifícalo.`);
        }
        identifier = padded;
      }
    }
    if (!identifier) errors.push("El identificador está vacío.");
    else if (!IDENTIFIER_PATTERN.test(identifier)) errors.push("El identificador debe tener solo números (1 a 6 dígitos).");

    const roleText = col.role === undefined ? "" : cellText(cells[col.role]);
    const role = parseRole(roleText);
    if (!role) errors.push(`Rol desconocido "${roleText}". Usa PARTICIPANT u ORGANIZER.`);

    if (nameNormalized && existing.names.has(nameNormalized)) errors.push("Ya existe un participante con este nombre.");
    if (identifier && existing.identifiers.has(identifier)) errors.push("Ya existe un participante con este identificador.");

    return { row: rowNumber, fullName, nameNormalized, identifier, role: role ?? "PARTICIPANT", errors, warnings };
  });

  // Duplicados dentro del mismo archivo.
  const byName = new Map<string, number[]>();
  const byId = new Map<string, number[]>();
  for (const r of rows) {
    if (r.nameNormalized) byName.set(r.nameNormalized, [...(byName.get(r.nameNormalized) ?? []), r.row]);
    if (r.identifier) byId.set(r.identifier, [...(byId.get(r.identifier) ?? []), r.row]);
  }
  for (const r of rows) {
    const dupName = byName.get(r.nameNormalized);
    if (dupName && dupName.length > 1) {
      r.errors.push(`Nombre repetido en las filas ${dupName.join(", ")}.`);
    }
    const dupId = byId.get(r.identifier);
    if (dupId && dupId.length > 1) {
      r.errors.push(`Identificador repetido en las filas ${dupId.join(", ")}.`);
    }
  }

  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  return { rows, validCount: rows.length - errorCount, errorCount, fileErrors };
}
