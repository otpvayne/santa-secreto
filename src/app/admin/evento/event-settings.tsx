"use client";

import { Archive, CalendarPlus, ImageOff, Power, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, Input, Label, Panel, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABELS, type EventStatus } from "@/domain/event-state";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  activateEventAction,
  archiveEventAction,
  createEventAction,
  purgeEventAction,
  updateEventAction,
} from "./actions";

export interface EventListItem {
  id: string;
  name: string;
  year: number;
  description: string | null;
  status: EventStatus;
  isCurrent: boolean;
  deliveryDate: string | null;
  createdAt: Date;
  drawStartedAt: Date | null;
  completedAt: Date | null;
  participantCount: number;
}

type Pending =
  | { kind: "activate"; event: EventListItem }
  | { kind: "purge-photos"; event: EventListItem }
  | { kind: "purge-all"; event: EventListItem }
  | { kind: "archive" }
  | null;

export function EventSettings({ current, events }: { current: EventListItem; events: EventListItem[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Pending>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = current.status === "ARCHIVED";

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateEventAction(Object.fromEntries(fd));
      if (res.ok) toast("Configuración guardada.", "success");
      else setError(res.message);
    });
  };

  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const copy = fd.get("copy") === "on";
    fd.delete("copy");
    startTransition(async () => {
      const res = await createEventAction(Object.fromEntries(fd), copy);
      if (res.ok) {
        toast("Evento creado. Actívalo cuando quieras usarlo.", "success");
        setCreating(false);
      } else toast(res.message, "error");
    });
  };

  const runConfirm = () => {
    if (!confirm) return;
    startTransition(async () => {
      if (confirm.kind === "activate") {
        const res = await activateEventAction(confirm.event.id);
        if (res.ok) {
          router.replace("/ingresar");
          return;
        }
        toast(res.message, "error");
      } else if (confirm.kind === "archive") {
        const res = await archiveEventAction();
        toast(res.ok ? "Evento archivado." : res.message, res.ok ? "success" : "error");
      } else {
        const res = await purgeEventAction(confirm.event.id, confirm.kind === "purge-all" ? "ALL" : "PHOTOS");
        toast(res.ok ? `Datos eliminados (${res.data.photos} fotos).` : res.message, res.ok ? "success" : "error");
      }
      setConfirm(null);
    });
  };

  const canSwitch = ["DRAFT", "COMPLETED", "ARCHIVED"].includes(current.status);

  return (
    <div className="space-y-6">
      <Panel>
        <h2 className="mb-4 font-display text-xl font-bold">Configuración del evento actual</h2>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="ev-name">Nombre del evento</Label>
            <Input id="ev-name" name="name" defaultValue={current.name} required maxLength={120} disabled={archived} />
          </div>
          <div>
            <Label htmlFor="ev-year">Año</Label>
            <Input id="ev-year" name="year" type="number" defaultValue={current.year} min={2000} max={2200} disabled={archived} />
          </div>
          <div>
            <Label htmlFor="ev-date">Fecha de entrega de regalos</Label>
            <Input id="ev-date" name="deliveryDate" type="date" defaultValue={current.deliveryDate ?? ""} disabled={archived} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ev-desc">Descripción</Label>
            <Textarea id="ev-desc" name="description" defaultValue={current.description ?? ""} maxLength={1000} disabled={archived} />
          </div>
          {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" loading={pending} disabled={archived} icon={<Save className="size-4" aria-hidden />}>
              Guardar
            </Button>
            {current.status === "COMPLETED" && (
              <Button variant="outline" onClick={() => setConfirm({ kind: "archive" })} icon={<Archive className="size-4" aria-hidden />}>
                Archivar evento
              </Button>
            )}
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Eventos</h2>
            <p className="text-sm text-white/65">Reutiliza la aplicación cada año. Las asignaciones nunca se mezclan entre eventos.</p>
          </div>
          <Button variant="gold" onClick={() => setCreating(true)} icon={<CalendarPlus className="size-4" aria-hidden />}>
            Nuevo evento
          </Button>
        </div>
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold">
                    {ev.name} <span className="text-white/50">· {ev.year}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/60">
                    {ev.isCurrent && <Badge tone="gold">Actual</Badge>}
                    <Badge>{STATUS_LABELS[ev.status]}</Badge>
                    <span>{ev.participantCount} participantes</span>
                    {ev.deliveryDate && <span>· Entrega: {formatDate(ev.deliveryDate)}</span>}
                    <span>· Creado {formatDateTime(ev.createdAt)}</span>
                  </div>
                </div>
                {!ev.isCurrent && (
                  <div className="flex flex-wrap gap-2">
                    {ev.status !== "ARCHIVED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canSwitch}
                        title={!canSwitch ? "Termina o archiva el evento actual antes de cambiar" : undefined}
                        onClick={() => setConfirm({ kind: "activate", event: ev })}
                        icon={<Power className="size-4" aria-hidden />}
                      >
                        Activar
                      </Button>
                    )}
                    {ev.status === "ARCHIVED" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "purge-photos", event: ev })} icon={<ImageOff className="size-4" aria-hidden />}>
                          Borrar fotos
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: "purge-all", event: ev })} icon={<Trash2 className="size-4" aria-hidden />}>
                          Borrar evento
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo evento">
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="nv-name">Nombre</Label>
            <Input id="nv-name" name="name" required maxLength={120} defaultValue={`Santa Secreto ${current.year + 1}`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nv-year">Año</Label>
              <Input id="nv-year" name="year" type="number" defaultValue={current.year + 1} />
            </div>
            <div>
              <Label htmlFor="nv-date">Fecha de entrega</Label>
              <Input id="nv-date" name="deliveryDate" type="date" />
            </div>
          </div>
          <div>
            <Label htmlFor="nv-desc">Descripción</Label>
            <Textarea id="nv-desc" name="description" maxLength={1000} />
          </div>
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input type="checkbox" name="copy" defaultChecked className="mt-0.5 size-5 accent-[var(--color-gold-500)]" />
            <span>
              Copiar los participantes de este evento (nombre, número, rol y foto).
              <span className="block font-normal text-white/60">Nunca se copian asignaciones ni resultados. Tú quedarás como organizador.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Crear evento
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={pending}
        tone={confirm?.kind === "activate" || confirm?.kind === "archive" ? "primary" : "danger"}
        requireWord={confirm?.kind === "purge-all" ? "BORRAR" : undefined}
        title={
          confirm?.kind === "activate"
            ? "Activar otro evento"
            : confirm?.kind === "archive"
              ? "Archivar evento"
              : confirm?.kind === "purge-all"
                ? "Borrar evento archivado"
                : "Borrar fotos del evento archivado"
        }
        confirmLabel={confirm?.kind === "activate" ? "Activar y cerrar sesiones" : confirm?.kind === "archive" ? "Archivar" : "Borrar"}
        description={
          confirm?.kind === "activate" ? (
            <>
              «{confirm.event.name}» pasará a ser el evento actual. <strong>Todas las sesiones se cerrarán</strong> y cada persona
              (incluido tú) deberá identificarse de nuevo.
            </>
          ) : confirm?.kind === "archive" ? (
            <>El evento quedará como histórico y no podrá modificarse. Los participantes podrán seguir consultando sus resultados.</>
          ) : confirm?.kind === "purge-all" ? (
            <>
              Se eliminarán definitivamente los participantes, asignaciones, turnos y fotos de «{confirm.event.name}». El
              registro de auditoría se conserva.
            </>
          ) : confirm?.kind === "purge-photos" ? (
            <>Se eliminarán las fotografías de «{confirm.event.name}» (excepto las que se reutilizan en otros eventos).</>
          ) : null
        }
      />
    </div>
  );
}
