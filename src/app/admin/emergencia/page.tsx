import { Alert, PageTitle } from "@/components/ui/primitives";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { listParticipants } from "@/server/services/participants";
import { EmergencyView } from "./emergency-view";

export const metadata = { title: "Consulta de emergencia" };

export default async function EmergencyPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const people = (await listParticipants(await getDb(), actor))
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <>
      <PageTitle title="🔒 Consulta de emergencia" subtitle="Solo para situaciones excepcionales." />
      {session.event.status === "DRAFT" ? (
        <Alert tone="info">Todavía no hay sorteo: no existen asignaciones que consultar.</Alert>
      ) : (
        <EmergencyView people={people} />
      )}
      <p className="mt-6 text-xs leading-relaxed text-white/50">
        Recuerda: el acceso a la aplicación usa solo nombre y número identificador. Quien conozca esos datos de un
        organizador podría hacerse pasar por él; por eso cada consulta queda auditada.
      </p>
    </>
  );
}
