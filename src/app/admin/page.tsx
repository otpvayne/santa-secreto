import Link from "next/link";
import { CheckCircle2, Clock, Gift, Lock, Percent, Ticket, Users } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { ParticipantTable } from "@/components/participant-table";
import { Alert, Badge, PageTitle, Panel, ProgressBar, StatCard } from "@/components/ui/primitives";
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/domain/event-state";
import { getDb } from "@/server/db";
import { requireOrganizerPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { getDrawProgress } from "@/server/services/draw";
import { listParticipants } from "@/server/services/participants";

export const metadata = { title: "Resumen" };

export default async function AdminDashboard() {
  const session = await requireOrganizerPage();
  const actor = actorFromSession(session);
  const db = await getDb();
  const [progress, participants] = await Promise.all([
    getDrawProgress(db, actor.eventId),
    listParticipants(db, actor),
  ]);
  const status = progress.status;
  const drawExists = status !== "DRAFT";

  return (
    <>
      <LiveRefresh eventId={actor.eventId} kinds={["cards", "event", "participants", "delivery"]} fastPollMs={8000} />
      <PageTitle
        title="Resumen del evento"
        subtitle={`${session.event.name} · ${session.event.year}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={status === "DRAW_OPEN" ? "gold" : "neutral"} className="text-sm">
              {STATUS_LABELS[status]}
            </Badge>
            {progress.drawLocked && (
              <Badge tone="danger">
                <Lock className="size-3" aria-hidden /> En pausa
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Participantes activos" value={progress.activeParticipants} icon={<Users className="size-5" />} accent="gold" />
        <StatCard label="Ya revelaron" value={progress.revealed} icon={<CheckCircle2 className="size-5" />} accent="pine" />
        <StatCard label="Pendientes" value={progress.pending} icon={<Clock className="size-5" />} accent="berry" />
        <StatCard label="Avance" value={`${progress.percent} %`} icon={<Percent className="size-5" />} accent="gold" />
        <StatCard label="Tarjetas disponibles" value={progress.cardsAvailable} icon={<Gift className="size-5" />} accent="pine" />
        <StatCard label="Tarjetas usadas" value={progress.cardsUsed} icon={<Ticket className="size-5" />} accent="berry" />
        <StatCard
          label="Organizadores"
          value={progress.organizers}
          hint="También participan en el sorteo"
          icon={<Users className="size-5" />}
          accent="gold"
        />
        <StatCard label="Estado" value={<span className="text-xl sm:text-2xl">{STATUS_LABELS[status]}</span>} accent="pine" />
      </div>

      <Panel className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>Avance del sorteo</span>
          <span className="tabular-nums text-gold-300">
            {progress.revealed} / {drawExists ? progress.cardsTotal : progress.activeParticipants}
          </span>
        </div>
        <ProgressBar value={progress.percent} label="Avance del sorteo" />
        <p className="mt-3 text-sm text-white/65">{STATUS_DESCRIPTIONS[status]}</p>
      </Panel>

      {status === "DRAFT" && (
        <Alert tone="info" className="mt-4" title="Siguiente paso">
          Revisa la lista de <Link className="underline" href="/admin/participantes">participantes</Link> y cuando estén
          todos, <Link className="underline" href="/admin/sorteo">inicia el sorteo</Link>.
        </Alert>
      )}
      {status === "READY_FOR_DELIVERY" && (
        <Alert tone="success" className="mt-4" title="¡Todos descubrieron a su amigo secreto!">
          Cuando estén reunidos, abre <Link className="underline" href="/admin/entrega">La Gran Revelación</Link>.
        </Alert>
      )}

      <section className="mt-8" aria-labelledby="seguimiento">
        <h2 id="seguimiento" className="mb-3 font-display text-2xl font-bold">
          Seguimiento de participantes
        </h2>
        <ParticipantTable rows={participants} drawExists={drawExists} initialFilter={drawExists ? "pending" : "all"} />
      </section>
    </>
  );
}
