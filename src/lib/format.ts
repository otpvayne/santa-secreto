/** Zona horaria de la familia (configurable). Fija para que servidor y navegador muestren lo mismo. */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIMEZONE || "America/Bogota";

const dateTime = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const timeOnly = new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone: TIME_ZONE });

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTime.format(new Date(value));
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return timeOnly.format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
