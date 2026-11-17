import { NextResponse } from "next/server";
import { canViewPhoto } from "@/domain/photo-access";
import { getDb } from "@/server/db";
import { getCurrentSession, getPresentationSession } from "@/server/auth/session";
import { readParticipantPhoto } from "@/server/services/participants";
import { getPhotoStorage } from "@/server/storage";
import { uuidSchema } from "@/lib/validation/schemas";

/**
 * Entrega una foto privada solo si el visitante está autorizado según el contexto
 * (ver src/domain/photo-access.ts). Nunca expone URLs del bucket.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/fotos/[id]">) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse(null, { status: 404 });

  try {
    const session = (await getCurrentSession()) ?? (await getPresentationSession());
    if (!session) return new NextResponse(null, { status: 401 });

    const db = await getDb();
    const viewerId = session.participant?.id ?? null;
    const { rows } = await db.query<{ exists: boolean; is_receiver: boolean }>(
      `select exists (select 1 from santa.participants where id = $1 and event_id = $2) as exists,
              exists (select 1 from santa.assignments a join santa.participants g on g.id = a.giver_id
                       where a.event_id = $2 and a.giver_id = $3 and a.receiver_id = $1
                         and g.revealed_at is not null) as is_receiver`,
      [id, session.event.id, viewerId],
    );
    if (!rows[0]?.exists) return new NextResponse(null, { status: 404 });

    const allowed = canViewPhoto(
      {
        kind: session.kind,
        participantId: viewerId,
        role: session.participant?.role ?? null,
        eventId: session.event.id,
      },
      { participantId: id, eventId: session.event.id },
      { eventStatus: session.event.status, targetIsViewersRevealedReceiver: rows[0].is_receiver },
    );
    if (!allowed) return new NextResponse(null, { status: 403 });

    const photo = await readParticipantPhoto(db, await getPhotoStorage(), session.event.id, id);
    if (!photo) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    console.error("[santa] error al servir foto:", e);
    return new NextResponse(null, { status: 503 });
  }
}
