import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl p-5 shadow-[var(--shadow-soft)] sm:p-6", className)} {...props} />;
}

export function PaperCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl bg-snow p-5 text-ink shadow-[var(--shadow-soft)] sm:p-6", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "gold" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-white/10 text-snow border-white/15",
  success: "bg-pine-500/25 text-pine-300 border-pine-300/30",
  warning: "bg-gold-500/20 text-gold-300 border-gold-300/30",
  danger: "bg-berry-600/25 text-berry-300 border-berry-300/30",
  gold: "bg-gold-300 text-pine-950 border-gold-100",
  info: "bg-sky-500/15 text-sky-200 border-sky-300/25",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progreso"}
        className="h-4 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10"
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-berry-500),var(--color-gold-400),var(--color-pine-300))] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-bold text-gold-100", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-xl border border-white/15 bg-pine-950/60 px-4 text-base text-snow placeholder:text-white/40 " +
  "transition focus:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/40 disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-24 py-3", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "h-12 appearance-auto", className)} {...props} />;
}

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-sky-300/25 bg-sky-500/10 text-sky-100",
    warning: "border-gold-300/40 bg-gold-500/10 text-gold-100",
    danger: "border-berry-300/40 bg-berry-700/25 text-berry-300",
    success: "border-pine-300/30 bg-pine-500/15 text-pine-300",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border p-4", tones[tone], className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="mb-0.5 font-bold text-snow">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "gold",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: "gold" | "berry" | "pine";
}) {
  const accents = { gold: "text-gold-300", berry: "text-berry-300", pine: "text-pine-300" };
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-white/70">
        <span>{label}</span>
        {icon && <span className={accents[accent]}>{icon}</span>}
      </div>
      <p className={cn("mt-1 font-display text-3xl font-bold tabular-nums sm:text-4xl", accents[accent])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/55">{hint}</p>}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold text-snow sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-white/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
