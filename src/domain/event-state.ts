export const EVENT_STATUSES = [
  "DRAFT",
  "DRAW_OPEN",
  "READY_FOR_DELIVERY",
  "DELIVERY_ACTIVE",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export type EventAction =
  | "START_DRAW"
  | "ALL_REVEALED"
  | "RESET_DRAW"
  | "START_DELIVERY"
  | "FINISH_EVENT"
  | "REVERT_DELIVERY"
  | "ARCHIVE";

/**
 * Máquina de estados explícita. La base de datos aplica las mismas reglas dentro de cada función;
 * esta tabla sirve para la interfaz (qué botones mostrar) y para las pruebas.
 */
export const TRANSITIONS: Record<EventAction, { from: EventStatus[]; to: EventStatus }> = {
  START_DRAW: { from: ["DRAFT"], to: "DRAW_OPEN" },
  ALL_REVEALED: { from: ["DRAW_OPEN"], to: "READY_FOR_DELIVERY" },
  RESET_DRAW: { from: ["DRAW_OPEN", "READY_FOR_DELIVERY"], to: "DRAFT" },
  START_DELIVERY: { from: ["READY_FOR_DELIVERY"], to: "DELIVERY_ACTIVE" },
  FINISH_EVENT: { from: ["DELIVERY_ACTIVE"], to: "COMPLETED" },
  REVERT_DELIVERY: { from: ["DELIVERY_ACTIVE", "COMPLETED"], to: "DELIVERY_ACTIVE" },
  ARCHIVE: { from: ["COMPLETED"], to: "ARCHIVED" },
};

export function canTransition(status: EventStatus, action: EventAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "En preparación",
  DRAW_OPEN: "Sorteo abierto",
  READY_FOR_DELIVERY: "Listo para la entrega",
  DELIVERY_ACTIVE: "Entrega en curso",
  COMPLETED: "Finalizado",
  ARCHIVED: "Archivado",
};

export const STATUS_DESCRIPTIONS: Record<EventStatus, string> = {
  DRAFT: "Los organizadores están preparando la lista de participantes. ¡Muy pronto podrás participar!",
  DRAW_OPEN: "¡El sorteo está abierto! Escoge una tarjeta para descubrir a tu amigo secreto.",
  READY_FOR_DELIVERY: "Todos ya descubrieron a su amigo secreto. ¡Prepara tu regalo!",
  DELIVERY_ACTIVE: "¡La Gran Revelación está en curso!",
  COMPLETED: "¡Todos los amigos secretos fueron revelados! Gracias por participar.",
  ARCHIVED: "Este evento ya terminó y quedó como recuerdo.",
};

/** Mientras el sorteo exista no se puede cambiar la lista de participantes. */
export function participantsEditable(status: EventStatus): boolean {
  return status === "DRAFT";
}

/** Estados en los que existe un sorteo generado. */
export function drawExists(status: EventStatus): boolean {
  return status !== "DRAFT";
}
