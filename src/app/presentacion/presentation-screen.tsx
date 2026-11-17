"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Maximize, Minimize } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Confetti, Lights, Snowfall } from "@/components/festive";
import { useEventSignals } from "@/hooks/use-event-signals";
import type { PresentationState } from "@/server/services/delivery";
import type { PublicPerson } from "@/server/types";

type Overlay =
  | { kind: "shuffle"; turnId: string; receiver: PublicPerson; pool: PublicPerson[] }
  | { kind: "celebrate"; turnId: string; giver: PublicPerson; receiver: PublicPerson }
  | null;

/** Pantalla de solo lectura para TV/computador. Solo recibe el estado público del evento. */
export function PresentationScreen({ eventId, initial }: { eventId: string; initial: PresentationState }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [state, setState] = useState<PresentationState>(initial);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [confetti, setConfetti] = useState(0);
  const prev = useRef<PresentationState>(initial);
  const queue = useRef<Overlay[]>([]);

  const playNext = useCallback(() => {
    const next = queue.current.shift() ?? null;
    setOverlay(next);
    if (next?.kind === "celebrate") setConfetti(Date.now());
  }, []);

  const apply = useCallback(
    (next: PresentationState) => {
      const before = prev.current;
      const knownCompleted = new Set(before.completed.map((c) => c.turnId));
      const newlyCompleted = next.completed.filter((c) => !knownCompleted.has(c.turnId)).reverse();
      for (const c of newlyCompleted) {
        queue.current.push({ kind: "celebrate", turnId: c.turnId, giver: c.giver, receiver: c.receiver });
      }
      const t = next.activeTurn;
      if (t && t.turnId !== before.activeTurn?.turnId) {
        const pool = next.pending.length > 1 ? next.pending : next.mosaic;
        queue.current.push({ kind: "shuffle", turnId: t.turnId, receiver: t.receiver, pool });
      }
      if (next.event.status === "COMPLETED" && before.event.status !== "COMPLETED") setConfetti(Date.now());
      prev.current = next;
      setState(next);
      setOverlay((o) => {
        if (o) return o;
        const first = queue.current.shift() ?? null;
        if (first?.kind === "celebrate") setConfetti(Date.now());
        return first;
      });
    },
    [],
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/presentacion/estado", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/tv");
        return;
      }
      if (res.ok) apply((await res.json()) as PresentationState);
    } catch {
      // sin conexión: se reintenta en el siguiente ciclo
    }
  }, [apply, router]);
  useEventSignals(eventId, ["delivery", "event", "cards"], refetch, { fastPollMs: 3000, slowPollMs: 15000 });

  // Celebración final repetida de vez en cuando.
  useEffect(() => {
    if (state.event.status !== "COMPLETED") return;
    const id = setInterval(() => setConfetti(Date.now()), 15000);
    return () => clearInterval(id);
  }, [state.event.status]);

  const status = state.event.status;

  return (
    <div className="festive-pattern relative flex min-h-dvh flex-col overflow-hidden">
      <Snowfall count={24} />
      <Confetti fire={confetti} pieces={reduced ? 0 : 220} duration={6000} />
      <FullscreenButton />

      <header className="relative z-10 flex items-center justify-between px-[3vw] pt-[2.5vh]">
        <p className="font-display text-[clamp(1rem,2.2vw,2.4rem)] font-bold text-gold-300">🎅 {state.event.name}</p>
        {(status === "DELIVERY_ACTIVE" || status === "COMPLETED") && (
          <p className="font-display text-[clamp(1rem,2.2vw,2.4rem)] font-bold tabular-nums">
            🎁 {state.stats.delivered} / {state.stats.total}
          </p>
        )}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-[4vw] pb-[4vh] text-center">
        {status === "DRAFT" && (
          <Scene>
            <p className="text-[clamp(4rem,10vw,10rem)]" aria-hidden>
              🎄
            </p>
            <Title>Santa Secreto {state.event.year}</Title>
            <Sub>Muy pronto comenzará la magia…</Sub>
          </Scene>
        )}

        {status === "DRAW_OPEN" && state.drawProgress && (
          <Scene>
            <Title>✨ El sorteo está en marcha ✨</Title>
            <p className="mt-[4vh] font-display text-[clamp(4rem,12vw,13rem)] font-black leading-none text-gold-300 tabular-nums">
              {state.drawProgress.revealed}
              <span className="text-white/40"> / {state.drawProgress.total}</span>
            </p>
            <Sub>ya descubrieron a su amigo secreto</Sub>
            <BigProgress value={state.drawProgress.total ? (state.drawProgress.revealed / state.drawProgress.total) * 100 : 0} />
          </Scene>
        )}

        {status === "READY_FOR_DELIVERY" && (
          <Scene>
            <Title>🎉 ¡Todo listo para La Gran Revelación! 🎉</Title>
            <Sub>Todos ya conocen a su amigo secreto. ¡Que comience la entrega!</Sub>
            <Mosaic people={state.mosaic} />
          </Scene>
        )}

        {status === "DELIVERY_ACTIVE" && !overlay && (
          <>
            {state.activeTurn ? (
              <TurnSpotlight receiver={state.activeTurn.receiver} />
            ) : (
              <Scene>
                <Title>🎉 LA GRAN REVELACIÓN 🎉</Title>
                <p className="mt-[3vh] font-display text-[clamp(3rem,8vw,9rem)] font-black text-gold-300 tabular-nums">
                  {state.stats.delivered} <span className="text-white/40">/ {state.stats.total}</span>
                </p>
                <Sub>regalos entregados</Sub>
                <BigProgress value={state.stats.percent} />
                <p className="mt-[4vh] animate-pulse text-[clamp(1.2rem,2.2vw,2.4rem)] text-white/70">
                  Esperando el siguiente turno…
                </p>
                <RecentReveals items={state.completed.slice(0, 5)} />
              </Scene>
            )}
          </>
        )}

        {status === "COMPLETED" && (
          <Scene>
            <Title>🎄 ¡FELIZ NAVIDAD! 🎄</Title>
            <Sub>¡Todos nuestros amigos secretos han sido revelados!</Sub>
            <p className="mt-[1vh] text-[clamp(1.1rem,2vw,2.2rem)] text-gold-100">Gracias por compartir esta Navidad en familia.</p>
            <Mosaic people={state.mosaic} />
            <p className="mt-[3vh] font-display text-[clamp(1.4rem,3vw,3.2rem)] font-bold text-gold-300">
              {state.mosaic.length} participantes · {state.stats.delivered} regalos
            </p>
          </Scene>
        )}

        {status === "ARCHIVED" && (
          <Scene>
            <Title>🎄 {state.event.name}</Title>
            <Sub>Gracias por una Navidad inolvidable.</Sub>
          </Scene>
        )}
      </main>

      <AnimatePresence mode="wait">
        {overlay?.kind === "shuffle" && (
          <ShuffleOverlay
            key={overlay.turnId}
            receiver={overlay.receiver}
            pool={overlay.pool}
            reduced={!!reduced}
            onDone={playNext}
          />
        )}
        {overlay?.kind === "celebrate" && (
          <CelebrateOverlay key={overlay.turnId} giver={overlay.giver} receiver={overlay.receiver} onDone={playNext} />
        )}
      </AnimatePresence>

      <Lights className="relative z-10 pb-[2vh]" count={22} />
    </div>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex w-full flex-col items-center">
      {children}
    </motion.section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-[clamp(2.2rem,6vw,7rem)] font-black leading-[1.05] text-gold-gradient animate-shimmer">
      {children}
    </h1>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-[2vh] text-[clamp(1.2rem,2.6vw,3rem)] font-semibold text-white/85">{children}</p>;
}

function BigProgress({ value }: { value: number }) {
  return (
    <div className="mt-[4vh] h-[clamp(14px,2.2vh,28px)] w-[min(80vw,1400px)] overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
      <motion.div
        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-berry-500),var(--color-gold-400),var(--color-pine-300))]"
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );
}

function Mosaic({ people }: { people: PublicPerson[] }) {
  const size = people.length > 40 ? 84 : people.length > 24 ? 104 : 128;
  return (
    <div className="mt-[4vh] flex max-w-[92vw] flex-wrap justify-center gap-[1.2vw]">
      {people.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: Math.min(i * 0.03, 1.5) }}
          className="flex flex-col items-center"
          title={p.fullName}
        >
          <Avatar name={p.fullName} src={p.photoUrl} size={size} />
        </motion.div>
      ))}
    </div>
  );
}

function TurnSpotlight({ receiver }: { receiver: PublicPerson }) {
  return (
    <motion.section
      key={receiver.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center"
    >
      <p className="font-display text-[clamp(2rem,5vw,6rem)] font-black text-berry-300 drop-shadow">🎁 ¡ES TU TURNO!</p>
      <div className="relative mt-[3vh]">
        <div aria-hidden className="absolute -inset-[2vh] animate-pulse rounded-full bg-gold-300/30 blur-2xl" />
        <Avatar name={receiver.fullName} src={receiver.photoUrl} size={340} className="relative size-[min(42vh,30vw)]!" />
      </div>
      <h2 className="mt-[4vh] font-display text-[clamp(2.4rem,6.5vw,7.5rem)] font-black uppercase leading-none text-gold-gradient">
        {receiver.fullName}
      </h2>
      <p className="mt-[2.5vh] text-[clamp(1.2rem,2.4vw,2.8rem)] text-white/85">
        ¿Quién será su amigo secreto? ¡Que pase al frente con el regalo! 🎄
      </p>
    </motion.section>
  );
}

/** Ruleta de fotografías que desacelera hasta detenerse en la persona elegida. */
function ShuffleOverlay({
  receiver,
  pool,
  reduced,
  onDone,
}: {
  receiver: PublicPerson;
  pool: PublicPerson[];
  reduced: boolean;
  onDone: () => void;
}) {
  const instant = reduced || pool.length < 2;
  const [current, setCurrent] = useState<PublicPerson>(instant ? receiver : pool[0]);
  const [landed, setLanded] = useState(instant);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (instant) {
      const t = setTimeout(() => done.current(), 2500);
      return () => clearTimeout(t);
    }
    let delay = 70;
    let elapsed = 0;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      elapsed += delay;
      if (elapsed > 3600) {
        setCurrent(receiver);
        setLanded(true);
        timer = setTimeout(() => done.current(), 2600);
        return;
      }
      i = (i + 1) % pool.length;
      setCurrent(pool[i]);
      delay = Math.min(delay * 1.12, 420);
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [pool, receiver, instant]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-pine-950 text-center"
    >
      <p className="font-display text-[clamp(1.8rem,4vw,5rem)] font-black text-gold-300">
        {landed ? "🎁 ¡ES TU TURNO!" : "🎲 ¿Quién será…?"}
      </p>
      <motion.div
        key={current.id + String(landed)}
        initial={{ scale: landed ? 0.7 : 0.94, rotate: landed ? -8 : 0 }}
        animate={{ scale: landed ? 1.08 : 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: landed ? 140 : 400, damping: landed ? 10 : 30 }}
        className="mt-[4vh]"
      >
        <Avatar name={current.fullName} src={current.photoUrl} size={340} className="size-[min(46vh,32vw)]!" />
      </motion.div>
      <p
        className={`mt-[4vh] font-display text-[clamp(2.2rem,6vw,7rem)] font-black uppercase leading-none ${
          landed ? "text-gold-gradient" : "text-white/70"
        }`}
      >
        {current.fullName}
      </p>
    </motion.div>
  );
}

function CelebrateOverlay({ giver, receiver, onDone }: { giver: PublicPerson; receiver: PublicPerson; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 7000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-berry-800 to-pine-950 px-[4vw] text-center"
    >
      <motion.p
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 12 }}
        className="font-display text-[clamp(2.4rem,6vw,7rem)] font-black text-gold-gradient"
      >
        🎉 ¡Regalo entregado! 🎉
      </motion.p>
      <div className="mt-[5vh] flex items-center gap-[4vw]">
        <motion.div initial={{ x: -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col items-center">
          <Avatar name={giver.fullName} src={giver.photoUrl} size={260} className="size-[min(30vh,22vw)]!" />
          <p className="mt-[2vh] max-w-[28vw] font-display text-[clamp(1.4rem,3vw,3.4rem)] font-bold">{giver.fullName}</p>
        </motion.div>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.4, 1] }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-[clamp(3rem,7vw,8rem)]"
          aria-hidden
        >
          🎁
        </motion.span>
        <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col items-center">
          <Avatar name={receiver.fullName} src={receiver.photoUrl} size={260} className="size-[min(30vh,22vw)]!" />
          <p className="mt-[2vh] max-w-[28vw] font-display text-[clamp(1.4rem,3vw,3.4rem)] font-bold">{receiver.fullName}</p>
        </motion.div>
      </div>
      <p className="mt-[5vh] text-[clamp(1.2rem,2.6vw,3rem)] font-semibold text-gold-100">
        {giver.fullName.split(" ")[0]} era el amigo secreto de {receiver.fullName.split(" ")[0]} 🎄
      </p>
    </motion.div>
  );
}

function RecentReveals({ items }: { items: PresentationState["completed"] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-[5vh] flex max-w-[92vw] flex-wrap justify-center gap-[1.5vw]">
      {items.map((c) => (
        <div key={c.turnId} className="glass flex items-center gap-3 rounded-full py-2 pl-2 pr-5">
          <Avatar name={c.giver.fullName} src={c.giver.photoUrl} size={52} ring={false} />
          <span className="text-gold-300" aria-hidden>
            →
          </span>
          <Avatar name={c.receiver.fullName} src={c.receiver.photoUrl} size={52} ring={false} />
          <span className="text-[clamp(0.9rem,1.3vw,1.4rem)] font-semibold">
            {c.giver.fullName.split(" ")[0]} → {c.receiver.fullName.split(" ")[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return (
    <button
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
      className="fixed right-4 top-4 z-50 rounded-xl bg-white/5 p-3 text-white/40 transition hover:bg-white/15 hover:text-white"
      aria-label={full ? "Salir de pantalla completa" : "Pantalla completa"}
    >
      {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
    </button>
  );
}
