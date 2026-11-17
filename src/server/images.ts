import { AppError } from "./errors";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_MAX_DIMENSION = 900;

export type ImageKind = "jpeg" | "png" | "webp";

/** Detecta el tipo REAL del archivo por sus primeros bytes (no por la extensión ni el MIME declarado). */
export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Valida y normaliza una foto:
 * - acepta solo JPG/PNG/WebP reales y de tamaño razonable;
 * - aplica la orientación EXIF y luego descarta TODOS los metadatos (EXIF, GPS, etc.);
 * - redimensiona a máximo 900 px y convierte a WebP.
 */
export async function processPhoto(input: Buffer): Promise<Buffer> {
  if (input.length === 0 || input.length > MAX_PHOTO_BYTES) throw new AppError("INVALID_PHOTO");
  const kind = detectImageKind(input);
  if (!kind) throw new AppError("INVALID_PHOTO");

  const sharp = (await import("sharp")).default;
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new AppError("INVALID_PHOTO");
    return await image
      .rotate() // aplica orientación EXIF
      .resize({ width: PHOTO_MAX_DIMENSION, height: PHOTO_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(); // sharp no copia metadatos salvo que se pida con withMetadata()
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("INVALID_PHOTO");
  }
}
