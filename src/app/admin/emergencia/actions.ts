"use server";

import { z } from "zod";
import { adminAction } from "@/server/auth/admin-action";
import { emergencyAssignments } from "@/server/services/draw";
import { parseInput, uuidSchema } from "@/lib/validation/schemas";

const inputSchema = z.object({
  giverId: uuidSchema.nullable(),
  reason: z.string(),
  acknowledged: z.literal(true, { error: "Debes confirmar que entiendes la advertencia." }),
});

/** Consulta excepcional de asignaciones: solo ORGANIZER, con motivo, y queda en auditoría. */
export async function emergencyViewAction(input: { giverId: string | null; reason: string; acknowledged: boolean }) {
  return adminAction(async ({ db, actor }) => {
    const data = parseInput(inputSchema, input);
    return emergencyAssignments(db, actor, data.giverId, data.reason);
  });
}
