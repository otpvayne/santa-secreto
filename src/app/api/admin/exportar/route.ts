import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { toAppError } from "@/server/errors";
import { fileResponse, toCsv, toXlsx } from "@/server/export";
import { actorFromSession } from "@/server/services/auth";
import { exportTracking } from "@/server/services/draw";
import { formatDateTime } from "@/lib/format";

/** Exportación de seguimiento. Nunca incluye las asignaciones secretas. */
export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.participant) return new Response("Sesión expirada", { status: 401 });
  try {
    const rows = await exportTracking(await getDb(), actorFromSession(session));
    const format = request.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";
    const headers = ["nombre", "identificador", "rol", "activo", "estado", "fecha_participacion"];
    const data = rows.map((r) => [
      r.fullName,
      r.identifier,
      r.role,
      r.isActive ? "SI" : "NO",
      r.status,
      r.revealedAt ? formatDateTime(r.revealedAt) : "",
    ]);
    const body = format === "csv" ? toCsv(headers, data) : await toXlsx(headers, data, [32, 14, 14, 8, 14, 24]);
    const date = new Date().toISOString().slice(0, 10);
    return fileResponse(body, `seguimiento-santa-secreto-${date}.${format}`, format);
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "FORBIDDEN" ? 403 : 500 });
  }
}
