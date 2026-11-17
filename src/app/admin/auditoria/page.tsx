import { PageTitle, Panel } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { assertOrganizerInDb, actorFromSession } from "@/server/services/auth";
import { listAudit } from "@/server/services/audit";

export const metadata = { title: "Auditoría" };

const LABELS: Record<string, string> = {
  BOOTSTRAP: "Instalación inicial",
  DRAW_STARTED: "Inició el sorteo",
  DRAW_COMPLETED: "Todos revelaron su amigo secreto",
  DRAW_RESET: "Reinició el sorteo",
  DRAW_LOCKED: "Pausó el sorteo",
  DRAW_UNLOCKED: "Reanudó el sorteo",
  EMERGENCY_VIEW: "🔒 Consulta de emergencia",
  EXPECTED_GIVER_VIEWED: "Consultó el regalador del turno activo",
  DELIVERY_STARTED: "Inició La Gran Revelación",
  TURN_STARTED: "Inició un turno",
  TURN_CANCELLED: "Omitió un turno",
  DELIVERY_CONFIRMED: "Confirmó una entrega",
  DELIVERY_REVERTED: "Corrigió una entrega",
  EVENT_COMPLETED: "Finalizó el evento",
  EVENT_FORCE_COMPLETED: "Finalizó el evento con regalos pendientes (excepcional)",
  EVENT_ARCHIVED: "Archivó el evento",
  EVENT_CREATED: "Creó un evento",
  EVENT_UPDATED: "Modificó la configuración del evento",
  EVENT_ACTIVATED: "Activó este evento",
  EVENT_DEACTIVATED: "Cambió el evento actual",
  EVENT_PURGED: "Eliminó un evento archivado",
  EVENT_PHOTOS_PURGED: "Eliminó fotos de un evento archivado",
  PARTICIPANTS_IMPORTED: "Importó participantes",
  PARTICIPANT_CREATED: "Agregó un participante",
  PARTICIPANT_UPDATED: "Modificó un participante",
  PARTICIPANT_DELETED: "Eliminó un participante",
  PHOTO_UPDATED: "Actualizó una fotografía",
  PHOTO_REMOVED: "Quitó una fotografía",
  PRESENTATION_CODE_CREATED: "Generó un código para la pantalla de TV",
};

function summary(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof details.reason === "string" && details.reason) parts.push(`Motivo: «${details.reason}»`);
  if (typeof details.full_name === "string") parts.push(details.full_name);
  if (typeof details.count === "number") parts.push(`${details.count} filas`);
  if (typeof details.participants === "number") parts.push(`${details.participants} participantes`);
  if (typeof details.pending === "number" && details.pending > 0) parts.push(`${details.pending} pendientes`);
  if (typeof details.name === "string") parts.push(details.name);
  return parts.join(" · ");
}

export default async function AuditPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const db = await getDb();
  await assertOrganizerInDb(db, actor);
  const entries = await listAudit(db, actor.eventId, 300);

  return (
    <>
      <PageTitle title="Auditoría" subtitle="Registro de las acciones administrativas importantes de este evento." />
      <Panel className="p-0 sm:p-0">
        {entries.length === 0 ? (
          <p className="p-6 text-white/60">Aún no hay registros.</p>
        ) : (
          <ol className="divide-y divide-white/5">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <time className="shrink-0 text-xs tabular-nums text-white/50 sm:w-44">{formatDateTime(e.createdAt)}</time>
                <div className="min-w-0">
                  <p className={e.action === "EMERGENCY_VIEW" ? "font-bold text-berry-300" : "font-semibold"}>
                    {LABELS[e.action] ?? e.action}
                  </p>
                  <p className="text-sm text-white/60">
                    {e.actorName ?? "Sistema"}
                    {e.scope && e.scope !== "EVENT" && ` · alcance: ${e.scope.startsWith("PARTICIPANT:") ? "un participante" : e.scope === "ALL_ASSIGNMENTS" ? "todas las asignaciones" : e.scope.toLowerCase()}`}
                    {summary(e.details) && ` · ${summary(e.details)}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
