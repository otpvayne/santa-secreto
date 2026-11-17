"use server";

import { adminAction } from "@/server/auth/admin-action";
import { SESSION_COOKIE, clearAuthCookie } from "@/server/auth/session";
import { getPhotoStorage } from "@/server/storage";
import {
  activateEvent,
  archiveEvent,
  createEvent,
  purgeEvent,
  updateEvent,
} from "@/server/services/events";
import { parseInput, uuidSchema } from "@/lib/validation/schemas";

export async function updateEventAction(input: unknown) {
  return adminAction(async ({ db, actor }) => {
    await updateEvent(db, actor, input);
  }, ["event"]);
}

export async function createEventAction(input: unknown, copyParticipants: boolean) {
  return adminAction(async ({ db, actor }) => ({ id: await createEvent(db, actor, input, copyParticipants === true) }));
}

/** Cambia el evento actual: todas las sesiones se cierran (incluida la propia). */
export async function activateEventAction(targetId: string) {
  return adminAction(async ({ db, actor }) => {
    await activateEvent(db, actor, parseInput(uuidSchema, targetId));
    await clearAuthCookie(SESSION_COOKIE);
  }, ["event"]);
}

export async function archiveEventAction() {
  return adminAction(async ({ db, actor }) => {
    await archiveEvent(db, actor);
  }, ["event"]);
}

export async function purgeEventAction(targetId: string, mode: "PHOTOS" | "ALL") {
  return adminAction(async ({ db, actor }) => ({
    photos: await purgeEvent(
      db,
      await getPhotoStorage().catch(() => null),
      actor,
      parseInput(uuidSchema, targetId),
      mode === "ALL" ? "ALL" : "PHOTOS",
    ),
  }));
}
