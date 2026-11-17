"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Label, Panel, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { WishRow, WishRowStatus, WishesPreview } from "@/server/import/gift-wishes";
import { confirmGiftWishesAction, previewGiftWishesAction } from "../actions";

const STATUS_INFO: Record<WishRowStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  UPDATE: { label: "Nuevas sugerencias", tone: "success" },
  REVIEW: { label: "Revisar", tone: "warning" },
  UNCHANGED: { label: "Sin cambios", tone: "neutral" },
  EMPTY: { label: "Celda vacía", tone: "info" },
  NOT_FOUND: { label: "Sin coincidencia", tone: "danger" },
  CONFLICT: { label: "Conflicto", tone: "danger" },
};

type Filter = "all" | WishRowStatus;

function WishText({ value, empty }: { value: string | null; empty: string }) {
  return value ? (
    <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{value}</p>
  ) : (
    <p className="text-sm italic text-white/40">{empty}</p>
  );
}

export function GiftWishesWizard() {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [wishesColumn, setWishesColumn] = useState<number | null>(null);
  const [preview, setPreview] = useState<WishesPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const analyze = (f: File, column: number | null) => {
    setFile(f);
    setWishesColumn(column);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      if (column !== null) fd.set("wishesColumn", String(column));
      const res = await previewGiftWishesAction(fd);
      if (!res.ok) {
        setPreview(null);
        setError(res.message);
        return;
      }
      setPreview(res.data);
      // Solo las coincidencias seguras vienen marcadas; las que requieren revisión se marcan a mano.
      setSelected(new Set(res.data.rows.filter((r) => r.status === "UPDATE").map((r) => r.row)));
      setFilter("all");
    });
  };

  const rowsById = useMemo(() => new Map((preview?.rows ?? []).map((r) => [r.row, r])), [preview]);
  const chosen = [...selected].map((n) => rowsById.get(n)).filter((r): r is WishRow => !!r && !!r.participantId);
  const visible = (preview?.rows ?? []).filter((r) => filter === "all" || r.status === filter);

  const toggle = (row: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });

  const apply = () => {
    if (!file || !preview) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      if (wishesColumn !== null) fd.set("wishesColumn", String(wishesColumn));
      else if (preview.columns.wishes !== undefined) fd.set("wishesColumn", String(preview.columns.wishes));
      fd.set("selection", JSON.stringify(chosen.map((r) => ({ row: r.row, participantId: r.participantId }))));
      const res = await confirmGiftWishesAction(fd);
      setConfirming(false);
      if (res.ok) {
        toast(`Se actualizaron las sugerencias de ${res.data.updated} participante(s).`, "success");
        router.push("/admin/participantes");
      } else setError(res.message);
    });
  };

  const s = preview?.summary;

  return (
    <div className="space-y-5">
      <Panel>
        <ul className="mb-5 list-inside list-disc space-y-1 text-sm text-white/75">
          <li>Sube el Excel (.xlsx) o CSV con los participantes y una columna con sus sugerencias de regalo.</li>
          <li>
            Solo se actualizan las <strong>sugerencias</strong> de personas que ya existen en este evento. No se crean
            participantes ni se cambian números, roles, fotos o asignaciones.
          </li>
          <li>El texto se guarda tal cual (frases, comas, saltos de línea, tildes). Las celdas vacías no borran nada.</li>
          <li>Verás una vista previa y podrás elegir qué filas aplicar antes de guardar.</li>
        </ul>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) analyze(f, null);
            e.target.value = "";
          }}
        />
        <Button size="lg" onClick={() => inputRef.current?.click()} loading={pending && !preview} icon={<Upload className="size-5" aria-hidden />}>
          {file ? "Elegir otro archivo" : "Subir archivo .xlsx o .csv"}
        </Button>
        {file && (
          <p className="mt-3 flex items-center gap-2 text-sm text-white/70">
            <FileSpreadsheet className="size-4 text-gold-300" aria-hidden /> {file.name}
          </p>
        )}
      </Panel>

      {error && <Alert tone="danger">{error}</Alert>}

      {preview && file && (
        <Panel>
          {preview.headers.length > 0 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="wishes-column">Columna con las sugerencias de regalo</Label>
                <Select
                  id="wishes-column"
                  value={preview.columns.wishes ?? ""}
                  disabled={pending}
                  onChange={(e) => analyze(file, e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">— Elige una columna —</option>
                  {preview.headers.map((h) => (
                    <option key={h.index} value={h.index}>
                      {h.label}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-white/55">
                Nombre: <strong>{preview.columns.name !== undefined ? preview.headers[preview.columns.name]?.label : "no encontrado"}</strong>
                {" · "}Número: <strong>{preview.columns.identifier !== undefined ? preview.headers[preview.columns.identifier]?.label : "no encontrado"}</strong>
              </p>
            </div>
          )}

          {!preview.wishesColumnResolved && (
            <Alert tone="warning" className="mb-4" title="No reconocimos la columna de sugerencias">
              Elige arriba cuál columna contiene las opciones de regalo.
            </Alert>
          )}
          {preview.fileErrors.length > 0 && (
            <Alert tone="danger" className="mb-4" title="El archivo no tiene el formato esperado">
              <ul className="list-inside list-disc">
                {preview.fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}

          {s && preview.rows.length > 0 && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Resumen">
                <Badge tone="neutral">{s.total} filas</Badge>
                <Badge tone="success">{s.found} encontrados</Badge>
                {s.notFound > 0 && <Badge tone="danger">{s.notFound} sin coincidencia</Badge>}
                {s.conflicts > 0 && <Badge tone="danger">{s.conflicts} con conflicto</Badge>}
                {s.review > 0 && <Badge tone="warning">{s.review} por revisar</Badge>}
                <Badge tone="gold">{s.withWishes} con sugerencias</Badge>
                <Badge tone="info">{s.withoutWishes} sin sugerencias</Badge>
                {s.unchanged > 0 && <Badge tone="neutral">{s.unchanged} sin cambios</Badge>}
              </div>
              {(s.conflicts > 0 || s.notFound > 0) && (
                <Alert tone="warning" className="mb-4" title="Algunas filas no se aplicarán">
                  Las filas sin coincidencia o con conflicto (por ejemplo, el número no corresponde al nombre) nunca se
                  actualizan. Corrígelas en el Excel o edítalas a mano desde Participantes.
                </Alert>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Label htmlFor="wishes-filter" className="mb-0">
                  Ver
                </Label>
                <Select id="wishes-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-10 w-auto">
                  <option value="all">Todas ({preview.rows.length})</option>
                  {(Object.keys(STATUS_INFO) as WishRowStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_INFO[st].label} ({preview.rows.filter((r) => r.status === st).length})
                    </option>
                  ))}
                </Select>
              </div>

              <ul className="max-h-[36rem] space-y-2 overflow-auto pr-1">
                {visible.map((r) => {
                  const selectable = r.status === "UPDATE" || r.status === "REVIEW";
                  const info = STATUS_INFO[r.status];
                  return (
                    <li
                      key={r.row}
                      className={`rounded-2xl border p-3 ${
                        r.status === "CONFLICT" || r.status === "NOT_FOUND"
                          ? "border-berry-300/25 bg-berry-700/10"
                          : r.status === "REVIEW"
                            ? "border-gold-300/30 bg-gold-500/5"
                            : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Aplicar fila ${r.row}`}
                          className="mt-1 size-5 accent-[var(--color-gold-500)]"
                          checked={selectable && selected.has(r.row)}
                          disabled={!selectable || pending}
                          onChange={() => toggle(r.row)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-white/45">Fila {r.row}</span>
                            <Badge tone={info.tone}>{info.label}</Badge>
                            <span className="font-semibold">
                              {r.participantName ?? (r.fileName || "—")}
                              {r.participantIdentifier && <span className="ml-1 font-mono text-white/60">#{r.participantIdentifier}</span>}
                            </span>
                            {r.participantName && (r.fileName || r.fileIdentifier) && (
                              <span className="text-xs text-white/50">
                                (archivo: {r.fileName || "sin nombre"}
                                {r.fileIdentifier && ` · ${r.fileIdentifier}`})
                              </span>
                            )}
                            {!r.participantName && r.fileIdentifier && <span className="font-mono text-xs text-white/50">#{r.fileIdentifier}</span>}
                          </div>
                          {r.messages.map((m) => (
                            <p key={m} className={`mt-1 text-xs ${r.status === "CONFLICT" || r.status === "NOT_FOUND" ? "text-berry-300" : "text-gold-300"}`}>
                              {m}
                            </p>
                          ))}
                          {r.participantId && (r.next !== null || r.current !== null) && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-pine-950/50 p-2">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/45">Actual</p>
                                <WishText value={r.current} empty="Sin sugerencias" />
                              </div>
                              <div className="rounded-xl bg-pine-950/50 p-2">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/45">
                                  {r.status === "EMPTY" ? "Archivo (vacío → se conserva lo actual)" : "Nuevo"}
                                </p>
                                <WishText value={r.next} empty="Celda vacía" />
                              </div>
                            </div>
                          )}
                          {!r.participantId && r.next && (
                            <div className="mt-2 rounded-xl bg-pine-950/50 p-2">
                              <WishText value={r.next} empty="" />
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Link href="/admin/participantes" className="inline-flex h-11 items-center justify-center rounded-xl px-4 font-bold hover:bg-white/10">
                  Cancelar
                </Link>
                <Button onClick={() => setConfirming(true)} disabled={chosen.length === 0 || pending}>
                  🎁 Actualizar {chosen.length} sugerencia(s)
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={apply}
        loading={pending}
        title="Confirmar actualización"
        confirmLabel="Sí, actualizar"
        description={
          <>
            Se reemplazarán las sugerencias de regalo de <strong>{chosen.length}</strong> participante(s). No se crea ni se
            elimina a nadie y el sorteo no cambia.
          </>
        }
      />
    </div>
  );
}
