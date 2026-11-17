import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getCurrentSession, getPresentationSession } from "@/server/auth/session";
import { getPresentationState } from "@/server/services/delivery";
import { PresentationScreen } from "./presentation-screen";

export const metadata: Metadata = { title: "La Gran Revelación" };

export default async function PresentationPage() {
  const organizer = await getCurrentSession();
  const session = organizer?.participant?.role === "ORGANIZER" ? organizer : await getPresentationSession();
  if (!session) redirect("/tv");
  const initial = await getPresentationState(await getDb(), session.event.id);
  return <PresentationScreen eventId={session.event.id} initial={initial} />;
}
