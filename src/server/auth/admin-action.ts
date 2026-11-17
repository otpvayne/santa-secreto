import "server-only";
import { refresh } from "next/cache";
import { after } from "next/server";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { runAction, type ActionResult } from "../errors";
import { notify, type SignalKind } from "../realtime";
import type { Actor } from "../types";
import { requireOrganizerActor } from "./session";

/**
 * Envoltorio de todas las Server Actions administrativas:
 * 1. verifica sesión y rol ORGANIZER en el servidor (los servicios lo revalidan contra la BD);
 * 2. ejecuta la operación y traduce errores a mensajes amigables;
 * 3. avisa por tiempo real (después de responder) y refresca la vista.
 */
export async function adminAction<T>(
  fn: (ctx: { db: Db; actor: Actor }) => Promise<T>,
  signals: SignalKind[] = [],
): Promise<ActionResult<T>> {
  return runAction(async () => {
    const actor = await requireOrganizerActor();
    const db = await getDb();
    const result = await fn({ db, actor });
    if (signals.length > 0) after(() => notify(actor.eventId, ...signals));
    refresh();
    return result;
  });
}
