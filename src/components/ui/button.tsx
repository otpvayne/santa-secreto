"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "gold" | "ghost" | "outline" | "danger" | "pine";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-berry-500 to-berry-700 text-white shadow-[0_8px_24px_-8px_rgb(220_42_66/0.7)] hover:from-berry-500 hover:to-berry-600 border border-berry-300/30",
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-pine-950 shadow-[0_8px_24px_-8px_rgb(212_166_74/0.7)] hover:from-gold-300 hover:to-gold-400 border border-gold-100/50",
  pine: "bg-pine-600 text-white hover:bg-pine-500 border border-pine-300/20",
  ghost: "bg-transparent text-snow hover:bg-white/10",
  outline: "bg-white/5 text-snow border border-white/20 hover:bg-white/10 hover:border-white/30",
  danger: "bg-berry-800/80 text-white border border-berry-500/50 hover:bg-berry-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-4 text-base gap-2 rounded-xl",
  lg: "h-13 px-6 text-lg gap-2 rounded-2xl",
  xl: "h-16 px-8 text-xl gap-3 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center font-bold tracking-wide transition-all duration-200",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-[1.1em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
