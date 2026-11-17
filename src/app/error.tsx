"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error inesperado (p. ej. base de datos no disponible). Nunca muestra detalles técnicos. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl" aria-hidden>
        🦌
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold">¡Uy! Los renos se enredaron</h1>
      <p className="mt-2 max-w-md text-white/70">
        No pudimos cargar esta pantalla. Puede ser un problema de conexión. Revisa tu internet e inténtalo de nuevo.
      </p>
      <Button className="mt-6" onClick={reset} icon={<RefreshCw className="size-4" aria-hidden />}>
        Intentar de nuevo
      </Button>
      {error.digest && <p className="mt-4 text-xs text-white/35">Código: {error.digest}</p>}
    </main>
  );
}
