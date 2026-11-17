import Link from "next/link";
import { Download, FileSpreadsheet, Lock } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { Alert, PageTitle } from "@/components/ui/primitives";
import { participantsEditable } from "@/domain/event-state";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { listParticipants } from "@/server/services/participants";
import { ParticipantsManager } from "./participants-manager";

export const metadata = { title: "Participantes" };

export default async function ParticipantsPage() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const rows = await listParticipants(await getDb(), actor);
  const status = session.event.status;
  const locked = !participantsEditable(status);
  const archived = status === "ARCHIVED";
  const linkClass =
    "inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 font-bold hover:bg-white/10";

  return (
    <>
      <LiveRefresh eventId={actor.eventId} kinds={["participants", "event"]} fastPollMs={15000} />
      <PageTitle
        title="Participantes"
        subtitle={`${rows.length} registrados · ${rows.filter((r) => r.isActive).length} activos`}
        actions={
          <>
            {!locked && (
              <Link href="/admin/participantes/importar" className={linkClass}>
                <FileSpreadsheet className="size-5 text-gold-300" aria-hidden /> Importar Excel
              </Link>
            )}
            {!archived && (
              <Link href="/admin/participantes/sugerencias" className={linkClass}>
                🎁 Importar sugerencias de regalo
              </Link>
            )}
            <a href="/api/admin/plantilla?formato=xlsx" className={linkClass}>
              <Download className="size-5 text-gold-300" aria-hidden /> Plantilla
            </a>
          </>
        }
      />
      {locked && !archived && (
        <Alert tone="warning" className="mb-4" icon={<Lock className="size-5" />} title="El sorteo ya fue generado">
          Puedes corregir nombres, fotografías, roles y sugerencias de regalo sin alterar las asignaciones. Para agregar o quitar personas o cambiar
          identificadores, <Link href="/admin/sorteo" className="underline">reinicia el sorteo</Link> (las asignaciones
          actuales dejarán de ser válidas).
        </Alert>
      )}
      {archived && (
        <Alert tone="info" className="mb-4" title="Evento archivado">
          Este evento es histórico y no se puede modificar.
        </Alert>
      )}
      <ParticipantsManager
        rows={rows}
        locked={locked}
        archived={archived}
        drawExists={status !== "DRAFT"}
        myId={actor.participantId}
      />
    </>
  );
}
