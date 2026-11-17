import type { EventStatus } from "@/domain/event-state";

export type Role = "PARTICIPANT" | "ORGANIZER";

/** Quién ejecuta una operación. Se construye SIEMPRE en el servidor a partir de la sesión. */
export interface Actor {
  participantId: string;
  eventId: string;
  role: Role;
}

export interface SessionEvent {
  id: string;
  name: string;
  year: number;
  status: EventStatus;
  drawLocked: boolean;
}

export interface SessionParticipant {
  id: string;
  fullName: string;
  identifier: string;
  role: Role;
  hasPhoto: boolean;
  photoVersion: number;
  revealedAt: Date | null;
}

export interface Session {
  id: string;
  kind: "PARTICIPANT" | "PRESENTATION";
  expiresAt: Date;
  event: SessionEvent;
  participant: SessionParticipant | null;
}

/** Persona tal como se muestra en pantalla (sin datos secretos). */
export interface PublicPerson {
  id: string;
  fullName: string;
  photoUrl: string | null;
}

export function photoUrl(participantId: string, hasPhoto: boolean, version: number): string | null {
  return hasPhoto ? `/api/fotos/${participantId}?v=${version}` : null;
}
