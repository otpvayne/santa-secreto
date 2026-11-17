"use client";

import { Camera, Pencil, Trash2, Upload, UserPlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { ParticipantTable, type TableParticipant } from "@/components/participant-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { GIFT_WISHES_MAX } from "@/domain/gift-wishes";
import { useToast } from "@/components/ui/toast";
import { compressImage } from "@/lib/compress-image";
import {
  createParticipantAction,
  deleteParticipantAction,
  removePhotoAction,
  updateParticipantAction,
  uploadPhotoAction,
} from "./actions";

type Editing = { mode: "create" } | { mode: "edit"; row: TableParticipant } | null;

export function ParticipantsManager({
  rows,
  locked,
  archived,
  drawExists,
  myId,
}: {
  rows: TableParticipant[];
  locked: boolean;
  archived: boolean;
  drawExists: boolean;
  myId: string;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [photoFor, setPhotoFor] = useState<TableParticipant | null>(null);
  const [deleting, setDeleting] = useState<TableParticipant | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteParticipantAction(deleting.id);
      if (res.ok) {
        toast(`${deleting.fullName} fue eliminado.`, "success");
        setDeleting(null);
      } else toast(res.message, "error");
    });
  };

  return (
    <>
      {!archived && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => setEditing({ mode: "create" })} disabled={locked} icon={<UserPlus className="size-5" aria-hidden />}>
            Agregar participante
          </Button>
        </div>
      )}

      <ParticipantTable
        rows={rows}
        drawExists={drawExists}
        actions={
          archived
            ? undefined
            : (r) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "edit", row: r })} icon={<Pencil className="size-4" aria-hidden />}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPhotoFor(r)} icon={<Camera className="size-4" aria-hidden />}>
                    Foto
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleting(r)}
                    disabled={locked || r.id === myId}
                    title={locked ? "No se puede eliminar después de generar el sorteo" : r.id === myId ? "No puedes eliminarte a ti mismo" : undefined}
                    icon={<Trash2 className="size-4" aria-hidden />}
                  >
                    <span className="sr-only md:not-sr-only">Eliminar</span>
                  </Button>
                </>
              )
        }
      />

      <ParticipantFormDialog editing={editing} locked={locked} onClose={() => setEditing(null)} />
      <PhotoDialog row={photoFor} onClose={() => setPhotoFor(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        tone="danger"
        title="Eliminar participante"
        confirmLabel="Eliminar"
        description={
          <>
            ¿Seguro que quieres eliminar a <strong>{deleting?.fullName}</strong>? También se borrará su fotografía. Esta
            acción no se puede deshacer.
          </>
        }
      />
    </>
  );
}

function ParticipantFormDialog({ editing, locked, onClose }: { editing: Editing; locked: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const row = editing?.mode === "edit" ? editing.row : null;
  const key = editing ? (row?.id ?? "new") : "closed";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      fullName: String(fd.get("fullName") ?? ""),
      identifier: String(fd.get("identifier") ?? ""),
      role: String(fd.get("role") ?? "PARTICIPANT"),
      isActive: fd.get("isActive") === "on",
      // Se envía siempre: dejar el campo vacío y guardar borra las sugerencias de forma explícita.
      giftWishes: String(fd.get("giftWishes") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const res = row
        ? await updateParticipantAction({
            id: row.id,
            fullName: payload.fullName,
            role: payload.role,
            giftWishes: payload.giftWishes,
            ...(locked ? {} : { identifier: payload.identifier, isActive: payload.isActive }),
          })
        : await createParticipantAction(payload);
      if (res.ok) {
        toast(row ? "Cambios guardados." : `${payload.fullName.trim()} fue agregado.`, "success");
        onClose();
      } else setError(res.message);
    });
  };

  return (
    <Dialog open={!!editing} onClose={onClose} title={row ? "Editar participante" : "Nuevo participante"}>
      <form key={key} onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="p-name">Nombre completo</Label>
          <Input id="p-name" name="fullName" defaultValue={row?.fullName ?? ""} required maxLength={120} autoComplete="off" />
          <p className="mt-1 text-xs text-white/55">Así lo buscará la persona para ingresar.</p>
        </div>
        <div>
          <Label htmlFor="p-id">Número identificador</Label>
          <Input
            id="p-id"
            name="identifier"
            inputMode="numeric"
            defaultValue={row?.identifier ?? ""}
            required
            maxLength={6}
            disabled={locked}
            className="font-mono tracking-widest"
          />
          {locked && <p className="mt-1 text-xs text-gold-300">Bloqueado: el sorteo ya fue generado.</p>}
        </div>
        <div>
          <Label htmlFor="p-role">Rol</Label>
          <Select id="p-role" name="role" defaultValue={row?.role ?? "PARTICIPANT"}>
            <option value="PARTICIPANT">Participante</option>
            <option value="ORGANIZER">Organizador (también participa)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="p-wishes">🎁 Opciones de regalo</Label>
          <Textarea
            id="p-wishes"
            name="giftWishes"
            defaultValue={row?.giftWishes ?? ""}
            maxLength={GIFT_WISHES_MAX}
            rows={4}
            placeholder="Ejemplo: Una camiseta talla M, algo relacionado con fútbol, una billetera o cualquier detalle que me sorprenda..."
            className="resize-y"
          />
          <p className="mt-1 text-xs text-white/55">
            Texto libre: se muestra tal cual a su amigo secreto, con los mismos saltos de línea. Déjalo vacío para no
            mostrar sugerencias. Puedes corregirlo en cualquier momento, incluso con el sorteo en curso: no afecta las
            asignaciones.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={row?.isActive ?? true}
            disabled={locked}
            className="size-5 accent-[var(--color-gold-500)]"
          />
          Participa en el sorteo (activo)
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {row ? "Guardar cambios" : "Agregar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PhotoDialog({ row, onClose }: { row: TableParticipant | null; onClose: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setError(null);
    onClose();
  };

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setError("Usa una foto JPG, PNG o WebP.");
      return;
    }
    const compressed = await compressImage(f);
    if (compressed.size > 4 * 1024 * 1024) {
      setError("La foto es demasiado grande (máximo 4 MB).");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(compressed));
    setFile(compressed);
  };

  const upload = () => {
    if (!row || !file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("participantId", row.id);
      fd.set("file", file, "foto.jpg");
      const res = await uploadPhotoAction(fd);
      if (res.ok) {
        toast("Fotografía guardada.", "success");
        close();
      } else setError(res.message);
    });
  };

  const remove = () => {
    if (!row) return;
    startTransition(async () => {
      const res = await removePhotoAction(row.id);
      if (res.ok) {
        toast("Fotografía eliminada.", "success");
        close();
      } else setError(res.message);
    });
  };

  return (
    <Dialog open={!!row} onClose={close} title={`Foto de ${row?.fullName ?? ""}`}>
      {row && (
        <div className="space-y-4">
          <div className="flex justify-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={preview} alt="Vista previa" className="size-44 rounded-full object-cover ring-4 ring-gold-300" />
            ) : (
              <Avatar name={row.fullName} src={row.photoUrl} size={176} />
            )}
          </div>
          <p className="text-center text-sm text-white/65">
            Selfie de la persona. Se recorta en círculo, se optimiza y se le quitan los datos de ubicación (EXIF).
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => inputRef.current?.click()} icon={<Upload className="size-4" aria-hidden />}>
              {row.photoUrl || preview ? "Elegir otra foto" : "Elegir foto"}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {row.photoUrl && !preview && (
                <Button variant="danger" onClick={remove} loading={pending} icon={<Trash2 className="size-4" aria-hidden />}>
                  Quitar foto
                </Button>
              )}
              {preview && (
                <Button onClick={upload} loading={pending}>
                  Guardar foto
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
