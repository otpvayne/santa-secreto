/** Limpia un nombre para mostrarlo: sin espacios sobrantes. Conserva mayúsculas y acentos. */
export function cleanDisplayName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Normaliza un nombre para compararlo: sin acentos, en minúsculas y con espacios simples.
 * "  José   PÉREZ " y "jose perez" producen el mismo valor.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filtra nombres por una búsqueda libre: cada palabra debe aparecer en cualquier parte del nombre,
 * en cualquier orden, sin importar mayúsculas, acentos ni espacios. Búsqueda vacía → todos.
 * "diego medina" encuentra "Diego Alejandro Medina Martínez"; "hernandez" encuentra "Hernández".
 */
export function filterNames(names: readonly string[], query: string): string[] {
  const words = normalizeName(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...names];
  return names.filter((n) => {
    const norm = normalizeName(n);
    return words.every((w) => norm.includes(w));
  });
}

/** Limpia un identificador numérico conservando los ceros iniciales ("07" sigue siendo "07"). */
export function cleanIdentifier(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export const IDENTIFIER_PATTERN = /^[0-9]{1,6}$/;
