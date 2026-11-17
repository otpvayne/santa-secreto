/** Máximo de caracteres para las sugerencias de regalo (igual que el CHECK de la base de datos). */
export const GIFT_WISHES_MAX = 4000;

/**
 * Limpia las sugerencias SIN cambiar la redacción: unifica los saltos de línea (\r\n → \n)
 * y quita espacios sobrantes solo al inicio y al final. No divide, no reordena, no quita
 * comas, tildes, emojis ni caracteres especiales. Texto vacío → null (sin sugerencias).
 */
export function cleanGiftWishes(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text === "" ? null : text;
}

export type WishSegment = { type: "text"; value: string } | { type: "link"; value: string; href: string };

// Candidatos: "http://…", "https://…" o "www.…" hasta el siguiente espacio.
const LINK_CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// Puntuación que suele ir pegada al final de una frase y no forma parte del enlace.
const TRAILING_PUNCTUATION = /[.,;:!?¡¿'"»”’…]+$/;

/** Devuelve un href seguro (solo http/https) o null. Nunca javascript:, data:, etc. */
export function safeHref(candidate: string): string | null {
  const withScheme = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Quita del final la puntuación y los ")" que no abren dentro del enlace: "(ver www.x.com)." → "www.x.com". */
function trimLink(raw: string): string {
  let link = raw;
  for (;;) {
    const before = link;
    link = link.replace(TRAILING_PUNCTUATION, "");
    if (link.endsWith(")") && (link.match(/\(/g) ?? []).length < (link.match(/\)/g) ?? []).length) link = link.slice(0, -1);
    if (link === before) return link;
  }
}

/**
 * Divide el texto en trozos de texto y enlaces, SIN alterarlo: al unir todos los `value`
 * se obtiene exactamente el texto original. Solo se enlazan direcciones http(s) válidas.
 */
export function splitLinks(text: string): WishSegment[] {
  const out: WishSegment[] = [];
  let last = 0;
  const push = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev?.type === "text") prev.value += value;
    else out.push({ type: "text", value });
  };
  for (const m of text.matchAll(LINK_CANDIDATE)) {
    const start = m.index;
    const link = trimLink(m[0]);
    const href = safeHref(link);
    push(text.slice(last, start));
    if (href) out.push({ type: "link", value: link, href });
    else push(link);
    last = start + link.length;
  }
  push(text.slice(last));
  return out;
}

/** true si hay sugerencias que mostrar (nunca muestra "null", "undefined" ni "[]"). */
export function hasGiftWishes(value: string | null | undefined): value is string {
  return cleanGiftWishes(value) !== null;
}
