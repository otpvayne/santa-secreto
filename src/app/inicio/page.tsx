import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Settings2, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/avatar";
import { Lights, Snowfall } from "@/components/festive";
import { LiveRefresh } from "@/components/live-refresh";
import { PrivateSecretFriend } from "@/components/secret-friend-card";
import { Alert, Badge, Panel } from "@/components/ui/primitives";
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/domain/event-state";
import { cardLabel } from "@/domain/cards";
import { getDb } from "@/server/db";
import { requireParticipantPage } from "@/server/auth/session";
import { actorFromSession } from "@/server/services/auth";
import { getMyCard } from "@/server/services/draw";
import { photoUrl } from "@/server/types";

export const metadata: Metadata = { title: "Inicio" };

export default async function HomePage({ searchParams }: PageProps<"/inicio">) {
  const session = await requireParticipantPage();
  const { motivo } = await searchParams;
  const me = session.participant;
  const actor = actorFromSession(session);
  // Solo la tarjeta: el destinatario NO viaja en el HTML inicial; se pide al pulsar "Mostrar".
  const result = me.revealedAt ? await getMyCard(await getDb(), actor) : null;
  const status = session.event.status;
  const isOrganizer = me.role === "ORGANIZER";
  const myPhoto = photoUrl(me.id, me.hasPhoto, me.photoVersion);
  const firstName = me.fullName.split(" ")[0];

  return (
    <>
      <AppHeader name={me.fullName} photoUrl={myPhoto} isOrganizer={isOrganizer} eventName={session.event.name} />
      <LiveRefresh eventId={session.event.id} kinds={["event"]} fastPollMs={15000} />
      <Snowfall count={12} />
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
        {motivo === "sin-permiso" && (
          <Alert tone="warning" className="mb-4">
            Esa sección es solo para organizadores.
          </Alert>
        )}

        <section className="flex flex-col items-center text-center">
          <Avatar name={me.fullName} src={myPhoto} size={104} />
          <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-gold-300/80">¡Hola!</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{me.fullName}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge tone={status === "DRAW_OPEN" ? "gold" : "neutral"}>{STATUS_LABELS[status]}</Badge>
            {isOrganizer && <Badge tone="warning">Organizador</Badge>}
          </div>
        </section>

        <Lights className="my-7" count={12} />

        {result ? (
          <section aria-labelledby="titulo-resultado" className="space-y-5">
            <h2 id="titulo-resultado" className="text-center font-display text-2xl font-bold sm:text-3xl">
              🎁 ¿Olvidaste quién es tu amigo secreto?
            </h2>
            <PrivateSecretFriend cardLabel={cardLabel(result.cardNumber, result.totalCards)} />
            <p className="text-center text-sm text-white/60">{STATUS_DESCRIPTIONS[status]}</p>
          </section>
        ) : status === "DRAW_OPEN" && !session.event.drawLocked ? (
          <Panel className="text-center">
            <Sparkles className="mx-auto mb-3 size-10 text-gold-300" aria-hidden />
            <h2 className="font-display text-2xl font-bold">¡Llegó tu momento, {firstName}!</h2>
            <p className="mx-auto mt-2 max-w-md text-white/75">
              Escoge una tarjeta navideña para descubrir a quién le darás un regalo este año.
            </p>
            <Link
              href="/sorteo"
              className="mt-6 inline-flex h-16 items-center justify-center gap-3 rounded-2xl border border-berry-300/30 bg-gradient-to-b from-berry-500 to-berry-700 px-8 text-xl font-bold text-white shadow-[0_8px_24px_-8px_rgb(220_42_66/0.7)] transition active:scale-[0.98]"
            >
              🎁 Escoger mi tarjeta <ArrowRight className="size-5" aria-hidden />
            </Link>
          </Panel>
        ) : status === "DRAW_OPEN" ? (
          <Panel className="text-center">
            <Lock className="mx-auto mb-3 size-10 text-gold-300" aria-hidden />
            <h2 className="font-display text-2xl font-bold">El sorteo está en pausa</h2>
            <p className="mt-2 text-white/75">
              Los organizadores pausaron el sorteo por un momento. Esta pantalla se actualizará sola.
            </p>
          </Panel>
        ) : (
          <Panel className="text-center">
            <p className="mb-3 text-5xl" aria-hidden>
              {status === "DRAFT" ? "⏳" : "🎄"}
            </p>
            <h2 className="font-display text-2xl font-bold">{STATUS_LABELS[status]}</h2>
            <p className="mx-auto mt-2 max-w-md text-white/75">{STATUS_DESCRIPTIONS[status]}</p>
            {status !== "DRAFT" && !me.revealedAt && (
              <p className="mt-3 text-sm text-white/60">No participaste en este sorteo.</p>
            )}
          </Panel>
        )}

        {isOrganizer && (
          <Link
            href="/admin"
            className="glass mt-8 flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-white/10"
          >
            <span className="flex items-center gap-3">
              <Settings2 className="size-6 text-gold-300" aria-hidden />
              <span>
                <span className="block font-bold">Panel de administración</span>
                <span className="block text-sm text-white/60">Participantes, sorteo, entrega y más</span>
              </span>
            </span>
            <ArrowRight className="size-5 text-white/60" aria-hidden />
          </Link>
        )}
      </main>
    </>
  );
}
