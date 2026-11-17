import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireOrganizerPage } from "@/server/auth/session";
import { photoUrl } from "@/server/types";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Admin · Santa Secreto" } };

/**
 * Todas las rutas /admin exigen un ORGANIZADOR activo (verificado en el servidor en cada petición).
 * Cada página y cada acción vuelve a verificarlo: el layout no es la única barrera.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireOrganizerPage();
  const me = session.participant;
  return (
    <>
      <AppHeader
        name={me.fullName}
        photoUrl={photoUrl(me.id, me.hasPhoto, me.photoVersion)}
        isOrganizer
        showAdminLink={false}
        eventName={session.event.name}
      />
      <AdminNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">{children}</main>
    </>
  );
}
