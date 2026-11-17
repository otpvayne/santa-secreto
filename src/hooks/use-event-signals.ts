"use client";

import { useEffect, useRef, useState } from "react";

export type SignalKind = "cards" | "event" | "participants" | "delivery";

type Status = "realtime" | "polling";

/**
 * Escucha señales del evento por Supabase Realtime (Broadcast) y, como respaldo,
 * consulta periódicamente. Las señales no traen datos: solo disparan `onSignal`,
 * que vuelve a pedir la información al servidor.
 */
export function useEventSignals(
  eventId: string,
  kinds: SignalKind[],
  onSignal: () => void,
  { fastPollMs = 6000, slowPollMs = 30000 }: { fastPollMs?: number; slowPollMs?: number } = {},
): Status {
  const [status, setStatus] = useState<Status>("polling");
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  }, [onSignal]);
  const kindsKey = kinds.join(",");

  // Suscripción Realtime.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const wanted = new Set(kindsKey.split(","));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handler.current(), 150 + Math.random() * 350); // evita que 50 celulares consulten en el mismo milisegundo
    };

    import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const channel = client
        .channel(`santa-${eventId}`)
        .on("broadcast", { event: "signal" }, ({ payload }) => {
          if (payload && wanted.has(String((payload as { kind?: string }).kind))) fire();
        })
        .subscribe((s) => {
          if (cancelled) return;
          if (s === "SUBSCRIBED") {
            setStatus("realtime");
            handler.current(); // al reconectar, ponerse al día
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setStatus("polling");
          }
        });
      cleanup = () => {
        client.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanup?.();
    };
  }, [eventId, kindsKey]);

  // Polling de respaldo (más lento si Realtime está conectado).
  useEffect(() => {
    const ms = status === "realtime" ? slowPollMs : fastPollMs;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") handler.current();
    }, ms);
    const onWake = () => {
      if (document.visibilityState === "visible") handler.current();
    };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [status, fastPollMs, slowPollMs]);

  return status;
}
