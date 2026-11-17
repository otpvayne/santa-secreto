import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, PageTitle } from "@/components/ui/primitives";
import { requireOrganizerPage } from "@/server/auth/session";
import { GiftWishesWizard } from "./gift-wishes-wizard";

export const metadata = { title: "Importar sugerencias de regalo" };

export default async function GiftWishesImportPage() {
  const session = await requireOrganizerPage();
  const archived = session.event.status === "ARCHIVED";
  return (
    <>
      <Link href="/admin/participantes" className="mb-4 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden /> Participantes
      </Link>
      <PageTitle
        title="🎁 Importar sugerencias de regalo"
        subtitle={`Actualiza las ideas de regalo de los participantes que ya existen en "${session.event.name}".`}
      />
      {archived ? (
        <Alert tone="info" title="Evento archivado">
          Este evento es histórico y no se puede modificar.
        </Alert>
      ) : (
        <GiftWishesWizard />
      )}
    </>
  );
}
