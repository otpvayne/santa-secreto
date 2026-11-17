"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useEventSignals, type SignalKind } from "@/hooks/use-event-signals";

/** Refresca los datos del servidor de la página actual cuando llega una señal del evento. */
export function LiveRefresh({ eventId, kinds, fastPollMs }: { eventId: string; kinds: SignalKind[]; fastPollMs?: number }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const status = useEventSignals(eventId, kinds, refresh, { fastPollMs });
  return (
    <span className="sr-only" aria-hidden>
      {status === "realtime" ? "Conectado en tiempo real" : "Actualización periódica"}
    </span>
  );
}
