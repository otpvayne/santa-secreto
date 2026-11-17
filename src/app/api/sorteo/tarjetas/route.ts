import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { getCardsState } from "@/server/services/draw";
import { toAppError } from "@/server/errors";

/** Estado de las tarjetas: solo números ocupados (nunca quién los tomó ni asignaciones). */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session?.participant) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const state = await getCardsState(await getDb(), session.event.id);
    return NextResponse.json(
      { ...state, revealed: !!session.participant.revealedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const err = toAppError(e);
    return NextResponse.json({ error: err.code, message: err.message }, { status: 503 });
  }
}
