"use server";

import { adminAction } from "@/server/auth/admin-action";
import { resetDraw, setDrawLocked, startDraw } from "@/server/services/draw";

export async function startDrawAction() {
  return adminAction(async ({ db, actor }) => ({ participants: await startDraw(db, actor) }), ["event", "cards", "participants"]);
}

export async function setDrawLockedAction(locked: boolean) {
  return adminAction(async ({ db, actor }) => {
    await setDrawLocked(db, actor, locked === true);
  }, ["event", "cards"]);
}

export async function resetDrawAction(reason: string) {
  return adminAction(async ({ db, actor }) => {
    await resetDraw(db, actor, reason);
  }, ["event", "cards", "participants"]);
}
