import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Snowfall } from "@/components/festive";
import { getDb } from "@/server/db";
import { requireParticipantPage } from "@/server/auth/session";
import { getCardsState } from "@/server/services/draw";
import { photoUrl } from "@/server/types";
import { CardsBoard } from "./cards-board";

export const metadata: Metadata = { title: "Escoge tu tarjeta" };

export default async function DrawPage() {
  const session = await requireParticipantPage();
  const me = session.participant;
  // Quien ya participó no vuelve a ver las tarjetas: se le muestra su resultado.
  if (me.revealedAt || session.event.status !== "DRAW_OPEN") redirect("/inicio");
  const cards = await getCardsState(await getDb(), session.event.id);

  return (
    <>
      <AppHeader
        name={me.fullName}
        photoUrl={photoUrl(me.id, me.hasPhoto, me.photoVersion)}
        isOrganizer={me.role === "ORGANIZER"}
        eventName={session.event.name}
      />
      <Snowfall count={10} />
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 pb-36 pt-6">
        <CardsBoard eventId={session.event.id} initial={cards} firstName={me.fullName.split(" ")[0]} />
      </main>
    </>
  );
}
