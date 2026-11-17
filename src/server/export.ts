import "server-only";

export type Cell = string | number | null;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function csvEscape(value: Cell): string {
  const s = value === null ? "" : String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV con BOM y punto y coma: Excel en español lo abre correctamente. */
export function toCsv(headers: string[], rows: Cell[][]): Buffer {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(";"));
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

export async function toXlsx(headers: string[], rows: Cell[][], widths: number[]): Promise<Buffer> {
  const writeXlsxFile = (await import("write-excel-file/node")).default;
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => ({ value: v === null ? "" : String(v), type: String, format: "@" }))),
  ];
  const buffer = await writeXlsxFile(data, { columns: widths.map((width) => ({ width })) }).toBuffer();
  return Buffer.from(buffer);
}

export function fileResponse(body: Buffer, fileName: string, format: "csv" | "xlsx"): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
