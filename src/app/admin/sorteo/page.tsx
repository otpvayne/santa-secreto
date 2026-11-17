import { LiveRefresh } from "@/components/live-refresh";
import { Alert, Badge, PageTitle, Panel, ProgressBar } from "@/components/ui/primitives";
import { STATUS_LABELS } from "@/domain/event-state";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { getDrawProgress } from "@/server/services/draw";
import { DrawControls } from "./draw-controls";

export const metadata = { title: "Sorteo" };

export default async function DrawAdminPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const p = await getDrawProgress(await getDb(), actor.eventId);

  return (
    <>
      <LiveRefresh eventId={actor.eventId} kinds={["cards", "event"]} fastPollMs={8000} />
      <PageTitle
        title="Control del sorteo"
        subtitle="Las asignaciones se generan en el servidor y permanecen ocultas."
        actions={<Badge tone={p.status === "DRAW_OPEN" ? "gold" : "neutral"}>{STATUS_LABELS[p.status]}</Badge>}
      />
      {p.drawLocked && (
        <Alert tone="warning" className="mb-4" title="El sorteo está en pausa">
          Nadie puede escoger tarjetas hasta que lo reanudes. Los resultados ya revelados se conservan.
        </Alert>
      )}
      <Panel className="mb-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>
            {p.revealed} de {p.status === "DRAFT" ? p.activeParticipants : p.cardsTotal} ya revelaron
          </span>
          <span className="text-gold-300">{p.percent} %</span>
        </div>
        <ProgressBar value={p.percent} label="Avance del sorteo" />
        <p className="mt-2 text-xs text-white/55">
          Tarjetas: {p.cardsUsed} usadas · {p.cardsAvailable} disponibles. El evento pasa a «Listo para la entrega»
          automáticamente cuando todos revelan.
        </p>
      </Panel>
      <DrawControls status={p.status} locked={p.drawLocked} activeCount={p.activeParticipants} revealed={p.revealed} />
    </>
  );
}
