"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Input, Label, Textarea } from "./primitives";

/** Diálogo modal accesible basado en <dialog> (foco atrapado y Esc para cerrar). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto w-[min(100%-2rem,32rem)] rounded-3xl border border-white/10 bg-pine-900 p-0 text-snow shadow-2xl",
        className,
      )}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-display text-2xl font-bold">
              {title}
            </h2>
            <button onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmación explícita. Para acciones peligrosas puede exigir escribir una palabra
 * (p. ej. REINICIAR) y/o un motivo, para evitar accidentes.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "primary",
  requireWord,
  requireReason = false,
  reasonLabel = "Motivo",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "gold";
  requireWord?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
}) {
  // El contenido solo se monta mientras el diálogo está abierto, así los campos empiezan vacíos cada vez.
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <ConfirmBody
        onClose={onClose}
        onConfirm={onConfirm}
        description={description}
        confirmLabel={confirmLabel}
        tone={tone}
        requireWord={requireWord}
        requireReason={requireReason}
        reasonLabel={reasonLabel}
        loading={loading}
      />
    </Dialog>
  );
}

function ConfirmBody({
  onClose,
  onConfirm,
  description,
  confirmLabel,
  tone,
  requireWord,
  requireReason,
  reasonLabel,
  loading,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
  description: ReactNode;
  confirmLabel: string;
  tone: "primary" | "danger" | "gold";
  requireWord?: string;
  requireReason: boolean;
  reasonLabel: string;
  loading: boolean;
}) {
  const [word, setWord] = useState("");
  const [reason, setReason] = useState("");
  const wordId = useId();
  const reasonId = useId();
  const wordOk = !requireWord || word.trim().toUpperCase() === requireWord.toUpperCase();
  const reasonOk = !requireReason || reason.trim().length >= 3;

  return (
    <>
      <div className="space-y-4 text-white/85">
        <div className="leading-relaxed">{description}</div>
        {requireReason && (
          <div>
            <Label htmlFor={reasonId}>{reasonLabel}</Label>
            <Textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}
        {requireWord && (
          <div>
            <Label htmlFor={wordId}>
              Para confirmar escribe <span className="font-mono text-gold-300">{requireWord}</span>
            </Label>
            <Input id={wordId} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : tone}
            onClick={() => onConfirm(reason.trim())}
            disabled={!wordOk || !reasonOk}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
