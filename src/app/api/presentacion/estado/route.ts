import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getCurrentSession, getPresentationSession } from "@/server/auth/session";
import { getPresentationState } from "@/server/services/delivery";
import { toAppError } from "@/server/errors";

/**
 * Estado PÚBLICO para el televisor. Accesible con una sesión de presentación o de organizador.
 * Nunca contiene el regalador de un turno que no se ha confirmado.
 */
export async function GET() {
  try {
    const organizer = await getCurrentSession();
    const session =
      organizer?.participant?.role === "ORGANIZER" ? organizer : await getPresentationSession();
    if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const state = await getPresentationState(await getDb(), session.event.id);
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const err = toAppError(e);
    return NextResponse.json({ error: err.code, message: err.message }, { status: 503 });
  }
}
