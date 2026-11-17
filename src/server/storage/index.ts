import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET ?? "participant-photos";

/** Almacenamiento privado de fotografías. Nunca se exponen URLs públicas. */
export interface PhotoStorage {
  put(objectPath: string, data: Buffer, contentType: string): Promise<void>;
  get(objectPath: string): Promise<Buffer | null>;
  remove(objectPaths: string[]): Promise<void>;
}

const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

function assertSafePath(objectPath: string) {
  if (!SAFE_PATH.test(objectPath)) throw new Error("Ruta de foto inválida");
}

/** Supabase Storage con la clave secreta (solo en el servidor). */
async function createSupabaseStorage(url: string, secretKey: string): Promise<PhotoStorage> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = client.storage.from(PHOTO_BUCKET);
  return {
    async put(objectPath, data, contentType) {
      assertSafePath(objectPath);
      const { error } = await bucket.upload(objectPath, data, { contentType, upsert: false, cacheControl: "3600" });
      if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
    },
    async get(objectPath) {
      assertSafePath(objectPath);
      const { data, error } = await bucket.download(objectPath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(objectPaths) {
      const paths = objectPaths.filter((p) => SAFE_PATH.test(p));
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket.remove(paths.slice(i, i + 100));
        if (error) console.error("[santa] no se pudieron borrar fotos:", error.message);
      }
    },
  };
}

/** Disco local (.data/fotos) para el modo de desarrollo sin Supabase. */
function createLocalStorage(baseDir: string): PhotoStorage {
  const resolve = (p: string) => path.join(baseDir, ...p.split("/"));
  return {
    async put(objectPath, data) {
      assertSafePath(objectPath);
      const file = resolve(objectPath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(objectPath) {
      assertSafePath(objectPath);
      try {
        return await readFile(resolve(objectPath));
      } catch {
        return null;
      }
    },
    async remove(objectPaths) {
      for (const p of objectPaths) {
        if (SAFE_PATH.test(p)) await rm(resolve(p), { force: true });
      }
    },
  };
}

const globalForStorage = globalThis as unknown as { __santaStorage?: Promise<PhotoStorage> };

export function getPhotoStorage(): Promise<PhotoStorage> {
  if (!globalForStorage.__santaStorage) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (url && key) {
      globalForStorage.__santaStorage = createSupabaseStorage(url, key);
    } else if (process.env.NODE_ENV !== "production" || process.env.ALLOW_PGLITE_IN_PRODUCTION === "true") {
      globalForStorage.__santaStorage = Promise.resolve(
        createLocalStorage(path.join(process.cwd(), ".data", "fotos")),
      );
    } else {
      return Promise.reject(new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY para guardar fotografías."));
    }
  }
  return globalForStorage.__santaStorage;
}

export { createLocalStorage };
