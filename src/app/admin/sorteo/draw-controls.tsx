"use client";

import { Download, Lock, Play, RotateCcw, Unlock } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { EventStatus } from "@/domain/event-state";
import { resetDrawAction, setDrawLockedAction, startDrawAction } from "./actions";

export function DrawControls({
  status,
  locked,
  activeCount,
  revealed,
}: {
  status: EventStatus;
  locked: boolean;
  activeCount: number;
  revealed: number;
}) {
  const toast = useToast();
  const [dialog, setDialog] = useState<"start" | "reset" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(success, "success");
        setDialog(null);
      } else toast(res.message ?? "No se pudo completar la acción.", "error");
    });

  const canReset = status === "DRAW_OPEN" || status === "READY_FOR_DELIVERY";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel>
        <h2 className="font-display text-xl font-bold">Iniciar sorteo</h2>
        <p className="mt-1 text-sm text-white/70">
          Genera en el servidor todas las asignaciones (nadie se tiene a sí mismo, cada persona recibe exactamente una vez) y
          crea {activeCount} tarjetas.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          disabled={status !== "DRAFT" || activeCount < 2}
          onClick={() => setDialog("start")}
          icon={<Play className="size-5" aria-hidden />}
        >
          {status === "DRAFT" ? "Iniciar sorteo" : "Sorteo ya iniciado"}
        </Button>
        {status === "DRAFT" && activeCount < 2 && (
          <p className="mt-2 text-sm text-berry-300">Se necesitan al menos 2 participantes activos.</p>
        )}
      </Panel>

      <Panel>
        <h2 className="font-display text-xl font-bold">Pausar revelaciones</h2>
        <p className="mt-1 text-sm text-white/70">
          Bloquea temporalmente nuevas selecciones de tarjetas. No borra ningún resultado.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          variant={locked ? "gold" : "outline"}
          disabled={status !== "DRAW_OPEN" || pending}
          onClick={() => run(() => setDrawLockedAction(!locked), locked ? "Sorteo reanudado." : "Sorteo en pausa.")}
          icon={locked ? <Unlock className="size-5" aria-hidden /> : <Lock className="size-5" aria-hidden />}
        >
          {locked ? "Reanudar sorteo" : "Pausar sorteo"}
        </Button>
      </Panel>

      <Panel>
        <h2 className="font-display text-xl font-bold">Exportar seguimiento</h2>
        <p className="mt-1 text-sm text-white/70">
          Nombre, identificador, rol, estado y fecha de participación. <strong>No incluye</strong> las asignaciones secretas.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <a
            href="/api/admin/exportar?formato=xlsx"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 font-bold hover:bg-white/10"
          >
            <Download className="size-5 text-gold-300" aria-hidden /> Excel
          </a>
          <a
            href="/api/admin/exportar?formato=csv"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 font-bold hover:bg-white/10"
          >
            <Download className="size-5 text-gold-300" aria-hidden /> CSV
          </a>
        </div>
      </Panel>

      <Panel className="border-berry-500/30">
        <h2 className="font-display text-xl font-bold text-berry-300">Reiniciar sorteo</h2>
        <p className="mt-1 text-sm text-white/70">
          Invalida todas las asignaciones, libera las tarjetas y borra las revelaciones. Úsalo solo si necesitas cambiar la lista
          de participantes. El nuevo sorteo se generará cuando lo vuelvas a iniciar.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          variant="danger"
          disabled={!canReset}
          onClick={() => setDialog("reset")}
          icon={<RotateCcw className="size-5" aria-hidden />}
        >
          Reiniciar sorteo…
        </Button>
        {status === "DELIVERY_ACTIVE" || status === "COMPLETED" || status === "ARCHIVED" ? (
          <p className="mt-2 text-xs text-white/55">No disponible: la entrega de regalos ya comenzó.</p>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={dialog === "start"}
        onClose={() => setDialog(null)}
        loading={pending}
        tone="primary"
        title="¿Iniciar el sorteo?"
        confirmLabel="Sí, iniciar sorteo"
        onConfirm={() => run(startDrawAction, "¡Sorteo iniciado! Ya pueden escoger sus tarjetas.")}
        description={
          <>
            Se generarán las asignaciones de los <strong>{activeCount} participantes activos</strong>. Después ya no podrás
            agregar ni quitar personas ni cambiar identificadores sin reiniciar el sorteo.
          </>
        }
      />
      <ConfirmDialog
        open={dialog === "reset"}
        onClose={() => setDialog(null)}
        loading={pending}
        tone="danger"
        title="⚠️ Reiniciar el sorteo"
        confirmLabel="Reiniciar definitivamente"
        requireWord="REINICIAR"
        requireReason
        reasonLabel="¿Por qué reinicias el sorteo? (queda registrado)"
        onConfirm={(reason) => run(() => resetDrawAction(reason), "Sorteo reiniciado. El evento volvió a preparación.")}
        description={
          <div className="space-y-2">
            <p>
              Las asignaciones actuales <strong>dejarán de ser válidas</strong>. {revealed > 0 && (
                <>
                  <strong>{revealed} persona(s)</strong> ya descubrieron a su amigo secreto y tendrán que volver a participar.
                </>
              )}
            </p>
            <p className="text-sm text-white/60">Esta acción queda registrada en la auditoría.</p>
          </div>
        }
      />
    </div>
  );
}
