"use client";

import { EyeOff, Lock, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Label, Panel, Select, Textarea } from "@/components/ui/primitives";
import type { EmergencyRow } from "@/server/services/draw";
import { emergencyViewAction } from "./actions";

export function EmergencyView({ people }: { people: { id: string; fullName: string }[] }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [scope, setScope] = useState<string>("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<EmergencyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const consult = () => {
    setError(null);
    startTransition(async () => {
      const res = await emergencyViewAction({ giverId: scope || null, reason, acknowledged });
      if (res.ok) setRows(res.data);
      else setError(res.message);
    });
  };

  if (rows) {
    return (
      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-gold-300">
            <Lock className="size-4" aria-hidden /> Consulta registrada en la auditoría. No compartas esta pantalla.
          </p>
          <Button variant="outline" onClick={() => setRows(null)} icon={<EyeOff className="size-4" aria-hidden />}>
            Ocultar resultados
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-white/60">No hay asignaciones (el sorteo no se ha generado).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-white/55">
                <tr>
                  <th className="px-3 py-2">Regala</th>
                  <th className="px-3 py-2" aria-label="a" />
                  <th className="px-3 py-2">Recibe</th>
                  <th className="px-3 py-2">¿Ya reveló?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.giverId} className="border-t border-white/5">
                    <td className="px-3 py-2 font-semibold">
                      {r.giverName} <span className="font-mono text-xs text-white/50">({r.giverIdentifier})</span>
                    </td>
                    <td className="px-3 py-2 text-gold-300">→</td>
                    <td className="px-3 py-2 font-semibold">
                      {r.receiverName} <span className="font-mono text-xs text-white/50">({r.receiverIdentifier})</span>
                    </td>
                    <td className="px-3 py-2">{r.revealed ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  }

  return (
    <Panel className="space-y-5">
      <Alert tone="danger" icon={<ShieldAlert className="size-6" />} title="Información secreta">
        Estás a punto de consultar información secreta del sorteo. Esta acción puede revelar quién le regala a quién.
        Quedará registrado tu nombre, la fecha, la hora y el alcance de la consulta.
      </Alert>
      <div>
        <Label htmlFor="em-scope">¿Qué necesitas consultar?</Label>
        <Select id="em-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Todas las asignaciones</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              Solo a quién le regala {p.fullName}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-white/55">Consulta solo lo indispensable: elige a una persona si es posible.</p>
      </div>
      <div>
        <Label htmlFor="em-reason">Motivo de la consulta</Label>
        <Textarea
          id="em-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: la tía Carmen perdió su celular y no recuerda a quién le regala."
          maxLength={500}
        />
      </div>
      <label className="flex items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 size-5 accent-[var(--color-berry-500)]"
        />
        Entiendo que voy a ver información secreta y que esta consulta quedará registrada.
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button variant="danger" size="lg" className="w-full" disabled={!acknowledged || reason.trim().length < 3} loading={pending} onClick={consult}>
        🔒 Consultar asignaciones
      </Button>
    </Panel>
  );
}
