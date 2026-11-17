/** Etiqueta visible de una tarjeta: 1 → "01" (o "001" si hay más de 99 tarjetas). */
export function cardLabel(cardNumber: number, totalCards: number): string {
  const width = Math.max(2, String(Math.max(totalCards, 1)).length);
  return String(cardNumber).padStart(width, "0");
}
