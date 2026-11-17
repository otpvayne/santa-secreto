import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Snowfall, Lights } from "@/components/festive";
import { Alert } from "@/components/ui/primitives";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { listLoginNames } from "@/server/services/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const session = await getCurrentSession();
  if (session) redirect("/inicio");
  const { motivo } = await searchParams;
  const { event, names } = await listLoginNames(await getDb());

  return (
    <main className="festive-pattern relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Snowfall />
      <div className="relative z-10 w-full max-w-md">
        <Lights className="mb-6" />
        <div className="mb-8 text-center">
          <p className="mb-3 text-6xl" aria-hidden>
            🎄
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
            Bienvenido a nuestro <span className="text-gold-gradient animate-shimmer">Santa Secreto</span>
          </h1>
          <p className="mt-3 text-lg text-white/75">Identifícate para descubrir la magia de esta Navidad</p>
          {event && (
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-gold-300/80">
              {event.name} · {event.year}
            </p>
          )}
        </div>

        <div className="glass rounded-3xl p-5 shadow-[var(--shadow-soft)] sm:p-7">
          {motivo === "expirada" && (
            <Alert tone="warning" className="mb-5">
              Tu sesión terminó. Vuelve a identificarte para continuar.
            </Alert>
          )}
          {!event ? (
            <Alert tone="info" title="Aún no hay un evento disponible">
              Los organizadores todavía están preparando el Santa Secreto. ¡Vuelve pronto!
            </Alert>
          ) : names.length === 0 ? (
            <Alert tone="info" title="La lista está vacía">
              Todavía no hay participantes registrados. Habla con un organizador.
            </Alert>
          ) : (
            <LoginForm names={names} />
          )}
        </div>
        <p className="mt-6 text-center text-xs text-white/45">
          ¿No apareces en la lista o no recuerdas tu número? Pregúntale a un organizador.
        </p>
      </div>
    </main>
  );
}
