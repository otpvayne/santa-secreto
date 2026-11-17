"use client";

import { CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Panel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ImportPreview } from "@/server/import/spreadsheet";
import { confirmImportAction, previewImportAction } from "../actions";

export function ImportWizard() {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const analyze = (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const res = await previewImportAction(fd);
      if (res.ok) setPreview(res.data);
      else setError(res.message);
    });
  };

  const doImport = () => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await confirmImportAction(fd);
      setConfirming(false);
      if (res.ok) {
        toast(`Se importaron ${res.data.imported} participantes.`, "success");
        router.push("/admin/participantes");
      } else setError(res.message);
    });
  };

  const canImport = !!preview && preview.fileErrors.length === 0 && preview.errorCount === 0 && preview.rows.length > 0;

  return (
    <div className="space-y-5">
      <Panel>
        <ol className="mb-5 list-inside list-decimal space-y-1 text-sm text-white/75">
          <li>
            Descarga la{" "}
            <a className="font-bold text-gold-300 underline" href="/api/admin/plantilla?formato=xlsx">
              plantilla de Excel
            </a>{" "}
            (o en{" "}
            <a className="underline" href="/api/admin/plantilla?formato=csv">
              CSV
            </a>
            ).
          </li>
          <li>
            Llena las columnas <code className="text-gold-300">nombre_completo</code>,{" "}
            <code className="text-gold-300">numero_identificador</code> y <code className="text-gold-300">rol</code>{" "}
            (PARTICIPANT u ORGANIZER).
          </li>
          <li>Sube el archivo: revisaremos cada fila antes de guardar nada.</li>
        </ol>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) analyze(f);
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

      {preview && (
        <Panel>
          {preview.fileErrors.length > 0 ? (
            <Alert tone="danger" title="El archivo no tiene el formato esperado">
              <ul className="list-inside list-disc">
                {preview.fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone="success">{preview.validCount} válidas</Badge>
                {preview.errorCount > 0 && <Badge tone="danger">{preview.errorCount} con errores</Badge>}
                <span className="text-sm text-white/60">{preview.rows.length} filas en total</span>
              </div>
              {preview.errorCount > 0 && (
                <Alert tone="warning" className="mb-4" title="Corrige los errores antes de importar">
                  Para evitar importaciones a medias, no se guardará ninguna fila hasta que todas sean válidas.
                </Alert>
              )}
              <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-pine-900 text-xs uppercase tracking-wider text-white/55">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Número</th>
                      <th className="px-3 py-2">Rol</th>
                      <th className="px-3 py-2">Revisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className={r.errors.length ? "bg-berry-700/15" : ""}>
                        <td className="px-3 py-2 text-white/50">{r.row}</td>
                        <td className="px-3 py-2 font-semibold">{r.fullName || "—"}</td>
                        <td className="px-3 py-2 font-mono">{r.identifier || "—"}</td>
                        <td className="px-3 py-2">{r.role === "ORGANIZER" ? "Organizador" : "Participante"}</td>
                        <td className="px-3 py-2">
                          {r.errors.length === 0 && r.warnings.length === 0 && (
                            <CheckCircle2 className="size-4 text-pine-300" aria-label="Correcta" />
                          )}
                          {r.errors.map((e) => (
                            <p key={e} className="text-berry-300">
                              {e}
                            </p>
                          ))}
                          {r.warnings.map((w) => (
                            <p key={w} className="flex items-start gap-1 text-gold-300">
                              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Link href="/admin/participantes" className="inline-flex h-11 items-center justify-center rounded-xl px-4 font-bold hover:bg-white/10">
                  Cancelar
                </Link>
                <Button onClick={() => setConfirming(true)} disabled={!canImport}>
                  Importar {preview.validCount} participantes
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doImport}
        loading={pending}
        title="Confirmar importación"
        confirmLabel="Sí, importar"
        description={
          <>
            Se agregarán <strong>{preview?.validCount}</strong> participantes al evento. Podrás cargar las fotografías
            después, una por una.
          </>
        }
      />
    </div>
  );
}
