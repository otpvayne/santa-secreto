import { randomInt } from "node:crypto";

/** Devuelve un entero uniforme en [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

export interface DrawPair<T> {
  giver: T;
  receiver: T;
}

/**
 * Genera un "derangement" uniforme: una permutación en la que nadie se tiene a sí mismo.
 *
 * Algoritmo: barajado Fisher–Yates con un generador criptográfico y rechazo de las permutaciones
 * con puntos fijos. Como ~1/e de las permutaciones son derangements, se necesitan ≈2,7 intentos en
 * promedio, y el resultado es uniforme entre TODOS los derangements posibles (incluye parejas mutuas).
 */
export function generateDerangement<T>(items: readonly T[], random: RandomInt = cryptoRandomInt): DrawPair<T>[] {
  const n = items.length;
  if (n < 2) {
    throw new Error("Se necesitan al menos 2 participantes para el sorteo.");
  }
  if (new Set(items).size !== n) {
    throw new Error("La lista de participantes contiene elementos repetidos.");
  }

  const MAX_ATTEMPTS = 10_000;
  const perm = new Array<number>(n);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = random(i + 1);
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    let hasFixedPoint = false;
    for (let i = 0; i < n; i++) {
      if (perm[i] === i) {
        hasFixedPoint = true;
        break;
      }
    }
    if (!hasFixedPoint) {
      const pairs = items.map((giver, i) => ({ giver, receiver: items[perm[i]] }));
      const problems = validateDraw(items, pairs);
      if (problems.length > 0) {
        throw new Error(`Sorteo inválido: ${problems.join("; ")}`);
      }
      return pairs;
    }
  }
  throw new Error("No fue posible generar un sorteo válido.");
}

/**
 * Comprueba todas las reglas matemáticas del sorteo. Devuelve la lista de problemas (vacía = válido).
 */
export function validateDraw<T>(participants: readonly T[], pairs: readonly DrawPair<T>[]): string[] {
  const problems: string[] = [];
  const all = new Set(participants);
  const givers = new Set<T>();
  const receivers = new Set<T>();

  if (pairs.length !== participants.length) {
    problems.push(`se esperaban ${participants.length} asignaciones y hay ${pairs.length}`);
  }
  for (const { giver, receiver } of pairs) {
    if (giver === receiver) problems.push("alguien quedó asignado a sí mismo");
    if (!all.has(giver)) problems.push("hay un regalador que no participa");
    if (!all.has(receiver)) problems.push("hay un destinatario que no participa");
    if (givers.has(giver)) problems.push("un participante tiene más de un destinatario");
    if (receivers.has(receiver)) problems.push("un destinatario fue asignado más de una vez");
    givers.add(giver);
    receivers.add(receiver);
  }
  for (const p of participants) {
    if (!givers.has(p)) problems.push("un participante quedó sin destinatario");
    if (!receivers.has(p)) problems.push("un participante quedó sin quién le regale");
  }
  return [...new Set(problems)];
}
