import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lights } from "@/components/festive";
import { getPresentationSession } from "@/server/auth/session";
import { TvForm } from "./tv-form";

export const metadata: Metadata = { title: "Conectar pantalla" };

export default async function TvPage({ searchParams }: PageProps<"/tv">) {
  if (await getPresentationSession()) redirect("/presentacion");
  const { codigo } = await searchParams;
  const initial = typeof codigo === "string" ? codigo.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
  return (
    <main className="festive-pattern flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center">
        <Lights className="mb-6" />
        <p className="text-6xl" aria-hidden>
          📺
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">Pantalla de presentación</h1>
        <p className="mt-2 text-lg text-white/70">
          Escribe el código que aparece en el celular del organizador (Administración → Entrega).
        </p>
        <div className="glass mt-8 rounded-3xl p-6 text-left">
          <TvForm initialCode={initial} />
        </div>
      </div>
    </main>
  );
}
