"use server";

import { adminAction } from "@/server/auth/admin-action";
import { createPresentationCode } from "@/server/services/auth";
import {
  cancelTurn,
  confirmDelivery,
  finishEvent,
  getExpectedGiver,
  revertDelivery,
  startDelivery,
  startTurn,
} from "@/server/services/delivery";
import { parseInput, turnModeSchema, uuidSchema } from "@/lib/validation/schemas";

export async function startDeliveryAction() {
  return adminAction(async ({ db, actor }) => {
    await startDelivery(db, actor);
  }, ["event", "delivery"]);
}

export async function startTurnAction(mode: "RANDOM" | "MANUAL", receiverId: string | null) {
  return adminAction(async ({ db, actor }) => {
    const m = parseInput(turnModeSchema, mode);
    const target = m === "MANUAL" ? parseInput(uuidSchema, receiverId) : null;
    const turn = await startTurn(db, actor, m, target);
    return { turnId: turn.turnId };
  }, ["delivery"]);
}

export async function cancelTurnAction(turnId: string) {
  return adminAction(async ({ db, actor }) => {
    await cancelTurn(db, actor, parseInput(uuidSchema, turnId));
  }, ["delivery"]);
}

/** Muestra al organizador quién debe entregar (solo para validar el turno activo; queda auditado). */
export async function expectedGiverAction(turnId: string) {
  return adminAction(async ({ db, actor }) => getExpectedGiver(db, actor, parseInput(uuidSchema, turnId)));
}

export async function confirmDeliveryAction(turnId: string) {
  return adminAction(async ({ db, actor }) => confirmDelivery(db, actor, parseInput(uuidSchema, turnId)), ["delivery"]);
}

export async function revertDeliveryAction(turnId: string, reason: string) {
  return adminAction(async ({ db, actor }) => {
    await revertDelivery(db, actor, parseInput(uuidSchema, turnId), reason);
  }, ["delivery", "event"]);
}

export async function finishEventAction(force: boolean, reason: string | null) {
  return adminAction(async ({ db, actor }) => {
    await finishEvent(db, actor, force === true, reason);
  }, ["event", "delivery"]);
}

export async function createTvCodeAction() {
  return adminAction(async ({ db, actor }) => createPresentationCode(db, actor));
}
