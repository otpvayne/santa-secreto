"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Gift, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { Confetti } from "@/components/festive";
import { GiftCard, type GiftCardState } from "@/components/gift-card";
import { PrivateSecretFriend } from "@/components/secret-friend-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cardLabel } from "@/domain/cards";
import type { EventStatus } from "@/domain/event-state";
import { useEventSignals } from "@/hooks/use-event-signals";
import { claimCardAction } from "./actions";

interface CardsState {
  status: EventStatus;
  drawLocked: boolean;
  total: number;
  taken: number[];
}

// "claimed": la participación ya quedó registrada, pero el resultado aparece OCULTO hasta pulsar "Mostrar".
type Phase = { kind: "choosing" } | { kind: "opening"; card: number } | { kind: "claimed"; card: number };

export function CardsBoard({ eventId, initial, firstName }: { eventId: string; initial: CardsState; firstName: string }) {
  const toast = useToast();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [state, setState] = useState<CardsState>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });
  const [claiming, setClaiming] = useState(false);
  const inFlight = useRef(false);
  const taken = useMemo(() => new Set(state.taken), [state.taken]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sorteo/tarjetas", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/ingresar?motivo=expirada");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as CardsState & { revealed: boolean };
      setState(data);
      setSelected((s) => (s !== null && data.taken.includes(s) ? null : s));
    } catch {
      // Sin conexión: se reintenta en el siguiente ciclo; el servidor valida igual al reclamar.
    }
  }, [router]);
  useEventSignals(eventId, ["cards", "event"], refresh, { fastPollMs: 5000, slowPollMs: 20000 });

  const claim = async () => {
    if (selected === null || inFlight.current) return; // evita dobles clics
    inFlight.current = true;
    setClaiming(true);
    const card = selected;
    try {
      const res = await claimCardAction(card);
      if (!res.ok) {
        toast(res.message, "error");
        if (res.code === "UNAUTHENTICATED") router.replace("/ingresar?motivo=expirada");
        return;
      }
      const data = res.data;
      if (data.status === "OK" || data.status === "ALREADY_REVEALED") {
        setPhase({ kind: "opening", card: data.cardNumber });
        setTimeout(
          () => setPhase({ kind: "claimed", card: data.cardNumber }),
          reduced ? 200 : 1900,
        );
        return;
      }
      if ("message" in data) toast(data.message, "error");
      setSelected(null);
      await refresh();
    } catch {
      toast("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.", "error");
    } finally {
      inFlight.current = false;
      setClaiming(false);
    }
  };

  if (phase.kind === "claimed") {
    return (
      <div className="pt-2">
        <Confetti fire={phase.card} />
        <motion.h1
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6 text-center font-display text-3xl font-bold sm:text-4xl"
        >
          🎉 ¡Ya tienes tu amigo secreto!
        </motion.h1>
        <PrivateSecretFriend cardLabel={cardLabel(phase.card, state.total)} />
        <div className="mt-8 text-center">
          <Link
            href="/inicio"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 font-bold hover:bg-white/10"
          >
            <Home className="size-5" aria-hidden /> Volver al inicio
          </Link>
          <p className="mt-3 text-sm text-white/60">Podrás volver a consultarlo cuando quieras desde cualquier dispositivo.</p>
        </div>
      </div>
    );
  }

  const closed = state.status !== "DRAW_OPEN";
  const locked = state.drawLocked;
  const available = state.total - state.taken.length;
  const choosing = phase.kind === "choosing";

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Escoge tu tarjeta, {firstName} 🎄</h1>
        <p className="mx-auto mt-2 max-w-xl text-white/75">
          Cada regalo esconde la sorpresa que la Navidad preparó para ti. Toca una tarjeta y luego ábrela.
        </p>
        <p className="mt-2 text-sm font-semibold text-gold-300" aria-live="polite">
          {available} de {state.total} tarjetas disponibles
        </p>
      </div>

      {closed && (
        <Alert tone="info" className="mb-5" title="El sorteo ya no está abierto">
          <Link href="/inicio" className="underline">
            Vuelve al inicio
          </Link>{" "}
          para ver el estado del evento.
        </Alert>
      )}
      {locked && !closed && (
        <Alert tone="warning" className="mb-5" title="Sorteo en pausa">
          Los organizadores pausaron el sorteo por un momento. Las tarjetas se habilitarán automáticamente.
        </Alert>
      )}

      <div className="card-grid" role="group" aria-label="Tarjetas navideñas">
        {Array.from({ length: state.total }, (_, i) => i + 1).map((n) => {
          let cardState: GiftCardState = "available";
          if (taken.has(n)) cardState = "taken";
          else if (closed || locked || !choosing) cardState = "disabled";
          else if (selected === n) cardState = "selected";
          return (
            <GiftCard
              key={n}
              index={n - 1}
              label={cardLabel(n, state.total)}
              state={cardState}
              onSelect={() => setSelected(n)}
            />
          );
        })}
      </div>

      {/* Barra inferior de confirmación */}
      <AnimatePresence>
        {selected !== null && choosing && !closed && !locked && (
          <motion.div
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-pine-950/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 sm:flex-row">
              <p className="text-center font-semibold sm:flex-1 sm:text-left">
                Elegiste la tarjeta <span className="font-display text-2xl text-gold-300">{cardLabel(selected, state.total)}</span>
              </p>
              <Button size="lg" onClick={claim} loading={claiming} className="w-full sm:w-auto" icon={<Gift className="size-5" aria-hidden />}>
                Abrir esta tarjeta
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animación de apertura */}
      <AnimatePresence>
        {phase.kind === "opening" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-pine-950/85 backdrop-blur-sm"
            role="status"
            aria-live="assertive"
          >
            <span className="sr-only">Abriendo tu tarjeta…</span>
            <div className="relative size-56">
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full bg-gold-300/40 blur-3xl"
                animate={reduced ? undefined : { scale: [0.6, 1.4, 2.2], opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.8, times: [0, 0.6, 1] }}
              />
              <motion.div
                className="absolute inset-x-6 bottom-4 top-20 rounded-2xl bg-gradient-to-br from-berry-500 to-berry-800 shadow-2xl"
                animate={reduced ? undefined : { rotate: [0, -6, 6, -6, 6, 0] }}
                transition={{ duration: 0.8 }}
              >
                <div aria-hidden className="absolute inset-y-0 left-1/2 w-6 -translate-x-1/2 bg-gold-400" />
              </motion.div>
              <motion.div
                aria-hidden
                className="absolute inset-x-3 top-12 h-12 rounded-xl bg-gradient-to-br from-berry-500 to-berry-700 shadow-xl"
                animate={reduced ? undefined : { y: [0, 0, -140], rotate: [0, 0, -35], opacity: [1, 1, 0] }}
                transition={{ duration: 1.6, times: [0, 0.5, 1] }}
              >
                <div className="absolute inset-y-0 left-1/2 w-6 -translate-x-1/2 bg-gold-400" />
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl">🎀</span>
              </motion.div>
              <motion.p
                className="absolute inset-x-0 -bottom-12 text-center font-display text-xl font-bold text-gold-300"
                animate={reduced ? undefined : { opacity: [0, 1] }}
                transition={{ delay: 0.6 }}
              >
                ✨ Abriendo tu regalo… ✨
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
