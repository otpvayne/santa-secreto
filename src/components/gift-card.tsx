"use client";

import { Lock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

const WRAPS = [
  "from-berry-500 to-berry-800",
  "from-pine-500 to-pine-800",
  "from-berry-600 to-berry-800",
  "from-gold-500 to-gold-700",
];

export type GiftCardState = "available" | "selected" | "taken" | "disabled";

/** Tarjeta con forma de regalo navideño. El número es solo de la tarjeta (no de una persona). */
export function GiftCard({
  label,
  index,
  state,
  onSelect,
}: {
  label: string;
  index: number;
  state: GiftCardState;
  onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  const wrap = WRAPS[index % WRAPS.length];
  const taken = state === "taken";
  const selected = state === "selected";
  const disabled = state === "taken" || state === "disabled";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={taken ? `Tarjeta ${label}, ocupada` : `Tarjeta ${label}${selected ? ", seleccionada" : ""}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: selected ? 1.06 : 1 }}
      transition={{ delay: reduced ? 0 : Math.min(index * 0.012, 0.5), type: "spring", stiffness: 260, damping: 20 }}
      whileHover={disabled || reduced ? undefined : { y: -4, rotate: index % 2 ? 1.5 : -1.5 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      className={cn(
        "group relative aspect-square w-full touch-manipulation rounded-2xl outline-none",
        "focus-visible:ring-4 focus-visible:ring-gold-300",
        disabled && "cursor-not-allowed",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br shadow-[0_10px_20px_-8px_rgb(0_0_0/0.6)] transition",
          wrap,
          selected && "shadow-[var(--shadow-glow)] ring-4 ring-gold-300",
          taken && "grayscale opacity-35",
          state === "disabled" && "opacity-60",
          state === "available" && "group-hover:shadow-[var(--shadow-glow)]",
        )}
      >
        {/* patrón del papel */}
        <div aria-hidden className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_25%_25%,white_0_2px,transparent_3px)_0_0/18px_18px]" />
        {/* cintas */}
        <div aria-hidden className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2 bg-gradient-to-b from-gold-300 to-gold-500" />
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-[16%] -translate-y-1/2 bg-gradient-to-r from-gold-300 to-gold-500" />
      </div>
      {/* moño */}
      <span aria-hidden className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl drop-shadow sm:text-3xl">
        🎀
      </span>
      {/* etiqueta con el número */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 flex size-[48%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
          "bg-snow font-display text-xl font-black text-berry-700 shadow-inner ring-2 ring-gold-500 sm:text-2xl",
          selected && "bg-gold-100",
        )}
      >
        {taken ? <Lock className="size-5 text-ink-soft" aria-hidden /> : label}
      </span>
    </motion.button>
  );
}
