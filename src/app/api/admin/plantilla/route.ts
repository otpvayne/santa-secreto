import type { NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { fileResponse, toCsv, toXlsx } from "@/server/export";
import { TEMPLATE_HEADERS } from "@/server/import/spreadsheet";

const EXAMPLE = [
  ["Pablo Monroy", "00", "ORGANIZER"],
  ["Laura Rodríguez", "01", "PARTICIPANT"],
  ["Carlos Martínez", "02", "PARTICIPANT"],
];

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (session?.participant?.role !== "ORGANIZER") return new Response("No autorizado", { status: 403 });
  const format = request.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  const headers = [...TEMPLATE_HEADERS];
  const body = format === "csv" ? toCsv(headers, EXAMPLE) : await toXlsx(headers, EXAMPLE, [32, 22, 16]);
  return fileResponse(body, `plantilla-santa-secreto.${format}`, format);
}
