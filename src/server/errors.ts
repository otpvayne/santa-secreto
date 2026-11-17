/** Mensajes amigables para cada código de error de negocio. Nunca se muestra SQL al usuario. */
export const ERROR_MESSAGES = {
  UNAUTHENTICATED: "Tu sesión terminó. Vuelve a identificarte para continuar.",
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  RATE_LIMITED: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  INVALID_INPUT: "Revisa los datos ingresados.",
  NAME_NOT_FOUND: "No encontramos ese nombre en la lista. Escógelo del selector.",
  WRONG_IDENTIFIER: "El número identificador no coincide con ese nombre.",
  PARTICIPANT_INACTIVE: "Tu participación está desactivada. Habla con un organizador.",
  NO_CURRENT_EVENT: "Todavía no hay un evento disponible. Habla con un organizador.",
  EVENT_NOT_FOUND: "El evento no existe o ya no está disponible.",
  EVENT_ARCHIVED: "Este evento está archivado y no se puede modificar.",
  EVENT_IN_PROGRESS: "El evento actual está en curso. Termínalo antes de cambiar de evento.",
  NO_ORGANIZER: "Ese evento no tiene ningún organizador activo.",
  PURGE_NOT_ALLOWED: "Solo se pueden borrar datos de eventos archivados que no sean el evento actual.",
  INVALID_STATE: "Esta acción no está disponible en el estado actual del evento.",
  INVALID_OPERATION: "Operación no permitida.",
  PARTICIPANTS_LOCKED:
    "El sorteo ya fue generado: no se pueden agregar, eliminar ni cambiar identificadores. Reinicia el sorteo si es necesario.",
  LAST_ORGANIZER: "Debe quedar al menos un organizador activo en el evento.",
  DUPLICATE_IDENTIFIER: "Ya existe un participante con ese número identificador.",
  DUPLICATE_NAME: "Ya existe un participante con ese nombre.",
  NOT_ENOUGH_PARTICIPANTS: "Se necesitan al menos 2 participantes activos para iniciar el sorteo.",
  DRAW_ALREADY_STARTED: "El sorteo ya fue iniciado.",
  INVALID_DRAW: "El sorteo generado no superó la validación. Inténtalo de nuevo.",
  DRAW_NOT_STARTED: "El sorteo todavía no ha comenzado. ¡Vuelve pronto!",
  DRAW_CLOSED: "El sorteo ya se cerró.",
  DRAW_LOCKED: "El sorteo está pausado por los organizadores. Intenta de nuevo en un momento.",
  NOT_IN_DRAW: "Esta persona no forma parte del sorteo.",
  CARD_TAKEN: "🎁 ¡Alguien se adelantó! Esta tarjeta acaba de ser seleccionada. Escoge otra.",
  CARD_NOT_FOUND: "Esa tarjeta no existe.",
  ALREADY_REVEALED: "Ya descubriste a tu amigo secreto.",
  TURN_ALREADY_ACTIVE: "Ya hay un turno en curso. Termínalo antes de elegir otro.",
  TURN_NOT_ACTIVE: "Ese turno ya no está activo.",
  TURN_NOT_FOUND: "No encontramos ese turno.",
  TURN_NOT_COMPLETED: "Ese turno no tiene una entrega confirmada.",
  TURN_STILL_ACTIVE: "Hay un turno en curso. Confírmalo u omítelo antes de finalizar.",
  ALREADY_RECEIVED: "Esta persona ya recibió su regalo.",
  NOBODY_PENDING: "Todos ya recibieron su regalo. 🎉",
  GIFTS_PENDING: "Aún hay regalos pendientes. Para finalizar de todos modos usa la opción excepcional.",
  REASON_REQUIRED: "Escribe un motivo (mínimo 3 caracteres).",
  INVALID_PHOTO: "La imagen no es válida. Usa una foto JPG, PNG o WebP de menos de 4 MB.",
  INVALID_FILE: "No pudimos leer el archivo. Usa la plantilla en formato .xlsx o .csv.",
  INVALID_CODE: "El código no es válido o ya expiró. Pide uno nuevo al organizador.",
  INVALID_REFERENCE: "La información está relacionada con otros datos y no se puede cambiar así.",
  NOT_FOUND: "No encontramos lo que buscabas.",
  INTERNAL: "Ocurrió un problema inesperado. Inténtalo de nuevo en unos segundos.",
  DB_UNAVAILABLE: "No pudimos conectarnos con la base de datos. Inténtalo de nuevo en unos segundos.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.name = "AppError";
  }
}

const CONSTRAINT_CODES: Record<string, ErrorCode> = {
  participants_identifier_unique: "DUPLICATE_IDENTIFIER",
  participants_name_unique: "DUPLICATE_NAME",
  delivery_turns_one_active: "TURN_ALREADY_ACTIVE",
  delivery_turns_one_completed_per_receiver: "ALREADY_RECEIVED",
  draw_cards_one_per_participant: "ALREADY_REVEALED",
};

/** Convierte cualquier error (incluidos los de PostgreSQL) en un AppError seguro para el usuario. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as { code?: string; message?: string; constraint?: string } | undefined;
  const message = e?.message ?? "";

  const business = /SANTA:([A-Z_]+)/.exec(message);
  if (business && business[1] in ERROR_MESSAGES) {
    return new AppError(business[1] as ErrorCode);
  }
  if (e?.code === "23505") {
    const constraint = e.constraint ?? /constraint "([^"]+)"/.exec(message)?.[1] ?? "";
    return new AppError(CONSTRAINT_CODES[constraint] ?? "INVALID_INPUT");
  }
  if (e?.code === "23503") return new AppError("INVALID_REFERENCE");
  if (e?.code === "23514" || e?.code === "22P02" || e?.code === "22001") return new AppError("INVALID_INPUT");
  if (
    e?.code === "ECONNREFUSED" ||
    e?.code === "ENOTFOUND" ||
    e?.code === "ETIMEDOUT" ||
    e?.code?.startsWith("08") ||
    /timeout|ECONNRESET|connect/i.test(message)
  ) {
    return new AppError("DB_UNAVAILABLE");
  }
  return new AppError("INTERNAL");
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; code: ErrorCode; message: string };

/** Ejecuta una acción y devuelve un resultado serializable; registra en consola los errores inesperados. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (error) {
    // Las redirecciones de Next.js (sesión expirada) deben propagarse.
    if (isNextControlFlow(error)) throw error;
    const appError = toAppError(error);
    if (appError.code === "INTERNAL" || appError.code === "DB_UNAVAILABLE") {
      console.error("[santa] error inesperado:", error);
    }
    return { ok: false, code: appError.code, message: appError.message };
  }
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}
