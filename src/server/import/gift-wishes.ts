import { GIFT_WISHES_MAX, cleanGiftWishes } from "@/domain/gift-wishes";
import { IDENTIFIER_PATTERN, cleanDisplayName, cleanIdentifier, normalizeName } from "@/domain/normalize";
import { MAX_IMPORT_ROWS, type RawCell } from "./spreadsheet";

/**
 * Importación de SUGERENCIAS DE REGALO para participantes que YA existen.
 * Funciones puras: no leen ni escriben la base de datos.
 *
 * Reglas de seguridad:
 *  - nunca se crean participantes;
 *  - se prioriza el número identificador y se comprueba contra el nombre;
 *  - sin identificador, solo se acepta el nombre normalizado EXACTO (único por evento);
 *  - nunca se usa una coincidencia aproximada;
 *  - una celda vacía significa "sin cambios", jamás "borrar".
 */

export interface WishesParticipant {
  id: string;
  fullName: string;
  identifier: string;
  giftWishes: string | null;
}

export type WishRowStatus =
  /** Coincidencia segura con texto nuevo: se puede aplicar. */
  | "UPDATE"
  /** Coincidencia con una advertencia: el organizador debe revisarla y marcarla. */
  | "REVIEW"
  /** El participante ya tiene exactamente ese texto. */
  | "UNCHANGED"
  /** Celda vacía: se conservan las sugerencias actuales. */
  | "EMPTY"
  /** No existe ningún participante que coincida. */
  | "NOT_FOUND"
  /** Nombre e identificador no concuerdan, filas repetidas, texto demasiado largo… No se aplica. */
  | "CONFLICT";

export const APPLICABLE_STATUSES: readonly WishRowStatus[] = ["UPDATE", "REVIEW"];

export interface WishRow {
  /** Número de fila en la hoja (1 = encabezados). */
  row: number;
  fileName: string;
  fileIdentifier: string;
  participantId: string | null;
  participantName: string | null;
  participantIdentifier: string | null;
  matchedBy: "identifier" | "name" | null;
  current: string | null;
  next: string | null;
  status: WishRowStatus;
  messages: string[];
}

export interface WishesColumns {
  name?: number;
  identifier?: number;
  wishes?: number;
}

export interface WishesSummary {
  total: number;
  found: number;
  notFound: number;
  conflicts: number;
  withWishes: number;
  withoutWishes: number;
  toUpdate: number;
  review: number;
  unchanged: number;
}

export interface WishesPreview {
  headers: { index: number; label: string }[];
  columns: WishesColumns;
  /** true si la columna de sugerencias se reconoció sola (o la eligió el organizador). */
  wishesColumnResolved: boolean;
  fileErrors: string[];
  rows: WishRow[];
  summary: WishesSummary;
}

function cellText(value: RawCell | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : value.num;
}

function headerKey(value: RawCell | undefined): string {
  return normalizeName(cellText(value)).replace(/\s+/g, "_");
}

const NAME_EXACT = ["nombre_completo", "nombre", "nombres", "nombre_y_apellido", "nombres_y_apellidos", "participante", "nombre_participante"];
const ID_EXACT = ["numero_identificador", "identificador", "numero", "id", "n", "no", "nro", "num", "codigo"];
const WISHES_WORDS = ["regalo", "sugerencia", "deseo", "gustaria", "wish", "opciones", "ideas"];

/** Detecta columnas por su encabezado. Nunca asigna la misma columna a dos campos. */
export function detectColumns(header: RawCell[]): WishesColumns {
  const keys = header.map(headerKey);
  const cols: WishesColumns = {};
  const used = new Set<number>();
  const pick = (test: (k: string) => boolean): number | undefined => {
    const i = keys.findIndex((k, idx) => k !== "" && !used.has(idx) && test(k));
    if (i >= 0) used.add(i);
    return i >= 0 ? i : undefined;
  };
  // Primero las sugerencias: un encabezado como "Nombre del regalo que me gustaría" no es el nombre.
  cols.wishes = pick((k) => WISHES_WORDS.some((w) => k.includes(w)));
  cols.identifier =
    pick((k) => ID_EXACT.includes(k)) ?? pick((k) => k.includes("identificador") || k.startsWith("numero"));
  cols.name = pick((k) => NAME_EXACT.includes(k)) ?? pick((k) => k.includes("nombre"));
  return cols;
}

const EMPTY_SUMMARY: WishesSummary = {
  total: 0,
  found: 0,
  notFound: 0,
  conflicts: 0,
  withWishes: 0,
  withoutWishes: 0,
  toUpdate: 0,
  review: 0,
  unchanged: 0,
};

export function analyzeGiftWishes(
  table: RawCell[][],
  participants: WishesParticipant[],
  opts: { wishesColumn?: number | null } = {},
): WishesPreview {
  const nonEmpty = table.filter((r) => r.some((c) => cellText(c).trim() !== ""));
  if (nonEmpty.length === 0) {
    return { headers: [], columns: {}, wishesColumnResolved: false, fileErrors: ["El archivo no tiene datos."], rows: [], summary: EMPTY_SUMMARY };
  }
  const headerRow = nonEmpty[0];
  const headerRowIndex = table.indexOf(headerRow);
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, index) => ({
    index,
    label: cellText(headerRow[index]).trim() || `Columna ${index + 1}`,
  }));

  const columns = detectColumns(headerRow);
  if (opts.wishesColumn !== undefined && opts.wishesColumn !== null) {
    if (!Number.isInteger(opts.wishesColumn) || opts.wishesColumn < 0 || opts.wishesColumn >= width) {
      return { headers, columns, wishesColumnResolved: false, fileErrors: ["La columna elegida no existe."], rows: [], summary: EMPTY_SUMMARY };
    }
    columns.wishes = opts.wishesColumn;
    if (columns.name === opts.wishesColumn) delete columns.name;
    if (columns.identifier === opts.wishesColumn) delete columns.identifier;
  }

  const fileErrors: string[] = [];
  if (columns.name === undefined && columns.identifier === undefined) {
    fileErrors.push('No encontramos una columna de nombre ("nombre_completo") ni de identificador ("numero_identificador").');
  }
  if (columns.wishes === undefined) {
    return { headers, columns, wishesColumnResolved: false, fileErrors, rows: [], summary: EMPTY_SUMMARY };
  }
  if (fileErrors.length > 0) {
    return { headers, columns, wishesColumnResolved: true, fileErrors, rows: [], summary: EMPTY_SUMMARY };
  }

  const dataRows = table
    .map((cells, index) => ({ cells, rowNumber: index + 1 }))
    .slice(headerRowIndex + 1)
    .filter(({ cells }) => cells.some((c) => cellText(c).trim() !== ""));
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      headers,
      columns,
      wishesColumnResolved: true,
      fileErrors: [`El archivo tiene ${dataRows.length} filas; el máximo es ${MAX_IMPORT_ROWS}.`],
      rows: [],
      summary: EMPTY_SUMMARY,
    };
  }

  const byId = new Map(participants.map((p) => [p.identifier, p]));
  const byName = new Map(participants.map((p) => [normalizeName(p.fullName), p]));
  const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, "");

  const rows: WishRow[] = dataRows.map(({ cells, rowNumber }) => {
    const messages: string[] = [];
    const fileName = columns.name === undefined ? "" : cleanDisplayName(cellText(cells[columns.name]));
    const nameNorm = normalizeName(fileName);
    const rawId = columns.identifier === undefined ? null : cells[columns.identifier];
    const fileIdentifier = cleanIdentifier(cellText(rawId ?? null));
    const next = cleanGiftWishes(cellText(cells[columns.wishes!]));

    let match: WishesParticipant | null = null;
    let matchedBy: WishRow["matchedBy"] = null;
    let status: WishRowStatus = "UPDATE";
    const fail = (s: "NOT_FOUND" | "CONFLICT", msg: string): WishRow => ({
      row: rowNumber,
      fileName,
      fileIdentifier,
      participantId: null,
      participantName: null,
      participantIdentifier: null,
      matchedBy: null,
      current: null,
      next,
      status: s,
      messages: [...messages, msg],
    });

    if (fileIdentifier) {
      if (!IDENTIFIER_PATTERN.test(fileIdentifier)) {
        return fail("CONFLICT", `El identificador "${fileIdentifier}" no es válido (solo números, 1 a 6 dígitos).`);
      }
      match = byId.get(fileIdentifier) ?? null;
      if (!match) {
        // Excel suele guardar "07" como el número 7: se busca ignorando ceros iniciales, solo si es inequívoco.
        const candidates = participants.filter((p) => stripZeros(p.identifier) === stripZeros(fileIdentifier));
        if (candidates.length === 1) {
          match = candidates[0];
          messages.push(`El archivo dice "${fileIdentifier}" y el participante tiene "${match.identifier}" (ceros iniciales).`);
          if (!nameNorm) status = "REVIEW";
        }
      }
      matchedBy = match ? "identifier" : null;

      if (match && nameNorm && normalizeName(match.fullName) !== nameNorm) {
        const other = byName.get(nameNorm);
        return fail(
          "CONFLICT",
          other
            ? `El número ${fileIdentifier} es de "${match.fullName}", pero "${fileName}" tiene el número ${other.identifier}. Revisa la fila.`
            : `El número ${fileIdentifier} es de "${match.fullName}", no de "${fileName}". Revisa la fila.`,
        );
      }
      if (!match) {
        const other = nameNorm ? byName.get(nameNorm) : undefined;
        if (other) {
          return fail("CONFLICT", `"${other.fullName}" existe, pero su número es ${other.identifier}, no ${fileIdentifier}.`);
        }
        return fail("NOT_FOUND", `No hay ningún participante con el número ${fileIdentifier} en este evento.`);
      }
      if (!nameNorm) {
        status = "REVIEW";
        messages.push("La fila no tiene nombre: no se pudo comprobar que el número corresponda a la persona.");
      }
    } else if (nameNorm) {
      match = byName.get(nameNorm) ?? null;
      if (!match) return fail("NOT_FOUND", `No hay ningún participante llamado "${fileName}" en este evento.`);
      matchedBy = "name";
      messages.push("Identificado por el nombre completo (coincidencia exacta).");
    } else {
      return fail("NOT_FOUND", "La fila no tiene nombre ni número identificador.");
    }

    const current = cleanGiftWishes(match.giftWishes);
    if (next === null) {
      status = "EMPTY";
      messages.push(current ? "Celda vacía: se conservan las sugerencias actuales." : "Todavía no tiene sugerencias.");
    } else if (next.length > GIFT_WISHES_MAX) {
      status = "CONFLICT";
      messages.push(`El texto supera ${GIFT_WISHES_MAX} caracteres.`);
    } else if (next === current) {
      status = "UNCHANGED";
    }

    return {
      row: rowNumber,
      fileName,
      fileIdentifier,
      participantId: match.id,
      participantName: match.fullName,
      participantIdentifier: match.identifier,
      matchedBy,
      current,
      next,
      status,
      messages,
    };
  });

  // Dos filas con texto para la misma persona: no se adivina cuál es la buena.
  const withText = new Map<string, WishRow[]>();
  for (const r of rows) {
    if (r.participantId && r.next !== null) withText.set(r.participantId, [...(withText.get(r.participantId) ?? []), r]);
  }
  for (const group of withText.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      r.status = "CONFLICT";
      r.messages.push(`${r.participantName} aparece en varias filas (${group.map((g) => g.row).join(", ")}).`);
    }
  }

  const summary: WishesSummary = {
    total: rows.length,
    found: rows.filter((r) => r.participantId !== null).length,
    notFound: rows.filter((r) => r.status === "NOT_FOUND").length,
    conflicts: rows.filter((r) => r.status === "CONFLICT").length,
    withWishes: rows.filter((r) => r.next !== null).length,
    withoutWishes: rows.filter((r) => r.next === null).length,
    toUpdate: rows.filter((r) => r.status === "UPDATE").length,
    review: rows.filter((r) => r.status === "REVIEW").length,
    unchanged: rows.filter((r) => r.status === "UNCHANGED").length,
  };
  return { headers, columns, wishesColumnResolved: true, fileErrors: [], rows, summary };
}

export interface WishSelection {
  row: number;
  participantId: string;
}

/**
 * Valida la selección del organizador contra un análisis recién hecho en el servidor.
 * Cada fila elegida debe seguir siendo aplicable y apuntar al MISMO participante que vio en la vista previa.
 */
export function selectApplicable(preview: WishesPreview, selection: WishSelection[]): { id: string; gift_wishes: string }[] {
  const byRow = new Map(preview.rows.map((r) => [r.row, r]));
  const seen = new Set<string>();
  const out: { id: string; gift_wishes: string }[] = [];
  for (const s of selection) {
    const r = byRow.get(s.row);
    if (!r || !APPLICABLE_STATUSES.includes(r.status) || r.participantId !== s.participantId || r.next === null) {
      throw new Error(`STALE_ROW:${s.row}`);
    }
    if (seen.has(r.participantId)) throw new Error(`STALE_ROW:${s.row}`);
    seen.add(r.participantId);
    out.push({ id: r.participantId, gift_wishes: r.next });
  }
  return out;
}
