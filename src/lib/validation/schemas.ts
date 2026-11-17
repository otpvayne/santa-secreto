import { z } from "zod";
import { GIFT_WISHES_MAX, cleanGiftWishes } from "@/domain/gift-wishes";
import { IDENTIFIER_PATTERN, cleanDisplayName, cleanIdentifier, normalizeName } from "@/domain/normalize";
import { AppError } from "@/server/errors";

export const roleSchema = z.enum(["PARTICIPANT", "ORGANIZER"]);

export const fullNameSchema = z
  .string({ error: "Escribe el nombre completo." })
  .transform(cleanDisplayName)
  .pipe(
    z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(120, "El nombre es demasiado largo (máximo 120 caracteres)."),
  )
  .refine((v) => normalizeName(v).length >= 2, "El nombre debe contener letras.");

export const identifierSchema = z
  .string({ error: "Escribe el número identificador." })
  .transform(cleanIdentifier)
  .pipe(z.string().regex(IDENTIFIER_PATTERN, "El identificador debe tener solo números (de 1 a 6 dígitos)."));

/** Sugerencias de regalo: texto libre. Cadena vacía → null (borrado explícito). */
const GIFT_WISHES_TOO_LONG = `Las sugerencias son demasiado largas (máximo ${GIFT_WISHES_MAX} caracteres).`;
export const giftWishesSchema = z.union([
  z
    .string({ error: "Las sugerencias deben ser texto." })
    .max(GIFT_WISHES_MAX * 2, GIFT_WISHES_TOO_LONG)
    .transform(cleanGiftWishes)
    .refine((v) => v === null || v.length <= GIFT_WISHES_MAX, GIFT_WISHES_TOO_LONG),
  z.null(),
]);

export const uuidSchema = z.uuid("Identificador interno inválido.");

export const loginSchema = z.object({
  fullName: z.string().trim().min(1, "Escoge tu nombre de la lista.").max(200),
  identifier: z.string().trim().min(1, "Escribe tu número identificador.").max(20),
});

export const participantCreateSchema = z.object({
  fullName: fullNameSchema,
  identifier: identifierSchema,
  role: roleSchema.default("PARTICIPANT"),
  isActive: z.boolean().default(true),
  giftWishes: giftWishesSchema.optional(),
});

export const participantUpdateSchema = z.object({
  id: uuidSchema,
  fullName: fullNameSchema.optional(),
  identifier: identifierSchema.optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  /** undefined = no tocar; "" o null = borrar explícitamente. */
  giftWishes: giftWishesSchema.optional(),
});

export const wishesImportSelectionSchema = z
  .array(z.object({ row: z.number().int().min(1).max(100000), participantId: z.uuid() }))
  .max(1000);

export const claimCardSchema = z.object({
  cardNumber: z.coerce.number().int().min(1).max(9999),
});

export const reasonSchema = z
  .string({ error: "Escribe un motivo." })
  .trim()
  .min(3, "Escribe un motivo (mínimo 3 caracteres).")
  .max(500, "El motivo es demasiado largo.");

export const eventSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del evento.").max(120),
  year: z.coerce.number().int().min(2000).max(2200),
  description: z.string().trim().max(1000).optional().default(""),
  deliveryDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha inválida.")
    .optional()
    .default(""),
});

export const turnModeSchema = z.enum(["RANDOM", "MANUAL"]);

export const presentationCodeSchema = z.string().trim().min(4).max(20);

/** Devuelve el primer mensaje de error de Zod (para mostrarlo en el formulario). */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos ingresados.";
}

/** Valida una entrada o lanza un AppError INVALID_INPUT con un mensaje comprensible. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError("INVALID_INPUT", firstIssue(result.error));
  return result.data;
}
