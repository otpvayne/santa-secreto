"use server";

import { after } from "next/server";
import { getDb } from "@/server/db";
import { AppError, ERROR_MESSAGES, runAction, type ActionResult } from "@/server/errors";
import { notify } from "@/server/realtime";
import { requireActor } from "@/server/auth/session";
import { claimCard, getMySecretFriend, type SecretFriendDetails } from "@/server/services/draw";
import { claimCardSchema, parseInput } from "@/lib/validation/schemas";

export type ClaimResponse =
  | { status: "OK" | "ALREADY_REVEALED"; cardNumber: number }
  | { status: "CARD_TAKEN" | "CARD_NOT_FOUND" | "DRAW_NOT_STARTED" | "DRAW_CLOSED" | "DRAW_LOCKED" | "NOT_IN_DRAW"; message: string };

/**
 * Reclama una tarjeta. El participante sale de la sesión (cookie HttpOnly), nunca del navegador.
 * La participación queda registrada aquí, pero la respuesta NO incluye al destinatario:
 * el resultado permanece oculto hasta que la persona pulse "Mostrar" (ver revealMySecretFriendAction).
 */
export async function claimCardAction(cardNumber: number): Promise<ActionResult<ClaimResponse>> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = parseInput(claimCardSchema, { cardNumber });
    const outcome = await claimCard(await getDb(), actor, input.cardNumber);
    if (outcome.status === "OK") {
      after(() => notify(actor.eventId, "cards", "event", "participants"));
      return { status: "OK", cardNumber: outcome.cardNumber };
    }
    if (outcome.status === "ALREADY_REVEALED") return { status: "ALREADY_REVEALED", cardNumber: outcome.cardNumber };
    return { status: outcome.status, message: ERROR_MESSAGES[outcome.status] };
  });
}

/**
 * "👁️ Mostrar mi amigo secreto": solicitud autenticada que devuelve SOLO la asignación propia
 * (el participante sale de la sesión) con las sugerencias de regalo vigentes del destinatario.
 * Solo lectura: no registra participación, no reclama tarjetas y no modifica nada.
 */
export async function revealMySecretFriendAction(): Promise<ActionResult<SecretFriendDetails>> {
  return runAction(async () => {
    const actor = await requireActor();
    const friend = await getMySecretFriend(await getDb(), actor);
    if (!friend) throw new AppError("NOT_FOUND", "Todavía no has descubierto a tu amigo secreto.");
    return friend;
  });
}
