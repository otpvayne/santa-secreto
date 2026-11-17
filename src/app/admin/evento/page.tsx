import { PageTitle } from "@/components/ui/primitives";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { listEvents } from "@/server/services/events";
import { EventSettings } from "./event-settings";

export const metadata = { title: "Evento" };

export default async function EventPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const events = await listEvents(await getDb(), actor);
  const current = events.find((e) => e.id === actor.eventId)!;
  return (
    <>
      <PageTitle title="Evento" subtitle="Configuración, historial y eventos de años posteriores." />
      <EventSettings current={current} events={events} />
    </>
  );
}
