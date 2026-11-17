import { LiveRefresh } from "@/components/live-refresh";
import { Alert, PageTitle, Panel, ProgressBar } from "@/components/ui/primitives";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { getOrganizerDeliveryState } from "@/server/services/delivery";
import { getDrawProgress } from "@/server/services/draw";
import { DeliveryPanel } from "./delivery-panel";

export const metadata = { title: "La Gran Revelación" };

export default async function DeliveryPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const db = await getDb();
  const status = session.event.status;

  if (status === "DRAFT" || status === "DRAW_OPEN") {
    const p = await getDrawProgress(db, actor.eventId);
    return (
      <>
        <LiveRefresh eventId={actor.eventId} kinds={["event", "cards"]} fastPollMs={10000} />
        <PageTitle title="🎉 La Gran Revelación" />
        <Alert tone="info" title="Aún no disponible">
          La entrega se habilita cuando todos los participantes hayan descubierto a su amigo secreto.
        </Alert>
        {status === "DRAW_OPEN" && (
          <Panel className="mt-4">
            <p className="mb-2 text-sm font-semibold">
              {p.revealed} de {p.cardsTotal} ya revelaron
            </p>
            <ProgressBar value={p.percent} />
          </Panel>
        )}
      </>
    );
  }

  const state = await getOrganizerDeliveryState(db, actor);
  return (
    <>
      <LiveRefresh eventId={actor.eventId} kinds={["delivery", "event"]} fastPollMs={5000} />
      <PageTitle title="🎉 La Gran Revelación" subtitle="Controla la entrega desde tu celular; el televisor se sincroniza solo." />
      <DeliveryPanel
        state={{
          status,
          stats: state.stats,
          activeTurn: state.activeTurn,
          pending: state.pending,
          completed: state.completed,
        }}
      />
    </>
  );
}
