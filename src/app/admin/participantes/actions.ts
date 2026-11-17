"use server";

import { adminAction } from "@/server/auth/admin-action";
import { AppError } from "@/server/errors";
import { readSpreadsheet } from "@/server/import/spreadsheet";
import { MAX_PHOTO_BYTES } from "@/server/images";
import { getPhotoStorage } from "@/server/storage";
import {
  confirmGiftWishesImport,
  confirmImport,
  createParticipant,
  deleteParticipant,
  previewGiftWishesImport,
  previewImport,
  removeParticipantPhoto,
  setParticipantPhoto,
  updateParticipant,
} from "@/server/services/participants";
import { uuidSchema, parseInput, wishesImportSelectionSchema } from "@/lib/validation/schemas";

export async function createParticipantAction(input: unknown) {
  return adminAction(async ({ db, actor }) => {
    const p = await createParticipant(db, actor, input);
    return { id: p.id };
  }, ["participants"]);
}

export async function updateParticipantAction(input: unknown) {
  return adminAction(async ({ db, actor }) => {
    await updateParticipant(db, actor, input);
  }, ["participants"]);
}

export async function deleteParticipantAction(id: string) {
  return adminAction(async ({ db, actor }) => {
    await deleteParticipant(db, await getPhotoStorage().catch(() => null), actor, parseInput(uuidSchema, id));
  }, ["participants"]);
}

async function fileFrom(formData: FormData, maxBytes: number): Promise<{ buffer: Buffer; name: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("INVALID_INPUT", "Selecciona un archivo.");
  if (file.size > maxBytes) throw new AppError("INVALID_INPUT", `El archivo supera ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name };
}

export async function uploadPhotoAction(formData: FormData) {
  return adminAction(async ({ db, actor }) => {
    const id = parseInput(uuidSchema, formData.get("participantId"));
    const { buffer } = await fileFrom(formData, MAX_PHOTO_BYTES);
    const row = await setParticipantPhoto(db, await getPhotoStorage(), actor, id, buffer);
    return { photoUrl: row.photoUrl };
  }, ["participants"]);
}

export async function removePhotoAction(id: string) {
  return adminAction(async ({ db, actor }) => {
    await removeParticipantPhoto(db, await getPhotoStorage(), actor, parseInput(uuidSchema, id));
  }, ["participants"]);
}

/** Vista previa de la importación: valida en el servidor y no escribe nada. */
export async function previewImportAction(formData: FormData) {
  return adminAction(async ({ db, actor }) => {
    const { buffer, name } = await fileFrom(formData, 2 * 1024 * 1024);
    return previewImport(db, actor, await readSpreadsheet(buffer, name));
  });
}

/** Confirmación: se vuelve a leer y validar el MISMO archivo; la inserción es atómica. */
export async function confirmImportAction(formData: FormData) {
  return adminAction(async ({ db, actor }) => {
    const { buffer, name } = await fileFrom(formData, 2 * 1024 * 1024);
    return { imported: await confirmImport(db, actor, await readSpreadsheet(buffer, name)) };
  }, ["participants"]);
}

// ---------------------------------------------------------------------------
// 🎁 Sugerencias de regalo desde Excel: solo actualiza participantes EXISTENTES del evento actual.
// ---------------------------------------------------------------------------
function wishesColumnFrom(formData: FormData): number | null {
  const raw = formData.get("wishesColumn");
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 500) throw new AppError("INVALID_INPUT", "Columna inválida.");
  return n;
}

/** Vista previa: lee el archivo, detecta columnas y empareja participantes. No escribe nada. */
export async function previewGiftWishesAction(formData: FormData) {
  return adminAction(async ({ db, actor }) => {
    const { buffer, name } = await fileFrom(formData, 2 * 1024 * 1024);
    return previewGiftWishesImport(db, actor, await readSpreadsheet(buffer, name), wishesColumnFrom(formData));
  });
}

/** Confirmación: vuelve a analizar el MISMO archivo y aplica solo las filas marcadas, de forma atómica. */
export async function confirmGiftWishesAction(formData: FormData) {
  return adminAction(async ({ db, actor }) => {
    const { buffer, name } = await fileFrom(formData, 2 * 1024 * 1024);
    let selection: unknown;
    try {
      selection = JSON.parse(String(formData.get("selection") ?? "[]"));
    } catch {
      throw new AppError("INVALID_INPUT", "Selección inválida.");
    }
    return confirmGiftWishesImport(
      db,
      actor,
      await readSpreadsheet(buffer, name),
      wishesColumnFrom(formData),
      parseInput(wishesImportSelectionSchema, selection),
    );
  }, ["participants"]);
}
