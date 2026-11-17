import type { EventStatus } from "./event-state";

export interface PhotoViewer {
  kind: "PARTICIPANT" | "PRESENTATION";
  participantId: string | null;
  role: "PARTICIPANT" | "ORGANIZER" | null;
  eventId: string;
}

export interface PhotoTarget {
  participantId: string;
  eventId: string;
}

export interface PhotoContext {
  eventStatus: EventStatus;
  /** true si el visitante ya reveló su asignación y el objetivo es su amigo secreto. */
  targetIsViewersRevealedReceiver: boolean;
}

/** Estados en los que la familia está reunida y las fotos se muestran en la entrega. */
const PARTY_STATES: EventStatus[] = ["DELIVERY_ACTIVE", "COMPLETED", "ARCHIVED"];
const PRESENTATION_STATES: EventStatus[] = ["READY_FOR_DELIVERY", "DELIVERY_ACTIVE", "COMPLETED", "ARCHIVED"];

/**
 * ¿Puede este visitante ver la foto de este participante?
 * Nunca se cruzan eventos. Un participante normal ve su propia foto y la de su amigo secreto
 * (después de revelarlo); durante la entrega se ven todas, porque se proyectan en el televisor.
 */
export function canViewPhoto(viewer: PhotoViewer, target: PhotoTarget, ctx: PhotoContext): boolean {
  if (viewer.eventId !== target.eventId) return false;

  if (viewer.kind === "PRESENTATION") {
    return PRESENTATION_STATES.includes(ctx.eventStatus);
  }
  if (!viewer.participantId) return false;
  if (viewer.role === "ORGANIZER") return true;
  if (viewer.participantId === target.participantId) return true;
  if (ctx.targetIsViewersRevealedReceiver) return true;
  return PARTY_STATES.includes(ctx.eventStatus);
}
