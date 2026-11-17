import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, PageTitle } from "@/components/ui/primitives";
import { participantsEditable } from "@/domain/event-state";
import { requireOrganizerPage } from "@/server/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Importar participantes" };

export default async function ImportPage() {
  const session = await requireOrganizerPage();
  const editable = participantsEditable(session.event.status);
  return (
    <>
      <Link href="/admin/participantes" className="mb-4 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden /> Participantes
      </Link>
      <PageTitle title="Importar desde Excel" subtitle="Registra a toda la familia de una sola vez." />
      {editable ? (
        <ImportWizard />
      ) : (
        <Alert tone="warning" title="No disponible">
          El sorteo ya fue generado: no se pueden agregar participantes sin reiniciarlo.
        </Alert>
      )}
    </>
  );
}
