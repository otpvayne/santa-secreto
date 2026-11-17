"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

/** Nieve ligera hecha con CSS (se desactiva con "movimiento reducido"). */
export function Snowfall({ count = 18 }: { count?: number }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 97) % 100,
        delay: -((i * 1.7) % 14),
        duration: 10 + ((i * 3.3) % 10),
        size: 8 + ((i * 5) % 10),
        drift: ((i % 5) - 2) * 18,
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={
            {
              left: `${f.left}%`,
              fontSize: f.size,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--drift": `${f.drift}px`,
            } as React.CSSProperties
          }
        >
          ❄
        </span>
      ))}
    </div>
  );
}

const CONFETTI_COLORS = ["#dc2a42", "#f1d38a", "#d4a64a", "#7fc4a2", "#ffffff", "#c0162f"];

/**
 * Confeti en canvas. Liviano para celulares (pocas partículas, se detiene solo)
 * y desactivado si el usuario prefiere movimiento reducido.
 */
export function Confetti({ fire, pieces = 140, duration = 4500 }: { fire: unknown; pieces?: number; duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!fire || reduced) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => canvas.width;
    const h = () => canvas.height;
    const parts = Array.from({ length: pieces }, () => ({
      x: w() / 2 + (Math.random() - 0.5) * w() * 0.3,
      y: h() * 0.35,
      vx: (Math.random() - 0.5) * 18 * dpr,
      vy: (-Math.random() * 16 - 6) * dpr,
      size: (6 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w(), h());
      const fade = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < duration) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w(), h());
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [fire, reduced, pieces, duration]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}

/** Guirnalda de luces decorativa. */
export function Lights({ count = 14, className = "" }: { count?: number; className?: string }) {
  const colors = ["bg-berry-500", "bg-gold-300", "bg-pine-300", "bg-white"];
  return (
    <div aria-hidden className={`flex items-center justify-center gap-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`block size-2.5 rounded-full ${colors[i % colors.length]} animate-twinkle shadow-[0_0_12px_currentColor]`}
          style={{ animationDelay: `${(i % 7) * 0.3}s` }}
        />
      ))}
    </div>
  );
}
