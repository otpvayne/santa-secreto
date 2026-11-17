"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const PALETTES = [
  "from-berry-500 to-berry-800",
  "from-pine-500 to-pine-800",
  "from-gold-400 to-gold-700",
  "from-berry-600 to-pine-700",
  "from-pine-600 to-gold-700",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Fotografía de un participante con alternativa de iniciales cuando no hay selfie. */
export function Avatar({
  name,
  src,
  size = 56,
  className,
  ring = true,
}: {
  name: string;
  src: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        ring && "ring-2 ring-gold-300/70 ring-offset-2 ring-offset-pine-900",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- imágenes privadas servidas por /api/fotos con autorización
        <img
          src={src}
          alt={`Foto de ${name}`}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={`Iniciales de ${name}`}
          className={cn(
            "flex size-full items-center justify-center bg-gradient-to-br font-display font-bold text-white",
            PALETTES[hash(name) % PALETTES.length],
          )}
          style={{ fontSize: Math.max(12, size * 0.36) }}
        >
          {initials(name) || "🎁"}
        </div>
      )}
    </div>
  );
}
