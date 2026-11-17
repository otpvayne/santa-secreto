"use client";

import {
  CheckCircle2,
  Dice5,
  Eye,
  Flag,
  Hand,
  History,
  MonitorPlay,
  Search,
  SkipForward,
  Tv,
  Undo2,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Confetti } from "@/components/festive";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Panel, ProgressBar, StatCard } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { normalizeName } from "@/domain/normalize";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PublicPerson } from "@/server/types";
import {
  cancelTurnAction,
  confirmDeliveryAction,
  createTvCodeAction,
  expectedGiverAction,
  finishEventAction,
  revertDeliveryAction,
  startDeliveryAction,
  startTurnAction,
} from "./actions";

export interface DeliveryPanelState {
  status: string;
  stats: { total: number; delivered: number; pending: number; percent: number };
  activeTurn: { turnId: string; mode: "RANDOM" | "MANUAL"; startedAt: Date; receiver: PublicPerson } | null;
  pending: PublicPerson[];
  completed: { turnId: string; receiver: PublicPerson; giver: PublicPerson; confirmedAt: Date; confirmedByName: string | null }[];
}

type Result = { ok: true; data?: unknown } | { ok: false; message: string };

export function DeliveryPanel({ state }: { state: DeliveryPanelState }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [query, setQuery] = useState("");
  const [giver, setGiver] = useState<{ turnId: string; person: PublicPerson & { identifier: string } } | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [dialog, setDialog] = useState<
    { kind: "revert"; turnId: string; name: string } | { kind: "force" } | { kind: "finish" } | { kind: "start" } | null
  >(null);
  const [tvCode, setTvCode] = useState<{ code: string; expiresAt: Date } | null>(null);

  const run = (fn: () => Promise<Result>, success?: string, after?: (data: unknown) => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (success) toast(success, "success");
        after?.(res.data);
        setDialog(null);
      } else toast(res.message, "error");
    });

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return q ? state.pending.filter((p) => normalizeName(p.fullName).includes(q)) : state.pending;
  }, [query, state.pending]);

  const active = state.activeTurn;
  const shownGiver = giver && active && giver.turnId === active.turnId ? giver.person : null;
  const allDelivered = state.stats.pending === 0;

  if (state.status === "READY_FOR_DELIVERY") {
    return (
      <div className="space-y-4">
        <Panel className="text-center">
          <p className="text-6xl" aria-hidden>
            🎉
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">¡Todo listo para La Gran Revelación!</h2>
          <p className="mx-auto mt-2 max-w-md text-white/70">
            Todos descubrieron a su amigo secreto. Cuando la familia esté reunida, inicia el evento de entrega.
          </p>
          <Button size="xl" className="mt-6 w-full sm:w-auto" onClick={() => setDialog({ kind: "start" })}>
            🎉 Iniciar La Gran Revelación
          </Button>
        </Panel>
        <TvCard tvCode={tvCode} onCreate={() => run(createTvCodeAction, undefined, (d) => setTvCode(d as { code: string; expiresAt: Date }))} loading={pending} />
        <ConfirmDialog
          open={dialog?.kind === "start"}
          onClose={() => setDialog(null)}
          loading={pending}
          title="Iniciar la entrega de regalos"
          confirmLabel="¡Comenzar!"
          onConfirm={() => run(startDeliveryAction, "¡Comenzó La Gran Revelación!")}
          description="Se habilitarán los turnos y la pantalla de presentación mostrará el evento en vivo."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Confetti fire={celebrate} pieces={90} duration={3000} />

      {/* Progreso */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={state.stats.total} accent="gold" />
        <StatCard label="Entregados" value={state.stats.delivered} accent="pine" />
        <StatCard label="Pendientes" value={state.stats.pending} accent="berry" />
        <StatCard label="Progreso" value={`${state.stats.percent} %`} accent="gold" />
      </div>
      <ProgressBar value={state.stats.percent} label="Regalos entregados" />

      {state.status === "COMPLETED" ? (
        <Panel className="text-center">
          <p className="text-6xl" aria-hidden>
            🎄
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">¡Feliz Navidad!</h2>
          <p className="mt-2 text-white/70">El evento finalizó. Puedes archivarlo desde la sección «Evento».</p>
        </Panel>
      ) : active ? (
        /* Turno activo */
        <Panel className="border-gold-300/30 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold-300">🎁 Turno actual</p>
          <div className="mt-4 flex justify-center">
            <Avatar name={active.receiver.fullName} src={active.receiver.photoUrl} size={128} />
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold">{active.receiver.fullName}</h2>
          <p className="text-sm text-white/60">
            {active.mode === "RANDOM" ? "Elegido al azar" : "Elegido manualmente"} · {formatTime(active.startedAt)}
          </p>

          <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-white/10 bg-pine-950/50 p-4 text-left">
            {shownGiver ? (
              <div className="flex items-center gap-3">
                <Avatar name={shownGiver.fullName} src={shownGiver.photoUrl} size={52} ring={false} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gold-300">Debe entregar</p>
                  <p className="font-bold">{shownGiver.fullName}</p>
                  <p className="text-xs text-white/50">N.º {shownGiver.identifier} · no muestres esta pantalla</p>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                loading={pending}
                onClick={() =>
                  run(
                    () => expectedGiverAction(active.turnId),
                    undefined,
                    (d) => setGiver({ turnId: active.turnId, person: d as PublicPerson & { identifier: string } }),
                  )
                }
                icon={<Eye className="size-4" aria-hidden />}
              >
                Validar quién debe entregar
              </Button>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              size="xl"
              loading={pending}
              onClick={() =>
                run(
                  () => confirmDeliveryAction(active.turnId),
                  "¡Entrega confirmada! 🎉",
                  () => setCelebrate(Date.now()),
                )
              }
              icon={<CheckCircle2 className="size-6" aria-hidden />}
            >
              Confirmar entrega
            </Button>
            <Button
              size="xl"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => cancelTurnAction(active.turnId), "Turno omitido. La persona sigue pendiente.")}
              icon={<SkipForward className="size-5" aria-hidden />}
            >
              Omitir
            </Button>
          </div>
        </Panel>
      ) : allDelivered ? (
        <Panel className="text-center">
          <p className="text-5xl" aria-hidden>
            🏁
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold">¡Todos recibieron su regalo!</h2>
          <Button size="xl" variant="gold" className="mt-5 w-full sm:w-auto" onClick={() => setDialog({ kind: "finish" })} icon={<Flag className="size-5" aria-hidden />}>
            Finalizar evento
          </Button>
        </Panel>
      ) : (
        /* Elegir siguiente turno */
        <Panel>
          <div role="radiogroup" aria-label="Modo de selección" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-pine-950/60 p-1">
            {(["RANDOM", "MANUAL"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-xl font-bold transition",
                  mode === m ? "bg-gold-300 text-pine-950" : "text-white/70 hover:bg-white/5",
                )}
              >
                {m === "RANDOM" ? <Dice5 className="size-5" aria-hidden /> : <Hand className="size-5" aria-hidden />}
                {m === "RANDOM" ? "Aleatorio" : "Manual"}
              </button>
            ))}
          </div>
          {mode === "RANDOM" ? (
            <div className="text-center">
              <Button
                size="xl"
                className="w-full"
                loading={pending}
                onClick={() => run(() => startTurnAction("RANDOM", null))}
              >
                🎲 Elegir siguiente participante
              </Button>
              <p className="mt-3 text-sm text-white/60">
                El servidor escoge al azar entre las {state.stats.pending} personas que aún no reciben su regalo.
              </p>
            </div>
          ) : (
            <div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" aria-hidden />
                <Input aria-label="Buscar persona pendiente" placeholder="Buscar persona pendiente…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
              </div>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      disabled={pending}
                      onClick={() => run(() => startTurnAction("MANUAL", p.id))}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left hover:bg-white/10 disabled:opacity-50"
                    >
                      <Avatar name={p.fullName} src={p.photoUrl} size={40} ring={false} />
                      <span className="flex-1 font-semibold">{p.fullName}</span>
                      <span className="text-sm font-bold text-gold-300">Elegir</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="p-4 text-center text-white/60">Nadie coincide con la búsqueda.</li>}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {state.status === "DELIVERY_ACTIVE" && (
        <TvCard tvCode={tvCode} onCreate={() => run(createTvCodeAction, undefined, (d) => setTvCode(d as { code: string; expiresAt: Date }))} loading={pending} />
      )}

      {/* Historial */}
      <Panel>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
          <History className="size-5 text-gold-300" aria-hidden /> Entregas confirmadas
        </h2>
        {state.completed.length === 0 ? (
          <p className="text-sm text-white/60">Todavía no hay entregas.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {state.completed.map((c) => (
              <li key={c.turnId} className="flex items-center gap-3 py-2.5">
                <Avatar name={c.giver.fullName} src={c.giver.photoUrl} size={36} ring={false} />
                <span aria-hidden className="text-gold-300">
                  →
                </span>
                <Avatar name={c.receiver.fullName} src={c.receiver.photoUrl} size={36} ring={false} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">
                    <strong>{c.giver.fullName}</strong> le regaló a <strong>{c.receiver.fullName}</strong>
                  </p>
                  <p className="text-xs text-white/50">
                    {formatTime(c.confirmedAt)}
                    {c.confirmedByName && ` · confirmó ${c.confirmedByName}`}
                  </p>
                </div>
                {state.status !== "ARCHIVED" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog({ kind: "revert", turnId: c.turnId, name: c.receiver.fullName })}
                    icon={<Undo2 className="size-4" aria-hidden />}
                  >
                    <span className="sr-only sm:not-sr-only">Corregir</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {state.status === "DELIVERY_ACTIVE" && !allDelivered && (
        <div className="text-center">
          <button onClick={() => setDialog({ kind: "force" })} className="text-sm text-white/50 underline hover:text-white/80">
            Finalizar con regalos pendientes (excepcional)
          </button>
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === "revert"}
        onClose={() => setDialog(null)}
        loading={pending}
        tone="danger"
        requireReason
        reasonLabel="¿Qué pasó? (queda registrado)"
        title="Corregir entrega"
        confirmLabel="Corregir"
        onConfirm={(reason) =>
          dialog?.kind === "revert" && run(() => revertDeliveryAction(dialog.turnId, reason), "Entrega corregida. La persona vuelve a quedar pendiente.")
        }
        description={
          <>
            La entrega a <strong>{dialog?.kind === "revert" ? dialog.name : ""}</strong> se marcará como equivocada y la persona
            volverá a quedar pendiente.
          </>
        }
      />
      <ConfirmDialog
        open={dialog?.kind === "finish"}
        onClose={() => setDialog(null)}
        loading={pending}
        tone="gold"
        title="Finalizar el evento"
        confirmLabel="Finalizar 🎄"
        onConfirm={() => run(() => finishEventAction(false, null), "¡Evento finalizado! Feliz Navidad 🎄")}
        description="La pantalla de presentación mostrará la celebración final."
      />
      <ConfirmDialog
        open={dialog?.kind === "force"}
        onClose={() => setDialog(null)}
        loading={pending}
        tone="danger"
        requireWord="FINALIZAR"
        requireReason
        reasonLabel="Motivo (queda registrado como finalización excepcional)"
        title="⚠️ Finalización excepcional"
        confirmLabel="Finalizar de todos modos"
        onConfirm={(reason) => run(() => finishEventAction(true, reason), "Evento finalizado de forma excepcional.")}
        description={
          <>
            Aún faltan <strong>{state.stats.pending}</strong> regalos por entregar. Esta operación quedará identificada como
            excepcional en la auditoría.
          </>
        }
      />
    </div>
  );
}

function TvCard({
  tvCode,
  onCreate,
  loading,
}: {
  tvCode: { code: string; expiresAt: Date } | null;
  onCreate: () => void;
  loading: boolean;
}) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  return (
    <Panel>
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <Tv className="size-5 text-gold-300" aria-hidden /> Pantalla de presentación
      </h2>
      <p className="mt-1 text-sm text-white/65">
        En el televisor o computador abre <strong className="text-gold-300">{origin}/tv</strong> y escribe el código. Es de
        solo lectura y nunca muestra secretos antes de cada entrega.
      </p>
      {tvCode ? (
        <div className="mt-4 rounded-2xl border border-gold-300/30 bg-pine-950/60 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-white/60">Código (un solo uso)</p>
          <p className="mt-1 font-mono text-5xl font-black tracking-[0.25em] text-gold-300">{tvCode.code}</p>
          <p className="mt-1 text-xs text-white/50">Vence a las {formatTime(tvCode.expiresAt)}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={onCreate} loading={loading} icon={<Tv className="size-4" aria-hidden />}>
          {tvCode ? "Generar otro código" : "Generar código para el TV"}
        </Button>
        <a
          href="/presentacion"
          target="_blank"
          rel="noopener"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold text-white/80 hover:bg-white/10"
        >
          <MonitorPlay className="size-4" aria-hidden /> Abrir aquí
        </a>
      </div>
    </Panel>
  );
}
